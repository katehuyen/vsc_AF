import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import { addUsage, emptyUsage, PricingEngine, totalTokens, Usage } from './pricing';
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

export interface SessionInfo {
    file: string;
    sessionId: string;
    isSidechain: boolean;
    agentId?: string;
    agentName?: string;
    cwd?: string;
    title: string;
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
    errors: number;
    version?: string;
    gitBranch?: string;
    permissionMode?: string;
    daily: Record<string, DailyBucket>;
    /** assistant message counts in 7x24 local-time buckets, index = dow*24+hour */
    heat: number[];
    events: FeedEvent[];
    recentMsgs: RecentMsg[];
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

function toolDetail(input: Record<string, unknown> | undefined): string {
    if (!input) { return ''; }
    const cand = input['file_path'] ?? input['command'] ?? input['description'] ??
        input['pattern'] ?? input['query'] ?? input['url'] ?? input['prompt'] ?? '';
    return truncate(String(cand), 90);
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
        errors: 0,
        daily: {},
        heat: new Array(168).fill(0),
        events: [],
        recentMsgs: []
    };

    const seenUsageKeys = new Set<string>();
    const models = new Set<string>();
    const now = Date.now();

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
            if (typeof content === 'string') {
                if (!line.isMeta && !content.startsWith('<')) {
                    info.userTurns++;
                    if (!info.title) { info.title = truncate(content, 80); }
                    if (ts) {
                        info.events.push({
                            ts, kind: 'prompt', detail: truncate(content, 90), sessionFile: file
                        });
                    }
                }
            } else if (Array.isArray(content)) {
                for (const block of content as { type?: string; is_error?: boolean }[]) {
                    if (block?.type === 'tool_result' && block.is_error) {
                        info.errors++;
                        if (ts) {
                            info.events.push({
                                ts, kind: 'error', detail: 'tool error', sessionFile: file
                            });
                        }
                    }
                }
            }
            continue;
        }

        if (line.type === 'assistant' && line.message) {
            const msg = line.message;
            if (msg.model && msg.model !== '<synthetic>') { models.add(msg.model); }

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
                    : pricing.costFor(msg.model ?? '', u);
                info.cost += msgCost;

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
    if (info.events.length > MAX_EVENTS_PER_FILE) {
        info.events = info.events.slice(-MAX_EVENTS_PER_FILE);
    }
    info.models = [...models];
    return info;
}

export class SessionIndex implements vscode.Disposable {
    private sessions = new Map<string, SessionInfo>();
    private watcher?: fs.FSWatcher;
    private pending = new Map<string, NodeJS.Timeout>();
    private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
    readonly onDidUpdate = this.onDidUpdateEmitter.event;

    constructor(
        private claudeDir: string,
        private pricing: PricingEngine,
        private getAgents: () => AgentInfo[],
        private includeUnmatched: () => boolean,
        private activeThresholdMs: () => number
    ) {}

    get projectsDir(): string {
        return path.join(this.claudeDir, 'projects');
    }

    async scanAll(): Promise<void> {
        this.sessions.clear();
        const projectsDir = this.projectsDir;
        if (!fs.existsSync(projectsDir)) {
            this.onDidUpdateEmitter.fire();
            return;
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
            this.indexFile(file, depth);
        }
        this.onDidUpdateEmitter.fire();
    }

    private indexFile(file: string, depth: number): void {
        const info = parseSessionFile(file, this.pricing, depth);
        if (!info) { this.sessions.delete(file); return; }
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
            info.agentName = 'Other projects';
        }
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
        const projectsDir = this.projectsDir;
        if (!fs.existsSync(projectsDir)) { return; }
        try {
            this.watcher = fs.watch(projectsDir, { recursive: true }, (_event, filename) => {
                if (!filename || !filename.toString().endsWith('.jsonl')) { return; }
                const full = path.join(projectsDir, filename.toString());
                const prev = this.pending.get(full);
                if (prev) { clearTimeout(prev); }
                this.pending.set(full, setTimeout(() => {
                    this.pending.delete(full);
                    const rel = path.relative(projectsDir, full);
                    const depth = rel.split(path.sep).length - 2; // projectDir/file = depth 0
                    if (fs.existsSync(full)) {
                        this.indexFile(full, Math.max(0, depth));
                    } else {
                        this.sessions.delete(full);
                    }
                    this.onDidUpdateEmitter.fire();
                }, 400));
            });
        } catch { /* recursive watch unavailable — refresh stays manual */ }
    }

    all(): SessionInfo[] {
        return [...this.sessions.values()];
    }

    forAgent(agentId: string): SessionInfo[] {
        return this.all().filter(s => s.agentId === agentId);
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

    updatePricing(pricing: PricingEngine): void {
        this.pricing = pricing;
    }

    dispose(): void {
        this.watcher?.close();
        for (const t of this.pending.values()) { clearTimeout(t); }
        this.onDidUpdateEmitter.dispose();
    }
}
