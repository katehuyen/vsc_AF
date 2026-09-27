/**
 * A-27 — THE RUN'S HARD SPEND CAP. Past it no further step and no further
 * for-each branch starts; nothing is asked, so a broken or silent supervisor
 * cannot spend past it. The soft ceiling stays what it was: a `cost.run` wake
 * condition, which asks the supervisor. One flex point, `workflow.spendCap`
 * (Farm Settings → the workflow → this run), 0 = no cap.
 */
import { resolveFlex } from './flexResolve';
import type { ForEachRun } from './forEachStep';

export interface SpendCap { usd: number; from: string }

/** A cap as given on the bridge or a form: a number of dollars, 0 or more; '' = not set. */
export function spendCapRefusal(v: unknown): string {
    if (v === undefined || v === null || v === '') { return ''; }
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? '' : `spendCap is dollars, 0 or more (0 = no cap), not ${JSON.stringify(v)}`;
}

const num = (v: unknown): number | undefined => (v === undefined || v === null || v === '' ? undefined : Number(v));

/** The cap a run starts with: this run's, else the workflow's, else Farm Settings'. */
export function runSpendCap(run: unknown, workflow: unknown, settings: unknown): SpendCap {
    const r = resolveFlex('workflow.spendCap', { run: num(run), workflow: num(workflow), settings: num(settings) });
    return { usd: Number(r.value) || 0, from: r.from };
}

/** Why the run stops here, or '' — at or past the cap, never below it. */
export function spendCapStop(spentUSD: number, cap: SpendCap | undefined): string {
    if (!cap || !(cap.usd > 0) || spentUSD < cap.usd) { return ''; }
    return `spend cap reached — the run has spent $${spentUSD.toFixed(2)} of its $${cap.usd.toFixed(2)} cap (${cap.from}); no further step starts`;
}

/** Branches still waiting are closed as not started; the ones in flight finish. Returns how many were closed. */
export function capWaitingBranches(run: ForEachRun, why: string): number {
    const waiting = run.branches.filter(b => b.status === 'waiting');
    for (const b of waiting) { b.status = 'failed'; b.reason = `not started — ${why}`; }
    return waiting.length;
}
