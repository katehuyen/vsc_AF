import { SessionInfo, SessionTurn } from './sessions';

/**
 * S-52 — HOW LONG A SESSION REALLY RAN, when it was put down and picked up again.
 *
 * The sessions table has always shown `lastTs - firstTs`, and that figure is
 * true: it is the wall clock between the first message and the last. But it was
 * the ONLY figure on the row, so a conversation resumed the next morning reads
 * as a day and a half, and every rate derived from it — cost per hour, minutes
 * per turn — is divided by a night's sleep.
 *
 * The turns page has carried both halves all along: `durationMs` runs to the
 * next turn and `ms` is what the turn itself ran. This is the same pair one
 * level up, and it is DERIVED — the turn timeline is already in the index, so
 * nothing is re-read and no transcript is parsed again.
 *
 * ‼️ AWAY IS MEASURED BETWEEN TURNS, NEVER INSIDE ONE. A three-hour headless
 * round is the work itself; a rule that called a long turn absence would
 * subtract exactly what the figure exists to show. The only thing taken off is
 * the stretch between one turn's last line and the next turn's prompt — which
 * is a person not being there, and is the whole of what a resume adds.
 *
 * ‼️ AND NOTHING IS SUBTRACTED ON NO EVIDENCE. A session whose turns were not
 * recorded (an engine whose parser fills only the two endpoints, an import) is
 * UNMEASURED, not idle: active falls back to the wall clock rather than to a
 * guess, exactly as the sentry refuses to end a round it has no moment for.
 */

/**
 * How long a pause between turns has to run before it stops being someone
 * thinking and starts being someone away. Half an hour: measured turns on this
 * fleet pause for minutes between prompts, and the case the item was opened for
 * is a session resumed the NEXT DAY, so nothing near the boundary is at stake.
 */
export const SESSION_BREAK_MIN = 30;

export interface SessionSpan {
    /** first message to last, in ms — the figure the table has always shown */
    wallMs: number;
    /** …of that, the stretches nobody was there for */
    awayMs: number;
    /** wall clock less the absences: what the session actually ran */
    activeMs: number;
    /**
     * ‼️ S-53 — THE TURNS' OWN TIME, ADDED UP, and the user's correction to the
     * figure above: "a session's duration is not the span from its first turn
     * to its last, it is the sum of the turns' active durations."
     *
     * `activeMs` takes out the absences and is right about them, but everything
     * SHORTER than the break limit is still inside it — a reader thinking, a
     * prompt being typed, twenty minutes of neither. That is the session
     * sitting there, not running, and on a conversation worked in bursts it is
     * most of the figure. This is what the engine was actually answering for:
     * each turn's prompt→last-line, summed.
     *
     * ‼️ NOT MEASURED IS NOT ZERO. A transcript whose turns carry no duration
     * (an import, an engine whose parser fills only the endpoints, a session
     * with one turn still open) would sum to nothing, and a row reading `0m`
     * for real work is worse than the wall clock ever was. So with no turn
     * measured this falls back to `activeMs`, the same refusal-to-guess
     * `activeMs` itself makes against `wallMs`.
     *
     * The three are a ladder — `busyMs` ≤ `activeMs` ≤ `wallMs` — because a
     * turn's own time is inside the wall clock and an absence is between turns.
     */
    busyMs: number;
    /** false = no turn carried a duration, so `busyMs` is `activeMs` borrowed */
    busyMeasured: boolean;
    /** how many times it was put down and picked up again */
    breaks: number;
}

/** The session's own clock, as the index holds it. */
type Spanned = Pick<SessionInfo, 'firstTs' | 'lastTs'> & { turns?: readonly SessionTurn[] };

/**
 * Split a session's wall clock into the part it ran and the part it was left.
 *
 * `breakMin` of 0 or less switches the question off — active is the wall clock
 * again, which is the behaviour every surface had before this existed.
 */
export function sessionSpan(s: Spanned, breakMin: number = SESSION_BREAK_MIN): SessionSpan {
    const first = Number(s?.firstTs) || 0, last = Number(s?.lastTs) || 0;
    const wallMs = first && last && last > first ? last - first : 0;
    const limit = Number(breakMin) || 0;
    // A turn with no stamp is skipped rather than measured from zero: it would
    // read as an absence stretching back to 1970.
    const turns = (s.turns ?? []).filter(t => !!t && (Number(t.ts) || 0) > 0);
    // ‼️ S-53 — summed before the early return, because "how long did the
    // engine work" is a question the break limit has no say in: switching the
    // absence rule off (`breakMin: 0`) is a statement about ABSENCES, and
    // answering it by also forgetting the turns would tie two unrelated
    // decisions together.
    let busyMs = 0, measured = 0;
    for (const t of turns) {
        const ms = Math.max(0, Number(t.ms) || 0);
        if (ms > 0) { busyMs += ms; measured++; }
    }
    if (wallMs <= 0 || limit <= 0) {
        const activeMs = wallMs;
        return {
            wallMs, awayMs: 0, activeMs, breaks: 0,
            busyMs: measured ? Math.min(busyMs, activeMs) : activeMs,
            busyMeasured: measured > 0
        };
    }
    let awayMs = 0, breaks = 0;
    for (let i = 1; i < turns.length; i++) {
        const endOfPrev = (Number(turns[i - 1].ts) || 0) + Math.max(0, Number(turns[i - 1].ms) || 0);
        const gap = (Number(turns[i].ts) || 0) - endOfPrev;
        if (gap > limit * 60 * 1000) { awayMs += gap; breaks++; }
    }
    // The absences are carved OUT of the wall clock, so they can never exceed
    // it however the two were measured.
    awayMs = Math.min(awayMs, wallMs);
    const activeMs = wallMs - awayMs;
    return {
        wallMs, awayMs, activeMs, breaks,
        // ‼️ CLAMPED, and the clamp is not defensive tidying: a turn's `ms` runs
        // to its last recorded LINE, and a sidechain that writes after the turn
        // is accounted can push the sum a little past the clock it sits inside.
        // A "ran for" longer than the wall clock is the one reading that would
        // make the whole ladder untrustworthy.
        busyMs: measured ? Math.min(busyMs, activeMs) : activeMs,
        busyMeasured: measured > 0
    };
}
