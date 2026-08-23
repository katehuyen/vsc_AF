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
    /**
     * ‼️ U-103 — RESOLVE THE DRAFT WITHOUT STARTING IT. The page keeps no
     * resolver of its own: the effective engine/model/effort/permissions and
     * the origin of each come from the same ladder the run climbs, so the form
     * cannot show one answer while the launch produces another.
     */
    preview(input: Record<string, unknown>): unknown;
    control(action: 'pause' | 'unpause' | 'resume' | 'cancel', runId: string): void;
    /** Run the same spec again / drop a finished run from the history. Both
     *  confirm; both are the sidebar tree's commands, called with a node built
     *  from the store — the page has no way to build one. */
    rerun(runId: string): void;
    remove(runId: string): void;
    answer(runId: string, text: string): void;
    /** ‼️ M-16/U-64 — one-off steer for the next planner boundary. Answers with
     *  the sentence that says WHEN it lands, or why it was refused; the page
     *  shows it verbatim rather than deciding either for itself. */
    guide(runId: string, text: string): { note?: string; error?: string };
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

    /** Open the page ON one run — what "Open" means from a project's Work tab
     *  or a timeline row. `show` paints first; the focus rides in on the next
     *  tick, because a freshly created panel's script has not run yet. */
    static focusRun(deps: MissionsDeps, runId: string): void {
        MissionsPanel.show(deps);
        void MissionsPanel.current?.panel.webview.postMessage({ type: 'focus-run', id: runId });
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
            case 'preview': {
                // ‼️ ANSWERED WITH THE TOKEN THE PAGE SENT. A debounced form
                // fires these faster than they come back, and a stale answer
                // painted over a newer one is precisely the race this feature
                // exists to end — so the page drops anything but the latest.
                void this.panel.webview.postMessage({
                    type: 'preview',
                    seq: typeof msg.seq === 'number' ? msg.seq : 0,
                    preview: this.deps.preview(msg.input as Record<string, unknown>)
                });
                break;
            }
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
            case 'guide':
                if (typeof msg.runId === 'string' && typeof msg.text === 'string') {
                    const out = this.deps.guide(msg.runId, msg.text);
                    void this.panel.webview.postMessage({
                        type: 'guided', runId: msg.runId, note: out.note ?? '', error: out.error ?? ''
                    });
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
            // ‼️ X-95 — this run's whole set of sessions, on the page that is
            // already the right surface for a list of sessions. The scope is a
            // run id and nothing else: the command resolves the title, so this
            // page never has to agree with that one about what a mission is
            // called.
            case 'missionSessions':
                if (typeof msg.runId === 'string' && msg.runId) {
                    void vscode.commands.executeCommand('agentfarm.openSessions', { missionId: msg.runId });
                }
                break;
            case 'openSession':
                // deep-link into the session viewer (planner transcript / live feed rows)
                if (typeof msg.file === 'string' && msg.file) {
                    void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                        typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                }
                break;
            // Reachable only from a row's right-click menu: both ask before
            // they act, and neither belongs on the row as a button.
            case 'rerun':
                if (typeof msg.runId === 'string' && msg.runId) { this.deps.rerun(msg.runId); }
                break;
            case 'delete':
                if (typeof msg.runId === 'string' && msg.runId) { this.deps.remove(msg.runId); }
                break;
            case 'openAgent':
                if (typeof msg.agentId === 'string' && msg.agentId) {
                    void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
                }
                break;
            case 'consoleAgent':
                if (typeof msg.agentId === 'string' && msg.agentId) {
                    void vscode.commands.executeCommand('agentfarm.consoleForAgent', { agentId: msg.agentId });
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
