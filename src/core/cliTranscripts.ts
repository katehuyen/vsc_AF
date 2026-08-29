import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import {
    emptyImportManifest, EXTERNAL_IMPORT_MARK, EXTERNAL_IMPORT_TURN, ExternalImportManifest,
    ImportMarks, importManifestReader, resolveProvenance
} from './externalImports';
import { opencodeExport, opencodeTitle } from './opencodehistory';
import { PricingEngine, Usage, emptyUsage, totalTokens, weightedTokens } from './pricing';
import { conversationTitle, FIRST_PROMPT_MAX, SessionInfo, SessionTurn } from './sessions';
import { SessionSource } from './sessionSource';
import { truncate } from './util';
import { ConsoleMessage, ConsoleSessionState } from './consoleproto';

/**
 * E3b — transcript adapters for external CLIs. Formats were taken from the
 * upstream sources (July 2026): openai/codex `codex-rs/protocol` (rollout
 * lines: session_meta / turn_context / event_msg token_count+user_message /
 * item_completed + response_item) and google-gemini/gemini-cli session files under
 * `~/.gemini/tmp/<sha256(projectRoot)>/chats/` (JSON with `messages[]` or
 * JSONL records; token key aliases as parsed by ccusage). Formats drift —
 * every parser here is fail-soft: a line/file that doesn't match is skipped,
 * never an error. Costs use `agentFarm.pricing` rules; models without a rule
 * are honestly $0 and land in the unknown-models warning.
 */

const SCAN_DAYS = 90;
/**
 * Whole-file ceiling — for the sources whose format is ONE json document and
 * therefore cannot be read a line at a time (a gemini chat file, the Console's
 * own snapshot). Above it the session is reported UNREAD, never dropped.
 */
const MAX_FILE_BYTES = 24 * 1024 * 1024;
/**
 * Line-streamed ceiling. A JSONL transcript is read a chunk at a time, so its
 * size never becomes this process's memory — this is the runaway guard for a
 * file that is no longer a transcript, not a working limit.
 */
const MAX_STREAM_BYTES = 512 * 1024 * 1024;
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

/**
 * ‼️ S-32 — A TRANSCRIPT TOO LARGE TO READ IS NOT A SESSION THAT NEVER HAPPENED.
 *
 * The read used to answer `undefined` for a file over the ceiling, and every
 * parser here reads `undefined` as "not a session": the row left the external
 * list altogether and took the Sessions table, the cost totals, the project
 * match, Console's resume scrollback and search with it — with no line on any
 * surface saying why. It was not theoretical. Measured on the S-30 report: one
 * ordinary Codex rollout was 13,970,211 bytes, 58% of the ceiling, so the drop
 * was one long session away.
 *
 * Two answers, and the FORMAT decides which — not taste:
 * - a JSONL transcript is read a chunk at a time (`streamLines`), so the file's
 *   size never becomes this process's memory and every figure is real;
 * - a format that is one JSON document has to be held whole (`readWhole`), so
 *   above the ceiling the session is reported UNREAD: identity, file and time
 *   are real, every figure stays at an honest zero, and `scanLimit` is the mark
 *   the surfaces draw instead of letting the row look like a session that did
 *   nothing.
 *
 * `undefined` from either of these still means what it always meant — the file
 * could not be opened at all.
 */
interface ReadOutcome {
    /** What the file measured, in bytes. */
    bytes: number;
    /** Set when the file is over the ceiling — the ceiling it passed. */
    over?: number;
}

/** Feed a file's lines to `onLine` without ever holding the file in memory. */
function streamLines(file: string, onLine: (line: string) => void): ReadOutcome | undefined {
    let bytes = 0;
    try { bytes = fs.statSync(file).size; } catch { return undefined; }
    if (bytes > MAX_STREAM_BYTES) { return { bytes, over: MAX_STREAM_BYTES }; }
    let fd: number;
    try { fd = fs.openSync(file, 'r'); } catch { return undefined; }
    try {
        const buf = Buffer.allocUnsafe(1024 * 1024);
        // a multi-byte character can straddle two chunks — the decoder holds
        // the tail rather than handing back a replacement character
        const decoder = new StringDecoder('utf8');
        let carry = '';
        for (;;) {
            const n = fs.readSync(fd, buf, 0, buf.length, null);
            if (n <= 0) { break; }
            const parts = (carry + decoder.write(buf.subarray(0, n))).split('\n');
            carry = parts.pop() ?? '';
            for (const p of parts) { onLine(p); }
        }
        carry += decoder.end();
        if (carry) { onLine(carry); }
        return { bytes };
    } catch { return undefined; } finally {
        try { fs.closeSync(fd); } catch { /* already gone */ }
    }
}

/** The whole file, for a format that only means something whole. */
function readWhole(file: string): (ReadOutcome & { text?: string }) | undefined {
    let bytes = 0;
    try { bytes = fs.statSync(file).size; } catch { return undefined; }
    if (bytes > MAX_FILE_BYTES) { return { bytes, over: MAX_FILE_BYTES }; }
    try { return { bytes, text: fs.readFileSync(file, 'utf8') }; } catch { return undefined; }
}

/** The row a file too large to read still deserves: who it is, where it is,
 *  when it was last touched — and the mark that says its figures were not read
 *  rather than measured at zero. */
function unreadInfo(file: string, sessionId: string, source: string, read: ReadOutcome): SessionInfo {
    let mtime = Date.now();
    try { mtime = fs.statSync(file).mtimeMs; } catch { /* it was there a moment ago */ }
    const info = blankInfo(file, sessionId, source, mtime);
    info.scanLimit = { bytes: read.bytes, limit: read.over ?? MAX_FILE_BYTES };
    return info;
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
        /** X-44 — which client wrote the rollout ("Codex Desktop", "codex", …).
         *  Evidence about the STORAGE side only: a native Desktop thread and an
         *  imported one say the same word, so it never decides provenance. */
        originator?: string;
        // turn_context
        model?: string;
        /** ‼️ S-47 — the reasoning effort that turn ran at, stated PER TURN.
         *  Measured on this machine's rollouts (codex 0.149.0): `turn_context`
         *  carries a top-level `effort` beside the model, and repeats on every
         *  turn — so the last one is the session's current setting, exactly as
         *  the model beside it already was. */
        effort?: string;
        /** The sandbox that turn actually ran under. See `codexPermissionFrom`. */
        sandbox_policy?: { type?: string };
        // event_msg
        type?: string; message?: string;
        item?: {
            type?: string;
            text?: string;
            content?: { type?: string; text?: string }[];
        };
        /** `external-import-turn-1` on a converted rollout (X-44). */
        turn_id?: string;
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

/**
 * Dialogue carried by the Codex 0.149 stored-rollout envelope.
 *
 * This is deliberately narrower than `response_item role=user`: that record
 * also carries the recommended-plugin list, AGENTS.md and environment injected
 * by the Codex host. The matching `item_completed/UserMessage` is the measured
 * human-turn boundary, so accepting only it keeps machinery out of the session
 * title and out of the dialogue. The 0.136 `user_message` path remains beside
 * this one for old rollouts.
 */
export function codexCompletedMessage(value: unknown): { role: 'user' | 'assistant'; text: string } | undefined {
    if (!value || typeof value !== 'object') { return undefined; }
    const payload = value as Record<string, unknown>;
    if (payload.type !== 'item_completed' || !payload.item || typeof payload.item !== 'object') {
        return undefined;
    }
    const item = payload.item as Record<string, unknown>;
    const role = item.type === 'UserMessage' ? 'user'
        : item.type === 'AgentMessage' ? 'assistant' : undefined;
    if (!role) { return undefined; }
    const parts = Array.isArray(item.content) ? item.content : [];
    const text = parts.map(part => {
        if (!part || typeof part !== 'object') { return ''; }
        const t = (part as Record<string, unknown>).text;
        return typeof t === 'string' ? t : '';
    }).filter(Boolean).join('\n').trim()
        || (typeof item.text === 'string' ? item.text.trim() : '');
    return text ? { role, text } : undefined;
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

/**
 * ‼️ S-40 — EVERY ENGINE UNROLLS INTO TURNS, OR THE TURNS PAGE IS ONE ENGINE'S.
 *
 * `buildTurnRows` maps over `SessionInfo.turns`. A parser that leaves that array
 * empty does not produce a thin row on the Turns page — it produces NO ROW AT
 * ALL, and no entry in that page's engine picker either, because the picker's
 * options are derived from the rows present. So a page that says it is "the
 * whole farm, one row per turn" silently claimed the farm was two engines wide.
 * The rows were never missing from the filter; they were missing from the data.
 *
 * ‼️ THE BOUNDARY IS THE VIEWER'S BOUNDARY, NOT A SECOND OPINION. `n` here is
 * the same turn number `cliViewer.ts` gives the same file — the Turns page folds
 * a row open by asking the viewer for `turn === n`, and a parser that counted
 * turns its own way would open somebody else's turn. Each adaptor below opens on
 * exactly the condition its viewer counterpart increments on; `test_engine_turns.js`
 * holds the two together.
 *
 * A figure the format does not carry stays at its honest zero — never split out
 * of the session total, which is the interpolation this codebase keeps refusing.
 */
function turnBuilder(info: SessionInfo) {
    const open = (label: string, ts: number): SessionTurn => {
        const t: SessionTurn = {
            n: info.turns.length + 1, label: truncate(label.replace(/\s+/g, ' ').trim(), 90), ts,
            tokens: 0, wTokens: 0, cost: 0, apiCalls: 0, steps: 0, thinking: 0,
            ms: 0, endCtx: 0, tools: 0, errors: 0, models: []
        };
        info.turns.push(t);
        return t;
    };
    const now = (): SessionTurn | undefined =>
        info.turns.length ? info.turns[info.turns.length - 1] : undefined;
    /** The open turn runs to the last line recorded inside it (Claude semantics). */
    const touch = (ts: number): void => {
        const t = now();
        if (t && ts && t.ts && ts > t.ts) { t.ms = ts - t.ts; }
    };
    const model = (t: SessionTurn | undefined, m: string): void => {
        if (t && m && !t.models.includes(m)) { t.models.push(m); }
    };
    return { open, now, touch, model };
}

function parseCodexFile(file: string, resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine, imports?: () => ExternalImportManifest): SessionInfo | undefined {
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch { return undefined; }
    const info = blankInfo(file, path.basename(file, '.jsonl'), 'codex', mtime);
    // X-44 — what the file itself says about being a copy of another agent's run.
    const marks: ImportMarks = { marked: false };
    let cumulative: CodexTokenTotals | undefined;
    // ‼️ What the window HELD at the end, as opposed to what the thread SPENT
    // over its life. Both are on the same line and only one of them is a
    // context figure — see `last_token_usage`.
    let lastRequest: CodexTokenTotals | undefined;
    let ctxWindow = 0;
    let lastModel = '';
    let lastEffort = '';
    let lastMode = '';
    let firstTs = 0, lastTs = 0;
    const models = new Set<string>();

    /**
     * ‼️ A Codex rollout states every boundary the shape needs, and states them
     * plainly: legacy `user_message` or 0.149's `item_completed/UserMessage`
     * opens a turn and carries its label and time,
     * `token_count.last_token_usage` is that request's own spend AND the window
     * it ended holding, `response_item` function/custom calls are its tools,
     * `turn_context` names the model. So the turns are built from what the file
     * says, and the fields it cannot answer stay at their honest zero rather
     * than being interpolated from the session total (`turnBuilder`).
     */
    const { open: openTurn, now: turnNow } = turnBuilder(info);

    // ‼️ S-32 — read a chunk at a time, never whole. A rollout grows with the
    // conversation and the file's size must not decide whether the session
    // exists; nothing here holds more than the line it is looking at.
    const read = streamLines(file, lineText => {
        if (!lineText.trim()) { return; }
        if (!marks.marked && lineText.includes(EXTERNAL_IMPORT_MARK)) { marks.marked = true; }
        let line: CodexLine;
        try { line = JSON.parse(lineText) as CodexLine; } catch { return; }
        const ts = line.timestamp ? Date.parse(line.timestamp) : NaN;
        if (!Number.isNaN(ts)) {
            if (!firstTs) { firstTs = ts; }
            lastTs = ts;
            // The turn runs to its last recorded line, exactly as on Claude.
            const open = turnNow();
            if (open && ts > open.ts) { open.ms = ts - open.ts; }
        }
        const p = line.payload;
        if (!p) { return; }
        if (line.type === 'session_meta') {
            const sid = p.session_id ?? p.id;
            if (typeof sid === 'string' && sid) { info.sessionId = sid; }
            if (typeof p.cwd === 'string') { info.cwd = p.cwd; }
            if (typeof p.cli_version === 'string') { info.version = p.cli_version; }
            if (typeof p.originator === 'string') { marks.originator = p.originator; }
        } else if (line.type === 'turn_context') {
            if (typeof p.model === 'string' && p.model) { models.add(p.model); lastModel = p.model; }
            if (typeof p.effort === 'string' && p.effort) { lastEffort = p.effort; }
            const mode = codexPermissionFrom(p.sandbox_policy?.type);
            if (mode) { lastMode = mode; }
        } else if (line.type === 'event_msg') {
            if (typeof p.turn_id === 'string' && EXTERNAL_IMPORT_TURN.test(p.turn_id)) { marks.marked = true; }
            const completed = codexCompletedMessage(p);
            const userMessage = p.type === 'user_message' && typeof p.message === 'string'
                ? p.message : completed?.role === 'user' ? completed.text : undefined;
            const assistantMessage = p.type === 'agent_message' && typeof p.message === 'string'
                ? p.message : completed?.role === 'assistant' ? completed.text : undefined;
            if (typeof userMessage === 'string') {
                info.userTurns++;
                const named = codexPromptTitle(userMessage);
                if (named && info.title === 'codex session') {
                    info.title = named; info.autoTitle = named;
                }
                openTurn(named || codexUserText(userMessage).slice(0, 80),
                    Number.isNaN(ts) ? (lastTs || info.mtime) : ts);
            } else if (typeof assistantMessage === 'string' && assistantMessage.trim()) {
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
    });
    if (!read) { return undefined; }
    if (read.over) { return unreadInfo(file, path.basename(file, '.jsonl'), 'codex', read); }

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
    /**
     * ‼️ S-47 — AND THE SAME FIGURE ON THE FIELD A RESUME READS.
     *
     * This parser has tracked `lastModel` since it was written — for the COST
     * line below — and never wrote it onto the row, so `lastRunDimensions` fell
     * back to `models[models.length - 1]`: a set in first-seen order, whose last
     * element names the model the session STOPPED using. A rollout that went
     * `gpt-5.6-sol → gpt-5.6-luna → gpt-5.6-sol` resumed on luna. The figure was
     * already here; only the field was missing.
     */
    if (lastModel) { info.lastModel = lastModel; }
    if (lastEffort) { info.effort = lastEffort; }
    if (lastMode) { info.permissionMode = lastMode; }
    // Multi-model rollouts are rare; attribute the session's usage to the last
    // active model. No matching pricing rule → $0 + unknown-models warning.
    if (lastModel) { info.cost = pricing().costFor(lastModel, info.usage, info.lastTs); }
    const agent = resolveAgent(info.cwd);
    info.agentId = agent.agentId;
    info.agentName = agent.agentName;
    applyCodexProvenance(info, marks, imports?.());
    return info;
}

/**
 * ‼️ X-44 — WHERE THE FILE LIVES STOPS DECIDING WHO RAN IT.
 *
 * Everything a rollout can prove about itself, written onto the row: the format
 * it is stored in (always codex, we just read it), the engine that produced the
 * work (from the import manifest, or unnamed), and the canonical id of the run
 * — which is the SOURCE's id on an import, so the copy and the original land on
 * one key and the work is counted once. `sessionId` is untouched: resume and
 * "open the imported copy" address the thread that is really on disk.
 */
function applyCodexProvenance(
    info: SessionInfo, marks: ImportMarks, manifest?: ExternalImportManifest
): void {
    const r = resolveProvenance(info.sessionId, 'codex', manifest ?? emptyImportManifest(), marks);
    info.provenance = r.provenance;
    info.storageEngine = r.storageEngine;
    if (r.producerEngine) { info.producerEngine = r.producerEngine; }
    info.canonicalSessionId = r.canonicalSessionId ?? info.sessionId;
    if (r.sourceSessionId) { info.sourceSessionId = r.sourceSessionId; }
    if (r.sourcePath) { info.sourcePath = r.sourcePath; }
    if (r.importedThreadId) { info.importedThreadId = r.importedThreadId; }
    if (r.importedAt) { info.importedAt = r.importedAt; }
}

export function codexSessionsSource(
    codexHome: () => string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine,
    cacheMs = 60_000
): SessionSource {
    // One manifest read per change, shared by every rollout in the scan.
    const imports = importManifestReader(codexHome, cacheMs);
    return scanWithCache(
        'codex',
        () => {
            const home = codexHome();
            return home ? [path.join(home, 'sessions'), path.join(home, 'archived_sessions')] : [];
        },
        ['.jsonl'],
        file => parseCodexFile(file, resolveAgent, pricing, imports),
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

/**
 * ‼️ WHAT OPENS A GEMINI TURN, DECIDED ONCE (S-40). The index numbers the turns
 * and the viewer numbers them again when a row folds open; if the two disagree
 * about a single record, every later `n` in that session is off by one and the
 * fold shows somebody else's prompt. So both ask this. The rule is the shape the
 * files actually take: the first of `content` / `message` / `text` that is
 * present, coerced the way the viewer coerces every other field, and **no text
 * means no turn**.
 */
export function geminiUserOpening(rec: Record<string, unknown>): string {
    for (const key of ['content', 'message', 'text']) {
        const v = rec[key];
        if (v === undefined || v === null) { continue; }
        if (typeof v === 'string') { return v.trim(); }
        if (Array.isArray(v)) {
            return v.map(x => {
                if (typeof x === 'string') { return x; }
                if (!x || typeof x !== 'object') { return ''; }
                const o = x as Record<string, unknown>;
                return typeof o.text === 'string' ? o.text
                    : typeof o.content === 'string' ? o.content : '';
            }).filter(Boolean).join('\n').trim();
        }
        if (typeof v === 'object') {
            try { return JSON.stringify(v, null, 2).trim(); } catch { return String(v).trim(); }
        }
        return String(v).trim();
    }
    return '';
}

function parseGeminiFile(
    file: string,
    agentForHash: (hash: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine
): SessionInfo | undefined {
    // A gemini chat file is EITHER one json document or a run of records, and
    // which it is only becomes clear once it is whole — so this one is read
    // whole, and the ceiling is answered with a marked row rather than silence.
    const read = readWhole(file);
    if (!read) { return undefined; }
    const ext0 = path.extname(file);
    if (read.over) { return unreadInfo(file, path.basename(file, ext0), 'gemini', read); }
    const raw = read.text ?? '';
    if (!raw.trim()) { return undefined; }
    const mtime = fs.statSync(file).mtimeMs;
    const ext = path.extname(file);
    const info = blankInfo(file, path.basename(file, ext), 'gemini', mtime);
    const models = new Set<string>();
    let cost = 0;
    let currentModel = '';
    /** S-47 - the model that produced the LAST reply, which is not the last
     *  element of `models`: that set is ordered by first sight. */
    let lastModel = '';
    let sawUsage = false;
    let tsMin = Infinity, tsMax = -Infinity;
    /** The last time a RECORD stated (never the document's own span) — what a
     *  record with no clock of its own is stamped with. */
    let atLast = 0;

    const turn = turnBuilder(info);

    const handleUser = (msg: Record<string, unknown>, at: number) => {
        info.userTurns++;
        const opening = geminiUserOpening(msg);
        if (opening) { turn.open(opening, at); }
        const clean = userText(msg).replace(/\s+/g, ' ').trim();
        if (clean && !clean.startsWith('<') && info.title === 'gemini session') {
            info.title = truncate(clean, 80);
            info.autoTitle = info.title;
        }
    };
    const handleModelTurn = (msg: Record<string, unknown>, modelHint: string, at: number) => {
        const model = typeof msg['model'] === 'string' && msg['model'] ? msg['model'] as string : modelHint;
        // ‼️ S-47 — SET HERE, NOT WHERE THE MODEL IS BILLED. `models` is only
        // added to once a reply reported usage, which is right for a spend
        // column and wrong for "what is it on now": a reply that answered
        // without reporting tokens still answered, and it is the last one that a
        // resume inherits. `handleStats` must never touch this — that block is a
        // per-model BREAKDOWN of the session, not an order of events.
        if (model) { lastModel = model; }
        const tokens = parseGeminiTokens(msg['tokens']);
        info.assistantMsgs++;
        // A reply is a step of the open turn whether or not it reported usage —
        // the count of what happened must not depend on whether it was billed.
        const open = turn.now();
        if (open) { open.steps++; turn.model(open, model); }
        turn.touch(at);
        if (!tokens) { return; }
        sawUsage = true;
        const turnUsage = emptyUsage();
        addGeminiUsage(turnUsage, tokens);
        addGeminiUsage(info.usage, tokens);
        if (model) {
            models.add(model);
            cost += pricing().costFor(model, turnUsage);
        }
        // ‼️ The turn's own spend, off the SAME reply the session total is built
        // from, so the page and the table can never tell two stories. Gemini
        // publishes no window figure, so `endCtx` stays the honest zero.
        if (open) {
            open.tokens += totalTokens(turnUsage);
            open.apiCalls++;
            if (model) {
                open.cost += pricing().costFor(model, turnUsage);
                open.wTokens += weightedTokens(model, turnUsage);
            }
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
        // B6: start-ish and end-ish keys are tracked separately so a session
        // with startTime + lastUpdated (and no per-message timestamps) still
        // gets its real recency instead of appearing as old as its start.
        // ‼️ Read BEFORE the record is dispatched (S-40): a turn has to be
        // stamped with its own line's time, and this is where that time is.
        const tsOf = (k: string) => typeof rec[k] === 'string' ? Date.parse(rec[k] as string) : NaN;
        const start = [tsOf('timestamp'), tsOf('created_at'), tsOf('startTime')].find(v => !Number.isNaN(v));
        const end = [tsOf('lastUpdated'), tsOf('timestamp'), tsOf('created_at')].find(v => !Number.isNaN(v));
        if (start !== undefined) { tsMin = Math.min(tsMin, start); tsMax = Math.max(tsMax, start); }
        if (end !== undefined) { tsMax = Math.max(tsMax, end); }
        // ‼️ A gemini record is free to carry no time of its own — the fixture
        // formats do it and so do real files. The turn is then stamped with the
        // last time the file ITSELF stated, which is where the record sits in a
        // chronological log; the document's own `lastUpdated` is deliberately
        // not eligible, or a turn in the middle would be dated at the end.
        const recTs = [tsOf('timestamp'), tsOf('created_at')].find(v => !Number.isNaN(v));
        if (recTs !== undefined) { atLast = recTs; }
        const at = recTs !== undefined ? recTs : atLast;

        const type = rec['type'];
        if (type === 'user') { handleUser(rec, at); }
        else if (type === 'gemini') { handleModelTurn(rec, currentModel, at); }
        if (rec['stats']) { handleStats(rec['stats']); }
        else if (rec['result'] && typeof rec['result'] === 'object') {
            handleStats((rec['result'] as Record<string, unknown>)['stats']);
        }
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
    if (lastModel) { info.lastModel = lastModel; }
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

/**
 * ‼️ U-75 — A ROW THE CONSOLE READ BACK, NOT A ROW THE CONVERSATION HAD.
 *
 * Resuming rebuilds the scrollback from this very file, and the rebuilt rows are
 * named by where they came from: `xh<n>` is a message re-rendered out of the
 * transcript at position n, `h<n>` the same from the native reader. Everything
 * the conversation itself produced carries a live id — `cm…`, `sys-…`, `err-…`,
 * `perm-…` — so the two are told apart by the id and not by guessing at text.
 */
export function isReadBackRow(m: ConsoleMessage): boolean {
    return /^x?h\d/.test(String(m?.id ?? ''));
}

/**
 * ‼️ U-75 — AND A SENTENCE **ABOUT** A READ, which is not conversation at all.
 *
 * "↑ 412 older message(s) are in the transcript", "— read back from the
 * transcript · snapshot 2.1 MB · resumed here —", the notes that explain why a
 * scrollback could not be rebuilt. They are true of one reading of one file at
 * one moment; written into the record they become permanent scars that every
 * later resume adds another of.
 */
export function isReadNoteRow(m: ConsoleMessage): boolean {
    return /^x?h-/.test(String(m?.id ?? ''));
}

/**
 * ‼️ U-75 — THE RECORD IS NEVER SHORTENED BY A READ OF IT.
 *
 * This mirror is the ONLY transcript in the farm written as a whole file out of
 * memory. Every other engine appends to a log it owns, so a Console card holding
 * a windowed view of a conversation cannot damage it. Here the card WAS the
 * file: a resume rebuilt the scrollback from the last ~150 messages
 * (`historyWindowIndices`), the next turn wrote the card back over the file, and
 * everything above that window was gone — from Agent Farm's own record, which is
 * the only copy there is, Antigravity's store being unreadable protobuf.
 * Reported as a transcript whose "turn 1" was a turn from the middle, opening on
 * a stray paragraph with no turn heading above it: that paragraph was wherever
 * the window happened to start. A second resume cut what was left again.
 *
 * So a write MERGES rather than replaces:
 *
 * - `carried` — the record as it stands — is kept WHOLE and stays first.
 * - The card contributes only what it has that the record does not, matched by
 *   message id. That is what makes the merge safe to run on every write and on a
 *   card that took over a seat: a row already in the record is never appended a
 *   second time.
 * - Rows the card READ BACK out of the record are dropped, because the record
 *   already holds those same messages in the form they were written in. When
 *   there is no record to merge into they are all the history there is, so they
 *   are kept — a conversation first hosted from the CLI's own log must not lose
 *   its past to this rule.
 * - Notes about a read are never written down at all.
 *
 * `startedAt` comes from the record too: a resumed card starts its clock now, and
 * a conversation that began on Tuesday must not be filed as having started when
 * somebody reopened it.
 */
export function mergeFarmConsoleTranscript(
    carried: Pick<FarmConsoleTranscript, 'messages' | 'startedAt'> | undefined,
    next: FarmConsoleTranscript
): FarmConsoleTranscript {
    const prev = carried?.messages ?? [];
    const held = new Set(prev.map(m => m.id));
    const own = next.messages.filter(m => {
        if (isReadNoteRow(m)) { return false; }
        if (isReadBackRow(m)) { return prev.length === 0; }
        return !held.has(m.id);
    });
    if (!prev.length) { return { ...next, messages: own }; }
    const messages = [...prev, ...own];
    const started = carried?.startedAt ?? 0;
    return {
        ...next,
        startedAt: started > 0 ? Math.min(started, next.startedAt || started) : next.startedAt,
        lastTs: Math.max(next.lastTs || 0, messages[messages.length - 1]?.ts ?? 0),
        messages
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
    const read = readWhole(file);
    if (!read) { return undefined; }
    if (read.over) { return unreadInfo(file, path.basename(file, '.json'), 'agy', read); }
    const snap = readFarmConsoleTranscript(read.text ?? '');
    if (!snap) { return undefined; }
    const info = blankInfo(file, snap.sessionId, snap.engine, snap.lastTs || snap.startedAt);
    info.cwd = snap.cwd;
    info.firstTs = snap.startedAt;
    info.lastTs = snap.lastTs;
    info.mtime = snap.lastTs;
    info.models = snap.model ? [snap.model] : [];
    /**
     * ‼️ S-47 — THE ONE RECORD THAT NEVER HAD TO BE INFERRED, AND WAS READ LEAST.
     *
     * This file is Agent Farm's OWN snapshot of a session Agent Farm launched:
     * `model`, `effort` and `permissionMode` have been written into it since it
     * was invented (`farmConsoleTranscript`), stated rather than derived. Only
     * `model` was ever read back, and only into the display list — so a hosted
     * conversation the user had deliberately put on `gemini-3.7-flash / high`
     * came back from a resume on the fleet default, with the answer sitting
     * three lines above in the same object.
     *
     * Absent stays absent: a snapshot written before a field existed says
     * nothing rather than defaulting, which is S-45's own rule.
     */
    if (String(snap.model ?? '').trim()) { info.lastModel = snap.model.trim(); }
    if (String(snap.effort ?? '').trim()) { info.effort = snap.effort.trim(); }
    if (String(snap.permissionMode ?? '').trim()) { info.permissionMode = snap.permissionMode.trim(); }
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
    // ‼️ S-40 — the hosted conversation unrolled into turns. This snapshot is
    // the richest of the foreign shapes: it carries the turn's own `result` row,
    // which states what that turn cost, spent and took. `steer` text said INTO a
    // running turn does not open a new one — the same rule the viewer applies,
    // and the reason a steered turn is one row here and not two.
    const turn = turnBuilder(info);
    for (const m of snap.messages) {
        if (m.role === 'user' && (!m.steer || !info.turns.length)) {
            turn.open(m.text ?? '', m.ts);
            turn.model(turn.now(), snap.model);
            continue;
        }
        const open = turn.now();
        // ‼️ A STEERING LINE IS NOT THE TURN WORKING. It stays inside the open
        // turn (that is what `steer` means) but it arrives after the engine has
        // already stated how long that turn took, so letting it move the clock
        // would overwrite the engine's own figure with the moment somebody typed.
        if (m.role !== 'user') { turn.touch(m.ts); }
        if (m.role === 'tool' && m.tool) {
            info.toolCalls++;
            info.tools[m.tool.name] = (info.tools[m.tool.name] ?? 0) + 1;
            if (open) { open.tools++; open.steps++; }
        }
        if (m.role === 'agent' && open) {
            open.steps++;
            if (m.kind === 'think') { open.thinking++; }
        }
        if (m.isError || m.role === 'error') {
            info.errors++;
            if (open) { open.errors++; }
        }
        // The Console closes a turn with a `result` row carrying that turn's own
        // numbers — read them rather than dividing the session total.
        if (m.role === 'result' && open) {
            open.apiCalls++;
            if (typeof m.tokens === 'number' && m.tokens > 0) { open.tokens += m.tokens; }
            if (typeof m.cost === 'number' && m.cost > 0) { open.cost += m.cost; }
            if (typeof m.ms === 'number' && m.ms > 0) { open.ms = Math.max(open.ms, m.ms); }
        }
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
// Antigravity — ~/.gemini/antigravity-cli/brain/<id>/…/transcript.jsonl
// ---------------------------------------------------------------------------

/** One call the model made, as the step log records it. */
export interface AgyToolCall {
    name?: string;
    args?: Record<string, unknown>;
}

/** One line of an Antigravity step log. */
export interface AgyStep {
    step_index?: number;
    source?: string;
    type?: string;
    status?: string;
    created_at?: string;
    content?: string;
    exit_code?: number;
    /** the call itself — the log folds the call and its result into one line */
    tool_calls?: AgyToolCall[];
    /** the CLI's own admission that it cut a field short, by name */
    truncated_fields?: string[];
}

/**
 * ‼️ EVERY ARG VALUE IN THIS LOG IS A JSON STRING INSIDE A JSON STRING.
 * Measured: `"CommandLine": "\"git status --short\""` and
 * `"Cwd": "\"D:\\\\zone\\\\agent\""`. Printing the raw value puts quotes and
 * doubled backslashes on screen and makes a path unusable to anything that
 * tries to match it, so it is unwrapped once — and only when it really is one.
 */
export function agyArg(args: Record<string, unknown> | undefined, key: string): string {
    const raw = args?.[key];
    if (raw === undefined || raw === null) { return ''; }
    let s = String(raw);
    if (!s.startsWith('"')) { return s; }
    // ‼️ AND IT IS NOT ALWAYS *VALID* JSON, NOR EVEN CLOSED. Measured on a real
    // multi-line `python -c` command: 2070 characters that open with a quote,
    // escape their inner quoting — and then end `…<truncated 195 bytes>` with no
    // closing quote at all, because the CLI cut its own field short. So
    // `JSON.parse` throws and a matched-pair test fails, and a reader that
    // insists on either hands the page a command line still wearing its quotes
    // and its doubled backslashes. Each end is judged on its own and the
    // unescape is done by hand; the CLI's `<truncated …>` marker is left
    // exactly where it is, because it is the engine admitting what it did.
    s = s.slice(1);
    if (s.endsWith('"')) { s = s.slice(0, -1); }
    return s.replace(/\\(["\\/bfnrt])/g, (_m, c: string) => (
        c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t'
            : c === 'b' ? '\b' : c === 'f' ? '\f' : c
    ));
}

/**
 * What one step DID, in one line — the engine's own tool name plus the argument
 * that identifies the call. `toolAction` is the CLI's own human sentence about
 * the call ("Checking git status") and is the honest fallback when a tool takes
 * arguments this does not name.
 */
export function agyToolDetail(call: AgyToolCall | undefined): string {
    const a = call?.args;
    if (!a) { return ''; }
    for (const key of ['CommandLine', 'AbsolutePath', 'TargetFile', 'DirectoryPath',
        'Query', 'query', 'SearchPath', 'ToolName', 'Prompt', 'Instruction', 'Action']) {
        const v = agyArg(a, key).trim();
        if (v) { return v; }
    }
    return agyArg(a, 'toolAction').trim() || agyArg(a, 'toolSummary').trim();
}

/**
 * ‼️ THE CALL AND ITS RESULT ARE TWO SEPARATE STEPS, AND NOT THE ONES YOU WOULD
 * GUESS. Measured on a real run:
 *
 * ```
 *   2 MODEL PLANNER_RESPONSE  tool_calls=[run_command]  content=-        ← the CALL
 *   3 MODEL RUN_COMMAND       tool_calls=-  exit_code=0  content="…"     ← the RESULT
 * ```
 *
 * The announcement carries the name, the command line and the `Cwd`; the step
 * NAMED after the tool carries only the output. Reading the arguments off the
 * result step — which is the obvious thing to do — finds nothing, so the page
 * draws a column of outputs with no commands above them and the row learns no
 * working directory. The call is therefore carried forward to the step that
 * answers it.
 */
export function agyToolName(step: AgyStep, pending?: AgyToolCall): string {
    const named = String(step.tool_calls?.[0]?.name ?? pending?.name ?? '').trim();
    if (named) { return named; }
    return String(step.type ?? 'tool').toLowerCase();
}

/** The call a step ANNOUNCES (rather than answers), if it announces one. */
export function agyAnnouncedCall(s: AgyStep): AgyToolCall | undefined {
    return s.tool_calls?.length ? s.tool_calls[0] : undefined;
}

/** Step types that ARE a tool call, whether or not the line carried `tool_calls`. */
const AGY_TOOL_STEPS = new Set([
    'RUN_COMMAND', 'CODE_ACTION', 'VIEW_FILE', 'LIST_DIRECTORY',
    'SEARCH_WEB', 'GREP_SEARCH', 'MCP_TOOL', 'GENERIC'
]);

/** Did this step fail? The log says so two ways and both have to be read. */
export function agyStepFailed(s: AgyStep): boolean {
    return s.status === 'ERROR' || s.type === 'ERROR_MESSAGE'
        || (typeof s.exit_code === 'number' && s.exit_code !== 0);
}

export function agyIsToolStep(s: AgyStep): boolean {
    return AGY_TOOL_STEPS.has(String(s.type ?? '')) || !!s.tool_calls?.length;
}

/** The workspace a conversation ran in, from whichever cache still says so. */
interface AgyHints {
    /** conversation id → { cwd, title } from `cache/conversation_metadata.json` */
    byId: Map<string, { cwd?: string; title?: string }>;
    /** conversation id → cwd from `cache/last_conversations.json` (workspace → id) */
    lastCwd: Map<string, string>;
}

/**
 * Where a step log lives, given the conversation's folder. The CLI writes the
 * same content twice — `transcript.jsonl` and `transcript_full.jsonl`, plus a
 * `chunks/` copy of each — and the short one is the conversation, so it is the
 * one read.
 */
function agyTranscriptFile(brainDir: string, id: string): string {
    return path.join(brainDir, id, '.system_generated', 'logs', 'transcript.jsonl');
}

/** The caches, read cheaply and tolerated missing — they are hints, not the source. */
function readAgyHints(home: string): AgyHints {
    const byId = new Map<string, { cwd?: string; title?: string }>();
    const lastCwd = new Map<string, string>();
    try {
        const root = JSON.parse(fs.readFileSync(
            path.join(home, 'cache', 'conversation_metadata.json'), 'utf8')) as Record<string, unknown>;
        const convs = root.conversations;
        if (convs && typeof convs === 'object') {
            for (const [key, raw] of Object.entries(convs as Record<string, unknown>)) {
                if (!raw || typeof raw !== 'object') { continue; }
                const row = raw as Record<string, unknown>;
                if (row.is_internal === true) { continue; }
                const sum = (row.summary && typeof row.summary === 'object'
                    ? row.summary : {}) as Record<string, unknown>;
                const id = String(sum.ID ?? key).trim();
                if (!id) { continue; }
                byId.set(id, {
                    cwd: firstWorkspace(sum.WorkspaceURIs),
                    title: String(sum.Title ?? '').trim() || String(sum.Preview ?? '').trim() || undefined
                });
            }
        }
    } catch { /* the file is 2026-08-10 vintage on this machine — that is the point */ }
    try {
        const last = JSON.parse(fs.readFileSync(
            path.join(home, 'cache', 'last_conversations.json'), 'utf8')) as Record<string, unknown>;
        for (const [cwd, id] of Object.entries(last)) {
            if (typeof id === 'string' && id.trim()) { lastCwd.set(id.trim(), cwd); }
        }
    } catch { /* no map, no cwd — the row still exists */ }
    return { byId, lastCwd };
}

/**
 * ‼️ THE `<USER_REQUEST>` WRAPPER IS THE CLI'S, NOT THE USER'S. Leaving it on
 * puts a tag where the title should be on every single Antigravity row.
 */
function agyPromptText(content: string): string {
    const m = /<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i.exec(content);
    return (m ? m[1] : content).trim();
}

/**
 * ‼️ S-46 — WHERE ANTIGRAVITY SAYS WHICH MODEL IT IS RUNNING, AND IT IS NOT A FIELD.
 *
 * S-45 gave every session its `lastModel` and `effort` and did it in the Claude
 * parser only, so an Antigravity conversation came back from a resume as
 * Default/medium whatever it had actually been — the fleet default wearing the
 * session's name. This engine's step log has no model field at all; what it has
 * is a sentence the CLI staples to the USER_INPUT step (measured on this
 * machine, 144 occurrences across 106 conversations):
 *
 *   <USER_SETTINGS_CHANGE>
 *   The user changed setting `Model Selection` from None to Gemini 3.7 Flash (High).
 *   …
 *   </USER_SETTINGS_CHANGE>
 *
 * ‼️ IT NAMES THE HUMAN LABEL, NOT THE ID — and the id is only derivable for
 * the models whose parenthetical is an EFFORT. `Gemini 3.7 Flash (High)` is
 * `gemini-3.7-flash` at `high` and every effort-bearing row in the real catalog
 * follows that rule (measured against `agy models`: 3.7/3.6/3.5 Flash, 3.1 Pro,
 * GPT-OSS 120B — five of five). The rows whose parenthetical is something else
 * do NOT: `Claude Sonnet 4.6 (Thinking)` is `claude-sonnet-4-6` while
 * `Claude Opus 4.6 (Thinking)` is `claude-opus-4-6-thinking`, two identical
 * labels mapping two different ways. So those are left unread rather than
 * guessed — a wrong id is dropped by `narrowLaunch` anyway, and a resume that
 * quietly runs the wrong model is the failure this whole field exists to end.
 *
 * ‼️ THE BACKTICKS ARE PART OF THE PATTERN, and they are load-bearing: the one
 * conversation on this machine that carries this sentence WITHOUT being a
 * setting change is a person quoting it inside a fenced code block, and it uses
 * straight quotes. A quote that reproduces the CLI's own wording exactly would
 * still be read as a change, which is a limit of reading prose and is stated
 * rather than papered over.
 */
// ‼️ THE SENTENCE ENDS AT A FULL STOP FOLLOWED BY SPACE, not at the first dot:
// every model here has a version number in its name (`Gemini 3.7 Flash`) and a
// pattern that stops at any `.` reads it as "Gemini 3".
const AGY_MODEL_SETTING = /changed setting `Model Selection` from .{1,80}? to (.{1,80}?)\.(?=\s|$)/g;

export function agyModelSetting(content: string): { model: string; effort: string } | undefined {
    const text = String(content ?? '');
    if (!text.includes('USER_SETTINGS_CHANGE')) { return undefined; }
    let last = '';
    AGY_MODEL_SETTING.lastIndex = 0;
    for (let m = AGY_MODEL_SETTING.exec(text); m; m = AGY_MODEL_SETTING.exec(text)) {
        last = m[1].trim();
    }
    if (!last || /^none$/i.test(last)) { return undefined; }
    const paren = /^(.*?)\s*\(\s*(low|medium|high)\s*\)$/i.exec(last);
    if (!paren) { return undefined; }
    const model = paren[1].trim().toLowerCase().replace(/\s+/g, '-');
    return model ? { model, effort: paren[2].toLowerCase() } : undefined;
}

/**
 * ‼️ S-47 — THE HALF OF CODEX'S PERMISSION MODE THAT CAN BE READ BACK, AND ONLY
 * THAT HALF.
 *
 * A rollout records the SANDBOX it ran under (`turn_context.sandbox_policy`),
 * not the mode that was picked, and `CODEX_SANDBOX` is many-to-one: `default`
 * and `plan` BOTH become `read-only`. So `read-only` names two different
 * answers and reading it would put a word in the box that the user may never
 * have chosen — a silent decision, which is the one thing this system forbids.
 * The other two invert cleanly and are the ones that matter on a resume, since
 * they are the modes that let a run write.
 *
 * A mode carried back this way is still re-resolved against the folder's own
 * layers on the way out (K-22), so it can never grant more than starting a
 * fresh session there would.
 */
export function codexPermissionFrom(sandbox: string | undefined): string {
    const s = String(sandbox ?? '').trim();
    if (s === 'workspace-write') { return 'acceptEdits'; }
    if (s === 'danger-full-access') { return 'bypassPermissions'; }
    return '';
}

/** One conversation folder → one row, or nothing when the log is unreadable. */
function parseAgyTranscript(
    file: string, id: string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    hints: AgyHints
): SessionInfo | undefined {
    const read = readWhole(file);
    if (!read) { return undefined; }
    if (read.over) { return unreadInfo(file, id, 'agy', read); }
    const lines = (read.text ?? '').split('\n');
    const steps: AgyStep[] = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t) { continue; }
        try { steps.push(JSON.parse(t) as AgyStep); } catch { /* a torn last line */ }
    }
    if (!steps.length) { return undefined; }

    const times = steps.map(s => Date.parse(String(s.created_at ?? ''))).filter(n => n > 0);
    if (!times.length) { return undefined; }
    const firstTs = Math.min(...times), lastTs = Math.max(...times);
    const info = blankInfo(file, id, 'agy', lastTs);
    info.firstTs = firstTs;
    info.lastTs = lastTs;

    let firstPrompt = '';
    let pending: AgyToolCall | undefined;
    // S-46 — what this conversation was actually run on. A set in first-seen
    // order, exactly as every other parser keeps it, and the LAST one seen is
    // the setting a resume inherits (SessionInfo.lastModel).
    const models = new Set<string>();
    let lastModel = '', lastEffort = '';
    // ‼️ S-40 — the conversation unrolled into turns. Antigravity's step log
    // states the boundary (`USER_INPUT`) and the work (announcements, planner
    // prose, tool steps, failures) but publishes NO tokens and NO price, so the
    // money columns of these rows stay at zero rather than borrowing a figure.
    const turn = turnBuilder(info);
    for (const s of steps) {
        const at = Date.parse(String(s.created_at ?? ''));
        const stepTs = at > 0 ? at : 0;
        const failed = agyStepFailed(s);
        if (failed) { info.errors++; }
        if (s.type === 'USER_INPUT') {
            // ‼️ READ BEFORE THE PROMPT IS UNWRAPPED. The settings sentence sits
            // OUTSIDE `<USER_REQUEST>`, so `agyPromptText` has already thrown it
            // away — and a step whose request is empty still carries it.
            const dims = agyModelSetting(String(s.content ?? ''));
            if (dims) {
                models.add(dims.model);
                lastModel = dims.model;
                lastEffort = dims.effort;
            }
            const text = agyPromptText(String(s.content ?? ''));
            if (!text) { continue; }
            info.userTurns++;
            turn.open(text, stepTs);
            if (!firstPrompt) { firstPrompt = text; }
            continue;
        }
        const open = turn.now();
        if (open && failed) { open.errors++; }
        turn.touch(stepTs);
        const announced = agyAnnouncedCall(s);
        if (announced) {
            pending = announced;
            // What it wrote, on the same axis every other engine reports it —
            // read from the ANNOUNCEMENT, which is the only step that has it.
            if (/^(write_to_file|replace_file_content)$/.test(String(announced.name ?? ''))) {
                const f = agyArg(announced.args, 'TargetFile').trim();
                if (f) { info.filesEdited[f] = (info.filesEdited[f] ?? 0) + 1; }
            }
        }
        if (s.type === 'PLANNER_RESPONSE') {
            // An announcement carries no prose; only a step that actually SAID
            // something is a message the model addressed to the reader.
            if (String(s.content ?? '').trim()) {
                info.assistantMsgs++;
                if (open) { open.steps++; }
            }
            continue;
        }
        if (agyIsToolStep(s)) {
            info.toolCalls++;
            const name = agyToolName(s, pending);
            info.tools[name] = (info.tools[name] ?? 0) + 1;
            if (open) { open.tools++; open.steps++; }
            pending = undefined;
        }
    }

    // An engine that never said which model it was on says nothing, rather than
    // the fleet default wearing this session's name (S-45's own rule).
    if (models.size) { info.models = [...models]; }
    if (lastModel) { info.lastModel = lastModel; }
    if (lastEffort) { info.effort = lastEffort; }

    const hint = hints.byId.get(id);
    /**
     * ‼️ `Cwd` ON A CALL IS NOT THE SESSION'S FOLDER, AND USING IT WOULD FILE
     * THE RUN UNDER THE WRONG AGENT. It is where THAT COMMAND ran. Measured on
     * the real store: the daily-backup run lives in `ajanlar\basit` and every
     * one of its `run_command` steps says `D:\zone\agent`, because that is the
     * git root it was told to work in; across the whole store the commonest
     * `Cwd` is `D:\zone\dev\git\miropharm\vsc_AgentFarm` (123 calls), a repo no
     * agent owns. It looks like the answer and it is a different question, so
     * it is deliberately NOT read here.
     *
     * What is left is the CLI's own caches — and, for the runs Agent Farm
     * started itself, the launch binding, which states the folder it spawned in
     * as a RECORD rather than an inference (core/launchBinding.ts).
     */
    const cwd = hint?.cwd || hints.lastCwd.get(id);
    if (cwd) {
        info.cwd = cwd;
        const who = resolveAgent(cwd);
        if (who.agentId) { info.agentId = who.agentId; }
        if (who.agentName) { info.agentName = who.agentName; }
    }
    // The conversation's OWN opening ask first: it is what the run was about,
    // and it is present on every log. The stale index's Preview is the fallback
    // for a conversation whose log the CLI has since pruned to nothing.
    const title = firstPrompt ? conversationTitle(firstPrompt) : (hint?.title ?? '');
    info.title = info.autoTitle = truncate(title || 'Antigravity session', 120);
    if (firstPrompt) { info.firstPrompt = truncate(firstPrompt, FIRST_PROMPT_MAX); }
    return info;
}

/**
 * ‼️ THE ENGINE THAT WAS STRUCTURALLY INVISIBLE (U-26) — AND WENT INVISIBLE
 * AGAIN THE MOMENT THE CLI STOPPED WRITING THE FILE THIS READ (S-37).
 *
 * The first version of this adaptor read the CLI's own index,
 * `cache/conversation_metadata.json`. On 2026-08-16 that file's last write was
 * 2026-08-10 14:17: Antigravity keeps updating it for some paths and not for
 * the headless `--print` runs Agent Farm's tasks and schedules use, so every
 * automated `agy` run since was missing from the Sessions page entirely — no
 * row under any filter — and, because `matchTaskSession` looks a run up in the
 * index, its task lost its transcript link and its launch binding with it.
 *
 * An index a program maintains for its own convenience is not a record; the
 * conversation is. So this reads what the CLI actually writes per run:
 * `brain/<id>/.system_generated/logs/transcript.jsonl`, one JSON step per line
 * — measured on a real headless run, 50 steps carrying `type`, `status`,
 * `created_at` and the text. That gives the id (the folder's own name), the
 * real span, the opening ask as a title, and honest counts of turns, tool calls
 * and errors, none of which the old index carried.
 *
 * Two things it still cannot give, and both are stated rather than invented.
 * The WORKSPACE is not in the step log, so it comes from whichever cache still
 * knows it (`conversation_metadata.json` for old conversations,
 * `last_conversations.json` for the newest one per folder) and a conversation
 * with neither is listed with no agent rather than guessed at. TOKENS and COST
 * are honestly zero: `conversations/<id>.db` holds them as protobuf BLOBs with
 * no schema on disk (measured 2026-08-10), and a fabricated figure in a spend
 * column is worse than a zero that means "this engine does not say".
 */
export function agySessionsSource(
    agyHome: () => string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    /**
     * ‼️ ONE CONVERSATION, ONE ROW. A conversation the Console hosted is
     * written down TWICE — once by the CLI in `brain/`, and once by Agent Farm
     * itself as `external-console-transcripts/<id>.json`, which is the fuller
     * record (it carries the model, the tokens, the cost and a transcript the
     * viewer can open) and the one `farmConsoleSessionsSource` already lists.
     * Reading both would put the same conversation on the table twice, so this
     * source stands aside wherever the mirror exists. Absent = no mirror to
     * check, which is what every test that does not care passes.
     */
    mirrorDir?: () => string,
    cacheMs = 15_000
): SessionSource {
    let cache: SessionInfo[] = [];
    let lastScan = 0;
    // per conversation: the parse, kept while the log has not changed
    const parsed = new Map<string, { sig: string; info?: SessionInfo }>();
    return {
        id: 'agy',
        scan(): SessionInfo[] {
            const home = agyHome();
            if (!home) { return cache = []; }
            const now = Date.now();
            if (now - lastScan < cacheMs && cache.length) { return cache; }
            lastScan = now;
            const brain = path.join(home, 'brain');
            let ids: string[];
            try {
                ids = fs.readdirSync(brain, { withFileTypes: true })
                    .filter(d => d.isDirectory()).map(d => d.name);
            } catch { return cache = []; }

            const cutoff = now - SCAN_DAYS * 24 * 3600 * 1000;
            const hints = readAgyHints(home);
            const mirrored = new Set<string>();
            const mdir = mirrorDir?.();
            if (mdir) {
                try {
                    for (const n of fs.readdirSync(mdir)) {
                        if (n.endsWith('.json')) { mirrored.add(n.slice(0, -5)); }
                    }
                } catch { /* no mirrors yet */ }
            }
            const out: SessionInfo[] = [];
            for (const id of ids) {
                if (mirrored.has(id)) { continue; }
                const file = agyTranscriptFile(brain, id);
                let st: fs.Stats;
                try { st = fs.statSync(file); } catch { continue; }
                if (st.mtimeMs < cutoff) { continue; }
                const sig = `${st.size}:${st.mtimeMs}`;
                const hit = parsed.get(id);
                if (hit && hit.sig === sig) {
                    if (hit.info) { out.push(hit.info); }
                    continue;
                }
                const info = parseAgyTranscript(file, id, resolveAgent, hints);
                parsed.set(id, { sig, info });
                if (info) { out.push(info); }
            }
            for (const id of [...parsed.keys()]) {
                if (!ids.includes(id)) { parsed.delete(id); }
            }
            return cache = out;
        }
    };
}

// ---------------------------------------------------------------------------
// OpenCode — the cached exports the harvester writes (S-33)
// ---------------------------------------------------------------------------

/**
 * ‼️ THE ONE SOURCE HERE WHOSE FILES ARE OURS.
 *
 * Every other adaptor in this module reads a file the engine wrote. OpenCode
 * writes none — its conversations are SQLite and the only readable surfaces are
 * `session list` and `export`, both of which cost a process (A-16). A
 * `SessionSource.scan()` runs on every repaint, so shelling out from here would
 * put a spawn per agent folder behind the Sessions table on a machine that
 * cannot afford it.
 *
 * So `opencodeharvest.ts` runs the CLI on its own slow clock and writes each
 * conversation's export, UNEDITED, into a cache directory; this reads that
 * directory exactly as cheaply as it reads a Codex rollout. The file being the
 * engine's own document is what keeps it honest: it can be held against the CLI.
 *
 * `file` therefore points at OUR copy, not at something OpenCode maintains —
 * which is why `ENGINES.opencode.readableTranscript` stays FALSE. That field
 * answers "does the engine leave a transcript", and it does not.
 */
function parseOpencodeFile(
    file: string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine
): SessionInfo | undefined {
    const read = readWhole(file);
    if (!read) { return undefined; }
    // ‼️ AN EXPORT TOO LARGE TO HOLD IS STILL A SESSION (S-32's rule, and the
    // backlog item asks for it by name). The id is the file's own name, so the
    // row keeps its identity, its file and its time while every figure stays an
    // honest zero behind the `scanLimit` mark.
    if (read.over) { return unreadInfo(file, path.basename(file, '.json'), 'opencode', read); }
    const doc = opencodeExport(read.text ?? '');
    if (!doc) { return undefined; }
    const info = blankInfo(file, doc.id, 'opencode', doc.updated || doc.created);
    info.cwd = doc.directory;
    info.firstTs = doc.created || doc.updated;
    info.lastTs = doc.updated || doc.created;
    info.mtime = info.lastTs;
    info.models = doc.model ? [doc.model] : [];
    /**
     * ‼️ S-47 — AND IT IS THE BARE ID, WHICH IS THE WHOLE DIFFICULTY (K-28).
     *
     * OpenCode names a model `provider/model` everywhere except its own export,
     * where `info.model` is `{ id: "big-pickle", providerID: "opencode" }` and
     * only the id survives. Writing the bare name here is the honest record of
     * what ran; completing it to the spelling the engine publishes is
     * `narrowLaunch`'s job, because the published list is a catalogue this
     * parser does not have and must not guess at.
     */
    if (doc.model) { info.lastModel = doc.model; }
    // ‼️ `reasoning` IS NOT INSIDE `output` ON THIS ENGINE — arithmetic, not
    // opinion: 6196 + 13 + 63 + 1920 = the engine's own total of 8192. Codex is
    // the opposite way round and cost this codebase a bug (X-35), so the sum is
    // written out here rather than left to whoever reads it next.
    info.usage.input = doc.tokens.input;
    info.usage.output = doc.tokens.output + doc.tokens.reasoning;
    info.usage.cacheRead = doc.tokens.cacheRead;
    info.usage.cacheWrite = doc.tokens.cacheWrite;
    info.wTokens = doc.model ? weightedTokens(doc.model, info.usage) : 0;
    // ‼️ THE ENGINE STATES ITS OWN DOLLARS (`costSource: 'cli'`), so no pricing
    // rule is applied and a free model's 0 is a real zero rather than a missing
    // rule. `pricing` is taken for the signature every source here shares and
    // deliberately not used to overwrite a figure the engine published.
    void pricing;
    info.cost = doc.cost;
    // ‼️ S-40 — the export unrolled into turns. OpenCode states more per turn
    // than any other foreign format: the assistant message carries THAT turn's
    // tokens and the price the engine itself published, and its parts say which
    // of the steps were reasoning. The turn opens on exactly what the viewer
    // opens on — text, or an attachment-only message named by its file.
    const turn = turnBuilder(info);
    for (const m of doc.messages) {
        if (m.role === 'user') {
            const text = m.parts.filter(p => p.kind === 'text' && p.text?.trim())
                .map(p => p.text as string).join('\n').trim();
            if (text) { info.userTurns++; }
            const opening = text || m.parts.filter(p => p.kind === 'file')
                .map(p => p.filename || p.text || 'attachment').join(', ');
            if (opening) { turn.open(opening, m.ts); }
            continue;
        }
        const open = turn.now();
        turn.touch(m.endTs || m.ts);
        turn.model(open, m.model || doc.model);
        if (m.parts.some(p => p.kind === 'text' && p.text?.trim())) { info.assistantMsgs++; }
        for (const p of m.parts) {
            if (p.kind === 'text' && p.text?.trim()) { if (open) { open.steps++; } continue; }
            if (p.kind === 'reasoning' && p.text?.trim()) {
                if (open) { open.steps++; open.thinking++; }
                continue;
            }
            // One `step-finish` is one round trip to the model — the same thing
            // `apiCalls` counts on every other engine.
            if (p.kind === 'step-finish') { if (open) { open.apiCalls++; } continue; }
            if (p.kind !== 'tool') { continue; }
            info.toolCalls++;
            const name = p.tool || 'tool';
            info.tools[name] = (info.tools[name] ?? 0) + 1;
            if (open) { open.tools++; open.steps++; }
            if (p.isError) {
                info.errors++;
                if (open) { open.errors++; }
            }
        }
        // ‼️ THE MESSAGE'S OWN SPEND, READ THE SAME WAY THE SESSION TOTAL IS —
        // `reasoning` is NOT inside `output` on this engine (see above), so the
        // two sums are written identically or the row and the table disagree.
        if (open && m.tokens) {
            const u: Usage = {
                input: m.tokens.input,
                output: m.tokens.output + m.tokens.reasoning,
                cacheRead: m.tokens.cacheRead,
                cacheWrite: m.tokens.cacheWrite
            };
            open.tokens += totalTokens(u);
            // What the window HELD when this call ended — the engine's own
            // total, which is what every other Ctx figure in this codebase means.
            if (m.tokens.total > 0) { open.endCtx = m.tokens.total; }
            const model = m.model || doc.model;
            if (model) { open.wTokens += weightedTokens(model, u); }
        }
        // The engine publishes its own dollars; a free model's 0 is a real zero.
        if (open && typeof m.cost === 'number' && m.cost > 0) { open.cost += m.cost; }
    }
    // The window's occupancy after the last call — the last assistant message's
    // own total, which is what every other Ctx cell in this codebase means.
    const lastSpend = [...doc.messages].reverse().find(m => m.role === 'assistant' && m.tokens);
    if (lastSpend?.tokens?.total) { info.lastCtxTokens = lastSpend.tokens.total; }
    info.title = info.autoTitle = truncate(
        opencodeTitle(doc, text => conversationTitle(text)), 120);
    // The conversation's own folder is the attribution, exactly as it is for
    // every other engine — `info.directory` in the export, measured real.
    const who = resolveAgent(doc.directory);
    if (who.agentId) { info.agentId = who.agentId; }
    if (who.agentName) { info.agentName = who.agentName; }
    return info;
}

export function opencodeSessionsSource(
    root: () => string,
    resolveAgent: (cwd?: string) => { agentId?: string; agentName?: string },
    pricing: () => PricingEngine,
    cacheMs = 5_000
): SessionSource {
    return scanWithCache(
        'opencode', () => { const d = root(); return d ? [d] : []; }, ['.json'],
        file => parseOpencodeFile(file, resolveAgent, pricing), cacheMs);
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
