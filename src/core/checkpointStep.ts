/**
 * M-43 — A CHECKPOINT STEP: the one place a workflow wakes its supervisor
 * unconditionally. The supervisor is shown the brief (supervisorBrief.ts), its
 * answer is held against the run (supervisorDecision.ts), and what survives
 * becomes a ROUTE the engine follows. Anything refused, broken or unanswered
 * goes the mechanical way — at a checkpoint that is simply "carry on", and the
 * row says why. Pure but for the injected host; the engine glue is in tasks.ts.
 */
import type { FarmWorkflow, Handoff, WorkflowStep } from './tasks';
import { resolveFlex } from './flexResolve';
import { RunBoard, stepKey } from './runContext';
import { buildBrief, BriefInput } from './supervisorBrief';
import {
    DECISION_KINDS, DecisionContext, DecisionKind, DecisionLimits, DecisionVerdict,
    InsertedStep, PATCH_KEYS, readDecision, SupervisorDecision
} from './supervisorDecision';

export type LowConfidence = DecisionLimits['lowConfidence'];
export const LOW_CONFIDENCE: readonly LowConfidence[] = ['ask', 'mechanical', 'escalate'];
/** What an inserted step can be: an agent turn on the chain's nearest agent, or a person's approval. */
export const INSERT_KINDS = ['agent', 'approval'] as const;

export interface CheckpointSpec {
    /** what the person wants the supervisor to look at here, added to its directives */
    message?: string;
    /** comma list of decision kinds; empty = the built-in list */
    allowed?: string;
    maxInsert?: number;
    /** comma list of INSERT_KINDS */
    insertKinds?: string;
    maxRetries?: number;
    minConfidence?: number;
    lowConfidence?: LowConfidence;
}

const words = (v: unknown): string[] => String(v ?? '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
const orUnset = (v: unknown): unknown => (typeof v === 'string' && !v.trim() ? undefined : v);

/** The checkpoint's limits, each resolved through its flex point, and where every one came from. */
export function checkpointLimits(cp: CheckpointSpec | undefined, budgetLeftUSD?: number): DecisionLimits & { origin: string } {
    const r = (id: string, v: unknown) => resolveFlex(`checkpoint.${id}`, { step: orUnset(v) });
    const c = cp ?? {};
    const a = r('allowed', c.allowed), mi = r('maxInsert', c.maxInsert), k = r('insertKinds', c.insertKinds),
        mr = r('maxRetries', c.maxRetries), mc = r('minConfidence', c.minConfidence), lc = r('lowConfidence', c.lowConfidence);
    return {
        allowed: words(a.value).filter(x => (DECISION_KINDS as readonly string[]).includes(x)) as DecisionKind[],
        maxInsert: Number(mi.value),
        insertKinds: words(k.value).filter(x => (INSERT_KINDS as readonly string[]).includes(x)),
        maxRetriesPerStep: Number(mr.value),
        minConfidence: Number(mc.value),
        lowConfidence: lc.value as LowConfidence,
        ...(budgetLeftUSD !== undefined ? { budgetLeftUSD } : {}),
        origin: [`decisions ${a.sentence}`, `insert at most ${mi.sentence}`, `insert kinds ${k.sentence}`,
            `retries per step ${mr.sentence}`, `confidence ${mc.sentence}`, `below it ${lc.sentence}`].join(' · ')
    };
}

/** Why a checkpoint is refused at save time — '' when it is sound. */
export function checkpointRefusal(step: { checkpoint?: CheckpointSpec; parallel?: boolean; forEach?: unknown }): string {
    const cp = step.checkpoint;
    if (!cp) { return ''; }
    if (step.parallel || step.forEach) { return 'a checkpoint cannot run in parallel or for each — it decides for the whole chain'; }
    const badKind = words(cp.allowed).find(x => !(DECISION_KINDS as readonly string[]).includes(x));
    if (badKind) { return `"${badKind}" is not a decision — it is one of ${DECISION_KINDS.join(', ')}`; }
    const badIns = words(cp.insertKinds).find(x => !(INSERT_KINDS as readonly string[]).includes(x));
    if (badIns) { return `a checkpoint cannot insert a "${badIns}" step — only ${INSERT_KINDS.join(', ')}`; }
    if (cp.lowConfidence !== undefined && !LOW_CONFIDENCE.includes(cp.lowConfidence)) {
        return `below the confidence threshold it can ${LOW_CONFIDENCE.join(', ')} — not "${cp.lowConfidence}"`;
    }
    for (const f of ['maxInsert', 'maxRetries', 'minConfidence'] as const) {
        const res = resolveFlex(`checkpoint.${f}`, { step: cp[f] });
        if (res.ignored.length) { return `checkpoint ${f} ${JSON.stringify(cp[f])} is refused — ${res.ignored[0].why}`; }
    }
    return '';
}

/** A workflow's goal and success criteria as saved — criteria a list or one per line; empty removes them. */
export function setWorkflowGoal(w: { goal?: string; criteria?: string[] }, goal: unknown, criteria: unknown): void {
    const g = String(goal ?? '').trim();
    const c = (Array.isArray(criteria) ? criteria : String(criteria ?? '').split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean);
    if (g) { w.goal = g; } else { delete w.goal; }
    if (c.length) { w.criteria = c; } else { delete w.criteria; }
}

/** The step card's Checkpoint boxes, from the step; a blank box means the built-in default. */
export function checkpointSeed(cp: CheckpointSpec | undefined): Record<string, unknown> {
    return {
        cpMsg: cp?.message ?? '', cpAllowed: cp?.allowed ?? '', cpMaxInsert: cp?.maxInsert ?? '', cpKinds: cp?.insertKinds ?? '',
        cpRetries: cp?.maxRetries ?? '', cpConf: cp?.minConfidence ?? '', cpLow: cp?.lowConfidence ?? ''
    };
}

/** …and back: a blank box is left unset so the built-in default applies. */
export function checkpointFromDraft(str: (k: string) => string): CheckpointSpec {
    const num = (k: string): number | undefined => (str(k) === '' || !Number.isFinite(Number(str(k))) ? undefined : Number(str(k)));
    const cp: CheckpointSpec = {};
    const set = <K extends keyof CheckpointSpec>(k: K, v: CheckpointSpec[K] | undefined) => { if (v !== undefined && v !== '') { cp[k] = v; } };
    set('message', str('cpMsg'));
    set('allowed', str('cpAllowed'));
    set('maxInsert', num('cpMaxInsert'));
    set('insertKinds', str('cpKinds'));
    set('maxRetries', num('cpRetries'));
    set('minConfidence', num('cpConf'));
    set('lowConfidence', (str('cpLow') || undefined) as LowConfidence | undefined);
    return cp;
}

export interface SupervisorTurn { out: string; error?: string; model?: string }

export interface CheckpointHost {
    /** one supervisor turn on the prompt; tier 1 = a stronger model than tier 0 */
    ask(prompt: string, tier: 0 | 1): Promise<SupervisorTurn>;
    /** a yes/no to a person; absent = nobody can be asked */
    confirm?(title: string, message: string): Promise<boolean>;
    /** a question with options to a person; undefined = not answered */
    pick?(question: string, options: string[]): Promise<string | undefined>;
}

export interface CheckpointOutcome {
    decision?: SupervisorDecision;
    /** set when the run goes the mechanical way, and why */
    mechanical?: string;
    log: string[];
    directives: string[];
}

const oneLine = (s: string | undefined, n = 240): string => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
};

/**
 * Wake the supervisor once, and settle what it says: escalate once, ask a
 * person once, and answer its one question — never a loop.
 */
export async function superviseCheckpoint(brief: BriefInput, ctx: DecisionContext, host: CheckpointHost): Promise<CheckpointOutcome> {
    const log: string[] = [];
    let directives = [...(brief.directives ?? [])];
    let limits = brief.limits;
    const mech = (reason: string): CheckpointOutcome => { log.push(`mechanical — ${reason}`); return { mechanical: reason, log, directives }; };
    const turn = async (tier: 0 | 1): Promise<DecisionVerdict> => {
        const r = await host.ask(buildBrief({ ...brief, directives, limits }), tier);
        log.push(`supervisor${tier ? ' (escalated)' : ''}${r.model ? ` [${r.model}]` : ''}: ${oneLine(r.out || r.error) || '(nothing)'}`);
        if (!String(r.out ?? '').trim()) {
            return { ok: false, action: 'mechanical', reason: `the supervisor could not answer (${oneLine(r.error, 100) || 'an empty answer'})` };
        }
        return readDecision(r.out, ctx, limits);
    };

    let v = await turn(0);
    if (!v.ok && v.action === 'escalate') {
        log.push(`escalating — ${v.reason}`);
        v = await turn(1);
        if (!v.ok && v.action !== 'mechanical') { return mech(`even escalated, ${v.reason}`); }
    }
    if (!v.ok && v.action === 'ask') {
        if (!host.confirm || !v.decision) { return mech(`${v.reason}, and nobody can be asked`); }
        const d = v.decision;
        const yes = await host.confirm(`Apply the supervisor's "${d.decision}${d.target ? ` ${d.target}` : ''}"?`,
            `${v.reason}.${d.why ? ` Its reason: ${d.why}` : ''}`);
        if (!yes) { return mech(`${v.reason}; the person said no`); }
        log.push('the person approved the unsure decision');
        v = { ok: true, decision: d };
    }
    if (!v.ok) { return mech(v.reason); }
    let d = v.decision;
    if (d.decision === 'ask_user') {
        if (!host.pick) { return mech('the supervisor asked a question, and nobody can be asked'); }
        const answer = await host.pick(String(d.question), d.options ?? []);
        if (answer === undefined) { return mech('the person did not answer the supervisor\'s question'); }
        directives = [...directives, `You asked "${oneLine(d.question, 200)}" — the answer: ${oneLine(answer, 400)}`];
        log.push(`the person answered: ${oneLine(answer)}`);
        limits = { ...limits, allowed: limits.allowed.filter(k => k !== 'ask_user') };
        const again = await turn(0);
        if (!again.ok) { return mech(again.reason); }
        d = again.decision;
    }
    return { decision: d, log, directives };
}

export type CheckpointRoute =
    | { go: 'next' }
    | { go: 'step'; index: number; patch?: SupervisorDecision['patch'] }
    | { go: 'insert'; steps: InsertedStep[] }
    | { go: 'stop'; why: string };

/** Where the run goes from checkpoint `index` on an accepted decision. */
export function routeOf(d: SupervisorDecision | undefined, stepIds: readonly string[], index: number, currentStep: string): CheckpointRoute {
    if (!d) { return { go: 'next' }; }
    switch (d.decision) {
        case 'retry':
        case 'jump': {
            const at = stepIds.indexOf(d.target ?? currentStep);
            return at < 0 ? { go: 'next' } : { go: 'step', index: at, ...(d.patch ? { patch: d.patch } : {}) };
        }
        case 'insert': return { go: 'insert', steps: d.insert ?? [] };
        case 'stop': return { go: 'stop', why: d.why || d.note || 'the supervisor stopped the run' };
        default: return { go: 'next' };
    }
}

/** What a run changes in its own copy of the workflow: patched steps, and steps inserted after a checkpoint. */
export interface RunEdits {
    patches?: Record<string, Partial<Record<(typeof PATCH_KEYS)[number], string>>>;
    inserts?: { after: string; steps: WorkflowStep[] }[];
}

function patchStep(s: WorkflowStep, p: Partial<Record<(typeof PATCH_KEYS)[number], string>> | undefined): WorkflowStep {
    if (!p || !Object.keys(p).length) { return s; }
    const out: WorkflowStep = { ...s };
    if (p.prompt !== undefined) { out.prompt = p.prompt; }
    if (p.model !== undefined) { out.model = p.model; }
    if (p.engine !== undefined) { out.engine = p.engine; }
    if (p.input !== undefined) {
        if (out.media) { out.media = { ...out.media, input: p.input }; } else if (out.webhook) { out.webhook = { ...out.webhook, body: p.input }; }
    }
    return out;
}

/** The workflow as one run sees it. Always derived from the STORED workflow, so applying it twice is harmless. */
export function applyRunEdits(w: FarmWorkflow, e: RunEdits | undefined): FarmWorkflow {
    if (!e || (!e.inserts?.length && !Object.keys(e.patches ?? {}).length)) { return w; }
    const keyed = w.steps.map((s, i) => ({ key: stepKey(s, i), step: s }));
    for (const ins of e.inserts ?? []) {
        const at = keyed.findIndex(x => x.key === ins.after);
        if (at < 0) { continue; }
        keyed.splice(at + 1, 0, ...ins.steps.map(s => ({ key: s.id as string, step: s })));
    }
    return { ...w, steps: keyed.map(x => patchStep(x.step, e.patches?.[x.key])) };
}

/** The agent an inserted agent step runs on: the nearest agent step before the checkpoint, else any. */
export function anchorAgent(steps: readonly WorkflowStep[], index: number): { agentId: string; agentName: string } | undefined {
    const isAgent = (s: WorkflowStep) => !!s.agentId && !s.webhook && !s.media && !s.approval && !s.select && !s.checkpoint;
    const before = steps.slice(0, index).reverse().find(isAgent) ?? steps.find(isAgent);
    return before ? { agentId: before.agentId, agentName: before.agentName } : undefined;
}

/** Inserted steps as real steps, with ids no other step of the run has. */
export function stepsFromInsert(list: readonly InsertedStep[], agent: { agentId: string; agentName: string } | undefined,
    anchorKey: string, taken: readonly string[]): WorkflowStep[] | { error: string } {
    if (list.some(s => s.kind === 'agent') && !agent) { return { error: 'an agent step was inserted, and the chain has no agent to run it on' }; }
    const used = new Set(taken);
    return list.map(s => {
        let n = 1, id = `${anchorKey}x${n}`.slice(0, 32);
        while (used.has(id)) { id = `${anchorKey}x${++n}`.slice(0, 32); }
        used.add(id);
        const base = { id, title: String(s.title), prompt: String(s.prompt ?? ''), mode: 'headless' as const };
        return s.kind === 'approval'
            ? { ...base, agentId: '', agentName: 'approval', approval: { message: String(s.prompt ?? '') || undefined } }
            : { ...base, agentId: agent!.agentId, agentName: agent!.agentName };
    });
}

/** What a step at `index` is handed when the run goes BACK to it: the board's record of the step before it. */
export function handoffFromBoard(board: RunBoard | undefined, steps: readonly WorkflowStep[], index: number): Handoff {
    if (index <= 0) { return {}; }
    const prev = board?.steps[stepKey(steps[index - 1], index - 1)];
    return prev ? { ...(prev.text !== undefined ? { text: prev.text } : {}), ...(prev.json !== undefined ? { json: prev.json } : {}), ...(prev.file ? { file: prev.file } : {}) } : {};
}

const LADDER: [RegExp, string][] = [[/haiku/i, 'sonnet'], [/sonnet/i, 'opus']];

/** The next model up for an escalation, or undefined when there is none to go to. */
export function escalateModel(model: string | undefined, args = ''): string | undefined {
    const m = model || (/--model(?:=|\s+)(\S+)/.exec(args)?.[1] ?? '');
    return LADDER.find(([re]) => re.test(m))?.[1];
}
