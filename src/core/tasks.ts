import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import {
    appendAutomationEvent, AutomationEvent, AutomationState, evaluatePrecondition,
    gateBlock, pauseExpired, Precondition
} from './automation';
import { buildBrowserPrompt, hostAllowed } from './browser';
import { engineConcurrencyWeight } from './engines';
import {
    claudeResumeArgs, engineContextPrefix, engineFirstPromptFlag, engineModeNote, engineOf,
    enginePermissionSetting, headlessEffortRefusal, headlessResumeRefusal, runArgs, tuiArgs
} from './consoleEngine';
import {
    DEFAULT_MEDIA_PRICING, downloadAsset, estimateMediaCost, extFromUrl, injectMediaFeedback,
    mediaCandidates, MediaMeta, MediaPriceRule, MediaResult, pollFalResult, readMediaMetas, recordSelection
} from './media';
import { InteractiveClose, InteractiveTarget, modelIdOk, normInteractiveClose, normInteractiveTarget } from './launch';
import { pollReplicateResult, pollWebhookResult, providerFor, WebhookPollConfig } from './mediaProviders';
import {
    OPENCODE_RUN_OUTPUT_NOTE, opencodeRunSessionId, readOpencodeRun
} from './opencoderun';
import { expandDeep, PortableRoot, tokenizeDeep } from './portablePaths';
import {
    classifyFailure, continuationPromptFor, describeRetry, FailurePhase, fillContinuation, normalizeRetry,
    resolveRetry, RetryPolicy, retryDecision, RunProgress
} from './retry';
import { opencodeSpawnEnv } from './opencodesync';
import { archiveMonths, readArchive } from './taskstats';
import { openExternalTerminal } from './extTerminal';
import { extractJson, sanitizePrompt } from './util';

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
    /** claude -p --output-format json when 'json' (structured handoff). */
    outputContract?: 'text' | 'json';
    /** verification attempt number (0 = first run). */
    attempt?: number;
    /** result of the verify step, when the step had one. */
    verified?: 'pass' | 'fail';
    /** estimated cost of a media step (USD). */
    mediaCost?: number;
    /** why a requested start is waiting (concurrency / quota) — the sentence a
     *  PERSON reads, live figures and all. Never an identity: see `deferredCode`. */
    deferredReason?: string;
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
     * ‼️ M-26 — WHERE THIS INTERACTIVE RUN OPENS, and what it does once the
     * agent has answered. Both are ignored on a headless run, and both are
     * absent on every task written before they existed — which reads as
     * `vscode` + `stay-open`, exactly what those tasks did.
     */
    interactiveTarget?: InteractiveTarget;
    interactiveClose?: InteractiveClose;
    /** ‼️ M-26 — the hosted conversation this task was handed to, when it runs
     *  in the Console. The one handle that lets the panel's own report be read
     *  back against this task (see `pumpConsoleTasks`). */
    consoleSessionId?: string;
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
    | 'resumed';

/** The most a task keeps. A run that ping-pongs against a ceiling for a day
 *  would otherwise grow without bound; the newest are the ones being read. */
export const TASK_EVENTS_MAX = 40;

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
    workDir?: string;
    priority?: number;
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
    if (d.workDir) { r.workDir = d.workDir; }
    if (d.priority) { r.priority = Math.trunc(d.priority); }
    if (d.ignoreBudget) { r.ignoreBudget = true; }
    // ‼️ Normalised on the way through, so a policy typed into a form, seeded
    // from a JSON file or sent over the bridge cannot reach a task un-clamped.
    const retry = normalizeRetry(d.retry);
    if (retry) { r.retry = retry; }
    return r;
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
    verify?: { criteria: string; retries?: number };
    /**
     * Webhook step: instead of claude, the step is an HTTP call. url/body/header
     * templates support {prev_output} {prev_text} {prev_json.x} {secret:NAME}.
     * The response body becomes the handoff for the next step. Wave C: optional
     * `headers` (auth for queued APIs) and `poll` (submit→poll any queued API —
     * Gemini long-running ops etc. — without a bespoke media provider).
     */
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
    media?: { model: string; input: string; timeoutMin?: number; projectId?: string; sceneId?: string };
    /**
     * F3 — browser automation step: the step's agent drives its browser MCP.
     * Host allowlist is enforced before launch; empty allowlist = refuse.
     */
    browser?: { url: string; goal: string; allowHosts?: string[] };
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
}

/** What one step passes to the next. */
export interface Handoff {
    file?: string;
    text?: string;
    json?: unknown;
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
        | { kind: 'workflow'; workflowId: string }
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
}

export interface FarmWorkflow {
    id: string;
    title: string;
    steps: WorkflowStep[];
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
            onceAt: kind === 'once' && typeof o.onceAt === 'number' ? o.onceAt : undefined,
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
}

export interface TaskManagerOptions {
    /** CLI args for internal judge calls — always a cheap model. */
    judgeArgs?: () => string;
    /** ‼️ M-3 — the user's DEFAULT retry policy (`agentFarm.taskRetry`), used by
     *  every run that does not state one of its own. Read through a function
     *  because it is a setting: a window that has been open for a week must
     *  honour what was changed on Tuesday. */
    defaultRetry?: () => RetryPolicy | undefined;
    /**
     * ‼️ M-10 — WHEN THIS ENGINE'S USAGE WINDOW REOPENS, epoch ms, from the
     * engine's OWN published data rather than from its printed prose. It is the
     * highest-priority source for a reset-aware first retry; undefined simply
     * means "nothing published", and the decision falls to the output and then
     * to the ordinary interval, saying which on the run's record.
     */
    limitResetAt?: (engine?: string) => number | undefined;
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
    /** ‼️ S-19 — what a session has cost and spent so far, for the delta a
     *  resumed run is charged. Undefined = not indexed yet, and the task simply
     *  starts from nothing rather than from a guess. */
    sessionUsage?: (sessionId: string, engine?: string) => { cost: number; tokens: number } | undefined;
    maxConcurrent?: () => number;
    maxConcurrentPerAgent?: () => number;
    /** Return a reason to defer auto work (e.g. quota window nearly full), or
     *  undefined. ‼️ M-11 — a `{code, reason}` pair is preferred over a bare
     *  string: the code is what dedupes a park, the sentence is what is read. */
    quotaCheck?: () => BlockAnswer;
    outputsMaxMB?: () => number;
    /** Secrets injected as environment variables into spawned tasks. The
     *  agent id lets the vault withhold secrets scoped to other agents. */
    getEnv?: (agentId?: string) => Record<string, string>;
    /** {secret:NAME} substitution for webhook templates. */
    resolveTemplate?: (s: string) => string;
    /** Outbound notification forwarding (B4). */
    forward?: (type: string, message: string) => void;
    /** C1: media provider settings. providerId = 'fal' | 'replicate' (Wave C). */
    mediaAuth?: (providerId: string) => string;              // full Authorization header, e.g. "Key <FAL_KEY>" / "Bearer <token>"
    mediaBaseUrl?: (providerId: string) => string | undefined; // override for tests / self-hosted proxies
    mediaPricing?: () => MediaPriceRule[]; // C3 cost estimation rules
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
     */
    startConsoleTask?: (spec: {
        task: FarmTask; agentId: string; agentName: string; cwd: string; prompt: string;
    }) => string | undefined;
    /**
     * ‼️ M-26 — WHAT THAT HOSTED CONVERSATION IS DOING NOW. The panel's own
     * report, read back against the task. `answered` is the fact `auto-close`
     * turns on: the agent has finished a turn in this session, as opposed to the
     * session merely sitting idle because nothing has been said to it yet.
     */
    consoleTaskState?: (sessionId: string) => {
        state: 'starting' | 'working' | 'idle' | 'ended' | 'error';
        answered: boolean; failed?: boolean; reason?: string;
    } | undefined;
    /** I5: model policy — extra --model args (and reason) for a task launch. */
    modelArgsFor?: (task: FarmTask) => { args: string; reason: string } | undefined;
    /**
     * The project context file for a task, written fresh at launch time from the
     * project the task was CREATED under (`task.projectId`). Undefined = no
     * project, and then no flag is added at all: a session with no project must
     * look exactly as it did before this existed.
     */
    projectContextFile?: (task: FarmTask) => string | undefined;
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
    /** F3: global browser-step allowlist + per-step approval gate. */
    browserAllowHosts?: () => string[];
    /** Resolve to true to run the browser step; false cancels it. */
    confirmBrowser?: (info: { title: string; url: string; goal: string }) => Promise<boolean>;
    /** Human-in-the-loop workflow gate; resolve true to continue the chain, false to fail the step. */
    confirmApproval?: (info: { title: string; message: string }) => Promise<boolean>;
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

export class TaskManager implements vscode.Disposable {
    tasks: FarmTask[] = [];
    schedules: FarmSchedule[] = [];
    templates: FarmTemplate[] = [];
    workflows: FarmWorkflow[] = [];
    triggers: FarmTrigger[] = [];
    automation: AutomationState = {};
    automationLog: AutomationEvent[] = [];
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

    constructor(
        private storageFile: string,
        private getAgents: () => AgentInfo[],
        private autoAdvance: () => boolean,
        /** Extra CLI args appended to every task's claude command, e.g. "--model haiku". */
        private extraArgs: () => string = () => '',
        private opts: TaskManagerOptions = {}
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
            this.triggers = Array.isArray(json.triggers) ? json.triggers : [];
            this.automation = json.automation && typeof json.automation === 'object' ? json.automation : {};
            this.automationLog = Array.isArray(json.automationLog) ? json.automationLog : [];
            // M-8 (V3) — the tombstones a previous window could not write. It
            // survives the restart on purpose: a restart is very often what
            // clears whatever was holding the file.
            this.archiveRepair = Array.isArray(json.archiveRepair)
                ? (json.archiveRepair as { id?: unknown; month?: unknown }[])
                    .filter(x => typeof x?.id === 'string' && typeof x?.month === 'string')
                    .map(x => ({ id: x.id as string, month: x.month as string }))
                : [];
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
                    const step = this.workflows.find(x => x.id === t.workflowId)?.steps[t.stepIndex ?? -1];
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
                        'the VS Code window closed — the Console session it was hosted in did not survive');
                    t.consoleSessionId = undefined;
                } else if (t.workflowRunId === undefined) {
                    // ‼️ M-21 — WHY A RUN IS BACK ON THE QUEUE IS PART OF WHAT
                    // HAPPENED TO IT. Clearing `startedAt` on its own left a row
                    // that reads as though it had never run at all, and the one
                    // fact the reader needs — that it was cut, not skipped — was
                    // written nowhere. The `started` line above it keeps its own
                    // timestamp, so the two together tell the whole story.
                    noteTaskEvent(t, 'parked',
                        'the VS Code window closed mid-run — back on the queue, press start to run it again');
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
            const w = this.workflows.find(x => x.id === r.workflowId);
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
        const p = resolveRetry(held.retry, this.opts.defaultRetry?.());
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
        const w = this.workflows.find(x => x.id === r.workflowId);
        if (!w || r.stepIndex >= w.steps.length) {
            void vscode.window.showWarningMessage(
                'Agent Farm: this run can no longer be resumed — its workflow or step is gone.');
            return;
        }
        this.runCounts.set(runId, 0);
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
            ...(this.archiveRepair.length ? { archiveRepair: this.archiveRepair } : {})
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
            | 'interactiveTarget' | 'interactiveClose'
            | 'missionId' | 'ignoreBudget' | 'retry' | 'retryOf' | 'retryAttempt' | 'notBefore'
            | 'notBeforeWhy' | 'resumeSessionId' | 'resumedEngine' | 'resumedFrom'>>
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
        const maxGlobal = this.opts.maxConcurrent?.() ?? 2;
        const maxAgent = this.opts.maxConcurrentPerAgent?.() ?? 1;
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
        if (maxAgent > 0 && this.runningCount(task.agentId) >= maxAgent) {
            return {
                code: `concurrency:agent:${task.agentId}`,
                reason: `agent busy (${task.agentName})`
            };
        }
        const quota = asLaunchBlock(this.opts.quotaCheck?.(), 'quota:5h');
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
        if (!task.fromSchedule && !task.fromTrigger
            && task.workflowId === undefined && !task.retryAttempt) { return; }
        const source = task.fromSchedule ? 'schedule' : task.fromTrigger ? 'trigger'
            : task.workflowId !== undefined ? 'workflow' : 'retry policy';
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
            const refused = headlessEffortRefusal(task.engine, task.effort, task.cli);
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
            const id = this.opts.startConsoleTask({
                task, agentId: agent.id, agentName: agent.name,
                cwd: task.workDir ?? agent.dir, prompt: task.prompt
            });
            if (id) {
                task.consoleSessionId = id;
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
                const policy = this.modelArgs(task);
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
        if (target === 'external') {
            fs.mkdirSync(this.outputsDir, { recursive: true });
            const exitFile = path.join(this.outputsDir, `${task.id}.exit`);
            try { fs.rmSync(exitFile, { force: true }); } catch { /* nothing to clear */ }
            task.exitFile = exitFile;
            openExternalTerminal(cwd, command, `AF: ${task.title.slice(0, 30)}`, {
                // `auto-close` is the whole reason `keepOpen` exists: the window
                // is there to be watched, not to be dismissed afterwards.
                keepOpen: close !== 'auto-close',
                exitFile
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
            env: this.opts.getEnv?.(agent.id)
        });
        terminal.show();
        // ‼️ THE EXIT IS A SECOND LINE, NOT `&& exit`. The shell here is
        // whatever the user's default is (pwsh, cmd, bash), and the three do not
        // agree on chaining — but every one of them takes `exit` on its own
        // line, and it runs when the CLI above has returned because that is what
        // a line in a shell means. `onDidCloseTerminal` then finishes the task
        // on the path it has always used.
        terminal.sendText(command, true);
        if (close === 'auto-close') { terminal.sendText('exit', true); }
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
        for (const task of this.tasks) {
            if (task.status !== 'running' || !task.consoleSessionId) { continue; }
            const st = read(task.consoleSessionId);
            if (!st) { continue; }
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
    }

    /** Explicit per-task model (mission member override) beats the policy engine.
     *  Strict charset: a stored value can never smuggle shell syntax. */
    private modelArgs(task: FarmTask): { args: string; reason: string } | undefined {
        if (task.model && modelIdOk(task.model)) {
            return { args: `--model ${task.model}`, reason: `explicit override (${task.model})` };
        }
        return this.opts.modelArgsFor?.(task);
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
        if (perm) { parts.push(`--permission-mode ${perm}`); }
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
    private spawnHeadless(task: FarmTask, agent: AgentInfo): void {
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        const profile = this.cliProfileFor(task);
        const engine = engineOf(task.engine);
        // ‼️ "HAS ITS OWN COMMAND VOCABULARY", not "is per-turn" — see the note in
        // the terminal path above. Claude is the one engine whose headless run is
        // built as a string here; every other one goes through `runArgs`.
        const perTurn = !profile && engine.shape !== 'persistent';
        const policy = profile || perTurn ? undefined : this.modelArgs(task);
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
        fs.writeFileSync(outFile, header, 'utf8');
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
        const child = argv
            ? cp.spawn(engine.exe, argv, {
                cwd: task.workDir ?? agent.dir,
                shell: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, ...engineEnv, ...this.opts.getEnv?.(agent.id) }
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
                env: { ...process.env, ...engineEnv, ...this.opts.getEnv?.(agent.id) }
            });
        if (pipePrompt) {
            try {
                child.stdin?.write(perTurnPrompt);
                child.stdin?.end();
            } catch { /* the close handler reports what the run did */ }
        }
        this.processes.set(task.id, child);
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
        child.stdout?.on('data', chunk => {
            stream.write(chunk);
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
        child.stderr?.on('data', chunk => stream.write(chunk));
        child.on('error', err => {
            stream.write(`\n\n---\n[spawn error] ${String(err)}\n`);
            stream.end();
            this.processes.delete(task.id);
            if (task.status === 'running') { this.finish(task, 'failed'); }
        });
        child.on('close', code => {
            const mins = task.startedAt ? Math.round((Date.now() - task.startedAt) / 60000) : 0;
            stream.write(`\n\n---\nFinished: ${new Date().toLocaleString()} · exit ${code ?? '?'} · ${mins} min\n`);
            stream.end();
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
            if (task.status === 'running') {
                this.finish(task, code === 0 ? 'done' : 'failed');
            }
        });
    }

    private finish(task: FarmTask, status: TaskStatus): void {
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
        if (status === 'failed') { this.maybeScheduleRetry(task); }

        // Workflow chaining takes precedence over plain queue auto-advance.
        if (task.workflowId !== undefined && task.stepIndex !== undefined) {
            const w = this.workflows.find(x => x.id === task.workflowId);
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
        let out = '';
        try { if (task.outputFile) { out = fs.readFileSync(task.outputFile, 'utf8'); } } catch { /* no output yet */ }
        const fallback = this.opts.defaultRetry?.();
        const d = retryDecision(task.retry, {
            attempt: task.retryAttempt ?? 0, output: out, fallback,
            now: Date.now(),
            // ‼️ M-10 — the engine's own answer to "when does the window
            // reopen", asked only here so the pure decision stays pure.
            engineResetAt: this.opts.limitResetAt?.(task.engine),
            // ‼️ M-12 — and what this run's own transcript says it managed, so
            // "nothing was attempted" is a finding rather than an assumption.
            progress: task.progress
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
                noteTaskEvent(task, 'retried', d.why);
                const t = this.addTask(agent, nextTitle, prompt, mode, {
                    projectId: task.projectId,
                    ...(task.engine ? { engine: task.engine } : {}),
                    ...(task.model ? { model: task.model } : {}),
                    ...(task.effort ? { effort: task.effort } : {}),
                    ...(task.permissionMode ? { permissionMode: task.permissionMode } : {}),
                    ...(task.cli ? { cli: task.cli } : {}),
                    ...(task.workDir ? { workDir: task.workDir } : {}),
                    ...(task.priority ? { priority: task.priority } : {}),
                    ...(task.ignoreBudget ? { ignoreBudget: true } : {}),
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
                    // ‼️ M-10 — A RESET-AWARE RETRY CARRIES THE MOMENT ITSELF.
                    // The ordinary path is "a minute from now at the earliest,
                    // plus whatever the policy waits"; the reset path already
                    // has an ABSOLUTE time worked out from the window the engine
                    // published, and re-deriving it from a duration is how
                    // 05:33 becomes 05:34 on the next read. The one-minute floor
                    // stays on the ordinary path only, where it protects against
                    // a policy of zero; a reset that has already passed is meant
                    // to go as soon as the buffer allows.
                    notBefore: d.notBefore ?? Date.now() + Math.max(60_000, d.delayMs),
                    ...(d.notBefore
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

    /** Cheap-model judge: returns PASS/FAIL + reason for a step output. */
    private runJudge(cwd: string, criteria: string, body: string): Promise<{ pass: boolean; reason: string }> {
        return new Promise(resolve => {
            const judgeArgs = (this.opts.judgeArgs?.() ?? '--model claude-haiku-4-5-20251001').trim();
            const prompt = sanitizePrompt(
                `Sen bir kalite denetçisisin. Aşağıdaki ÇIKTI şu ÖLÇÜTÜ karşılıyor mu? ` +
                `ÖLÇÜT: ${criteria} --- ÇIKTI: ${body.slice(0, 4000)} --- ` +
                `Yalnızca tek satır cevap ver: ilk kelime PASS veya FAIL olsun, ardından kısa gerekçe yaz.`);
            cp.exec(`claude ${judgeArgs} -p "${prompt}"`,
                { cwd, timeout: 180_000, windowsHide: true },
                (err, stdout) => {
                    if (err && !stdout) {
                        resolve({ pass: true, reason: 'judge unavailable — passed through (' + String(err.message).slice(0, 80) + ')' });
                        return;
                    }
                    const line = String(stdout).trim().split('\n').find(l => l.trim()) ?? '';
                    const pass = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
                    resolve({ pass, reason: line.slice(0, 200) || '(no verdict)' });
                });
        });
    }

    /**
     * Wave B2 — vision judge: a vision-capable model opens the produced asset
     * file (via its Read tool) and rules PASS/FAIL against the criteria. Runs in
     * the outputs dir so the Read is inside the working directory. Fail-open if
     * the judge can't run, so a misconfig never blocks the pipeline.
     */
    private runVisionJudge(assetFile: string, criteria: string): Promise<{ pass: boolean; reason: string }> {
        return new Promise(resolve => {
            const judgeArgs = (this.opts.judgeArgs?.() ?? '--model claude-haiku-4-5-20251001').trim();
            const prompt = sanitizePrompt(
                `Sen bir görsel kalite denetçisisin. "${path.basename(assetFile)}" dosyasındaki görseli/videoyu Read aracıyla aç ve incele. ` +
                `Şu ÖLÇÜTü karşılıyor mu? ÖLÇÜT: ${criteria}. ` +
                `Yalnızca tek satır cevap ver: ilk kelime PASS veya FAIL olsun, ardından kısa gerekçe yaz.`);
            cp.exec(`claude ${judgeArgs} -p "${prompt}"`,
                { cwd: this.outputsDir, timeout: 180_000, windowsHide: true },
                (err, stdout) => {
                    if (err && !stdout) {
                        resolve({ pass: true, reason: 'vision judge unavailable — passed through (' + String(err.message).slice(0, 80) + ')' });
                        return;
                    }
                    const line = String(stdout).trim().split('\n').filter(l => l.trim()).pop() ?? '';
                    const pass = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
                    resolve({ pass, reason: line.slice(0, 200) || '(no verdict)' });
                });
        });
    }

    /**
     * Wave B2 — verify a media step's asset with the vision judge; on FAIL,
     * re-run the SAME media step (feedback appended to its prompt) up to the
     * configured retry count. Unlike the text path, the retry re-runs the media
     * generator, not an agent task.
     */
    private async verifyMediaThenAdvance(task: FarmTask, w: FarmWorkflow, step: WorkflowStep): Promise<void> {
        const meta = readMediaMetas(this.outputsDir).find(m => m.taskId === task.id);
        const assetFile = meta?.assetFiles.find(f => fs.existsSync(f));
        const attempt = task.attempt ?? 0;
        const { pass, reason } = assetFile
            ? await this.runVisionJudge(assetFile, step.verify!.criteria)
            : { pass: true, reason: 'no downloaded asset to verify — passed through' };
        try {
            fs.appendFileSync(task.outputFile as string,
                `\nVision verify (attempt ${attempt + 1}): ${pass ? 'PASS' : 'FAIL'} — ${reason}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.verified = pass ? 'pass' : 'fail';

        if (pass) {
            this.save();
            this.advanceWorkflow(task, 'done');
            return;
        }
        const retries = step.verify!.retries ?? 1;
        if (attempt < retries) {
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

    private async verifyThenAdvance(task: FarmTask, w: FarmWorkflow, step: WorkflowStep): Promise<void> {
        const agent = this.getAgents().find(a => a.id === task.agentId);
        const body = archivedOutputBody(fs.readFileSync(task.outputFile as string, 'utf8'));
        const attempt = task.attempt ?? 0;
        const { pass, reason } = await this.runJudge(agent?.dir ?? process.cwd(),
            step.verify!.criteria, body);
        try {
            fs.appendFileSync(task.outputFile as string,
                `\nVerify (attempt ${attempt + 1}): ${pass ? 'PASS' : 'FAIL'} — ${reason}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.verified = pass ? 'pass' : 'fail';

        if (pass) {
            this.save();
            this.advanceWorkflow(task, 'done');
            return;
        }
        const retries = step.verify!.retries ?? 1;
        if (attempt < retries) {
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
        over?: { agent?: AgentInfo; title?: string; mode?: TaskMode; autoStart?: boolean }
            & Partial<Pick<FarmTask,
                'engine' | 'model' | 'effort' | 'permissionMode' | 'cli' | 'workDir'
                | 'interactiveTarget' | 'interactiveClose'
                | 'priority' | 'projectId' | 'ignoreBudget'>>
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
        const baseTitle = (over?.title ?? task.title).replace(/ \(retry \d+\)$/i, '');
        const attempt = (task.attempt ?? 0) + 1;
        // ‼️ THE RETRY RUNS THE WAY THE ORIGINAL RAN. Only `projectId` was
        // carried, so a task launched on haiku at low effort came back as a
        // retry with no --model and no --effort at all: the same prompt on a
        // different, more expensive command line, silently.
        const copy = this.addTask(agent, `${baseTitle} (retry ${attempt})`, newPrompt ?? task.prompt,
            over?.mode ?? task.mode,
            {
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
        copy.cli = over?.cli ?? task.cli;
        copy.workDir = over?.workDir ?? task.workDir;
        // ‼️ M-26 — a retry runs where the original ran, unless the form said
        // otherwise. "Run that again, but in an OS terminal this time" is the
        // whole reason the form can override it; keeping the original's answer
        // is the reason the fallback is the task's own.
        copy.interactiveTarget = over?.interactiveTarget ?? task.interactiveTarget;
        copy.interactiveClose = over?.interactiveClose ?? task.interactiveClose;
        copy.missionId = task.missionId;
        copy.ignoreBudget = over?.ignoreBudget ?? task.ignoreBudget;
        noteTaskEvent(copy, 'retried', `attempt ${attempt} of "${task.title}"`);
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
        const w = this.workflows.find(x => x.id === task.workflowId);
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
        this.templates = this.templates.filter(x => x.id !== t.id);
        this.save();
    }

    // ---------- workflows ----------

    addWorkflow(title: string, steps: WorkflowStep[]): FarmWorkflow {
        const workflow: FarmWorkflow = { id: newId(), title, steps };
        this.workflows.push(workflow);
        this.save();
        return workflow;
    }

    deleteWorkflow(w: FarmWorkflow): void {
        this.workflows = this.workflows.filter(x => x.id !== w.id);
        this.save();
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
                }))
            });
        }
        runs.sort((a, b) => (b.steps[0]?.startedAt ?? 0) - (a.steps[0]?.startedAt ?? 0));
        return runs;
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
    runWorkflow(w: FarmWorkflow, opts?: { projectId?: string }): string | undefined {
        if (!w.steps.length) { return undefined; }
        const runId = newId();
        this.runCounts.set(runId, 0);
        this.workflowEnds.delete(runId);
        // ‼️ M-18 — WHOSE WORK THIS CHAIN IS, stated by the caller rather than
        // inferred from the window. A chain started by a mission is work for
        // the MISSION's project, and a run that fires an hour after anybody
        // looked at this window has no current project to borrow — the same
        // reason a mission's delegations pass their own key.
        if (opts?.projectId) { this.workflowProjects.set(runId, opts.projectId); }
        this.routeToStep(w, 0, {}, runId);
        return runId;
    }

    /** Set only for a run whose caller named a project; every other run keeps
     *  inheriting from its own first task, exactly as it did. */
    private workflowProjects = new Map<string, string>();

    /**
     * Why a run ended when the tasks alone cannot say — the loop guard and a
     * stopped chain leave rows that look exactly like a chain still waiting for
     * its next step. In memory only, and deliberately: after a reload the
     * derivation below is what answers, and it answers honestly rather than
     * from a record that survived its own subject.
     */
    private workflowEnds = new Map<string, { status: WorkflowRunStatus; reason?: string; stepIndex?: number; at: number }>();

    private endWorkflowRun(runId: string, status: WorkflowRunStatus, reason: string, stepIndex?: number): void {
        this.workflowEnds.set(runId, {
            status, reason, at: Date.now(),
            ...(stepIndex !== undefined ? { stepIndex } : {})
        });
    }

    /**
     * The state of one workflow run, derived from its tasks. Undefined when no
     * task of that run exists — which is the honest answer for a run id that
     * was never started, and the same answer for one whose rows were purged.
     */
    workflowRunState(runId: string): WorkflowRunState | undefined {
        const tasks = this.tasks.filter(t => t.workflowRunId === runId);
        if (!tasks.length) { return undefined; }
        tasks.sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0) || (a.startedAt ?? 0) - (b.startedAt ?? 0));
        const w = this.workflows.find(x => x.id === tasks[0].workflowId);
        const steps: WorkflowRunStep[] = tasks.map(t => ({
            index: t.stepIndex ?? 0,
            title: t.title,
            agentName: t.agentName,
            status: t.status,
            taskId: t.id,
            ...(t.outputFile ? { outputFile: t.outputFile } : {}),
            ...(t.costUSD !== undefined ? { costUSD: t.costUSD } : {}),
            ...(t.tokens !== undefined ? { tokens: t.tokens } : {})
        }));
        const live = tasks.some(t => t.status === 'queued' || t.status === 'running');
        const end = this.workflowEnds.get(runId);
        // ‼️ THE TASKS OUTRANK THE MEMO. Something still running means running,
        // whatever an earlier ending said — a resumed chain re-enters an id that
        // has already ended once, and a memo that could overrule the rows would
        // report it finished while it was working.
        let status: WorkflowRunStatus;
        if (live) {
            status = 'running';
        } else if (end) {
            status = end.status;
        } else if (tasks.some(t => t.status === 'failed' || t.status === 'cancelled')) {
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
            steps,
            costUSD: tasks.reduce((a, t) => a + (t.costUSD ?? 0), 0),
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

    private substitute(prompt: string, handoff: Handoff): string {
        let out = prompt.split(PREV_OUTPUT_PLACEHOLDER).join(handoff.file ?? '');
        out = out.split('{prev_text}').join((handoff.text ?? '').slice(0, 1500));
        out = out.replace(/\{prev_json\.([\w.]+)\}/g, (_m, fieldPath: string) => {
            let cur: unknown = handoff.json;
            for (const key of fieldPath.split('.')) {
                if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
                    cur = (cur as Record<string, unknown>)[key];
                } else { return ''; }
            }
            return typeof cur === 'string' ? cur : JSON.stringify(cur ?? '');
        });
        return out;
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
    private routeToStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
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
        this.startWorkflowStep(w, index, handoff, runId);
    }

    private startWorkflowStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        const step = w.steps[index];
        this.handoffs.set(runId, handoff);

        if (step.webhook) {
            this.runWebhookStep(w, index, handoff, runId);
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
        const agent = this.getAgents().find(a => a.id === step.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — agent "${step.agentName}" not found.`);
            return;
        }
        const prompt = this.substitute(step.prompt, handoff);
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt, step.mode,
            {
                workflowId: w.id, workflowRunId: runId, stepIndex: index,
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
        const declared = this.workflowProjects.get(runId);
        if (declared) { return { projectId: declared }; }
        const first = this.tasks.find(t => t.workflowRunId === runId);
        return first ? { projectId: first.projectId } : {};
    }

    /** B3: a chain step that is an HTTP call; the response becomes the next handoff. */
    private runWebhookStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        const step = w.steps[index];
        const hook = step.webhook!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));
        const url = resolve(hook.url);
        const method = (hook.method ?? 'POST').toUpperCase();
        const body = hook.body ? resolve(hook.body) : undefined;

        const task: FarmTask = {
            id: newId(),
            agentId: '',
            agentName: 'webhook',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt: `${method} ${hook.url}`,
            mode: 'headless',
            status: 'running',
            createdAt: Date.now(),
            startedAt: Date.now(),
            workflowId: w.id,
            workflowRunId: runId,
            stepIndex: index
        };
        this.tasks.push(task);
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

    /** C1: a chain step that generates media via the fal.ai queue API. */
    private async runMediaStep(
        w: FarmWorkflow, index: number, handoff: Handoff, runId: string,
        retry?: { attempt: number; feedback: string }
    ): Promise<void> {
        const step = w.steps[index];
        const media = step.media!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));

        const task: FarmTask = {
            id: newId(),
            agentId: '',
            agentName: 'media',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}` + (retry ? ` (retry ${retry.attempt})` : ''),
            prompt: `${media.model}`,
            mode: 'headless',
            status: 'running',
            createdAt: Date.now(),
            startedAt: Date.now(),
            attempt: retry?.attempt,
            workflowId: w.id,
            workflowRunId: runId,
            stepIndex: index
        };
        this.tasks.push(task);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        const provider = providerFor(media.model);
        const auth = (this.opts.mediaAuth?.(provider.id) ?? '').trim();
        const input = retry ? injectMediaFeedback(resolve(media.input), retry.feedback) : resolve(media.input);
        const info = {
            model: media.model, stepTitle: step.title, workflowTitle: w.title,
            input, projectId: media.projectId, sceneId: media.sceneId
        };

        if (!auth || auth.includes('{secret:')) {
            await this.completeMediaTask(task, info, {
                ok: false,
                error: `Media auth missing — store your ${provider.label} key with "Agent Farm: Set Secret…" as ${provider.secretHint}.`,
                assetUrls: []
            });
            return;
        }

        const timeoutMs = (media.timeoutMin ?? 10) * 60_000;
        let result: MediaResult;
        try {
            result = await provider.run(media.model, input, auth, {
                baseUrl: this.opts.mediaBaseUrl?.(provider.id),
                timeoutMs,
                pollMs: this.opts.mediaPollMs?.(),
                // F2: persist the poll URLs the moment the job is queued, so a
                // window close mid-render reattaches instead of losing the job.
                onQueued: job => {
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
            result = { ok: false, error: `provider error: ${String(e).slice(0, 300)}`, assetUrls: [] };
        }
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
            projectId?: string; sceneId?: string; note?: string;
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
        const estCost = estimateMediaCost(info.model, result.response,
            this.opts.mediaPricing?.() ?? DEFAULT_MEDIA_PRICING);
        task.mediaCost = estCost;

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
            source: 'fal'
        };
        try {
            fs.writeFileSync(path.join(this.outputsDir, `${task.id}.media.json`),
                JSON.stringify(meta, null, 2), 'utf8');
        } catch { /* gallery meta is best-effort */ }
        writeOut(true, '', result.response, assets, estCost);
    }

    /** F2: tasks whose media job survived the reload (collected at load, polled from the ctor). */
    private reattachQueue: FarmTask[] = [];

    /** F2: resume polling a media job whose window died mid-render. */
    private async reattachMediaTask(task: FarmTask): Promise<void> {
        const job = task.mediaJob!;
        const w = this.workflows.find(x => x.id === task.workflowId);
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
        const url = this.substitute(browser.url, handoff);
        const goal = this.substitute(browser.goal, handoff);
        const allowHosts = (browser.allowHosts?.length ? browser.allowHosts : undefined)
            ?? this.opts.browserAllowHosts?.() ?? [];

        const fail = (why: string) => {
            void vscode.window.showWarningMessage(
                `Agent Farm: browser step "${step.title}" blocked — ${why}`);
            // Synthetic failed task so onFail routing still applies.
            const task: FarmTask = {
                id: newId(), agentId: step.agentId, agentName: step.agentName,
                title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
                prompt: `browser: ${url}`, mode: 'headless', status: 'failed',
                createdAt: Date.now(), startedAt: Date.now(), endedAt: Date.now(),
                workflowId: w.id, workflowRunId: runId, stepIndex: index
            };
            this.tasks.push(task);
            this.save();
            this.advanceWorkflow(task, 'failed');
        };

        if (!hostAllowed(url, allowHosts)) {
            fail(allowHosts.length
                ? `"${url}" is outside the allowlist (${allowHosts.join(', ')})`
                : 'no host allowlist configured (set agentFarm.browserAllowHosts or the step\'s allowHosts)');
            return;
        }
        if (this.opts.confirmBrowser) {
            const ok = await this.opts.confirmBrowser({ title: step.title, url, goal });
            if (!ok) { fail('not approved'); return; }
        }
        const agent = this.getAgents().find(a => a.id === step.agentId);
        if (!agent) {
            fail(`agent "${step.agentName}" not found`);
            return;
        }
        const prompt = buildBrowserPrompt(url, goal, allowHosts);
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt, 'headless',
            {
                workflowId: w.id, workflowRunId: runId, stepIndex: index,
                ...this.runProject(runId),
                // A browser step is still a step, and it runs on the engine the
                // step names (X-35) — see the note on the ordinary step path.
                ...runExtras(step)
            });
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
        const task: FarmTask = {
            id: newId(), agentId: '', agentName: 'approval',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt: message || '(waiting for approval)', mode: 'headless', status: 'running',
            createdAt: Date.now(), startedAt: Date.now(),
            workflowId: w.id, workflowRunId: runId, stepIndex: index
        };
        this.tasks.push(task);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        // No gate wired (headless service / tests) = auto-approve so chains don't hang.
        const ok = this.opts.confirmApproval
            ? await this.opts.confirmApproval({ title: step.title, message })
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

        const task: FarmTask = {
            id: newId(), agentId: '', agentName: 'select',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt: message || `(choose ${candidates.length} candidate asset(s))`,
            mode: 'headless', status: 'running',
            createdAt: Date.now(), startedAt: Date.now(),
            workflowId: w.id, workflowRunId: runId, stepIndex: index
        };
        this.tasks.push(task);
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
            chosen = await this.opts.confirmSelection({
                title: step.title, message, min, max,
                candidates: candidates.map(c => ({ taskId: c.taskId, title: c.title, url: c.url, file: c.file, kind: c.kind }))
            });
        } else {
            chosen = candidates.map(c => c.url); // no UI wired → keep all
        }

        const cancelled = chosen === null;
        const selected = chosen ?? [];
        if (!cancelled) { recordSelection(this.outputsDir, metas, selected); }

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
        const w = this.workflows.find(x => x.id === task.workflowId);
        if (!w) { return; }
        const runId = task.workflowRunId ?? task.workflowId ?? '';
        // Single chokepoint for parallel fan-in: a branch of the active group
        // collects here instead of advancing the run on its own.
        const group = this.parallelGroups.get(runId);
        if (group && task.stepIndex !== undefined
            && task.stepIndex >= group.start && task.stepIndex <= group.end) {
            this.onParallelBranchDone(w, task, status);
            return;
        }
        const stepIndex = task.stepIndex ?? 0;
        if (status === 'done') {
            this.routeToStep(w, stepIndex + 1, this.computeHandoff(task), runId);
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
        this.routeToStep(w, nextIndex, this.computeHandoff(task), runId);
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
        this.triggers = this.triggers.filter(x => x.id !== t.id);
        this.save();
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
        this.schedules = this.schedules.filter(x => x.id !== s.id);
        this.save();
    }

    /** Manual "Run Now": the master switch still applies (paused means paused),
     *  but quiet hours and the precondition do not — the user pressing a button
     *  is a deliberate act, not an unattended wake-up. */
    runScheduleNow(s: FarmSchedule): void {
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
        // dimensions from the same place.
        const task = this.addTask(agent, s.title, s.prompt, s.mode,
            { fromSchedule: s.id, projectId: s.projectId || undefined, ...runExtras(s) });
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
