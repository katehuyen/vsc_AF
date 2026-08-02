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

/** One offered value of a launch dimension. `id: ''` is always "leave it alone". */
export interface LaunchChoice {
    id: string;
    label: string;
    detail: string;
}

export interface LaunchOptions {
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

/** Build the command line for a launch. `exe` lets a caller reuse it for a
 *  wrapper; everything else follows `claude --help` exactly. */
export function buildLaunchCommand(exe: string, o: LaunchOptions = {}): string {
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
    if (o.model?.trim()) { bits.push(o.model.trim()); }
    if (o.effort?.trim()) { bits.push('effort ' + o.effort.trim()); }
    if (o.permissionMode?.trim()) { bits.push(o.permissionMode.trim()); }
    if (o.name?.trim()) { bits.push(`“${o.name.trim()}”`); }
    if (o.prompt?.trim()) { bits.push('with a first prompt'); }
    return bits.length ? bits.join(' · ') : 'CLI defaults';
}

/** A saved, named launch setup (`agentFarm.launchProfiles`). */
export interface LaunchProfile extends LaunchOptions {
    name: string;
}

/** The always-applied defaults (`agentFarm.launchDefaults`) — the three
 *  dimensions that make sense for EVERY session, including resumes. Name and
 *  first prompt are per-launch by nature and deliberately not defaultable. */
export interface LaunchDefaults {
    model?: string;
    effort?: string;
    permissionMode?: string;
}

/** Explicit choice wins over the default; a default of '' changes nothing. */
export function withDefaults(o: LaunchOptions, d: LaunchDefaults | undefined): LaunchOptions {
    const pick = (own: string | undefined, def: string | undefined) =>
        (own?.trim() ? own.trim() : (def?.trim() ?? ''));
    return {
        ...o,
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
    return errors;
}
