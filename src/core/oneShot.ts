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
    /**
     * ‼️ X-249 (2/n) — A DIMENSION IS STATED, NOT SPELT.
     *
     * `args` is a raw flag string, which only the SHELL form can carry: an
     * argument vector cannot be split back out of it without redoing the
     * quoting the shell was going to do. `model` and `json` are the two things
     * a caller actually means, so BOTH forms can express them and the flag
     * names stay the engine adapter's business — which is the whole reason the
     * engine is an axis rather than a constant.
     */
    model?: string;
    /** Ask for the machine-readable envelope `envelope()` knows how to read. */
    json?: boolean;
    /** Extra flags, already formed, for the shell form only. */
    args?: string;
    prompt?: string;
}

/**
 * The SPAWN form of one turn: a command and an argument vector, with the prompt
 * going down STDIN rather than through a shell.
 *
 * ‼️ `stdin` IS NOT A SETTING, IT IS A STATEMENT ABOUT THIS ENGINE — the vector
 * carries no prompt, so a caller that ignored it would spawn a turn asking
 * nothing at all.
 */
export interface OneShotArgv {
    cmd: string;
    args: string[];
    /** true = write the prompt to the child's stdin and close it. */
    stdin: boolean;
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
 * ‼️ X-249 (2/n) — WHAT CAME BACK, and it is why an engine axis is not a select.
 *
 * A one-shot turn is a PAIR of engine-specific facts, and the second one is the
 * one that blocked X-249: the ENVELOPE. Claude's `--output-format json` prints
 * an object carrying `result`, `session_id`, `total_cost_usd` and a `usage`
 * block whose four token fields are summed. The flag, the field names and the
 * cost field are all Claude's; a second engine publishes its own shape.
 *
 * So building the line and reading the reply are declared TOGETHER, per engine.
 * Splitting them across two files is how an engine ends up spawnable but
 * unreadable — which is worse than being refused, because it spends a window
 * and comes back looking like a model that said nothing.
 */
export interface OneShotEnvelope {
    /** The reply text. */
    result: string;
    /** The engine's own continuation handle, where it has one. */
    sessionId?: string;
    costUSD?: number;
    tokens?: number;
    isError: boolean;
    subtype?: string;
}

export interface OneShotAdapter {
    engine: string;
    /** Build the command line for one short turn. */
    line(want: OneShotWant): string;
    /**
     * ‼️ THE SAME TURN WITHOUT A SHELL, and it is not a convenience.
     *
     * The leader turn's prompt is several kilobytes of the user's own words,
     * quotation marks and newlines. Putting that inside `-p "…"` is exactly the
     * class of damage a dozen inner rounds of `sanitizePrompt` exist to avoid,
     * so the one caller whose prompt it is spawns with an argument vector and
     * writes the prompt to stdin. A registration carrying only `line` would
     * leave that caller unable to run on the engine at all — which is why the
     * test refuses one.
     */
    argv(want: OneShotWant): OneShotArgv;
    /** Read what the engine printed. `null` = not an envelope at all, which the
     *  caller must report honestly rather than treat as an empty reply. */
    envelope(stdout: string): OneShotEnvelope | null;
}

const asObj = (s: string): Record<string, unknown> | undefined => {
    try {
        const j = JSON.parse(s) as unknown;
        return j && typeof j === 'object' && !Array.isArray(j)
            ? j as Record<string, unknown> : undefined;
    } catch { return undefined; }
};

/**
 * The stated dimensions, in this engine's own flags — written once so the two
 * forms of the same turn cannot drift apart.
 */
const claudeFlags = (want: OneShotWant): string[] => [
    ...(String(want.model ?? '').trim() ? ['--model', String(want.model).trim()] : []),
    ...(want.json ? ['--output-format', 'json'] : [])
];

const claudeAdapter: OneShotAdapter = {
    engine: 'claude',
    line(want) {
        const head = [...claudeFlags(want), (want.args ?? '').trim()].filter(Boolean).join(' ');
        return `claude ${head ? head + ' ' : ''}-p "${want.prompt ?? ''}"`;
    },
    /** `-p` with no value: this CLI then reads the prompt from stdin. */
    argv(want) {
        return { cmd: 'claude', args: [...claudeFlags(want), '-p'], stdin: true };
    },
    /** Tolerates leading noise lines: the CLI prints warnings before the JSON. */
    envelope(stdout) {
        let o = asObj(stdout.trim());
        if (!o || typeof o.result !== 'string') {
            const lines = stdout.trim().split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                const c = asObj(lines[i].trim());
                if (c && typeof c.result === 'string') { o = c; break; }
            }
        }
        if (!o || typeof o.result !== 'string') { return null; }
        // usage: {input_tokens, output_tokens, cache_*_input_tokens} — sum = call total
        let tokens: number | undefined;
        if (o.usage && typeof o.usage === 'object') {
            const u = o.usage as Record<string, unknown>;
            const n = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
                .reduce((a, k) => a + (typeof u[k] === 'number' ? u[k] as number : 0), 0);
            if (n > 0) { tokens = n; }
        }
        return {
            result: o.result,
            sessionId: typeof o.session_id === 'string' ? o.session_id : undefined,
            costUSD: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
            tokens,
            isError: o.is_error === true
                || (typeof o.subtype === 'string' && o.subtype.startsWith('error')),
            subtype: typeof o.subtype === 'string' ? o.subtype : undefined
        };
    }
};

/**
 * ‼️ THE REGISTRY, AND WHAT IS DELIBERATELY NOT IN IT.
 *
 * Only Claude. Codex's `exec` prints a different envelope and IT HAS NOT BEEN
 * MEASURED — so there is no Codex adapter, and asking for one gets `undefined`
 * exactly as `oneShotLine` has always refused by name. A guessed field name
 * would not fail loudly: it would parse to `null` at 3 a.m. in the middle of a
 * mission round and read as "the model replied with nothing".
 *
 * Adding an engine is a registration here, with BOTH halves, and the test
 * refuses a row that has only one of them.
 */
const ADAPTERS: OneShotAdapter[] = [claudeAdapter];

/** The adapter for an engine, or `undefined` where none has been written. */
export function oneShotAdapter(engine: string | undefined): OneShotAdapter | undefined {
    const id = (engine || '').trim() || 'claude';
    return ADAPTERS.find(a => a.engine === id);
}

/** The engines a one-shot turn can actually be run on. */
export function oneShotEngines(): string[] {
    return ADAPTERS.map(a => a.engine);
}

/**
 * Read one engine's reply. `null` = this engine has no adapter, or what it
 * printed was not an envelope — both of which the caller reports honestly.
 */
export function oneShotEnvelope(engine: string | undefined, stdout: string): OneShotEnvelope | null {
    const a = oneShotAdapter(engine);
    return a ? a.envelope(stdout) : null;
}

/**
 * The command line, built once. `undefined` means this engine has no one-shot
 * form yet — the caller REFUSES rather than falling through to another engine.
 */
export function oneShotLine(want: OneShotWant): string | undefined {
    const a = oneShotAdapter(engineOf(want));
    return a ? a.line(want) : undefined;
}

/**
 * The same turn as a command and an argument vector, for the one caller that
 * must not go through a shell. `undefined` is the same refusal by name
 * `oneShotLine` gives — a caller that fell back to another engine would spend a
 * window on a model nobody asked for.
 */
export function oneShotArgv(want: OneShotWant): OneShotArgv | undefined {
    const a = oneShotAdapter(engineOf(want));
    return a ? a.argv(want) : undefined;
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
