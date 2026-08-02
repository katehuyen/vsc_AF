/**
 * Git, only as much of it as "show me what changed" needs.
 *
 * The session's own hunks (codeedits.ts) answer *what this session wrote*.
 * This answers the other question — *what does that file look like now versus
 * the last commit* — and the two are deliberately separate surfaces, because
 * conflating them would let a later session's work show up as this one's.
 *
 * No git extension API, no dependency: two `git` calls, both read-only.
 */

import * as cp from 'child_process';
import * as path from 'path';

function run(args: string[], cwd: string, cb: (out?: string) => void): void {
    cp.execFile('git', args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => cb(err ? undefined : String(stdout)));
}

/** Repository root that contains `dir`, or undefined when it is not a repo. */
export function gitRoot(dir: string, cb: (root?: string) => void): void {
    run(['rev-parse', '--show-toplevel'], dir, out =>
        cb(out ? out.trim().replace(/\\/g, '/') || undefined : undefined));
}

/** Path as git names it: relative to the repo root, forward slashes. */
export function repoRelative(root: string, file: string): string {
    return path.relative(root, file).replace(/\\/g, '/');
}

/**
 * The file's content at HEAD. `undefined` means git could not produce it —
 * which for a file the agent created is the honest answer "it did not exist",
 * so callers diff against an empty left-hand side and say so.
 */
export function contentAtHead(root: string, relPath: string, cb: (content?: string) => void): void {
    run(['show', `HEAD:${relPath}`], root, cb);
}

// ---------------------------------------------------------------------------
// commit log — the project timeline's git source
// ---------------------------------------------------------------------------

export interface GitCommit {
    hash: string;
    /** epoch ms */
    ts: number;
    author: string;
    subject: string;
}

/**
 * Parse `git log` output in the exact format `recentCommits` asks for.
 *
 * Separated from the call so the parsing is testable without a repository, and
 * NUL-delimited rather than space- or pipe-delimited because a commit subject
 * is free text: every printable separator has already appeared in somebody's
 * commit message. A row that does not have all four fields is dropped rather
 * than half-read — a commit with a mangled author is worse than one missing.
 */
export function parseGitLog(stdout: string): GitCommit[] {
    const out: GitCommit[] = [];
    for (const line of String(stdout ?? '').split(/\r?\n/)) {
        if (!line.trim()) { continue; }
        const parts = line.split('\0');
        if (parts.length < 4) { continue; }
        const [hash, at, author] = parts;
        const seconds = Number(at);
        if (!hash.trim() || !isFinite(seconds) || seconds <= 0) { continue; }
        out.push({
            hash: hash.trim(),
            ts: seconds * 1000,
            author: author.trim(),
            // the subject is the last field and cannot contain a newline;
            // rejoining the tail means nothing is lost if it ever holds a NUL
            subject: parts.slice(3).join('\0').trim()
        });
    }
    return out;
}

/**
 * Recent commits in one repository.
 *
 * ‼️ CACHED PER REPOSITORY, because the caller is a page that repaints.
 * A project with four code roots would otherwise spawn four `git log`
 * processes on every refresh of a panel that refreshes on a timer — the
 * classic way a read-only feature becomes the reason a laptop's fan runs.
 * The window is short enough that a commit made while the page is open shows
 * up on the next repaint but one.
 *
 * Failure is silent and empty: a code root that is not a repository, or a
 * folder that was moved, must not make a project's timeline unopenable.
 */
const COMMIT_TTL_MS = 60_000;
const commitCache = new Map<string, { at: number; rows: GitCommit[] }>();

export function recentCommits(
    repo: string, opts: { max?: number; sinceDays?: number }, cb: (rows: GitCommit[]) => void
): void {
    const max = Math.max(1, Math.min(500, opts.max ?? 100));
    const sinceDays = Math.max(1, Math.min(3650, opts.sinceDays ?? 180));
    const key = `${repo}|${max}|${sinceDays}`;
    const hit = commitCache.get(key);
    const now = Date.now();
    if (hit && now - hit.at < COMMIT_TTL_MS) { cb(hit.rows); return; }
    run([
        'log', `--max-count=${max}`, `--since=${sinceDays}.days.ago`,
        '--no-merges', '--format=%H%x00%at%x00%an%x00%s'
    ], repo, out => {
        const rows = out ? parseGitLog(out) : [];
        commitCache.set(key, { at: Date.now(), rows });
        cb(rows);
    });
}

/** Drop the cache — for a test, or after something that certainly changed it. */
export function clearCommitCache(): void { commitCache.clear(); }
