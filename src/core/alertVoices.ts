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
export const ALERT_EVENTS = ['turn-ready', 'question', 'stalled', 'ended', 'error'] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

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
    error: 'Error'
};

export interface AlertVoice {
    id: string;
    /** What it sounds like, in the user's terms — this is what a picker shows. */
    label: string;
    /** Absolute path, once resolved against wherever the sounds live. */
    file: string;
    builtin: boolean;
}

/**
 * ‼️ THE TEN, AND `chime-soft` IS THE ONE THAT ALREADY SHIPPED.
 *
 * Its file is `turn-ready.wav`, not `chime-soft.wav`, because that is the sound
 * every current install already makes: renaming the asset would have changed
 * the alert of every user who never asked for it, and a "nicer" replacement
 * would have done it silently. The id is new; the bytes are the committed ones.
 */
const BUILTIN: { id: string; label: string; asset: string }[] = [
    { id: 'chime-soft', label: 'Chime, soft', asset: 'turn-ready.wav' },
    { id: 'chime-bright', label: 'Chime, bright', asset: 'chime-bright.wav' },
    { id: 'ask-double', label: 'Ask — two knocks', asset: 'ask-double.wav' },
    { id: 'ask-rise', label: 'Ask — rising', asset: 'ask-rise.wav' },
    { id: 'low-pulse', label: 'Low pulse', asset: 'low-pulse.wav' },
    { id: 'tick-dry', label: 'Tick, dry', asset: 'tick-dry.wav' },
    { id: 'bell-far', label: 'Bell, distant', asset: 'bell-far.wav' },
    { id: 'close-fall', label: 'Close — falling', asset: 'close-fall.wav' },
    { id: 'error-buzz', label: 'Error buzz', asset: 'error-buzz.wav' },
    { id: 'alarm-urgent', label: 'Alarm, urgent', asset: 'alarm-urgent.wav' }
];

/** Every built-in id, for the rules that must refuse to overwrite one. */
export const BUILTIN_IDS: readonly string[] = BUILTIN.map(v => v.id);

/**
 * ‼️ THE DEFAULTS FOR "TURN OVER" AND "ASKING YOU" ARE DIFFERENT SOUNDS, and
 * that is a requirement rather than a taste: the user's own condition for this
 * item was hearing the difference from another room without configuring
 * anything. One rises and knocks twice, the other is a single settled chime.
 */
export const DEFAULT_VOICE: Record<AlertEvent, string> = {
    'turn-ready': 'chime-soft',
    question: 'ask-double',
    stalled: 'low-pulse',
    ended: 'close-fall',
    error: 'error-buzz'
};

/** `join` without `path`, so this module stays free of node built-ins. */
function under(dir: string, name: string): string {
    const d = String(dir || '').replace(/[\\/]+$/, '');
    return d ? `${d}/${name}` : name;
}

/** The ten, resolved against wherever `media/sounds` is on this install. */
export function builtinVoices(soundsDir: string): AlertVoice[] {
    return BUILTIN.map(v => ({
        id: v.id, label: v.label, file: under(soundsDir, v.asset), builtin: true
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
