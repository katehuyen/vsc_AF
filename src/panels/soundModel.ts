/**
 * U-178 — WHAT THE SOUND CONTROLS ARE DRAWN FROM. The host resolves every row
 * (`alertsPage` in extension.ts); the Sound page and `alerts.status` hand it
 * over as it is. Moved here from the Settings panel, which now draws one line.
 */
import type { AgentSoundRow } from '../core/soundAgents';

/** One event's row on the Alert sounds card: what is armed, what was chosen,
 *  and what would ACTUALLY play — the three are not the same thing. */
export interface AlertEventRow {
    event: string;
    on: boolean;
    /** what the user picked for everybody; '' when nobody has picked */
    chosen: string;
    /** the built-in answer behind that blank */
    fallback: string;
    voice: string;
    origin: string;
    file: string;
    playable: boolean;
    skipped: { origin: string; voice: string; why: string }[];
}

/** A-22 — who is holding the gate shut, drawn on the same card that says which
 *  tone would play. The two questions are asked together and answering only the
 *  second is how "I set it up and heard nothing" happens. */
export interface AlertsGate {
    muted: boolean;
    quiet: {
        configured: boolean; inside: boolean; from: string; to: string;
        nextChangeAt: number; inMinutes: number; error?: string; line: string;
    };
    silence: { silent: boolean; reason?: string; reasons: string[]; detail?: string };
    mutedSessions: { sessionId: string; label: string }[];
    /** U-123 — the second tap on the shoulder. `on` is the resolved answer
     *  (either number at zero switches it off), `armed` is how many questions
     *  are waiting for one right now — the figure that makes a policy visible. */
    nudge: {
        minutes: number; repeat: number; voice: string;
        on: boolean; armed: number;
        defaults: { minutes: number; repeat: number; voice: string };
    };
}

/**
 * A-25 — the announcement, resolved rather than printed. `voice` is a loose
 * fragment (`Tolga` finds `Microsoft Tolga - Turkish (Turkey)`), so the setting
 * alone does not say what will be heard; `resolved` is what it actually reaches
 * on this machine and empty means NOTHING does — which fails the announcement
 * rather than reading it out in the wrong language.
 */
export interface AlertsSpeak {
    on: boolean;
    events: string[];
    template: string;
    rate: number;
    volume: number;
    voice: string;
    defaults: { on: boolean; events: string[]; template: string; rate: number; volume: number; voice: string };
    max: number;
    preview: string;
    voices: { id: string; name: string; culture: string; engine: string; label: string }[];
    /** ‼️ false is "not asked yet", NOT "this machine has no voices". */
    voicesLoaded: boolean;
    voicesError: string;
    voicesNote: string;
    resolved: string;
    /** the matched voice's full name — what the picker's option is keyed on,
     *  because `Tolga` is a legal setting and no option is called that */
    resolvedName: string;
    sessions: { sessionId: string; label: string; voice: string }[];
    /** U-182 — the conversations whose answers are read aloud, and which one is being read now */
    readers: { sessionId: string; label: string; reading: boolean }[];
}

export interface AlertsPage {
    gate: AlertsGate;
    speak: AlertsSpeak;
    folder: string;
    limit: number;
    /** extensions any player on THIS machine can open */
    formats: string[];
    /** the events a Timeline row's own ♪ can arm without this page */
    sessionEvents: string[];
    voices: {
        id: string; label: string; file: string; builtin: boolean;
        exists: boolean; playable: boolean; backend: string | null;
    }[];
    events: AlertEventRow[];
}

/**
 * ‼️ U-178 — THE NOTIFICATION COLUMN IS THE NOTIFY SETTINGS, NOT A COPY. Three
 * events have a VS Code notification of their own; the Sound page shows it
 * beside the tone and the Settings rows keep theirs. One setting, two
 * surfaces, so the two cannot disagree. `ended` and `error` have none.
 *
 * ‼️ U-186 — Turn finished has TWO: every session's (notifyTurnEnd, off by
 * default) and a Console turn you are not watching (notifyConsoleTurnEnd, on by
 * default). A cell showing only the first read "off" while the second kept
 * notifying, so the row carries both, each under its own id.
 */
export const NOTIFY_KEYS: Record<string, string> = {
    'turn-ready': 'agentFarm.notifyTurnEnd',
    'console:turn-ready': 'agentFarm.notifyConsoleTurnEnd',
    question: 'agentFarm.notifyPermission',
    stalled: 'agentFarm.notifyStuck'
};

/** Each event's notification switch as it stands; `get` reads one setting. */
export function notifyState(get: (key: string) => boolean): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const [event, key] of Object.entries(NOTIFY_KEYS)) { out[event] = get(key) === true; }
    return out;
}

/** U-183 — one live session's sound, as the Sessions table draws it: the
 *  `alerts.session` profile plus its engine, whether it is read now, and
 *  whether each event would ring. */
export interface SessionSoundRow {
    sessionId: string;
    label: string;
    engine: string;
    sound: 'like-all' | 'always' | 'silent';
    tones: { event: string; chosen: string; voice: string; origin: string; rings: boolean }[];
    speechVoice: string;
    read: boolean;
    reading: boolean;
    also: { focus: boolean; modal: boolean; toast: boolean };
    /** U-184 — "why didn't I hear it?" per event (core/soundWhy.ts) */
    why: Record<string, { heard: boolean; lines: { ok: boolean | null; text: string }[] }>;
}

/** The Sound page's whole model — also what `alerts.status` answers. */
export interface SoundPage {
    alerts: AlertsPage | null;
    notify: Record<string, boolean>;
    sessions: SessionSoundRow[];
    /** U-187 — every agent's own tones (core/soundAgents.ts) */
    agents: AgentSoundRow[];
}
