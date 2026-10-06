/**
 * U-179 — THE 🔊 IN EVERY PAGE HEADER: what it shows and what its hover says.
 *
 * One icon carries the state, so a glance answers "will I hear anything?":
 * 🔇 everything muted · 🌙 inside quiet hours · 🔊 something rings · 🔈 nothing
 * is switched on yet. The hover is MIRROR: the state first, then what rings,
 * who is silent and when the quiet window is. Pure, so the header, its test and
 * the host all read the same answer.
 *
 * U-206 — while something is read aloud the icon is the reading (🗣️, ⏸️ paused)
 * and a click opens the reading's player instead of the Sound page.
 */
import type { ReadingBadge } from './readingBadge';

export type SoundState = 'on' | 'muted' | 'quiet' | 'off' | 'reading' | 'paused';

/** What the header's player draws: whose words, where, paused or not, at which speed. */
export interface SoundReading {
    head: string;
    paragraph: string;
    paused: boolean;
    rate: number | null;
}

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
    /** the reading now (readingBadge), null while nothing is read */
    reading?: ReadingBadge | null;
}

export interface SoundHeader {
    state: SoundState;
    icon: string;
    head: string;
    lines: string[];
    reading?: SoundReading;
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

const ICON: Record<SoundState, string> = { on: '🔊', muted: '🔇', quiet: '🌙', off: '🔈', reading: '🗣️', paused: '⏸️' };
const WORD: Record<SoundState, string> = {
    on: 'on', muted: 'everything muted', quiet: 'quiet hours now', off: 'nothing rings yet', reading: 'reading', paused: 'paused'
};

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
    const r = i.reading;
    if (!r) { return { state, icon: ICON[state], head: `Sound — ${WORD[state]}`, lines }; }
    const now: SoundState = r.paused ? 'paused' : 'reading';
    return {
        state: now, icon: ICON[now], head: `Sound — ${WORD[now]}: ${r.label}`,
        lines: [...r.lines, '', ...lines],
        reading: { head: r.lines[0] ?? '', paragraph: r.paragraph, paused: r.paused, rate: r.rate }
    };
}
