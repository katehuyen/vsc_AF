import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildForecast, familyDurations } from '../core/forecast';
import { TaskManager } from '../core/tasks';
import { buildAgentTaskStats, buildTaskFamilies, taskAlerts, TaskRecord, titleFamily } from '../core/taskstats';
import { buildTriggerStats, triggerAlerts } from '../core/triggerstats';
import { handleAfNav, htmlShell } from './base';

/**
 * Task Analytics — 30-day throughput, per-agent scorecards, recurring task
 * families, alerts and the forecast.
 *
 * Deliberately NOT part of the Tasks page: those numbers are for READING, the
 * Tasks page is for MANAGING. Mixing them made the control surface something
 * you had to hunt through, and buried the controls under charts nobody needs
 * while switching an automation on.
 */

export interface TaskAnalyticsDeps {
    extensionUri: vscode.Uri;
    manager: TaskManager;
    allRecords(): TaskRecord[];
    forecastDays(): number;
    onDidChange: vscode.Event<void>;
    lastExportDir?: () => string | undefined;
    setLastExportDir?: (dir: string) => void;
}

const DAY_MS = 24 * 3600 * 1000;

function median(xs: number[]): number | undefined {
    if (!xs.length) { return undefined; }
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function buildData(deps: TaskAnalyticsDeps): Record<string, unknown> {
    const now = Date.now();
    const m = deps.manager;
    const records = deps.allRecords();
    const statsMap = buildAgentTaskStats(records, { now });
    const agentRows = [...statsMap.values()].sort((a, b) => b.total - a.total);

    let done = 0, failed = 0, cancelled = 0, retries = 0;
    for (const s of agentRows) { done += s.done; failed += s.failed; cancelled += s.cancelled; retries += s.retries; }
    const durs = records
        .filter(t => t.status === 'done' && t.startedAt && t.endedAt && t.endedAt > t.startedAt
            && (t.endedAt ?? 0) >= now - 30 * DAY_MS)
        .map(t => (t.endedAt as number) - (t.startedAt as number));

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
        ...triggerAlerts(buildTriggerStats(m.triggers, records, { now }))
            .map(a => ({ severity: a.severity, who: a.title, message: a.message }))
    ];

    const forecast = buildForecast(
        m.schedules,
        m.tasks.map(t => ({
            title: t.title, agentName: t.agentName, status: t.status,
            deferredReason: t.deferredReason, startedAt: t.startedAt
        })),
        records, now, deps.forecastDays());

    const fams = familyDurations(records, now);
    let queueEtaMs = 0, queueKnown = 0;
    const queued = m.tasks.filter(t => t.status === 'queued');
    for (const t of queued) {
        const md = fams.get(titleFamily(t.title))?.medianMs;
        if (md) { queueEtaMs += md; queueKnown++; }
    }

    return {
        generatedAt: now,
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

export class TaskAnalyticsPanel {
    private static current: TaskAnalyticsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: TaskAnalyticsDeps): void {
        if (TaskAnalyticsPanel.current) {
            TaskAnalyticsPanel.current.panel.reveal();
            TaskAnalyticsPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.taskAnalytics',
            'Agent Farm — Task Analytics',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        TaskAnalyticsPanel.current = new TaskAnalyticsPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        TaskAnalyticsPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: TaskAnalyticsDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Agent Farm Task Analytics',
            buildData(deps), 'taskAnalytics.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.refresh()));
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private onMessage(msg: { type: string; to?: string; content?: string; name?: string }): void {
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'open-history': void vscode.commands.executeCommand('agentfarm.openTaskHistory'); break;
            case 'open-forecast': void vscode.commands.executeCommand('agentfarm.openForecast'); break;
            case 'open-tasks': void vscode.commands.executeCommand('agentfarm.openTasks'); break;
            case 'export-md':
                if (typeof msg.content === 'string' && msg.content.trim()) {
                    void this.saveMarkdown(msg.content, typeof msg.name === 'string' ? msg.name : 'analytics');
                }
                break;
            case 'afnav': handleAfNav(msg.to); break;
            case 'openGuide': void vscode.commands.executeCommand('agentfarm.openGuide', 'tasks-sayfasi'); break;
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
        TaskAnalyticsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
