import * as fs from 'fs';
import * as http from 'http';
import * as vscode from 'vscode';
import { truncate } from './util';

export type LiveStatus =
    | 'working'            // processing a prompt
    | 'tool'               // executing a tool right now
    | 'waiting-permission' // blocked on a permission dialog
    | 'waiting-input'      // turn done, waiting for the user
    | 'stalled'            // was working, but no events for too long
    | 'idle'
    | 'ended';

export interface LiveSession {
    sessionId: string;
    transcriptPath?: string;
    cwd?: string;
    agentId?: string;
    agentName?: string;
    /** External CLI id (gemini/codex/…), derived from the `cli:<id>:` session_id namespace. */
    source?: string;
    status: LiveStatus;
    currentTool?: string;
    lastPrompt?: string;
    startedAt: number;
    lastEventTs: number;
    prompts: number;
    toolCalls: number;
    errors: number;
    compactions: number;
    subagentStops: number;
    notifiedStuck: boolean;
}

export type LiveEventKind =
    | 'start' | 'prompt' | 'toolStart' | 'toolEnd' | 'permission'
    | 'notify' | 'stop' | 'subagent' | 'compact' | 'end';

export interface LiveEvent {
    ts: number;
    sessionId: string;
    agentId?: string;
    agentName?: string;
    kind: LiveEventKind;
    tool?: string;
    detail?: string;
    transcriptPath?: string;
}

export type ListenerState = 'listening' | 'disabled' | 'port-in-use' | 'error';

interface HookPayload {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_response?: unknown;
    prompt?: string;
    message?: string;
    trigger?: string;
    source?: string;
    reason?: string;
}

export interface LiveConfig {
    enabled: boolean;
    port: number;
    stuckThresholdMs: number;
    notifyPermission: boolean;
    notifyStuck: boolean;
    notifyTurnEnd: boolean;
    /** B4: forward notifications to an external webhook (n8n → Telegram etc.). */
    forward?: (type: string, message: string) => void;
    /**
     * Fires once when a session crosses INTO 'waiting-input' (turn done / YOUR
     * TURN). The host decides which per-agent actions (sound/focus/modal/toast)
     * to run — see the swim-lane toggles in the timeline panel.
     */
    onTurnReady?: (s: LiveSession) => void;
}

// Detail views (≤8h) render from memory; longer ranges are bucketed from the
// on-disk store, so memory only needs to cover the largest detail window.
const MEMORY_WINDOW_MS = 24 * 3600 * 1000;
const MEMORY_MAX_EVENTS = 30_000;
// The JSONL store keeps a month of history for the density views.
const STORE_RETENTION_MS = 31 * 24 * 3600 * 1000;
const STORE_MAX_BYTES = 64 * 1024 * 1024;
const SESSION_TTL_MS = 3 * 3600 * 1000;

/** Per-lane density counts for long timeline ranges: [tools, prompts, alerts, other]. */
export interface DensityLane {
    name: string;
    buckets: [number, number, number, number][];
}

export interface DensityData {
    from: number;
    to: number;
    bucketMs: number;
    lanes: DensityLane[];
    totalEvents: number;
}

/**
 * E2a: sessions opened via "Start Session With…" use namespaced ids
 * (`cli:<cliId>:<agentId>:<ts>`) so they can never collide with claude's UUID
 * session ids. The CLI id is derived from the namespace — claude payloads carry
 * `source` with a different meaning (startup/resume/clear), so it is not used.
 */
export function cliSourceOf(sessionId: string): string | undefined {
    return sessionId.startsWith('cli:') ? (sessionId.split(':')[1] || undefined) : undefined;
}

function toolDetail(input: Record<string, unknown> | undefined): string {
    if (!input) { return ''; }
    const cand = input['file_path'] ?? input['command'] ?? input['description'] ??
        input['pattern'] ?? input['query'] ?? input['url'] ?? input['prompt'] ?? '';
    return truncate(String(cand), 90);
}

export class LiveMonitor implements vscode.Disposable {
    private server?: http.Server;
    private sessionsMap = new Map<string, LiveSession>();
    private eventLog: LiveEvent[] = [];
    private stuckTimer: NodeJS.Timeout;
    private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
    readonly onDidUpdate = this.onDidUpdateEmitter.event;
    private readonly onEventEmitter = new vscode.EventEmitter<LiveEvent>();
    /** Fires for every individual live event (used by hook triggers). */
    readonly onEvent = this.onEventEmitter.event;
    listenerState: ListenerState = 'disabled';
    activePort = 0;

    constructor(
        private getConfig: () => LiveConfig,
        private resolveAgent: (cwd: string | undefined) => { agentId?: string; agentName?: string },
        /** B3 inbound: /trigger/<token> requests land here; return true if a trigger accepted it. */
        private onTrigger?: (token: string, payload: unknown) => boolean,
        /** JSONL file persisting events across reloads (timeline history). */
        private storeFile?: string
    ) {
        this.stuckTimer = setInterval(() => this.checkStuck(), 30_000);
        this.loadStore();
    }

    // ---------- Persistent event store ----------

    private pendingWrites: string[] = [];
    private flushTimer?: NodeJS.Timeout;

    /** Seed memory with the last day of persisted events; prune the store file. */
    private loadStore(): void {
        if (!this.storeFile || !fs.existsSync(this.storeFile)) { return; }
        try {
            const st = fs.statSync(this.storeFile);
            const raw = fs.readFileSync(this.storeFile, 'utf8');
            const cutoff = Date.now() - MEMORY_WINDOW_MS;
            const keepFrom = Date.now() - STORE_RETENTION_MS;
            const keptLines: string[] = [];
            for (const line of raw.split('\n')) {
                if (!line.trim()) { continue; }
                let e: LiveEvent;
                try { e = JSON.parse(line) as LiveEvent; } catch { continue; }
                if (typeof e.ts !== 'number' || !e.kind) { continue; }
                if (e.ts >= keepFrom) { keptLines.push(line); }
                if (e.ts >= cutoff) { this.eventLog.push(e); }
            }
            this.eventLog.sort((a, b) => a.ts - b.ts);
            this.capMemory();
            this.rebuildSessions();
            // Rewrite when the file outgrew retention or size budget.
            if (st.size > STORE_MAX_BYTES || keptLines.length * 1.5 < raw.split('\n').length) {
                fs.writeFileSync(this.storeFile, keptLines.join('\n') + (keptLines.length ? '\n' : ''), 'utf8');
            }
        } catch { /* unreadable store — start fresh */ }
    }

    /**
     * Rebuild the session cards from persisted events so a reload doesn't blank
     * the "Live sessions" list while the lanes still show recent activity.
     * Mirrors handle()'s status transitions; only sessions within the normal
     * TTL are revived, ended ones stay gone, and stale mid-work sessions are
     * marked stalled quietly (no reload-noise notification).
     */
    private rebuildSessions(): void {
        const now = Date.now();
        const cutoff = now - SESSION_TTL_MS;
        for (const e of this.eventLog) {
            if (e.ts < cutoff) { continue; }
            let s = this.sessionsMap.get(e.sessionId);
            if (!s) {
                s = {
                    sessionId: e.sessionId,
                    transcriptPath: e.transcriptPath,
                    agentId: e.agentId,
                    agentName: e.agentName,
                    source: cliSourceOf(e.sessionId),
                    status: 'idle',
                    startedAt: e.ts,
                    lastEventTs: e.ts,
                    prompts: 0,
                    toolCalls: 0,
                    errors: 0,
                    compactions: 0,
                    subagentStops: 0,
                    notifiedStuck: false
                };
                this.sessionsMap.set(e.sessionId, s);
            }
            s.lastEventTs = e.ts;
            if (e.transcriptPath) { s.transcriptPath = e.transcriptPath; }
            switch (e.kind) {
                case 'start': s.status = 'idle'; s.startedAt = e.ts; break;
                case 'prompt': s.status = 'working'; s.prompts++; s.lastPrompt = e.detail; break;
                case 'toolStart': s.status = 'tool'; s.currentTool = e.tool; s.toolCalls++; break;
                case 'toolEnd': s.status = 'working'; s.currentTool = undefined; break;
                case 'permission': s.status = 'waiting-permission'; break;
                case 'stop': s.status = 'waiting-input'; s.currentTool = undefined; break;
                case 'subagent': s.subagentStops++; break;
                case 'compact': s.compactions++; break;
                case 'notify':
                    if (/waiting|input|idle/i.test(e.detail ?? '')) { s.status = 'waiting-input'; }
                    break;
                case 'end': s.status = 'ended'; break;
            }
        }
        const cfg = this.getConfig();
        for (const [id, s] of this.sessionsMap) {
            if (s.status === 'ended') { this.sessionsMap.delete(id); continue; }
            // Mid-work before the reload: either the next hook event refreshes it,
            // or it is long gone — mark it stalled without notifying.
            if ((s.status === 'working' || s.status === 'tool') && now - s.lastEventTs > cfg.stuckThresholdMs) {
                s.status = 'stalled';
                s.notifiedStuck = true;
            }
        }
    }

    private persist(event: LiveEvent): void {
        if (!this.storeFile) { return; }
        this.pendingWrites.push(JSON.stringify(event));
        if (this.flushTimer) { return; }
        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            const chunk = this.pendingWrites.join('\n') + '\n';
            this.pendingWrites = [];
            fs.appendFile(this.storeFile as string, chunk, () => { /* best effort */ });
        }, 2000);
    }

    private capMemory(): void {
        const cutoff = Date.now() - MEMORY_WINDOW_MS;
        let drop = 0;
        while (drop < this.eventLog.length && this.eventLog[drop].ts < cutoff) { drop++; }
        const over = (this.eventLog.length - drop) - MEMORY_MAX_EVENTS;
        if (over > 0) { drop += over; }
        if (drop > 0) { this.eventLog = this.eventLog.slice(drop); }
    }

    /**
     * Long-range density: bucketed per-lane counts read from the persistent
     * store (memory only holds the last day). [tools, prompts, alerts, other].
     */
    density(windowMs: number, bucketCount = 168): DensityData {
        const to = Date.now();
        const from = to - windowMs;
        const bucketMs = windowMs / bucketCount;
        const lanes = new Map<string, [number, number, number, number][]>();
        const laneOf = (name: string) => {
            let l = lanes.get(name);
            if (!l) {
                l = Array.from({ length: bucketCount }, () => [0, 0, 0, 0] as [number, number, number, number]);
                lanes.set(name, l);
            }
            return l;
        };
        let total = 0;
        const add = (e: LiveEvent) => {
            if (e.ts < from || e.ts > to) { return; }
            const bucket = Math.min(bucketCount - 1, Math.floor((e.ts - from) / bucketMs));
            const lane = laneOf(e.agentName ?? e.sessionId.slice(0, 8));
            const slot = e.kind === 'toolStart' || e.kind === 'toolEnd' ? 0
                : e.kind === 'prompt' ? 1
                : e.kind === 'permission' ? 2
                : 3;
            lane[bucket][slot]++;
            total++;
        };
        if (this.storeFile && windowMs > MEMORY_WINDOW_MS && fs.existsSync(this.storeFile)) {
            try {
                const memFrom = this.eventLog.length ? this.eventLog[0].ts : to;
                for (const line of fs.readFileSync(this.storeFile, 'utf8').split('\n')) {
                    if (!line.trim()) { continue; }
                    try {
                        const e = JSON.parse(line) as LiveEvent;
                        // The store also holds what memory holds — avoid double counting.
                        if (typeof e.ts === 'number' && e.ts < memFrom) { add(e); }
                    } catch { /* skip bad line */ }
                }
            } catch { /* unreadable store */ }
        }
        for (const e of this.eventLog) { add(e); }
        return {
            from, to, bucketMs,
            lanes: [...lanes.entries()].map(([name, buckets]) => ({ name, buckets })),
            totalEvents: total
        };
    }

    // ---------- HTTP listener ----------

    start(): void {
        this.stop();
        const cfg = this.getConfig();
        if (!cfg.enabled) {
            this.listenerState = 'disabled';
            this.onDidUpdateEmitter.fire();
            return;
        }
        const server = http.createServer((req, res) => {
            const url = req.url ?? '';
            const isEvent = req.method === 'POST' && url.startsWith('/event');
            const triggerMatch = req.method === 'POST' ? /^\/trigger\/([\w-]+)$/.exec(url.split('?')[0]) : null;
            if (!isEvent && !triggerMatch) {
                res.statusCode = 404;
                res.end();
                return;
            }
            let body = '';
            req.on('data', chunk => {
                body += chunk;
                if (body.length > 1_000_000) { req.destroy(); }
            });
            req.on('end', () => {
                res.setHeader('Content-Type', 'application/json');
                if (triggerMatch) {
                    let payload: unknown;
                    try { payload = body ? JSON.parse(body) : undefined; } catch { payload = body; }
                    const accepted = this.onTrigger?.(triggerMatch[1], payload) ?? false;
                    res.statusCode = accepted ? 200 : 404;
                    res.end(JSON.stringify({ ok: accepted }));
                    return;
                }
                res.statusCode = 200;
                res.end('{}');
                try { this.handle(JSON.parse(body) as HookPayload); } catch { /* malformed hook payload */ }
            });
        });
        server.on('error', (err: NodeJS.ErrnoException) => {
            this.listenerState = err.code === 'EADDRINUSE' ? 'port-in-use' : 'error';
            this.onDidUpdateEmitter.fire();
        });
        server.listen(cfg.port, '127.0.0.1', () => {
            this.listenerState = 'listening';
            this.activePort = cfg.port;
            this.onDidUpdateEmitter.fire();
        });
        this.server = server;
    }

    stop(): void {
        this.server?.close();
        this.server = undefined;
        if (this.listenerState === 'listening') { this.listenerState = 'disabled'; }
    }

    // ---------- Event handling ----------

    /**
     * Display label for a session: the agent name, plus a "#k" ordinal when the
     * same agent has more than one tracked session (ordered by start time), so
     * concurrent sessions of one agent stay distinguishable in notifications,
     * session cards and the needs queue.
     */
    labelOf(s: LiveSession): string {
        const name = s.agentName ?? s.sessionId.slice(0, 8);
        const key = s.agentId ?? s.agentName;
        if (!key) { return name; }
        const siblings = [...this.sessionsMap.values()]
            .filter(o => (o.agentId ?? o.agentName) === key)
            .sort((a, b) => a.startedAt - b.startedAt || a.sessionId.localeCompare(b.sessionId));
        if (siblings.length < 2) { return name; }
        const idx = siblings.findIndex(o => o.sessionId === s.sessionId);
        return idx >= 0 ? `${name} #${idx + 1}` : name;
    }

    private session(payload: HookPayload): LiveSession {
        const id = payload.session_id ?? 'unknown';
        let s = this.sessionsMap.get(id);
        if (!s) {
            const { agentId, agentName } = this.resolveAgent(payload.cwd);
            s = {
                sessionId: id,
                transcriptPath: payload.transcript_path,
                cwd: payload.cwd,
                agentId,
                agentName,
                source: cliSourceOf(id),
                status: 'idle',
                startedAt: Date.now(),
                lastEventTs: Date.now(),
                prompts: 0,
                toolCalls: 0,
                errors: 0,
                compactions: 0,
                subagentStops: 0,
                notifiedStuck: false
            };
            this.sessionsMap.set(id, s);
        }
        if (payload.cwd && !s.cwd) {
            s.cwd = payload.cwd;
            const { agentId, agentName } = this.resolveAgent(payload.cwd);
            s.agentId = agentId;
            s.agentName = agentName;
        }
        if (payload.transcript_path) { s.transcriptPath = payload.transcript_path; }
        return s;
    }

    private push(s: LiveSession, kind: LiveEventKind, tool?: string, detail?: string): void {
        const event: LiveEvent = {
            ts: Date.now(),
            sessionId: s.sessionId,
            agentId: s.agentId,
            agentName: s.agentName,
            kind,
            tool,
            detail,
            transcriptPath: s.transcriptPath
        };
        this.eventLog.push(event);
        this.capMemory();
        this.persist(event);
        this.onEventEmitter.fire(event);
    }

    handle(payload: HookPayload): void {
        const cfg = this.getConfig();
        const s = this.session(payload);
        const now = Date.now();
        s.lastEventTs = now;
        s.notifiedStuck = false;
        const prevStatus = s.status;

        switch (payload.hook_event_name) {
            case 'SessionStart':
                s.status = 'idle';
                s.startedAt = now;
                this.push(s, 'start', undefined, payload.source);
                break;
            case 'UserPromptSubmit':
                s.status = 'working';
                s.prompts++;
                s.lastPrompt = truncate(payload.prompt ?? '', 90);
                this.push(s, 'prompt', undefined, s.lastPrompt);
                break;
            case 'PreToolUse':
                s.status = 'tool';
                s.currentTool = payload.tool_name;
                s.toolCalls++;
                this.push(s, 'toolStart', payload.tool_name, toolDetail(payload.tool_input));
                break;
            case 'PostToolUse':
                s.status = 'working';
                s.currentTool = undefined;
                this.push(s, 'toolEnd', payload.tool_name);
                break;
            case 'Notification': {
                const msg = payload.message ?? '';
                if (/permission|approv|allow/i.test(msg)) {
                    s.status = 'waiting-permission';
                    this.push(s, 'permission', undefined, truncate(msg, 90));
                    cfg.forward?.('permission', `${this.labelOf(s)}: ${truncate(msg, 120)}`);
                    if (cfg.notifyPermission) {
                        this.notify('warn', `${this.labelOf(s)} is waiting for permission`, msg);
                    }
                } else if (/waiting|input|idle/i.test(msg)) {
                    s.status = 'waiting-input';
                    this.push(s, 'notify', undefined, truncate(msg, 90));
                } else {
                    this.push(s, 'notify', undefined, truncate(msg, 90));
                }
                break;
            }
            case 'Stop':
                s.status = 'waiting-input';
                s.currentTool = undefined;
                this.push(s, 'stop');
                if (cfg.notifyTurnEnd) {
                    this.notify('info', `${this.labelOf(s)} finished its turn`, s.lastPrompt ?? '');
                }
                break;
            case 'SubagentStop':
                s.subagentStops++;
                this.push(s, 'subagent');
                break;
            case 'PreCompact':
                s.compactions++;
                this.push(s, 'compact', undefined, payload.trigger);
                break;
            case 'SessionEnd':
                s.status = 'ended';
                s.currentTool = undefined;
                this.push(s, 'end', undefined, payload.reason);
                break;
            default:
                this.push(s, 'notify', undefined, payload.hook_event_name);
        }

        // Edge into YOUR TURN: fire the per-agent turn-ready actions once per
        // transition (covers both the Stop and the "waiting" Notification paths).
        if (s.status === 'waiting-input' && prevStatus !== 'waiting-input') {
            try { cfg.onTurnReady?.(s); } catch { /* best effort — never break event handling */ }
        }

        this.prune(now);
        this.onDidUpdateEmitter.fire();
    }

    private prune(now: number): void {
        for (const [id, s] of this.sessionsMap) {
            const dead = s.status === 'ended' && now - s.lastEventTs > 10 * 60_000;
            const expired = now - s.lastEventTs > SESSION_TTL_MS;
            if (dead || expired) { this.sessionsMap.delete(id); }
        }
    }

    private checkStuck(): void {
        const cfg = this.getConfig();
        const now = Date.now();
        let changed = false;
        for (const s of this.sessionsMap.values()) {
            if ((s.status === 'working' || s.status === 'tool') &&
                now - s.lastEventTs > cfg.stuckThresholdMs) {
                s.status = 'stalled';
                changed = true;
                if (!s.notifiedStuck) {
                    s.notifiedStuck = true;
                    cfg.forward?.('stalled',
                        `${this.labelOf(s)} looks stalled` +
                        (s.currentTool ? ` (last tool: ${s.currentTool})` : ''));
                    if (cfg.notifyStuck) {
                        this.notify(
                            'warn',
                            `${this.labelOf(s)} looks stalled`,
                            `No hook events for ${Math.round((now - s.lastEventTs) / 60000)} min` +
                            (s.currentTool ? ` (last tool: ${s.currentTool})` : '')
                        );
                    }
                }
            }
        }
        if (changed) { this.onDidUpdateEmitter.fire(); }
    }

    private notify(level: 'info' | 'warn', title: string, detail: string): void {
        const show = level === 'warn'
            ? vscode.window.showWarningMessage.bind(vscode.window)
            : vscode.window.showInformationMessage.bind(vscode.window);
        void show(`Agent Farm: ${title}${detail ? ` — ${truncate(detail, 80)}` : ''}`, 'Open Timeline')
            .then(choice => {
                if (choice === 'Open Timeline') {
                    void vscode.commands.executeCommand('agentfarm.openTimeline');
                }
            });
    }

    // ---------- Queries ----------

    sessions(): LiveSession[] {
        return [...this.sessionsMap.values()].sort((a, b) => b.lastEventTs - a.lastEventTs);
    }

    events(windowMs: number): LiveEvent[] {
        const cutoff = Date.now() - windowMs;
        return this.eventLog.filter(e => e.ts >= cutoff);
    }

    hasRecentEvents(windowMs = 30 * 60_000): boolean {
        const last = this.eventLog[this.eventLog.length - 1];
        return !!last && Date.now() - last.ts < windowMs;
    }

    /** Aggregated live status for one agent (highest urgency wins); `sessions` = how many are tracked. */
    agentStatus(agentId: string): { status: LiveStatus; tool?: string; sessions: number } | undefined {
        const rank: Record<LiveStatus, number> = {
            'waiting-permission': 0, stalled: 1, tool: 2, working: 3,
            'waiting-input': 4, idle: 5, ended: 6
        };
        let best: LiveSession | undefined;
        let count = 0;
        for (const s of this.sessionsMap.values()) {
            if (s.agentId !== agentId) { continue; }
            count++;
            if (!best || rank[s.status] < rank[best.status]) { best = s; }
        }
        return best ? { status: best.status, tool: best.currentTool, sessions: count } : undefined;
    }

    waitingCount(): number {
        let n = 0;
        for (const s of this.sessionsMap.values()) {
            if (s.status === 'waiting-permission' || s.status === 'stalled') { n++; }
        }
        return n;
    }

    workingAgentIds(): Set<string> {
        const ids = new Set<string>();
        for (const s of this.sessionsMap.values()) {
            if (s.agentId && (s.status === 'working' || s.status === 'tool')) {
                ids.add(s.agentId);
            }
        }
        return ids;
    }

    dispose(): void {
        this.stop();
        clearInterval(this.stuckTimer);
        if (this.flushTimer) { clearTimeout(this.flushTimer); }
        if (this.storeFile && this.pendingWrites.length) {
            try { fs.appendFileSync(this.storeFile, this.pendingWrites.join('\n') + '\n'); } catch { /* best effort */ }
            this.pendingWrites = [];
        }
        this.onDidUpdateEmitter.dispose();
        this.onEventEmitter.dispose();
    }
}
