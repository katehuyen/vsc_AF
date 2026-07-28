import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { ConsoleHost } from '../core/consolehost';
import { ConsoleMessage, PERMISSION_GRANTS } from '../core/consoleproto';
import { EFFORT_CHOICES, modelChoices, PERMISSION_CHOICES } from '../core/launch';
import { SessionIndex } from '../core/sessions';
import { handleAfNav, htmlShell } from './base';

/**
 * DALGA 1 — the Console: the panel stops being a window onto the terminal and
 * becomes a place you can talk in.
 *
 * Left: the sessions this window is hosting, plus your shelf and the recent
 * transcripts (a click resumes one *into* the Console). Right: the
 * conversation and a composer whose controls are the launcher's own vocabulary
 * — agent · model · effort · permission mode — except that here the permission
 * mode is live: when a tool is refused, the same control grants it and the
 * agent retries. Nothing about this is a mock: every row comes from a real
 * `claude` process this window owns.
 */

export interface ConsoleDeps {
    extensionUri: vscode.Uri;
    host: ConsoleHost;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    modelAliases(): string[];
    launchDefaults(): { model?: string; effort?: string; permissionMode?: string };
    /**
     * Which sessions a live process already owns (the CLI's own registry).
     *
     * This is what stops the Console from telling a lie: `claude --resume <id>`
     * on a session that is already open in a terminal starts a SECOND process
     * on the same transcript. Both write to it, neither sees the other's
     * turns, and Agent Farm would show the interleaved result as one
     * conversation that no participant actually had.
     */
    liveOwners(): { sessionId: string; pid: number; entrypoint?: string; status?: string; cwd?: string }[];
    /** the conversation a session already had, off its transcript — display
     *  only, so a resume opens where you left off instead of on a blank page */
    history(sessionId: string): ConsoleMessage[];
}

export class ConsolePanel {
    private static current?: ConsolePanel;
    private disposables: vscode.Disposable[] = [];
    private selected?: string;
    /** agent to preselect in the composer (opened from an agent row) */
    private presetAgent?: string;

    static show(deps: ConsoleDeps, opts?: { sessionId?: string; agentId?: string }): void {
        if (ConsolePanel.current) {
            ConsolePanel.current.panel.reveal();
            if (opts?.sessionId) { ConsolePanel.current.selected = opts.sessionId; }
            if (opts?.agentId) {
                // "talk to THIS agent": composer mode, nothing spawned yet
                ConsolePanel.current.presetAgent = opts.agentId;
                ConsolePanel.current.selected = '';
            }
            ConsolePanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.console', 'Console', vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true });
        ConsolePanel.current = new ConsolePanel(panel, deps);
        if (opts?.sessionId) { ConsolePanel.current.selected = opts.sessionId; }
        if (opts?.agentId) {
            ConsolePanel.current.presetAgent = opts.agentId;
            ConsolePanel.current.selected = '';
        }
        ConsolePanel.current.refresh();
    }

    /** Live update while the panel is open (the host fires on every event). */
    static refreshIfOpen(): void {
        ConsolePanel.current?.refresh();
    }

    private constructor(private panel: vscode.WebviewPanel, private deps: ConsoleDeps) {
        panel.webview.html = htmlShell(panel.webview, deps.extensionUri,
            'Console', this.data(), 'console.js');
        panel.webview.onDidReceiveMessage(m => void this.onMessage(m), null, this.disposables);
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.disposables.push(deps.host.onChange(() => this.refresh()));
    }

    private data(): Record<string, unknown> {
        const hosted = this.deps.host.list();
        if (this.selected && !hosted.some(s => s.id === this.selected)) { this.selected = undefined; }
        // An explicit "new session" (selected === '') is respected; only an
        // unset selection falls back to the newest hosted session.
        if (this.selected === undefined && hosted.length) { this.selected = hosted[0].id; }
        const d = this.deps.launchDefaults();
        const preset = this.presetAgent;
        this.presetAgent = undefined;   // one-shot: it seeds the picker once
        return {
            generatedAt: Date.now(),
            selected: this.selected ?? '',
            presetAgent: preset ?? '',
            // the conversation of the selected session in full; the others as headers
            sessions: hosted.map(s => ({
                id: s.id, agentName: s.agentName, sessionId: s.sessionId ?? '', cwd: s.cwd,
                // the session's own title — the same one the side panel and the
                // viewer show, so a rename anywhere is a rename everywhere
                title: (s.sessionId
                    ? this.deps.index.all().find(x => x.sessionId === s.sessionId)?.title
                    : undefined) ?? '',
                status: s.status, cost: s.costUSD, turns: s.turns, queued: s.queued.length,
                tokens: s.tokens, model: s.model ?? '', permissionMode: s.permissionMode,
                contextTokens: s.contextTokens ?? 0, lastTs: s.lastTs,
                pendingPermission: s.pendingPermission ?? null,
                exitReason: s.exitReason ?? '',
                messages: s.id === this.selected ? s.messages.slice(-400) : []
            })),
            agents: this.deps.getAgents().map(a => ({ id: a.id, name: a.name, dir: a.dir })),
            models: modelChoices(this.deps.modelAliases()),
            efforts: EFFORT_CHOICES,
            permissions: PERMISSION_CHOICES,
            grants: PERMISSION_GRANTS,
            defaults: { model: d.model ?? '', effort: d.effort ?? '', permissionMode: d.permissionMode ?? '' },
            // sessions a live process owns right now — the resume list marks
            // them instead of offering a second process on the same transcript
            owned: this.deps.liveOwners().map(o => o.sessionId),
            // the shelf + recent transcripts, to resume one into the Console
            resumable: [
                ...this.deps.index.pinned(),
                ...this.deps.index.all()
                    .filter(s => !s.pinned && !s.isSidechain && !s.machine && s.cwd)
                    .sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime))
                    .slice(0, 15)
            ].slice(0, 25).map(s => ({
                sessionId: s.sessionId, title: s.title, agentName: s.agentName ?? '',
                cwd: s.cwd ?? '', pinned: !!s.pinned, ts: s.lastTs || s.mtime, cost: s.cost,
                // "Ctx now" — the same figure the sessions tables show, so a row
                // says what resuming it would cost you in window before you do
                contextTokens: s.lastCtxTokens ?? 0
            }))
        };
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.data() });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const host = this.deps.host;
        const str = (k: string) => (typeof msg[k] === 'string' ? msg[k] as string : '');
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'select':
                this.selected = str('id');
                this.refresh();
                break;
            case 'start': {
                const agent = this.agentById(str('agentId'));
                if (!agent) {
                    void vscode.window.showWarningMessage('Agent Farm: pick an agent first.');
                    return;
                }
                const d = this.deps.launchDefaults();
                this.selected = host.start({
                    agentId: agent.id, agentName: agent.name, cwd: agent.dir,
                    model: str('model') || d.model,
                    effort: str('effort') || d.effort,
                    permissionMode: str('permissionMode') || d.permissionMode,
                    firstPrompt: str('text') || undefined
                });
                this.refresh();
                break;
            }
            case 'resume': {
                const sessionId = str('sessionId');
                const row = this.deps.index.all().find(s => s.sessionId === sessionId);
                if (!row?.cwd) { return; }
                // The guard that makes "same session" true instead of a story:
                // if a process already owns this session id, resuming would
                // start a second one on the same transcript.
                const owner = this.deps.liveOwners().find(o => o.sessionId === sessionId);
                if (owner) {
                    const where = owner.entrypoint === 'sdk-cli'
                        ? 'a program (a Console session or a headless run)'
                        : 'a terminal';
                    const choice = await vscode.window.showWarningMessage(
                        `That session is open right now in ${where} (pid ${owner.pid}).\n\n` +
                        'Claude Code cannot join a running session: resuming it here would start a SECOND process on the same transcript. ' +
                        'Both would write to it and neither would see the other\'s turns — it would look like one conversation that nobody actually had.',
                        { modal: true },
                        'Jump to that terminal', 'New session in the same folder');
                    if (choice === 'Jump to that terminal') {
                        void vscode.commands.executeCommand('agentfarm.focusSessionTerminal',
                            { sessionId, agentName: row.agentName, cwd: row.cwd });
                        return;
                    }
                    if (choice !== 'New session in the same folder') { return; }
                    const agentForNew = this.deps.getAgents().find(a => a.name === row.agentName);
                    const dn = this.deps.launchDefaults();
                    this.selected = host.start({
                        agentId: agentForNew?.id ?? '', agentName: row.agentName ?? 'session',
                        cwd: row.cwd,
                        model: str('model') || dn.model,
                        effort: str('effort') || dn.effort,
                        permissionMode: str('permissionMode') || dn.permissionMode
                    });
                    this.refresh();
                    return;
                }
                const agent = this.deps.getAgents().find(a => a.name === row.agentName);
                const d = this.deps.launchDefaults();
                this.selected = host.start({
                    agentId: agent?.id ?? '', agentName: row.agentName ?? 'session',
                    cwd: row.cwd, resume: sessionId,
                    model: str('model') || d.model,
                    effort: str('effort') || d.effort,
                    permissionMode: str('permissionMode') || d.permissionMode,
                    // resume means CONTINUE: what was said comes back with it
                    history: this.deps.history(sessionId)
                });
                this.refresh();
                break;
            }
            case 'send': {
                const r = host.send(str('id'), str('text'));
                if (!r) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: that session has ended — start a new one to keep talking.');
                }
                break;
            }
            case 'interrupt':
                host.interrupt(str('id'));
                break;
            case 'permissionMode':
                // The honest grant: no dialog is answered, the session's rule is
                // changed and the agent is asked to try again.
                if (host.setPermissionMode(str('id'), str('mode')) && msg.retry === true) {
                    host.send(str('id'), 'Permission granted — please retry the action you were refused.');
                }
                break;
            case 'clearQueue':
                host.clearQueue(str('id'));
                break;
            case 'close':
                host.close(str('id'));
                break;
            case 'forget':
                host.forget(str('id'));
                break;
            case 'openFile':
                void vscode.commands.executeCommand('agentfarm.openEditedFile',
                    { file: str('file'), diff: msg.diff === true });
                break;
            // Renaming a Console row goes through VS Code's own right-click menu
            // (`webview/context` → agentfarm.renameSession), which is why there
            // is no 'rename' message here: the row carries its identity in
            // `data-vscode-context` and the command does the rest.
            case 'openTranscript': {
                const row = this.deps.index.all().find(s => s.sessionId === str('sessionId'));
                if (row) { void vscode.commands.executeCommand('agentfarm.openSession', row.file); }
                break;
            }
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav': handleAfNav(msg.to); break;
        }
    }

    private dispose(): void {
        ConsolePanel.current = undefined;
        // The sessions deliberately OUTLIVE the panel: closing a tab must not
        // kill a conversation. They end with the window, or when you close them.
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}
