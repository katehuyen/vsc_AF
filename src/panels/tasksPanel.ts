import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { buildForecast, familyDurations, nextOccurrences } from '../core/forecast';
import { NeedItem } from '../core/needs';
import { FarmSchedule, FarmTask, FarmTemplate, FarmTrigger, FarmWorkflow, TaskManager } from '../core/tasks';
import { buildAgentTaskStats, buildTaskFamilies, taskAlerts, TaskRecord, titleFamily } from '../core/taskstats';
import { TriggerManager } from '../core/triggers';
import { buildTriggerStats, describeTriggerStat, triggerAlerts, TriggerStat } from '../core/triggerstats';
import { handleAfNav, htmlShell } from './base';

/**
 * Tasks page — the single rich command surface for everything task-shaped,
 * sitting left of Missions in the global nav. Four sections:
 *   Board       — the live queue (Inbox / Parked / Running / Needs Approval /
 *                 Done) with drag-and-drop, the NL command bar and the
 *                 per-agent load strip (queued/running vs concurrency limits).
 *   Automations — triggers (armed state + reliability scorecard) and schedules
 *                 (next run) with enable/disable · run-now · edit · delete.
 *   Reusables   — templates and workflows: run, edit, delete.
 *   Analytics   — 30d throughput, per-agent scorecards, task families, alerts,
 *                 the forecast digest and bridges to History / full Forecast.
 * The old standalone Board page folded into this one; agentfarm.openBoard is
 * kept as an alias that opens the Board section (all existing entry points and
 * notifications keep working).
 */

export type TasksSection = 'board' | 'automations' | 'reusables' | 'analytics';

export interface TasksDeps {
    extensionUri: vscode.Uri;
    manager: TaskManager;
    getAgents(): AgentInfo[];
    /** live tasks merged with the finished-task archive (analytics source) */
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
}

interface BoardCard {
    id: string;
    title: string;
    agentName: string;
    mode: string;
    status: string;
    detail: string;
    when: number;
    durMin?: number;
    verified?: string;
    mediaCost?: number;
    hasOutput: boolean;
    outputFile?: string;
}

function card(t: FarmTask): BoardCard {
    const durMin = t.startedAt
        ? Math.max(0, Math.round(((t.endedAt ?? Date.now()) - t.startedAt) / 60000))
        : undefined;
    return {
        id: t.id,
        title: t.title,
        agentName: t.agentName,
        mode: t.mode,
        status: t.status,
        detail: t.status === 'queued' && t.deferredReason ? t.deferredReason : '',
        when: t.endedAt ?? t.startedAt ?? t.createdAt,
        durMin,
        verified: t.verified,
        mediaCost: t.mediaCost,
        hasOutput: !!t.outputFile,
        outputFile: t.outputFile
    };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleWhen(s: FarmSchedule): string {
    const hm = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
    if (s.kind === 'daily') { return `daily ${hm}`; }
    if (s.kind === 'weekly') { return `${DOW[s.dow ?? 0]} ${hm}`; }
    return s.onceAt ? `once ${new Date(s.onceAt).toLocaleString()}` : 'once';
}

function triggerSource(t: FarmTrigger): string {
    if (t.type === 'watch') { return `watch: …${(t.watchPath ?? '').slice(-34)}`; }
    if (t.type === 'webhook') { return `webhook: /trigger/…${(t.token ?? '').slice(-6)}`; }
    return `hook: ${t.hookEvent}${t.hookAgent ? '@' + t.hookAgent : ''}`;
}

function triggerTarget(t: FarmTrigger): string {
    if (t.action.kind === 'workflow') { return 'workflow'; }
    if (t.action.kind === 'dispatch') { return 'dispatch → auto'; }
    return `task → ${t.action.agentName}`;
}

function median(xs: number[]): number | undefined {
    if (!xs.length) { return undefined; }
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const DAY_MS = 24 * 3600 * 1000;

function buildAnalytics(deps: TasksDeps, trigStats: TriggerStat[], now: number): Record<string, unknown> {
    const records = deps.allRecords();
    const statsMap = buildAgentTaskStats(records, { now });
    const agentRows = [...statsMap.values()].sort((a, b) => b.total - a.total);

    let done = 0, failed = 0, cancelled = 0, retries = 0;
    for (const s of agentRows) { done += s.done; failed += s.failed; cancelled += s.cancelled; retries += s.retries; }
    const durs = records
        .filter(t => t.status === 'done' && t.startedAt && t.endedAt && t.endedAt > t.startedAt
            && (t.endedAt ?? 0) >= now - 30 * DAY_MS)
        .map(t => (t.endedAt as number) - (t.startedAt as number));

    // daily throughput, oldest → newest, exactly 30 buckets
    const dayKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const buckets = new Map<string, { done: number; failed: number }>();
    for (let i = 29; i >= 0; i--) { buckets.set(dayKey(now - i * DAY_MS), { done: 0, failed: 0 }); }
    for (const t of records) {
        if (t.status !== 'done' && t.status !== 'failed') { continue; }
        const b = buckets.get(dayKey(t.endedAt ?? t.createdAt));
        if (b) { t.status === 'done' ? b.done++ : b.failed++; }
    }

    const families = buildTaskFamilies(records, { now })
        .sort((a, b) => b.runsTotal - a.runsTotal)
        .slice(0, 15)
        .map(f => ({
            title: f.title, source: f.source, runs: f.runsTotal, failed: f.failedTotal,
            alwaysFails: f.alwaysFails,
            agents: Object.values(f.cells).map(c => c.agentName).join(', ')
        }));

    const alerts = [
        ...taskAlerts(statsMap, buildTaskFamilies(records, { now })).map(a => ({
            severity: a.severity, who: a.agentName, message: a.message
        })),
        ...triggerAlerts(trigStats).map(a => ({ severity: a.severity, who: a.title, message: a.message }))
    ];

    const forecast = buildForecast(
        deps.manager.schedules,
        deps.manager.tasks.map(t => ({
            title: t.title, agentName: t.agentName, status: t.status,
            deferredReason: t.deferredReason, startedAt: t.startedAt
        })),
        records, now, deps.forecastDays());

    // queue ETA: sum of known family medians over queued tasks
    const fams = familyDurations(records, now);
    let queueEtaMs = 0, queueKnown = 0;
    const queued = deps.manager.tasks.filter(t => t.status === 'queued');
    for (const t of queued) {
        const m = fams.get(titleFamily(t.title))?.medianMs;
        if (m) { queueEtaMs += m; queueKnown++; }
    }

    return {
        kpis: {
            runs30d: done + failed + cancelled,
            done, failed, retries,
            successRate: done + failed ? done / (done + failed) : undefined,
            medianMs: median(durs)
        },
        agents: agentRows,
        families,
        alerts,
        daily: [...buckets.entries()].map(([day, v]) => ({ day, ...v })),
        forecast: {
            days: forecast.days,
            totalScheduledRuns: forecast.totalScheduledRuns,
            estBusyMs: forecast.estBusyMs,
            upcoming: forecast.upcoming.slice(0, 12)
        },
        queue: { count: queued.length, etaMs: queueEtaMs, known: queueKnown }
    };
}

function buildData(deps: TasksDeps, section?: TasksSection): Record<string, unknown> {
    const m = deps.manager;
    const now = Date.now();
    const tasks = m.tasks;
    const finished = tasks
        .filter(t => t.status === 'done' || t.status === 'failed' || t.status === 'cancelled')
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
        .slice(0, 30);

    const limits = deps.limits();
    const load = {
        global: { running: tasks.filter(t => t.status === 'running').length, limit: limits.global },
        perAgentLimit: limits.perAgent,
        agents: deps.getAgents().map(a => ({
            id: a.id, name: a.name,
            queued: tasks.filter(t => t.agentId === a.id && t.status === 'queued').length,
            running: tasks.filter(t => t.agentId === a.id && t.status === 'running').length
        }))
    };

    const trigStats = buildTriggerStats(m.triggers, deps.allRecords(), { now });
    const statById = new Map(trigStats.map(s => [s.id, s]));

    return {
        generatedAt: now,
        section,
        board: {
            inbox: tasks.filter(t => t.status === 'queued' && !t.autoStart).map(card),
            parked: tasks.filter(t => t.status === 'queued' && t.autoStart).map(card),
            running: tasks.filter(t => t.status === 'running').map(card),
            waiting: deps.buildWaiting(),
            done: finished.map(card)
        },
        load,
        automations: {
            triggers: m.triggers.map(t => {
                const stat = statById.get(t.id);
                return {
                    id: t.id, title: t.title, type: t.type,
                    src: triggerSource(t), target: triggerTarget(t),
                    enabled: t.enabled,
                    armed: t.type !== 'watch' || !!deps.triggerManager?.isArmed(t.id),
                    debounceSec: t.debounceSec, cooldownSec: t.cooldownSec, maxPerHour: t.maxPerHour,
                    fireCount: t.fireCount ?? 0, lastFiredAt: t.lastFiredAt,
                    stat: stat ? describeTriggerStat(stat) : undefined,
                    alwaysFails: stat?.alwaysFails ?? false
                };
            }),
            schedules: m.schedules.map(s => ({
                id: s.id, title: s.title, agentName: s.agentName, mode: s.mode,
                when: scheduleWhen(s), kind: s.kind, missed: s.missed ?? 'skip',
                enabled: s.enabled,
                nextAt: nextOccurrences(s, now, 35)[0]
            }))
        },
        reusables: {
            templates: m.templates.map(t => ({
                id: t.id, title: t.title, agentName: t.agentName,
                mode: t.mode, prompt: t.prompt
            })),
            workflows: m.workflows.map(w => ({
                id: w.id, title: w.title,
                steps: w.steps.map(s => ({
                    title: s.title, agentName: s.agentName, parallel: !!s.parallel,
                    kind: s.approval ? 'approval' : s.select ? 'select' : s.webhook ? 'webhook'
                        : s.media ? 'media' : s.browser ? 'browser' : s.mode
                }))
            }))
        },
        analytics: buildAnalytics(deps, trigStats, now)
    };
}

export class TasksPanel {
    private static current: TasksPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: TasksDeps, section?: TasksSection): void {
        if (TasksPanel.current) {
            TasksPanel.current.panel.reveal();
            TasksPanel.current.refresh();
            if (section) {
                void TasksPanel.current.panel.webview.postMessage({ type: 'focus', section });
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.tasks',
            'Agent Farm — Tasks',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        TasksPanel.current = new TasksPanel(panel, deps, section);
    }

    static refreshIfOpen(): void {
        TasksPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: TasksDeps, section?: TasksSection) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Agent Farm Tasks',
            buildData(deps, section),
            'tasksPage.js'
        );
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

    private schedule(id: unknown): FarmSchedule | undefined {
        return this.deps.manager.schedules.find(s => s.id === id);
    }

    private trigger(id: unknown): FarmTrigger | undefined {
        return this.deps.manager.triggers.find(t => t.id === id);
    }

    private template(id: unknown): FarmTemplate | undefined {
        return this.deps.manager.templates.find(t => t.id === id);
    }

    private workflow(id: unknown): FarmWorkflow | undefined {
        return this.deps.manager.workflows.find(w => w.id === id);
    }

    private async confirm(text: string, button: string): Promise<boolean> {
        return await vscode.window.showWarningMessage(text, { modal: true }, button) === button;
    }

    private async onMessage(msg: {
        type: string; taskId?: string; to?: string; text?: string; act?: string; id?: string;
        approvalId?: string; ok?: boolean; file?: string; transcriptPath?: string; sessionId?: string;
    }): Promise<void> {
        const m = this.deps.manager;
        const run = (cmd: string, ...args: unknown[]) => { void vscode.commands.executeCommand(cmd, ...args); };
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;

            // ---- board (same protocol the standalone Kanban page used) ----
            case 'move': {
                const t = this.task(msg.taskId);
                if (!t) { break; }
                if (msg.to === 'running' && t.status === 'queued') { m.startTask(t); }
                else if (msg.to === 'done' && t.status === 'running') { m.completeTask(t); }
                else if (msg.to === 'done' && t.status === 'queued') { m.cancelTask(t); }
                else if (msg.to === 'inbox' && t.status === 'queued' && t.autoStart) {
                    t.autoStart = false;
                    t.deferredReason = undefined;
                    m.startTask(t); // re-request: parks again if still blocked
                }
                this.refresh();
                break;
            }
            case 'cancel': {
                const t = this.task(msg.taskId);
                if (t && (t.status === 'queued' || t.status === 'running')) { m.cancelTask(t); }
                this.refresh();
                break;
            }
            case 'delete': {
                const t = this.task(msg.taskId);
                if (t && t.status !== 'running') { m.deleteTask(t); }
                this.refresh();
                break;
            }
            case 'open-output':
                if (msg.file) { run('vscode.open', vscode.Uri.file(msg.file)); }
                break;
            case 'open-session':
                if (msg.transcriptPath) { run('agentfarm.openSession', msg.transcriptPath); }
                break;
            case 'focus-terminal':
                run('agentfarm.focusSessionTerminal',
                    { sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : undefined });
                break;
            case 'approve':
                if (msg.approvalId) { this.deps.settleApproval(msg.approvalId, msg.ok === true); }
                this.refresh();
                break;
            case 'command':
                if (msg.text?.trim()) { await this.deps.runCommandText(msg.text.trim()); }
                this.refresh();
                break;
            case 'add-task':
                run('agentfarm.addTask');
                break;
            case 'open-needs':
                run('agentfarm.openNeeds');
                break;

            // ---- automations: schedules & triggers reuse the tree commands
            //      (single source of truth for their edit flows) ----
            case 'sched': {
                const s = this.schedule(msg.id);
                if (!s) { break; }
                const node = { kind: 'schedule', schedule: s };
                if (msg.act === 'toggle') { run('agentfarm.toggleSchedule', node); }
                else if (msg.act === 'run') { run('agentfarm.runScheduleNow', node); }
                else if (msg.act === 'edit') { run('agentfarm.editSchedule', node); }
                else if (msg.act === 'delete' && await this.confirm(`Delete schedule "${s.title}"?`, 'Delete')) {
                    run('agentfarm.deleteSchedule', node);
                }
                break;
            }
            case 'sched-add':
                run('agentfarm.addSchedule');
                break;
            case 'trig': {
                const t = this.trigger(msg.id);
                if (!t) { break; }
                const node = { kind: 'trigger', trigger: t };
                if (msg.act === 'toggle') { run('agentfarm.toggleTrigger', node); }
                else if (msg.act === 'fire') { run('agentfarm.fireTrigger', node); }
                else if (msg.act === 'edit') { run('agentfarm.editTrigger', node); }
                else if (msg.act === 'delete') { run('agentfarm.deleteTrigger', node); } // command confirms
                break;
            }
            case 'trig-add':
                run('agentfarm.addTrigger');
                break;

            // ---- reusables ----
            case 'tpl': {
                const t = this.template(msg.id);
                if (!t) { break; }
                const node = { kind: 'template', template: t };
                if (msg.act === 'run') { run('agentfarm.runTemplate', node); }
                else if (msg.act === 'delete' && await this.confirm(`Delete template "${t.title}"?`, 'Delete')) {
                    run('agentfarm.deleteTemplate', node);
                }
                break;
            }
            case 'wf': {
                const w = this.workflow(msg.id);
                if (!w) { break; }
                const node = { kind: 'workflow', workflow: w };
                if (msg.act === 'run') { run('agentfarm.runWorkflow', node); }
                else if (msg.act === 'rename') { run('agentfarm.renameWorkflow', node); }
                else if (msg.act === 'addstep') { run('agentfarm.addWorkflowStep', node); }
                else if (msg.act === 'delete') { run('agentfarm.deleteWorkflow', node); } // command confirms
                break;
            }
            case 'wf-add':
                run('agentfarm.newWorkflow');
                break;

            // ---- analytics bridges ----
            case 'open-history':
                run('agentfarm.openTaskHistory');
                break;
            case 'open-forecast':
                run('agentfarm.openForecast');
                break;

            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'openGuide':
                run('agentfarm.openGuide', 'tasks-sayfasi');
                break;
        }
    }

    private dispose(): void {
        TasksPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
