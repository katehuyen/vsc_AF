import { resolveInputs, WorkflowInput } from './workflowInputs';
import * as fs from 'fs';
import * as path from 'path';
import {
    bindRuntimeRole, isAdaptive, MissionAutonomy, MissionMode, MissionObjective,
    MissionPoolMember, MissionRuntimeRole, missionModeOf, normalizeObjective, validateObjective
} from './missionMode';
import {
    buildReviewPrompt, CriterionFinding, currentEvaluations, EVALUATION_SCHEMA, EvaluationAdvice,
    isStopReason, MissionEvaluation, parseEvaluation, SettledWork, STOP_REASONS, StopReason,
    successGate, unreadableEvaluation
} from './missionEvaluation';
import {
    MissionActionKind, MissionTraceEvent, MissionTraceRef, MissionTraceType, normalizeStrategy
} from './missionTrace';
import {
    buildIntentPrompt, intentPrimitive, intentTitle, MissionPrimitive, primitiveFor,
    PrimitiveName, PRIMITIVES, primitivesFor, TaskIntent, unknownActionError
} from './missionPrimitives';
import { describeFailure, failure, StepFailure } from './missionFailure';
// ‼️ X-249 (2/n) — the engine's own envelope, declared beside the line that
// produced it. This file keeps the NAME four call sites import, not the shape.
import { OneShotEnvelope, oneShotEnvelope } from './oneShot';
import {
    buildSpeakerPrompt, conversationDigest, conversationMessages, intentFlags, intentKind, LaneCarry,
    LaneHandover, laneHandoverPct, MessageIntent, messageIntentMenu, MESSAGE_VISIBILITY, MessageVisibility, MissionConversation,
    MissionMessage, newConversationId, newMessageId, refuseMessage
} from './missionConversation';
import {
    chairCall, COUNCIL_EXITS, councilBrief, councilDigest, councilExit, councilOf, MissionCouncil,
    newCouncilId, normalizeOptions, readVoteChoice, refuseCouncilTurn
} from './missionCouncil';
import type { DelegateOrigin, DelegateRun } from './missionMode';
import type { PlannerLaunch } from './plannerLaunch';
import { expandDeep, PortableRoot, tokenizeDeep } from './portablePaths';
import { extractJson } from './util';

export {
    deleteTrace, MISSION_TRACE_SCHEMA, MISSION_TRACE_TYPES, MissionTraceWriter, normalizeStrategy,
    orphanTraceFiles, projectTrace, readTrace, reconcileRun, runIdOfTraceFile, selectTraceEvents,
    traceFileFor
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
    MissionEvaluator, ParsedEvaluation, SettledWork, StopReason
} from './missionEvaluation';

export {
    attemptOf, classifyTaskFailure, couldHaveWritten, describeFailure, failure, FAILURE_KINDS,
    retryAdvice, shortFailure
} from './missionFailure';
export type {
    FailedStepLike, FailureClass, FailureKind, FailureRefs, RetryAdvice, StepFailure
} from './missionFailure';

export {
    buildIntentPrompt, intentPrimitive, intentTitle, primitiveFor, primitiveMenu, primitiveNamed,
    PRIMITIVES, primitivesFor, unknownActionError
} from './missionPrimitives';
export type {
    MissionPrimitive, PrimitiveIntent, PrimitiveName, PrimitiveShape, TaskIntent
} from './missionPrimitives';

export {
    buildSpeakerPrompt, conversationDigest, intentFlags, conversationMessages, intentKind, MESSAGE_INTENT_NAMES,
    MESSAGE_INTENTS, messageIntentMenu, MESSAGE_VISIBILITY, messageLine, newConversationId,
    newMessageId, openThreads, participantBusy, refuseMessage
} from './missionConversation';
export type {
    ConversationDigest, LaneCarry, LaneHandover, MessageIntent, MessageIntentKind, MessageRequest, MessageState,
    MessageVisibility, MissionConversation, MissionMessage
} from './missionConversation';

export {
    chairCall, COUNCIL_EXIT_NAMES, COUNCIL_EXITS, councilBrief, councilDigest, councilExit,
    councilExitMenu, councilOf, councilTurns, newCouncilId, normalizeOptions, readVoteChoice,
    refuseCouncilTurn,
    tallyVotes
} from './missionCouncil';
export type { CouncilExit, CouncilTally, CouncilVote, MissionCouncil } from './missionCouncil';

export {
    bindRuntimeRole, DEFAULT_AUTONOMY, describeDelegateRun, isAdaptive, missionModeOf,
    normalizeCriteria, normalizeObjective, normalizePool, poolFromFleet, resolveDelegateRun,
    resolveLead, validateMissionInput, validateObjective
} from './missionMode';
export type {
    DelegateOrigin, DelegateRun, DelegateRunLayers, FleetAgent, MissionAutonomy, MissionMode,
    MissionObjective, MissionPoolMember, MissionRuntimeRole, SuccessCriterion
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
     * ‼️ M-18 — HOW HARD THIS MEMBER THINKS, which was the one run dimension a
     * member could not state. Model, engine and permission mode were all per
     * member; effort was not, so a reviewer that wanted `low` and a planner that
     * wanted `xhigh` had to be the same. Empty = whatever `resolveDelegateRun`
     * resolves from the agent's own per-engine default, then the fleet's.
     *
     * Refused at launch on an engine that has no such setting — the task's own
     * `headlessEffortRefusal` already owns that rule and this changes nothing
     * about it.
     */
    effort?: string;
    /**
     * ‼️ X-107 — WHICH ROUTE THIS MEMBER'S DELEGATIONS ARE SERVED BY, on exactly
     * the axis `engine` and `account` are.
     *
     * It belongs per MEMBER for the reason the engine does: "the reviewer on the
     * plan-billed endpoint, the drafter on the cheap one" is the decision people
     * actually make, and before this it could only be made for the whole mission
     * or not at all. Empty = the mission's own route, and empty there = the
     * agent's standing record, resolved at the spawn like every other run.
     */
    providerId?: string;
    /**
     * ‼️ Claude routes only — which tier of the route ABOVE. It travels WITH
     * `providerId` and is dropped without one: `opus` is `kimi-k2-thinking` on
     * one route and `MiniMax-M2` on another (X-101), so a tier inherited across
     * a route change is one word meaning two things.
     */
    tier?: string;
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
    /**
     * ‼️ X-225 — WHOSE PLAN PAYS FOR THIS MEMBER'S DELEGATIONS. Empty = the
     * mission's own, and empty there = nothing stated, so the spawn resolves
     * the engine's standing sign-in exactly as every mission before this did.
     *
     * Per MEMBER for the same reason the model and the permission mode are: a
     * mission is where several agents work at once, and "the reviewer runs on
     * the account that still has window left" is the decision a person actually
     * makes on a machine rotating three plans. It used to be refused on the
     * mission's behalf — see `resolveDelegateRun` for what that cost.
     */
    account?: string;
}

/**
 * ‼️ EVERY CEILING HERE IS THE USER'S TO SET, AND `0` MEANS UNLIMITED.
 *
 * A command centre hands out sane DEFAULTS; it does not get to decide on the
 * owner's behalf that no mission may cost more than $500 or run longer than a
 * day. Whoever pays the bill takes the risk and names the number, so nothing in
 * this codebase clamps these figures from above.
 *
 * `0` is the one word for "no ceiling on this axis" — the convention
 * `maxTokens` already spoke (X-19), now spoken by all six, so a reader learns
 * it once instead of six special cases. `remainingBudget` turns a 0 into
 * `Infinity`, which is what makes `guardReason` never fire on that axis.
 */
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

/**
 * ‼️ NO UPPER CLAMP. THE CEILING IS THE USER'S TO NAME.
 *
 * This used to refuse more than 24 hours, more than $500, more than 30 rounds —
 * numbers this extension invented for somebody else's money. A five-day
 * marathon or a high-budget research run is a decision its owner is entitled to
 * make and to pay for, and silently clamping the figure that was typed is worse
 * than refusing it: the run then ends early for a reason nobody wrote down.
 *
 * What survives is the FLOOR and the word `0`. A POSITIVE figure below the
 * smallest workable value is a typo rather than a request, so it is lifted to
 * that floor; an EXACT `0` is the one spelling of "no ceiling on this axis" —
 * the word `maxTokens` has meant since X-19, now spoken by all six.
 *
 * ‼️ X-82 — AND ONLY AN EXACT 0. This read `n <= 0`, with everything coerced
 * through `Number(v)` first, so `null`, `false`, `""`, a box the user CLEARED
 * in the form and every negative figure spelled "no ceiling" just as loudly as
 * a typed zero: a malformed request did not fail, it removed the cost, time,
 * round and task ceilings of the run it started. Lifting a ceiling is a
 * decision, so it is now made only by the one value that can only be meant.
 * Anything else that cannot be honoured falls back to the DOCUMENTED DEFAULT
 * here, and is refused by name at the raw boundary
 * (`validateMissionLimitsInput`) before it ever reaches this function.
 *
 * It lives here rather than in the caller because it is the RULE, and a rule
 * inside a closure cannot be held by a test (Principle 1).
 */
export function normalizeMissionLimits(input: Record<string, unknown>): MissionLimits {
    const num = (v: unknown, d: number, min: number, integer = false): number => {
        // Not a figure at all — a default is the safe reading of silence, and
        // `Number()` would have turned `null`, `false`, `""` and even `[]` into
        // a 0 that read as "no ceiling on this axis".
        if (typeof v !== 'number' && typeof v !== 'string') { return d; }
        if (typeof v === 'string' && !v.trim()) { return d; }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) { return d; }
        if (n === 0) { return 0; }
        return Math.max(min, integer ? Math.round(n) : Math.round(n * 100) / 100);
    };
    return {
        maxRounds: num(input.maxRounds, DEFAULT_MISSION_LIMITS.maxRounds, 1, true),
        maxTasks: num(input.maxTasks, DEFAULT_MISSION_LIMITS.maxTasks, 1, true),
        maxCostUSD: num(input.maxCostUSD, DEFAULT_MISSION_LIMITS.maxCostUSD, 0.01),
        // ‼️ X-19 — the ceiling that still binds on a plan-billed delegate.
        // 0 means "no token ceiling", which is what a mission created before
        // token ceilings existed had.
        maxTokens: num(input.maxTokens, DEFAULT_MISSION_LIMITS.maxTokens, 1000, true),
        maxMinutes: num(input.maxMinutes, DEFAULT_MISSION_LIMITS.maxMinutes, 1, true),
        maxParallel: num(input.maxParallel, DEFAULT_MISSION_LIMITS.maxParallel, 1, true)
    };
}

/** The six axes a mission is fenced on — one list, so no surface can grow a seventh alone. */
export const MISSION_LIMIT_FIELDS = [
    'maxRounds', 'maxTasks', 'maxCostUSD', 'maxTokens', 'maxMinutes', 'maxParallel'
] as const;

/**
 * ‼️ X-82 — A CEILING IS LIFTED ON PURPOSE OR NOT AT ALL.
 *
 * `normalizeMissionLimits` is deliberately lossy: it takes whatever arrived and
 * produces a usable set of limits, which is right for a spec read off disk and
 * wrong for a request somebody just made. The same reasoning as X-60, on the
 * one dimension where the wrong answer is UNBOUNDED SPEND: a typo'd budget, a
 * `null` from a script, a limit box the user cleared and a negative figure all
 * arrived as "no ceiling", and the caller was told the mission was theirs.
 *
 * So the raw request is judged before it is changed, and the three states are
 * kept apart: OMITTED = the documented default · exact `0` = unlimited ·
 * a positive figure = itself, floored. Everything else is refused BY FIELD NAME
 * — the panel's `type="number" min="0"` is a convenience, never the only guard,
 * because the bridge reaches the same function without any HTML in front of it.
 */
export function validateMissionLimitsInput(raw: Record<string, unknown>): string[] {
    const errors: string[] = [];
    for (const k of MISSION_LIMIT_FIELDS) {
        const v = raw[k];
        // An absent field is not a bad one — it asks for the default (X-60).
        if (v === undefined) { continue; }
        const say = (why: string) => errors.push(
            `"${k}" ${why} — give a number, or exactly 0 to run with no ceiling on that axis`
        );
        if (v === null) { say('was sent as null'); continue; }
        if (typeof v === 'boolean') { say('was sent as a true/false'); continue; }
        if (typeof v === 'string' && !v.trim()) { say('was left blank'); continue; }
        if (typeof v !== 'number' && typeof v !== 'string') {
            say(`was sent as ${Array.isArray(v) ? 'a list' : 'an ' + typeof v}`); continue;
        }
        const n = Number(v);
        if (!Number.isFinite(n)) { say(`is not a number ("${String(v).slice(0, 30)}")`); continue; }
        if (n < 0) { say(`is negative (${n})`); continue; }
        if (n > Number.MAX_SAFE_INTEGER) { say('is larger than this build can count exactly'); }
    }
    return errors;
}

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
     * ‼️ U-100 — AND THE OTHER HALF OF THAT SAME DECISION.
     *
     * The mission could say which MODEL plans and had no way to say how hard it
     * thinks, so an orchestrator meant to reason its way through a hard fork ran
     * at whatever the CLI calls normal while a delegate on the same machine
     * could be put on `xhigh` from a picker. One axis of the planner's profile
     * was settable and the other was not, for no reason anybody chose.
     *
     * ABSENT MEANS TODAY'S BEHAVIOUR, on every spec ever written: no `--effort`
     * reaches the planner command line and the CLI decides, exactly as it did
     * before this field existed. It is validated against the same vocabulary a
     * member's effort is — the words cannot be allowed to fork per surface.
     */
    plannerEffort?: string;
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
    /**
     * ‼️ X-225 — THE SIGN-IN EVERY DELEGATION IS BILLED TO unless the member
     * overrides it, on exactly the axis `engine` is.
     *
     * ABSENT MEANS TODAY'S BEHAVIOUR on every spec ever written: nothing is
     * stated, the delegation reaches the task launch path with no account, and
     * the engine's standing sign-in answers there. This is a restriction lifted,
     * not a default changed — the dimension used to be declared out of scope for
     * the whole surface while the model, the effort and the permission mode
     * beside it were overridable twice over.
     */
    account?: string;
    /**
     * ‼️ X-107 — THE ROUTE EVERY DELEGATION IS SERVED BY unless the member
     * overrides it, on exactly the axis `engine` and `account` are.
     *
     * ABSENT MEANS TODAY'S BEHAVIOUR on every spec ever written: nothing is
     * stated, the delegation reaches the task launch path with no route, and the
     * agent's own standing record answers at the spawn. A mission is written
     * once and fires for hours with nobody at a window, which is precisely when
     * "these delegations go through the Kimi endpoint" cannot be said anywhere
     * else.
     */
    providerId?: string;
    /** ‼️ Claude routes only — which tier of the route above, and never carried
     *  without it (X-101: a tier means a different model on every route). */
    tier?: string;
    /**
     * ‼️ X-225 — AND THE PLANNER'S OWN, WHICH IS A DIFFERENT QUESTION.
     *
     * The planner is not a delegation: it is a headless `claude` in the lead's
     * folder, called once per round for the whole run, and it is the call that
     * carries the mission's context from round to round. So it bills its own
     * plan and it is stated on its own axis, beside `plannerModel` and
     * `plannerEffort` — a long mission whose planner and whose workers share one
     * sign-in is exactly the run that stops in the middle.
     *
     * ‼️ AND IT IS THE ONE THAT WAS NOT MERELY UNSTATED BUT UNREACHABLE:
     * `missionPlannerCallOnce` spawned with no environment at all, so the
     * planner ran as whatever the VS Code window happened to be holding.
     */
    plannerAccount?: string;
    /**
     * ‼️ X-107 — AND THE ROUTE THE PLANNER ITSELF IS SERVED BY, on its own axis
     * beside `plannerAccount` and for the same reason.
     *
     * The planner is not a delegation: it is one long-lived headless `claude` in
     * the lead's folder, called once per round for the whole run, and it is the
     * most expensive thing a mission does. "The workers go through the cheap
     * endpoint, the planner stays on the one I trust to keep the thread" is the
     * decision this exists for — and it is the shape of the decision, not a
     * refinement of it: a planner that inherited the delegates' route would make
     * the two inseparable.
     *
     * Absent = every mission written before this: nothing injected, and the
     * lead's own standing record answers at the spawn.
     */
    plannerProviderId?: string;
    /** ‼️ Which tier of the planner's route, never carried without it (X-101). */
    plannerTier?: string;
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

/**
 * ‼️ U-103 — WHAT THIS DRAFT WOULD ACTUALLY LAUNCH WITH, ANSWERED BY THE HOST.
 *
 * The Missions form used to work the effective engine out for itself —
 * `member || mission || 'claude'` — while the run climbs a five-rung ladder
 * (`resolveDelegateRun`) with a carve-out for Claude's own model and effort.
 * The two answers disagreed the moment a fleet default existed: the form drew
 * a Claude model catalogue for a row that was going to launch on Gemini. A
 * second resolver is not a bug to fix once; it is a bug that comes back on
 * every field either side gains. So there is ONE resolver, it lives where the
 * stores are, and the page reads its output.
 *
 * A field nobody resolved stays ABSENT here and is drawn as "CLI chooses" —
 * never filled in with a plausible-looking guess, which is the whole failure
 * this replaces.
 */
export interface MissionPreviewMember {
    agentId: string;
    agentName: string;
    role?: string;
    /** Which half of the run this is. The planner is not a worker: it is fixed
     *  to Claude Code by design and its dimensions come from the mission. */
    kind: 'planner' | 'worker';
    /** Exactly what the DRAFT says about this member and nothing else — the
     *  boxes as typed, so a surface can mark an explicit override apart from
     *  something inherited. An empty field is empty, not defaulted. */
    requested: {
        engine?: string; model?: string; effort?: string; permissionMode?: string;
        /** ‼️ X-107 — and the two dimensions the preview used to answer for
         *  without being able to see them: whose plan pays (X-225) and which
         *  endpoint serves it. A form that reports a dimension as unset while
         *  the wave runs on it is worse than one that does not report it. */
        account?: string; providerId?: string; tier?: string;
    };
    /** What the ladder resolves to. A missing field = the CLI decides. */
    effective: {
        engine: string; model?: string; effort?: string;
        permissionMode?: string; workDir?: string;
        account?: string; providerId?: string; tier?: string;
    };
    /** Which rung decided each field — the answer to "why did it run on that?".
     *  The resolver's OWN record, so a dimension added to the ladder cannot be
     *  reported here under a shorter list. */
    origin: DelegateRun['origin'];
    /**
     * ‼️ X-121 — WHERE a rung that has an address said it: the settings file's
     * path, or the extra-args flag verbatim. Absent for rungs that are their own
     * explanation ("set mission-wide" needs no address) and for `cli`, which is
     * the absence of a source rather than one.
     */
    originSource?: Partial<Record<'model' | 'effort', string>>;
    /**
     * ‼️ X-121 — flags this member's own override took OFF the command line,
     * verbatim. Only the orchestrator can have any: it is the one participant
     * whose line carries `agentFarm.taskExtraArgs`, so it is the one place where
     * "the mission says opus" and "my extra args say sonnet" are the same
     * command. Empty is normal and is left absent.
     */
    displaced?: string[];
    /** `describeDelegateRun` — the one line a narrow surface can carry. */
    note: string;
    /** Everything that would refuse THIS row at launch: an engine this machine
     *  cannot run, an effort the engine has no flag for. Reported together
     *  rather than one per attempt. */
    problems: string[];
}

export interface MissionPreview {
    /** False when the draft cannot start. `error` then carries the SAME
     *  sentence `create` would have returned — one validator, one wording. */
    ok: boolean;
    error?: string;
    mode: MissionMode;
    title: string;
    goal: string;
    /** `auto` = nobody named a lead and `resolveLead` picked; the form shows
     *  `Automatic → <agent>` rather than an empty box. */
    lead?: { agentId: string; agentName: string; origin: 'requested' | 'auto' };
    /** Absent when the draft is refused before a cast exists. */
    planner?: MissionPreviewMember;
    workers: MissionPreviewMember[];
    /** U-102 — which reading of the pool this draft means; classic drafts omit it. */
    poolScope?: 'fleet' | 'selected';
    workdir?: string;
    /**
     * ‼️ X-94 — WHICH PROJECT THIS RUN IS FILED UNDER, AND WHO DECIDED THAT.
     *
     * `requested` = the draft named one (or named "" for deliberately none, in
     * which case this is absent). `window` = nobody named one and the window's
     * ACTIVE project was inherited — the case a person is surprised by, because
     * they never chose it and yet the run and every delegation it makes are
     * filed under that project and briefed with it.
     */
    project?: { id: string; name: string; origin: 'requested' | 'window' };
    approvalMode?: 'each-round' | 'auto';
    limits?: MissionLimits;
    /** Draft-wide refusals — every row's problems, deduplicated, plus anything
     *  that is nobody's row in particular. Empty on a draft that would start. */
    problems: string[];
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
    /** M-38 — the input values the workflow run is started with */
    inputs?: Record<string, string>;
    /** the real record a workflow step became — filled when the run starts */
    workflowRunId?: string;
    /**
     * ‼️ M-19 — THIS STEP IS A SPEAKING TURN, and this is the message it is
     * going to become. The message itself lives on the run (`run.messages`)
     * because the conversation is a record of its own; what the step carries is
     * the link and the two facts only the step can know — which session the
     * speaker's lane resumes, and whether it was really a resume.
     */
    message?: {
        conversationId: string;
        messageId: string;
        carried: LaneCarry;
        /** the session this turn continues; absent on a new or re-told lane */
        resumeSessionId?: string;
        /** ‼️ S-64 — the lane's last session was handed over, so this turn is
         *  a `handoff` by the law and not by the engine */
        handedOver?: LaneHandover;
        /** ‼️ M-19 — this turn ends the conversation, with this stated reason.
         *  Applied when the turn settles, so the record shows the last thing
         *  said and then the closing — never a conversation shut before the
         *  message that closed it exists. */
        close?: string;
    };
    /**
     * ‼️ M-19 — THE SESSION THE DELEGATE ACTUALLY RAN IN, copied from the task
     * once it is bound. It is what a later turn of the SAME participant
     * resumes, and it is a deep link the transcript surface can open. Written
     * for every step, not only a speaking one: a conversation is not the only
     * thing that would want to continue a lane.
     */
    runSessionId?: string;
    /**
     * ‼️ THE CEILING THAT IS HOLDING THIS DELEGATION, in its own words — a
     * budget, a concurrency limit, a retry's wait. Set while the task is parked
     * and cleared the moment it launches or settles.
     *
     * A parked delegation is not slow work, it is no work: the step read
     * "running" everywhere while nothing had been launched, the objective spent
     * its wall clock waiting and then stopped with "hard-limit". Every sentence
     * true, none of them the reason. A ceiling is something the user can lift,
     * and they can only lift the one they were told about.
     */
    held?: string;
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
    /**
     * ‼️ M-18 — THE FAILURE, NORMALISED. `note` is prose written at the failure
     * site and a person reads it fine; the LEAD gets one line inside a round
     * message and has to decide from it whether to order the same thing again.
     * This is the shape it can branch on — class, what was attempted, the ids of
     * the evidence — and `core/missionFailure.ts` holds what each class means.
     * The prose is not replaced: it survives as this object's `detail`.
     */
    failure?: StepFailure;
    /**
     * ‼️ M-18 — WHAT THIS DELEGATION ACTUALLY RAN WITH, AND WHO DECIDED IT.
     *
     * The dimensions a delegate runs on come from four places now
     * (`resolveDelegateRun`), and three of them are settings written somewhere
     * else — so "why did that step run on gpt-5?" had no answer on the run. One
     * derived line, written when the task is created; absent when every field
     * fell through to the CLI, because "nothing was set" is the state this was
     * added to describe and is not worth a row.
     */
    runNote?: string;
    /**
     * ‼️ U-104 — THE SAME FACT, AS A FACT rather than as a sentence.
     *
     * `runNote` is one line for a narrow place, and it is LOSSY by design: it
     * drops every dimension whose origin is `cli`, drops `claude` because it is
     * the default, and never carried the workdir at all. So a reader asking
     * "which engine, which model, whose decision?" of a finished run got a
     * partial answer with no sign that anything was missing — and a blank cell
     * on the commonest case of all, a delegation that took every default.
     *
     * This is the resolver's own output, kept: every dimension with the layer
     * that decided it (`member|mission|agent|fleet|cli`). Absent on steps
     * recorded before it existed — the surfaces fall back to `runNote`, and say
     * which they are showing rather than drawing an empty row.
     */
    ran?: DelegateRun;
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
    | 'parallel' | 'run_workflow' | 'run_mission' | 'message' | 'council' | TaskIntent;

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
    /**
     * ‼️ X-72 — THIS ROUND'S SPENDING HAS REACHED THE RUN'S TOTALS.
     *
     * The rollup used to be a line in the middle of the round loop, which
     * meant it was reached only on the way the loop normally goes: a ceiling
     * cut or a cancel returned ABOVE it, and the money a wave had really
     * spent — steps that settled, delegates that ran, ledger line and all —
     * simply never landed. The run then read as cheaper than it was, its
     * remaining budget as larger, and a parent rolling up a child got a
     * total missing the last round of it.
     *
     * It is a persisted MARK rather than a live flag because the other half
     * of the same failure is a window that closed between the wave settling
     * and the rollup: what recovers those costs after a reload needs to know
     * which rounds were already counted, or it books them twice.
     */
    booked?: boolean;
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
    /**
     * ‼️ M-29 — WHAT THE ORCHESTRATOR ACTUALLY LAUNCHED WITH, ON THE RUN.
     *
     * X-121 built one ladder (`plannerLaunch.ts`) and the preview climbs it
     * live, which is right for a mission that has not started. A FINISHED run
     * is a different question: re-climbing it would answer with today's
     * `taskExtraArgs` and today's `.claude/settings*.json` — an assertion about
     * last week made out of this morning's files. So the resolver's answer is
     * kept HERE, on the run, the same way a delegation keeps its own `ran`.
     *
     * ‼️ THE LAST PLANNER CALL WINS, exactly as a member's record is its LAST
     * delegation. Every round rebuilds the pair (X-122), a resume rebuilds it
     * in a new window, and "what it is running with" is the reading a run still
     * going and a run already finished both want.
     *
     * Absent on every run that predates this and on one whose planner never got
     * as far as a call — and the surfaces say "not recorded", never a default.
     */
    plannerLaunch?: PlannerLaunch;
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
    /**
     * ‼️ M-19 — THE CONVERSATIONS THIS RUN OPENED, AND EVERY MESSAGE IN THEM.
     *
     * Append-only in practice: a message is added when a speaking turn is
     * ordered and its state settles in place, exactly as a step's does. Kept on
     * the run rather than derived from the journal because the ENGINE reads it
     * every round — to refuse a second turn from a participant already
     * speaking, to check a ref against the ids that really exist, and to build
     * the next speaker's prompt out of what was really said. The journal keeps
     * the same facts as history; this is the current record.
     *
     * Absent on every classic run and on every adaptive run that never spoke.
     */
    conversations?: MissionConversation[];
    messages?: MissionMessage[];
    /**
     * ‼️ M-20 — the CHAIRED debates, each one a mandate over a conversation
     * above rather than a record of its own. A council holds what the record
     * cannot state for itself: the question, the chair, the cap and the stated
     * way out. Absent on every run that never called one, which is most.
     */
    councils?: MissionCouncil[];
}

export interface MissionGuidance {
    id: string;
    text: string;
    at: number;
    /**
     * ‼️ X-66 — when the lead ANSWERED a call that carried it. This is the only
     * moment delivery is a fact; it used to be written before the call, which
     * made a crash in between look identical to a delivery that landed.
     */
    appliedAt?: number;
    /**
     * ‼️ X-66 — when it was handed to a planner call that had not come back
     * yet. Neither pending nor delivered, and that is the honest state: nobody
     * can say which it was. A reload re-opens it as `standing`.
     */
    inflightAt?: number;
    /**
     * ‼️ X-66 — this steer was in flight when a window closed, so it is being
     * put in front of the lead AGAIN. Labelled rather than repeated silently:
     * a lead that already read it must not act on it twice, and a lead that
     * never saw it must not lose it.
     */
    standing?: boolean;
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

/**
 * The steers this run has not shown the lead yet, oldest first.
 *
 * ‼️ X-66 — one that is IN FLIGHT is not pending: it is in a prompt the lead is
 * answering right now, and handing it out again in the same process would be
 * the double delivery the whole mechanism exists to prevent. A reload clears
 * the in-flight mark (`reopenGuidance`), so an unanswered one comes back.
 */
export function pendingGuidance(run: MissionRun): MissionGuidance[] {
    return (run.guidance ?? []).filter(g => g.appliedAt === undefined && g.inflightAt === undefined);
}

/**
 * ‼️ X-66 — WHAT A RELOAD DOES TO A STEER NOBODY CAN ACCOUNT FOR.
 *
 * A guidance that was in flight when the process died was either read by the
 * lead or never reached it, and the record cannot tell which. Losing it is the
 * worse failure of the two — the user typed it, it never landed, and nothing
 * ever said so — so it is re-opened and marked `standing`, which is how it is
 * re-delivered as an instruction already in force rather than as a new one.
 *
 * Called once when an engine takes a run over; idempotent.
 */
export function reopenGuidance(run: MissionRun): MissionGuidance[] {
    const stuck = (run.guidance ?? []).filter(g => g.appliedAt === undefined && g.inflightAt !== undefined);
    for (const g of stuck) { g.inflightAt = undefined; g.standing = true; }
    return stuck;
}

/**
 * ‼️ X-89 — THE JOURNAL'S GUIDANCE, PUT BACK INTO THE SNAPSHOT ON RELOAD.
 *
 * Two-phase delivery writes the journal FIRST and saves the snapshot second, in
 * both phases, on purpose: a record that exists only in memory does not survive
 * the thing it was written to survive. That leaves two crash windows, and
 * startup reconciliation was reading `answers` out of the projection and
 * nothing else — so both of them lost:
 *
 *   * RECEIPT AHEAD. The user's steer reached the journal and the crash came
 *     before the save. The snapshot has no guidance at all, the journal has it,
 *     and the run resumes as though nothing was ever typed. The instruction is
 *     gone and nothing says so — the worse of the two failures.
 *
 *   * APPLIED AHEAD. The lead answered the call that carried the steer, the
 *     `applied` line reached the journal, and the crash came before the save.
 *     The snapshot still shows it in flight, so `reopenGuidance` re-sends an
 *     instruction the journal already proves was delivered. The double delivery
 *     the whole mechanism exists to prevent.
 *
 * The journal is only ever allowed to ADD a fact here — create a steer the
 * snapshot never learned about, or settle one it could not yet know had
 * landed. A steer the snapshot has and the journal does not is untouched: that
 * is the snapshot-ahead case, and it is the existing refuse/degraded rule's.
 *
 * Idempotent, and called before the engine reopens anything.
 */
export function reconcileGuidance(
    run: MissionRun,
    journal: readonly { id: string; text: string; at: number; appliedAt?: number }[]
): { restored: string[]; settled: string[] } {
    const restored: string[] = [];
    const settled: string[] = [];
    const byId = new Map((run.guidance ?? []).map(g => [g.id, g]));
    for (const j of journal) {
        const g = byId.get(j.id);
        if (!g) {
            const fresh: MissionGuidance = {
                id: j.id, text: j.text, at: j.at,
                ...(j.appliedAt !== undefined ? { appliedAt: j.appliedAt } : {})
            };
            run.guidance = [...(run.guidance ?? []), fresh];
            byId.set(j.id, fresh);
            restored.push(j.id);
            continue;
        }
        if (j.appliedAt !== undefined && g.appliedAt === undefined) {
            g.appliedAt = j.appliedAt;
            g.inflightAt = undefined;
            g.standing = undefined;
            settled.push(j.id);
        }
    }
    // oldest first, the order every reader of this list assumes
    if (restored.length) { run.guidance = [...(run.guidance ?? [])].sort((a, b) => a.at - b.at); }
    return { restored, settled };
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
export function settledCriteriaWork(run: MissionRun): SettledWork[] {
    const out: SettledWork[] = [];
    for (const r of run.rounds) {
        for (const s of r.steps) {
            if (s.evaluates) { continue; }
            if (s.status !== 'done' && s.status !== 'failed') { continue; }
            // ‼️ X-67 — EVERY settled step is in here now, not only the ones
            // that stated a criterion. A criteria label is optional on an
            // adaptive delegation, so filtering on it here meant a revise that
            // named none could never stale anything — the artefact changed and
            // the old pass stayed current. `isStale` decides what counts;
            // this function's job is to report what happened, not to judge it.
            out.push({
                id: s.id, at: r.at,
                ...(s.criteria?.length ? { criteria: s.criteria } : {}),
                ...(s.sources?.length ? { sources: s.sources } : {}),
                // ‼️ X-92 — whether this step could have changed anything at
                // all. Only a step that actually carries the mark reports it,
                // so a run recorded before the field existed stays on the
                // two-witness rule instead of staling everything at once.
                ...(typeof s.readonly === 'boolean' ? { writes: !s.readonly } : {})
            });
        }
    }
    return out;
}

/**
 * ‼️ X-91 — A CANCEL IS AN ENDING, AND EVERY ENDING IS A RESULT.
 *
 * A hand on the stop button used to leave a run with `status:cancelled`
 * and nothing else: no verdict, no `stopReason`, no summary, and — on an
 * adaptive run — no record of which criteria were still open at the moment
 * it was stopped. The reader got a run that ended for no stated reason,
 * from the same surface that explains every other ending in full. Worse,
 * there were TWO of these: the engine's own mid-round check and the host's
 * path for a paused or unowned run, and they left different records.
 *
 * This is the one shape both of them use. `unmet` is read here rather than
 * left to the caller, because a cancelled adaptive run is exactly the case
 * where "what was still open" is the whole of what the reader wants.
 */
/**
 * ‼️ X-91 — WHICH TERMINALS CONTRADICT THEMSELVES. Returns the refusal, or
 * `undefined` when the three parts of the ending agree.
 *
 * `user-stop` is the one reason that is the engine's alone: it is a fact about
 * a person, and a lead that could pick it could dress a run it simply gave up
 * on as one that was stopped from outside. `hard-limit` IS the lead's to give —
 * the guard nudges it with the ceiling by name and asks it to end — but a run
 * that ran out of rope did not also reach its objective.
 */
/**
 * ‼️ X-72 — THE COSTS A CLOSED WINDOW LEFT UNCOUNTED.
 *
 * Reconciliation restores what each step really spent from the journal and
 * the task store, but `remainingBudget` reads the RUN totals, and nothing
 * recomputed those. So a window that closed between a wave settling and its
 * rollup came back with a run whose steps were expensive and whose budget was
 * untouched — and the resume then started fresh work on money that was
 * already gone.
 *
 * Run AFTER reconciliation, so the step figures are the recovered ones. The
 * mark on each round is what makes it idempotent: a second reload counts
 * nothing again, and a round the engine booked normally is left alone. No
 * ledger line is written here — the ledger is what the run SAID at the time,
 * and a line invented on the way back would be testimony nobody gave.
 *
 * Returns the number of rounds it had to book, which is a real event: the
 * reader is told the budget moved while nothing was running.
 */
export function bookSettledRounds(run: MissionRun): number {
    let booked = 0;
    for (const round of run.rounds) {
        if (round.booked) { continue; }
        const settled = round.steps.filter(
            s => s.status === 'done' || s.status === 'failed' || s.status === 'cancelled');
        if (!settled.length) { continue; }
        // A round still holding live steps is one the engine will book itself
        // when the wave comes back; only a round that is entirely over is ours.
        if (settled.length !== round.steps.length) { continue; }
        round.booked = true;
        run.totalCostUSD += settled.reduce((a, s) => a + (s.costUSD ?? 0), 0);
        run.totalTokens = (run.totalTokens ?? 0)
            + settled.reduce((a, s) => a + (s.tokens ?? 0), 0);
        booked++;
    }
    return booked;
}

export function terminalClash(
    action: 'finish' | 'abort', verdict: MissionResult['verdict'], reason: StopReason
): string | undefined {
    if (reason === 'user-stop') {
        return '"user-stop" is not yours to give — it is what the engine records when a person presses stop. '
            + `Say why YOU are stopping: ${STOP_REASONS.filter(r => r !== 'user-stop').join(' | ')}.`;
    }
    if (reason === 'hard-limit' && verdict === 'success') {
        return '"hard-limit" and "success" cannot both be true — a run cut short by a ceiling did not reach its objective. Say "criteria-satisfied" if it did, or keep the ceiling and a "partial"/"failed" verdict.';
    }
    if (action === 'abort' && verdict === 'success') {
        return '"abort" and "success" cannot both be true — an aborted run did not reach its objective. Use "finish" if it did, or a "partial"/"failed" verdict if it did not.';
    }
    if (reason === 'criteria-satisfied' && verdict !== 'success') {
        return `"criteria-satisfied" says the objective was met, so the verdict cannot be "${verdict}". Either finish with "success", or give the reason it really stopped.`;
    }
    return undefined;
}

export function cancelledResult(
    spec: MissionSpec | undefined, run: MissionRun, note?: string
): MissionResult {
    const done = run.rounds.some(r => r.steps.some(s => s.status === 'done'));
    const where = run.rounds.length
        ? ` after ${run.rounds.length} round${run.rounds.length === 1 ? '' : 's'}`
        : ' before its first round';
    let summary = `Cancelled by the user${where}.`
        + (note ? ` ${note}` : '')
        + (done
            ? ' What had already settled is kept; nothing further was started.'
            : ' Nothing had settled yet.');
    const unmet = isAdaptive(spec)
        ? successGate(spec?.successCriteria ?? [],
            currentEvaluations(run.evaluations ?? [], settledCriteriaWork(run))).unmet
        : [];
    if (unmet.length) {
        summary += '\n\nStill open: '
            + unmet.map(u => `[${u.id}] ${u.text} (${u.verdict})`).join('; ') + '.';
    }
    return {
        verdict: done ? 'partial' : 'failed',
        summary,
        stopReason: 'user-stop',
        ...(unmet.length ? { unmet } : {})
    };
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
    /** M-38 — the input values the workflow run is started with */
    inputs?: Record<string, string>;
    /** ‼️ M-18 — what a `mission` unit is: the child objective to be born. */
    child?: ChildObjectiveReq;
    /** ‼️ M-19 — what a `conversation` unit is: the message this turn becomes. */
    message?: {
        conversationId: string;
        messageId: string;
        carried: LaneCarry;
        resumeSessionId?: string;
        handedOver?: LaneHandover;
        close?: string;
    };
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
    | { action: 'run_workflow'; thought: string; workflow: string; ask?: string; criteria?: string[]; inputs?: Record<string, string> }
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
    /**
     * ‼️ M-19 — ONE SPEAKING TURN. The lead chooses WHO speaks, TO WHOM, WITH
     * WHAT INTENT and — the part that makes it a conversation rather than a
     * round of parallel questions — WHICH REAL MESSAGES that speaker is
     * answering. There is deliberately no field here for what the previous
     * speaker said: the engine attaches the words behind `refs`, so a lead
     * cannot hand a participant its own version of somebody else's position.
     *
     * `conversation` absent means "open one", which needs `objective` and
     * `participants`. Everything else about the turn — the session it resumes,
     * whether it can be resumed at all, the writer lane — is the engine's.
     */
    | {
        action: 'message'; thought: string;
        conversation?: string;
        objective?: string;
        participants?: string[];
        /**
         * ‼️ ONE SPEAKER, OR SEVERAL SPEAKING INDEPENDENTLY. Several is not a
         * shortcut for ordering the same turn twice: turns ordered together are
         * built before any of them has said anything, so none of them can see
         * another's answer. That is what an independent first round IS, and it
         * cannot be had by taking two rounds — by the second one the first
         * message has been delivered and is in the record.
         */
        from: string[];
        to: string[];
        intent: MessageIntent;
        refs: string[];
        /** ‼️ X-77 — how much of the record this speaker is shown. Absent keeps
         *  the behaviour that was always there: everything, or (on a resumed
         *  lane) everything since its own last turn. */
        visibility?: MessageVisibility;
        ask?: string;
        title?: string;
        /** this turn ends the conversation, and this is the stated reason */
        close?: string;
    }
    /**
     * ‼️ M-20 — A COUNCIL IS A CONVERSATION WITH A CHAIR AND A MANDATE. It opens
     * one and orders its opening turns in the SAME decision, which is why it is
     * composite rather than new: everything after this is ordinary `message`.
     */
    | {
        action: 'council'; thought: string;
        question: string;
        members: string[];
        /** agent id, or `lead` — the objective's own lead chairs it by default */
        chair: string;
        from: string[];
        intent: MessageIntent;
        maxTurns: number;
        options?: string[];
        ask?: string;
        title?: string;
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
            ...(m.effort ? { effort: m.effort } : {}),
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

/**
 * ‼️ X-69 — WHAT A PRIMITIVE'S PARSE IS HANDED, and it is the whole of it.
 *
 * Every parse below used to be an arm of one `if (action === …)` chain, which
 * meant a primitive's contract was a position in a function rather than a thing
 * you could point at: a name could be declared in the registry, offered to the
 * lead in the menu, accepted by `primitiveFor` — and still fall off the end of
 * the chain into "unknown action", because the arm was never written. The arms
 * are named functions now and the registry holds the name of each, so the
 * missing one is a compile error rather than a run that dies at the moment the
 * lead first tries it.
 */
interface ParseCtx {
    /** the planner's reply, already known to be a JSON object */
    o: Record<string, unknown>;
    spec: MissionSpec;
    adaptive: boolean;
    thought: string;
    /** the action exactly as it was written — the string the row was found by */
    action: string;
    /** the registry row this parse belongs to */
    prim: MissionPrimitive;
    /** attaches the adaptive reflection and hands back the parsed decision */
    done: (d: PlannerDecisionCore) => ParseResult;
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
    // ‼️ X-69 — ONE DISPATCH, THROUGH THE REGISTRY THAT DECLARED THE ACTION.
    // The lookup above answered "is this an action, and may this lead use it";
    // this answers "what parses it", out of the same table the menu is built
    // from. There is no chain to fall off the end of any more — a row without a
    // parse cannot be written (the table is total over `PrimitiveName`), and the
    // runtime check below is what a FAKE row pushed in by a test falls into.
    const handler = PRIMITIVE_HANDLERS[prim.name];
    if (!handler?.parse) { return { ok: false, error: unknownActionError(action, adaptive) }; }
    return handler.parse({ o, spec, adaptive, thought, action, prim, done });
}

/** `replan` — the approach itself changed; nothing is ordered by it. */
function parseReplan(c: ParseCtx): ParseResult {
    return c.done({ action: 'replan', thought: c.thought });
}

/** `evaluate` — judge the criteria, from what the lead holds or through a reviewer. */
function parseEvaluate(c: ParseCtx): ParseResult {
    const { o, spec, done, thought, action } = c;
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

/** `finish` and `abort` — the two terminal decisions, one parse: they differ in
 *  the word and in nothing else the reply has to carry. */
function parseEnding(c: ParseCtx): ParseResult {
    const { o, adaptive, done, thought, action } = c;
    const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
    // (the compatibility check itself is `terminalClash`, below)
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
        // ‼️ X-68 — AND IT IS REQUIRED, not merely validated when offered.
        // Optional meant most endings carried no reason at all, so the one
        // question the field exists to answer — did this run reach its
        // objective or run out of rope? — was answerable for some
        // terminals and not for others, from the same UI.
        if (!s) {
            return {
                ok: false,
                error: `"${action}" must say WHY it is stopping — add "stopReason", one of: ${STOP_REASONS.join(' | ')}`
            };
        }
        if (!isStopReason(s)) {
            return { ok: false, error: `"stopReason" must be one of: ${STOP_REASONS.join(' | ')} (got "${s}")` };
        }
        stopReason = s as StopReason;
        // ‼️ X-91 — AND THE THREE PARTS OF A TERMINAL MUST AGREE.
        // Action, verdict and reason were each validated alone, so the
        // same ending could give two opposite answers to "how did this
        // go?": an `abort` that claims success, a success that says it
        // ran out of rope, a failure that says it satisfied its
        // criteria. And two of the reasons are the ENGINE's to give —
        // a lead cannot decide that a person stopped the run, or that
        // a ceiling it cannot see was reached.
        const clash = terminalClash(action as 'finish' | 'abort', verdict, stopReason);
        if (clash) { return { ok: false, error: clash }; }
    }
    return done(action === 'finish'
        ? { action: 'finish', thought, verdict, summary, ...(stopReason ? { stopReason } : {}) }
        : { action: 'abort', thought, verdict, summary, ...(stopReason ? { stopReason } : {}) });
}

/** `ask_user` — one question for the human. */
function parseAskUser(c: ParseCtx): ParseResult {
    const { o, done, thought } = c;
    const question = typeof o.question === 'string' ? o.question.trim() : '';
    if (!question) { return { ok: false, error: '"ask_user" needs a non-empty "question"' }; }
    return done({ action: 'ask_user', thought, question });
}

/** `run_mission` — a whole sub-objective for a child run. */
function parseRunMission(c: ParseCtx): ParseResult {
    const { o, spec, adaptive, done, thought, action } = c;
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

/** `run_workflow` — one of this window's existing chains, as a single step. */
function parseRunWorkflow(c: ParseCtx): ParseResult {
    const { o, spec, adaptive, done, thought, action } = c;
    const workflow = String(o.workflow ?? o.workflowId ?? o.title ?? '').trim().slice(0, 200);
    if (!workflow) {
        return { ok: false, error: '"run_workflow" needs a "workflow" — the id or the exact title of one that exists' };
    }
    const crit = readCriteriaIds(o.criteria, spec, '"run_workflow"', adaptive);
    if (!crit.ok) { return { ok: false, error: crit.error }; }
    const inputs = o.inputs && typeof o.inputs === 'object' && !Array.isArray(o.inputs)
        ? Object.fromEntries(Object.entries(o.inputs as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '').slice(0, 2000)]))
        : undefined;
    return done({
        action: 'run_workflow', thought, workflow,
        ...(inputs && Object.keys(inputs).length ? { inputs } : {}),
        ...(typeof o.ask === 'string' && o.ask.trim() ? { ask: o.ask.trim().slice(0, MAX_PROMPT_CHARS) } : {}),
        ...(crit.ids ? { criteria: crit.ids } : {})
    });
}

    // ---- one speaking turn in a conversation (M-19) ----
/** `message` (M-19) — one real speaking turn in a conversation. */
function parseMessage(c: ParseCtx): ParseResult {
    const { o, spec, done, thought, action } = c;
    const allowed = allowedAgents(spec);
    const byName = (raw: string) =>
        allowed.find(m => m.agentName.toLowerCase() === String(raw).trim().toLowerCase());
    const asked = (Array.isArray(o.from) ? o.from : [o.from ?? o.speaker])
        .filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim());
    const speakers = asked.map(byName);
    if (!asked.length || speakers.some(s => !s)) {
        const bad = asked.filter(n => !byName(n));
        return {
            ok: false,
            error: '"message" needs a "from" — the pool agent that speaks this turn, or several '
                + 'of them to have each speak WITHOUT seeing the others\' answer. '
                + (bad.length ? `Not in the pool: ${bad.map(n => `"${n}"`).join(', ')}. ` : '')
                + `The pool is: ${allowed.map(m => m.agentName).join(', ')}`
        };
    }
    const speakerIds = [...new Set(speakers.map(s => s!.agentId))];
    if (speakerIds.length !== speakers.length) {
        return {
            ok: false,
            error: '"from" names the same agent twice. One agent speaks once per turn — '
                + 'ordering it twice in one round would be two turns racing over one record.'
        };
    }
    const intent = String(o.intent ?? '').trim();
    if (!intentKind(intent)) {
        return { ok: false, error: `"message" needs an "intent" — one of: ${messageIntentMenu()}` };
    }
    const list = (v: unknown) => (Array.isArray(v)
        ? v.filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim())
        : []);
    // ‼️ NAMES IN, IDS OUT. The lead speaks in agent NAMES because that is
    // what its briefing lists; every id below is resolved here, once, so
    // nothing downstream has to guess which of the two a string is.
    const unknownTo = list(o.to).filter(n => !byName(n));
    if (unknownTo.length) {
        return {
            ok: false,
            error: `"message" is addressed to ${unknownTo.map(n => `"${n}"`).join(', ')}, `
                + `who ${unknownTo.length > 1 ? 'are' : 'is'} not in the pool `
                + `(${allowed.map(m => m.agentName).join(', ')}). Leave "to" empty to address everyone.`
        };
    }
    // ‼️ X-77 — HOW MUCH OF THE RECORD THIS SPEAKER SEES, stated or left to
    // the default. A wrong word is refused by name rather than falling back:
    // a lead that meant "only what I asked about" and silently got the whole
    // transcript has been given the opposite of what it asked for.
    const visRaw = String(o.visibility ?? '').trim();
    if (visRaw && !(MESSAGE_VISIBILITY as string[]).includes(visRaw)) {
        return {
            ok: false,
            error: `"visibility" must be one of: ${MESSAGE_VISIBILITY.join(' | ')} (got "${visRaw}"). `
                + 'Leave it out for the default: the whole record, or — on a lane that is being '
                + 'resumed — everything since that speaker\'s own last turn.'
        };
    }
    const vis = visRaw ? visRaw as MessageVisibility : undefined;
    const conversation = String(o.conversation ?? o.conversationId ?? '').trim();
    const participants = list(o.participants);
    const unknownIn = participants.filter(n => !byName(n));
    if (unknownIn.length) {
        return {
            ok: false,
            error: `"participants" names ${unknownIn.map(n => `"${n}"`).join(', ')}, `
                + `who ${unknownIn.length > 1 ? 'are' : 'is'} not in the pool `
                + `(${allowed.map(m => m.agentName).join(', ')}).`
        };
    }
    const objective = String(o.objective ?? '').trim().slice(0, 500);
    // ‼️ A CONVERSATION OPENS WITH A PURPOSE AND A CAST, OR IT DOES NOT
    // OPEN. Both are what every later turn is checked against — a speaker
    // outside the cast is refused, and the purpose is what each participant
    // is told it is there for. Defaulting either would mean inventing the
    // one fact the lead is supposed to be deciding.
    if (!conversation) {
        if (!objective) {
            return {
                ok: false,
                error: '"message" with no "conversation" opens a new one, which needs an "objective" — '
                    + 'one line saying what the conversation is for. Name an existing conversation id to continue one.'
            };
        }
        if (participants.length < 2) {
            return {
                ok: false,
                error: 'opening a conversation needs at least two "participants" from the pool — '
                    + 'one agent talking to nobody is a delegation, and "delegate" is the primitive for that.'
            };
        }
    }
    return done({
        action: 'message', thought,
        ...(conversation ? { conversation } : {}),
        ...(objective ? { objective } : {}),
        ...(participants.length ? { participants: participants.map(n => byName(n)!.agentId) } : {}),
        from: speakerIds,
        to: list(o.to).map(n => byName(n)!.agentId),
        intent: intent as MessageIntent,
        refs: list(o.refs).slice(0, 20),
        ...(vis ? { visibility: vis } : {}),
        ...(typeof o.ask === 'string' && o.ask.trim() ? { ask: o.ask.trim().slice(0, MAX_PROMPT_CHARS) } : {}),
        ...(typeof o.title === 'string' && o.title.trim() ? { title: o.title.trim().slice(0, 120) } : {}),
        ...(typeof o.close === 'string' && o.close.trim() ? { close: o.close.trim().slice(0, 200) } : {})
    });
}

    // ---- open a chaired debate on one question (M-20) ----
/** `council` (M-20) — a chaired debate on one question. */
function parseCouncil(c: ParseCtx): ParseResult {
    const { o, spec, done, thought, action } = c;
    const allowed = allowedAgents(spec);
    const byName = (raw: string) =>
        allowed.find(m => m.agentName.toLowerCase() === String(raw).trim().toLowerCase());
    const list = (v: unknown) => (Array.isArray(v)
        ? v.filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim())
        : []);
    const question = String(o.question ?? '').trim().slice(0, 500);
    if (!question) {
        return {
            ok: false,
            error: '"council" needs a "question" — the ONE thing it settles, in a line. A council with no '
                + 'question is a conversation, and "message" is the primitive for that.'
        };
    }
    const memberNames = list(o.members);
    const unknownMembers = memberNames.filter(n => !byName(n));
    if (unknownMembers.length) {
        return {
            ok: false,
            error: `"members" names ${unknownMembers.map(n => `"${n}"`).join(', ')}, `
                + `who ${unknownMembers.length > 1 ? 'are' : 'is'} not in the pool `
                + `(${allowed.map(m => m.agentName).join(', ')}).`
        };
    }
    const members = [...new Set(memberNames.map(n => byName(n)!.agentId))];
    if (members.length < 2) {
        return {
            ok: false,
            error: 'a council needs at least two "members" from the pool — one agent debating nobody is '
                + 'a delegation, and "delegate" is the primitive for that.'
        };
    }
    // ‼️ THE CHAIR DEFAULTS TO YOU, and saying so is not a formality: naming
    // somebody else binds every later turn to what that agent actually
    // wrote, and a lead that fell into a chair by accident would find its
    // own turns refused for not citing a message nobody has sent.
    const chairRaw = String(o.chair ?? '').trim();
    const chair = !chairRaw || chairRaw.toLowerCase() === 'lead' || chairRaw === spec.leadAgentName
        ? 'lead' : byName(chairRaw)?.agentId;
    if (!chair) {
        return {
            ok: false,
            error: `"chair" is "${chairRaw}", who is not in the pool `
                + `(${allowed.map(m => m.agentName).join(', ')}). Omit "chair" to chair it yourself.`
        };
    }
    if (chair !== 'lead' && !members.includes(chair)) {
        return {
            ok: false,
            error: 'the chair has to be one of the "members" — it speaks in the council, and a chair '
                + 'outside the cast could never be answered.'
        };
    }
    const asked = list(o.from);
    const speakers = asked.map(byName);
    if (!asked.length || speakers.some(s => !s)) {
        return {
            ok: false,
            error: '"council" needs a "from" — who speaks its opening turn, or several of them to have '
                + `each open without seeing the others. The members are: ${memberNames.join(', ')}`
        };
    }
    const speakerIds = [...new Set(speakers.map(s => s!.agentId))];
    if (speakerIds.length !== speakers.length) {
        return { ok: false, error: '"from" names the same agent twice — one agent speaks once per turn.' };
    }
    const outside = speakerIds.filter(id => !members.includes(id));
    if (outside.length) {
        return {
            ok: false,
            error: `"from" names ${outside.map(id => `"${allowed.find(m => m.agentId === id)?.agentName ?? id}"`).join(', ')}, `
                + 'who did not get put in "members". A council\'s cast is fixed when it opens.'
        };
    }
    // A chaired council opens with the CHAIR, because everything after the
    // opening has to cite what the chair said, and there would be nothing.
    if (chair !== 'lead' && !speakerIds.includes(chair)) {
        return {
            ok: false,
            error: 'a chaired council opens with its chair speaking — every later turn has to name the '
                + 'chair\'s message in "refs", and there is none yet. Put the chair in "from".'
        };
    }
    const intent = String(o.intent ?? 'proposal').trim();
    if (!intentKind(intent)) {
        return { ok: false, error: `"council" opens with an "intent" — one of: ${messageIntentMenu()}` };
    }
    const wanted = Number(o.maxTurns);
    const maxTurns = Number.isFinite(wanted) && wanted > 0
        ? Math.min(40, Math.max(2, Math.floor(wanted))) : 8;
    // ‼️ X-79 — the options are a SET: trimmed, blanks dropped, unique by
    // casefold. "Fragments" and "fragments" are one answer written twice,
    // and letting both through splits the council's own vote between two
    // spellings of it.
    const options = normalizeOptions(list(o.options).map(s => s.slice(0, 80))).slice(0, 6);
    return done({
        action: 'council', thought, question, members, chair,
        from: speakerIds, intent: intent as MessageIntent, maxTurns,
        ...(options.length ? { options } : {}),
        ...(typeof o.ask === 'string' && o.ask.trim() ? { ask: o.ask.trim().slice(0, MAX_PROMPT_CHARS) } : {}),
        ...(typeof o.title === 'string' && o.title.trim() ? { title: o.title.trim().slice(0, 120) } : {})
    });
}

    // ---- typed task intents: review | compare | revise (M-18) ----
/** `review` · `compare` · `revise` — the typed task intents, one parse driven by
 *  the registry row's own `intent` block, which is what makes them one contract. */
function parseTypedIntent(c: ParseCtx): ParseResult {
    const { o, spec, adaptive, done, thought, action, prim } = c;
    // ‼️ X-69 — THE ROW IS THE CONTRACT, so the row is asked. Three primitives
    // share this parse and what makes each of them itself — how many results it
    // needs, whether the task it builds writes — is the `intent` block on its
    // own registry row. A row wired here without one is the miswiring this
    // table exists to make impossible, and it says so rather than reading
    // `undefined` as zero targets.
    const intent = prim.intent;
    if (!intent) { return { ok: false, error: unknownActionError(action, adaptive) }; }
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
    if (targets.length < intent.minTargets) {
        return {
            ok: false,
            error: `"${action}" needs at least ${intent.minTargets} result id(s) in "targets" `
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

/** `delegate` and `parallel` — the same parse; `parallel` adds a claim about
 *  independence, not a field. */
function parseDelegation(c: ParseCtx): ParseResult {
    const { o, spec, adaptive, done, thought, action } = c;
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

/**
 * ‼️ X-69 — WHAT A WORK PRIMITIVE'S PREPARE IS HANDED, AND WHAT IT MAY REACH.
 *
 * Work preparation is the second half of a primitive's contract and it cannot
 * live in the parse: only the RUN knows what an id produced, how deep it sits,
 * or which chains this window has. It used to live in a chain of `else if`
 * arms inside the round loop, accumulating into a `let requested` — so the
 * thing a primitive DOES was a position in a 120-line block rather than
 * something the row could name.
 *
 * `lend` is the point of the boundary: a handler gets the engine's own work by
 * name instead of a `this`, so a primitive's reach into the run is this list
 * and nothing else. Anything a new primitive needs has to be added here, in
 * the open, rather than taken quietly.
 */
export interface PrepareCtx {
    run: MissionRun;
    spec: MissionSpec;
    /** the decision as parsed — each handler narrows it by its own action */
    d: PlannerDecision;
    deps: MissionEngineDeps;
    now: number;
    /** the settled result ids the lead may name, worded as the refusal prints them */
    knownResults: string[];
    lend: PrepareLoan;
}

/** ‼️ X-69 — the engine's own work, lent to a handler by name. */
export interface PrepareLoan {
    stepResults(steps: MissionStep[]): StepResult[];
    refusalFor(field: string, bad: string[], valid: string[]): string;
    prepareMessage(
        run: MissionRun, spec: MissionSpec,
        d: Extract<PlannerDecision, { action: 'message' }>, now: number
    ): { refusal?: string; tasks?: PlannerTaskReq[]; conversationId?: string };
    prepareCouncil(
        run: MissionRun, spec: MissionSpec,
        d: Extract<PlannerDecision, { action: 'council' }>, now: number
    ): { refusal?: string; tasks?: PlannerTaskReq[] };
}

/**
 * What a prepare answers with: the work to run, or a refusal in the two pieces
 * the loop needs — the line the ledger keeps and the message the lead is sent.
 * Nothing else: a handler does not push to the ledger, end a round or write the
 * run, because a primitive that could do those is a second engine.
 */
export type PrepareResult =
    | { tasks: PlannerTaskReq[]; intent?: TaskIntent; sources?: string[] }
    | { refusal: string; ledger: string };

/**
 * ‼️ X-69 — THE ROW POINTS AT THE WRONG HANDLER, said out loud.
 *
 * Every handler below narrows the decision itself, with a guard rather than a
 * cast: the table is written by hand and the one mistake it invites is wiring a
 * row to its neighbour's function. A cast would run the wrong preparation on a
 * decision shaped for another primitive; this refuses the round and names the
 * action, which is a bug report rather than a corrupted run.
 */
function wrongHandler(d: PlannerDecision): PrepareResult {
    return {
        ledger: `R? ${d.action} rejected — it reached the wrong handler`,
        refusal: `Refused: "${d.action}" was dispatched to a handler for another primitive, `
            + 'which is a fault in this build rather than in your decision. '
            + 'Choose different work, or finish.'
            + '\nReply with ONLY the JSON decision object.'
    };
}

/**
 * `review` · `compare` · `revise` — ONE ordinary task, built by the engine out
 * of results the run already holds. Here rather than in the parse because only
 * the RUN knows what an id produced; and when it knows nothing about one, the
 * lead is told so rather than a delegate being sent to work on an empty quote.
 */
function prepareTypedIntent(c: PrepareCtx): PrepareResult {
    const { run, spec, d, lend, knownResults } = c;
    if (d.action !== 'review' && d.action !== 'compare' && d.action !== 'revise') { return wrongHandler(d); }
    const prim = intentPrimitive(d.action) as MissionPrimitive;
    // ‼️ X-65 — AND THE TARGET MUST HAVE SETTLED, not merely exist.
    // This asked only whether a step with that id was anywhere in
    // the run, so a queued or still-running step could be reviewed,
    // compared or revised — reading an output that had not been
    // written yet and recording a verdict on it.
    const all = run.rounds.flatMap(r => r.steps);
    const known = d.targets
        .map(id => all.find(st => st.id === id && (st.status === 'done' || st.status === 'failed')))
        .filter((st): st is MissionStep => !!st);
    const missing = d.targets.filter(id => !known.some(st => st.id === id));
    if (missing.length) {
        return {
            ledger: `R? ${d.action} rejected — no settled result with id ${missing.join(', ')}`,
            refusal: lend.refusalFor('targets', missing, knownResults)
        };
    }
    const material = lend.stepResults(known)
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
    return {
        intent: d.action,
        sources: [...d.targets],
        tasks: [{
            agent: d.agent,
            title: d.title || intentTitle(d.action, d.targets),
            prompt: buildIntentPrompt(prim, d.ask, material, spec.goal),
            readonly: prim.intent!.readonly,
            ...(criteria.length ? { criteria } : {})
        }]
    };
}

/**
 * `run_mission` — a child objective. The two checks that keep nesting from
 * being a fork bomb are here because only the run knows where it sits: how deep
 * it already is, and which objectives are above it.
 */
function prepareRunMission(c: PrepareCtx): PrepareResult {
    const { run, d, deps } = c;
    if (d.action !== 'run_mission') { return wrongHandler(d); }
    // ‼️ THE TWO THINGS THAT KEEP NESTING FROM BEING A FORK BOMB,
    // checked HERE because only the run knows where it sits: how
    // deep it already is, and what objectives are above it. An
    // objective that is already its own ancestor is the cycle —
    // it would restate the same goal for ever, each level convinced
    // it had delegated the problem.
    const depth = (run.depth ?? 0) + 1;
    if (depth > MAX_MISSION_DEPTH) {
        return {
            ledger: `R? run_mission rejected — depth cap (${MAX_MISSION_DEPTH})`,
            refusal: `Refused: this run is already ${run.depth ?? 0} level(s) deep and the cap is `
                + `${MAX_MISSION_DEPTH}. Do this work with delegations instead of another child objective.`
                + '\nReply with ONLY the JSON decision object.'
        };
    }
    const above = (deps.ancestry?.() ?? []).map(a => normalizeStrategy(a.goal));
    if (above.includes(normalizeStrategy(d.goal))) {
        return {
            ledger: 'R? run_mission rejected — that objective is already an ancestor of this run',
            refusal: 'Refused: an objective with that goal is already running above this one. '
                + 'Starting it again would be this run asking itself for the same thing. '
                + 'Break the work down differently, or do it with delegations.'
                + '\nReply with ONLY the JSON decision object.'
        };
    }
    return { tasks: [{
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
    }] };
}

/** `run_workflow` — the chain has to really exist, and only the run can see
 *  the list, so the lead is shown what this window actually has. */
function prepareRunWorkflow(c: PrepareCtx): PrepareResult {
    const { d, deps } = c;
    if (d.action !== 'run_workflow') { return wrongHandler(d); }
    // ‼️ THE CHAIN HAS TO REALLY EXIST, and if it does not the lead
    // is shown what this window actually has rather than a refusal
    // it cannot act on. Checked here and not in the parser for the
    // same reason a target id is: only the run can see the list.
    const list = deps.workflows?.() ?? [];
    const wf = list.find(x => x.id === d.workflow)
        ?? list.find(x => x.title.toLowerCase() === d.workflow.toLowerCase());
    if (!wf) {
        return {
            ledger: `R? run_workflow rejected — no workflow "${d.workflow}"`,
            refusal: `There is no workflow called "${d.workflow}". `
                + (list.length
                    ? `This window has: ${list.map(x => `"${x.title}"`).join(', ')}.`
                    : 'This window has none — the work has to be delegated.')
                + '\nChoose one that exists or delegate the work. Reply with ONLY the JSON decision object.'
        };
    }
    // ‼️ M-38 — a chain missing a required input is refused HERE, to the lead, with the reason.
    const given = resolveInputs(wf.inputs, d.inputs);
    if (!given.ok) {
        return {
            ledger: `R? run_workflow rejected — "${wf.title}" inputs`,
            refusal: `"${wf.title}" cannot start: ${given.problems.join('; ')}.`
                + '\nPass them as "inputs": {"<name>": "<value>"}, or choose another way. Reply with ONLY the JSON decision object.'
        };
    }
    return { tasks: [{
        agent: wf.title,
        title: d.ask ? `${wf.title} — ${d.ask.slice(0, 80)}` : `run workflow "${wf.title}"`,
        prompt: d.ask ?? '',
        // A chain writes unless every step of it reads, which is not
        // knowable from here — so it takes a writer's lane and is
        // serialised against other writers. The safe direction.
        readonly: false,
        kind: 'workflow', workflowId: wf.id,
        ...(d.inputs ? { inputs: d.inputs } : {}),
        ...(d.criteria?.length ? { criteria: d.criteria } : {})
    }] };
}

/** `message` · `council` (M-19/M-20) — the speaking turns. The record work is
 *  the engine's: this hands the decision to it and passes on what it refused. */
function prepareSpeaking(c: PrepareCtx): PrepareResult {
    const { run, spec, d, now, lend } = c;
    if (d.action !== 'message' && d.action !== 'council') { return wrongHandler(d); }
    const spoken = d.action === 'council'
        ? lend.prepareCouncil(run, spec, d, now)
        : lend.prepareMessage(run, spec, d, now);
    if (spoken.refusal) {
        return {
            ledger: `R? ${d.action} rejected — ${spoken.refusal.split('\n')[0]}`,
            refusal: `${spoken.refusal}\nReply with ONLY the JSON decision object.`
        };
    }
    return { tasks: spoken.tasks! };
}

/** `delegate` · `parallel` — the tasks are the lead's own; nothing is built. */
function prepareDelegation(c: PrepareCtx): PrepareResult {
    const { d } = c;
    if (d.action !== 'delegate' && d.action !== 'parallel') { return wrongHandler(d); }
    return { tasks: d.tasks };
}

/**
 * ‼️ X-69 — THE HANDLER TABLE: one row per primitive, and the row is the whole
 * of what the engine knows how to do with it.
 *
 * The registry in `missionPrimitives.ts` declares what EXISTS — the name, the
 * scope, the shape, the words the lead is shown. It deliberately holds no
 * behaviour: it is data, it is read by the prompt builder and by surfaces that
 * draw a recorded run, and importing the engine into it would make a cycle out
 * of a list. This is the other half: what each declared name is actually DONE
 * with, in the one module that can do it.
 *
 * Two things make it a contract rather than a second list to keep in step:
 *
 *   1. it is total over `PrimitiveName`, so a name added to the registry
 *      without a row here does not compile;
 *   2. `primitiveHandlerParity()` reads both sides at runtime and says which
 *      names are unhandled — which is what a test can fail on, including for a
 *      row that was pushed in without the type system ever seeing it.
 */
export interface PrimitiveHandler {
    parse: (c: ParseCtx) => ParseResult;
    /**
     * ‼️ REQUIRED ON A `work` ROW, ABSENT ON EVERY OTHER — and that is checked
     * rather than remembered (`primitiveHandlerParity`). A `plan`, `human` or
     * `terminal` primitive does not build work: it changes what the run IS
     * doing, in the loop, and a "prepare" for it would be a second place where
     * a run can end.
     */
    prepare?: (c: PrepareCtx) => PrepareResult;
    /**
     * ‼️ THE ONE `work` PRIMITIVE THAT BUILDS NO WORK THROUGH `prepare`, named
     * here rather than left as a hole in the rule.
     *
     * `evaluate` orders work — a reviewer's delegation is a real one, which is
     * why the budget guard treats it as work (X-70) — but it does not hand
     * tasks back to the round loop: it runs its own wave, reads the verdict out
     * of what came back and records the evaluation, because the verdict IS the
     * round. Squeezing that into `prepare` would mean the loop had to know what
     * to do with a task that answers the success gate, which is the one thing
     * M-17 keeps in one place. So the exception is declared, and the parity
     * check reads THIS rather than a name somebody has to remember.
     */
    ownRound?: true;
}

export const PRIMITIVE_HANDLERS: Record<PrimitiveName, PrimitiveHandler> = {
    delegate: { parse: parseDelegation, prepare: prepareDelegation },
    parallel: { parse: parseDelegation, prepare: prepareDelegation },
    review: { parse: parseTypedIntent, prepare: prepareTypedIntent },
    compare: { parse: parseTypedIntent, prepare: prepareTypedIntent },
    revise: { parse: parseTypedIntent, prepare: prepareTypedIntent },
    evaluate: { parse: parseEvaluate, ownRound: true },
    run_workflow: { parse: parseRunWorkflow, prepare: prepareRunWorkflow },
    run_mission: { parse: parseRunMission, prepare: prepareRunMission },
    message: { parse: parseMessage, prepare: prepareSpeaking },
    council: { parse: parseCouncil, prepare: prepareSpeaking },
    replan: { parse: parseReplan },
    finish: { parse: parseEnding },
    ask_user: { parse: parseAskUser },
    abort: { parse: parseEnding }
};

/**
 * ‼️ X-69 — THE GATE, READ AT RUNTIME FROM BOTH SIDES.
 *
 * The compile-time totality above covers the case the type system can see. It
 * cannot see a row appended to `PRIMITIVES` by something that was not compiled
 * against it — which is exactly what the test does, because that is the failure
 * being prevented: a primitive that exists, is offered to the lead, and has
 * nothing behind it.
 */
export function primitiveHandlerParity(): {
    /** declared in the registry with no parse behind it */
    unparsed: string[];
    /** declared as `work` with neither a `prepare` nor a stated `ownRound` */
    unprepared: string[];
    /** carries work preparation while claiming not to be work */
    miscast: string[];
    /** a handler row for a name the registry does not declare */
    orphaned: string[];
} {
    const rows = new Map(PRIMITIVES.map(p => [String(p.name), p]));
    const table = PRIMITIVE_HANDLERS as Record<string, PrimitiveHandler | undefined>;
    const unparsed: string[] = [], unprepared: string[] = [], miscast: string[] = [];
    for (const [name, p] of rows) {
        const h = table[name];
        if (typeof h?.parse !== 'function') { unparsed.push(name); }
        const buildsWork = typeof h?.prepare === 'function' || h?.ownRound === true;
        if (p.shape === 'work' && !buildsWork) { unprepared.push(name); }
        if (p.shape !== 'work' && buildsWork) { miscast.push(name); }
    }
    return {
        unparsed, unprepared, miscast,
        orphaned: Object.keys(PRIMITIVE_HANDLERS).filter(n => !rows.has(n))
    };
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
    // 0 on any axis = the user asked for no ceiling there, so nothing is ever
    // "left" to run out: Infinity is what `guardReason` reads as never spent.
    return {
        rounds: spec.limits.maxRounds > 0 ? spec.limits.maxRounds - run.rounds.length : Infinity,
        tasks: spec.limits.maxTasks > 0 ? spec.limits.maxTasks - spentTasks : Infinity,
        costUSD: spec.limits.maxCostUSD > 0
            ? Math.round((spec.limits.maxCostUSD - run.totalCostUSD) * 100) / 100 : Infinity,
        tokens: maxTokens > 0 ? maxTokens - (run.totalTokens ?? 0) : Infinity,
        minutes: spec.limits.maxMinutes > 0 ? Math.round(spec.limits.maxMinutes - elapsedMin) : Infinity
    };
}

/**
 * ‼️ X-83 — THE CEILING IN FLIGHT IS A DIFFERENT QUESTION FROM THE ONE AT THE
 * BOUNDARY, AND ASKING IT WITH THE SAME WORDS GETS THE WRONG ANSWER TWICE.
 *
 * `guardReason(remainingBudget(...))` answers "is there room to START another
 * round?". The wave guard was reusing it to answer "has the work already
 * running gone past a ceiling?", and those two disagree on every axis:
 *
 *   * ROUNDS and TASKS are ALLOCATIONS, and the round in flight has already
 *     been granted one — it is in `run.rounds` and its steps are in
 *     `spentTasks` the moment it starts. So under `maxRounds: 1` or
 *     `maxTasks: 1` the remaining count is already 0 while the legal, first,
 *     only wave is running, and the guard cancelled it the first time it took
 *     longer than one guard interval. A limit of one meant a limit of fifteen
 *     seconds. They are not measured here at all: refusing the NEXT round is
 *     the boundary guard's job and it does it.
 *
 *   * COST and TOKENS were claimed to "ride along for free" and did not:
 *     `run.totalCostUSD` is only advanced AFTER the wave returns, so the guard
 *     read a figure that could not move and never cut on spending. What CAN be
 *     measured mid-flight is the steps that have already settled — their own
 *     `costUSD`/`tokens` are filled in as they come back — so the live figure
 *     is the run's booked total plus everything settled and not yet booked.
 *     A step still running contributes nothing, which is the honest answer:
 *     nobody knows what it has spent until it says so.
 *
 *   * TIME is the one that genuinely keeps moving while nothing else does, and
 *     it is why this guard exists (X-46b). Unchanged.
 */
export function inFlightGuardReason(
    spec: MissionSpec, run: MissionRun, unbooked: readonly MissionStep[], now: number
): string | null {
    const liveCost = run.totalCostUSD + unbooked.reduce((a, s) => a + (s.costUSD ?? 0), 0);
    const liveTokens = (run.totalTokens ?? 0) + unbooked.reduce((a, s) => a + (s.tokens ?? 0), 0);
    const maxTokens = spec.limits.maxTokens ?? 0;
    if (spec.limits.maxCostUSD > 0 && Math.round((spec.limits.maxCostUSD - liveCost) * 100) / 100 <= 0) {
        return 'the cost budget is spent';
    }
    if (maxTokens > 0 && maxTokens - liveTokens <= 0) { return 'the token budget is spent'; }
    if (spec.limits.maxMinutes > 0) {
        const elapsedMin = (now - run.startedAt - (run.waitedMs ?? 0)) / 60_000;
        if (Math.round(spec.limits.maxMinutes - elapsedMin) <= 0) { return 'the time limit is reached'; }
    }
    return null;
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
    // An axis the user left unlimited is SAID to be unlimited rather than
    // printed as "Infinity round(s)" — a lead that reads a broken figure
    // plans around a limit nobody set.
    const rounds = isFinite(rem.rounds) ? `${rem.rounds} round(s)` : 'unlimited rounds';
    const tasks = isFinite(rem.tasks) ? `${rem.tasks} task(s)` : 'unlimited tasks';
    const cost = isFinite(rem.costUSD) ? `$${rem.costUSD.toFixed(2)}` : 'no cost ceiling';
    const mins = isFinite(rem.minutes) ? `~${rem.minutes} min` : 'no time limit';
    return `Remaining budget: ${rounds}, ${tasks}, ${cost}${tokens}, ${mins}.`;
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
        // ‼️ M-18 — A FAILURE IS A BLOCK, NOT AN ASIDE. The note stays in the
        // heading exactly where it was, so a step that merely carries a remark
        // reads as it always did; a step that FAILED gets the normalised shape
        // under it, because "→ FAILED (agent not found)" is a sentence the lead
        // can only guess at and it guessed "retry" for as many rounds as the
        // ceiling allowed.
        const failed = describeFailure(s.failure);
        return `### ${withIds ? `[id: ${s.id}] ` : ''}${s.agentName} — "${s.title}" → ${s.status.toUpperCase()}${cost}${dur}${s.note ? ` (${s.note})` : ''}
${failed ? failed + '\n' : ''}${s.expect ? `Expected: ${s.expect}\n` : ''}${r.excerpt ? `Output (excerpt):\n${r.excerpt}` : '(no output)'}
${s.outputFile ? `Full output file: ${s.outputFile}` : ''}`;
    });
    return `## Round results
${parts.join('\n\n')}
${notes.length ? '\n## Notes\n' + notes.map(n => `- ${n}`).join('\n') : ''}
${remLine(rem)}
Decide the next round. ${'Reply with ONLY the JSON decision object.'}`;
}

/**
 * ‼️ M-18 — WHAT A CHILD OBJECTIVE HANDED BACK, IN ONE SENTENCE.
 *
 * A child returns a VERDICT, which no output archive holds — so this text IS
 * the step's result, and the lead is shown nothing else about the child. It
 * lives here rather than at the two places that write it (the observation loop
 * and the reload recovery) because those two are exactly the places that must
 * agree: a run recovered after a window reload has to say the same thing it
 * would have said had nobody closed the window.
 */
export function childResultText(cr: {
    status: string; note?: string; result?: MissionResult
}): string {
    const r = cr.result;
    if (!r) { return `Child objective ${cr.status}${cr.note ? ` — ${cr.note}` : ''}`; }
    return `Child objective ${r.verdict}`
        + (r.stopReason ? ` (${r.stopReason})` : '')
        + `: ${r.summary}`
        + (r.unmet?.length
            ? `\nStill unmet: ${r.unmet.map(u => `[${u.id}] ${u.text} → ${u.verdict}`).join('; ')}`
            : '');
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
    // ‼️ M-19 — AND THE FIELDS A PRIMITIVE NEEDS COME FROM THE SAME ROW. They
    // were declared on the registry and then hand-written into the block below,
    // which is the drift the registry exists to prevent one level down: a
    // primitive could be offered with the parser reading a field the lead was
    // never shown. Generated here, a new primitive brings its own vocabulary.
    const extraFields = prims.flatMap(p => p.fields ?? []).map(f => `  ${f},`).join('\n');
    return `Reply with ONLY one JSON object (no prose around it):
{
  "rationale": "one short sentence, written to be SHOWN to the user: why this decision, now",
  "currentPhase": "your own short label for where this run is (e.g. \\"triage\\", \\"building\\", \\"verifying\\") — an observation, not a stage anyone enforces",
  "strategy": "your working approach, restated IN FULL every time — even if it has not changed",
  "changeReason": "only when the strategy above differs from your last one: what made you change it",
  "basedOn": ["ids of earlier results or decisions this one rests on — REAL ids only, from the \\"id\\" shown with each round result; leave the list empty rather than inventing one"],
  "thought": "one short sentence on your reasoning",
  "action": ${menu},
  "tasks": [ { "agent": "<pool agent name>", "title": "...", "prompt": "full self-contained instructions for that agent", "expect": "how to tell it succeeded", "criteria": ["<criterion ids this work is for>"], "readonly": true|false } ],
  "agent": "for review/compare/revise: the ONE pool agent that does it",
  "ask": "for review/compare/revise: what you want looked at, weighed, or fixed",
  "targets": ["REQUIRED for evaluate and for review/compare/revise: the result ids you mean — at least one, and each must be a result that has already SETTLED"],
  "reviewer": "for evaluate: a pool agent to review independently — omit to judge it yourself",
  "findings": [ { "criterion": "<criterion id>", "verdict": "pass" | "fail" | "unknown", "evidence": "what you actually saw", "gap": "what is missing" } ],
  "advice": "for evaluate: finish | revise | replan | explore | ask_user | partial | failed",
  "question": "only for ask_user",
${extraFields}
  "verdict": "success" | "partial" | "failed",  "summary": "only for finish/abort — what was achieved, what remains",
  "stopReason": "REQUIRED on finish/abort — one of: criteria-satisfied | sufficient-evidence | no-new-information | execution-over-discussion | hard-limit"
}

What each action is:
${what}

Rules:
- "review", "compare" and "revise" work on results this run ALREADY produced: you name the ids in "targets" and the engine attaches the real output to the prompt. Do not paste the work into "ask" — name it.
- "ask" is also what you want from a "message": what this speaker should address, in your own words. It is labelled as yours in the prompt and is never presented as somebody else's message.
- A "revise" is charged to the same criteria as the work it revises, so any pass recorded about the old version goes stale. That is the point of it.
${extraRules}
- ‼️ "finish" with "success" is REFUSED unless every REQUIRED criterion has a current PASS on record. A criterion is judged by an "evaluate", never by a delegation finishing — a delegate exiting cleanly says the work RAN, not that the objective is met.
- ‼️ An "evaluate" must NAME what it looked at in "targets" — at least one result that has already settled. A verdict bound to nothing could never go out of date, and one that can never go out of date is a permanent pass.
- An evaluation goes STALE when work for one of the criteria it judged settles after it, OR when something it judged is later revised. Judge again after you change something; a pass about the old version does not open the gate.
- ‼️ Every "finish" and "abort" must carry a "stopReason" from the list above. "Reached the objective" and "ran out of rope" are different endings and the record has to be able to tell them apart.
- ‼️ X-91 — the three parts of an ending must AGREE: "criteria-satisfied" only goes with "success", "hard-limit" never does, and an "abort" is never a "success". "user-stop" is the ENGINE's to record — a person pressing stop — and is refused from you.
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
- ‼️ X-92 — and the mark has a second job: a WRITER that names no "criteria" could have changed anything, so every pass on record goes stale and has to be judged again. Name the criteria a writer is for and only those go stale; mark reading work "readonly": true and none do.
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
    // ‼️ M-19 — A SPEAKING TURN IS NAMED BY WHAT IT WAS, in the conversation it
    // was in. A lead re-seeded from the ledger after a reload has to be able to
    // tell "a3 challenged m2 in c1" from a delegation, or it will order the
    // turn again — and the second copy would be a message nobody answered.
    if (round.action === 'message' || round.action === 'council') {
        const conv = round.steps[0]?.message?.conversationId ?? '?';
        const turns = round.steps.map(s => {
            const link = s.message;
            // ‼️ S-64 — a lane re-told because its session was handed over says
            // so: the lead must not read it as an engine that cannot resume.
            const carried = link && link.carried !== 'new'
                ? `,${link.carried}${link.handedOver ? ` after handover${laneHandoverPct(link.handedOver)}` : ''}`
                : '';
            return `${link?.messageId ?? '?'}:${s.agentName}(${s.status}${carried})`;
        }).join(' · ');
        // ‼️ Several turns on one line means they were ordered TOGETHER, which
        // is the only way to read "these two did not see each other".
        // ‼️ M-20 — and a round that OPENED a council says so, because a lead
        // re-seeded from the ledger has to know the conversation it is looking
        // at is chaired and capped. The turns read identically either way,
        // which is the point: a council adds no way of speaking.
        return `R${round.n} ${round.action} ${conv}${round.steps.length > 1 ? ' independent' : ''} — ${turns}`
            + (round.rejectedReason ? ` [${round.rejectedReason}]` : '');
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
    // 0 = unlimited: one wave holds the whole round. The one-writer rule still
    // splits it, because that rule is about correctness, not about pacing.
    const cap = maxParallel > 0 ? maxParallel : Infinity;
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
export function parsePlannerEnvelope(stdout: string): OneShotEnvelope | null {
    // ‼️ X-249 (2/n) — THE SHAPE MOVED, THE NAME STAYED. Four call sites import
    // this, and the envelope is not a fact about missions: it is a fact about
    // the ENGINE, declared beside the command line that produced it
    // (`core/oneShot.ts`). Keeping a second copy here is precisely how "the
    // planner reads one envelope and the leader reads another" happens.
    return oneShotEnvelope('claude', stdout);
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

/**
 * ‼️ X-62 — WHAT THE STORE ITSELF IS IN, which used to be one word: nothing.
 *
 *   * `empty`       — there was no file, or there was one and its bytes have been
 *                    set aside; an empty list is the honest state and saving
 *                    over the (now moved) file loses nothing.
 *   * `unreadable`  — the file exists, could not be read or parsed, and could
 *                    NOT be set aside. Nothing may be written here.
 */
export type StoreHealth = 'ok' | 'empty' | 'unreadable';

/** An error as one short sentence — never a stack trace in a surface string. */
const short = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 160);

/** What one `save` actually did. Never thrown — a mission must not die because
 *  its snapshot could not be written, but nobody may be told it was. */
export interface StorePersistence {
    saved: boolean;
    /** which step failed: the temp copy, the swap, or the refusal before both */
    stage?: 'temp' | 'rename' | 'refused';
    error?: string;
}

/**
 * ‼️ X-87 — WHAT MAKES A PARSED FILE A MISSION STORE.
 *
 * X-62 taught the store that missing and corrupt are different events, but it
 * asked only whether the BYTES parsed. Everything after that was a shrug:
 * `Array.isArray(parsed.specs) ? parsed.specs : []`. So a file that was perfect
 * JSON and nothing like a store — `{"specs":"broken"}`, a bare `[]`, `{}`, a
 * list of strings where the specs are — opened as `health: 'ok'` with an empty
 * list, and the next save persisted that emptiness as the truth. The failure
 * X-62 exists to prevent, reached by a different door.
 *
 * What is checked is IDENTITY, and only identity: the root, the two containers,
 * and each item being an object that says which spec/run it is. Everything else
 * is a field an older version may legitimately not have written, and defaulting
 * one of those in is migration, not damage (`migrateSpec`). Returns the fault as
 * a sentence, or `undefined` when the file really is a store.
 */
export function storeSchemaFault(parsed: unknown): string | undefined {
    const nameOf = (v: unknown): string =>
        v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return `its root is ${nameOf(parsed)}, not an object`;
    }
    const o = parsed as Record<string, unknown>;
    if (o.specs === undefined && o.runs === undefined) {
        return 'it holds neither specs nor runs — an empty store is written as {"specs":[],"runs":[]}';
    }
    for (const k of ['specs', 'runs'] as const) {
        if (o[k] === undefined) { continue; }
        if (!Array.isArray(o[k])) { return `"${k}" is ${nameOf(o[k])}, not a list`; }
    }
    const idsOf = (k: 'specs' | 'runs', keys: readonly string[]): string | undefined => {
        const list = (o[k] ?? []) as unknown[];
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return `${k}[${i}] is ${nameOf(item)}, not an object`;
            }
            for (const key of keys) {
                const v = (item as Record<string, unknown>)[key];
                if (typeof v !== 'string' || !v.trim()) {
                    return `${k}[${i}] has no ${key}`;
                }
            }
        }
        return undefined;
    };
    return idsOf('specs', ['id']) ?? idsOf('runs', ['id', 'specId']);
}

export class MissionStore {
    specs: MissionSpec[] = [];
    runs: MissionRun[] = [];

    /** ‼️ X-62 — the store's own health, decided at load and kept. */
    health: StoreHealth = 'empty';
    /** where an unreadable store was set aside, when one was */
    quarantine?: string;
    private loadNote?: string;
    private saveNote?: string;

    /** portableRoots: saved strings carry ${claudeDir}/${globalStorage}/${home}
     *  tokens instead of machine paths — the git-synced store travels. */
    constructor(private file: string, private portableRoots: () => PortableRoot[] = () => []) { }

    /** Where the snapshot lives, so a surface can name it to the user. */
    get storeFile(): string { return this.file; }

    /** The sentence a surface shows — empty when nothing is wrong. */
    get degraded(): string | undefined {
        const notes = [this.loadNote, this.saveNote].filter(Boolean) as string[];
        return notes.length ? notes.join('; ') : undefined;
    }

    /** ‼️ Nothing may be written over the file until a person deals with it. */
    get recoveryRequired(): boolean { return this.health === 'unreadable'; }

    /**
     * ‼️ X-62 — MISSING AND CORRUPT ARE NOT THE SAME EVENT, and one `catch` read
     * them as one. A store that had never existed and a store whose bytes had
     * gone bad both produced an empty list in memory — and the very next
     * `save()` wrote that empty list over the real one. The fleet's entire
     * mission history could be lost to a single unreadable byte, silently.
     *
     * So the corrupt bytes are EVIDENCE and are set aside before anything can
     * write in their place. If they cannot be set aside — the file is locked,
     * the disk is full — the store refuses to save at all rather than
     * overwrite what it could not preserve.
     */
    load(): void {
        this.quarantine = undefined;
        this.loadNote = undefined;
        this.saveNote = undefined;
        let raw: string;
        try { raw = fs.readFileSync(this.file, 'utf8'); } catch (e) {
            this.specs = []; this.runs = [];
            const code = (e as NodeJS.ErrnoException)?.code;
            if (code === 'ENOENT') { this.health = 'empty'; return; }
            this.health = 'unreadable';
            this.loadNote = 'the mission store could not be read (' + short(e)
                + ') — nothing will be saved over it until it can be';
            return;
        }
        let json: unknown;
        try { json = JSON.parse(raw); } catch (e) { this.corrupt(raw, short(e)); return; }
        // ‼️ X-87 — SYNTAX IS NOT SCHEMA, and X-62 only ever asked the first
        // question. `{"specs":"broken","runs":"broken"}`, `[]`, `{}` and a list
        // of items that are not specs all parse perfectly, and every one of them
        // used to load as `health: 'ok'` with an empty list — which the very
        // next `save()` wrote over the real history. The hole X-62 closed on bad
        // BYTES was still wide open on bad SHAPE.
        const fault = storeSchemaFault(json);
        if (fault) { this.corrupt(raw, fault); return; }
        try {
            const parsed = expandDeep(
                json as { specs?: MissionSpec[]; runs?: MissionRun[] },
                this.portableRoots());
            this.specs = (parsed.specs ?? []).map(migrateSpec);
            this.runs = parsed.runs ?? [];
            this.health = 'ok';
        } catch (e) { this.corrupt(raw, short(e)); }
    }

    /**
     * ‼️ X-62/X-87 — a store that cannot be trusted is EVIDENCE. It is set aside
     * before anything can write in its place, and if it cannot be set aside the
     * store refuses to save at all rather than overwrite what it could not keep.
     */
    private corrupt(raw: string, why: string): void {
        this.specs = []; this.runs = [];
        const kept = this.setAside(raw);
        if (kept) {
            this.health = 'empty';
            this.quarantine = kept;
            this.loadNote = 'the mission store was unreadable (' + why + ') and has been kept as '
                + path.basename(kept) + ' — the fleet starts from an empty list';
        } else {
            this.health = 'unreadable';
            this.loadNote = 'the mission store is unreadable (' + why
                + ') and could not be set aside — nothing will be saved over it';
        }
    }

    /** Move the unreadable bytes out of the way; copy them if the move fails. */
    private setAside(raw: string): string | undefined {
        const dest = this.file.replace(/\.json$/i, '') + '.corrupt-' + Date.now() + '.json';
        try { fs.renameSync(this.file, dest); return dest; } catch { /* locked — copy instead */ }
        try { fs.writeFileSync(dest, raw, 'utf8'); return dest; } catch { return undefined; }
    }

    save(): StorePersistence {
        // ‼️ X-62 — a store whose bytes could not be read AND could not be
        // preserved is never written over. The in-memory list is empty because
        // the read failed, not because the fleet has no missions.
        if (this.recoveryRequired) {
            return { saved: false, stage: 'refused', error: this.loadNote };
        }
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
        try { fs.writeFileSync(tmp, body, 'utf8'); } catch (e) {
            // nothing has touched the target yet, and nothing will: the last
            // good store stays exactly as it was
            try { if (fs.existsSync(tmp)) { fs.unlinkSync(tmp); } } catch { /* best-effort */ }
            this.saveNote = 'the mission store could not be written (' + short(e)
                + ') — the last saved copy is still on disk';
            return { saved: false, stage: 'temp', error: short(e) };
        }
        try { fs.renameSync(tmp, this.file); } catch (e) {
            // ‼️ X-62 — AND THE FALLBACK THAT UNDID THE WHOLE POINT IS GONE.
            // This used to answer a failed rename with a DIRECT write over the
            // target — which is the truncation the atomic swap exists to
            // prevent, reintroduced at exactly the moment the machine is
            // already in trouble. The target is left untouched and the new
            // state is left in the temp file, named, so a person can recover
            // it; the next successful save renames it away by itself.
            this.saveNote = 'the mission store could not be updated (' + short(e)
                + ') — the last saved copy is still on disk and the new state is in '
                + path.basename(tmp);
            return { saved: false, stage: 'rename', error: short(e) };
        }
        this.saveNote = undefined;
        return { saved: true };
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
    /**
     * ‼️ X-46b — STOP THE WORK IN FLIGHT WITHOUT STOPPING THE ENGINE. A ceiling
     * reached mid-wave has to reach the processes, and `cancel()` cannot do it:
     * that ends the run as `cancelled`, which is a different and untrue story
     * about why it stopped. Optional, because a harness whose wave always
     * settles never has anything to stop.
     */
    cancelWave?(run: MissionRun, steps: MissionStep[], reason: string): void;
    /** How often a wave in flight is measured against the ceilings, in ms.
     *  Only a test has any reason to shorten it. */
    waveGuardMs?: number;
    /**
     * ‼️ WHAT THE DELEGATE SAID, from its archive (fail-soft '').
     *
     * The task id travels with the file because the answer is ENGINE-SHAPED: an
     * OpenCode run archives its own JSONL event stream and an Antigravity one
     * archives an envelope, so a reader given only a path hands the next
     * speaker a transport document and calls it what somebody said. Measured on
     * a real run — `engineReplyText` in core/tasks.ts is the one place that
     * knows which shape belongs to which engine.
     */
    readOutputBody(file: string, taskId?: string): string;
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
    workflows?(): { id: string; title: string; steps: number; inputs?: WorkflowInput[] }[];
    /**
     * ‼️ M-18 — THE PROJECT THIS RUN IS WORK FOR, if it is work for one.
     *
     * The lead's system prompt carries the project's generated brief (the
     * extension passes the same file every other Claude surface gets), but a
     * brief describes the project — it does not say what the LEAD's relationship
     * to it is. That is what this produces: the name, so the run can be talked
     * about, and the fact that keeping the project's own records straight is
     * something the lead ORDERS rather than does.
     *
     * Optional and absent-means-none, like every other dep here: a mission with
     * no project reads exactly as it did.
     */
    project?(): { name: string; docs?: string } | undefined;
    /**
     * ‼️ A-17 — WHAT ORCHESTRATION HAS OBSERVED HERE BEFORE, in a few lines.
     *
     * Each line is a COUNT with an outcome attached, drawn from finished runs
     * of THIS project only and only where there were enough of them to mean
     * anything (`core/missionOutcomes.ts` holds all three fences). There is no
     * instruction in it and there must never be: the lead is the thing that
     * decides, and a recommendation dressed as data is how a runtime planner
     * turns into a lookup table.
     *
     * Empty is the normal answer on a young farm and the block is then not
     * drawn at all — an "insufficient sample" heading in a briefing would be
     * paying tokens to say nothing.
     */
    experience?(): string[];
    /**
     * ‼️ M-18 — the objectives ABOVE this run, nearest first. Empty for a root
     * run, and absent in a harness that does not nest. It is what makes a cycle
     * detectable: a child asked to reach a goal that is already its own
     * ancestor would restate it for ever, every level convinced it had handed
     * the problem on.
     */
    ancestry?(): { runId: string; goal: string }[];
    /**
     * ‼️ M-19 — CAN THIS AGENT'S LANE REALLY BE PICKED UP AGAIN?
     *
     * The engine knows a participant has spoken before and holds the session it
     * spoke in. What it cannot know is whether the CLI that agent runs on has a
     * resume vocabulary at all — that depends on the engine resolved for this
     * delegate, which is settled by the same ladder a launch climbs and lives
     * where the settings do.
     *
     * It is asked rather than assumed because the honest default is `false`: an
     * engine with no resume flag handed a session id ignores it and starts a
     * NEW conversation, and the run would then be labelling as "resumed" a lane
     * that was silently re-begun. Absent means no lane is ever claimed as
     * continued, which is a true statement about a harness that cannot check.
     */
    canResumeLane?(agentId: string): boolean;
    /**
     * ‼️ S-64 — WAS THIS SESSION HANDED OVER? Asked of the context guard, the
     * only thing that knows: it read the window and sent the sentence, and it
     * records the note that closed it. A session that was is never resumed —
     * not a speaker's lane and not the lead's own planning conversation; the
     * law sends the next run into a fresh session.
     */
    sessionHandedOver?(sessionId: string): LaneHandover | undefined;
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

/** How often a wave in flight is measured against the mission's ceilings. Far
 *  coarser than the ceilings themselves — this is a backstop for work that has
 *  stopped answering, not a stopwatch. */
export const WAVE_GUARD_MS = 15_000;

/** Absolute ceiling on planner calls per run: rounds + parse retries + guard
 *  nudges can never spin past this, whatever the planner does. */
function hardCallCap(spec: MissionSpec): number {
    // ‼️ A ROUND CEILING OF 0 IS "NO CEILING", NOT "SIX CALLS". Reading it
    // as a number here would turn the one field that says "run as long as it
    // takes" into the tightest leash in the file.
    return spec.limits.maxRounds > 0 ? spec.limits.maxRounds + 6 : Infinity;
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

    /**
     * ‼️ X-46b — A CEILING YOU CAN PASS IS NOT A CEILING.
     *
     * Every mission limit used to be measured at the PLANNER boundary, which is
     * the one moment a hung wave never reaches. Measured on a real run: a single
     * delegate sat 45+ minutes without answering, the run went past its
     * 50-minute ceiling, was still `running` at minute 70, and had to be stopped
     * by hand. The wall clock is the ceiling that keeps moving while nothing
     * else does, and cost and tokens ride along with it as far as they can
     * honestly be read — see `inFlightGuardReason`, which is what this asks and
     * is deliberately NOT the question the planner boundary asks.
     *
     * `unbooked` is the work whose spending has not reached the run's totals
     * yet: those are added once, after the whole round, so during a wave the
     * live figure is the run plus every step of this round that has already
     * settled. Defaults to the wave itself for a caller with nothing else in
     * flight.
     *
     * What this does NOT do is walk away from the wave. A promise dropped on the
     * floor leaves real processes running that nothing will ever claim, so it
     * asks for the same cancel a person would and then still waits for the wave
     * to settle: the steps come back with a real outcome, the ledger with a real
     * cost, and the step says which ceiling cut it.
     */
    private async runWave(
        run: MissionRun, steps: MissionStep[], unbooked?: readonly MissionStep[]
    ): Promise<string | null> {
        const { spec, deps } = this;
        let cut: string | null = null;
        const timer = setInterval(() => {
            if (cut) { return; }
            const reason = inFlightGuardReason(spec, run, unbooked ?? steps, deps.now());
            if (!reason) { return; }
            cut = reason;
            for (const s of steps) {
                // Anything the wave has not settled — running, queued, or held
                // behind a ceiling of its own — carries the reason it stopped.
                if (s.status !== 'done' && s.status !== 'failed' && s.status !== 'cancelled') {
                    s.note = `stopped by the mission ceiling — ${reason}`;
                }
            }
            this.setNow(`stopping the round — ${reason}`);
            deps.onUpdate(run);
            deps.cancelWave?.(run, steps, reason);
        }, deps.waveGuardMs ?? WAVE_GUARD_MS);
        try { await deps.delegateWave(run, steps); } finally { clearInterval(timer); }
        return cut;
    }

    /**
     * ‼️ X-91 — THE USER'S STOP, THROUGH THE SAME DOOR AS EVERY OTHER ENDING.
     * `end('cancelled')` wrote a status and walked away: no verdict, no
     * `user-stop`, no summary, no open criteria — from the five places in the
     * round loop where a cancel is noticed. `finish` is the door, so a
     * cancelled adaptive run now says what was still open at the moment the
     * hand came down, exactly as a `partial` does.
     */
    private endAtCancel(): void {
        this.finish('cancelled', cancelledResult(this.spec, this.run));
    }

    /**
     * ‼️ X-72 — MONEY ALREADY SPENT IS FINISHED WORK. Called on every way out
     * of a round, including the two that used to return above it, and safe to
     * call twice: the mark on the round is what makes it once.
     */
    private bookRound(round: MissionRound, opts?: { ledger?: boolean }): void {
        if (round.booked) { return; }
        round.booked = true;
        this.run.totalCostUSD += round.steps.reduce((a, s) => a + (s.costUSD ?? 0), 0);
        // ‼️ …and the tokens, which is the half that moves on a plan-billed
        // delegate. Without this a wave of Codex steps advanced no limit at
        // all: no dollars (there are none), and rounds/tasks are too coarse
        // to be a budget.
        this.run.totalTokens = (this.run.totalTokens ?? 0)
            + round.steps.reduce((a, s) => a + (s.tokens ?? 0), 0);
        if (opts?.ledger !== false) { this.run.ledger.push(ledgerLine(round)); }
    }

    /** The honest ending for a ceiling reached mid-wave: `hard-limit` naming the
     *  ceiling, never the `cancelled` that would claim a hand did it. */
    private endAtCeiling(reason: string): void {
        this.finish('failed', {
            verdict: 'partial',
            summary: `Stopped in the middle of a round: ${reason}. The delegations in flight were cancelled.`,
            stopReason: 'hard-limit'
        }, reason);
    }

    /**
     * ‼️ M-17 / X-68 — EVERY ADAPTIVE ENDING GOES THROUGH ONE DOOR.
     *
     * `unmet` used to be filled in exactly one place: when a lead claimed
     * "success", the gate refused, the lead insisted, and the verdict was
     * brought down to `partial`. Every other way a run can end short — an
     * honest `partial`, an explicit `failed`, an `abort`, a ceiling reached
     * mid-wave — recorded no structured gaps at all, and left saying what was
     * missing to whatever prose the model happened to write. So the SAME
     * partial verdict sometimes showed the reader which criteria were open and
     * sometimes could not, from the same surface, with nothing to distinguish
     * the two cases.
     *
     * Now the criteria state is read here, once, for every terminal that is not
     * a stated success — and the summary is DETERMINISTICALLY completed when
     * the model's own words skipped the gaps.
     */
    private finish(status: MissionRunStatus, result: MissionResult, note?: string): void {
        if (!isAdaptive(this.spec) || result.verdict === 'success') {
            this.end(status, result, note);
            return;
        }
        const gate = successGate(this.spec.successCriteria ?? [], this.liveEvaluations());
        const unmet = result.unmet?.length ? result.unmet : gate.unmet;
        let summary = result.summary;
        if (unmet.length && !unmet.every(u => summary.includes(u.id))) {
            summary += '\n\nStill open: '
                + unmet.map(u => `[${u.id}] ${u.text} (${u.verdict})`).join('; ') + '.';
        }
        this.end(status, {
            ...result, summary,
            ...(unmet.length ? { unmet } : {})
        }, note);
    }
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

    /**
     * ‼️ X-80 — WHERE THE TALKING HAD GOT TO, for a lead coming back from a
     * reload. The generic resume message carries the round's results and the
     * budget and nothing else: no message ids, no open questions, no council
     * mandate — so a lead resumed mid-debate could not answer anybody, could
     * not tell whose turn it was, and had no id to put in `refs`.
     *
     * Only conversations that are still LIVE (open, or holding an unanswered
     * question) are worth the tokens; a closed one is history and the record
     * keeps it. Empty string when there is nothing to say, so the ordinary
     * resume message is left exactly as it was.
     */
    private resumeDigest(): string {
        const { spec, run } = this;
        const live = (run.conversations ?? []).filter(c => !c.closedAt);
        if (!live.length) { return ''; }
        const roster = allowedAgents(spec);
        const nameOf = (id: string) =>
            roster.find(m => m.agentId === id)?.agentName ?? (id === 'lead' ? 'you' : id);
        const parts = live.map(c => conversationDigest(c, run.messages ?? [], { nameOf }).text);
        const councils = live
            .map(c => councilOf(run.councils, c.id))
            .filter((k): k is MissionCouncil => !!k)
            .map(k => councilDigest(k, run.messages ?? [], { nameOf }));
        return '\n\n' + [...parts, ...councils].join('\n\n');
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
     * ‼️ M-16 / X-66 — ONE PLANNER BOUNDARY, ONE DELIVERY — IN TWO PHASES.
     *
     * This used to mark the steer APPLIED and write the journal line before the
     * planner call, on the reasoning that a crash mid-call must lose it rather
     * than repeat it. The reasoning was sound and the implementation was not:
     * marked-before-the-call means a window that closed between the mark and
     * the reply left a steer that had NEVER been delivered recorded as
     * delivered for ever — `buildResumeMessage` does not carry applied
     * guidance, and if the old planner session resumed successfully the
     * history fallback did not run either. The user typed it, it never landed,
     * and nothing said so.
     *
     * So delivery is now pending → inflight → acknowledged. Taking a steer only
     * puts it IN FLIGHT; `settleGuidance` makes it a fact once the lead has
     * actually answered a call that carried it. A crash in between leaves it
     * in flight, an engine taking the run over re-opens it (`reopenGuidance`),
     * and it comes back labelled as ALREADY IN FORCE — which is what stops a
     * lead that did read it from acting on it twice.
     */
    private takeGuidance(): string {
        const due = pendingGuidance(this.run);
        if (!due.length) { return ''; }
        const at = this.deps.now();
        for (const g of due) { g.inflightAt = at; }
        this.deps.onUpdate(this.run);
        const fresh = due.filter(g => !g.standing);
        const again = due.filter(g => g.standing);
        let out = '';
        if (fresh.length) {
            out += `\n\n## Guidance from the user${fresh.length > 1 ? ` (${fresh.length} messages)` : ''}\n`
                + fresh.map(g => g.text).join('\n\n')
                + '\nTake this into account from this decision onward. It is NOT an instruction to work already in flight.';
        }
        if (again.length) {
            out += `\n\n## Guidance already in force${again.length > 1 ? ` (${again.length} messages)` : ''}\n`
                + again.map(g => `- [${g.id}] ${g.text}`).join('\n')
                + '\nA window closed while this was being sent to you, so it is repeated to be safe.'
                + ' If you have already acted on it, do not act again — it is a standing instruction, not a new one.';
        }
        return out;
    }

    /**
     * ‼️ X-66 — DELIVERY BECOMES A FACT HERE, and only here: the lead has come
     * back from a call that carried the steer, so it has read it. The journal
     * line is written at this moment for the same reason — it is the record
     * every later reader trusts for "exactly once", so it must not exist for a
     * delivery that never happened.
     */
    private settleGuidance(): void {
        const inflight = (this.run.guidance ?? []).filter(g => g.appliedAt === undefined && g.inflightAt !== undefined);
        if (!inflight.length) { return; }
        const at = this.deps.now();
        for (const g of inflight) {
            g.appliedAt = at;
            g.inflightAt = undefined;
            g.standing = undefined;
            this.deps.trace?.('human.guided', { askId: g.id, text: g.text, applied: true, actor: 'user' });
        }
        this.deps.onUpdate(this.run);
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
        // ‼️ X-66 — INCLUDING WHAT IS IN FLIGHT RIGHT NOW. The fallback builds a
        // brand-new prompt, so a steer that was only in the prompt that just
        // failed would be dropped on the floor by the retry that replaces it.
        const taken = (this.run.guidance ?? [])
            .filter(g => g.appliedAt !== undefined || g.inflightAt !== undefined);
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

    /**
     * ‼️ M-16 / X-65 — THE IDS THAT REALLY EXIST IN THIS RUN, AND IN WHAT STATE.
     *
     * `basedOn` and `targets` are the audit graph's causality edges, and both
     * arrived as free strings that nothing checked: a lead could rest a decision
     * on an id that had never been produced, on work that had not finished, or
     * on the round it was deciding — and the graph recorded that dependency as
     * though it had happened. A graph you cannot trust to be real is not
     * evidence of anything, and the whole point of M-16 was evidence.
     *
     *   * `results` — work that has SETTLED and left a record: it can be read,
     *     reviewed and evaluated. Queued and running steps are deliberately not
     *     here; a review of work that has not finished reviews nothing.
     *   * `nodes` — every settled step plus the decisions and evaluations
     *     already taken. The round being decided right now is NOT among them,
     *     so a decision can never claim to rest on itself.
     *
     * ‼️ X-88 — AND THE TWO ARE NOT THE SAME LIST.
     *
     * `results` took every settled step, and `failed` counted as settled — so a
     * delegation that came back with NOTHING could be named as an evaluation
     * target and a self-evaluation would record a pass against it. That is the
     * success gate opening on a verdict about an artefact that does not exist.
     * X-67 asked for a target that is real, settled AND readable, and it is the
     * last of the three that was missing.
     *
     * A FAILURE now has to have left something a reader can be shown — the
     * conversation turn it spoke, the verdict sentence it handed back, or a
     * non-empty output archive. The line is drawn at failures on purpose: a
     * step that came back `done` did the work the lead ordered, and "the
     * archive it wrote is thin" is a judgement for the evaluation to make, not
     * a reason to refuse to look. A step that came back `failed` with nothing
     * attached is the one case where there is provably nothing to judge.
     *
     * `nodes` stays wide: "we tried this and it came back with nothing" is a
     * real thing for a decision to rest on, and `basedOn` is a claim about
     * causality rather than about something to read.
     */
    private knownRefs(): { results: string[]; nodes: string[] } {
        const results: string[] = [];
        const settled: string[] = [];
        for (const r of this.run.rounds) {
            for (const st of r.steps) {
                if (st.status !== 'done' && st.status !== 'failed') { continue; }
                settled.push(st.id);
                if (st.status === 'done' || this.hasReadableResult(st)) { results.push(st.id); }
            }
        }
        const nodes = [
            ...settled,
            ...this.run.rounds.map(r => 'd' + r.n),
            ...(this.run.evaluations ?? []).map(e => e.id)
        ];
        return { results, nodes };
    }

    /** ‼️ X-88 — can the canonical reader put words in front of a reviewer for
     *  this step? The same three sources `stepResults` reads, in that order. */
    private hasReadableResult(step: MissionStep): boolean {
        if (step.message) { return true; }
        if ((step.resultText ?? '').trim()) { return true; }
        if (!step.outputFile) { return false; }
        try { return !!this.deps.readOutputBody(step.outputFile, step.taskId).trim(); } catch { return false; }
    }

    /** The correction a lead is sent when it named an id that is not real. */
    private refusalFor(field: string, bad: string[], valid: string[]): string {
        return `No ${field === 'targets' ? 'result' : 'earlier node'} of this run carries the id `
            + bad.map(b => `"${b}"`).join(', ') + '. '
            + (valid.length
                ? `The ids you may name are: ${valid.slice(-10).join(', ')}.`
                : 'Nothing has settled in this run yet, so there is nothing to name.')
            + ` Name real ids in "${field}", or leave it out.`
            + '\nReply with ONLY the JSON decision object.';
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
        // ‼️ X-67 — the exact version of each target, pinned at this moment.
        const settledAt = new Map<string, number>();
        for (const r of this.run.rounds) {
            for (const st of r.steps) { settledAt.set(st.id, r.at); }
        }
        const targetVersions = targets
            .filter(id => settledAt.has(id))
            .map(id => ({ id, at: settledAt.get(id) as number }));
        const ev: MissionEvaluation = {
            id: 'e' + round.n + '-' + ((this.run.evaluations?.length ?? 0) + 1),
            targets: [...targets], evaluator,
            ...(targetVersions.length ? { targetVersions } : {}),
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
        const blocks: string[] = [];

        // ‼️ M-18 — WHICH PROJECT, AND WHAT THE LEAD'S PART IN IT IS.
        //
        // Every delegation this mission makes has carried the project since the
        // wave was written; the one participant that never did was the LEAD —
        // the wrong way round, since the delegate does one prompt's worth of
        // work and the lead decides what the whole run is for. The generated
        // brief reaches it through its system prompt (one brief, one budget,
        // never a copy pasted in here). What the brief cannot say is this: the
        // planner has no write tools ON PURPOSE, so the project's own records
        // are updated by DELEGATION or not at all. Saying it here is what stops
        // a lead from either trying (and failing on a disabled tool) or
        // finishing a run that changed a project and left its plan lying.
        const proj = this.deps.project?.();
        if (proj?.name) {
            blocks.push(`## Project — this run is work for "${proj.name}"\n`
                + 'Its brief is already in your instructions above: what it is, where its code is, and which '
                + 'document holds which role.\n'
                + '‼️ X-94 — WHAT IS OPEN ON THAT PROJECT IS NOT IN IT, on purpose. Your objective is the work; '
                + 'the project\'s plan, backlog and worklog are a different subject and you were not started to '
                + 'act on them. Do not go and read them looking for something to do.\n'
                + '‼️ You cannot write to it either. You have no write tools, deliberately — so if THIS RUN\'s '
                + 'objective is to change what is true of the project (something shipped, a plan item finished, a '
                + 'decision settled, a backlog item closed), RECORDING THAT IS A DELEGATION like any other. Every '
                + 'delegate you send runs under this project and is given the same map, so it can be told '
                + '"update the plan/backlog/worklog" and will know where.\n');
        }

        /**
         * ‼️ A-17 — WHAT HAS BEEN OBSERVED HERE BEFORE, and what it is not.
         *
         * Evidence, not advice. Each line is "n runs of this shape closed like
         * this", from this project only and only where there were enough of
         * them; the sentence around it says out loud that it is a record of
         * what happened and not an instruction, because a lead handed counts
         * with no framing will read them as a recommendation and stop thinking.
         *
         * The block is drawn only when there is something to say. On a young
         * farm — which is most farms, most of the time — there is not, and an
         * "insufficient sample" heading would be paying tokens to say nothing.
         */
        const seen = isAdaptive(this.spec) ? (this.deps.experience?.() ?? []) : [];
        if (seen.length) {
            blocks.push('## What has happened here before\n'
                + 'Finished runs on THIS project, counted. It is a record, not a recommendation: '
                + 'nobody has decided that any of these shapes is right for YOUR objective, and a shape '
                + 'that worked often is still the wrong one for a different goal. Use it as evidence '
                + 'about this codebase and these agents, and decide for yourself.\n'
                + seen.map(s => `- ${s}`).join('\n') + '\n');
        }

        const list = isAdaptive(this.spec) ? (this.deps.workflows?.() ?? []) : [];
        if (list.length) {
            blocks.push('## Workflows you may run\n'
                + list.map(w => `- ${w.title} (${w.steps} step${w.steps === 1 ? '' : 's'})`
                    + (w.inputs?.length ? ` — inputs: ${w.inputs.map(i => `${i.name} (${i.type}${i.required ? ', required' : ''})`).join(', ')}` : '')).join('\n')
                + '\nA workflow that lists inputs is given them as "inputs": {"<name>": "<value>"} on "run_workflow".'
                + '\nThese are chains that already exist. Run one with "run_workflow" when it encodes the work you need;'
                + ' you cannot compose a new one, and you do not drive its steps.\n');
        }

        if (!blocks.length) { return base; }
        const block = blocks.join('\n') + '\n';
        const marker = '## How to answer';
        return base.includes(marker) ? base.replace(marker, block + marker) : base + '\n\n' + block;
    }

    /**
     * ‼️ M-19 — TURN A DECISION TO SPEAK INTO ONE ORDINARY DELEGATION.
     *
     * Everything that makes this a conversation rather than a round of parallel
     * questions happens here, and all of it happens BEFORE anything spawns:
     * the conversation is opened or found, the turn is refused for a reason the
     * lead can act on, the speaker's lane is resolved, and the prompt is built
     * out of the REAL text of the messages it names. What comes back is a
     * `PlannerTaskReq` like any other — the wave, the writer rule, the budget,
     * the approval gate and the cancel are all the ordinary path's.
     */
    private prepareMessage(
        run: MissionRun, spec: MissionSpec,
        d: Extract<PlannerDecision, { action: 'message' }>,
        now: number
    ): { refusal?: string; tasks?: PlannerTaskReq[]; conversationId?: string } {
        const roster = allowedAgents(spec);
        const nameOf = (id: string) =>
            roster.find(m => m.agentId === id)?.agentName ?? (id === 'lead' ? 'the lead' : id);
        run.conversations ??= [];
        run.messages ??= [];

        // A conversation the lead named must exist; one it did not name is
        // opened here — and NOT recorded until the turn survives every refusal
        // below, so a rejected first message cannot leave an empty conversation
        // on the run for ever.
        const conv: MissionConversation | undefined = d.conversation
            ? run.conversations.find(c => c.id === d.conversation)
            : {
                id: newConversationId(run.conversations),
                ...(this.lastDecisionId ? { sourceActionId: this.lastDecisionId } : {}),
                objective: d.objective ?? '',
                participants: [...new Set(d.participants ?? [])],
                openedAt: now
            };
        // ‼️ EVERY SPEAKER IS CHECKED BEFORE ANY OF THEM IS RECORDED. A round
        // that ordered one turn and refused the other would leave the record
        // saying the second was never asked for — and the lead, reading a
        // refusal, would re-order both.
        for (const from of d.from) {
            const refusal = refuseMessage(
                {
                    conversationId: conv?.id ?? d.conversation ?? '',
                    from, to: d.to, intent: d.intent, refs: d.refs,
                    ...(d.ask ? { ask: d.ask } : {})
                },
                conv, run.messages,
                roster.map(m => ({ id: m.agentId, name: m.agentName })));
            if (refusal) { return { refusal }; }
        }

        // ‼️ M-20 — AND WHAT THE DEBATE REFUSES, on top of what the record does.
        // `refuseMessage` answers "is this a legal turn in this conversation";
        // this answers "is this a legal turn in this COUNCIL" — the cap, the
        // membership, the chair's call and the closed set of ways out. Two
        // questions, kept apart, because a council is optional and every rule
        // below would be wrong for an ordinary conversation.
        // ‼️ X-78 — THE ROUND IS ASKED ABOUT ONCE, WHOLE. Asking per speaker
        // measured every one of them against the same before-the-round counts,
        // so a wide round could walk over a cap that had one turn left and
        // could carry one `close` on three separate turns.
        const council = conv ? councilOf(run.councils, conv.id) : undefined;
        if (council) {
            const refusal = refuseCouncilTurn(
                council,
                {
                    from: d.from, refs: d.refs, intent: d.intent,
                    ...(d.close !== undefined ? { close: d.close } : {})
                },
                run.messages, roster.map(m => ({ id: m.agentId, name: m.agentName })));
            if (refusal) { return { refusal }; }
        }

        const all = conversationMessages(run.messages, conv!.id);
        // ‼️ THE RECORD AS IT STANDS BEFORE THIS ROUND. Every speaker of this
        // turn is built from it, so speakers ordered together cannot see each
        // other — which is what makes an independent first round independent,
        // and is not something two consecutive rounds could reproduce.
        const said = all.filter(m => m.state === 'delivered');
        const referenced = d.refs
            .map(r => said.find(m => m.id === r))
            .filter((m): m is MissionMessage => !!m);
        if (!d.conversation) {
            run.conversations.push(conv!);
            this.deps.trace?.('conversation.opened', {
                actionId: conv!.id, text: conv!.objective,
                to: conv!.participants.join(', ')
            });
        }

        // ‼️ X-78 — the two things the SPEAKER was the last to hear about: the
        // chair's own call, named as the instruction that governs this turn, and
        // the fact that this turn is the one the conversation ends on.
        const chairSaid = council && council.chair !== 'lead'
            ? chairCall(council, run.messages) : undefined;
        const exitName = d.close !== undefined ? councilExit(d.close) : undefined;
        const closing = d.close
            ? { reason: d.close, ...(exitName ? { meaning: COUNCIL_EXITS[exitName] } : {}) }
            : undefined;

        const tasks: PlannerTaskReq[] = [];
        for (const from of d.from) {
            const mine = said.filter(m => m.from === from);
            const last = mine[mine.length - 1];
            // ‼️ THE LANE, AND THE THREE HONEST ANSWERS ABOUT IT. A first turn
            // is `new`. A later turn is `resumed` only when there is a session
            // to continue AND the delegate's own engine can continue one;
            // otherwise it is a `handoff` — a fresh session that is TOLD it is
            // reading a record rather than carrying on. Calling the third case
            // "resumed" is the failure this distinction exists to prevent.
            const resumeSessionId = last?.sessionId;
            // ‼️ S-64 — …and a lane whose session was handed over is a handoff
            // whatever the engine could do: a saturated conversation is never
            // resumed.
            const handedOver = resumeSessionId ? this.deps.sessionHandedOver?.(resumeSessionId) : undefined;
            const canResume = !!resumeSessionId && !handedOver && (this.deps.canResumeLane?.(from) ?? false);
            const carried: LaneCarry = !last ? 'new' : (canResume ? 'resumed' : 'handoff');
            // ‼️ X-77 — WHAT THIS SPEAKER IS SHOWN, from a stated policy.
            //
            // On a resumed lane the speaker is already holding everything up to
            // its own last turn — sending it again pays for the same tokens, so
            // that is the default there. Everywhere else the default is the
            // whole record, which is what it always was. `refs-only` is the one
            // the lead could not have before: ask somebody about one thing
            // without also handing it every position already taken.
            const visibility: MessageVisibility =
                d.visibility ?? (carried === 'resumed' ? 'since' : 'all');
            const sinceMine = last
                ? said.slice(said.findIndex(m => m.id === last.id) + 1)
                : said;
            const context = visibility === 'refs-only' ? []
                : (visibility === 'since' ? sinceMine : said);
            const messageId = newMessageId(run.messages);
            run.messages.push({
                id: messageId,
                conversationId: conv!.id,
                ...(this.lastDecisionId ? { sourceActionId: this.lastDecisionId } : {}),
                from,
                fromName: nameOf(from),
                to: [...d.to],
                intent: d.intent,
                refs: [...d.refs],
                // ‼️ X-77 — on the record, because "what did it actually see?" is
                // unanswerable afterwards otherwise.
                visibility,
                ...(d.ask ? { ask: d.ask } : {}),
                orderedAt: now,
                state: 'pending',
                carried,
                ...(handedOver ? { handedOver } : {})
            });
            tasks.push({
                agent: nameOf(from),
                title: (d.from.length > 1 ? `${nameOf(from)}: ` : '')
                    + (d.title || `${d.intent} in ${conv!.id}`),
                prompt: buildSpeakerPrompt({
                    conversation: conv!, intent: d.intent, speakerName: nameOf(from),
                    referenced, context, ...(d.ask ? { ask: d.ask } : {}),
                    to: d.to, goal: spec.goal, carried, nameOf, visibility,
                    ...(handedOver ? { handedOver } : {}),
                    independent: d.from.length > 1,
                    // ‼️ M-20 — a council speaker is told it is in one, what the
                    // council is deciding and who chairs it. A vote turn is also
                    // given the options, because a choice it cannot name in the
                    // council's own words is recorded as unclear rather than
                    // resolved into the likeliest one.
                    ...(council ? {
                        mandate: councilBrief(council, {
                            nameOf, voting: d.intent === 'vote',
                            ...(chairSaid && from !== council.chair ? { call: chairSaid } : {})
                        })
                    } : {}),
                    ...(closing ? { closing } : {})
                }),
                // ‼️ SPEAKING DOES NOT WRITE. A turn produces a message, and
                // that is why participants can speak at the same time at all —
                // an independent first round is exactly two readonly steps in
                // one wave. A speaker that edited the folder would be doing
                // work, and work is what `delegate` is for.
                readonly: true,
                kind: 'conversation',
                message: {
                    conversationId: conv!.id, messageId, carried,
                    ...(canResume ? { resumeSessionId: resumeSessionId! } : {}),
                    ...(handedOver ? { handedOver } : {}),
                    ...(d.close ? { close: d.close } : {})
                }
            });
        }
        return { tasks, conversationId: conv!.id };
    }

    /**
     * ‼️ M-20 — OPENING A COUNCIL IS OPENING A CONVERSATION PLUS A MANDATE.
     *
     * There is no council machinery below this line: the opening turns are
     * built by `prepareMessage`, so the participant lock, the ref check, the
     * lane honesty, the repeat guard and the independent-round rule are the
     * SAME ones — a debate that had its own copies of those would be the second
     * engine this item exists to refuse.
     *
     * The council is recorded only after the turns survive every refusal, for
     * the reason a conversation is: a rejected opening must not leave a chaired
     * debate on the run that nobody ever spoke in.
     */
    private prepareCouncil(
        run: MissionRun, spec: MissionSpec,
        d: Extract<PlannerDecision, { action: 'council' }>,
        now: number
    ): { refusal?: string; tasks?: PlannerTaskReq[] } {
        run.councils ??= [];
        run.conversations ??= [];
        // ‼️ RECORDED BEFORE THE TURNS ARE BUILT, AND TAKEN BACK IF THEY ARE
        // REFUSED. The opening speakers have to be TOLD they are in a council —
        // the question, the chair, the vote options — and the only way they can
        // be is for the council to exist while their prompts are built. So it is
        // pushed first, against the conversation id `prepareMessage` is about to
        // mint from the same list, and popped again if anything below refuses:
        // a rejected opening must not leave a chaired debate on the run that
        // nobody ever spoke in.
        const council: MissionCouncil = {
            id: newCouncilId(run.councils),
            ...(this.lastDecisionId ? { sourceActionId: this.lastDecisionId } : {}),
            conversationId: newConversationId(run.conversations),
            question: d.question,
            chair: d.chair,
            members: [...d.members],
            ...(d.options?.length ? { options: [...d.options] } : {}),
            maxTurns: d.maxTurns,
            openedAt: now
        };
        run.councils.push(council);
        const opened = this.prepareMessage(run, spec, {
            action: 'message', thought: d.thought,
            objective: d.question,
            participants: d.members,
            from: d.from, to: [], intent: d.intent, refs: [],
            ...(d.ask ? { ask: d.ask } : {}),
            ...(d.title ? { title: d.title } : {})
        }, now);
        if (opened.refusal || !opened.tasks || !opened.conversationId) {
            run.councils.pop();
            return opened;
        }
        const roster = allowedAgents(spec);
        const nameOf = (id: string) =>
            roster.find(m => m.agentId === id)?.agentName ?? (id === 'lead' ? 'the lead' : id);
        this.deps.trace?.('council.opened', {
            actionId: council.id, refId: council.conversationId,
            text: council.question,
            agentName: nameOf(council.chair),
            to: council.members.map(nameOf).join(', ')
        });
        return opened;
    }

    /**
     * ‼️ M-19 — A MESSAGE EXISTS ONLY WHEN A TURN REALLY PRODUCED ONE.
     *
     * Called once per round, after the waves. The message was ordered before
     * anything spawned; this is where it becomes what actually happened —
     * delivered with the speaker's own words, or failed with the reason.
     *
     * ‼️ AND A TURN THAT CAME BACK CLEAN WITH NOTHING IN IT IS A FAILURE, not
     * an empty message. It matters because a settling intent CLOSES what it
     * names: an empty "response" would mark a challenge answered by a turn that
     * said nothing, and the conversation would read as resolved.
     */
    private settleMessages(run: MissionRun, steps: readonly MissionStep[], now: number): void {
        for (const step of steps) {
            const link = step.message;
            if (!link) { continue; }
            const msg = (run.messages ?? []).find(m => m.id === link.messageId);
            if (!msg || msg.state !== 'pending') { continue; }
            // ‼️ A TURN STILL IN FLIGHT IS NOT SETTLED. The catch-up pass at
            // resume walks every round, and the only steps it must leave alone
            // are the ones the reconciliation could not account for yet —
            // settling those would invent an outcome.
            if (step.status === 'queued' || step.status === 'running') { continue; }
            msg.carried = link.carried;
            msg.settledAt = now;
            if (step.taskId) { msg.taskId = step.taskId; }
            if (step.runSessionId) { msg.sessionId = step.runSessionId; }
            if (step.outputFile) { msg.contentRef = step.outputFile; }
            const council = councilOf(run.councils, link.conversationId);
            const body = step.outputFile ? this.deps.readOutputBody(step.outputFile, step.taskId) : '';
            const text = (body || step.resultText || '').trim();
            const delivered = step.status === 'done' && !!text;
            // ‼️ X-76 — A CLOSING IS A MESSAGE THAT WAS ACTUALLY SPOKEN.
            //
            // The close was applied from the ORDER — the lead had said this turn
            // would end the conversation — before anything checked whether the
            // turn came back. So a closer that failed, was cancelled, or came
            // back with no text closed the conversation anyway: the record said
            // "consensus", the council said it had reached its verdict, and the
            // message that was supposed to say so did not exist. Now the close
            // lands only alongside the delivered message that carries it.
            if (link.close && delivered) {
                const conv = (run.conversations ?? []).find(c => c.id === link.conversationId);
                if (conv && !conv.closedAt) {
                    conv.closedAt = now;
                    conv.closeReason = link.close;
                }
                // ‼️ M-20 — AND THE COUNCIL ENDS FOR ONE OF ITS OWN SEVEN
                // REASONS. The parse already refused anything else, so this is
                // a read rather than a guess; a council whose exit could be a
                // sentence of the lead's own would let "the discussion finished"
                // stand for both "they agreed" and "we ran out of turns".
                if (council && !council.closedAt) {
                    council.closedAt = now;
                    const exit = councilExit(link.close);
                    if (exit) { council.exit = exit; }
                    this.deps.trace?.('council.closed', {
                        actionId: council.id, refId: council.conversationId,
                        text: `${council.exit ?? link.close} — ${council.question}`
                    });
                }
            }
            if (delivered) {
                msg.excerpt = outputExcerpt(text, 1200, 600);
                msg.state = 'delivered';
                // ‼️ M-20 — A VOTE IS A MESSAGE, AND ITS CHOICE IS THE VOTER'S
                // OWN WORD FOR IT. Read out of the text that really came back,
                // against the options the council named; a turn that named none
                // is recorded as unclear rather than resolved into the likeliest
                // one, because a tally built on a guess is the M-19 failure with
                // numbers on it. And a SYNTHESIS carries the ids it rests on,
                // which the intent already made it name — so "this is where the
                // council got to" always points at real turns.
                if (council) {
                    if (msg.intent === 'vote' && council.options?.length) {
                        council.votes ??= [];
                        if (!council.votes.some(v => v.messageId === msg.id)) {
                            // ‼️ X-79 — ONE BALLOT PER MEMBER. Every vote message
                            // used to become another `CouncilVote`, so a member
                            // that spoke `vote` twice — trivially easy once a
                            // few turns have gone by — counted as two people. A
                            // later turn is kept in the record (a council's
                            // history is what was said) and marked superseded,
                            // so it is out of the arithmetic and still readable.
                            // The FIRST ballot stands: changing a vote is a real
                            // thing a council might want, but it needs a stated
                            // intent rather than a second message that happens
                            // to look like one.
                            const already = council.votes.some(
                                v => v.member === msg.from && !v.superseded);
                            const choice = readVoteChoice(text, council.options);
                            council.votes.push({
                                messageId: msg.id, member: msg.from,
                                ...(choice ? { choice } : { unclear: true }),
                                ...(already ? { superseded: true } : {})
                            });
                        }
                    }
                    if (msg.intent === 'synthesis' && msg.refs.length) {
                        council.verdictRefs = [...msg.refs];
                    }
                }
                this.deps.trace?.('message.sent', {
                    actionId: step.id, kind: 'conversation', refId: msg.id,
                    agentId: msg.from, agentName: msg.fromName,
                    to: msg.to.length ? msg.to.join(', ') : 'all',
                    text: (msg.excerpt ?? '').slice(0, 600),
                    ...(msg.contentRef ? { outputFile: msg.contentRef } : {})
                });
                continue;
            }
            msg.state = step.status === 'cancelled' ? 'cancelled' : 'failed';
            // ‼️ X-76 — and when the turn was the one that was to CLOSE the
            // conversation, the note says the closing did not happen either. The
            // lead ordered an ending and did not get one; being told so is the
            // whole point, and a record that says "closed" cannot tell it.
            const stillOpen = link.close
                ? ' — and it was the turn that was to close this conversation, which is therefore still open'
                : '';
            if (step.status === 'done') {
                msg.note = 'the turn came back with no text — nothing was said' + stillOpen;
                step.failure = failure('delegate-failed', step, msg.note);
                // ‼️ AND THE STEP SAYS SO TOO. A step left `done` while the
                // message it exists to produce is `failed` is one event with two
                // answers, and the surface that reads the step is the one that
                // matters most: the round message is built from step status, so
                // a lead whose speaker said nothing was shown a successful round
                // and never offered retry · revise · replan · skip · ask_user ·
                // partial. It would then plan its next turn on a discussion that
                // did not happen — the exact failure M-19 exists to refuse.
                step.status = 'failed';
            } else {
                msg.note = (step.failure?.detail || step.note || 'the speaking turn did not come back') + stillOpen;
            }
        }
    }

    /**
     * ‼️ X-76 — A TURN THAT WAS PLANNED AND NEVER RAN MUST NOT HOLD A LANE.
     *
     * `prepareMessage` writes its messages onto the run before the duplicate
     * guard and the task budget have had their say, so a turn dropped by
     * either left a `pending` message nobody would ever settle. Pending is
     * what holds a participant's lane: that agent could then never speak in
     * that conversation again, and the lead was refused every time it tried
     * without being told a real reason.
     *
     * Cancelled rather than deleted: the lead really did order it, and the
     * record of an order that was refused is worth more than a gap. A
     * conversation whose every turn was dropped is closed the same way — an
     * open room nobody ever spoke in is the same lock by another name.
     */
    private reapUnsent(
        run: MissionRun, ordered: readonly PlannerTaskReq[], kept: ReadonlySet<string>,
        why: string, now: number
    ): void {
        const dropped = ordered
            .map(t => t.message?.messageId)
            .filter((id): id is string => !!id && !kept.has(id));
        if (!dropped.length) { return; }
        const touched = new Set<string>();
        for (const id of dropped) {
            const msg = (run.messages ?? []).find(m => m.id === id);
            if (!msg || msg.state !== 'pending') { continue; }
            msg.state = 'cancelled';
            msg.settledAt = now;
            msg.note = why;
            touched.add(msg.conversationId);
        }
        for (const cid of touched) {
            const conv = (run.conversations ?? []).find(c => c.id === cid);
            if (!conv || conv.closedAt) { continue; }
            const spoke = (run.messages ?? []).some(
                m => m.conversationId === cid && m.state !== 'cancelled' && m.state !== 'failed');
            if (spoke) { continue; }
            conv.closedAt = now;
            conv.closeReason = 'nothing was ever said in it — every turn ordered for it was dropped before it ran';
            const council = councilOf(run.councils, cid);
            if (council && !council.closedAt) { council.closedAt = now; }
        }
    }

    private stepResults(steps: MissionStep[]): StepResult[] {
        return steps.map(step => ({
            step,
            // ‼️ M-19 — A SPEAKING TURN'S RESULT IS ITS MESSAGE, AND THE
            // CONVERSATION IS WHERE THAT LIVES. Reading the same words back
            // here as well would put one fact on two surfaces of the same
            // reply — and it is the expensive copy: the digest is bounded on
            // purpose because the planner is resumed every round, and a full
            // transcript beside it would undo exactly that.
            excerpt: step.message
                ? `spoken in ${step.message.conversationId} as ${step.message.messageId} — see the conversation below`
                : (step.resultText
                    // ‼️ M-18 — a unit whose result IS a sentence (a child
                    // objective's verdict) says so directly; everything else is
                    // read out of the archive it wrote, as it always was.
                    ?? (step.outputFile ? outputExcerpt(this.deps.readOutputBody(step.outputFile, step.taskId)) : ''))
        }));
    }

    /** Main loop. `initialMsg` carries resume context when re-entering an
     *  interrupted run; fresh runs start with the briefing. */
    async execute(initialMsg?: string): Promise<void> {
        const { spec, run, deps } = this;
        // ‼️ M-19 — A MESSAGE LEFT PENDING BY A RELOAD IS SETTLED FIRST.
        //
        // A speaking turn is settled at the end of the round that ordered it —
        // and a window that closes mid-round never reaches that line. The step
        // is reconciled on the way back in (X-45), but the MESSAGE it was
        // ordered as would stay `pending` for the rest of the run, and pending
        // is what holds a participant's lane: that agent could never speak in
        // that conversation again, and the lead would be refused every time it
        // tried without ever being told a real reason. One catch-up pass, over
        // work that is already settled, before anything else happens.
        if (run.messages?.some(m => m.state === 'pending')) {
            this.settleMessages(run, run.rounds.flatMap(r => r.steps), deps.now());
        }
        // ‼️ X-66 — a steer that was in flight when the process died is neither
        // delivered nor pending, and the honest answer is to put it back in
        // front of the lead LABELLED, never to record it as landed.
        for (const g of reopenGuidance(run)) {
            run.ledger.push(`(guidance ${g.id} was in flight when the window closed — sending it again)`);
        }
        // ‼️ X-80 — AND THE RESUME MESSAGE WAS WRITTEN BEFORE ANY OF THAT.
        //
        // The host builds the resume text out of the SNAPSHOT, and the two
        // catch-up passes above — settling the messages a reload left pending,
        // reopening guidance that was in flight — happen after it. So the first
        // thing the lead read on the way back described a conversation state
        // that had already changed underneath it: turns still listed as pending
        // that had just been settled, participants shown as locked who were free.
        // The digest is taken HERE, after the catch-up, from the record itself.
        let roundMsg: string | undefined = initialMsg
            ? initialMsg + this.resumeDigest()
            : undefined;
        let parseRetried = false;
        let guardNudged = false;
        /** ‼️ X-65 — a lead is corrected on invented provenance once. */
        let basedOnNudged = false;
        let plannerCalls = 0;
        const seenWork = new Set<string>(
            run.rounds.flatMap(r => r.steps.map(s => dupKey(s.agentName, s.prompt))));

        while (true) {
            if (this.cancelRequested) { this.endAtCancel(); return; }
            if (this.pauseRequested) {
                run.status = 'paused';
                run.pausePending = false;
                this.setNow();
                deps.onUpdate(run);
                return;
            }
            if (++plannerCalls > hardCallCap(spec)) {
                this.finish('failed', {
                    verdict: 'failed', stopReason: 'hard-limit',
                    summary: 'Stopped at the planner-call cap — the lead kept planning without reaching an ending.'
                }, 'hard planner-call cap reached — possible planning loop');
                return;
            }

            const rem = remainingBudget(spec, run, deps.now());
            const guard = guardReason(rem);
            const roundText = run.rounds.length === 0 && !roundMsg
                ? this.briefingText(rem)
                : (roundMsg ?? 'Decide the next round. Reply with ONLY the JSON decision object.');
            let prompt = roundText;
            if (guard) { prompt += finishOnlyNote(guard); }
            // ‼️ M-16 — THE PLANNER BOUNDARY IS HERE and nowhere else: the
            // prompt is complete, the previous wave has settled, and nothing is
            // in flight to be contradicted. A steer taken anywhere else would
            // either miss this round or race a running Task.
            const steer = this.takeGuidance();
            if (steer) { prompt += steer; }
            roundMsg = undefined;

            /**
             * ‼️ S-64 — THE LEAD'S OWN CONVERSATION IS NOT RESUMED PAST THE
             * HANDOVER LINE. The planner has no write tools, so it cannot write
             * the note the sentence asks for; its note is the ledger, and this
             * is where it is handed over: a fresh session, seeded the way the
             * resume-fallback below seeds one, told why.
             */
            const leadClosed = run.plannerSessionId ? deps.sessionHandedOver?.(run.plannerSessionId) : undefined;
            if (leadClosed) {
                const was = run.plannerSessionId!;
                run.plannerSessionId = undefined;
                prompt = `## Why this is a fresh session\nYour previous planning session (${was}) was handed over`
                    + (typeof leadClosed.pct === 'number'
                        ? ` — its context reached the handover line at ${leadClosed.pct}%` : '')
                    + '. It is not continued; everything you need is below.\n\n'
                    + this.briefingText(rem)
                    + (run.ledger.length ? '\n\n## History so far (you are mid-mission)\n' + run.ledger.join('\n') : '')
                    + this.guidanceHistory()
                    + '\n\n' + roundText
                    + (guard ? finishOnlyNote(guard) : '');
                run.ledger.push(`lead session ${was} handed over${laneHandoverPct(leadClosed)} — planning continues in a fresh session`);
            }

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
                this.finish('failed', {
                    verdict: 'failed', stopReason: 'hard-limit',
                    summary: `The lead could not be reached — ${pr.error ?? 'unknown error'}.`
                }, `planner call failed — ${pr.error ?? 'unknown error'}`);
                return;
            }
            if (pr.sessionId) { run.plannerSessionId = pr.sessionId; }
            // ‼️ X-66 — the lead answered a call that carried the steer, so the
            // delivery is now a fact and is written as one.
            this.settleGuidance();
            run.totalCostUSD += pr.costUSD ?? 0;
            run.totalTokens = (run.totalTokens ?? 0) + (pr.tokens ?? 0);

            // ‼️ X-70 — AND THE CEILING IS RE-ASKED NOW THAT THE PLANNER HAS
            // BEEN PAID FOR. `guard` above was computed BEFORE the call, and
            // the call is not free: its own cost and tokens have just been
            // added to the run, and the clock has moved. If it is what emptied
            // the budget, the reply it produced would have started work against
            // a ceiling that no longer had room — the exact failure this guard
            // exists to prevent, one round later.
            //
            // Every axis only ever shrinks across a planner call (cost and
            // tokens grow, time passes, rounds and tasks are untouched), so the
            // later reading is the true one. When it newly bites, the prompt
            // did NOT carry the finish-only note — so the lead ordered work in
            // good faith and gets its one nudge, which is what `guardNudged`
            // already means.
            const guardNow = guardReason(remainingBudget(spec, run, deps.now()));

            const parsed = this.protocol.parse(pr.raw ?? '', spec);
            if (!parsed.ok) {
                if (parseRetried) {
                    this.finish('failed', {
                        verdict: 'failed', stopReason: 'hard-limit',
                        summary: `The lead's reply could not be read twice in a row — ${parsed.error}.`
                    }, `planner returned an invalid decision twice — ${parsed.error}`);
                    return;
                }
                parseRetried = true;
                run.ledger.push(`(invalid planner reply: ${parsed.error})`);
                roundMsg = `Your last reply was invalid: ${parsed.error}.\nAnswer again with ONLY the JSON decision object.`;
                continue;
            }
            parseRetried = false;
            const d = parsed.decision;

            // ‼️ X-70 — A SPENT CEILING STOPS ALL WORK, NOT THE ONE WORD.
            //
            // This asked `d.action === 'delegate'` — the whole vocabulary when it
            // was written, and not since M-18. Measured on the current build
            // with the cost budget fully spent: `parallel`, `review`, `revise` and
            // a reviewer'd `evaluate` each started a real wave and wrote a real
            // `action.created`; `compare`, `run_workflow` and `run_mission` take the
            // same branch and were only stopped, in that harness, by unrelated
            // validation. The in-flight guard (X-46b) does catch them — but it
            // catches them AFTER the work has started and up to one guard
            // interval of spending and side effects has happened. Work that
            // must not run should never begin.
            //
            // So the question is answered by the REGISTRY, not by a list of
            // names somebody has to remember to grow: a primitive whose shape
            // is `work` orders work. The next primitive is covered on the day it
            // is declared, which is the only version of this that stays true.
            //
            // ‼️ ONE EXEMPTION, AND IT IS NOT AN OVERSIGHT. An `evaluate` with no
            // reviewer is the lead judging what it ALREADY holds, in the same
            // round, ordering nothing — and it is exactly what a run needs to
            // close honestly as `partial` with real verdicts instead of guessing.
            // Refusing it at a spent ceiling would block the one action that
            // makes the ending true.
            const ordersWork = (() => {
                const prim = primitiveFor(d.action, isAdaptive(spec));
                if (!prim || prim.shape !== 'work') { return false; }
                if (d.action === 'evaluate' && !(d as { reviewer?: string }).reviewer) { return false; }
                return true;
            })();
            if (guardNow && ordersWork) {
                if (guardNudged) {
                    this.finish('failed',
                        {
                            verdict: 'partial',
                            summary: `Stopped at the budget limit; the planner kept ordering work (${d.action}).`,
                            stopReason: 'hard-limit'
                        },
                        'budget exhausted');
                    return;
                }
                guardNudged = true;
                roundMsg = `Not allowed: ${guardNow}. "${d.action}" would start new work, and there is no budget left for it.`
                    + ' Reply with "finish" or "abort" only.';
                continue;
            }

            // ‼️ M-16 / X-65 — A CAUSALITY EDGE IS CHECKED BEFORE IT IS DRAWN.
            // `basedOn` went into the graph as whatever the lead typed, so a
            // made-up, future or self-referential id became a recorded
            // dependency on work that never happened — and a test used to
            // approve exactly that. Refused ONCE with the real ids in hand; a
            // lead that insists has its provenance dropped rather than the run
            // spun to its call cap, because the edge is the claim, not the work.
            const refs = this.knownRefs();
            const badBasedOn = (d.reflection?.basedOn ?? []).filter(id => !refs.nodes.includes(id));
            if (badBasedOn.length) {
                if (!basedOnNudged) {
                    basedOnNudged = true;
                    run.ledger.push(`R? ${d.action} rejected — no node with id ${badBasedOn.join(', ')}`);
                    roundMsg = this.refusalFor('basedOn', badBasedOn, refs.nodes);
                    continue;
                }
                // second offence: keep the decision, drop the claim it cannot make
                d.reflection!.basedOn = d.reflection!.basedOn.filter(id => refs.nodes.includes(id));
                run.ledger.push(`(unverifiable basedOn dropped: ${badBasedOn.join(', ')})`);
            }
            basedOnNudged = false;

            // ‼️ AND AN EVALUATION IS ABOUT SOMETHING THAT REALLY RAN. `evaluate`
            // never checked its targets at all, so a verdict could be recorded
            // against an id no step ever had — a pass on nothing, which the
            // success gate then reads as met.
            if (d.action === 'evaluate') {
                // ‼️ X-67 — AND IT MUST NAME WHAT IT LOOKED AT. The reason has
                // been written at the top of missionEvaluation.ts since M-17
                // and nothing ever enforced it: a verdict bound to nothing can
                // never go out of date, and one that can never go out of date
                // is a permanent pass — which is exactly how a run revises its
                // work and still finishes on a judgement of the old version.
                if (!d.targets.length) {
                    run.ledger.push('R? evaluate rejected — it named nothing to judge');
                    roundMsg = 'An evaluation must name what it looked at: a verdict bound to nothing'
                        + ' can never go out of date, and one that can never go out of date is a'
                        + ' permanent pass.\n'
                        + (refs.results.length
                            ? `Put the result ids in "targets" — the settled ones are: ${refs.results.slice(-10).join(', ')}.`
                            : 'Nothing has settled in this run yet, so there is nothing to evaluate — delegate first.')
                        + '\nReply with ONLY the JSON decision object.';
                    continue;
                }
                const badTargets = d.targets.filter(id => !refs.results.includes(id));
                if (badTargets.length) {
                    run.ledger.push(`R? evaluate rejected — no settled result with id ${badTargets.join(', ')}`);
                    roundMsg = this.refusalFor('targets', badTargets, refs.results);
                    continue;
                }
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
                this.finish(d.action === 'finish' ? 'done' : 'failed', {
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
                // ‼️ X-67 — ONLY the named targets. This fell back to "the last
                // six done steps" when nothing was named, so a reviewer could
                // be handed material the verdict was never bound to — and the
                // verdict then went stale, or did not, on work it had not read.
                const material = this.stepResults(
                    run.rounds.flatMap(r => r.steps)
                        .filter(s => d.targets.includes(s.id))
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
                const cutReview = await this.runWave(run, round.steps);
                // ‼️ X-72 — the review really ran and really cost something,
                // whichever way this round is about to end.
                if (this.cancelRequested) { this.bookRound(round); this.endAtCancel(); return; }
                if (cutReview) { this.bookRound(round); this.endAtCeiling(cutReview); return; }
                // ‼️ A REVIEW THAT CANNOT BE READ SAYS NOTHING ABOUT THE WORK.
                // Not `fail` — that would blame the delegate for the reviewer's
                // timeout — and not silence, which would let the run forget it
                // ever asked. `unknown` with the reason is the true statement,
                // and the gate treats it exactly as it should: not a pass.
                let parsedEval;
                if (reviewStep.status !== 'done') {
                    parsedEval = unreadableEvaluation(criteria, `the review ${reviewStep.status}`);
                } else {
                    const body = reviewStep.outputFile ? deps.readOutputBody(reviewStep.outputFile, reviewStep.taskId) : '';
                    const p = parseEvaluation(body, criteria);
                    parsedEval = p.ok ? p.value : unreadableEvaluation(criteria, p.error);
                }
                const ev = this.recordEvaluation(round, d.targets,
                    { kind: 'agent', ...(member?.agentId ? { agentId: member.agentId } : {}), agentName: d.reviewer },
                    parsedEval);
                // after the verdict is on the round, so the ledger line carries it
                this.bookRound(round);
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
                if (this.cancelRequested) { this.endAtCancel(); return; }
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
            // ‼️ X-69 — AND ONE DISPATCH FOR THE WORK, out of the same row.
            //
            // This was a chain of `else if (d.action === …)` arms with the
            // outcome accumulated into a `let` — which is why a primitive could
            // be declared, offered, parsed, and then quietly do nothing: the arm
            // that builds its work is somewhere else entirely from the row that
            // says it exists. The row carries both now, so "what does this
            // primitive DO" is one lookup and an unwritten `prepare` is a
            // compile error on a `work` row rather than an empty round.
            const prepare = PRIMITIVE_HANDLERS[d.action].prepare;
            const prepared: PrepareResult = prepare
                ? prepare({
                    run, spec, d, deps, now: deps.now(), knownResults: refs.results,
                    lend: {
                        stepResults: steps => this.stepResults(steps),
                        refusalFor: (field, bad, valid) => this.refusalFor(field, bad, valid),
                        prepareMessage: (r, s, dd, n) => this.prepareMessage(r, s, dd, n),
                        prepareCouncil: (r, s, dd, n) => this.prepareCouncil(r, s, dd, n)
                    }
                })
                // A row whose shape is not `work` never reaches this line — every
                // one of them returned or continued above. If one ever did, it
                // orders nothing, which is what the unreachable arm did before.
                : { tasks: [] };
            if ('refusal' in prepared) {
                run.ledger.push(prepared.ledger);
                roundMsg = prepared.refusal;
                continue;
            }
            const requested = prepared.tasks;
            const intent = prepared.intent;
            const sources = prepared.sources;
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
            // ‼️ X-76 — the turns that did NOT survive the two filters above.
            this.reapUnsent(run, requested,
                new Set(tasks.map(t => t.message?.messageId).filter((x): x is string => !!x)),
                notes[0] ?? 'this turn was dropped before it ran', deps.now());
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
                    ...(t.inputs ? { inputs: t.inputs } : {}),
                    ...(t.child ? { child: t.child } : {}),
                    ...(t.message ? { message: t.message } : {}),
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
                if (this.cancelRequested) { this.endAtCancel(); return; }
                if (!ok) {
                    round.rejectedReason = 'rejected by user';
                    round.steps.forEach(s => {
                        s.status = 'cancelled'; s.note = 'round rejected';
                        // ‼️ M-18 — a REJECTED round is a person saying no, and
                        // the lead has to read it as that rather than as work
                        // that went wrong. `stop` is the advice on this class:
                        // re-proposing what was just refused is the loop this
                        // classification exists to prevent.
                        s.failure = failure('cancelled', s, 'the round was rejected at approval');
                    });
                    // ‼️ X-76 — including the speaking turns. The steps were
                    // marked cancelled and the loop went straight on, so a
                    // message ordered in a rejected round stayed `pending` and
                    // held its speaker's lane for the rest of the run.
                    this.settleMessages(run, round.steps, deps.now());
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
                // ‼️ X-83 — the WHOLE round is what is unbooked: an earlier wave
                // of this round has settled and carries its own cost, and none
                // of it reaches `run.totalCostUSD` until every wave is done.
                const cut = await this.runWave(run, steps, round.steps);
                deps.onUpdate(run);
                // ‼️ X-72 — BEFORE EITHER EXIT. A cut wave is not an unspent
                // one: its steps settled, its delegates ran, and the ledger
                // line for the round is the only place that says what the
                // round did. Both of these used to return above the rollup.
                // ‼️ X-76 — AND THE MESSAGES ARE SETTLED ON THE WAY OUT TOO. A
                // cut or a cancel used to return above `settleMessages`, so a
                // conversation turn that had really settled stayed `pending`
                // for ever and its speaker's lane stayed locked — on a run that
                // was already over, which is when nobody looks again.
                if (this.cancelRequested || cut) {
                    this.settleMessages(run, round.steps, deps.now());
                    this.bookRound(round);
                    if (this.cancelRequested) { this.endAtCancel(); } else { this.endAtCeiling(cut as string); }
                    return;
                }
            }
            // ‼️ M-19 — BEFORE THE LEDGER AND BEFORE THE LEAD IS TOLD ANYTHING.
            // A speaking turn's step is settled by the wave; the MESSAGE it was
            // ordered as is settled here, so the digest the lead reads a few
            // lines below is already the record rather than a promise of one.
            this.settleMessages(run, round.steps, deps.now());
            this.bookRound(round);
            deps.onUpdate(run);
            // What the lead is about to be shown IS the fan-in of its next
            // decision — recorded here so the graph does not have to guess it
            // from timestamps when the reply names no `basedOn`.
            this.lastResultIds = round.steps.map(s => s.id);
            roundMsg = this.protocol.roundMessage(
                this.stepResults(round.steps),
                remainingBudget(spec, run, deps.now()),
                notes);
            // ‼️ M-19 — AND THE CONVERSATION IT SPOKE IN, as the record now
            // stands: what is still unanswered, the last few turns, the ids it
            // may name next. Bounded on purpose — the planner session is
            // resumed each round, so a whole transcript here would be paid for
            // once per round for the rest of the run and would grow while it
            // did it. The full text is one message id away, and the user's
            // surfaces read it in full without paying for a token.
            const spokenIn = [...new Set(
                round.steps.map(s => s.message?.conversationId).filter((c): c is string => !!c))];
            if (spokenIn.length) {
                const roster = allowedAgents(spec);
                const nameOf = (id: string) =>
                    roster.find(m => m.agentId === id)?.agentName ?? (id === 'lead' ? 'you' : id);
                const digests = spokenIn
                    .map(cid => (run.conversations ?? []).find(c => c.id === cid))
                    .filter((c): c is MissionConversation => !!c)
                    .map(c => conversationDigest(c, run.messages ?? [], { nameOf }).text);
                if (digests.length) { roundMsg += `\n\n${digests.join('\n\n')}`; }
                // ‼️ M-20 — and the MANDATE over that record, when there is one:
                // how many turns are left, whether the chair has spoken, what
                // the votes stand at and the seven ways out. Bounded for the
                // same reason the conversation digest is — the planner session
                // is resumed each round, so anything here is paid for once per
                // round for the rest of the run.
                const councils = spokenIn
                    .map(cid => councilOf(run.councils, cid))
                    .filter((k): k is MissionCouncil => !!k)
                    .map(k => councilDigest(k, run.messages ?? [], { nameOf }));
                if (councils.length) { roundMsg += `\n\n${councils.join('\n\n')}`; }
            }
        }
    }
}
