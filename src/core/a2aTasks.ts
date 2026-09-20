import { a2aId, Envelope, readEnvelope, withLock, writeEnvelope } from './a2aStore';
import { A2AStrictness, A2A_STRICTNESS, HumanDirective, NoteQuery } from './a2aNotes';

/**
 * N-3 — WORK ONE AGENT HANDS TO ANOTHER. Where a note is read by whoever it
 * fits, a task is CLAIMED: exactly one agent owns it, and the whole design is
 * about what happens when that agent does not come back.
 *
 * ‼️ A CLAIM IS A LEASE, NOT A DEED. An agent that claims a task and is killed
 * — a window reload, a quota wall, a closed laptop — would otherwise hold it
 * for ever, and the task would look busy while nothing was working on it. So a
 * claim expires: `leaseExpiresAt` is pushed forward by every heartbeat, and a
 * task whose lease has run out goes back to `queued` for somebody else. The
 * heartbeat carries `progress` so the difference between "working, slowly" and
 * "gone" is visible without waiting for the lease to die.
 *
 * ‼️ AND A LOOP IS THE FAILURE THIS DESIGN INVITES. Agent A hands to B, B
 * hands back to A, and the farm burns a plan on a task nobody finishes.
 * `handoffDepth` counts the hops; past `MAX_HANDOFF_DEPTH` the task is
 * `blocked` rather than passed on again — blocked, not cancelled, because the
 * work may be real and the routing wrong, and that is a person's call.
 */

export type A2ATaskState =
    | 'queued' | 'claimed' | 'running' | 'done' | 'failed' | 'blocked' | 'cancelled';
export const A2A_TASK_STATES: A2ATaskState[] =
    ['queued', 'claimed', 'running', 'done', 'failed', 'blocked', 'cancelled'];
/** Reached the end: never re-queued, never swept back into life. */
export const A2A_TERMINAL: A2ATaskState[] = ['done', 'failed', 'cancelled'];

/** How long a claim survives without a heartbeat. */
export const LEASE_MS = 30 * 60_000;
/** The third hop is one too many — see the loop guard above. */
export const MAX_HANDOFF_DEPTH = 3;

export interface TaskClaim {
    agent: string;
    sessionId?: string;
    leaseExpiresAt: number;
    /** the claimant's own word on where it has got to */
    progress: string;
}

export interface A2ATask {
    id: string;
    ts: number;
    fromAgent: string;
    fromSessionId?: string;
    /** the note this grew out of (fromNote), when it did */
    sourceNoteId?: string;
    /** the user's own Work Queue item behind it, when there is one */
    sourceQueueItemId?: string;
    /** the task that handed this one on — the loop guard's trail */
    parentTaskId?: string;
    handoffDepth: number;
    project: string;
    workdir: string;
    topic: string;
    targetRole: string;
    strictness: A2AStrictness;
    /** capabilities the claimant must have; all of them, or the claim is refused */
    requires: string[];
    title: string;
    instructions: string;
    expectedOutput: string;
    /** 0 = no ceiling of its own */
    maxCostUSD: number;
    maxTurns: number;
    state: A2ATaskState;
    claimedBy?: TaskClaim;
    resultSummary?: string;
    humanDirective?: HumanDirective;
}

export interface A2ATaskInput {
    fromAgent: string;
    fromSessionId?: string;
    title: string;
    instructions?: string;
    expectedOutput?: string;
    sourceNoteId?: string;
    sourceQueueItemId?: string;
    parentTaskId?: string;
    handoffDepth?: number;
    project?: string;
    workdir?: string;
    topic?: string;
    targetRole?: string;
    strictness?: A2AStrictness;
    requires?: string[];
    maxCostUSD?: number;
    maxTurns?: number;
}

const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;
const num = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [];

export function makeTask(input: A2ATaskInput, now = Date.now()): A2ATask {
    return {
        id: a2aId('t', now),
        ts: now,
        fromAgent: str(input.fromAgent, 'unknown'),
        ...(input.fromSessionId ? { fromSessionId: input.fromSessionId } : {}),
        ...(input.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
        ...(input.sourceQueueItemId ? { sourceQueueItemId: input.sourceQueueItemId } : {}),
        ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
        handoffDepth: num(input.handoffDepth),
        project: str(input.project, '*'),
        workdir: str(input.workdir, '*'),
        topic: str(input.topic, '*'),
        targetRole: str(input.targetRole, '*'),
        strictness: A2A_STRICTNESS.includes(input.strictness as A2AStrictness)
            ? input.strictness as A2AStrictness : 'preferred',
        requires: list(input.requires),
        title: str(input.title, '(untitled)'),
        instructions: typeof input.instructions === 'string' ? input.instructions : '',
        expectedOutput: typeof input.expectedOutput === 'string' ? input.expectedOutput : '',
        maxCostUSD: num(input.maxCostUSD),
        maxTurns: num(input.maxTurns),
        state: 'queued'
    };
}

export function normaliseTask(row: Partial<A2ATask> & { id: string }): A2ATask {
    return {
        ...makeTask({ fromAgent: str(row.fromAgent, 'unknown'), title: str(row.title, '(untitled)') }, num(row.ts)),
        ...row,
        id: row.id,
        ts: num(row.ts),
        handoffDepth: num(row.handoffDepth),
        requires: list(row.requires),
        maxCostUSD: num(row.maxCostUSD),
        maxTurns: num(row.maxTurns),
        state: A2A_TASK_STATES.includes(row.state as A2ATaskState)
            ? row.state as A2ATaskState : 'queued'
    };
}

export interface ClaimantView {
    agent: string;
    sessionId?: string;
    role?: string;
    project?: string;
    workdir?: string;
    /** what this agent can do — every `requires` must be in here */
    capabilities?: string[];
}

/** Why a claim was refused, in the words the refusal is reported in. */
export type ClaimRefusal =
    | 'no such task'
    | 'already claimed'
    | 'not open for claiming'
    | 'missing a required capability'
    | 'the coordinates are not yours'
    | 'the store is busy';

function axis(taskValue: string, want: string | undefined): 'hit' | 'wild' | 'miss' {
    if (!want) { return 'wild'; }
    if (taskValue === '*' || want === '*') { return 'wild'; }
    return taskValue.toLowerCase() === want.toLowerCase() ? 'hit' : 'miss';
}

/** Whether this agent may take this task at all, by coordinates and capability. */
export function claimable(task: A2ATask, by: ClaimantView): ClaimRefusal | undefined {
    const have = new Set((by.capabilities ?? []).map(c => c.toLowerCase()));
    if (task.requires.some(r => !have.has(r.toLowerCase()))) { return 'missing a required capability'; }
    const axes = [
        axis(task.project, by.project), axis(task.workdir, by.workdir), axis(task.targetRole, by.role)
    ];
    if (task.strictness === 'hard' && axes.includes('miss')) { return 'the coordinates are not yours'; }
    if (task.strictness === 'preferred' && !axes.includes('hit') && axes.includes('miss')) {
        return 'the coordinates are not yours';
    }
    return undefined;
}

/** A lease that has run out makes a task available again, whatever it says. */
export function leaseExpired(task: A2ATask, now: number): boolean {
    return (task.state === 'claimed' || task.state === 'running')
        && !!task.claimedBy && task.claimedBy.leaseExpiresAt <= now;
}

export function isOpen(task: A2ATask, now: number): boolean {
    return task.state === 'queued' || leaseExpired(task, now);
}

/**
 * ‼️ ZOMBIES ARE COLLECTED ON EVERY READ, not on a timer. A timer is a thing
 * that can be not running; a rule applied at the moment somebody looks cannot
 * be. A task whose lease died goes back to `queued` — unless it has already
 * been handed on too many times, in which case the loop guard blocks it
 * instead of letting the farm pass it round for ever.
 */
export function reap(tasks: A2ATask[], now: number): { tasks: A2ATask[]; reaped: number } {
    let reaped = 0;
    const out = tasks.map(t => {
        if (!leaseExpired(t, now)) { return t; }
        reaped++;
        const depth = t.handoffDepth + 1;
        const { claimedBy: _gone, ...rest } = t;
        return depth >= MAX_HANDOFF_DEPTH
            ? { ...rest, handoffDepth: depth, state: 'blocked' as A2ATaskState,
                resultSummary: `Handed on ${depth} times without finishing — a person decides where this goes.` }
            : { ...rest, handoffDepth: depth, state: 'queued' as A2ATaskState };
    });
    return { tasks: out, reaped };
}

export interface TaskQuery extends NoteQuery {
    state?: A2ATaskState;
    /** only the ones this agent could actually take */
    claimableBy?: ClaimantView;
}

export function matchTasks(tasks: A2ATask[], q: TaskQuery, now = Date.now()): A2ATask[] {
    return tasks
        .filter(t => !q.state || t.state === q.state)
        .filter(t => !q.project || t.project === '*' || t.project.toLowerCase() === q.project.toLowerCase())
        .filter(t => !q.topic || t.topic === '*' || t.topic.toLowerCase() === q.topic.toLowerCase())
        .filter(t => !q.claimableBy || (isOpen(t, now) && !claimable(t, q.claimableBy)))
        .sort((a, b) => b.ts - a.ts);
}

export class A2ATasksStore {
    tasks: A2ATask[] = [];
    private rev = 0;

    constructor(private file: string) { }

    load(now = Date.now()): void {
        const env = readEnvelope<A2ATask>(this.file, r => normaliseTask(r as A2ATask & { id: string }));
        this.tasks = reap(env.items, now).tasks;
        this.rev = env.rev;
    }

    private mutate<T>(fn: (tasks: A2ATask[]) => { tasks: A2ATask[]; out: T }, now: number): T | undefined {
        return withLock(this.file, () => {
            const disk = readEnvelope<A2ATask>(this.file, r => normaliseTask(r as A2ATask & { id: string }));
            const r = fn(reap(disk.items, now).tasks);
            const env: Envelope<A2ATask> = { rev: disk.rev + 1, items: r.tasks };
            if (!writeEnvelope(this.file, env)) { return undefined as T; }
            this.tasks = r.tasks;
            this.rev = env.rev;
            return r.out;
        });
    }

    add(input: A2ATaskInput, now = Date.now()): A2ATask | undefined {
        const task = makeTask(input, now);
        return this.mutate(tasks => ({ tasks: [task, ...tasks], out: task }), now);
    }

    get(id: string): A2ATask | undefined { return this.tasks.find(t => t.id === id); }

    list(q: TaskQuery = {}, now = Date.now()): A2ATask[] {
        this.load(now);
        return matchTasks(this.tasks, q, now);
    }

    /**
     * ‼️ THE ONE OPERATION THE WHOLE FILE IS SHAPED AROUND. Two agents asking
     * at the same moment must not both get it, so the decision is made INSIDE
     * the lock, against what is on disk at that instant — never against what
     * this process read a moment ago.
     */
    claim(
        id: string, by: ClaimantView, now = Date.now(), leaseMs = LEASE_MS
    ): { task: A2ATask } | { refused: ClaimRefusal } {
        const r = this.mutate<{ task: A2ATask } | { refused: ClaimRefusal }>(tasks => {
            const task = tasks.find(t => t.id === id);
            if (!task) { return { tasks, out: { refused: 'no such task' as ClaimRefusal } }; }
            if (!isOpen(task, now)) {
                // a finished task keeps its claim as history — "already claimed" is only a LIVE lease
                const live = task.state === 'claimed' || task.state === 'running';
                return { tasks, out: { refused: (live ? 'already claimed' : 'not open for claiming') as ClaimRefusal } };
            }
            const no = claimable(task, by);
            if (no) { return { tasks, out: { refused: no } }; }
            const claimed: A2ATask = {
                ...task, state: 'claimed',
                claimedBy: {
                    agent: by.agent, ...(by.sessionId ? { sessionId: by.sessionId } : {}),
                    leaseExpiresAt: now + leaseMs, progress: ''
                }
            };
            return { tasks: tasks.map(t => t.id === id ? claimed : t), out: { task: claimed } };
        }, now);
        return r ?? { refused: 'the store is busy' };
    }

    /** Alive, and here is where it got to. Pushes the lease forward. */
    heartbeat(
        id: string, agent: string, progress = '', now = Date.now(), leaseMs = LEASE_MS
    ): A2ATask | undefined {
        return this.mutate(tasks => {
            const out = tasks.map(t => t.id === id && t.claimedBy?.agent === agent
                ? { ...t, state: (t.state === 'claimed' ? 'running' : t.state) as A2ATaskState,
                    claimedBy: { ...t.claimedBy, leaseExpiresAt: now + leaseMs, progress } as TaskClaim }
                : t);
            return { tasks: out, out: out.find(t => t.id === id) };
        }, now);
    }

    /** Reached an end. Only the holder may finish it, and only once. */
    finish(
        id: string, agent: string, state: 'done' | 'failed' | 'blocked', resultSummary = '', now = Date.now()
    ): A2ATask | undefined {
        return this.mutate(tasks => {
            const out = tasks.map(t => t.id === id && t.claimedBy?.agent === agent
                ? { ...t, state, resultSummary }
                : t);
            return { tasks: out, out: out.find(t => t.id === id) };
        }, now);
    }

    /** The user's call: stop it, whoever holds it. */
    cancel(id: string, why = '', now = Date.now()): A2ATask | undefined {
        return this.mutate(tasks => {
            const out = tasks.map(t => t.id === id && !A2A_TERMINAL.includes(t.state)
                ? { ...t, state: 'cancelled' as A2ATaskState, resultSummary: why }
                : t);
            return { tasks: out, out: out.find(t => t.id === id) };
        }, now);
    }

    /**
     * Pass it on — a NEW task carrying the trail, not the same row moved. The
     * original is closed as handed off, so the history of who tried what
     * survives instead of being overwritten by whoever held it last.
     */
    handoff(
        id: string, to: { targetRole: string; requires?: string[]; project?: string; workdir?: string },
        by: string, now = Date.now(),
        /** `override` is HUMAN authority: no loop guard, and the new task starts the count again —
         *  a person deciding where blocked work goes is what the guard was waiting for. */
        opts: { override?: boolean; why?: string } = {}
    ): { task: A2ATask } | { refused: string } {
        const r = this.mutate<{ task: A2ATask } | { refused: string }>(tasks => {
            const task = tasks.find(t => t.id === id);
            if (!task) { return { tasks, out: { refused: 'no such task' } }; }
            const depth = opts.override ? 0 : task.handoffDepth + 1;
            if (!opts.override && depth >= MAX_HANDOFF_DEPTH) {
                const blocked = tasks.map(t => t.id === id
                    ? { ...t, state: 'blocked' as A2ATaskState, handoffDepth: depth,
                        resultSummary: `Handed on ${depth} times — a person decides where this goes.` }
                    : t);
                return { tasks: blocked, out: { refused: `loop guard: ${depth} handoffs is the ceiling` } };
            }
            const next: A2ATask = {
                ...makeTask({
                    fromAgent: by, title: task.title, instructions: task.instructions,
                    expectedOutput: task.expectedOutput, project: to.project ?? task.project,
                    workdir: to.workdir ?? task.workdir,
                    topic: task.topic, strictness: task.strictness, maxCostUSD: task.maxCostUSD,
                    maxTurns: task.maxTurns, parentTaskId: task.id, handoffDepth: depth,
                    targetRole: to.targetRole, requires: to.requires ?? task.requires,
                    ...(task.sourceNoteId ? { sourceNoteId: task.sourceNoteId } : {}),
                    ...(task.sourceQueueItemId ? { sourceQueueItemId: task.sourceQueueItemId } : {})
                }, now),
                // the user's word travels with the work when the user is the one moving it
                ...(opts.override && task.humanDirective ? { humanDirective: task.humanDirective } : {})
            };
            const closed = tasks.map(t => t.id === id
                ? { ...t, state: 'done' as A2ATaskState,
                    resultSummary: `Handed on to ${to.targetRole} (${next.id})${opts.why ? ' — ' + opts.why : ''}.` }
                : t);
            return { tasks: [next, ...closed], out: { task: next } };
        }, now);
        return r ?? { refused: 'the store is busy' };
    }

    /** The user's word, which outranks every rule the claimant applies; `undefined` takes it off. */
    direct(id: string, directive: HumanDirective | undefined, now = Date.now()): A2ATask | undefined {
        return this.mutate(tasks => {
            const out = tasks.map(t => {
                if (t.id !== id) { return t; }
                const { humanDirective: _old, ...rest } = t;
                return directive ? { ...rest, humanDirective: directive } : rest;
            });
            return { tasks: out, out: out.find(t => t.id === id) };
        }, now);
    }
}
