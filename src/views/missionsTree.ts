import * as vscode from 'vscode';
import { MissionRound, MissionRun, MissionSpec, MissionStep } from '../core/missions';
import { relTime } from '../core/util';
import { full as afFull } from '../core/aftime';

export type MissionNode =
    | { kind: 'run'; run: MissionRun; spec?: MissionSpec }
    | { kind: 'wait'; run: MissionRun; flavor: 'question' | 'approval'; detail: string }
    | { kind: 'result'; run: MissionRun }
    | { kind: 'round'; run: MissionRun; round: MissionRound }
    | { kind: 'step'; run: MissionRun; step: MissionStep };

/** Sidebar twin of the Missions page — same store, same change event. */
export interface MissionsTreeDeps {
    runs(): MissionRun[];
    spec(id: string): MissionSpec | undefined;
    /** Pending ask_user question for this run (undefined = none). */
    question(runId: string): string | undefined;
    /** True while a round of this run sits in the approval queue. */
    awaitingApproval(runId: string): boolean;
    onDidChange: vscode.Event<void>;
}

const RUN_META: Record<MissionRun['status'], { icon: string; color?: string; label: string }> = {
    running: { icon: 'sync~spin', color: 'charts.green', label: 'running' },
    'waiting-approval': { icon: 'shield', color: 'charts.yellow', label: 'awaiting approval' },
    'waiting-user': { icon: 'comment-discussion', color: 'charts.yellow', label: 'awaiting your answer' },
    paused: { icon: 'debug-pause', color: 'charts.yellow', label: 'paused' },
    done: { icon: 'check', color: 'charts.green', label: 'done' },
    failed: { icon: 'error', color: 'errorForeground', label: 'failed' },
    cancelled: { icon: 'circle-slash', label: 'cancelled' }
};

const STEP_META: Record<MissionStep['status'], { icon: string; color?: string }> = {
    queued: { icon: 'circle-large-outline' },
    running: { icon: 'sync~spin', color: 'charts.green' },
    done: { icon: 'check', color: 'charts.green' },
    failed: { icon: 'error', color: 'errorForeground' },
    cancelled: { icon: 'circle-slash' }
};

const ROUND_ICON: Record<MissionRound['action'], string> = {
    delegate: 'list-tree', ask_user: 'comment-discussion', finish: 'flag', abort: 'stop-circle',
    // M-16 — a round in which the lead changed its approach and ordered nothing
    replan: 'git-branch'
};

function themed(icon: string, color?: string): vscode.ThemeIcon {
    return new vscode.ThemeIcon(icon, color ? new vscode.ThemeColor(color) : undefined);
}

const FINAL: MissionRun['status'][] = ['done', 'failed', 'cancelled'];

export class MissionsTreeProvider implements vscode.TreeDataProvider<MissionNode> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | MissionNode | MissionNode[] | null | undefined>;

    constructor(private deps: MissionsTreeDeps) {
        deps.onDidChange(() => this.refresh());
    }

    refresh(): void { this.emitter.fire(); }

    getTreeItem(node: MissionNode): vscode.TreeItem {
        if (node.kind === 'run') { return this.runItem(node.run, node.spec); }
        if (node.kind === 'wait') { return this.waitItem(node); }
        if (node.kind === 'result') { return this.resultItem(node.run); }
        if (node.kind === 'round') { return this.roundItem(node.round); }
        return this.stepItem(node);
    }

    private runItem(run: MissionRun, spec?: MissionSpec): vscode.TreeItem {
        const m = RUN_META[run.status];
        const active = !FINAL.includes(run.status);
        const item = new vscode.TreeItem(
            spec?.title ?? run.id,
            active && run.status !== 'paused'
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed);
        // partial verdicts deserve the yellow glance even though the run "succeeded"
        const partial = run.status === 'done' && run.result?.verdict === 'partial';
        item.iconPath = partial ? themed('warning', 'charts.yellow') : themed(m.icon, m.color);
        const label = run.status === 'done' && run.result ? `done · ${run.result.verdict}`
            : run.pausePending ? '⏸ pausing…'
                : (active && run.now ? run.now.what : m.label);
        const rounds = `R${run.rounds.length}${spec ? '/' + spec.limits.maxRounds : ''}`;
        item.description = `${label} • ${rounds} • $${run.totalCostUSD.toFixed(2)} • ${relTime(run.endedAt ?? run.startedAt)}`;
        item.tooltip = `${spec?.title ?? run.id}\n[${run.status}] lead: ${spec?.leadAgentName ?? '?'}${spec?.plannerModel ? ` (planner: ${spec.plannerModel})` : ''} · team: ${spec?.team.map(t => t.agentName + (t.model ? ` (${t.model})` : '')).join(', ') ?? '?'}`
            + (run.pausePending ? '\npause requested — takes effect before the next planner round (Pause again withdraws it)' : '')
            + (spec ? `\nbudget: $${run.totalCostUSD.toFixed(2)} of $${spec.limits.maxCostUSD} · ${run.rounds.length} of ${spec.limits.maxRounds} rounds` : '')
            + (spec ? `\n\ngoal: ${spec.goal}` : '')
            + (run.result ? `\n\n${run.result.verdict}: ${run.result.summary}` : '')
            + (run.note ? `\nnote: ${run.note}` : '');
        item.contextValue = 'mission-run-' + (FINAL.includes(run.status) ? 'final' : run.status);
        item.command = { command: 'agentfarm.openMissions', title: 'Open Missions' };
        return item;
    }

    private waitItem(node: { run: MissionRun; flavor: 'question' | 'approval'; detail: string }): vscode.TreeItem {
        if (node.flavor === 'question') {
            const item = new vscode.TreeItem(`Q: ${node.detail}`, vscode.TreeItemCollapsibleState.None);
            item.iconPath = themed('comment-discussion', 'charts.yellow');
            item.description = 'click to answer';
            item.tooltip = `The lead asks:\n${node.detail}\n\nThe mission clock is stopped while it waits for you.`;
            item.contextValue = 'mission-wait-question';
            item.command = { command: 'agentfarm.missionAnswer', title: 'Answer…', arguments: [node] };
            return item;
        }
        const round = node.run.rounds[node.run.rounds.length - 1];
        const item = new vscode.TreeItem(
            `Round ${round?.n ?? '?'} waits for approval`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = themed('shield', 'charts.yellow');
        item.description = `${round?.steps.length ?? 0} delegation(s)`;
        item.tooltip = 'Planned delegations:\n'
            + (round?.steps.map(s => `- ${s.agentName}: ${s.title}`).join('\n') ?? '')
            + '\n\nApprove or reject from this row (also in Needs You / the Missions page).';
        item.contextValue = 'mission-wait-approval';
        return item;
    }

    private resultItem(run: MissionRun): vscode.TreeItem {
        const r = run.result!;
        const item = new vscode.TreeItem(`${r.verdict}: ${r.summary}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = r.verdict === 'success' ? themed('pass', 'charts.green')
            : r.verdict === 'partial' ? themed('warning', 'charts.yellow')
                : themed('error', 'errorForeground');
        item.tooltip = r.summary;
        item.contextValue = 'mission-result';
        item.command = { command: 'agentfarm.openMissions', title: 'Open Missions' };
        return item;
    }

    private roundItem(round: MissionRound): vscode.TreeItem {
        const item = new vscode.TreeItem(
            `R${round.n} · ${round.action}`,
            round.steps.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        item.iconPath = themed(ROUND_ICON[round.action], round.action === 'abort' ? 'errorForeground' : undefined);
        item.description = round.action === 'delegate'
            ? `${round.steps.length} delegation(s)${round.rejectedReason ? ' • rejected' : ''}`
            : round.action === 'ask_user'
                ? (round.question ?? '').slice(0, 80)
                : round.thought.slice(0, 80);
        item.tooltip = `R${round.n} ${round.action} · ${afFull(round.at)}\nthought: ${round.thought}`
            + (round.question ? `\nQ: ${round.question}\nA: ${round.answer ?? '(pending)'}` : '')
            + (round.rejectedReason ? `\n${round.rejectedReason}` : '');
        item.contextValue = 'mission-round';
        return item;
    }

    private stepItem(node: { step: MissionStep }): vscode.TreeItem {
        const s = node.step;
        const m = STEP_META[s.status];
        const item = new vscode.TreeItem(s.title, vscode.TreeItemCollapsibleState.None);
        item.iconPath = themed(m.icon, m.color);
        const cost = s.costUSD !== undefined ? ` • $${s.costUSD.toFixed(2)}` : '';
        item.description = `${s.agentName} • ${s.status}${cost}${s.note ? ` • ${s.note}` : ''}`;
        item.tooltip = `${s.title}\n[${s.status}] ${s.agentName}${s.readonly ? ' · readonly' : ''}`
            + (s.expect ? `\nexpected: ${s.expect}` : '')
            + `\n\n${s.prompt.slice(0, 600)}`;
        item.contextValue = 'mission-step' + (s.outputFile ? '-out' : '');
        if (s.outputFile) {
            item.command = { command: 'agentfarm.missionStepOutput', title: 'Open Output', arguments: [node] };
        }
        return item;
    }

    getChildren(node?: MissionNode): MissionNode[] {
        if (!node) {
            return this.deps.runs().map(run => ({ kind: 'run' as const, run, spec: this.deps.spec(run.specId) }));
        }
        if (node.kind === 'run') {
            const kids: MissionNode[] = [];
            const q = this.deps.question(node.run.id);
            if (q) { kids.push({ kind: 'wait', run: node.run, flavor: 'question', detail: q }); }
            if (this.deps.awaitingApproval(node.run.id)) {
                kids.push({ kind: 'wait', run: node.run, flavor: 'approval', detail: '' });
            }
            if (node.run.result) { kids.push({ kind: 'result', run: node.run }); }
            kids.push(...node.run.rounds.map(round => ({ kind: 'round' as const, run: node.run, round })));
            return kids;
        }
        if (node.kind === 'round') {
            return node.round.steps.map(step => ({ kind: 'step' as const, run: node.run, step }));
        }
        return [];
    }
}
