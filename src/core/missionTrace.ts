import * as fs from 'fs';
import * as path from 'path';

/**
 * Mission trace — the append-only journal an adaptive run leaves behind.
 *
 * ‼️ X-45 — WHY A SECOND FILE EXISTS AT ALL, AND WHAT IT IS NOT.
 *
 * `missions.json` is a SNAPSHOT: the fast list the panel opens with and the
 * engine's current state. It was written whole, best-effort, on every state
 * change — acceptable while a run was a handful of rounds, and not acceptable
 * once a run carries strategy versions, a runtime graph, evaluations and real
 * conversation. Three separate failures were waiting in that one line: the file
 * grows without bound, a crash mid-write truncates the ONLY copy, and a window
 * reload loses everything the snapshot had not yet caught up to.
 *
 * So the two jobs are split. The snapshot stays small and is written
 * ATOMICALLY (temp + rename) — it is the motor's current state. The trace is
 * append-only, one file per run, sequence-numbered and schema-versioned — it is
 * the run's OBSERVATION record: what was decided, what was set in motion, what
 * came back, what the human was asked.
 *
 * ‼️ THIS IS NOT A MESSAGE BROKER AND NOT A SECOND EXECUTION ENGINE. The real
 * work is still MissionEngine + TaskManager and nothing reads the trace to
 * decide what to do next. It is audit and detail; it earns its keep exactly
 * once — at reload, when the snapshot alone cannot say what is still in flight.
 *
 * THE ORDER IS THE WHOLE CONTRACT: append first, snapshot second. That way the
 * only state a crash can produce is "the trace knows more than the snapshot",
 * which is recoverable by replaying the tail. The reverse — a snapshot claiming
 * work the trace never recorded — is unrecoverable, so it is made impossible.
 */

/** Bumped when an event's SHAPE changes. A line from the future is not read. */
export const MISSION_TRACE_SCHEMA = 2;

export type MissionTraceType =
    /** ‼️ M-16 — one per planner round: the lead decided something. This is a
     *  NODE, written whether or not the strategy moved, because a round is a
     *  decision either way and the graph hangs that round's work under it. */
    | 'decision.made'
    | 'strategy.changed'
    | 'action.created' | 'action.started' | 'action.settled'
    | 'evaluation.recorded'
    /** ‼️ M-19 — a conversation was opened: its purpose and its cast, once. */
    | 'conversation.opened'
    /** ‼️ M-19 — a speaking turn came back with words. Written when the message
     *  is DELIVERED, never when it is ordered: a turn that failed or said
     *  nothing leaves no message, which is the whole point of the item. */
    | 'message.sent'
    /** ‼️ M-20 — a CHAIRED debate opened over a conversation, and later ended
     *  for one of its seven stated reasons. Two events rather than one node
     *  rewritten, because "it is still going" and "it ended, and why" are what a
     *  reader of the journal is actually asking at two different moments. */
    | 'council.opened' | 'council.closed'
    | 'human.asked' | 'human.answered' | 'human.guided'
    | 'run.finished';

/** What an action actually IS in this codebase — never a new kind of work. */
export type MissionActionKind = 'task' | 'workflow' | 'mission' | 'conversation';

export type MissionActionOutcome = 'done' | 'failed' | 'cancelled';

export type HumanFlavor = 'question' | 'approval' | 'guidance';

export interface MissionTraceEvent {
    /** schema version of THIS line — a mixed file is legal after an upgrade */
    v: number;
    /** 1-based, monotonic, never reused. Idempotency key for replay. */
    seq: number;
    ts: number;
    type: MissionTraceType;
    /** the lead's own words for the working strategy (strategy.changed) */
    strategy?: string;
    /** which revision of the strategy this is — 1 for the first */
    version?: number;
    /** stable id of a unit of work the lead set in motion (action.*) */
    actionId?: string;
    kind?: MissionActionKind;
    /**
     * ‼️ M-18 — the typed intent a delegation was ordered as (`review` ·
     * `compare` · `revise`), absent on a plain one. A field rather than a word
     * inside the title, because a surface that had to read the title to know
     * what a node is would be reading prose.
     */
    intent?: string;
    agentId?: string;
    agentName?: string;
    title?: string;
    /** the REAL record this action became — a FarmTask id, a session id */
    refId?: string;
    outcome?: MissionActionOutcome;
    costUSD?: number;
    tokens?: number;
    outputFile?: string;
    /** which success criterion this verdict is about (evaluation.recorded) */
    criterionId?: string;
    met?: boolean;
    /** why — the evaluator's sentence, or the ask's text, or the answer */
    text?: string;
    /** message.sent: who said it to whom, by agent id ('user' for the human) */
    from?: string;
    to?: string;
    /** human.asked / answered / guided pair on this id */
    askId?: string;
    flavor?: HumanFlavor;
    /** run.finished */
    status?: string;
    verdict?: string;

    // ---- M-16: the runtime graph rides on the events that already exist ----
    /** decision.made — the graph id of the node this line CREATES */
    nodeId?: string;
    /** the lead's observation label for where the run is ("triage", "verify") */
    phase?: string;
    /** why the strategy moved (strategy.changed) */
    reason?: string;
    /** the decision node a strategy version came out of (strategy.changed) */
    sourceAction?: string;
    /** who did it: an agent id, `lead`, or `user` */
    actor?: string;
    /** the node(s) this one hangs under — normally the decision that made it */
    parentRefs?: string[];
    /** earlier nodes whose RESULTS this one consumes; a fan-in is visible here
     *  and nowhere else, which is why it is on the CONSUMER, not the producer */
    inputRefs?: string[];
    /** real records this node produced beyond `refId` (files, session ids) */
    outputRefs?: string[];
    /** human.guided — a second line on the same askId marks it INJECTED, which
     *  is what makes "exactly once" survive a reload */
    applied?: boolean;
}

/** The snapshot's pointer at its own journal. Absent = the run has no trace. */
export interface MissionTraceRef {
    /** absolute path; tokenized on save with every other path in the store */
    file: string;
    /** how far the SNAPSHOT had caught up. May legally lag the file. */
    lastSeq: number;
    v: number;
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

/** One file per run, named by the run id — so an orphan is recognisable by
 *  name alone and no index has to be kept in step. */
export function traceFileFor(dir: string, runId: string): string {
    return path.join(dir, runId + '.jsonl');
}

/** The run id a trace file is for, or undefined if the name is not ours. */
export function runIdOfTraceFile(name: string): string | undefined {
    const m = /^(.+)\.jsonl$/.exec(path.basename(name));
    return m ? m[1] : undefined;
}

/**
 * Why a journal refuses to be written to. Never a reason to fail a run — the
 * mission carries on snapshot-only and this is the sentence that says so.
 */
export interface TraceBlock {
    reason: 'future' | 'unrepaired';
    message: string;
}

/**
 * The append side. Holds only the last sequence number, because that is the
 * only state a writer needs and holding more would make it a cache that can
 * disagree with the file.
 */
export class MissionTraceWriter {
    private seq: number;
    /** set when this file may NOT be appended to; `append` becomes a no-op */
    readonly blocked?: TraceBlock;
    /** what `open` had to do to the file before it could be used */
    readonly repair?: TraceRepair;

    private constructor(readonly file: string, seq: number, blocked?: TraceBlock, repair?: TraceRepair) {
        this.seq = seq;
        if (blocked) { this.blocked = blocked; }
        if (repair) { this.repair = repair; }
    }

    /** A writer for a run that has no journal yet. */
    static create(file: string): MissionTraceWriter {
        try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch { /* exists */ }
        return new MissionTraceWriter(file, 0);
    }

    /**
     * A writer that continues an existing journal.
     *
     * The next seq comes from the FILE, never from the snapshot: the snapshot
     * is allowed to lag, and a writer that trusted it would hand out a number
     * already on disk. ‼️ X-63/X-64 — and it comes from the file's PHYSICAL
     * high-water mark, not from the prefix this build can apply. A journal with
     * a hole in it, or a line from a newer schema, still has those numbers
     * spent; reusing one would put two different events under one seq and make
     * the damage permanent.
     *
     * Two things happen before the writer is usable, and both of them are
     * refusals rather than repairs-in-passing:
     *
     *   * ‼️ X-64 — a journal containing a line from a NEWER schema is opened
     *     read-only. This build cannot know what that line means, so appending
     *     to it would interleave old events into a record a newer Agent Farm
     *     has already numbered, and no later reader could tell the two apart.
     *     The file is left byte-identical and the block says what to do.
     *   * ‼️ X-61 — a half-written tail is CUT BACK first (see
     *     `repairTraceTail`), and the result is re-read: a repair that did not
     *     take blocks the writer rather than appending into the wreckage.
     */
    static open(file: string): MissionTraceWriter {
        try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch { /* exists */ }
        const read = readTrace(file);
        if (read.fromFuture > 0) {
            return new MissionTraceWriter(file, read.physicalLastSeq, {
                reason: 'future',
                message: 'this run was journalled by a newer version of Agent Farm'
                    + ' — update Agent Farm to continue it'
            });
        }
        const repair = repairTraceTail(file, read);
        const blocked = (why: string): MissionTraceWriter => new MissionTraceWriter(
            file, readTrace(file).physicalLastSeq,
            { reason: 'unrepaired', message: "this run's journal could not be made safe to append to — " + why },
            repair);
        if (repair.error) { return blocked(repair.error); }
        if (!repair.repaired) { return new MissionTraceWriter(file, read.physicalLastSeq); }
        const after = readTrace(file);
        if (after.truncatedTail) { return blocked('the half-written line is still there'); }
        return new MissionTraceWriter(file, after.physicalLastSeq, undefined, repair);
    }

    get lastSeq(): number { return this.seq; }

    /**
     * Append one event and return it. Throws nothing: a mission must not fail
     * because its audit trail could not be written — the run degrades to
     * "snapshot only", which the reader reports honestly.
     */
    append(type: MissionTraceType, payload: Partial<MissionTraceEvent> = {}, now = Date.now()): MissionTraceEvent {
        const ev: MissionTraceEvent = { v: MISSION_TRACE_SCHEMA, seq: this.seq + 1, ts: now, type, ...payload };
        // ‼️ X-64 — A BLOCKED WRITER WRITES NOTHING AND SAYS NOTHING TO THE
        // ENGINE. The event is still returned so every caller's shape is
        // unchanged, the file stays byte-identical, and `lastSeq` does not
        // move — so the snapshot never claims a line the journal does not have.
        if (this.blocked) { return ev; }
        try {
            fs.appendFileSync(this.file, JSON.stringify(ev) + '\n', 'utf8');
            this.seq = ev.seq;
        } catch { /* journal unwritable — the engine carries on */ }
        return ev;
    }
}

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

export type TraceHealth = 'ok' | 'missing' | 'truncated' | 'damaged' | 'future';

export interface TraceRead {
    /**
     * ‼️ X-63 — THE PROVEN PREFIX, NOT EVERYTHING THAT PARSED.
     *
     * seq 1, 2, 3 … in the order the lines physically sit in the file, stopping
     * at the first break. A hole in a journal is LOSS, and events read after
     * that hole describe a run whose middle nobody can state; projecting them
     * would build a history out of the surviving half and present it as whole.
     */
    events: MissionTraceEvent[];
    /** last seq of that prefix — never a number the chain cannot account for */
    lastSeq: number;
    /**
     * ‼️ X-64 — the highest seq PHYSICALLY on disk, counting lines this build
     * cannot apply. A writer that continued from `lastSeq` would hand out a
     * number a newer build has already used, so the two are never one field.
     */
    physicalLastSeq: number;
    health: TraceHealth;
    /** a crash mid-append left half a line at the END — expected, not damage */
    truncatedTail: boolean;
    /** lines that were not parseable and were NOT the last one */
    badLines: number;
    /** events whose seq had already been seen — replayed, kept once */
    duplicates: number;
    /** lines written by a newer schema than this build understands */
    fromFuture: number;
    /** ‼️ X-63 — how many seq values are MISSING from the chain */
    gaps: number;
    /** events whose seq went backwards against the physical line order */
    outOfOrder: number;
    /** seq that is not a positive whole number — 0, negative, fractional, NaN */
    invalidSeq: number;
    /** readable events dropped because they sit beyond the first break */
    beyondPrefix: number;
}

/**
 * Read a journal. NEVER throws and never refuses to return what it could read:
 * the run list has to open even when the trace is rubble, so damage is
 * reported as a value rather than raised as an error.
 *
 * The three faults are deliberately NOT the same thing:
 *   * a broken LAST line is a crash mid-append — expected, dropped, `truncated`;
 *   * a broken line anywhere else is real loss — `damaged`;
 *   * a repeated seq is a replay — the FIRST wins, because it is the one every
 *     earlier reader already saw;
 *   * ‼️ X-63 — a HOLE, a seq that goes backwards, or a seq that is not a
 *     positive whole number is damage of a fourth kind: the line parses, so
 *     none of the three above sees it, and the chain it belongs to can no
 *     longer be trusted to be the run's whole history. Diagnosed by name, and
 *     the projection is cut back to the prefix that is still provable.
 */
export function readTrace(file: string): TraceRead {
    let raw: string;
    try { raw = fs.readFileSync(file, 'utf8'); } catch {
        return {
            events: [], lastSeq: 0, physicalLastSeq: 0, health: 'missing',
            truncatedTail: false, badLines: 0, duplicates: 0, fromFuture: 0,
            gaps: 0, outOfOrder: 0, invalidSeq: 0, beyondPrefix: 0
        };
    }
    const lines = raw.split('\n');
    // a well-formed file ends in a newline, so the final element is ''
    const endedClean = lines.length > 0 && lines[lines.length - 1] === '';
    if (endedClean) { lines.pop(); }

    const parsed: MissionTraceEvent[] = [];
    const seen = new Set<number>();
    let badLines = 0, duplicates = 0, fromFuture = 0, truncatedTail = false;
    let invalidSeq = 0, physicalLastSeq = 0;

    lines.forEach((line, i) => {
        const isLast = i === lines.length - 1;
        if (!line.trim()) { if (!isLast) { badLines++; } return; }
        let ev: MissionTraceEvent | undefined;
        try { ev = JSON.parse(line) as MissionTraceEvent; } catch { ev = undefined; }
        if (!ev || typeof ev.seq !== 'number' || typeof ev.type !== 'string') {
            if (isLast && !endedClean) { truncatedTail = true; } else { badLines++; }
            return;
        }
        // ‼️ X-63 — a seq that is not a positive whole number is not a late
        // event, it is a corrupt one: it can be neither ordered nor used as an
        // idempotency key, so it is never allowed to stand in the chain.
        if (!Number.isInteger(ev.seq) || ev.seq < 1) { invalidSeq++; return; }
        // ‼️ X-64 — the high-water mark counts a line this build cannot APPLY
        // exactly the same, because a newer build has already spent that number.
        if (ev.seq > physicalLastSeq) { physicalLastSeq = ev.seq; }
        if (typeof ev.v === 'number' && ev.v > MISSION_TRACE_SCHEMA) { fromFuture++; return; }
        if (seen.has(ev.seq)) { duplicates++; return; }
        seen.add(ev.seq);
        parsed.push(ev);
    });

    // ‼️ X-63 — ORDER IS EVIDENCE, so it is checked against the file and not
    // repaired by sorting. This sorted first and then read the last element,
    // which meant a journal of 1 and 3 answered "three events, up to seq 3" —
    // the hole was invisible and `snapshotBehind`, derived from that same max,
    // counted a catch-up that could never arrive.
    let outOfOrder = 0;
    for (let i = 1; i < parsed.length; i++) {
        if (parsed[i].seq < parsed[i - 1].seq) { outOfOrder++; }
    }
    let gaps = 0, want = 1;
    for (const ev of parsed.slice().sort((a, b) => a.seq - b.seq)) {
        if (ev.seq > want) { gaps += ev.seq - want; }
        want = ev.seq + 1;
    }
    // the prefix that is still provable: physically in order, contiguous, from 1
    const events: MissionTraceEvent[] = [];
    for (const ev of parsed) {
        if (ev.seq !== events.length + 1) { break; }
        events.push(ev);
    }
    const beyondPrefix = parsed.length - events.length;

    const lastSeq = events.length ? events[events.length - 1].seq : 0;
    const health: TraceHealth =
        fromFuture > 0 ? 'future'
            : (badLines > 0 || gaps > 0 || outOfOrder > 0 || invalidSeq > 0) ? 'damaged'
                : truncatedTail ? 'truncated'
                    : 'ok';
    return {
        events, lastSeq, physicalLastSeq, health, truncatedTail,
        badLines, duplicates, fromFuture, gaps, outOfOrder, invalidSeq, beyondPrefix
    };
}

/** What `repairTraceTail` did — nothing, when there was nothing to do. */
export interface TraceRepair {
    repaired: boolean;
    /** bytes taken off the end: the half line a crash left behind */
    removedBytes: number;
    /** the last line was COMPLETE and only its newline was missing */
    terminated?: boolean;
    /** where those bytes were kept, so nothing is destroyed to make room */
    quarantine?: string;
    /** why it could not be done, when it could not */
    error?: string;
}

/** Where a half-written tail is kept once it is cut off the journal. */
export function quarantineFileFor(file: string): string { return file + '.broken'; }

/**
 * ‼️ X-61 — A HALF-WRITTEN LAST LINE IS REPAIRED BEFORE ANYTHING APPENDS TO IT.
 *
 * `readTrace` has always recognised a truncated tail and stepped over it, which
 * is the right answer for a READER. A WRITER stepping over it is a different
 * thing entirely: the half line is still on disk with no newline after it, so
 * the next append lands flush against it and the two become ONE unreadable
 * line. The crash's damage and the new event are then lost together — and the
 * loss is silent, because every later read counts a bad line where there had
 * only ever been a survivable tail.
 *
 * So the tail is cut back to the last complete line, BYTE-exactly (a crash can
 * stop in the middle of a UTF-8 character, so this is never done on a string),
 * and the bytes removed are kept beside the file rather than thrown away.
 *
 * ‼️ AND CUTTING IS ONLY ONE OF THE TWO REPAIRS. A crash can equally stop on
 * the newline BYTE, leaving a last line that is complete and simply
 * unterminated. `readTrace` reads it perfectly — so nothing calls it damage — but
 * appending after it glues the next event onto a good one and loses BOTH. That
 * case is terminated, never cut: the line is evidence and the missing byte is
 * the only thing wrong with it.
 */
export function repairTraceTail(file: string, read: TraceRead = readTrace(file)): TraceRepair {
    let buf: Buffer;
    try { buf = fs.readFileSync(file); } catch { return { repaired: false, removedBytes: 0 }; }
    // a journal that ends clean, or has nothing in it, is already safe to append to
    if (!buf.length || buf[buf.length - 1] === 0x0a) { return { repaired: false, removedBytes: 0 }; }
    if (!read.truncatedTail) {
        try { fs.appendFileSync(file, '\n', 'utf8'); } catch (e) {
            return { repaired: false, removedBytes: 0, error: String(e).slice(0, 200) };
        }
        return { repaired: true, removedBytes: 0, terminated: true };
    }
    const cut = buf.lastIndexOf(0x0a) + 1;   // 0 when the whole file is one half line
    const tail = buf.subarray(cut);
    if (!tail.length) { return { repaired: false, removedBytes: 0 }; }
    const quarantine = quarantineFileFor(file);
    let kept: string | undefined;
    try {
        fs.appendFileSync(quarantine, Buffer.concat([tail, Buffer.from('\n', 'utf8')]));
        kept = quarantine;
    } catch { /* nowhere to keep it; the repair itself still has to happen */ }
    try { fs.truncateSync(file, cut); } catch (e) {
        return { repaired: false, removedBytes: 0, error: String(e).slice(0, 200), ...(kept ? { quarantine: kept } : {}) };
    }
    return { repaired: true, removedBytes: tail.length, ...(kept ? { quarantine: kept } : {}) };
}

// ---------------------------------------------------------------------------
// projection
// ---------------------------------------------------------------------------

export interface TraceAction {
    actionId: string;
    kind: MissionActionKind;
    /** the typed intent it was ordered as, when it was one (M-18) */
    intent?: string;
    agentId?: string;
    agentName?: string;
    title?: string;
    /** the real record it became once it started — a task id, a session id */
    refId?: string;
    createdAt: number;
    startedAt?: number;
    settledAt?: number;
    outcome?: MissionActionOutcome;
    costUSD?: number;
    tokens?: number;
    outputFile?: string;
}

export interface TraceEvaluation {
    criterionId: string;
    met: boolean;
    text?: string;
    at: number;
    /** how many verdicts this criterion has had — a revised one is not a new one */
    revisions: number;
}

export interface PendingHuman {
    askId: string;
    flavor: HumanFlavor;
    text: string;
    askedAt: number;
}

/**
 * ‼️ M-16 — A STRATEGY IS NOT AN IMMUTABLE PLAN, AND NOT A PER-ROUND FIELD.
 *
 * The lead states its working strategy on every call, but restating the same
 * thing is not a change: a version is cut only when the NORMALISED text really
 * moves (`normalizeStrategy`). So `n` counts revisions of the approach, not
 * rounds — which is the only reading under which "it changed its mind twice"
 * means anything. `sourceAction` is the decision node the revision came out of.
 */
export interface StrategyVersion {
    n: number;
    summary: string;
    phase?: string;
    reason?: string;
    at: number;
    sourceAction?: string;
}

/** Two strategies are THE SAME when they say the same thing — casing, spacing
 *  and a trailing full stop are not a change of mind. */
export function normalizeStrategy(text: string): string {
    return (text ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?;:,\s]+$/, '').trim();
}

export type GraphNodeKind = 'decision' | 'delegation' | 'question' | 'approval' | 'guidance' | 'finish';
export type GraphNodeStatus = 'open' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * ‼️ M-16 — THE GRAPH IS NEVER DRAWN IN ADVANCE.
 *
 * Nothing plans this shape: a node appears at the moment a decision is taken or
 * a real primitive is set in motion, and the edges are whatever actually
 * happened. Parallel work of one round shares a `parentRefs` (the decision that
 * ordered it) so it visibly branches; a round that reads several results back
 * carries them in its `inputRefs`, so a fan-in is a fact of the graph rather
 * than an inference from timestamps.
 *
 * It does NOT drive the engine. It is a projection of decisions and
 * dependencies that already occurred — deleting it would lose the view, never
 * the run.
 */
export interface GraphNode {
    id: string;
    kind: GraphNodeKind;
    status: GraphNodeStatus;
    /** an agent id, `lead`, or `user` */
    actor: string;
    label: string;
    parentRefs: string[];
    inputRefs: string[];
    outputRefs: string[];
    createdAt: number;
    startedAt?: number;
    settledAt?: number;
    phase?: string;
    /** which revision of the strategy was in force when this node appeared */
    strategyVersion?: number;
}

/** One-off steer from the human, and whether the loop has already taken it. */
export interface TraceGuidance {
    id: string;
    text: string;
    at: number;
    appliedAt?: number;
}

export interface TraceProjection {
    lastSeq: number;
    strategy?: { version: number; text: string; at: number };
    /** every revision in order — `strategy` is the last of these */
    strategies: StrategyVersion[];
    /** the lead's latest observation label; absent until it states one */
    phase?: string;
    /** what actually happened, as nodes and edges (M-16) */
    graph: GraphNode[];
    /** steers the human sent, injected or not */
    guidance: TraceGuidance[];
    /** creation order, which is the order the lead thought of them */
    actions: TraceAction[];
    /** by criterion id — the LATEST verdict, with how many there have been */
    evaluations: TraceEvaluation[];
    /**
     * ‼️ M-19 — how many conversations this run opened, and how many turns
     * really produced words. A message counted here was SPOKEN: a turn that was
     * ordered and then failed, or came back saying nothing, never reaches the
     * journal at all — which is what keeps this figure from being a count of
     * intentions.
     */
    conversations: number;
    messages: number;
    /**
     * ‼️ M-20 — councils opened, and how many of those have ended. The pair is
     * the useful one: an open council is a debate still costing turns, and a
     * count of openings alone cannot tell that from a finished one.
     */
    councils: number;
    councilsClosed: number;
    /** an ask nobody answered — this is what becomes `paused + needs-you` */
    pending?: PendingHuman;
    /**
     * ‼️ WHAT THE USER ALREADY SAID, by askId. The snapshot normally carries
     * this too, but the journal is written FIRST — so an answer given in the
     * second before a crash exists only here, and asking for it again would be
     * the exact loss this item exists to prevent.
     */
    answers: Record<string, string>;
    finished?: { status: string; verdict?: string; text?: string; at: number };
}

/**
 * Fold the journal into the run's current shape. Pure: the same events give the
 * same projection on any machine, which is what makes replay idempotent — an
 * event applied twice lands on the same field with the same value.
 */
export function projectTrace(events: readonly MissionTraceEvent[]): TraceProjection {
    const p: TraceProjection = {
        lastSeq: 0, strategies: [], graph: [], guidance: [],
        actions: [], evaluations: [], conversations: 0, messages: 0,
        councils: 0, councilsClosed: 0, answers: {}
    };
    const byId = new Map<string, TraceAction>();
    const evalById = new Map<string, TraceEvaluation>();
    const asks = new Map<string, PendingHuman>();
    const nodes = new Map<string, GraphNode>();
    const guideById = new Map<string, TraceGuidance>();
    /** the decision a node written now hangs under, when the writer said nothing */
    let lastDecision = '';
    let strategyVersion = 0;

    const node = (
        id: string, kind: GraphNodeKind, actor: string, label: string, ev: MissionTraceEvent
    ): GraphNode => {
        const found = nodes.get(id);
        if (found) { return found; }
        const parents = ev.parentRefs?.length
            ? [...ev.parentRefs]
            : (kind !== 'decision' && lastDecision ? [lastDecision] : []);
        const n: GraphNode = {
            id, kind, actor, label,
            status: kind === 'decision' ? 'done' : 'open',
            parentRefs: parents,
            inputRefs: ev.inputRefs ? [...ev.inputRefs] : [],
            outputRefs: ev.outputRefs ? [...ev.outputRefs] : [],
            createdAt: ev.ts,
            ...(ev.phase ? { phase: ev.phase } : {}),
            ...(strategyVersion ? { strategyVersion } : {})
        };
        if (kind === 'decision') { n.settledAt = ev.ts; }
        nodes.set(id, n);
        p.graph.push(n);
        return n;
    };
    /** A produced record is named once — a settle that repeats a start's refId
     *  must not make the node look like it produced two different things. */
    const produced = (n: GraphNode, ref?: string): void => {
        if (ref && !n.outputRefs.includes(ref)) { n.outputRefs.push(ref); }
    };

    // ‼️ IDEMPOTENT AT THIS LEVEL TOO, not only in the reader. `readTrace`
    // already drops a repeated seq, but the projection is also fed replays and
    // concatenations during recovery — and a fold whose result depends on how
    // many times it saw a line is not a projection, it is a counter. Measured
    // the hard way: `strategy.changed` derives its version when the writer did
    // not state one, and that derivation quietly incremented on every replay.
    const applied = new Set<number>();
    for (const ev of events) {
        if (applied.has(ev.seq)) { continue; }
        applied.add(ev.seq);
        if (ev.seq > p.lastSeq) { p.lastSeq = ev.seq; }
        switch (ev.type) {
            case 'decision.made': {
                if (typeof ev.version === 'number') { strategyVersion = ev.version; }
                const id = ev.nodeId || 'd' + ev.seq;
                const n = node(id, 'decision', ev.actor || 'lead', ev.text ?? '', ev);
                // ‼️ SET AFTER the node is built, not before: a decision hangs
                // under the PREVIOUS decision, never under itself.
                lastDecision = id;
                if (ev.phase) { p.phase = ev.phase; }
                if (typeof ev.version === 'number') { n.strategyVersion = ev.version; }
                break;
            }
            case 'strategy.changed': {
                const version = typeof ev.version === 'number'
                    ? ev.version
                    : (p.strategy ? p.strategy.version + 1 : 1);
                const text = ev.strategy ?? ev.text ?? '';
                p.strategy = { version, text, at: ev.ts };
                strategyVersion = version;
                if (ev.phase) { p.phase = ev.phase; }
                // A revision recorded twice under the same number is the same
                // revision — the journal is replayed, and a version list that
                // grew on replay would be a counter rather than a history.
                const prior = p.strategies.findIndex(s => s.n === version);
                const rec: StrategyVersion = {
                    n: version, summary: text, at: ev.ts,
                    ...(ev.phase ? { phase: ev.phase } : {}),
                    ...(ev.reason ? { reason: ev.reason } : {}),
                    ...(ev.sourceAction ? { sourceAction: ev.sourceAction } : {})
                };
                if (prior >= 0) { p.strategies[prior] = rec; } else { p.strategies.push(rec); }
                break;
            }
            case 'action.created': {
                if (!ev.actionId || byId.has(ev.actionId)) { break; }
                const a: TraceAction = {
                    actionId: ev.actionId,
                    kind: ev.kind ?? 'task',
                    ...(ev.intent ? { intent: ev.intent } : {}),
                    ...(ev.agentId ? { agentId: ev.agentId } : {}),
                    ...(ev.agentName ? { agentName: ev.agentName } : {}),
                    ...(ev.title ? { title: ev.title } : {}),
                    createdAt: ev.ts
                };
                byId.set(a.actionId, a);
                p.actions.push(a);
                node(a.actionId, 'delegation', ev.agentId || ev.agentName || 'agent', ev.title ?? '', ev);
                break;
            }
            case 'action.started': {
                const a = ev.actionId ? byId.get(ev.actionId) : undefined;
                if (!a) { break; }
                a.startedAt = ev.ts;
                if (ev.refId) { a.refId = ev.refId; }
                const n = ev.actionId ? nodes.get(ev.actionId) : undefined;
                if (n) {
                    n.startedAt = ev.ts;
                    if (n.status === 'open') { n.status = 'running'; }
                    produced(n, ev.refId);
                }
                break;
            }
            case 'action.settled': {
                const a = ev.actionId ? byId.get(ev.actionId) : undefined;
                if (!a) { break; }
                a.settledAt = ev.ts;
                a.outcome = ev.outcome ?? 'done';
                if (typeof ev.costUSD === 'number') { a.costUSD = ev.costUSD; }
                if (typeof ev.tokens === 'number') { a.tokens = ev.tokens; }
                if (ev.outputFile) { a.outputFile = ev.outputFile; }
                if (ev.refId) { a.refId = ev.refId; }
                const n = ev.actionId ? nodes.get(ev.actionId) : undefined;
                if (n) {
                    n.settledAt = ev.ts;
                    n.status = a.outcome === 'done' ? 'done' : a.outcome;
                    produced(n, ev.refId);
                    produced(n, ev.outputFile);
                    for (const r of ev.outputRefs ?? []) { produced(n, r); }
                }
                break;
            }
            case 'evaluation.recorded': {
                if (!ev.criterionId) { break; }
                const prev = evalById.get(ev.criterionId);
                evalById.set(ev.criterionId, {
                    criterionId: ev.criterionId,
                    met: ev.met === true,
                    ...(ev.text ? { text: ev.text } : {}),
                    at: ev.ts,
                    revisions: (prev ? prev.revisions : 0) + 1
                });
                break;
            }
            case 'conversation.opened':
                p.conversations++;
                break;
            case 'message.sent':
                p.messages++;
                break;
            case 'council.opened':
                p.councils++;
                break;
            case 'council.closed':
                p.councilsClosed++;
                break;
            case 'human.asked':
                if (ev.askId) {
                    const flavor = ev.flavor ?? 'question';
                    asks.set(ev.askId, {
                        askId: ev.askId, flavor,
                        text: ev.text ?? '',
                        askedAt: ev.ts
                    });
                    node('ask:' + ev.askId, flavor === 'approval' ? 'approval' : 'question',
                        'user', ev.text ?? '', ev);
                }
                break;
            case 'human.answered':
                if (ev.askId) {
                    asks.delete(ev.askId);
                    p.answers[ev.askId] = ev.text ?? '';
                    const n = nodes.get('ask:' + ev.askId);
                    if (n) { n.status = 'done'; n.settledAt = ev.ts; }
                }
                break;
            case 'human.guided': {
                // Guidance nobody asked for closes nothing — it is an addition,
                // and it arrives TWICE on purpose: once when the human sent it,
                // once when the loop actually injected it. That second line is
                // what makes "exactly once" a fact on disk rather than a
                // promise held in a process that can be reloaded away.
                if (!ev.askId) { break; }
                const g = guideById.get(ev.askId);
                if (!g) {
                    const fresh: TraceGuidance = { id: ev.askId, text: ev.text ?? '', at: ev.ts };
                    if (ev.applied) { fresh.appliedAt = ev.ts; }
                    guideById.set(ev.askId, fresh);
                    p.guidance.push(fresh);
                } else if (ev.applied && g.appliedAt === undefined) {
                    g.appliedAt = ev.ts;
                }
                const n = node('guide:' + ev.askId, 'guidance', 'user', ev.text ?? '', ev);
                if (ev.applied) { n.status = 'done'; n.settledAt = ev.ts; }
                break;
            }
            case 'run.finished': {
                p.finished = {
                    status: ev.status ?? 'done',
                    ...(ev.verdict ? { verdict: ev.verdict } : {}),
                    ...(ev.text ? { text: ev.text } : {}),
                    at: ev.ts
                };
                const n = node(ev.nodeId || 'end', 'finish', ev.actor || 'lead',
                    ev.verdict ? `${ev.status ?? 'done'} — ${ev.verdict}` : (ev.status ?? 'done'), ev);
                n.status = ev.status === 'failed' ? 'failed'
                    : ev.status === 'cancelled' ? 'cancelled' : 'done';
                n.settledAt = ev.ts;
                break;
            }
        }
    }

    p.evaluations = [...evalById.values()];
    // the OLDEST unanswered ask is the one the run is actually stuck on
    const open = [...asks.values()].sort((a, b) => a.askedAt - b.askedAt);
    if (open.length && !p.finished) { p.pending = open[0]; }
    return p;
}

// ---------------------------------------------------------------------------
// reload reconciliation
// ---------------------------------------------------------------------------

/** What the task/session/mission stores say about a record the trace names. */
export interface ExternalRecord {
    status: string;
    costUSD?: number;
    tokens?: number;
    outputFile?: string;
    /**
     * ‼️ M-19 — the session the work ran in. Without it a reload silently
     * downgrades a conversation: the participant's lane is still there on disk,
     * but the run no longer knows its id, so the next turn opens a new session
     * and is honestly labelled `handoff` — a real loss of continuity caused by
     * nothing but a window closing.
     */
    sessionId?: string;
}

export type ExternalLookup = (kind: MissionActionKind, refId: string) => ExternalRecord | undefined;

export interface ReconciledAction {
    actionId: string;
    kind: MissionActionKind;
    /** what we now believe, and on whose word */
    outcome: MissionActionOutcome | 'interrupted';
    from: 'trace' | 'task' | 'unknown';
    costUSD?: number;
    tokens?: number;
    outputFile?: string;
}

export interface Reconciliation {
    /** the journal folded up — the detail surface reads its strategy,
     *  evaluations and answers from here rather than re-reading the file */
    projection: TraceProjection;
    /** every action, with the reload's honest verdict on it */
    actions: ReconciledAction[];
    /** work that finished while the window was gone and was recovered */
    recovered: number;
    /** work whose fate nobody can state — marked, never silently re-run */
    interrupted: number;
    /** events the snapshot never caught up to (append happened, save did not) */
    snapshotBehind: number;
    /** an ask to put back on Needs You as `paused + needs-you` */
    pending?: PendingHuman;
    health: TraceHealth;
    /** the sentence the detail surface shows — empty when nothing is wrong */
    degraded: string;
    /** whether this run may be resumed, and how */
    resume: 'ok' | 'rebrief' | 'refuse';
}

/**
 * ‼️ SETTLED, IN EVERY VOCABULARY A REFERENCED RUN MIGHT SPEAK.
 *
 * An action's `refId` points at a FarmTask, a workflow run or a child mission
 * run, and the three stores do not use the same words. `stopped` is a workflow
 * chain that a person or a guard ended — the same event a task calls
 * `cancelled` — and a word missing from this table is not read as "unknown
 * vocabulary": it is read as UNSETTLED, so a chain that really did end comes
 * back as "interrupted, fate unknown" and its money disappears from the
 * parent's ledger. Adding a status to a store means adding it here.
 */
const SETTLED_TASK_STATUS: Record<string, MissionActionOutcome> = {
    done: 'done', ok: 'done', success: 'done', completed: 'done',
    failed: 'failed', error: 'failed', timeout: 'failed',
    cancelled: 'cancelled', canceled: 'cancelled', stopped: 'cancelled'
};

/**
 * Decide, at reload, what is true about a run the window abandoned.
 *
 * ‼️ THE RULE THIS ENFORCES: finished work is never lost and unfinished work is
 * never assumed. An action the trace saw start but not settle is looked up in
 * the store that actually ran it — a FarmTask that says done finished while we
 * were gone and is recovered with its cost; a task that is missing, or still
 * claims to be running with no process behind it, is `interrupted` and SAYS so.
 * The one thing that never happens is a silent restart: the user asked for this
 * work once and paying for it twice without being told is the failure the whole
 * item exists to prevent.
 */
export function reconcileRun(
    read: TraceRead,
    snapshotLastSeq: number,
    lookup: ExternalLookup = () => undefined
): Reconciliation {
    const p = projectTrace(read.events);
    const actions: ReconciledAction[] = [];
    let recovered = 0, interrupted = 0;

    for (const a of p.actions) {
        if (a.outcome) {
            actions.push({
                actionId: a.actionId, kind: a.kind, outcome: a.outcome, from: 'trace',
                ...(a.costUSD !== undefined ? { costUSD: a.costUSD } : {}),
                ...(a.tokens !== undefined ? { tokens: a.tokens } : {}),
                ...(a.outputFile ? { outputFile: a.outputFile } : {})
            });
            continue;
        }
        const rec = a.refId ? lookup(a.kind, a.refId) : undefined;
        const settled = rec ? SETTLED_TASK_STATUS[String(rec.status).toLowerCase()] : undefined;
        if (rec && settled) {
            recovered++;
            actions.push({
                actionId: a.actionId, kind: a.kind, outcome: settled, from: 'task',
                ...(rec.costUSD !== undefined ? { costUSD: rec.costUSD } : {}),
                ...(rec.tokens !== undefined ? { tokens: rec.tokens } : {}),
                ...(rec.outputFile ? { outputFile: rec.outputFile } : {})
            });
        } else {
            interrupted++;
            // ‼️ MONEY ALREADY SPENT IS FINISHED WORK, even when the outcome is
            // not. A child objective or a workflow chain that was still in
            // flight has a ledger of its own and it is not empty; dropping it
            // because the OUTCOME is unknown would leave the parent believing
            // it has a budget it no longer has — and the parent's ceiling is
            // the only fence on a run nobody is watching. The fate stays
            // honestly unknown; the figures are what they are.
            actions.push({
                actionId: a.actionId, kind: a.kind, outcome: 'interrupted', from: 'unknown',
                ...(rec?.costUSD !== undefined ? { costUSD: rec.costUSD } : {}),
                ...(rec?.tokens !== undefined ? { tokens: rec.tokens } : {})
            });
        }
    }

    const snapshotBehind = Math.max(0, p.lastSeq - snapshotLastSeq);
    const notes: string[] = [];
    if (read.health === 'missing') { notes.push('this run has no trace on disk'); }
    if (read.fromFuture) {
        notes.push(read.fromFuture + ' event(s) written by a newer version of Agent Farm'
            + ' — update Agent Farm to continue this run');
    }
    if (read.badLines) { notes.push(read.badLines + ' unreadable line(s) in the trace'); }
    if (read.invalidSeq) { notes.push(read.invalidSeq + ' event(s) with an unusable sequence number'); }
    if (read.gaps) { notes.push(read.gaps + ' event(s) missing from the journal'); }
    if (read.outOfOrder) { notes.push('the journal is out of order'); }
    if (read.beyondPrefix) { notes.push(read.beyondPrefix + ' event(s) after the break were not applied'); }
    if (read.truncatedTail) { notes.push('the last event was cut off by a crash'); }
    if (read.duplicates) { notes.push(read.duplicates + ' repeated event(s) ignored'); }
    if (snapshotLastSeq > p.lastSeq) { notes.push('the snapshot claims events the trace does not have'); }
    if (interrupted) { notes.push(interrupted + ' action(s) interrupted'); }

    // ‼️ A RESUME IS REFUSED EXACTLY WHEN THE RUN CANNOT SAY WHAT IT ALREADY SET
    // IN MOTION. Rubble on its own is survivable — the objective is in the
    // snapshot and the lead can be briefed again from it. Rubble PLUS work of
    // unknown fate is not: resuming would either duplicate it or build on a
    // result that never came.
    //
    // ‼️ X-64 — AND A JOURNAL FROM THE FUTURE IS NEVER RESUMED, in-flight work
    // or not. `rebrief` was the answer here whenever nothing was outstanding,
    // and rebriefing RUNS the mission: an old build would then append its own
    // events into a file a newer one had already numbered, leaving two
    // different truths under one seq that no later version can separate. It is
    // not a matter of how much history was lost — it is that continuing at all
    // damages a record this build cannot read.
    const lost = read.health === 'damaged' || snapshotLastSeq > p.lastSeq;
    const resume: Reconciliation['resume'] =
        read.health === 'future' ? 'refuse'
            : lost && interrupted ? 'refuse'
                : lost || read.health === 'missing' ? 'rebrief'
                    : 'ok';

    return {
        projection: p, actions, recovered, interrupted, snapshotBehind,
        ...(p.pending ? { pending: p.pending } : {}),
        health: read.health,
        degraded: notes.join('; '),
        resume
    };
}

// ---------------------------------------------------------------------------
// retention
// ---------------------------------------------------------------------------

/**
 * Trace files with no run left to explain them. The snapshot culls old runs on
 * its own (MAX_STORED_RUNS) and a deleted run takes its trace with it, so this
 * sweep is the backstop for both — an orphan is never left behind, and a file
 * that is not ours by name is never touched.
 */
export function orphanTraceFiles(fileNames: readonly string[], liveRunIds: readonly string[]): string[] {
    const live = new Set(liveRunIds);
    return fileNames.filter(n => {
        // ‼️ X-61 — a quarantined tail belongs to the same run and is swept with
        // it. A file kept for ever because the sweep only knew one suffix is
        // exactly the unbounded growth the journal split exists to prevent.
        const jsonl = n.endsWith('.jsonl') ? n : n.endsWith('.jsonl.broken') ? n.slice(0, -7) : undefined;
        if (!jsonl) { return false; }
        const id = runIdOfTraceFile(jsonl);
        return !!id && !live.has(id);
    });
}

/** Delete a run's journal, and any tail quarantined out of it (X-61). */
export function deleteTrace(file: string): void {
    try { fs.unlinkSync(file); } catch { /* already gone */ }
    try { fs.unlinkSync(quarantineFileFor(file)); } catch { /* never had one */ }
}
