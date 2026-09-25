/**
 * ‼️ X-285 — THE LARGE-FILE VALVE, AS THE MIGRATION GATE SEES IT.
 *
 * GitHub warns at 50 MB per file and refuses a push carrying one over 100 MB, so a
 * single big file means no backup at all. The daily backup unstages anything over
 * 95 MB (_REF/git.md) and names it; this reads the same repo afterwards: the five
 * largest COMMITTED files, and whatever big file is left outside every backup.
 * Thresholds mirror `_setup\doctor\BigFiles.ps1` (Doctor's backup section).
 */

export const BIG_WARN_MB = 50;
export const BIG_FAIL_MB = 90;

export interface WeighedFile { file: string; mb: number }

export interface RepoWeight {
    /** the largest committed blobs, largest first */
    top: WeighedFile[];
    /** untracked, not ignored, at or over the WARN line — in no backup */
    leftOut: WeighedFile[];
    /** why the committed sizes could not be read — an empty `top` is then NOT "nothing committed" */
    unread?: string;
}

const mb = (bytes: number) => Math.round(bytes / 1048576 * 10) / 10;

/*
 * X-401 — `ls-tree -r -l HEAD` reads every blob header out of the pack: 259 s on the agent
 * repo. The index already caches each entry's size, so only the blobs it does not hold
 * unchanged are asked of `cat-file --batch-check`. Same path as BigFiles.ps1 Get-TrackedSizes;
 * both lists are read with core.quotepath=off, so a quoted path is quoted alike in each.
 */

/** `git ls-tree -r HEAD` → path → blob hash. Gitlinks carry no blob and are skipped. */
export function headBlobs(lsTree: string): Map<string, string> {
    const head = new Map<string, string>();
    for (const ln of lsTree.split('\n')) {
        const t = ln.indexOf('\t');
        const meta = t > 0 ? ln.slice(0, t).split(' ') : [];
        if (meta[1] === 'blob') { head.set(ln.slice(t + 1), meta[2]); }
    }
    return head;
}

/**
 * `git ls-files -s --debug` → path → bytes, for entries whose index hash IS the HEAD blob.
 * The index size is the checked-out file's, so a CRLF checkout reads a little over the blob.
 * Size 0 means the index never stat'ed the file — it is asked instead.
 */
export function indexSizes(lsFilesDebug: string, head: Map<string, string>): Map<string, number> {
    const sizes = new Map<string, number>();
    let path: string | undefined;
    for (const ln of lsFilesDebug.split('\n')) {
        if (!ln.startsWith(' ')) {
            const t = ln.indexOf('\t');
            const p = ln.slice(t + 1);
            path = t > 0 && head.get(p) === ln.slice(0, t).split(' ')[1] ? p : undefined;
            continue;
        }
        if (path === undefined) { continue; }
        const m = /size: (\d+)/.exec(ln);
        if (!m) { continue; }
        if (Number(m[1]) > 0) { sizes.set(path, Number(m[1])); }
        path = undefined;
    }
    return sizes;
}

/** `git cat-file --batch-check` → hash → bytes. A `<hash> missing` line carries no size. */
export function batchSizes(out: string): Map<string, number> {
    const sizes = new Map<string, number>();
    for (const ln of out.split('\n')) {
        const f = ln.split(' ');
        if (f.length >= 3 && /^\d+$/.test(f[2])) { sizes.set(f[0], Number(f[2])); }
    }
    return sizes;
}

/** The HEAD blobs whose size neither the index nor the batch answered are left out. */
export function largestBlobs(head: Map<string, string>, cached: Map<string, number>,
    asked: Map<string, number>, top = 5): WeighedFile[] {
    const rows: { file: string; bytes: number }[] = [];
    for (const [file, hash] of head) {
        const bytes = cached.get(file) ?? asked.get(hash);
        if (bytes !== undefined) { rows.push({ file, bytes }); }
    }
    return rows.sort((a, b) => b.bytes - a.bytes).slice(0, top).map(r => ({ file: r.file, mb: mb(r.bytes) }));
}

export function leftOutBig(untracked: { file: string; bytes: number }[]): WeighedFile[] {
    return untracked.filter(u => u.bytes >= BIG_WARN_MB * 1048576)
        .map(u => ({ file: u.file, mb: mb(u.bytes) }))
        .sort((a, b) => b.mb - a.mb);
}

export function bigVerdict(size: number): 'ok' | 'warn' | 'fail' {
    return size >= BIG_FAIL_MB ? 'fail' : size >= BIG_WARN_MB ? 'warn' : 'ok';
}
