/**
 * K-45 — A CONSOLE QUESTION NO CLOCK WILL ANSWER IS WORK. The farm stays stuck
 * on it until somebody looks, so it is a Needs You row, and the row says WHY
 * the clock is not running (the word and the filter) — nobody should have to
 * come in the morning and go looking for the reason. A question whose clock is
 * running resolves itself: news at most, never a row (needs.ts, the admission test).
 */
import type { AutoAnswerView } from './autoAnswer';
import type { NeedItem } from './needs';

export interface ConsoleNeedAsk {
    consoleId: string;
    requestId: string;
    agentName: string;
    question: string;
    /** why no clock runs, without the "waiting for you" the row already says */
    why: string;
    ts: number;
}

interface HostedCard {
    id: string;
    agentName: string;
    pendingAsk?: { requestId: string; ts: number; detail?: string; questions: { question: string }[] };
}

export function consoleNeedAsks(cards: HostedCard[], viewOf: (id: string) => AutoAnswerView | null): ConsoleNeedAsk[] {
    const out: ConsoleNeedAsk[] = [];
    for (const c of cards) {
        const a = c.pendingAsk;
        const v = a ? viewOf(c.id) : null;
        // a permission never runs on a clock, and it reaches this page as a permission row
        if (!a || !v || v.state === 'armed' || v.reason === 'permission' || !a.questions.length) { continue; }
        out.push({
            consoleId: c.id, requestId: a.requestId, agentName: c.agentName, ts: a.ts,
            question: a.questions.map(q => q.question).join('\n'),
            why: v.why.replace(/^waiting for you — /, '')
        });
    }
    return out;
}

/** Changes only when a row would appear, go or change — the page is not redrawn per streamed word. */
export function consoleNeedSig(asks: ConsoleNeedAsk[]): string {
    return asks.map(a => `${a.consoleId}:${a.requestId}:${a.why}`).join('|');
}

const ROW = 140;

export function consoleNeedItems(asks: ConsoleNeedAsk[], urgency: number): NeedItem[] {
    return asks.map(a => {
        const line = a.why.length > ROW ? a.why.slice(0, ROW - 1) + '…' : a.why;
        return {
            urgency, kind: 'console-question', agentName: a.agentName,
            title: `${a.agentName} is asking you — no timer will answer it`,
            detail: line, body: `${a.why}\n\n${a.question}`, ts: a.ts,
            ref: { consoleId: a.consoleId, requestId: a.requestId },
            actions: [{ id: 'open-console', label: 'Answer in Console' }]
        };
    });
}
