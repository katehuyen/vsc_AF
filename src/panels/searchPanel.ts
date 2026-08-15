import * as vscode from 'vscode';
import {
    searchMemory, searchLiveEvents,
    SearchResult, SearchRole, SearchableSession, ParseForeign, isSearchRole
} from '../core/search';
import { TextSearchService, isAborted } from '../core/textSearchCorpus';
import { SessionIndex, SessionInfo, sessionOrigin } from '../core/sessions';
import { ENGINES } from '../core/consoleEngine';
import { handleAfNav, htmlShell } from './base';

export interface SearchDeps {
    extensionUri: vscode.Uri;
    index: SessionIndex;
    getAgentNames(): string[];
    /** S5: the agents' memory/*.md notes, for the memory source. */
    getMemoryFiles(): { file: string; agentName: string }[];
    /** S5: persisted live-event store path, for the events source. */
    liveEventsFile(): string;
    /** D4 semantic layer — undefined when embeddings are off. */
    semanticSearch(query: string, sessionIds?: string[]): Promise<SearchResult>;
    semanticStatus(): { provider: string; sessions: number; chunks: number };
    /** Project name resolved for this individual session. */
    projectOf?(session: SessionInfo): string;
    /** X-35: how to read a transcript this engine's scanner cannot (cliViewer). */
    parseForeign?: ParseForeign;
    /** X-42: the ONE corpus service — the same instance the bridge op uses, so
     *  the page and an agent never build two indexes of the same transcripts. */
    textSearch: TextSearchService;
}

/** Pre-scoping passed by the surface that opened the panel (viewer → this
 *  session, agent page → this agent, dashboard → fleet). */
export interface SearchPreset {
    agentName?: string;
    file?: string;
    title?: string;
}

/** The word the Project axis uses for a session that belongs to no project.
 *  Same string as the Sessions tables (media/sessionsTable.js). */
const UNASSIGNED = 'Unassigned';

/**
 * ‼️ X-24 — THE FILTERS ARE A SESSION FILTER, NOT A RESULT FILTER.
 *
 * The complaint was that a page whose whole subject is finding things offered
 * one axis (a date) while "everything there is to know about a session" —
 * which agent, which engine, which project, which model, who started it,
 * whether it is a subagent lane — sat unusable in the index. They narrow the
 * SET THAT IS SCANNED rather than sieving hits afterwards, which is both
 * honest (the "n sessions scanned" figure means what it says) and cheaper.
 */
export interface SessionFilters {
    /** null / absent = every agent (incl. unassigned); [] = none. */
    agents?: string[] | null;
    /** engine ids — 'claude' | 'codex' | 'gemini' | 'agy' | anything a profile set. */
    engines?: string[] | null;
    /** project names, `Unassigned` for the sessions that belong to none. */
    projects?: string[] | null;
    /** model ids, exactly as the session records them. */
    models?: string[] | null;
    /** '' = both · 'user' = a person started it · 'auto' = an automation run. */
    origin?: string;
    /** '' = both · 'main' = no subagent lanes · 'sub' = only them. */
    lane?: string;
    pinnedOnly?: boolean;
    errorsOnly?: boolean;
    /** X-34: a session id, an id prefix, a transcript path, or part of a title. */
    session?: string;
}

/** Projects/models come from the pool. Engine filters also carry every built-in
 *  engine even before its first session exists: filtering is a choice of what
 *  the product can read, not a census that hides Gemini on a quiet day. Any
 *  external profile id found in the pool is added beside these four. */
interface SearchFacets {
    agents: string[];
    engines: string[];
    projects: string[];
    models: string[];
}

/** What X-34 answers with: the one session an id (or a path) points at. */
interface SessionRef {
    sessionId: string;
    file: string;
    title: string;
    agentName: string;
    engine: string;
    ts: number;
}

export const engineOf = (s: SessionInfo): string => s.source ?? 'claude';
/** One product engine registry, one Search filter list. Exported so a regression
 *  test can prove Search did not quietly lose an engine again. */
export const BUILTIN_SEARCH_ENGINES = Object.keys(ENGINES);

/** Model ids without the vendor prefix every one of them carries — the same
 *  shortening the tables show, so the picker and the cell agree. */
export const modelsOf = (s: SessionInfo): string[] =>
    (s.models ?? []).filter(Boolean).map(m => String(m).replace(/^claude-/, ''));

const has = (list: string[] | null | undefined, v: string): boolean =>
    !list ? true : list.includes(v);

/**
 * The sessions a search may look at, after the filters.
 *
 * ‼️ ONE FUNCTION, BOTH DOORS. The page and the `search.transcripts` bridge op
 * ask the same question, and a second copy of these rules would answer it
 * differently within a month — an agent told "only Codex sessions with errors"
 * would get a different set from the person who typed it into the panel. So the
 * panel calls this and so does the op.
 */
export function scopeSessions(
    pool: SessionInfo[], f: SessionFilters, projectOf: (s: SessionInfo) => string
): SessionInfo[] {
    const origin = f.origin === 'user' || f.origin === 'auto' ? f.origin : '';
    const lane = f.lane === 'main' || f.lane === 'sub' ? f.lane : '';
    const session = (f.session ?? '').trim().toLowerCase();
    return pool.filter(s => {
        if (!has(f.agents, s.agentName ?? '')) { return false; }
        if (!has(f.engines, engineOf(s))) { return false; }
        if (!has(f.projects, projectOf(s))) { return false; }
        if (f.models && !modelsOf(s).some(m => f.models?.includes(m))) { return false; }
        if (origin && sessionOrigin(s) !== origin) { return false; }
        if (lane === 'main' && s.isSidechain) { return false; }
        if (lane === 'sub' && !s.isSidechain) { return false; }
        if (f.pinnedOnly && !s.pinned) { return false; }
        if (f.errorsOnly && !(s.errors > 0)) { return false; }
        if (session) {
            // ‼️ X-34 — an id, part of one, a path, or part of a title. The
            // 8-character prefix is the form this extension prints everywhere
            // ("4d361981#1"), so it must be the form that finds.
            const hay = `${s.sessionId} ${s.title} ${s.file}`.toLowerCase();
            if (!hay.includes(session)) { return false; }
        }
        return true;
    });
}

/** The shape the engine scans, out of the index's own rows. */
export function searchableSessions(
    list: SessionInfo[], projectOf?: (s: SessionInfo) => string
): SearchableSession[] {
    return list.map(s => ({
        file: s.file,
        agentName: s.agentName,
        title: s.title,
        mtime: s.mtime,
        sessionId: s.sessionId,
        engine: engineOf(s),
        isSidechain: s.isSidechain,
        ...(projectOf ? { project: projectOf(s) } : {})
    }));
}

/** D4 — full-fleet transcript search panel ("which agent did I discuss this with?"). */
export class SearchPanel {
    private static current: SearchPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /**
     * ‼️ LATEST WINS, AND THE LOSER STOPS (X-42). The page re-runs half a second
     * after a keystroke, so a sentence typed at speed used to queue four full
     * fleet scans on the host — each paid for in full — while the webview's
     * `seq` merely declined to DRAW the three it no longer wanted. The token
     * below is what actually stops them; `seq` stays as the last guard.
     */
    private running: { aborted: boolean } | undefined;

    static show(deps: SearchDeps, preset?: SearchPreset): void {
        if (SearchPanel.current) {
            SearchPanel.current.panel.reveal();
            if (preset) {
                void SearchPanel.current.panel.webview.postMessage({ type: 'preset', preset });
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.search',
            'Agent Farm — Search',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        SearchPanel.current = new SearchPanel(panel, deps, preset);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: SearchDeps, preset?: SearchPreset) {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Search',
            {
                agents: this.deps.getAgentNames(),
                facets: this.facets(),
                semantic: this.deps.semanticStatus(),
                preset: preset ?? null
            },
            'search.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    /**
     * ‼️ EVERY ENGINE (X-27 / X-35). `index.all()` is claude-only by design —
     * it feeds the analytics — and the Search page is a READING surface, not a
     * measurement. Searching a four-engine fleet and being answered about one
     * of them is the defect this call fixes; the sessions it adds carry honest
     * zeros for cost, which nothing here divides by.
     */
    private pool(): SessionInfo[] {
        return this.deps.index.allWithExternal();
    }

    private projectOf(s: SessionInfo): string {
        return this.deps.projectOf?.(s) || UNASSIGNED;
    }

    private facets(): SearchFacets {
        const agents = new Set<string>();
        const engines = new Set<string>(BUILTIN_SEARCH_ENGINES);
        const projects = new Set<string>();
        const models = new Set<string>();
        for (const s of this.pool()) {
            if (s.agentName) { agents.add(s.agentName); }
            engines.add(engineOf(s));
            projects.add(this.projectOf(s));
            for (const m of modelsOf(s)) { models.add(m); }
        }
        const abc = (a: string, b: string) => a.localeCompare(b);
        return {
            agents: [...agents].sort(abc),
            // Claude first — it is the default and the longest lane — then the
            // rest alphabetically, the order every other engine picker uses.
            engines: [...engines].sort((a, b) => a === 'claude' ? -1 : b === 'claude' ? 1 : abc(a, b)),
            // Named projects first, Unassigned last: it is a leftover, not a project.
            projects: [...projects].sort((a, b) =>
                a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : abc(a, b)),
            models: [...models].sort(abc)
        };
    }

    /**
     * X-34 — "I know the id, take me there."
     *
     * A full id, an id PREFIX (six characters or more, because that is the
     * form printed on every track chip and every log line), or a transcript
     * path. It never narrows the search: the banner is drawn ABOVE the results
     * and the text keeps searching as text, since an id pasted into the box is
     * as often "where was this mentioned" as "open it".
     */
    private resolveRef(text: string): SessionRef | null {
        const q = String(text ?? '').trim().toLowerCase();
        if (q.length < 6) { return null; }
        const pool = this.pool();
        const asRef = (s: SessionInfo): SessionRef => ({
            sessionId: s.sessionId, file: s.file, title: s.title,
            agentName: s.agentName ?? '', engine: engineOf(s), ts: s.lastTs || s.mtime || 0
        });
        const exact = pool.find(s => s.sessionId.toLowerCase() === q)
            ?? pool.find(s => s.file.toLowerCase() === q);
        if (exact) { return asRef(exact); }
        // A prefix must point at ONE session: two candidates is not an answer,
        // and offering the first of them would be a coin toss wearing a link.
        const starts = pool.filter(s => s.sessionId.toLowerCase().startsWith(q));
        return starts.length === 1 ? asRef(starts[0]) : null;
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'search': {
                const query = String(msg.query ?? '');
                const f = (msg.filters && typeof msg.filters === 'object'
                    ? msg.filters : {}) as SessionFilters;
                // Agent picker: null/absent = all agents (no filter — unassigned
                // sessions included); an array = exactly that set ([] = none).
                const agentNames = Array.isArray(msg.agents)
                    ? (msg.agents as unknown[]).filter((a): a is string => typeof a === 'string')
                    : undefined;
                const file = typeof msg.file === 'string' && msg.file ? msg.file : undefined;
                const roles = Array.isArray(msg.roles) && msg.roles.length
                    ? msg.roles.filter(isSearchRole)
                    : undefined;
                const seq = typeof msg.seq === 'number' ? msg.seq : 0;
                // Whatever was running answers a question that is no longer in
                // the box. Stop it before starting this one.
                if (this.running) { this.running.aborted = true; }
                const token = { aborted: false };
                this.running = token;
                let result: SearchResult;
                if (msg.semantic) {
                    const filters: SessionFilters = {
                        ...f,
                        agents: agentNames === undefined ? f.agents : agentNames
                    };
                    let scoped = scopeSessions(this.pool(), filters, s => this.projectOf(s));
                    if (file) { scoped = scoped.filter(s => s.file === file); }
                    // Restrict the vector pool before top-k ranking. Filtering
                    // twenty global hits afterwards silently loses valid hits.
                    result = await this.deps.semanticSearch(query, scoped.map(s => s.sessionId));
                    const byId = new Map(scoped.map(s => [s.sessionId, s]));
                    result.hits = result.hits.map(h => {
                        const s = h.sessionId ? byId.get(h.sessionId) : undefined;
                        return s ? {
                            ...h,
                            engine: engineOf(s),
                            sessionTs: s.lastTs || s.mtime,
                            project: this.projectOf(s)
                        } : h;
                    });
                } else {
                    // The agent picker is one of the filters; it arrives on its
                    // own key for compatibility with every surface that presets
                    // this page, so it is merged in rather than duplicated.
                    const filters: SessionFilters = {
                        ...f,
                        agents: agentNames === undefined ? f.agents : agentNames
                    };
                    const scoped = scopeSessions(this.pool(), filters, s => this.projectOf(s));
                    const sessions = searchableSessions(scoped, s => this.projectOf(s));
                    // The date window is the MESSAGE's own time (core/search.ts
                    // tsFrom/tsTo), not the session's mtime: "what was said on
                    // Tuesday" and "sessions last written to on Tuesday" are
                    // different questions, and the page asks the first one.
                    const ms = (v: unknown): number | undefined =>
                        typeof v === 'number' && v > 0 ? v : undefined;
                    const opts = {
                        regex: !!msg.regex,
                        caseSensitive: !!msg.caseSensitive,
                        wholeWord: !!msg.wholeWord,
                        // the set is already narrowed above; agentNames here
                        // would apply the same cut twice and disagree on the
                        // "unassigned" case
                        roles,
                        tsFrom: ms(msg.tsFrom),
                        tsTo: ms(msg.tsTo),
                        files: file ? [file] : undefined,
                        // a single session can take many more hits than a fleet scan
                        maxHits: file ? 400 : 250,
                        maxPerFile: file ? 400 : 12,
                        parseForeign: this.deps.parseForeign
                    };
                    try {
                        result = await this.deps.textSearch.search(sessions, query, {
                            ...opts,
                            signal: token,
                            // The first build of a 664 MB corpus is a visible
                            // event, not a pause to be hidden: the page says how
                            // far it has got and never presents a partial answer.
                            onProgress: (done, total) => {
                                if (token.aborted) { return; }
                                void this.panel.webview.postMessage({
                                    type: 'progress', seq, done, total
                                });
                            }
                        });
                    } catch (e) {
                        // A superseded search posts nothing at all — the page is
                        // already waiting for the one that replaced it.
                        if (isAborted(e)) { return; }
                        throw e;
                    }
                    // S5 sources ride along unless the scope is a single session
                    // (that session's content is fully covered by the scan above).
                    // They have no engine/project/lane of their own, so only the
                    // agent set applies to them.
                    const srcOpts = { ...opts, agentNames: filters.agents ?? undefined };
                    if (!file && msg.memory !== false) {
                        result.hits.push(...searchMemory(this.deps.getMemoryFiles(), query, srcOpts));
                    }
                    if (!file && msg.events !== false) {
                        result.hits.push(...searchLiveEvents(this.deps.liveEventsFile(), query, srcOpts));
                    }
                    const extras = result.hits.length - result.matchesShown;
                    if (extras > 0) {
                        result.matchesFound += extras;
                        result.matchesShown += extras;
                    }
                }
                if (token.aborted) { return; }
                if (this.running === token) { this.running = undefined; }
                void this.panel.webview.postMessage({
                    type: 'results', result, query: msg.query,
                    // echoed back so the page can drop results of a superseded
                    // search (auto-search fires on every control change)
                    seq,
                    semanticStatus: this.deps.semanticStatus(),
                    facets: this.facets(),
                    // X-34: the id in the box (or in the Session filter), resolved
                    idMatch: this.resolveRef(String(f.session || '') || query)
                });
                break;
            }
            case 'openSession':
                // ts = matched message time — the viewer scrolls right to it.
                // roles = what this search was looking IN, so the transcript
                // opens in the same view rather than throwing every tool call
                // in front of somebody who asked about the conversation.
                void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined,
                    Array.isArray(msg.roles)
                        ? (msg.roles as unknown[]).filter((r): r is string => typeof r === 'string')
                        : undefined);
                break;
            case 'openFile':
                if (typeof msg.file === 'string' && msg.file) {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.file));
                }
                break;
            case 'openTimeline':
                void vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'findSession':
                void vscode.commands.executeCommand('agentfarm.findSession',
                    typeof msg.q === 'string' ? msg.q : undefined);
                break;
            case 'buildIndex':
                void vscode.commands.executeCommand('agentfarm.buildSemanticIndex');
                break;
            case 'openFarmSettings':
                void vscode.commands.executeCommand('agentfarm.openFarmSettings',
                    typeof msg.focus === 'string' ? { focus: msg.focus } : undefined);
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
        }
    }

    private dispose(): void {
        SearchPanel.current = undefined;
        // A closed panel has nothing to answer; the scan it left running would
        // otherwise keep the host busy for a page nobody is looking at.
        if (this.running) { this.running.aborted = true; this.running = undefined; }
        for (const d of this.disposables) { d.dispose(); }
    }
}

/**
 * The session an id / path / phrase points at, and the candidates when it
 * points at several — shared by the `findSession` command and the
 * `sessions.find` bridge op so the two can never answer differently (X-34).
 */
export function findSessions(
    pool: SessionInfo[], q: string, limit = 20
): SessionInfo[] {
    const needle = String(q ?? '').trim().toLowerCase();
    if (!needle) {
        return pool.slice().sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime)).slice(0, limit);
    }
    const score = (s: SessionInfo): number => {
        const id = s.sessionId.toLowerCase();
        if (id === needle) { return 0; }
        if (id.startsWith(needle)) { return 1; }
        if (id.includes(needle)) { return 2; }
        if (s.file.toLowerCase().includes(needle)) { return 3; }
        if ((s.title ?? '').toLowerCase().includes(needle)) { return 4; }
        if ((s.agentName ?? '').toLowerCase().includes(needle)) { return 5; }
        if ((s.tags ?? []).some(t => t.toLowerCase().includes(needle))) { return 6; }
        return -1;
    };
    return pool
        .map(s => ({ s, n: score(s) }))
        .filter(x => x.n >= 0)
        .sort((a, b) => a.n - b.n || (b.s.lastTs || b.s.mtime) - (a.s.lastTs || a.s.mtime))
        .slice(0, limit)
        .map(x => x.s);
}
