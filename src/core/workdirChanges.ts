import { execFile } from 'child_process';

/**
 * U-114 — WHAT A CONVERSATION HAS CHANGED ON DISK, in the shape a phone can
 * read: the working tree's short status and the diff's per-file totals. Not
 * the diff itself — a diff is what a screen with a keyboard reads; from a
 * phone the question is "did it touch what I think it touched", and the
 * stat answers that in twenty lines.
 *
 * Read-only against git, never throws: a folder that is not a repository, a
 * git that is not installed, a command that hangs — each is a SENTENCE the
 * reader gets instead of a stack trace, because the button that asks for this
 * is pressed from a phone with no other window to look in.
 */
export interface ChangesSummary {
    cwd: string;
    /** `git status --short`, trailing space trimmed; '' when clean */
    status: string;
    /** `git diff --stat` (unstaged) + `--cached`, trailing space trimmed; '' when nothing */
    stat: string;
    /** why there is nothing to read, when there is not a working tree to read */
    note?: string;
}

export type GitRun = (args: string[], cwd: string) => Promise<string>;

const run: GitRun = (args, cwd) => new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 10_000, maxBuffer: 1 << 20, windowsHide: true },
        (err, stdout) => { if (err) { reject(err); } else { resolve(String(stdout)); } });
});

export async function changesSummary(cwd: string, git: GitRun = run): Promise<ChangesSummary> {
    if (!cwd) { return { cwd, status: '', stat: '', note: 'This conversation has no working folder.' }; }
    try {
        const inside = (await git(['rev-parse', '--is-inside-work-tree'], cwd)).trim();
        if (inside !== 'true') { return { cwd, status: '', stat: '', note: 'Not a git repository.' }; }
    } catch (e) {
        const m = String((e as Error).message ?? e);
        return {
            cwd, status: '', stat: '',
            note: /ENOENT/.test(m) ? 'git is not installed here.' : 'Not a git repository.'
        };
    }
    // trimEnd, never trim: git's first column is meaning (' M' is unstaged, 'M ' is staged)
    const status = (await git(['status', '--short'], cwd).catch(() => '')).trimEnd();
    const unstaged = (await git(['diff', '--stat'], cwd).catch(() => '')).trimEnd();
    const staged = (await git(['diff', '--stat', '--cached'], cwd).catch(() => '')).trimEnd();
    const stat = [unstaged, staged ? 'staged:\n' + staged : ''].filter(Boolean).join('\n');
    return { cwd, status, stat };
}

/** S-78 — the folder's current commit, or undefined (no folder, not a repo, no commit yet, no git). */
export async function headCommit(cwd: string, git: GitRun = run): Promise<string | undefined> {
    if (!cwd) { return undefined; }
    const h = (await git(['rev-parse', 'HEAD'], cwd).catch(() => '')).trim();
    return /^[0-9a-f]{7,64}$/i.test(h) ? h : undefined;
}

/** S-83 — the commits on HEAD after `since`, `git log --oneline` newest first; undefined when git cannot say. */
export async function commitsAfter(cwd: string, since: string, git: GitRun = run, max = 30): Promise<string | undefined> {
    if (!cwd || !/^[0-9a-f]{7,64}$/i.test(since)) { return undefined; }
    try {
        return (await git(['log', '--oneline', '--no-decorate', `-${max}`, `${since}..HEAD`], cwd)).trimEnd();
    } catch { return undefined; }
}

/** The summary as one message. */
export function changesText(label: string, c: ChangesSummary): string {
    if (c.note) { return `📄 ${label}\n${c.note}`; }
    if (!c.status && !c.stat) { return `📄 ${label}\nWorking tree clean — nothing changed on disk.`; }
    return `📄 ${label}\n` + [c.status, c.stat].filter(Boolean).join('\n\n');
}
