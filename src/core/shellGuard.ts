/**
 * X-439 — THE SHELL RULE, HELD BY CODE: A PAYLOAD NEVER TRAVELS INSIDE A COMMAND.
 *
 * A command string is parsed by a shell before the program ever sees it, and
 * that parse is silent: backtick spans vanish, non-ASCII letters are re-encoded,
 * a quoted heredoc still loses a level of backslashes and `${…}` is expanded
 * (all measured on this fleet, the last one again while this guard was built).
 * The rule was written and broken twice in one session, so it is held here, in
 * front of every `PreToolUse` on the shell tool, the way the bridge guard holds
 * the session-id rule.
 *
 * ‼️ WHAT IS REFUSED — narrow, because this runs before every shell call:
 *   - a non-ASCII character anywhere in the command (a payload or a path);
 *   - a backtick — on Claude only: its shell is Git Bash, where a backtick is a
 *     substitution; Codex's shell tool on Windows is PowerShell, where the
 *     backtick is the ordinary escape character;
 *   - a heredoc whose body carries a backslash or `${`, or runs past
 *     HEREDOC_MAX_LINES lines;
 *   - one quoted literal longer than LITERAL_MAX characters (an inline script,
 *     a commit message, prose for `echo`).
 * ‼️ WHAT IS LET THROUGH ON PURPOSE: a Windows path with backslashes, a short
 * ASCII heredoc (a commit message the CLI's own guidance writes that way), a
 * one-line `node -e`. And `af:allow-shell` anywhere in the command always runs.
 *
 * Pure: no `fs`, no `vscode`.
 */

export const SHELL_GUARD_ESCAPE = 'af:allow-shell';
export const HEREDOC_MAX_LINES = 20;
export const LITERAL_MAX = 600;

export type ShellGuardRule = 'non-ascii' | 'backtick' | 'heredoc' | 'long-literal';

export interface ShellGuardAsk {
    tool?: string;
    input?: Record<string, unknown>;
    /** `claude` | `codex` | … — decides whether a backtick is a trap or an escape */
    engine?: string;
}

export interface ShellGuardVerdict {
    rule: ShellGuardRule;
    tool: string;
    /** what was found, short and ASCII-safe, for the log and the card */
    what: string;
    /** the one line the agent is given instead */
    reason: string;
}

function commandOf(input: Record<string, unknown> | undefined): string {
    const v = input?.command;
    if (typeof v === 'string') { return v; }
    if (Array.isArray(v)) { return v.filter(x => typeof x === 'string').join(' '); }
    return '';
}

/** The first non-ASCII character, named by its code point. */
function firstNonAscii(text: string): string | undefined {
    const m = /[^\x00-\x7F]/u.exec(text);
    if (!m) { return undefined; }
    const cp = m[0].codePointAt(0) ?? 0;
    return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Every heredoc body in the command, and the command WITHOUT them (the
 * terminator lines stay, so `)"` after a `$(cat <<'EOF' … EOF` closes its quote).
 * `<<<` is a here-string, not a heredoc.
 */
export function splitHeredocs(text: string): { docs: { delim: string; body: string[] }[]; outside: string } {
    const lines = text.split(/\r?\n/);
    const docs: { delim: string; body: string[] }[] = [];
    const keep: string[] = [];
    const op = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g;
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        keep.push(line);
        op.lastIndex = 0;
        const pending: { strip: boolean; delim: string }[] = [];
        for (let m = op.exec(line); m; m = op.exec(line)) { pending.push({ strip: m[1] === '-', delim: m[3] }); }
        i++;
        for (const h of pending) {
            const body: string[] = [];
            while (i < lines.length) {
                const l = h.strip ? lines[i].replace(/^\t+/, '') : lines[i];
                if (l.trimEnd() === h.delim) { i++; break; }
                body.push(lines[i]);
                i++;
            }
            docs.push({ delim: h.delim, body });
        }
    }
    return { docs, outside: keep.join('\n') };
}

/** The longest single- or double-quoted literal, outside heredoc bodies. */
export function longestLiteral(text: string): number {
    let best = 0, q = '', len = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (!q) {
            if (c === '\\') { i++; continue; }
            // a comment's apostrophe ("# it's") opens nothing
            if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
                const nl = text.indexOf('\n', i);
                i = nl < 0 ? text.length : nl;
                continue;
            }
            if (c === '\'' || c === '"') { q = c; len = 0; }
            continue;
        }
        if (q === '"' && c === '\\') { i++; len += 2; continue; }
        if (c === q) { best = Math.max(best, len); q = ''; continue; }
        len++;
    }
    return q ? Math.max(best, len) : best;
}

const WAY_OUT = `If it really is meant, put ${SHELL_GUARD_ESCAPE} in the command (a trailing "# ${SHELL_GUARD_ESCAPE}") and it runs.`;
const INTO_A_FILE = 'Write the text to a file with the Write tool and let the command only NAME the file '
    + '(node script.js, git commit -F msg.txt, af.js <op> @args.json).';

export function shellRefusal(rule: ShellGuardRule, what: string): string {
    switch (rule) {
        case 'non-ascii':
            return `This shell command carries a non-ASCII character (${what}); the shell re-encodes it before the program `
                + `sees it and nothing reports the damage. ${INTO_A_FILE} For a path with such letters use the `
                + `Read / Glob / Grep tools, or a script written with Write that names it. ${WAY_OUT}`;
        case 'backtick':
            return 'This shell command carries a backtick; the shell eats a backtick span and its quotes without an '
                + `error. Use $(...) for a substitution. ${INTO_A_FILE} ${WAY_OUT}`;
        case 'heredoc':
            return `This shell command carries a heredoc (${what}); here a quoted heredoc still loses a level of `
                + `backslashes and expands \${...}, silently. Write the file with the Write tool instead. ${WAY_OUT}`;
        default:
            return `This shell command carries ${what} of inline text; a payload inside a command is parsed by the `
                + `shell first. ${INTO_A_FILE} ${WAY_OUT}`;
    }
}

/** ‼️ THE ONE DECISION. Undefined is the ordinary answer. */
export function shellGuardVerdict(ask: ShellGuardAsk): ShellGuardVerdict | undefined {
    const tool = String(ask.tool ?? '').trim();
    if (tool !== 'Bash') { return undefined; }
    const cmd = commandOf(ask.input);
    if (!cmd || cmd.includes(SHELL_GUARD_ESCAPE)) { return undefined; }
    const hit = (rule: ShellGuardRule, what: string): ShellGuardVerdict =>
        ({ rule, tool, what, reason: shellRefusal(rule, what) });

    const na = firstNonAscii(cmd);
    if (na) { return hit('non-ascii', na); }
    const engine = String(ask.engine ?? 'claude').toLowerCase();
    if (engine !== 'codex' && cmd.includes('`')) { return hit('backtick', 'a backtick'); }

    const { docs, outside } = splitHeredocs(cmd);
    for (const d of docs) {
        const text = d.body.join('\n');
        if (text.includes('\\')) { return hit('heredoc', `<<${d.delim} with a backslash`); }
        if (text.includes('${')) { return hit('heredoc', `<<${d.delim} with \${...}`); }
        if (d.body.length > HEREDOC_MAX_LINES) { return hit('heredoc', `<<${d.delim} of ${d.body.length} lines`); }
    }
    const longest = longestLiteral(outside);
    if (longest > LITERAL_MAX) { return hit('long-literal', `${longest} characters`); }
    return undefined;
}

/** A refusal as it is kept; `id` is the rule, so the shared guard log can hold it. */
export interface ShellGuardCatch extends ShellGuardVerdict {
    id: ShellGuardRule;
    ts: number;
    sessionId: string;
}

/** Which rules stand in front of an engine's shell tool — none where no hook reaches Agent Farm. */
export function shellGuardRules(engine: string): ShellGuardRule[] {
    const e = String(engine ?? '').trim().toLowerCase();
    if (e === 'claude') { return ['non-ascii', 'backtick', 'heredoc', 'long-literal']; }
    if (e === 'codex') { return ['non-ascii', 'heredoc', 'long-literal']; }
    return [];
}

/** Which engine a hook payload came from: Codex's transcripts are its rollout files. */
export function hookEngineOf(transcriptPath: unknown): string {
    const p = String(transcriptPath ?? '');
    return /[\\/]\.?codex[\\/]|rollout-/i.test(p) ? 'codex' : 'claude';
}
