import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, discoverAgents } from './core/agents';
import {
    addDuty, CADENCES, CLAUDE_MD_SNIPPET, claudeMdReferencesDuties,
    deleteDuty, DUTIES_FILENAME, togglePauseDuty
} from './core/duties';
import { buildInsights, Insight } from './core/health';
import {
    hasOurHooks, installHooksInto, removeHooksFrom, userSettingsPath
} from './core/hooksInstaller';
import { LiveMonitor } from './core/live';
import { addMcpServer, removeMcpServer } from './core/mcp';
import { DEFAULT_MEDIA_PRICING, MediaPriceRule, mediaCostSince, readMediaMetas } from './core/media';
import {
    applyMergedContent, buildMergeDraft, findDuplicateGroups, syncGroup
} from './core/memorySync';
import { SecretsVault } from './core/secrets';
import { DEFAULT_PRICING, PriceRule, PricingEngine } from './core/pricing';
import { buildFleetReport, buildOutputsDigest } from './core/report';
import { SessionIndex } from './core/sessions';
import {
    FarmSchedule, FarmTrigger, newId, PREV_OUTPUT_PLACEHOLDER, sanitizePrompt, ScheduleKind,
    TaskManager, TaskMode, WorkflowStep
} from './core/tasks';
import { TriggerManager } from './core/triggers';
import { normPath, relTime } from './core/util';
import { AgentDetailPanel } from './panels/agentDetail';
import { DashboardPanel } from './panels/dashboard';
import { GalleryPanel } from './panels/gallery';
import { GuidePanel } from './panels/guide';
import { SessionViewerPanel } from './panels/sessionViewer';
import { TimelinePanel } from './panels/timeline';
import { FarmStatusBar } from './views/statusBar';
import { TaskNode, TasksTreeProvider } from './views/tasksTree';
import {
    AgentNode, AgentsTreeProvider, FeedTreeProvider, InsightsTreeProvider, SessionsTreeProvider
} from './views/trees';

function cfg() {
    return vscode.workspace.getConfiguration('agentFarm');
}

function claudeDir(): string {
    const custom = cfg().get<string>('claudeDir', '');
    return custom && custom.trim() ? custom : path.join(os.homedir(), '.claude');
}

const CLAUDE_MD_TEMPLATE = `# {NAME}

## Role
Describe this agent's identity, mission and boundaries here.

## Working style
- Keep answers concise.
- Read memory/MEMORY.md at session start.

## Memory discipline
- One fact per file under memory/.
- Keep MEMORY.md as the index; add a line for every new memory file.
`;

const MEMORY_MD_TEMPLATE = `# Memory Index

<!-- One line per memory file: - [Title](file.md) — short hook -->
`;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    let agents: AgentInfo[] = [];
    let insights: Insight[] = [];
    let pricing = new PricingEngine(cfg().get<PriceRule[]>('pricing', DEFAULT_PRICING));

    // B2: secrets vault (OS keychain via SecretStorage), cached for sync use.
    const vault = new SecretsVault(context.secrets, context.globalState);
    await vault.refresh();

    // B4: outbound notification forwarding (n8n / Make / any webhook).
    const postForward = (type: string, message: string): void => {
        const url = cfg().get<string>('notifyWebhookUrl', '');
        if (!url) { return; }
        const events = cfg().get<string[]>('notifyWebhookEvents',
            ['permission', 'stalled', 'budget', 'workflow-done', 'workflow-failed']);
        if (!events.includes(type)) { return; }
        fetch(vault.substitute(url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'agent-farm', type, message, ts: new Date().toISOString() })
        }).catch(() => { /* fire-and-forget */ });
    };

    const index = new SessionIndex(
        claudeDir(),
        pricing,
        () => agents,
        () => cfg().get<boolean>('includeUnmatchedProjects', false),
        () => cfg().get<number>('activeThresholdSeconds', 150) * 1000
    );
    context.subscriptions.push(index);

    const healthConfig = () => ({
        staleMemoryDays: cfg().get<number>('staleMemoryDays', 45),
        contextBudgetTokens: cfg().get<number>('contextBudgetTokens', 8000),
        budgets: cfg().get<Record<string, number>>('budgets', {}),
        trendFactor: cfg().get<number>('trendAlertFactor', 2)
    });

    const refreshAgents = () => {
        agents = discoverAgents(cfg().get<string[]>('agentRoots', []));
        insights = buildInsights(agents, index, healthConfig());
    };
    refreshAgents();

    // Budget alerts: notify once per day per agent/fleet label.
    const budgetNotified = new Set<string>();
    const notifyBudgets = () => {
        const today = new Date().toISOString().slice(0, 10);
        for (const ins of insights) {
            if (ins.category !== 'budget' || ins.severity !== 'error') { continue; }
            const key = `${today}:${ins.agentName}`;
            if (budgetNotified.has(key)) { continue; }
            budgetNotified.add(key);
            postForward('budget', `${ins.agentName} — ${ins.message}`);
            void vscode.window.showWarningMessage(`Agent Farm: ${ins.agentName} — ${ins.message}`, 'Open Dashboard')
                .then(choice => {
                    if (choice === 'Open Dashboard') {
                        void vscode.commands.executeCommand('agentfarm.openDashboard');
                    }
                });
        }
    };

    let triggerManagerRef: TriggerManager | undefined;
    const live = new LiveMonitor(
        () => ({
            enabled: cfg().get<boolean>('liveMonitor', true),
            port: cfg().get<number>('livePort', 8377),
            stuckThresholdMs: cfg().get<number>('stuckThresholdSeconds', 240) * 1000,
            notifyPermission: cfg().get<boolean>('notifyPermission', true),
            notifyStuck: cfg().get<boolean>('notifyStuck', true),
            notifyTurnEnd: cfg().get<boolean>('notifyTurnEnd', false),
            forward: postForward
        }),
        (cwd) => {
            if (!cwd) { return {}; }
            const n = normPath(cwd);
            let best: AgentInfo | undefined;
            for (const a of agents) {
                if (n === a.normDir || n.startsWith(a.normDir + '/')) {
                    if (!best || a.normDir.length > best.normDir.length) { best = a; }
                }
            }
            return best ? { agentId: best.id, agentName: best.name } : {};
        },
        // B3 inbound: /trigger/<token> → webhook trigger (late-bound; manager is created below)
        (token, payload) => triggerManagerRef?.fireWebhook(token, payload) ?? false
    );
    context.subscriptions.push(live);
    live.start();

    const state = {
        getAgents: () => agents,
        index,
        getInsights: () => insights,
        live
    };

    const taskManager = new TaskManager(
        path.join(context.globalStorageUri.fsPath, 'farm-tasks.json'),
        () => agents,
        () => cfg().get<boolean>('queueAutoAdvance', false),
        () => cfg().get<string>('taskExtraArgs', ''),
        {
            judgeArgs: () => cfg().get<string>('judgeArgs', '--model claude-haiku-4-5-20251001'),
            maxConcurrent: () => cfg().get<number>('maxConcurrentTasks', 2),
            maxConcurrentPerAgent: () => cfg().get<number>('maxConcurrentPerAgent', 1),
            outputsMaxMB: () => cfg().get<number>('outputsMaxMB', 200),
            quotaCheck: () => {
                const guard = cfg().get<number>('quotaGuardPercent', 0);
                const limit = cfg().get<number>('windowTokenLimit', 0);
                if (guard <= 0 || limit <= 0) { return undefined; }
                const pct = 100 * index.windowUsage().tokens / limit;
                return pct >= guard ? `quota guard (${Math.round(pct)}% of 5h window)` : undefined;
            },
            getEnv: () => vault.env(),
            resolveTemplate: (s) => vault.substitute(s),
            forward: postForward,
            mediaAuth: () => {
                const secretName = cfg().get<string>('mediaAuthSecret', 'FAL_KEY');
                const key = vault.get(secretName);
                return key ? `Key ${key}` : '';
            },
            mediaBaseUrl: () => cfg().get<string>('mediaBaseUrl', '') || undefined as unknown as string,
            mediaPricing: () => cfg().get<MediaPriceRule[]>('mediaPricing', DEFAULT_MEDIA_PRICING)
        }
    );
    context.subscriptions.push(taskManager);

    const triggerManager = new TriggerManager(taskManager, () => agents, live);
    triggerManagerRef = triggerManager;
    context.subscriptions.push(triggerManager);

    const agentsTree = new AgentsTreeProvider(state);
    const sessionsTree = new SessionsTreeProvider(state);
    const insightsTree = new InsightsTreeProvider(state);
    const feedTree = new FeedTreeProvider(state);
    const tasksTree = new TasksTreeProvider(taskManager, triggerManager);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agentfarm.agents', agentsTree),
        vscode.window.registerTreeDataProvider('agentfarm.sessions', sessionsTree),
        vscode.window.registerTreeDataProvider('agentfarm.insights', insightsTree),
        vscode.window.registerTreeDataProvider('agentfarm.feed', feedTree),
        vscode.window.registerTreeDataProvider('agentfarm.tasks', tasksTree)
    );

    const refreshAll = () => {
        refreshAgents();
        agentsTree.refresh();
        sessionsTree.refresh();
        insightsTree.refresh();
        feedTree.refresh();
        tasksTree.refresh();
    };

    index.onDidUpdate(() => {
        insights = buildInsights(agents, index, healthConfig());
        notifyBudgets();
        agentsTree.refresh();
        sessionsTree.refresh();
        insightsTree.refresh();
        feedTree.refresh();
    }, null, context.subscriptions);

    // Automatic fleet reports (e.g. into an Obsidian vault folder), checked hourly.
    const isoWeek = (d: Date): string => {
        const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    };
    const checkAutoReport = () => {
        const cadence = cfg().get<string>('autoReport', 'off');
        const folder = cfg().get<string>('autoReportFolder', '');
        if (cadence === 'off' || !folder || !fs.existsSync(folder)) { return; }
        const now = new Date();
        const stampStr = cadence === 'weekly' ? isoWeek(now) : now.toISOString().slice(0, 10);
        const file = path.join(folder, `AgentFarm-Report-${stampStr}.md`);
        if (fs.existsSync(file)) { return; }
        try {
            const days = cfg().get<number>('autoReportDays', 7);
            let md = buildFleetReport(agents, index, insights, days);
            if (cfg().get<boolean>('autoReportIncludeOutputs', true)) {
                const sinceMs = days * 24 * 3600 * 1000;
                const hasOutputs = taskManager.tasks.some(t =>
                    t.outputFile && t.endedAt && t.endedAt >= Date.now() - sinceMs &&
                    (t.status === 'done' || t.status === 'failed'));
                if (hasOutputs) {
                    md += '\n\n' + buildOutputsDigest(taskManager.tasks, sinceMs)
                        .replace(/^# .*$/m, '## Task outputs')
                        .replace(/^## /gm, '### ')
                        .replace(/^### Task outputs/m, '## Task outputs');
                }
            }
            fs.writeFileSync(file, md, 'utf8');
            void vscode.window.showInformationMessage(
                `Agent Farm: fleet report written — ${path.basename(file)}`, 'Open')
                .then(choice => {
                    if (choice === 'Open') {
                        void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
                    }
                });
        } catch { /* folder not writable — retried next hour */ }
    };
    const reportTimer = setInterval(checkAutoReport, 3600_000);
    context.subscriptions.push({ dispose: () => clearInterval(reportTimer) });

    // Initial scan + live watch of ~/.claude/projects
    void index.scanAll().then(() => {
        index.watch();
        checkAutoReport();
    });

    // Watch agent roots for structural changes (new agents, memory edits)
    for (const root of cfg().get<string[]>('agentRoots', [])) {
        if (!root || !fs.existsSync(root)) { continue; }
        try {
            const watcher = fs.watch(root, { recursive: true }, () => {
                debouncedRootRefresh();
            });
            context.subscriptions.push({ dispose: () => watcher.close() });
        } catch { /* recursive watch unavailable */ }
    }
    let rootTimer: NodeJS.Timeout | undefined;
    const debouncedRootRefresh = () => {
        if (rootTimer) { clearTimeout(rootTimer); }
        rootTimer = setTimeout(() => {
            refreshAll();
            index.reassignAgents();
            DashboardPanel.refreshIfOpen();
        }, 800);
    };

    live.onDidUpdate(() => {
        agentsTree.refresh();
        feedTree.refresh();
    }, null, context.subscriptions);

    context.subscriptions.push(new FarmStatusBar(index, live));

    const dashboardDeps = {
        extensionUri: context.extensionUri,
        getAgents: () => agents,
        index,
        getInsights: () => insights,
        getPricing: () => pricing,
        windowTokenLimit: () => cfg().get<number>('windowTokenLimit', 0),
        budgets: () => cfg().get<Record<string, number>>('budgets', {}),
        mediaCost: () => ({
            today: mediaCostSince(taskManager.outputsDir, 24 * 3600 * 1000),
            month: mediaCostSince(taskManager.outputsDir, 30 * 24 * 3600 * 1000)
        })
    };
    const detailDeps = {
        extensionUri: context.extensionUri,
        getAgents: () => agents,
        index,
        getInsights: () => insights,
        contextBudget: () => cfg().get<number>('contextBudgetTokens', 8000)
    };
    const viewerDeps = {
        extensionUri: context.extensionUri,
        getPricing: () => pricing,
        maxMessages: () => cfg().get<number>('maxTranscriptMessages', 400)
    };

    let pendingMerge: { name: string; files: string[] } | undefined;

    type AgentArg = { agentId?: string; agent?: AgentInfo } | undefined;
    const resolveAgent = async (arg: AgentArg): Promise<AgentInfo | undefined> => {
        if (arg?.agent) { return arg.agent; }
        const id = arg?.agentId;
        if (id) { return agents.find(a => a.id === id); }
        const pick = await vscode.window.showQuickPick(
            agents.map(a => ({ label: a.name, description: a.dir, agent: a })),
            { placeHolder: 'Select an agent' }
        );
        return pick?.agent;
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('agentfarm.openDashboard', () => {
            DashboardPanel.show(dashboardDeps);
        }),

        vscode.commands.registerCommand('agentfarm.openGuide', (anchor?: string) => {
            GuidePanel.show(context.extensionUri, typeof anchor === 'string' ? anchor : undefined);
        }),

        vscode.commands.registerCommand('agentfarm.refresh', async () => {
            refreshAll();
            await index.scanAll();
            index.reassignAgents();
            DashboardPanel.refreshIfOpen();
        }),

        vscode.commands.registerCommand('agentfarm.openAgentDetail', async (arg: AgentArg & { kind?: string }) => {
            const agent = arg && 'kind' in (arg as object) && (arg as { agent?: AgentInfo }).agent
                ? (arg as { agent: AgentInfo }).agent
                : await resolveAgent(arg);
            if (agent) { AgentDetailPanel.show(agent.id, detailDeps); }
        }),

        vscode.commands.registerCommand('agentfarm.openSession', (file?: string) => {
            if (typeof file === 'string' && file) {
                SessionViewerPanel.show(file, viewerDeps);
            }
        }),

        vscode.commands.registerCommand('agentfarm.openTimeline', () => {
            TimelinePanel.show({ extensionUri: context.extensionUri, live, tasks: taskManager });
        }),

        vscode.commands.registerCommand('agentfarm.installHooks', async () => {
            const port = cfg().get<number>('livePort', 8377);
            const userFile = userSettingsPath(claudeDir());
            const target = await vscode.window.showQuickPick(
                [
                    {
                        label: 'User settings — all sessions (recommended)',
                        description: userFile,
                        files: [userFile]
                    },
                    {
                        label: 'Per-agent settings.local.json',
                        description: `${agents.length} agent folder(s)`,
                        files: agents.map(a => path.join(a.dir, '.claude', 'settings.local.json'))
                    }
                ],
                { placeHolder: 'Where should the live hooks be installed?' }
            );
            if (!target) { return; }
            const confirmed = await vscode.window.showWarningMessage(
                `Agent Farm will merge its live hooks into:\n${target.files.join('\n')}\n\nExisting settings are preserved and a one-time .agentfarm-bak backup is created.`,
                { modal: true },
                'Install'
            );
            if (confirmed !== 'Install') { return; }
            const results = target.files.map(f => installHooksInto(f, port));
            const failed = results.filter(r => !r.ok);
            if (failed.length) {
                void vscode.window.showErrorMessage(
                    `Agent Farm: hook install failed for ${failed.map(f => `${f.file} (${f.error})`).join('; ')}`);
            }
            const okCount = results.filter(r => r.ok).length;
            if (okCount) {
                const choice = await vscode.window.showInformationMessage(
                    `Agent Farm: live hooks installed into ${okCount} file(s). Restart running claude sessions to activate them.`,
                    'Open Timeline'
                );
                if (choice === 'Open Timeline') {
                    TimelinePanel.show({ extensionUri: context.extensionUri, live, tasks: taskManager });
                }
            }
        }),

        vscode.commands.registerCommand('agentfarm.removeHooks', async () => {
            const candidates = [
                userSettingsPath(claudeDir()),
                ...agents.map(a => path.join(a.dir, '.claude', 'settings.local.json'))
            ].filter(hasOurHooks);
            if (!candidates.length) {
                void vscode.window.showInformationMessage('Agent Farm: no live hooks found to remove.');
                return;
            }
            const confirmed = await vscode.window.showWarningMessage(
                `Remove Agent Farm live hooks from:\n${candidates.join('\n')}`,
                { modal: true },
                'Remove'
            );
            if (confirmed !== 'Remove') { return; }
            let removed = 0;
            for (const f of candidates) {
                const r = removeHooksFrom(f);
                if (r?.ok) { removed++; }
            }
            void vscode.window.showInformationMessage(
                `Agent Farm: live hooks removed from ${removed} file(s).`);
        }),

        vscode.commands.registerCommand('agentfarm.openFile', (p?: string) => {
            if (typeof p === 'string') {
                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(p));
            }
        }),

        vscode.commands.registerCommand('agentfarm.startSession', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const terminal = vscode.window.createTerminal({ name: `claude: ${agent.name}`, cwd: agent.dir });
            terminal.show();
            terminal.sendText('claude', true);
        }),

        vscode.commands.registerCommand('agentfarm.continueSession', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const terminal = vscode.window.createTerminal({ name: `claude: ${agent.name}`, cwd: agent.dir });
            terminal.show();
            terminal.sendText('claude --continue', true);
        }),

        vscode.commands.registerCommand('agentfarm.openAgentInNewWindow', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(agent.dir), { forceNewWindow: true });
        }),

        vscode.commands.registerCommand('agentfarm.revealAgent', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(agent.dir));
        }),

        vscode.commands.registerCommand('agentfarm.addTask', async () => {
            const agent = await resolveAgent(undefined);
            if (!agent) { return; }
            const title = await vscode.window.showInputBox({
                prompt: `Task title for ${agent.name}`, ignoreFocusOut: true
            });
            if (!title) { return; }
            const prompt = await vscode.window.showInputBox({
                prompt: 'Prompt to send to claude', value: title, ignoreFocusOut: true
            });
            if (!prompt) { return; }
            const mode = await vscode.window.showQuickPick(
                [
                    { label: 'Interactive', description: 'opens a claude session with this prompt', mode: 'interactive' as TaskMode },
                    { label: 'Headless', description: 'claude -p — runs the prompt and exits', mode: 'headless' as TaskMode }
                ],
                { placeHolder: 'How should this task run?' }
            );
            if (!mode) { return; }
            const task = taskManager.addTask(agent, title, prompt, mode.mode);
            const start = await vscode.window.showInformationMessage(
                `Agent Farm: task "${title}" queued for ${agent.name}.`, 'Start now');
            if (start === 'Start now') { taskManager.startTask(task); }
        }),

        vscode.commands.registerCommand('agentfarm.addSchedule', async () => {
            const agent = await resolveAgent(undefined);
            if (!agent) { return; }
            const title = await vscode.window.showInputBox({
                prompt: `Schedule title for ${agent.name}`, ignoreFocusOut: true
            });
            if (!title) { return; }
            const prompt = await vscode.window.showInputBox({
                prompt: 'Prompt to send to claude', value: title, ignoreFocusOut: true
            });
            if (!prompt) { return; }
            const kindPick = await vscode.window.showQuickPick(
                [
                    { label: 'Daily', sched: 'daily' as ScheduleKind },
                    { label: 'Weekly', sched: 'weekly' as ScheduleKind },
                    { label: 'Once', sched: 'once' as ScheduleKind }
                ],
                { placeHolder: 'How often?' }
            );
            if (!kindPick) { return; }

            let hour = 9, minute = 0, dow: number | undefined, onceAt: number | undefined;
            if (kindPick.sched === 'once') {
                const when = await vscode.window.showInputBox({
                    prompt: 'When? (YYYY-MM-DD HH:MM)', ignoreFocusOut: true,
                    validateInput: v => isNaN(Date.parse(v.replace(' ', 'T'))) ? 'Use YYYY-MM-DD HH:MM' : undefined
                });
                if (!when) { return; }
                onceAt = Date.parse(when.replace(' ', 'T'));
            } else {
                const time = await vscode.window.showInputBox({
                    prompt: 'Time of day (HH:MM)', value: '09:00', ignoreFocusOut: true,
                    validateInput: v => /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? undefined : 'Use HH:MM (24h)'
                });
                if (!time) { return; }
                [hour, minute] = time.split(':').map(Number);
                if (kindPick.sched === 'weekly') {
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayPick = await vscode.window.showQuickPick(
                        days.map((d, i) => ({ label: d, dow: i })), { placeHolder: 'Which day?' });
                    if (!dayPick) { return; }
                    dow = dayPick.dow;
                }
            }
            const mode = await vscode.window.showQuickPick(
                [
                    { label: 'Interactive', mode: 'interactive' as TaskMode },
                    { label: 'Headless', description: 'claude -p — runs and exits', mode: 'headless' as TaskMode }
                ],
                { placeHolder: 'Run mode' }
            );
            if (!mode) { return; }
            taskManager.addSchedule({
                agentId: agent.id, agentName: agent.name, title, prompt,
                mode: mode.mode, kind: kindPick.sched, hour, minute, dow, onceAt, enabled: true
            });
            void vscode.window.showInformationMessage(
                `Agent Farm: schedule "${title}" created (runs while VS Code is open).`);
        }),

        vscode.commands.registerCommand('agentfarm.startTask', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.startTask(node.task); }
        }),
        vscode.commands.registerCommand('agentfarm.completeTask', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.completeTask(node.task); }
        }),
        vscode.commands.registerCommand('agentfarm.cancelTask', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.cancelTask(node.task); }
        }),
        vscode.commands.registerCommand('agentfarm.deleteTask', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.deleteTask(node.task); }
        }),
        vscode.commands.registerCommand('agentfarm.taskUp', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.moveTask(node.task, -1); }
        }),
        vscode.commands.registerCommand('agentfarm.taskDown', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.moveTask(node.task, 1); }
        }),
        vscode.commands.registerCommand('agentfarm.clearDoneTasks', () => {
            const n = taskManager.clearFinished();
            void vscode.window.showInformationMessage(`Agent Farm: removed ${n} finished task(s).`);
        }),
        vscode.commands.registerCommand('agentfarm.revealTaskTerminal', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.revealTerminal(node.task); }
        }),
        vscode.commands.registerCommand('agentfarm.toggleSchedule', (node?: TaskNode) => {
            if (node?.kind === 'schedule') { taskManager.toggleSchedule(node.schedule); }
        }),
        vscode.commands.registerCommand('agentfarm.deleteSchedule', (node?: TaskNode) => {
            if (node?.kind === 'schedule') { taskManager.deleteSchedule(node.schedule); }
        }),
        vscode.commands.registerCommand('agentfarm.runScheduleNow', (node?: TaskNode) => {
            if (node?.kind === 'schedule') { taskManager.runScheduleNow(node.schedule); }
        }),

        vscode.commands.registerCommand('agentfarm.quickStart', () => {
            GuidePanel.show(context.extensionUri, 'hizli-baslangic');
        }),

        vscode.commands.registerCommand('agentfarm.openExamples', (anchor?: string) => {
            GuidePanel.show(context.extensionUri,
                typeof anchor === 'string' ? anchor : undefined,
                'ORNEKLER.tr.md', 'Agent Farm — Örnek Kullanımlar');
        }),

        vscode.commands.registerCommand('agentfarm.openRoadmap', (anchor?: string) => {
            GuidePanel.show(context.extensionUri,
                typeof anchor === 'string' ? anchor : undefined,
                'GELISIM-PLANI.tr.md', 'Agent Farm — Gelişim Planı');
        }),

        vscode.commands.registerCommand('agentfarm.addDuty', async (arg?: AgentNode | { agentId?: string }) => {
            let agent: AgentInfo | undefined;
            if (arg && 'kind' in arg && (arg.kind === 'section' || arg.kind === 'agent' || arg.kind === 'duty')) {
                agent = arg.agent;
            } else {
                agent = await resolveAgent(arg as { agentId?: string } | undefined);
            }
            if (!agent) { return; }

            const title = await vscode.window.showInputBox({
                prompt: `Duty title for ${agent.name} (e.g. "Inbox triage")`, ignoreFocusOut: true
            });
            if (!title) { return; }

            const cadenceDescriptions: Record<string, string> = {
                'every-turn': 'agent checks on every turn',
                'session-start': 'checked once at session start',
                'daily': 'first opportunity each day',
                'weekly': 'first opportunity each week',
                'manual': 'only when you ask'
            };
            const cadencePick = await vscode.window.showQuickPick(
                CADENCES.map(c => ({ label: c, description: cadenceDescriptions[c] })),
                { placeHolder: 'How often should the agent check?', ignoreFocusOut: true }
            );
            if (!cadencePick) { return; }

            const watchPick = await vscode.window.showQuickPick(
                [
                    { label: '$(file) Pick a file to watch…', id: 'file' },
                    { label: '$(folder) Pick a folder to watch…', id: 'folder' },
                    { label: '$(edit) Type a path or description', id: 'type' },
                    { label: '$(circle-slash) No watch target', id: 'none' }
                ],
                { placeHolder: 'What should the agent watch?', ignoreFocusOut: true }
            );
            if (!watchPick) { return; }
            let watch: string | undefined;
            if (watchPick.id === 'file' || watchPick.id === 'folder') {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: watchPick.id === 'file',
                    canSelectFolders: watchPick.id === 'folder',
                    canSelectMany: false,
                    openLabel: 'Watch this'
                });
                if (!picked?.length) { return; }
                watch = picked[0].fsPath;
            } else if (watchPick.id === 'type') {
                watch = await vscode.window.showInputBox({
                    prompt: 'Path or description of the watch target', ignoreFocusOut: true
                });
                if (watch === undefined) { return; }
                watch = watch.trim() || undefined;
            }

            const action = await vscode.window.showInputBox({
                prompt: 'Do: what should the agent do when something changed / is waiting?',
                ignoreFocusOut: true,
                placeHolder: 'e.g. Cevaplanmış soruların gereğini yap ve soruyu dosyadan sil'
            });
            if (!action) { return; }

            addDuty(agent.dir, {
                title, cadence: cadencePick.label, paused: false, watch, action
            });

            // The duty only works if the agent actually reads DUTIES.md.
            if (agent.claudeMdPath) {
                const claudeMd = fs.readFileSync(agent.claudeMdPath, 'utf8');
                if (!claudeMdReferencesDuties(claudeMd)) {
                    const choice = await vscode.window.showWarningMessage(
                        `${agent.name}'s CLAUDE.md does not mention ${DUTIES_FILENAME} yet — without a reference the agent will never check its duties. Append a short instruction section?`,
                        { modal: true }, 'Append to CLAUDE.md'
                    );
                    if (choice === 'Append to CLAUDE.md') {
                        fs.writeFileSync(agent.claudeMdPath, claudeMd.replace(/\n*$/, '\n') + CLAUDE_MD_SNIPPET, 'utf8');
                    }
                }
            }
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: duty "${title}" added to ${agent.name} (${DUTIES_FILENAME}).`);
        }),

        vscode.commands.registerCommand('agentfarm.toggleDuty', (node?: AgentNode) => {
            if (node?.kind === 'duty') {
                togglePauseDuty(node.agent.dir, node.duty.title);
                refreshAll();
            }
        }),

        vscode.commands.registerCommand('agentfarm.deleteDuty', async (node?: AgentNode) => {
            if (node?.kind !== 'duty') { return; }
            const confirmed = await vscode.window.showWarningMessage(
                `Delete duty "${node.duty.title}" from ${node.agent.name}?`, { modal: true }, 'Delete');
            if (confirmed === 'Delete') {
                deleteDuty(node.agent.dir, node.duty.title);
                refreshAll();
            }
        }),

        vscode.commands.registerCommand('agentfarm.openDuties', (node?: AgentNode) => {
            const agent = node && 'agent' in node ? node.agent : undefined;
            if (agent?.dutiesPath) {
                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(agent.dutiesPath));
            }
        }),

        vscode.commands.registerCommand('agentfarm.openGallery', () => {
            GalleryPanel.show({ extensionUri: context.extensionUri, tasks: taskManager });
        }),

        vscode.commands.registerCommand('agentfarm.rerunMedia', async (taskId?: string, vary?: boolean) => {
            const meta = readMediaMetas(taskManager.outputsDir).find(m => m.taskId === taskId);
            if (!meta) {
                void vscode.window.showWarningMessage('Agent Farm: media metadata not found.');
                return;
            }
            let input = meta.input;
            if (vary) {
                const edited = await vscode.window.showInputBox({
                    prompt: `Vary input for ${meta.model}`, value: meta.input, ignoreFocusOut: true
                });
                if (!edited) { return; }
                input = edited;
            }
            taskManager.runMediaAdhoc(meta.title + (vary ? ' (vary)' : ' (re-run)'), meta.model, input);
            void vscode.window.showInformationMessage(`Agent Farm: media job started — ${meta.model}`);
        }),

        vscode.commands.registerCommand('agentfarm.addRecipe', async () => {
            const recipes: { label: string; description: string; build: (agent: AgentInfo) => WorkflowStep[] }[] = [
                {
                    label: 'Metin → Görsel',
                    description: 'ajan görsel prompt\'u yazar, Flux üretir',
                    build: (agent) => [
                        {
                            agentId: agent.id, agentName: agent.name, title: 'görsel promptu',
                            prompt: 'Şu konu için tek paragraflık, İngilizce, ayrıntılı bir görsel üretim promptu yaz (sadece promptu yaz): KONUYU BURAYA YAZ',
                            mode: 'headless'
                        },
                        {
                            agentId: '', agentName: 'media', title: 'görsel üret', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/flux/schnell', input: '{"prompt": "{prev_text}"}' }
                        }
                    ]
                },
                {
                    label: 'Metin → Görsel → Video',
                    description: 'içerik fabrikası: prompt → görsel → kısa video',
                    build: (agent) => [
                        {
                            agentId: agent.id, agentName: agent.name, title: 'sahne promptu',
                            prompt: 'Şu konu için İngilizce, sinematik tek paragraf görsel/video promptu yaz (sadece promptu): KONUYU BURAYA YAZ',
                            mode: 'headless'
                        },
                        {
                            agentId: '', agentName: 'media', title: 'kapak görseli', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/flux/schnell', input: '{"prompt": "{prev_text}"}' }
                        },
                        {
                            agentId: '', agentName: 'media', title: 'kısa video', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/kling-video/v2/master/text-to-video', input: '{"prompt": "{prev_text}", "duration": "5"}', timeoutMin: 20 }
                        }
                    ]
                },
                {
                    label: 'Ses → Metin (Whisper)',
                    description: 'ses dosyasını metne çevir, ajan özetlesin',
                    build: (agent) => [
                        {
                            agentId: '', agentName: 'media', title: 'transkript', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/whisper', input: '{"audio_url": "SES DOSYASI URL BURAYA"}' }
                        },
                        {
                            agentId: agent.id, agentName: agent.name, title: 'özetle',
                            prompt: 'Şu transkripti Türkçe maddelerle özetle: {prev_text}',
                            mode: 'headless'
                        }
                    ]
                }
            ];
            const pick = await vscode.window.showQuickPick(recipes, { placeHolder: 'Hazır reçete seç (kurulduktan sonra adımları düzenleyebilirsin)' });
            if (!pick) { return; }
            const agent = await resolveAgent(undefined);
            if (!agent) { return; }
            taskManager.addWorkflow(pick.label, pick.build(agent));
            void vscode.window.showInformationMessage(
                `Agent Farm: "${pick.label}" reçetesi kuruldu — Tasks → Workflows altında adımları (KONU/URL yer tutucularını) düzenleyip ▶ ile çalıştır. Medya adımları için FAL_KEY sırrı gerekli.`);
        }),

        vscode.commands.registerCommand('agentfarm.setSecret', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Secret name (used as env var and {secret:NAME}, e.g. FAL_KEY)',
                validateInput: v => /^[\w.-]+$/.test(v) ? undefined : 'Letters, digits, _ . - only',
                ignoreFocusOut: true
            });
            if (!name) { return; }
            const value = await vscode.window.showInputBox({
                prompt: `Value for ${name}`, password: true, ignoreFocusOut: true
            });
            if (value === undefined) { return; }
            await vault.set(name, value);
            void vscode.window.showInformationMessage(
                `Agent Farm: secret "${name}" stored in the OS keychain (injected into tasks as env + {secret:${name}}).`);
        }),

        vscode.commands.registerCommand('agentfarm.deleteSecret', async () => {
            const names = vault.names();
            if (!names.length) {
                void vscode.window.showInformationMessage('Agent Farm: no secrets stored.');
                return;
            }
            const pick = await vscode.window.showQuickPick(names, { placeHolder: 'Delete which secret?' });
            if (!pick) { return; }
            await vault.delete(pick);
            void vscode.window.showInformationMessage(`Agent Farm: secret "${pick}" deleted.`);
        }),

        vscode.commands.registerCommand('agentfarm.listSecrets', () => {
            const names = vault.names();
            void vscode.window.showInformationMessage(
                names.length
                    ? `Agent Farm secrets (values hidden): ${names.join(', ')}`
                    : 'Agent Farm: no secrets stored — use "Set Secret…".');
        }),

        vscode.commands.registerCommand('agentfarm.addMcpServer', async (node?: AgentNode) => {
            const agent = node && 'agent' in node ? node.agent : await resolveAgent(undefined);
            if (!agent) { return; }
            const name = await vscode.window.showInputBox({
                prompt: `MCP server name for ${agent.name} (e.g. obsidian)`, ignoreFocusOut: true,
                validateInput: v => /^[\w-]+$/.test(v) ? undefined : 'Letters, digits, - _ only'
            });
            if (!name) { return; }
            const kind = await vscode.window.showQuickPick(
                [
                    { label: 'stdio (command)', id: 'stdio' },
                    { label: 'http / sse (url)', id: 'http' }
                ], { placeHolder: 'Transport', ignoreFocusOut: true });
            if (!kind) { return; }
            let def: { command?: string; url?: string; type?: string };
            if (kind.id === 'stdio') {
                const command = await vscode.window.showInputBox({
                    prompt: 'Command (e.g. npx -y @some/mcp-server)', ignoreFocusOut: true
                });
                if (!command) { return; }
                def = { command };
            } else {
                const url = await vscode.window.showInputBox({
                    prompt: 'Server URL', ignoreFocusOut: true
                });
                if (!url) { return; }
                def = { url, type: 'http' };
            }
            const file = addMcpServer(agent, name, def);
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: MCP server "${name}" added to ${path.basename(file)}. Restart the agent's sessions to load it.`);
        }),

        vscode.commands.registerCommand('agentfarm.removeMcpServer', async (node?: AgentNode) => {
            if (node?.kind !== 'mcp-server') { return; }
            const confirmed = await vscode.window.showWarningMessage(
                `Remove MCP server "${node.server.name}" from ${node.server.source}? (a one-time .afbak backup is kept)`,
                { modal: true }, 'Remove');
            if (confirmed !== 'Remove') { return; }
            if (removeMcpServer(node.server)) {
                refreshAll();
                void vscode.window.showInformationMessage(`Agent Farm: MCP server "${node.server.name}" removed.`);
            } else {
                void vscode.window.showWarningMessage('Agent Farm: could not remove (file unreadable or entry missing).');
            }
        }),

        vscode.commands.registerCommand('agentfarm.copyWebhookUrl', async (node?: TaskNode) => {
            if (node?.kind !== 'trigger' || node.trigger.type !== 'webhook' || !node.trigger.token) { return; }
            const port = cfg().get<number>('livePort', 8377);
            const url = `http://127.0.0.1:${port}/trigger/${node.trigger.token}`;
            await vscode.env.clipboard.writeText(url);
            void vscode.window.showInformationMessage(`Agent Farm: webhook URL copied — ${url}`);
        }),

        vscode.commands.registerCommand('agentfarm.addTrigger', async () => {
            const title = await vscode.window.showInputBox({
                prompt: 'Trigger name (e.g. "Inbox fabrikası")', ignoreFocusOut: true
            });
            if (!title) { return; }
            const typePick = await vscode.window.showQuickPick(
                [
                    { label: '$(file-directory) Watch a folder', description: 'fires when files change inside', type: 'watch' as const, dir: true },
                    { label: '$(file) Watch a file', description: 'fires when the file changes', type: 'watch' as const, dir: false },
                    { label: '$(broadcast) Hook event', description: 'fires on a live event (needs Live Hooks)', type: 'hook' as const, dir: false },
                    { label: '$(globe) Webhook', description: 'fires when n8n/Make/anything POSTs to a local URL', type: 'webhook' as const, dir: false }
                ],
                { placeHolder: 'What should fire this trigger?', ignoreFocusOut: true }
            );
            if (!typePick) { return; }

            let watchPath: string | undefined;
            let hookEvent: string | undefined;
            let hookAgent: string | undefined;
            let token: string | undefined;
            if (typePick.type === 'webhook') {
                token = newId() + newId();
            } else if (typePick.type === 'watch') {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFolders: typePick.dir, canSelectFiles: !typePick.dir,
                    canSelectMany: false, openLabel: 'Watch this'
                });
                if (!picked?.length) { return; }
                watchPath = picked[0].fsPath;
            } else {
                const eventPick = await vscode.window.showQuickPick(
                    [
                        { label: 'stop', description: 'an agent finished its turn' },
                        { label: 'end', description: 'a session ended' },
                        { label: 'permission', description: 'an agent is waiting for permission' },
                        { label: 'compact', description: 'a session compacted' },
                        { label: 'subagent', description: 'a subagent finished' }
                    ],
                    { placeHolder: 'Which live event?', ignoreFocusOut: true }
                );
                if (!eventPick) { return; }
                hookEvent = eventPick.label;
                const agentFilter = await vscode.window.showQuickPick(
                    [{ label: 'Any agent' }, ...agents.map(a => ({ label: a.name }))],
                    { placeHolder: 'Only for a specific agent?', ignoreFocusOut: true });
                if (!agentFilter) { return; }
                if (agentFilter.label !== 'Any agent') { hookAgent = agentFilter.label; }
            }

            const actionPick = await vscode.window.showQuickPick(
                [
                    { label: '$(play) Run a task', id: 'task' },
                    ...(taskManager.workflows.length ? [{ label: '$(type-hierarchy-sub) Run a workflow', id: 'workflow' }] : [])
                ],
                { placeHolder: 'What should it do?', ignoreFocusOut: true }
            );
            if (!actionPick) { return; }

            let action: FarmTrigger['action'];
            if (actionPick.id === 'workflow') {
                const wfPick = await vscode.window.showQuickPick(
                    taskManager.workflows.map(w => ({ label: w.title, description: `${w.steps.length} steps`, w })),
                    { placeHolder: 'Which workflow?', ignoreFocusOut: true });
                if (!wfPick) { return; }
                action = { kind: 'workflow', workflowId: wfPick.w.id };
            } else {
                const agent = await resolveAgent(undefined);
                if (!agent) { return; }
                const prompt = await vscode.window.showInputBox({
                    prompt: 'Task prompt — {watch} = watched path, {payload} = webhook body',
                    value: typePick.type === 'watch' ? 'DUTIES.md dosyanı oku ve şu hedefle ilgili görevini uygula: {watch}'
                        : typePick.type === 'webhook' ? 'Şu isteği işle: {payload}' : '',
                    ignoreFocusOut: true
                });
                if (!prompt) { return; }
                action = {
                    kind: 'task', agentId: agent.id, agentName: agent.name,
                    title: title, prompt, mode: 'headless'
                };
            }

            taskManager.addTrigger({
                title, type: typePick.type, watchPath, hookEvent, hookAgent, token, action,
                debounceSec: typePick.type === 'watch' ? 10 : 1,
                cooldownSec: 60, maxPerHour: 6, enabled: true
            });
            if (typePick.type === 'webhook' && token) {
                const url = `http://127.0.0.1:${cfg().get<number>('livePort', 8377)}/trigger/${token}`;
                await vscode.env.clipboard.writeText(url);
                void vscode.window.showInformationMessage(
                    `Agent Farm: webhook trigger armed — URL copied to clipboard: ${url} (POST; body JSON'u {payload} olarak göreve girer).`);
            } else {
                void vscode.window.showInformationMessage(
                    `Agent Farm: trigger "${title}" armed. (debounce 10s, cooldown 60s, max 6/h — edit in farm-tasks.json if needed)`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.toggleTrigger', (node?: TaskNode) => {
            if (node?.kind === 'trigger') { taskManager.toggleTrigger(node.trigger); }
        }),
        vscode.commands.registerCommand('agentfarm.deleteTrigger', async (node?: TaskNode) => {
            if (node?.kind !== 'trigger') { return; }
            const confirmed = await vscode.window.showWarningMessage(
                `Delete trigger "${node.trigger.title}"?`, { modal: true }, 'Delete');
            if (confirmed === 'Delete') { taskManager.deleteTrigger(node.trigger); }
        }),
        vscode.commands.registerCommand('agentfarm.fireTrigger', (node?: TaskNode) => {
            if (node?.kind === 'trigger') { triggerManager.fire(node.trigger, 'manual'); }
        }),

        vscode.commands.registerCommand('agentfarm.openTaskHistory', async () => {
            const dir = taskManager.historyDir;
            if (!fs.existsSync(dir)) {
                void vscode.window.showInformationMessage('Agent Farm: no task history yet.');
                return;
            }
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort().reverse();
            if (!files.length) {
                void vscode.window.showInformationMessage('Agent Farm: no task history yet.');
                return;
            }
            const pick = await vscode.window.showQuickPick(files, { placeHolder: 'Which month?' });
            if (pick) {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(dir, pick)));
            }
        }),

        vscode.commands.registerCommand('agentfarm.saveTaskTemplate', async (node?: TaskNode) => {
            if (node?.kind !== 'task') { return; }
            const t = node.task;
            const bindAgent = await vscode.window.showQuickPick(
                [
                    { label: `Bind to ${t.agentName}`, bind: true },
                    { label: 'Any agent (choose at run time)', bind: false }
                ],
                { placeHolder: 'Template scope' }
            );
            if (!bindAgent) { return; }
            taskManager.addTemplate({
                title: t.title, prompt: t.prompt, mode: t.mode,
                agentId: bindAgent.bind ? t.agentId : undefined,
                agentName: bindAgent.bind ? t.agentName : undefined
            });
            void vscode.window.showInformationMessage(`Agent Farm: template "${t.title}" saved.`);
        }),

        vscode.commands.registerCommand('agentfarm.runTemplate', async (node?: TaskNode) => {
            let template = node?.kind === 'template' ? node.template : undefined;
            if (!template) {
                const pick = await vscode.window.showQuickPick(
                    taskManager.templates.map(t => ({
                        label: t.title, description: t.agentName ?? 'any agent', template: t
                    })),
                    { placeHolder: 'Which template?' }
                );
                template = pick?.template;
            }
            if (!template) { return; }
            const agent = template.agentId
                ? agents.find(a => a.id === template.agentId)
                : await resolveAgent(undefined);
            if (!agent) {
                void vscode.window.showWarningMessage('Agent Farm: agent not found for this template.');
                return;
            }
            const task = taskManager.addTask(agent, template.title, template.prompt, template.mode);
            taskManager.startTask(task);
        }),

        vscode.commands.registerCommand('agentfarm.deleteTemplate', (node?: TaskNode) => {
            if (node?.kind === 'template') { taskManager.deleteTemplate(node.template); }
        }),

        vscode.commands.registerCommand('agentfarm.newWorkflow', async () => {
            const title = await vscode.window.showInputBox({
                prompt: 'Workflow name', ignoreFocusOut: true
            });
            if (!title) { return; }
            const steps: WorkflowStep[] = [];
            for (;;) {
                const stepNo = steps.length + 1;
                const agentPick = await vscode.window.showQuickPick(
                    [
                        ...agents.map(a => ({ label: a.name, description: a.dir, agent: a as AgentInfo | undefined, isWebhook: false, isMedia: false })),
                        { label: '$(globe) Webhook step', description: 'HTTP call to n8n/Make/any URL — no agent', agent: undefined as AgentInfo | undefined, isWebhook: true, isMedia: false },
                        { label: '$(device-camera-video) Media step (fal.ai)', description: 'image/video/audio generation — needs FAL_KEY secret', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: true },
                        ...(steps.length ? [{ label: '$(check) Finish workflow', description: `${steps.length} step(s)`, agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false }] : [])
                    ],
                    { placeHolder: `Step ${stepNo}: which agent?`, ignoreFocusOut: true }
                );
                if (!agentPick) { return; }
                if (agentPick.isMedia) {
                    const mTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (media)`, value: 'Görsel üret', ignoreFocusOut: true
                    });
                    if (!mTitle) { return; }
                    const mModel = await vscode.window.showInputBox({
                        prompt: 'fal.ai model id — güncel listeyi fal.ai/models\'ten doğrula',
                        value: 'fal-ai/flux/schnell',
                        placeHolder: 'örn. fal-ai/flux/schnell, fal-ai/kling-video/v2/master/text-to-video',
                        ignoreFocusOut: true
                    });
                    if (!mModel) { return; }
                    const mInput = await vscode.window.showInputBox({
                        prompt: 'JSON input template — {prev_text}/{prev_json.x} çözülür',
                        value: '{"prompt": "{prev_text}"}', ignoreFocusOut: true
                    });
                    if (!mInput) { return; }
                    steps.push({
                        agentId: '', agentName: 'media', title: mTitle, prompt: '', mode: 'headless',
                        media: { model: mModel, input: mInput }
                    });
                    continue;
                }
                if (agentPick.isWebhook) {
                    const whTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (webhook)`, value: 'Dışarı bildir', ignoreFocusOut: true
                    });
                    if (!whTitle) { return; }
                    const whUrl = await vscode.window.showInputBox({
                        prompt: 'URL — {secret:NAME} and {prev_*} variables are substituted',
                        placeHolder: 'https://n8n.example.com/webhook/…', ignoreFocusOut: true
                    });
                    if (!whUrl) { return; }
                    const whMethod = await vscode.window.showQuickPick(['POST', 'GET'],
                        { placeHolder: 'Method', ignoreFocusOut: true });
                    if (!whMethod) { return; }
                    const whBody = whMethod === 'GET' ? '' : ((await vscode.window.showInputBox({
                        prompt: 'JSON body template — e.g. {"text": "{prev_text}"} (empty = none)',
                        ignoreFocusOut: true
                    })) ?? '');
                    steps.push({
                        agentId: '', agentName: 'webhook', title: whTitle,
                        prompt: '', mode: 'headless',
                        webhook: { url: whUrl, method: whMethod, body: whBody.trim() || undefined }
                    });
                    continue;
                }
                if (!agentPick.agent) { break; }
                const stepTitle = await vscode.window.showInputBox({
                    prompt: `Step ${stepNo} title (${agentPick.agent.name})`, ignoreFocusOut: true
                });
                if (!stepTitle) { return; }
                const stepPrompt = await vscode.window.showInputBox({
                    prompt: `Step ${stepNo} prompt — use ${PREV_OUTPUT_PLACEHOLDER} for the previous step's output file`,
                    value: stepTitle, ignoreFocusOut: true
                });
                if (!stepPrompt) { return; }
                const stepMode = await vscode.window.showQuickPick(
                    [
                        { label: 'Headless', description: 'recommended for chains — output is archived and passed on', mode: 'headless' as TaskMode },
                        { label: 'Interactive', description: 'opens a terminal; chain continues when it closes', mode: 'interactive' as TaskMode }
                    ],
                    { placeHolder: `Step ${stepNo} run mode`, ignoreFocusOut: true }
                );
                if (!stepMode) { return; }
                const onFailPick = await vscode.window.showQuickPick(
                    [
                        { label: 'Stop workflow (default)', onFail: 'stop' as const },
                        { label: 'Continue to next step', onFail: 'continue' as const },
                        { label: 'Jump to step…', onFail: 'goto' as const }
                    ],
                    { placeHolder: `Step ${stepNo}: if it fails?`, ignoreFocusOut: true }
                );
                if (!onFailPick) { return; }
                let onFail: 'stop' | 'continue' | number = 'stop';
                if (onFailPick.onFail === 'goto') {
                    const target = await vscode.window.showInputBox({
                        prompt: 'Jump to step number (1-based)', ignoreFocusOut: true,
                        validateInput: v => /^\d+$/.test(v) && Number(v) >= 1 ? undefined : 'Enter a step number'
                    });
                    if (!target) { return; }
                    onFail = Number(target);
                } else {
                    onFail = onFailPick.onFail;
                }
                const runIf = steps.length === 0 ? '' : (await vscode.window.showInputBox({
                    prompt: `Step ${stepNo}: run only if previous output matches (regex, or json:field~regex) — empty = always run`,
                    ignoreFocusOut: true
                }) ?? '');
                const contractPick = stepMode.mode === 'headless'
                    ? await vscode.window.showQuickPick(
                        [
                            { label: 'Text output (default)', contract: undefined as 'json' | undefined },
                            { label: 'JSON output', description: 'structured handoff: next step can use {prev_json.field}', contract: 'json' as const }
                        ],
                        { placeHolder: `Step ${stepNo} output contract`, ignoreFocusOut: true })
                    : { contract: undefined };
                if (!contractPick) { return; }
                const verifyCriteria = stepMode.mode === 'headless'
                    ? ((await vscode.window.showInputBox({
                        prompt: `Step ${stepNo}: verification criteria for the cheap-model judge — empty = no verification`,
                        placeHolder: 'e.g. Çıktı en az 3 maddelik bir plan içermeli',
                        ignoreFocusOut: true
                    })) ?? '')
                    : '';
                steps.push({
                    agentId: agentPick.agent.id, agentName: agentPick.agent.name,
                    title: stepTitle, prompt: stepPrompt, mode: stepMode.mode,
                    onFail: onFail === 'stop' ? undefined : onFail,
                    runIf: runIf.trim() || undefined,
                    outputContract: contractPick.contract,
                    verify: verifyCriteria.trim() ? { criteria: verifyCriteria.trim(), retries: 1 } : undefined
                });
            }
            if (!steps.length) { return; }
            taskManager.addWorkflow(title, steps);
            const run = await vscode.window.showInformationMessage(
                `Agent Farm: workflow "${title}" created (${steps.length} steps).`, 'Run now');
            if (run === 'Run now') {
                const w = taskManager.workflows[taskManager.workflows.length - 1];
                taskManager.runWorkflow(w);
            }
        }),

        vscode.commands.registerCommand('agentfarm.runWorkflow', (node?: TaskNode) => {
            if (node?.kind === 'workflow') { taskManager.runWorkflow(node.workflow); }
        }),

        vscode.commands.registerCommand('agentfarm.renameWorkflow', async (node?: TaskNode) => {
            if (node?.kind !== 'workflow') { return; }
            const title = await vscode.window.showInputBox({
                prompt: 'Workflow name', value: node.workflow.title, ignoreFocusOut: true
            });
            if (title) { taskManager.renameWorkflow(node.workflow, title); }
        }),

        vscode.commands.registerCommand('agentfarm.addWorkflowStep', async (node?: TaskNode) => {
            if (node?.kind !== 'workflow') { return; }
            const agent = await resolveAgent(undefined);
            if (!agent) { return; }
            const stepTitle = await vscode.window.showInputBox({
                prompt: `New step title (${agent.name})`, ignoreFocusOut: true
            });
            if (!stepTitle) { return; }
            const stepPrompt = await vscode.window.showInputBox({
                prompt: `Step prompt — ${PREV_OUTPUT_PLACEHOLDER} inserts the previous step's output file`,
                value: stepTitle, ignoreFocusOut: true
            });
            if (!stepPrompt) { return; }
            const mode = await vscode.window.showQuickPick(
                [
                    { label: 'Headless', mode: 'headless' as TaskMode },
                    { label: 'Interactive', mode: 'interactive' as TaskMode }
                ], { placeHolder: 'Run mode' });
            if (!mode) { return; }
            taskManager.addWorkflowStep(node.workflow, {
                agentId: agent.id, agentName: agent.name,
                title: stepTitle, prompt: stepPrompt, mode: mode.mode
            });
        }),

        vscode.commands.registerCommand('agentfarm.editWorkflowStep', async (node?: TaskNode) => {
            if (node?.kind !== 'workflow-step') { return; }
            const w = node.workflow;
            const step = w.steps[node.index];
            const field = await vscode.window.showQuickPick(
                [
                    { label: 'Title', description: step.title, id: 'title' },
                    ...(step.webhook ? [
                        { label: 'Webhook URL', description: step.webhook.url.slice(0, 50), id: 'whUrl' },
                        { label: 'Webhook body', description: (step.webhook.body ?? '(none)').slice(0, 50), id: 'whBody' }
                    ] : []),
                    ...(step.media ? [
                        { label: 'Media model', description: step.media.model, id: 'mModel' },
                        { label: 'Media input', description: step.media.input.slice(0, 50), id: 'mInput' }
                    ] : []),
                    { label: 'Prompt', description: step.prompt.slice(0, 60), id: 'prompt' },
                    { label: 'Agent', description: step.agentName, id: 'agent' },
                    { label: 'Mode', description: step.mode, id: 'mode' },
                    { label: 'On fail', description: String(step.onFail ?? 'stop'), id: 'onFail' },
                    { label: 'Run-if condition', description: step.runIf ?? '(always runs)', id: 'runIf' },
                    { label: 'Output contract', description: step.outputContract ?? 'text', id: 'contract' },
                    { label: 'Verification', description: step.verify ? `${step.verify.criteria.slice(0, 40)} (retries ${step.verify.retries ?? 1})` : '(none)', id: 'verify' }
                ],
                { placeHolder: `Edit step ${node.index + 1}: ${step.title}` }
            );
            if (!field) { return; }
            switch (field.id) {
                case 'title': {
                    const v = await vscode.window.showInputBox({ prompt: 'Step title', value: step.title, ignoreFocusOut: true });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { title: v }); }
                    break;
                }
                case 'whUrl': {
                    const v = await vscode.window.showInputBox({ prompt: 'Webhook URL', value: step.webhook!.url, ignoreFocusOut: true });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { webhook: { ...step.webhook!, url: v } }); }
                    break;
                }
                case 'whBody': {
                    const v = await vscode.window.showInputBox({ prompt: 'Webhook body template (empty = none)', value: step.webhook!.body ?? '', ignoreFocusOut: true });
                    if (v === undefined) { return; }
                    taskManager.updateWorkflowStep(w, node.index, { webhook: { ...step.webhook!, body: v.trim() || undefined } });
                    break;
                }
                case 'mModel': {
                    const v = await vscode.window.showInputBox({ prompt: 'fal.ai model id', value: step.media!.model, ignoreFocusOut: true });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { media: { ...step.media!, model: v } }); }
                    break;
                }
                case 'mInput': {
                    const v = await vscode.window.showInputBox({ prompt: 'JSON input template', value: step.media!.input, ignoreFocusOut: true });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { media: { ...step.media!, input: v } }); }
                    break;
                }
                case 'prompt': {
                    const v = await vscode.window.showInputBox({
                        prompt: `Step prompt (${PREV_OUTPUT_PLACEHOLDER} = previous output file)`,
                        value: step.prompt, ignoreFocusOut: true
                    });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { prompt: v }); }
                    break;
                }
                case 'agent': {
                    const agent = await resolveAgent(undefined);
                    if (agent) {
                        taskManager.updateWorkflowStep(w, node.index, { agentId: agent.id, agentName: agent.name });
                    }
                    break;
                }
                case 'mode': {
                    const v = await vscode.window.showQuickPick(
                        [
                            { label: 'Headless', mode: 'headless' as TaskMode },
                            { label: 'Interactive', mode: 'interactive' as TaskMode }
                        ], { placeHolder: 'Run mode' });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { mode: v.mode }); }
                    break;
                }
                case 'onFail': {
                    const v = await vscode.window.showQuickPick(
                        [
                            { label: 'Stop workflow', value: undefined as 'continue' | number | undefined },
                            { label: 'Continue to next step', value: 'continue' as const },
                            { label: 'Jump to step…', value: 'goto' as unknown as number }
                        ], { placeHolder: 'If this step fails?' });
                    if (!v) { return; }
                    if (String(v.value) === 'goto') {
                        const target = await vscode.window.showInputBox({
                            prompt: 'Jump to step number (1-based)', ignoreFocusOut: true,
                            validateInput: x => /^\d+$/.test(x) && Number(x) >= 1 ? undefined : 'Enter a step number'
                        });
                        if (!target) { return; }
                        taskManager.updateWorkflowStep(w, node.index, { onFail: Number(target) });
                    } else {
                        taskManager.updateWorkflowStep(w, node.index, { onFail: v.value });
                    }
                    break;
                }
                case 'runIf': {
                    const v = await vscode.window.showInputBox({
                        prompt: 'Run only if previous output matches (regex, or json:field~regex) — empty = always run',
                        value: step.runIf ?? '', ignoreFocusOut: true
                    });
                    if (v === undefined) { return; }
                    taskManager.updateWorkflowStep(w, node.index, { runIf: v.trim() || undefined });
                    break;
                }
                case 'contract': {
                    const v = await vscode.window.showQuickPick(
                        [
                            { label: 'Text output', contract: undefined as 'json' | undefined },
                            { label: 'JSON output', description: 'next step can use {prev_json.field}', contract: 'json' as const }
                        ], { placeHolder: 'Output contract' });
                    if (!v) { return; }
                    taskManager.updateWorkflowStep(w, node.index, { outputContract: v.contract });
                    break;
                }
                case 'verify': {
                    const criteria = await vscode.window.showInputBox({
                        prompt: 'Verification criteria for the judge — empty = remove verification',
                        value: step.verify?.criteria ?? '', ignoreFocusOut: true
                    });
                    if (criteria === undefined) { return; }
                    if (!criteria.trim()) {
                        taskManager.updateWorkflowStep(w, node.index, { verify: undefined });
                        break;
                    }
                    const retries = await vscode.window.showInputBox({
                        prompt: 'Retries on FAIL', value: String(step.verify?.retries ?? 1),
                        validateInput: x => /^\d+$/.test(x) ? undefined : 'Enter a number', ignoreFocusOut: true
                    });
                    if (retries === undefined) { return; }
                    taskManager.updateWorkflowStep(w, node.index, {
                        verify: { criteria: criteria.trim(), retries: Number(retries) }
                    });
                    break;
                }
            }
        }),

        vscode.commands.registerCommand('agentfarm.moveWorkflowStepUp', (node?: TaskNode) => {
            if (node?.kind === 'workflow-step') {
                taskManager.moveWorkflowStep(node.workflow, node.index, -1);
            }
        }),

        vscode.commands.registerCommand('agentfarm.moveWorkflowStepDown', (node?: TaskNode) => {
            if (node?.kind === 'workflow-step') {
                taskManager.moveWorkflowStep(node.workflow, node.index, 1);
            }
        }),

        vscode.commands.registerCommand('agentfarm.deleteWorkflowStep', async (node?: TaskNode) => {
            if (node?.kind !== 'workflow-step') { return; }
            const step = node.workflow.steps[node.index];
            const confirmed = await vscode.window.showWarningMessage(
                `Delete step ${node.index + 1} ("${step.title}") from "${node.workflow.title}"?`,
                { modal: true }, 'Delete');
            if (confirmed === 'Delete') {
                taskManager.deleteWorkflowStep(node.workflow, node.index);
            }
        }),

        vscode.commands.registerCommand('agentfarm.deleteWorkflow', async (node?: TaskNode) => {
            if (node?.kind !== 'workflow') { return; }
            const confirmed = await vscode.window.showWarningMessage(
                `Delete workflow "${node.workflow.title}"?`, { modal: true }, 'Delete');
            if (confirmed === 'Delete') { taskManager.deleteWorkflow(node.workflow); }
        }),

        vscode.commands.registerCommand('agentfarm.openTaskOutput', (node?: TaskNode) => {
            if (node?.kind !== 'task') { return; }
            const out = node.task.outputFile;
            if (out && fs.existsSync(out)) {
                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(out));
            } else {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no archived output — only headless tasks capture output.');
            }
        }),

        vscode.commands.registerCommand('agentfarm.exportSchtask', async (node?: TaskNode) => {
            let schedule: FarmSchedule | undefined = node?.kind === 'schedule' ? node.schedule : undefined;
            if (!schedule) {
                const pick = await vscode.window.showQuickPick(
                    taskManager.schedules.map(s => ({ label: s.title, description: s.agentName, s })),
                    { placeHolder: 'Which schedule?' });
                schedule = pick?.s;
            }
            if (!schedule) { return; }
            const agent = agents.find(a => a.id === schedule.agentId);
            if (!agent) {
                void vscode.window.showWarningMessage('Agent Farm: agent for this schedule not found.');
                return;
            }
            const scriptsDir = path.join(context.globalStorageUri.fsPath, 'schtasks');
            fs.mkdirSync(scriptsDir, { recursive: true });
            const logFile = path.join(taskManager.outputsDir, `schtask-${schedule.id}.log`);
            fs.mkdirSync(taskManager.outputsDir, { recursive: true });
            const cmdFile = path.join(scriptsDir, `af-${schedule.id}.cmd`);
            fs.writeFileSync(cmdFile,
                `@echo off\r\n` +
                `rem Agent Farm scheduled task: ${schedule.title} (${agent.name})\r\n` +
                `cd /d "${agent.dir}"\r\n` +
                `claude -p "${sanitizePrompt(schedule.prompt)}" >> "${logFile}" 2>&1\r\n`,
                'utf8');
            const hm = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
            const dowNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            let scPart: string;
            if (schedule.kind === 'weekly') {
                scPart = `/SC WEEKLY /D ${dowNames[schedule.dow ?? 0]} /ST ${hm}`;
            } else if (schedule.kind === 'once') {
                const d = new Date(schedule.onceAt ?? Date.now());
                const sd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                const st = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                scPart = `/SC ONCE /SD ${sd} /ST ${st}`;
            } else {
                scPart = `/SC DAILY /ST ${hm}`;
            }
            const schtasksCmd =
                `schtasks /Create /TN "AgentFarm\\${schedule.title.replace(/[\\/:*?"<>|]/g, '_')}" ` +
                `/TR "\\"${cmdFile}\\"" ${scPart} /F`;
            await vscode.env.clipboard.writeText(schtasksCmd);
            const choice = await vscode.window.showInformationMessage(
                `Agent Farm: script written and the schtasks command copied to clipboard. ` +
                `Paste it into a terminal to register the Windows scheduled task ` +
                `(runs even when VS Code is closed; output goes to the task log). ` +
                `Note: 'claude' must be on PATH for the scheduler.`,
                'Open script', 'Open log folder');
            if (choice === 'Open script') {
                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(cmdFile));
            } else if (choice === 'Open log folder') {
                void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(taskManager.outputsDir));
            }
        }),

        vscode.commands.registerCommand('agentfarm.syncMemory', async () => {
            const groups = findDuplicateGroups(agents);
            if (!groups.length) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no shared memory files found across agents.');
                return;
            }
            const groupPick = await vscode.window.showQuickPick(
                groups.map(g => ({
                    label: `${g.identical ? '$(check)' : '$(warning)'} ${g.name}`,
                    description: g.copies.map(c => c.agent.name).join(', '),
                    detail: g.identical ? 'all copies identical' : 'copies have DIVERGED',
                    group: g
                })),
                { placeHolder: 'Which shared memory file do you want to work on?' }
            );
            if (!groupPick) { return; }
            const g = groupPick.group;

            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(diff) Compare two copies', id: 'diff' },
                    { label: '$(sync) Sync all copies from one source', id: 'sync' },
                    { label: '$(edit) Create merge draft (combine by hand, then apply)', id: 'merge' }
                ],
                { placeHolder: `${g.name} — ${g.identical ? 'identical' : 'diverged'} across ${g.copies.length} agents` }
            );
            if (!action) { return; }

            if (action.id === 'merge') {
                pendingMerge = { name: g.name, files: g.copies.map(c => c.file.path) };
                const doc = await vscode.workspace.openTextDocument({
                    content: buildMergeDraft(g), language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
                void vscode.window.showInformationMessage(
                    `Agent Farm: edit the draft into the final "${g.name}", then run "Agent Farm: Apply Merged Memory".`);
                return;
            }

            if (action.id === 'diff') {
                const left = await vscode.window.showQuickPick(
                    g.copies.map(c => ({
                        label: c.agent.name,
                        description: relTime(c.file.mtime),
                        copy: c
                    })), { placeHolder: 'Left side' });
                if (!left) { return; }
                const right = await vscode.window.showQuickPick(
                    g.copies.filter(c => c !== left.copy).map(c => ({
                        label: c.agent.name,
                        description: relTime(c.file.mtime),
                        copy: c
                    })), { placeHolder: 'Right side' });
                if (!right) { return; }
                await vscode.commands.executeCommand('vscode.diff',
                    vscode.Uri.file(left.copy.file.path),
                    vscode.Uri.file(right.copy.file.path),
                    `${g.name}: ${left.copy.agent.name} ↔ ${right.copy.agent.name}`);
                return;
            }

            const source = await vscode.window.showQuickPick(
                g.copies.map((c, i) => ({
                    label: `${c.agent.name}${i === 0 ? ' (newest)' : ''}`,
                    description: `${relTime(c.file.mtime)} • ${(c.file.size / 1024).toFixed(1)} KB`,
                    copy: c
                })),
                { placeHolder: 'Which copy is the source of truth?' }
            );
            if (!source) { return; }
            const targets = g.copies.filter(c => c !== source.copy);
            const confirmed = await vscode.window.showWarningMessage(
                `Overwrite ${targets.length} copies of "${g.name}" with ${source.copy.agent.name}'s version?\n\n` +
                targets.map(t => t.file.path).join('\n') +
                '\n\nTimestamped .afbak backups are created next to each file.',
                { modal: true }, 'Sync'
            );
            if (confirmed !== 'Sync') { return; }
            const result = syncGroup(g, source.copy.file.path);
            if (result.errors.length) {
                void vscode.window.showErrorMessage('Agent Farm: sync errors — ' + result.errors.join('; '));
            }
            void vscode.window.showInformationMessage(
                `Agent Farm: "${g.name}" synced to ${result.written.length} agent(s) (${result.backups.length} backups).`);
            refreshAll();
        }),

        vscode.commands.registerCommand('agentfarm.applyMergedMemory', async () => {
            if (!pendingMerge) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no merge in progress — start one via "Sync Shared Memory… → Create merge draft".');
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                void vscode.window.showWarningMessage('Agent Farm: open the merge draft editor first.');
                return;
            }
            const confirmed = await vscode.window.showWarningMessage(
                `Write the current editor content as "${pendingMerge.name}" to ${pendingMerge.files.length} agent(s)?\n\n` +
                pendingMerge.files.join('\n') + '\n\nTimestamped .afbak backups are created.',
                { modal: true }, 'Apply'
            );
            if (confirmed !== 'Apply') { return; }
            const result = applyMergedContent(pendingMerge.files, editor.document.getText());
            if (result.errors.length) {
                void vscode.window.showErrorMessage('Agent Farm: merge errors — ' + result.errors.join('; '));
                return;
            }
            void vscode.window.showInformationMessage(
                `Agent Farm: merged "${pendingMerge.name}" written to ${result.written.length} agent(s).`);
            pendingMerge = undefined;
            refreshAll();
        }),

        vscode.commands.registerCommand('agentfarm.exportOutputsDigest', async () => {
            const period = await vscode.window.showQuickPick(
                [
                    { label: 'Today', ms: 24 * 3600 * 1000 },
                    { label: 'Last 7 days', ms: 7 * 24 * 3600 * 1000 },
                    { label: 'Last 30 days', ms: 30 * 24 * 3600 * 1000 }
                ],
                { placeHolder: 'Digest period' }
            );
            if (!period) { return; }
            const md = buildOutputsDigest(taskManager.tasks, period.ms);
            const roots = cfg().get<string[]>('agentRoots', []);
            const defaultDir = cfg().get<string>('autoReportFolder', '') ||
                roots.find(r => fs.existsSync(r)) || os.homedir();
            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(defaultDir,
                    `AgentFarm-Outputs-${new Date().toISOString().slice(0, 10)}.md`)),
                filters: { Markdown: ['md'] }
            });
            if (!target) { return; }
            fs.writeFileSync(target.fsPath, md, 'utf8');
            await vscode.commands.executeCommand('vscode.open', target);
        }),

        vscode.commands.registerCommand('agentfarm.exportReport', async () => {
            const period = await vscode.window.showQuickPick(
                [
                    { label: 'Last 7 days', days: 7 },
                    { label: 'Last 30 days', days: 30 },
                    { label: 'Last 90 days', days: 90 }
                ],
                { placeHolder: 'Report period' }
            );
            if (!period) { return; }
            const md = buildFleetReport(agents, index, insights, period.days);
            const roots = cfg().get<string[]>('agentRoots', []);
            const defaultDir = roots.find(r => fs.existsSync(r)) ?? os.homedir();
            const defaultName = `AgentFarm-Report-${new Date().toISOString().slice(0, 10)}.md`;
            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(defaultDir, defaultName)),
                filters: { Markdown: ['md'] }
            });
            if (!target) { return; }
            fs.writeFileSync(target.fsPath, md, 'utf8');
            await vscode.commands.executeCommand('vscode.open', target);
        }),

        vscode.commands.registerCommand('agentfarm.addAgentRoot', async () => {
            const picked = await vscode.window.showOpenDialog({
                canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
                openLabel: 'Use as Agent Root'
            });
            if (!picked?.length) { return; }
            const roots = cfg().get<string[]>('agentRoots', []);
            const newRoot = picked[0].fsPath.replace(/\\/g, '/');
            if (!roots.includes(newRoot)) {
                await cfg().update('agentRoots', [...roots, newRoot], vscode.ConfigurationTarget.Global);
            }
            refreshAll();
            index.reassignAgents();
        }),

        vscode.commands.registerCommand('agentfarm.newAgent', async () => {
            const roots = cfg().get<string[]>('agentRoots', []).filter(r => fs.existsSync(r));
            if (!roots.length) {
                void vscode.window.showWarningMessage('Agent Farm: configure an agent root folder first.');
                return;
            }
            const root = roots.length === 1
                ? roots[0]
                : (await vscode.window.showQuickPick(roots, { placeHolder: 'Where should the agent live?' }));
            if (!root) { return; }
            const name = await vscode.window.showInputBox({
                prompt: 'New agent name (folder name)',
                validateInput: v => /^[\w-]+$/.test(v) ? undefined : 'Use letters, digits, - or _ only'
            });
            if (!name) { return; }
            const dir = path.join(root, name);
            if (fs.existsSync(dir)) {
                void vscode.window.showWarningMessage(`Agent Farm: "${name}" already exists.`);
                return;
            }
            fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
            fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
            fs.writeFileSync(path.join(dir, 'CLAUDE.md'), CLAUDE_MD_TEMPLATE.replace('{NAME}', name), 'utf8');
            fs.writeFileSync(path.join(dir, 'memory', 'MEMORY.md'), MEMORY_MD_TEMPLATE, 'utf8');
            fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), '{}\n', 'utf8');
            refreshAll();
            void vscode.window.showInformationMessage(`Agent Farm: agent "${name}" created.`);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(dir, 'CLAUDE.md')));
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration('agentFarm')) { return; }
            if (e.affectsConfiguration('agentFarm.pricing')) {
                pricing = new PricingEngine(cfg().get<PriceRule[]>('pricing', DEFAULT_PRICING));
                index.updatePricing(pricing);
                void index.scanAll().then(() => index.reassignAgents());
            }
            if (e.affectsConfiguration('agentFarm.agentRoots')) {
                refreshAll();
                index.reassignAgents();
            }
            if (e.affectsConfiguration('agentFarm.liveMonitor') ||
                e.affectsConfiguration('agentFarm.livePort')) {
                live.start();
            }
            DashboardPanel.refreshIfOpen();
        })
    );
}

export function deactivate(): void { /* disposables handle cleanup */ }
