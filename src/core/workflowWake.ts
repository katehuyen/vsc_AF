/**
 * M-45 — WAKING THE SUPERVISOR ON AN EVENT.
 *
 * When a workflow step ends, the run's wake conditions (a policyEngine condition
 * set over the workflow dictionary, src/core/workflowPolicy.ts) are held against
 * what the step measured. Nothing fires → the mechanical path, exactly as it has
 * always run. Something fires → the supervisor is asked as if a checkpoint stood
 * right after that step. Pure.
 */
import { Condition, OPERATORS } from './policyEngine';
import { resolveFlex } from './flexResolve';
import { evaluateWorkflowConditions, WORKFLOW_DICTIONARY, WorkflowFacts } from './workflowPolicy';

export type WakeSpec = Condition[];

export interface WakePreset { id: 'mechanical' | 'smart' | 'hybrid'; label: string; describe: string }

export const WAKE_PRESETS: WakePreset[] = [
    { id: 'mechanical', label: 'Mechanical', describe: 'Never wakes the supervisor between steps — zero tokens. Checkpoint steps still ask it.' },
    { id: 'smart', label: 'Smart', describe: 'Wakes it after every step.' },
    { id: 'hybrid', label: 'Hybrid', describe: 'Wakes it when a quality check fails, a step fails, or the run has cost more than $2. A starting point — edit the conditions.' }
];

export function wakePresetConditions(id: string): WakeSpec {
    switch (id) {
        case 'smart': return [{ id: 'every-step', field: 'always', operator: 'isTrue' }];
        case 'hybrid': return [
            { id: 'judge-fail', field: 'verify.verdict', operator: 'eq', value: 'fail' },
            { id: 'step-failed', field: 'step.status', operator: 'eq', value: 'failed' },
            { id: 'over-2usd', field: 'cost.run', operator: 'gt', value: 2 }
        ];
        default: return [];
    }
}

const one = (c: Condition): unknown => Array.isArray(c.all)
    ? ['&', ...c.all.map(one)]
    : [c.field ?? '', c.operator ?? '', c.value === undefined || c.value === null ? '' : String(c.value)];

/** Which preset a condition set IS — derived from the set, never remembered; '' = the user's own. */
export function wakeMode(list: WakeSpec | undefined): string {
    const key = JSON.stringify((list ?? []).map(one));
    const p = WAKE_PRESETS.find(x => JSON.stringify(wakePresetConditions(x.id).map(one)) === key);
    return p ? p.id : 'custom';
}

/** A bridge or form value: a preset's name, or a condition list. Anything else is refused by name. */
export function wakeFromArg(v: unknown): { wake?: WakeSpec; error?: string } {
    if (v === undefined || v === null || v === '') { return {}; }
    if (typeof v === 'string') {
        if (WAKE_PRESETS.some(p => p.id === v)) { return { wake: wakePresetConditions(v) }; }
        try { return wakeFromArg(JSON.parse(v)); } catch { return { error: `wake "${v.slice(0, 40)}" is neither mechanical, smart, hybrid nor a condition list` }; }
    }
    if (!Array.isArray(v)) { return { error: 'wake must be mechanical, smart, hybrid or a list of conditions' }; }
    const bad = wakeRefusal(v as WakeSpec);
    return bad ? { error: bad } : { wake: v as WakeSpec };
}

/** A condition that could never be judged is refused at save time, not found out at step 7. */
export function wakeRefusal(list: WakeSpec): string {
    const check = (c: Condition, where: string): string => {
        if (!c || typeof c !== 'object') { return `${where} is not a condition`; }
        if (Array.isArray(c.all)) {
            for (let i = 0; i < c.all.length; i++) { const e = check(c.all[i], `${where}.${i + 1}`); if (e) { return e; } }
            return c.all.length ? '' : `${where} is an empty group`;
        }
        const f = WORKFLOW_DICTIONARY.fields.find(x => x.field === c.field);
        if (!f) { return `${where}: no field "${String(c.field ?? '')}" (see workflows.wakeFields)`; }
        const o = OPERATORS.find(x => x.id === c.operator);
        if (!o || !o.types.includes(f.type)) { return `${where}: "${String(c.operator ?? '')}" does not apply to ${f.field}`; }
        if (o.takesValue && (c.value === undefined || c.value === '')) { return `${where}: ${f.field} ${o.label} what?`; }
        return '';
    };
    for (let i = 0; i < list.length; i++) { const e = check(list[i], `wake condition ${i + 1}`); if (e) { return e; } }
    return '';
}

/** As saved on a workflow: an empty set IS the built-in (mechanical), so it is not kept. */
export function setWorkflowWake(w: { wake?: WakeSpec }, v: WakeSpec | undefined): void {
    if (v && v.length) { w.wake = v; } else { delete w.wake; }
}

/** What the page's editor builds itself from. */
export const wakeDictionary = () => ({
    fields: WORKFLOW_DICTIONARY.fields, operators: OPERATORS,
    presets: WAKE_PRESETS.map(p => ({ ...p, conditions: wakePresetConditions(p.id) }))
});

export interface WakeLayers { workflow?: WakeSpec; step?: WakeSpec; run?: WakeSpec; live?: WakeSpec }

/** The conditions in force at one step, and the sentence saying where they came from. */
export function resolveWake(l: WakeLayers): { conditions: WakeSpec; from: string; sentence: string } {
    const r = resolveFlex('workflow.wake', { workflow: l.workflow, step: l.step, run: l.run, live: l.live });
    const conditions = Array.isArray(r.value) ? r.value as WakeSpec : [];
    const mode = wakeMode(conditions);
    return { conditions, from: r.from, sentence: `${mode === 'custom' ? `${conditions.length} condition(s)` : mode} — ${r.sentence.split(' — ').slice(1).join(' — ')}` };
}

export interface EndedStep {
    kind: string; status: string; attempt: number;
    startedAt?: number; endedAt?: number; costUSD?: number;
    verified?: string; runCostUSD: number; assets?: number; output?: string;
}

export function wakeFacts(e: EndedStep): WorkflowFacts {
    return {
        step: {
            kind: e.kind, status: e.status, attempt: e.attempt, costUSD: e.costUSD ?? 0,
            ...(e.startedAt && e.endedAt ? { elapsedMs: e.endedAt - e.startedAt } : {})
        },
        verify: { verdict: e.verified ?? '' },
        run: { costUSD: e.runCostUSD },
        assets: { count: e.assets ?? 0 },
        output: e.output ?? ''
    };
}

/** What fired, in words — the line the wake row and its output carry. */
export function wakeVerdict(conditions: WakeSpec, facts: WorkflowFacts): { fired: string[]; said: string; problems: string[] } {
    const r = evaluateWorkflowConditions(conditions, facts);
    const said = r.fired.map(id => {
        const c = conditions.find(x => String(x.id) === id);
        return c ? `${id} (${conditionWords(c)})` : id;
    }).join(', ');
    return { fired: r.fired, said, problems: r.problems };
}

function conditionWords(c: Condition): string {
    if (Array.isArray(c.all)) { return c.all.map(conditionWords).join(' and '); }
    const o = OPERATORS.find(x => x.id === c.operator);
    return [c.field, o?.label ?? c.operator, o?.takesValue ? String(c.value) : ''].filter(Boolean).join(' ');
}

export function kindOfStep(s: { webhook?: unknown; media?: unknown; browser?: unknown; approval?: unknown; select?: unknown; checkpoint?: unknown }): string {
    return s.checkpoint ? 'checkpoint' : s.webhook ? 'webhook' : s.media ? 'media' : s.browser ? 'browser'
        : s.approval ? 'approval' : s.select ? 'select' : 'agent';
}

/** What the chain was about to do after step `index` (0-based) — the words "proceed" stands for. */
export function mechanicalWords(status: string, index: number, count: number, onFail: 'stop' | 'continue' | number | undefined): string {
    const next = index + 1 < count ? `go on to step ${index + 2}` : 'end the run, complete';
    if (status === 'done') { return next; }
    const f = onFail ?? 'stop';
    return f === 'stop' ? 'stop the run as failed' : f === 'continue' ? next : `jump to step ${f}`;
}

/** The standing instruction a woken supervisor reads — this is not a checkpoint step. */
export function wakeDirective(stepTitle: string, stepNo: number, status: string, said: string, mechanical: string): string {
    return `This is not a checkpoint step: step ${stepNo} ("${stepTitle}") just ended ${status}, and the run's wake conditions fired: ${said}. ` +
        `"proceed" lets the chain do what it was about to do (${mechanical}); retry, jump, insert and stop change it.`;
}
