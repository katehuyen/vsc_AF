import * as fs from 'fs';
import * as path from 'path';

/**
 * Archive mirroring — a finished project does not vanish, it moves to its
 * counterpart.
 *
 * The user's vault already works this way and has for years: every active
 * folder has a one-to-one `_ARCHIVE` twin under a sibling `99_ARCHIVE`
 * (`10_REPORT` → `99_ARCHIVE/10_REPORT_ARCHIVE`). Projects were the one axis
 * with nowhere to go, so a finished one stayed in the live list forever and the
 * list slowly became a graveyard nobody dared prune.
 *
 * ‼️ THIS MOVES A YEAR OF SOMEBODY'S NOTES, SO IT NEVER HAPPENS BY ITSELF.
 * Setting a project's status to `archived` does NOT touch the disk — the two
 * are deliberately separate actions, because "I am done with this" and "move my
 * files" are different sentences and only one of them is reversible by clicking
 * again. Every call here is explicit, states both paths before it runs, refuses
 * to land on anything that already exists, and has an exact inverse
 * (`planRestore`). The registry's `folder` follows the move, so nothing points
 * at a folder that is not there.
 *
 * Pure node (fs, path) — no vscode — so the whole thing is testable on a temp
 * directory.
 */

/**
 * Where archived projects go, when nobody has said.
 *
 * Derived, not invented: `<parent>/99_ARCHIVE/<root leaf>_ARCHIVE`, which is
 * the convention the surrounding vault already uses. A machine that files
 * things differently sets `agentFarm.projectsArchiveRoot` and this is never
 * consulted.
 */
export function archiveRootFor(projectsRoot: string, configured?: string): string {
    const explicit = String(configured ?? '').trim();
    if (explicit) { return path.resolve(explicit); }
    const root = String(projectsRoot ?? '').trim();
    if (!root) { return ''; }
    const abs = path.resolve(root);
    return path.join(path.dirname(abs), '99_ARCHIVE', `${path.basename(abs)}_ARCHIVE`);
}

export interface ArchivePlan {
    /** the folder as it is now */
    from: string;
    /** where it would end up */
    to: string;
    /** set when the move cannot be made; `to` is still filled in so the UI can
     *  show what was intended */
    error?: string;
}

/** Is this folder already inside the archive root? Answered on resolved paths
 *  and case-insensitively, because the same folder is spelled four ways on
 *  Windows and "already archived" must not depend on which one arrived. */
export function isInside(folder: string, root: string): boolean {
    const f = path.resolve(String(folder ?? '')).toLowerCase();
    const r = path.resolve(String(root ?? '')).toLowerCase();
    if (!f || !r) { return false; }
    return f === r || f.startsWith(r + path.sep.toLowerCase());
}

function check(from: string, to: string, exists: (p: string) => boolean): ArchivePlan {
    const plan: ArchivePlan = { from, to };
    if (!from) { plan.error = 'this project has no folder, so there is nothing to move'; return plan; }
    if (!exists(from)) { plan.error = `the folder is not on this machine: ${from}`; return plan; }
    if (exists(to)) {
        plan.error = `something is already there: ${to} — nothing was moved`;
        return plan;
    }
    return plan;
}

/**
 * The move, described before it happens.
 *
 * The leaf keeps its name: the folder is the user's, and renaming it on the way
 * into the archive would break every wikilink in the vault that points at it.
 */
export function planArchive(
    folder: string, archiveRoot: string, exists: (p: string) => boolean = fs.existsSync
): ArchivePlan {
    const from = String(folder ?? '').trim();
    if (!archiveRoot) {
        return {
            from, to: '',
            error: 'no archive root — set agentFarm.projectsArchiveRoot, or agentFarm.projectsRoot '
                + 'so one can be derived next to it'
        };
    }
    if (from && isInside(from, archiveRoot)) {
        return { from, to: from, error: 'this project\'s folder is already in the archive' };
    }
    const to = from ? path.join(path.resolve(archiveRoot), path.basename(path.resolve(from))) : '';
    return check(from, to, exists);
}

/**
 * The inverse. It is the same operation with the roots swapped, and it exists
 * so that archiving is a decision you can take back — an action with no undo
 * gets used once and then feared.
 */
export function planRestore(
    folder: string, projectsRoot: string, archiveRoot: string,
    exists: (p: string) => boolean = fs.existsSync
): ArchivePlan {
    const from = String(folder ?? '').trim();
    if (!projectsRoot) {
        return { from, to: '', error: 'no projects root — set agentFarm.projectsRoot' };
    }
    if (from && archiveRoot && !isInside(from, archiveRoot)) {
        return { from, to: from, error: 'this project\'s folder is not in the archive' };
    }
    const to = from ? path.join(path.resolve(projectsRoot), path.basename(path.resolve(from))) : '';
    return check(from, to, exists);
}

export interface MoveResult {
    ok: boolean;
    /** where the folder is NOW — the old path when the move failed, so the
     *  caller can write it back to the registry either way */
    path: string;
    error?: string;
}

/**
 * Do the move.
 *
 * `rename` first because it is atomic and instant; a cross-volume archive (a
 * vault on D:, an archive on E:) raises EXDEV and falls back to copy-then-remove
 * — and if the copy succeeded but the removal did not, that is reported as a
 * SUCCESS with a warning, because the files are at the destination and telling
 * the user it failed would send them looking for work that is already done.
 */
export function moveProjectFolder(plan: ArchivePlan): MoveResult {
    if (plan.error) { return { ok: false, path: plan.from, error: plan.error }; }
    const { from, to } = plan;
    try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
    } catch (e) {
        return { ok: false, path: from, error: `could not create ${path.dirname(to)}: ${String(e)}` };
    }
    try {
        fs.renameSync(from, to);
        return { ok: true, path: to };
    } catch {
        // cross-device, or a file inside is open — copy, then try to clean up
        try {
            fs.cpSync(from, to, { recursive: true });
        } catch (e) {
            return {
                ok: false, path: from,
                error: `could not move the folder (Obsidian may be holding a file in it): ${String(e)}`
            };
        }
        try {
            fs.rmSync(from, { recursive: true, force: true });
            return { ok: true, path: to };
        } catch (e) {
            return {
                ok: true, path: to,
                error: `copied to ${to}, but the old folder could not be removed — delete it by `
                    + `hand: ${from} (${String(e)})`
            };
        }
    }
}

/**
 * What is sitting in the archive.
 *
 * The registry is not the answer to this: a project deleted from the registry
 * still has its folder, and that folder is exactly what somebody goes looking
 * for two years later. So the archive root is READ, and every folder in it is
 * reported whether or not this machine's registry has heard of it.
 */
export interface ArchivedFolder {
    name: string;
    path: string;
    mtime: number;
}

export function listArchived(archiveRoot: string): ArchivedFolder[] {
    const root = String(archiveRoot ?? '').trim();
    if (!root) { return []; }
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch { return []; }
    const out: ArchivedFolder[] = [];
    for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith('.')) { continue; }
        const full = path.join(root, e.name);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch { /* unreadable — still listed */ }
        out.push({ name: e.name, path: full, mtime });
    }
    return out.sort((a, b) => b.mtime - a.mtime);
}
