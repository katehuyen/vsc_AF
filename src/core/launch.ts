/**
 * Session launch — the vocabulary and the command line of "start a session".
 *
 * Until now every interactive session started as a bare `claude`: model,
 * effort, permission mode, name and first prompt were things the user typed
 * into the terminal by hand, every time. This module owns the vocabulary
 * (which flags exist, what they mean) and turns a set of choices into the
 * exact command line — so the launcher picker, the plain Start/Continue/Resume
 * commands and the bridge op all build the same string, and the tests can
 * check it without VS Code.
 *
 * Everything here is pure. Flags are only emitted for choices that were
 * actually made: an empty field means "no flag", i.e. the CLI's / the agent's
 * own default stays in charge.
 */

import { engineFirstPromptFlag, engineOf, EngineId, ENGINES, tuiArgs } from './consoleEngine';

/** One offered value of a launch dimension. `id: ''` is always "leave it alone". */
export interface LaunchChoice {
    id: string;
    label: string;
    detail: string;
}

export interface LaunchOptions {
    /**
     * ‼️ WHICH ENGINE (X-18). Absent means `claude` — what every caller written
     * before engines existed means, and what this whole module was built around.
     * It is a dimension like the model, not a different launcher: one set of
     * choices, one command builder, so a surface cannot offer a session on an
     * engine it then fails to start.
     */
    engine?: EngineId;
    /** --model (alias or full id); '' = the agent's / CLI's own default */
    model?: string;
    /** --effort: low | medium | high | xhigh | max; '' = default */
    effort?: string;
    /** --permission-mode; '' = default (ask) */
    permissionMode?: string;
    /** -n: display name shown in the prompt box, the /resume picker and the terminal title */
    name?: string;
    /** first prompt, passed as the positional argument */
    prompt?: string;
    /** --resume <id> */
    resume?: string;
    /** --continue (mutually exclusive with resume) */
    continueLast?: boolean;
    /**
     * --append-system-prompt-file <path>: the project this session belongs to,
     * told to the agent before the user types anything (see projectContext.ts).
     *
     * A FILE and not inline text, measured: this command line is handed to a
     * shell, and multi-line text does not survive that on any platform. The
     * path is quoted here for the same reason a name is.
     */
    projectContextFile?: string;
    /**
     * ‼️ THE FOLDER, WHICH ON ONE ENGINE IS NOT OPTIONAL.
     *
     * Claude Code and Codex work in the process's own directory and the terminal
     * already sets it. Antigravity does NOT: measured, it reports the cwd back
     * and then works in `~/.gemini/antigravity-cli/scratch` unless the folder is
     * handed to it with `--add-dir`. Left out, a terminal session on that engine
     * opens in the right place and answers about the wrong one.
     */
    cwd?: string;
    /**
     * ‼️ THE OTHER EXECUTOR (M-22) — a named `agentFarm.cliProfiles` entry.
     *
     * It is the one field here that is NOT a flag, and it is here anyway
     * because it is the only thing `engine` can contradict. A CLI profile does
     * not add arguments to an engine's command line, it REPLACES the whole
     * line (`tasks.ts` — `const command = profile ? …`, on the headless path
     * and the terminal one alike), so a run carrying both does not blend them:
     * the profile runs and the engine is dropped without a word. That is the
     * contradiction `validateLaunch` refuses, and it can only refuse a pair it
     * can see. The command builders below never emit it (test_launch.js holds
     * them to that) — it decides WHICH program runs, not how it is called.
     */
    cli?: string;
}

/**
 * ‼️ M-22 — ONE SENTENCE, READ BY BOTH DOORS. The bridge refused this pair and
 * the page refused it in different words, which is how two surfaces start
 * describing the same rule differently and one of them eventually stops
 * applying it.
 *
 * ‼️ NO BACKTICKS, deliberately. The page shows this verbatim in the composer's
 * message strip (`media/tasksPage.js` — escaped into `.ntmsg`), so markup meant
 * for an agent reading a bridge error would sit there as literal punctuation.
 * The two field names are the same word on both doors — `engine` and `cli` are
 * the args AND the form's rows — so naming them plainly serves both readers.
 */
export const ONE_EXECUTOR =
    'A run has ONE executor: an engine, or a CLI profile — never both. '
    + 'An engine is a machine Agent Farm understands and can build a command line for; '
    + 'a CLI profile (cli, from agentFarm.cliProfiles) is a template for a binary it knows '
    + 'nothing about, and it replaces that command line entirely — so with both set the '
    + 'profile runs and the engine is silently ignored. Clear one of them.';

/**
 * ‼️ M-14 — IS THIS A MODEL ID WE MAY PUT ON A COMMAND LINE?
 *
 * A charset guard, not a catalogue: the model reaches `--model ${m}` inside a
 * command STRING (`tasks.ts` — `modelArgs`), so a stored value must never be
 * able to smuggle shell syntax. It is not asking whether the model exists —
 * that is the engine's answer, and a farm that hardcoded the list would refuse
 * every model released after it.
 *
 * ‼️ `/` IS PART OF THE CHARSET, and leaving it out was a real refusal: every
 * engine except Claude names a model `provider/model`, so `schedules.add`
 * answered "model must be a model id/alias (e.g. opus, sonnet, haiku)" to
 * `opencode/nemotron-3.5-lightning-free` — a schedule simply could not be given
 * an OpenCode model. Measured by installing one. A slash is not syntax in
 * PowerShell, cmd or a POSIX shell; it is an ordinary character in an ordinary
 * token, which is exactly why it was safe to have been keeping out by accident.
 */
export function modelIdOk(m: unknown): boolean {
    return /^[\w./:-]+$/.test(String(m ?? ''));
}

/** ‼️ The refusal names BOTH shapes, because the old one named only Claude's
 *  aliases and that is precisely the reader who then believes an engine model
 *  is unsupported rather than mistyped. */
export const MODEL_ID_REFUSAL =
    'model must be a model id or alias — a bare name like opus / sonnet / haiku, '
    + 'or an engine model like opencode/nemotron-3.5-lightning-free. '
    + 'Letters, digits, dot, colon, slash and hyphen only: it goes on a command line.';

/**
 * Do these two say different things about which program runs?
 *
 * The condition lives here once so the panel, the bridge ops and
 * `validateLaunch` cannot drift apart on what counts as a conflict. `claude`
 * is deliberately NOT one: an absent engine already means claude, so naming it
 * beside a profile states nothing the profile does not already override.
 */
export function twoExecutors(cli: unknown, engine: unknown): boolean {
    const e = String(engine ?? '').trim().toLowerCase();
    return !!String(cli ?? '').trim() && !!e && e !== 'claude';
}

/** The three dimensions the launcher offers. Kept verbatim from `claude --help`
 *  so a picker never offers a flag value the installed CLI would reject. */
export const EFFORT_CHOICES: LaunchChoice[] = [
    { id: '', label: 'Default', detail: 'no --effort flag — the CLI decides' },
    { id: 'low', label: 'low', detail: 'shortest reasoning — cheap, for mechanical work' },
    { id: 'medium', label: 'medium', detail: 'balanced' },
    { id: 'high', label: 'high', detail: 'more reasoning per turn' },
    { id: 'xhigh', label: 'xhigh', detail: 'deep reasoning — slower, pricier' },
    { id: 'max', label: 'max', detail: 'maximum reasoning — the expensive end' }
];

export const PERMISSION_CHOICES: LaunchChoice[] = [
    { id: '', label: 'Default', detail: 'no --permission-mode flag — asks before acting, as configured' },
    { id: 'plan', label: 'plan', detail: 'plans only, changes nothing until you approve' },
    { id: 'acceptEdits', label: 'acceptEdits', detail: 'file edits auto-approved, everything else still asks' },
    { id: 'auto', label: 'auto', detail: 'the CLI decides what is safe to run unattended' },
    { id: 'manual', label: 'manual', detail: 'asks for every action' },
    { id: 'dontAsk', label: 'dontAsk', detail: 'stops instead of asking when it would need permission' },
    { id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'EVERY action auto-approved — no prompts at all' }
];

/** Model list = the user's own `agentFarm.modelAliases` knowledge base, with
 *  "Default" in front. One list, kept current in one place (Farm Settings),
 *  shows up in every picker — including this one. */
export function modelChoices(aliases: string[]): LaunchChoice[] {
    return [
        { id: '', label: 'Default', detail: "the agent's own model setting / the CLI default" },
        ...aliases.filter(a => typeof a === 'string' && a.trim())
            .map(a => ({ id: a.trim(), label: a.trim(), detail: 'passed as --model' }))
    ];
}

/**
 * Make a free-text value safe to sit inside the double quotes of a command
 * line that may be read by PowerShell, cmd.exe or a POSIX shell — the three
 * shells an integrated or external terminal can be running.
 *
 * `"` would close the quoting (→ ') and a backtick is PowerShell's escape
 * character (→ dropped); newlines would submit the line early (→ spaces).
 * `$` / `%` are LEFT ALONE on purpose: mangling the user's own text silently
 * is worse than a shell expanding a variable, and the launcher prints the
 * exact command line before it runs anything, so what will happen is visible.
 */
export function quoteArg(s: string): string {
    return '"' + String(s ?? '').replace(/"/g, "'").replace(/`/g, '').replace(/\s+/g, ' ').trim() + '"';
}

/**
 * The interactive line for an engine that is NOT Claude Code.
 *
 * ‼️ TWO OF CLAUDE'S DIMENSIONS HAVE NO EQUIVALENT ON EITHER OF THEM, AND THEY
 * ARE DROPPED LOUDLY RATHER THAN QUIETLY:
 *   · `-n` (session display name) — these engines name their own sessions;
 *   · `--append-system-prompt-file` — neither has a system-prompt channel (see
 *     CODEX_HAS_NO_SYSTEM_PROMPT_FLAG / AGY_HAS_NO_SYSTEM_PROMPT_FLAG), so a
 *     project brief cannot ride the command line at all and the caller has to
 *     put it in the prompt.
 *
 * ‼️ AND THE THIRD ONE — RESUME — DEPENDS ON WHICH ENGINE IT IS, which is the
 * measurement that stopped this from being one rule. `codex resume <id>` is its
 * own subcommand with its own flag vocabulary and nobody here has measured it,
 * so a Codex resume goes through the Console. `agy --conversation <id>` is an
 * ordinary flag on the ordinary command, measured to come back with the same id
 * and the context carried — so on that engine a terminal resume is real, and
 * refusing it "because it is not Claude" would have been a rule pretending to be
 * a fact (see EngineTransport.resumeInTerminal).
 *
 * `describeLaunch` names the engine so a picker cannot claim otherwise.
 */
function buildOtherEngineCommand(exe: string, engine: EngineId, o: LaunchOptions): string {
    const spec = ENGINES[engine];
    const parts = [exe || spec.exe, ...tuiArgs(engine, {
        model: o.model, effort: o.effort, permissionMode: o.permissionMode,
        // Only the engine that needs it is given it — `codexTuiArgs` uses `-C`
        // for the same job and the terminal already sets the directory there.
        ...(engine === 'agy' ? { cwd: o.cwd } : {}),
        ...(spec.resumeInTerminal
            ? { conversation: o.resume, continueLast: o.continueLast }
            : {})
    })];
    if (o.prompt?.trim()) {
        // ‼️ THE FIRST PROMPT IS A FLAG ON TWO OF THEM AND A POSITIONAL ON THE
        // THIRD, and the difference is not cosmetic — it is whether the person
        // ends up in a conversation or watching one answer and exit. Which is
        // which lives in `engineFirstPromptFlag`, with the measurement.
        parts.push(...engineFirstPromptFlag(engine), quoteArg(o.prompt));
    }
    return parts.join(' ');
}

/** Build the command line for a launch. `exe` lets a caller reuse it for a
 *  wrapper; everything else follows `claude --help` exactly — or, on another
 *  engine, that engine's own measured help (see buildCodexCommand). */
export function buildLaunchCommand(exe: string, o: LaunchOptions = {}): string {
    const spec = engineOf(o.engine);
    if (spec.id !== 'claude') {
        return buildOtherEngineCommand(exe && exe !== 'claude' ? exe : spec.exe, spec.id, o);
    }
    const parts = [exe || 'claude'];
    // Resume/continue first — they say WHICH conversation; the rest tunes it.
    if (o.resume) { parts.push('--resume', o.resume); }
    else if (o.continueLast) { parts.push('--continue'); }
    if (o.model?.trim()) { parts.push('--model', o.model.trim()); }
    if (o.effort?.trim()) { parts.push('--effort', o.effort.trim()); }
    if (o.permissionMode?.trim()) { parts.push('--permission-mode', o.permissionMode.trim()); }
    // The project context rides on EVERY launch, resumes included — the flag
    // does not survive --resume (measured; see consoleproto.hostArgs). Quoted
    // with plain quotes rather than quoteArg: quoteArg collapses whitespace,
    // which is right for a name typed by a person and wrong for a path.
    if (o.projectContextFile?.trim() && !o.projectContextFile.includes('"')) {
        parts.push('--append-system-prompt-file', `"${o.projectContextFile.trim()}"`);
    }
    if (o.name?.trim()) { parts.push('-n', quoteArg(o.name)); }
    // The first prompt is the positional argument and must stay last.
    if (o.prompt?.trim()) { parts.push(quoteArg(o.prompt)); }
    return parts.join(' ');
}

/** One-line summary of what is set, for a picker row / a toast. */
export function describeLaunch(o: LaunchOptions): string {
    const bits: string[] = [];
    // The engine leads, and only when it is not the default: a line that says
    // "Codex · opus" would be nonsense, and one that says "Claude Code" on every
    // launch spends a column on the answer nobody asked for.
    const spec = engineOf(o.engine);
    if (spec.id !== 'claude') { bits.push(spec.label); }
    if (o.model?.trim()) { bits.push(o.model.trim()); }
    if (o.effort?.trim()) { bits.push('effort ' + o.effort.trim()); }
    if (o.permissionMode?.trim()) { bits.push(o.permissionMode.trim()); }
    if (o.name?.trim()) { bits.push(`“${o.name.trim()}”`); }
    if (o.prompt?.trim()) { bits.push('with a first prompt'); }
    return bits.length ? bits.join(' · ') : 'CLI defaults';
}

/**
 * ‼️ WHERE A LAUNCH RUNS — a dimension of the launch, not of the command line.
 *
 * It is declared here rather than inside `activate()` because it is part of a
 * saved SETUP (see `LaunchProfile.surface`): a profile that stored the engine,
 * the model and the permissions but not whether the session opens in the
 * Console or in a terminal reproduced everything about a launch except the
 * window it happens in.
 */
export type RunSurface = 'terminal' | 'console';

/** A saved, named launch setup (`agentFarm.launchProfiles`). */
export interface LaunchProfile extends LaunchOptions {
    name: string;
    /**
     * ‼️ Console or terminal, saved WITH the setup. Absent means the profile
     * predates this and says nothing — the launcher then keeps whatever it is
     * already set to, which is what such a profile has always done. It is not
     * a `LaunchOptions` field because it is not a flag: it decides which
     * surface starts the session, not what is on its command line.
     */
    surface?: RunSurface;
}

/** The always-applied defaults (`agentFarm.launchDefaults`) — the three
 *  dimensions that make sense for EVERY session, including resumes. Name and
 *  first prompt are per-launch by nature and deliberately not defaultable. */
export interface LaunchDefaults {
    /** ‼️ WHICH ENGINE, SET ONCE (X-18). "Always Codex" is a preference, not a
     *  choice to be repeated on every launch — and an empty value keeps meaning
     *  `claude`, so an existing settings file changes nothing. */
    engine?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
}

/** Explicit choice wins over the default; a default of '' changes nothing. */
export function withDefaults(o: LaunchOptions, d: LaunchDefaults | undefined): LaunchOptions {
    const pick = (own: string | undefined, def: string | undefined) =>
        (own?.trim() ? own.trim() : (def?.trim() ?? ''));
    const engine = pick(o.engine, d?.engine);
    return {
        ...o,
        ...(engine ? { engine: engine as EngineId } : {}),
        model: pick(o.model, d?.model),
        effort: pick(o.effort, d?.effort),
        permissionMode: pick(o.permissionMode, d?.permissionMode)
    };
}

/** Sanity-check values that came from settings or the bridge (not from a
 *  picker), so a typo fails with a readable message instead of the CLI
 *  refusing to start in a terminal the user then has to read. */
export function validateLaunch(o: LaunchOptions): string[] {
    const errors: string[] = [];
    const known = (list: LaunchChoice[], v: string) => list.some(c => c.id === v);
    // ‼️ The NAME only — whether the engine can RUN is a question about this
    // machine and belongs to core/engines.ts (`engineRefusal`). A typo has to
    // fail here, before anything spawns, with the list of real names.
    if (o.engine && !(o.engine in ENGINES)) {
        errors.push(`engine "${o.engine}" is not one of: ${Object.keys(ENGINES).join(', ')}`);
    }
    if (o.effort?.trim() && !known(EFFORT_CHOICES, o.effort.trim())) {
        errors.push(`effort "${o.effort.trim()}" is not one of: ` +
            EFFORT_CHOICES.filter(c => c.id).map(c => c.id).join(', '));
    }
    if (o.permissionMode?.trim() && !known(PERMISSION_CHOICES, o.permissionMode.trim())) {
        errors.push(`permission mode "${o.permissionMode.trim()}" is not one of: ` +
            PERMISSION_CHOICES.filter(c => c.id).map(c => c.id).join(', '));
    }
    if (o.resume && o.continueLast) {
        errors.push('resume and continue are mutually exclusive');
    }
    // ‼️ M-22 — REFUSED, NOT RANKED. Ranking them is what the runner already
    // does, and that is the bug: the loser is not reported anywhere, so a
    // schedule set to OpenCode with an old CLI profile left on it runs the
    // profile at 3 a.m. and says nothing. One of the caller's two statements
    // has to be a no-op; the only honest moment to say so is before it starts.
    if (twoExecutors(o.cli, o.engine)) {
        errors.push(ONE_EXECUTOR);
    }
    // ‼️ REFUSED, NOT SILENTLY DROPPED — AND ONLY ON THE ENGINE THAT CANNOT DO
    // IT. `codex resume` is its own subcommand with its own flag vocabulary and
    // nobody here has measured it; the measured resume there is `codex exec
    // resume`, which is the Console's path. Building a terminal line that
    // ignored the id would open a NEW conversation while the caller believed it
    // had continued one. Antigravity takes `--conversation <id>` on the ordinary
    // command (measured), so it is not refused — the rule follows the engine's
    // own vocabulary rather than "is it Claude".
    if (o.engine && (o.resume || o.continueLast) && !engineOf(o.engine).resumeInTerminal) {
        errors.push(`${engineOf(o.engine).label} cannot be resumed from a terminal here — continue it in the Console, which resumes the thread by id`);
    }
    return errors;
}
