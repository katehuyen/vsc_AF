/**
 * M-43 — WHAT A WORKFLOW SUPERVISOR IS SHOWN AT A CHECKPOINT.
 *
 * Not the transcript: the goal and its success criteria, the run's inputs,
 * one line per finished step off the board (status, verdict, cost, the start
 * of its text), the last output, the assets and their verdicts, the money
 * spent and left, and the person's own directives FIRST — then the decision
 * contract, naming only the decisions this workflow allows. Every cut says it
 * is a cut. Pure.
 */
import { DecisionKind, DecisionLimits } from './supervisorDecision';
import { RunBoard } from './runContext';

export interface BriefInput {
    workflow: string;
    goal?: string;
    criteria?: string[];
    inputs?: Record<string, string>;
    board?: RunBoard;
    /** the step that just ended (its board id) */
    lastStep?: string;
    assets?: { path: string; verdict?: string }[];
    costUSD: number;
    /** a person's steer / veto / constraint, newest last */
    directives?: string[];
    stepIds: readonly string[];
    limits: DecisionLimits;
}

export const BRIEF_STEP_CHARS = 300;
export const BRIEF_LAST_CHARS = 2000;

const cut = (s: string | undefined, n: number): string => {
    const t = String(s ?? '').trim();
    return t.length > n ? `${t.slice(0, n)}… [cut: ${t.length.toLocaleString('en-US')} characters]` : t;
};

function contract(allowed: readonly DecisionKind[], lim: DecisionLimits, stepIds: readonly string[]): string {
    const say: Record<DecisionKind, string> = {
        proceed: '"proceed" — carry on down the chain',
        retry: `"retry" — run a step again (target: a step id; at most ${lim.maxRetriesPerStep} per step), optionally with "patch": {prompt|input|model|engine}`,
        jump: '"jump" — go to another step (target: a step id)',
        insert: `"insert" — add up to ${lim.maxInsert} step(s) after this one: "insert": [{"kind": ${lim.insertKinds.map(k => `"${k}"`).join('|')}, "title", "prompt"}]`,
        ask_user: '"ask_user" — stop and ask the person: "question", "options": [...]',
        stop: '"stop" — end the run here'
    };
    return [
        'Answer with ONE JSON object and nothing else:',
        '{"decision": <one of the below>, "target"?, "patch"?, "insert"?, "question"?, "options"?, "verdict"?, "confidence": 0..1, "note"?, "why": "<one sentence>"}',
        ...allowed.map(k => `- ${say[k]}`),
        `Step ids: ${stepIds.join(', ')}.`,
        `Below ${Math.round(lim.minConfidence * 100)}% confidence your decision is not applied as it stands. You do not write files or run commands; the engine applies what you decide.`
    ].join('\n');
}

export function buildBrief(b: BriefInput): string {
    const out: string[] = [`# Supervising the workflow "${b.workflow}"`];
    if (b.directives?.length) { out.push('## The person said (these come first)', ...b.directives.map(d => `- ${d}`)); }
    out.push('## Goal', b.goal?.trim() || '(no goal was written for this workflow)');
    if (b.criteria?.length) { out.push('## Success criteria', ...b.criteria.map(c => `- ${c}`)); }
    const ins = Object.entries(b.inputs ?? {});
    if (ins.length) { out.push('## Inputs', ...ins.map(([k, v]) => `- ${k}: ${cut(v, 200)}`)); }
    const steps = Object.values(b.board?.steps ?? {}).sort((x, y) => x.index - y.index);
    out.push('## Steps so far', ...(steps.length ? steps.map(s =>
        `- ${s.id} "${s.title}": ${s.status}${s.verdict ? ` · verdict ${s.verdict}` : ''}${s.costUSD ? ` · $${s.costUSD.toFixed(2)}` : ''}`
        + (s.text ? ` — ${cut(s.text, BRIEF_STEP_CHARS).replace(/\s+/g, ' ')}` : '')) : ['(none has finished yet)']));
    const last = b.lastStep ? b.board?.steps[b.lastStep] : undefined;
    if (last) { out.push(`## The last output (${last.id})`, cut(last.text, BRIEF_LAST_CHARS) || '(no text)'); }
    if (b.assets?.length) { out.push('## Assets', ...b.assets.map(a => `- ${a.path}${a.verdict ? ` — ${a.verdict}` : ''}`)); }
    const left = b.limits.budgetLeftUSD;
    out.push('## Money', `Spent $${b.costUSD.toFixed(2)}${left !== undefined ? ` · left $${Math.max(0, left).toFixed(2)}` : ' · no budget set'}.`);
    out.push('## Your answer', contract(b.limits.allowed, b.limits, b.stepIds));
    return out.join('\n\n');
}
