import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildForecast, familyDurations } from '../core/forecast';
import { TaskManager } from '../core/tasks';
import { buildAgentTaskStats, buildTaskFamilies, taskAlerts, TaskRecord, titleFamily } from '../core/taskstats';
import { buildTriggerStats, triggerAlerts } from '../core/triggerstats';
import { AccountSpendReport } from '../core/accountSpend';
import { markdownTable } from '../core/mdTable';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';

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
    /**
     * ‼️ X-252 — SPEND, BY THE SIGN-IN THAT PAID FOR IT, over the same window
     * this page already reads everything else on.
     *
     * This is the page the question belongs on: the account cards on the Engines
     * page answer "today", which is a live figure beside a live percentage, and
     * "which sign-in runs cheap and which runs expensive" is a HISTORY question
     * with no home anywhere. It is deliberately its own section rather than a
     * column on an existing one — every other table here is about TASKS, and a
     * session's spend is not a task's (ONE SUBJECT).
     *
     * Optional because the caller may have no session index to ask (tests, a
     * one-off tool), and a page that draws no section is better than one that
     * draws an empty table nobody can explain.
     */
    accountSpend?(days: number): AccountSpendReport;
}

const DAY_MS = 24 * 3600 * 1000;
/** The window every other figure on this page is already cut to. */
const SPEND_DAYS = 30;

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
        queue: { count: queued.length, etaMs: queueEtaMs, known: queueKnown },
        // X-252 — the same 30 days the rest of this page is cut to, so the two
        // halves of a heavy month are read against each other rather than
        // against two different windows.
        spendDays: SPEND_DAYS,
        accountSpend: deps.accountSpend?.(SPEND_DAYS)
    };
}

export class TaskAnalyticsPanel {
    private static current: TaskAnalyticsPanel | undefined;
    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<TaskAnalyticsPanel>();
    private disposables: vscode.Disposable[] = [];

    static show(deps: TaskAnalyticsDeps): void {
        if (TaskAnalyticsPanel.current) {
            TaskAnalyticsPanel.current.host.reveal();
            TaskAnalyticsPanel.current.refresh();
            return;
        }
        TaskAnalyticsPanel.current = new TaskAnalyticsPanel(
            desktopHost({ viewType: 'agentfarm.taskAnalytics', title: 'Agent Farm — Task Analytics' }), deps);
    }

    /**
     * X-456 — the analytics on a phone's view, without the spend by sign-in: that is the Accounts'
     * data, which a phone sees only at admin, so the section is not drawn there.
     */
    static openOn(host: PanelHost, deps: TaskAnalyticsDeps): void {
        TaskAnalyticsPanel.phones.add(new TaskAnalyticsPanel(host, { ...deps, accountSpend: undefined }));
    }

    static refreshIfOpen(): void {
        TaskAnalyticsPanel.current?.refresh();
        for (const p of TaskAnalyticsPanel.phones) { p.refresh(); }
    }

    private constructor(readonly host: PanelHost, private deps: TaskAnalyticsDeps) {
        host.webview.html = htmlShell(
            host.webview, deps.extensionUri, 'Agent Farm Task Analytics',
            buildData(deps), 'taskAnalytics.js');
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.refresh()));
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private onMessage(msg: {
        type: string; to?: string; name?: string;
        title?: string; cols?: unknown; rows?: unknown;
    }): void {
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'open-history': void vscode.commands.executeCommand('agentfarm.openTaskHistory'); break;
            case 'open-forecast': void vscode.commands.executeCommand('agentfarm.openForecast'); break;
            case 'open-tasks': void vscode.commands.executeCommand('agentfarm.openTasks'); break;
            case 'export-md': {
                // B-21 — the page sends the rows it is showing; the document is
                // built here, by the function tasks.analytics.export uses.
                const cols = Array.isArray(msg.cols) ? msg.cols.map(c => String(c ?? '')) : [];
                const rows = Array.isArray(msg.rows)
                    ? msg.rows.filter(Array.isArray).map(r => (r as unknown[]).map(v => String(v ?? '')))
                    : [];
                if (!cols.length) { break; }
                void this.saveMarkdown(
                    markdownTable({ title: String(msg.title || 'Agent Farm — task analytics'), cols, rows }),
                    typeof msg.name === 'string' ? msg.name : 'analytics');
                break;
            }
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
        // A phone's view closing leaves the desktop's tab alone.
        if (TaskAnalyticsPanel.current === this) { TaskAnalyticsPanel.current = undefined; }
        TaskAnalyticsPanel.phones.delete(this);
        for (const d of this.disposables) { d.dispose(); }
        this.disposables = [];
    }
}
