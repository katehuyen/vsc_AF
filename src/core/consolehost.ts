/**
 * Session host — Agent Farm keeps the conversation, not just the terminal.
 *
 * One long-lived `claude` process per Console session, spoken to over the
 * streaming JSON channel (consoleproto.ts). The user's own CLI and their own
 * subscription: no API key of ours, no separate cost model, and the transcript
 * still lands in `~/.claude/projects`, so every analytic, health and timeline
 * engine keeps working exactly as before.
 *
 * What this class owns: spawning, the stdout line reader, the message queue,
 * interrupts, live permission-mode changes, and a clean death. What it
 * deliberately does NOT own: rendering (the panel), the flag vocabulary
 * (launch.ts) or the protocol (consoleproto.ts).
 */

import * as cp from 'child_process';
import {
    acceptUserText, ConsoleSessionState, controlLine, hostArgs, newSessionState,
    reduceEvent, shiftQueued, userMessageLine
} from './consoleproto';

/**
 * Kill a spawned process AND everything under it.
 *
 * On Windows a `shell: true` spawn gives us `cmd.exe`; `child.kill()` ends the
 * shell and leaves `claude.exe` running forever. `taskkill /T` is what the
 * task and mission runners already use for the same reason.
 */
export function killTree(child: cp.ChildProcess): void {
    const pid = child.pid;
    if (!pid) { return; }
    if (process.platform === 'win32') {
        try {
            cp.execFile('taskkill', ['/PID', String(pid), '/T', '/F'],
                { windowsHide: true }, () => { /* already gone is fine */ });
        } catch { /* fall through to the plain kill below */ }
    }
    try { child.kill(); } catch { /* already gone */ }
}

export interface HostedSessionInit {
    agentId: string;
    agentName: string;
    cwd: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    /** resume an existing claude session instead of starting a new one */
    resume?: string;
    /** first message, sent as soon as the process is up */
    firstPrompt?: string;
}

interface Hosted {
    state: ConsoleSessionState;
    child: cp.ChildProcess;
    buffer: string;
    reqSeq: number;
}

export class ConsoleHost {
    private sessions = new Map<string, Hosted>();
    private seq = 0;
    private listeners: ((id: string) => void)[] = [];

    constructor(
        /** how to run the CLI — 'claude' unless the user overrode it */
        private exe: () => string = () => 'claude'
    ) {}

    onChange(fn: (id: string) => void): { dispose(): void } {
        this.listeners.push(fn);
        return { dispose: () => { this.listeners = this.listeners.filter(f => f !== fn); } };
    }

    private fire(id: string): void {
        for (const fn of this.listeners) { fn(id); }
    }

    list(): ConsoleSessionState[] {
        return [...this.sessions.values()].map(h => h.state).sort((a, b) => b.lastTs - a.lastTs);
    }

    get(id: string): ConsoleSessionState | undefined {
        return this.sessions.get(id)?.state;
    }

    /** Start a hosted session. Returns our id; the CLI's own id arrives later. */
    start(init: HostedSessionInit): string {
        const id = `cs${++this.seq}-${Date.now().toString(36)}`;
        const args = hostArgs(init);
        // shell:true — `claude` is a .cmd shim on Windows. Nothing user-typed
        // reaches the command line: prompts travel on stdin as JSON, and the
        // flag values come from fixed vocabularies (launch.ts).
        const child = cp.spawn(this.exe(), args, {
            cwd: init.cwd, shell: true, windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const hosted: Hosted = {
            state: newSessionState({
                id, agentId: init.agentId, agentName: init.agentName, cwd: init.cwd,
                model: init.model, effort: init.effort, permissionMode: init.permissionMode,
                now: Date.now(),
                // a resumed session already HAS an id — see newSessionState
                sessionId: init.resume
            }),
            child, buffer: '', reqSeq: 0
        };
        this.sessions.set(id, hosted);

        child.stdout?.on('data', d => this.onData(id, String(d)));
        child.stderr?.on('data', d => {
            const text = String(d).trim();
            // The CLI writes progress noise to stderr too; only keep what looks
            // like a real failure, so the conversation is not a log dump.
            if (!text || !/error|fatal|not found|denied/i.test(text)) { return; }
            this.mutate(id, s => ({
                ...s, lastTs: Date.now(),
                messages: [...s.messages, {
                    id: `err-${Date.now().toString(36)}`, ts: Date.now(),
                    role: 'error', text: text.slice(0, 400)
                }]
            }));
        });
        child.on('error', e => {
            this.mutate(id, s => ({
                ...s, status: 'error', exitReason: String((e as Error).message ?? e),
                lastTs: Date.now()
            }));
        });
        child.on('close', code => {
            this.mutate(id, s => ({
                ...s,
                status: s.status === 'error' ? 'error' : 'ended',
                exitReason: s.exitReason ?? (code === 0 ? 'session closed' : `claude exited with code ${code}`),
                lastTs: Date.now()
            }));
        });

        if (init.firstPrompt?.trim()) { this.send(id, init.firstPrompt); }
        return id;
    }

    private mutate(id: string, fn: (s: ConsoleSessionState) => ConsoleSessionState): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        h.state = fn(h.state);
        this.fire(id);
    }

    private onData(id: string, chunk: string): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        h.buffer += chunk;
        const lines = h.buffer.split('\n');
        h.buffer = lines.pop() ?? '';
        let changed = false;
        const now = Date.now();
        for (const line of lines) {
            if (!line.trim()) { continue; }
            let parsed: unknown;
            try { parsed = JSON.parse(line); } catch { continue; }
            const r = reduceEvent(h.state, parsed, now);
            h.state = r.state;
            changed = changed || r.changed;
        }
        if (!changed) { return; }
        // a finished turn releases the next queued message
        if (h.state.status === 'idle' && h.state.queued.length) {
            const next = shiftQueued(h.state);
            h.state = next.state;
            if (next.text) { this.write(id, userMessageLine(next.text)); }
        }
        this.fire(id);
    }

    private write(id: string, line: string): boolean {
        const h = this.sessions.get(id);
        if (!h?.child.stdin || h.child.stdin.destroyed) { return false; }
        try { h.child.stdin.write(line); return true; } catch { return false; }
    }

    /** Send a user message — or queue it when a turn is already running. */
    send(id: string, text: string): { queued: boolean } | undefined {
        const h = this.sessions.get(id);
        if (!h || h.state.status === 'ended' || h.state.status === 'error') { return undefined; }
        const r = acceptUserText(h.state, text, Date.now());
        h.state = r.state;
        if (r.send) { this.write(id, userMessageLine(text.trim())); }
        this.fire(id);
        return { queued: !r.send };
    }

    /** Stop the running turn. The session survives — that is the whole point. */
    interrupt(id: string): boolean {
        const h = this.sessions.get(id);
        if (!h) { return false; }
        return this.write(id, controlLine(`int-${++h.reqSeq}`, 'interrupt'));
    }

    /**
     * Grant (or narrow) what this session may do, live. This is the honest
     * answer to a permission refusal: the CLI never asks the panel anything,
     * so the panel changes the rule and the agent tries again.
     */
    setPermissionMode(id: string, mode: string): boolean {
        const h = this.sessions.get(id);
        if (!h) { return false; }
        return this.write(id, controlLine(`mode-${++h.reqSeq}`, 'set_permission_mode', { mode }));
    }

    /** Drop the queue without touching the running turn. */
    clearQueue(id: string): void {
        this.mutate(id, s => ({ ...s, queued: [] }));
    }

    /**
     * End one session's process — the whole tree.
     *
     * `shell: true` means the child we hold is the shell wrapper, not `claude`
     * itself: killing it leaves the real process running, orphaned, holding its
     * entry in the CLI's session registry. That entry is what tells everyone
     * "this session is open", so a leak here shows up as sessions that stay
     * un-resumable for hours after they were closed. Kill the tree.
     */
    close(id: string): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        try { h.child.stdin?.end(); } catch { /* already gone */ }
        killTree(h.child);
        this.mutate(id, s => ({ ...s, status: 'ended', exitReason: s.exitReason ?? 'closed by you' }));
    }

    /** Forget an ended session (its transcript stays on disk). */
    forget(id: string): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        if (h.state.status !== 'ended' && h.state.status !== 'error') { this.close(id); }
        this.sessions.delete(id);
        this.fire(id);
    }

    dispose(): void {
        for (const id of [...this.sessions.keys()]) { this.close(id); }
        this.sessions.clear();
        this.listeners = [];
    }
}
