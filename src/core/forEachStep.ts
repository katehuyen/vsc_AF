/**
 * M-40 — ONE STEP, RUN ONCE PER ELEMENT OF A LIST (fan-out as wide as the list).
 *
 * A step with `forEach` names a list it reads off the run — an earlier step's
 * JSON array (`{steps.split.json.parts}`), the previous step's
 * (`{prev_json.parts}`), a text of one item per line (`{steps.s1.text}`) or an
 * input (`{input.files}`). Every element becomes a branch whose prompt sees
 * `{item}` / `{item.a.b}` / `{index}` (0-based); the fan-in hands the next step
 * every branch in list order as `json.items[]`. The state lives on the run
 * record, so a reload resumes only the branches that had not finished.
 * Pure: no vscode, no fs.
 */
import { resolveFlex } from './flexResolve';
import { pick, RunBoard, show } from './runContext';

export type BranchFail = 'continue' | 'drop';
export type CapMode = 'soft' | 'hard';

export interface ForEachSpec {
    /** where the list is: {steps.<id>.json.path} · {steps.<id>.text} · {prev_json.path} · {prev_text} · {input.name} */
    list: string;
    concurrency?: number;
    onBranchFail?: BranchFail;
    retries?: number;
    cap?: number;
    capMode?: CapMode;
    budgetUSD?: number;
}

export interface ForEachPolicy {
    concurrency: number; onBranchFail: BranchFail; retries: number;
    cap: number; capMode: CapMode; budgetUSD: number;
    /** one sentence per point: which value and where it came from */
    origin: string;
}

export interface ForEachBranch {
    index: number;
    item: unknown;
    status: 'waiting' | 'running' | 'done' | 'failed';
    attempts: number;
    taskId?: string;
    text?: string; json?: unknown; file?: string; costUSD?: number; reason?: string;
}

export interface ForEachRun {
    stepIndex: number;
    policy: ForEachPolicy;
    /** the list's own length, before the cap */
    total: number;
    branches: ForEachBranch[];
    dropped?: string;
}

const POLICY_FIELDS = [['concurrency', 'concurrency'], ['onBranchFail', 'onBranchFail'], ['retries', 'retries'],
    ['cap', 'cap'], ['capMode', 'capMode'], ['budgetUSD', 'budgetUsd']] as const;

export const LIST_REF = /^\{(?:steps\.([A-Za-z][\w-]*)\.(text|json(?:\.[\w.]+)?)|prev_json(?:\.([\w.]+))?|(prev_text)|input\.([\w-]+))\}$/;

export function forEachPolicy(spec: ForEachSpec): ForEachPolicy {
    const r = (id: string, v: unknown) => resolveFlex(`foreach.${id}`, { step: v });
    const c = r('concurrency', spec.concurrency), f = r('onBranchFail', spec.onBranchFail),
        n = r('retries', spec.retries), cap = r('cap', spec.cap), m = r('capMode', spec.capMode),
        b = r('budgetUsd', spec.budgetUSD);
    return {
        concurrency: Number(c.value), onBranchFail: f.value as BranchFail, retries: Number(n.value),
        cap: Number(cap.value), capMode: m.value as CapMode, budgetUSD: Number(b.value),
        origin: [`concurrency ${c.sentence}`, `a failed branch ${f.sentence}`, `retries ${n.sentence}`,
            `cap ${cap.sentence}`, `over the cap ${m.sentence}`, `branch budget ${b.sentence}`].join(' · ')
    };
}

/** Why a step's forEach is refused at save — '' when it is fine. */
export function forEachRefusal(step: { forEach?: ForEachSpec; parallel?: boolean }, earlierIds: readonly string[]): string {
    const fe = step.forEach;
    if (!fe) { return ''; }
    const m = LIST_REF.exec(String(fe.list ?? '').trim());
    if (!m) { return `"for each" needs one list reference — {steps.<id>.json.x}, {steps.<id>.text}, {prev_json.x}, {prev_text} or {input.x}; got "${fe.list ?? ''}".`; }
    if (m[1] && !earlierIds.includes(m[1])) { return `"for each" reads step "${m[1]}", which does not run before this one.`; }
    if (step.parallel) { return 'A "for each" step already fans out; it cannot also be part of a parallel group.'; }
    for (const [k, id] of POLICY_FIELDS) {
        if (fe[k] === undefined) { continue; }
        const r = resolveFlex(`foreach.${id}`, { step: fe[k] });
        if (r.ignored.length) { return `"for each" ${k} ${JSON.stringify(fe[k])} is refused — ${r.ignored[0].why}`; }
    }
    return '';
}

export interface ListSource { board?: RunBoard; prevText?: string; prevJson?: unknown; inputs?: Record<string, string> }

/** A value read as a list: an array, a JSON array in a string, else one item per non-empty line. */
export function asList(v: unknown): unknown[] | null {
    if (Array.isArray(v)) { return v; }
    if (typeof v !== 'string') { return null; }
    const s = v.trim();
    if (!s) { return []; }
    if (s.startsWith('[')) { try { const j = JSON.parse(s); if (Array.isArray(j)) { return j; } } catch { /* lines */ } }
    return s.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
}

export function resolveList(ref: string, src: ListSource): { items: unknown[] } | { error: string } {
    const m = LIST_REF.exec(String(ref ?? '').trim());
    if (!m) { return { error: `"${ref}" is not a list reference` }; }
    let v: unknown;
    if (m[1]) {
        const s = src.board?.steps[m[1]];
        if (!s) { return { error: `step "${m[1]}" is not on the run's board — it has not finished` }; }
        v = m[2] === 'text' ? s.text : m[2] === 'json' ? s.json : pick(s.json, m[2].slice(5));
    } else if (m[4]) { v = src.prevText; }
    else if (m[5]) { v = src.inputs?.[m[5]]; }
    else { v = m[3] ? pick(src.prevJson, m[3]) : src.prevJson; }
    const list = asList(v);
    return list ? { items: list } : { error: `${ref} is not a list (${v === undefined ? 'empty' : typeof v})` };
}

export function planForEach(items: unknown[], policy: ForEachPolicy, stepIndex: number): { run: ForEachRun } | { refusal: string } {
    if (items.length > policy.cap && policy.capMode === 'hard') {
        return { refusal: `the list has ${items.length} items and the cap is ${policy.cap} (hard)` };
    }
    const kept = items.slice(0, policy.cap);
    return {
        run: {
            stepIndex, policy, total: items.length,
            branches: kept.map((item, index) => ({ index, item, status: 'waiting', attempts: 0 }))
        }
    };
}

/** A run cut by a reload: what was running goes back to waiting, and that attempt is not counted. */
export function resumeForEach(run: ForEachRun): ForEachRun {
    for (const b of run.branches) {
        if (b.status === 'running') { b.status = 'waiting'; b.attempts = Math.max(0, b.attempts - 1); delete b.taskId; }
    }
    return run;
}

/** Which waiting branches to start now, within the concurrency. */
export function launchable(run: ForEachRun): number[] {
    if (run.dropped) { return []; }
    const free = Math.max(0, run.policy.concurrency - run.branches.filter(b => b.status === 'running').length);
    return run.branches.filter(b => b.status === 'waiting').slice(0, free).map(b => b.index);
}

export function markLaunched(run: ForEachRun, index: number, taskId?: string): void {
    const b = run.branches[index];
    b.status = 'running';
    b.attempts++;
    if (taskId) { b.taskId = taskId; } else { delete b.taskId; }
}

export interface BranchOutcome { ok: boolean; text?: string; json?: unknown; file?: string; costUSD?: number; reason?: string }
export type BranchNext = 'launch' | 'done' | 'dropped';

/** One branch ended: retry it, keep going, finish the fan-in, or drop the whole step. */
export function branchEnded(run: ForEachRun, index: number, o: BranchOutcome): BranchNext {
    const b = run.branches[index];
    const over = o.ok && run.policy.budgetUSD > 0 && (o.costUSD ?? 0) > run.policy.budgetUSD;
    Object.assign(b, {
        ...(o.text !== undefined ? { text: o.text } : {}), ...(o.json !== undefined ? { json: o.json } : {}),
        ...(o.file ? { file: o.file } : {}), ...(o.costUSD ? { costUSD: o.costUSD } : {})
    });
    if (o.ok && !over) {
        b.status = 'done';
        delete b.reason;
    } else {
        b.reason = over ? `spent $${(o.costUSD ?? 0).toFixed(2)} of its $${run.policy.budgetUSD.toFixed(2)} budget` : (o.reason || 'failed');
        if (b.attempts <= run.policy.retries) {
            b.status = 'waiting';
        } else {
            b.status = 'failed';
            if (run.policy.onBranchFail === 'drop') {
                run.dropped = `branch ${index + 1}/${run.branches.length} failed — ${b.reason}`;
                return 'dropped';
            }
        }
    }
    return run.branches.every(x => x.status === 'done' || x.status === 'failed') ? 'done' : 'launch';
}

/** `{item}` `{item.a.b}` `{index}` filled for one branch. */
export function fillItem(text: string, item: unknown, index: number): string {
    if (!text || (text.indexOf('{item') < 0 && text.indexOf('{index}') < 0)) { return text; }
    return text.replace(/\{item(?:\.([\w.]+))?\}|\{index\}/g, (m, path: string | undefined) =>
        m === '{index}' ? String(index) : show(path ? pick(item, path) : item));
}

/** The fan-in: every branch in list order, as text and as `json.items[]`. */
export function fanIn(run: ForEachRun, title: string): { text: string; json: { items: unknown[]; total: number; capped?: number } } {
    const n = run.branches.length;
    const text = run.branches.map(b => b.status === 'done'
        ? `## ${title} [${b.index + 1}/${n}]\n${b.text ?? ''}`
        : `## ${title} [${b.index + 1}/${n}] — ${b.status === 'failed' ? `failed: ${b.reason ?? ''}` : 'not run'}`).join('\n\n');
    const items = run.branches.map(b => ({
        index: b.index, item: b.item, status: b.status,
        ...(b.text !== undefined ? { text: b.text } : {}), ...(b.json !== undefined ? { json: b.json } : {}),
        ...(b.file ? { file: b.file } : {}), ...(b.reason ? { reason: b.reason } : {})
    }));
    return { text, json: { items, total: run.total, ...(run.total > n ? { capped: n } : {}) } };
}

/** What the bridge and the run card say about a fan-out in flight. */
export function forEachSummary(run: ForEachRun): Record<string, unknown> {
    const count = (s: ForEachBranch['status']) => run.branches.filter(b => b.status === s).length;
    return {
        step: run.stepIndex + 1, total: run.total, branches: run.branches.length,
        done: count('done'), failed: count('failed'), running: count('running'), waiting: count('waiting'),
        cost: run.branches.reduce((a, b) => a + (b.costUSD ?? 0), 0),
        ...(run.dropped ? { dropped: run.dropped } : {}), policy: run.policy.origin
    };
}
