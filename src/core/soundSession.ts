/**
 * U-180 — ONE SESSION'S SOUND, AS ONE QUESTION WITH THREE ANSWERS.
 *
 * Under the hood a session has two switches that pull opposite ways: its own ♪
 * (`sound` in its actions — ring even when the fleet switch is off) and its
 * mute (ring never). The fleet switch ADDS to the ♪ and cannot subtract, which
 * is why the mute exists — a correct engine decision the user should not have
 * to compute. So every surface shows the pair as one box:
 *
 *   Like all — no ♪, not muted: whatever the fleet settings say
 *   Always   — ♪ armed: rings even when the fleet switch is off
 *   Silent   — muted: never a sound, whatever else is set
 *
 * ‼️ THE DATA MODEL DOES NOT CHANGE. Silent leaves the ♪ as it was (muting
 * clears nothing, so un-silencing restores the setup); Like all and Always
 * unmute and set the ♪.
 */

export type SessionSound = 'like-all' | 'always' | 'silent';
export const SESSION_SOUNDS: readonly SessionSound[] = ['like-all', 'always', 'silent'];
/** The three switches a session carries besides the ♪. */
export const SESSION_ALSO = ['focus', 'modal', 'toast'] as const;
export type SessionAlso = typeof SESSION_ALSO[number];

export function soundOf(actions: readonly string[], muted: boolean): SessionSound {
    return muted ? 'silent' : actions.includes('sound') ? 'always' : 'like-all';
}

/** What the two switches must be for `want`, given where they stand now. */
export function soundPlan(want: SessionSound, actions: readonly string[]): { muted: boolean; ring: boolean } {
    if (want === 'silent') { return { muted: true, ring: actions.includes('sound') }; }
    return { muted: false, ring: want === 'always' };
}

/** What one write may change — every field optional, each one question. */
export interface SessionSoundPatch {
    sound?: SessionSound;
    /** event → tone id for THIS session; '' clears it back to the chain below */
    voices?: Record<string, string>;
    /** the voice that says who; '' hands it back to the fleet's */
    speechVoice?: string;
    read?: boolean;
    focus?: boolean;
    modal?: boolean;
    toast?: boolean;
}

/**
 * ‼️ A PAGE (OR AN AGENT) HANDS OVER A FORM, NOT A RECORD. Only the fields
 * above survive, each in its own type; a value that is not one of them is
 * refused by name rather than dropped, because a write that silently did less
 * than asked is the failure this whole family keeps being opened for.
 */
export function parseSessionPatch(input: unknown, events: readonly string[]):
    { ok: true; patch: SessionSoundPatch } | { ok: false; error: string } {
    const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const patch: SessionSoundPatch = {};
    if (o.sound !== undefined) {
        if (!SESSION_SOUNDS.includes(o.sound as SessionSound)) {
            return { ok: false, error: `sound must be one of ${SESSION_SOUNDS.join('|')}` };
        }
        patch.sound = o.sound as SessionSound;
    }
    if (o.voices !== undefined) {
        if (!o.voices || typeof o.voices !== 'object' || Array.isArray(o.voices)) {
            return { ok: false, error: 'voices must be an object of event → tone id' };
        }
        const voices: Record<string, string> = {};
        for (const [event, id] of Object.entries(o.voices as Record<string, unknown>)) {
            if (!events.includes(event)) { return { ok: false, error: `unknown event "${event}" — one of ${events.join('|')}` }; }
            voices[event] = String(id ?? '').trim();
        }
        patch.voices = voices;
    }
    if (o.speechVoice !== undefined) { patch.speechVoice = String(o.speechVoice ?? '').trim(); }
    for (const k of ['read', ...SESSION_ALSO] as const) {
        if (o[k] === undefined) { continue; }
        if (typeof o[k] !== 'boolean') { return { ok: false, error: `${k} must be true or false` }; }
        patch[k] = o[k] as boolean;
    }
    return { ok: true, patch };
}
