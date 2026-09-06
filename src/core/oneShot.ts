import * as cp from 'child_process';
import { spawnEnvironment } from './providerRuntime';

/**
 * ‼️ X-260 — THE ENVIRONMENT OF THE FLEET'S OWN SHORT TURNS.
 *
 * Agent Farm runs a dozen turns of its own that nobody starts and nobody sits
 * in: the judge behind A/B and evals, the pulse sweep, the quality scan, the
 * suggestion pass, the weekly summary, the memory distiller, the dispatcher and
 * the command bar. Every one of them was written the same way —
 *
 *     cp.exec(`claude ${judgeArgs} -p "${prompt}"`, { cwd, timeout }, cb)
 *
 * — and that one line says two things it did not mean to.
 *
 * ‼️ IT SAYS "WHOEVER THE MACHINE IS SIGNED IN AS". No `env` is passed, so the
 * turn inherits whatever `CLAUDE_CONFIG_DIR` the VS Code window happens to
 * carry. That is OUTSIDE the pool the user allowed, INVISIBLE to `pickAccount`,
 * and it spends a window nobody can see it spending: a nightly sweep can eat
 * the plan the user was saving for the morning, and no surface in the product
 * can say that it did. Every other launch in the extension — task, session,
 * console, terminal, leader turn — goes through the account resolver. These did
 * not, which made them the one hole in an otherwise closed system.
 *
 * ‼️ AND IT NAILS THE ENGINE INTO A TEMPLATE STRING. The axis every other
 * launch has cannot even be stated here. This module gives it a name and a
 * REFUSAL rather than a pretence: an engine whose one-shot form nobody has
 * written yet comes back as "not implemented" instead of quietly spawning
 * `claude` (X-259 is the same mistake, one layer down, and it was found the
 * hard way). Making the other engines real needs a per-engine envelope reader,
 * which is X-249's second half and is deliberately NOT smuggled in here.
 *
 * ‼️ NOTHING INSTALLED IS THE DOCUMENTED ABSENT CASE, not a failure. The
 * resolution rules live in the extension — it owns the slots, the adapters and
 * the routes — so `core` states what it wants and is handed how to answer it.
 * A process that never wires the seam (the headless service, a unit test) gets
 * `undefined` for the environment, which is exactly the inherited environment
 * every one of these calls has always had, byte for byte.
 */

export interface OneShotCaps {
    /**
     * The engine's own environment layer for a sign-in. `null` on a name means
     * REMOVE it (X-211) — the machine's own sign-in stated outright has to be
     * able to clear a variable the window itself was started with.
     */
    accountLayer?: (engine: string, account?: string) => Record<string, string | null>;
    /**
     * The route this engine's turn runs on, in the same shape every other
     * launch resolves. Left uninstalled deliberately for now: the route
     * resolver is answered per AGENT, and a fleet-wide sweep has no agent to
     * answer for — inventing one would be a policy nobody chose.
     */
    runtime?: (engine: string) => { spawnEnv?: Record<string, string>; clearEnv?: string[] } | undefined;
}

export interface OneShotWant {
    /** Default `claude` — the engine these turns have always run on. */
    engine?: string;
    /** Unstated leaves the choice to the resolver, exactly as a task does. */
    account?: string;
    args?: string;
    prompt?: string;
}

export interface OneShotResult {
    /** stdout, trimmed. */
    out: string;
    /** stderr, trimmed. */
    stderr: string;
    /** The failure's message when the process could not be run or refused. */
    error?: string;
}

let caps: OneShotCaps | undefined;

/** Wire the seam. Called once, from the side that owns the answers. */
export function installOneShotCaps(next: OneShotCaps | undefined): void {
    caps = next;
}

/** The engine a one-shot turn runs on when nobody says. */
const engineOf = (want: OneShotWant): string => (want.engine || '').trim() || 'claude';

/**
 * The environment for one of these turns, or `undefined` for "inherit", which
 * is what every one of them did before the seam existed.
 */
export function oneShotEnv(want: OneShotWant): Record<string, string> | undefined {
    if (!caps) { return undefined; }
    const engine = engineOf(want);
    // ‼️ ONE ORDER, ONE READER: the same assembly every spawn in the extension
    // goes through, so "the route wins over the account wins over the window"
    // is stated in one place rather than argued twice.
    return spawnEnvironment(
        process.env,
        [caps.accountLayer ? caps.accountLayer(engine, want.account) : undefined],
        caps.runtime ? caps.runtime(engine) : undefined);
}

/**
 * The command line, built once. `undefined` means this engine has no one-shot
 * form yet — the caller REFUSES rather than falling through to another engine.
 */
export function oneShotLine(want: OneShotWant): string | undefined {
    if (engineOf(want) !== 'claude') { return undefined; }
    const args = (want.args ?? '').trim();
    return `claude ${args ? args + ' ' : ''}-p "${want.prompt ?? ''}"`;
}

/**
 * Run one. The prompt is expected to be sanitized by the caller (each of them
 * shapes its own), exactly as it was when the line was written inline.
 */
export function execOneShot(
    want: OneShotWant & { cwd: string; timeoutMs?: number; maxBuffer?: number }
): Promise<OneShotResult> {
    const line = oneShotLine(want);
    if (!line) {
        return Promise.resolve({
            out: '', stderr: '',
            error: `no one-shot turn is implemented for "${engineOf(want)}" yet (X-260)`
        });
    }
    return new Promise(resolve => {
        cp.exec(line, {
            cwd: want.cwd,
            env: oneShotEnv(want),
            timeout: want.timeoutMs ?? 180_000,
            windowsHide: true,
            maxBuffer: want.maxBuffer ?? 4 * 1024 * 1024
        }, (err, stdout, stderr) => resolve({
            out: String(stdout ?? '').trim(),
            stderr: String(stderr ?? '').trim(),
            error: err ? String(err.message) : undefined
        }));
    });
}
