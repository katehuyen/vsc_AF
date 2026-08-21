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

/** How a candidate is drawn wherever it is listed — one shape, one place. */
function view(c: WikiCandidate): Record<string, unknown> {
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
        pages: c.pages ?? null
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
                    ...view(candidate), merged,
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
                    candidates: rows.slice(0, limit).map(view)
                };
            }
        },
        {
            op: 'wiki.candidates.edit',
            describe: 'Change a candidate. args: id, then any of topics? (replaces the list), addTopics? (adds to it), note?, state? (pending|compiled|dropped), pages? (the wiki files a compile wrote for it — provenance read backwards). Setting state=compiled stamps the time; this is how a compile reports back (_REF/wiki.md §8 step 6).',
            handler: (args) => {
                const c = S().get(argStr(args, 'id'));
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
                    // ‼️ The stamp goes on when it is CLAIMED to be compiled and
                    // comes off when that claim is withdrawn, so a row can never
                    // say "compiled at 14:02" while sitting in the pending pool.
                    if (st === 'compiled') { c!.compiledAt = Date.now(); }
                    else { c!.compiledAt = undefined; }
                }
                S().save();
                return view(c!);
            }
        },
        {
            op: 'wiki.candidates.remove',
            describe: 'Take marks out of the pool. args: id? (one) or ids? (a list) or state? (sweep every candidate in that state — compiled|dropped only, never pending). Removing a mark undoes nothing in the vault; a page already written stays written.',
            handler: (args) => {
                let ids: string[] = [];
                if (args.id !== undefined) { ids = [argStr(args, 'id')]; }
                else if (args.ids !== undefined) {
                    ids = (Array.isArray(args.ids) ? args.ids : [args.ids]).map(x => String(x));
                } else if (args.state !== undefined) {
                    const st = String(args.state).toLowerCase();
                    need(st === 'compiled' || st === 'dropped',
                        'A sweep only takes compiled or dropped rows — pending work is never swept away by a state argument. Pass its id.');
                    ids = S().candidates.filter(c => c.state === st).map(c => c.id);
                } else {
                    need(false, 'Pass id, ids or state.');
                }
                const gone = S().remove(ids);
                need(gone.length > 0, 'Nothing matched — no candidate was removed.');
                return { removed: gone.length, candidates: gone.map(view) };
            }
        },
        {
            op: 'wiki.status',
            describe: 'What the pool holds and what the wiki holds. No arguments. Reports both sides: pending/compiled marks and their topics, and the vault\'s own state (root, rules, index, log, page count).',
            handler: () => {
                const root = deps.root();
                const rules = path.join(root, WIKI_RULES_REL);
                const { pages, misplaced } = readWikiPages(root);
                const pool = S().candidates;
                const count = (st: WikiCandidateState) => pool.filter(c => c.state === st).length;
                return {
                    pool: {
                        pending: count('pending'), compiled: count('compiled'),
                        dropped: count('dropped'), total: pool.length,
                        topics: S().topics()
                    },
                    wiki: {
                        root,
                        exists: fs.existsSync(root),
                        // ‼️ THE RULES ARE THE ONE FILE WHOSE ABSENCE STOPS A
                        // COMPILE. They are the vault's law and they outrank the
                        // agent procedure, so "I could not find them" is never
                        // an invitation to proceed from memory.
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
        },
        {
            op: 'wiki.compile',
            describe: 'Assemble what it takes to compile marked turns into the wiki, and hand it back as a brief: the rules, the root, what the wiki already holds, and each candidate resolved to a transcript and a turn range. args: ids? (a list) or topic? (every pending mark carrying it) or all? (true = every pending mark). ‼️ It writes NO wiki page — synthesis is the agent\'s, under the vault\'s own law — and it marks nothing compiled; report back with wiki.candidates.edit {state:"compiled", pages:[…]} when the pages exist.',
            handler: (args) => {
                const root = deps.root();
                const rules = path.join(root, WIKI_RULES_REL);
                need(fs.existsSync(root),
                    `The wiki root does not exist: ${root}. Set agentFarm.wikiRoot or create the folder before compiling.`);
                need(fs.existsSync(rules),
                    `The wiki's own law is missing: ${rules}. It outranks the agent procedure, so a compile without it would be a guess.`);
                const pool = S().candidates.filter(c => c.state === 'pending');
                let chosen: WikiCandidate[];
                if (args.ids !== undefined) {
                    const ids = (Array.isArray(args.ids) ? args.ids : [args.ids]).map(x => String(x));
                    chosen = S().candidates.filter(c => ids.includes(c.id));
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
                const { pages } = readWikiPages(root);
                return {
                    rules,
                    procedure: deps.procedure ?? '_REF/wiki.md',
                    root,
                    index: path.join(root, WIKI_INDEX_REL),
                    log: path.join(root, WIKI_LOG_REL),
                    // What already exists decides create-vs-amend, which is the
                    // first judgement of every compile (_REF/wiki.md §3).
                    existing: pages.map(p => ({ category: p.category, concept: p.concept, file: p.file })),
                    candidates: chosen.map(c => ({
                        ...view(c),
                        // The transcript and the range, so the agent reads the
                        // turns itself rather than trusting a summary of them.
                        transcript: c.sessionFile,
                        readTurns: c.fromTurn === 0 ? 'all' : `${c.fromTurn}-${c.toTurn}`
                    })),
                    next: [
                        'Read the rules file first — it outranks the agent procedure.',
                        'Read each candidate\'s transcript over the turns named, and distil the concepts.',
                        'Create or amend pages under <root>/<Category>/<Concept>.md; never delete contradicted text, annotate it with a dated line.',
                        'Update index.md (one line per page) and append to log.md.',
                        'Report back: wiki.candidates.edit { id, state:"compiled", pages:[…] } for each one.'
                    ]
                };
            }
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
