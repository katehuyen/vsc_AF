import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PricingEngine, Usage, emptyUsage, weightedTokens } from './pricing';
import { conversationTitle, SessionInfo } from './sessions';
import { SessionSource } from './sessionSource';
import { truncate } from './util';
import { ConsoleMessage, ConsoleSessionState } from './consoleproto';

/**
 * E3b — transcript adapters for external CLIs. Formats were taken from the
 * upstream sources (July 2026): openai/codex `codex-rs/protocol` (rollout
 * lines: session_meta / turn_context / event_msg token_count+user_message /
 * response_item) and google-gemini/gemini-cli session files under
 * `~/.gemini/tmp/<sha256(projectRoot)>/chats/` (JSON with `messages[]` or
 * JSONL records; token key aliases as parsed by ccusage). Formats drift —
 * every parser here is fail-soft: a line/file that doesn't match is skipped,
 * never an error. Costs use `agentFarm.pricing` rules; models without a rule
 * are honestly $0 and land in the unknown-models warning.
 */

const SCAN_DAYS = 90;
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_WALK_DEPTH = 6;

function listFiles(root: string, exts: string[], cutoffMs: number): string[] {
    const out: string[] = [];
    const walk = (dir: string, depth: number) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (depth < MAX_WALK_DEPTH) { walk(p, depth + 1); }
            } else if (exts.some(x => e.name.endsWith(x))) {
                try { if (fs.statSync(p).mtimeMs >= cutoffMs) { out.push(p); } } catch { /* gone */ }
            }
        }
    };
    walk(root, 0);
    return out;
}

function blankInfo(file: string, sessionId: string, source: string, mtime: number): SessionInfo {
    return {
        file, sessionId, isSidechain: false, source,
        title: `${source} session`, autoTitle: `${source} session`,
        firstTs: mtime, lastTs: mtime, mtime,
        models: [], usage: emptyUsage(), wTokens: 0, cost: 0,
        userTurns: 0, assistantMsgs: 0, toolCalls: 0, tools: {},
        skillCalls: {}, memoryReads: {}, filesEdited: {}, errors: 0,
        daily: {}, heat: new Array(168).fill(0), events: [], recentMsgs: [], turns: []
    };
}

/** Per-file parse cache so unchanged transcripts are not re-read on every scan. */
class FileCache {
    private byFile = new Map<string, { sig: string; info: SessionInfo | undefined }>();
    get(file: string, sig: string): { hit: boolean; info?: SessionInfo } {
        const c = this.byFile.get(file);
        return c && c.sig === sig ? { hit: true, info: c.info } : { hit: false };
    }
    set(file: string, sig: string, info: SessionInfo | undefined): void {
        this.byFile.set(file, { sig, info });
    }
    prune(seen: Set<string>): void {
        for (const key of this.byFile.keys()) {
            if (!seen.has(key)) { this.byFile.delete(key); }
        }
    }
}

function readCapped(file: string): string | undefined {
    try {
        if (fs.statSync(file).size > MAX_FILE_BYTES) { return undefined; }
        return fs.readFileSync(file, 'utf8');
    } catch { return undefined; }
}

function scanWithCache(
    id: string,
    roots: () => string[],
    exts: string[],
    parse: (file: string) => SessionInfo | undefined,
    cacheMs: number
): SessionSource {
    const cache = new FileCache();
    let lastScan = 0;
    let lastResult: SessionInfo[] = [];
    return {
        id,
        scan(): SessionInfo[] {
            const now = Date.now();
            if (now - lastScan < cacheMs) { return lastResult; }
            lastScan = now;
            const cutoff = now - SCAN_DAYS * 24 * 3600 * 1000;
            const out: SessionInfo[] = [];
            const seen = new Set<string>();
            for (const root of roots()) {
                if (!root) { continue; }
                for (const file of listFiles(root, exts, cutoff)) {
                    seen.add(file);
                    let sig = '';
                    try { const st = fs.statSync(file); sig = `${st.size}:${st.mtimeMs}`; } catch { continue; }
                    const cached = cache.get(file, sig);
                    if (cached.hit) {
                        if (cached.info) { out.push(cached.info); }
                        continue;
                    }
                    let info: SessionInfo | undefined;
                    try { info = parse(file); } catch { info = undefined; }
                    cache.set(file, sig, info);
                    if (info) { out.push(info); }
                }
            }
            cache.prune(seen);
            return lastResult = out;
        }
    };
}

// ---------------------------------------------------------------------------
// Codex — ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl (+ archived_sessions)
// ---------------------------------------------------------------------------

interface CodexTokenTotals {
    input_tokens?: number;
    cached_input_tokens?: number;
    cache_write_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
    total_tokens?: number;
}

interface CodexLine {
    timestamp?: string;
    type?: string;
    payload?: {
        // session_meta
        session_id?: string; id?: string; cwd?: string; cli_version?: string;
        // turn_context
        model?: string;
        // event_msg
        type?: string; message?: string;
        info?: {
            model?: string;
            total_token_usage?: CodexTokenTotals;
            /**
             * ‼️ THE OTHER HALF OF THE ANSWER, AND THE ONE NOBODY READ. Beside
             * the running total the same line carries the LAST request's usage —
             * which is what the context window actually held — and the size of
             * that window. Ignoring both left every Codex row with an empty ctx
             * cell in a column that is filled for Claude, which reads as "this
             * session used no context" rather than "we never looked".
             */
            last_token_usage?: CodexTokenTotals;
            model_context_window?: number;
        };
        // response_item function_call
        name?: string;
    };
}

const CODEX_PROMPT_PREFIX = '## My request for Codex:';

/**
 * One Codex token block in the four fields the rest of the extension bills in.
 *
 * ‼️ `reasoning_output_tokens` IS PART OF `output_tokens`, NOT A FIFTH BUCKET —
 * and this file used to add the two together. Measured on this machine's own
 * rollouts, twice, and the rollout states the identity itself:
 *
 *   input 20 766 + output   822 = total  21 588   (reasoning   211)
 *   input 32 705 304 + output 95 054 = total 32 800 358  (reasoning 31 839)
 *
 * `total_tokens` is `input + output` in both, so adding the reasoning charged
 * the private thinking twice — on every Codex row, in every table, in the token
 * column and again in the money derived from it.
 */
function codexTotalsToUsage(t: CodexTokenTotals): Usage {
    const input = t.input_tokens ?? 0;
    const cached = Math.min(t.cached_input_tokens ?? 0, input);
    return {
        input: Math.max(0, input - cached),
        output: t.output_tokens ?? 0,
        cacheWrite: t.cache_write_input_tokens ?? 0,
        cacheRead: cached
    };
}

/**
 * The words the person actually sent to Codex.
 *
 * Agent Farm prepends its project/environment envelopes to the first message
 * because Codex has no separate system-prompt channel. Those envelopes are
 * context, not dialogue: using the whole payload made a real `/goal …` session
 * look unnamed and made the viewer show pages of machinery as if the user had
 * typed it. Only the reserved harness tags are removed; ordinary XML remains
 * the user's text.
 */
export function codexUserText(value: string): string {
    let text = String(value ?? '');
    const envelope = /^\s*<(project-context|environment_context|recommended_plugins)>[\s\S]*?<\/\1>\s*/i;
    while (envelope.test(text)) { text = text.replace(envelope, ''); }
    const at = text.indexOf(CODEX_PROMPT_PREFIX);
    if (at >= 0) { text = text.slice(at + CODEX_PROMPT_PREFIX.length); }
    return text.trim();
}

/** The shared session-title judgment, with Codex's raw `/goal prose` spelling
 * restored to the command-block shape Claude records. */
export function codexPromptTitle(value: string): string {
    const text = codexUserText(value);
    const goal = /^\/goal\s+([\s\S]+)$/i.exec(text);
    return goal
        ? conversationTitle(`<command-name>/goal</command-name><command-args>${goal[1]}</command-args>`)
        : conversationTitle(text);
}

function parseCodexFile(file: string, resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine): SessionInfo | undefined {
    const raw = readCapped(file);
    if (!raw) { return undefined; }
    const info = blankInfo(file, path.basename(file, '.jsonl'), 'codex', fs.statSync(file).mtimeMs);
    let cumulative: CodexTokenTotals | undefined;
    // ‼️ What the window HELD at the end, as opposed to what the thread SPENT
    // over its life. Both are on the same line and only one of them is a
    // context figure — see `last_token_usage`.
    let lastRequest: CodexTokenTotals | undefined;
    let ctxWindow = 0;
    let lastModel = '';
    let firstTs = 0, lastTs = 0;
    const models = new Set<string>();

    /**
     * ‼️ THE TURNS PAGE COULD NOT SHOW A CODEX TURN — because nothing built one.
     *
     * `buildTurnRows` maps over `SessionInfo.turns`, which the Claude parse fills
     * and every foreign source left empty, so the page that unrolls the whole
     * farm one row per turn silently held one engine's turns. Widening it to the
     * external list would have added nothing: the rows were never there.
     *
     * A Codex rollout states every boundary the shape needs, and states them
     * plainly: `user_message` opens a turn and carries its label and time,
     * `token_count.last_token_usage` is that request's own spend AND the window
     * it ended holding, `response_item` function/custom calls are its tools,
     * `turn_context` names the model. So the turns are built from what the file
     * says, and the fields it cannot answer stay at their honest zero rather
     * than being interpolated from the session total.
     */
    const openTurn = (label: string, ts: number): void => {
        info.turns.push({
            n: info.turns.length + 1, label, ts,
            tokens: 0, wTokens: 0, cost: 0,
            apiCalls: 0, steps: 0, thinking: 0, ms: 0, endCtx: 0,
            tools: 0, errors: 0, models: []
        });
    };
    const turnNow = () => (info.turns.length ? info.turns[info.turns.length - 1] : undefined);

    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: CodexLine;
        try { line = JSON.parse(lineText) as CodexLine; } catch { continue; }
        const ts = line.timestamp ? Date.parse(line.timestamp) : NaN;
        if (!Number.isNaN(ts)) {
            if (!firstTs) { firstTs = ts; }
            lastTs = ts;
            // The turn runs to its last recorded line, exactly as on Claude.
            const open = turnNow();
            if (open && ts > open.ts) { open.ms = ts - open.ts; }
        }
        const p = line.payload;
        if (!p) { continue; }
        if (line.type === 'session_meta') {
            const sid = p.session_id ?? p.id;
            if (typeof sid === 'string' && sid) { info.sessionId = sid; }
            if (typeof p.cwd === 'string') { info.cwd = p.cwd; }
            if (typeof p.cli_version === 'string') { info.version = p.cli_version; }
        } else if (line.type === 'turn_context') {
            if (typeof p.model === 'string' && p.model) { models.add(p.model); lastModel = p.model; }
        } else if (line.type === 'event_msg') {
            if (p.type === 'user_message' && typeof p.message === 'string') {
                info.userTurns++;
                const named = codexPromptTitle(p.message);
                if (named && info.title === 'codex session') {
                    info.title = named; info.autoTitle = named;
                }
                openTurn(named || codexUserText(p.message).slice(0, 80),
                    Number.isNaN(ts) ? (lastTs || info.mtime) : ts);
            } else if (p.type === 'agent_message' && typeof p.message === 'string' && p.message.trim()) {
                info.assistantMsgs++;
                const open = turnNow();
                if (open) { open.steps++; }
            } else if (p.type === 'token_count' && p.info) {
                if (typeof p.info.model === 'string' && p.info.model) { models.add(p.info.model); lastModel = p.info.model; }
                // token_count totals are CUMULATIVE — the last one is the session total.
                if (p.info.total_token_usage) { cumulative = p.info.total_token_usage; }
                if (p.info.last_token_usage) { lastRequest = p.info.last_token_usage; }
                if (typeof p.info.model_context_window === 'number' && p.info.model_context_window > 0) {
                    ctxWindow = p.info.model_context_window;
                }
                // ‼️ The TURN's own figures come from `last_token_usage` — the
                // request that just finished — never from the running total. It
                // is emitted repeatedly within a turn, so the last one for the
                // turn wins rather than accumulating (the same repeat problem
                // the Claude side solves with `lastUsageKey`).
                const open = turnNow();
                if (open && p.info.last_token_usage) {
                    const u = codexTotalsToUsage(p.info.last_token_usage);
                    open.tokens = u.input + u.output + u.cacheWrite + u.cacheRead;
                    open.endCtx = open.tokens;
                    const m = (typeof p.info.model === 'string' && p.info.model) || lastModel;
                    if (m) {
                        if (!open.models.includes(m)) { open.models.push(m); }
                        open.cost = pricing().costFor(m, u, Number.isNaN(ts) ? undefined : ts);
                        open.wTokens = weightedTokens(m, u);
                    }
                    // One `token_count` closes one round trip to the model.
                    open.apiCalls = Math.max(1, open.apiCalls);
                }
            }
        } else if (line.type === 'response_item'
            && (p.type === 'function_call' || p.type === 'custom_tool_call')) {
            info.toolCalls++;
            const name = typeof p.name === 'string' && p.name ? p.name : 'tool';
            info.tools[name] = (info.tools[name] ?? 0) + 1;
            const open = turnNow();
            if (open) { open.tools++; open.steps++; }
        } else if (line.type === 'response_item' && p.type === 'reasoning') {
            const open = turnNow();
            if (open) { open.thinking++; open.steps++; }
        }
    }

    // A rollout with no usage and no prompts is noise (probe/empty session).
    if (!cumulative && info.userTurns === 0) { return undefined; }
    if (firstTs) { info.firstTs = firstTs; }
    if (lastTs) { info.lastTs = lastTs; }
    if (cumulative) {
        info.usage = codexTotalsToUsage(cumulative);
    }
    // ‼️ THE CTX CELL, FROM THE FIGURE THAT IS ACTUALLY A WINDOW. `contextAfter`
    // on the LAST request means the same thing here as it does on a Claude
    // transcript: prompt + cache + output of the latest round trip. Run on the
    // cumulative total instead it would print the thread's lifetime spend as
    // the size of the window — 32.8M against a 258k window on a measured
    // session, which is the reading the user reported.
    if (lastRequest) {
        const u = codexTotalsToUsage(lastRequest);
        const ctx = u.input + u.cacheRead + u.cacheWrite + u.output;
        if (ctx > 0) { info.lastCtxTokens = ctx; }
    }
    if (ctxWindow > 0) { info.ctxWindow = ctxWindow; }
    info.models = [...models];
    // Multi-model rollouts are rare; attribute the session's usage to the last
    // active model. No matching pricing rule → $0 + unknown-models warning.
    if (lastModel) { info.cost = pricing().costFor(lastModel, info.usage, info.lastTs); }
    const agent = resolveAgent(info.cwd);
    info.agentId = agent.agentId;
    info.agentName = agent.agentName;
    return info;
}

export function codexSessionsSource(
    codexHome: () => string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine,
    cacheMs = 60_000
): SessionSource {
    return scanWithCache(
        'codex',
        () => {
            const home = codexHome();
            return home ? [path.join(home, 'sessions'), path.join(home, 'archived_sessions')] : [];
        },
        ['.jsonl'],
        file => parseCodexFile(file, resolveAgent, pricing),
        cacheMs
    );
}

// ---------------------------------------------------------------------------
// Gemini — ~/.gemini/tmp/<sha256(projectRoot)>/chats/*.json|jsonl
// ---------------------------------------------------------------------------

function tokenAt(o: Record<string, unknown>, keys: string[]): number {
    for (const k of keys) {
        const v = o[k];
        if (typeof v === 'number' && Number.isFinite(v)) { return Math.max(0, Math.trunc(v)); }
    }
    return 0;
}

interface GeminiTokens { input: number; output: number; cached: number; thoughts: number; tool: number; }

function parseGeminiTokens(value: unknown): GeminiTokens | undefined {
    if (!value || typeof value !== 'object') { return undefined; }
    const t = value as Record<string, unknown>;
    return {
        input: tokenAt(t, ['input', 'prompt', 'input_tokens', 'prompt_tokens', 'promptTokenCount']),
        output: tokenAt(t, ['output', 'candidates', 'output_tokens', 'candidates_tokens', 'candidatesTokenCount']),
        cached: tokenAt(t, ['cached', 'cached_tokens', 'cachedContentTokenCount']),
        thoughts: tokenAt(t, ['thoughts', 'reasoning', 'thoughts_tokens', 'reasoning_tokens', 'thoughtsTokenCount']),
        tool: tokenAt(t, ['tool', 'tool_tokens', 'toolUsePromptTokenCount'])
    };
}

/** Gemini "thoughts" bill as output; cached overlap is moved out of input. */
function addGeminiUsage(usage: Usage, t: GeminiTokens): void {
    usage.input += Math.max(0, t.input - Math.min(t.input, t.cached)) + t.tool;
    usage.cacheRead += t.cached;
    usage.output += t.output + t.thoughts;
}

function userText(msg: Record<string, unknown>): string {
    for (const key of ['content', 'text', 'message', 'prompt']) {
        const v = msg[key];
        if (typeof v === 'string' && v.trim()) { return v; }
        if (Array.isArray(v)) {
            const part = v.find(x => x && typeof (x as { text?: unknown }).text === 'string');
            if (part) { return (part as { text: string }).text; }
        }
    }
    return '';
}

function parseGeminiFile(
    file: string,
    agentForHash: (hash: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine
): SessionInfo | undefined {
    const raw = readCapped(file);
    if (!raw?.trim()) { return undefined; }
    const mtime = fs.statSync(file).mtimeMs;
    const ext = path.extname(file);
    const info = blankInfo(file, path.basename(file, ext), 'gemini', mtime);
    const models = new Set<string>();
    let cost = 0;
    let currentModel = '';
    let sawUsage = false;
    let tsMin = Infinity, tsMax = -Infinity;

    const handleUser = (msg: Record<string, unknown>) => {
        info.userTurns++;
        const clean = userText(msg).replace(/\s+/g, ' ').trim();
        if (clean && !clean.startsWith('<') && info.title === 'gemini session') {
            info.title = truncate(clean, 80);
            info.autoTitle = info.title;
        }
    };
    const handleModelTurn = (msg: Record<string, unknown>, modelHint: string) => {
        const model = typeof msg['model'] === 'string' && msg['model'] ? msg['model'] as string : modelHint;
        const tokens = parseGeminiTokens(msg['tokens']);
        info.assistantMsgs++;
        if (!tokens) { return; }
        sawUsage = true;
        const turnUsage = emptyUsage();
        addGeminiUsage(turnUsage, tokens);
        addGeminiUsage(info.usage, tokens);
        if (model) {
            models.add(model);
            cost += pricing().costFor(model, turnUsage);
        }
    };
    const handleStats = (stats: unknown) => {
        const byModel = (stats as { models?: Record<string, { tokens?: unknown }> } | undefined)?.models;
        if (!byModel || typeof byModel !== 'object') { return; }
        for (const [model, data] of Object.entries(byModel)) {
            const tokens = parseGeminiTokens(data?.tokens);
            if (!tokens) { continue; }
            sawUsage = true;
            const u = emptyUsage();
            addGeminiUsage(u, tokens);
            addGeminiUsage(info.usage, tokens);
            models.add(model);
            cost += pricing().costFor(model, u);
        }
    };
    const handleRecord = (rec: Record<string, unknown>) => {
        const sid = rec['sessionId'] ?? rec['session_id'];
        if (typeof sid === 'string' && sid) { info.sessionId = sid; }
        if (typeof rec['model'] === 'string' && rec['model']) { currentModel = rec['model'] as string; }
        const type = rec['type'];
        if (type === 'user') { handleUser(rec); }
        else if (type === 'gemini') { handleModelTurn(rec, currentModel); }
        if (rec['stats']) { handleStats(rec['stats']); }
        else if (rec['result'] && typeof rec['result'] === 'object') {
            handleStats((rec['result'] as Record<string, unknown>)['stats']);
        }
        // B6: start-ish and end-ish keys are tracked separately so a session
        // with startTime + lastUpdated (and no per-message timestamps) still
        // gets its real recency instead of appearing as old as its start.
        const tsOf = (k: string) => typeof rec[k] === 'string' ? Date.parse(rec[k] as string) : NaN;
        const start = [tsOf('timestamp'), tsOf('created_at'), tsOf('startTime')].find(v => !Number.isNaN(v));
        const end = [tsOf('lastUpdated'), tsOf('timestamp'), tsOf('created_at')].find(v => !Number.isNaN(v));
        if (start !== undefined) { tsMin = Math.min(tsMin, start); tsMax = Math.max(tsMax, start); }
        if (end !== undefined) { tsMax = Math.max(tsMax, end); }
    };

    let doc: unknown;
    try { doc = JSON.parse(raw); } catch { doc = undefined; }
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
        const rec = doc as Record<string, unknown>;
        handleRecord(rec);
        if (Array.isArray(rec['messages'])) {
            for (const m of rec['messages']) {
                if (m && typeof m === 'object') { handleRecord(m as Record<string, unknown>); }
            }
        }
    } else {
        for (const lineText of raw.split('\n')) {
            if (!lineText.trim()) { continue; }
            try { handleRecord(JSON.parse(lineText) as Record<string, unknown>); } catch { /* skip */ }
        }
    }

    if (!sawUsage && info.userTurns === 0) { return undefined; }
    if (Number.isFinite(tsMin)) { info.firstTs = tsMin; }
    if (Number.isFinite(tsMax)) { info.lastTs = tsMax; }
    info.models = [...models];
    info.cost = cost;
    // The project folder in the path is sha256(projectRoot) — match it against
    // the agents' own directory hashes to assign the session.
    const hashSeg = file.split(/[\\/]/).find(seg => /^[0-9a-f]{64}$/i.test(seg));
    if (hashSeg) {
        const agent = agentForHash(hashSeg.toLowerCase());
        info.agentId = agent.agentId;
        info.agentName = agent.agentName;
    }
    return info;
}

export function geminiSessionsSource(
    geminiTmpDir: () => string,
    agentDirs: () => { id: string; name: string; dir: string }[],
    pricing: () => PricingEngine,
    cacheMs = 60_000
): SessionSource {
    let hashMap = new Map<string, { agentId: string; agentName: string }>();
    let hashedAt = 0;
    const agentForHash = (hash: string) => {
        const now = Date.now();
        if (now - hashedAt > 60_000) {
            hashedAt = now;
            hashMap = new Map();
            for (const a of agentDirs()) {
                // gemini hashes the absolute project root; slash direction, a
                // trailing separator and the Windows drive-letter case are the
                // usual variance across platforms/shells.
                const bases = [
                    a.dir,
                    a.dir.replace(/\\/g, '/'),
                    a.dir.replace(/\//g, '\\'),
                    a.dir.replace(/[\\/]+$/, '')
                ];
                const variants = new Set<string>();
                for (const b of bases) {
                    variants.add(b);
                    if (/^[a-z]:/i.test(b)) {
                        variants.add(b[0].toLowerCase() + b.slice(1));
                        variants.add(b[0].toUpperCase() + b.slice(1));
                    }
                }
                for (const v of variants) {
                    hashMap.set(crypto.createHash('sha256').update(v).digest('hex'),
                        { agentId: a.id, agentName: a.name });
                }
            }
        }
        return hashMap.get(hash) ?? {};
    };
    return scanWithCache(
        'gemini',
        () => { const d = geminiTmpDir(); return d ? [d] : []; },
        ['.json', '.jsonl'],
        file => parseGeminiFile(file, agentForHash, pricing),
        cacheMs
    );
}

// ---------------------------------------------------------------------------
// Agent Farm-owned external Console transcripts
// ---------------------------------------------------------------------------

/**
 * Antigravity's historical conversation DB stores protobuf payloads without a
 * schema the CLI exposes, and the CLI has no export/read subcommand. While a
 * conversation is hosted here, however, Agent Farm already has its normalized
 * dialogue and tool rows. Persist that open shape instead of throwing it away
 * when VS Code closes. This is deliberately a plain versioned JSON document:
 * it remains inspectable even if the engine's private store changes again.
 */
export interface FarmConsoleTranscript {
    format: 'agent-farm-console-v1';
    engine: 'agy';
    sessionId: string;
    agentId: string;
    agentName: string;
    cwd: string;
    model: string;
    effort: string;
    permissionMode: string;
    startedAt: number;
    lastTs: number;
    cost: number;
    tokens: number;
    wTokens: number;
    turns: number;
    contextTokens: number;
    messages: ConsoleMessage[];
}

export function farmConsoleTranscript(state: ConsoleSessionState): FarmConsoleTranscript | undefined {
    if (state.engine !== 'agy' || !state.sessionId) { return undefined; }
    return {
        format: 'agent-farm-console-v1', engine: 'agy', sessionId: state.sessionId,
        agentId: state.agentId, agentName: state.agentName, cwd: state.cwd,
        model: state.model ?? '', effort: state.effort ?? '',
        permissionMode: state.permissionMode, startedAt: state.startedAt,
        lastTs: state.lastTs || state.startedAt, cost: state.costUSD,
        tokens: state.tokens, wTokens: state.wTokens, turns: state.turns,
        contextTokens: state.contextTokens ?? 0, messages: state.messages
    };
}

export function readFarmConsoleTranscript(raw: string): FarmConsoleTranscript | undefined {
    let v: unknown;
    try { v = JSON.parse(raw); } catch { return undefined; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { return undefined; }
    const o = v as Record<string, unknown>;
    if (o.format !== 'agent-farm-console-v1' || o.engine !== 'agy'
        || typeof o.sessionId !== 'string' || !o.sessionId
        || !Array.isArray(o.messages)) { return undefined; }
    return o as unknown as FarmConsoleTranscript;
}

function parseFarmConsoleFile(
    file: string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string }
): SessionInfo | undefined {
    const raw = readCapped(file);
    if (!raw) { return undefined; }
    const snap = readFarmConsoleTranscript(raw);
    if (!snap) { return undefined; }
    const info = blankInfo(file, snap.sessionId, snap.engine, snap.lastTs || snap.startedAt);
    info.cwd = snap.cwd;
    info.firstTs = snap.startedAt;
    info.lastTs = snap.lastTs;
    info.mtime = snap.lastTs;
    info.models = snap.model ? [snap.model] : [];
    // The Console state carries the exact aggregate but not an input/output
    // split. Keep the table total exact in the neutral input bucket; the custom
    // viewer below uses `tokens` directly and does not mislabel the split.
    info.usage.input = snap.tokens;
    info.wTokens = snap.wTokens;
    info.cost = snap.cost;
    // ‼️ The snapshot has carried this since it was invented and no row read it,
    // so an Antigravity conversation Agent Farm hosted ITSELF still showed an
    // empty ctx cell (X-35). The Console measured the window while the
    // conversation was open; there is no reason for the table to know less.
    if (snap.contextTokens > 0) { info.lastCtxTokens = snap.contextTokens; }
    info.userTurns = snap.messages.filter(m => m.role === 'user' && !m.steer).length;
    info.assistantMsgs = snap.messages.filter(m => m.role === 'agent').length;
    for (const m of snap.messages) {
        if (m.role === 'tool' && m.tool) {
            info.toolCalls++;
            info.tools[m.tool.name] = (info.tools[m.tool.name] ?? 0) + 1;
        }
        if (m.isError || m.role === 'error') { info.errors++; }
    }
    const first = snap.messages.find(m => m.role === 'user' && m.text?.trim());
    const title = first?.text ? conversationTitle(first.text) : '';
    info.title = info.autoTitle = title || 'Antigravity session';
    const who = resolveAgent(snap.cwd);
    info.agentId = (who.agentId ?? snap.agentId) || undefined;
    info.agentName = (who.agentName ?? snap.agentName) || undefined;
    return info;
}

export function farmConsoleSessionsSource(
    root: () => string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    cacheMs = 1000
): SessionSource {
    return scanWithCache(
        'agent-farm-console', () => { const d = root(); return d ? [d] : []; }, ['.json'],
        file => parseFarmConsoleFile(file, resolveAgent), cacheMs);
}

// ---------------------------------------------------------------------------
// Antigravity — ~/.gemini/antigravity-cli/cache/conversation_metadata.json
// ---------------------------------------------------------------------------

/**
 * ‼️ THE ENGINE THAT WAS STRUCTURALLY INVISIBLE (U-26).
 *
 * An Engine column that can never print one of the four engines is not a
 * column, it is a claim. Antigravity was that engine: nothing in this file
 * read it, so no `agy` conversation had ever appeared in a sessions table.
 *
 * Its real transcript cannot be read here, and that is worth stating rather
 * than working around. Measured 2026-08-10: each conversation is a SQLite db
 * under `conversations/<id>.db`, and its `steps` table stores `step_payload`
 * as protobuf BLOBs with no schema on disk — decoding that is guesswork with
 * a version number attached to it.
 *
 * What IS readable is the CLI's own index of those conversations, which
 * carries exactly the columns a session row needs: the id, a Preview that
 * serves as the title, the step count, when it was last touched, and the
 * WORKSPACE — which is what attributes the conversation to an agent, the same
 * way every other source does it.
 *
 * `file` stays empty on purpose: the convention in this module is that an
 * empty `file` means "no transcript a viewer could open", and offering one
 * that leads to a protobuf blob would be worse than offering none. Tokens and
 * cost are honestly zero for the same reason the live-events source reports
 * zero — this index does not carry them, and inventing a number would put a
 * fabricated figure in a spend column.
 */
export function agySessionsSource(
    agyHome: () => string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    cacheMs = 60_000
): SessionSource {
    let cache: SessionInfo[] = [];
    let cachedSig = '';
    let lastScan = 0;
    return {
        id: 'agy',
        scan(): SessionInfo[] {
            const home = agyHome();
            if (!home) { return cache = []; }
            const file = path.join(home, 'cache', 'conversation_metadata.json');
            const now = Date.now();
            let st: fs.Stats;
            try { st = fs.statSync(file); } catch { return cache = []; }
            const sig = `${st.size}:${st.mtimeMs}`;
            if (sig === cachedSig && now - lastScan < cacheMs) { return cache; }
            cachedSig = sig;
            lastScan = now;

            let root: Record<string, unknown>;
            try { root = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>; }
            catch { return cache = []; }
            const convs = root.conversations;
            if (!convs || typeof convs !== 'object') { return cache = []; }

            const cutoff = now - SCAN_DAYS * 24 * 3600 * 1000;
            const out: SessionInfo[] = [];
            for (const [key, raw] of Object.entries(convs as Record<string, unknown>)) {
                if (!raw || typeof raw !== 'object') { continue; }
                const row = raw as Record<string, unknown>;
                // the CLI's own bookkeeping threads are not the user's sessions
                if (row.is_internal === true) { continue; }
                const sum = (row.summary && typeof row.summary === 'object'
                    ? row.summary : {}) as Record<string, unknown>;
                const id = String(sum.ID ?? key).trim();
                if (!id) { continue; }
                const ts = stamp(row.last_modified_time) ?? stamp(sum.UpdatedAt);
                if (!ts || ts < cutoff) { continue; }
                const info = blankInfo('', id, 'agy', ts);
                const title = String(sum.Title ?? '').trim() || String(sum.Preview ?? '').trim();
                if (title) { info.title = truncate(title, 120); info.autoTitle = info.title; }
                else { info.title = info.autoTitle = 'Antigravity session'; }
                const cwd = firstWorkspace(sum.WorkspaceURIs);
                if (cwd) {
                    info.cwd = cwd;
                    const who = resolveAgent(cwd);
                    if (who.agentId) { info.agentId = who.agentId; }
                    if (who.agentName) { info.agentName = who.agentName; }
                }
                out.push(info);
            }
            return cache = out;
        }
    };
}

/** `2026-06-26T21:45:33.9462384+07:00` — more decimals than Date.parse takes,
 *  so the fraction is trimmed to milliseconds first. */
function stamp(v: unknown): number | undefined {
    if (typeof v !== 'string' || !v.trim()) { return undefined; }
    const t = Date.parse(v.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isFinite(t) ? t : undefined;
}

/** `file:///D:/zone/agent/temp` → `D:\zone\agent\temp`. A URI this module
 *  cannot make sense of yields nothing rather than a half-decoded path. */
function firstWorkspace(v: unknown): string | undefined {
    const first = Array.isArray(v) ? v.find(x => typeof x === 'string' && x.trim()) : undefined;
    if (!first) { return undefined; }
    const raw = String(first).trim();
    if (!raw.startsWith('file://')) { return raw; }
    try {
        const p = decodeURIComponent(raw.replace(/^file:\/\/\/?/, ''));
        return /^[a-z]:/i.test(p) ? p.replace(/\//g, '\\') : '/' + p;
    } catch { return undefined; }
}
