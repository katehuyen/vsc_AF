import * as fs from 'fs';
import { expandDeep, PortableRoot, tokenizeDeep } from './portablePaths';
import { extractJson, tryParseJson } from './util';

/**
 * Missions — dynamic multi-agent orchestration (design: raporlar/2026-07-17).
 *
 * A mission = a goal + a LEAD agent + a TEAM + hard limits. The extension runs
 * a planner loop: each ROUND the lead agent is called headlessly and returns a
 * JSON decision — delegate work to team agents (run as ordinary FarmTasks),
 * ask the user a question, or finish. Results are fed back into the SAME
 * planner session (`claude -p --resume`), so the lead keeps its context; an
 * extension-side ledger is the fallback when resume dies.
 *
 * Unlike a workflow (a pre-drawn DAG), the next step here is decided at run
 * time from the previous results. Everything cost-shaped is fenced by
 * mechanical limits — never left to the model's goodwill.
 *
 * This module is pure (no vscode): data model, decision parsing, prompt
 * builders, wave planning, budget guards, the engine loop with injectable
 * deps, and the JSON store. The extension supplies process spawning, task
 * execution and UI.
 */

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

export type MissionApprovalMode = 'each-round' | 'auto';

export interface MissionTeamMember {
    agentId: string;
    agentName: string;
    /** Free-text role hint shown to the planner ("coder", "reviewer"…). */
    role?: string;
    /** Optional model override for THIS member's delegations; empty = the
     *  agent's own model chain / model policy. */
    model?: string;
}

export interface MissionLimits {
    maxRounds: number;
    maxTasks: number;
    maxCostUSD: number;
    maxMinutes: number;
    maxParallel: number;
}

export const DEFAULT_MISSION_LIMITS: MissionLimits = {
    maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxMinutes: 120, maxParallel: 2
};

export interface MissionSpec {
    id: string;
    title: string;
    goal: string;
    leadAgentId: string;
    leadAgentName: string;
    team: MissionTeamMember[];
    /** Target repo/folder; becomes every delegation's FarmTask.workDir. */
    workdir?: string;
    /** Optional model override for PLANNER calls only (delegates keep their own
     *  policies) — smart model plans, cheap models execute. */
    plannerModel?: string;
    limits: MissionLimits;
    approvalMode: MissionApprovalMode;
    createdAt: number;
}

export type MissionStepStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface MissionStep {
    id: string;
    round: number;
    agentId: string;
    agentName: string;
    title: string;
    prompt: string;
    /** Planner's success criteria for the delegate (rides along in the prompt). */
    expect?: string;
    /** Planner marks reads-only work; governs the parallel-write rule. */
    readonly?: boolean;
    taskId?: string;
    status: MissionStepStatus;
    costUSD?: number;
    /** Total tokens of the delegate's session (attached when cost attribution matches). */
    tokens?: number;
    outputFile?: string;
    note?: string;
}

export type MissionAction = 'delegate' | 'finish' | 'ask_user' | 'abort';

export interface MissionRound {
    n: number;
    thought: string;
    action: MissionAction;
    steps: MissionStep[];
    question?: string;
    answer?: string;
    /** Set when the user rejected this round's delegations. */
    rejectedReason?: string;
    plannerCostUSD: number;
    /** Total tokens of the planner call that produced this round. */
    plannerTokens?: number;
    at: number;
}

export type MissionRunStatus =
    | 'running' | 'waiting-approval' | 'waiting-user'
    | 'paused' | 'done' | 'failed' | 'cancelled';

export interface MissionResult {
    verdict: 'success' | 'partial' | 'failed';
    summary: string;
}

export interface MissionRun {
    id: string;
    specId: string;
    status: MissionRunStatus;
    /** Planner continuity: each round resumes this headless session. */
    plannerSessionId?: string;
    rounds: MissionRound[];
    /** 1-2 compact lines per round — resume-fallback material + UI history. */
    ledger: string[];
    totalCostUSD: number;
    startedAt: number;
    endedAt?: number;
    /** Milliseconds spent waiting on the user — excluded from the wall clock. */
    waitedMs?: number;
    /** Live activity strip: what the engine is doing right now (planning /
     *  running a wave / waiting). Cleared when the run settles. */
    now?: { what: string; since: number };
    /** Pause was clicked but the current activity is still finishing — the UI
     *  shows the button pressed; clicking again withdraws the request. */
    pausePending?: boolean;
    result?: MissionResult;
    note?: string;
}

export function newMissionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------------------------------------------------------------------------
// planner decision
// ---------------------------------------------------------------------------

export interface PlannerTaskReq {
    agent: string;
    title: string;
    prompt: string;
    expect?: string;
    readonly?: boolean;
}

export type PlannerDecision =
    | { action: 'delegate'; thought: string; tasks: PlannerTaskReq[] }
    | { action: 'finish'; thought: string; verdict: MissionResult['verdict']; summary: string }
    | { action: 'abort'; thought: string; verdict: MissionResult['verdict']; summary: string }
    | { action: 'ask_user'; thought: string; question: string };

const MAX_TASKS_PER_ROUND = 6;
const MAX_PROMPT_CHARS = 8000;

/** Validate the planner's raw reply into a decision, or say exactly why not
 *  (the error text is fed back to the planner — write it for the model). */
export function parsePlannerDecision(
    raw: string, spec: MissionSpec
): { ok: true; decision: PlannerDecision } | { ok: false; error: string } {
    const j = extractJson(raw ?? '');
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
        return { ok: false, error: 'reply is not a JSON object' };
    }
    const o = j as Record<string, unknown>;
    const thought = typeof o.thought === 'string' ? o.thought.slice(0, 600) : '';
    const action = String(o.action ?? '');
    if (action === 'finish' || action === 'abort') {
        const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
        if (!summary) { return { ok: false, error: `"${action}" needs a non-empty "summary"` }; }
        const v = String(o.verdict ?? '');
        const verdict: MissionResult['verdict'] =
            v === 'success' || v === 'partial' || v === 'failed'
                ? v
                : (action === 'finish' ? 'partial' : 'failed'); // tolerant default
        return {
            ok: true,
            decision: action === 'finish'
                ? { action: 'finish', thought, verdict, summary }
                : { action: 'abort', thought, verdict, summary }
        };
    }
    if (action === 'ask_user') {
        const question = typeof o.question === 'string' ? o.question.trim() : '';
        if (!question) { return { ok: false, error: '"ask_user" needs a non-empty "question"' }; }
        return { ok: true, decision: { action, thought, question } };
    }
    if (action === 'delegate') {
        if (!Array.isArray(o.tasks) || !o.tasks.length) {
            return { ok: false, error: '"delegate" needs a non-empty "tasks" array' };
        }
        if (o.tasks.length > MAX_TASKS_PER_ROUND) {
            return { ok: false, error: `too many tasks in one round (max ${MAX_TASKS_PER_ROUND})` };
        }
        const names = new Map(spec.team.map(m => [m.agentName.toLowerCase(), m.agentName]));
        const tasks: PlannerTaskReq[] = [];
        for (const t of o.tasks as Record<string, unknown>[]) {
            const agentRaw = String(t?.agent ?? '').trim();
            const agent = names.get(agentRaw.toLowerCase());
            if (!agent) {
                return {
                    ok: false,
                    error: `unknown agent "${agentRaw}" — the team is: ${spec.team.map(m => m.agentName).join(', ')}`
                };
            }
            const title = typeof t.title === 'string' ? t.title.trim().slice(0, 120) : '';
            const prompt = typeof t.prompt === 'string' ? t.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
            if (!title || !prompt) { return { ok: false, error: 'every task needs a non-empty "title" and "prompt"' }; }
            tasks.push({
                agent, title, prompt,
                expect: typeof t.expect === 'string' ? t.expect.trim().slice(0, 400) : undefined,
                readonly: t.readonly === true
            });
        }
        return { ok: true, decision: { action, thought, tasks } };
    }
    return { ok: false, error: `unknown "action": "${action}" (use delegate | finish | ask_user | abort)` };
}

// ---------------------------------------------------------------------------
// prompts
// ---------------------------------------------------------------------------

export interface RemainingBudget { rounds: number; tasks: number; costUSD: number; minutes: number }

export function remainingBudget(spec: MissionSpec, run: MissionRun, now: number): RemainingBudget {
    const spentTasks = run.rounds.reduce((a, r) => a + r.steps.length, 0);
    const elapsedMin = (now - run.startedAt - (run.waitedMs ?? 0)) / 60_000;
    return {
        rounds: spec.limits.maxRounds - run.rounds.length,
        tasks: spec.limits.maxTasks - spentTasks,
        costUSD: Math.round((spec.limits.maxCostUSD - run.totalCostUSD) * 100) / 100,
        minutes: Math.round(spec.limits.maxMinutes - elapsedMin)
    };
}

/** Non-null when some limit is exhausted — the next round is finish-only. */
export function guardReason(rem: RemainingBudget): string | null {
    if (rem.costUSD <= 0) { return `the cost budget is spent (${rem.costUSD} USD left)`; }
    if (rem.rounds <= 0) { return 'the round limit is reached'; }
    if (rem.tasks <= 0) { return 'the task limit is reached'; }
    if (rem.minutes <= 0) { return 'the time limit is reached'; }
    return null;
}

const DECISION_SCHEMA = `Reply with ONLY one JSON object (no prose around it):
{
  "thought": "one short sentence on your reasoning",
  "action": "delegate" | "finish" | "ask_user" | "abort",
  "tasks": [ { "agent": "<team agent name>", "title": "...", "prompt": "full self-contained instructions for that agent", "expect": "how to tell it succeeded", "readonly": true|false } ],
  "question": "only for ask_user",
  "verdict": "success" | "partial" | "failed",  "summary": "only for finish/abort — what was achieved, what remains"
}
Rules:
- You are the PLANNER, not the worker. NEVER do the mission's work yourself — do not edit files, run builds or produce the deliverable. Your entire output is the JSON decision; all work happens through delegations. (Write-tools are disabled for you.)
- Scale your effort to the goal. A small, clear goal deserves a small plan: often ONE round with one delegation, then finish. Do not research, explore or read beyond what the next decision strictly needs — deep digging is itself a delegation ("readonly": true).
- Delegate ONLY to the team agents listed above, by exact name.
- Each task prompt must be self-contained: the delegate sees nothing but that prompt (plus its own instructions). Include paths, context and acceptance criteria.
- Mark a task "readonly": true when it does not modify the working folder (research, review, reading tests' output). Writers must be "readonly": false.
- Never delegate the same prompt to the same agent twice.
- Mind the remaining budget; prefer finishing with a partial result over burning it.`;

function remLine(rem: RemainingBudget): string {
    return `Remaining budget: ${rem.rounds} round(s), ${rem.tasks} task(s), $${rem.costUSD.toFixed(2)}, ~${rem.minutes} min.`;
}

export interface TeamHint { name: string; role?: string; hint?: string }

export function buildBriefing(spec: MissionSpec, hints: TeamHint[], rem: RemainingBudget): string {
    const team = hints.map(h =>
        `- ${h.name}${h.role ? ` (${h.role})` : ''}${h.hint ? ` — ${h.hint}` : ''}`).join('\n');
    return `You are the LEAD of a mission. You do not do the work yourself — you plan, delegate to your team round by round, judge their results, and finish with an honest summary.

## Mission
${spec.goal.trim()}
${spec.workdir ? `\nWorking folder (delegates run inside it): ${spec.workdir}` : ''}

## Team
${team}

## Budget
${remLine(rem)}
Each round you will receive the delegates' results and the updated budget.

## How to answer
${DECISION_SCHEMA}`;
}

export interface StepResult {
    step: MissionStep;
    excerpt: string;
    durationMin?: number;
}

/** One hook event as the Missions page's live-activity feed sees it —
 *  structurally a subset of live.ts's LiveEvent, kept separate so this module
 *  stays UI-framework-free and unit-testable. */
export interface MissionLiveEvent {
    ts: number;
    agentId?: string;
    agentName?: string;
    kind: string;
    tool?: string;
    detail?: string;
    transcriptPath?: string;
}

/** Mission-scoped slice of the global live-event stream: only the given agents,
 *  only since the run started, capped to the newest `cap` events. Pure — the
 *  extension host feeds it live.events(), tests feed it arrays. */
export function missionLiveSlice(
    events: MissionLiveEvent[], agentIds: Set<string>, since: number, cap = 60
): MissionLiveEvent[] {
    const hit = events.filter(e => e.ts >= since && !!e.agentId && agentIds.has(e.agentId));
    return hit.length > cap ? hit.slice(-cap) : hit;
}

/** Head+tail excerpt so huge outputs stay bounded but keep the ending (verdicts live there). */
export function outputExcerpt(body: string, head = 2000, tail = 1500): string {
    const t = body.trim();
    if (t.length <= head + tail + 40) { return t; }
    return t.slice(0, head) + `\n… [${t.length - head - tail} chars omitted] …\n` + t.slice(-tail);
}

export function buildRoundMessage(results: StepResult[], rem: RemainingBudget, notes: string[] = []): string {
    const parts = results.map(r => {
        const s = r.step;
        const cost = s.costUSD !== undefined ? ` · $${s.costUSD.toFixed(2)}` : '';
        const dur = r.durationMin !== undefined ? ` · ${r.durationMin}m` : '';
        return `### ${s.agentName} — "${s.title}" → ${s.status.toUpperCase()}${cost}${dur}${s.note ? ` (${s.note})` : ''}
${s.expect ? `Expected: ${s.expect}\n` : ''}${r.excerpt ? `Output (excerpt):\n${r.excerpt}` : '(no output)'}
${s.outputFile ? `Full output file: ${s.outputFile}` : ''}`;
    });
    return `## Round results
${parts.join('\n\n')}
${notes.length ? '\n## Notes\n' + notes.map(n => `- ${n}`).join('\n') : ''}
${remLine(rem)}
Decide the next round. ${'Reply with ONLY the JSON decision object.'}`;
}

export function finishOnlyNote(reason: string): string {
    return `\nIMPORTANT: ${reason} — "delegate" is no longer allowed. Reply with "finish" (or "abort"), an honest verdict and a summary of what was and was not achieved.`;
}

export function buildResumeMessage(
    run: MissionRun, results: StepResult[], rem: RemainingBudget,
    head = 'The mission was interrupted (window reload) and has been resumed.'
): string {
    if (!results.length) {
        return `${head} No delegations were pending. ${remLine(rem)}\nDecide the next round. Reply with ONLY the JSON decision object.`;
    }
    return head + '\n\n' + buildRoundMessage(results, rem, ['statuses reflect the state after the interruption']);
}

/** Compact one-liner per round — the ledger is the resume fallback. */
export function ledgerLine(round: MissionRound): string {
    if (round.action === 'delegate') {
        const steps = round.steps.map(s =>
            `${s.agentName}:"${s.title}"(${s.status}${s.costUSD !== undefined ? `,$${s.costUSD.toFixed(2)}` : ''})`).join(' · ');
        return `R${round.n} delegate — ${steps}${round.rejectedReason ? ` [${round.rejectedReason}]` : ''}`;
    }
    if (round.action === 'ask_user') {
        return `R${round.n} ask_user — Q: ${round.question?.slice(0, 120) ?? ''} A: ${round.answer?.slice(0, 120) ?? '(pending)'}`;
    }
    return `R${round.n} ${round.action} — ${round.thought.slice(0, 140)}`;
}

// ---------------------------------------------------------------------------
// wave planning (the parallel-write rule)
// ---------------------------------------------------------------------------

/**
 * Split one round's tasks into sequential WAVES of parallel work.
 * Without a workdir: plain chunks of maxParallel. With a workdir: a wave holds
 * at most ONE writer (readonly !== true) — two agents writing the same folder
 * concurrently is the classic disaster; readonly work fills the wave up to
 * maxParallel.
 */
export function planWaves(tasks: PlannerTaskReq[], hasWorkdir: boolean, maxParallel: number): PlannerTaskReq[][] {
    const cap = Math.max(1, maxParallel);
    const waves: PlannerTaskReq[][] = [];
    let wave: PlannerTaskReq[] = [];
    let waveHasWriter = false;
    for (const t of tasks) {
        const writer = hasWorkdir && t.readonly !== true;
        if (wave.length >= cap || (writer && waveHasWriter)) {
            waves.push(wave);
            wave = [];
            waveHasWriter = false;
        }
        wave.push(t);
        waveHasWriter = waveHasWriter || writer;
    }
    if (wave.length) { waves.push(wave); }
    return waves;
}

/** Loop lock key: the same work sent to the same agent again is a planning loop. */
export function dupKey(agent: string, prompt: string): string {
    return agent.toLowerCase() + '|' + prompt.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 400);
}

/**
 * Parse `claude -p --output-format json` stdout: the result envelope carries
 * the reply text plus session_id (planner continuity) and total_cost_usd.
 * Tolerates leading noise lines; null = not an envelope at all.
 */
export function parsePlannerEnvelope(stdout: string): {
    result: string; sessionId?: string; costUSD?: number; tokens?: number; isError: boolean; subtype?: string;
} | null {
    const asObj = (s: string): Record<string, unknown> | undefined => {
        const j = tryParseJson(s);
        return j && typeof j === 'object' && !Array.isArray(j) ? j as Record<string, unknown> : undefined;
    };
    let o = asObj(stdout.trim());
    if (!o || typeof o.result !== 'string') {
        const lines = stdout.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const c = asObj(lines[i].trim());
            if (c && typeof c.result === 'string') { o = c; break; }
        }
    }
    if (!o || typeof o.result !== 'string') { return null; }
    // usage: {input_tokens, output_tokens, cache_*_input_tokens} — sum = call total
    let tokens: number | undefined;
    if (o.usage && typeof o.usage === 'object') {
        const u = o.usage as Record<string, unknown>;
        const n = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
            .reduce((a, k) => a + (typeof u[k] === 'number' ? u[k] as number : 0), 0);
        if (n > 0) { tokens = n; }
    }
    return {
        result: o.result,
        sessionId: typeof o.session_id === 'string' ? o.session_id : undefined,
        costUSD: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
        tokens,
        isError: o.is_error === true || (typeof o.subtype === 'string' && o.subtype.startsWith('error')),
        subtype: typeof o.subtype === 'string' ? o.subtype : undefined
    };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

const MAX_STORED_RUNS = 40;
const MAX_STORED_SPECS = 100;

export class MissionStore {
    specs: MissionSpec[] = [];
    runs: MissionRun[] = [];

    /** portableRoots: saved strings carry ${claudeDir}/${globalStorage}/${home}
     *  tokens instead of machine paths — the git-synced store travels. */
    constructor(private file: string, private portableRoots: () => PortableRoot[] = () => []) { }

    load(): void {
        try {
            const raw = expandDeep(
                JSON.parse(fs.readFileSync(this.file, 'utf8')) as { specs?: MissionSpec[]; runs?: MissionRun[] },
                this.portableRoots());
            this.specs = Array.isArray(raw.specs) ? raw.specs : [];
            this.runs = Array.isArray(raw.runs) ? raw.runs : [];
        } catch { /* first run / unreadable — start empty */ }
    }

    save(): void {
        if (this.runs.length > MAX_STORED_RUNS) {
            const done = this.runs.filter(r => r.status === 'done' || r.status === 'failed' || r.status === 'cancelled');
            const overflow = this.runs.length - MAX_STORED_RUNS;
            const drop = new Set(done.sort((a, b) => a.startedAt - b.startedAt).slice(0, overflow).map(r => r.id));
            this.runs = this.runs.filter(r => !drop.has(r.id));
        }
        if (this.specs.length > MAX_STORED_SPECS) {
            const used = new Set(this.runs.map(r => r.specId));
            this.specs = this.specs.filter((s, i) => used.has(s.id) || i >= this.specs.length - MAX_STORED_SPECS);
        }
        try {
            fs.writeFileSync(this.file, JSON.stringify(
                tokenizeDeep({ specs: this.specs, runs: this.runs }, this.portableRoots()), null, 2), 'utf8');
        } catch { /* best-effort */ }
    }

    spec(id: string): MissionSpec | undefined { return this.specs.find(s => s.id === id); }
    run(id: string): MissionRun | undefined { return this.runs.find(r => r.id === id); }
}

// ---------------------------------------------------------------------------
// engine
// ---------------------------------------------------------------------------

export interface PlannerResult {
    ok: boolean;
    /** The model's reply text (the envelope's `result`). */
    raw?: string;
    sessionId?: string;
    costUSD?: number;
    /** Total tokens of the planner call (from the envelope's usage). */
    tokens?: number;
    error?: string;
}

export interface MissionEngineDeps {
    /** One headless planner call; resumeSessionId keeps the lead's context. */
    runPlanner(prompt: string, resumeSessionId?: string): Promise<PlannerResult>;
    /** Start the wave's steps as tasks and resolve when ALL are settled —
     *  fills each step's taskId/status/costUSD/outputFile. */
    delegateWave(run: MissionRun, steps: MissionStep[]): Promise<void>;
    /** Archived output body for excerpts (fail-soft ''). */
    readOutputBody(file: string): string;
    /** each-round gate; resolve false = rejected. */
    requestApproval(run: MissionRun, round: MissionRound): Promise<boolean>;
    /** ask_user; resolves with the answer ('' / undefined = skipped). */
    askUser(run: MissionRun, question: string): Promise<string | undefined>;
    /** Persist + refresh UI after every state change. */
    onUpdate(run: MissionRun): void;
    now(): number;
}

/** Absolute ceiling on planner calls per run: rounds + parse retries + guard
 *  nudges can never spin past this, whatever the planner does. */
function hardCallCap(spec: MissionSpec): number {
    return spec.limits.maxRounds + 6;
}

export class MissionEngine {
    private cancelRequested = false;
    private pauseRequested = false;

    constructor(
        readonly spec: MissionSpec,
        readonly run: MissionRun,
        private hints: TeamHint[],
        private deps: MissionEngineDeps
    ) { }

    cancel(): void { this.cancelRequested = true; }
    /** Sets the pause flag and shows it immediately (pausePending) — the run
     *  actually pauses before the NEXT planner round; the current activity
     *  finishes first. unpause() withdraws a not-yet-effective request. */
    pause(): void {
        this.pauseRequested = true;
        this.run.pausePending = true;
        this.deps.onUpdate(this.run);
    }
    unpause(): void {
        this.pauseRequested = false;
        this.run.pausePending = false;
        this.deps.onUpdate(this.run);
    }

    private setNow(what?: string): void {
        this.run.now = what ? { what, since: this.deps.now() } : undefined;
    }

    private end(status: MissionRunStatus, result?: MissionResult, note?: string): void {
        this.run.status = status;
        this.run.endedAt = this.deps.now();
        this.setNow();
        this.run.pausePending = false;
        if (result) { this.run.result = result; }
        if (note) { this.run.note = note; }
        this.deps.onUpdate(this.run);
    }

    private stepResults(steps: MissionStep[]): StepResult[] {
        return steps.map(step => ({
            step,
            excerpt: step.outputFile ? outputExcerpt(this.deps.readOutputBody(step.outputFile)) : ''
        }));
    }

    /** Main loop. `initialMsg` carries resume context when re-entering an
     *  interrupted run; fresh runs start with the briefing. */
    async execute(initialMsg?: string): Promise<void> {
        const { spec, run, deps } = this;
        let roundMsg: string | undefined = initialMsg;
        let parseRetried = false;
        let guardNudged = false;
        let plannerCalls = 0;
        const seenWork = new Set<string>(
            run.rounds.flatMap(r => r.steps.map(s => dupKey(s.agentName, s.prompt))));

        while (true) {
            if (this.cancelRequested) { this.end('cancelled'); return; }
            if (this.pauseRequested) {
                run.status = 'paused';
                run.pausePending = false;
                this.setNow();
                deps.onUpdate(run);
                return;
            }
            if (++plannerCalls > hardCallCap(spec)) {
                this.end('failed', undefined, 'hard planner-call cap reached — possible planning loop');
                return;
            }

            const rem = remainingBudget(spec, run, deps.now());
            const guard = guardReason(rem);
            let prompt = run.rounds.length === 0 && !roundMsg
                ? buildBriefing(spec, this.hints, rem)
                : (roundMsg ?? 'Decide the next round. Reply with ONLY the JSON decision object.');
            if (guard) { prompt += finishOnlyNote(guard); }
            roundMsg = undefined;

            run.status = 'running';
            this.setNow(`lead is planning round ${run.rounds.length + 1}`);
            deps.onUpdate(run);
            let pr = await deps.runPlanner(prompt, run.plannerSessionId);
            if (!pr.ok && run.plannerSessionId) {
                // resume-fallback: fresh session re-seeded from briefing + ledger
                run.plannerSessionId = undefined;
                let fb = buildBriefing(spec, this.hints, rem) +
                    (run.ledger.length ? '\n\n## History so far (you are mid-mission)\n' + run.ledger.join('\n') : '') +
                    '\n\nDecide the next round. Reply with ONLY the JSON decision object.';
                if (guard) { fb += finishOnlyNote(guard); }
                pr = await deps.runPlanner(fb, undefined);
            }
            if (!pr.ok) {
                this.end('failed', undefined, `planner call failed — ${pr.error ?? 'unknown error'}`);
                return;
            }
            if (pr.sessionId) { run.plannerSessionId = pr.sessionId; }
            run.totalCostUSD += pr.costUSD ?? 0;

            const parsed = parsePlannerDecision(pr.raw ?? '', spec);
            if (!parsed.ok) {
                if (parseRetried) {
                    this.end('failed', undefined, `planner returned an invalid decision twice — ${parsed.error}`);
                    return;
                }
                parseRetried = true;
                run.ledger.push(`(invalid planner reply: ${parsed.error})`);
                roundMsg = `Your last reply was invalid: ${parsed.error}.\nAnswer again with ONLY the JSON decision object.`;
                continue;
            }
            parseRetried = false;
            const d = parsed.decision;

            if (guard && d.action === 'delegate') {
                if (guardNudged) {
                    this.end('failed',
                        { verdict: 'partial', summary: 'Stopped at the budget limit; the planner kept delegating.' },
                        'budget exhausted');
                    return;
                }
                guardNudged = true;
                roundMsg = `Not allowed: ${guard}. Reply with "finish" or "abort" only.`;
                continue;
            }

            const round: MissionRound = {
                n: run.rounds.length + 1,
                thought: d.thought,
                action: d.action,
                steps: [],
                plannerCostUSD: pr.costUSD ?? 0,
                plannerTokens: pr.tokens,
                at: deps.now()
            };

            if (d.action === 'finish' || d.action === 'abort') {
                run.rounds.push(round);
                run.ledger.push(ledgerLine(round));
                this.end(d.action === 'finish' ? 'done' : 'failed',
                    { verdict: d.verdict, summary: d.summary });
                return;
            }

            if (d.action === 'ask_user') {
                round.question = d.question;
                run.rounds.push(round);
                run.status = 'waiting-user';
                this.setNow('waiting for your answer');
                deps.onUpdate(run);
                const waitFrom = deps.now();
                const answer = await deps.askUser(run, d.question);
                run.waitedMs = (run.waitedMs ?? 0) + (deps.now() - waitFrom);
                if (this.cancelRequested) { this.end('cancelled'); return; }
                round.answer = answer ?? '(no answer — user skipped)';
                run.ledger.push(ledgerLine(round));
                deps.onUpdate(run);
                roundMsg = `## User's answer\n${round.answer}\n\nDecide the next round. Reply with ONLY the JSON decision object.`;
                continue;
            }

            // ---- delegate ----
            const notes: string[] = [];
            let tasks = d.tasks.filter(t => {
                const key = dupKey(t.agent, t.prompt);
                if (seenWork.has(key)) {
                    notes.push(`dropped "${t.title}" → ${t.agent}: the same work was already delegated once (planning loop guard)`);
                    return false;
                }
                seenWork.add(key);
                return true;
            });
            if (tasks.length > rem.tasks) {
                notes.push(`only ${rem.tasks} task(s) left in the budget — the rest of this round was dropped`);
                tasks = tasks.slice(0, Math.max(0, rem.tasks));
            }
            if (!tasks.length) {
                run.ledger.push(`R? delegate rejected — ${notes.join('; ')}`);
                roundMsg = `Nothing was run:\n${notes.map(n => `- ${n}`).join('\n')}\nChoose different work, ask the user, or finish. Reply with ONLY the JSON decision object.`;
                continue;
            }

            round.steps = tasks.map(t => {
                const member = spec.team.find(m => m.agentName === t.agent);
                return {
                    id: newMissionId(),
                    round: round.n,
                    agentId: member?.agentId ?? '',
                    agentName: t.agent,
                    title: t.title,
                    prompt: t.prompt + (t.expect ? `\n\nSuccess criteria: ${t.expect}` : ''),
                    expect: t.expect,
                    readonly: t.readonly,
                    status: 'queued' as MissionStepStatus
                };
            });
            run.rounds.push(round);
            deps.onUpdate(run);

            if (spec.approvalMode === 'each-round') {
                run.status = 'waiting-approval';
                this.setNow(`waiting for your approval (round ${round.n})`);
                deps.onUpdate(run);
                const waitFrom = deps.now();
                const ok = await deps.requestApproval(run, round);
                run.waitedMs = (run.waitedMs ?? 0) + (deps.now() - waitFrom);
                if (this.cancelRequested) { this.end('cancelled'); return; }
                if (!ok) {
                    round.rejectedReason = 'rejected by user';
                    round.steps.forEach(s => { s.status = 'cancelled'; s.note = 'round rejected'; });
                    run.ledger.push(ledgerLine(round));
                    deps.onUpdate(run);
                    roundMsg = 'The user REJECTED this round\'s delegations. Re-plan differently, ask the user what they want, or finish. Reply with ONLY the JSON decision object.';
                    continue;
                }
            }

            run.status = 'running';
            const waves = planWaves(tasks, !!spec.workdir, spec.limits.maxParallel);
            let cursor = 0;
            for (let w = 0; w < waves.length; w++) {
                const steps = round.steps.slice(cursor, cursor + waves[w].length);
                cursor += waves[w].length;
                this.setNow(`round ${round.n}: running ${steps.map(s => s.agentName).join(' + ')}`
                    + (waves.length > 1 ? ` (wave ${w + 1}/${waves.length})` : ''));
                deps.onUpdate(run);
                await deps.delegateWave(run, steps);
                deps.onUpdate(run);
                if (this.cancelRequested) { this.end('cancelled'); return; }
            }
            run.totalCostUSD += round.steps.reduce((a, s) => a + (s.costUSD ?? 0), 0);
            run.ledger.push(ledgerLine(round));
            deps.onUpdate(run);
            roundMsg = buildRoundMessage(
                this.stepResults(round.steps),
                remainingBudget(spec, run, deps.now()),
                notes);
        }
    }
}
