import * as fs from 'fs';
import * as path from 'path';
import { BridgeRegistry, argStr, need, optStr } from './bridge';
import { SessionInfo } from './sessions';

/**
 * ‼️ B-14 (X-50) — THE CANDIDATE POOL, AND THE ONE THING IT IS NOT.
 *
 * *“Obsidian is the IDE, the LLM is the programmer, the wiki is the codebase.”*
 * The user does not write `00_WIKI`; agents do. But a turn worth keeping goes
 * past at conversation speed, and the moment you have to stop and decide WHERE
 * it belongs, you stop marking turns at all. So the system has two halves and
 * this file is the cheap one:
 *
 *   MARKING a turn is free, reversible and writes NOTHING to the vault. It
 *   lands here, in `wiki_candidates.json`, with the topics somebody typed in
 *   two seconds — see `_REF/wiki.md` §1.
 *
 *   COMPILING is the expensive half: reading the transcripts, deciding what is
 *   one concept, opening or amending pages, keeping `index.md` and `log.md`
 *   true. That is an LLM's work under the vault's own law
 *   (`00_WIKI/_KURALLAR_/-WIKI-ANAYASA-.md`), which outranks everything here.
 *
 * ‼️ WHICH IS WHY `wiki.compile` DOES NOT WRITE A WIKI PAGE. An extension
 * cannot synthesise, and an op that pretended to would produce exactly the
 * mechanical summaries this whole idea exists to avoid. What it does is
 * everything the extension is genuinely better at than the agent: gather the
 * chosen candidates, resolve each one to a transcript on disk and a turn range
 * inside it, find the rules, read what the wiki already holds, and hand back a
 * BRIEF. The agent does the synthesis and reports back with
 * `wiki.candidates.edit`, which is `_REF/wiki.md` §8 step 6. Nothing is marked
 * compiled by asking for the brief — only by saying the pages were written.
 */

export type WikiCandidateState = 'pending' | 'compiled' | 'dropped';

export const WIKI_STATES: readonly WikiCandidateState[] = ['pending', 'compiled', 'dropped'];

export interface WikiCandidate {
    id: string;
    /** The conversation. Stored as the id AND the file: the id is how a person
     *  names it, the file is what a compile actually reads, and a session that
     *  has left the index still has its transcript. */
    sessionId: string;
    sessionFile: string;
    engine: string;
    agentName: string;
    /** 1-based, inclusive. A single turn is `from === to`; `from === 0` means
     *  the whole conversation (S-38 marks a session, not a turn). */
    fromTurn: number;
    toTurn: number;
    /** What it is ABOUT — the compiler's filing key, and the only field the
     *  person marking a turn is asked for. */
    topics: string[];
    /** The turn's opening prompt, kept so the pool is readable on its own. */
    label: string;
    /** Somebody's own words about why this is worth keeping. */
    note: string;
    state: WikiCandidateState;
    addedAt: number;
    /** 'you' from a panel, an agent's name from the bridge. */
    addedBy: string;
    compiledAt?: number;
    /** Which pages the compile wrote for it — provenance, read backwards. */
    pages?: string[];
    /**
     * ‼️ M-23 — A COMPILE IS OUT FOR THIS MARK, and the row is still `pending`.
     *
     * Nothing is compiled until the agent says the pages exist (B-14), so a run
     * in flight cannot change the state. But two runs over the same mark would
     * read the same turns twice and file the same concept twice, which is the
     * one failure the pool exists to prevent — so the claim is recorded and a
     * second run over a claimed mark is refused by name. A claim whose task is
     * no longer running is STALE and ignored: a crashed run must not lock a
     * turn out of the wiki for ever.
     */
    compileTaskId?: string;
    compileStartedAt?: number;
}

/** A pool that grows without bound is a pool nobody reads. The newest are the
 *  ones being worked; the oldest compiled rows fall off first. */
const MAX_CANDIDATES = 2000;

/** The vault's own law, and where the wiki lives under the root. */
export const WIKI_RULES_REL = path.join('_KURALLAR_', '-WIKI-ANAYASA-.md');
export const WIKI_INDEX_REL = 'index.md';
export const WIKI_LOG_REL = 'log.md';

const nowId = (): string =>
    'wc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

/** Topics come in as a string, a comma-separated string or a list; they leave
 *  as a trimmed, de-duplicated list, because the pool is filtered by them. */
export function normTopics(v: unknown): string[] {
    const raw = Array.isArray(v) ? v : String(v ?? '').split(',');
    const out: string[] = [];
    for (const t of raw) {
        const s = String(t ?? '').trim();
        if (s && !out.some(x => x.toLowerCase() === s.toLowerCase())) { out.push(s); }
    }
    return out;
}

/**
 * `4` · `"4"` · `"3-7"` · `""` (the whole conversation). Returned inclusive and
 * in order, so `"7-3"` is the same range as `"3-7"` rather than an empty one.
 */
export function parseTurnRange(v: unknown): { from: number; to: number } {
    if (v === undefined || v === null || String(v).trim() === '') { return { from: 0, to: 0 }; }
    const s = String(v).trim();
    const m = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(s);
    need(!!m, `"${s}" is not a turn or a turn range — use 4, "3-7", or leave it out for the whole conversation.`);
    const a = Number(m![1]);
    const b = m![2] === undefined ? a : Number(m![2]);
    need(a >= 1, 'Turns are numbered from 1.');
    return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** One entry of a session's turn rollup — all `turnFor` needs of it. */
export interface TurnAnchor { n: number; label: string; ts: number }

/** Where a mark came from and what it is allowed to say about itself.
 *  `exact` false means the number was INFERRED from the clock alone and the
 *  surface must show it as a guess the reader can correct. */
export interface TurnMatch { turn: number; count: number; exact: boolean }

/** Enough of a prompt to tell two turns apart, whitespace-flattened so a line
 *  break in the console and a line break in the transcript compare equal. */
const probeOf = (text: string): string =>
    String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);

/**
 * ‼️ K-26 — WHICH TRANSCRIPT TURN THE ROW UNDER THE POINTER IS.
 *
 * The pool files by turn NUMBER, and the number belongs to the transcript
 * (`sessions.ts` numbers turns as it parses). A Console row does not carry it:
 * the panel's own counter restarts on every resume, and the backfill numbers
 * rows by their place in the file, not by turn. So the number is resolved here,
 * from the two things a row does carry.
 *
 * ‼️ AND THE TEXT OUTRANKS THE CLOCK, because only one of the two is exact. A
 * live row is stamped when the panel sent it and the transcript stamps the same
 * prompt when the CLI wrote it — seconds apart, and a queued message can start
 * the next turn inside that gap, so a clock-only rule silently files the
 * neighbouring turn. The opening line, flattened, matches one turn or none.
 * When it matches none — a transcript that has not caught up, an engine that
 * rewrites the prompt — the clock answers and `exact` says so, which is what
 * lets the popover show the number as something to check rather than assert it.
 */
export function turnFor(turns: readonly TurnAnchor[], at: { ts: number; text?: string }): TurnMatch {
    const count = turns.length;
    if (!count) { return { turn: 0, count: 0, exact: false }; }
    const probe = probeOf(at.text ?? '');
    if (probe) {
        const hits = turns.filter(t => {
            const lab = probeOf(t.label);
            if (!lab) { return false; }
            if (lab === probe) { return true; }
            // A label is a truncation of the prompt, so one is a prefix of the
            // other — but only at length. Twelve characters of agreement is a
            // name; two is "de" against "devam et", which is a coincidence and
            // would file the wrong turn while looking certain.
            const n = Math.min(lab.length, probe.length);
            return n >= 12 && lab.slice(0, n) === probe.slice(0, n);
        });
        if (hits.length === 1) { return { turn: hits[0].n, count, exact: true }; }
        if (hits.length > 1) {
            // The same prompt typed twice ("devam") — the clock only has to
            // choose between turns that already said the same thing.
            const near = hits.reduce((a, b) =>
                Math.abs(b.ts - at.ts) < Math.abs(a.ts - at.ts) ? b : a);
            return { turn: near.n, count, exact: true };
        }
    }
    const before = turns.filter(t => t.ts <= at.ts);
    return { turn: (before.length ? before[before.length - 1] : turns[0]).n, count, exact: false };
}

/** Two marks on the same conversation whose turn ranges touch are the same
 *  mark. A whole-conversation candidate (0) swallows any range in it. */
export function rangesOverlap(
    a: { fromTurn: number; toTurn: number }, b: { from: number; to: number }
): boolean {
    if (a.fromTurn === 0 || b.from === 0) { return true; }
    return a.fromTurn <= b.to && b.from <= a.toTurn;
}

export class WikiStore {
    candidates: WikiCandidate[] = [];

    constructor(private file: string) { this.load(); }

    private load(): void {
        try {
            const json = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { candidates?: WikiCandidate[] };
            this.candidates = Array.isArray(json.candidates) ? json.candidates : [];
        } catch { /* first run */ }
    }

    save(): void {
        try {
            if (this.candidates.length > MAX_CANDIDATES) {
                // ‼️ PENDING WORK IS NEVER THE THING THAT FALLS OFF. The cap is
                // there to stop a compiled archive growing for ever; dropping a
                // turn somebody marked and nobody has compiled yet would lose
                // the one state this file exists to hold.
                const keep = this.candidates.filter(c => c.state === 'pending');
                const rest = this.candidates.filter(c => c.state !== 'pending');
                this.candidates = [...rest.slice(-(Math.max(0, MAX_CANDIDATES - keep.length))), ...keep]
                    .sort((a, b) => a.addedAt - b.addedAt);
            }
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.writeFileSync(this.file, JSON.stringify({ candidates: this.candidates }, null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
    }

    get(id: string): WikiCandidate | undefined {
        return this.candidates.find(c => c.id === id);
    }

    /**
     * ‼️ MARKING THE SAME TURN TWICE IS NOT AN ERROR AND IT IS NOT A SECOND
     * ROW. The badge (K-26) is one click on a live conversation and the session
     * menu (S-38) covers whole sessions, so the same turn WILL be marked twice
     * — and two rows for one turn means the compile reads it twice and the
     * concept is filed twice. An overlapping mark on a pending candidate merges
     * its topics instead, which is also how you add a topic you thought of
     * later: mark it again.
     */
    add(c: Omit<WikiCandidate, 'id' | 'addedAt' | 'state'> & { state?: WikiCandidateState }):
        { candidate: WikiCandidate; merged: boolean } {
        const dup = this.candidates.find(x => x.state === 'pending'
            && x.sessionId === c.sessionId
            && rangesOverlap(x, { from: c.fromTurn, to: c.toTurn }));
        if (dup) {
            const before = dup.topics.length;
            for (const t of c.topics) {
                if (!dup.topics.some(x => x.toLowerCase() === t.toLowerCase())) { dup.topics.push(t); }
            }
            // A whole-conversation mark widens what was a single turn; the
            // reverse never narrows it.
            if (c.fromTurn === 0) { dup.fromTurn = 0; dup.toTurn = 0; }
            else if (dup.fromTurn !== 0) {
                dup.fromTurn = Math.min(dup.fromTurn, c.fromTurn);
                dup.toTurn = Math.max(dup.toTurn, c.toTurn);
            }
            if (c.note && !dup.note) { dup.note = c.note; }
            this.save();
            return { candidate: dup, merged: before !== dup.topics.length || true };
        }
        const made: WikiCandidate = {
            ...c, id: nowId(), addedAt: Date.now(), state: c.state ?? 'pending'
        };
        this.candidates.push(made);
        this.save();
        return { candidate: made, merged: false };
    }

    remove(ids: string[]): WikiCandidate[] {
        const gone = this.candidates.filter(c => ids.includes(c.id));
        this.candidates = this.candidates.filter(c => !ids.includes(c.id));
        if (gone.length) { this.save(); }
        return gone;
    }

    /** What is already marked in one conversation — what turns a reading
     *  surface paints as taken (K-26). Compiled marks are included: the turn was
     *  kept, and a badge that forgot that would invite marking it again. */
    forSession(sessionId: string): WikiCandidate[] {
        return this.candidates.filter(c => c.sessionId === sessionId && c.state !== 'dropped');
    }

    /** Every topic in the pool with how many pending marks carry it — the list
     *  a tagger offers as chips (K-26), newest use first. */
    topics(): { topic: string; pending: number; total: number; lastAt: number }[] {
        const map = new Map<string, { topic: string; pending: number; total: number; lastAt: number }>();
        for (const c of this.candidates) {
            for (const t of c.topics) {
                const k = t.toLowerCase();
                const e = map.get(k) ?? { topic: t, pending: 0, total: 0, lastAt: 0 };
                e.total++;
                if (c.state === 'pending') { e.pending++; }
                e.lastAt = Math.max(e.lastAt, c.addedAt);
                map.set(k, e);
            }
        }
        return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
    }
}

// ---------------------------------------------------------------- the vault

export interface WikiPage {
    category: string;
    concept: string;
    file: string;
}

/**
 * What `00_WIKI` currently holds. Single-level categories by law
 * (`_REF/wiki.md` §2), so this is one directory walk and never a recursion —
 * a page found deeper is REPORTED rather than counted, because the answer to
 * "why is my page not in the index" is usually that it is in the wrong place.
 */
export function readWikiPages(root: string): { pages: WikiPage[]; misplaced: string[] } {
    const pages: WikiPage[] = [];
    const misplaced: string[] = [];
    let cats: fs.Dirent[];
    try { cats = fs.readdirSync(root, { withFileTypes: true }); } catch { return { pages, misplaced }; }
    for (const c of cats) {
        if (!c.isDirectory() || c.name.startsWith('_')) { continue; }
        let inner: fs.Dirent[];
        try { inner = fs.readdirSync(path.join(root, c.name), { withFileTypes: true }); } catch { continue; }
        for (const f of inner) {
            if (f.isDirectory()) { misplaced.push(path.join(c.name, f.name)); continue; }
            if (!f.name.toLowerCase().endsWith('.md')) { continue; }
            pages.push({
                category: c.name,
                concept: f.name.replace(/\.md$/i, ''),
                file: path.join(root, c.name, f.name)
            });
        }
    }
    return { pages, misplaced };
}

export interface WikiCategory { name: string; pages: number }

/**
 * ‼️ U-91 — A FOLDER IN `00_WIKI` IS A CATEGORY THE MOMENT IT EXISTS.
 *
 * `readWikiPages` answers "what is written"; this answers "what is FILED
 * UNDER", and the difference is the empty folder. Somebody who opens
 * `00_WIKI/Tarım` in Obsidian has decided that Tarım is a category — the wiki
 * has simply not been written yet — and a picker that only offered categories
 * that already hold a page would refuse the one gesture the user just made.
 *
 * `_`-prefixed folders are the wiki's own (`_KURALLAR_`) and are not
 * categories. Single level, by law (`_REF/wiki.md` §2): what is inside a
 * category is pages, and anything deeper is `readWikiPages`' business to
 * report.
 */
export function readWikiCategories(root: string): WikiCategory[] {
    let dirs: fs.Dirent[];
    try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
    const out: WikiCategory[] = [];
    for (const d of dirs) {
        if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) { continue; }
        let pages = 0;
        try {
            pages = fs.readdirSync(path.join(root, d.name), { withFileTypes: true })
                .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.md')).length;
        } catch { pages = 0; }
        out.push({ name: d.name, pages });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** Windows will not have these as a file name whatever you do to the rest. */
const RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * ‼️ U-91 — THE CATEGORY IS A FOLDER NAME, SO IT HAS TO SURVIVE BEING ONE.
 *
 * A topic typed into the picker becomes a directory on the user's disk, and
 * `Ajanlar / Yol Haritası` would become two nested folders — which is exactly
 * the deep hierarchy the single-level rule exists to prevent. So the separators
 * and the characters Windows refuses go, and what is left is one name.
 *
 * `-` survives on purpose: `Teknoloji - Tarım` is how a family of categories is
 * spelled here, ONE level deep, rather than `Teknoloji/Tarım`.
 */
export function safeCategoryName(v: unknown): string {
    return String(v ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ')
        .replace(/\s+/g, ' ')
        // Windows silently drops a trailing dot or space, so a folder asked for
        // as "Tarım." would come back named something else.
        .replace(/^[\s.]+|[\s.]+$/g, '')
        .slice(0, 60)
        .trim();
}

/**
 * Make one category folder. Refuses rather than guesses: a name that is nothing
 * once cleaned, a name the platform reserves, and the `_` prefix the wiki keeps
 * for itself — a folder created under that prefix would never appear in the
 * list it was created for.
 */
export function createWikiCategory(root: string, name: unknown):
    { ok: true; name: string; dir: string; existed: boolean } | { ok: false; error: string } {
    if (!root) { return { ok: false, error: 'The wiki root is not set.' }; }
    if (!fs.existsSync(root)) { return { ok: false, error: `The wiki root does not exist: ${root}` }; }
    const safe = safeCategoryName(name);
    if (!safe) { return { ok: false, error: 'That leaves no name once the characters a folder cannot carry are removed.' }; }
    if (safe.startsWith('_')) {
        return { ok: false, error: 'A leading _ is the wiki\'s own prefix — a folder there is not a category.' };
    }
    if (RESERVED_DEVICE.test(safe)) {
        return { ok: false, error: `"${safe}" is a name Windows reserves for a device.` };
    }
    // An existing category, however it is spelled, is that category — creating
    // "wiki" beside "Wiki" is the duplicate this picker exists to prevent.
    const hit = readWikiCategories(root).find(c => c.name.toLowerCase() === safe.toLowerCase());
    if (hit) { return { ok: true, name: hit.name, dir: path.join(root, hit.name), existed: true }; }
    try {
        const dir = path.join(root, safe);
        fs.mkdirSync(dir, { recursive: true });
        return { ok: true, name: safe, dir, existed: false };
    } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

/**
 * ‼️ `wiki.lint` — REPORTS, NEVER REPAIRS (`_REF/wiki.md` §9). Everything here
 * is a question about the SHAPE of the wiki, which is the half a program can
 * answer honestly; whether two pages contradict each other is not, and is not
 * guessed at.
 */
export function lintWiki(root: string): {
    pages: number;
    orphans: string[];
    unindexed: string[];
    brokenLinks: { page: string; link: string }[];
    misplaced: string[];
    indexMissing: boolean;
    logMissing: boolean;
} {
    const { pages, misplaced } = readWikiPages(root);
    const byConcept = new Map<string, WikiPage>();
    for (const p of pages) { byConcept.set(p.concept.toLowerCase(), p); }

    let index = '';
    try { index = fs.readFileSync(path.join(root, WIKI_INDEX_REL), 'utf8'); } catch { /* absent */ }

    const linkedTo = new Set<string>();
    const brokenLinks: { page: string; link: string }[] = [];
    const scan = (text: string, from: string) => {
        for (const m of text.matchAll(/\[\[([^\]|#]+)/g)) {
            const target = m[1].trim();
            const key = target.toLowerCase();
            if (byConcept.has(key)) { linkedTo.add(key); }
            else if (from !== WIKI_INDEX_REL) { brokenLinks.push({ page: from, link: target }); }
        }
    };
    scan(index, WIKI_INDEX_REL);
    for (const p of pages) {
        let body = '';
        try { body = fs.readFileSync(p.file, 'utf8'); } catch { continue; }
        scan(body, p.category + '/' + p.concept);
    }
    return {
        pages: pages.length,
        // A page nothing links to and the index does not name is a page nobody
        // will ever reach — the index counts as an inbound link, which is why
        // it is scanned first.
        orphans: pages.filter(p => !linkedTo.has(p.concept.toLowerCase())
            && index.indexOf(p.concept) < 0).map(p => p.category + '/' + p.concept),
        unindexed: pages.filter(p => index.indexOf(p.concept) < 0)
            .map(p => p.category + '/' + p.concept),
        brokenLinks,
        misplaced,
        indexMissing: !fs.existsSync(path.join(root, WIKI_INDEX_REL)),
        logMissing: !fs.existsSync(path.join(root, WIKI_LOG_REL))
    };
}

// --------------------------------------------------------------- bridge ops

export interface WikiDeps {
    store(): WikiStore;
    /** Where `00_WIKI` lives — the setting, resolved. */
    root(): string;
    /** The session index, for turning "session X, turn 4" into a file and a label. */
    sessions(): SessionInfo[];
    /** The agent procedure, so the brief can point at it by path. */
    procedure?: string;
    /**
     * ‼️ M-23 — HOW A BRIEF BECOMES SOMEBODY DOING THE WORK.
     *
     * This module cannot reach vscode or the task manager, and it must not: the
     * point of `wiki.compile` handing back a brief is that the SYNTHESIS is an
     * agent's. So the host injects the one thing the engine needs — start a
     * headless run with these words — and everything about which agent, which
     * model and what a task is stays where it already lives.
     */
    startCompile?(a: { title: string; prompt: string; agent?: string; engine?: string; model?: string; effort?: string; start?: boolean }):
        { taskId: string; agent: string; started: boolean };
    /** Is a recorded claim still a run, or the ghost of one that died? */
    taskAlive?(taskId: string): boolean;
    /** Which agent writes the wiki when nobody names one (the setting). */
    defaultAgent?(): string;
}

/** What a compile is handed — the same object whether a person reads it or a
 *  headless run is built out of it. One assembly, so the words an agent works
 *  from can never drift from the words the op prints. */
export interface WikiBrief {
    rules: string;
    procedure: string;
    root: string;
    index: string;
    log: string;
    existing: { category: string; concept: string; file: string }[];
    candidates: (Record<string, unknown> & { transcript: string; readTurns: string })[];
    next: string[];
}

const COMPILE_STEPS = [
    'Read the rules file first — it outranks the agent procedure.',
    'Read each candidate\'s transcript over the turns named, and distil the concepts.',
    'Create or amend pages under <root>/<Category>/<Concept>.md; never delete contradicted text, annotate it with a dated line.',
    'Update index.md (one line per page) and append to log.md.',
    'Report back: wiki.candidates.edit { id, state:"compiled", pages:[…] } for each one.'
];

/** Which marks a compile is about. The three selectors are exclusive on
 *  purpose: a compile of "whatever is there" is never implied. */
export function chooseCandidates(store: WikiStore, args: Record<string, unknown>): WikiCandidate[] {
    const pool = store.candidates.filter(c => c.state === 'pending');
    let chosen: WikiCandidate[];
    if (args.ids !== undefined) {
        const ids = (Array.isArray(args.ids) ? args.ids : [args.ids]).map(x => String(x));
        chosen = store.candidates.filter(c => ids.includes(c.id));
        need(chosen.length === ids.length,
            `${ids.length - chosen.length} of those ids are not in the pool.`);
    } else if (args.topic !== undefined) {
        const t = argStr(args, 'topic').toLowerCase();
        chosen = pool.filter(c => c.topics.some(x => x.toLowerCase() === t));
    } else if (args.all === true) {
        chosen = pool;
    } else {
        need(false, 'Pass ids, topic, or all:true — a compile of "whatever is there" is never implied.');
        chosen = [];
    }
    need(chosen.length > 0, 'Nothing matched — there is nothing to compile.');
    return chosen;
}

/** The brief: the law, the root, what the wiki already holds, and every chosen
 *  mark resolved to a transcript on disk and a turn range inside it. */
export function buildBrief(deps: WikiDeps, chosen: WikiCandidate[]): WikiBrief {
    const root = deps.root();
    const rules = path.join(root, WIKI_RULES_REL);
    need(fs.existsSync(root),
        `The wiki root does not exist: ${root}. Set agentFarm.wikiRoot or create the folder before compiling.`);
    need(fs.existsSync(rules),
        `The wiki's own law is missing: ${rules}. It outranks the agent procedure, so a compile without it would be a guess.`);
    const { pages } = readWikiPages(root);
    return {
        rules,
        procedure: deps.procedure ?? '_REF/wiki.md',
        root,
        index: path.join(root, WIKI_INDEX_REL),
        log: path.join(root, WIKI_LOG_REL),
        // What already exists decides create-vs-amend, which is the first
        // judgement of every compile (_REF/wiki.md §3).
        existing: pages.map(p => ({ category: p.category, concept: p.concept, file: p.file })),
        candidates: chosen.map(c => ({
            ...candidateView(c),
            // The transcript and the range, so the agent reads the turns itself
            // rather than trusting a summary of them.
            transcript: c.sessionFile,
            readTurns: c.fromTurn === 0 ? 'all' : `${c.fromTurn}-${c.toTurn}`
        })),
        next: COMPILE_STEPS
    };
}

/**
 * ‼️ M-23 — THE BRIEF, AS WORK. What a headless run is actually told.
 *
 * Every line here is something the run cannot look up for itself in time: where
 * the law is, which transcript and which turns, what the wiki already holds,
 * and how to report back. Nothing here summarises a transcript — a summary of
 * the thing being distilled is the mechanical output this whole idea exists to
 * avoid, so the run is pointed AT the file and reads it.
 *
 * ‼️ AND THE REPORT-BACK IS PART OF THE WORK, NOT A COURTESY. A compile that
 * wrote three pages and never said so leaves the pool claiming the turns are
 * still waiting, and the next compile reads them again and files the concept
 * twice. The ids are in the text so there is nothing to look up.
 */
export function compilePrompt(brief: WikiBrief): string {
    const L: string[] = [];
    L.push('Compile these marked turns into the wiki. You are the synthesis — the extension gathered');
    L.push('the material and can do no more than that.');
    L.push('');
    L.push('## The law, in this order');
    L.push(`1. \`${brief.rules}\` — the vault's own law. Read it FIRST; it outranks everything below.`);
    L.push(`2. \`${brief.procedure}\` — the agent procedure (page template, atomicity, provenance, contradictions).`);
    L.push('');
    L.push('## Where the wiki is');
    L.push(`- root: \`${brief.root}\``);
    L.push(`- index: \`${brief.index}\` — one line per page`);
    L.push(`- log: \`${brief.log}\` — append \`## [YYYY-MM-DD] compile | <Concept>\``);
    L.push(brief.existing.length
        ? `- it already holds ${brief.existing.length} page(s): `
            + brief.existing.map(p => `${p.category}/${p.concept}`).join(' · ')
        : '- it holds no pages yet — every concept here is a new page.');
    L.push('');
    L.push('## What to read');
    for (const c of brief.candidates) {
        const topics = Array.isArray(c.topics) ? (c.topics as string[]).join(', ') : String(c.topics ?? '');
        L.push(`- **${c.id}** — turns ${c.turns} of \`${c.transcript}\``);
        L.push(`  · filed under: ${topics}`);
        if (c.label) { L.push(`  · opening line: ${String(c.label).slice(0, 160)}`); }
        if (c.note) { L.push(`  · why it was kept: ${String(c.note)}`); }
    }
    L.push('');
    L.push('## What to do');
    brief.next.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    L.push('');
    L.push('## ‼️ Three lines you do not cross');
    L.push('- **A page is one concept.** If a turn carries three, it is three pages — not one page with');
    L.push('  three headings. Filing by "the session it came from" is what the topics are there to prevent.');
    L.push('- **Nothing contradicted is deleted.** An older claim that turned out wrong is annotated with a');
    L.push('  dated line saying what superseded it, so the page reads as a history rather than a rewrite.');
    L.push('- **Every fact carries where it came from.** Session id and turn range, under the text it');
    L.push('  supports — a wiki whose provenance is missing cannot be audited and is not worth keeping.');
    L.push('');
    L.push('## Report back — this is part of the work');
    L.push('For every id above, once its pages exist:');
    L.push('');
    L.push('```');
    for (const c of brief.candidates) {
        L.push(`wiki.candidates.edit { id: "${c.id}", state: "compiled", pages: ["<Category>/<Concept>.md", …] }`);
    }
    L.push('```');
    L.push('');
    L.push('A mark you did NOT write a page for stays pending — say which, and why, rather than closing it.');
    return L.join('\n');
}

/** A session by full id, by the short id every surface prints, or by file. */
function findSession(list: SessionInfo[], ref: string): SessionInfo {
    const r = ref.trim().toLowerCase();
    const hit = list.find(s => s.sessionId.toLowerCase() === r)
        ?? list.find(s => (s.canonicalSessionId ?? '').toLowerCase() === r)
        ?? list.find(s => s.sessionId.toLowerCase().startsWith(r) && r.length >= 6)
        ?? list.find(s => s.file.toLowerCase() === r);
    need(!!hit, `No session matches "${ref}". Pass the id as sessions.list prints it (a 6+ character prefix is enough).`);
    return hit!;
}

const shortOf = (id: string): string => id.slice(0, 8);

/** How a candidate is drawn wherever it is listed — one shape, one place.
 *  ‼️ U-70 — exported, because the Wiki page draws the same rows the op prints:
 *  two shapes of one candidate is two places to fix a field. */
export function candidateView(c: WikiCandidate): Record<string, unknown> {
    return {
        id: c.id,
        session: shortOf(c.sessionId),
        sessionId: c.sessionId,
        turns: c.fromTurn === 0 ? 'whole session'
            : c.fromTurn === c.toTurn ? String(c.fromTurn) : `${c.fromTurn}-${c.toTurn}`,
        topics: c.topics,
        label: c.label,
        note: c.note || null,
        agent: c.agentName || null,
        engine: c.engine || 'claude',
        state: c.state,
        addedAt: c.addedAt,
        addedBy: c.addedBy,
        compiledAt: c.compiledAt ?? null,
        pages: c.pages ?? null,
        // M-23 — a run is out for this mark. Still `pending`: nothing is
        // compiled until the run says the pages exist.
        compileTaskId: c.compileTaskId ?? null,
        compileStartedAt: c.compileStartedAt ?? null
    };
}

/**
 * ‼️ U-70 — THE FOUR ACTS OF THE POOL, WRITTEN ONCE.
 *
 * The Wiki page does the same four things the bridge does: amend a mark, drop
 * one, read both sides, start a compile. A panel that re-implemented any of
 * them would be a second set of rules about what closes a mark and what a
 * running compile claims — and the parity gate would be right to call it a
 * different act. So the bodies live here and both doors call them; the ops are
 * one line each, and the page's button and the agent's op cannot disagree.
 */

/** `wiki.candidates.edit` — amend a mark, and stamp what the amendment means. */
export function editCandidate(store: WikiStore, args: Record<string, unknown>): Record<string, unknown> {
    const c = store.get(argStr(args, 'id'));
    need(!!c, `No candidate with id "${optStr(args, 'id')}".`);
    if (args.topics !== undefined) {
        const t = normTopics(args.topics);
        need(t.length > 0, 'A candidate cannot be left with no topic — remove it instead.');
        c!.topics = t;
    }
    if (args.addTopics !== undefined) {
        for (const t of normTopics(args.addTopics)) {
            if (!c!.topics.some(x => x.toLowerCase() === t.toLowerCase())) { c!.topics.push(t); }
        }
    }
    if (args.note !== undefined) { c!.note = String(args.note ?? ''); }
    if (args.pages !== undefined) {
        c!.pages = (Array.isArray(args.pages) ? args.pages : [args.pages])
            .map(p => String(p ?? '').trim()).filter(Boolean);
    }
    if (args.state !== undefined) {
        const st = String(args.state).toLowerCase() as WikiCandidateState;
        need((WIKI_STATES as readonly string[]).includes(st),
            `Unknown state "${args.state}" — use ${WIKI_STATES.join(', ')}.`);
        c!.state = st;
        // ‼️ The stamp goes on when it is CLAIMED to be compiled and comes off
        // when that claim is withdrawn, so a row can never say "compiled at
        // 14:02" while sitting in the pending pool.
        if (st === 'compiled') { c!.compiledAt = Date.now(); }
        else { c!.compiledAt = undefined; }
        // M-23 — and the run that was out for it is over as far as this mark is
        // concerned, whichever way it went. A closed mark still carrying a claim
        // would refuse the next compile of a turn it no longer has anything to
        // do with.
        if (st !== 'pending') { c!.compileTaskId = undefined; c!.compileStartedAt = undefined; }
    }
    store.save();
    return candidateView(c!);
}

/** `wiki.candidates.remove` — take marks out of the pool. */
export function removeCandidates(store: WikiStore, args: Record<string, unknown>):
    { removed: number; candidates: Record<string, unknown>[] } {
    let ids: string[] = [];
    if (args.id !== undefined) { ids = [argStr(args, 'id')]; }
    else if (args.ids !== undefined) {
        ids = (Array.isArray(args.ids) ? args.ids : [args.ids]).map(x => String(x));
    } else if (args.state !== undefined) {
        const st = String(args.state).toLowerCase();
        need(st === 'compiled' || st === 'dropped',
            'A sweep only takes compiled or dropped rows — pending work is never swept away by a state argument. Pass its id.');
        ids = store.candidates.filter(c => c.state === st).map(c => c.id);
    } else {
        need(false, 'Pass id, ids or state.');
    }
    const gone = store.remove(ids);
    need(gone.length > 0, 'Nothing matched — no candidate was removed.');
    return { removed: gone.length, candidates: gone.map(candidateView) };
}

/** `wiki.status` — the pool and the vault, read in one breath. */
export function wikiStatus(deps: WikiDeps): Record<string, unknown> {
    const root = deps.root();
    const rules = path.join(root, WIKI_RULES_REL);
    const { pages, misplaced } = readWikiPages(root);
    const pool = deps.store().candidates;
    const count = (st: WikiCandidateState) => pool.filter(c => c.state === st).length;
    return {
        pool: {
            pending: count('pending'), compiled: count('compiled'),
            dropped: count('dropped'), total: pool.length,
            // M-23 — pending marks a run is already out for. They are still
            // pending, and asking for them again is refused.
            compiling: pool.filter(c => c.state === 'pending' && c.compileTaskId
                && (deps.taskAlive ? deps.taskAlive(c.compileTaskId) : true)).length,
            topics: deps.store().topics()
        },
        wiki: {
            root,
            exists: fs.existsSync(root),
            // ‼️ THE RULES ARE THE ONE FILE WHOSE ABSENCE STOPS A COMPILE. They
            // are the vault's law and they outrank the agent procedure, so "I
            // could not find them" is never an invitation to proceed from memory.
            rules, rulesFound: fs.existsSync(rules),
            procedure: deps.procedure ?? '_REF/wiki.md',
            index: path.join(root, WIKI_INDEX_REL),
            indexFound: fs.existsSync(path.join(root, WIKI_INDEX_REL)),
            log: path.join(root, WIKI_LOG_REL),
            logFound: fs.existsSync(path.join(root, WIKI_LOG_REL)),
            pages: pages.length,
            categories: [...new Set(pages.map(p => p.category))].sort(),
            misplaced
        }
    };
}

/** `wiki.compile.run` — the brief, started as a headless run instead of read. */
export function startCompileRun(deps: WikiDeps, args: Record<string, unknown>): Record<string, unknown> {
    need(!!deps.startCompile,
        'This build has no way to start a run — wiki.compile hands back the brief and you do the work.');
    const chosen = chooseCandidates(deps.store(), args);
    // ‼️ CAN A COMPILE HAPPEN AT ALL, before which marks it is about: a missing
    // root or a wiki with no law of its own stops every run, and answering
    // "that mark is busy" first would send the reader after the wrong problem.
    const brief = buildBrief(deps, chosen);
    // ‼️ TWO RUNS OVER ONE MARK FILE THE CONCEPT TWICE. The claim is only real
    // while its run is; a crashed compile must not lock a turn out of the wiki
    // for ever (see WikiCandidate.compileTaskId).
    const claimed = chosen.filter(c => c.compileTaskId
        && (deps.taskAlive ? deps.taskAlive(c.compileTaskId) : true));
    need(claimed.length === 0,
        `${claimed.length} of those already have a compile running (${claimed.map(c => c.id).join(', ')}). `
        + 'Let it finish, or drop that run first — reading the same turns twice files the concept twice.');
    const topics = [...new Set(chosen.flatMap(c => c.topics))];
    const title = `Wiki compile — ${topics.slice(0, 3).join(', ')}`
        + (topics.length > 3 ? ` +${topics.length - 3}` : '')
        + ` (${chosen.length} mark${chosen.length === 1 ? '' : 's'})`;
    const run = deps.startCompile!({
        title,
        prompt: compilePrompt(brief),
        agent: optStr(args, 'agent') || (deps.defaultAgent ? deps.defaultAgent() : ''),
        engine: optStr(args, 'engine'),
        model: optStr(args, 'model'),
        effort: optStr(args, 'effort'),
        start: args.start !== false
    });
    const at = Date.now();
    for (const c of chosen) { c.compileTaskId = run.taskId; c.compileStartedAt = at; }
    deps.store().save();
    return {
        taskId: run.taskId, agent: run.agent, started: run.started, title,
        marks: chosen.length,
        topics,
        reads: brief.candidates.map(c => ({ id: c.id, transcript: c.transcript, turns: c.readTurns })),
        root: brief.root, rules: brief.rules,
        note: 'Nothing is compiled yet. The run reports back with wiki.candidates.edit '
            + '{state:"compiled", pages:[…]} when the pages exist — that is what closes a mark.'
    };
}

export function registerWikiOps(bridge: BridgeRegistry, deps: WikiDeps): void {
    const S = () => deps.store();

    bridge.register([
        {
            op: 'wiki.candidates.add',
            describe: 'Mark a turn (or a whole session) as worth compiling into the wiki. Cheap and reversible: it writes to the candidate pool, never to the vault. args: session (session id — a 6+ char prefix is enough), topics (what it is ABOUT — a string, "a, b" or a list; this is the compiler\'s filing key), turn? (4, "3-7", or omit for the whole conversation), note? (why it is worth keeping), by? (who marked it; default "agent"). Marking the same turn again MERGES topics rather than adding a second row.',
            handler: (args) => {
                const sessions = deps.sessions();
                const s = findSession(sessions, argStr(args, 'session'));
                const topics = normTopics(args.topics);
                need(topics.length > 0,
                    'A candidate needs at least one topic — it is what the compile files the concept under.');
                const range = parseTurnRange(args.turn);
                const turns = (s.turns ?? []) as { n: number; label: string }[];
                if (range.from > 0 && turns.length) {
                    need(range.to <= turns.length,
                        `That session has ${turns.length} turn(s); ${range.to} is past the end.`);
                }
                const label = range.from > 0
                    ? (turns.find(t => t.n === range.from)?.label ?? '')
                    : (turns[0]?.label ?? '');
                const { candidate, merged } = S().add({
                    sessionId: s.sessionId,
                    sessionFile: s.file,
                    engine: s.source ?? s.producerEngine ?? 'claude',
                    agentName: s.agentName ?? '',
                    fromTurn: range.from, toTurn: range.to,
                    topics, label,
                    note: optStr(args, 'note'),
                    addedBy: optStr(args, 'by') || 'agent'
                });
                return {
                    ...candidateView(candidate), merged,
                    pending: S().candidates.filter(c => c.state === 'pending').length,
                    ...(merged ? {
                        note2: 'An overlapping mark on this conversation was already pending — its topics were merged into that one.'
                    } : {})
                };
            }
        },
        {
            op: 'wiki.candidates.list',
            describe: 'The candidate pool. args: state? (pending|compiled|dropped|all — default pending), topic? (only marks carrying it), session? (id prefix), limit? (default 50). Newest first.',
            handler: (args) => {
                const state = (optStr(args, 'state') || 'pending').toLowerCase();
                need(state === 'all' || (WIKI_STATES as readonly string[]).includes(state),
                    `Unknown state "${state}" — use ${WIKI_STATES.join(', ')} or all.`);
                const topic = optStr(args, 'topic').toLowerCase();
                const session = optStr(args, 'session').toLowerCase();
                const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 50;
                const rows = S().candidates
                    .filter(c => state === 'all' || c.state === state)
                    .filter(c => !topic || c.topics.some(t => t.toLowerCase() === topic))
                    .filter(c => !session || c.sessionId.toLowerCase().startsWith(session))
                    .sort((a, b) => b.addedAt - a.addedAt);
                return {
                    total: rows.length,
                    candidates: rows.slice(0, limit).map(candidateView)
                };
            }
        },
        {
            op: 'wiki.candidates.edit',
            describe: 'Change a candidate. args: id, then any of topics? (replaces the list), addTopics? (adds to it), note?, state? (pending|compiled|dropped), pages? (the wiki files a compile wrote for it — provenance read backwards). Setting state=compiled stamps the time; this is how a compile reports back (_REF/wiki.md §8 step 6).',
            handler: (args) => editCandidate(S(), args)
        },
        {
            op: 'wiki.candidates.remove',
            describe: 'Take marks out of the pool. args: id? (one) or ids? (a list) or state? (sweep every candidate in that state — compiled|dropped only, never pending). Removing a mark undoes nothing in the vault; a page already written stays written.',
            handler: (args) => removeCandidates(S(), args)
        },
        {
            op: 'wiki.categories',
            describe: 'U-90/U-91 — what a mark can be filed under: every single-level folder of the wiki root with the number of pages in it, and every topic the candidate pool already uses with how many marks carry it. The two are reported separately because they are different facts — a folder with no page yet is still a category, and a topic nobody has written a page for yet is not a folder. No arguments.',
            handler: () => {
                const root = deps.root();
                const topics = S().topics();
                const folders = readWikiCategories(root);
                return {
                    root, rootExists: fs.existsSync(root),
                    folders,
                    topics,
                    // The union is what a picker offers, so it is assembled ONCE
                    // here rather than differently on every surface that asks.
                    all: [...folders.map(f => f.name),
                        ...topics.map(t => t.topic)]
                        .filter((n, i, a) => a.findIndex(x => x.toLowerCase() === n.toLowerCase()) === i)
                        .sort((a, b) => a.localeCompare(b, 'tr'))
                };
            }
        },
        {
            op: 'wiki.category.add',
            describe: 'U-91 — open one category folder under the wiki root, so a category can be started without leaving for Obsidian. Single level by law: the separators and the characters a folder cannot carry are removed, and a family is spelled `Teknoloji - Tarım` rather than nested. A category that already exists, however it is spelled, is reported as that one rather than duplicated. args: name',
            handler: (args) => {
                const r = createWikiCategory(deps.root(), argStr(args, 'name'));
                need(r.ok, r.ok ? '' : r.error);
                return r;
            }
        },
        {
            op: 'wiki.status',
            describe: 'What the pool holds and what the wiki holds. No arguments. Reports both sides: pending/compiled marks and their topics, and the vault\'s own state (root, rules, index, log, page count).',
            handler: () => wikiStatus(deps)
        },
        {
            op: 'wiki.compile',
            describe: 'Assemble what it takes to compile marked turns into the wiki, and hand it back as a brief: the rules, the root, what the wiki already holds, and each candidate resolved to a transcript and a turn range. args: ids? (a list) or topic? (every pending mark carrying it) or all? (true = every pending mark). ‼️ It writes NO wiki page — synthesis is the agent\'s, under the vault\'s own law — and it marks nothing compiled; report back with wiki.candidates.edit {state:"compiled", pages:[…]} when the pages exist.',
            handler: (args) => buildBrief(deps, chooseCandidates(S(), args))
        },
        {
            op: 'wiki.compile.run',
            describe: 'M-23 — the compile, DONE rather than described: it assembles the same brief wiki.compile hands back and starts a headless run that carries out the synthesis, under the vault\'s own law. args: ids? / topic? / all? (the same three exclusive selectors), agent? (who writes the wiki; default agentFarm.wikiAgent), engine?, model?, effort?, start? (default true). ‼️ Nothing is marked compiled by starting a run — the run reports back with wiki.candidates.edit when the pages exist, which is the only thing that closes a mark. A mark with a compile already out is refused rather than read twice; a claim whose run has ended is stale and ignored.',
            handler: (args) => startCompileRun(deps, args)
        },
        {
            op: 'wiki.lint',
            describe: 'Check the SHAPE of the wiki and report — never repair. No arguments. Finds orphan pages (nothing links to them and the index does not name them), broken [[links]], pages missing from the index, folders nested deeper than one category, and a missing index or log. Whether two pages CONTRADICT each other is not a question a program can answer and is not guessed at.',
            handler: () => {
                const root = deps.root();
                need(fs.existsSync(root), `The wiki root does not exist: ${root}.`);
                return { root, ...lintWiki(root) };
            }
        }
    ]);
}
