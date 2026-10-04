/**
 * U-184 — "WHY DIDN'T I HEAR IT?", ANSWERED IN THE ORDER THE ENGINE DECIDES.
 *
 * Before a tone is heard `fireAttention` asks three things: does this event
 * ring for this session at all (`alertPlan` — the fleet switch ADDS to the
 * session's own ♪, it cannot subtract), is the gate open (Mute all, the
 * session's Silent, quiet hours — `silence`), and which tone answers and can
 * this machine play it (`resolveAlertVoice`). One line per question, ✓ or ✗;
 * the verdict on top names the first ✗, because that is the one to fix.
 */

export type WhyReason = 'fleet' | 'session' | 'quiet-hours';

/** The events by the names every surface uses (the Sound vocabulary). */
export const WHY_EVENT_NAME: Record<string, string> = {
    'turn-ready': 'Turn finished', question: 'Asking you', stalled: 'Stalled', ended: 'Session ended', error: 'Error',
    notice: 'New notice', 'notice-question': 'Question card', gate: 'Workflow asks you',
    quota: 'Quota running out', mission: 'Mission ended'
};
/** The plan's other branches, by the same names. */
export const WHY_BRANCH_NAME: Record<string, string> = { focus: 'Focus', modal: 'Pop-up', toast: 'Notification' };

export interface WhyInput {
    eventName: string;
    /** a session's own ♪ can ring this event (turn-ready, question) */
    sessionEvent: boolean;
    /** the fleet switch for this event (`alerts.on`) */
    fleetOn: boolean;
    /** the session's own ♪ — Always */
    sessionRings: boolean;
    reasons: WhyReason[];
    quietLine: string;
    tone: string;
    origin: string;
    playable: boolean;
    skipped: { origin: string; voice: string; why: string }[];
    sayWho: { on: boolean; spoken: boolean; voice: string };
    /** the plan's other branches, by their names */
    also: string[];
    /** U-213 — an event across the farm: no session, so no session line */
    fleet?: boolean;
}

export interface WhyLine { ok: boolean | null; text: string }
export interface WhyAnswer { heard: boolean; lines: WhyLine[] }

const ORIGIN: Record<string, [string, number]> = {
    session: ['this session\'s own choice', 1],
    agent: ['its agent\'s choice', 2],
    settings: ['the fleet\'s choice', 3],
    default: ['the built-in default', 4]
};

export function soundWhy(i: WhyInput): WhyAnswer {
    const rings = i.fleetOn || (i.sessionEvent && i.sessionRings);
    const gate = (r: WhyReason) => i.reasons.includes(r);
    const [said, step] = ORIGIN[i.origin] ?? [i.origin, 0];
    const lines: WhyLine[] = [
        rings
            ? { ok: true, text: `Rings on ${i.eventName}: ${i.fleetOn ? 'its fleet switch is on' : 'this session is set to Always'}` }
            : { ok: false, text: `Nothing rings on ${i.eventName}: its fleet switch is off${i.sessionEvent ? ' and this session is not set to Always' : ''}` },
        gate('fleet') ? { ok: false, text: 'Mute all is on' } : { ok: true, text: 'Mute all: off' },
        ...(i.fleet ? [] : [gate('session') ? { ok: false, text: 'This session is Silent' } : { ok: true, text: 'This session: not Silent' }]),
        gate('quiet-hours')
            ? { ok: false, text: `Quiet hours: now${i.quietLine ? ` (${i.quietLine})` : ''}` }
            : { ok: true, text: 'Quiet hours: not now' },
        i.playable
            ? { ok: true, text: `Tone: ${i.tone} — ${said}${step ? ` (step ${step} of 4)` : ''}` }
            : { ok: false, text: `Tone: ${i.tone} cannot be played on this machine` },
        ...i.skipped.map(s => ({ ok: null, text: `Passed over: ${s.voice} (${(ORIGIN[s.origin] ?? [s.origin])[0]}) — ${s.why}` })),
        { ok: null, text: i.sayWho.on && i.sayWho.spoken ? `Say who: said, in ${i.sayWho.voice || 'the system voice'}` : `Say who: not said on ${i.eventName}` },
        ...(i.also.length ? [{ ok: null, text: `Also: ${i.also.join(' · ')}` }] : [])
    ];
    const blocked = !rings ? 'nothing rings on this event'
        : gate('fleet') ? 'Mute all is on'
            : gate('session') ? 'this session is Silent'
                : gate('quiet-hours') ? 'it is quiet hours'
                    : !i.playable ? 'its tone cannot be played here' : '';
    const heard = !blocked;
    return {
        heard,
        lines: [heard
            ? { ok: true, text: `You would hear ${i.tone}${i.sayWho.on && i.sayWho.spoken ? ' and its name' : ''}` }
            : { ok: false, text: `Silent — ${blocked}` }, ...lines]
    };
}
