import * as vscode from 'vscode';
import { NeedItem } from '../core/needs';
import { FarmSchedule, FarmTask, FarmTemplate, FarmTrigger, FarmWorkflow, TaskManager } from '../core/tasks';
import { buildAgentTaskStats, mergeTaskRecords, readTaskHistory, TaskRecord } from '../core/taskstats';
import { handleAfNav, htmlShell } from './base';

/**
 * Tasks page — the single command center for everything task-related, unifying
 * surfaces that used to be split across the sidebar tree, the Kanban board and
 * separate Forecast/History panels:
 *   • Board       live queue (Inbox / Parked / Running / Needs You / Done) + NL command bar
 *   • Automations Triggers (armed/fired + reliability) and Schedules (next run / missed)
 *   • Reusables   Templates and Workflows
 *   • Analytics   per-agent scorecards (30d), fleet throughput, per-agent load
 * Item actions call TaskManager directly (like the board does); "add" and the
 * node-shaped commands (fire trigger, run template) delegate to the existing
 * commands so there is one source of truth for their logic.
 */

export interface TasksPanelDeps {
    extensionUri: vscode.Uri;
    manager: TaskManager;
    /** urgent Needs-You rows (permission waits + browser approvals + stalls). */
    buildWaiting(): NeedItem[];
    /** natural-language command bar. */
    runCommandText(text: string): Promise<void>;
    settleApproval(id: string, ok: boolean): boolean;
    onDidChangeNeeds: vscode.Event<void>;
    /** one-line reliability per trigger (fired count · 7d ✓/✗ · median delay). */
    triggerStat(t: FarmTrigger): string | undefined;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FINAL = new Set(['done', 'failed', 'cancelled']);

function scheduleWhen(s: FarmSchedule): string {
    const hm = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
    if (s.kind === 'daily') { return `daily ${hm}`; }
    if (s.kind === 'weekly') { return `${DOW[s.dow ?? 0]} ${hm}`; }
    return s.onceAt ? `once ${new Date(s.onceAt).toLocaleString()}` : 'once';
}

/** Next fire time (epoch ms) for an enabled schedule, or undefined. */
function nextRun(s: FarmSchedule, now = Date.now()): number | undefined {
    if (!s.enabled) { return undefined; }
    if (s.kind === 'once') { return s.onceAt && s.onceAt > now ? s.onceAt : undefined; }
    const d = new Date(now);
    d.setSeconds(0, 0); d.setHours(s.hour, s.minute, 0, 0);
    if (s.kind === 'daily') {
        if (d.getTime() <= now) { d.setDate(d.getDate() + 1); }
        return d.getTime();
    }
    // weekly: advance to the next matching weekday
    const target = s.dow ?? 0;
    let guard = 0;
    while ((d.getDay() !== target || d.getTime() <= now) && guard++ < 8) { d.setDate(d.getDate() + 1); }
    return d.getTime();
}

function triggerTarget(t: FarmTrigger): string {
    if (t.type === 'watch') { return t.watchPath ? `watch ${t.watchPath}` : 'watch'; }
    if (t.type === 'hook') { return `hook ${t.hookEvent ?? ''}${t.hookAgent ? ' · ' + t.hookAgent : ''}`.trim(); }
    return 'webhook';
}

function card(t: FarmTask): Record<string, unknown> {
    const durMin = t.startedAt ? Math.max(0, Math.round(((t.endedAt ?? Date.now()) - t.startedAt) / 60000)) : undefined;
    return {
        id: t.id, title: t.title, agentName: t.agentName, mode: t.mode, status: t.status,
        when: t.endedAt ?? t.startedAt ?? t.createdAt, durMin, verified: t.verified,
        deferredReason: t.status === 'queued' ? t.deferredReason : undefined,
        hasOutput: !!t.outputFile, outputFile: t.outputFile
    };
}

function buildData(deps: TasksPanelDeps): Record<string, unknown> {
    const m = deps.manager;
    const tasks = m.tasks;
    const now = Date.now();

    const done = tasks.filter(t => FINAL.has(t.status)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)).slice(0, 30);
    const board = {
        inbox: tasks.filter(t => t.status === 'queued' && !t.autoStart).map(card),
        parked: tasks.filter(t => t.status === 'queued' && t.autoStart).map(card),
        running: tasks.filter(t => t.status === 'running').map(card),
        waiting: deps.buildWaiting(),
        done: done.map(card)
    };

    const automations = {
        triggers: m.triggers.map(t => ({
            id: t.id, title: t.title, type: t.type, target: triggerTarget(t),
            enabled: t.enabled, reliability: deps.triggerStat(t) ?? '', fireCount: t.fireCount ?? 0, lastFiredAt: t.lastFiredAt
        })),
        schedules: m.schedules.map(s => ({
            id: s.id, title: s.title, agent: s.agentName, when: scheduleWhen(s),
            next: nextRun(s, now), enabled: s.enabled, missed: s.missed ?? 'skip'
        }))
    };

    const reusables = {
        templates: m.templates.map(t => ({ id: t.id, title: t.title, agent: t.agentName ?? '', mode: t.mode })),
        workflows: m.workflows.map(w => ({ id: w.id, title: w.title, steps: w.steps.length }))
    };

    const records: TaskRecord[] = mergeTaskRecords(
        tasks as unknown as TaskRecord[],
        readTaskHistory(m.historyDir, now - 30 * 24 * 3600 * 1000));
    const stats = [...buildAgentTaskStats(records, { now }).values()]
        .sort((a, b) => (b.running + b.queued) - (a.running + a.queued) || b.total - a.total);
    const agents = stats.map(s => ({
        agentName: s.agentName, total: s.total, done: s.done, failed: s.failed,
        successRate: s.successRate, medianMs: s.medianDurationMs, queued: s.queued, running: s.running,
        mediaCost: Math.round((s.mediaCostUsd ?? 0) * 100) / 100
    }));
    const totals = {
        queued: tasks.filter(t => t.status === 'queued').length,
        running: tasks.filter(t => t.status === 'running').length,
        done30d: stats.reduce((a, s) => a + s.done, 0),
        failed30d: stats.reduce((a, s) => a + s.failed, 0)
    };

    return { generatedAt: now, board, automations, reusables, analytics: { agents, totals } };
}

export class TasksPanel {
    private static current: TasksPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: TasksPanelDeps): void {
        if (TasksPanel.current) { TasksPanel.current.panel.reveal(); TasksPanel.current.refresh(); return; }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.tasksPage', 'Agent Farm — Tasks', vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true });
        TasksPanel.current = new TasksPanel(panel, deps);
    }

    static refreshIfOpen(): void { TasksPanel.current?.refresh(); }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: TasksPanelDeps) {
        panel.webview.html = htmlShell(panel.webview, deps.extensionUri, 'Agent Farm Tasks', buildData(deps), 'tasks.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.disposables.push(
            deps.manager.onDidChange(() => this.refresh()),
            deps.onDidChangeNeeds(() => this.refresh()));
    }

    refresh(): void { void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) }); }

    private task(id: unknown): FarmTask | undefined { return this.deps.manager.tasks.find(t => t.id === id); }
    private schedule(id: unknown): FarmSchedule | undefined { return this.deps.manager.schedules.find(s => s.id === id); }
    private trigger(id: unknown): FarmTrigger | undefined { return this.deps.manager.triggers.find(t => t.id === id); }
    private template(id: unknown): FarmTemplate | undefined { return this.deps.manager.templates.find(t => t.id === id); }
    private workflow(id: unknown): FarmWorkflow | undefined { return this.deps.manager.workflows.find(w => w.id === id); }

    private async onMessage(msg: { type: string; id?: string; to?: string; text?: string; approvalId?: string; ok?: boolean; file?: string }): Promise<void> {
        const m = this.deps.manager;
        switch (msg.type) {
            case 'refresh': this.refresh(); return;
            case 'afnav': handleAfNav(msg.to); return;
            case 'openGuide': void vscode.commands.executeCommand('agentfarm.openGuide', 'tasks'); return;

            // ---- board ----
            case 'move': {
                const t = this.task(msg.id); if (!t) { break; }
                if (msg.to === 'running' && t.status === 'queued') { m.startTask(t); }
                else if (msg.to === 'done' && t.status === 'running') { m.completeTask(t); }
                else if (msg.to === 'done' && t.status === 'queued') { m.cancelTask(t); }
                else if (msg.to === 'inbox' && t.status === 'queued' && t.autoStart) { t.autoStart = false; t.deferredReason = undefined; m.startTask(t); }
                break;
            }
            case 'cancel': { const t = this.task(msg.id); if (t && (t.status === 'queued' || t.status === 'running')) { m.cancelTask(t); } break; }
            case 'delete-task': { const t = this.task(msg.id); if (t && t.status !== 'running') { m.deleteTask(t); } break; }
            case 'open-output': if (msg.file) { void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.file)); } return;
            case 'approve': if (msg.approvalId) { this.deps.settleApproval(msg.approvalId, msg.ok === true); } break;
            case 'nlcommand': if (msg.text && msg.text.trim()) { await this.deps.runCommandText(msg.text.trim()); } return;

            // ---- automations: schedules ----
            case 'schedule-toggle': { const s = this.schedule(msg.id); if (s) { m.toggleSchedule(s); } break; }
            case 'schedule-run': { const s = this.schedule(msg.id); if (s) { m.runScheduleNow(s); } break; }
            case 'schedule-delete': { const s = this.schedule(msg.id); if (s) { m.deleteSchedule(s); } break; }
            // ---- automations: triggers ----
            case 'trigger-toggle': { const t = this.trigger(msg.id); if (t) { m.toggleTrigger(t); } break; }
            case 'trigger-delete': { const t = this.trigger(msg.id); if (t) { m.deleteTrigger(t); } break; }
            case 'trigger-fire': { const t = this.trigger(msg.id); if (t) { void vscode.commands.executeCommand('agentfarm.fireTrigger', { kind: 'trigger', trigger: t }); } break; }

            // ---- reusables ----
            case 'template-run': { const t = this.template(msg.id); if (t) { void vscode.commands.executeCommand('agentfarm.runTemplate', { kind: 'template', template: t }); } return; }
            case 'template-delete': { const t = this.template(msg.id); if (t) { m.deleteTemplate(t); } break; }
            case 'workflow-run': { const w = this.workflow(msg.id); if (w) { m.runWorkflow(w); } break; }
            case 'workflow-delete': { const w = this.workflow(msg.id); if (w) { m.deleteWorkflow(w); } break; }

            // ---- add (delegate to the prompting commands) + nav to detail panels ----
            case 'add-task': void vscode.commands.executeCommand('agentfarm.addTask'); return;
            case 'add-schedule': void vscode.commands.executeCommand('agentfarm.addSchedule'); return;
            case 'add-trigger': void vscode.commands.executeCommand('agentfarm.addTrigger'); return;
            case 'add-workflow': void vscode.commands.executeCommand('agentfarm.newWorkflow'); return;
            case 'open-forecast': void vscode.commands.executeCommand('agentfarm.openForecast'); return;
            case 'open-history': void vscode.commands.executeCommand('agentfarm.openTaskHistory'); return;
            default: return;
        }
        this.refresh();
    }

    private dispose(): void {
        TasksPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
