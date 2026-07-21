import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';

/** Everything the Missions page needs from the extension host. The panel is a
 *  thin shell: state lives in the MissionStore/engines; this only routes. */
export interface MissionsDeps {
    extensionUri: vscode.Uri;
    /** Full page payload: specs, runs (with live step statuses), agents, defaults, pending waits. */
    data(): Record<string, unknown>;
    /** Validate + start a new mission; error string when the form is bad. */
    create(input: Record<string, unknown>): string | undefined;
    control(action: 'pause' | 'unpause' | 'resume' | 'cancel', runId: string): void;
    answer(runId: string, text: string): void;
    settleApproval(runId: string, ok: boolean): void;
    pickFolder(): Thenable<string | undefined>;
    /** Live-tail of an archived task output (last KBs only) for the expanded
     *  step's output box; undefined = file unreadable/outside the outputs dir. */
    readTail(file: string): { text: string; size: number } | undefined;
    /** Fires on any mission/task state change — the page refreshes live. */
    onDidChange: vscode.Event<void>;
}

export class MissionsPanel {
    private static current: MissionsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: MissionsDeps, opts?: { newForm?: boolean }): void {
        if (MissionsPanel.current) {
            MissionsPanel.current.panel.reveal();
            if (opts?.newForm) {
                void MissionsPanel.current.panel.webview.postMessage({ type: 'openForm' });
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.missions',
            'Agent Farm — Missions',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        MissionsPanel.current = new MissionsPanel(panel, deps, opts?.newForm);
    }

    static refreshIfOpen(): void {
        MissionsPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: MissionsDeps, newForm?: boolean) {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Missions',
            { ...this.deps.data(), newForm: !!newForm },
            'missions.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        deps.onDidChange(() => this.refresh(), null, this.disposables);
    }

    private refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.deps.data() });
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'create': {
                const error = this.deps.create(msg.input as Record<string, unknown>);
                if (error) {
                    void this.panel.webview.postMessage({ type: 'formError', error });
                } else {
                    void this.panel.webview.postMessage({ type: 'created' });
                    this.refresh();
                }
                break;
            }
            case 'control': {
                const action = String(msg.action ?? '');
                const runId = String(msg.runId ?? '');
                if (!runId || (action !== 'pause' && action !== 'unpause' && action !== 'resume' && action !== 'cancel')) { break; }
                if (action === 'cancel') {
                    const pick = await vscode.window.showWarningMessage(
                        'Cancel this mission? Running delegations are cancelled too.',
                        { modal: true }, 'Cancel mission');
                    if (pick !== 'Cancel mission') { break; }
                }
                this.deps.control(action, runId);
                this.refresh();
                break;
            }
            case 'answer':
                if (typeof msg.runId === 'string' && typeof msg.text === 'string') {
                    this.deps.answer(msg.runId, msg.text);
                    this.refresh();
                }
                break;
            case 'approve':
            case 'reject':
                if (typeof msg.runId === 'string') {
                    this.deps.settleApproval(msg.runId, msg.type === 'approve');
                    this.refresh();
                }
                break;
            case 'pickFolder': {
                const dir = await this.deps.pickFolder();
                if (dir) { void this.panel.webview.postMessage({ type: 'folder', path: dir }); }
                break;
            }
            case 'openFile':
                if (typeof msg.file === 'string' && msg.file) {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.file));
                }
                break;
            case 'tail': {
                // polled by the expanded running step — answer even when the
                // file is gone so the box can say so instead of spinning
                const file = String(msg.file ?? '');
                if (!file) { break; }
                const t = this.deps.readTail(file);
                void this.panel.webview.postMessage({
                    type: 'tail', file, text: t?.text ?? '', size: t?.size ?? 0, missing: !t
                });
                break;
            }
            case 'openSession':
                // deep-link into the session viewer (planner transcript / live feed rows)
                if (typeof msg.file === 'string' && msg.file) {
                    void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                        typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                }
                break;
            case 'openAgent':
                if (typeof msg.agentId === 'string' && msg.agentId) {
                    void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
                }
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'refresh':
                this.refresh();
                break;
        }
    }

    private dispose(): void {
        MissionsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
