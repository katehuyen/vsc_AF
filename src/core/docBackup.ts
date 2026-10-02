import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * X-460 — THE VERSION A WRITE IS ABOUT TO REPLACE, KEPT.
 *
 * Every project document write goes through `safeWriteDoc`, guarded and atomic,
 * and until now nothing survived it: an archive sweep that dropped lines, a
 * replace that was meant for another file, and the previous text was gone. So
 * the file as it stood is copied away first — into the extension's own storage,
 * never beside the document: the project root is a whitelist the user keeps
 * clean, and a vault that syncs would carry every copy to every machine.
 *
 * The newest `DOC_BACKUP_KEEP` versions of each document are kept. A backup that
 * fails never stops the write — the write is what the user asked for, and it was
 * already guarded before backups existed.
 */

export const DOC_BACKUP_KEEP = 20;

let root: string | undefined;

/** Where backups go; `undefined` turns them off (a test that does not care). */
export function configureDocBackups(dir: string | undefined): void {
    root = dir ? String(dir) : undefined;
}

/** One folder per document, named so a person can find it: `<file>__<folder>-<hash>`. */
export function backupDirFor(file: string, base = root): string | undefined {
    if (!base) { return undefined; }
    const abs = path.resolve(file);
    const dir = path.dirname(abs);
    const hash = crypto.createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0, 8);
    const safe = (s: string): string => s.replace(/[^\p{L}\p{N}._-]+/gu, '_');
    return path.join(base, `${safe(path.basename(abs))}__${safe(path.basename(dir))}-${hash}`);
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** Sortable as text, so the newest is the last name in the folder. */
export function backupStamp(t: number): string {
    const d = new Date(t);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-`
        + `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

/**
 * Copy the file as it stands, then prune to the newest `keep`. Returns the copy's
 * path, or `undefined` when there was nothing to keep (no file yet, backups off).
 */
export function backupBeforeWrite(file: string, now = Date.now(), keep = DOC_BACKUP_KEEP): string | undefined {
    const dir = backupDirFor(file);
    if (!dir) { return undefined; }
    try {
        if (!fs.statSync(file).isFile()) { return undefined; }
    } catch { return undefined; }
    try {
        fs.mkdirSync(dir, { recursive: true });
        // ‼️ THE NAME ORDER IS WHAT PRUNING TRUSTS, so a new copy is always stamped after the
        // newest one there — a second write in the same millisecond, or a clock set back.
        const before = fs.readdirSync(dir).filter(f => f.endsWith('.bak')).sort();
        const newest = before.length ? stampTime(before[before.length - 1]) : 0;
        const target = path.join(dir, `${backupStamp(Math.max(now, newest + 1))}.bak`);
        fs.copyFileSync(file, target);
        const all = [...before, path.basename(target)];
        for (const old of all.slice(0, Math.max(0, all.length - keep))) {
            try { fs.unlinkSync(path.join(dir, old)); } catch { /* the next write prunes it */ }
        }
        return target;
    } catch { return undefined; }
}

/** When a copy was made, read back off its name. */
export function stampTime(name: string): number {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})/.exec(name);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]).getTime() : 0;
}

/** `at` — when the copy was made, i.e. when the write that replaced this version ran. */
export interface DocBackup { path: string; at: number; size: number }

/** The kept versions of one document, newest first. */
export function listDocBackups(file: string, base = root): DocBackup[] {
    const dir = backupDirFor(file, base);
    if (!dir) { return []; }
    let names: string[] = [];
    try { names = fs.readdirSync(dir).filter(f => f.endsWith('.bak')).sort().reverse(); } catch { return []; }
    const out: DocBackup[] = [];
    for (const name of names) {
        try {
            const st = fs.statSync(path.join(dir, name));
            out.push({ path: path.join(dir, name), at: stampTime(name) || st.mtimeMs, size: st.size });
        } catch { /* pruned under us */ }
    }
    return out;
}
