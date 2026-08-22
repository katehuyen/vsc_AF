import * as fs from 'fs';
import {
    bindRuntimeRole, isAdaptive, MissionAutonomy, MissionMode, MissionObjective,
    MissionPoolMember, MissionRuntimeRole, missionModeOf, normalizeObjective, validateObjective
} from './missionMode';
import {
    buildReviewPrompt, CriterionFinding, currentEvaluations, EVALUATION_SCHEMA, EvaluationAdvice,
    isStopReason, MissionEvaluation, parseEvaluation, STOP_REASONS, StopReason, successGate,
    unreadableEvaluation
} from './missionEvaluation';
import {
    MissionActionKind, MissionTraceEvent, MissionTraceRef, MissionTraceType, normalizeStrategy
} from './missionTrace';
import {
    buildIntentPrompt, intentPrimitive, intentTitle, MissionPrimitive, primitiveFor,
    primitivesFor, TaskIntent, unknownActionError
} from './missionPrimitives';
import { expandDeep, PortableRoot, tokenizeDeep } from './portablePaths';
import { extractJson, tryParseJson } from './util';

export {
    deleteTrace, MISSION_TRACE_SCHEMA, MissionTraceWriter, normalizeStrategy, orphanTraceFiles,
    projectTrace, readTrace, reconcileRun, runIdOfTraceFile, traceFileFor
} from './missionTrace';
export type {
    ExternalLookup, ExternalRecord, GraphNode, GraphNodeKind, GraphNodeStatus, HumanFlavor,
    MissionActionKind, MissionActionOutcome, MissionTraceEvent, MissionTraceRef, MissionTraceType,
    PendingHuman, Reconciliation, StrategyVersion, TraceAction, TraceEvaluation, TraceGuidance,
    TraceHealth, TraceProjection, TraceRead
} from './missionTrace';

export {
    buildReviewPrompt, currentEvaluations, EVALUATION_ADVICE, EVALUATION_SCHEMA, isStale,
    isStopReason, parseEvaluation, STOP_REASONS, successGate, unreadableEvaluation
} from './missionEvaluation';
export type {
    CriterionFinding, CriterionVerdict, EvaluationAdvice, GateResult, MissionEvaluation,
    MissionEvaluator, ParsedEvaluation, StopReason
} from './missionEvaluation';

export {
    buildIntentPrompt, intentPrimitive, intentTitle, primitiveFor, primitiveMenu, primitiveNamed,
    PRIMITIVES, primitivesFor, unknownActionError
} from './missionPrimitives';
export type {
    MissionPrimitive, PrimitiveIntent, PrimitiveName, PrimitiveShape, TaskIntent
} from './missionPrimitives';

export {
    bindRuntimeRole, DEFAULT_AUTONOMY, isAdaptive, missionModeOf, normalizeCriteria,
    normalizeObjective, normalizePool, poolFromFleet, resolveLead, validateObjective
} from './missionMode';
export type {
    FleetAgent, MissionAutonomy, MissionMode, MissionObjective, MissionPoolMember,
    MissionRuntimeRole, SuccessCriterion
} from './missionMode';

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
    /**
     * ‼️ WHICH ENGINE THIS MEMBER'S DELEGATIONS RUN ON (X-18). Empty = the
     * mission's own `engine`, and empty there = `claude`.
     *
     * Per MEMBER rather than per mission alone, because that is the shape of the
     * decision people actually make: the reviewer on a plan-billed engine, the
     * writer on the one with the better rates. The planner is deliberately NOT
     * covered by this — see MissionSpec.engine.
     */
    engine?: string;
    /**
     * ‼️ WHAT THIS MEMBER'S DELEGATIONS ARE ALLOWED TO DO WITHOUT ASKING (M-14).
     * Empty = the engine's own default.
     *
     * A delegation is a headless run: nobody is sitting in it, so a permission
     * decision the engine wants to ASK about has no one to ask. Every other
     * unattended surface in this codebase (task, schedule, template, workflow
     * step) spends `permissionMode` up front for exactly that reason. The
     * mission delegate was the one that did not: it carried the member's model
     * and the member's engine and nothing at all about permissions, so a
     * delegate could only ever take the engine default.
     *
     * ‼️ WHAT THAT COSTS IS ENGINE- AND CONFIG-SPECIFIC, AND THE TIDY VERSION OF
     * THIS SENTENCE IS WRONG. Measured 2026-08-16 against OpenCode 1.18.18
     * (`tools/probe_opencode_contract.js`): a `build` delegate on a config that
     * marks nothing "ask" writes perfectly well, so "an unattended OpenCode run
     * cannot call a tool" is false as a general claim. What IS true every run:
     * a refused tool call still exits 0, so a caller watching the exit code sees
     * a successful run that did nothing.
     *
     * What no config can supply is the two settings the member itself needs and
     * had no way to ask for: `plan` (measured — OpenCode's plan agent calls no
     * tool at all, which is exactly what a read-only reviewer wants) and
     * `--auto`. Neither was reachable for a delegate at any price.
     *
     * Per MEMBER, on the same axis as `model` and `engine`, because it is the
     * same shape of decision: the reviewer reads and needs nothing, the writer
     * edits and needs everything. One setting for the whole team would give
     * both the wider of the two.
     */
    permissionMode?: string;
}

export interface MissionLimits {
    maxRounds: number;
    maxTasks: number;
    maxCostUSD: number;
    /**
     * ‼️ X-19 — WHAT A COST CEILING MEANS ON AN ENGINE THAT STATES NO COST.
     *
     * It means NOTHING, and that was the hole. `maxCostUSD` is the one limit
     * with teeth in a mission: rounds and tasks are coarse, minutes only bite on
     * something slow. A delegate running on a subscription engine reports no
     * price at all (codexproto.ts emits no `total_cost_usd` rather than a zero),
     * so `run.totalCostUSD` never moves for it — a mission of Codex delegates
     * could burn its whole plan window against a $5 ceiling that can never be
     * reached. That is not a cap, it is the appearance of one.
     *
     * So the ceiling has a second currency, and it is the one a plan is actually
     * spent in. Both are checked; whichever runs out first stops the mission.
     * 0 = no token ceiling, which is what every mission written before this had.
     */
    maxTokens: number;
    maxMinutes: number;
    maxParallel: number;
}

export const DEFAULT_MISSION_LIMITS: MissionLimits = {
    // 2 000 000 tokens is roughly a heavy day's work on a plan — chosen to be a
    // real backstop rather than a leash, in the same spirit as $5.
    maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 2_000_000,
    maxMinutes: 120, maxParallel: 2
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
    /**
     * The engine every delegation runs on unless the member overrides it (X-18).
     * Empty = `claude`.
     *
     * ‼️ THE PLANNER IS NOT ON THIS AXIS, AND THAT IS A DECISION, NOT AN
     * OVERSIGHT. A planner call is `claude -p --output-format json` and the
     * mission's whole control flow parses that envelope: the decision JSON, the
     * cost, the session id that carries the lead's context from round to round.
     * It also spends `--disallowedTools` and `--max-turns`, neither of which
     * exists on the other engine. Nobody has measured an equivalent, and this
     * codebase does not ship a translation it has not run. Delegates are
     * ordinary tasks and were free the moment tasks grew an engine.
     */
    engine?: string;
    limits: MissionLimits;
    approvalMode: MissionApprovalMode;
    /**
     * Which project this mission is work FOR (Faz 5).
     *
     * ‼️ On the SPEC, not the run: a mission's project is decided when somebody
     * starts it and does not change halfway through, and the run is the history
     * of one spec. Every delegation the planner makes inherits it, so a
     * mission's tasks land on the same project page as the mission itself —
     * without that, the Work tab would show the mission and none of the work it
     * caused, which is the misattribution the entity model exists to stop.
     */
    projectId?: string;
    createdAt: number;
    /**
     * ‼️ M-15 (X-32) — WHICH KIND OF MISSION THIS IS. Absent = 'classic', and
     * that is a decision rather than a fallback: every mission in every store
     * predates this field, and a record that had to be guessed at would be a
     * run whose behaviour changed on upgrade. Read it through `missionModeOf`,
     * never off this field directly.
     */
    mode?: MissionMode;
    /**
     * The adaptive half — absent on a classic mission and inert if some other
     * writer leaves it there. What the run must ACHIEVE (`successCriteria`),
     * what it may not do on the way (`constraints`), who it may draw on
     * (`pool`) and how much rope the lead has (`autonomy`). See
     * `core/missionMode.ts`; the loop that spends them is M-16.
     */
    constraints?: string[];
    successCriteria?: MissionObjective['successCriteria'];
    pool?: MissionPoolMember[];
    autonomy?: MissionAutonomy;
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
    /**
     * ‼️ M-17 — WHICH CRITERIA THIS WORK IS FOR (adaptive only).
     *
     * M-15 asked the lead to name the criterion in `expect`, which is prose and
     * therefore unusable by anything but a reader. As a field it does real
     * work: it is what tells an evaluation it has gone stale — a pass recorded
     * before this step settled is a pass about a version of the artefact that
     * no longer exists.
     */
    criteria?: string[];
    /** ‼️ M-17 — this step IS a review, and its output is parsed as one. */
    evaluates?: boolean;
    /**
     * ‼️ M-18 — the typed intent this delegation was ordered as, when it was
     * one. `review`, `compare` and `revise` run down the ordinary task path —
     * they differ from a plain delegation only in that the ENGINE built the
     * prompt out of real earlier output, and this is the field that says so.
     */
    intent?: TaskIntent;
    /** the result ids this work was built from — the graph's fan-in for a
     *  delegation, and the reason a revise can inherit their criteria */
    sources?: string[];
    /** ‼️ M-18 — absent means a task. `workflow` means the extension starts a
     *  workflow run for this step and observes it by its run id. */
    kind?: MissionActionKind;
    workflowId?: string;
    /** the real record a workflow step became — filled when the run starts */
    workflowRunId?: string;
    /** ‼️ M-18 — the child objective this step asked for, and the run it became */
    child?: ChildObjectiveReq;
    missionRunId?: string;
    /**
     * ‼️ M-18 — WHAT THIS STEP HANDED BACK when it is not a file. A child
     * objective returns a VERDICT, which no output archive holds; without this
     * the lead would be shown an empty excerpt for the one primitive whose
     * whole result is a sentence.
     */
    resultText?: string;
    taskId?: string;
    status: MissionStepStatus;
    costUSD?: number;
    /** Total tokens of the delegate's session (attached when cost attribution matches). */
    tokens?: number;
    outputFile?: string;
    note?: string;
}

/**
 * ‼️ M-16 — `replan` IS THE FIFTH, AND IT IS ADAPTIVE-ONLY. A classic lead has
 * a recipe and never needs to say "my approach has changed" as a move of its
 * own; an adaptive one does, because its strategy is the thing being revised
 * and burying that inside a delegation would make the revision invisible. It
 * costs a round and a planner call like every other action — the ceilings are
 * mechanical authority and nothing here gets a free turn.
 */
export type MissionAction =
    'delegate' | 'finish' | 'ask_user' | 'abort' | 'replan' | 'evaluate'
    | 'parallel' | 'run_workflow' | 'run_mission' | TaskIntent;

export interface MissionRound {
    n: number;
    thought: string;
    action: MissionAction;
    steps: MissionStep[];
    question?: string;
    answer?: string;
    /**
     * ‼️ M-16 — the lead's observation label for where the run is, and which
     * revision of the strategy was in force. On the ROUND rather than only in
     * the journal, so "what is it doing and why" is answerable from the
     * snapshot — the list must not have to read a JSONL file to draw a badge.
     * Absent on every classic round and on every round written before M-16.
     */
    phase?: string;
    strategyVersion?: number;
    /** ‼️ M-17 — the verdict this round recorded, if it recorded one. */
    evaluationId?: string;
    /** ‼️ M-17 — why the run stopped, from a closed list (finish/abort only). */
    stopReason?: StopReason;
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
    /** ‼️ M-17 — why it stopped, from a closed list. Prose cannot answer "did
     *  this reach its objective or run out of rope?" and that is the question. */
    stopReason?: StopReason;
    /**
     * ‼️ M-17 — REQUIRED CRITERIA WITH NO CURRENT PASS, carried into the final
     * record rather than left in the summary's wording. A partial that does not
     * say WHAT is missing is a success with a hedge on it.
     */
    unmet?: { id: string; text: string; verdict: string }[];
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
    /**
     * ‼️ THE OTHER CURRENCY (X-19). Every token the run has spent — the planner's
     * and every delegate's — whether or not that engine also stated a price.
     * This is what a plan is actually spent in, and on a subscription engine it
     * is the ONLY thing that moves. Optional so a run written before this reads
     * back as 0 rather than NaN.
     */
    totalTokens?: number;
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
    /**
     * ‼️ M-18 — WHERE THIS RUN SITS WHEN IT IS SOMEBODY'S CHILD. Absent on
     * every run that was started by a person, which is nearly all of them.
     *
     * `parentRunId` is who ordered it and `sourceActionId` is the step that
     * did — together they are what lets a cancel travel down and a cost travel
     * up. `rootRunId` is carried rather than walked because the chain is what a
     * cancel is racing: at the moment a run is being torn down, the ancestor
     * you need is the one you can name without following pointers through
     * records that are also being torn down. `depth` is the cap's subject.
     */
    parentRunId?: string;
    rootRunId?: string;
    sourceActionId?: string;
    depth?: number;
    /**
     * ‼️ M-15 — WHO THE LEAD PUT TO WORK, AND AS WHAT (adaptive runs only).
     *
     * An adaptive lead is handed a pool rather than a cast list, so "the team"
     * is not a fact until the run makes it one. A role is bound the first time
     * the lead delegates to an agent and lives HERE, on the run: nothing is
     * created on disk and the same agent may hold a different role tomorrow
     * without either statement being wrong. Absent on every classic run.
     */
    roles?: MissionRuntimeRole[];
    /**
     * ‼️ X-45 — WHERE THIS RUN'S JOURNAL IS AND HOW FAR THIS SNAPSHOT SAW IT.
     *
     * Absent on every classic run: a recipe needs no observation record, and a
     * mission written before this reads back with no trace and opens exactly as
     * it always did. `lastSeq` is allowed to LAG the file — the append happens
     * first — and that gap is precisely what reload reconciliation replays.
     */
    trace?: MissionTraceRef;
    /**
     * What the last reload could not account for, in one sentence, for the
     * detail surface to show. Written by reconciliation, cleared when the run
     * is resumed cleanly. Never a reason to hide the run from the list.
     */
    traceDegraded?: string;
    /**
     * ‼️ M-16 — ONE-OFF STEERS FROM THE HUMAN, AND WHETHER THEY LANDED.
     *
     * A steer is NOT delivered to work that is already running: a Task in
     * flight has its prompt and cannot be renegotiated, and pretending
     * otherwise would be the lie the user notices last. It waits for the next
     * PLANNER BOUNDARY, is injected exactly once, and `appliedAt` on this
     * record is what makes "once" survive a window reload — the journal says
     * the same thing, so a crash between the two cannot double-apply it.
     */
    guidance?: MissionGuidance[];
    /**
     * ‼️ M-16 — THE STRATEGY IN FORCE RIGHT NOW (adaptive runs only).
     *
     * The journal holds the HISTORY of revisions; this holds the current one,
     * exactly as `result` holds the verdict whose history is `run.finished`. It
     * earns its place twice: a list can draw "v3 · verifying" without opening a
     * JSONL file, and a run resumed after a reload can tell whether the lead's
     * next answer is a real change of approach or the same one restated — which
     * it cannot do from a version number alone.
     */
    strategy?: { version: number; text: string; phase?: string; at: number };
    /**
     * ‼️ M-17 — EVERY VERDICT THIS RUN HAS RECORDED, in order, stale ones kept.
     *
     * A stale evaluation is not deleted: "we checked, then changed the thing"
     * is the history, and throwing it away leaves a run that looks like it was
     * never reviewed. Staleness is DERIVED from the steps that settled after it
     * (`isStale`), never stored — a stored flag would be a second copy of a
     * fact the timeline already states and would disagree with it on the first
     * out-of-order replay.
     */
    evaluations?: MissionEvaluation[];
}

export interface MissionGuidance {
    id: string;
    text: string;
    at: number;
    /** when the loop actually put it in front of the lead; absent = still due */
    appliedAt?: number;
}

/** Queue a steer for the next planner boundary. Returns the record so the
 *  caller can tell the user WHEN it will land rather than implying "now". */
export function addGuidance(run: MissionRun, text: string, now: number): MissionGuidance {
    const g: MissionGuidance = {
        id: 'g' + ((run.guidance?.length ?? 0) + 1) + '-' + now.toString(36),
        text: text.trim().slice(0, 4000),
        at: now
    };
    run.guidance = [...(run.guidance ?? []), g];
    return g;
}

/** The steers this run has not shown the lead yet, oldest first. */
export function pendingGuidance(run: MissionRun): MissionGuidance[] {
    return (run.guidance ?? []).filter(g => g.appliedAt === undefined);
}

/**
 * ‼️ M-17 — THE INPUT TO STALENESS, defined once because two definitions of
 * "the work moved on" would be two definitions of what a current pass is, and
 * the gate would then mean something different depending on who asked.
 *
 * A REVIEW is deliberately not in here: a review is the judgement of the
 * criteria, not work on them, and letting one count would mean no evaluation
 * could survive the round that produced it.
 */
export function settledCriteriaWork(run: MissionRun): { at: number; criteria?: string[] }[] {
    const out: { at: number; criteria?: string[] }[] = [];
    for (const r of run.rounds) {
        for (const s of r.steps) {
            if (s.evaluates) { continue; }
            if (s.status !== 'done' && s.status !== 'failed') { continue; }
            if (s.criteria?.length) { out.push({ at: r.at, criteria: s.criteria }); }
        }
    }
    return out;
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
    /** M-17 — the criterion ids this work serves (adaptive only) */
    criteria?: string[];
    /**
     * ‼️ M-18 — WHAT THIS UNIT OF WORK ACTUALLY IS. Absent means a task, which
     * is nearly everything. A `workflow` unit rides the same wave, the same
     * approval, the same budget and the same cancel as a delegation and differs
     * only in what the extension starts for it — which is the whole point: a
     * mission that opened its own route to workflows would be a second
     * workflow engine, and there is exactly one.
     */
    kind?: MissionActionKind;
    workflowId?: string;
    /** ‼️ M-18 — what a `mission` unit is: the child objective to be born. */
    child?: ChildObjectiveReq;
}

/**
 * ‼️ M-18 — WHAT THE LEAD ASKED FOR, NOT THE SPEC ITSELF. The child's ids, its
 * pool, its lead, its ceilings and its project are all decided where the run is
 * born — from the parent, which is the only place that knows them. The lead
 * states the outcome and what would count as reaching it; everything that makes
 * the child *safe* is inherited rather than requested.
 */
export interface ChildObjectiveReq {
    goal: string;
    successCriteria: { text: string; required: boolean }[];
    constraints?: string[];
    title?: string;
    /** the child's depth — the parent's plus one, computed by the engine */
    depth: number;
}

/**
 * ‼️ M-16 — WHAT AN ADAPTIVE LEAD SAYS BESIDES WHAT IT WANTS DONE.
 *
 * Not chain-of-thought and never treated as such: every field here is written
 * to be SHOWN to the user, which is why it is short and why the prompt asks for
 * a sentence rather than reasoning. The point is that a run can answer "what is
 * it doing and why" without anybody reading the model's private deliberation —
 * so the surfaces get this, and the raw planner text stays where it was.
 */
export interface AdaptiveReflection {
    /** one showable sentence: why THIS decision, now */
    rationale: string;
    /** the lead's own label for where the run is — an observation, not a stage
     *  in a pipeline the engine enforces; nothing branches on its value */
    phase: string;
    /** the working strategy as the lead now states it */
    strategy: string;
    /** only meaningful when the strategy actually moved */
    changeReason?: string;
    /** ids of earlier work this decision rests on — the graph's fan-in */
    basedOn: string[];
}

/**
 * ‼️ M-17 — AN `evaluate` IS ONE PRIMITIVE WITH TWO WAYS OF RUNNING.
 *
 * With no `reviewer`, the lead judges from the results already in its hands and
 * the verdict is recorded in the same round — no extra call, because asking a
 * model to re-read what it just read is a round spent on nothing. With a
 * `reviewer`, the named agent runs as an **ordinary FarmTask** under the same
 * budget, the same waves and the same cancel as any other delegation, and its
 * output is parsed by the same parser.
 *
 * Both land on the identical record, which is the point: a gate that trusted
 * self-review and independent review differently would be two gates, and the
 * one a run happened to use would decide what "success" meant.
 */
type PlannerDecisionCore =
    | { action: 'delegate'; thought: string; tasks: PlannerTaskReq[] }
    /**
     * ‼️ M-18 — `parallel` IS `delegate` PLUS A CLAIM, not a second execution
     * route. The claim is that these tasks are independent; the engine still
     * waves them by the one-writer rule and says so when it had to serialise.
     * A primitive that could actually overrule that rule would be the bug this
     * one exists to avoid — two writers in one folder is corruption, not speed.
     */
    | { action: 'parallel'; thought: string; tasks: PlannerTaskReq[] }
    /**
     * ‼️ M-18 — A TYPED TASK INTENT. `review`, `compare` and `revise` are not
     * executors: each becomes ONE ordinary delegation whose prompt the engine
     * builds from the REAL output of the named results. The lead names ids, not
     * content — so it cannot hand a delegate a paraphrase of work that was
     * never produced, which is the failure the whole family guards against.
     */
    | {
        action: TaskIntent; thought: string; agent: string; targets: string[];
        ask: string; title?: string; criteria?: string[];
    }
    | {
        action: 'finish'; thought: string; verdict: MissionResult['verdict'];
        summary: string; stopReason?: StopReason;
    }
    | {
        action: 'abort'; thought: string; verdict: MissionResult['verdict'];
        summary: string; stopReason?: StopReason;
    }
    | { action: 'ask_user'; thought: string; question: string }
    | { action: 'replan'; thought: string }
    /**
     * ‼️ M-18 — A WORKFLOW IS A UNIT OF WORK, NOT A PLAN THE LEAD DRIVES. It
     * already exists, it already encodes its own routing, and the lead neither
     * composes it nor steps it: it names one, it gets back what the chain's
     * last completed step produced. The existence check happens in the ENGINE,
     * not here, for the same reason a target id does — only the run knows what
     * this window actually has, and the lead is told the real list.
     */
    | { action: 'run_workflow'; thought: string; workflow: string; ask?: string; criteria?: string[] }
    /**
     * ‼️ M-18 — A NESTED OBJECTIVE IS A REAL RUN, not a bigger delegation. It
     * gets a lead of its own and comes back with a VERDICT rather than an
     * output, which is the whole reason to reach for it: work that needs its
     * own planning cannot be expressed as one prompt.
     *
     * Two things make it safe rather than a way to fork forever, and both are
     * checked by the engine because only it knows where this run sits: the
     * DEPTH cap, and the refusal to start an objective that is already an
     * ancestor of this one. It also spends the parent's budget — the child's
     * ceilings are cut from what the parent has left, and what it spends is
     * charged upward exactly once.
     */
    | {
        action: 'run_mission'; thought: string; goal: string;
        /** the PARENT's criterion ids this sub-objective serves */
        criteria?: string[];
        /** the CHILD's own criteria — ids are minted where the child is born,
         *  never by the lead: an id has to be unique inside its own run and the
         *  lead is not the thing that can promise that */
        successCriteria?: { text: string; required: boolean }[];
        constraints?: string[]; title?: string;
    }
    | {
        action: 'evaluate'; thought: string; targets: string[];
        /** absent = the lead judges it itself, from what it already has */
        reviewer?: string;
        /** present exactly when there is no reviewer */
        findings?: CriterionFinding[];
        advice?: EvaluationAdvice;
        confidence?: number;
        note?: string;
    };

export type PlannerDecision = PlannerDecisionCore & { reflection?: AdaptiveReflection };

const MAX_TASKS_PER_ROUND = 6;
const MAX_PROMPT_CHARS = 8000;

/**
 * The agents this mission's lead may delegate to — its team when it is classic,
 * its pool when it is adaptive. One function so nothing has to remember which,
 * and so an adaptive spec whose pool was never resolved falls back to the team
 * rather than to "anybody".
 */
export function allowedAgents(spec: MissionSpec): MissionTeamMember[] {
    if (isAdaptive(spec) && spec.pool?.length) {
        return spec.pool.map(m => ({
            agentId: m.agentId, agentName: m.agentName || m.agentId,
            ...(m.role ? { role: m.role } : {}),
            ...(m.model ? { model: m.model } : {}),
            ...(m.engine ? { engine: m.engine } : {}),
            ...(m.permissionMode ? { permissionMode: m.permissionMode } : {})
        }));
    }
    return spec.team;
}

type ParseResult = { ok: true; decision: PlannerDecision } | { ok: false; error: string };

/** Validate the planner's raw reply into a decision, or say exactly why not
 *  (the error text is fed back to the planner — write it for the model). */
export function parsePlannerDecision(raw: string, spec: MissionSpec): ParseResult {
    return parseDecision(raw, spec, false);
}

/**
 * ‼️ M-16 — THE SAME CONTRACT PLUS WHAT MAKES A RUN OBSERVABLE. An adaptive
 * reply must also state its rationale, its phase and its working strategy, and
 * may use `replan`. Everything else — the caps, the roster rule, the
 * self-containment rule — is the shared parse, unforked, because those are the
 * engine's guarantees and they do not depend on which kind of run this is.
 */
export function parseAdaptiveDecision(raw: string, spec: MissionSpec): ParseResult {
    return parseDecision(raw, spec, true);
}

/** The reflection fields, read tolerantly — `currentPhase` is what the prompt
 *  asks for, `phase` is what models write half the time, and both are the same
 *  thing. Missing pieces are reported by the caller, not invented here. */
function readReflection(o: Record<string, unknown>, thought: string): AdaptiveReflection {
    const s = (v: unknown, cap: number): string => typeof v === 'string' ? v.trim().slice(0, cap) : '';
    return {
        rationale: s(o.rationale, 600) || thought,
        phase: s(o.currentPhase, 60) || s(o.phase, 60),
        strategy: s(o.strategy, 800),
        ...(s(o.changeReason, 400) ? { changeReason: s(o.changeReason, 400) } : {}),
        basedOn: Array.isArray(o.basedOn)
            ? o.basedOn.filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim()).slice(0, 20)
            : []
    };
}

function parseDecision(raw: string, spec: MissionSpec, adaptive: boolean): ParseResult {
    const j = extractJson(raw ?? '');
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
        return { ok: false, error: 'reply is not a JSON object' };
    }
    const o = j as Record<string, unknown>;
    const thought = typeof o.thought === 'string' ? o.thought.slice(0, 600) : '';
    const action = String(o.action ?? '');
    // ‼️ Read BEFORE the action is dispatched on, so every branch below can
    // attach it with one line and none of them can forget.
    let reflection: AdaptiveReflection | undefined;
    if (adaptive) {
        reflection = readReflection(o, thought);
        const missing: string[] = [];
        if (!reflection.rationale) { missing.push('"rationale" (one showable sentence on why this decision)'); }
        if (!reflection.phase) { missing.push('"currentPhase" (your own label for where this run is)'); }
        if (!reflection.strategy) { missing.push('"strategy" (your working approach, restated in full each time)'); }
        if (missing.length) {
            return { ok: false, error: `every adaptive reply needs ${missing.join(', ')}` };
        }
    }
    const done = (d: PlannerDecisionCore): ParseResult =>
        ({ ok: true, decision: reflection ? { ...d, reflection } : d });
    // ‼️ M-18 — ONE LOOKUP DECIDES BOTH QUESTIONS. "Is that an action?" and "may
    // a lead in this mode use it?" have the same answer to the lead, and the
    // menu in the error is generated from the same list the branches below
    // dispatch on — so a classic lead inventing "replan" gets exactly today's
    // message, and a primitive can never be advertised without being parseable.
    const prim = primitiveFor(action, adaptive);
    if (!prim) { return { ok: false, error: unknownActionError(action, adaptive) }; }
    if (action === 'replan' || action === 'evaluate') {
        if (action === 'replan') { return done({ action: 'replan', thought }); }
        const targets = Array.isArray(o.targets)
            ? o.targets.filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim()).slice(0, 40)
            : [];
        const reviewerRaw = typeof o.reviewer === 'string' ? o.reviewer.trim() : '';
        if (reviewerRaw) {
            const allowed = allowedAgents(spec);
            const reviewer = allowed.find(m => m.agentName.toLowerCase() === reviewerRaw.toLowerCase());
            if (!reviewer) {
                return {
                    ok: false,
                    error: `unknown reviewer "${reviewerRaw}" — the pool is: ${allowed.map(m => m.agentName).join(', ')}`
                };
            }
            return done({ action: 'evaluate', thought, targets, reviewer: reviewer.agentName });
        }
        // ‼️ No reviewer means the LEAD is the evaluator, so the verdict has to
        // be in this very reply — "I will judge it myself" with nothing
        // attached would cost a round and record nothing.
        const parsed = parseEvaluation(o, spec.successCriteria ?? []);
        if (!parsed.ok) {
            return {
                ok: false,
                error: `"evaluate" without a "reviewer" means you are judging it yourself, so this reply must carry the verdict — ${parsed.error}`
            };
        }
        return done({
            action: 'evaluate', thought, targets,
            findings: parsed.value.findings, advice: parsed.value.advice,
            ...(parsed.value.confidence !== undefined ? { confidence: parsed.value.confidence } : {}),
            ...(parsed.value.note ? { note: parsed.value.note } : {})
        });
    }
    if (action === 'finish' || action === 'abort') {
        const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
        if (!summary) { return { ok: false, error: `"${action}" needs a non-empty "summary"` }; }
        const v = String(o.verdict ?? '');
        const verdict: MissionResult['verdict'] =
            v === 'success' || v === 'partial' || v === 'failed'
                ? v
                : (action === 'finish' ? 'partial' : 'failed'); // tolerant default
        // ‼️ M-17 — WHY IT STOPPED, and only from the closed list. A wrong one
        // is refused by name rather than coerced: the whole value of the field
        // is that "reached its objective" and "ran out of rope" cannot be
        // confused later, and a silent fallback would confuse exactly those.
        let stopReason: StopReason | undefined;
        if (adaptive) {
            const s = String(o.stopReason ?? o.stop_reason ?? '').trim();
            if (s && !isStopReason(s)) {
                return { ok: false, error: `"stopReason" must be one of: ${STOP_REASONS.join(' | ')} (got "${s}")` };
            }
            if (s) { stopReason = s as StopReason; }
        }
        return done(action === 'finish'
            ? { action: 'finish', thought, verdict, summary, ...(stopReason ? { stopReason } : {}) }
            : { action: 'abort', thought, verdict, summary, ...(stopReason ? { stopReason } : {}) });
    }
    if (action === 'ask_user') {
        const question = typeof o.question === 'string' ? o.question.trim() : '';
        if (!question) { return { ok: false, error: '"ask_user" needs a non-empty "question"' }; }
        return done({ action, thought, question });
    }
    if (action === 'run_mission') {
        const goal = String(o.goal ?? '').trim().slice(0, 2000);
        if (!goal) {
            return { ok: false, error: '"run_mission" needs a "goal" — the outcome the child run must reach, not a recipe' };
        }
        const sc = Array.isArray(o.successCriteria) ? o.successCriteria : [];
        const successCriteria = sc
            .map(x => {
                const r = (x && typeof x === 'object' ? x : { text: x }) as Record<string, unknown>;
                return { text: String(r.text ?? '').trim().slice(0, 500), required: r.required !== false };
            })
            .filter(c => c.text)
            .slice(0, 20);
        // ‼️ A CHILD OBJECTIVE WITH NOTHING TO MEET IS A DELEGATION WEARING A
        // COSTUME. The whole reason to spend a run on it is that it comes back
        // with a verdict, and a verdict needs something to be about.
        if (!successCriteria.length) {
            return {
                ok: false,
                error: '"run_mission" needs at least one entry in "successCriteria" — a child objective '
                    + 'returns a VERDICT, and without a criterion there is nothing for it to be a verdict about. '
                    + 'If the work has no criteria of its own, delegate it instead.'
            };
        }
        if (!successCriteria.some(c => c.required)) {
            return { ok: false, error: '"run_mission": every criterion you gave the child is optional — then nothing decides whether it succeeded' };
        }
        const crit = readCriteriaIds(o.criteria, spec, '"run_mission"', adaptive);
        if (!crit.ok) { return { ok: false, error: crit.error }; }
        return done({
            action: 'run_mission', thought, goal, successCriteria,
            ...(Array.isArray(o.constraints)
                ? {
                    constraints: o.constraints.filter(x => typeof x === 'string' && x.trim())
                        .map(x => String(x).trim().slice(0, 500)).slice(0, 20)
                }
                : {}),
            ...(typeof o.title === 'string' && o.title.trim() ? { title: o.title.trim().slice(0, 120) } : {}),
            ...(crit.ids ? { criteria: crit.ids } : {})
        });
    }
    if (action === 'run_workflow') {
        const workflow = String(o.workflow ?? o.workflowId ?? o.title ?? '').trim().slice(0, 200);
        if (!workflow) {
            return { ok: false, error: '"run_workflow" needs a "workflow" — the id or the exact title of one that exists' };
        }
        const crit = readCriteriaIds(o.criteria, spec, '"run_workflow"', adaptive);
        if (!crit.ok) { return { ok: false, error: crit.error }; }
        return done({
            action: 'run_workflow', thought, workflow,
            ...(typeof o.ask === 'string' && o.ask.trim() ? { ask: o.ask.trim().slice(0, MAX_PROMPT_CHARS) } : {}),
            ...(crit.ids ? { criteria: crit.ids } : {})
        });
    }
    // ---- typed task intents: review | compare | revise (M-18) ----
    if (prim.intent) {
        const allowed = allowedAgents(spec);
        const agentRaw = String(o.agent ?? '').trim();
        const agent = allowed.find(m => m.agentName.toLowerCase() === agentRaw.toLowerCase());
        if (!agent) {
            return {
                ok: false,
                error: `"${action}" needs an "agent" from the pool — the pool is: ${allowed.map(m => m.agentName).join(', ')}`
            };
        }
        const targets = Array.isArray(o.targets)
            ? o.targets.filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim()).slice(0, 20)
            : [];
        if (targets.length < prim.intent.minTargets) {
            return {
                ok: false,
                error: `"${action}" needs at least ${prim.intent.minTargets} result id(s) in "targets" `
                    + '— it works on results this run already produced, so name them by the "id" shown with each round result'
            };
        }
        const ask = typeof o.ask === 'string' ? o.ask.trim().slice(0, MAX_PROMPT_CHARS) : '';
        if (action === 'revise' && !ask) {
            return { ok: false, error: '"revise" needs an "ask": say exactly what gap the revision must close' };
        }
        const crit = readCriteriaIds(o.criteria, spec, `"${action}"`, adaptive);
        if (!crit.ok) { return { ok: false, error: crit.error }; }
        return done({
            action: action as TaskIntent, thought, agent: agent.agentName, targets, ask,
            ...(typeof o.title === 'string' && o.title.trim() ? { title: o.title.trim().slice(0, 120) } : {}),
            ...(crit.ids ? { criteria: crit.ids } : {})
        });
    }
    if (action === 'delegate' || action === 'parallel') {
        if (!Array.isArray(o.tasks) || !o.tasks.length) {
            return { ok: false, error: `"${action}" needs a non-empty "tasks" array` };
        }
        if (o.tasks.length > MAX_TASKS_PER_ROUND) {
            return { ok: false, error: `too many tasks in one round (max ${MAX_TASKS_PER_ROUND})` };
        }
        // ‼️ M-15 — WHOM THE LEAD IS ALLOWED TO NAME, which is the one thing the
        // two modes disagree about here. A classic lead has a TEAM and may name
        // nobody else; an adaptive lead has a POOL and picks from it at runtime.
        // The rest of this parse — the actions, the caps, the self-containment
        // rule — is the same contract for both, which is why it is not forked.
        const allowed = allowedAgents(spec);
        const names = new Map(allowed.map(m => [m.agentName.toLowerCase(), m.agentName]));
        const tasks: PlannerTaskReq[] = [];
        for (const t of o.tasks as Record<string, unknown>[]) {
            const agentRaw = String(t?.agent ?? '').trim();
            const agent = names.get(agentRaw.toLowerCase());
            if (!agent) {
                return {
                    ok: false,
                    error: `unknown agent "${agentRaw}" — `
                        + `${isAdaptive(spec) ? 'the pool is' : 'the team is'}: `
                        + allowed.map(m => m.agentName).join(', ')
                };
            }
            const title = typeof t.title === 'string' ? t.title.trim().slice(0, 120) : '';
            const prompt = typeof t.prompt === 'string' ? t.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
            if (!title || !prompt) { return { ok: false, error: 'every task needs a non-empty "title" and "prompt"' }; }
            // ‼️ M-17 — WHICH CRITERIA THIS WORK IS FOR, and a wrong id is
            // refused rather than dropped: a criterion nobody can point at is
            // the one an evaluation will never be told has gone stale.
            const crit = readCriteriaIds(t.criteria, spec, `task "${title}"`, adaptive);
            if (!crit.ok) { return { ok: false, error: crit.error }; }
            const criteria = crit.ids;
            tasks.push({
                agent, title, prompt,
                expect: typeof t.expect === 'string' ? t.expect.trim().slice(0, 400) : undefined,
                readonly: t.readonly === true,
                ...(criteria ? { criteria } : {})
            });
        }
        return done(action === 'parallel'
            ? { action: 'parallel', thought, tasks }
            : { action: 'delegate', thought, tasks });
    }
    return { ok: false, error: unknownActionError(action, adaptive) };
}

/**
 * ‼️ M-17 — THE CRITERION IDS A PIECE OF WORK SERVES, read the same way
 * wherever they are named. A wrong id is refused rather than dropped: a
 * criterion nobody can point at is the one an evaluation will never be told has
 * gone stale, and that is the mechanism the success gate rests on.
 */
function readCriteriaIds(raw: unknown, spec: MissionSpec, label: string, adaptive: boolean):
    { ok: true; ids?: string[] } | { ok: false; error: string } {
    if (!adaptive || !Array.isArray(raw)) { return { ok: true }; }
    const ids = new Set((spec.successCriteria ?? []).map(c => c.id));
    const named = raw.filter(x => typeof x === 'string').map(x => String(x).trim()).filter(Boolean);
    const bad = named.find(x => !ids.has(x));
    if (bad) {
        return {
            ok: false,
            error: `${label} names an unknown criterion "${bad}" — the ids are: ${[...ids].join(', ') || '(none)'}`
        };
    }
    return { ok: true, ...(named.length ? { ids: [...new Set(named)] } : {}) };
}

// ---------------------------------------------------------------------------
// prompts
// ---------------------------------------------------------------------------

export interface RemainingBudget {
    rounds: number; tasks: number; costUSD: number; minutes: number;
    /** ‼️ X-19 — the ceiling that still binds when the engine states no price.
     *  `Infinity` when no token ceiling is set, so nothing ever stops on it. */
    tokens: number;
}

export function remainingBudget(spec: MissionSpec, run: MissionRun, now: number): RemainingBudget {
    const spentTasks = run.rounds.reduce((a, r) => a + r.steps.length, 0);
    const elapsedMin = (now - run.startedAt - (run.waitedMs ?? 0)) / 60_000;
    // A spec written before token ceilings existed has no `maxTokens` field at
    // all; `?? 0` is what makes that mission behave exactly as it always did.
    const maxTokens = spec.limits.maxTokens ?? 0;
    return {
        rounds: spec.limits.maxRounds - run.rounds.length,
        tasks: spec.limits.maxTasks - spentTasks,
        costUSD: Math.round((spec.limits.maxCostUSD - run.totalCostUSD) * 100) / 100,
        tokens: maxTokens > 0 ? maxTokens - (run.totalTokens ?? 0) : Infinity,
        minutes: Math.round(spec.limits.maxMinutes - elapsedMin)
    };
}

/** Non-null when some limit is exhausted — the next round is finish-only. */
export function guardReason(rem: RemainingBudget): string | null {
    if (rem.costUSD <= 0) { return `the cost budget is spent (${rem.costUSD} USD left)`; }
    // ‼️ The one ceiling a plan-billed delegate can actually reach (X-19).
    if (rem.tokens <= 0) { return 'the token budget is spent'; }
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
    // ‼️ The token line is only written when there IS one, and it is written for
    // the planner's benefit: a mission whose delegates run on a plan sees its
    // dollar figure stand still all the way to the end, and a lead told only
    // "$5.00 left" would plan as if nothing had been spent.
    const tokens = isFinite(rem.tokens)
        ? `, ${Math.max(0, Math.round(rem.tokens / 1000))}k tokens` : '';
    return `Remaining budget: ${rem.rounds} round(s), ${rem.tasks} task(s), $${rem.costUSD.toFixed(2)}${tokens}, ~${rem.minutes} min.`;
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

/**
 * `withIds` is M-16 and adaptive-only: the lead is asked which earlier results
 * a decision rests on (`basedOn`), and it can only name them if it was shown
 * their ids. A classic round message is byte-identical to what it always was.
 */
export function buildRoundMessage(
    results: StepResult[], rem: RemainingBudget, notes: string[] = [], withIds = false
): string {
    const parts = results.map(r => {
        const s = r.step;
        const cost = s.costUSD !== undefined ? ` · $${s.costUSD.toFixed(2)}` : '';
        const dur = r.durationMin !== undefined ? ` · ${r.durationMin}m` : '';
        return `### ${withIds ? `[id: ${s.id}] ` : ''}${s.agentName} — "${s.title}" → ${s.status.toUpperCase()}${cost}${dur}${s.note ? ` (${s.note})` : ''}
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

// ---------------------------------------------------------------------------
// protocol — M-15
// ---------------------------------------------------------------------------

/**
 * ‼️ M-15 — WHAT THE TWO MODES ACTUALLY DISAGREE ABOUT, AND NOTHING ELSE.
 *
 * The lifecycle is one machine: the guards, the waves, pause, cancel, approval,
 * the ledger, the store, the cost attribution and the reload recovery are the
 * same code whichever kind of mission is running, and they have to stay that
 * way — a second copy of a lifecycle is a second set of bugs, and an adaptive
 * run that could pause differently from a classic one is a run nobody can
 * reason about.
 *
 * What differs is exactly two things: **what the lead is told** and **what its
 * reply is checked against**. So that is the seam, and it is an interface with
 * two implementations rather than an `if (adaptive)` growing through the loop.
 * The engine holds one of these and never asks which it has.
 */
export interface MissionProtocol {
    readonly mode: MissionMode;
    /** The first thing the lead is given on a fresh run. */
    briefing(spec: MissionSpec, hints: TeamHint[], rem: RemainingBudget): string;
    /** The lead's raw reply → a decision, or exactly why not (the error text is
     *  fed back to the model, so it is written for one). */
    parse(raw: string, spec: MissionSpec): { ok: true; decision: PlannerDecision } | { ok: false; error: string };
    /** What the lead is told after a wave settles. */
    roundMessage(results: StepResult[], rem: RemainingBudget, notes?: string[]): string;
}

const classicProtocol: MissionProtocol = {
    mode: 'classic',
    briefing: (spec, hints, rem) => buildBriefing(spec, hints, rem),
    parse: (raw, spec) => parsePlannerDecision(raw, spec),
    roundMessage: (results, rem, notes) => buildRoundMessage(results, rem, notes)
};

/**
 * ‼️ AN OBJECTIVE IS NOT A RECIPE, AND THE BRIEFING IS WHERE THAT BECOMES TRUE.
 *
 * The classic briefing hands the lead a team and a goal and lets it plan. The
 * adaptive one hands it the OUTCOME — every success criterion by its stable id,
 * so the lead can say which one a delegation is for and the evaluation gate
 * (M-17) can answer per id; the constraints as a fence rather than a task list;
 * and the pool as candidates it chooses from, because the whole point is that
 * the user did not have to pick the cast. `autonomy` is the one line that says
 * what to do at a fork the objective does not settle.
 */
function adaptiveBriefing(spec: MissionSpec, _hints: TeamHint[], rem: RemainingBudget): string {
    const pool = allowedAgents(spec)
        .map(m => `- ${m.agentName}${m.role ? ` (${m.role})` : ''}`).join('\n');
    const criteria = (spec.successCriteria ?? [])
        .map(c => `- [${c.id}] ${c.text}${c.required ? '' : '  (optional)'}`).join('\n');
    const constraints = (spec.constraints ?? []).map(c => `- ${c}`).join('\n');
    const autonomy = spec.autonomy === 'decide-alone'
        ? 'DECIDE ALONE — take the judgement yourself and record why; only "ask_user" when you are blocked, not when you are unsure.'
        : 'ASK WHEN UNSURE — at a fork this objective does not settle, use "ask_user" rather than guessing.';
    return `You are the LEAD of an OBJECTIVE. You were given a result to reach, not a procedure to follow: nobody has told you how many rounds to run, which agents to use or in what order. You work that out, you delegate it, and you judge the outcome against the criteria below.

You do not do the work yourself — you plan, delegate, read the results and finish with an honest verdict.

## Objective
${spec.goal.trim()}
${spec.workdir ? `\nWorking folder (delegates run inside it): ${spec.workdir}` : ''}

## Success criteria — this is what "done" means
${criteria || '- (none recorded — say so and finish)'}
Each carries a stable id. Name the ids a delegation is for in its "criteria", and
judge them with "evaluate". ‼️ A delegate finishing is not a criterion being met:
"finish" with "success" is refused until every REQUIRED criterion has a current
pass on record.
${constraints ? `\n## Constraints — things this run may NOT do\n${constraints}` : ''}

## Who you may draw on
${pool}
These are candidates, not an assigned team. Use as few as the objective needs; the first time you delegate to one, say in "expect" what role it is playing.

## Autonomy
${autonomy}

## Budget
${remLine(rem)}
Each round you will receive the delegates' results and the updated budget.

## How to answer
${adaptiveDecisionSchema()}`;
}

/**
 * ‼️ M-16 — WHAT AN OBJECTIVE'S LEAD IS ASKED FOR, ON TOP OF THE DECISION.
 *
 * Three extra fields, and each is there for a reason that is not decoration:
 * `rationale` is what the user reads instead of the model's private
 * deliberation; `currentPhase` is the lead's own label, so the surfaces can say
 * where the run is without the engine inventing a pipeline; `strategy` is
 * restated IN FULL every time precisely so the engine can tell a real change of
 * approach from a rewording — it compares the normalised text and cuts a
 * version only when it moved. Asking "has it changed?" would put that judgement
 * in the model, which is the one place it cannot be checked.
 */
function adaptiveDecisionSchema(): string {
    const prims = primitivesFor(true);
    // ‼️ M-18 — THE MENU AND THE PARSER READ THE SAME LIST. What the lead is
    // offered here is generated from the registry the parser dispatches on, so
    // a primitive cannot be advertised without being parseable, and one that is
    // added cannot be forgotten in the prompt — the two ways of drifting apart.
    const menu = prims.map(p => `"${p.name}"`).join(' | ');
    const what = prims.map(p => `- "${p.name}" — ${p.describe}`).join('\n');
    const extraRules = prims.flatMap(p => p.rules ?? []).map(r => `- ${r}`).join('\n');
    return `Reply with ONLY one JSON object (no prose around it):
{
  "rationale": "one short sentence, written to be SHOWN to the user: why this decision, now",
  "currentPhase": "your own short label for where this run is (e.g. \\"triage\\", \\"building\\", \\"verifying\\") — an observation, not a stage anyone enforces",
  "strategy": "your working approach, restated IN FULL every time — even if it has not changed",
  "changeReason": "only when the strategy above differs from your last one: what made you change it",
  "basedOn": ["ids of the earlier results this decision rests on, from the \\"id\\" shown with each round result"],
  "thought": "one short sentence on your reasoning",
  "action": ${menu},
  "tasks": [ { "agent": "<pool agent name>", "title": "...", "prompt": "full self-contained instructions for that agent", "expect": "how to tell it succeeded", "criteria": ["<criterion ids this work is for>"], "readonly": true|false } ],
  "agent": "for review/compare/revise: the ONE pool agent that does it",
  "ask": "for review/compare/revise: what you want looked at, weighed, or fixed",
  "targets": ["for evaluate and for review/compare/revise: the result ids you mean"],
  "reviewer": "for evaluate: a pool agent to review independently — omit to judge it yourself",
  "findings": [ { "criterion": "<criterion id>", "verdict": "pass" | "fail" | "unknown", "evidence": "what you actually saw", "gap": "what is missing" } ],
  "advice": "for evaluate: finish | revise | replan | explore | ask_user | partial | failed",
  "question": "only for ask_user",
  "verdict": "success" | "partial" | "failed",  "summary": "only for finish/abort — what was achieved, what remains",
  "stopReason": "for finish/abort: criteria-satisfied | sufficient-evidence | no-new-information | execution-over-discussion | hard-limit | user-stop"
}

What each action is:
${what}

Rules:
- "review", "compare" and "revise" work on results this run ALREADY produced: you name the ids in "targets" and the engine attaches the real output to the prompt. Do not paste the work into "ask" — name it.
- A "revise" is charged to the same criteria as the work it revises, so any pass recorded about the old version goes stale. That is the point of it.
${extraRules}
- ‼️ "finish" with "success" is REFUSED unless every REQUIRED criterion has a current PASS on record. A criterion is judged by an "evaluate", never by a delegation finishing — a delegate exiting cleanly says the work RAN, not that the objective is met.
- An evaluation goes STALE when work for one of the criteria it judged settles after it. Judge again after you change something; a pass about the old version does not open the gate.
- Use "evaluate" with no "reviewer" to judge from the results you already hold — then the verdict must be in the SAME reply ("findings" + "advice"). Name a "reviewer" from the pool when the judgement should not be your own.
- "unknown" is a real verdict and is better than a guess. There is no score to fill in; "confidence" is optional and nothing depends on it.
- "revise" means the same approach and the same artefact, fixed where the gap is. "replan" means the approach was wrong. They are different words because they are different events.
- You are the PLANNER, not the worker. NEVER do the objective's work yourself — do not edit files, run builds or produce the deliverable. Your entire output is the JSON decision; all work happens through delegations. (Write-tools are disabled for you.)
- "rationale", "currentPhase" and "strategy" are required on EVERY reply, whatever the action.
- Use "replan" when the APPROACH changed and you need a round to say so before ordering work. It costs a round and a planner call like anything else, so do not use it to think out loud.
- Scale your effort to the objective. A small, clear goal deserves a small plan: often ONE round with one delegation, then finish. Deep digging is itself a delegation ("readonly": true).
- Delegate ONLY to the pool agents listed above, by exact name.
- Each task prompt must be self-contained: the delegate sees nothing but that prompt (plus its own instructions). Include paths, context and acceptance criteria.
- Mark a task "readonly": true when it does not modify the working folder. Writers must be "readonly": false.
- Never delegate the same prompt to the same agent twice.
- A delegation that FAILS is evidence, not a verdict on the objective. Retry, revise, replan, skip it, ask the user, or finish honestly as "partial" — decide, and say which in "rationale".
- Mind the remaining budget; prefer finishing with a partial result over burning it.`;
}

/**
 * ‼️ M-16 — A FAILED DELEGATION IS EVIDENCE, NOT THE END OF THE MISSION.
 *
 * The classic round message states the results and asks for the next decision,
 * which is right for a lead following a recipe: a step that failed failed. An
 * objective has no recipe, so the same message read as "the plan broke" — and a
 * lead that treats one bad delegate as the verdict has thrown away the only
 * thing that made it adaptive. So when something fails, the options are named,
 * in the reply's own vocabulary, and it is said plainly that finishing now is
 * one choice among six rather than the default.
 */
function adaptiveRoundMessage(results: StepResult[], rem: RemainingBudget, notes?: string[]): string {
    const base = buildRoundMessage(results, rem, notes ?? [], true);
    const bad = results.filter(r => r.step.status === 'failed' || r.step.status === 'cancelled');
    if (!bad.length) { return base; }
    const names = bad.map(r => `"${r.step.title}" → ${r.step.agentName}`).join(', ');
    return base + `

## ${bad.length === 1 ? 'A delegation did not succeed' : `${bad.length} delegations did not succeed`}
${names}
This is a RESULT, not the end of the objective. Read what came back as evidence
and choose deliberately — do NOT finish merely because a step failed:
- retry — the same work, once, when the failure looks transient (a timeout, a lock)
- revise — the same intent with a better prompt, more context or a different agent
- replan — the approach itself was wrong: say so with "replan" and state the new strategy
- skip — that work was not needed for a required criterion after all; say which
- ask_user — the failure exposes a fork the objective does not settle
- finish with "partial" — the budget or the evidence says this is as far as it goes
Say in "rationale" which of these you chose and why.`;
}

const adaptiveProtocol: MissionProtocol = {
    mode: 'adaptive',
    briefing: adaptiveBriefing,
    parse: (raw, spec) => parseAdaptiveDecision(raw, spec),
    roundMessage: (results, rem, notes) => adaptiveRoundMessage(results, rem, notes)
};

/** The one place a mode becomes behaviour. */
export function protocolFor(spec: MissionSpec): MissionProtocol {
    return missionModeOf(spec) === 'adaptive' ? adaptiveProtocol : classicProtocol;
}

/** Compact one-liner per round — the ledger is the resume fallback. */
export function ledgerLine(round: MissionRound): string {
    // ‼️ M-18 — every primitive that RAN TASKS reads the same way in the
    // ledger, named by what it was. The ledger is the resume fallback: a lead
    // re-seeded from it has to see that round 3 was a `revise` and not a fresh
    // delegation, or it will re-order work it already ordered.
    if (round.action === 'delegate' || round.action === 'parallel'
        || round.action === 'review' || round.action === 'compare' || round.action === 'revise') {
        const steps = round.steps.map(s =>
            `${s.agentName}:"${s.title}"(${s.status}${s.costUSD !== undefined ? `,$${s.costUSD.toFixed(2)}` : ''})`).join(' · ');
        const on = round.steps[0]?.sources?.length ? ` on ${round.steps[0].sources.join(',')}` : '';
        return `R${round.n} ${round.action}${on} — ${steps}${round.rejectedReason ? ` [${round.rejectedReason}]` : ''}`;
    }
    if (round.action === 'ask_user') {
        return `R${round.n} ask_user — Q: ${round.question?.slice(0, 120) ?? ''} A: ${round.answer?.slice(0, 120) ?? '(pending)'}`;
    }
    if (round.action === 'evaluate') {
        const who = round.steps[0]?.agentName ?? 'lead';
        return `R${round.n} evaluate (${who}) — ${round.evaluationId ?? '?'}: ${round.thought.slice(0, 120)}`;
    }
    return `R${round.n} ${round.action}${round.stopReason ? ` [${round.stopReason}]` : ''} — ${round.thought.slice(0, 140)}`;
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

/**
 * ‼️ M-15 — THE MIGRATION, WHICH FOR A CLASSIC MISSION IS NOTHING AT ALL.
 *
 * Every mission written before this has no `mode`, and the whole promise of the
 * item is that such a record loads and runs exactly as it did. So this touches
 * nothing on a classic spec — no field is added, none is defaulted in, and the
 * object comes back out identical. An adaptive spec is put into canonical shape
 * instead: criteria get their stable ids, the pool is de-duplicated, blanks are
 * dropped, and `autonomy` takes its documented default. Idempotent, because a
 * store is loaded and saved many times over one mission's life.
 */
export function migrateSpec(spec: MissionSpec): MissionSpec {
    if (!isAdaptive(spec)) { return spec; }
    return { ...spec, mode: 'adaptive', ...normalizeObjective(spec) };
}

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
            this.specs = (Array.isArray(raw.specs) ? raw.specs : []).map(migrateSpec);
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
        // ‼️ X-45 — ATOMIC. `fs.renameSync` over an existing file is atomic on
        // both Windows and POSIX, so a crash mid-save leaves the PREVIOUS good
        // store in place rather than a truncated one. The old direct write was
        // survivable while a run was a handful of rounds; with strategy
        // versions, a runtime graph and evaluations in it, losing the file
        // means losing the fleet's whole mission history to one bad moment.
        const body = JSON.stringify(
            tokenizeDeep({ specs: this.specs, runs: this.runs }, this.portableRoots()), null, 2);
        const tmp = this.file + '.tmp';
        try {
            fs.writeFileSync(tmp, body, 'utf8');
            fs.renameSync(tmp, this.file);
        } catch {
            // the temp write or the rename failed — a save is never silently
            // skipped, so fall back to the direct write and tidy the temp away
            try { fs.writeFileSync(this.file, body, 'utf8'); } catch { /* best-effort */ }
            try { if (fs.existsSync(tmp)) { fs.unlinkSync(tmp); } } catch { /* best-effort */ }
        }
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
    /**
     * ‼️ X-45 — APPEND ONE LINE TO THE RUN'S JOURNAL, IF IT HAS ONE.
     *
     * Optional on purpose, and the engine never asks whether this mission is
     * adaptive: the extension supplies a writer for the runs that keep a trace
     * and nothing for the ones that do not, so the loop below has no second
     * branch and a classic mission costs exactly what it always did. It also
     * means a caller that has not been updated (a test harness, a replay tool)
     * keeps working with no journal rather than crashing.
     *
     * The ORDER matters and is fixed here: trace first, `onUpdate` (which
     * saves the snapshot) second — never the reverse.
     */
    trace?(type: MissionTraceType, payload?: Partial<MissionTraceEvent>): void;
    /**
     * ‼️ M-18 — the workflows this window actually has, for `run_workflow`.
     * Optional: a harness that supplies none simply has a lead that is offered
     * no chains and is told so if it names one. The engine never reads the
     * workflow store itself — it is the extension's, and a second reader of it
     * would be a second opinion about what exists.
     */
    workflows?(): { id: string; title: string; steps: number }[];
    /**
     * ‼️ M-18 — the objectives ABOVE this run, nearest first. Empty for a root
     * run, and absent in a harness that does not nest. It is what makes a cycle
     * detectable: a child asked to reach a goal that is already its own
     * ancestor would restate it for ever, every level convinced it had handed
     * the problem on.
     */
    ancestry?(): { runId: string; goal: string }[];
    now(): number;
}

/**
 * ‼️ M-18 — HOW DEEP AN OBJECTIVE MAY NEST. Not a tuning knob: nesting is how a
 * run buys itself another lead, and each level multiplies the planner calls
 * under one ceiling. Three levels is enough for "objective → sub-objective →
 * one more" and beyond that the honest answer is that the work should be
 * delegated, which is what the refusal says.
 */
export const MAX_MISSION_DEPTH = 3;

/** Absolute ceiling on planner calls per run: rounds + parse retries + guard
 *  nudges can never spin past this, whatever the planner does. */
function hardCallCap(spec: MissionSpec): number {
    return spec.limits.maxRounds + 6;
}

export class MissionEngine {
    private cancelRequested = false;
    private pauseRequested = false;
    /**
     * ‼️ M-16 — THE STRATEGY THE RUN IS ACTUALLY FOLLOWING, normalised, plus
     * how many times it has really moved. Held here rather than counted off the
     * rounds because that is the whole distinction the item exists to make: a
     * lead that restates the same approach for five rounds has one strategy,
     * not five, and a version number that ticked per round would say the
     * opposite while looking equally plausible.
     */
    private strategyKey = '';
    private strategyVersion = 0;
    /** the decision node the next one hangs under — '' before the first round */
    private lastDecisionId = '';
    /** the action ids whose results the lead was last shown: the default fan-in
     *  when the lead does not name its own `basedOn` */
    private lastResultIds: string[] = [];
    /** ‼️ M-17 — the success gate refuses ONCE. A second insistence is not met
     *  with a third refusal (that would spin to the call cap and end as
     *  `failed`, which is less true than what actually happened) — the finish
     *  is taken and the verdict is brought down to `partial` with the unmet
     *  criteria named. Honest stop, not a standoff. */
    private gateRefused = false;
    /**
     * ‼️ M-15 — chosen ONCE, at construction, from the spec's own mode. The loop
     * below never asks which kind of mission it is running: everything that
     * differs between the two is behind this, and everything that does not is
     * shared code with nothing to fork.
     */
    readonly protocol: MissionProtocol;

    constructor(
        readonly spec: MissionSpec,
        readonly run: MissionRun,
        private hints: TeamHint[],
        private deps: MissionEngineDeps
    ) {
        this.protocol = protocolFor(spec);
        // ‼️ M-16 — A RESUMED RUN PICKS ITS STRATEGY BACK UP. Without this the
        // first decision after a window reload always looks like a change of
        // approach (the key is empty, so anything differs from it) and the
        // version number climbs once per reload — a figure that would say the
        // lead kept changing its mind when all that happened was a restart.
        if (run.strategy) {
            this.strategyVersion = run.strategy.version;
            this.strategyKey = normalizeStrategy(run.strategy.text);
        }
        const last = run.rounds[run.rounds.length - 1];
        if (last) { this.lastDecisionId = 'd' + last.n; }
        this.lastResultIds = last?.steps.map(s => s.id) ?? [];
    }

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
        this.deps.trace?.('run.finished', {
            status,
            ...(result ? { verdict: result.verdict } : {}),
            ...(result?.stopReason ? { reason: result.stopReason } : {}),
            ...(result?.summary || note ? { text: result?.summary ?? note } : {}),
            nodeId: 'end', actor: 'lead',
            parentRefs: this.lastDecisionId ? [this.lastDecisionId] : [],
            inputRefs: [...this.lastResultIds]
        });
        this.deps.onUpdate(this.run);
    }

    /**
     * ‼️ M-16 — ONE PLANNER BOUNDARY, ONE INJECTION. The steers due now are
     * taken, marked applied on the run AND in the journal, and appended to the
     * prompt. Marking BEFORE the planner call is deliberate: a crash mid-call
     * must lose the steer rather than deliver it twice, because the lead may
     * already have read it and a repeated instruction is a repeated action.
     */
    private takeGuidance(): string {
        const due = pendingGuidance(this.run);
        if (!due.length) { return ''; }
        const at = this.deps.now();
        for (const g of due) {
            g.appliedAt = at;
            this.deps.trace?.('human.guided', { askId: g.id, text: g.text, applied: true, actor: 'user' });
        }
        this.deps.onUpdate(this.run);
        return `\n\n## Guidance from the user${due.length > 1 ? ` (${due.length} messages)` : ''}\n`
            + due.map(g => g.text).join('\n\n')
            + '\nTake this into account from this decision onward. It is NOT an instruction to work already in flight.';
    }

    /**
     * ‼️ M-16 — STEERS ALREADY TAKEN, REPLAYED WHEN THE SESSION IS RE-SEEDED.
     *
     * This is NOT a second application and it does not contradict "exactly
     * once": the planner session died and the lead is being rebuilt from the
     * briefing and the ledger, so a standing instruction it was already given
     * is part of what it knew. Leaving it out would lose the steer for the rest
     * of the run — and the resume-fallback is common enough that "your
     * guidance survives unless the session drops" is not a promise worth
     * making. It is labelled as in force rather than as new, so a lead reading
     * it does not act on it twice.
     */
    private guidanceHistory(): string {
        const taken = (this.run.guidance ?? []).filter(g => g.appliedAt !== undefined);
        if (!taken.length) { return ''; }
        return '\n\n## Guidance the user has given (already in force, not new instructions)\n'
            + taken.map(g => `- ${g.text}`).join('\n');
    }

    /**
     * ‼️ M-16 — THE DECISION NODE, AND A STRATEGY VERSION ONLY IF ONE IS DUE.
     *
     * Written in this order every time: the node first, then the revision that
     * points back at it. That way `sourceAction` is always a BACKWARD reference
     * to a line already on disk, which is what keeps a replayed tail sane, and
     * the node carries the version that was in force when it was taken.
     */
    private recordDecision(round: MissionRound, d: PlannerDecision): boolean {
        const r = d.reflection;
        const text = (r?.strategy || d.thought || '').trim();
        const key = normalizeStrategy(text);
        const changed = !!key && key !== this.strategyKey;
        if (changed) {
            this.strategyKey = key;
            this.strategyVersion++;
            this.run.strategy = {
                version: this.strategyVersion, text, at: this.deps.now(),
                ...(r?.phase ? { phase: r.phase } : {})
            };
        } else if (this.run.strategy && r?.phase) {
            // the approach held but the lead moved on — the phase is its own fact
            this.run.strategy.phase = r.phase;
        }
        const nodeId = 'd' + round.n;
        const inputs = (r?.basedOn ?? []).length ? r!.basedOn : this.lastResultIds;
        if (r?.phase) { round.phase = r.phase; }
        if (this.strategyVersion) { round.strategyVersion = this.strategyVersion; }
        this.deps.trace?.('decision.made', {
            nodeId, actor: 'lead', text: r?.rationale || d.thought,
            status: d.action,
            version: this.strategyVersion,
            ...(r?.phase ? { phase: r.phase } : {}),
            parentRefs: this.lastDecisionId ? [this.lastDecisionId] : [],
            inputRefs: [...inputs]
        });
        if (changed) {
            this.deps.trace?.('strategy.changed', {
                version: this.strategyVersion, strategy: text, sourceAction: nodeId,
                ...(r?.phase ? { phase: r.phase } : {}),
                ...(r?.changeReason ? { reason: r.changeReason } : {})
            });
        }
        this.lastDecisionId = nodeId;
        return changed;
    }

    /** The verdicts that still speak for the work as it stands now. */
    private liveEvaluations(): MissionEvaluation[] {
        return currentEvaluations(this.run.evaluations ?? [], settledCriteriaWork(this.run));
    }

    /** Record one verdict — on the run, in the journal, under one id. */
    private recordEvaluation(
        round: MissionRound, targets: string[], evaluator: MissionEvaluation['evaluator'],
        v: { findings: CriterionFinding[]; advice: EvaluationAdvice; confidence?: number; note?: string }
    ): MissionEvaluation {
        const ev: MissionEvaluation = {
            id: 'e' + round.n + '-' + ((this.run.evaluations?.length ?? 0) + 1),
            targets: [...targets], evaluator,
            findings: v.findings, advice: v.advice,
            ...(v.confidence !== undefined ? { confidence: v.confidence } : {}),
            ...(v.note ? { note: v.note } : {}),
            at: this.deps.now()
        };
        this.run.evaluations = [...(this.run.evaluations ?? []), ev];
        round.evaluationId = ev.id;
        // One line per criterion, because that is the grain every reader of the
        // journal wants — and each carries the evaluation id, so the record it
        // belongs to is never guessed at from timestamps.
        for (const f of ev.findings) {
            this.deps.trace?.('evaluation.recorded', {
                actionId: ev.id, criterionId: f.criterionId,
                met: f.verdict === 'pass', verdict: f.verdict,
                text: f.evidence || f.gap,
                actor: evaluator.kind === 'lead' ? 'lead' : (evaluator.agentId || evaluator.agentName),
                inputRefs: [...targets],
                status: ev.advice
            });
        }
        return ev;
    }

    /** How a verdict reads back to the lead, in the words it must answer in. */
    private evaluationReport(ev: MissionEvaluation, criteria: readonly { id: string; text: string; required: boolean }[]): string {
        const byId = new Map(criteria.map(c => [c.id, c]));
        const rows = ev.findings.map(f => {
            const c = byId.get(f.criterionId);
            return `- [${f.criterionId}] ${c?.text ?? ''}${c && !c.required ? ' (optional)' : ''} → **${f.verdict.toUpperCase()}**`
                + (f.evidence ? `\n  evidence: ${f.evidence}` : '')
                + (f.gap ? `\n  gap: ${f.gap}` : '');
        });
        return `## Evaluation ${ev.id} — by ${ev.evaluator.kind === 'lead' ? 'you' : (ev.evaluator.agentName ?? 'a reviewer')}\n`
            + rows.join('\n')
            + `\nAdvice: ${ev.advice}${ev.note ? ` — ${ev.note}` : ''}`;
    }

    /**
     * ‼️ M-18 — THE BRIEFING PLUS WHAT THIS WINDOW ACTUALLY HAS. A lead offered
     * `run_workflow` and shown no chains would be guessing at names, which is
     * the one way to make a primitive worse than not having it. Inserted before
     * the answer schema rather than appended after it: text that follows a JSON
     * block gets read as part of it.
     */
    private briefingText(rem: RemainingBudget): string {
        const base = this.protocol.briefing(this.spec, this.hints, rem);
        const list = isAdaptive(this.spec) ? (this.deps.workflows?.() ?? []) : [];
        if (!list.length) { return base; }
        const block = '## Workflows you may run\n'
            + list.map(w => `- ${w.title} (${w.steps} step${w.steps === 1 ? '' : 's'})`).join('\n')
            + '\nThese are chains that already exist. Run one with "run_workflow" when it encodes the work you need;'
            + ' you cannot compose a new one, and you do not drive its steps.\n\n';
        const marker = '## How to answer';
        return base.includes(marker) ? base.replace(marker, block + marker) : base + '\n\n' + block;
    }

    private stepResults(steps: MissionStep[]): StepResult[] {
        return steps.map(step => ({
            step,
            // ‼️ M-18 — a unit whose result IS a sentence (a child objective's
            // verdict) says so directly; everything else is read out of the
            // archive it wrote, as it always was.
            excerpt: step.resultText
                ?? (step.outputFile ? outputExcerpt(this.deps.readOutputBody(step.outputFile)) : '')
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
                ? this.briefingText(rem)
                : (roundMsg ?? 'Decide the next round. Reply with ONLY the JSON decision object.');
            if (guard) { prompt += finishOnlyNote(guard); }
            // ‼️ M-16 — THE PLANNER BOUNDARY IS HERE and nowhere else: the
            // prompt is complete, the previous wave has settled, and nothing is
            // in flight to be contradicted. A steer taken anywhere else would
            // either miss this round or race a running Task.
            const steer = this.takeGuidance();
            if (steer) { prompt += steer; }
            roundMsg = undefined;

            run.status = 'running';
            this.setNow(`lead is planning round ${run.rounds.length + 1}`);
            deps.onUpdate(run);
            let pr = await deps.runPlanner(prompt, run.plannerSessionId);
            if (!pr.ok && run.plannerSessionId) {
                // resume-fallback: fresh session re-seeded from briefing + ledger
                run.plannerSessionId = undefined;
                let fb = this.briefingText(rem) +
                    (run.ledger.length ? '\n\n## History so far (you are mid-mission)\n' + run.ledger.join('\n') : '') +
                    this.guidanceHistory() +
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
            run.totalTokens = (run.totalTokens ?? 0) + (pr.tokens ?? 0);

            const parsed = this.protocol.parse(pr.raw ?? '', spec);
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
                        {
                            verdict: 'partial',
                            summary: 'Stopped at the budget limit; the planner kept delegating.',
                            stopReason: 'hard-limit'
                        },
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
            // ‼️ M-16 — every round is a decision node; a strategy version is
            // cut only when the approach really moved.
            const strategyMoved = this.recordDecision(round, d);

            // ---- replan: the approach changed and nothing else this round ----
            if (d.action === 'replan') {
                run.rounds.push(round);
                run.ledger.push(ledgerLine(round));
                deps.onUpdate(run);
                roundMsg = (strategyMoved
                    ? `Recorded as strategy v${this.strategyVersion}.`
                    : 'That is the strategy you were already following, so no new version was cut.')
                    + ' Now decide the work it calls for — delegate, ask the user, or finish.'
                    + '\nReply with ONLY the JSON decision object.';
                continue;
            }

            if (d.action === 'finish' || d.action === 'abort') {
                // ‼️ M-17 — THE SUCCESS GATE. "success" is a claim about the
                // OBJECTIVE, and the only thing entitled to make it is a
                // current evaluation of every required criterion. A delegate
                // exiting cleanly says the work ran.
                let verdict = d.verdict;
                let summary = d.summary;
                let gate: ReturnType<typeof successGate> | undefined;
                if (isAdaptive(spec) && d.action === 'finish' && verdict === 'success') {
                    gate = successGate(spec.successCriteria ?? [], this.liveEvaluations());
                    if (!gate.ok && !this.gateRefused) {
                        this.gateRefused = true;
                        const rows = gate.unmet
                            .map(u => `- [${u.id}] ${u.text} → ${u.verdict}`).join('\n');
                        roundMsg = `Not accepted: "success" needs a CURRENT pass on every required criterion, and these do not have one:\n${rows}\n`
                            + '\nA verdict of "unjudged" means nothing has evaluated it; "unknown" means an evaluation could not tell; "fail" means it was judged and missed. An evaluation goes stale when work for its criteria settles after it.\n'
                            + 'Either close those gaps (a targeted "revise" delegation, then "evaluate"), or finish honestly with "partial" and say what is missing.'
                            + '\nReply with ONLY the JSON decision object.';
                        continue;
                    }
                    if (!gate.ok) {
                        // Insisted. Take the finish — the run really is over —
                        // but record what is true rather than what was claimed.
                        verdict = 'partial';
                        summary = summary
                            + `\n\n(Recorded as partial: "success" was claimed without a current pass on `
                            + `${gate.unmet.map(u => u.id).join(', ')}.)`;
                    }
                }
                round.stopReason = d.stopReason;
                run.rounds.push(round);
                run.ledger.push(ledgerLine(round));
                this.end(d.action === 'finish' ? 'done' : 'failed', {
                    verdict, summary,
                    ...(d.stopReason ? { stopReason: d.stopReason } : {}),
                    ...(gate && !gate.ok ? { unmet: gate.unmet } : {})
                });
                return;
            }

            // ---- evaluate: judge the criteria, by the lead or by a reviewer ----
            if (d.action === 'evaluate') {
                const criteria = spec.successCriteria ?? [];
                if (!d.reviewer) {
                    const ev = this.recordEvaluation(round, d.targets, { kind: 'lead' }, {
                        findings: d.findings ?? [], advice: d.advice ?? 'revise',
                        ...(d.confidence !== undefined ? { confidence: d.confidence } : {}),
                        ...(d.note ? { note: d.note } : {})
                    });
                    run.rounds.push(round);
                    run.ledger.push(ledgerLine(round));
                    deps.onUpdate(run);
                    roundMsg = this.evaluationReport(ev, criteria)
                        + '\n\nThat verdict is on the record. Act on it — or finish, if the gate is open.'
                        + '\nReply with ONLY the JSON decision object.';
                    continue;
                }
                // An independent review is an ORDINARY delegation: same budget,
                // same waves, same cancel. Nothing about a reviewer earns it a
                // private execution path.
                const member = allowedAgents(spec).find(m => m.agentName === d.reviewer);
                const material = this.stepResults(
                    run.rounds.flatMap(r => r.steps)
                        .filter(s => d.targets.length ? d.targets.includes(s.id) : s.status === 'done')
                        .slice(-6))
                    .map(r => `### ${r.step.agentName} — "${r.step.title}" (${r.step.status})\n${r.excerpt || '(no output)'}`)
                    .join('\n\n');
                const reviewStep: MissionStep = {
                    id: newMissionId(), round: round.n,
                    agentId: member?.agentId ?? '', agentName: d.reviewer,
                    title: `review against the criteria (round ${round.n})`,
                    prompt: buildReviewPrompt(spec.goal, criteria, material, spec.constraints ?? []),
                    readonly: true, evaluates: true, status: 'queued'
                };
                round.steps = [reviewStep];
                run.rounds.push(round);
                deps.trace?.('action.created', {
                    actionId: reviewStep.id, kind: 'task', agentId: reviewStep.agentId,
                    agentName: reviewStep.agentName, title: reviewStep.title,
                    actor: reviewStep.agentId || reviewStep.agentName,
                    parentRefs: this.lastDecisionId ? [this.lastDecisionId] : [],
                    inputRefs: [...d.targets]
                });
                run.status = 'running';
                this.setNow(`round ${round.n}: ${d.reviewer} is reviewing`);
                deps.onUpdate(run);
                await deps.delegateWave(run, round.steps);
                if (this.cancelRequested) { this.end('cancelled'); return; }
                run.totalCostUSD += reviewStep.costUSD ?? 0;
                run.totalTokens = (run.totalTokens ?? 0) + (reviewStep.tokens ?? 0);
                // ‼️ A REVIEW THAT CANNOT BE READ SAYS NOTHING ABOUT THE WORK.
                // Not `fail` — that would blame the delegate for the reviewer's
                // timeout — and not silence, which would let the run forget it
                // ever asked. `unknown` with the reason is the true statement,
                // and the gate treats it exactly as it should: not a pass.
                let parsedEval;
                if (reviewStep.status !== 'done') {
                    parsedEval = unreadableEvaluation(criteria, `the review ${reviewStep.status}`);
                } else {
                    const body = reviewStep.outputFile ? deps.readOutputBody(reviewStep.outputFile) : '';
                    const p = parseEvaluation(body, criteria);
                    parsedEval = p.ok ? p.value : unreadableEvaluation(criteria, p.error);
                }
                const ev = this.recordEvaluation(round, d.targets,
                    { kind: 'agent', ...(member?.agentId ? { agentId: member.agentId } : {}), agentName: d.reviewer },
                    parsedEval);
                run.ledger.push(ledgerLine(round));
                deps.onUpdate(run);
                this.lastResultIds = [reviewStep.id];
                roundMsg = this.evaluationReport(ev, criteria)
                    + '\n\n' + remLine(remainingBudget(spec, run, deps.now()))
                    + '\nAct on it — or finish, if the gate is open.'
                    + '\nReply with ONLY the JSON decision object.';
                continue;
            }

            if (d.action === 'ask_user') {
                round.question = d.question;
                run.rounds.push(round);
                run.status = 'waiting-user';
                this.setNow('waiting for your answer');
                // ‼️ ASKED BEFORE THE AWAIT, ANSWERED AFTER IT. That is what
                // makes a reload able to put the question back: an `asked` with
                // no `answered` on disk IS the pending state, and it can only
                // say so if it was written before the window could close.
                deps.trace?.('human.asked', { askId: 'q' + round.n, flavor: 'question', text: d.question });
                deps.onUpdate(run);
                const waitFrom = deps.now();
                const answer = await deps.askUser(run, d.question);
                run.waitedMs = (run.waitedMs ?? 0) + (deps.now() - waitFrom);
                if (this.cancelRequested) { this.end('cancelled'); return; }
                round.answer = answer ?? '(no answer — user skipped)';
                deps.trace?.('human.answered', { askId: 'q' + round.n, text: round.answer });
                run.ledger.push(ledgerLine(round));
                deps.onUpdate(run);
                roundMsg = `## User's answer\n${round.answer}\n\nDecide the next round. Reply with ONLY the JSON decision object.`;
                continue;
            }

            // ---- the work primitives: delegate · parallel · review · compare · revise ----
            const notes: string[] = [];
            // ‼️ M-18 — A TYPED INTENT BECOMES ONE ORDINARY TASK, and the
            // engine — not the lead — attaches the material. Built here rather
            // than in the parser because only the RUN knows what an id
            // produced; and if it knows nothing about one, the lead is told so
            // rather than a delegate being sent to work on an empty quotation.
            let requested: PlannerTaskReq[];
            let intent: TaskIntent | undefined;
            let sources: string[] | undefined;
            if (d.action === 'review' || d.action === 'compare' || d.action === 'revise') {
                const prim = intentPrimitive(d.action) as MissionPrimitive;
                const all = run.rounds.flatMap(r => r.steps);
                const known = d.targets
                    .map(id => all.find(s => s.id === id))
                    .filter((s): s is MissionStep => !!s);
                const missing = d.targets.filter(id => !all.some(s => s.id === id));
                if (missing.length) {
                    run.ledger.push(`R? ${d.action} rejected — no result with id ${missing.join(', ')}`);
                    roundMsg = `No result of this run carries the id ${missing.map(m => `"${m}"`).join(', ')}. `
                        + `The ids you may name are the ones shown with each round's results`
                        + (all.length ? `: ${all.slice(-8).map(s => s.id).join(', ')}` : ' — and nothing has run yet.')
                        + '\nName real ids, or choose different work. Reply with ONLY the JSON decision object.';
                    continue;
                }
                intent = d.action;
                sources = [...d.targets];
                const material = this.stepResults(known)
                    .map(r => `### [${r.step.id}] ${r.step.agentName} — "${r.step.title}" (${r.step.status})\n`
                        + (r.excerpt || '(this step produced no output)'))
                    .join('\n\n');
                // ‼️ A REVISE INHERITS THE CRITERIA OF WHAT IT REVISES. Without
                // it, correcting an artefact would leave the old pass looking
                // current — the staleness rule can only fire on criteria the
                // work says it serves, and re-fixing a file plainly serves the
                // same ones the first attempt did.
                const inherited = [...new Set(known.flatMap(s => s.criteria ?? []))];
                const criteria = d.criteria?.length ? d.criteria : inherited;
                requested = [{
                    agent: d.agent,
                    title: d.title || intentTitle(d.action, d.targets),
                    prompt: buildIntentPrompt(prim, d.ask, material, spec.goal),
                    readonly: prim.intent!.readonly,
                    ...(criteria.length ? { criteria } : {})
                }];
            } else if (d.action === 'run_mission') {
                // ‼️ THE TWO THINGS THAT KEEP NESTING FROM BEING A FORK BOMB,
                // checked HERE because only the run knows where it sits: how
                // deep it already is, and what objectives are above it. An
                // objective that is already its own ancestor is the cycle —
                // it would restate the same goal for ever, each level convinced
                // it had delegated the problem.
                const depth = (run.depth ?? 0) + 1;
                if (depth > MAX_MISSION_DEPTH) {
                    run.ledger.push(`R? run_mission rejected — depth cap (${MAX_MISSION_DEPTH})`);
                    roundMsg = `Refused: this run is already ${run.depth ?? 0} level(s) deep and the cap is `
                        + `${MAX_MISSION_DEPTH}. Do this work with delegations instead of another child objective.`
                        + '\nReply with ONLY the JSON decision object.';
                    continue;
                }
                const above = (deps.ancestry?.() ?? []).map(a => normalizeStrategy(a.goal));
                if (above.includes(normalizeStrategy(d.goal))) {
                    run.ledger.push('R? run_mission rejected — that objective is already an ancestor of this run');
                    roundMsg = 'Refused: an objective with that goal is already running above this one. '
                        + 'Starting it again would be this run asking itself for the same thing. '
                        + 'Break the work down differently, or do it with delegations.'
                        + '\nReply with ONLY the JSON decision object.';
                    continue;
                }
                requested = [{
                    agent: d.title || 'child objective',
                    title: d.title || `sub-objective: ${d.goal.slice(0, 80)}`,
                    prompt: d.goal,
                    readonly: false,
                    kind: 'mission',
                    child: {
                        goal: d.goal,
                        successCriteria: d.successCriteria ?? [],
                        ...(d.constraints?.length ? { constraints: d.constraints } : {}),
                        ...(d.title ? { title: d.title } : {}),
                        depth
                    },
                    ...(d.criteria?.length ? { criteria: d.criteria } : {})
                }];
            } else if (d.action === 'run_workflow') {
                // ‼️ THE CHAIN HAS TO REALLY EXIST, and if it does not the lead
                // is shown what this window actually has rather than a refusal
                // it cannot act on. Checked here and not in the parser for the
                // same reason a target id is: only the run can see the list.
                const list = deps.workflows?.() ?? [];
                const wf = list.find(x => x.id === d.workflow)
                    ?? list.find(x => x.title.toLowerCase() === d.workflow.toLowerCase());
                if (!wf) {
                    run.ledger.push(`R? run_workflow rejected — no workflow "${d.workflow}"`);
                    roundMsg = `There is no workflow called "${d.workflow}". `
                        + (list.length
                            ? `This window has: ${list.map(x => `"${x.title}"`).join(', ')}.`
                            : 'This window has none — the work has to be delegated.')
                        + '\nChoose one that exists or delegate the work. Reply with ONLY the JSON decision object.';
                    continue;
                }
                requested = [{
                    agent: wf.title,
                    title: d.ask ? `${wf.title} — ${d.ask.slice(0, 80)}` : `run workflow "${wf.title}"`,
                    prompt: d.ask ?? '',
                    // A chain writes unless every step of it reads, which is not
                    // knowable from here — so it takes a writer's lane and is
                    // serialised against other writers. The safe direction.
                    readonly: false,
                    kind: 'workflow', workflowId: wf.id,
                    ...(d.criteria?.length ? { criteria: d.criteria } : {})
                }];
            } else if (d.action === 'delegate' || d.action === 'parallel') {
                requested = d.tasks;
            } else {
                // unreachable: every other shape returned or continued above
                requested = [];
            }
            let tasks = requested.filter(t => {
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

            // ‼️ M-15 — THE TEAM OR THE POOL, whichever this mission has. A
            // classic spec's team is its own list; an adaptive one has no team
            // and picks from the pool, and looking only at `spec.team` there
            // would give every adaptive step an empty `agentId` — a delegation
            // with nobody to run it.
            const roster = allowedAgents(spec);
            round.steps = tasks.map(t => {
                const member = roster.find(m => m.agentName === t.agent);
                // …and the choice itself is recorded, once per agent per run:
                // an adaptive lead assigning work IS the moment the cast is
                // decided, and it is decided nowhere else.
                if (member && isAdaptive(spec)) {
                    run.roles = bindRuntimeRole(run.roles ?? [], member, t.expect || t.title, deps.now());
                }
                return {
                    id: newMissionId(),
                    round: round.n,
                    agentId: member?.agentId ?? '',
                    agentName: t.agent,
                    title: t.title,
                    prompt: t.prompt + (t.expect ? `\n\nSuccess criteria: ${t.expect}` : ''),
                    expect: t.expect,
                    readonly: t.readonly,
                    ...(t.criteria ? { criteria: t.criteria } : {}),
                    ...(intent ? { intent, ...(sources ? { sources } : {}) } : {}),
                    ...(t.kind && t.kind !== 'task' ? { kind: t.kind } : {}),
                    ...(t.workflowId ? { workflowId: t.workflowId } : {}),
                    ...(t.child ? { child: t.child } : {}),
                    status: 'queued' as MissionStepStatus
                };
            });
            run.rounds.push(round);
            // Created, not started: the work exists as a decision now and
            // becomes a real task only in delegateWave, which records that
            // itself. Keeping the two apart is what lets a reload tell "the
            // lead decided this and nothing ran" from "it ran and we lost it".
            for (const s of round.steps) {
                deps.trace?.('action.created', {
                    actionId: s.id, kind: s.kind ?? 'task', agentId: s.agentId,
                    agentName: s.agentName, title: s.title,
                    // ‼️ M-16 — every delegation of a round hangs under the SAME
                    // decision node, which is what makes parallel work read as a
                    // branch rather than a chain. The fan-in lives on the
                    // decision (it is the lead that read several results), so it
                    // is not repeated here — one fact, one place.
                    actor: s.agentId || s.agentName,
                    parentRefs: this.lastDecisionId ? [this.lastDecisionId] : [],
                    // ‼️ M-18 — a typed intent DOES carry its own fan-in, and it
                    // is the exception the rule above expects: the work was
                    // built out of named results, so the edge belongs on the
                    // step rather than only on the decision that ordered it.
                    ...(s.sources?.length ? { inputRefs: [...s.sources] } : {}),
                    ...(s.intent ? { intent: s.intent } : {})
                });
            }
            deps.onUpdate(run);

            if (spec.approvalMode === 'each-round') {
                run.status = 'waiting-approval';
                this.setNow(`waiting for your approval (round ${round.n})`);
                deps.trace?.('human.asked', {
                    askId: 'a' + round.n, flavor: 'approval',
                    text: `round ${round.n} — ${round.steps.length} delegation(s)`
                });
                deps.onUpdate(run);
                const waitFrom = deps.now();
                const ok = await deps.requestApproval(run, round);
                deps.trace?.('human.answered', { askId: 'a' + round.n, text: ok ? 'approved' : 'rejected' });
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
            // ‼️ M-18 — `parallel` IS A CLAIM THE ENGINE MAY REFUSE, out loud.
            // The one-writer-per-folder rule is not negotiable — two writers in
            // one working folder is corruption, not speed — so the waves are
            // planned exactly as for a delegation and the lead is TOLD when its
            // claim could not be honoured. Silently serialising would leave it
            // believing a timing it never got.
            if (d.action === 'parallel' && waves.length > 1) {
                notes.push(`you asked for these ${tasks.length} tasks in parallel, but they ran in `
                    + `${waves.length} waves — a working folder takes one writer at a time, and `
                    + `${tasks.filter(t => !t.readonly).length} of them write. Mark work "readonly": true `
                    + 'when it does not modify the folder, or split the writing.');
            }
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
            // ‼️ …and the tokens, which is the half that moves on a plan-billed
            // delegate. Without this a wave of Codex steps advanced no limit at
            // all: no dollars (there are none), and rounds/tasks are too coarse
            // to be a budget.
            run.totalTokens = (run.totalTokens ?? 0)
                + round.steps.reduce((a, s) => a + (s.tokens ?? 0), 0);
            run.ledger.push(ledgerLine(round));
            deps.onUpdate(run);
            // What the lead is about to be shown IS the fan-in of its next
            // decision — recorded here so the graph does not have to guess it
            // from timestamps when the reply names no `basedOn`.
            this.lastResultIds = round.steps.map(s => s.id);
            roundMsg = this.protocol.roundMessage(
                this.stepResults(round.steps),
                remainingBudget(spec, run, deps.now()),
                notes);
        }
    }
}
