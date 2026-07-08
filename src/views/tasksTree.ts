import * as vscode from 'vscode';
import { FarmSchedule, FarmTask, TaskManager } from '../core/tasks';
import { relTime } from '../core/util';

export type TaskNode =
    | { kind: 'schedules-root' }
    | { kind: 'schedule'; schedule: FarmSchedule }
    | { kind: 'agent-group'; agentId: string; agentName: string }
    | { kind: 'task'; task: FarmTask };

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleWhen(s: FarmSchedule): string {
    const hm = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
    if (s.kind === 'daily') { return `daily ${hm}`; }
    if (s.kind === 'weekly') { return `${DOW[s.dow ?? 0]} ${hm}`; }
    return s.onceAt ? `once ${new Date(s.onceAt).toLocaleString()}` : 'once';
}

export class TasksTreeProvider implements vscode.TreeDataProvider<TaskNode> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | TaskNode | TaskNode[] | null | undefined>;

    constructor(private manager: TaskManager) {
        manager.onDidChange(() => this.refresh());
    }

    refresh(): void { this.emitter.fire(); }

    getTreeItem(node: TaskNode): vscode.TreeItem {
        if (node.kind === 'schedules-root') {
            const item = new vscode.TreeItem('Scheduled', vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('calendar');
            item.description = `${this.manager.schedules.filter(s => s.enabled).length} active`;
            item.contextValue = 'schedules-root';
            return item;
        }
        if (node.kind === 'schedule') {
            const s = node.schedule;
            const item = new vscode.TreeItem(s.title, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon(
                s.enabled ? 'clock' : 'circle-slash',
                s.enabled ? new vscode.ThemeColor('charts.blue') : undefined
            );
            item.description = `${s.agentName} • ${scheduleWhen(s)}${s.enabled ? '' : ' • off'}`;
            item.tooltip = `${s.title}\n${s.agentName} — ${scheduleWhen(s)} (${s.mode})\n\n${s.prompt}`;
            item.contextValue = s.enabled ? 'schedule-on' : 'schedule-off';
            return item;
        }
        if (node.kind === 'agent-group') {
            const tasks = this.manager.tasks.filter(t => t.agentId === node.agentId);
            const queued = tasks.filter(t => t.status === 'queued').length;
            const running = tasks.filter(t => t.status === 'running').length;
            const item = new vscode.TreeItem(node.agentName, vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('hubot');
            item.description = `${queued} queued${running ? ` • ${running} running` : ''}`;
            item.contextValue = 'task-agent-group';
            return item;
        }
        const t = node.task;
        const item = new vscode.TreeItem(t.title, vscode.TreeItemCollapsibleState.None);
        const meta: Record<string, { icon: string; color?: string }> = {
            queued: { icon: 'circle-large-outline' },
            running: { icon: 'sync~spin', color: 'charts.green' },
            done: { icon: 'check', color: 'charts.green' },
            failed: { icon: 'error', color: 'errorForeground' },
            cancelled: { icon: 'circle-slash' }
        };
        const m = meta[t.status];
        item.iconPath = new vscode.ThemeIcon(m.icon, m.color ? new vscode.ThemeColor(m.color) : undefined);
        const when = t.endedAt ?? t.startedAt ?? t.createdAt;
        item.description = `${t.status}${t.mode === 'headless' ? ' • headless' : ''} • ${relTime(when)}`;
        item.tooltip = `${t.title}\n[${t.status}] ${t.agentName} (${t.mode})\n\n${t.prompt}`;
        item.contextValue = 'task-' + (t.status === 'queued' ? 'queued' : t.status === 'running' ? 'running' : 'final');
        if (t.status === 'running') {
            item.command = {
                command: 'agentfarm.revealTaskTerminal',
                title: 'Reveal Terminal',
                arguments: [node]
            };
        }
        return item;
    }

    getChildren(node?: TaskNode): TaskNode[] {
        if (!node) {
            const roots: TaskNode[] = [];
            if (this.manager.schedules.length) {
                roots.push({ kind: 'schedules-root' });
            }
            const groups = new Map<string, string>();
            for (const t of this.manager.tasks) {
                groups.set(t.agentId, t.agentName);
            }
            for (const [agentId, agentName] of [...groups].sort((a, b) => a[1].localeCompare(b[1]))) {
                roots.push({ kind: 'agent-group', agentId, agentName });
            }
            return roots;
        }
        if (node.kind === 'schedules-root') {
            return this.manager.schedules.map(schedule => ({ kind: 'schedule' as const, schedule }));
        }
        if (node.kind === 'agent-group') {
            const order: Record<string, number> = { running: 0, queued: 1, failed: 2, done: 3, cancelled: 4 };
            return this.manager.tasks
                .filter(t => t.agentId === node.agentId)
                .sort((a, b) => order[a.status] - order[b.status] || b.createdAt - a.createdAt)
                .map(task => ({ kind: 'task' as const, task }));
        }
        return [];
    }
}
