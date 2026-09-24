/**
 * ‼️ M-13 — THE PENDING ROW AND WHAT A DECISION DOES TO IT.
 *
 * When a supervised run hits its limit after doing work, its retry row is made
 * exactly as deterministic Smart Continue would make it — same session, same
 * continuation prompt, same wait — and HELD with a `supervision` record. The
 * row is the fallback: whatever the supervisor fails to decide, the row already
 * says. A decision only changes it, and this module is the one place that says
 * how, so the manager and the tests read the same rule.
 */
import { ContinuationDecision, SupervisorFallback } from './retrySupervisor';

export type SupervisionState = 'pending' | 'asking' | 'decided' | 'fallback';

export interface TaskSupervision {
    /** incidentKey — one incident, one call, across restarts */
    key: string;
    state: SupervisionState;
    /** when the supervisor may be asked (supervisorWhen) */
    at: number;
    /** why then */
    atWhy: string;
    /** the failed run the incident is about */
    failedTask: string;
    /** calls made for this task's chain, this one included once asked */
    calls: number;
    spentUsd?: number;
    decision?: ContinuationDecision;
    /** a refusal, an error or a low confidence — why the fallback was used */
    note?: string;
    /** the supervisor's own run, for its transcript and cost */
    sessionId?: string;
}

/** The park code a held supervised row carries (launchBlock renews it quietly). */
export const SUPERVISION_HOLD_CODE = 'supervisor:pending';
export const SUPERVISION_ASK_CODE = 'supervisor:ask';
export const SUPERVISION_PARK_CODE = 'supervisor:park';

export const isSupervisionOpen = (s?: TaskSupervision): boolean => !!s && (s.state === 'pending' || s.state === 'asking');

export interface SupervisedRow {
    title: string;
    prompt: string;
    notBefore?: number;
    resumeSessionId?: string;
}

export type SupervisionOutcome =
    | { kind: 'decision'; decision: ContinuationDecision }
    | { kind: 'fallback'; fallback: SupervisorFallback; note: string };

export interface SupervisionEffect {
    /** release = let the pump run it; hold = keep it parked with `code`; cancel = never run */
    kind: 'release' | 'hold' | 'cancel';
    set: Partial<SupervisedRow>;
    /** row fields to clear (a fresh retry drops the conversation it would have resumed) */
    unset: Array<'resumeSessionId' | 'resumedEngine' | 'resumedFrom' | 'continuationOf'>;
    code?: string;
    /** one line for the row's own record */
    event: string;
}

/**
 * ‼️ THE USER'S WORD ON A SUPERVISED ROW, which outranks the supervisor's.
 * `deterministic` lets the row go as it was made (Smart Continue) — only while
 * it still IS that row: nothing decided yet, or held by a decision that changed
 * nothing. `run` starts it now, on the prompt given or the one it holds. `edit`
 * only rewrites the prompt; the row stays where it is.
 */
export type SupervisionAct = 'deterministic' | 'run' | 'edit';

export interface UserSupervisionEffect { ok: true; release: boolean; prompt?: string; clearWait: boolean; state?: SupervisionState; event: string }

export function userSupervision(
    row: { supervision?: TaskSupervision; deferredCode?: string },
    act: SupervisionAct, prompt?: string
): UserSupervisionEffect | { ok: false; why: string } {
    const s = row.supervision;
    if (!s) { return { ok: false, why: 'this row is not a supervised retry' }; }
    const p = String(prompt ?? '').trim();
    const open = isSupervisionOpen(s);
    if (act === 'edit') {
        if (!p) { return { ok: false, why: 'say the new prompt' }; }
        return { ok: true, release: false, prompt: p, clearWait: false, event: 'you rewrote the continuation prompt' };
    }
    if (act === 'deterministic') {
        const untouched = open || row.deferredCode === SUPERVISION_ASK_CODE || row.deferredCode === SUPERVISION_PARK_CODE;
        if (!untouched) { return { ok: false, why: 'the supervisor\'s decision already changed this row — edit its prompt or run it instead' }; }
        return { ok: true, release: true, clearWait: false, ...(open ? { state: 'fallback' as const } : {}), event: 'you chose the deterministic continuation — Smart Continue goes ahead' };
    }
    return {
        ok: true, release: true, clearWait: true, ...(p ? { prompt: p } : {}), ...(open ? { state: 'fallback' as const } : {}),
        event: p ? 'you ran it now, on your own prompt' : 'you ran it now'
    };
}

const retitle = (title: string, word: 'continue' | 'retry'): string =>
    title.replace(/\((continue|retry) (\d+)\)\s*$/, `(${word} $2)`);

export function supervisionEffect(row: SupervisedRow, o: SupervisionOutcome, ctx: { originalPrompt: string; engine: string }): SupervisionEffect {
    if (o.kind === 'fallback') {
        const why = `the supervisor did not decide (${o.note})`;
        if (o.fallback === 'stop') { return { kind: 'cancel', set: {}, unset: [], event: `${why} — stopped, as the policy says` }; }
        if (o.fallback === 'park') {
            return { kind: 'hold', set: {}, unset: [], code: SUPERVISION_PARK_CODE, event: `${why} — parked for you, as the policy says` };
        }
        return { kind: 'release', set: {}, unset: [], event: `${why} — deterministic Smart Continue goes ahead` };
    }
    const d = o.decision;
    const said = `${ctx.engine} decided "${d.action}" (confidence ${d.confidence.toFixed(2)}): ${d.reason}`;
    const later = d.notBefore !== undefined ? Math.max(d.notBefore, row.notBefore ?? 0) : undefined;
    switch (d.action) {
        case 'resume':
            return {
                kind: 'release', unset: [], event: said,
                set: { prompt: d.prompt!, ...(later !== undefined ? { notBefore: later } : {}) }
            };
        case 'retryOriginal':
            return {
                kind: 'release', event: `${said} — a fresh run, not a continuation`,
                unset: ['resumeSessionId', 'resumedEngine', 'resumedFrom', 'continuationOf'],
                set: { prompt: d.prompt || ctx.originalPrompt, title: retitle(row.title, 'retry'), ...(later !== undefined ? { notBefore: later } : {}) }
            };
        case 'wait':
            return { kind: 'release', unset: [], event: said, set: { notBefore: later } };
        case 'stop':
            return { kind: 'cancel', set: {}, unset: [], event: said };
        case 'needsUser':
        default:
            return { kind: 'hold', set: {}, unset: [], code: SUPERVISION_ASK_CODE, event: said };
    }
}
