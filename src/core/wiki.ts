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
    /**
     * ‼️ X-58 — THE TURNS INSIDE THE RANGE THAT ARE NOT PART OF IT.
     *
     * Fourteen turns of a conversation are about one thing and the last two are
     * "commit this" and "good night". Marking the whole session is one click;
     * marking 1–12 by hand to leave those two out is twelve, so nobody does it
     * and the compile reads the noise. A subtraction is the cheap gesture — say
     * the whole thing, then say which ones are not it.
     *
     * Absent or empty means nothing is excluded. Numbers outside the range are
     * meaningless rather than wrong, and are dropped when the mark is made.
     */
    excludeTurns?: number[];
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
    /**
     * ‼️ X-58 — WHY THE LAST COMPILE OVER THIS MARK DID NOT PRODUCE A PAGE.
     *
     * A run dies of a rate limit, an expired sign-in, a VS Code restart, or it
     * finishes and forgets to report back. Every one of those used to leave the
     * mark exactly as a mark nobody had got to yet — `pending`, with a claim on
     * it that no longer meant anything — so the pool said "waiting" about work
     * that had already been attempted and lost. The claim is released when its
     * run is over (`releaseStaleClaims`) and the reason is written HERE, so the
     * row can say what happened and offer to try again.
     *
     * Cleared the moment a fresh run is started over the mark: it describes the
     * LAST attempt, and a stale reason beside a live run is a lie.
     */
    lastError?: string;
    /** When that reason was recorded — a failure from last week reads
     *  differently from one two minutes ago. */
    lastErrorAt?: number;
}

/** A pool that grows without bound is a pool nobody reads. The newest are the
 *  ones being worked; the oldest compiled rows fall off first. */
const MAX_CANDIDATES = 2000;

/** The vault's own law, and where the wiki lives under the root. */
export const WIKI_RULES_REL = path.join('_KURALLAR_', '-WIKI-ANAYASA-.md');
export const WIKI_INDEX_REL = 'index.md';
export const WIKI_LOG_REL = 'log.md';

/**
 * ‼️ X-138 — THE DROP BOX, AND ITS ARCHIVE, ALWAYS RELATIVE TO THE ROOT.
 *
 * `_RAW_` is where a session had somewhere else — a Claude Web answer, a
 * ChatGPT export, a text file somebody wrote by hand — is simply DROPPED, with
 * no command, no conversion and no naming rule to get right first. `_RAW_/
 * _DONE_` is where a compiled one is moved so the drop box stays a to-do list
 * rather than a growing pile.
 *
 * ‼️ RELATIVE, NEVER ABSOLUTE. The root is `agentFarm.wikiRoot`, which is a
 * setting the user retypes on every machine (and writes with `%USERPROFILE%`
 * in it, deliberately). A path baked in here would be right on exactly one
 * computer and would be found by nobody on the next one.
 */
export const WIKI_RAW_REL = '_RAW_';
export const WIKI_DONE_REL = path.join('_RAW_', '_DONE_');

/** Where the drop box is, whether it was already there, and what went wrong. */
export interface WikiRawDirs {
    /** Absolute `<root>/_RAW_` — '' when there is no root to be relative to. */
    raw: string;
    /** Absolute `<root>/_RAW_/_DONE_`. */
    done: string;
    /** Both folders exist right now. The only thing a caller has to check. */
    ready: boolean;
    /** Which of them this call had to make ('_RAW_' / '_RAW_/_DONE_'). */
    created: string[];
    /** Why not, when `ready` is false. Absent on success. */
    error?: string;
}

/**
 * ‼️ X-138 — SELF-HEALING: A MISSING DROP BOX IS MADE, NOT REPORTED.
 *
 * The folder lives in the user's vault, where Obsidian, a sync client and the
 * user's own hand all reach it. It WILL be deleted, renamed or arrive absent on
 * a fresh machine, and every one of those is a normal Tuesday rather than an
 * error worth a dialog. So this creates whatever is missing, recursively, and
 * says what it had to make.
 *
 * ‼️ IT NEVER CREATES THE ROOT. `mkdir -p` on `<root>/_RAW_/_DONE_` would
 * happily bring the ROOT into existence too — and the root is a path the user
 * typed, so a typo would silently become a real empty folder somewhere on the
 * disk while the real wiki sat untouched next to it. Callers that legitimately
 * make the root (`scaffoldWiki`) do that first and then call this.
 */
export function ensureRawDirs(root: string): WikiRawDirs {
    if (!root) {
        // path.join('', '_RAW_') is the RELATIVE '_RAW_', which would be made
        // in whatever the process's working directory happens to be.
        return { raw: '', done: '', ready: false, created: [], error: 'The wiki root is not set.' };
    }
    const raw = path.join(root, WIKI_RAW_REL);
    const done = path.join(root, WIKI_DONE_REL);
    if (!fs.existsSync(root)) {
        return { raw, done, ready: false, created: [], error: `The wiki root does not exist: ${root}` };
    }
    const created: string[] = [];
    if (!fs.existsSync(raw)) { created.push(WIKI_RAW_REL); }
    if (!fs.existsSync(done)) { created.push(WIKI_DONE_REL.split(path.sep).join('/')); }
    try {
        // One recursive call makes both: _DONE_ cannot exist without _RAW_.
        fs.mkdirSync(done, { recursive: true });
    } catch (e) {
        return { raw, done, ready: false, created: [], error: String((e as Error).message) };
    }
    return { raw, done, ready: fs.existsSync(raw) && fs.existsSync(done), created };
}

/** What the drop box may hold. A transcript somebody saved out of a browser is
 *  text; anything else in there is not one and is left alone rather than being
 *  turned into a candidate nobody can compile. */
export const WIKI_RAW_EXTS: readonly string[] = ['.md', '.txt'];

/** The pool key a dropped file gets. One file, one row, for ever — the whole
 *  point is that dropping the same file twice does not make a second mark. */
export function rawSessionId(fileName: string): string {
    return 'raw:' + String(fileName ?? '').trim();
}

/**
 * Is this mark a file somebody dropped into `_RAW_`, rather than a run that
 * happened in a CLI on this machine?
 *
 * ‼️ U-117 — THE KEY IS THE ANSWER, NOT THE ENGINE STRING. `raw:<file>` is what
 * makes a row that file's row (X-139); `engine: 'raw-file'` is how it is
 * DISPLAYED. One reader deriving this from the key and another from the display
 * field is how the two come apart, so it is asked in exactly one place and
 * every surface calls it.
 */
export function isRawCandidate(c: { sessionId: string }): boolean {
    return String(c.sessionId ?? '').toLowerCase().startsWith('raw:');
}

/** The dropped file's own name, for a surface that must show it — '' for a mark
 *  that is not a raw drop. */
export function rawCandidateFile(c: { sessionId: string }): string {
    return isRawCandidate(c) ? String(c.sessionId).slice('raw:'.length) : '';
}

/**
 * ‼️ U-117 — A MARK WITH NO TOPIC IS NOT WORK THE COMPILE CAN DO.
 *
 * A topic is the key a page is filed under, and it is the ONE thing only a
 * person can supply — which is why `syncRawCandidates` leaves it empty rather
 * than guessing. So a raw drop arrives in a stage of its own: in the pool,
 * waiting, and not yet compilable. Every surface asks this same question — the
 * cockpit to decide whether to offer a tick box, `startCompileRun` to decide
 * whether to refuse — because a tick box the run then rejects is worse than no
 * tick box, and a run the tick box allowed is worse than both.
 */
export function isCompilable(c: { state: string; topics: string[] }): boolean {
    return c.state === 'pending' && (c.topics ?? []).length > 0;
}

/**
 * The first line of a dropped file that is worth showing in a list — its
 * heading if it has one, its own name if it has nothing.
 *
 * ‼️ BOUNDED READ. This runs on every status call and on every listing, over a
 * folder the user is free to drop a 40 MB export into; reading whole files to
 * find their first line is how a cockpit becomes slow on exactly the machine
 * that has the most in it.
 */
function rawLabel(file: string, fallback: string): string {
    let head = '';
    try {
        const fd = fs.openSync(file, 'r');
        try {
            const buf = Buffer.alloc(4096);
            const n = fs.readSync(fd, buf, 0, 4096, 0);
            head = buf.subarray(0, n).toString('utf8');
        } finally { fs.closeSync(fd); }
    } catch { return fallback; }
    const lines = head.replace(/^﻿/, '').split(/\r?\n/);
    let i = 0;
    // A YAML front matter block is metadata, not a title: skip it whole rather
    // than labelling every exported file `---` or `af-role: …`.
    if (lines[0]?.trim() === '---') {
        i = 1;
        while (i < lines.length && lines[i].trim() !== '---') { i++; }
        i++;
    }
    for (; i < lines.length; i++) {
        const t = lines[i].replace(/^#+\s*/, '').replace(/^[-*>]\s+/, '').trim();
        if (t) { return t.slice(0, 120); }
    }
    return fallback;
}

/** What one sync changed. Every field is a list of candidate ids, so a caller
 *  can say what happened rather than only that something did. */
export interface WikiRawSync {
    /** Files that had no row and now have one. */
    added: string[];
    /** Rows whose file has moved between `_RAW_` and `_DONE_`; the path on the
     *  row was corrected, because that path is what a compile reads. */
    moved: string[];
    /** Rows whose file is in neither folder any more. */
    lost: string[];
}

/**
 * ‼️ X-139 — THE DROP BOX BECOMES A POOL WITHOUT ANYBODY PRESSING ANYTHING.
 *
 * X-138 built the folder; this is what makes putting a file in it enough. The
 * user saves a conversation out of a browser into `_RAW_` and that is the whole
 * gesture: the next time anything asks the pool what it holds, the file is a
 * candidate — untagged, which is exactly what a raw drop is, and what the
 * cockpit can then be pointed at.
 *
 * Three rules decide everything here, and each of them is the answer to a way
 * this could quietly go wrong:
 *
 * 1. **THE FILE IS THE IDENTITY, NOT THE RANGE.** Every other row in this pool
 *    is "this conversation, these turns", and `WikiStore.add` merges by exactly
 *    that. A dropped file has no turns, so it is keyed by its own name
 *    (`raw:<file>`) and a row is created only when NO row holds that key **in
 *    any state**. That last part is what stops a candidate somebody dropped on
 *    purpose from being resurrected on the next scan, for ever.
 * 2. **IT NEVER CREATES A FOLDER.** Healing the drop box is `ensureRawDirs`'s
 *    job and its callers do it first; a sync is a READ of what is on disk. A
 *    listing that silently made directories would also make them from a root
 *    that was mistyped.
 * 3. **‼️ A FILE THAT VANISHES NEVER TAKES SOMEBODY'S WORK WITH IT.** Moved
 *    into `_DONE_` means consumed, not gone: the path is corrected and the row
 *    keeps its state. Deleted outright is only ALLOWED to drop the row when
 *    nobody has touched it — no topics, no note, still pending, added by this
 *    scan. A row a person tagged keeps its state and is told on its own line
 *    why it cannot proceed, because a mark that disappears from the cockpit is
 *    indistinguishable from one that was never made.
 */
export function syncRawCandidates(root: string, store: WikiStore, now = Date.now()): WikiRawSync {
    const out: WikiRawSync = { added: [], moved: [], lost: [] };
    if (!root) { return out; }
    const raw = path.join(root, WIKI_RAW_REL);
    const done = path.join(root, WIKI_DONE_REL);
    let names: string[];
    try {
        names = fs.readdirSync(raw, { withFileTypes: true })
            .filter(d => d.isFile() && WIKI_RAW_EXTS.includes(path.extname(d.name).toLowerCase()))
            .map(d => d.name);
    } catch { return out; }

    // ‼️ CASE-INSENSITIVELY, because this pool is written on Windows and read
    // from a vault a sync client may have renamed. `Notes.MD` and `notes.md`
    // are one file there and must not become two rows.
    const byKey = new Map<string, WikiCandidate>();
    for (const c of store.candidates) {
        if (c.sessionId.toLowerCase().startsWith('raw:')) { byKey.set(c.sessionId.toLowerCase(), c); }
    }
    let changed = false;

    for (const name of names.sort()) {
        const file = path.join(raw, name);
        const key = rawSessionId(name);
        const hit = byKey.get(key.toLowerCase());
        if (hit) {
            if (hit.sessionFile !== file) { hit.sessionFile = file; out.moved.push(hit.id); changed = true; }
            continue;
        }
        const candidate: WikiCandidate = {
            id: 'wc-raw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
            sessionId: key,
            sessionFile: file,
            // ‼️ NOT AN ENGINE THAT EXISTS. This conversation did not happen in
            // a CLI on this machine, and calling it `claude` would file a web
            // chat as a local run in every column that reads this field.
            engine: 'raw-file',
            agentName: '',
            // A file has no turns to choose between, and `0` is already this
            // pool's word for "the whole thing" (S-38).
            fromTurn: 0,
            toTurn: 0,
            // ‼️ EMPTY ON PURPOSE — this is a RAW candidate. The topics are the
            // one thing only a person can supply, and a scan inventing them
            // would file the file under a guess.
            topics: [],
            label: rawLabel(file, name),
            note: '',
            state: 'pending',
            addedAt: now,
            addedBy: 'auto-raw'
        };
        store.candidates.push(candidate);
        byKey.set(key.toLowerCase(), candidate);
        out.added.push(candidate.id);
        changed = true;
    }

    const present = new Set(names.map(n => rawSessionId(n).toLowerCase()));
    for (const c of byKey.values()) {
        if (present.has(c.sessionId.toLowerCase())) { continue; }
        const name = c.sessionId.slice('raw:'.length);
        const inDone = path.join(done, name);
        if (fs.existsSync(inDone)) {
            if (c.sessionFile !== inDone) { c.sessionFile = inDone; out.moved.push(c.id); changed = true; }
            continue;
        }
        if (c.state !== 'pending' || c.lastError) { continue; }
        out.lost.push(c.id);
        changed = true;
        const untouched = !c.topics.length && !c.note && c.addedBy === 'auto-raw';
        if (untouched) {
            c.state = 'dropped';
        } else {
            c.lastError = `the dropped file is gone from ${WIKI_RAW_REL} and ${WIKI_DONE_REL.split(path.sep).join('/')}`;
            c.lastErrorAt = now;
        }
    }
    if (changed) { store.save(); }
    return out;
}

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

/** Two marks on the same conversation whose turn ranges touch. Kept because
 *  reading surfaces ask it (which turns are painted as taken), but it is NOT
 *  what decides identity in the pool any more — see `sameRange`. */
export function rangesOverlap(
    a: { fromTurn: number; toTurn: number }, b: { from: number; to: number }
): boolean {
    if (a.fromTurn === 0 || b.from === 0) { return true; }
    return a.fromTurn <= b.to && b.from <= a.toTurn;
}

/**
 * ‼️ X-58 — WHAT MAKES TWO MARKS THE SAME MARK: THE RANGE, EXACTLY.
 *
 * Identity used to be OVERLAP, and a whole-conversation mark overlaps
 * everything — so marking a session swallowed every single turn already marked
 * inside it, whatever those turns had been filed under. That is a real loss and
 * not a merge: a session whose shape is `Mimari` can perfectly well contain one
 * turn that is the best thing anybody wrote about `Güvenlik`, and the two are
 * different pages compiled from different amounts of text.
 *
 * So a mark is identified by (conversation, from, to) and nothing else. The
 * same range marked again is the SAME row — which is what keeps "mark it again
 * to add a topic you thought of later" working, and what stops two rows sending
 * the same turns to two compiles. A different range is a different mark, even
 * when one contains the other.
 */
export function sameRange(
    a: { fromTurn: number; toTurn: number }, b: { from: number; to: number }
): boolean {
    return a.fromTurn === b.from && a.toTurn === b.to;
}

/** The turns a mark actually covers, once `excludeTurns` has been taken off.
 *  `total` is how long the conversation is — needed to spell out what "the
 *  whole session minus two" is. */
export function coveredTurns(
    c: { fromTurn: number; toTurn: number; excludeTurns?: number[] }, total: number
): number[] {
    const from = c.fromTurn === 0 ? 1 : c.fromTurn;
    const to = c.fromTurn === 0 ? Math.max(total, 0) : c.toTurn;
    const skip = new Set(c.excludeTurns ?? []);
    const out: number[] = [];
    for (let n = from; n <= to; n++) { if (!skip.has(n)) { out.push(n); } }
    return out;
}

/** Turn numbers as a list, de-duplicated and in order. Anything that is not a
 *  turn number is dropped rather than guessed at. */
export function normTurnList(v: unknown): number[] {
    const raw = Array.isArray(v) ? v : String(v ?? '').split(/[,\s]+/);
    const out: number[] = [];
    for (const x of raw) {
        const n = Math.floor(Number(x));
        if (isFinite(n) && n >= 1 && !out.includes(n)) { out.push(n); }
    }
    return out.sort((a, b) => a - b);
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
     * — and two rows for ONE RANGE means the compile reads it twice and the
     * concept is filed twice. Marking the same range again merges its topics
     * instead, which is also how you add a topic you thought of later: mark it
     * again.
     *
     * ‼️ X-58 — BUT "THE SAME RANGE" MEANS THE SAME RANGE, NOT AN OVERLAPPING
     * ONE. This used to merge anything that touched, so a whole-conversation
     * mark absorbed every single turn already marked inside it and their topics
     * with them: the session was filed under `Mimari` and the one turn somebody
     * had kept for `Güvenlik` no longer existed as a mark of its own. A session
     * and a turn inside it are different amounts of text about different
     * things, and they are now different rows (`sameRange`).
     */
    add(c: Omit<WikiCandidate, 'id' | 'addedAt' | 'state'> & { state?: WikiCandidateState }):
        { candidate: WikiCandidate; merged: boolean } {
        const dup = this.candidates.find(x => x.state === 'pending'
            && x.sessionId === c.sessionId
            && sameRange(x, { from: c.fromTurn, to: c.toTurn }));
        if (dup) {
            const before = dup.topics.length;
            for (const t of c.topics) {
                if (!dup.topics.some(x => x.toLowerCase() === t.toLowerCase())) { dup.topics.push(t); }
            }
            if (c.note && !dup.note) { dup.note = c.note; }
            // X-58 — a later mark that names exclusions REPLACES them rather
            // than unioning: "the whole session except 14 and 15" said twice
            // with different numbers is a correction, not two subtractions.
            if (c.excludeTurns !== undefined) { dup.excludeTurns = c.excludeTurns; }
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

// ------------------------------------------------- X-57: is it a wiki yet?

/**
 * ‼️ X-57 — THE THREE FILES THAT DECIDE WHETHER A FOLDER IS A WIKI.
 *
 * `wiki.compile` refuses without `_KURALLAR_/-WIKI-ANAYASA-.md`, because the
 * vault's own law outranks the agent procedure and a compile that could not
 * find it would be working from memory (`buildBrief`). `index.md` and `log.md`
 * are what every compile is told to keep true. So a folder that has been
 * CHOSEN as the wiki root but holds none of them is not misconfigured — it is
 * empty, and the only useful thing to offer is to fill it.
 *
 * These are STARTERS in the strict sense: written once, never rewritten, and
 * the law's first line says so, because the moment the user edits it it stops
 * being ours. Nothing here is generated on a later run — an existing file is
 * reported as existing and left alone.
 */
export interface WikiHealthFile { rel: string; file: string; found: boolean }

export interface WikiHealth {
    root: string;
    /** '' when the setting is empty and the fallback is in play. */
    setting: string;
    exists: boolean;
    /** Every file a compile needs, in the order a reader should fix them. */
    files: WikiHealthFile[];
    /** What is missing, by rel path — empty means the folder is ready. */
    missing: string[];
    categories: WikiCategory[];
    pages: number;
    misplaced: string[];
    /** X-138 - the drop box and its archive, made ready by this very call. */
    raw: WikiRawDirs;
    /** ‼️ The one that stops a compile rather than merely making it messy. */
    compilable: boolean;
}

const WIKI_STARTERS: { rel: string; body: () => string }[] = [
    {
        rel: WIKI_RULES_REL,
        body: () => [
            '# The wiki\'s own law',
            '',
            '> **This file is yours.** Agent Farm wrote this starter once, when the folder was',
            '> empty, and will never write it again. Rewrite every line of it — what is here is',
            '> the minimum a compile needs, not what you want your wiki to be.',
            '',
            'This file **outranks the agent procedure**. A compile reads it first; where the two',
            'disagree, this one wins.',
            '',
            '## Shape',
            '',
            '- **One folder per category, one page per concept.** Categories are a single level:',
            '  a family is spelled `Teknoloji - Tarım`, never `Teknoloji/Tarım`.',
            '- **A page is one concept.** If a conversation carried three, that is three pages —',
            '  not one page with three headings.',
            '- `index.md` names every page, one line each. `log.md` records every compile.',
            '',
            '## Writing',
            '',
            '- **Nothing contradicted is deleted.** An older claim that turned out wrong is',
            '  annotated with a dated line saying what superseded it, so a page reads as a',
            '  history rather than a rewrite.',
            '- **Every fact carries where it came from** — session id and turn range, under the',
            '  text it supports. A wiki whose provenance cannot be audited is not worth keeping.',
            '- Write what was *learned*, not what was *said*. A transcript summary is the',
            '  mechanical output this whole idea exists to avoid.',
            ''
        ].join('\n')
    },
    {
        rel: WIKI_INDEX_REL,
        body: () => [
            '# Index',
            '',
            'One line per page, grouped by category. A compile keeps this true; a page that is',
            'not named here is a page nobody reaches.',
            ''
        ].join('\n')
    },
    {
        rel: WIKI_LOG_REL,
        body: () => [
            '# Log',
            '',
            'One entry per compile, newest at the bottom:',
            '`## [YYYY-MM-DD] compile | <Concept>` and what it wrote.',
            ''
        ].join('\n')
    }
];

/** What the Settings card asks: is this folder a wiki, and what is missing? */
export function wikiHealth(root: string, setting = ''): WikiHealth {
    const exists = !!root && fs.existsSync(root);
    // ‼️ X-138 — the health check is also the moment the drop box is REPAIRED.
    // Asking "is this folder a wiki" is the one action a user takes when
    // something looks wrong, so answering "_RAW_ is missing" and leaving it
    // missing would be a diagnosis where a fix costs one syscall. Guarded on
    // `exists`: a root that is not there is a question about a path, and a
    // question about a path must never answer by creating one.
    const rawDirs = exists ? ensureRawDirs(root) : ensureRawDirs('');
    const files: WikiHealthFile[] = WIKI_STARTERS.map(s => ({
        rel: s.rel.split(path.sep).join('/'),
        file: path.join(root, s.rel),
        found: exists && fs.existsSync(path.join(root, s.rel))
    }));
    const { pages, misplaced } = exists ? readWikiPages(root) : { pages: [], misplaced: [] };
    return {
        root, setting, exists,
        files,
        missing: files.filter(f => !f.found).map(f => f.rel),
        categories: exists ? readWikiCategories(root) : [],
        pages: pages.length,
        misplaced,
        // X-138 — the drop box, reported rather than merely repaired: a reader
        // who has never seen `_RAW_` needs to be told the folder exists and
        // where, or a feature whose whole point is drag-and-drop is invisible.
        raw: rawDirs,
        // Only the law stops a compile. A missing index or log is repaired by
        // the next compile that writes one; a missing law is a guess.
        compilable: exists && files[0].found
    };
}

/**
 * Create the wiki root and whatever of the three files is missing. Creating is
 * the only thing it does: a file already on disk is REPORTED and not touched,
 * because the user's own law is the last thing a program should overwrite.
 */
export function scaffoldWiki(root: string):
    { ok: true; root: string; created: string[]; existed: string[] } | { ok: false; error: string } {
    if (!root) { return { ok: false, error: 'The wiki root is not set — choose a folder first.' }; }
    const created: string[] = [];
    const existed: string[] = [];
    try {
        fs.mkdirSync(root, { recursive: true });
        // X-138 — the drop box is part of the shape of a wiki, so scaffolding
        // one makes it. Reported in `created` like everything else here.
        created.push(...ensureRawDirs(root).created);
        for (const s of WIKI_STARTERS) {
            const file = path.join(root, s.rel);
            const rel = s.rel.split(path.sep).join('/');
            if (fs.existsSync(file)) { existed.push(rel); continue; }
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, s.body(), 'utf8');
            created.push(rel);
        }
    } catch (e) { return { ok: false, error: String((e as Error).message) }; }
    return { ok: true, root, created, existed };
}

// --------------------------------------------------------------- bridge ops

export interface WikiDeps {
    store(): WikiStore;
    /** Where `00_WIKI` lives — the setting, resolved. */
    root(): string;
    /** X-57 — and the setting as the user TYPED it, `%USERPROFILE%` and all.
     *  Reported beside the resolved path so a root that did not expand can be
     *  seen to be a typo rather than a missing folder. '' = unset. */
    rootSetting?(): string;
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
    /**
     * ‼️ X-58 — AND IF IT IS A GHOST, HOW IT DIED. `taskAlive` answers yes or
     * no; a mark whose run ended needs to say WHY on the row, and only the host
     * can read that (the task's status, its failure phase, whether it was
     * cancelled by hand). Returning undefined is a real answer: the task is not
     * in the list at all any more, which is what a restart or a Clear Finished
     * looks like from here.
     */
    taskOutcome?(taskId: string): { status: string; reason?: string } | undefined;
    /** Which agent writes the wiki when nobody names one (the setting). */
    defaultAgent?(): string;
    /**
     * ‼️ X-57 — AND WITH WHAT INTELLIGENCE. The agent answers "whose hand";
     * these answer "how much of a model", and they are settings for the same
     * reason the agent is: a compile started from the cockpit button, from the
     * bridge, or by a schedule must be the same run. Empty = the engine's own
     * default, which is what an unset setting has always meant here.
     */
    defaultEngine?(): string;
    defaultModel?(): string;
    defaultEffort?(): string;
    /**
     * ‼️ U-95 — A COMPILE THAT FINISHED IS NEWS, AND THIS IS THE ONLY MOMENT
     * ANYBODY CAN KNOW IT DID.
     *
     * A run reports back one `wiki.candidates.edit {state:"compiled"}` at a
     * time, hours after the button was pressed and usually into a window nobody
     * is looking at. Nothing else in the system observes that moment: the task
     * ends, the row turns green, and unless the cockpit happens to be open the
     * user finds out by going and looking. So the host is handed the moment and
     * puts it on Notices — coalesced there, because a run that closes five
     * marks has done ONE thing worth telling.
     */
    announce?(a: { id: string; label: string; topics: string[]; pages: string[] }): void;
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
    /** X-58 — marks that were asked for and cannot be read. Absent when every
     *  chosen mark still has its transcript. */
    skipped?: { id: string; transcript: string; why: string }[];
    /** X-140 — where a dropped file goes once it has been compiled. Absent when
     *  no mark in this brief came out of the drop box, so a compile of ordinary
     *  turns is never told about a folder it has nothing to do with. */
    archive?: { raw: string; done: string };
    next: string[];
}

const COMPILE_STEPS = [
    'Read the rules file first — it outranks the agent procedure.',
    'Read each candidate\'s transcript over the turns named, and distil the concepts.',
    'Create or amend pages under <root>/<Category>/<Concept>.md; never delete contradicted text, annotate it with a dated line.',
    'Update index.md (one line per page) and append to log.md.',
    'Report back: wiki.candidates.edit { id, state:"compiled", pages:[…] } for each one.'
];

/**
 * ‼️ X-140 — THE EXTRA STEP A DROPPED FILE COSTS, AND WHY IT IS A STEP AND NOT
 * SOMETHING THE EXTENSION DOES.
 *
 * A CLI transcript stays where it is for ever: it is the CLI's file, the compile
 * only reads it, and reading it twice is prevented by the mark's own state. A
 * dropped file is the opposite — it is the USER'S file, sitting in a box they
 * look into, and "which of these have I already put in the wiki" is a question
 * the folder itself has to answer. So a compiled drop moves to `_RAW_/_DONE_`.
 *
 * The move is the AGENT's, not the extension's: the extension never learns that
 * a page was written (only the agent's `wiki.candidates.edit` says so), and a
 * file moved on the strength of a run that then wrote nothing would be filed as
 * done while the pool still said pending. One actor, one moment: the agent
 * moves the file in the same breath as it reports the pages.
 */
const RAW_COMPILE_STEPS = (link: string) => [
    'For a mark marked EXTERNAL FILE below: read the whole file — it has no turns to choose between.',
    `Add its provenance line to every page it feeds, in the vault's own words: \`- [YYYY-MM-DD] Harici Kaynak: [[${link}]]\` — pointing at the ARCHIVE path, which is where the file will be by the time anybody follows the link.`,
    'THEN MOVE THE FILE into the archive folder named above — create that folder first if it is not there. A compiled file left in the drop box is offered to the next compile as though nothing had happened.',
    'Move it only after its pages exist, and only for the marks you are actually reporting as compiled.'
];

/**
 * ‼️ X-58 — HOW LONG A CLAIM SURVIVES WITH NOBODY ABLE TO VOUCH FOR IT.
 *
 * Only used when there is no task manager to ask (a headless deps, a store read
 * outside the extension). When there IS one, a run that is alive is alive
 * however long it takes — a compile of forty marks is a long job and killing it
 * on a clock would be the bug, not the fix.
 */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * ‼️ X-58 — A CRASHED COMPILE MUST NOT LOCK A TURN OUT OF THE WIKI FOR EVER.
 *
 * `wiki.compile.run` stamps every mark it takes with the run's id, so a second
 * compile over the same turns is refused — reading them twice files the concept
 * twice. The stamp was only ever meant to last as long as the run, and nothing
 * took it off: a rate limit, an expired sign-in, a cancelled task or a VS Code
 * restart all left the mark `pending` with a claim on it, and every later
 * compile refused it by name. The pool said "waiting" and the turn was
 * unreachable.
 *
 * So before anything reads or acts on the pool, every claim is checked against
 * the run it names, and one whose run is over is released — with the reason
 * written onto the mark (`lastError`), because "this was tried and the model ran
 * out of quota" is a different row from "nobody has got to this yet".
 *
 * ‼️ A RUN THAT FINISHED WELL AND SAID NOTHING IS ALSO A FAILURE HERE. Nothing
 * is compiled until the agent reports back (B-14), so a `done` task over a mark
 * that is still pending means the synthesis never landed — silently the worst
 * of the four, because everything looks healthy.
 */
export function releaseStaleClaims(deps: WikiDeps, now = Date.now()): WikiCandidate[] {
    const store = deps.store();
    const freed: WikiCandidate[] = [];
    for (const c of store.candidates) {
        if (c.state !== 'pending' || !c.compileTaskId) { continue; }
        if (deps.taskAlive) {
            if (deps.taskAlive(c.compileTaskId)) { continue; }
        } else if (!c.compileStartedAt || now - c.compileStartedAt < STALE_CLAIM_MS) {
            // Nothing to ask, so the clock is all there is.
            continue;
        }
        const out = deps.taskOutcome?.(c.compileTaskId);
        c.lastError = !out
            ? 'The run that claimed this mark is no longer on the task list — VS Code was restarted, or the row was cleared. Nothing was compiled.'
            : out.status === 'done'
                ? 'The run finished without reporting any page for this mark. Nothing is compiled until it says so (wiki.candidates.edit), so the mark is still waiting.'
                : out.status === 'cancelled'
                    ? 'The run was cancelled before it wrote a page for this mark.'
                    : `The run ended as "${out.status}"${out.reason ? ` — ${out.reason}` : ''}. Nothing was compiled for this mark.`;
        c.lastErrorAt = now;
        c.compileTaskId = undefined;
        c.compileStartedAt = undefined;
        freed.push(c);
    }
    if (freed.length) { store.save(); }
    return freed;
}

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
        // ‼️ U-117 — "EVERYTHING WAITING" IS NOT "EVERYTHING UNTRIAGED". A raw
        // drop sits in the pool with no topic until a person picks one, and it
        // is the only mark that can. Refusing the whole batch over one would let
        // a single un-triaged file block Compile All for ever; taking it along
        // would file it under nothing. It is simply not part of "all" yet — and
        // it is named below if that leaves nothing to do.
        chosen = pool.filter(c => isCompilable(c));
    } else {
        need(false, 'Pass ids, topic, or all:true — a compile of "whatever is there" is never implied.');
        chosen = [];
    }
    const untriaged = pool.filter(c => !isCompilable(c));
    need(chosen.length > 0, chosen.length === 0 && untriaged.length && args.ids === undefined
        ? `Nothing is ready to compile. ${untriaged.length} mark(s) are waiting for a topic `
        + `(${untriaged.map(c => rawCandidateFile(c) || c.id).join(', ')}) — a compile files a page `
        + 'under a topic, so give them one first.'
        : 'Nothing matched — there is nothing to compile.');
    return chosen;
}

/**
 * The brief: the law, the root, what the wiki already holds, and every chosen
 * mark resolved to a transcript on disk and a turn range inside it.
 *
 * ‼️ X-58 — A MARK WHOSE TRANSCRIPT IS GONE DOES NOT TAKE THE OTHERS WITH IT.
 * A session file gets moved, pruned or cleaned out from under a mark made weeks
 * ago; a compile of twelve marks would then be a compile of nothing, and the
 * error would name the wiki root rather than the one missing file. The mark is
 * skipped instead, by name and with the path that is not there, and the other
 * eleven are compiled. Only when NONE of them can be read is there nothing to
 * do, and then the refusal says which files were looked for.
 */
export function buildBrief(deps: WikiDeps, chosen: WikiCandidate[]): WikiBrief {
    const root = deps.root();
    const rules = path.join(root, WIKI_RULES_REL);
    need(fs.existsSync(root),
        `The wiki root does not exist: ${root}. Set agentFarm.wikiRoot or create the folder before compiling.`);
    need(fs.existsSync(rules),
        `The wiki's own law is missing: ${rules}. It outranks the agent procedure, so a compile without it would be a guess.`);
    const { pages } = readWikiPages(root);

    const sessions = deps.sessions();
    const skipped: { id: string; transcript: string; why: string }[] = [];
    const readable: WikiCandidate[] = [];
    for (const c of chosen) {
        if (!c.sessionFile || !fs.existsSync(c.sessionFile)) {
            skipped.push({
                id: c.id,
                transcript: c.sessionFile || '(none recorded)',
                why: 'missing transcript — the file this mark points at is not on disk'
            });
            continue;
        }
        readable.push(c);
    }
    need(readable.length > 0,
        'None of those marks has a transcript on disk any more: '
        + skipped.map(s => `${s.id} → ${s.transcript}`).join(' · ')
        + '. Nothing can be compiled from a file that is not there — remove the marks, or restore the sessions.');

    // X-140 — the drop box only enters the brief when a mark actually came out
    // of it. A compile of ordinary turns is never told about a folder it has
    // nothing to do with, and never handed a move instruction it must not follow.
    const anyRaw = readable.some(c => isRawCandidate(c));
    const doneDir = path.join(root, WIKI_DONE_REL);
    // ‼️ X-140 — THE DESTINATION IS MADE HERE TOO, not only asked for in the
    // prompt. The root is already known good (checked above), so this is the one
    // moment the extension can heal the folder cheaply and without guessing; the
    // run is still told to create it, because the folder can go away between
    // this call and the move, and a run that only ever succeeds on a tidy disk
    // is a run that fails the first time somebody cleans up.
    if (anyRaw) { ensureRawDirs(root); }
    const linkOf = (c: WikiCandidate): string =>
        WIKI_DONE_REL.split(path.sep).join('/') + '/' + rawCandidateFile(c);

    return {
        rules,
        procedure: deps.procedure ?? '_REF/wiki.md',
        root,
        index: path.join(root, WIKI_INDEX_REL),
        log: path.join(root, WIKI_LOG_REL),
        ...(anyRaw ? { archive: { raw: path.join(root, WIKI_RAW_REL), done: doneDir } } : {}),
        // What already exists decides create-vs-amend, which is the first
        // judgement of every compile (_REF/wiki.md §3).
        existing: pages.map(p => ({ category: p.category, concept: p.concept, file: p.file })),
        candidates: readable.map(c => {
            const turns = (sessions.find(s => s.sessionId === c.sessionId)?.turns ?? []) as TurnAnchor[];
            const covered = coveredTurns(c, turns.length);
            // ‼️ X-140 — WHERE THIS FILE MUST END UP, AND WHAT TO CALL IT ON THE
            // PAGE. Both are computed here rather than left to the run: a model
            // asked to "work out the archive path" will work out a plausible one,
            // and a provenance link that points at where the file USED to be is
            // broken the moment the move it is next to succeeds.
            const rawBits = isRawCandidate(c)
                ? {
                    rawArchive: path.join(doneDir, rawCandidateFile(c)),
                    rawLink: linkOf(c),
                    // The note is not "why it was kept" for a drop — it is the
                    // only way to say which part of a file matters, because
                    // there are no turns to exclude. It travels as a directive.
                    directive: c.note || null
                }
                : {};
            return {
                ...candidateView(c),
                ...rawBits,
                // The transcript and the range, so the agent reads the turns
                // itself rather than trusting a summary of them.
                transcript: c.sessionFile,
                readTurns: c.fromTurn === 0 ? 'all' : `${c.fromTurn}-${c.toTurn}`,
                // ‼️ X-58 — and WHICH turns those are, with what each one opened
                // with. A range is a pair of numbers; a list of numbered
                // openings is something a reader (and a model) can check itself
                // against, and it is the only way an exclusion is visible as a
                // gap rather than as a footnote nobody applied.
                sessionTurns: turns.length,
                turnList: covered,
                turnTitles: covered.map(n => ({
                    n, label: String(turns.find(t => t.n === n)?.label ?? '').slice(0, 120)
                })).filter(t => t.label)
            };
        }),
        // X-58 — reported, never silently dropped: a compile that quietly did
        // eleven of twelve is a compile whose twelfth is lost for good.
        ...(skipped.length ? { skipped } : {}),
        next: anyRaw
            ? [...COMPILE_STEPS, ...RAW_COMPILE_STEPS(WIKI_DONE_REL.split(path.sep).join('/') + '/<file>')]
            : COMPILE_STEPS
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
    // X-140 — only when a mark in this brief actually came out of the drop box.
    if (brief.archive) {
        L.push(`- drop box: \`${brief.archive.raw}\` — where the user saves conversations from elsewhere`);
        L.push(`- archive: \`${brief.archive.done}\` — where you MOVE a dropped file once its pages exist`);
    }
    L.push('');
    /**
     * ‼️ X-58 — ONE BLOCK PER MARK, AND THE SCOPE IS SPELLED OUT RATHER THAN
     * IMPLIED. This was four dashes on one line, and the exclusions had nowhere
     * to go but a parenthesis at the end of a range — which is exactly the kind
     * of instruction a model reads past. A heading per mark, the file, the turn
     * numbers as numbers, what each one opened with, and, where there are
     * exclusions, a line that cannot be read as anything else.
     */
    L.push('## What to read');
    L.push('');
    for (const c of brief.candidates) {
        const topics = Array.isArray(c.topics) ? (c.topics as string[]).join(', ') : String(c.topics ?? '');
        const list = Array.isArray(c.turnList) ? c.turnList as number[] : [];
        const excl = Array.isArray(c.excludeTurns) ? c.excludeTurns as number[] : [];
        const titles = Array.isArray(c.turnTitles)
            ? c.turnTitles as { n: number; label: string }[] : [];
        /**
         * ‼️ X-140 — AN EXTERNAL FILE IS DECLARED AS ONE, IN THE FIRST LINE OF
         * ITS OWN BLOCK. Everything else in this section is written in the
         * grammar of a CLI transcript — a turn scope, turn numbers, what each
         * turn opened with — and a markdown export dropped into `_RAW_` has none
         * of it. A run handed `turn scope: whole file` under a heading that
         * looks like every other heading will go looking for turns.
         */
        const isRaw = c.raw === true;
        L.push(`### ${c.id} — filed under: ${topics}`);
        L.push('');
        if (isRaw) {
            L.push('- ‼️ **EXTERNAL FILE — NOT A CLI SESSION.** Somebody saved this conversation out of a'
                + ' browser and dropped it into the wiki\'s `_RAW_` folder. It has no turns: read the whole file.');
            L.push(`- **file:** \`${c.transcript}\``);
            if (c.directive) {
                // The one instruction only a person could give about a file, and
                // the only thing that narrows a scope that cannot be narrowed by
                // turn numbers. It is shouted because a note on a transcript is
                // context and a note on a file is an ORDER.
                L.push(`- ⚠️ **KULLANICI DİREKTİFİ / USER DIRECTIVE:** ${String(c.directive)}`);
                L.push('  Follow it exactly — it is the only way the person could say which part of this'
                    + ' file matters, and it outranks your own judgement about what is worth keeping in it.');
            }
            L.push(`- **provenance line for every page this feeds:** \`- [YYYY-MM-DD] Harici Kaynak: [[${String(c.rawLink)}]]\``);
            L.push(`- **‼️ WHEN ITS PAGES EXIST, MOVE IT:** \`${c.transcript}\` → \`${String(c.rawArchive)}\``);
            L.push('  Create the destination folder first if it is missing. Do not move it if you wrote no page for it.');
            if (c.label) { L.push(`- **its first line:** ${String(c.label).slice(0, 160)}`); }
            L.push('');
            continue;
        }
        L.push(`- **transcript:** \`${c.transcript}\``);
        L.push(`- **turn scope:** ${c.turns}`
            + (c.sessionTurns ? ` · the conversation is ${c.sessionTurns} turn(s) long` : ''));
        if (list.length) {
            L.push(`- **read exactly these turns:** ${list.join(', ')}`);
        }
        if (excl.length) {
            L.push(`- ‼️ **TURN SCOPE: ${c.readTurns} — EXCEPT TURNS ${excl.join(', ')}, WHICH ARE`
                + ' EXCLUDED. DO NOT INCLUDE ANYTHING FROM THOSE TURNS IN THE ANALYSIS.** They were'
                + ' left out deliberately by the person who marked this; treat them as if they were'
                + ' not in the file.');
        }
        if (c.note) { L.push(`- **why it was kept:** ${String(c.note)}`); }
        if (c.label) { L.push(`- **opening line:** ${String(c.label).slice(0, 160)}`); }
        if (titles.length) {
            L.push('- **the turns, as the transcript numbers them:**');
            for (const t of titles.slice(0, 40)) { L.push(`  - ${t.n}. ${t.label}`); }
            if (titles.length > 40) { L.push(`  - …and ${titles.length - 40} more`); }
        }
        L.push('');
    }
    if (brief.skipped?.length) {
        // ‼️ Told, not hidden. A run that silently compiled eleven of twelve
        // would leave the twelfth looking waited-for for ever.
        L.push('## Marks that could NOT be included');
        L.push('');
        for (const s of brief.skipped) {
            L.push(`- **${s.id}** — ${s.why}: \`${s.transcript}\``);
        }
        L.push('');
        L.push('Do not invent anything for these. Say in your report that they were skipped.');
        L.push('');
    }
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
    /**
     * ‼️ X-140 — THE MOVE IS PART OF REPORTING, NOT A TIDY-UP AFTERWARDS.
     *
     * Two things have to happen for a dropped file and neither implies the
     * other: the pool has to be told the pages exist, and the folder the user
     * looks into has to stop offering the file. A run that did one and not the
     * other leaves either a compiled mark whose file is offered again on the
     * next scan, or a file in `_DONE_` that the pool still calls pending. So
     * they are named together, in the same block, in the same breath.
     */
    const raws = brief.candidates.filter(c => c.raw === true);
    if (raws.length && brief.archive) {
        L.push('');
        L.push(`### ‼️ And for the ${raws.length} EXTERNAL FILE(S), one more thing in the same breath`);
        L.push('');
        L.push(`Make sure \`${brief.archive.done}\` exists (create it if it does not), then move each file`);
        L.push('you reported as compiled out of the drop box and into it:');
        L.push('');
        L.push('```');
        for (const c of raws) { L.push(`${c.transcript}  ->  ${String(c.rawArchive)}`); }
        L.push('```');
        L.push('');
        L.push('The move and the report go together. A file left in the drop box is offered to the next');
        L.push('compile as though nothing had happened; a file moved without the report leaves the pool');
        L.push('saying it is still waiting for a file that is no longer where the mark points.');
    }
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
    const raw = isRawCandidate(c);
    return {
        id: c.id,
        session: shortOf(c.sessionId),
        sessionId: c.sessionId,
        // ‼️ U-117 — WHAT THIS ROW IS, said once, for every reader. A dropped
        // file is not a session: it has no turns to choose between and no CLI
        // behind it, and a surface that had to spot it by pattern-matching the
        // engine string would spot it in some places and not others.
        raw,
        rawFile: raw ? rawCandidateFile(c) : null,
        // ‼️ Has a compile already archived it? `_RAW_/_DONE_` is where a
        // compiled drop goes (X-140), so the folder the file is IN is the third
        // stage of its life and the only place that fact is recorded. Asked of
        // the path rather than of a flag, because the agent moves the file and
        // nothing writes a flag when it does.
        rawDone: raw && String(c.sessionFile ?? '').split(/[\\/]/).includes('_DONE_'),
        // Where the file actually is — `_RAW_` while it waits, `_RAW_/_DONE_`
        // once a compile has archived it (X-140). It is the answer to "which
        // one of these is that", so the row can show it on hover.
        sessionFile: c.sessionFile || null,
        // A raw drop has no topic until somebody gives it one, and it is the
        // only mark in the pool that can be in that state.
        compilable: isCompilable(c),
        turns: (raw ? 'whole file'
            : c.fromTurn === 0 ? 'whole session'
                : c.fromTurn === c.toTurn ? String(c.fromTurn) : `${c.fromTurn}-${c.toTurn}`)
            // X-58 — the exclusions are part of what the mark IS, so they travel
            // with the one string every surface prints. A row that said "whole
            // session" while two turns were being left out was a row that lied
            // about what a compile would read.
            + ((c.excludeTurns ?? []).length ? ` (except ${c.excludeTurns!.join(', ')})` : ''),
        excludeTurns: c.excludeTurns ?? null,
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
        compileStartedAt: c.compileStartedAt ?? null,
        // X-58 — why the last attempt over this mark produced no page. A row
        // carrying one is still pending work, but it is pending work somebody
        // has already tried, which reads completely differently.
        lastError: c.lastError ?? null,
        lastErrorAt: c.lastErrorAt ?? null
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
    // X-58 — the turns inside the scope that are not part of it. Passing an
    // empty list is how you take the exclusions off again.
    if (args.excludeTurns !== undefined) {
        const list = normTurnList(args.excludeTurns);
        c!.excludeTurns = list.length ? list : undefined;
    }
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
        // X-58 — a mark that has just been compiled, or dropped, is not a mark
        // carrying the reason its last compile failed.
        if (st !== 'pending') { c!.lastError = undefined; c!.lastErrorAt = undefined; }
    }
    // ‼️ X-58 — `retry: true` is the row's [↻ Try again]: it takes the reason
    // off and hands the mark back to the pool clean, which is the whole gesture
    // once a quota has refilled or a sign-in has been repaired. It is a separate
    // argument rather than an implied side effect of any edit, because clearing
    // the record of a failure is not something to do by accident.
    if (args.retry === true) {
        c!.lastError = undefined;
        c!.lastErrorAt = undefined;
        c!.compileTaskId = undefined;
        c!.compileStartedAt = undefined;
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
    // X-138 — same repair as the health check, on the same guard: this is the
    // op an agent calls before it goes looking for dropped files, so the folder
    // it is about to read is made ready first rather than reported absent.
    const rawDirs = root && fs.existsSync(root) ? ensureRawDirs(root) : ensureRawDirs('');
    // X-139 — and the box is read while we are standing in front of it. This is
    // the op every surface calls to ask what the pool holds, so a file dropped
    // a second ago is already a candidate by the time the answer is written.
    const rawSync = rawDirs.ready ? syncRawCandidates(root, deps.store()) : undefined;
    const rules = path.join(root, WIKI_RULES_REL);
    const { pages, misplaced } = readWikiPages(root);
    // X-58 — asking what the pool holds is one of the moments a dead claim is
    // noticed, so it is one of the moments it is released.
    const freed = releaseStaleClaims(deps);
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
            // X-58 — pending marks whose last attempt produced no page. Still
            // waiting, but waiting for a second try rather than a first.
            failed: pool.filter(c => c.state === 'pending' && c.lastError).length,
            // ‼️ U-117 — files somebody dropped, and how many of them nobody has
            // filed yet. Two figures rather than one, because "12 external
            // files" and "3 of them still need a category" are different
            // questions and only the second is a thing to go and do.
            raw: pool.filter(c => isRawCandidate(c)).length,
            untriaged: pool.filter(c => c.state === 'pending' && !c.topics.length).length,
            ...(freed.length ? { justReleased: freed.map(c => c.id) } : {}),
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
            // X-138 — where to drop an external transcript, and where a
            // compiled one goes. Absolute, because the caller is a person or an
            // agent about to use a file path, not this module.
            raw: rawDirs.raw, rawReady: rawDirs.ready, done: rawDirs.done,
            // ‼️ X-139 — WHAT THIS CALL ITSELF CHANGED, said out loud. A scan
            // that silently rewrites the pool is a scan nobody can debug: an
            // agent that drops a file and then asks the status sees its own
            // candidate appear in the same answer, by id.
            ...(rawSync && (rawSync.added.length || rawSync.moved.length || rawSync.lost.length)
                ? { rawSync } : {}),
            // ‼️ U-91/U-92 — the FOLDERS, not the categories that happen to hold
            // a page. A folder somebody made in Obsidian this morning is a
            // category the moment it exists, and a status that omitted it was
            // the one surface still disagreeing with the picker.
            categories: readWikiCategories(root).map(c => c.name),
            misplaced
        }
    };
}

/** `wiki.compile.run` — the brief, started as a headless run instead of read. */
export function startCompileRun(deps: WikiDeps, args: Record<string, unknown>): Record<string, unknown> {
    need(!!deps.startCompile,
        'This build has no way to start a run — wiki.compile hands back the brief and you do the work.');
    // ‼️ X-58 — BEFORE ANYTHING ELSE: a claim whose run is over is not a claim.
    // Without this the refusal below would name a compile that died last week.
    releaseStaleClaims(deps);
    const chosen = chooseCandidates(deps.store(), args);
    // ‼️ U-117 — ASKED FOR BY NAME AND NOT READY. `all` leaves an untagged raw
    // drop out silently because it was never asked for; naming its id is asking
    // for it, and quietly compiling it under no topic — or quietly skipping the
    // one mark the caller pointed at — are both worse than saying so.
    const untagged = chosen.filter(c => !c.topics.length);
    need(untagged.length === 0,
        `${untagged.length} of those have no topic yet: `
        + untagged.map(c => rawCandidateFile(c) || c.id).join(', ')
        + '. A topic is the key the compile files the page under, so it is the one thing '
        + 'a run cannot supply for itself — pick one in the cockpit, or pass it with wiki.candidates.edit.');
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
    // X-57 — what the call said, else what Settings says, else the engine's own
    // default. One resolution, so the cockpit's button and the op cannot start
    // two different runs over the same marks.
    const engine = optStr(args, 'engine') || (deps.defaultEngine ? deps.defaultEngine() : '');
    const model = optStr(args, 'model') || (deps.defaultModel ? deps.defaultModel() : '');
    const effort = optStr(args, 'effort') || (deps.defaultEffort ? deps.defaultEffort() : '');
    const run = deps.startCompile!({
        title,
        prompt: compilePrompt(brief),
        agent: optStr(args, 'agent') || (deps.defaultAgent ? deps.defaultAgent() : ''),
        engine, model, effort,
        start: args.start !== false
    });
    const at = Date.now();
    // ‼️ X-58 — ONLY WHAT THE RUN IS ACTUALLY GOING TO READ IS CLAIMED. A mark
    // whose transcript is gone was never handed to the run, so stamping it
    // would lock it behind a compile that is not about it — and it keeps its
    // own reason instead, which is what the row needs to say.
    const skippedIds = new Set((brief.skipped ?? []).map(s => s.id));
    for (const c of chosen) {
        if (skippedIds.has(c.id)) {
            const why = brief.skipped!.find(s => s.id === c.id)!;
            c.lastError = `Skipped: ${why.why} (${why.transcript}).`;
            c.lastErrorAt = at;
            continue;
        }
        c.compileTaskId = run.taskId;
        c.compileStartedAt = at;
        // The reason belongs to the LAST attempt; a fresh run replaces it.
        c.lastError = undefined;
        c.lastErrorAt = undefined;
    }
    deps.store().save();
    return {
        taskId: run.taskId, agent: run.agent, started: run.started, title,
        // What it is actually running with, resolved — the caller passed some
        // of this and the settings supplied the rest, and "which model wrote
        // that page" is the first question asked of a compile afterwards.
        engine: engine || 'claude', model: model || null, effort: effort || null,
        marks: brief.candidates.length,
        topics,
        reads: brief.candidates.map(c => ({
            id: c.id, transcript: c.transcript, turns: c.turns,
            ...(Array.isArray(c.excludeTurns) && (c.excludeTurns as number[]).length
                ? { excludeTurns: c.excludeTurns } : {})
        })),
        ...(brief.skipped?.length ? { skipped: brief.skipped } : {}),
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
            describe: 'Mark a turn (or a whole session) as worth compiling into the wiki. Cheap and reversible: it writes to the candidate pool, never to the vault. args: session (session id — a 6+ char prefix is enough), topics (what it is ABOUT — a string, "a, b" or a list; this is the compiler\'s filing key), turn? (4, "3-7", or omit for the whole conversation), excludeTurns? (X-58 — turn numbers inside that scope to leave OUT, e.g. [14,15]: the cheap way to say "the whole session except the last two"), note? (why it is worth keeping), by? (who marked it; default "agent"). Marking the SAME RANGE again merges topics into that row rather than adding a second one; a different range is a different mark, so a whole-session mark no longer swallows the single turns marked inside it.',
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
                // X-58 — exclusions are only meaningful inside the scope, so a
                // number outside it is dropped rather than kept as a puzzle for
                // whoever reads the row later.
                const lo = range.from === 0 ? 1 : range.from;
                const hi = range.from === 0 ? (turns.length || Number.MAX_SAFE_INTEGER) : range.to;
                const exclude = args.excludeTurns === undefined ? undefined
                    : normTurnList(args.excludeTurns).filter(n => n >= lo && n <= hi);
                const { candidate, merged } = S().add({
                    sessionId: s.sessionId,
                    sessionFile: s.file,
                    engine: s.source ?? s.producerEngine ?? 'claude',
                    agentName: s.agentName ?? '',
                    fromTurn: range.from, toTurn: range.to,
                    ...(exclude && exclude.length ? { excludeTurns: exclude } : {}),
                    topics, label,
                    note: optStr(args, 'note'),
                    addedBy: optStr(args, 'by') || 'agent'
                });
                return {
                    ...candidateView(candidate), merged,
                    pending: S().candidates.filter(c => c.state === 'pending').length,
                    ...(merged ? {
                        note2: 'This exact range was already marked on this conversation — the topics were merged into that row rather than adding a second one.'
                    } : {})
                };
            }
        },
        {
            op: 'wiki.candidates.list',
            describe: 'The candidate pool. args: state? (pending|compiled|dropped|all — default pending), topic? (only marks carrying it), session? (id prefix), limit? (default 50). Newest first.',
            handler: (args) => {
                // X-58 — the list is the cockpit's own source, so a claim whose
                // run died is released here too: a row cannot show [↻ Try again]
                // for a lock nobody has taken off.
                releaseStaleClaims(deps);
                // X-139 — and for the same reason the drop box is read here: the
                // cockpit draws itself from this list, so a file dropped into
                // `_RAW_` has to be in it or the folder is a box nothing comes
                // out of. Nothing is created on disk — see `syncRawCandidates`.
                const wikiRoot = deps.root();
                if (wikiRoot && fs.existsSync(wikiRoot)) { syncRawCandidates(wikiRoot, S()); }
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
            describe: 'Change a candidate. args: id, then any of topics? (replaces the list), addTopics? (adds to it), note?, excludeTurns? (X-58 — turn numbers inside the scope to leave out; pass [] to take the exclusions off), state? (pending|compiled|dropped), pages? (the wiki files a compile wrote for it — provenance read backwards), retry? (true = clear the reason the last compile failed and release any claim, so the mark is a clean pending row again). Setting state=compiled stamps the time; this is how a compile reports back (_REF/wiki.md §8 step 6).',
            handler: (args) => {
                // ‼️ U-95 — the transition, read on both sides of the write. A
                // mark that was already `compiled` and is edited again (its
                // pages corrected, a topic fixed) is not a compile finishing,
                // and announcing it would be the farm telling the user
                // something they just did.
                const id = optStr(args, 'id');
                const was = id ? S().get(id)?.state : undefined;
                const out = editCandidate(S(), args);
                const now = id ? S().get(id) : undefined;
                if (deps.announce && was !== 'compiled' && now && now.state === 'compiled') {
                    try {
                        deps.announce({
                            id: now.id, label: now.label || '',
                            topics: [...now.topics], pages: [...(now.pages ?? [])]
                        });
                    } catch { /* news is never worth failing a write over */ }
                }
                return out;
            }
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
            describe: 'What the pool holds and what the wiki holds. No arguments. Reports both sides: pending/compiled marks and their topics, and the vault\'s own state (root, rules, index, log, page count). X-138 — also `raw` / `done`: the drop-box folder an external transcript is left in and the archive a compiled one moves to. Both are created if missing before the answer is built, so `rawReady` is what to check rather than a stat.',
            handler: () => wikiStatus(deps)
        },
        {
            op: 'wiki.health',
            describe: 'X-57 — is the folder chosen as the wiki root actually a wiki? No arguments. Reports the resolved root (portable variables in agentFarm.wikiRoot are expanded), whether it exists, which of the three files a compile needs are there (_KURALLAR_/-WIKI-ANAYASA-.md, index.md, log.md), the categories and page count, folders nested deeper than one level, and `compilable` — false when the law is missing, which is the one absence that stops every compile. ‼️ X-138 — it also REPAIRS the drop box on the way past: `_RAW_` and `_RAW_/_DONE_` are created if they are not there (silently, recursively, relative to the root) and reported under `raw`. Only when the root itself exists — a question about a path never answers by creating one.',
            handler: () => wikiHealth(deps.root(), deps.rootSetting ? deps.rootSetting() : '')
        },
        {
            op: 'wiki.init',
            describe: 'X-57 — make the chosen root a wiki: create the folder and whatever of _KURALLAR_/-WIKI-ANAYASA-.md, index.md and log.md is missing, from starters. ‼️ It only CREATES: a file already on disk is reported as existing and is never rewritten, because the law is the user\'s own. No arguments.',
            handler: () => {
                const r = scaffoldWiki(deps.root());
                need(r.ok, r.ok ? '' : r.error);
                return { ...r, health: wikiHealth(deps.root(), deps.rootSetting ? deps.rootSetting() : '') };
            }
        },
        {
            op: 'wiki.compile',
            describe: 'Assemble what it takes to compile marked turns into the wiki, and hand it back as a brief: the rules, the root, what the wiki already holds, and each candidate resolved to a transcript and a turn range. args: ids? (a list) or topic? (every pending mark carrying it) or all? (true = every pending mark). ‼️ It writes NO wiki page — synthesis is the agent\'s, under the vault\'s own law — and it marks nothing compiled; report back with wiki.candidates.edit {state:"compiled", pages:[…]} when the pages exist. ‼️ X-140 — a mark that came out of the `_RAW_` drop box carries three extra things: it is an EXTERNAL FILE with no turns (read all of it), its note is a USER DIRECTIVE rather than context, and once its pages exist YOU move the file into `_RAW_/_DONE_` (creating that folder if it is gone) — a compiled file left in the drop box is offered again on the next scan. A mark with no topic at all is not compilable and is refused by name.',
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
