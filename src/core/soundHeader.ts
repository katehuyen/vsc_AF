/**
 * U-179 — THE 🔊 IN EVERY PAGE HEADER: what it shows and what its hover says.
 *
 * One icon carries the state, so a glance answers "will I hear anything?":
 * 🔇 everything muted · 🌙 inside quiet hours · 🔊 something rings · 🔈 nothing
 * is switched on yet. The hover is MIRROR: the state first, then what rings,
 * who is silent and when the quiet window is. Pure, so the header, its test and
 * the host all read the same answer.
 */

export type SoundState = 'on' | 'muted' | 'quiet' | 'off';

export interface SoundHeaderInput {
    muted: boolean;
    /** quiet hours are configured and we are inside them right now */
    quietInside: boolean;
    quietConfigured: boolean;
    /** the gate's own sentence about the window, e.g. "Quiet hours 23:00–08:00 — starts in 7h" */
    quietLine: string;
    /** fleet-wide events that ring (`agentFarm.alerts.on`) */
    armed: string[];
    /** labels of the live sessions muted on their own */
    silentSessions: string[];
}

export interface SoundHeader {
    state: SoundState;
    icon: string;
    head: string;
    lines: string[];
}

/** The events' names as every Sound surface shows them. */
export const SOUND_EVENT_LABEL: Record<string, string> = {
    question: 'Asking you',
    'turn-ready': 'Turn finished',
    stalled: 'Stalled',
    ended: 'Session ended',
    error: 'Error',
    'notice-question': 'Question card',
    gate: 'Workflow asks you',
    notice: 'New notice',
    quota: 'Quota running out',
    mission: 'Mission ended'
};

const ICON: Record<SoundState, string> = { on: '🔊', muted: '🔇', quiet: '🌙', off: '🔈' };
const WORD: Record<SoundState, string> = { on: 'on', muted: 'everything muted', quiet: 'quiet hours now', off: 'nothing rings yet' };

export function soundHeader(i: SoundHeaderInput): SoundHeader {
    const state: SoundState = i.muted ? 'muted' : i.quietInside ? 'quiet' : i.armed.length ? 'on' : 'off';
    const order = Object.keys(SOUND_EVENT_LABEL);
    const rings = [...i.armed].sort((a, b) => order.indexOf(a) - order.indexOf(b))
        .map(e => SOUND_EVENT_LABEL[e] ?? e);
    const lines = [
        `Rings: ${rings.length ? rings.join(' · ') : 'nothing yet'}`,
        ...(i.silentSessions.length ? [`Silent sessions: ${i.silentSessions.join(', ')}`] : []),
        ...(i.quietConfigured && i.quietLine ? [i.quietLine] : [])
    ];
    return { state, icon: ICON[state], head: `Sound — ${WORD[state]}`, lines };
}
