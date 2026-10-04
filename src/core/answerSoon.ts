/**
 * U-214 — A QUESTION THAT ANSWERS ITSELF SAYS SO FIRST.
 *
 * K-43 answers a Console question with its recommended option when its clock
 * runs out, and that answer counts as the person's. Somebody out of the room
 * loses the decision without a sound — so a setting's worth before the clock
 * runs out, the reminder's tone plays and, with Say who on for Asking you, a
 * short sentence says whose question it is and how long is left.
 *
 * It rides the reminder's own sweep rather than a clock of its own, and tells
 * each question once. A question answered, stopped (Stop timer) or closed in
 * the meantime is no longer `armed`, so the next sweep forgets it instead of
 * ringing about a decision that has already been made.
 *
 * Pure (no vscode import): the host hands it the cards and the time.
 */
import type { RemoteEvent } from './remoteEvents';

export const ANSWER_SOON_KEY = 'agentFarm.console.autoAnswer.remindSeconds';
export const ANSWER_SOON_DEFAULT_SECONDS = 120;
/** Half an hour: past that a reminder is a second question, not a warning. */
export const ANSWER_SOON_MAX_SECONDS = 1800;

/** 0 = off; a value that is not a number is the default rather than a guess. */
export function answerSoonSeconds(raw: unknown): number {
    const n = Number(raw);
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(n)) { return ANSWER_SOON_DEFAULT_SECONDS; }
    return Math.min(ANSWER_SOON_MAX_SECONDS, Math.max(0, Math.round(n)));
}

/** One Console card's question clock, as the host's auto-answer view reports it. */
export interface AnswerSoonCard {
    cardId: string;
    requestId: string;
    agentName: string;
    sessionId?: string;
    /** `armed` counts down · `held` a person pressed Stop timer · `waiting` the clock never ran */
    state: 'armed' | 'held' | 'waiting';
    dueAt: number;
    timeoutSeconds: number;
}

export interface AnswerSoonDue extends AnswerSoonCard {
    remainingMs: number;
}

export class AnswerSoonMemo {
    private told = new Set<string>();

    /** What should be said NOW. Also the forgetting: a question no longer armed leaves the memo. */
    due(now: number, cards: AnswerSoonCard[], leadSeconds: number): AnswerSoonDue[] {
        const key = (c: AnswerSoonCard) => `${c.cardId}:${c.requestId}`;
        const armed = cards.filter(c => c.state === 'armed' && c.dueAt > 0);
        const live = new Set(armed.map(key));
        for (const k of [...this.told]) { if (!live.has(k)) { this.told.delete(k); } }
        // 0 = off falls out of the window test below: nothing is ever within 0 ms of its end
        const lead = Math.max(0, leadSeconds) * 1000;
        const out: AnswerSoonDue[] = [];
        for (const c of armed) {
            if (this.told.has(key(c))) { continue; }
            const remainingMs = c.dueAt - now;
            if (remainingMs <= 0 || remainingMs > lead) { continue; }
            // A wait no longer than the warning: the question's own alert already said it.
            if (c.timeoutSeconds * 1000 <= lead) { continue; }
            this.told.add(key(c));
            out.push({ ...c, remainingMs });
        }
        return out;
    }
}

/** Whole minutes, never "in 0 minutes": the sweep runs every half minute. */
export function minutesLeft(remainingMs: number): number {
    return Math.max(1, Math.round(remainingMs / 60_000));
}

/** The same moment for the phone; an older phone ignores a type it does not know. */
export function answerSoonEvent(d: AnswerSoonDue): RemoteEvent {
    return {
        type: 'ask.answersSoon',
        data: { session: d.cardId, agent: d.agentName, askId: d.requestId, dueAt: d.dueAt, minutes: minutesLeft(d.remainingMs) }
    };
}
