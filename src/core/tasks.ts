import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';

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
    outputFile?: string;
    workflowId?: string;
    workflowRunId?: string;
    stepIndex?: number;
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
    /** Regex tested against the previous step's output content; on no match the step is skipped. */
    runIf?: string;
}

export interface FarmWorkflow {
    id: string;
    title: string;
    steps: WorkflowStep[];
}

export function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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

export function sanitizePrompt(p: string): string {
    return p.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}

/** Placeholder in workflow step prompts replaced with the previous step's output file path. */
export const PREV_OUTPUT_PLACEHOLDER = '{prev_output}';

const MAX_TASKS = 300;

interface StoreShape {
    tasks: FarmTask[];
    schedules: FarmSchedule[];
    templates: FarmTemplate[];
    workflows: FarmWorkflow[];
}

export class TaskManager implements vscode.Disposable {
    tasks: FarmTask[] = [];
    schedules: FarmSchedule[] = [];
    templates: FarmTemplate[] = [];
    workflows: FarmWorkflow[] = [];
    private terminals = new Map<string, vscode.Terminal>();      // taskId -> terminal
    private processes = new Map<string, cp.ChildProcess>();      // taskId -> headless process
    private timer: NodeJS.Timeout;
    private disposables: vscode.Disposable[] = [];
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(
        private storageFile: string,
        private getAgents: () => AgentInfo[],
        private autoAdvance: () => boolean,
        /** Extra CLI args appended to every task's claude command, e.g. "--model haiku". */
        private extraArgs: () => string = () => ''
    ) {
        this.load();
        this.timer = setInterval(() => this.tickSchedules(), 30_000);

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
            // Anything marked running from a previous window is stale.
            for (const t of this.tasks) {
                if (t.status === 'running') { t.status = 'queued'; t.startedAt = undefined; }
            }
        } catch { /* first run */ }
    }

    private save(): void {
        try {
            fs.mkdirSync(path.dirname(this.storageFile), { recursive: true });
            if (this.tasks.length > MAX_TASKS) {
                const finished = this.tasks.filter(t =>
                    t.status === 'done' || t.status === 'cancelled' || t.status === 'failed');
                const overflow = this.tasks.length - MAX_TASKS;
                const drop = new Set(finished.slice(0, overflow).map(t => t.id));
                this.tasks = this.tasks.filter(t => !drop.has(t.id));
            }
            fs.writeFileSync(this.storageFile, JSON.stringify({
                tasks: this.tasks,
                schedules: this.schedules,
                templates: this.templates,
                workflows: this.workflows
            }, null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
        this.onDidChangeEmitter.fire();
    }

    // ---------- tasks ----------

    addTask(
        agent: AgentInfo, title: string, prompt: string, mode: TaskMode,
        extra?: Partial<Pick<FarmTask, 'fromSchedule' | 'workflowId' | 'workflowRunId' | 'stepIndex'>>
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

    startTask(task: FarmTask): boolean {
        const agent = this.getAgents().find(a => a.id === task.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(`Agent Farm: agent for task "${task.title}" not found.`);
            return false;
        }
        task.status = 'running';
        task.startedAt = Date.now();
        if (task.mode === 'headless') {
            this.spawnHeadless(task, agent);
        } else {
            const p = sanitizePrompt(task.prompt);
            const extra = this.extraArgs().trim();
            const terminal = vscode.window.createTerminal({
                name: `AF: ${task.title.slice(0, 30)}`,
                cwd: agent.dir
            });
            terminal.show();
            terminal.sendText(`claude ${extra ? extra + ' ' : ''}"${p}"`, true);
            this.terminals.set(task.id, terminal);
        }
        this.save();
        return true;
    }

    /** Headless tasks run as child processes so stdout/stderr land in an archived output file. */
    private spawnHeadless(task: FarmTask, agent: AgentInfo): void {
        fs.mkdirSync(this.outputsDir, { recursive: true });
        const outFile = path.join(this.outputsDir, `${task.id}.md`);
        task.outputFile = outFile;
        const header = `# ${task.title}\n\n` +
            `- Agent: ${task.agentName}\n` +
            `- Started: ${new Date().toLocaleString()}\n` +
            `- Prompt: ${task.prompt}\n\n---\n\n`;
        fs.writeFileSync(outFile, header, 'utf8');
        const stream = fs.createWriteStream(outFile, { flags: 'a' });

        const p = sanitizePrompt(task.prompt);
        const extra = this.extraArgs().trim();
        const child = cp.spawn(`claude ${extra ? extra + ' ' : ''}-p "${p}"`, {
            cwd: agent.dir,
            shell: true,
            windowsHide: true
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

        // Workflow chaining takes precedence over plain queue auto-advance.
        if (task.workflowId !== undefined && task.stepIndex !== undefined) {
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
        this.routeToStep(w, 0, undefined, runId);
    }

    /** Advance a run to a step, honoring runIf conditions and the loop guard. */
    private routeToStep(w: FarmWorkflow, index: number, prevOutput: string | undefined, runId: string): void {
        if (index < 0 || index >= w.steps.length) {
            this.runCounts.delete(runId);
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
        if (step.runIf) {
            let matched = false;
            if (prevOutput) {
                try {
                    const content = fs.readFileSync(prevOutput, 'utf8');
                    matched = new RegExp(step.runIf, 'i').test(content);
                } catch { matched = false; }
            }
            if (!matched) {
                void vscode.window.showInformationMessage(
                    `Agent Farm: workflow "${w.title}" — step ${index + 1} skipped (condition /${step.runIf}/ not met).`);
                this.routeToStep(w, index + 1, prevOutput, runId);
                return;
            }
        }
        this.startWorkflowStep(w, index, prevOutput, runId);
    }

    private startWorkflowStep(w: FarmWorkflow, index: number, prevOutput: string | undefined, runId: string): void {
        const step = w.steps[index];
        const agent = this.getAgents().find(a => a.id === step.agentId);
        if (!agent) {
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped — agent "${step.agentName}" not found.`);
            return;
        }
        const prompt = step.prompt.split(PREV_OUTPUT_PLACEHOLDER).join(prevOutput ?? '');
        const task = this.addTask(agent, `${w.title} ${index + 1}/${w.steps.length}: ${step.title}`,
            prompt, step.mode, { workflowId: w.id, workflowRunId: runId, stepIndex: index });
        this.startTask(task);
    }

    private advanceWorkflow(task: FarmTask, status: TaskStatus): void {
        const w = this.workflows.find(x => x.id === task.workflowId);
        if (!w) { return; }
        const runId = task.workflowRunId ?? task.workflowId ?? '';
        const stepIndex = task.stepIndex ?? 0;
        if (status === 'done') {
            this.routeToStep(w, stepIndex + 1, task.outputFile, runId);
            return;
        }
        const onFail = w.steps[stepIndex]?.onFail ?? 'stop';
        if (onFail === 'stop') {
            this.runCounts.delete(runId);
            void vscode.window.showWarningMessage(
                `Agent Farm: workflow "${w.title}" stopped at step ${stepIndex + 1} (${status}).`);
            return;
        }
        const nextIndex = onFail === 'continue' ? stepIndex + 1 : (onFail as number) - 1;
        void vscode.window.showWarningMessage(
            `Agent Farm: workflow "${w.title}" step ${stepIndex + 1} failed — ` +
            (onFail === 'continue' ? 'continuing to next step.' : `jumping to step ${onFail}.`));
        this.routeToStep(w, nextIndex, task.outputFile, runId);
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
