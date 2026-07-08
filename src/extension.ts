import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, discoverAgents } from './core/agents';
import { buildInsights, Insight } from './core/health';
import { DEFAULT_PRICING, PriceRule, PricingEngine } from './core/pricing';
import { SessionIndex } from './core/sessions';
import { AgentDetailPanel } from './panels/agentDetail';
import { DashboardPanel } from './panels/dashboard';
import { GuidePanel } from './panels/guide';
import { SessionViewerPanel } from './panels/sessionViewer';
import { FarmStatusBar } from './views/statusBar';
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

    const state = {
        getAgents: () => agents,
        index,
        getInsights: () => insights
    };

    const agentsTree = new AgentsTreeProvider(state);
    const sessionsTree = new SessionsTreeProvider(state);
    const insightsTree = new InsightsTreeProvider(state);
    const feedTree = new FeedTreeProvider(state);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agentfarm.agents', agentsTree),
        vscode.window.registerTreeDataProvider('agentfarm.sessions', sessionsTree),
        vscode.window.registerTreeDataProvider('agentfarm.insights', insightsTree),
        vscode.window.registerTreeDataProvider('agentfarm.feed', feedTree)
    );

    const refreshAll = () => {
        refreshAgents();
        agentsTree.refresh();
        sessionsTree.refresh();
        insightsTree.refresh();
        feedTree.refresh();
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

    context.subscriptions.push(new FarmStatusBar(index));

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
            if (typeof file === 'string') {
                SessionViewerPanel.show(file, viewerDeps);
            }
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
            DashboardPanel.refreshIfOpen();
        })
    );
}

export function deactivate(): void { /* disposables handle cleanup */ }
