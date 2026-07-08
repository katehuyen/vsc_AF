import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, discoverAgents } from './core/agents';
import { buildInsights, Insight } from './core/health';
import {
    hasOurHooks, installHooksInto, removeHooksFrom, userSettingsPath
} from './core/hooksInstaller';
import { LiveMonitor } from './core/live';
import { findDuplicateGroups, syncGroup } from './core/memorySync';
import { DEFAULT_PRICING, PriceRule, PricingEngine } from './core/pricing';
import { buildFleetReport } from './core/report';
import { SessionIndex } from './core/sessions';
import { ScheduleKind, TaskManager, TaskMode } from './core/tasks';
import { normPath, relTime } from './core/util';
import { AgentDetailPanel } from './panels/agentDetail';
import { DashboardPanel } from './panels/dashboard';
import { GuidePanel } from './panels/guide';
import { SessionViewerPanel } from './panels/sessionViewer';
import { TimelinePanel } from './panels/timeline';
import { FarmStatusBar } from './views/statusBar';
import { TaskNode, TasksTreeProvider } from './views/tasksTree';
import {
    AgentsTreeProvider, FeedTreeProvider, InsightsTreeProvider, SessionsTreeProvider
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

export function activate(context: vscode.ExtensionContext): void {
    let agents: AgentInfo[] = [];
    let insights: Insight[] = [];
    let pricing = new PricingEngine(cfg().get<PriceRule[]>('pricing', DEFAULT_PRICING));

    const index = new SessionIndex(
        claudeDir(),
        pricing,
        () => agents,
        () => cfg().get<boolean>('includeUnmatchedProjects', false),
        () => cfg().get<number>('activeThresholdSeconds', 150) * 1000
    );
    context.subscriptions.push(index);

    const refreshAgents = () => {
        agents = discoverAgents(cfg().get<string[]>('agentRoots', []));
        insights = buildInsights(agents, index, {
            staleMemoryDays: cfg().get<number>('staleMemoryDays', 45),
            contextBudgetTokens: cfg().get<number>('contextBudgetTokens', 8000)
        });
    };
    refreshAgents();

    const live = new LiveMonitor(
        () => ({
            enabled: cfg().get<boolean>('liveMonitor', true),
            port: cfg().get<number>('livePort', 8377),
            stuckThresholdMs: cfg().get<number>('stuckThresholdSeconds', 240) * 1000,
            notifyPermission: cfg().get<boolean>('notifyPermission', true),
            notifyStuck: cfg().get<boolean>('notifyStuck', true),
            notifyTurnEnd: cfg().get<boolean>('notifyTurnEnd', false)
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
        }
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
        () => cfg().get<boolean>('queueAutoAdvance', false)
    );
    context.subscriptions.push(taskManager);

    const agentsTree = new AgentsTreeProvider(state);
    const sessionsTree = new SessionsTreeProvider(state);
    const insightsTree = new InsightsTreeProvider(state);
    const feedTree = new FeedTreeProvider(state);
    const tasksTree = new TasksTreeProvider(taskManager);

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
        insights = buildInsights(agents, index, {
            staleMemoryDays: cfg().get<number>('staleMemoryDays', 45),
            contextBudgetTokens: cfg().get<number>('contextBudgetTokens', 8000)
        });
        agentsTree.refresh();
        sessionsTree.refresh();
        insightsTree.refresh();
        feedTree.refresh();
    }, null, context.subscriptions);

    // Initial scan + live watch of ~/.claude/projects
    void index.scanAll().then(() => index.watch());

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
        windowTokenLimit: () => cfg().get<number>('windowTokenLimit', 0)
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
            TimelinePanel.show({ extensionUri: context.extensionUri, live });
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
                    TimelinePanel.show({ extensionUri: context.extensionUri, live });
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
                    { label: '$(sync) Sync all copies from one source', id: 'sync' }
                ],
                { placeHolder: `${g.name} — ${g.identical ? 'identical' : 'diverged'} across ${g.copies.length} agents` }
            );
            if (!action) { return; }

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
