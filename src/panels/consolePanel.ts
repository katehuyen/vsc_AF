import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { ConsoleHost } from '../core/consolehost';
import { PERMISSION_GRANTS } from '../core/consoleproto';
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
}

export class ConsolePanel {
    private static current?: ConsolePanel;
    private disposables: vscode.Disposable[] = [];
    private selected?: string;

    static show(deps: ConsoleDeps, opts?: { sessionId?: string; agentId?: string }): void {
        if (ConsolePanel.current) {
            ConsolePanel.current.panel.reveal();
            if (opts?.sessionId) { ConsolePanel.current.selected = opts.sessionId; }
            ConsolePanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.console', 'Console', vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true });
        ConsolePanel.current = new ConsolePanel(panel, deps);
        if (opts?.sessionId) { ConsolePanel.current.selected = opts.sessionId; }
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
        if (!this.selected && hosted.length) { this.selected = hosted[0].id; }
        const d = this.deps.launchDefaults();
        return {
            generatedAt: Date.now(),
            selected: this.selected ?? '',
            // the conversation of the selected session in full; the others as headers
            sessions: hosted.map(s => ({
                id: s.id, agentName: s.agentName, sessionId: s.sessionId ?? '',
                status: s.status, cost: s.costUSD, turns: s.turns, queued: s.queued.length,
                model: s.model ?? '', permissionMode: s.permissionMode,
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
            // the shelf + recent transcripts, to resume one into the Console
            resumable: [
                ...this.deps.index.pinned(),
                ...this.deps.index.all()
                    .filter(s => !s.pinned && !s.isSidechain && !s.machine && s.cwd)
                    .sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime))
                    .slice(0, 15)
            ].slice(0, 25).map(s => ({
                sessionId: s.sessionId, title: s.title, agentName: s.agentName ?? '',
                cwd: s.cwd ?? '', pinned: !!s.pinned, ts: s.lastTs || s.mtime, cost: s.cost
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
                const agent = this.deps.getAgents().find(a => a.name === row.agentName);
                const d = this.deps.launchDefaults();
                this.selected = host.start({
                    agentId: agent?.id ?? '', agentName: row.agentName ?? 'session',
                    cwd: row.cwd, resume: sessionId,
                    model: str('model') || d.model,
                    effort: str('effort') || d.effort,
                    permissionMode: str('permissionMode') || d.permissionMode
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
