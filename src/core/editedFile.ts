/**
 * X-443 — A FILE AN AGENT WROTE, READ WHERE THE PC IS NOT. On the PC a Console card's ✎ open and
 * vs HEAD chips open the editor (agentfarm.openEditedFile); a phone has no editor, so it reads the
 * file here, read-only, and the diff against the last commit as git prints it.
 *
 * ‼️ ONLY A FILE A CARD NAMES. The set a phone may read is every file a hosted conversation's
 * write tools named (the very chips the card draws); a phone never points the host at a path of
 * its own choosing — the same rule as the session page's transcript (sessionPageTarget).
 *
 * Read-only, never throws: a file that is gone, binary, too large, outside a repository or with no
 * earlier version is a sentence the reader gets, because the question is asked from a phone.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { BridgeRefusal, BridgeRegistry, argStr, optBool } from './bridge';

export type GitRun = (args: string[], cwd: string) => Promise<string>;

export interface EditedFileView {
    file: string;
    name: string;
    exists: boolean;
    size?: number;
    mtime?: number;
    /** the text, up to READ_MAX bytes; absent for a binary or a missing file */
    text?: string;
    truncated?: boolean;
    binary?: boolean;
    /** why there is no text */
    note?: string;
    /** `git diff HEAD -- <file>`, when the diff was asked for */
    diff?: string;
    /** why there is no diff, or that it was cut */
    diffNote?: string;
}

export const READ_MAX = 256 * 1024;
export const DIFF_MAX = 256 * 1024;

const key = (f: string): string => {
    const n = path.normalize(f).replace(/\\/g, '/');
    return process.platform === 'win32' ? n.toLowerCase() : n;
};

/** Every file a hosted conversation's write tools named, as the cards name them, once each. */
export function editedFilesOf(sessions: readonly { messages: readonly { tool?: { file?: string } }[] }[]): string[] {
    const seen = new Map<string, string>();
    for (const s of sessions) {
        for (const m of s.messages) {
            const f = m.tool?.file;
            if (typeof f === 'string' && f && !seen.has(key(f))) { seen.set(key(f), f); }
        }
    }
    return [...seen.values()];
}

/** The file a phone named — only when a card names it too, and then as the card wrote it. */
export function editedFileTarget(args: Record<string, unknown> | undefined, known: readonly string[]): { file: string; diff: boolean } | undefined {
    const want = typeof args?.file === 'string' ? args.file : '';
    if (!want) { return undefined; }
    const hit = known.find(f => key(f) === key(want));
    return hit ? { file: hit, diff: args?.diff === true } : undefined;
}

const gitRun: GitRun = (args, cwd) => new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 10_000, maxBuffer: 4 * DIFF_MAX, windowsHide: true },
        (err, stdout) => { if (err) { reject(err); } else { resolve(String(stdout)); } });
});

async function diffOf(file: string, git: GitRun): Promise<Pick<EditedFileView, 'diff' | 'diffNote'>> {
    let root = '';
    try { root = (await git(['rev-parse', '--show-toplevel'], path.dirname(file))).trim(); } catch (e) {
        return { diffNote: (e as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'git was not found on this machine.' : 'Not inside a git repository.' };
    }
    if (!root) { return { diffNote: 'Not inside a git repository.' }; }
    const rel = path.relative(root, file).replace(/\\/g, '/');
    let out = '';
    try { out = await git(['diff', '--no-color', '--no-ext-diff', 'HEAD', '--', rel], root); } catch {
        return { diffNote: 'git could not compare it with the last commit (a repository with no commit yet?).' };
    }
    if (!out.trim()) {
        let tracked = true;
        try { await git(['ls-files', '--error-unmatch', '--', rel], root); } catch { tracked = false; }
        return { diffNote: tracked ? 'No changes against the last commit.' : 'A new file: git has no earlier version of it.' };
    }
    return out.length > DIFF_MAX ? { diff: out.slice(0, DIFF_MAX), diffNote: 'The diff is cut here: it is longer than a phone should read.' } : { diff: out };
}

/** The file as it is on disk now, and its diff against HEAD when `diff` is asked. */
export async function readEditedFile(file: string, diff: boolean, git: GitRun = gitRun): Promise<EditedFileView> {
    const view: EditedFileView = { file, name: path.basename(file), exists: false };
    if (!path.isAbsolute(file)) {
        view.note = 'This file is named without its folder, so it cannot be found.';
        return view;
    }
    let st: fs.Stats | undefined;
    try { st = fs.statSync(file); } catch { st = undefined; }
    if (!st || !st.isFile()) {
        view.note = 'This file is no longer on disk.';
    } else {
        Object.assign(view, { exists: true, size: st.size, mtime: st.mtimeMs });
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(Math.min(st.size, READ_MAX));
        let n = 0;
        try { n = fs.readSync(fd, buf, 0, buf.length, 0); } finally { fs.closeSync(fd); }
        const head = buf.subarray(0, n);
        if (head.subarray(0, 8000).includes(0)) {
            Object.assign(view, { binary: true, note: 'A binary file: it cannot be shown as text.' });
        } else {
            const t = head.toString('utf8');
            view.text = t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
            if (st.size > READ_MAX) { view.truncated = true; }
        }
    }
    return diff ? { ...view, ...await diffOf(file, git) } : view;
}

export interface EditedFileDeps {
    /** every file a hosted conversation wrote (editedFilesOf over the Console's sessions) */
    known: () => string[];
    readEdited?: (file: string, diff: boolean) => Promise<EditedFileView>;
}

export function registerEditedFileOp(bridge: BridgeRegistry, deps: EditedFileDeps): void {
    bridge.register([
        {
            op: 'console.file.read',
            describe: 'X-443 — A FILE A HOSTED CONVERSATION WROTE, READ AS IT IS ON DISK NOW: what the phone shows when a Console card\'s ✎ open or vs HEAD chip is tapped. '
                + 'Only a file some card names (a write tool\'s file_path in a live Console session) is read — any other path is refused by name. '
                + 'The text is the first 256 KB (`truncated` says when there is more); a binary or missing file comes back with a sentence in `note`. '
                + 'diff:true adds `git diff HEAD -- <file>` as `diff`, or a sentence in `diffNote` (not a repository, no change, a new file). Nothing is written. '
                + 'args: file (as the card names it), diff? (default false). Answer: { file, name, exists, size?, mtime?, text?, truncated?, binary?, note?, diff?, diffNote? }.',
            handler: async (args) => {
                const t = editedFileTarget({ file: argStr(args, 'file'), diff: optBool(args, 'diff') }, deps.known());
                if (!t) { throw new BridgeRefusal('no hosted conversation wrote that file — only a file a Console card names can be read (console.sessions lists them).', { step: 'known' }); }
                return (deps.readEdited ?? readEditedFile)(t.file, t.diff);
            }
        }
    ]);
}
