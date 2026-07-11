import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PricingEngine, Usage, emptyUsage } from './pricing';
import { SessionInfo } from './sessions';
import { SessionSource } from './sessionSource';
import { truncate } from './util';

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
        models: [], usage: emptyUsage(), cost: 0,
        userTurns: 0, assistantMsgs: 0, toolCalls: 0, tools: {},
        skillCalls: {}, memoryReads: {}, errors: 0,
        daily: {}, heat: new Array(168).fill(0), events: [], recentMsgs: []
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
        info?: { model?: string; total_token_usage?: CodexTokenTotals };
        // response_item function_call
        name?: string;
    };
}

const CODEX_PROMPT_PREFIX = '## My request for Codex:';

function parseCodexFile(file: string, resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine): SessionInfo | undefined {
    const raw = readCapped(file);
    if (!raw) { return undefined; }
    const info = blankInfo(file, path.basename(file, '.jsonl'), 'codex', fs.statSync(file).mtimeMs);
    let cumulative: CodexTokenTotals | undefined;
    let lastModel = '';
    let firstTs = 0, lastTs = 0;
    const models = new Set<string>();

    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: CodexLine;
        try { line = JSON.parse(lineText) as CodexLine; } catch { continue; }
        const ts = line.timestamp ? Date.parse(line.timestamp) : NaN;
        if (!Number.isNaN(ts)) {
            if (!firstTs) { firstTs = ts; }
            lastTs = ts;
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
                const text = p.message.includes(CODEX_PROMPT_PREFIX)
                    ? p.message.slice(p.message.indexOf(CODEX_PROMPT_PREFIX) + CODEX_PROMPT_PREFIX.length)
                    : p.message;
                const clean = text.replace(/\s+/g, ' ').trim();
                if (clean && !clean.startsWith('<') && info.title === 'codex session') {
                    info.title = truncate(clean, 80);
                    info.autoTitle = info.title;
                }
            } else if (p.type === 'token_count' && p.info) {
                if (typeof p.info.model === 'string' && p.info.model) { models.add(p.info.model); lastModel = p.info.model; }
                // token_count totals are CUMULATIVE — the last one is the session total.
                if (p.info.total_token_usage) { cumulative = p.info.total_token_usage; }
                info.assistantMsgs++;
            }
        } else if (line.type === 'response_item' && p.type === 'function_call') {
            info.toolCalls++;
            const name = typeof p.name === 'string' && p.name ? p.name : 'tool';
            info.tools[name] = (info.tools[name] ?? 0) + 1;
        }
    }

    // A rollout with no usage and no prompts is noise (probe/empty session).
    if (!cumulative && info.userTurns === 0) { return undefined; }
    if (firstTs) { info.firstTs = firstTs; }
    if (lastTs) { info.lastTs = lastTs; }
    if (cumulative) {
        const cached = cumulative.cached_input_tokens ?? 0;
        const input = cumulative.input_tokens ?? 0;
        info.usage = {
            input: Math.max(0, input - cached),
            // reasoning tokens are DISJOINT from output_tokens in the rollout
            // (total = input + output + reasoning) and are billed as output.
            output: (cumulative.output_tokens ?? 0) + (cumulative.reasoning_output_tokens ?? 0),
            cacheWrite: 0,
            cacheRead: cached
        };
    }
    info.models = [...models];
    // Multi-model rollouts are rare; attribute the session's usage to the last
    // active model. No matching pricing rule → $0 + unknown-models warning.
    if (lastModel) { info.cost = pricing().costFor(lastModel, info.usage); }
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
