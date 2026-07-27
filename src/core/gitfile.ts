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
