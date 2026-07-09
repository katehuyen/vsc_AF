import * as vscode from 'vscode';
import { FarmSchedule, FarmTask, FarmTemplate, FarmTrigger, FarmWorkflow, TaskManager } from '../core/tasks';
import { TriggerManager } from '../core/triggers';
import { relTime } from '../core/util';

export type TaskNode =
    | { kind: 'triggers-root' }
    | { kind: 'trigger'; trigger: FarmTrigger }
    | { kind: 'schedules-root' }
    | { kind: 'schedule'; schedule: FarmSchedule }
    | { kind: 'templates-root' }
    | { kind: 'template'; template: FarmTemplate }
    | { kind: 'workflows-root' }
    | { kind: 'workflow'; workflow: FarmWorkflow }
    | { kind: 'workflow-step'; workflow: FarmWorkflow; index: number }
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

    constructor(private manager: TaskManager, private triggerManager?: TriggerManager) {
        manager.onDidChange(() => this.refresh());
    }

    refresh(): void { this.emitter.fire(); }

    getTreeItem(node: TaskNode): vscode.TreeItem {
        if (node.kind === 'triggers-root') {
            const item = new vscode.TreeItem('Triggers', vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('zap');
            item.description = `${this.manager.triggers.filter(t => t.enabled).length} armed`;
            item.contextValue = 'triggers-root';
            return item;
        }
        if (node.kind === 'trigger') {
            const t = node.trigger;
            const armed = t.type !== 'watch' || this.triggerManager?.isArmed(t.id);
            const item = new vscode.TreeItem(t.title, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon(
                !t.enabled ? 'circle-slash' : armed ? 'zap' : 'warning',
                !t.enabled ? undefined
                    : armed ? new vscode.ThemeColor('charts.yellow')
                        : new vscode.ThemeColor('errorForeground'));
            const src = t.type === 'watch'
                ? `watch: …${(t.watchPath ?? '').slice(-30)}`
                : t.type === 'webhook'
                    ? `webhook: /trigger/…${(t.token ?? '').slice(-6)}`
                    : `hook: ${t.hookEvent}${t.hookAgent ? '@' + t.hookAgent : ''}`;
            const target = t.action.kind === 'workflow' ? 'workflow'
                : t.action.kind === 'dispatch' ? 'dispatch→auto'
                    : `task→${t.action.agentName}`;
            const parts = [src, target];
            if (!t.enabled) { parts.push('off'); }
            else if (!armed && t.type === 'watch') { parts.push('PATH MISSING'); }
            if (t.fireCount) { parts.push(`fired ${t.fireCount}×${t.lastFiredAt ? ' (' + relTime(t.lastFiredAt) + ')' : ''}`); }
            item.description = parts.join(' • ');
            item.tooltip = `${t.title}\n${src}\naction: ${target}\n` +
                `debounce ${t.debounceSec}s • cooldown ${t.cooldownSec}s • max ${t.maxPerHour}/h\n` +
                (t.lastFiredAt ? `last fired: ${new Date(t.lastFiredAt).toLocaleString()}` : 'never fired');
            item.contextValue = t.type === 'webhook' ? 'trigger-webhook' : 'trigger';
            return item;
        }
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
        if (node.kind === 'templates-root') {
            const item = new vscode.TreeItem('Templates', vscode.TreeItemCollapsibleState.Collapsed);
            item.iconPath = new vscode.ThemeIcon('bookmark');
            item.description = String(this.manager.templates.length);
            item.contextValue = 'templates-root';
            return item;
        }
        if (node.kind === 'template') {
            const t = node.template;
            const item = new vscode.TreeItem(t.title, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('bookmark');
            item.description = `${t.agentName ?? 'any agent'} • ${t.mode}`;
            item.tooltip = `${t.title}\n${t.agentName ?? 'agent chosen at run time'} (${t.mode})\n\n${t.prompt}`;
            item.contextValue = 'template';
            return item;
        }
        if (node.kind === 'workflows-root') {
            const item = new vscode.TreeItem('Workflows', vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('type-hierarchy-sub');
            item.description = String(this.manager.workflows.length);
            item.contextValue = 'workflows-root';
            return item;
        }
        if (node.kind === 'workflow') {
            const w = node.workflow;
            const item = new vscode.TreeItem(w.title, vscode.TreeItemCollapsibleState.Collapsed);
            item.iconPath = new vscode.ThemeIcon('type-hierarchy-sub', new vscode.ThemeColor('charts.purple'));
            const agents = [...new Set(w.steps.map(s => s.agentName))];
            item.description = `${w.steps.length} steps • ${agents.join(' → ')}`;
            item.tooltip = `${w.title}\n\n` +
                w.steps.map((s, i) => `${i + 1}. [${s.agentName}] ${s.title} (${s.mode})`).join('\n');
            item.contextValue = 'workflow';
            return item;
        }
        if (node.kind === 'workflow-step') {
            const s = node.workflow.steps[node.index];
            const item = new vscode.TreeItem(`${node.index + 1}. ${s.title}`, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('arrow-small-right');
            item.description = `${s.agentName} • ${s.mode}`;
            item.tooltip = s.prompt;
            item.contextValue = 'workflow-step';
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
        const statusLabel = t.status === 'queued' && t.deferredReason
            ? `deferred: ${t.deferredReason}`
            : t.status + (t.verified ? ` • verify ${t.verified}` : '');
        item.description = `${statusLabel}${t.mode === 'headless' ? ' • headless' : ''} • ${relTime(when)}`;
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
            if (this.manager.triggers.length) {
                roots.push({ kind: 'triggers-root' });
            }
            if (this.manager.schedules.length) {
                roots.push({ kind: 'schedules-root' });
            }
            if (this.manager.workflows.length) {
                roots.push({ kind: 'workflows-root' });
            }
            if (this.manager.templates.length) {
                roots.push({ kind: 'templates-root' });
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
        if (node.kind === 'triggers-root') {
            return this.manager.triggers.map(trigger => ({ kind: 'trigger' as const, trigger }));
        }
        if (node.kind === 'schedules-root') {
            return this.manager.schedules.map(schedule => ({ kind: 'schedule' as const, schedule }));
        }
        if (node.kind === 'templates-root') {
            return this.manager.templates.map(template => ({ kind: 'template' as const, template }));
        }
        if (node.kind === 'workflows-root') {
            return this.manager.workflows.map(workflow => ({ kind: 'workflow' as const, workflow }));
        }
        if (node.kind === 'workflow') {
            return node.workflow.steps.map((_s, index) => ({
                kind: 'workflow-step' as const, workflow: node.workflow, index
            }));
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
