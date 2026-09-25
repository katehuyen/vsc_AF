/**
 * M-44 — ONE SUPERVISOR PER WORKFLOW RUN, KEPT BETWEEN ITS CHECKPOINTS.
 *
 * A checkpoint (checkpointStep.ts) asks; this is who answers. The run's first
 * turn opens a read-only session (plan mode: it looks, it never writes) seeded
 * with its standing rules; every later checkpoint RESUMES it, so it remembers
 * what it saw and decided. A resume that dies is replaced by a fresh session
 * seeded with a compact ledger of its earlier decisions. Every turn is a
 * ModelAssist on the run, and its cost lands on the checkpoint's own row.
 * Ceilings — calls per run, a soft or hard budget, failures in a row — turn it
 * off for the run, which then goes the mechanical way and says why. A
 * checkpoint whose call a reload cut off is never asked twice. Pure but for
 * the spawn.
 */
import * as cp from 'child_process';
import { ceilingRefusal, softBudgetNote } from './decisionCore';
import { resolveFlex } from './flexResolve';
import { oneShotArgv, oneShotEnv, oneShotEnvelope } from './oneShot';
import type { ModelAssist } from './sentryPrompt';

export type BudgetMode = 'soft' | 'hard';

/** What a workflow says about its supervisor (FarmWorkflow.supervisor); unset = the built-in. */
export interface WorkflowSupervisor {
    model?: string;
    effort?: string;
    account?: string;
    maxCalls?: number;
    budgetUSD?: number;
    budgetMode?: BudgetMode;
    maxFailures?: number;
    timeoutMin?: number;
}

export interface SupervisorLimits {
    /** '' = the judge's model */
    model: string;
    effort: string;
    account: string;
    maxCalls: number;
    /** 0 = no budget */
    budgetUSD: number;
    budgetMode: BudgetMode;
    maxFailures: number;
    timeoutMs: number;
    origin: string;
}

const FIELDS: [keyof WorkflowSupervisor, string][] = [
    ['model', 'model'], ['effort', 'effort'], ['account', 'account'], ['maxCalls', 'maxCalls'], ['budgetUSD', 'budgetUsd'],
    ['budgetMode', 'budgetMode'], ['maxFailures', 'maxFailures'], ['timeoutMin', 'timeoutMin']
];
const orUnset = (v: unknown): unknown => (typeof v === 'string' && !v.trim() ? undefined : v);

/** The run's supervisor limits, each through its flex point `workflow.supervisor.*`. */
export function supervisorRunLimits(ws: WorkflowSupervisor | undefined, live?: Partial<WorkflowSupervisor>): SupervisorLimits {
    const r = Object.fromEntries(FIELDS.map(([k, id]) => [k, resolveFlex(`workflow.supervisor.${id}`, { workflow: orUnset(ws?.[k]), live: orUnset(live?.[k]) })]));
    return {
        model: String(r.model.value ?? ''), effort: String(r.effort.value ?? ''), account: String(r.account.value ?? ''),
        maxCalls: Number(r.maxCalls.value), budgetUSD: Number(r.budgetUSD.value), budgetMode: r.budgetMode.value as BudgetMode,
        maxFailures: Number(r.maxFailures.value), timeoutMs: Number(r.timeoutMin.value) * 60_000,
        origin: FIELDS.map(([k]) => `${k} ${r[k].sentence}`).join(' · ')
    };
}

/** Why a workflow's supervisor settings are refused at save time — '' when sound. */
export function supervisorRunRefusal(ws: WorkflowSupervisor | undefined): string {
    if (ws === undefined) { return ''; }
    if (!ws || typeof ws !== 'object' || Array.isArray(ws)) { return 'supervisor is an object: {model?, effort?, account?, maxCalls?, budgetUSD?, budgetMode?, maxFailures?, timeoutMin?}'; }
    for (const [k, id] of FIELDS) {
        if (ws[k] === undefined || orUnset(ws[k]) === undefined) { continue; }
        const res = resolveFlex(`workflow.supervisor.${id}`, { workflow: ws[k] });
        if (res.ignored.length) { return `supervisor ${k} ${JSON.stringify(ws[k])} is refused — ${res.ignored[0].why}`; }
    }
    const bad = ['model', 'effort', 'account'].find(k => ws[k as 'model'] && !/^[\w.:@\-[\]]{1,80}$/.test(String(ws[k as 'model'])));
    return bad ? `supervisor ${bad} "${String(ws[bad as 'model']).slice(0, 40)}" is not a plain name` : '';
}

/** A workflow's supervisor as saved: empty fields dropped, nothing stated = removed. */
export function setWorkflowSupervisor(w: { supervisor?: WorkflowSupervisor }, ws: WorkflowSupervisor | undefined): void {
    const kept = Object.fromEntries(Object.entries(ws ?? {}).filter(([, v]) => orUnset(v) !== undefined && v !== null));
    if (Object.keys(kept).length) { w.supervisor = kept as WorkflowSupervisor; } else { delete w.supervisor; }
}

/** The workflow form's Supervisor boxes, from the workflow; a blank box is the built-in. */
export function supervisorSeed(ws: WorkflowSupervisor | undefined): Record<string, unknown> {
    return {
        supModel: ws?.model ?? '', supEffort: ws?.effort ?? '', supAccount: ws?.account ?? '', supCalls: ws?.maxCalls ?? '',
        supBudget: ws?.budgetUSD ?? '', supBudgetMode: ws?.budgetMode ?? '', supFailures: ws?.maxFailures ?? '', supTimeout: ws?.timeoutMin ?? ''
    };
}

/** …and back. */
export function supervisorFromDraft(raw: Record<string, unknown>): WorkflowSupervisor {
    const str = (k: string): string => String(raw[k] ?? '').trim();
    const num = (k: string): number | undefined => (str(k) === '' || !Number.isFinite(Number(str(k))) ? undefined : Number(str(k)));
    const ws: WorkflowSupervisor = {};
    if (str('supModel')) { ws.model = str('supModel'); }
    if (str('supEffort')) { ws.effort = str('supEffort'); }
    if (str('supAccount')) { ws.account = str('supAccount'); }
    if (num('supCalls') !== undefined) { ws.maxCalls = num('supCalls'); }
    if (num('supBudget') !== undefined) { ws.budgetUSD = num('supBudget'); }
    if (str('supBudgetMode')) { ws.budgetMode = str('supBudgetMode') as BudgetMode; }
    if (num('supFailures') !== undefined) { ws.maxFailures = num('supFailures'); }
    if (num('supTimeout') !== undefined) { ws.timeoutMin = num('supTimeout'); }
    return ws;
}

/** The run's supervisor, persisted on its record (M-43's decisions + this item's session). */
export interface SupervisorState {
    history: string[];
    retries: Record<string, number>;
    directives: string[];
    sessionId?: string;
    calls?: number;
    costUSD?: number;
    failures?: number;
    /** set = the supervisor is off for this run, and why */
    off?: string;
    assists?: ModelAssist[];
    visits?: Record<string, number>;
    /** the checkpoint visit whose call is in flight (`<step>#<n>`) */
    inFlight?: string;
}

export const ASSIST_KEEP = 20;

/** Why no further supervisor call is made on this run — '' = one may be made. */
export function turnRefusal(s: SupervisorState, lim: SupervisorLimits): string {
    if (s.off) { return s.off; }
    return ceilingRefusal({ calls: s.calls ?? 0, maxCalls: lim.maxCalls, spentUSD: s.costUSD ?? 0, budgetUSD: lim.budgetUSD, budgetMode: lim.budgetMode, per: 'run' });
}

/** A soft budget passed: said on the row, never enforced. */
export function softNote(s: SupervisorState, lim: SupervisorLimits): string {
    return softBudgetNote({ spentUSD: s.costUSD ?? 0, budgetUSD: lim.budgetUSD, budgetMode: lim.budgetMode });
}

/** One turn onto the run: counted, costed, kept as a ModelAssist; failures in a row turn the supervisor off. */
export function recordTurn(s: SupervisorState, t: { ok: boolean; costUSD?: number; ms: number; model: string; account?: string; note?: string },
    lim: SupervisorLimits, now: number): SupervisorState {
    const failures = t.ok ? 0 : (s.failures ?? 0) + 1;
    const assist: ModelAssist = {
        model: t.model || '(default)', ...(t.account ? { account: t.account } : {}), ms: t.ms, costUsd: t.costUSD ?? 0, at: now, ok: t.ok,
        ...(t.note ? { note: t.note.slice(0, 200) } : {})
    };
    return {
        ...s, calls: (s.calls ?? 0) + 1, costUSD: (s.costUSD ?? 0) + (t.costUSD ?? 0), failures,
        assists: [...(s.assists ?? []), assist].slice(-ASSIST_KEEP),
        ...(failures >= lim.maxFailures && !s.off
            ? { off: `${failures} supervisor call${failures === 1 ? '' : 's'} failed in a row — it is off for this run, which goes the mechanical way` } : {})
    };
}

/** The visit of a checkpoint this entry is: a new one, or — when a reload cut its call off — the same one again. */
export function enterVisit(s: SupervisorState, stepKey: string): { state: SupervisorState; key: string; cutOff: boolean } {
    if (s.inFlight && s.inFlight.startsWith(`${stepKey}#`)) { return { state: s, key: s.inFlight, cutOff: true }; }
    const n = (s.visits?.[stepKey] ?? 0) + 1;
    const key = `${stepKey}#${n}`;
    return { state: { ...s, visits: { ...s.visits, [stepKey]: n }, inFlight: key }, key, cutOff: false };
}

export const CUT_OFF = 'a reload cut this checkpoint\'s supervisor call off — the run carries on rather than paying for the same checkpoint twice';

/** The first message of a FRESH session: its standing rules and a compact ledger of what it decided before. */
export function seedPrompt(brief: string, history: readonly string[]): string {
    return [
        'You supervise ONE workflow run. At each of its checkpoints you are shown the run and answer with one JSON decision. You read and plan only: you never write files or run commands. Later checkpoints of the same run come to you in this conversation.',
        ...(history.length ? [`Your earlier decisions on this run, oldest first: ${history.join(' · ')}`] : []),
        brief
    ].join('\n\n');
}

export interface SessionAnswer { ok: boolean; raw: string; sessionId?: string; costUSD?: number; error?: string }
export type SessionCall = (prompt: string, o: { resume?: string; model: string; effort: string; account: string; timeoutMs: number }) => Promise<SessionAnswer>;

/** One supervisor turn through the run's session: gated, seeded or resumed, re-seeded once when a resume dies, recorded. */
export async function sessionTurn(s: SupervisorState, lim: SupervisorLimits, prompt: string, model: string,
    call: SessionCall, now: () => number): Promise<{ state: SupervisorState; out: string; error?: string }> {
    const no = turnRefusal(s, lim);
    if (no) { return { state: s, out: '', error: no }; }
    const o = { model, effort: lim.effort, account: lim.account, timeoutMs: lim.timeoutMs };
    const t0 = now();
    let st = s;
    let r = await call(s.sessionId ? prompt : seedPrompt(prompt, s.history), { ...o, ...(s.sessionId ? { resume: s.sessionId } : {}) });
    let note = '';
    if (!r.ok && s.sessionId) {
        note = `the session could not be resumed (${(r.error ?? '').slice(0, 80)}); a fresh one was seeded with the ledger`;
        st = { ...st, sessionId: undefined };
        r = await call(seedPrompt(prompt, s.history), o);
    }
    st = recordTurn(st, { ok: r.ok, costUSD: r.costUSD, ms: now() - t0, model, account: lim.account, note: r.ok ? note : r.error }, lim, now());
    if (r.ok && r.sessionId) { st = { ...st, sessionId: r.sessionId }; }
    return { state: st, out: r.ok ? r.raw : '', ...(r.ok ? {} : { error: r.error || 'the supervisor call failed' }) };
}

/**
 * ‼️ THE SUPERVISOR NEEDS NO TOOLS, NO MCP SERVERS AND NOT CLAUDE CODE'S OWN SYSTEM PROMPT —
 * it reads the brief and answers. Measured on haiku, one checkpoint turn: $0.153 with them,
 * $0.0104 (2,426 cached tokens) without. `--bare` would cut more but never reads OAuth.
 */
export const SUPERVISOR_SYSTEM = 'You supervise one workflow run at its checkpoints. You have no tools: read what you are shown and answer with the one JSON object asked for.';
const LEAN = ['--tools', '', '--strict-mcp-config', '--system-prompt', SUPERVISOR_SYSTEM];
/** On Windows the vector is joined by a shell: an empty or spaced argument is quoted (these are our own constants). */
const shellArg = (a: string): string => (process.platform !== 'win32' ? a : a === '' ? '""' : /\s/.test(a) ? `"${a}"` : a);

/** The real call: a lean, read-only claude turn, the prompt on stdin, resumed when there is a session. */
export function spawnSessionCall(cwd: string, spawn: typeof cp.spawn = cp.spawn): SessionCall {
    return (prompt, o) => new Promise(resolve => {
        const argv = oneShotArgv({
            engine: 'claude', json: true, readOnly: true, ...(o.model ? { model: o.model } : {}),
            ...(o.effort ? { effort: o.effort } : {}), ...(o.resume ? { resume: o.resume } : {})
        });
        if (!argv) { resolve({ ok: false, raw: '', error: 'claude has no one-shot turn here' }); return; }
        argv.args = [...argv.args.slice(0, -1), ...LEAN, ...argv.args.slice(-1)].map(shellArg);
        let done = false;
        const finish = (a: SessionAnswer): void => { if (!done) { done = true; resolve(a); } };
        let child: cp.ChildProcess;
        try {
            child = spawn(argv.cmd, argv.args, {
                cwd, windowsHide: true, shell: process.platform === 'win32',
                env: oneShotEnv({ engine: 'claude', ...(o.account ? { account: o.account } : {}) })
            });
        } catch (e) { finish({ ok: false, raw: '', error: String((e as Error)?.message ?? e) }); return; }
        const timer = setTimeout(() => {
            try {
                if (process.platform === 'win32' && child.pid) {
                    cp.execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => { /* best effort */ });
                } else { child.kill(); }
            } catch { /* gone */ }
            finish({ ok: false, raw: '', error: `the supervisor passed its ${Math.round(o.timeoutMs / 60_000)}-minute ceiling and was cut` });
        }, o.timeoutMs);
        let out = '', err = '';
        child.stdout?.on('data', b => { out += String(b); });
        child.stderr?.on('data', b => { err += String(b); });
        child.on('error', e => { clearTimeout(timer); finish({ ok: false, raw: '', error: String(e?.message ?? e) }); });
        child.on('close', () => {
            clearTimeout(timer);
            const env = oneShotEnvelope('claude', out);
            if (!env) { finish({ ok: false, raw: '', error: (err.trim() || out.trim() || 'no output').slice(0, 200) }); return; }
            finish({
                ok: !env.isError, raw: env.result, ...(env.sessionId ? { sessionId: env.sessionId } : {}),
                ...(env.costUSD ? { costUSD: env.costUSD } : {}),
                ...(env.isError ? { error: `the engine reported an error (${env.subtype ?? 'unknown'})` } : {})
            });
        });
        child.stdin?.end(prompt);
    });
}
