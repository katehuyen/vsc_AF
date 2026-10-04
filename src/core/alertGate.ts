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

// -------------------------------------------------------------- the arbiter

/**
 * ‼️ A-22 — WHICH NEWS GOES FIRST WHEN FOUR AGENTS FINISH TOGETHER.
 *
 * Eight lanes is the normal case, and eight players started in the same 40 ms
 * do not make eight sounds: they make ONE noise, out of which nothing can be
 * told apart — which is the exact ability the ten tones exist to give. So the
 * sounds go through a queue, one at a time, ordered by how much the news
 * matters rather than by which hook arrived first.
 *
 * `question` is first because it is the only event where the agent is STOPPED
 * and waiting on the person; `error` next, because something is wrong;
 * `stalled` before `ended` because it can still be rescued; `turn-ready` last,
 * as the one that happens most and costs least to miss — it will be visible on
 * the Timeline either way.
 */
export const EVENT_PRIORITY: Record<string, number> = {
    question: 0, error: 1, stalled: 2, ended: 3, 'turn-ready': 4,
    // U-213 — a card or a workflow waiting on the person ranks with a question; a plain notice last
    'notice-question': 0, gate: 0, quota: 2, mission: 3, notice: 5
};

/** Between the END of one sound and the START of the next. Measured from the
 *  end rather than the start on purpose: the tones are up to 1.2 s long, so a
 *  gap counted from the start would let them overlap — which is the whole thing
 *  this queue exists to stop. */
export const ARBITER_GAP_MS = 500;

/**
 * ‼️ THE QUEUE HAS A CEILING, AND IT IS SMALL. A backlog of twenty sounds is
 * twenty-odd seconds of chiming at somebody, describing a fleet that has since
 * moved on — noise that is not just useless but actively misleading. Over the
 * ceiling the LOWEST-priority waiting item is dropped and says so, so what
 * survives a busy moment is the news worth hearing.
 */
export const ARBITER_MAX = 6;

export interface ArbiterTicket<T> {
    /** Did the player actually run. */
    played: boolean;
    result?: T;
    /** Why it never ran: `duplicate` or `overflow`. Never a failure — the
     *  player failing is `result`'s business. */
    dropped?: 'duplicate' | 'overflow';
    /** One sentence for a branch detail. */
    detail?: string;
    /** How long it sat in the queue before its turn. */
    waitedMs: number;
    /** How many sounds went in front of it while it waited. */
    ahead: number;
    error?: string;
}

interface Entry<T> {
    key: string;
    priority: number;
    seq: number;
    at: number;
    playedBefore: number;
    play: () => Promise<T>;
    resolve: (t: ArbiterTicket<T>) => void;
}

export interface ArbiterDeps {
    gapMs?: number;
    max?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

export class AudioArbiter {
    private q: Entry<unknown>[] = [];
    private running = false;
    private seq = 0;
    private plays = 0;
    private lastEndedAt = 0;
    /** ‼️ The one currently PLAYING is still the same alert. Without it the
     *  duplicate guard only covers the queue, and the second copy of a chime
     *  arriving 40 ms behind the first sails straight through it. */
    private active: string | undefined;
    private readonly gapMs: number;
    private readonly max: number;
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(deps: ArbiterDeps = {}) {
        this.gapMs = deps.gapMs ?? ARBITER_GAP_MS;
        this.max = Math.max(1, deps.max ?? ARBITER_MAX);
        this.now = deps.now ?? (() => Date.now());
        this.sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    }

    /** How many are waiting right now — what the bridge reports. */
    get depth(): number { return this.q.length; }

    /** Who is waiting, highest priority first. Reads only. */
    peek(): { key: string; priority: number; waitingMs: number }[] {
        const t = this.now();
        return [...this.q].sort(cmp)
            .map(e => ({ key: e.key, priority: e.priority, waitingMs: t - e.at }));
    }

    /**
     * Put one sound in the queue and get back what happened to it.
     *
     * ‼️ THE SAME ALERT TWICE IS ONE ALERT. A key already waiting is refused as
     * a duplicate rather than queued behind itself: two identical chimes 500 ms
     * apart say nothing the first did not, and they push something else off the
     * end of a queue that has a ceiling.
     */
    submit<T>(key: string, event: string, play: () => Promise<T>): Promise<ArbiterTicket<T>> {
        const at = this.now();
        if (this.active === key || this.q.some(e => e.key === key)) {
            return Promise.resolve({
                played: false, dropped: 'duplicate', waitedMs: 0, ahead: this.q.length,
                detail: this.active === key
                    ? 'the same alert was already playing'
                    : 'the same alert was already waiting to be played'
            });
        }
        let resolve!: (t: ArbiterTicket<T>) => void;
        const promise = new Promise<ArbiterTicket<T>>(r => { resolve = r; });
        const entry: Entry<T> = {
            key, priority: EVENT_PRIORITY[event] ?? 9, seq: this.seq++, at,
            playedBefore: this.plays, play, resolve
        };
        this.q.push(entry as Entry<unknown>);
        this.trim();
        void this.drain();
        return promise;
    }

    /** Over the ceiling: the least urgent waiting item goes, newest first among
     *  equals, and it is TOLD rather than left hanging on a promise. */
    private trim(): void {
        while (this.q.length > this.max) {
            const ordered = [...this.q].sort(cmp);
            const victim = ordered[ordered.length - 1];
            this.q.splice(this.q.indexOf(victim), 1);
            victim.resolve({
                played: false, dropped: 'overflow',
                waitedMs: this.now() - victim.at,
                ahead: this.q.length,
                detail: `${this.max} alerts were already queued — this one was the least urgent`
                    + ' and was dropped rather than chimed at you half a minute late'
            });
        }
    }

    private async drain(): Promise<void> {
        if (this.running) { return; }
        this.running = true;
        try {
            while (this.q.length) {
                this.q.sort(cmp);
                const e = this.q.shift()!;
                const wait = Math.max(0, this.lastEndedAt + this.gapMs - this.now());
                if (wait > 0) { await this.sleep(wait); }
                const startedAt = this.now();
                let result: unknown;
                let error: string | undefined;
                this.active = e.key;
                try { result = await e.play(); }
                catch (err) { error = String((err as Error)?.message ?? err).slice(0, 300); }
                finally { this.active = undefined; }
                this.lastEndedAt = this.now();
                this.plays++;
                e.resolve({
                    played: true, result, error,
                    waitedMs: startedAt - e.at,
                    ahead: this.plays - 1 - e.playedBefore
                });
            }
        } finally {
            this.running = false;
        }
    }
}

/** Priority first, then arrival — so equal news is still first-come. */
function cmp(a: { priority: number; seq: number }, b: { priority: number; seq: number }): number {
    return a.priority - b.priority || a.seq - b.seq;
}

// ---------------------------------------------------------------- the nudge

/**
 * ‼️ A-22 — THE SECOND TAP ON THE SHOULDER.
 *
 * The sound exists so the user can leave the room, and a sound heard in another
 * room while both hands are busy is a sound that gets acknowledged in a minute
 * — and then forgotten. The agent sits at its question for forty minutes and
 * the whole point of the family is lost. One light reminder, and a cap, because
 * a chime that never stops is one the user mutes for good.
 *
 * ‼️ IT REMINDS, IT DOES NOT ANNOUNCE. Only an event where the agent is STOPPED
 * and waiting can be nudged; nudging a finished turn would be pestering
 * somebody about news that needs nothing from them.
 */
export interface NudgeConfig {
    /** Minutes of no answer before the reminder. 0 = off. */
    minutes: number;
    /** How many reminders at most, after the first alert. */
    repeat: number;
    /** The tone. Deliberately its own, and lighter than the alert already
     *  missed — a second identical chime reads as a second question. */
    voice: string;
}

export const NUDGE_DEFAULT: NudgeConfig = { minutes: 3, repeat: 2, voice: 'af_subtle_alert' };

/** Clamped rather than trusted: a `minutes: 0.05` in somebody's settings would
 *  be a chime every three seconds, and the setting cannot be typed at safely. */
export function nudgeConfig(raw: unknown): NudgeConfig {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<NudgeConfig>;
    const minutes = Number(o.minutes);
    const repeat = Number(o.repeat);
    return {
        minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(240, Math.max(1, Math.round(minutes))) : 0,
        repeat: Number.isFinite(repeat) && repeat > 0 ? Math.min(20, Math.round(repeat)) : 0,
        voice: typeof o.voice === 'string' && o.voice.trim() ? o.voice.trim() : NUDGE_DEFAULT.voice
    };
}

export interface NudgeArmed {
    sessionId: string;
    event: string;
    /**
     * ‼️ THE FINGERPRINT OF "STILL WAITING ON THE SAME THING". A session whose
     * status or counters moved has been answered — or has moved on by itself —
     * and a reminder about a question that no longer exists is worse than no
     * reminder at all. Comparing the fingerprint is how that is noticed without
     * this file knowing anything about sessions.
     */
    key: string;
    armedAt: number;
    dueAt: number;
    /** How many reminders have already been sent. */
    sent: number;
}

/** What the caller knows about a session at sweep time. `undefined` = it is
 *  gone from the live list, which disarms it. */
export interface NudgeLook {
    waiting: boolean;
    key: string;
}

/** A leak is a map that only grows; a fleet cannot have this many questions
 *  open at once, and if it does the oldest are no longer news. */
export const NUDGE_MAX = 100;

export class NudgeStore {
    private map = new Map<string, NudgeArmed>();

    /** Start (or restart) the clock for one session. Re-arming an existing
     *  entry with a NEW fingerprint resets it: a second question in the same
     *  conversation is a new wait, not a continuation of the old one. */
    arm(sessionId: string, event: string, key: string, now: number, everyMs: number): NudgeArmed | undefined {
        const id = String(sessionId ?? '').trim();
        if (!id || everyMs <= 0) { return undefined; }
        const prev = this.map.get(id);
        if (prev && prev.key === key && prev.event === event) { return prev; }
        const armed: NudgeArmed = { sessionId: id, event, key, armedAt: now, dueAt: now + everyMs, sent: 0 };
        this.map.set(id, armed);
        while (this.map.size > NUDGE_MAX) {
            const oldest = [...this.map.values()].sort((a, b) => a.armedAt - b.armedAt)[0];
            this.map.delete(oldest.sessionId);
        }
        return armed;
    }

    disarm(sessionId: string): boolean {
        return this.map.delete(String(sessionId ?? '').trim());
    }

    has(sessionId: string): boolean {
        return this.map.has(String(sessionId ?? '').trim());
    }

    list(): NudgeArmed[] {
        return [...this.map.values()].map(e => ({ ...e }));
    }

    /**
     * The only clock this thing has: hand it the time and a way to ask about a
     * session, get back what should sound NOW.
     *
     * ‼️ THE SWEEP IS ALSO THE DISARM. A session that answered, ended or moved
     * on is dropped here rather than by an edge somebody has to remember to
     * wire — every edge that could have been missed is one silent nudge at 3 am
     * about a question answered hours ago.
     */
    due(now: number, look: (sessionId: string) => NudgeLook | undefined, cfg: { everyMs: number; repeat: number }): NudgeArmed[] {
        const out: NudgeArmed[] = [];
        for (const [id, e] of [...this.map]) {
            const l = look(id);
            if (!l || !l.waiting || l.key !== e.key) { this.map.delete(id); continue; }
            if (cfg.everyMs <= 0 || cfg.repeat <= 0) { this.map.delete(id); continue; }
            if (now < e.dueAt) { continue; }
            e.sent++;
            e.dueAt = now + cfg.everyMs;
            out.push({ ...e });
            // Fired its last one: forget it now rather than keeping a record
            // whose only remaining job is to be skipped.
            if (e.sent >= cfg.repeat) { this.map.delete(id); }
        }
        return out;
    }
}
