/**
 * X-14 / phase 2 — "READY" AND "ACTUALLY WORKS" ARE DIFFERENT QUESTIONS.
 *
 * `engines.ts` reads disk: is the CLI on PATH, is there a grant in its own
 * credentials file. Both can be true while nothing runs — the grant may have
 * expired, the key may have been revoked, a proxy may be in the way. This
 * machine proved it on 2026-08-09: `codex login status` said *Logged in using
 * ChatGPT* and every turn still died with `os error 10013`, because the local
 * security software would not let `codex.exe` open a socket. No amount of
 * reading files finds that. Only a call does.
 *
 * ‼️ SO THIS COSTS SOMETHING, AND THEREFORE IT NEVER RUNS BY ITSELF. Every test
 * is one real turn against the engine: a plan's quota or a key's tokens. It is
 * pressed, never scheduled, never run on page open, never "refreshed" in the
 * background. The result is cached with its age so a second look is free, and
 * the age is shown rather than hidden — a green tick from four hours ago is not
 * the same claim as one from four seconds ago.
 *
 * Pure over an injected runner so the whole matrix is testable without
 * spending anything.
 */

import { EngineId } from './engines';
import {
    opencodeFreeModel, opencodeModelsListArgs, opencodeRunArgs,
    OPENCODE_EXE, OPENCODE_NEEDS_SHELL
} from './opencode';

/**
 * What a test run needs from the outside world.
 *
 * ‼️ `shell` IS PART OF THE CONTRACT, not a detail of the caller. Under a shell
 * the arguments are joined with spaces and NOT quoted, which is harmless when
 * every argument is one token and fatal when one of them is a sentence: `agy
 * --print Reply with exactly: OK` hands the CLI a one-word prompt and four
 * arguments it never asked for. Engines whose command line carries a sentence
 * say so and are spawned directly.
 */
/**
 * ‼️ …AND SO IS `stdin`, FOR THE SAME REASON (U-59). OpenCode's run takes the
 * prompt on standard input — `run [message..]` would put the user's text on a
 * command line for no gain, and its own builder therefore never writes one.
 * Measured in M-14: argv and stdin both work, but which one wins when BOTH are
 * given changes with the quoting, so a caller sends exactly one. The health
 * check has to speak the same channel production does, or it is a check of a
 * path nothing uses.
 */
export type EngineRunner = (
    command: string, args: string[], timeoutMs: number, shell?: boolean, stdin?: string,
    env?: EngineRunEnv
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * ‼️ X-114 — AND THE ENVIRONMENT IS PART OF THE CONTRACT TOO, on the one engine
 * whose provider IS the environment.
 *
 * A Claude route is a set of environment names and nothing else (X-101), so a
 * health check that cannot inject and clear them can only ever test whichever
 * route this window happened to inherit — and then report the verdict under the
 * name of a route it never reached. `clear` is named separately from `set`
 * because emptying a name and giving it a value are different acts: the whole
 * point of the isolation is that an inherited `ANTHROPIC_BASE_URL` must not
 * answer for a route that did not name one.
 */
export interface EngineRunEnv {
    set?: Record<string, string>;
    clear?: string[];
}

/**
 * What a PROVIDER-aimed check adds to an engine's own spec (X-114).
 *
 * The engine spec below answers "does this CLI work at all" and picks the
 * cheapest turn on the plan to prove it. A provider check asks a narrower
 * question — does THIS route, with THIS model, answer — and everything it needs
 * to change is here: the model the turn must name, whatever argv the adapter's
 * runtime resolved, and the route's environment.
 */
export interface ProviderAim {
    providerId: string;
    /** The model this turn must run on, in the ENGINE'S own spelling. */
    modelRef?: string;
    args?: string[];
    spawnEnv?: Record<string, string>;
    clearEnv?: string[];
}

export interface EngineTestResult {
    id: EngineId;
    /** did the engine answer */
    ok: boolean;
    /** how long the whole call took */
    ms: number;
    /** when it was run — the age is what makes the verdict readable */
    at: number;
    /** one line: what came back, or what went wrong */
    detail: string;
    /** the engine's own words when it failed, trimmed — never invented */
    error?: string;
    /**
     * ‼️ U-59 — NOTHING WAS CALLED, AND THAT IS NOT A FAILURE.
     *
     * `ok: false` had two meanings in it: "the engine was asked and did not
     * answer" and "the check refused to run" — and the page drew both as a red
     * ✗ with the engine's name over it. On OpenCode the second is the ordinary
     * case (no free model is on offer, so the check would spend money and will
     * not choose that for you), and a reader saw a broken engine where the row
     * above it said the engine was ready. `ok` stays false because nothing
     * proved the call gets through; this says WHY, and the row draws a third
     * way. A refusal carries no `error` — there is no engine complaint to quote.
     */
    refused?: boolean;
}

/**
 * ‼️ THE CHEAPEST CALL THAT STILL PROVES THE WHOLE PATH. A version flag proves
 * nothing (no network); a real prompt proves the CLI, the credential, the
 * network and the provider in one go. So it is one turn, the smallest model the
 * engine has, a prompt of four words, and read-only sandboxing where the engine
 * offers it — this must never be able to touch a file.
 */
interface TestSpec {
    id: EngineId;
    command: string;
    args: string[];
    /** a run that has not answered by now is a failure worth reporting */
    timeoutMs: number;
    /** false when an argument is a sentence — see EngineRunner. Default true,
     *  because two of these engines are `.cmd` shims and need one. */
    shell?: boolean;
    /** the prompt, when this engine takes it on standard input rather than argv */
    stdin?: string;
    /**
     * ‼️ U-59 — THE CALL THAT CANNOT BE WRITTEN DOWN IN ADVANCE.
     *
     * Every other engine's check is a constant: a flag set and the smallest
     * model on the plan, both true for as long as the CLI keeps its vocabulary.
     * OpenCode's is not. Its cheapest turn is a FREE model from whichever
     * providers happen to be connected on this machine, and that list is not
     * knowable here — a name pinned in this file would be a paid turn the day
     * the free one is retired, on an engine that offers free ones.
     *
     * So the spec may work its call out at press time, using the same injected
     * runner (the lookup is a catalogue read, not a turn — it costs nothing).
     * Returning a `refusal` is a real answer: "there is no free model, so this
     * check would spend money — you choose" is worth more than a silent bill.
     */
    resolve?: (run: EngineRunner) => Promise<{ args?: string[]; stdin?: string; refusal?: string }>;
    /** what a healthy answer looks like on stdout */
    expect(stdout: string): boolean;
}

const PROMPT = 'Reply with exactly: OK';

const SPECS: TestSpec[] = [
    {
        id: 'claude',
        command: 'claude',
        // The smallest model on the plan. `-p` is one non-interactive turn.
        args: ['-p', PROMPT, '--model', 'haiku'],
        timeoutMs: 90000,
        expect: out => /\S/.test(out)
    },
    {
        id: 'codex',
        command: 'codex',
        // ‼️ `--skip-git-repo-check` because the test must not depend on where
        // the editor happens to be, and `-s read-only` because a health check
        // that can write a file is not a health check.
        args: ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', PROMPT],
        timeoutMs: 120000,
        // The JSONL stream says so itself: a turn that completed is the proof,
        // and `turn.failed` is a failure even when the process exits 0.
        expect: out => /"type"\s*:\s*"turn\.completed"/.test(out)
            && !/"type"\s*:\s*"turn\.failed"/.test(out)
    },
    {
        id: 'gemini',
        command: 'gemini',
        args: ['-p', PROMPT],
        timeoutMs: 90000,
        expect: out => /\S/.test(out)
    },
    {
        id: 'agy',
        command: 'agy',
        // ‼️ THE SMALLEST MODEL IN ITS OWN CATALOG, NAMED. Left to itself this
        // CLI defaults to `gemini-3.1-pro`, and a health check must not be the
        // most expensive turn on the account. `--output-format json` gives one
        // object to read instead of an event stream, and `--print-timeout` is
        // stated because the default is five minutes and this check has its own.
        args: [
            '--print', PROMPT,
            '--model', 'gemini-3.6-flash-low',
            '--output-format', 'json',
            '--print-timeout', '2m'
        ],
        // ‼️ NO SHELL: the prompt above is a sentence (see EngineRunner).
        shell: false,
        timeoutMs: 150000,
        // The envelope says so itself, and a run that answered with an error
        // still exits 0 — so the status is the proof, not the exit code.
        expect: out => /"status"\s*:\s*"SUCCESS"/.test(out)
    },
    {
        id: 'opencode',
        command: OPENCODE_EXE,
        // Filled in by `resolve` — the model is not knowable until the
        // catalogue is read, and the flags are the owner module's to write
        // (M-14: no opencode-only flag is spelled outside `core/opencode.ts`).
        args: [],
        stdin: PROMPT,
        // A `.cmd` shim on Windows, and the prompt is on stdin rather than argv,
        // so nothing here is a sentence the shell could split.
        shell: OPENCODE_NEEDS_SHELL,
        timeoutMs: 120000,
        /**
         * ‼️ A FREE MODEL, AND A TURN THAT CANNOT TOUCH A FILE.
         *
         * `--agent plan` is not a courtesy: measured in M-14, OpenCode's plan
         * agent calls NO tool at all, whatever the config says. That is a
         * stronger read-only guarantee than a permission mode, because it is the
         * engine's own behaviour rather than a setting a user's `opencode.json`
         * could have overridden.
         */
        resolve: async (run) => {
            const listed = await run(OPENCODE_EXE, opencodeModelsListArgs(), 30000, OPENCODE_NEEDS_SHELL);
            const model = opencodeFreeModel(listed.stdout);
            if (!model) {
                return {
                    refusal: 'No free model is on offer from the providers connected here, so this check '
                        + 'would spend money on a paid turn. Connect the `opencode` provider (it needs no '
                        + 'sign-in) or pick a model yourself and run one turn by hand — Agent Farm will not '
                        + 'choose a billed model for a health check.'
                };
            }
            return { args: opencodeRunArgs({ model, agent: 'plan' }) };
        },
        // The JSON stream is the proof: a step really finished. `text` alone
        // would pass on a run that only echoed, and an exit code proves nothing
        // here — M-14 measured a REFUSED tool call exiting 0.
        expect: out => /"type"\s*:\s*"step_finish"/.test(out)
    }
];

/** The first line of an engine's complaint — the whole log is not an answer. */
export function firstFault(stderr: string, stdout: string): string {
    const hay = `${stderr}\n${stdout}`;
    // A JSONL error event says it better than a Rust log line, so it wins.
    const ev = /"type"\s*:\s*"(?:turn\.failed|error)"[^\n]*/.exec(hay);
    if (ev) {
        const msg = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(ev[0]);
        if (msg) { return msg[1].replace(/\\"/g, '"').slice(0, 300); }
    }
    // …and Antigravity puts its own complaint on the envelope's `error`, in
    // words worth keeping whole: "invalid model selection … conflicts with
    // --effort=medium" names the flag, which no generic line ever would.
    const agyError = /"error"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(hay);
    if (agyError) { return agyError[1].replace(/\\"/g, '"').slice(0, 300); }
    const line = hay.split('\n').map(l => l.trim())
        .find(l => l && /error|fatal|denied|forbidden|unauthor|expired|refused/i.test(l));
    return (line ?? '').slice(0, 300);
}

/**
 * The engine's own check, re-aimed at one provider and one model (X-114).
 *
 * ‼️ THE MODEL IS REPLACED, NEVER APPENDED. Every spec above already names a
 * model, because a health check must not be the most expensive turn on the
 * account; adding a second `--model` would leave the CLI with two answers to
 * one question and let it pick — measured on Antigravity, which then complains
 * about a flag conflict rather than running anything. On the engine whose
 * prompt is not on argv the whole argument list is rebuilt by its owner module,
 * for the reason M-14 gives: no opencode-only flag is spelled outside it.
 */
export function aimedArgs(id: EngineId, args: string[], aim: ProviderAim): string[] {
    const model = (aim.modelRef ?? '').trim();
    const extra = (aim.args ?? []).filter(a => typeof a === 'string');
    if (!model) { return [...args, ...extra]; }
    if (id === 'opencode') {
        return [...opencodeRunArgs({ model, agent: 'plan' }), ...extra];
    }
    const at = args.indexOf('--model');
    const rebuilt = at >= 0 && at + 1 < args.length
        ? args.map((a, i) => (i === at + 1 ? model : a))
        : [...args, '--model', model];
    return [...rebuilt, ...extra];
}

/**
 * Run one engine's health check. Never throws: a spawn that fails IS the
 * result, and it is the one a user most needs to read.
 */
export async function testEngine(
    id: EngineId, run: EngineRunner, now: () => number = Date.now, aim?: ProviderAim
): Promise<EngineTestResult> {
    const spec = SPECS.find(s => s.id === id);
    const at = now();
    if (!spec) {
        return { id, ok: false, ms: 0, at, detail: 'No health check is defined for this engine.' };
    }
    const started = now();
    try {
        let args = spec.args;
        let stdin = spec.stdin;
        // ‼️ AN AIMED CHECK DOES NOT RESOLVE A MODEL FOR ITSELF. The resolver
        // exists to find the cheapest FREE model on the machine; here the caller
        // has named the one whose route is in question, and quietly testing a
        // different model would report a verdict about something nobody asked
        // about. The caller's own gate decides whether that model may be spent.
        if (aim?.modelRef) {
            args = aimedArgs(id, args, aim);
        } else if (spec.resolve) {
            // ‼️ THE LOOKUP IS INSIDE THE TRY, so a catalogue read that cannot
            // run at all lands in the same "could not be run" answer a failed
            // spawn does — a health check that throws is the one failure a user
            // cannot read.
            const plan = await spec.resolve(run);
            if (plan.refusal) {
                // Not a failure of the engine: nothing was tested, and saying
                // "it did not answer" would be a verdict this never reached.
                return { id, ok: false, refused: true, ms: now() - started, at, detail: plan.refusal };
            }
            if (plan.args) { args = plan.args; }
            if (plan.stdin !== undefined) { stdin = plan.stdin; }
        }
        if (!aim?.modelRef && aim?.args?.length) { args = [...args, ...aim.args]; }
        const r = await run(spec.command, args, spec.timeoutMs, spec.shell ?? true, stdin,
            aim && (aim.spawnEnv || aim.clearEnv)
                ? { ...(aim.spawnEnv ? { set: aim.spawnEnv } : {}), ...(aim.clearEnv ? { clear: aim.clearEnv } : {}) }
                : undefined);
        const ms = now() - started;
        const answered = r.code === 0 && spec.expect(r.stdout);
        if (answered) {
            return {
                id, ok: true, ms, at,
                detail: aim?.modelRef
                    ? `Answered in ${(ms / 1000).toFixed(1)}s on ${aim.modelRef} — this route, this `
                        + 'model and this CLI all work.'
                    : `Answered in ${(ms / 1000).toFixed(1)}s — the CLI, the sign-in and the provider all work.`
            };
        }
        const fault = firstFault(r.stderr, r.stdout);
        return {
            id, ok: false, ms, at,
            detail: r.code === 0
                ? 'The command finished but the engine never completed a turn.'
                : `The command exited ${r.code}.`,
            error: fault || undefined
        };
    } catch (e) {
        const ms = now() - started;
        return {
            id, ok: false, ms, at,
            detail: 'The command could not be run at all.',
            error: String((e as Error)?.message ?? e).slice(0, 300)
        };
    }
}

/** How old a verdict is, said the way a person would. */
export function verdictAge(at: number, now: number): string {
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 60) { return `${s}s ago`; }
    const m = Math.round(s / 60);
    if (m < 60) { return `${m}m ago`; }
    const h = Math.round(m / 60);
    return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
