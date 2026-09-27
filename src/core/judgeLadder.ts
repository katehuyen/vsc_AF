/**
 * A-27 — THE JUDGE'S LADDER: models from the cheapest up. A step's quality check
 * is judged on the bottom rung (cheap-first); a FAIL is judged again one rung up
 * before the step is paid for a second time (escalate) — an upper PASS overturns
 * it and the retry is saved. The next check starts at the bottom again
 * (de-escalate). A step that names its own judge engine or model keeps it: rungs
 * are claude models, and a name one engine takes is an error on another. One
 * flex point, `judge.ladder` (Farm Settings → this run); empty = the one judge.
 */
import { resolveFlex } from './flexResolve';
import type { StepJudge } from './judgeEngines';

const RUNG = /^[\w.:/-]+$/;

/** The rungs, cheapest first, without blanks or repeats. */
export function ladderOf(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/[,\s]+/);
    return [...new Set(list.map(s => s.trim()).filter(Boolean))];
}

/** Why a ladder is refused, or '' — each rung one model name. */
export function ladderRefusal(raw: unknown): string {
    const bad = ladderOf(raw).filter(r => !RUNG.test(r));
    return bad.length ? `judgeLadder is model names, cheapest first ("haiku,sonnet"), not ${bad.map(b => JSON.stringify(b)).join(', ')}` : '';
}

/** The rungs a step's check climbs, and where they came from; none when the step names its own judge. */
export function ladderFor(own: StepJudge | undefined, run: unknown, settings: unknown): { rungs: string[]; from: string } {
    if (String(own?.engine ?? '').trim() || String(own?.model ?? '').trim()) { return { rungs: [], from: 'step' }; }
    const blank = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? undefined : String(v));
    const r = resolveFlex('judge.ladder', { run: blank(run), settings: blank(settings) });
    return { rungs: ladderOf(r.value), from: r.from };
}

/** The line a check that climbed writes under its verdict. */
export function escalationLine(lower: { model: string; reason: string }, upper: { model: string; pass: boolean; reason: string }): string {
    return `Escalated: ${lower.model} said FAIL (${lower.reason}) → ${upper.model} says ${upper.pass ? 'PASS — overturned, no retry paid' : 'FAIL — upheld'}: ${upper.reason}`;
}
