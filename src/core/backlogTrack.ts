import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BacklogItem, BacklogState, isLive } from './projectBacklog';
import { localDay, localStamp } from './projectDocs';

/**
 * The backlog TRACK — which session, and which turn of it, an item was worked in.
 *
 * A backlog code is permanent (`K-8` means this item forever) and a transcript
 * holds every word of every turn. What has been missing is the join: the code
 * cannot be asked "show me the turns where you were worked on", so hundreds of
 * sessions sit on disk as an unsearchable pile. This module is that join.
 *
 * ‼️ TWO FILES, TWO OWNERS, AND THE SPLIT IS THE WHOLE DESIGN.
 *
 *   THE LEDGER (`<archive>/_tracks/backlog-track.jsonl`) — the machine's.
 *       Append-only, one JSON object per line, never edited in place. It holds
 *       the EVENTS: code, what happened, when, which session, which turn, by
 *       whom, and how sure we are. Append-only is not tidiness: two windows and
 *       an agent can all write in the same second, and appending is the only
 *       write with no lost update.
 *
 *   THE LOG (`Backloglog.md`, next to `Backlog.md`) — shared.
 *       Agent Farm rebuilds each item's DATA line and its session rows out of
 *       the ledger. Everything else in an item's block — a closing note, a
 *       warning to a future reader, a hand-written correction — is READ BACK
 *       and written out again untouched. So the machine owns the facts, the
 *       human owns the prose, and neither can quietly overwrite the other.
 *
 * The reason the log is a document and not just a panel: a project folder
 * travels in git with the vault and opens in Obsidian with no extension
 * running. A record of how work actually went that only exists inside a VS Code
 * window is a record that dies with the machine.
 *
 * Everything here is `fs` and strings — no `vscode` — so all of it is testable.
 */

// ---------------------------------------------------------------------------
// the schema
// ---------------------------------------------------------------------------

/**
 * What happened to an item in a turn.
 *
 * `touch` is the one that is not a state change and it is the reason the ledger
 * is worth keeping: most work on an item is not the moment it closes. Three
 * sessions of digging that ended in "still not found" is exactly the history a
 * person needs three months later, and a log that only records endings throws
 * it away.
 *
 * ‼️ X-135 — `opened` IS THE EVENT THE LEDGER WAS MISSING, AND ITS ABSENCE HAD
 * A VISIBLE COST. Every other event is something that happens to an item that
 * already exists; nothing recorded the item COMING INTO EXISTENCE. So a
 * freshly written item had no record at all — `openedAt` and `touchedAt` were
 * both null, and both time orderings sank it to the bottom, under items last
 * worked on months ago. Measured: 43 open items, 5 with any record, so "last
 * touched" answered `X-97` every single time it was asked. It is written by
 * whichever door creates the coded line, so "when did this appear" stops being
 * a question only the git history of somebody's vault can answer.
 */
export type TrackEvent = 'opened' | 'touch' | 'doing' | 'done' | 'cancelled' | 'reopen';
export const TRACK_EVENTS: TrackEvent[] = ['opened', 'touch', 'doing', 'done', 'cancelled', 'reopen'];

/** Where the record came from — which is a statement about how much to trust
 *  its session and turn, not about what kind of work it was. */
export type TrackSource =
    | 'agent'      // an agent wrote it through the bridge, mid-turn
    | 'panel'      // the user clicked in Agent Farm — real, but no session
    | 'outside'    // the file changed without us: ticked in Obsidian, or by hand
    | 'backfill';  // reconstructed afterwards from evidence, never observed

export const TRACK_SOURCES: TrackSource[] = ['agent', 'panel', 'outside', 'backfill'];

/**
 * ‼️ P-14 — AN AGENT DOES NOT CLOSE AN ITEM WITHOUT SAYING WHAT IT DID.
 *
 * ‼️ P-14 (V2) — AND THE RULE LIVES WITH THE LEDGER, NOT ON ONE DOOR. It was
 * written into `projects.backlog.check`, which is the door an agent SHOULD use
 * — while `projects.track { event:"done" }` writes the same closing event into
 * the same ledger, decides the same "closed" answer on the Track page, and left
 * `note` optional. A contract one op enforces and the next one beside it does
 * not is not a contract; it is a habit. So the floor is checked by whatever
 * writes the record, and every door inherits it.
 *
 * Only `agent` is held to it. A person clicking the checkbox in the panel is
 * looking at the thing they just did; `outside` is a box ticked in Obsidian
 * with nobody to ask; `backfill` is reconstruction, which by definition has no
 * note to give. Refusing those would only mean losing the event.
 */
export const CLOSING_NOTE_MIN = 15;

/** The refusal sentence, or undefined when the record may be written. */
export function closingNoteRefusal(o: {
    by: TrackSource; event: TrackEvent; note?: string;
}): string | undefined {
    if (o.by !== 'agent') { return undefined; }
    if (o.event !== 'done' && o.event !== 'cancelled') { return undefined; }
    if ((o.note ?? '').trim().length >= CLOSING_NOTE_MIN) { return undefined; }
    return `closing ${o.event === 'done' ? 'an item' : 'an item as cancelled'} needs a `
        + '`note`: one or two sentences saying what was done, how it was closed, and '
        + 'anything a reader should watch out for later. That note IS the answer to '
        + '"how was this solved" three months from now — every surface that shows a '
        + 'closure shows it, and it is the one part nothing else can reconstruct.';
}

/**
 * ‼️ WHY THE (session, turn) ON THIS RECORD IS NOT CERTAIN. Absent means it is.
 *
 * The reason is stored as a CODE rather than a boolean, because "we could not
 * tell which of your two sessions this was" and "nothing was running, so this
 * has no session at all" are different facts, and a reader who cannot tell them
 * apart has to treat every uncertain row as worthless. Guessing silently is
 * worse than either: a wrong session id looks exactly like a right one.
 */
export type TrackDoubt =
    | 'multi'      // more than one live session of that agent could have been the caller
    | 'none'       // nothing was live — no session could be named at all
    | 'stale'      // the only candidate's last sign of life was too long ago
    | 'turn'       // the session is certain; its turn number is not
    | 'guess';     // reconstructed from a date, not observed

export const TRACK_DOUBTS: TrackDoubt[] = ['multi', 'none', 'stale', 'turn', 'guess'];

export interface TrackRecord {
    /** `K-8`. An item with no code cannot be tracked — the code is the only
     *  handle that survives the item being reworded or moved. */
    code: string;
    event: TrackEvent;
    /** Milliseconds. ‼️ Also the address the session viewer scrolls to, which is
     *  why it is stored even though `turn` is what a person reads. */
    ts: number;
    session?: string;
    /** 1-based turn number inside that session. */
    turn?: number;
    agent?: string;
    by: TrackSource;
    uncertain?: TrackDoubt;
    /** One line of free text. The closing NOTE does not live here — it lives in
     *  the document, where a person can rewrite it. This is the event's own
     *  caption ("root cause not found"). */
    note?: string;
    /**
     * ‼️ True only when the note hit `TRACK_NOTE_MAX` — the twin of `prevCut`,
     * and it was missing for a release.
     *
     * The ceiling here is editorial and deliberate (a note is a note, the report
     * goes in the vault), so a cut is not a defect — being unable to SEE the cut
     * is. `prevText` said so on the record and a note only trailed off in a `…`,
     * which is exactly the ambiguity this whole area was built to remove: a
     * reader cannot tell a ceiling from a writer who stopped, and the caller was
     * told nothing at all. Absent is the normal case.
     */
    noteCut?: boolean;
    /**
     * ‼️ X-36 — THE WORDS THE ITEM HAD WHEN IT WAS REOPENED. Only ever set on a
     * `reopen`, and it is the whole mechanism behind "a reopened item carries
     * its rounds".
     *
     * Reopening an item used to hand its old text straight back, so the person
     * doing it had to decide, by hand and every time, whether to delete what was
     * there, keep it, or write around it — and whatever they chose, the NEXT
     * agent got one paragraph with no way to tell which round it belonged to.
     * The text is taken at the moment the state changes, by whichever door
     * changed it, so the item's line is free for the new words and round N-1 is
     * not something anybody has to preserve on purpose.
     *
     * ‼️ IT IS KEPT WHOLE — see TRACK_PREV_MAX. It shared the note's 2,000-char
     * ceiling for one release and that silently truncated real requests.
     */
    prevText?: string;
    /** True only when `prevText` hit TRACK_PREV_MAX — so a reader can tell a cut
     *  from a user who stopped writing. Absent is the normal case. */
    prevCut?: boolean;
    /**
     * ‼️ X-36 (reopened) — "this is the line AS WE FIRST SAW IT, not necessarily
     * what it said before."
     *
     * Only ever set by `reconcileOutside`, and only when it had no snapshot to
     * compare against. Un-ticking a box in Obsidian produces no event, so the
     * reopen is noticed the next time the file is read — and if the user
     * un-ticked the box AND rewrote the line in the same save, the text read
     * then is the NEW wording. Storing that as the previous round is a lie that
     * looks exactly like the truth, which is the worst kind of record. It is
     * still stored, because in the ordinary case (box un-ticked, words left
     * alone) it IS the previous round and dropping it would lose the common
     * case to protect against the rare one — but it is stored SAID.
     */
    prevGuess?: boolean;
    /**
     * ‼️ X-36 (V2) — A ROUND WHOSE WORDING WAS LOST IS COMPLETED BY ANOTHER
     * RECORD, NOT BY EDITING THE OLD ONE.
     *
     * Rounds recorded before the ceiling was raised carry a `prevText` cut at
     * 2,000 characters, mid-sentence. The words themselves are often still
     * recoverable — from the backlog file, from git, from a transcript — but
     * the ledger is APPEND-ONLY, and quietly rewriting a line in it would make
     * every other line unbelievable: a history a surface can edit is not a
     * history.
     *
     * So a correction is its own record, pointing at the `ts` of the reopen it
     * completes and carrying the full text. The reopen line stays exactly as it
     * was written; every reader (summarizeCode) applies the correction on top
     * and marks the round `prevRestored`, so nobody mistakes recovered words
     * for words captured at the time.
     */
    restoresTs?: number;
    /**
     * ‼️ P-14 (V3) — THE SAME CORRECTION, FOR A CLOSING NOTE.
     *
     * `restoresTs` alone completes a REOPEN's lost wording. A closing note
     * written before `TRACK_NOTE_MAX` was raised is cut at 300 characters and
     * ends mid-sentence, and that is the one line in this whole record a person
     * reads three months later — so the same append-only repair has to reach
     * it. This flag says which of the two fields the correction is about; the
     * record it points at is untouched either way.
     */
    restoresNote?: true;
    /**
     * Derived, never stored: `summarizeCode` sets it on the round it just
     * completed from a correction record. Serialization ignores it.
     */
    prevRestored?: boolean;
    /** Derived, never stored: the twin of `prevRestored` for a closing note. */
    noteRestored?: boolean;
}

/** The ledger's file name inside the tracks folder. */
export const TRACK_FILE = 'backlog-track.jsonl';

/** How long a live session may have been quiet and still be assumed to be the
 *  caller. An agent that writes to the bridge is by definition mid-turn, so its
 *  last hook event is seconds old; ten minutes is generous enough to survive a
 *  long tool call and short enough that yesterday's stalled session does not get
 *  the credit. */
export const TRACK_LIVE_WINDOW_MS = 10 * 60 * 1000;

/**
 * ‼️ P-14 — HOW MUCH ROOM A CLOSING NOTE GETS.
 *
 * It was 300 characters, applied without a word, and a closing note is the one
 * thing in this whole record a PERSON reads three months later: what was done,
 * how it was closed, and what to watch out for. Three hundred characters ends
 * that sentence somewhere in the middle of the second clause — and, because
 * nothing marked the cut, a reader could not tell the truncation from a writer
 * who had simply stopped.
 *
 * The ledger is one JSON line per record and the log is a document, so the room
 * costs nothing worth counting. It is still capped, because a note is a note
 * and not a report — the report goes in the vault and the note points at it.
 */
export const TRACK_NOTE_MAX = 2000;

/**
 * ‼️ X-36 (reopened) — A PREVIOUS ROUND'S WORDING IS NOT A NOTE, AND MUST NOT
 * SHARE THE NOTE'S CEILING.
 *
 * `prevText` went through `TRACK_NOTE_MAX` because both are "some text on a
 * record", and the two are opposites: a note is something an agent WRITES, and
 * capping it is an editorial rule. `prevText` is the USER'S OWN REQUEST, taken
 * off the line a moment before it is overwritten — it is the last copy that
 * exists anywhere, and this project's real items run past 2,000 characters
 * routinely. Cutting it was destroying the very thing the feature was built to
 * keep. (X-36's own line is where it was caught: the stored round ends
 * "…işte bütün bunların bir…", mid-sentence, and the rest is gone.)
 *
 * So it is kept WHOLE. The ceiling here is a guard against a pathological
 * paste making one ledger line megabytes long, not an editorial limit — an
 * order of magnitude above the longest item this has ever seen — and a record
 * that hits it says so in `prevCut` rather than trailing off silently.
 */
export const TRACK_PREV_MAX = 32000;

// ---------------------------------------------------------------------------
// the ledger — reading and appending
// ---------------------------------------------------------------------------

/** One record as a line. Keys in a fixed order so a diff of the ledger reads
 *  like a table rather than like churn. */
export function serializeTrack(rec: TrackRecord): string {
    const out: Record<string, unknown> = {
        code: rec.code, event: rec.event, ts: rec.ts
    };
    if (rec.session) { out.session = rec.session; }
    if (typeof rec.turn === 'number') { out.turn = rec.turn; }
    if (rec.agent) { out.agent = rec.agent; }
    out.by = rec.by;
    if (rec.uncertain) { out.uncertain = rec.uncertain; }
    if (rec.note) { out.note = rec.note; }
    if (rec.noteCut) { out.noteCut = true; }
    if (rec.prevText) { out.prevText = rec.prevText; }
    if (rec.prevCut) { out.prevCut = true; }
    if (rec.prevGuess) { out.prevGuess = true; }
    // `prevRestored` is derived by summarizeCode and never written: it is a
    // statement ABOUT a pair of records, not a fact either of them carries.
    if (typeof rec.restoresTs === 'number') { out.restoresTs = rec.restoresTs; }
    if (rec.restoresNote) { out.restoresNote = true; }
    return JSON.stringify(out);
}

/**
 * Read a ledger, skipping anything that is not a usable record.
 *
 * ‼️ A BROKEN LINE IS SKIPPED, NEVER THROWN ON. This file is appended to by more
 * than one writer and lives on a disk that can lose power mid-write; one torn
 * line must cost one record, not the whole history. The same judgment the
 * transcript reader makes about a half-written JSONL event.
 */
export function parseTrack(text: string): TrackRecord[] {
    const out: TrackRecord[] = [];
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line[0] !== '{') { continue; }
        let o: Record<string, unknown>;
        try { o = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
        const code = String(o.code ?? '').trim().toUpperCase();
        const event = String(o.event ?? '').trim() as TrackEvent;
        const ts = Number(o.ts);
        if (!code || !TRACK_EVENTS.includes(event) || !isFinite(ts)) { continue; }
        const by = TRACK_SOURCES.includes(o.by as TrackSource) ? o.by as TrackSource : 'agent';
        const turn = Number(o.turn);
        const doubt = String(o.uncertain ?? '') as TrackDoubt;
        out.push({
            code, event, ts, by,
            ...(o.session ? { session: String(o.session) } : {}),
            ...(isFinite(turn) && turn > 0 ? { turn } : {}),
            ...(o.agent ? { agent: String(o.agent) } : {}),
            ...(TRACK_DOUBTS.includes(doubt) ? { uncertain: doubt } : {}),
            ...(o.note ? { note: String(o.note).replace(/\s+/g, ' ').trim() } : {}),
            ...(o.noteCut === true ? { noteCut: true } : {}),
            ...(o.prevText ? { prevText: String(o.prevText).replace(/\s+/g, ' ').trim() } : {}),
            ...(o.prevCut === true ? { prevCut: true } : {}),
            ...(o.prevGuess === true ? { prevGuess: true } : {}),
            ...(isFinite(Number(o.restoresTs)) && Number(o.restoresTs) > 0
                ? { restoresTs: Number(o.restoresTs) } : {}),
            ...(o.restoresNote === true ? { restoresNote: true as const } : {})
        });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
}

/**
 * ‼️ P-14 — REPAIR THE ROWS THAT WERE ONLY EVER MISSING A LOOKUP.
 *
 * "Which turn was this closed in" is either recorded or it is not, and the user
 * asked for the honest version of that: make it work, or take the badge away.
 * It turns out most of the rows stamped `turn` were never unknowable — they
 * were written by a session whose id is right there on the record, at a moment
 * that falls inside a turn the transcript timestamps to the second. The writer
 * had no way to ask (it used the session's running TOTAL, which is only correct
 * for the turn in progress), so a fact that was on disk the whole time was
 * filed as a doubt. 40 of this project's 241 rows are that case.
 *
 * `resolve` is the lookup — `(session, ts) => turn | undefined`. Anything it
 * cannot answer keeps its doubt exactly as it is: a row with no session, or a
 * transcript that has been pruned, is genuinely unknown and stays that way.
 *
 * ‼️ P-14 (V2) — THE MISSING TURN AND THE REASON FOR THE DOUBT ARE TWO AXES.
 * This used to run only on rows whose doubt code was literally `turn`, so a row
 * stamped `stale` or `multi` that ALSO had no turn was skipped — for a reason
 * that says nothing about turns. The gate is now the fact ("no turn, but a
 * session to ask about"), not the label. What the label decides is the CLEANUP:
 * `turn` was a doubt purely about the number and goes when the number arrives;
 * `stale`/`multi`/`none` are doubts about WHICH SESSION and survive untouched,
 * because a turn read out of that session settles nothing about whether it was
 * the right session.
 *
 * Pure, and applied on READ rather than written back: the ledger is append-only
 * and shared between windows, and rewriting a hundred lines of somebody else's
 * append log to add a number that can be recomputed is not a trade worth making.
 */
export function repairTurns(
    records: TrackRecord[],
    resolve: (session: string, ts: number) => number | undefined
): TrackRecord[] {
    let touched = false;
    const out = records.map(r => {
        if (typeof r.turn === 'number' || !r.session) { return r; }
        const turn = resolve(r.session, r.ts);
        if (!turn) { return r; }
        touched = true;
        const next: TrackRecord = { ...r, turn };
        if (next.uncertain === 'turn') { delete next.uncertain; }
        return next;
    });
    return touched ? out : records;
}

export function readTrackFile(file: string): TrackRecord[] {
    try { return parseTrack(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

/**
 * Add records to the ledger.
 *
 * Appending, always — the file is never read, changed and written back. That is
 * what makes two windows and a headless agent writing in the same second safe:
 * there is no read-modify-write window to lose an update in.
 */
export function appendTrack(file: string, records: TrackRecord | TrackRecord[]): { ok: boolean; error?: string } {
    const list = (Array.isArray(records) ? records : [records]).filter(r => r?.code);
    if (!list.length) { return { ok: true }; }
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, list.map(serializeTrack).join('\n') + '\n', 'utf8');
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

// ---------------------------------------------------------------------------
// summarising
// ---------------------------------------------------------------------------

/** One session's share of an item's history. */
export interface TrackSessionRun {
    session: string;
    agent?: string;
    /** Every turn of that session this item was worked in, ascending. */
    turns: number[];
    firstTs: number;
    lastTs: number;
    events: TrackRecord[];
    /** The strongest doubt any of its events carries. */
    uncertain?: TrackDoubt;
}

export interface TrackSummary {
    code: string;
    /** Oldest first — the story reads forwards. */
    runs: TrackSessionRun[];
    /** Records with no session at all (panel clicks, outside edits). */
    loose: TrackRecord[];
    /**
     * ‼️ P-14 — HOW MANY DISTINCT TURNS ARE ACTUALLY KNOWN. Only real turn
     * numbers are counted.
     *
     * It used to be `Math.max(run.turns.length, 1)` per session, which invented
     * a turn for every session whose turn number was not known — so a row could
     * print "turns: 1" and "no turn recorded" at the same time, one under the
     * other. A figure that is made up when the answer is missing is worse than
     * no figure: it is the same shape as a real one.
     */
    turns: number;
    /** How many SESSIONS touched it — the honest denominator, and a different
     *  question from `turns`. A session whose turn is unknown counts here. */
    sessions: number;
    /** Of those sessions, how many could not say which turn they were in. This
     *  is what the "turn?" badge is counting, and why `turns` is smaller. */
    turnsUnknown: number;
    firstTs: number;
    lastTs: number;
    /** The event that closed it, if one did. */
    closed?: TrackRecord;
    /**
     * ‼️ X-36 — WHICH ROUND THIS IS. 1 for an item nobody has reopened; 2 for
     * one on its second go. Every reopen that carried the words the item had
     * before it, oldest first — so "what did I ask for the first three times,
     * and what was done about it" is a fact the next agent is HANDED rather
     * than one it has to think to go looking for.
     */
    round: number;
    rounds: TrackRecord[];
    /** True when anything in here is stamped uncertain. */
    doubtful: boolean;
}

const CLOSING: TrackEvent[] = ['done', 'cancelled'];

/** Sources whose record was NOTICED afterwards rather than watched happening —
 *  the two whose timestamp is "when we found out" (X-135, see `timed` below). */
const NOTICED: TrackSource[] = ['outside', 'backfill'];

/** The state an event implies, or undefined for `touch` (which says nothing
 *  about state — that is the point of it). */
export function stateOfEvent(event: TrackEvent): BacklogState | undefined {
    return event === 'done' ? 'done'
        : event === 'cancelled' ? 'cancelled'
            : event === 'doing' ? 'doing'
                : event === 'reopen' ? 'open' : undefined;
}

/** Group one code's records into the shape the document and the page both draw. */
export function summarizeCode(code: string, records: TrackRecord[]): TrackSummary {
    const raw = records.filter(r => r.code === code).sort((a, b) => a.ts - b.ts);
    // ‼️ P-14 (V3) — A REPAIRED CLOSING NOTE IS REPAIRED EVERYWHERE IT IS READ.
    // The correction is applied here, before anything is grouped, so the run
    // rows in Backloglog and the card's own closing line cannot disagree about
    // what the note says. (The round repair below is applied later because it
    // only ever concerns the `reopen` records the card draws as rounds.)
    const noteFixes = new Map<number, TrackRecord>();
    for (const r of raw) {
        if (typeof r.restoresTs === 'number' && r.restoresNote && r.note) {
            noteFixes.set(r.restoresTs, r);
        }
    }
    const mine = noteFixes.size
        ? raw.map(r => {
            const fix = noteFixes.get(r.ts);
            return fix?.note && CLOSING.includes(r.event)
                // The correction's OWN ceiling travels with it: recovered words
                // that were themselves cut must not read as a whole note.
                ? { ...r, note: fix.note, noteRestored: true, noteCut: fix.noteCut } : r;
        })
        : raw;
    const runs: TrackSessionRun[] = [];
    const loose: TrackRecord[] = [];
    for (const r of mine) {
        if (!r.session) { loose.push(r); continue; }
        let run = runs.find(x => x.session === r.session);
        if (!run) {
            run = { session: r.session, turns: [], firstTs: r.ts, lastTs: r.ts, events: [] };
            if (r.agent) { run.agent = r.agent; }
            runs.push(run);
        }
        run.events.push(r);
        run.lastTs = Math.max(run.lastTs, r.ts);
        run.firstTs = Math.min(run.firstTs, r.ts);
        if (typeof r.turn === 'number' && !run.turns.includes(r.turn)) { run.turns.push(r.turn); }
        if (r.uncertain && !run.uncertain) { run.uncertain = r.uncertain; }
        if (!run.agent && r.agent) { run.agent = r.agent; }
    }
    for (const run of runs) { run.turns.sort((a, b) => a - b); }
    runs.sort((a, b) => a.firstTs - b.firstTs);

    // The LAST closing event wins: an item closed, reopened and closed again is
    // closed where it closed the second time, and that is the one a reader wants.
    const closings = mine.filter(r => CLOSING.includes(r.event));
    // ‼️ X-36 (V2) — CORRECTIONS ARE APPLIED ON READ. A later record can supply
    // the wording a round lost to the old ceiling (see TrackRecord.restoresTs).
    // The stored reopen is never touched; the round a reader sees is the pair.
    const fixes = new Map<number, TrackRecord>();
    for (const r of mine) {
        // A note correction is already applied above; this map is the round one.
        if (typeof r.restoresTs === 'number' && !r.restoresNote && r.prevText) {
            fixes.set(r.restoresTs, r);
        }
    }
    const restore = (r: TrackRecord): TrackRecord => {
        const fix = fixes.get(r.ts);
        if (!fix?.prevText) { return r; }
        const next: TrackRecord = { ...r, prevText: fix.prevText, prevRestored: true };
        // The cut is gone (that is what was fixed) and so is the guess, because
        // a correction is somebody stating what the words were, not a reading.
        delete next.prevCut;
        delete next.prevGuess;
        return next;
    };
    const reopened = mine.filter(r => r.event === 'reopen').map(restore);
    const last = closings[closings.length - 1];
    const lastReopen = reopened[reopened.length - 1];
    const closed = last && (!lastReopen || lastReopen.ts < last.ts) ? last : undefined;

    // ‼️ A record stamped `none` carries the moment we NOTICED, not the moment
    // anything happened — letting it set `first` would print a date that reads
    // like "this is when the work started" and is nothing of the kind.
    //
    // ‼️ X-135 — AND THAT IS TRUE OF A RECORD THAT WAS NOTICED, NOT OF EVERY
    // RECORD WEARING THE STAMP. `none` is a statement about the SESSION ("no
    // session could be named at all"), and it is written in two very different
    // situations. `outside` stamps it when a box was ticked in Obsidian and we
    // found out later: the time really is the noticing, and the exclusion is
    // right. But a first-hand write — an agent calling the bridge mid-turn, a
    // person pressing a button — is stamped `none` whenever no live session
    // could be matched to it, which happens routinely for a session Agent Farm
    // did not spawn. Its `ts` is exact; only its authorship is unknown.
    //
    // Excluding those was invisible until an item's ONLY record was one of
    // them: `firstTs`/`lastTs` came back 0, `openedAt`/`touchedAt` came back
    // null, and the item sorted as though nobody had ever recorded it — which
    // is precisely the hole `opened` was added to close. So the exclusion is
    // narrowed to what its own reason describes: records that were NOTICED.
    //
    // ‼️ X-357 — EXCEPT A BIRTH. An `opened` noticed from outside is the only
    // date a line typed straight into the file will ever have; its time is an
    // upper bound on when it was written, which is what an ordering needs.
    const timed = mine.filter(r => r.event === 'opened' || !(r.uncertain === 'none' && NOTICED.includes(r.by)));
    return {
        code,
        runs, loose,
        // ‼️ P-14 — the KNOWN turns, and nothing invented. See TrackSummary.
        turns: runs.reduce((n, r) => n + r.turns.length, 0),
        sessions: runs.length,
        turnsUnknown: runs.filter(r => !r.turns.length).length,
        firstTs: timed.length ? timed[0].ts : 0,
        lastTs: timed.length ? timed[timed.length - 1].ts : 0,
        ...(closed ? { closed } : {}),
        // ‼️ X-36 — every reopen is a round, whichever door did it. Only the
        // ones that carried the old words can SHOW a round; the count is of all
        // of them, because "this is the third time" is true either way.
        round: reopened.length + 1,
        rounds: reopened.filter(r => !!r.prevText),
        doubtful: mine.some(r => !!r.uncertain)
    };
}

/** ‼️ P-14 (V3) — said on the closing line in Backloglog too, for the same
 *  reason it is said on the card: recovered words are right, but they are not a
 *  record of the moment, and only the reader can decide what that is worth. */
export function closingNoteSuffix(r: TrackRecord | undefined): string {
    // Two independent facts, and a note can carry both: where the words came
    // from, and whether they are all of them.
    return (r?.noteRestored
        ? ' _(note recovered later — the one written at the time was cut)_' : '')
        + (r?.noteCut
            ? ' _(cut — the note was longer than the ledger keeps)_' : '');
}

/** Every code the ledger knows about, in the order it first saw them. */
export function trackedCodes(records: TrackRecord[]): string[] {
    const out: string[] = [];
    for (const r of records) { if (!out.includes(r.code)) { out.push(r.code); } }
    return out;
}

// ---------------------------------------------------------------------------
// reconciling with the file — the hole this design cannot close, narrowed
// ---------------------------------------------------------------------------

/**
 * Notice a state change that happened WITHOUT us.
 *
 * Ticking a box in Obsidian produces no event anywhere; that is the known hole
 * in this design and it cannot be closed — nothing is watching that keystroke.
 * What CAN be done is to compare, whenever we look at the file, the state the
 * ledger last implies with the state the line actually shows, and record the
 * difference as an `outside` event. The turn is unknowable and is not invented;
 * what is gained is that the log has no silent gaps in it.
 *
 * ‼️ Idempotent, and it has to be: this runs on every render. A change is only
 * recorded when the ledger's implied state and the file's state DISAGREE, so
 * once the record exists they agree and nothing more is written.
 *
 * The timestamp is honest about what it is. With a ✅ date on the line, that day
 * (the user's own tooling wrote it, so it is the real one). Without, the moment
 * we noticed — flagged `uncertain: 'none'`, meaning "no session, no turn, and
 * this time is when this was seen, not when it happened".
 */
/**
 * What every coded item said the last time we looked, so the NEXT pass can tell
 * an un-ticked box from an un-ticked box that was also rewritten.
 *
 * ‼️ It is a snapshot of the FILE, not of the ledger. It is written next to the
 * other stores (X-36 V2) because the race is widest at start-up, but it stays a
 * BASELINE FOR THE NEXT COMPARISON and nothing else: no surface reads it, no
 * history is built from it, and losing the file costs one round's wording. What
 * an item once SAID is the ledger's answer, and two answers to one question is
 * how they start disagreeing.
 */
export function snapshotBacklog(items: BacklogItem[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const i of items) { if (i.code && i.text) { out.set(i.code, i.text); } }
    return out;
}

/**
 * ‼️ X-130 — THE WATCHER'S OWN ECHO.
 *
 * Every mutation Agent Farm makes writes `Backlog.md` and then runs the
 * reconcile pass inline, because it is the one that knows what it changed. The
 * directory watcher wakes 1.5 s later, hears that same write, and runs the
 * whole pass AGAIN over a document nobody has touched since. On the real vault
 * that echo costs a 41 ms parse, a ledger read, a log render and a 454 KB
 * cache write — per mutation, for nothing.
 *
 * The honest test is the bytes. Identical text means there is no outside edit
 * to reconcile — not "probably none", none — so the pass is skipped. Anything
 * weaker (a timestamp, a size, a "we wrote recently" flag) would be a guess,
 * and a guess here silently loses a round the user actually typed.
 *
 * ‼️ IT IS NOT PERSISTED, AND THAT IS THE POINT. A window that opens must
 * compare the file against what it said when the last window CLOSED — that is
 * the whole reason the snapshot cache exists (see X-36 V3). An echo suppressor
 * that survived the window would answer "unchanged since my last pass" to the
 * one edit the cache is built to catch.
 *
 * The digest is held rather than the text: a project's backlog only grows, and
 * keeping half a megabyte per folder alive for the lifetime of the window to
 * answer a yes/no question is the wrong trade.
 */
export class BacklogEcho {
    private readonly seen = new Map<string, string>();

    /** Remember what this folder's backlog said on the pass that just ran. */
    mark(folder: string, text: string): void {
        this.seen.set(folder, digestOf(text));
    }

    /**
     * True when the file is byte-identical to the last pass this folder had.
     * A folder that has never been marked is never an echo — the first thing a
     * window hears about a file it has not read is real news.
     */
    isEcho(folder: string, text: string): boolean {
        const was = this.seen.get(folder);
        return was !== undefined && was === digestOf(text);
    }

    /** Drop a folder, so the next thing heard from it is treated as real. */
    forget(folder: string): void {
        this.seen.delete(folder);
    }
}

/**
 * Cheap, exact-enough identity for a document. Not a security boundary and not
 * a record — two texts that collide here would have to be adversarial, and the
 * only thing at stake is whether one reconcile pass runs.
 */
function digestOf(text: string): string {
    return `${text.length}:${crypto.createHash('sha1').update(text, 'utf8').digest('hex')}`;
}

export function reconcileOutside(
    items: BacklogItem[], records: TrackRecord[], now = Date.now(),
    /**
     * ‼️ X-36 (reopened) — WHAT THE LINE SAID LAST TIME WE READ IT.
     *
     * Without this the reconciler reads the file AFTER the edit and stores
     * whatever it finds as "the previous round". If the user un-ticked the box
     * and rewrote the line in one save — which is exactly the gesture this
     * feature is built for — that stores the NEW request as the OLD one, and
     * nothing about the record shows it. With a snapshot from before the edit,
     * the old wording is the one that is kept. See `TrackRecord.prevGuess` for
     * what happens when there is no snapshot.
     */
    seen?: Map<string, string>,
    /**
     * ‼️ X-357 — the backlog file's own last write. A line that appeared in it
     * was written by then at the latest, which is a tighter bound than the
     * moment we noticed (a window that was closed notices hours late).
     */
    writtenBy?: number
): TrackRecord[] {
    const out: TrackRecord[] = [];
    for (const item of items) {
        if (!item.code) { continue; }
        const mine = records.filter(r => r.code === item.code);
        // ‼️ X-357 — A CODE BORN IN THE FILE. Typed or pasted straight into the
        // backlog, it never passed a door that writes `opened`, so both time
        // orderings sank the newest item to the bottom. It is a birth only when
        // the snapshot of the last read exists AND lacks it — without one (a
        // first read) every old undated line would be stamped "new" today.
        if (!mine.length && isLive(item.state)) {
            if (seen && !seen.has(item.code)) {
                const at = writtenBy && writtenBy > 0 && writtenBy < now ? writtenBy : now;
                out.push({
                    code: item.code, event: 'opened', ts: at,
                    by: 'outside', uncertain: 'none',
                    note: at < now
                        ? 'added outside Agent Farm, straight into the file; dated by the file\'s last save, the latest it can have been written'
                        : 'added outside Agent Farm, straight into the file; this is when it was noticed'
                });
            }
            continue;
        }
        let implied: BacklogState | undefined;
        for (const r of mine) { implied = stateOfEvent(r.event) ?? implied; }
        // Nothing recorded and nothing to record: an item with history that is
        // still open where the history left it has nothing new to say.
        if (implied === undefined && isLive(item.state)) { continue; }
        if (implied === item.state) { continue; }
        const event: TrackEvent = item.state === 'done' ? 'done'
            : item.state === 'cancelled' ? 'cancelled'
                : item.state === 'doing' ? 'doing' : 'reopen';
        const stated = item.doneOn ? dayToMs(item.doneOn) : 0;
        // ‼️ X-36 — a box un-ticked in Obsidian is a REOPEN like any other, and
        // it is the commonest one. The previous round comes from the SNAPSHOT
        // when there is one — the line as it was before this edit — and only
        // falls back to the line in front of us when there is not, saying so.
        const kept = seen?.get(item.code);
        const prev = event !== 'reopen' ? undefined
            : (kept || item.text || undefined);
        out.push({
            code: item.code, event,
            ts: stated || now,
            by: 'outside',
            uncertain: stated ? 'guess' : 'none',
            note: stated
                ? 'closed outside Agent Farm; the date is the line\'s own ✅'
                : 'changed outside Agent Farm; this is when it was noticed',
            ...(prev ? { prevText: prev } : {}),
            ...(prev && !kept ? { prevGuess: true } : {})
        });
    }
    return out;
}

// ---------------------------------------------------------------------------
// backfill — what the record would have said, had it existed
// ---------------------------------------------------------------------------

/** One piece of evidence: the code was literally written in this turn. Produced
 *  by a transcript search, not by a heuristic — the string was there. */
export interface TrackHit {
    code: string;
    session: string;
    turn: number;
    ts: number;
    agent?: string;
}

/** How far a mention may be from a ✅ date and still be read as the moment the
 *  item closed. Two days: work finished on a Friday evening gets its date on
 *  Friday and its box ticked on Monday, and both are the same closing. */
export const BACKFILL_CLOSE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Never write more than this many reconstructed rows for one code. A code
 *  quoted in fifty turns is a discussion, not a work history, and filling the
 *  log with it would bury the rows that were actually observed. */
const BACKFILL_CAP = 50;

/**
 * Reconstruct a track for items that were closed before any of this existed.
 *
 * ‼️ THE RULE IS: A CLUE OR NOTHING. Every row this produces rests on the code
 * having been WRITTEN in that turn — the search found the string, it was not
 * inferred from a date being near another date. Where there is no mention there
 * is no row, and the item stays visibly blank in the log, which is the honest
 * answer and also the one that shows what is missing.
 *
 * Two things it will not do. It never touches a code that already has an
 * observed record with a session: a reconstruction must not overwrite a fact.
 * And every row it writes is stamped `by: 'backfill'` and `uncertain: 'guess'`,
 * so a reader can always tell what was watched from what was worked out
 * afterwards — a reconstructed row that looked like an observed one would make
 * the whole ledger untrustworthy.
 */
export function backfillFromHits(
    items: BacklogItem[], records: TrackRecord[], hits: TrackHit[],
    opts: { closeWithinMs?: number } = {}
): TrackRecord[] {
    const window = opts.closeWithinMs ?? BACKFILL_CLOSE_WINDOW_MS;
    const observed = new Set(records.filter(r => r.session && r.by !== 'backfill').map(r => r.code));
    const out: TrackRecord[] = [];

    for (const item of items) {
        const code = item.code;
        if (!code || observed.has(code)) { continue; }
        const seen = new Set<string>();
        const mine = hits
            .filter(h => h.code === code && h.session && h.turn > 0)
            .filter(h => { const k = `${h.session}#${h.turn}`; return seen.has(k) ? false : (seen.add(k), true); })
            .sort((a, b) => a.ts - b.ts)
            .slice(-BACKFILL_CAP);
        if (!mine.length) { continue; }

        // Which mention, if any, is the closing one. With a ✅ date on the line
        // the nearest mention to it wins — but only if it is actually near.
        // Without one, the LAST mention is the best evidence there is.
        const closed = !isLive(item.state);
        const stated = item.doneOn ? dayToMs(item.doneOn) : 0;
        let closer: TrackHit | undefined;
        if (closed) {
            if (stated) {
                // ‼️ A ✅ is a DAY, not a moment. Sorting by distance in
                // milliseconds from its midnight makes the FIRST mention of that
                // day the closest, which is exactly backwards: every mention on
                // the day is equally close, and the one that closed it is the
                // last. So: closest DAY first, then latest within it.
                const near = mine
                    .filter(h => Math.abs(h.ts - stated) <= window)
                    .sort((a, b) =>
                        Math.abs(dayToMs(localDay(a.ts)) - stated) - Math.abs(dayToMs(localDay(b.ts)) - stated)
                        || b.ts - a.ts);
                closer = near[0];
            } else {
                closer = mine[mine.length - 1];
            }
        }

        for (const h of mine) {
            const isClose = closer && h.session === closer.session && h.turn === closer.turn;
            out.push({
                code, ts: h.ts, session: h.session, turn: h.turn,
                event: isClose ? (item.state === 'cancelled' ? 'cancelled' : 'done') : 'touch',
                by: 'backfill', uncertain: 'guess',
                ...(h.agent ? { agent: h.agent } : {}),
                note: isClose
                    ? (stated
                        ? 'reconstructed: the code is written in this turn, nearest to its ✅ date'
                        : 'reconstructed: the last turn the code is written in')
                    : 'reconstructed: the code is written in this turn'
            });
        }
    }
    return out.sort((a, b) => a.ts - b.ts);
}

/** `2026-08-03` → LOCAL midnight, the way every other date in this codebase is
 *  read. Parsing it as UTC would print the day before east of Greenwich. */
function dayToMs(value: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
    if (!m) { return 0; }
    const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    return isFinite(ms) ? ms : 0;
}

// ---------------------------------------------------------------------------
// the document — rendering, and reading the human's half back
// ---------------------------------------------------------------------------

/** The item line: `- **K-8** [status:: done] …`. Bold so the code is the thing
 *  the eye lands on, which is what this file is indexed by. */
const LOG_ITEM = /^-\s+\*\*([A-Z]{1,2}-\d+(?:\.\d+)*)\*\*/;
/**
 * A row Agent Farm wrote: indented, and opening either with a back-ticked
 * session id or with the marker that stands in for one.
 *
 * ‼️ EVERY SHAPE `itemBlock` CAN EMIT HAS TO MATCH THIS, and the failure when one
 * does not is silent and compounding: an unmatched row is read as the human's
 * prose, gets preserved, and is then written out AGAIN next to the freshly
 * generated one — so the file grows a duplicate of that row on every single
 * render. Measured on this installation: the loose-record row was changed to
 * open with `_no session_` and every outside-closed item had two identical rows
 * within two rebuilds. Change a row's opening here and change it there.
 */
const LOG_ROW = /^\s+-\s+(?:`|_no session_|_round \d+_)/;
/** What a row with no session to point at opens with. Shared by the writer and
 *  the pattern above so the two cannot drift apart again. */
const LOG_NO_SESSION = '_no session_';
/** ‼️ X-36 — and what a ROUND row opens with. Same rule, same reason: this
 *  shape is emitted by `itemBlock` and must be recognised by `LOG_ROW`, or the
 *  file grows a second copy of every round on every rebuild. */
const LOG_ROUND = (n: number): string => `_round ${n}_`;
const LOG_HEADING = /^#{1,6}\s+/;

/** Where blocks whose code is not in the backlog are parked, so that a
 *  hand-written line is never deleted just because we do not recognise it. */
export const LOG_ORPHAN_HEADING = '## 🖉 Not in the backlog';

export interface BacklogLogBlock {
    code: string;
    section: string;
    /** Lines of the block that Agent Farm did not write — kept verbatim. */
    kept: string[];
    /** The whole block as it stands, for a code we cannot place. */
    raw: string[];
}

/**
 * Read an existing Backloglog back: what the human wrote, per code.
 *
 * This is the half of the contract that makes the file safe to edit. Every line
 * inside an item's block that is not a machine row is remembered and written out
 * again — a closing note, a second paragraph, a warning, a table somebody
 * pasted. The machine rows are the only thing regenerated.
 */
export function parseBacklogLog(text: string): { blocks: BacklogLogBlock[]; head: string[] } {
    const lines = String(text ?? '').split(/\r?\n/);
    const blocks: BacklogLogBlock[] = [];
    const head: string[] = [];
    let section = '';
    let current: BacklogLogBlock | undefined;
    let started = false;

    for (const line of lines) {
        const item = LOG_ITEM.exec(line);
        if (item) {
            started = true;
            current = { code: item[1], section, kept: [], raw: [line] };
            blocks.push(current);
            continue;
        }
        if (LOG_HEADING.test(line)) {
            section = line.replace(/^#{1,6}\s+/, '').trim();
            current = undefined;
            if (!started) { head.push(line); }
            continue;
        }
        if (current) {
            current.raw.push(line);
            if (!LOG_ROW.test(line) && line.trim()) { current.kept.push(line); }
            continue;
        }
        if (!started) { head.push(line); }
    }
    // Trailing blank lines inside a block belong to the layout, not the content.
    for (const b of blocks) { while (b.raw.length && !b.raw[b.raw.length - 1].trim()) { b.raw.pop(); } }
    return { blocks, head };
}

/** `[11,12,13,14]` → `#11–14`; `[11,13]` → `#11, #13`; `[]` → `—`. A person
 *  reads a range, not a list of fourteen numbers. */
export function turnSpan(turns: number[]): string {
    if (!turns.length) { return '—'; }
    const parts: string[] = [];
    let from = turns[0];
    let prev = turns[0];
    const flush = (): void => {
        parts.push(from === prev ? `#${from}`
            : prev === from + 1 ? `#${from}, #${prev}` : `#${from}–${prev}`);
    };
    for (const n of turns.slice(1)) {
        if (n === prev + 1) { prev = n; continue; }
        flush(); from = n; prev = n;
    }
    flush();
    return parts.join(', ');
}

/** Eight characters is enough to find a session and short enough to read. */
export const shortSession = (id: string): string => String(id ?? '').replace(/^cli:[^:]*:/, '').slice(0, 8);

export interface RenderLogInput {
    project: string;
    items: BacklogItem[];
    records: TrackRecord[];
    /** The file as it stands, so the human's prose survives. */
    existing?: string;
    /** Where the ledger is, relative to the project folder — printed in the
     *  legend so a reader can find the raw data. */
    ledgerRel?: string;
}

const LOG_LEGEND = (ledger: string): string => `<!-- af:backloglog — WHO OWNS WHAT IN THIS FILE

     Agent Farm writes each item's DATA line and its \`session\` rows, out of
     ${ledger}. It rewrites them every time; do not hand-edit those.

     EVERY OTHER LINE INSIDE AN ITEM IS YOURS and is kept exactly as you leave
     it. That is where the closing note goes — what was done, how it was closed,
     what a reader should watch out for later. Write it as an indented line
     under the item:

     - **K-8** [status:: done] [sessions:: 2] [turns:: 5] [closed:: bbbb2222#3]
         - \`aaaa1111\` #11–14 · 2026-08-04 14:02 · developer · doing
         - \`bbbb2222\` #3 · 2026-08-05 09:20 · developer · **done**
         > Closed by lower-casing both sides of the comparison. The same
         > comparison exists in the memory graph and was NOT touched.

     status    the item's state in the backlog right now — that file decides it
     sessions  how many distinct sessions worked on it
     turns     how many turns across all of them
     closed    the session and turn it was closed in
     uncertain WHY an attribution is not sure: multi (two sessions could have
               been the caller) · none (nothing was live) · stale (the candidate
               had gone quiet) · turn (session sure, turn not) · guess
               (reconstructed from a date, never observed) · carried (the tick
               itself was a click in the panel, which happens in no session, so
               closed points at the last session that WORKED the item)

     An item appears here once something has happened to it. An untouched open
     item has no history and no line. -->`;

/**
 * Build the Backloglog document.
 *
 * Sections mirror the backlog's own headings, in the backlog's own order, so the
 * two files can be read side by side. The item TEXT is deliberately not
 * repeated: it lives in the backlog, it gets reworded there, and a copy of it
 * here would be a second version to keep true. This file answers "what happened
 * to K-8", not "what is K-8".
 */
export function renderBacklogLog(o: RenderLogInput): string {
    const previous = parseBacklogLog(o.existing ?? '');
    const keptOf = new Map(previous.blocks.map(b => [b.code, b.kept]));
    const ledger = o.ledgerRel ?? `_tracks/${TRACK_FILE}`;

    const coded = o.items.filter(i => i.code);
    const shown = coded.filter(i => {
        const code = i.code as string;
        return o.records.some(r => r.code === code)
            || !isLive(i.state)
            || (keptOf.get(code) ?? []).length > 0;
    });

    const out: string[] = [
        '---', 'af-role: backloglog', '---', '',
        `# ${o.project} — Backloglog`, '',
        LOG_LEGEND(ledger), ''
    ];

    let section = '';
    for (const item of shown) {
        if (item.section !== section) {
            section = item.section;
            out.push(`## ${section || 'Items'}`, '');
        }
        out.push(...itemBlock(item, summarizeCode(item.code as string, o.records),
            keptOf.get(item.code as string) ?? []));
        out.push('');
    }

    // Anything the file already had that we cannot place — a code the backlog no
    // longer holds, or a block somebody wrote by hand. Carried through verbatim
    // rather than dropped: deleting a person's line because we did not recognise
    // it is the one failure this file must never have.
    const placed = new Set(shown.map(i => i.code as string));
    const orphans = previous.blocks.filter(b => !placed.has(b.code));
    if (orphans.length) {
        out.push(LOG_ORPHAN_HEADING, '');
        for (const b of orphans) { out.push(...b.raw, ''); }
    }

    while (out.length && !out[out.length - 1].trim()) { out.pop(); }
    return out.join('\n') + '\n';
}

/** One item: the data line, the session rows, then whatever the human wrote. */
function itemBlock(item: BacklogItem, sum: TrackSummary, kept: string[]): string[] {
    const fields: string[] = [`[status:: ${item.state}]`];
    // ‼️ X-36 — on the DATA line, so it is the first thing read and so a query
    // can ask for "everything on its third go". An item nobody reopened says
    // nothing: round 1 is the normal case and stating it everywhere is noise.
    if (sum.round > 1) { fields.push(`[round:: ${sum.round}]`); }
    fields.push(`[sessions:: ${sum.runs.length}]`);
    if (sum.turns) { fields.push(`[turns:: ${sum.turns}]`); }
    if (sum.firstTs) { fields.push(`[first:: ${localDay(sum.firstTs)}]`); }
    if (sum.lastTs && localDay(sum.lastTs) !== localDay(sum.firstTs)) {
        fields.push(`[last:: ${localDay(sum.lastTs)}]`);
    }
    const att = closingAttribution(sum);
    if (att) { fields.push(`[closed:: ${att.stamp}]`); }
    // ‼️ `carried` rides in the field that already means "why this attribution is
    // not certain" rather than inventing a second one. It is the ONE doubt that
    // is derived rather than recorded: no ledger line carries it, because no
    // ledger line is wrong — the stamp is a pointer the summary worked out (see
    // closingAttribution).
    const why = [...new Set([
        ...sum.runs.map(r => r.uncertain), ...sum.loose.map(r => r.uncertain),
        ...(att?.carried ? ['carried'] : [])
    ].filter(Boolean))].join('|');
    if (why) { fields.push(`[uncertain:: ${why}]`); }

    const lines = [`- **${item.code}** ${fields.join(' ')}`];
    // ‼️ X-36 — THE EARLIER ROUNDS, ABOVE THE HISTORY THEY PRODUCED.
    //
    // The item's line holds ONE text: whatever it says now. So an item asked for
    // three times said only the third thing, and the first two askings — which
    // are the whole reason there was a third — existed nowhere. They are here,
    // numbered and dated, taken automatically at the moment each reopen
    // happened. Nobody has to preserve anything by hand, and nobody has to
    // decide whether to.
    sum.rounds.forEach((r, i) => {
        // ‼️ A round that is not certain says so on its own line. `prevGuess` =
        // read after an Obsidian edit with nothing to compare against, so it
        // MAY be the new wording; `prevCut` = the words hit the ledger ceiling.
        // A history that hides which of its lines it is unsure of is worse than
        // one that has fewer lines.
        const doubt = r.prevGuess ? ' _(as first seen after an edit outside — may be the new wording)_' : '';
        const cut = r.prevCut ? ' _(cut — the request was longer than the ledger keeps)_' : '';
        // ‼️ X-36 (V2) — and a round whose words were RECOVERED later says so.
        // The text is right; what is not certain is that it is the text as of
        // that exact moment, and a reader is entitled to know which it is.
        const back = r.prevRestored
            ? ' _(recovered later from the file — the wording at the time was cut)_' : '';
        lines.push(`    - ${LOG_ROUND(i + 1)} · ${localStamp(r.ts)} · reopened —`
            + ` _${r.prevText}_${doubt}${cut}${back}`);
    });
    for (const run of sum.runs) {
        const closes = run.events.some(e => CLOSING.includes(e.event));
        const label = closes ? `**${lastEventOf(run)}**` : lastEventOf(run);
        lines.push(`    - \`${shortSession(run.session)}\` ${turnSpan(run.turns)}`
            + ` · ${localStamp(run.firstTs)} · ${run.agent ?? '?'} · ${label}`
            + (run.uncertain ? ` · _${run.uncertain}_` : '')
            + noteOf(run.events));
    }
    for (const r of sum.loose) {
        // No session to point at, and the row says which kind of nothing it is:
        // a time we WATCHED (a click in the panel) or a time we merely noticed
        // (a box ticked in Obsidian, whose real moment nobody recorded).
        const when = r.uncertain === 'none' ? `${localStamp(r.ts)} noticed` : localStamp(r.ts);
        const closes = CLOSING.includes(r.event);
        lines.push(`    - ${LOG_NO_SESSION} · ${when} · ${r.agent ?? r.by}`
            + ` · ${closes ? `**${r.event}**` : r.event} · _${r.by}_`
            + (r.note ? ` — ${r.note}` : ''));
    }
    for (const line of kept) { lines.push(line); }
    return lines;
}

const lastEventOf = (run: TrackSessionRun): string =>
    run.events[run.events.length - 1]?.event ?? 'touch';

const noteOf = (events: TrackRecord[]): string => {
    const withNote = events.filter(e => !!e.note);
    const last = withNote[withNote.length - 1];
    return last ? ` — ${last.note}${closingNoteSuffix(last)}` : '';
};

/** Where an item was closed — and whether that is the closing record's own
 *  session or the one carried from the work that preceded it. */
export interface ClosingAttribution {
    /** `9c4d1f2a#3` — what goes on the backlog line itself. */
    stamp: string;
    session: string;
    turn: number;
    /** ‼️ The closing RECORD named no session; this points at the last one that
     *  actually worked the code. See `closingAttribution`. */
    carried: boolean;
}

/**
 * ‼️ WHERE THE WORK HAPPENED, WHEN THE CLICK THAT CLOSED IT DID NOT.
 *
 * A tick in the Backlog panel is honestly `by: 'panel'` with no session — the
 * click happened in no conversation, and the ledger must not pretend otherwise.
 * But the QUESTION this stamp exists to answer ("which turn was this solved
 * in?") still has an answer, and the ledger is already holding it: the agent
 * session that did the work, minutes earlier, in the same project.
 *
 * Measured on this installation (2026-08-10): four items closed by the user in
 * the panel — each with a full agent-recorded history — carried no stamp at all
 * and showed up under "no session to point at", so the record looked as if it
 * had lost today's work. The inference is made HERE, in the derived stamp, and
 * never written back into the ledger: the ledger keeps saying the click had no
 * session, because that is true, and `carried` says the pointer came from
 * somewhere else, because that is also true.
 *
 * Only a run that had ALREADY STARTED when the item was closed can be carried.
 * A later run is work on something reopened, not the thing that finished this.
 */
export function closingAttribution(sum: TrackSummary): ClosingAttribution | undefined {
    const c = sum.closed;
    if (!c) { return undefined; }
    if (c.session && typeof c.turn === 'number') {
        return { stamp: `${shortSession(c.session)}#${c.turn}`, session: c.session, turn: c.turn, carried: false };
    }
    const before = sum.runs.filter(r => r.firstTs <= c.ts && r.turns.length);
    const run = before[before.length - 1];
    if (!run) { return undefined; }
    const turn = run.turns[run.turns.length - 1];
    return { stamp: `${shortSession(run.session)}#${turn}`, session: run.session, turn, carried: true };
}

/** `9c4d1f2a#3` — what goes on the backlog line itself. Undefined when nothing
 *  in the whole record can name a turn, because a stamp that points nowhere is
 *  worse than no stamp. */
export function closingStamp(sum: TrackSummary): string | undefined {
    return closingAttribution(sum)?.stamp;
}

/** Where the ledger lives, given the folder that holds tracks. */
export const trackFileIn = (tracksDir: string): string => path.join(tracksDir, TRACK_FILE);
