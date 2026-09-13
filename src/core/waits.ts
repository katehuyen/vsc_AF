/**
 * ‼️ X-231 — THE FLEET'S WAITS, IN ONE SHAPE.
 *
 * The condition the user put on X-230's approval: an autonomous process must
 * know that it is waiting for other reasons too — "let whoever uses this
 * function HAVE that knowledge, let them give the command willing to wait, and
 * if the command is making them wait, let them understand it with its reason."
 *
 * ‼️ THE ROOT CAUSE WAS NOT A MISSING FIGURE, IT WAS A MISSING VOCABULARY.
 * Every wait in this extension is already reported correctly on its own
 * surface: a parked run says which ceiling holds it, a mission says it is
 * waiting for an approval, a sentry says when it wakes, an armed restart says
 * which session it is behind. What nobody could do was ask ONE question —
 * "why am I not moving?" — without calling five ops and reading five shapes.
 * And when a sixth reason was added, nothing told anybody.
 *
 * So this module is a TRANSLATION and never a second source:
 *
 *   · the reason is the sentence the source ALREADY wrote. Nothing is
 *     paraphrased here — two sentences about one wait is exactly how a surface
 *     and an op come to disagree about the same fact;
 *   · `clearedBy` answers the only question a caller really has: will this end
 *     by itself (`clock`), when something else finishes (`event`), or not until
 *     a person acts (`human`)? A caller deciding whether to wait needs that
 *     before it needs a timestamp;
 *   · `op` is the hand: the op that ENDS this wait, where one exists. A reading
 *     that only says "you are blocked" leaves the caller polling;
 *   · and the shape is used by the ops that PRODUCE a wait as well as the one
 *     that reads them (`armedRestartWait` is X-230's `decision:"armed"`), so
 *     the answer an agent gets in the moment and the answer it gets afterwards
 *     are the same object.
 *
 * ‼️ THE VOCABULARY IS GUARDED BY THE SOURCES, NOT BESIDE THEM. `test_waits.js`
 * reads `launchBlock` out of `tasks.ts` and the `MissionRunStatus` union out of
 * `missions.ts`: a sixth block code, or a new `waiting-…` status, that nothing
 * here translates fails the build. That is the only version of "it must not
 * grow silently" that survives the person who wrote the rule.
 */

/** What ends a wait — the first thing a caller deciding whether to wait needs. */
export type WaitClearedBy = 'clock' | 'event' | 'human';

/** Whose wait it is. `window` is the extension host itself. */
export type WaitSubjectKind = 'task' | 'mission' | 'sentry' | 'window';

export interface WaitSubject {
    kind: WaitSubjectKind;
    id: string;
    /** what a person would call it — an id alone makes a reader open another op */
    name: string;
}

/** One wait, whatever produced it. */
export interface FleetWait {
    kind: string;
    subject: WaitSubject;
    /** the source's OWN sentence; never written here */
    reason: string;
    since: number;
    /** known only where a clock decides it */
    until?: number;
    /** what must finish first, as `task:<id>` / `session:<id>` — derived, never hand-listed */
    blockedBy: string[];
    clearedBy: WaitClearedBy;
    /** the op that ends this wait, where one exists */
    op?: string;
}

export interface TaskWaitRule {
    /** the stable head of `launchBlock`'s code — the figure after it is not identity */
    prefix: string;
    kind: string;
    clearedBy: WaitClearedBy;
    op?: string;
}

/**
 * ‼️ ONE ROW PER HOLD `launchBlock` CAN PRODUCE. Longest prefix first, because
 * `concurrency:fleet` and `concurrency:agent:` share a head.
 */
export const TASK_WAIT_RULES: TaskWaitRule[] = [
    // The moment is IN the code (`wait:<ms>`), which is why `until` can be read
    // rather than guessed — see `launchBlock`'s own note on why it is there.
    { prefix: 'wait:', kind: 'task-clock', clearedBy: 'clock', op: 'tasks.unpark' },
    { prefix: 'round:binding', kind: 'task-round', clearedBy: 'event' },
    { prefix: 'session:busy:', kind: 'task-session', clearedBy: 'event' },
    // ‼️ X-296 — THE ONE HOLD NOTHING IN THE FLEET WILL EVER CLEAR BY ITSELF.
    // A missing sign-in is not contention and not a clock: no run finishing and
    // no minute passing brings it back, so the reading has to say a PERSON is
    // the thing being waited for, and name the door — otherwise this parks like
    // a queue and reads like one.
    { prefix: 'account:missing:', kind: 'task-account', clearedBy: 'human', op: 'accounts.capture' },
    { prefix: 'concurrency:agent:', kind: 'task-agent', clearedBy: 'event' },
    { prefix: 'concurrency:fleet', kind: 'task-fleet', clearedBy: 'event' }
];

export interface MissionWaitRule { status: string; kind: string; op: string }

/** The `waiting-…` members of `MissionRunStatus`, and the hand that ends each. */
export const MISSION_WAIT_RULES: MissionWaitRule[] = [
    { status: 'waiting-approval', kind: 'mission-approval', op: 'missions.approve' },
    { status: 'waiting-user', kind: 'mission-answer', op: 'missions.answer' }
];

/**
 * Every kind this module can produce. `task-unknown` is here on purpose: a hold
 * this build does not recognise is REPORTED as one rather than dropped, because
 * a wait that vanishes from the reading is worse than a wait with a dull name.
 */
export const WAIT_KINDS: string[] = [
    ...TASK_WAIT_RULES.map(r => r.kind),
    'task-unknown',
    ...MISSION_WAIT_RULES.map(r => r.kind),
    'sentry-wake',
    'restart-armed'
];

/** A queued row as the board already holds it. */
export interface TaskWaitRow {
    id: string;
    title?: string;
    agent?: string;
    status: string;
    /** `deferredCode` — the ceiling's identity */
    heldByCode?: string;
    /** `deferredReason` — the sentence the row and its notice already show */
    heldBy?: string;
    since?: number;
}

export interface MissionWaitRow {
    id: string;
    name?: string;
    status: string;
    /** the run's own "what it is doing right now" line */
    now?: string;
    since?: number;
}

export interface SentryWaitRow {
    id: string;
    name?: string;
    status: string;
    /** whether a round is on the board — derived by the caller, never stored */
    running: boolean;
    wakeAt?: number;
    lastWhy?: string;
    lastAt?: number;
}

export interface ArmedWaitRow {
    kind: string;
    armedAt: number;
    reason?: string;
    waitingFor?: { kind?: string; id?: string; name?: string }[];
}

export interface WaitWorld {
    now: number;
    tasks?: TaskWaitRow[];
    missions?: MissionWaitRow[];
    sentry?: SentryWaitRow;
    armed?: ArmedWaitRow;
}

const named = (id: string, name?: string): string => String(name ?? '').trim() || id;

/**
 * ‼️ X-230's ANSWER, BUILT HERE. The op that arms a restart returns this object
 * and `farm.waits` reports the same one, so an agent reads the wait it was just
 * handed and the wait it asks about later in one dialect.
 */
export function armedRestartWait(a: ArmedWaitRow | undefined, now: number): FleetWait | undefined {
    if (!a) { return undefined; }
    const live = (a.waitingFor ?? []).filter(s => s && s.id);
    return {
        kind: 'restart-armed',
        subject: { kind: 'window', id: a.kind || 'extensionHost', name: a.kind || 'extensionHost' },
        reason: String(a.reason ?? '').trim()
            || 'a restart is armed and fires by itself once the last live session ends',
        since: typeof a.armedAt === 'number' ? a.armedAt : now,
        blockedBy: live.map(s => 'session:' + s.id),
        clearedBy: 'event',
        op: 'farm.restartExtensionHost'
    };
}

/** The one hold a task is under, translated. `undefined` = it is not waiting. */
function taskWait(row: TaskWaitRow, running: TaskWaitRow[], now: number): FleetWait | undefined {
    if (row.status !== 'queued' || !row.heldByCode) { return undefined; }
    const code = String(row.heldByCode);
    const rule = TASK_WAIT_RULES.find(r => code.indexOf(r.prefix) === 0);
    const subject: WaitSubject = { kind: 'task', id: row.id, name: named(row.id, row.title) };
    const reason = String(row.heldBy ?? '').trim() || 'held by ' + code;
    const since = typeof row.since === 'number' ? row.since : now;
    if (!rule) {
        // ‼️ NOT DROPPED. A build that meets a ceiling it has no name for still
        // has to say the run is not moving; the gate in `test_waits.js` is what
        // stops this branch from becoming the normal case.
        return { kind: 'task-unknown', subject, reason, since, blockedBy: [], clearedBy: 'event' };
    }
    const out: FleetWait = {
        kind: rule.kind, subject, reason, since, blockedBy: [], clearedBy: rule.clearedBy
    };
    if (rule.op) { out.op = rule.op; }
    if (rule.kind === 'task-clock') {
        const at = Number(code.slice(rule.prefix.length));
        if (Number.isFinite(at) && at > 0) { out.until = at; }
    } else if (rule.kind === 'task-session') {
        out.blockedBy = ['session:' + code.slice(rule.prefix.length)];
    } else if (rule.kind === 'task-fleet') {
        out.blockedBy = running.map(t => 'task:' + t.id);
    } else if (rule.kind === 'task-agent') {
        const who = code.slice(rule.prefix.length);
        out.blockedBy = running.filter(t => t.agent === who).map(t => 'task:' + t.id);
    }
    return out;
}

/**
 * Every open wait in the fleet, in one list.
 *
 * ‼️ SOONEST RELIEF FIRST, AND THE ONES NOTHING WILL END LAST. A caller asking
 * this is deciding whether to wait, so the order answers "how long until
 * something changes"; a wait with no `until` is the answer "not by itself", and
 * among those the one that has been standing longest goes first — it is the one
 * a person has been failing to notice.
 */
export function fleetWaits(w: WaitWorld): FleetWait[] {
    const now = typeof w.now === 'number' ? w.now : Date.now();
    const tasks = w.tasks ?? [];
    const running = tasks.filter(t => t.status === 'running');
    const out: FleetWait[] = [];

    for (const t of tasks) {
        const x = taskWait(t, running, now);
        if (x) { out.push(x); }
    }

    for (const m of w.missions ?? []) {
        const rule = MISSION_WAIT_RULES.find(r => r.status === m.status);
        if (!rule) { continue; }
        out.push({
            kind: rule.kind,
            subject: { kind: 'mission', id: m.id, name: named(m.id, m.name) },
            reason: String(m.now ?? '').trim() || 'the run is ' + m.status,
            since: typeof m.since === 'number' ? m.since : now,
            blockedBy: [],
            clearedBy: 'human',
            op: rule.op
        });
    }

    // ‼️ A CAMPAIGN WITH A ROUND ON THE BOARD IS WORKING, NOT WAITING, and a
    // paused or stopped one is off rather than held — neither is a wait, and
    // reporting them as one would make "the fleet is waiting for 3 things" a
    // number nobody could act on.
    const s = w.sentry;
    if (s && s.status === 'running' && !s.running && typeof s.wakeAt === 'number' && s.wakeAt > now) {
        out.push({
            kind: 'sentry-wake',
            subject: { kind: 'sentry', id: s.id, name: named(s.id, s.name) },
            reason: String(s.lastWhy ?? '').trim()
                || 'the campaign is sleeping until its next look at the backlog',
            since: typeof s.lastAt === 'number' ? s.lastAt : now,
            until: s.wakeAt,
            blockedBy: [],
            clearedBy: 'clock'
        });
    }

    const armed = armedRestartWait(w.armed, now);
    if (armed) { out.push(armed); }

    return out.sort((a, b) => {
        if (a.until !== undefined && b.until !== undefined) { return a.until - b.until; }
        if (a.until !== undefined) { return -1; }
        if (b.until !== undefined) { return 1; }
        return a.since - b.since;
    });
}
