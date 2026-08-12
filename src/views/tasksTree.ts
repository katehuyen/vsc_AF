import * as vscode from 'vscode';
import { describePrecondition } from '../core/automation';
import { FarmSchedule, FarmTask, FarmTemplate, FarmTrigger, FarmWorkflow, TaskManager } from '../core/tasks';
import { TriggerManager } from '../core/triggers';
import { fmtTokens, relTime } from '../core/util';
import { full as afFull } from '../core/aftime';
import { engineOf } from '../core/consoleEngine';

/**
 * Tasks tree — the sidebar NAVIGATOR for the Tasks page.
 *
 * It mirrors the page's one distinction so the two surfaces teach the same
 * model instead of two different ones:
 *
 *   PLAN   — every work DEFINITION (schedule · trigger · workflow · template)
 *   NOW    — what is running or waiting to run, i.e. what needs you
 *   RECENT — the last handful of finished runs, as evidence
 *
 * Two faults this replaces. (1) Root sections appeared only when they had
 * content, so a farm with no workflows simply had no Workflows section and the
 * feature looked missing. All three roots are now ALWAYS present, and an empty
 * one says what to add. (2) Tasks were grouped per agent with every finished
 * run included, so each agent unfolded into a wall of history with nothing to
 * do about it; history now lives behind RECENT (capped) and the page.
 *
 * Leaf `contextValue`s are deliberately unchanged — every existing right-click
 * menu keeps working.
 */

export type TaskNode =
    | { kind: 'plan-root' }
    | { kind: 'now-root' }
    | { kind: 'recent-root' }
    | { kind: 'empty'; parent: 'plan' | 'now' | 'recent' }
    | { kind: 'trigger'; trigger: FarmTrigger }
    | { kind: 'schedule'; schedule: FarmSchedule }
    | { kind: 'template'; template: FarmTemplate }
    | { kind: 'workflow'; workflow: FarmWorkflow }
    | { kind: 'workflow-step'; workflow: FarmWorkflow; index: number }
    | { kind: 'task'; task: FarmTask }
    | { kind: 'follower-note' };

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** How many finished runs the sidebar keeps; the page holds the rest. */
const RECENT_MAX = 12;

function scheduleWhen(s: FarmSchedule): string {
    const hm = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
    if (s.kind === 'daily') { return `daily ${hm}`; }
    if (s.kind === 'weekly') { return `${DOW[s.dow ?? 0]} ${hm}`; }
    return s.onceAt ? `once ${afFull(s.onceAt)}` : 'once';
}

const isLive = (t: FarmTask) => t.status === 'queued' || t.status === 'running';

export class TasksTreeProvider implements vscode.TreeDataProvider<TaskNode> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | TaskNode | TaskNode[] | null | undefined>;

    constructor(private manager: TaskManager, private triggerManager?: TriggerManager,
        /** H2: one-line reliability scorecard per trigger. */
        private triggerStat?: (t: FarmTrigger) => string | undefined,
        /** B11: false = another window runs the queue (this view is read-only). */
        private isRunner?: () => boolean) {
        manager.onDidChange(() => this.refresh());
    }

    refresh(): void { this.emitter.fire(); }

    /** Every definition, in the order the sidebar should scan them. */
    private planNodes(): TaskNode[] {
        const KIND_ORDER = { schedule: 0, trigger: 1, workflow: 2, template: 3 };
        const rows: { order: number; sub: number; node: TaskNode }[] = [
            ...this.manager.schedules.map(schedule => ({
                order: KIND_ORDER.schedule,
                sub: schedule.enabled ? schedule.hour * 60 + schedule.minute : 1e6,
                node: { kind: 'schedule' as const, schedule }
            })),
            ...this.manager.triggers.map(trigger => ({
                order: KIND_ORDER.trigger, sub: trigger.enabled ? 0 : 1,
                node: { kind: 'trigger' as const, trigger }
            })),
            ...this.manager.workflows.map(workflow => ({
                order: KIND_ORDER.workflow, sub: 0, node: { kind: 'workflow' as const, workflow }
            })),
            ...this.manager.templates.map(template => ({
                order: KIND_ORDER.template, sub: 0, node: { kind: 'template' as const, template }
            }))
        ];
        return rows.sort((a, b) => a.order - b.order || a.sub - b.sub).map(r => r.node);
    }

    getTreeItem(node: TaskNode): vscode.TreeItem {
        if (node.kind === 'follower-note') {
            const item = new vscode.TreeItem('Read-only — another window runs the queue', vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.yellow'));
            item.tooltip = 'Another VS Code window holds the task-runner lease: it launches scheduled/queued work. '
                + 'This view mirrors it live. If that window closes, this one takes over automatically.';
            item.contextValue = 'follower-note';
            return item;
        }

        // ---- roots ----
        if (node.kind === 'plan-root') {
            const m = this.manager;
            const on = m.schedules.filter(s => s.enabled).length + m.triggers.filter(t => t.enabled).length;
            const total = m.schedules.length + m.triggers.length;
            const item = new vscode.TreeItem('Plan', vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('calendar');
            const extras = m.workflows.length + m.templates.length;
            item.description = `${on}/${total} on${extras ? ` · ${extras} manual` : ''}`;
            item.tooltip = 'Everything that DEFINES work: schedules, triggers, workflows and templates.\n'
                + 'A schedule or trigger runs on its own; a workflow or template runs when you launch it.';
            item.contextValue = 'plan-root';
            return item;
        }
        if (node.kind === 'now-root') {
            const running = this.manager.tasks.filter(t => t.status === 'running').length;
            const queued = this.manager.tasks.filter(t => t.status === 'queued').length;
            const item = new vscode.TreeItem('Now', vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('play-circle',
                running ? new vscode.ThemeColor('charts.green') : undefined);
            item.description = running || queued
                ? `${running} running${queued ? ` · ${queued} queued` : ''}`
                : 'idle';
            item.tooltip = 'Tasks running or waiting to run. A TASK is one execution — started by a '
                + 'schedule, a trigger, a workflow step, or by you.';
            item.contextValue = 'now-root';
            return item;
        }
        if (node.kind === 'recent-root') {
            const finished = this.manager.tasks.filter(t => !isLive(t));
            const failed = finished.filter(t => t.status === 'failed').length;
            const item = new vscode.TreeItem('Recent', vscode.TreeItemCollapsibleState.Collapsed);
            item.iconPath = new vscode.ThemeIcon('history',
                failed ? new vscode.ThemeColor('errorForeground') : undefined);
            item.description = finished.length
                ? `last ${Math.min(RECENT_MAX, finished.length)}${failed ? ` · ${failed} failed` : ''}`
                : 'nothing yet';
            item.tooltip = `The ${RECENT_MAX} most recent finished runs. The full history lives on the `
                + 'Tasks page and in the monthly archive — this is a glance, not a ledger.';
            item.contextValue = 'recent-root';
            return item;
        }
        if (node.kind === 'empty') {
            const text = node.parent === 'plan'
                ? 'Nothing automated yet — add a schedule or a trigger'
                : node.parent === 'now'
                    ? 'Nothing running or queued'
                    : 'No finished runs yet';
            const item = new vscode.TreeItem(text, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon(node.parent === 'plan' ? 'add' : 'dash');
            item.contextValue = `empty-${node.parent}`;
            if (node.parent === 'plan') {
                item.command = { command: 'agentfarm.addSchedule', title: 'Add Scheduled Task' };
            }
            return item;
        }

        // ---- PLAN leaves (contextValues unchanged: the menus depend on them) ----
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
                ? `watch: …${(t.watchPath ?? '').slice(-24)}`
                : t.type === 'webhook'
                    ? `webhook: /trigger/…${(t.token ?? '').slice(-6)}`
                    : `hook: ${t.hookEvent}${t.hookAgent ? '@' + t.hookAgent : ''}`;
            const target = t.action.kind === 'workflow' ? 'workflow'
                : t.action.kind === 'dispatch' ? 'dispatch→auto'
                    : `→${t.action.agentName}`;
            const parts = [src, target];
            if (!t.enabled) { parts.push('off'); }
            else if (!armed && t.type === 'watch') { parts.push('PATH MISSING'); }
            else if (!t.fireIf?.kind) { parts.push('no guard'); }
            if (t.skipCount) { parts.push(`${t.skipCount} skipped`); }
            const stat = this.triggerStat?.(t);
            if (stat) { parts.push(stat); }
            else if (t.fireCount) { parts.push(`fired ${t.fireCount}×${t.lastFiredAt ? ' (' + relTime(t.lastFiredAt) + ')' : ''}`); }
            item.description = parts.join(' • ');
            item.tooltip = `⚡ TRIGGER — ${t.title}\n${src}\naction: ${target}\n`
                + `model: ${t.action.kind === 'workflow' ? '—' : (t.action.model || 'default')}\n`
                + `fires only if: ${describePrecondition(t.fireIf) || 'no guard — any change wakes an agent'}\n`
                + `debounce ${t.debounceSec}s • cooldown ${t.cooldownSec}s • max ${t.maxPerHour}/h\n`
                + (t.lastFiredAt ? `last fired: ${afFull(t.lastFiredAt)}` : 'never fired')
                + (t.lastSkipReason ? `\nlast skip: ${t.lastSkipReason}` : '')
                + (stat ? `\nreliability: ${stat}` : '');
            item.contextValue = t.type === 'webhook' ? 'trigger-webhook' : 'trigger';
            return item;
        }
        if (node.kind === 'schedule') {
            const s = node.schedule;
            const item = new vscode.TreeItem(s.title, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon(
                s.enabled ? 'clock' : 'circle-slash',
                s.enabled ? new vscode.ThemeColor('charts.blue') : undefined
            );
            const parts = [s.agentName, scheduleWhen(s)];
            if (s.model) { parts.push(s.model); }
            if (!s.enabled) { parts.push('off'); }
            else if (!s.fireIf?.kind) { parts.push('no guard'); }
            if (s.pendingRunKey) { parts.push('deferred'); }
            item.description = parts.join(' • ');
            item.tooltip = `⏰ SCHEDULE — ${s.title}\n${s.agentName} — ${scheduleWhen(s)} (${s.mode})\n`
                + `model: ${s.model || 'default'}\n`
                + `runs only if: ${describePrecondition(s.fireIf) || 'no guard — it runs whether or not there is work'}\n`
                + `missed → ${s.missed ?? 'skip'}\n\n${s.prompt}`;
            item.contextValue = s.enabled ? 'schedule-on' : 'schedule-off';
            return item;
        }
        if (node.kind === 'template') {
            const t = node.template;
            const item = new vscode.TreeItem(t.title, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('bookmark');
            item.description = `${t.agentName ?? 'any agent'} • ${t.mode} • manual`;
            item.tooltip = `📋 TEMPLATE — ${t.title}\nA saved prompt you launch by hand; it never runs on its own.\n`
                + `${t.agentName ?? 'agent chosen at run time'} (${t.mode})\n\n${t.prompt}`;
            item.contextValue = 'template';
            return item;
        }
        if (node.kind === 'workflow') {
            const w = node.workflow;
            const item = new vscode.TreeItem(w.title, vscode.TreeItemCollapsibleState.Collapsed);
            item.iconPath = new vscode.ThemeIcon('type-hierarchy-sub', new vscode.ThemeColor('charts.purple'));
            const agents = [...new Set(w.steps.map(s => s.agentName).filter(Boolean))];
            item.description = `${w.steps.length} steps${agents.length ? ' • ' + agents.join(' → ') : ''} • manual`;
            item.tooltip = `🔗 WORKFLOW — ${w.title}\nA chain of steps; it runs when you launch it or a trigger does.\n\n`
                + w.steps.map((s, i) => `${i + 1}. [${s.agentName}] ${s.title} (${s.mode})`).join('\n');
            item.contextValue = 'workflow';
            return item;
        }
        if (node.kind === 'workflow-step') {
            const s = node.workflow.steps[node.index];
            const item = new vscode.TreeItem(`${node.index + 1}. ${s.title}`, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon(s.parallel ? 'git-merge' : 'arrow-small-right',
                s.parallel ? new vscode.ThemeColor('charts.purple') : undefined);
            const kind = s.approval ? 'approval' : s.select ? 'select' : s.webhook ? 'webhook'
                : s.media ? 'media' : s.browser ? 'browser' : s.mode;
            item.description = `${s.agentName} • ${kind}${s.parallel ? ' • ∥ parallel' : ''}`;
            item.tooltip = (s.parallel ? '∥ runs in parallel with adjacent parallel steps\n\n' : '') + (s.prompt || s.title);
            item.contextValue = 'workflow-step';
            return item;
        }

        // ---- a TASK: one execution ----
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
        const prio = t.status === 'queued' && (t.priority ?? 0) > 0 ? ' • ⬆ next' : '';
        const statusLabel = t.status === 'queued' && t.deferredReason
            ? `deferred: ${t.deferredReason}`
            : t.status + (t.verified ? ` • verify ${t.verified}` : '');
        /**
         * ‼️ WHAT A RUN COST, IN THAT ENGINE'S OWN CURRENCY (X-19 · X-35).
         * Every engine but Claude bills a plan and states no price, so its
         * matched transcript prices at exactly $0.00 — and `• $0.00` on a row
         * is not a small number, it is a WRONG one: it reads as "this run was
         * free". Those rows now carry the figure the engine really does report,
         * its token count, and the tooltip says why there is no dollar.
         */
        const eng = engineOf(t.engine);
        const cost = t.costUSD === undefined ? ''
            : eng.reportsCost ? ` • $${t.costUSD.toFixed(2)}`
                : t.tokens ? ` • ${fmtTokens(t.tokens)} tok` : '';
        const from = t.fromSchedule ? 'schedule' : t.fromTrigger ? 'trigger'
            : t.workflowId !== undefined ? 'workflow' : 'you';
        item.description = `${t.agentName} • ${statusLabel}${prio}${cost} • ${relTime(when)}`;
        item.tooltip = `▶ TASK (one run) — ${t.title}\n[${t.status}] ${t.agentName} (${t.mode}) • started by: ${from}`
            + (t.engine ? `\nengine: ${eng.label}` : '')
            + (t.model ? `\nmodel: ${t.model}` : '')
            + (t.costUSD === undefined ? ''
                : eng.reportsCost
                    ? `\nCost: $${t.costUSD.toFixed(4)} (API-equivalent, from the matched transcript)`
                    : `\nTokens: ${fmtTokens(t.tokens ?? 0)} (from the matched transcript) — ${eng.label} bills a plan, so it states no price`)
            + `\n\n${t.prompt}`;
        // Workflow-step finals get a distinct context so the menu offers "resume chain" instead of a plain retry.
        const finalKind = t.workflowId !== undefined ? 'final-workflow' : 'final';
        item.contextValue = 'task-' + (t.status === 'queued' ? 'queued' : t.status === 'running' ? 'running' : finalKind);
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
            if (this.isRunner && !this.isRunner()) {
                roots.push({ kind: 'follower-note' });
            }
            // All three are ALWAYS present: a section that disappears when empty
            // makes the feature behind it look missing.
            roots.push({ kind: 'plan-root' }, { kind: 'now-root' }, { kind: 'recent-root' });
            return roots;
        }
        if (node.kind === 'plan-root') {
            const plan = this.planNodes();
            return plan.length ? plan : [{ kind: 'empty', parent: 'plan' }];
        }
        if (node.kind === 'now-root') {
            const order: Record<string, number> = { running: 0, queued: 1 };
            const live = this.manager.tasks
                .filter(isLive)
                .sort((a, b) => order[a.status] - order[b.status]
                    || (b.priority ?? 0) - (a.priority ?? 0)
                    || a.createdAt - b.createdAt)
                .map(task => ({ kind: 'task' as const, task }));
            return live.length ? live : [{ kind: 'empty', parent: 'now' }];
        }
        if (node.kind === 'recent-root') {
            const finished = this.manager.tasks
                .filter(t => !isLive(t))
                .sort((a, b) => (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt))
                .slice(0, RECENT_MAX)
                .map(task => ({ kind: 'task' as const, task }));
            return finished.length ? finished : [{ kind: 'empty', parent: 'recent' }];
        }
        if (node.kind === 'workflow') {
            return (node.workflow?.steps ?? []).map((_s, index) => ({
                kind: 'workflow-step' as const, workflow: node.workflow, index
            }));
        }
        return [];
    }
}
