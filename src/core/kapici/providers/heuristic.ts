/**
 * X-412 — the deterministic provider: a noul with a check is answered here,
 * locally and exactly (p 0 or 1, confidence 1). Numbers, dates, counts and
 * patterns are what Jev is documented to be weak at, so they never leave.
 * A check reads the state as text; a check it cannot apply gives no answer.
 */
import { serializeState } from '../input';
import { HeuristicCheck, KapiciAnswer, KapiciProvider, KapiciQuestion, KapiciState } from '../types';

const DATE_RE = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/;
const NUM_RE = /-?\d+(?:[.,]\d+)?/;

const within = (n: number, c: { lt?: number; gt?: number }) => (c.lt === undefined || n < c.lt) && (c.gt === undefined || n > c.gt);

/** true / false, or undefined when the check has nothing to read (no number, no date). */
export function runCheck(check: HeuristicCheck, text: string): boolean | undefined {
    switch (check.op) {
        case 'empty': return text.trim() === '';
        case 'regex': return new RegExp(check.pattern, check.flags ?? '').test(text);
        case 'num': {
            const m = NUM_RE.exec(text);
            return m ? within(Number(m[0].replace(',', '.')), check) : undefined;
        }
        case 'date': {
            const m = DATE_RE.exec(text);
            const t = m ? Date.parse(m[0]) : NaN;
            if (Number.isNaN(t)) { return undefined; }
            return (check.before === undefined || t < Date.parse(check.before)) && (check.after === undefined || t > Date.parse(check.after));
        }
        case 'lines': return within(text === '' ? 0 : text.replace(/\n$/, '').split('\n').length, check);
        case 'chars': return within(text.length, check);
    }
    return undefined;
}

export function heuristicProvider(now: () => number = Date.now): KapiciProvider {
    return {
        name: 'heuristic',
        async ask(state: KapiciState, questions: Record<string, KapiciQuestion>) {
            const t0 = now();
            const text = serializeState(state);
            const answers: Record<string, KapiciAnswer> = {};
            for (const [id, q] of Object.entries(questions)) {
                if (q.type !== 'noul' || !q.check) { continue; }
                let v: boolean | undefined;
                try { v = runCheck(q.check, text); } catch { v = undefined; }
                if (v !== undefined) { answers[id] = { type: 'noul', p: v ? 1 : 0, confidence: 1 }; }
            }
            return { answers, model: 'heuristic', latencyMs: now() - t0 };
        }
    };
}
