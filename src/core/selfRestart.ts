/**
 * X-230 — THE FARM RESTARTING ITSELF, so a new build can be loaded with nobody
 * at the desk.
 *
 * An agent that develops this extension packages a `.vsix`, installs it, and
 * then can do nothing with it: VS Code keeps the running code in the extension
 * host's memory, so until the host (or the window) is restarted the new build is
 * on disk and nowhere else. Until now the developer rule ended with "the user
 * only restarts VS Code" — which during an unattended night shift is not a
 * friction, it is a DEADLOCK: the loop stops until a human comes back.
 *
 * VS Code already has both commands. What was missing was a way to reach them
 * that does not destroy more than it repairs. Two measured facts shape all of
 * this, and the tests pin both:
 *
 * ‼️ 1. THE BRIDGE WRITES ITS RESPONSE AFTER THE HANDLER RETURNS. `processBridge`
 * dispatches, THEN writes `<id>.response.json`, THEN unlinks `<id>.request.json`.
 * A handler that restarts the host inside itself dies with its own request still
 * on disk, and the next activation reads it and restarts again — a boot loop
 * that a long `--timeout` cannot break, because the caller that would have
 * cleaned the file up is still waiting. So a plan never restarts synchronously:
 * it carries a DELAY the caller can read, the caller's response is written in
 * that gap, and a cooldown stamp — written to disk, therefore surviving the
 * death — refuses a second restart that arrives inside the window. The cooldown
 * is unconditional. `force` is about live sessions; the loop is about the
 * bridge, and no argument may open it.
 *
 * ‼️ 2. THE TWO COMMANDS DESTROY DIFFERENT THINGS. A Console session is a
 * `cp.spawn` child with piped stdio whose handle lives in `ConsoleHost`'s map —
 * in the extension host's own memory. Restarting the host loses every live one
 * of them. An integrated terminal belongs to the workbench, not to the extension
 * host: it survives a host restart and dies only with the window. That asymmetry
 * is not a detail, it is the whole autonomous path — an agent running in a
 * terminal can restart the extension host under itself and live to verify the
 * new version, while the same call from a Console session would be suicide.
 *
 * ‼️ 3. AND THE BRIDGE CAN NEVER BLOCK. `processBridge` is single-file
 * (`bridgeBusy`): a handler that waited for the window to go quiet would freeze
 * every other agent's every op for as long as it waited. So waiting is never
 * done INSIDE the call — it is ARMED and reported. The answer says which
 * decision was taken, what is being waited for and where to watch it
 * (`farm.health`), so a caller that is prepared to wait can wait knowingly, and
 * one that is not can say `when: 'now'` and be refused honestly.
 */

export type RestartKind = 'extensionHost' | 'window';

/** `auto` (the default) restarts an empty window and arms a busy one; `now`
 *  refuses rather than defer; `idle` always waits for quiet; `cancel` calls off
 *  whatever is armed. */
export type RestartWhen = 'auto' | 'now' | 'idle' | 'cancel';

export const RESTART_COMMANDS: Record<RestartKind, string> = {
    extensionHost: 'workbench.action.restartExtensionHost',
    window: 'workbench.action.reloadWindow'
};

/** The boot-loop guard's window. Long enough to cover an activation (a restart
 *  is live again in ~2–5s), short enough that an agent's build-install-restart
 *  cycle never notices it. */
export const RESTART_COOLDOWN_MS = 20_000;
/** The gap the bridge's own response is written in. */
export const RESTART_DELAY_MS = 600;
export const RESTART_DELAY_MIN = 100;
export const RESTART_DELAY_MAX = 10_000;

export interface RestartBlocker {
    kind: 'console' | 'terminal';
    id: string;
    name: string;
    status: string;
}

export interface ArmedRestart {
    kind: RestartKind;
    armedAt: number;
    delayMs: number;
    waitingFor: RestartBlocker[];
    /** ‼️ X-231 — THE SENTENCE, KEPT. The plan says why it is waiting; without it on
     *  the record `farm.waits` would have to write a SECOND sentence about the same
     *  wait, and two sentences about one fact is how a surface and an op come to
     *  disagree. Nothing here re-words it — it is carried. */
    reason?: string;
    /** ‼️ X-232 — this plan was asked to TAKE ITS CONSOLE SESSIONS UP AGAIN, and
     *  it fires by that rule: what a resume can save was never a reason to wait,
     *  so re-asking the question at firing time would be a different question. */
    resume?: boolean;
}

export interface RestartWorld {
    now: number;
    /** Live-or-dead console sessions as the host lists them; the dead ones are
     *  filtered here rather than by the caller, so every surface agrees on what
     *  "live" means. */
    sessions: { id: string; agentName?: string; status: string; sessionId?: string }[];
    /** The window's integrated terminals, by name. */
    terminals: { name: string }[];
    /** When this window last restarted itself, read back from disk. */
    lastRestartAt?: number | null;
    armed?: ArmedRestart | null;
}

export interface RestartAsk {
    kind: RestartKind;
    when?: RestartWhen;
    force?: boolean;
    delayMs?: unknown;
    /** X-232 — bring the live console sessions back on the other side (consoleRevive.ts). */
    resume?: boolean;
}

export type RestartPlan =
    | {
        decision: 'restarting'; kind: RestartKind; command: string;
        delayMs: number; killed: RestartBlocker[];
    }
    | {
        decision: 'armed'; kind: RestartKind; command: string; delayMs: number;
        armedAt: number; waitingFor: RestartBlocker[]; reason: string; pollWith: 'farm.health';
    }
    | { decision: 'cancelled'; kind: RestartKind; was: ArmedRestart | null }
    | { decision: 'refused'; kind: RestartKind; reason: string; retryInMs?: number };

/** A console session whose process is gone cannot be lost twice. */
const SESSION_DEAD = new Set(['ended', 'error']);

export function clampRestartDelay(v: unknown): number {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : RESTART_DELAY_MS;
    return Math.min(RESTART_DELAY_MAX, Math.max(RESTART_DELAY_MIN, Math.round(n)));
}

/**
 * What this command would take down, right now. The terminals are counted for a
 * window reload only — see the header: they are not the extension host's.
 */
export function liveBlockers(world: RestartWorld, kind: RestartKind, resume = false): RestartBlocker[] {
    const out: RestartBlocker[] = (world.sessions ?? [])
        .filter(s => !SESSION_DEAD.has(String(s.status)))
        // ‼️ X-232 — A SESSION THE ENGINE HAS NAMED IS TAKEN UP AGAIN on the
        // other side, so it is not a loss to weigh against the restart. One it
        // never named has nothing to be resumed BY, and is still every bit the
        // loss it was.
        .filter(s => !(resume && s.sessionId))
        .map(s => ({
            kind: 'console' as const,
            id: s.id,
            name: s.agentName || s.id,
            status: String(s.status)
        }));
    if (kind === 'window') {
        for (const t of world.terminals ?? []) {
            out.push({ kind: 'terminal', id: `terminal:${t.name}`, name: t.name, status: 'open' });
        }
    }
    return out;
}

const describe = (blockers: RestartBlocker[]): string => {
    const consoles = blockers.filter(b => b.kind === 'console');
    const terminals = blockers.filter(b => b.kind === 'terminal');
    const parts: string[] = [];
    if (consoles.length) {
        parts.push(`${consoles.length} live console session(s) (${consoles.map(b => b.name).join(', ')})`);
    }
    if (terminals.length) {
        parts.push(`${terminals.length} open terminal(s) (${terminals.map(b => b.name).join(', ')})`);
    }
    return parts.join(' and ');
};

/**
 * The whole decision, as data. Nothing here touches VS Code, so the rule can be
 * read and tested without a window — and the op layer is left with three jobs:
 * fire, arm, or report the refusal.
 */
export function planRestart(ask: RestartAsk, world: RestartWorld): RestartPlan {
    const kind: RestartKind = ask.kind === 'window' ? 'window' : 'extensionHost';
    const when: RestartWhen = ask.when ?? 'auto';
    const command = RESTART_COMMANDS[kind];
    const delayMs = clampRestartDelay(ask.delayMs);

    if (when === 'cancel') {
        return { decision: 'cancelled', kind, was: world.armed ?? null };
    }

    // ‼️ THE BOOT-LOOP GUARD COMES FIRST AND NOTHING OPENS IT. A stamp in the
    // future is somebody else's clock, not a reason to refuse for ever.
    const last = typeof world.lastRestartAt === 'number' ? world.lastRestartAt : 0;
    const since = world.now - last;
    if (last > 0 && since >= 0 && since < RESTART_COOLDOWN_MS) {
        const retryInMs = RESTART_COOLDOWN_MS - since;
        return {
            decision: 'refused', kind, retryInMs,
            reason: `This window restarted ${Math.round(since / 1000)}s ago; the cooldown has `
                + `${Math.ceil(retryInMs / 1000)}s left. A bridge request that outlived a restart `
                + 'would otherwise be obeyed again on every activation — an endless loop. Wait and ask again.'
        };
    }

    const blockers = liveBlockers(world, kind, ask.resume === true);

    if (ask.force) {
        return { decision: 'restarting', kind, command, delayMs, killed: blockers };
    }

    if (!blockers.length) {
        return { decision: 'restarting', kind, command, delayMs, killed: [] };
    }

    if (when === 'now') {
        return {
            decision: 'refused', kind,
            reason: `${command} would destroy ${describe(blockers)}. Pass force:true to do it anyway, `
                + 'or when:"idle" to have it fire by itself once the window is quiet.'
        };
    }

    // auto / idle — arm it, and say so loudly enough that a caller never has to
    // guess whether it is waiting.
    const armedAt = world.armed && world.armed.kind === kind ? world.armed.armedAt : world.now;
    return {
        decision: 'armed', kind, command, delayMs, armedAt, waitingFor: blockers,
        pollWith: 'farm.health',
        reason: `Waiting for ${describe(blockers)} to finish; ${command} will fire by itself when `
            + 'the last one is gone. Poll farm.health (restartArmed / bootId) to watch it, '
            + 'when:"cancel" to call it off, force:true to go now and lose them.'
    };
}

/** The event an armed plan waits for — nothing else, and no clock. */
export function armedReady(armed: ArmedRestart, world: RestartWorld): boolean {
    return liveBlockers(world, armed.kind, armed.resume === true).length === 0;
}
