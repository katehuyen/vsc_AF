import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import {
    WikiDeps, WikiStore, candidateView, editCandidate, lintWiki,
    removeCandidates, startCompileRun, wikiStatus
} from '../core/wiki';

/**
 * U-70 (X-50) — THE WIKI COCKPIT.
 *
 * The candidate pool has had four doors for a while — a badge on a turn, a
 * right-click on a session, the bridge, and a palette command — and no surface
 * that shows it. So the pool was a thing you could add to and never read: you
 * could not see what was waiting, what a mark was about, which run was out for
 * it, or which page a compile actually wrote. This page is that surface, and
 * it is deliberately the SAME acts the bridge has rather than new ones —
 * `core/wiki.ts` holds the bodies (`editCandidate`, `removeCandidates`,
 * `startCompileRun`, `wikiStatus`) and both doors call them.
 *
 * ‼️ THE TWO COMPILE BUTTONS ARE `wiki.compile.run` AND NOTHING ELSE. Starting
 * a run marks nothing compiled (B-14): the run reports back with
 * `wiki.candidates.edit {state:"compiled", pages:[…]}` and that is still the
 * only thing that closes a mark. A row whose run is still alive draws as
 * `compiling` and is not offered again — the refusal comes from the shared
 * body, so the page cannot get it wrong by drawing the button anyway.
 */

export interface WikiPanelDeps {
    extensionUri: vscode.Uri;
    /** The pool. Same object the ops read — the page never keeps its own copy. */
    store: () => WikiStore;
    /** Everything a compile needs to be possible at all (root, sessions, run). */
    wiki: () => WikiDeps;
    /** Open a session's transcript viewer, from a row's session mark. The file
     *  comes with it: a mark keeps the transcript path precisely so a session
     *  that has left the index can still be read. */
    openSession?: (sessionId: string, file: string) => void;
    /** Open a wiki page the compile wrote — the provenance breadcrumb. */
    openDoc?: (filePath: string, mode?: string) => void;
    /** Current doc-open default, for the split-button UI (mirrors the Queue). */
    docOpenConfig?: () => { mode: string; hasCustom: boolean };
    onChange?: () => void;
}

/**
 * A row is the op's row. `candidateView` is what `wiki.candidates.list` prints,
 * plus the two things only the host can answer: is the claimed run still alive
 * (so the row may say `compiling` rather than a stale `pending`), and does the
 * transcript this mark points at still exist.
 */
function buildData(deps: WikiPanelDeps, focus?: string): Record<string, unknown> {
    const w = deps.wiki();
    const status = wikiStatus(w);
    const alive = (id?: string): boolean => !!id && (w.taskAlive ? w.taskAlive(id) : true);
    const rows = [...deps.store().candidates]
        .sort((a, b) => b.addedAt - a.addedAt)
        .map(c => ({
            ...candidateView(c),
            compiling: c.state === 'pending' && alive(c.compileTaskId),
            note: c.note || '',
            fromTurn: c.fromTurn,
            toTurn: c.toTurn
        }));
    return {
        generatedAt: Date.now(),
        candidates: rows,
        status,
        agent: w.defaultAgent ? w.defaultAgent() : '',
        docOpen: deps.docOpenConfig ? deps.docOpenConfig() : { mode: 'vscode', hasCustom: false },
        focus: focus ?? null
    };
}

export class WikiPanel {
    private static current: WikiPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private focus?: string;

    static show(deps: WikiPanelDeps, focus?: string): void {
        if (WikiPanel.current) {
            WikiPanel.current.deps = deps;
            WikiPanel.current.focus = focus;
            WikiPanel.current.panel.reveal();
            WikiPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.wiki',
            'Agent Farm — Wiki',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        WikiPanel.current = new WikiPanel(panel, deps, focus);
    }

    static refreshIfOpen(): void { WikiPanel.current?.refresh(); }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: WikiPanelDeps, focus?: string) {
        this.focus = focus;
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Agent Farm Wiki',
            buildData(this.deps, this.focus),
            'wiki.js'
        );
        this.focus = undefined;   // one-shot: consumed by the first render
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps, this.focus) });
        this.focus = undefined;
    }

    private mutated(): void {
        this.refresh();
        try { this.deps.onChange?.(); } catch { /* badge best-effort */ }
    }

    /** Every refusal the shared bodies raise reaches the person who pressed the
     *  button, in its own words. A page that swallowed them would show a row
     *  that did not change and no reason why. */
    private guard(fn: () => void): void {
        try { fn(); } catch (e) {
            void vscode.window.showWarningMessage('Agent Farm: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    private onMessage(msg: { type: string;[k: string]: unknown }): void {
        switch (msg.type) {
            // ‼️ THE PAGE'S MAIN BUTTON IS THE BRIDGE'S MAIN OP. `ids` is the
            // tick boxes; `all` is "everything still waiting" — the same two
            // selectors the palette command offers, resolved by the same body.
            case 'compile':
                this.guard(() => {
                    const ids = Array.isArray(msg.ids) ? msg.ids.map(String).filter(Boolean) : [];
                    const out = startCompileRun(this.deps.wiki(), ids.length ? { ids } : { all: true });
                    void vscode.window.showInformationMessage(
                        `Agent Farm: ${out.agent} is compiling ${out.marks} mark(s) into the wiki`
                        + (out.started ? '' : ' — the task is queued, start it from Tasks'));
                    this.mutated();
                });
                break;
            case 'edit':
                this.guard(() => {
                    if (typeof msg.id !== 'string' || !msg.id) { return; }
                    editCandidate(this.deps.store(), {
                        id: msg.id,
                        ...(msg.topics !== undefined ? { topics: msg.topics } : {}),
                        ...(msg.note !== undefined ? { note: msg.note } : {}),
                        ...(msg.state !== undefined ? { state: msg.state } : {}),
                        // X-58 — the row's ↻ and its exclusions. Both go through
                        // `editCandidate`, which is the same body `wiki.candidates.edit`
                        // calls: a second implementation of "what clears a
                        // failure" is a second set of rules (U-70).
                        ...(msg.excludeTurns !== undefined ? { excludeTurns: msg.excludeTurns } : {}),
                        ...(msg.retry === true ? { retry: true } : {})
                    });
                    this.mutated();
                });
                break;
            case 'remove':
                this.guard(() => {
                    const ids = Array.isArray(msg.ids) ? msg.ids.map(String).filter(Boolean) : [];
                    if (!ids.length) { return; }
                    removeCandidates(this.deps.store(), { ids });
                    this.mutated();
                });
                break;
            // The shape check of the vault, reported and never repaired
            // (_REF/wiki.md §9). It answers into the page rather than a
            // notification: the findings are a list, and a list belongs on a
            // surface you can read twice.
            case 'lint':
                this.guard(() => {
                    const root = this.deps.wiki().root();
                    void this.panel.webview.postMessage({
                        type: 'lint', data: { root, ...lintWiki(root) }
                    });
                });
                break;
            case 'openSession':
                if (typeof msg.id === 'string' && msg.id) {
                    const mark = this.deps.store().candidates.find(c => c.sessionId === msg.id);
                    try { this.deps.openSession?.(msg.id, mark?.sessionFile ?? ''); } catch { /* best-effort */ }
                }
                break;
            // The provenance breadcrumb. The path comes from the mark's own
            // `pages` (what the compile reported), never from the webview.
            case 'openPage':
                if (typeof msg.id === 'string' && typeof msg.page === 'string') {
                    const c = this.deps.store().get(msg.id);
                    const hit = (c?.pages ?? []).find(p => p === msg.page);
                    if (hit) {
                        try { this.deps.openDoc?.(hit, typeof msg.mode === 'string' ? msg.mode : undefined); }
                        catch { /* best-effort */ }
                    }
                }
                break;
            // The wiki's own files — the root, its law, the index and the log.
            // Same rule: the page names WHICH of the four, the host resolves it.
            case 'openWikiFile':
                this.guard(() => {
                    const s = wikiStatus(this.deps.wiki()).wiki as Record<string, string>;
                    const which = String(msg.which ?? '');
                    const p = which === 'rules' ? s.rules : which === 'index' ? s.index
                        : which === 'log' ? s.log : '';
                    if (p) { this.deps.openDoc?.(p, typeof msg.mode === 'string' ? msg.mode : undefined); }
                });
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
        WikiPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
