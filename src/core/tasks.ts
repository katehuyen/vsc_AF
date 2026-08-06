import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import {
    appendAutomationEvent, AutomationEvent, AutomationState, evaluatePrecondition,
    gateBlock, pauseExpired, Precondition
} from './automation';
import { buildBrowserPrompt, hostAllowed } from './browser';
import {
    DEFAULT_MEDIA_PRICING, downloadAsset, estimateMediaCost, extFromUrl, injectMediaFeedback,
    mediaCandidates, MediaMeta, MediaPriceRule, MediaResult, pollFalResult, readMediaMetas, recordSelection
} from './media';
import { pollReplicateResult, pollWebhookResult, providerFor, WebhookPollConfig } from './mediaProviders';
import { expandDeep, PortableRoot, tokenizeDeep } from './portablePaths';
import { extractJson, sanitizePrompt } from './util';

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type TaskMode = 'interactive' | 'headless';

export interface FarmTask {
    id: string;
    agentId: string;
    agentName: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    status: TaskStatus;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
    fromSchedule?: string;
    fromTrigger?: string;
    outputFile?: string;
    workflowId?: string;
    workflowRunId?: string;
    stepIndex?: number;
    /** claude -p --output-format json when 'json' (structured handoff). */
    outputContract?: 'text' | 'json';
    /** verification attempt number (0 = first run). */
    attempt?: number;
    /** result of the verify step, when the step had one. */
    verified?: 'pass' | 'fail';
    /** estimated cost of a media step (USD). */
    mediaCost?: number;
    /** why a requested start is waiting (concurrency / quota). */
    deferredReason?: string;
    /** start was requested; the pump launches it when capacity frees up. */
    autoStart?: boolean;
    /** J1: run in this directory instead of the agent folder (worktree runs). */
    workDir?: string;
    /**
     * The project this task belongs to — recorded when it is CREATED, not when
     * it runs. A queued task can sit for hours; by the time it starts, the
     * window's active project may be something else entirely, and giving it
     * that project's context would be worse than giving it none.
     */
    projectId?: string;
    /** Set when this task is a mission delegation (Missions panel links through it). */
    missionId?: string;
    /** Explicit model for THIS task (e.g. a mission's per-member override).
     *  Beats the model-policy engine; empty = policy/agent default. */
    model?: string;
    /**
     * ‼️ THE SAME DIMENSIONS A SESSION IS STARTED WITH — see core/launch.ts.
     *
     * A task IS a claude run, and the launcher has offered model · effort ·
     * permission mode since 3.5x; a task could only ever state the first. So
     * "run this on low effort because it is mechanical" and "this one may edit
     * files without asking" were sayable when a person started a session by
     * hand and not when they queued the identical work as a task — which is the
     * case where it matters more, because nobody is sitting there.
     *
     * Empty means the same thing here as there: no flag, and whatever the CLI
     * and the agent already decide stays in charge.
     */
    effort?: string;
    permissionMode?: string;
    /** J5: named CLI profile (agentFarm.cliProfiles); empty = claude. */
    cli?: string;
    /** Launch priority; higher runs sooner. Unset = 0. Ages up while queued so nothing starves. */
    priority?: number;
    /** F2: in-flight media job poll info — lets a reload reattach to the render instead of losing it. */
    mediaJob?: { provider: string; statusUrl: string; responseUrl: string; deadline: number; input?: string };
    /** Z4: API-equivalent token cost of the task's matched transcript (headless runs). */
    costUSD?: number;
    /** Z4: total tokens of the matched transcript (rides along with the cost). */
    tokens?: number;
    /** Z4: the transcript the cost came from (opens in the session viewer). */
    costSessionFile?: string;
}

export type ScheduleKind = 'daily' | 'weekly' | 'once';

/** What happens when a scheduled time passes while no VS Code window was open:
 *  'skip' (default, the old behavior) = that occurrence is lost — the schedule
 *  only fires on its own day; 'run' = the missed occurrence fires at the first
 *  opportunity, no questions asked; 'ask' = it is offered with Run/Skip buttons. */
export type MissedPolicy = 'skip' | 'run' | 'ask';

export interface FarmSchedule {
    id: string;
    agentId: string;
    agentName: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    kind: ScheduleKind;
    hour: number;
    minute: number;
    dow?: number;      // 0=Sunday, weekly only
    onceAt?: number;   // epoch ms, once only
    enabled: boolean;
    lastRunKey?: string;
    missed?: MissedPolicy;
    /** Explicit model for this schedule's runs. Beats the model-policy engine,
     *  so "this nightly batch needs real judgment — run it on opus" is stated
     *  ON the schedule instead of hidden in a settings regex that silently
     *  contradicts it. Empty = policy/agent default. */
    model?: string;
    /** Is there work? Evaluated for free before any agent is woken; a schedule
     *  whose precondition fails is stamped as handled for the day and skipped. */
    fireIf?: Precondition;
    /** Quiet hours deferred this occurrence; it fires when the window ends. */
    pendingRunKey?: string;
}

export interface FarmTemplate {
    id: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    agentId?: string;
    agentName?: string;
}

export interface WorkflowStep {
    agentId: string;
    agentName: string;
    title: string;
    prompt: string;
    mode: TaskMode;
    /** What to do when this step fails: stop the chain (default), continue, or jump to a 1-based step. */
    onFail?: 'stop' | 'continue' | number;
    /**
     * Condition for running this step. Plain string = regex on the previous
     * step's output body. "json:field.path~regex" = regex on a field of the
     * previous step's parsed JSON output.
     */
    runIf?: string;
    /** 'json' runs the step with --output-format json and parses the result for handoff. */
    outputContract?: 'text' | 'json';
    /** Cheap-model quality gate: on FAIL the step is retried with the judge's feedback. */
    verify?: { criteria: string; retries?: number };
    /**
     * Webhook step: instead of claude, the step is an HTTP call. url/body/header
     * templates support {prev_output} {prev_text} {prev_json.x} {secret:NAME}.
     * The response body becomes the handoff for the next step. Wave C: optional
     * `headers` (auth for queued APIs) and `poll` (submit→poll any queued API —
     * Gemini long-running ops etc. — without a bespoke media provider).
     */
    webhook?: {
        url: string; method?: string; body?: string;
        headers?: Record<string, string>;
        poll?: WebhookPollConfig;
    };
    /**
     * Media step (fal.ai queue): model id + JSON input template ({prev_*} and
     * {secret:} are substituted). Assets are downloaded into the outputs
     * archive; the response JSON becomes the next step's handoff. Wave A:
     * optional projectId/sceneId tie the produced assets to a production scene.
     */
    media?: { model: string; input: string; timeoutMin?: number; projectId?: string; sceneId?: string };
    /**
     * F3 — browser automation step: the step's agent drives its browser MCP.
     * Host allowlist is enforced before launch; empty allowlist = refuse.
     */
    browser?: { url: string; goal: string; allowHosts?: string[] };
    /**
     * Human-in-the-loop gate: the chain pauses here until the user approves.
     * On approve the upstream handoff passes through unchanged; on reject the
     * step's onFail policy applies. No agent, no model call.
     */
    approval?: { message?: string };
    /**
     * Wave B — visual selection gate: opens a gallery-picker of the assets
     * produced so far in this run; the user keeps some (min..max). The SELECTED
     * asset URLs become the handoff (`{prev_json.selected.N}` / `{prev_text}`),
     * so the next media/agent step works only with the chosen ones. Cancelling
     * applies the step's onFail policy. No agent, no model call.
     */
    select?: { message?: string; min?: number; max?: number };
    /**
     * Fan-out: this step runs concurrently with adjacent `parallel` steps. A
     * maximal run of consecutive parallel steps forms a group; the step after
     * the group receives all their outputs merged (fan-in). Unset = sequential.
     */
    parallel?: boolean;
}

/** What one step passes to the next. */
export interface Handoff {
    file?: string;
    text?: string;
    json?: unknown;
}

export interface FarmTrigger {
    id: string;
    title: string;
    type: 'watch' | 'hook' | 'webhook';
    /** watch: file or folder whose change fires the trigger */
    watchPath?: string;
    /** webhook: secret path token — POST http://127.0.0.1:<port>/trigger/<token> */
    token?: string;
    /** hook: live event kind (prompt, toolStart, stop, end, permission, …) */
    hookEvent?: string;
    /** hook: only fire for this agent (name); empty = any agent */
    hookAgent?: string;
    action:
        | { kind: 'task'; agentId: string; agentName: string; title: string; prompt: string; mode: TaskMode; model?: string }
        | { kind: 'workflow'; workflowId: string }
        /** F2: no fixed agent — the dispatcher routes each firing to the best agent. */
        | { kind: 'dispatch'; title: string; prompt: string; mode: TaskMode; model?: string };
    debounceSec: number;
    cooldownSec: number;
    maxPerHour: number;
    enabled: boolean;
    lastFiredAt?: number;
    fireCount?: number;
    recentFirings?: number[];
    /** Is there work? A watch trigger fires on ANY filesystem change — including
     *  noise that has nothing to do with the job. This is the content brake the
     *  frequency brakes (debounce/cooldown/maxPerHour) can never be: it is
     *  evaluated for free and stops the wake-up before it costs a model call. */
    fireIf?: Precondition;
    /** Firings suppressed by the precondition or the gate (cost NOT paid). */
    skipCount?: number;
    lastSkippedAt?: number;
    lastSkipReason?: string;
}

export interface FarmWorkflow {
    id: string;
    title: string;
    steps: WorkflowStep[];
}

export function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** J5 — a non-claude executor: command templates with {prompt} and {args}. */
export interface CliProfile {
    name: string;
    /** e.g. `gemini -p "{prompt}"` */
    headless: string;
    /** e.g. `gemini "{prompt}"`; falls back to headless */
    interactive?: string;
}

export function buildCliCommand(template: string, prompt: string, args: string): string {
    return template
        .split('{prompt}').join(sanitizePrompt(prompt))
        .split('{args}').join(args.trim())
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** The day-key of the last scheduled occurrence strictly before today (daily:
 *  yesterday; weekly: the previous matching weekday). Stamped as lastRunKey
 *  when a catch-up policy is configured so the past counts as settled — only
 *  occurrences missed AFTER that point are caught up. */
export function previousOccurrenceKey(s: Pick<FarmSchedule, 'kind' | 'dow'>, now: Date): string {
    const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    do { prev.setDate(prev.getDate() - 1); }
    while (s.kind === 'weekly' && prev.getDay() !== s.dow);
    return `${prev.getFullYear()}-${prev.getMonth() + 1}-${prev.getDate()}`;
}

/** Validate the content of a seed-schedules.json (external one-shot schedule
 *  seeding — see applySeedFile). Bad entries are dropped, sane defaults fill
 *  the gaps. Exported pure for tests. */
export function parseSeedSchedules(text: string): Omit<FarmSchedule, 'id'>[] {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return []; }
    if (!Array.isArray(parsed)) { return []; }
    const out: Omit<FarmSchedule, 'id'>[] = [];
    for (const raw of parsed) {
        if (!raw || typeof raw !== 'object') { continue; }
        const o = raw as Record<string, unknown>;
        if (typeof o.title !== 'string' || !o.title.trim()) { continue; }
        if (typeof o.prompt !== 'string' || !o.prompt.trim()) { continue; }
        if (typeof o.agentId !== 'string' || !o.agentId) { continue; }
        const kind: ScheduleKind = o.kind === 'weekly' || o.kind === 'once' ? o.kind : 'daily';
        const int = (v: unknown, lo: number, hi: number, def: number) => {
            const n = typeof v === 'number' ? Math.floor(v) : NaN;
            return isFinite(n) && n >= lo && n <= hi ? n : def;
        };
        out.push({
            agentId: o.agentId,
            agentName: typeof o.agentName === 'string' ? o.agentName : '',
            title: o.title.trim(),
            prompt: o.prompt,
            mode: o.mode === 'interactive' ? 'interactive' : 'headless',
            kind,
            hour: int(o.hour, 0, 23, 9),
            minute: int(o.minute, 0, 59, 0),
            dow: kind === 'weekly' ? int(o.dow, 0, 6, 1) : undefined,
            onceAt: kind === 'once' && typeof o.onceAt === 'number' ? o.onceAt : undefined,
            enabled: o.enabled !== false,
            missed: o.missed === 'run' || o.missed === 'ask' || o.missed === 'skip' ? o.missed : undefined,
            lastRunKey: typeof o.lastRunKey === 'string' ? o.lastRunKey : undefined
        });
    }
    return out;
}

/** Pure due-check so the scheduler is testable. `missedKey`/`missedAt` mark a
 *  scheduled occurrence from a previous day that never ran (no VS Code window
 *  was open at the time) and the schedule's missed-policy wants handled:
 *  policy 'run' also sets due (fires with runKey = the missed key), policy
 *  'ask' leaves due false — the scheduler offers it with Run/Skip buttons. */
export function scheduleDue(
    s: FarmSchedule, now: Date
): { due: boolean; runKey: string; missedKey?: string; missedAt?: number } {
    if (!s.enabled) { return { due: false, runKey: '' }; }
    if (s.kind === 'once') {
        return {
            due: !!s.onceAt && now.getTime() >= s.onceAt && s.lastRunKey !== 'once',
            runKey: 'once'
        };
    }
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const target = s.hour * 60 + s.minute;
    const runDay = s.kind !== 'weekly' || now.getDay() === s.dow;
    if (runDay && minutes >= target) {
        // the scheduled day itself — fires on time, or late the same day
        return { due: s.lastRunKey !== dayKey, runKey: dayKey };
    }
    if (s.missed === 'run' || s.missed === 'ask') {
        const prevKey = previousOccurrenceKey(s, now);
        if (s.lastRunKey !== prevKey) {
            const [y, m, d] = prevKey.split('-').map(Number);
            const missedAt = new Date(y, m - 1, d, s.hour, s.minute).getTime();
            return { due: s.missed === 'run', runKey: prevKey, missedKey: prevKey, missedAt };
        }
    }
    return { due: false, runKey: dayKey };
}

export { extractJson, sanitizePrompt, tryParseJson } from './util';

/** Placeholder in workflow step prompts replaced with the previous step's output file path. */
export const PREV_OUTPUT_PLACEHOLDER = '{prev_output}';

/**
 * The model's actual output from an archived task file — strips the metadata
 * header (which contains the task title and prompt) and the Finished footer,
 * so runIf conditions can't be triggered by workflow names or prompt text.
 */
export function archivedOutputBody(content: string): string {
    const start = content.indexOf('\n---\n');
    let body = start >= 0 ? content.slice(start + 5) : content;
    const foot = body.lastIndexOf('\n---\nFinished:');
    if (foot >= 0) { body = body.slice(0, foot); }
    return body;
}

const MAX_TASKS = 300;

interface StoreShape {
    tasks: FarmTask[];
    schedules: FarmSchedule[];
    templates: FarmTemplate[];
    workflows: FarmWorkflow[];
    triggers: FarmTrigger[];
    /** farm-wide master switch / quiet hours (see core/automation.ts) */
    automation?: AutomationState;
    /** rolling fired/skipped decision log — the evidence that the gate works */
    automationLog?: AutomationEvent[];
}

export interface TaskManagerOptions {
    /** CLI args for internal judge calls — always a cheap model. */
    judgeArgs?: () => string;
    maxConcurrent?: () => number;
    maxConcurrentPerAgent?: () => number;
    /** Return a reason string to defer auto work (e.g. quota window nearly full), or undefined. */
    quotaCheck?: () => string | undefined;
    outputsMaxMB?: () => number;
    /** Secrets injected as environment variables into spawned tasks. The
     *  agent id lets the vault withhold secrets scoped to other agents. */
    getEnv?: (agentId?: string) => Record<string, string>;
    /** {secret:NAME} substitution for webhook templates. */
    resolveTemplate?: (s: string) => string;
    /** Outbound notification forwarding (B4). */
    forward?: (type: string, message: string) => void;
    /** C1: media provider settings. providerId = 'fal' | 'replicate' (Wave C). */
    mediaAuth?: (providerId: string) => string;              // full Authorization header, e.g. "Key <FAL_KEY>" / "Bearer <token>"
    mediaBaseUrl?: (providerId: string) => string | undefined; // override for tests / self-hosted proxies
    mediaPricing?: () => MediaPriceRule[]; // C3 cost estimation rules
    /** F2: media poll interval override (tests); undefined = provider default (3s). */
    mediaPollMs?: () => number;
    /** I5: model policy — extra --model args (and reason) for a task launch. */
    modelArgsFor?: (task: FarmTask) => { args: string; reason: string } | undefined;
    /**
     * The project context file for a task, written fresh at launch time from the
     * project the task was CREATED under (`task.projectId`). Undefined = no
     * project, and then no flag is added at all: a session with no project must
     * look exactly as it did before this existed.
     */
    projectContextFile?: (task: FarmTask) => string | undefined;
    /** The window's active project, read when a task is CREATED (see addTask). */
    activeProjectId?: () => string | undefined;
    /** J5: alternative CLI profiles ({prompt}/{args} templates). */
    cliProfiles?: () => CliProfile[];
    /** F3: global browser-step allowlist + per-step approval gate. */
    browserAllowHosts?: () => string[];
    /** Resolve to true to run the browser step; false cancels it. */
    confirmBrowser?: (info: { title: string; url: string; goal: string }) => Promise<boolean>;
    /** Human-in-the-loop workflow gate; resolve true to continue the chain, false to fail the step. */
    confirmApproval?: (info: { title: string; message: string }) => Promise<boolean>;
    /**
     * Wave B — visual selection gate. Resolve with the chosen asset URLs (the
     * subset kept), or null to cancel (the step's onFail policy applies).
     */
    confirmSelection?: (info: {
        title: string; message: string; min: number; max?: number;
        candidates: { taskId: string; title: string; url: string; file?: string; kind: string }[];
    }) => Promise<string[] | null>;
    /**
     * B11 multi-window safety. false = this window is a read-only FOLLOWER:
     * load() skips the stale pass (it must not cancel the runner window's live
     * rows), the pump/scheduler never launch, media jobs are not reattached,
     * and save() is blocked (onFollowerWrite fires so the host can warn).
     * A follower watches the store file and mirrors the runner's changes.
     * Default: runner (single-window behavior, unchanged).
     */
    isRunner?: () => boolean;
    /** Called when a write was blocked in follower mode. */
    onFollowerWrite?: () => void;
    /** Machine roots for portable stores: saved strings carry ${claudeDir} /
     *  ${globalStorage} / ${home} tokens instead of absolute machine paths,
     *  so the git-synced store works on every machine (see portablePaths). */
    portableRoots?: () => PortableRoot[];
    /** Actionable work-queue items, for the `queueHasWork` precondition. */
    queueWorkCount?: () => number;
    /** Today's API-equivalent spend for a budget check: agentName → USD, plus
     *  the fleet total under '*'. Undefined = no budget enforcement. */
    budgetCheck?: (agentName: string) => string | undefined;
}

export class TaskManager implements vscode.Disposable {
    tasks: FarmTask[] = [];
    schedules: FarmSchedule[] = [];
    templates: FarmTemplate[] = [];
    workflows: FarmWorkflow[] = [];
    triggers: FarmTrigger[] = [];
    automation: AutomationState = {};
    automationLog: AutomationEvent[] = [];
    private terminals = new Map<string, vscode.Terminal>();      // taskId -> terminal
    private processes = new Map<string, cp.ChildProcess>();      // taskId -> headless process
    private handoffs = new Map<string, Handoff>();               // workflowRunId -> last handoff
    // workflowRunId -> the parallel group currently fanning out on that run.
    private parallelGroups = new Map<string, {
        start: number; end: number;
        pending: Set<number>;
        results: Map<number, Handoff>;
        statuses: Map<number, TaskStatus>;
    }>();
    private timer: NodeJS.Timeout;
    private lastOutputsPrune = 0;
    private disposables: vscode.Disposable[] = [];
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(
        private storageFile: string,
        private getAgents: () => AgentInfo[],
        private autoAdvance: () => boolean,
        /** Extra CLI args appended to every task's claude command, e.g. "--model haiku". */
        private extraArgs: () => string = () => '',
        private opts: TaskManagerOptions = {}
    ) {
        this.load();
        this.applySeedFile();
        // F2: pick the persisted in-flight media jobs back up (fire-and-forget;
        // each one finishes its task normally, so interrupted chains continue).
        if (this.reattachQueue.length) {
            void vscode.window.showInformationMessage(
                `Agent Farm: reattached to ${this.reattachQueue.length} in-flight media job(s) from the previous window.`);
            for (const t of this.reattachQueue) { void this.reattachMediaTask(t); }
            this.reattachQueue = [];
        }
        if (!this.runner()) { this.startFollowerWatch(); }
        this.timer = setInterval(() => { this.tickSchedules(); this.pump(); }, 30_000);

        this.disposables.push(vscode.window.onDidCloseTerminal(terminal => {
            for (const [taskId, t] of this.terminals) {
                if (t === terminal) {
                    this.terminals.delete(taskId);
                    const task = this.tasks.find(x => x.id === taskId);
                    if (task && task.status === 'running') {
                        this.finish(task, 'done');
                    }
                    break;
                }
            }
        }));

        // Exit-code aware completion when shell integration is available.
        const win = vscode.window as unknown as {
            onDidEndTerminalShellExecution?: (cb: (e: {
                terminal: vscode.Terminal; exitCode: number | undefined;
            }) => void) => vscode.Disposable;
        };
        if (typeof win.onDidEndTerminalShellExecution === 'function') {
            this.disposables.push(win.onDidEndTerminalShellExecution(e => {
                for (const [taskId, t] of this.terminals) {
                    if (t === e.terminal) {
                        const task = this.tasks.find(x => x.id === taskId);
                        if (task && task.status === 'running') {
                            this.finish(task, e.exitCode && e.exitCode !== 0 ? 'failed' : 'done');
                        }
                        this.terminals.delete(taskId);
                        break;
                    }
                }
            }));
        }
    }

    get outputsDir(): string {
        return path.join(path.dirname(this.storageFile), 'task-outputs');
    }

    // ---------- persistence ----------

    /** B11: true when this window runs the queue (default; single-window). */
    private runner(): boolean {
        return this.opts.isRunner ? this.opts.isRunner() : true;
    }

    /** Machine roots for portable-path token save/load. */
    private proots(): PortableRoot[] {
        return this.opts.portableRoots?.() ?? [];
    }

    /** One-shot external seeding: a `seed-schedules.json` dropped next to the
     *  store (by an agent, a setup script, another machine) is merged by the
     *  RUNNER — deduped by title — then deleted. Writing farm-tasks.json from
     *  outside races with the runner's saves and loses; this file is the
     *  race-free way in. Checked at startup and on every runner takeover. */
    private applySeedFile(): void {
        if (!this.runner()) { return; }
        const file = path.join(path.dirname(this.storageFile), 'seed-schedules.json');
        let text = '';
        try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
        let added = 0;
        for (const seed of parseSeedSchedules(text)) {
            if (this.schedules.some(s => s.title === seed.title)) { continue; }
            this.addSchedule(seed);
            added++;
        }
        try { fs.unlinkSync(file); } catch { /* stays; title dedupe keeps retries safe */ }
        if (added) {
            void vscode.window.showInformationMessage(
                `Agent Farm: ${added} schedule(s) installed from seed-schedules.json.`);
        }
    }

    private load(): void {
        try {
            const raw = fs.readFileSync(this.storageFile, 'utf8');
            const json = expandDeep(JSON.parse(raw) as Partial<StoreShape>, this.proots());
            this.tasks = Array.isArray(json.tasks) ? json.tasks : [];
            this.schedules = Array.isArray(json.schedules) ? json.schedules : [];
            this.templates = Array.isArray(json.templates) ? json.templates : [];
            this.workflows = Array.isArray(json.workflows) ? json.workflows : [];
            this.triggers = Array.isArray(json.triggers) ? json.triggers : [];
            this.automation = json.automation && typeof json.automation === 'object' ? json.automation : {};
            this.automationLog = Array.isArray(json.automationLog) ? json.automationLog : [];
            // B11: a follower window mirrors the store as-is — the stale pass
            // below would cancel rows that are alive in the runner window.
            if (!this.runner()) { return; }
            // Anything marked running from a previous window is stale. Plain
            // tasks go back to the queue; workflow members are cancelled — their
            // process/poll died with the window, and a zombie 'queued' row could
            // never launch for media/approval steps (agentId '') while silently
            // killing the chain. The run is remembered so the host can offer to
            // resume it (F1).
            let staleChanged = false;
            for (const t of this.tasks) {
                if (t.status !== 'running') { continue; }
                // F2: an in-flight media job with a live deadline is NOT stale —
                // its poll URLs were persisted at submit, so we reattach and the
                // render (and the chain behind it) survives the reload.
                if (t.mediaJob && Date.now() < t.mediaJob.deadline) {
                    this.reattachQueue.push(t);
                    // B2: a reattached PARALLEL branch must not drive the chain —
                    // the group's fan-in state died with the window. The run is
                    // paused: the startup resume offer skips it, and completion
                    // re-offers it explicitly (see reattachMediaTask).
                    const step = this.workflows.find(x => x.id === t.workflowId)?.steps[t.stepIndex ?? -1];
                    if (step?.parallel) { this.parallelReattachRuns.add(t.workflowRunId ?? ''); }
                    continue;
                }
                staleChanged = true;
                if (t.workflowRunId !== undefined && t.stepIndex !== undefined) {
                    t.status = 'cancelled';
                    t.endedAt = Date.now();
                    if (t.outputFile) {
                        try {
                            fs.appendFileSync(t.outputFile,
                                '\n\n---\nInterrupted: the VS Code window closed mid-run; the step was cancelled. The run can be resumed.\n');
                        } catch { /* archive gone */ }
                    }
                    const known = this.interrupted.find(r => r.runId === t.workflowRunId);
                    if (!known) {
                        this.interrupted.push({
                            runId: t.workflowRunId, workflowId: t.workflowId ?? '',
                            stepIndex: t.stepIndex, taskId: t.id
                        });
                    } else if (t.stepIndex < known.stepIndex) {
                        // Parallel group cut mid-flight: resume from the earliest
                        // step so routeToStep re-fans the whole group.
                        known.stepIndex = t.stepIndex;
                        known.taskId = t.id;
                    }
                } else {
                    t.status = 'queued';
                    t.startedAt = undefined;
                }
            }
            // Persist the corrections right away so the interrupted-run offer is
            // one-shot; the cancelled rows keep their manual Resume affordance.
            if (staleChanged) { this.save(); }
        } catch { /* first run */ }
    }

    // ---------- F1: interrupted workflow runs ----------

    private interrupted: { runId: string; workflowId: string; stepIndex: number; taskId: string }[] = [];
    /** B2: runs with a reattaching parallel media branch — paused until it completes. */
    private parallelReattachRuns = new Set<string>();

    /**
     * Workflow runs cut mid-flight by the last window close (detected at load).
     * Runs whose workflow no longer exists (ad-hoc media runs) are not offered —
     * there is nothing to resume them into. Runs still reattaching a parallel
     * media branch are held back and offered when that branch completes.
     */
    interruptedRuns(): { runId: string; workflowTitle: string; stepIndex: number; stepTitle: string }[] {
        const out = [];
        for (const r of this.interrupted) {
            if (this.parallelReattachRuns.has(r.runId)) { continue; }
            const w = this.workflows.find(x => x.id === r.workflowId);
            if (!w) { continue; }
            out.push({
                runId: r.runId,
                workflowTitle: w.title,
                stepIndex: r.stepIndex,
                stepTitle: w.steps[r.stepIndex]?.title ?? `step ${r.stepIndex + 1}`
            });
        }
        return out;
    }

    /** Z4: attach the matched transcript's cost + tokens to a finished task (idempotent). */
    setTaskCost(taskId: string, costUSD: number, sessionFile: string, tokens?: number): void {
        const t = this.tasks.find(x => x.id === taskId);
        if (!t || t.costUSD !== undefined) { return; }
        t.costUSD = costUSD;
        t.tokens = tokens;
        t.costSessionFile = sessionFile;
        this.save();
    }

    /** Resume an interrupted run from its earliest interrupted step. */
    resumeInterrupted(runId: string): void {
        const r = this.interrupted.find(x => x.runId === runId);
        if (!r) { return; }
        this.interrupted = this.interrupted.filter(x => x.runId !== runId);
        const task = this.tasks.find(t => t.id === r.taskId);
        if (task) {
            this.resumeWorkflowFromTask(task);
            return;
        }
        // B9: the cancelled task was archived by the MAX_TASKS overflow — resume
        // from the stored coordinates instead of silently doing nothing.
        const w = this.workflows.find(x => x.id === r.workflowId);
        if (!w || r.stepIndex >= w.steps.length) {
            void vscode.window.showWarningMessage(
                'Agent Farm: this run can no longer be resumed — its workflow or step is gone.');
            return;
        }
        this.runCounts.set(runId, 0);
        void vscode.window.showInformationMessage(
            `Agent Farm: resuming workflow "${w.title}" from step ${r.stepIndex + 1}.`);
        this.routeToStep(w, r.stepIndex, this.rebuildHandoff(runId, r.stepIndex), runId);
    }

    /** Drop the resume offer — for one run, or all of them when runId is omitted. */
    dismissInterrupted(runId?: string): void {
        this.interrupted = runId ? this.interrupted.filter(r => r.runId !== runId) : [];
        this.onDidChangeEmitter.fire();
    }

    get historyDir(): string {
        return path.join(path.dirname(this.storageFile), 'task-history');
    }

    /** Move finished tasks to the monthly history log instead of losing them. */
    private appendHistory(tasks: FarmTask[]): void {
        if (!tasks.length) { return; }
        try {
            fs.mkdirSync(this.historyDir, { recursive: true });
            const byMonth = new Map<string, FarmTask[]>();
            for (const t of tasks) {
                const d = new Date(t.endedAt ?? t.createdAt);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(t);
            }
            for (const [month, list] of byMonth) {
                fs.appendFileSync(path.join(this.historyDir, `${month}.jsonl`),
                    list.map(t => JSON.stringify(tokenizeDeep(t, this.proots()))).join('\n') + '\n', 'utf8');
            }
        } catch { /* history is best-effort */ }
    }

    /** Keep the outputs archive under the configured size cap (oldest first). */
    private pruneOutputs(): void {
        const capMB = this.opts.outputsMaxMB?.() ?? 200;
        if (capMB <= 0 || Date.now() - this.lastOutputsPrune < 10 * 60_000) { return; }
        this.lastOutputsPrune = Date.now();
        try {
            if (!fs.existsSync(this.outputsDir)) { return; }
            const live = new Set(this.tasks.map(t => t.outputFile).filter(Boolean));
            const files = fs.readdirSync(this.outputsDir)
                .map(n => {
                    const p = path.join(this.outputsDir, n);
                    const st = fs.statSync(p);
                    return { p, size: st.size, mtime: st.mtimeMs };
                })
                .sort((a, b) => a.mtime - b.mtime);
            let total = files.reduce((a, f) => a + f.size, 0);
            const cap = capMB * 1024 * 1024;
            for (const f of files) {
                if (total <= cap) { break; }
                if (live.has(f.p)) { continue; } // never delete an active task's output
                try { fs.unlinkSync(f.p); total -= f.size; } catch { /* locked */ }
            }
        } catch { /* best-effort */ }
    }

    // ---------- B11: follower mode (another window runs the queue) ----------

    private followerWatcher?: fs.FSWatcher;
    private followerReloadTimer?: NodeJS.Timeout;

    /** Mirror the runner window's saves so this window's views stay fresh. */
    private startFollowerWatch(): void {
        try {
            const base = path.basename(this.storageFile);
            this.followerWatcher = fs.watch(path.dirname(this.storageFile), (_event, filename) => {
                if (filename && filename.toString() !== base) { return; }
                if (this.followerReloadTimer) { clearTimeout(this.followerReloadTimer); }
                this.followerReloadTimer = setTimeout(() => {
                    this.followerReloadTimer = undefined;
                    try {
                        const json = expandDeep(
                            JSON.parse(fs.readFileSync(this.storageFile, 'utf8')) as Partial<StoreShape>,
                            this.proots());
                        this.tasks = Array.isArray(json.tasks) ? json.tasks : [];
                        this.schedules = Array.isArray(json.schedules) ? json.schedules : [];
                        this.templates = Array.isArray(json.templates) ? json.templates : [];
                        this.workflows = Array.isArray(json.workflows) ? json.workflows : [];
                        this.triggers = Array.isArray(json.triggers) ? json.triggers : [];
                        this.onDidChangeEmitter.fire();
                    } catch { /* mid-write or gone — the next change retries */ }
                }, 800);
            });
        } catch { /* watch unavailable — views refresh on reload only */ }
    }

    private stopFollowerWatch(): void {
        try { this.followerWatcher?.close(); } catch { /* already closed */ }
        this.followerWatcher = undefined;
        if (this.followerReloadTimer) { clearTimeout(this.followerReloadTimer); this.followerReloadTimer = undefined; }
    }

    /**
     * The ownership lease landed on this window after startup (the runner
     * window closed). Take over its duties: re-read the store with the stale
     * pass, reattach persisted media jobs, resume pumping on the next tick.
     * The host must flip its isRunner() answer to true BEFORE calling this.
     */
    /** Rare edge: the lease was lost while running (e.g. a long OS sleep let
     *  another window take over). Stop launching and mirror the new runner. */
    becomeFollower(): void {
        if (!this.followerWatcher) { this.startFollowerWatch(); }
    }

    becomeRunner(): void {
        this.stopFollowerWatch();
        this.load();
        this.applySeedFile();
        if (this.reattachQueue.length) {
            void vscode.window.showInformationMessage(
                `Agent Farm: reattached to ${this.reattachQueue.length} in-flight media job(s) from the previous window.`);
            for (const t of this.reattachQueue) { void this.reattachMediaTask(t); }
            this.reattachQueue = [];
        }
        this.onDidChangeEmitter.fire();
    }

    private save(): void {
        if (!this.runner()) {
            // B11 follower: never write — the runner window owns the store. The
            // in-memory change is transient (the follower watcher restores disk
            // truth moments later); the host warns via onFollowerWrite.
            this.opts.onFollowerWrite?.();
            this.onDidChangeEmitter.fire();
            return;
        }
        try {
            fs.mkdirSync(path.dirname(this.storageFile), { recursive: true });
            if (this.tasks.length > MAX_TASKS) {
                const finished = this.tasks.filter(t =>
                    t.status === 'done' || t.status === 'cancelled' || t.status === 'failed');
                const overflow = this.tasks.length - MAX_TASKS;
                const dropped = finished.slice(0, overflow);
                this.appendHistory(dropped);
                const drop = new Set(dropped.map(t => t.id));
                this.tasks = this.tasks.filter(t => !drop.has(t.id));
            }
            // absolute machine paths leave as ${claudeDir}/${globalStorage}/${home}
            // tokens — the git-synced store stays valid on every machine
            fs.writeFileSync(this.storageFile, JSON.stringify(tokenizeDeep({
                tasks: this.tasks,
                schedules: this.schedules,
                templates: this.templates,
                workflows: this.workflows,
                triggers: this.triggers,
                automation: this.automation,
                automationLog: this.automationLog
            }, this.proots()), null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
        this.pruneOutputs();
        this.onDidChangeEmitter.fire();
    }

    // ---------- automation gate (core/automation.ts) ----------

    /** Farm-wide block (master switch / pause-until / quiet hours), or undefined.
     *  `manual` = the user pressed Run Now; quiet hours do not apply to them. */
    automationGate(now = new Date(), manual = false): ReturnType<typeof gateBlock> {
        if (pauseExpired(this.automation, now.getTime())) {
            this.automation = { ...this.automation, pausedUntil: undefined, pauseReason: undefined };
            this.save();
        }
        return gateBlock(this.automation, now, { manual });
    }

    /** Is there work? Free to evaluate — no agent is woken to find out. */
    checkPrecondition(pre: Precondition | undefined): { ok: boolean; detail: string } {
        return evaluatePrecondition(pre, { queueWorkCount: this.opts.queueWorkCount });
    }

    /** Record a fired/skipped decision. This log IS the evidence that the gate
     *  works — a precondition that silently suppressed work would be exactly
     *  the "rule that fails silently" the constitution forbids. */
    logAutomation(ev: Omit<AutomationEvent, 'ts'>): void {
        this.automationLog = appendAutomationEvent(this.automationLog, { ...ev, ts: Date.now() });
        this.save();
    }

    /** Persist after a caller mutated store rows in place (bulk enable/disable). */
    persist(): void {
        this.save();
    }

    /** Update the master switch / quiet hours (panel + bridge share this path). */
    setAutomationState(patch: Partial<AutomationState>): AutomationState {
        this.automation = { ...this.automation, ...patch };
        this.save();
        return this.automation;
    }

    // ---------- tasks ----------

    addTask(
        agent: AgentInfo, title: string, prompt: string, mode: TaskMode,
        // The launch dimensions are part of MAKING a task, not something set on
        // it afterwards: every one of them changes the command line, so a task
        // that is queued before they are applied is a task that could start
        // wrong. (The three callers that used to patch `model`/`cli` onto the
        // returned object still work — the field is the same field.)
        extra?: Partial<Pick<FarmTask,
            'fromSchedule' | 'fromTrigger' | 'workflowId' | 'workflowRunId' | 'stepIndex' | 'projectId'
            | 'model' | 'effort' | 'permissionMode' | 'cli' | 'priority' | 'workDir' | 'missionId'>>
    ): FarmTask {
        // The window's active project is stamped on the task HERE, at creation —
        // a dozen call sites make tasks, and a project that depended on all of
        // them remembering to attach it would quietly stop being attached the day
        // another appeared.
        //
        // ‼️ BUT THE WINDOW ONLY SPEAKS FOR TASKS A PERSON JUST MADE. A schedule
        // firing at 03:00, a trigger, a retry, the next step of a workflow — none
        // of those was created "in" whatever project the window happens to be
        // showing, because nobody was looking at the window. Those call sites
        // state their own origin project, and passing the key with `undefined`
        // is how they say NO PROJECT: no context, no worklog instruction, exactly
        // the way an automated run behaved before any of this existed.
        const projectId = extra && 'projectId' in extra
            ? extra.projectId
            : this.opts.activeProjectId?.();
        const task: FarmTask = {
            id: newId(),
            agentId: agent.id,
            agentName: agent.name,
            title,
            prompt,
            mode,
            status: 'queued',
            createdAt: Date.now(),
            ...extra
        };
        if (projectId) { task.projectId = projectId; } else { delete task.projectId; }
        this.tasks.push(task);
        this.save();
        return task;
    }

    private runningCount(agentId?: string): number {
        return this.tasks.filter(t =>
            t.status === 'running' && (!agentId || t.agentId === agentId)).length;
    }

    /** Why this task can't launch right now, or undefined if it can. */
    private launchBlock(task: FarmTask): string | undefined {
        const maxGlobal = this.opts.maxConcurrent?.() ?? 2;
        const maxAgent = this.opts.maxConcurrentPerAgent?.() ?? 1;
        if (maxGlobal > 0 && this.runningCount() >= maxGlobal) { return `concurrency: ${maxGlobal} running`; }
        if (maxAgent > 0 && this.runningCount(task.agentId) >= maxAgent) { return `agent busy (${task.agentName})`; }
        const quota = this.opts.quotaCheck?.();
        if (quota) { return quota; }
        // Budget is a BRAKE, not a notification: over the daily ceiling nothing
        // new launches. (It used to raise an insight and then start the task
        // anyway — a ceiling you can walk through is not a ceiling.)
        const budget = this.opts.budgetCheck?.(task.agentName);
        if (budget) { return budget; }
        return undefined;
    }

    /** Request a start; if capacity/quota blocks it, the task waits and the pump launches it later. */
    startTask(task: FarmTask): boolean {
        const block = this.launchBlock(task);
        if (block) {
            task.autoStart = true;
            task.deferredReason = block;
            this.save();
            return false;
        }
        return this.launch(task);
    }

    /** Effective launch priority: base priority plus one point per 30 min waited (anti-starvation aging). */
    private effectivePriority(t: FarmTask, now: number): number {
        return (t.priority ?? 0) + Math.floor((now - t.createdAt) / (30 * 60_000));
    }

    /** Launch deferred tasks as capacity frees up (called on every finish + every 30s). */
    private pump(): void {
        if (!this.runner()) { return; } // B11: only the runner window launches
        const now = Date.now();
        const ready = this.tasks
            .filter(t => t.status === 'queued' && t.autoStart)
            .sort((a, b) => this.effectivePriority(b, now) - this.effectivePriority(a, now)
                || a.createdAt - b.createdAt);
        for (const task of ready) {
            if (this.launchBlock(task)) { continue; }
            task.autoStart = false;
            task.deferredReason = undefined;
            this.launch(task);
        }
    }

    private launch(task: FarmTask): boolean {
        const agent = this.getAgents().find(a => a.id === task.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for task "${task.title}" not found.`);
            return false;
        }
        task.status = 'running';
        task.startedAt = Date.now();
        task.deferredReason = undefined;
        if (task.mode === 'headless') {
            this.spawnHeadless(task, agent);
        } else {
            const p = sanitizePrompt(task.prompt);
            let extra = this.extraArgs().trim();
            const profile = this.cliProfileFor(task);
            let command: string;
            if (profile) {
                command = buildCliCommand(profile.interactive ?? profile.headless, task.prompt, extra);
            } else {
                const policy = this.modelArgs(task);
                if (policy) { extra = (extra ? extra + ' ' : '') + policy.args; }
                const launch = this.launchArgs(task);
                if (launch) { extra = (extra ? extra + ' ' : '') + launch; }
                command = `claude ${extra ? extra + ' ' : ''}"${p}"`;
            }
            const terminal = vscode.window.createTerminal({
                name: `AF: ${task.title.slice(0, 30)}`,
                cwd: task.workDir ?? agent.dir,
                env: this.opts.getEnv?.(agent.id)
            });
            terminal.show();
            terminal.sendText(command, true);
            this.terminals.set(task.id, terminal);
        }
        this.save();
        return true;
    }

    /** Explicit per-task model (mission member override) beats the policy engine.
     *  Strict charset: a stored value can never smuggle shell syntax. */
    private modelArgs(task: FarmTask): { args: string; reason: string } | undefined {
        if (task.model && /^[\w.:-]+$/.test(task.model)) {
            return { args: `--model ${task.model}`, reason: `explicit override (${task.model})` };
        }
        return this.opts.modelArgsFor?.(task);
    }

    /**
     * The launch dimensions beyond the model — effort and permission mode.
     *
     * ‼️ SAME CHARSET GUARD AS THE MODEL, AND FOR THE SAME REASON. These strings
     * are stored on disk (farm-tasks.json), can be written by the bridge, and end
     * up inside a command line handed to a shell. The picker only ever offers
     * values from launch.ts, but a hand-edited store must not be able to smuggle
     * shell syntax through — anything that is not a bare word is simply dropped,
     * which degrades to "the CLI's own default" rather than to a broken run.
     */
    private launchArgs(task: FarmTask): string {
        const parts: string[] = [];
        const bare = (v?: string) => (v && /^[\w-]+$/.test(v) ? v : '');
        const effort = bare(task.effort);
        const perm = bare(task.permissionMode);
        if (effort) { parts.push(`--effort ${effort}`); }
        if (perm) { parts.push(`--permission-mode ${perm}`); }
        return parts.join(' ');
    }

    /** J5: resolve the task's CLI profile (undefined = the default claude executor). */
    private cliProfileFor(task: FarmTask): CliProfile | undefined {
        if (!task.cli) { return undefined; }
        return this.opts.cliProfiles?.().find(p => p.name === task.cli);
    }

    /** Headless tasks run as child processes so stdout/stderr land in an archived output file. */
    private spawnHeadless(task: FarmTask, agent: AgentInfo): void {
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        const profile = this.cliProfileFor(task);
        const policy = profile ? undefined : this.modelArgs(task);
        const header = `# ${task.title}\n\n` +
            `- Agent: ${task.agentName}\n` +
            `- Started: ${new Date().toLocaleString()}\n` +
            (profile ? `- CLI: ${profile.name}\n` : '') +
            (policy ? `- Model policy: ${policy.reason}\n` : '') +
            // The rest of the launch, written down where the run itself is: an
            // archived output that does not say what the run was told to be is
            // half a record.
            (task.effort ? `- Effort: ${task.effort}\n` : '') +
            (task.permissionMode ? `- Permission mode: ${task.permissionMode}\n` : '') +
            (task.workDir ? `- Workdir: ${task.workDir}\n` : '') +
            `- Prompt: ${task.prompt}\n\n---\n\n`;
        fs.writeFileSync(outFile, header, 'utf8');
        const stream = fs.createWriteStream(outFile, { flags: 'a' });

        const p = sanitizePrompt(task.prompt);
        let extra = this.extraArgs().trim();
        if (policy) { extra = (extra ? extra + ' ' : '') + policy.args; }
        // Effort and permission mode ride on the same path the model does, and
        // only on claude's: a named CLI profile is a different binary that knows
        // nothing about these flags (same rule as the project context below).
        if (!profile) {
            const launch = this.launchArgs(task);
            if (launch) { extra = (extra ? extra + ' ' : '') + launch; }
        }
        if (task.outputContract === 'json') {
            extra = (extra ? extra + ' ' : '') + '--output-format json';
        }
        // The project this task was created under, told to the agent before its
        // prompt. A FILE, and quoted: this string goes to a shell, where an
        // unquoted path breaks on a space and inline multi-line text breaks
        // outright (measured — see core/projectContext.ts).
        const ctxFile = this.opts.projectContextFile?.(task);
        if (ctxFile && !ctxFile.includes('"')) {
            extra = (extra ? extra + ' ' : '') + `--append-system-prompt-file "${ctxFile}"`;
        }
        // A named CLI profile runs a DIFFERENT binary, which knows nothing about
        // --append-system-prompt-file; the project context is claude's channel
        // and stays on claude's path.
        const command = profile
            ? buildCliCommand(profile.headless, task.prompt, this.extraArgs())
            : `claude ${extra ? extra + ' ' : ''}-p "${p}"`;
        const child = cp.spawn(command, {
            cwd: task.workDir ?? agent.dir,
            shell: true,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'], // closed stdin: claude won't wait 3s for piped input
            env: { ...process.env, ...this.opts.getEnv?.(agent.id) }
        });
        this.processes.set(task.id, child);
        child.stdout?.on('data', chunk => stream.write(chunk));
        child.stderr?.on('data', chunk => stream.write(chunk));
        child.on('error', err => {
            stream.write(`\n\n---\n[spawn error] ${String(err)}\n`);
            stream.end();
            this.processes.delete(task.id);
            if (task.status === 'running') { this.finish(task, 'failed'); }
        });
        child.on('close', code => {
            const mins = task.startedAt ? Math.round((Date.now() - task.startedAt) / 60000) : 0;
            stream.write(`\n\n---\nFinished: ${new Date().toLocaleString()} · exit ${code ?? '?'} · ${mins} min\n`);
            stream.end();
            this.processes.delete(task.id);
            if (task.status === 'running') {
                this.finish(task, code === 0 ? 'done' : 'failed');
            }
        });
    }

    private finish(task: FarmTask, status: TaskStatus): void {
        task.status = status;
        task.endedAt = Date.now();
        this.save();
        this.pump();
        if (status === 'failed') { this.maybeScheduleLimitRetry(task); }

        // Workflow chaining takes precedence over plain queue auto-advance.
        if (task.workflowId !== undefined && task.stepIndex !== undefined) {
            const w = this.workflows.find(x => x.id === task.workflowId);
            const step = w?.steps[task.stepIndex];
            if (w && step?.verify && status === 'done' && task.outputFile) {
                // Media steps get a VISION judge on the produced asset; regular
                // steps get the text judge (which would crash retrying a media
                // step, since media tasks have no agent).
                if (step.media) { void this.verifyMediaThenAdvance(task, w, step); }
                else { void this.verifyThenAdvance(task, w, step); }
                return;
            }
            this.advanceWorkflow(task, status);
            return;
        }
        if (status === 'done' && this.autoAdvance()) {
            const next = this.nextQueuedFor(task.agentId);
            if (next) {
                void vscode.window.showInformationMessage(
                    `Agent Farm: starting next queued task — "${next.title}"`);
                this.startTask(next);
            }
        }
    }

    /** Session-limit resilience: a headless task that failed ONLY because the
     *  Claude usage/session limit was hit (its output says so) is NOT a real
     *  failure — the work was never attempted. Re-run it a little later so it is
     *  not silently dropped; the limit clears within hours and a later attempt
     *  succeeds. Capped so a persistent problem can't loop forever. Fires only
     *  while VS Code stays open (the same constraint as every other automation). */
    private maybeScheduleLimitRetry(task: FarmTask): void {
        const CAP = 6;
        const DELAY_MS = 40 * 60 * 1000;
        if (task.mode !== 'headless' || !task.agentId || task.workflowId !== undefined) { return; }
        let out = '';
        try { if (task.outputFile) { out = fs.readFileSync(task.outputFile, 'utf8'); } } catch { /* no output yet */ }
        if (!/hit your session limit|session limit[^.]*reset/i.test(out)) { return; }
        const attempt = Number(/\(limit-retry (\d+)\)\s*$/.exec(task.title)?.[1] ?? 0);
        if (attempt >= CAP) { return; }
        const agent = this.getAgents().find(a => a.id === task.agentId);
        if (!agent) { return; }
        const baseTitle = task.title.replace(/\s*\(limit-retry \d+\)\s*$/, '');
        const nextTitle = `${baseTitle} (limit-retry ${attempt + 1})`;
        const prompt = task.prompt;
        const mode = task.mode;
        try {
            if (task.outputFile) {
                fs.appendFileSync(task.outputFile,
                    `\n\n---\n[session limit] Bu is yalnizca oturum limiti dolu oldugu icin basarisiz oldu — gercek hata degil. ` +
                    `~${Math.round(DELAY_MS / 60000)} dk sonra otomatik yeniden denenecek (deneme ${attempt + 1}/${CAP}); limit temizlenince kosacak.\n`);
            }
        } catch { /* best-effort note */ }
        // Same work, same project — and it fires minutes later, from a timer, in
        // a window that may be showing something else entirely by then.
        const projectId = task.projectId;
        setTimeout(() => {
            try {
                const t = this.addTask(agent, nextTitle, prompt, mode, { projectId });
                this.startTask(t);
            } catch { /* ignore */ }
        }, DELAY_MS);
    }

    // ---------- verification (A2) ----------

    /** Cheap-model judge: returns PASS/FAIL + reason for a step output. */
    private runJudge(cwd: string, criteria: string, body: string): Promise<{ pass: boolean; reason: string }> {
        return new Promise(resolve => {
            const judgeArgs = (this.opts.judgeArgs?.() ?? '--model claude-haiku-4-5-20251001').trim();
            const prompt = sanitizePrompt(
                `Sen bir kalite denetçisisin. Aşağıdaki ÇIKTI şu ÖLÇÜTÜ karşılıyor mu? ` +
                `ÖLÇÜT: ${criteria} --- ÇIKTI: ${body.slice(0, 4000)} --- ` +
                `Yalnızca tek satır cevap ver: ilk kelime PASS veya FAIL olsun, ardından kısa gerekçe yaz.`);
            cp.exec(`claude ${judgeArgs} -p "${prompt}"`,
                { cwd, timeout: 180_000, windowsHide: true },
                (err, stdout) => {
                    if (err && !stdout) {
                        resolve({ pass: true, reason: 'judge unavailable — passed through (' + String(err.message).slice(0, 80) + ')' });
                        return;
                    }
                    const line = String(stdout).trim().split('\n').find(l => l.trim()) ?? '';
                    const pass = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
                    resolve({ pass, reason: line.slice(0, 200) || '(no verdict)' });
                });
        });
    }

    /**
     * Wave B2 — vision judge: a vision-capable model opens the produced asset
     * file (via its Read tool) and rules PASS/FAIL against the criteria. Runs in
     * the outputs dir so the Read is inside the working directory. Fail-open if
     * the judge can't run, so a misconfig never blocks the pipeline.
     */
    private runVisionJudge(assetFile: string, criteria: string): Promise<{ pass: boolean; reason: string }> {
        return new Promise(resolve => {
            const judgeArgs = (this.opts.judgeArgs?.() ?? '--model claude-haiku-4-5-20251001').trim();
            const prompt = sanitizePrompt(
                `Sen bir görsel kalite denetçisisin. "${path.basename(assetFile)}" dosyasındaki görseli/videoyu Read aracıyla aç ve incele. ` +
                `Şu ÖLÇÜTü karşılıyor mu? ÖLÇÜT: ${criteria}. ` +
                `Yalnızca tek satır cevap ver: ilk kelime PASS veya FAIL olsun, ardından kısa gerekçe yaz.`);
            cp.exec(`claude ${judgeArgs} -p "${prompt}"`,
                { cwd: this.outputsDir, timeout: 180_000, windowsHide: true },
                (err, stdout) => {
                    if (err && !stdout) {
                        resolve({ pass: true, reason: 'vision judge unavailable — passed through (' + String(err.message).slice(0, 80) + ')' });
                        return;
                    }
                    const line = String(stdout).trim().split('\n').filter(l => l.trim()).pop() ?? '';
                    const pass = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
                    resolve({ pass, reason: line.slice(0, 200) || '(no verdict)' });
                });
        });
    }

    /**
     * Wave B2 — verify a media step's asset with the vision judge; on FAIL,
     * re-run the SAME media step (feedback appended to its prompt) up to the
     * configured retry count. Unlike the text path, the retry re-runs the media
     * generator, not an agent task.
     */
    private async verifyMediaThenAdvance(task: FarmTask, w: FarmWorkflow, step: WorkflowStep): Promise<void> {
        const meta = readMediaMetas(this.outputsDir).find(m => m.taskId === task.id);
        const assetFile = meta?.assetFiles.find(f => fs.existsSync(f));
        const attempt = task.attempt ?? 0;
        const { pass, reason } = assetFile
            ? await this.runVisionJudge(assetFile, step.verify!.criteria)
            : { pass: true, reason: 'no downloaded asset to verify — passed through' };
        try {
            fs.appendFileSync(task.outputFile as string,
                `\nVision verify (attempt ${attempt + 1}): ${pass ? 'PASS' : 'FAIL'} — ${reason}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.verified = pass ? 'pass' : 'fail';

        if (pass) {
            this.save();
            this.advanceWorkflow(task, 'done');
            return;
        }
        const retries = step.verify!.retries ?? 1;
        if (attempt < retries) {
            this.save();
            void vscode.window.showWarningMessage(
                `Agent Farm: media "${task.title}" failed vision QA — regenerating (${attempt + 1}/${retries}).`);
            // B4: after a reload the in-memory handoff is gone — rebuild it from
            // the previous step's archived output so {prev_*} resolve correctly.
            const handoff = this.handoffs.get(task.workflowRunId ?? '')
                ?? this.rebuildHandoff(task.workflowRunId ?? '', task.stepIndex ?? 0);
            void this.runMediaStep(w, task.stepIndex as number, handoff, task.workflowRunId as string,
                { attempt: attempt + 1, feedback: reason });
            return;
        }
        task.status = 'failed';
        this.save();
        void vscode.window.showWarningMessage(
            `Agent Farm: media "${task.title}" failed vision QA after ${attempt + 1} attempt(s).`);
        this.advanceWorkflow(task, 'failed');
    }

    private async verifyThenAdvance(task: FarmTask, w: FarmWorkflow, step: WorkflowStep): Promise<void> {
        const agent = this.getAgents().find(a => a.id === task.agentId);
        const body = archivedOutputBody(fs.readFileSync(task.outputFile as string, 'utf8'));
        const attempt = task.attempt ?? 0;
        const { pass, reason } = await this.runJudge(agent?.dir ?? process.cwd(),
            step.verify!.criteria, body);
        try {
            fs.appendFileSync(task.outputFile as string,
                `\nVerify (attempt ${attempt + 1}): ${pass ? 'PASS' : 'FAIL'} — ${reason}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.verified = pass ? 'pass' : 'fail';

        if (pass) {
            this.save();
            this.advanceWorkflow(task, 'done');
            return;
        }
        const retries = step.verify!.retries ?? 1;
        if (attempt < retries) {
            this.save();
            void vscode.window.showWarningMessage(
                `Agent Farm: "${task.title}" failed verification — retrying (${attempt + 1}/${retries}).`);
            const retry = this.addTask(
                this.getAgents().find(a => a.id === task.agentId)!,
                task.title.replace(/ \(retry \d+\)$/, '') + ` (retry ${attempt + 1})`,
                task.prompt + ` — Önceki deneme şu gerekçeyle reddedildi: ${reason.replace(/"/g, "'")}. Eksiği giderip yeniden yap.`,
                task.mode,
                {
                    workflowId: task.workflowId, workflowRunId: task.workflowRunId,
                    stepIndex: task.stepIndex, projectId: task.projectId
                });
            retry.attempt = attempt + 1;
            retry.outputContract = task.outputContract;
            this.startTask(retry);
            return;
        }
        task.status = 'failed';
        this.save();
        void vscode.window.showWarningMessage(
            `Agent Farm: "${task.title}" failed verification after ${attempt + 1} attempt(s).`);
        this.advanceWorkflow(task, 'failed');
    }

    completeTask(task: FarmTask): void {
        const child = this.processes.get(task.id);
        if (child) { this.killProcess(task.id, child); }
        this.finish(task, 'done');
    }

    cancelTask(task: FarmTask): void {
        const terminal = this.terminals.get(task.id);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(task.id);
        }
        const child = this.processes.get(task.id);
        if (child) { this.killProcess(task.id, child); }
        task.status = 'cancelled';
        task.endedAt = Date.now();
        this.save();
    }

    private killProcess(taskId: string, child: cp.ChildProcess): void {
        this.processes.delete(taskId);
        try {
            if (process.platform === 'win32' && child.pid) {
                // shell:true wraps claude in cmd.exe — kill the whole tree.
                cp.exec(`taskkill /pid ${child.pid} /T /F`);
            } else {
                child.kill();
            }
        } catch { /* already gone */ }
    }

    deleteTask(task: FarmTask): void {
        this.tasks = this.tasks.filter(t => t.id !== task.id);
        this.deleteOutput(task);
        this.save();
    }

    private deleteOutput(task: FarmTask): void {
        if (task.outputFile) {
            try { fs.unlinkSync(task.outputFile); } catch { /* keep going */ }
        }
    }

    moveTask(task: FarmTask, dir: -1 | 1): void {
        const siblings = this.tasks.filter(t => t.agentId === task.agentId && t.status === 'queued');
        const i = siblings.indexOf(task);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= siblings.length) { return; }
        const a = this.tasks.indexOf(siblings[i]);
        const b = this.tasks.indexOf(siblings[j]);
        [this.tasks[a], this.tasks[b]] = [this.tasks[b], this.tasks[a]];
        this.save();
    }

    /** Bump a queued task above every other queued task and request its start (launches next as capacity frees). */
    runTaskNext(task: FarmTask): void {
        if (task.status !== 'queued') { return; }
        const maxP = Math.max(0, ...this.tasks
            .filter(t => t.status === 'queued' && t.id !== task.id)
            .map(t => t.priority ?? 0));
        task.priority = maxP + 1;
        this.startTask(task);
    }

    /** An already-queued task on the same agent with the same prompt — the dup guard for the add flow. */
    queuedDuplicate(agentId: string, prompt: string): FarmTask | undefined {
        const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
        const target = norm(prompt);
        return this.tasks.find(t => t.status === 'queued'
            && t.agentId === agentId && norm(t.prompt) === target);
    }

    /**
     * Re-run a finished task as a fresh copy. A workflow-step task (with no edited
     * prompt) resumes the chain from its step instead of running in isolation.
     */
    retryTask(task: FarmTask, newPrompt?: string): FarmTask | undefined {
        if (task.workflowId !== undefined && task.stepIndex !== undefined && newPrompt === undefined) {
            this.resumeWorkflowFromTask(task);
            return undefined;
        }
        const agent = this.getAgents().find(a => a.id === task.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for "${task.title}" not found.`);
            return undefined;
        }
        const baseTitle = task.title.replace(/ \(retry \d+\)$/i, '');
        const attempt = (task.attempt ?? 0) + 1;
        // The retry belongs to the ORIGINAL's project, not to whatever the window
        // moved on to in the meantime — a rerun of the same work is the same work.
        const copy = this.addTask(agent, `${baseTitle} (retry ${attempt})`, newPrompt ?? task.prompt, task.mode,
            { projectId: task.projectId });
        copy.attempt = attempt;
        copy.outputContract = task.outputContract;
        copy.cli = task.cli;
        copy.workDir = task.workDir;
        copy.missionId = task.missionId;
        this.startTask(copy);
        return copy;
    }

    /**
     * Re-enter a workflow at the step this task belongs to, rebuilding the handoff
     * from the previous step's output in the same run (empty for the first step).
     */
    resumeWorkflowFromTask(task: FarmTask): void {
        const w = this.workflows.find(x => x.id === task.workflowId);
        if (!w || task.stepIndex === undefined) {
            void vscode.window.showWarningMessage(
                `Agent Farm: the workflow for "${task.title}" no longer exists.`);
            return;
        }
        const stepIndex = task.stepIndex;
        if (stepIndex >= w.steps.length) {
            void vscode.window.showWarningMessage(
                `Agent Farm: step ${stepIndex + 1} no longer exists in "${w.title}".`);
            return;
        }
        const runId = task.workflowRunId ?? newId();
        const handoff = this.rebuildHandoff(runId, stepIndex);
        this.runCounts.set(runId, 0);
        void vscode.window.showInformationMessage(
            `Agent Farm: resuming workflow "${w.title}" from step ${stepIndex + 1}.`);
        this.routeToStep(w, stepIndex, handoff, runId);
    }

    clearFinished(): number {
        const finished = this.tasks.filter(t =>
            t.status !== 'queued' && t.status !== 'running');
        this.appendHistory(finished);
        for (const t of finished) { this.deleteOutput(t); }
        this.tasks = this.tasks.filter(t =>
            t.status === 'queued' || t.status === 'running');
        this.save();
        return finished.length;
    }

    nextQueuedFor(agentId: string): FarmTask | undefined {
        const now = Date.now();
        return this.tasks
            .filter(t => t.agentId === agentId && t.status === 'queued')
            .sort((a, b) => this.effectivePriority(b, now) - this.effectivePriority(a, now)
                || a.createdAt - b.createdAt)[0];
    }

    revealTerminal(task: FarmTask): void {
        this.terminals.get(task.id)?.show();
    }

    // ---------- templates ----------

    addTemplate(t: Omit<FarmTemplate, 'id'>): FarmTemplate {
        const template: FarmTemplate = { ...t, id: newId() };
        this.templates.push(template);
        this.save();
        return template;
    }

    deleteTemplate(t: FarmTemplate): void {
        this.templates = this.templates.filter(x => x.id !== t.id);
        this.save();
    }

    // ---------- workflows ----------

    addWorkflow(title: string, steps: WorkflowStep[]): FarmWorkflow {
        const workflow: FarmWorkflow = { id: newId(), title, steps };
        this.workflows.push(workflow);
        this.save();
        return workflow;
    }

    deleteWorkflow(w: FarmWorkflow): void {
        this.workflows = this.workflows.filter(x => x.id !== w.id);
        this.save();
    }

    renameWorkflow(w: FarmWorkflow, title: string): void {
        w.title = title;
        this.save();
    }

    addWorkflowStep(w: FarmWorkflow, step: WorkflowStep): void {
        w.steps.push(step);
        this.save();
    }

    updateWorkflowStep(w: FarmWorkflow, index: number, patch: Partial<WorkflowStep>): void {
        if (index < 0 || index >= w.steps.length) { return; }
        w.steps[index] = { ...w.steps[index], ...patch };
        this.save();
    }

    moveWorkflowStep(w: FarmWorkflow, index: number, dir: -1 | 1): void {
        const j = index + dir;
        if (index < 0 || j < 0 || j >= w.steps.length) { return; }
        [w.steps[index], w.steps[j]] = [w.steps[j], w.steps[index]];
        this.save();
    }

    deleteWorkflowStep(w: FarmWorkflow, index: number): void {
        if (index < 0 || index >= w.steps.length) { return; }
        w.steps.splice(index, 1);
        this.save();
    }

    /** Recent workflow runs (for the timeline visualization). */
    workflowRuns(sinceMs: number): {
        runId: string; title: string;
        steps: { title: string; agentName: string; status: TaskStatus; startedAt?: number; endedAt?: number }[];
    }[] {
        const cutoff = Date.now() - sinceMs;
        const byRun = new Map<string, FarmTask[]>();
        for (const t of this.tasks) {
            if (!t.workflowRunId || !t.startedAt || t.startedAt < cutoff) { continue; }
            const list = byRun.get(t.workflowRunId) ?? [];
            list.push(t);
            byRun.set(t.workflowRunId, list);
        }
        const runs = [];
        for (const [runId, list] of byRun) {
            list.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
            const w = this.workflows.find(x => x.id === list[0].workflowId);
            runs.push({
                runId,
                title: w?.title ?? list[0].title.split(' ')[0],
                steps: list.map(t => ({
                    title: t.title,
                    agentName: t.agentName,
                    status: t.status,
                    startedAt: t.startedAt,
                    endedAt: t.endedAt
                }))
            });
        }
        runs.sort((a, b) => (b.steps[0]?.startedAt ?? 0) - (a.steps[0]?.startedAt ?? 0));
        return runs;
    }

    /** Loop guard: total step executions per workflow run. */
    private static readonly MAX_RUN_STEPS = 25;
    private runCounts = new Map<string, number>();

    runWorkflow(w: FarmWorkflow): void {
        if (!w.steps.length) { return; }
        const runId = newId();
        this.runCounts.set(runId, 0);
        this.routeToStep(w, 0, {}, runId);
    }

    /**
     * Rebuild a step's incoming handoff from disk: the latest done task of the
     * previous step in the same run. Used wherever the in-memory handoffs map
     * may be gone (resume after reload, verify-retry after reattach).
     */
    private rebuildHandoff(runId: string, stepIndex: number): Handoff {
        if (stepIndex <= 0) { return {}; }
        const prev = this.tasks
            .filter(t => t.workflowRunId === runId && t.stepIndex === stepIndex - 1 && t.status === 'done')
            .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
        return prev ? this.computeHandoff(prev) : {};
    }

    /** Build what a finished step hands to the next one (A3: structured handoff). */
    private computeHandoff(task: FarmTask): Handoff {
        const handoff: Handoff = { file: task.outputFile };
        if (!task.outputFile) { return handoff; }
        try {
            const body = archivedOutputBody(fs.readFileSync(task.outputFile, 'utf8')).trim();
            handoff.text = body;
            const envelope = extractJson(body);
            if (envelope && typeof envelope === 'object') {
                const env = envelope as { result?: unknown };
                if (typeof env.result === 'string') {
                    handoff.text = env.result;
                    handoff.json = extractJson(env.result) ?? envelope;
                } else {
                    handoff.json = envelope;
                }
            }
        } catch { /* archive unreadable */ }
        return handoff;
    }

    private substitute(prompt: string, handoff: Handoff): string {
        let out = prompt.split(PREV_OUTPUT_PLACEHOLDER).join(handoff.file ?? '');
        out = out.split('{prev_text}').join((handoff.text ?? '').slice(0, 1500));
        out = out.replace(/\{prev_json\.([\w.]+)\}/g, (_m, fieldPath: string) => {
            let cur: unknown = handoff.json;
            for (const key of fieldPath.split('.')) {
                if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
                    cur = (cur as Record<string, unknown>)[key];
                } else { return ''; }
            }
            return typeof cur === 'string' ? cur : JSON.stringify(cur ?? '');
        });
        return out;
    }

    private runIfMatches(runIf: string, handoff: Handoff): boolean {
        try {
            // "json:field.path~regex" tests a parsed JSON field; plain string tests the body.
            const jsonCond = /^json:([\w.]+)~(.+)$/.exec(runIf);
            if (jsonCond) {
                const value = this.substitute(`{prev_json.${jsonCond[1]}}`, handoff);
                return new RegExp(jsonCond[2], 'i').test(value);
            }
            return new RegExp(runIf, 'i').test(handoff.text ?? '');
        } catch { return false; }
    }

    /** Advance a run to a step, honoring runIf conditions and the loop guard. */
    private routeToStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        if (index < 0 || index >= w.steps.length) {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.parallelGroups.delete(runId);
            this.opts.forward?.('workflow-done', `Workflow "${w.title}" completed`);
            void vscode.window.showInformationMessage(
                `Agent Farm: workflow "${w.title}" completed ✓.`);
            return;
        }
        const count = this.runCounts.get(runId) ?? 0;
        if (count >= TaskManager.MAX_RUN_STEPS) {
            this.runCounts.delete(runId);
            this.parallelGroups.delete(runId);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — step limit reached (possible loop in onFail routing).`);
            return;
        }
        this.runCounts.set(runId, count + 1);

        const step = w.steps[index];
        // Entering a parallel region (from anywhere) fans out the whole group.
        if (step.parallel) {
            let gs = index;
            while (gs > 0 && w.steps[gs - 1].parallel) { gs--; }
            this.startParallelGroup(w, gs, handoff, runId);
            return;
        }
        if (step.runIf && !this.runIfMatches(step.runIf, handoff)) {
            void vscode.window.showInformationMessage(
                `Agent Farm: workflow "${w.title}" — step ${index + 1} skipped (condition /${step.runIf}/ not met).`);
            this.routeToStep(w, index + 1, handoff, runId);
            return;
        }
        this.startWorkflowStep(w, index, handoff, runId);
    }

    private startWorkflowStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        const step = w.steps[index];
        this.handoffs.set(runId, handoff);

        if (step.webhook) {
            this.runWebhookStep(w, index, handoff, runId);
            return;
        }
        if (step.media) {
            void this.runMediaStep(w, index, handoff, runId);
            return;
        }
        if (step.browser) {
            void this.runBrowserStep(w, index, handoff, runId);
            return;
        }
        if (step.approval) {
            void this.runApprovalStep(w, index, handoff, runId);
            return;
        }
        if (step.select) {
            void this.runSelectStep(w, index, handoff, runId);
            return;
        }
        const agent = this.getAgents().find(a => a.id === step.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — agent "${step.agentName}" not found.`);
            return;
        }
        const prompt = this.substitute(step.prompt, handoff);
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt, step.mode,
            { workflowId: w.id, workflowRunId: runId, stepIndex: index, ...this.runProject(runId) });
        if (step.outputContract) { task.outputContract = step.outputContract; }
        this.startTask(task);
    }

    /**
     * What a workflow step inherits from its run.
     *
     * The FIRST step is made by a person pressing something, so the window speaks
     * for it and this returns nothing (the active-project stamp applies). Every
     * step after it is made by the previous step finishing — possibly an hour
     * later, in a window that has moved on — so it takes the project the run
     * started under, whatever that was, including none.
     */
    private runProject(runId: string): { projectId?: string } {
        const first = this.tasks.find(t => t.workflowRunId === runId);
        return first ? { projectId: first.projectId } : {};
    }

    /** B3: a chain step that is an HTTP call; the response becomes the next handoff. */
    private runWebhookStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): void {
        const step = w.steps[index];
        const hook = step.webhook!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));
        const url = resolve(hook.url);
        const method = (hook.method ?? 'POST').toUpperCase();
        const body = hook.body ? resolve(hook.body) : undefined;

        const task: FarmTask = {
            id: newId(),
            agentId: '',
            agentName: 'webhook',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt: `${method} ${hook.url}`,
            mode: 'headless',
            status: 'running',
            createdAt: Date.now(),
            startedAt: Date.now(),
            workflowId: w.id,
            workflowRunId: runId,
            stepIndex: index
        };
        this.tasks.push(task);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        // Wave C: templated custom headers (auth for queued APIs).
        const headers: Record<string, string> = {};
        if (body) { headers['Content-Type'] = 'application/json'; }
        for (const [k, v] of Object.entries(hook.headers ?? {})) { headers[k] = resolve(v); }

        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);
        fetch(url, {
            method,
            headers,
            body: method === 'GET' ? undefined : body,
            signal: controller.signal
        }).then(async res => {
            clearTimeout(timer);
            const text = (await res.text()).slice(0, 100_000);
            // Poll mode: the initial call only submits; poll until the job is done.
            if (hook.poll && res.ok) {
                let submitJson: unknown;
                try { submitJson = JSON.parse(text); } catch { submitJson = text; }
                const result = await pollWebhookResult(submitJson, headers, hook.poll);
                const finalText = typeof result.response === 'string'
                    ? result.response
                    : JSON.stringify(result.response ?? {}, null, 2);
                fs.writeFileSync(outFile,
                    `# ${task.title}\n\n- Webhook (poll): ${method} ${hook.url}\n- Submit: HTTP ${res.status}\n` +
                    `- Started: ${new Date(started).toLocaleString()}\n\n---\n\n${finalText.slice(0, 100_000)}\n\n---\n` +
                    `Finished: ${new Date().toLocaleString()} · ${result.ok ? 'OK' : 'FAILED — ' + (result.error ?? '')}\n`, 'utf8');
                this.finish(task, result.ok ? 'done' : 'failed');
                return;
            }
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Webhook: ${method} ${hook.url}\n- Status: ${res.status}\n` +
                `- Started: ${new Date(started).toLocaleString()}\n\n---\n\n${text}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · HTTP ${res.status}\n`, 'utf8');
            this.finish(task, res.ok ? 'done' : 'failed');
        }).catch(err => {
            clearTimeout(timer);
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Webhook: ${method} ${hook.url}\n\n---\n\n[request error] ${String(err)}\n`, 'utf8');
            this.finish(task, 'failed');
        });
    }

    /** C1: a chain step that generates media via the fal.ai queue API. */
    private async runMediaStep(
        w: FarmWorkflow, index: number, handoff: Handoff, runId: string,
        retry?: { attempt: number; feedback: string }
    ): Promise<void> {
        const step = w.steps[index];
        const media = step.media!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));

        const task: FarmTask = {
            id: newId(),
            agentId: '',
            agentName: 'media',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}` + (retry ? ` (retry ${retry.attempt})` : ''),
            prompt: `${media.model}`,
            mode: 'headless',
            status: 'running',
            createdAt: Date.now(),
            startedAt: Date.now(),
            attempt: retry?.attempt,
            workflowId: w.id,
            workflowRunId: runId,
            stepIndex: index
        };
        this.tasks.push(task);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        const provider = providerFor(media.model);
        const auth = (this.opts.mediaAuth?.(provider.id) ?? '').trim();
        const input = retry ? injectMediaFeedback(resolve(media.input), retry.feedback) : resolve(media.input);
        const info = {
            model: media.model, stepTitle: step.title, workflowTitle: w.title,
            input, projectId: media.projectId, sceneId: media.sceneId
        };

        if (!auth || auth.includes('{secret:')) {
            await this.completeMediaTask(task, info, {
                ok: false,
                error: `Media auth missing — store your ${provider.label} key with "Agent Farm: Set Secret…" as ${provider.secretHint}.`,
                assetUrls: []
            });
            return;
        }

        const timeoutMs = (media.timeoutMin ?? 10) * 60_000;
        let result: MediaResult;
        try {
            result = await provider.run(media.model, input, auth, {
                baseUrl: this.opts.mediaBaseUrl?.(provider.id),
                timeoutMs,
                pollMs: this.opts.mediaPollMs?.(),
                // F2: persist the poll URLs the moment the job is queued, so a
                // window close mid-render reattaches instead of losing the job.
                onQueued: job => {
                    task.mediaJob = {
                        provider: provider.id, statusUrl: job.statusUrl, responseUrl: job.responseUrl,
                        deadline: Date.now() + timeoutMs + 60_000,
                        input: input.slice(0, 2000)
                    };
                    this.save();
                }
            });
        } catch (e) {
            // F3: a provider crash must fail the step honestly — never leave the
            // task stuck 'running' with the chain silently dead.
            result = { ok: false, error: `provider error: ${String(e).slice(0, 300)}`, assetUrls: [] };
        }
        await this.completeMediaTask(task, info, result);
    }

    /**
     * F2: shared media completion tail (normal runs AND reattached runs) —
     * downloads assets, writes the archive + gallery meta, finishes the task.
     * finish() then drives the workflow chain as usual.
     */
    private async completeMediaTask(
        task: FarmTask,
        info: {
            model: string; stepTitle: string; workflowTitle?: string; input: string;
            projectId?: string; sceneId?: string; note?: string;
        },
        result: MediaResult,
        /** B2: reattached parallel branches must not drive the chain (fan-in state is gone). */
        suppressAdvance = false
    ): Promise<void> {
        task.mediaJob = undefined;
        const outFile = task.outputFile as string;
        const writeOut = (ok: boolean, detail: string, response?: unknown, assets: string[] = [], estCost = 0) => {
            // B8: an unwritable archive must never leave the task stuck 'running'.
            try {
                fs.writeFileSync(outFile,
                    `# ${task.title}\n\n- Media model: ${info.model}\n- Started: ${new Date(task.startedAt!).toLocaleString()}\n` +
                    (info.note ? `- Note: ${info.note}\n` : '') +
                    (assets.length ? `- Assets: ${assets.map(a => path.basename(a)).join(', ')}\n` : '') +
                    (estCost ? `- Est. cost: $${estCost.toFixed(3)}\n` : '') +
                    `\n---\n\n${response ? JSON.stringify(response, null, 2).slice(0, 20_000) : detail}\n\n---\n` +
                    `Finished: ${new Date().toLocaleString()} · ${ok ? 'OK' : 'FAILED'}\n`, 'utf8');
            } catch { /* archive unwritable — the task still finishes */ }
            if (suppressAdvance) {
                task.status = ok ? 'done' : 'failed';
                task.endedAt = Date.now();
                this.save();
                this.pump();
            } else {
                this.finish(task, ok ? 'done' : 'failed');
            }
        };
        if (!result.ok) {
            writeOut(false, `[media error] ${result.error ?? 'unknown'}`);
            return;
        }

        const assets: string[] = [];
        const assetUrls: string[] = [];
        for (const [i, url] of result.assetUrls.slice(0, 4).entries()) {
            const file = path.join(this.outputsDir, `${task.id}-${i + 1}.${extFromUrl(url)}`);
            try { if (await downloadAsset(url, file)) { assets.push(file); assetUrls.push(url); } }
            catch { /* one bad asset must not sink the step */ }
        }
        const estCost = estimateMediaCost(info.model, result.response,
            this.opts.mediaPricing?.() ?? DEFAULT_MEDIA_PRICING);
        task.mediaCost = estCost;

        const meta: MediaMeta = {
            taskId: task.id,
            title: info.stepTitle,
            model: info.model,
            input: info.input.slice(0, 2000),
            assetFiles: assets,
            assetUrls,
            estCost,
            ts: Date.now(),
            workflowTitle: info.workflowTitle,
            projectId: info.projectId,
            sceneId: info.sceneId,
            source: 'fal'
        };
        try {
            fs.writeFileSync(path.join(this.outputsDir, `${task.id}.media.json`),
                JSON.stringify(meta, null, 2), 'utf8');
        } catch { /* gallery meta is best-effort */ }
        writeOut(true, '', result.response, assets, estCost);
    }

    /** F2: tasks whose media job survived the reload (collected at load, polled from the ctor). */
    private reattachQueue: FarmTask[] = [];

    /** F2: resume polling a media job whose window died mid-render. */
    private async reattachMediaTask(task: FarmTask): Promise<void> {
        const job = task.mediaJob!;
        const w = this.workflows.find(x => x.id === task.workflowId);
        const step = task.stepIndex !== undefined ? w?.steps[task.stepIndex] : undefined;
        const info = {
            model: step?.media?.model ?? task.prompt,
            stepTitle: step?.title ?? task.title,
            workflowTitle: w?.title,
            input: job.input ?? '(reattached after reload)',
            projectId: step?.media?.projectId,
            sceneId: step?.media?.sceneId,
            note: 'reattached after a window reload — polling resumed from the persisted job URLs'
        };
        try { fs.appendFileSync(task.outputFile as string, `\nReattached after reload — polling ${job.provider} job.\n`); }
        catch { /* archive gone */ }
        const auth = (this.opts.mediaAuth?.(job.provider) ?? '').trim();
        if (!auth || auth.includes('{secret:')) {
            await this.completeMediaTask(task, info, {
                ok: false, error: 'media auth unavailable after reload — could not reattach', assetUrls: []
            });
            return;
        }
        const remaining = Math.max(60_000, job.deadline - Date.now());
        const pollMs = this.opts.mediaPollMs?.();
        let result: MediaResult;
        try {
            result = job.provider === 'replicate'
                ? await pollReplicateResult(job.statusUrl, auth, { timeoutMs: remaining, pollMs })
                : await pollFalResult(job.statusUrl, job.responseUrl, auth, { timeoutMs: remaining, pollMs });
        } catch (e) {
            result = { ok: false, error: `reattach poll error: ${String(e).slice(0, 300)}`, assetUrls: [] };
        }
        // B2: a parallel branch completes WITHOUT advancing — the group's fan-in
        // state died with the window, so advancing here would either re-fan the
        // group (duplicate renders) or skip the merge. The run is offered for
        // resume instead, once its last reattaching branch is done.
        const isParallelBranch = step?.parallel === true;
        await this.completeMediaTask(task, info, result, isParallelBranch);
        if (!isParallelBranch) { return; }
        const runId = task.workflowRunId ?? '';
        const stillReattaching = this.tasks.some(t =>
            t.workflowRunId === runId && t.status === 'running' && t.mediaJob);
        if (stillReattaching) { return; }
        this.parallelReattachRuns.delete(runId);
        const known = this.interrupted.find(r => r.runId === runId);
        if (!known) {
            this.interrupted.push({
                runId, workflowId: task.workflowId ?? '',
                stepIndex: task.stepIndex ?? 0, taskId: task.id
            });
        } else if ((task.stepIndex ?? 0) < known.stepIndex) {
            known.stepIndex = task.stepIndex ?? 0;
            known.taskId = task.id;
        }
        void vscode.window.showWarningMessage(
            `Agent Farm: parallel branch "${task.title}" finished after the reload, but the group's fan-in state was lost — the run is paused. Resume re-runs the whole group.`,
            'Resume'
        ).then(choice => { if (choice === 'Resume') { this.resumeInterrupted(runId); } });
    }

    /** F3: browser step — allowlist gate + optional approval, then a normal agent task. */
    private async runBrowserStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const browser = step.browser!;
        const url = this.substitute(browser.url, handoff);
        const goal = this.substitute(browser.goal, handoff);
        const allowHosts = (browser.allowHosts?.length ? browser.allowHosts : undefined)
            ?? this.opts.browserAllowHosts?.() ?? [];

        const fail = (why: string) => {
            void vscode.window.showWarningMessage(
                `Agent Farm: browser step "${step.title}" blocked — ${why}`);
            // Synthetic failed task so onFail routing still applies.
            const task: FarmTask = {
                id: newId(), agentId: step.agentId, agentName: step.agentName,
                title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
                prompt: `browser: ${url}`, mode: 'headless', status: 'failed',
                createdAt: Date.now(), startedAt: Date.now(), endedAt: Date.now(),
                workflowId: w.id, workflowRunId: runId, stepIndex: index
            };
            this.tasks.push(task);
            this.save();
            this.advanceWorkflow(task, 'failed');
        };

        if (!hostAllowed(url, allowHosts)) {
            fail(allowHosts.length
                ? `"${url}" is outside the allowlist (${allowHosts.join(', ')})`
                : 'no host allowlist configured (set agentFarm.browserAllowHosts or the step\'s allowHosts)');
            return;
        }
        if (this.opts.confirmBrowser) {
            const ok = await this.opts.confirmBrowser({ title: step.title, url, goal });
            if (!ok) { fail('not approved'); return; }
        }
        const agent = this.getAgents().find(a => a.id === step.agentId);
        if (!agent) {
            fail(`agent "${step.agentName}" not found`);
            return;
        }
        const prompt = buildBrowserPrompt(url, goal, allowHosts);
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt, 'headless',
            { workflowId: w.id, workflowRunId: runId, stepIndex: index, ...this.runProject(runId) });
        this.startTask(task);
    }

    /**
     * Human-in-the-loop gate: a visible task row parks the run until the user
     * approves. On approve the UPSTREAM handoff passes through (not the approval
     * note); on reject the step's onFail policy applies.
     */
    private async runApprovalStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const message = this.substitute(step.approval!.message ?? '', handoff);
        const task: FarmTask = {
            id: newId(), agentId: '', agentName: 'approval',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt: message || '(waiting for approval)', mode: 'headless', status: 'running',
            createdAt: Date.now(), startedAt: Date.now(),
            workflowId: w.id, workflowRunId: runId, stepIndex: index
        };
        this.tasks.push(task);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        // No gate wired (headless service / tests) = auto-approve so chains don't hang.
        const ok = this.opts.confirmApproval
            ? await this.opts.confirmApproval({ title: step.title, message })
            : true;
        try {
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Approval step\n` + (message ? `- Message: ${message}\n` : '') +
                `\n---\n\n${ok ? 'APPROVED' : 'REJECTED'} at ${new Date().toLocaleString()}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${ok ? 'OK' : 'REJECTED'}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.status = ok ? 'done' : 'failed';
        task.endedAt = Date.now();
        this.save();
        this.pump();
        // Inside a parallel group the collector handles fan-in; otherwise pass through on approve.
        const group = this.parallelGroups.get(runId);
        if (group && index >= group.start && index <= group.end) {
            this.advanceWorkflow(task, ok ? 'done' : 'failed');
        } else if (ok) {
            this.routeToStep(w, index + 1, handoff, runId);
        } else {
            this.advanceWorkflow(task, 'failed');
        }
    }

    /**
     * Wave B — visual selection gate: the user keeps a subset of the assets
     * produced so far in this run. Chosen asset URLs become the handoff so the
     * next step (e.g. an image→video model) works only with the picks. No gate
     * wired (tests/headless) = keep everything so chains don't hang.
     */
    private async runSelectStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const sel = step.select!;
        const message = this.substitute(sel.message ?? '', handoff);

        // Candidates: assets produced by this run's media tasks up to this step.
        const runTaskIds = new Set(this.tasks
            .filter(t => t.workflowRunId === runId && (t.stepIndex ?? -1) < index)
            .map(t => t.id));
        const metas = readMediaMetas(this.outputsDir).filter(m => runTaskIds.has(m.taskId));
        const candidates = mediaCandidates(metas);

        const task: FarmTask = {
            id: newId(), agentId: '', agentName: 'select',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt: message || `(choose ${candidates.length} candidate asset(s))`,
            mode: 'headless', status: 'running',
            createdAt: Date.now(), startedAt: Date.now(),
            workflowId: w.id, workflowRunId: runId, stepIndex: index
        };
        this.tasks.push(task);
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        this.save();

        const min = Math.max(0, sel.min ?? 1);
        const max = sel.max;
        let chosen: string[] | null;
        if (!candidates.length) {
            chosen = []; // nothing to pick — pass an empty selection through
        } else if (this.opts.confirmSelection) {
            chosen = await this.opts.confirmSelection({
                title: step.title, message, min, max,
                candidates: candidates.map(c => ({ taskId: c.taskId, title: c.title, url: c.url, file: c.file, kind: c.kind }))
            });
        } else {
            chosen = candidates.map(c => c.url); // no UI wired → keep all
        }

        const cancelled = chosen === null;
        const selected = chosen ?? [];
        if (!cancelled) { recordSelection(this.outputsDir, metas, selected); }

        // The selection becomes the handoff: {prev_json.selected.N} = a URL,
        // {prev_text} = newline-joined URLs (one asset per line).
        const selHandoff: Handoff = {
            file: outFile,
            text: selected.join('\n'),
            json: { selected, count: selected.length }
        };
        try {
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Selection step\n` + (message ? `- Message: ${message}\n` : '') +
                `- Candidates: ${candidates.length} · Kept: ${selected.length}${cancelled ? ' (CANCELLED)' : ''}\n` +
                `\n---\n\n${JSON.stringify({ selected, count: selected.length }, null, 2)}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${cancelled ? 'CANCELLED' : 'OK'}\n`, 'utf8');
        } catch { /* archive gone */ }
        task.status = cancelled ? 'failed' : 'done';
        task.endedAt = Date.now();
        this.save();
        this.pump();

        const group = this.parallelGroups.get(runId);
        if (group && index >= group.start && index <= group.end) {
            this.advanceWorkflow(task, cancelled ? 'failed' : 'done');
        } else if (!cancelled) {
            this.routeToStep(w, index + 1, selHandoff, runId);
        } else {
            this.advanceWorkflow(task, 'failed');
        }
    }

    /** Gallery Re-run/Vary: run a single media job outside any stored workflow. */
    runMediaAdhoc(title: string, model: string, input: string, link?: { projectId?: string; sceneId?: string }): void {
        const w: FarmWorkflow = {
            id: 'adhoc-' + newId(),
            title: 'Media',
            steps: [{
                agentId: '', agentName: 'media', title, prompt: '', mode: 'headless',
                media: { model, input, projectId: link?.projectId, sceneId: link?.sceneId }
            }]
        };
        void this.runMediaStep(w, 0, {}, newId());
    }

    private advanceWorkflow(task: FarmTask, status: TaskStatus): void {
        const w = this.workflows.find(x => x.id === task.workflowId);
        if (!w) { return; }
        const runId = task.workflowRunId ?? task.workflowId ?? '';
        // Single chokepoint for parallel fan-in: a branch of the active group
        // collects here instead of advancing the run on its own.
        const group = this.parallelGroups.get(runId);
        if (group && task.stepIndex !== undefined
            && task.stepIndex >= group.start && task.stepIndex <= group.end) {
            this.onParallelBranchDone(w, task, status);
            return;
        }
        const stepIndex = task.stepIndex ?? 0;
        if (status === 'done') {
            this.routeToStep(w, stepIndex + 1, this.computeHandoff(task), runId);
            return;
        }
        const onFail = w.steps[stepIndex]?.onFail ?? 'stop';
        if (onFail === 'stop') {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.opts.forward?.('workflow-failed', `Workflow "${w.title}" stopped at step ${stepIndex + 1} (${status})`);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped at step ${stepIndex + 1} (${status}).`);
            return;
        }
        const nextIndex = onFail === 'continue' ? stepIndex + 1 : (onFail as number) - 1;
        void vscode.window.showWarningMessage(
            `Agent Farm: workflow "${w.title}" step ${stepIndex + 1} failed — ` +
            (onFail === 'continue' ? 'continuing to next step.' : `jumping to step ${onFail}.`));
        this.routeToStep(w, nextIndex, this.computeHandoff(task), runId);
    }

    // ---------- parallel groups (fan-out / fan-in) ----------

    /** Launch every step of the parallel group [start..end] concurrently with the same handoff. */
    private startParallelGroup(w: FarmWorkflow, start: number, handoff: Handoff, runId: string): void {
        let end = start;
        while (end + 1 < w.steps.length && w.steps[end + 1].parallel) { end++; }
        const group = {
            start, end,
            pending: new Set<number>(),
            results: new Map<number, Handoff>(),
            statuses: new Map<number, TaskStatus>()
        };
        this.parallelGroups.set(runId, group);
        this.handoffs.set(runId, handoff);
        for (let i = start; i <= end; i++) {
            const step = w.steps[i];
            if (step.runIf && !this.runIfMatches(step.runIf, handoff)) {
                group.statuses.set(i, 'done'); // a skipped branch is benign, not a failure
                continue;
            }
            group.pending.add(i);
            this.startWorkflowStep(w, i, handoff, runId);
        }
        if (group.pending.size === 0) { this.finishParallelGroup(w, runId); }
    }

    private onParallelBranchDone(w: FarmWorkflow, task: FarmTask, status: TaskStatus): void {
        const runId = task.workflowRunId ?? '';
        const group = this.parallelGroups.get(runId);
        if (!group || task.stepIndex === undefined) { return; }
        group.pending.delete(task.stepIndex);
        group.statuses.set(task.stepIndex, status);
        if (status === 'done') { group.results.set(task.stepIndex, this.computeHandoff(task)); }
        if (group.pending.size === 0) { this.finishParallelGroup(w, runId); }
    }

    /** Fan-in: merge branch outputs and either advance past the group or apply the group's onFail. */
    private finishParallelGroup(w: FarmWorkflow, runId: string): void {
        const group = this.parallelGroups.get(runId);
        if (!group) { return; }
        this.parallelGroups.delete(runId);
        const merged = this.mergeHandoffs(w, group);
        const anyFailed = [...group.statuses.values()].some(s => s === 'failed');
        if (!anyFailed) {
            this.routeToStep(w, group.end + 1, merged, runId);
            return;
        }
        // Group-level failure policy = the onFail of the group's first step.
        const onFail = w.steps[group.start].onFail ?? 'stop';
        if (onFail === 'stop') {
            this.runCounts.delete(runId);
            this.handoffs.delete(runId);
            this.opts.forward?.('workflow-failed',
                `Workflow "${w.title}" stopped — a parallel branch (steps ${group.start + 1}-${group.end + 1}) failed`);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — a parallel branch failed (steps ${group.start + 1}-${group.end + 1}).`);
            return;
        }
        const nextIndex = onFail === 'continue' ? group.end + 1 : (onFail as number) - 1;
        void vscode.window.showWarningMessage(
            `Agent Farm: workflow "${w.title}" — a parallel branch failed; ` +
            (onFail === 'continue' ? 'continuing past the group.' : `jumping to step ${onFail}.`));
        this.routeToStep(w, nextIndex, merged, runId);
    }

    /** Combine a group's branch outputs into one handoff: labeled text + a {branches:[…]} envelope. */
    private mergeHandoffs(w: FarmWorkflow, group: { start: number; end: number; results: Map<number, Handoff> }): Handoff {
        const texts: string[] = [];
        const branches: { step: string; text: string; json?: unknown; skipped?: boolean }[] = [];
        for (let i = group.start; i <= group.end; i++) {
            const title = w.steps[i].title;
            const h = group.results.get(i);
            if (h && (h.text ?? '').trim()) {
                texts.push(`## ${title}\n${h.text}`);
                branches.push({ step: title, text: h.text ?? '', json: h.json });
            } else {
                branches.push({ step: title, text: '', skipped: !group.results.has(i) });
            }
        }
        return { text: texts.join('\n\n'), json: { branches } };
    }

    // ---------- triggers (A1 storage/CRUD; watching lives in TriggerManager) ----------

    addTrigger(t: Omit<FarmTrigger, 'id'>): FarmTrigger {
        const trigger: FarmTrigger = { ...t, id: newId() };
        this.triggers.push(trigger);
        this.save();
        return trigger;
    }

    toggleTrigger(t: FarmTrigger): void {
        t.enabled = !t.enabled;
        this.save();
    }

    /** Persist in-place edits (timing is read at fire time, so no re-arm is needed). */
    updateTrigger(_t: FarmTrigger): void {
        this.save();
    }

    deleteTrigger(t: FarmTrigger): void {
        this.triggers = this.triggers.filter(x => x.id !== t.id);
        this.save();
    }

    markTriggerFired(t: FarmTrigger): void {
        const now = Date.now();
        t.lastFiredAt = now;
        t.fireCount = (t.fireCount ?? 0) + 1;
        t.recentFirings = [...(t.recentFirings ?? []).filter(ts => now - ts < 3600_000), now];
        this.save();
        this.logAutomation({
            kind: 'trigger', id: t.id, title: t.title, outcome: 'fired',
            reason: this.checkPrecondition(t.fireIf).detail
        });
    }

    /** A firing the gate or the precondition suppressed. Counted separately
     *  from failures: nothing went wrong, the wake-up simply was not worth
     *  paying for — and the count is what proves the brake earns its keep. */
    markTriggerSkipped(t: FarmTrigger, reason: string): void {
        t.skipCount = (t.skipCount ?? 0) + 1;
        t.lastSkippedAt = Date.now();
        t.lastSkipReason = reason;
        this.save();
        this.logAutomation({
            kind: 'trigger', id: t.id, title: t.title, outcome: 'skipped', reason
        });
    }

    // ---------- schedules ----------

    /** Edit-in-place (parity with editTrigger — schedules used to be delete+recreate). */
    updateSchedule(id: string, patch: Partial<Omit<FarmSchedule, 'id'>>): void {
        const s = this.schedules.find(x => x.id === id);
        if (!s) { return; }
        Object.assign(s, patch);
        this.save();
    }

    addSchedule(s: Omit<FarmSchedule, 'id'>): FarmSchedule {
        const schedule: FarmSchedule = { ...s, id: newId() };
        // catch-up policies settle the past at creation: without this stamp a
        // brand-new schedule would immediately "catch up" an occurrence from
        // before it even existed
        if (schedule.kind !== 'once' && (schedule.missed === 'run' || schedule.missed === 'ask')
            && schedule.lastRunKey === undefined) {
            schedule.lastRunKey = previousOccurrenceKey(schedule, new Date());
        }
        this.schedules.push(schedule);
        this.save();
        return schedule;
    }

    toggleSchedule(s: FarmSchedule): void {
        s.enabled = !s.enabled;
        this.save();
    }

    deleteSchedule(s: FarmSchedule): void {
        this.schedules = this.schedules.filter(x => x.id !== s.id);
        this.save();
    }

    /** Manual "Run Now": the master switch still applies (paused means paused),
     *  but quiet hours and the precondition do not — the user pressing a button
     *  is a deliberate act, not an unattended wake-up. */
    runScheduleNow(s: FarmSchedule): void {
        const gate = this.automationGate(new Date(), true);
        if (gate) {
            void vscode.window.showWarningMessage(`Agent Farm: cannot run "${s.title}" — ${gate.reason}.`);
            return;
        }
        const agent = this.getAgents().find(a => a.id === s.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for schedule "${s.title}" not found.`);
            return;
        }
        // No project — see fireSchedule. Run Now must produce the same run the
        // timer would, or the button is not a test of anything.
        const task = this.addTask(agent, s.title, s.prompt, s.mode,
            { fromSchedule: s.id, projectId: undefined });
        if (s.model) { task.model = s.model; }
        this.logAutomation({
            kind: 'schedule', id: s.id, title: s.title, outcome: 'fired', reason: 'run now (manual)'
        });
        this.startTask(task);
    }

    /** 'ask' policy: (schedule.id + missedKey) pairs already offered in THIS
     *  window — in-memory on purpose, so a dismissed toast comes back in the
     *  next window instead of the occurrence silently dying. */
    private askedMissed = new Set<string>();

    /** (schedule.id + runKey) pairs whose gate-block was already logged this
     *  window — keeps a 30s tick from writing the same skip line forever. */
    private gateNoted = new Set<string>();

    private tickSchedules(): void {
        if (!this.runner()) { return; } // B11: only the runner window fires schedules
        const now = new Date();
        for (const s of this.schedules) {
            const { due, runKey, missedKey, missedAt } = scheduleDue(s, now);
            if (!due) {
                if (missedKey && s.missed === 'ask' && !this.askedMissed.has(s.id + missedKey)) {
                    this.askedMissed.add(s.id + missedKey);
                    void vscode.window.showWarningMessage(
                        `Agent Farm: schedule "${s.title}" (${s.agentName}) missed its time` +
                        (missedAt ? ` (${new Date(missedAt).toLocaleString()})` : '') +
                        ' — no VS Code window was open. Run it now?',
                        'Run now', 'Skip this one'
                    ).then(pick => {
                        // dismissed (undefined): decide nothing — the next window asks again
                        if (!pick || !this.schedules.includes(s)) { return; }
                        s.lastRunKey = missedKey;
                        this.save();
                        if (pick === 'Run now') { this.runScheduleNow(s); }
                    });
                }
                continue;
            }
            // --- the gate: may we work at all right now? ---
            const gate = this.automationGate(now);
            if (gate) {
                if (gate.kind === 'quiet') {
                    // Quiet hours DEFER rather than drop: the occurrence is
                    // remembered and fires when the window ends, so a nightly
                    // batch is not silently lost by "no wake-ups after 23:00".
                    if (s.pendingRunKey !== runKey) {
                        s.pendingRunKey = runKey;
                        s.lastRunKey = runKey;
                        this.save();
                        this.logAutomation({
                            kind: 'schedule', id: s.id, title: s.title,
                            outcome: 'skipped', reason: `${gate.reason} — deferred to the end of the window`
                        });
                    }
                } else if (!this.gateNoted.has(s.id + runKey)) {
                    this.gateNoted.add(s.id + runKey);
                    this.logAutomation({
                        kind: 'schedule', id: s.id, title: s.title,
                        outcome: 'skipped', reason: gate.reason
                    });
                }
                continue;
            }
            this.fireSchedule(s, runKey, !!missedKey);
        }
        this.releaseQuietDeferred(now);
    }

    /** Occurrences held back by quiet hours, released once the window ends. */
    private releaseQuietDeferred(now: Date): void {
        if (this.automationGate(now)) { return; }
        for (const s of this.schedules) {
            if (!s.pendingRunKey || !s.enabled) { continue; }
            const key = s.pendingRunKey;
            s.pendingRunKey = undefined;
            this.fireSchedule(s, key, false, 'held over from quiet hours');
        }
    }

    /** Precondition check, then launch. Shared by the on-time path, the
     *  quiet-hours release and Run Now (which passes `manual`). */
    private fireSchedule(s: FarmSchedule, runKey: string, caughtUp: boolean, note?: string): void {
        const pre = this.checkPrecondition(s.fireIf);
        if (!pre.ok) {
            // Nothing to do — settle this occurrence so it does not retry all
            // day, and record WHY. No agent was woken; this skip is free.
            s.lastRunKey = runKey;
            s.pendingRunKey = undefined;
            this.save();
            this.logAutomation({
                kind: 'schedule', id: s.id, title: s.title,
                outcome: 'skipped', reason: pre.detail
            });
            return;
        }
        s.lastRunKey = runKey;
        s.pendingRunKey = undefined;
        if (s.kind === 'once') { s.enabled = false; }
        const agent = this.getAgents().find(a => a.id === s.agentId);
        if (!agent) { return; }
        // ‼️ A SCHEDULE HAS NO PROJECT, so its task gets none.
        // A schedule fires from a timer — nobody was in a project when it went
        // off. Stamping it with whatever the window happened to be showing at
        // 03:00 would tell an unattended watch agent "work on this project, and
        // record what you did in its worklog", about work it knows nothing
        // about. Binding a schedule to a project is a thing to DECLARE on the
        // schedule, not to infer from a window.
        const task = this.addTask(agent, s.title, s.prompt, s.mode,
            { fromSchedule: s.id, projectId: undefined });
        if (s.model) { task.model = s.model; }
        this.logAutomation({
            kind: 'schedule', id: s.id, title: s.title,
            outcome: 'fired', reason: note ? `${pre.detail} (${note})` : pre.detail
        });
        void vscode.window.showInformationMessage(
            `Agent Farm: scheduled task started — "${s.title}" (${s.agentName})` +
            (caughtUp ? ' — caught up; the scheduled time passed while VS Code was closed.' : '') +
            (note ? ` — ${note}.` : ''));
        this.startTask(task);
    }

    dispose(): void {
        clearInterval(this.timer);
        this.stopFollowerWatch();
        for (const [taskId, child] of this.processes) {
            this.killProcess(taskId, child);
        }
        for (const d of this.disposables) { d.dispose(); }
        this.onDidChangeEmitter.dispose();
    }
}
