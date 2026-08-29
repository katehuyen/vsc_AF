/**
 * A-22 — WHETHER A SOUND IS HEARD AT ALL.
 *
 * A-18 built the answer to "WHICH sound" (`alertVoices.resolveVoice`) and
 * stopped there, because until a fleet actually runs there is nothing to
 * silence. Running it, there is: a farm that alerts correctly at 03:00 alerts
 * correctly at 03:00, and the only remedy the user had was to walk back to the
 * machine and untick five boxes they would then have to remember to tick again.
 *
 * ‼️ WHICH SOUND AND WHETHER IT SOUNDS ARE TWO QUESTIONS AND STAY TWO. Muting
 * is NOT "resolve to no voice": a chain that can resolve to nothing loses its
 * one guarantee — that something is always heard — and every fall-through in it
 * becomes indistinguishable from a deliberate silence. So this file is a GATE
 * in front of the chain, it says WHO closed it, and it never edits a choice.
 *
 * Pure: no vscode, no fs, no child_process, no timers of its own. The clock is
 * a number that comes in.
 */

// ------------------------------------------------------------- quiet hours

/** The shape `agentFarm.alerts.quietHours` is written in. Everything optional:
 *  an empty object is a fleet that has never configured it, and that must read
 *  as "off" rather than as "quiet from 00:00 to 00:00". */
export interface QuietHours {
    on?: boolean;
    /** `HH:MM`, local time — the clock on the wall the user is walking away from. */
    from?: string;
    to?: string;
}

export const QUIET_HOURS_DEFAULT: Required<QuietHours> = { on: false, from: '23:00', to: '08:00' };

/** `HH:MM` to minutes since midnight, or null for anything that is not a time.
 *  A dot is accepted because half the world writes 23.00 and a config that
 *  rejects it silently would silence nothing and say nothing. */
export function parseClock(v: unknown): number | null {
    if (typeof v !== 'string') { return null; }
    const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{1,2})\s*$/.exec(v);
    if (!m) { return null; }
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) { return null; }
    return h * 60 + min;
}

export function fmtClock(minutes: number): string {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Local minutes-since-midnight for an instant. Local ON PURPOSE: "23:00" means
 *  the user's own night, not UTC's. */
export function minutesOfDay(at: number): number {
    const d = new Date(at);
    return d.getHours() * 60 + d.getMinutes();
}

export interface QuietVerdict {
    /** The switch is on AND the window parses. */
    configured: boolean;
    /** …and now is inside it. This is the only field the gate reads. */
    inside: boolean;
    from: string;
    to: string;
    /** When the current state flips — what "silent until 08:00" is drawn from.
     *  0 when quiet hours are off, because nothing is going to change. */
    nextChangeAt: number;
    /** Minutes to that boundary. */
    inMinutes: number;
    /** ‼️ A WINDOW THAT DOES NOT PARSE IS NAMED, NOT ASSUMED. Both silently-on
     *  and silently-off are wrong answers to a typo, and only one of them can be
     *  noticed by the person who made it. */
    error?: string;
}

/**
 * Is now inside the quiet window.
 *
 * ‼️ THE WINDOW WRAPS MIDNIGHT, WHICH IS THE ONLY CASE ANYBODY ACTUALLY SETS.
 * 23:00 to 08:00 is not `from <= now < to`; written that way it is quiet for
 * exactly no minutes of the day and the feature does nothing for the one person
 * who configured it. `to < from` means the window crosses midnight and the test
 * turns into an OR.
 *
 * `nowMinutes` is injectable so a test can ask about 03:00 without moving the
 * machine's clock or caring what timezone it runs in.
 */
export function quietHours(at: number, cfg?: QuietHours, nowMinutes?: number): QuietVerdict {
    const rawFrom = typeof cfg?.from === 'string' && cfg.from.trim() ? cfg.from : QUIET_HOURS_DEFAULT.from;
    const rawTo = typeof cfg?.to === 'string' && cfg.to.trim() ? cfg.to : QUIET_HOURS_DEFAULT.to;
    const from = parseClock(rawFrom);
    const to = parseClock(rawTo);
    const on = cfg?.on === true;
    const off = (error?: string): QuietVerdict => ({
        configured: false, inside: false,
        from: from === null ? String(rawFrom) : fmtClock(from),
        to: to === null ? String(rawTo) : fmtClock(to),
        nextChangeAt: 0, inMinutes: 0,
        ...(error ? { error } : {})
    });
    if (from === null || to === null) {
        return off(`${JSON.stringify(from === null ? rawFrom : rawTo)} is not a time of day (HH:MM)`
            + ' — quiet hours stay off until it is, rather than silencing the farm on a guess');
    }
    if (from === to) {
        // ‼️ EQUAL IS EMPTY, NOT ALL DAY. Both readings are defensible and only
        // one of them can mute a farm around the clock because of a typo.
        return off(`quiet hours start and end at ${fmtClock(from)} — that window is empty,`
            + ' so nothing is silenced. Set an end time different from the start.');
    }
    if (!on) { return off(); }
    const nm = nowMinutes ?? minutesOfDay(at);
    const wraps = to < from;
    const inside = wraps ? (nm >= from || nm < to) : (nm >= from && nm < to);
    const target = inside ? to : from;
    let delta = (target - nm + 1440) % 1440;
    if (delta === 0) { delta = 1440; }
    return {
        configured: true, inside,
        from: fmtClock(from), to: fmtClock(to),
        nextChangeAt: at + delta * 60_000, inMinutes: delta
    };
}

/** Minutes as something a person reads at a glance. */
export function fmtGap(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) { return `${m} min`; }
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** One line for a tooltip or a status bar — MIRROR: what it is doing RIGHT NOW
 *  first, the window second. */
export function quietLine(v: QuietVerdict): string {
    if (v.error) { return `Quiet hours: ${v.error}`; }
    if (!v.configured) { return `Quiet hours off (${v.from}–${v.to})`; }
    return v.inside
        ? `Quiet hours ${v.from}–${v.to} — silent until ${v.to}`
        : `Quiet hours ${v.from}–${v.to} — next in ${fmtGap(v.inMinutes)}`;
}

// ----------------------------------------------------------------- the gate

/**
 * WHO closed the gate. Three authorities, deliberately not one flag:
 *
 * - `fleet` — the user pressed 🔇. Instant, reversible in one click, and the
 *   only one of the three that is a decision about RIGHT NOW.
 * - `session` — this one conversation is not to be heard from. The fleet-wide
 *   `alerts.on` switch is a union with a session's own selection (`alertPlan`)
 *   and a union cannot subtract, so without this step there is no honest way
 *   for one session to be quiet while the others ring.
 * - `quiet-hours` — a schedule, and the only one that ends by itself.
 */
export type SilenceReason = 'fleet' | 'session' | 'quiet-hours';

export const SILENCE_ORDER: readonly SilenceReason[] = ['fleet', 'session', 'quiet-hours'];

export interface SilenceInput {
    /** `agentFarm.alerts.muted` — the status bar's own switch. */
    muted?: boolean;
    /** This session's own `muted` preference. */
    sessionMuted?: boolean;
    quiet?: QuietVerdict;
}

export interface Silence {
    silent: boolean;
    /** The first authority in `SILENCE_ORDER` — what a one-line report names. */
    reason?: SilenceReason;
    /** ‼️ ALL OF THEM, because two can be true at once and a user who unmutes
     *  at 03:00 and still hears nothing has been told a half-truth. */
    reasons: SilenceReason[];
    /** One sentence: a branch detail, a tooltip, a bridge answer. */
    detail?: string;
}

export function silenceText(reason: SilenceReason, quiet?: QuietVerdict): string {
    switch (reason) {
        case 'fleet': return 'the farm is muted (the 🔇 in the status bar)';
        case 'session': return 'this session is muted on its own';
        case 'quiet-hours': return quiet?.inside
            ? `quiet hours ${quiet.from}–${quiet.to}, silent until ${quiet.to}`
            : 'quiet hours';
    }
}

/**
 * ‼️ THE GATE IS ASKED ONCE, BEFORE THE CHAIN RUNS, AND IT ANSWERS WITH A
 * REASON. A branch reported as "skipped — the farm is muted" is a diagnosis;
 * the same branch reported as silence is the bug this family exists to stop.
 */
export function silence(input: SilenceInput): Silence {
    const reasons: SilenceReason[] = [];
    if (input.muted === true) { reasons.push('fleet'); }
    if (input.sessionMuted === true) { reasons.push('session'); }
    if (input.quiet?.inside === true) { reasons.push('quiet-hours'); }
    if (!reasons.length) { return { silent: false, reasons }; }
    return {
        silent: true,
        reason: reasons[0],
        reasons,
        detail: reasons.map(r => silenceText(r, input.quiet)).join(' · ')
    };
}
