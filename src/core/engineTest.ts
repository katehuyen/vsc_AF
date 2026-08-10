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
export type EngineRunner = (
    command: string, args: string[], timeoutMs: number, shell?: boolean
) => Promise<{ code: number; stdout: string; stderr: string }>;

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
 * Run one engine's health check. Never throws: a spawn that fails IS the
 * result, and it is the one a user most needs to read.
 */
export async function testEngine(
    id: EngineId, run: EngineRunner, now: () => number = Date.now
): Promise<EngineTestResult> {
    const spec = SPECS.find(s => s.id === id);
    const at = now();
    if (!spec) {
        return { id, ok: false, ms: 0, at, detail: 'No health check is defined for this engine.' };
    }
    const started = now();
    try {
        const r = await run(spec.command, spec.args, spec.timeoutMs, spec.shell ?? true);
        const ms = now() - started;
        const answered = r.code === 0 && spec.expect(r.stdout);
        if (answered) {
            return { id, ok: true, ms, at, detail: `Answered in ${(ms / 1000).toFixed(1)}s — the CLI, the sign-in and the provider all work.` };
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
