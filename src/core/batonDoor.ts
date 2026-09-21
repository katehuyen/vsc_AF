/**
 * S-71 — THE DOOR: what the successor's task row looks like, and the words it
 * wakes up to. Pure — the row is described here and opened by the host through
 * the ONE door every run goes through (`tasks.add`), so the park, the budget
 * brake, the concurrency lock and the automation gate are all already on it.
 *
 * ‼️ THE HEADER IS WRITTEN BY THE SYSTEM, NEVER BY THE AGENT. It is what makes
 * the chain carry itself: the successor does not have to remember the baton
 * discipline, its first message tells it. The predecessor's prompt goes
 * underneath, untouched.
 *
 * ‼️ ALWAYS A FRESH SESSION, NEVER A RESUME — carrying the saturated run's
 * context into the next hop defeats the whole point (_REF/handover.md).
 */
import { Baton, successorSurface } from './baton';
import { InteractiveClose, InteractiveTarget } from './launch';
import { normPath } from './util';

export interface DoorRow {
    title: string;
    prompt: string;
    mode: 'headless' | 'interactive';
    /** S-73 — the moment the row may start, when every account was full at the release */
    wakeAt?: number;
    extra: {
        notBefore?: number;
        notBeforeWhy?: string;
        projectId: string | undefined;
        engine?: string;
        model?: string;
        effort?: string;
        permissionMode?: string;
        providerId?: string;
        tier?: string;
        superpowers?: boolean;
        account: string;
        interactiveTarget?: InteractiveTarget;
        interactiveClose?: InteractiveClose;
        workDir?: string;
    };
}

export interface DoorContext {
    /** the agent's display name — the id on the baton is a folder */
    agentName?: string;
    /** the agent's own folder; a run elsewhere (a worktree) is stated as workDir */
    agentDir?: string;
    /** S-78 — the chain's hop ceiling, when set; shown as "hop n/N" */
    maxHops?: number;
    /**
     * S-73 — EVERY ACCOUNT IS FULL at the release: the row is written with the
     * first reset plus the safety buffer as its `notBefore`, so it waits
     * visibly on the board and the pump starts it then (M-10's own machinery —
     * no second timer). Absent = at least one account has room.
     */
    park?: { resetsAt: number; bufferMin: number; refusal?: string };
}

/** S-73 — the moment a parked successor wakes: the first reset plus the safety buffer. */
export function wakeMoment(park: { resetsAt: number; bufferMin: number }): number {
    return park.resetsAt + Math.max(0, park.bufferMin) * 60_000;
}

/** The first message the successor sees: the chain's header, then the predecessor's own words. */
export function successorPrompt(b: Baton, ctx: DoorContext = {}): string {
    const hop = ctx.maxHops && ctx.maxHops > 0 ? `hop ${b.hop}/${ctx.maxHops}` : `hop ${b.hop}`;
    const who = ctx.agentName || b.from.agentId;
    const model = b.inherit.model ? `${b.from.engine}/${b.inherit.model}` : b.from.engine;
    const project = b.from.projectId ? ` · project ${b.from.projectId}` : '';
    return [
        `=== BATON RELAY — chain ${b.chainId} · ${hop} ===`,
        `Predecessor: session ${b.from.sessionId.slice(0, 8)} (${who} · ${model}${project}) ended its run and passed the baton to you.`,
        'The words below are its own — continue the work from there, in this folder and this project; you start fresh, with no memory of its context beyond these words.',
        'If you cannot finish either, pass the baton yourself when your run is ending (_REF/handover.md): write { "prompt": "<what your successor starts from>" } to a file and run',
        '  node af.js baton.pass "@<file>"',
        'Nothing starts while you are alive. The chain ends when the work is done and nobody passes.',
        '---',
        b.prompt
    ].join('\n');
}

const same = (a: string | undefined, b: string | undefined): boolean =>
    !!a && !!b && normPath(a).replace(/[\\/]+$/, '').toLowerCase() === normPath(b).replace(/[\\/]+$/, '').toLowerCase();

/** The successor's task row, surface by surface — one door, `tasks.add`. */
/**
 * ‼️ X-355 — IS THIS HOLD THE RELAY'S OWN HAND-OFF? A successor row is added
 * the moment its predecessor's SESSION ends, a beat before that run's own row
 * closes, so on every leg it meets the per-agent lock for a second or two.
 * That is the door working, not news: the relay speaks for its rows (S-77 —
 * a park, a brake), so the generic "Task parked" line stays quiet for it.
 */
export function relayHandoffHold(t: { id: string; deferredCode?: string }, batons: readonly Baton[]): boolean {
    return String(t.deferredCode ?? '').startsWith('concurrency:agent:') && batons.some(b => b.taskId === t.id);
}

export function successorRow(b: Baton, ctx: DoorContext = {}): DoorRow {
    const surface = successorSurface(b);
    const i = b.inherit;
    const extra: DoorRow['extra'] = {
        // stated even when absent: a row made by the system is NOT in "the
        // window's active project", it is in the predecessor's (tasks.ts addTask)
        projectId: b.from.projectId,
        ...(b.from.engine && b.from.engine !== 'claude' ? { engine: b.from.engine } : {}),
        ...(i.model ? { model: i.model } : {}),
        ...(i.effort ? { effort: i.effort } : {}),
        ...(i.permissionMode ? { permissionMode: i.permissionMode } : {}),
        ...(i.providerId ? { providerId: i.providerId } : {}),
        ...(i.tier ? { tier: i.tier } : {}),
        ...(i.superpowers !== undefined ? { superpowers: i.superpowers } : {}),
        account: b.want.account,
        ...(b.from.cwd && !same(b.from.cwd, ctx.agentDir) ? { workDir: b.from.cwd } : {})
    };
    const park = ctx.park && ctx.park.resetsAt > 0 ? ctx.park : undefined;
    const wakeAt = park ? wakeMoment(park) : undefined;
    if (park && wakeAt) {
        extra.notBefore = wakeAt;
        extra.notBeforeWhy = `baton parked — every account is full${park.refusal ? `: ${park.refusal}` : ''}; `
            + `first reset + ${Math.max(0, park.bufferMin)} min buffer`;
    }
    const title = `Baton — hop ${b.hop} of chain ${b.chainId}`;
    const prompt = successorPrompt(b, ctx);
    const wake = wakeAt ? { wakeAt } : {};
    if (surface === 'headless') { return { title, prompt, mode: 'headless', ...wake, extra }; }
    const target: InteractiveTarget = surface === 'console' ? 'console' : surface === 'external-terminal' ? 'external' : 'vscode';
    return { title, prompt, mode: 'interactive', ...wake, extra: { ...extra, interactiveTarget: target, interactiveClose: 'stay-open' } };
}
