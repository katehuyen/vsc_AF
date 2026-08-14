/**
 * S-21 — ANTIGRAVITY (`agy`), THE FOURTH ENGINE: its command line.
 *
 * ‼️ NOT `core/antigravity.ts`. That file syncs `AGENTS.md` rule files and has
 * nothing to do with running anything. This one is the engine: what `agy` takes,
 * what it refuses, and what it does that neither Claude Code nor Codex does.
 *
 * ‼️ AND NOT THE `gemini` ROW EITHER. `gemini` is `@google/gemini-cli`, a
 * different program that is not installed on this machine. Antigravity is
 * Google's agent app; `agy` is its CLI, and the models it offers are Gemini's,
 * Anthropic's and an open-weights one at the same time.
 *
 * ‼️ EVERY LINE BELOW WAS MEASURED, NOT READ ABOUT (2026-08-10, agy 1.1.11, real
 * turns on this machine). Five of the measurements changed the design:
 *
 *  1. **`--add-dir` IS NOT OPTIONAL.** Without it the process's `cwd` is
 *     reported back in the `init` event and then IGNORED: the agent works in
 *     `~/.gemini/antigravity-cli/scratch` instead. Measured — asked for
 *     `package.json` in a repo, it looked in the scratch folder and answered
 *     "the file does not exist". With `--add-dir <cwd>` the same question
 *     returned the real version string. An engine that silently answers about
 *     the wrong folder is worse than one that refuses.
 *  2. **THE PROMPT GOES IN ARGV, NOT ON STDIN.** The opposite of Codex.
 *     Measured: `printf … | agy -p ""` exits 1 with *empty prompt. Usage: agy
 *     --print "your prompt here"*. Which means the process must be spawned with
 *     NO SHELL — a multi-line prompt does not survive `cmd.exe` — and `agy` is
 *     a real `.exe`, so no shim shell is needed for it either. Verified with a
 *     prompt carrying newlines, double quotes, a backtick, `$`, `%` and `&`:
 *     it arrived intact.
 *  3. **`--effort` CONFLICTS WITH AN EFFORT-BEARING MODEL NAME**, and the CLI
 *     says so: *invalid model selection (--model "gemini-3.6-flash-low"
 *     --effort "medium")*. The catalog's own rows are base×effort combinations;
 *     the base name is what takes `--effort`. See `core/agymodels.ts`.
 *  4. **RESUME EXISTS AND IS ORDINARY** — `--conversation <id>`, and the same id
 *     comes back. Codex needs its own `exec resume` subcommand with a different
 *     flag vocabulary; this one takes a flag like any other, which is why this
 *     engine is NOT refused on the terminal path (`core/launch.ts`).
 *  5. **PRINT MODE TIMES OUT AT 5 MINUTES BY DEFAULT** (`--print-timeout`,
 *     default `5m0s`). A hosted turn that thinks for six minutes would be cut
 *     off by a default nobody chose, so every non-interactive call here states
 *     its own.
 *
 * Pure: argument vocabularies and mapping tables. No spawning, no vscode.
 */

/** The effort suffixes the catalog bakes into a model name — the ones that make
 *  `--effort` a conflict rather than an addition (measurement 3). */
export const AGY_EFFORTS = ['low', 'medium', 'high'] as const;

/**
 * ‼️ HOW LONG A NON-INTERACTIVE RUN MAY TAKE, SAID OUT LOUD.
 *
 * `--print-timeout` defaults to five minutes. That is a sensible default for
 * somebody asking a question in a terminal and a wrong one for a Console turn
 * or an unattended task, both of which routinely run longer — and the failure it
 * produces is a turn that simply stops, which reads as the engine breaking.
 */
export const AGY_PRINT_TIMEOUT = '120m';

/**
 * ‼️ WHAT A PERMISSION MODE MEANS ON THIS ENGINE — AND THE MEASUREMENT THAT
 * MUST NOT BE ROUNDED OFF.
 *
 * `agy` accepts `--mode plan` and `--mode accept-edits`, and it accepts
 * `--dangerously-skip-permissions`. What it does NOT do is treat `plan` as a
 * restraint: measured on this machine, `--mode plan` with "create a file
 * containing WROTE" **created the file**. The `init` event reports
 * `permission_mode: always-proceed` whatever is passed, because the governing
 * setting is the Antigravity app's own `toolPermission`
 * (`~/.gemini/antigravity-cli/settings.json`), not the flag.
 *
 * So the flag is still sent — it is the engine's own vocabulary and it steers
 * the agent's behaviour — but no surface in this extension may present it as a
 * guarantee. `agyModeNote` is what says so, and it says it on every picker.
 */
export const AGY_MODE: Record<string, string> = {
    plan: 'plan',
    acceptEdits: 'accept-edits'
};

/** The flag form of a permission mode, or nothing when the mode has no
 *  equivalent and the app's own setting is left in charge. */
export function agyModeArgs(mode: string | undefined): string[] {
    const key = String(mode ?? '').trim();
    if (key === 'bypassPermissions') { return ['--dangerously-skip-permissions']; }
    const mapped = AGY_MODE[key];
    return mapped ? ['--mode', mapped] : [];
}

/** One line beside the picker: what this mode will and will not do here. */
export function agyModeNote(mode: string | undefined): string {
    const key = String(mode ?? '').trim();
    const governing = ' On this engine the real restraint is the Antigravity app\'s own tool-permission setting, not this box'
        + ' — measured: plan mode still wrote a file when asked to.';
    if (key === 'plan') {
        return 'Antigravity is asked to plan rather than act.' + governing;
    }
    if (key === 'acceptEdits') {
        return 'Antigravity may edit files without asking.' + governing;
    }
    if (key === 'bypassPermissions') {
        return 'Every tool permission is auto-approved (--dangerously-skip-permissions). Nothing will stop and ask you.';
    }
    return 'Antigravity runs with whatever the Antigravity app is configured to allow; this box adds no restriction of its own.'
        + ' Check its settings if you need one.';
}

/** Whether a model name already carries its effort, so `--effort` would be
 *  refused alongside it (measurement 3). */
export function agyModelCarriesEffort(model: string | undefined): boolean {
    const m = String(model ?? '').trim().toLowerCase();
    return AGY_EFFORTS.some(e => m.endsWith(`-${e}`));
}

/**
 * ‼️ MEASUREMENT 3 HAS A MIRROR, AND IT IS THE ONE THAT COST A DAY (X-26).
 *
 * "`--effort` conflicts with an effort-bearing model name" was measured and
 * acted on. What was never measured is what happens the OTHER way round, and it
 * is not "the engine picks for you" — it is a refusal. Measured 2026-08-11,
 * agy 1.1.11, on this machine:
 *
 *   agy --model gemini-3.5-flash --print "say ok"
 *   → {"status":"ERROR","error":"invalid model selection (--model
 *      \"gemini-3.5-flash\" --effort \"\"): --model gemini-3.5-flash requires
 *      --effort (available: low, medium, high)"}
 *
 * Which is exactly the user's report: Gemini 3.5 Flash with the effort box left
 * on Default died before answering, every time, while the same model at `low`
 * ran. The catalog splits `gemini-3.5-flash-low|medium|high` back into base ×
 * effort so the two boxes are real (models.ts) — and the base half of that split
 * is NOT a selectable id on its own. Only the rows the CLI prints WITHOUT an
 * effort suffix (`claude-sonnet-4-6`, `claude-opus-4-6-thinking`) can be sent
 * bare.
 *
 * So a model that HAS efforts has no "no flag" state to fall back to, and
 * "Default" in front of it is a box with no referent — the thing
 * docs/CONVENTIONS.md already forbids. This function is the single place that
 * decides what Default resolves to, so the picker's label and the command line
 * cannot disagree: the middle setting where the model has one, otherwise the
 * cheaper end, which is the choice to make on somebody's behalf.
 */
export function agyDefaultEffort(efforts: readonly string[] | undefined): string {
    const have = (efforts ?? []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
    if (!have.length) { return ''; }
    for (const want of ['medium', 'low', 'high']) {
        if (have.includes(want)) { return want; }
    }
    return have[0];
}

/** The model/effort pair, resolved to flags the CLI will actually accept. */
export function agyModelArgs(model: string | undefined, effort: string | undefined): string[] {
    const m = String(model ?? '').trim();
    const e = String(effort ?? '').trim();
    if (!m) {
        // With no model the CLI uses the account's default, and an effort the
        // default model does not have is refused (measured: gemini-3.1-pro has
        // no "medium"). Sending the effort alone is therefore a coin flip, so
        // it is not sent.
        return [];
    }
    // ‼️ NEVER BOTH. A stored setting from before the catalog existed can still
    // hold `gemini-3.6-flash-low`; pairing it with an effort is exit code 1.
    return agyModelCarriesEffort(m) || !e ? ['--model', m] : ['--model', m, '--effort', e];
}

export interface AgyTurnInit {
    /** The conversation to continue. Absent = this is the first turn. */
    conversation?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    /** The folder the agent may actually see — NOT optional in practice
     *  (measurement 1); an absent one leaves it in its scratch workspace. */
    cwd?: string;
}

/**
 * The flags for ONE hosted turn. The prompt is NOT here: it is an argv element
 * the caller appends, because it is the one value that may contain anything at
 * all and the builder must not invite anybody to quote it (measurement 2).
 */
export function agyArgs(o: AgyTurnInit): string[] {
    return [
        '--output-format', 'stream-json',
        '--print-timeout', AGY_PRINT_TIMEOUT,
        ...(o.cwd ? ['--add-dir', o.cwd] : []),
        ...agyModelArgs(o.model, o.effort),
        ...agyModeArgs(o.permissionMode),
        ...(o.conversation ? ['--conversation', o.conversation] : [])
    ];
}

export interface AgyRunInit {
    model?: string;
    effort?: string;
    permissionMode?: string;
    cwd?: string;
    /** ‼️ S-19 — the conversation this unattended run continues. This engine
     *  calls it a CONVERSATION and takes `--conversation <id>` (measurement 4);
     *  the JSON envelope reports `conversation_id` back. */
    resume?: string;
}

/**
 * ONE unattended run — a headless task.
 *
 * ‼️ `--output-format json` HERE, NOT `stream-json`. Measured, it prints one
 * object: `{conversation_id, status, response, duration_seconds, num_turns,
 * usage}` — which is the envelope a task archive wants and is remarkably close
 * to `claude -p --output-format json`. The event stream is for the Console,
 * where something is translating it; in an archive a person reads, JSONL is a
 * log dump where a conversation was wanted.
 */
export function agyRunArgs(o: AgyRunInit): string[] {
    return [
        '--output-format', 'json',
        '--print-timeout', AGY_PRINT_TIMEOUT,
        ...(o.cwd ? ['--add-dir', o.cwd] : []),
        ...agyModelArgs(o.model, o.effort),
        ...agyModeArgs(o.permissionMode),
        ...(String(o.resume ?? '').trim() ? ['--conversation', String(o.resume).trim()] : [])
    ];
}

/**
 * The INTERACTIVE line — the TUI a person sits in.
 *
 * `-i` (`--prompt-interactive`) is the flag that runs a first prompt and then
 * STAYS, which is what "start a session with this in it" means; plain `--print`
 * would answer once and exit. `--continue` / `--conversation` are ordinary
 * flags here, so unlike Codex a terminal launch on this engine can genuinely
 * resume (measurement 4).
 */
export function agyTuiArgs(o: AgyRunInit & { conversation?: string; continueLast?: boolean }): string[] {
    return [
        ...(o.conversation ? ['--conversation', o.conversation] : o.continueLast ? ['--continue'] : []),
        ...(o.cwd ? ['--add-dir', o.cwd] : []),
        ...agyModelArgs(o.model, o.effort),
        ...agyModeArgs(o.permissionMode)
    ];
}

/**
 * ‼️ WHAT ANTIGRAVITY HAS NO CHANNEL FOR — said out loud instead of dropped.
 *
 * Like Codex, `agy` takes no extra system prompt: its inputs are the prompt,
 * the workspace's own rule files and its config. So a project brief rides
 * INSIDE the first prompt here too, and the surfaces say so rather than letting
 * a session look briefed when it is not.
 *
 * It also has NO IMAGE FLAG — Codex at least offers `-i <file>`. An attachment
 * on this engine can only be named as a path, which for a picture means the
 * agent is told where it is and cannot look at it. Stated, not hidden.
 */
export const AGY_HAS_NO_SYSTEM_PROMPT_FLAG = true;
export const AGY_HAS_NO_IMAGE_CHANNEL = true;
