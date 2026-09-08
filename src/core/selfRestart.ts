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
 *
 * ‼️ 4. AND A HOST RESTART DOES NOT LOAD A BUILD YOU JUST INSTALLED. This one
 * cost the user a whole shift and was reported by them, not by us: after
 * `farm.restartExtensionHost` the Extensions card still carried its "Restart
 * Extensions" button, as if nothing had been restarted. It had been — and the
 * button was telling the truth. Measured in VS Code 1.103.2's own
 * `workbench.desktop.main.js`:
 *
 *   - `workbench.action.restartExtensionHost` is `stopExtensionHosts()` then
 *     `startExtensionHosts()` — with NO argument. `startExtensionHosts(e)`
 *     applies a delta only `if (e)`, and otherwise starts the hosts from
 *     `_registry.getSnapshot()`. The registry is never re-scanned, so the host
 *     comes back running the SAME folder — the old version — and `farm.health`
 *     reports the old version for ever.
 *   - The card's button is `updateRunningExtensions()`, the one and only call
 *     site in the whole bundle that passes `startExtensionHosts({toAdd,
 *     toRemove})`. That delta is what swaps the code.
 *   - The button's own condition is `installedVersion !== runningVersion`. It is
 *     not a stale badge; it is the difference, read live.
 *
 * There is no command an extension can invoke for `updateRunningExtensions`. So
 * the only thing in VS Code that loads a newly installed build without a human
 * is a WINDOW RELOAD, which re-scans from disk. Therefore a host restart asked
 * for while a different version sits in the extensions folder is planned as a
 * window reload instead, and the answer says so — because the alternative is
 * what happened: a restart that reports success, changes nothing, and sends the
 * caller into a poll loop that can never come true.
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
    /** ‼️ THE BUILD IN THE EXTENSIONS FOLDER, WHICH IS NOT THE ONE RUNNING (fact
     *  4 in the header). `installed` is read off `extensions.json`, `running` is
     *  the registry snapshot this host booted with. Absent when nothing can be
     *  read — an unknown is never treated as a mismatch. */
    build?: {
        installed: string; running: string;
        /**
         * ‼️ THE VERSION STRING IS NOT THE BUILD (audit A-02.16). An agent
         * developing this extension packages and installs with `--force` many
         * times under ONE version number — that is what the dev loop does — and
         * two different builds then compare equal. Measured: the extension
         * folder's `package.json` was rewritten at 09:38, the host had booted at
         * 09:24, and `farm.health` still answered `pending:false` because both
         * strings read `3.443.0`. So the agent believed its code was live, no
         * surface could say otherwise, and A-02.7's "it did not load" trap came
         * back silently.
         *
         * This is the folder's own identity rather than its name: true when the
         * `package.json` THIS host booted from has been rewritten since. Unknown
         * (undefined) is never read as replaced.
         */
        replaced?: boolean;
    } | null;
}

/** What this plan will and will not do about the build on disk. Present only
 *  when the two versions are known and differ. */
export interface RestartBuild {
    /** the version the extensions folder holds */
    installed: string;
    /** the version this extension host is running */
    running: string;
    /** whether the command this plan names actually loads `installed` */
    willLoad: boolean;
    /** set when a host restart was turned into a window reload to load it */
    escalatedFrom?: RestartKind;
    /** A-02.16 — the two versions READ THE SAME and the folder was still
     *  replaced. Carried so a caller can tell "3.444.0 is waiting" from "the
     *  build you just packaged over 3.443.0 is waiting", which is the case a
     *  version number can never express. */
    replaced?: boolean;
}

export interface RestartAsk {
    kind: RestartKind;
    when?: RestartWhen;
    force?: boolean;
    delayMs?: unknown;
    /** X-232 — bring the live console sessions back on the other side (consoleRevive.ts). */
    resume?: boolean;
    /** Default true. A host restart that would leave a newly installed build on
     *  disk is planned as a window reload instead. `false` bounces the host as
     *  asked and REPORTS the build it is leaving behind — for the caller that
     *  wants a wedged host cleared, not a version swapped. */
    loadBuild?: boolean;
}

export type RestartPlan = (
    | {
        decision: 'restarting'; kind: RestartKind; command: string;
        delayMs: number; killed: RestartBlocker[];
    }
    | {
        decision: 'armed'; kind: RestartKind; command: string; delayMs: number;
        armedAt: number; waitingFor: RestartBlocker[]; reason: string; pollWith: 'farm.health';
    }
    | { decision: 'cancelled'; kind: RestartKind; was: ArmedRestart | null }
    | { decision: 'refused'; kind: RestartKind; reason: string; retryInMs?: number }
) & {
    /** Only when the two versions are known and differ — see `RestartBuild`. */
    build?: RestartBuild;
    /** The one sentence about the build, on every decision that has one. It is
     *  carried into the armed plan's `reason` rather than written twice. */
    note?: string;
};

/**
 * ‼️ WHAT BLOCKS A RESTART IS A FLOW, NOT A SEAT (audit A-02.4).
 *
 * This was `SESSION_DEAD = ['ended','error']` — everything else counted as a
 * live loss. But a console session that has FINISHED its turn and is waiting
 * for the user to type the next instruction is `idle`, and it stayed a blocker
 * for as long as the card was on the screen. The consequence was not a delay,
 * it was a DEADLOCK, and the user reported it in exactly those terms: the
 * session that asks for the restart is on the screen asking, so the restart it
 * armed could never fire, and "armed" was reported to a user who then had to
 * restart by hand — a protection mechanism that removed the autonomy it was
 * written to protect.
 *
 * The user's own rule, and the only one here now: **a turn in flight blocks; a
 * seat does not.** `starting` and `working` are the flight. `idle` is somebody
 * waiting for a human, and nothing is lost by restarting under it (X-232's
 * `resume` takes the named ones up again on the other side anyway).
 *
 * This also dissolves the caller's special case without a special case: the
 * session that asks IS `working` while it asks, so the plan is armed; its turn
 * ends, it drops to `idle`, and the 5s watcher fires the restart. Waiting for
 * the flow to end is the whole of the answer.
 */
const SESSION_IN_FLIGHT = new Set(['starting', 'working']);

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
        .filter(s => SESSION_IN_FLIGHT.has(String(s.status)))
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
        // The sentence names the FLOW, because that is now the only thing that
        // holds it: "3 console sessions" would read as three cards on the
        // screen, and cards on the screen stopped being a reason to wait.
        parts.push(`${consoles.length} console turn(s) still running `
            + `(${consoles.map(b => b.name).join(', ')})`);
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
    const asked: RestartKind = ask.kind === 'window' ? 'window' : 'extensionHost';
    const when: RestartWhen = ask.when ?? 'auto';
    const delayMs = clampRestartDelay(ask.delayMs);

    // ‼️ FACT 4 IN THE HEADER, AND IT IS DECIDED FIRST — because what a restart
    // can LOAD decides which command it is, and the command decides what blocks
    // it. Working this out after the blockers were counted would count the
    // wrong ones.
    const pending = pendingBuild(world);
    const escalate = pending !== null && asked === 'extensionHost' && ask.loadBuild !== false;
    const kind: RestartKind = escalate ? 'window' : asked;
    const command = RESTART_COMMANDS[kind];
    const build: RestartBuild | undefined = pending
        ? {
            installed: pending.installed, running: pending.running,
            willLoad: kind === 'window',
            ...(escalate ? { escalatedFrom: asked } : {}),
            ...(pending.replaced ? { replaced: true } : {})
        }
        : undefined;
    const note = buildNote(build);
    /** The build sentence rides on every decision that has one, so no caller has
     *  to ask a second op what happened to its build. */
    const out = <T extends RestartPlan>(plan: T): RestartPlan =>
        (build ? { ...plan, build, note } : plan);

    if (when === 'cancel') {
        return out({ decision: 'cancelled', kind, was: world.armed ?? null });
    }

    // ‼️ THE BOOT-LOOP GUARD COMES FIRST AND NOTHING OPENS IT. A stamp in the
    // future is somebody else's clock, not a reason to refuse for ever.
    const last = typeof world.lastRestartAt === 'number' ? world.lastRestartAt : 0;
    const since = world.now - last;
    if (last > 0 && since >= 0 && since < RESTART_COOLDOWN_MS) {
        const retryInMs = RESTART_COOLDOWN_MS - since;
        return out({
            decision: 'refused', kind, retryInMs,
            reason: `This window restarted ${Math.round(since / 1000)}s ago; the cooldown has `
                + `${Math.ceil(retryInMs / 1000)}s left. A bridge request that outlived a restart `
                + 'would otherwise be obeyed again on every activation — an endless loop. Wait and ask again.'
        });
    }

    const blockers = liveBlockers(world, kind, ask.resume === true);

    if (ask.force) {
        return out({ decision: 'restarting', kind, command, delayMs, killed: blockers });
    }

    if (!blockers.length) {
        return out({ decision: 'restarting', kind, command, delayMs, killed: [] });
    }

    if (when === 'now') {
        return out({
            decision: 'refused', kind,
            reason: `${command} would destroy ${describe(blockers)}. Pass force:true to do it anyway, `
                + 'or when:"idle" to have it fire by itself once the window is quiet.'
                + (note ? ` ${note}` : '')
        });
    }

    // auto / idle — arm it, and say so loudly enough that a caller never has to
    // guess whether it is waiting.
    const armedAt = world.armed && world.armed.kind === kind ? world.armed.armedAt : world.now;
    return out({
        decision: 'armed', kind, command, delayMs, armedAt, waitingFor: blockers,
        pollWith: 'farm.health',
        // ‼️ THE BUILD SENTENCE IS CARRIED, NOT RE-WRITTEN (X-231's rule). An
        // armed plan's `reason` is what `farm.waits` reports, and a caller that
        // was escalated to a window reload must be able to read WHY from the
        // wait itself rather than from a second op.
        reason: `Waiting for ${describe(blockers)} to finish; ${command} will fire by itself when `
            + 'the last one is gone. Poll farm.health (restartArmed / bootId) to watch it, '
            + 'when:"cancel" to call it off, force:true to go now and lose them.'
            + (note ? ` ${note}` : '')
    });
}

/** The two versions, and only when both are known AND they differ. An unknown is
 *  never read as a mismatch: an extension running from a development host has no
 *  `extensions.json` to compare against, and turning its every host restart into
 *  a window reload would be the cure killing the patient. */
export function pendingBuild(world: RestartWorld): { installed: string; running: string; replaced: boolean } | null {
    const b = world.build;
    if (!b) { return null; }
    const installed = String(b.installed ?? '').trim();
    const running = String(b.running ?? '').trim();
    if (!installed || !running) { return null; }
    if (installed !== running) { return { installed, running, replaced: false }; }
    // ‼️ SAME NAME, DIFFERENT BUILD (A-02.16). The folder this host booted from
    // has been written again since, which is the dev loop's own normal case and
    // the one the version comparison above can never see.
    if (b.replaced === true) { return { installed, running, replaced: true }; }
    return null;
}

/** One sentence, three cases: it will load · it was escalated so it can load ·
 *  it will not load and here is what would. */
function buildNote(build: RestartBuild | undefined): string | undefined {
    if (!build) { return undefined; }
    // ‼️ A-02.16 — when the two names are equal the usual sentence would read
    // "3.443.0 is installed and 3.443.0 is running", which says the opposite of
    // what is true. Name the FOLDER instead, because that is what differs.
    const heads = build.replaced
        ? `a different build of ${build.installed} is on disk from the one this host loaded `
        + '(the extensions folder was written again since it booted — same version number, '
        + 'different code)'
        : `${build.installed} is installed and ${build.running} is running`;
    if (build.escalatedFrom) {
        return `${heads}. ${RESTART_COMMANDS.extensionHost} restarts the host from the registry `
            + `snapshot it already has and would come back on ${build.running} again, so this is `
            + `planned as ${RESTART_COMMANDS.window} — the only thing in VS Code that re-scans the `
            + 'extensions folder. Pass loadBuild:false to bounce the host as asked instead.';
    }
    if (build.willLoad) {
        return `${heads}; this reload re-scans the extensions folder, so it will load it.`;
    }
    return `${heads}, and this will NOT load it: ${RESTART_COMMANDS.extensionHost} restarts the host `
        + `from the registry snapshot it already has. Use ${RESTART_COMMANDS.window} `
        + '(farm.reloadWindow) when you mean to load the build.';
}

/** The event an armed plan waits for — nothing else, and no clock. */
export function armedReady(armed: ArmedRestart, world: RestartWorld): boolean {
    return liveBlockers(world, armed.kind, armed.resume === true).length === 0;
}
