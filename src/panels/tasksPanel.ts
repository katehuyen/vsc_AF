import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { describePrecondition, rollupAutomationLog } from '../core/automation';
import { nextOccurrences } from '../core/forecast';
import { NeedItem } from '../core/needs';
import { FarmSchedule, FarmTask, FarmTemplate, FarmTrigger, FarmWorkflow, TaskManager } from '../core/tasks';
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
        perAgentLimit: limits.perAgent
    };
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
        index?: number;
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
                    case 'schedule:edit': run('agentfarm.editSchedule', node); break;
                    case 'schedule:delete':
                        if (await this.confirm(`Delete schedule "${label}"?`, 'Delete')) {
                            run('agentfarm.deleteSchedule', node);
                        }
                        break;
                    case 'trigger:toggle': run('agentfarm.toggleTrigger', node); break;
                    case 'trigger:run': run('agentfarm.fireTrigger', node); break;
                    case 'trigger:edit': run('agentfarm.editTrigger', node); break;
                    case 'trigger:delete': run('agentfarm.deleteTrigger', node); break;   // command confirms
                    case 'workflow:run': run('agentfarm.runWorkflow', node); break;
                    case 'workflow:edit': run('agentfarm.addWorkflowStep', node); break;
                    case 'workflow:rename': run('agentfarm.renameWorkflow', node); break;
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
            case 'plan-add':
                run(msg.kind === 'trigger' ? 'agentfarm.addTrigger'
                    : msg.kind === 'workflow' ? 'agentfarm.newWorkflow'
                        : msg.kind === 'template' ? 'agentfarm.runTemplate'
                            : 'agentfarm.addSchedule');
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
                this.refresh();
                break;
            }
            case 'task-add':
                run('agentfarm.addTask');
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
