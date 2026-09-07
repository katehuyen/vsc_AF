/**
 * U-86 — WHAT THE LIVE HOOKS CARD IS ALLOWED TO CLAIM, AND WHO REALLY HAS THE
 * PORT.
 *
 * Without the hooks the extension is BLIND: no timeline, no permission-wait
 * notice, no live turn. And the commonest cause of "nothing shows up" has never
 * been a bug — it is that the hooks were never installed, or were installed for
 * one agent and not for the farm. That fact lived on the bridge (`hooks.status`)
 * and nowhere a person could see it.
 *
 * ‼️ THE PORT HALF WAS MEASURED, NOT REASONED ABOUT, and the measurement
 * changed the design twice.
 *
 * 1. **The authority on "is the port blocked" is US, not `netstat`.**
 *    `LiveMonitor` already keeps `listenerState` — it watched its own
 *    `server.on('error')` and knows whether it bound. A card that shelled out to
 *    a process scan to answer a question the extension already knew would be
 *    slower AND less true (the scan cannot see WHY we failed). So the scan runs
 *    only in the one state where it adds something: `port-in-use`, where the
 *    missing fact is *who*.
 *
 * 2. **On this machine the holder of 8377 is our own extension host** — a
 *    `Code.exe --type=utility --utility-sub-type=node.mojom.NodeService`. That
 *    makes "Clear the port" a button that, written naively, kills the window it
 *    is drawn in. So the holder is CLASSIFIED before anything is offered, and
 *    the classification is what decides whether a stop is offered at all.
 *
 * 3. **A `netstat -ano` for one port returns more than one row and most of them
 *    are not the owner.** Measured, 127.0.0.1:8377: ten `TIME_WAIT` rows —
 *    every one of them carrying **pid 0** — and a single `LISTENING` row with
 *    the real pid. A parser that took the last column of any matching line
 *    would offer to stop process 0.
 *
 * Pure: no vscode, no child_process. It is handed the command output and the
 * process table, so a test can hand it the real bytes measured above.
 */

/** What the live listener says about itself (mirrors `live.ts` ListenerState). */
export type ListenerState = 'listening' | 'disabled' | 'port-in-use' | 'error';

/** One hook file and whether ours are in it (mirrors `infraBridge.HookTarget`). */
export interface HookFile {
    /**
     * ‼️ X-265 — `account` is the third kind, and leaving it out was how the
     * card came to promise a coverage it did not have. A captured account is a
     * config directory, so the engine reads ITS settings file and not the
     * user's; a hook missing there is a session nobody can see.
     */
    scope: 'user' | 'agent' | 'account';
    agent?: string;
    /** the slot id, when this file belongs to a captured account */
    account?: string;
    file: string;
    installed: boolean;
}

/**
 * ‼️ WHOSE PROCESS IS ON THE PORT — the question that decides what may be
 * offered, never a boolean.
 *
 * - `ours`          this very extension host. The port is not a problem; the
 *                   card must not offer to stop it, because that is this window.
 * - `other-window`  a second VS Code holding it. The hooks are reporting to THAT
 *                   window and they are not lost — killing another editor from a
 *                   status card would be a hostile answer to a harmless setup.
 * - `stranger`      anything else. This is the only case a stop is honest in,
 *                   and even then the card names what it would stop.
 * - `none`          nothing is listening.
 * - `unknown`       the scan could not answer (no netstat, no permission, an
 *                   output shape we have not seen). Said out loud rather than
 *                   guessed at — a card that reported "free" here would send
 *                   somebody to restart a listener that will fail again.
 */
export type HolderKind = 'ours' | 'other-window' | 'stranger' | 'none' | 'unknown';

export interface PortHolder {
    kind: HolderKind;
    pid?: number;
    name?: string;
    /** One sentence a person can act on. */
    detail: string;
    /** Whether stopping it may be offered at all. */
    canStop: boolean;
}

/**
 * The pid LISTENING on `port`, out of `netstat -ano` output.
 *
 * ‼️ ONLY THE LISTENING ROW. Measured on this machine: the same port produced
 * ten `TIME_WAIT` rows, all of them with pid 0, and one `LISTENING` row with the
 * owner. Matching on the port alone finds a "holder" that is a closing client
 * socket, or pid 0, which is not a process at all.
 */
export function listeningPidWindows(stdout: string, port: number): number | undefined {
    for (const raw of String(stdout ?? '').split('\n')) {
        const line = raw.trim();
        if (!/\bLISTENING\b/i.test(line)) { continue; }
        const m = line.match(/^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
        if (!m) { continue; }
        // The local address ends in `:port` — `[::]:8377`, `0.0.0.0:8377` and
        // `127.0.0.1:8377` all have to match, and `:83770` must not.
        if (!new RegExp(':' + port + '$').test(m[1])) { continue; }
        const pid = Number(m[2]);
        if (Number.isFinite(pid) && pid > 0) { return pid; }
    }
    return undefined;
}

/**
 * The pid out of `lsof -nP -iTCP:<port> -sTCP:LISTEN`. The first column of the
 * first data row; the header line starts with COMMAND and is skipped.
 */
export function listeningPidPosix(stdout: string): number | undefined {
    for (const raw of String(stdout ?? '').split('\n')) {
        const line = raw.trim();
        if (!line || /^COMMAND\b/i.test(line)) { continue; }
        const m = line.match(/^\S+\s+(\d+)\b/);
        if (m) {
            const pid = Number(m[1]);
            if (Number.isFinite(pid) && pid > 0) { return pid; }
        }
    }
    return undefined;
}

export interface ClassifyInput {
    /** The pid found listening, if the scan found one. */
    pid?: number;
    /** Its process name, from the process table. */
    name?: string;
    /** This extension host's own pid. */
    ownPid: number;
    /** The pids above us — a VS Code window is several processes. */
    ownAncestors?: readonly number[];
    /** True when the scan itself could not run or could not be read. */
    scanFailed?: boolean;
    port: number;
}

/**
 * ‼️ THE CLASSIFICATION IS THE SAFETY RAIL. Everything the card offers hangs
 * off it, so it is decided once, here, where it can be tested with the real
 * process names this machine produces.
 */
export function classifyHolder(input: ClassifyInput): PortHolder {
    if (input.scanFailed) {
        return {
            kind: 'unknown',
            detail: `Port ${input.port} is taken, but this machine would not say by what. `
                + 'Check it by hand before restarting the listener.',
            canStop: false
        };
    }
    if (!input.pid) {
        return {
            kind: 'none',
            detail: `Nothing is listening on port ${input.port}.`,
            canStop: false
        };
    }
    const name = input.name ?? '';
    const own = new Set([input.ownPid, ...(input.ownAncestors ?? [])]);
    if (own.has(input.pid)) {
        return {
            kind: 'ours', pid: input.pid, name,
            detail: `This window holds port ${input.port} — that is Agent Farm listening, not a conflict.`,
            canStop: false
        };
    }
    // ‼️ A SECOND VS CODE IS THE COMMON CASE AND IT IS NOT A FAULT. Two windows,
    // one port: the hooks reach the other one. Offering to kill an editor
    // somebody is working in would be the worst answer a status card could give.
    if (/^code(\.exe)?$/i.test(name) || /^code - insiders/i.test(name)) {
        return {
            kind: 'other-window', pid: input.pid, name,
            detail: `Another VS Code window (pid ${input.pid}) holds port ${input.port}, so the hooks `
                + 'are reporting to that one. Close it, or give this window its own '
                + '`agentFarm.livePort`.',
            canStop: false
        };
    }
    return {
        kind: 'stranger', pid: input.pid, name,
        detail: `${name || 'A process'} (pid ${input.pid}) holds port ${input.port}, so the live `
            + 'listener could not bind. Stopping it frees the port.',
        canStop: true
    };
}

export type HooksState =
    'blind' | 'partial' | 'port-in-use' | 'listener-off' | 'listener-error' | 'ok';

export const HOOKS_TONE: Record<HooksState, 'ok' | 'bad' | 'warn' | 'off'> = {
    blind: 'bad',
    partial: 'warn',
    'port-in-use': 'bad',
    'listener-off': 'off',
    'listener-error': 'bad',
    ok: 'ok'
};

export interface HooksStatusInput {
    listener: ListenerState;
    port: number;
    targets: readonly HookFile[];
    holder?: PortHolder;
}

export interface HooksStatus {
    state: HooksState;
    tone: 'ok' | 'bad' | 'warn' | 'off';
    detail: string;
    next?: string;
    /** How many files carry our hooks, and how many there are. */
    installed: number;
    total: number;
    /** ‼️ The one that matters on its own: user scope covers every session on
     *  this machine, so an agent-only install is a farm that reports some
     *  sessions and silently drops the rest. */
    userInstalled: boolean;
    /** ‼️ X-265 — captured accounts whose own settings file carries no hooks.
     *  Non-zero means the timeline is blind exactly where the work is. */
    accountsBlind: number;
}

/**
 * ‼️ THE PRECEDENCE IS A DECISION.
 *
 * A blocked port outranks a missing hook file: the hooks would post to a
 * listener that is not there, so fixing the files first changes nothing a
 * person can see. And "installed nowhere" outranks "the listener is off" —
 * switching the listener on for hooks that do not exist produces the same
 * silence it was meant to cure.
 */
export function hooksStatus(input: HooksStatusInput): HooksStatus {
    const targets = input.targets ?? [];
    const installed = targets.filter(t => t.installed).length;
    const userInstalled = targets.some(t => t.scope === 'user' && t.installed);
    // ‼️ X-265 — the accounts that read their own settings file and find no
    // hooks in it. Counted beside `userInstalled` because the two together are
    // the honest answer: user scope installed is no longer the whole story.
    const accountsBlind = targets.filter(t => t.scope === 'account' && !t.installed);

    const base = {
        installed, total: targets.length, userInstalled,
        accountsBlind: accountsBlind.length
    };

    if (input.listener === 'port-in-use') {
        return {
            ...base, state: 'port-in-use', tone: HOOKS_TONE['port-in-use'],
            detail: input.holder?.detail
                ?? `Port ${input.port} is already taken, so nothing is being received.`,
            next: input.holder?.canStop
                ? 'Free the port, then restart the listener.'
                : 'Give this window its own agentFarm.livePort, or free the port and restart the listener.'
        };
    }
    if (installed === 0) {
        return {
            ...base, state: 'blind', tone: HOOKS_TONE.blind,
            detail: 'No settings file carries the hooks, so Agent Farm is blind — no timeline, '
                + 'no permission-wait notice, no live turn.',
            next: 'Install them at user scope: one file, every session on this machine.'
        };
    }
    if (input.listener === 'error') {
        return {
            ...base, state: 'listener-error', tone: HOOKS_TONE['listener-error'],
            detail: `The hooks are installed, but the listener on port ${input.port} failed to start.`,
            next: 'Restart the listener; if it keeps failing, check the port.'
        };
    }
    if (input.listener === 'disabled') {
        return {
            ...base, state: 'listener-off', tone: HOOKS_TONE['listener-off'],
            detail: 'The live listener is switched off, so installed hooks post to nothing.',
            next: 'Set agentFarm.livePort to a port and reload to switch it on.'
        };
    }
    if (!userInstalled) {
        return {
            ...base, state: 'partial', tone: HOOKS_TONE.partial,
            detail: `Only ${installed} agent file(s) carry the hooks. User scope is NOT installed, so `
                + 'any session started outside those agents reports nothing.',
            next: 'Install at user scope — one file covers every session on this machine.'
        };
    }
    /**
     * ‼️ X-265 — AND THE SENTENCE BELOW WAS THE UNTRUE ONE.
     *
     * "User scope is installed — every session on this machine is covered" was
     * exact until an account became a config directory of its own. After that,
     * the card went on saying it in green while every session started on a
     * captured sign-in posted nothing — measured 2026-09-07: a whole day of
     * work invisible under a card reporting ok. A verdict that cannot go amber
     * for the commonest failure is decoration, so this branch exists before
     * the green one and names the accounts it is talking about.
     */
    if (accountsBlind.length) {
        return {
            ...base, state: 'partial', tone: HOOKS_TONE.partial,
            detail: `User scope is installed, but ${accountsBlind.length} captured account(s) carry `
                + 'no hooks of ours: a session started on one reads ITS OWN settings.json '
                + `(${accountsBlind.map(t => t.account || t.file).join(', ')}) and posts nothing, `
                + 'so the timeline looks empty while the work is running.',
            next: 'Install at user scope — it carries through to every captured account.'
        };
    }
    return {
        ...base, state: 'ok', tone: HOOKS_TONE.ok,
        detail: `User scope is installed and the listener is on port ${input.port} — every session `
            + 'on this machine is covered.'
    };
}
