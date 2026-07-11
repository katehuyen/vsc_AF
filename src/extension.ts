import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, discoverAgents } from './core/agents';
import { openExternalTerminal } from './core/extTerminal';
import {
    applyPackFiles, buildAgentPack, readAgentPack, rebindPack, writeAgentPack
} from './core/agentpack';
import { buildAbReport, runAbTest } from './core/abtest';
import { dailyCostHistory, detectCostAnomaly, heavyHitters, todayCost } from './core/anomaly';
import { speakText } from './core/briefing';
import { buildOtlpTraces } from './core/otel';
import { collectGalleryPacks } from './core/packgallery';
import { RelayTailer } from './core/relay';
import {
    createWorktree, isGitRepo, listAfWorktrees, mergeWorktree, removeWorktree, worktreeStatus
} from './core/worktree';
import { applyDistilled, distillCandidates, distillFile, scanContradictions } from './core/distill';
import { buildImpactReport, correlateVersions, InstructionHistory } from './core/instrhistory';
import { chunkMemoryFile, memoryFileRefs } from './core/memquery';
import { modelArgsFor as policyModelArgs, ModelPolicyRule } from './core/modelpolicy';
import {
    AGENTS_MD_NAME, antigravityStatus, syncToAntigravity, syncToClaude, SyncResult
} from './core/antigravity';
import { describePlan, FarmPlan, interpretCommand } from './core/commandbar';
import { DispatchRule, dispatchText } from './core/dispatch';
import { EmbeddingsConfig, EmbeddingsProvider, embedTexts } from './core/embeddings';
import { SearchResult } from './core/search';
import { chunkTranscript, SemanticIndex } from './core/semantic';
import {
    addDuty, CADENCES, CLAUDE_MD_SNIPPET, claudeMdReferencesDuties, deleteDuty,
    DUTIES_FILENAME, DUTY_TEMPLATES, moveDuty, togglePauseDuty, updateDuty, watchStatus
} from './core/duties';
import { buildEvalReport, compareRuns, EvalCase, EvalStore, runEvalSet, summarizeRun } from './core/evals';
import { buildInsights, Insight } from './core/health';
import { ApprovalQueue, blockingCount, buildNeedsQueue, NeedItem } from './core/needs';
import { PulseStore, runPulseSweep } from './core/pulse';
import { buildTriggerStats, describeTriggerStat, triggerAlerts } from './core/triggerstats';
import {
    buildAgentTaskStats, buildTaskFamilies, mergeTaskRecords, readTaskHistory, taskAlerts
} from './core/taskstats';
import {
    hasOurHooks, installHooksInto, removeHooksFrom, userSettingsPath
} from './core/hooksInstaller';
import { LiveMonitor } from './core/live';
import {
    addMcpServer, copyMcpServerTo, readServerRawDef, removeMcpServer, setServerDisabled, updateMcpServer
} from './core/mcp';
import { addSkill, copySkillTo, moveSkillScope, removeSkill } from './core/skills';
import {
    addMemoryFile, applyIndexFixes, archiveMemoryFile, copyMemoryFileTo, MEMORY_TYPES, planIndexFixes
} from './core/memusage';
import { DEFAULT_MEDIA_PRICING, MediaPriceRule, mediaCostSince, readMediaMetas } from './core/media';
import {
    applyMergedContent, buildMergeDraft, findDuplicateGroups, syncGroup
} from './core/memorySync';
import { SecretsVault } from './core/secrets';
import { contextWindowFor, DEFAULT_PRICING, PriceRule, PricingEngine, totalTokens } from './core/pricing';
import { QualityStore, sampleQuality } from './core/quality';
import { buildDailyDigest, buildFleetReport, buildOutputsDigest } from './core/report';
import { SessionIndex, SessionInfo } from './core/sessions';
import {
    applySuggestionToClaudeMd, collectUserMessages, scanCorrections, SuggestionStore
} from './core/suggest';
import { buildWeeklyFactsText, generateWeeklySummary, isoWeek, WeeklyFacts } from './core/summary';
import {
    CliProfile, FarmSchedule, FarmTrigger, newId, PREV_OUTPUT_PLACEHOLDER, sanitizePrompt,
    ScheduleKind, TaskManager, TaskMode, WorkflowStep
} from './core/tasks';
import { TriggerManager } from './core/triggers';
import { dayKey, fmtTokens, fmtUSD, normPath, relTime } from './core/util';
import { AgentDetailPanel } from './panels/agentDetail';
import { CapabilitiesPanel } from './panels/capabilities';
import { MemoryGraphPanel } from './panels/memoryGraph';
import { DashboardPanel } from './panels/dashboard';
import { GalleryPanel } from './panels/gallery';
import { GuidePanel } from './panels/guide';
import { KanbanPanel } from './panels/kanban';
import { NeedsPanel } from './panels/needsPanel';
import { SearchPanel } from './panels/searchPanel';
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

    // D1/D2: file-backed stores for quality scores and instruction suggestions.
    fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    const qualityStore = new QualityStore(path.join(context.globalStorageUri.fsPath, 'quality.json'));
    const suggestionStore = new SuggestionStore(path.join(context.globalStorageUri.fsPath, 'suggestions.json'));
    const judgeArgs = () => cfg().get<string>('judgeArgs', '--model claude-haiku-4-5-20251001');

    // G3: eval cases + runs (trace→dataset loop).
    const evalStore = new EvalStore(path.join(context.globalStorageUri.fsPath, 'evals.json'));

    // H3: pulse (smoke) results.
    const pulseStore = new PulseStore(path.join(context.globalStorageUri.fsPath, 'pulse.json'));

    // I1: CLAUDE.md version history (per agent).
    const instrHistory = new InstructionHistory(path.join(context.globalStorageUri.fsPath, 'instr-history'));

    // I4: semantic index over memory/*.md (separate from the transcript index).
    const memIndex = new SemanticIndex(path.join(context.globalStorageUri.fsPath, 'semantic-memory.json'));

    // G1: browser-step approvals waiting for a human, mirrored into the Needs You queue.
    const approvalQueue = new ApprovalQueue();
    const needsEmitter = new vscode.EventEmitter<void>();
    context.subscriptions.push(needsEmitter);
    approvalQueue.onChange = () => needsEmitter.fire();

    // D4 semantic layer: file-based vector index + provider config from settings/vault.
    const semIndex = new SemanticIndex(path.join(context.globalStorageUri.fsPath, 'semantic-index.json'));
    const embeddingsCfg = (): EmbeddingsConfig => {
        const provider = cfg().get<string>('embeddingsProvider', 'off') as EmbeddingsProvider;
        const secretName = cfg().get<string>('embeddingsSecret', '').trim() ||
            (provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY');
        return {
            provider,
            model: cfg().get<string>('embeddingsModel', ''),
            baseUrl: cfg().get<string>('embeddingsBaseUrl', ''),
            apiKey: vault.get(secretName) ?? ''
        };
    };

    // B4: outbound notification forwarding (n8n / Make / any webhook).
    const postForward = (type: string, message: string): void => {
        const url = cfg().get<string>('notifyWebhookUrl', '');
        if (!url) { return; }
        const events = cfg().get<string[]>('notifyWebhookEvents',
            ['permission', 'stalled', 'budget', 'workflow-done', 'workflow-failed', 'summary', 'digest']);
        if (!events.includes(type)) { return; }
        fetch(vault.substitute(url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'agent-farm', type, message, ts: new Date().toISOString() })
        }).catch(() => { /* fire-and-forget */ });
    };

    const index = new SessionIndex(
        claudeDir(),
        // E1: synced claude dirs from other machines, labeled by machine name.
        () => cfg().get<{ name?: string; dir?: string }[]>('extraClaudeDirs', [])
            .filter(d => d && typeof d.dir === 'string' && d.dir.trim())
            .map(d => ({ name: (d.name ?? '').trim() || 'remote', dir: (d.dir as string).trim() })),
        pricing,
        () => agents,
        () => cfg().get<boolean>('includeUnmatchedProjects', false),
        () => cfg().get<number>('activeThresholdSeconds', 150) * 1000
    );
    context.subscriptions.push(index);

    // User-set session names survive restarts via globalState.
    const TITLES_KEY = 'agentfarm.sessionTitles';
    const sessionTitles = () => context.globalState.get<Record<string, string>>(TITLES_KEY, {});
    index.setTitleOverrides(sessionTitles());

    let taskManagerRef: TaskManager | undefined;
    // Task analytics source: live task list merged with the finished-task
    // archive (45d read comfortably covers every 30d window we compute).
    const allTaskRecords = () => taskManagerRef
        ? mergeTaskRecords(
            taskManagerRef.tasks,
            readTaskHistory(taskManagerRef.historyDir, Date.now() - 45 * 24 * 3600 * 1000))
        : [];
    const healthConfig = () => ({
        staleMemoryDays: cfg().get<number>('staleMemoryDays', 45),
        contextBudgetTokens: cfg().get<number>('contextBudgetTokens', 8000),
        budgets: cfg().get<Record<string, number>>('budgets', {}),
        trendFactor: cfg().get<number>('trendAlertFactor', 2),
        anomalyMinUsd: cfg().get<number>('costAnomalyMinUsd', 1),
        qualityScores: qualityStore.scores,
        suggestions: suggestionStore.open().map(s =>
            ({ id: s.id, agentId: s.agentId, agentName: s.agentName, rule: s.rule })),
        permissionLint: cfg().get<boolean>('permissionLint', true),
        // H2: reliability alerts from trigger/task records (taskManager is created below;
        // the ref is late-bound so early buildInsights calls simply see none).
        triggerAlerts: taskManagerRef
            ? triggerAlerts(buildTriggerStats(taskManagerRef.triggers, taskManagerRef.tasks))
            : [],
        // Task reliability: fail-heavy agents + always-failing task families.
        taskAlerts: (() => {
            const records = allTaskRecords();
            return records.length
                ? taskAlerts(buildAgentTaskStats(records), buildTaskFamilies(records))
                : [];
        })(),
        // H3: latest pulse per agent, failures only.
        pulseFailures: agents
            .map(a => pulseStore.latestFor(a.id))
            .filter((p): p is NonNullable<typeof p> => !!p && !p.ok)
            .map(p => ({ agentId: p.agentId, agentName: p.agentName, reason: p.reason, ts: p.ts }))
    });

    const refreshAgents = () => {
        agents = discoverAgents(cfg().get<string[]>('agentRoots', []));
        insights = buildInsights(agents, index, healthConfig());
        // I1: snapshot changed CLAUDE.md files into the version history.
        for (const a of agents) {
            if (!a.claudeMdPath) { continue; }
            try { instrHistory.record(a.id, fs.readFileSync(a.claudeMdPath, 'utf8')); }
            catch { /* unreadable */ }
        }
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
            if (!best) {
                // J2: remote relay events carry another machine's paths — match by
                // folder basename (the same agent usually lives under the same name).
                const base = n.split('/').pop() ?? '';
                best = agents.find(a => a.name.toLowerCase() === base);
            }
            return best ? { agentId: best.id, agentName: best.name } : {};
        },
        // B3 inbound: /trigger/<token> → webhook trigger (late-bound; manager is created below)
        (token, payload) => triggerManagerRef?.fireWebhook(token, payload) ?? false,
        path.join(context.globalStorageUri.fsPath, 'live-events.jsonl')
    );
    context.subscriptions.push(live);
    live.start();

    // J2: tail relay feed files from other machines into the live monitor.
    const relayTailer = new RelayTailer(
        () => cfg().get<{ name?: string; file?: string }[]>('relayFeeds', [])
            .filter(f => f && typeof f.file === 'string' && f.file.trim())
            .map(f => ({ name: (f.name ?? 'remote').trim() || 'remote', file: (f.file as string).trim() })),
        (feedName, ev) => {
            const payload = {
                session_id: `${feedName}:${ev.sessionId}`,
                cwd: ev.cwd,
                hook_event_name:
                    ev.kind === 'prompt' ? 'UserPromptSubmit' :
                    ev.kind === 'tool' ? 'PreToolUse' :
                    ev.kind === 'stop' ? 'Stop' : 'PostToolUse',
                prompt: ev.detail,
                tool_name: ev.tool
            };
            live.handle(payload);
        });
    relayTailer.start();
    context.subscriptions.push(relayTailer);

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
            // J5: alternative CLI executors (gemini / codex / …).
            cliProfiles: () => cfg().get<CliProfile[]>('cliProfiles', []),
            // I5: rule-based model routing + quota-pressure downgrade.
            modelArgsFor: (task) => {
                const limit = cfg().get<number>('windowTokenLimit', 0);
                const quotaPct = limit > 0 ? 100 * index.windowUsage().tokens / limit : undefined;
                return policyModelArgs(
                    {
                        fromTrigger: task.fromTrigger, fromSchedule: task.fromSchedule,
                        workflowId: task.workflowId, agentName: task.agentName, prompt: task.prompt
                    },
                    cfg().get<ModelPolicyRule[]>('modelPolicy', []),
                    quotaPct,
                    {
                        percent: cfg().get<number>('quotaDowngradePercent', 0),
                        model: cfg().get<string>('quotaDowngradeModel', 'claude-haiku-4-5-20251001')
                    });
            },
            mediaAuth: () => {
                const secretName = cfg().get<string>('mediaAuthSecret', 'FAL_KEY');
                const key = vault.get(secretName);
                return key ? `Key ${key}` : '';
            },
            mediaBaseUrl: () => cfg().get<string>('mediaBaseUrl', '') || undefined as unknown as string,
            mediaPricing: () => cfg().get<MediaPriceRule[]>('mediaPricing', DEFAULT_MEDIA_PRICING),
            browserAllowHosts: () => cfg().get<string[]>('browserAllowHosts', []),
            confirmBrowser: ({ title, url, goal }) => {
                if (cfg().get<string>('browserApproval', 'ask') !== 'ask') {
                    return Promise.resolve(true);
                }
                // G1: the request goes into the approval queue; the notification
                // and the Needs You panel race — first settle wins.
                const { id, promise } = approvalQueue.add({ title, url, goal });
                void vscode.window.showWarningMessage(
                    `Agent Farm: browser step "${title}" wants to run — ${url} (${goal})`,
                    'Run', 'Reject', 'Open Needs You'
                ).then(choice => {
                    if (choice === 'Run' || choice === 'Reject') {
                        approvalQueue.settle(id, choice === 'Run');
                    } else if (choice === 'Open Needs You') {
                        void vscode.commands.executeCommand('agentfarm.openNeeds');
                    }
                });
                return promise;
            },
            confirmApproval: ({ title, message }) => {
                // Workflow human-gate: notification + Needs You panel race, first settle wins.
                const { id, promise } = approvalQueue.add({ title, goal: message, kind: 'approval' });
                void vscode.window.showWarningMessage(
                    `Agent Farm: workflow approval needed — "${title}"${message ? ' — ' + message : ''}`,
                    'Approve', 'Reject', 'Open Needs You'
                ).then(choice => {
                    if (choice === 'Approve' || choice === 'Reject') {
                        approvalQueue.settle(id, choice === 'Approve');
                    } else if (choice === 'Open Needs You') {
                        void vscode.commands.executeCommand('agentfarm.openNeeds');
                    }
                });
                return promise;
            }
        }
    );
    taskManagerRef = taskManager;
    context.subscriptions.push(taskManager);

    const triggerManager = new TriggerManager(taskManager, () => agents, live, {
        judgeArgs,
        rules: () => cfg().get<DispatchRule[]>('dispatchRules', []),
        useClassifier: () => cfg().get<boolean>('dispatchClassifier', true)
    });
    triggerManagerRef = triggerManager;
    context.subscriptions.push(triggerManager);

    const agentsTree = new AgentsTreeProvider(state);
    const sessionsTree = new SessionsTreeProvider(state);
    const insightsTree = new InsightsTreeProvider(state);
    const feedTree = new FeedTreeProvider(state);
    const tasksTree = new TasksTreeProvider(taskManager, triggerManager,
        // H2: per-trigger reliability line (fired count, 7d ✓/✗, median start delay)
        (t) => {
            const stat = buildTriggerStats([t], taskManager.tasks)[0];
            return stat && (stat.fireCountTotal || stat.tasks7d) ? describeTriggerStat(stat) : undefined;
        });

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
        CapabilitiesPanel.refreshIfOpen();
    };

    index.onDidUpdate(() => {
        insights = buildInsights(agents, index, healthConfig());
        notifyBudgets();
        agentsTree.refresh();
        sessionsTree.refresh();
        insightsTree.refresh();
        feedTree.refresh();
        needsEmitter.fire();
    }, null, context.subscriptions);
    taskManager.onDidChange(() => needsEmitter.fire(), null, context.subscriptions);

    // Automatic fleet reports (e.g. into an Obsidian vault folder), checked hourly.
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
            let md = buildFleetReport(agents, index, insights, days,
                id => qualityStore.avgSince(id, days * 24 * 3600 * 1000));
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
    // ---------- D1: quality sampling ----------
    const sessionSampleRefs = () => index.all()
        .filter(s => s.agentId)
        .map(s => {
            const agent = agents.find(a => a.id === s.agentId);
            return {
                file: s.file,
                sessionId: s.sessionId,
                agentId: s.agentId as string,
                agentName: s.agentName ?? agent?.name ?? '?',
                agentDir: agent?.dir ?? os.homedir(),
                lastTs: s.lastTs,
                isSidechain: s.isSidechain,
                userTurns: s.userTurns
            };
        });
    const refreshInsights = () => {
        insights = buildInsights(agents, index, healthConfig());
        insightsTree.refresh();
        DashboardPanel.refreshIfOpen();
    };
    let qualityBusy = false;
    const runQualitySample = async (manual: boolean): Promise<void> => {
        if (qualityBusy) {
            if (manual) {
                void vscode.window.showInformationMessage('Agent Farm: quality sampling is already running.');
            }
            return;
        }
        qualityBusy = true;
        try {
            const { scored, skipped } = await sampleQuality(
                sessionSampleRefs(), qualityStore, judgeArgs(),
                { perAgent: cfg().get<number>('qualitySamplesPerAgent', 2) });
            refreshInsights();
            if (manual) {
                void vscode.window.showInformationMessage(
                    `Agent Farm: quality sampling done — ${scored.length} session(s) scored` +
                    (skipped ? `, ${skipped} skipped` : '') +
                    (scored.length ? '. See the Quality column on the Dashboard.' : '.'));
            }
        } finally { qualityBusy = false; }
    };

    // ---------- H3: synthetic pulse (smoke) checks ----------
    let pulseBusy = false;
    const runPulse = async (manual: boolean): Promise<void> => {
        if (pulseBusy) { return; }
        pulseBusy = true;
        try {
            const targets = agents
                .filter(a => a.claudeMdPath)
                .map(a => ({
                    id: a.id, name: a.name, dir: a.dir,
                    claudeMdHead: (fs.readFileSync(a.claudeMdPath!, 'utf8')).slice(0, 300)
                }));
            if (!targets.length) { return; }
            const results = await (manual
                ? vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: pulse sweep (cheap model)…' },
                    (progress) => runPulseSweep(targets, judgeArgs(), judgeArgs(), pulseStore,
                        m => progress.report({ message: m })))
                : runPulseSweep(targets, judgeArgs(), judgeArgs(), pulseStore));
            const failed = results.filter(r => !r.ok);
            refreshInsights();
            if (failed.length) {
                void vscode.window.showWarningMessage(
                    `Agent Farm pulse: ${failed.length}/${results.length} agent(s) FAILED — ` +
                    failed.map(f => f.agentName).join(', ') + '. See Insights.');
            } else if (manual) {
                void vscode.window.showInformationMessage(
                    `Agent Farm pulse: all ${results.length} agent(s) healthy ✓`);
            }
        } finally { pulseBusy = false; }
    };

    // ---------- D2: instruction suggestion scan ----------
    const scanAgentSuggestions = async (agent: AgentInfo): Promise<number> => {
        const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
        const files = index.forAgent(agent.id)
            .filter(s => !s.isSidechain && s.lastTs >= cutoff)
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, 10)
            .map(s => s.file);
        const messages = collectUserMessages(files);
        if (messages.length < 4) { return 0; } // not enough follow-ups to show a repeated pattern
        const { rules } = await scanCorrections(agent.dir, judgeArgs(), agent.name, messages);
        return suggestionStore.addAll(rules.map(r => ({
            agentId: agent.id, agentName: agent.name, rule: r.rule, evidence: r.evidence
        }))).length;
    };

    // ---------- D3: weekly health summary ----------
    const buildWeeklyFacts = (): WeeklyFacts => {
        const now = Date.now();
        const week = 7 * 24 * 3600 * 1000;
        const costIn = (sessions: { daily: Record<string, { cost: number }> }[], from: number, to: number) => {
            let total = 0;
            for (const s of sessions) {
                for (const [day, b] of Object.entries(s.daily)) {
                    const ts = new Date(day + 'T12:00:00').getTime();
                    if (ts >= from && ts < to) { total += b.cost; }
                }
            }
            return total;
        };
        const all = index.all();
        return {
            totalWeek: costIn(all, now - week, now + 24 * 3600 * 1000),
            totalPrevWeek: costIn(all, now - 2 * week, now - week),
            agents: agents.map(a => {
                const sessions = index.forAgent(a.id);
                const recent = sessions.filter(s => s.lastTs >= now - week);
                const q = qualityStore.avgSince(a.id, week, now);
                return {
                    name: a.name,
                    costWeek: costIn(sessions, now - week, now + 24 * 3600 * 1000),
                    costPrevWeek: costIn(sessions, now - 2 * week, now - week),
                    sessions: recent.length,
                    errors: recent.reduce((x, s) => x + s.errors, 0),
                    toolCalls: recent.reduce((x, s) => x + s.toolCalls, 0),
                    qualityAvg: q.avg,
                    qualityCount: q.count
                };
            }),
            insights: insights.map(i => ({
                severity: i.severity, agentName: i.agentName, category: i.category, message: i.message
            }))
        };
    };
    let summaryBusy = false;
    const runWeeklySummary = async (manual: boolean): Promise<void> => {
        if (summaryBusy) { return; }
        summaryBusy = true;
        try {
            const text = await generateWeeklySummary(
                os.homedir(), judgeArgs(), buildWeeklyFactsText(buildWeeklyFacts()));
            if (!text) {
                if (manual) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: weekly summary failed — is the claude CLI on PATH?');
                }
                return;
            }
            const weekKey = isoWeek(new Date());
            await context.globalState.update('agentfarm.weeklySummaryKey', weekKey);
            postForward('summary', text);
            const folder = cfg().get<string>('autoReportFolder', '');
            if (folder && fs.existsSync(folder)) {
                try {
                    fs.writeFileSync(path.join(folder, `AgentFarm-Weekly-Summary-${weekKey}.md`),
                        `# Agent Farm — Weekly Summary (${weekKey})\n\n${text}\n`, 'utf8');
                } catch { /* folder not writable */ }
            }
            void vscode.window.showInformationMessage(`Agent Farm — weekly summary: ${text}`, 'Open Dashboard')
                .then(choice => {
                    if (choice === 'Open Dashboard') {
                        void vscode.commands.executeCommand('agentfarm.openDashboard');
                    }
                });
        } finally { summaryBusy = false; }
    };

    // ---------- D4 semantic layer: incremental index + query ----------
    const semanticSessions = () => index.all()
        .filter(s => !s.isSidechain && s.userTurns > 0)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, cfg().get<number>('semanticMaxSessions', 300));
    let semBusy = false;
    const updateSemanticIndex = async (
        maxSessions?: number,
        report?: (msg: string) => void
    ): Promise<{ indexed: number; remaining: number; error?: string }> => {
        const ecfg = embeddingsCfg();
        if (ecfg.provider === 'off') { return { indexed: 0, remaining: 0, error: 'embeddings provider is off' }; }
        if (semBusy) { return { indexed: 0, remaining: 0 }; }
        semBusy = true;
        try {
            const sessions = semanticSessions();
            semIndex.prune(new Set(sessions.map(s => s.sessionId)));
            const bySid = new Map(sessions.map(s => [s.sessionId, s]));
            const pending = semIndex.pending(sessions.map(s => ({ sessionId: s.sessionId, mtime: s.mtime })));
            const todo = maxSessions ? pending.slice(0, maxSessions) : pending;
            let indexed = 0;
            for (const p of todo) {
                const s = bySid.get(p.sessionId)!;
                const texts = chunkTranscript(s.file);
                if (texts.length) {
                    const { vectors, error } = await embedTexts(texts, ecfg);
                    if (error) { semIndex.save(); return { indexed, remaining: pending.length - indexed, error }; }
                    semIndex.addSession(p.sessionId, p.mtime, texts.map(t => ({
                        sessionFile: s.file, sessionId: s.sessionId,
                        agentName: s.agentName ?? '?', title: s.title, ts: s.lastTs, text: t
                    })), vectors!);
                } else {
                    semIndex.addSession(p.sessionId, p.mtime, [], []);
                }
                indexed++;
                report?.(`${indexed}/${todo.length}`);
            }
            semIndex.save();
            return { indexed, remaining: pending.length - indexed };
        } finally { semBusy = false; }
    };
    const semanticStatus = () => ({
        provider: embeddingsCfg().provider,
        ...semIndex.stats()
    });
    const semanticSearch = async (query: string, agentName?: string): Promise<SearchResult> => {
        const ecfg = embeddingsCfg();
        if (ecfg.provider === 'off') {
            return {
                hits: [], filesScanned: 0, truncated: false,
                error: 'Semantic mode is off — set agentFarm.embeddingsProvider (gemini, or an OpenAI-compatible endpoint such as local Ollama).'
            };
        }
        // Keep the index warm: quietly absorb up to 20 new sessions per query.
        const upd = await updateSemanticIndex(20);
        if (upd.error && !semIndex.stats().chunks) {
            return { hits: [], filesScanned: 0, truncated: false, error: 'Indexing failed: ' + upd.error };
        }
        const q = await embedTexts([query], ecfg);
        if (q.error || !q.vectors) {
            return { hits: [], filesScanned: 0, truncated: false, error: 'Query embedding failed: ' + (q.error ?? '?') };
        }
        const hits = semIndex.search(q.vectors[0], 40)
            .filter(h => !agentName || h.chunk.agentName === agentName)
            .filter(h => h.score > 0.15)
            .slice(0, 20)
            .map(h => ({
                file: h.chunk.sessionFile,
                agentName: h.chunk.agentName,
                title: h.chunk.title,
                ts: h.chunk.ts,
                role: 'assistant' as const,
                before: '',
                match: '',
                after: h.chunk.text.slice(0, 280) + (h.chunk.text.length > 280 ? '…' : ''),
                score: h.score
            }));
        const stats = semIndex.stats();
        const result: SearchResult = { hits, filesScanned: stats.sessions, truncated: false };
        if (upd.remaining > 0) {
            result.error = undefined;
            if (!hits.length) {
                result.error = `${upd.remaining} session(s) not indexed yet — run "Build Semantic Index" for full coverage.`;
            }
        }
        return result;
    };

    // ---------- E2: daily digest card (webhook → n8n → Telegram) ----------
    const buildDigestText = (): string => {
        const now = Date.now();
        const today = dayKey(now);
        const todayCostOf = (sessions: { daily: Record<string, { cost: number }> }[]) =>
            sessions.reduce((sum, s) => sum + (s.daily[today]?.cost ?? 0), 0);
        return buildDailyDigest({
            date: today,
            todayCost: todayCostOf(index.all()),
            activeAgents: index.activeAgentIds(now).size,
            totalAgents: agents.length,
            agents: agents.map(a => ({
                name: a.name,
                todayCost: todayCostOf(index.forAgent(a.id)),
                budget: cfg().get<Record<string, number>>('budgets', {})[a.name]
            })),
            warnings: insights
                .filter(i => i.severity !== 'info')
                .slice(0, 4)
                .map(i => `${i.agentName}: ${i.message}`.slice(0, 90)),
            pendingDuties: agents.reduce((sum, a) =>
                sum + a.duties.filter(d => !d.paused && watchStatus(d.watch)?.pending).length, 0),
            runningTasks: taskManager.tasks.filter(t => t.status === 'running').length,
            queuedTasks: taskManager.tasks.filter(t => t.status === 'queued').length,
            mediaCostToday: mediaCostSince(taskManager.outputsDir, 24 * 3600 * 1000)
        });
    };
    const sendDailyDigest = (manual: boolean): void => {
        const text = buildDigestText();
        const hasWebhook = !!cfg().get<string>('notifyWebhookUrl', '');
        if (hasWebhook) { postForward('digest', text); }
        if (manual) {
            void vscode.window.showInformationMessage(
                hasWebhook ? `Agent Farm: digest sent.\n${text}` : `${text}\n(notifyWebhookUrl boş — yalnızca burada gösterildi)`,
                { modal: false });
        }
    };

    // D1-D3 cadences ride the same hourly clock as the auto report.
    const checkPeriodicIntelligence = () => {
        const now = Date.now();
        const cadence = cfg().get<string>('qualitySample', 'off');
        if (cadence !== 'off') {
            const interval = cadence === 'daily' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
            if (now - qualityStore.lastSampleAt >= interval) { void runQualitySample(false); }
        }
        if (cfg().get<string>('suggestScan', 'off') === 'weekly' &&
            now - suggestionStore.lastScanAt >= 7 * 24 * 3600 * 1000) {
            suggestionStore.lastScanAt = now;
            suggestionStore.save();
            void (async () => {
                let added = 0;
                for (const agent of agents) { added += await scanAgentSuggestions(agent); }
                if (added) {
                    refreshInsights();
                    void vscode.window.showInformationMessage(
                        `Agent Farm: ${added} new instruction suggestion(s) — see the Insights view.`);
                }
            })();
        }
        if (cfg().get<boolean>('weeklySummary', false) &&
            context.globalState.get<string>('agentfarm.weeklySummaryKey') !== isoWeek(new Date())) {
            void runWeeklySummary(false);
        }
        // H3: pulse cadence (nightly/weekly), same hourly clock.
        const pulseCadence = cfg().get<string>('pulse', 'off');
        if (pulseCadence !== 'off') {
            const interval = pulseCadence === 'nightly' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
            if (now - pulseStore.lastRunAt >= interval) { void runPulse(false); }
        }
        // E2: daily digest after the configured local time, once per day.
        const digestAt = cfg().get<string>('dailyDigest', 'off');
        const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(digestAt.trim());
        if (m) {
            const nowDate = new Date();
            const due = nowDate.getHours() * 60 + nowDate.getMinutes() >=
                Number(m[1]) * 60 + Number(m[2]);
            const today = dayKey(now);
            if (due && context.globalState.get<string>('agentfarm.dailyDigestKey') !== today) {
                void context.globalState.update('agentfarm.dailyDigestKey', today);
                sendDailyDigest(false);
            }
        }
    };

    const reportTimer = setInterval(() => {
        checkAutoReport();
        checkPeriodicIntelligence();
    }, 3600_000);
    context.subscriptions.push({ dispose: () => clearInterval(reportTimer) });

    // ---------- H4: headless service coordination ----------
    // Heartbeat: while VS Code runs, the service stays idle (fresh = <90s).
    const heartbeatFile = path.join(context.globalStorageUri.fsPath, 'live.heartbeat');
    const writeHeartbeat = () => {
        try { fs.writeFileSync(heartbeatFile, String(Date.now()), 'utf8'); } catch { /* best-effort */ }
    };
    writeHeartbeat();
    const heartbeatTimer = setInterval(writeHeartbeat, 30_000);
    context.subscriptions.push({ dispose: () => clearInterval(heartbeatTimer) });

    // Service config: agent map + CLI args, regenerated on every activation.
    const writeServiceConfig = () => {
        try {
            fs.writeFileSync(path.join(context.globalStorageUri.fsPath, 'service-config.json'),
                JSON.stringify({
                    agents: agents.map(a => ({ id: a.id, name: a.name, dir: a.dir })),
                    extraArgs: cfg().get<string>('taskExtraArgs', ''),
                    maxConcurrent: 1
                }, null, 2), 'utf8');
        } catch { /* best-effort */ }
    };
    writeServiceConfig();

    // "While you were away": show what the service ran since last activation.
    const serviceRunsFile = path.join(context.globalStorageUri.fsPath, 'service-runs.jsonl');
    try {
        const lastSeen = context.globalState.get<number>('agentfarm.serviceRunsSeenTs', 0);
        if (fs.existsSync(serviceRunsFile)) {
            const lines = fs.readFileSync(serviceRunsFile, 'utf8').trim().split('\n');
            const fresh = lines
                .map(l => { try { return JSON.parse(l) as { ts: number; kind: string; title?: string; status?: string }; } catch { return undefined; } })
                .filter((e): e is NonNullable<typeof e> => !!e && e.ts > lastSeen && e.kind === 'task-finished');
            if (fresh.length) {
                const ok = fresh.filter(e => e.status === 'done').length;
                void vscode.window.showInformationMessage(
                    `Agent Farm: headless service ran ${fresh.length} task(s) while you were away (${ok} ok, ${fresh.length - ok} failed).`,
                    'Show Log').then(choice => {
                        if (choice === 'Show Log') {
                            void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(serviceRunsFile));
                        }
                    });
            }
        }
        void context.globalState.update('agentfarm.serviceRunsSeenTs', Date.now());
    } catch { /* log unreadable */ }

    // Initial scan + live watch of ~/.claude/projects
    void index.scanAll().then(() => {
        index.watch();
        checkAutoReport();
        checkPeriodicIntelligence();
        if (index.missingDirs.length) {
            void vscode.window.showWarningMessage(
                `Agent Farm: remote claude dir(s) without a projects folder: ${index.missingDirs.join(', ')} — check agentFarm.extraClaudeDirs and your folder sync.`);
        }
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
        needsEmitter.fire();
    }, null, context.subscriptions);

    // G1: the Needs You queue is assembled from live state + approvals + insights + parked tasks.
    const buildNeeds = (): NeedItem[] => buildNeedsQueue({
        liveSessions: live.sessions(),
        approvals: approvalQueue.list(),
        insights,
        deferredTasks: taskManager.tasks
            .filter(t => t.status === 'queued' && t.autoStart)
            .map(t => ({
                id: t.id, title: t.title, agentName: t.agentName,
                deferredReason: t.deferredReason, createdAt: t.createdAt
            })),
        includeYourTurn: true
    });

    const LAP_KEY = 'agentfarm.lapStartTs';
    const statusBar = new FarmStatusBar(index, live, {
        blocking: () => blockingCount(buildNeeds()),
        onExtra: needsEmitter.event,
        lap: () => {
            const sinceTs = context.globalState.get<number>(LAP_KEY, 0);
            if (!sinceTs) { return undefined; }
            return { sinceTs, ...index.lapUsage(sinceTs) };
        }
    });
    context.subscriptions.push(statusBar);

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
        }),
        quality: (agentId: string) => qualityStore.avgSince(agentId, 14 * 24 * 3600 * 1000)
    };
    const detailDeps = {
        extensionUri: context.extensionUri,
        getAgents: () => agents,
        index,
        getInsights: () => insights,
        contextBudget: () => cfg().get<number>('contextBudgetTokens', 8000),
        taskRecords: () => allTaskRecords()
    };
    const viewerDeps = {
        extensionUri: context.extensionUri,
        getPricing: () => pricing,
        maxMessages: () => cfg().get<number>('maxTranscriptMessages', 1500),
        contextLimitFor: (model: string) => {
            const forced = cfg().get<number>('contextWindowTokens', 0);
            return forced > 0 ? forced : contextWindowFor(model);
        },
        titleFor: (sessionId: string) => sessionTitles()[sessionId],
        lastExportDir: () => context.globalState.get<string>('agentfarm.lastExportDir'),
        setLastExportDir: (dir: string) => { void context.globalState.update('agentfarm.lastExportDir', dir); },
        launchTerminal: (name: string, cwd: string | undefined, command: string) =>
            launchClaudeTerminal(name, cwd, command)
    };

    // ---------- G1/G5: Needs You queue + kanban board ----------

    const handleNeedAction = async (actionId: string, item: NeedItem): Promise<void> => {
        switch (actionId) {
            case 'approve':
            case 'reject':
                if (item.ref.approvalId) { approvalQueue.settle(item.ref.approvalId, actionId === 'approve'); }
                break;
            case 'open-session':
                if (item.ref.transcriptPath && fs.existsSync(item.ref.transcriptPath)) {
                    SessionViewerPanel.show(item.ref.transcriptPath, viewerDeps);
                } else {
                    void vscode.commands.executeCommand('agentfarm.openTimeline');
                }
                break;
            case 'open-timeline':
                void vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'open-dashboard':
                void vscode.commands.executeCommand('agentfarm.openDashboard');
                break;
            case 'sync-antigravity':
                await vscode.commands.executeCommand('agentfarm.syncAntigravity', { agentId: item.ref.agentId });
                break;
            case 'review-suggestion':
                await vscode.commands.executeCommand('agentfarm.reviewSuggestions', item.ref.suggestionId);
                break;
            case 'open-board':
                void vscode.commands.executeCommand('agentfarm.openBoard');
                break;
        }
    };

    const needsDeps = {
        extensionUri: context.extensionUri,
        buildItems: buildNeeds,
        onAction: handleNeedAction,
        onDidChange: needsEmitter.event
    };

    // F1 command bar, callable with prefilled text (used by the kanban board).
    const runCommandBar = async (prefill?: string): Promise<void> => {
        if (!agents.length) {
            void vscode.window.showWarningMessage('Agent Farm: no agents found — configure agentFarm.agentRoots first.');
            return;
        }
        const utterance = prefill ?? await vscode.window.showInputBox({
            prompt: 'Ne yapılsın? (doğal dil — tek seferlik iş, zamanlama veya zincir)',
            placeHolder: 'örn. yarın 09:00\'da psikolog haftalık analizi koşsun, çıktı vault\'a yazılsın',
            ignoreFocusOut: true
        });
        if (!utterance?.trim()) { return; }
        const agentNames = agents.map(a => a.name);
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: planning (cheap model)…' },
            () => interpretCommand(os.homedir(), judgeArgs(), agentNames, utterance));
        if (!result.plan) {
            void vscode.window.showWarningMessage(
                `Agent Farm: could not turn that into a plan — ${result.errors.join('; ')}` +
                (result.raw ? ` | model said: ${result.raw.slice(0, 200)}` : ''));
            return;
        }
        const plan: FarmPlan = result.plan;
        const canRunNow = plan.kind === 'task' || plan.kind === 'workflow';
        const choice = await vscode.window.showInformationMessage(
            describePlan(plan) + '\n\nKurulsun mu?',
            { modal: true },
            ...(canRunNow ? ['Create & Run', 'Create'] : ['Create']));
        if (!choice) { return; }

        const findAgent = (name?: string) =>
            agents.find(a => a.name.toLowerCase() === (name ?? '').toLowerCase());
        if (plan.kind === 'task') {
            const agent = findAgent(plan.agent)!;
            const task = taskManager.addTask(agent, plan.title, plan.prompt!, 'headless');
            if (choice === 'Create & Run') { taskManager.startTask(task); }
            void vscode.window.showInformationMessage(
                `Agent Farm: task "${plan.title}" ${choice === 'Create & Run' ? 'started' : 'queued'} (${agent.name}).`);
        } else if (plan.kind === 'schedule') {
            const agent = findAgent(plan.agent)!;
            const s = plan.schedule!;
            taskManager.addSchedule({
                agentId: agent.id, agentName: agent.name, title: plan.title, prompt: plan.prompt!,
                mode: 'headless', kind: s.kind,
                hour: s.hour ?? 9, minute: s.minute ?? 0, dow: s.dow,
                onceAt: s.kind === 'once' ? Date.parse(s.onceAt!.replace(' ', 'T')) : undefined,
                enabled: true
            });
            void vscode.window.showInformationMessage(
                `Agent Farm: schedule "${plan.title}" created (runs while VS Code is open).`);
        } else {
            const steps: WorkflowStep[] = plan.steps!.map(st => {
                const agent = findAgent(st.agent)!;
                return {
                    agentId: agent.id, agentName: agent.name,
                    title: st.title || st.prompt.slice(0, 40), prompt: st.prompt, mode: 'headless' as TaskMode
                };
            });
            const w = taskManager.addWorkflow(plan.title, steps);
            if (choice === 'Create & Run') { taskManager.runWorkflow(w); }
            void vscode.window.showInformationMessage(
                `Agent Farm: workflow "${plan.title}" ${choice === 'Create & Run' ? 'started' : 'created'} (${steps.length} steps).`);
        }
    };

    const kanbanDeps = {
        extensionUri: context.extensionUri,
        manager: taskManager,
        buildWaiting: () => buildNeeds().filter(i =>
            i.kind === 'permission' || i.kind === 'browser-approval' || i.kind === 'stalled'),
        runCommandText: (text: string) => runCommandBar(text),
        settleApproval: (id: string, ok: boolean) => approvalQueue.settle(id, ok),
        onDidChangeNeeds: needsEmitter.event
    };

    needsEmitter.event(() => {
        NeedsPanel.refreshIfOpen();
        KanbanPanel.refreshIfOpen();
    }, null, context.subscriptions);

    let pendingMerge: { name: string; files: string[] } | undefined;

    type AgentArg = { agentId?: string; agent?: AgentInfo } | undefined;
    /** Claude session terminals (start/continue/resume) honor agentFarm.externalTerminal —
     *  long TUI sessions can escape xterm.js rendering glitches. Farm tasks stay integrated
     *  (their lifecycle is tracked via terminal close events). */
    const launchClaudeTerminal = (name: string, cwd: string | undefined, command: string) => {
        if (cfg().get<boolean>('externalTerminal', false)) {
            openExternalTerminal(cwd, command);
            return;
        }
        const terminal = vscode.window.createTerminal({ name, cwd });
        terminal.show();
        terminal.sendText(command, true);
    };

    const resolveAgent = async (arg: AgentArg): Promise<AgentInfo | undefined> => {
        if (arg?.agent) { return arg.agent; }
        const id = arg?.agentId;
        if (id) { return agents.find(a => a.id === id); }
        const pick = await vscode.window.showQuickPick(
            agents.map(a => ({ label: a.name, description: a.dir, agent: a })),
            { placeHolder: 'Select an agent', ignoreFocusOut: true }
        );
        return pick?.agent;
    };

    // A duty only works if the agent's CLAUDE.md actually points at DUTIES.md.
    const ensureDutiesReference = async (agent: AgentInfo) => {
        if (!agent.claudeMdPath) { return; }
        const claudeMd = fs.readFileSync(agent.claudeMdPath, 'utf8');
        if (claudeMdReferencesDuties(claudeMd)) { return; }
        const choice = await vscode.window.showWarningMessage(
            `${agent.name}'s CLAUDE.md does not mention ${DUTIES_FILENAME} yet — without a reference the agent will never check its duties. Append a short instruction section?`,
            { modal: true }, 'Append to CLAUDE.md'
        );
        if (choice === 'Append to CLAUDE.md') {
            fs.writeFileSync(agent.claudeMdPath, claudeMd.replace(/\n*$/, '\n') + CLAUDE_MD_SNIPPET, 'utf8');
        }
    };

    const toggleMcp = (node: AgentNode | undefined, disable: boolean) => {
        if (node?.kind !== 'mcp-server') { return; }
        setServerDisabled(node.agent, node.server.name, disable);
        refreshAll();
        void vscode.window.showInformationMessage(
            `Agent Farm: MCP server "${node.server.name}" ${disable ? 'disabled' : 'enabled'} for ${node.agent.name} ` +
            `(disabledMcpjsonServers in .claude/settings.local.json). New sessions honor it.`);
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

        // Tree elements differ per view: Agents wraps the session in {kind:'session', session},
        // Recent Sessions passes the SessionInfo itself.
        vscode.commands.registerCommand('agentfarm.resumeSession',
            (arg?: { session?: SessionInfo } | SessionInfo) => {
                const s = arg && 'session' in arg && arg.session ? arg.session : arg as SessionInfo | undefined;
                if (!s?.sessionId) { return; }
                const cwd = s.cwd && fs.existsSync(s.cwd) ? s.cwd : undefined;
                launchClaudeTerminal(`claude: ${s.agentName ?? s.sessionId.slice(0, 8)}`, cwd,
                    `claude --resume ${s.sessionId}`);
            }),

        vscode.commands.registerCommand('agentfarm.renameSession',
            async (arg?: { session?: SessionInfo } | SessionInfo) => {
                const s = arg && 'session' in arg && arg.session ? arg.session : arg as SessionInfo | undefined;
                if (!s?.sessionId) { return; }
                const value = await vscode.window.showInputBox({
                    prompt: 'Session name (leave empty to restore the automatic title)',
                    value: s.title, ignoreFocusOut: true
                });
                if (value === undefined) { return; }
                const titles = { ...sessionTitles() };
                if (value.trim()) { titles[s.sessionId] = value.trim(); }
                else { delete titles[s.sessionId]; }
                await context.globalState.update(TITLES_KEY, titles);
                index.setTitleOverrides(titles);
            }),

        vscode.commands.registerCommand('agentfarm.openTimeline', () => {
            TimelinePanel.show({ extensionUri: context.extensionUri, live, tasks: taskManager });
        }),

        vscode.commands.registerCommand('agentfarm.openCapabilities', () => {
            CapabilitiesPanel.show({
                extensionUri: context.extensionUri,
                getAgents: () => agents,
                index,
                refreshTrees: refreshAll,
                taskRecords: () => allTaskRecords()
            });
        }),

        // xterm.js render glitches (ghost spaces, lost lines) have two known remedies:
        // the DOM renderer (gpuAcceleration off) and skipping xterm.js entirely for long
        // claude sessions via the OS terminal. Both live behind this one command.
        vscode.commands.registerCommand('agentfarm.terminalRenderFix', async () => {
            const term = () => vscode.workspace.getConfiguration('terminal.integrated');
            const gpu = term().get<string>('gpuAcceleration', 'auto');
            const smooth = term().get<boolean>('smoothScrolling', false);
            const persist = term().get<boolean>('enablePersistentSessions', true);
            const external = cfg().get<boolean>('externalTerminal', false);
            const cur = (v: boolean) => v ? 'on' : 'off';
            const pick = await vscode.window.showQuickPick(
                [
                    {
                        label: '$(wrench) Apply render fix (recommended)',
                        description: `gpuAcceleration: off + smoothScrolling: off — fixes ghost spaces / lost lines${gpu === 'off' && !smooth ? ' • already applied' : ''}`,
                        id: 'fix'
                    },
                    {
                        label: `$(terminal) Claude sessions in external terminal: turn ${external ? 'OFF' : 'ON'}`,
                        description: 'start/continue/resume open in Windows Terminal (or a cmd window) — skips xterm.js entirely; farm tasks stay integrated for tracking',
                        id: 'external'
                    },
                    {
                        label: `$(circle-slash) Disable persistent sessions (currently ${cur(persist)})`,
                        description: 'terminals are NOT restored after reload — helps when restored terminals come back garbled',
                        id: 'persist'
                    },
                    {
                        label: '$(discard) Restore VS Code defaults',
                        description: 'removes the gpuAcceleration / smoothScrolling / persistent-sessions overrides',
                        id: 'restore'
                    },
                    {
                        label: '$(settings-gear) Open all terminal settings…',
                        description: 'font, letter spacing, custom glyphs and the rest',
                        id: 'open'
                    }
                ],
                {
                    ignoreFocusOut: true,
                    placeHolder: `Terminal rendering — current: gpu ${gpu} · smoothScrolling ${cur(smooth)} · persistent ${cur(persist)} · external claude ${cur(external)}`
                }
            );
            if (!pick) { return; }
            const G = vscode.ConfigurationTarget.Global;
            switch (pick.id) {
                case 'fix':
                    await term().update('gpuAcceleration', 'off', G);
                    await term().update('smoothScrolling', false, G);
                    void vscode.window.showInformationMessage(
                        'Agent Farm: render fix applied (gpuAcceleration=off, smoothScrolling=off) — open a NEW terminal for it to take effect. Still glitchy? Re-run this command and try the external terminal option.');
                    break;
                case 'external':
                    await cfg().update('externalTerminal', !external, G);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: claude session terminals now open ${!external ? 'in the OS terminal (Windows Terminal when available)' : 'in the integrated terminal'}.`);
                    break;
                case 'persist':
                    await term().update('enablePersistentSessions', false, G);
                    void vscode.window.showInformationMessage(
                        'Agent Farm: persistent terminal sessions disabled — terminals will not be restored after a reload (that restore step is a common source of garbled output).');
                    break;
                case 'restore':
                    await term().update('gpuAcceleration', undefined, G);
                    await term().update('smoothScrolling', undefined, G);
                    await term().update('enablePersistentSessions', undefined, G);
                    void vscode.window.showInformationMessage('Agent Farm: terminal rendering settings restored to VS Code defaults.');
                    break;
                case 'open':
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'terminal.integrated');
                    break;
            }
        }),

        vscode.commands.registerCommand('agentfarm.lapReset', async () => {
            await context.globalState.update(LAP_KEY, Date.now());
            statusBar.update();
            void vscode.window.setStatusBarMessage('Agent Farm: token lap started — counting from now', 4000);
        }),

        vscode.commands.registerCommand('agentfarm.lapClear', async () => {
            await context.globalState.update(LAP_KEY, 0);
            statusBar.update();
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
                { ignoreFocusOut: true, placeHolder: 'Where should the live hooks be installed?' }
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
            launchClaudeTerminal(`claude: ${agent.name}`, agent.dir, 'claude');
        }),

        vscode.commands.registerCommand('agentfarm.continueSession', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            launchClaudeTerminal(`claude: ${agent.name}`, agent.dir, 'claude --continue');
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
            // Dedup guard: an identical task already waiting is almost always an accident.
            if (taskManager.queuedDuplicate(agent.id, prompt)) {
                const anyway = await vscode.window.showWarningMessage(
                    `${agent.name} already has an identical task queued. Add another?`,
                    { modal: true }, 'Add anyway');
                if (anyway !== 'Add anyway') { return; }
            }
            const mode = await vscode.window.showQuickPick(
                [
                    { label: 'Interactive', description: 'opens a claude session with this prompt', mode: 'interactive' as TaskMode },
                    { label: 'Headless', description: 'claude -p — runs the prompt and exits', mode: 'headless' as TaskMode }
                ],
                { ignoreFocusOut: true, placeHolder: 'How should this task run?' }
            );
            if (!mode) { return; }
            // J5: alternative CLI executors, only offered when profiles exist.
            const profiles = cfg().get<CliProfile[]>('cliProfiles', []).filter(p => p?.name && p.headless);
            let cli: string | undefined;
            if (profiles.length) {
                const cliPick = await vscode.window.showQuickPick(
                    [{ label: 'claude', description: 'default executor (full monitoring)' },
                     ...profiles.map(p => ({ label: p.name, description: p.headless }))],
                    { ignoreFocusOut: true, placeHolder: 'Which CLI runs this task? (non-claude executors get output archiving only)' });
                if (!cliPick) { return; }
                if (cliPick.label !== 'claude') { cli = cliPick.label; }
            }
            const task = taskManager.addTask(agent, title, prompt, mode.mode);
            if (cli) { task.cli = cli; }
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
                { ignoreFocusOut: true, placeHolder: 'How often?' }
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
                        days.map((d, i) => ({ label: d, dow: i })), { ignoreFocusOut: true, placeHolder: 'Which day?' });
                    if (!dayPick) { return; }
                    dow = dayPick.dow;
                }
            }
            const mode = await vscode.window.showQuickPick(
                [
                    { label: 'Interactive', mode: 'interactive' as TaskMode },
                    { label: 'Headless', description: 'claude -p — runs and exits', mode: 'headless' as TaskMode }
                ],
                { ignoreFocusOut: true, placeHolder: 'Run mode' }
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
        vscode.commands.registerCommand('agentfarm.retryTask', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.retryTask(node.task); }
        }),
        vscode.commands.registerCommand('agentfarm.retryTaskEdit', async (node?: TaskNode) => {
            if (node?.kind !== 'task') { return; }
            const prompt = await vscode.window.showInputBox({
                title: `Retry "${node.task.title}" with an edited prompt`,
                value: node.task.prompt,
                ignoreFocusOut: true
            });
            if (prompt === undefined) { return; }
            taskManager.retryTask(node.task, prompt);
        }),
        vscode.commands.registerCommand('agentfarm.resumeWorkflow', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.resumeWorkflowFromTask(node.task); }
        }),
        vscode.commands.registerCommand('agentfarm.runTaskNext', (node?: TaskNode) => {
            if (node?.kind === 'task') { taskManager.runTaskNext(node.task); }
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

        vscode.commands.registerCommand('agentfarm.openUltraRoadmap', (anchor?: string) => {
            GuidePanel.show(context.extensionUri,
                typeof anchor === 'string' ? anchor : undefined,
                'ULTRA-GELISIM.tr.md', 'Agent Farm — ULTRA Gelişim Planı');
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

            await ensureDutiesReference(agent);
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: duty "${title}" added to ${agent.name} (${DUTIES_FILENAME}).`);
        }),

        vscode.commands.registerCommand('agentfarm.addDutyFromTemplate', async (node?: AgentNode) => {
            const agent = node && 'agent' in node ? node.agent : await resolveAgent(undefined);
            if (!agent) { return; }
            const pick = await vscode.window.showQuickPick(
                DUTY_TEMPLATES.map(t => ({ label: t.label, description: t.detail, template: t })),
                { placeHolder: `Duty template for ${agent.name}`, ignoreFocusOut: true });
            if (!pick) { return; }
            const t = pick.template;
            let watch: string | undefined;
            if (t.watchKind !== 'none') {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: t.watchKind === 'file',
                    canSelectFolders: t.watchKind === 'folder',
                    canSelectMany: false,
                    openLabel: 'Watch this',
                    title: `${t.label} — what should the agent watch?`
                });
                if (!picked?.length) { return; }
                watch = picked[0].fsPath;
            }
            addDuty(agent.dir, { ...t.duty, watch });
            await ensureDutiesReference(agent);
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: duty "${t.duty.title}" added to ${agent.name} from template — right-click → Edit Duty… to fine-tune.`);
        }),

        vscode.commands.registerCommand('agentfarm.automateDuty', async (node?: AgentNode) => {
            if (node?.kind !== 'duty') { return; }
            const d = node.duty;
            if (!d.watch || !fs.existsSync(d.watch)) {
                void vscode.window.showWarningMessage(
                    'Agent Farm: this duty has no existing watch path — only duties watching a real file/folder can be automated as a trigger.');
                return;
            }
            const confirmed = await vscode.window.showInformationMessage(
                `Create a watch trigger from duty "${d.title}"? The duty stays in DUTIES.md (checked while the agent runs); the trigger ALSO fires a headless ${node.agent.name} task when ${d.watch} changes — even while the agent is idle.`,
                { modal: true }, 'Create Trigger');
            if (confirmed !== 'Create Trigger') { return; }
            taskManager.addTrigger({
                title: `Duty: ${d.title}`,
                type: 'watch',
                watchPath: d.watch,
                action: {
                    kind: 'task', agentId: node.agent.id, agentName: node.agent.name,
                    title: d.title,
                    prompt: `DUTIES.md'deki "${d.title}" görevini uygula. İzlenen hedef değişti: {watch}` +
                        (d.action ? ` Yapılacak iş: ${d.action}` : ''),
                    mode: 'headless'
                },
                debounceSec: 10, cooldownSec: 60, maxPerHour: 6, enabled: true
            });
            void vscode.window.showInformationMessage(
                `Agent Farm: trigger "Duty: ${d.title}" armed (debounce 10s, cooldown 60s, max 6/h) — manage it in the Tasks view under Triggers.`);
        }),

        vscode.commands.registerCommand('agentfarm.copyDuty', async (node?: AgentNode) => {
            if (node?.kind !== 'duty') { return; }
            const targets = agents.filter(a => a.id !== node.agent.id);
            if (!targets.length) {
                void vscode.window.showInformationMessage('Agent Farm: no other agent to copy to.');
                return;
            }
            const pick = await vscode.window.showQuickPick(
                targets.map(a => ({ label: a.name, description: a.dir, agent: a })),
                { placeHolder: `Copy duty "${node.duty.title}" to which agent?`, ignoreFocusOut: true });
            if (!pick) { return; }
            if (pick.agent.duties.some(x => x.title === node.duty.title)) {
                void vscode.window.showWarningMessage(
                    `Agent Farm: ${pick.agent.name} already has a duty titled "${node.duty.title}".`);
                return;
            }
            addDuty(pick.agent.dir, { ...node.duty });
            await ensureDutiesReference(pick.agent);
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: duty "${node.duty.title}" copied to ${pick.agent.name}.`);
        }),

        vscode.commands.registerCommand('agentfarm.moveDutyUp', (node?: AgentNode) => {
            if (node?.kind === 'duty') { moveDuty(node.agent.dir, node.duty.title, -1); refreshAll(); }
        }),

        vscode.commands.registerCommand('agentfarm.moveDutyDown', (node?: AgentNode) => {
            if (node?.kind === 'duty') { moveDuty(node.agent.dir, node.duty.title, 1); refreshAll(); }
        }),

        vscode.commands.registerCommand('agentfarm.toggleDuty', (node?: AgentNode) => {
            if (node?.kind === 'duty') {
                togglePauseDuty(node.agent.dir, node.duty.title);
                refreshAll();
            }
        }),

        vscode.commands.registerCommand('agentfarm.editDuty', async (node?: AgentNode) => {
            if (node?.kind !== 'duty') { return; }
            const d = node.duty;
            const title = await vscode.window.showInputBox({
                prompt: 'Duty title', value: d.title, ignoreFocusOut: true
            });
            if (!title) { return; }
            const cadencePick = await vscode.window.showQuickPick(
                CADENCES.map(c => ({ label: c, description: c === d.cadence ? 'current' : undefined })),
                { placeHolder: `Cadence (current: ${d.cadence})`, ignoreFocusOut: true });
            if (!cadencePick) { return; }
            const watch = await vscode.window.showInputBox({
                prompt: 'Watch target — path or description (empty = none)',
                value: d.watch ?? '', ignoreFocusOut: true
            });
            if (watch === undefined) { return; }
            const action = await vscode.window.showInputBox({
                prompt: 'Do: what should the agent do?', value: d.action ?? '', ignoreFocusOut: true
            });
            if (action === undefined) { return; }
            const note = await vscode.window.showInputBox({
                prompt: 'Note (optional)', value: d.note ?? '', ignoreFocusOut: true
            });
            if (note === undefined) { return; }
            updateDuty(node.agent.dir, d.title, {
                title,
                cadence: cadencePick.label,
                paused: d.paused,
                watch: watch.trim() || undefined,
                action: action.trim() || undefined,
                note: note.trim() || undefined
            });
            refreshAll();
            void vscode.window.showInformationMessage(`Agent Farm: duty "${title}" updated.`);
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
            const pick = await vscode.window.showQuickPick(recipes, { ignoreFocusOut: true, placeHolder: 'Hazır reçete seç (kurulduktan sonra adımları düzenleyebilirsin)' });
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
            const pick = await vscode.window.showQuickPick(names, { ignoreFocusOut: true, placeHolder: 'Delete which secret?' });
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

        vscode.commands.registerCommand('agentfarm.addSkill', async (node?: AgentNode) => {
            const agent = node && 'agent' in node ? node.agent : await resolveAgent(undefined);
            if (!agent) { return; }
            const name = await vscode.window.showInputBox({
                prompt: `Skill name for ${agent.name} (folder under .claude/skills, e.g. release-notes)`,
                ignoreFocusOut: true,
                validateInput: v => /^[a-z0-9][a-z0-9-]*$/.test(v) ? undefined : 'Lowercase letters, digits and - only'
            });
            if (!name) { return; }
            const description = await vscode.window.showInputBox({
                prompt: 'One-line description (claude uses it to decide when to load the skill)',
                ignoreFocusOut: true
            });
            if (description === undefined) { return; }
            try {
                const file = addSkill(agent, name, description.trim() || name);
                refreshAll();
                const doc = await vscode.workspace.openTextDocument(file);
                await vscode.window.showTextDocument(doc);
                void vscode.window.showInformationMessage(
                    `Agent Farm: skill "${name}" scaffolded — write the instructions in SKILL.md. New claude sessions pick it up.`);
            } catch (e) {
                void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.removeSkill', async (node?: AgentNode) => {
            if (node?.kind !== 'skill') { return; }
            const shared = node.skill.scope === 'user';
            const confirmed = await vscode.window.showWarningMessage(
                `Remove skill "${node.skill.name}"` +
                (shared ? ' from ~/.claude/skills — user scope, EVERY agent loses it' : ` from ${node.agent.name}`) +
                '? (a one-time backup is kept in skills.afbak)',
                { modal: true }, 'Remove');
            if (confirmed !== 'Remove') { return; }
            if (removeSkill(node.skill)) {
                refreshAll();
                void vscode.window.showInformationMessage(`Agent Farm: skill "${node.skill.name}" removed.`);
            } else {
                void vscode.window.showWarningMessage('Agent Farm: could not remove the skill folder.');
            }
        }),

        vscode.commands.registerCommand('agentfarm.addMemory', async (node?: AgentNode) => {
            const agent = node && 'agent' in node ? node.agent : await resolveAgent(undefined);
            if (!agent) { return; }
            const name = await vscode.window.showInputBox({
                prompt: `Memory file name for ${agent.name} (kebab-case, e.g. project-notescribe)`,
                ignoreFocusOut: true,
                validateInput: v => /^[a-z0-9][a-z0-9_-]*$/.test(v) ? undefined : 'Lowercase letters, digits, - _ only'
            });
            if (!name) { return; }
            const typePick = await vscode.window.showQuickPick(
                MEMORY_TYPES.map(t => ({ label: t })),
                { placeHolder: 'Memory type (frontmatter metadata.type)', ignoreFocusOut: true });
            if (!typePick) { return; }
            const description = await vscode.window.showInputBox({
                prompt: 'One-line description (goes into frontmatter AND the MEMORY.md index line)',
                ignoreFocusOut: true
            });
            if (!description) { return; }
            try {
                const file = addMemoryFile(agent.dir, name, typePick.label, description.trim());
                refreshAll();
                const doc = await vscode.workspace.openTextDocument(file);
                await vscode.window.showTextDocument(doc);
                void vscode.window.showInformationMessage(
                    `Agent Farm: memory "${name}.md" created and indexed in MEMORY.md — write the fact into the body.`);
            } catch (e) {
                void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.archiveMemory', async (node?: AgentNode) => {
            if (node?.kind !== 'memory-file') { return; }
            const confirmed = await vscode.window.showWarningMessage(
                `Archive "${node.file.name}"? It moves to memory/archive/ (out of the agent's index — NOT deleted) and its MEMORY.md line is removed (index backed up).`,
                { modal: true }, 'Archive');
            if (confirmed !== 'Archive') { return; }
            try {
                const res = archiveMemoryFile(node.agent.dir, node.file.name);
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: "${node.file.name}" archived${res.indexUpdated ? ' and removed from MEMORY.md' : ''}.`);
            } catch (e) {
                void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.openMemoryGraph', (node?: AgentNode) => {
            const agentId = node && 'agent' in node ? node.agent.id : undefined;
            MemoryGraphPanel.show({
                extensionUri: context.extensionUri,
                getAgents: () => agents,
                index
            }, agentId);
        }),

        vscode.commands.registerCommand('agentfarm.fixMemoryIndex', async (arg?: AgentNode | { agentId?: string }) => {
            const agent = arg && 'agent' in arg ? arg.agent : await resolveAgent(arg as { agentId?: string } | undefined);
            if (!agent) { return; }
            const fixes = planIndexFixes(agent.dir, agent.memoryFiles);
            if (!fixes.length) {
                void vscode.window.showInformationMessage(`Agent Farm: ${agent.name}'s MEMORY.md index is consistent — nothing to fix.`);
                return;
            }
            const picks = await vscode.window.showQuickPick(
                fixes.map(f => ({
                    label: f.kind === 'add' ? `$(add) Index "${f.target}"` : `$(trash) Drop dead reference "${f.target}"`,
                    description: f.line.length > 80 ? f.line.slice(0, 79) + '…' : f.line,
                    picked: true,
                    fix: f
                })),
                {
                    canPickMany: true, ignoreFocusOut: true,
                    placeHolder: `${agent.name} — MEMORY.md fixes (add orphan pointers, drop dead lines); index is backed up`
                });
            if (!picks?.length) { return; }
            const backup = applyIndexFixes(agent.dir, picks.map(p => p.fix));
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: MEMORY.md updated — ${picks.filter(p => p.fix.kind === 'add').length} added, ` +
                `${picks.filter(p => p.fix.kind === 'remove').length} removed` +
                (backup ? ` (backup: ${path.basename(backup)})` : '') + '.');
        }),

        vscode.commands.registerCommand('agentfarm.scanMemoryContradictions', async (node?: AgentNode) => {
            const agent = node && 'agent' in node ? node.agent : await resolveAgent(undefined);
            if (!agent) { return; }
            const files = agent.memoryFiles.filter(f => f.name.toLowerCase() !== 'memory.md');
            if (files.length < 2) {
                void vscode.window.showInformationMessage('Agent Farm: need at least two memory files to cross-check.');
                return;
            }
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Agent Farm: scanning ${agent.name}'s memory for contradictions (cheap model)…` },
                () => scanContradictions(agent.dir, judgeArgs(), files));
            if (result.error) {
                void vscode.window.showWarningMessage(`Agent Farm: contradiction scan failed — ${result.error}`);
                return;
            }
            const list = result.contradictions ?? [];
            if (!list.length) {
                void vscode.window.showInformationMessage(
                    `Agent Farm: no contradictions found across ${result.scanned.length} memory file(s)` +
                    (result.truncated ? ' (corpus truncated to budget — largest files first were included)' : '') + '. 🌿');
                return;
            }
            const lines = [
                `# ${agent.name} — hafıza çelişki taraması`,
                '',
                `Taranan: ${result.scanned.join(', ')}${result.truncated ? ' _(bütçe nedeniyle kısmi)_' : ''}`,
                `Model bulgusu ${list.length} — **doğrulamadan silme/birleştirme yapma**, önce iki kaydı da oku.`,
                ''
            ];
            list.forEach((c, i) => {
                lines.push(`## ${i + 1}. ${c.files.join(' ↔ ')}`);
                lines.push(`- **A:** ${c.claimA}`);
                lines.push(`- **B:** ${c.claimB}`);
                if (c.note) { lines.push(`- **Not:** ${c.note}`); }
                lines.push('');
            });
            const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
            await vscode.window.showTextDocument(doc);
        }),

        vscode.commands.registerCommand('agentfarm.copyMemory', async (node?: AgentNode) => {
            if (node?.kind !== 'memory-file') { return; }
            const targets = agents.filter(a => a.id !== node.agent.id);
            if (!targets.length) {
                void vscode.window.showInformationMessage('Agent Farm: no other agent to copy to.');
                return;
            }
            const pick = await vscode.window.showQuickPick(
                targets.map(a => ({ label: a.name, description: a.dir, agent: a })),
                { placeHolder: `Copy "${node.file.name}" to which agent?`, ignoreFocusOut: true });
            if (!pick) { return; }
            try {
                copyMemoryFileTo(node.file.path, pick.agent.dir);
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: "${node.file.name}" copied to ${pick.agent.name} and indexed in its MEMORY.md.`);
            } catch (e) {
                void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.duplicateSkill', async (node?: AgentNode) => {
            if (node?.kind !== 'skill') { return; }
            const targets = agents.filter(a => a.id !== node.agent.id);
            if (!targets.length) {
                void vscode.window.showInformationMessage('Agent Farm: no other agent to copy to.');
                return;
            }
            const pick = await vscode.window.showQuickPick(
                targets.map(a => ({ label: a.name, description: a.dir, agent: a })),
                { placeHolder: `Copy skill "${node.skill.name}" to which agent?`, ignoreFocusOut: true });
            if (!pick) { return; }
            try {
                copySkillTo(node.skill, pick.agent);
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: skill "${node.skill.name}" copied to ${pick.agent.name}. New claude sessions pick it up.`);
            } catch (e) {
                void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.shareSkill', async (node?: AgentNode) => {
            if (node?.kind !== 'skill') { return; }
            const toUser = node.skill.scope === 'agent';
            const confirmed = await vscode.window.showInformationMessage(
                toUser
                    ? `Move skill "${node.skill.name}" to ~/.claude/skills? Every agent will be able to load it.`
                    : `Move skill "${node.skill.name}" into ${node.agent.name}'s .claude/skills? Other agents lose it.`,
                { modal: true }, 'Move');
            if (confirmed !== 'Move') { return; }
            try {
                moveSkillScope(node.skill, node.agent);
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: skill "${node.skill.name}" is now ${toUser ? 'shared by all agents (user scope)' : `private to ${node.agent.name} (agent scope)`}.`);
            } catch (e) {
                void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.revealSkill', (node?: AgentNode) => {
            if (node?.kind !== 'skill') { return; }
            void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(node.skill.source));
        }),

        vscode.commands.registerCommand('agentfarm.editMcpServer', async (node?: AgentNode) => {
            if (node?.kind !== 'mcp-server') { return; }
            const def = readServerRawDef(node.server);
            if (!def) {
                void vscode.window.showWarningMessage('Agent Farm: could not read the server definition from its source file.');
                return;
            }
            if (def.url) {
                const url = await vscode.window.showInputBox({
                    prompt: `Server URL for "${node.server.name}"`, value: String(def.url), ignoreFocusOut: true
                });
                if (!url) { return; }
                def.url = url;
            } else {
                const current = [def.command, ...((def.args as string[] | undefined) ?? [])].filter(Boolean).join(' ');
                const command = await vscode.window.showInputBox({
                    prompt: `Command for "${node.server.name}" (first word = executable, rest = args)`,
                    value: current, ignoreFocusOut: true
                });
                if (!command) { return; }
                const parts = command.trim().split(/\s+/);
                def.command = parts[0];
                if (parts.length > 1) { def.args = parts.slice(1); } else { delete def.args; }
            }
            if (updateMcpServer(node.server, def)) {
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: MCP server "${node.server.name}" updated (a one-time .afbak backup is kept). Restart the agent's sessions to load it.`);
            } else {
                void vscode.window.showWarningMessage('Agent Farm: could not update (file unreadable or entry missing).');
            }
        }),

        vscode.commands.registerCommand('agentfarm.disableMcpServer', (node?: AgentNode) => toggleMcp(node, true)),
        vscode.commands.registerCommand('agentfarm.enableMcpServer', (node?: AgentNode) => toggleMcp(node, false)),

        vscode.commands.registerCommand('agentfarm.copyMcpServer', async (node?: AgentNode) => {
            if (node?.kind !== 'mcp-server') { return; }
            const targets = agents.filter(a => a.id !== node.agent.id);
            if (!targets.length) {
                void vscode.window.showInformationMessage('Agent Farm: no other agent to copy to.');
                return;
            }
            const pick = await vscode.window.showQuickPick(
                targets.map(a => ({ label: a.name, description: a.dir, agent: a })),
                { placeHolder: `Copy MCP server "${node.server.name}" to which agent?`, ignoreFocusOut: true });
            if (!pick) { return; }
            const file = copyMcpServerTo(node.server, pick.agent);
            if (file) {
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: MCP server "${node.server.name}" copied to ${pick.agent.name} (${path.basename(file)}).`);
            } else {
                void vscode.window.showWarningMessage('Agent Farm: could not read the server definition to copy it.');
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
                    { label: '$(play) Run a task on an agent you pick', description: 'next: choose the agent, then the prompt', id: 'task' },
                    { label: '$(arrow-swap) Dispatch — route to the best agent automatically', description: 'no fixed agent: rules + cheap-model classifier decide per firing', id: 'dispatch' },
                    ...(taskManager.workflows.length ? [{ label: '$(type-hierarchy-sub) Run a workflow', id: 'workflow' }] : [])
                ],
                { placeHolder: 'What should it do when it fires?', ignoreFocusOut: true }
            );
            if (!actionPick) { return; }

            let action: FarmTrigger['action'];
            if (actionPick.id === 'dispatch') {
                const prompt = await vscode.window.showInputBox({
                    prompt: 'Task prompt — {watch} = watched path, {payload} = webhook body (routing looks at the payload)',
                    value: typePick.type === 'webhook' ? 'Şu isteği işle: {payload}'
                        : 'Şu hedefteki yeni işi değerlendir ve gereğini yap: {watch}',
                    ignoreFocusOut: true
                });
                if (!prompt) { return; }
                action = { kind: 'dispatch', title, prompt, mode: 'headless' };
            } else if (actionPick.id === 'workflow') {
                const wfPick = await vscode.window.showQuickPick(
                    taskManager.workflows.map(w => ({ label: w.title, description: `${w.steps.length} steps`, w })),
                    { placeHolder: 'Which workflow?', ignoreFocusOut: true });
                if (!wfPick) { return; }
                action = { kind: 'workflow', workflowId: wfPick.w.id };
            } else {
                const agentPick = await vscode.window.showQuickPick(
                    agents.map(a => ({ label: a.name, description: a.dir, agent: a })),
                    { placeHolder: 'Which agent runs this task when the trigger fires?', ignoreFocusOut: true }
                );
                if (!agentPick) { return; }
                const agent = agentPick.agent;
                const prompt = await vscode.window.showInputBox({
                    prompt: `Prompt for ${agent.name} — {watch} = watched path, {payload} = webhook body`,
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

            // Per-trigger timing: defaults are fine for most, but every trigger can be tuned
            // here or later via right-click → Edit Trigger (values are read at fire time).
            const defDebounce = typePick.type === 'watch' ? 10 : 1;
            let debounceSec = defDebounce, cooldownSec = 60, maxPerHour = 6;
            const timingPick = await vscode.window.showQuickPick(
                [
                    { label: '$(watch) Default timing', description: `debounce ${defDebounce}s · cooldown 60s · max 6/h`, custom: false },
                    { label: '$(gear) Customize timing…', description: 'set debounce, cooldown and hourly cap for this trigger', custom: true }
                ],
                { placeHolder: 'Trigger timing (Esc = defaults)', ignoreFocusOut: true }
            );
            if (timingPick?.custom) {
                const askNum = async (label: string, value: number, min: number) => {
                    const v = await vscode.window.showInputBox({
                        prompt: label, value: String(value), ignoreFocusOut: true,
                        validateInput: s => /^\d+$/.test(s) && Number(s) >= min ? undefined : `Enter a whole number ≥ ${min}`
                    });
                    return v === undefined ? undefined : Number(v);
                };
                debounceSec = await askNum('Debounce seconds — quiet time after a change before firing', debounceSec, 1) ?? debounceSec;
                cooldownSec = await askNum('Cooldown seconds — minimum gap between two firings', cooldownSec, 0) ?? cooldownSec;
                maxPerHour = await askNum('Max firings per hour (0 = unlimited)', maxPerHour, 0) ?? maxPerHour;
            }

            taskManager.addTrigger({
                title, type: typePick.type, watchPath, hookEvent, hookAgent, token, action,
                debounceSec, cooldownSec, maxPerHour, enabled: true
            });
            const target = action.kind === 'task' ? `runs on ${action.agentName}`
                : action.kind === 'dispatch' ? 'dispatches to the best agent per firing'
                    : 'runs a workflow';
            const timing = `debounce ${debounceSec}s, cooldown ${cooldownSec}s, max ${maxPerHour || '∞'}/h`;
            if (typePick.type === 'webhook' && token) {
                const url = `http://127.0.0.1:${cfg().get<number>('livePort', 8377)}/trigger/${token}`;
                await vscode.env.clipboard.writeText(url);
                void vscode.window.showInformationMessage(
                    `Agent Farm: webhook trigger armed — ${target}; URL copied to clipboard: ${url} (POST; body JSON'u {payload} olarak göreve girer; ${timing}).`);
            } else {
                void vscode.window.showInformationMessage(
                    `Agent Farm: trigger "${title}" armed — ${target} (${timing}; right-click the trigger to edit).`);
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
        vscode.commands.registerCommand('agentfarm.editTrigger', async (node?: TaskNode) => {
            if (node?.kind !== 'trigger') { return; }
            const t = node.trigger;
            const fields = [
                { label: '$(edit) Rename', description: t.title, id: 'title' },
                ...(t.action.kind !== 'workflow'
                    ? [{ label: '$(comment) Prompt', description: t.action.prompt.replace(/\s+/g, ' ').slice(0, 60), id: 'prompt' }] : []),
                ...(t.action.kind === 'task'
                    ? [{ label: '$(person) Agent', description: t.action.agentName, id: 'agent' }] : []),
                { label: '$(watch) Debounce seconds', description: String(t.debounceSec), id: 'debounce' },
                { label: '$(history) Cooldown seconds', description: String(t.cooldownSec), id: 'cooldown' },
                { label: '$(dashboard) Max firings per hour (0 = unlimited)', description: String(t.maxPerHour), id: 'cap' }
            ];
            const pick = await vscode.window.showQuickPick(fields,
                { placeHolder: `Edit trigger "${t.title}"`, ignoreFocusOut: true });
            if (!pick) { return; }
            const askNum = async (label: string, value: number, min: number) => {
                const v = await vscode.window.showInputBox({
                    prompt: label, value: String(value), ignoreFocusOut: true,
                    validateInput: s => /^\d+$/.test(s) && Number(s) >= min ? undefined : `Enter a whole number ≥ ${min}`
                });
                return v === undefined ? undefined : Number(v);
            };
            switch (pick.id) {
                case 'title': {
                    const v = await vscode.window.showInputBox({
                        prompt: 'Trigger name', value: t.title, ignoreFocusOut: true });
                    if (!v) { return; }
                    t.title = v;
                    if (t.action.kind !== 'workflow') { t.action.title = v; }
                    break;
                }
                case 'prompt': {
                    if (t.action.kind === 'workflow') { return; }
                    const v = await vscode.window.showInputBox({
                        prompt: 'Task prompt — {watch} = watched path, {payload} = webhook body',
                        value: t.action.prompt, ignoreFocusOut: true });
                    if (!v) { return; }
                    t.action.prompt = v;
                    break;
                }
                case 'agent': {
                    if (t.action.kind !== 'task') { return; }
                    const agent = await resolveAgent(undefined);
                    if (!agent) { return; }
                    t.action.agentId = agent.id;
                    t.action.agentName = agent.name;
                    break;
                }
                case 'debounce': {
                    const v = await askNum('Debounce seconds — quiet time after a change before firing', t.debounceSec, 1);
                    if (v === undefined) { return; }
                    t.debounceSec = v;
                    break;
                }
                case 'cooldown': {
                    const v = await askNum('Cooldown seconds — minimum gap between two firings', t.cooldownSec, 0);
                    if (v === undefined) { return; }
                    t.cooldownSec = v;
                    break;
                }
                case 'cap': {
                    const v = await askNum('Max firings per hour (0 = unlimited)', t.maxPerHour, 0);
                    if (v === undefined) { return; }
                    t.maxPerHour = v;
                    break;
                }
            }
            taskManager.updateTrigger(t);
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
            const pick = await vscode.window.showQuickPick(files, { ignoreFocusOut: true, placeHolder: 'Which month?' });
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
                { ignoreFocusOut: true, placeHolder: 'Template scope' }
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
                    { ignoreFocusOut: true, placeHolder: 'Which template?' }
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
                        // Finish sits on top once there is something to save — bottom of a long
                        // agent list is invisible, and Esc used to silently discard everything.
                        ...(steps.length ? [{ label: '$(check) Finish & save workflow', description: `save "${title}" with ${steps.length} step(s)`, agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: false, isApproval: false }] : []),
                        ...agents.map(a => ({ label: a.name, description: a.dir, agent: a as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: false, isApproval: false })),
                        { label: '$(globe) Webhook step', description: 'HTTP call to n8n/Make/any URL — no agent', agent: undefined as AgentInfo | undefined, isWebhook: true, isMedia: false, isBrowser: false, isApproval: false },
                        { label: '$(device-camera-video) Media step (fal.ai)', description: 'image/video/audio generation — needs FAL_KEY secret', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: true, isBrowser: false, isApproval: false },
                        { label: '$(browser) Browser step', description: 'agent drives its browser MCP — allowlist + approval enforced', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: true, isApproval: false },
                        { label: '$(check) Approval gate', description: 'pause the chain for human sign-off — no agent, no model call', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: false, isApproval: true }
                    ],
                    { placeHolder: `Step ${stepNo}: which agent? (Esc = ${steps.length ? 'finish' : 'cancel'})`, ignoreFocusOut: true }
                );
                if (!agentPick) {
                    if (!steps.length) { return; }
                    const save = await vscode.window.showWarningMessage(
                        `Save workflow "${title}" with ${steps.length} step(s)?`, { modal: true }, 'Save', 'Discard');
                    if (save === 'Save') { break; }
                    if (save === 'Discard') { return; }
                    continue;
                }
                if (agentPick.isBrowser) {
                    // Cancelling any field drops this half-built step and returns to the
                    // step picker — it no longer discards the whole workflow.
                    const bAgent = await resolveAgent(undefined);
                    if (!bAgent) { continue; }
                    const bTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (browser)`, value: 'Siteden veri topla', ignoreFocusOut: true
                    });
                    if (!bTitle) { continue; }
                    const bUrl = await vscode.window.showInputBox({
                        prompt: 'Start URL — {prev_text}/{prev_json.x} are substituted',
                        placeHolder: 'https://example.com/reports', ignoreFocusOut: true
                    });
                    if (!bUrl) { continue; }
                    const bGoal = await vscode.window.showInputBox({
                        prompt: 'Goal — what should the agent do on the site?',
                        placeHolder: 'örn. son raporu bul, özetle ve rakamları çıkar', ignoreFocusOut: true
                    });
                    if (!bGoal) { continue; }
                    const defaultHost = (() => { try { return new URL(bUrl).hostname; } catch { return ''; } })();
                    const bHosts = await vscode.window.showInputBox({
                        prompt: 'Allowed hosts (comma-separated) — the agent may NOT leave these domains',
                        value: defaultHost, ignoreFocusOut: true
                    });
                    if (bHosts === undefined) { continue; }
                    steps.push({
                        agentId: bAgent.id, agentName: bAgent.name, title: bTitle, prompt: '', mode: 'headless',
                        browser: {
                            url: bUrl, goal: bGoal,
                            allowHosts: bHosts.split(',').map(h => h.trim()).filter(Boolean)
                        }
                    });
                    continue;
                }
                if (agentPick.isMedia) {
                    const mTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (media)`, value: 'Görsel üret', ignoreFocusOut: true
                    });
                    if (!mTitle) { continue; }
                    const mModel = await vscode.window.showInputBox({
                        prompt: 'fal.ai model id — güncel listeyi fal.ai/models\'ten doğrula',
                        value: 'fal-ai/flux/schnell',
                        placeHolder: 'örn. fal-ai/flux/schnell, fal-ai/kling-video/v2/master/text-to-video',
                        ignoreFocusOut: true
                    });
                    if (!mModel) { continue; }
                    const mInput = await vscode.window.showInputBox({
                        prompt: 'JSON input template — {prev_text}/{prev_json.x} çözülür',
                        value: '{"prompt": "{prev_text}"}', ignoreFocusOut: true
                    });
                    if (!mInput) { continue; }
                    steps.push({
                        agentId: '', agentName: 'media', title: mTitle, prompt: '', mode: 'headless',
                        media: { model: mModel, input: mInput }
                    });
                    continue;
                }
                if (agentPick.isApproval) {
                    const aTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (approval gate)`, value: 'İnsan onayı bekle', ignoreFocusOut: true
                    });
                    if (!aTitle) { continue; }
                    const aMsg = await vscode.window.showInputBox({
                        prompt: 'Message shown when asking for approval (optional) — {prev_text}/{prev_json.x} are substituted',
                        placeHolder: 'örn. Yayına çıkmadan önce çıktıyı gözden geçir', ignoreFocusOut: true
                    });
                    if (aMsg === undefined) { continue; }
                    steps.push({
                        agentId: '', agentName: 'approval', title: aTitle, prompt: '', mode: 'headless',
                        approval: { message: aMsg.trim() || undefined }
                    });
                    continue;
                }
                if (agentPick.isWebhook) {
                    const whTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (webhook)`, value: 'Dışarı bildir', ignoreFocusOut: true
                    });
                    if (!whTitle) { continue; }
                    const whUrl = await vscode.window.showInputBox({
                        prompt: 'URL — {secret:NAME} and {prev_*} variables are substituted',
                        placeHolder: 'https://n8n.example.com/webhook/…', ignoreFocusOut: true
                    });
                    if (!whUrl) { continue; }
                    const whMethod = await vscode.window.showQuickPick(['POST', 'GET'],
                        { placeHolder: 'Method', ignoreFocusOut: true });
                    if (!whMethod) { continue; }
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
                if (!stepTitle) { continue; }
                const stepPrompt = await vscode.window.showInputBox({
                    prompt: `Step ${stepNo} prompt — use ${PREV_OUTPUT_PLACEHOLDER} for the previous step's output file`,
                    value: stepTitle, ignoreFocusOut: true
                });
                if (!stepPrompt) { continue; }
                const stepMode = await vscode.window.showQuickPick(
                    [
                        { label: 'Headless', description: 'recommended for chains — output is archived and passed on', mode: 'headless' as TaskMode },
                        { label: 'Interactive', description: 'opens a terminal; chain continues when it closes', mode: 'interactive' as TaskMode }
                    ],
                    { placeHolder: `Step ${stepNo} run mode`, ignoreFocusOut: true }
                );
                if (!stepMode) { continue; }
                // "if it fails" lives in the labels too — the bare "Stop workflow" wording
                // read like "stop adding steps" and derailed users mid-wizard.
                const onFailPick = await vscode.window.showQuickPick(
                    [
                        { label: 'If this step fails: stop the workflow (default)', onFail: 'stop' as const },
                        { label: 'If this step fails: continue to next step', onFail: 'continue' as const },
                        { label: 'If this step fails: jump to step…', onFail: 'goto' as const }
                    ],
                    { placeHolder: `Step ${stepNo}: what happens if this step fails?`, ignoreFocusOut: true }
                );
                if (!onFailPick) { continue; }
                let onFail: 'stop' | 'continue' | number = 'stop';
                if (onFailPick.onFail === 'goto') {
                    const target = await vscode.window.showInputBox({
                        prompt: 'Jump to step number (1-based)', ignoreFocusOut: true,
                        validateInput: v => /^\d+$/.test(v) && Number(v) >= 1 ? undefined : 'Enter a step number'
                    });
                    if (!target) { continue; }
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
                if (!contractPick) { continue; }
                const verifyCriteria = stepMode.mode === 'headless'
                    ? ((await vscode.window.showInputBox({
                        prompt: `Step ${stepNo}: verification criteria for the cheap-model judge — empty = no verification`,
                        placeHolder: 'e.g. Çıktı en az 3 maddelik bir plan içermeli',
                        ignoreFocusOut: true
                    })) ?? '')
                    : '';
                // Parallel grouping: only meaningful once there's a prior step to run alongside.
                const parallelPick = steps.length ? await vscode.window.showQuickPick(
                    [
                        { label: 'Sequential (default)', description: 'runs after the previous step', parallel: false },
                        { label: 'Parallel', description: 'runs concurrently with adjacent parallel steps; the next step gets all their outputs merged', parallel: true }
                    ],
                    { placeHolder: `Step ${stepNo}: run in sequence or in parallel?`, ignoreFocusOut: true }) : undefined;
                if (steps.length && !parallelPick) { continue; }
                steps.push({
                    agentId: agentPick.agent.id, agentName: agentPick.agent.name,
                    title: stepTitle, prompt: stepPrompt, mode: stepMode.mode,
                    onFail: onFail === 'stop' ? undefined : onFail,
                    runIf: runIf.trim() || undefined,
                    outputContract: contractPick.contract,
                    verify: verifyCriteria.trim() ? { criteria: verifyCriteria.trim(), retries: 1 } : undefined,
                    parallel: parallelPick?.parallel || undefined
                });
            }
            if (!steps.length) { return; }
            const created = taskManager.addWorkflow(title, steps);
            const run = await vscode.window.showInformationMessage(
                `Agent Farm: workflow "${title}" created (${steps.length} steps) — see Tasks → Workflows.`, 'Run now');
            if (run === 'Run now') { taskManager.runWorkflow(created); }
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
                ], { ignoreFocusOut: true, placeHolder: 'Run mode' });
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
                    ...(step.browser ? [
                        { label: 'Browser URL', description: step.browser.url.slice(0, 50), id: 'bUrl' },
                        { label: 'Browser goal', description: step.browser.goal.slice(0, 50), id: 'bGoal' },
                        { label: 'Browser allowed hosts', description: (step.browser.allowHosts ?? []).join(', ') || '(global list)', id: 'bHosts' }
                    ] : []),
                    ...(step.approval ? [
                        { label: 'Approval message', description: (step.approval.message ?? '(none)').slice(0, 50), id: 'apMsg' }
                    ] : []),
                    { label: 'Prompt', description: step.prompt.slice(0, 60), id: 'prompt' },
                    { label: 'Agent', description: step.agentName, id: 'agent' },
                    { label: 'Mode', description: step.mode, id: 'mode' },
                    { label: 'On fail', description: String(step.onFail ?? 'stop'), id: 'onFail' },
                    { label: 'Parallel', description: step.parallel ? 'on — runs with adjacent parallel steps' : 'off — sequential', id: 'parallel' },
                    { label: 'Run-if condition', description: step.runIf ?? '(always runs)', id: 'runIf' },
                    { label: 'Output contract', description: step.outputContract ?? 'text', id: 'contract' },
                    { label: 'Verification', description: step.verify ? `${step.verify.criteria.slice(0, 40)} (retries ${step.verify.retries ?? 1})` : '(none)', id: 'verify' }
                ],
                { ignoreFocusOut: true, placeHolder: `Edit step ${node.index + 1}: ${step.title}` }
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
                case 'apMsg': {
                    const v = await vscode.window.showInputBox({ prompt: 'Approval message (empty = none)', value: step.approval!.message ?? '', ignoreFocusOut: true });
                    if (v === undefined) { return; }
                    taskManager.updateWorkflowStep(w, node.index, { approval: { message: v.trim() || undefined } });
                    break;
                }
                case 'bUrl': {
                    const v = await vscode.window.showInputBox({ prompt: 'Start URL', value: step.browser!.url, ignoreFocusOut: true });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { browser: { ...step.browser!, url: v } }); }
                    break;
                }
                case 'bGoal': {
                    const v = await vscode.window.showInputBox({ prompt: 'Browser goal', value: step.browser!.goal, ignoreFocusOut: true });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { browser: { ...step.browser!, goal: v } }); }
                    break;
                }
                case 'bHosts': {
                    const v = await vscode.window.showInputBox({
                        prompt: 'Allowed hosts, comma-separated (empty = use agentFarm.browserAllowHosts)',
                        value: (step.browser!.allowHosts ?? []).join(', '), ignoreFocusOut: true
                    });
                    if (v === undefined) { return; }
                    taskManager.updateWorkflowStep(w, node.index, {
                        browser: { ...step.browser!, allowHosts: v.split(',').map(h => h.trim()).filter(Boolean) }
                    });
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
                        ], { ignoreFocusOut: true, placeHolder: 'Run mode' });
                    if (v) { taskManager.updateWorkflowStep(w, node.index, { mode: v.mode }); }
                    break;
                }
                case 'onFail': {
                    const v = await vscode.window.showQuickPick(
                        [
                            { label: 'If this step fails: stop the workflow', value: undefined as 'continue' | number | undefined },
                            { label: 'If this step fails: continue to next step', value: 'continue' as const },
                            { label: 'If this step fails: jump to step…', value: 'goto' as unknown as number }
                        ], { ignoreFocusOut: true, placeHolder: 'What happens if this step fails?' });
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
                case 'parallel': {
                    const v = await vscode.window.showQuickPick(
                        [
                            { label: 'Sequential', description: 'runs after the previous step', parallel: false },
                            { label: 'Parallel', description: 'runs concurrently with adjacent parallel steps (grouped; fan-in to the next step)', parallel: true }
                        ], { ignoreFocusOut: true, placeHolder: `Step ${node.index + 1}: sequential or parallel?` });
                    if (!v) { return; }
                    taskManager.updateWorkflowStep(w, node.index, { parallel: v.parallel || undefined });
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
                        ], { ignoreFocusOut: true, placeHolder: 'Output contract' });
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
                    { ignoreFocusOut: true, placeHolder: 'Which schedule?' });
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
                { ignoreFocusOut: true, placeHolder: 'Which shared memory file do you want to work on?' }
            );
            if (!groupPick) { return; }
            const g = groupPick.group;

            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(diff) Compare two copies', id: 'diff' },
                    { label: '$(sync) Sync all copies from one source', id: 'sync' },
                    { label: '$(edit) Create merge draft (combine by hand, then apply)', id: 'merge' }
                ],
                { ignoreFocusOut: true, placeHolder: `${g.name} — ${g.identical ? 'identical' : 'diverged'} across ${g.copies.length} agents` }
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
                    })), { ignoreFocusOut: true, placeHolder: 'Left side' });
                if (!left) { return; }
                const right = await vscode.window.showQuickPick(
                    g.copies.filter(c => c !== left.copy).map(c => ({
                        label: c.agent.name,
                        description: relTime(c.file.mtime),
                        copy: c
                    })), { ignoreFocusOut: true, placeHolder: 'Right side' });
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
                { ignoreFocusOut: true, placeHolder: 'Which copy is the source of truth?' }
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
                { ignoreFocusOut: true, placeHolder: 'Digest period' }
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
                { ignoreFocusOut: true, placeHolder: 'Report period' }
            );
            if (!period) { return; }
            const md = buildFleetReport(agents, index, insights, period.days,
                id => qualityStore.avgSince(id, period.days * 24 * 3600 * 1000));
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
                : (await vscode.window.showQuickPick(roots, { ignoreFocusOut: true, placeHolder: 'Where should the agent live?' }));
            if (!root) { return; }
            const name = await vscode.window.showInputBox({
                ignoreFocusOut: true, prompt: 'New agent name (folder name)',
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
        }),

        // ---------- Phase D commands ----------

        vscode.commands.registerCommand('agentfarm.searchTranscripts', () => {
            SearchPanel.show({
                extensionUri: context.extensionUri,
                index,
                getAgentNames: () => agents.map(a => a.name),
                semanticSearch,
                semanticStatus
            });
        }),

        vscode.commands.registerCommand('agentfarm.buildSemanticIndex', async () => {
            if (embeddingsCfg().provider === 'off') {
                void vscode.window.showWarningMessage(
                    'Agent Farm: set agentFarm.embeddingsProvider first — "gemini" (needs GEMINI_API_KEY secret) or "openai" (any OpenAI-compatible endpoint, e.g. local Ollama via embeddingsBaseUrl).');
                return;
            }
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: building semantic index…' },
                async progress => {
                    const res = await updateSemanticIndex(undefined, m => progress.report({ message: m }));
                    const stats = semIndex.stats();
                    if (res.error) {
                        void vscode.window.showErrorMessage(
                            `Agent Farm: semantic indexing stopped — ${res.error} (indexed ${res.indexed}, index now ${stats.sessions} sessions / ${stats.chunks} chunks).`);
                    } else {
                        void vscode.window.showInformationMessage(
                            `Agent Farm: semantic index ready — ${stats.sessions} session(s), ${stats.chunks} chunk(s)` +
                            (res.indexed ? ` (${res.indexed} newly indexed).` : ' (already up to date).'));
                    }
                });
        }),

        vscode.commands.registerCommand('agentfarm.sampleQualityNow', () => {
            void vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: scoring recent outputs (cheap model)…' },
                () => runQualitySample(true));
        }),

        vscode.commands.registerCommand('agentfarm.scanSuggestionsNow', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Agent Farm: scanning ${agent.name}'s corrections (cheap model)…` },
                async () => {
                    const added = await scanAgentSuggestions(agent);
                    refreshInsights();
                    void vscode.window.showInformationMessage(added
                        ? `Agent Farm: ${added} new suggestion(s) for ${agent.name} — see the Insights view.`
                        : `Agent Farm: no repeated correction patterns found for ${agent.name} (needs a few follow-up messages in recent sessions).`);
                });
        }),

        vscode.commands.registerCommand('agentfarm.reviewSuggestions', async (suggestionId?: unknown) => {
            let suggestion = typeof suggestionId === 'string' ? suggestionStore.byId(suggestionId) : undefined;
            if (!suggestion) {
                const open = suggestionStore.open();
                if (!open.length) {
                    void vscode.window.showInformationMessage(
                        'Agent Farm: no open suggestions — run "Scan for Instruction Suggestions…" first.');
                    return;
                }
                const pick = await vscode.window.showQuickPick(
                    open.map(s => ({ label: s.rule, description: s.agentName, detail: s.evidence, s })),
                    { ignoreFocusOut: true, placeHolder: 'Review which suggestion?' });
                suggestion = pick?.s;
            }
            if (!suggestion) { return; }
            const agent = agents.find(a => a.id === suggestion!.agentId);
            const choice = await vscode.window.showInformationMessage(
                `${suggestion.agentName} — suggested CLAUDE.md rule:\n\n"${suggestion.rule}"\n\nBased on: ${suggestion.evidence || '(no evidence text)'}`,
                { modal: true },
                'Apply to CLAUDE.md', 'Dismiss');
            if (choice === 'Apply to CLAUDE.md') {
                if (agent?.claudeMdPath && applySuggestionToClaudeMd(agent.claudeMdPath, suggestion.rule)) {
                    suggestionStore.setStatus(suggestion.id, 'applied');
                    void vscode.window.showInformationMessage(
                        `Agent Farm: rule added to ${suggestion.agentName}'s CLAUDE.md.`, 'Open CLAUDE.md')
                        .then(c => {
                            if (c === 'Open CLAUDE.md' && agent?.claudeMdPath) {
                                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(agent.claudeMdPath));
                            }
                        });
                } else {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: could not apply — the agent\'s CLAUDE.md was not found or is unwritable.');
                }
            } else if (choice === 'Dismiss') {
                suggestionStore.setStatus(suggestion.id, 'dismissed');
            }
            refreshInsights();
        }),

        vscode.commands.registerCommand('agentfarm.weeklySummaryNow', () => {
            void vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: writing weekly summary (cheap model)…' },
                () => runWeeklySummary(true));
        }),

        vscode.commands.registerCommand('agentfarm.sendDigestNow', () => {
            sendDailyDigest(true);
        }),

        // ---------- F1: natural-language command bar ----------

        vscode.commands.registerCommand('agentfarm.commandBar', () => runCommandBar()),

        // ---------- G1/G5: Needs You + kanban board ----------

        vscode.commands.registerCommand('agentfarm.openNeeds', () => {
            NeedsPanel.show(needsDeps);
        }),

        vscode.commands.registerCommand('agentfarm.openBoard', () => {
            KanbanPanel.show(kanbanDeps);
        }),

        // ---------- G2: cost anomaly report ----------

        vscode.commands.registerCommand('agentfarm.costReport', async () => {
            const now = Date.now();
            const minUsd = cfg().get<number>('costAnomalyMinUsd', 1);
            const lines: string[] = [];
            lines.push('# Agent Farm — Cost Anomaly Report');
            lines.push('');
            lines.push(`Generated: ${new Date(now).toLocaleString()} · baseline: trailing 14 days (median + MAD)`);
            lines.push('');
            lines.push('| Agent | Today | 14d median | Robust σ | Factor | Anomaly |');
            lines.push('| --- | --- | --- | --- | --- | --- |');
            const rowFor = (label: string, sessions: { daily: Record<string, { cost: number }> }[]) => {
                const hist = dailyCostHistory(sessions, 14, now);
                const today = todayCost(sessions, now);
                const med = hist.slice().sort((a, b) => a - b)[Math.floor(hist.length / 2)] ?? 0;
                const anomaly = detectCostAnomaly(hist, today, { minUsd });
                lines.push(`| ${label} | ${fmtUSD(today)} | ${fmtUSD(med)} | ` +
                    `${anomaly ? fmtUSD(anomaly.sigma) : '—'} | ` +
                    `${anomaly ? anomaly.factor.toFixed(1) + 'x' : '—'} | ${anomaly ? '⚠ YES' : 'no'} |`);
            };
            rowFor('**fleet**', index.all());
            for (const a of agents) { rowFor(a.name, index.forAgent(a.id)); }
            lines.push('');
            const hh = heavyHitters(index.all().map(s => ({
                file: s.file,
                title: s.title,
                agentName: s.agentName,
                cost: s.cost,
                tokens: totalTokens(s.usage),
                lastTs: s.lastTs
            })), 7 * 24 * 3600 * 1000, now);
            lines.push('## Heavy hitters (last 7 days)');
            lines.push('');
            lines.push(hh.sessionCount
                ? `**${hh.heavy.length} of ${hh.sessionCount} sessions (${hh.heavyCountPct}%) consume ` +
                  `${hh.tokenSharePct}% of all tokens** (${fmtTokens(hh.totalTokens)} total, ${fmtUSD(hh.totalCost)}).`
                : 'No sessions in the window.');
            lines.push('');
            for (const s of hh.heavy.slice(0, 10)) {
                lines.push(`- ${s.agentName ?? '?'} — "${s.title}" · ${fmtTokens(s.tokens)} tok · ` +
                    `${fmtUSD(s.cost)} · ${new Date(s.lastTs).toLocaleString()}`);
            }
            const doc = await vscode.workspace.openTextDocument({
                content: lines.join('\n'), language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        }),

        // ---------- G3: eval set (trace→dataset) ----------

        vscode.commands.registerCommand('agentfarm.addEvalCase', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            interface Candidate extends vscode.QuickPickItem {
                input?: string; expectation?: string;
                source?: EvalCase['source'];
            }
            const candidates: Candidate[] = [];
            for (const q of qualityStore.scores.filter(s => s.agentId === agent.id && s.score <= 2)) {
                if (evalStore.hasSource(q.sessionId)) { continue; }
                candidates.push({
                    label: `⭐ ${q.score}/5 — ${q.promptSnippet}`,
                    description: q.reason.slice(0, 60),
                    detail: 'low-scored session → regression case',
                    input: q.promptSnippet,
                    expectation: '',
                    source: { kind: 'quality', sessionId: q.sessionId }
                });
            }
            for (const t of taskManager.tasks.filter(t => t.agentId === agent.id && t.verified === 'fail')) {
                if (evalStore.hasSource(undefined, t.id)) { continue; }
                candidates.push({
                    label: `✗ verify FAIL — ${t.title}`,
                    detail: 'failed verification → regression case',
                    input: t.prompt,
                    expectation: '',
                    source: { kind: 'verify', taskId: t.id }
                });
            }
            candidates.push({ label: '$(edit) Manual case…', detail: 'type the input yourself' });
            const picked = await vscode.window.showQuickPick(candidates, {
                ignoreFocusOut: true, placeHolder: `New eval case for ${agent.name} — from a bad trace, or manual`
            });
            if (!picked) { return; }
            const input = await vscode.window.showInputBox({
                prompt: 'Case input (the prompt replayed against the agent)',
                value: picked.input ?? '',
                ignoreFocusOut: true
            });
            if (!input?.trim()) { return; }
            const expectation = await vscode.window.showInputBox({
                prompt: 'Expectation (what a good answer must satisfy — judge criteria)',
                placeHolder: 'örn. Türkçe olmalı, 3 somut öneri içermeli, başlık atmalı',
                ignoreFocusOut: true
            });
            if (!expectation?.trim()) { return; }
            evalStore.addCase({
                agentId: agent.id, agentName: agent.name,
                title: input.slice(0, 60),
                input, expectation,
                source: picked.source ?? { kind: 'manual' }
            });
            void vscode.window.showInformationMessage(
                `Agent Farm: eval case added — ${agent.name} now has ${evalStore.casesFor(agent.id).length} case(s).`);
        }),

        vscode.commands.registerCommand('agentfarm.runEvals', async (arg?: AgentArg) => {
            const withCases = agents.filter(a => evalStore.casesFor(a.id).length);
            if (!withCases.length) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no eval cases yet — use "Add Eval Case…" first (bad traces become regression tests).');
                return;
            }
            let agent = await resolveAgent(arg);
            if (agent && !evalStore.casesFor(agent.id).length) { agent = undefined; }
            if (!agent) {
                const pick = await vscode.window.showQuickPick(withCases.map(a => ({
                    label: a.name,
                    description: `${evalStore.casesFor(a.id).length} case(s)`,
                    agent: a
                })), { ignoreFocusOut: true, placeHolder: 'Run whose eval set?' });
                agent = pick?.agent;
            }
            if (!agent) { return; }
            const cases = evalStore.casesFor(agent.id);
            const runArgs = cfg().get<string>('evalRunArgs', '--model claude-haiku-4-5-20251001');
            const confirm = await vscode.window.showInformationMessage(
                `Run ${cases.length} eval case(s) against ${agent.name}?\n\n` +
                `Each case = one agent call (${runArgs || 'agent default model'}) + one cheap judge call.`,
                { modal: true }, 'Run');
            if (confirm !== 'Run') { return; }
            const results = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Agent Farm: evals — ${agent.name}` },
                (progress) => runEvalSet(agent!.dir, runArgs, judgeArgs(), cases,
                    m => progress.report({ message: m })));
            const prev = evalStore.lastRun(agent.id);
            const cmp = compareRuns(prev, results);
            evalStore.addRun({
                id: newId(), agentId: agent.id, agentName: agent.name, ts: Date.now(),
                passed: results.filter(r => r.pass).length,
                failed: results.filter(r => !r.pass).length,
                results
            });
            const doc = await vscode.workspace.openTextDocument({
                content: buildEvalReport(agent.name, results, cmp, prev), language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: true });
            void vscode.window.showInformationMessage(
                `Agent Farm evals — ${agent.name}: ${summarizeRun(results, cmp)}`);
        }),

        vscode.commands.registerCommand('agentfarm.reviewEvalCases', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const cases = evalStore.casesFor(agent.id);
            if (!cases.length) {
                void vscode.window.showInformationMessage(`Agent Farm: ${agent.name} has no eval cases.`);
                return;
            }
            const pick = await vscode.window.showQuickPick(cases.map(c => ({
                label: c.title,
                description: c.source?.kind ?? 'manual',
                detail: `Expect: ${c.expectation.slice(0, 100)}`,
                caseId: c.id
            })), { ignoreFocusOut: true, placeHolder: `${agent.name} — ${cases.length} eval case(s); pick one to delete` });
            if (!pick) { return; }
            const del = await vscode.window.showWarningMessage(
                `Delete eval case "${pick.label}"?`, { modal: true }, 'Delete');
            if (del === 'Delete') {
                evalStore.deleteCase(pick.caseId);
                void vscode.window.showInformationMessage('Agent Farm: eval case deleted.');
            }
        }),

        // ---------- H2/H3: reliability ----------

        vscode.commands.registerCommand('agentfarm.runPulseNow', () => runPulse(true)),

        vscode.commands.registerCommand('agentfarm.triggerReport', async () => {
            const stats = buildTriggerStats(taskManager.triggers, taskManager.tasks);
            if (!stats.length) {
                void vscode.window.showInformationMessage('Agent Farm: no triggers configured.');
                return;
            }
            const lines: string[] = [];
            lines.push('# Agent Farm — Trigger Reliability');
            lines.push('');
            lines.push(`Generated: ${new Date().toLocaleString()} · window: last 7 days`);
            lines.push('');
            lines.push('| Trigger | Armed | Fired (total) | 7d ✓/✗ | Median start delay | Last fired | Flags |');
            lines.push('| --- | --- | --- | --- | --- | --- | --- |');
            for (const s of stats) {
                const delay = s.medianStartDelayMs !== undefined
                    ? (s.medianStartDelayMs < 90_000
                        ? Math.round(s.medianStartDelayMs / 1000) + 's'
                        : Math.round(s.medianStartDelayMs / 60_000) + 'm')
                    : '—';
                const flags = [
                    s.neverFired ? 'never fired' : '',
                    s.alwaysFails ? '⚠ always fails' : ''
                ].filter(Boolean).join(', ') || '—';
                lines.push(`| ${s.title} | ${s.enabled ? 'yes' : 'no'} | ${s.fireCountTotal} | ` +
                    `${s.ok7d}/${s.fail7d} | ${delay} | ` +
                    `${s.lastFiredAt ? new Date(s.lastFiredAt).toLocaleString() : 'never'} | ${flags} |`);
            }
            const doc = await vscode.workspace.openTextDocument({
                content: lines.join('\n'), language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        }),

        // ---------- H4: headless service ----------

        vscode.commands.registerCommand('agentfarm.installFarmService', async () => {
            const storage = context.globalStorageUri.fsPath;
            const serviceSrc = path.join(context.extensionPath, 'out', 'service', 'farmService.js');
            if (!fs.existsSync(serviceSrc)) {
                void vscode.window.showErrorMessage('Agent Farm: service script missing from the extension build.');
                return;
            }
            const choice = await vscode.window.showInformationMessage(
                'Install the Agent Farm headless service?\n\n' +
                'A Windows Scheduled Task (logon-time, current user) will run a small node process that ' +
                'processes schedules and watch-triggers while VS Code is closed. ' +
                'It goes idle automatically whenever VS Code is running.\n\nRequires node on PATH.',
                { modal: true }, 'Install');
            if (choice !== 'Install') { return; }
            try {
                const serviceDst = path.join(storage, 'farm-service.js');
                fs.copyFileSync(serviceSrc, serviceDst);
                writeServiceConfig();
                const cmdFile = path.join(storage, 'farm-service.cmd');
                fs.writeFileSync(cmdFile,
                    `@echo off\r\nnode "${serviceDst}" --storage "${storage}" >> "${path.join(storage, 'farm-service.log')}" 2>&1\r\n`,
                    'utf8');
                cp.exec(`schtasks /create /tn "AgentFarmService" /sc onlogon /tr "\\"${cmdFile}\\"" /f`,
                    { windowsHide: true }, (err) => {
                        if (err) {
                            void vscode.window.showErrorMessage(
                                `Agent Farm: schtasks failed — ${String(err.message).slice(0, 200)}`);
                            return;
                        }
                        cp.exec('schtasks /run /tn "AgentFarmService"', { windowsHide: true });
                        void vscode.window.showInformationMessage(
                            'Agent Farm: headless service installed and started ✓ — it sleeps while VS Code is open and takes over when you close it.');
                    });
            } catch (e) {
                void vscode.window.showErrorMessage(`Agent Farm: service install failed — ${String(e)}`);
            }
        }),

        vscode.commands.registerCommand('agentfarm.removeFarmService', async () => {
            const choice = await vscode.window.showWarningMessage(
                'Remove the Agent Farm headless service (scheduled task + running instance)?',
                { modal: true }, 'Remove');
            if (choice !== 'Remove') { return; }
            cp.exec('schtasks /end /tn "AgentFarmService"', { windowsHide: true }, () => {
                cp.exec('schtasks /delete /tn "AgentFarmService" /f', { windowsHide: true }, (err) => {
                    void (err
                        ? vscode.window.showWarningMessage('Agent Farm: scheduled task not found (already removed?).')
                        : vscode.window.showInformationMessage('Agent Farm: headless service removed.'));
                });
            });
        }),

        // ---------- I1: instruction history + impact ----------

        vscode.commands.registerCommand('agentfarm.instructionHistory', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const versions = instrHistory.versions(agent.id);
            const impacts = correlateVersions(
                versions,
                qualityStore.scores.filter(q => q.agentId === agent.id),
                index.forAgent(agent.id).map(s => ({ lastTs: s.lastTs, cost: s.cost })));
            const doc = await vscode.workspace.openTextDocument({
                content: buildImpactReport(agent.name, impacts), language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        }),

        // ---------- I2: A/B instruction experiment ----------

        vscode.commands.registerCommand('agentfarm.abTest', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent?.claudeMdPath) {
                void vscode.window.showWarningMessage('Agent Farm: agent has no CLAUDE.md to experiment on.');
                return;
            }
            const current = fs.readFileSync(agent.claudeMdPath, 'utf8');
            // Variant B source: append an open suggestion, pick a file, or paste a rule.
            interface VariantPick extends vscode.QuickPickItem { variantKind: 'suggestion' | 'file' | 'paste'; rule?: string }
            const options: VariantPick[] = suggestionStore.open()
                .filter(s => s.agentId === agent.id)
                .map(s => ({
                    label: `$(lightbulb) Öneriyi dene: ${s.rule.slice(0, 70)}`,
                    detail: 'B = mevcut CLAUDE.md + bu kural', variantKind: 'suggestion' as const, rule: s.rule
                }));
            options.push(
                { label: '$(file) B varyantını dosyadan seç…', variantKind: 'file' },
                { label: '$(edit) Eklenecek kuralı elle yaz…', variantKind: 'paste' });
            const picked = await vscode.window.showQuickPick(options, {
                ignoreFocusOut: true, placeHolder: `A = ${agent.name}'in mevcut CLAUDE.md'si. B varyantı nereden gelsin?`
            });
            if (!picked) { return; }
            let variantB: string | undefined;
            if (picked.variantKind === 'suggestion' && picked.rule) {
                variantB = current.trimEnd() + `\n\n## Deneme kuralı (A/B)\n- ${picked.rule}\n`;
            } else if (picked.variantKind === 'file') {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false, filters: { Markdown: ['md'] }, title: 'Variant B CLAUDE.md'
                });
                if (uris?.[0]) { variantB = fs.readFileSync(uris[0].fsPath, 'utf8'); }
            } else {
                const rule = await vscode.window.showInputBox({
                    prompt: 'B varyantına eklenecek kural (tek satır)', ignoreFocusOut: true
                });
                if (rule?.trim()) {
                    variantB = current.trimEnd() + `\n\n## Deneme kuralı (A/B)\n- ${rule.trim()}\n`;
                }
            }
            if (!variantB) { return; }
            const evalCases = evalStore.casesFor(agent.id);
            let prompts = evalCases.map(c => c.input).slice(0, 5);
            if (!prompts.length) {
                const raw = await vscode.window.showInputBox({
                    prompt: 'Deneme istemleri ( ; ile ayır, 2-5 adet)',
                    placeHolder: 'örn. bugünkü notları özetle ; haftalık plan çıkar',
                    ignoreFocusOut: true
                });
                prompts = (raw ?? '').split(';').map(s => s.trim()).filter(Boolean).slice(0, 5);
            }
            if (!prompts.length) { return; }
            const runArgs = cfg().get<string>('evalRunArgs', '--model claude-haiku-4-5-20251001');
            const confirm = await vscode.window.showInformationMessage(
                `A/B deneyi: ${prompts.length} istem × 2 varyant + ${prompts.length} hakem çağrısı ` +
                `(${runArgs || 'ajan varsayılan modeli'}). Koşulsun mu?`,
                { modal: true }, 'Run');
            if (confirm !== 'Run') { return; }
            const summary = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Agent Farm: A/B — ${agent.name}` },
                (progress) => runAbTest(agent.dir, current, variantB!, prompts, runArgs, judgeArgs(),
                    m => progress.report({ message: m })));
            const doc = await vscode.workspace.openTextDocument({
                content: buildAbReport(agent.name, summary), language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: true });
            if (summary.winsB > summary.winsA) {
                const apply = await vscode.window.showInformationMessage(
                    `B kazandı (${summary.winsB}-${summary.winsA}, ${summary.ties} eşit). B varyantı CLAUDE.md'ye uygulansın mı? (.afbak yedeği alınır)`,
                    { modal: true }, 'Apply B');
                if (apply === 'Apply B') {
                    const backup = `${agent.claudeMdPath}.${Date.now()}.afbak`;
                    fs.copyFileSync(agent.claudeMdPath, backup);
                    fs.writeFileSync(agent.claudeMdPath, variantB, 'utf8');
                    instrHistory.record(agent.id, variantB);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: B uygulandı ✓ (yedek: ${path.basename(backup)})`);
                }
            } else {
                void vscode.window.showInformationMessage(
                    `Agent Farm A/B: A ${summary.winsA} · B ${summary.winsB} · eşit ${summary.ties} — mevcut talimat yerinde kalıyor.`);
            }
        }),

        // ---------- I3: memory distillation ----------

        vscode.commands.registerCommand('agentfarm.distillMemory', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const candidates = distillCandidates(agent.memoryFiles, {
                staleDays: cfg().get<number>('staleMemoryDays', 45)
            });
            const items = (candidates.length ? candidates : agent.memoryFiles
                .filter(f => f.name.toLowerCase() !== 'memory.md')
                .map(f => ({ path: f.path, name: f.name, tokens: f.tokens, staleDays: 0, reason: 'elle seçildi' })))
                .map(c => ({ label: c.name, description: c.reason, detail: c.path, cand: c }));
            if (!items.length) {
                void vscode.window.showInformationMessage(`Agent Farm: ${agent.name} has no memory files to distill.`);
                return;
            }
            const pick = await vscode.window.showQuickPick(items, {
                ignoreFocusOut: true, placeHolder: candidates.length
                    ? 'Distill which memory file? (oversized/stale candidates first)'
                    : 'No obvious candidates — pick any memory file'
            });
            if (!pick) { return; }
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Agent Farm: distilling ${pick.label} (cheap model)…` },
                () => distillFile(agent.dir, judgeArgs(), pick.cand.path));
            if (!result.draft) {
                void vscode.window.showWarningMessage(`Agent Farm: distillation failed — ${result.error}`);
                return;
            }
            const draftFile = path.join(os.tmpdir(), `af-distill-${Date.now()}-${pick.label}`);
            fs.writeFileSync(draftFile, result.draft, 'utf8');
            await vscode.commands.executeCommand('vscode.diff',
                vscode.Uri.file(pick.cand.path), vscode.Uri.file(draftFile),
                `${pick.label}: current ↔ distilled draft`);
            const choice = await vscode.window.showInformationMessage(
                `Distilled draft: ~${result.tokensBefore} → ~${result.tokensAfter} tokens. Apply over the original? (.afbak backup)`,
                'Apply', 'Discard');
            if (choice === 'Apply') {
                const backup = applyDistilled(pick.cand.path, result.draft);
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${pick.label} distilled ✓ (backup: ${path.basename(backup)})`);
            }
            try { fs.unlinkSync(draftFile); } catch { /* temp cleanup */ }
        }),

        // ---------- I4: semantic memory query ----------

        vscode.commands.registerCommand('agentfarm.askMemory', async () => {
            const ecfg = embeddingsCfg();
            if (ecfg.provider === 'off') {
                void vscode.window.showWarningMessage(
                    'Agent Farm: semantic memory needs an embeddings provider — set agentFarm.embeddingsProvider (gemini, or a local OpenAI-compatible endpoint).');
                return;
            }
            const query = await vscode.window.showInputBox({
                prompt: 'Filo bu konuda ne biliyor? (anlamsal hafıza sorgusu)',
                placeHolder: 'örn. kullanıcının uyku düzeni hakkında bilinenler',
                ignoreFocusOut: true
            });
            if (!query?.trim()) { return; }
            const hits = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: querying fleet memory…' },
                async (progress) => {
                    const refs = memoryFileRefs(agents);
                    memIndex.prune(new Set(refs.map(r => r.key)));
                    const pending = memIndex.pending(refs.map(r => ({ sessionId: r.key, mtime: r.mtime })));
                    const byKey = new Map(refs.map(r => [r.key, r]));
                    for (const [i, p] of pending.entries()) {
                        const ref = byKey.get(p.sessionId)!;
                        progress.report({ message: `indexing ${i + 1}/${pending.length}` });
                        const texts = chunkMemoryFile(ref.file);
                        if (texts.length) {
                            const { vectors, error } = await embedTexts(texts, ecfg);
                            if (error) { throw new Error(error); }
                            memIndex.addSession(p.sessionId, p.mtime, texts.map(t => ({
                                sessionFile: ref.file, sessionId: ref.key,
                                agentName: ref.agentName, title: ref.name, ts: ref.mtime, text: t
                            })), vectors!);
                        } else {
                            memIndex.addSession(p.sessionId, p.mtime, [], []);
                        }
                    }
                    memIndex.save();
                    const q = await embedTexts([query], ecfg);
                    if (q.error || !q.vectors) { throw new Error(q.error ?? 'query embedding failed'); }
                    return memIndex.search(q.vectors[0], 12).filter(h => h.score > 0.15);
                }).then(h => h, err => {
                    void vscode.window.showWarningMessage(`Agent Farm: memory query failed — ${String(err.message ?? err)}`);
                    return undefined;
                });
            if (!hits) { return; }
            if (!hits.length) {
                void vscode.window.showInformationMessage('Agent Farm: no memory matches — the fleet knows nothing about that (yet).');
                return;
            }
            const pick = await vscode.window.showQuickPick(hits.map(h => ({
                label: `${h.chunk.agentName} — ${h.chunk.title}`,
                description: `${Math.round(h.score * 100)}%`,
                detail: h.chunk.text.slice(0, 160),
                file: h.chunk.sessionFile
            })), { ignoreFocusOut: true, placeHolder: `"${query}" — ${hits.length} memory record(s), pick to open`, matchOnDetail: true });
            if (pick) {
                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(pick.file));
            }
        }),

        // ---------- J3: OpenTelemetry export ----------

        vscode.commands.registerCommand('agentfarm.exportOtel', async () => {
            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), `agent-farm-traces-${dayKey(Date.now())}.json`)),
                filters: { 'OTLP JSON': ['json'] },
                title: 'Export sessions as OTLP/JSON traces'
            });
            if (!target) { return; }
            const doc = buildOtlpTraces(index.all().map(s => ({
                sessionId: s.sessionId,
                parentSessionId: s.parentSessionId,
                title: s.title,
                agentName: s.agentName,
                firstTs: s.firstTs,
                lastTs: s.lastTs,
                cost: s.cost,
                usage: s.usage,
                models: s.models,
                toolCalls: s.toolCalls,
                errors: s.errors,
                machine: s.machine
            })));
            fs.writeFileSync(target.fsPath, JSON.stringify(doc, null, 2), 'utf8');
            void vscode.window.showInformationMessage(
                `Agent Farm: ${index.all().length} session span(s) exported — feed the file to Langfuse/Tempo/any OTLP-JSON consumer.`,
                'Open').then(c => {
                    if (c === 'Open') { void vscode.commands.executeCommand('vscode.open', target); }
                });
        }),

        // ---------- J1: parallel worktree runs ----------

        vscode.commands.registerCommand('agentfarm.runParallel', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            if (!(await isGitRepo(agent.dir))) {
                void vscode.window.showWarningMessage(
                    `Agent Farm: ${agent.name} is not a git repository — parallel worktree runs need one.`);
                return;
            }
            const raw = await vscode.window.showInputBox({
                prompt: 'Paralel koşular ( ; ile ayır — her istem kendi worktree\'sinde koşar)',
                placeHolder: 'örn. login formunu düzelt ; dark mode ekle ; testleri hızlandır',
                ignoreFocusOut: true
            });
            const prompts = (raw ?? '').split(';').map(s => s.trim()).filter(Boolean).slice(0, 6);
            if (!prompts.length) { return; }
            const maxConc = cfg().get<number>('maxConcurrentPerAgent', 1);
            if (prompts.length > 1 && maxConc > 0 && maxConc < prompts.length) {
                const c = await vscode.window.showInformationMessage(
                    `maxConcurrentPerAgent = ${maxConc}: koşular sırayla işler (worktree'ler yine izole). Devam?`,
                    { modal: true }, 'Devam');
                if (c !== 'Devam') { return; }
            }
            for (const prompt of prompts) {
                const { wt, error } = await createWorktree(agent.dir, prompt.slice(0, 24));
                if (!wt) {
                    void vscode.window.showErrorMessage(`Agent Farm: worktree failed — ${error}`);
                    continue;
                }
                const task = taskManager.addTask(agent, `⑂ ${wt.name}`, prompt +
                    ' — İş bittiğinde değişiklikleri anlamlı bir mesajla commit et.', 'headless');
                task.workDir = wt.path;
                taskManager.startTask(task);
            }
            void vscode.window.showInformationMessage(
                `Agent Farm: ${prompts.length} parallel worktree run(s) launched — track them on the Board; reconcile later via "Worktree Runs…".`);
        }),

        vscode.commands.registerCommand('agentfarm.worktreeRuns', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const wts = await listAfWorktrees(agent.dir);
            if (!wts.length) {
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${agent.name} has no farm worktrees (af/ branches).`);
                return;
            }
            const stats = await Promise.all(wts.map(wt => worktreeStatus(agent.dir, wt)));
            const pick = await vscode.window.showQuickPick(stats.map(s => ({
                label: `⑂ ${s.wt.name}`,
                description: `${s.commits} commit(s)${s.dirty ? ' • uncommitted changes' : ''}`,
                detail: s.diffStat,
                stat: s
            })), { ignoreFocusOut: true, placeHolder: `${agent.name} — ${wts.length} worktree run(s)` });
            if (!pick) { return; }
            const action = await vscode.window.showQuickPick([
                { label: '$(git-merge) Merge into current branch', id: 'merge' },
                { label: '$(folder-opened) Open worktree folder', id: 'open' },
                { label: '$(trash) Discard (remove worktree + branch)', id: 'discard' }
            ], { ignoreFocusOut: true, placeHolder: `⑂ ${pick.stat.wt.name} — ${pick.stat.diffStat}` });
            if (!action) { return; }
            if (action.id === 'merge') {
                const r = await mergeWorktree(agent.dir, pick.stat.wt);
                if (r.ok) {
                    const rm = await removeWorktree(agent.dir, pick.stat.wt, true);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: merged ⑂ ${pick.stat.wt.name} ✓ (${rm.detail})`);
                } else {
                    void vscode.window.showWarningMessage(
                        `Agent Farm: merge failed — ${r.detail}. Resolve manually in the repo.`);
                }
            } else if (action.id === 'open') {
                void vscode.commands.executeCommand('vscode.openFolder',
                    vscode.Uri.file(pick.stat.wt.path), { forceNewWindow: true });
            } else {
                const sure = await vscode.window.showWarningMessage(
                    `Discard ⑂ ${pick.stat.wt.name}? Its ${pick.stat.commits} commit(s) and uncommitted changes are lost.`,
                    { modal: true }, 'Discard');
                if (sure === 'Discard') {
                    const r = await removeWorktree(agent.dir, pick.stat.wt, true);
                    void (r.ok
                        ? vscode.window.showInformationMessage(`Agent Farm: ⑂ ${pick.stat.wt.name} discarded.`)
                        : vscode.window.showWarningMessage(`Agent Farm: ${r.detail}`));
                }
            }
        }),

        // ---------- J4: agentpack gallery ----------

        vscode.commands.registerCommand('agentfarm.browsePackGallery', async () => {
            const sources = cfg().get<string[]>('packGalleryRepos', []);
            if (!sources.length) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: add gallery sources first — agentFarm.packGalleryRepos (git URLs or local folders with .agentpack files).');
                return;
            }
            const cacheDir = path.join(context.globalStorageUri.fsPath, 'pack-gallery');
            const { packs, errors } = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: syncing pack gallery…' },
                () => collectGalleryPacks(sources, cacheDir));
            if (errors.length) {
                void vscode.window.showWarningMessage(`Agent Farm gallery: ${errors.join(' · ')}`.slice(0, 300));
            }
            if (!packs.length) {
                void vscode.window.showInformationMessage('Agent Farm: no .agentpack files found in the configured sources.');
                return;
            }
            const pick = await vscode.window.showQuickPick(packs.map(p => ({
                label: `$(package) ${p.packName}`,
                description: `${p.fileCount} file(s) • ${p.workflowCount} workflow(s)` +
                    (p.exportedAt ? ` • ${new Date(p.exportedAt).toLocaleDateString()}` : ''),
                detail: p.source,
                file: p.file
            })), { ignoreFocusOut: true, placeHolder: `${packs.length} pack(s) — pick to import (memory/secrets never included; triggers arrive disabled)` });
            if (pick) {
                await vscode.commands.executeCommand('agentfarm.importAgentPack', pick.file);
            }
        }),

        // ---------- J6: spoken briefing (TTS) ----------

        vscode.commands.registerCommand('agentfarm.speakDigest', async () => {
            const model = cfg().get<string>('digestTtsModel', '');
            const folder = cfg().get<string>('digestTtsFolder', '') ||
                cfg().get<string>('autoReportFolder', '');
            const secretName = cfg().get<string>('mediaAuthSecret', 'FAL_KEY');
            const key = vault.get(secretName);
            const text = buildDigestText();
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: generating spoken briefing…' },
                () => speakText(text, model, key ? `Key ${key}` : '', folder,
                    { baseUrl: cfg().get<string>('mediaBaseUrl', '') || undefined }));
            if (!result.ok) {
                void vscode.window.showWarningMessage(`Agent Farm: briefing failed — ${result.error}`);
                return;
            }
            void vscode.window.showInformationMessage(
                `Agent Farm: spoken briefing saved — ${path.basename(result.file!)}`, 'Reveal')
                .then(c => {
                    if (c === 'Reveal') {
                        void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.file!));
                    }
                });
        }),

        // ---------- J2: relay script for the remote machine ----------

        vscode.commands.registerCommand('agentfarm.exportRelayScript', async () => {
            const src = path.join(context.extensionPath, 'out', 'service', 'farmRelay.js');
            if (!fs.existsSync(src)) {
                void vscode.window.showErrorMessage('Agent Farm: relay script missing from the extension build.');
                return;
            }
            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'farmRelay.js')),
                title: 'Save the relay script (copy it to the OTHER machine)'
            });
            if (!target) { return; }
            fs.copyFileSync(src, target.fsPath);
            void vscode.window.showInformationMessage(
                'Agent Farm: relay script saved. On the other machine run: ' +
                `node farmRelay.js --claude %USERPROFILE%\\.claude --out <syncedFolder>\\relay-laptop.jsonl --machine laptop — ` +
                'then add that synced file here via agentFarm.relayFeeds.');
        }),

        vscode.commands.registerCommand('agentfarm.farmServiceStatus', () => {
            cp.exec('schtasks /query /tn "AgentFarmService" /fo LIST', { windowsHide: true }, (err, stdout) => {
                if (err) {
                    void vscode.window.showInformationMessage(
                        'Agent Farm: headless service is NOT installed — run "Install Headless Service…" to keep schedules alive while VS Code is closed.');
                    return;
                }
                const statusLine = String(stdout).split('\n').find(l => /Status|Durum/i.test(l))?.trim() ?? '';
                let lastRun = '';
                try {
                    const lines = fs.readFileSync(serviceRunsFile, 'utf8').trim().split('\n');
                    const last = JSON.parse(lines[lines.length - 1]) as { ts: number; kind: string };
                    lastRun = ` · last log entry: ${last.kind} @ ${new Date(last.ts).toLocaleString()}`;
                } catch { /* no log yet */ }
                void vscode.window.showInformationMessage(
                    `Agent Farm service: installed (${statusLine || 'see Task Scheduler'})${lastRun}`,
                    'Open Log').then(choice => {
                        if (choice === 'Open Log' && fs.existsSync(serviceRunsFile)) {
                            void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(serviceRunsFile));
                        }
                    });
            });
        }),

        // ---------- F2: dispatcher test ----------

        vscode.commands.registerCommand('agentfarm.testDispatch', async () => {
            const text = await vscode.window.showInputBox({
                prompt: 'Gelen iş metni — dispatcher hangi ajana yönlendirirdi?',
                placeHolder: 'örn. dün gece uyuyamadım, sabah da kaygılıydım',
                ignoreFocusOut: true
            });
            if (!text?.trim()) { return; }
            const candidates = agents.map(a => ({
                name: a.name,
                hint: (fs.existsSync(a.claudeMdPath ?? '') ? fs.readFileSync(a.claudeMdPath!, 'utf8') : '')
                    .replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 160)
            }));
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Agent Farm: dispatching…' },
                () => dispatchText(os.homedir(), judgeArgs(), text,
                    cfg().get<DispatchRule[]>('dispatchRules', []), candidates,
                    cfg().get<boolean>('dispatchClassifier', true)));
            void vscode.window.showInformationMessage(
                result.agent
                    ? `Agent Farm dispatch → ${result.agent} [${result.method}] — ${result.reason}`
                    : `Agent Farm dispatch: no agent matched — ${result.reason}`);
        }),

        // ---------- Antigravity compatibility (directional sync) ----------

        vscode.commands.registerCommand('agentfarm.syncAntigravity', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            if (!agent.claudeMdPath) {
                void vscode.window.showWarningMessage('Agent Farm: this agent has no CLAUDE.md to sync from.');
                return;
            }
            const agentsPath = path.join(agent.dir, AGENTS_MD_NAME);
            const showResult = (title: string, r: SyncResult) => {
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${title} — ${r.written.length} file(s) written` +
                    (r.skipped.length ? `, ${r.skipped.length} left untouched` : '') +
                    (r.backups.length ? `, ${r.backups.length} backup(s)` : '') +
                    (r.notes.length ? `. ${r.notes.join(' ')}` : '.'),
                    'Open AGENTS.md')
                    .then(c => {
                        if (c === 'Open AGENTS.md') {
                            void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(agentsPath));
                        }
                    });
            };

            const status = antigravityStatus(agent.dir);
            switch (status.state) {
                case 'none': {
                    const ok = await vscode.window.showInformationMessage(
                        `Make "${agent.name}" Antigravity-compatible?\n\n` +
                        `Creates AGENTS.md (from CLAUDE.md), .agents/workflows/ from active duties, ` +
                        `and an MCP merge suggestion if .mcp.json exists.\n\n` +
                        `memory/ is shared as-is — no conversion. From now on, edits on either side are detected and can be synced back.`,
                        { modal: true }, 'Create');
                    if (ok !== 'Create') { return; }
                    showResult('Antigravity files created', syncToAntigravity(agent.dir, agent.duties));
                    return;
                }
                case 'foreign': {
                    const ok = await vscode.window.showWarningMessage(
                        `${agent.name} already has an AGENTS.md that Agent Farm did not generate. ` +
                        `Overwrite it with CLAUDE.md content? (a timestamped .afbak backup is kept)`,
                        { modal: true }, 'Overwrite');
                    if (ok !== 'Overwrite') { return; }
                    showResult('AGENTS.md replaced', syncToAntigravity(agent.dir, agent.duties, { force: true }));
                    return;
                }
                case 'in-sync': {
                    // Refresh duty workflows anyway — duties may have changed independently.
                    showResult('already in sync (duty workflows refreshed)', syncToAntigravity(agent.dir, agent.duties));
                    return;
                }
                case 'claude-ahead': {
                    showResult('CLAUDE.md → AGENTS.md synced', syncToAntigravity(agent.dir, agent.duties));
                    return;
                }
                case 'antigravity-ahead': {
                    const choice = await vscode.window.showInformationMessage(
                        `AGENTS.md was edited on the Antigravity side. Carry the changes back into CLAUDE.md? ` +
                        `(CLAUDE.md gets a timestamped .afbak backup)`,
                        { modal: true }, 'Apply to CLAUDE.md', 'Show Diff', 'Overwrite with CLAUDE.md');
                    if (choice === 'Apply to CLAUDE.md') {
                        showResult('AGENTS.md → CLAUDE.md synced', syncToClaude(agent.dir));
                    } else if (choice === 'Show Diff') {
                        await vscode.commands.executeCommand('vscode.diff',
                            vscode.Uri.file(agent.claudeMdPath), vscode.Uri.file(agentsPath),
                            `${agent.name}: CLAUDE.md ↔ AGENTS.md`);
                    } else if (choice === 'Overwrite with CLAUDE.md') {
                        showResult('AGENTS.md overwritten from CLAUDE.md', syncToAntigravity(agent.dir, agent.duties));
                    }
                    return;
                }
                case 'conflict': {
                    const choice = await vscode.window.showWarningMessage(
                        `Both CLAUDE.md and AGENTS.md changed since the last sync — pick a direction ` +
                        `(the losing side gets a timestamped .afbak backup) or inspect the diff first.`,
                        { modal: true }, 'Show Diff', 'Claude wins', 'Antigravity wins');
                    if (choice === 'Show Diff') {
                        await vscode.commands.executeCommand('vscode.diff',
                            vscode.Uri.file(agent.claudeMdPath), vscode.Uri.file(agentsPath),
                            `${agent.name}: CLAUDE.md ↔ AGENTS.md (conflict)`);
                    } else if (choice === 'Claude wins') {
                        const b = path.join(agent.dir, AGENTS_MD_NAME);
                        try { fs.copyFileSync(b, `${b}.${Date.now()}.afbak`); } catch { /* best effort */ }
                        showResult('resolved: CLAUDE.md → AGENTS.md', syncToAntigravity(agent.dir, agent.duties, { force: true }));
                    } else if (choice === 'Antigravity wins') {
                        showResult('resolved: AGENTS.md → CLAUDE.md', syncToClaude(agent.dir));
                    }
                    return;
                }
            }
        }),

        // ---------- E3: agent packs ----------

        vscode.commands.registerCommand('agentfarm.exportAgentPack', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const { pack, warnings } = buildAgentPack(agent, taskManager);
            const roots = cfg().get<string[]>('agentRoots', []);
            const defaultDir = roots.find(r => fs.existsSync(r)) ?? os.homedir();
            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(defaultDir, `${agent.name}.agentpack`)),
                filters: { 'Agent Pack': ['agentpack'] }
            });
            if (!target) { return; }
            writeAgentPack(target.fsPath, pack);
            const summary = `${pack.files.length} file(s), ${pack.workflows.length} workflow(s), ` +
                `${pack.triggers.length} trigger(s), ${pack.schedules.length} schedule(s)`;
            void vscode.window.showInformationMessage(
                `Agent Farm: "${agent.name}" exported (${summary}). Memory and secrets are NOT included.` +
                (warnings.length ? ` Skipped: ${warnings.join('; ')}` : ''),
                'Reveal')
                .then(c => {
                    if (c === 'Reveal') { void vscode.commands.executeCommand('revealFileInOS', target); }
                });
        }),

        vscode.commands.registerCommand('agentfarm.importAgentPack', async (fileArg?: unknown) => {
            // J4: the pack gallery calls this with a concrete file path.
            let packFile = typeof fileArg === 'string' && fs.existsSync(fileArg) ? fileArg : undefined;
            if (!packFile) {
                const picked = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'Agent Pack': ['agentpack', 'json'] },
                    openLabel: 'Import Agent Pack'
                });
                if (!picked?.length) { return; }
                packFile = picked[0].fsPath;
            }
            const { pack, error } = readAgentPack(packFile);
            if (!pack) {
                void vscode.window.showErrorMessage(`Agent Farm: cannot import — ${error}.`);
                return;
            }
            const roots = cfg().get<string[]>('agentRoots', []).filter(r => fs.existsSync(r));
            if (!roots.length) {
                void vscode.window.showWarningMessage('Agent Farm: configure an agent root folder first.');
                return;
            }
            const root = roots.length === 1
                ? roots[0]
                : await vscode.window.showQuickPick(roots, { ignoreFocusOut: true, placeHolder: 'Where should the imported agent live?' });
            if (!root) { return; }
            const name = await vscode.window.showInputBox({
                ignoreFocusOut: true, prompt: 'Name for the imported agent (folder name)',
                value: pack.name,
                validateInput: v => !/^[\w-]+$/.test(v) ? 'Use letters, digits, - or _ only'
                    : fs.existsSync(path.join(root, v)) ? 'A folder with this name already exists' : undefined
            });
            if (!name) { return; }
            const dir = path.join(root, name);
            const confirmed = await vscode.window.showInformationMessage(
                `Import "${pack.name}" as "${name}"?\n\n` +
                `${pack.files.length} file(s), ${pack.workflows.length} workflow(s), ` +
                `${pack.triggers.length} trigger(s, disabled), ${pack.schedules.length} schedule(s, disabled).\n\n` +
                pack.notes.join('\n'),
                { modal: true }, 'Import');
            if (confirmed !== 'Import') { return; }

            fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
            fs.writeFileSync(path.join(dir, 'memory', 'MEMORY.md'), MEMORY_MD_TEMPLATE, 'utf8');
            const { written, skipped } = applyPackFiles(pack, dir);
            refreshAll();

            const self = agents.find(a => a.dir === dir) ?? { id: normPath(dir), name };
            const rb = rebindPack(pack, { id: self.id, name },
                n => {
                    const found = agents.find(a => a.name === n);
                    return found ? { id: found.id, name: found.name } : undefined;
                });
            const idMap = new Map<string, string>();
            for (const w of rb.workflows) {
                const created = taskManager.addWorkflow(w.title, w.steps);
                idMap.set(w.id, created.id);
            }
            for (const t of rb.triggers) {
                const action = t.action.kind === 'workflow'
                    ? { ...t.action, workflowId: idMap.get(t.action.workflowId) ?? t.action.workflowId }
                    : t.action;
                taskManager.addTrigger({
                    title: t.title, type: t.type, watchPath: t.watchPath,
                    hookEvent: t.hookEvent, hookAgent: t.hookAgent, token: t.token,
                    action, debounceSec: t.debounceSec, cooldownSec: t.cooldownSec,
                    maxPerHour: t.maxPerHour, enabled: false
                });
            }
            for (const s of rb.schedules) {
                taskManager.addSchedule({
                    agentId: s.agentId, agentName: s.agentName, title: s.title, prompt: s.prompt,
                    mode: s.mode, kind: s.kind, hour: s.hour, minute: s.minute,
                    dow: s.dow, onceAt: s.onceAt, enabled: false
                });
            }
            for (const t of rb.templates) {
                taskManager.addTemplate({
                    title: t.title, prompt: t.prompt, mode: t.mode,
                    agentId: t.agentId, agentName: t.agentName
                });
            }
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: "${name}" imported — ${written.length} file(s)` +
                (skipped.length ? `, ${skipped.length} skipped` : '') +
                `, ${rb.workflows.length} workflow(s), ${rb.triggers.length} trigger(s) ve ${rb.schedules.length} schedule(s) (disabled — review, then enable).` +
                (rb.warnings.length ? ` Notes: ${rb.warnings.join('; ')}` : ''),
                'Open CLAUDE.md')
                .then(c => {
                    if (c === 'Open CLAUDE.md') {
                        void vscode.commands.executeCommand('vscode.open',
                            vscode.Uri.file(path.join(dir, 'CLAUDE.md')));
                    }
                });
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
            if (e.affectsConfiguration('agentFarm.extraClaudeDirs')) {
                void index.scanAll().then(() => {
                    index.reassignAgents();
                    index.watch();
                });
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
