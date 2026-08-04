import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, discoverAgents, scanRoots } from './core/agents';
import {
    airtablePageData, loadStore, probeAirtableInstances, registerMcp, registrationState,
    saveStore, stageMcpServer, unregisterMcp
} from './core/airtable';
import { focusExternalTerminal, openExternalTerminal } from './core/extTerminal';
import {
    applyPackFiles, buildAgentPack, readAgentPack, rebindPack, writeAgentPack
} from './core/agentpack';
import { buildAbReport, runAbTest } from './core/abtest';
import { dailyCostHistory, detectCostAnomaly, heavyHitters, todayCost } from './core/anomaly';
import { speakText } from './core/briefing';
import { buildOtlpTraces } from './core/otel';
import { collectGalleryPacks } from './core/packgallery';
import { RelayTailer } from './core/relay';
import { codexSessionsSource, geminiSessionsSource } from './core/cliTranscripts';
import { buildExternalSessions, liveEventsSource } from './core/sessionSource';
import {
    createWorktree, isGitRepo, listAfWorktrees, mergeWorktree, removeWorktree, worktreeStatus
} from './core/worktree';
import { applyDistilled, distillCandidates, distillFile, scanContradictions } from './core/distill';
import { buildImpactReport, correlateVersions, InstructionHistory } from './core/instrhistory';
import { chunkMemoryFile, memoryFileRefs } from './core/memquery';
import { modelArgsFor as policyModelArgs, ModelPolicyRule } from './core/modelpolicy';
import {
    describePrecondition, parsePrecondition, Precondition, rollupAutomationLog
} from './core/automation';
import { LivingCheck, LivingInput, wireDuties } from './core/living';
import { LivingPanel } from './panels/livingPanel';
import { TaskAnalyticsPanel } from './panels/taskAnalyticsPanel';
import {
    AGENTS_MD_NAME, antigravityStatus, syncToAntigravity, syncToClaude, SyncResult
} from './core/antigravity';
import { syncCodexExtras } from './core/codex';
import { describePlan, FarmPlan, interpretCommand } from './core/commandbar';
import { DispatchRule, dispatchText } from './core/dispatch';
import { EmbeddingsConfig, EmbeddingsProvider, embedTexts } from './core/embeddings';
import { SearchResult } from './core/search';
import { WebhookPollConfig } from './core/mediaProviders';
import { chunkTranscript, SemanticIndex } from './core/semantic';
import {
    addDuty, CADENCES, CLAUDE_MD_SNIPPET, claudeMdReferencesDuties, deleteDuty,
    DUTIES_FILENAME, Duty, DUTY_TEMPLATES, moveDuty, readDuties, togglePauseDuty,
    updateDuty, watchStatus
} from './core/duties';
import { buildEvalReport, compareRuns, EvalCase, EvalStore, runEvalSet, summarizeRun } from './core/evals';
import { buildInsights, Insight } from './core/health';
import {
    ApprovalQueue, blockingCount, buildNeedsQueue, filterDismissedNeeds, isClearable, NeedItem, needKey
} from './core/needs';
import {
    IDLE_REMINDER_PREFIX, NoticeInput, NoticesStore, registerNoticesOps, reportFileStem,
    staleReminderKeys
} from './core/notices';
import { registerQueueOps, WorkItem, WorkQueueStore } from './core/workqueue';
import { PulseStore, runPulseSweep } from './core/pulse';
import { buildTriggerStats, describeTriggerStat, triggerAlerts } from './core/triggerstats';
import {
    buildAgentTaskStats, buildTaskFamilies, mergeTaskRecords, readTaskHistory, taskAlerts
} from './core/taskstats';
import {
    hasOurHooks, installHooksInto, removeHooksFrom, userSettingsPath
} from './core/hooksInstaller';
import { LiveMonitor, LiveSession } from './core/live';
import { OwnerLease } from './core/owner';
import { buildFarmStatus } from './core/farmstatus';
import { PlanUsageService, refreshMs } from './core/planusage';
import { matchTaskSession } from './core/taskcost';
import {
    buildDelegationPrompt, delegationTitle, DismissEntry, filterDismissed,
    FIX_COMMANDS, insightKey, pickAutoDelegates
} from './core/insightops';
import {
    addMcpServer, copyMcpServerTo, readServerRawDef, removeMcpServer, setServerDisabled, updateMcpServer
} from './core/mcp';
import { addSkill, copySkillTo, moveSkillScope, removeSkill } from './core/skills';
import {
    addMemoryFile, applyIndexFixes, archiveMemoryFile, copyMemoryFileTo, MEMORY_TYPES, planIndexFixes
} from './core/memusage';
import {
    DEFAULT_MEDIA_PRICING, MediaPriceRule, injectMediaFeedback, mediaCostSince, readMediaMetas, registerExternalAsset
} from './core/media';
import { IngestFolder, IngestWatcher } from './core/ingest';
import { discoverProductions, newProduction, PRODUCTION_FILENAME, writeProduction } from './core/production';
import { buildEdl, buildFcpXml, detectSceneId, pickSequenceAssets } from './core/premiere';
import {
    applyMergedContent, buildMergeDraft, findDuplicateGroups, syncGroup
} from './core/memorySync';
import { SecretsVault } from './core/secrets';
import { contextWindowFor, DEFAULT_PRICING, PriceRule, PricingEngine, PricingVersion, totalTokens, Usage } from './core/pricing';
import { QualityStore, sampleQuality } from './core/quality';
import { buildDailyDigest, buildFleetReport, buildOutputsDigest } from './core/report';
import { buildForecast, renderForecastMarkdown } from './core/forecast';
import { SessionIndex, SessionInfo, sessionOrigin } from './core/sessions';
import {
    buildLaunchCommand, describeLaunch, EFFORT_CHOICES, LaunchChoice, LaunchDefaults,
    LaunchOptions, LaunchProfile, modelChoices, PERMISSION_CHOICES, validateLaunch, withDefaults
} from './core/launch';
import {
    allTags, isPinned, normalizeMarks, parseTags, SessionMarks, setTags, tagsOf, togglePin
} from './core/sessionmarks';
import { INTERRUPT_KEY, resolveInterrupt, TermRecord } from './core/interrupt';
import { QUICK_MENU, QUICK_MENU_GROUPS } from './core/quickmenu';
import { describeOwner, mergeSessionNames, ownerOf, pidAlive, readCliSessions, sessionsDir } from './core/cliSessions';
import { revealPath } from './core/reveal';
import {
    agentProjectMap, assignAgent, normalizeProjects, ProjectDef, projectOfAgent,
    projectOfSession, rollupProjects, UNASSIGNED,
    // the project entity (core/projects.ts) — the registry these surfaces now read
    CLOSED_STATUSES as CLOSED_PROJECT_STATUSES, folderNameFor, folderState,
    PROJECT_KINDS, PROJECT_STATUSES, Project, ProjectStatus,
    resolveSessionProject, rollupProjectSessions, UNASSIGNED_ID
} from './core/projects';
import { ProjectStore } from './core/projectStore';
import { ProjectsPanel, ProjectsPanelDeps } from './panels/projectsPanel';
import { ProjectsTreeProvider } from './views/projectsTree';
import {
    BRIEF_REL, buildBrief, createSkeleton, dirExists, DEFAULT_SKELETON, localStamp,
    normalizeSkeleton, renameProjectFolder, scanProjectsRoot, scanRoles, writeBrief
} from './core/projectDocs';
import { buildProjectContext, contextFileName, isQuotableContextPath } from './core/projectContext';
import { collectEdits, fileStats, groupByFile } from './core/codeedits';
import { contentAtHead, gitRoot, recentCommits, repoRelative } from './core/gitfile';
import {
    buildProjectCost, buildProjectFeed, FeedCommit, FeedSession, PROJECT_EVENT_KINDS,
    ProjectCost, ProjectEventKind, ProjectFeed, ProjectFeedOptions, UNFILED_EVENT_KINDS
} from './core/projectFeed';
import { buildSnapshot } from './core/websnapshot';
import {
    describeRecord, InsightHistoryStore, normalizeHistory, pruneHistory,
    recordAction, recordSighting, summarize as summarizeInsightHistory
} from './core/insighthistory';
import {
    addSpend, clipForChat, HELP_TEXT, InboundMessage, isAllowed, parseCommand,
    SpendLedger, withinBudget
} from './core/messaging';
import { getMe, sendMessage, TelegramPoller } from './core/telegram';
import { generateToken, RunningWebServer, startWebServer, lanAddress } from './core/webserver';
import { buildPortfolioRows } from './panels/portfolioPanel';
import {
    applySuggestionToClaudeMd, collectUserMessages, scanCorrections, SuggestionStore
} from './core/suggest';
import { buildWeeklyFactsText, generateWeeklySummary, isoWeek, WeeklyFacts } from './core/summary';
import { argStr, BridgeRegistry, need, optStr, parseBridgeRequest } from './core/bridge';
import {
    archivedOutputBody, buildCliCommand, CliProfile, FarmSchedule, FarmTask, FarmTemplate,
    FarmTrigger, FarmWorkflow, MissedPolicy, newId, parseSeedSchedules, PREV_OUTPUT_PLACEHOLDER,
    previousOccurrenceKey, sanitizePrompt, ScheduleKind, TaskManager, TaskMode, WorkflowStep
} from './core/tasks';
import {
    buildResumeMessage, DEFAULT_MISSION_LIMITS, MissionEngine, MissionEngineDeps,
    MissionLimits, missionLiveSlice, MissionRun, MissionSpec, MissionStore, newMissionId,
    outputExcerpt, parsePlannerEnvelope, PlannerResult, remainingBudget
} from './core/missions';
import { standardRoots } from './core/portablePaths';
import { MissionsPanel } from './panels/missionsPanel';
import { PortfolioPanel } from './panels/portfolioPanel';
import { ConsolePanel } from './panels/consolePanel';
import { transcriptHistory } from './core/consolehistory';
import { ConsoleHost, describeAttachment, killPid } from './core/consolehost';
import { carriedTotals, ConsoleMessage } from './core/consoleproto';
import { MissionNode, MissionsTreeProvider } from './views/missionsTree';
import { TriggerManager } from './core/triggers';
import { dayKey, expandEnvPath, fmtTokens, fmtUSD, normPath, readFileTail, relTime, remapStorageIds } from './core/util';
import { AgentDetailPanel } from './panels/agentDetail';
import { CapabilitiesPanel } from './panels/capabilities';
import { buildToolboxInventory, ToolboxInventory } from './core/toolbox';
import { registerToolboxOps } from './core/toolboxBridge';
import { ToolboxPanel } from './panels/toolboxPanel';
import { SecretsPanel } from './panels/secretsPanel';
import { registerTurnsOps } from './core/turns';
import { TurnsPanel } from './panels/turnsPanel';
import { ToolboxTreeProvider } from './views/toolboxTree';
import { MemoryGraphPanel } from './panels/memoryGraph';
import { DashboardPanel, sessionRowPool } from './panels/dashboard';
import { StudioPanel } from './panels/studioPanel';
import { GuidePanel } from './panels/guide';
import { AirtablePanel } from './panels/airtablePanel';
import { TasksPanel } from './panels/tasksPanel';
import { NeedsPanel } from './panels/needsPanel';
import { NoticesPanel } from './panels/noticesPanel';
import { QueuePanel } from './panels/queuePanel';
import { openReportDoc } from './panels/openDoc';
import { DocOpenStore, DOC_OPEN_LABELS, DOC_OPEN_MODES, DocOpenMode, registerDocOpenOps } from './core/docopen';
import { pushHeaderCounts, setNoticesUnreadProvider, setQueueBlockedProvider } from './panels/base';
import { SearchPanel } from './panels/searchPanel';
import { FarmSettingsPanel } from './panels/settingsPanel';
import { SelectionPanel } from './panels/selectionPanel';
import { buildData as buildViewerData, SessionViewerPanel } from './panels/sessionViewer';
import { TimelinePanel } from './panels/timeline';
import { FarmStatusBar } from './views/statusBar';
import { PlanUsageBar } from './views/planUsageBar';
import { TaskNode, TasksTreeProvider } from './views/tasksTree';
import {
    AgentNode, AgentsTreeProvider, FeedTreeProvider, InsightsTreeProvider, SessionsTreeProvider
} from './views/trees';

function cfg() {
    return vscode.workspace.getConfiguration('agentFarm');
}

function claudeDir(): string {
    const custom = cfg().get<string>('claudeDir', '');
    // %VAR% / ${env:VAR} / ~ expand, so a git-synced settings.json stays portable
    return custom && custom.trim() ? expandEnvPath(custom.trim()) : path.join(os.homedir(), '.claude');
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

/** Missed-time policy choices for daily/weekly schedules (add + edit flows). */
const MISSED_POLICY_PICKS: { label: string; description: string; missed: MissedPolicy }[] = [
    {
        label: 'Skip missed runs',
        description: 'If no VS Code window was open at the time, that occurrence is lost (late runs still happen on the same day)',
        missed: 'skip'
    },
    {
        label: 'Catch up at first opportunity',
        description: 'A fully missed occurrence fires as soon as a VS Code window is back — no questions asked',
        missed: 'run'
    },
    {
        label: 'Ask before catching up',
        description: 'A missed occurrence is offered with Run now / Skip buttons',
        missed: 'ask'
    }
];

/**
 * Model for a schedule/trigger, stated ON the automation. Before this the only
 * way to route a nightly batch to a specific model was a regex in
 * `agentFarm.modelPolicy` — invisible from the panel, and free to silently
 * contradict what the duty text said it needed.
 * Returns '' for "leave it to the policy/agent default", undefined if cancelled.
 */
async function pickAutomationModel(current?: string): Promise<string | undefined> {
    const aliases = vscode.workspace.getConfiguration('agentFarm')
        .get<string[]>('modelAliases', ['haiku', 'sonnet', 'opus', 'fable']);
    const picks: { label: string; description?: string; model: string }[] = [
        {
            label: '$(circle-outline) Default',
            description: 'the modelPolicy engine / the agent default decides',
            model: ''
        },
        ...aliases.map(a => ({
            label: `$(sparkle) ${a}`,
            description: a === current ? 'current' : undefined,
            model: a
        }))
    ];
    const pick = await vscode.window.showQuickPick(
        picks.map(p => ({ ...p, label: p.model === (current ?? '') ? `${p.label} ✓` : p.label })),
        { ignoreFocusOut: true, placeHolder: 'Model for this automation (beats the modelPolicy engine)' });
    return pick?.model;
}

/**
 * The firing precondition. This is the brake that makes an unattended wake-up
 * conditional on there being real work — checked for free, before a model is
 * ever spawned. Returns {value} (possibly undefined = no guard), or undefined
 * when the user cancelled.
 */
async function pickPrecondition(
    current: Precondition | undefined, title: string
): Promise<{ value: Precondition | undefined } | undefined> {
    // NOTE: the payload field is `pre`, not `kind` — QuickPickItem.kind is
    // VS Code's separator marker and hijacks the list rendering.
    const kinds: { label: string; description: string; pre: string }[] = [
        {
            label: '$(circle-slash) No guard',
            description: 'fires whenever it is due / whenever the watch changes',
            pre: ''
        },
        {
            label: '$(folder) Only if a folder holds files',
            description: 'the classic: an inbox folder with real work in it',
            pre: 'folderHasFiles'
        },
        {
            label: '$(file) Only if a file is MISSING',
            description: 'nudges: today\'s diary entry was never written',
            pre: 'fileMissing'
        },
        {
            label: '$(history) Only if a path changed recently',
            description: 'react to fresh activity, ignore a stale tree',
            pre: 'pathChangedWithin'
        },
        {
            label: '$(inbox) Only if the work queue has items',
            description: 'sweeps: do not wake up for an empty queue',
            pre: 'queueHasWork'
        }
    ];
    const pick = await vscode.window.showQuickPick(
        kinds.map(k => ({ ...k, label: k.pre === (current?.kind ?? '') ? `${k.label} ✓` : k.label })),
        { ignoreFocusOut: true, placeHolder: `Fire "${title}" only if… (checked for free, before anything is spent)` });
    if (!pick) { return undefined; }
    if (!pick.pre) { return { value: undefined }; }

    const pre: Precondition = { kind: pick.pre as Precondition['kind'] };
    if (pick.pre !== 'queueHasWork') {
        const p = await vscode.window.showInputBox({
            title: `Path for "${title}"`,
            value: current?.path ?? '',
            placeHolder: pick.pre === 'fileMissing'
                ? String.raw`e.g. D:\…\REPORT_DAY\{today} Gün.md  ({today} / {yesterday} expand)`
                : 'absolute path to the folder / file',
            ignoreFocusOut: true,
            validateInput: v => v.trim() ? undefined : 'A path is required.'
        });
        if (!p) { return undefined; }
        pre.path = p.trim();
    }
    if (pick.pre === 'folderHasFiles') {
        const skip = await vscode.window.showInputBox({
            title: 'Files that do NOT count as work (comma separated)',
            value: (current?.except ?? ['_LOG_.md']).join(', '),
            placeHolder: '_LOG_.md',
            ignoreFocusOut: true
        });
        if (skip === undefined) { return undefined; }
        pre.except = skip.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (pick.pre === 'pathChangedWithin') {
        const h = await vscode.window.showInputBox({
            title: 'Changed within how many hours?', value: String(current?.hours ?? 24),
            ignoreFocusOut: true,
            validateInput: v => Number(v) > 0 ? undefined : 'A positive number of hours.'
        });
        if (!h) { return undefined; }
        pre.hours = Math.floor(Number(h));
    }
    if (pick.pre === 'folderHasFiles' || pick.pre === 'queueHasWork') {
        const n = await vscode.window.showInputBox({
            title: 'How many items before it is worth a run?',
            value: String(current?.minCount ?? 1), ignoreFocusOut: true,
            validateInput: v => Number(v) >= 1 ? undefined : 'At least 1.'
        });
        if (!n) { return undefined; }
        pre.minCount = Math.floor(Number(n));
    }
    return { value: pre };
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    let agents: AgentInfo[] = [];
    let insights: Insight[] = [];
    // Pricing history: a timestamped log of rule sets so past costs stay frozen
    // when rates change. The `agentFarm.pricing` setting holds the *current*
    // rules (editable from the agent page or by hand); each change appends a
    // dated entry here, and costFor(model, u, ts) prices each message at the
    // rate in effect at its time — only usage after a change is re-priced.
    const PRICING_HISTORY_KEY = 'agentfarm.pricingHistory';
    const loadPricingHistory = (): PricingVersion[] => {
        const stored = context.globalState.get<PricingVersion[]>(PRICING_HISTORY_KEY);
        if (stored && stored.length) { return stored; }
        // Seed from the current setting, effective from the beginning of time so
        // every existing session keeps today's rates.
        const seed: PricingVersion[] = [
            { effectiveFrom: 0, rules: cfg().get<PriceRule[]>('pricing', DEFAULT_PRICING) }
        ];
        void context.globalState.update(PRICING_HISTORY_KEY, seed);
        return seed;
    };
    const recordPricingChange = (rules: PriceRule[]): void => {
        const history = loadPricingHistory();
        const latest = history[history.length - 1];
        if (JSON.stringify(latest.rules) === JSON.stringify(rules)) { return; }
        history.push({ effectiveFrom: Date.now(), rules });
        void context.globalState.update(PRICING_HISTORY_KEY, history);
    };
    let pricing = PricingEngine.fromHistory(loadPricingHistory());

    // B2: secrets vault (OS keychain via SecretStorage), cached for sync use.
    const vault = new SecretsVault(context.secrets, context.globalState);
    await vault.refresh();

    // D1/D2: file-backed stores for quality scores and instruction suggestions.
    fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

    // Publisher/extension-id rename migration: stored task & mission records
    // carry absolute output paths under the OLD globalStorage id — rewrite them
    // once before anything loads, or every "output" link 404s.
    {
        const base = path.basename(context.globalStorageUri.fsPath);
        for (const name of ['farm-tasks.json', 'missions.json']) {
            const file = path.join(context.globalStorageUri.fsPath, name);
            try {
                const raw = fs.readFileSync(file, 'utf8');
                const fixed = remapStorageIds(raw, base);
                if (fixed !== raw) { fs.writeFileSync(file, fixed, 'utf8'); }
            } catch { /* not created yet */ }
        }
    }
    const qualityStore = new QualityStore(path.join(context.globalStorageUri.fsPath, 'quality.json'));
    const suggestionStore = new SuggestionStore(path.join(context.globalStorageUri.fsPath, 'suggestions.json'));
    const judgeArgs = () => cfg().get<string>('judgeArgs', '--model claude-haiku-4-5-20251001');

    // G3: eval cases + runs (trace→dataset loop).
    const evalStore = new EvalStore(path.join(context.globalStorageUri.fsPath, 'evals.json'));

    // H3: pulse (smoke) results.
    const pulseStore = new PulseStore(path.join(context.globalStorageUri.fsPath, 'pulse.json'));

    // Notices — the agent→user notice board (core/notices.ts): a persisted,
    // user-owned message channel every agent posts to via the `notices.post`
    // bridge op. Dedicated page + a status-bar bell carrying the unread count.
    const noticesStore = new NoticesStore(path.join(context.globalStorageUri.fsPath, 'notices.json'));
    noticesStore.load();
    // Work Queue — the user→agent async work channel (core/workqueue.ts): the
    // mirror of Notices. The SAME status-bar bell carries its "needs you"
    // (blocked) count, so the user has ONE attention indicator — never two
    // separate places to scan.
    const workQueueStore = new WorkQueueStore(path.join(context.globalStorageUri.fsPath, 'work-queue.json'));
    workQueueStore.load();
    // Doc-open config (core/docopen.ts) — the module store behind the shared
    // "open with" split-button on report/answer .md links in BOTH boards. Its
    // own JSON file, deliberately NOT a VS Code settings leak (the custom-app
    // command is machine-specific and the choice is a panel UI convenience).
    const docOpenStore = new DocOpenStore(path.join(context.globalStorageUri.fsPath, 'doc-open-config.json'));
    // Feed the global nav's 🔔 Notices badge (read live at each page render).
    setNoticesUnreadProvider(() => noticesStore.unread());
    setQueueBlockedProvider(() => workQueueStore.blocked());
    const noticesBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
    noticesBar.command = 'agentfarm.openNotices';
    context.subscriptions.push(noticesBar);
    /** Living page refresh signal — fired by anything that changes a loop. */
    const livingEmitter = new vscode.EventEmitter<void>();
    context.subscriptions.push(livingEmitter);
    // A notice that has gone unread for a day is a loop that never closed. The
    // badge used to count everything flat, so a 3-minute update and a 3-day
    // level-3 announcement looked identical — which is how a daily cycle can
    // die for weeks while its safety-net reminder sits on the board unread.
    // Aging gives the board its SECOND BEAT: it starts insisting.
    const nagged = new Set<string>();
    const escalatedNotices = () => {
        const staleH = cfg().get<number>('noticeStaleHours', 24);
        const cutoff = Date.now() - staleH * 3600_000;
        const all = noticesStore.list({ limit: 0 });
        return {
            stale: all.filter(n => !n.read && n.level >= 3 && n.ts < cutoff),
            questions: all.filter(n => n.type === 'question' && n.status === 'open' && n.ts < cutoff),
            staleH
        };
    };
    const updateNoticesBadge = () => {
        const u = noticesStore.unread();
        const b = workQueueStore.blocked();   // queue items that need YOU
        const n = u + b;
        const { stale, questions, staleH } = escalatedNotices();
        const aging = stale.length + questions.length;
        if (aging > 0) {
            noticesBar.text = `$(warning) ${n || aging}`;
            noticesBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            const oldest = [...stale, ...questions].sort((a, b2) => a.ts - b2.ts)[0];
            const days = Math.round((Date.now() - oldest.ts) / 3600_000 / 24 * 10) / 10;
            noticesBar.tooltip =
                `${aging} item(s) waiting longer than ${staleH}h — oldest "${oldest.title}" (${days} day(s))` +
                `${stale.length ? `\n${stale.length} unread important notice(s)` : ''}` +
                `${questions.length ? `\n${questions.length} unanswered agent question(s)` : ''}` +
                '\nClick to open the board.';
        } else {
            noticesBar.text = n > 0 ? `$(bell-dot) ${n}` : '$(bell)';
            noticesBar.backgroundColor = undefined;
            noticesBar.tooltip = n > 0
                ? `${u} unread notice(s)${b ? ` · ${b} queue item(s) need you` : ''} — click to open`
                : 'Notices & work queue — agent↔you';
        }
        noticesBar.show();
        // The bell is not the only place these two numbers are shown: every open
        // page carries them in its header (🔔 nav badge, 🔔/📥 tab strip). They
        // are repainted from HERE so the bell and the pages can never disagree.
        pushHeaderCounts();

        // Insist ONCE per item, never in a loop: the point is that ignoring
        // something has a consequence, not that the farm becomes a nag.
        for (const q of questions) {
            if (nagged.has(q.id)) { continue; }
            nagged.add(q.id);
            void vscode.window.showWarningMessage(
                `Agent Farm: ${q.agentName || 'an agent'} has been waiting ${Math.round((Date.now() - q.ts) / 3600_000)}h for an answer — "${q.title}"`,
                'Answer now', 'Later'
            ).then(p => { if (p === 'Answer now') { void vscode.commands.executeCommand('agentfarm.openNotices', q.id); } });
        }
        livingEmitter.fire();
    };
    updateNoticesBadge();
    // Staleness is a function of TIME, not of events — without its own tick a
    // notice would only "become old" the next time something else happened.
    const agingTimer = setInterval(updateNoticesBadge, 10 * 60_000);
    context.subscriptions.push({ dispose: () => clearInterval(agingTimer) });

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
            .map(d => ({ name: (d.name ?? '').trim() || 'remote', dir: expandEnvPath((d.dir as string).trim()) })),
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

    // The shelf (pin + tags) lives beside the names, in its own store: a mark
    // is the user's own annotation, so it survives restarts, re-scans and the
    // transcript being rewritten under it.
    const MARKS_KEY = 'agentfarm.sessionMarks';
    const sessionMarks = (): SessionMarks =>
        normalizeMarks(context.globalState.get<unknown>(MARKS_KEY, {}));
    // (refreshAll is defined further down, once the trees exist; a mark is only
    // ever saved from a command, long after activation.)
    const saveMarks = async (marks: SessionMarks) => {
        await context.globalState.update(MARKS_KEY, marks);
        index.setMarks(marks);
        refreshAll();
        // ‼️ The TREES were told and the PAGES were not, so pinning from a
        // webview did the thing and showed nothing: the star or 📌 only
        // appeared when something else happened to trigger a repaint — which
        // reads as "sometimes it works". A mark is a visible fact everywhere
        // it is shown, so every open surface hears about it at once.
        ConsolePanel.refreshIfOpen();
        SessionViewerPanel.refreshOpen();
        DashboardPanel.refreshIfOpen();
        AgentDetailPanel.refreshIfOpen();
        PortfolioPanel.refreshIfOpen();
        TimelinePanel.refreshIfOpen();
    };
    index.setMarks(sessionMarks());

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
            .map(p => ({ agentId: p.agentId, agentName: p.agentName, reason: p.reason, ts: p.ts })),
        // Dead-duty check: the searchable text of every ENABLED automation.
        // Left undefined until the task manager exists — a caller that cannot
        // see automations must not conclude that every duty is unwired.
        automationTitles: taskManagerRef
            ? [
                ...taskManagerRef.schedules.filter(s => s.enabled).map(s => `${s.title} ${s.prompt}`),
                ...taskManagerRef.triggers.filter(t => t.enabled).map(t =>
                    `${t.title} ${t.action.kind === 'workflow' ? '' : t.action.prompt}`)
            ]
            : undefined
    });

    // Insights lifecycle: a dismissed insight stays hidden (for a day, a week
    // or forever) everywhere insights are consumed — tree, dashboard, digest.
    const DISMISS_KEY = 'agentfarm.dismissedInsights';
    const DELEGATED_KEY = 'agentfarm.insightDelegated';
    let dismissedInsightCount = 0;
    const applyInsightDismiss = (list: Insight[]): Insight[] => {
        const dismissed = context.globalState.get<Record<string, DismissEntry>>(DISMISS_KEY, {});
        const res = filterDismissed(list, dismissed, Date.now());
        if (res.expiredKeys.length) {
            for (const k of res.expiredKeys) { delete dismissed[k]; }
            void context.globalState.update(DISMISS_KEY, dismissed);
        }
        dismissedInsightCount = res.dismissedCount;
        return res.visible;
    };

    const refreshAgents = () => {
        agents = discoverAgents(
            cfg().get<string[]>('agentRoots', []),
            cfg().get<string[]>('excludeAgentDirs', []));
        insights = applyInsightDismiss(buildInsights(agents, index, healthConfig()));
        // I1: snapshot changed CLAUDE.md files into the version history.
        for (const a of agents) {
            if (!a.claudeMdPath) { continue; }
            try { instrHistory.record(a.id, fs.readFileSync(a.claudeMdPath, 'utf8')); }
            catch { /* unreadable */ }
        }
    };
    refreshAgents();

    // ---------- News, not work ----------
    //
    // ‼️ Everything the farm wants to TELL the user lands on Notices; only rows
    // that BLOCK work go to Needs You (the admission test lives in core/needs.ts).
    // A notice is permanent and re-readable, so each thing is announced exactly
    // ONCE — and the guard has to be persisted, because an in-memory Set reposts
    // every still-open item on the next VS Code restart. Entries age out after a
    // month so the store cannot grow without bound.
    const NEWS_KEY = 'agentfarm.newsPosted';
    const NEWS_TTL_MS = 30 * 24 * 3600 * 1000;
    const postNewsOnce = (key: string, input: NoticeInput): boolean => {
        const posted = context.globalState.get<Record<string, number>>(NEWS_KEY, {});
        if (posted[key]) { return false; }
        noticesStore.add({ agentName: 'agent-farm', sourceKey: key, ...input });
        const now = Date.now();
        posted[key] = now;
        for (const [k, ts] of Object.entries(posted)) {
            if (now - ts > NEWS_TTL_MS) { delete posted[k]; }
        }
        void context.globalState.update(NEWS_KEY, posted);
        updateNoticesBadge();
        NoticesPanel.refreshIfOpen();
        return true;
    };
    /**
     * The other half of "announced exactly once": a notice about a CONDITION is
     * taken back when the condition ends.
     *
     * ‼️ The once-guard is what makes this necessary rather than optional. Left
     * alone, the guard would keep a dead reminder on the board forever AND
     * refuse to announce the next occurrence of the same thing, because the key
     * still says "already told them". Withdrawing clears both: the line goes,
     * and the key is freed so the condition arising again is news again.
     * A pinned or starred notice stays (see dismissBySource) — but its key is
     * still freed, so the user keeping a copy never costs them the next alert.
     */
    const retractNews = (key: string): boolean => {
        const posted = context.globalState.get<Record<string, number>>(NEWS_KEY, {});
        const removed = noticesStore.dismissBySource(key);
        if (!posted[key] && !removed.length) { return false; }
        if (posted[key]) { delete posted[key]; void context.globalState.update(NEWS_KEY, posted); }
        if (removed.length) { updateNoticesBadge(); NoticesPanel.refreshIfOpen(); }
        return true;
    };
    /** Assigned once the live monitor and the task manager exist (see below). */
    let postFarmNews: () => void = () => { };

    let triggerManagerRef: TriggerManager | undefined;
    // cwd → agent mapping, shared by the live monitor and the external-CLI
    // transcript sources (E3b). Pure extraction — behavior unchanged.
    const resolveAgentByCwd = (cwd: string | undefined): { agentId?: string; agentName?: string } => {
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
    };
    const live = new LiveMonitor(
        () => ({
            enabled: cfg().get<boolean>('liveMonitor', true),
            port: cfg().get<number>('livePort', 8377),
            stuckThresholdMs: cfg().get<number>('stuckThresholdSeconds', 240) * 1000,
            notifyPermission: cfg().get<boolean>('notifyPermission', true),
            notifyStuck: cfg().get<boolean>('notifyStuck', true),
            notifyTurnEnd: cfg().get<boolean>('notifyTurnEnd', false),
            forward: postForward,
            onTurnReady: fireTurnReady
        }),
        resolveAgentByCwd,
        // B3 inbound: /trigger/<token> → webhook trigger (late-bound; manager is created below)
        (token, payload) => triggerManagerRef?.fireWebhook(token, payload) ?? false,
        path.join(context.globalStorageUri.fsPath, 'live-events.jsonl')
    );
    context.subscriptions.push(live);
    live.start();

    // ---- Turn-ready notifications (per-agent, opt-in via timeline swim-lane toggles) ----
    // The swim lane for each agent carries four toggles: ♪ sound, ◎ focus, ▣ modal,
    // ▭ toast. Whatever an agent has selected fires when it crosses INTO YOUR TURN.
    // Those are the AGENT DEFAULT; a Live-sessions card can override them for one
    // session only (keyed by sessionId — an empty override means "mute this session").
    const AGENT_CLI_KEY = 'agentfarm.agentCli'; // E1: last CLI used per agent for "Start Session With…"
    const TURN_ACTIONS_KEY = 'agentfarm.turnActions';
    const TURN_ACTIONS_SESSION_KEY = 'agentfarm.turnActionsSession';
    const getTurnActions = (): Record<string, string[]> =>
        context.globalState.get<Record<string, string[]>>(TURN_ACTIONS_KEY, {});
    const setTurnActions = (map: Record<string, string[]>): void => {
        void context.globalState.update(TURN_ACTIONS_KEY, map);
    };
    const getSessionTurnActions = (): Record<string, string[]> =>
        context.globalState.get<Record<string, string[]>>(TURN_ACTIONS_SESSION_KEY, {});
    const pruneSessionTurnActions = (map: Record<string, string[]>): Record<string, string[]> => {
        // Session ids are ephemeral — keep only overrides for sessions still tracked.
        const alive = new Set(live.sessions().map(s => s.sessionId));
        const pruned: Record<string, string[]> = {};
        for (const [id, acts] of Object.entries(map)) {
            if (alive.has(id) && Array.isArray(acts)) { pruned[id] = acts; }
        }
        return pruned;
    };
    const setSessionTurnActions = (map: Record<string, string[]>): void => {
        void context.globalState.update(TURN_ACTIONS_SESSION_KEY, pruneSessionTurnActions(map));
    };
    // Sweep once after the live store has rebuilt its sessions (reload path).
    const turnPruneTimer = setTimeout(
        () => setSessionTurnActions(getSessionTurnActions()), 8000);
    context.subscriptions.push({ dispose: () => clearTimeout(turnPruneTimer) });
    const showTimeline = (): void => {
        TimelinePanel.show({
            extensionUri: context.extensionUri, live, tasks: taskManager, index,
            // A live card may only claim "no process" when the CLI's own
            // registry is there to be read — otherwise silence proves nothing.
            liveOwners: () => readCliSessions(claudeDir()),
            ownersKnown: () => fs.existsSync(sessionsDir(claudeDir())),
            stuckMs: () => cfg().get<number>('stuckThresholdSeconds', 240) * 1000,
            getTurnActions, setTurnActions, getSessionTurnActions, setSessionTurnActions
        });
    };
    const turnFireCooldown = new Map<string, number>();
    const playTurnSound = (): void => {
        try {
            if (process.platform === 'win32') {
                cp.exec('powershell -NoProfile -NonInteractive -Command "[console]::beep(880,150);[console]::beep(1245,170)"');
            } else if (process.platform === 'darwin') {
                cp.exec('afplay /System/Library/Sounds/Glass.aiff || osascript -e beep');
            } else {
                cp.exec('paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || printf "\\a"');
            }
        } catch { /* best effort — a missing player must never break the flow */ }
    };
    function fireTurnReady(s: LiveSession): void {
        const name = live.labelOf(s);
        // Session override wins (an explicit [] mutes this session); otherwise
        // the agent default set on the swim-lane toggles applies.
        const actions = getSessionTurnActions()[s.sessionId]
            ?? getTurnActions()[s.agentName ?? s.sessionId.slice(0, 8)] ?? [];
        if (!actions.length) { return; }
        // Coalesce rapid re-entries into waiting-input so one turn = one alert.
        // Keyed by session — two sessions of the same agent alert independently.
        const now = Date.now();
        if (now - (turnFireCooldown.get(s.sessionId) ?? 0) < 3000) { return; }
        turnFireCooldown.set(s.sessionId, now);

        if (actions.includes('sound')) { playTurnSound(); }
        if (actions.includes('focus')) {
            showTimeline();
            try { void vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup'); } catch { /* best effort */ }
        }
        const transcript = s.transcriptPath;
        if (actions.includes('modal')) {
            const buttons = transcript ? ['Open Transcript'] : [];
            void vscode.window.showInformationMessage(
                `Agent Farm — Your turn: ${name}`, { modal: true }, ...buttons
            ).then(choice => {
                if (choice === 'Open Transcript' && transcript) {
                    void vscode.commands.executeCommand('agentfarm.openSession', transcript);
                }
            });
        }
        if (actions.includes('toast')) {
            void vscode.window.showInformationMessage(
                `Agent Farm: ${name} — your turn`, 'Open Timeline'
            ).then(choice => {
                if (choice === 'Open Timeline') { showTimeline(); }
            });
        }
    }

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

    // ---- E2a: external-CLI session lifecycle (Start Session With…) ----
    // Sessions opened with a non-claude CLI have no hooks, so the only reliable
    // signal is the terminal itself: open → SessionStart, close → SessionEnd.
    // Namespaced `cli:` session ids keep them apart from claude's UUIDs.
    const cliTerminals = new Map<vscode.Terminal, { sessionId: string; cwd?: string }>();
    context.subscriptions.push(vscode.window.onDidCloseTerminal(t => {
        const info = cliTerminals.get(t);
        if (!info) { return; }
        cliTerminals.delete(t);
        live.handle({
            session_id: info.sessionId, cwd: info.cwd,
            hook_event_name: 'SessionEnd', reason: 'terminal closed'
        });
    }));
    // After a reload the terminal→session map is gone while rebuildSessions()
    // revives `cli:` lanes from the store. Re-attach each one to its restored
    // terminal by name, or close it out honestly — otherwise it would linger
    // as a ghost row until the session TTL. Delayed: restored terminals appear
    // shortly after activation.
    const cliRebindTimer = setTimeout(() => {
        for (const s of live.sessions()) {
            if (!s.source || s.status === 'ended') { continue; }
            const bound = [...cliTerminals.values()].some(i => i.sessionId === s.sessionId);
            if (bound) { continue; }
            const term = vscode.window.terminals.find(t =>
                t.name === `${s.source}: ${s.agentName}` && !cliTerminals.has(t));
            if (term) {
                cliTerminals.set(term, { sessionId: s.sessionId, cwd: s.cwd });
            } else {
                live.handle({
                    session_id: s.sessionId, cwd: s.cwd,
                    hook_event_name: 'SessionEnd', reason: 'window reloaded'
                });
            }
        }
    }, 5000);
    context.subscriptions.push({ dispose: () => clearTimeout(cliRebindTimer) });

    // ---- E3: external-CLI session history ----
    // Three fail-soft sources, all kept in the index's side list so claude
    // analytics never see them; the sessions trees and dashboard opt in
    // explicitly. E3a: the live-event store (`cli:` lanes). E3b: the CLIs' own
    // transcripts — codex rollout JSONLs and gemini chat files — with real
    // token usage; cost comes from agentFarm.pricing rules (no rule → $0 +
    // unknown-models warning). Transcript entries win over overlapping lanes.
    const externalSessionSource = liveEventsSource(
        () => path.join(context.globalStorageUri.fsPath, 'live-events.jsonl'));
    const codexSource = codexSessionsSource(
        () => expandEnvPath(cfg().get<string>('codexHome', '').trim()) || path.join(os.homedir(), '.codex'),
        resolveAgentByCwd,
        () => pricing);
    const geminiSource = geminiSessionsSource(
        () => expandEnvPath(cfg().get<string>('geminiDir', '').trim()) || path.join(os.homedir(), '.gemini', 'tmp'),
        () => agents,
        () => pricing);
    const refreshExternalSessions = () =>
        index.setExternal(buildExternalSessions([externalSessionSource, codexSource, geminiSource]));
    refreshExternalSessions();
    let externalSessTimer: NodeJS.Timeout | undefined;
    context.subscriptions.push(live.onDidUpdate(() => {
        if (externalSessTimer) { clearTimeout(externalSessTimer); }
        externalSessTimer = setTimeout(refreshExternalSessions, 15_000);
    }));
    context.subscriptions.push({ dispose: () => { if (externalSessTimer) { clearTimeout(externalSessTimer); } } });
    // B5: CLIs used OUTSIDE farm terminals produce no live events, so a quiet
    // interval keeps their transcripts appearing without a reload. Cheap: the
    // sources cache per file (mtime+size) and per scan (60s), and setExternal
    // only fires when the content signature actually changed.
    const externalInterval = setInterval(refreshExternalSessions, 60_000);
    context.subscriptions.push({ dispose: () => clearInterval(externalInterval) });

    // A session started with a name (`claude -n …`, what the launcher passes)
    // carries that name ONLY in the CLI's own live registry — it is never
    // written to the transcript, and the registry file dies with the process.
    // So the names are read from there and remembered: scanned at startup, on a
    // quiet beat, and right after a launch (the file appears a second or two
    // after the terminal opens). setCliNames only fires when something changed.
    const NAMES_KEY = 'agentfarm.sessionNames';
    // Names Agent Farm itself passed with -n. A CLI build that does not report
    // `nameSource` still gets these adopted, because we know they were chosen.
    const OUR_NAMES_KEY = 'agentfarm.launchNames';
    const ourLaunchNames = () => context.globalState.get<string[]>(OUR_NAMES_KEY, []);
    const rememberLaunchName = (name: string) => {
        const n = name.trim();
        if (!n) { return; }
        const list = ourLaunchNames();
        if (list.includes(n)) { return; }
        void context.globalState.update(OUR_NAMES_KEY, [...list, n].slice(-100));
    };
    // 3.29.0 — one-time repair. Earlier builds adopted the name the CLI invents
    // for every unnamed session ("basit-2e"), which replaced good conversation
    // titles with noise. The store is rebuilt from scratch; only names a human
    // actually chose come back.
    const NAMES_REPAIRED_KEY = 'agentfarm.sessionNames.derivedPurge';
    if (!context.globalState.get<boolean>(NAMES_REPAIRED_KEY, false)) {
        void context.globalState.update(NAMES_KEY, {});
        void context.globalState.update(NAMES_REPAIRED_KEY, true);
    }
    const scanCliSessionNames = () => {
        const known = context.globalState.get<Record<string, string>>(NAMES_KEY, {});
        const merged = mergeSessionNames(known, readCliSessions(claudeDir()), ourLaunchNames());
        if (!merged) { return; }
        void context.globalState.update(NAMES_KEY, merged);
        index.setCliNames(merged);
    };
    index.setCliNames(context.globalState.get<Record<string, string>>(NAMES_KEY, {}));
    scanCliSessionNames();
    const namesInterval = setInterval(scanCliSessionNames, 20_000);
    context.subscriptions.push({ dispose: () => clearInterval(namesInterval) });

    const state = {
        getAgents: () => agents,
        index,
        getInsights: () => insights,
        getDismissedInsightCount: () => dismissedInsightCount,
        live
    };

    // B11: only ONE window may run the task pump/scheduler — otherwise two
    // windows double-launch scheduled work and clobber each other's state.
    // Windows race for a lease file; losers follow read-only and take over
    // automatically when the runner window closes.
    const taskLease = new OwnerLease(
        path.join(context.globalStorageUri.fsPath, 'tasks.owner'),
        `${process.pid}-${Math.random().toString(36).slice(2, 8)}`
    );
    let taskRunner = taskLease.tryClaim();
    let followerWarnedAt = 0;

    // Machine roots for portable stores — saved paths become ${claudeDir} /
    // ${globalStorage} / ${home} tokens so the git-synced store files work on
    // every machine (and legacy absolute paths heal on load).
    const portableRoots = () => standardRoots({
        claudeDir: claudeDir(),
        globalStorage: context.globalStorageUri.fsPath,
        home: os.homedir()
    });

    // Projects — the registry and the session link table (core/projectStore.ts).
    // Everything a human writes about a project lives in the project's own
    // FOLDER; this file only records what exists and what the user explicitly
    // put where. The one-time import off the old `agentFarm.projects` setting
    // runs here, and only ever once (see ProjectStore.migrateLegacy).
    const projectStore = new ProjectStore(
        path.join(context.globalStorageUri.fsPath, 'projects.json'), portableRoots);
    projectStore.load();
    {
        const imported = projectStore.migrateLegacy(cfg().get('projects', []));
        if (imported) {
            void vscode.window.showInformationMessage(
                `Agent Farm: ${imported} project${imported === 1 ? '' : 's'} moved off the old setting. ` +
                'Each one still needs a folder — open Projects to choose it.');
        }
    }
    /** Where new project folders are offered, and what a rescan walks. */
    const projectsRoot = (): string => (cfg().get<string>('projectsRoot', '') || '').trim();
    const projectSkeleton = () => normalizeSkeleton(cfg().get('projectSkeleton', []));
    /** The window's active project — what sessions started here are filed under. Window-scoped
     *  on purpose: it means "what am I working on right now", which is not a
     *  property of an agent and not a thing to share between windows. */
    const activeProjectId = (): string => context.workspaceState.get<string>('af.activeProject', '');
    const activeProject = (): Project | undefined => {
        const id = activeProjectId();
        return id ? projectStore.get(id) : undefined;
    };

    /**
     * THE ACTIVE PROJECT'S STAMP — the write the status bar has always promised.
     *
     * `af.activeProject` used to be read by the tree, the page and the bar, and
     * by nothing that filed anything: "new work is stamped with it" was true of
     * no code path. This is that path, and both ways of starting a session go
     * through it — the Console (via ConsoleHost) and a terminal launch.
     *
     * Two rules make it safe to apply after the fact, which it must be, since a
     * session has no id until the CLI reports one:
     *  - the project stamped is the one the session STARTED in, carried on the
     *    console state / the terminal binding, not whatever the bar says now;
     *  - `stampSession` refuses to touch a session the table already has a
     *    decision about, so a resume never overwrites what the user chose —
     *    including their choice that it belongs to no project (K4/2).
     * The set only spares the store a disk read per change event.
     */
    /**
     * ‼️ THE PROJECT A SESSION ALREADY BELONGS TO — what a RESUME must be told.
     *
     * A resume is not a new session and the window's active project has nothing
     * to do with it. Handing a resumed session the active project's brief was
     * the Faz 2 promise going wrong in the place it is least visible: the agent
     * reads a state summary for a project it is not working on, and believes it.
     * The answer is the membership order (`projects.ts`), which is where "what
     * does this session belong to" is decided for every other surface too.
     */
    const sessionOwnProject = (
        s: { sessionId?: string; agentId?: string; agentName?: string; cwd?: string }
    ): string => projectStore.resolve({
        sessionId: s.sessionId ?? '', agentId: s.agentId,
        agentName: s.agentName, cwd: s.cwd
    }).projectId ?? '';

    const stamped = new Set<string>();
    const stampSessionProject = (sessionId: string, projectId: string): void => {
        if (!sessionId || !projectId || stamped.has(sessionId)) { return; }
        stamped.add(sessionId);
        if (projectStore.stampSession(sessionId, projectId)) { projectsChanged(); }
    };

    // ---------- the project session protocol ----------
    /**
     * Everything a session is told about its project, as a file on disk.
     *
     * ‼️ THE CHANNEL IS A FILE BECAUSE IT WAS MEASURED TO BE THE ONLY ONE THAT
     * WORKS (test/smoke_project_context.mjs). All three spawn paths run under
     * `shell: true`, and inline multi-line text does not survive any of them.
     *
     * Regenerated on every spawn rather than cached: the brief describes the
     * project's CURRENT state, and a session started an hour after the last one
     * must not be handed an hour-old answer. Written under globalStorage — not
     * in the project folder — because a project is allowed to have no folder,
     * and this must work for it too.
     *
     * Returns the path, or undefined when there is nothing to say. Undefined
     * means no flag at all: a session with no project looks exactly as it did
     * before any of this existed.
     */
    const contextDir = path.join(context.globalStorageUri.fsPath, 'project-context');

    /**
     * Compose the context — and touch NOTHING on disk.
     *
     * Separate from writing it because the two have completely different
     * frequencies. Writing happens once per spawn; the Console asks for the
     * TEXT on every repaint, and the panel repaints on every event of every
     * hosted session. Composing scans the project folder and reads its worklog,
     * so a streaming turn would have run that scan — and two file writes —
     * dozens of times a second.
     */
    const composeProjectContext = (projectId: string | undefined) => {
        const p = projectId ? projectStore.get(projectId) : undefined;
        if (!p) { return undefined; }
        // Already absolute: the store expands its tokenised paths on load.
        const folder = (p.folder ?? '').trim();
        const repos = (p.repos ?? []).filter(r => !!r?.trim());
        const hasFolder = !!folder && dirExists(folder);
        const roles = hasFolder ? scanRoles(folder) : {};
        const brief = buildBrief({ project: p, roles, repos });
        const briefPath = hasFolder ? path.join(folder, BRIEF_REL) : undefined;
        const text = buildProjectContext({
            name: p.name, id: p.id, folder, repos, brief, briefPath,
            generatedAt: Date.now(),
            extra: cfg().get<string>('projectContextExtra', '')
        });
        return { project: p, folder, hasFolder, brief, text };
    };

    /**
     * Write it, and hand back the path the CLI is given. Called once per spawn.
     *
     * The brief also goes into the project's OWN folder, where it is useful on
     * its own: a session the user starts in their own terminal never gets the
     * flag (measured), but it can still read `_AF/BRIEF.md`.
     */
    const projectContextFileFor = (projectId: string | undefined): string | undefined => {
        const c = composeProjectContext(projectId);
        if (!c) { return undefined; }
        if (c.hasFolder) { writeBrief(c.folder, c.brief); }
        const file = path.join(contextDir, contextFileName(c.project.id));
        try {
            fs.mkdirSync(contextDir, { recursive: true });
            fs.writeFileSync(file, c.text, 'utf8');
        } catch {
            return undefined;   // no context beats a half-written one
        }
        return isQuotableContextPath(file) ? file : undefined;
    };

    /**
     * The text for the transparency chip — the same composition the spawn uses,
     * cached briefly so a repaint is free.
     *
     * It is composed rather than read back off the last file on purpose: the
     * chip must describe what the NEXT session will get, and the last file was
     * written for the last one, possibly before the user edited the project.
     */
    let contextPreview = { id: '', ts: 0, text: '' };
    const projectContextPreviewFor = (projectId: string): string => {
        if (!projectId) { return ''; }
        const now = Date.now();
        if (contextPreview.id === projectId && now - contextPreview.ts < 15000) {
            return contextPreview.text;
        }
        contextPreview = { id: projectId, ts: now, text: composeProjectContext(projectId)?.text ?? '' };
        return contextPreview.text;
    };

    /**
     * The `project` argument a bridge launch may carry, as a project id.
     *
     * Three answers, and they are genuinely different: **absent** = inherit the
     * window's active project (what every launch has always done), **""** =
     * explicitly no project, **a name or id** = that one. Collapsing the first
     * two would make an agent that never mentions projects silently unfile
     * every session it starts.
     */
    const resolveLaunchProject = (raw: unknown): string | undefined => {
        if (raw === undefined) { return undefined; }
        const key = String(raw ?? '').trim();
        if (!key) { return ''; }
        const p = projectStore.get(key);
        need(p, `no project called "${key}" — projects.list shows them`);
        return (p as Project).id;
    };

    const taskManager = new TaskManager(
        path.join(context.globalStorageUri.fsPath, 'farm-tasks.json'),
        () => agents,
        () => cfg().get<boolean>('queueAutoAdvance', false),
        () => cfg().get<string>('taskExtraArgs', ''),
        {
            portableRoots,
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
            // The daily budget as a BRAKE. `agentFarm.budgets` used to raise an
            // insight and let the task start anyway; a ceiling you can walk
            // through is not a ceiling. Per-agent limit first, then the fleet.
            budgetCheck: (agentName) => {
                const budgets = cfg().get<Record<string, number>>('budgets', {});
                if (!budgets || !Object.keys(budgets).length) { return undefined; }
                const d = new Date();
                const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const spend = (agentId?: string) =>
                    (agentId ? index.forAgent(agentId) : index.all())
                        .reduce((sum, s) => sum + (s.daily[day]?.cost ?? 0), 0);
                const own = budgets[agentName];
                if (own && own > 0) {
                    const cost = spend(agents.find(a => a.name === agentName)?.id);
                    if (cost >= own) {
                        return `daily budget spent (${agentName}: $${cost.toFixed(2)} of $${own.toFixed(2)})`;
                    }
                }
                const fleet = budgets['*'];
                if (fleet && fleet > 0) {
                    const cost = spend();
                    if (cost >= fleet) {
                        return `fleet daily budget spent ($${cost.toFixed(2)} of $${fleet.toFixed(2)})`;
                    }
                }
                return undefined;
            },
            queueWorkCount: () => workQueueStore.list({ limit: 0 })
                .filter(i => i.status === 'captured' || i.status === 'grouped' || i.status === 'blocked').length,
            getEnv: (agentId) => vault.env(agentId),
            resolveTemplate: (s) => vault.substitute(s),
            forward: postForward,
            // J5: alternative CLI executors (gemini / codex / …).
            cliProfiles: () => cfg().get<CliProfile[]>('cliProfiles', []),
            // The project the task was CREATED under — not the active one now.
            // A queued task can start hours later, in a window that has moved on.
            activeProjectId: () => activeProjectId() || undefined,
            projectContextFile: (task) => projectContextFileFor(task.projectId),
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
            mediaAuth: (providerId) => {
                if (providerId === 'replicate') {
                    const token = vault.get(cfg().get<string>('replicateAuthSecret', 'REPLICATE_API_TOKEN'));
                    return token ? `Bearer ${token}` : '';
                }
                const key = vault.get(cfg().get<string>('mediaAuthSecret', 'FAL_KEY'));
                return key ? `Key ${key}` : '';
            },
            mediaBaseUrl: (providerId) => providerId === 'replicate'
                ? (cfg().get<string>('replicateBaseUrl', '') || undefined)
                : (cfg().get<string>('mediaBaseUrl', '') || undefined),
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
            },
            // Wave B: visual selection gate — a gallery-picker webview.
            confirmSelection: (info) => {
                void vscode.window.showInformationMessage(
                    `Agent Farm: pick assets for "${info.title}" (${info.candidates.length} candidate(s))`);
                return SelectionPanel.pick(context.extensionUri, info);
            },
            // B11: multi-window safety (see taskLease above).
            isRunner: () => taskRunner,
            onFollowerWrite: () => {
                if (Date.now() - followerWarnedAt < 10_000) { return; }
                followerWarnedAt = Date.now();
                void vscode.window.showWarningMessage(
                    'Agent Farm: another window runs the task queue — changes made here are not saved. Manage tasks in that window.');
            }
        }
    );
    taskManagerRef = taskManager;
    context.subscriptions.push(taskManager);

    // B11: lease heartbeat — renew while held; take over when the runner closes.
    if (!taskRunner) {
        void vscode.window.showInformationMessage(
            'Agent Farm: another window already runs the task queue — tasks are read-only here and mirror that window.');
    }
    const leaseTimer = setInterval(() => {
        const held = taskLease.tryClaim();
        if (held && !taskRunner) {
            taskRunner = true; // flip BEFORE becomeRunner so load() runs in runner mode
            taskManager.becomeRunner();
            void vscode.window.showInformationMessage(
                'Agent Farm: this window now runs the task queue (the previous runner window closed).');
        } else if (!held && taskRunner) {
            // Lost the lease (e.g. a long OS sleep let another window take over).
            taskRunner = false;
            taskManager.becomeFollower();
        }
    }, 7_000);
    context.subscriptions.push({ dispose: () => { clearInterval(leaseTimer); taskLease.release(); } });

    // Z4: attach real token costs to finished headless tasks. The task ran
    // `claude -p` in the agent folder, so its transcript lands in the session
    // index — match by lifespan and copy the priced cost onto the task.
    // Ambiguity (a second session in the same folder at the same time) means
    // no match: better no figure than a wrong one. Runner window only.
    const costPending = new Map<string, { agentId: string; startedAt: number; endedAt: number; tries: number }>();
    const tryAttachCosts = () => {
        if (!taskRunner) { return; }
        for (const [id, p] of costPending) {
            const hit = matchTaskSession(p, index.forAgent(p.agentId));
            if (hit) {
                taskManager.setTaskCost(id, hit.cost, hit.file, totalTokens(hit.usage));
                costPending.delete(id);
            } else if (++p.tries > 60 || Date.now() - p.endedAt > 15 * 60_000) {
                costPending.delete(id); // transcript never appeared or stayed ambiguous
            }
        }
    };
    context.subscriptions.push(taskManager.onDidChange(() => {
        const cutoff = Date.now() - 10 * 60_000;
        for (const t of taskManager.tasks) {
            if (t.mode !== 'headless' || (t.status !== 'done' && t.status !== 'failed')) { continue; }
            if (t.costUSD !== undefined || !t.startedAt || !t.endedAt || t.endedAt < cutoff) { continue; }
            if (!costPending.has(t.id)) {
                costPending.set(t.id, { agentId: t.agentId, startedAt: t.startedAt, endedAt: t.endedAt, tries: 0 });
            }
        }
        tryAttachCosts();
    }));
    context.subscriptions.push(index.onDidUpdate(() => { if (costPending.size) { tryAttachCosts(); } }));

    // F1: workflow runs cut by the last window close — offer to pick them up.
    // Not automatic: a resumed run can spend money/agent time, so the user decides.
    const interruptedRuns = taskManager.interruptedRuns();
    if (interruptedRuns.length) {
        const list = interruptedRuns
            .map(r => `"${r.workflowTitle}" (step ${r.stepIndex + 1}: ${r.stepTitle})`).join(', ');
        void vscode.window.showWarningMessage(
            `Agent Farm: ${interruptedRuns.length} workflow run(s) were interrupted when the window closed — ${list}.`,
            'Resume', 'Dismiss'
        ).then(choice => {
            if (choice === 'Resume') {
                for (const r of interruptedRuns) { taskManager.resumeInterrupted(r.runId); }
            } else if (choice === 'Dismiss') {
                taskManager.dismissInterrupted();
            }
        });
    }

    // Wave A (media roadmap): watched ingest folders → assets registered into
    // the gallery in place (downloads from web platforms, editor exports…).
    const ingest = new IngestWatcher(
        taskManager.outputsDir,
        () => cfg().get<IngestFolder[]>('ingestFolders', [])
            .filter(f => f && typeof f.path === 'string' && !!f.path.trim())
            .map(f => ({ ...f, path: expandEnvPath(f.path.trim()) })),
        (metas) => {
            StudioPanel.refreshIfOpen();
            const sources = [...new Set(metas.map(m => m.source ?? 'external'))].join(', ');
            void vscode.window.showInformationMessage(
                `Agent Farm: ${metas.length} media asset(s) registered from ${sources}`, 'Open Gallery'
            ).then(choice => {
                if (choice === 'Open Gallery') { void vscode.commands.executeCommand('agentfarm.openGallery'); }
            });
        },
        undefined,
        // Wave D: auto-link an ingested file to a scene by naming convention.
        (projectId, filename) => {
            const p = discoverProductions(agents).find(x => x.production.id === projectId);
            return p ? detectSceneId(filename, p.production) : undefined;
        }
    );
    context.subscriptions.push(ingest);
    ingest.start();

    // Wave A: monthly media budget alert (0 = off) — warn once per calendar month.
    let mediaBudgetNotifiedMonth = '';
    const checkMediaBudget = () => {
        const budget = cfg().get<number>('mediaBudgetMonthUSD', 0);
        if (budget <= 0) { return; }
        const month = new Date().toISOString().slice(0, 7);
        if (mediaBudgetNotifiedMonth === month) { return; }
        const spent = mediaCostSince(taskManager.outputsDir, 30 * 24 * 3600 * 1000);
        if (spent < budget) { return; }
        mediaBudgetNotifiedMonth = month;
        postForward('budget', `media budget exceeded — ~$${spent.toFixed(2)} of $${budget} (last 30 days)`);
        void vscode.window.showWarningMessage(
            `Agent Farm: media budget exceeded — ~$${spent.toFixed(2)} of $${budget} in the last 30 days`,
            'Open Gallery'
        ).then(choice => {
            if (choice === 'Open Gallery') { void vscode.commands.executeCommand('agentfarm.openGallery'); }
        });
    };
    taskManager.onDidChange(checkMediaBudget, null, context.subscriptions);

    // Wave A: shared production-scene picker. undefined = user cancelled;
    // {} = explicitly no assignment (also when no manifests exist).
    const pickProductionScene = async (
        placeHolder: string
    ): Promise<{ projectId?: string; sceneId?: string } | undefined> => {
        const productions = discoverProductions(agents);
        if (!productions.length) { return {}; }
        interface ScenePick extends vscode.QuickPickItem { projectId?: string; sceneId?: string }
        const items: ScenePick[] = [{ label: '$(dash) No scene', description: 'no production/scene assignment' }];
        for (const p of productions) {
            items.push({
                label: `$(folder) ${p.production.title}`,
                description: `${p.agentName} — project only`, projectId: p.production.id
            });
            for (const s of p.production.scenes) {
                items.push({
                    label: `    $(circle-small) ${s.title}`,
                    description: `${p.production.title} · ${s.status}`,
                    projectId: p.production.id, sceneId: s.id
                });
            }
        }
        const pick = await vscode.window.showQuickPick(items, { placeHolder, ignoreFocusOut: true });
        if (!pick) { return undefined; }
        return { projectId: pick.projectId, sceneId: pick.sceneId };
    };

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
        },
        // B11: read-only badge while another window holds the runner lease.
        () => taskRunner);

    // Toolbox inventory is a filesystem sweep (user ~/.claude + every agent
    // folder); memoize briefly so expanding tree nodes doesn't rescan per node.
    let toolboxCache: { at: number; inv: ToolboxInventory } | undefined;
    const toolboxInventory = () => {
        if (!toolboxCache || Date.now() - toolboxCache.at > 5000) {
            toolboxCache = { at: Date.now(), inv: buildToolboxInventory(agents) };
        }
        return toolboxCache.inv;
    };
    const toolboxTree = new ToolboxTreeProvider({ inventory: toolboxInventory });
    const toolboxProbeCacheFile = path.join(context.globalStorageUri.fsPath, 'toolbox-mcp-cache.json');

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agentfarm.agents', agentsTree),
        vscode.window.registerTreeDataProvider('agentfarm.sessions', sessionsTree),
        vscode.window.registerTreeDataProvider('agentfarm.insights', insightsTree),
        vscode.window.registerTreeDataProvider('agentfarm.feed', feedTree),
        vscode.window.registerTreeDataProvider('agentfarm.tasks', tasksTree),
        vscode.window.registerTreeDataProvider('agentfarm.toolbox', toolboxTree)
    );

    const refreshAll = () => {
        refreshAgents();
        agentsTree.refresh();
        sessionsTree.refresh();
        insightsTree.refresh();
        feedTree.refresh();
        tasksTree.refresh();
        toolboxCache = undefined;
        toolboxTree.refresh();
        CapabilitiesPanel.refreshIfOpen();
        ToolboxPanel.refreshIfOpen();
    };

    /**
     * Give a session the user's own name (empty restores the automatic title).
     *
     * The one place that writes it, so a rename means the same thing from the
     * side panel, the Console row, the session's own page and the bridge — and
     * every surface showing that name is told, tab captions included.
     */
    const applySessionTitle = async (sessionId: string, name: string): Promise<string> => {
        const titles = { ...sessionTitles() };
        if (name.trim()) { titles[sessionId] = name.trim(); }
        else { delete titles[sessionId]; }
        await context.globalState.update(TITLES_KEY, titles);
        index.setTitleOverrides(titles);
        refreshAll();
        ConsolePanel.refreshIfOpen();
        SessionViewerPanel.refreshOpen();
        return titles[sessionId] ?? '';
    };

    /**
     * ‼️ The pages follow the index, not the Refresh button.
     *
     * A session that starts, a turn that lands, a cost that changes — the trees
     * were told and the *pages* were not, so a Dashboard, an agent page, the
     * Portfolio or the Turns page left open showed the farm as it was when you
     * opened it. Talking in the Console and watching another page ignore the
     * conversation is the sharpest form of that: the data was indexed and live
     * the whole time, and nothing on screen said so.
     *
     * Debounced, because a streaming session updates the index several times a
     * second and a full page render per line would be a page that flickers
     * instead of a page that follows. One second is under "did it notice?" and
     * far above the cost of a render.
     */
    let pagePulse: NodeJS.Timeout | undefined;
    const refreshOpenPages = (): void => {
        if (pagePulse) { return; }
        pagePulse = setTimeout(() => {
            pagePulse = undefined;
            DashboardPanel.refreshIfOpen();
            AgentDetailPanel.refreshIfOpen();
            PortfolioPanel.refreshIfOpen();
            TurnsPanel.refreshIfOpen();
            LivingPanel.refreshIfOpen();
        }, 1000);
    };
    context.subscriptions.push({ dispose: () => { if (pagePulse) { clearTimeout(pagePulse); } } });

    index.onDidUpdate(() => {
        insights = applyInsightDismiss(buildInsights(agents, index, healthConfig()));
        postFarmNews();
        agentsTree.refresh();
        sessionsTree.refresh();
        insightsTree.refresh();
        feedTree.refresh();
        needsEmitter.fire();
        refreshOpenPages();
    }, null, context.subscriptions);
    taskManager.onDidChange(() => needsEmitter.fire(), null, context.subscriptions);

    // Automatic fleet reports (e.g. into an Obsidian vault folder), checked hourly.
    const checkAutoReport = () => {
        const cadence = cfg().get<string>('autoReport', 'off');
        const folder = expandEnvPath(cfg().get<string>('autoReportFolder', ''));
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
    // Opt-in auto-delegation: chosen categories become headless tasks for the
    // insight's OWN agent as soon as they appear — with a 24h per-problem
    // cooldown so a lingering warning doesn't spawn a task an hour. Off by
    // default (it spends agent time/money); runner window only (B11).
    const autoDelegateInsights = () => {
        if (!taskRunner) { return; }
        const cats = cfg().get<string[]>('insightAutoDelegate', []);
        if (!cats.length) { return; }
        const last = context.globalState.get<Record<string, number>>(DELEGATED_KEY, {});
        const picks = pickAutoDelegates(insights, cats, last, Date.now())
            .filter(i => i.agentId && agents.some(a => a.id === i.agentId));
        if (!picks.length) { return; }
        for (const ins of picks) {
            const agent = agents.find(a => a.id === ins.agentId)!;
            // No project: this fires off an insight scan on a timer, not off
            // anyone working in a project (see TaskManager.addTask).
            const task = taskManager.addTask(agent, delegationTitle([ins]), buildDelegationPrompt([ins]),
                'headless', { projectId: undefined });
            taskManager.startTask(task);
            last[insightKey(ins)] = Date.now();
        }
        void context.globalState.update(DELEGATED_KEY, last);
        void vscode.window.showInformationMessage(
            `Agent Farm: ${picks.length} insight(s) auto-delegated to their agents (agentFarm.insightAutoDelegate).`,
            'Show Tasks'
        ).then(c => { if (c === 'Show Tasks') { void vscode.commands.executeCommand('agentfarm.tasks.focus'); } });
    };

    // E1: the ledger behind "has this come back?" and "did my fix hold?".
    // Written from the same refresh that builds the insights, so it can never
    // drift from what the list actually showed.
    const INSIGHT_HISTORY_KEY = 'agentfarm.insightHistory';
    const insightHistory = (): InsightHistoryStore =>
        normalizeHistory(context.globalState.get<unknown>(INSIGHT_HISTORY_KEY, {}));
    const saveInsightHistory = (store: InsightHistoryStore) =>
        void context.globalState.update(INSIGHT_HISTORY_KEY, store);
    const noteInsightAction = (ins: Insight, kind: 'fix' | 'delegate') =>
        saveInsightHistory(recordAction(insightHistory(), insightKey(ins), kind, Date.now()));

    const refreshInsights = () => {
        insights = applyInsightDismiss(buildInsights(agents, index, healthConfig()));
        const now = Date.now();
        const history = pruneHistory(recordSighting(insightHistory(), insights.map(i => ({
            key: insightKey(i), label: i.message, agentName: i.agentName,
            category: i.category, severity: i.severity
        })), now), now);
        saveInsightHistory(history);
        insightsTree.setHistory(history);
        autoDelegateInsights();
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
            const folder = expandEnvPath(cfg().get<string>('autoReportFolder', ''));
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
            mediaCostToday: mediaCostSince(taskManager.outputsDir, 24 * 3600 * 1000),
            taskOutcomesToday: (() => {
                const startOfDay = new Date(now).setHours(0, 0, 0, 0);
                const finishedToday = allTaskRecords().filter(t =>
                    (t.status === 'done' || t.status === 'failed') && (t.endedAt ?? 0) >= startOfDay);
                return {
                    done: finishedToday.filter(t => t.status === 'done').length,
                    failed: finishedToday.filter(t => t.status === 'failed').length,
                    topFailures: finishedToday.filter(t => t.status === 'failed')
                        .map(t => t.title.replace(/ \(retry \d+\)$/i, '')).slice(0, 3),
                    // Z4: matched-transcript token costs (headless runs only).
                    costUSD: finishedToday.reduce((sum, t) => sum + (t.costUSD ?? 0), 0)
                };
            })()
        });
    };
    const sendDailyDigest = (manual: boolean): void => {
        const text = buildDigestText();
        const hasWebhook = !!cfg().get<string>('notifyWebhookUrl', '');
        if (hasWebhook) { postForward('digest', text); }
        if (manual) {
            void vscode.window.showInformationMessage(
                hasWebhook ? `Agent Farm: digest sent.\n${text}` : `${text}\n(notifyWebhookUrl empty — shown here only)`,
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

    // ---------- Missions: dynamic multi-agent orchestration ----------
    // The engine loop lives in core/missions.ts; this block supplies the world:
    // planner calls (headless claude, resumable), delegations (ordinary
    // FarmTasks), approval/question waits (Needs You + toasts) and persistence.
    const missionStore = new MissionStore(
        path.join(context.globalStorageUri.fsPath, 'missions.json'), portableRoots);
    missionStore.load();
    // A window reload kills the in-memory loops: park those runs honestly,
    // they resume from Needs You / the Missions panel.
    for (const r of missionStore.runs) {
        if (r.status === 'running' || r.status === 'waiting-approval' || r.status === 'waiting-user') {
            r.status = 'paused';
            r.note = 'interrupted by window reload';
        }
        // transient live-state must not survive a reload
        r.now = undefined;
        r.pausePending = false;
    }
    missionStore.save();
    const missionEngines = new Map<string, MissionEngine>();
    const missionQuestions = new Map<string, { question: string; askedAt: number; resolve: (a: string | undefined) => void }>();
    const missionApprovals = new Map<string, string>(); // runId → approvalQueue id
    const missionEmitter = new vscode.EventEmitter<void>();
    context.subscriptions.push(missionEmitter);
    const missionChanged = () => {
        missionStore.save();
        missionEmitter.fire();
        needsEmitter.fire();
    };

    const missionWaits = () => {
        const waits: { runId: string; missionTitle: string; flavor: 'question' | 'interrupted'; detail: string; ts: number }[] = [];
        for (const [runId, q] of missionQuestions) {
            const run = missionStore.run(runId);
            const spec = run ? missionStore.spec(run.specId) : undefined;
            waits.push({ runId, missionTitle: spec?.title ?? runId, flavor: 'question', detail: q.question, ts: q.askedAt });
        }
        for (const run of missionStore.runs) {
            if (run.status === 'paused' && run.note === 'interrupted by window reload') {
                waits.push({
                    runId: run.id,
                    missionTitle: missionStore.spec(run.specId)?.title ?? run.id,
                    flavor: 'interrupted',
                    detail: 'the window closed mid-mission — resume to continue',
                    ts: run.startedAt
                });
            }
        }
        return waits;
    };

    // The planner is a DECISION call, not a work session: write-tools are cut
    // off mechanically (the briefing says so too) and a hard turn cap stops a
    // lead that wanders off exploring — that combination is what keeps a
    // simple mission's planning cheap and fast.
    const MISSION_PLANNER_DISALLOWED_TOOLS =
        'Bash,PowerShell,Edit,MultiEdit,Write,NotebookEdit,Task,Agent';
    const MISSION_PLANNER_MAX_TURNS = 15;
    const MISSION_PLANNER_TIMEOUT_MIN = 10;

    /** One headless planner call. The prompt goes via stdin (multi-line briefings
     *  must survive the Windows shell); --resume keeps the lead's context. */
    const missionPlannerCallOnce = (spec: MissionSpec) =>
        (prompt: string, resumeSessionId?: string): Promise<PlannerResult & { subtype?: string }> =>
            new Promise(resolve => {
                const lead = agents.find(a => a.id === spec.leadAgentId);
                const extra = cfg().get<string>('taskExtraArgs', '').trim();
                // model override rides only on planner calls; strict charset so a
                // form value can never smuggle shell syntax into the command line
                const model = spec.plannerModel && /^[\w.:-]+$/.test(spec.plannerModel)
                    ? `--model ${spec.plannerModel} ` : '';
                const command = `claude ${extra ? extra + ' ' : ''}${model}` +
                    `--disallowedTools "${MISSION_PLANNER_DISALLOWED_TOOLS}" ` +
                    `--max-turns ${MISSION_PLANNER_MAX_TURNS} ` +
                    `${resumeSessionId ? `--resume ${resumeSessionId} ` : ''}-p --output-format json`;
                let settled = false;
                const done = (r: PlannerResult & { subtype?: string }) => {
                    if (!settled) { settled = true; resolve(r); }
                };
                try {
                    const child = cp.spawn(command, {
                        cwd: lead?.dir ?? os.homedir(),
                        shell: true, windowsHide: true,
                        stdio: ['pipe', 'pipe', 'pipe']
                    });
                    let out = '', err = '';
                    const timer = setTimeout(() => {
                        // shell:true wraps claude in cmd.exe — child.kill() alone
                        // leaves the real process running (and billing) forever.
                        try {
                            if (process.platform === 'win32' && child.pid) {
                                cp.exec(`taskkill /pid ${child.pid} /T /F`);
                            } else { child.kill(); }
                        } catch { /* already gone */ }
                        done({
                            ok: false,
                            error: `planner call timed out (${MISSION_PLANNER_TIMEOUT_MIN} min) — the call was killed. ` +
                                'The lead probably wandered into doing work itself; check its latest transcript on the agent page.'
                        });
                    }, MISSION_PLANNER_TIMEOUT_MIN * 60_000);
                    child.stdout.on('data', d => { out += String(d); });
                    child.stderr.on('data', d => { err += String(d); });
                    child.on('error', e => { clearTimeout(timer); done({ ok: false, error: String(e).slice(0, 200) }); });
                    child.on('close', code => {
                        clearTimeout(timer);
                        const env = parsePlannerEnvelope(out);
                        if (!env) {
                            done({ ok: false, error: `planner exited ${code}: ${(err || out).trim().slice(0, 300)}` });
                            return;
                        }
                        done({
                            ok: !env.isError,
                            raw: env.result,
                            sessionId: env.sessionId,
                            costUSD: env.costUSD,
                            subtype: env.subtype,
                            error: env.isError ? (env.result || env.subtype || 'planner error').slice(0, 300) : undefined
                        });
                    });
                    child.stdin.write(prompt);
                    child.stdin.end();
                } catch (e) {
                    done({ ok: false, error: String(e).slice(0, 200) });
                }
            });

    /** Planner call with one built-in recovery: a lead that burns its turn cap
     *  on tools gets a single "decide NOW" nudge in the same session before the
     *  round is declared failed. */
    const runMissionPlanner = (spec: MissionSpec) => {
        const call = missionPlannerCallOnce(spec);
        return async (prompt: string, resumeSessionId?: string): Promise<PlannerResult> => {
            const first = await call(prompt, resumeSessionId);
            if (!first.ok && first.subtype === 'error_max_turns' && (first.sessionId ?? resumeSessionId)) {
                const nudge = await call(
                    'You hit the turn cap — stop using tools. Reply NOW with ONLY the JSON decision object, based on what you already know.',
                    first.sessionId ?? resumeSessionId);
                if (nudge.ok) { return nudge; }
                return { ...nudge, error: `planner hit the ${MISSION_PLANNER_MAX_TURNS}-turn cap and the retry failed — ${nudge.error ?? ''}` };
            }
            return first;
        };
    };

    /** Run one wave of delegations as ordinary FarmTasks and wait them out. */
    const missionDelegateWave = (spec: MissionSpec) =>
        (run: MissionRun, steps: MissionRun['rounds'][number]['steps']): Promise<void> =>
            new Promise(resolve => {
                for (const step of steps) {
                    const agent = agents.find(a => a.id === step.agentId)
                        ?? agents.find(a => a.name === step.agentName);
                    if (!agent) {
                        step.status = 'failed';
                        step.note = 'agent not found';
                        continue;
                    }
                    const task = taskManager.addTask(agent, `[Mission] ${step.title}`, step.prompt, 'headless');
                    task.missionId = run.id;
                    const member = spec.team.find(m => m.agentId === step.agentId)
                        ?? spec.team.find(m => m.agentName === step.agentName);
                    if (member?.model) { task.model = member.model; }
                    if (spec.workdir) { task.workDir = spec.workdir; }
                    step.taskId = task.id;
                    step.status = 'running';
                    taskManager.startTask(task);
                }
                if (!steps.some(s => s.taskId)) { resolve(); return; }
                let finished = false;
                const check = () => {
                    if (finished) { return; }
                    let allDone = true;
                    for (const step of steps) {
                        if (!step.taskId) { continue; }
                        const t = taskManager.tasks.find(x => x.id === step.taskId);
                        if (!t) { step.status = 'failed'; step.note = 'task record lost'; continue; }
                        step.costUSD = t.costUSD;
                        step.tokens = t.tokens;
                        step.outputFile = t.outputFile;
                        if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
                            step.status = t.status;
                        } else {
                            allDone = false; // queued (deferred) or running — keep waiting
                        }
                    }
                    if (allDone) {
                        finished = true;
                        sub.dispose();
                        clearInterval(poll);
                        resolve();
                    }
                };
                const sub = taskManager.onDidChange(check);
                const poll = setInterval(check, 15_000); // safety net for missed events
                check();
            });

    const missionRequestApproval = (spec: MissionSpec) =>
        (run: MissionRun, round: MissionRun['rounds'][number]): Promise<boolean> => {
            const lines = round.steps.map(s => `${s.agentName}: ${s.title}`).join(' · ');
            const { id, promise } = approvalQueue.add({
                title: `Mission "${spec.title}" — round ${round.n} (${round.steps.length} delegation(s))`,
                goal: lines,
                kind: 'approval'
            });
            missionApprovals.set(run.id, id);
            missionChanged();
            void vscode.window.showInformationMessage(
                `Agent Farm mission "${spec.title}" wants to run round ${round.n}: ${lines.slice(0, 140)}`,
                'Approve', 'Reject', 'Open Missions'
            ).then(choice => {
                if (choice === 'Approve') { approvalQueue.settle(id, true); }
                else if (choice === 'Reject') { approvalQueue.settle(id, false); }
                else if (choice === 'Open Missions') { void vscode.commands.executeCommand('agentfarm.openMissions'); }
            });
            return promise.finally(() => {
                missionApprovals.delete(run.id);
                missionChanged();
            });
        };

    const missionAskUser = (spec: MissionSpec) =>
        (run: MissionRun, question: string): Promise<string | undefined> =>
            new Promise<string | undefined>(resolve => {
                missionQuestions.set(run.id, {
                    question, askedAt: Date.now(),
                    resolve: a => {
                        missionQuestions.delete(run.id);
                        missionChanged();
                        resolve(a);
                    }
                });
                missionChanged();
                void vscode.window.showInformationMessage(
                    `Mission "${spec.title}" asks: ${question}`, 'Answer…', 'Skip'
                ).then(async choice => {
                    const pending = missionQuestions.get(run.id);
                    if (!pending) { return; } // already answered elsewhere
                    if (choice === 'Answer…') {
                        const a = await vscode.window.showInputBox({ prompt: question, ignoreFocusOut: true });
                        missionQuestions.get(run.id)?.resolve(a);
                    } else if (choice === 'Skip') {
                        missionQuestions.get(run.id)?.resolve(undefined);
                    }
                    // toast dismissed without a pick: the wait stays in Needs You
                });
            });

    const answerMissionQuestion = async (runId: string, answer?: string): Promise<void> => {
        const pending = missionQuestions.get(runId);
        if (!pending) { return; }
        const a = answer !== undefined
            ? answer
            : await vscode.window.showInputBox({ prompt: pending.question, ignoreFocusOut: true });
        missionQuestions.get(runId)?.resolve(a);
    };

    const missionTeamHints = (spec: MissionSpec) => spec.team.map(m => {
        const a = agents.find(x => x.id === m.agentId);
        let hint = '';
        try {
            hint = a?.claudeMdPath
                ? fs.readFileSync(a.claudeMdPath, 'utf8').replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 160)
                : '';
        } catch { /* unreadable identity — hint stays empty */ }
        return { name: m.agentName, role: m.role, hint };
    });

    const missionReadBody = (file: string): string => {
        try { return archivedOutputBody(fs.readFileSync(file, 'utf8')); } catch { return ''; }
    };

    const missionDepsFor = (spec: MissionSpec): MissionEngineDeps => ({
        runPlanner: runMissionPlanner(spec),
        delegateWave: missionDelegateWave(spec),
        readOutputBody: missionReadBody,
        requestApproval: missionRequestApproval(spec),
        askUser: missionAskUser(spec),
        onUpdate: () => missionChanged(),
        now: () => Date.now()
    });

    const launchMission = (spec: MissionSpec, run: MissionRun, initialMsg?: string): void => {
        const engine = new MissionEngine(spec, run, missionTeamHints(spec), missionDepsFor(spec));
        missionEngines.set(run.id, engine);
        void engine.execute(initialMsg).catch(e => {
            run.status = 'failed';
            run.note = 'engine error: ' + String(e).slice(0, 200);
            run.endedAt = Date.now();
        }).finally(() => {
            missionEngines.delete(run.id);
            missionChanged();
            const r = missionStore.run(run.id);
            if (r && (r.status === 'done' || r.status === 'failed' || r.status === 'cancelled')) {
                const line = `Mission "${spec.title}" ${r.status}` +
                    (r.result ? ` — ${r.result.verdict}: ${r.result.summary.slice(0, 200)}` : '') +
                    // a failure without a verdict MUST say why (timeouts, bad
                    // planner replies…) — a bare "failed" toast is useless
                    (!r.result && r.note ? ` — ${r.note.slice(0, 260)}` : '') +
                    ` ($${r.totalCostUSD.toFixed(2)})`;
                postForward('mission', line);
                const show = r.status === 'failed'
                    ? vscode.window.showErrorMessage.bind(vscode.window)
                    : vscode.window.showInformationMessage.bind(vscode.window);
                void show(`Agent Farm: ${line}`, 'Open Missions')
                    .then((c: string | undefined) => { if (c === 'Open Missions') { void vscode.commands.executeCommand('agentfarm.openMissions'); } });
            }
        });
    };

    const startMission = (spec: MissionSpec): MissionRun => {
        missionStore.specs.push(spec);
        const run: MissionRun = {
            id: newMissionId(), specId: spec.id, status: 'running',
            rounds: [], ledger: [], totalCostUSD: 0, startedAt: Date.now()
        };
        missionStore.runs.push(run);
        missionChanged();
        launchMission(spec, run);
        return run;
    };

    const resumeMission = (runId: string): void => {
        const run = missionStore.run(runId);
        const spec = run ? missionStore.spec(run.specId) : undefined;
        if (!run || !spec || run.status !== 'paused' || missionEngines.has(runId)) { return; }
        const resumeHead = run.note === 'interrupted by window reload'
            ? undefined // default wording
            : 'The mission was paused by the user and has been resumed.';
        run.note = undefined;
        // pause time must not eat the wall clock
        const lastActivity = run.rounds.length ? run.rounds[run.rounds.length - 1].at : run.startedAt;
        run.waitedMs = (run.waitedMs ?? 0) + Math.max(0, Date.now() - lastActivity);
        const last = run.rounds[run.rounds.length - 1];
        let initialMsg: string | undefined;
        if (last && last.action === 'delegate' && last.steps.length && !last.rejectedReason) {
            // whatever was in flight when the window died: settle from task records
            for (const step of last.steps) {
                const t = step.taskId ? taskManager.tasks.find(x => x.id === step.taskId) : undefined;
                if (t && (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled')) {
                    step.status = t.status;
                    step.costUSD = t.costUSD;
                    step.tokens = t.tokens;
                    step.outputFile = t.outputFile;
                } else if (step.status === 'running' || step.status === 'queued') {
                    step.status = 'failed';
                    step.note = 'interrupted by reload';
                    if (t) { step.outputFile = t.outputFile; }
                }
            }
            initialMsg = buildResumeMessage(run,
                last.steps.map(step => ({
                    step,
                    excerpt: step.outputFile ? outputExcerpt(missionReadBody(step.outputFile)) : ''
                })),
                remainingBudget(spec, run, Date.now()), resumeHead);
        } else if (run.rounds.length || run.plannerSessionId) {
            initialMsg = buildResumeMessage(run, [], remainingBudget(spec, run, Date.now()), resumeHead)
                + (last?.action === 'ask_user' && !last.answer
                    ? `\nYour earlier question ("${last.question}") was never answered — ask again if it still matters.`
                    : '');
        } // else: interrupted before round 1 — plain fresh start with the briefing
        launchMission(spec, run, initialMsg);
        missionChanged();
    };

    const cancelMission = (runId: string): void => {
        const run = missionStore.run(runId);
        if (!run) { return; }
        missionEngines.get(runId)?.cancel();
        const apId = missionApprovals.get(runId);
        if (apId) { approvalQueue.settle(apId, false); }
        missionQuestions.get(runId)?.resolve(undefined);
        for (const t of taskManager.tasks) {
            if (t.missionId === runId && (t.status === 'running' || t.status === 'queued')) {
                taskManager.cancelTask(t);
            }
        }
        if (!missionEngines.has(runId) &&
            run.status !== 'done' && run.status !== 'failed' && run.status !== 'cancelled') {
            run.status = 'cancelled';
            run.endedAt = Date.now();
        }
        missionChanged();
    };

    const createMission = (input: Record<string, unknown>): string | undefined => {
        const goal = String(input.goal ?? '').trim();
        if (!goal) { return 'Goal is required.'; }
        const lead = agents.find(a => a.id === String(input.leadAgentId ?? ''));
        if (!lead) { return 'Pick a lead agent.'; }
        const modelOk = (m: string) => /^[\w.:-]+$/.test(m);
        const teamIn = Array.isArray(input.team) ? input.team as { agentId?: unknown; role?: unknown; model?: unknown }[] : [];
        const team: MissionSpec['team'] = [];
        for (const t of teamIn) {
            const a = agents.find(x => x.id === String(t.agentId ?? ''));
            if (a && !team.some(m => m.agentId === a.id)) {
                const model = String(t.model ?? '').trim().slice(0, 60);
                if (model && !modelOk(model)) { return `Model "${model}" (${a.name}) has illegal characters — use a plain model id/alias.`; }
                team.push({
                    agentId: a.id, agentName: a.name,
                    role: String(t.role ?? '').trim() || undefined,
                    model: model || undefined
                });
            }
        }
        if (!team.length) { return 'Pick at least one team agent.'; }
        const plannerModel = String(input.plannerModel ?? '').trim().slice(0, 60);
        if (plannerModel && !modelOk(plannerModel)) { return `Planner model "${plannerModel}" has illegal characters — use a plain model id/alias.`; }
        const workdir = String(input.workdir ?? '').trim();
        if (workdir && !fs.existsSync(workdir)) { return `Workdir does not exist: ${workdir}`; }
        const num = (v: unknown, d: number, min: number, max: number) => {
            const n = Number(v);
            return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : d;
        };
        const limits: MissionLimits = {
            maxRounds: num(input.maxRounds, DEFAULT_MISSION_LIMITS.maxRounds, 1, 30),
            maxTasks: num(input.maxTasks, DEFAULT_MISSION_LIMITS.maxTasks, 1, 60),
            maxCostUSD: num(input.maxCostUSD, DEFAULT_MISSION_LIMITS.maxCostUSD, 0.1, 500),
            maxMinutes: num(input.maxMinutes, DEFAULT_MISSION_LIMITS.maxMinutes, 5, 24 * 60),
            maxParallel: num(input.maxParallel, DEFAULT_MISSION_LIMITS.maxParallel, 1, 6)
        };
        startMission({
            id: newMissionId(),
            title: String(input.title ?? '').trim().slice(0, 80) || goal.slice(0, 60),
            goal,
            leadAgentId: lead.id,
            leadAgentName: lead.name,
            team,
            workdir: workdir || undefined,
            plannerModel: plannerModel || undefined,
            limits,
            approvalMode: input.approvalMode === 'auto' ? 'auto' : 'each-round',
            createdAt: Date.now()
        });
        return undefined;
    };

    // Step statuses move on task events while a wave runs — mirror those into
    // the panel without a store write.
    taskManager.onDidChange(() => {
        if (missionEngines.size) { missionEmitter.fire(); }
    }, null, context.subscriptions);

    // Feature A — keep the Work Queue's agent-tracked lane LIVE: a delegated item
    // mirrors its mission/task status, so refresh the queue when any task (a
    // mission step runs AS a task too) changes state. Cheap: refreshIfOpen only
    // rebuilds when the page is actually open.
    taskManager.onDidChange(() => QueuePanel.refreshIfOpen(), null, context.subscriptions);
    missionEmitter.event(() => QueuePanel.refreshIfOpen(), null, context.subscriptions);

    // ---------- Farm Bridge: agents use the farm through request files ----------
    // The user directs an agent in chat; the agent drops <name>.request.json in
    // <globalStorage>/bridge/ and the RUNNER executes it through the same code
    // paths the UI uses. `farm.ops` self-describes the catalog, so agents (and
    // future features) discover instead of hardcoding. See core/bridge.ts.
    const bridge = new BridgeRegistry();
    const findAgent = (ref: string): AgentInfo => {
        const a = agents.find(x => x.id === normPath(ref))
            ?? agents.find(x => x.name.toLowerCase() === ref.toLowerCase());
        need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
        return a as AgentInfo;
    };
    // Duties are keyed by title inside the agent's DUTIES.md — always re-read
    // from disk so bridge edits and hand-edits never race a stale cache.
    const findDuty = (agent: AgentInfo, title: string): Duty => {
        const d = readDuties(agent.dir)?.duties.find(x => x.title === title);
        need(d, `Duty "${title}" not found on ${agent.name} — duties.list shows current ones.`);
        return d as Duty;
    };
    // One duty → one watch trigger: the SAME spec the "Automate Duty" command
    // builds, so the palette and the bridge cannot drift apart.
    const dutyTriggerSpec = (agent: AgentInfo, d: Duty): Omit<FarmTrigger, 'id'> => ({
        title: `Duty: ${d.title}`,
        type: 'watch',
        watchPath: d.watch,
        action: {
            kind: 'task', agentId: agent.id, agentName: agent.name,
            title: d.title,
            prompt: `DUTIES.md'deki "${d.title}" görevini uygula. İzlenen hedef değişti: {watch}` +
                (d.action ? ` Yapılacak iş: ${d.action}` : ''),
            mode: 'headless'
        },
        debounceSec: 10, cooldownSec: 60, maxPerHour: 6, enabled: true
    });
    bridge.register([
        {
            op: 'agents.list',
            describe: 'The farm roster: id, name, dir, active-now, session count. args: none',
            handler: () => agents.map(a => ({
                id: a.id, name: a.name, dir: a.dir,
                active: index.isAgentActive(a.id),
                sessions: index.forAgent(a.id).length
            }))
        },
        {
            op: 'tasks.list',
            describe: 'Current task queue/board rows. args: none',
            handler: () => taskManager.tasks.map(t => ({
                id: t.id, title: t.title, agent: t.agentName, status: t.status,
                mode: t.mode, createdAt: t.createdAt, costUSD: t.costUSD
            }))
        },
        {
            op: 'tasks.add',
            describe: 'Queue (and by default start) a task. args: agent (name|id), title, prompt, mode? (headless|interactive, default headless), start? (default true)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const task = taskManager.addTask(agent, argStr(args, 'title'), argStr(args, 'prompt'),
                    optStr(args, 'mode') === 'interactive' ? 'interactive' : 'headless');
                if (args.start !== false) { taskManager.startTask(task); }
                return { id: task.id, status: task.status };
            }
        },
        {
            op: 'tasks.cancel',
            describe: 'Cancel a queued/running task. args: id',
            handler: (args) => {
                const t = taskManager.tasks.find(x => x.id === argStr(args, 'id'));
                need(t, 'Task not found — tasks.list shows current ids.');
                taskManager.cancelTask(t as FarmTask);
                return { id: (t as FarmTask).id, status: (t as FarmTask).status };
            }
        },
        {
            op: 'tasks.rerun',
            describe: 'Re-run a finished task as a fresh copy (a workflow-step task resumes its chain). args: id',
            handler: (args) => {
                const t = taskManager.tasks.find(x => x.id === argStr(args, 'id'));
                need(t, 'Task not found — tasks.list shows current ids.');
                need((t as FarmTask).status !== 'queued' && (t as FarmTask).status !== 'running',
                    'Only a finished task can be re-run — it is still queued/running.');
                const copy = taskManager.retryTask(t as FarmTask);
                return copy ? { id: copy.id, status: copy.status } : { resumedWorkflow: true };
            }
        },
        {
            op: 'tasks.runNext',
            describe: 'Bump a queued task to the front of the queue and request an immediate start. args: id',
            handler: (args) => {
                const t = taskManager.tasks.find(x => x.id === argStr(args, 'id'));
                need(t, 'Task not found — tasks.list shows current ids.');
                need((t as FarmTask).status === 'queued', 'Only a queued task can be bumped.');
                taskManager.runTaskNext(t as FarmTask);
                return { id: (t as FarmTask).id, status: (t as FarmTask).status };
            }
        },
        {
            op: 'tasks.clearFinished',
            describe: 'Clear all finished (done/failed/cancelled) tasks from the board — history is archived first, output files are deleted. args: none',
            handler: () => ({ removed: taskManager.clearFinished() })
        },
        {
            op: 'schedules.list',
            describe: 'Installed schedules. args: none',
            handler: () => taskManager.schedules.map(s => ({
                id: s.id, title: s.title, agent: s.agentName, kind: s.kind,
                hour: s.hour, minute: s.minute, dow: s.dow, enabled: s.enabled, missed: s.missed,
                model: s.model ?? null, fireIf: s.fireIf ?? null
            }))
        },
        {
            op: 'schedules.add',
            describe: 'Install a schedule. args: agent (name|id), title, prompt, kind? (daily|weekly|once), hour?, minute?, dow?, onceAt?, mode?, missed? (skip|run|ask), model? (opus|sonnet|haiku — stated ON the schedule, beats the modelPolicy engine), fireIf? ({kind:folderHasFiles|fileMissing|pathChangedWithin|queueHasWork, path?, except?[], minCount?, hours?, recursive?} — no agent is woken when it fails)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const seeds = parseSeedSchedules(JSON.stringify([
                    { ...args, agentId: agent.id, agentName: agent.name }]));
                need(seeds.length, 'Invalid schedule — title and prompt are required.');
                need(!taskManager.schedules.some(s => s.title === seeds[0].title),
                    `A schedule titled "${seeds[0].title}" already exists.`);
                const model = optStr(args, 'model');
                need(!model || /^[\w.:-]+$/.test(model), 'model must be a model id/alias (e.g. opus, sonnet, haiku).');
                const fireIf = args.fireIf === undefined ? undefined : parsePrecondition(args.fireIf);
                need(args.fireIf === undefined || fireIf,
                    'fireIf.kind must be folderHasFiles | fileMissing | pathChangedWithin | queueHasWork.');
                const s = taskManager.addSchedule({ ...seeds[0], model: model || undefined, fireIf });
                return { id: s.id, title: s.title, model: s.model ?? null, fireIf: s.fireIf ?? null };
            }
        },
        {
            op: 'schedules.delete',
            describe: 'Remove a schedule. args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const s = taskManager.schedules.find(x => x.id === ref || x.title === ref);
                need(s, 'Schedule not found — schedules.list shows current ones.');
                taskManager.deleteSchedule(s as FarmSchedule);
                return { deleted: (s as FarmSchedule).title };
            }
        },
        {
            op: 'schedules.toggle',
            describe: 'Enable/disable a schedule. args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const s = taskManager.schedules.find(x => x.id === ref || x.title === ref);
                need(s, 'Schedule not found — schedules.list shows current ones.');
                taskManager.toggleSchedule(s as FarmSchedule);
                return { title: (s as FarmSchedule).title, enabled: (s as FarmSchedule).enabled };
            }
        },
        {
            op: 'workflows.list',
            describe: 'Defined workflows. args: none',
            handler: () => taskManager.workflows.map(w => ({
                id: w.id, title: w.title, steps: w.steps.length
            }))
        },
        {
            op: 'workflows.run',
            describe: 'Run a workflow now. args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const w = taskManager.workflows.find(x => x.id === ref || x.title === ref);
                need(w, 'Workflow not found — workflows.list shows current ones.');
                taskManager.runWorkflow(w as FarmWorkflow);
                return { started: (w as FarmWorkflow).title };
            }
        },
        {
            op: 'missions.list',
            describe: 'Mission runs, newest first. args: none',
            handler: () => missionStore.runs.slice().reverse().map(r => {
                const sp = missionStore.spec(r.specId);
                return {
                    id: r.id, title: sp?.title ?? r.specId, status: r.status,
                    verdict: r.result?.verdict, rounds: r.rounds.length,
                    costUSD: Math.round(r.totalCostUSD * 100) / 100, startedAt: r.startedAt
                };
            })
        },
        {
            op: 'missions.start',
            describe: 'Start a mission. args: goal, lead (name|id), team ([{agent, role?, model?}]), title?, workdir?, plannerModel?, approvalMode? (each-round|auto), maxRounds?, maxTasks?, maxCostUSD?, maxMinutes?, maxParallel?',
            handler: (args) => {
                const lead = findAgent(argStr(args, 'lead'));
                const teamIn = Array.isArray(args.team) ? args.team as Record<string, unknown>[] : [];
                need(teamIn.length, 'team is required: [{ "agent": "<name|id>", "role"?: "...", "model"?: "..." }]');
                const team = teamIn.map(t => ({
                    agentId: findAgent(String(t.agent ?? '')).id, role: t.role, model: t.model
                }));
                const err = createMission({ ...args, leadAgentId: lead.id, team });
                need(!err, err ?? '');
                const run = missionStore.runs[missionStore.runs.length - 1];
                return { runId: run.id, title: missionStore.spec(run.specId)?.title };
            }
        },
        {
            op: 'missions.status',
            describe: 'One run in detail (rounds, steps, budget, pending waits). args: id',
            handler: (args) => {
                const run = missionStore.run(argStr(args, 'id'));
                need(run, 'Run not found — missions.list shows current ids.');
                const r = run as MissionRun;
                const sp = missionStore.spec(r.specId);
                return {
                    id: r.id, title: sp?.title, status: r.status, verdict: r.result?.verdict,
                    summary: r.result?.summary, costUSD: r.totalCostUSD,
                    // a waiting run says WHAT it waits for, so an agent knows to
                    // call missions.answer / missions.approve
                    pendingQuestion: missionQuestions.get(r.id)?.question ?? null,
                    awaitingApproval: missionApprovals.has(r.id),
                    rounds: r.rounds.map(rd => ({
                        n: rd.n, action: rd.action, thought: rd.thought?.slice(0, 200),
                        steps: rd.steps.map(s => ({ agent: s.agentName, title: s.title, status: s.status }))
                    }))
                };
            }
        },
        {
            op: 'insights.list',
            describe: 'Current health & optimization findings. args: none',
            handler: () => insights.map(i => ({
                severity: i.severity, category: i.category, agent: i.agentName, message: i.message
            }))
        },
        {
            op: 'triggers.list',
            describe: 'Installed triggers (watch/hook/webhook). args: none',
            handler: () => taskManager.triggers.map(t => ({
                id: t.id, title: t.title, type: t.type, enabled: t.enabled,
                fireIf: t.fireIf ?? null,
                model: t.action.kind === 'workflow' ? null : (t.action.model ?? null),
                fireCount: t.fireCount ?? 0, skipCount: t.skipCount ?? 0,
                lastSkipReason: t.lastSkipReason ?? null
            }))
        },
        {
            op: 'triggers.toggle',
            describe: 'Enable/disable a trigger. args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const t = taskManager.triggers.find(x => x.id === ref || x.title === ref);
                need(t, 'Trigger not found — triggers.list shows current ones.');
                taskManager.toggleTrigger(t as FarmTrigger);
                return { title: (t as FarmTrigger).title, enabled: (t as FarmTrigger).enabled };
            }
        },
        {
            op: 'triggers.fire',
            describe: 'Fire a trigger now (manual test run of its action). args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const t = taskManager.triggers.find(x => x.id === ref || x.title === ref);
                need(t, 'Trigger not found — triggers.list shows current ones.');
                triggerManager.fire(t as FarmTrigger, 'manual');
                return { fired: (t as FarmTrigger).title };
            }
        },
        {
            op: 'automations.status',
            describe: 'The farm-wide automation gate: master switch, pause-until, quiet hours, plus each automation\'s fired/skipped counts and what the gate would decide right now. args: windowDays? (rollup window, default 7)',
            handler: (args) => {
                const days = typeof args.windowDays === 'number' && args.windowDays > 0
                    ? Math.floor(args.windowDays) : 7;
                const now = new Date();
                const gate = taskManager.automationGate(now);
                const roll = rollupAutomationLog(taskManager.automationLog,
                    { now: now.getTime(), windowMs: days * 24 * 3600_000 });
                const row = (kind: string, id: string, title: string, enabled: boolean,
                    pre: Precondition | undefined) => {
                    const r = roll.get(id);
                    const v = taskManager.checkPrecondition(pre);
                    return {
                        kind, id, title, enabled,
                        fireIf: describePrecondition(pre) || null,
                        wouldFireNow: enabled && !gate && v.ok,
                        preconditionNow: v.detail,
                        fired: r?.fired ?? 0, skipped: r?.skipped ?? 0,
                        skipRate: r ? Math.round(r.skipRate * 100) : 0
                    };
                };
                return {
                    gate: gate ? { blocked: true, kind: gate.kind, reason: gate.reason, until: gate.until ?? null }
                        : { blocked: false },
                    state: taskManager.automation,
                    windowDays: days,
                    schedules: taskManager.schedules.map(s =>
                        ({ ...row('schedule', s.id, s.title, s.enabled, s.fireIf), agent: s.agentName, model: s.model ?? null })),
                    triggers: taskManager.triggers.map(t => row('trigger', t.id, t.title, t.enabled, t.fireIf))
                };
            }
        },
        {
            op: 'automations.pause',
            describe: 'Master switch OFF — no schedule or trigger fires. args: minutes? (temporary pause; omit for indefinite), reason? (shown in the UI so a forgotten pause is explainable)',
            handler: (args) => {
                const mins = typeof args.minutes === 'number' && args.minutes > 0 ? Math.floor(args.minutes) : 0;
                const reason = optStr(args, 'reason') || undefined;
                const state = mins
                    ? taskManager.setAutomationState({ paused: false, pausedUntil: Date.now() + mins * 60_000, pauseReason: reason })
                    : taskManager.setAutomationState({ paused: true, pausedUntil: undefined, pauseReason: reason });
                TasksPanel.refreshIfOpen();
                LivingPanel.refreshIfOpen();
                return { paused: !!state.paused, pausedUntil: state.pausedUntil ?? null, reason: state.pauseReason ?? null };
            }
        },
        {
            op: 'automations.resume',
            describe: 'Master switch ON — schedules and triggers fire again (clears any pause-until too). args: none',
            handler: () => {
                const state = taskManager.setAutomationState({ paused: false, pausedUntil: undefined, pauseReason: undefined });
                TasksPanel.refreshIfOpen();
                LivingPanel.refreshIfOpen();
                return { paused: !!state.paused };
            }
        },
        {
            op: 'automations.quietHours',
            describe: 'Set or clear the nightly quiet window; inside it nothing wakes on its own and a due schedule is DEFERRED to the end of the window (not dropped). args: from ("HH:MM"), to ("HH:MM") — pass from:"" to turn quiet hours off',
            handler: (args) => {
                const from = optStr(args, 'from');
                const to = optStr(args, 'to');
                if (!from) {
                    const s = taskManager.setAutomationState({ quietFrom: undefined, quietTo: undefined });
                    TasksPanel.refreshIfOpen();
                    LivingPanel.refreshIfOpen();
                    return { quietHours: null, state: s };
                }
                const ok = (v: string) => /^\d{1,2}:\d{2}$/.test(v);
                need(ok(from) && ok(to), 'from/to must be "HH:MM" (e.g. 23:00 and 07:00).');
                const s = taskManager.setAutomationState({ quietFrom: from, quietTo: to });
                TasksPanel.refreshIfOpen();
                LivingPanel.refreshIfOpen();
                return { quietHours: `${s.quietFrom}–${s.quietTo}` };
            }
        },
        {
            op: 'automations.bulk',
            describe: 'Enable/disable MANY automations at once — the thing that used to force one-by-one clicking. args: set (on|off), kind? (schedule|trigger|both, default both), titles? (array of ids/titles; omit = every automation of that kind), tag? (substring match on the title)',
            handler: (args) => {
                const set = argStr(args, 'set');
                need(set === 'on' || set === 'off', 'set must be on | off.');
                const enabled = set === 'on';
                const kind = optStr(args, 'kind') || 'both';
                need(['schedule', 'trigger', 'both'].includes(kind), 'kind must be schedule | trigger | both.');
                const refs = Array.isArray(args.titles)
                    ? new Set(args.titles.map(x => String(x))) : undefined;
                const tag = optStr(args, 'tag').toLowerCase();
                const match = (id: string, title: string) =>
                    (!refs || refs.has(id) || refs.has(title)) &&
                    (!tag || title.toLowerCase().includes(tag));
                const changed: string[] = [];
                if (kind !== 'trigger') {
                    for (const s of taskManager.schedules) {
                        if (!match(s.id, s.title) || s.enabled === enabled) { continue; }
                        s.enabled = enabled;
                        changed.push(`schedule:${s.title}`);
                    }
                }
                if (kind !== 'schedule') {
                    for (const t of taskManager.triggers) {
                        if (!match(t.id, t.title) || t.enabled === enabled) { continue; }
                        t.enabled = enabled;
                        changed.push(`trigger:${t.title}`);
                    }
                }
                taskManager.persist();
                TasksPanel.refreshIfOpen();
                LivingPanel.refreshIfOpen();
                return { set, changed, count: changed.length };
            }
        },
        {
            op: 'schedules.runNow',
            describe: 'Queue a schedule\'s task right now (out of schedule). args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const s = taskManager.schedules.find(x => x.id === ref || x.title === ref);
                need(s, 'Schedule not found — schedules.list shows current ones.');
                taskManager.runScheduleNow(s as FarmSchedule);
                return { started: (s as FarmSchedule).title };
            }
        },
        {
            op: 'templates.list',
            describe: 'Saved task templates. args: none',
            handler: () => taskManager.templates.map(t => ({
                id: t.id, title: t.title, agent: t.agentName ?? null, mode: t.mode
            }))
        },
        {
            op: 'templates.run',
            describe: 'Run a template as a task now. args: id or title, agent? (name|id — required when the template is not bound to an agent)',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const tpl = taskManager.templates.find(x => x.id === ref || x.title === ref);
                need(tpl, 'Template not found — templates.list shows current ones.');
                const t = tpl as FarmTemplate;
                const agent = t.agentId
                    ? agents.find(a => a.id === t.agentId)
                    : findAgent(argStr(args, 'agent'));
                need(agent, 'Agent not found for this template.');
                const task = taskManager.addTask(agent as AgentInfo, t.title, t.prompt, t.mode);
                taskManager.startTask(task);
                return { id: task.id, status: task.status };
            }
        },
        {
            op: 'usage.plan',
            describe: 'Your Claude SUBSCRIPTION rate-limit state as Anthropic reports it — the same figures /usage prints: session (5h) and weekly utilization % with reset times. This is the real quota, not the transcript-derived cost figures the rest of the farm reports. Also returns `beat` — how often the farm is re-reading it (ms) and whether an agent is mid-turn, i.e. how stale a cached answer can be — and `rateLimitedUntil` (ISO, or null): the endpoint itself pushed back and no automatic read happens until then, so a cached answer is deliberately stale rather than merely old. args: force? (default false — served from the dashboard card\'s cache; force skips the cache but NOT a backoff, and not the 30s floor, so a loop of forced calls cannot become a request storm: while `rateLimitedUntil` is set you get the cached snapshot whatever you pass)',
            handler: async (args) => {
                // ‼️ An agent forcing is not a person clicking ⟳. Only a human
                // may spend a request through a backoff (see PlanUsageService.read).
                const snap = args.force === true
                    ? await planUsage.readOnEdge()
                    : await planUsage.get();
                const until = planUsage.rateLimitedUntil();
                return {
                    state: snap.state, plan: snap.plan, fetchedAt: snap.fetchedAt,
                    note: snap.note,
                    beat: planBeat(),
                    // ‼️ an agent must be able to tell "nothing has changed" from
                    // "we are not allowed to look" — the two read identically
                    // from a cached snapshot alone
                    rateLimitedUntil: until > Date.now() ? new Date(until).toISOString() : null,
                    bars: snap.bars.map(b => ({
                        id: b.id, title: b.title, percent: b.percent,
                        resetsAt: b.resetsAt ? new Date(b.resetsAt).toISOString() : null
                    }))
                };
            }
        },
        {
            op: 'sessions.recent',
            describe: 'Most recent sessions farm-wide. args: origin? ("user" = sessions a person started interactively — what the Sessions tables show by default; "auto" = automation runs (schedule/trigger/task/mission, any `claude -p`); omit or "all" = both), limit? (default 10)',
            handler: (args) => {
                const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 10;
                const origin = optStr(args, 'origin').toLowerCase();
                return index.all()
                    .filter(s => origin !== 'user' && origin !== 'auto' ? true : sessionOrigin(s) === origin)
                    .slice().sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime))
                    .slice(0, limit)
                    .map(s => ({
                        agent: s.agentName, title: s.title, lastTs: s.lastTs,
                        origin: sessionOrigin(s),
                        turns: s.userTurns, cost: Math.round(s.cost * 100) / 100
                    }));
            }
        },
        {
            op: 'sessions.start',
            describe: 'Start an INTERACTIVE claude session in an agent\'s folder — the same launch the Start Session… picker performs, with the same flags. Not a headless run: it opens a session a human then talks in (use tasks.add for work that should run by itself). args: agent (name|id), surface? (terminal = a claude terminal, the default | console = hosted in the Console panel), model? (alias or id), effort? (low|medium|high|xhigh|max), permissionMode? (plan|acceptEdits|auto|manual|dontAsk|bypassPermissions), name? (session display name), prompt? (first message), resume? (session id), continue? (true = latest session in that folder), project? (id or name — the session is told about it and filed under it; omit to inherit the window\'s active project, "" for none). Unset fields fall back to agentFarm.launchDefaults. surface=console ignores resume/continue — console.start and resumeInConsole own those.',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const o: LaunchOptions = {
                    model: optStr(args, 'model'),
                    effort: optStr(args, 'effort'),
                    permissionMode: optStr(args, 'permissionMode'),
                    name: optStr(args, 'name'),
                    prompt: optStr(args, 'prompt'),
                    resume: optStr(args, 'resume'),
                    continueLast: args.continue === true
                };
                const errors = validateLaunch(withDefaults(o, launchDefaults()));
                need(!errors.length, errors.join(' · '));
                const surface = optStr(args, 'surface') || 'terminal';
                need(surface === 'terminal' || surface === 'console',
                    `surface must be "terminal" or "console", not "${surface}"`);
                // ‼️ Per-SESSION, never a write to the window's active project:
                // an agent starting work under project X must not move the
                // project the person in front of the window is working in.
                const project = resolveLaunchProject(args.project);
                if (surface === 'console') {
                    startConsoleSession(agent, o, project);
                    return { agent: agent.name, cwd: agent.dir, surface };
                }
                const command = startClaudeSession(agent, o, undefined, undefined, project);
                need(command, 'launch rejected — see the warning in the window');
                return { agent: agent.name, cwd: agent.dir, surface, command };
            }
        },
        {
            op: 'sessions.rename',
            describe: 'Give a session the user\'s own name — the same rename the side panel, the Console rows and the session page do, on the same store. An empty name restores the automatic title. args: sessionId, name',
            handler: async (args) => {
                const sessionId = argStr(args, 'sessionId');
                const title = await applySessionTitle(sessionId, optStr(args, 'name'));
                return { sessionId, title: title || null };
            }
        },
        {
            op: 'sessions.pin',
            describe: 'Put a session on the user\'s shelf, or take it off. Pinned sessions are listed first on every sessions surface and are never cut by a row limit. args: sessionId, pinned? (default: toggle)',
            handler: async (args) => {
                const sessionId = argStr(args, 'sessionId');
                const marks = sessionMarks();
                const want = typeof args.pinned === 'boolean' ? args.pinned : undefined;
                const next = togglePin(marks, sessionId, want);
                await saveMarks(next);
                return { sessionId, pinned: isPinned(next, sessionId) };
            }
        },
        {
            op: 'sessions.tag',
            describe: 'Set the user\'s labels on a session (replaces them; empty clears). Labels are searched by the sessions tables\' text filter. args: sessionId, tags (array or comma-separated string)',
            handler: async (args) => {
                const sessionId = argStr(args, 'sessionId');
                const raw = Array.isArray(args.tags) ? args.tags.join(', ') : optStr(args, 'tags');
                const next = setTags(sessionMarks(), sessionId, parseTags(raw));
                await saveMarks(next);
                return { sessionId, tags: tagsOf(next, sessionId) };
            }
        },
        {
            op: 'sessions.shelf',
            describe: 'The pinned sessions (the user\'s shelf) with their labels — what they keep coming back to. args: none',
            handler: () => index.pinned().map(s => ({
                sessionId: s.sessionId, title: s.title, agent: s.agentName ?? null,
                tags: s.tags ?? [], lastTs: s.lastTs, cwd: s.cwd ?? null,
                cost: Math.round(s.cost * 100) / 100
            }))
        },
        {
            op: 'sessions.interrupt',
            describe: 'Stop what a live session is doing by typing Esc into its terminal — the turn ends, the session and its context survive. Integrated terminals only: a session running in an external OS window is reported back as such (nobody can type into it), and headless task/mission runs are stopped with tasks.stop / missions.cancel instead. args: sessionId',
            handler: async (args) => {
                const sessionId = argStr(args, 'sessionId');
                const openTerms = vscode.window.terminals;
                const records: TermRecord[] = termBindings.map(b => ({
                    title: b.title, sessionId: b.sessionId,
                    hasTerminal: !!b.term && openTerms.includes(b.term),
                    terminalIndex: b.term ? openTerms.indexOf(b.term) : undefined
                }));
                const agentName = live.sessions().find(s => s.sessionId === sessionId)?.agentName
                    ?? index.all().find(s => s.sessionId === sessionId)?.agentName;
                const target = resolveInterrupt({
                    sessionId, agentName, bindings: records, terminalNames: openTerms.map(t => t.name)
                });
                if (target.kind !== 'integrated') {
                    return { sessionId, interrupted: false, reason: target.how };
                }
                const term = openTerms[target.terminalIndex];
                term.show();
                term.sendText(INTERRUPT_KEY, false);
                return { sessionId, interrupted: true, terminal: term.name, how: target.how };
            }
        },
        {
            op: 'sessions.live',
            describe: 'The sessions the live monitor is tracking right now — what the Live Timeline shows: status, current tool, counters, the transcript\'s cost/tokens/turns, and whether a CLI process still owns each one (`alive`: false = it is over, its hooks just never said so; null = the CLI registry is unreadable, so nothing can be claimed). args: none',
            handler: () => {
                const rows = new Map(index.all().map(r => [r.sessionId, r]));
                const owners = readCliSessions(claudeDir());
                const known = fs.existsSync(sessionsDir(claudeDir()));
                return live.sessions().map(s => {
                    const row = rows.get(s.sessionId);
                    const owner = ownerOf(owners, s.sessionId);
                    return {
                        sessionId: s.sessionId, label: live.labelOf(s),
                        agent: s.agentName ?? null, source: s.source ?? null,
                        status: s.status, tool: s.currentTool ?? null,
                        startedAt: s.startedAt, lastEventTs: s.lastEventTs,
                        prompts: s.prompts, toolCalls: s.toolCalls,
                        compactions: s.compactions, subagents: s.subagentStops,
                        cwd: s.cwd ?? null, title: row?.title ?? null,
                        cost: row ? Math.round(row.cost * 100) / 100 : 0,
                        tokens: row ? totalTokens(row.usage) : 0,
                        turns: row?.userTurns ?? 0,
                        alive: s.source ? null : (known ? !!owner : null),
                        pid: owner?.pid ?? null
                    };
                });
            }
        },
        {
            op: 'sessions.end',
            describe: 'End a live session — not its turn (that is sessions.interrupt) but the session: the claude process that owns it is stopped, and it leaves the Live Timeline. A Console-hosted session is closed through the Console instead. The transcript stays on disk and can be resumed. Asks the user to confirm first. args: sessionId',
            handler: async (args) => {
                const sessionId = argStr(args, 'sessionId');
                const before = live.sessions().some(s => s.sessionId === sessionId);
                await endLiveSession(sessionId);
                return { sessionId, tracked: before, ended: !live.sessions().some(s => s.sessionId === sessionId) };
            }
        },
        {
            op: 'sessions.dismiss',
            describe: 'Take a session off the Live Timeline WHOLE — its card and its swim-lane row, in every range — without touching the session itself: the way to clear what a claude that died without a SessionEnd hook left behind. It comes back if it reports another event. args: sessionId, or gone:true to clear every tracked session whose process the OS no longer knows',
            handler: (args) => {
                if (args.gone === true) {
                    if (!fs.existsSync(sessionsDir(claudeDir()))) {
                        return { cleared: 0, reason: 'the CLI session registry is unreadable — nothing can be proven finished' };
                    }
                    const owned = new Set(readCliSessions(claudeDir()).map(o => o.sessionId));
                    const dead = live.sessions().filter(s => !s.source && !owned.has(s.sessionId) &&
                        Date.now() - s.startedAt > 60_000);
                    for (const s of dead) { live.dismiss(s.sessionId, 'cleared (no live process)', true); }
                    return { cleared: dead.length, sessions: dead.map(s => s.sessionId) };
                }
                const sessionId = argStr(args, 'sessionId');
                return { sessionId, cleared: live.dismiss(sessionId, 'cleared in Agent Farm', true) };
            }
        },
        {
            op: 'console.start',
            describe: 'Open a Console session — a claude process this VS Code window HOSTS, not a terminal it launched: it stays alive between turns, streams its events into the panel, and can be interrupted and re-permissioned live. args: agent (name|id), prompt? (first message), model?, effort?, permissionMode?, resume? (claude session id to continue), project? (id or name — the session is told about it and filed under it; omit to inherit the window\'s active project, "" for none). Returns the console id to talk to.',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const d = launchDefaults();
                const resume = optStr(args, 'resume') || undefined;
                // a resumed conversation brings its own totals with it, so the
                // figures an agent reads back are the session's, not this
                // process's (see CarriedTotals)
                const past = resume ? index.all().find(s => s.sessionId === resume) : undefined;
                // ‼️ The project is per-SESSION here, never a write to the
                // window's active project: a background agent starting a session
                // under project X must not silently move the project the person
                // in front of the window is working in.
                const projectId = resolveLaunchProject(args.project);
                const id = consoleHost.start({
                    agentId: agent.id, agentName: agent.name, cwd: agent.dir,
                    model: optStr(args, 'model') || d.model,
                    effort: optStr(args, 'effort') || d.effort,
                    permissionMode: optStr(args, 'permissionMode') || d.permissionMode,
                    resume,
                    carried: past ? carriedTotals(past) : undefined,
                    ...(projectId !== undefined ? { projectId } : {}),
                    firstPrompt: optStr(args, 'prompt') || undefined
                });
                ConsolePanel.refreshIfOpen();
                return {
                    id, agent: agent.name, cwd: agent.dir,
                    project: consoleHost.get(id)?.projectId
                        ? (projectStore.get(consoleHost.get(id)!.projectId!)?.name ?? null) : null
                };
            }
        },
        {
            op: 'console.send',
            describe: 'Say something in a hosted Console session. While a turn is running this goes INTO that turn — the CLI delivers it at the turn\'s next step, the same steering a terminal does — so it can still redirect work in progress. args: id (console id from console.start), text, hold? (default false — true parks it instead: it waits, editable via console.queue, and is handed over when the turn ends), attach? (array of absolute paths to hang on the message: an image — png/jpg/gif/webp — is embedded in the message so the model can SEE it, anything else including a folder is handed over as a path for the agent to open with Read. Limits: 5 MB per image, 20 MB and 20 files per message; over them the send is refused, never shrunk. A message with attachments cannot be held.)',
            handler: (args) => {
                const id = argStr(args, 'id');
                const paths = Array.isArray(args.attach) ? args.attach as unknown[] : [];
                const attach = paths
                    .filter((p): p is string => typeof p === 'string')
                    .map(describeAttachment)
                    .filter((a): a is NonNullable<typeof a> => !!a);
                const missing = paths.length - attach.length;
                const r = consoleHost.send(id, argStr(args, 'text'), args.hold === true, attach);
                need(r, 'no such live console session (console.sessions lists them)');
                // A refusal is an answer, not a success with a note.
                if (r!.refused) { throw new Error(r!.refused); }
                ConsolePanel.refreshIfOpen();
                return {
                    id, held: r!.queued, deliveredInto: r!.queued ? null : 'the running turn',
                    attached: attach.map(a => ({ name: a.name, kind: a.kind })),
                    ...(missing ? { skipped: `${missing} path(s) did not exist` } : {})
                };
            }
        },
        {
            op: 'console.queue',
            describe: 'The messages HELD back in a Console session (console.send with hold:true) — read them, or act on one before it is ever said. args: id, action? (list | edit | drop | send | clear, default list), index? (0-based, required for edit/drop/send), text? (the new wording, for edit). "send" stops holding it and says it into the running turn.',
            handler: (args) => {
                const id = argStr(args, 'id');
                const s = consoleHost.get(id);
                need(s, 'no such live console session (console.sessions lists them)');
                const action = (optStr(args, 'action') || 'list').toLowerCase();
                const index = typeof args.index === 'number' ? Math.floor(args.index) : -1;
                const needsIndex = ['edit', 'drop', 'send'].indexOf(action) >= 0;
                need(!needsIndex || (index >= 0 && index < s!.queued.length),
                    `index is required for "${action}" and must be 0..${Math.max(0, s!.queued.length - 1)}`);
                if (action === 'edit') {
                    need(consoleHost.editQueued(id, index, argStr(args, 'text')), 'nothing changed');
                } else if (action === 'drop') {
                    consoleHost.takeQueued(id, index);
                } else if (action === 'send') {
                    need(consoleHost.releaseQueued(id, index), 'that message could not be sent');
                } else if (action === 'clear') {
                    consoleHost.clearQueue(id);
                } else {
                    need(action === 'list', `unknown action "${action}" — list | edit | drop | send | clear`);
                }
                ConsolePanel.refreshIfOpen();
                return { id, action, held: consoleHost.get(id)?.queued ?? [] };
            }
        },
        {
            op: 'console.sessions',
            describe: 'The Console sessions this window hosts: status, cost so far, turns, held messages (console.queue reads them), model, effort and permission mode as they were ASKED for (empty = nothing was overridden), what is REALLY in force (applied: the CLI\'s own get_settings answer — model, and effort null on a model with no effort levels), what the RUNNING turn is thinking with (turnModel/turnEffort, taken from applied when the turn began — a switch applies from the next turn, so these can differ from model/effort), the turn that just finished (lastTurn: ms/tokens/cost/outcome/model/effort — null while a turn runs), whatever the session is WAITING ON YOU for (asking: a question that has parked its turn — console.answer settles it) and the last few messages. args: id? (one session, with more of its transcript), messages? (how many messages to include, default 0)',
            handler: (args) => {
                const want = optStr(args, 'id');
                const take = typeof args.messages === 'number' ? Math.max(0, Math.floor(args.messages)) : 0;
                const rows = consoleHost.list().filter(s => !want || s.id === want);
                return rows.map(s => ({
                    id: s.id, agent: s.agentName, sessionId: s.sessionId ?? null,
                    status: s.status, model: s.model ?? null, effort: s.effort ?? null,
                    // ‼️ …and what the CLI says is REALLY in force, which is the
                    // only one of the two that survives "the user chose nothing"
                    applied: s.applied
                        ? { model: s.applied.model, effort: s.applied.effort || null }
                        : null,
                    permissionMode: s.permissionMode,
                    cost: s.costUSD, turns: s.turns, held: s.queued.length,
                    // the whole conversation's tokens — a resumed session
                    // carries what it spent before this window (CarriedTotals)
                    tokens: s.tokens,
                    // …and what the turn running right now has spent of them,
                    // and what it is spending it ON (see turnModel)
                    turnTokens: s.turnTokensAt !== undefined ? Math.max(0, s.tokens - s.turnTokensAt) : 0,
                    turnModel: s.turnModel ?? null, turnEffort: s.turnEffort ?? null,
                    // …and, once the ball is back with the user, what the turn
                    // that just ended really cost (the CLI's own figure)
                    lastTurn: s.lastTurn ?? null,
                    contextTokens: s.contextTokens ?? null,
                    pendingPermission: s.pendingPermission?.detail ?? null,
                    // ‼️ The turn is OPEN and standing still until this is
                    // answered — `status` alone still says "working", which is
                    // true and useless. `kind` says who may settle it:
                    // a question → console.answer; a permission → the user.
                    asking: s.pendingAsk
                        ? {
                            kind: s.pendingAsk.questions.length ? 'question' : 'permission',
                            tool: s.pendingAsk.tool,
                            questions: s.pendingAsk.questions,
                            detail: s.pendingAsk.detail,
                            waitingSince: s.pendingAsk.ts
                        }
                        : null,
                    exitReason: s.exitReason ?? null,
                    messages: take
                        ? s.messages.slice(-take).map(m => ({
                            role: m.role, text: m.text ?? null,
                            tool: m.tool ? `${m.tool.name} ${m.tool.detail}` : null,
                            isError: m.isError ?? false, ts: m.ts
                        }))
                        : undefined
                }));
            }
        },
        {
            op: 'console.interrupt',
            describe: 'Stop the turn a hosted session is running. The session and its context survive — this is the CLI\'s own interrupt over the control channel, not a killed process. args: id',
            handler: (args) => {
                const id = argStr(args, 'id');
                const ok = consoleHost.interrupt(id);
                need(ok, 'no such live console session');
                ConsolePanel.refreshIfOpen();
                return { id, interrupted: true };
            }
        },
        {
            op: 'console.setModel',
            describe: 'Switch the model a hosted session answers with, mid-conversation — the same thing /model does in a terminal. It applies from the next turn; the session, its context and its transcript are untouched. args: id, model (e.g. claude-opus-5, sonnet, haiku)',
            handler: (args) => {
                const id = argStr(args, 'id');
                const model = argStr(args, 'model');
                need(!!model, 'model is required');
                need(consoleHost.setModel(id, model), 'no such live console session');
                ConsolePanel.refreshIfOpen();
                return { id, model, applied: 'from the next turn' };
            }
        },
        {
            op: 'console.setEffort',
            describe: 'Switch how hard a hosted session thinks, mid-conversation — the same thing /effort does in a terminal (low | medium | high | xhigh | max; empty = back to the CLI default). It applies from the next turn. A model with no effort levels accepts it and it means nothing. args: id, effort',
            handler: (args) => {
                const id = argStr(args, 'id');
                const effort = argStr(args, 'effort');
                need(!effort || EFFORT_CHOICES.some(c => c.id === effort),
                    `unknown effort "${effort}" — one of: ${EFFORT_CHOICES.filter(c => c.id).map(c => c.id).join(', ')}`);
                need(consoleHost.setEffort(id, effort), 'no such live console session');
                ConsolePanel.refreshIfOpen();
                return { id, effort, applied: 'from the next turn' };
            }
        },
        {
            op: 'console.answer',
            /*
             * ‼️ QUESTIONS ONLY — a tool APPROVAL is deliberately not on the
             * bridge, the same call the general Needs-You queue makes: deciding
             * that a tool may touch the machine is the user's, and an op that
             * could grant it would put an agent in charge of its own permissions.
             * A question the agent asked its user is the opposite case, and it
             * is the same op `missions.answer` already is.
             */
            describe: 'Answer the question a hosted Console session parked its turn on (AskUserQuestion) — the turn is still open and carries on with the answer. console.sessions reports it as `asking`. args: id, answers? ({ "<question text>": "<option label>" | ["label","label"] }), response? (free text — "neither, do this instead"), skip? (true answers nothing and lets the turn go on). Tool PERMISSION requests are not answerable here: they are the user\'s own call, in the panel.',
            handler: (args) => {
                const id = argStr(args, 'id');
                const s = consoleHost.get(id);
                need(s, 'no such live console session (console.sessions lists them)');
                const ask = s!.pendingAsk;
                need(ask, 'that session is not waiting on an answer right now');
                need(ask!.questions.length,
                    `${ask!.tool} is asking for PERMISSION, not for an answer — that decision is the user's, in the Console panel`);
                if (args.skip === true) {
                    need(consoleHost.answer(id, { kind: 'deny', message: 'Skipped.' }), 'nothing was answered');
                    ConsolePanel.refreshIfOpen();
                    return { id, skipped: true };
                }
                const raw = (args.answers && typeof args.answers === 'object' && !Array.isArray(args.answers))
                    ? args.answers as Record<string, unknown> : {};
                const answers: Record<string, string | string[]> = {};
                for (const [q, v] of Object.entries(raw)) {
                    if (typeof v === 'string' && v) { answers[q] = v; }
                    else if (Array.isArray(v)) {
                        const list = v.filter(x => typeof x === 'string' && x) as string[];
                        if (list.length) { answers[q] = list; }
                    }
                }
                const response = argStr(args, 'response');
                need(Object.keys(answers).length || response,
                    'say something: answers (keyed by the question text) or response');
                need(consoleHost.answer(id, { kind: 'answer', answers, response }), 'nothing was answered');
                ConsolePanel.refreshIfOpen();
                return { id, answers, response: response || undefined };
            }
        },
        {
            op: 'console.permissionMode',
            describe: 'Change a hosted session\'s standing permission RULE, live and mid-conversation (plan | acceptEdits | auto | manual | dontAsk | bypassPermissions) — how much it may do without stopping to ask at all. For a tool it HAS stopped to ask about, the one-off decision is the user\'s, in the Console panel. args: id, mode, retry? (default false — true also tells the agent to try a refused action again)',
            handler: (args) => {
                const id = argStr(args, 'id');
                const mode = argStr(args, 'mode');
                need(PERMISSION_CHOICES.some(c => c.id === mode),
                    `unknown permission mode "${mode}" — one of: ${PERMISSION_CHOICES.filter(c => c.id).map(c => c.id).join(', ')}`);
                const ok = consoleHost.setPermissionMode(id, mode);
                need(ok, 'no such live console session');
                if (args.retry === true) {
                    consoleHost.send(id, 'Permission granted — please retry the action you were refused.');
                }
                ConsolePanel.refreshIfOpen();
                return { id, mode };
            }
        },
        {
            op: 'console.close',
            describe: 'End a hosted Console session (its transcript stays on disk and stays resumable). args: id, forget? (true also drops it from the Console list)',
            handler: (args) => {
                const id = argStr(args, 'id');
                if (args.forget === true) { consoleHost.forget(id); } else { consoleHost.close(id); }
                ConsolePanel.refreshIfOpen();
                return { id, closed: true };
            }
        },
        {
            op: 'insights.history',
            describe: 'How each finding has BEHAVED over time, not just what is open now: how many separate times it came back, when it was first seen, whether you acted on it, and whether it returned AFTER that action (the honest answer to "did the fix work"). args: limit? (default 20), recurringOnly? (default false)',
            handler: (args) => {
                const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 20;
                const sum = summarizeInsightHistory(insightHistory(), 500);
                const now = Date.now();
                const rows = (args.recurringOnly === true
                    ? sum.top.filter(r => r.occurrences > 1 || r.regressedAt)
                    : sum.top).slice(0, limit);
                return {
                    tracked: sum.tracked, open: sum.open, recurring: sum.recurring,
                    regressedAfterAction: sum.regressed, fixesHolding: sum.fixedHolding,
                    findings: rows.map(r => ({
                        agent: r.agentName, category: r.category, message: r.label,
                        severity: r.severity, occurrences: r.occurrences, open: r.open,
                        firstSeen: r.firstSeen, lastSeen: r.lastSeen,
                        actedAt: r.actedAt ?? null, actedKind: r.actedKind ?? null,
                        regressedAfterAction: !!r.regressedAt,
                        summary: describeRecord(r, now)
                    }))
                };
            }
        },
        {
            op: 'projects.list',
            describe: 'Every project with its cost rollup and current warnings. A session belongs to exactly ONE project (explicit assignment first, then the longest matching folder root, then the agent rule), so the rows always add up to the fleet total — anything unclaimed is in "Unassigned". args: status? (planned|active|paused|done|archived — filter)',
            handler: (args) => {
                const status = optStr(args, 'status').trim().toLowerCase();
                return projectStore.all()
                    .filter(p => !status || p.status === status)
                    .map(p => projectView(p));
            }
        },
        {
            op: 'projects.get',
            describe: 'One project in full: identity, folder and its state, repos, people, budgets, cost rollup, warnings, and which document holds which role (charter/plan/log/people/deliverables — found by frontmatter, never by file name). args: project (id or name)',
            handler: (args) => {
                const p = projectStore.get(argStr(args, 'project'));
                need(p, 'no such project — projects.list shows them');
                const project = p as Project;
                const docs = project.folder && dirExists(project.folder) ? scanRoles(project.folder) : {};
                return { ...projectView(project), docs };
            }
        },
        {
            op: 'projects.create',
            describe: 'Create a project and build its folder. The folder is where everything a human writes about the project lives; pass folder? to say where, otherwise agentFarm.projectsRoot/<name> is used. Nothing existing is ever overwritten. args: name, folder?, kind? (product|customer|internal|research|personal|ops), status?, summary?, repos? (code roots), agents? (rule), budgetUSD?, budgetTotalUSD?, parentId?, tags?, skipFolder? (true = register it without touching disk)',
            handler: (args) => {
                const name = argStr(args, 'name').trim();
                need(name, 'a project needs a name');
                const explicit = optStr(args, 'folder').trim();
                const root = projectsRoot();
                const folder = explicit || (root ? path.join(root, folderNameFor(name)) : '');
                const res = projectStore.create({
                    name,
                    ...(folder ? { folder } : {}),
                    ...(PROJECT_KINDS.includes(optStr(args, 'kind') as never)
                        ? { kind: optStr(args, 'kind') as Project['kind'] } : {}),
                    ...(PROJECT_STATUSES.includes(optStr(args, 'status') as never)
                        ? { status: optStr(args, 'status') as ProjectStatus } : {}),
                    ...(optStr(args, 'summary') ? { summary: optStr(args, 'summary') } : {}),
                    ...(Array.isArray(args.repos) ? { repos: args.repos as string[] } : {}),
                    ...(Array.isArray(args.agents) ? { match: { agents: args.agents as string[] } } : {}),
                    ...(typeof args.budgetUSD === 'number' ? { budgetUSD: args.budgetUSD } : {}),
                    ...(typeof args.budgetTotalUSD === 'number' ? { budgetTotalUSD: args.budgetTotalUSD } : {}),
                    ...(optStr(args, 'parentId') ? { parentId: optStr(args, 'parentId') } : {}),
                    ...(Array.isArray(args.tags) ? { tags: args.tags as string[] } : {})
                });
                need(!res.error, res.error ?? '');
                const project = res.project as Project;
                let skeleton: { created: string[]; skipped: string[]; failed: unknown[] } | undefined;
                if (project.folder && args.skipFolder !== true) {
                    skeleton = createSkeleton(project.folder, project, projectSkeleton());
                }
                projectsChanged();
                return {
                    ...projectView(project),
                    folderCreated: skeleton?.created.length ?? 0,
                    folderSkipped: skeleton?.skipped.length ?? 0,
                    folderFailed: skeleton?.failed ?? []
                };
            }
        },
        {
            op: 'projects.set',
            describe: 'Update a project. Any field may be changed; passing "" clears an optional one (folder, parentId, budgets…). The id never changes, so nothing linked to the project is affected. args: project (id or name), status?, kind?, summary?, folder?, repos?, agents? (rule list), budgetUSD?, budgetTotalUSD?, parentId?, tags?, color?, icon?, dueAt?, delete? (true removes the project — its FOLDER is never touched and sub-projects are orphaned, not deleted)',
            handler: (args) => {
                const p = projectStore.get(argStr(args, 'project'));
                need(p, 'no such project — projects.list shows them');
                const project = p as Project;
                if (args.delete === true) {
                    projectStore.remove(project.id);
                    projectsChanged();
                    return { id: project.id, name: project.name, deleted: true, folderKept: project.folder ?? null };
                }
                const patch: Record<string, unknown> = {};
                for (const key of ['status', 'kind', 'summary', 'folder', 'parentId', 'color', 'icon']) {
                    if (args[key] !== undefined) { patch[key] = String(args[key]); }
                }
                for (const key of ['budgetUSD', 'budgetTotalUSD', 'dueAt', 'startedAt']) {
                    if (typeof args[key] === 'number') { patch[key] = args[key]; }
                }
                if (Array.isArray(args.repos)) { patch.repos = args.repos; }
                if (Array.isArray(args.tags)) { patch.tags = args.tags; }
                if (Array.isArray(args.agents)) { patch.match = { agents: args.agents }; }
                const res = projectStore.update(project.id, patch);
                need(!res.error, res.error ?? '');
                projectsChanged();
                return projectView(res.project as Project);
            }
        },
        {
            op: 'projects.rename',
            describe: 'Rename a project, and its folder with it. The id is immutable, so every session, task and notice stays attached. If the folder cannot be renamed (Obsidian may be holding a file inside it open) the NAME still changes, the old folder path is kept, and the failure is reported — a name and a folder that disagree is cosmetic; a project pointing at a folder that is not there is broken. args: project (id or name), name (the new one), renameFolder? (default true)',
            handler: (args) => {
                const p = projectStore.get(argStr(args, 'project'));
                need(p, 'no such project — projects.list shows them');
                const project = p as Project;
                const next = argStr(args, 'name').trim();
                need(next, 'a project needs a name');
                let folderError: string | undefined;
                let folder = project.folder;
                if (args.renameFolder !== false && project.folder && dirExists(project.folder)) {
                    const moved = renameProjectFolder(project.folder, next);
                    folder = moved.path;
                    if (!moved.ok) { folderError = moved.error; }
                }
                const res = projectStore.update(project.id, { name: next, ...(folder ? { folder } : {}) });
                need(!res.error, res.error ?? '');
                projectsChanged();
                return { ...projectView(res.project as Project), folderError: folderError ?? null };
            }
        },
        {
            op: 'projects.assign',
            describe: 'Attach a SESSION to a project, move it to another, or take it out. Three states, and the difference matters: a project id/name attaches (or transfers); "" means EXPLICITLY no project, which the folder and agent rules may not overrule; "forget" drops the decision so the rules speak again. args: session or sessions (id or array of ids), project ("" = none, "forget" = clear the decision). To set an agent RULE instead, use projects.set { agents: [...] }.',
            handler: (args) => {
                const one = optStr(args, 'session').trim();
                const many = Array.isArray(args.sessions)
                    ? (args.sessions as unknown[]).map(x => String(x ?? '').trim()).filter(Boolean)
                    : [];
                const ids = one ? [one, ...many] : many;
                need(ids.length, 'session (or sessions) required');
                const raw = optStr(args, 'project').trim();
                const value = raw.toLowerCase() === 'forget' ? undefined : raw;
                if (value) {
                    need(projectStore.get(value), `no project called "${value}" — projects.list shows them`);
                }
                const changed = projectStore.assignSessions(ids, value);
                projectsChanged();
                return {
                    sessions: ids.length, changed,
                    project: value ? (projectStore.get(value) as Project).name : (value === '' ? null : 'forgotten')
                };
            }
        },
        {
            op: 'projects.current',
            describe: 'Read or set the ACTIVE project of this window — sessions started here are filed under it as soon as they report an id (a session already filed by hand is never re-stamped). Pass nothing to read it, a project to set it, or "" to clear it. args: project?',
            handler: async (args) => {
                if (args.project !== undefined) {
                    const raw = String(args.project ?? '').trim();
                    if (!raw) {
                        await context.workspaceState.update('af.activeProject', '');
                    } else {
                        const p = projectStore.get(raw);
                        need(p, `no project called "${raw}" — projects.list shows them`);
                        await context.workspaceState.update('af.activeProject', (p as Project).id);
                    }
                    projectsChanged();
                }
                const current = activeProject();
                return current ? projectView(current) : { id: null, name: null };
            }
        },
        {
            op: 'projects.brief',
            describe: 'The project\'s BRIEF — the state summary a session started under it is given as an appended system prompt (status, people, code roots, which file holds which af-role, the latest worklog lines). Regenerating writes it to the project\'s _AF/BRIEF.md when it has a folder. Pass context:true to get the exact text a session receives instead, verbatim. args: project (id or name), context? (default false)',
            handler: (args) => {
                const key = argStr(args, 'project');
                const p = projectStore.get(key);
                need(p, `no project called "${key}" — projects.list shows them`);
                const project = p as Project;
                // Generating is what writes both files; asking for the brief and
                // asking what a session gets must not be two code paths that can
                // disagree about what the project's state is.
                const file = projectContextFileFor(project.id);
                if (args.context === true) {
                    const text = composeProjectContext(project.id)?.text ?? '';
                    need(text, 'the context could not be generated — the project folder may have moved');
                    return { project: project.name, contextFile: file ?? null, context: text };
                }
                const folder = (project.folder ?? '').trim();
                const roles = folder && dirExists(folder) ? scanRoles(folder) : {};
                return {
                    project: project.name,
                    briefFile: folder && dirExists(folder) ? path.join(folder, BRIEF_REL) : null,
                    brief: buildBrief({ project, roles, repos: project.repos ?? [] })
                };
            }
        },
        {
            op: 'projects.sessions',
            describe: 'The sessions that belong to one project, newest first, with WHY each one belongs (explicit = filed by hand or stamped when it started · path = it ran under a code root · agent = the agent rule). This is the data behind the page\'s Sessions button. args: project (id or name), limit? (default 50), all? (true ignores limit)',
            handler: (args) => {
                const key = argStr(args, 'project');
                const p = projectStore.get(key);
                need(p, `no project called "${key}" — projects.list shows them`);
                const limit = args.all === true ? 0 : Math.max(1, Number(args.limit) || 50);
                const rows = index.all()
                    .filter(s => projectStore.resolve({
                        sessionId: s.sessionId, agentId: s.agentId, agentName: s.agentName, cwd: s.cwd
                    }).projectId === (p as Project).id)
                    .sort((a, b) => (b.lastTs || b.mtime || 0) - (a.lastTs || a.mtime || 0));
                const shown = limit ? rows.slice(0, limit) : rows;
                return {
                    project: (p as Project).name,
                    total: rows.length,
                    cost: Math.round(rows.reduce((n, s) => n + s.cost, 0) * 10000) / 10000,
                    sessions: shown.map(s => ({
                        sessionId: s.sessionId, title: s.title, agent: s.agentName ?? null,
                        cwd: s.cwd ?? null, cost: s.cost, turns: s.turns,
                        lastTs: s.lastTs || s.mtime || 0,
                        via: projectStore.resolve({
                            sessionId: s.sessionId, agentId: s.agentId,
                            agentName: s.agentName, cwd: s.cwd
                        }).via
                    }))
                };
            }
        },
        {
            op: 'projects.timeline',
            describe: `One project's whole history as a single chronological list, newest first — sessions, the turns inside them, what each session wrote (aggregated), tasks, mission runs and their rounds, and git commits in the project's code roots. Every row carries a link to what it is about. \`counts\` reports every kind BEFORE the filter, so you can see what turning one on would add. NOT here yet, and not faked from an agent name: notices and queue items carry no project link, and decisions/deliverables/plan items are documents nothing writes yet — \`unfiled\` names them. args: project (id or name), kinds? (comma list or array of ${PROJECT_EVENT_KINDS.join('|')}; default all), sinceDays? (default 0 = everything), limit? (default 100), all? (true ignores limit)`,
            handler: (args) => {
                const key = argStr(args, 'project');
                const p = projectStore.get(key);
                need(p, `no project called "${key}" — projects.list shows them`);
                const raw = args.kinds;
                const asked = (Array.isArray(raw) ? raw.map(String)
                    : String(raw ?? '').split(',')).map(s => s.trim()).filter(Boolean);
                const bad = asked.filter(k => !PROJECT_EVENT_KINDS.includes(k as ProjectEventKind));
                need(!bad.length, `unknown event kind(s): ${bad.join(', ')} — pick from ${PROJECT_EVENT_KINDS.join(', ')}`);
                const sinceDays = Math.max(0, Number(args.sinceDays) || 0);
                const feed = projectFeedFor((p as Project).id, {
                    ...(asked.length ? { kinds: asked as ProjectEventKind[] } : {}),
                    ...(sinceDays ? { since: Date.now() - sinceDays * 86400000 } : {}),
                    limit: args.all === true ? 0 : Math.max(1, Number(args.limit) || 100)
                });
                return {
                    project: (p as Project).name,
                    counts: feed.counts,
                    truncated: feed.truncated,
                    unfiled: UNFILED_EVENT_KINDS,
                    events: feed.events.map(e => ({
                        // ‼️ LOCAL, like every other date the project axis prints.
                        // toISOString() would tell the agent a different hour —
                        // and east of UTC a different DAY — than the page it is
                        // describing. `ts` stays the unambiguous machine value.
                        ts: e.ts, at: localStamp(e.ts), kind: e.kind,
                        title: e.title, detail: e.detail ?? null, agent: e.agent ?? null,
                        cost: e.cost ?? null, link: e.link ?? null
                    }))
                };
            }
        },
        {
            op: 'projects.cost',
            describe: 'One project\'s money: the total, today, a per-day series (oldest first, for a burn curve), a breakdown by agent and by model, and the burn rate with what it projects. ‼️ The model breakdown claims only what the transcript actually bills: cost is recorded per TURN, so a turn served by two models cannot be split and is reported separately as `mixedTurnCost` rather than guessed at; sessions with no per-turn detail land in `unattributed`. byModel + mixedTurnCost + unattributed = total. args: project (id or name)',
            handler: (args) => {
                const key = argStr(args, 'project');
                const p = projectStore.get(key);
                need(p, `no project called "${key}" — projects.list shows them`);
                const project = p as Project;
                return {
                    project: project.name,
                    budgetUSD: project.budgetUSD ?? null,
                    budgetTotalUSD: project.budgetTotalUSD ?? null,
                    ...projectCostFor(project.id)
                };
            }
        },
        {
            op: 'projects.health',
            describe: 'Everything currently wrong across all projects: folders that are not there, folders never chosen, budgets exceeded today, and projects marked active that nothing has touched for agentFarm.projectStaleDays. args: none',
            handler: () => projectStore.all()
                .map(p => ({ id: p.id, name: p.name, status: p.status, warnings: projectWarnings(p) }))
                .filter(r => r.warnings.length)
        },
        {
            op: 'projects.rescan',
            describe: 'Walk agentFarm.projectsRoot and reconcile the registry with what is actually on disk. Identity comes from the charter\'s af-id, so a folder RENAMED in Obsidian is recognised as the same project and its name is updated here. Folders with no charter are reported, never imported silently. The session link table is kept — scanning cannot rebuild it. args: root? (defaults to agentFarm.projectsRoot), adopt? (true also registers folders that have a charter this store does not know)',
            handler: (args) => {
                const root = optStr(args, 'root').trim() || projectsRoot();
                need(root, 'no projects root — set agentFarm.projectsRoot or pass root');
                need(dirExists(root), `not a folder: ${root}`);
                const found = scanProjectsRoot(root);
                const renamed: { id: string; from: string; to: string }[] = [];
                const adopted: string[] = [];
                for (const f of found) {
                    if (f.id) {
                        const known = projectStore.get(f.id);
                        if (known) {
                            if (known.name !== f.name || known.folder !== f.folder) {
                                const res = projectStore.update(known.id, { name: f.name, folder: f.folder });
                                if (!res.error) { renamed.push({ id: known.id, from: known.name, to: f.name }); }
                            }
                            continue;
                        }
                    }
                    if (args.adopt === true && f.id) {
                        const res = projectStore.create({ name: f.name, folder: f.folder });
                        if (res.project) { adopted.push(res.project.name); }
                    }
                }
                projectsChanged();
                return {
                    root, found: found.length, renamed, adopted,
                    unregistered: found.filter(f => f.unregistered).map(f => f.name)
                };
            }
        },
        {
            op: 'sessions.files',
            describe: 'What a session did to the CODE: every file it wrote to (Edit/Write/MultiEdit/NotebookEdit) with write counts and +/- line totals, read back from the transcript\'s own before/after text — so it is what THAT session changed, not what the file looks like now. args: sessionId or file (transcript path), detail? (true also returns each hunk, capped)',
            handler: (args) => {
                const sessionId = optStr(args, 'sessionId');
                const fileArg = optStr(args, 'file');
                const s = fileArg
                    ? index.all().find(x => x.file === fileArg)
                    : index.all().find(x => x.sessionId === sessionId);
                need(s, 'session not found — sessions.recent lists current ones');
                const target = s as SessionInfo;
                let raw = '';
                try { raw = fs.readFileSync(target.file, 'utf8'); } catch { /* gone */ }
                const groups = groupByFile(collectEdits(raw.split('\n')));
                const detail = args.detail === true;
                return {
                    sessionId: target.sessionId, agent: target.agentName ?? null,
                    files: groups.map(f => {
                        const st = fileStats(f);
                        return {
                            file: f.file, writes: f.edits, failed: f.failed, written: f.written,
                            added: st.added, removed: st.removed, turns: f.turns,
                            ...(detail ? {
                                hunks: f.records.slice(0, 40).map(r => ({
                                    tool: r.tool, turn: r.turn, failed: !!r.failed,
                                    oldText: (r.oldText ?? '').slice(0, 4000),
                                    newText: (r.newText ?? '').slice(0, 4000)
                                }))
                            } : {})
                        };
                    })
                };
            }
        },
        {
            op: 'agents.sync',
            describe: 'Cross-engine sync for one agent. Writes BOTH lanes, because the engines look in different places: <agent>/AGENTS.md (Codex merges one AGENTS.md per directory from the git root down to its cwd) and <agent>/.agents/AGENTS.md (Antigravity\'s workspace customization root — it reads NOTHING above the workspace, so the shared constitution is embedded in this file). Plus duty workflows and a Codex MCP TOML snippet when .mcp.json exists. Non-destructive: if a generated file diverged (conflict / foreign / antigravity-ahead) it reports the state and changes nothing unless force=true. args: agent (name|id), force? (default false)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const st = antigravityStatus(agent.dir, agent.constitutionPath);
                // Divergence that needs a human decision — surface it, don't clobber.
                if ((st.state === 'conflict' || st.state === 'foreign' || st.state === 'antigravity-ahead')
                    && args.force !== true) {
                    return {
                        agent: agent.name, state: st.state, synced: false,
                        note: 'AGENTS.md diverged from CLAUDE.md — resolve with the "Sync Agent with Antigravity + Codex" command, or pass force=true to overwrite from CLAUDE.md.'
                    };
                }
                const ag = syncToAntigravity(agent.dir, agent.duties,
                    { force: true, constitutionPath: agent.constitutionPath });
                const cx = syncCodexExtras(agent.dir);
                return {
                    agent: agent.name, state: 'in-sync', synced: true,
                    constitution: agent.constitutionPath ?? null,
                    written: [...ag.written, ...cx.written],
                    notes: [...ag.notes, ...cx.notes]
                };
            }
        },
        {
            op: 'constitution.sync',
            describe: 'Mirror the SHARED constitution — a nest root\'s own CLAUDE.md, the instructions Claude Code loads for every child agent — to that folder\'s AGENTS.md (which Codex picks up on its git-root→cwd walk) and .agents/AGENTS.md (Antigravity, for when the nest folder itself is the open workspace). Agents get the same text embedded in their own .agents/AGENTS.md via agents.sync, since Antigravity reads no parent folder. CLAUDE.md is read, never written. args: root? (path or folder name — omit when there is only one nest), force? (default false: a foreign or hand-edited AGENTS.md is reported, not overwritten)',
            handler: (args) => {
                const { reports } = scanRoots(
                    cfg().get<string[]>('agentRoots', []),
                    cfg().get<string[]>('excludeAgentDirs', []));
                const nests = reports.filter(r =>
                    r.kind === 'nest' && fs.existsSync(path.join(r.root, 'CLAUDE.md')));
                if (!nests.length) {
                    throw new Error('no shared constitution found (a root that holds agent folders and has its own CLAUDE.md)');
                }
                const want = optStr(args, 'root');
                const nest = want
                    ? nests.find(n => normPath(n.root) === normPath(expandEnvPath(want)) ||
                        path.basename(n.root).toLowerCase() === want.toLowerCase())
                    : nests[0];
                if (!nest) {
                    throw new Error(`no such nest: ${want} (known: ${nests.map(n => path.basename(n.root)).join(', ')})`);
                }
                const st = antigravityStatus(nest.root);
                if ((st.state === 'conflict' || st.state === 'foreign' || st.state === 'antigravity-ahead')
                    && args.force !== true) {
                    return {
                        root: nest.root, state: st.state, synced: false,
                        note: 'AGENTS.md at the nest root diverged from the constitution — inspect it, or pass force=true to overwrite it from CLAUDE.md.'
                    };
                }
                const ag = syncToAntigravity(nest.root, [], { force: true });
                const cx = syncCodexExtras(nest.root);
                return {
                    root: nest.root, state: 'in-sync', synced: true,
                    written: [...ag.written, ...cx.written],
                    notes: [...ag.notes, ...cx.notes,
                        'Agents embed this text in their own .agents/AGENTS.md — run agents.sync for each agent to propagate a change.']
                };
            }
        }
    ]);

    // Duties ops (§19.C): the standing-vigilance system (DUTIES.md) is the
    // constitution's backbone — the whole watch→do lifecycle is manageable
    // from the bridge, so the manager agent can install, tune, pause and
    // reorder any agent's duties without a human clicking through the wizard.
    bridge.register([
        {
            op: 'duties.list',
            describe: 'Standing duties (DUTIES.md) with live watch status (is work waiting?). args: agent? (name|id — omit for every agent)',
            handler: (args) => {
                const ref = optStr(args, 'agent');
                return (ref ? [findAgent(ref)] : agents).map(a => {
                    const info = readDuties(a.dir);
                    return {
                        agent: a.name,
                        file: info?.file ?? null,
                        duties: (info?.duties ?? []).map(d => ({
                            title: d.title, cadence: d.cadence, paused: d.paused,
                            watch: d.watch ?? null, do: d.action ?? null, note: d.note ?? null,
                            watchStatus: watchStatus(d.watch) ?? null
                        }))
                    };
                });
            }
        },
        {
            op: 'duties.add',
            describe: `Add a standing duty to an agent's DUTIES.md. args: agent (name|id), title, cadence (${CADENCES.join('|')}), watch? (path or description), do? (what to do when the watch changes), note?, paused? (default false), ensureReference? (true = append the DUTIES.md instruction to CLAUDE.md when missing; default false — the result warns instead)`,
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const title = argStr(args, 'title');
                const cadence = argStr(args, 'cadence');
                need((CADENCES as readonly string[]).includes(cadence),
                    `Unknown cadence "${cadence}" — use one of: ${CADENCES.join(', ')}.`);
                need(!readDuties(agent.dir)?.duties.some(d => d.title === title),
                    `${agent.name} already has a duty titled "${title}".`);
                const file = addDuty(agent.dir, {
                    title, cadence, paused: args.paused === true,
                    watch: optStr(args, 'watch') || undefined,
                    action: optStr(args, 'do') || undefined,
                    note: optStr(args, 'note') || undefined
                });
                // A duty only lives if the agent's identity file points at it.
                // The UI wizard asks with a modal; the bridge must not pop UI —
                // it warns, or appends itself when explicitly asked to.
                let referenced = true;
                if (agent.claudeMdPath) {
                    const md = fs.readFileSync(agent.claudeMdPath, 'utf8');
                    referenced = claudeMdReferencesDuties(md);
                    if (!referenced && args.ensureReference === true) {
                        fs.writeFileSync(agent.claudeMdPath, md.replace(/\n*$/, '\n') + CLAUDE_MD_SNIPPET, 'utf8');
                        referenced = true;
                    }
                }
                refreshAll();
                return {
                    agent: agent.name, title, file, referenced,
                    ...(referenced ? {} : {
                        warning: `${agent.name}'s CLAUDE.md never mentions ${DUTIES_FILENAME} — the agent will not obey this duty. Re-run with ensureReference=true to append the instruction.`
                    })
                };
            }
        },
        {
            op: 'duties.update',
            describe: 'Patch a duty in place. args: agent (name|id), title (current), then any of: newTitle?, cadence?, watch?, do?, note?, paused? — pass "" to clear watch/do/note',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const title = argStr(args, 'title');
                const cur = findDuty(agent, title);
                const cadence = optStr(args, 'cadence') || cur.cadence;
                need(cadence === cur.cadence || (CADENCES as readonly string[]).includes(cadence),
                    `Unknown cadence "${cadence}" — use one of: ${CADENCES.join(', ')}.`);
                // "" clears a field; absent keeps it — the tri-state a patch needs
                const pick = (key: string, old?: string) =>
                    typeof args[key] === 'string' ? ((args[key] as string).trim() || undefined) : old;
                const next: Duty = {
                    title: optStr(args, 'newTitle') || cur.title,
                    cadence,
                    paused: typeof args.paused === 'boolean' ? args.paused : cur.paused,
                    watch: pick('watch', cur.watch),
                    action: pick('do', cur.action),
                    note: pick('note', cur.note)
                };
                updateDuty(agent.dir, title, next);
                refreshAll();
                return { agent: agent.name, duty: next };
            }
        },
        {
            op: 'duties.delete',
            describe: 'Remove a duty from an agent\'s DUTIES.md. args: agent (name|id), title',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const title = argStr(args, 'title');
                findDuty(agent, title);
                deleteDuty(agent.dir, title);
                refreshAll();
                return { agent: agent.name, deleted: title };
            }
        },
        {
            op: 'duties.togglePause',
            describe: 'Pause/resume a duty (a paused duty is skipped by the agent). args: agent (name|id), title',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const title = argStr(args, 'title');
                const d = findDuty(agent, title);
                togglePauseDuty(agent.dir, title);
                refreshAll();
                return { agent: agent.name, title, paused: !d.paused };
            }
        },
        {
            op: 'duties.move',
            describe: 'Reorder a duty one slot up or down in DUTIES.md. args: agent (name|id), title, direction (up|down)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const title = argStr(args, 'title');
                const direction = argStr(args, 'direction');
                need(direction === 'up' || direction === 'down', 'direction must be "up" or "down".');
                findDuty(agent, title);
                moveDuty(agent.dir, title, direction === 'up' ? -1 : 1);
                refreshAll();
                return {
                    agent: agent.name,
                    order: readDuties(agent.dir)?.duties.map(d => d.title) ?? []
                };
            }
        },
        {
            op: 'duties.automate',
            describe: 'Create a watch trigger from a duty so it fires even while the agent is idle (the duty stays in DUTIES.md). Needs a watch pointing at a real file/folder. args: agent (name|id), title',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const d = findDuty(agent, argStr(args, 'title'));
                need(d.watch && fs.existsSync(d.watch),
                    'This duty has no existing watch path — only duties watching a real file/folder can be automated as a trigger.');
                const trigger = taskManager.addTrigger(dutyTriggerSpec(agent, d));
                return { id: trigger.id, trigger: trigger.title, watch: d.watch };
            }
        }
    ]);

    // Control-plane completion (§19.C): every remaining manage-verb the panels
    // and palette already had — edit instead of delete+recreate, read a task's
    // result, drive triggers/workflows/templates, and steer a live mission.
    bridge.register([
        {
            op: 'schedules.edit',
            describe: 'Edit a schedule in place (id survives — no delete+recreate). args: id or title, then any of: newTitle?, prompt?, agent? (name|id), mode? (headless|interactive), kind? (daily|weekly|once), hour? (0-23), minute? (0-59), dow? (0-6, weekly), onceAt? ("YYYY-MM-DD HH:MM" or epoch ms, once), missed? (skip|run|ask), enabled? (boolean), model? (opus|sonnet|haiku|"" to clear — beats the modelPolicy engine), fireIf? ({kind:folderHasFiles|fileMissing|pathChangedWithin|queueHasWork, path?, except?[], minCount?, hours?, recursive?} or null to clear — the schedule is skipped for free when it fails)',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const s = taskManager.schedules.find(x => x.id === ref || x.title === ref);
                need(s, 'Schedule not found — schedules.list shows current ones.');
                const cur = s as FarmSchedule;
                const patch: Partial<FarmSchedule> = {};
                const newTitle = optStr(args, 'newTitle');
                if (newTitle) {
                    need(!taskManager.schedules.some(x => x.id !== cur.id && x.title === newTitle),
                        `A schedule titled "${newTitle}" already exists.`);
                    patch.title = newTitle;
                }
                if (optStr(args, 'prompt')) { patch.prompt = optStr(args, 'prompt'); }
                if (optStr(args, 'agent')) {
                    const a = findAgent(optStr(args, 'agent'));
                    patch.agentId = a.id;
                    patch.agentName = a.name;
                }
                const mode = optStr(args, 'mode');
                if (mode) {
                    need(mode === 'headless' || mode === 'interactive', 'mode must be headless | interactive.');
                    patch.mode = mode as TaskMode;
                }
                const kind = optStr(args, 'kind');
                if (kind) {
                    need(kind === 'daily' || kind === 'weekly' || kind === 'once', 'kind must be daily | weekly | once.');
                    patch.kind = kind as ScheduleKind;
                }
                const intArg = (key: 'hour' | 'minute' | 'dow', min: number, max: number) => {
                    const v = args[key];
                    if (v === undefined) { return; }
                    need(typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
                        `${key} must be an integer ${min}-${max}.`);
                    patch[key] = v as number;
                };
                intArg('hour', 0, 23);
                intArg('minute', 0, 59);
                intArg('dow', 0, 6);
                if (args.onceAt !== undefined) {
                    const t = typeof args.onceAt === 'number'
                        ? args.onceAt
                        : Date.parse(String(args.onceAt).trim().replace(' ', 'T'));
                    need(Number.isFinite(t), 'onceAt must be "YYYY-MM-DD HH:MM" or epoch ms.');
                    patch.onceAt = t;
                }
                const missed = optStr(args, 'missed');
                if (missed) {
                    need(missed === 'skip' || missed === 'run' || missed === 'ask', 'missed must be skip | run | ask.');
                    patch.missed = missed as MissedPolicy;
                    // switching catch-up ON settles the past first — otherwise the
                    // edit itself would instantly fire a pre-edit occurrence
                    if (missed !== (cur.missed ?? 'skip') && missed !== 'skip') {
                        patch.lastRunKey = previousOccurrenceKey(
                            { kind: patch.kind ?? cur.kind, dow: patch.dow ?? cur.dow }, new Date());
                    }
                }
                if (typeof args.enabled === 'boolean') { patch.enabled = args.enabled; }
                if (args.model !== undefined) {
                    const m = optStr(args, 'model');
                    need(!m || /^[\w.:-]+$/.test(m), 'model must be a model id/alias (e.g. opus, sonnet, haiku).');
                    patch.model = m || undefined;
                }
                if (args.fireIf !== undefined) {
                    if (args.fireIf === null || args.fireIf === '') { patch.fireIf = undefined; }
                    else {
                        const pre = parsePrecondition(args.fireIf);
                        need(pre, 'fireIf.kind must be folderHasFiles | fileMissing | pathChangedWithin | queueHasWork.');
                        patch.fireIf = pre;
                    }
                }
                need(Object.keys(patch).length, 'Nothing to edit — pass at least one documented field.');
                const kindAfter = patch.kind ?? cur.kind;
                need(kindAfter !== 'weekly' || (patch.dow ?? cur.dow) !== undefined,
                    'A weekly schedule needs dow (0=Sunday … 6=Saturday).');
                need(kindAfter !== 'once' || (patch.onceAt ?? cur.onceAt) !== undefined,
                    'A once schedule needs onceAt.');
                taskManager.updateSchedule(cur.id, patch);
                return { id: cur.id, title: patch.title ?? cur.title, updated: Object.keys(patch) };
            }
        },
        {
            op: 'tasks.get',
            describe: 'One task in detail, archived output included — the way to read what a task actually produced. args: id, tail? (max output chars, default 4000)',
            handler: (args) => {
                const t = taskManager.tasks.find(x => x.id === argStr(args, 'id'));
                need(t, 'Task not found — tasks.list shows current ids.');
                const task = t as FarmTask;
                const tail = typeof args.tail === 'number' && args.tail > 0 ? Math.floor(args.tail) : 4000;
                let output: string | null = null;
                if (task.outputFile && fs.existsSync(task.outputFile)) {
                    try {
                        output = archivedOutputBody(fs.readFileSync(task.outputFile, 'utf8')).slice(-tail);
                    } catch { /* unreadable output stays null */ }
                }
                return {
                    id: task.id, title: task.title, agent: task.agentName, status: task.status,
                    mode: task.mode, prompt: task.prompt, createdAt: task.createdAt,
                    startedAt: task.startedAt ?? null, endedAt: task.endedAt ?? null,
                    costUSD: task.costUSD ?? null, deferredReason: task.deferredReason ?? null,
                    verified: task.verified ?? null, attempt: task.attempt ?? 0,
                    fromSchedule: task.fromSchedule ?? null, fromTrigger: task.fromTrigger ?? null,
                    missionId: task.missionId ?? null, workflowId: task.workflowId ?? null,
                    outputFile: task.outputFile ?? null, output
                };
            }
        },
        {
            op: 'tasks.delete',
            describe: 'Delete one task row permanently (its archived output file too — tasks.get first if you need it). A running task must be cancelled first. args: id',
            handler: (args) => {
                const t = taskManager.tasks.find(x => x.id === argStr(args, 'id'));
                need(t, 'Task not found — tasks.list shows current ids.');
                need((t as FarmTask).status !== 'running', 'Task is running — tasks.cancel it first.');
                taskManager.deleteTask(t as FarmTask);
                return { deleted: (t as FarmTask).id };
            }
        },
        {
            op: 'triggers.add',
            describe: 'Install a trigger. args: title, type (watch|hook|webhook), watch? (existing file/folder — watch type), hookEvent? (start|prompt|toolStart|toolEnd|permission|notify|stop|subagent|compact|end — hook type), hookAgent? (agent name filter, hook type), action ({kind:"task", agent, prompt, title?, mode?, model?} | {kind:"dispatch", prompt, title?, model?} | {kind:"workflow", workflow: id|title}), fireIf? ({kind:folderHasFiles|fileMissing|pathChangedWithin|queueHasWork, path?, except?[], minCount?, hours?, recursive?} — the CONTENT brake: a watch fires on any filesystem change, this stops the wake-up for free when there is no real work), debounceSec?, cooldownSec?, maxPerHour? (0 = unlimited), enabled? (default true). Prompts may use {watch} and {payload}. A webhook trigger returns its POST url.',
            handler: (args) => {
                const title = argStr(args, 'title');
                const typeIn = argStr(args, 'type');
                need(typeIn === 'watch' || typeIn === 'hook' || typeIn === 'webhook', 'type must be watch | hook | webhook.');
                const type = typeIn as FarmTrigger['type'];
                let watchPath: string | undefined, hookEvent: string | undefined,
                    hookAgent: string | undefined, token: string | undefined;
                if (type === 'watch') {
                    watchPath = argStr(args, 'watch');
                    need(fs.existsSync(watchPath), `Watch path does not exist: ${watchPath}`);
                } else if (type === 'hook') {
                    hookEvent = argStr(args, 'hookEvent');
                    const kinds = ['start', 'prompt', 'toolStart', 'toolEnd', 'permission',
                        'notify', 'stop', 'subagent', 'compact', 'end'];
                    need(kinds.includes(hookEvent), `Unknown hookEvent "${hookEvent}" — use one of: ${kinds.join(', ')}.`);
                    hookAgent = optStr(args, 'hookAgent') ? findAgent(optStr(args, 'hookAgent')).name : undefined;
                } else {
                    token = newId() + newId();
                }
                const rec = args.action && typeof args.action === 'object' && !Array.isArray(args.action)
                    ? args.action as Record<string, unknown>
                    : undefined;
                need(rec, 'action is required: {kind:"task"|"dispatch"|"workflow", ...}.');
                const a = rec as Record<string, unknown>;
                const kind = String(a.kind ?? '');
                let action: FarmTrigger['action'];
                if (kind === 'task') {
                    const agent = findAgent(String(a.agent ?? ''));
                    const prompt = String(a.prompt ?? '').trim();
                    need(prompt, 'action.prompt is required for a task action.');
                    action = {
                        kind: 'task', agentId: agent.id, agentName: agent.name,
                        title: String(a.title ?? '').trim() || title, prompt,
                        mode: a.mode === 'interactive' ? 'interactive' : 'headless',
                        model: String(a.model ?? '').trim() || undefined
                    };
                } else if (kind === 'dispatch') {
                    const prompt = String(a.prompt ?? '').trim();
                    need(prompt, 'action.prompt is required for a dispatch action.');
                    action = {
                        kind: 'dispatch', title: String(a.title ?? '').trim() || title, prompt, mode: 'headless',
                        model: String(a.model ?? '').trim() || undefined
                    };
                } else if (kind === 'workflow') {
                    const wref = String(a.workflow ?? '').trim();
                    const w = taskManager.workflows.find(x => x.id === wref || x.title === wref);
                    need(w, 'Workflow not found — workflows.list shows current ones.');
                    action = { kind: 'workflow', workflowId: (w as FarmWorkflow).id };
                } else {
                    throw new Error('action.kind must be task | dispatch | workflow.');
                }
                const numArg = (key: string, def: number, min: number) => {
                    const v = args[key];
                    if (v === undefined) { return def; }
                    need(typeof v === 'number' && Number.isFinite(v) && v >= min, `${key} must be a number ≥ ${min}.`);
                    return Math.floor(v as number);
                };
                const fireIf = args.fireIf === undefined ? undefined : parsePrecondition(args.fireIf);
                need(args.fireIf === undefined || fireIf,
                    'fireIf.kind must be folderHasFiles | fileMissing | pathChangedWithin | queueHasWork.');
                const trigger = taskManager.addTrigger({
                    title, type, watchPath, hookEvent, hookAgent, token, action, fireIf,
                    debounceSec: numArg('debounceSec', type === 'watch' ? 10 : 1, 1),
                    cooldownSec: numArg('cooldownSec', 60, 0),
                    maxPerHour: numArg('maxPerHour', 6, 0),
                    enabled: args.enabled !== false
                });
                return {
                    id: trigger.id, title: trigger.title, type, fireIf: trigger.fireIf ?? null,
                    ...(token ? { url: `http://127.0.0.1:${cfg().get<number>('livePort', 8377)}/trigger/${token}` } : {})
                };
            }
        },
        {
            op: 'triggers.edit',
            describe: 'Edit a trigger in place. args: id or title, then any of: newTitle?, prompt? (task/dispatch action), agent? (name|id — task action), watch? (watch type), hookEvent?/hookAgent? (hook type; hookAgent "" = any agent), debounceSec? (≥1), cooldownSec?, maxPerHour? (0 = unlimited), model? ("" to clear), fireIf? (precondition object, or null to clear)',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const t = taskManager.triggers.find(x => x.id === ref || x.title === ref);
                need(t, 'Trigger not found — triggers.list shows current ones.');
                const tr = t as FarmTrigger;
                const updated: string[] = [];
                const newTitle = optStr(args, 'newTitle');
                if (newTitle) {
                    tr.title = newTitle;
                    // parity with the palette editor: a task/dispatch action carries the title
                    if (tr.action.kind !== 'workflow') { tr.action.title = newTitle; }
                    updated.push('title');
                }
                if (optStr(args, 'prompt')) {
                    need(tr.action.kind !== 'workflow', 'A workflow trigger has no prompt — edit the workflow instead.');
                    if (tr.action.kind !== 'workflow') { tr.action.prompt = optStr(args, 'prompt'); }
                    updated.push('prompt');
                }
                if (optStr(args, 'agent')) {
                    need(tr.action.kind === 'task', 'Only a task action has a fixed agent.');
                    const a = findAgent(optStr(args, 'agent'));
                    if (tr.action.kind === 'task') {
                        tr.action.agentId = a.id;
                        tr.action.agentName = a.name;
                    }
                    updated.push('agent');
                }
                if (optStr(args, 'watch')) {
                    need(tr.type === 'watch', 'Only a watch trigger has a watch path.');
                    need(fs.existsSync(optStr(args, 'watch')), `Watch path does not exist: ${optStr(args, 'watch')}`);
                    tr.watchPath = optStr(args, 'watch');
                    updated.push('watch');
                }
                if (optStr(args, 'hookEvent')) {
                    need(tr.type === 'hook', 'Only a hook trigger has a hookEvent.');
                    tr.hookEvent = optStr(args, 'hookEvent');
                    updated.push('hookEvent');
                }
                if (typeof args.hookAgent === 'string') {
                    need(tr.type === 'hook', 'Only a hook trigger has a hookAgent filter.');
                    tr.hookAgent = args.hookAgent.trim() ? findAgent(args.hookAgent.trim()).name : undefined;
                    updated.push('hookAgent');
                }
                const numPatch = (key: 'debounceSec' | 'cooldownSec' | 'maxPerHour', min: number) => {
                    const v = args[key];
                    if (v === undefined) { return; }
                    need(typeof v === 'number' && Number.isFinite(v) && v >= min, `${key} must be a number ≥ ${min}.`);
                    tr[key] = Math.floor(v as number);
                    updated.push(key);
                };
                numPatch('debounceSec', 1);
                numPatch('cooldownSec', 0);
                numPatch('maxPerHour', 0);
                if (args.model !== undefined) {
                    need(tr.action.kind !== 'workflow', 'A workflow trigger has no model — set it on the steps.');
                    const m = optStr(args, 'model');
                    need(!m || /^[\w.:-]+$/.test(m), 'model must be a model id/alias (e.g. opus, sonnet, haiku).');
                    if (tr.action.kind !== 'workflow') { tr.action.model = m || undefined; }
                    updated.push('model');
                }
                if (args.fireIf !== undefined) {
                    if (args.fireIf === null || args.fireIf === '') { tr.fireIf = undefined; }
                    else {
                        const pre = parsePrecondition(args.fireIf);
                        need(pre, 'fireIf.kind must be folderHasFiles | fileMissing | pathChangedWithin | queueHasWork.');
                        tr.fireIf = pre;
                    }
                    updated.push('fireIf');
                }
                need(updated.length, 'Nothing to edit — pass at least one documented field.');
                taskManager.updateTrigger(tr);
                return { id: tr.id, title: tr.title, updated, fireIf: tr.fireIf ?? null };
            }
        },
        {
            op: 'triggers.delete',
            describe: 'Remove a trigger. args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const t = taskManager.triggers.find(x => x.id === ref || x.title === ref);
                need(t, 'Trigger not found — triggers.list shows current ones.');
                taskManager.deleteTrigger(t as FarmTrigger);
                return { deleted: (t as FarmTrigger).title };
            }
        },
        {
            op: 'workflows.add',
            describe: 'Create a workflow (step chain). args: title, steps ([{agent (name|id), title, prompt, mode? (headless|interactive), onFail? ("stop"|"continue"|1-based step), runIf?, outputContract? ("text"|"json"), verify? ({criteria, retries?})} — advanced webhook/media/browser fields pass through as in the builder])',
            handler: (args) => {
                const title = argStr(args, 'title');
                need(!taskManager.workflows.some(w => w.title === title),
                    `A workflow titled "${title}" already exists.`);
                const stepsIn = Array.isArray(args.steps) ? args.steps as Record<string, unknown>[] : [];
                need(stepsIn.length, 'steps is required — at least one step.');
                const steps: WorkflowStep[] = stepsIn.map((raw, i) => {
                    need(raw && typeof raw === 'object' && !Array.isArray(raw), `Step ${i + 1} must be an object.`);
                    const agent = findAgent(String(raw.agent ?? ''));
                    const stepTitle = String(raw.title ?? '').trim();
                    need(stepTitle, `Step ${i + 1}: title is required.`);
                    const prompt = String(raw.prompt ?? '').trim();
                    need(prompt || raw.webhook || raw.media, `Step ${i + 1}: prompt is required.`);
                    const { agent: _agentRef, ...passthrough } = raw;
                    return {
                        ...passthrough,
                        agentId: agent.id, agentName: agent.name,
                        title: stepTitle, prompt,
                        mode: raw.mode === 'interactive' ? 'interactive' : 'headless'
                    } as WorkflowStep;
                });
                const w = taskManager.addWorkflow(title, steps);
                return { id: w.id, title: w.title, steps: w.steps.length };
            }
        },
        {
            op: 'workflows.delete',
            describe: 'Remove a workflow definition (its triggers keep pointing nowhere — retarget or delete them). args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const w = taskManager.workflows.find(x => x.id === ref || x.title === ref);
                need(w, 'Workflow not found — workflows.list shows current ones.');
                taskManager.deleteWorkflow(w as FarmWorkflow);
                return { deleted: (w as FarmWorkflow).title };
            }
        },
        {
            op: 'templates.add',
            describe: 'Save a reusable task template. args: title, prompt, mode? (headless|interactive), agent? (name|id — omit for an unbound template that asks at run time)',
            handler: (args) => {
                const title = argStr(args, 'title');
                need(!taskManager.templates.some(t => t.title === title),
                    `A template titled "${title}" already exists.`);
                const agent = optStr(args, 'agent') ? findAgent(optStr(args, 'agent')) : undefined;
                const tpl = taskManager.addTemplate({
                    title, prompt: argStr(args, 'prompt'),
                    mode: optStr(args, 'mode') === 'interactive' ? 'interactive' : 'headless',
                    agentId: agent?.id, agentName: agent?.name
                });
                return { id: tpl.id, title: tpl.title };
            }
        },
        {
            op: 'templates.delete',
            describe: 'Remove a task template. args: id or title',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const tpl = taskManager.templates.find(x => x.id === ref || x.title === ref);
                need(tpl, 'Template not found — templates.list shows current ones.');
                taskManager.deleteTemplate(tpl as FarmTemplate);
                return { deleted: (tpl as FarmTemplate).title };
            }
        },
        {
            op: 'missions.pause',
            describe: 'Pause a live mission run (the current wave finishes, then the planner waits). args: id',
            handler: (args) => {
                const runId = argStr(args, 'id');
                const run = missionStore.run(runId);
                need(run, 'Run not found — missions.list shows current ids.');
                const engine = missionEngines.get(runId);
                if (engine) { engine.pause(); }
                else {
                    const r = run as MissionRun;
                    need(r.status === 'running' || r.status === 'waiting-approval' || r.status === 'waiting-user',
                        `Run is ${r.status} — only a live run can be paused.`);
                    r.status = 'paused';
                    r.now = undefined;
                }
                missionChanged();
                return { id: runId, status: (run as MissionRun).status };
            }
        },
        {
            op: 'missions.resume',
            describe: 'Resume a paused mission — a live-paused engine continues in place; a parked/interrupted run relaunches with its context. args: id',
            handler: (args) => {
                const runId = argStr(args, 'id');
                const run = missionStore.run(runId);
                need(run, 'Run not found — missions.list shows current ids.');
                const engine = missionEngines.get(runId);
                if (engine) {
                    engine.unpause();
                    missionChanged();
                } else {
                    need((run as MissionRun).status === 'paused',
                        `Run is ${(run as MissionRun).status} — only a paused run can be resumed.`);
                    resumeMission(runId);
                }
                return { id: runId, status: (missionStore.run(runId) as MissionRun).status };
            }
        },
        {
            op: 'missions.cancel',
            describe: 'Cancel a mission run — the engine stops, in-flight delegated tasks are cancelled, a pending approval is rejected. args: id',
            handler: (args) => {
                const runId = argStr(args, 'id');
                const run = missionStore.run(runId);
                need(run, 'Run not found — missions.list shows current ids.');
                const r = run as MissionRun;
                need(r.status !== 'done' && r.status !== 'failed' && r.status !== 'cancelled',
                    `Run is already ${r.status}.`);
                cancelMission(runId);
                return { id: runId, status: (missionStore.run(runId) as MissionRun).status };
            }
        },
        {
            op: 'missions.answer',
            describe: 'Answer the question a mission is waiting on (missions.status → pendingQuestion). args: id, answer (text) — or skip=true to decline it',
            handler: (args) => {
                const runId = argStr(args, 'id');
                need(missionQuestions.has(runId),
                    'No pending question on this run — missions.status shows what it is doing.');
                if (args.skip === true) {
                    missionQuestions.get(runId)?.resolve(undefined);
                    return { id: runId, skipped: true };
                }
                missionQuestions.get(runId)?.resolve(argStr(args, 'answer'));
                return { id: runId, answered: true };
            }
        },
        {
            op: 'missions.approve',
            describe: 'Settle a mission round waiting for approval (approvalMode each-round). args: id, ok? (default true = approve the plan; false = reject and the planner revises)',
            handler: (args) => {
                const runId = argStr(args, 'id');
                const apId = missionApprovals.get(runId);
                need(apId, 'No pending approval on this run — missions.status shows its state.');
                approvalQueue.settle(apId as string, args.ok !== false);
                return { id: runId, approved: args.ok !== false };
            }
        }
    ]);

    // Toolbox ops (constitution §19.C): the extension inventory, one item in
    // detail, and the live MCP tools/list probe — same code paths as the page.
    registerToolboxOps(bridge, {
        getAgents: () => agents,
        cacheFile: toolboxProbeCacheFile
    });
    // Turns ops (§19.C): the Turns page's rows as data.
    registerTurnsOps(bridge, {
        sessions: () => index.all(),
        isActive: s => index.isSessionActive(s, Date.now())
    });

    // Notices ops (§19.C): the agent→user notice board — every agent posts
    // "you should know / remember this" here; the user reads them on the
    // Notices page. This is the channel the manager agent's daily AI digest
    // and any agent's reminders/results surface through.
    //
    // Second leg — full reports: a notice carries a short summary; when the
    // content is substantial the agent passes the full markdown via `report`,
    // and this writes it to the report folder as YYYY-MM-DD_<name>.md (the
    // vault's report convention) so the UI can open it. reportPath links a
    // file the agent already wrote itself.
    const reportDir = (): string => {
        const cfg = vscode.workspace.getConfiguration('agentFarm').get<string>('reportDir');
        return (cfg && cfg.trim())
            || path.join('D:', 'zone', 'know', 'note', 'obsidian', '00_AGENT_AREA', '00_OUTPUT', '10_REPORT');
    };
    const writeReport = (a: { title: string; name?: string; body: string; agentName?: string }): string => {
        const dir = reportDir();
        fs.mkdirSync(dir, { recursive: true });
        const d = new Date();
        // Naming (reportFileStem, §7): reportName is verbatim; the auto name
        // splices the poster agent between date and title so shared-folder
        // reports stay attributable — YYYY-MM-DD_<agent>_<title>.md.
        const stem = reportFileStem({ title: a.title, name: a.name, agentName: a.agentName, date: d });
        let file = path.join(dir, `${stem}.md`);
        for (let i = 2; fs.existsSync(file); i++) { file = path.join(dir, `${stem}-${i}.md`); }
        const footer = a.agentName ? `\n\n---\n_${a.agentName} · ${d.toLocaleString()}_\n` : '';
        fs.writeFileSync(file, a.body.trimEnd() + footer, 'utf8');
        return file;
    };
    registerNoticesOps(bridge, {
        store: noticesStore,
        writeReport,
        onChange: () => { NoticesPanel.refreshIfOpen(); updateNoticesBadge(); },
        onPost: (n) => {
            // Ultra-important (level 4) warns; a question gently pings so it does
            // not sit unnoticed. Everything else stays quiet — the bell carries it.
            if (n.level >= 4) {
                void vscode.window.showWarningMessage(`🔔 ${n.agentName}: ${n.title}`, 'Open Notices')
                    .then(pick => { if (pick) { void vscode.commands.executeCommand('agentfarm.openNotices'); } });
            } else if (n.type === 'question') {
                void vscode.window.showInformationMessage(`❓ ${n.agentName} asked: ${n.title}`, 'Open Notices')
                    .then(pick => { if (pick) { void vscode.commands.executeCommand('agentfarm.openNotices'); } });
            }
        }
    });

    // A work item's detailed ANSWER (a "cevap", NOT a user-requested report) is
    // written to its own dedicated folder, 01_CEVAPLAR — distinct from 10_REPORT.
    // GAP-8: it reuses the SAME stem builder as reports (reportFileStem) so the
    // host adds the exact YYYY-MM-DD_<agent>_<topic> prefix the vault rule wants
    // (constitution §7/§13) — only the target folder differs. The empty-topic
    // fallback is forced to "cevap" (not the report word "rapor") so a title-less
    // answer still reads as an answer.
    const cevapDir = (): string => {
        const cfg = vscode.workspace.getConfiguration('agentFarm').get<string>('answerDir');
        return (cfg && cfg.trim())
            || path.join('D:', 'zone', 'know', 'note', 'obsidian', '00_AGENT_AREA', '00_OUTPUT', '01_CEVAPLAR');
    };
    const writeAnswer = (a: { title: string; name?: string; body: string; agentName?: string }): string => {
        const dir = cevapDir();
        fs.mkdirSync(dir, { recursive: true });
        const d = new Date();
        const stem = reportFileStem({ title: a.title || 'cevap', name: a.name, agentName: a.agentName, date: d });
        let file = path.join(dir, `${stem}.md`);
        for (let i = 2; fs.existsSync(file); i++) { file = path.join(dir, `${stem}-${i}.md`); }
        const footer = a.agentName ? `\n\n---\n_${a.agentName} · ${d.toLocaleString()}_\n` : '';
        fs.writeFileSync(file, a.body.trimEnd() + footer, 'utf8');
        return file;
    };

    // Work Queue bridge ops (queue.*) — the user→agent capture channel. The
    // notices port lets queue.fromNotice cross-link the two boards without a
    // hard module dependency. Panel refresh is added once QueuePanel exists.
    registerQueueOps(bridge, {
        store: workQueueStore,
        notices: {
            titleOf: (id) => noticesStore.titleOf(id),
            addSpawnedItem: (id, ref) => noticesStore.addSpawnedItem(id, ref),
            dismiss: (id) => noticesStore.dismiss(id)
        },
        writeAnswer,
        thresholds: () => ({
            groupSize: cfg().get<number>('queue.groupSize', 3),
            maxAgeHours: cfg().get<number>('queue.maxAgeHours', 24)
        }),
        // Refresh BOTH boards: queue.fromNotice mutates a notice too.
        onChange: () => { QueuePanel.refreshIfOpen(); NoticesPanel.refreshIfOpen(); updateNoticesBadge(); }
    });

    // --- Doc-open "open with" (Feature B) — shared by BOTH boards -------------
    // ONE helper opens a report/answer .md with the chosen mode (mode omitted =
    // the user's stored default). The path is always host-resolved (from the
    // notice/item), never the webview — so nothing arbitrary can be opened.
    const openDoc = (filePath: string, mode?: string): void => {
        const cfg = docOpenStore.get();
        const m = (mode && (DOC_OPEN_MODES as string[]).includes(mode) ? mode : cfg.defaultMode) as DocOpenMode;
        void openReportDoc(filePath, m, cfg);
    };
    const docOpenConfig = (): { mode: string; hasCustom: boolean } => {
        const c = docOpenStore.get();
        return { mode: c.defaultMode, hasCustom: !!c.customCommand.trim() };
    };
    // The host-side "configure default + custom app" flow (the ⚙ Configure item
    // in each panel's caret menu, and the palette command). Writes the module
    // store; both boards pick it up on their next render.
    const configureDocOpen = async (): Promise<void> => {
        const cur = docOpenStore.get();
        const picked = await vscode.window.showQuickPick(
            DOC_OPEN_MODES.map(m => ({
                label: `${m === cur.defaultMode ? '$(check) ' : ''}${DOC_OPEN_LABELS[m]}`,
                description: m === cur.defaultMode ? 'current default' : '',
                mode: m
            })),
            { placeHolder: 'Default way to open report/answer .md links', ignoreFocusOut: true });
        if (!picked) { return; }
        const patch: { defaultMode: string; customCommand?: string; customArgs?: string } = { defaultMode: picked.mode };
        if (picked.mode === 'custom') {
            const cmd = await vscode.window.showInputBox({
                prompt: 'Custom app — executable or command to run', value: cur.customCommand,
                placeHolder: 'e.g. C:\\Program Files\\Typora\\Typora.exe', ignoreFocusOut: true
            });
            if (cmd === undefined) { return; }
            const args = await vscode.window.showInputBox({
                prompt: 'Arguments template — {file} is replaced by the file path', value: cur.customArgs || '{file}',
                placeHolder: '{file}', ignoreFocusOut: true
            });
            if (args === undefined) { return; }
            patch.customCommand = cmd; patch.customArgs = args;
        }
        docOpenStore.set(patch);
        QueuePanel.refreshIfOpen(); NoticesPanel.refreshIfOpen();
        void vscode.window.showInformationMessage(`Agent Farm: report/answer links now open in "${DOC_OPEN_LABELS[picked.mode]}".`);
    };
    registerDocOpenOps(bridge, {
        store: docOpenStore,
        onChange: () => { QueuePanel.refreshIfOpen(); NoticesPanel.refreshIfOpen(); }
    });

    // --- Notice ↔ Kuyruk shared plumbing (used by both panels + commands) ---
    // Convert a notice (or an answer to it) into a work-queue item, cross-linking
    // both boards. Default-deletes the source notice (else records the spawned
    // item ON the notice so the link stays visible).
    const convertNoticeToQueue = (a: { noticeId: string; text: string; deleteNotice: boolean }): void => {
        const title = noticesStore.titleOf(a.noticeId);
        const item = workQueueStore.add({ text: a.text, author: 'user', sourceNoticeId: a.noticeId, sourceNoticeTitle: title });
        if (a.deleteNotice) { noticesStore.dismiss(a.noticeId); }
        else { noticesStore.addSpawnedItem(a.noticeId, { itemId: item.id, text: item.text, ts: item.ts }); }
        QueuePanel.refreshIfOpen(); NoticesPanel.refreshIfOpen(); updateNoticesBadge();
    };

    // "Hand to agent": open an agent's terminal with the text PREFILLED on the
    // command line but NOT executed — the user reviews and presses Enter. Same
    // interactive form as a task launch (core/tasks.ts), sendText(..., false).
    const handoffToAgent = async (text: string, target?: string): Promise<void> => {
        let agent = target ? agents.find(a => a.name.toLowerCase() === target.toLowerCase()) : undefined;
        if (!agent) {
            const pick = await vscode.window.showQuickPick(agents.map(a => a.name), {
                placeHolder: `Which agent should handle this? — "${text.slice(0, 60)}"`, ignoreFocusOut: true
            });
            if (!pick) { return; }
            agent = agents.find(a => a.name === pick);
        }
        if (!agent) { return; }
        const oneLine = text.replace(/\r?\n/g, ' ').replace(/"/g, '\\"').slice(0, 2000);
        const terminal = vscode.window.createTerminal({ name: `AF: ${agent.name}`, cwd: agent.dir });
        terminal.show();
        terminal.sendText(`claude "${oneLine}"`, false);   // typed, NOT executed
        void vscode.window.showInformationMessage(`🔗 Opened ${agent.name} — the message is typed into the terminal (not sent). Review it and press Enter.`);
    };

    // Routing-target suggestions for the queue: the discovered agent names, plus
    // whatever the user configured in agentFarm.queue.targets (empty by default —
    // no product names are hardcoded; targets are free text anyway).
    const queueTargets = (): string[] => {
        const cfg = vscode.workspace.getConfiguration('agentFarm').get<string[]>('queue.targets') || [];
        return [...new Set([...cfg, ...agents.map(a => a.name)])];
    };
    const showQueuePanel = (focusItem?: string): void => QueuePanel.show({
        extensionUri: context.extensionUri,
        store: workQueueStore,
        targets: queueTargets,
        agentNames: () => agents.map(a => a.name),
        onChange: () => { updateNoticesBadge(); NoticesPanel.refreshIfOpen(); },
        openNotice: (noticeId) => showNoticesPanel(noticeId),
        handoff: (item) => { void handoffToAgent(item.text, item.target); },
        // Feature A — live status mirror of an agent-tracked item's delegation.
        missionStatus: (id) => {
            const r = missionStore.run(id);
            return r ? { status: r.status, title: missionStore.spec(r.specId)?.title } : undefined;
        },
        taskStatus: (id) => {
            const t = taskManager.tasks.find(x => x.id === id);
            return t ? { status: t.status, title: t.title } : undefined;
        },
        // Feature B — shared "open with".
        openDoc,
        docOpenConfig,
        configureDocOpen: () => { void configureDocOpen(); }
    }, focusItem);

    const showNoticesPanel = (focusNotice?: string): void => NoticesPanel.show({
        extensionUri: context.extensionUri,
        store: noticesStore,
        agentNames: () => agents.map(a => a.name),
        onChange: () => { updateNoticesBadge(); QueuePanel.refreshIfOpen(); },
        lastExportDir: () => context.globalState.get<string>('agentfarm.lastExportDir'),
        setLastExportDir: (dir: string) => { void context.globalState.update('agentfarm.lastExportDir', dir); },
        convertToQueue: convertNoticeToQueue,
        handoffNotice: (n) => { void handoffToAgent(n.title, n.agentName); },
        openQueueItem: (itemId) => showQueuePanel(itemId),
        // Feature B — shared "open with".
        openDoc,
        docOpenConfig,
        configureDocOpen: () => { void configureDocOpen(); }
    }, focusNotice);

    // ---------- Airtable Engine module ----------
    // Single source of truth: the module's own store file in globalStorage —
    // the Airtable page edits it, the MCP server re-reads it per tool call.

    const airtableStorage = context.globalStorageUri.fsPath;
    const extVersion = String((context.extension.packageJSON as { version?: string }).version ?? '0.0.0');
    try {
        stageMcpServer(context.extensionPath, airtableStorage, extVersion);
        const reg = registrationState(airtableStorage);
        if (reg.registered && !reg.upToDate) {
            // Self-heal: an old registration pins a versioned extension path
            // that dies on every update — repoint it to the staged copy.
            if (registerMcp(airtableStorage)) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: Airtable Engine MCP registration repointed to the version-independent staged copy '
                    + `(was: ${reg.currentPath ?? 'unknown path'}). New claude sessions use the staged server.`);
            }
        }
    } catch (e) {
        console.error('agentfarm: airtable module init failed', e);
    }

    // Airtable bridge ops (§19.C) — every page action, callable by agents.
    bridge.register([
        {
            op: 'airtable.status',
            describe: 'Airtable Engine module state: store (folders/defaults), MCP registration, staged server version. args: none',
            handler: () => airtablePageData(airtableStorage, extVersion)
        },
        {
            op: 'airtable.instances',
            describe: 'Discover engine instances from the configured folders and health-check each (alive, port, stats). args: none',
            handler: () => probeAirtableInstances(airtableStorage)
        },
        {
            op: 'airtable.config.get',
            describe: 'The module store (databaseRoots, mediaRoots, defaults, timeout). args: none',
            handler: () => loadStore(airtableStorage)
        },
        {
            op: 'airtable.config.set',
            describe: 'Patch the module store. args: databaseRoots? (string[]), mediaRoots? (string[]), defaultInstance?, defaultLang?, requestTimeoutMs?',
            handler: (args) => {
                const strList = (v: unknown) => Array.isArray(v) ? v.map(String).filter(Boolean) : undefined;
                const patch: Record<string, unknown> = {};
                const dbRoots = strList(args.databaseRoots);
                if (dbRoots) { patch.databaseRoots = dbRoots; }
                const mRoots = strList(args.mediaRoots);
                if (mRoots) { patch.mediaRoots = mRoots; }
                if (typeof args.defaultInstance === 'string') { patch.defaultInstance = args.defaultInstance.trim(); }
                if (typeof args.defaultLang === 'string') { patch.defaultLang = args.defaultLang.trim(); }
                if (typeof args.requestTimeoutMs === 'number') { patch.requestTimeoutMs = Math.max(1000, args.requestTimeoutMs); }
                need(Object.keys(patch).length, 'Nothing to set — pass at least one of the documented args.');
                const store = saveStore(airtableStorage, patch);
                AirtablePanel.refreshIfOpen();
                return { updated: Object.keys(patch), store };
            }
        },
        {
            op: 'airtable.register',
            describe: 'Register (or repoint) the user-scope airtable MCP in ~/.claude.json so every new claude session gets the airtable_* tools. args: none',
            handler: () => {
                stageMcpServer(context.extensionPath, airtableStorage, extVersion);
                need(registerMcp(airtableStorage), 'Could not write ~/.claude.json.');
                AirtablePanel.refreshIfOpen();
                return registrationState(airtableStorage);
            }
        },
        {
            op: 'airtable.unregister',
            describe: 'Remove the user-scope airtable MCP registration (folders and engine data untouched). args: none',
            handler: () => {
                need(unregisterMcp(), 'No airtable registration found (or ~/.claude.json not writable).');
                AirtablePanel.refreshIfOpen();
                return { registered: false };
            }
        }
    ]);

    const bridgeDir = path.join(context.globalStorageUri.fsPath, 'bridge');
    let bridgeBusy = false;
    const processBridge = async (): Promise<void> => {
        if (!taskRunner || bridgeBusy) { return; }
        bridgeBusy = true;
        try {
            fs.mkdirSync(bridgeDir, { recursive: true });
            for (const name of fs.readdirSync(bridgeDir)) {
                if (name.endsWith('.response.json')) {
                    // prune day-old responses nobody collected
                    try {
                        const f = path.join(bridgeDir, name);
                        if (Date.now() - fs.statSync(f).mtimeMs > 24 * 3600e3) { fs.unlinkSync(f); }
                    } catch { /* gone */ }
                    continue;
                }
                if (!name.endsWith('.request.json')) { continue; }
                const reqFile = path.join(bridgeDir, name);
                const resFile = path.join(bridgeDir, name.replace(/\.request\.json$/, '.response.json'));
                let outcome: { ok: boolean; result?: unknown; error?: string };
                let opName = '?';
                try {
                    const parsed = parseBridgeRequest(fs.readFileSync(reqFile, 'utf8'));
                    if ('error' in parsed) {
                        outcome = { ok: false, error: parsed.error };
                    } else {
                        opName = parsed.op;
                        outcome = await bridge.dispatch(parsed.op, parsed.args);
                    }
                } catch (e) {
                    outcome = { ok: false, error: String((e as Error).message).slice(0, 300) };
                }
                try { fs.writeFileSync(resFile, JSON.stringify(outcome, null, 2), 'utf8'); } catch { /* best-effort */ }
                try { fs.unlinkSync(reqFile); } catch { /* re-processed next pass; dispatch is idempotent-ish, accept */ }
                void vscode.window.showInformationMessage(
                    `Agent Farm bridge: ${opName} — ${outcome.ok ? 'ok' : 'error: ' + outcome.error}`);
            }
        } catch { /* dir unavailable — try next pass */ }
        bridgeBusy = false;
    };
    try {
        fs.mkdirSync(bridgeDir, { recursive: true });
        const bridgeWatcher = fs.watch(bridgeDir, () => {
            setTimeout(() => void processBridge(), 300); // let the writer finish
        });
        context.subscriptions.push({ dispose: () => { try { bridgeWatcher.close(); } catch { /* closed */ } } });
    } catch { /* fs.watch unavailable — the interval below still polls */ }
    const bridgeTimer = setInterval(() => void processBridge(), 30_000);
    context.subscriptions.push({ dispose: () => clearInterval(bridgeTimer) });
    void processBridge();

    /** Mission-scoped live block for the panel: agent statuses + hook events of
     *  the ACTIVE runs' participants only. undefined while nothing runs, so an
     *  idle Missions page costs nothing. */
    const missionLiveBlock = () => {
        const activeRuns = missionStore.runs.filter(r =>
            r.status === 'running' || r.status === 'waiting-approval' || r.status === 'waiting-user');
        if (!activeRuns.length) { return undefined; }
        const ids = new Set<string>();
        for (const r of activeRuns) {
            const sp = missionStore.spec(r.specId);
            if (sp) {
                ids.add(sp.leadAgentId);
                sp.team.forEach(m => ids.add(m.agentId));
            }
        }
        const byAgent: Record<string, { status: string; tool?: string; sessions: number }> = {};
        for (const id of ids) {
            const st = live.agentStatus(id);
            if (st) { byAgent[id] = st; }
        }
        const since = Math.min(...activeRuns.map(r => r.startedAt));
        return { agents: byAgent, events: missionLiveSlice(live.events(12 * 3600 * 1000), ids, since, 60) };
    };

    /** runId → planner-session transcript file, when the index has seen it —
     *  one click from the run header into the full lead conversation. */
    const missionPlannerTranscripts = () => {
        const map: Record<string, string> = {};
        if (!missionStore.runs.some(r => r.plannerSessionId)) { return map; }
        const byId = new Map(index.all().map(s => [s.sessionId, s.file]));
        for (const r of missionStore.runs) {
            const f = r.plannerSessionId ? byId.get(r.plannerSessionId) : undefined;
            if (f) { map[r.id] = f; }
        }
        return map;
    };

    /** Cost/token attribution lands on the TASK up to a minute after a step
     *  finishes — refresh each step from its task record at render time so the
     *  page shows the settled numbers without rewriting the store. Steps and
     *  runs recorded before tokens existed are backfilled from the session
     *  index (the delegate's matched transcript / the planner's own session). */
    const missionRunsForPanel = () => {
        const byTask = new Map(taskManager.tasks.map(t => [t.id, t]));
        const sessions = index.all();
        const bySessionFile = new Map(sessions.map(s => [s.file, s]));
        const bySessionId = new Map(sessions.map(s => [s.sessionId, s]));
        return [...missionStore.runs].sort((a, b) => b.startedAt - a.startedAt).map(run => {
            const ps = run.plannerSessionId ? bySessionId.get(run.plannerSessionId) : undefined;
            return {
                ...run,
                /** whole-planner-session total — the run-level fallback when
                 *  rounds carry no per-round planner tokens (pre-2.68 runs). */
                plannerSessionTokens: ps ? totalTokens(ps.usage) : undefined,
                rounds: run.rounds.map(round => ({
                    ...round,
                    steps: round.steps.map(step => {
                        const t = step.taskId ? byTask.get(step.taskId) : undefined;
                        if (!t) { return step; }
                        const sess = t.costSessionFile ? bySessionFile.get(t.costSessionFile) : undefined;
                        return {
                            ...step,
                            costUSD: step.costUSD ?? t.costUSD,
                            tokens: step.tokens ?? t.tokens ?? (sess ? totalTokens(sess.usage) : undefined),
                            outputFile: step.outputFile ?? t.outputFile
                        };
                    })
                }))
            };
        });
    };

    const missionsPanelDeps = {
        extensionUri: context.extensionUri,
        data: () => ({
            specs: missionStore.specs,
            runs: missionRunsForPanel(),
            agents: agents.map(a => ({ id: a.id, name: a.name })),
            // the user's model-name knowledge base feeds the model inputs
            modelAliases: cfg().get<string[]>('modelAliases', ['haiku', 'sonnet', 'opus', 'fable']),
            defaults: DEFAULT_MISSION_LIMITS,
            pending: {
                questions: [...missionQuestions.entries()].map(([runId, q]) => ({ runId, question: q.question })),
                approvals: [...missionApprovals.keys()]
            },
            live: missionLiveBlock(),
            plannerTranscripts: missionPlannerTranscripts()
        }),
        create: createMission,
        control: (action: 'pause' | 'unpause' | 'resume' | 'cancel', runId: string) => {
            if (action === 'pause') {
                const engine = missionEngines.get(runId);
                if (engine) { engine.pause(); }
                else {
                    // stale 'running' without an engine (shouldn't happen) — park it honestly
                    const run = missionStore.run(runId);
                    if (run && (run.status === 'running' || run.status === 'waiting-approval' || run.status === 'waiting-user')) {
                        run.status = 'paused';
                        run.now = undefined;
                    }
                }
                missionChanged();
            }
            else if (action === 'unpause') { missionEngines.get(runId)?.unpause(); missionChanged(); }
            else if (action === 'resume') { resumeMission(runId); }
            else { cancelMission(runId); }
        },
        answer: (runId: string, text: string) => { void answerMissionQuestion(runId, text); },
        settleApproval: (runId: string, ok: boolean) => {
            const id = missionApprovals.get(runId);
            if (id) { approvalQueue.settle(id, ok); }
        },
        pickFolder: async () => {
            const picked = await vscode.window.showOpenDialog({
                canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
                openLabel: 'Use as mission workdir'
            });
            return picked?.[0]?.fsPath;
        },
        // guarded to the extension's own storage — the page can only tail
        // archived task outputs, never arbitrary paths
        readTail: (file: string) =>
            normPath(file).startsWith(normPath(context.globalStorageUri.fsPath))
                ? readFileTail(file, 8192)
                : undefined,
        onDidChange: missionEmitter.event
    };

    // Hook events (tool starts, prompts, permissions…) repaint the OPEN Missions
    // page while a mission is in flight — throttled to 1/s, and gated on
    // missionEngines so an idle farm never pays for it.
    let missionLiveTimer: NodeJS.Timeout | undefined;
    live.onDidUpdate(() => {
        if (!missionEngines.size || missionLiveTimer) { return; }
        missionLiveTimer = setTimeout(() => {
            missionLiveTimer = undefined;
            MissionsPanel.refreshIfOpen();
        }, 1000);
    }, null, context.subscriptions);
    context.subscriptions.push({ dispose: () => { if (missionLiveTimer) { clearTimeout(missionLiveTimer); } } });

    // Sidebar twin of the Missions page: same store, same change event — runs
    // with their rounds/steps as a tree, pending waits as actionable rows.
    const missionsTree = new MissionsTreeProvider({
        runs: () => [...missionStore.runs].sort((a, b) => b.startedAt - a.startedAt),
        spec: id => missionStore.spec(id),
        question: runId => missionQuestions.get(runId)?.question,
        awaitingApproval: runId => missionApprovals.has(runId),
        onDidChange: missionEmitter.event
    });
    const missionNodeRun = (node?: MissionNode): MissionRun | undefined =>
        node && 'run' in node ? node.run : undefined;
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agentfarm.missions', missionsTree),
        vscode.commands.registerCommand('agentfarm.missionApprove', (node?: MissionNode) => {
            const run = missionNodeRun(node);
            const id = run ? missionApprovals.get(run.id) : undefined;
            if (id) { approvalQueue.settle(id, true); }
        }),
        vscode.commands.registerCommand('agentfarm.missionReject', (node?: MissionNode) => {
            const run = missionNodeRun(node);
            const id = run ? missionApprovals.get(run.id) : undefined;
            if (id) { approvalQueue.settle(id, false); }
        }),
        vscode.commands.registerCommand('agentfarm.missionAnswer', (node?: MissionNode) => {
            const run = missionNodeRun(node);
            if (run) { void answerMissionQuestion(run.id); }
        }),
        vscode.commands.registerCommand('agentfarm.missionPause', (node?: MissionNode) => {
            const run = missionNodeRun(node);
            if (!run) { return; }
            // second click withdraws a pause that hasn't taken effect yet
            const engine = missionEngines.get(run.id);
            if (run.pausePending) { engine?.unpause(); } else { engine?.pause(); }
            missionChanged();
        }),
        vscode.commands.registerCommand('agentfarm.missionResume', (node?: MissionNode) => {
            const run = missionNodeRun(node);
            if (run) { resumeMission(run.id); }
        }),
        vscode.commands.registerCommand('agentfarm.missionCancel', async (node?: MissionNode) => {
            const run = missionNodeRun(node);
            if (!run) { return; }
            const pick = await vscode.window.showWarningMessage(
                'Cancel this mission? Running delegations are cancelled too.',
                { modal: true }, 'Cancel mission');
            if (pick === 'Cancel mission') { cancelMission(run.id); }
        }),
        vscode.commands.registerCommand('agentfarm.missionRerun', async (node?: MissionNode) => {
            const run = missionNodeRun(node);
            const spec = run ? missionStore.spec(run.specId) : undefined;
            if (!run || !spec) { return; }
            const pick = await vscode.window.showWarningMessage(
                `Run mission "${spec.title}" again? Same goal, team and limits (max $${spec.limits.maxCostUSD}).`,
                { modal: true }, 'Run again');
            if (pick !== 'Run again') { return; }
            const rerun: MissionRun = {
                id: newMissionId(), specId: spec.id, status: 'running',
                rounds: [], ledger: [], totalCostUSD: 0, startedAt: Date.now()
            };
            missionStore.runs.push(rerun);
            missionChanged();
            launchMission(spec, rerun);
        }),
        vscode.commands.registerCommand('agentfarm.missionDelete', async (node?: MissionNode) => {
            const run = missionNodeRun(node);
            if (!run || (run.status !== 'done' && run.status !== 'failed' && run.status !== 'cancelled')) { return; }
            const spec = missionStore.spec(run.specId);
            const pick = await vscode.window.showWarningMessage(
                `Delete mission run "${spec?.title ?? run.id}" from the history? Archived task outputs stay.`,
                { modal: true }, 'Delete');
            if (pick !== 'Delete') { return; }
            missionStore.runs = missionStore.runs.filter(r => r.id !== run.id);
            if (spec && !missionStore.runs.some(r => r.specId === spec.id)) {
                missionStore.specs = missionStore.specs.filter(s => s.id !== spec.id);
            }
            missionChanged();
        }),
        vscode.commands.registerCommand('agentfarm.missionStepOutput', (node?: MissionNode) => {
            const file = node?.kind === 'step' ? node.step.outputFile : undefined;
            if (file) { void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file)); }
        })
    );

    // G1: the Needs You queue — live blockers + approvals + Antigravity drift.
    const buildRawNeeds = (): NeedItem[] => buildNeedsQueue({
        // labelOf adds "#k" when one agent runs several sessions, so two
        // waiting sessions of the same agent stay tellable apart in the queue.
        liveSessions: live.sessions().map(s => ({ ...s, agentName: live.labelOf(s) })),
        approvals: approvalQueue.list(),
        insights,
        // F1: cut runs live in the queue too — the startup toast is easy to miss.
        interruptedRuns: taskManager.interruptedRuns(),
        missionWaits: missionWaits()
    });

    // Cleared rows: the key stays only while its row is still produced, so a
    // clear ends by itself the moment the condition does (see needKey).
    const NEEDS_CLEARED_KEY = 'agentfarm.clearedNeeds';
    const clearedNeeds = () => context.globalState.get<Record<string, number>>(NEEDS_CLEARED_KEY, {});
    let hiddenNeedsCount = 0;
    const buildNeeds = (): NeedItem[] => {
        const stored = clearedNeeds();
        const res = filterDismissedNeeds(buildRawNeeds(), stored);
        if (res.staleKeys.length) {
            for (const k of res.staleKeys) { delete stored[k]; }
            void context.globalState.update(NEEDS_CLEARED_KEY, stored);
        }
        hiddenNeedsCount = res.hiddenCount;
        return res.visible;
    };
    /** Clear rows by key; `undefined` clears every clearable row on the page. */
    const clearNeeds = async (keys?: string[]): Promise<number> => {
        const stored = clearedNeeds();
        const targets = keys ?? buildNeeds().filter(isClearable).map(needKey);
        let n = 0;
        for (const k of targets) { if (!stored[k]) { stored[k] = Date.now(); n++; } }
        if (n) { await context.globalState.update(NEEDS_CLEARED_KEY, stored); needsEmitter.fire(); }
        return n;
    };
    const restoreNeeds = async (): Promise<number> => {
        const n = Object.keys(clearedNeeds()).length;
        if (n) { await context.globalState.update(NEEDS_CLEARED_KEY, {}); needsEmitter.fire(); }
        return n;
    };

    /**
     * ‼️ "developer is waiting for you" — and then you answered it.
     *
     * The reminder is a statement about a state ("this session is holding your
     * ball"), so the moment the state ends the line is simply false: you typed
     * a reply, you closed the session, the agent picked the turn back up. It is
     * the one notice on the board nobody should ever have to tidy up, because
     * the act that makes it obsolete IS the act of dealing with it.
     *
     * The test is the session's OWN status, not a memory of what the user did:
     * still waiting on you = the reminder stands; anything else (working, ended,
     * gone from the fleet entirely) = it is withdrawn. That covers every way out
     * — the Console, a terminal, the ✕ on the card, the process dying — without
     * this code having to enumerate them.
     */
    const retractAnsweredReminders = (): void => {
        const keys = Object.keys(context.globalState.get<Record<string, number>>(NEWS_KEY, {}));
        if (!keys.some(k => k.startsWith(IDLE_REMINDER_PREFIX))) { return; }
        const stale = staleReminderKeys(keys, live.sessions()
            .filter(s => s.status === 'waiting-input')
            .map(s => s.sessionId));
        for (const k of stale) { retractNews(k); }
    };
    // The live monitor hears the answer FIRST — hook events arrive while the
    // transcript on disk is still being written — so the withdrawal rides the
    // fleet's own beat rather than waiting for the next index pass.
    live.onDidUpdate(retractAnsweredReminders, null, context.subscriptions);

    // The four things that used to sit on Needs You with nothing to do about
    // them. Each is announced once, on the board built to hold announcements.
    postFarmNews = () => {
        const today = dayKey(Date.now());
        for (const ins of insights) {
            if (ins.category === 'budget' && ins.severity === 'error') {
                if (postNewsOnce(`budget:${today}:${ins.agentName}`, {
                    type: 'warning', level: 3,
                    title: `Budget exceeded — ${ins.agentName}`,
                    body: `${ins.message}\n\nToday's spend has passed the daily limit set for **${ins.agentName}**. `
                        + 'Nothing was stopped — the limit is a warning line, not a brake. '
                        + 'Raise it in `agentFarm.budgets`, or look at what spent it on the Dashboard.',
                    tags: ['budget']
                })) {
                    postForward('budget', `${ins.agentName} — ${ins.message}`);
                }
            } else if (ins.suggestionId) {
                postNewsOnce(`suggestion:${ins.suggestionId}`, {
                    type: 'suggestion', level: 2,
                    title: `Instruction suggestion — ${ins.agentName}`,
                    body: `${ins.message}\n\nReview it with **Agent Farm: Review Instruction Suggestions**; `
                        + 'it is applied to the agent\'s CLAUDE.md only if you accept it.',
                    tags: ['instructions']
                });
            }
        }
        for (const t of taskManager.tasks) {
            if (t.status !== 'queued' || !t.autoStart || !t.deferredReason) { continue; }
            postNewsOnce(`parked:${t.id}`, {
                type: 'update', level: 1,
                title: `Task parked — ${t.title}`,
                body: `**${t.agentName}** · ${t.deferredReason}\n\n`
                    + 'It starts by itself once the blocker clears; the Board has it if you want it sooner.',
                tags: ['tasks']
            });
        }
        // An idle session is not a blocker — but one left waiting all afternoon
        // is a loop that quietly never closed, so it earns a single line after a
        // grace period long enough that ordinary back-and-forth never trips it.
        const idleMin = Math.max(0, cfg().get<number>('idleSessionNoticeMinutes', 30));
        if (idleMin > 0) {
            const cutoff = Date.now() - idleMin * 60_000;
            for (const s of live.sessions()) {
                if (s.status !== 'waiting-input' || s.lastEventTs > cutoff) { continue; }
                postNewsOnce(`idle:${s.sessionId}`, {
                    type: 'reminder', level: 1,
                    title: `${live.labelOf(s)} is waiting for you`,
                    body: `The session finished its turn and has been idle for over ${idleMin} minutes.`
                        + (s.lastPrompt ? `\n\nLast prompt: ${s.lastPrompt}` : ''),
                    tags: ['sessions']
                });
            }
        }
        retractAnsweredReminders();
    };

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

    // Plan usage — the subscription limits Anthropic itself reports (what
    // /usage prints), cached behind one service so the dashboard card, its ⟳
    // and the bridge op all share a single request budget.
    //
    // ‼️ ONE BEAT, TWO WINDOWS. The figures move only while a turn is actually
    // RUNNING — an open session waiting for your next prompt spends nothing —
    // so the beat follows the fleet rather than the clock: seconds while an
    // agent is mid-turn (you are watching numbers that are moving), the user's
    // minutes when everything is idle. One function decides it (`refreshMs`),
    // and the service TTL, the status-bar indicator and the Dashboard card all
    // read that one decision, so no surface can be on a different beat.
    const fleetActive = () => live.activeTurns() > 0;
    const planBeatMs = () => refreshMs(
        fleetActive(),
        Math.max(0, cfg().get<number>('planUsageRefreshMinutes', 5)),
        Math.max(0, cfg().get<number>('planUsageActiveRefreshSeconds', 60)));
    const planBeat = () => ({ ms: planBeatMs(), active: fleetActive() });
    // …and the CLI version the request identifies itself with, which is what
    // decides WHICH rate-limit bucket the endpoint puts us in (see planusage.ts).
    // No `claude --version` is spawned for it: every transcript line carries the
    // version that wrote it, so the newest session already knows.
    const installedCliVersion = (): string | undefined => {
        let best: { ts: number; version: string } | undefined;
        for (const s of index.all()) {
            const ts = s.lastTs || s.mtime;
            if (s.version && (!best || ts > best.ts)) { best = { ts, version: s.version }; }
        }
        return best?.version;
    };
    // ‼️ The turn-boundary edge spends from the SAME budget as the beat: its
    // floor is the user's own active interval, so no two automatic reads are
    // ever closer than the number they configured. Read live, so changing the
    // setting changes both at once — the edge with a smaller floor than the beat
    // is what made a politely configured beat irrelevant (see planusage.ts).
    const planEdgeFloorMs = () => refreshMs(
        true, 1, Math.max(0, cfg().get<number>('planUsageActiveRefreshSeconds', 60)));
    const planUsage = new PlanUsageService({
        ttlMs: planBeatMs, edgeFloorMs: planEdgeFloorMs, cliVersion: installedCliVersion
    });

    // …and the two percentages that decide whether to start the next long turn,
    // permanently in the status bar rather than behind a page you have to open
    // (see PlanUsageBar). Same service, so it shares the one request budget.
    const planUsageBar = new PlanUsageBar({
        service: planUsage,
        enabled: () => cfg().get<boolean>('planUsageStatusBar', true),
        beatMs: planBeatMs,
        active: fleetActive,
        warnAt: () => cfg().get<number>('planUsageWarnPercent', 80),
        dangerAt: () => cfg().get<number>('planUsageDangerPercent', 95),
        // whatever the indicator just read goes to an open Dashboard card in
        // the same step: two surfaces on one beat can never drift apart
        onRefresh: snap => DashboardPanel.pushPlanUsage(snap, planBeat())
    });
    context.subscriptions.push(planUsageBar);
    // Every live hook event may have crossed the idle/active line; the bar acts
    // on the EDGE only — a turn starting and a turn ending each earn one
    // immediate read, the beat carries the rest.
    context.subscriptions.push(live.onDidUpdate(() => planUsageBar.fleetChanged()));

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
        quality: (agentId: string) => qualityStore.avgSince(agentId, 14 * 24 * 3600 * 1000),
        // Z1: honest activation card — which subsystems are live/idle/dormant.
        farmStatus: () => {
            const week = Date.now() - 7 * 24 * 3600 * 1000;
            const extBySource: Record<string, number> = {};
            for (const s of index.external()) {
                if (s.source) { extBySource[s.source] = (extBySource[s.source] ?? 0) + 1; }
            }
            return buildFarmStatus({
                listenerState: live.listenerState,
                eventsLast24h: live.events(24 * 3600 * 1000).length,
                taskCount: taskManager.tasks.length,
                tasksDone7d: taskManager.tasks.filter(t =>
                    t.status === 'done' && (t.endedAt ?? 0) >= week).length,
                scheduleCount: taskManager.schedules.length,
                triggerCount: taskManager.triggers.length,
                triggersFired7d: taskManager.triggers.filter(t => (t.lastFiredAt ?? 0) >= week).length,
                workflowCount: taskManager.workflows.length,
                workflowRuns7d: taskManager.workflowRuns(7 * 24 * 3600 * 1000).length,
                hasMediaKey: !!(vault.get(cfg().get<string>('mediaAuthSecret', 'FAL_KEY'))
                    || vault.get(cfg().get<string>('replicateAuthSecret', 'REPLICATE_API_TOKEN'))),
                mediaAssetCount: readMediaMetas(taskManager.outputsDir).length,
                mediaCostMonth: mediaCostSince(taskManager.outputsDir, 30 * 24 * 3600 * 1000),
                cliProfileCount: cfg().get<CliProfile[]>('cliProfiles', []).length,
                externalSessions: extBySource,
                ingestFolderCount: cfg().get<IngestFolder[]>('ingestFolders', [])
                    .filter(f => f && typeof f.path === 'string' && !!f.path.trim()).length,
                registeredAssetCount: readMediaMetas(taskManager.outputsDir)
                    .filter(m => (m.source ?? '').startsWith('external')).length,
                oversightLoopsOn: ['qualitySample', 'suggestScan', 'weeklySummary']
                    .filter(k => cfg().get<boolean>(k, false)).length,
                qualitySamples: qualityStore.scores.length,
                secretCount: vault.names().length,
                projectCount: projectDefs().length,
                web: { ...webCfg(), serving: !!webServer },
                chat: {
                    enabled: chatCfg().enabled,
                    hasToken: !!vault.get(TELEGRAM_SECRET),
                    allowedChats: chatCfg().allow.length
                }
            });
        },
        // Plan usage card: cached snapshot for the render, an explicit refresh
        // for the card's beat and its ⟳ button. The status-bar indicator reads
        // the same cache, so a refresh from here repaints it too — two surfaces
        // showing the same figure must never show two different ones.
        planUsage: () => planUsage.current(),
        refreshPlanUsage: async (force: boolean) => {
            const snap = await planUsage.get(force);
            planUsageBar.paint();
            return snap;
        },
        planUsageBeat: planBeat,
        // B1: the project axis — the card's rollup and the map the rows group by.
        projects: () => projectRollup(),
        agentProjects: () => agentProjectMap(
            agents.map(a => ({ id: a.id, name: a.name, dir: a.dir })), projectDefs()),
        projectStyle: (name: string) => projectStyleOf(name)
    };
    const detailDeps = {
        extensionUri: context.extensionUri,
        getAgents: () => agents,
        index,
        getInsights: () => insights,
        getPricing: () => pricing,
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
        launchTerminal: (name: string, cwd: string | undefined, command: string, sessionId?: string) =>
            launchClaudeTerminal(name, cwd, command, undefined, sessionId),
        // Owner agent for the viewer's "⌂ <agent>" button: the index's assignment
        // is authoritative; the cwd fallback covers sessions the index hasn't
        // scanned yet (same resolver the live monitor uses).
        agentForSession: (file: string, cwd?: string): { agentId: string; agentName: string } | undefined => {
            const s = index.all().find(x => x.file === file);
            let agent = s?.agentId ? agents.find(a => a.id === s.agentId) : undefined;
            if (!agent) {
                const r = resolveAgentByCwd(cwd ?? s?.cwd);
                agent = r.agentId ? agents.find(a => a.id === r.agentId) : undefined;
            }
            return agent ? { agentId: agent.id, agentName: agent.name } : undefined;
        },
        // Capture-now guard: never `--resume` a transcript the live monitor says
        // another claude process is still writing.
        isSessionLive: (sessionId: string) => live.sessions().some(s => s.sessionId === sessionId)
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
            case 'focus-terminal':
                void vscode.commands.executeCommand('agentfarm.focusSessionTerminal',
                    { sessionId: item.ref.sessionId });
                break;
            case 'interrupt':
                // agentName is resolved from the live monitor inside the command —
                // a needs row can carry a session-id stub instead of a real agent.
                void vscode.commands.executeCommand('agentfarm.interruptSession',
                    { sessionId: item.ref.sessionId });
                break;
            case 'sync-antigravity':
                await vscode.commands.executeCommand('agentfarm.syncAntigravity', { agentId: item.ref.agentId });
                break;
            case 'resume-run':
                if (item.ref.runId) { taskManager.resumeInterrupted(item.ref.runId); }
                break;
            case 'dismiss-run':
                if (item.ref.runId) { taskManager.dismissInterrupted(item.ref.runId); }
                break;
            case 'mission-answer':
                if (item.ref.missionRunId) { await answerMissionQuestion(item.ref.missionRunId); }
                break;
            case 'mission-resume':
                if (item.ref.missionRunId) { resumeMission(item.ref.missionRunId); }
                break;
            case 'mission-dismiss': {
                const run = item.ref.missionRunId ? missionStore.run(item.ref.missionRunId) : undefined;
                if (run && run.status === 'paused') {
                    run.status = 'cancelled';
                    run.endedAt = Date.now();
                    run.note = 'dismissed after interruption';
                    missionChanged();
                }
                break;
            }
            case 'open-missions':
                void vscode.commands.executeCommand('agentfarm.openMissions');
                break;
        }
    };

    const needsDeps = {
        extensionUri: context.extensionUri,
        buildItems: buildNeeds,
        onAction: handleNeedAction,
        onClear: clearNeeds,
        onRestore: restoreNeeds,
        // buildItems() runs first on every render, so this is the count for the
        // rows the page is showing — never a stale number from an earlier pass.
        hiddenCount: () => hiddenNeedsCount,
        onDidChange: needsEmitter.event
    };

    bridge.register([
        {
            op: 'needs.list',
            describe: 'The Needs You queue — ONLY rows the farm is stuck on (permission waits, '
                + 'approvals, missions with a question, cut runs, stalled sessions, Antigravity drift). '
                + 'Budgets/suggestions/parked tasks/idle sessions are not here; they are posted to Notices. args: none',
            handler: () => {
                const items = buildNeeds().map(i => ({ ...i, key: needKey(i), clearable: isClearable(i) }));
                return { items, blocking: blockingCount(items), hidden: hiddenNeedsCount };
            }
        },
        {
            op: 'needs.clear',
            describe: 'Hide Needs You rows. args: keys? (string[] from needs.list) | all? (true = every '
                + 'clearable row). A cleared row returns by itself if the same condition happens again; '
                + 'rows holding a waiting agent (browser-approval) cannot be cleared — answer them instead.',
            handler: async (args) => {
                const keys = Array.isArray(args.keys) ? args.keys.map(String).filter(Boolean) : undefined;
                need(keys?.length || args.all === true, 'Pass keys (string[]) or all:true.');
                return { cleared: await clearNeeds(args.all === true ? undefined : keys) };
            }
        },
        {
            op: 'needs.restore',
            describe: 'Bring every cleared Needs You row back. args: none',
            handler: async () => ({ restored: await restoreNeeds() })
        }
    ]);

    // F1 command bar, callable with prefilled text (used by the kanban board).
    const runCommandBar = async (prefill?: string): Promise<void> => {
        if (!agents.length) {
            void vscode.window.showWarningMessage('Agent Farm: no agents found — configure agentFarm.agentRoots first.');
            return;
        }
        const utterance = prefill ?? await vscode.window.showInputBox({
            prompt: 'What should happen? (natural language — one-off task, schedule or chain; Turkish input is fine)',
            placeHolder: 'e.g. run the psikolog weekly analysis tomorrow at 09:00, write the output to the vault',
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

    const tasksDeps = {
        extensionUri: context.extensionUri,
        manager: taskManager,
        getAgents: () => agents,
        allRecords: allTaskRecords,
        buildWaiting: () => buildNeeds().filter(i =>
            i.kind === 'permission' || i.kind === 'browser-approval' || i.kind === 'stalled'),
        runCommandText: (text: string) => runCommandBar(text),
        settleApproval: (id: string, ok: boolean) => approvalQueue.settle(id, ok),
        onDidChangeNeeds: needsEmitter.event,
        triggerManager,
        forecastDays: () => cfg().get<number>('forecastDays', 7),
        limits: () => ({
            global: cfg().get<number>('maxConcurrentTasks', 2),
            perAgent: cfg().get<number>('maxConcurrentPerAgent', 1)
        }),
        lastExportDir: () => context.globalState.get<string>('agentfarm.lastExportDir'),
        setLastExportDir: (dir: string) => { void context.globalState.update('agentfarm.lastExportDir', dir); }
    };

    needsEmitter.event(() => {
        NeedsPanel.refreshIfOpen();
        TasksPanel.refreshIfOpen();
        LivingPanel.refreshIfOpen();
    }, null, context.subscriptions);

    // ---- Living page: the farm's state assembled into loop-shaped signals ----

    /** Today's API-equivalent spend across the fleet. */
    const spendToday = (): number => {
        const d = new Date();
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return index.all().reduce((sum, s) => sum + (s.daily[day]?.cost ?? 0), 0);
    };

    const livingSnapshot = (): LivingInput => {
        const scheds = taskManager.schedules.map(s => ({
            id: s.id, title: s.title, enabled: s.enabled, hasGuard: !!s.fireIf?.kind,
            lastFiredAt: s.lastRunKey ? undefined : undefined, agentName: s.agentName,
            prompt: s.prompt
        }));
        const trigs = taskManager.triggers.map(t => ({
            id: t.id, title: t.title, enabled: t.enabled, hasGuard: !!t.fireIf?.kind,
            lastFiredAt: t.lastFiredAt,
            prompt: t.action.kind === 'workflow' ? '' : t.action.prompt
        }));
        // Schedules do not stamp a timestamp, only a run key — the automation log
        // is the honest source for "when did this last actually fire".
        const lastFired = new Map<string, number>();
        for (const ev of taskManager.automationLog) {
            if (ev.outcome === 'fired') { lastFired.set(ev.id, ev.ts); }
        }
        const automations = [...scheds, ...trigs].map(a => ({
            ...a, lastFiredAt: lastFired.get(a.id) ?? a.lastFiredAt
        }));
        const budgets = cfg().get<Record<string, number>>('budgets', {});
        return {
            notices: noticesStore.list({ limit: 0 }),
            queue: workQueueStore.list({ limit: 0 }),
            automations,
            duties: wireDuties(
                agents.flatMap(a => (a.duties ?? []).map(d => ({
                    agentName: a.name, title: d.title, cadence: d.cadence, paused: d.paused
                }))),
                automations),
            automationLog: taskManager.automationLog,
            checks: [],
            gateReason: taskManager.automationGate(new Date())?.reason,
            spendToday: spendToday(),
            budgetToday: budgets['*'] || undefined,
            queueStaleHours: cfg().get<number>('queue.maxAgeHours', 24),
            noticeStaleHours: cfg().get<number>('noticeStaleHours', 24),
            preconditionDeps: {
                queueWorkCount: () => workQueueStore.list({ limit: 0 })
                    .filter(i => i.status === 'captured' || i.status === 'grouped' || i.status === 'blocked').length
            }
        };
    };

    const livingDeps = {
        extensionUri: context.extensionUri,
        snapshot: livingSnapshot,
        onDidChange: livingEmitter.event,
        checks: () => cfg().get<LivingCheck[]>('livingChecks', [])
    };
    taskManager.onDidChange(() => livingEmitter.fire(), null, context.subscriptions);

    let pendingMerge: { name: string; files: string[] } | undefined;

    type AgentArg = { agentId?: string; agent?: AgentInfo } | undefined;

    /** One record per session launch — lets Focus Session Terminal land on the
     *  exact window instead of guessing by agent name (two concurrent sessions
     *  of one agent share the name). Integrated terminals are held by object;
     *  external windows by their pinned, per-launch-unique wt title. sessionId
     *  is bound right at launch when known (resume / external CLI), otherwise
     *  by the live monitor when a new session with the same cwd shows up. */
    interface TermBinding {
        title: string; cwd?: string; term?: vscode.Terminal; launchedAt: number; sessionId?: string;
        /** the active project when this terminal was launched — see the stamp */
        projectId?: string;
    }
    const termBindings: TermBinding[] = [];
    // persisted so a fresh "#n" never collides with a window from the previous run
    let launchSeq = context.globalState.get<number>('agentfarm.termLaunchSeq', 0);

    /** Claude session terminals (start/continue/resume) honor agentFarm.externalTerminal —
     *  long TUI sessions can escape xterm.js rendering glitches. Farm tasks stay integrated
     *  (their lifecycle is tracked via terminal close events). */
    // Returns the created terminal (undefined in external-terminal mode) so the
    // E2a lifecycle watcher can track external-CLI sessions; existing callers
    // ignore the return value, so claude behaviour is unchanged. `env` (E2b)
    // is only passed for external-CLI sessions — claude terminals get none.
    const launchClaudeTerminal = (
        name: string, cwd: string | undefined, command: string,
        env?: Record<string, string>, sessionId?: string, project?: string
    ): vscode.Terminal | undefined => {
        launchSeq += 1;
        void context.globalState.update('agentfarm.termLaunchSeq', launchSeq);
        // "#n" makes the terminal/window title unique per launch — "claude: dev"
        // alone can't tell session #1's window from session #3's.
        const title = `${name} #${launchSeq}`;
        if (termBindings.length > 200) { termBindings.splice(0, termBindings.length - 200); }
        // The stamp is taken HERE, when the terminal is launched — not when the
        // session id turns up minutes later, by which time the active project
        // may be something else entirely. `project` overrides it for ONE launch
        // (an agent asking for a specific one over the bridge): undefined means
        // inherit the window's, '' means explicitly no project.
        const projectId = (project !== undefined ? project : activeProjectId()) || undefined;
        if (cfg().get<boolean>('externalTerminal', false)) {
            // title pinned so agentfarm.focusSessionTerminal can find the window later
            openExternalTerminal(cwd, command, title);
            termBindings.push({ title, cwd, launchedAt: Date.now(), sessionId, projectId });
            if (sessionId && projectId) { stampSessionProject(sessionId, projectId); }
            return undefined;
        }
        const terminal = vscode.window.createTerminal({ name: title, cwd, env });
        termBindings.push({ title, cwd, term: terminal, launchedAt: Date.now(), sessionId, projectId });
        if (sessionId && projectId) { stampSessionProject(sessionId, projectId); }
        terminal.show();
        terminal.sendText(command, true);
        return terminal;
    };

    // ---------- A1: what a session starts WITH ----------
    // Until now every session started as a bare `claude` and the model, the
    // effort, the permission mode and the first prompt were typed into the
    // terminal by hand. Two levels fix that: settings that apply to EVERY
    // launch (here), and the launcher picker that overrides them for one.
    const launchDefaults = (): LaunchDefaults => {
        const d = cfg().get<LaunchDefaults>('launchDefaults', {}) ?? {};
        return {
            model: (d.model ?? '').trim(),
            effort: (d.effort ?? '').trim(),
            permissionMode: (d.permissionMode ?? '').trim()
        };
    };

    /** Build + launch one claude session. Defaults fill whatever the caller
     *  left open; an invalid value is reported here rather than in a terminal
     *  the user then has to read. Returns the command line that ran. */
    const startClaudeSession = (
        agent: AgentInfo, o: LaunchOptions = {}, sessionId?: string, cwd?: string,
        project?: string
    ): string | undefined => {
        const merged = withDefaults(o, launchDefaults());
        const errors = validateLaunch(merged);
        if (errors.length) {
            void vscode.window.showWarningMessage(`Agent Farm: ${errors.join(' · ')}`);
            return undefined;
        }
        // The project is resolved ONCE and used for both halves of the launch —
        // what the session is TOLD (the context file) and what it is FILED under
        // (the stamp). Two reads of `activeProjectId()` could land either side
        // of a change and file a session under a project it was never told about.
        const projectId = project !== undefined ? project : activeProjectId();
        // A terminal session gets the same project context a Console one does —
        // including on a resume, where the flag is not inherited (measured).
        const command = buildLaunchCommand('claude', {
            ...merged,
            projectContextFile: merged.projectContextFile
                ?? projectContextFileFor(projectId || undefined)
        });
        // Terminal name stays "claude: <agent>" — agentfarm.focusSessionTerminal
        // and the interrupt resolver both find windows by that exact shape.
        launchClaudeTerminal(`claude: ${agent.name}`, cwd ?? agent.dir, command,
            undefined, sessionId, projectId);
        // A named launch should show its name in the panel within seconds, not
        // at the next quiet scan: the CLI writes its session file a moment
        // after boot, so look twice while the user is still watching. The name
        // is remembered as ours, so it is adopted even on a CLI build that does
        // not mark where a name came from.
        if (merged.name?.trim()) {
            rememberLaunchName(merged.name);
            for (const ms of [2500, 6000]) { setTimeout(scanCliSessionNames, ms); }
        }
        return command;
    };

    // Claude only announces its session id via hook events after the terminal is
    // already running — bind each new live session to the launch it came from:
    // same cwd, session started after the launch (5 min window absorbs slow
    // starts but keeps stale launch records from grabbing later sessions),
    // oldest unbound launch wins (FIFO for same-cwd bursts).
    live.onDidUpdate(() => {
        const bound = new Set(termBindings.map(b => b.sessionId).filter(Boolean));
        const unbound = live.sessions()
            .filter(s => s.cwd && !bound.has(s.sessionId))
            .sort((a, b) => a.startedAt - b.startedAt);
        for (const s of unbound) {
            const n = normPath(s.cwd!);
            const hit = termBindings.find(b => !b.sessionId && b.cwd && normPath(b.cwd) === n
                && s.startedAt >= b.launchedAt - 5000 && s.startedAt <= b.launchedAt + 300000);
            if (hit) {
                hit.sessionId = s.sessionId;
                // The session this launch was waiting for finally has an id —
                // the only moment a terminal session can be filed under the
                // project it was started in.
                if (hit.projectId) { stampSessionProject(s.sessionId, hit.projectId); }
            }
        }
    }, null, context.subscriptions);

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

    /**
     * resolveAgent's sibling for sessions: turn whatever a caller hands over
     * into a SessionInfo.
     *
     * Session actions are reached from a dozen surfaces and each knows a
     * different amount. A tree row passes the whole SessionInfo (Agents wraps it
     * as `{kind:'session', session}`); a Console card passes its own identity
     * keys; a Turns row knows the session id; a search hit knows only the
     * transcript path. Resolving that here — instead of in eleven command
     * handlers — is what lets a surface publish only what it has and still get
     * the complete right-click menu (see media/afSessionCtx.js).
     *
     * The index is the authority on a session's figures; the caller's own
     * `title`/`cwd`/`agentName` win over it, because a row that was just
     * renamed is newer than the last scan.
     */
    interface SessionRef {
        session?: SessionInfo;
        sessionId?: string;
        file?: string;
        title?: string;
        cwd?: string;
        agentName?: string;
    }
    const sessionFromArg = (arg?: SessionRef | SessionInfo | string): SessionInfo | undefined => {
        if (!arg) { return undefined; }
        if (typeof arg === 'string') {
            return index.all().find(s => s.sessionId === arg || s.file === arg);
        }
        const ref: SessionRef & Partial<SessionInfo> =
            'session' in arg && (arg as SessionRef).session ? (arg as SessionRef).session! : arg;
        const found = ref.sessionId
            ? index.all().find(s => s.sessionId === ref.sessionId)
            : ref.file ? index.all().find(s => s.file === ref.file) : undefined;
        if (!found) {
            // Not indexed (a brand-new Console session, an external transcript):
            // hand back what the caller knew — the handlers already cope with a
            // partial session, and inventing one would be worse.
            return ref.sessionId || ref.file ? ref as SessionInfo : undefined;
        }
        return {
            ...found,
            ...(ref.title ? { title: ref.title } : {}),
            ...(ref.cwd ? { cwd: ref.cwd } : {}),
            ...(ref.agentName ? { agentName: ref.agentName } : {})
        };
    };

    // ---------- A1: the launcher ----------
    // One picker that stays open: every row is a dimension of the launch, the
    // top row is the trigger, and its description is the EXACT command line
    // that will run. Nothing is hidden behind a flag the user can't see.
    const LAST_LAUNCH_KEY = 'agentfarm.lastLaunch';
    const lastLaunch = () => context.globalState.get<Record<string, LaunchOptions>>(LAST_LAUNCH_KEY, {});

    /** Sub-picker for one dimension. Cancelling keeps the current value;
     *  "Other…" accepts anything the installed CLI might know that we don't. */
    const pickChoice = async (
        placeHolder: string, choices: LaunchChoice[], current: string, allowCustom: boolean
    ): Promise<string | undefined> => {
        interface Item extends vscode.QuickPickItem { id: string; custom?: boolean }
        const items: Item[] = choices.map(c => ({
            label: (c.id === current ? '$(check) ' : '$(blank) ') + c.label,
            description: c.detail,
            id: c.id
        }));
        if (allowCustom) {
            items.push({
                label: '$(edit) Other…', id: '',
                description: 'type a value the picker does not list', custom: true
            });
        }
        const pick = await vscode.window.showQuickPick(items, { placeHolder, ignoreFocusOut: true });
        if (!pick) { return undefined; }
        if (pick.custom) {
            const typed = await vscode.window.showInputBox({
                prompt: placeHolder, value: current, ignoreFocusOut: true
            });
            return typed === undefined ? undefined : typed.trim();
        }
        return pick.id;
    };

    const launchProfiles = (): LaunchProfile[] =>
        (cfg().get<LaunchProfile[]>('launchProfiles', []) ?? []).filter(p => p?.name);

    const runLauncher = async (
        agent: AgentInfo, seed: LaunchOptions, surface: RunSurface = 'terminal'
    ): Promise<void> => {
        let o: LaunchOptions = { ...seed };
        let where: RunSurface = surface;
        const show = (v: string | undefined, empty = 'default') => (v?.trim() ? v.trim() : empty);
        for (;;) {
            const merged = withDefaults(o, launchDefaults());
            const command = buildLaunchCommand('claude', merged);
            const d = launchDefaults();
            const inherited = (own: string | undefined, def: string | undefined) =>
                !own?.trim() && def?.trim() ? ' (from your defaults)' : '';
            interface Row extends vscode.QuickPickItem { act?: string }
            const rows: Row[] = [
                {
                    label: '$(rocket) Start',
                    // In the Console the command line is not what runs (the panel
                    // spawns its own streaming session), so printing it would be
                    // a lie about the exact thing this row exists to be honest about.
                    description: where === 'console' ? describeLaunch(merged) : command,
                    detail: where === 'console'
                        ? `runs in ${agent.dir}, hosted in the Console panel`
                        : `runs in ${agent.dir}`,
                    act: 'start'
                },
                { label: 'Session', kind: vscode.QuickPickItemKind.Separator },
                {
                    label: '$(hubot) Agent', description: agent.name,
                    detail: 'which folder the session opens in', act: 'agent'
                },
                // WHERE is a dimension of the launch like the model is — the
                // launcher used to decide it silently (always a terminal).
                {
                    label: '$(window) Where',
                    description: where === 'console' ? 'the Console panel' : 'a terminal',
                    detail: where === 'console'
                        ? 'the conversation stays in Agent Farm; the name is applied once the session reports its id'
                        : 'a real claude terminal — the full TUI, slash commands, /resume',
                    act: 'where'
                },
                // WHICH PROJECT is a dimension too, and the launcher was the one
                // start path that did not show it — see pickRunSurface.
                activeProjectRow(),
                {
                    label: '$(star-full) Model', description: show(merged.model) + inherited(o.model, d.model),
                    detail: 'from your agentFarm.modelAliases list — --model', act: 'model'
                },
                {
                    label: '$(zap) Effort', description: show(merged.effort) + inherited(o.effort, d.effort),
                    detail: 'how much reasoning per turn — --effort', act: 'effort'
                },
                {
                    label: '$(shield) Permissions',
                    description: show(merged.permissionMode) + inherited(o.permissionMode, d.permissionMode),
                    detail: 'what it may do without asking — --permission-mode', act: 'perm'
                },
                {
                    label: '$(tag) Session name', description: show(o.name, '—'),
                    detail: 'shown in the prompt box, the /resume picker and the terminal title — -n', act: 'name'
                },
                {
                    label: '$(comment-discussion) First prompt', description: show(o.prompt, '—'),
                    detail: 'sent as the opening message instead of an empty session', act: 'prompt'
                },
                { label: 'Setup', kind: vscode.QuickPickItemKind.Separator },
                ...(launchProfiles().length ? [{
                    label: '$(bookmark) Load a profile…',
                    description: launchProfiles().map(p => p.name).join(' · '),
                    detail: 'agentFarm.launchProfiles', act: 'load'
                } as Row] : []),
                {
                    label: '$(save) Save this as a profile…', description: '',
                    detail: 'so tomorrow it is two clicks', act: 'save'
                },
                {
                    label: '$(settings-gear) Make model/effort/permissions my defaults', description: '',
                    detail: 'agentFarm.launchDefaults — applied to every session, including Continue and Resume',
                    act: 'default'
                }
            ];
            const pick = await vscode.window.showQuickPick(rows, {
                placeHolder: `Start a session for ${agent.name} — ${describeLaunch(merged)}`,
                ignoreFocusOut: true, matchOnDescription: true
            });
            if (!pick?.act) { return; } // Esc anywhere = launch nothing
            if (pick.act === 'start') {
                if (where === 'console') {
                    const errors = validateLaunch(merged);
                    if (errors.length) {
                        void vscode.window.showWarningMessage(`Agent Farm: ${errors.join(' · ')}`);
                        continue; // invalid value — the picker stays up
                    }
                    startConsoleSession(agent, o);
                } else {
                    const ran = startClaudeSession(agent, o);
                    if (!ran) { continue; } // invalid value — the picker stays up
                }
                const remembered = {
                    ...lastLaunch(),
                    [agent.id]: { model: o.model, effort: o.effort, permissionMode: o.permissionMode }
                };
                await context.globalState.update(LAST_LAUNCH_KEY, remembered);
                await context.globalState.update(SURFACE_KEY, where);
                return;
            }
            if (pick.act === 'where') {
                // no project row in the sub-picker: this picker already has one,
                // and the same question asked twice is the same answer twice
                const v = await pickRunSurface(`Session for ${agent.name}`);
                if (v) { where = v; }
                continue;
            }
            if (pick.act === 'project') {
                await chooseActiveProject(`Project for ${agent.name}'s session`);
                continue;
            }
            if (pick.act === 'agent') {
                const next = await resolveAgent(undefined);
                if (next) { agent = next; }
                continue;
            }
            if (pick.act === 'model') {
                const v = await pickChoice('Model for this session',
                    modelChoices(cfg().get<string[]>('modelAliases', [])), merged.model ?? '', true);
                if (v !== undefined) { o.model = v; }
                continue;
            }
            if (pick.act === 'effort') {
                const v = await pickChoice('Reasoning effort for this session',
                    EFFORT_CHOICES, merged.effort ?? '', false);
                if (v !== undefined) { o.effort = v; }
                continue;
            }
            if (pick.act === 'perm') {
                const v = await pickChoice('What may this session do without asking?',
                    PERMISSION_CHOICES, merged.permissionMode ?? '', false);
                if (v !== undefined) { o.permissionMode = v; }
                continue;
            }
            if (pick.act === 'name') {
                const v = await vscode.window.showInputBox({
                    prompt: 'Session name (empty = none)', value: o.name ?? '', ignoreFocusOut: true
                });
                if (v !== undefined) { o.name = v.trim(); }
                continue;
            }
            if (pick.act === 'prompt') {
                const v = await vscode.window.showInputBox({
                    prompt: 'First prompt (empty = start with an empty session)',
                    value: o.prompt ?? '', ignoreFocusOut: true
                });
                if (v !== undefined) { o.prompt = v.trim(); }
                continue;
            }
            if (pick.act === 'load') {
                const p = await vscode.window.showQuickPick(
                    launchProfiles().map(p => ({
                        label: p.name, description: describeLaunch(p), profile: p
                    })), { placeHolder: 'Load which profile?', ignoreFocusOut: true });
                if (p) {
                    o = {
                        ...o, model: p.profile.model ?? '', effort: p.profile.effort ?? '',
                        permissionMode: p.profile.permissionMode ?? '',
                        prompt: p.profile.prompt ?? o.prompt
                    };
                }
                continue;
            }
            if (pick.act === 'save') {
                const name = await vscode.window.showInputBox({
                    prompt: 'Profile name', ignoreFocusOut: true
                });
                if (!name?.trim()) { continue; }
                const next: LaunchProfile[] = [
                    ...launchProfiles().filter(p => p.name !== name.trim()),
                    {
                        name: name.trim(), model: merged.model, effort: merged.effort,
                        permissionMode: merged.permissionMode, ...(o.prompt ? { prompt: o.prompt } : {})
                    }
                ];
                try {
                    await cfg().update('launchProfiles', next, vscode.ConfigurationTarget.Global);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: profile "${name.trim()}" saved (agentFarm.launchProfiles).`);
                } catch (e) {
                    void vscode.window.showWarningMessage(
                        `Agent Farm: could not write agentFarm.launchProfiles — ${String(e)}`);
                }
                continue;
            }
            if (pick.act === 'default') {
                try {
                    await cfg().update('launchDefaults', {
                        model: merged.model ?? '', effort: merged.effort ?? '',
                        permissionMode: merged.permissionMode ?? ''
                    }, vscode.ConfigurationTarget.Global);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: every session now starts with ${describeLaunch({
                            model: merged.model, effort: merged.effort, permissionMode: merged.permissionMode
                        })} (agentFarm.launchDefaults).`);
                } catch (e) {
                    void vscode.window.showWarningMessage(
                        `Agent Farm: could not write agentFarm.launchDefaults — ${String(e)}`);
                }
                continue;
            }
        }
    };

    // The Studio's dependencies: the asset archive, the manifests in the agent
    // folders, what is watched, what it may cost, and which provider keys exist
    // (never the keys themselves — that stays inside the vault).
    const studioDeps = {
        extensionUri: context.extensionUri,
        tasks: taskManagerRef as TaskManager,
        getAgents: () => agents,
        ingestFolders: () => cfg().get<{ path?: string; agent?: string }[]>('ingestFolders', []) ?? [],
        mediaBudget: () => cfg().get<number>('mediaBudgetMonthUSD', 0),
        providerKeys: () => ({
            fal: !!vault.get(cfg().get<string>('mediaAuthSecret', 'FAL_KEY')),
            replicate: !!vault.get(cfg().get<string>('replicateAuthSecret', 'REPLICATE_API_TOKEN'))
        })
    };

    // ---------- DALGA 1: the Console's session host ----------
    // Long-lived claude processes this window owns, spoken to over the CLI's
    // streaming JSON channel. They deliberately outlive the panel tab (closing
    // a tab must not kill a conversation) and die with the window.
    // The second argument is what makes "End session" end the right process:
    // the CLI's registry names the `claude` itself, while the child we hold is
    // only the shell that started it (see ConsoleHost.close).
    const consoleHost = new ConsoleHost(
        () => 'claude',
        sid => ownerOf(readCliSessions(claudeDir()), sid)?.pid,
        () => activeProjectId() || undefined,
        projectContextFileFor);
    context.subscriptions.push({ dispose: () => consoleHost.dispose() });
    context.subscriptions.push(consoleHost.onChange(id => {
        // The first change that carries an id is the earliest a hosted session
        // can be filed — see stampSessionProject. A RESUME is not filed: it
        // already belongs somewhere (ConsoleSessionState.resumed).
        const s = consoleHost.get(id);
        if (s?.sessionId && s.projectId && !s.resumed) {
            stampSessionProject(s.sessionId, s.projectId);
        }
        ConsolePanel.refreshIfOpen();
    }));

    /**
     * Remember which sessions the Console hosted.
     *
     * Their transcripts say `sdk-cli` — the same thing a headless task run says
     * — so without this list a conversation held in the panel is filed as
     * automation and never appears in the Sessions tables, the dashboards or
     * the Turns page, all of which default to the User scope. The list is kept
     * in globalStorage (a reload must not lose it), capped, and handed to the
     * index, which re-files the sessions and tells every open page.
     */
    const consoleIdsFile = path.join(context.globalStorageUri.fsPath, 'console-sessions.json');
    const readConsoleIds = (): string[] => {
        try {
            const j = JSON.parse(fs.readFileSync(consoleIdsFile, 'utf8')) as { ids?: unknown };
            return Array.isArray(j.ids) ? j.ids.filter((x): x is string => typeof x === 'string') : [];
        } catch { return []; }
    };
    let consoleIds = readConsoleIds();
    index.setConsoleSessions(consoleIds);

    /**
     * Where you were when the last window went away.
     *
     * A hosted session belongs to its window: closing VS Code ends the `claude`
     * process (leaving it orphaned is the leak 3.29.1 was about, and nothing
     * would be reading it anyway). Measured with the real CLI: `--resume` picks
     * the SAME session back up — same id, same transcript, and the model still
     * remembers — so ending it costs nothing except *knowing where you were*.
     * That is what this file keeps: the sessions this window hosted, written as
     * they run, so the next window can put them back on top of the Console
     * instead of leaving you to find them among every recent transcript.
     * A crash or a power cut is covered by the same file, for the same reason.
     */
    interface LastWindowRow {
        sessionId: string; agentName: string; title: string; cwd: string; endedAt: number;
    }
    const lastWindowFile = path.join(context.globalStorageUri.fsPath, 'console-last-window.json');
    const readLastWindow = (): LastWindowRow[] => {
        try {
            const j = JSON.parse(fs.readFileSync(lastWindowFile, 'utf8')) as { rows?: LastWindowRow[] };
            const rows = Array.isArray(j.rows) ? j.rows : [];
            // a fortnight is long enough to come back to a conversation, short
            // enough that the shelf never becomes a second session list
            const cutoff = Date.now() - 14 * 24 * 3600_000;
            return rows.filter(r => r && typeof r.sessionId === 'string' && (r.endedAt ?? 0) > cutoff);
        } catch { return []; }
    };
    /** Rows from the PREVIOUS window, read once at startup and then only edited. */
    let lastWindow: LastWindowRow[] = readLastWindow();
    const writeLastWindow = (rows: LastWindowRow[]): void => {
        try {
            fs.mkdirSync(path.dirname(lastWindowFile), { recursive: true });
            fs.writeFileSync(lastWindowFile, JSON.stringify({ rows }, null, 1), 'utf8');
        } catch { /* the shelf is a convenience — never break a session over it */ }
    };
    const forgetLastWindow = (sessionId: string): void => {
        lastWindow = lastWindow.filter(r => r.sessionId !== sessionId);
        writeLastWindow(lastWindow);
    };
    /**
     * Written while the sessions RUN, not at shutdown: a crash, a power cut or a
     * killed window never gets to run our cleanup, and those are exactly the
     * cases this exists for.
     */
    const rememberOpenConsoleSessions = (): void => {
        const live = consoleHost.list().filter(s => s.sessionId && s.status !== 'ended' && s.status !== 'error');
        const rows: LastWindowRow[] = live.map(s => ({
            sessionId: s.sessionId as string,
            agentName: s.agentName,
            title: index.all().find(x => x.sessionId === s.sessionId)?.title ?? '',
            cwd: s.cwd,
            endedAt: Date.now()
        }));
        // keep what the previous window left AND what this one is hosting; a row
        // is dropped only when it is resumed or dismissed
        const merged = [...rows];
        for (const old of lastWindow) {
            if (!merged.some(r => r.sessionId === old.sessionId)) { merged.push(old); }
        }
        writeLastWindow(merged.slice(0, 30));
    };
    const rememberConsoleSessions = (): void => {
        const known = new Set(consoleIds);
        let added = false;
        for (const s of consoleHost.list()) {
            if (s.sessionId && !known.has(s.sessionId)) { known.add(s.sessionId); added = true; }
        }
        if (!added) { return; }
        consoleIds = [...known].slice(-2000);   // ids only; a session is ~40 bytes
        try {
            fs.writeFileSync(consoleIdsFile, JSON.stringify({ ids: consoleIds }, null, 1), 'utf8');
        } catch { /* the index still has it for this window */ }
        index.setConsoleSessions(consoleIds);
    };
    /**
     * "Your turn" — told once, when the turn ends and you are NOT watching it.
     *
     * A hosted session can run for minutes while you work somewhere else, and
     * the panel's own signals (the card, the tab count) only reach you if you
     * are looking at the Console. This is the one that travels. Deliberately
     * narrow, because a notice that fires when you can already see the answer
     * is how a useful notice turns into noise:
     *   · never for the conversation on your screen right now,
     *   · never for a turn you interrupted or that failed — you were there,
     *   · one per turn, carrying what the turn cost, and a button that takes
     *     you to it.
     * Off with `agentFarm.notifyConsoleTurnEnd`.
     */
    const prevConsoleStatus = new Map<string, string>();
    const announceFinishedTurns = (): void => {
        for (const s of consoleHost.list()) {
            const was = prevConsoleStatus.get(s.id);
            prevConsoleStatus.set(s.id, s.status);
            if (was !== 'working' || s.status !== 'idle') { continue; }
            if (!cfg().get<boolean>('notifyConsoleTurnEnd', true)) { continue; }
            if (ConsolePanel.isWatching(s.id)) { continue; }
            const last = [...s.messages].reverse().find(m => m.role === 'result');
            if (last?.isError) { continue; }
            const bits = [
                last?.ms ? (last.ms >= 60000 ? `${Math.round(last.ms / 6000) / 10}m` : `${Math.round(last.ms / 1000)}s`) : '',
                last?.tokens ? `${Math.round(last.tokens / 100) / 10}k tokens` : '',
                last?.cost ? `$${last.cost.toFixed(2)}` : ''
            ].filter(Boolean).join(' · ');
            void vscode.window.showInformationMessage(
                `Agent Farm — ${s.agentName} is waiting for you${bits ? ` (${bits})` : ''}.`,
                'Open the Console'
            ).then(pick => {
                if (pick) { ConsolePanel.show(consoleDeps, { sessionId: s.id }); }
            });
        }
    };

    /**
     * Which EXTENSION HOST is reading which hosted session, right now.
     *
     * Without this, "a leftover of ours" and "a session the OTHER VS Code
     * window is having a conversation in" look identical from here: both are
     * `sdk-cli`, both are ours by session id, and neither is hosted by this
     * window. Offering to end the second one would kill a live conversation
     * somebody is in — so the claim "nothing is reading it" has to be checked,
     * not assumed. Each window writes its own entry under its extension-host
     * pid; a window that is gone leaves a pid that no longer exists, which is
     * exactly what a leftover is.
     */
    interface HostingEntry { beat: number; sessionIds: string[] }
    const hostingFile = path.join(context.globalStorageUri.fsPath, 'console-hosting.json');
    const readHosting = (): Record<string, HostingEntry> => {
        try {
            const j = JSON.parse(fs.readFileSync(hostingFile, 'utf8')) as Record<string, HostingEntry>;
            return j && typeof j === 'object' ? j : {};
        } catch { return {}; }
    };
    const writeHosting = (): void => {
        const me = String(process.pid);
        const map = readHosting();
        const mine = consoleHost.list()
            .filter(s => s.sessionId && s.status !== 'ended' && s.status !== 'error')
            .map(s => s.sessionId as string);
        if (mine.length) { map[me] = { beat: Date.now(), sessionIds: mine }; } else { delete map[me]; }
        // windows that are gone: their claim goes with them
        for (const k of Object.keys(map)) {
            if (k !== me && !pidAlive(Number(k))) { delete map[k]; }
        }
        try {
            fs.mkdirSync(path.dirname(hostingFile), { recursive: true });
            fs.writeFileSync(hostingFile, JSON.stringify(map, null, 1), 'utf8');
        } catch { /* a convenience file — never break a session over it */ }
    };
    /** Is another live window reading this session? */
    const readElsewhere = (sessionId: string): boolean => {
        const me = String(process.pid);
        const map = readHosting();
        return Object.keys(map).some(k => k !== me
            && (map[k]?.sessionIds || []).includes(sessionId) && pidAlive(Number(k)));
    };

    context.subscriptions.push(consoleHost.onChange(() => {
        rememberConsoleSessions();
        rememberOpenConsoleSessions();
        writeHosting();
        announceFinishedTurns();
    }));
    /**
     * The conversation a session already had, for a resume that means
     * *continuing*. Read off the transcript on disk — display only, no token
     * spent (see core/consolehistory.ts); the model's own context comes from
     * `--resume`. A transcript that cannot be read is simply no history: the
     * session still resumes, it just opens empty as it used to.
     */
    const consoleHistory = (sessionId: string): ConsoleMessage[] => {
        const file = index.all().find(s => s.sessionId === sessionId)?.file;
        if (!file) { return []; }
        try {
            return transcriptHistory(fs.readFileSync(file, 'utf8').split('\n'));
        } catch { return []; }
    };
    const consoleDeps = {
        extensionUri: context.extensionUri,
        host: consoleHost,
        getAgents: () => agents,
        index,
        modelAliases: () => cfg().get<string[]>('modelAliases', []),
        launchDefaults: () => launchDefaults(),
        liveOwners: () => readCliSessions(claudeDir()),
        history: consoleHistory,
        lastWindow: () => lastWindow,
        forgetLastWindow,
        // …declared just below; the panel only ever calls them from a message
        leftoverOwner: (sessionId: string) => leftoverOwner(sessionId),
        endLeftover: (sessionId: string, pid: number) => endLeftover(sessionId, pid),
        // a turn's cost while it is still running — see ConsoleDeps.estimateCost
        estimateCost: (model: string, u: Usage) => pricing.costFor(model, u),
        projects: () => projectStore.all().map(p => ({
            id: p.id, name: p.name, icon: p.icon, color: p.color, status: p.status
        })),
        activeProjectId: () => activeProjectId(),
        setActiveProject: (id: string) => {
            void context.workspaceState.update('af.activeProject', id || '').then(() => projectsChanged());
        },
        // The chip's text — the same composition the spawn writes, so what the
        // chip shows is what the next session will actually be given. Cached,
        // because this is asked for on every repaint (see the preview above).
        projectContextText: (projectId: string) => projectContextPreviewFor(projectId)
    };

    /**
     * ‼️ A conversation that is running, ours, and unreachable.
     *
     * A Console session is a `claude` the extension host spawned and reads over
     * a pipe. `dispose()` ends it when the window goes — but an extension
     * RELOAD or an update is not that clean shutdown: the new extension host
     * starts with an empty session map while the old process is still alive,
     * still holding its entry in the CLI's session registry.
     *
     * Everything then behaves correctly and the result is a trap. The Live
     * Timeline draws it as running (it IS running). The panel refuses to
     * resume it, because Claude Code cannot join a session another process
     * holds — two processes on one transcript is exactly the 3.29.0 rule. And
     * the shelf offers "click to continue" on a conversation that can never be
     * continued. Nobody is reading it, and nobody can.
     *
     * `--resume` was measured to pick the same session back up with everything
     * it remembers, so the way out is to end the leftover and resume. That is
     * destructive, so it is never done silently — and it is only ever OFFERED
     * for a session this extension's own Console started (`consoleIds`), which
     * this window is not hosting, whose owner is a program rather than
     * somebody's terminal.
     */
    const leftoverOwner = (sessionId: string): { pid: number } | undefined => {
        if (!sessionId || !consoleIds.includes(sessionId)) { return undefined; }
        const hostedHere = consoleHost.list().some(h => h.sessionId === sessionId
            && h.status !== 'ended' && h.status !== 'error');
        if (hostedHere) { return undefined; }
        // …and not a conversation another window is having right now
        if (readElsewhere(sessionId)) { return undefined; }
        const owner = ownerOf(readCliSessions(claudeDir()), sessionId);
        if (!owner || owner.entrypoint !== 'sdk-cli') { return undefined; }
        return { pid: owner.pid };
    };

    /**
     * End that leftover and wait until the CLI's registry really lets the
     * session go — resuming into a process that is still dying would put two
     * of them on the same transcript, which is the thing all of this exists to
     * prevent. Returns false if it is still there when we run out of patience.
     */
    const endLeftover = async (sessionId: string, pid: number): Promise<boolean> => {
        killPid(pid);
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (!ownerOf(readCliSessions(claudeDir()), sessionId)) { return true; }
        }
        return false;
    };

    // ---------- WHERE does a session run: a terminal, or the Console? ----------
    /**
     * ‼️ A session has had TWO places to live since the Console arrived, and the
     * start commands still only knew one.
     *
     * "Start session", "Continue latest" and the launcher all went straight to a
     * terminal without a word — the Console was reachable only from its own page
     * or from a resume, so the newer half of the product was invisible from every
     * button that starts a conversation. The fix is not a second set of buttons
     * (that doubles a toolbar for a choice you make in one keystroke); it is to
     * ASK, in the one place every surface funnels through.
     *
     * Callers that already know (a webview dropdown, an automation) pass
     * `surface` and are never asked. Everything else — the command palette, a
     * tree row's context menu, a keybinding — gets this picker.
     */
    type RunSurface = 'terminal' | 'console';
    const SURFACE_KEY = 'agentfarm.lastRunSurface';

    /**
     * The active-project picker, as a function rather than only a command.
     *
     * One list, one wording, one write — the status bar, the tree and every
     * "start a session" pre-flight open THIS. A second list built next to a
     * start button would drift from this one (different filter, different
     * "No project" wording) and the two would disagree about what is on offer.
     */
    const chooseActiveProject = async (
        placeHolder = 'Active project — sessions you start in this window are filed under it'
    ): Promise<void> => {
        const current = activeProjectId();
        const projects = projectStore.all().filter(p => !CLOSED_PROJECT_STATUSES.includes(p.status));
        interface Row extends vscode.QuickPickItem { id?: string; act?: string }
        const pick = await vscode.window.showQuickPick<Row>([
            ...projects.map(p => ({
                label: `${p.id === current ? '$(check) ' : '$(blank) '}${p.icon ? p.icon + ' ' : ''}${p.name}`,
                description: p.summary ?? p.status,
                id: p.id
            })),
            ...(current ? [{ label: '$(circle-slash) No project', description: 'stop filing new sessions', act: 'none' }] : []),
            { label: '$(add) New project…', description: 'opens the form on the Projects page', act: 'new' }
        ], { placeHolder, ignoreFocusOut: true });
        if (!pick) { return; }
        if (pick.act === 'new') {
            // creation lives on the page now — it makes the project, and
            // "Make active" is right there on it
            void vscode.commands.executeCommand('agentfarm.newProject');
            return;
        }
        await context.workspaceState.update('af.activeProject', pick.act === 'none' ? '' : (pick.id ?? ''));
        projectsChanged();
    };

    /** The project a launch will file under, as one picker row. Says the same
     *  thing the Console's chip says, in the vocabulary of a QuickPick. */
    const activeProjectRow = (): vscode.QuickPickItem & { act: string } => {
        const p = activeProject();
        return {
            label: `$(project) Project`,
            description: p ? `${p.icon ? p.icon + ' ' : '◧ '}${p.name}` : '◧ No project',
            detail: p
                ? 'the session is told about it before you type, and is filed under it'
                : 'nothing extra is sent and the session is filed nowhere — pick one here',
            act: 'project'
        };
    };

    /**
     * ‼️ A NEW SESSION IS OFFERED THE SAME CHOICES WHEREVER IT IS STARTED FROM.
     *
     * `project: true` adds the project row. It is not decoration: the Console's
     * composer has had a project box since 3.54.0 and no other start path had
     * one, so pressing ▶ on an agent in the sidebar filed the session under
     * whatever the status bar happened to say and never mentioned it — the same
     * "new session", two different offers, decided by which button you pressed.
     *
     * A RESUME does not get the row. Its project was decided when it started
     * (`stampSession` refuses to overwrite that), so asking again would be a
     * question whose answer is thrown away.
     */
    const pickRunSurface = async (
        what: string, opts: { project?: boolean } = {}
    ): Promise<RunSurface | undefined> => {
        interface Item extends vscode.QuickPickItem { surface?: RunSurface; act?: string }
        const last = context.globalState.get<RunSurface>(SURFACE_KEY);
        for (;;) {
            const items: Item[] = [
                {
                    label: '$(terminal) In a terminal',
                    description: 'a real claude terminal — the full TUI, slash commands, /resume',
                    surface: 'terminal'
                },
                {
                    label: '$(comment-discussion) In the Console',
                    description: 'inside the panel — the conversation stays with Agent Farm',
                    surface: 'console'
                }
            ];
            for (const it of items) {
                if (it.surface === last) { it.description += ' • last used'; }
            }
            if (opts.project) {
                items.push(
                    { label: 'Filed under', kind: vscode.QuickPickItemKind.Separator },
                    activeProjectRow());
            }
            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: `${what} — where should it run?`, ignoreFocusOut: true
            });
            if (!pick) { return undefined; }
            if (pick.act === 'project') {
                await chooseActiveProject();
                continue;   // back to this picker, now showing what it will file under
            }
            if (!pick.surface) { continue; }
            await context.globalState.update(SURFACE_KEY, pick.surface);
            return pick.surface;
        }
    };

    /**
     * Start a hosted (Console) session for an agent, with the same launch
     * options a terminal start would have used, and show it.
     *
     * A hosted session has no `-n` of its own — the name is Agent Farm's own
     * title store — so a launch that asked for a name applies it the moment the
     * CLI reports the session's id, rather than dropping it silently.
     */
    const startConsoleSession = (
        agent: AgentInfo, o: LaunchOptions = {}, project?: string
    ): void => {
        const merged = withDefaults(o, launchDefaults());
        const id = consoleHost.start({
            agentId: agent.id, agentName: agent.name, cwd: agent.dir,
            model: merged.model, effort: merged.effort, permissionMode: merged.permissionMode,
            // undefined = inherit the window's active project (ConsoleHost does
            // the read); '' = explicitly none. See launchClaudeTerminal.
            ...(project !== undefined ? { projectId: project } : {}),
            firstPrompt: o.prompt?.trim() || undefined
        });
        const wanted = o.name?.trim();
        if (wanted) {
            const sub = consoleHost.onChange(changed => {
                if (changed !== id) { return; }
                const sid = consoleHost.get(id)?.sessionId;
                if (!sid) { return; }
                sub.dispose();
                void applySessionTitle(sid, wanted);
            });
            context.subscriptions.push(sub);
        }
        ConsolePanel.show(consoleDeps, { sessionId: id });
    };

    /**
     * Which hosted session a Console row's right-click is about.
     *
     * The card hands its `hostId` over in `data-vscode-context`; a row whose
     * process this window no longer has (ended and removed, or a stale menu on
     * a reloaded panel) says so instead of failing silently.
     */
    const consoleRowId = (arg?: { hostId?: string }): string | undefined => {
        const id = typeof arg?.hostId === 'string' ? arg.hostId : '';
        if (!id || !consoleHost.get(id)) {
            void vscode.window.showInformationMessage(
                'Agent Farm: that session is not in this window\'s Console list any more.');
            return undefined;
        }
        return id;
    };

    // ---------- C1: the read-only web surface ----------
    // One snapshot file, two possible servers: this window while it is open,
    // the headless service once the heartbeat goes stale. The page never
    // re-derives anything, so it cannot disagree with the panel — and it says
    // out loud when what it shows has stopped being live.
    const snapshotFile = path.join(context.globalStorageUri.fsPath, 'web-snapshot.json');
    let webServer: RunningWebServer | undefined;
    const webCfg = () => ({
        enabled: cfg().get<boolean>('web.enabled', false),
        port: Math.max(1, cfg().get<number>('web.port', 8378)),
        bind: (cfg().get<string>('web.bind', 'local') === 'lan' ? 'lan' : 'local') as 'local' | 'lan',
        token: cfg().get<string>('web.token', '').trim()
    });

    const writeWebSnapshot = () => {
        const w = webCfg();
        if (!w.enabled) { return; }
        const now = Date.now();
        const rows = buildPortfolioRows({
            extensionUri: context.extensionUri,
            getAgents: () => agents,
            index,
            getInsights: () => insights,
            live,
            projects: () => projectDefs(),
            budgets: () => cfg().get<Record<string, number>>('budgets', {})
        }, now);
        const today = dayKey(now);
        const projectByAgent = agentProjectMap(
            agents.map(a => ({ id: a.id, name: a.name, dir: a.dir })), projectDefs());
        const needsRows = buildNeeds().map(n => ({
            kind: n.kind, agent: n.agentName, title: n.title, detail: n.detail, ts: n.ts
        }));
        const snapshot = buildSnapshot({
            host: os.hostname(),
            writer: 'extension',
            tokensToday: index.all().reduce((n, s) => {
                const b = s.daily[today];
                return n + (b ? totalTokens(b.usage) : 0);
            }, 0),
            agents: rows.map(r => ({
                name: r.name, project: r.project, status: r.status, active: r.active,
                lastActivity: r.lastActivity, costToday: r.costToday, cost30: r.cost30,
                quietDays: r.quietDays
            })),
            needs: needsRows,
            notices: noticesStore.list({ limit: 40 }).map(n => ({
                title: n.title, type: n.type, level: n.level ?? 1,
                agent: n.agentName ?? '', ts: n.ts, unread: !n.read
            })),
            live: live.sessions()
                .filter(s => s.status !== 'idle' && s.status !== 'ended')
                .map(s => ({
                    title: s.lastPrompt ?? '(no prompt yet)', agent: s.agentName ?? s.sessionId.slice(0, 8),
                    project: (s.agentName && projectByAgent[s.agentName]) || '', status: s.status,
                    ts: s.lastEventTs, cost: 0, turns: s.prompts
                })),
            sessions: index.all()
                .slice().sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime)).slice(0, 25)
                .map(s => ({
                    title: s.title, agent: s.agentName ?? '?',
                    project: (s.agentName && projectByAgent[s.agentName]) || '',
                    status: '', ts: s.lastTs || s.mtime, cost: Math.round(s.cost * 100) / 100,
                    turns: s.userTurns
                })),
            tasks: taskManager.tasks
                .filter(t => t.status === 'running' || t.status === 'queued')
                .slice(0, 20)
                .map(t => ({ title: t.title, agent: t.agentName, status: t.status, ts: t.createdAt })),
            projects: projectRollup().map(p => ({
                name: p.name, agents: p.agents.length, sessions: p.sessions,
                costToday: p.todayCost, cost: p.cost
            }))
        }, now);
        try {
            fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
            fs.writeFileSync(snapshotFile, JSON.stringify(snapshot), 'utf8');
        } catch { /* storage unavailable — the page will show its own staleness */ }
    };

    // The service reads its own copy of the web settings (it has no access to
    // VS Code's), so the two sides can never disagree about port or token.
    const writeWebConfigForService = () => {
        const w = webCfg();
        try {
            fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
            fs.writeFileSync(path.join(context.globalStorageUri.fsPath, 'web-config.json'),
                JSON.stringify({ enabled: w.enabled, port: w.port, bind: w.bind, token: w.token }), 'utf8');
        } catch { /* storage unavailable */ }
    };

    let webRetry: NodeJS.Timeout | undefined;
    const applyWebServer = (attempt = 0) => {
        if (webRetry) { clearTimeout(webRetry); webRetry = undefined; }
        const w = webCfg();
        webServer?.close();
        webServer = undefined;
        writeWebConfigForService();
        if (!w.enabled) { return; }
        if (!w.token) {
            void vscode.window.showWarningMessage(
                'Agent Farm: the web view needs a token — run "Open Web View…" and one will be generated.');
            return;
        }
        webServer = startWebServer(
            { ...w, snapshotFile, writer: 'extension' },
            err => {
                // The headless service may still be holding the port; it lets go
                // on its next tick once this window's heartbeat is fresh again.
                if (attempt < 3) {
                    webRetry = setTimeout(() => applyWebServer(attempt + 1), 20_000);
                    return;
                }
                void vscode.window.showWarningMessage(
                    `Agent Farm: web view could not start on port ${w.port} — ${String(err.message ?? err)}`);
            });
        if (webServer) { writeWebSnapshot(); }
    };
    applyWebServer();
    const webTimer = setInterval(writeWebSnapshot, 20_000);
    context.subscriptions.push({
        dispose: () => {
            clearInterval(webTimer);
            if (webRetry) { clearTimeout(webRetry); }
            webServer?.close();
        }
    });
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('agentFarm.web')) { applyWebServer(); }
    }));

    // ---------- C3: the inbound messaging channel ----------
    // A message from a chat app becomes a headless run for one agent, and the
    // answer goes back to the same thread. Two rails, both non-negotiable:
    // an allowlist (empty = the bridge does not run) and a daily USD cap.
    // The bot token is a credential, so it lives in the Secrets vault under a
    // fixed name — never in settings.json, never on the bridge (_REF/bridge.md).
    const TELEGRAM_SECRET = 'TELEGRAM_BOT_TOKEN';
    const CHAT_STATE_KEY = 'agentfarm.chatState';
    interface ChatState {
        offset: number;
        agentByChat: Record<string, string>;
        ledger: SpendLedger;
        taskByChat: Record<string, string>;
    }
    const chatState = (): ChatState => {
        const s = context.globalState.get<Partial<ChatState>>(CHAT_STATE_KEY, {});
        return {
            offset: typeof s.offset === 'number' ? s.offset : 0,
            agentByChat: s.agentByChat ?? {},
            ledger: s.ledger ?? { day: dayKey(Date.now()), usd: 0 },
            taskByChat: s.taskByChat ?? {}
        };
    };
    const saveChatState = (next: ChatState) => context.globalState.update(CHAT_STATE_KEY, next);
    const chatCfg = () => ({
        enabled: cfg().get<boolean>('telegram.enabled', false),
        allow: (cfg().get<number[]>('telegram.allowedChats', []) ?? [])
            .filter(n => typeof n === 'number'),
        maxDailyUSD: cfg().get<number>('telegram.maxDailyUSD', 1),
        defaultAgent: cfg().get<string>('telegram.defaultAgent', '').trim()
    });
    let poller: TelegramPoller | undefined;

    const chatSend = async (chatId: number, text: string) => {
        const token = vault.get(TELEGRAM_SECRET);
        if (!token) { return; }
        try { await sendMessage(token, chatId, clipForChat(text)); }
        catch (e) { console.warn('Agent Farm: telegram send failed', e); }
    };

    /** Run one chat message as a headless task and answer in the same thread. */
    const chatRunPrompt = async (chatId: number, prompt: string, agentName: string) => {
        const agent = agents.find(a => a.name.toLowerCase() === agentName.toLowerCase());
        if (!agent) {
            await chatSend(chatId, `No agent called "${agentName}". /agents lists them.`);
            return;
        }
        const st = chatState();
        const day = dayKey(Date.now());
        const cap = chatCfg().maxDailyUSD;
        if (!withinBudget(st.ledger, cap, day)) {
            await chatSend(chatId,
                `Today's chat budget is used up (${fmtUSD(st.ledger.usd)} of ${fmtUSD(cap)}). ` +
                'Raise agentFarm.telegram.maxDailyUSD or wait for tomorrow.');
            return;
        }
        const task = taskManager.addTask(agent, `chat: ${prompt.slice(0, 40)}`, prompt, 'headless');
        await saveChatState({ ...st, taskByChat: { ...st.taskByChat, [chatId]: task.id } });
        taskManager.startTask(task);
        await chatSend(chatId, `▶ ${agent.name} is on it (headless run). I'll answer here when it finishes.`);
        // Wait for the run without holding anything: the manager fires on every
        // task change, and a ceiling stops a hung run from waiting forever.
        const started = Date.now();
        const sub = taskManager.onDidChange(async () => {
            const t = taskManager.tasks.find(x => x.id === task.id);
            if (!t || (t.status !== 'done' && t.status !== 'failed')) {
                if (Date.now() - started > 20 * 60_000) { sub.dispose(); }
                return;
            }
            sub.dispose();
            let body = '';
            try { body = t.outputFile ? archivedOutputBody(fs.readFileSync(t.outputFile, 'utf8')) : ''; }
            catch { /* no output */ }
            const cost = matchTaskSession(t, index.all())?.cost ?? 0;
            const now = chatState();
            await saveChatState({
                ...now,
                ledger: addSpend(now.ledger, cost, dayKey(Date.now())),
                taskByChat: Object.fromEntries(
                    Object.entries(now.taskByChat).filter(([k]) => k !== String(chatId)))
            });
            await chatSend(chatId,
                `${t.status === 'done' ? '✅' : '⚠'} ${agent.name} — ${t.status}` +
                (cost ? ` · ${fmtUSD(cost)}` : '') + '\n\n' + (body || '(no output)'));
        });
        context.subscriptions.push(sub);
    };

    const chatHandle = async (msg: InboundMessage) => {
        const c = chatCfg();
        if (!isAllowed(msg.chatId, c.allow)) {
            // Say who it is, so adding the id to the allowlist is one copy away.
            await chatSend(msg.chatId,
                `This chat is not allowed to drive the farm.\nChat id: ${msg.chatId}\n` +
                'Add it to agentFarm.telegram.allowedChats to enable it.');
            return;
        }
        const st = chatState();
        const bound = st.agentByChat[msg.chatId] ?? c.defaultAgent;
        const cmd = parseCommand(msg.text);
        if (cmd.kind === 'help') { await chatSend(msg.chatId, HELP_TEXT); return; }
        if (cmd.kind === 'agents') {
            await chatSend(msg.chatId, agents.length
                ? 'Agents: ' + agents.map(a => a.name).join(', ') + (bound ? `\nThis chat: ${bound}` : '')
                : 'No agents found.');
            return;
        }
        if (cmd.kind === 'use') {
            const agent = agents.find(a => a.name.toLowerCase() === cmd.agent.toLowerCase());
            if (!agent) { await chatSend(msg.chatId, `No agent called "${cmd.agent}". /agents lists them.`); return; }
            await saveChatState({ ...st, agentByChat: { ...st.agentByChat, [msg.chatId]: agent.name } });
            await chatSend(msg.chatId, `This chat now talks to ${agent.name}.`);
            return;
        }
        if (cmd.kind === 'status') {
            const needs = buildNeeds();
            const running = taskManager.tasks.filter(t => t.status === 'running');
            const today = dayKey(Date.now());
            const cost = index.all().reduce((n, s) => n + (s.daily[today]?.cost ?? 0), 0);
            await chatSend(msg.chatId, [
                `Farm: ${agents.length} agents · ${index.activeAgentIds().size} active`,
                `Today: ${fmtUSD(cost)} · chat runs ${fmtUSD(st.ledger.day === today ? st.ledger.usd : 0)} of ${fmtUSD(c.maxDailyUSD)}`,
                `Needs you: ${needs.length}${needs.length ? ' — ' + needs[0].title : ''}`,
                `Running tasks: ${running.length}${running.length ? ' — ' + running[0].title : ''}`,
                bound ? `This chat: ${bound}` : 'This chat is not bound to an agent yet (/agent <name>)'
            ].join('\n'));
            return;
        }
        if (cmd.kind === 'cancel') {
            const id = st.taskByChat[msg.chatId];
            const t = id ? taskManager.tasks.find(x => x.id === id) : undefined;
            if (t && t.status === 'running') {
                taskManager.cancelTask(t);
                await chatSend(msg.chatId, 'Stopped.');
            } else {
                await chatSend(msg.chatId, 'Nothing from this chat is running.');
            }
            return;
        }
        if (!bound) {
            await chatSend(msg.chatId,
                'Bind this chat to an agent first: /agent <name>\n/agents lists them.');
            return;
        }
        await chatRunPrompt(msg.chatId, cmd.text, bound);
    };

    const applyChatBridge = async () => {
        poller?.stop();
        poller = undefined;
        const c = chatCfg();
        if (!c.enabled) { return; }
        const token = vault.get(TELEGRAM_SECRET);
        if (!token) {
            void vscode.window.showWarningMessage(
                'Agent Farm: the Telegram bridge needs a bot token — run "Connect Telegram…".');
            return;
        }
        if (!c.allow.length) {
            void vscode.window.showWarningMessage(
                'Agent Farm: the Telegram bridge has no allowed chats, so it stays off. Message the bot once and add the id it reports to agentFarm.telegram.allowedChats.');
        }
        poller = new TelegramPoller({
            token,
            offset: chatState().offset,
            onMessages: (msgs, next) => {
                void saveChatState({ ...chatState(), offset: next });
                for (const m of msgs) { void chatHandle(m); }
            },
            onError: e => console.warn('Agent Farm: telegram poll failed', e.message)
        });
        poller.start();
    };
    void applyChatBridge();
    context.subscriptions.push({ dispose: () => poller?.stop() });
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('agentFarm.telegram')) { void applyChatBridge(); }
        // Turning the usage indicator on/off, or moving its thresholds, must
        // show at once — a settings page you have to reload to believe is a
        // settings page you stop trusting.
        if (e.affectsConfiguration('agentFarm.planUsage')) { planUsageBar.refresh(); }
    }));

    // ---------- projects ----------
    // The registry is projectStore; these are the two shapes the surfaces ask
    // for. `legacyDefs` exists only while the pages still speak ProjectDef —
    // it is an adapter over the real projects, never a second source of truth.
    const legacyDefs = (): ProjectDef[] => projectStore.all().map(p => {
        const def: ProjectDef = { name: p.name };
        if (p.match?.agents?.length) { def.agents = p.match.agents; }
        const paths = [p.folder, ...(p.repos ?? [])].filter((x): x is string => !!x);
        if (paths.length) { def.paths = paths; }
        if (p.budgetUSD) { def.budgetUSD = p.budgetUSD; }
        if (p.summary) { def.note = p.summary; }
        return def;
    });
    /** Back-compat alias while the pages are converted. */
    const projectDefs = legacyDefs;
    /**
     * The cost rollup every project surface reads.
     *
     * This one goes through the ENTITY resolution (explicit assignment first,
     * then explicit-none, then longest path root, then the agent rule), not the
     * old settings matching — otherwise a session the user put on a project by
     * hand would be counted somewhere else, and the number on screen would
     * contradict the assignment they just made. The output keeps the old shape
     * so the dashboard's card and the webviews stay untouched.
     */
    const projectRollup = () => {
        const today = dayKey(Date.now());
        const projects = projectStore.all();
        const rolled = rollupProjectSessions(
            projects,
            index.all().map(s => ({
                sessionId: s.sessionId, agentId: s.agentId, agentName: s.agentName, cwd: s.cwd,
                cost: s.cost, tokens: totalTokens(s.usage),
                todayCost: s.daily[today]?.cost ?? 0,
                lastTs: s.lastTs || s.mtime || 0
            })),
            projectStore.links());
        return rolled.map(r => ({
            name: r.id === UNASSIGNED_ID ? UNASSIGNED : r.name,
            agents: r.agents, sessions: r.sessions, cost: r.cost, tokens: r.tokens,
            todayCost: r.todayCost, lastTs: r.lastTs,
            ...(r.budgetUSD ? { budgetUSD: r.budgetUSD } : {}),
            ...(projects.find(p => p.id === r.id)?.summary
                ? { note: projects.find(p => p.id === r.id)?.summary }
                : {})
        }));
    };

    /** A project's folder state, with the filesystem supplied. */
    const projectFolderState = (p: Project) => folderState(p, dirExists);
    /** Everything wrong with a project right now — one list, one vocabulary. */
    const projectWarnings = (p: Project): string[] => {
        const out: string[] = [];
        const state = projectFolderState(p);
        if (state === 'unset') { out.push('no folder chosen yet'); }
        if (state === 'missing') { out.push(`folder not found: ${p.folder}`); }
        const roll = projectRollup().find(r => r.name === p.name);
        if (p.budgetUSD && roll && roll.todayCost > p.budgetUSD) {
            out.push(`over today's budget (${fmtUSD(roll.todayCost)} of ${fmtUSD(p.budgetUSD)})`);
        }
        const staleDays = cfg().get<number>('projectStaleDays', 21);
        if (p.status === 'active' && staleDays > 0 && roll?.lastTs) {
            const days = Math.floor((Date.now() - roll.lastTs) / 86400000);
            if (days >= staleDays) { out.push(`active but quiet for ${days} days`); }
        }
        return out;
    };
    /** One project, as every bridge op reports it. */
    const projectView = (p: Project) => {
        const roll = projectRollup().find(r => r.name === p.name);
        return {
            id: p.id, name: p.name, status: p.status, kind: p.kind ?? null,
            folder: p.folder ?? null, folderState: projectFolderState(p),
            repos: p.repos ?? [], parentId: p.parentId ?? null,
            summary: p.summary ?? null, tags: p.tags ?? [],
            people: p.people ?? [], agentRules: p.match?.agents ?? [],
            budgetUSD: p.budgetUSD ?? null, budgetTotalUSD: p.budgetTotalUSD ?? null,
            sessions: roll?.sessions ?? 0, cost: roll?.cost ?? 0,
            todayCost: roll?.todayCost ?? 0, tokens: roll?.tokens ?? 0,
            lastTs: roll?.lastTs ?? 0,
            warnings: projectWarnings(p)
        };
    };
    /**
     * What a session row hands a project command.
     *
     * The shared right-click contract (media/afSessionCtx.js) puts `sessionId`
     * and `file` on every session row on every page. A surface that also knows
     * about a multi-row SELECTION adds `afSelectedSessions`, and then the same
     * menu item acts on all of them — so "file ninety sessions" is the same
     * command as "file this one", not a separate feature nobody finds.
     */
    interface SessionCtxArg {
        sessionId?: string;
        file?: string;
        afSelectedSessions?: unknown;
    }
    const sessionIdsFromArg = (arg?: SessionCtxArg | SessionInfo | string): string[] => {
        if (typeof arg === 'string') { return [arg]; }
        const ctx = (arg ?? {}) as SessionCtxArg;
        const many = Array.isArray(ctx.afSelectedSessions)
            ? ctx.afSelectedSessions.map(x => String(x ?? '').trim()).filter(Boolean)
            : [];
        if (many.length) { return [...new Set(many)]; }
        if (ctx.sessionId) { return [ctx.sessionId]; }
        if (ctx.file) {
            const found = index.all().find(s => s.file === ctx.file);
            if (found) { return [found.sessionId]; }
        }
        return [];
    };

    /** Every session that resolves to one project, newest first. */
    const sessionsOfProject = (id: string, limit = 0): SessionInfo[] => {
        const projects = projectStore.all();
        const links = projectStore.links();
        const hits = index.all()
            .filter(s => resolveSessionProject(
                { sessionId: s.sessionId, agentId: s.agentId, agentName: s.agentName, cwd: s.cwd },
                projects, links).projectId === id)
            .sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime));
        return limit > 0 ? hits.slice(0, limit) : hits;
    };
    const unassignedTotals = () => {
        const row = projectRollup().find(r => r.name === UNASSIGNED);
        return { sessions: row?.sessions ?? 0, cost: row?.cost ?? 0 };
    };

    /** A project's colour and icon, by name — every surface that names a
     *  project should show the same mark for it, not just the ones that
     *  happened to be written after the fields existed. */
    const projectStyleOf = (name: string) => {
        const p = projectStore.all().find(x => x.name === name);
        return p ? { icon: p.icon, color: p.color } : undefined;
    };

    // ---------- the project feed: sessions · tasks · missions · commits ----------
    /**
     * ‼️ MEMBERSHIP IS DECIDED HERE, ONCE, AND NOWHERE ELSE.
     *
     * `projectFeed.ts` deliberately does not know what belongs to a project —
     * that judgment lives in the resolution order (`projects.ts`) and it must
     * keep living in exactly one place. What follows is the mapping from each
     * store to "this project's rows", stated per store and per route:
     *
     *   sessions  → the resolution order (explicit · no-project · code root · agent rule)
     *   tasks     → `task.projectId` and nothing else. A task records no session
     *               id, and its working directory is normally the AGENT's folder
     *               rather than a code root — inferring a project from that is
     *               the agent-owns-a-project rule wearing a different hat. So a
     *               task stamped before 3.54.0 stays unfiled until there is a
     *               deliberate backfill; the timeline shows no Task chip at all
     *               in that case, which is the honest shape of "none", not a
     *               claim that the project ran none.
     *   missions  → a run whose STEP TASKS belong here; a mission is not a
     *               project member in its own right until it gets its own field
     *   commits   → a commit in a declared code root
     *
     * Notices and queue items are absent on purpose. They carry no project
     * link, and deriving one from who posted it would reintroduce exactly the
     * "an agent owns one project" mistake the entity model was rebuilt to kill.
     */
    const feedSessionsOf = (id: string): FeedSession[] =>
        sessionsOfProject(id).map(s => ({
            sessionId: s.sessionId,
            file: s.file,
            title: s.title,
            agentName: s.agentName,
            firstTs: s.firstTs,
            lastTs: s.lastTs || s.mtime,
            cost: s.cost,
            turns: (s.turns ?? []).map(t => ({
                n: t.n, label: t.label, ts: t.ts, cost: t.cost, tokens: t.tokens, models: t.models
            })),
            filesEdited: s.filesEdited,
            models: s.models,
            daily: Object.fromEntries(Object.entries(s.daily ?? {}).map(([d, b]) => [d, b.cost])),
            live: live.sessions().some(x => x.sessionId === s.sessionId && x.status !== 'idle')
        }));

    const tasksOfProject = (id: string): FarmTask[] =>
        taskManager.tasks.filter(t => t.projectId === id);

    /** The runs whose delegated steps landed on this project. */
    const missionsOfProject = (id: string) => {
        const missionIds = new Set(
            tasksOfProject(id).map(t => t.missionId).filter((x): x is string => !!x));
        return missionStore.runs.filter(r => missionIds.has(r.id));
    };

    /**
     * Commits in the project's code roots.
     *
     * Read out of a cache the panel warms, never spawned inline: `data()` is
     * called on every repaint of a page that refreshes on a timer, and a
     * project with four repos would otherwise start four `git log` processes
     * each time. The first paint after opening a project shows no commits and
     * the next one does — which is the right trade for never blocking the UI
     * thread on a process spawn.
     */
    const commitCache = new Map<string, FeedCommit[]>();
    /** ‼️ Per REPO, not one clock for the whole window — which is what the design
     *  and the changelog both say it is. A single timer meant that opening
     *  project A and then switching to B within the interval never spawned B's
     *  `git log` at all: B's timeline showed no commits, and said nothing about
     *  why, until the clock happened to run out. */
    const COMMIT_CACHE_MS = 60_000;
    const commitWarmAt = new Map<string, number>();
    const warmProjectCommits = (repos: string[]): void => {
        const now = Date.now();
        for (const repo of repos) {
            if (!repo?.trim() || !dirExists(repo)) { continue; }
            if (now - (commitWarmAt.get(repo) ?? 0) < COMMIT_CACHE_MS) { continue; }
            commitWarmAt.set(repo, now);
            recentCommits(repo, { max: 120, sinceDays: 180 }, rows => {
                const mapped = rows.map(r => ({
                    repo, hash: r.hash, ts: r.ts, author: r.author, subject: r.subject
                }));
                const before = commitCache.get(repo);
                commitCache.set(repo, mapped);
                // only repaint when the answer actually changed, or a page open
                // on a busy repo would flicker once a minute for nothing
                if (!before || before.length !== mapped.length || before[0]?.hash !== mapped[0]?.hash) {
                    ProjectsPanel.refreshIfOpen();
                }
            });
        }
    };
    const commitsOfProject = (p: Project): FeedCommit[] => {
        const repos = (p.repos ?? []).filter(r => !!r?.trim());
        warmProjectCommits(repos);
        return repos.flatMap(r => commitCache.get(r) ?? []);
    };

    /** One project's whole timeline. `opts` is what the page's filter row sends. */
    const projectFeedFor = (id: string, opts: ProjectFeedOptions = {}): ProjectFeed => {
        const p = projectStore.get(id);
        if (!p) { return buildProjectFeed({}, opts); }
        return buildProjectFeed({
            sessions: feedSessionsOf(id),
            tasks: tasksOfProject(id).map(t => ({
                id: t.id, title: t.title, agentName: t.agentName, status: t.status,
                createdAt: t.createdAt, startedAt: t.startedAt, endedAt: t.endedAt,
                costUSD: t.costUSD, missionId: t.missionId
            })),
            missions: missionsOfProject(id).map(r => ({
                id: r.id,
                title: missionStore.spec(r.specId)?.title ?? r.id,
                status: r.status,
                startedAt: r.startedAt,
                endedAt: r.endedAt,
                totalCostUSD: r.totalCostUSD,
                rounds: r.rounds.map(x => ({
                    n: x.n, at: x.at, thought: x.thought, action: x.action
                }))
            })),
            commits: commitsOfProject(p)
        }, opts);
    };

    /**
     * What is happening on this project RIGHT NOW, and what is lined up next.
     *
     * Two different questions and two different answers: "running" is the
     * present tense (a live session, a task the runner has started), "next" is
     * the queue. Schedules are deliberately absent — they carry no project
     * (see `TaskManager.addTask`), and listing the fleet's schedules under a
     * project would be the same misattribution in a friendlier font.
     */
    const projectActivity = (id: string) => {
        const tasks = tasksOfProject(id);
        const liveIds = new Set(live.sessions().map(s => s.sessionId));
        const running = [
            ...sessionsOfProject(id)
                .filter(s => liveIds.has(s.sessionId))
                .map(s => ({
                    what: 'session' as const, title: s.title, agent: s.agentName ?? '',
                    since: s.firstTs, id: s.sessionId, file: s.file
                })),
            ...tasks.filter(t => t.status === 'running').map(t => ({
                what: 'task' as const, title: t.title, agent: t.agentName ?? '',
                since: t.startedAt ?? t.createdAt, id: t.id, file: ''
            }))
        ].sort((a, b) => b.since - a.since);
        const next = tasks
            .filter(t => t.status === 'queued')
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, 5)
            .map(t => ({
                title: t.title, agent: t.agentName ?? '', status: t.status,
                // a queued task held back by the automation gate is not simply
                // "waiting its turn", and the row has to say which it is
                held: t.deferredReason ?? '',
                createdAt: t.createdAt, id: t.id
            }));
        return { running, next };
    };

    /** One project's money, broken down as far as the data honestly allows. */
    const projectCostFor = (id: string): ProjectCost => {
        const p = projectStore.get(id);
        return buildProjectCost({
            sessions: feedSessionsOf(id),
            budgetUSD: p?.budgetUSD,
            budgetTotalUSD: p?.budgetTotalUSD,
            startedAt: p?.startedAt,
            dueAt: p?.dueAt
        });
    };

    const projectsTree = new ProjectsTreeProvider({
        rows: () => {
            const roll = projectRollup();
            return projectStore.all().map(p => {
                const r = roll.find(x => x.name === p.name);
                return {
                    project: p,
                    sessions: r?.sessions ?? 0, cost: r?.cost ?? 0,
                    todayCost: r?.todayCost ?? 0, lastTs: r?.lastTs ?? 0,
                    warnings: projectWarnings(p),
                    folderOk: projectFolderState(p) === 'ok'
                };
            });
        },
        sessionsFor: (id, limit) => sessionsOfProject(id, limit),
        unassigned: unassignedTotals,
        activeId: activeProjectId
    });
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agentfarm.projects', projectsTree));

    /** The active project, always on screen — a stamp being applied invisibly
     *  is exactly the automation nobody should have to trust blindly. */
    const projectBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 91);
    projectBar.command = 'agentfarm.setActiveProject';
    context.subscriptions.push(projectBar);
    const paintProjectBar = (): void => {
        const p = activeProject();
        projectBar.text = p ? `◧ ${p.name}` : '◧ No project';
        projectBar.tooltip = p
            ? `Active project: ${p.name}\nSessions you start here — Console or terminal — are filed under it.\nAnything you already filed by hand keeps what you chose.\nClick to change or clear.`
            : 'No active project. Click to pick one — sessions you start here will then be filed under it.';
        projectBar.show();
    };
    paintProjectBar();

    /** After any change to the registry: repaint everything that shows it. */
    const projectsChanged = (): void => {
        projectsTree.refresh();
        paintProjectBar();
        ProjectsPanel.refreshIfOpen();
        refreshAll();
    };

    /**
     * Create a project — the one implementation.
     *
     * The page's form, the palette command and "new project from this session"
     * all land here, so the folder skeleton, the error wording and the refresh
     * cannot differ depending on which button was pressed. A folder is built
     * only when one was chosen; a project without one is legal and says so on
     * its own row until somebody picks it.
     */
    const createProject = (input: {
        name: string; folder?: string; kind?: string; status?: string; summary?: string;
        repos?: string[]; sessionIds?: string[];
    }): { id?: string; error?: string; warning?: string } => {
        const name = String(input.name ?? '').trim();
        const folder = String(input.folder ?? '').trim();
        const res = projectStore.create({
            name,
            ...(folder ? { folder } : {}),
            ...(input.kind ? { kind: input.kind as never } : {}),
            ...(input.status ? { status: input.status as never } : {}),
            ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
            ...(input.repos?.length ? { repos: input.repos } : {})
        });
        if (res.error || !res.project) { return { error: res.error ?? 'could not create the project' }; }
        let warning: string | undefined;
        if (folder) {
            const built = createSkeleton(folder, res.project, projectSkeleton());
            if (built.failed.length) {
                warning = `"${name}" was created, but part of its folder could not be: ${built.failed[0].error}`;
            }
        }
        if (input.sessionIds?.length) { projectStore.assignSessions(input.sessionIds, res.project.id); }
        projectsChanged();
        return { id: res.project.id, warning };
    };

    /** Where a new project's folder would go, if the user does not say otherwise. */
    const suggestedProjectFolder = (name: string): string => {
        const root = projectsRoot();
        const leaf = folderNameFor(String(name ?? '').trim());
        return root && leaf ? path.join(root, leaf) : '';
    };

    const projectsPanelDeps = (): ProjectsPanelDeps => ({
        extensionUri: context.extensionUri,
        data: () => ({
            generatedAt: Date.now(),
            projects: projectStore.all().map(p => projectView(p)),
            agents: agents.map(a => a.name),
            activeId: activeProjectId(),
            activeName: activeProject()?.name ?? '',
            projectsRoot: projectsRoot(),
            unassigned: unassignedTotals(),
            // Named so the page can say WHY a filter chip is missing instead of
            // just not having one — see UNFILED_EVENT_KINDS.
            unfiledKinds: UNFILED_EVENT_KINDS
        }),
        /**
         * ‼️ ONLY WHAT THE OPEN TAB NEEDS.
         *
         * This page repaints on every fleet refresh. Shipping a 300-row feed,
         * a full cost rollup and a pooled sessions table on every one of those
         * — to draw a form — is how a read-only page becomes the reason the
         * window stutters. The tab says what it needs and gets that.
         */
        tabData: (id, tab, tableN, kinds) => {
            if (!id || !projectStore.get(id)) { return {}; }
            switch (tab) {
                case 'timeline': {
                    // ‼️ Filtered BEFORE the cap. Measured on a 150-session
                    // project: 3000 of 3690 events are turns, so capping first
                    // and filtering in the page hands the reader 300 rows of
                    // the one kind they switched off. `counts` is still taken
                    // over everything, so the chips keep telling the truth.
                    const wanted = (kinds ?? [])
                        .filter(k => PROJECT_EVENT_KINDS.includes(k as ProjectEventKind));
                    const feed = projectFeedFor(id, {
                        ...(wanted.length ? { kinds: wanted as ProjectEventKind[] } : {}),
                        limit: 300
                    });
                    return { feed };
                }
                case 'sessions':
                    return {
                        rows: sessionRowPool(sessionsOfProject(id),
                            s => index.isSessionActive(s), tableN,
                            () => projectStore.get(id)?.name, projectStyleOf),
                        tableN
                    };
                case 'cost':
                    return { cost: projectCostFor(id) };
                case 'overview': {
                    const feed = projectFeedFor(id, { limit: 8 });
                    const cost = projectCostFor(id);
                    return {
                        recent: feed.events,
                        counts: feed.counts,
                        activity: projectActivity(id),
                        // the headline figures only — the Cost tab has the rest
                        cost: { total: cost.total, today: cost.today, burn: cost.burn }
                    };
                }
                default:
                    return {};
            }
        },
        sessionTurns: (id, file) => {
            // The webview may only ask about files that belong to THIS project;
            // a page must never be able to point the host at an arbitrary path.
            if (!sessionsOfProject(id).some(s => s.file === file)) { return []; }
            try {
                return buildViewerData(file, {
                    extensionUri: context.extensionUri,
                    getPricing: () => pricing,
                    maxMessages: () => 1,
                    contextLimitFor: () => 0
                }).turns;
            } catch { return []; }
        },
        /** One entry point for every clickable row in the feed. */
        openLink: link => {
            switch (link.to) {
                case 'session':
                    void vscode.commands.executeCommand('agentfarm.openSession',
                        link.file, typeof link.ts === 'number' ? link.ts : undefined);
                    break;
                case 'task':
                    void vscode.commands.executeCommand('agentfarm.openTasks', link.id);
                    break;
                case 'mission':
                    void vscode.commands.executeCommand('agentfarm.openMissions', link.id);
                    break;
                case 'file':
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(String(link.path)));
                    break;
                case 'commit':
                    // No commit viewer of our own: hand it to whatever the user
                    // already uses for git rather than growing a second one.
                    void vscode.env.clipboard.writeText(String(link.hash));
                    void vscode.window.showInformationMessage(
                        `Agent Farm: commit ${String(link.hash).slice(0, 8)} copied — open it in your git tool.`);
                    break;
            }
        },
        save: (id, patch) => projectStore.update(id, patch as never).error,
        rename: (id, name, renameFolder) => {
            const p = projectStore.get(id);
            if (!p) { return 'no such project'; }
            let folder = p.folder;
            let warn: string | undefined;
            if (renameFolder && p.folder && dirExists(p.folder)) {
                const moved = renameProjectFolder(p.folder, name);
                folder = moved.path;
                if (!moved.ok) { warn = moved.error; }
            }
            const res = projectStore.update(id, { name, ...(folder ? { folder } : {}) });
            return res.error ?? warn;
        },
        remove: id => { projectStore.remove(id); },
        create: input => createProject(input),
        suggestFolder: name => suggestedProjectFolder(name),
        browseFolder: async start => {
            const root = projectsRoot();
            const from = (start ?? '').trim() || root;
            const picked = await vscode.window.showOpenDialog({
                canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
                openLabel: 'Use this folder',
                ...(from && dirExists(from) ? { defaultUri: vscode.Uri.file(from) } : {})
            });
            return picked?.length ? picked[0].fsPath : undefined;
        },
        pickFolder: async id => {
            const root = projectsRoot();
            const picked = await vscode.window.showOpenDialog({
                canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
                openLabel: 'Use this folder',
                ...(root && dirExists(root) ? { defaultUri: vscode.Uri.file(root) } : {})
            });
            if (!picked?.length) { return; }
            const p = projectStore.get(id);
            projectStore.update(id, { folder: picked[0].fsPath });
            if (p) { createSkeleton(picked[0].fsPath, { ...p, folder: picked[0].fsPath }, projectSkeleton()); }
        },
        recreateFolder: id => {
            const p = projectStore.get(id);
            if (p?.folder) { createSkeleton(p.folder, p, projectSkeleton()); }
        },
        revealFolder: id => {
            const p = projectStore.get(id);
            if (p?.folder && dirExists(p.folder)) {
                void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p.folder));
            }
        },
        setActive: async id => {
            await context.workspaceState.update('af.activeProject', id || '');
        },
        rescan: async () => { await vscode.commands.executeCommand('agentfarm.rescanProjects'); },
        // Until the project page grows its own Sessions tab, this goes where the
        // sessions already are — the dashboard's table, ALREADY SCOPED to this
        // project and scrolled to. Handing over an unfiltered page and leaving
        // the reader to find the filter themselves is the same as doing nothing.
        openSessions: id => {
            const p = projectStore.get(id);
            if (!p) { return; }
            void vscode.commands.executeCommand('agentfarm.openDashboard', { projectFilter: p.name });
        },
        onChange: () => { projectsTree.refresh(); paintProjectBar(); }
    });

    // ---------- A3: interrupt ----------
    // The only thing that stops a running turn is the key a person would press.
    // So press it: Esc, typed into that session's own terminal. Nothing is
    // killed — the session stays, its turn does not.
    const RUNNING_STATUSES = ['working', 'tool', 'waiting-permission', 'stalled'];
    const interruptSession = async (
        arg?: { sessionId?: string; agentName?: string } | SessionInfo
    ): Promise<void> => {
        let sessionId = arg?.sessionId;
        let agentName = arg?.agentName;
        if (!sessionId) {
            const running = live.sessions().filter(s => RUNNING_STATUSES.includes(s.status));
            const list = running.length ? running : live.sessions();
            if (!list.length) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no live session is being tracked right now.');
                return;
            }
            const pick = await vscode.window.showQuickPick(list.map(s => ({
                label: `$(debug-pause) ${s.agentName ?? s.sessionId.slice(0, 8)}`,
                description: s.status + (s.currentTool ? ` · ${s.currentTool}` : ''),
                detail: s.lastPrompt ?? '',
                s
            })), { placeHolder: 'Interrupt which session? (sends Esc)', ignoreFocusOut: true });
            if (!pick) { return; }
            sessionId = pick.s.sessionId;
            agentName = pick.s.agentName;
        }
        if (!agentName) {
            agentName = live.sessions().find(s => s.sessionId === sessionId)?.agentName
                ?? index.all().find(s => s.sessionId === sessionId)?.agentName;
        }
        const openTerms = vscode.window.terminals;
        const records: TermRecord[] = termBindings.map(b => ({
            title: b.title,
            sessionId: b.sessionId,
            hasTerminal: !!b.term && openTerms.includes(b.term),
            terminalIndex: b.term ? openTerms.indexOf(b.term) : undefined
        }));
        const target = resolveInterrupt({
            sessionId, agentName, bindings: records, terminalNames: openTerms.map(t => t.name)
        });
        const who = agentName ?? sessionId?.slice(0, 8) ?? 'the session';
        if (target.kind === 'integrated') {
            const term = openTerms[target.terminalIndex];
            term.show();
            term.sendText(INTERRUPT_KEY, false); // Esc, no newline — a keypress, not a line
            void vscode.window.showInformationMessage(
                `Agent Farm: Esc sent to ${who} (${target.how}) — the running turn stops, the session stays open.`);
            return;
        }
        if (target.kind === 'external') {
            focusExternalTerminal(target.titles, found => {
                void vscode.window.showWarningMessage(found
                    ? `Agent Farm: ${who} runs in an external terminal — its window is now in front, press Esc there. (Agent Farm can only type into integrated terminals.)`
                    : `Agent Farm: could not find a terminal window for ${who} — if it is running elsewhere, press Esc in that window.`);
            });
            return;
        }
        void vscode.window.showWarningMessage(
            `Agent Farm: no terminal found for ${who} — ${target.how}.`);
    };

    /** Shared picker for the session-level commands: a given id wins, otherwise ask. */
    const pickLiveSessionId = async (
        given: string | undefined, placeHolder: string
    ): Promise<string | undefined> => {
        if (given) { return given; }
        const list = live.sessions();
        if (!list.length) {
            void vscode.window.showInformationMessage(
                'Agent Farm: no live session is being tracked right now.');
            return undefined;
        }
        const pick = await vscode.window.showQuickPick(list.map(s => ({
            label: `$(radio-tower) ${live.labelOf(s)} (#${s.sessionId.slice(0, 8)})`,
            description: s.status + (s.currentTool ? ` · ${s.currentTool}` : ''),
            detail: s.lastPrompt ?? s.cwd ?? '',
            id: s.sessionId
        })), { placeHolder, ignoreFocusOut: true });
        return pick?.id;
    };

    /**
     * End a live session for real — not the turn (that is interrupt), the
     * session.
     *
     * What "end" can honestly mean depends on who owns the process. A session
     * this window hosts is closed through the Console (its own stdin + process
     * tree). Any other one is a `claude` the CLI registry knows by pid, and the
     * only thing that ends it from here is stopping that process tree — so the
     * question is asked plainly first. Either way the session then leaves the
     * live timeline, which is also the way out for a session whose process is
     * already gone and whose card would otherwise sit there until its tracking
     * expires.
     */
    const endLiveSession = async (sessionId: string, agentName?: string): Promise<void> => {
        const s = live.sessions().find(x => x.sessionId === sessionId);
        const who = agentName ?? (s ? live.labelOf(s) : sessionId.slice(0, 8));
        const hosted = consoleHost.list().find(h => h.sessionId === sessionId);
        if (hosted) {
            const yes = await vscode.window.showWarningMessage(
                `End "${who}"? It is a Console session in this window — its process stops and its transcript stays on disk.`,
                { modal: true }, 'End session');
            if (yes !== 'End session') { return; }
            consoleHost.close(hosted.id);
            live.dismiss(sessionId, 'ended from Agent Farm');
            return;
        }
        const owner = ownerOf(readCliSessions(claudeDir()), sessionId);
        if (!owner) {
            const yes = await vscode.window.showWarningMessage(
                `No live process owns "${who}" any more — there is nothing left to end. Clear it from the live timeline?`,
                { modal: true }, 'Clear it');
            if (yes !== 'Clear it') { return; }
            live.dismiss(sessionId, 'cleared (no live process)', true);
            return;
        }
        const yes = await vscode.window.showWarningMessage(
            `End "${who}"?`,
            {
                modal: true,
                detail: `Its claude process (pid ${owner.pid}) is stopped — the same as closing its terminal window. ` +
                    'Anything mid-turn is lost; the transcript stays on disk and the session can be resumed later.\n\n' +
                    'To stop only what it is doing right now, use Interrupt instead.'
            },
            'End session');
        if (yes !== 'End session') { return; }
        try {
            if (process.platform === 'win32') {
                cp.execFile('taskkill', ['/PID', String(owner.pid), '/T', '/F'], () => { /* best effort */ });
            } else {
                process.kill(owner.pid, 'SIGTERM');
            }
        } catch {
            void vscode.window.showWarningMessage(
                `Agent Farm: could not stop pid ${owner.pid} — it may already be gone.`);
        }
        live.dismiss(sessionId, 'ended from Agent Farm');
        void vscode.window.showInformationMessage(`Agent Farm: ${who} ended (pid ${owner.pid}).`);
    };

    // Palette entry point for the insight commands (tree rows pass the object).
    const pickInsight = async (placeHolder: string, fixableOnly = false): Promise<Insight | undefined> => {
        const list = insights.filter(i => !fixableOnly || FIX_COMMANDS[i.category]);
        if (!list.length) {
            void vscode.window.showInformationMessage('Agent Farm: no matching insights.');
            return undefined;
        }
        const sevIcon = (s: string) => s === 'error' ? '$(error)' : s === 'warning' ? '$(warning)' : '$(info)';
        const pick = await vscode.window.showQuickPick(list.map(i => ({
            label: `${sevIcon(i.severity)} ${i.message.slice(0, 80)}`,
            description: `${i.agentName} · ${i.category}`,
            ins: i
        })), { placeHolder, ignoreFocusOut: true });
        return pick?.ins;
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
        // arg is optional: the palette, the nav and every notification pass
        // nothing; the status-bar indicators pass { scrollTo: 'top' }.
        vscode.commands.registerCommand('agentfarm.openDashboard',
            (arg?: { scrollTo?: 'top'; projectFilter?: string }) => {
                const opts: { scrollTo?: 'top'; projectFilter?: string } = {};
                if (arg?.scrollTo === 'top') { opts.scrollTo = 'top'; }
                if (typeof arg?.projectFilter === 'string') { opts.projectFilter = arg.projectFilter; }
                DashboardPanel.show(dashboardDeps, Object.keys(opts).length ? opts : undefined);
            }),

        vscode.commands.registerCommand('agentfarm.openMissions', () => {
            MissionsPanel.show(missionsPanelDeps);
        }),

        vscode.commands.registerCommand('agentfarm.newMission', () => {
            if (!agents.length) {
                void vscode.window.showWarningMessage('Agent Farm: no agents found — add an agent root folder first.');
                return;
            }
            MissionsPanel.show(missionsPanelDeps, { newForm: true });
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

        // Takes the transcript path, or — when it comes from a right-click menu
        // (a tree row, a Console row) — the object that identifies the session.
        // A menu hands its context to the command; only the id is guaranteed to
        // be in it, so the path is resolved here.
        vscode.commands.registerCommand('agentfarm.openSession',
            (arg?: string | SessionRef, focusTs?: number) => {
                let file = typeof arg === 'string' ? arg : arg?.file;
                if (!file && arg && typeof arg === 'object' && arg.sessionId) {
                    file = sessionFromArg(arg)?.file;
                    if (!file) {
                        void vscode.window.showInformationMessage(
                            'Agent Farm: no transcript on disk for that session yet.');
                        return;
                    }
                }
                if (file) {
                    SessionViewerPanel.show(file, viewerDeps,
                        typeof focusTs === 'number' && focusTs > 0 ? focusTs : undefined);
                }
            }),

        // Z1: one-click working examples — the shortest path from "installed"
        // to "something actually runs". Each is a real, removable definition.
        vscode.commands.registerCommand('agentfarm.setupExample', async () => {
            if (!agents.length) {
                void vscode.window.showWarningMessage('Agent Farm: no agents found — add an agent root folder first.');
                return;
            }
            const pick = await vscode.window.showQuickPick([
                {
                    id: 'inbox' as const,
                    label: '$(inbox) Inbox duty — classify files dropped into a folder',
                    description: 'watch trigger → headless task',
                    detail: 'A new file in the watched folder fires an agent task that inspects and files it (guide S1).'
                },
                {
                    id: 'morning' as const,
                    label: '$(calendar) Morning briefing — every day at 09:00',
                    description: 'daily schedule → headless task',
                    detail: 'The agent reviews its memory/duties and writes a short day plan (guide S3).'
                },
                {
                    id: 'chain' as const,
                    label: '$(link) Two-agent chain — analyze, then summarize',
                    description: 'workflow with {prev_text} handoff',
                    detail: 'Agent A analyzes, agent B turns the analysis into an executive summary (guide S4).'
                }
            ], { placeHolder: 'Pick a working example — created as a normal definition you can edit or remove', ignoreFocusOut: true });
            if (!pick) { return; }

            const showCreated = (what: string, runNow?: () => void) => {
                const buttons = runNow ? ['Run Now', 'Show Tasks'] : ['Show Tasks'];
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${what} created — manage it in the Tasks view.`, ...buttons
                ).then(choice => {
                    if (choice === 'Run Now' && runNow) { runNow(); }
                    if (choice === 'Show Tasks' || choice === 'Run Now') {
                        void vscode.commands.executeCommand('agentfarm.tasks.focus');
                    }
                });
            };

            if (pick.id === 'inbox') {
                const agent = await resolveAgent(undefined);
                if (!agent) { return; }
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
                    openLabel: 'Watch this folder'
                });
                if (!folderUri?.length) { return; }
                const folder = folderUri[0].fsPath;
                const trigger = taskManager.addTrigger({
                    title: `Inbox: ${path.basename(folder)}`,
                    type: 'watch',
                    watchPath: folder,
                    action: {
                        kind: 'task', agentId: agent.id, agentName: agent.name,
                        title: 'Inbox triage',
                        prompt: 'İzlenen klasöre ({watch}) yeni veya değişmiş bir dosya düştü. Dosyayı bul, içeriğine bak ve: '
                            + '(1) ne olduğunu tek satırda özetle; (2) CLAUDE.md/hafızandaki kurallara göre uygun yere taşı ya da işle; '
                            + '(3) ne yaptığını kısaca raporla. Emin olamadığın dosyaya dokunma, sadece raporla.',
                        mode: 'headless'
                    },
                    debounceSec: 20, cooldownSec: 60, maxPerHour: 6, enabled: true
                });
                showCreated(`watch trigger "${trigger.title}" (${agent.name})`);
            } else if (pick.id === 'morning') {
                const agent = await resolveAgent(undefined);
                if (!agent) { return; }
                taskManager.addSchedule({
                    agentId: agent.id, agentName: agent.name,
                    title: 'Morning briefing',
                    prompt: 'Günaydın. Hafızanı, DUTIES.md görevlerini ve dünkü durumu gözden geçir; '
                        + 'bugün için 3-5 maddelik kısa bir plan/brifing yaz. Yeni dosya oluşturma, sadece raporla.',
                    mode: 'headless', kind: 'daily', hour: 9, minute: 0, enabled: true
                });
                showCreated(`daily schedule "Morning briefing" 09:00 (${agent.name})`);
            } else {
                const pickStep = (ph: string) => vscode.window.showQuickPick(
                    agents.map(a => ({ label: a.name, description: a.dir, agent: a })),
                    { placeHolder: ph, ignoreFocusOut: true });
                const a = await pickStep('Step 1 — which agent analyzes?');
                if (!a) { return; }
                const b = await pickStep('Step 2 — which agent summarizes?');
                if (!b) { return; }
                const w = taskManager.addWorkflow('Analyze → Summarize', [
                    {
                        agentId: a.agent.id, agentName: a.agent.name, title: 'Analyze',
                        prompt: 'Ajan klasöründeki güncel duruma (hafıza, son raporlar, DUTIES.md) bakarak bugünün en önemli 3 konusunu analiz et. '
                            + 'Her biri için durum + risk + öneri yaz.',
                        mode: 'headless'
                    },
                    {
                        agentId: b.agent.id, agentName: b.agent.name, title: 'Summarize',
                        prompt: 'Aşağıdaki analizi 5 cümleyi geçmeyen bir yönetici özetine çevir:\n\n{prev_text}',
                        mode: 'headless'
                    }
                ]);
                showCreated(`workflow "${w.title}" (${a.agent.name} → ${b.agent.name})`,
                    () => { taskManager.runWorkflow(w); });
            }
        }),

        // ---------- Insights lifecycle: dismiss / fix / delegate / restore ----------

        vscode.commands.registerCommand('agentfarm.dismissInsight', async (ins?: Insight) => {
            const target = ins ?? await pickInsight('Dismiss which insight?');
            if (!target) { return; }
            const choice = await vscode.window.showQuickPick([
                { label: '$(clock) 1 day', ms: 24 * 3600 * 1000 },
                { label: '$(calendar) 7 days', ms: 7 * 24 * 3600 * 1000 },
                { label: '$(close) Forever', ms: 0 }
            ], { placeHolder: `Hide "${target.message.slice(0, 70)}" for…`, ignoreFocusOut: true });
            if (!choice) { return; }
            const dismissed = context.globalState.get<Record<string, DismissEntry>>(DISMISS_KEY, {});
            dismissed[insightKey(target)] = {
                until: choice.ms === 0 ? 0 : Date.now() + choice.ms,
                label: `[${target.agentName} · ${target.category}] ${target.message.slice(0, 80)}`
            };
            await context.globalState.update(DISMISS_KEY, dismissed);
            refreshInsights();
        }),

        vscode.commands.registerCommand('agentfarm.fixInsight', async (ins?: Insight) => {
            const target = ins ?? await pickInsight('Fix which insight?', true);
            if (!target) { return; }
            const fix = FIX_COMMANDS[target.category];
            if (!fix) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no mechanical fix for this insight — use "Delegate to Agent" instead.');
                return;
            }
            // From here the ledger watches whether this actually held (E1).
            noteInsightAction(target, 'fix');
            void vscode.commands.executeCommand(fix.command,
                fix.agentScoped && target.agentId ? { agentId: target.agentId } : undefined);
        }),

        vscode.commands.registerCommand('agentfarm.delegateInsight', async (ins?: Insight) => {
            let selected: Insight[];
            if (ins) {
                selected = [ins];
            } else {
                if (!insights.length) {
                    void vscode.window.showInformationMessage('Agent Farm: no insights to delegate.');
                    return;
                }
                const sevIcon = (s: string) => s === 'error' ? '$(error)' : s === 'warning' ? '$(warning)' : '$(info)';
                const picks = await vscode.window.showQuickPick(insights.map(i => ({
                    label: `${sevIcon(i.severity)} ${i.message.slice(0, 80)}`,
                    description: `${i.agentName} · ${i.category}`,
                    picked: i.severity !== 'info',
                    ins: i
                })), {
                    canPickMany: true, ignoreFocusOut: true,
                    placeHolder: 'Delegate which insights? One headless task per agent; warnings/errors preselected'
                });
                if (!picks?.length) { return; }
                selected = picks.map(p => p.ins);
            }
            // Each insight goes to its OWN agent; fleet-level ones (no agent)
            // are pooled onto an agent the user picks once.
            const byAgent = new Map<string, Insight[]>();
            const fleet: Insight[] = [];
            for (const i of selected) {
                if (i.agentId && agents.some(a => a.id === i.agentId)) {
                    (byAgent.get(i.agentId) ?? byAgent.set(i.agentId, []).get(i.agentId)!).push(i);
                } else { fleet.push(i); }
            }
            if (fleet.length) {
                const fa = await resolveAgent(undefined);
                if (!fa) { return; }
                (byAgent.get(fa.id) ?? byAgent.set(fa.id, []).get(fa.id)!).push(...fleet);
            }
            const summary = [...byAgent.entries()]
                .map(([id, list]) => `${agents.find(a => a.id === id)!.name}: ${list.length}`).join(' · ');
            const go = await vscode.window.showInformationMessage(
                `Delegate ${selected.length} insight(s) as headless task(s)? → ${summary}`,
                { modal: true }, 'Delegate');
            if (go !== 'Delegate') { return; }
            for (const [id, list] of byAgent) {
                const agent = agents.find(a => a.id === id)!;
                const task = taskManager.addTask(agent, delegationTitle(list), buildDelegationPrompt(list), 'headless');
                taskManager.startTask(task);
            }
            // Same ledger as Fix: a delegation is an action whose result the
            // next refresh will judge (E1).
            for (const i of selected) { noteInsightAction(i, 'delegate'); }
            void vscode.window.showInformationMessage(
                `Agent Farm: ${byAgent.size} task(s) queued — the agents will investigate and report.`, 'Show Tasks'
            ).then(c => { if (c === 'Show Tasks') { void vscode.commands.executeCommand('agentfarm.tasks.focus'); } });
        }),

        // E1: the ledger, readable. "Which findings keep coming back, and did
        // what I did about them hold?" — the question a snapshot cannot answer.
        vscode.commands.registerCommand('agentfarm.insightHistory', async () => {
            const store = insightHistory();
            const sum = summarizeInsightHistory(store, 200);
            if (!sum.tracked) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no insight history yet — it starts recording from the next refresh.');
                return;
            }
            const now = Date.now();
            const pick = await vscode.window.showQuickPick(sum.top.map(r => ({
                label: (r.regressedAt ? '$(warning) ' : r.occurrences > 1 ? '$(history) ' : '$(check) ')
                    + r.label.slice(0, 80),
                description: `${r.agentName} · ${r.category}${r.open ? '' : ' · resolved'}`,
                detail: describeRecord(r, now),
                rec: r
            })), {
                placeHolder: `${sum.open} open · ${sum.recurring} have come back · ${sum.regressed} came back AFTER you acted · ${sum.fixedHolding} fixes holding`,
                matchOnDetail: true, ignoreFocusOut: true
            });
            if (pick?.rec.open) {
                const live = insights.find(i => insightKey(i) === pick.rec.key);
                if (live) { await vscode.commands.executeCommand('agentfarm.delegateInsight', live); }
            }
        }),

        vscode.commands.registerCommand('agentfarm.restoreInsights', async () => {
            const dismissed = context.globalState.get<Record<string, DismissEntry>>(DISMISS_KEY, {});
            const entries = Object.entries(dismissed);
            if (!entries.length) {
                void vscode.window.showInformationMessage('Agent Farm: no dismissed insights.');
                return;
            }
            const picks = await vscode.window.showQuickPick(entries.map(([key, e]) => ({
                label: e.label,
                description: e.until === 0 ? 'hidden forever' : `hidden until ${new Date(e.until).toLocaleString()}`,
                picked: true,
                key
            })), { canPickMany: true, placeHolder: 'Restore which dismissed insights?', ignoreFocusOut: true });
            if (!picks?.length) { return; }
            for (const p of picks) { delete dismissed[p.key]; }
            await context.globalState.update(DISMISS_KEY, dismissed);
            refreshInsights();
        }),

        // Every surface hands over what it knows; sessionFromArg fills the rest
        // in from the index (tree rows, Console cards, table rows, search hits).
        vscode.commands.registerCommand('agentfarm.resumeSession',
            async (arg?: SessionRef | SessionInfo) => {
                const s = sessionFromArg(arg);
                if (!s?.sessionId) { return; }
                // Claude Code cannot join a running session: resuming one that a
                // process already owns starts a SECOND process on the same
                // transcript, and the two never see each other's turns. Say so
                // before it happens rather than after it looks like one chat.
                // Held by the Console? Then it is OURS, and the honest answer is
                // not "you can't" — it is "shall I move it?". Ending the hosted
                // process frees the session, and the terminal picks up the same
                // transcript. (A session held by someone else's terminal still
                // cannot be joined; that branch is below.)
                const hosted = consoleHost.list().find(h =>
                    h.sessionId === s.sessionId && h.status !== 'ended' && h.status !== 'error');
                if (hosted) {
                    const MOVE = 'End it in the Console and continue here';
                    const go = await vscode.window.showWarningMessage(
                        `"${s.title}" is running in the Console right now.\n\n` +
                        'One session belongs to one process, so it cannot be in both at once — but this one is ours to close: Agent Farm can end it in the Console and continue the same session in a terminal.',
                        { modal: true }, MOVE, 'Show it in the Console');
                    if (go === 'Show it in the Console') {
                        void vscode.commands.executeCommand('agentfarm.resumeInConsole', s);
                        return;
                    }
                    if (go !== MOVE) { return; }
                    consoleHost.close(hosted.id);
                    ConsolePanel.refreshIfOpen();
                    // The registry entry goes when the process really dies —
                    // launching before that would be the second-process bug we
                    // just spent a release fixing. Wait for it (3s ceiling).
                    for (let i = 0; i < 30; i++) {
                        if (!ownerOf(readCliSessions(claudeDir()), s.sessionId)) { break; }
                        await new Promise(r => setTimeout(r, 100));
                    }
                }
                const owner = hosted ? undefined : ownerOf(readCliSessions(claudeDir()), s.sessionId);
                if (owner) {
                    const go = await vscode.window.showWarningMessage(
                        `"${s.title}" is already open in ${describeOwner(owner)}.\n\n` +
                        'Resuming it starts a SECOND process on the same transcript: both write to it, neither sees the other\'s turns, and the session list then shows one conversation that nobody actually had.',
                        { modal: true }, 'Jump to it instead', 'Open a second process anyway');
                    if (go === 'Jump to it instead') {
                        void vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                            sessionId: s.sessionId, agentName: s.agentName, cwd: s.cwd
                        });
                        return;
                    }
                    if (go !== 'Open a second process anyway') { return; }
                }
                const cwd = s.cwd && fs.existsSync(s.cwd) ? s.cwd : undefined;
                // Resume carries the launch defaults too: picking up yesterday's
                // conversation should not silently drop today's model choice.
                const merged = withDefaults({ resume: s.sessionId }, launchDefaults());
                // ‼️ …and it carries the project context too — the flag does not
                // survive `--resume` (measured), so a resumed session that is
                // not re-told knows nothing about its project. It is the
                // SESSION's project, never the window's: see sessionOwnProject.
                const own = sessionOwnProject(s);
                launchClaudeTerminal(`claude: ${s.agentName ?? s.sessionId.slice(0, 8)}`, cwd,
                    buildLaunchCommand('claude', {
                        ...merged, projectContextFile: projectContextFileFor(own || undefined)
                    }),
                    // '' = do not stamp. A resume does not decide where a session
                    // belongs; it already belongs somewhere, or deliberately nowhere.
                    undefined, s.sessionId, '');
            }),

        // ---------- A2: the shelf (pin + tags) ----------
        // Tree rows pass a SessionInfo (or a {session} wrapper) and toggle;
        // webviews, which flipped the star locally already, pass the state they
        // want as `wantPinned`. Deliberately NOT named `pinned`: a SessionInfo
        // carries its own `pinned` flag, and reading that as an instruction
        // would turn every click on a pinned tree row into "pin it again".
        vscode.commands.registerCommand('agentfarm.pinSession',
            async (arg?: (SessionRef & { wantPinned?: boolean }) | SessionInfo) => {
                const s = sessionFromArg(arg);
                const sessionId = s?.sessionId;
                if (!sessionId) { return; }
                const want = typeof (arg as { wantPinned?: boolean })?.wantPinned === 'boolean'
                    ? (arg as { wantPinned?: boolean }).wantPinned
                    : undefined;
                const marks = sessionMarks();
                const next = togglePin(marks, sessionId, want);
                await saveMarks(next);
                const nowPinned = isPinned(next, sessionId);
                const title = s?.title || index.all().find(x => x.sessionId === sessionId)?.title || sessionId.slice(0, 8);
                void vscode.window.setStatusBarMessage(
                    nowPinned
                        ? `$(pinned) Agent Farm: "${title}" is on your shelf`
                        : `Agent Farm: "${title}" taken off the shelf`, 4000);
            }),

        // The id is the handle every surface shows and the resume filter
        // searches — so it is worth one click, from wherever you can see it.
        vscode.commands.registerCommand('agentfarm.copySessionId',
            async (arg?: SessionRef | SessionInfo) => {
                const sessionId = sessionFromArg(arg)?.sessionId;
                if (!sessionId) {
                    void vscode.window.showInformationMessage(
                        'Agent Farm: this session has not reported its id yet — say something in it first.');
                    return;
                }
                await vscode.env.clipboard.writeText(sessionId);
                void vscode.window.setStatusBarMessage(
                    `$(clippy) Agent Farm: ${sessionId.slice(0, 8)} copied`, 4000);
            }),

        vscode.commands.registerCommand('agentfarm.tagSession',
            async (arg?: SessionRef | SessionInfo) => {
                const sessionId = sessionFromArg(arg)?.sessionId;
                if (!sessionId) { return; }
                const marks = sessionMarks();
                const known = allTags(marks);
                const value = await vscode.window.showInputBox({
                    prompt: 'Labels for this session, comma separated (empty = none)',
                    placeHolder: known.length ? `in use: ${known.join(', ')}` : 'e.g. zen, release, customer-x',
                    value: tagsOf(marks, sessionId).join(', '),
                    ignoreFocusOut: true
                });
                if (value === undefined) { return; }
                await saveMarks(setTags(marks, sessionId, parseTags(value)));
            }),

        // The shelf itself: pinned first, then the recent list, one Enter to
        // pick the conversation back up. This is the answer to "253 sessions,
        // and the six I actually live in are somewhere in there".
        vscode.commands.registerCommand('agentfarm.sessionShelf', async () => {
            interface ShelfItem extends vscode.QuickPickItem { s?: SessionInfo }
            const pinnedList = index.pinned();
            const rest = index.all()
                .filter(s => !s.pinned && !s.isSidechain)
                .sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime))
                .slice(0, 20);
            if (!pinnedList.length && !rest.length) {
                void vscode.window.showInformationMessage('Agent Farm: no sessions indexed yet.');
                return;
            }
            const openBtn = { iconPath: new vscode.ThemeIcon('book'), tooltip: 'Open the transcript instead' };
            const pinBtn = { iconPath: new vscode.ThemeIcon('pin'), tooltip: 'Pin / unpin' };
            const row = (s: SessionInfo): ShelfItem => ({
                label: `${s.pinned ? '$(pinned) ' : '$(comment-discussion) '}${s.title}`,
                description: [s.agentName, ...(s.tags ?? []), relTime(s.mtime)].filter(Boolean).join(' · '),
                detail: `${s.userTurns} turns · ${fmtUSD(s.cost)}${s.cwd ? ` · ${s.cwd}` : ''}`,
                buttons: [openBtn, pinBtn],
                s
            });
            const items: ShelfItem[] = [];
            if (pinnedList.length) {
                items.push({ label: 'Pinned', kind: vscode.QuickPickItemKind.Separator });
                items.push(...pinnedList.map(row));
            }
            items.push({ label: 'Recent', kind: vscode.QuickPickItemKind.Separator });
            items.push(...rest.map(row));
            const qp = vscode.window.createQuickPick<ShelfItem>();
            qp.items = items;
            qp.placeholder = pinnedList.length
                ? 'Enter resumes the session · ★ pins · 📖 opens the transcript'
                : 'Nothing pinned yet — the pin button (or the ★ on the Sessions table) builds your shelf';
            qp.matchOnDescription = true;
            qp.ignoreFocusOut = true;
            qp.onDidTriggerItemButton(async ev => {
                const s = ev.item.s;
                if (!s) { return; }
                if (ev.button === openBtn) {
                    qp.hide();
                    await vscode.commands.executeCommand('agentfarm.openSession', s.file);
                    return;
                }
                // pin, then re-open so the shelf comes back reordered
                qp.hide();
                await vscode.commands.executeCommand('agentfarm.pinSession', s);
                await vscode.commands.executeCommand('agentfarm.sessionShelf');
            });
            qp.onDidAccept(() => {
                const s = qp.selectedItems[0]?.s;
                qp.hide();
                if (!s) { return; }
                if (!s.isSidechain && !s.machine && s.cwd) {
                    void vscode.commands.executeCommand('agentfarm.resumeSession', s);
                } else {
                    void vscode.commands.executeCommand('agentfarm.openSession', s.file);
                }
            });
            qp.onDidHide(() => qp.dispose());
            qp.show();
        }),

        // ---------- A3 ----------
        vscode.commands.registerCommand('agentfarm.interruptSession',
            (arg?: SessionRef | SessionInfo) => {
                void interruptSession(sessionFromArg(arg));
            }),

        vscode.commands.registerCommand('agentfarm.endSession',
            async (arg?: SessionRef | SessionInfo) => {
                const s = sessionFromArg(arg);
                const sessionId = await pickLiveSessionId(s?.sessionId,
                    'End which session? (its claude process is stopped)');
                if (!sessionId) { return; }
                await endLiveSession(sessionId, s?.agentName);
            }),

        vscode.commands.registerCommand('agentfarm.dismissSession',
            async (arg?: (SessionRef & { gone?: boolean }) | SessionInfo) => {
                if ((arg as { gone?: boolean } | undefined)?.gone) {
                    // Sweep: every tracked session the OS no longer runs.
                    const owned = new Set(readCliSessions(claudeDir()).map(o => o.sessionId));
                    const registry = fs.existsSync(sessionsDir(claudeDir()));
                    const dead = registry
                        ? live.sessions().filter(s => !s.source && !owned.has(s.sessionId) &&
                            Date.now() - s.startedAt > 60_000)
                        : [];
                    if (!dead.length) {
                        void vscode.window.showInformationMessage(registry
                            ? 'Agent Farm: every tracked session still has a live process.'
                            : 'Agent Farm: the CLI session registry is not readable here, so a session cannot be proven finished — clear them one by one.');
                        return;
                    }
                    for (const s of dead) { live.dismiss(s.sessionId, 'cleared (no live process)', true); }
                    void vscode.window.showInformationMessage(
                        `Agent Farm: cleared ${dead.length} finished session(s) from the live timeline.`);
                    return;
                }
                const ref = sessionFromArg(arg);
                const sessionId = await pickLiveSessionId(ref?.sessionId,
                    'Clear which session from the live timeline?');
                if (!sessionId) { return; }
                const who = ref?.agentName
                    ?? live.sessions().find(s => s.sessionId === sessionId)?.agentName
                    ?? sessionId.slice(0, 8);
                // purge: card AND lane row leave together — see LiveMonitor.dismiss.
                if (!live.dismiss(sessionId, 'cleared in Agent Farm', true)) {
                    void vscode.window.showInformationMessage(
                        `Agent Farm: ${who} is not on the live timeline.`);
                    return;
                }
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${who} cleared from the live timeline — the session itself was not touched.`);
            }),

        // ---------- the project page, the tree and the active project ----------
        vscode.commands.registerCommand('agentfarm.openProjects', () => {
            ProjectsPanel.show(projectsPanelDeps());
        }),
        vscode.commands.registerCommand('agentfarm.openProject', (arg?: { id?: string } | string) => {
            const id = typeof arg === 'string' ? arg : arg?.id;
            ProjectsPanel.show(projectsPanelDeps(), id);
        }),

        vscode.commands.registerCommand('agentfarm.setActiveProject', async (arg?: { id?: string }) => {
            if (arg?.id !== undefined) {
                await context.workspaceState.update('af.activeProject', arg.id);
                projectsChanged();
                return;
            }
            await chooseActiveProject();
        }),

        vscode.commands.registerCommand('agentfarm.rescanProjects', async () => {
            const root = projectsRoot();
            if (!root) {
                const answer = await vscode.window.showWarningMessage(
                    'Agent Farm: no projects root is set, so there is nothing to scan.',
                    'Set agentFarm.projectsRoot');
                if (answer) {
                    void vscode.commands.executeCommand('workbench.action.openSettings', 'agentFarm.projectsRoot');
                }
                return;
            }
            if (!dirExists(root)) {
                void vscode.window.showWarningMessage(`Agent Farm: the projects root is not there — ${root}`);
                return;
            }
            const found = scanProjectsRoot(root);
            let renamed = 0;
            const strangers: typeof found = [];
            for (const f of found) {
                const known = f.id ? projectStore.get(f.id) : undefined;
                if (!known) { strangers.push(f); continue; }
                if (known.name !== f.name || known.folder !== f.folder) {
                    if (!projectStore.update(known.id, { name: f.name, folder: f.folder }).error) { renamed++; }
                }
            }
            projectsChanged();
            // Folders that look like projects but this machine has never seen are
            // OFFERED, never adopted silently: a scan that quietly invents
            // projects out of directories is a scan nobody can trust twice.
            const adoptable = strangers.filter(s => s.id);
            let adopted = 0;
            if (adoptable.length) {
                const picks = await vscode.window.showQuickPick(
                    adoptable.map(s => ({ label: s.name, description: s.folder, picked: true, s })),
                    {
                        canPickMany: true, ignoreFocusOut: true,
                        placeHolder: `${adoptable.length} folder(s) look like projects this window does not know — add them?`
                    });
                for (const p of picks ?? []) {
                    if (!projectStore.create({ name: p.s.name, folder: p.s.folder }).error) { adopted++; }
                }
                projectsChanged();
            }
            const noCharter = strangers.filter(s => !s.id).length;
            void vscode.window.showInformationMessage(
                `Agent Farm: scanned ${found.length} folder(s) — ${renamed} updated, ${adopted} added` +
                (noCharter ? `, ${noCharter} skipped (no project charter in them)` : '') + '.');
        }),

        // ---------- a session's project, from wherever a session is shown ----------
        // One command behind one menu item, and the shared session contract
        // (media/afSessionCtx.js) puts that item on every surface at once.
        vscode.commands.registerCommand('agentfarm.assignSessionProject', async (arg?: SessionCtxArg) => {
            const ids = sessionIdsFromArg(arg);
            if (!ids.length) {
                void vscode.window.showWarningMessage('Agent Farm: no session to file.');
                return;
            }
            const links = projectStore.links();
            const decided = ids.length === 1 ? links.sessions[ids[0]] : undefined;
            const many = ids.length > 1 ? ` (${ids.length} sessions)` : '';
            interface Row extends vscode.QuickPickItem { id?: string; act?: string }
            const pick = await vscode.window.showQuickPick<Row>([
                ...projectStore.all().map(p => ({
                    label: `${decided === p.id ? '$(check) ' : '$(blank) '}${p.icon ? p.icon + ' ' : ''}${p.name}`,
                    description: p.status, id: p.id
                })),
                { label: '', kind: vscode.QuickPickItemKind.Separator } as Row,
                {
                    label: `${decided === '' ? '$(check) ' : '$(blank) '}$(circle-slash) No project`,
                    description: 'and keep it that way — folder and agent rules will not claim it back',
                    act: 'none'
                },
                {
                    label: '$(discard) Forget the decision',
                    description: 'let the folder / agent rules decide again',
                    act: 'forget'
                },
                { label: '$(add) New project from this session…', act: 'fromSession' }
            ], { placeHolder: `Project for this session${many}`, ignoreFocusOut: true });
            if (!pick) { return; }
            if (pick.act === 'fromSession') {
                await vscode.commands.executeCommand('agentfarm.projectFromSession', arg);
                return;
            }
            const value = pick.act === 'forget' ? undefined : (pick.act === 'none' ? '' : (pick.id ?? ''));
            const changed = projectStore.assignSessions(ids, value);
            projectsChanged();
            const where = pick.act === 'forget' ? 'left to the rules'
                : pick.act === 'none' ? 'taken off every project'
                    : `filed under "${projectStore.get(pick.id ?? '')?.name}"`;
            void vscode.window.showInformationMessage(
                `Agent Farm: ${changed} session${changed === 1 ? '' : 's'} ${where}.`);
        }),

        // The fastest possible backfill: the session already knows the folder
        // the work happened in, so the form opens with that folder as a code
        // root — which will claim every past and future session from the same
        // place — and with the selected sessions ready to be filed the moment
        // the project exists.
        vscode.commands.registerCommand('agentfarm.projectFromSession', (arg?: SessionCtxArg) => {
            const ids = sessionIdsFromArg(arg);
            const first = ids.length ? sessionFromArg(ids[0]) : undefined;
            const suggestedName = (first?.title ?? '').split(/[.\n]/)[0].trim().slice(0, 60);
            ProjectsPanel.show(projectsPanelDeps(), undefined, {
                suggestName: suggestedName,
                ...(first?.cwd ? { repos: [first.cwd] } : {}),
                ...(ids.length ? { sessionIds: ids } : {})
            });
        }),

        // Turn a one-off assignment into a standing rule: everything that ever
        // ran in this folder belongs to the project, not just this session.
        vscode.commands.registerCommand('agentfarm.addSessionFolderToProject', async (arg?: SessionCtxArg) => {
            const ids = sessionIdsFromArg(arg);
            const s = ids.length ? sessionFromArg(ids[0]) : undefined;
            if (!s?.cwd) {
                void vscode.window.showWarningMessage('Agent Farm: this session does not say where it ran.');
                return;
            }
            const pick = await vscode.window.showQuickPick(
                projectStore.all().map(p => ({ label: p.name, description: (p.repos ?? []).join(' · '), id: p.id })),
                { placeHolder: `Add ${s.cwd} as a code root of…`, ignoreFocusOut: true });
            if (!pick) { return; }
            const p = projectStore.get(pick.id);
            if (!p) { return; }
            const repos = [...(p.repos ?? [])];
            if (!repos.some(r => normPath(r) === normPath(s.cwd ?? ''))) { repos.push(s.cwd); }
            projectStore.update(p.id, { repos });
            projectsChanged();
            void vscode.window.showInformationMessage(
                `Agent Farm: sessions under ${s.cwd} now fall to "${p.name}".`);
        }),

        // ---------- managing projects ----------
        // A project is created ON THE PAGE — the form is right there, with the
        // name, the folder and the rest of the fields in one place. This command
        // exists so the palette, the tree and the dashboard's link all arrive at
        // that same form instead of each growing its own prompt sequence.
        vscode.commands.registerCommand('agentfarm.newProject', (seed?: { suggestName?: string }): void => {
            ProjectsPanel.show(projectsPanelDeps(), undefined,
                { suggestName: seed?.suggestName ?? '' });
        }),

        // The palette entry people already know. It used to open a quick-pick
        // list of projects; the page IS that list, and it can also edit them.
        vscode.commands.registerCommand('agentfarm.manageProjects', () => {
            ProjectsPanel.show(projectsPanelDeps());
        }),

        // Which project should this agent's sessions fall to when nothing else
        // claims them? A RULE, not membership — the agent may feed several
        // projects, and an explicit session assignment always outranks this.
        vscode.commands.registerCommand('agentfarm.assignProject', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const projects = projectStore.all();
            const has = (p: Project) =>
                (p.match?.agents ?? []).some(a => a.toLowerCase() === agent.name.toLowerCase());
            interface Row extends vscode.QuickPickItem { id?: string; act?: string }
            const pick = await vscode.window.showQuickPick<Row>([
                ...projects.map(p => ({
                    label: `${has(p) ? '$(check) ' : '$(blank) '}${p.name}`,
                    description: (p.match?.agents ?? []).join(', ') || 'no agent rules',
                    id: p.id
                })),
                ...(projects.some(has)
                    ? [{ label: '$(circle-slash) No rule', description: 'take this agent out of every project rule', act: 'none' }]
                    : []),
                { label: '$(add) New project…', description: 'opens the form on the Projects page', act: 'new' }
            ], {
                placeHolder: `Default project for ${agent.name}'s sessions (an explicit assignment still wins)`,
                ignoreFocusOut: true
            });
            if (!pick) { return; }

            const setRule = (p: Project, on: boolean): void => {
                const rest = (p.match?.agents ?? []).filter(a => a.toLowerCase() !== agent.name.toLowerCase());
                const next = on ? [...rest, agent.name] : rest;
                projectStore.update(p.id, { match: next.length ? { agents: next } : undefined });
            };
            if (pick.act === 'none') {
                for (const p of projects) { if (has(p)) { setRule(p, false); } }
            } else if (pick.act === 'new') {
                // the page owns creation; its form has the agent rules on it
                void vscode.commands.executeCommand('agentfarm.newProject');
                return;
            } else if (pick.id) {
                // the rule moves rather than accumulating: two projects claiming
                // the same agent by rule would make the fallback arbitrary
                for (const p of projects) { setRule(p, p.id === pick.id); }
            }
            projectsChanged();
        }),

        // ---------- DALGA 1: the Console ----------
        vscode.commands.registerCommand('agentfarm.openConsole', (arg?: { agentId?: string }) => {
            ConsolePanel.show(consoleDeps, arg && typeof arg === 'object' ? arg : undefined);
        }),

        /*
         * The Console card's own menu — the composer's bottom row, on the row
         * you are pointing at.
         *
         * With eight sessions in the left panel, ending one meant selecting it
         * first (which changes the conversation you were reading) and then
         * finding the button under the box. These act on the card that was
         * right-clicked, whichever one you are looking at.
         *
         * The state that decides what is greyed out comes from the card itself
         * (`afConsoleWorking` / `afConsoleLive` / `afConsoleEnded` in
         * `data-vscode-context`, read by the `enablement` clauses in
         * package.json). `enablement` disables a menu item; it does not stop a
         * command from being executed by other means, so each handler still
         * says what it will not do and why.
         */
        vscode.commands.registerCommand('agentfarm.consoleInterruptTurn', (arg?: { hostId?: string }) => {
            const id = consoleRowId(arg);
            if (!id) { return; }
            const s = consoleHost.get(id);
            if (s?.status !== 'working') {
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${s?.agentName ?? 'that session'} is not in the middle of a turn.`);
                return;
            }
            consoleHost.interrupt(id);
            ConsolePanel.refreshIfOpen();
        }),

        vscode.commands.registerCommand('agentfarm.consoleEndSession', (arg?: { hostId?: string }) => {
            const id = consoleRowId(arg);
            if (!id) { return; }
            // Same as the composer's End session: the process stops, the row
            // stays (with everything that was said) until it is removed.
            consoleHost.close(id);
            ConsolePanel.refreshIfOpen();
        }),

        vscode.commands.registerCommand('agentfarm.consoleForgetSession', (arg?: { hostId?: string }) => {
            const id = consoleRowId(arg);
            if (!id) { return; }
            const s = consoleHost.get(id);
            if (s && s.status !== 'ended' && s.status !== 'error') {
                // The menu greys this out, so reaching here means the command
                // was run another way. Removing a live row would kill a running
                // conversation as a side effect of "tidy up" — say the order.
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${s.agentName}'s session is still running — end it first, then remove it from the list.`);
                return;
            }
            // the transcript stays on disk; this only takes the row off the panel
            consoleHost.forget(id);
            ConsolePanel.refreshIfOpen();
        }),

        // From a session row: pick that conversation back up INSIDE the panel.
        // Same ownership rule as everywhere else — a session a process already
        // owns cannot be joined, only jumped to.
        vscode.commands.registerCommand('agentfarm.resumeInConsole',
            async (arg?: SessionRef | SessionInfo) => {
                const s = sessionFromArg(arg);
                if (!s?.sessionId || !s.cwd) {
                    // A row WAS right-clicked but the session has no id or no
                    // folder yet (a Console session before its first turn, an
                    // imported transcript): silence would read as a dead item.
                    if (arg) {
                        void vscode.window.showInformationMessage(s?.sessionId
                            ? 'Agent Farm: that session has no working folder on record, so it cannot be resumed in the Console.'
                            : 'Agent Farm: this session has not reported its id yet — say something in it first.');
                    }
                    return;
                }
                // our own leftover first — see leftoverOwner
                const left = leftoverOwner(s.sessionId);
                if (left) {
                    const go = await vscode.window.showWarningMessage(
                        `"${s.title}" is still running from an earlier window of Agent Farm (pid ${left.pid}) — nothing is reading it.`,
                        {
                            modal: true,
                            detail: 'Claude Code cannot join a running session, so it cannot be picked up while that process holds it.\n\n'
                                + 'Agent Farm can end the leftover and continue here: the transcript stays on disk and everything that was said comes back with it.'
                        },
                        'End it and continue here');
                    if (go !== 'End it and continue here') { return; }
                    if (!await endLeftover(s.sessionId, left.pid)) {
                        void vscode.window.showWarningMessage(
                            `Agent Farm: pid ${left.pid} is still holding that session — nothing was resumed.`);
                        return;
                    }
                }
                const owner = ownerOf(readCliSessions(claudeDir()), s.sessionId);
                if (owner) {
                    const go = await vscode.window.showWarningMessage(
                        `"${s.title}" is open right now in ${describeOwner(owner)}.\n\n` +
                        'Claude Code cannot join a running session — resuming it here would start a second process on the same transcript, and the two would never see each other\'s turns.',
                        { modal: true }, 'Jump to it instead');
                    if (go === 'Jump to it instead') {
                        void vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                            sessionId: s.sessionId, agentName: s.agentName, cwd: s.cwd
                        });
                    }
                    return;
                }
                const already = consoleHost.list().find(h =>
                    h.sessionId === s.sessionId && h.status !== 'ended' && h.status !== 'error');
                const agent = agents.find(a => a.name === s.agentName);
                const id = already?.id ?? consoleHost.start({
                    agentId: agent?.id ?? '', agentName: s.agentName ?? 'session',
                    cwd: s.cwd, resume: s.sessionId, ...launchDefaults(),
                    // ‼️ …and the project it is TOLD about is its OWN, never the
                    // window's active one — see sessionOwnProject. The context
                    // does not survive `--resume` (measured), so this is the
                    // spawn that has to re-tell it.
                    projectId: sessionOwnProject(s),
                    // resume means CONTINUE: the earlier conversation comes with
                    // it, and so does what it has already spent
                    history: consoleHistory(s.sessionId),
                    carried: carriedTotals(s)
                });
                ConsolePanel.show(consoleDeps, { sessionId: id });
            }),

        // From an agent row: open the Console with a hosted session for THAT
        // agent already running, so the path from "which agent" to "typing at
        // it" is one click instead of a page plus a picker.
        vscode.commands.registerCommand('agentfarm.consoleForAgent', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            // Always the composer, with this agent chosen. Landing on an
            // existing session for the same agent looked identical to plain
            // "Open Console" — which is exactly what the button has to differ
            // from. A session that IS already running for this agent is one
            // click away in the left panel, and the composer says so.
            ConsolePanel.show(consoleDeps, { agentId: agent.id });
        }),

        // ---------- C1: the web view, and how to reach it ----------
        vscode.commands.registerCommand('agentfarm.openWebView', async () => {
            let w = webCfg();
            if (!w.enabled || !w.token) {
                const bindPick = await vscode.window.showQuickPick([
                    {
                        label: '$(device-desktop) This machine only',
                        detail: 'http://127.0.0.1 — a browser on this computer',
                        bind: 'local' as const
                    },
                    {
                        label: '$(radio-tower) This machine and my network',
                        detail: 'your phone or a second machine on the same Wi-Fi can open it — read-only, token required',
                        bind: 'lan' as const
                    }
                ], { placeHolder: 'Who should be able to open the read-only web view?', ignoreFocusOut: true });
                if (!bindPick) { return; }
                const token = w.token || generateToken();
                try {
                    await cfg().update('web.token', token, vscode.ConfigurationTarget.Global);
                    await cfg().update('web.bind', bindPick.bind, vscode.ConfigurationTarget.Global);
                    await cfg().update('web.enabled', true, vscode.ConfigurationTarget.Global);
                } catch (e) {
                    void vscode.window.showWarningMessage(`Agent Farm: could not save the web settings — ${String(e)}`);
                    return;
                }
                applyWebServer();
                w = webCfg();
            }
            writeWebSnapshot();
            const host = w.bind === 'lan' ? lanAddress() : '127.0.0.1';
            const url = `http://${host}:${w.port}/?t=${w.token}`;
            const choice = await vscode.window.showInformationMessage(
                `Agent Farm web view: ${url}` +
                (w.bind === 'lan'
                    ? ' — reachable from your phone on the same network. Anyone with this link can READ the dashboard.'
                    : ' — this machine only.'),
                'Open in browser', 'Copy URL', 'Settings');
            if (choice === 'Open in browser') { void vscode.env.openExternal(vscode.Uri.parse(url)); }
            if (choice === 'Copy URL') {
                await vscode.env.clipboard.writeText(url);
                void vscode.window.setStatusBarMessage('$(check) Agent Farm: web view URL copied', 4000);
            }
            if (choice === 'Settings') {
                void vscode.commands.executeCommand('agentfarm.openFarmSettings', { focus: 'agentFarm.web.enabled' });
            }
        }),

        // ---------- C3: connecting the chat channel ----------
        vscode.commands.registerCommand('agentfarm.connectTelegram', async () => {
            const existing = vault.get(TELEGRAM_SECRET);
            const token = await vscode.window.showInputBox({
                prompt: 'Telegram bot token (from @BotFather) — stored in the Agent Farm secret vault, never in settings',
                value: existing ?? '', password: true, ignoreFocusOut: true
            });
            if (token === undefined) { return; }
            if (!token.trim()) {
                void vscode.window.showWarningMessage('Agent Farm: no token given — the chat bridge stays off.');
                return;
            }
            let who: { ok: boolean; username?: string };
            try { who = await getMe(token.trim()); }
            catch (e) {
                void vscode.window.showWarningMessage(`Agent Farm: could not reach Telegram — ${String(e)}`);
                return;
            }
            if (!who.ok) {
                void vscode.window.showWarningMessage('Agent Farm: Telegram rejected that token.');
                return;
            }
            vault.set(TELEGRAM_SECRET, token.trim());
            const c = chatCfg();
            try {
                await cfg().update('telegram.enabled', true, vscode.ConfigurationTarget.Global);
            } catch { /* schema not registered yet — the setting page still works */ }
            await applyChatBridge();
            const next = c.allow.length
                ? `Allowed chats: ${c.allow.join(', ')}.`
                : 'Now message @' + (who.username ?? 'your bot') +
                  ' once — it will reply with the chat id, and adding that id to agentFarm.telegram.allowedChats switches the bridge on for it.';
            void vscode.window.showInformationMessage(
                `Agent Farm: connected to @${who.username ?? '?'} — ${next}`, 'Settings')
                .then(x => {
                    if (x === 'Settings') {
                        void vscode.commands.executeCommand('agentfarm.openFarmSettings',
                            { focus: 'agentFarm.telegram.allowedChats' });
                    }
                });
        }),

        // ---------- B2: the fleet on one screen ----------
        vscode.commands.registerCommand('agentfarm.openPortfolio', () => {
            PortfolioPanel.show({
                extensionUri: context.extensionUri,
                getAgents: () => agents,
                index,
                getInsights: () => insights,
                live,
                projects: () => projectDefs(),
                budgets: () => cfg().get<Record<string, number>>('budgets', {})
            });
        }),

        // ---------- B3: open / diff a file the agent wrote ----------
        vscode.commands.registerCommand('agentfarm.openEditedFile',
            async (arg?: { file?: string; diff?: boolean }) => {
                const file = arg?.file;
                if (!file) { return; }
                if (!fs.existsSync(file)) {
                    void vscode.window.showWarningMessage(
                        `Agent Farm: ${path.basename(file)} no longer exists on disk — the session's own hunks are still in the transcript.`);
                    return;
                }
                if (!arg?.diff) {
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
                    return;
                }
                // "vs HEAD" is a DIFFERENT question from "what this session wrote":
                // it shows what is uncommitted right now, whoever wrote it.
                gitRoot(path.dirname(file), root => {
                    if (!root) {
                        void vscode.window.showInformationMessage(
                            'Agent Farm: not inside a git repository — opening the file instead.');
                        void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
                        return;
                    }
                    const rel = repoRelative(root, file);
                    contentAtHead(root, rel, content => {
                        const dir = path.join(context.globalStorageUri.fsPath, 'headcache');
                        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
                        const left = path.join(dir, `HEAD_${path.basename(file)}`);
                        try { fs.writeFileSync(left, content ?? '', 'utf8'); } catch { /* read-only fs */ }
                        void vscode.commands.executeCommand('vscode.diff',
                            vscode.Uri.file(left), vscode.Uri.file(file),
                            `${path.basename(file)} — ${content === undefined ? 'new file' : 'HEAD'} ↔ working tree`,
                            { preview: true });
                    });
                });
            }),

        // ---------- A4: one key for 170 commands ----------
        vscode.commands.registerCommand('agentfarm.quickMenu', async () => {
            interface MenuItem extends vscode.QuickPickItem { command?: string }
            const items: MenuItem[] = [];
            for (const group of QUICK_MENU_GROUPS) {
                const entries = QUICK_MENU.filter(e => e.group === group);
                if (!entries.length) { continue; }
                items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
                for (const e of entries) {
                    items.push({
                        label: e.label,
                        description: e.key ? e.key.replace('ctrl+alt+', 'Ctrl+Alt+') : '',
                        detail: e.detail,
                        command: e.command
                    });
                }
            }
            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: 'Agent Farm — what do you want to do?',
                matchOnDetail: true, matchOnDescription: true
            });
            if (pick?.command) { await vscode.commands.executeCommand(pick.command); }
        }),

        vscode.commands.registerCommand('agentfarm.renameSession',
            async (arg?: SessionRef | SessionInfo) => {
                const s = sessionFromArg(arg);
                if (!s?.sessionId) {
                    // A row WAS right-clicked but carries no id yet: that only
                    // happens to a brand-new Console session before its first
                    // turn. Say so — silence would read as a broken menu item.
                    if (arg) {
                        void vscode.window.showInformationMessage(
                            'Agent Farm: this session has not reported its id yet — say something in it first, then rename it.');
                    }
                    return;
                }
                const value = await vscode.window.showInputBox({
                    prompt: 'Session name (leave empty to restore the automatic title)',
                    value: s.title, ignoreFocusOut: true
                });
                if (value === undefined) { return; }
                await applySessionTitle(s.sessionId, value);
            }),

        vscode.commands.registerCommand('agentfarm.openTimeline', () => {
            showTimeline();
        }),

        // The status-bar indicator's "Check now" — the same forced read the
        // Dashboard card's ⟳ and the usage.plan bridge op perform, on the same
        // cache, so there is one implementation and one request budget.
        vscode.commands.registerCommand('agentfarm.planUsageRefresh', async () => {
            const snap = await planUsage.get(true);
            planUsageBar.paint();
            DashboardPanel.refreshIfOpen();
            if (snap.state !== 'ok') {
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${snap.note ?? 'the usage endpoint could not be read.'}`);
            }
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

        vscode.commands.registerCommand('agentfarm.openAirtable', () => {
            AirtablePanel.show({
                extensionUri: context.extensionUri,
                storageDir: airtableStorage,
                extVersion,
                cacheFile: toolboxProbeCacheFile
            });
        }),

        vscode.commands.registerCommand('agentfarm.openToolbox', () => {
            ToolboxPanel.show({
                extensionUri: context.extensionUri,
                getAgents: () => agents,
                index,
                cacheFile: toolboxProbeCacheFile,
                refreshTrees: refreshAll
            });
        }),

        vscode.commands.registerCommand('agentfarm.openSecrets', () => {
            SecretsPanel.show({
                extensionUri: context.extensionUri,
                vault,
                getAgents: () => agents
            });
        }),

        vscode.commands.registerCommand('agentfarm.openTurns', () => {
            TurnsPanel.show({
                extensionUri: context.extensionUri,
                index,
                getPricing: () => pricing,
                lastExportDir: () => context.globalState.get<string>('agentfarm.lastExportDir'),
                setLastExportDir: (dir: string) => { void context.globalState.update('agentfarm.lastExportDir', dir); }
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
                    showTimeline();
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

        // One click, no questions — but it now carries agentFarm.launchDefaults,
        // so "always opus, always acceptEdits" is set once instead of typed
        // into every terminal. Empty defaults = the bare `claude` of before.
        vscode.commands.registerCommand('agentfarm.startSession',
            async (arg: AgentArg & { surface?: RunSurface }) => {
                const agent = await resolveAgent(arg);
                if (!agent) { return; }
                // `project: true` — a new session gets the project box wherever
                // it is started from, not only in the Console's composer.
                const where = arg?.surface
                    ?? await pickRunSurface(`New session for ${agent.name}`, { project: true });
                if (!where) { return; }
                if (where === 'console') { startConsoleSession(agent); return; }
                startClaudeSession(agent);
            }),

        vscode.commands.registerCommand('agentfarm.continueSession',
            async (arg: AgentArg & { surface?: RunSurface }) => {
                const agent = await resolveAgent(arg);
                if (!agent) { return; }
                const where = arg?.surface ?? await pickRunSurface(`Continue ${agent.name}'s latest session`);
                if (!where) { return; }
                if (where === 'terminal') {
                    startClaudeSession(agent, { continueLast: true });
                    return;
                }
                // `claude --continue` is a terminal affordance: it picks the most
                // recent session in the folder itself. A hosted session resumes
                // by ID, so "latest" has to be resolved here — and if there is
                // none, say so instead of opening an empty conversation that
                // looks like it lost the history.
                const latest = index.all()
                    .filter(s => !s.isSidechain && !s.machine && s.sessionId
                        && normPath(s.cwd ?? '') === normPath(agent.dir))
                    .sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime))[0];
                if (!latest) {
                    const start = await vscode.window.showInformationMessage(
                        `Agent Farm: ${agent.name} has no earlier session in ${agent.dir} to continue.`,
                        'Start a new one in the Console');
                    if (start) { startConsoleSession(agent); }
                    return;
                }
                await vscode.commands.executeCommand('agentfarm.resumeInConsole', latest);
            }),

        // A1: the same start, with every dimension on the table first — including
        // WHERE it runs, which is a dimension like any other (see the Where row).
        vscode.commands.registerCommand('agentfarm.launchSession',
            async (arg: AgentArg & { surface?: RunSurface }) => {
                const agent = await resolveAgent(arg);
                if (!agent) { return; }
                // Seeded with what this agent was last launched with — the second
                // time you start the same kind of session it is one Enter.
                await runLauncher(agent, { ...(lastLaunch()[agent.id] ?? {}) }, arg?.surface);
            }),

        // E1: open a session with a different CLI (gemini/codex/…) WITHOUT touching
        // the claude path — a sibling command. The claude default stays untouched.
        vscode.commands.registerCommand('agentfarm.startSessionWith', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            const profiles = cfg().get<CliProfile[]>('cliProfiles', []);
            if (!profiles.length) {
                const add = await vscode.window.showInformationMessage(
                    'Agent Farm: no alternative CLIs configured. Add one in agentFarm.cliProfiles (e.g. gemini, codex).',
                    'Open Settings');
                if (add === 'Open Settings') {
                    void vscode.commands.executeCommand('workbench.action.openSettings', 'agentFarm.cliProfiles');
                }
                return;
            }
            const lastByAgent = context.globalState.get<Record<string, string>>(AGENT_CLI_KEY, {});
            const last = lastByAgent[agent.id] ?? 'claude';
            interface CliPick extends vscode.QuickPickItem { id: string; profile?: CliProfile }
            const items: CliPick[] = [
                { id: 'claude', label: 'Claude Code', description: 'the default executor', profile: undefined },
                ...profiles.map(p => ({ id: p.name, label: p.name, description: p.interactive ?? p.headless, profile: p }))
            ];
            for (const it of items) { if (it.id === last) { it.description += ' • last used'; } }
            items.sort((a, b) => (a.id === last ? -1 : 0) - (b.id === last ? -1 : 0)); // last-used first
            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: `Start a session for ${agent.name} with…`, ignoreFocusOut: true
            });
            if (!pick) { return; }
            const command = pick.profile
                ? (buildCliCommand(pick.profile.interactive ?? pick.profile.headless, '', '') || pick.profile.name)
                : 'claude';
            // E2a: claude sessions report themselves via hooks; external CLIs
            // don't, so track the terminal lifecycle instead. In external-terminal
            // mode there is no terminal object — lifecycle honestly untracked.
            // E2b: the terminal carries AGENT_FARM_* env vars so a hook/notify
            // wired inside it (see cliHook.js) can feed richer events onto the
            // same timeline lane without any per-CLI code here.
            const sessionId = pick.profile ? `cli:${pick.id}:${agent.id}:${Date.now()}` : undefined;
            const env = sessionId ? {
                AGENT_FARM_SESSION: sessionId,
                AGENT_FARM_CWD: agent.dir,
                AGENT_FARM_EVENT_PORT: String(cfg().get<number>('livePort', 8377)),
                AGENT_FARM_HOOK: vscode.Uri.joinPath(context.extensionUri, 'out', 'service', 'cliHook.js').fsPath
            } : undefined;
            const term = launchClaudeTerminal(`${pick.id}: ${agent.name}`, agent.dir, command, env, sessionId);
            if (sessionId && term) {
                cliTerminals.set(term, { sessionId, cwd: agent.dir });
                live.handle({ session_id: sessionId, cwd: agent.dir, hook_event_name: 'SessionStart', source: pick.id });
            }
            void context.globalState.update(AGENT_CLI_KEY, { ...lastByAgent, [agent.id]: pick.id });
        }),

        vscode.commands.registerCommand('agentfarm.openAgentInNewWindow', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(agent.dir), { forceNewWindow: true });
        }),

        vscode.commands.registerCommand('agentfarm.revealAgent', async (arg: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            await revealPath(agent.dir);
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
            // daily/weekly: what happens when the time passes with VS Code closed
            let missed: MissedPolicy | undefined;
            if (kindPick.sched !== 'once') {
                const missedPick = await vscode.window.showQuickPick(MISSED_POLICY_PICKS,
                    { ignoreFocusOut: true, placeHolder: 'If the scheduled time is missed (no VS Code window open)?' });
                if (!missedPick) { return; }
                missed = missedPick.missed;
            }
            taskManager.addSchedule({
                agentId: agent.id, agentName: agent.name, title, prompt,
                mode: mode.mode, kind: kindPick.sched, hour, minute, dow, onceAt, enabled: true, missed
            });
            void vscode.window.showInformationMessage(
                `Agent Farm: schedule "${title}" created (runs while VS Code is open` +
                (missed === 'run' ? '; a missed time is caught up in the next window' : '') + ').');
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
        // Parity with editTrigger — changing a schedule's time used to mean delete + recreate.
        vscode.commands.registerCommand('agentfarm.editSchedule', async (node?: TaskNode) => {
            if (node?.kind !== 'schedule') { return; }
            const s = node.schedule;
            const p2 = (n: number) => String(n).padStart(2, '0');
            const title = await vscode.window.showInputBox({
                prompt: 'Schedule title', value: s.title, ignoreFocusOut: true
            });
            if (!title) { return; }
            const prompt = await vscode.window.showInputBox({
                prompt: 'Prompt to send to claude', value: s.prompt, ignoreFocusOut: true
            });
            if (!prompt) { return; }
            let { hour, minute, dow, onceAt } = s;
            if (s.kind === 'once') {
                const cur = onceAt ? new Date(onceAt) : new Date();
                const when = await vscode.window.showInputBox({
                    prompt: 'When? (YYYY-MM-DD HH:MM)', ignoreFocusOut: true,
                    value: `${cur.getFullYear()}-${p2(cur.getMonth() + 1)}-${p2(cur.getDate())} ${p2(cur.getHours())}:${p2(cur.getMinutes())}`,
                    validateInput: v => isNaN(Date.parse(v.replace(' ', 'T'))) ? 'Use YYYY-MM-DD HH:MM' : undefined
                });
                if (!when) { return; }
                onceAt = Date.parse(when.replace(' ', 'T'));
            } else {
                const time = await vscode.window.showInputBox({
                    prompt: 'Time of day (HH:MM)', value: `${p2(s.hour)}:${p2(s.minute)}`, ignoreFocusOut: true,
                    validateInput: v => /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? undefined : 'Use HH:MM (24h)'
                });
                if (!time) { return; }
                [hour, minute] = time.split(':').map(Number);
                if (s.kind === 'weekly') {
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayPick = await vscode.window.showQuickPick(
                        days.map((d, i) => ({ label: `${d}${i === s.dow ? ' (current)' : ''}`, dow: i })),
                        { ignoreFocusOut: true, placeHolder: 'Which day?' });
                    if (!dayPick) { return; }
                    dow = dayPick.dow;
                }
            }
            let missed = s.missed;
            if (s.kind !== 'once') {
                const cur = s.missed ?? 'skip';
                const missedPick = await vscode.window.showQuickPick(
                    MISSED_POLICY_PICKS.map(p => ({ ...p, label: `${p.label}${p.missed === cur ? ' (current)' : ''}` })),
                    { ignoreFocusOut: true, placeHolder: 'If the scheduled time is missed (no VS Code window open)?' });
                if (!missedPick) { return; }
                missed = missedPick.missed;
            }
            const model = await pickAutomationModel(s.model);
            if (model === undefined) { return; }
            const fireIf = await pickPrecondition(s.fireIf, s.title);
            if (fireIf === undefined) { return; }
            const patch: Partial<FarmSchedule> = {
                title, prompt, hour, minute, dow, onceAt, missed,
                model: model || undefined, fireIf: fireIf.value
            };
            // switching catch-up ON settles the past first — otherwise the edit
            // itself would instantly fire an occurrence from before the choice
            if (missed !== (s.missed ?? 'skip') && missed !== 'skip') {
                patch.lastRunKey = previousOccurrenceKey({ kind: s.kind, dow }, new Date());
            }
            taskManager.updateSchedule(s.id, patch);
        }),
        vscode.commands.registerCommand('agentfarm.runScheduleNow', (node?: TaskNode) => {
            if (node?.kind === 'schedule') { taskManager.runScheduleNow(node.schedule); }
        }),

        // ---- the automation gate: master switch · quiet hours ----
        vscode.commands.registerCommand('agentfarm.pauseAutomations', async () => {
            const pick = await vscode.window.showQuickPick([
                { label: '$(debug-pause) Pause indefinitely', mins: 0, description: 'until you resume' },
                { label: '$(clock) Pause for 1 hour', mins: 60 },
                { label: '$(clock) Pause for 8 hours', mins: 480 },
                { label: '$(clock) Pause for 24 hours', mins: 1440 }
            ], { ignoreFocusOut: true, placeHolder: 'Master switch — nothing fires on its own while paused' });
            if (!pick) { return; }
            const reason = await vscode.window.showInputBox({
                title: 'Why? (shown in the UI so a forgotten pause is explainable)',
                placeHolder: 'e.g. reviewing cost', ignoreFocusOut: true
            });
            if (reason === undefined) { return; }
            taskManager.setAutomationState(pick.mins
                ? { paused: false, pausedUntil: Date.now() + pick.mins * 60_000, pauseReason: reason }
                : { paused: true, pausedUntil: undefined, pauseReason: reason });
            TasksPanel.refreshIfOpen();
            LivingPanel.refreshIfOpen();
            void vscode.window.showInformationMessage(
                `Agent Farm: automations paused${pick.mins ? ` for ${pick.mins} min` : ''}.`);
        }),
        vscode.commands.registerCommand('agentfarm.resumeAutomations', () => {
            taskManager.setAutomationState({ paused: false, pausedUntil: undefined, pauseReason: undefined });
            TasksPanel.refreshIfOpen();
            LivingPanel.refreshIfOpen();
            void vscode.window.showInformationMessage('Agent Farm: automations resumed.');
        }),
        vscode.commands.registerCommand('agentfarm.setQuietHours', async () => {
            const cur = taskManager.automation;
            const pick = await vscode.window.showQuickPick([
                { label: '🌙 23:00 – 07:00', from: '23:00', to: '07:00', description: 'nothing wakes overnight' },
                { label: '🌙 00:00 – 08:00', from: '00:00', to: '08:00' },
                { label: '$(edit) Custom…', from: '', to: '' },
                { label: '$(circle-slash) Turn quiet hours off', from: 'off', to: 'off' }
            ], {
                ignoreFocusOut: true,
                placeHolder: cur.quietFrom
                    ? `Quiet hours (currently ${cur.quietFrom}–${cur.quietTo})`
                    : 'Quiet hours (currently off) — a due schedule is DEFERRED to the window end, never dropped'
            });
            if (!pick) { return; }
            if (pick.from === 'off') {
                taskManager.setAutomationState({ quietFrom: undefined, quietTo: undefined });
                TasksPanel.refreshIfOpen();
                LivingPanel.refreshIfOpen();
                void vscode.window.showInformationMessage('Agent Farm: quiet hours off.');
                return;
            }
            let { from, to } = pick;
            if (!from) {
                const ask = async (what: string, def: string) => vscode.window.showInputBox({
                    title: `Quiet hours — ${what}`, value: def, ignoreFocusOut: true,
                    validateInput: v => /^\d{1,2}:\d{2}$/.test(v.trim()) ? undefined : 'Use HH:MM (e.g. 23:00).'
                });
                const f = await ask('start', cur.quietFrom || '23:00');
                if (!f) { return; }
                const t = await ask('end', cur.quietTo || '07:00');
                if (!t) { return; }
                from = f.trim(); to = t.trim();
            }
            taskManager.setAutomationState({ quietFrom: from, quietTo: to });
            TasksPanel.refreshIfOpen();
            LivingPanel.refreshIfOpen();
            void vscode.window.showInformationMessage(`Agent Farm: quiet hours ${from}–${to}.`);
        }),

        vscode.commands.registerCommand('agentfarm.quickStart', () => {
            GuidePanel.show(context.extensionUri, 'hizli-baslangic');
        }),

        vscode.commands.registerCommand('agentfarm.openExamples', (anchor?: string) => {
            GuidePanel.show(context.extensionUri,
                typeof anchor === 'string' ? anchor : undefined, 'examples');
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
                placeHolder: 'e.g. Act on the answered questions and remove them from the file'
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
            taskManager.addTrigger(dutyTriggerSpec(node.agent, d));
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

        // The Studio is the content-production page; the old "Open Media
        // Gallery" entry point still works and lands on its Assets tab, which
        // is what the gallery was.
        vscode.commands.registerCommand('agentfarm.openStudio', (arg?: { tab?: string; projectId?: string }) => {
            StudioPanel.show(studioDeps, arg && typeof arg === 'object' ? arg : undefined);
        }),

        vscode.commands.registerCommand('agentfarm.openGallery', () => {
            StudioPanel.show(studioDeps, { tab: 'assets' });
        }),

        // Wave A: scene-by-scene production manifest (production.json in an agent folder).
        vscode.commands.registerCommand('agentfarm.newProduction', async () => {
            const agent = await resolveAgent(undefined);
            if (!agent) { return; }
            const file = path.join(agent.dir, PRODUCTION_FILENAME);
            if (fs.existsSync(file)) {
                const over = await vscode.window.showWarningMessage(
                    `${agent.name} already has a ${PRODUCTION_FILENAME}. Overwrite it?`,
                    { modal: true }, 'Overwrite');
                if (over !== 'Overwrite') { return; }
            }
            const title = await vscode.window.showInputBox({
                prompt: `Production title (${agent.name})`, placeHolder: 'e.g. Launch Film', ignoreFocusOut: true
            });
            if (!title) { return; }
            const scenesRaw = await vscode.window.showInputBox({
                prompt: 'Scene titles, comma-separated — production.json can be edited by hand later',
                placeHolder: 'e.g. Opening, Product intro, Closing', ignoreFocusOut: true
            });
            if (scenesRaw === undefined) { return; }
            const sceneTitles = scenesRaw.split(',').map(s => s.trim()).filter(Boolean);
            writeProduction(file, newProduction(title, sceneTitles));
            const choice = await vscode.window.showInformationMessage(
                `Agent Farm: production "${title}" created with ${sceneTitles.length} scene(s) in ${agent.name}.`,
                'Open file', 'Open Gallery');
            if (choice === 'Open file') { void vscode.window.showTextDocument(vscode.Uri.file(file)); }
            if (choice === 'Open Gallery') { void vscode.commands.executeCommand('agentfarm.openGallery'); }
        }),

        // Wave D: export a production as an editor sequence (FCP7 XML + EDL).
        vscode.commands.registerCommand('agentfarm.exportSequence', async (arg?: { projectId?: string }) => {
            const productions = discoverProductions(agents);
            if (!productions.length) {
                void vscode.window.showInformationMessage(
                    'Agent Farm: no production.json found — create one with "Agent Farm: New Production".');
                return;
            }
            let target = arg?.projectId ? productions.find(p => p.production.id === arg.projectId) : undefined;
            if (!target) {
                const pick = await vscode.window.showQuickPick(
                    productions.map(p => ({ label: p.production.title, description: `${p.agentName} · ${p.production.scenes.length} scene(s)`, p })),
                    { placeHolder: 'Which production to export?', ignoreFocusOut: true });
                if (!pick) { return; }
                target = pick.p;
            }
            const clips = pickSequenceAssets(target.production, readMediaMetas(taskManager.outputsDir));
            if (!clips.length) {
                void vscode.window.showWarningMessage(
                    `Agent Farm: "${target.production.title}" has no scene assets to place — assign assets to scenes first.`);
                return;
            }
            const fpsStr = await vscode.window.showQuickPick(['30', '25', '24', '60'],
                { placeHolder: 'Sequence frame rate (fps)', ignoreFocusOut: true });
            if (!fpsStr) { return; }
            const secStr = await vscode.window.showInputBox({
                prompt: 'Default clip length in seconds (per scene, editor refines later)', value: '5',
                validateInput: v => /^\d+(\.\d+)?$/.test(v.trim()) ? undefined : 'A number', ignoreFocusOut: true });
            if (secStr === undefined) { return; }
            const opts = { fps: Number(fpsStr), clipSeconds: Number(secStr) || 5, title: target.production.title };
            const safe = target.production.id.replace(/[^\w.-]+/g, '-');
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(path.dirname(target.file), `${safe}.xml`)),
                filters: { 'FCP7 XML': ['xml'] }, saveLabel: 'Export sequence'
            });
            if (!uri) { return; }
            fs.writeFileSync(uri.fsPath, buildFcpXml(clips, opts), 'utf8');
            const edlPath = uri.fsPath.replace(/\.xml$/i, '') + '.edl';
            fs.writeFileSync(edlPath, buildEdl(clips, opts), 'utf8');
            const choice = await vscode.window.showInformationMessage(
                `Agent Farm: exported ${clips.length} clip(s) → ${path.basename(uri.fsPath)} (+ .edl). Import the XML in Premiere: File → Import.`,
                'Reveal', 'Open XML');
            if (choice === 'Reveal') { void revealPath(uri.fsPath); }
            if (choice === 'Open XML') { void vscode.window.showTextDocument(uri); }
        }),

        // Wave A: register hand-downloaded / locally produced files as gallery assets.
        vscode.commands.registerCommand('agentfarm.registerAsset', async () => {
            const picked = await vscode.window.showOpenDialog({
                canSelectMany: true, openLabel: 'Register as media asset'
            });
            if (!picked?.length) { return; }
            const link = await pickProductionScene('Assign the file(s) to a production scene?');
            if (link === undefined) { return; }
            let n = 0;
            for (const uri of picked) {
                if (registerExternalAsset(taskManager.outputsDir, uri.fsPath,
                    { ...link, source: 'external:manual' })) { n++; }
            }
            StudioPanel.refreshIfOpen();
            void vscode.window.showInformationMessage(
                `Agent Farm: ${n} asset(s) registered` +
                (picked.length - n ? ` (${picked.length - n} already known)` : '') + '.',
                'Open Gallery'
            ).then(choice => {
                if (choice === 'Open Gallery') { void vscode.commands.executeCommand('agentfarm.openGallery'); }
            });
        }),

        vscode.commands.registerCommand('agentfarm.rerunMedia', async (taskId?: string, vary?: boolean, withFeedback?: boolean) => {
            const meta = readMediaMetas(taskManager.outputsDir).find(m => m.taskId === taskId);
            if (!meta) {
                void vscode.window.showWarningMessage('Agent Farm: media metadata not found.');
                return;
            }
            let input = meta.input;
            let suffix = ' (re-run)';
            if (vary) {
                const edited = await vscode.window.showInputBox({
                    prompt: `Vary input for ${meta.model}`, value: meta.input, ignoreFocusOut: true
                });
                if (!edited) { return; }
                input = edited;
                suffix = ' (vary)';
            } else if (withFeedback) {
                // Regenerate with a critique — injected into the prompt field the
                // same way the vision-QA retry does it.
                const fb = await vscode.window.showInputBox({
                    prompt: `What was wrong / what should change? (${meta.model})`,
                    placeHolder: 'e.g. hands look wrong; warmer light; closer camera',
                    ignoreFocusOut: true
                });
                if (!fb) { return; }
                input = injectMediaFeedback(meta.input, fb);
                suffix = ' (feedback)';
            }
            taskManager.runMediaAdhoc(meta.title + suffix, meta.model, input,
                { projectId: meta.projectId, sceneId: meta.sceneId });
            void vscode.window.showInformationMessage(`Agent Farm: media job started — ${meta.model}`);
        }),

        vscode.commands.registerCommand('agentfarm.addRecipe', async () => {
            const recipes: { label: string; description: string; build: (agent: AgentInfo) => WorkflowStep[] }[] = [
                // Labels/titles are UI (English); step prompts stay Turkish —
                // they are instructions to the user's Turkish-speaking agents.
                {
                    label: 'Text → Image',
                    description: 'the agent writes the image prompt, Flux renders it',
                    build: (agent) => [
                        {
                            agentId: agent.id, agentName: agent.name, title: 'image prompt',
                            prompt: 'Şu konu için tek paragraflık, İngilizce, ayrıntılı bir görsel üretim promptu yaz (sadece promptu yaz): KONUYU BURAYA YAZ',
                            mode: 'headless'
                        },
                        {
                            agentId: '', agentName: 'media', title: 'render image', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/flux/schnell', input: '{"prompt": "{prev_text}"}' }
                        }
                    ]
                },
                {
                    label: 'Text → Image → Video',
                    description: 'content factory: prompt → image → short video',
                    build: (agent) => [
                        {
                            agentId: agent.id, agentName: agent.name, title: 'scene prompt',
                            prompt: 'Şu konu için İngilizce, sinematik tek paragraf görsel/video promptu yaz (sadece promptu): KONUYU BURAYA YAZ',
                            mode: 'headless'
                        },
                        {
                            agentId: '', agentName: 'media', title: 'cover image', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/flux/schnell', input: '{"prompt": "{prev_text}"}' }
                        },
                        {
                            agentId: '', agentName: 'media', title: 'short video', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/kling-video/v2/master/text-to-video', input: '{"prompt": "{prev_text}", "duration": "5"}', timeoutMin: 20 }
                        }
                    ]
                },
                {
                    label: 'Audio → Text (Whisper)',
                    description: 'transcribe the audio file, the agent summarizes it',
                    build: (agent) => [
                        {
                            agentId: '', agentName: 'media', title: 'transcript', prompt: '', mode: 'headless',
                            media: { model: 'fal-ai/whisper', input: '{"audio_url": "SES DOSYASI URL BURAYA"}' }
                        },
                        {
                            agentId: agent.id, agentName: agent.name, title: 'summarize',
                            prompt: 'Şu transkripti Türkçe maddelerle özetle: {prev_text}',
                            mode: 'headless'
                        }
                    ]
                }
            ];
            const pick = await vscode.window.showQuickPick(recipes, { ignoreFocusOut: true, placeHolder: 'Pick a recipe (steps are editable after install)' });
            if (!pick) { return; }
            const agent = await resolveAgent(undefined);
            if (!agent) { return; }
            taskManager.addWorkflow(pick.label, pick.build(agent));
            void vscode.window.showInformationMessage(
                `Agent Farm: "${pick.label}" recipe installed — edit the steps (the KONU/URL placeholders) under Tasks → Workflows and run with ▶. Media steps need the FAL_KEY secret.`);
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
            SecretsPanel.refreshIfOpen();
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
            SecretsPanel.refreshIfOpen();
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
            void revealPath(node.skill.source);
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
                prompt: 'Trigger name (e.g. "Inbox factory")', ignoreFocusOut: true
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

            // The content brake. Offered up-front for a WATCH trigger because
            // that is where it matters most: a folder watch fires on any change,
            // including noise, and without a guard every one of those is a paid
            // agent wake-up.
            let fireIf: Precondition | undefined;
            if (typePick.type === 'watch') {
                const guardPick = await pickPrecondition(
                    watchPath ? { kind: 'folderHasFiles', path: watchPath, except: ['_LOG_.md'] } : undefined,
                    title);
                if (guardPick === undefined) { return; }
                fireIf = guardPick.value;
            }

            taskManager.addTrigger({
                title, type: typePick.type, watchPath, hookEvent, hookAgent, token, action, fireIf,
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
                    `Agent Farm: webhook trigger armed — ${target}; URL copied to clipboard: ${url} (POST; the request body reaches the task as {payload}; ${timing}).`);
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
                ...(t.action.kind !== 'workflow'
                    ? [{ label: '$(sparkle) Model', description: t.action.model || 'default (policy/agent)', id: 'model' }] : []),
                {
                    label: '$(shield) Fire only if… (precondition)',
                    description: describePrecondition(t.fireIf) || 'no guard — fires on ANY change',
                    id: 'fireIf'
                },
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
                case 'model': {
                    if (t.action.kind === 'workflow') { return; }
                    const m = await pickAutomationModel(t.action.model);
                    if (m === undefined) { return; }
                    t.action.model = m || undefined;
                    break;
                }
                case 'fireIf': {
                    const pre = await pickPrecondition(t.fireIf, t.title);
                    if (pre === undefined) { return; }
                    t.fireIf = pre.value;
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

        vscode.commands.registerCommand('agentfarm.openForecast', async () => {
            const forecast = buildForecast(
                taskManager.schedules,
                taskManager.tasks.map(t => ({
                    title: t.title, agentName: t.agentName, status: t.status,
                    deferredReason: t.deferredReason, startedAt: t.startedAt
                })),
                allTaskRecords(),
                Date.now(),
                cfg().get<number>('forecastDays', 7)
            );
            const doc = await vscode.workspace.openTextDocument({
                language: 'markdown', content: renderForecastMarkdown(forecast)
            });
            await vscode.window.showTextDocument(doc, { preview: false });
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
                        ...(steps.length ? [{ label: '$(check) Finish & save workflow', description: `save "${title}" with ${steps.length} step(s)`, agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: false, isApproval: false, isSelect: false }] : []),
                        ...agents.map(a => ({ label: a.name, description: a.dir, agent: a as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: false, isApproval: false, isSelect: false })),
                        { label: '$(globe) Webhook step', description: 'HTTP call to n8n/Make/any URL — no agent', agent: undefined as AgentInfo | undefined, isWebhook: true, isMedia: false, isBrowser: false, isApproval: false, isSelect: false },
                        { label: '$(device-camera-video) Media step (fal.ai)', description: 'image/video/audio generation — needs FAL_KEY secret', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: true, isBrowser: false, isApproval: false, isSelect: false },
                        { label: '$(checklist) Select assets (visual pick)', description: 'keep a subset of produced assets — the chosen ones flow on', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: false, isApproval: false, isSelect: true },
                        { label: '$(browser) Browser step', description: 'agent drives its browser MCP — allowlist + approval enforced', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: true, isApproval: false, isSelect: false },
                        { label: '$(check) Approval gate', description: 'pause the chain for human sign-off — no agent, no model call', agent: undefined as AgentInfo | undefined, isWebhook: false, isMedia: false, isBrowser: false, isApproval: false, isSelect: false }
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
                        placeHolder: 'e.g. find the latest report, summarize it and extract the numbers', ignoreFocusOut: true
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
                        prompt: `Step ${stepNo} title (media)`, value: 'Render image', ignoreFocusOut: true
                    });
                    if (!mTitle) { continue; }
                    const mModel = await vscode.window.showInputBox({
                        prompt: 'Media model id — fal (default) or "replicate:owner/name[:version]" (Replicate)',
                        value: 'fal-ai/flux/schnell',
                        placeHolder: 'e.g. fal-ai/flux/schnell · replicate:black-forest-labs/flux-schnell',
                        ignoreFocusOut: true
                    });
                    if (!mModel) { continue; }
                    const mInput = await vscode.window.showInputBox({
                        prompt: 'JSON input template — {prev_text}/{prev_json.x} are substituted',
                        value: '{"prompt": "{prev_text}"}', ignoreFocusOut: true
                    });
                    if (!mInput) { continue; }
                    // Wave A: optional production/scene link (asked only when a manifest exists).
                    const mLink = await pickProductionScene('Tie produced assets to a production scene? (gallery grouping)');
                    // Wave B2: optional vision QA — a vision model checks the asset; FAIL regenerates.
                    const mQA = await vscode.window.showInputBox({
                        prompt: 'Vision QA criteria (optional) — a vision model checks the asset; FAIL regenerates with feedback',
                        placeHolder: 'e.g. a single person, clear face, no six fingers, matches the storyboard brief', ignoreFocusOut: true
                    });
                    if (mQA === undefined) { continue; }
                    const mRetries = mQA.trim() ? await vscode.window.showInputBox({
                        prompt: 'How many regeneration attempts on QA failure?', value: '1',
                        validateInput: v => /^\d+$/.test(v.trim()) ? undefined : 'A number', ignoreFocusOut: true
                    }) : undefined;
                    if (mQA.trim() && mRetries === undefined) { continue; }
                    steps.push({
                        agentId: '', agentName: 'media', title: mTitle, prompt: '', mode: 'headless',
                        media: { model: mModel, input: mInput, projectId: mLink?.projectId, sceneId: mLink?.sceneId },
                        ...(mQA.trim() ? { verify: { criteria: mQA.trim(), retries: Number(mRetries) || 1 } } : {})
                    });
                    continue;
                }
                if (agentPick.isApproval) {
                    const aTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (approval gate)`, value: 'Wait for approval', ignoreFocusOut: true
                    });
                    if (!aTitle) { continue; }
                    const aMsg = await vscode.window.showInputBox({
                        prompt: 'Message shown when asking for approval (optional) — {prev_text}/{prev_json.x} are substituted',
                        placeHolder: 'e.g. Review the output before it goes live', ignoreFocusOut: true
                    });
                    if (aMsg === undefined) { continue; }
                    steps.push({
                        agentId: '', agentName: 'approval', title: aTitle, prompt: '', mode: 'headless',
                        approval: { message: aMsg.trim() || undefined }
                    });
                    continue;
                }
                if (agentPick.isSelect) {
                    const sTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (select assets)`, value: 'Pick candidates', ignoreFocusOut: true
                    });
                    if (!sTitle) { continue; }
                    const sMsg = await vscode.window.showInputBox({
                        prompt: 'Message shown in the picker (optional) — {prev_text}/{prev_json.x} are substituted',
                        placeHolder: 'e.g. Pick the frames that go on to video generation', ignoreFocusOut: true
                    });
                    if (sMsg === undefined) { continue; }
                    const sRange = await vscode.window.showInputBox({
                        prompt: 'How many to keep? min or min-max (empty = at least 1)',
                        placeHolder: 'e.g. 2  ·  1-3  ·  empty', ignoreFocusOut: true,
                        validateInput: v => v.trim() && !/^\d+(-\d+)?$/.test(v.trim()) ? 'Use N or N-M' : undefined
                    });
                    if (sRange === undefined) { continue; }
                    const rm = /^(\d+)(?:-(\d+))?$/.exec(sRange.trim());
                    const min = rm ? Number(rm[1]) : 1;
                    const max = rm && rm[2] ? Number(rm[2]) : undefined;
                    steps.push({
                        agentId: '', agentName: 'select', title: sTitle, prompt: '', mode: 'headless',
                        select: { message: sMsg.trim() || undefined, min, max }
                    });
                    continue;
                }
                if (agentPick.isWebhook) {
                    const whTitle = await vscode.window.showInputBox({
                        prompt: `Step ${stepNo} title (webhook)`, value: 'Notify outward', ignoreFocusOut: true
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
                    // Optional auth header (queued APIs): "Name: Value", {secret:NAME} substituted.
                    const whHeader = await vscode.window.showInputBox({
                        prompt: 'Auth header (optional) — "Name: Value", {secret:NAME} substituted',
                        placeHolder: 'e.g. Authorization: Bearer {secret:MY_TOKEN}', ignoreFocusOut: true
                    });
                    if (whHeader === undefined) { continue; }
                    const headers: Record<string, string> = {};
                    const hIdx = whHeader.indexOf(':');
                    if (hIdx > 0) { headers[whHeader.slice(0, hIdx).trim()] = whHeader.slice(hIdx + 1).trim(); }
                    // Optional poll mode: turn this into a submit→poll queue client.
                    const whPollUrlField = await vscode.window.showInputBox({
                        prompt: 'Poll until done? JSON path in the response to the poll URL (empty = single call)',
                        placeHolder: 'e.g. urls.get · status_url · name', ignoreFocusOut: true
                    });
                    if (whPollUrlField === undefined) { continue; }
                    let poll: WebhookPollConfig | undefined;
                    if (whPollUrlField.trim()) {
                        const whStatusField = await vscode.window.showInputBox({
                            prompt: 'JSON path to the status field in each poll response',
                            value: 'status', ignoreFocusOut: true
                        });
                        if (whStatusField === undefined) { continue; }
                        const whDone = await vscode.window.showInputBox({
                            prompt: 'Status regex meaning "done"', value: 'succeeded|completed|complete|done|success', ignoreFocusOut: true
                        });
                        if (whDone === undefined) { continue; }
                        const whInterval = await vscode.window.showInputBox({
                            prompt: 'Poll interval seconds', value: '3',
                            validateInput: v => /^\d+$/.test(v.trim()) ? undefined : 'A number', ignoreFocusOut: true
                        });
                        if (whInterval === undefined) { continue; }
                        poll = {
                            urlField: whPollUrlField.trim(),
                            statusField: whStatusField.trim() || undefined,
                            doneRegex: whDone.trim() || undefined,
                            intervalSec: Number(whInterval) || 3
                        };
                    }
                    steps.push({
                        agentId: '', agentName: 'webhook', title: whTitle,
                        prompt: '', mode: 'headless',
                        webhook: {
                            url: whUrl, method: whMethod, body: whBody.trim() || undefined,
                            headers: Object.keys(headers).length ? headers : undefined,
                            poll
                        }
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
                        placeHolder: 'e.g. the output must contain a plan with at least 3 items',
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
                void revealPath(taskManager.outputsDir);
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
            const defaultDir = expandEnvPath(cfg().get<string>('autoReportFolder', '')) ||
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
            // case/slash-insensitive dedupe — two spellings of one folder in the
            // list used to double-scan it and distort discovery
            if (!roots.some(r => normPath(r) === normPath(newRoot))) {
                await cfg().update('agentRoots', [...roots, newRoot], vscode.ConfigurationTarget.Global);
            }
            refreshAll();
            index.reassignAgents();
        }),

        vscode.commands.registerCommand('agentfarm.newAgent', async () => {
            const roots = cfg().get<string[]>('agentRoots', []).map(expandEnvPath).filter(r => fs.existsSync(r));
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
            // seed the agent's default model from agentFarm.newAgentModel
            // (empty = write no model, the Claude CLI default applies)
            const newModel = cfg().get<string>('newAgentModel', 'sonnet').trim();
            fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'),
                JSON.stringify(newModel ? { model: newModel } : {}, null, 2) + '\n', 'utf8');
            refreshAll();
            void vscode.window.showInformationMessage(
                `Agent Farm: agent "${name}" created${newModel ? ` (default model: ${newModel})` : ''}.`);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(dir, 'CLAUDE.md')));
        }),

        // ---------- Phase D commands ----------

        vscode.commands.registerCommand('agentfarm.searchTranscripts',
            (preset?: { agentName?: string; file?: string; title?: string }) => {
                SearchPanel.show({
                    extensionUri: context.extensionUri,
                    index,
                    getAgentNames: () => agents.map(a => a.name),
                    getMemoryFiles: () => agents.flatMap(a =>
                        a.memoryFiles.map(f => ({ file: f.path, agentName: a.name }))),
                    liveEventsFile: () => path.join(context.globalStorageUri.fsPath, 'live-events.jsonl'),
                    semanticSearch,
                    semanticStatus
                }, preset && typeof preset === 'object' ? preset : undefined);
            }),

        vscode.commands.registerCommand('agentfarm.focusSessionTerminal',
            (rawArg?: SessionRef | SessionInfo) => {
                // Tree rows pass a SessionInfo (or a {session} wrapper node),
                // webviews pass whatever the row knew — sessionFromArg makes one
                // shape out of all of them.
                const arg = sessionFromArg(rawArg);
                // 1) exact hit — the terminal this very session was launched in
                //    (bound at launch or by the live monitor via cwd; see termBindings)
                const sid = arg?.sessionId;
                const binding = sid ? termBindings.find(b => b.sessionId === sid) : undefined;
                if (binding?.term && vscode.window.terminals.includes(binding.term)) {
                    binding.term.show();
                    return;
                }
                // 2) agent-level fallback. Index rows can carry pseudo-names
                //    ("Other projects"), so only trust a name that is a real agent;
                //    resolveAgentByCwd includes the basename fallback, matching
                //    sessions that run outside the agent roots. The live monitor
                //    knows the cwd of sessions we didn't launch ourselves.
                const cwd = arg?.cwd
                    || (sid ? live.sessions().find(s => s.sessionId === sid)?.cwd : undefined);
                let name = arg?.agentName && agents.some(a => a.name === arg.agentName)
                    ? arg.agentName : '';
                if (!name) { name = resolveAgentByCwd(cwd).agentName ?? ''; }
                // integrated terminals — named "claude: <agent> #n" since 2.56.0,
                // "claude: <agent>" / "<cli>: <agent>" before
                const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const namePat = name
                    ? new RegExp(`^[^:]+: ${escRe(name)}( #\\d+)?$`)
                    : /^claude: /;
                const match = vscode.window.terminals.filter(t => namePat.test(t.name));
                if (!(binding && !binding.term) && match.length) {
                    match[match.length - 1].show(); // most recent wins
                    return;
                }
                // 3) external window (Windows Terminal — title pinned at launch).
                //    The session's own pinned title goes first (exact); the plain
                //    agent titles still prefix-match older/suffixed windows.
                const titles = binding && !binding.term ? [binding.title] : [];
                titles.push(...(name ? [`claude: ${name}`, name] : ['claude']));
                focusExternalTerminal(
                    titles,
                    found => {
                        if (!found) {
                            void vscode.window.showInformationMessage(
                                `Agent Farm: no open terminal found${name ? ` for "${name}"` : ''} — integrated terminals are matched by name, external windows by their pinned title (sessions started before this feature can't be found).`);
                        }
                    });
            }),

        vscode.commands.registerCommand('agentfarm.openFarmSettings',
            (arg?: { focus?: string }) => {
                FarmSettingsPanel.show({
                    extensionUri: context.extensionUri,
                    schema: () => {
                        // live schema from our own manifest — a new setting shows
                        // up on this page with zero extra code
                        const pkg = context.extension.packageJSON as {
                            contributes?: { configuration?: { properties?: Record<string, never> } | { properties?: Record<string, never> }[] };
                        };
                        const conf = pkg.contributes?.configuration;
                        if (Array.isArray(conf)) {
                            return Object.assign({}, ...conf.map(c => c.properties ?? {}));
                        }
                        return conf?.properties ?? {};
                    },
                    getProfiles: () => context.globalState.get('agentfarm.settingsProfiles', []),
                    setProfiles: (list) => context.globalState.update('agentfarm.settingsProfiles', list),
                    claudeSettingsFile: () => userSettingsPath(claudeDir()),
                    // Report/answer .md "open with" default + custom external app.
                    docOpen: () => ({ ...docOpenStore.get(), modes: [...DOC_OPEN_MODES] }),
                    setDocOpen: (patch) => {
                        docOpenStore.set(patch);
                        QueuePanel.refreshIfOpen(); NoticesPanel.refreshIfOpen();
                    },
                    // Agent folders section: a fresh scan per render, so badges and
                    // the per-root agent lists always match what discovery would do.
                    agentFolders: () => {
                        // effective default model of an agent folder — what the claude
                        // CLI would pick up (settings.local.json overrides settings.json)
                        const modelOf = (dir: string): string => {
                            for (const f of ['settings.local.json', 'settings.json']) {
                                try {
                                    const j = JSON.parse(fs.readFileSync(path.join(dir, '.claude', f), 'utf8')) as { model?: unknown };
                                    if (typeof j.model === 'string' && j.model) { return j.model; }
                                } catch { /* missing or invalid — keep looking */ }
                            }
                            return '';
                        };
                        return {
                            reports: scanRoots(
                                cfg().get<string[]>('agentRoots', []),
                                cfg().get<string[]>('excludeAgentDirs', [])
                            ).reports.map(r => ({
                                root: r.root, kind: r.kind, duplicate: r.duplicate,
                                candidates: r.candidates.map(c => ({
                                    dir: c.dir, name: c.name, excluded: c.excluded,
                                    agentId: agents.find(a => a.normDir === normPath(c.dir))?.id ?? '',
                                    model: c.excluded ? '' : modelOf(c.dir)
                                }))
                            })),
                            excludes: cfg().get<string[]>('excludeAgentDirs', [])
                        };
                    }
                }, arg && typeof arg === 'object' ? arg.focus : undefined);
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

        vscode.commands.registerCommand('agentfarm.openNotices', (arg?: unknown) => {
            showNoticesPanel(typeof arg === 'string' ? arg : undefined);
        }),

        vscode.commands.registerCommand('agentfarm.openQueue', (arg?: unknown) => {
            showQueuePanel(typeof arg === 'string' ? arg : undefined);
        }),

        vscode.commands.registerCommand('agentfarm.queueAdd', async () => {
            const text = await vscode.window.showInputBox({
                prompt: "Add to the work queue — one line is enough (it won't be lost until handled)",
                placeHolder: 'e.g. fix the alignment glitch on the settings page',
                ignoreFocusOut: true
            });
            if (!text || !text.trim()) { return; }
            const item = workQueueStore.add({ text: text.trim(), author: 'user' });
            updateNoticesBadge(); QueuePanel.refreshIfOpen();
            void vscode.window.showInformationMessage('📥 Added to the queue.', 'Open queue')
                .then(p => { if (p) { showQueuePanel(item.id); } });
        }),

        vscode.commands.registerCommand('agentfarm.configureDocOpen', () => {
            void configureDocOpen();
        }),

        vscode.commands.registerCommand('agentfarm.openTasks', () => {
            TasksPanel.show(tasksDeps);
        }),

        vscode.commands.registerCommand('agentfarm.openLiving', () => {
            LivingPanel.show(livingDeps);
        }),

        vscode.commands.registerCommand('agentfarm.openTaskAnalytics', () => {
            TaskAnalyticsPanel.show({
                extensionUri: context.extensionUri,
                manager: taskManager,
                allRecords: allTaskRecords,
                forecastDays: () => cfg().get<number>('forecastDays', 7),
                onDidChange: taskManager.onDidChange,
                lastExportDir: () => context.globalState.get<string>('agentfarm.lastExportDir'),
                setLastExportDir: (dir: string) => { void context.globalState.update('agentfarm.lastExportDir', dir); }
            });
        }),

        // The Living page only sees the FARM until you tell it what the farm
        // exists for: a diary file that should be written, an inbox that should
        // be empty. Each check is a precondition where TRUE = "needs attention".
        vscode.commands.registerCommand('agentfarm.configureLivingChecks', async () => {
            const checks = cfg().get<LivingCheck[]>('livingChecks', []);
            const pick = await vscode.window.showQuickPick([
                { label: '$(add) Add a check…', id: 'add' },
                ...(checks.length ? [{ label: '$(trash) Remove a check…', id: 'remove' }] : []),
                { label: '$(json) Edit them all as JSON (settings)', id: 'json' }
            ], { ignoreFocusOut: true, placeHolder: `Living checks (${checks.length} configured)` });
            if (!pick) { return; }
            if (pick.id === 'json') {
                await vscode.commands.executeCommand('workbench.action.openSettingsJson');
                return;
            }
            if (pick.id === 'remove') {
                const victim = await vscode.window.showQuickPick(
                    checks.map((c, i) => ({ label: c.label, description: describePrecondition(c.when), i })),
                    { ignoreFocusOut: true, placeHolder: 'Remove which check?' });
                if (!victim) { return; }
                const next = checks.filter((_, i) => i !== victim.i);
                await cfg().update('livingChecks', next, vscode.ConfigurationTarget.Global);
                LivingPanel.refreshIfOpen();
                return;
            }
            const label = await vscode.window.showInputBox({
                title: 'What loop is this?',
                placeHolder: "e.g. Today's day file written",
                ignoreFocusOut: true
            });
            if (!label) { return; }
            const pre = await pickPrecondition(undefined, label);
            if (!pre?.value) { return; }
            const level = await vscode.window.showQuickPick([
                { label: '⚠️ Warn', description: 'needs you soon', v: 'warn' as const },
                { label: '🛑 Alert', description: 'the loop has stopped', v: 'alert' as const },
                { label: '· Info', description: 'worth seeing, not urgent', v: 'info' as const }
            ], { ignoreFocusOut: true, placeHolder: 'How loud when this hits?' });
            if (!level) { return; }
            const hint = await vscode.window.showInputBox({
                title: 'What closes this loop? (shown as the hint; optional)',
                placeHolder: 'e.g. write today\'s entry, or ask the agent to open it',
                ignoreFocusOut: true
            });
            if (hint === undefined) { return; }
            const next = [...checks, { label, when: pre.value, level: level.v, hint: hint || undefined }];
            await cfg().update('livingChecks', next, vscode.ConfigurationTarget.Global);
            LivingPanel.refreshIfOpen();
            void vscode.window.showInformationMessage(`Agent Farm: living check "${label}" added.`);
        }),

        // Alias kept for every pre-Tasks entry point (menus, notifications,
        // needs page): the Board now lives as the Tasks page's first section.
        vscode.commands.registerCommand('agentfarm.openBoard', () => {
            TasksPanel.show(tasksDeps, 'board');
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
                placeHolder: 'e.g. must be in Turkish, contain 3 concrete suggestions, no headings',
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
                    label: `$(lightbulb) Try the suggestion: ${s.rule.slice(0, 70)}`,
                    detail: 'B = mevcut CLAUDE.md + bu kural', variantKind: 'suggestion' as const, rule: s.rule
                }));
            options.push(
                { label: '$(file) Pick variant B from a file…', variantKind: 'file' },
                { label: '$(edit) Write the rule to add…', variantKind: 'paste' });
            const picked = await vscode.window.showQuickPick(options, {
                ignoreFocusOut: true, placeHolder: `A = ${agent.name}'s current CLAUDE.md. Where does variant B come from?`
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
                    prompt: 'Rule to add to variant B (one line)', ignoreFocusOut: true
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
                    prompt: 'Trial prompts (separate with ; — 2-5 of them)',
                    placeHolder: 'e.g. summarize today\'s notes ; draft the weekly plan',
                    ignoreFocusOut: true
                });
                prompts = (raw ?? '').split(';').map(s => s.trim()).filter(Boolean).slice(0, 5);
            }
            if (!prompts.length) { return; }
            const runArgs = cfg().get<string>('evalRunArgs', '--model claude-haiku-4-5-20251001');
            const confirm = await vscode.window.showInformationMessage(
                `A/B experiment: ${prompts.length} prompts × 2 variants + ${prompts.length} judge calls ` +
                `(${runArgs || 'agent default model'}). Run it?`,
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
                    `B won (${summary.winsB}-${summary.winsA}, ${summary.ties} ties). Apply variant B to CLAUDE.md? (an .afbak backup is taken)`,
                    { modal: true }, 'Apply B');
                if (apply === 'Apply B') {
                    const backup = `${agent.claudeMdPath}.${Date.now()}.afbak`;
                    fs.copyFileSync(agent.claudeMdPath, backup);
                    fs.writeFileSync(agent.claudeMdPath, variantB, 'utf8');
                    instrHistory.record(agent.id, variantB);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: B applied ✓ (backup: ${path.basename(backup)})`);
                }
            } else {
                void vscode.window.showInformationMessage(
                    `Agent Farm A/B: A ${summary.winsA} · B ${summary.winsB} · ties ${summary.ties} — keeping the current instructions.`);
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
                prompt: 'What does the fleet know about this? (semantic memory query — Turkish queries are fine)',
                placeHolder: 'e.g. what is known about the user\'s sleep pattern',
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
                prompt: 'Parallel runs (separate with ; — each prompt runs in its own worktree)',
                placeHolder: 'e.g. fix the login form ; add dark mode ; speed up the tests',
                ignoreFocusOut: true
            });
            const prompts = (raw ?? '').split(';').map(s => s.trim()).filter(Boolean).slice(0, 6);
            if (!prompts.length) { return; }
            const maxConc = cfg().get<number>('maxConcurrentPerAgent', 1);
            if (prompts.length > 1 && maxConc > 0 && maxConc < prompts.length) {
                const c = await vscode.window.showInformationMessage(
                    `maxConcurrentPerAgent = ${maxConc}: runs execute in turn (worktrees stay isolated). Continue?`,
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
            const folder = expandEnvPath(cfg().get<string>('digestTtsFolder', '')) ||
                expandEnvPath(cfg().get<string>('autoReportFolder', ''));
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
                        void revealPath(result.file!);
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

        // E2b: hand the user a ready-to-paste hook bridge invocation for an
        // external CLI's notify/hook config (codex notify, wrapper scripts, …).
        vscode.commands.registerCommand('agentfarm.copyCliHookCommand', async () => {
            const hook = path.join(context.extensionPath, 'out', 'service', 'cliHook.js');
            if (!fs.existsSync(hook)) {
                void vscode.window.showErrorMessage('Agent Farm: cliHook.js missing from the extension build.');
                return;
            }
            await vscode.env.clipboard.writeText(`node "${hook}"`);
            void vscode.window.showInformationMessage(
                'Agent Farm: hook bridge command copied. Wire it into your CLI\'s notify/hook config — ' +
                'a trailing JSON argument (codex notify style) is auto-detected; --json reads stdin; ' +
                'or use --event/--tool/--prompt args. Inside a "Start Session With…" terminal the ' +
                'AGENT_FARM_SESSION/CWD/EVENT_PORT env vars route events onto that session\'s lane; ' +
                'you can also reference the script as %AGENT_FARM_HOOK% there.');
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
                prompt: 'Incoming work text — which agent would the dispatcher route it to? (Turkish input is fine)',
                placeHolder: 'e.g. couldn\'t sleep last night, anxious this morning too',
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

        // ---------- Cross-engine compatibility (Antigravity + Codex sync) ----------
        // One command, two engines. The Antigravity core owns CLAUDE.md ↔ AGENTS.md
        // (the shared instruction file Codex also reads); withCodex() layers the
        // Codex-only extras (MCP TOML snippet) on top without touching that core.

        vscode.commands.registerCommand('agentfarm.syncAntigravity', async (arg?: AgentArg) => {
            const agent = await resolveAgent(arg);
            if (!agent) { return; }
            if (!agent.claudeMdPath) {
                void vscode.window.showWarningMessage('Agent Farm: this agent has no CLAUDE.md to sync from.');
                return;
            }
            const agentsPath = path.join(agent.dir, AGENTS_MD_NAME);
            // Merge Codex extras into any Antigravity result: whenever AGENTS.md is
            // produced/updated, refresh Codex's MCP snippet from the same folder.
            const withCodex = (r: SyncResult): SyncResult => {
                const cx = syncCodexExtras(agent.dir);
                return {
                    written: [...r.written, ...cx.written],
                    skipped: [...r.skipped, ...cx.skipped],
                    backups: [...r.backups, ...cx.backups],
                    notes: [...r.notes, ...cx.notes]
                };
            };
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

            const sync = (opts: { force?: boolean } = {}) =>
                syncToAntigravity(agent.dir, agent.duties,
                    { ...opts, constitutionPath: agent.constitutionPath });

            const status = antigravityStatus(agent.dir, agent.constitutionPath);
            switch (status.state) {
                case 'none': {
                    const ok = await vscode.window.showInformationMessage(
                        `Make "${agent.name}" Antigravity + Codex compatible?\n\n` +
                        `Creates AGENTS.md from CLAUDE.md (the cross-tool file Codex reads) and ` +
                        `.agents/AGENTS.md (Antigravity's own rules file${agent.constitutionPath ? ', with the shared constitution embedded — Antigravity reads nothing above the workspace root' : ''}), ` +
                        `.agents/workflows/ from active duties, and MCP merge suggestions if .mcp.json exists ` +
                        `(JSON for Antigravity, TOML for Codex).\n\n` +
                        `memory/ is shared as-is — no conversion. From now on, edits on either side are detected and can be synced back.`,
                        { modal: true }, 'Create');
                    if (ok !== 'Create') { return; }
                    showResult('Antigravity + Codex files created', withCodex(sync()));
                    return;
                }
                case 'foreign': {
                    const ok = await vscode.window.showWarningMessage(
                        `${agent.name} already has an AGENTS.md that Agent Farm did not generate. ` +
                        `Overwrite it with CLAUDE.md content? (a timestamped .afbak backup is kept)`,
                        { modal: true }, 'Overwrite');
                    if (ok !== 'Overwrite') { return; }
                    showResult('AGENTS.md replaced', withCodex(sync({ force: true })));
                    return;
                }
                case 'in-sync': {
                    // Refresh duty workflows anyway — duties may have changed independently.
                    showResult('already in sync (duty workflows refreshed)', withCodex(sync()));
                    return;
                }
                case 'claude-ahead': {
                    showResult('CLAUDE.md → AGENTS.md synced', withCodex(sync()));
                    return;
                }
                case 'antigravity-ahead': {
                    const choice = await vscode.window.showInformationMessage(
                        `AGENTS.md was edited on the Antigravity side. Carry the changes back into CLAUDE.md? ` +
                        `(CLAUDE.md gets a timestamped .afbak backup)`,
                        { modal: true }, 'Apply to CLAUDE.md', 'Show Diff', 'Overwrite with CLAUDE.md');
                    if (choice === 'Apply to CLAUDE.md') {
                        showResult('AGENTS.md → CLAUDE.md synced', withCodex(syncToClaude(agent.dir, agent.constitutionPath)));
                    } else if (choice === 'Show Diff') {
                        await vscode.commands.executeCommand('vscode.diff',
                            vscode.Uri.file(agent.claudeMdPath), vscode.Uri.file(agentsPath),
                            `${agent.name}: CLAUDE.md ↔ AGENTS.md`);
                    } else if (choice === 'Overwrite with CLAUDE.md') {
                        showResult('AGENTS.md overwritten from CLAUDE.md', withCodex(sync()));
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
                        showResult('resolved: CLAUDE.md → AGENTS.md', withCodex(sync({ force: true })));
                    } else if (choice === 'Antigravity wins') {
                        showResult('resolved: AGENTS.md → CLAUDE.md', withCodex(syncToClaude(agent.dir, agent.constitutionPath)));
                    }
                    return;
                }
            }
        }),

        // The shared constitution — a nest root's own CLAUDE.md, which Claude
        // Code loads for every child session. Codex gets it for free once the
        // folder has an AGENTS.md (it merges one file per directory from the
        // git root down to the cwd); Antigravity never reads above a workspace
        // root, so agents carry it embedded in their own rules file and this
        // command only covers the case where the nest folder IS the workspace.
        vscode.commands.registerCommand('agentfarm.syncConstitution', async () => {
            const { reports } = scanRoots(
                cfg().get<string[]>('agentRoots', []),
                cfg().get<string[]>('excludeAgentDirs', []));
            const nests = reports.filter(r =>
                r.kind === 'nest' && fs.existsSync(path.join(r.root, 'CLAUDE.md')));
            if (!nests.length) {
                void vscode.window.showWarningMessage(
                    'Agent Farm: no shared constitution found — a root folder that holds agent folders AND its own CLAUDE.md is what this syncs.');
                return;
            }
            let nest = nests[0].root;
            if (nests.length > 1) {
                const picked = await vscode.window.showQuickPick(
                    nests.map(n => ({ label: path.basename(n.root), description: n.root })),
                    { title: 'Which shared constitution?' });
                if (!picked) { return; }
                nest = picked.description;
            }

            const run = (force: boolean): SyncResult => {
                const ag = syncToAntigravity(nest, [], { force });
                const cx = syncCodexExtras(nest);
                return {
                    written: [...ag.written, ...cx.written],
                    skipped: [...ag.skipped, ...cx.skipped],
                    backups: [...ag.backups, ...cx.backups],
                    notes: [...ag.notes, ...cx.notes]
                };
            };
            const report = (title: string, r: SyncResult) => {
                refreshAll();
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${title} — ${r.written.length} file(s) written` +
                    (r.skipped.length ? `, ${r.skipped.length} left untouched` : '') +
                    (r.backups.length ? `, ${r.backups.length} backup(s)` : '') +
                    '. Agents carry this constitution inside their own .agents/AGENTS.md — re-sync them to pick up changes.',
                    'Open AGENTS.md')
                    .then(c => {
                        if (c === 'Open AGENTS.md') {
                            void vscode.commands.executeCommand('vscode.open',
                                vscode.Uri.file(path.join(nest, AGENTS_MD_NAME)));
                        }
                    });
            };

            const status = antigravityStatus(nest);
            if (status.state === 'foreign') {
                const ok = await vscode.window.showWarningMessage(
                    `${path.basename(nest)} already has an AGENTS.md that Agent Farm did not generate. ` +
                    `Overwrite it from the shared CLAUDE.md? (a timestamped .afbak backup is kept)`,
                    { modal: true }, 'Overwrite');
                if (ok !== 'Overwrite') { return; }
                report('shared constitution mirrored', run(true));
                return;
            }
            if (status.state === 'antigravity-ahead' || status.state === 'conflict') {
                // The constitution is the system's most load-bearing file: this
                // command never writes it back, it only offers the diff.
                const choice = await vscode.window.showWarningMessage(
                    `${path.basename(nest)}/AGENTS.md was edited since the last sync. The constitution itself is never ` +
                    `overwritten from a generated file — inspect the diff, or overwrite AGENTS.md from CLAUDE.md.`,
                    { modal: true }, 'Show Diff', 'Overwrite AGENTS.md');
                if (choice === 'Show Diff') {
                    await vscode.commands.executeCommand('vscode.diff',
                        vscode.Uri.file(path.join(nest, 'CLAUDE.md')),
                        vscode.Uri.file(path.join(nest, AGENTS_MD_NAME)),
                        `${path.basename(nest)}: CLAUDE.md ↔ AGENTS.md`);
                } else if (choice === 'Overwrite AGENTS.md') {
                    report('shared constitution mirrored', run(true));
                }
                return;
            }
            if (status.state === 'none') {
                const ok = await vscode.window.showInformationMessage(
                    `Make the shared constitution in "${path.basename(nest)}" readable by Antigravity + Codex?\n\n` +
                    `Creates ${path.basename(nest)}/AGENTS.md (Codex merges it on its walk from the git root down to ` +
                    `whatever agent folder it runs in) and .agents/AGENTS.md (Antigravity, for when this folder itself ` +
                    `is the open workspace).\n\nCLAUDE.md is only read — never written.`,
                    { modal: true }, 'Create');
                if (ok !== 'Create') { return; }
            }
            report('shared constitution mirrored', run(false));
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
                    if (c === 'Reveal') { void revealPath(target.fsPath); }
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
            const roots = cfg().get<string[]>('agentRoots', []).map(expandEnvPath).filter(r => fs.existsSync(r));
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
                // Any edit — from the agent page or by hand — becomes a new dated
                // entry so earlier sessions keep the rate they were billed at.
                recordPricingChange(cfg().get<PriceRule[]>('pricing', DEFAULT_PRICING));
                pricing = PricingEngine.fromHistory(loadPricingHistory());
                index.updatePricing(pricing);
                void index.scanAll().then(() => index.reassignAgents());
            }
            if (e.affectsConfiguration('agentFarm.extraClaudeDirs')) {
                void index.scanAll().then(() => {
                    index.reassignAgents();
                    index.watch();
                });
            }
            if (e.affectsConfiguration('agentFarm.agentRoots') ||
                e.affectsConfiguration('agentFarm.excludeAgentDirs')) {
                refreshAll();
                index.reassignAgents();
            }
            if (e.affectsConfiguration('agentFarm.liveMonitor') ||
                e.affectsConfiguration('agentFarm.livePort')) {
                live.start();
            }
            if (e.affectsConfiguration('agentFarm.ingestFolders')) {
                ingest.restart();
            }
            DashboardPanel.refreshIfOpen();
        })
    );
}

export function deactivate(): void { /* disposables handle cleanup */ }
