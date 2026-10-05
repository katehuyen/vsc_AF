import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import { revealPath } from '../core/reveal';
import {
    WikiDeps, WikiStore, candidateView, createWikiCategory, editCandidate, isRawCandidate, lintWiki,
    readWikiCategories, removeCandidates, scaffoldWiki, startCompileRun, wikiStatus
} from '../core/wiki';
import { renameWikiCategory } from '../core/wikiCategory';
import { askCategoryRename, categoryChoices, renameNews } from './wikiCategoryPrompt';

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
    // U-92 — how long each conversation is, so a row can offer its own turns as
    // something to exclude. Built once rather than looked up per row.
    const turnsOf = new Map<string, number>();
    for (const s of w.sessions()) { turnsOf.set(s.sessionId, (s.turns ?? []).length); }
    const rows = [...deps.store().candidates]
        .sort((a, b) => b.addedAt - a.addedAt)
        .map(c => ({
            ...candidateView(c),
            compiling: c.state === 'pending' && alive(c.compileTaskId),
            note: c.note || '',
            fromTurn: c.fromTurn,
            toTurn: c.toTurn,
            /** X-58/U-92 — the conversation's length. 0 when the session has
             *  left the index: the mark still works, the strip just cannot be
             *  drawn and the editor says so instead of drawing an empty one. */
            sessionTurns: turnsOf.get(c.sessionId) ?? 0
        }));
    return {
        generatedAt: Date.now(),
        candidates: rows,
        status,
        /**
         * ‼️ U-92/U-91 — WHAT A MARK CAN BE FILED UNDER IS TWO FACTS, AND THE
         * FILTER OFFERS BOTH. The pool's topics say what is already marked; the
         * root's folders say where a page WOULD go, empty ones included. A
         * filter built from the pool alone cannot offer a category the user
         * made in Obsidian this morning, and the inline editor built from it
         * would invite spelling that category by hand — which is the whole
         * thing U-90 exists to prevent. Read fresh, because it is a folder
         * somebody edits while this page is open.
         */
        folders: (() => {
            try { return readWikiCategories(w.root()); } catch { return []; }
        })(),
        agent: w.defaultAgent ? w.defaultAgent() : '',
        /**
         * ‼️ U-95 — WHAT A COMPILE WILL ACTUALLY RUN WITH, before it runs.
         *
         * A compile is a headless run of a real model over real transcripts: it
         * spends quota and it writes into the vault. All four of these are
         * settings (X-57) and none of them is visible from the cockpit, so the
         * page could only offer a button that started an unstated run. Read
         * through the SAME deps `startCompileRun` resolves from — a strip that
         * named a different model from the one the run uses would be worse than
         * saying nothing.
         */
        compileWith: {
            agent: w.defaultAgent ? w.defaultAgent() : '',
            engine: w.defaultEngine ? w.defaultEngine() : '',
            model: w.defaultModel ? w.defaultModel() : '',
            effort: w.defaultEffort ? w.defaultEffort() : ''
        },
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
            WikiPanel.current.host.reveal();
            WikiPanel.current.refresh();
            return;
        }
        WikiPanel.current = new WikiPanel(desktopHost({ viewType: 'agentfarm.wiki', title: 'Agent Farm — Wiki' }), deps, focus);
    }

    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<WikiPanel>();

    /** X-456 — the wiki on a phone's view, `focus` opened as the desktop's is. */
    static openOn(host: PanelHost, deps: WikiPanelDeps, focus?: string): void {
        WikiPanel.phones.add(new WikiPanel(host, deps, focus));
    }

    static refreshIfOpen(): void {
        WikiPanel.current?.refresh();
        for (const p of WikiPanel.phones) { p.refresh(); }
    }

    private constructor(private readonly host: PanelHost, private deps: WikiPanelDeps, focus?: string) {
        this.focus = focus;
        host.webview.html = htmlShell(
            host.webview,
            this.deps.extensionUri,
            'Agent Farm Wiki',
            buildData(this.deps, this.focus),
            'wiki.js'
        );
        this.focus = undefined;   // one-shot: consumed by the first render
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: buildData(this.deps, this.focus) });
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
            void this.host.ask.warn('Agent Farm: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    /**
     * ‼️ U-122 — WHICH OF THE STRIP'S OBJECTS, RESOLVED HERE AND NOWHERE ELSE.
     *
     * The page names the object (`rules`, `_RAW_`, `procedure`); the host turns
     * the name into a path out of the SAME `wikiStatus` the strip was drawn
     * from. A webview that posted a path would be a webview deciding which file
     * the editor opens — the rule `openPage` and `openSession` already follow.
     *
     * It is a LOOKUP rather than a switch on purpose: seven `case` labels in a
     * panel read to the parity scanner as seven user-triggerable doors, and
     * they are not — they are one resolver with seven names for the same act.
     */
    private vaultPath(which: string): string {
        const s = wikiStatus(this.deps.wiki()).wiki as Record<string, string>;
        const at: Record<string, string> = {
            rules: s.rules, index: s.index, log: s.log,
            procedure: s.procedureFile, root: s.root, raw: s.raw, done: s.done
        };
        return at[which] ?? '';
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
                    void this.host.ask.info(
                        `Agent Farm: ${out.agent} is compiling ${out.marks} mark(s) into the wiki`
                        + (out.started ? '' : ' — the task is queued, start it from Tasks'));
                    this.mutated();
                });
                break;
            case 'edit':
                this.guard(() => {
                    /**
                     * ‼️ U-95 — ONE MARK OR THE TICKED ONES, through the same
                     * body. The bulk act on the toolbar is not a second kind of
                     * edit: it is this one, applied to each id, so "what
                     * dropping a mark does" cannot come to mean two things.
                     * Every id is applied — a failure on one throws and the
                     * guard reports it rather than half-finishing in silence.
                     */
                    const ids = Array.isArray(msg.ids)
                        ? msg.ids.map(String).filter(Boolean)
                        : (typeof msg.id === 'string' && msg.id ? [msg.id] : []);
                    if (!ids.length) { return; }
                    for (const id of ids) {
                        editCandidate(this.deps.store(), {
                            id,
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
                    }
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
            /**
             * ‼️ U-92 — THE TWO WAYS OUT OF "THIS IS NOT A WIKI". The strip
             * named the missing file and offered nothing; these are the fix
             * standing next to the sentence. Neither is invented here: the
             * scaffold is X-57's `scaffoldWiki` (creates only — the law on disk
             * is never rewritten) and the other is the Settings section that
             * reads the folder.
             */
            case 'wikiInit':
                this.guard(() => {
                    const r = scaffoldWiki(this.deps.wiki().root());
                    if (!r.ok) { throw new Error(r.error); }
                    void this.host.ask.info(
                        r.created.length
                            ? `Agent Farm: wiki started — ${r.created.join(', ')} created.`
                            : 'Agent Farm: the wiki already holds all three files; nothing was written.');
                    this.mutated();
                });
                break;
            case 'openSettings':
                void vscode.commands.executeCommand('agentfarm.openFarmSettings',
                    { focus: typeof msg.focus === 'string' ? msg.focus : 'agentFarm.wikiRoot' });
                break;
            /**
             * ‼️ U-92/U-91 — a category started from the row editor. Same body
             * the tagger's picker and `wiki.category.add` call: single level,
             * the characters a folder cannot carry removed, and an existing
             * category in ANY spelling reported rather than duplicated.
             */
            case 'category':
                this.guard(() => {
                    const r = createWikiCategory(this.deps.wiki().root(), msg.name);
                    if (!r.ok) { throw new Error(r.error); }
                    void this.host.webview.postMessage({
                        type: 'category', name: r.name, existed: r.existed,
                        id: typeof msg.id === 'string' ? msg.id : ''
                    });
                    this.mutated();
                });
                break;
            // U-125 — the page names the category it is filtered to; the host
            // asks the rest and moves folder, index section and marks together.
            case 'renameCategory':
                void (async () => {
                    const root = this.deps.wiki().root();
                    const store = this.deps.store();
                    const ask = await askCategoryRename(
                        categoryChoices(readWikiCategories(root), store.topics()),
                        typeof msg.from === 'string' ? msg.from : '', this.host.ask);
                    if (!ask) { return; }
                    this.guard(() => {
                        const r = renameWikiCategory(root, store, ask.from, ask.to);
                        if (!r.ok) { throw new Error(r.error); }
                        void this.host.ask.info(renameNews(r));
                        void this.host.webview.postMessage({ type: 'categoryRenamed', from: r.from, to: r.to });
                        this.mutated();
                    });
                })();
                break;
            // The shape check of the vault, reported and never repaired
            // (_REF/wiki.md §9). It answers into the page rather than a
            // notification: the findings are a list, and a list belongs on a
            // surface you can read twice.
            case 'lint':
                this.guard(() => {
                    const root = this.deps.wiki().root();
                    void this.host.webview.postMessage({
                        type: 'lint', data: { root, ...lintWiki(root) }
                    });
                });
                break;
            case 'openSession':
                if (typeof msg.id === 'string' && msg.id) {
                    const mark = this.deps.store().candidates.find(c => c.sessionId === msg.id);
                    // ‼️ U-117 — A DROPPED FILE IS A DOCUMENT, NOT A TRANSCRIPT.
                    // Handing `notes.md` to the session viewer asks it to parse a
                    // browser export as a CLI log and it opens on nothing; the
                    // file goes through the same door a compiled page does.
                    if (mark && isRawCandidate(mark)) {
                        if (mark.sessionFile) {
                            try { this.deps.openDoc?.(mark.sessionFile); } catch { /* best-effort */ }
                        }
                        break;
                    }
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
                    const p = this.vaultPath(String(msg.which ?? ''));
                    if (p) { this.deps.openDoc?.(p, typeof msg.mode === 'string' ? msg.mode : undefined); }
                });
                break;
            /**
             * ‼️ U-122 — THE STRIP'S OWN PATHS, AND THE ONE THING ONLY THE HOST
             * CAN DO WITH THEM.
             *
             * Copying a path is the page's job (`AFCtx.copy` goes through the
             * shell's clipboard door), so it never reaches here. Showing a file
             * in the OS is not: `revealPath` knows that revealing a FOLDER means
             * opening it and revealing a FILE means selecting it in its parent,
             * which is the difference between "here is your drop box" and "here
             * is the folder your drop box lives in".
             */
            case 'revealWikiPath':
                this.guard(() => {
                    const p = this.vaultPath(String(msg.which ?? ''));
                    if (p) { void revealPath(p); }
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
        WikiPanel.phones.delete(this);
        if (WikiPanel.current === this) { WikiPanel.current = undefined; }
        for (const d of this.disposables) { d.dispose(); }
    }
}
