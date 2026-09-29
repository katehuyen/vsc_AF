import { LINE_BREAKS } from './lineBreaks';

/** Which quoting rules the terminal's shell reads a typed line by. */
export type ShellKind = 'powershell' | 'cmd' | 'posix';

export function shellKindOf(shellPath: string | undefined, platform: string): ShellKind {
    const s = String(shellPath ?? '').toLowerCase().replace(/\\/g, '/');
    if (/(^|\/)(pwsh|powershell)(\.exe)?$/.test(s)) { return 'powershell'; }
    if (/(^|\/)cmd(\.exe)?$/.test(s)) { return 'cmd'; }
    if (s) { return 'posix'; }
    return platform === 'win32' ? 'powershell' : 'posix';
}

// PowerShell also closes a single-quoted string on the typographic quotes ‘ ’ ‚ ‛.
const PS_SINGLE = /['\u2018\u2019\u201A\u201B]/g;

/**
 * `claude <text>` typed for the user to review: the text is ONE literal argument
 * in that shell — no break, tab or control byte can press a key, and no quote,
 * `$`, backtick or `%` can end the string or be evaluated.
 */
export function handoffCommand(text: string, kind: ShellKind, max = 2000): string {
    const flat = String(text ?? '')
        .replace(LINE_BREAKS, ' ')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        .trim()
        .slice(0, max);
    if (kind === 'powershell') { return `claude '${flat.replace(PS_SINGLE, '$&$&')}'`; }
    if (kind === 'posix') { return `claude '${flat.replace(/'/g, `'\\''`)}'`; }
    // cmd has no literal quoting: inside "…" only these three still act.
    return `claude "${flat.replace(/["%!]/g, ' ')}"`;
}
