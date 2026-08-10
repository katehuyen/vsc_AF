import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { describePrecondition, Precondition, rollupAutomationLog } from '../core/automation';
import { nextOccurrences } from '../core/forecast';
import { NeedItem } from '../core/needs';
import { EFFORT_CHOICES, modelChoices, PERMISSION_CHOICES } from '../core/launch';
import { EngineModels } from '../core/models';
import {
    FarmSchedule, FarmTask, FarmTemplate, FarmTrigger, FarmWorkflow, MissedPolicy, newId,
    RunDimensions, ScheduleKind, TaskManager, TaskMode, WorkflowStep
} from '../core/tasks';
import { TaskRecord } from '../core/taskstats';
import { TriggerManager } from '../core/triggers';
import { buildTriggerStats, describeTriggerStat } from '../core/triggerstats';
import { handleAfNav, htmlShell } from './base';
import { full as afFull } from '../core/aftime';

/**
 * Tasks — the agent-activity CONTROL PANEL.
 *
 * The page is built on the one distinction that actually exists in the data:
 *
 *   PLAN — everything that DEFINES work: schedules, triggers, workflows,
 *          templates. Four different objects that the user manages the same
 *          way (switch it, guard it, pick its model, run it, edit it, delete
 *          it), so they belong in ONE table with a kind column — not scattered
 *          across sections named after their implementation.
 *   RUN  — everything that IS or WAS running. The proof of what the plans
 *          actually did.
 *
 * Management comes first and gets the richer surface: search, per-column
 * filters that are always VISIBLE as removable chips (a filter you forgot you
 * set is worse than no filter), grouping, bulk switching, add/remove, and
 * inline detail so nothing opens a mystery second page.
 *
 * Analytics deliberately does NOT live here — 30-day throughput and forecasts
 * are reading, not managing (see taskAnalyticsPanel).
 */

export type TasksTab = 'plan' | 'run';
/** Back-compat: older entry points still pass the pre-redesign section names. */
export type TasksSection = TasksTab | 'board' | 'automations' | 'reusables' | 'analytics';

export interface TasksDeps {
    extensionUri: vscode.Uri;
    manager: TaskManager;
    getAgents(): AgentInfo[];
    /**
     * ‼️ EVERYTHING A SESSION IS STARTED WITH, SO A TASK CAN BE TOO.
     *
     * The page's own New-task form offers the same dimensions the Start
     * Session… picker does — model, effort, permission mode — plus the ones
     * only a task has (which project, which CLI, queue priority, workdir).
     * They are DEPS rather than constants because the model list is the user's
     * own `agentFarm.modelAliases` knowledge base and the CLI list is their
     * `cliProfiles`: a picker that hard-coded either would go out of date the
     * first time they edited it.
     */
    modelAliases(): string[];
    /** S-20 — model/effort rows PER ENGINE, read from what each engine offers
     *  today. It matters most here: nobody is sitting in front of a task, so a
     *  `--model` the engine rejects surfaces hours later in an archive file. */
    engineModels?(): Record<string, EngineModels>;
    launchDefaults(): { engine?: string; model?: string; effort?: string; permissionMode?: string };
    /** X-18 — which engines this machine can run, for the form's engine row.
     *  Optional so a caller written before engines existed still type-checks;
     *  absent means the form offers no engine box and every task is claude's. */
    engines?(): { id: string; label: string; ready: boolean; next: string; billing: string }[];
    cliProfiles(): { name: string; headless?: string }[];
    /** Projects a task can be filed under, and the window's current one. */
    projects(): { id: string; name: string; icon?: string }[];
    activeProjectId(): string | undefined;
    /**
     * Production scenes a MEDIA workflow step can tie its assets to, as
     * `projectId` or `projectId/sceneId`. Optional because a farm with no
     * production manifest has none, and a picker with one dead entry is worse
     * than no picker — the field is simply not drawn.
     */
    scenes?: () => { id: string; label: string }[];
    /** live tasks merged with the finished-task archive */
    allRecords(): TaskRecord[];
    /** urgent Needs-You rows (permission waits + browser approvals). */
    buildWaiting(): NeedItem[];
    /** natural-language command bar with prefilled text. */
    runCommandText(text: string): Promise<void>;
    settleApproval(id: string, ok: boolean): boolean;
    onDidChangeNeeds: vscode.Event<void>;
    triggerManager?: TriggerManager;
    forecastDays(): number;
    limits(): { global: number; perAgent: number };
    /** Export-MD remembers the last save folder (shared farm-wide). */
    lastExportDir?: () => string | undefined;
    setLastExportDir?: (dir: string) => void;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 3600 * 1000;

/** One row of the PLAN table, whatever kind of definition it came from. */
interface PlanRow {
    id: string;
    kind: 'schedule' | 'trigger' | 'workflow' | 'template';
    title: string;
    /** when/how it fires, in the user's words */
    when: string;
    nextAt?: number;
    agentName: string;
    model: string;
    guard: string;
    hasGuard: boolean;
    /** false for definitions with no on/off state (workflows, templates) */
    switchable: boolean;
    enabled: boolean;
    cost7d: number;
    runs7d: number;
    skipped7d: number;
    skipRate: number;
    lastRunAt?: number;
    /** short, human: what happened last time */
    lastNote: string;
    /** machine-readable problems, for the "only problems" filter and badges */
    issues: string[];
    /** everything the expanded row shows — no second page needed */
    detail: {
        prompt: string;
        target: string;
        timing: string;
        steps: string[];
        missed: string;
    };
}

interface RunRow {
    id: string;
    title: string;
    agentName: string;
    mode: string;
    status: string;
    /** where it came from: schedule / trigger / workflow / manual */
    source: string;
    sourceKind: string;
    when: number;
    durMin?: number;
    detail: string;
    costUSD?: number;
    verified?: string;
    hasOutput: boolean;
    outputFile?: string;
    sessionFile?: string;
    prompt: string;
}

function scheduleWhen(s: FarmSchedule): string {
    const hm = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
    if (s.kind === 'daily') { return `every day ${hm}`; }
    if (s.kind === 'weekly') { return `${DOW[s.dow ?? 0]} ${hm}`; }
    return s.onceAt ? `once · ${afFull(s.onceAt)}` : 'once';
}

function triggerWhen(t: FarmTrigger): string {
    if (t.type === 'watch') { return `on change · …${(t.watchPath ?? '').slice(-30)}`; }
    if (t.type === 'webhook') { return `on POST · /trigger/…${(t.token ?? '').slice(-6)}`; }
    return `on ${t.hookEvent}${t.hookAgent ? ` @${t.hookAgent}` : ''}`;
}

function triggerTarget(t: FarmTrigger): string {
    if (t.action.kind === 'workflow') { return 'runs a workflow'; }
    if (t.action.kind === 'dispatch') { return 'dispatch → best agent'; }
    return `runs on ${t.action.agentName}`;
}

/** Assemble every work DEFINITION into one shape the table can manage. */
function buildPlan(deps: TasksDeps, now: number): PlanRow[] {
    const m = deps.manager;
    const records = deps.allRecords();
    const weekAgo = now - 7 * DAY_MS;

    // Real spend per definition. The data always existed (FarmTask.costUSD +
    // fromSchedule/fromTrigger); it was simply never added up, which is how a
    // trigger could burn $70 in a week and still look healthy.
    const spend = new Map<string, { usd: number; runs: number; lastAt?: number }>();
    for (const r of records) {
        const src = r.fromSchedule ?? r.fromTrigger;
        if (!src) { continue; }
        const at = r.endedAt ?? r.createdAt;
        const cur = spend.get(src) ?? { usd: 0, runs: 0 };
        if (at >= weekAgo) {
            cur.usd += (r.costUSD ?? 0) + (r.mediaCost ?? 0);
            cur.runs++;
        }
        if (!cur.lastAt || at > cur.lastAt) { cur.lastAt = at; }
        spend.set(src, cur);
    }
    const roll = rollupAutomationLog(m.automationLog, { now, windowMs: 7 * DAY_MS });
    const trigStats = new Map(buildTriggerStats(m.triggers, records, { now }).map(s => [s.id, s]));

    const stats = (id: string) => {
        const r = roll.get(id);
        const s = spend.get(id);
        return {
            cost7d: s?.usd ?? 0,
            runs7d: s?.runs ?? 0,
            skipped7d: r?.skipped ?? 0,
            skipRate: r ? Math.round(r.skipRate * 100) : 0,
            lastRunAt: r?.lastFiredAt ?? s?.lastAt,
            lastReason: r?.lastReason ?? ''
        };
    };

    const rows: PlanRow[] = [];

    for (const s of m.schedules) {
        const st = stats(s.id);
        const issues: string[] = [];
        if (s.enabled && !s.fireIf?.kind) { issues.push('no-guard'); }
        if (s.pendingRunKey) { issues.push('deferred'); }
        if (s.enabled && !st.lastRunAt) { issues.push('never-ran'); }
        rows.push({
            id: s.id, kind: 'schedule', title: s.title,
            when: scheduleWhen(s),
            nextAt: s.enabled ? nextOccurrences(s, now, 35)[0] : undefined,
            agentName: s.agentName,
            model: s.model ?? '',
            guard: describePrecondition(s.fireIf),
            hasGuard: !!s.fireIf?.kind,
            switchable: true, enabled: s.enabled,
            ...st,
            lastNote: st.lastReason,
            issues,
            detail: {
                prompt: s.prompt,
                target: `runs on ${s.agentName} · ${s.mode}`,
                timing: `${scheduleWhen(s)} · missed → ${s.missed ?? 'skip'}`,
                steps: [],
                missed: s.missed ?? 'skip'
            }
        });
    }

    for (const t of m.triggers) {
        const st = stats(t.id);
        const ts = trigStats.get(t.id);
        const armed = t.type !== 'watch' || !!deps.triggerManager?.isArmed(t.id);
        const issues: string[] = [];
        if (t.enabled && !t.fireIf?.kind) { issues.push('no-guard'); }
        if (t.enabled && !armed) { issues.push('path-missing'); }
        if (ts?.alwaysFails) { issues.push('always-fails'); }
        if (ts?.neverFired) { issues.push('never-ran'); }
        rows.push({
            id: t.id, kind: 'trigger', title: t.title,
            when: triggerWhen(t),
            agentName: t.action.kind === 'task' ? t.action.agentName : '',
            model: t.action.kind === 'workflow' ? '' : (t.action.model ?? ''),
            guard: describePrecondition(t.fireIf),
            hasGuard: !!t.fireIf?.kind,
            switchable: true, enabled: t.enabled,
            ...st,
            lastNote: t.lastSkipReason && !st.lastReason ? t.lastSkipReason
                : (st.lastReason || (ts ? describeTriggerStat(ts) : '')),
            issues,
            detail: {
                prompt: t.action.kind === 'workflow' ? '' : t.action.prompt,
                target: triggerTarget(t),
                timing: `debounce ${t.debounceSec}s · cooldown ${t.cooldownSec}s · max ${t.maxPerHour || '∞'}/h`,
                steps: [],
                missed: ''
            }
        });
    }

    for (const w of m.workflows) {
        rows.push({
            id: w.id, kind: 'workflow', title: w.title,
            when: 'when you run it (or a trigger does)',
            agentName: '', model: '', guard: '', hasGuard: false,
            switchable: false, enabled: true,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: `${w.steps.length} step(s)`,
            issues: w.steps.length ? [] : ['empty'],
            detail: {
                prompt: '', target: `${w.steps.length} step chain`, timing: '',
                steps: w.steps.map((s, i) =>
                    `${i + 1}. ${s.title}${s.parallel ? ' ∥' : ''} — ${s.agentName || (s.approval ? 'approval gate' : s.select ? 'selection gate' : s.webhook ? 'webhook' : s.media ? 'media' : s.browser ? 'browser' : s.mode)}`),
                missed: ''
            }
        });
    }

    for (const t of m.templates) {
        rows.push({
            id: t.id, kind: 'template', title: t.title,
            when: 'when you run it',
            agentName: t.agentName ?? '', model: '', guard: '', hasGuard: false,
            switchable: false, enabled: true,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '',
            issues: [],
            detail: {
                prompt: t.prompt,
                target: t.agentName ? `runs on ${t.agentName} · ${t.mode}` : `any agent · ${t.mode}`,
                timing: '', steps: [], missed: ''
            }
        });
    }

    return rows;
}

function buildRuns(deps: TasksDeps, now: number): RunRow[] {
    const m = deps.manager;
    const schedTitles = new Map(m.schedules.map(s => [s.id, s.title]));
    const trigTitles = new Map(m.triggers.map(t => [t.id, t.title]));
    const wfTitles = new Map(m.workflows.map(w => [w.id, w.title]));

    const row = (t: FarmTask): RunRow => {
        const durMin = t.startedAt
            ? Math.max(0, Math.round(((t.endedAt ?? now) - t.startedAt) / 60000))
            : undefined;
        const [sourceKind, source] =
            t.fromSchedule ? ['schedule', schedTitles.get(t.fromSchedule) ?? 'schedule']
                : t.fromTrigger ? ['trigger', trigTitles.get(t.fromTrigger) ?? 'trigger']
                    : t.workflowId !== undefined ? ['workflow', wfTitles.get(t.workflowId) ?? 'workflow']
                        : ['manual', 'you'];
        return {
            id: t.id, title: t.title, agentName: t.agentName, mode: t.mode,
            status: t.status === 'queued' && t.autoStart ? 'parked' : t.status,
            source, sourceKind,
            when: t.endedAt ?? t.startedAt ?? t.createdAt,
            durMin,
            detail: t.status === 'queued' && t.deferredReason ? t.deferredReason : '',
            costUSD: t.costUSD,
            verified: t.verified,
            hasOutput: !!t.outputFile,
            outputFile: t.outputFile,
            sessionFile: t.costSessionFile,
            prompt: t.prompt.length > 600 ? t.prompt.slice(0, 599) + '…' : t.prompt
        };
    };

    const live = m.tasks.filter(t => t.status === 'running' || t.status === 'queued');
    const finished = m.tasks
        .filter(t => t.status === 'done' || t.status === 'failed' || t.status === 'cancelled')
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
        .slice(0, 60);
    return [...live, ...finished].map(row);
}

function buildData(deps: TasksDeps, tab?: TasksTab): Record<string, unknown> {
    const m = deps.manager;
    const now = Date.now();
    const plan = buildPlan(deps, now);
    const runs = buildRuns(deps, now);
    const limits = deps.limits();
    const gateNow = m.automationGate(new Date(now));
    const roll = rollupAutomationLog(m.automationLog, { now, windowMs: 7 * DAY_MS });

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const t0 = dayStart.getTime();
    const records = deps.allRecords();

    return {
        generatedAt: now,
        tab,
        gate: {
            paused: !!m.automation.paused,
            pausedUntil: m.automation.pausedUntil,
            pauseReason: m.automation.pauseReason ?? '',
            quietFrom: m.automation.quietFrom ?? '',
            quietTo: m.automation.quietTo ?? '',
            blocked: !!gateNow,
            blockKind: gateNow?.kind,
            blockReason: gateNow?.reason ?? ''
        },
        summary: {
            running: m.tasks.filter(t => t.status === 'running').length,
            runLimit: limits.global,
            queued: m.tasks.filter(t => t.status === 'queued').length,
            needsYou: deps.buildWaiting().length,
            plansOn: plan.filter(p => p.switchable && p.enabled).length,
            plansSwitchable: plan.filter(p => p.switchable).length,
            doneToday: records.filter(r => r.status === 'done' && (r.endedAt ?? 0) >= t0).length,
            failedToday: records.filter(r => r.status === 'failed' && (r.endedAt ?? 0) >= t0).length,
            cost7d: plan.reduce((a, p) => a + p.cost7d, 0),
            savedWakeups7d: [...roll.values()].reduce((a, b) => a + b.skipped, 0),
            issues: plan.filter(p => p.issues.length && (p.enabled || !p.switchable)).length
        },
        plan,
        runs,
        agents: deps.getAgents().map(a => a.name),
        perAgentLimit: limits.perAgent,
        // ‼️ THE TRIGGER FORM'S "run a workflow" OPTION WAS NEVER DRAWN. The
        // page reads `DATA.workflows` to build it and this object never carried
        // the key, so the option list was always empty — and editing a trigger
        // that already ran a workflow fell back to the first option, quietly
        // turning it into a task trigger on the next save.
        workflows: m.workflows.map(w => ({ id: w.id, title: w.title, steps: w.steps.length })),
        // Production scenes a media step can file its assets under.
        scenes: deps.scenes ? deps.scenes() : [],
        // ---- what the New-task form offers. One vocabulary with the session
        // launcher (core/launch.ts), so "run it on opus at low effort" means the
        // same thing whether you start a session or queue a task.
        launch: {
            models: modelChoices(deps.modelAliases()),
            efforts: EFFORT_CHOICES,
            engineModels: deps.engineModels?.() ?? null,
            permissions: PERMISSION_CHOICES,
            // ‼️ X-18 — the engine axis reaches unattended work too, and this is
            // where it matters MOST: nobody is sitting in front of a task, so an
            // engine that cannot run produces an output file full of a shell
            // error discovered hours later. The row carries `ready` and `next`
            // so the form can refuse it the same way every other surface does.
            engines: deps.engines ? deps.engines() : [],
            defaults: deps.launchDefaults(),
            // Only offered when the user actually has profiles: a picker whose
            // only entry is "claude" is a question with one answer.
            clis: deps.cliProfiles().filter(p => p?.name && p.headless).map(p => ({
                name: p.name, detail: p.headless ?? ''
            })),
            projects: deps.projects().map(p => ({ id: p.id, name: p.name, icon: p.icon ?? '' })),
            // The window's own project — the form OPENS on it, because that is
            // what a task made here would have been stamped with anyway.
            activeProjectId: deps.activeProjectId() ?? ''
        }
    };
}

/**
 * ‼️ ONE WORKFLOW STEP, BOTH WAYS — Faz 2 of U-9.
 *
 * The page holds a flat draft (`stype`/`whUrl`/`mModel`…) because that is what
 * a set of form fields is; the manager holds a `WorkflowStep`, whose shape is
 * decided by WHICH optional sub-object is present. The translation lives here,
 * next to the manager, exactly like the schedule and trigger seeds above — the
 * page never learns the model's shape and the model never learns the form's.
 */
const STEP_SYNTHETIC = ['webhook', 'media', 'approval', 'select'];

function stepSeed(s: WorkflowStep): Record<string, unknown> {
    const stype = s.webhook ? 'webhook' : s.media ? 'media' : s.browser ? 'browser'
        : s.approval ? 'approval' : s.select ? 'select' : 'agent';
    const hdr = Object.entries(s.webhook?.headers ?? {})[0];
    const scene = s.media?.projectId
        ? s.media.projectId + (s.media.sceneId ? '/' + s.media.sceneId : '')
        : '';
    return {
        stype,
        title: s.title,
        // A webhook step's `agentName` is the literal word "webhook" — a label,
        // not an agent. Handing it to the picker would offer a name that is not
        // in the list, and the browser would silently show the first one.
        agent: STEP_SYNTHETIC.includes(s.agentName) ? '' : (s.agentName ?? ''),
        prompt: s.prompt ?? '',
        smode: s.mode === 'interactive' ? 'interactive' : 'headless',
        onFail: s.onFail === undefined || s.onFail === 'stop' ? 'stop'
            : s.onFail === 'continue' ? 'continue' : 'goto',
        onFailStep: typeof s.onFail === 'number' ? s.onFail : 1,
        runIf: s.runIf ?? '',
        contract: s.outputContract === 'json' ? 'json' : 'text',
        verifyCriteria: s.verify?.criteria ?? '',
        verifyRetries: s.verify?.retries ?? 1,
        parallel: !!s.parallel,
        whUrl: s.webhook?.url ?? '',
        whMethod: s.webhook?.method ?? 'POST',
        whBody: s.webhook?.body ?? '',
        whHeader: hdr ? `${hdr[0]}: ${hdr[1]}` : '',
        whPoll: !!s.webhook?.poll,
        whPollUrl: s.webhook?.poll?.urlField ?? '',
        whStatusField: s.webhook?.poll?.statusField ?? 'status',
        whDone: s.webhook?.poll?.doneRegex ?? 'succeeded|completed|complete|done|success',
        whInterval: s.webhook?.poll?.intervalSec ?? 3,
        mModel: s.media?.model ?? 'fal-ai/flux/schnell',
        mInput: s.media?.input ?? '{"prompt": "{prev_text}"}',
        mScene: scene,
        bUrl: s.browser?.url ?? '',
        bGoal: s.browser?.goal ?? '',
        bHosts: (s.browser?.allowHosts ?? []).join(', '),
        apMsg: s.approval?.message ?? '',
        selMsg: s.select?.message ?? '',
        selMin: s.select?.min ?? 1,
        selMax: s.select?.max ?? 0
    };
}

/** The other direction. Returns the step, or the sentence the form should say
 *  about why it could not be built. */
export function stepFromDraft(
    raw: Record<string, unknown>,
    agents: { id: string; name: string }[],
    n: number
): { step?: WorkflowStep; error?: string } {
    const str = (k: string): string => String(raw[k] ?? '').trim();
    const num = (k: string, d: number): number => {
        const v = Number(raw[k]);
        return Number.isFinite(v) ? Math.trunc(v) : d;
    };
    const stype = str('stype') || 'agent';
    const title = str('title');
    if (!title) { return { error: `Step ${n} has no title.` }; }
    const mode: TaskMode = str('smode') === 'interactive' ? 'interactive' : 'headless';
    const chain: Partial<WorkflowStep> = {
        onFail: str('onFail') === 'continue' ? 'continue'
            : str('onFail') === 'goto' ? Math.max(1, num('onFailStep', 1)) : undefined,
        runIf: str('runIf') || undefined,
        parallel: raw.parallel === true ? true : undefined
    };
    const verify = str('verifyCriteria')
        ? { criteria: str('verifyCriteria'), retries: Math.max(1, num('verifyRetries', 1)) }
        : undefined;
    const named = (label: string): Pick<WorkflowStep, 'agentId' | 'agentName' | 'prompt' | 'mode'> =>
        ({ agentId: '', agentName: label, prompt: '', mode: 'headless' });

    if (stype === 'webhook') {
        if (!str('whUrl')) { return { error: `Step ${n} ("${title}") is a webhook with no URL.` }; }
        const headers: Record<string, string> = {};
        const h = str('whHeader');
        const at = h.indexOf(':');
        if (at > 0) { headers[h.slice(0, at).trim()] = h.slice(at + 1).trim(); }
        const poll = raw.whPoll === true && str('whPollUrl')
            ? {
                urlField: str('whPollUrl'),
                statusField: str('whStatusField') || undefined,
                doneRegex: str('whDone') || undefined,
                intervalSec: Math.max(1, num('whInterval', 3))
            }
            : undefined;
        if (raw.whPoll === true && !str('whPollUrl')) {
            return { error: `Step ${n} ("${title}") polls, but does not say which field holds the poll URL.` };
        }
        return {
            step: {
                ...named('webhook'), title, ...chain,
                webhook: {
                    url: str('whUrl'),
                    method: str('whMethod') === 'GET' ? 'GET' : 'POST',
                    body: str('whMethod') === 'GET' ? undefined : (str('whBody') || undefined),
                    headers: Object.keys(headers).length ? headers : undefined,
                    poll
                }
            }
        };
    }
    if (stype === 'media') {
        if (!str('mModel')) { return { error: `Step ${n} ("${title}") is a media step with no model.` }; }
        if (!str('mInput')) { return { error: `Step ${n} ("${title}") is a media step with no input.` }; }
        const [projectId, sceneId] = str('mScene').split('/');
        return {
            step: {
                ...named('media'), title, ...chain, verify,
                media: {
                    model: str('mModel'), input: str('mInput'),
                    projectId: projectId || undefined, sceneId: sceneId || undefined
                }
            }
        };
    }
    if (stype === 'approval') {
        return {
            step: { ...named('approval'), title, ...chain, approval: { message: str('apMsg') || undefined } }
        };
    }
    if (stype === 'select') {
        const min = Math.max(1, num('selMin', 1));
        const max = num('selMax', 0);
        if (max && max < min) { return { error: `Step ${n} ("${title}") may keep at most fewer than at least.` }; }
        return {
            step: {
                ...named('select'), title, ...chain,
                select: { message: str('selMsg') || undefined, min, max: max || undefined }
            }
        };
    }
    const agent = agents.find(a => a.name === str('agent'));
    if (!agent) { return { error: `Step ${n} ("${title}") has no agent.` }; }
    if (stype === 'browser') {
        if (!str('bUrl')) { return { error: `Step ${n} ("${title}") is a browser step with no start URL.` }; }
        if (!str('bGoal')) { return { error: `Step ${n} ("${title}") is a browser step with no goal.` }; }
        return {
            step: {
                agentId: agent.id, agentName: agent.name, title, prompt: '', mode: 'headless', ...chain,
                browser: {
                    url: str('bUrl'), goal: str('bGoal'),
                    allowHosts: str('bHosts').split(',').map(x => x.trim()).filter(Boolean)
                }
            }
        };
    }
    if (!str('prompt')) { return { error: `Step ${n} ("${title}") has no prompt.` }; }
    return {
        step: {
            agentId: agent.id, agentName: agent.name, title, prompt: str('prompt'), mode, ...chain,
            outputContract: mode === 'headless' && str('contract') === 'json' ? 'json' : undefined,
            verify
        }
    };
}

/** A run, in the New-task form's own vocabulary. Both "one like this" and
 *  "run it again with changes" start from exactly the same reading of it. */
function taskSeed(t: FarmTask): Record<string, unknown> {
    return {
        agent: t.agentName, title: t.title, prompt: t.prompt, mode: t.mode,
        engine: t.engine ?? '', model: t.model ?? '', effort: t.effort ?? '',
        permissionMode: t.permissionMode ?? '', cli: t.cli ?? '',
        project: t.projectId ?? '', workDir: t.workDir ?? '',
        priority: t.priority ?? 0
    };
}

/** An epoch stamp in the shape `<input type="datetime-local">` reads — LOCAL
 *  time, because that is the clock the schedule fires on and the one the user
 *  typed. `toISOString()` here would move a 09:00 schedule by the UTC offset. */
function localInput(ts: number): string {
    const d = new Date(ts);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class TasksPanel {
    private static current: TasksPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    /** Old section names still arrive from menus and notifications. */
    private static toTab(section?: TasksSection): TasksTab | undefined {
        if (!section) { return undefined; }
        if (section === 'plan' || section === 'automations' || section === 'reusables') { return 'plan'; }
        if (section === 'run' || section === 'board') { return 'run'; }
        return undefined;   // 'analytics' now lives on its own page
    }

    static show(deps: TasksDeps, section?: TasksSection): void {
        const tab = TasksPanel.toTab(section);
        if (TasksPanel.current) {
            TasksPanel.current.panel.reveal();
            TasksPanel.current.refresh();
            if (tab) { void TasksPanel.current.panel.webview.postMessage({ type: 'focus', tab }); }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.tasks',
            'Agent Farm — Tasks',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        TasksPanel.current = new TasksPanel(panel, deps, tab);
    }

    static refreshIfOpen(): void {
        TasksPanel.current?.refresh();
    }

    /** Open the page on the Run tab with the New-task form up. This is what the
     *  sidebar's + does now — the one route in, so a task made from the tree and
     *  a task made from the page are the same task with the same fields. */
    static compose(deps: TasksDeps, seed?: Record<string, unknown>): void {
        TasksPanel.show(deps, 'run');
        void TasksPanel.current?.panel.webview.postMessage({
            type: 'task-compose', ...(seed ? { seed } : {})
        });
    }

    /**
     * The same door for a PLAN object — U-9.
     *
     * `agentfarm.addSchedule`, `editSchedule`, `addTrigger`, `editTrigger`,
     * `newWorkflow`, `renameWorkflow`, `addWorkflowStep` and `editWorkflowStep`
     * all come through here instead of opening their own chain of input boxes,
     * so the palette, the sidebar and the page cannot produce three different
     * objects. `id` prefills it for an edit; without one it is a new object.
     * `step` opens the chain with one link already under the pen: a number for
     * an existing step, `'new'` for one that is not there yet.
     */
    static composePlan(deps: TasksDeps, kind: string, id?: string, step?: number | 'new'): void {
        TasksPanel.show(deps, 'plan');
        TasksPanel.current?.compose(kind, id, step);
    }

    /** "Run it again, with changes" from anywhere — the sidebar tree, the
     *  palette, a row's menu. The same New-task form, in retry mode. */
    static retryCompose(deps: TasksDeps, taskId: string): void {
        TasksPanel.show(deps, 'run');
        const t = TasksPanel.current?.task(taskId);
        if (!t) { return; }
        void TasksPanel.current?.panel.webview.postMessage({
            type: 'task-compose', seed: { ...taskSeed(t), mode2: 'retry', retryOf: t.id }
        });
    }

    /** The same door, opened on a seed that is not a stored object — "save this
     *  run's prompt as a template" fills the template form from the run. */
    static composePlanSeed(deps: TasksDeps, kind: string, seed: Record<string, unknown>): void {
        TasksPanel.show(deps, 'plan');
        void TasksPanel.current?.panel.webview.postMessage({ type: 'plan-compose', kind, seed });
    }

    /** Open the Plan tab with a filter already set — the page's own list is the
     *  answer to "which one?", and it carries what a quickpick cannot. */
    static showPlan(deps: TasksDeps, view: Record<string, unknown>, note?: string): void {
        TasksPanel.show(deps, 'plan');
        void TasksPanel.current?.panel.webview.postMessage({ type: 'plan-focus', view, note });
    }

    /** The farm-wide gate, set on the strip that reports it — the palette's
     *  `setQuietHours` / `pauseAutomations` land here rather than on a
     *  quickpick followed by two input boxes. */
    static showGate(deps: TasksDeps, which: 'quiet' | 'pause'): void {
        TasksPanel.show(deps, 'plan');
        void TasksPanel.current?.panel.webview.postMessage({ type: 'gate-open', which });
    }

    /** A picker drawn as a list ON the page instead of a quickpick over it. */
    static showChooser(deps: TasksDeps, chooser: Record<string, unknown>): void {
        TasksPanel.show(deps, (chooser.tab as TasksTab) ?? 'run');
        void TasksPanel.current?.panel.webview.postMessage({ type: 'chooser', chooser });
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: TasksDeps, tab?: TasksTab) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Agent Farm Tasks',
            buildData(deps, tab), 'tasksPage.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.disposables.push(
            deps.manager.onDidChange(() => this.refresh()),
            deps.onDidChangeNeeds(() => this.refresh())
        );
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private task(id: unknown): FarmTask | undefined {
        return this.deps.manager.tasks.find(t => t.id === id);
    }

    private async confirm(text: string, button: string): Promise<boolean> {
        return await vscode.window.showWarningMessage(text, { modal: true }, button) === button;
    }

    /** A refusal the FORM shows, in the form. A modal would take the focus off
     *  the half-filled fields it is complaining about. */
    private say(text: string): void {
        void this.panel.webview.postMessage({ type: 'task-error', text });
    }

    /**
     * Open the form on a plan object — empty for a new one, filled from the
     * stored object for an edit.
     *
     * The seed is the FORM's own vocabulary, not the model's: the page holds a
     * flat draft (`every`/`time`/`guardKind`…) because that is what a set of
     * fields is, and the translation both ways lives here, next to the manager
     * that owns the real shape.
     */
    private compose(kind: string, id?: string, step?: number | 'new'): void {
        const send = (seed: Record<string, unknown>): void => {
            void this.panel.webview.postMessage({ type: 'plan-compose', kind, seed });
        };
        const node = id ? this.planNode(kind, id) : undefined;
        const guardSeed = (p: Precondition | undefined): Record<string, unknown> => ({
            guardKind: p?.kind ?? '',
            guardPath: p?.path ?? '',
            guardExcept: (p?.except ?? []).join(', '),
            guardMin: p?.minCount ?? 1,
            guardHours: p?.hours ?? 24,
            guardRecursive: p?.recursive !== false
        });
        if (kind === 'schedule') {
            const s = node?.schedule;
            if (!s) { send({ mode2: 'new' }); return; }
            send({
                mode2: 'edit', id: s.id, title: s.title, prompt: s.prompt, agent: s.agentName,
                mode: s.mode, engine: s.engine ?? '', model: s.model ?? '', effort: s.effort ?? '',
                permissionMode: s.permissionMode ?? '', project: s.projectId ?? '',
                cli: s.cli ?? '', workDir: s.workDir ?? '', priority: s.priority ?? 0,
                every: s.kind, dow: s.dow ?? 1, missed: s.missed ?? 'skip', enabled: s.enabled,
                time: `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`,
                onceAt: s.onceAt ? localInput(s.onceAt) : '',
                ...guardSeed(s.fireIf)
            });
            return;
        }
        if (kind === 'trigger') {
            const t = node?.trigger;
            if (!t) { send({ mode2: 'new' }); return; }
            const a = t.action;
            const dims = a.kind === 'workflow' ? {} : (a as RunDimensions);
            send({
                mode2: 'edit', id: t.id, title: t.title, ttype: t.type,
                watchPath: t.watchPath ?? '', hookEvent: t.hookEvent ?? 'stop',
                hookAgent: t.hookAgent ?? '', token: t.token ?? '',
                act: a.kind, workflowId: a.kind === 'workflow' ? a.workflowId : '',
                agent: a.kind === 'task' ? a.agentName : ((this.deps.getAgents()[0]?.name) ?? ''),
                prompt: a.kind === 'workflow' ? '' : a.prompt,
                mode: a.kind === 'workflow' ? 'headless' : a.mode,
                engine: dims.engine ?? '', model: dims.model ?? '', effort: dims.effort ?? '',
                permissionMode: dims.permissionMode ?? '', project: dims.projectId ?? '',
                cli: dims.cli ?? '', workDir: dims.workDir ?? '', priority: dims.priority ?? 0,
                debounceSec: t.debounceSec, cooldownSec: t.cooldownSec, maxPerHour: t.maxPerHour,
                enabled: t.enabled,
                ...guardSeed(t.fireIf)
            });
            return;
        }
        if (kind === 'workflow') {
            const w = node?.workflow;
            const steps = (w?.steps ?? []).map(stepSeed);
            // Which link is under the pen. `addWorkflowStep` asks for a new one;
            // `editWorkflowStep` and the step's own right-click name an index.
            const at = step === 'new' ? -1
                : typeof step === 'number' && step >= 0 && step < steps.length ? step
                    : null;
            send(w
                ? { mode2: 'edit', id: w.id, title: w.title, steps, stepIdx: at, step: at !== null && at >= 0 ? steps[at] : null }
                : { mode2: 'new', steps: [], stepIdx: step === 'new' ? -1 : null, step: null });
            return;
        }
        const tpl = node?.template;
        send(tpl
            ? {
                mode2: 'edit', id: tpl.id, title: tpl.title, prompt: tpl.prompt,
                mode: tpl.mode, agent: tpl.agentName ?? ''
            }
            : { mode2: 'new' });
    }

    /**
     * Take a draft back into the manager's own shape and store it.
     *
     * ‼️ IT CALLS THE MANAGER, IT DOES NOT REIMPLEMENT IT. Everything about
     * when a schedule next fires, how a trigger is armed and where any of it is
     * persisted stays where it already was; this is a translation layer and
     * nothing else.
     */
    private async savePlan(item: Record<string, unknown>): Promise<void> {
        const m = this.deps.manager;
        const str = (k: string): string => String(item[k] ?? '').trim();
        const num = (k: string, d: number): number => {
            const n = Number(item[k]);
            return Number.isFinite(n) ? Math.trunc(n) : d;
        };
        const kind = str('kind');
        const editing = str('mode2') === 'edit';
        const id = str('id');
        const agent = this.deps.getAgents().find(a => a.name === str('agent'));
        const guard = (): Precondition | undefined => {
            const gk = str('guardKind');
            if (!gk) { return undefined; }
            const p: Precondition = { kind: gk as Precondition['kind'] };
            if (str('guardPath')) { p.path = str('guardPath'); }
            const except = str('guardExcept').split(',').map(s => s.trim()).filter(Boolean);
            if (except.length) { p.except = except; }
            if (num('guardMin', 1) > 1) { p.minCount = num('guardMin', 1); }
            if (gk === 'pathChangedWithin') { p.hours = num('guardHours', 24); }
            if (gk === 'folderHasFiles') { p.recursive = item.guardRecursive !== false; }
            return p;
        };
        const dims = (): RunDimensions => ({
            ...(str('engine') ? { engine: str('engine') } : {}),
            ...(str('model') ? { model: str('model') } : {}),
            ...(str('effort') ? { effort: str('effort') } : {}),
            ...(str('permissionMode') ? { permissionMode: str('permissionMode') } : {}),
            ...(str('cli') ? { cli: str('cli') } : {}),
            ...(str('workDir') ? { workDir: str('workDir') } : {}),
            ...(num('priority', 0) ? { priority: num('priority', 0) } : {}),
            ...(str('project') ? { projectId: str('project') } : {})
        });
        const done = (text: string): void => {
            void this.panel.webview.postMessage({ type: 'plan-saved', text });
            this.refresh();
        };

        if (kind === 'schedule') {
            if (!agent) { this.say('Pick the agent this schedule runs on.'); return; }
            const every = (str('every') || 'daily') as ScheduleKind;
            const [hh, mm] = (str('time') || '09:00').split(':').map(Number);
            const onceAt = every === 'once' ? Date.parse(str('onceAt')) : undefined;
            if (every === 'once' && !onceAt) { this.say('That date and time could not be read.'); return; }
            const fields = {
                agentId: agent.id, agentName: agent.name, title: str('title'), prompt: str('prompt'),
                mode: str('mode') === 'interactive' ? 'interactive' as TaskMode : 'headless' as TaskMode,
                kind: every, hour: hh || 0, minute: mm || 0,
                dow: every === 'weekly' ? num('dow', 1) : undefined,
                onceAt, enabled: item.enabled !== false,
                missed: every === 'once' ? undefined : (str('missed') || 'skip') as MissedPolicy,
                fireIf: guard(), ...dims()
            };
            const existing = editing ? m.schedules.find(s => s.id === id) : undefined;
            if (existing) {
                Object.assign(existing, fields);
                // A changed time is a different occurrence: the old day-stamp
                // would otherwise mark the new time as already handled.
                existing.lastRunKey = undefined;
                m.persist();
                done(`Schedule “${fields.title}” saved.`);
            } else {
                m.addSchedule(fields);
                done(`Schedule “${fields.title}” created — it fires while VS Code is open.`);
            }
            return;
        }

        if (kind === 'trigger') {
            const act = str('act') || 'task';
            const mode = str('mode') === 'interactive' ? 'interactive' as TaskMode : 'headless' as TaskMode;
            let action: FarmTrigger['action'];
            if (act === 'workflow') {
                if (!m.workflows.some(w => w.id === str('workflowId'))) {
                    this.say('Pick the workflow this trigger runs.'); return;
                }
                action = { kind: 'workflow', workflowId: str('workflowId') };
            } else if (act === 'dispatch') {
                action = { kind: 'dispatch', title: str('title'), prompt: str('prompt'), mode, ...dims() };
            } else {
                if (!agent) { this.say('Pick the agent this trigger runs.'); return; }
                action = {
                    kind: 'task', agentId: agent.id, agentName: agent.name,
                    title: str('title'), prompt: str('prompt'), mode, ...dims()
                };
            }
            const type = (str('ttype') || 'watch') as FarmTrigger['type'];
            const fields = {
                title: str('title'), type,
                watchPath: type === 'watch' ? str('watchPath') : undefined,
                hookEvent: type === 'hook' ? (str('hookEvent') || 'stop') : undefined,
                hookAgent: type === 'hook' ? (str('hookAgent') || undefined) : undefined,
                // A webhook with no token has no URL — one is made rather than
                // saving something that can never be called.
                token: type === 'webhook' ? (str('token') || newId() + newId()) : undefined,
                action,
                debounceSec: num('debounceSec', 5),
                cooldownSec: num('cooldownSec', 60),
                maxPerHour: num('maxPerHour', 12),
                enabled: item.enabled !== false,
                fireIf: guard()
            };
            const existing = editing ? m.triggers.find(t => t.id === id) : undefined;
            if (existing) {
                Object.assign(existing, fields);
                m.persist();
                done(`Trigger “${fields.title}” saved.`);
            } else {
                m.addTrigger(fields);
                done(`Trigger “${fields.title}” created.`);
            }
            return;
        }

        if (kind === 'workflow') {
            // ‼️ THE CHAIN IS SAVED WITH THE NAME, not one step per dialog. The
            // draft is the whole workflow, so Cancel really cancels and a
            // reorder is one save rather than N move commands.
            const drafts = Array.isArray(item.steps) ? item.steps as Record<string, unknown>[] : [];
            const steps: WorkflowStep[] = [];
            for (let i = 0; i < drafts.length; i++) {
                const built = stepFromDraft(drafts[i], this.deps.getAgents(), i + 1);
                if (built.error) { this.say(built.error); return; }
                steps.push(built.step as WorkflowStep);
            }
            const note = steps.length
                ? `${steps.length} step(s).`
                : 'It has no steps yet, so running it does nothing.';
            const existing = editing ? m.workflows.find(w => w.id === id) : undefined;
            if (existing) {
                existing.title = str('title');
                existing.steps = steps;
                m.persist();
                done(`Workflow “${existing.title}” saved — ${note}`);
            } else {
                m.addWorkflow(str('title'), steps);
                done(`Workflow “${str('title')}” created — ${note}`);
            }
            return;
        }

        // template
        const fields = {
            title: str('title'), prompt: str('prompt'),
            mode: str('mode') === 'interactive' ? 'interactive' as TaskMode : 'headless' as TaskMode,
            agentId: agent?.id, agentName: agent?.name
        };
        const existing = editing ? m.templates.find(t => t.id === id) : undefined;
        if (existing) {
            Object.assign(existing, fields);
            m.persist();
            done(`Template “${fields.title}” saved.`);
        } else {
            m.addTemplate(fields);
            done(`Template “${fields.title}” saved — launch it from its row.`);
        }
    }

    /** Resolve a PLAN row id back to its concrete definition. */
    private planNode(kind: unknown, id: unknown):
        { kind: string; schedule?: FarmSchedule; trigger?: FarmTrigger; workflow?: FarmWorkflow; template?: FarmTemplate } | undefined {
        const m = this.deps.manager;
        if (kind === 'schedule') {
            const s = m.schedules.find(x => x.id === id);
            return s ? { kind: 'schedule', schedule: s } : undefined;
        }
        if (kind === 'trigger') {
            const t = m.triggers.find(x => x.id === id);
            return t ? { kind: 'trigger', trigger: t } : undefined;
        }
        if (kind === 'workflow') {
            const w = m.workflows.find(x => x.id === id);
            return w ? { kind: 'workflow', workflow: w } : undefined;
        }
        const t = m.templates.find(x => x.id === id);
        return t ? { kind: 'template', template: t } : undefined;
    }

    private async onMessage(msg: {
        type: string; taskId?: string; to?: string; text?: string; act?: string; id?: string;
        kind?: string; approvalId?: string; ok?: boolean; file?: string; transcriptPath?: string;
        sessionId?: string; content?: string; name?: string; rows?: { kind: string; id: string }[];
        index?: number; task?: unknown; item?: unknown;
        quietFrom?: string; quietTo?: string; reason?: string;
    }): Promise<void> {
        const m = this.deps.manager;
        const run = (cmd: string, ...args: unknown[]) => { void vscode.commands.executeCommand(cmd, ...args); };
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;

            // ---------------- PLAN: manage the definitions ----------------
            case 'plan': {
                const node = this.planNode(msg.kind, msg.id);
                if (!node) { break; }
                const label = node.schedule?.title ?? node.trigger?.title
                    ?? node.workflow?.title ?? node.template?.title ?? '';
                switch (`${msg.kind}:${msg.act}`) {
                    case 'schedule:toggle': run('agentfarm.toggleSchedule', node); break;
                    case 'schedule:run': run('agentfarm.runScheduleNow', node); break;
                    // ‼️ Edit opens THE FORM, not a chain of boxes. The same
                    // form the + opens, prefilled — see composeFor.
                    case 'schedule:edit': this.compose('schedule', msg.id); break;
                    case 'schedule:delete':
                        if (await this.confirm(`Delete schedule "${label}"?`, 'Delete')) {
                            run('agentfarm.deleteSchedule', node);
                        }
                        break;
                    case 'trigger:toggle': run('agentfarm.toggleTrigger', node); break;
                    case 'trigger:run': run('agentfarm.fireTrigger', node); break;
                    case 'trigger:edit': this.compose('trigger', msg.id); break;
                    case 'trigger:delete': run('agentfarm.deleteTrigger', node); break;   // command confirms
                    case 'workflow:run': run('agentfarm.runWorkflow', node); break;
                    // ‼️ A workflow's Edit is the workflow — its name AND its
                    // chain. It used to be `addWorkflowStep`, so the one thing
                    // "edit" could not do on a workflow was edit it.
                    case 'workflow:edit': this.compose('workflow', msg.id); break;
                    case 'template:edit': this.compose('template', msg.id); break;
                    case 'workflow:delete': run('agentfarm.deleteWorkflow', node); break; // command confirms
                    case 'template:run': run('agentfarm.runTemplate', node); break;
                    case 'template:delete':
                        if (await this.confirm(`Delete template "${label}"?`, 'Delete')) {
                            run('agentfarm.deleteTemplate', node);
                        }
                        break;
                    // Reachable only from the row's right-click menu — there is
                    // no room on the row for a button nobody presses weekly.
                    case 'schedule:export': run('agentfarm.exportSchtask', node); break;
                }
                this.refresh();
                break;
            }
            // One step of a workflow, addressed by its place in the list —
            // right-clicked in the table row's own detail. Editing opens the
            // chain's form at that link; moving and deleting stay the manager's
            // one-line acts, because there is nothing to fill in.
            case 'wfstep': {
                const node = this.planNode('workflow', msg.id);
                const index = Number(msg.index);
                if (!node?.workflow || !Number.isInteger(index)) { break; }
                if (index < 0 || index >= node.workflow.steps.length) { break; }
                const step = { kind: 'workflow-step', workflow: node.workflow, index };
                switch (msg.act) {
                    case 'edit': this.compose('workflow', msg.id, index); break;
                    case 'up': run('agentfarm.moveWorkflowStepUp', step); break;
                    case 'down': run('agentfarm.moveWorkflowStepDown', step); break;
                    case 'delete': run('agentfarm.deleteWorkflowStep', step); break;
                }
                this.refresh();
                break;
            }
            // ‼️ THE + USED TO HAND THE JOB BACK TO A DIALOG — AND FOR TEMPLATES
            // IT HANDED IT TO THE WRONG ONE: the template kind was mapped to
            // `agentfarm.runTemplate`, so "add a template" RAN one, and making a
            // template on this page was impossible. All four kinds now open the
            // page's own form.
            case 'plan-add':
                // …including the workflow, whose creation is a LIST rather than
                // one object. That was the last dialog on this page: a 294-line
                // chain that asked for step 4 without ever showing steps 1–3.
                this.compose(String(msg.kind || 'schedule'));
                break;
            case 'plan-save':
                await this.savePlan((msg.item ?? {}) as Record<string, unknown>);
                break;

            // Bulk switching — the thing that used to force one-by-one clicking.
            case 'bulk': {
                const rows = Array.isArray(msg.rows) ? msg.rows : [];
                const on = msg.act === 'on';
                const scheds = m.schedules.filter(s => rows.some(r => r.kind === 'schedule' && r.id === s.id));
                const trigs = m.triggers.filter(t => rows.some(r => r.kind === 'trigger' && r.id === t.id));
                const n = scheds.length + trigs.length;
                if (!n) { break; }
                if (!await this.confirm(
                    `${on ? 'Enable' : 'Disable'} ${n} item(s)?` +
                    (on ? ' They start firing on their own again.' : ''),
                    on ? 'Enable' : 'Disable')) {
                    break;
                }
                for (const s of scheds) { s.enabled = on; }
                for (const t of trigs) { t.enabled = on; }
                m.persist();
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${n} item(s) ${on ? 'enabled' : 'disabled'}.`);
                this.refresh();
                break;
            }

            // ---------------- the farm-wide gate ----------------
            case 'gate': {
                if (msg.act === 'pause') {
                    m.setAutomationState({ paused: true, pausedUntil: undefined, pauseReason: msg.text || '' });
                } else if (msg.act === 'resume') {
                    m.setAutomationState({ paused: false, pausedUntil: undefined, pauseReason: undefined });
                } else if (msg.act === 'pause-for') {
                    const mins = Number(msg.text ?? 0);
                    if (mins > 0) {
                        const why = (msg.reason ?? '').trim();
                        m.setAutomationState({
                            paused: false, pausedUntil: Date.now() + mins * 60_000,
                            pauseReason: why ? `${why} (${mins} min)` : `paused for ${mins} min`
                        });
                    }
                    // ‼️ THE QUIET WINDOW IS TWO TIMES, SET ON THE STRIP THAT SHOWS IT.
                    // It used to call `agentfarm.setQuietHours`: a quickpick of two canned
                    // windows, and for anything else two more input boxes after it.
                } else if (msg.act === 'quiet-set') {
                    const ok = (v?: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v ?? ''));
                    if (ok(msg.quietFrom) && ok(msg.quietTo)) {
                        m.setAutomationState({ quietFrom: msg.quietFrom, quietTo: msg.quietTo });
                    }
                } else if (msg.act === 'quiet-off') {
                    m.setAutomationState({ quietFrom: undefined, quietTo: undefined });
                }
                this.refresh();
                break;
            }

            // ---------------- RUN: what actually happened ----------------
            case 'task': {
                const t = this.task(msg.id);
                if (!t) { break; }
                if (msg.act === 'start' && t.status === 'queued') { m.startTask(t); }
                else if (msg.act === 'cancel' && (t.status === 'queued' || t.status === 'running')) { m.cancelTask(t); }
                else if (msg.act === 'done' && t.status === 'running') { m.completeTask(t); }
                else if (msg.act === 'delete' && t.status !== 'running') { m.deleteTask(t); }
                else if (msg.act === 'rerun' && t.status !== 'queued' && t.status !== 'running') { m.retryTask(t); }
                else if (msg.act === 'next' && t.status === 'queued') { m.runTaskNext(t); }
                else if (msg.act === 'terminal') { m.revealTerminal(t); }
                else if (msg.act === 'unpark' && t.status === 'queued' && t.autoStart) {
                    t.autoStart = false;
                    t.deferredReason = undefined;
                    m.startTask(t);
                }
                // The rest exist as commands on the sidebar tree and had no way
                // in from this page until the row grew a menu. Each one calls
                // the command, so there is still exactly one implementation.
                else if (msg.act === 'up' && t.status === 'queued') { run('agentfarm.taskUp', { kind: 'task', task: t }); }
                else if (msg.act === 'down' && t.status === 'queued') { run('agentfarm.taskDown', { kind: 'task', task: t }); }
                // ‼️ A RETRY IS THE FORM TOO. It was one input box holding the
                // old prompt: you could rewrite the words and nothing else,
                // while the reason people retry is usually "the same words, on
                // a better model". Now it is the whole task, editable, and the
                // host turns it back into a real retry of THIS run.
                else if (msg.act === 'retryEdit' && t.status !== 'queued' && t.status !== 'running') {
                    void this.panel.webview.postMessage({
                        type: 'task-compose', seed: { ...taskSeed(t), mode2: 'retry', retryOf: t.id }
                    });
                }
                else if (msg.act === 'resumeWorkflow') { run('agentfarm.resumeWorkflow', { kind: 'task', task: t }); }
                // …and so is "save the prompt as a template". That was a
                // quickpick whose only question was bind-to-agent or not; every
                // other thing a template carries was decided for you.
                else if (msg.act === 'saveTemplate') {
                    void this.panel.webview.postMessage({
                        type: 'plan-compose', kind: 'template',
                        seed: {
                            mode2: 'new', title: t.title, prompt: t.prompt,
                            mode: t.mode, agent: t.agentName
                        }
                    });
                }
                // ‼️ "Like this one, but…" — the gesture the page could not make.
                // Editing a run meant a single input box asking for a new prompt
                // (agentfarm.retryTaskEdit) and no way to change the agent, the
                // model or anything else — while ADDING one asked a different
                // set of questions again. Same form, prefilled from the row.
                else if (msg.act === 'clone') {
                    void this.panel.webview.postMessage({ type: 'task-compose', seed: taskSeed(t) });
                }
                this.refresh();
                break;
            }
            // ‼️ THE PAGE MAKES THE TASK — it does not open a dialog that does.
            //
            // This used to call agentfarm.addTask, which asked five questions in
            // five modal boxes and could not ask the other five at all (model,
            // effort, permission mode, project, priority). So the page that is
            // supposed to be the control panel for task activity was the one
            // place you could NOT state what a task should be, and the sidebar's
            // + and the page's own button produced two different kinds of task.
            // Now the form on the page is the one implementation and the + opens
            // it (see agentfarm.addTask), so there is exactly one way in.
            case 'task-new': {
                const t = (msg.task ?? {}) as Record<string, unknown>;
                const str = (k: string) => String(t[k] ?? '').trim();
                const agent = this.deps.getAgents().find(a => a.name === str('agent'));
                const prompt = str('prompt');
                const title = str('title') || prompt.split('\n')[0].slice(0, 80);
                if (!agent || !prompt) {
                    this.say('A task needs an agent and a prompt.');
                    break;
                }
                // The dedup guard the dialog had — kept, and asked in the page's
                // own words rather than a modal that steals focus from the form.
                if (t.force !== true && m.queuedDuplicate(agent.id, prompt)) {
                    void this.panel.webview.postMessage({
                        type: 'task-dup',
                        text: `${agent.name} already has an identical task queued.`
                    });
                    break;
                }
                const mode: TaskMode = str('mode') === 'interactive' ? 'interactive' : 'headless';
                // ‼️ `projectId` is passed EXPLICITLY, including as undefined.
                // The manager reads the window's active project only when the
                // key is absent (see addTask); the form always has an answer —
                // a project, or "no project" — so it always states one, and
                // "none" here really means none rather than "whatever the
                // window happens to be showing".
                const projectId = str('project');
                // ‼️ A RETRY GOES BACK THROUGH `retryTask`, not through addTask
                // with a hand-copied lineage: the attempt number, the "(retry
                // N)" naming, the output contract, the mission it belongs to
                // and the workflow-step resume rule all live there, and a
                // second implementation of them here would drift on the first
                // change. The form only says what it CHANGED.
                const retryOf = str('retryOf');
                if (retryOf) {
                    const original = this.task(retryOf);
                    if (!original) { this.say('That run is no longer in the list, so there is nothing to retry.'); break; }
                    const copy = m.retryTask(original, prompt, {
                        agent, title, mode,
                        autoStart: t.start === true,
                        projectId: projectId || undefined,
                        model: str('model') || undefined,
                        engine: str('engine') || undefined,
                        effort: str('effort') || undefined,
                        permissionMode: str('permissionMode') || undefined,
                        cli: str('cli') || undefined,
                        workDir: str('workDir') || undefined,
                        priority: Number(t.priority) ? Math.trunc(Number(t.priority)) : undefined
                    });
                    if (copy) {
                        void this.panel.webview.postMessage({
                            type: 'task-made', id: copy.id, title: copy.title, started: t.start === true
                        });
                    }
                    this.refresh();
                    break;
                }
                const task = m.addTask(agent, title, prompt, mode, {
                    projectId: projectId || undefined,
                    ...(str('engine') ? { engine: str('engine') } : {}),
                    ...(str('model') ? { model: str('model') } : {}),
                    ...(str('effort') ? { effort: str('effort') } : {}),
                    ...(str('permissionMode') ? { permissionMode: str('permissionMode') } : {}),
                    ...(str('cli') ? { cli: str('cli') } : {}),
                    ...(str('workDir') ? { workDir: str('workDir') } : {}),
                    ...(Number(t.priority) ? { priority: Math.trunc(Number(t.priority)) } : {})
                });
                if (t.start === true) { m.startTask(task); }
                void this.panel.webview.postMessage({
                    type: 'task-made', id: task.id, title: task.title,
                    started: t.start === true
                });
                this.refresh();
                break;
            }
            // The sidebar's + and the row menu's "edit and re-run" both land
            // here: the page opens its own form, prefilled. One form, one set of
            // fields, whatever you came in through.
            case 'task-add':
                void this.panel.webview.postMessage({ type: 'task-compose' });
                break;
            case 'clear-finished': {
                const n = m.tasks.filter(t => t.status !== 'queued' && t.status !== 'running').length;
                if (!n) { break; }
                if (await this.confirm(
                    `Clear ${n} finished run(s)? History is archived first; output files are deleted.`,
                    'Clear')) {
                    m.clearFinished();
                }
                this.refresh();
                break;
            }
            case 'cancel-queued': {
                const list = m.tasks.filter(t => t.status === 'queued');
                if (!list.length) { break; }
                if (await this.confirm(`Cancel ${list.length} queued run(s)?`, 'Cancel runs')) {
                    for (const t of list) { m.cancelTask(t); }
                }
                this.refresh();
                break;
            }
            case 'open-output':
                if (msg.file) { run('vscode.open', vscode.Uri.file(msg.file)); }
                break;
            case 'open-transcript':
                if (msg.file) { run('agentfarm.openSession', msg.file); }
                break;
            case 'approve':
                if (msg.approvalId) { this.deps.settleApproval(msg.approvalId, msg.ok === true); }
                this.refresh();
                break;
            case 'open-needs':
                run('agentfarm.openNeeds');
                break;
            case 'command':
                if (msg.text?.trim()) { await this.deps.runCommandText(msg.text.trim()); }
                this.refresh();
                break;

            // ---------------- bridges out ----------------
            case 'open-analytics':
                run('agentfarm.openTaskAnalytics');
                break;
            case 'open-history':
                run('agentfarm.openTaskHistory');
                break;
            // One row of an in-page picker was pressed. The act names what kind
            // of list it was; the id is the row's own.
            case 'chooser-pick':
                if (msg.act === 'history' && msg.id) {
                    run('vscode.open', vscode.Uri.file(path.join(m.historyDir, msg.id)));
                }
                break;
            case 'export-md':
                if (typeof msg.content === 'string' && msg.content.trim()) {
                    void this.saveMarkdown(msg.content, typeof msg.name === 'string' ? msg.name : 'tasks');
                }
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'openGuide':
                run('agentfarm.openGuide', 'tasks-sayfasi');
                break;
        }
    }

    private async saveMarkdown(md: string, base: string): Promise<void> {
        const dir = this.deps.lastExportDir?.() || os.homedir();
        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(dir, `${base.replace(/[^\w-]+/g, '-')}-${stamp}.md`)),
            filters: { Markdown: ['md'] }
        });
        if (!uri) { return; }
        try {
            fs.writeFileSync(uri.fsPath, md, 'utf8');
            this.deps.setLastExportDir?.(path.dirname(uri.fsPath));
            void vscode.window.showTextDocument(uri);
        } catch (e) {
            void vscode.window.showErrorMessage(`Agent Farm: export failed — ${String(e)}`);
        }
    }

    private dispose(): void {
        TasksPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
