/**
 * ‼️ X-124 (U-104) — "WHAT IT ACTUALLY RAN WITH" IS A FACT ABOUT A TURN, NOT
 * ABOUT A WHOLE CONVERSATION.
 *
 * U-104 put the engine's own testimony beside the request: which models really
 * served a delegation, under which permission mode. The testimony was read off
 * `SessionInfo` — `models` is every model the session ever used and
 * `permissionMode` is the LAST mode the transcript mentions — and a session is
 * not a delegation. A lane that is resumed serves several of them, and a lead's
 * lane can be older than the mission entirely. So:
 *
 *   · every step of a resumed lane listed the same set of models, including the
 *     ones from rounds it had nothing to do with;
 *   · the mismatch check, which asks "is the model I requested among the ones
 *     that served me", found the request in SOME earlier turn and reported
 *     agreement — hiding the very case it exists to catch;
 *   · a permission mode changed on a later resume spoke for a step taken before
 *     it.
 *
 * The transcript already carries the answer per turn (`SessionTurn.models`, and
 * `permissionMode` since this item). What was missing is the BINDING: which
 * turns belong to this step, this round, this run. That binding is a time
 * window the caller owns — a task's own start and end, a run's own start and
 * end — and it is the caller that must supply it, because this file knows
 * nothing about missions.
 *
 * ‼️ AND THE THREE ANSWERS ARE KEPT APART, because collapsing them is the whole
 * defect. `turn` is evidence about this piece of work. `session` is the old
 * whole-lane reading, still shown but LABELLED as the lane's, for a caller that
 * genuinely has no window (a step whose task row retention has removed).
 * `unattributed` is the honest silence: there is a window, and no turn of that
 * session falls inside it, so nothing here is about this step.
 *
 * ‼️ A VERDICT MAY ONLY BE DRAWN ON `turn`. A mismatch computed from the lane's
 * aggregate is a claim about the wrong evidence — which is how this defect
 * stayed invisible — so the surfaces gate the ≠ mark on the scope, not on the
 * values.
 *
 * Pure: `SessionTurn[]` in, a reading out. No vscode, no disk, no index.
 */
import type { SessionTurn } from './sessions';

/** Which evidence answered. See the header — collapsing these is the defect. */
export type AppliedScope = 'turn' | 'session' | 'unattributed';

export interface AppliedReading {
    /** Models the bound turns were served by, first seen first. */
    models: string[];
    /** The mode, when the bound turns state exactly one. Null otherwise — a
     *  silence and a disagreement are both "no single answer", and
     *  `permissionModes` is where a disagreement is readable. */
    permissionMode: string | null;
    /** ‼️ Every distinct mode across the bound turns, in order. Longer than one
     *  means the mode CHANGED inside the window, which is a fact worth drawing
     *  and one that a single-value field can only destroy. */
    permissionModes: string[];
    /**
     * ‼️ SILENCE IS A VALUE HERE. No engine reports the effort it ran at,
     * anywhere, today — so this is null on every reading and every surface
     * prints "not reported" for it rather than echoing the REQUEST back as if
     * the transcript had confirmed it. Showing a requested value in a column
     * headed "applied" is how a mismatch stays invisible; the same rule governs
     * `models` and `permissionMode` above, which are empty and null when the
     * transcript said nothing.
     */
    effort: null;
    scope: AppliedScope;
    /** How many turns the window bound. Absent unless `scope` is `turn`. */
    turns?: number;
}

/** The stretch of wall clock a piece of work occupied. `to` absent = still
 *  going, so everything from `from` onwards belongs to it. */
export interface AppliedWindow {
    from: number;
    to?: number;
}

/**
 * When a turn ended, as far as the transcript can say.
 *
 * `ms` is 0 while a turn is still open, and a turn that never closed still owns
 * the time up to the next one — otherwise a step running inside it would bind
 * nothing. The LAST open turn owns everything after it, which is what "still
 * going" means.
 */
function turnEnd(turns: readonly SessionTurn[], i: number): number {
    const t = turns[i];
    if (t.ms > 0) { return t.ts + t.ms; }
    const next = turns[i + 1];
    return next ? next.ts : Number.POSITIVE_INFINITY;
}

/**
 * The turns of one session that overlap a window.
 *
 * ‼️ OVERLAP, NOT CONTAINMENT. A delegation's task starts a moment before its
 * first prompt is written and ends a moment after the last line lands, and a
 * turn that straddles either edge is still the turn that did the work.
 * Demanding containment would unbind exactly the boundary turns.
 */
export function turnsInWindow(
    turns: readonly SessionTurn[], w: AppliedWindow
): SessionTurn[] {
    if (!Number.isFinite(w.from) || w.from <= 0) { return []; }
    const to = Number.isFinite(w.to) && (w.to as number) > 0
        ? (w.to as number) : Number.POSITIVE_INFINITY;
    return turns.filter((t, i) => t.ts > 0 && t.ts <= to && turnEnd(turns, i) >= w.from);
}

/** Distinct values, first seen first — the order a reader met them in. */
function distinct(values: readonly string[]): string[] {
    const out: string[] = [];
    for (const v of values) {
        const s = String(v || '').trim();
        if (s && !out.includes(s)) { out.push(s); }
    }
    return out;
}

/**
 * What the engine says it served, for one piece of work.
 *
 * `window` absent = the caller has no way to bind this to a stretch of the
 * conversation, and the answer is the LANE'S, labelled as such. Passing one and
 * binding nothing is `unattributed`, which is the point of the item: a reading
 * that is not about this step is not shown as if it were.
 */
export function appliedInWindow(
    session: { models?: string[]; permissionMode?: string; turns?: SessionTurn[] } | undefined,
    window?: AppliedWindow
): AppliedReading | null {
    if (!session) { return null; }
    const wholeLane = (): AppliedReading => ({
        models: distinct(session.models ?? []),
        permissionMode: session.permissionMode || null,
        permissionModes: distinct(session.permissionMode ? [session.permissionMode] : []),
        effort: null,
        scope: 'session'
    });
    if (!window) { return wholeLane(); }
    const turns = session.turns ?? [];
    // ‼️ A session with no turns at all cannot be bound to anything, and saying
    // "the whole lane" for it would be the aggregate reading wearing a window's
    // clothes. It is the honest silence instead.
    const bound = turnsInWindow(turns, window);
    if (!bound.length) {
        return {
            models: [], permissionMode: null, permissionModes: [],
            effort: null, scope: 'unattributed'
        };
    }
    const modes = distinct(bound.map(t => t.permissionMode ?? ''));
    return {
        models: distinct(bound.flatMap(t => t.models ?? [])),
        permissionMode: modes.length === 1 ? modes[0] : null,
        permissionModes: modes,
        effort: null,
        scope: 'turn',
        turns: bound.length
    };
}
