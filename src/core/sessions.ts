import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import { addUsage, emptyUsage, PricingEngine, totalTokens, Usage } from './pricing';
import { normalizeMarks, SessionMarks } from './sessionmarks';
import { dayKey, normPath, truncate } from './util';

export interface DailyBucket {
    cost: number;
    usage: Usage;
    assistantMsgs: number;
}

export interface FeedEvent {
    ts: number;
    kind: 'prompt' | 'tool' | 'error';
    tool?: string;
    detail: string;
    sessionFile: string;
    agentId?: string;
    agentName?: string;
}

export interface RecentMsg {
    ts: number;
    tokens: number;
    cost: number;
}

/** Per-turn rollup collected at parse time. A turn opens at each non-sidechain,
 *  non-meta user text message — the same rule the session viewer uses, so turn
 *  numbers and totals here match the viewer's turn table exactly. */
export interface SessionTurn {
    /** 1-based turn number within its session. */
    n: number;
    /** Opening prompt snippet; typed /commands show as the command name. */
    label: string;
    /** Opening prompt time — other surfaces deep-link via openSession(file, ts). */
    ts: number;
    tokens: number;
    cost: number;
    /** Tool calls answered inside this turn (sidechain work bills to the open turn). */
    tools: number;
    /** Tool errors inside this turn. */
    errors: number;
    /** Model(s) that served this turn — can change mid-session. */
    models: string[];
}

export interface SessionInfo {
    file: string;
    sessionId: string;
    isSidechain: boolean;
    /** G6: parent session id for nested subagent transcripts (…/<parentId>/subagents/x.jsonl). */
    parentSessionId?: string;
    /** E1: which machine's claudeDir this session came from (undefined = this machine). */
    machine?: string;
    /** E3: external CLI id (gemini/codex/…) — set only by external SessionSources, never by the claude scan. */
    source?: string;
    agentId?: string;
    agentName?: string;
    cwd?: string;
    title: string;
    /** Title derived from the transcript, kept so clearing a user rename can restore it. */
    autoTitle: string;
    /** Display name the session was started with (`claude -n …`), read from the
     *  CLI's own session registry (cliSessions.ts) — not in the transcript. */
    cliName?: string;
    /** On the user's shelf (sessionmarks.ts): listed first, never cut by a top-N. */
    pinned?: boolean;
    /** User labels on this session — searched by the tables' text filter. */
    tags?: string[];
    firstTs: number;
    lastTs: number;
    mtime: number;
    models: string[];
    usage: Usage;
    cost: number;
    userTurns: number;
    assistantMsgs: number;
    toolCalls: number;
    tools: Record<string, number>;
    /** Skill invocations (Skill tool calls + typed /commands) by skill/command name. */
    skillCalls: Record<string, number>;
    /** Explicit tool touches of memory/<file>.md, by normPath'd full path (recall
     *  signal). Full paths so recalls attribute to the agent whose memory/ folder
     *  was actually read — a session reading ANOTHER agent's memory (or the
     *  ~/.claude auto-memory) must not inflate its own matrix cell. */
    memoryReads: Record<string, number>;
    /** Files this session WROTE to (Edit/Write/MultiEdit/NotebookEdit), by
     *  normPath'd full path → number of write calls. Counted during the one
     *  parse the index already does, so "what did this session touch?" costs
     *  nothing extra; the per-edit detail is read on demand (codeedits.ts). */
    filesEdited: Record<string, number>;
    errors: number;
    version?: string;
    gitBranch?: string;
    permissionMode?: string;
    /** Last time a tool touched the agent's DUTIES.md in this session (duty compliance signal). */
    dutiesReadTs?: number;
    /** Approximate context size after the last assistant reply (prompt + cache + output of the latest request). */
    lastCtxTokens?: number;
    /** How the CLI was entered, verbatim from the transcript: 'cli' (interactive
     *  terminal), 'sdk-cli' (`claude -p` / SDK), 'claude-desktop', … Feeds
     *  `sessionOrigin`; absent on external-CLI sessions that have no transcript. */
    entrypoint?: string;
    /** Agent Farm's Console hosted this session: `sdk-cli` in the transcript, a
     *  person at the keyboard in reality. Set from the id registry, not the file. */
    consoleHosted?: boolean;
    daily: Record<string, DailyBucket>;
    /** assistant message counts in 7x24 local-time buckets, index = dow*24+hour */
    heat: number[];
    events: FeedEvent[];
    recentMsgs: RecentMsg[];
    /** Per-turn rollup, in order — powers the Turns page and the turns.list bridge op. */
    turns: SessionTurn[];
}

/** Who started a session: 'user' = a person at a keyboard, 'auto' = a program. */
export type SessionOrigin = 'user' | 'auto';

/**
 * Read the origin off the transcript's own `entrypoint` field — never guessed
 * from timing or prompt shape. An `sdk-*` entrypoint means a program launched
 * the CLI (a schedule / trigger / task / mission run, or a hand-written
 * `claude -p` one-shot); every other entrypoint is an interactive session a
 * person is sitting in ('cli', 'claude-desktop', …). An unknown entrypoint
 * reads as 'user': the Sessions tables default to the User scope, and a filter
 * that hides real dialogs is worse than one that shows an extra robot row.
 *
 * **The Console is the exception the entrypoint cannot see.** A Console session
 * is a person typing, but it reaches the CLI over the same streaming `-p`
 * channel a headless run does, so its transcript says `sdk-cli` too. Reading
 * only the entrypoint therefore filed every conversation held in the panel
 * under "automation" — and the Sessions tables, the dashboards and the Turns
 * page, which default to the User scope, showed no sign that the conversation
 * had ever happened. Agent Farm knows which ids it hosted (`consoleHosted`,
 * carried in `globalStorage/console-sessions.json`), so it says so.
 */
export function sessionOrigin(s: Pick<SessionInfo, 'entrypoint' | 'consoleHosted'>): SessionOrigin {
    if (s.consoleHosted) { return 'user'; }
    return String(s.entrypoint ?? '').startsWith('sdk') ? 'auto' : 'user';
}

interface JsonlLine {
    type?: string;
    summary?: string;
    isMeta?: boolean;
    isSidechain?: boolean;
    timestamp?: string;
    cwd?: string;
    sessionId?: string;
    version?: string;
    gitBranch?: string;
    permissionMode?: string;
    requestId?: string;
    entrypoint?: string;
    costUSD?: number;
    message?: {
        id?: string;
        role?: string;
        model?: string;
        content?: unknown;
        usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        };
    };
}

const RECENT_MSG_WINDOW_MS = 48 * 3600 * 1000;
const MAX_EVENTS_PER_FILE = 40;

/** Tools that change a file on disk (codeedits.ts parses their inputs in full). */
export const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function toolDetail(input: Record<string, unknown> | undefined): string {
    if (!input) { return ''; }
    const cand = input['file_path'] ?? input['command'] ?? input['description'] ??
        input['pattern'] ?? input['query'] ?? input['url'] ?? input['prompt'] ?? '';
    return truncate(String(cand), 90);
}

/**
 * Session title from a user prompt: skip harness/command noise (XML-ish blocks,
 * slash commands, shell passthrough) so names read like the conversation.
 */
function titleFromPrompt(text: string): string {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t || t.startsWith('<') || t.startsWith('/') || t.startsWith('!')) { return ''; }
    return truncate(t, 80);
}

/** Turn label from its opening prompt: typed /commands show as the command
 *  name, everything else as a whitespace-collapsed snippet (viewer semantics). */
function turnLabel(text: string): string {
    const cmd = /<command-name>([^<]+)<\/command-name>/.exec(text);
    if (cmd) { return cmd[1].trim(); }
    return truncate(text, 90);
}

function textOfContent(content: unknown): string {
    if (typeof content === 'string') { return content; }
    if (Array.isArray(content)) {
        return content
            .filter((b): b is { type: string; text?: string } =>
                !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
            .map(b => b.text ?? '')
            .join('\n');
    }
    return '';
}

export function parseSessionFile(
    file: string,
    pricing: PricingEngine,
    projectDirDepth: number
): SessionInfo | undefined {
    let raw: string;
    let st: fs.Stats;
    try {
        raw = fs.readFileSync(file, 'utf8');
        st = fs.statSync(file);
    } catch { return undefined; }

    const info: SessionInfo = {
        file,
        sessionId: path.basename(file, '.jsonl'),
        isSidechain: projectDirDepth > 0,
        title: '',
        autoTitle: '',
        firstTs: 0,
        lastTs: 0,
        mtime: st.mtimeMs,
        models: [],
        usage: emptyUsage(),
        cost: 0,
        userTurns: 0,
        assistantMsgs: 0,
        toolCalls: 0,
        tools: {},
        skillCalls: {},
        memoryReads: {},
        filesEdited: {},
        errors: 0,
        daily: {},
        heat: new Array(168).fill(0),
        events: [],
        recentMsgs: [],
        turns: []
    };

    const seenUsageKeys = new Set<string>();
    const models = new Set<string>();
    const now = Date.now();
    // Per-turn model sets, parallel to info.turns (materialized as arrays at the end).
    const turnModelSets: Set<string>[] = [];
    const openTurn = (text: string, tsIn: number) => {
        info.turns.push({
            n: info.turns.length + 1, label: turnLabel(text), ts: tsIn,
            tokens: 0, cost: 0, tools: 0, errors: 0, models: []
        });
        turnModelSets.push(new Set());
    };
    const curTurn = () => info.turns.length ? info.turns[info.turns.length - 1] : undefined;

    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: JsonlLine;
        try { line = JSON.parse(lineText); } catch { continue; }

        const ts = line.timestamp ? Date.parse(line.timestamp) : 0;
        if (ts) {
            if (!info.firstTs) { info.firstTs = ts; }
            info.lastTs = Math.max(info.lastTs, ts);
        }
        if (line.cwd && !info.cwd) { info.cwd = line.cwd; }
        if (line.version) { info.version = line.version; }
        if (line.gitBranch) { info.gitBranch = line.gitBranch; }
        if (line.entrypoint && !info.entrypoint) { info.entrypoint = line.entrypoint; }
        if (line.isSidechain) { info.isSidechain = true; }

        if (line.type === 'summary' && line.summary && !info.title) {
            info.title = truncate(line.summary, 80);
            continue;
        }
        if (line.type === 'permission-mode' && line.permissionMode) {
            info.permissionMode = line.permissionMode;
            continue;
        }

        if (line.type === 'user' && line.message) {
            const content = line.message.content;
            const countPrompt = (text: string) => {
                info.userTurns++;
                if (!info.title) { info.title = titleFromPrompt(text); }
                if (ts) {
                    info.events.push({
                        ts, kind: 'prompt', detail: truncate(text, 90), sessionFile: file
                    });
                }
            };
            const countCommand = (text: string) => {
                // Typed /commands land as <command-name>/x</command-name> user messages.
                const m = /<command-name>\/?([\w:-]+)<\/command-name>/.exec(text);
                if (m) { info.skillCalls[m[1]] = (info.skillCalls[m[1]] ?? 0) + 1; }
            };
            if (typeof content === 'string') {
                if (!line.isMeta) {
                    if (!line.isSidechain) { openTurn(content, ts); }
                    if (!content.startsWith('<')) { countPrompt(content); }
                    else { countCommand(content); }
                }
            } else if (Array.isArray(content)) {
                for (const block of content as { type?: string; is_error?: boolean; text?: string }[]) {
                    if (block?.type === 'tool_result' && block.is_error) {
                        info.errors++;
                        const t = curTurn();
                        if (t) { t.errors++; }
                        if (ts) {
                            info.events.push({
                                ts, kind: 'error', detail: 'tool error', sessionFile: file
                            });
                        }
                    } else if (block?.type === 'text' && block.text && !line.isMeta) {
                        // Newer transcripts carry user prompts as text blocks in an array.
                        if (!line.isSidechain) { openTurn(block.text, ts); }
                        if (!block.text.startsWith('<')) { countPrompt(block.text); }
                        else { countCommand(block.text); }
                    }
                }
            }
            continue;
        }

        if (line.type === 'assistant' && line.message) {
            const msg = line.message;
            if (msg.model && msg.model !== '<synthetic>') {
                models.add(msg.model);
                if (turnModelSets.length) { turnModelSets[turnModelSets.length - 1].add(msg.model); }
            }

            if (msg.usage) {
                info.lastCtxTokens = (msg.usage.input_tokens ?? 0) +
                    (msg.usage.cache_read_input_tokens ?? 0) +
                    (msg.usage.cache_creation_input_tokens ?? 0) +
                    (msg.usage.output_tokens ?? 0);
            }

            let msgCost = 0;
            let msgTokens = 0;
            const usageKey = `${msg.id ?? ''}:${line.requestId ?? ''}`;
            const alreadyCounted = usageKey !== ':' && seenUsageKeys.has(usageKey);
            if (!alreadyCounted && msg.usage) {
                if (usageKey !== ':') { seenUsageKeys.add(usageKey); }
                const u: Usage = {
                    input: msg.usage.input_tokens ?? 0,
                    output: msg.usage.output_tokens ?? 0,
                    cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
                    cacheRead: msg.usage.cache_read_input_tokens ?? 0
                };
                addUsage(info.usage, u);
                msgTokens = totalTokens(u);
                msgCost = typeof line.costUSD === 'number'
                    ? line.costUSD
                    : pricing.costFor(msg.model ?? '', u, ts);
                info.cost += msgCost;
                const t = curTurn();
                if (t && (msgTokens || msgCost)) {
                    // Usage bills to the open turn — including sidechain work,
                    // matching the viewer's turn-total accounting.
                    t.tokens += msgTokens;
                    t.cost += msgCost;
                }

                if (ts) {
                    const day = dayKey(ts);
                    const bucket = info.daily[day] ??
                        (info.daily[day] = { cost: 0, usage: emptyUsage(), assistantMsgs: 0 });
                    bucket.cost += msgCost;
                    addUsage(bucket.usage, u);
                    bucket.assistantMsgs++;

                    const d = new Date(ts);
                    info.heat[d.getDay() * 24 + d.getHours()]++;

                    if (now - ts < RECENT_MSG_WINDOW_MS) {
                        info.recentMsgs.push({ ts, tokens: msgTokens, cost: msgCost });
                    }
                }
            }
            info.assistantMsgs++;

            if (Array.isArray(msg.content)) {
                for (const block of msg.content as { type?: string; name?: string; input?: Record<string, unknown> }[]) {
                    if (block?.type === 'tool_use' && block.name) {
                        info.toolCalls++;
                        info.tools[block.name] = (info.tools[block.name] ?? 0) + 1;
                        {
                            const t = curTurn();
                            if (t) { t.tools++; }
                        }
                        if (block.name === 'Skill') {
                            const skillName = String(block.input?.['skill'] ?? '').trim();
                            if (skillName) {
                                info.skillCalls[skillName] = (info.skillCalls[skillName] ?? 0) + 1;
                            }
                        }
                        const filePath = String(block.input?.['file_path'] ?? block.input?.['notebook_path'] ?? '');
                        // What the agent did to the code: every tool that WRITES
                        // a file, counted per file. Reads are deliberately not
                        // here — "touched" would make the column meaningless.
                        if (filePath && WRITE_TOOLS.has(block.name)) {
                            const key = normPath(filePath);
                            info.filesEdited[key] = (info.filesEdited[key] ?? 0) + 1;
                        }
                        if (ts && filePath.toUpperCase().includes('DUTIES.MD')) {
                            info.dutiesReadTs = Math.max(info.dutiesReadTs ?? 0, ts);
                        }
                        // Memory recall signal: any tool explicitly touching a
                        // file inside a memory/ folder (Read/Edit/Write/…).
                        // Keyed by full normalized path — memusage attributes it
                        // to the agent whose folder it is, not to whoever read it.
                        if (/[\\/]memory[\\/][^\\/]+\.md$/i.test(filePath)) {
                            const key = normPath(filePath);
                            info.memoryReads[key] = (info.memoryReads[key] ?? 0) + 1;
                        }
                        if (ts) {
                            info.events.push({
                                ts, kind: 'tool', tool: block.name,
                                detail: toolDetail(block.input), sessionFile: file
                            });
                        }
                    }
                }
            }
        }
    }

    if (!info.title) {
        info.title = info.isSidechain ? 'Subagent task' : '(untitled session)';
    }
    info.autoTitle = info.title;
    if (info.events.length > MAX_EVENTS_PER_FILE) {
        info.events = info.events.slice(-MAX_EVENTS_PER_FILE);
    }
    info.models = [...models];
    info.turns.forEach((t, i) => { t.models = [...turnModelSets[i]]; });
    return info;
}

export interface ClaudeDirRef {
    /** machine label shown on sessions; undefined = this machine. */
    name?: string;
    dir: string;
}

export class SessionIndex implements vscode.Disposable {
    private sessions = new Map<string, SessionInfo>();
    /** User-set session names (sessionId → title), persisted by the extension. */
    private titleOverrides = new Map<string, string>();
    /** User shelf marks (sessionId → pin/tags), persisted by the extension. */
    private marks: SessionMarks = {};
    /** Session ids the Console hosted — see setConsoleSessions. */
    private consoleIds = new Set<string>();
    /** Session display names from the CLI's registry (sessionId → -n name). */
    private cliNames = new Map<string, string>();
    private watchers: fs.FSWatcher[] = [];
    private pending = new Map<string, NodeJS.Timeout>();
    private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
    readonly onDidUpdate = this.onDidUpdateEmitter.event;
    /** E1: configured extra dirs whose projects folder was not found on the last scan. */
    missingDirs: string[] = [];

    constructor(
        private claudeDir: string,
        /** E1: additional (synced) claude dirs from other machines. */
        private extraDirs: () => ClaudeDirRef[],
        private pricing: PricingEngine,
        private getAgents: () => AgentInfo[],
        private includeUnmatched: () => boolean,
        private activeThresholdMs: () => number
    ) {}

    get projectsDir(): string {
        return path.join(this.claudeDir, 'projects');
    }

    private allDirs(): ClaudeDirRef[] {
        return [{ dir: this.claudeDir }, ...this.extraDirs().filter(d => d?.dir)];
    }

    async scanAll(): Promise<void> {
        this.sessions.clear();
        this.missingDirs = [];
        for (const ref of this.allDirs()) {
            const projectsDir = path.join(ref.dir, 'projects');
            if (!fs.existsSync(projectsDir)) {
                if (ref.name) { this.missingDirs.push(ref.dir); }
                continue;
            }
            const files: { file: string; depth: number }[] = [];
            const walk = (dir: string, depth: number) => {
                let entries: fs.Dirent[] = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const e of entries) {
                    const p = path.join(dir, e.name);
                    if (e.isDirectory()) {
                        if (depth < 3) { walk(p, depth + 1); }
                    } else if (e.name.endsWith('.jsonl')) {
                        files.push({ file: p, depth });
                    }
                }
            };
            let projectDirs: fs.Dirent[] = [];
            try { projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { /* ignore */ }
            for (const d of projectDirs) {
                if (d.isDirectory()) { walk(path.join(projectsDir, d.name), 0); }
            }
            for (const { file, depth } of files) {
                this.indexFile(file, depth, ref.name);
            }
        }
        this.onDidUpdateEmitter.fire();
    }

    private indexFile(file: string, depth: number, machine?: string): void {
        const info = parseSessionFile(file, this.pricing, depth);
        if (!info) { this.sessions.delete(file); return; }
        info.machine = machine;
        if (depth > 0) {
            // …/<projectDir>/<parentSessionId>/(subagents/)…/file.jsonl
            const segments = file.split(/[\\/]/);
            info.parentSessionId = segments[segments.length - 1 - depth];
        }
        this.applyTitle(info);
        this.applyMark(info);
        this.assignAgent(info);
        if (!info.agentId && !this.includeUnmatched()) {
            // Keep it out of the index but remember nothing: farm-focused scope.
            this.sessions.delete(file);
            return;
        }
        for (const ev of info.events) {
            ev.agentId = info.agentId;
            ev.agentName = info.agentName;
        }
        this.sessions.set(file, info);
    }

    private assignAgent(info: SessionInfo): void {
        if (!info.cwd) { return; }
        const cwd = normPath(info.cwd);
        let best: AgentInfo | undefined;
        for (const agent of this.getAgents()) {
            if (cwd === agent.normDir || cwd.startsWith(agent.normDir + '/')) {
                if (!best || agent.normDir.length > best.normDir.length) { best = agent; }
            }
        }
        if (best) {
            info.agentId = best.id;
            info.agentName = best.name;
        } else if (this.includeUnmatched()) {
            info.agentName = info.machine ? `Other projects (${info.machine})` : 'Other projects';
        }
    }

    /**
     * A session's title has three sources, in this order:
     *   1. the user's own rename — an explicit decision, always wins;
     *   2. the name it was STARTED with (`claude -n …`, from the CLI registry) —
     *      naming a session at launch has to mean something afterwards;
     *   3. the title derived from the first real prompt in the transcript.
     */
    private applyTitle(info: SessionInfo): void {
        info.cliName = this.cliNames.get(info.sessionId);
        info.title = this.titleOverrides.get(info.sessionId) ?? info.cliName ?? info.autoTitle;
    }

    /** Replace the user-set session names and re-apply them to everything indexed. */
    setTitleOverrides(map: Record<string, string>): void {
        this.titleOverrides = new Map(
            Object.entries(map).filter(([, v]) => typeof v === 'string' && v.trim()));
        for (const s of this.sessions.values()) { this.applyTitle(s); }
        this.onDidUpdateEmitter.fire();
    }

    /** Replace the launch names read from the CLI's session registry. */
    setCliNames(map: Record<string, string>): void {
        this.cliNames = new Map(
            Object.entries(map).filter(([, v]) => typeof v === 'string' && v.trim()));
        for (const s of this.sessions.values()) { this.applyTitle(s); }
        for (const s of this.externalList) { this.applyTitle(s); }
        this.onDidUpdateEmitter.fire();
    }

    private applyMark(info: SessionInfo): void {
        const mark = this.marks[info.sessionId];
        info.pinned = mark?.pinned === true ? true : undefined;
        info.tags = mark?.tags?.length ? mark.tags : undefined;
        info.consoleHosted = this.consoleIds.has(info.sessionId) ? true : undefined;
    }

    /**
     * The sessions Agent Farm's own Console hosted. Their transcripts say
     * `sdk-cli` like any headless run, so without this list every conversation
     * held in the panel would be filed as automation and hidden from the User
     * scope the tables default to (see `sessionOrigin`).
     */
    setConsoleSessions(ids: string[]): void {
        const next = new Set(ids.filter(Boolean));
        if (next.size === this.consoleIds.size && [...next].every(id => this.consoleIds.has(id))) {
            return;
        }
        this.consoleIds = next;
        for (const s of this.sessions.values()) { this.applyMark(s); }
        this.onDidUpdateEmitter.fire();
    }

    /** Replace the shelf marks (pin / tags) and re-apply them to everything indexed. */
    setMarks(map: unknown): void {
        this.marks = normalizeMarks(map);
        for (const s of this.sessions.values()) { this.applyMark(s); }
        for (const s of this.externalList) { this.applyMark(s); }
        this.onDidUpdateEmitter.fire();
    }

    /** Pinned sessions, newest activity first — the shelf. */
    pinned(): SessionInfo[] {
        return [...this.all(), ...this.externalList]
            .filter(s => s.pinned)
            .sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime));
    }

    /** Re-run agent assignment after agents were re-discovered. */
    reassignAgents(): void {
        for (const info of this.sessions.values()) {
            info.agentId = undefined;
            info.agentName = undefined;
            this.assignAgent(info);
            for (const ev of info.events) {
                ev.agentId = info.agentId;
                ev.agentName = info.agentName;
            }
        }
        this.onDidUpdateEmitter.fire();
    }

    watch(): void {
        for (const w of this.watchers) { try { w.close(); } catch { /* already closed */ } }
        this.watchers = [];
        for (const ref of this.allDirs()) {
            const projectsDir = path.join(ref.dir, 'projects');
            if (!fs.existsSync(projectsDir)) { continue; }
            try {
                const watcher = fs.watch(projectsDir, { recursive: true }, (_event, filename) => {
                    if (!filename || !filename.toString().endsWith('.jsonl')) { return; }
                    const full = path.join(projectsDir, filename.toString());
                    const prev = this.pending.get(full);
                    if (prev) { clearTimeout(prev); }
                    this.pending.set(full, setTimeout(() => {
                        this.pending.delete(full);
                        const rel = path.relative(projectsDir, full);
                        const depth = rel.split(path.sep).length - 2; // projectDir/file = depth 0
                        if (fs.existsSync(full)) {
                            this.indexFile(full, Math.max(0, depth), ref.name);
                        } else {
                            this.sessions.delete(full);
                        }
                        this.onDidUpdateEmitter.fire();
                    }, 400));
                });
                this.watchers.push(watcher);
            } catch { /* recursive watch unavailable — refresh stays manual */ }
        }
    }

    all(): SessionInfo[] {
        return [...this.sessions.values()];
    }

    forAgent(agentId: string): SessionInfo[] {
        return this.all().filter(s => s.agentId === agentId);
    }

    // ---- E3: externally-sourced sessions (other CLIs) ----
    // Deliberately a side list: all()/forAgent() stay claude-only, so the many
    // claude-specific consumers (health, mcp/skill/memory usage, reports,
    // search, OTLP, …) structurally never see foreign sessions. UI surfaces
    // that want them ask for external() explicitly.

    private externalList: SessionInfo[] = [];
    private externalSig = '';

    setExternal(sessions: SessionInfo[]): void {
        const sig = sessions.map(s => `${s.sessionId}:${s.lastTs}:${s.userTurns}:${s.toolCalls}`).join('|');
        if (sig === this.externalSig) { return; }
        this.externalSig = sig;
        this.externalList = sessions;
        for (const s of this.externalList) { this.applyMark(s); }
        this.onDidUpdateEmitter.fire();
    }

    external(): SessionInfo[] {
        return this.externalList;
    }

    externalForAgent(agentId: string): SessionInfo[] {
        return this.externalList.filter(s => s.agentId === agentId);
    }

    isSessionActive(s: SessionInfo, now = Date.now()): boolean {
        return now - s.mtime < this.activeThresholdMs();
    }

    isAgentActive(agentId: string, now = Date.now()): boolean {
        return this.forAgent(agentId).some(s => this.isSessionActive(s, now));
    }

    activeAgentIds(now = Date.now()): Set<string> {
        const ids = new Set<string>();
        for (const s of this.sessions.values()) {
            if (s.agentId && this.isSessionActive(s, now)) { ids.add(s.agentId); }
        }
        return ids;
    }

    latestSessionForAgent(agentId: string): SessionInfo | undefined {
        return this.forAgent(agentId).sort((a, b) => b.mtime - a.mtime)[0];
    }

    /** G6: sessions that head a tree — no parent, or the parent transcript is gone. */
    topLevel(): SessionInfo[] {
        const ids = new Set(this.all().map(s => s.sessionId));
        return this.all().filter(s => !s.parentSessionId || !ids.has(s.parentSessionId));
    }

    /** G6: direct subagent sessions of a parent session. */
    childrenOf(sessionId: string): SessionInfo[] {
        return this.all()
            .filter(s => s.parentSessionId === sessionId)
            .sort((a, b) => a.firstTs - b.firstTs);
    }

    /** G6: cost/count of a session's whole subagent tree (self excluded), max 5 levels. */
    subtreeRollup(sessionId: string, depth = 0): { cost: number; count: number } {
        if (depth >= 5) { return { cost: 0, count: 0 }; }
        let cost = 0, count = 0;
        for (const child of this.childrenOf(sessionId)) {
            const sub = this.subtreeRollup(child.sessionId, depth + 1);
            cost += child.cost + sub.cost;
            count += 1 + sub.count;
        }
        return { cost, count };
    }

    feed(limit = 60): FeedEvent[] {
        const events: FeedEvent[] = [];
        for (const s of this.sessions.values()) { events.push(...s.events); }
        events.sort((a, b) => b.ts - a.ts);
        return events.slice(0, limit);
    }

    /** Usage within the trailing 5-hour window (subscription pacing approximation). */
    windowUsage(now = Date.now()): { tokens: number; cost: number; msgs: number; windowStart: number } {
        const windowStart = now - 5 * 3600 * 1000;
        let tokens = 0, cost = 0, msgs = 0;
        for (const s of this.sessions.values()) {
            for (const m of s.recentMsgs) {
                if (m.ts >= windowStart) {
                    tokens += m.tokens;
                    cost += m.cost;
                    msgs++;
                }
            }
        }
        return { tokens, cost, msgs, windowStart };
    }

    /** Usage since a user-set lap mark (trip meter). Sources recentMsgs, so it only sees the last 48h. */
    lapUsage(sinceTs: number): { tokens: number; cost: number; msgs: number } {
        let tokens = 0, cost = 0, msgs = 0;
        for (const s of this.sessions.values()) {
            for (const m of s.recentMsgs) {
                if (m.ts >= sinceTs) {
                    tokens += m.tokens;
                    cost += m.cost;
                    msgs++;
                }
            }
        }
        return { tokens, cost, msgs };
    }

    updatePricing(pricing: PricingEngine): void {
        this.pricing = pricing;
    }

    dispose(): void {
        for (const w of this.watchers) { try { w.close(); } catch { /* already closed */ } }
        for (const t of this.pending.values()) { clearTimeout(t); }
        this.onDidUpdateEmitter.dispose();
    }
}
