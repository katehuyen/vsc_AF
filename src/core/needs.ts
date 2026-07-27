/**
 * G1 — Approval queue ("Needs You"). One urgency-sorted list of everything
 * that is blocked on the human: permission waits, browser-step approvals,
 * stalled sessions, budget breaches, Antigravity conflicts, open instruction
 * suggestions and deferred task starts. Pure data in, pure data out — the
 * panel and the status bar both render from here.
 */

export type NeedKind =
    | 'permission'        // a live session is blocked on a permission dialog
    | 'browser-approval'  // a browser workflow step waits for Run/Reject
    | 'interrupted'       // a workflow run was cut by a window close — resume?
    | 'stalled'           // a working session stopped emitting events
    | 'budget'            // daily budget exceeded
    | 'conflict'          // Antigravity two-sided drift needs reconciling
    | 'suggestion'        // proposed CLAUDE.md rule awaiting review
    | 'deferred'          // a task start is parked (concurrency / quota)
    | 'your-turn'         // session finished its turn, waiting for input
    | 'mission';          // a mission waits on the human (question / interrupted)

export interface NeedAction {
    id: string;
    label: string;
}

export interface NeedRef {
    sessionId?: string;
    transcriptPath?: string;
    approvalId?: string;
    suggestionId?: string;
    filePath?: string;
    agentId?: string;
    taskId?: string;
    /** interrupted: the workflow run to resume/dismiss. */
    runId?: string;
    /** mission: the mission run waiting on the human. */
    missionRunId?: string;
}

export interface NeedItem {
    /** Lower = more urgent; the queue is sorted by this, then by recency. */
    urgency: number;
    kind: NeedKind;
    agentName: string;
    title: string;
    detail: string;
    ts: number;
    ref: NeedRef;
    actions: NeedAction[];
}

const URGENCY: Record<NeedKind, number> = {
    'permission': 0,
    'mission': 1,
    'browser-approval': 1,
    'interrupted': 2,
    'stalled': 2,
    'budget': 3,
    'conflict': 4,
    'deferred': 5,
    'suggestion': 6,
    'your-turn': 7
};

export interface PendingApproval {
    id: string;
    title: string;
    url: string;
    goal: string;
    createdAt: number;
    /** 'browser' = a browser step wants to run; 'approval' = a workflow human-gate. */
    kind?: 'browser' | 'approval';
}

/**
 * Browser-step approvals live here while the confirm modal is up, so the
 * Needs You panel can approve/reject the same request. First settle wins.
 */
export class ApprovalQueue {
    private pending = new Map<string, { info: PendingApproval; resolve: (ok: boolean) => void }>();
    private seq = 0;
    /** The extension wires this to panel refreshes. */
    onChange?: () => void;

    list(): PendingApproval[] {
        return [...this.pending.values()].map(p => p.info);
    }

    add(info: { title: string; url?: string; goal?: string; kind?: 'browser' | 'approval' }): { id: string; promise: Promise<boolean> } {
        const id = `ap${++this.seq}-${Date.now().toString(36)}`;
        const promise = new Promise<boolean>(resolve => {
            this.pending.set(id, {
                info: {
                    id, title: info.title, url: info.url ?? '', goal: info.goal ?? '',
                    createdAt: Date.now(), kind: info.kind ?? 'browser'
                },
                resolve
            });
        });
        this.onChange?.();
        return { id, promise };
    }

    /** Returns false if the approval was already settled elsewhere. */
    settle(id: string, ok: boolean): boolean {
        const entry = this.pending.get(id);
        if (!entry) { return false; }
        this.pending.delete(id);
        entry.resolve(ok);
        this.onChange?.();
        return true;
    }
}

/** The slices of farm state the queue is built from (all plain data). */
export interface NeedsInput {
    liveSessions: {
        sessionId: string;
        agentName?: string;
        status: string;
        lastPrompt?: string;
        currentTool?: string;
        lastEventTs: number;
        transcriptPath?: string;
    }[];
    approvals: PendingApproval[];
    insights: {
        severity: string;
        agentName: string;
        agentId?: string;
        category: string;
        message: string;
        filePath?: string;
        suggestionId?: string;
    }[];
    deferredTasks: {
        id: string;
        title: string;
        agentName: string;
        deferredReason?: string;
        createdAt: number;
    }[];
    /** F1: workflow runs cut by a window close, awaiting a resume decision. */
    interruptedRuns?: {
        runId: string;
        workflowTitle: string;
        stepIndex: number;
        stepTitle: string;
    }[];
    /** Missions blocked on the human: an open question or an interrupted run. */
    missionWaits?: {
        runId: string;
        missionTitle: string;
        flavor: 'question' | 'interrupted';
        detail: string;
        ts: number;
    }[];
    /** Include waiting-input sessions as low-urgency "your turn" rows. */
    includeYourTurn?: boolean;
}

export function buildNeedsQueue(input: NeedsInput): NeedItem[] {
    const items: NeedItem[] = [];

    for (const s of input.liveSessions) {
        const agentName = s.agentName ?? s.sessionId.slice(0, 8);
        if (s.status === 'waiting-permission') {
            items.push({
                urgency: URGENCY.permission,
                kind: 'permission',
                agentName,
                title: `${agentName} is waiting for permission`,
                detail: s.lastPrompt ?? '',
                ts: s.lastEventTs,
                ref: { sessionId: s.sessionId, transcriptPath: s.transcriptPath },
                actions: [
                    // the answer to a permission dialog lives in the terminal —
                    // jumping there is the fastest way to unblock the agent
                    { id: 'focus-terminal', label: '⌨ Terminal' },
                    { id: 'open-session', label: 'Open Session' },
                    { id: 'open-timeline', label: 'Timeline' }
                ]
            });
        } else if (s.status === 'stalled') {
            items.push({
                urgency: URGENCY.stalled,
                kind: 'stalled',
                agentName,
                title: `${agentName} looks stalled`,
                detail: (s.currentTool ? `last tool: ${s.currentTool}` : s.lastPrompt ?? ''),
                ts: s.lastEventTs,
                ref: { sessionId: s.sessionId, transcriptPath: s.transcriptPath },
                actions: [
                    { id: 'focus-terminal', label: '⌨ Terminal' },
                    // a session stuck mid-work is exactly what Esc is for:
                    // the turn dies, the session and its context stay
                    { id: 'interrupt', label: '⎋ Interrupt' },
                    { id: 'open-session', label: 'Open Session' },
                    { id: 'open-timeline', label: 'Timeline' }
                ]
            });
        } else if (input.includeYourTurn && s.status === 'waiting-input') {
            items.push({
                urgency: URGENCY['your-turn'],
                kind: 'your-turn',
                agentName,
                title: `${agentName} finished its turn`,
                detail: s.lastPrompt ?? '',
                ts: s.lastEventTs,
                ref: { sessionId: s.sessionId, transcriptPath: s.transcriptPath },
                actions: [
                    { id: 'focus-terminal', label: '⌨ Terminal' },
                    { id: 'open-session', label: 'Open Session' }
                ]
            });
        }
    }

    for (const m of input.missionWaits ?? []) {
        items.push({
            urgency: URGENCY.mission,
            kind: 'mission',
            agentName: 'mission',
            title: m.flavor === 'question'
                ? `Mission "${m.missionTitle}" has a question`
                : `Mission "${m.missionTitle}" was interrupted`,
            detail: m.detail,
            ts: m.ts,
            ref: { missionRunId: m.runId },
            actions: m.flavor === 'question'
                ? [{ id: 'mission-answer', label: 'Answer…' }, { id: 'open-missions', label: 'Missions' }]
                : [{ id: 'mission-resume', label: 'Resume' }, { id: 'mission-dismiss', label: 'Dismiss' },
                   { id: 'open-missions', label: 'Missions' }]
        });
    }

    for (const a of input.approvals) {
        const isStep = a.kind === 'approval';
        items.push({
            urgency: URGENCY['browser-approval'],
            kind: 'browser-approval',
            agentName: isStep ? 'workflow' : 'browser',
            title: isStep ? `Approval needed — "${a.title}"` : `Browser step "${a.title}" wants to run`,
            detail: isStep ? (a.goal || 'waiting for your approval') : `${a.url} — ${a.goal}`,
            ts: a.createdAt,
            ref: { approvalId: a.id },
            actions: [
                { id: 'approve', label: isStep ? 'Approve' : 'Run' },
                { id: 'reject', label: 'Reject' }
            ]
        });
    }

    for (const ins of input.insights) {
        if (ins.category === 'budget' && ins.severity === 'error') {
            items.push({
                urgency: URGENCY.budget,
                kind: 'budget',
                agentName: ins.agentName,
                title: `Budget exceeded — ${ins.agentName}`,
                detail: ins.message,
                ts: 0,
                ref: { agentId: ins.agentId },
                actions: [{ id: 'open-dashboard', label: 'Dashboard' }]
            });
        } else if (ins.category === 'antigravity' && ins.severity === 'warning') {
            items.push({
                urgency: URGENCY.conflict,
                kind: 'conflict',
                agentName: ins.agentName,
                title: `Antigravity conflict — ${ins.agentName}`,
                detail: ins.message,
                ts: 0,
                ref: { agentId: ins.agentId, filePath: ins.filePath },
                actions: [{ id: 'sync-antigravity', label: 'Reconcile…' }]
            });
        } else if (ins.suggestionId) {
            items.push({
                urgency: URGENCY.suggestion,
                kind: 'suggestion',
                agentName: ins.agentName,
                title: `Instruction suggestion — ${ins.agentName}`,
                detail: ins.message,
                ts: 0,
                ref: { suggestionId: ins.suggestionId, agentId: ins.agentId },
                actions: [{ id: 'review-suggestion', label: 'Review…' }]
            });
        }
    }

    for (const t of input.deferredTasks) {
        items.push({
            urgency: URGENCY.deferred,
            kind: 'deferred',
            agentName: t.agentName,
            title: `Task parked — ${t.title}`,
            detail: t.deferredReason ?? 'waiting for capacity',
            ts: t.createdAt,
            ref: { taskId: t.id },
            actions: [{ id: 'open-board', label: 'Open Board' }]
        });
    }

    // F1: cut workflow runs — resuming spends money, so the human decides here.
    for (const r of input.interruptedRuns ?? []) {
        items.push({
            urgency: URGENCY.interrupted,
            kind: 'interrupted',
            agentName: 'workflow',
            title: `Run interrupted — "${r.workflowTitle}"`,
            detail: `cut at step ${r.stepIndex + 1} (${r.stepTitle}) when the window closed — Resume re-enters there with the previous handoff`,
            ts: 0,
            ref: { runId: r.runId },
            actions: [
                { id: 'resume-run', label: 'Resume' },
                { id: 'dismiss-run', label: 'Dismiss' }
            ]
        });
    }

    items.sort((a, b) => a.urgency - b.urgency || b.ts - a.ts);
    return items;
}

/** Count of rows that actively block work (used for the status-bar badge). */
export function blockingCount(items: NeedItem[]): number {
    return items.filter(i =>
        i.kind === 'permission' || i.kind === 'browser-approval'
        || i.kind === 'stalled' || i.kind === 'interrupted' || i.kind === 'mission').length;
}
