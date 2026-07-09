import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import { buildBrowserPrompt, hostAllowed } from './browser';
import {
    DEFAULT_MEDIA_PRICING, downloadAsset, estimateMediaCost, extFromUrl,
    MediaMeta, MediaPriceRule, runFalJob
} from './media';
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
    /** J5: named CLI profile (agentFarm.cliProfiles); empty = claude. */
    cli?: string;
}

export type ScheduleKind = 'daily' | 'weekly' | 'once';

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
     * Webhook step: instead of claude, the step is an HTTP call. url/body
     * templates support {prev_output} {prev_text} {prev_json.x} {secret:NAME}.
     * The response body becomes the handoff for the next step.
     */
    webhook?: { url: string; method?: string; body?: string };
    /**
     * Media step (fal.ai queue): model id + JSON input template ({prev_*} and
     * {secret:} are substituted). Assets are downloaded into the outputs
     * archive; the response JSON becomes the next step's handoff.
     */
    media?: { model: string; input: string; timeoutMin?: number };
    /**
     * F3 — browser automation step: the step's agent drives its browser MCP.
     * Host allowlist is enforced before launch; empty allowlist = refuse.
     */
    browser?: { url: string; goal: string; allowHosts?: string[] };
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
        | { kind: 'task'; agentId: string; agentName: string; title: string; prompt: string; mode: TaskMode }
        | { kind: 'workflow'; workflowId: string }
        /** F2: no fixed agent — the dispatcher routes each firing to the best agent. */
        | { kind: 'dispatch'; title: string; prompt: string; mode: TaskMode };
    debounceSec: number;
    cooldownSec: number;
    maxPerHour: number;
    enabled: boolean;
    lastFiredAt?: number;
    fireCount?: number;
    recentFirings?: number[];
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

/** Pure due-check so the scheduler is testable. */
export function scheduleDue(s: FarmSchedule, now: Date): { due: boolean; runKey: string } {
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
    if (minutes < target) { return { due: false, runKey: dayKey }; }
    if (s.kind === 'weekly' && now.getDay() !== s.dow) { return { due: false, runKey: dayKey }; }
    return { due: s.lastRunKey !== dayKey, runKey: dayKey };
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
}

export interface TaskManagerOptions {
    /** CLI args for internal judge calls — always a cheap model. */
    judgeArgs?: () => string;
    maxConcurrent?: () => number;
    maxConcurrentPerAgent?: () => number;
    /** Return a reason string to defer auto work (e.g. quota window nearly full), or undefined. */
    quotaCheck?: () => string | undefined;
    outputsMaxMB?: () => number;
    /** Secrets injected as environment variables into spawned tasks. */
    getEnv?: () => Record<string, string>;
    /** {secret:NAME} substitution for webhook templates. */
    resolveTemplate?: (s: string) => string;
    /** Outbound notification forwarding (B4). */
    forward?: (type: string, message: string) => void;
    /** C1: media provider settings. */
    mediaAuth?: () => string;              // e.g. "Key <FAL_KEY>" (resolved from the vault)
    mediaBaseUrl?: () => string;           // override for tests / self-hosted proxies
    mediaPricing?: () => MediaPriceRule[]; // C3 cost estimation rules
    /** I5: model policy — extra --model args (and reason) for a task launch. */
    modelArgsFor?: (task: FarmTask) => { args: string; reason: string } | undefined;
    /** J5: alternative CLI profiles ({prompt}/{args} templates). */
    cliProfiles?: () => CliProfile[];
    /** F3: global browser-step allowlist + per-step approval gate. */
    browserAllowHosts?: () => string[];
    /** Resolve to true to run the browser step; false cancels it. */
    confirmBrowser?: (info: { title: string; url: string; goal: string }) => Promise<boolean>;
}

export class TaskManager implements vscode.Disposable {
    tasks: FarmTask[] = [];
    schedules: FarmSchedule[] = [];
    templates: FarmTemplate[] = [];
    workflows: FarmWorkflow[] = [];
    triggers: FarmTrigger[] = [];
    private terminals = new Map<string, vscode.Terminal>();      // taskId -> terminal
    private processes = new Map<string, cp.ChildProcess>();      // taskId -> headless process
    private handoffs = new Map<string, Handoff>();               // workflowRunId -> last handoff
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

    private load(): void {
        try {
            const raw = fs.readFileSync(this.storageFile, 'utf8');
            const json = JSON.parse(raw) as Partial<StoreShape>;
            this.tasks = Array.isArray(json.tasks) ? json.tasks : [];
            this.schedules = Array.isArray(json.schedules) ? json.schedules : [];
            this.templates = Array.isArray(json.templates) ? json.templates : [];
            this.workflows = Array.isArray(json.workflows) ? json.workflows : [];
            this.triggers = Array.isArray(json.triggers) ? json.triggers : [];
            // Anything marked running from a previous window is stale.
            for (const t of this.tasks) {
                if (t.status === 'running') { t.status = 'queued'; t.startedAt = undefined; }
            }
        } catch { /* first run */ }
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
                    list.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf8');
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

    private save(): void {
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
            fs.writeFileSync(this.storageFile, JSON.stringify({
                tasks: this.tasks,
                schedules: this.schedules,
                templates: this.templates,
                workflows: this.workflows,
                triggers: this.triggers
            }, null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
        this.pruneOutputs();
        this.onDidChangeEmitter.fire();
    }

    // ---------- tasks ----------

    addTask(
        agent: AgentInfo, title: string, prompt: string, mode: TaskMode,
        extra?: Partial<Pick<FarmTask, 'fromSchedule' | 'fromTrigger' | 'workflowId' | 'workflowRunId' | 'stepIndex'>>
    ): FarmTask {
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

    /** Launch deferred tasks as capacity frees up (called on every finish + every 30s). */
    private pump(): void {
        for (const task of this.tasks) {
            if (task.status !== 'queued' || !task.autoStart) { continue; }
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
                const policy = this.opts.modelArgsFor?.(task);
                if (policy) { extra = (extra ? extra + ' ' : '') + policy.args; }
                command = `claude ${extra ? extra + ' ' : ''}"${p}"`;
            }
            const terminal = vscode.window.createTerminal({
                name: `AF: ${task.title.slice(0, 30)}`,
                cwd: task.workDir ?? agent.dir,
                env: this.opts.getEnv?.()
            });
            terminal.show();
            terminal.sendText(command, true);
            this.terminals.set(task.id, terminal);
        }
        this.save();
        return true;
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
        const policy = profile ? undefined : this.opts.modelArgsFor?.(task);
        const header = `# ${task.title}\n\n` +
            `- Agent: ${task.agentName}\n` +
            `- Started: ${new Date().toLocaleString()}\n` +
            (profile ? `- CLI: ${profile.name}\n` : '') +
            (policy ? `- Model policy: ${policy.reason}\n` : '') +
            (task.workDir ? `- Workdir: ${task.workDir}\n` : '') +
            `- Prompt: ${task.prompt}\n\n---\n\n`;
        fs.writeFileSync(outFile, header, 'utf8');
        const stream = fs.createWriteStream(outFile, { flags: 'a' });

        const p = sanitizePrompt(task.prompt);
        let extra = this.extraArgs().trim();
        if (policy) { extra = (extra ? extra + ' ' : '') + policy.args; }
        if (task.outputContract === 'json') {
            extra = (extra ? extra + ' ' : '') + '--output-format json';
        }
        const command = profile
            ? buildCliCommand(profile.headless, task.prompt, this.extraArgs())
            : `claude ${extra ? extra + ' ' : ''}-p "${p}"`;
        const child = cp.spawn(command, {
            cwd: task.workDir ?? agent.dir,
            shell: true,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'], // closed stdin: claude won't wait 3s for piped input
            env: { ...process.env, ...this.opts.getEnv?.() }
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

        // Workflow chaining takes precedence over plain queue auto-advance.
        if (task.workflowId !== undefined && task.stepIndex !== undefined) {
            const w = this.workflows.find(x => x.id === task.workflowId);
            const step = w?.steps[task.stepIndex];
            if (w && step?.verify && status === 'done' && task.outputFile) {
                void this.verifyThenAdvance(task, w, step);
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
                    stepIndex: task.stepIndex
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
        return this.tasks.find(t => t.agentId === agentId && t.status === 'queued');
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
            this.opts.forward?.('workflow-done', `Workflow "${w.title}" completed`);
            void vscode.window.showInformationMessage(
                `Agent Farm: workflow "${w.title}" completed ✓.`);
            return;
        }
        const count = this.runCounts.get(runId) ?? 0;
        if (count >= TaskManager.MAX_RUN_STEPS) {
            this.runCounts.delete(runId);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — step limit reached (possible loop in onFail routing).`);
            return;
        }
        this.runCounts.set(runId, count + 1);

        const step = w.steps[index];
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
        const agent = this.getAgents().find(a => a.id === step.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — agent "${step.agentName}" not found.`);
            return;
        }
        const prompt = this.substitute(step.prompt, handoff);
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt, step.mode, { workflowId: w.id, workflowRunId: runId, stepIndex: index });
        if (step.outputContract) { task.outputContract = step.outputContract; }
        this.startTask(task);
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

        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);
        fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: method === 'GET' ? undefined : body,
            signal: controller.signal
        }).then(async res => {
            clearTimeout(timer);
            const text = (await res.text()).slice(0, 100_000);
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
    private async runMediaStep(w: FarmWorkflow, index: number, handoff: Handoff, runId: string): Promise<void> {
        const step = w.steps[index];
        const media = step.media!;
        const resolve = (s: string) => (this.opts.resolveTemplate ?? ((x: string) => x))(this.substitute(s, handoff));

        const task: FarmTask = {
            id: newId(),
            agentId: '',
            agentName: 'media',
            title: `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt: `${media.model}`,
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

        const auth = (this.opts.mediaAuth?.() ?? '').trim();
        const finishWith = (ok: boolean, detail: string, response?: unknown, assets: string[] = [], estCost = 0) => {
            fs.writeFileSync(outFile,
                `# ${task.title}\n\n- Media model: ${media.model}\n- Started: ${new Date(task.startedAt!).toLocaleString()}\n` +
                (assets.length ? `- Assets: ${assets.map(a => path.basename(a)).join(', ')}\n` : '') +
                (estCost ? `- Est. cost: $${estCost.toFixed(3)}\n` : '') +
                `\n---\n\n${response ? JSON.stringify(response, null, 2).slice(0, 20_000) : detail}\n\n---\n` +
                `Finished: ${new Date().toLocaleString()} · ${ok ? 'OK' : 'FAILED'}\n`, 'utf8');
            this.finish(task, ok ? 'done' : 'failed');
        };

        if (!auth || auth.includes('{secret:')) {
            finishWith(false, 'Media auth missing — store your key with "Agent Farm: Set Secret…" as FAL_KEY.');
            return;
        }

        const input = resolve(media.input);
        const result = await runFalJob(media.model, input, auth, {
            baseUrl: this.opts.mediaBaseUrl?.(),
            timeoutMs: (media.timeoutMin ?? 10) * 60_000
        });
        if (!result.ok) {
            finishWith(false, `[media error] ${result.error ?? 'unknown'}`);
            return;
        }

        const assets: string[] = [];
        for (const [i, url] of result.assetUrls.slice(0, 4).entries()) {
            const file = path.join(this.outputsDir, `${task.id}-${i + 1}.${extFromUrl(url)}`);
            if (await downloadAsset(url, file)) { assets.push(file); }
        }
        const estCost = estimateMediaCost(media.model, result.response,
            this.opts.mediaPricing?.() ?? DEFAULT_MEDIA_PRICING);
        task.mediaCost = estCost;

        const meta: MediaMeta = {
            taskId: task.id,
            title: step.title,
            model: media.model,
            input: input.slice(0, 2000),
            assetFiles: assets,
            estCost,
            ts: Date.now(),
            workflowTitle: w.title
        };
        fs.writeFileSync(path.join(this.outputsDir, `${task.id}.media.json`),
            JSON.stringify(meta, null, 2), 'utf8');
        finishWith(true, '', result.response, assets, estCost);
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
            prompt, 'headless', { workflowId: w.id, workflowRunId: runId, stepIndex: index });
        this.startTask(task);
    }

    /** Gallery Re-run/Vary: run a single media job outside any stored workflow. */
    runMediaAdhoc(title: string, model: string, input: string): void {
        const w: FarmWorkflow = {
            id: 'adhoc-' + newId(),
            title: 'Media',
            steps: [{ agentId: '', agentName: 'media', title, prompt: '', mode: 'headless', media: { model, input } }]
        };
        void this.runMediaStep(w, 0, {}, newId());
    }

    private advanceWorkflow(task: FarmTask, status: TaskStatus): void {
        const w = this.workflows.find(x => x.id === task.workflowId);
        if (!w) { return; }
        const runId = task.workflowRunId ?? task.workflowId ?? '';
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
    }

    // ---------- schedules ----------

    addSchedule(s: Omit<FarmSchedule, 'id'>): FarmSchedule {
        const schedule: FarmSchedule = { ...s, id: newId() };
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

    runScheduleNow(s: FarmSchedule): void {
        const agent = this.getAgents().find(a => a.id === s.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for schedule "${s.title}" not found.`);
            return;
        }
        const task = this.addTask(agent, s.title, s.prompt, s.mode, { fromSchedule: s.id });
        this.startTask(task);
    }

    private tickSchedules(): void {
        const now = new Date();
        for (const s of this.schedules) {
            const { due, runKey } = scheduleDue(s, now);
            if (!due) { continue; }
            s.lastRunKey = runKey;
            if (s.kind === 'once') { s.enabled = false; }
            const agent = this.getAgents().find(a => a.id === s.agentId);
            if (!agent) { continue; }
            const task = this.addTask(agent, s.title, s.prompt, s.mode, { fromSchedule: s.id });
            void vscode.window.showInformationMessage(
                `Agent Farm: scheduled task started — "${s.title}" (${s.agentName})`);
            this.startTask(task);
        }
    }

    dispose(): void {
        clearInterval(this.timer);
        for (const [taskId, child] of this.processes) {
            this.killProcess(taskId, child);
        }
        for (const d of this.disposables) { d.dispose(); }
        this.onDidChangeEmitter.dispose();
    }
}
