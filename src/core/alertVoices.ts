/**
 * A-18 — WHICH SOUND PLAYS, AND WHY.
 *
 * The farm could make exactly one noise: `turn-ready.wav`, on the one edge
 * where a turn finished. That is the wrong shape for the thing the user asked
 * for, which is to be able to leave the room. Away from the screen, "your turn"
 * and "it is asking you something" are the two facts that matter most, and they
 * were the same beep — so the only way to tell them apart was to walk back and
 * look, which is the whole thing the sound was for.
 *
 * ‼️ TWO DIMENSIONS, NEVER ONE. An **event** is what happened; a **voice** is
 * which tone. A voice has no event and an event has no tone of its own — keep
 * them in one field and "a different sound for this session" and "a different
 * sound for questions" collapse into each other, with whichever was written
 * last silently winning.
 *
 * Pure: no vscode, no fs, no child_process. Every store the chain reads and
 * every question about the disk is injected, so a test can ask it the awkward
 * questions (a voice whose file was deleted, a session that names a voice
 * nobody has) without touching a machine.
 */

/** What happened. The first two are what A-18 was opened for; the other three
 *  ride the same mechanism for free and ship switched off. */
export const LANE_EVENTS = ['turn-ready', 'question', 'stalled', 'ended', 'error'] as const;
/** U-213 — what happens across the farm, tied to no session: a new Notice, a question card, a workflow
 *  asking you, an account's five-hour window crossing the phone's warning line, a mission ending. */
export const FLEET_EVENTS = ['notice', 'notice-question', 'gate', 'quota', 'mission'] as const;
export const ALERT_EVENTS = [...LANE_EVENTS, ...FLEET_EVENTS] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];
export type LaneEvent = (typeof LANE_EVENTS)[number];
/** U-213 — the fleet events a person is waiting on ring out of the box; every other entry ships off. */
export const ALERT_ON_DEFAULT: Partial<Record<AlertEvent, boolean>> = { 'notice-question': true, gate: true };
/** U-213 — the phone's name for the same news (src/core/remoteEvents.ts), one dictionary for both ends. */
export const ALERT_REMOTE: Partial<Record<AlertEvent, string>> = {
    'turn-ready': 'turn.finished', question: 'ask.opened', ended: 'session.ended',
    notice: 'notice.posted', 'notice-question': 'notice.posted', quota: 'quota.warn'
};

/**
 * ‼️ A-23 — WHAT AN EVENT IS CALLED WHERE THERE IS NO ROOM TO EXPLAIN IT.
 *
 * `turn-ready` is the id and it is not a name a person picks from in a menu.
 * The Settings card spells these out at length beside a paragraph each; a
 * right-click list and a Timeline tooltip have one line, so the SHORT form
 * lives here — one spelling, used by every surface that is too narrow for the
 * paragraph (SHORTHAND: the short form on the control, the long one in the
 * panel behind it).
 */
export const EVENT_LABEL: Record<AlertEvent, string> = {
    'turn-ready': 'Turn finished',
    question: 'Asking you',
    stalled: 'Stalled',
    ended: 'Session ended',
    error: 'Error',
    notice: 'New notice',
    'notice-question': 'Question card',
    gate: 'Workflow asks you',
    quota: 'Quota running out',
    mission: 'Mission ended'
};

export interface AlertVoice {
    id: string;
    /** What it sounds like, in the user's terms — this is what a picker shows. */
    label: string;
    /** Absolute path, once resolved against wherever the sounds live. */
    file: string;
    builtin: boolean;
    /**
     * ‼️ A-20 — WHICH FAMILY A BUILT-IN VOICE BELONGS TO.
     *
     * There are two, and a flat list of twenty would hide that: the `modern`
     * ten are built from the physics of different objects (glass, wood, a
     * knuckle on a panel, a sweep) and are the defaults; the `classic` ten are
     * one mechanism heard ten ways and are kept because somebody may have
     * chosen one. A picker that does not group them makes the reader read all
     * twenty labels to find out there were two sets.
     */
    family?: 'modern' | 'classic';
}

/**
 * ‼️ NINETEEN VOICES IN TWO FAMILIES, AND THE ORDER IS THE ANSWER TO "WHICH
 * ONE SHOULD I PICK?"
 *
 * **The modern ten (A-20) come first and are the defaults.** They are not ten
 * more chimes: each is built from the physics of a different object — struck
 * glass, a marimba bar, a knuckle on a panel, a falling sweep — because the
 * condition the user set for this whole feature was telling "your turn" from
 * "it is asking you" from another room WITHOUT configuring anything, and ten
 * envelopes on one sine wave cannot do that. Measured with
 * `tools/make_alert_sounds.js --stats`, the two defaults sit a factor of 4.7
 * apart in brightness.
 *
 * Four of them name events the fleet does not emit yet (`sleep`, `advance`,
 * `start`, and a distinct `success`). They are selectable anyway — a palette
 * is chosen from, not consumed — and the events they are waiting for are their
 * own backlog item rather than something invented here.
 *
 * **The classic ten (A-18) stay, and none of them is regenerated.** They are
 * one mechanism heard ten ways, and they are here because somebody may have
 * CHOSEN one: a set that disappears in an upgrade takes a setting with it.
 * `chime-soft` in particular keeps pointing at `turn-ready.wav` rather than a
 * file of its own name — those are the bytes every install already makes, and
 * replacing them, even with something nicer, would change the alert of a user
 * who never asked.
 */
const BUILTIN: { id: string; label: string; asset: string; family: 'modern' | 'classic' }[] = [
    // ‼️ A LABEL NAMES THE SOUND, NEVER AN EVENT. The ids carry the event they
    // were designed for (`_turn`, `_sleep`), and the first labels repeated it —
    // "Crystal — your turn", which then reads as a lie the moment somebody
    // picks it for `error`, and which the picker cut off anyway. A voice
    // belongs to no event: any of these can be chosen for any of them.
    { id: 'af_crystal_turn', label: 'Crystal', asset: 'af_crystal_turn.wav', family: 'modern' },
    { id: 'af_intercom_knock', label: 'Intercom knock', asset: 'af_intercom_knock.wav', family: 'modern' },
    { id: 'af_zen_chime', label: 'Zen bowl', asset: 'af_zen_chime.wav', family: 'modern' },
    { id: 'af_deep_sonar', label: 'Deep sonar', asset: 'af_deep_sonar.wav', family: 'modern' },
    { id: 'af_lullaby_sleep', label: 'Lullaby', asset: 'af_lullaby_sleep.wav', family: 'modern' },
    { id: 'af_marimba_success', label: 'Marimba', asset: 'af_marimba_success.wav', family: 'modern' },
    { id: 'af_pop_advance', label: 'Pop', asset: 'af_pop_advance.wav', family: 'modern' },
    { id: 'af_subtle_alert', label: 'Thin ticks', asset: 'af_subtle_alert.wav', family: 'modern' },
    { id: 'af_bell_urgent', label: 'Bell, urgent', asset: 'af_bell_urgent.wav', family: 'modern' },
    { id: 'af_pulse_start', label: 'Pulse', asset: 'af_pulse_start.wav', family: 'modern' },
    { id: 'chime-soft', label: 'Chime, soft', asset: 'turn-ready.wav', family: 'classic' },
    { id: 'chime-bright', label: 'Chime, bright', asset: 'chime-bright.wav', family: 'classic' },
    { id: 'ask-double', label: 'Ask — two knocks', asset: 'ask-double.wav', family: 'classic' },
    { id: 'ask-rise', label: 'Ask — rising', asset: 'ask-rise.wav', family: 'classic' },
    { id: 'low-pulse', label: 'Low pulse', asset: 'low-pulse.wav', family: 'classic' },
    { id: 'tick-dry', label: 'Tick, dry', asset: 'tick-dry.wav', family: 'classic' },
    { id: 'bell-far', label: 'Bell, distant', asset: 'bell-far.wav', family: 'classic' },
    { id: 'close-fall', label: 'Close — falling', asset: 'close-fall.wav', family: 'classic' },
    { id: 'error-buzz', label: 'Error buzz', asset: 'error-buzz.wav', family: 'classic' },
    { id: 'alarm-urgent', label: 'Alarm, urgent', asset: 'alarm-urgent.wav', family: 'classic' }
];

/** Every built-in id, for the rules that must refuse to overwrite one. */
export const BUILTIN_IDS: readonly string[] = BUILTIN.map(v => v.id);

/**
 * ‼️ THE DEFAULTS FOR "TURN OVER" AND "ASKING YOU" ARE DIFFERENT SOUNDS, and
 * that is a requirement rather than a taste: the user's own condition for this
 * item was hearing the difference from another room without configuring
 * anything. One is a knuckle on a panel, the other is struck glass — and
 * measured with `--stats`, they sit a factor of 4.7 apart in brightness.
 *
 * ‼️ A-20 CHANGED ALL FIVE, and that is a thing to say out loud rather than
 * ship quietly. The user asked for modern sounds INSTEAD OF the primitive
 * ones, and a default nobody hears is not a delivery. What is safe about it:
 * alerts ship OFF, so anybody hearing anything has already been to the
 * settings page; and a voice a user CHOSE lives in `settings`, which sits
 * above this in the chain and is not touched. Only "sound on, never picked a
 * voice" changes — which is exactly the case the request was about.
 */
export const DEFAULT_VOICE: Record<AlertEvent, string> = {
    'turn-ready': 'af_crystal_turn',
    question: 'af_intercom_knock',
    stalled: 'af_deep_sonar',
    ended: 'af_marimba_success',
    error: 'af_bell_urgent',
    notice: 'af_zen_chime',
    'notice-question': 'af_pulse_start',
    gate: 'af_pop_advance',
    quota: 'af_subtle_alert',
    mission: 'af_lullaby_sleep'
};

/** `join` without `path`, so this module stays free of node built-ins. */
function under(dir: string, name: string): string {
    const d = String(dir || '').replace(/[\\/]+$/, '');
    return d ? `${d}/${name}` : name;
}

/** The twenty, resolved against wherever `media/sounds` is on this install. */
export function builtinVoices(soundsDir: string): AlertVoice[] {
    return BUILTIN.map(v => ({
        id: v.id, label: v.label, file: under(soundsDir, v.asset),
        builtin: true, family: v.family
    }));
}

/**
 * ‼️ WHICH FORMATS PLAY IS A PROPERTY OF THE BACKEND, NOT A LIST KEPT HERE.
 *
 * The trap this avoids is a page that offers an `.mp3` and a player that only
 * knows `.wav`: the file is accepted, the row says "playable", and the alert is
 * silence with no error anywhere. So the answer comes from the SAME table the
 * player is built from (`turnAlerts.soundCandidates`), which declares what each
 * backend can open — change the player and this follows.
 */
export interface FormatDeps {
    /** `[{ backend, formats }]` for this platform, from `soundCandidates`. */
    backends: { backend: string; formats: readonly string[] }[];
}

export function extensionOf(file: string): string {
    const m = /\.([a-z0-9]+)$/i.exec(String(file || '').trim());
    return m ? m[1].toLowerCase() : '';
}

/** Can anything on this platform open that file? Names the backend that can. */
export function playableOn(deps: FormatDeps, file: string): { ok: boolean; backend: string } {
    const ext = extensionOf(file);
    if (!ext) { return { ok: false, backend: '' }; }
    const hit = deps.backends.find(b => b.formats.indexOf(ext) >= 0);
    return hit ? { ok: true, backend: hit.backend } : { ok: false, backend: '' };
}

// ---------------------------------------------------------------------------
// the user's own sounds
// ---------------------------------------------------------------------------

export interface CustomVoice {
    id: string;
    label: string;
    file: string;
    addedAt: number;
}

/** The item's own number: ten built in, ten of your own. */
export const CUSTOM_LIMIT = 10;

/** `u-` + a slug, so a user's voice can never collide with a built-in id —
 *  today's or one added in a later version. */
export function customId(label: string, taken: readonly string[]): string {
    const slug = String(label || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'sound';
    let id = `u-${slug}`;
    for (let n = 2; taken.indexOf(id) >= 0; n++) { id = `u-${slug}-${n}`; }
    return id;
}

/**
 * ‼️ A-24 — "THIS RUN MAKES NO SOUND", as a value a tone field can hold.
 *
 * It is a reserved WORD rather than a tone because there is no such tone and
 * there must not be one: the chain never resolves to silence (`setVoice` with
 * an empty id CLEARS the step, it does not mute it), so quiet is a different
 * mechanism — the session mute (A-22) — and the word has to be tellable apart
 * from a tone id at every door it passes through. Safe to reserve, and that is
 * a property of this file: every built-in id is spelled out above and every one
 * of the user's own is `u-…` by construction (`customId`), so nothing can ever
 * be called this by accident.
 */
export const FINISH_SOUND_SILENT = 'silent';

/**
 * The canonical form of a finish-sound pick: a tone id, `silent`, or nothing.
 *
 * ‼️ THE ID IS NOT CHECKED AGAINST THE LIST HERE, and deliberately so — the
 * list includes the user's own sounds, which live in their configuration, while
 * this function is called from the pure modules a form and the bridge share.
 * The SHAPE is checked, so a value that could never be an id is refused where
 * it is typed; whether `tick-dry` still has a playable file is asked at the
 * moment it is APPLIED, by the code that owns the list, and reported by name —
 * the same division `resolveVoice` already makes.
 */
export function normalizeFinishSound(v: unknown): string {
    const s = typeof v === 'string' ? v.trim() : '';
    return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(s) ? s : '';
}

export interface AddVoiceDeps extends FormatDeps {
    exists(file: string): boolean;
}

/**
 * Add one of the user's own sounds. Every refusal is a sentence, because each
 * one is a thing the user did on purpose and can fix.
 *
 * ‼️ THE FILE IS NOT COPIED. "Wherever they like" was the ask; a copy would
 * mean the sound they edit tomorrow is not the sound that plays.
 */
export function addCustomVoice(
    list: readonly CustomVoice[], input: { label: string; file: string },
    deps: AddVoiceDeps, now = Date.now()
): { ok: true; voice: CustomVoice; list: CustomVoice[] } | { ok: false; error: string } {
    const label = String(input.label || '').trim();
    const file = String(input.file || '').trim();
    if (!label) { return { ok: false, error: 'a sound needs a name — it is what the picker shows' }; }
    if (!file) { return { ok: false, error: 'a sound needs a file' }; }
    if (list.length >= CUSTOM_LIMIT) {
        return { ok: false, error: `there is room for ${CUSTOM_LIMIT} of your own sounds — remove one first` };
    }
    if (!deps.exists(file)) { return { ok: false, error: `there is no file at ${file}` }; }
    const play = playableOn(deps, file);
    if (!play.ok) {
        const known = [...new Set(deps.backends.flatMap(b => [...b.formats]))].sort();
        return {
            ok: false,
            error: `nothing on this machine plays .${extensionOf(file) || '(no extension)'}`
                + ` — it opens ${known.map(e => '.' + e).join(' · ')}`
        };
    }
    if (list.some(v => v.file === file)) {
        return { ok: false, error: 'that file is already in the list' };
    }
    const voice: CustomVoice = {
        id: customId(label, BUILTIN_IDS.concat(list.map(v => v.id))),
        label, file, addedAt: now
    };
    return { ok: true, voice, list: list.concat(voice) };
}

export function removeCustomVoice(
    list: readonly CustomVoice[], id: string
): { ok: true; list: CustomVoice[] } | { ok: false; error: string } {
    if (BUILTIN_IDS.indexOf(id) >= 0) {
        return { ok: false, error: `${id} is one of the built-in sounds — it cannot be removed` };
    }
    if (!list.some(v => v.id === id)) { return { ok: false, error: `there is no sound called ${id}` }; }
    return { ok: true, list: list.filter(v => v.id !== id) };
}

/**
 * Rename one of the user's own sounds.
 *
 * ‼️ THE ID DOES NOT MOVE. It was derived from the first label, but by now it
 * is written into `agentFarm.alerts.voices` and into any session that picked
 * it; regenerating it here would silently unpick the sound everywhere it was
 * chosen and fall the chain back to a default nobody asked for. The label is
 * what the picker shows and the label is all that changes.
 */
export function renameCustomVoice(
    list: readonly CustomVoice[], id: string, label: string
): { ok: true; voice: CustomVoice; list: CustomVoice[] } | { ok: false; error: string } {
    if (BUILTIN_IDS.indexOf(id) >= 0) {
        return { ok: false, error: `${id} is one of the built-in sounds — it cannot be renamed` };
    }
    const at = list.findIndex(v => v.id === id);
    if (at < 0) { return { ok: false, error: `there is no sound called ${id}` }; }
    const name = String(label || '').trim();
    if (!name) { return { ok: false, error: 'a sound needs a name — it is what the picker shows' }; }
    const voice: CustomVoice = { ...list[at], label: name };
    const out = list.slice();
    out[at] = voice;
    return { ok: true, voice, list: out };
}

// ---------------------------------------------------------------------------
// the resolution chain
// ---------------------------------------------------------------------------

export type VoiceOrigin = 'session' | 'agent' | 'settings' | 'default';

/** ‼️ WHICH STEP ANSWERED, IN WORDS. "Why did it play THAT?" is the question
 *  every surface has to be able to answer, and `origin: 'settings'` is an id,
 *  not an answer. Kept beside the chain so the phrasing cannot drift from the
 *  order the steps are actually tried in. */
export const ORIGIN_LABEL: Record<VoiceOrigin, string> = {
    session: 'this session\'s own choice',
    agent: 'this agent\'s choice',
    settings: 'your setting for everybody',
    default: 'the built-in default'
};

export interface ResolveDeps extends AddVoiceDeps {
    soundsDir: string;
    custom?: readonly CustomVoice[];
    /** "this conversation uses this sound" */
    session?(sessionId: string): Partial<Record<AlertEvent, string>> | undefined;
    /** …and the same question for a whole agent. */
    agent?(agentName: string): Partial<Record<AlertEvent, string>> | undefined;
    /** the user's own answer for everybody: `agentFarm.alerts.voices` */
    settings?(): Partial<Record<AlertEvent, string>> | undefined;
}

export interface ResolvedVoice {
    event: AlertEvent;
    voice: string;
    /** ‼️ WHICH STEP ANSWERED. "Why did it play THAT?" has to be answerable on
     *  the page (MIRROR), and a resolution that only returns the winner cannot
     *  answer it. */
    origin: VoiceOrigin;
    file: string;
    playable: boolean;
    /** The steps that had an answer and were passed over, with the reason —
     *  a silent skip is indistinguishable from a step nobody had set. */
    skipped: { origin: VoiceOrigin; voice: string; why: string }[];
}

/**
 * ‼️ ONE PLACE, ONE ANSWER.
 *
 * Session beats agent beats settings beats the built-in default, and every
 * caller goes through here — the moment two places work this out, "I set the
 * sound and it played the old one" becomes a bug nobody can locate.
 *
 * ‼️ A MISSING FILE FALLS THROUGH, IT DOES NOT SILENCE. A voice whose file the
 * user deleted or unplugged is the commonest way this feature breaks, and the
 * honest answer is the next step down — a wrong sound is heard and fixed, and
 * silence is indistinguishable from an alert that never fired.
 */
export function resolveVoice(
    event: AlertEvent, deps: ResolveDeps,
    ctx?: { sessionId?: string; agentName?: string }
): ResolvedVoice {
    const all = builtinVoices(deps.soundsDir)
        .concat((deps.custom ?? []).map(v => ({ ...v, builtin: false })));
    const skipped: ResolvedVoice['skipped'] = [];

    const steps: [VoiceOrigin, string | undefined][] = [
        ['session', ctx?.sessionId ? deps.session?.(ctx.sessionId)?.[event] : undefined],
        ['agent', ctx?.agentName ? deps.agent?.(ctx.agentName)?.[event] : undefined],
        ['settings', deps.settings?.()?.[event]],
        ['default', DEFAULT_VOICE[event]]
    ];

    for (const [origin, wanted] of steps) {
        const id = String(wanted || '').trim();
        if (!id) { continue; }
        const voice = all.find(v => v.id === id);
        if (!voice) {
            skipped.push({ origin, voice: id, why: 'there is no sound with that name any more' });
            continue;
        }
        if (!deps.exists(voice.file)) {
            skipped.push({ origin, voice: id, why: `the file is gone: ${voice.file}` });
            continue;
        }
        const play = playableOn(deps, voice.file);
        if (!play.ok) {
            skipped.push({ origin, voice: id, why: `nothing on this machine plays .${extensionOf(voice.file)}` });
            continue;
        }
        return { event, voice: id, origin, file: voice.file, playable: true, skipped };
    }

    // ‼️ EVEN THE DEFAULT CAN BE GONE — a broken install, a partial update. Say
    // so with the name of the thing that is missing rather than returning
    // something that looks fine and makes no noise.
    const fallback = all.find(v => v.id === DEFAULT_VOICE[event]);
    return {
        event, voice: DEFAULT_VOICE[event], origin: 'default',
        file: fallback ? fallback.file : '', playable: false, skipped
    };
}
