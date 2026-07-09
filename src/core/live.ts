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
}

const MAX_EVENTS = 800;
const SESSION_TTL_MS = 3 * 3600 * 1000;

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
        private onTrigger?: (token: string, payload: unknown) => boolean
    ) {
        this.stuckTimer = setInterval(() => this.checkStuck(), 30_000);
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
        if (this.eventLog.length > MAX_EVENTS) {
            this.eventLog = this.eventLog.slice(-MAX_EVENTS);
        }
        this.onEventEmitter.fire(event);
    }

    handle(payload: HookPayload): void {
        const cfg = this.getConfig();
        const s = this.session(payload);
        const now = Date.now();
        s.lastEventTs = now;
        s.notifiedStuck = false;

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
                    cfg.forward?.('permission', `${s.agentName ?? s.sessionId.slice(0, 8)}: ${truncate(msg, 120)}`);
                    if (cfg.notifyPermission) {
                        this.notify('warn', `${s.agentName ?? s.sessionId.slice(0, 8)} is waiting for permission`, msg);
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
                    this.notify('info', `${s.agentName ?? s.sessionId.slice(0, 8)} finished its turn`, s.lastPrompt ?? '');
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
                        `${s.agentName ?? s.sessionId.slice(0, 8)} looks stalled` +
                        (s.currentTool ? ` (last tool: ${s.currentTool})` : ''));
                    if (cfg.notifyStuck) {
                        this.notify(
                            'warn',
                            `${s.agentName ?? s.sessionId.slice(0, 8)} looks stalled`,
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

    /** Aggregated live status for one agent (highest urgency wins). */
    agentStatus(agentId: string): { status: LiveStatus; tool?: string } | undefined {
        const rank: Record<LiveStatus, number> = {
            'waiting-permission': 0, stalled: 1, tool: 2, working: 3,
            'waiting-input': 4, idle: 5, ended: 6
        };
        let best: LiveSession | undefined;
        for (const s of this.sessionsMap.values()) {
            if (s.agentId !== agentId) { continue; }
            if (!best || rank[s.status] < rank[best.status]) { best = s; }
        }
        return best ? { status: best.status, tool: best.currentTool } : undefined;
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
        this.onDidUpdateEmitter.dispose();
        this.onEventEmitter.dispose();
    }
}
