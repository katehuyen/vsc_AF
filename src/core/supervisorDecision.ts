/**
 * M-43 — WHAT A WORKFLOW SUPERVISOR MAY DECIDE, AND THE CHECK THAT STANDS
 * BETWEEN ITS ANSWER AND THE RUN.
 *
 * The supervisor answers one strict JSON object. It never applies anything
 * itself: this file reads the answer, holds it against the run (does the step
 * exist, is the retry spent, is the insert within its ceiling, is there money
 * left, is it the same decision again) and either passes it to the engine or
 * says, in one sentence, why the run goes the mechanical way instead. A broken
 * answer is never guessed at. Reading the answer and the confidence gate are the
 * shared supervisor core (src/core/decisionCore.ts, M-48). Pure.
 */
import { answerObject, underConfidence } from './decisionCore';

export type DecisionKind = 'proceed' | 'retry' | 'jump' | 'insert' | 'ask_user' | 'stop';
export const DECISION_KINDS: readonly DecisionKind[] = ['proceed', 'retry', 'jump', 'insert', 'ask_user', 'stop'];
export const PATCH_KEYS = ['prompt', 'input', 'model', 'engine'] as const;

export interface InsertedStep { kind: string; title: string; prompt?: string; [k: string]: unknown }

export interface SupervisorDecision {
    decision: DecisionKind;
    /** retry / jump: the step id it is about */
    target?: string;
    patch?: Partial<Record<(typeof PATCH_KEYS)[number], string>>;
    insert?: InsertedStep[];
    question?: string;
    options?: string[];
    verdict?: string;
    confidence?: number;
    note?: string;
    why?: string;
}

export interface DecisionLimits {
    allowed: readonly DecisionKind[];
    maxInsert: number;
    insertKinds: readonly string[];
    maxRetriesPerStep: number;
    minConfidence: number;
    /** below minConfidence: ask a person · take the mechanical way · escalate to a stronger model */
    lowConfidence: 'ask' | 'mechanical' | 'escalate';
    /** undefined = no budget set */
    budgetLeftUSD?: number;
}

export interface DecisionContext {
    stepIds: readonly string[];
    currentStep: string;
    retries: Readonly<Record<string, number>>;
    /** the run's earlier decisions, oldest first, as `<decision>:<target>` */
    history: readonly string[];
}

export type DecisionVerdict =
    | { ok: true; decision: SupervisorDecision }
    | { ok: false; action: 'mechanical' | 'ask' | 'escalate'; reason: string; decision?: SupervisorDecision };

/** The decision a repeat lock refuses: the same one this many times in a row. */
export const REPEAT_LOCK = 3;

export function parseDecision(answer: string): { decision: SupervisorDecision } | { error: string } {
    const a = answerObject(answer);
    if (!a.ok) { return { error: a.error }; }
    const j = a.raw;
    const kind = String(j.decision ?? '').trim() as DecisionKind;
    if (!DECISION_KINDS.includes(kind)) { return { error: `"${j.decision ?? ''}" is not a decision — it is one of ${DECISION_KINDS.join(', ')}` }; }
    const d: SupervisorDecision = { decision: kind };
    if (j.target !== undefined) { d.target = String(j.target); }
    if (j.patch !== undefined) {
        if (!j.patch || typeof j.patch !== 'object' || Array.isArray(j.patch)) { return { error: 'patch is an object of prompt / input / model / engine' }; }
        const bad = Object.keys(j.patch).filter(k => !(PATCH_KEYS as readonly string[]).includes(k));
        if (bad.length) { return { error: `patch cannot change ${bad.join(', ')} — only ${PATCH_KEYS.join(', ')}` }; }
        d.patch = Object.fromEntries(Object.entries(j.patch as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    }
    if (j.insert !== undefined) {
        if (!Array.isArray(j.insert) || j.insert.some(x => !x || typeof x !== 'object' || !String((x as InsertedStep).kind ?? '').trim() || !String((x as InsertedStep).title ?? '').trim())) {
            return { error: 'insert is a list of steps, each with a kind and a title' };
        }
        d.insert = j.insert as InsertedStep[];
    }
    for (const k of ['question', 'verdict', 'note', 'why'] as const) { if (j[k] !== undefined) { d[k] = String(j[k]); } }
    if (j.options !== undefined) { d.options = Array.isArray(j.options) ? j.options.map(String) : [String(j.options)]; }
    if (j.confidence !== undefined) {
        const c = Number(j.confidence);
        if (!Number.isFinite(c) || c < 0 || c > 1) { return { error: 'confidence is a number from 0 to 1' }; }
        d.confidence = c;
    }
    return { decision: d };
}

/** Hold a parsed decision against the run and the limits. */
export function checkDecision(d: SupervisorDecision, ctx: DecisionContext, lim: DecisionLimits): DecisionVerdict {
    const no = (reason: string): DecisionVerdict => ({ ok: false, action: 'mechanical', reason, decision: d });
    if (!lim.allowed.includes(d.decision)) { return no(`"${d.decision}" is not a decision this workflow allows (${lim.allowed.join(', ')})`); }
    const target = d.target ?? (d.decision === 'retry' ? ctx.currentStep : undefined);
    if ((d.decision === 'jump' || d.decision === 'retry') && !target) { return no(`${d.decision} needs a target step`); }
    if (target && (d.decision === 'jump' || d.decision === 'retry') && !ctx.stepIds.includes(target)) {
        return no(`${d.decision} names step "${target}", which this workflow does not have (${ctx.stepIds.join(', ')})`);
    }
    if (d.decision === 'retry' && (ctx.retries[target as string] ?? 0) >= lim.maxRetriesPerStep) {
        return no(`step "${target}" has used its ${lim.maxRetriesPerStep} retr${lim.maxRetriesPerStep === 1 ? 'y' : 'ies'}`);
    }
    if (d.decision === 'insert') {
        const list = d.insert ?? [];
        if (!list.length) { return no('insert names no step to insert'); }
        if (list.length > lim.maxInsert) { return no(`insert asks for ${list.length} steps; the ceiling is ${lim.maxInsert}`); }
        const kind = list.find(s => !lim.insertKinds.includes(String(s.kind)));
        if (kind) { return no(`an inserted "${kind.kind}" step is not allowed (${lim.insertKinds.join(', ')})`); }
    }
    if (d.decision === 'ask_user' && !String(d.question ?? '').trim()) { return no('ask_user carries no question'); }
    if ((d.decision === 'retry' || d.decision === 'insert') && lim.budgetLeftUSD !== undefined && lim.budgetLeftUSD <= 0) {
        return no(`${d.decision} would spend more, and the run's budget is spent`);
    }
    const key = `${d.decision}:${target ?? ''}`;
    const tail = ctx.history.slice(-(REPEAT_LOCK - 1));
    if (d.decision !== 'proceed' && tail.length === REPEAT_LOCK - 1 && tail.every(h => h === key)) {
        return no(`the same decision (${key}) ${REPEAT_LOCK} times in a row — the repeat lock takes the mechanical way`);
    }
    const unsure = underConfidence(d.confidence, lim.minConfidence);
    if (unsure) { return { ok: false, action: lim.lowConfidence, decision: d, reason: unsure }; }
    return { ok: true, decision: target && !d.target ? { ...d, target } : d };
}

/** Parse and check in one: a broken answer and a refused one both say why and go mechanical. */
export function readDecision(answer: string, ctx: DecisionContext, lim: DecisionLimits): DecisionVerdict {
    const p = parseDecision(answer);
    if ('error' in p) { return { ok: false, action: 'mechanical', reason: p.error }; }
    return checkDecision(p.decision, ctx, lim);
}
