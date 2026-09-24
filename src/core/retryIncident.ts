/**
 * ‼️ M-13 — WHAT THE SUPERVISOR IS SHOWN: a structured incident, never the raw
 * transcript. The task and its original words, how the run failed and what it
 * had managed to do, the attempts so far, the last meaningful stretch of the
 * conversation (capped), what changed on disk, and what is left of the retry
 * budget. Every free-text field is capped, so one bundle is a known, small cost.
 */
import { SUPERVISOR_MAX_WAIT_MIN, SUPERVISOR_PROMPT_MAX_CHARS } from './retrySupervisor';

export interface IncidentAttempt { n: number; at: number; phase?: string; why: string }

export interface IncidentBundle {
    key: string;
    task: { id: string; title: string; prompt: string };
    failure: { phase: string; why: string; engine: string; sessionId?: string; resetAt?: number; resetSource?: string };
    attempts: IncidentAttempt[];
    /** the last meaningful part of the conversation, or a safe summary of it */
    lastTurns: string;
    changes?: { status: string; stat: string };
    tests?: string;
    remaining: { retries: number; deadline?: number; budgetUsd?: number };
}

export const INCIDENT_CAPS = { prompt: 4000, lastTurns: 3000, status: 1500, stat: 1500, tests: 1000, why: 400, attempts: 6 } as const;

const cap = (s: unknown, n: number): string => {
    const t = String(s ?? '').trim();
    return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
};
/** The END of a conversation is what matters — cut from the front. */
const tail = (s: unknown, n: number): string => {
    const t = String(s ?? '').trim();
    return t.length <= n ? t : `…${t.slice(t.length - n + 1)}`;
};

export function buildIncident(o: IncidentBundle): IncidentBundle {
    return {
        key: o.key,
        task: { id: o.task.id, title: cap(o.task.title, 200), prompt: cap(o.task.prompt, INCIDENT_CAPS.prompt) },
        failure: {
            phase: o.failure.phase, why: cap(o.failure.why, INCIDENT_CAPS.why), engine: o.failure.engine,
            ...(o.failure.sessionId ? { sessionId: o.failure.sessionId } : {}),
            ...(o.failure.resetAt ? { resetAt: o.failure.resetAt } : {}),
            ...(o.failure.resetSource ? { resetSource: o.failure.resetSource } : {})
        },
        attempts: o.attempts.slice(-INCIDENT_CAPS.attempts).map(a => ({ ...a, why: cap(a.why, INCIDENT_CAPS.why) })),
        lastTurns: tail(o.lastTurns, INCIDENT_CAPS.lastTurns),
        ...(o.changes ? { changes: { status: cap(o.changes.status, INCIDENT_CAPS.status), stat: cap(o.changes.stat, INCIDENT_CAPS.stat) } } : {}),
        ...(o.tests ? { tests: tail(o.tests, INCIDENT_CAPS.tests) } : {}),
        remaining: o.remaining
    };
}

/** The whole instruction the supervisor gets: the contract first, the incident after it. */
export function supervisorPrompt(b: IncidentBundle, now: number): string {
    const iso = (t?: number) => (t ? new Date(t).toISOString() : 'unknown');
    return [
        'You are a SUPERVISOR. A task\'s engine hit its usage limit after it had already done work.',
        'Decide how the task continues. You may read files to judge; you must NOT edit files, run',
        'commands that change anything, start tasks, commit, push or close backlog items.',
        '',
        'Answer with EXACTLY ONE JSON object and nothing else:',
        '{"action": "resume" | "retryOriginal" | "wait" | "stop" | "needsUser",',
        ' "notBefore": <epoch milliseconds, optional>, "prompt": "<text, optional>",',
        ' "reason": "<one or two sentences>", "confidence": <0..1>}',
        '',
        'resume        — continue the SAME conversation; "prompt" is the next turn (required, re-aim it at the original task if it drifted).',
        'retryOriginal — start fresh; "prompt" optionally replaces the original prompt.',
        'wait          — do nothing until "notBefore" (required).',
        'stop          — the task should not go on.',
        'needsUser     — a person must decide; say what in "reason".',
        `Rules: notBefore is never before the limit resets (${iso(b.failure.resetAt)}) and never more than ${SUPERVISOR_MAX_WAIT_MIN / 60} hours from now (${iso(now)}); prompt at most ${SUPERVISOR_PROMPT_MAX_CHARS} characters.`,
        '',
        'INCIDENT:',
        JSON.stringify(b, null, 1)
    ].join('\n');
}
