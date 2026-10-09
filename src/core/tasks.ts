import * as cp from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { sendToTerminalWhenReady } from './shellReady';
import { spawnEnvironment, terminalEnvOverlay } from './providerRuntime';
import { routedModel } from './routeModels';
import { SecretScrubber, secretValuesOf } from './secretScrub';
import { AgentInfo } from './agents';
import { RoundWhy } from './sentryWhy';
import { normalizeFinishSound } from './alertVoices';
import { normalizeLegCeiling } from './baton';
import { ClosingAnswer, closingOverRow } from './closingSetup';
import { execOneShot } from './oneShot';
import { judgeJson, judgeLean, judgeReply, judgeWant, normalizeUnjudged, StepJudge, unjudgedOutcome, visionJudgeWant, visionRoute } from './judgeEngines';
import { fillInputs, resolveInputs, WorkflowInput } from './workflowInputs';
import { boardWrite, ensureStepIds, fillBoard, RunBoard, stepKey } from './runContext';
import { BrandKit, brandProductionFor, fillBrand, resolveBrand } from './brandKit';
import * as FE from './forEachStep';
import { capWaitingBranches, runSpendCap, SpendCap, spendCapStop } from './runSpendCap';
import { escalationLine, ladderFor } from './judgeLadder';
import { afterFail, climbDecision, JudgeDecision, RunEconomy, runEconomy } from './judgeDecision';
import { alignCandidates, candidatesOf, mergeCandidates, pickedBody, pickLine, withArchiveBody } from './mediaCandidates';
import { browserMcpArgs, browserRecipeRefusal, buildRecipePrompt, hostGuardScript, planBrowser, playwrightMcpConfig } from './browserRecipes';
import { type BrowserRun, fileBrowserDownloads } from './browserDownloads';
import { profileInUse } from './browserLogin';
import { buildPublishPayload, calendarPatchOf, planPublish, readPublishResult, type PublishSpec } from './publishStep';
import { planMetrics, pullMetrics, type Metrics, type MetricsSpec } from './contentMetrics';
import { findEntry, readCalendar, updateEntry } from './contentCalendar';
import {
    anchorAgent, applyRunEdits, checkpointLimits, CheckpointSpec, escalateModel, handoffFromBoard, routeOf as checkpointRoute, RunEdits,
    stepsFromInsert, superviseCheckpoint
} from './checkpointStep';
import {
    CUT_OFF, enterVisit, SessionCall, sessionTurn, softNote, spawnSessionCall, supervisorRunLimits, SupervisorState, turnRefusal, WorkflowSupervisor
} from './supervisorRun';
import { kindOfStep, mechanicalWords, resolveWake, wakeDirective, wakeFacts, WakeSpec, wakeVerdict } from './workflowWake';
import { applyLive, decisionFromArg, landWords, liveLines, livePatch, pendingWords, RunLive, wordFromArg, WordSource, wordsForBrief } from './workflowLive';
import { flexPoint } from './flexPoints';
import { SupervisorCall, supervisorCall, supervisorTrail, SupervisorTrail } from './supervisorTrail';
import type { KapiciChip } from './kapiciChip';
import { DEFAULT_STEP_INPUT, KAPICI_MODEL, KapiciStepHook, kapiciStepRoute, KapiciStepSpec } from './kapiciStep';
import { missionHandoffText } from './workflowMission';
import { fillTool, toolCall, toolResolved, ToolStepSpec } from './toolCall';
import { mediaDuration, runRecipe, ToolResult } from './toolRun';
import { billMedia, stepSpend, withOutputs } from './mediaStepResult';
import { fillRole, RoleMap } from './workflowRoles';
import type { RecipeCall } from './mediaRecipes';
import { resolveFlex } from './flexResolve';
import { AutoUpload, prepareMediaInput, uploadFile, UploadDone, UploadProvider } from './mediaUpload';
import {
    appendAutomationEvent, AutomationEvent, AutomationState, evaluatePrecondition,
    gateBlock, pauseExpired, Precondition
} from './automation';
import { buildBrowserPrompt, hostAllowed } from './browser';
import { engineConcurrencyWeight } from './engines';
import { agentBusyReason, RelayMark, seatHolders } from './relaySeat';
import {
    claudeNewSessionArgs, claudeResumeArgs, engineContextPrefix, engineFirstPromptFlag, engineModeNote, engineOf,
    enginePermissionSetting, headlessEffortRefusal, headlessResumeRefusal, runArgs, tuiArgs
} from './consoleEngine';
import {
    DEFAULT_MEDIA_PRICING, downloadAsset, extFromUrl, injectMediaFeedback,
    mediaCandidates, MediaMeta, MediaPriceRule, MediaResult, pollFalResult, readMediaMetas, recordSelection
} from './media';
import { InteractiveClose, InteractiveTarget, LaunchOptions, modelIdOk, normInteractiveClose, normInteractiveTarget } from './launch';
import { LedgerEntry, ModuleView, RunCtx, RunLibrary, retargetSidecars } from './runLibrary';
import { EnrichHook } from './runEnrich';
import { libraryHint } from './airtableInput';
import { LibrarySpec, StepLibrarySpec } from './runLibrarySpec';
import type { MediaRecorder } from './mediaRecorder';
import { pollReplicateResult, pollWebhookResult, providerFor, WebhookPollConfig } from './mediaProviders';
import { chosenPermission, permissionFlags } from './permissionmode';
import { ProviderIdentity } from './providerIdentity';
import { ResumeRoute } from './resumeGate';
import {
    OPENCODE_RUN_OUTPUT_NOTE, opencodeRunSessionId, readOpencodeRun
} from './opencoderun';
import { opencodeLockRetryDelay, opencodeLockRetryNote } from './opencodeLockRetry';
import { expandDeep, PortableRoot, tokenizeDeep } from './portablePaths';
import {
    classifyFailure, continuationPromptFor, describeRetry, FailurePhase, fillContinuation, HandoverEvidence,
    isLimitFailure, normalizeRetry, resolveRetry, RetryPolicy, retryDecision, RunProgress
} from './retry';
import { incidentKey, SupervisorPolicy, SupervisorRoom, supervisorWhen } from './retrySupervisor';
import {
    isSupervisionOpen, SUPERVISION_ASK_CODE, SUPERVISION_HOLD_CODE, SUPERVISION_PARK_CODE,
    SupervisionAct, SupervisionOutcome, supervisionEffect, TaskSupervision, userSupervision
} from './retrySupervision';
import { opencodeSpawnEnv } from './opencodesync';
import {
    newSentry, pauseSentry, refuseSentry, resumeSentry, SENTRY_DEFAULT_POLL_MIN, SentryAsk,
    SentryRecord, sentryDue, sentryRunning, stopSentry
} from './sentryCampaign';
import { applySentryStep, SentryRoundSpec, SentryStep } from './sentryDriver';
import { SENTRY_DEFAULT_STALL_MIN, SlotHealth, slotHealth, stalledRound } from './sentryWatch';
import { carryOnAccount, CARRY_ON_FLOOR_MS, SlotUsage } from './accountUsage';
import type { StartWall } from './startRoom';
import { isPolicyId, POOL } from './accountPolicy';
import {
    handedOverRoundPrompt, handedOverRoundWhy,
    normalizeRounds, planNextRound, refuseNextRound, ROUND_BINDING_CODE, roundBindingReason,
    TaskRound, totalRounds
} from './taskRounds';
export type { TaskRound } from './taskRounds';
import { archiveMonths, readArchive } from './taskstats';
import { openExternalTerminal } from './extTerminal';
import { extractJson, sanitizePrompt } from './util';
import { fillJsonTemplate } from './jsonTemplate';
import { LiveCard, reattachPlan } from './consoleTaskRevive';
import { HumanAsk, humanAskSentence, OpenHumanAsk } from './humanAsk';
import { compareJudgePrompt, judgeSources, normalizeJudgeCompare, stageComparison } from './judgeCompare';

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type TaskMode = 'interactive' | 'headless';

/**
 * ‼️ M-26 — WHERE AN INTERACTIVE RUN IS PUT, AND WHAT HAPPENS WHEN IT ANSWERS.
 *
 * `mode` says whether a person is meant to see the run at all. It was doing a
 * second job it never stated: an interactive task always went into VS Code's
 * own terminal, always with the CLI's conversational form, and always sat there
 * until somebody closed the window. Both of those are choices, and a person
 * starting the same work by hand has been making them for releases — the
 * launcher has asked "terminal or Console?" since 3.5x, and the OS terminal has
 * been a door since `core/extTerminal.ts` existed.
 *
 * The vocabulary itself is `core/launch.ts`, beside the efforts and the
 * permission modes: a task, a schedule, a trigger, a template and a workflow
 * step all carry these, so they cannot be spelled in the module that owns
 * tasks. Re-exported here because a task is where a reader looks for them.
 */
export {
    CLOSE_CHOICES, INTERACTIVE_CLOSES, INTERACTIVE_TARGETS, normInteractiveClose,
    normInteractiveTarget, TARGET_CHOICES
} from './launch';
export type { InteractiveClose, InteractiveTarget } from './launch';

export interface FarmTask {
    id: string;
    agentId: string;
    agentName: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    status: TaskStatus;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
    fromSchedule?: string;
    fromTrigger?: string;
    outputFile?: string;
    workflowId?: string;
    workflowRunId?: string;
    stepIndex?: number;
    /** M-40 — which element of its step's for-each list this row ran on */
    branchIndex?: number;
    /** M-41 — the local files a media step uploaded, and the URL each was sent as */
    uploads?: { path: string; url: string; provider: string; cached: boolean }[];
    /** claude -p --output-format json when 'json' (structured handoff). */
    outputContract?: 'text' | 'json';
    /** verification attempt number (0 = first run). */
    attempt?: number;
    /** result of the verify step, when the step had one. */
    /** M-42 — `unjudged`: no judge could look at it; never read as a pass */
    verified?: 'pass' | 'fail' | 'unjudged';
    /** A-27 — the reason this attempt's check FAILed: the next attempt is held against it */
    verifyFail?: string;
    /** A-27 — what its checks cost (every judge call, every rung): part of the step's spend (stepSpend) */
    judgeUSD?: number;
    /** A-27 — what its check decided beyond the verdict: climbs, retries withheld (src/core/judgeDecision.ts) */
    judgeDecisions?: JudgeDecision[];
    /** M-45 — this row is the supervisor woken after its step, by these conditions (src/core/workflowWake.ts) */
    wokeBy?: string[];
    /** M-45 — how the step it was woken after had ended: what the mechanical path goes on from */
    wokeAfter?: TaskStatus;
    /** U-153 — what the supervisor decided on this checkpoint visit (src/core/supervisorTrail.ts) */
    supervisorCall?: SupervisorCall;
    /** U-155 — the Kapıcı verdict that routed this task to its agent (src/core/kapiciChip.ts) */
    kapici?: KapiciChip;
    /** estimated cost of a media step (USD). */
    mediaCost?: number;
    /** why a requested start is waiting (concurrency / quota) — the sentence a
     *  PERSON reads, live figures and all. Never an identity: see `deferredCode`. */
    deferredReason?: string;
    /** S-108 — a running step awaiting a person's answer (humanAskSentence); gone once answered */
    waitingOn?: string;
    /**
     * ‼️ M-11 — WHAT IS HOLDING IT, AS AN IDENTITY RATHER THAN AS A SENTENCE.
     *
     * `deferredReason` carries the money: "fleet daily budget spent ($388.91 of
     * $300.00)". That figure moves every time anything on the farm spends a
     * cent, so a system that decided "is this the same hold as a minute ago?" by
     * comparing the sentence answered NO all evening — one level-3 notice and
     * one `parked` event per cent, about a single budget ceiling that had not
     * changed at all.
     *
     * So the two are separated. The blocker's CODE is stable while the ceiling
     * is the same ceiling — `budget:fleet`, `budget:agent:<id>`, `quota:5h`,
     * `concurrency:fleet`, `concurrency:agent:<id>` — and the sentence beside it
     * is free to say whatever is true this second.
     */
    deferredCode?: string;
    /**
     * ‼️ M-11 — WHICH UNINTERRUPTED PARK THIS IS. A run held by the budget
     * tonight, released, and held by the same budget tomorrow is TWO pieces of
     * news; the code alone cannot tell them apart, because it is deliberately
     * the same code. The counter goes up once per park, when a task that was
     * running free is held, and never while it stays held.
     */
    parkEpisode?: number;
    /** start was requested; the pump launches it when capacity frees up. */
    autoStart?: boolean;
    /** J1: run in this directory instead of the agent folder (worktree runs). */
    workDir?: string;
    /**
     * The project this task belongs to — recorded when it is CREATED, not when
     * it runs. A queued task can sit for hours; by the time it starts, the
     * window's active project may be something else entirely, and giving it
     * that project's context would be worse than giving it none.
     */
    projectId?: string;
    /** Set when this task is a mission delegation (Missions panel links through it). */
    missionId?: string;
    /**
     * ‼️ M-27 — THE PROMPTS STILL TO BE SENT, in order, each with its own wait.
     *
     * Round 1 is `prompt` — that is every task ever written and none of them
     * change. This list holds rounds 2..N, and it SHRINKS as the chain runs:
     * the row that opens round 3 carries only what comes after round 3, so the
     * chain moves itself forward through the store instead of living in a
     * closure that closing the window would throw away. Rules: core/taskRounds.
     */
    rounds?: TaskRound[];
    /**
     * ‼️ M-27 — WHICH ROUND THIS RUN IS. Absent means 1.
     *
     * A RETRY DOES NOT MOVE IT. A retry is this same round attempted again
     * because the run did not survive; only an answered round opens the next
     * one. Counting them together would make the badge lie on every task that
     * ever met a usage limit.
     */
    round?: number;
    /**
     * ‼️ M-27 — how many rounds were asked for, written once at creation. It is
     * the only moment it is knowable: by round 3 the list has been eaten down
     * and nothing left on the row could say what the user originally wanted.
     */
    roundsTotal?: number;
    /** ‼️ M-27 — the task that opened the chain, so its rounds can be found together. */
    roundOf?: string;
    /**
     * ‼️ M-27 — THE RUN WHOSE CONVERSATION THIS ROUND IS STILL WAITING FOR.
     *
     * A round is a reply, so it needs the session the round before it was
     * answered in — and for every engine but opencode that session is bound
     * AFTERWARDS, by matching a transcript the index found on disk. At the
     * moment the answer lands there is normally nothing to resume yet.
     *
     * So the row is made anyway (it can be seen, waited on and cancelled) and
     * it names the run it is waiting for. `launchBlock` holds it while this is
     * set and `resumeSessionId` is not; `releaseRounds` fills the id in and
     * clears this the moment the binding arrives.
     */
    roundAwaits?: string;
    /**
     * ‼️ X-176 — THE SENTRY CAMPAIGN THIS ROW IS A ROUND OF.
     *
     * A campaign round is an ORDINARY TASK: the same runner opens it, the same
     * terminal is watched, the same cancel button ends it. This field is the
     * only thing that makes it a campaign's — which is why "is a round running"
     * is asked of the BOARD (`sentryRunning`) and never stored on the campaign.
     */
    sentryOf?: string;
    /**
     * ‼️ X-195 — WHY THIS ROUND OPENED ON THESE WORDS, AND WHAT IT COST.
     *
     * It lives on the ROW rather than on the campaign because the campaign keeps
     * only its LAST plan: an account of a night is an account of every round in
     * it, and eight rounds sharing one `lastWhy` is seven rounds nobody can
     * explain. Written once, when the round is opened.
     */
    sentryWhy?: RoundWhy;
    /** Explicit model for THIS task (e.g. a mission's per-member override).
     *  Beats the model-policy engine; empty = policy/agent default. */
    model?: string;
    /**
     * ‼️ THE SAME DIMENSIONS A SESSION IS STARTED WITH — see core/launch.ts.
     *
     * A task IS a claude run, and the launcher has offered model · effort ·
     * permission mode since 3.5x; a task could only ever state the first. So
     * "run this on low effort because it is mechanical" and "this one may edit
     * files without asking" were sayable when a person started a session by
     * hand and not when they queued the identical work as a task — which is the
     * case where it matters more, because nobody is sitting there.
     *
     * Empty means the same thing here as there: no flag, and whatever the CLI
     * and the agent already decide stays in charge.
     */
    effort?: string;
    permissionMode?: string;
    /**
     * ‼️ X-102 — WHICH SPAWN THIS RUN IS, and therefore which manifest.
     *
     * Written at the spawn and never after it. It is on the TASK rather than on
     * the binding because the binding is DERIVED from this row every time the
     * store changes (`publishLaunchBindings`), so a handle held anywhere else
     * would be rebuilt away — and because a RETRY is a new task with its own
     * route resolution and its own manifest, which is exactly the distinction
     * `taskId` cannot make.
     *
     * Absent on every task started before this item, and on a run whose agent
     * could not be resolved: an honest gap, never a nearest match.
     */
    launchId?: string;
    /** ‼️ S-81 — this run opens a baton relay: sealed as leg 1 once its session is known (core/batonSeal.ts). */
    baton?: boolean;
    /** S-81 — the chain it opens, when the caller named one; absent = a new `chn_…`. */
    batonChainId?: string;
    /** S-82 — that chain's own leg ceiling (0 = none); absent = agentFarm.batonMaxHops. */
    batonMaxHops?: number;
    /**
     * ‼️ S-129 — this row CONTINUES a relay chain: the door wrote it for a
     * successor (core/batonDoor.ts). Not `baton`/`batonChainId`, which mean the
     * run OPENS a chain and are what the first-leg seal reads. Only its own chain
     * holds its agent's seat against it (core/relaySeat.ts).
     */
    relayOf?: RelayMark;
    /**
     * ‼️ M-26 — WHERE THIS INTERACTIVE RUN OPENS, and what it does once the
     * agent has answered. Both are ignored on a headless run, and both are
     * absent on every task written before they existed — which reads as
     * `vscode` + `stay-open`, exactly what those tasks did.
     */
    interactiveTarget?: InteractiveTarget;
    interactiveClose?: InteractiveClose;
    /**
     * ‼️ A-24 — WHAT THIS RUN SOUNDS LIKE WHEN IT ENDS.
     *
     * A tone id, or `silent` (FINISH_SOUND_SILENT). It is NOT a fifth step in
     * the resolution chain: the moment the run's session id is known it is
     * written into that session's OWN step (`turnAlerts.setVoice(id,'ended',…)`)
     * — the step A-23 built and the Timeline already draws, so the row says
     * "this session's own pick" and means it.
     *
     * `silent` is the one answer a tone cannot give, and it is a different
     * mechanism for a reason A-20 settled: the two authorities over a sound ADD
     * and may not subtract from each other, so quiet is the session MUTE
     * (`turnAlerts.setMuted`, A-22) and it silences this run entirely — not just
     * its ending. Absent = say nothing, and the fleet's chain answers as before.
     */
    finishSound?: string;
    /**
     * ‼️ M-30 — DOES THIS RUN WORK TO THE SUPERPOWERS DISCIPLINE, said on the
     * RUN rather than on the agent.
     *
     * X-133 put the hook behind ONE switch per agent, which answers "how does
     * `developer` work" and cannot answer "…except for this job". A nightly
     * lint sweep and a feature build are the same agent and are not the same
     * kind of work, and the composer's ⚡ chip could say so for a Console
     * session while a scheduled run had no way to.
     *
     * ‼️ THREE STATES, AND ABSENT IS ONE OF THEM. `undefined` means "the
     * agent's own default decides", which is what every task written before
     * this said and must keep meaning; `true` and `false` are a person
     * overriding that default for this job alone. A boolean that defaulted to
     * `false` would silently switch the discipline off on every existing
     * automation the day it shipped.
     */
    superpowers?: boolean;
    /** ‼️ M-26 — the Console CARD this task was handed to (the panel's id, `cs…`),
     *  NOT the engine's session id. The one handle that lets the panel's own
     *  report be read back against this task (see `pumpConsoleTasks`). */
    consoleSessionId?: string;
    /** ‼️ S-85 — the ENGINE's id of the conversation that card hosts, written
     *  when the card first reports it; `rowSessionId` (batonDoor.ts) reads it. */
    hostedSessionId?: string;
    /** ‼️ M-13 — this retry row waits on (or was settled by) the supervisor (retrySupervision.ts) */
    supervision?: TaskSupervision;
    /**
     * ‼️ M-26 — HOW AN EXTERNAL WINDOW REPORTS BACK. A detached `wt` returns
     * immediately and its own exit code says nothing about the CLI inside it, so
     * the launch appends a line that writes the CLI's `%ERRORLEVEL%` into this
     * file. Nothing else can be believed about a window this extension does not
     * own — and a heuristic ("it has been quiet a while") is exactly the kind of
     * rule that rots. Absent on every other surface.
     */
    exitFile?: string;
    /**
     * ‼️ WHICH ENGINE RUNS IT (X-18). Empty = `claude`, which is what every task
     * ever written means and what nothing may start reinterpreting.
     *
     * This is NOT the same axis as `cli` below. A CLI profile is a command
     * TEMPLATE for a binary Agent Farm knows nothing about: it is spawned, its
     * output is archived, and that is the whole relationship. An engine is a
     * machine the extension understands — its readiness is checked before the
     * spawn, its flags are built from a measured vocabulary, its permission mode
     * is translated into that engine's own sandbox, and how it is BILLED is
     * known (see `reportsCost`). The two can coexist; a task states one or the
     * other, and stating both is refused rather than silently ranked.
     */
    engine?: string;
    /**
     * ‼️ X-106 — WHICH ROUTE THIS RUN IS SERVED BY, and it is a THIRD axis
     * beside `engine` and `cli`.
     *
     * An automation fires with nobody at a window, so everything about the run
     * has to be stated when the automation is WRITTEN or it is not stated at
     * all — and until now this one could not be stated anywhere: a queued task
     * inherited whatever standing route the agent happened to have at 3 a.m.,
     * which is a decision nobody made about a run nobody watched.
     *
     * Absent means what it has always meant: no route chosen, nothing injected
     * and nothing cleared, and the agent's own record decides. Four of the five
     * engines are in that state permanently.
     *
     * ‼️ AND IT IS REFUSED BESIDE A `cli`, NOT RANKED. A CLI profile is a
     * command template for a binary this extension knows nothing about — there
     * is no engine there to point at an endpoint, so a route beside one is two
     * statements about a question only one of them can answer, exactly as
     * `engine` + `cli` already is.
     */
    providerId?: string;
    /** ‼️ Claude routes only — which tier of that route. A separate field from
     *  `model` for the reason X-101 gives: `opus` is a different model on two
     *  routes, so folding it in would make one pick mean two things. Travels
     *  WITH `providerId`; a tier alone has no referent. */
    tier?: string;
    /**
     * ‼️ X-169 — WHICH SIGN-IN THIS RUN IS ON, by slot id (`agentFarm.accounts`).
     *
     * It rides here with the route for the reason every dimension in this shape
     * does: a task fires with nobody at a window, so "the nightly batch runs on
     * the second account" can only be said when the task is WRITTEN or it is not
     * said at all. Absent means the engine's active account decides and, failing
     * that, the main sign-in — which is what every task written before this item
     * runs as, to the character.
     */
    account?: string;
    /**
     * ‼️ X-106 — WHAT THE ROUTE ABOVE WAS WHEN THIS TASK WAS QUEUED; see
     * `RouteSeal` for why the enqueue is the moment that has to be written down.
     *
     * A record, never a dimension: nobody picks it, `runExtras` does not carry
     * it and a retry does not inherit it — a retry is a new enqueue and seals
     * itself, because a seal copied forward would be a true record of a moment
     * that belonged to another row.
     */
    routeSeal?: RouteSeal;
    /** J5: named CLI profile (agentFarm.cliProfiles); empty = claude. */
    cli?: string;
    /** Launch priority; higher runs sooner. Unset = 0. Ages up while queued so nothing starves. */
    priority?: number;
    /** F2: in-flight media job poll info — lets a reload reattach to the render instead of losing it. */
    mediaJob?: { provider: string; statusUrl: string; responseUrl: string; deadline: number; input?: string };
    /** Z4: API-equivalent token cost of the task's matched transcript (headless runs). */
    costUSD?: number;
    /** Z4: total tokens of the matched transcript (rides along with the cost). */
    tokens?: number;
    /** Z4: the transcript the cost came from (opens in the session viewer). */
    costSessionFile?: string;
    /**
     * ‼️ S-31/M-12 — THE SESSION THIS RUN ITSELF PRODUCED, as opposed to the one
     * it was told to continue (`resumeSessionId`). Written from the launch
     * binding, so it survives a restart and is there before any cost is.
     */
    runSessionId?: string;
    /**
     * ‼️ X-321 — THE ID THIS RUN WAS TOLD TO USE AT ITS SPAWN (`--session-id`).
     * Unlike `runSessionId`, which may have been deduced from a clock, this one
     * is a declaration, so the launch binding carries it and nothing is guessed.
     * Written per spawn and never copied to a retry: each spawn is its own
     * conversation.
     */
    spawnSessionId?: string;
    /** M-54 — a recipe browser step: its own MCP config and the folder its downloads are filed from */
    browserRun?: BrowserRun;
    /** ‼️ M-12 — what the run managed to do before it failed. Absent on a run
     *  that has not failed, and `unknown` until its transcript is bound. */
    failurePhase?: FailurePhase;
    /** ‼️ M-12 — the evidence behind `failurePhase`, in the row's own words. */
    progress?: RunProgress;
    /** ‼️ M-10 — the moment the engine said its window reopens, kept so the row
     *  can say WHY it is waiting rather than only how long. */
    resetAt?: number;
    /** ‼️ M-10 — this run is a CONTINUATION of the attempt before it, not a
     *  repeat: it resumed that conversation and was given the continuation
     *  prompt instead of the original work. */
    continuationOf?: string;
    /**
     * ‼️ M-7/M-8 — WHAT HAPPENED TO THIS TASK, IN ORDER.
     *
     * A row used to carry three timestamps and a status, which answers "how did
     * it end" and nothing else. The question that was actually being asked was
     * the opposite one: *its time came and went — what happened?* A task that is
     * held back by a ceiling, released, held again and finally run looks
     * identical on those three fields to one that simply sat there, and the
     * reason it was held was overwritten by the next reason.
     *
     * So every transition writes a line here, at the moment it happens and next
     * to the code that decides it — which is also the only place that knows WHY.
     * It is the task's own record: cheap (a handful of short entries), capped,
     * and it travels into the history archive with the task.
     */
    events?: TaskEvent[];
    /**
     * ‼️ M-7 — "RUN THIS WHATEVER THE BUDGET SAYS."
     *
     * The daily budget is a brake with no release, and that is right for the
     * thing it protects against (a runaway automation spending the month in an
     * afternoon) and wrong for the one run that has to happen anyway. It is the
     * user's OWN ceiling, so the user may lift it for a named piece of work.
     *
     * Deliberately narrow: this waives the budget and NOTHING ELSE. The 5-hour
     * quota guard protects the plan window itself and the concurrency limits
     * protect the machine — neither is a policy the user set about money, and a
     * task blocked by those is waiting rather than refused.
     */
    ignoreBudget?: boolean;
    /**
     * ‼️ M-3 — WHAT HAPPENS IF IT FAILS. Absent = the user's default policy
     * (`agentFarm.taskRetry`), which is itself the behaviour this extension has
     * always had. See core/retry.ts; a task states it because a retry is a
     * property of THIS work, not of the machine.
     */
    retry?: RetryPolicy;
    /** The task this one is a retry of — the FIRST run of the chain, so a chain
     *  of five all point at the same original rather than at each other. */
    retryOf?: string;
    /** Which retry this is. Absent / 0 = the original run. It is a FIELD and no
     *  longer a number parsed out of the title, which is what it was. */
    retryAttempt?: number;
    /**
     * ‼️ M-3 (reopened) — THE EARLIEST THIS QUEUED RUN MAY LAUNCH.
     *
     * A retry used to be a `setTimeout` holding a closure: nothing existed on
     * the board for forty minutes, nothing was written down, and closing the
     * window between the failure and the timer threw the retry away in silence
     * — while the failed task's own record already said "retried". The default
     * policy is six attempts forty minutes apart, so the ordinary case spans
     * four hours of a window nobody promised to keep open.
     *
     * The retry is therefore a REAL QUEUED ROW from the moment it is decided,
     * carrying the time it is allowed to start. It is in the store, so it
     * survives a reload; it is on the board, so "what is it going to do about
     * that failure" has a visible answer; and the 30-second pump is the timer,
     * which is the one this extension already trusts with every other delay.
     */
    notBefore?: number;
    /**
     * ‼️ M-10 — AND WHY IT IS THAT MOMENT. "waiting until 05:33" is a fact with
     * no author: it does not say whether the extension guessed forty minutes or
     * read "resets 5:30am" off the engine's own usage data and added the user's
     * three-minute cushion. The row and its hover show this sentence, so the
     * answer is where the question is asked. Absent = an ordinary interval, and
     * the row says only when.
     */
    notBeforeWhy?: string;
    /**
     * ‼️ X-226 — THIS RUN WAS MOVED TO ANOTHER SIGN-IN AT A WALL.
     *
     * `account` says whose plan the run spends; on its own it cannot say that
     * the answer CHANGED, and a night that quietly moved from one plan to
     * another is exactly the fact a person comes to the board for. `from` is
     * empty where the run named no account — the active sign-in answered — and
     * that is a fact rather than a gap. The sentence is `carryOnAccount`'s own,
     * so the row and the decision cannot drift apart.
     */
    accountHandover?: { from: string; why: string };
    /**
     * X-473 — the POOL a row the system placed on a concrete slot was placed from (a relay successor's stay,
     * a sentry round, a carried run): at its start the slot is asked again (startRoom) and, past the wall,
     * the row goes back to this pool. Absent on a row a person placed: their slot is theirs (quotaBrake).
     */
    accountPool?: string;
    /**
     * ‼️ S-19 — CONTINUE AN EXISTING CONVERSATION AS A TASK.
     *
     * A task could only ever open a new one. "Carry on with what that session
     * was doing" therefore meant pasting its last output into a fresh prompt,
     * which is a COPY of the context and not the context: no tool state, no
     * files it had read, no memory of what it had already tried.
     *
     * This is the real thing — the engine resumes the actual session/thread/
     * conversation id, so the transcript continues in place. The run is still a
     * task in every other way (its own row, its own events, its own archived
     * output and its own cost), which is the whole point: the conversation is
     * shared, the bookkeeping is not.
     *
     * ‼️ IT IS ITS OWN FIELD, deliberately. It is not `retryOf` (that is a
     * lineage between task rows, not between conversations), not the parent
     * task, and above all not something parsed out of the title — which is
     * exactly how the retry counter used to be carried, and exactly why it
     * broke the day somebody renamed a task.
     */
    resumeSessionId?: string;
    /** The engine the resumed conversation was HAD with, resolved from the
     *  session index when the task was made. Kept so the launch cannot quietly
     *  send a Codex thread to Claude if the task's engine is edited later. */
    resumedEngine?: string;
    /**
     * ‼️ X-109 — `providerId`/`tier` ARE THE RESUME GATE'S ANSWER for the
     * conversation this task continues: taken as they are at the spawn, an
     * empty providerId included, never falling through to the agent's
     * standing route. Written by the launch, so the next round and the
     * record both see the route the run really took.
     */
    routePinned?: boolean;
    /** A short human handle for the source session — its name and short id — so
     *  the row, the archive header and `tasks.get` can say which conversation
     *  this continued without a second lookup months later. */
    resumedFrom?: string;
    /** ‼️ S-19 — what the resumed session had already cost BEFORE this turn.
     *  The task's own cost is the difference: charging it the conversation's
     *  running total would bill one task for a week of somebody else's work. */
    resumeCostBefore?: number;
    resumeTokensBefore?: number;
}

/**
 * ‼️ M-11 — A CEILING, SAID TWICE ON PURPOSE.
 *
 * `code` is WHICH ceiling and nothing else; `reason` is what a person reads.
 * They are separate because only one of them may move without it being news:
 * "$388.91 of $300.00" becomes "$389.02 of $300.00" while `budget:fleet` stays
 * `budget:fleet`, and the row is supposed to show the first while the notice
 * board hears nothing at all.
 *
 * The vocabulary is deliberately small and hierarchical — `<what>:<scope>` —
 * so a reader of a stored task can tell a fleet budget from an agent one, and
 * a concurrency hold from a budget hold, without parsing English.
 */
export interface LaunchBlock {
    code: string;
    reason: string;
}

/** A check that may hold a launch back. A bare string is still accepted — it
 *  means "this ceiling, whatever it is called" and gets `code` = the sentence,
 *  which is exactly the old behaviour for a host that has not been updated. */
export type BlockAnswer = string | LaunchBlock | undefined;

/** Read whatever a check returned as a block. */
export function asLaunchBlock(v: BlockAnswer, fallbackCode?: string): LaunchBlock | undefined {
    if (!v) { return undefined; }
    if (typeof v === 'string') {
        // ‼️ A BARE STRING IS ITS OWN IDENTITY — which is exactly the behaviour
        // that existed before M-11, kept on purpose. A check that has not been
        // taught to name its ceiling still gets "a new sentence is a new hold",
        // so a host that says "concurrency: 2 running" this hour and "over
        // budget" the next is still two pieces of news. The fallback code below
        // is for the OBJECT form with the name left out; putting it here would
        // silently merge two different ceilings into one.
        const reason = v.trim();
        return reason ? { code: reason, reason } : undefined;
    }
    const reason = String(v.reason ?? '').trim();
    if (!reason) { return undefined; }
    return { code: String(v.code ?? '').trim() || fallbackCode || reason, reason };
}

/**
 * ‼️ M-11 — THE ONE KEY BOTH ANNOUNCERS BUILD.
 *
 * The manager announces a park and so does the farm-news scan in the host, and
 * a "once per key" guard only works if they agree to the character. The key is
 * the task, the EPISODE and the blocker's code — never the reason, which is the
 * whole bug: a key with the live dollar figure in it is a new key every cent.
 */
/**
 * ‼️ M-12 — ONE SENTENCE, EVERYWHERE. The Tasks row, the tooltip, the task event
 * and `tasks.get` all have to say the same thing about a failed run, or the
 * board contradicts itself about the same fact — which is how "nothing was
 * attempted" survived beside a 3.2 MB transcript in the first place.
 *
 * Short by design: the row has a cell, not a paragraph. The transcript link and
 * the output archive are the depth, and both are on the row already.
 */
export function describeFailurePhase(
    t: Pick<FarmTask, 'failurePhase' | 'progress' | 'startedAt' | 'endedAt'>
): string {
    const mins = t.startedAt && t.endedAt
        ? Math.max(1, Math.round((t.endedAt - t.startedAt) / 60000)) : 0;
    const ran = mins ? `${mins} min` : '';
    const steps = (t.progress?.assistantSteps ?? 0) + (t.progress?.toolCalls ?? 0);
    switch (t.failurePhase) {
        case 'interrupted': {
            const did = [
                t.progress?.assistantSteps ? `${t.progress.assistantSteps} step(s)` : '',
                t.progress?.toolCalls ? `${t.progress.toolCalls} tool call(s)` : ''
            ].filter(Boolean).join(' · ');
            return `${ran ? ran + ' of work' : 'work done'}${did ? ' · ' + did : ''}`
                + ' · the run was CUT OFF, not untouched';
        }
        case 'not-started':
            return 'nothing was attempted — it failed before any work started';
        case 'unknown':
            return ran
                ? `${ran} elapsed · no transcript bound yet, so what it managed is not known`
                : 'no transcript bound yet, so what it managed is not known';
        default:
            return steps ? `${steps} step(s)` : '';
    }
}

export function parkNoticeKey(task: Pick<FarmTask, 'id' | 'parkEpisode' | 'deferredCode' | 'deferredReason'>): string {
    return `task-parked:${task.id}:${task.parkEpisode ?? 1}:${task.deferredCode ?? task.deferredReason ?? ''}`;
}

/** One thing that happened to a task. `kind` is the verb; `note` is the one
 *  fact the verb does not already carry (a park's reason, an exit code) and is
 *  never a sentence restating the kind. */
export interface TaskEvent {
    ts: number;
    kind: TaskEventKind;
    note?: string;
    /** ‼️ M-8 — RECONSTRUCTED, NOT WITNESSED. Built by `migrateTaskEvents` out
     *  of the fields a task kept before there was a record to write into, so
     *  the time is the field's and nothing between the lines is known. Drawn
     *  with that said, never as an equal of a line written as it happened. */
    migrated?: true;
}

export type TaskEventKind =
    | 'created'    // queued, by whom/what
    | 'parked'     // a ceiling held the launch back — `note` is which
    | 'started'    // the process was spawned
    | 'finished'   // done / failed — `note` carries which and why
    | 'cancelled'
    | 'retried'
    // ‼️ M-21 — PICKED BACK UP, WHICH IS NOT STARTED AGAIN. A run whose surface
    // outlives this extension host (an OS terminal, a media job still polling)
    // is re-attached after a reload without anything being spawned. Drawn as
    // `started` it would read as a second launch of the same work, which is the
    // one thing that did NOT happen.
    | 'resumed'
    // ‼️ X-106 — THE ROUTE MOVED WHILE THE RUN SAT IN THE QUEUE. Its own kind
    // rather than a clause inside `started`, because it is the one line on a
    // run's record that says the setup it ran with is NOT the setup that was
    // chosen for it — and a person scanning a timeline for something unusual
    // has to be able to see it without reading every note.
    | 'route-drift'
    // ‼️ X-109 — WHICH ROUTE A RESUMED RUN WAS PUT ON, and why: the gate's
    // verdict (pinned to the conversation's own, switched where the engine
    // allows it, unbound where nothing was recorded). Its own kind because
    // it is the one line that says the run's route was DECIDED rather than
    // copied from the task, and a refusal is on `finished` beside it.
    | 'route'
    // ‼️ S-109 — A RESUMED RUN TOOK WHAT ITS CONVERSATION CLOSED WITH (model,
    // effort, mode) instead of the task's launch copy, and the note says which.
    | 'setup'
    // X-473 — the slot the system placed the row on had no room left at its start: the row went back to its pool.
    | 'placed'
    // X-474 — a sentry round's first quota reading already stood at the handover line (misplaced.ts).
    | 'misplaced';

/** The most a task keeps. A run that ping-pongs against a ceiling for a day
 *  would otherwise grow without bound; the newest are the ones being read. */
export const TASK_EVENTS_MAX = 40;

/**
 * ‼️ B-03.8 — HOW MANY TIMES ONE RUN MAY BE PICKED BACK UP ACROSS RESTARTS.
 *
 * The sibling of the boot-loop guard in `core/selfRestart.ts`: a host that
 * restarts in a loop would otherwise respawn the same work on every boot, all
 * night, each spawn spending a plan window. Counted on `attempt`, which is the
 * number of times this work has been launched again by anything — a retry and a
 * revive are both "this run, once more", and a bound that only counted one of
 * them would be a bound the other walks around.
 */
export const REVIVE_MAX_ATTEMPTS = 3;

/** Append one line to a task's own record. Exported pure so the reducer is
 *  testable without a manager, and so nothing has to remember the cap. */
export function noteTaskEvent(task: FarmTask, kind: TaskEventKind, note?: string): void {
    const list = task.events ?? (task.events = []);
    list.push(note ? { ts: Date.now(), kind, note } : { ts: Date.now(), kind });
    if (list.length > TASK_EVENTS_MAX) { list.splice(0, list.length - TASK_EVENTS_MAX); }
}

/** Which month file a task belongs in — the archive's one naming rule, in one
 *  place, so a record and the tombstone that cancels it never split up. */
export function monthOf(task: { endedAt?: number; createdAt: number }): string {
    const d = new Date(task.endedAt ?? task.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * ‼️ M-8 (reopened) — THE RUNS THAT ALREADY EXISTED GET A HISTORY TOO.
 *
 * The event log starts the day it was written, so "what happened to this task,
 * from the beginning" answered *nothing at all* for every task already in the
 * store — including the one the user was looking at when they asked for it, a
 * run parked for days with its reason on the row and an empty timeline under
 * it. A feature that only works on things created after it shipped is not the
 * feature that was asked for.
 *
 * So a task with no record gets one built from what it does carry: the three
 * timestamps, where it came from, and the ceiling currently holding it. Every
 * line is marked `migrated`, because a reconstruction is not a witness — it has
 * the times the fields kept and nothing about what happened between them, and a
 * page drawing it says so rather than passing it off as the real thing.
 *
 * Idempotent: a task with any record is left exactly as it is, so this can run
 * on every load and the first save makes it permanent.
 */
export function migrateTaskEvents(task: FarmTask): boolean {
    if (task.events?.length) { return false; }
    const out: TaskEvent[] = [];
    const src = task.fromSchedule ? 'a schedule'
        : task.fromTrigger ? 'a trigger'
            : task.workflowId ? 'a workflow step'
                : 'by hand';
    out.push({ ts: task.createdAt, kind: 'created', note: `queued — ${src}`, migrated: true });
    // A ceiling that is holding it RIGHT NOW is the one thing here that is not
    // a timestamp, and it is the fact the user was actually asking about. It
    // takes the created time because the store never kept when it began.
    if (task.deferredReason && task.status === 'queued') {
        out.push({ ts: task.createdAt, kind: 'parked', note: task.deferredReason, migrated: true });
    }
    if (task.startedAt) {
        out.push({ ts: task.startedAt, kind: 'started', note: task.mode, migrated: true });
    }
    if (task.endedAt) {
        out.push(task.status === 'cancelled'
            ? { ts: task.endedAt, kind: 'cancelled', migrated: true }
            : { ts: task.endedAt, kind: 'finished', note: task.status, migrated: true });
    }
    task.events = out;
    return true;
}

/**
 * ‼️ THE DIMENSIONS OF A RUN — THE SAME ONES WHEREVER THE RUN COMES FROM.
 *
 * A task carries model · effort · permission mode · CLI · working folder ·
 * priority · project (see FarmTask). A schedule and a trigger are nothing but
 * a task that has not happened yet — and they could state only the FIRST of
 * those. So "run the nightly batch on opus at low effort, in the worktree, and
 * file it under this project" was sayable when a person queued the work by hand
 * and not when they automated the identical work, which is the case where it
 * matters MORE because nobody is sitting there to correct it.
 *
 * Empty means what it means everywhere else: no flag, and whatever the agent
 * and the CLI already decide stays in charge.
 */
export interface RunDimensions {
    /** which engine — see FarmTask.engine. Empty = claude. */
    engine?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    /**
     * ‼️ X-106 — AND WHICH ROUTE IT IS SERVED BY (see FarmTask.providerId).
     *
     * It rides here with the model and the permission mode for the reason every
     * dimension in this shape does: an automation fires with nobody at a
     * window, so "the nightly batch goes through the Kimi route" can only be
     * said when the automation is written, or it is not said at all — and this
     * is the dimension where not saying it is worst, because the run silently
     * takes whichever standing route the agent had at 3 a.m.
     */
    providerId?: string;
    /** Claude routes only — which tier of that route. Travels WITH `providerId`
     *  (see FarmTask.tier). */
    tier?: string;
    /** ‼️ X-169 — and which SIGN-IN serves it (see FarmTask.account). Same
     *  reason as the route: nobody is at a window at 3 a.m. to pick one. */
    account?: string;
    cli?: string;
    /**
     * ‼️ M-26 — WHERE AN INTERACTIVE RUN OPENS, AND WHETHER IT STAYS.
     *
     * They live here, with the model and the permission mode, because they are
     * decided the same way and for the same reason: an automation fires with
     * nobody at a window, so everything about how its run appears has to be
     * stated when the automation is written or it is not stated at all. A
     * nightly job set to `console` + `auto-close` is a different, deliberate
     * thing from one that opens a terminal and waits to be closed — and before
     * this, neither could be said anywhere.
     *
     * Ignored on a headless run, on every object that carries them.
     */
    interactiveTarget?: InteractiveTarget;
    interactiveClose?: InteractiveClose;
    /**
     * ‼️ A-24 — AND WHAT IT SOUNDS LIKE WHEN IT IS OVER (see FarmTask.finishSound).
     *
     * It rides with the model and the permission mode for the reason every
     * dimension here does: an automation fires with nobody at a window, and
     * "tell me when the nightly build is done, in THAT tone" can only be said
     * when the automation is written or it is not said at all.
     */
    finishSound?: string;
    /**
     * ‼️ M-30 — AND WHETHER IT WORKS TO THE DISCIPLINE (see FarmTask.superpowers).
     *
     * It rides with the model and the permission mode for the reason every
     * dimension here does: an automation fires with nobody at a composer, so
     * "this job in particular gets the engineering hook" can only be said when
     * the automation is WRITTEN, or it is not said at all. Absent = the agent's
     * default answers, exactly as before.
     */
    superpowers?: boolean;
    workDir?: string;
    priority?: number;
    /**
     * ‼️ M-27 — THE PROMPTS AFTER THE FIRST ONE, ON THE AUTOMATION ITSELF.
     *
     * This is the case the whole feature was asked for and the one it did
     * not reach: "run this every morning, and when it answers ask it the
     * next thing". The rounds were read on the manual new-task form only,
     * so a schedule drew the editor, accepted what was typed into it and
     * then fired a one-prompt run — exactly the thing that could not be
     * asked for before, still not askable, and now silently.
     *
     * It sits with the model and the retry policy because it is decided the
     * same way and for the same reason: an automation fires with nobody at
     * a window, so everything about the run it makes has to be stated when
     * the automation is written or it is not stated at all.
     *
     * A WORKFLOW STEP ignores it by design — "what happens next" is the
     * workflow's own question (see planNextRound), and the step composer
     * does not offer the field.
     */
    rounds?: TaskRound[];
    /** ‼️ The budget waiver travels with the automation, not only with the task
     *  it produces — see FarmTask.ignoreBudget. This is the case it exists for:
     *  a nightly run nobody is watching is exactly the one that must not be
     *  silently held back by a ceiling that was hit at four in the afternoon. */
    ignoreBudget?: boolean;
    /**
     * ‼️ DECLARED, NEVER INFERRED. An automation fires off a timer or a file
     * change; nobody was looking at a window, so there is no active project to
     * read (see addTask). A project stated HERE is a decision the user made
     * about this automation, which is the only honest way an unattended run can
     * have one.
     */
    projectId?: string;
    /**
     * ‼️ M-3 — AND WHAT HAPPENS IF IT FAILS. It travels with the automation for
     * the same reason the budget waiver does: the nightly run nobody is watching
     * is the one where "it failed at 03:00 and that was that" costs a day.
     * Absent = the user's default (`agentFarm.taskRetry`).
     */
    retry?: RetryPolicy;
    /**
     * ‼️ S-82 — AND WHETHER IT OPENS A BATON RELAY (see FarmTask.baton).
     *
     * It rides with the retry policy for the same reason: the nightly run
     * nobody is watching is exactly the one that must hand its work to a fresh
     * session at the quota wall rather than write a note into the dark. A
     * schedule, a trigger and a retry carry it by the shape; the chain's NAME
     * does not travel (FarmTask.batonChainId) — a named chain already has legs
     * the second time an automation fires.
     */
    baton?: boolean;
    /** S-82 — that chain's own leg ceiling (0 = none); absent = agentFarm.batonMaxHops. */
    batonMaxHops?: number;
}

/**
 * ‼️ X-106 — THE ROUTE A RUN NAMED, IN THE SHAPE THE RESOLVER TAKES IT.
 *
 * `undefined` rather than `{}` when nothing was chosen, because that is the
 * value the resolver already reads as "the agent's own record decides" — the
 * behaviour every task written before this dimension existed had, and the one
 * four of the five engines have permanently.
 *
 * One helper for both spawn shapes: written out twice, the second is where
 * somebody forgets, and a run that quietly inherited a route looks exactly like
 * one that chose it.
 */
export function routeOf(
    t: { providerId?: string; tier?: string }
): { providerId?: string; tier?: string } | undefined {
    const providerId = (t.providerId ?? '').trim();
    if (!providerId) { return undefined; }
    const tier = (t.tier ?? '').trim();
    return { providerId, ...(tier ? { tier } : {}) };
}

/**
 * ‼️ X-106 — WHAT THE ROUTE WAS WHEN THE RUN WAS QUEUED.
 *
 * A task states its route when it is WRITTEN and runs hours later, so the
 * profile behind that route can be edited, re-keyed or pointed at a different
 * endpoint while the row sits in the queue. Nothing downstream can notice: the
 * spawn resolves the route as it stands at 03:00 and the manifest records THAT,
 * so both readings of "which endpoint served the nightly batch" are the same
 * sentence written twice and the change between them leaves no trace at all.
 *
 * So the redacted answer is sealed at the ENQUEUE — the moment the person made
 * the choice — and the spawn compares its own reading against it. Absent means
 * no route was named, which is a different thing from a route that has not
 * moved: with nothing chosen the agent's standing record decides at the spawn,
 * and there was never a choice to seal.
 *
 * ‼️ IT HOLDS THE IDENTITY ITSELF, not a flattened copy of the fields that
 * matter. A second shape here would need a mapping onto the manifest's identity
 * before the two could be compared, and that mapping would be a third statement
 * of one resolution — the exact shape of the defect X-101 exists to prevent.
 *
 * ‼️ REDACTED BY CONSTRUCTION, like the manifest: `ProviderIdentity` has no
 * field a credential can sit in, and the seal arrives from the registry already
 * in that shape rather than being assembled out of a stored profile here.
 */
export interface RouteSeal {
    /** The enqueue moment, stamped on its own — `createdAt` belongs to the task
     *  and a retry's task is a different row from the one that was sealed. */
    at: number;
    /** The redacted answer the route gave THEN (`core/providerRegistry.ts`). */
    identity: ProviderIdentity;
    /** Which revision of the catalog the choice was resolved against, where the
     *  source states one — absent on a Claude route, whose revision is the
     *  profile's and is already inside `identity`. */
    catalogRevision?: string;
}

/**
 * ‼️ X-106 — DID THE ROUTE MOVE WHILE THE TASK WAITED? The sentence a person
 * reads, or nothing when the two readings agree.
 *
 * Compared field by field rather than by serialising both records: half of an
 * identity is filled in from what came BACK (`reportedModels`, the proof), so a
 * deep equality would report drift on every run that actually answered.
 */
export function sealDrift(
    seal: RouteSeal | undefined,
    now: { identity: ProviderIdentity; catalogRevision?: string } | undefined
): string | undefined {
    if (!seal || !now) { return undefined; }
    const was = seal.identity;
    const is = now.identity;
    const parts: string[] = [];
    // The profile it names first, then its revision — a run that landed on a
    // DIFFERENT profile has not had its revision bumped, and reporting both
    // would describe one change twice.
    if ((was.providerProfileId ?? '') !== (is.providerProfileId ?? '')) {
        parts.push(`profile ${was.providerProfileId || 'none'} → ${is.providerProfileId || 'none'}`);
    } else if ((was.providerProfileRevision ?? -1) !== (is.providerProfileRevision ?? -1)) {
        parts.push(`profile revision ${was.providerProfileRevision ?? '?'} → ${is.providerProfileRevision ?? '?'}`);
    }
    if (was.providerId !== is.providerId) {
        parts.push(`endpoint ${was.providerId || 'none'} → ${is.providerId || 'none'}`);
    }
    if ((was.route?.baseUrl ?? '') !== (is.route?.baseUrl ?? '')) {
        parts.push(`base url ${was.route?.baseUrl || 'none'} → ${is.route?.baseUrl || 'none'}`);
    }
    if ((was.route?.authKind ?? '') !== (is.route?.authKind ?? '')) {
        parts.push(`auth ${was.route?.authKind || 'none'} → ${is.route?.authKind || 'none'}`);
    }
    if (was.requestedModelRef !== is.requestedModelRef) {
        parts.push(`model ${was.requestedModelRef || 'none'} → ${is.requestedModelRef || 'none'}`);
    }
    if ((seal.catalogRevision ?? '') !== (now.catalogRevision ?? '')) {
        parts.push(`catalog ${seal.catalogRevision || 'none'} → ${now.catalogRevision || 'none'}`);
    }
    if (!parts.length) { return undefined; }
    return parts.join(' · ');
}

/** The run dimensions of an automation, in the shape `addTask` takes them —
 *  empty fields dropped, so "not stated" never becomes an explicit empty flag. */
export function runExtras(d: RunDimensions | undefined): Partial<FarmTask> {
    const r: Partial<FarmTask> = {};
    if (!d) { return r; }
    if (d.engine) { r.engine = d.engine; }
    if (d.model) { r.model = d.model; }
    if (d.effort) { r.effort = d.effort; }
    if (d.permissionMode) { r.permissionMode = d.permissionMode; }
    /**
     * ‼️ X-106 — THE ROUTE TRAVELS BY THE SHAPE, NOT BY TEN CALL SITES. Every
     * stored automation object extends `RunDimensions` — a schedule, a trigger,
     * a template, a workflow step — and every one of them reaches a run through
     * here. So the dimension is inherited by a retry, a clone and an edit
     * without any of those knowing it exists, which is the only way a
     * seventeenth dimension does not become a seventeenth thing to forget.
     *
     * ‼️ AND A TIER WITHOUT A ROUTE IS DROPPED. `opus` is a different model on
     * two routes; with no route chosen the word answers nothing, and carrying
     * it would let a stored automation claim a decision that cannot be resolved.
     */
    if (d.providerId) {
        r.providerId = d.providerId;
        if (d.tier) { r.tier = d.tier; }
    }
    // ‼️ X-169 — the account travels by the shape too, so a schedule, a
    // trigger, a template and a workflow step each carry it without knowing it
    // exists. It does NOT travel with the route: an account is a sign-in and a
    // route is an endpoint, and a run may legitimately name either alone.
    if (d.account) { r.account = d.account; }
    if (d.cli) { r.cli = d.cli; }
    // ‼️ M-26 — the DEFAULT is dropped, like every other field here. A task
    // carrying `interactiveTarget: 'vscode'` and one carrying nothing run
    // identically, and writing the word would make every task on disk claim a
    // decision nobody made.
    if (d.interactiveTarget && d.interactiveTarget !== 'vscode') {
        r.interactiveTarget = normInteractiveTarget(d.interactiveTarget);
    }
    if (d.interactiveClose && d.interactiveClose !== 'stay-open') {
        r.interactiveClose = normInteractiveClose(d.interactiveClose);
    }
    // ‼️ A-24 — cleaned on the way through like every other field here, so a
    // pick typed into a form, seeded from JSON or sent over the bridge cannot
    // reach a run in a shape the applier would have to guess at.
    const finish = normalizeFinishSound(d.finishSound);
    if (finish) { r.finishSound = finish; }
    // ‼️ M-30 — `undefined` IS A VALUE HERE and must survive as absence, so the
    // test is against undefined rather than truthiness: `false` is a person
    // saying "not on this one" and dropping it would silently hand the job back
    // to the agent's default, which is the opposite of what they asked for.
    if (d.superpowers !== undefined) { r.superpowers = d.superpowers === true; }
    if (d.workDir) { r.workDir = d.workDir; }
    if (d.priority) { r.priority = Math.trunc(d.priority); }
    if (d.ignoreBudget) { r.ignoreBudget = true; }
    // ‼️ Normalised on the way through, so a policy typed into a form, seeded
    // from a JSON file or sent over the bridge cannot reach a task un-clamped.
    const retry = normalizeRetry(d.retry);
    if (retry) { r.retry = retry; }
    // ‼️ M-27 — and the chain, cleaned on the way through for the same reason
    // the policy is: a list typed into a form, seeded from JSON or sent over
    // the bridge must not reach a run un-clamped. Empty stays absent, so an
    // ordinary one-prompt automation writes nothing about a chain it has not
    // got. `addTask` stamps the denominator from here.
    const rounds = normalizeRounds(d.rounds);
    if (rounds.length) { r.rounds = rounds; }
    // S-82 — the relay opens on the run the shape produces, and its ceiling is
    // clamped on the way through like every other number here.
    if (d.baton === true) {
        r.baton = true;
        const cap = normalizeLegCeiling(d.batonMaxHops);
        if (cap !== undefined) { r.batonMaxHops = cap; }
    }
    return r;
}

/**
 * ‼️ X-296 — A TASK'S LAUNCH DIMENSIONS, IN THE SHAPE A LAUNCH RECORD TAKES
 * THEM, and the reason this is a function rather than three fields at the call
 * site.
 *
 * The record of a run is assembled from what the run WAS, so a hand-written
 * list there is a list that quietly stops describing the spawn beside it. It
 * had already stopped four times: the account (X-251 — measured live, a
 * headless run recorded under the engine's active sign-in while it spent the
 * task's), the route (`routeOf(task)` reaches the runtime, so the record could
 * name a different endpoint from the one that answered), the tier that rides
 * with it, and the CLI. Every field `LaunchOptions` and `RunDimensions` have in
 * common belongs here — `test_launch_manifest.js` reads both interfaces and
 * fails on a tenth that does not.
 *
 * Empties are dropped, for the reason the whole family follows: `undefined` is
 * "not stated" and must not reach a reader as a chosen empty value. It matters
 * mechanically as well — the launch record spreads these over the engine it was
 * given, and a present-but-undefined `engine` would erase it.
 */
export function launchDimsOf(t: FarmTask): LaunchOptions {
    const o: LaunchOptions = {};
    const engine = engineOf(t.engine).id;
    if (engine) { o.engine = engine; }
    if (t.model) { o.model = t.model; }
    if (t.effort) { o.effort = t.effort; }
    if (t.permissionMode) { o.permissionMode = t.permissionMode; }
    if (t.account) { o.account = t.account; }
    if (t.cli) { o.cli = t.cli; }
    // ‼️ A tier without a route is dropped, the same rule `runExtras` applies:
    // `opus` is a different model on two routes, and alone it answers nothing.
    const route = routeOf(t);
    if (route) {
        o.providerId = route.providerId;
        if (route.tier) { o.tier = route.tier; }
    }
    // ‼️ M-30 — `false` IS AN ANSWER, so the test is against undefined. Only the
    // task's own pick travels here; the default that fills its absence is the
    // spawn's to apply, and the recorder applies the same one.
    if (t.superpowers !== undefined) { o.superpowers = t.superpowers === true; }
    return o;
}

export type ScheduleKind = 'daily' | 'weekly' | 'once';

/** What happens when a scheduled time passes while no VS Code window was open:
 *  'skip' (default, the old behavior) = that occurrence is lost — the schedule
 *  only fires on its own day; 'run' = the missed occurrence fires at the first
 *  opportunity, no questions asked; 'ask' = it is offered with Run/Skip buttons. */
export type MissedPolicy = 'skip' | 'run' | 'ask';

export interface FarmSchedule extends RunDimensions {
    id: string;
    agentId: string;
    agentName: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    kind: ScheduleKind;
    hour: number;
    minute: number;
    dow?: number;      // 0=Sunday, weekly only
    onceAt?: number;   // epoch ms, once only
    enabled: boolean;
    lastRunKey?: string;
    missed?: MissedPolicy;
    /** Is there work? Evaluated for free before any agent is woken; a schedule
     *  whose precondition fails is stamped as handled for the day and skipped. */
    fireIf?: Precondition;
    /** Quiet hours deferred this occurrence; it fires when the window ends. */
    pendingRunKey?: string;
}

/**
 * ‼️ A TEMPLATE IS A TASK YOU HAVE NOT RUN YET, SO IT CARRIES A TASK'S
 * DIMENSIONS (X-35).
 *
 * It did not, and the consequence was quiet and cumulative: a person could set
 * a task up on Codex by hand, save it as a template so as not to have to do it
 * again — and every run from that template went back to Claude. The one object
 * whose whole purpose is "the same launch, again" was the one that could not
 * remember the launch.
 */
export interface FarmTemplate extends RunDimensions {
    id: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    agentId?: string;
    agentName?: string;
}

export interface WorkflowStep extends RunDimensions {
    /** M-39 — stable across inserts and moves; later steps read it as {steps.<id>.…} */
    id?: string;
    agentId: string;
    agentName: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    /** What to do when this step fails: stop the chain (default), continue, or jump to a 1-based step. */
    onFail?: 'stop' | 'continue' | number;
    /**
     * Condition for running this step. Plain string = regex on the previous
     * step's output body. "json:field.path~regex" = regex on a field of the
     * previous step's parsed JSON output.
     */
    runIf?: string;
    /** 'json' runs the step with --output-format json and parses the result for handoff. */
    outputContract?: 'text' | 'json';
    /** Cheap-model quality gate: on FAIL the step is retried with the judge's feedback. */
    verify?: { criteria: string; retries?: number } & StepJudge;
    /**
     * Webhook step: instead of claude, the step is an HTTP call. url/body/header
     * templates support {prev_output} {prev_text} {prev_json.x} {secret:NAME}.
     * The response body becomes the handoff for the next step. Wave C: optional
     * `headers` (auth for queued APIs) and `poll` (submit→poll any queued API —
     * Gemini long-running ops etc. — without a bespoke media provider).
     */
    /** M-49 — a local ffmpeg recipe, no model; its result is the step's JSON (src/core/toolCall.ts) */
    tool?: ToolStepSpec;
    /** M-51 — publish to one platform through a connection, the calendar note and the record updated (src/core/publishStep.ts) */
    publish?: PublishSpec;
    /** M-52 — the published content's numbers pulled through a connection, onto the records and the performance snapshot (src/core/contentMetrics.ts) */
    metrics?: MetricsSpec;
    /** M-60 — Kapıcı routes the chain here: proceed, stop or ask you (src/core/kapiciStep.ts) */
    kapici?: KapiciStepSpec;
    /** X-418 — where this step's files are filed and recorded, over the workflow's (src/core/runLibrarySpec.ts) */
    library?: StepLibrarySpec;
    webhook?: {
        url: string; method?: string; body?: string;
        headers?: Record<string, string>;
        poll?: WebhookPollConfig;
    };
    /**
     * Media step (fal.ai queue): model id + JSON input template ({prev_*} and
     * {secret:} are substituted). Assets are downloaded into the outputs
     * archive; the response JSON becomes the next step's handoff. Wave A:
     * optional projectId/sceneId tie the produced assets to a production scene.
     */
    media?: { model: string; input: string; timeoutMin?: number; projectId?: string; sceneId?: string; candidates?: number };
    /**
     * F3 — browser automation step: the step's agent drives its browser MCP.
     * Host allowlist is enforced before launch; empty allowlist = refuse.
     */
    browser?: { url: string; goal: string; allowHosts?: string[]; recipe?: string; confirm?: 'ask' | 'auto'; downloadDir?: string };
    /**
     * Human-in-the-loop gate: the chain pauses here until the user approves.
     * On approve the upstream handoff passes through unchanged; on reject the
     * step's onFail policy applies. No agent, no model call.
     */
    approval?: { message?: string };
    /**
     * Wave B — visual selection gate: opens a gallery-picker of the assets
     * produced so far in this run; the user keeps some (min..max). The SELECTED
     * asset URLs become the handoff (`{prev_json.selected.N}` / `{prev_text}`),
     * so the next media/agent step works only with the chosen ones. Cancelling
     * applies the step's onFail policy. No agent, no model call.
     */
    select?: { message?: string; min?: number; max?: number };
    /**
     * Fan-out: this step runs concurrently with adjacent `parallel` steps. A
     * maximal run of consecutive parallel steps forms a group; the step after
     * the group receives all their outputs merged (fan-in). Unset = sequential.
     */
    parallel?: boolean;
    /** M-40 — run this step once per element of a list read off the run (src/core/forEachStep.ts). */
    forEach?: FE.ForEachSpec;
    /** M-43 — the supervisor is woken here, whatever happened (src/core/checkpointStep.ts). No agent. */
    checkpoint?: CheckpointSpec;
    /** M-45 — what wakes the supervisor after this step; unset = the workflow's (src/core/workflowWake.ts) */
    wake?: WakeSpec;
    /** M-50 — this step's own brand kit fields, over its production's (src/core/brandKit.ts) */
    brand?: BrandKit;
    /** M-53 — a role slot instead of an agent: filled where the workflow is used (src/core/workflowRoles.ts) */
    role?: string;
}

/** What one step passes to the next. */
export interface Handoff {
    file?: string;
    text?: string;
    json?: unknown;
    /** M-38 — the run's input values, set on every step from the run record */
    inputs?: Record<string, string>;
    /** M-39 — every finished step of the run, set on every step from the run record */
    board?: RunBoard;
    /** M-40 — the element a for-each branch runs on */
    branch?: { index: number; count: number; item: unknown };
    /** M-50 — the brand kit THIS step reads {brand.*} from; set per step, never handed on */
    brand?: BrandKit;
}

export interface FarmTrigger {
    id: string;
    title: string;
    type: 'watch' | 'hook' | 'webhook';
    /** watch: file or folder whose change fires the trigger */
    watchPath?: string;
    /** webhook: secret path token — POST http://127.0.0.1:<port>/trigger/<token> */
    token?: string;
    /** hook: live event kind (prompt, toolStart, stop, end, permission, …) */
    hookEvent?: string;
    /** hook: only fire for this agent (name); empty = any agent */
    hookAgent?: string;
    action:
        | ({ kind: 'task'; agentId: string; agentName: string; title: string; prompt: string; mode: TaskMode } & RunDimensions)
        | { kind: 'workflow'; workflowId: string; /** M-38 — input → {file} {watch} {payload} {payload.x} */ inputs?: Record<string, string> }
        /** F2: no fixed agent — the dispatcher routes each firing to the best agent. */
        | ({ kind: 'dispatch'; title: string; prompt: string; mode: TaskMode } & RunDimensions);
    debounceSec: number;
    cooldownSec: number;
    maxPerHour: number;
    enabled: boolean;
    lastFiredAt?: number;
    fireCount?: number;
    recentFirings?: number[];
    /** Is there work? A watch trigger fires on ANY filesystem change — including
     *  noise that has nothing to do with the job. This is the content brake the
     *  frequency brakes (debounce/cooldown/maxPerHour) can never be: it is
     *  evaluated for free and stops the wake-up before it costs a model call. */
    fireIf?: Precondition;
    /** Firings suppressed by the precondition or the gate (cost NOT paid). */
    skipCount?: number;
    lastSkippedAt?: number;
    lastSkipReason?: string;
    /** U-155 — the last Kapıcı precondition verdict, fired or skipped */
    lastKapici?: KapiciChip;
}

export interface FarmWorkflow {
    id: string;
    title: string;
    steps: WorkflowStep[];
    /** M-38 — what it is given when it starts; a step reads one as {input.name} */
    inputs?: WorkflowInput[];
    /** M-38 — the last run's values, which the Run card is prefilled with (remembered) */
    lastInputs?: Record<string, string>;
    /** U-151 — the wake preset the last 'Run with…' chose ('' / absent = the workflow's own); the card starts there */
    lastWake?: string;
    /** M-43 — what the chain is for, and how its supervisor tells it got there */
    goal?: string;
    criteria?: string[];
    /** M-44 — the run's supervisor session: model, effort, sign-in, its ceilings (src/core/supervisorRun.ts) */
    supervisor?: WorkflowSupervisor;
    /** X-418 — the Airtable database its files are filed and recorded in, and how (src/core/runLibrarySpec.ts) */
    library?: LibrarySpec;
    /** M-45 — what wakes the supervisor after a step; unset = mechanical (src/core/workflowWake.ts) */
    wake?: WakeSpec;
    /** M-50 — the production whose brand kit its steps read as {brand.*} (src/core/brandKit.ts) */
    production?: string;
    /** M-53 — which agent fills each role its steps name; an open role goes to the showrunner */
    roles?: RoleMap;
    /** A-27 — the run's hard spend cap in dollars, 0 = none (src/core/runSpendCap.ts) */
    spendCap?: number;
}

/**
 * ‼️ M-18 — A WORKFLOW RUN IS SOMETHING YOU CAN ASK ABOUT.
 *
 * `runWorkflow` used to return `void` and announce its ending in a toast, which
 * is fine for a person watching the window and useless to anything else: a
 * caller could start a chain and had no way to learn its id, whether it
 * finished, where it stopped or what it produced. A mission that wanted to use
 * a workflow as one step therefore could not — the only honest option left was
 * a second workflow engine inside missions, which is the duplication this whole
 * family refuses.
 *
 * So the run has a state, and it is DERIVED from the tasks (which are
 * persisted) rather than stored beside them: a stored status is a second copy
 * of a fact and disagrees with it on the first reload. Only the *reason* a run
 * ended early is remembered, because that is the one thing the tasks cannot
 * say — a chain stopped by the loop guard and one that simply ran out of steps
 * leave the same rows behind.
 */
export type WorkflowRunStatus = 'running' | 'done' | 'failed' | 'stopped';

export interface WorkflowRunStep {
    index: number;
    title: string;
    agentName: string;
    status: TaskStatus;
    taskId: string;
    outputFile?: string;
    costUSD?: number;
    tokens?: number;
}

export interface WorkflowRunState {
    runId: string;
    workflowId: string;
    title: string;
    status: WorkflowRunStatus;
    startedAt?: number;
    endedAt?: number;
    /** why it ended other than by reaching the end — loop guard, a failed step */
    reason?: string;
    /** 0-based step it stopped at, when it stopped short */
    stoppedAtStep?: number;
    /** ‼️ the run's RESULT: what the last completed step handed on. A parent
     *  reads a workflow through this and through nothing else. */
    handoff?: Handoff;
    /** M-39 — every finished step of the run by its stable id, and what it produced */
    board?: RunBoard;
    /** M-40 — a for-each step in flight: its branches counted, and the policy it runs under */
    forEach?: Record<string, unknown>;
    /** X-420 — what its airtable inputs found before step 1, one line each */
    airtable?: string[];
    /** X-423 — what the run's end did in the library: promotions, and each record's enrichment or why it failed */
    libraryEnd?: string[];
    /** A-27 — the hard spend cap the run runs under */
    spendCap?: SpendCap;
    /** A-27 — the judge ladder the run was started with */
    judgeLadder?: string;
    /** A-27 — what its checks decided and saved: climbs, retries withheld, estimated $ */
    economy?: RunEconomy;
    steps: WorkflowRunStep[];
    /** every task of this run, added up once — the parent's budget roll-up */
    costUSD: number;
    tokens: number;
}

export function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** J5 — a non-claude executor: command templates with {prompt} and {args}. */
export interface CliProfile {
    name: string;
    /** e.g. `gemini -p "{prompt}"` */
    headless: string;
    /** e.g. `gemini "{prompt}"`; falls back to headless */
    interactive?: string;
}

export function buildCliCommand(template: string, prompt: string, args: string): string {
    return template
        .split('{prompt}').join(sanitizePrompt(prompt))
        .split('{args}').join(args.trim())
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** The day-key of the last scheduled occurrence strictly before today (daily:
 *  yesterday; weekly: the previous matching weekday). Stamped as lastRunKey
 *  when a catch-up policy is configured so the past counts as settled — only
 *  occurrences missed AFTER that point are caught up. */
export function previousOccurrenceKey(s: Pick<FarmSchedule, 'kind' | 'dow'>, now: Date): string {
    const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    do { prev.setDate(prev.getDate() - 1); }
    while (s.kind === 'weekly' && prev.getDay() !== s.dow);
    return `${prev.getFullYear()}-${prev.getMonth() + 1}-${prev.getDate()}`;
}

/**
 * ‼️ M-21 — THE STAMP THAT MEANS "AN EDIT IS NOT A FIRING".
 *
 * `scheduleDue` decides entirely on `lastRunKey`, so whatever an edit leaves in
 * that field decides whether pressing Save starts an agent. Clearing it — which
 * the Tasks page did on EVERY save, whether or not the time had changed — makes
 * BOTH of that function's branches say yes: past the time today, today's
 * occurrence looks unhandled; before it, a catch-up policy looks at yesterday
 * and finds nothing there either. Measured on the user's own 05:00 daily backup:
 * they changed only the engine, just before midnight, and it ran there and then,
 * every single time they saved.
 *
 * The rule is the one they stated: **an edit takes effect at the NEXT
 * occurrence and never at the moment of saving.** So a save settles whichever
 * occurrence is already behind the schedule's (possibly new) time — the same
 * two branches `scheduleDue` reads, in the same order, so the two cannot drift.
 *
 * `once` is not settled here: it has no recurring occurrence to be behind, and
 * a `once` whose appointment the user moved is a new appointment.
 */
export function settledKeyAfterEdit(
    s: Pick<FarmSchedule, 'kind' | 'dow' | 'hour' | 'minute'>, now: Date
): string {
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const runDay = s.kind !== 'weekly' || now.getDay() === s.dow;
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (runDay && minutes >= s.hour * 60 + s.minute) { return dayKey; }
    return previousOccurrenceKey(s, now);
}

/** Validate the content of a seed-schedules.json (external one-shot schedule
 *  seeding — see applySeedFile). Bad entries are dropped, sane defaults fill
 *  the gaps. Exported pure for tests. */
export function parseSeedSchedules(text: string): Omit<FarmSchedule, 'id'>[] {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return []; }
    if (!Array.isArray(parsed)) { return []; }
    const out: Omit<FarmSchedule, 'id'>[] = [];
    for (const raw of parsed) {
        if (!raw || typeof raw !== 'object') { continue; }
        const o = raw as Record<string, unknown>;
        if (typeof o.title !== 'string' || !o.title.trim()) { continue; }
        if (typeof o.prompt !== 'string' || !o.prompt.trim()) { continue; }
        if (typeof o.agentId !== 'string' || !o.agentId) { continue; }
        const kind: ScheduleKind = o.kind === 'weekly' || o.kind === 'once' ? o.kind : 'daily';
        const int = (v: unknown, lo: number, hi: number, def: number) => {
            const n = typeof v === 'number' ? Math.floor(v) : NaN;
            return isFinite(n) && n >= lo && n <= hi ? n : def;
        };
        // ‼️ X-264: the moment a `once` schedule fires is WRITTEN as
        // "YYYY-MM-DD HH:MM" everywhere it is offered — the bridge contract,
        // schedules.edit, the command bar — and this parser used to take only a
        // number, so the documented form landed here and was dropped on the
        // floor. What survived was a once schedule that was enabled, listed,
        // and could never be due: a rule that fails silently is not a rule.
        // A moment nobody can read stays undefined so the caller can REFUSE it;
        // it is never rounded into "no time at all" on a schedule that is kept.
        const moment = (v: unknown): number | undefined => {
            if (typeof v === 'number') { return isFinite(v) ? v : undefined; }
            if (typeof v !== 'string' || !v.trim()) { return undefined; }
            const s = v.trim();
            const t = /^\d+$/.test(s) ? Number(s) : Date.parse(s.replace(' ', 'T'));
            return isFinite(t) ? t : undefined;
        };
        out.push({
            agentId: o.agentId,
            agentName: typeof o.agentName === 'string' ? o.agentName : '',
            title: o.title.trim(),
            prompt: o.prompt,
            mode: o.mode === 'interactive' ? 'interactive' : 'headless',
            kind,
            hour: int(o.hour, 0, 23, 9),
            minute: int(o.minute, 0, 59, 0),
            dow: kind === 'weekly' ? int(o.dow, 0, 6, 1) : undefined,
            onceAt: kind === 'once' ? moment(o.onceAt) : undefined,
            enabled: o.enabled !== false,
            missed: o.missed === 'run' || o.missed === 'ask' || o.missed === 'skip' ? o.missed : undefined,
            lastRunKey: typeof o.lastRunKey === 'string' ? o.lastRunKey : undefined
        });
    }
    return out;
}

/** Pure due-check so the scheduler is testable. `missedKey`/`missedAt` mark a
 *  scheduled occurrence from a previous day that never ran (no VS Code window
 *  was open at the time) and the schedule's missed-policy wants handled:
 *  policy 'run' also sets due (fires with runKey = the missed key), policy
 *  'ask' leaves due false — the scheduler offers it with Run/Skip buttons. */
export function scheduleDue(
    s: FarmSchedule, now: Date
): { due: boolean; runKey: string; missedKey?: string; missedAt?: number } {
    if (!s.enabled) { return { due: false, runKey: '' }; }
    if (s.kind === 'once') {
        return {
            due: !!s.onceAt && now.getTime() >= s.onceAt && s.lastRunKey !== 'once',
            runKey: 'once'
        };
    }
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const target = s.hour * 60 + s.minute;
    const runDay = s.kind !== 'weekly' || now.getDay() === s.dow;
    if (runDay && minutes >= target) {
        // the scheduled day itself — fires on time, or late the same day
        return { due: s.lastRunKey !== dayKey, runKey: dayKey };
    }
    if (s.missed === 'run' || s.missed === 'ask') {
        const prevKey = previousOccurrenceKey(s, now);
        if (s.lastRunKey !== prevKey) {
            const [y, m, d] = prevKey.split('-').map(Number);
            const missedAt = new Date(y, m - 1, d, s.hour, s.minute).getTime();
            return { due: s.missed === 'run', runKey: prevKey, missedKey: prevKey, missedAt };
        }
    }
    return { due: false, runKey: dayKey };
}

export { extractJson, sanitizePrompt, tryParseJson } from './util';

/** Placeholder in workflow step prompts replaced with the previous step's output file path. */
export const PREV_OUTPUT_PLACEHOLDER = '{prev_output}';

/**
 * The model's actual output from an archived task file — strips the metadata
 * header (which contains the task title and prompt) and the Finished footer,
 * so runIf conditions can't be triggered by workflow names or prompt text.
 */
export function archivedOutputBody(content: string): string {
    const start = content.indexOf('\n---\n');
    let body = start >= 0 ? content.slice(start + 5) : content;
    const foot = body.lastIndexOf('\n---\nFinished:');
    if (foot >= 0) { body = body.slice(0, foot); }
    return body;
}

/**
 * ‼️ WHAT THE AGENT ACTUALLY SAID — not what its CLI printed. KEYED ON THE
 * ENGINE, never sniffed out of the content.
 *
 * `archivedOutputBody` strips OUR header and footer; what is left is whatever
 * the engine wrote to stdout, and on two engines that is not prose. A headless
 * OpenCode turn runs `run --format json`, so its archive is a JSONL event
 * stream (`step_start`, `text`, `tool_use`, `step_finish`); Antigravity prints
 * one envelope whose answer is `response`. M-14 found both by handing a
 * workflow's second step the first one's wall of envelopes.
 *
 * ‼️ The same fault was measured again on a REAL M-19 run: a speaking turn's
 * message text is this body, so the next speaker was going to be shown 4 KB of
 * OpenCode transport as "what the other agent said" — and the same body is the
 * material a `review`, `compare` or `revise` delegate is handed. A record that
 * reads like a discussion and contains an event stream is the M-19 failure
 * wearing a different coat. So the unwrapping lives HERE, once, rather than
 * beside each caller: a second copy is how the next surface gets it wrong.
 *
 * The engine decides, because a bare `response` field in somebody's own output
 * contract is their data and not a wrapper for us to unwrap. `undefined` means
 * "this engine's shape was recognised and carried no prose" — the caller's own
 * rule about an empty answer is then the one that should fire, which is not the
 * same thing as showing the reader a transport envelope.
 */
export function engineReplyText(body: string, engine?: string): string | undefined {
    const id = engineOf(engine).id;
    if (id === 'opencode') {
        const run = readOpencodeRun(body);
        // Nothing parsed at ALL is not an empty answer, it is not this shape —
        // a spawn error or a plugin banner can be the only thing in the archive
        // and the reader must see it rather than be told nothing was said.
        if (!run.steps.length && !run.text) { return body; }
        return run.text.trim() || undefined;
    }
    if (id === 'agy') {
        const env = extractJson(body) as { response?: unknown } | undefined;
        if (env && typeof env.response === 'string' && env.response.trim()) { return env.response.trim(); }
        return body;
    }
    return body;
}

/** One archive, read as what the agent said. Empty when it said nothing. */
export function archivedReplyText(content: string, engine?: string): string {
    return engineReplyText(archivedOutputBody(content), engine) ?? '';
}

const MAX_TASKS = 300;

interface StoreShape {
    tasks: FarmTask[];
    schedules: FarmSchedule[];
    templates: FarmTemplate[];
    workflows: FarmWorkflow[];
    triggers: FarmTrigger[];
    /** farm-wide master switch / quiet hours (see core/automation.ts) */
    automation?: AutomationState;
    /** rolling fired/skipped decision log — the evidence that the gate works */
    automationLog?: AutomationEvent[];
    /** ‼️ M-8 (V3) — archive tombstones a write could not put down yet, retried
     *  on the pump's beat. Persisted because the failure it repairs is the disk
     *  refusing writes, and a restart is often what clears it. */
    archiveRepair?: { id: string; month: string }[];
    /** ‼️ X-71/X-73 — the runs themselves (see `WorkflowRunRecord`). */
    workflowRuns?: Record<string, WorkflowRunRecord>;
    /** ‼️ X-176 — the sentry campaign, which is the one part of it that has to
     *  outlive a window: a campaign held in memory would be silently switched
     *  off by every reload, in the middle of the night nobody is watching. */
    sentry?: SentryRecord;
}

/**
 * ‼️ X-71/X-73 — THE RUN ITSELF, AS A RECORD.
 *
 * A workflow run used to exist only as a property of its task rows, plus two
 * in-memory memos beside them. That works right up to the moment there are no
 * rows — a chain whose every step was skipped by `runIf`, or one whose first
 * step names an agent that is gone — and then the run is simply unanswerable:
 * `undefined`, which a parent mission reads as "still working" and polls for
 * ever. And the memos died with the window, so after a reload a stopped chain
 * and a chain waiting for its next step looked identical.
 *
 * One record, written when the run starts and kept: what it is, when it began,
 * whose work it is, and — once there is one — how it ended. The task rows are
 * still what says whether it is running NOW; this says everything they cannot.
 */
/** How a workflow run is started: its project, and (M-38) the input values it is given. */
/** M-45 — the supervisor woken after a step: which conditions fired, and the path "proceed" stands for */
interface WakeCall {
    fired: string[]; said: string; from: string; after: TaskStatus;
    /** the mechanical path in words, for the supervisor's brief */
    plan: string;
    mechanical: () => void;
}

export interface WorkflowRunOpts {
    projectId?: string | null;
    inputs?: Record<string, unknown>;
    /** who gave the values — a trigger's are named as such in the run's origin */
    inputSource?: 'run' | 'trigger';
    /** M-45 — this run's own wake conditions, above the workflow's and its steps' */
    wake?: WakeSpec;
    /** M-50 — this run's production for {brand.*}, above the workflow's and a media step's own */
    production?: string;
    /** M-53 — this run's own agent for a role, above the workflow's binding and the showrunner */
    roles?: RoleMap;
    /** A-27 — this run's own hard spend cap, above the workflow's and Farm Settings' */
    spendCap?: number;
    /** A-27 — this run's judge ladder ("haiku,sonnet"), above Farm Settings' */
    judgeLadder?: string;
}

interface WorkflowRunRecord {
    workflowId: string;
    title: string;
    startedAt: number;
    /** ‼️ X-73 — a project id · `null` for an explicit "no project". */
    project: string | null;
    /** ‼️ X-71 — the terminal the rows alone cannot state: the loop guard, a
     *  chain that reached its end, a first step whose agent was gone. Cleared
     *  when the run is resumed, because a resumed run has not ended. */
    ended?: { status: WorkflowRunStatus; reason?: string; stepIndex?: number; at: number };
    /** M-38 — the input values the run started with; persisted so {input.x} survives a reload */
    inputs?: Record<string, string>;
    /** M-39 — every finished step, by its stable id; persisted so a resumed run still reads it */
    board?: RunBoard;
    /** M-40 — a for-each step in flight; persisted so a resume re-runs only unfinished branches */
    forEach?: FE.ForEachRun;
    /** X-418 — every file the run filed or read, where it is now and its record (src/core/runLibrary.ts) */
    library?: LedgerEntry[];
    /** X-420 — what its airtable inputs found, one line each; present = looked up */
    airtable?: string[];
    /** X-423 — the run's end in the library, one line each (promotions, enrichment) */
    libraryEnd?: string[];
    /** X-420 — the database its airtable inputs read: agent steps are told to look there first */
    airtableBase?: string;
    /** M-43 — the run's own copy of the chain: the supervisor's patches and inserted steps */
    edits?: RunEdits;
    /** M-43 — the supervisor's decisions so far (`<decision>:<target>`), retries per step, the person's answers */
    supervisor?: SupervisorState;
    /** M-45 — the wake conditions the run was started with */
    wake?: WakeSpec;
    /** M-50 — the production the run was started with, for {brand.*} */
    production?: string;
    /** M-53 — the roles the run was started with */
    roles?: RoleMap;
    /** A-27 — the hard spend cap in force for this run and where it came from */
    spendCap?: SpendCap;
    /** A-27 — the judge ladder the run was started with */
    judgeLadder?: string;
    /** M-46 — what a person set while it ran: words for its supervisor, live settings (src/core/workflowLive.ts) */
    live?: RunLive;
    /** M-46 — the finished step's row the run is held after, when it was paused at a boundary */
    pausedTask?: string;
}

export interface TaskManagerOptions {
    /** M-43 — a question with options put to a person; undefined = not answered */
    askChoice?: (question: string, options: string[], ctx?: { runId: string; workflowTitle: string }) => Promise<string | undefined>;
    /** M-43 — replaces the checkpoint's one-shot supervisor call (tests) */
    superviseTurn?: (prompt: string, tier: 0 | 1) => Promise<{ out: string; error?: string; model?: string }>;
    /** M-50 — a production's brand kit by its id; undefined = no such production or no kit */
    productionBrand?: (id: string) => BrandKit | undefined;
    /** M-49 — the Farm Settings layer of tool.outDir / tool.overwrite, as the user wrote it (undefined = untouched) */
    toolSettings?: () => { outDir?: unknown; overwrite?: unknown };
    /** X-418 — files every produced file into the local Airtable's media library and records it; unset = files stay where they are made */
    mediaLibrary?: { recorder: MediaRecorder; module: () => ModuleView; enrich?: EnrichHook };
    /** X-420 — looks up a run's airtable inputs before its first step (src/core/airtableInput.ts lookupInputs) */
    airtableInputs?: (inputs: WorkflowInput[], given: Record<string, string>) => Promise<{ values: Record<string, string>; lines: string[]; error?: string; base?: string }>;
    /** M-49 — replaces the ffmpeg runner (tests) */
    runTool?: (c: RecipeCall) => Promise<ToolResult>;
    /** M-44 — replaces the supervisor session's real spawn (tests) */
    supervisorSession?: SessionCall;
    /** CLI args for internal judge calls — always a cheap model. */
    judgeArgs?: () => string;
    /** M-42 — what a step no judge could look at does: ask (default) · pass · stop (`agentFarm.judgeUnjudged`) */
    judgeUnjudged?: () => string;
    /** M-62 — auto: an edit's vision judge also sees its source · never (`agentFarm.judgeCompare`) */
    judgeCompare?: () => string;
    /** M-39 — how much of the previous step's text {prev_text} carries (`agentFarm.workflowPrevTextChars`, default 1500) */
    prevTextChars?: () => number;
    /** ‼️ M-3 — the user's DEFAULT retry policy (`agentFarm.taskRetry`), used by
     *  every run that does not state one of its own. Read through a function
     *  because it is a setting: a window that has been open for a week must
     *  honour what was changed on Tuesday. U-151: asked FOR a task, so the
     *  task's agent and project values (agentFarm.flexOverrides) are laid over it. */
    defaultRetry?: (t?: FarmTask) => RetryPolicy | undefined;
    /**
     * ‼️ M-10 — WHEN THIS ENGINE'S USAGE WINDOW REOPENS, epoch ms, from the
     * engine's OWN published data rather than from its printed prose. It is the
     * highest-priority source for a reset-aware first retry; undefined simply
     * means "nothing published", and the decision falls to the output and then
     * to the ordinary interval, saying which on the run's record.
     */
    limitResetAt?: (engine?: string) => number | undefined;
    /** ‼️ M-13 — whether the supervisor's own limit has room now; absent/unknown is never read as room */
    supervisorRoom?: (p: SupervisorPolicy) => SupervisorRoom;
    /**
     * ‼️ S-64 — DID THIS RUN'S WINDOW REACH THE HANDOVER LINE? Asked of the
     * context guard, which is the only thing that knows: it read the fill and
     * it sent the sentence. Smart continue resumes an interrupted run's own
     * conversation, and the one run it must never resume is the saturated one —
     * the law sends the next run into a FRESH session that starts from the note.
     * Undefined is "the guard said nothing", which is never "it had room".
     */
    handoverOf?: (sessionId: string) => HandoverEvidence | undefined;
    /**
     * ‼️ X-226 — THE ACCOUNTS THIS MACHINE HAS MEASURED, so a walled run can be
     * handed to one that still has room instead of sleeping until a reset.
     *
     * Read through a function and never held: the figures age, slots are
     * captured and forgotten while a window stays open, and a list snapshotted
     * at construction would send tonight's work to an account the user removed
     * on Tuesday. The manager still owns no account READING — this hands it the
     * measurements and `carryOnAccount` makes the decision (see
     * `maybeScheduleRetry`). Undefined = nothing captured, which is the main
     * sign-in (X-172) and behaves exactly as it did before this existed.
     */
    measuredAccounts?: () => SlotUsage[];
    /** X-471 — the wall a run carried to another account starts under: the host's accountCeiling (startRoom.ts startWall), given a wall the run names for itself */
    accountWall: (own?: { value: unknown; why: string }) => StartWall;
    /**
     * X-473 — THE LAST LINE: a row with an `accountPool` is asked again at its start (startRoom against the
     * Account ceiling, or its campaign's wall). An answer moves the row back to its pool, with the reason;
     * undefined = the slot still has room. The launch then picks from the pool, or the pool's own hold parks it.
     */
    replaceAccount?: (task: FarmTask) => { account: string; why: string } | undefined;
    /**
     * ‼️ X-226 (round 2) — resolves a retry policy's `carryOn` when it names a
     * rule (`@emptiest`, `@round-robin`, `@<named>`) over the OTHER accounts of
     * the engine — the host's `resolvePolicy`, so a handover moves the same
     * round-robin cursor a launch does. A named slot needs no resolver.
     */
    resolveCarryOn?: (policyId: string, engine: string, agentId: string, pool: SlotUsage[])
        => { id: string; note?: string; refusal?: string };
    /**
     * ‼️ S-19 — IS SOMETHING ELSE WRITING TO THAT CONVERSATION RIGHT NOW?
     *
     * Return a sentence naming the holder, or undefined when the session is
     * free. Two processes appending to one transcript is not a race that
     * resolves badly — it is a conversation with two authors, and neither of
     * them can see what the other wrote. So a resumed task whose session is
     * held PARKS, visibly, with the holder in the reason, and the pump launches
     * it the moment the session is released.
     */
    sessionBusy?: (sessionId: string, engine?: string) => string | undefined;
    /**
     * ‼️ X-296 / X-260 — WHY THIS RUN MAY NOT SPEND THE SIGN-IN IT NAMES, in the
     * words `accountStore.accountRefusal` gives, or nothing when it may.
     *
     * The service already refuses one (`headlessAccountPlan`): "a name that
     * resolves to nothing REFUSES the run rather than falling through to the
     * main sign-in… at 3 a.m. with nobody watching it is worse, not better."
     * The extension's own runner did fall through — `accountEnv` answers `{}`
     * for a slot it cannot find, and `{}` is the machine's own sign-in — so the
     * SAME task ran on the named plan or on whatever was signed in depending on
     * whether a window happened to be open. This is that decision, asked on the
     * side that owns the slot list, so the two runners cannot disagree.
     */
    accountBlock?: (engine: string, account?: string, agentId?: string) => string | undefined;
    /** ‼️ S-19 — what a session has cost and spent so far, for the delta a
     *  resumed run is charged. Undefined = not indexed yet, and the task simply
     *  starts from nothing rather than from a guess. */
    sessionUsage?: (sessionId: string, engine?: string) => { cost: number; tokens: number } | undefined;
    /**
     * ‼️ X-176 — DRIVE THE SENTRY CAMPAIGN ONE STEP.
     *
     * The manager owns the record, the rows and the pump; it owns none of the
     * MEASURING (an answers folder in a vault, a git status, a project's track
     * ledger, a backlog file) and none of the account reading. So the step
     * itself is the host's, and it is called from exactly two places: a round
     * of the campaign has ended, or the pump found the campaign due
     * (`sentryDue`). There is no timer of the sentry's own — that is the
     * item's own condition.
     *
     * `task` is the round that just ended, or undefined for a pump tick.
     */
    /**
     * ‼️ X-191 MADE THIS ASYNC, and the two call sites below had to change
     * with it. The tick may now run one bounded leader turn, which is a child
     * process; a rejected promise walks straight past a `try`/`catch` around a
     * synchronous call and becomes an unhandled rejection that takes the
     * extension host with it. The campaign is not worth a crash — so the
     * result is settled, and swallowed, at the call site.
     */
    sentryTick?: (task?: FarmTask) => void | Promise<void>;
    /** How often an idling campaign looks again (`agentFarm.sentryIdlePollMin`). */
    sentryPollMin?: () => number;
    /** X-178 — how long a round may say nothing before the watchdog ends it
     *  (`agentFarm.sentryStallMin`; 0 switches it off). */
    sentryStallMin?: () => number;
    maxConcurrent?: () => number;
    maxConcurrentPerAgent?: () => number;
    /** Return a reason to defer auto work (e.g. quota window nearly full), or
     *  undefined. ‼️ M-11 — a `{code, reason}` pair is preferred over a bare
     *  string: the code is what dedupes a park, the sentence is what is read. */
    quotaCheck?: (task: FarmTask) => BlockAnswer;
    outputsMaxMB?: () => number;
    /** Secrets injected as environment variables into spawned tasks. The
     *  agent id lets the vault withhold secrets scoped to other agents. */
    getEnv?: (agentId?: string) => Record<string, string>;
    /**
     * X-101 — the provider runtime this launch resolved to, asked of the shared
     * registry (`core/providerRegistry.ts`) by whoever owns the profiles and the
     * keychain.
     *
     * ‼️ IT ARRIVES AS AN ANSWER, NOT AS INGREDIENTS. A runner that read the
     * profiles and the vault itself would be a second implementation of the
     * resolution rules living in a file nobody thinks of as provider logic —
     * which is the exact shape of the bug X-98 measured. Absent means "no route
     * chosen", and then nothing is cleared and nothing is injected: four of the
     * five engines are in that state permanently and must stay byte-for-byte
     * what they were.
     */
    engineRuntime?: (
        agentId: string, engine: string,
        /**
         * ‼️ X-103 — THE ROUTE THIS RUN CHOSE, when one was chosen. A headless
         * task has no picker of its own yet — carrying a provider selection on a
         * stored automation object is X-106's item — so the runner passes
         * nothing and the agent's standing route applies, which is what every
         * task written before this said. The parameter exists so the day that
         * item lands there is one resolver rather than a second one built beside
         * this signature.
         */
        route?: { providerId?: string; tier?: string; pinned?: boolean }
    ) => { spawnEnv?: Record<string, string>; clearEnv?: string[] } | undefined;
    /**
     * ‼️ X-109 — WHICH ROUTE A TASK THAT CONTINUES A CONVERSATION RUNS ON,
     * as an ANSWER from the side that holds the launch manifests and the
     * adapters: the conversation's own route pinned, a different sealed
     * route refused or allowed by the adapter, and nothing pinned where
     * nothing was recorded. `route` is the task's own (sealed) route — a
     * deliberate ask; absent means none was named.
     */
    resumeRoute?: (
        agentId: string, engine: string, sessionId: string,
        route: { providerId?: string; tier?: string } | undefined
    ) => ResumeRoute;
    /**
     * ‼️ S-109 — WHAT THE CONVERSATION A TASK CONTINUES CLOSED WITH (model,
     * effort, permission mode), from the one reopen answer. Not the account:
     * a task's sign-in follows its own policy, whose limit retries move it on
     * purpose. `launch` is what that conversation was STARTED with: a row
     * still holding exactly that (or nothing) merely copied it, so the closing
     * value replaces it; a row that differs was edited on purpose and wins.
     */
    reopenSetup?: (sessionId: string, engine: string, agentName: string) => ClosingAnswer;
    /**
     * ‼️ X-116 — WHY THIS ROUTE CANNOT BE RUN ON NOW, or nothing when it can:
     * the same rule that refuses writing it onto a task, asked again at the
     * spawn, because a route can be removed while the task waits.
     */
    routeRefusal?: (engine: string, providerId: string, tier: string) => string | undefined;
    /**
     * ‼️ X-106 — WHAT THAT ROUTE RESOLVES TO RIGHT NOW, as a redacted answer.
     *
     * Same doctrine as `engineRuntime` above: it arrives as an ANSWER, from the
     * side that owns the profiles and the keychain. Asked TWICE and by the same
     * symbol — once when the task is queued (`addTask` seals it) and once at the
     * spawn (`startTask` compares) — because the whole value of the seal is that
     * both readings come out of one resolver. Two resolvers would report drift
     * whenever they disagreed with each other rather than when the route moved.
     *
     * Absent (the headless service, a test harness) means nothing is sealed, and
     * a task with no seal is a run whose route history is genuinely unknown —
     * which is the honest answer and reads exactly as every task written before
     * this item does.
     */
    sealRoute?: (
        agentId: string, engine: string, route: { providerId?: string; tier?: string }
    ) => RouteSeal | undefined;
    /**
     * ‼️ X-169 — WHICH SIGN-IN THIS RUN GETS, as the environment it takes.
     *
     * Same doctrine as `engineRuntime` above and for the same reason: the slot
     * list and the "use this next" map are settings, and the VARIABLE'S NAME
     * belongs to the engine's own adapter (`engineAccounts.accountEnv`). A
     * runner that spelt `CLAUDE_CONFIG_DIR` would be a runner that works on one
     * engine while looking general.
     *
     * Absent, or an empty map, is the main sign-in — byte for byte what every
     * task ran as before this item.
     */
    accountLayer?: (
        engine: string, account?: string, agentId?: string
    ) => Record<string, string | null> | undefined;
    /**
     * ‼️ X-102 — WRITE THIS SPAWN'S MANIFEST AND HAND BACK ITS ID.
     *
     * Same doctrine as `engineRuntime` above: it arrives as an ANSWER. The
     * runner states the plain facts of the run it is about to start — who, on
     * what, asking for what, where, and what set it going — and the resolution
     * of the route, the assembly of the record and the bounded store all stay on
     * the side that owns them. A runner that built the manifest itself would be
     * a second resolver of the same route, living in a file nobody thinks of as
     * provider logic.
     *
     * Absent (the headless service, a test harness) means nothing is recorded,
     * and a task with no `launchId` is a run whose setup is genuinely unknown —
     * which is the honest answer, not a defect to paper over.
     */
    recordLaunch?: (run: {
        agentId: string; engine: string;
        // ‼️ X-296 — THE WHOLE SHAPE, because a narrower one here is what let
        // four dimensions go unrecorded: every field is optional, so the three
        // named before this type-checked happily against a task that had eight.
        options: LaunchOptions;
        cwd: string; projectId?: string;
        mechanism: 'task' | 'schedule' | 'trigger' | 'workflow' | 'mission';
        mechanismId?: string;
        surface: 'terminal' | 'external-terminal' | 'headless';
    }) => string | undefined;
    /** {secret:NAME} substitution for webhook templates. */
    resolveTemplate?: (s: string) => string;
    /** Outbound notification forwarding (B4). */
    forward?: (type: string, message: string) => void;
    /** C1: media provider settings. providerId = 'fal' | 'replicate' (Wave C). */
    mediaAuth?: (providerId: string) => string;              // full Authorization header, e.g. "Key <FAL_KEY>" / "Bearer <token>"
    mediaBaseUrl?: (providerId: string) => string | undefined; // override for tests / self-hosted proxies
    mediaPricing?: () => MediaPriceRule[]; // C3 cost estimation rules
    /** M-53 — the agent every role a workflow leaves open goes to (agentFarm.showrunner) */
    showrunner?: () => string;
    /** A-27 — Farm Settings' hard spend cap per workflow run (agentFarm.workflowSpendCap) */
    spendCapSetting?: () => unknown;
    /** A-27 — Farm Settings' judge ladder (agentFarm.judgeLadder) */
    judgeLadderSetting?: () => unknown;
    /** F2: media poll interval override (tests); undefined = provider default (3s). */
    mediaPollMs?: () => number;
    /**
     * ‼️ M-26 — HAND AN INTERACTIVE TASK TO THE CONSOLE.
     *
     * Injected rather than imported: this module knows how to decide WHAT to
     * run and must not learn how to open a panel — the Console owns its own
     * process, its own engine refusals and its own composer. Returns the hosted
     * session's id, or undefined when the panel refused (an engine that is not
     * on this machine), which is a failed run with a reason and never a task
     * left standing.
     *
     * ‼️ X-327 — AND THE MANIFEST IT WROTE, because that door writes it. The
     * mechanism travels IN (a run set going by a schedule is a schedule's run
     * wherever it is hosted) and the `launchId` comes back OUT, so the task
     * carries the same link to its record every other shape carries.
     */
    startConsoleTask?: (spec: {
        task: FarmTask; agentId: string; agentName: string; cwd: string; prompt: string;
        mechanism: 'task' | 'schedule' | 'trigger' | 'workflow' | 'mission';
        mechanismId?: string;
    }) => { sessionId: string; launchId?: string } | undefined;
    /**
     * ‼️ M-26 — WHAT THAT HOSTED CONVERSATION IS DOING NOW. The panel's own
     * report, read back against the task. `answered` is the fact `auto-close`
     * turns on: the agent has finished a turn in this session, as opposed to the
     * session merely sitting idle because nothing has been said to it yet.
     */
    consoleTaskState?: (sessionId: string) => {
        /** `gone` — the Console no longer holds the card: somebody removed it */
        state: 'starting' | 'working' | 'idle' | 'ended' | 'error' | 'gone';
        answered: boolean; failed?: boolean; reason?: string;
        /** S-85 — the engine's session id, once the card has one */
        sessionId?: string;
    } | undefined;
    /** I5: model policy — extra --model args (and reason) for a task launch. */
    modelArgsFor?: (task: FarmTask) => { args: string; reason: string } | undefined;
    /**
     * The project context file for a task, written fresh at launch time from the
     * project the task was CREATED under (`task.projectId`). Undefined = no
     * project, and then no flag is added at all: a session with no project must
     * look exactly as it did before this existed.
     *
     * ‼️ X-267 — …EXCEPT ON A ROUND, which is a `--resume` of the conversation
     * the previous round spoke in. There the caller answers with that
     * conversation's PINNED context (it reads `task.resumeSessionId`), because a
     * regenerated one is a CHANGED system prompt and pays for the whole thread
     * again as cache creation — see `core/projectContext.ts`.
     */
    projectContextFile?: (task: FarmTask) => string | undefined;
    /**
     * ‼️ X-267 — file the bytes this run really sent under the conversation it
     * turned out to open, so its next round can be given them unchanged. Called
     * once per run, at the moment the transcript binding names the session
     * (`setRunProgress`).
     */
    pinProjectContext?: (sessionId: string, file: string) => void;
    /** The window's active project, read when a task is CREATED (see addTask). */
    activeProjectId?: () => string | undefined;
    /** J5: alternative CLI profiles ({prompt}/{args} templates). */
    cliProfiles?: () => CliProfile[];
    /**
     * ‼️ CAN THIS MACHINE RUN THAT ENGINE — asked BEFORE the spawn (X-18).
     *
     * Returns the refusal sentence, or undefined. Injected rather than computed
     * here for the reason this whole module is pure-ish: the answer needs PATH,
     * the home directory and the secret vault, and none of those belong to a
     * task store. A task queued last week on an engine that has since been
     * uninstalled fails HERE, with the one line that fixes it, instead of
     * producing an output file containing a shell's "command not found".
     */
    engineRefusal?: (engine: string | undefined) => string | undefined;
    /** X-330 — the variants an OpenCode model publishes; undefined = the catalog does not know it. */
    opencodeVariants?: (model: string) => string[] | undefined;
    /** F3: global browser-step allowlist + per-step approval gate. */
    browserAllowHosts?: () => string[];
    /** M-54 — Farm Settings' browserApproval (ask · auto); a step's own `confirm` wins */
    browserApproval?: () => string;
    /** M-54 — where each recipe's persistent browser profile lives */
    browserProfilesDir?: () => string;
    /** Resolve to true to run the browser step; false cancels it. */
    confirmBrowser?: (info: { title: string; url: string; goal: string }) => Promise<boolean>;
    /** M-41 — Farm Settings for local files in a media input: ask · auto · never, which provider, how long it is kept */
    mediaUpload?: () => { mode?: unknown; provider?: unknown; retentionDays?: unknown };
    /** M-41 — a person agrees to send these files to the provider (the `ask` answer) */
    confirmUpload?: (paths: string[], provider: string) => Promise<boolean>;
    /** M-41 — the upload endpoint override, for tests and self-hosted proxies */
    mediaUploadBaseUrl?: (provider: string) => string | undefined;
    /** Human-in-the-loop workflow gate; resolve true to continue the chain, false to fail the step. */
    confirmApproval?: (info: { title: string; message: string }) => Promise<boolean>;
    /** M-51 — Farm Settings' publishApproval (ask · auto · never); a step's own wins */
    publishApproval?: () => string;
    /** M-51 — the content calendar's folder */
    contentCalendarDir?: () => string;
    /** M-51 — a publish's result on its media record; answers one line for the step's archive */
    recordPublished?: (r: { id: string; platform: string; status: string; url?: string; at: string }) => Promise<string>;
    /** M-52 — Farm Settings' metricsFields; a step's own wins */
    metricsFields?: () => string[];
    /** M-60 — agentFarm.kapici.workflow; undefined when off */
    kapiciStep?: () => KapiciStepHook | undefined;
    /** M-52 — a publish's numbers on its media record; answers one line for the archive and the record's topic */
    recordMetrics?: (id: string, m: Metrics) => Promise<{ line: string; topic?: string }>;
    /** M-52 — where the performance snapshot lives */
    performanceFile?: () => string;
    /** M-52 — the "how similar published content performed" block for a query; '' = none or turned off */
    performance?: (query: string) => string;
    /**
     * Wave B — visual selection gate. Resolve with the chosen asset URLs (the
     * subset kept), or null to cancel (the step's onFail policy applies).
     */
    confirmSelection?: (info: {
        title: string; message: string; min: number; max?: number;
        candidates: { taskId: string; title: string; url: string; file?: string; kind: string }[];
    }) => Promise<string[] | null>;
    /**
     * B11 multi-window safety. false = this window is a read-only FOLLOWER:
     * load() skips the stale pass (it must not cancel the runner window's live
     * rows), the pump/scheduler never launch, media jobs are not reattached,
     * and save() is blocked (onFollowerWrite fires so the host can warn).
     * A follower watches the store file and mirrors the runner's changes.
     * Default: runner (single-window behavior, unchanged).
     */
    isRunner?: () => boolean;
    /** Called when a write was blocked in follower mode. */
    onFollowerWrite?: () => void;
    /**
     * ‼️ M-8 (V2) — THE ARCHIVE AND THE LIVE LIST DISAGREE, AND SOMEBODY IS TOLD.
     * A destructive step whose LAST stage failed leaves the two copies out of
     * step: Undo put the row back but the tombstone that takes it out of the
     * month file could not be appended, so the history still shows a run that
     * is sitting on the board. The run itself is safe — that is why this is a
     * warning and not a throw — but a divergence nobody is told about is the
     * silent failure the whole item is about.
     */
    onArchiveDrift?: (message: string) => void;
    /** Machine roots for portable stores: saved strings carry ${claudeDir} /
     *  ${globalStorage} / ${home} tokens instead of absolute machine paths,
     *  so the git-synced store works on every machine (see portablePaths). */
    portableRoots?: () => PortableRoot[];
    /** Actionable work-queue items, for the `queueHasWork` precondition. */
    queueWorkCount?: () => number;
    /** Today's API-equivalent spend for a budget check: agentName → USD, plus
     *  the fleet total under '*'. Undefined = no budget enforcement. */
    budgetCheck?: (agentName: string) => BlockAnswer;
    /**
     * ‼️ M-7 — PUT SOMETHING ON THE BOARD. The manager decides things nobody is
     * in the room for (a scheduled run held back by a ceiling), and a decision
     * with no reader is the silent failure the constitution forbids. The host
     * wires this to the once-per-key notice path so a 30-second pump cannot
     * repeat itself; the manager never posts twice for the same key either.
     */
    announce?: (n: { key: string; title: string; body: string; level?: 1 | 2 | 3 }) => void;
}

/** The four things the Plan tab lists. They share an id and a title, which is
 *  all a delete has to know about them. */
export type PlanDefinition = FarmSchedule | FarmTrigger | FarmWorkflow | FarmTemplate;

/** A plan row that has been taken out of its list, with the place it came from
 *  so it can go back there. See TaskManager.deletePlanRows. */
export interface DeletedPlanRow {
    kind: 'schedule' | 'trigger' | 'workflow' | 'template';
    /** Its index in that list at the moment it was removed. */
    at: number;
    title: string;
    item: PlanDefinition;
}

function takePlanRow<T extends PlanDefinition>(list: T[], id: string): { at: number; item: T } | undefined {
    const at = list.findIndex(x => x.id === id);
    return at < 0 ? undefined : { at, item: list.splice(at, 1)[0] };
}

function putPlanRow<T extends PlanDefinition>(list: T[], at: number, item: T): number {
    if (list.some(x => x.id === item.id)) { return 0; }
    list.splice(Math.min(Math.max(at, 0), list.length), 0, item);
    return 1;
}

/** M-40 — a for-each branch says which element it is in its row title. */
const branchTag = (h?: Handoff): string => (h?.branch ? ` [${h.branch.index + 1}/${h.branch.count}]` : '');

export class TaskManager implements vscode.Disposable {
    tasks: FarmTask[] = [];
    /**
     * ‼️ X-267 — the context file a RUNNING task's command line carried, waiting
     * for the transcript binding to say which conversation it opened.
     *
     * In memory on purpose: it is only meaningful between a spawn and the
     * binding that follows it minutes later, and a window that restarts in
     * between has no run left to pin for. It costs at most one cache miss on
     * that run's next round, which then pins itself.
     */
    private pinSource = new Map<string, string>();
    schedules: FarmSchedule[] = [];
    templates: FarmTemplate[] = [];
    workflows: FarmWorkflow[] = [];
    triggers: FarmTrigger[] = [];
    automation: AutomationState = {};
    automationLog: AutomationEvent[] = [];
    /** ‼️ X-176 — the sentry campaign the user switched on, or nothing. ONE, by
     *  design: the runner is sequential (see core/sentryCampaign.ts). */
    sentry?: SentryRecord;
    /** ‼️ M-8 (V3) — tombstones that could not be written yet. See
     *  `pumpArchiveRepair`: kept in the STORE because the failure this repairs
     *  is "the disk refused a write", and a memory-only queue would be lost by
     *  the very restart that clears the condition. */
    archiveRepair: { id: string; month: string }[] = [];
    private terminals = new Map<string, vscode.Terminal>();      // taskId -> terminal
    // ‼️ M-26 — the tasks running in a window this extension does not own. Only
    // their ids: everything else about them is on the task itself, and the timer
    // beside this exists only while the set does.
    private externalWatch = new Set<string>();
    private externalTimer?: NodeJS.Timeout;
    private processes = new Map<string, cp.ChildProcess>();      // taskId -> headless process
    /** X-329: tasks whose OpenCode run already had its one start-up-lock retry. */
    private opencodeLockRetried = new Set<string>();
    private handoffs = new Map<string, Handoff>();               // workflowRunId -> last handoff
    // workflowRunId -> the parallel group currently fanning out on that run.
    private parallelGroups = new Map<string, {
        start: number; end: number;
        pending: Set<number>;
        results: Map<number, Handoff>;
        statuses: Map<number, TaskStatus>;
    }>();
    private timer: NodeJS.Timeout;
    // ‼️ M-3 (V3) — see `inOneWrite`: how many nested batches are open, and
    // whether anything inside them asked for a write.
    private saveDepth = 0;
    private saveDirty = false;
    private lastOutputsPrune = 0;
    private disposables: vscode.Disposable[] = [];
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    /** S-108 — steps awaiting a person right now; in memory, since the promise dies with the window */
    private readonly humanAsks = new Map<number, OpenHumanAsk>();
    private humanAskSeq = 0;

    openHumanAsks(): OpenHumanAsk[] {
        return [...this.humanAsks.values()];
    }

    /** Runs a question to a person with the wait written where a reader looks: the row, farm.waits. */
    private async askingHuman<T>(runId: string, workflowTitle: string, task: FarmTask | undefined, ask: HumanAsk, run: () => Promise<T>): Promise<T> {
        const n = ++this.humanAskSeq;
        const what = humanAskSentence(ask);
        this.humanAsks.set(n, { runId, workflowTitle, taskId: task?.id, taskTitle: task?.title, kind: ask.kind, what, since: Date.now() });
        if (task) { task.waitingOn = what; }
        this.save();
        try {
            return await run();
        } finally {
            this.humanAsks.delete(n);
            if (task) { delete task.waitingOn; }
            this.save();
        }
    }

    constructor(
        private storageFile: string,
        private getAgents: () => AgentInfo[],
        private autoAdvance: () => boolean,
        /** Extra CLI args appended to every task's claude command, e.g. "--model haiku". */
        private extraArgs: () => string = () => '',
        // the host passes every required option; the empty default serves the unit tests that never reach them
        private opts: TaskManagerOptions = {} as TaskManagerOptions
    ) {
        this.load();
        this.applySeedFile();
        // F2: pick the persisted in-flight media jobs back up (fire-and-forget;
        // each one finishes its task normally, so interrupted chains continue).
        if (this.reattachQueue.length) {
            void vscode.window.showInformationMessage(
                `Agent Farm: reattached to ${this.reattachQueue.length} in-flight media job(s) from the previous window.`);
            for (const t of this.reattachQueue) { void this.reattachMediaTask(t); }
            this.reattachQueue = [];
        }
        if (!this.runner()) { this.startFollowerWatch(); }
        // ‼️ M-26 — A WINDOW THAT RESTARTED PICKS THE OUTSIDE BACK UP. An OS
        // terminal outlives this extension host by design, so a task launched
        // into one and still `running` after a reload has a window that is very
        // possibly still there — and its exit file is the same file it always
        // was. Without this the run would sit in `running` for ever, which is
        // the exact failure the exit file exists to prevent.
        for (const t of this.tasks) {
            if (t.status === 'running' && t.exitFile) { this.externalWatch.add(t.id); }
        }
        // ‼️ …AND SO DOES A CONVERSATION THE CONSOLE IS HOSTING. One timer drives
        // both (see `startInteractiveWatch`), so starting it on `externalWatch`
        // alone left a reloaded window following its OS terminals and not its
        // Console tasks — the one surface that reports what a run is DOING would
        // have been the one surface whose task never finished.
        if (this.externalWatch.size
            || this.tasks.some(t => t.status === 'running' && t.consoleSessionId)) {
            this.startInteractiveWatch();
        }
        this.timer = setInterval(() => {
            this.tickSchedules(); this.pump(); this.pumpArchiveRepair();
        }, 30_000);
        // …and once now, so a window opened after the disk cleared heals at
        // startup rather than 30 seconds into it.
        if (this.archiveRepair.length) { setTimeout(() => this.pumpArchiveRepair(), 3_000); }

        this.disposables.push(vscode.window.onDidCloseTerminal(terminal => {
            for (const [taskId, t] of this.terminals) {
                if (t === terminal) {
                    this.terminals.delete(taskId);
                    const task = this.tasks.find(x => x.id === taskId);
                    if (task && task.status === 'running') {
                        this.finish(task, 'done');
                    }
                    break;
                }
            }
        }));

        // Exit-code aware completion when shell integration is available.
        const win = vscode.window as unknown as {
            onDidEndTerminalShellExecution?: (cb: (e: {
                terminal: vscode.Terminal; exitCode: number | undefined;
            }) => void) => vscode.Disposable;
        };
        if (typeof win.onDidEndTerminalShellExecution === 'function') {
            this.disposables.push(win.onDidEndTerminalShellExecution(e => {
                for (const [taskId, t] of this.terminals) {
                    if (t === e.terminal) {
                        const task = this.tasks.find(x => x.id === taskId);
                        if (task && task.status === 'running') {
                            this.finish(task, e.exitCode && e.exitCode !== 0 ? 'failed' : 'done');
                        }
                        this.terminals.delete(taskId);
                        break;
                    }
                }
            }));
        }
    }

    get outputsDir(): string {
        return path.join(path.dirname(this.storageFile), 'task-outputs');
    }

    // ---------- persistence ----------

    /** B11: true when this window runs the queue (default; single-window). */
    private runner(): boolean {
        return this.opts.isRunner ? this.opts.isRunner() : true;
    }

    /**
     * ‼️ M-7 — THE SAME ANSWER, OUT LOUD. `runner()` is the silent gate in front
     * of BOTH the scheduler and the pump: in a follower window a schedule's time
     * passes and nothing fires, nothing is logged, and the Plan tab draws a
     * perfectly healthy row with tomorrow's date on it. The window that cannot
     * fire has to be able to say so, so the page can.
     */
    get runsTheQueue(): boolean { return this.runner(); }

    /** Machine roots for portable-path token save/load. */
    private proots(): PortableRoot[] {
        return this.opts.portableRoots?.() ?? [];
    }

    /** One-shot external seeding: a `seed-schedules.json` dropped next to the
     *  store (by an agent, a setup script, another machine) is merged by the
     *  RUNNER — deduped by title — then deleted. Writing farm-tasks.json from
     *  outside races with the runner's saves and loses; this file is the
     *  race-free way in. Checked at startup and on every runner takeover. */
    private applySeedFile(): void {
        if (!this.runner()) { return; }
        const file = path.join(path.dirname(this.storageFile), 'seed-schedules.json');
        let text = '';
        try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
        let added = 0;
        for (const seed of parseSeedSchedules(text)) {
            if (this.schedules.some(s => s.title === seed.title)) { continue; }
            this.addSchedule(seed);
            added++;
        }
        try { fs.unlinkSync(file); } catch { /* stays; title dedupe keeps retries safe */ }
        if (added) {
            void vscode.window.showInformationMessage(
                `Agent Farm: ${added} schedule(s) installed from seed-schedules.json.`);
        }
    }

    private load(): void {
        try {
            const raw = fs.readFileSync(this.storageFile, 'utf8');
            const json = expandDeep(JSON.parse(raw) as Partial<StoreShape>, this.proots());
            this.tasks = Array.isArray(json.tasks) ? json.tasks : [];
            this.schedules = Array.isArray(json.schedules) ? json.schedules : [];
            this.templates = Array.isArray(json.templates) ? json.templates : [];
            this.workflows = Array.isArray(json.workflows) ? json.workflows : [];
            for (const w of this.workflows) { ensureStepIds(w.steps ?? []); }
            this.triggers = Array.isArray(json.triggers) ? json.triggers : [];
            this.automation = json.automation && typeof json.automation === 'object' ? json.automation : {};
            this.automationLog = Array.isArray(json.automationLog) ? json.automationLog : [];
            this.sentry = json.sentry && typeof json.sentry === 'object' && json.sentry.id
                ? json.sentry : undefined;
            // M-8 (V3) — the tombstones a previous window could not write. It
            // survives the restart on purpose: a restart is very often what
            // clears whatever was holding the file.
            this.archiveRepair = Array.isArray(json.archiveRepair)
                ? (json.archiveRepair as { id?: unknown; month?: unknown }[])
                    .filter(x => typeof x?.id === 'string' && typeof x?.month === 'string')
                    .map(x => ({ id: x.id as string, month: x.month as string }))
                : [];
            // ‼️ X-71/X-73 — the runs come back with their rows. Held in memory
            // alone, the project binding died on reload (every later step fell
            // back to whatever the window was showing) and so did the reason a
            // chain stopped (a stopped run and a waiting one looked the same).
            this.runRecords = new Map(Object.entries(
                (json.workflowRuns && typeof json.workflowRuns === 'object'
                    ? json.workflowRuns : {}) as Record<string, WorkflowRunRecord>)
                .filter(([, v]) => !!v && typeof v === 'object'));
            // ‼️ M-8 — a task that predates the event log gets one built from
            // its own fields (see `migrateTaskEvents`). Before the follower
            // return, because a follower window DRAWS these rows and would
            // otherwise show an empty timeline for the same task the runner
            // window explains in full.
            let migrated = false;
            for (const t of this.tasks) { migrated = migrateTaskEvents(t) || migrated; }
            // B11: a follower window mirrors the store as-is — the stale pass
            // below would cancel rows that are alive in the runner window.
            if (!this.runner()) { return; }
            // S-108 — no question to a person survives the window that asked it
            for (const t of this.tasks) { delete t.waitingOn; }
            // Anything marked running from a previous window is stale. Plain
            // tasks go back to the queue; workflow members are cancelled — their
            // process/poll died with the window, and a zombie 'queued' row could
            // never launch for media/approval steps (agentId '') while silently
            // killing the chain. The run is remembered so the host can offer to
            // resume it (F1).
            let staleChanged = false;
            for (const t of this.tasks) {
                if (t.status !== 'running') { continue; }
                // F2: an in-flight media job with a live deadline is NOT stale —
                // its poll URLs were persisted at submit, so we reattach and the
                // render (and the chain behind it) survives the reload.
                if (t.mediaJob && Date.now() < t.mediaJob.deadline) {
                    this.reattachQueue.push(t);
                    // B2: a reattached PARALLEL branch must not drive the chain —
                    // the group's fan-in state died with the window. The run is
                    // paused: the startup resume offer skips it, and completion
                    // re-offers it explicitly (see reattachMediaTask).
                    const step = this.runView(t.workflowId, t.workflowRunId)?.steps[t.stepIndex ?? -1];
                    if (step?.parallel) { this.parallelReattachRuns.add(t.workflowRunId ?? ''); }
                    // ‼️ M-21 — and it says so on the row. A reattach is the one
                    // thing that happens to a task while nobody is looking, and
                    // it left no line at all: the run simply carried on across a
                    // reload it never mentioned.
                    noteTaskEvent(t, 'resumed',
                        'the VS Code window reloaded — the render was still in flight, and its poll URLs picked it back up');
                    staleChanged = true;
                    continue;
                }
                // ‼️ M-21 — A SURFACE OUTSIDE THIS EXTENSION HOST IS NOT STALE,
                // AND THE CODE THAT SAID SO COULD NEVER RUN. An OS terminal
                // outlives the window that opened it by design: the CLI is
                // still working in it and its exit file is still the file it
                // always was. The constructor re-arms `externalWatch` on
                // exactly this state — but this sweep runs first, inside
                // `load()`, so by the time it looked there was no `running`
                // task left carrying an exit file and the re-arm was
                // unreachable. What the user got instead was the worst of both:
                // the run went back to `queued` with `autoStart` already
                // cleared by its own launch, so NOTHING relaunches it, and the
                // terminal finished the work minutes later into an exit file
                // nobody was reading. Measured on a store written by hand.
                if (t.exitFile && normInteractiveTarget(t.interactiveTarget) === 'external') {
                    noteTaskEvent(t, 'resumed',
                        'the VS Code window reloaded — the OS terminal kept going, and this is still watching its exit file');
                    staleChanged = true;
                    continue;
                }
                staleChanged = true;
                // ‼️ M-21 — …AND A CONSOLE CONVERSATION IS THE OPPOSITE CASE,
                // so it must not be treated as the same one. The session is a
                // process THIS extension host spawned and reads over a pipe: a
                // reload starts with an empty session map, `consoleTaskState`
                // answers `undefined` for ever, and a task left `running` would
                // be watched by a timer that can never conclude. It goes back on
                // the queue like any other cut run — and its dead session id
                // goes with the session, so the row does not offer a
                // conversation nobody can open.
                if (t.consoleSessionId) {
                    noteTaskEvent(t, 'parked',
                        'the VS Code window closed — the Console card it was hosted in went with it');
                    t.consoleSessionId = undefined;
                    // ‼️ S-88 — …UNLESS THE RESTART TAKES THE CONVERSATION UP
                    // AGAIN (resume=true), in a NEW card: `reattachConsoleRuns`
                    // hooks the row back on by the engine's session id.
                    if (t.hostedSessionId) { this.cutConsoleByReload.push(t.id); }
                } else if (t.workflowRunId === undefined) {
                    // ‼️ M-21 — WHY A RUN IS BACK ON THE QUEUE IS PART OF WHAT
                    // HAPPENED TO IT. Clearing `startedAt` on its own left a row
                    // that reads as though it had never run at all, and the one
                    // fact the reader needs — that it was cut, not skipped — was
                    // written nowhere. The `started` line above it keeps its own
                    // timestamp, so the two together tell the whole story.
                    noteTaskEvent(t, 'parked',
                        'the VS Code window closed mid-run — back on the queue, press start to run it again');
                    // ‼️ B-03.8 — AND THE ROW IS REMEMBERED, because "press
                    // start" is an instruction to a person and the night shift
                    // has none. Nothing is launched from here: `load()` runs
                    // from the constructor's first line and may not spend money.
                    // The list is what `reviveCutRuns` reads when — and only
                    // when — the restart that caused this asked for continuity.
                    this.cutByReload.push(t.id);
                }
                if (t.workflowRunId !== undefined && t.stepIndex !== undefined) {
                    t.status = 'cancelled';
                    t.endedAt = Date.now();
                    if (t.outputFile) {
                        try {
                            fs.appendFileSync(t.outputFile,
                                '\n\n---\nInterrupted: the VS Code window closed mid-run; the step was cancelled. The run can be resumed.\n');
                        } catch { /* archive gone */ }
                    }
                    const known = this.interrupted.find(r => r.runId === t.workflowRunId);
                    if (!known) {
                        this.interrupted.push({
                            runId: t.workflowRunId, workflowId: t.workflowId ?? '',
                            stepIndex: t.stepIndex, taskId: t.id
                        });
                    } else if (t.stepIndex < known.stepIndex) {
                        // Parallel group cut mid-flight: resume from the earliest
                        // step so routeToStep re-fans the whole group.
                        known.stepIndex = t.stepIndex;
                        known.taskId = t.id;
                    }
                } else {
                    t.status = 'queued';
                    t.startedAt = undefined;
                }
            }
            // Persist the corrections right away so the interrupted-run offer is
            // one-shot; the cancelled rows keep their manual Resume affordance.
            // ‼️ M-8 — and the reconstructed records with them: the runner is the
            // only window allowed to write, so it is the one that makes them
            // permanent. It happens once; every later load finds them there.
            if (staleChanged || migrated) { this.save(); }
        } catch { /* first run */ }
    }

    // ---------- B-03.8: headless runs a restart cut ----------

    /**
     * The plain headless runs THIS load found `running` and put back on the
     * queue. In memory on purpose: it describes one reload, and a list that
     * survived into the next one would offer to continue work that has been
     * sitting queued for a week.
     */
    private cutByReload: string[] = [];
    /** S-88 — the Console-hosted rows THIS load unhooked from their dead card. */
    private cutConsoleByReload: string[] = [];

    /**
     * S-88 — the restart took some conversations up again in new cards: each
     * cut row whose conversation is among them goes back to `running` on that
     * card (see core/consoleTaskRevive.ts). Asked once, after the revive.
     */
    reattachConsoleRuns(cards: readonly LiveCard[]): { id: string; title: string; cardId: string }[] {
        const ids = this.cutConsoleByReload;
        this.cutConsoleByReload = [];
        if (!this.runner()) { return []; }
        const rows = this.tasks.filter(t => ids.includes(t.id));
        const back: { id: string; title: string; cardId: string }[] = [];
        for (const { taskId, cardId } of reattachPlan(rows, cards)) {
            const t = this.tasks.find(x => x.id === taskId);
            if (!t) { continue; }
            t.status = 'running';
            // the load cleared startedAt; the run really began at its own `started` line
            t.startedAt = [...(t.events ?? [])].reverse().find(e => e.kind === 'started')?.ts ?? Date.now();
            t.consoleSessionId = cardId;
            noteTaskEvent(t, 'resumed', `the window restarted and the Console took this conversation up again (card ${cardId})`);
            back.push({ id: t.id, title: t.title, cardId });
        }
        if (back.length) { this.save(); this.startInteractiveWatch(); }
        return back;
    }

    /**
     * ‼️ B-03.8 — THE HEADLESS SIDE OF X-232, AND THE ANSWER TO "WHO PRESSES
     * START AT THREE IN THE MORNING".
     *
     * X-232 gave a Console card a way across a restart of the extension host;
     * a headless run had none, and the sweep in `load()` puts it back on the
     * queue with `autoStart` already cleared by its own launch — so nothing
     * relaunches it. Measured, and the manager's own comment says as much about
     * the terminal case ("nothing on this earth relaunches it"). What a person
     * saw was a task that simply stopped.
     *
     * ‼️ IT IS NOT A RERUN. `runSessionId` was written down when the launch
     * bound (`setRunProgress`) and it survives in the store, so the run is
     * picked up in its OWN conversation with the continuation words M-10 wrote
     * for exactly this — never the original prompt, which would tell an engine
     * with no memory to redo the work it cannot see.
     *
     * ‼️ AND IT IS ASKED FOR, NEVER ASSUMED. The caller passes the list only
     * when the restart that killed these runs said `resume`; an ordinary window
     * reload, a crash or an update leaves them exactly where M-21 left them. A
     * restart is not the only reason a host dies, and spawning CLI processes
     * that spend money on every reload is not a thing to switch on by default.
     *
     * Three refusals, each reported rather than swallowed:
     *   · the run has no session id — there is nothing to resume BY;
     *   · somebody already started it, so it is not queued any more;
     *   · it has been picked up `REVIVE_MAX_ATTEMPTS` times already, which is
     *     the boot-loop guard's sibling: a host that restarts in a loop would
     *     otherwise respawn the same run on every boot for ever.
     */
    reviveCutRuns(): { resumed: { id: string; title: string }[]; skipped: { title: string; reason: string }[] } {
        const resumed: { id: string; title: string }[] = [];
        const skipped: { title: string; reason: string }[] = [];
        const ids = this.cutByReload;
        this.cutByReload = [];
        if (!this.runner()) { return { resumed, skipped }; }
        /**
         * ‼️ A REFUSAL GOES ON THE ROW. The toast that reports this is gone in
         * five seconds and the run that was NOT picked back up is precisely the
         * one somebody has to act on — so the reason is written where a reader
         * will be standing when they ask why it is still sitting there.
         */
        const refuse = (t: FarmTask, reason: string): void => {
            noteTaskEvent(t, 'parked', `not carried on after the restart — ${reason}`);
            skipped.push({ title: t.title, reason });
        };
        for (const id of ids) {
            const t = this.tasks.find(x => x.id === id);
            if (!t) { continue; }
            if (t.status !== 'queued') {
                // Not refused ON the row: it is running again, so a "not carried
                // on" line under a live run would be the contradiction M-12 is
                // about. It is still reported to the caller.
                skipped.push({ title: t.title, reason: 'it is not on the queue any more — somebody started it first' });
                continue;
            }
            const sid = String(t.runSessionId ?? '').trim();
            if (!sid) {
                refuse(t, `${t.engine || 'the CLI'} never named this run's session, so there is nothing `
                    + 'to resume it by — it stays on the queue');
                continue;
            }
            if ((t.attempt ?? 0) >= REVIVE_MAX_ATTEMPTS) {
                refuse(t, `it has already been picked back up ${REVIVE_MAX_ATTEMPTS} times — `
                    + 'a restart loop is not a reason to keep spawning it');
                continue;
            }
            const words = fillContinuation(continuationPromptFor(t.retry ?? {}, 1), {
                taskTitle: t.title,
                attempt: String((t.attempt ?? 0) + 1),
                failureReason: 'the VS Code window restarted while this run was working',
                resetAt: '',
                // The sweep cleared `startedAt`, so there are no minutes to report
                // here — only what the transcript binding managed to count. An
                // empty answer is said in words rather than left as a hole in a
                // sentence the user may have written around it.
                progressSummary: describeFailurePhase(t)
                    || 'what it had already done is not recorded — the transcript above is the record'
            });
            const copy = this.retryTask(t, words, {
                as: 'revive',
                resumeSessionId: sid,
                ...(t.engine ? { resumedEngine: t.engine } : {}),
                resumedFrom: t.title
            });
            if (copy) {
                /**
                 * ‼️ B-03.16 — AND THE ROW THAT WAS CARRIED ON MUST STOP SAYING
                 * THE OPPOSITE. Measured live on 3.448.0: the revive works, and
                 * the original row's last event still read "back on the queue,
                 * press start to run it again" — written by `load()` minutes
                 * before this decision was taken, because that is when the sweep
                 * runs. A person reading the row does what it says and pays for
                 * a SECOND run of the original prompt, beside the continuation
                 * that is already working. A refusal goes on the row (see
                 * `refuse`); so does a carry-on.
                 */
                noteTaskEvent(t, 'resumed',
                    `carried on after the restart as "${copy.title}" — nothing to start here`);
                resumed.push({ id: copy.id, title: copy.title });
            }
            else { refuse(t, 'it could not be copied — its agent is gone'); }
        }
        if (skipped.length || resumed.length) { this.save(); }
        return { resumed, skipped };
    }

    // ---------- F1: interrupted workflow runs ----------

    private interrupted: { runId: string; workflowId: string; stepIndex: number; taskId: string }[] = [];
    /** B2: runs with a reattaching parallel media branch — paused until it completes. */
    private parallelReattachRuns = new Set<string>();

    /**
     * Workflow runs cut mid-flight by the last window close (detected at load).
     * Runs whose workflow no longer exists (ad-hoc media runs) are not offered —
     * there is nothing to resume them into. Runs still reattaching a parallel
     * media branch are held back and offered when that branch completes.
     */
    interruptedRuns(): { runId: string; workflowTitle: string; stepIndex: number; stepTitle: string }[] {
        const out = [];
        for (const r of this.interrupted) {
            if (this.parallelReattachRuns.has(r.runId)) { continue; }
            const w = this.runView(r.workflowId, r.runId);
            if (!w) { continue; }
            out.push({
                runId: r.runId,
                workflowTitle: w.title,
                stepIndex: r.stepIndex,
                stepTitle: w.steps[r.stepIndex]?.title ?? `step ${r.stepIndex + 1}`
            });
        }
        return out;
    }

    /**
     * ‼️ S-31 — THE TRANSCRIPT, WITHOUT WAITING FOR A PRICE.
     *
     * `setTaskCost` is the cost path and it only ever runs inside a fifteen
     * minute window after a run ends — so a run whose session was found later
     * (a launch binding published on the next start-up, a transcript indexed
     * after the fact) kept its figure blank AND its link, and the row went on
     * saying there was nothing to open. This writes the link alone, is
     * idempotent, and never touches a cost.
     */
    setTaskSession(taskId: string, sessionFile: string): boolean {
        const t = this.tasks.find(x => x.id === taskId);
        if (!t || !sessionFile || t.costSessionFile) { return false; }
        t.costSessionFile = sessionFile;
        this.save();
        return true;
    }

    /**
     * ‼️ M-12 — WHAT THE RUN'S OWN TRANSCRIPT SAYS IT DID, AND THE CLASS THAT
     * FOLLOWS FROM IT.
     *
     * Called when a launch binding resolves (S-31), which is often minutes or a
     * restart after the run ended. That is the whole point: a failure is first
     * recorded as `unknown` — an honest "no evidence yet" — and upgraded to
     * `not-started` or `interrupted` the moment there is any. The upgrade never
     * runs backwards: evidence only ever arrives.
     *
     * Returns true when something changed, so the caller can avoid a save loop.
     */
    setRunProgress(taskId: string, p: {
        sessionId?: string; file?: string; assistantSteps?: number; toolCalls?: number;
    }): boolean {
        const t = this.tasks.find(x => x.id === taskId);
        if (!t) { return false; }
        let changed = false;
        if (p.sessionId && t.runSessionId !== p.sessionId) { t.runSessionId = p.sessionId; changed = true; }
        // ‼️ X-267 — and now that the run has a conversation, the context it was
        // launched with can be filed under it for the next round. Once per run:
        // this is re-derived on every pump, and the pin must be the FIRST
        // spawn's bytes rather than whichever call happened to look last.
        const pinSrc = p.sessionId ? this.pinSource.get(taskId) : undefined;
        if (p.sessionId && pinSrc) {
            this.pinSource.delete(taskId);
            this.opts.pinProjectContext?.(p.sessionId, pinSrc);
        }
        if (p.file && !t.costSessionFile) { t.costSessionFile = p.file; changed = true; }
        const next: RunProgress = {
            assistantSteps: p.assistantSteps, toolCalls: p.toolCalls,
            elapsedMs: t.startedAt && t.endedAt ? t.endedAt - t.startedAt : undefined
        };
        const before = JSON.stringify(t.progress ?? {});
        if (JSON.stringify(next) !== before) { t.progress = next; changed = true; }
        // Only a FAILED run has a phase — "what did it manage before it failed"
        // is not a question about a run that finished.
        if (t.status === 'failed') {
            let out = '';
            try { if (t.outputFile) { out = fs.readFileSync(t.outputFile, 'utf8'); } } catch { /* gone */ }
            const phase = classifyFailure({ output: out, progress: next }).phase;
            if (t.failurePhase !== phase) {
                t.failurePhase = phase;
                noteTaskEvent(t, 'finished', `what it managed: ${describeFailurePhase(t)}`);
                if (this.releaseHeld(t)) { /* the successor was waiting on exactly this */ }
                changed = true;
            }
        }
        if (changed) { this.save(); }
        // ‼️ M-27 — AND THIS IS THE ANSWER A HELD ROUND WAS WAITING FOR.
        // Asked whenever an id is offered rather than only when it changed: on
        // a restart the run already carries the id and nothing here moves, while
        // the round beside it is still parked from before the window closed.
        if (p.sessionId && this.releaseRounds()) { this.pump(); }
        return changed;
    }

    /**
     * ‼️ M-10 — THE HELD CONTINUATION, RELEASED BY THE ANSWER IT WAS WAITING FOR.
     *
     * A `smart` retry created while the phase was `unknown` is parked rather
     * than launched, because the alternative is resending the original prompt
     * over work that may already be done. When the evidence lands, the question
     * it was holding for has an answer — and the retry is not merely unparked,
     * it is REMADE into the right shape: a continuation of that conversation if
     * work was cut off, an ordinary retry if none had started.
     *
     * The successor is identified by lineage and attempt number together, which
     * is exact: one run has at most one attempt n+1 in its own chain.
     */
    private releaseHeld(prev: FarmTask): boolean {
        const lineage = prev.retryOf ?? prev.id;
        const want = (prev.retryAttempt ?? 0) + 1;
        const held = this.tasks.find(t =>
            t.status === 'queued' && String(t.deferredCode ?? '').startsWith('progress:')
            && (t.retryOf ?? t.id) === lineage && (t.retryAttempt ?? 0) === want);
        if (!held) { return false; }
        // `ask` is the user's own hold — the evidence arriving does not take
        // their decision away from them.
        if (held.deferredCode === 'progress:ask') { return false; }
        const p = resolveRetry(held.retry, this.opts.defaultRetry?.(held));
        const resumeId = (prev.runSessionId ?? '').trim();
        if (prev.failurePhase === 'interrupted' && p.behavior === 'smart' && resumeId) {
            held.resumeSessionId = resumeId;
            if (prev.engine) { held.resumedEngine = prev.engine; }
            held.resumedFrom = prev.title;
            held.continuationOf = prev.id;
            held.title = held.title.replace(/\(retry (\d+)\)\s*$/, '(continue $1)');
            held.prompt = fillContinuation(
                continuationPromptFor(p, held.retryAttempt ?? 1), {
                taskTitle: prev.title.replace(/\s*\((?:limit-)?(?:retry|continue) \d+\)\s*$/, ''),
                attempt: String(held.retryAttempt ?? 1),
                failureReason: describeFailurePhase(prev),
                resetAt: held.resetAt ? new Date(held.resetAt).toLocaleString() : 'unknown',
                progressSummary: describeFailurePhase(prev)
            });
            noteTaskEvent(held, 'parked',
                `released — the run it follows DID work (${describeFailurePhase(prev)}), so this is a `
                + `continuation of its own conversation rather than a repeat of the original prompt`);
        } else {
            noteTaskEvent(held, 'parked',
                `released — the run it follows started no work, so the original prompt is correct`);
        }
        this.clearPark(held);
        return true;
    }

    /** Z4: attach the matched transcript's cost + tokens to a finished task (idempotent). */
    setTaskCost(taskId: string, costUSD: number, sessionFile: string, tokens?: number): void {
        const t = this.tasks.find(x => x.id === taskId);
        if (!t || t.costUSD !== undefined) { return; }
        t.costUSD = costUSD;
        t.tokens = tokens;
        t.costSessionFile = sessionFile;
        this.save();
    }

    /** Resume an interrupted run from its earliest interrupted step. */
    resumeInterrupted(runId: string): void {
        const r = this.interrupted.find(x => x.runId === runId);
        if (!r) { return; }
        this.interrupted = this.interrupted.filter(x => x.runId !== runId);
        const task = this.tasks.find(t => t.id === r.taskId);
        if (task) {
            this.resumeWorkflowFromTask(task);
            return;
        }
        // B9: the cancelled task was archived by the MAX_TASKS overflow — resume
        // from the stored coordinates instead of silently doing nothing.
        const w = this.runView(r.workflowId, r.runId);
        if (!w || r.stepIndex >= w.steps.length) {
            void vscode.window.showWarningMessage(
                'Agent Farm: this run can no longer be resumed — its workflow or step is gone.');
            return;
        }
        this.runCounts.set(runId, 0);
        // ‼️ X-71 — A RESUMED RUN HAS NOT ENDED. The record carries the reason
        // the chain stopped, and it is persisted now, so leaving it in place
        // would have the resumed chain reporting the ending of the attempt it
        // was started to replace.
        const rec = this.runRecords.get(runId);
        if (rec) { delete rec.ended; this.save(); }
        void vscode.window.showInformationMessage(
            `Agent Farm: resuming workflow "${w.title}" from step ${r.stepIndex + 1}.`);
        this.routeToStep(w, r.stepIndex, this.rebuildHandoff(runId, r.stepIndex), runId);
    }

    /** Drop the resume offer — for one run, or all of them when runId is omitted. */
    dismissInterrupted(runId?: string): void {
        this.interrupted = runId ? this.interrupted.filter(r => r.runId !== runId) : [];
        this.onDidChangeEmitter.fire();
    }

    get historyDir(): string {
        return path.join(path.dirname(this.storageFile), 'task-history');
    }

    /** Which months the archive holds, oldest first. */
    get archivedMonths(): string[] {
        return archiveMonths(this.historyDir);
    }

    /**
     * ‼️ M-9 — THE ARCHIVE, READ THE WAY THE LIVE LIST IS READ.
     *
     * "I deleted it but I need to look at it" was answered by opening a .jsonl
     * file in the editor, which is the raw store and not a surface. These come
     * back as ordinary tasks — same fields, same shape — so the page draws them
     * with the row it already has and nothing has to learn a second format.
     *
     * The paths are expanded here for the same reason they are expanded on
     * load: the archive is git-synced between machines and holds `${claudeDir}`
     * tokens, so a transcript link built from a raw line would point nowhere.
     */
    archivedTasks(months?: string[]): FarmTask[] {
        const want = months?.length ? months : this.archivedMonths;
        return readArchive(this.historyDir, want)
            .map(t => expandDeep(t as unknown as FarmTask, this.proots()));
    }

    /**
     * Move finished tasks to the monthly history log instead of losing them.
     *
     * ‼️ M-8 (reopened) — IT REPORTS WHETHER IT WORKED, AND THE CALLER OBEYS.
     *
     * It used to swallow every error ("history is best-effort") while the one
     * caller that a HAND drives — the ✕ on a row — went on to delete the output
     * file and save the list anyway. A full disk, a permission error or a lock
     * on the month file therefore looked exactly like a successful archive: the
     * row was gone, the output was gone, and the archive it was supposedly
     * filed in had never been written. That is not best-effort, it is silent
     * data loss on the one deletion a person performs by accident.
     *
     * So it throws, and `deleteTask` does not commit unless it returns.
     * Callers for whom the archive genuinely IS best-effort (overflow pruning,
     * Clear Finished on rows that already ran) catch it themselves and say so
     * at their own call site.
     */
    private appendHistory(tasks: FarmTask[]): void {
        if (!tasks.length) { return; }
        fs.mkdirSync(this.historyDir, { recursive: true });
        const byMonth = new Map<string, FarmTask[]>();
        for (const t of tasks) {
            (byMonth.get(monthOf(t)) ?? byMonth.set(monthOf(t), []).get(monthOf(t))!).push(t);
        }
        for (const [month, list] of byMonth) {
            fs.appendFileSync(path.join(this.historyDir, `${month}.jsonl`),
                list.map(t => JSON.stringify(tokenizeDeep(t, this.proots()))).join('\n') + '\n', 'utf8');
        }
    }

    /**
     * ‼️ M-8 (reopened) — UNDO TELLS THE ARCHIVE TOO.
     *
     * Deleting a row files it; Undo puts it back on the live list — and left to
     * itself the archive still holds a copy of a run that is not deleted at
     * all. The reader would show it in the history beside the live row, and
     * delete → Undo → delete filed it a second time.
     *
     * The file is append-only, so taking it back is another line: a tombstone
     * carrying the id and the moment, written to the SAME month file the record
     * went to (`monthOf`, so the reader meets them in order and the last word
     * is this one).
     *
     * ‼️ M-8 (V2) — IT THROWS, AND THE CALLER SAYS SO. It used to `console.warn`
     * into a log nobody opens: the run was safe, but `tasks.history` went on
     * showing a live row as deleted and the person who pressed Undo was told
     * nothing. The throw is not fatal at either call site — one turns it into
     * `onArchiveDrift`, the other adds it to the error it is already raising —
     * but the divergence now reaches a human either way.
     */
    private appendUndelete(tasks: FarmTask[]): void {
        if (!tasks.length) { return; }
        fs.mkdirSync(this.historyDir, { recursive: true });
        const byMonth = new Map<string, FarmTask[]>();
        for (const t of tasks) {
            (byMonth.get(monthOf(t)) ?? byMonth.set(monthOf(t), []).get(monthOf(t))!).push(t);
        }
        for (const [month, list] of byMonth) {
            fs.appendFileSync(path.join(this.historyDir, `${month}.jsonl`),
                list.map(t => JSON.stringify({ id: t.id, undeleted: Date.now() })).join('\n') + '\n', 'utf8');
        }
    }

    /**
     * ‼️ M-8 (V3) — A TOMBSTONE THAT COULD NOT BE WRITTEN IS RETRIED, NOT
     * ANNOUNCED AND FORGOTTEN.
     *
     * The two archive divergences are both real and both recoverable, and until
     * now both ended at a warning: the user was told the live list and the
     * archive disagree, and then nothing ever tried again. A locked month file
     * or a full disk is a MOMENT, not a verdict — the write that failed at
     * 03:00 succeeds at 03:01 — so the failed ids are kept and re-attempted on
     * the pump's own beat, and the warning is withdrawn when they land.
     *
     * Kept in the store (`archiveRepair`), because the case this exists for is
     * precisely the one where writing anything to disk was failing: an
     * in-memory queue would be lost by the restart that fixed the problem. Only
     * ids and their month travel; the record itself is already in the archive.
     */
    private pumpArchiveRepair(): void {
        if (!this.archiveRepair.length || !this.runner()) { return; }
        const still: { id: string; month: string }[] = [];
        for (const item of this.archiveRepair) {
            try {
                fs.mkdirSync(this.historyDir, { recursive: true });
                fs.appendFileSync(path.join(this.historyDir, `${item.month}.jsonl`),
                    JSON.stringify({ id: item.id, undeleted: Date.now() }) + '\n', 'utf8');
            } catch { still.push(item); }
        }
        if (still.length === this.archiveRepair.length) { return; }
        const healed = this.archiveRepair.length - still.length;
        this.archiveRepair = still;
        this.save();
        this.opts.onArchiveDrift?.(still.length
            ? `${healed} archive tombstone(s) were written on a retry; ${still.length} still cannot be.`
            // ‼️ The whole point of the queue: the sentence that told the user
            // the two copies disagree is taken back by the thing that fixed it.
            : 'The task archive agrees with the board again — the tombstone(s) that could not be'
            + ' written earlier have been written. Nothing needs doing.');
    }

    /** Queue ids whose tombstone failed, so `pumpArchiveRepair` can try again. */
    private queueArchiveRepair(tasks: FarmTask[]): void {
        for (const t of tasks) {
            const month = monthOf(t);
            if (!this.archiveRepair.some(x => x.id === t.id && x.month === month)) {
                this.archiveRepair.push({ id: t.id, month });
            }
        }
    }

    /** Keep the outputs archive under the configured size cap (oldest first). */
    private pruneOutputs(): void {
        const capMB = this.opts.outputsMaxMB?.() ?? 200;
        if (capMB <= 0 || Date.now() - this.lastOutputsPrune < 10 * 60_000) { return; }
        this.lastOutputsPrune = Date.now();
        try {
            if (!fs.existsSync(this.outputsDir)) { return; }
            const live = new Set(this.tasks.map(t => t.outputFile).filter(Boolean));
            const files = fs.readdirSync(this.outputsDir)
                .map(n => {
                    const p = path.join(this.outputsDir, n);
                    const st = fs.statSync(p);
                    return { p, size: st.size, mtime: st.mtimeMs };
                })
                .sort((a, b) => a.mtime - b.mtime);
            let total = files.reduce((a, f) => a + f.size, 0);
            const cap = capMB * 1024 * 1024;
            for (const f of files) {
                if (total <= cap) { break; }
                if (live.has(f.p)) { continue; } // never delete an active task's output
                try { fs.unlinkSync(f.p); total -= f.size; } catch { /* locked */ }
            }
        } catch { /* best-effort */ }
    }

    // ---------- B11: follower mode (another window runs the queue) ----------

    private followerWatcher?: fs.FSWatcher;
    private followerReloadTimer?: NodeJS.Timeout;

    /** Mirror the runner window's saves so this window's views stay fresh. */
    private startFollowerWatch(): void {
        try {
            const base = path.basename(this.storageFile);
            this.followerWatcher = fs.watch(path.dirname(this.storageFile), (_event, filename) => {
                if (filename && filename.toString() !== base) { return; }
                if (this.followerReloadTimer) { clearTimeout(this.followerReloadTimer); }
                this.followerReloadTimer = setTimeout(() => {
                    this.followerReloadTimer = undefined;
                    try {
                        const json = expandDeep(
                            JSON.parse(fs.readFileSync(this.storageFile, 'utf8')) as Partial<StoreShape>,
                            this.proots());
                        this.tasks = Array.isArray(json.tasks) ? json.tasks : [];
                        this.schedules = Array.isArray(json.schedules) ? json.schedules : [];
                        this.templates = Array.isArray(json.templates) ? json.templates : [];
                        this.workflows = Array.isArray(json.workflows) ? json.workflows : [];
            for (const w of this.workflows) { ensureStepIds(w.steps ?? []); }
                        this.triggers = Array.isArray(json.triggers) ? json.triggers : [];
                        this.onDidChangeEmitter.fire();
                    } catch { /* mid-write or gone — the next change retries */ }
                }, 800);
            });
        } catch { /* watch unavailable — views refresh on reload only */ }
    }

    private stopFollowerWatch(): void {
        try { this.followerWatcher?.close(); } catch { /* already closed */ }
        this.followerWatcher = undefined;
        if (this.followerReloadTimer) { clearTimeout(this.followerReloadTimer); this.followerReloadTimer = undefined; }
    }

    /**
     * The ownership lease landed on this window after startup (the runner
     * window closed). Take over its duties: re-read the store with the stale
     * pass, reattach persisted media jobs, resume pumping on the next tick.
     * The host must flip its isRunner() answer to true BEFORE calling this.
     */
    /** Rare edge: the lease was lost while running (e.g. a long OS sleep let
     *  another window take over). Stop launching and mirror the new runner. */
    becomeFollower(): void {
        if (!this.followerWatcher) { this.startFollowerWatch(); }
    }

    becomeRunner(): void {
        this.stopFollowerWatch();
        this.load();
        this.applySeedFile();
        if (this.reattachQueue.length) {
            void vscode.window.showInformationMessage(
                `Agent Farm: reattached to ${this.reattachQueue.length} in-flight media job(s) from the previous window.`);
            for (const t of this.reattachQueue) { void this.reattachMediaTask(t); }
            this.reattachQueue = [];
        }
        this.onDidChangeEmitter.fire();
    }

    /**
     * ‼️ M-8 (V2) — A DESTRUCTIVE STEP IS REFUSED AT THE DOOR, NOT AFTER IT.
     *
     * `save()` is the LAST thing a deletion does, and in a follower window it
     * is the only thing that notices the window may not write. So the archive
     * line had already been appended, the row had already left this window's
     * memory and the output file had already been unlinked before anybody said
     * "another window owns this list" — an ordering that produced exactly the
     * split the item complains about: no row here, the row still in the
     * runner's store, no output anywhere, and a history entry for a deletion
     * that never happened.
     *
     * Every route that removes or restores a row asks this FIRST. The throw is
     * the answer the caller shows; the toast still fires so the reason is the
     * same sentence the other blocked writes give.
     */
    private assertRunner(what: string): void {
        if (this.runner()) { return; }
        this.opts.onFollowerWrite?.();
        throw new Error(
            `${what} can only be done in the window that runs the task queue — `
            + 'this window mirrors that one and may not write the list.');
    }

    /**
     * Write the store as one file, atomically, and THROW if it did not land.
     *
     * ‼️ M-8 (V2) — THE LIVE LIST IS PART OF THE TRANSACTION. Filing the row in
     * the month archive was made the commit point, but the other half of a
     * deletion — the list the row disappears from — still went through a
     * catch that called storage best-effort. A read-only store, a full disk
     * or a lock therefore gave the user a row that vanished from the screen,
     * came back on the next window, and had no output file any more because
     * that step ran regardless. Temp file + rename so a crash mid-write cannot
     * truncate the store either.
     */
    private writeStore(tasks: FarmTask[]): void {
        for (const w of this.workflows) { ensureStepIds(w.steps); }
        fs.mkdirSync(path.dirname(this.storageFile), { recursive: true });
        // absolute machine paths leave as ${claudeDir}/${globalStorage}/${home}
        // tokens — the git-synced store stays valid on every machine
        const body = JSON.stringify(tokenizeDeep({
            tasks,
            schedules: this.schedules,
            templates: this.templates,
            workflows: this.workflows,
            triggers: this.triggers,
            automation: this.automation,
            automationLog: this.automationLog,
            ...(this.sentry ? { sentry: this.sentry } : {}),
            ...(this.archiveRepair.length ? { archiveRepair: this.archiveRepair } : {}),
            ...(this.runRecords.size
                ? { workflowRuns: Object.fromEntries(this.runRecords) } : {})
        }, this.proots()), null, 2);
        const tmp = `${this.storageFile}.tmp`;
        try {
            fs.writeFileSync(tmp, body, 'utf8');
            fs.renameSync(tmp, this.storageFile);
        } catch (e) {
            try { fs.unlinkSync(tmp); } catch { /* never existed */ }
            throw e;
        }
    }

    /** What every write does once the bytes are down: trim, then repaint. */
    private afterWrite(): void {
        this.pruneOutputs();
        this.onDidChangeEmitter.fire();
    }

    /**
     * ‼️ M-3 (V3) — ONE DECISION IS ONE WRITE.
     *
     * Deciding to retry a failed run touches two rows: the run that failed
     * (which now says "retried") and the new queued row that carries the work.
     * Written as two `save()` calls those are two separate files on disk, and
     * the window between them is a state that must never be readable — a task
     * whose record promises a retry that does not exist. `inOneWrite` collapses
     * every `save()` inside it into a single store write at the end, so the
     * pair lands together or not at all, and one repaint follows instead of two.
     *
     * Returns whether the bytes reached the disk, which is the other half of
     * the same problem: an ordinary save swallows its error by design, so the
     * caller of a decision that MUST survive a restart has to be able to see
     * that it did not.
     */
    private inOneWrite(fn: () => void, strict = false): boolean {
        this.saveDepth++;
        try {
            fn();
        } finally {
            this.saveDepth--;
        }
        if (!this.saveDirty) { return true; }
        this.saveDirty = false;
        return this.save(strict);
    }

    private save(strict = false): boolean {
        if (this.saveDepth > 0) {
            // Inside `inOneWrite`: remember that something changed and let the
            // outermost call put it down once.
            this.saveDirty = true;
            return true;
        }
        if (!this.runner()) {
            // B11 follower: never write — the runner window owns the store. The
            // in-memory change is transient (the follower watcher restores disk
            // truth moments later); the host warns via onFollowerWrite.
            this.opts.onFollowerWrite?.();
            this.onDidChangeEmitter.fire();
            return true;
        }
        let ok = true;
        try {
            fs.mkdirSync(path.dirname(this.storageFile), { recursive: true });
            if (this.tasks.length > MAX_TASKS) {
                const finished = this.tasks.filter(t =>
                    t.status === 'done' || t.status === 'cancelled' || t.status === 'failed');
                const overflow = this.tasks.length - MAX_TASKS;
                const dropped = finished.slice(0, overflow);
                // ‼️ M-8 — THE ARCHIVE WRITE DECIDES WHETHER THE ROWS GO. This
                // one really is best-effort about the PRUNE — a list a little
                // over its cap for one more save is nothing — but it must never
                // be best-effort about the DATA: if the month file could not be
                // written, the rows stay on the list rather than disappearing
                // into an archive that does not have them.
                try {
                    this.appendHistory(dropped);
                    const drop = new Set(dropped.map(t => t.id));
                    this.tasks = this.tasks.filter(t => !drop.has(t.id));
                } catch { /* keep them: over the cap beats gone */ }
            }
            this.writeStore(this.tasks);
        } catch (e) {
            // An ordinary save is best-effort; the destructive routes are not —
            // and neither is a decision the caller asked to be sure about.
            ok = false;
            if (strict) {
                void vscode.window.showWarningMessage(
                    'Agent Farm: the task store could not be written — '
                    + `${e instanceof Error ? e.message : String(e)}. `
                    + 'The change is on screen but will not survive a restart.');
            }
        }
        this.afterWrite();
        return ok;
    }

    // ---------- automation gate (core/automation.ts) ----------

    /** Farm-wide block (master switch / pause-until / quiet hours), or undefined.
     *  `manual` = the user pressed Run Now; quiet hours do not apply to them. */
    automationGate(now = new Date(), manual = false): ReturnType<typeof gateBlock> {
        if (pauseExpired(this.automation, now.getTime())) {
            this.automation = { ...this.automation, pausedUntil: undefined, pauseReason: undefined };
            this.save();
        }
        return gateBlock(this.automation, now, { manual });
    }

    /** Is there work? Free to evaluate — no agent is woken to find out. */
    checkPrecondition(pre: Precondition | undefined): { ok: boolean; detail: string } {
        return evaluatePrecondition(pre, { queueWorkCount: this.opts.queueWorkCount });
    }

    /** Record a fired/skipped decision. This log IS the evidence that the gate
     *  works — a precondition that silently suppressed work would be exactly
     *  the "rule that fails silently" the constitution forbids. */
    logAutomation(ev: Omit<AutomationEvent, 'ts'>): void {
        this.automationLog = appendAutomationEvent(this.automationLog, { ...ev, ts: Date.now() });
        this.save();
    }

    /** Persist after a caller mutated store rows in place (bulk enable/disable). */
    persist(): void {
        this.save();
    }

    private runLib?: RunLibrary;
    /** X-418 — the run's library, when the extension gave one: a file a step makes is filed and recorded */
    private get lib(): RunLibrary | undefined {
        const m = this.opts.mediaLibrary;
        if (m && !this.runLib) { this.runLib = new RunLibrary(m.recorder, m.module, () => this.save(), (a, b) => retargetSidecars(this.outputsDir, a, b), m.enrich); }
        return this.runLib;
    }
    private libCtx(task: FarmTask): RunCtx | undefined {
        const rec = task.workflowRunId ? this.runRecords.get(task.workflowRunId) : undefined;
        const w = this.runView(task.workflowId, task.workflowRunId);
        if (!this.lib || !rec || !w || task.stepIndex === undefined) { return undefined; }
        return { w, runId: task.workflowRunId as string, runStartedAt: rec.startedAt, stepIndex: task.stepIndex, taskId: task.id, attempt: task.attempt, ledger: rec.library ??= [] };
    }

    /** Update the master switch / quiet hours (panel + bridge share this path). */
    setAutomationState(patch: Partial<AutomationState>): AutomationState {
        this.automation = { ...this.automation, ...patch };
        this.save();
        return this.automation;
    }

    // ---------- tasks ----------

    addTask(
        agent: AgentInfo, title: string, prompt: string, mode: TaskMode,
        // The launch dimensions are part of MAKING a task, not something set on
        // it afterwards: every one of them changes the command line, so a task
        // that is queued before they are applied is a task that could start
        // wrong. (The three callers that used to patch `model`/`cli` onto the
        // returned object still work — the field is the same field.)
        extra?: Partial<Pick<FarmTask,
            'fromSchedule' | 'fromTrigger' | 'workflowId' | 'workflowRunId' | 'stepIndex' | 'projectId'
            | 'engine' | 'model' | 'effort' | 'permissionMode' | 'cli' | 'priority' | 'workDir'
            // ‼️ X-106 — THE ROUTE IS NAMED HERE, not patched on afterwards. It
            // has to arrive with the task because the seal is taken at the
            // enqueue: a route written onto the returned object is a route the
            // seal never saw, and the run's own history then starts blank.
            | 'providerId' | 'tier'
            | 'interactiveTarget' | 'interactiveClose' | 'finishSound' | 'superpowers'
            | 'missionId' | 'ignoreBudget' | 'retry' | 'retryOf' | 'retryAttempt' | 'notBefore'
            | 'notBeforeWhy' | 'resumeSessionId' | 'resumedEngine' | 'resumedFrom'
            | 'rounds' | 'round' | 'roundsTotal' | 'roundOf' | 'roundAwaits' | 'sentryOf'
            | 'sentryWhy' | 'account' | 'accountHandover' | 'accountPool' | 'baton' | 'batonChainId' | 'batonMaxHops'
            | 'relayOf'>>
    ): FarmTask {
        // The window's active project is stamped on the task HERE, at creation —
        // a dozen call sites make tasks, and a project that depended on all of
        // them remembering to attach it would quietly stop being attached the day
        // another appeared.
        //
        // ‼️ BUT THE WINDOW ONLY SPEAKS FOR TASKS A PERSON JUST MADE. A schedule
        // firing at 03:00, a trigger, a retry, the next step of a workflow — none
        // of those was created "in" whatever project the window happens to be
        // showing, because nobody was looking at the window. Those call sites
        // state their own origin project, and passing the key with `undefined`
        // is how they say NO PROJECT: no context, no worklog instruction, exactly
        // the way an automated run behaved before any of this existed.
        const projectId = extra && 'projectId' in extra
            ? extra.projectId
            : this.opts.activeProjectId?.();
        const task: FarmTask = {
            id: newId(),
            agentId: agent.id,
            agentName: agent.name,
            title,
            prompt,
            mode,
            status: 'queued',
            createdAt: Date.now(),
            ...extra
        };
        if (projectId) { task.projectId = projectId; } else { delete task.projectId; }
        // ‼️ M-27 — A CHAIN IS SETTLED WHEN THE TASK IS MADE, not when it runs.
        // The list is cleaned here so a blank row left in a form and a delay
        // read out of somebody's JSON can never reach a timer, and the
        // denominator is stamped here because this is the only moment it is
        // knowable — by round 3 the list has been eaten down. A round the chain
        // itself opens states all of this explicitly and is left alone.
        /**
         * ‼️ X-106 — THE ROUTE IS SEALED HERE, at the enqueue, for the same
         * reason the project is stamped here: a dozen call sites make tasks, and
         * the one moment they all share is this one. A seal written at the spawn
         * instead would be a record of the route the run already took, which
         * answers nothing.
         *
         * ‼️ AND ONLY WHEN A ROUTE WAS NAMED. With nothing chosen the agent's own
         * standing record decides at the spawn; sealing that here would record a
         * decision nobody made and then report "drift" the first time the user
         * changed their standing route, which is not what happened to this run.
         *
         * A seal arriving on `extra` (a clone, a hand-built row) is dropped: the
         * seal belongs to the enqueue that is happening now.
         */
        delete task.routeSeal;
        const route = routeOf(task);
        if (route) {
            const sealed = this.opts.sealRoute?.(agent.id, engineOf(task.engine).id, route);
            if (sealed) { task.routeSeal = sealed; }
        }
        const chain = normalizeRounds(task.rounds);
        if (chain.length) { task.rounds = chain; } else { delete task.rounds; }
        if (task.roundsTotal === undefined && chain.length) { task.roundsTotal = totalRounds(chain); }
        if (task.roundsTotal !== undefined && task.round === undefined) { task.round = 1; }
        // The first line of the task's own record, and the only one that can say
        // where the run came from — by the time it starts, `fromSchedule` is an
        // id and the schedule may have been renamed or deleted.
        noteTaskEvent(task, 'created',
            task.fromSchedule ? 'by a schedule'
                : task.fromTrigger ? 'by a trigger'
                    : task.workflowId !== undefined ? `by a workflow (step ${(task.stepIndex ?? 0) + 1})`
                        : task.missionId ? 'by a mission'
                            // ‼️ M-3 (reopened) — a retry says a retry made it.
                            // It reads "by you" otherwise, about the one row on
                            // the board nobody pressed anything to create.
                            : task.retryAttempt ? `by the retry policy (attempt ${task.retryAttempt})`
                                : 'by you');
        this.tasks.push(task);
        this.save();
        return task;
    }

    private runningCount(agentId?: string): number {
        return this.tasks.filter(t =>
            t.status === 'running' && (!agentId || t.agentId === agentId)).length;
    }

    /**
     * ‼️ M-14 — THE FLEET LIMIT COUNTS WEIGHT, NOT RUNS.
     *
     * Counting runs assumes they cost the same machine, and they do not.
     * Measured 2026-08-16, twice: one `opencode run --format json` peaks at
     * 615 MB / 596 MB working set over its own process tree — heavier than the
     * shared ACP server that serves every hosted card at once. Two of those
     * together is 1.2 GB of transient memory on a machine that has none spare,
     * and the flat count would have started them both without a word.
     *
     * Only an engine that has been WEIGHED carries a number
     * (`engineConcurrencyWeight`); everything else is 1, so this is the old
     * count exactly until a measurement says otherwise. The PER-AGENT limit
     * stays a plain count on purpose: it is about an agent not talking over
     * itself, which is a question about the conversation and not about memory.
     */
    private runningWeight(): number {
        return this.tasks
            .filter(t => t.status === 'running')
            .reduce((sum, t) => sum + engineConcurrencyWeight(t.engine), 0);
    }

    /**
     * Why this task can't launch right now, or undefined if it can.
     *
     * ‼️ M-11 — EVERY ANSWER CARRIES A CODE. The sentence is for the row and the
     * notice; the code is the identity the dedupe is decided on, and it does not
     * move when a figure inside the sentence does.
     */
    private launchBlock(task: FarmTask): LaunchBlock | undefined {
        // ‼️ M-3 (reopened) — A RUN THAT IS WAITING FOR A CLOCK. First, because
        // it is the cheapest test and because it outranks the others: a retry
        // whose wait has not elapsed is not competing for a slot at all.
        //
        // The reason names the MOMENT and never the remaining minutes: the pump
        // asks again every 30 seconds, and a reason that counted down would be
        // a different string every time — which is what `startTask` reads to
        // decide whether this is news worth writing on the record.
        if (task.notBefore && Date.now() < task.notBefore) {
            return {
                // The moment is IN the code here, and deliberately: a retry
                // whose wait is pushed out is a different wait, and the row's
                // record should say so. It is not a live figure — it changes
                // only when something re-decides the retry.
                code: `wait:${task.notBefore}`,
                reason: `waiting until ${new Date(task.notBefore).toLocaleTimeString()}`
                    + (task.retryAttempt ? ` — retry ${task.retryAttempt}` : '')
                    // ‼️ M-10 — and where that moment came from, when it was not
                    // simply "n minutes from the failure".
                    + (task.notBeforeWhy ? ` (${task.notBeforeWhy})` : '')
            };
        }
        // X-473 — a slot the system chose may have filled while the row waited: asked again here, at every start
        const pool = String(task.accountPool ?? '').trim();
        if (pool && task.account && task.account !== pool) {
            const moved = this.opts.replaceAccount?.(task);
            if (moved) {
                task.account = moved.account;
                noteTaskEvent(task, 'placed', moved.why);
                this.save();
            }
        }
        /**
         * ‼️ M-27 — A ROUND WAITS FOR THE CONVERSATION IT IS A REPLY TO.
         *
         * Only `opencode run --format json` publishes its session id while the
         * run is still going; every other engine is bound to one afterwards,
         * from a transcript the index matches on disk. So a round opened the
         * instant its predecessor answered has, normally, nothing to resume
         * YET — and launching it there would open a BRAND NEW conversation and
         * answer a prompt written for a context it does not have, which is the
         * one outcome the whole feature exists to prevent.
         *
         * It is a hold and not a refusal, and it is deliberately QUIET: the
         * park is written on the row when the round is made (with the same
         * code this returns, so the pump renews it without new news), and on
         * the ordinary path it lasts the seconds it takes the index to catch
         * up. `releaseRounds` ends it.
         */
        if (task.roundAwaits && !task.resumeSessionId) {
            return {
                code: ROUND_BINDING_CODE,
                reason: roundBindingReason(task)
            };
        }
        // ‼️ M-13 — held for the supervisor, or by what it (or its fallback) said
        if (isSupervisionOpen(task.supervision)) {
            return { code: 'supervisor:pending', reason: task.deferredReason || 'waiting for the supervisor to decide how this run continues' };
        }
        if (task.deferredCode === SUPERVISION_ASK_CODE) {
            return { code: 'supervisor:ask', reason: task.deferredReason || 'waiting for you — the supervisor asked for a person' };
        }
        if (task.deferredCode === SUPERVISION_PARK_CODE) {
            return { code: 'supervisor:park', reason: task.deferredReason || 'parked — the supervisor did not decide' };
        }
        // ‼️ S-19 — A LIVE OWNER OUTRANKS EVERY OTHER CEILING, and is checked
        // HERE rather than at the moment the user picked the session: minutes
        // pass between choosing a conversation and a queued task reaching the
        // front, and the Console can be opened on it in between. This is the
        // last gate before a spawn, which is the only place the answer is
        // still true.
        if (task.resumeSessionId) {
            const held = this.opts.sessionBusy?.(task.resumeSessionId, task.resumedEngine ?? task.engine);
            if (held) {
                return {
                    // The code names the SESSION, not the holder: the run is
                    // waiting for that conversation to be free, whoever happens
                    // to have it, so a holder changing hands is not new news.
                    code: `session:busy:${task.resumeSessionId}`,
                    reason: `the conversation is open elsewhere — ${held}`
                };
            }
        }
        /**
         * ‼️ X-296 / X-260 — AND WHOSE PLAN IT WOULD SPEND, checked before a slot
         * is competed for rather than after one is won.
         *
         * A HOLD and not a failure, which the other half of this family cannot
         * be: the service skips the occurrence because it has no board to say
         * anything on, while here the row carries the sentence and the run goes
         * the moment the sign-in is captured again. What neither may do is start
         * — an account that is not on this machine resolves to no slot, no slot
         * injects no variable, and no variable is the machine's own sign-in.
         *
         * The code names the ACCOUNT rather than the task: several runs waiting
         * on one missing sign-in are one piece of news, and re-capturing it
         * releases all of them at once.
         */
        const accountNo = this.opts.accountBlock?.(task.engine ?? 'claude', task.account, task.agentId);
        if (accountNo) {
            return { code: `account:missing:${(task.account ?? '').trim() || task.engine || 'claude'}`, reason: accountNo };
        }
        const maxGlobal = this.opts.maxConcurrent?.() ?? 5;
        const maxAgent = this.opts.maxConcurrentPerAgent?.() ?? 0;
        // The run being weighed is the one asking, so its own weight is added:
        // a 2-slot engine cannot start into a 2-slot fleet that is already busy,
        // and — deliberately — cannot start beside another of its own kind.
        const mine = engineConcurrencyWeight(task.engine);
        if (maxGlobal > 0 && this.runningWeight() + mine > maxGlobal) {
            // ‼️ THE SENTENCE HAS TO EXPLAIN A NUMBER THE USER CANNOT SEE. With
            // every engine at weight 1 this reads exactly as it always did; when
            // a heavy one is involved it says so, because "concurrency: 2
            // running" beside ONE running task is the kind of line that looks
            // like a bug in the counter.
            const running = this.runningCount();
            const heavy = mine > 1 || this.runningWeight() > running;
            return {
                code: 'concurrency:fleet',
                reason: heavy
                    ? `concurrency: ${maxGlobal} slots, ${this.runningWeight()} in use`
                    + ` (${running} running) — this engine takes ${mine}`
                    : `concurrency: ${maxGlobal} running`
            };
        }
        if (maxAgent > 0) {
            // S-129 — a relay successor is held by its own chain only (core/relaySeat.ts)
            const holders = seatHolders(task, this.tasks.filter(t => t.status === 'running' && t.agentId === task.agentId));
            if (holders.length >= maxAgent) {
                return {
                    code: `concurrency:agent:${task.agentId}`,
                    reason: agentBusyReason(task.agentName, holders)
                };
            }
        }
        // S-72 — the row is handed over: a row that states an account is judged
        // by THAT account's window, not the machine's (core/quotaBrake.ts).
        const quota = asLaunchBlock(this.opts.quotaCheck?.(task), 'quota:5h');
        if (quota) { return quota; }
        // Budget is a BRAKE, not a notification: over the daily ceiling nothing
        // new launches. (It used to raise an insight and then start the task
        // anyway — a ceiling you can walk through is not a ceiling.)
        //
        // ‼️ M-7 — …WITH ONE RELEASE, AND THE TASK HAS TO ASK FOR IT. The budget
        // is the user's own policy about money, so a run they marked "whatever
        // the budget says" is allowed past it. The quota guard and the
        // concurrency limits above are NOT waivable here: those are the plan
        // window and the machine, and neither is a number the user set about
        // this task. A run held by them is waiting, not refused.
        if (!task.ignoreBudget) {
            const budget = asLaunchBlock(this.opts.budgetCheck?.(task.agentName), 'budget:fleet');
            if (budget) { return budget; }
        }
        return undefined;
    }

    /**
     * Request a start; if a ceiling blocks it, the task waits and the pump
     * launches it later.
     *
     * ‼️ M-7 — AND THE HOLD IS RECORDED AND ANNOUNCED, because it is the exact
     * event that was invisible: a scheduled run whose time came, whose row said
     * "parked", and whose reason nobody was ever shown. The caller is told
     * `false` so it can stop claiming the thing started (see fireSchedule).
     */
    startTask(task: FarmTask): boolean {
        const block = this.launchBlock(task);
        if (block) {
            task.autoStart = true;
            const rec = this.recordBlock(task, block);
            this.save();
            if (rec.news) { this.announceParked(task, block); }
            return false;
        }
        return this.launch(task);
    }

    /**
     * ‼️ M-7 (V3) — THE REASON A RUN IS HELD IS KEPT CURRENT, WHOEVER ASKS.
     *
     * A held task is asked about twice: once by `startTask`, when its time
     * comes, and then every 30 seconds by the pump. Only the first path used to
     * write anything, so a run parked on concurrency at 09:00 and still parked
     * on the budget at 18:00 showed the morning's reason all day — including
     * the retry whose wait had elapsed hours ago, still saying "waiting until
     * [a time in the past]". The record, the row and the board now follow the
     * ceiling that is actually holding it.
     *
     * Only a CHANGE is a new line: the pump asks 120 times an hour and a log
     * that wrote "still over budget" every time would bury the transitions it
     * exists to show.
     *
     * ‼️ M-11 — AND "A CHANGE" IS A CHANGE OF CEILING, NOT OF WORDING. The
     * reason used to be the whole identity, so `$388.91 of $300.00` ticking to
     * `$389.02 of $300.00` was a new park: a `parked` event and a level-3 notice
     * per cent spent anywhere on the farm, about one budget that had not moved.
     * The two answers are now separate — `news` is "tell somebody" (the blocker
     * itself changed, or this is a fresh park), `touched` is "write it down" (the
     * sentence on the row moved, which the reader is entitled to see live).
     */
    private recordBlock(task: FarmTask, block: LaunchBlock): { news: boolean; touched: boolean } {
        // A task that was NOT parked a moment ago is beginning a new episode.
        // That is what makes "held → released → held by the same ceiling again"
        // two pieces of news while "held all evening" stays one.
        const fresh = !task.deferredCode;
        const news = fresh || task.deferredCode !== block.code;
        if (fresh) { task.parkEpisode = (task.parkEpisode ?? 0) + 1; }
        const touched = news || task.deferredReason !== block.reason;
        task.deferredCode = block.code;
        task.deferredReason = block.reason;
        if (news) { noteTaskEvent(task, 'parked', block.reason); }
        return { news, touched };
    }

    /** ‼️ M-11 — the hold is over. Both halves go together: a code left behind
     *  would make the NEXT park look like a continuation of this one. */
    private clearPark(task: FarmTask): void {
        task.deferredReason = undefined;
        task.deferredCode = undefined;
    }

    /**
     * ‼️ NOBODY IS WATCHING AN UNATTENDED RUN — SO IT SAYS SO OUT LOUD.
     *
     * A task the user just pressed a button for parks in front of them, on the
     * page they are looking at. A task a SCHEDULE started parks at 09:00 into a
     * panel that may not be open until the afternoon, which is exactly the
     * complaint: the time passed, nothing ran, and the extension behaved as if
     * everything were normal. The board is where the farm tells the user
     * things, so that is where this goes — once per task, keyed on the task's
     * own id so a 30-second pump cannot repeat it.
     */
    private announceParked(task: FarmTask, block: LaunchBlock): void {
        const reason = block.reason;
        // ‼️ M-3 (V3) — ITS OWN CLOCK IS NOT A CEILING. A retry that says
        // "waiting until 00:40" is doing exactly what the policy asked for;
        // announcing that as "did not start" would make the mechanism working
        // correctly look like a fault. What IS news is the ceiling it meets
        // when that wait ends, and that arrives here as a changed reason.
        if (task.notBefore && Date.now() < task.notBefore) { return; }
        // ‼️ M-27 — A ROUND IS UNATTENDED TOO. The rule here is "announce a park
        // nobody is sitting in front of", and round 4 of a chain that has been
        // running since this morning is exactly that: the person who typed it
        // left hours ago. Round 1 is not — they pressed the button and watched.
        if (!task.fromSchedule && !task.fromTrigger
            && task.workflowId === undefined && !task.retryAttempt
            && (task.round ?? 1) < 2) { return; }
        const source = task.fromSchedule ? 'schedule' : task.fromTrigger ? 'trigger'
            : task.workflowId !== undefined ? 'workflow'
                : task.retryAttempt ? 'retry policy' : 'the task\'s own rounds';
        this.opts.announce?.({
            // ‼️ M-7 (V3) — ONE KEY FOR ONE PARK. The farm-news scan announces
            // the same event for tasks nobody is unattended about, and it used
            // to use a DIFFERENT key — so a single park produced two notices
            // that the "once" guard could not see were the same thing. Both
            // sides call `parkNoticeKey` now.
            //
            // ‼️ M-11 — and what is IN that key is the episode and the blocker's
            // CODE, never the reason. A run held by concurrency this morning and
            // by the budget tonight is still two facts (two codes); the same
            // budget quoting a bigger number every thirty seconds is one.
            key: parkNoticeKey(task),
            level: 3,
            title: `"${task.title}" did not start — ${reason}`,
            body: [
                `A ${source} started this task at the time it was set for, and it was held back before it could run.`,
                '',
                `Agent: ${task.agentName}`,
                `Held by: ${reason}`,
                '',
                'It is not lost: it stays queued and launches by itself as soon as the ceiling clears.'
                + ' To run it regardless of the DAILY BUDGET, tick "run even if the budget is spent"'
                + ' on the task (or on the schedule, so every one of its runs carries it).'
                + ' The 5-hour quota guard and the concurrency limits are not waivable that way —'
                + ' those protect the plan window and this machine.'
            ].join('\n')
        });
    }

    /** Effective launch priority: base priority plus one point per 30 min waited (anti-starvation aging). */
    private effectivePriority(t: FarmTask, now: number): number {
        return (t.priority ?? 0) + Math.floor((now - t.createdAt) / (30 * 60_000));
    }

    /** Launch deferred tasks as capacity frees up (called on every finish + every 30s). */
    private pump(): void {
        if (!this.runner()) { return; } // B11: only the runner window launches
        // ‼️ M-27 — a round held for its conversation is released HERE as well as
        // where the binding lands, because the binding can arrive in a window
        // that is not the runner, or before this one was even opened: the row is
        // in the store and the id is on the run it follows, so the answer is
        // always re-derivable and never depends on having seen the event.
        this.releaseRounds();
        const now = Date.now();
        const ready = this.tasks
            .filter(t => t.status === 'queued' && t.autoStart)
            .sort((a, b) => this.effectivePriority(b, now) - this.effectivePriority(a, now)
                || a.createdAt - b.createdAt);
        for (const task of ready) {
            const block = this.launchBlock(task);
            if (block) {
                // ‼️ M-7/M-3 (V3) — the pump used to skip in silence, which is
                // how a stale reason survived on the row. Same record, same
                // announcement path as `startTask`; unchanged reasons are free.
                //
                // ‼️ M-11 — a moved dollar figure is SAVED (the row shows what
                // is true now) and not ANNOUNCED (it is the same ceiling).
                const rec = this.recordBlock(task, block);
                if (rec.touched) { this.save(); }
                if (rec.news) { this.announceParked(task, block); }
                continue;
            }
            task.autoStart = false;
            this.clearPark(task);
            this.launch(task);
        }
        // ‼️ X-176 — NO SECOND SCHEDULER: the sentry's "look again" is a
        // question asked on the beat the farm already keeps. `sentryDue` holds
        // every rule about when (a round on the board means no, a measured
        // sleep outranks the poll, an empty backlog is a wait).
        if (this.sentry && sentryDue(
            this.sentry, sentryRunning(this.tasks, this.sentry.id),
            this.opts.sentryPollMin?.() ?? SENTRY_DEFAULT_POLL_MIN, now)) {
            try { void Promise.resolve(this.opts.sentryTick?.()).catch(() => { /* see the port */ }); }
            catch { /* the campaign is not worth a crash */ }
        }
        // ‼️ X-178 — AND THE OTHER QUESTION THE SAME BEAT ASKS. `sentryDue` is
        // false precisely while a round is on the board, so nothing above ever
        // looks at the round that IS running — and that is the one state the
        // campaign cannot recover from by itself: a session parked on a
        // permission prompt never ends, so nothing ever drives the loop again.
        // Still no second scheduler: the same beat, a different question.
        this.watchSentryRound(now);
    }

    /**
     * ‼️ X-178 — IS THE ROUND ON THE BOARD STILL ALIVE?
     *
     * The decision is `stalledRound` and every rule is in it; this reads the one
     * fact it needs and carries out what it says. Only the RUNNER window may do
     * this — a follower mirrors the store (B11) and would be killing a process
     * it does not own.
     *
     * ‼️ ENDED AS FAILED, NEVER AS CANCELLED. Cancelling the round the sentry is
     * running is the USER saying stop, and the driver reads it that way and ends
     * the campaign — which is the opposite of what a watchdog is for. A failed
     * round is a barren one, so three stalls in a row still hit the failure
     * brake and a genuinely broken setup still stops.
     */
    private watchSentryRound(now: number): void {
        const rec = this.sentry;
        if (!rec || rec.status !== 'running' || !this.runner()) { return; }
        const round = this.tasks.find(t => !!t && t.sentryOf === rec.id
            && (t.status === 'running' || t.status === 'queued'));
        if (!round) { return; }
        const seen = this.lastActivityOf(round);
        const v = stalledRound({
            round: {
                id: round.id, status: String(round.status ?? ''),
                ...(round.startedAt ? { startedAt: round.startedAt } : {})
            },
            ...(seen ? { lastActivityAt: seen } : {}),
            limitMin: this.opts.sentryStallMin?.() ?? SENTRY_DEFAULT_STALL_MIN,
            now
        });
        if (!v.stalled) { return; }
        const child = this.processes.get(round.id);
        if (child) { this.killProcess(round.id, child); }
        noteTaskEvent(round, 'finished', `ended by the sentry watchdog — ${v.why}`);
        // ‼️ AND IT IS NOT RETRIED. A retry re-runs THIS row, with the same
        // prompt and the same permission mode, into the same parked prompt —
        // and holds the campaign for another watchdog period while it does it.
        // The campaign's own next round is the retry, and it is a fresh reading
        // of the backlog.
        this.finish(round, 'failed', { retry: false });
        // Silent stopping is forbidden by name in this item: the user finds this
        // in the morning without going looking for it.
        this.opts.announce?.({
            key: `sentry-stall:${round.id}`,
            title: `Sentry round ended — ${round.title}`,
            body: v.why,
            level: 2
        });
    }

    /**
     * The newest moment anything was SEEN from a run: its own output file, as
     * the filesystem stamps it.
     *
     * ‼️ THE CHEAPEST HONEST HEARTBEAT, and engine-agnostic — every engine's
     * lines go through the same runner into the same file, so nothing here has
     * to know one CLI's streaming format from another's. It is also the exact
     * signature of the state being watched for: a session waiting on a
     * permission prompt has printed the question and then nothing.
     *
     * 0 when there is no file yet, which is "not measured" rather than "silent"
     * — `stalledRound` refuses to end a round on that.
     */
    private lastActivityOf(task: FarmTask): number {
        if (!task.outputFile) { return 0; }
        try { return Math.round(fs.statSync(task.outputFile).mtimeMs); } catch { return 0; }
    }

    private launch(task: FarmTask): boolean {
        const agent = this.getAgents().find(a => a.id === task.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for task "${task.title}" not found.`);
            return false;
        }
        // ‼️ S-19 — A CONVERSATION THIS RUN CANNOT CONTINUE IS A REFUSAL, NEVER
        // A NEW ONE. Every engine here ignores an argument it has no flag for,
        // so the failure mode without this is the worst kind: a run that
        // succeeds, an archive that looks correct, and none of the context the
        // user asked for. An interactive run is refused for a plainer reason —
        // resume is a headless argument and the TUI path has its own.
        if (task.resumeSessionId) {
            const refused = task.mode !== 'headless'
                ? 'continuing an existing conversation is a headless run — an interactive one opens the '
                + 'session in a terminal, where the Console\'s own Resume does this properly'
                : headlessResumeRefusal(task.resumedEngine ?? task.engine, task.cli);
            if (refused) {
                void vscode.window.showWarningMessage(
                    `Agent Farm: "${task.title}" did not start — ${refused}`);
                task.status = 'failed';
                task.endedAt = Date.now();
                task.deferredReason = refused;
                task.deferredCode = undefined;
                noteTaskEvent(task, 'finished', `failed before it started — ${refused}`);
                this.save();
                return false;
            }
        }
        // ‼️ M-14 — …AND THE SAME RULE FOR AN EFFORT THE ENGINE HAS NO FLAG FOR.
        // A row outlives the engine it was written for: move a task from Claude
        // to OpenCode and the effort it was saved with is still on it and still
        // sent. Gemini exits 42 on one (measured) and OpenCode takes a
        // `--variant` no reachable model publishes — both of which look like a
        // run that worked, or a run that failed for no stated reason.
        {
            const refused = headlessEffortRefusal(task.engine, task.effort, task.cli, {
                transport: task.mode === 'headless' ? 'run'
                    : normInteractiveTarget(task.interactiveTarget) === 'console' ? 'hosted' : 'tui',
                model: task.model,
                variantsOf: this.opts.opencodeVariants
            });
            if (refused) {
                void vscode.window.showWarningMessage(
                    `Agent Farm: "${task.title}" did not start — ${refused}`);
                task.status = 'failed';
                task.endedAt = Date.now();
                task.deferredReason = refused;
                task.deferredCode = undefined;
                noteTaskEvent(task, 'finished', `failed before it started — ${refused}`);
                this.save();
                return false;
            }
        }
        // ‼️ The engine is checked before anything is spawned, and only when the
        // task actually names one — a CLI profile is a different mechanism with
        // its own binary, and asking the engine matrix about it would refuse a
        // profile that works perfectly well.
        if (task.engine && !task.cli) {
            const refused = this.opts.engineRefusal?.(task.engine);
            if (refused) {
                void vscode.window.showWarningMessage(
                    `Agent Farm: "${task.title}" did not start — ${refused}`);
                task.status = 'failed';
                task.endedAt = Date.now();
                // Not a park: the run is over. The sentence stays as the row's
                // explanation, the blocker CODE goes — a failed run holds no
                // ceiling, and leaving one would make the next park of a rerun
                // look like a continuation of this refusal (M-11).
                task.deferredReason = refused;
                task.deferredCode = undefined;
                noteTaskEvent(task, 'finished', `failed before it started — ${refused}`);
                this.save();
                return false;
            }
        }
        task.status = 'running';
        task.startedAt = Date.now();
        this.clearPark(task);
        // ‼️ S-19 — WHERE THE CONVERSATION'S METER STOOD BEFORE THIS TURN. Taken
        // at the spawn and not at the finish, because the difference between the
        // two readings is precisely what this run is responsible for. Without
        // it, a task resuming a week-old session would be billed for the week.
        if (task.resumeSessionId && task.resumeCostBefore === undefined) {
            const before = this.opts.sessionUsage?.(task.resumeSessionId, task.resumedEngine ?? task.engine);
            task.resumeCostBefore = before?.cost ?? 0;
            task.resumeTokensBefore = before?.tokens ?? 0;
        }
        noteTaskEvent(task, 'started', `${engineOf(task.engine).label} · ${task.mode}`
            + (task.model ? ` · ${task.model}` : '')
            + (task.resumeSessionId ? ` · resuming ${task.resumedFrom || task.resumeSessionId}` : ''));
        /**
         * ‼️ X-106 — AND WHETHER THE ROUTE IS STILL THE ONE THAT WAS CHOSEN.
         *
         * The seal was taken at the enqueue; this is the same resolver asked
         * again at the spawn. A difference is written on the run's own record
         * because nothing else can say it afterwards: the manifest states what
         * this run resolved to and is right about that, and a reader comparing
         * it against the profile as it stands TODAY learns nothing about the
         * night the two disagreed.
         *
         * It does not hold the run back. The route named on the task is still
         * the route the user asked for — an edited profile is a changed answer
         * to the same question, not a different question — and parking a
         * nightly batch over a revision bump would be a refusal nobody asked
         * for, arriving through a record-keeping item.
         */
        const sealedRoute = task.routeSeal ? routeOf(task) : undefined;
        if (sealedRoute) {
            const drift = sealDrift(task.routeSeal, this.opts.sealRoute?.(
                agent.id, engineOf(task.engine).id, sealedRoute));
            if (drift) { noteTaskEvent(task, 'route-drift', drift); }
        }
        /**
         * ‼️ X-109 — A TASK CONTINUING A CONVERSATION RUNS ON THAT
         * CONVERSATION'S ROUTE. `routeOf(task)` is what the run named
         * (sealed at enqueue) and absent is "none named" — until this item
         * absent then meant the agent's standing route at the spawn, which
         * is how a resumed nightly run was walked onto a route the
         * conversation never ran on. The gate reads the launch record: a
         * pin or an allowed switch is written onto the task so both spawn
         * shapes and the record read one answer; a refusal is a finished
         * run with the reason, never a task standing in `running`.
         */
        if (task.resumeSessionId && this.opts.resumeRoute) {
            const gate = this.opts.resumeRoute(
                agent.id, engineOf(task.engine).id, task.resumeSessionId, routeOf(task));
            if (gate.act === 'refuse') {
                void vscode.window.showWarningMessage(
                    `Agent Farm: "${task.title}" did not start — not resumed: ${gate.why}`);
                task.status = 'failed';
                task.endedAt = Date.now();
                task.deferredReason = gate.why;
                task.deferredCode = undefined;
                noteTaskEvent(task, 'finished', `failed before it started — not resumed: ${gate.why}`);
                this.save();
                return false;
            }
            if (gate.act !== 'none') {
                task.providerId = gate.providerId || undefined;
                task.tier = gate.tier || undefined;
                task.routePinned = gate.pinned;
                noteTaskEvent(task, 'route', `${gate.act}: ${gate.why}`);
            }
        }
        if (task.resumeSessionId && this.opts.reopenSetup) {
            const back = this.opts.reopenSetup(task.resumeSessionId, engineOf(task.engine).id, agent.name);
            const moved = closingOverRow(task, back);
            if (moved.length) {
                noteTaskEvent(task, 'setup', 'as its conversation closed: '
                    + moved.map(d => `${d} ${task[d] || '(default)'} → ${back[d]}`).join(', '));
                for (const d of moved) { task[d] = back[d]; }
            }
        }
        /**
         * ‼️ X-116 — A NAMED ROUTE THAT NO LONGER EXISTS IS REFUSED, NEVER FALLEN
         * THROUGH. Measured: a removed profile resolves to an `unknown` identity
         * with nothing injected AND NOTHING CLEARED, so the run started on
         * whatever route variables the shell carried — an endpoint nobody chose,
         * recorded as unknown. The drift event above said the profile went; this
         * is what the run then does about it, and it is the answer the same
         * route gets at the enqueue.
         */
        const named = routeOf(task);
        const gone = named && this.opts.routeRefusal?.(
            engineOf(task.engine).id, named.providerId ?? '', named.tier ?? '');
        if (gone) {
            const why = `the route it names cannot be run on now: ${gone} Point the task at a route `
                + 'that exists, or clear its route to run on the agent\'s own.';
            void vscode.window.showWarningMessage(`Agent Farm: "${task.title}" did not start — ${why}`);
            task.status = 'failed';
            task.endedAt = Date.now();
            task.deferredReason = why;
            task.deferredCode = undefined;
            noteTaskEvent(task, 'finished', `failed before it started — ${why}`);
            this.save();
            return false;
        }
        /**
         * ‼️ X-102 — THE MANIFEST, AT THE ONE POINT EVERY SHAPE OF A RUN PASSES
         * THROUGH.
         *
         * Written here rather than beside each spawn for the reason the route
         * environment is built once above: three shapes leave this method and a
         * record written in three places is two places somebody can forget. It
         * is also the last line at which the run is still only intended — a
         * manifest with no run attached is a run that failed to start, and that
         * is an answer worth keeping.
         *
         * ‼️ THE CONSOLE SHAPE IS SKIPPED ON PURPOSE: that branch hands the spawn
         * to the panel, and the Console door writes its own manifest with its
         * own surface. Recording here as well would put two rows under one run
         * and make "which setup did it have" depend on which was read first.
         *
         * ‼️ X-327 — AND "THE CONSOLE DOOR WRITES IT" IS NOW TRUE. For four
         * releases this sentence described an intention nobody had implemented:
         * the skip was here, `consoleTaskStart` recorded nothing, and a task
         * hosted in the Console had no manifest at all — its resume read back
         * as unknown. The door writes it because the ACCOUNT is resolved there:
         * a rule (`@round-robin`) becomes a slot at the pick, and a record
         * written on this side would name the rule against a run that went to
         * one sign-in. The mechanism travels with the spec so the record still
         * says what set the run going.
         */
        const target = normInteractiveTarget(task.interactiveTarget);
        const hostedHere = task.mode !== 'headless' && target === 'console'
            && !!this.opts.startConsoleTask;
        if (!hostedHere) {
            task.launchId = this.opts.recordLaunch?.({
                agentId: agent.id,
                engine: engineOf(task.engine).id,
                options: launchDimsOf(task),
                // The folder the process is really spawned in — the same rule the
                // binding follows, and the reason a task in a code repo is not
                // filed under the agent's own folder.
                cwd: task.workDir ?? agent.dir,
                ...(task.projectId ? { projectId: task.projectId } : {}),
                ...this.launchMechanismOf(task),
                surface: task.mode === 'headless'
                    ? 'headless' : target === 'external' ? 'external-terminal' : 'terminal'
            });
        }
        if (task.mode === 'headless') {
            this.spawnHeadless(task, agent);
        } else if (normInteractiveTarget(task.interactiveTarget) === 'console'
            && this.opts.startConsoleTask) {
            // ‼️ M-26 — THE CONSOLE IS NOT A TERMINAL WITH A DIFFERENT SKIN.
            // There is no command line to build: the panel owns the process, so
            // the run is described (agent · engine · launch dimensions · first
            // prompt) and the panel starts it. What comes back is the hosted
            // session's id, which is the ONE thing that lets this task be
            // followed afterwards — see `watchConsoleTasks`.
            const started = this.opts.startConsoleTask({
                task, agentId: agent.id, agentName: agent.name,
                cwd: task.workDir ?? agent.dir, prompt: task.prompt,
                ...this.launchMechanismOf(task)
            });
            if (started) {
                task.consoleSessionId = started.sessionId;
                task.launchId = started.launchId;
                noteTaskEvent(task, 'started', 'handed to the Console — the panel hosts the conversation');
                this.startInteractiveWatch();
            } else {
                // The panel refused (no such engine on this machine, most
                // often). A refusal is a finished run with a reason, never a
                // task left standing in `running` with nothing behind it.
                this.finish(task, 'failed');
                noteTaskEvent(task, 'finished', 'the Console could not start it — see the warning it showed');
            }
        } else {
            const p = sanitizePrompt(task.prompt);
            let extra = this.extraArgs().trim();
            const profile = this.cliProfileFor(task);
            // ‼️ M-26 — ONE TURN MEANS THE ENGINE'S ONE-SHOT FORM. `auto-close`
            // is not "the same conversational run, killed when it looks done":
            // a TUI is finished when the person quits it, and nothing in it says
            // "the answer is over". So the engine is asked in the form that
            // prints and exits — the same form the headless path uses — and the
            // shell is told to leave when it does. The surface is still a
            // terminal you watch; what changed is that the run has an end.
            const oneShot = normInteractiveClose(task.interactiveClose) === 'auto-close';
            let command: string;
            if (profile) {
                // A profile states both forms itself; one turn is what its
                // `headless` template is, and a profile that has only one
                // template gets that one whichever was asked for.
                command = buildCliCommand(
                    oneShot ? profile.headless : (profile.interactive ?? profile.headless),
                    task.prompt, extra);
            // ‼️ NOT `=== 'perTurn'` — "anything that is not Claude" is the real
            // question here (K-25). OpenCode's hosted shape is a shared ACP
            // connection, but a TASK is `opencode run --format json`, which has
            // its own vocabulary exactly like the per-turn engines do. Read as
            // Claude it would be handed `agentFarm.taskArgs`, which is Claude's
            // flag set, and the terminal would print "unexpected argument".
            } else if (engineOf(task.engine).shape !== 'persistent') {
                // ‼️ ANOTHER ENGINE IS ANOTHER PROGRAM, NOT ANOTHER FLAG SET.
                // `agentFarm.taskArgs` (`extra`) is claude's vocabulary — passing
                // it to `codex` would produce "unexpected argument" and a
                // terminal the user has to read. The flags come from the measured
                // vocabulary instead (consoleEngine.ts), and the permission mode
                // becomes this engine's sandbox because it has nobody to ask.
                const engine = engineOf(task.engine);
                const dims = {
                    model: task.model, effort: task.effort,
                    permissionMode: task.permissionMode,
                    // ‼️ Antigravity works in its own scratch folder unless it
                    // is handed one; the terminal's cwd below is not enough.
                    cwd: task.workDir ?? agent.dir
                };
                command = [
                    engine.exe,
                    // `runArgs` is the SAME measured vocabulary the headless
                    // path spawns with — one turn in a terminal is that run,
                    // watched. Reaching for a different flag set here would be a
                    // second answer to "how does this engine take a prompt".
                    ...(oneShot ? runArgs(engine.id, dims) : tuiArgs(engine.id, dims)),
                    // …and on two of the three the first prompt is a FLAG, not a
                    // positional, or the terminal answers once and closes where a
                    // person expected to sit in the conversation
                    // (engineFirstPromptFlag carries the measurement).
                    ...(oneShot ? [] : engineFirstPromptFlag(engine.id)),
                    `"${p}"`
                ].join(' ');
            } else {
                const policy = this.modelArgs(task, agent.id);
                if (policy) { extra = (extra ? extra + ' ' : '') + policy.args; }
                const launch = this.launchArgs(task);
                if (launch) { extra = (extra ? extra + ' ' : '') + launch; }
                // `-p` is claude's print-and-exit, exactly as the headless path
                // builds it — the difference is only where the output lands.
                command = `claude ${extra ? extra + ' ' : ''}${oneShot ? '-p ' : ''}"${p}"`;
            }
            this.openInteractive(task, agent, command);
        }
        this.save();
        return true;
    }

    /** ‼️ X-109 — the route a spawn resolves: the task's own, and PINNED
     *  (empty included) once the resume gate has answered for it. */
    private spawnRouteOf(task: FarmTask): { providerId?: string; tier?: string; pinned?: boolean } | undefined {
        const route = routeOf(task);
        return task.routePinned ? { providerId: '', ...(route ?? {}), pinned: true } : route;
    }

    /**
     * ‼️ M-26 — PUT THE RUN WHERE THE TASK ASKED FOR IT.
     *
     * Two surfaces reach here (the Console never builds a command line at all).
     * They differ in ONE thing that matters afterwards: VS Code's terminal is an
     * object this extension holds, so its close and its exit code are events;
     * an OS window is not, and nothing about it can be observed from here. So
     * the external launch writes the CLI's own exit code into a file and the
     * watcher below reads it — the process's real answer, through the only
     * channel a detached window has.
     */
    private openInteractive(task: FarmTask, agent: AgentInfo, command: string): void {
        const cwd = task.workDir ?? agent.dir;
        const target = normInteractiveTarget(task.interactiveTarget);
        const close = normInteractiveClose(task.interactiveClose);
        /**
         * ‼️ X-104 — BOTH TARGETS, ONE ENVIRONMENT. It used to be built inside
         * the integrated branch only, so the SAME task run in an OS window went
         * out with neither the agent's variables nor the route's endpoint and
         * key — the target a person picks is about where they want to watch the
         * run, and it has never been a statement about what it should run on.
         */
        const env = terminalEnvOverlay(
            // ‼️ X-169 — the same layer on the terminal surface. Leaving a name
            // out here does NOT remove it (only `null` does), which is exactly
            // why the account goes through `terminalEnvOverlay` rather than
            // being written onto the map by hand.
            [this.opts.getEnv?.(agent.id),
                this.opts.accountLayer?.(task.engine ?? 'claude', task.account, agent.id)],
            // ‼️ X-106 — AND THE ROUTE THE TASK ITSELF NAMED. This passed nothing
            // and the agent's standing route answered for every automation; a
            // nightly job pointed at one endpoint by hand ran on whichever one
            // the agent was set to when it fired. `undefined` is unchanged
            // behaviour for every task written before the dimension existed.
            this.opts.engineRuntime?.(agent.id, task.engine ?? 'claude', this.spawnRouteOf(task)),
            { windowEnv: process.env });
        if (target === 'external') {
            fs.mkdirSync(this.outputsDir, { recursive: true });
            const exitFile = path.join(this.outputsDir, `${task.id}.exit`);
            try { fs.rmSync(exitFile, { force: true }); } catch { /* nothing to clear */ }
            task.exitFile = exitFile;
            openExternalTerminal(cwd, command, `AF: ${task.title.slice(0, 30)}`, {
                // `auto-close` is the whole reason `keepOpen` exists: the window
                // is there to be watched, not to be dismissed afterwards.
                keepOpen: close !== 'auto-close',
                exitFile,
                env
            });
            this.externalWatch.add(task.id);
            this.startInteractiveWatch();
            noteTaskEvent(task, 'started', close === 'auto-close'
                ? 'in an OS terminal window — one turn, then it closes'
                : 'in an OS terminal window — it stays open for you');
            return;
        }
        const terminal = vscode.window.createTerminal({
            name: `AF: ${task.title.slice(0, 30)}`,
            cwd,
            // ‼️ X-101 — AN OVERLAY, SO ABSENCE IS NOT AN INSTRUCTION HERE. VS
            // Code merges this onto the window's own environment, which means a
            // route name simply left out survives inherited and untouched. The
            // clearing has to be said out loud, as `null`.
            env
        });
        terminal.show();
        // ‼️ THE EXIT IS A SECOND LINE, NOT `&& exit`. The shell here is
        // whatever the user's default is (pwsh, cmd, bash), and the three do not
        // agree on chaining — but every one of them takes `exit` on its own
        // line, and it runs when the CLI above has returned because that is what
        // a line in a shell means. `onDidCloseTerminal` then finishes the task
        // on the path it has always used.
        // ‼️ K-33 — both lines go through the same gate, in this order, once the
        // shell has finished starting. Sent blind they raced the shell's own
        // init; and `exit` racing ahead of the command it is supposed to follow
        // would have closed the terminal on a task that never ran.
        sendToTerminalWhenReady(terminal,
            ...(close === 'auto-close' ? [command, 'exit'] : [command]));
        this.terminals.set(task.id, terminal);
    }

    /**
     * ‼️ M-26 — THE ONLY HONEST WAY TO FOLLOW A WINDOW WE DO NOT OWN.
     *
     * A detached `wt` returns the moment it has handed the command to the
     * terminal server, so its own exit code is about the launcher and not about
     * the run. The alternative that suggests itself — "the transcript has been
     * quiet for a while, call it done" — is a guess that would mark a thinking
     * agent finished, so it is not used. The launch appends a line that writes
     * the CLI's exit code to a file; this reads it, once it is there.
     *
     * The timer exists only while something is being watched — an idle farm
     * pays nothing for a surface nobody is using. It drives the Console's
     * follow-up too: both are interactive runs this manager did not spawn, and
     * a second interval for the second one would be two beats for one question.
     */
    private startInteractiveWatch(): void {
        if (this.externalTimer) { return; }
        this.externalTimer = setInterval(() => {
            this.pumpExternalWatch();
            this.pumpConsoleTasks();
            if (!this.externalWatch.size && !this.tasks.some(
                t => t.status === 'running' && t.consoleSessionId)) {
                clearInterval(this.externalTimer);
                this.externalTimer = undefined;
            }
        }, 2_000);
    }

    private pumpExternalWatch(): void {
        for (const id of [...this.externalWatch]) {
            const task = this.tasks.find(t => t.id === id);
            // Gone, cancelled, or finished from somewhere else: stop watching.
            if (!task || task.status !== 'running' || !task.exitFile) {
                this.externalWatch.delete(id);
                continue;
            }
            let raw: string;
            try { raw = fs.readFileSync(task.exitFile, 'utf8'); } catch { continue; }
            // ‼️ THE FILE EXISTS BEFORE IT HAS ANYTHING IN IT. The shell creates it
            // on the redirection and writes a moment later, so a tick landing in
            // between reads "" — and `Number("")` is 0, which would finish a run
            // that is still going, as a success. An empty read is "not yet"; the
            // next tick is two seconds away.
            if (!raw.trim()) { continue; }
            this.externalWatch.delete(id);
            // The file is written by the shell, so the code is text and may be
            // padded; anything that is not a clean zero is a failure, including
            // a file we cannot read a number out of at all.
            const code = Number(String(raw).trim().split(/\s+/)[0]);
            noteTaskEvent(task, 'finished', Number.isFinite(code)
                ? `the OS terminal's CLI exited with ${code}`
                : 'the OS terminal reported an exit this window could not read');
            this.finish(task, code === 0 ? 'done' : 'failed');
            try { fs.rmSync(task.exitFile, { force: true }); } catch { /* it can stay */ }
        }
    }

    /**
     * ‼️ M-26 — A CONSOLE-HOSTED TASK IS FOLLOWED THROUGH THE PANEL'S OWN
     * REPORT, not through a process this manager spawned. `consoleTaskState`
     * answers what the hosted session is doing right now; `auto-close` ends the
     * task the first time that session comes back to rest with an answer
     * behind it, and `stay-open` waits for the session itself to end.
     */
    pumpConsoleTasks(): void {
        const read = this.opts.consoleTaskState;
        if (!read) { return; }
        let named = false;
        for (const task of this.tasks) {
            if (task.status !== 'running' || !task.consoleSessionId) { continue; }
            const st = read(task.consoleSessionId);
            if (!st) { continue; }
            if (st.sessionId && task.hostedSessionId !== st.sessionId) { task.hostedSessionId = st.sessionId; named = true; }
            // ‼️ S-93 — A REMOVED CARD ENDS ITS ROW. "End & remove" drops the card
            // from the Console, and a row still `running` on it held its agent's
            // one seat until the next reload: a relay's successor sat parked
            // "agent busy" behind the very leg it succeeded (measured 80 min).
            // `cancelled`, because a person ended it — and the failsafe reads
            // that as "ended by the user" (batonLegFacts.ts), not as a crash.
            if (st.state === 'gone') {
                noteTaskEvent(task, 'finished', 'its Console card was removed — the conversation ended with it');
                this.finish(task, 'cancelled');
                continue;
            }
            if (st.state === 'ended') {
                noteTaskEvent(task, 'finished', `the Console session ended — ${st.reason || 'closed'}`);
                this.finish(task, st.failed ? 'failed' : 'done');
                continue;
            }
            if (st.state === 'error') {
                noteTaskEvent(task, 'finished', `the Console session failed — ${st.reason || 'no reason given'}`);
                this.finish(task, 'failed');
                continue;
            }
            // ‼️ `answered` and not merely `idle`: a session is idle for the
            // whole moment between being started and being spoken to, and
            // finishing the task there would end it before the agent had said
            // anything at all.
            if (normInteractiveClose(task.interactiveClose) === 'auto-close' && st.answered) {
                noteTaskEvent(task, 'finished',
                    'the agent finished its first answer — the conversation stays in the Console');
                this.finish(task, 'done');
            }
        }
        if (named) { this.save(); }
    }

    /** Explicit per-task model (mission member override) beats the policy engine.
     *  Strict charset: a stored value can never smuggle shell syntax. */
    /**
     * ‼️ X-102 — WHAT SET THIS RUN GOING, in the manifest's vocabulary.
     *
     * The same precedence the binding uses and deliberately the same words
     * (`LaunchMechanism` shares its vocabulary with `LaunchBinding.kind`): two
     * spellings of `schedule` would be two mechanisms as far as a reader is
     * concerned.
     *
     * ‼️ IT READS THE TASK'S OWN FIELDS AND DOES NOT WALK THE RETRY CHAIN. A
     * retry IS a new spawn, with its own route resolution and its own manifest —
     * that is the whole reason the record is keyed by `launchId` and not by
     * `taskId`. Naming the origin's mechanism here would describe the run that
     * came before this one. Walking the chain is the BINDING's job, where the
     * question is "whose work is this" rather than "what was started".
     */
    private launchMechanismOf(task: FarmTask): {
        mechanism: 'task' | 'schedule' | 'trigger' | 'workflow' | 'mission';
        mechanismId?: string;
    } {
        if (task.missionId) { return { mechanism: 'mission', mechanismId: task.missionId }; }
        if (task.fromSchedule) { return { mechanism: 'schedule', mechanismId: task.fromSchedule }; }
        if (task.fromTrigger) { return { mechanism: 'trigger', mechanismId: task.fromTrigger }; }
        if (task.workflowId) { return { mechanism: 'workflow', mechanismId: task.workflowId }; }
        return { mechanism: 'task' };
    }

    private modelArgs(task: FarmTask, agentId: string): { args: string; reason: string } | undefined {
        const picked = task.model && modelIdOk(task.model)
            ? { args: `--model ${task.model}`, reason: `explicit override (${task.model})` }
            : this.opts.modelArgsFor?.(task);
        // ‼️ X-495 — an Anthropic model, picked or chosen by policy, is asked of a third-party route by its alias.
        const flag = /^--model (\S+)$/.exec(picked?.args.trim() ?? '');
        if (!picked || !flag) { return picked; }
        const m = routedModel(flag[1], this.opts.engineRuntime?.(agentId, task.engine ?? 'claude', this.spawnRouteOf(task)));
        if (m === flag[1]) { return picked; }
        return m ? { args: `--model ${m}`, reason: `${picked.reason}; asked of the route as ${m}` } : undefined;
    }

    /**
     * The launch dimensions beyond the model — effort and permission mode.
     *
     * ‼️ SAME CHARSET GUARD AS THE MODEL, AND FOR THE SAME REASON. These strings
     * are stored on disk (farm-tasks.json), can be written by the bridge, and end
     * up inside a command line handed to a shell. The picker only ever offers
     * values from launch.ts, but a hand-edited store must not be able to smuggle
     * shell syntax through — anything that is not a bare word is simply dropped,
     * which degrades to "the CLI's own default" rather than to a broken run.
     */
    private launchArgs(task: FarmTask): string {
        const parts: string[] = [];
        const bare = (v?: string) => (v && /^[\w-]+$/.test(v) ? v : '');
        const effort = bare(task.effort);
        const perm = bare(task.permissionMode);
        if (effort) { parts.push(`--effort ${effort}`); }
        // ‼️ K-22 — AND BYPASS IS SPELLED THE WAY IT IS ENFORCED, HERE MOST OF
        // ALL. `--permission-mode bypassPermissions` is read through a branch
        // the CLI guards and can downgrade, and a headless run is the one place
        // where nobody is watching at all: the prompt goes to a tty with no
        // human on it and the run sits there until it times out. The spelling
        // comes from `permissionFlags`, shared with the Console and the terminal
        // launcher — three places spelling it themselves is what this item is.
        if (perm) {
            const decision = chosenPermission(perm);
            if (decision.bypass) { parts.push(...permissionFlags(decision).launch); }
            else { parts.push(`--permission-mode ${perm}`); }
        }
        return parts.join(' ');
    }

    /** The project brief as TEXT — for an engine with no system-prompt channel.
     *  Unreadable is not worth failing a run over: it runs unbriefed, which is
     *  the state a task with no project would have been in. */
    private readContext(file: string | undefined): string {
        if (!file) { return ''; }
        try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
    }

    /** J5: resolve the task's CLI profile (undefined = the default claude executor). */
    private cliProfileFor(task: FarmTask): CliProfile | undefined {
        if (!task.cli) { return undefined; }
        return this.opts.cliProfiles?.().find(p => p.name === task.cli);
    }

    /** Headless tasks run as child processes so stdout/stderr land in an archived output file. */
    private spawnHeadless(task: FarmTask, agent: AgentInfo, retryNote?: string): void {
        const spawnedAt = Date.now();
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        const profile = this.cliProfileFor(task);
        const engine = engineOf(task.engine);
        // ‼️ "HAS ITS OWN COMMAND VOCABULARY", not "is per-turn" — see the note in
        // the terminal path above. Claude is the one engine whose headless run is
        // built as a string here; every other one goes through `runArgs`.
        const perTurn = !profile && engine.shape !== 'persistent';
        const policy = profile || perTurn ? undefined : this.modelArgs(task, agent.id);
        const header = `# ${task.title}\n\n` +
            `- Agent: ${task.agentName}\n` +
            `- Started: ${new Date().toLocaleString()}\n` +
            // ‼️ WHICH ENGINE, IN THE ARCHIVE ITSELF. Months later this file is
            // the only record of the run, and "why does this output look nothing
            // like the others" has exactly one answer.
            (engine.id !== 'claude' ? `- Engine: ${engine.label}\n` : '') +
            // ‼️ S-19 — AND WHICH CONVERSATION IT CONTINUED. The archive is the
            // only record of the run months later, and "why does this answer
            // assume things the prompt never said" has exactly one answer: it
            // was not a fresh conversation. The full id, because that is what
            // opens the transcript.
            (task.resumeSessionId
                ? `- Resumed conversation: ${task.resumeSessionId}`
                + (task.resumedFrom ? ` (${task.resumedFrom})` : '')
                // ‼️ M-14 — and WHY this run's prompt looks shorter than the
                // first one's. Without this line the missing brief reads as a
                // bug months later, when the archive is the only record left.
                + (perTurn ? ' — the project brief is not repeated; it is already in this conversation' : '')
                + '\n'
                : '') +
            (profile ? `- CLI: ${profile.name}\n` : '') +
            (policy ? `- Model policy: ${policy.reason}\n` : '') +
            (perTurn && task.model ? `- Model: ${task.model}\n` : '') +
            // ‼️ …and what the mode actually MEANS on this engine, which is not
            // the same sentence twice. On Codex it is a SANDBOX and never a
            // question it will ask; on Antigravity it is a request the app's own
            // permission setting can overrule — measured, plan mode still wrote
            // a file. The word alone would carry an assumption neither can keep.
            (perTurn
                ? (() => {
                    // ‼️ NAMED BY THE ENGINE, NOT BY THE FIRST ONE THAT HAD ONE.
                    // Codex has a sandbox, Gemini has an approval mode, and
                    // Antigravity has neither — its restraint is the app's own
                    // setting. Writing "Sandbox" over all three told the reader
                    // a mechanism was in place that is not.
                    const set = enginePermissionSetting(engine.id, task.permissionMode);
                    const note = engineModeNote(engine.id, task.permissionMode);
                    return set
                        ? `- ${set.label}: ${set.value} — ${note}\n`
                        : `- Permissions: ${note}\n`;
                })()
                : '') +
            // ‼️ AND THAT THE BODY BELOW IS AN ENVELOPE, NOT A TRANSCRIPT. This
            // engine states no price, so its token count is the only record of
            // what the run cost — and the count, the answer and the conversation
            // id all ride in the one object `--output-format json` prints. A
            // plain-text run would read more easily and record none of it.
            (perTurn && engine.id === 'agy'
                ? '- Output: one `agy --output-format json` envelope — `response` is the answer, `usage` is what it cost, `conversation_id` is what resumes it\n'
                : perTurn && engine.id === 'gemini'
                    ? '- Output: one `gemini --output-format json` envelope — `response` is the answer, `stats` is what it cost, `session_id` is what resumes it\n'
                    // ‼️ M-14 — AND THE ONE THAT IS NOT AN ENVELOPE AT ALL. Saying
                    // "envelope" over this engine too would send whoever reads the
                    // archive looking for an object that is not there; it prints a
                    // stream (core/opencoderun.ts, measured).
                    : perTurn && engine.id === 'opencode'
                        ? `- Output: ${OPENCODE_RUN_OUTPUT_NOTE}\n`
                        : '') +
            // ‼️ AND WHAT THIS ENGINE COULD NOT HONOUR. The JSON output contract
            // is `claude -p --output-format json` — one envelope with the result,
            // the cost and the session id in it. `codex exec --json` is a
            // different thing entirely (a JSONL event stream), so the contract is
            // not applied here. A workflow condition reading `json:` off this
            // output will simply not match, and that has to be findable in the
            // file rather than debugged from the outside.
            (perTurn && task.outputContract === 'json'
                ? '- Output contract: json was NOT applied — that envelope is Claude Code\'s own format and this engine has no equivalent\n' : '') +
            // The rest of the launch, written down where the run itself is: an
            // archived output that does not say what the run was told to be is
            // half a record.
            (task.effort ? `- Effort: ${task.effort}\n` : '') +
            (task.permissionMode ? `- Permission mode: ${task.permissionMode}\n` : '') +
            (task.workDir ? `- Workdir: ${task.workDir}\n` : '') +
            `- Prompt: ${task.prompt}\n\n---\n\n`;
        // X-329: a retry keeps the first attempt's record and says why it ran again.
        if (retryNote) { fs.appendFileSync(outFile, retryNote, 'utf8'); } else { fs.writeFileSync(outFile, header, 'utf8'); }
        const stream = fs.createWriteStream(outFile, { flags: 'a' });

        const p = sanitizePrompt(task.prompt);
        let extra = this.extraArgs().trim();
        if (policy) { extra = (extra ? extra + ' ' : '') + policy.args; }
        // Effort and permission mode ride on the same path the model does, and
        // only on claude's: a named CLI profile is a different binary that knows
        // nothing about these flags (same rule as the project context below).
        if (!profile && !perTurn) {
            const launch = this.launchArgs(task);
            if (launch) { extra = (extra ? extra + ' ' : '') + launch; }
            if (task.browserRun && !task.browserRun.mcpConfig.includes('"')) { extra = (extra ? extra + ' ' : '') + browserMcpArgs(task.browserRun.mcpConfig); }
        }
        if (task.outputContract === 'json' && !perTurn) {
            extra = (extra ? extra + ' ' : '') + '--output-format json';
        }
        // The project this task was created under, told to the agent before its
        // prompt. A FILE, and quoted: this string goes to a shell, where an
        // unquoted path breaks on a space and inline multi-line text breaks
        // outright (measured — see core/projectContext.ts).
        const ctxFile = this.opts.projectContextFile?.(task);
        if (ctxFile && !ctxFile.includes('"') && !perTurn) {
            extra = (extra ? extra + ' ' : '') + `--append-system-prompt-file "${ctxFile}"`;
            // ‼️ X-267 — remember what really went out, so the round that
            // resumes this conversation can be handed the same bytes. Only a
            // run that is OPENING one: a round was already given the pin, and
            // re-filing it would be the fix overwriting itself.
            if (!task.resumeSessionId) { this.pinSource.set(task.id, ctxFile); }
        }
        // ‼️ S-19 — CLAUDE'S RESUME, ON CLAUDE'S PATH. The persistent engine's
        // task command is a string, so its resume flag joins the other flags —
        // from `claudeResumeArgs`, which is where the vocabulary lives, and NOT
        // spelled inline here. It goes in `extra`, i.e. BEFORE `-p`: everything
        // after `-p`'s value belongs to the prompt.
        const resumeId = String(task.resumeSessionId ?? '').trim();
        // Bare-word only — an id comes from an index, but a hand-edited store
        // must not be able to push shell syntax through a string command line.
        const safeResume = /^[\w.-]+$/.test(resumeId) ? resumeId : '';
        if (safeResume && !profile && !perTurn) {
            extra = claudeResumeArgs(safeResume).join(' ') + (extra ? ' ' + extra : '');
        }
        // ‼️ X-321 — …AND A RUN THAT OPENS A CONVERSATION IS TOLD ITS ID, so the
        // binding is declared instead of deduced off a clock that back-to-back
        // runs in one folder make ambiguous (`claudeNewSessionArgs`).
        const declaredId = !safeResume && !profile && !perTurn ? randomUUID() : '';
        if (declaredId) {
            extra = claudeNewSessionArgs(declaredId).join(' ') + (extra ? ' ' + extra : '');
            task.spawnSessionId = declaredId;
        } else {
            delete task.spawnSessionId;
        }
        // ‼️ ON A PER-TURN ENGINE THE PROMPT GOES DOWN A PIPE, NOT ONTO THE
        // COMMAND LINE — which is what lets it carry the project brief and its
        // own newlines. `codex` has no system-prompt flag at all (measured
        // against its own --help), so the brief has to be part of the prompt or
        // it does not reach the run; and stdin is the one channel a shell does
        // not mangle. Everything Claude's path expresses as flags is expressed
        // here in the measured vocabulary instead (codexRunArgs).
        // ‼️ M-14 — AND IT GOES IN ONCE, AT THE START OF THE CONVERSATION.
        // On a CONTINUATION the brief is already in the conversation: a resume
        // only happens on an engine `headlessResumeRefusal` has measured to
        // carry its own context, so repeating it pays for the same tokens a
        // second time and re-introduces a project the model has been working in
        // since turn one. Worse on this engine than on the others, because
        // OpenCode's brief is the largest thing in the prompt and every
        // `step_finish` bills the cache read that carries it.
        const perTurnPrompt = perTurn
            ? (safeResume ? '' : engineContextPrefix(this.readContext(ctxFile))) + task.prompt
            : '';
        // ‼️ …EXCEPT ON THE ENGINE THAT HAS NO PIPE FOR IT. `agy --print` takes
        // the prompt as its VALUE and reads nothing from stdin (measured: an
        // empty `--print` with the text piped in exits 1). So on that engine the
        // whole run is an argv array spawned with NO SHELL — the only way a
        // multi-line prompt survives on Windows — and the string-and-a-shell
        // path below is left exactly as it was for everything else.
        const argv = perTurn && engine.promptOn === 'argv'
            ? ['--print', perTurnPrompt, ...runArgs(engine.id, {
                model: task.model, effort: task.effort,
                permissionMode: task.permissionMode,
                // …and it must be told which folder it may see, or it answers
                // about its own scratch workspace instead.
                cwd: task.workDir ?? agent.dir,
                // ‼️ S-19 — one field, and each engine's own adapter turns it
                // into that engine's flag (`--conversation` here).
                ...(safeResume ? { resume: safeResume } : {})
            })]
            : undefined;
        // A named CLI profile runs a DIFFERENT binary, which knows nothing about
        // --append-system-prompt-file; the project context is claude's channel
        // and stays on claude's path.
        const command = profile
            ? buildCliCommand(profile.headless, task.prompt, this.extraArgs())
            : perTurn
                ? [engine.exe, ...runArgs(engine.id, {
                    model: task.model, effort: task.effort,
                    permissionMode: task.permissionMode,
                    ...(safeResume ? { resume: safeResume } : {})
                })].join(' ')
                : `claude ${extra ? extra + ' ' : ''}-p "${p}"`;
        const pipePrompt = perTurn && !argv;
        /**
         * ‼️ X-39 — OPENCODE'S INSTRUCTION WALK STOPS AT THE GIT WORKTREE, so an
         * agent folder that is its own repository never sees the shared
         * constitution one level up. When that is this agent's situation the
         * launch hands OpenCode the missing entry through its own environment;
         * in the normal layout the walk already reaches it and this is `{}`.
         * Everything about why lives in `core/opencodesync.ts`.
         */
        const engineEnv = engine.id === 'opencode'
            ? opencodeSpawnEnv(agent.dir, agent.constitutionPath)
            : {};
        /**
         * ‼️ X-101 — WHERE THE INHERITED ROUTE STOPS BEING A SECOND ANSWER.
         *
         * `{ ...process.env, … }` is the right default for four engines and a
         * silent defect for the fifth once Agent Farm owns the route: an
         * `ANTHROPIC_BASE_URL` in the user's shell answers the same question the
         * chosen profile answers, and the child obeys the inherited one for
         * everything the profile did not name. Two routes in one session — and
         * the transcript does not record which served it (measured, X-98), so
         * nothing would ever say so.
         *
         * Built ONCE and used by both spawn shapes below: written out twice,
         * the second is where somebody forgets, and a run that quietly kept the
         * inherited route looks exactly like one that did not.
         */
        // ‼️ X-106 — the task's own route, on the headless path too. Both
        // spawn shapes read it from the same helper, because the way this
        // regresses is one of the two being given the route and the other
        // being left inheriting (see `openInteractive`). Held in a name of its
        // own because the output below needs to know what was injected (X-115).
        const routeRuntime = this.opts.engineRuntime?.(agent.id, engine.id, this.spawnRouteOf(task));
        const spawnEnv = spawnEnvironment(
            process.env,
            // ‼️ X-169 — the account is one more LAYER on the list this argument
            // already is; no second injection path, so the clearing order below
            // stays the one thing that decides what survives.
            [engineEnv, this.opts.getEnv?.(agent.id),
                this.opts.accountLayer?.(engine.id, task.account, agent.id)],
            routeRuntime
        );
        const child = argv
            ? cp.spawn(engine.exe, argv, {
                cwd: task.workDir ?? agent.dir,
                shell: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: spawnEnv
            })
            : cp.spawn(command, {
                cwd: task.workDir ?? agent.dir,
                shell: true,
                windowsHide: true,
                // closed stdin: claude won't wait 3s for piped input. A per-turn
                // engine is the exception — its instruction IS what goes down that
                // pipe, and it is closed immediately after (measured: the CLI waits
                // for EOF, and an open pipe is a run that never starts).
                stdio: [pipePrompt ? 'pipe' : 'ignore', 'pipe', 'pipe'],
                env: spawnEnv
            });
        if (pipePrompt) {
            try {
                child.stdin?.write(perTurnPrompt);
                child.stdin?.end();
            } catch { /* the close handler reports what the run did */ }
        }
        this.processes.set(task.id, child);
        // X-321 — known at the spawn, so written at the spawn: a run killed a
        // second from now is still one somebody can find and resume.
        if (declaredId) { this.setRunProgress(task.id, { sessionId: declaredId }); }
        /**
         * ‼️ M-14 — THIS ENGINE STATES ITS OWN CONVERSATION ID AND ITS OWN PRICE,
         * AND THE ARCHIVE WAS THE ONLY PLACE EITHER OF THEM LANDED.
         *
         * Every other engine's run is bound to a session afterwards, by matching
         * a transcript the index found on disk. `opencode run --format json` does
         * not need that and cannot wait for it: `sessionID` is on the FIRST line
         * it prints, so the binding can be made while the run is still going —
         * which is the difference between a killed run that is still resumable
         * and one nobody can find. Same for the money: the steps carry real
         * dollars, so the row does not have to sit blank until something else
         * discovers them.
         *
         * The reader is `core/opencoderun.ts` and it is the ONLY one, which is
         * the rule M-14 states by name — nothing here parses a line itself.
         */
        const opencodeRun = perTurn && engine.id === 'opencode';
        let bound = '';
        let seen = '';
        /**
         * ‼️ X-115 — THE OUTPUT FILE IS AN ARTEFACT AGENT FARM KEEPS, so the
         * route's key does not get into it even when the CLI quotes it back
         * (a proxy error echoing a header, a debug line). Only the values this
         * spawn was handed as SECRETS are scrubbed; with none — almost every
         * run — the scrubber is inactive and the raw bytes are written exactly
         * as they always were.
         */
        const scrub = new SecretScrubber(secretValuesOf(routeRuntime?.spawnEnv));
        const put = (chunk: Buffer | string): void => {
            if (!scrub.active) { stream.write(chunk); return; }
            const safe = scrub.push(chunk);
            if (safe) { stream.write(safe); }
        };
        const drain = (): void => {
            if (!scrub.active) { return; }
            const rest = scrub.flush();
            if (rest) { stream.write(rest); }
        };
        child.stdout?.on('data', chunk => {
            put(chunk);
            if (!opencodeRun) { return; }
            const text = String(chunk);
            seen += text;
            if (!bound) {
                const id = opencodeRunSessionId(text);
                // Bound the moment it is knowable, and never re-bound: one `run`
                // is one conversation, and a second id would mean this reader is
                // looking at something it does not understand.
                if (id) { bound = id; this.setRunProgress(task.id, { sessionId: id }); }
            }
        });
        let errSeen = '';
        child.stderr?.on('data', chunk => {
            put(chunk);
            if (opencodeRun && errSeen.length < 8192) { errSeen += String(chunk); }
        });
        child.on('error', err => {
            drain();
            stream.write(`\n\n---\n[spawn error] ${scrub.text(String(err))}\n`);
            stream.end();
            this.processes.delete(task.id);
            if (task.status === 'running') { this.finish(task, 'failed'); }
        });
        child.on('close', code => {
            const mins = task.startedAt ? Math.round((Date.now() - task.startedAt) / 60000) : 0;
            const lockWait = opencodeRun && task.status === 'running'
                ? opencodeLockRetryDelay({ exitCode: code, ranMs: Date.now() - spawnedAt,
                    output: seen + errSeen, retried: this.opencodeLockRetried.has(task.id) })
                : 0;
            if (lockWait) {
                this.opencodeLockRetried.add(task.id);
                drain();
                stream.end();
                this.processes.delete(task.id);
                setTimeout(() => {
                    if (task.status !== 'running') { return; }
                    this.spawnHeadless(task, agent, opencodeLockRetryNote(seen + errSeen));
                }, lockWait);
                return;
            }
            drain();
            stream.write(`\n\n---\nFinished: ${new Date().toLocaleString()} · exit ${code ?? '?'} · ${mins} min\n`);
            const flushed = new Promise<void>(r => stream.end(() => r()));
            this.processes.delete(task.id);
            // ‼️ M-14 — WHAT THE RUN COST AND HOW FAR IT GOT, read once, from the
            // stream it already printed. `readOpencodeRun` is fail-soft by
            // construction, so a killed process with a half-written last line
            // produces figures rather than an exception — and an unread run
            // produces zeros WITH no steps, which is how a real $0 (a free
            // model, measured) is told apart from "nothing was parsed".
            if (opencodeRun) {
                const run = readOpencodeRun(seen);
                if (run.sessionId && !bound) {
                    bound = run.sessionId;
                }
                if (run.steps.length) {
                    this.setRunProgress(task.id, {
                        ...(bound ? { sessionId: bound } : {}),
                        assistantSteps: run.steps.length, toolCalls: run.tools.length
                    });
                    this.setTaskCost(task.id, run.cost, task.outputFile ?? '', run.spend.total);
                } else if (bound) {
                    this.setRunProgress(task.id, { sessionId: bound });
                }
            }
            if (task.status === 'running' && code === 0 && task.browserRun) {
                void this.fileBrowserRun(task, flushed).then(() => { if (task.status === 'running') { this.finish(task, 'done'); } });
            } else if (task.status === 'running') {
                this.finish(task, code === 0 ? 'done' : 'failed');
            }
        });
    }

    /** M-54 — a recipe step's downloads, filed before the step is called done (src/core/browserDownloads.ts). */
    private async fileBrowserRun(task: FarmTask, flushed: Promise<void>): Promise<void> {
        await flushed;
        const w = this.runView(task.workflowId, task.workflowRunId);
        const step = task.stepIndex !== undefined ? w?.steps[task.stepIndex] : undefined;
        const lc = this.libCtx(task);
        try {
            await fileBrowserDownloads({
                outputsDir: this.outputsDir, task, run: task.browserRun!, goal: step?.browser?.goal ?? task.prompt, workflowTitle: w?.title,
                ...(lc ? { produced: (files: string[]) => this.lib!.produced(lc, files, { role: 'candidate', origin: 'AI_generated', productionType: 'browser', model: `browser:${task.browserRun!.recipe}` }) } : {})
            });
        } catch { /* filing is best-effort: the step itself succeeded */ }
    }

    private finish(task: FarmTask, status: TaskStatus, o?: { retry?: boolean }): void {
        task.status = status;
        task.endedAt = Date.now();
        // ‼️ M-12 — THE CLASS IS RECORDED THE MOMENT THE RUN ENDS, and at this
        // moment the honest answer is usually `unknown`: the transcript is on
        // disk but nothing has bound it to this run yet. That is a real state
        // and it is written down as one — `setRunProgress` upgrades it when the
        // binding lands (S-31), which may be minutes or a restart later.
        if (status === 'failed') {
            let out = '';
            try { if (task.outputFile) { out = fs.readFileSync(task.outputFile, 'utf8'); } } catch { /* none */ }
            task.failurePhase = classifyFailure({ output: out, progress: task.progress }).phase;
        }
        noteTaskEvent(task, 'finished', status + (task.startedAt
            ? ` after ${Math.max(1, Math.round((task.endedAt - task.startedAt) / 60000))} min` : '')
            + (status === 'failed' ? ` — ${describeFailurePhase(task)}` : ''));
        this.save();
        this.pump();
        // ‼️ X-178 — `retry: false` is the watchdog's ending, and it is the one
        // failure that must NOT be retried: the row it would re-run is the row
        // that went quiet.
        if (status === 'failed' && o?.retry !== false) { this.maybeScheduleRetry(task); }
        // ‼️ M-27 — AND AN ANSWERED ROUND OPENS THE NEXT ONE. Before the
        // workflow branch below, because a task with rounds is never a workflow
        // step (planNextRound refuses one) and putting it after would make the
        // reader hunt through three early returns to find out.
        if (status === 'done') { this.openNextRound(task); }
        // ‼️ X-176 — …AND A SENTRY ROUND DRIVES ITS CAMPAIGN, whether it ended
        // well or badly: a round that hit the wall is exactly the case the
        // verdict (X-174) exists to read, so failure is not a reason to stop.
        this.driveSentry(task);

        // Workflow chaining takes precedence over plain queue auto-advance.
        if (task.workflowId !== undefined && task.stepIndex !== undefined) {
            const w = this.runView(task.workflowId, task.workflowRunId);
            const step = w?.steps[task.stepIndex];
            if (w && step?.verify && status === 'done' && task.outputFile) {
                // Media steps get a VISION judge on the produced asset; regular
                // steps get the text judge (which would crash retrying a media
                // step, since media tasks have no agent).
                if (step.media) { void this.verifyMediaThenAdvance(task, w, step); }
                else { void this.verifyThenAdvance(task, w, step); }
                return;
            }
            this.advanceWorkflow(task, status);
            return;
        }
        if (status === 'done' && this.autoAdvance()) {
            const next = this.nextQueuedFor(task.agentId);
            if (next) {
                void vscode.window.showInformationMessage(
                    `Agent Farm: starting next queued task — "${next.title}"`);
                this.startTask(next);
            }
        }
    }

    /**
     * ‼️ M-27 — THE NEXT ROUND OF A TASK THAT HAS JUST BEEN ANSWERED.
     *
     * It is a ROW, not a timer. Everything M-3 learned about retries applies
     * here for the same reasons: a `setTimeout` holding round 3 is thrown away
     * when the window closes, cannot be seen, and cannot be cancelled. So the
     * round is created immediately, in the queue, carrying the moment it may
     * start (`notBefore`) — and the pump launches it then, exactly as it
     * launches anything else a ceiling was holding. Which means a chain with a
     * two-hour wait survives a restart, shows up on the board as a row that
     * says when, and can be cancelled by the person who is tired of it.
     *
     * ‼️ AND IT IS A ROW EVEN WHEN THE CONVERSATION IS NOT KNOWN YET, which is
     * the ordinary case and used to be fatal. Only opencode publishes its
     * session id while the run is going; every other engine is bound to one
     * AFTERWARDS, from a transcript the index matches on disk — so at this
     * exact moment `runSessionId` is normally empty, and this refused there and
     * dropped the whole chain with a note. Now the round is made and HELD
     * (`ROUND_BINDING_CODE`), and `releaseRounds` fills the id in when it lands.
     *
     * The whole decision is `planNextRound`, which is pure and tested; this is
     * the part that needs the store.
     */
    private openNextRound(task: FarmTask): void {
        const refusal = refuseNextRound(task);
        if (refusal) {
            // The one silence worth breaking: rounds were waiting and can never
            // be sent. Everything else planNextRound declines is already on the
            // board as what it is — or, for the binding, is about to be a row.
            noteTaskEvent(task, 'finished', `no next round — ${refusal}`);
            this.save();
            return;
        }
        const next = planNextRound(task, Date.now());
        if (!next) { return; }
        const agent = this.getAgents().find(a => a.id === task.agentId);
        if (!agent) {
            noteTaskEvent(task, 'finished',
                `no round ${next.round} — the agent "${task.agentName}" is not in the fleet any more`);
            this.save();
            return;
        }
        // The title carries the round rather than a fresh name, so the board
        // reads as one piece of work going deeper and not as N unrelated tasks.
        const baseTitle = task.title.replace(/\s*\((?:limit-)?(?:retry|continue) \d+\)\s*$/, '')
            .replace(/\s*·\s*R\d+$/, '');
        // ‼️ S-64 — the conversation it would reply into was handed over: the
        // round runs fresh, pointed at the note, and never resumes it.
        const closed = !next.awaitBinding && next.resumeSessionId
            ? this.opts.handoverOf?.(next.resumeSessionId) : undefined;
        try {
            const wrote = this.inOneWrite(() => {
                noteTaskEvent(task, 'finished',
                    `round ${next.round} of ${task.roundsTotal ?? '?'} queued`
                    + (next.delayMin > 0 ? `, starting in ${next.delayMin} min` : '')
                    + (next.awaitBinding ? ', held until this run is matched to its transcript' : '')
                    + (closed ? ` — ${handedOverRoundWhy(next.round, next.resumeSessionId, closed)}` : ''));
                const prompt = closed
                    ? handedOverRoundPrompt(next.prompt, next.resumeSessionId, closed)
                    : next.prompt;
                const row = this.addTask(agent, `${baseTitle} · R${next.round}`, prompt, task.mode, {
                    projectId: task.projectId,
                    /**
                     * ‼️ X-229 — THE ROUND RUNS THE WAY THE ROUND BEFORE IT RAN,
                     * AND HERE THAT IS NOT A PREFERENCE.
                     *
                     * A round is not a new run: it is a REPLY, and the lines
                     * below send it back into the same conversation by
                     * `resumeSessionId`. This literal was the third hand-copied
                     * dimension list in this file and it was dropping five —
                     * account, providerId, tier, finishSound, superpowers — so
                     * round two resumed a transcript on a sign-in that had never
                     * seen it. That is the mid-run drift the X-211 family was
                     * built to end, arriving through the front door.
                     *
                     * By the shape now, like everything else that inherits a
                     * run's dimensions. It is FIRST on purpose: the round's own
                     * fields are written after it and must win — `rounds` here
                     * is what is LEFT to say (`next.rest`), not what the task
                     * started with. S-82's `baton` and `batonMaxHops` ride in it
                     * too; a round resumes a session the seal already knows, so
                     * it is never sealed twice.
                     */
                    ...runExtras(task),
                    round: next.round,
                    rounds: next.rest,
                    roundsTotal: task.roundsTotal,
                    roundOf: task.roundOf ?? task.id,
                    ...(task.engine ? { engine: task.engine } : {}),
                    // ‼️ THE ROUND IS A REPLY, so it goes into the conversation
                    // that was answered — not a new one. When that conversation
                    // is not bound yet the row names the run it is waiting for
                    // instead, and is parked below until it is.
                    ...(next.awaitBinding
                        ? { roundAwaits: task.id }
                        : closed ? {} : {
                            resumeSessionId: next.resumeSessionId,
                            resumedFrom: task.title,
                            ...(task.engine ? { resumedEngine: task.engine } : {})
                        }),
                    ...(next.notBefore > Date.now() ? {
                        notBefore: next.notBefore,
                        notBeforeWhy: `round ${next.round} waits ${next.delayMin} min after the previous answer`
                    } : {}),
                    ...(task.model ? { model: task.model } : {}),
                    ...(task.effort ? { effort: task.effort } : {}),
                    ...(task.permissionMode ? { permissionMode: task.permissionMode } : {}),
                    ...(task.cli ? { cli: task.cli } : {}),
                    ...(task.workDir ? { workDir: task.workDir } : {}),
                    ...(task.priority ? { priority: task.priority } : {}),
                    ...(task.ignoreBudget ? { ignoreBudget: true } : {}),
                    // The retry policy rides with the chain: a round that meets
                    // a usage limit deserves the same second chance the first
                    // one had, and losing it here would make round 2 of a
                    // careful task more fragile than round 1.
                    ...(task.retry ? { retry: task.retry } : {}),
                    ...(task.interactiveTarget ? { interactiveTarget: task.interactiveTarget } : {}),
                    ...(task.interactiveClose ? { interactiveClose: task.interactiveClose } : {}),
                    ...(task.missionId ? { missionId: task.missionId } : {}),
                    ...(task.outputContract ? { outputContract: task.outputContract } : {})
                });
                row.autoStart = true;
                if (next.awaitBinding) {
                    // ‼️ PARKED HERE AND NOT LEFT TO THE PUMP, for M-3's reason at
                    // `progress:unknown`: the row must never be seen unparked for
                    // even one pass, and the park written now is the SAME code
                    // `launchBlock` returns — so the pump renews it in silence
                    // rather than announcing "did not start" every 30 seconds
                    // about a wait that is usually over in one.
                    row.deferredCode = ROUND_BINDING_CODE;
                    row.deferredReason = roundBindingReason(row);
                    row.parkEpisode = (row.parkEpisode ?? 0) + 1;
                    noteTaskEvent(row, 'parked', row.deferredReason);
                }
            }, true);
            if (!wrote) {
                // The row is in memory and the pump will still run it in this
                // window; what it will not do is come back after a restart —
                // which matters more here than for a retry, because a round may
                // be waiting hours. Said on the answered run's own record.
                noteTaskEvent(task, 'finished',
                    `round ${next.round} could not be saved — it runs only while this window stays open`);
            }
        } catch { /* the round is not on the board; the event above is the trace */ }
    }

    /**
     * ‼️ M-27 — THE ROUND WHOSE CONVERSATION HAS NOW BEEN FOUND.
     *
     * A round is a reply, and for every engine but opencode the session a run
     * spoke in is discovered AFTER it exited, by matching a transcript on disk
     * (S-31). So a round is made held, naming the run it follows, and this is
     * the release — the mirror of M-3's `releaseHeld`, and for the same reason:
     * the alternative is a prompt going out into a conversation that is not the
     * one it was written for.
     *
     * ‼️ IT IS RE-DERIVED, NEVER EVENT-DRIVEN. Both the row and the id are in
     * the store, so this answers correctly on the first pump after a restart,
     * in a window that never saw the binding land, and on a second call that
     * finds nothing left to do. That is why the pump calls it too, and not only
     * `setRunProgress`.
     */
    private releaseRounds(): boolean {
        let wrote = false;
        for (const t of this.tasks) {
            if (t.status !== 'queued' || !t.roundAwaits || t.resumeSessionId) { continue; }
            const prev = this.tasks.find(p => p.id === t.roundAwaits);
            if (!prev) {
                // The run this replies to is not on the board any more — the
                // history was cleared, or it was deleted. Nothing can arrive
                // now, so the row says so and ends rather than waiting for a
                // binding that has nowhere to come from.
                t.roundAwaits = undefined;
                t.status = 'failed';
                t.endedAt = Date.now();
                this.clearPark(t);
                t.deferredReason = 'the run this round replies to is gone, so there is no '
                    + 'conversation left to resume';
                noteTaskEvent(t, 'finished',
                    `round ${t.round ?? '?'} was dropped — ${t.deferredReason}`);
                wrote = true;
                continue;
            }
            const sid = String(prev.runSessionId ?? '').trim();
            if (!sid) { continue; }
            // ‼️ S-64 — bound now, and handed over: released FRESH, never resumed.
            const closed = this.opts.handoverOf?.(sid);
            if (closed) {
                t.prompt = handedOverRoundPrompt(t.prompt, sid, closed);
                t.roundAwaits = undefined;
                this.clearPark(t);
                noteTaskEvent(t, 'parked',
                    `released — ${handedOverRoundWhy(t.round ?? 2, sid, closed)}`);
                wrote = true;
                continue;
            }
            t.resumeSessionId = sid;
            if (prev.engine) { t.resumedEngine = prev.engine; }
            t.resumedFrom = prev.title;
            t.roundAwaits = undefined;
            this.clearPark(t);
            noteTaskEvent(t, 'parked',
                `released — the conversation round ${Math.max(1, (t.round ?? 2) - 1)} was answered in `
                + `is bound now (${sid})`);
            wrote = true;
        }
        if (wrote) { this.save(); }
        return wrote;
    }

    /**
     * ‼️ M-3 — WHAT HAPPENS WHEN A RUN FAILS, DECIDED BY A POLICY THE USER CAN SEE.
     *
     * This used to be a private rule with the numbers written into it: six
     * attempts, forty minutes, only for the Claude session limit, with the
     * attempt number parsed out of the task's TITLE. All of that is now
     * `core/retry.ts`, stated on the task like every other run dimension, and
     * defaulting to exactly the old behaviour so no existing automation changes.
     *
     * What is still decided HERE, because it is about this machine and not about
     * the work: an interactive task has a person in front of it (they can press
     * the button themselves), a workflow step is retried by the workflow's own
     * verify/advance path, and a run whose agent no longer exists has nowhere to
     * go. Fires only while VS Code stays open — the same constraint as every
     * other automation.
     */
    private maybeScheduleRetry(task: FarmTask): void {
        if (task.mode !== 'headless' || !task.agentId || task.workflowId !== undefined) { return; }
        /**
         * ‼️ X-312 — A SENTRY ROUND IS NOT RETRIED BY THIS LAYER. The rule the
         * watchdog already states (X-178) is the campaign's everywhere: the
         * campaign's own next round IS the retry, and it is a fresh reading of
         * the backlog on an account the POOL chose.
         *
         * A retry made here escapes all three of those, and it was measured
         * doing it (X-309 scenario 1, campaign `sc-mu3psbkz`): `runExtras`
         * carries dimensions and not lineage, so the retry is born WITHOUT
         * `sentryOf` — invisible to the campaign, which went on counting two
         * rounds and stopped on the failure brake for producing nothing while
         * the retry was writing to the project. And its account came from
         * `carryOnAccount` over every captured sign-in, which does not know the
         * campaign has a pool: a round walled on a pool account carried on to
         * an account the user had fenced OUT of it.
         *
         * Narrowing the handover to the pool would fix the second half and
         * leave the first, so the whole reopening decision goes back to the one
         * place that owns it.
         */
        if (task.sentryOf) {
            noteTaskEvent(task, 'finished',
                'no retry — a sentry round is reopened by its campaign, never by the retry policy: '
                + 'the next round is a fresh reading of the backlog on an account the pool chooses');
            this.save();
            return;
        }
        let out = '';
        try { if (task.outputFile) { out = fs.readFileSync(task.outputFile, 'utf8'); } } catch { /* no output yet */ }
        const fallback = this.opts.defaultRetry?.(task);
        const d = retryDecision(task.retry, {
            attempt: task.retryAttempt ?? 0, output: out, fallback,
            now: Date.now(),
            // ‼️ M-10 — the engine's own answer to "when does the window
            // reopen", asked only here so the pure decision stays pure.
            engineResetAt: this.opts.limitResetAt?.(task.engine),
            // ‼️ M-12 — and what this run's own transcript says it managed, so
            // "nothing was attempted" is a finding rather than an assumption.
            progress: task.progress,
            // ‼️ S-64 — and whether its window had reached the handover line,
            // because a conversation that was told to stop is never the one a
            // continuation resumes.
            ...((() => {
                const sid = (task.runSessionId ?? '').trim();
                const h = sid ? this.opts.handoverOf?.(sid) : undefined;
                return h ? { handover: h } : {};
            })())
        });
        if (d.phase) { task.failurePhase = d.phase; }
        if (!d.retry) {
            // ‼️ A retry that did NOT happen is the thing somebody comes looking
            // for, and the old rule was silent about it. One line, on the task's
            // own record, saying which rule stopped it — except when retrying is
            // simply switched off, where "it did not retry" is not news.
            if (d.why !== 'retry is off for this run') {
                noteTaskEvent(task, 'finished', `no retry — ${d.why}`);
                this.save();
            }
            return;
        }
        const agent = this.getAgents().find(a => a.id === task.agentId);
        if (!agent) {
            // ‼️ M-3 (V3) — AN UNMADE RETRY IS STILL AN ANSWER. This returned in
            // silence: the policy said retry, the row said nothing, and the
            // person asking "why did it not try again" had no line to read.
            noteTaskEvent(task, 'finished',
                `no retry — the agent "${task.agentName}" is not in the fleet any more`);
            this.save();
            return;
        }
        const baseTitle = task.title.replace(/\s*\((?:limit-)?(?:retry|continue) \d+\)\s*$/, '');
        const policy = task.retry;
        /**
         * ‼️ M-10 — A CONTINUATION IS NOT A RETRY, AND THE ROW SAYS SO.
         *
         * `continueRun` is only ever true when M-12 found real work in this
         * run's own transcript. Then three things change together and none of
         * them may change alone: the words sent are the CONTINUATION prompt,
         * the conversation resumed is THIS run's own session, and the row is
         * labelled `continue` so the board does not read as the same work being
         * attempted from scratch seven times.
         *
         * ‼️ AND IT NEEDS A SESSION TO CONTINUE. `runSessionId` comes from the
         * launch binding; without one there is nothing to resume, and opening a
         * NEW conversation with a prompt that says "carry on from where you
         * stopped" would be the worst of both — so it falls back to an ordinary
         * retry of the original work and says so on the record.
         */
        const resumeId = (task.runSessionId ?? '').trim();
        const continuing = d.continueRun === true && !!resumeId;
        /**
         * ‼️ X-226 — A WALLED RUN DOES NOT SLEEP WHILE ANOTHER SIGN-IN IS FREE.
         *
         * The moment the retry would otherwise start, worked out once here
         * because it is now two things: the wait itself, and the WAIT THIS
         * HANDOVER REPLACES. `d.notBefore` is the reset-aware answer (M-10) and
         * the fallback is the ordinary interval — which is the case that
         * matters most, because `resetAware` ships OFF: an unconfigured run
         * sleeps forty minutes on a plan that is walled for four hours.
         *
         * ‼️ ONLY A LIMIT MOVES A RUN. A script that failed for its own reasons
         * fails the same way on every sign-in, and moving it would spend a
         * second plan to prove it. `isLimitFailure` is the same rule the
         * decision above used to decide there was anything to retry — asked
         * here rather than re-derived, so the two cannot disagree about what
         * kind of failure this was.
         */
        const wait = d.notBefore ?? Date.now() + Math.max(60_000, d.delayMs);
        // ‼️ X-226 (round 2) — AND ONLY WHEN THE POLICY SAYS SO. `carryOn` is the
        // switch (absent = stay on the run's own sign-in and wait); it falls
        // through from the user's default policy like every other retry field.
        const carryWant = resolveRetry(policy, fallback).carryOn ?? '';
        const engineId = task.engine || 'claude';
        const carry = isLimitFailure(out)
            ? carryOnAccount({
                ...(task.account ? { from: task.account } : {}),
                ...(task.engine ? { engine: task.engine } : {}),
                usage: this.opts.measuredAccounts?.() ?? [],
                // X-471 — the Account ceiling, or the campaign's own wall when this run is one of its rounds
                ceiling: this.opts.accountWall(task.sentryOf && this.sentry?.id === task.sentryOf
                    ? { value: this.sentry.ceiling, why: 'the campaign\'s wall' } : undefined),
                waitUntil: wait,
                want: carryWant,
                ...(this.opts.resolveCarryOn
                    ? { resolve: (id: string, pool: SlotUsage[]) => this.opts.resolveCarryOn!(id, engineId, agent.id, pool) }
                    : {})
            })
            : undefined;
        // ‼️ AND THE HANDOVER STARTS AS SOON AS THE PUMP CAN TAKE IT. The wait
        // it replaces existed to outlast a wall this run has just stepped
        // around; keeping it would be the extension waiting for a window it is
        // no longer going to use. The floor is the pump's own, so nothing here
        // starts a run inside the same second it decided to.
        const startAt = carry?.slotId ? Date.now() + CARRY_ON_FLOOR_MS : wait;
        if (d.continueRun && !resumeId) {
            noteTaskEvent(task, 'retried',
                'smart continue wanted to resume this run\'s own conversation and no session is bound to it '
                + '(see sessions.bindings) — falling back to an ordinary retry of the original work');
        }
        const nextTitle = `${baseTitle} (${continuing ? 'continue' : 'retry'} ${d.attempt})`;
        // The prompt is REPLACED, never appended: a retry is a fresh headless run
        // with no memory of the last one, so "and this time do it properly" on
        // its own would arrive with nothing to refer to.
        const prompt = continuing
            ? fillContinuation(d.promptTemplate ?? '', {
                taskTitle: baseTitle,
                attempt: String(d.attempt),
                failureReason: describeFailurePhase(task),
                resetAt: d.notBefore ? new Date(d.notBefore).toLocaleString() : 'unknown',
                progressSummary: describeFailurePhase(task)
            })
            : (policy?.prompt ?? fallback?.prompt ?? '').trim() || task.prompt;
        const mode = task.mode;
        try {
            if (task.outputFile) {
                fs.appendFileSync(task.outputFile,
                    `\n\n---\n[retry] ${d.why}. `
                    + `Policy: ${describeRetry(policy, fallback)}.\n`);
            }
        } catch { /* best-effort note */ }
        // ‼️ M-3 (reopened) — THE RETRY IS ON THE BOARD NOW, NOT IN A CLOSURE.
        //
        // Same work, same dimensions, same project — created immediately, in
        // the queue, carrying the moment it may start (`notBefore`). The pump
        // launches it when that moment arrives, exactly as it launches anything
        // else a ceiling was holding. What this buys, and a `setTimeout` never
        // could: the row is in the store, so closing VS Code between the
        // failure and the retry no longer throws it away; it is visible, so the
        // answer to "what happens now" is a row that says when; and the
        // decision to retry is recorded in the same save as the run it made.
        //
        // ‼️ M-3 (V3) — AND "THE SAME SAVE" IS NOW LITERALLY ONE WRITE. The
        // comment above claimed it while the code did two: the `retried` event
        // went down in its own `save()`, `addTask` wrote again, and a crash
        // between them left a failed run promising a retry that was never
        // created. `inOneWrite` makes the pair one file; `strict` means a store
        // that refuses the write says so out loud instead of leaving a row that
        // exists only until the window closes.
        try {
            const wrote = this.inOneWrite(() => {
                // ‼️ X-226 — and on the record of the run that was refused, so
                // the question "whose plan is the night being billed to now" is
                // answered where it is asked: on the row that met the wall.
                // …and when the policy ASKED for a handover and none was made, the
                // reason is on the record too — a wait the user did not expect
                // must say why it stood.
                noteTaskEvent(task, 'retried', d.why + (carry?.slotId || (carry && carryWant) ? ` — ${carry.why}` : ''));
                const t = this.addTask(agent, nextTitle, prompt, mode, {
                    projectId: task.projectId,
                    /**
                     * ‼️ X-227 — THE RETRY RUNS THE WAY THE ORIGINAL RAN, AND
                     * THIS IS THE RETRY NOBODY IS WATCHING.
                     *
                     * `retryTask` — the one a person presses — carries every
                     * dimension across and says why beside each. This one, which
                     * fires BY ITSELF when a run fails, hand-copied a shorter
                     * list: engine, model, effort, permissionMode, cli, workDir,
                     * priority, ignoreBudget. Measured against `RunDimensions`,
                     * it was dropping SEVEN — account, providerId, tier,
                     * finishSound, superpowers, interactiveTarget,
                     * interactiveClose — and it had been dropping them silently,
                     * on the path where there is nobody at a window to notice.
                     *
                     * The account is the worst of the seven: `retryDecision`
                     * waits for ONE plan's window to reopen (`engineResetAt`,
                     * M-10) and the run then went to whichever account happened
                     * to be standing — the wait and the run disagreeing about
                     * whose window was being waited for. The route was next: the
                     * same word names a different model on two of them.
                     *
                     * So it travels by the SHAPE now, like a schedule, a
                     * trigger, a template and a workflow step already do. That is
                     * the whole point of `runExtras` — the eighteenth dimension
                     * must not become the eighteenth thing to forget. What still
                     * follows it is written after on purpose: the fields below
                     * are the retry's OWN, and they must beat the original's.
                     * S-82's `baton` and `batonMaxHops` ride in it too: a retry
                     * of a run that opened a relay opens one, on a new chain.
                     */
                    ...runExtras(task),
                    ...(policy ? { retry: policy } : {}),
                    // ‼️ S-19 — A RETRY OF A RESUMED TURN RESUMES THE SAME
                    // CONVERSATION. The turn never happened (a limit refused it
                    // before the engine read anything), so trying again means
                    // trying THAT turn again — dropping the id here would have
                    // the retry open a brand new conversation and answer a
                    // prompt written for a context it no longer has.
                    // ‼️ M-10 — …AND A CONTINUATION RESUMES THE CONVERSATION THIS
                    // RUN ITSELF HAD, which is a different id from the one it
                    // was told to continue. The continuation wins, because the
                    // work to be picked up is in THIS run's transcript.
                    ...(continuing ? {
                        resumeSessionId: resumeId,
                        ...(task.engine ? { resumedEngine: task.engine } : {}),
                        resumedFrom: baseTitle,
                        continuationOf: task.id
                    } : task.resumeSessionId ? {
                        resumeSessionId: task.resumeSessionId,
                        ...(task.resumedEngine ? { resumedEngine: task.resumedEngine } : {}),
                        ...(task.resumedFrom ? { resumedFrom: task.resumedFrom } : {})
                    } : {}),
                    retryOf: task.retryOf ?? task.id,
                    retryAttempt: d.attempt,
                    // ‼️ M-27 — THE CHAIN SURVIVES THE RETRY, AND THE ROUND DOES
                    // NOT MOVE. A retry is this same round attempted again; if
                    // the rounds were dropped here a task that met a usage limit
                    // would quietly lose everything the user still had to say,
                    // and if `round` were incremented the badge would count
                    // failures as progress. The retry that finally succeeds is
                    // the run that opens the next round — from exactly here.
                    ...(task.roundsTotal !== undefined ? {
                        round: task.round,
                        roundsTotal: task.roundsTotal,
                        ...(task.rounds?.length ? { rounds: task.rounds } : {}),
                        ...(task.roundOf ? { roundOf: task.roundOf } : {})
                    } : {}),
                    // ‼️ M-10 — A RESET-AWARE RETRY CARRIES THE MOMENT ITSELF.
                    // The ordinary path is "a minute from now at the earliest,
                    // plus whatever the policy waits"; the reset path already
                    // has an ABSOLUTE time worked out from the window the engine
                    // published, and re-deriving it from a duration is how
                    // 05:33 becomes 05:34 on the next read. The one-minute floor
                    // stays on the ordinary path only, where it protects against
                    // a policy of zero; a reset that has already passed is meant
                    // to go as soon as the buffer allows.
                    notBefore: startAt,
                    // ‼️ X-226 — AND WHEN THE WORK WAS HANDED OVER, THE RESET IS
                    // NOT THE STORY. `resetAt` is deliberately NOT written on a
                    // handover: it would label a row "waiting for 07:50" that is
                    // about to start on a plan whose window is already open, and
                    // the board would say the opposite of what is happening. The
                    // account fields come last of all, after `runExtras`, because
                    // they are the retry's OWN and must beat the original's.
                    ...(carry?.slotId
                        ? {
                            account: carry.slotId,
                            // X-473 — carried by a rule: the rule is the pool the row goes back to if the slot fills before it starts
                            ...(isPolicyId(carryWant) ? { accountPool: carryWant } : {}),
                            accountHandover: { from: task.account ?? '', why: carry.why },
                            notBeforeWhy: `account handover · ${carry.why}`
                        }
                        : d.notBefore
                            ? {
                                resetAt: d.notBefore,
                                notBeforeWhy: `limit reset · ${d.resetSource === 'engine' ? 'the engine published it'
                                    : d.resetSource === 'output' ? 'read from the output' : 'no reset time — ordinary wait'}`
                            }
                            : {})
                });
                // ‼️ M-10 — HELD BECAUSE NOBODY CAN SAY WHETHER WORK HAPPENED.
                // The row exists and is visible, and it is NOT launched: the one
                // outcome this mode exists to prevent is the original prompt
                // going out as if the run had been idle. The park clears itself
                // when the binding lands and `setRunProgress` answers the
                // question — or when the user answers it.
                // ‼️ M-13 — the row IS the fallback; it waits for the supervisor's word
                if (d.supervise && continuing) {
                    const sup = resolveRetry(policy, fallback).supervisor!;
                    const when = supervisorWhen({
                        now: Date.now(), plannedAt: startAt, ...(d.notBefore ? { resetAt: d.notBefore } : {}),
                        taskEngine: engineId, ...(task.account ? { taskAccount: task.account } : {}),
                        // a supervisor on the task's own engine is taken to share its sign-in: unknown is not room
                        supervisor: sup, ...(sup.engine === engineId && task.account ? { supervisorAccount: task.account } : {}),
                        room: this.opts.supervisorRoom?.(sup) ?? 'unknown'
                    });
                    t.supervision = {
                        key: incidentKey(task.id, d.attempt, task.endedAt ?? Date.now()), state: 'pending',
                        at: when.at, atWhy: when.why, failedTask: task.id, calls: task.supervision?.calls ?? 0,
                        ...(task.supervision?.spentUsd ? { spentUsd: task.supervision.spentUsd } : {})
                    };
                    t.deferredCode = SUPERVISION_HOLD_CODE;
                    t.deferredReason = `waiting for the supervisor — ${when.why}`;
                    t.parkEpisode = (t.parkEpisode ?? 0) + 1;
                    noteTaskEvent(t, 'parked', t.deferredReason);
                    return;
                }
                if (d.hold) {
                    t.deferredCode = `progress:${d.hold === 'ask' ? 'ask' : 'unknown'}`;
                    t.deferredReason = d.hold === 'ask'
                        ? 'waiting for you — smart continue cannot tell whether the run it follows had '
                        + 'already done work, and you asked to decide'
                        : 'waiting for evidence — smart continue cannot yet tell whether the run it '
                        + 'follows had already done work, so the original prompt is not being resent';
                    t.parkEpisode = (t.parkEpisode ?? 0) + 1;
                    noteTaskEvent(t, 'parked', t.deferredReason);
                    return;
                }
                // Parks on the clock (see launchBlock) and the pump takes it
                // from there; the park writes the "waiting until …" line on its
                // record — inside this batch, so it is the same one write.
                this.startTask(t);
            }, true);
            if (!wrote) {
                // The row exists in memory and the pump will still run it in
                // this window; what it will not do is come back after a
                // restart. Said on the failed run's own record, where somebody
                // reading "retried" needs to know it may be the only trace.
                noteTaskEvent(task, 'retried',
                    `the retry row could not be saved — it runs only while this window stays open`);
            }
        } catch { /* ignore */ }
    }

    // ---------- verification (A2) ----------

    /**
     * Cheap-model judge: PASS/FAIL + reason for a step output. ‼️ M-42 — a judge
     * that could not run is `unjudged`, never a PASS nobody gave.
     */
    private runJudge(cwd: string, criteria: string, body: string, step?: StepJudge):
        Promise<{ pass: boolean; reason: string; unjudged?: string; judge: string; costUSD?: number }> {
        return new Promise(resolve => {
            const want = judgeWant(step, this.opts.judgeArgs?.());
            const judge = want.origin;
            const prompt = sanitizePrompt(
                `Sen bir kalite denetçisisin. Aşağıdaki ÇIKTI şu ÖLÇÜTÜ karşılıyor mu? ` +
                `ÖLÇÜT: ${criteria} --- ÇIKTI: ${body.slice(0, 4000)} --- ` +
                `Yalnızca tek satır cevap ver: ilk kelime PASS, FAIL ya da FAIL-METHOD olsun (FAIL-METHOD: yaklaşımın kendisi yanlış, aynı talimatla yeniden denemek düzeltmez), ardından kısa gerekçe yaz.`);
            // X-260 — through the seam.
            void execOneShot({ cwd, engine: want.engine, model: want.model, args: judgeLean(want.engine, false, want.args), prompt, timeoutMs: 180_000, ...judgeJson(want.engine) }).then(r => {
                const { text, costUSD, error } = judgeReply(want.engine, r.out);
                const spent = costUSD ? { costUSD } : {};
                if ((r.error || error) && !text) {
                    const why = 'the judge could not run (' + (r.error || error || '').slice(0, 80) + ')';
                    resolve({ pass: false, reason: why, unjudged: why, judge, ...spent });
                    return;
                }
                const line = text.split('\n').find(l => l.trim()) ?? '';
                const pass = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
                resolve({ pass, reason: line.slice(0, 200) || '(no verdict)', judge, ...spent });
            });
        });
    }

    /**
     * Wave B2 — vision judge: a vision-capable model opens the produced asset
     * file (via its Read tool) and rules PASS/FAIL against the criteria. Runs in
     * the file's own folder so the Read is inside the working directory — the
     * library may already have moved it out of the outputs dir.
     *
     * ‼️ M-42 — an asset the judging engine cannot open, or a judge that could
     * not run, is `unjudged` — never a PASS nobody looked at.
     */
    private runVisionJudge(assetFile: string, criteria: string, step?: StepJudge, sources: string[] = []):
        Promise<{ pass: boolean; reason: string; unjudged?: string; judge: string; costUSD?: number }> {
        return new Promise(resolve => {
            const want = visionJudgeWant(assetFile, step, this.opts.judgeArgs?.());
            const route = visionRoute(assetFile, want.engine);
            if (!route.ok) {
                resolve({ pass: false, reason: route.why, unjudged: route.why, judge: want.origin });
                return;
            }
            // M-62 — an edit is judged against what it started from, side by side in a temp folder
            let staged: ReturnType<typeof stageComparison> | undefined;
            try { staged = sources.length ? stageComparison(assetFile, sources) : undefined; } catch { staged = undefined; } // a copy that fails leaves the lone judge
            const judge = want.origin + (staged ? ` · compared with its source (${sources.map(s => path.basename(s)).join(', ')})` : '');
            const viaRead = want.engine === 'claude';
            const prompt = sanitizePrompt(staged ? compareJudgePrompt(staged.after, staged.before, criteria, viaRead) :
                `Sen bir görsel kalite denetçisisin. "${path.basename(assetFile)}" dosyasındaki görseli/videoyu ${viaRead ? 'Read aracıyla ' : ''}aç ve incele; kabuk komutu çalıştırma. ` +
                `Şu ÖLÇÜTü karşılıyor mu? ÖLÇÜT: ${criteria}. ` +
                `Yalnızca tek satır cevap ver: ilk kelime PASS, FAIL ya da FAIL-METHOD olsun (FAIL-METHOD: yaklaşımın kendisi yanlış, aynı talimatla yeniden denemek düzeltmez), ardından kısa gerekçe yaz.`);
            // X-260 — through the seam.
            void execOneShot({
                cwd: staged?.dir ?? path.dirname(assetFile), engine: want.engine, model: want.model, args: judgeLean(want.engine, true, want.args), prompt, timeoutMs: 180_000,
                // agy's default mode may act on the files; measured 2026-09-26: in plan mode it still opens and judges them
                readOnly: want.engine === 'agy', ...judgeJson(want.engine)
            }).finally(() => staged?.cleanup()).then(r => {
                const { text, costUSD, error } = judgeReply(want.engine, r.out);
                const spent = costUSD ? { costUSD } : {};
                if ((r.error || error) && !text) {
                    const why = 'the vision judge could not run (' + (r.error || error || '').slice(0, 80) + ')';
                    resolve({ pass: false, reason: why, unjudged: why, judge, ...spent });
                    return;
                }
                const line = text.split('\n').filter(l => l.trim()).pop() ?? '';
                const pass = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
                resolve({ pass, reason: line.slice(0, 200) || '(no verdict)', judge, ...spent });
            });
        });
    }

    /** The judge's criteria with the run's placeholders ({input.x}, {steps.id…}) filled, as the step's own input was. */
    private judgeCriteria(task: FarmTask, step: WorkflowStep): string {
        const raw = step.verify!.criteria;
        if (!raw.includes('{')) { return raw; }
        const rec = this.runRecords.get(task.workflowRunId ?? '');
        return (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(raw, { inputs: rec?.inputs, board: rec?.board }));
    }

    /** M-42 — a step no judge could look at: the user's judge.unjudged decides, never a silent PASS. */
    private async settleUnjudged(task: FarmTask, w: FarmWorkflow, why: string, attempt: number, label: string, judge?: string): Promise<void> {
        const behavior = normalizeUnjudged(this.opts.judgeUnjudged?.());
        const q = { title: `The judge could not judge "${task.title}"`, message: `${why}. Continue without a verdict?` };
        const confirm = this.opts.confirmApproval;
        const answer = behavior === 'ask' && confirm
            ? await this.askingHuman(task.workflowRunId ?? '', w.title, task, { kind: 'approval', title: q.title, goal: q.message }, () => confirm(q))
            : undefined;
        const { pass, line } = unjudgedOutcome(behavior, why, answer);
        try {
            fs.appendFileSync(task.outputFile as string,
                `\n${label} (attempt ${attempt + 1}): ${line}${judge ? ` [${judge}]` : ''}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.verified = 'unjudged';
        if (!pass) { task.status = 'failed'; }
        this.save();
        this.advanceWorkflow(task, pass ? 'done' : 'failed');
    }

    /**
     * Wave B2 — verify a media step's asset with the vision judge; on FAIL,
     * re-run the SAME media step (feedback appended to its prompt) up to the
     * configured retry count. Unlike the text path, the retry re-runs the media
     * generator, not an agent task.
     */
    private async verifyMediaThenAdvance(task: FarmTask, w: FarmWorkflow, step: WorkflowStep): Promise<void> {
        const meta = readMediaMetas(this.outputsDir).find(m => m.taskId === task.id);
        const files = (meta?.assetFiles ?? []).filter(f => fs.existsSync(f));
        const assetFile = files[0];
        const attempt = task.attempt ?? 0;
        if (!assetFile) {
            await this.settleUnjudged(task, w, 'there is no downloaded asset to look at', attempt, 'Vision verify');
            return;
        }
        const sources = normalizeJudgeCompare(this.opts.judgeCompare?.()) === 'never' ? []
            : judgeSources(meta?.input ?? '', task.uploads, readMediaMetas(this.outputsDir), task.id);
        const judged = files.length > 1 && candidatesOf(step.media?.candidates) > 1 ? await this.pickCandidate(task, step, files, meta!, sources)
            : await this.climbJudge(task, step, sj => this.runVisionJudge(assetFile, this.judgeCriteria(task, step), sj, sources));
        if (judged.unjudged) {
            await this.settleUnjudged(task, w, judged.unjudged, attempt, 'Vision verify', judged.judge);
            return;
        }
        const { pass, reason } = judged;
        try {
            fs.appendFileSync(task.outputFile as string,
                `\nVision verify (attempt ${attempt + 1}): ${pass ? 'PASS' : 'FAIL'} — ${reason} [${judged.judge}]\n${judged.climbed ? judged.climbed + '\n' : ''}`, 'utf8');
        } catch { /* archive gone */ }
        task.verified = pass ? 'pass' : 'fail';
        const retries = step.verify!.retries ?? 1;
        const go = this.judgeNext(task, w, step, judged, attempt, retries);

        if (pass) {
            this.save();
            this.advanceWorkflow(task, 'done');
            return;
        }
        const failLedger = this.libCtx(task)?.ledger;
        if (failLedger) { await this.lib!.failed(failLedger, assetFile, reason); }
        if (go === 'retry') {
            this.save();
            void vscode.window.showWarningMessage(
                `Agent Farm: media "${task.title}" failed vision QA — regenerating (${attempt + 1}/${retries}).`);
            // B4: after a reload the in-memory handoff is gone — rebuild it from
            // the previous step's archived output so {prev_*} resolve correctly.
            const handoff = this.handoffs.get(task.workflowRunId ?? '')
                ?? this.rebuildHandoff(task.workflowRunId ?? '', task.stepIndex ?? 0);
            void this.runMediaStep(w, task.stepIndex as number, handoff, task.workflowRunId as string,
                { attempt: attempt + 1, feedback: reason });
            return;
        }
        task.status = 'failed';
        this.save();
        void vscode.window.showWarningMessage(
            `Agent Farm: media "${task.title}" failed vision QA after ${attempt + 1} attempt(s).`);
        this.advanceWorkflow(task, 'failed');
    }

    /** A-27 — parallel-cheap: the candidates judged in order, the first PASS handed on alone (src/core/mediaCandidates.ts). */
    private async pickCandidate(task: FarmTask, step: WorkflowStep, files: string[], meta: MediaMeta, sources: string[]):
        Promise<{ pass: boolean; reason: string; unjudged?: string; judge: string; climbed?: string; costUSD?: number }> {
        const seen: { pass: boolean; reason: string; unjudged?: string; judge: string; climbed?: string; costUSD?: number }[] = [];
        let spent = 0;
        for (const [i, f] of files.entries()) {
            const j0 = await this.climbJudge(task, step, sj => this.runVisionJudge(f, this.judgeCriteria(task, step), sj, sources));
            spent += j0.costUSD ?? 0;
            const j = { ...j0, ...(spent ? { costUSD: spent } : {}) };
            if (j.pass && !j.unjudged) {
                const line = pickLine(i, files.length, j.reason);
                try {
                    const out = task.outputFile as string;
                    fs.writeFileSync(out, withArchiveBody(fs.readFileSync(out, 'utf8'), JSON.stringify(pickedBody(extractJson(archivedOutputBody(fs.readFileSync(out, 'utf8'))), i, files.length), null, 2)) + `${line}\n`, 'utf8');
                    const order = [i, ...files.map((_, k) => k).filter(k => k !== i)];
                    fs.writeFileSync(path.join(this.outputsDir, `${task.id}.media.json`),
                        JSON.stringify({ ...meta, assetFiles: order.map(k => files[k]), assetUrls: order.map(k => meta.assetUrls?.[k]).filter(Boolean) }, null, 2), 'utf8');
                } catch { /* archive gone — the verdict still stands */ }
                task.judgeDecisions = [...(task.judgeDecisions ?? []), { kind: 'picked', line }];
                return j;
            }
            seen.push(j);
        }
        const judged = seen.filter(j => !j.unjudged);
        if (!judged.length) { return seen[seen.length - 1]; }
        return { ...judged[judged.length - 1], ...(spent ? { costUSD: spent } : {}), reason: seen.map((j, k) => `candidate ${k + 1}: ${j.unjudged ?? j.reason}`).join(' | ') };
    }

    /** A-27 — cheap-first, and one rung up on a FAIL before a retry is paid for (src/core/judgeLadder.ts). */
    private async climbJudge<J extends { pass: boolean; reason: string; unjudged?: string; judge: string; costUSD?: number }>(
        task: FarmTask, step: WorkflowStep, judge: (sj: StepJudge | undefined) => Promise<J>): Promise<J & { climbed?: string }> {
        const lad = ladderFor(step.verify, task.workflowRunId ? this.runRecords.get(task.workflowRunId)?.judgeLadder : undefined, this.opts.judgeLadderSetting?.());
        if (!lad.rungs.length) { return judge(step.verify); }
        const rung = (i: number) => `judge ladder ${i + 1}/${lad.rungs.length} ${lad.rungs[i]} (${lad.from})`;
        const low = await judge({ model: lad.rungs[0] });
        if (low.unjudged || low.pass || lad.rungs.length < 2) { return { ...low, judge: rung(0) }; }
        const up = await judge({ model: lad.rungs[1] });
        const both = (low.costUSD ?? 0) + (up.costUSD ?? 0);
        const spent = both ? { costUSD: both } : {};
        if (up.unjudged) { return { ...low, ...spent, judge: rung(0) }; }
        return { ...up, ...spent, judge: `${rung(0)} → ${rung(1)}`, climbed: escalationLine({ model: lad.rungs[0], reason: low.reason }, { model: lad.rungs[1], pass: up.pass, reason: up.reason }) };
    }

    /** A-27 — records what a check decided beyond its verdict, and whether a retry is bought (src/core/judgeDecision.ts). */
    private judgeNext(task: FarmTask, w: FarmWorkflow, step: WorkflowStep, judged: { pass: boolean; reason: string; climbed?: string; costUSD?: number },
        attempt: number, retries: number): 'pass' | 'retry' | 'fail' {
        if (judged.costUSD) { task.judgeUSD = Math.round(((task.judgeUSD ?? 0) + judged.costUSD) * 1e6) / 1e6; }
        const cost = stepSpend(task) ?? 0;
        const made: JudgeDecision[] = judged.climbed ? [climbDecision(judged.pass, judged.climbed, attempt < retries, cost)] : [];
        let go: 'pass' | 'retry' | 'fail' = 'pass';
        if (!judged.pass) {
            task.verifyFail = judged.reason;
            const rec = task.workflowRunId ? this.runRecords.get(task.workflowRunId) : undefined;
            const prior = attempt > 0 ? this.tasks.filter(t => t !== task && t.workflowRunId === task.workflowRunId && t.stepIndex === task.stepIndex
                && t.branchIndex === task.branchIndex && (t.attempt ?? 0) === attempt - 1 && t.verifyFail)
                .sort((a, b) => a.createdAt - b.createdAt).pop()?.verifyFail : undefined;
            const canWake = !!rec && task.branchIndex === undefined
                && resolveWake({ workflow: w.wake, step: step.wake, run: rec.wake, live: rec.live?.wake }).conditions.length > 0;
            const next = afterFail({ attempt, retries, reason: judged.reason, prior, canWake, attemptUSD: cost });
            if (next.decision) { made.push(next.decision); }
            go = next.go;
        }
        if (made.length) {
            task.judgeDecisions = [...(task.judgeDecisions ?? []), ...made];
            const lines = made.filter(d => d.kind === 'stopped' || d.kind === 'replan').map(d => d.line + '\n').join('');
            try { if (lines) { fs.appendFileSync(task.outputFile as string, lines, 'utf8'); } } catch { /* archive gone */ }
        }
        return go;
    }

    private async verifyThenAdvance(task: FarmTask, w: FarmWorkflow, step: WorkflowStep): Promise<void> {
        const body = archivedOutputBody(fs.readFileSync(task.outputFile as string, 'utf8'));
        const attempt = task.attempt ?? 0;
        // A-27 — judged where no agent's CLAUDE.md is loaded: in the agent's folder a haiku check (measured) cost more than the step it judged
        const judged = await this.climbJudge(task, step, sj => this.runJudge(this.outputsDir, this.judgeCriteria(task, step), body, sj));
        if (judged.unjudged) {
            await this.settleUnjudged(task, w, judged.unjudged, attempt, 'Verify', judged.judge);
            return;
        }
        const { pass, reason } = judged;
        try {
            fs.appendFileSync(task.outputFile as string,
                `\nVerify (attempt ${attempt + 1}): ${pass ? 'PASS' : 'FAIL'} — ${reason} [${judged.judge}]\n${judged.climbed ? judged.climbed + '\n' : ''}`, 'utf8');
        } catch { /* archive gone */ }
        task.verified = pass ? 'pass' : 'fail';
        const retries = step.verify!.retries ?? 1;
        const go = this.judgeNext(task, w, step, judged, attempt, retries);

        if (pass) {
            this.save();
            this.advanceWorkflow(task, 'done');
            return;
        }
        if (go === 'retry') {
            this.save();
            void vscode.window.showWarningMessage(
                `Agent Farm: "${task.title}" failed verification — retrying (${attempt + 1}/${retries}).`);
            const retry = this.addTask(
                this.getAgents().find(a => a.id === task.agentId)!,
                task.title.replace(/ \(retry \d+\)$/, '') + ` (retry ${attempt + 1})`,
                task.prompt + ` — Önceki deneme şu gerekçeyle reddedildi: ${reason.replace(/"/g, "'")}. Eksiği giderip yeniden yap.`,
                task.mode,
                {
                    workflowId: task.workflowId, workflowRunId: task.workflowRunId,
                    stepIndex: task.stepIndex, projectId: task.projectId
                });
            retry.attempt = attempt + 1;
            retry.outputContract = task.outputContract;
            if (task.browserRun) { retry.browserRun = { ...task.browserRun, since: Date.now() }; }
            this.startTask(retry);
            return;
        }
        task.status = 'failed';
        this.save();
        void vscode.window.showWarningMessage(
            `Agent Farm: "${task.title}" failed verification after ${attempt + 1} attempt(s).`);
        this.advanceWorkflow(task, 'failed');
    }

    completeTask(task: FarmTask): void {
        const child = this.processes.get(task.id);
        if (child) { this.killProcess(task.id, child); }
        this.finish(task, 'done');
    }

    // ---------- ‼️ M-13 — the supervisor's side of a held retry row ----------

    /** Rows whose supervisor may be asked now (and rows left `asking` by a window that closed mid-call). */
    supervisionDue(now = Date.now()): FarmTask[] {
        return this.tasks.filter(t => t.status === 'queued' && isSupervisionOpen(t.supervision)
            && (t.supervision!.state === 'asking' || t.supervision!.at <= now));
    }

    /** Marked BEFORE the call and saved, so a restart mid-call never asks the same incident twice. */
    beginSupervision(task: FarmTask): boolean {
        const s = task.supervision;
        if (!s || s.state !== 'pending') { return false; }
        task.supervision = { ...s, state: 'asking', calls: s.calls + 1 };
        noteTaskEvent(task, 'parked', `asking the supervisor (call ${s.calls + 1})`);
        this.save();
        return true;
    }

    /** The decision (or the fallback) applied to the held row: released, held for the user, or cancelled. */
    settleSupervision(task: FarmTask, o: SupervisionOutcome, meta: { engine: string; originalPrompt: string; spentUsd?: number; sessionId?: string }): void {
        const s = task.supervision;
        if (!s || !isSupervisionOpen(s) || task.status !== 'queued') { return; }
        const fx = supervisionEffect(task, o, { originalPrompt: meta.originalPrompt, engine: meta.engine });
        Object.assign(task, fx.set);
        for (const k of fx.unset) { delete (task as unknown as Record<string, unknown>)[k]; }
        task.supervision = {
            ...s, state: o.kind === 'decision' ? 'decided' : 'fallback',
            ...(o.kind === 'decision' ? { decision: o.decision } : { note: o.note }),
            ...(meta.spentUsd ? { spentUsd: (s.spentUsd ?? 0) + meta.spentUsd } : {}),
            ...(meta.sessionId ? { sessionId: meta.sessionId } : {})
        };
        if (fx.kind === 'cancel') {
            task.status = 'cancelled';
            task.endedAt = Date.now();
            this.clearPark(task);
            noteTaskEvent(task, 'cancelled', fx.event);
            this.save();
            return;
        }
        if (fx.kind === 'hold') {
            task.deferredCode = fx.code;
            task.deferredReason = fx.event;
            noteTaskEvent(task, 'parked', fx.event);
            this.save();
            return;
        }
        this.clearPark(task);
        noteTaskEvent(task, 'retried', fx.event);
        this.startTask(task);
        this.save();
    }

    /** M-13 — the user's word on a supervised row (retrySupervision.userSupervision); a refusal says why. */
    answerSupervision(task: FarmTask, act: SupervisionAct, prompt?: string): { ok: boolean; why?: string; started?: boolean } {
        if (task.status !== 'queued') { return { ok: false, why: `the task is ${task.status} — only a queued row waits for a word` }; }
        const fx = userSupervision(task, act, prompt);
        if (!fx.ok) { return fx; }
        if (fx.prompt) { task.prompt = fx.prompt; }
        if (fx.state && task.supervision) { task.supervision = { ...task.supervision, state: fx.state, note: fx.event }; }
        if (fx.clearWait) { delete task.notBefore; delete task.notBeforeWhy; }
        noteTaskEvent(task, fx.release ? 'retried' : 'parked', fx.event);
        let started = false;
        if (fx.release) { this.clearPark(task); started = this.startTask(task); }
        this.save();
        return { ok: true, started };
    }

    cancelTask(task: FarmTask): void {
        const terminal = this.terminals.get(task.id);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(task.id);
        }
        const child = this.processes.get(task.id);
        if (child) { this.killProcess(task.id, child); }
        task.status = 'cancelled';
        task.endedAt = Date.now();
        noteTaskEvent(task, 'cancelled', 'by you');
        this.save();
        // ‼️ X-176 — the user's hand on a campaign round is the user's hand on
        // the campaign. The driver decides that (`sentryStep`); this only has
        // to make sure it is asked, which is the half that would otherwise be
        // silently missing.
        this.driveSentry(task);
    }

    /**
     * ‼️ X-176 — ask the host to drive the campaign, if this row was one of its
     * rounds. One place, so the three endings (done, failed, cancelled) cannot
     * drift apart, and guarded by the runner check for B11's reason: a follower
     * window mirrors the store and must not open sessions of its own.
     */
    private driveSentry(task: FarmTask): void {
        if (!task.sentryOf || !this.sentry || this.sentry.id !== task.sentryOf) { return; }
        if (!this.runner()) { return; }
        try { void Promise.resolve(this.opts.sentryTick?.(task)).catch(() => { /* see the port */ }); }
        catch { /* the campaign is not worth a crash */ }
    }

    /**
     * ‼️ X-176 — SWITCH A CAMPAIGN ON. Refused by name (`refuseSentry`): one at
     * a time, and it needs a project and an agent. The refusal is returned, not
     * thrown, because every door that offers this has to be able to print it.
     */
    startSentryCampaign(
        ask: SentryAsk, known?: string[]
    ): { ok: boolean; error?: string; campaign?: SentryRecord } {
        // X-207 — the accounts this machine has captured, so a pool naming one it
        // has not is refused now rather than discovered at three in the morning.
        const refusal = refuseSentry(this.sentry, ask, known);
        if (refusal) { return { ok: false, error: refusal }; }
        this.sentry = newSentry(ask, Date.now());
        this.save();
        return { ok: true, campaign: this.sentry };
    }

    /**
     * …and OFF. The record is KEPT rather than deleted: what a campaign took
     * and why it ended is the only account anybody has of an unattended night.
     * A round already on the board is left alone — it is a real session that is
     * really spending, and killing it is `cancelTask`'s decision to be asked
     * for separately.
     */
    endSentryCampaign(why?: string): SentryRecord | undefined {
        if (!this.sentry || this.sentry.status === 'stopped') { return this.sentry; }
        stopSentry(this.sentry, Date.now());
        if (why) { this.sentry.stoppedWhy = why; }
        this.save();
        return this.sentry;
    }

    /**
     * ‼️ X-177 — HOLD a campaign, and let it go again.
     *
     * A pause of THIS campaign rather than of the whole farm: the automation
     * master switch stops every schedule there is, and wanting the sentry to
     * stand still for an hour is not wanting that. A round already on the board
     * is left running for `endSentryCampaign`'s reason — it is a real session
     * that is really spending, and killing it is `cancelTask`, asked for
     * separately — but its ending will decide nothing while the hold is on.
     */
    holdSentryCampaign(on: boolean): SentryRecord | undefined {
        if (!this.sentry) { return undefined; }
        if (on) { pauseSentry(this.sentry, Date.now()); } else { resumeSentry(this.sentry, Date.now()); }
        this.save();
        return this.sentry;
    }

    /** Write what a driver step decided onto the record, in one store write. */
    /**
     * ‼️ X-178 — WHICH SIGN-INS HAVE FALLEN, AND WHICH OF THAT IS NEWS.
     *
     * The decision is `slotHealth`; this holds the record it is decided against
     * and answers with what the host should announce. Returns undefined when
     * there is no campaign — a fleet nobody is running unattended has nothing
     * to be told about at two in the morning.
     */
    applySentrySlotHealth(usage: SlotUsage[]): SlotHealth | undefined {
        if (!this.sentry) { return undefined; }
        const h = slotHealth(this.sentry.downSlots, usage);
        if (h.newlyDown.length || h.recovered.length) {
            if (h.down.length) { this.sentry.downSlots = h.down; } else { delete this.sentry.downSlots; }
            this.save();
        }
        return h;
    }

    applySentry(step: SentryStep, taskId?: string): void {
        if (!this.sentry) { return; }
        applySentryStep(this.sentry, step, taskId, Date.now());
        this.save();
    }

    /**
     * ‼️ X-176 — MAKE THE CAMPAIGN'S NEXT ROUND A ROW.
     *
     * An ORDINARY TASK: the same runner opens it, the same terminal is watched,
     * the same cancel button ends it, and the same pump launches it. That is
     * how the item's "no second scheduler" holds all the way down to the
     * launch, and the price of it — the board fills with campaign rounds — is
     * the user's own call.
     */
    openSentryRound(agent: AgentInfo, spec: SentryRoundSpec, projectId?: string): FarmTask | undefined {
        if (!this.sentry) { return undefined; }
        const row = this.addTask(agent, spec.title, spec.prompt, 'headless', {
            ...(projectId ? { projectId } : {}),
            sentryOf: this.sentry.id,
            // X-195 — the account of why these words, written once, on the row.
            ...(spec.why ? { sentryWhy: spec.why } : {}),
            // X-473 — the slot the round was placed on, and the campaign pool it came from: asked again at its start
            ...(spec.slotId ? { account: spec.slotId, accountPool: POOL } : {}),
            ...(spec.engine ? { engine: spec.engine } : {}),
            ...(spec.model ? { model: spec.model } : {}),
            ...(spec.permissionMode ? { permissionMode: spec.permissionMode } : {}),
            ...(spec.superpowers ? { superpowers: true } : {})
        });
        row.autoStart = true;
        this.save();
        return row;
    }

    /** Is a round of the live campaign on the board right now? Derived, never stored. */
    sentryBusy(): boolean {
        return !!this.sentry && sentryRunning(this.tasks, this.sentry.id);
    }

    private killProcess(taskId: string, child: cp.ChildProcess): void {
        this.processes.delete(taskId);
        try {
            if (process.platform === 'win32' && child.pid) {
                // shell:true wraps claude in cmd.exe — kill the whole tree.
                // ‼️ X-47 — `execFile` with `windowsHide`, never `exec`: `exec`
                // is a cmd.exe with a console, and a console owned by a
                // windowless extension host is a black rectangle that flashes on
                // the user's screen. `test_no_console_flash.js` measures it.
                cp.execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'],
                    { windowsHide: true }, () => { /* best effort */ });
            } else {
                child.kill();
            }
        } catch { /* already gone */ }
    }

    /**
     * ‼️ M-8 — A ROW YOU DELETE IS FILED, NOT BURNED, AND IT COMES BACK.
     *
     * Two ways off this list already archived the task into
     * `task-history/YYYY-MM.jsonl` (Clear Finished, and the overflow past
     * MAX_TASKS) and the third — the ✕ on the row, the one a person presses by
     * accident — simply dropped it. So the only route that a HAND takes was the
     * only one with no way back and no record: "I deleted it, where do I look
     * now" had no answer. It goes to the same archive as the other two, which
     * is what the Analytics page and every 7-day figure already read.
     *
     * The returned task is the caller's single-level undo (the Notices page's
     * shape). Restoring it puts the row back where it was; its OUTPUT file is
     * gone either way, and the row says so rather than offering a dead button.
     *
     * ‼️ M-8 (reopened) — THE ARCHIVE WRITE IS THE COMMIT POINT, AND IT IS
     * FIRST. This used to drop the row, then attempt an archive that swallowed
     * every error, then delete the output and save — so a full disk or a locked
     * month file produced exactly the visible result of a successful archive
     * with none of the archive.
     *
     * ‼️ M-8 (V2) — AND THE LIVE LIST IS INSIDE THE TRANSACTION TOO. Four
     * stages, in the only order where a failure costs nothing:
     *
     *   1. refuse it outright in a follower window (`assertRunner`),
     *   2. file the row in the month archive — nothing has moved yet,
     *   3. persist the list WITHOUT it, atomically, and if that throws put a
     *      tombstone back over step 2 so the archive does not claim a deletion
     *      that did not happen,
     *   4. only now change memory and delete the output file — the one step
     *      that cannot be taken back is the last one.
     */
    deleteTask(task: FarmTask): FarmTask {
        this.assertRunner('A run');
        const next = this.tasks.filter(t => t.id !== task.id);
        this.appendHistory([task]);
        try {
            this.writeStore(next);
        } catch (e) {
            let extra = '';
            try { this.appendUndelete([task]); } catch (u) {
                // M-8 (V3) — queued for the repair pump like every other failed
                // tombstone; the sentence says it will be retried rather than
                // leaving the user to wonder whether to do something.
                this.queueArchiveRepair([task]);
                try { this.writeStore(this.tasks); } catch { /* the disk is the problem */ }
                extra = ' The archive also still lists it as deleted — its tombstone could not be'
                    + ` written either (${String(u)}); it is retried every 30 seconds.`;
            }
            throw new Error(`the task list could not be written (${String(e)}).${extra}`);
        }
        this.tasks = next;
        this.deleteOutput(task);
        this.afterWrite();
        return task;
    }

    /**
     * Put deleted rows back (UI undo). Ids still present are skipped, so a
     * double-press cannot duplicate a row. Returns how many came back.
     *
     * ‼️ M-8 (V2) — the live list goes down FIRST, because that is the half the
     * user is asking for; the tombstone follows and, if it cannot be written,
     * says so through `onArchiveDrift` instead of a `console.warn`. The run is
     * safe either way — what is broken is that `tasks.history` still shows it
     * as deleted, and that is a sentence somebody has to read.
     */
    restoreTasks(list: FarmTask[]): number {
        this.assertRunner('An undo');
        const back: FarmTask[] = [];
        const next = [...this.tasks];
        for (const t of list) {
            if (!t || typeof t.id !== 'string' || next.some(x => x.id === t.id)) { continue; }
            // The output file was deleted with the row and is not coming back;
            // a row still offering an `output` button would be a dead button.
            const row: FarmTask = { ...t };
            delete row.outputFile;
            next.push(row);
            back.push(row);
        }
        if (!back.length) { return 0; }
        this.writeStore(next);
        this.tasks = next;
        // ‼️ M-8 — and the archive is told, or it keeps a copy of a run that
        // is sitting on the live list (see `appendUndelete`).
        try {
            this.appendUndelete(back);
        } catch (e) {
            // ‼️ M-8 (V3) — and it is RETRIED (see pumpArchiveRepair): a locked
            // month file is a moment, and a divergence nobody ever tries to heal
            // is a permanent lie about the archive maintained by a warning.
            this.queueArchiveRepair(back);
            this.save();
            this.opts.onArchiveDrift?.(
                `${back.length} restored run(s) are back on the board, but the task archive still lists`
                + ` them as deleted — its tombstone could not be written (${String(e)}).`
                + ' Task history will show them twice until it can; it is retried every 30 seconds'
                + ' and you will be told when it succeeds.');
        }
        this.afterWrite();
        return back.length;
    }

    private deleteOutput(task: FarmTask): void {
        if (task.outputFile) {
            try { fs.unlinkSync(task.outputFile); } catch { /* keep going */ }
        }
    }

    /**
     * ‼️ ONE STEP — and the ONE place that decides what "up" and "down" mean.
     *
     * Returns where the task landed, or -1 when there was nowhere to go: it is
     * already at that end of its agent's queue, or it is not queued at all. The
     * tree's arrows ignore that number (a press at the top is a press that does
     * nothing, which is what an arrow at the top should do); the bridge turns
     * it into the sentence that says WHICH end was hit, because an agent that
     * asked for a move and got silence cannot tell it from a move that worked.
     *
     * It returns something at all because `tasks.move` used to resolve the
     * siblings and the bounds a second time, in extension.ts, to be able to say
     * that sentence — two implementations of one gesture, kept in step by hand.
     */
    moveTask(task: FarmTask, dir: -1 | 1): number {
        const siblings = this.queuedSiblings(task);
        const i = siblings.indexOf(task);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= siblings.length) { return -1; }
        return this.moveTaskTo(task, j);
    }

    /** The queued rows this task competes with — its agent's, in board order. */
    private queuedSiblings(task: FarmTask): FarmTask[] {
        return this.tasks.filter(t => t.agentId === task.agentId && t.status === 'queued');
    }

    /**
     * B-4 — move a queued task to an EXACT place in its agent's queue (0 = next
     * up). One step at a time is the tree's gesture; "third from the top" is
     * what somebody reordering a whole queue actually means, and repeating a
     * one-step move to get there is how a queue ends up half sorted.
     *
     * A position past the end means "last" rather than an error — the caller is
     * told where it landed. Only the SLOTS the queued siblings already occupy
     * are rewritten, so running and finished rows interleaved between them do
     * not move.
     */
    moveTaskTo(task: FarmTask, index: number): number {
        const siblings = this.queuedSiblings(task);
        const from = siblings.indexOf(task);
        if (from < 0) { return -1; }
        const to = Math.max(0, Math.min(siblings.length - 1, Math.trunc(index)));
        if (to === from) { return from; }
        const slots = siblings.map(s => this.tasks.indexOf(s));
        const order = siblings.slice();
        order.splice(from, 1);
        order.splice(to, 0, task);
        slots.forEach((slot, i) => { this.tasks[slot] = order[i]; });
        this.save();
        return to;
    }

    /**
     * B-4 — end a park EPISODE by hand and ask for the launch again ("retry
     * start" on the row). The page did this inline, so the only way to release
     * a run a budget ceiling was holding was to be sitting in front of it.
     *
     * Returns whether it actually launched: a ceiling that is still there parks
     * it straight back, and a caller told "started" would be lied to.
     */
    unparkTask(task: FarmTask): boolean {
        if (task.status !== 'queued') { return false; }
        task.autoStart = false;
        // ‼️ M-11 — the blocker's code goes with the sentence. Ending the
        // episode is what makes the SAME ceiling catching it again news a
        // second time.
        task.deferredReason = undefined;
        task.deferredCode = undefined;
        return this.startTask(task);
    }

    /** Bump a queued task above every other queued task and request its start (launches next as capacity frees). */
    runTaskNext(task: FarmTask): void {
        if (task.status !== 'queued') { return; }
        const maxP = Math.max(0, ...this.tasks
            .filter(t => t.status === 'queued' && t.id !== task.id)
            .map(t => t.priority ?? 0));
        task.priority = maxP + 1;
        this.startTask(task);
    }

    /** An already-queued task on the same agent with the same prompt — the dup guard for the add flow. */
    queuedDuplicate(agentId: string, prompt: string): FarmTask | undefined {
        const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
        const target = norm(prompt);
        return this.tasks.find(t => t.status === 'queued'
            && t.agentId === agentId && norm(t.prompt) === target);
    }

    /**
     * Re-run a finished task as a fresh copy. A workflow-step task (with no edited
     * prompt) resumes the chain from its step instead of running in isolation.
     *
     * ‼️ A RETRY IS AN EDIT, NOT ONLY A NEW PROMPT. `over` is what the page's
     * retry form changed before pressing go — agent, title, mode, model,
     * effort, permissions, project, CLI, folder, priority — because "run that
     * again on opus at low effort" is the commonest reason to retry anything.
     * Everything omitted is the ORIGINAL's, which is the point of a retry.
     */
    retryTask(
        task: FarmTask, newPrompt?: string,
        over?: {
            agent?: AgentInfo; title?: string; mode?: TaskMode; autoStart?: boolean;
            /**
             * ‼️ B-03.8 — WHAT THE COPY *IS*, and it is the only thing this
             * changes. A run picked back up after the host restarted carries
             * exactly the dimensions a retry carries — that is the whole reason
             * it comes through here rather than growing a second copy path (the
             * defect M-32 is named for). What it is NOT is attempt number four:
             * "(retry 4)" on the board would say the work failed three times
             * when what actually happened is that the window went down under it.
             */
            as?: 'retry' | 'revive';
        }
            & Partial<Pick<FarmTask,
                'engine' | 'model' | 'effort' | 'permissionMode' | 'cli' | 'workDir'
                | 'providerId' | 'tier' | 'account'
                | 'interactiveTarget' | 'interactiveClose' | 'finishSound' | 'superpowers'
                | 'priority' | 'projectId' | 'ignoreBudget'
                // ‼️ M-32 — …and the three the AUTOMATIC retry has always
                // carried and this one dropped (see maybeScheduleRetry).
                | 'retry' | 'rounds' | 'resumeSessionId' | 'resumedEngine' | 'resumedFrom'
                // S-82 — and whether it opens a relay, with its own leg ceiling.
                | 'baton' | 'batonMaxHops'>>
    ): FarmTask | undefined {
        if (task.workflowId !== undefined && task.stepIndex !== undefined && newPrompt === undefined) {
            this.resumeWorkflowFromTask(task);
            return undefined;
        }
        const agent = over?.agent ?? this.getAgents().find(a => a.id === task.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for "${task.title}" not found.`);
            return undefined;
        }
        const revive = over?.as === 'revive';
        const baseTitle = (over?.title ?? task.title)
            .replace(/ \(retry \d+\)$/i, '').replace(/ \(continued(?: \d+)?\)$/i, '');
        const attempt = (task.attempt ?? 0) + 1;
        // ‼️ THE RETRY RUNS THE WAY THE ORIGINAL RAN. Only `projectId` was
        // carried, so a task launched on haiku at low effort came back as a
        // retry with no --model and no --effort at all: the same prompt on a
        // different, more expensive command line, silently.
        // X-106 - AND THE RETRY RUNS ON THE ROUTE THE ORIGINAL RAN ON. The same
        // rule the engine and the model already follow here, and the one where
        // silence costs most: a retry that quietly moved to the agent-s standing
        // endpoint is a different run wearing the same name, and nothing
        // afterwards would say which one served it. The tier travels with the
        // route it belongs to - carried separately it could survive onto a route
        // that maps a different model for the same word.
        //
        // It is handed to addTask rather than written on the copy afterwards
        // because the enqueue is where the route is SEALED: a retry is a new
        // enqueue and gets its own seal, of the route as it stands now.
        const retryRoute = routeOf(over && 'providerId' in over
            ? { providerId: over.providerId, tier: over.tier }
            : { providerId: task.providerId, tier: task.tier });
        const copy = this.addTask(agent,
            revive
                ? `${baseTitle} (continued${attempt > 2 ? ' ' + (attempt - 1) : ''})`
                : `${baseTitle} (retry ${attempt})`,
            newPrompt ?? task.prompt,
            over?.mode ?? task.mode,
            {
                ...(retryRoute ?? {}),
                // The retry belongs to the ORIGINAL's project, not to whatever the
                // window moved on to in the meantime — a rerun of the same work is
                // the same work.
                projectId: over && 'projectId' in over ? over.projectId : task.projectId,
                // …and on the engine it ran on. A retry that silently moved to
                // another engine would be a different run wearing the same name.
                engine: over?.engine ?? task.engine,
                model: over?.model ?? task.model,
                effort: over?.effort ?? task.effort,
                permissionMode: over?.permissionMode ?? task.permissionMode,
                priority: over?.priority ?? task.priority
            });
        copy.attempt = attempt;
        copy.outputContract = task.outputContract;
        // S-129 — a revive is the same relay leg picked up again; a retry or a rerun is not
        if (revive && task.relayOf) { copy.relayOf = task.relayOf; }
        // X-169 - and on the account the original ran on. A retry that moved to
        // whichever account happens to be active now would bill a different
        // plan for the same work and say nothing about it.
        copy.account = over && 'account' in over ? over.account : task.account;
        copy.cli = over?.cli ?? task.cli;
        copy.workDir = over?.workDir ?? task.workDir;
        // ‼️ M-26 — a retry runs where the original ran, unless the form said
        // otherwise. "Run that again, but in an OS terminal this time" is the
        // whole reason the form can override it; keeping the original's answer
        // is the reason the fallback is the task's own.
        copy.interactiveTarget = over?.interactiveTarget ?? task.interactiveTarget;
        copy.interactiveClose = over?.interactiveClose ?? task.interactiveClose;
        // ‼️ A-24 — and it sounds the way the original sounded. A rerun that
        // silently went back to the fleet's tone would be the same defect the
        // engine and the model had here: the run you asked to hear finishing is
        // exactly the run you are not watching.
        copy.finishSound = over?.finishSound ?? task.finishSound;
        // ‼️ M-30 — and it works the way the original worked, for the same
        // reason. A rerun that quietly fell back to the agent's default would
        // be a different job from the one being retried.
        copy.superpowers = over?.superpowers ?? task.superpowers;
        copy.missionId = task.missionId;
        copy.ignoreBudget = over?.ignoreBudget ?? task.ignoreBudget;
        /**
         * ‼️ M-32 — AND THE THREE THE AUTOMATIC RETRY ALREADY CARRIED.
         *
         * `maybeScheduleRetry` copies the policy, the round chain and the
         * conversation being continued; this one — the button and the retry
         * form — copied none of them. So the same run retried by the machine
         * and retried by hand were two different runs: one kept "ask it these
         * three things next" and its own retry ceiling, the other silently fell
         * back to the fleet default and one prompt. Same principle as the
         * engine and the model above, and it is the defect M-32 is named for.
         *
         * ‼️ AND FOR THESE THREE, `undefined` MEANS "CLEAR IT" — the key being
         * PRESENT is what decides, not its value (the rule `applyForm` states
         * in tasksPanel.ts). A form that draws the boxes has an answer for all
         * of them including "none", so `??` would make emptying the chain or
         * putting the policy back to the default impossible: the original's
         * would come back over the top of what was just cleared. A caller with
         * nothing to say — the rerun button, the bridge — omits the key and
         * inherits, which is every other field's rule above.
         */
        const said = (k: string): boolean => !!over && k in over;
        copy.retry = said('retry') ? over?.retry : task.retry;
        const rounds = said('rounds') ? over?.rounds : task.rounds;
        if (rounds?.length) { copy.rounds = rounds; } else { delete copy.rounds; }
        // S-82 — a rerun of a run that opened a relay opens one too, on a NEW
        // chain: the seal is by session, and the chain's name is deliberately
        // not carried (a named chain already has legs). The key-present rule
        // above applies — the form always has an answer, including "not this
        // time"; the button and the bridge omit the key and inherit.
        const baton = said('baton') ? over?.baton === true : task.baton === true;
        const cap = normalizeLegCeiling(said('batonMaxHops') ? over?.batonMaxHops : task.batonMaxHops);
        if (baton) { copy.baton = true; if (cap !== undefined) { copy.batonMaxHops = cap; } }
        // ‼️ S-19 — a retry of a run that was continuing a conversation continues
        // the SAME conversation: the words being sent again were written for that
        // context, and opening a new session would answer them without it.
        const resume = said('resumeSessionId') ? over?.resumeSessionId : task.resumeSessionId;
        if (resume) {
            copy.resumeSessionId = resume;
            const engine = over?.resumedEngine ?? task.resumedEngine;
            const from = over?.resumedFrom ?? task.resumedFrom;
            if (engine) { copy.resumedEngine = engine; }
            if (from) { copy.resumedFrom = from; }
        }
        if (revive) {
            noteTaskEvent(copy, 'resumed',
                `the window restarted mid-run — this picks "${task.title}" up in its own conversation`);
        } else {
            noteTaskEvent(copy, 'retried', `attempt ${attempt} of "${task.title}"`);
        }
        // A retry started by hand from a form can be queued rather than run —
        // the same "start it now" bargain every other route offers.
        if (over?.autoStart === false) {
            this.save();
            return copy;
        }
        this.startTask(copy);
        return copy;
    }

    /**
     * Re-enter a workflow at the step this task belongs to, rebuilding the handoff
     * from the previous step's output in the same run (empty for the first step).
     */
    resumeWorkflowFromTask(task: FarmTask): void {
        const w = this.runView(task.workflowId, task.workflowRunId);
        if (!w || task.stepIndex === undefined) {
            void vscode.window.showWarningMessage(
                `Agent Farm: the workflow for "${task.title}" no longer exists.`);
            return;
        }
        const stepIndex = task.stepIndex;
        if (stepIndex >= w.steps.length) {
            void vscode.window.showWarningMessage(
                `Agent Farm: step ${stepIndex + 1} no longer exists in "${w.title}".`);
            return;
        }
        const runId = task.workflowRunId ?? newId();
        if (task.wokeBy) {
            const sup = this.runRecords.get(runId)?.supervisor;
            if (sup) { sup.inFlight = undefined; }
            this.runCounts.set(runId, 0);
            void vscode.window.showInformationMessage(`Agent Farm: resuming workflow "${w.title}" after step ${stepIndex + 1} — the supervisor's call was cut off, so it goes the mechanical way.`);
            this.mechanicalAdvance(w, stepIndex, task.wokeAfter ?? 'done', this.rebuildHandoff(runId, stepIndex + 1), runId);
            return;
        }
        const handoff = this.rebuildHandoff(runId, stepIndex);
        this.runCounts.set(runId, 0);
        void vscode.window.showInformationMessage(
            `Agent Farm: resuming workflow "${w.title}" from step ${stepIndex + 1}.`);
        this.routeToStep(w, stepIndex, handoff, runId);
    }

    /**
     * ‼️ M-8 (reopened) — NOTHING IS REMOVED BEFORE THE ARCHIVE HAS IT.
     * Same bargain as `deleteTask`: the append is the commit point, and a
     * failure here leaves the list exactly as it was rather than clearing rows
     * whose only other copy was the output file it was about to delete.
     * ‼️ M-8 (V2) — and the same four stages, for the same reason: this clears
     * many rows at once, so a store write that quietly failed here would take
     * every one of their outputs with it.
     */
    clearFinished(): number {
        this.assertRunner('Clearing finished runs');
        const finished = this.tasks.filter(t =>
            t.status !== 'queued' && t.status !== 'running');
        if (!finished.length) { return 0; }
        const next = this.tasks.filter(t =>
            t.status === 'queued' || t.status === 'running');
        this.appendHistory(finished);
        try {
            this.writeStore(next);
        } catch (e) {
            let extra = '';
            try { this.appendUndelete(finished); } catch (u) {
                extra = ' The archive also still lists them as deleted — the tombstones could not be'
                    + ` written either (${String(u)}).`;
            }
            throw new Error(`the task list could not be written (${String(e)}).${extra}`);
        }
        this.tasks = next;
        for (const t of finished) { this.deleteOutput(t); }
        this.afterWrite();
        return finished.length;
    }

    nextQueuedFor(agentId: string): FarmTask | undefined {
        const now = Date.now();
        return this.tasks
            .filter(t => t.agentId === agentId && t.status === 'queued')
            .sort((a, b) => this.effectivePriority(b, now) - this.effectivePriority(a, now)
                || a.createdAt - b.createdAt)[0];
    }

    revealTerminal(task: FarmTask): void {
        this.terminals.get(task.id)?.show();
    }

    // ---------- templates ----------

    addTemplate(t: Omit<FarmTemplate, 'id'>): FarmTemplate {
        const template: FarmTemplate = { ...t, id: newId() };
        this.templates.push(template);
        this.save();
        return template;
    }

    deleteTemplate(t: FarmTemplate): void {
        this.deletePlanRows([{ kind: 'template', id: t.id }]);
    }

    // ---------- workflows ----------

    addWorkflow(title: string, steps: WorkflowStep[], inputs?: WorkflowInput[]): FarmWorkflow {
        const workflow: FarmWorkflow = { id: newId(), title, steps, ...(inputs?.length ? { inputs } : {}) };
        this.workflows.push(workflow);
        this.save();
        return workflow;
    }

    deleteWorkflow(w: FarmWorkflow): void {
        this.deletePlanRows([{ kind: 'workflow', id: w.id }]);
    }

    renameWorkflow(w: FarmWorkflow, title: string): void {
        w.title = title;
        this.save();
    }

    addWorkflowStep(w: FarmWorkflow, step: WorkflowStep): void {
        w.steps.push(step);
        this.save();
    }

    updateWorkflowStep(w: FarmWorkflow, index: number, patch: Partial<WorkflowStep>): void {
        if (index < 0 || index >= w.steps.length) { return; }
        w.steps[index] = { ...w.steps[index], ...patch };
        this.save();
    }

    moveWorkflowStep(w: FarmWorkflow, index: number, dir: -1 | 1): void {
        const j = index + dir;
        if (index < 0 || j < 0 || j >= w.steps.length) { return; }
        [w.steps[index], w.steps[j]] = [w.steps[j], w.steps[index]];
        this.save();
    }

    deleteWorkflowStep(w: FarmWorkflow, index: number): void {
        if (index < 0 || index >= w.steps.length) { return; }
        w.steps.splice(index, 1);
        this.save();
    }

    /** Recent workflow runs (for the timeline visualization). */
    workflowRuns(sinceMs: number): {
        runId: string; title: string;
        steps: { title: string; agentName: string; status: TaskStatus; startedAt?: number; endedAt?: number }[];
        /** U-153 — set once the supervisor has been asked on this run */
        supervisor?: SupervisorTrail & { running: boolean };
    }[] {
        const cutoff = Date.now() - sinceMs;
        const byRun = new Map<string, FarmTask[]>();
        for (const t of this.tasks) {
            if (!t.workflowRunId || !t.startedAt || t.startedAt < cutoff) { continue; }
            const list = byRun.get(t.workflowRunId) ?? [];
            list.push(t);
            byRun.set(t.workflowRunId, list);
        }
        const runs = [];
        for (const [runId, list] of byRun) {
            list.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
            const w = this.workflows.find(x => x.id === list[0].workflowId);
            runs.push({
                runId,
                title: w?.title ?? list[0].title.split(' ')[0],
                steps: list.map(t => ({
                    title: t.title,
                    agentName: t.agentName,
                    status: t.status,
                    startedAt: t.startedAt,
                    endedAt: t.endedAt
                })),
                ...this.supervisorStatus(runId)
                    .filter(s => s.rows.length).map(supervisor => ({ supervisor }))[0]
            });
        }
        runs.sort((a, b) => (b.steps[0]?.startedAt ?? 0) - (a.steps[0]?.startedAt ?? 0));
        return runs;
    }

    /** U-153 — the supervisor's trail on one run, or on every run still going (src/core/supervisorTrail.ts). */
    supervisorStatus(runId?: string): (SupervisorTrail & { running: boolean; workflowTitle: string })[] {
        const going = (id: string) => this.tasks.some(t => t.workflowRunId === id && (t.status === 'running' || t.status === 'queued'));
        const ids = runId ? [runId] : [...new Set(this.tasks.filter(t => t.workflowRunId && going(t.workflowRunId)).map(t => t.workflowRunId!))];
        return ids.filter(id => this.runRecords.has(id) || this.tasks.some(t => t.workflowRunId === id)).map(id => {
            const rec = this.runRecords.get(id);
            return { ...supervisorTrail(id, this.tasks, rec), running: going(id), workflowTitle: rec?.title ?? '' };
        });
    }

    /** M-47 — a line on the run's board (who answered its supervisor's question); the mission reads it with the board. */
    noteOnRun(runId: string, note: string): void {
        const rec = this.runRecords.get(runId);
        if (!rec) { return; }
        rec.board = { steps: rec.board?.steps ?? {}, notes: [...(rec.board?.notes ?? []), note].slice(-20) };
        this.save();
    }

    /** X-474 — a round placed on a full account says so on its row, once (misplaced.ts). */
    noteMisplaced(taskId: string, why: string): void {
        const t = this.tasks.find(x => x.id === taskId);
        if (!t || (t.events ?? []).some(e => e.kind === 'misplaced')) { return; }
        noteTaskEvent(t, 'misplaced', why);
        this.save();
    }

    /** M-47 — what a mission reads for a run: once it has ended, the final handoff with the run's board beside it. */
    missionHandoffFile(runId: string): string | undefined {
        const st = this.workflowRunState(runId);
        if (!st || st.status === 'running' || !Object.keys(st.board?.steps ?? {}).length) { return st?.handoff?.file; }
        const f = path.join(this.outputsDir, `${runId}.mission.md`);
        try {
            if (!fs.existsSync(f)) {
                fs.mkdirSync(this.outputsDir, { recursive: true });
                fs.writeFileSync(f, missionHandoffText(st.title, st.handoff?.text, st.board), 'utf8');
            }
            return f;
        } catch { return st.handoff?.file; }
    }

    /** Loop guard: total step executions per workflow run. */
    private static readonly MAX_RUN_STEPS = 25;
    private runCounts = new Map<string, number>();

    /**
     * ‼️ M-18 — ONE ENTRY POINT, AND IT ANSWERS. The command palette, the
     * right-click, the trigger, the bridge and a mission's `run_workflow` all
     * come through here; what they get back is the run's id, which is the only
     * thing that makes the run findable afterwards. `undefined` means nothing
     * started — an empty chain — rather than a run nobody can name.
     */
    runWorkflow(w: FarmWorkflow, opts?: WorkflowRunOpts): string | undefined {
        const runId = this.prepareWorkflowRun(w, opts);
        if (!runId) { return undefined; }
        this.startWorkflowRun(runId, w);
        return runId;
    }

    /**
     * ‼️ X-74 — A RUN IS NAMED BEFORE IT IS STARTED, so a caller can write the
     * bond down first.
     *
     * A mission step that starts a chain has to record WHICH chain it started,
     * and it could not: `runWorkflow` started the first task and returned the
     * id in one breath, so the ref reached the parent's snapshot strictly after
     * real work was already running. A window closing in between left a chain
     * doing work no action owned — the parent read "interrupted, fate unknown"
     * while the chain finished perfectly and charged for it.
     *
     * Two calls, so the caller owns the moment in between: this one allocates
     * the id and the run's record and starts NOTHING; `startWorkflowRun` starts
     * it, and does so once. Anything that has no bond to persist keeps calling
     * `runWorkflow` and cannot tell the difference.
     */
    prepareWorkflowRun(w: FarmWorkflow, opts?: WorkflowRunOpts): string | undefined {
        if (!w.steps.length) { return undefined; }
        // ‼️ M-38 — a run missing a required input does not start; the caller
        // asks workflowRunRefusal first to say which one and why.
        const given = resolveInputs(w.inputs, opts?.inputs, opts?.inputSource);
        if (!given.ok) { return undefined; }
        const typed = Object.keys(given.values).filter(k => given.origin[k] !== 'workflow');
        if (typed.length) { w.lastInputs = Object.fromEntries(typed.map(k => [k, given.values[k]])); }
        const runId = newId();
        this.runCounts.set(runId, 0);
        // ‼️ M-18/X-73 — WHOSE WORK THIS CHAIN IS, DECIDED ONCE, HERE. A chain
        // started by a mission is work for the MISSION's project; a trigger
        // firing an hour after anybody looked at this window passes the key
        // empty and means NO project. Only a caller that says nothing at all
        // inherits the window — and even that is resolved now, at the start,
        // not whenever each step happens to be made: a run is one piece of
        // work, so the row made an hour later belongs where the first one did.
        this.runRecords.set(runId, {
            workflowId: w.id, title: w.title, startedAt: Date.now(),
            project: (opts && 'projectId' in opts)
                ? (opts.projectId ?? null)
                : (this.opts.activeProjectId?.() ?? null),
            ...(Object.keys(given.values).length ? { inputs: given.values } : {}),
            ...(opts?.wake ? { wake: opts.wake } : {}),
            ...(opts?.production ? { production: opts.production } : {}),
            ...(opts?.roles && Object.keys(opts.roles).length ? { roles: opts.roles } : {}),
            ...((c: SpendCap) => (c.usd > 0 ? { spendCap: c } : {}))(runSpendCap(opts?.spendCap, w.spendCap, this.opts.spendCapSetting?.())),
            ...(opts?.judgeLadder ? { judgeLadder: opts.judgeLadder } : {})
        });
        this.lib?.prepare(w);
        return runId;
    }

    /** M-38 — why this workflow cannot start with these inputs; '' when it can. */
    workflowRunRefusal(w: FarmWorkflow, inputs?: Record<string, unknown>, source: 'run' | 'trigger' = 'run'): string {
        if (!w.steps.length) { return `"${w.title}" has no steps — there was nothing to start.`; }
        const v = resolveInputs(w.inputs, inputs, source);
        return v.ok ? '' : `"${w.title}" did not start: ${v.problems.join('; ')}.`;
    }

    /**
     * ‼️ X-74 — AND STARTING IT IS IDEMPOTENT, because the caller in between may
     * have crashed and come back. A run that already made a row is already
     * started; a run that already ended is not restarted by asking again. So
     * "allocate → persist the bond → start with the same id" can be replayed
     * from any point in it and buys the chain exactly once.
     */
    startWorkflowRun(runId: string, w: FarmWorkflow): void {
        if (!this.runRecords.has(runId)) { return; }
        if (this.runRecords.get(runId)?.ended) { return; }
        if (this.tasks.some(t => t.workflowRunId === runId)) { return; }
        if (this.airtableFirst(runId, w)) { return; }
        this.routeToStep(w, 0, {}, runId);
    }

    private lookingUp = new Set<string>();
    /** X-420 — a run with airtable inputs looks them up first; the records become their values, then the first step starts. */
    private airtableFirst(runId: string, w: FarmWorkflow): boolean {
        const rec = this.runRecords.get(runId);
        const ins = (w.inputs ?? []).filter(i => i.type === 'airtable');
        if (!rec || !ins.length || rec.airtable || !this.opts.airtableInputs) { return false; }
        if (this.lookingUp.has(runId)) { return true; }
        this.lookingUp.add(runId);
        const fail = (why: string) => { this.lookingUp.delete(runId); this.endWorkflowRun(runId, 'failed', `Airtable input: ${why}`, 0); };
        void this.opts.airtableInputs(ins, rec.inputs ?? {}).then(r => {
            if (r.error) { fail(r.error); return; }
            this.lookingUp.delete(runId);
            rec.inputs = { ...(rec.inputs ?? {}), ...r.values };
            rec.airtable = r.lines;
            if (r.base) { rec.airtableBase = r.base; }
            this.save();
            this.routeToStep(w, 0, {}, runId);
        }, e => fail((e as Error).message));
        return true;
    }

    /** ‼️ X-71/X-73 — one record per run, persisted. A run absent from here
     *  predates it and is still derived from its own rows, exactly as it was. */
    private runRecords = new Map<string, WorkflowRunRecord>();

    /**
     * ‼️ X-71 — WHY A RUN ENDED, ONTO THE RUN'S OWN RECORD. The loop guard, a
     * chain that reached its end and a first step whose agent is gone all leave
     * rows that look exactly like a chain waiting for its next step — or, in the
     * last case, no rows at all. Persisted with the record, because the reason a
     * chain stopped is precisely the thing a reload used to lose.
     */
    private endWorkflowRun(runId: string, status: WorkflowRunStatus, reason: string, stepIndex?: number): void {
        const rec = this.runRecords.get(runId);
        if (!rec) { return; }
        rec.ended = {
            status, reason, at: Date.now(),
            ...(stepIndex !== undefined ? { stepIndex } : {})
        };
        this.save();
        if (this.lib && rec.library?.length) {
            void this.lib.ended(rec.library, status).then(lines => { if (lines.length) { rec.libraryEnd = lines; this.save(); } }, () => undefined);
        }
    }

    /**
     * The state of one workflow run: its rows say whether it is running, its
     * record says everything the rows cannot.
     *
     * ‼️ X-71 — A RUN WITH NO ROWS IS STILL AN ANSWER. A chain whose every step
     * was skipped by `runIf` is `done`; one whose first step names an agent that
     * is gone is `failed`. Both produce no task at all, and both used to come
     * back `undefined` — which a parent mission reads as "still working" and
     * polls for ever. Undefined now means only what it should: nothing was ever
     * started under this id, or its whole record is gone.
     */
    workflowRunState(runId: string): WorkflowRunState | undefined {
        const tasks = this.tasks.filter(t => t.workflowRunId === runId);
        const rec = this.runRecords.get(runId);
        if (!tasks.length) {
            if (!rec) { return undefined; }
            return {
                runId, workflowId: rec.workflowId, title: rec.title,
                status: rec.ended?.status ?? 'running',
                startedAt: rec.startedAt,
                ...(rec.ended ? { endedAt: rec.ended.at } : {}),
                ...(rec.ended?.reason ? { reason: rec.ended.reason } : {}),
                ...(rec.ended?.stepIndex !== undefined ? { stoppedAtStep: rec.ended.stepIndex } : {}),
                steps: [], costUSD: 0, tokens: 0
            };
        }
        tasks.sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0) || (a.startedAt ?? 0) - (b.startedAt ?? 0));
        const w = this.runView(tasks[0].workflowId, tasks[0].workflowRunId);
        const steps: WorkflowRunStep[] = tasks.map(t => ({
            index: t.stepIndex ?? 0,
            title: t.title,
            agentName: t.agentName,
            status: t.status,
            taskId: t.id,
            ...(t.outputFile ? { outputFile: t.outputFile } : {}),
            ...(stepSpend(t) !== undefined ? { costUSD: stepSpend(t) } : {}),
            ...(t.tokens !== undefined ? { tokens: t.tokens } : {})
        }));
        const live = tasks.some(t => t.status === 'queued' || t.status === 'running');
        const end = rec?.ended;
        // ‼️ X-71 — ONE VERDICT PER STEP, AND IT IS THE LATEST ONE. A failed step
        // resumed under the same run id leaves BOTH rows behind, and reading
        // "did anything fail?" across all of them let the abandoned first
        // attempt outvote the attempt that succeeded: after a reload, a chain
        // that was resumed and finished cleanly reported itself failed. The
        // earlier attempts stay on the record as history; only the current one
        // speaks for its step.
        const currentByStep = new Map<number, FarmTask>();
        for (const t of tasks) {
            const i = t.stepIndex ?? 0;
            const prev = currentByStep.get(i);
            if (!prev || (t.startedAt ?? t.createdAt) >= (prev.startedAt ?? prev.createdAt)) {
                currentByStep.set(i, t);
            }
        }
        const current = [...currentByStep.values()];
        // ‼️ THE TASKS OUTRANK THE MEMO. Something still running means running,
        // whatever an earlier ending said — a resumed chain re-enters an id that
        // has already ended once, and a memo that could overrule the rows would
        // report it finished while it was working.
        let status: WorkflowRunStatus;
        if (live) {
            status = 'running';
        } else if (end) {
            status = end.status;
        } else if (current.some(t => t.status === 'failed' || t.status === 'cancelled')) {
            status = 'failed';
        } else if (w && (tasks[tasks.length - 1].stepIndex ?? 0) >= w.steps.length - 1) {
            status = 'done';
        } else {
            // settled, nothing failed, and the chain never reached its last
            // step: it was cut short by something this window no longer knows
            status = 'stopped';
        }
        const lastDone = [...tasks].reverse().find(t => t.status === 'done');
        const endedAt = live ? undefined
            : (end?.at ?? (tasks.reduce((a, t) => Math.max(a, t.endedAt ?? 0), 0) || undefined));
        return {
            runId,
            workflowId: tasks[0].workflowId ?? '',
            title: w?.title ?? tasks[0].title,
            status,
            ...(tasks[0].startedAt !== undefined ? { startedAt: tasks[0].startedAt } : {}),
            ...(endedAt !== undefined ? { endedAt } : {}),
            ...(!live && end?.reason ? { reason: end.reason } : {}),
            ...(!live && end?.stepIndex !== undefined ? { stoppedAtStep: end.stepIndex } : {}),
            ...(lastDone ? { handoff: this.computeHandoff(lastDone) } : {}),
            ...(rec?.board ? { board: rec.board } : {}),
            ...(rec?.forEach ? { forEach: FE.forEachSummary(rec.forEach) } : {}),
            ...(rec?.airtable ? { airtable: rec.airtable } : {}),
            ...(rec?.libraryEnd ? { libraryEnd: rec.libraryEnd } : {}),
            ...(rec?.spendCap ? { spendCap: rec.spendCap } : {}),
            ...(rec?.judgeLadder ? { judgeLadder: rec.judgeLadder } : {}),
            ...((e?: RunEconomy) => (e ? { economy: e } : {}))(runEconomy(tasks)),
            steps,
            costUSD: tasks.reduce((a, t) => a + (stepSpend(t) ?? 0), 0),
            tokens: tasks.reduce((a, t) => a + (t.tokens ?? 0), 0)
        };
    }

    /**
     * Rebuild a step's incoming handoff from disk: the latest done task of the
     * previous step in the same run. Used wherever the in-memory handoffs map
     * may be gone (resume after reload, verify-retry after reattach).
     */
    private rebuildHandoff(runId: string, stepIndex: number): Handoff {
        if (stepIndex <= 0) { return {}; }
        const prev = this.tasks
            .filter(t => t.workflowRunId === runId && t.stepIndex === stepIndex - 1 && t.status === 'done')
            .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
        return prev ? this.computeHandoff(prev) : {};
    }

    /** Build what a finished step hands to the next one (A3: structured handoff). */
    private computeHandoff(task: FarmTask): Handoff {
        const handoff: Handoff = { file: task.outputFile };
        if (!task.outputFile) { return handoff; }
        try {
            const body = archivedOutputBody(fs.readFileSync(task.outputFile, 'utf8')).trim();
            handoff.text = body;
            // ‼️ M-14 — THE NEXT STEP IS HANDED THE ANSWER, NOT THE TRANSCRIPT.
            // On Claude the archive body IS the answer; OpenCode's is its own
            // JSONL event stream (OPENCODE_RUN_OUTPUT_NOTE) and Antigravity's is
            // one envelope. `engineReplyText` is the one place that knows which
            // is which — it used to be two branches here, and M-19's speaking
            // turns then read the same archives raw, so the rule now lives where
            // every reader of an archive can reach it.
            const said = engineReplyText(body, task.engine);
            if (said) { handoff.text = said; }
            const envelope = extractJson(handoff.text);
            if (envelope && typeof envelope === 'object') {
                const env = envelope as { result?: unknown };
                if (typeof env.result === 'string') {
                    handoff.text = env.result;
                    handoff.json = extractJson(env.result) ?? envelope;
                } else {
                    handoff.json = envelope;
                }
            }
        } catch { /* archive unreadable */ }
        return handoff;
    }

    /** M-53 — the agent a step runs as: its own, or the one its role is filled with (the workflow's binding, else the showrunner). */
    private stepAgent(w: FarmWorkflow, step: WorkflowStep, runId: string): { agent?: AgentInfo; missing: string } {
        const agents = this.getAgents();
        if (!step.role) { return { agent: agents.find(a => a.id === step.agentId), missing: `agent "${step.agentName}" not found` }; }
        const r = fillRole(step.role, { run: this.runRecords.get(runId)?.roles, workflow: w.roles, showrunner: this.opts.showrunner?.(), agents });
        return { agent: r.agent && agents.find(a => a.id === r.agent!.id), missing: r.error ?? r.why };
    }

    /** M-50 — the kit a step fills {brand.*} from: its production's, its own fields over it. */
    private stepBrand(w: FarmWorkflow, step: WorkflowStep, runId: string): BrandKit | undefined {
        const id = brandProductionFor(w, step, this.runRecords.get(runId));
        const base = id ? this.opts.productionBrand?.(id) : undefined;
        return base || step.brand ? resolveBrand(base, step.brand, id).kit : undefined;
    }

    private substitute(prompt: string, handoff: Handoff): string {
        // M-50 — the brand first, on the step's own words only: an earlier step's output is never re-read as a placeholder
        let out = fillBrand(prompt, handoff.brand).split(PREV_OUTPUT_PLACEHOLDER).join(handoff.file ?? '');
        out = out.split('{prev_text}').join((handoff.text ?? '').slice(0, this.opts.prevTextChars?.() ?? 1500));
        out = out.replace(/\{prev_json\.([\w.]+)\}/g, (_m, fieldPath: string) => {
            let cur: unknown = handoff.json;
            for (const key of fieldPath.split('.')) {
                if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
                    cur = (cur as Record<string, unknown>)[key];
                } else { return ''; }
            }
            return typeof cur === 'string' ? cur : JSON.stringify(cur ?? '');
        });
        // M-39 — any earlier step, by its stable id; M-38 — the inputs last, so a value a run
        // was given is never re-read as a placeholder
        let filled = fillInputs(fillBoard(out, handoff.board), handoff.inputs);
        // M-52 — last, so a title in the block is never re-read as a placeholder; the run's inputs and the previous text are the query
        if (filled.includes('{performance}')) {
            const query = [...Object.values(handoff.inputs ?? {}), (handoff.text ?? '').slice(0, 600)].join(' ');
            filled = filled.split('{performance}').join(this.opts.performance?.(query) ?? '');
        }
        return handoff.branch ? FE.fillItem(filled, handoff.branch.item, handoff.branch.index) : filled;
    }

    private runIfMatches(runIf: string, handoff: Handoff): boolean {
        try {
            // "json:field.path~regex" tests a parsed JSON field; plain string tests the body.
            const jsonCond = /^json:([\w.]+)~(.+)$/.exec(runIf);
            if (jsonCond) {
                const value = this.substitute(`{prev_json.${jsonCond[1]}}`, handoff);
                return new RegExp(jsonCond[2], 'i').test(value);
            }
            return new RegExp(runIf, 'i').test(handoff.text ?? '');
        } catch { return false; }
    }

    /** Advance a run to a step, honoring runIf conditions and the loop guard. */
    /** M-43 — the workflow as THIS run sees it: the stored one with the run's patches and inserted steps. */
    private runView(workflowId: string | undefined, runId: string | undefined, fallback?: FarmWorkflow): FarmWorkflow | undefined {
        const w = this.workflows.find(x => x.id === workflowId) ?? fallback;
        return w && runId ? applyRunEdits(w, this.runRecords.get(runId)?.edits) : w;
    }

    private routeToStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        w = this.runView(w.id, runId, w) as FarmWorkflow;
        handoff.inputs = this.runRecords.get(runId)?.inputs;
        handoff.board = this.runRecords.get(runId)?.board;
        if (index < 0 || index >= w.steps.length) {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.parallelGroups.delete(runId);
            this.endWorkflowRun(runId, 'done', 'reached the end of the chain');
            this.opts.forward?.('workflow-done', `Workflow "${w.title}" completed`);
            void vscode.window.showInformationMessage(
                `Agent Farm: workflow "${w.title}" completed ✓.`);
            return;
        }
        const count = this.runCounts.get(runId) ?? 0;
        if (count >= TaskManager.MAX_RUN_STEPS) {
            this.runCounts.delete(runId);
            this.parallelGroups.delete(runId);
            this.endWorkflowRun(runId, 'stopped',
                `step limit reached (${TaskManager.MAX_RUN_STEPS}) — possible loop in onFail routing`, index);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — step limit reached (possible loop in onFail routing).`);
            return;
        }
        const capped = spendCapStop(this.runSpent(runId), this.runRecords.get(runId)?.spendCap);
        if (capped) {
            this.runCounts.delete(runId);
            this.parallelGroups.delete(runId);
            this.endWorkflowRun(runId, 'stopped', capped, index);
            void vscode.window.showWarningMessage(`Agent Farm: workflow "${w.title}" stopped — ${capped}.`);
            return;
        }
        this.runCounts.set(runId, count + 1);

        const step = w.steps[index];
        // Entering a parallel region (from anywhere) fans out the whole group.
        if (step.parallel) {
            let gs = index;
            while (gs > 0 && w.steps[gs - 1].parallel) { gs--; }
            this.startParallelGroup(w, gs, handoff, runId);
            return;
        }
        if (step.runIf && !this.runIfMatches(step.runIf, handoff)) {
            void vscode.window.showInformationMessage(
                `Agent Farm: workflow "${w.title}" — step ${index + 1} skipped (condition /${step.runIf}/ not met).`);
            this.routeToStep(w, index + 1, handoff, runId);
            return;
        }
        if (step.forEach) {
            this.startForEach(w, index, handoff, runId);
            return;
        }
        this.startWorkflowStep(w, index, handoff, runId);
    }

    private startWorkflowStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        const step = w.steps[index];
        this.handoffs.set(runId, handoff);
        // M-50 — a copy per step: a parallel group shares one handoff, and each member may read another kit
        const brand = this.stepBrand(w, step, runId);
        if (brand || handoff.brand) { handoff = { ...handoff, brand }; }

        if (step.publish) {
            void this.runPublishStep(w, index, handoff, runId);
            return;
        }
        if (step.kapici) {
            void this.runKapiciStep(w, index, handoff, runId);
            return;
        }
        if (step.metrics) {
            void this.runMetricsStep(w, index, handoff, runId);
            return;
        }
        if (step.webhook) {
            this.runWebhookStep(w, index, handoff, runId);
            return;
        }
        if (step.tool) {
            void this.runToolStep(w, index, handoff, runId);
            return;
        }
        if (step.media) {
            void this.runMediaStep(w, index, handoff, runId);
            return;
        }
        if (step.browser) {
            void this.runBrowserStep(w, index, handoff, runId);
            return;
        }
        if (step.approval) {
            void this.runApprovalStep(w, index, handoff, runId);
            return;
        }
        if (step.select) {
            void this.runSelectStep(w, index, handoff, runId);
            return;
        }
        if (step.checkpoint) {
            void this.runCheckpointStep(w, index, handoff, runId);
            return;
        }
        const { agent, missing } = this.stepAgent(w, step, runId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — ${missing}.`);
            // ‼️ X-71 — and it is an ENDING, not a silent return. On the first
            // step there is no row at all to infer it from, so a caller waiting
            // on this run waited for ever.
            this.endWorkflowRun(runId, 'failed',
                `step ${index + 1} could not start — ${missing}`, index);
            return;
        }
        const base = this.runRecords.get(runId)?.airtableBase;
        const prompt = this.substitute(step.prompt, handoff) + (base ? '\n\n' + libraryHint(base) : '');
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}${branchTag(handoff)}`,
            prompt, step.mode,
            {
                workflowId: w.id, workflowRunId: runId, stepIndex: index,
                ...(handoff.branch ? { branchIndex: handoff.branch.index } : {}),
                ...this.runProject(runId),
                // ‼️ THE STEP'S OWN ENGINE, MODEL, EFFORT AND PERMISSIONS (X-35).
                // A workflow step is a task, and it was the one kind of task that
                // could not say what to run it on — so an agent's chain was
                // Claude-by-default no matter what the rest of the automation had
                // been set to. `runExtras` drops what is unset, so a step that
                // states nothing behaves exactly as it did.
                ...runExtras(step)
            });
        if (step.outputContract) { task.outputContract = step.outputContract; }
        this.startTask(task);
    }

    /**
     * What a workflow step inherits from its run.
     *
     * The FIRST step is made by a person pressing something, so the window speaks
     * for it and this returns nothing (the active-project stamp applies). Every
     * step after it is made by the previous step finishing — possibly an hour
     * later, in a window that has moved on — so it takes the project the run
     * started under, whatever that was, including none.
     */
    private runProject(runId: string): { projectId?: string } {
        const rec = this.runRecords.get(runId);
        if (rec) {
            // The key is PRESENT either way: `projectId: undefined` is how a
            // caller tells `addTask` "no project", and dropping the key would
            // hand the row straight back to the active window.
            return { projectId: rec.project ?? undefined };
        }
        const first = this.tasks.find(t => t.workflowRunId === runId);
        return first ? { projectId: first.projectId } : {};
    }

    /**
     * ‼️ X-73 — A STEP THAT IS NOT AN AGENT IS STILL A STEP. Webhook, media,
     * approval, select and a blocked browser call each mint their FarmTask by
     * hand, and every one of those literals forgot the run's project — so a
     * chain with one webhook in it filed half its rows under the project and
     * half under Unassigned. One factory, so the next kind of step cannot
     * forget it either.
     */
    private stepTask(
        w: FarmWorkflow, index: number, runId: string, agentName: string,
        rest: Partial<FarmTask> & Pick<FarmTask, 'prompt' | 'status'>, handoff?: Handoff
    ): FarmTask {
        const step = w.steps[index];
        const task: FarmTask = {
            id: newId(), agentId: '', agentName,
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}${branchTag(handoff)}`,
            mode: 'headless', createdAt: Date.now(), startedAt: Date.now(),
            workflowId: w.id, workflowRunId: runId, stepIndex: index,
            ...(handoff?.branch ? { branchIndex: handoff.branch.index } : {}),
            ...this.runProject(runId),
            ...rest
        };
        if (!task.projectId) { delete task.projectId; }
        this.tasks.push(task);
        return task;
    }

    /** B3: a chain step that is an HTTP call; the response becomes the next handoff. */
    private runWebhookStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        const step = w.steps[index];
        const hook = step.webhook!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));
        const url = resolve(hook.url);
        const method = (hook.method ?? 'POST').toUpperCase();
        // a JSON body is filled inside its string values, so a quote or a Windows path in a value stays valid JSON
        const body = hook.body ? fillJsonTemplate(hook.body, resolve) : undefined;

        const task = this.stepTask(w, index, runId, 'webhook', {
            prompt: `${method} ${hook.url}`,
            status: 'running'
        }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        // Wave C: templated custom headers (auth for queued APIs).
        const headers: Record<string, string> = {};
        if (body) { headers['Content-Type'] = 'application/json'; }
        for (const [k, v] of Object.entries(hook.headers ?? {})) { headers[k] = resolve(v); }

        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);
        fetch(url, {
            method,
            headers,
            body: method === 'GET' ? undefined : body,
            signal: controller.signal
        }).then(async res => {
            clearTimeout(timer);
            const text = (await res.text()).slice(0, 100_000);
            // Poll mode: the initial call only submits; poll until the job is done.
            if (hook.poll && res.ok) {
                let submitJson: unknown;
                try { submitJson = JSON.parse(text); } catch { submitJson = text; }
                const result = await pollWebhookResult(submitJson, headers, hook.poll);
                const finalText = typeof result.response === 'string'
                    ? result.response
                    : JSON.stringify(result.response ?? {}, null, 2);
                fs.writeFileSync(outFile,
                    `# ${task.title}\n\n- Webhook (poll): ${method} ${hook.url}\n- Submit: HTTP ${res.status}\n` +
                    `- Started: ${new Date(started).toLocaleString()}\n\n---\n\n${finalText.slice(0, 100_000)}\n\n---\n` +
                    `Finished: ${new Date().toLocaleString()} · ${result.ok ? 'OK' : 'FAILED — ' + (result.error ?? '')}\n`, 'utf8');
                this.finish(task, result.ok ? 'done' : 'failed');
                return;
            }
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Webhook: ${method} ${hook.url}\n- Status: ${res.status}\n` +
                `- Started: ${new Date(started).toLocaleString()}\n\n---\n\n${text}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · HTTP ${res.status}\n`, 'utf8');
            this.finish(task, res.ok ? 'done' : 'failed');
        }).catch(err => {
            clearTimeout(timer);
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Webhook: ${method} ${hook.url}\n\n---\n\n[request error] ${String(err)}\n`, 'utf8');
            this.finish(task, 'failed');
        });
    }

    /** M-51 — gate, connection, then the calendar note and the record told (src/core/publishStep.ts). */
    private async runPublishStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const pub = step.publish!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));
        const plan = planPublish(pub, this.opts.publishApproval?.());
        const task = this.stepTask(w, index, runId, 'publish', { prompt: `publish → ${pub.platform}`, status: 'running' }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();
        const lines = [...plan.why];
        const done = (ok: boolean, body: unknown) => {
            fs.writeFileSync(outFile, `# ${task.title}\n\n- Publish: ${pub.platform}\n${lines.map(l => `- ${l}\n`).join('')}\n---\n\n${JSON.stringify(body, null, 2)}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${ok ? 'OK' : 'FAILED'}\n`, 'utf8');
            this.finish(task, ok ? 'done' : 'failed');
        };
        const calDir = this.opts.contentCalendarDir?.();
        const ref = pub.entry ? resolve(pub.entry).trim() : '';
        const entry = ref && calDir ? findEntry(readCalendar(calDir), ref) : undefined;
        if (ref && !entry) { lines.push(`No calendar note "${ref}"${calDir ? ` in ${calDir}` : ''}`); done(false, {}); return; }
        if (entry) { lines.push(`Calendar: ${entry.name}`); }
        let metadata: unknown;
        if (pub.body) {
            const filled = fillJsonTemplate(pub.body, resolve);
            try { metadata = JSON.parse(filled); } catch { lines.push('The metadata template is not JSON once filled'); done(false, { metadata: filled }); return; }
        }
        const payload = buildPublishPayload({ platform: pub.platform, stepTitle: step.title, schedule: plan.schedule, entry, metadata,
            prevJson: handoff.json, prevText: handoff.text, runId, workflowTitle: w.title });
        if (plan.approval === 'never') { lines.push('Rehearsal (approval: never) — nothing was sent'); done(true, { rehearsal: true, payload }); return; }
        const confirmPub = this.opts.confirmApproval;
        const pq = { title: step.title, message: `Publish "${String(payload.title)}" to ${pub.platform}?` };
        if (plan.approval === 'ask' && confirmPub
            && !await this.askingHuman(runId, w.title, task, { kind: 'approval', title: pq.title, goal: pq.message }, () => confirmPub(pq))) {
            lines.push('Not approved'); done(false, { payload }); return;
        }
        let res: Response;
        let text = '';
        try {
            res = await fetch(resolve(pub.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000) });
            text = (await res.text()).slice(0, 100_000);
        } catch (e) { lines.push(`Connection error: ${String(e)}`); done(false, { payload }); return; }
        if (!res.ok) { lines.push(`HTTP ${res.status}`); done(false, { payload, response: text }); return; }
        const result = readPublishResult(text);
        const at = new Date().toISOString();
        const patch = calendarPatchOf(result, plan.schedule, at);
        if (entry) {
            try { updateEntry(entry.file, patch); lines.push(`Calendar: ${entry.name} → ${patch.status}`); }
            catch (e) { lines.push(`Calendar not updated — ${(e as Error).message}`); }
        }
        if (entry?.record && this.opts.recordPublished) {
            lines.push(await this.opts.recordPublished({ id: entry.record, platform: pub.platform, status: patch.status, url: result.url, at: patch.publishedAt ?? at })
                .catch(e => `Record not updated — ${String(e)}`));
        }
        done(true, { ...result, status: patch.status, platform: pub.platform, payload });
    }

    /** M-60 — Kapıcı routes the chain here (src/core/kapiciStep.ts): carry on, stop, or ask you. The upstream handoff passes through. */
    private async runKapiciStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const spec = step.kapici!;
        const task = this.stepTask(w, index, runId, 'kapici', { prompt: `Gatekeeper: ${spec.rule}`, status: 'running' }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();
        const hook = this.opts.kapiciStep?.();
        const o = await kapiciStepRoute(spec, this.substitute(spec.input || DEFAULT_STEP_INPUT, handoff), hook);
        let route = o.route;
        let yours = '';
        if (route === 'ask_user') {
            // No gate wired (headless service / tests) = carry on, as an approval step does.
            const confirm = this.opts.confirmApproval;
            const ok = confirm ? await this.askingHuman(runId, w.title, task, { kind: 'approval', title: step.title, goal: o.why }, () => confirm({ title: step.title, message: o.why })) : true;
            route = ok ? 'proceed' : 'stop';
            yours = ok ? ' — you let it carry on' : ' — you stopped it';
        }
        const why = o.why + yours;
        task.supervisorCall = supervisorCall({
            trigger: `Gatekeeper ${spec.rule}`, decision: { decision: o.route, why, ...(o.by === 'kapici' && o.verdict ? { confidence: o.verdict.confidence } : {}) },
            ...(o.by === 'today' ? { mechanical: o.why } : {}), model: KAPICI_MODEL,
            limitsOrigin: `Gatekeeper rule ${spec.rule}`, supervisorOrigin: `Gatekeeper for workflows: ${hook?.mode ?? 'off'}`, at: Date.now()
        });
        const text = `${route}: ${why}`;
        const rec = this.runRecords.get(runId);
        if (rec) { rec.board = boardWrite(rec.board, { id: stepKey(step, index), index, title: task.title, status: 'done', text, json: { route, rule: spec.rule, by: o.by }, at: Date.now() }); }
        try {
            fs.writeFileSync(outFile, `# ${task.title}\n\n- Gatekeeper step · rule ${spec.rule} · ${hook?.mode ?? 'off'}\n\n---\n\n**${text}**\n\n---\n`
                + `Finished: ${new Date().toLocaleString()} · ${route === 'stop' ? 'STOPPED' : 'OK'}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.status = 'done';
        task.endedAt = Date.now();
        this.save();
        this.pump();
        if (route !== 'stop') { this.routeToStep(w, index + 1, handoff, runId); return; }
        this.runCounts.delete(runId);
        this.handoffs.delete(runId);
        const last = index >= (this.runView(w.id, runId, w) as FarmWorkflow).steps.length - 1;
        this.endWorkflowRun(runId, last ? 'done' : 'stopped', `Gatekeeper ${last ? 'ended the run at its last step' : `stopped the run at step ${index + 1}`}: ${why}`, index);
        void vscode.window.showWarningMessage(`Agent Farm: workflow "${w.title}" — Gatekeeper stopped it at step ${index + 1}.`);
    }

    /** M-52 — the calendar's published notes measured through the connection (src/core/contentMetrics.ts). */
    private async runMetricsStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const spec = w.steps[index].metrics!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));
        const plan = planMetrics(spec, this.opts.metricsFields?.());
        const task = this.stepTask(w, index, runId, 'metrics', { prompt: `metrics ← ${spec.platform || 'every platform'}`, status: 'running' }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();
        const calDir = this.opts.contentCalendarDir?.();
        const r = await pullMetrics({
            spec, url: resolve(spec.url), fields: plan.fields, days: plan.days, entries: calDir ? readCalendar(calDir) : [], now: Date.now(), runId, workflowTitle: w.title,
            post: async (url, body) => {
                const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
                return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 200_000) };
            },
            record: this.opts.recordMetrics, snapshotFile: this.opts.performanceFile?.()
        }).catch(e => ({ ok: false, lines: [String(e)], body: {} }));
        try {
            fs.writeFileSync(outFile, `# ${task.title}\n\n- Metrics: ${spec.platform || 'every platform'}\n${[...plan.why, ...r.lines].map(l => `- ${l}\n`).join('')}\n---\n\n${JSON.stringify(r.body, null, 2)}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${r.ok ? 'OK' : 'FAILED'}\n`, 'utf8');
        } catch { /* archive gone */ }
        this.finish(task, r.ok ? 'done' : 'failed');
    }

    /** M-49 — a local ffmpeg recipe, no model: the result (outputs, runs, duration) is the step's JSON on the board. */
    private async runToolStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const spec = step.tool!;
        const task = this.stepTask(w, index, runId, 'tool', { prompt: `tool: ${spec.recipe ?? spec.preset ?? '?'}`, status: 'running' }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();
        const how = toolResolved(spec, this.opts.toolSettings?.() ?? {});
        const c = toolCall(fillTool(spec, s => this.substitute(s, handoff)), how.defaults);
        const r: ToolResult = 'error' in c
            ? { ok: false, recipe: String(spec.recipe ?? spec.preset ?? ''), outputs: [], runs: 0, ms: 0, error: c.error }
            : await (this.opts.runTool ?? runRecipe)(c);
        const lc = this.libCtx(task);
        const libLines: string[] = [];
        if (lc && r.outputs.length) {
            const filed = await this.lib!.produced(lc, r.outputs, {
                role: r.ok ? 'intermediate' : 'failed', origin: /concat|merge|join|mux|overlay/i.test(r.recipe) ? 'manual_creation' : 'manual_extraction',
                productionType: 'tool:' + r.recipe, sources: 'error' in c ? [] : [c.input ?? ''],
                ...(r.ok ? {} : { failure: { reason: `the tool step failed — ${r.error ?? 'unknown'}`, salvageable: true } })
            });
            r.outputs = filed.files;
            libLines.push(...filed.lines);
            // the default scratch folder beside the user's input, emptied by the filing: not left behind in their folder
            if (!('error' in c) && path.basename(c.outDir) === 'af-tool') { try { fs.rmdirSync(c.outDir); } catch { /* not empty, or gone */ } }
        }
        try {
            fs.writeFileSync(outFile, `# ${task.title}\n\n- Tool: ${r.recipe}${r.error ? ` — ${r.error}` : ''}\n${[...how.why, ...libLines].map(l => `- ${l}`).join('\n')}\n\n---\n\n${JSON.stringify(r, null, 2)}\n\n---\n`
                + `Finished: ${new Date().toLocaleString()} · ${r.ok ? 'OK' : 'FAILED'}\n`, 'utf8');
        } catch { /* archive gone */ }
        if (!r.ok) { void vscode.window.showWarningMessage(`Agent Farm: tool step "${step.title}" failed — ${r.error}`); }
        this.finish(task, r.ok ? 'done' : 'failed');
    }

    /** C1: a chain step that generates media via the fal.ai queue API. */
    private async runMediaStep(
        w: FarmWorkflow, index: number, handoff: Handoff, runId: string,
        retry?: { attempt: number; feedback: string }
    ): Promise<void> {
        const step = w.steps[index];
        const media = step.media!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));

        const task = this.stepTask(w, index, runId, 'media', {
            prompt: `${media.model}`,
            status: 'running',
            attempt: retry?.attempt,
            ...(retry
                ? { title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title} (retry ${retry.attempt})` }
                : {})
        }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        const provider = providerFor(media.model);
        const auth = (this.opts.mediaAuth?.(provider.id) ?? '').trim();
        const filled = fillJsonTemplate(media.input, resolve);
        let input = retry ? injectMediaFeedback(filled, retry.feedback) : filled;
        const info: { model: string; stepTitle: string; workflowTitle: string; input: string; projectId?: string; sceneId?: string; note?: string; uploads?: FarmTask['uploads'] } = {
            model: media.model, stepTitle: step.title, workflowTitle: w.title,
            input, projectId: media.projectId, sceneId: media.sceneId
        };
        const sent = await this.uploadLocalInput(input, provider.id, runId, w.title, task);
        if ('error' in sent) {
            await this.completeMediaTask(task, info, { ok: false, error: `Media input: ${sent.error}.`, assetUrls: [] });
            return;
        }
        if (sent.uploads.length) {
            input = info.input = sent.input;
            info.uploads = task.uploads = sent.uploads.map(u => ({ path: u.path, url: u.url, provider: u.provider, cached: u.cached }));
            info.note = sent.uploads.map(u => `uploaded ${u.path} → ${u.url}${u.cached ? ' (already there)' : ''}`).join('; ');
        }

        if (!auth || auth.includes('{secret:')) {
            await this.completeMediaTask(task, info, {
                ok: false,
                error: `Media auth missing — store your ${provider.label} key with "Agent Farm: Set Secret…" as ${provider.secretHint}.`,
                assetUrls: []
            });
            return;
        }

        const timeoutMs = (media.timeoutMin ?? 10) * 60_000;
        const one = async (k: number): Promise<MediaResult> => {
            try {
                return await provider.run(media.model, input, auth, {
                    baseUrl: this.opts.mediaBaseUrl?.(provider.id),
                    timeoutMs,
                    pollMs: this.opts.mediaPollMs?.(),
                    // F2: persist the poll URLs the moment the job is queued, so a
                    // window close mid-render reattaches instead of losing the job.
                    onQueued: job => {
                        if (k) { return; }
                        task.mediaJob = {
                            provider: provider.id, statusUrl: job.statusUrl, responseUrl: job.responseUrl,
                            deadline: Date.now() + timeoutMs + 60_000,
                            input: input.slice(0, 2000)
                        };
                        this.save();
                    }
                });
            } catch (e) {
                // F3: a provider crash must fail the step honestly — never leave the
                // task stuck 'running' with the chain silently dead.
                return { ok: false, error: `provider error: ${String(e).slice(0, 300)}`, assetUrls: [] };
            }
        };
        // A-27 — parallel-cheap: N candidates at once, one of them picked by the check (src/core/mediaCandidates.ts)
        const n = candidatesOf(media.candidates);
        const result = n > 1 ? mergeCandidates(await Promise.all(Array.from({ length: n }, (_, k) => one(k)))) : await one(0);
        await this.completeMediaTask(task, info, result);
    }

    /**
     * F2: shared media completion tail (normal runs AND reattached runs) —
     * downloads assets, writes the archive + gallery meta, finishes the task.
     * finish() then drives the workflow chain as usual.
     */
    private async completeMediaTask(
        task: FarmTask,
        info: {
            model: string; stepTitle: string; workflowTitle?: string; input: string;
            projectId?: string; sceneId?: string; note?: string; uploads?: FarmTask['uploads'];
        },
        result: MediaResult,
        /** B2: reattached parallel branches must not drive the chain (fan-in state is gone). */
        suppressAdvance = false
    ): Promise<void> {
        task.mediaJob = undefined;
        const outFile = task.outputFile as string;
        const writeOut = (ok: boolean, detail: string, response?: unknown, assets: string[] = [], estCost = 0) => {
            // B8: an unwritable archive must never leave the task stuck 'running'.
            try {
                fs.writeFileSync(outFile,
                    `# ${task.title}\n\n- Media model: ${info.model}\n- Started: ${new Date(task.startedAt!).toLocaleString()}\n` +
                    (info.note ? `- Note: ${info.note}\n` : '') +
                    (assets.length ? `- Assets: ${assets.map(a => path.basename(a)).join(', ')}\n` : '') +
                    (estCost ? `- Est. cost: $${estCost.toFixed(3)}\n` : '') +
                    `\n---\n\n${response ? JSON.stringify(response, null, 2).slice(0, 20_000) : detail}\n\n---\n` +
                    `Finished: ${new Date().toLocaleString()} · ${ok ? 'OK' : 'FAILED'}\n`, 'utf8');
            } catch { /* archive unwritable — the task still finishes */ }
            if (suppressAdvance) {
                task.status = ok ? 'done' : 'failed';
                task.endedAt = Date.now();
                this.save();
                this.pump();
            } else {
                this.finish(task, ok ? 'done' : 'failed');
            }
        };
        if (!result.ok) {
            writeOut(false, `[media error] ${result.error ?? 'unknown'}`);
            return;
        }

        const assets: string[] = [];
        const assetUrls: string[] = [];
        for (const [i, url] of result.assetUrls.slice(0, 4).entries()) {
            const file = path.join(this.outputsDir, `${task.id}-${i + 1}.${extFromUrl(url)}`);
            try { if (await downloadAsset(url, file)) { assets.push(file); assetUrls.push(url); } }
            catch { /* one bad asset must not sink the step */ }
        }
        const response = alignCandidates(result.response, assetUrls);
        const estCost = await billMedia(info.model, response,
            this.opts.mediaPricing?.() ?? DEFAULT_MEDIA_PRICING, assets, f => mediaDuration(f));
        task.mediaCost = estCost;
        const lc = this.libCtx(task);
        if (lc && assets.length) {
            const filed = await this.lib!.produced(lc, assets, {
                role: 'candidate', origin: 'AI_generated', productionType: 'fal', model: info.model, prompt: info.input, costUsd: estCost,
                sources: (info.uploads ?? []).map(u => u.path)
            });
            assets.splice(0, assets.length, ...filed.files);
            info.note = [info.note, ...filed.lines].filter(Boolean).join('\n- ');
        }

        const meta: MediaMeta = {
            taskId: task.id,
            title: info.stepTitle,
            model: info.model,
            input: info.input.slice(0, 2000),
            assetFiles: assets,
            assetUrls,
            estCost,
            ts: Date.now(),
            workflowTitle: info.workflowTitle,
            projectId: info.projectId,
            sceneId: info.sceneId,
            source: 'fal',
            ...(info.uploads?.length ? { uploads: info.uploads } : {})
        };
        try {
            fs.writeFileSync(path.join(this.outputsDir, `${task.id}.media.json`),
                JSON.stringify(meta, null, 2), 'utf8');
        } catch { /* gallery meta is best-effort */ }
        writeOut(true, '', withOutputs(response, assets), assets, estCost);
    }

    /** F2: tasks whose media job survived the reload (collected at load, polled from the ctor). */
    private reattachQueue: FarmTask[] = [];

    /** F2: resume polling a media job whose window died mid-render. */
    private async reattachMediaTask(task: FarmTask): Promise<void> {
        const job = task.mediaJob!;
        const w = this.runView(task.workflowId, task.workflowRunId);
        const step = task.stepIndex !== undefined ? w?.steps[task.stepIndex] : undefined;
        const info = {
            model: step?.media?.model ?? task.prompt,
            stepTitle: step?.title ?? task.title,
            workflowTitle: w?.title,
            input: job.input ?? '(reattached after reload)',
            projectId: step?.media?.projectId,
            sceneId: step?.media?.sceneId,
            note: 'reattached after a window reload — polling resumed from the persisted job URLs'
        };
        try { fs.appendFileSync(task.outputFile as string, `\nReattached after reload — polling ${job.provider} job.\n`); }
        catch { /* archive gone */ }
        const auth = (this.opts.mediaAuth?.(job.provider) ?? '').trim();
        if (!auth || auth.includes('{secret:')) {
            await this.completeMediaTask(task, info, {
                ok: false, error: 'media auth unavailable after reload — could not reattach', assetUrls: []
            });
            return;
        }
        const remaining = Math.max(60_000, job.deadline - Date.now());
        const pollMs = this.opts.mediaPollMs?.();
        let result: MediaResult;
        try {
            result = job.provider === 'replicate'
                ? await pollReplicateResult(job.statusUrl, auth, { timeoutMs: remaining, pollMs })
                : await pollFalResult(job.statusUrl, job.responseUrl, auth, { timeoutMs: remaining, pollMs });
        } catch (e) {
            result = { ok: false, error: `reattach poll error: ${String(e).slice(0, 300)}`, assetUrls: [] };
        }
        // B2: a parallel branch completes WITHOUT advancing — the group's fan-in
        // state died with the window, so advancing here would either re-fan the
        // group (duplicate renders) or skip the merge. The run is offered for
        // resume instead, once its last reattaching branch is done.
        const isParallelBranch = step?.parallel === true;
        await this.completeMediaTask(task, info, result, isParallelBranch);
        if (!isParallelBranch) { return; }
        const runId = task.workflowRunId ?? '';
        const stillReattaching = this.tasks.some(t =>
            t.workflowRunId === runId && t.status === 'running' && t.mediaJob);
        if (stillReattaching) { return; }
        this.parallelReattachRuns.delete(runId);
        const known = this.interrupted.find(r => r.runId === runId);
        if (!known) {
            this.interrupted.push({
                runId, workflowId: task.workflowId ?? '',
                stepIndex: task.stepIndex ?? 0, taskId: task.id
            });
        } else if ((task.stepIndex ?? 0) < known.stepIndex) {
            known.stepIndex = task.stepIndex ?? 0;
            known.taskId = task.id;
        }
        void vscode.window.showWarningMessage(
            `Agent Farm: parallel branch "${task.title}" finished after the reload, but the group's fan-in state was lost — the run is paused. Resume re-runs the whole group.`,
            'Resume'
        ).then(choice => { if (choice === 'Resume') { this.resumeInterrupted(runId); } });
    }

    /** F3: browser step — allowlist gate + optional approval, then a normal agent task. */
    private async runBrowserStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const browser = step.browser!;
        const goal = this.substitute(browser.goal, handoff);
        const key = `browser-${runId}-${index + 1}`;
        const plan = planBrowser({ ...browser, url: browser.url ? this.substitute(browser.url, handoff) : '' }, {
            settingsHosts: this.opts.browserAllowHosts?.(), settingsApproval: this.opts.browserApproval?.(),
            profilesRoot: this.opts.browserProfilesDir?.() ?? path.join(path.dirname(this.outputsDir), 'browser-profiles'),
            runDir: path.join(this.outputsDir, key)
        });
        const url = plan.url;
        const allowHosts = plan.hosts;

        const fail = (why: string) => {
            void vscode.window.showWarningMessage(
                `Agent Farm: browser step "${step.title}" blocked — ${why}`);
            // Synthetic failed task so onFail routing still applies.
            const task = this.stepTask(w, index, runId, step.agentName, {
                agentId: step.agentId,
                prompt: `browser: ${url}`, status: 'failed', endedAt: Date.now()
            }, handoff);
            this.save();
            this.advanceWorkflow(task, 'failed');
        };

        const recipeNo = browserRecipeRefusal(browser.recipe);
        if (recipeNo) { fail(recipeNo); return; }
        if (plan.recipe && engineOf(step.engine).id !== 'claude') {
            fail(`a recipe step runs on claude only (its own Playwright MCP), not on ${engineOf(step.engine).label}`);
            return;
        }
        if (plan.recipe && profileInUse(plan.profileDir!)) {
            fail(`the "${plan.recipe.id}" browser profile is open in another Chrome window (a sign-in window?) — close it and run again`);
            return;
        }
        if (!hostAllowed(url, allowHosts)) {
            fail(allowHosts.length
                ? `"${url}" is outside the allowlist (${allowHosts.join(', ')})`
                : 'no host allowlist configured (set agentFarm.browserAllowHosts or the step\'s allowHosts)');
            return;
        }
        const confirmBrowser = this.opts.confirmBrowser;
        if (plan.confirm === 'ask' && confirmBrowser) {
            // no row exists yet — the step's task is made once it may run — so the wait is the run's
            const ok = await this.askingHuman(runId, w.title, undefined, { kind: 'browser', title: step.title, url, goal },
                () => confirmBrowser({ title: step.title, url, goal }));
            if (!ok) { fail('not approved'); return; }
        }
        const { agent, missing } = this.stepAgent(w, step, runId);
        if (!agent) {
            fail(missing);
            return;
        }
        let browserRun: BrowserRun | undefined;
        if (plan.recipe) {
            const mcpConfig = path.join(this.outputsDir, `${key}.mcp.json`);
            const guard = plan.hosts.length ? path.join(this.outputsDir, `${key}.guard.js`) : undefined;
            try {
                fs.mkdirSync(plan.downloadDir!, { recursive: true });
                if (guard) { fs.writeFileSync(guard, hostGuardScript(plan.hosts), 'utf8'); }
                fs.writeFileSync(mcpConfig, JSON.stringify(playwrightMcpConfig(plan, process.platform, guard), null, 2), 'utf8');
            } catch (e) { fail(`its browser could not be set up — ${(e as Error).message}`); return; }
            browserRun = { downloadDir: plan.downloadDir!, since: Date.now(), recipe: plan.recipe.id, mcpConfig };
        }
        const prompt = plan.recipe ? buildRecipePrompt(plan, goal) : buildBrowserPrompt(url, goal, allowHosts);
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt, 'headless',
            {
                workflowId: w.id, workflowRunId: runId, stepIndex: index,
                ...this.runProject(runId),
                // A browser step is still a step, and it runs on the engine the
                // step names (X-35) — see the note on the ordinary step path.
                ...runExtras(step)
            });
        if (browserRun) { task.browserRun = browserRun; }
        this.startTask(task);
    }

    /**
     * Human-in-the-loop gate: a visible task row parks the run until the user
     * approves. On approve the UPSTREAM handoff passes through (not the approval
     * note); on reject the step's onFail policy applies.
     */
    private async runApprovalStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const message = this.substitute(step.approval!.message ?? '', handoff);
        const task = this.stepTask(w, index, runId, 'approval', {
            prompt: message || '(waiting for approval)', status: 'running'
        }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        // No gate wired (headless service / tests) = auto-approve so chains don't hang.
        const confirmStep = this.opts.confirmApproval;
        const ok = confirmStep
            ? await this.askingHuman(runId, w.title, task, { kind: 'approval', title: step.title, goal: message }, () => confirmStep({ title: step.title, message }))
            : true;
        try {
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Approval step\n` + (message ? `- Message: ${message}\n` : '') +
                `\n---\n\n${ok ? 'APPROVED' : 'REJECTED'} at ${new Date().toLocaleString()}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${ok ? 'OK' : 'REJECTED'}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.status = ok ? 'done' : 'failed';
        task.endedAt = Date.now();
        this.save();
        this.pump();
        // Inside a parallel group the collector handles fan-in; otherwise pass through on approve.
        const group = this.parallelGroups.get(runId);
        if (group && index >= group.start && index <= group.end) {
            this.advanceWorkflow(task, ok ? 'done' : 'failed');
        } else if (ok) {
            this.routeToStep(w, index + 1, handoff, runId);
        } else {
            this.advanceWorkflow(task, 'failed');
        }
    }

    /**
     * Wave B — visual selection gate: the user keeps a subset of the assets
     * produced so far in this run. Chosen asset URLs become the handoff so the
     * next step (e.g. an image→video model) works only with the picks. No gate
     * wired (tests/headless) = keep everything so chains don't hang.
     */
    private async runSelectStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const sel = step.select!;
        const message = this.substitute(sel.message ?? '', handoff);

        // Candidates: assets produced by this run's media tasks up to this step.
        const runTaskIds = new Set(this.tasks
            .filter(t => t.workflowRunId === runId && (t.stepIndex ?? -1) < index)
            .map(t => t.id));
        const metas = readMediaMetas(this.outputsDir).filter(m => runTaskIds.has(m.taskId));
        const candidates = mediaCandidates(metas);

        const task = this.stepTask(w, index, runId, 'select', {
            prompt: message || `(choose ${candidates.length} candidate asset(s))`,
            status: 'running'
        }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        const min = Math.max(0, sel.min ?? 1);
        const max = sel.max;
        let chosen: string[] | null;
        if (!candidates.length) {
            chosen = []; // nothing to pick — pass an empty selection through
        } else if (this.opts.confirmSelection) {
            const pick = this.opts.confirmSelection;
            chosen = await this.askingHuman(runId, w.title, task, { kind: 'selection', title: step.title, goal: message || `${candidates.length} candidate(s)` }, () => pick({
                title: step.title, message, min, max,
                candidates: candidates.map(c => ({ taskId: c.taskId, title: c.title, url: c.url, file: c.file, kind: c.kind }))
            }));
        } else {
            chosen = candidates.map(c => c.url); // no UI wired → keep all
        }

        const cancelled = chosen === null;
        const selected = chosen ?? [];
        if (!cancelled) { recordSelection(this.outputsDir, metas, selected); }
        const selLedger = cancelled ? undefined : this.runRecords.get(runId)?.library;
        if (selLedger && this.lib) { await this.lib.rejected(selLedger, candidates.filter(c => !selected.includes(c.url)).map(c => c.file).filter((f): f is string => !!f)); }

        // The selection becomes the handoff: {prev_json.selected.N} = a URL,
        // {prev_text} = newline-joined URLs (one asset per line).
        const selHandoff: Handoff = {
            file: outFile,
            text: selected.join('\n'),
            json: { selected, count: selected.length }
        };
        try {
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Selection step\n` + (message ? `- Message: ${message}\n` : '') +
                `- Candidates: ${candidates.length} · Kept: ${selected.length}${cancelled ? ' (CANCELLED)' : ''}\n` +
                `\n---\n\n${JSON.stringify({ selected, count: selected.length }, null, 2)}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${cancelled ? 'CANCELLED' : 'OK'}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.status = cancelled ? 'failed' : 'done';
        task.endedAt = Date.now();
        this.save();
        this.pump();

        const group = this.parallelGroups.get(runId);
        if (group && index >= group.start && index <= group.end) {
            this.advanceWorkflow(task, cancelled ? 'failed' : 'done');
        } else if (!cancelled) {
            this.routeToStep(w, index + 1, selHandoff, runId);
        } else {
            this.advanceWorkflow(task, 'failed');
        }
    }

    /**
     * M-43 — a checkpoint: the supervisor is woken here and its decision routes
     * the run (src/core/checkpointStep.ts). Refused, broken or unanswered =
     * carry on, and the row says why. The upstream handoff passes through.
     */
    private async runCheckpointStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string, wake?: WakeCall): Promise<void> {
        const cp: CheckpointSpec = wake ? {} : w.steps[index].checkpoint!;
        const rec = this.runRecords.get(runId);
        const sup: SupervisorState = rec ? (rec.supervisor ??= { history: [], retries: {}, directives: [] }) : { history: [], retries: {}, directives: [] };
        const task = this.stepTask(w, index, runId, 'checkpoint', wake ? {
            prompt: `Woken after step ${index + 1} by ${wake.said}`, status: 'running', wokeBy: wake.fired, wokeAfter: wake.after,
            title: `${w.title} ${index + 1}/${w.steps.length}: supervisor, woken by ${wake.fired.join(', ')}`
        } : { prompt: cp.message || '(the supervisor decides here)', status: 'running' }, handoff);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        const ids = w.steps.map((s, i) => stepKey(s, i));
        const here = ids[index], before = wake ? here : index > 0 ? ids[index - 1] : here;
        const limits = checkpointLimits(cp);
        // M-44 — one session per run (src/core/supervisorRun.ts); a reload that cut this visit's call off is not asked again
        const sl = supervisorRunLimits(w.supervisor, rec?.live?.supervisor);
        const words = pendingWords(rec?.live);
        const human = rec?.live?.decision;
        const visit = enterVisit(sup, wake ? `${here}~wake` : here);
        Object.assign(sup, visit.state);
        const spent0 = sup.costUSD ?? 0;
        this.save();
        const judge = judgeWant(undefined, this.opts.judgeArgs?.());
        const model0 = sl.model || judge.model || (/--model(?:=|\s+)(\S+)/.exec(judge.args)?.[1] ?? '');
        const call: SessionCall = judge.engine === 'claude' ? (this.opts.supervisorSession ?? spawnSessionCall(this.outputsDir))
            : async (prompt, o) => {
                const want = judgeWant({ engine: judge.engine, ...(o.model ? { model: o.model } : {}) }, this.opts.judgeArgs?.());
                const r = await execOneShot({ cwd: this.outputsDir, engine: want.engine, model: want.model, args: want.args, prompt: sanitizePrompt(prompt), timeoutMs: o.timeoutMs });
                return { ok: !!r.out.trim(), raw: r.out, ...(r.error ? { error: r.error } : {}) };
            };
        let answeredBy: string | undefined;
        type Ask = (prompt: string, tier: 0 | 1) => Promise<{ out: string; error?: string; model?: string }>;
        const ask: Ask = async (prompt, tier) => { const r = await ask0(prompt, tier); answeredBy = r.model ?? answeredBy; return r; };
        const ask0: Ask = human ? async () => ({ out: JSON.stringify(human), model: 'you' }) : this.opts.superviseTurn ?? (async (prompt: string, tier: 0 | 1) => {
            const model = tier ? escalateModel(model0) : model0;
            if (tier && !model) { return { out: '', error: 'there is no stronger model to escalate to' }; }
            const t = await sessionTurn(sup, sl, prompt, model ?? '', call, Date.now);
            Object.assign(sup, t.state);
            this.save();
            return { out: t.out, error: t.error, model: model || 'the CLI default' };
        });
        const own = [...wordsForBrief(words), ...(wake ? [wakeDirective(w.steps[index].title, index + 1, wake.after, wake.said, wake.plan)] : cp.message ? [cp.message] : [])];
        const shut = visit.cutOff ? CUT_OFF : human || this.opts.superviseTurn ? '' : turnRefusal(sup, sl);
        let out = shut ? { mechanical: shut, log: [`mechanical — ${shut}`], directives: [...own, ...sup.directives], decision: undefined } : await superviseCheckpoint({
            workflow: w.title, goal: w.goal, criteria: w.criteria, inputs: rec?.inputs, board: rec?.board, lastStep: wake || index > 0 ? before : undefined,
            costUSD: this.tasks.filter(t => t.workflowRunId === runId).reduce((a, t) => a + (stepSpend(t) ?? 0), 0),
            directives: [...own, ...sup.directives], stepIds: ids, limits,
            performance: this.opts.performance?.([w.title, w.goal ?? '', ...Object.values(rec?.inputs ?? {})].join(' '))
        }, { stepIds: ids, currentStep: before, retries: sup.retries, history: sup.history }, {
            ask, pick: this.opts.askChoice ? (q, o) => this.opts.askChoice!(q, o, { runId, workflowTitle: w.title }) : undefined,
            confirm: this.opts.confirmApproval
                ? (title, message) => this.askingHuman(runId, w.title, task, { kind: 'approval', title, goal: message }, () => this.opts.confirmApproval!({ title, message }))
                : undefined
        });
        sup.directives = out.directives.slice(own.length);
        // M-46 — the words landed here; a decision of yours is spent; "ask me too" puts this one to you first
        if (rec?.live) {
            if (words.length) { rec.live = landWords(rec.live, wake ? `after step ${index + 1} (woken)` : `step ${index + 1} (checkpoint)`); }
            if (human) { delete rec.live.decision; }
            if (rec.live.callMe && out.decision && !human) {
                rec.live.callMe = false;
                const d0 = out.decision;
                const cq = { title: `Workflow "${w.title}" — its supervisor decided: ${d0.decision}${d0.target ? ' ' + d0.target : ''}`, message: d0.why ?? '' };
                const yes = this.opts.confirmApproval
                    ? await this.askingHuman(runId, w.title, task, { kind: 'approval', title: cq.title, goal: cq.message }, () => this.opts.confirmApproval!(cq))
                    : true;
                if (!yes) { out = { ...out, decision: undefined, mechanical: 'you turned the supervisor\'s decision down' }; }
            }
            this.save();
        }
        sup.inFlight = undefined;
        const spent = (sup.costUSD ?? 0) - spent0;
        if (spent > 0) { task.costUSD = spent; }
        const soft = softNote(sup, sl);
        const d = out.decision;
        let route = checkpointRoute(d, ids, index, before);
        let mechanical = out.mechanical;
        if (route.go === 'insert') {
            const made = rec ? stepsFromInsert(route.steps, anchorAgent(w.steps, index), here, ids) : { error: 'the run has no record to insert into' };
            if ('error' in made) { mechanical = made.error; route = { go: 'next' }; } else {
                rec!.edits = { ...rec!.edits, inserts: [...(rec!.edits?.inserts ?? []), { after: here, steps: made }] };
            }
        } else if (route.go === 'step' && rec) {
            const target = ids[route.index];
            if (d?.decision === 'retry') { sup.retries[target] = (sup.retries[target] ?? 0) + 1; }
            if (route.patch) { rec.edits = { ...rec.edits, patches: { ...rec.edits?.patches, [target]: { ...rec.edits?.patches?.[target], ...route.patch } } }; }
        }
        if (d) { sup.history.push(`${d.decision}:${d.target ?? ''}`); }
        const said = d ? `${d.decision}${d.target ? ` ${d.target}` : ''}${d.why ? ` — ${d.why}` : ''}` : 'carry on';
        const text = `${wake ? `Woken by ${wake.said}` : 'Checkpoint'}: ${said}${mechanical ? ` (mechanical: ${mechanical})` : ''}${soft ? ` · ${soft}` : ''}`;
        task.supervisorCall = supervisorCall({
            trigger: wake ? `woken by ${wake.said}` : 'checkpoint', decision: d, mechanical, model: answeredBy,
            limitsOrigin: limits.origin, supervisorOrigin: sl.origin, sessionId: sup.sessionId, at: Date.now()
        });
        try {
            fs.writeFileSync(outFile, `# ${task.title}\n\n- ${wake ? `Woken after step ${index + 1} (${wake.after}) — wake conditions: ${wake.from}` : 'Checkpoint step'}\n${words.length ? `- Your word(s) landed here: ${words.map(x => `${x.kind}: ${x.text}`).join(' | ')}\n` : ''}${human ? '- Your own decision, applied instead of asking the supervisor\n' : ''}- Limits: ${limits.origin}\n- Supervisor: ${sl.origin}` +
                `${sup.calls ? ` · ${sup.calls} call(s) this run, $${(sup.costUSD ?? 0).toFixed(4)}` : ''}\n\n---\n\n` +
                `${out.log.map(l => `- ${l}`).join('\n')}\n\n**${text}**\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${route.go === 'stop' ? 'STOPPED' : 'OK'}\n`, 'utf8');
        } catch { /* archive gone */ }
        if (rec && !wake) { rec.board = boardWrite(rec.board, { id: here, index, title: task.title, status: 'done', text, ...(d ? { json: d } : {}), at: Date.now() }); }
        task.status = 'done';
        task.endedAt = Date.now();
        this.save();
        this.pump();
        if (route.go === 'stop' && !wake && index >= (this.runView(w.id, runId, w) as FarmWorkflow).steps.length - 1) {
            // nothing after it is abandoned: a stop on the last checkpoint is the run reaching its end, so its output is filed as final
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.endWorkflowRun(runId, 'done', `the supervisor ended the run at its last step: ${route.why}`, index);
            this.opts.forward?.('workflow-done', `Workflow "${w.title}" completed`);
            void vscode.window.showInformationMessage(`Agent Farm: workflow "${w.title}" completed ✓.`);
        } else if (route.go === 'stop') {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.endWorkflowRun(runId, 'stopped', `the supervisor stopped the run at step ${index + 1}: ${route.why}`, index);
            void vscode.window.showWarningMessage(`Agent Farm: workflow "${w.title}" — the supervisor stopped it at step ${index + 1}.`);
        } else if (route.go === 'step') {
            const view = this.runView(w.id, runId, w) as FarmWorkflow;
            this.routeToStep(view, route.index, route.index <= index ? handoffFromBoard(rec?.board, view.steps, route.index) : handoff, runId);
        } else if (wake && route.go === 'next') {
            wake.mechanical();
        } else {
            this.routeToStep(w, index + 1, handoff, runId);
        }
    }

    // ---------- M-46: a person's hand on a running workflow (src/core/workflowLive.ts) ----------

    /** Runs that can still take a word or a live setting: a step open, or held at a boundary. */
    liveRuns(): { runId: string; title: string; where: string; paused: boolean; live: string[] }[] {
        const out: { runId: string; title: string; where: string; paused: boolean; live: string[] }[] = [];
        for (const [runId, rec] of this.runRecords) {
            if (rec.ended) { continue; }
            const open = this.tasks.filter(t => t.workflowRunId === runId && (t.status === 'running' || t.status === 'queued'));
            if (!open.length && !rec.pausedTask) { continue; }
            const at = open.length ? Math.max(...open.map(t => t.stepIndex ?? 0)) + 1 : undefined;
            out.push({ runId, title: rec.title, where: rec.pausedTask ? 'paused' : `step ${at}`, paused: !!rec.pausedTask, live: liveLines(rec.live) });
        }
        return out;
    }

    private liveRecord(runId: string): WorkflowRunRecord | { error: string } {
        const rec = this.runRecords.get(runId);
        return rec && this.liveRuns().some(r => r.runId === runId) ? rec
            : { error: `run "${runId}" is not running — workflows.status says where it got to` };
    }

    private boundaryOf(runId: string): string {
        const r = this.liveRuns().find(x => x.runId === runId);
        return r?.paused ? 'the resume' : `the end of ${r?.where ?? 'the running step'}`;
    }

    /** A word for the run's supervisor; it wakes it at the next step boundary and opens that brief. */
    steerRun(runId: string, kind: unknown, text: unknown, by: WordSource): { error?: string; note?: string } {
        const rec = this.liveRecord(runId);
        if ('error' in rec) { return rec; }
        const word = wordFromArg(kind, text, by, Date.now());
        if ('error' in word) { return word; }
        rec.live = { ...rec.live, words: [...(rec.live?.words ?? []), word] };
        this.save();
        return { note: `your ${word.kind} waits for its supervisor — it is read at ${this.boundaryOf(runId)}` };
    }

    /** The person's own decision for the next boundary, applied instead of asking the supervisor. */
    decideRun(runId: string, raw: unknown): { error?: string; note?: string } {
        const rec = this.liveRecord(runId);
        if ('error' in rec) { return rec; }
        const d = decisionFromArg(raw);
        if (d.error) { return { error: d.error }; }
        rec.live = { ...rec.live, decision: d.decision };
        this.save();
        return { note: `your ${String(d.decision!.decision)} is applied at ${this.boundaryOf(runId)}, instead of asking the supervisor` };
    }

    /** A live setting — from the next step boundary on; the running step is never cut. */
    setRunLive(runId: string, args: Record<string, unknown>): { error?: string; note?: string } {
        const rec = this.liveRecord(runId);
        if ('error' in rec) { return rec; }
        const p = livePatch(args);
        if (!p.patch) { return { error: p.error ?? 'nothing to change' }; }
        const { addCheckpoint, ...patch } = p.patch;
        const notes: string[] = [];
        if (addCheckpoint !== undefined) {
            const r = this.addLiveCheckpoint(runId, rec, addCheckpoint);
            if (r.error) { return r; }
            notes.push(r.note!);
        }
        rec.live = applyLive(rec.live, patch);
        this.save();
        if (patch.pause === false && rec.pausedTask) {
            const t = this.tasks.find(x => x.id === rec.pausedTask);
            delete rec.pausedTask;
            this.save();
            if (t) { notes.push('resumed'); this.advanceWorkflow(t, t.status); }
        }
        return { note: [...notes, ...liveLines(rec.live)].join(' · ') || 'set' };
    }

    /** A checkpoint right after the running step, on the run's own copy of the chain. */
    private addLiveCheckpoint(runId: string, rec: WorkflowRunRecord, message: string): { error?: string; note?: string } {
        const view = this.runView(rec.workflowId, runId) as FarmWorkflow | undefined;
        if (!view) { return { error: 'the workflow is gone' }; }
        const open = this.tasks.filter(t => t.workflowRunId === runId && t.stepIndex !== undefined
            && (t.status === 'running' || t.status === 'queued' || t.id === rec.pausedTask));
        if (!open.length) { return { error: 'no step is running to put a checkpoint after' }; }
        const i = Math.max(...open.map(t => t.stepIndex!));
        const ids = view.steps.map((s, k) => stepKey(s, k));
        let n = 1, id = `${ids[i]}c${n}`.slice(0, 32);
        while (ids.includes(id)) { id = `${ids[i]}c${++n}`.slice(0, 32); }
        const step: WorkflowStep = {
            id, agentId: '', agentName: 'checkpoint', title: 'Checkpoint (added live)', prompt: '', mode: 'headless',
            checkpoint: message ? { message } : {}
        };
        rec.edits = { ...rec.edits, inserts: [...(rec.edits?.inserts ?? []), { after: ids[i], steps: [step] }] };
        return { note: `a checkpoint runs after step ${i + 1}` };
    }

    /** M-45 — do the run's wake conditions fire after this step? Undefined = the mechanical path. */
    private wakeCheck(w: FarmWorkflow, task: FarmTask, status: TaskStatus, runId: string): Omit<WakeCall, 'mechanical' | 'plan'> | undefined {
        const i = task.stepIndex ?? 0;
        const step = w.steps[i];
        const rec = this.runRecords.get(runId);
        if (!step || step.checkpoint || !rec || task.wokeBy) { return undefined; }
        const r = resolveWake({ workflow: w.wake, step: step.wake, run: rec.wake, live: rec.live?.wake });
        // M-46 — a person's waiting word or decision wakes it at this boundary, whatever the conditions say
        const human = [...(pendingWords(rec.live).length ? ['your-word'] : []), ...(rec.live?.decision ? ['your-decision'] : [])];
        if (!r.conditions.length && !human.length) { return undefined; }
        // A-27 — a check that withheld its retries to replan wakes it, whatever the conditions say (src/core/judgeDecision.ts)
        const replan = status === 'failed' ? task.judgeDecisions?.find(d => d.kind === 'replan') : undefined;
        const rows = this.tasks.filter(t => t.workflowRunId === runId);
        const kind = kindOfStep(step);
        const h = this.computeHandoff(task);
        const v = wakeVerdict(r.conditions, wakeFacts({
            kind, status, attempt: rows.filter(t => t.stepIndex === i && !t.wokeBy && t.branchIndex === undefined).length,
            startedAt: task.startedAt, endedAt: task.endedAt ?? Date.now(), costUSD: task.costUSD ?? task.mediaCost,
            verified: task.verified, runCostUSD: rows.reduce((a, t) => a + (stepSpend(t) ?? 0), 0),
            assets: kind === 'media' && h.file ? 1 : 0, output: h.text
        }));
        const fired = [...human, ...(replan ? ['replan'] : []), ...v.fired];
        const said = [...human.map(h => h === 'your-word' ? 'your-word (a word of yours was waiting)' : 'your-decision (you decided this boundary)'),
            ...(replan ? [`replan (${replan.line})`] : []), ...(v.said ? [v.said] : [])].join(', ');
        return fired.length ? { fired, said, from: r.sentence, after: status } : undefined;
    }

    /** Gallery Re-run/Vary: run a single media job outside any stored workflow. */
    runMediaAdhoc(title: string, model: string, input: string, link?: { projectId?: string; sceneId?: string }): void {
        const w: FarmWorkflow = {
            id: 'adhoc-' + newId(),
            title: 'Media',
            steps: [{
                agentId: '', agentName: 'media', title, prompt: '', mode: 'headless',
                media: { model, input, projectId: link?.projectId, sceneId: link?.sceneId }
            }]
        };
        void this.runMediaStep(w, 0, {}, newId());
    }

    private advanceWorkflow(task: FarmTask, status: TaskStatus): void {
        const runId = task.workflowRunId ?? task.workflowId ?? '';
        const w = this.runView(task.workflowId, runId);
        if (!w) { return; }
        if (task.branchIndex !== undefined) { this.onForEachBranchDone(w, task, status, runId); return; }
        this.noteOnBoard(w, task, status, runId);
        // Single chokepoint for parallel fan-in: a branch of the active group
        // collects here instead of advancing the run on its own.
        const group = this.parallelGroups.get(runId);
        if (group && task.stepIndex !== undefined
            && task.stepIndex >= group.start && task.stepIndex <= group.end) {
            this.onParallelBranchDone(w, task, status);
            return;
        }
        const stepIndex = task.stepIndex ?? 0;
        const handoff = this.computeHandoff(task);
        // M-46 — paused at the next boundary: the finished step is kept, the run waits for a resume
        const held = this.runRecords.get(runId);
        if (held?.live?.pause) {
            held.pausedTask = task.id;
            this.save();
            void vscode.window.showInformationMessage(`Agent Farm: workflow "${w.title}" is paused after step ${stepIndex + 1}, as you asked. Resume: Agent Farm: Steer a Running Workflow, or workflows.live pause=false.`);
            return;
        }
        // M-45 — the run's wake conditions; nothing fires = the mechanical path, exactly as before
        const woke = this.wakeCheck(w, task, status, runId);
        const mechanical = () => this.mechanicalAdvance(w, stepIndex, status, handoff, runId);
        if (woke) {
            const plan = mechanicalWords(status, stepIndex, w.steps.length, w.steps[stepIndex]?.onFail);
            void this.runCheckpointStep(w, stepIndex, handoff, runId, { ...woke, plan, mechanical });
            return;
        }
        mechanical();
    }

    private mechanicalAdvance(w: FarmWorkflow, stepIndex: number, status: TaskStatus, handoff: Handoff, runId: string): void {
        if (status === 'done') {
            this.routeToStep(w, stepIndex + 1, handoff, runId);
            return;
        }
        const onFail = w.steps[stepIndex]?.onFail ?? 'stop';
        if (onFail === 'stop') {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.endWorkflowRun(runId, 'failed', `step ${stepIndex + 1} ${status}`, stepIndex);
            this.opts.forward?.('workflow-failed', `Workflow "${w.title}" stopped at step ${stepIndex + 1} (${status})`);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped at step ${stepIndex + 1} (${status}).`);
            return;
        }
        const nextIndex = onFail === 'continue' ? stepIndex + 1 : (onFail as number) - 1;
        void vscode.window.showWarningMessage(
            `Agent Farm: workflow "${w.title}" step ${stepIndex + 1} failed — ` +
            (onFail === 'continue' ? 'continuing to next step.' : `jumping to step ${onFail}.`));
        this.routeToStep(w, nextIndex, handoff, runId);
    }

    /** M-39 — a finished step onto its run's board, under its stable id. */
    private noteOnBoard(w: FarmWorkflow, task: FarmTask, status: TaskStatus, runId: string): void {
        const rec = this.runRecords.get(runId);
        if (!rec) { return; }
        const i = task.stepIndex ?? 0;
        const h = this.computeHandoff(task);
        rec.board = boardWrite(rec.board, {
            id: stepKey(w.steps[i], i), index: i, title: task.title, status,
            ...(h.text !== undefined ? { text: h.text } : {}),
            ...(h.json !== undefined ? { json: h.json } : {}),
            ...(h.file ? { file: h.file } : {}),
            ...(task.verified ? { verdict: task.verified } : {}),
            ...(stepSpend(task) ? { costUSD: stepSpend(task) } : {}),
            ...(task.uploads?.length ? { uploads: task.uploads.map(u => ({ path: u.path, url: u.url })) } : {}),
            at: Date.now()
        });
    }

    // ---------- M-41: local files a media input names ----------

    private uploadSettings(stepProvider?: string): { mode: AutoUpload; provider: UploadProvider; retentionDays: number } {
        const raw = this.opts.mediaUpload?.() ?? {};
        const r = (id: string, v: unknown) => resolveFlex(id, { settings: v === flexPoint(id)?.default ? undefined : v }).value;
        const chosen = String(r('upload.provider', raw.provider));
        const provider: UploadProvider = chosen === 'fal' || chosen === 'replicate' ? chosen : stepProvider === 'replicate' ? 'replicate' : 'fal';
        return { mode: r('upload.auto', raw.mode) as AutoUpload, provider, retentionDays: Number(r('upload.retentionDays', raw.retentionDays)) };
    }

    private uploadOpts(provider: UploadProvider, retentionDays: number) {
        return {
            auth: (this.opts.mediaAuth?.(provider) ?? '').trim(), baseUrl: this.opts.mediaUploadBaseUrl?.(provider),
            retentionDays, cacheFile: path.join(path.dirname(this.storageFile), 'media-uploads.json')
        };
    }

    private uploadLocalInput(input: string, stepProvider: string, runId: string, workflowTitle: string, task: FarmTask) {
        const s = this.uploadSettings(stepProvider);
        const confirm = this.opts.confirmUpload;
        return prepareMediaInput(input, s.provider, s.mode, this.uploadOpts(s.provider, s.retentionDays),
            paths => confirm
                ? this.askingHuman(runId, workflowTitle, task, { kind: 'upload', title: s.provider, goal: paths.join(', ') }, () => confirm(paths, s.provider))
                : Promise.resolve(false));
    }

    /** One file onto a provider's storage — the bridge's media.upload, by the step's own code. */
    uploadMediaFile(file: string, provider?: UploadProvider): Promise<UploadDone> {
        const s = this.uploadSettings(provider);
        return uploadFile(file, provider ?? s.provider, this.uploadOpts(provider ?? s.provider, s.retentionDays));
    }

    // ---------- M-40: for-each steps (the planner is src/core/forEachStep.ts) ----------

    /** Fan-outs this window started or resumed. A branch that lands after a reload only records. */
    private forEachRuns = new Map<string, { run: FE.ForEachRun; base: Handoff }>();

    private startForEach(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        const step = w.steps[index];
        const rec = this.runRecords.get(runId);
        let run = rec?.forEach && rec.forEach.stepIndex === index ? FE.resumeForEach(rec.forEach) : undefined;
        if (run) {
            // a branch row still queued from before the reload would run a second time beside its relaunch
            for (const t of this.tasks.filter(x => x.workflowRunId === runId && x.stepIndex === index
                && x.branchIndex !== undefined && (x.status === 'queued' || x.status === 'running'))) { this.cancelTask(t); }
        } else {
            const list = FE.resolveList(step.forEach!.list,
                { board: handoff.board, prevText: handoff.text, prevJson: handoff.json, inputs: handoff.inputs });
            const plan = 'items' in list ? FE.planForEach(list.items, FE.forEachPolicy(step.forEach!), index) : { refusal: list.error };
            if ('refusal' in plan) { this.failForEach(w, index, handoff, runId, `for each: ${plan.refusal}`); return; }
            run = plan.run;
            if (run.total > run.branches.length) {
                void vscode.window.showWarningMessage(`Agent Farm: workflow "${w.title}" step ${index + 1} — the list has ${run.total} items; running the first ${run.branches.length} (soft cap).`);
            }
        }
        if (rec) { rec.forEach = run; }
        const base: Handoff = { ...handoff };
        delete base.branch;
        this.forEachRuns.set(runId, { run, base });
        this.handoffs.set(runId, base);
        this.save();
        if (run.branches.every(b => b.status === 'done' || b.status === 'failed')) { this.finishForEach(w, runId, false); return; }
        this.launchBranches(w, runId);
    }

    /** A-27 — what a run has spent so far: every step row's own spend, supervisor turns included */
    private runSpent(runId: string): number {
        return this.tasks.filter(t => t.workflowRunId === runId).reduce((a, t) => a + (stepSpend(t) ?? 0), 0);
    }

    private launchBranches(w: FarmWorkflow, runId: string): void {
        const live = this.forEachRuns.get(runId);
        if (!live) { return; }
        const { run, base } = live;
        const capped = spendCapStop(this.runSpent(runId), this.runRecords.get(runId)?.spendCap);
        if (capped) {
            capWaitingBranches(run, capped);
            this.save();
            if (!run.branches.some(b => b.status === 'running')) { this.finishForEach(w, runId, false); }
            return;
        }
        for (const i of FE.launchable(run)) {
            FE.markLaunched(run, i);
            this.startWorkflowStep(w, run.stepIndex,
                { ...base, branch: { index: i, count: run.branches.length, item: run.branches[i].item } }, runId);
        }
        this.save();
    }

    private onForEachBranchDone(w: FarmWorkflow, task: FarmTask, status: TaskStatus, runId: string): void {
        const live = this.forEachRuns.get(runId);
        const run = live?.run ?? this.runRecords.get(runId)?.forEach;
        const i = task.branchIndex ?? -1;
        if (!run || run.stepIndex !== task.stepIndex || run.branches[i]?.status !== 'running') { return; }
        const h = this.computeHandoff(task);
        const next = FE.branchEnded(run, i, {
            ok: status === 'done', text: h.text, json: h.json, file: h.file, costUSD: stepSpend(task),
            reason: task.verified === 'fail' ? 'its quality check failed' : status
        });
        this.save();
        if (!live) { return; } // landed after a reload: recorded, and the resume runs the rest
        if (next === 'launch') { this.launchBranches(w, runId); return; }
        this.finishForEach(w, runId, next === 'dropped');
    }

    /** Fan-in: every branch in list order onto the board and into the next step's handoff. */
    private finishForEach(w: FarmWorkflow, runId: string, dropped: boolean): void {
        const run = this.forEachRuns.get(runId)?.run ?? this.runRecords.get(runId)?.forEach;
        if (!run) { return; }
        this.forEachRuns.delete(runId);
        const rec = this.runRecords.get(runId);
        if (rec) { delete rec.forEach; }
        const step = w.steps[run.stepIndex];
        if (dropped) {
            for (const t of this.tasks.filter(x => x.workflowRunId === runId && x.stepIndex === run.stepIndex
                && x.branchIndex !== undefined && (x.status === 'running' || x.status === 'queued'))) { this.cancelTask(t); }
        }
        const merged: Handoff = FE.fanIn(run, step.title);
        if (rec) {
            rec.board = boardWrite(rec.board, {
                id: stepKey(step, run.stepIndex), index: run.stepIndex, title: step.title,
                status: dropped ? 'failed' : 'done', text: merged.text, json: merged.json,
                costUSD: run.branches.reduce((a, b) => a + (b.costUSD ?? 0), 0), at: Date.now()
            });
        }
        this.save();
        if (dropped) { this.failForEach(w, run.stepIndex, merged, runId, `for each: ${run.dropped}`); return; }
        this.routeToStep(w, run.stepIndex + 1, merged, runId);
    }

    /** A for-each step that could not run, or was dropped: the step's own onFail decides. */
    private failForEach(w: FarmWorkflow, index: number, handoff: Handoff, runId: string, reason: string): void {
        const onFail = w.steps[index]?.onFail ?? 'stop';
        if (onFail === 'stop') {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.endWorkflowRun(runId, 'failed', `step ${index + 1} ${reason}`, index);
            this.opts.forward?.('workflow-failed', `Workflow "${w.title}" stopped at step ${index + 1} (${reason})`);
            void vscode.window.showWarningMessage(`Agent Farm: workflow "${w.title}" stopped at step ${index + 1} — ${reason}.`);
            return;
        }
        void vscode.window.showWarningMessage(`Agent Farm: workflow "${w.title}" step ${index + 1} — ${reason}; `
            + (onFail === 'continue' ? 'continuing to the next step.' : `jumping to step ${onFail}.`));
        this.routeToStep(w, onFail === 'continue' ? index + 1 : (onFail as number) - 1, handoff, runId);
    }

    // ---------- parallel groups (fan-out / fan-in) ----------

    /** Launch every step of the parallel group [start..end] concurrently with the same handoff. */
    private startParallelGroup(w: FarmWorkflow, start: number, handoff: Handoff, runId: string): void {
        let end = start;
        while (end + 1 < w.steps.length && w.steps[end + 1].parallel) { end++; }
        const group = {
            start, end,
            pending: new Set<number>(),
            results: new Map<number, Handoff>(),
            statuses: new Map<number, TaskStatus>()
        };
        this.parallelGroups.set(runId, group);
        this.handoffs.set(runId, handoff);
        for (let i = start; i <= end; i++) {
            const step = w.steps[i];
            if (step.runIf && !this.runIfMatches(step.runIf, handoff)) {
                group.statuses.set(i, 'done'); // a skipped branch is benign, not a failure
                continue;
            }
            group.pending.add(i);
            this.startWorkflowStep(w, i, handoff, runId);
        }
        if (group.pending.size === 0) { this.finishParallelGroup(w, runId); }
    }

    private onParallelBranchDone(w: FarmWorkflow, task: FarmTask, status: TaskStatus): void {
        const runId = task.workflowRunId ?? '';
        const group = this.parallelGroups.get(runId);
        if (!group || task.stepIndex === undefined) { return; }
        group.pending.delete(task.stepIndex);
        group.statuses.set(task.stepIndex, status);
        if (status === 'done') { group.results.set(task.stepIndex, this.computeHandoff(task)); }
        if (group.pending.size === 0) { this.finishParallelGroup(w, runId); }
    }

    /** Fan-in: merge branch outputs and either advance past the group or apply the group's onFail. */
    private finishParallelGroup(w: FarmWorkflow, runId: string): void {
        const group = this.parallelGroups.get(runId);
        if (!group) { return; }
        this.parallelGroups.delete(runId);
        const merged = this.mergeHandoffs(w, group);
        const anyFailed = [...group.statuses.values()].some(s => s === 'failed');
        if (!anyFailed) {
            this.routeToStep(w, group.end + 1, merged, runId);
            return;
        }
        // Group-level failure policy = the onFail of the group's first step.
        const onFail = w.steps[group.start].onFail ?? 'stop';
        if (onFail === 'stop') {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.opts.forward?.('workflow-failed',
                `Workflow "${w.title}" stopped — a parallel branch (steps ${group.start + 1}-${group.end + 1}) failed`);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — a parallel branch failed (steps ${group.start + 1}-${group.end + 1}).`);
            return;
        }
        const nextIndex = onFail === 'continue' ? group.end + 1 : (onFail as number) - 1;
        void vscode.window.showWarningMessage(
            `Agent Farm: workflow "${w.title}" — a parallel branch failed; ` +
            (onFail === 'continue' ? 'continuing past the group.' : `jumping to step ${onFail}.`));
        this.routeToStep(w, nextIndex, merged, runId);
    }

    /** Combine a group's branch outputs into one handoff: labeled text + a {branches:[…]} envelope. */
    private mergeHandoffs(w: FarmWorkflow, group: { start: number; end: number; results: Map<number, Handoff> }): Handoff {
        const texts: string[] = [];
        const branches: { step: string; text: string; json?: unknown; skipped?: boolean }[] = [];
        for (let i = group.start; i <= group.end; i++) {
            const title = w.steps[i].title;
            const h = group.results.get(i);
            if (h && (h.text ?? '').trim()) {
                texts.push(`## ${title}\n${h.text}`);
                branches.push({ step: title, text: h.text ?? '', json: h.json });
            } else {
                branches.push({ step: title, text: '', skipped: !group.results.has(i) });
            }
        }
        return { text: texts.join('\n\n'), json: { branches } };
    }

    // ---------- triggers (A1 storage/CRUD; watching lives in TriggerManager) ----------

    addTrigger(t: Omit<FarmTrigger, 'id'>): FarmTrigger {
        const trigger: FarmTrigger = { ...t, id: newId() };
        this.triggers.push(trigger);
        this.save();
        return trigger;
    }

    toggleTrigger(t: FarmTrigger): void {
        t.enabled = !t.enabled;
        this.save();
    }

    /** Persist in-place edits (timing is read at fire time, so no re-arm is needed). */
    updateTrigger(_t: FarmTrigger): void {
        this.save();
    }

    deleteTrigger(t: FarmTrigger): void {
        this.deletePlanRows([{ kind: 'trigger', id: t.id }]);
    }

    markTriggerFired(t: FarmTrigger): void {
        const now = Date.now();
        t.lastFiredAt = now;
        t.fireCount = (t.fireCount ?? 0) + 1;
        t.recentFirings = [...(t.recentFirings ?? []).filter(ts => now - ts < 3600_000), now];
        this.save();
        this.logAutomation({
            kind: 'trigger', id: t.id, title: t.title, outcome: 'fired',
            reason: this.checkPrecondition(t.fireIf).detail
        });
    }

    /** A firing the gate or the precondition suppressed. Counted separately
     *  from failures: nothing went wrong, the wake-up simply was not worth
     *  paying for — and the count is what proves the brake earns its keep. */
    markTriggerSkipped(t: FarmTrigger, reason: string): void {
        t.skipCount = (t.skipCount ?? 0) + 1;
        t.lastSkippedAt = Date.now();
        t.lastSkipReason = reason;
        this.save();
        this.logAutomation({
            kind: 'trigger', id: t.id, title: t.title, outcome: 'skipped', reason
        });
    }

    // ---------- schedules ----------

    /**
     * ‼️ M-21 — THE ONE DOOR INTO A STORED SCHEDULE.
     *
     * Edit-in-place (parity with editTrigger — schedules used to be
     * delete+recreate). The Tasks page used to reach past this and
     * `Object.assign` the object itself while the bridge came through here, so
     * the two could not help but drift, and they did: only one of them settled
     * the occurrence, and neither of them could take a field back OFF.
     *
     * Two rules, and both doors get them because there is one door:
     *
     * - **`undefined` in the patch REMOVES the field.** That is what a form's
     *   empty box means, and `Object.assign` cannot say it. A key simply left
     *   out of the patch is not mentioned and survives untouched.
     * - **An edit is not a firing** (`settle`). See `settledKeyAfterEdit`:
     *   clearing the day-stamp on a save made the schedule run the moment the
     *   form closed. Switching one back ON settles whether or not the caller
     *   asked, because a schedule that was off did not miss anything.
     */
    updateSchedule(
        id: string, patch: Partial<Omit<FarmSchedule, 'id'>>, settle = false,
        now = new Date()
    ): void {
        const s = this.schedules.find(x => x.id === id);
        if (!s) { return; }
        const wasEnabled = s.enabled;
        const wasOnceAt = s.onceAt;
        const rec = s as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) { delete rec[key]; } else { rec[key] = value; }
        }
        if (settle || (!wasEnabled && s.enabled)) {
            if (s.kind === 'once') {
                // a `once` whose appointment moved is a new appointment; one
                // that did not move keeps whatever it had, run or not
                if (wasOnceAt !== s.onceAt) { s.lastRunKey = undefined; }
            } else {
                s.lastRunKey = settledKeyAfterEdit(s, now);
            }
            // and a quiet-hours deferral of the occurrence just settled goes
            // with it, or the window ending would fire the very run this edit
            // was supposed to replace
            s.pendingRunKey = undefined;
        }
        this.save();
    }

    addSchedule(s: Omit<FarmSchedule, 'id'>): FarmSchedule {
        const schedule: FarmSchedule = { ...s, id: newId() };
        // catch-up policies settle the past at creation: without this stamp a
        // brand-new schedule would immediately "catch up" an occurrence from
        // before it even existed
        if (schedule.kind !== 'once' && (schedule.missed === 'run' || schedule.missed === 'ask')
            && schedule.lastRunKey === undefined) {
            schedule.lastRunKey = previousOccurrenceKey(schedule, new Date());
        }
        this.schedules.push(schedule);
        this.save();
        return schedule;
    }

    /** ‼️ M-21 — through the one door, so switching a schedule back on settles
     *  the past exactly as an edit does: it was off, so it missed nothing. */
    toggleSchedule(s: FarmSchedule, now = new Date()): void {
        this.updateSchedule(s.id, { enabled: !s.enabled }, false, now);
    }

    deleteSchedule(s: FarmSchedule): void {
        this.deletePlanRows([{ kind: 'schedule', id: s.id }]);
    }

    // ---------- deleting PLAN rows: one door, and it is reversible ----------
    //
    // ‼️ THE FOUR NAMED DELETES ABOVE ARE NAMES FOR THIS ONE. They each used to
    // carry their own filter-and-save, which is how the page and the bridge
    // ended up doing the same act two different ways — caught by the parity
    // gate the moment the page moved. Keep the names (a tree command deleting a
    // schedule should say so) and keep one implementation under them.

    /**
     * ‼️ M-33 — THE FOUR PLAN KINDS DELETE THROUGH ONE DOOR, AND IT REMEMBERS
     * WHERE THE ROW WAS. The Plan tab lets a reader tick any row; before this
     * there were four separate deletes, two of which asked their own question
     * inside a command, so a bulk act could not be built out of them without
     * putting four modal boxes in a row.
     *
     * It returns what it took, in the ORDER AND PLACES it took them from, which
     * is what makes `restorePlanRows` an undo rather than a re-creation: the
     * object goes back with its own id, so a trigger that points at a workflow
     * still points at it, and a schedule keeps the run history filed under its
     * id. Re-adding by title would have made a new id and quietly orphaned
     * both.
     */
    deletePlanRows(refs: readonly { kind: string; id: string }[]): DeletedPlanRow[] {
        const gone: DeletedPlanRow[] = [];
        for (const ref of refs) {
            let hit: { at: number; item: PlanDefinition } | undefined;
            switch (ref.kind) {
                case 'schedule': hit = takePlanRow(this.schedules, ref.id); break;
                case 'trigger': hit = takePlanRow(this.triggers, ref.id); break;
                case 'workflow': hit = takePlanRow(this.workflows, ref.id); break;
                case 'template': hit = takePlanRow(this.templates, ref.id); break;
                default: hit = undefined; break;
            }
            if (hit) {
                gone.push({ kind: ref.kind as DeletedPlanRow['kind'], at: hit.at, title: hit.item.title, item: hit.item });
            }
        }
        if (gone.length) { this.save(); }
        return gone;
    }

    /** Put back exactly what `deletePlanRows` took. Lowest place first, so a
     *  run of rows taken out of one list lands back in its own order; a row
     *  that is somehow already there is skipped rather than doubled. */
    restorePlanRows(rows: readonly DeletedPlanRow[]): number {
        let n = 0;
        for (const r of [...rows].sort((a, b) => a.at - b.at)) {
            switch (r.kind) {
                case 'schedule': n += putPlanRow(this.schedules, r.at, r.item as FarmSchedule); break;
                case 'trigger': n += putPlanRow(this.triggers, r.at, r.item as FarmTrigger); break;
                case 'workflow': n += putPlanRow(this.workflows, r.at, r.item as FarmWorkflow); break;
                case 'template': n += putPlanRow(this.templates, r.at, r.item as FarmTemplate); break;
            }
        }
        if (n) { this.save(); }
        return n;
    }

    /** Manual "Run Now": the master switch still applies (paused means paused),
     *  but quiet hours and the precondition do not — the user pressing a button
     *  is a deliberate act, not an unattended wake-up. */
    runScheduleNow(s: FarmSchedule, over?: { retry?: RetryPolicy }): void {
        const gate = this.automationGate(new Date(), true);
        if (gate) {
            void vscode.window.showWarningMessage(`Agent Farm: cannot run "${s.title}" — ${gate.reason}.`);
            return;
        }
        const agent = this.getAgents().find(a => a.id === s.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for schedule "${s.title}" not found.`);
            return;
        }
        // The project is the schedule's own declaration, never the window's —
        // see fireSchedule. Run Now must produce the same run the timer would,
        // or the button is not a test of anything, so it takes the same
        // dimensions from the same place. U-151 — 'Run with…' lays this run's
        // own retry over the schedule's, for this run only.
        const task = this.addTask(agent, s.title, s.prompt, s.mode,
            { fromSchedule: s.id, projectId: s.projectId || undefined, ...runExtras(s), ...(over?.retry ? { retry: over.retry } : {}) });
        // ‼️ M-7 — THE SAME HONESTY THE TIMER PATH OWES (see fireSchedule). A
        // press is not a launch: the budget, the quota guard and the concurrency
        // limits all still stand in front of it, and logging "fired" for a run
        // that was held is how the automation log came to disagree with the
        // board it is supposed to explain.
        const started = this.startTask(task);
        this.logAutomation({
            kind: 'schedule', id: s.id, title: s.title, outcome: 'fired',
            reason: 'run now (manual)'
                + (started ? '' : ` — HELD: ${task.deferredReason ?? 'could not launch'}`)
        });
        if (!started) {
            void vscode.window.showWarningMessage(
                `Agent Farm: "${s.title}" is queued but could NOT start`
                + ` — ${task.deferredReason ?? 'a ceiling held it back'}.`);
        }
    }

    /** 'ask' policy: (schedule.id + missedKey) pairs already offered in THIS
     *  window — in-memory on purpose, so a dismissed toast comes back in the
     *  next window instead of the occurrence silently dying. */
    private askedMissed = new Set<string>();

    /** (schedule.id + runKey) pairs whose gate-block was already logged this
     *  window — keeps a 30s tick from writing the same skip line forever. */
    private gateNoted = new Set<string>();

    private tickSchedules(): void {
        if (!this.runner()) { return; } // B11: only the runner window fires schedules
        const now = new Date();
        for (const s of this.schedules) {
            const { due, runKey, missedKey, missedAt } = scheduleDue(s, now);
            if (!due) {
                if (missedKey && s.missed === 'ask' && !this.askedMissed.has(s.id + missedKey)) {
                    this.askedMissed.add(s.id + missedKey);
                    void vscode.window.showWarningMessage(
                        `Agent Farm: schedule "${s.title}" (${s.agentName}) missed its time` +
                        (missedAt ? ` (${new Date(missedAt).toLocaleString()})` : '') +
                        ' — no VS Code window was open. Run it now?',
                        'Run now', 'Skip this one'
                    ).then(pick => {
                        // dismissed (undefined): decide nothing — the next window asks again
                        if (!pick || !this.schedules.includes(s)) { return; }
                        s.lastRunKey = missedKey;
                        this.save();
                        if (pick === 'Run now') { this.runScheduleNow(s); }
                    });
                }
                continue;
            }
            // --- the gate: may we work at all right now? ---
            const gate = this.automationGate(now);
            if (gate) {
                if (gate.kind === 'quiet') {
                    // Quiet hours DEFER rather than drop: the occurrence is
                    // remembered and fires when the window ends, so a nightly
                    // batch is not silently lost by "no wake-ups after 23:00".
                    if (s.pendingRunKey !== runKey) {
                        s.pendingRunKey = runKey;
                        s.lastRunKey = runKey;
                        this.save();
                        this.logAutomation({
                            kind: 'schedule', id: s.id, title: s.title,
                            outcome: 'skipped', reason: `${gate.reason} — deferred to the end of the window`
                        });
                    }
                } else if (!this.gateNoted.has(s.id + runKey)) {
                    this.gateNoted.add(s.id + runKey);
                    this.logAutomation({
                        kind: 'schedule', id: s.id, title: s.title,
                        outcome: 'skipped', reason: gate.reason
                    });
                }
                continue;
            }
            this.fireSchedule(s, runKey, !!missedKey);
        }
        this.releaseQuietDeferred(now);
    }

    /** Occurrences held back by quiet hours, released once the window ends. */
    private releaseQuietDeferred(now: Date): void {
        if (this.automationGate(now)) { return; }
        for (const s of this.schedules) {
            if (!s.pendingRunKey || !s.enabled) { continue; }
            const key = s.pendingRunKey;
            s.pendingRunKey = undefined;
            this.fireSchedule(s, key, false, 'held over from quiet hours');
        }
    }

    /** Precondition check, then launch. Shared by the on-time path, the
     *  quiet-hours release and Run Now (which passes `manual`). */
    private fireSchedule(s: FarmSchedule, runKey: string, caughtUp: boolean, note?: string): void {
        const pre = this.checkPrecondition(s.fireIf);
        if (!pre.ok) {
            // Nothing to do — settle this occurrence so it does not retry all
            // day, and record WHY. No agent was woken; this skip is free.
            s.lastRunKey = runKey;
            s.pendingRunKey = undefined;
            this.save();
            this.logAutomation({
                kind: 'schedule', id: s.id, title: s.title,
                outcome: 'skipped', reason: pre.detail
            });
            return;
        }
        s.lastRunKey = runKey;
        s.pendingRunKey = undefined;
        if (s.kind === 'once') { s.enabled = false; }
        const agent = this.getAgents().find(a => a.id === s.agentId);
        if (!agent) { return; }
        // ‼️ A SCHEDULE'S PROJECT IS THE ONE IT DECLARES, AND NOTHING ELSE.
        // A schedule fires from a timer — nobody was in a project when it went
        // off. Stamping it with whatever the window happened to be showing at
        // 03:00 would tell an unattended watch agent "work on this project, and
        // record what you did in its worklog", about work it knows nothing
        // about. So the window is never read here; `s.projectId` is, and it is
        // there only because someone chose it ON the schedule (RunDimensions).
        const task = this.addTask(agent, s.title, s.prompt, s.mode,
            { fromSchedule: s.id, projectId: s.projectId || undefined, ...runExtras(s) });
        // ‼️ M-7 — SAY WHAT ACTUALLY HAPPENED, NOT WHAT WAS ATTEMPTED. This
        // announced "scheduled task started" and then called startTask, which
        // may hold the run back at a ceiling — so the one message the user got
        // said the thing had begun on exactly the occasions it had not, and the
        // automation log recorded a clean `fired` over the top of it. The launch
        // is attempted FIRST and both the toast and the log line report the
        // answer it gave.
        const started = this.startTask(task);
        this.logAutomation({
            kind: 'schedule', id: s.id, title: s.title,
            outcome: 'fired',
            reason: (note ? `${pre.detail} (${note})` : pre.detail)
                + (started ? '' : ` — HELD: ${task.deferredReason ?? 'could not launch'}`)
        });
        const head = started
            ? `Agent Farm: scheduled task started — "${s.title}" (${s.agentName})`
            : `Agent Farm: scheduled task "${s.title}" (${s.agentName}) is queued but could NOT start`
            + ` — ${task.deferredReason ?? 'a ceiling held it back'}`;
        const tail = (caughtUp ? ' — caught up; the scheduled time passed while VS Code was closed.' : '')
            + (note ? ` — ${note}.` : '');
        if (started) { void vscode.window.showInformationMessage(head + tail); }
        else { void vscode.window.showWarningMessage(head + tail); }
    }

    dispose(): void {
        clearInterval(this.timer);
        if (this.externalTimer) { clearInterval(this.externalTimer); this.externalTimer = undefined; }
        this.stopFollowerWatch();
        for (const [taskId, child] of this.processes) {
            this.killProcess(taskId, child);
        }
        for (const d of this.disposables) { d.dispose(); }
        this.onDidChangeEmitter.dispose();
    }
}
