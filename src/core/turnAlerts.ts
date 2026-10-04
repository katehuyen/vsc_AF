/**
 * ‼️ WHOSE TURN IT IS — AND WHICH CONVERSATION SAID SO (U-66).
 *
 * The Live Timeline draws one swim lane per SESSION: three concurrent runs of
 * the `developer` agent are `developer #1/#2/#3`, three rows, three ids. The
 * four alert controls in each row's gutter, however, used to key off the AGENT
 * name — so all three rows showed one setting and clicking any of them changed
 * all three. A page whose entire subject is "several sessions at once" was
 * unable to say anything about one of them.
 *
 * Everything here follows from one decision: **the session is the only
 * identity.** Not the agent name, not the `#2` the label happens to carry
 * today, not the working directory — those are all views of a session, and two
 * of them change while it runs. A preference is `SessionAlertPrefs`, keyed by
 * the canonical `sessionId`, and there is no second layer under it to fall back
 * to.
 *
 * The file also owns the two things the old implementation left unmeasured:
 *
 * - **The sound.** It was `cp.exec('powershell … [console]::beep(…)')` — a
 *   shell string, no callback, no exit code, no timeout, and a `try/catch` that
 *   cannot see an async spawn failure. When it did not play, nothing anywhere
 *   said so. Here every attempt returns a `SoundResult` and the caller can show
 *   it. `exitCode === 0` means THE PLAYER ACCEPTED THE FILE; it is not a claim
 *   that a human heard anything, and nothing in this file pretends otherwise.
 * - **The turn.** "One alert per turn" was a 3-second cooldown, which both
 *   swallows a real second turn that lands quickly and says nothing about the
 *   `Notification`+`Stop` pair that is one turn. A turn KEY is monotonic per
 *   session, so the same turn is one alert however many events announce it.
 */

import { ALERT_EVENTS, extensionOf, type AlertEvent } from './alertVoices';
import {
    parseVoiceList, speakCandidates, voiceListCandidate,
    type InstalledVoice, type SpeakConfig
} from './speech';
import { withToneVolume } from './toneVolume';

export const TURN_ALERT_ACTIONS = ['sound', 'focus', 'modal', 'toast'] as const;
export type TurnAlertAction = (typeof TURN_ALERT_ACTIONS)[number];

/** The allowlist, as a question. Anything else the page or an agent sends is
 *  refused by name rather than stored and drawn as a control nobody wrote. */
export function isTurnAlertAction(v: unknown): v is TurnAlertAction {
    return typeof v === 'string' && (TURN_ALERT_ACTIONS as readonly string[]).includes(v);
}

/**
 * The canonical form of a selection: only known actions, each at most once,
 * always in the order the row draws them. Two selections of the same set are
 * therefore the same array, which is what makes "did this change?" answerable.
 */
export function normalizeActions(v: unknown): TurnAlertAction[] {
    const want = new Set<string>();
    if (Array.isArray(v)) {
        for (const a of v) { if (isTurnAlertAction(a)) { want.add(a); } }
    }
    return TURN_ALERT_ACTIONS.filter(a => want.has(a));
}

/**
 * The canonical form of a session's own voice picks (A-23).
 *
 * ‼️ ONLY THE KEYS ARE CHECKED HERE, NEVER THE VALUE. Whether `chime-bright`
 * still exists, still has a file and can still be played on this machine is
 * `alertVoices.resolveVoice`'s question and is asked at RESOLUTION time — a
 * second opinion stored here would go stale the moment the user deletes the
 * file, and the two would then disagree about what will be heard. An id nothing
 * answers is skipped by the chain, with the reason, and the step below is used.
 */
export function normalizeVoices(v: unknown): Partial<Record<AlertEvent, string>> {
    const out: Partial<Record<AlertEvent, string>> = {};
    if (!v || typeof v !== 'object') { return out; }
    const raw = v as Record<string, unknown>;
    for (const event of ALERT_EVENTS) {
        const id = typeof raw[event] === 'string' ? (raw[event] as string).trim() : '';
        if (id) { out[event] = id; }
    }
    return out;
}

/**
 * What one session wants when it reaches YOUR TURN.
 *
 * `lastSeenAt` is when the live monitor last had this session on its list —
 * the only honest input to "may this be forgotten?". The old code deleted an
 * override eight seconds after a reload if the session had not reappeared yet,
 * which is a race against the rebuild, not a policy.
 */
export interface SessionAlertPrefs {
    sessionId: string;
    actions: TurnAlertAction[];
    /**
     * ‼️ A-23 — THE `session` STEP OF THE RESOLUTION CHAIN, AND IT LIVES HERE
     * BECAUSE THE SESSION'S LIFECYCLE ALREADY DOES.
     *
     * `alertVoices.resolveVoice` has read this step since A-18 and nothing ever
     * wrote it: the hook was left unbound, so "this conversation uses that
     * tone" fell through on every resolution. It could have had a store of its
     * own — and that store would have needed its own rekey (a terminal lane is
     * renamed the moment the engine names its conversation), its own TTL, its
     * own ceiling and its own forget, all of which are already right here and
     * all of which would have drifted the first time one of them changed.
     *
     * ONE EVENT, ONE VOICE ID. Absent means "this session has no opinion", which
     * is NOT the same as silence — the chain falls to the agent, the settings
     * and finally the built-in default, and something is always heard.
     */
    voices?: Partial<Record<AlertEvent, string>>;
    /**
     * ‼️ A-22 — THE ONE THING A UNION CANNOT EXPRESS: "not this conversation".
     *
     * `alertPlan` adds the session's own selection to the fleet-wide
     * `agentFarm.alerts.on`, on purpose — neither authority may take away what
     * the other granted, or an upgrade would silence installs that have been
     * ringing for months. The cost of that guarantee is that unticking the ♪
     * box does NOT make a session quiet while `alerts.on.question` is on, and
     * one loud agent in a fleet of eight had no answer at all.
     *
     * Mute is that answer, and it is deliberately NOT part of the plan: it is a
     * GATE in front of the sound (`alertGate.silence`), it names itself in the
     * branch it skips, and it leaves every choice underneath it untouched, so
     * unmuting restores exactly what was there before.
     */
    muted?: boolean;
    /**
     * ‼️ A-20 — WHICH VOICE SAYS THIS CONVERSATION'S NAME OUT LOUD.
     *
     * The fleet setting picks one voice for everything, and that is the
     * wrong shape the moment two agents are worth telling apart BY EAR:
     * a Turkish voice for the one whose questions are in Turkish, a
     * different one for the rest, and the difference is audible from the
     * next room without a word being understood. Absent means "this
     * session has no opinion" and the fleet setting answers — never
     * silence, exactly like `voices` above.
     */
    speechVoice?: string;
    /**
     * ‼️ A-26 — DOES THIS CONVERSATION GET READ OUT LOUD WHEN A TURN ENDS.
     *
     * Per session and nothing else: there is no fleet-wide "read everything",
     * because a farm of eight agents reading their answers over each other is
     * not a cockpit, it is a crowd. The user turns it on for the ONE session
     * they walked away from.
     *
     * Absent is off — like `muted` above, only `true` is ever recorded, so
     * there is no third "explicitly not reading" state to keep in step. Which
     * voice does the reading is `speechVoice`, already beside it, and turning
     * this on does not choose one.
     */
    readAloud?: boolean;
    updatedAt: number;
    lastSeenAt: number;
}

export interface TurnAlertStoreDeps {
    /** Raw persisted map (globalState) — anything shaped wrong is dropped. */
    read: () => Record<string, unknown>;
    /** Persist. Calls are serialized and awaited in order by the store. */
    write: (map: Record<string, SessionAlertPrefs>) => Thenable<void> | Promise<void> | void;
    /** Migration marker; 0 = never run. */
    readMigration: () => number;
    writeMigration: (v: number) => Thenable<void> | Promise<void> | void;
    now?: () => number;
    /** A preference changed — never the lastSeenAt touch `seen` makes on every refresh. */
    changed?: () => void;
}

/** Bump this only when a NEW one-time copy has to happen. */
export const TURN_ALERT_MIGRATION = 1;
/** A preference nobody's session has been seen for this long is stale. */
export const TURN_ALERT_TTL_MS = 30 * 24 * 3600 * 1000;
/** Hard ceiling, newest-seen kept — a map that only ever grows is a leak. */
export const TURN_ALERT_MAX = 300;

export interface AlertSetResult {
    ok: boolean;
    error?: string;
    prefs?: SessionAlertPrefs;
}

export interface AlertRekeyResult {
    ok: boolean;
    /** `conflict` = the target already had its own preference; nothing merged. */
    reason?: 'absent' | 'conflict' | 'same' | 'invalid';
}

/**
 * The in-memory authority. Reads never touch storage; writes are queued so two
 * clicks in the same tick cannot land out of order, and `flush()` is what a
 * test (or a shutdown) awaits.
 */
export class TurnAlertStore {
    private map = new Map<string, SessionAlertPrefs>();
    private queue: Promise<void> = Promise.resolve();
    private readonly now: () => number;

    constructor(private deps: TurnAlertStoreDeps) {
        this.now = deps.now ?? (() => Date.now());
        const raw = deps.read() ?? {};
        for (const [id, v] of Object.entries(raw)) {
            const p = this.sanitize(id, v);
            if (p) { this.map.set(p.sessionId, p); }
        }
    }

    /** One stored record, or nothing. Unknown shapes are not repaired — a
     *  preference we cannot read is a preference we must not act on. */
    private sanitize(id: string, v: unknown): SessionAlertPrefs | undefined {
        const sessionId = String(id ?? '').trim();
        if (!sessionId || !v || typeof v !== 'object') { return undefined; }
        const o = v as Partial<SessionAlertPrefs>;
        const actions = normalizeActions(o.actions);
        const voices = normalizeVoices(o.voices);
        // ‼️ A-23 — A RECORD IS WORTH KEEPING IF IT SAYS ANYTHING AT ALL. It used
        // to be "has actions", which after A-23 would throw away a session that
        // had only picked a tone: nothing is armed on it from here yet, but the
        // global `alerts.on` switch can still ring it, and the choice has to
        // survive the reload that follows making it.
        // ‼️ A-22 — …and a session that says only "keep me quiet" says something
        // too. Dropped here, a mute would survive exactly until the next reload
        // and then the agent would start talking again by itself.
        // ‼️ A-26 — …and EVERY sticky field has to be listed here, not just the
        // two that were. `speechVoice` was written by its setter, carried by
        // `keep()` and asked for by `speechVoiceFor`, but never READ BACK: this
        // function rebuilds the record from the raw object, so a chosen voice
        // was dropped on the next window reload, and a session whose only
        // preference was that voice was dropped whole. The list a setter must
        // carry (`keep`) and the list a reload must restore (here) are the same
        // list, and they are the reason a field added to one and not the other
        // fails silently.
        const muted = o.muted === true;
        const readAloud = o.readAloud === true;
        const speechVoice = typeof o.speechVoice === 'string' && o.speechVoice.trim()
            ? o.speechVoice.trim().slice(0, 200)
            : '';
        if (!actions.length && !Object.keys(voices).length && !muted && !readAloud && !speechVoice) {
            return undefined;
        }
        const t = this.now();
        return {
            sessionId,
            actions,
            ...(Object.keys(voices).length ? { voices } : {}),
            ...(muted ? { muted: true } : {}),
            ...(speechVoice ? { speechVoice } : {}),
            ...(readAloud ? { readAloud: true } : {}),
            updatedAt: typeof o.updatedAt === 'number' && o.updatedAt > 0 ? o.updatedAt : t,
            lastSeenAt: typeof o.lastSeenAt === 'number' && o.lastSeenAt > 0 ? o.lastSeenAt : t
        };
    }

    /** Everything, as a plain object — what the page and the bridge are given. */
    all(): Record<string, SessionAlertPrefs> {
        const out: Record<string, SessionAlertPrefs> = {};
        for (const [id, p] of this.map) {
            out[id] = {
                ...p, actions: [...p.actions],
                ...(p.voices ? { voices: { ...p.voices } } : {}),
                ...(p.muted ? { muted: true } : {})
            };
        }
        return out;
    }

    /** ‼️ NO FALLBACK. A session with no record alerts on nothing — that is the
     *  whole point of the change, and a "helpful" default here would put the
     *  agent-wide leak straight back. */
    actionsFor(sessionId: string): TurnAlertAction[] {
        return [...(this.map.get(String(sessionId ?? '').trim())?.actions ?? [])];
    }

    /** ‼️ A-23 — WHAT `resolveVoice`'s TOP STEP READS. Same shape of answer as
     *  `actionsFor`: a session with no opinion returns an empty object, and the
     *  chain falls through it rather than going quiet. */
    voicesFor(sessionId: string): Partial<Record<AlertEvent, string>> {
        return { ...(this.map.get(String(sessionId ?? '').trim())?.voices ?? {}) };
    }

    /** ‼️ A-22 — WHAT THE GATE READS. A session nobody has muted is not muted;
     *  there is no fallback behind this and there must never be one, or "the
     *  fleet is quiet" would start meaning "this session is quiet" too. */
    mutedFor(sessionId: string): boolean {
        return this.map.get(String(sessionId ?? '').trim())?.muted === true;
    }

    /**
     * Silence ONE session, or let it speak again.
     *
     * ‼️ MUTING TOUCHES NOTHING ELSE. The four boxes and the chosen tones stay
     * exactly as they were, so unmuting restores the setup rather than the
     * default — the alternative (clearing the actions) reads identically on the
     * day it is done and is unrecoverable the day after.
     */
    /**
     * ‼️ THE FIELDS EVERY SETTER MUST CARRY, IN ONE PLACE.
     *
     * Each setter answers ONE question and must leave the other answers
     * exactly as they were — muting is not unpicking a tone, picking a
     * tone is not unmuting, clearing the four boxes is neither. That was
     * three separate spread expressions repeated in three setters, which
     * is a rule that holds only until somebody adds a fourth field and
     * updates two of them. Now there is one list, and adding to it reaches
     * every setter at once.
     */
    private keep(
        prev: SessionAlertPrefs | undefined,
        over: Partial<SessionAlertPrefs> = {}
    ): Partial<SessionAlertPrefs> {
        const voices = over.voices ?? prev?.voices;
        const muted = over.muted ?? prev?.muted;
        const speechVoice = over.speechVoice ?? prev?.speechVoice;
        const readAloud = over.readAloud ?? prev?.readAloud;
        return {
            ...(voices && Object.keys(voices).length ? { voices } : {}),
            ...(muted ? { muted: true } : {}),
            ...(speechVoice ? { speechVoice } : {}),
            ...(readAloud ? { readAloud: true } : {})
        };
    }

    /** Is there anything left worth a record? Absence, not a record that
     *  says "nothing" — and it has to ask about EVERY sticky field. */
    private bare(prev: SessionAlertPrefs | undefined, keep: Partial<SessionAlertPrefs>): boolean {
        return !Object.keys(keep).length && !prev?.speechVoice;
    }

    setMuted(sessionId: string, muted: boolean): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        const want = muted === true;
        const prev = this.map.get(id);
        const t = this.now();
        if (prev?.muted === want || (!prev && !want)) {
            // Already there. Reported as done rather than as an error: two
            // clicks on the same box must not raise anything.
            return {
                ok: true,
                prefs: prev
                    ? { ...prev, actions: [...prev.actions], ...(prev.voices ? { voices: { ...prev.voices } } : {}) }
                    : { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t }
            };
        }
        const actions = prev ? [...prev.actions] : [];
        const keep = this.keep(prev, { muted: want });
        if (!want && !actions.length && !Object.keys(this.keep(prev, { muted: false })).length) {
            // Unmuting a session that had nothing else to say leaves nothing to
            // record — absence, not a record that says "not muted".
            this.map.delete(id);
            this.persist();
            return { ok: true, prefs: { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t } };
        }
        const prefs: SessionAlertPrefs = {
            sessionId: id,
            actions,
            ...keep,
            updatedAt: t,
            lastSeenAt: prev?.lastSeenAt ?? t
        };
        this.map.set(id, prefs);
        this.persist();
        return {
            ok: true,
            prefs: { ...prefs, actions: [...prefs.actions], ...(prefs.voices ? { voices: { ...prefs.voices } } : {}) }
        };
    }

    /**
     * Pick (or clear) the tone ONE session plays for ONE event — the right-click
     * "Sound for this session…" and the `session` scope of `alerts.voice.set`.
     *
     * ‼️ AN EMPTY `voice` CLEARS THE STEP, IT DOES NOT MUTE IT. There is no such
     * thing as "this session is silent" in the chain: clearing hands the answer
     * back to the agent, the settings and the built-in default, exactly as a
     * session that never chose. Muting is a `sound` action nobody armed, which
     * is the ♪ box beside it and a different question.
     */
    setVoice(sessionId: string, event: unknown, voice: unknown): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        if (typeof event !== 'string' || !(ALERT_EVENTS as readonly string[]).includes(event)) {
            return {
                ok: false,
                error: `unknown event ${JSON.stringify(event)} — one of ${ALERT_EVENTS.join('|')}`
            };
        }
        const want = typeof voice === 'string' ? voice.trim() : '';
        const prev = this.map.get(id);
        const draft = { ...(prev?.voices ?? {}) };
        if (want) { draft[event as AlertEvent] = want; } else { delete draft[event as AlertEvent]; }
        // Canonical order, like `normalizeActions` — two identical selections
        // are then the same object however they were arrived at, which is what
        // makes "did this actually change?" answerable at all.
        const voices = normalizeVoices(draft);
        const t = this.now();
        const actions = prev ? [...prev.actions] : [];
        const keep = this.keep(prev, { voices });
        if (!actions.length && this.bare(prev, keep)) {
            // Nothing left to say about this session — the same "absence, not a
            // record saying nothing" rule `replace` follows.
            if (prev) { this.map.delete(id); this.persist(); }
            return { ok: true, prefs: { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t } };
        }
        const prefs: SessionAlertPrefs = {
            sessionId: id,
            actions,
            // ‼️ A-22 — PICKING A TONE IS NOT UNMUTING, and it is not
            // changing the announcing voice either. Each surface owns its
            // own question and none may quietly undo an answer given in
            // another; `keep` is where that list lives.
            ...keep,
            updatedAt: t,
            lastSeenAt: prev?.lastSeenAt ?? t
        };
        this.map.set(id, prefs);
        this.persist();
        return {
            ok: true,
            prefs: { ...prefs, actions: [...prefs.actions], ...(prefs.voices ? { voices: { ...prefs.voices } } : {}) }
        };
    }

    /**
     * Pick (or clear) the VOICE that says this one conversation's
     * announcements — the `session` step above the fleet setting.
     *
     * ‼️ THE NAME IS NOT CHECKED HERE, on purpose and for the same reason
     * the tone id is not: whether this machine still has a voice called
     * `Microsoft Tolga` is a question for the moment of SPEAKING, and a
     * second opinion stored here would go stale the day a language pack is
     * removed. A name nothing answers is reported by the speaker, by name,
     * and the fleet setting is used instead — never silence.
     */
    setSpeechVoice(sessionId: string, voice: unknown): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        const want = typeof voice === 'string' ? voice.trim().slice(0, 200) : '';
        const prev = this.map.get(id);
        const t = this.now();
        const actions = prev ? [...prev.actions] : [];
        const keep = this.keep(prev, { speechVoice: want || undefined });
        // Clearing hands the answer back to the fleet setting, exactly as a
        // session that never chose — there is no "this one is silent" here.
        if (!want) { delete keep.speechVoice; }
        if (!actions.length && !Object.keys(keep).length) {
            if (prev) { this.map.delete(id); this.persist(); }
            return { ok: true, prefs: { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t } };
        }
        const prefs: SessionAlertPrefs = {
            sessionId: id,
            actions,
            ...keep,
            updatedAt: t,
            lastSeenAt: prev?.lastSeenAt ?? t
        };
        this.map.set(id, prefs);
        this.persist();
        return {
            ok: true,
            prefs: { ...prefs, actions: [...prefs.actions], ...(prefs.voices ? { voices: { ...prefs.voices } } : {}) }
        };
    }

    /** What this session chose to be announced in, if anything. */
    speechVoiceFor(sessionId: string): string {
        return this.map.get(String(sessionId ?? '').trim())?.speechVoice ?? '';
    }

    /** ‼️ A-26 — WHAT THE TURN-ENDED EDGE ASKS. Same shape of answer as
     *  `mutedFor`: no record means no reading, and there is no fallback behind
     *  it, because a fleet-wide default here would read eight conversations at
     *  once the first time somebody upgraded. */
    readAloudFor(sessionId: string): boolean {
        return this.map.get(String(sessionId ?? '').trim())?.readAloud === true;
    }

    /**
     * Read THIS conversation's answers out loud, or stop.
     *
     * ‼️ LIKE MUTE, IT TOUCHES NOTHING ELSE — the four boxes, the tones and the
     * chosen voice stay exactly as they were, so turning reading off and on
     * again restores the setup rather than the default. Turning it ON does not
     * pick a voice either: that is `setSpeechVoice`, a different question, and
     * a session with no voice is read by the fleet's.
     */
    setReadAloud(sessionId: string, on: boolean): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        const want = on === true;
        const prev = this.map.get(id);
        const t = this.now();
        if (prev?.readAloud === want || (!prev && !want)) {
            // Already there — two clicks on the same box must not raise
            // anything, exactly as `setMuted` answers.
            return {
                ok: true,
                prefs: prev
                    ? { ...prev, actions: [...prev.actions], ...(prev.voices ? { voices: { ...prev.voices } } : {}) }
                    : { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t }
            };
        }
        const actions = prev ? [...prev.actions] : [];
        const keep = this.keep(prev, { readAloud: want });
        if (!want && !actions.length && !Object.keys(this.keep(prev, { readAloud: false })).length) {
            // Turning reading off on a session that had nothing else to say
            // leaves nothing to record — absence, not a record saying "silent".
            this.map.delete(id);
            this.persist();
            return { ok: true, prefs: { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t } };
        }
        const prefs: SessionAlertPrefs = {
            sessionId: id,
            actions,
            ...keep,
            updatedAt: t,
            lastSeenAt: prev?.lastSeenAt ?? t
        };
        this.map.set(id, prefs);
        this.persist();
        return {
            ok: true,
            prefs: { ...prefs, actions: [...prefs.actions], ...(prefs.voices ? { voices: { ...prefs.voices } } : {}) }
        };
    }

    /** Toggle ONE action on ONE session — the message the gutter sends. */
    set(sessionId: string, action: unknown, enabled: boolean): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        if (!isTurnAlertAction(action)) {
            return {
                ok: false,
                error: `unknown action ${JSON.stringify(action)} — one of ${TURN_ALERT_ACTIONS.join('|')}`
            };
        }
        const cur = new Set(this.actionsFor(id));
        if (enabled) { cur.add(action); } else { cur.delete(action); }
        return this.replace(id, [...cur]);
    }

    /** Set the whole selection at once (the bridge's `actions` argument). */
    replace(sessionId: string, actions: unknown): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        if (actions !== undefined && !Array.isArray(actions)) {
            return { ok: false, error: 'actions must be an array' };
        }
        if (Array.isArray(actions)) {
            const bad = actions.filter(a => !isTurnAlertAction(a));
            if (bad.length) {
                return {
                    ok: false,
                    error: `unknown action(s) ${JSON.stringify(bad)} — one of ${TURN_ALERT_ACTIONS.join('|')}`
                };
            }
        }
        const next = normalizeActions(actions);
        const t = this.now();
        const prev = this.map.get(id);
        const keep = this.keep(prev);
        if (!next.length && this.bare(prev, keep)) {
            // An empty selection carries no information now that there is
            // nothing to be silent ABOUT — so it is the absence of a record,
            // not a record saying "muted". A session that IS muted says the
            // opposite, and its record stays (A-22).
            this.map.delete(id);
            this.persist();
            return { ok: true, prefs: { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t } };
        }
        const prefs: SessionAlertPrefs = {
            sessionId: id,
            actions: next,
            // ‼️ A-23 — CLEARING THE FOUR BOXES IS NOT UNPICKING THE TONE. They
            // answer different questions ("alert me about this one" vs "in this
            // voice"), and dropping the tone here would silently undo a choice
            // the user made in another surface entirely.
            ...keep,
            updatedAt: t,
            lastSeenAt: prev?.lastSeenAt ?? t
        };
        this.map.set(id, prefs);
        this.persist();
        return {
            ok: true,
            prefs: { ...prefs, actions: [...prefs.actions], ...(prefs.voices ? { voices: { ...prefs.voices } } : {}) }
        };
    }

    /**
     * "These sessions are on the live list right now." Cheap enough to call on
     * every refresh, and it is the only thing that keeps a preference alive.
     */
    seen(sessionIds: Iterable<string>): void {
        const t = this.now();
        let touched = false;
        for (const raw of sessionIds) {
            const p = this.map.get(String(raw ?? '').trim());
            if (p) { p.lastSeenAt = t; touched = true; }
        }
        if (touched) { this.persist(true); }
    }

    /**
     * ‼️ THE SAME CONVERSATION UNDER ITS REAL NAME (see LiveMonitor.adopt).
     *
     * A terminal lane starts life as `cli:codex:developer:<ms>` and is re-keyed
     * the moment the transcript reveals the engine's own id. The preference has
     * to travel in that same step or the user's selection belongs to an id that
     * no longer exists. A target that already has its own record is a CONFLICT
     * and is left alone: merging two people's choices on a guess is worse than
     * saying so.
     */
    rekey(from: string, to: string): AlertRekeyResult {
        const a = String(from ?? '').trim();
        const b = String(to ?? '').trim();
        if (!a || !b) { return { ok: false, reason: 'invalid' }; }
        if (a === b) { return { ok: false, reason: 'same' }; }
        const p = this.map.get(a);
        if (!p) { return { ok: false, reason: 'absent' }; }
        if (this.map.has(b)) { return { ok: false, reason: 'conflict' }; }
        this.map.delete(a);
        this.map.set(b, { ...p, sessionId: b, lastSeenAt: this.now() });
        this.persist();
        return { ok: true };
    }

    /** Explicit Clear on the Timeline — the row is gone, so is its preference. */
    forget(sessionId: string): boolean {
        const id = String(sessionId ?? '').trim();
        if (!this.map.has(id)) { return false; }
        this.map.delete(id);
        this.persist();
        return true;
    }

    /**
     * ‼️ THE ONE-TIME COPY FROM THE AGENT-KEYED MAP.
     *
     * Versioned and idempotent: the marker is written whatever the outcome, and
     * the legacy map is never read again at runtime — not as a fallback, not
     * "just in case". Every session of that agent which is live at the moment
     * of the upgrade starts from the agent's old selection, and from the next
     * click onwards the three rows are independent, which is the whole request.
     *
     * A session that already has a record of its own is not overwritten.
     */
    migrateFromAgentDefaults(
        legacy: Record<string, unknown> | undefined,
        liveSessions: { sessionId: string; agentName?: string }[]
    ): { migrated: boolean; copied: number } {
        if ((this.deps.readMigration() ?? 0) >= TURN_ALERT_MIGRATION) {
            return { migrated: false, copied: 0 };
        }
        let copied = 0;
        const t = this.now();
        for (const s of liveSessions ?? []) {
            const id = String(s?.sessionId ?? '').trim();
            if (!id || this.map.has(id)) { continue; }
            // The legacy map was keyed by the agent name, with the raw 8-char
            // session prefix standing in when no agent could be resolved —
            // exactly as the old page wrote it.
            const key = s.agentName || id.slice(0, 8);
            const actions = normalizeActions((legacy ?? {})[key]);
            if (!actions.length) { continue; }
            this.map.set(id, { sessionId: id, actions, updatedAt: t, lastSeenAt: t });
            copied++;
        }
        this.persist();
        void this.deps.writeMigration(TURN_ALERT_MIGRATION);
        return { migrated: true, copied };
    }

    /** Everything queued has hit storage. */
    flush(): Promise<void> {
        return this.queue;
    }

    /** TTL + newest-seen ceiling, applied on the way to storage. */
    private prune(): void {
        const t = this.now();
        for (const [id, p] of [...this.map]) {
            if (t - p.lastSeenAt > TURN_ALERT_TTL_MS) { this.map.delete(id); }
        }
        if (this.map.size <= TURN_ALERT_MAX) { return; }
        const byAge = [...this.map.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        for (const p of byAge.slice(TURN_ALERT_MAX)) { this.map.delete(p.sessionId); }
    }

    private persist(touchOnly = false): void {
        this.prune();
        const snapshot = this.all();
        this.queue = this.queue.then(() => this.deps.write(snapshot)).then(
            () => undefined,
            () => undefined   // a storage failure must not wedge the next write
        );
        if (!touchOnly) { this.deps.changed?.(); }
    }
}

/**
 * ‼️ ONE TURN = ONE ALERT, AND A NEW TURN IS A NEW ALERT.
 *
 * The turn key is `sessionId` + whatever the caller can prove is monotonic for
 * that session (the prompt counter). Both events that announce the end of a
 * turn — the "waiting" `Notification` and the `Stop` right behind it — carry
 * the same key, so the second one is silent. A genuinely new turn one second
 * later has a new key and rings, which the old 3-second cooldown ate.
 */
export class TurnKeyDedupe {
    private seen = new Map<string, { key: string; at: number }>();

    constructor(private max = 500, private now: () => number = () => Date.now()) { }

    /** True when this is a turn we have not announced for this session. */
    shouldFire(sessionId: string, turnKey: string): boolean {
        const id = String(sessionId ?? '').trim();
        if (!id) { return false; }
        const key = String(turnKey ?? '');
        const prev = this.seen.get(id);
        if (prev && prev.key === key) { return false; }
        this.seen.set(id, { key, at: this.now() });
        if (this.seen.size > this.max) {
            const oldest = [...this.seen.entries()].sort((a, b) => a[1].at - b[1].at);
            for (const [k] of oldest.slice(0, this.seen.size - this.max)) { this.seen.delete(k); }
        }
        return true;
    }

    /** Travels with the preference when a lane learns its real id. */
    rekey(from: string, to: string): void {
        const p = this.seen.get(from);
        if (!p) { return; }
        this.seen.delete(from);
        if (!this.seen.has(to)) { this.seen.set(to, p); }
    }

    forget(sessionId: string): void {
        this.seen.delete(sessionId);
    }
}

// ---------------------------------------------------------------- the sound

export interface SoundResult {
    /** Which player ran — `none` when there was nothing to try. */
    backend: string;
    ok: boolean;
    startedAt: number;
    durationMs: number;
    exitCode: number | null;
    stderr: string;
    error?: string;
    timedOut?: boolean;
    /** The file that was handed to the player. */
    asset?: string;
    /**
     * ‼️ A-22 — WHY NOTHING WAS PLAYED, WHEN NOTHING WENT WRONG.
     *
     * A muted farm, a quiet hour and a queue that dropped a stale alert are all
     * "no sound", and none of them is a FAILURE — reported as one they raise
     * the broken-player warning and teach the user to ignore it. Set, this
     * turns the branch into `skipped` carrying this sentence, which is the
     * answer to the only question anybody asks the alert page ("why did I hear
     * nothing?").
     */
    skipped?: string;
    /** ‼️ A-22 — HOW LONG THE QUEUE HELD IT, and how many sounds went first. A
     *  measurement, not decoration: "the chime came four seconds late" is
     *  otherwise indistinguishable from a slow player, and the two have
     *  opposite fixes. */
    queuedMs?: number;
    ahead?: number;
    /**
     * ‼️ A-20 — THE PLAYER ITSELF IS NOT ON THIS MACHINE.
     *
     * `ffplay` is a candidate on every platform and installed on almost
     * none of them, which makes `spawn ffplay ENOENT` the commonest failure
     * in the chain and the least informative one: it is not why the alert
     * was silent, it is why there was nothing left to try. Marked, it can
     * be ranked below a player that really refused the file — and a row can
     * say `install ffmpeg` instead of showing a spawn message.
     */
    missing?: boolean;
    /**
     * ‼️ A-20 — WHAT WAS SAID, when this result is an announcement rather
     * than a tone. The Timeline row for a spoken alert is otherwise a
     * backend name and a duration, and "it said the wrong agent's name" is
     * then a report nobody can check against anything.
     */
    spoke?: string;
}

/**
 * ‼️ A-20 — WHAT IT TAKES TO RUN A PLAYER, WITH NOTHING ABOUT SOUND FILES.
 *
 * A spoken announcement is a process with arguments, an environment and an
 * exit code, exactly like a tone — and NOT a file with a format. Splitting
 * the shape here is what lets both go through one runner, so the timeout,
 * the shell-free contract, the `ENOENT`-is-not-a-diagnosis rule and the
 * named exit codes are written once and cannot drift apart.
 */
export interface PlayerCandidate {
    backend: string;
    file: string;
    args: string[];
    /** Passed to the child as env rather than pasted into a command string. */
    env?: Record<string, string>;
    /**
     * ‼️ WHAT A NON-ZERO EXIT FROM *THIS* PLAYER MEANS, in the user's terms.
     *
     * `exit 3` from the MediaPlayer script is not a crash, it is the codec
     * saying it cannot open the file; `exit 4` from the speech synthesiser
     * is a template that rendered empty. Both are a different fix from a
     * missing player, and indistinguishable from one unless the backend
     * that chose the number also says what it chose it for.
     */
    codes?: Record<number, string>;
}

export interface SoundCandidate extends PlayerCandidate {
    /**
     * ‼️ A-18 — WHAT THIS BACKEND CAN ACTUALLY OPEN, declared beside it.
     *
     * The user may point an alert at a file of their own, and the trap is a
     * page that accepts an `.mp3` over a player that only knows `.wav`: the
     * row says playable, the alert is silence, and nothing anywhere reports an
     * error. `alertVoices.playableOn` answers that question from THIS list, so
     * the promise and the player can never disagree — change one and the other
     * follows.
     */
    formats: readonly string[];
    /**
     * ‼️ A-20 — THE EXTENSIONS THIS BACKEND SHOULD BE TRIED FIRST FOR.
     *
     * Which players CAN open a file is `formats`; which one should go first
     * is not derivable from it. On Windows a `.wav` is measurably faster
     * through `SoundPlayer` — it lives in `System.dll`, already loaded —
     * than through `MediaPlayer`, which pulls in PresentationCore: 0.6 s of
     * overhead against 1.2 s, measured on this machine. For every other
     * format the order is the reverse, because SoundPlayer cannot open it.
     */
    lead?: readonly string[];
}

/**
 * ‼️ A-20 — WHAT EACH PLAYER CAN ACTUALLY OPEN, CHECKED RATHER THAN HOPED.
 *
 * The temptation is to declare every fashionable format on the built-in player
 * and let the user find out. On Windows 10, Media Foundation registers byte
 * stream handlers for `.flac`, `.mp3`, `.m4a` and `.wma` and — read out of
 * the registry, not assumed — **none for `.ogg`**: the Web Media Extensions
 * that carry Vorbis are a Store package present on some installs and not
 * others. So `.ogg` is NOT promised on MediaPlayer. It is offered through
 * `ffplay`, whose name the settings row shows, so a user who wants Vorbis is
 * told what to install instead of hearing nothing and being told it worked.
 */
const MEDIAFOUNDATION = ['wav', 'mp3', 'm4a', 'wma', 'flac'] as const;
/** ffmpeg's player opens everything the built-in ones might miss. */
const FFPLAY = ['wav', 'mp3', 'm4a', 'ogg', 'oga', 'opus', 'flac', 'aac', 'aiff', 'aif', 'wma'] as const;
/** CoreAudio, which has read FLAC since macOS 10.13 and has never read Vorbis. */
const AFPLAY = ['wav', 'mp3', 'm4a', 'aiff', 'aif', 'aac', 'caf', 'flac'] as const;
/** libsndfile's set: lossless and Vorbis, no MPEG. */
const SNDFILE = ['wav', 'ogg', 'oga', 'flac', 'aiff', 'aif'] as const;

const FFPLAY_ARGS = (asset: string): string[] =>
    ['-nodisp', '-autoexit', '-loglevel', 'quiet', asset];

/**
 * ‼️ THE WINDOWS PLAYER HAS TO KNOW WHEN THE SOUND ENDED — AND ITS EVENTS DO
 * NOT FIRE IN A CONSOLE.
 *
 * `MediaPlayer` is a WPF `DispatcherObject`: `MediaEnded` and `MediaFailed`
 * are raised on a Dispatcher that `powershell -Command` never runs. Measured
 * on the script this replaces, MediaEnded NEVER ARRIVED — the process sat in
 * its poll loop for 17.7 s, was killed by this module's timeout, was reported
 * as a broken backend, and every Windows alert was really played by the
 * SoundPlayer fallback, eight seconds after the turn it was announcing. Worse
 * in the other direction: a file the codec REFUSED left through the same loop
 * with exit 0 and was reported as played.
 *
 * So the length is ASKED FOR rather than waited on. `NaturalDuration` is
 * filled in by the media engine itself and needs no dispatcher, which makes it
 * two answers in one: how long to sleep, and — when it never arrives — the
 * codec saying it cannot open this file, which leaves as `exit 3`. Measured
 * end to end: 2.3 s for a 1.1 s sound, and a refused file reported as refused.
 *
 * ‼️ NO QUOTE ENTERS THIS SCRIPT. The reason is not tidiness: the string
 * travels through `execFile` argument escaping before PowerShell parses it,
 * and a quoted diagnostic is exactly the kind of thing that survives testing
 * on one Node version and breaks on another. The exit CODE carries the
 * meaning; the sentence lives in `codes` below, in TypeScript, where a test
 * can read it.
 *
 * The play wait is capped at 10 s. An alert is not a track: a four-minute file
 * chosen by mistake is cut off deliberately here, rather than killed by the
 * outer timeout and reported as a broken player.
 */
const MEDIAPLAYER_SCRIPT =
    'Add-Type -AssemblyName PresentationCore;'
    + '$p = New-Object System.Windows.Media.MediaPlayer;'
    + '$p.Open([Uri]$env:AF_TURN_SOUND);'
    + '$t = 0;'
    + 'while (-not $p.NaturalDuration.HasTimeSpan -and $t -lt 100) { Start-Sleep -m 20; $t++ };'
    + 'if (-not $p.NaturalDuration.HasTimeSpan) { exit 3 };'
    + '$ms = [int]$p.NaturalDuration.TimeSpan.TotalMilliseconds;'
    + 'if ($ms -gt 10000) { $ms = 10000 };'
    // U-212 — the tone level, per mille (toneVolume.ts); unset leaves MediaPlayer's own 0.5
    + 'if ($env:AF_TURN_VOLUME) { $p.Volume = [int]$env:AF_TURN_VOLUME / 1000 };'
    + '$p.Play();'
    + 'Start-Sleep -m ($ms + 120);'
    + '$p.Close()';

/**
 * ‼️ NO SHELL, NO INTERPOLATION, ANYWHERE.
 *
 * The path never enters a command string: on Windows it reaches PowerShell as
 * an environment variable, everywhere else as an `execFile` argument. A folder
 * with a quote, a space or a `;` in its name is therefore not a code-injection
 * question at all, which a `cp.exec` string can never claim.
 *
 * What comes back is the order to TRY for this asset (see `lead`) — and it is
 * always the WHOLE table, never filtered. `alertVoices.playableOn` reads it to
 * answer "can anything here open that file?", and a pre-filtered list would
 * make an unplayable file look like a platform with no players at all.
 */
export function soundCandidates(platform: string, asset: string): SoundCandidate[] {
    const all = rawCandidates(platform, asset);
    const ext = extensionOf(asset);
    if (!ext) { return all; }
    const lead = all.filter(c => (c.lead ?? []).indexOf(ext) >= 0);
    return lead.length ? lead.concat(all.filter(c => lead.indexOf(c) < 0)) : all;
}

function rawCandidates(platform: string, asset: string): SoundCandidate[] {
    if (platform === 'win32') {
        return [
            {
                backend: 'powershell:MediaPlayer',
                file: 'powershell',
                args: [
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-Command', MEDIAPLAYER_SCRIPT
                ],
                env: { AF_TURN_SOUND: asset },
                formats: MEDIAFOUNDATION,
                codes: { 3: 'no installed codec could open this file' }
            },
            {
                // Leads on `.wav` — half the startup cost, and `.wav` is what
                // every built-in voice is. It stays behind MediaPlayer for
                // everything else for the reason it always did: a stripped or
                // server Windows without WPF still gets the alert it has today.
                backend: 'powershell:SoundPlayer',
                file: 'powershell',
                args: [
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-Command', '(New-Object System.Media.SoundPlayer $env:AF_TURN_SOUND).PlaySync()'
                ],
                env: { AF_TURN_SOUND: asset },
                formats: ['wav'],
                lead: ['wav']
            },
            {
                // Not on a stock Windows, and that is the point: it is the only
                // honest route to Vorbis, and `ENOENT` costs one failed spawn
                // rather than a promise the machine cannot keep.
                backend: 'ffplay', file: 'ffplay', args: FFPLAY_ARGS(asset), formats: FFPLAY
            }
        ];
    }
    if (platform === 'darwin') {
        return [
            { backend: 'afplay', file: 'afplay', args: [asset], formats: AFPLAY },
            { backend: 'ffplay', file: 'ffplay', args: FFPLAY_ARGS(asset), formats: FFPLAY }
        ];
    }
    return [
        { backend: 'paplay', file: 'paplay', args: [asset], formats: SNDFILE },
        // PipeWire's own player, for a desktop that has replaced PulseAudio and
        // ships no `paplay` shim.
        { backend: 'pw-play', file: 'pw-play', args: [asset], formats: SNDFILE },
        { backend: 'ffplay', file: 'ffplay', args: FFPLAY_ARGS(asset), formats: FFPLAY },
        { backend: 'aplay', file: 'aplay', args: ['-q', asset], formats: ['wav'] }
    ];
}

export interface PlaySoundDeps {
    platform?: string;
    exists?: (p: string) => boolean;
    /** node's `child_process.execFile`, injectable so a test never makes noise. */
    execFile?: (
        file: string,
        args: string[],
        opts: { timeout: number; windowsHide: boolean; env?: NodeJS.ProcessEnv },
        cb: (err: (Error & { code?: number | string; killed?: boolean }) | null,
             stdout: string, stderr: string) => void
    ) => unknown;
    now?: () => number;
    timeoutMs?: number;
    /** U-212 — the tone level, 0–100 (`agentFarm.alerts.toneVolume`); unset = 100 = as it always played */
    volume?: number;
}

/**
 * Play the alert once and SAY WHAT HAPPENED.
 *
 * Candidates are tried in order and the first one that exits 0 wins; a player
 * that is not installed (`ENOENT`) is not a failure of the alert, it is the
 * reason to try the next one. What comes back is the last attempt's whole
 * story — backend, exit code, stderr, whether it was killed on the timeout —
 * because the only bug this file was written for was one that reported nothing.
 */
export async function playTurnSound(asset: string, deps: PlaySoundDeps = {}): Promise<SoundResult> {
    const platform = deps.platform ?? process.platform;
    const now = deps.now ?? (() => Date.now());
    const timeout = deps.timeoutMs ?? 15000;
    const startedAt = now();
    const exists = deps.exists ?? ((p: string) => {
        try { return require('fs').existsSync(p); } catch { return false; }
    });
    const base = (backend: string): SoundResult => ({
        backend, ok: false, startedAt, durationMs: now() - startedAt,
        exitCode: null, stderr: '', asset
    });
    if (!asset || !exists(asset)) {
        return { ...base('none'), error: `alert sound asset is missing: ${asset || '(unset)'}` };
    }
    // node's own overloaded signature is wider than what this file uses; the
    // cast is to the shape the runner is written against, not away from a check.
    const execFile = (deps.execFile
        ?? (require('child_process') as typeof import('child_process')).execFile
    ) as NonNullable<PlaySoundDeps['execFile']>;
    const candidates = withToneVolume(soundCandidates(platform, asset), deps.volume, asset);
    if (!candidates.length) {
        return { ...base('none'), error: `no sound backend known for platform ${platform}` };
    }
    /**
     * ‼️ A-20 — A PLAYER THAT CANNOT OPEN THIS FORMAT IS NOT A FALLBACK.
     *
     * Walking the whole table regardless of format spawns a process that is
     * certain to fail and then, because the LAST attempt is what comes back,
     * overwrites the real story with its own: an `.mp3` used to end carrying
     * SoundPlayer's "wav only" complaint, while what MediaPlayer actually
     * said had already been thrown away. The extension picks the candidates,
     * out of the same `formats` table the settings page promises from — so
     * the reason a file will not play is stated once, here, before anything
     * is spawned.
     */
    const ext = extensionOf(asset);
    const usable = ext ? candidates.filter(c => c.formats.indexOf(ext) >= 0) : candidates;
    if (!usable.length) {
        const known = Array.from(new Set(candidates.flatMap(c => c.formats as string[]))).sort();
        return {
            ...base('none'),
            error: `no sound backend on ${platform} can play .${ext}`
                + ` — this platform plays: ${known.join(', ')}`
        };
    }
    return runPlayers(usable, { execFile, timeout, now, startedAt, base });
}

/**
 * ‼️ A-20 — ONE RUNNER FOR EVERY PLAYER, TONE OR SENTENCE.
 *
 * The timeout, the hidden window, the environment handover, `ENOENT` being
 * a reason to try the next one rather than a diagnosis, the named exit
 * codes and the rule about which failure to REPORT are one behaviour, and
 * a second copy of it for speech would have drifted from this one inside a
 * release. What varies between a tone and an announcement is the candidate
 * table and nothing else.
 */
function runPlayers(
    usable: PlayerCandidate[],
    ctx: {
        execFile: NonNullable<PlaySoundDeps['execFile']>;
        timeout: number;
        now: () => number;
        startedAt: number;
        base: (backend: string) => SoundResult;
        /** ‼️ A-26 — THE HANDLE, FOR THE ONE CALLER THAT HAS TO KILL IT. A tone
         *  is over before anybody could want it stopped; a READING is a minute
         *  long, so the process it is running in has to be reachable. Nothing
         *  else about a player changes, which is why this is a hook here rather
         *  than a second copy of the candidate loop (see the note above). */
        onSpawn?: (child: unknown) => void;
    }
): Promise<SoundResult> {
    const { execFile, timeout, now, startedAt, base } = ctx;
    return (async () => {
        let last: SoundResult = base('none');
        const tried: SoundResult[] = [];
        for (const c of usable) {
            last = await new Promise<SoundResult>(resolve => {
                let settled = false;
                const done = (r: SoundResult): void => {
                    if (settled) { return; }
                    settled = true;
                    resolve(r);
                };
                try {
                    const child = execFile(
                        c.file, c.args,
                        {
                            timeout, windowsHide: true,
                            env: c.env ? { ...process.env, ...c.env } : undefined
                        },
                        (err, _stdout, stderr) => {
                            const r = base(c.backend);
                            r.durationMs = now() - startedAt;
                            r.stderr = String(stderr ?? '').trim().slice(0, 500);
                            if (!err) {
                                r.ok = true;
                                r.exitCode = 0;
                                return done(r);
                            }
                            r.exitCode = typeof err.code === 'number' ? err.code : null;
                            // ‼️ A-20 — A CODE THIS BACKEND NAMED BEATS THE SPAWN MESSAGE.
                            // `Command failed: powershell -NoProfile …` is true and
                            // useless; `no installed codec could open this file` is the
                            // sentence that tells the user to convert the file.
                            const named = r.exitCode !== null ? c.codes?.[r.exitCode] : undefined;
                            r.error = named ?? String(err.message ?? err).slice(0, 500);
                            // node reports a timeout kill as `killed`, with no code.
                            if (err.killed) { r.timedOut = true; r.error = `timed out after ${timeout} ms`; }
                            if (err.code === 'ENOENT') { r.missing = true; }
                            done(r);
                        }
                    );
                    ctx.onSpawn?.(child);
                } catch (e) {
                    const r = base(c.backend);
                    r.durationMs = now() - startedAt;
                    r.error = String((e as Error)?.message ?? e).slice(0, 500);
                    done(r);
                }
            });
            tried.push(last);
            if (last.ok) { return last; }
        }
        /**
         * ‼️ A-20 — WHEN THEY ALL FAILED, REPORT THE ONE THAT EXPLAINS IT.
         *
         * The chain ENDS on the least likely player — `ffplay`, which most
         * machines do not have — so "the last attempt is the answer" would
         * reply to every silent alert with `spawn ffplay ENOENT` and bury the
         * sentence produced two backends earlier: no installed codec could open
         * this file. The earliest player that actually RAN and refused is the
         * diagnosis; an absent one is not a diagnosis at all. If every player
         * was absent, the last will do — they all say the same thing.
         */
        return tried.find(r => !r.missing) ?? last;
    })();
}


/**
 * ‼️ A-20 — SAY IT OUT LOUD, THROUGH THE SAME RUNNER AS EVERY TONE.
 *
 * A tone says what KIND of news this is; with eight lanes running, the question
 * from the next room is WHICH ONE, and no palette can carry a name. This is the
 * only part of the fleet that can answer it, it costs nothing — `System.Speech`
 * has been in Windows for twenty years, `say` and `spd-say` are already there —
 * and it needs no network, no account and no model.
 *
 * Two contracts it is held to, both of them the sound path's:
 *
 * - **The text never enters a command string.** It is written by the user, in a
 *   settings box, and an agent's NAME is substituted into it. On Windows it
 *   travels as an environment variable; elsewhere as an argument of its own.
 * - **It blocks until it has finished speaking.** The alert queue measures its
 *   500 ms gap from the END of a player's process, so a backend that returned
 *   as soon as it started talking would let the next agent's chime land in the
 *   middle of this one's sentence.
 *
 * An empty text is not an error and not a failure — it is a template that
 * rendered to nothing, which is `skipped` with the reason, exactly like a muted
 * farm. Reporting it as a broken synthesiser would teach the user to ignore the
 * one warning that matters.
 */
export async function speakAnnouncement(
    text: string, cfg: SpeakConfig, deps: PlaySoundDeps = {}
): Promise<SoundResult> {
    const platform = deps.platform ?? process.platform;
    const now = deps.now ?? (() => Date.now());
    const timeout = deps.timeoutMs ?? 20000;
    const startedAt = now();
    const said = String(text ?? '').trim();
    const base = (backend: string): SoundResult => ({
        backend, ok: false, startedAt, durationMs: now() - startedAt,
        exitCode: null, stderr: '', spoke: said
    });
    if (!said) {
        return { ...base('none'), skipped: 'nothing to say — the template rendered empty' };
    }
    const execFile = (deps.execFile
        ?? (require('child_process') as typeof import('child_process')).execFile
    ) as NonNullable<PlaySoundDeps['execFile']>;
    const usable = speakCandidates(platform, said, cfg);
    if (!usable.length) {
        return { ...base('none'), error: `no speech backend known for platform ${platform}` };
    }
    return runPlayers(usable, { execFile, timeout, now, startedAt, base });
}

/**
 * ‼️ A-26 — A READING IS A MINUTE LONG, SO IT NEEDS ITS OWN CLOCK.
 *
 * `speakAnnouncement`'s 20 seconds is right for a sentence and wrong for a
 * turn: the ceiling `sanitizeForSpeech` cuts at is about ninety seconds of
 * speech at a normal rate, and a timeout that killed it at twenty would
 * truncate every long answer in a way nothing on screen could explain.
 */
export const DIALOGUE_TIMEOUT_MS = 5 * 60_000;

/**
 * ‼️ A-26 — READING THE TURN ITSELF, IN ITS OWN CHANNEL, INTERRUPTIBLY.
 *
 * Three decisions, and each is the reason the class exists rather than a
 * function:
 *
 * 1. **IT DOES NOT GO THROUGH THE ALERT ARBITER (A-22).** The arbiter's whole
 *    contract is that the gap between alerts is measured from the END of a
 *    sound; a ninety-second reading submitted to it would hold every chime in
 *    the farm behind it, and the alert that mattered would arrive after the
 *    reading of the turn before it. Reading is a SECOND CHANNEL: it can overlap
 *    a chime, exactly as a person talking over a doorbell does.
 * 2. **THE NEWEST TURN WINS.** A reading is about what is on the screen NOW.
 *    When the next turn lands, the one being read is already history, so it is
 *    killed rather than queued — a queue here would put the farm minutes behind
 *    the conversation and there is no version of that anybody wants.
 * 3. **THE PROCESS IS HELD, NOT THE PID.** A pid can be recycled between the
 *    moment it is read and the moment it is killed; the handle cannot. That is
 *    also why `stop()` answers whether there WAS anything to stop — a caller
 *    that wants to say "nothing was being read" must not have to guess.
 */
export class DialogueSpeaker {
    private child: { kill?: (signal?: string) => boolean } | null = null;
    /** Which reading is the current one. A reply from a killed process must not
     *  be able to clear the handle of the reading that replaced it. */
    private epoch = 0;

    /** Is something being read aloud right now? */
    get speaking(): boolean { return this.child !== null; }

    /**
     * Read one turn aloud, cutting short whatever was being read.
     *
     * The text is expected to have been through `sanitizeForSpeech` already —
     * it is not done here, because WHAT to read (a whole turn, a selection, one
     * paragraph) is the caller's question and the ceiling belongs with it.
     */
    async speak(text: string, cfg: SpeakConfig, deps: PlaySoundDeps = {}): Promise<SoundResult> {
        this.stop();
        const mine = ++this.epoch;
        const platform = deps.platform ?? process.platform;
        const now = deps.now ?? (() => Date.now());
        const startedAt = now();
        const said = String(text ?? '').trim();
        const base = (backend: string): SoundResult => ({
            backend, ok: false, startedAt, durationMs: now() - startedAt,
            exitCode: null, stderr: '', spoke: said
        });
        if (!said) {
            return { ...base('none'), skipped: 'nothing to read — the turn had no speakable text' };
        }
        const usable = speakCandidates(platform, said, cfg);
        if (!usable.length) {
            return { ...base('none'), error: `no speech backend known for platform ${platform}` };
        }
        const execFile = (deps.execFile
            ?? (require('child_process') as typeof import('child_process')).execFile
        ) as NonNullable<PlaySoundDeps['execFile']>;
        const r = await runPlayers(usable, {
            execFile,
            timeout: deps.timeoutMs ?? DIALOGUE_TIMEOUT_MS,
            now, startedAt, base,
            onSpawn: c => {
                // A late spawn from a reading that has already been replaced is
                // killed on the spot rather than left running unreachable.
                if (mine !== this.epoch) { killChild(c); return; }
                this.child = c as { kill?: (signal?: string) => boolean };
            }
        });
        if (mine === this.epoch) { this.child = null; }
        // ‼️ INTERRUPTED IS NOT FAILED. A killed player exits non-zero and the
        // runner reports that honestly; saying so here is what keeps "I stopped
        // it" out of the error log the user reads when nothing was heard.
        return mine === this.epoch ? r : { ...r, ok: false, skipped: 'a newer turn replaced this reading' };
    }

    /** Stop whatever is being read. Answers whether there was anything. */
    stop(): boolean {
        const c = this.child;
        this.child = null;
        this.epoch++;
        if (!c) { return false; }
        killChild(c);
        return true;
    }
}

/** Kill one player, whatever shape the injected spawner handed back. A test's
 *  stand-in is not a ChildProcess and must not be asked to be one. */
function killChild(c: unknown): void {
    const k = (c as { kill?: (signal?: string) => boolean } | null)?.kill;
    if (typeof k === 'function') {
        try { k.call(c); } catch { /* already gone is the outcome we wanted */ }
    }
}

/**
 * What this machine can actually say it with — asked of the machine, never
 * guessed. The commonest way for the announcement to disappoint is a Turkish
 * sentence read by `Microsoft David`, and the fix is a free language pack the
 * user has to be TOLD about; a settings box cannot know, so it asks.
 */
export async function installedSpeechVoices(
    deps: PlaySoundDeps = {}
): Promise<{ ok: boolean; voices: InstalledVoice[]; error?: string }> {
    const platform = deps.platform ?? process.platform;
    const c = voiceListCandidate(platform);
    if (!c) {
        return {
            ok: false, voices: [],
            error: `listing installed voices is Windows-only; on ${platform} the`
                + ` system voice is used unless a name is set by hand`
        };
    }
    const execFile = (deps.execFile
        ?? (require('child_process') as typeof import('child_process')).execFile
    ) as NonNullable<PlaySoundDeps['execFile']>;
    return new Promise(resolve => {
        try {
            execFile(c.file, c.args, { timeout: deps.timeoutMs ?? 15000, windowsHide: true },
                (err, stdout) => resolve(err
                    ? { ok: false, voices: [], error: String(err.message ?? err).slice(0, 300) }
                    : { ok: true, voices: parseVoiceList(String(stdout ?? '')) }));
        } catch (e) {
            resolve({ ok: false, voices: [], error: String((e as Error)?.message ?? e) });
        }
    });
}

// ------------------------------------------------------------- the dispatch

export interface TurnAlertBranch {
    action: TurnAlertAction;
    status: 'ok' | 'failed' | 'skipped';
    ms: number;
    detail?: string;
    sound?: SoundResult;
}

export interface TurnAlertRunners {
    sound: () => Promise<SoundResult>;
    focus: () => void | Promise<void>;
    modal: () => void | Promise<void>;
    toast: () => void | Promise<void>;
}

/**
 * ‼️ FOUR INDEPENDENT BRANCHES. One throwing must not cancel the next — the
 * whole reported symptom was "the sound is dead", and the answer to that is
 * that focus, modal and toast still ran, plus a result that names which branch
 * failed and why. Selected actions are attempted; the rest are reported as
 * `skipped` rather than omitted, so the test surface shows all four.
 */
export async function runTurnAlerts(
    actions: TurnAlertAction[],
    runners: TurnAlertRunners,
    now: () => number = () => Date.now()
): Promise<TurnAlertBranch[]> {
    const want = new Set(normalizeActions(actions));
    const one = async (action: TurnAlertAction): Promise<TurnAlertBranch> => {
        const t0 = now();
        if (!want.has(action)) { return { action, status: 'skipped', ms: 0 }; }
        try {
            if (action === 'sound') {
                const sound = await runners.sound();
                // ‼️ A-22 — A GATE IS NOT A FAILURE. Muted, inside quiet hours
                // or dropped by the queue: the branch says `skipped` and names
                // who did it, so the broken-player warning stays reserved for a
                // player that is actually broken.
                if (sound.skipped) {
                    return { action, sound, ms: now() - t0, status: 'skipped', detail: sound.skipped };
                }
                return {
                    action, sound, ms: now() - t0,
                    status: sound.ok ? 'ok' : 'failed',
                    detail: (sound.ok
                        // ‼️ Exactly as much as an exit code proves, and no more.
                        ? `${sound.backend} accepted the file (exit 0) — audible playback still needs a human ear`
                        : (sound.error || `${sound.backend} exited ${sound.exitCode}`))
                        + (sound.queuedMs
                            ? ` · waited ${sound.queuedMs} ms behind ${sound.ahead ?? 0} other sound(s)`
                            : '')
                };
            }
            await runners[action]();
            return { action, status: 'ok', ms: now() - t0 };
        } catch (e) {
            return {
                action, status: 'failed', ms: now() - t0,
                detail: String((e as Error)?.message ?? e).slice(0, 300)
            };
        }
    };
    const settled = await Promise.all(TURN_ALERT_ACTIONS.map(one));
    return settled;
}

// -------------------------------------------------- what an edge actually runs

/**
 * ‼️ A-18 — THE TWO EVENTS A SESSION'S OWN SELECTION ANSWERS TO.
 *
 * The four controls in a swim lane say "YOUR TURN" from end to end, and the
 * item that opened them widened that to the other half of the same news: the
 * session that stopped to ASK you something. Those two, and no more — arming
 * `ended` off a control whose whole text is about turns would make a closed
 * session start beeping at somebody who never asked for it.
 *
 * The other three ride the same mechanism through `agentFarm.alerts.on`, which
 * is a deliberate choice made in Settings rather than a side effect of a
 * checkbox in a timeline row.
 */
export const SESSION_ALERT_EVENTS: readonly AlertEvent[] = ['turn-ready', 'question'];

export interface AlertPlan {
    actions: TurnAlertAction[];
    /** Which authority put something in the plan — the page has to be able to
     *  answer "why did this ring?" and "why did it not?" (MIRROR). */
    fromSession: boolean;
    fromSettings: boolean;
}

/**
 * ‼️ TWO AUTHORITIES, AND THEY ADD RATHER THAN OVERRIDE.
 *
 * A session's own selection is "alert me about THIS conversation, in these
 * ways". `agentFarm.alerts.on` is "play the sound for this KIND of event, on
 * every session" — the global switch, every entry off out of the box, so a
 * fleet that has never been configured behaves today exactly as it did
 * yesterday.
 *
 * A gate would have been the wrong shape: with `on` defaulting to all-false and
 * gating, the turn-ready sound that installs have had for months would go
 * silent on upgrade, and nothing on the page would say why. A union cannot do
 * that — the worst an empty setting can do is nothing.
 */
export function alertPlan(
    event: AlertEvent,
    sessionActions: readonly unknown[] | undefined,
    on?: Partial<Record<AlertEvent, boolean>>
): AlertPlan {
    const fromSession = SESSION_ALERT_EVENTS.includes(event);
    const picked = fromSession ? normalizeActions(sessionActions) : [];
    const fromSettings = on?.[event] === true;
    // ‼️ The global switch arms the SOUND and nothing else. It is the setting a
    // user reaches for having read the words "alert sounds"; turning it on must
    // not start opening modal dialogs across the whole fleet.
    const actions = fromSettings ? normalizeActions(picked.concat('sound')) : picked;
    return { actions, fromSession: fromSession && picked.length > 0, fromSettings };
}

/**
 * A once-per-interval gate for the failure toast: a sound backend that is
 * broken is broken on every turn, and four agents finishing together must not
 * produce four identical complaints.
 */
export class RateLimit {
    /** Never fired yet — not "fired at epoch zero", which would eat the first. */
    private last: number | undefined;
    constructor(private everyMs = 10 * 60_000, private now: () => number = () => Date.now()) { }
    allow(): boolean {
        const t = this.now();
        if (this.last !== undefined && t - this.last < this.everyMs) { return false; }
        this.last = t;
        return true;
    }
}
