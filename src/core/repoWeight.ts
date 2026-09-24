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
}

const mb = (bytes: number) => Math.round(bytes / 1048576 * 10) / 10;

/** `git ls-tree -r -l -z HEAD` → the largest blobs. Gitlinks and trees carry no size and are skipped. */
export function largestBlobs(lsTreeZ: string, top = 5): WeighedFile[] {
    const rows: WeighedFile[] = [];
    for (const rec of lsTreeZ.split('\0')) {
        const m = /^\d+ blob [0-9a-f]+\s+(\d+)\t([\s\S]+)$/.exec(rec);
        if (m) { rows.push({ file: m[2], mb: mb(Number(m[1])) }); }
    }
    return rows.sort((a, b) => b.mb - a.mb).slice(0, top);
}

export function leftOutBig(untracked: { file: string; bytes: number }[]): WeighedFile[] {
    return untracked.filter(u => u.bytes >= BIG_WARN_MB * 1048576)
        .map(u => ({ file: u.file, mb: mb(u.bytes) }))
        .sort((a, b) => b.mb - a.mb);
}

export function bigVerdict(size: number): 'ok' | 'warn' | 'fail' {
    return size >= BIG_FAIL_MB ? 'fail' : size >= BIG_WARN_MB ? 'warn' : 'ok';
}
