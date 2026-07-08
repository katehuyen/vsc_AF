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

function sanitizePrompt(p: string): string {
    return p.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}

const MAX_TASKS = 300;

interface StoreShape {
    tasks: FarmTask[];
    schedules: FarmSchedule[];
}

export class TaskManager implements vscode.Disposable {
    tasks: FarmTask[] = [];
    schedules: FarmSchedule[] = [];
    private terminals = new Map<string, vscode.Terminal>(); // taskId -> terminal
    private timer: NodeJS.Timeout;
    private disposables: vscode.Disposable[] = [];
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(
        private storageFile: string,
        private getAgents: () => AgentInfo[],
        private autoAdvance: () => boolean
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

    // ---------- persistence ----------

    private load(): void {
        try {
            const raw = fs.readFileSync(this.storageFile, 'utf8');
            const json = JSON.parse(raw) as StoreShape;
            this.tasks = Array.isArray(json.tasks) ? json.tasks : [];
            this.schedules = Array.isArray(json.schedules) ? json.schedules : [];
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
            fs.writeFileSync(this.storageFile,
                JSON.stringify({ tasks: this.tasks, schedules: this.schedules }, null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
        this.onDidChangeEmitter.fire();
    }

    // ---------- tasks ----------

    addTask(agent: AgentInfo, title: string, prompt: string, mode: TaskMode, fromSchedule?: string): FarmTask {
        const task: FarmTask = {
            id: newId(),
            agentId: agent.id,
            agentName: agent.name,
            title,
            prompt,
            mode,
            status: 'queued',
            createdAt: Date.now(),
            fromSchedule
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
        const p = sanitizePrompt(task.prompt);
        const cmd = task.mode === 'headless' ? `claude -p "${p}"` : `claude "${p}"`;
        const terminal = vscode.window.createTerminal({
            name: `AF: ${task.title.slice(0, 30)}`,
            cwd: agent.dir
        });
        terminal.show();
        terminal.sendText(cmd, true);
        this.terminals.set(task.id, terminal);
        task.status = 'running';
        task.startedAt = Date.now();
        this.save();
        return true;
    }

    private finish(task: FarmTask, status: TaskStatus): void {
        task.status = status;
        task.endedAt = Date.now();
        this.save();
        if (status === 'done' && this.autoAdvance()) {
            const next = this.nextQueuedFor(task.agentId);
            if (next) {
                void vscode.window.showInformationMessage(
                    `Agent Farm: starting next queued task — "${next.title}"`);
                this.startTask(next);
            }
        }
    }

    completeTask(task: FarmTask): void { this.finish(task, 'done'); }

    cancelTask(task: FarmTask): void {
        const terminal = this.terminals.get(task.id);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(task.id);
        }
        task.status = 'cancelled';
        task.endedAt = Date.now();
        this.save();
    }

    deleteTask(task: FarmTask): void {
        this.tasks = this.tasks.filter(t => t.id !== task.id);
        this.save();
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
        const before = this.tasks.length;
        this.tasks = this.tasks.filter(t =>
            t.status === 'queued' || t.status === 'running');
        this.save();
        return before - this.tasks.length;
    }

    nextQueuedFor(agentId: string): FarmTask | undefined {
        return this.tasks.find(t => t.agentId === agentId && t.status === 'queued');
    }

    revealTerminal(task: FarmTask): void {
        this.terminals.get(task.id)?.show();
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
        const task = this.addTask(agent, s.title, s.prompt, s.mode, s.id);
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
            const task = this.addTask(agent, s.title, s.prompt, s.mode, s.id);
            void vscode.window.showInformationMessage(
                `Agent Farm: scheduled task started — "${s.title}" (${s.agentName})`);
            this.startTask(task);
        }
    }

    dispose(): void {
        clearInterval(this.timer);
        for (const d of this.disposables) { d.dispose(); }
        this.onDidChangeEmitter.dispose();
    }
}
