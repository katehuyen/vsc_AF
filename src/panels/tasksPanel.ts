import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { describePrecondition, Precondition, rollupAutomationLog } from '../core/automation';
import { nextOccurrences } from '../core/forecast';
import { NeedItem } from '../core/needs';
import { EFFORT_CHOICES, modelChoices, PERMISSION_CHOICES } from '../core/launch';
import {
    FarmSchedule, FarmTask, FarmTemplate, FarmTrigger, FarmWorkflow, MissedPolicy, newId,
    RunDimensions, ScheduleKind, TaskManager, TaskMode
} from '../core/tasks';
import { TaskRecord } from '../core/taskstats';
import { TriggerManager } from '../core/triggers';
import { buildTriggerStats, describeTriggerStat } from '../core/triggerstats';
import { handleAfNav, htmlShell } from './base';

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
    launchDefaults(): { model?: string; effort?: string; permissionMode?: string };
    cliProfiles(): { name: string; headless?: string }[];
    /** Projects a task can be filed under, and the window's current one. */
    projects(): { id: string; name: string; icon?: string }[];
    activeProjectId(): string | undefined;
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
    return s.onceAt ? `once · ${new Date(s.onceAt).toLocaleString()}` : 'once';
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
        // ---- what the New-task form offers. One vocabulary with the session
        // launcher (core/launch.ts), so "run it on opus at low effort" means the
        // same thing whether you start a session or queue a task.
        launch: {
            models: modelChoices(deps.modelAliases()),
            efforts: EFFORT_CHOICES,
            permissions: PERMISSION_CHOICES,
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
     * `newWorkflow` and `renameWorkflow` all come through here instead of
     * opening their own chain of input boxes, so the palette, the sidebar and
     * the page cannot produce three different objects. `id` prefills it for an
     * edit; without one it is a new object.
     */
    static composePlan(deps: TasksDeps, kind: string, id?: string): void {
        TasksPanel.show(deps, 'plan');
        TasksPanel.current?.compose(kind, id);
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
    private compose(kind: string, id?: string): void {
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
                mode: s.mode, model: s.model ?? '', effort: s.effort ?? '',
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
                model: dims.model ?? '', effort: dims.effort ?? '',
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
            send(w ? { mode2: 'edit', id: w.id, title: w.title } : { mode2: 'new' });
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
            const existing = editing ? m.workflows.find(w => w.id === id) : undefined;
            if (existing) {
                existing.title = str('title');
                m.persist();
                done(`Workflow renamed to “${existing.title}”.`);
            } else {
                m.addWorkflow(str('title'), []);
                done(`Workflow “${str('title')}” created — add its steps on the row.`);
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
                    case 'workflow:edit': run('agentfarm.addWorkflowStep', node); break;
                    case 'workflow:rename': this.compose('workflow', msg.id); break;
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
            // One step of a workflow, addressed by its place in the list. The
            // step commands want a workflow-step node; building it here keeps
            // the page from having to know that shape.
            case 'wfstep': {
                const node = this.planNode('workflow', msg.id);
                const index = Number(msg.index);
                if (!node?.workflow || !Number.isInteger(index)) { break; }
                if (index < 0 || index >= node.workflow.steps.length) { break; }
                const step = { kind: 'workflow-step', workflow: node.workflow, index };
                switch (msg.act) {
                    case 'edit': run('agentfarm.editWorkflowStep', step); break;
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
                // Workflow is the one kind whose CREATION is not one object:
                // making it means writing its steps, and that chain is Faz 2 of
                // the U-9 roadmap. Until it is a form, it stays whole rather
                // than being replaced by a form that can only name it.
                if (msg.kind === 'workflow') { run('agentfarm.newWorkflow'); }
                else { this.compose(String(msg.kind || 'schedule')); }
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
                        m.setAutomationState({
                            paused: false, pausedUntil: Date.now() + mins * 60_000,
                            pauseReason: `paused for ${mins} min`
                        });
                    }
                } else if (msg.act === 'quiet') {
                    run('agentfarm.setQuietHours');
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
                else if (msg.act === 'retryEdit' && t.status !== 'queued' && t.status !== 'running') {
                    run('agentfarm.retryTaskEdit', { kind: 'task', task: t });
                }
                else if (msg.act === 'resumeWorkflow') { run('agentfarm.resumeWorkflow', { kind: 'task', task: t }); }
                else if (msg.act === 'saveTemplate') { run('agentfarm.saveTaskTemplate', { kind: 'task', task: t }); }
                // ‼️ "Like this one, but…" — the gesture the page could not make.
                // Editing a run meant a single input box asking for a new prompt
                // (agentfarm.retryTaskEdit) and no way to change the agent, the
                // model or anything else — while ADDING one asked a different
                // set of questions again. Same form, prefilled from the row.
                else if (msg.act === 'clone') {
                    void this.panel.webview.postMessage({
                        type: 'task-compose',
                        seed: {
                            agent: t.agentName, title: t.title, prompt: t.prompt, mode: t.mode,
                            model: t.model ?? '', effort: t.effort ?? '',
                            permissionMode: t.permissionMode ?? '', cli: t.cli ?? '',
                            project: t.projectId ?? '', workDir: t.workDir ?? '',
                            priority: t.priority ?? 0
                        }
                    });
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
                const task = m.addTask(agent, title, prompt, mode, {
                    projectId: projectId || undefined,
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
