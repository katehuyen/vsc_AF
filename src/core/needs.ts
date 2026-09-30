/**
 * G1 — Approval queue ("Needs You"). One urgency-sorted list of the things the
 * farm is STUCK on: permission waits, browser-step approvals, missions with an
 * open question, cut workflow runs, stalled sessions, Antigravity drift.
 *
 * ‼️ THE ADMISSION TEST — "if I never touch it, does the farm stay stuck?"
 * Only rows that pass it belong here. Facts about things that already happened
 * (a blown budget), proposals (an instruction suggestion), states that resolve
 * themselves (a task parked for capacity) and idle sessions are NEWS, not work:
 * they go to Notices, which is built to be read and kept. A page that mixes the
 * two teaches you to ignore it — the one failure a blocking queue cannot afford.
 *
 * Pure data in, pure data out — the panel and the status bar both render here.
 */
import { askActions, WorkflowQuestion } from './workflowAsk';
import { humanAskSentence } from './humanAsk';
import { ConsoleNeedAsk, consoleNeedItems } from './consoleNeeds';
import { type OverduePublish, publishNeedItems } from './calendarSignals';
import { type FaultEpisode, faultNeedItems } from './engineFaultWatch';

export type NeedKind =
    | 'permission'        // a live session is blocked on a permission dialog
    | 'browser-approval'  // a browser workflow step waits for Run/Reject
    | 'interrupted'       // a workflow run was cut by a window close — resume?
    | 'stalled'           // a working session stopped emitting events
    | 'conflict'          // Antigravity two-sided drift needs reconciling
    | 'mission'           // a mission waits on the human (question / interrupted)
    | 'question'          // M-46 — a workflow supervisor asks the human
    | 'console-question'  // K-45 — a Console question no timer will answer
    | 'publish-overdue'   // M-61 — a content calendar publish past its time, still open
    | 'engine-fault';     // X-427 — a relay leg's engine fails and only a person can move it

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
    /** interrupted: the workflow run to resume/dismiss. */
    runId?: string;
    /** mission: the mission run waiting on the human. */
    missionRunId?: string;
    /** question: the workflow supervisor's open question */
    questionId?: string;
    /** console-question: the Console card and the ask it is parked on */
    consoleId?: string;
    requestId?: string;
    /** publish-overdue: the workflow step that publishes the note (filePath) */
    workflowId?: string;
    stepIndex?: number;
}

export interface NeedItem {
    /** Lower = more urgent; the queue is sorted by this, then by recency. */
    urgency: number;
    kind: NeedKind;
    agentName: string;
    title: string;
    /** ‼️ THE ROW'S LINE, and only that. It is cut to a row on purpose. */
    detail: string;
    /**
     * ‼️ U-118 — THE SAME THING WHOLE: what an opened row and a hover panel
     * carry.
     *
     * The queue was drawing `lastPrompt`, which the live monitor cuts to NINETY
     * CHARACTERS for a card, and then cutting it again with an ellipsis. So the
     * one page whose entire job is "what is the farm stuck on" could not show
     * what the agent had actually said — the answer existed four thousand
     * characters deep in `lastPromptFull` and was thrown away one field before
     * it was drawn.
     *
     * Absent when the row's whole content already fits its line: a body that
     * repeats the detail is a caret that opens on nothing, and a reader learns
     * in two clicks not to trust the caret at all.
     */
    body?: string;
    ts: number;
    ref: NeedRef;
    actions: NeedAction[];
}

const URGENCY: Record<NeedKind, number> = {
    'permission': 0,
    'mission': 1,
    'question': 1,
    'console-question': 1,
    'browser-approval': 1,
    'interrupted': 2,
    'stalled': 2,
    'conflict': 3,
    'publish-overdue': 3,
    'engine-fault': 2
};

export interface PendingApproval {
    id: string;
    title: string;
    url: string;
    goal: string;
    createdAt: number;
    /** 'browser' = a browser step wants to run; 'approval' = a workflow human-gate; 'upload' = a media step wants to send local files. */
    kind?: 'browser' | 'approval' | 'upload';
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

    add(info: { title: string; url?: string; goal?: string; kind?: PendingApproval['kind'] }): { id: string; promise: Promise<boolean> } {
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
        /** ‼️ U-118 — the same prompt WHOLE (LiveSession.lastPromptFull). The
         *  row draws `lastPrompt`; the opened body draws this. Reading only the
         *  first was the defect. */
        lastPromptFull?: string;
        currentTool?: string;
        lastEventTs: number;
        transcriptPath?: string;
    }[];
    approvals: PendingApproval[];
    /** Only `antigravity` warnings are read — every other insight is news, and
     *  news is posted to Notices by the host (see the admission test above). */
    insights: {
        severity: string;
        agentName: string;
        agentId?: string;
        category: string;
        message: string;
        filePath?: string;
        suggestionId?: string;
    }[];
    /** F1: workflow runs cut by a window close, awaiting a resume decision. */
    interruptedRuns?: {
        runId: string;
        workflowTitle: string;
        stepIndex: number;
        stepTitle: string;
    }[];
    /** K-45 — Console questions no timer will answer (src/core/consoleNeeds.ts) */
    consoleAsks?: ConsoleNeedAsk[];
    /** M-61 — the content calendar's overdue publishes (src/core/calendarSignals.ts) */
    overduePublishes?: OverduePublish[];
    /** X-427 — relay legs whose engine fault needs a person (src/core/engineFaultWatch.ts) */
    engineFaults?: FaultEpisode[];
    /** M-46 — a workflow supervisor's open questions (src/core/workflowAsk.ts) */
    workflowQuestions?: WorkflowQuestion[];
    /** Missions blocked on the human: an open question or an interrupted run. */
    missionWaits?: {
        runId: string;
        missionTitle: string;
        flavor: 'question' | 'interrupted';
        detail: string;
        ts: number;
    }[];
}

/**
 * ‼️ U-118 — THE BODY IS WHAT THE ROW CANNOT SAY, or nothing at all.
 *
 * A caret that opens onto the same sentence the row already shows is worse than
 * no caret: the reader learns in two clicks that opening a row tells them
 * nothing, and then stops opening the ones that would have. So a body is kept
 * only when it genuinely carries more than the line — longer, or holding a line
 * break the row flattened away.
 */
function bodyOf(line: string, whole: string | undefined): string | undefined {
    const full = (whole ?? '').trim();
    if (!full) { return undefined; }
    const shown = (line ?? '').trim();
    return full !== shown && (full.length > shown.length || /[\r\n]/.test(full))
        ? full : undefined;
}

/** How much of a detail a ROW is allowed to be. Long enough to recognise the
 *  thing, short enough that ten blocked rows still read as a list. */
const ROW_DETAIL = 140;

/**
 * ‼️ U-118 — ONE READING STANDARD ON EVERY ROW, not just the two that were
 * reported.
 *
 * A queue row is a LINE and an opened row is the TEXT, and which of the six
 * kinds a row happens to be must not change that: the user's own instruction
 * was "if we do it on one side, do not let the other side differ". So every
 * detail goes through here — a line for the row, the whole thing for the body,
 * and no body at all when the line already IS the whole thing.
 */
function split(text: string): { detail: string; body?: string } {
    const full = (text ?? '').trim();
    const flat = full.replace(/\s*[\r\n]+\s*/g, ' ');
    if (flat.length <= ROW_DETAIL && flat === full) { return { detail: full }; }
    return { detail: flat.length > ROW_DETAIL ? flat.slice(0, ROW_DETAIL - 1) + '…' : flat, body: full };
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
                body: bodyOf(s.lastPrompt ?? '', s.lastPromptFull),
                ts: s.lastEventTs,
                ref: { sessionId: s.sessionId, transcriptPath: s.transcriptPath },
                actions: [
                    // ‼️ U-119 — ANSWER IT FROM HERE. This row used to offer
                    // "⌨ Terminal": a signpost. The queue knew an agent was
                    // blocked ON THE USER and its best offer was to send them
                    // looking for a window — which is how a session sat blocked
                    // for an hour and a half on 2026-08-28 with nothing said.
                    { id: 'permission-allow', label: '✅ Allow' },
                    { id: 'permission-deny', label: '❌ Reject' },
                    // The signpost stays BEHIND them, and it is not redundant:
                    // an external OS terminal is not ours to type into, and a
                    // prompt that does not take the keys we send still has to
                    // be answerable by hand.
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
                // ‼️ A STALLED ROW SHOWS THE TOOL, so the prompt behind it is
                // the thing the reader is missing — the body carries it either
                // way, and with the tool on the line the whole prompt is new.
                body: s.currentTool
                    ? (s.lastPromptFull ?? s.lastPrompt ?? '').trim() || undefined
                    : bodyOf(s.lastPrompt ?? '', s.lastPromptFull),
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
            ...split(m.detail),
            ts: m.ts,
            ref: { missionRunId: m.runId },
            actions: m.flavor === 'question'
                ? [{ id: 'mission-answer', label: 'Answer…' }, { id: 'open-missions', label: 'Missions' }]
                : [{ id: 'mission-resume', label: 'Resume' }, { id: 'mission-dismiss', label: 'Dismiss' },
                   { id: 'open-missions', label: 'Missions' }]
        });
    }

    for (const q of input.workflowQuestions ?? []) {
        items.push({
            urgency: URGENCY.question, kind: 'question', agentName: 'workflow',
            title: `Workflow "${q.workflowTitle}" — its supervisor asks`,
            ...split(q.question), ts: q.askedAt, ref: { questionId: q.id }, actions: askActions(q)
        });
    }
    items.push(...consoleNeedItems(input.consoleAsks ?? [], URGENCY['console-question']));
    items.push(...publishNeedItems(input.overduePublishes ?? [], URGENCY['publish-overdue']));
    items.push(...faultNeedItems(input.engineFaults ?? [], URGENCY['engine-fault']));

    // S-108 — the detail is the same sentence the waiting task row and farm.waits carry
    for (const a of input.approvals) {
        const kind = a.kind ?? 'browser';
        items.push({
            urgency: URGENCY['browser-approval'],
            kind: 'browser-approval',
            agentName: kind === 'browser' ? 'browser' : 'workflow',
            title: kind === 'approval' ? `Approval needed — "${a.title}"`
                : kind === 'upload' ? `A media step wants to upload to ${a.title}`
                    : `Browser step "${a.title}" wants to run`,
            ...split(humanAskSentence({ kind, title: a.title, url: a.url, goal: a.goal })),
            ts: a.createdAt,
            ref: { approvalId: a.id },
            actions: [
                { id: 'approve', label: kind === 'approval' ? 'Approve' : kind === 'upload' ? 'Upload' : 'Run' },
                { id: 'reject', label: kind === 'upload' ? 'Stop the step' : 'Reject' }
            ]
        });
    }

    // Antigravity drift is the one insight that passes the admission test: the
    // two sides stay out of step until a human reconciles them — no clock, no
    // agent and no retry will ever clear it.
    for (const ins of input.insights) {
        if (ins.category === 'antigravity' && ins.severity === 'warning') {
            items.push({
                urgency: URGENCY.conflict,
                kind: 'conflict',
                agentName: ins.agentName,
                title: `Antigravity conflict — ${ins.agentName}`,
                ...split(ins.message),
                ts: 0,
                ref: { agentId: ins.agentId, filePath: ins.filePath },
                actions: [{ id: 'sync-antigravity', label: 'Reconcile…' }]
            });
        }
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
export function isBlocking(i: NeedItem): boolean {
    return i.kind === 'permission' || i.kind === 'browser-approval'
        || i.kind === 'stalled' || i.kind === 'interrupted' || i.kind === 'mission' || i.kind === 'question'
        || i.kind === 'console-question' || i.kind === 'engine-fault';
}

export function blockingCount(items: NeedItem[]): number {
    return items.filter(isBlocking).length;
}

// ---------------------------------------------------------------------------
// Clearing rows
// ---------------------------------------------------------------------------

/**
 * Identity of "the same problem" — deliberately WITHOUT any timestamp or
 * message text, because those move while the problem stands still.
 *
 * ‼️ THIS IS WHAT MAKES CLEARING SELF-HEALING. A cleared key stays hidden only
 * for as long as the row keeps being produced; the moment the condition ends,
 * the row stops appearing, `filterDismissedNeeds` reports the key as stale and
 * the host drops it. So the SAME wait stays cleared for its whole life, and the
 * NEXT one — a new permission prompt from the same session, the same session
 * stalling again — arrives with a clean slate. You can never permanently blind
 * yourself to a condition by clearing it once.
 */
export function needKey(item: NeedItem): string {
    const r = item.ref;
    switch (item.kind) {
        case 'permission':
        case 'stalled':
            return `${item.kind}|${r.sessionId ?? r.transcriptPath ?? '?'}`;
        case 'browser-approval':
            return `browser-approval|${r.approvalId ?? '?'}`;
        case 'mission':
            return `mission|${r.missionRunId ?? '?'}`;
        case 'question':
            return `question|${r.questionId ?? '?'}`;
        case 'console-question':
            return `console-question|${r.consoleId ?? '?'}|${r.requestId ?? '?'}`;
        case 'interrupted':
            return `interrupted|${r.runId ?? '?'}`;
        case 'conflict':
            return `conflict|${r.agentId ?? '*'}|${r.filePath ?? '*'}`;
        case 'publish-overdue':
            return `publish-overdue|${r.filePath ?? '?'}`;
        case 'engine-fault':
            return `engine-fault|${r.sessionId ?? '?'}`;
    }
}

/**
 * A row holding a LIVE promise cannot be cleared: `browser-approval` has an
 * agent parked on `await`, and hiding the row would leave it parked forever
 * with no surface left to answer from. Its clear is the Reject button, which
 * settles the promise honestly. Everything else is safe to hide.
 */
export function isClearable(item: NeedItem): boolean {
    return item.kind !== 'browser-approval' && item.kind !== 'question';
}

export interface NeedsDismissResult {
    visible: NeedItem[];
    /** Rows currently produced but hidden by a clear — shown as "N cleared". */
    hiddenCount: number;
    /** Stored keys nothing produces any more; the host prunes them. */
    staleKeys: string[];
}

export function filterDismissedNeeds(
    items: NeedItem[],
    dismissed: Record<string, number>
): NeedsDismissResult {
    const live = new Set(items.map(needKey));
    const visible: NeedItem[] = [];
    let hiddenCount = 0;
    for (const item of items) {
        if (dismissed[needKey(item)] && isClearable(item)) { hiddenCount++; }
        else { visible.push(item); }
    }
    return {
        visible,
        hiddenCount,
        staleKeys: Object.keys(dismissed).filter(k => !live.has(k))
    };
}
