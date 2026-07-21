import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * J1 — Parallel worktree runs. Code agents work on isolated `git worktree`
 * copies of the same repo (branch prefix `af/`), so several runs never step
 * on each other; afterwards each worktree offers a diff summary and a
 * merge / discard decision.
 */

export const BRANCH_PREFIX = 'af/';

function git(repoDir: string, args: string): Promise<{ ok: boolean; out: string }> {
    return new Promise(resolve => {
        cp.exec(`git ${args}`, { cwd: repoDir, timeout: 60_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
            (err, stdout, stderr) => resolve({
                ok: !err,
                out: String(stdout ?? '') + (err ? '\n' + String(stderr ?? '') : '')
            }));
    });
}

export async function isGitRepo(dir: string): Promise<boolean> {
    if (!fs.existsSync(path.join(dir, '.git'))) {
        const r = await git(dir, 'rev-parse --is-inside-work-tree');
        return r.ok && r.out.trim() === 'true';
    }
    return true;
}

export interface WorktreeInfo {
    path: string;
    branch: string;
    /** short human name (branch without the af/ prefix) */
    name: string;
}

/** Where a repo's farm worktrees live: a sibling folder, outside the repo itself. */
export function worktreeBase(repoDir: string): string {
    return path.join(path.dirname(repoDir), `.af-worktrees-${path.basename(repoDir)}`);
}

export async function createWorktree(repoDir: string, name: string): Promise<{ wt?: WorktreeInfo; error?: string }> {
    const safe = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
        Date.now().toString(36);
    const branch = `${BRANCH_PREFIX}${safe}-${Date.now().toString(36).slice(-4)}`;
    const wtPath = path.join(worktreeBase(repoDir), branch.replace('/', '-'));
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    const r = await git(repoDir, `worktree add "${wtPath}" -b ${branch}`);
    if (!r.ok) { return { error: r.out.trim().slice(0, 300) }; }
    return { wt: { path: wtPath, branch, name: safe } };
}

/** Farm-created worktrees of a repo (af/ branches only). */
export async function listAfWorktrees(repoDir: string): Promise<WorktreeInfo[]> {
    const r = await git(repoDir, 'worktree list --porcelain');
    if (!r.ok) { return []; }
    const out: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};
    for (const line of r.out.split('\n')) {
        if (line.startsWith('worktree ')) { current = { path: line.slice(9).trim() }; }
        else if (line.startsWith('branch ')) {
            const branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
            if (branch.startsWith(BRANCH_PREFIX) && current.path) {
                out.push({
                    path: current.path,
                    branch,
                    name: branch.slice(BRANCH_PREFIX.length)
                });
            }
        }
    }
    return out;
}

export interface WorktreeStatus {
    wt: WorktreeInfo;
    /** committed + uncommitted change summary vs the branch fork point */
    diffStat: string;
    dirty: boolean;
    /** commits on the af/ branch not on HEAD of the main worktree */
    commits: number;
}

export async function worktreeStatus(repoDir: string, wt: WorktreeInfo): Promise<WorktreeStatus> {
    const dirtyR = await git(wt.path, 'status --porcelain');
    const statR = await git(wt.path, 'diff HEAD --stat');
    const commitsR = await git(repoDir, `rev-list --count HEAD..${wt.branch}`);
    const committedStat = await git(repoDir, `diff --stat HEAD...${wt.branch}`);
    const parts: string[] = [];
    const committed = committedStat.ok ? committedStat.out.trim() : '';
    const uncommitted = statR.ok ? statR.out.trim() : '';
    if (committed) { parts.push(committed.split('\n').pop() ?? ''); }
    if (uncommitted) { parts.push('(uncommitted) ' + (uncommitted.split('\n').pop() ?? '')); }
    return {
        wt,
        diffStat: parts.join(' · ') || 'no changes',
        dirty: dirtyR.ok && dirtyR.out.trim().length > 0,
        commits: commitsR.ok ? Number(commitsR.out.trim()) || 0 : 0
    };
}

/** Merge the worktree's branch into the main worktree's current branch. */
export async function mergeWorktree(repoDir: string, wt: WorktreeInfo): Promise<{ ok: boolean; detail: string }> {
    const r = await git(repoDir, `merge --no-ff ${wt.branch} -m "Merge ${wt.branch} (Agent Farm parallel run)"`);
    return { ok: r.ok, detail: r.out.trim().slice(0, 400) };
}

/** Remove a worktree (and its branch when fully merged or force=true). */
export async function removeWorktree(
    repoDir: string, wt: WorktreeInfo, force = false
): Promise<{ ok: boolean; detail: string }> {
    let r = await git(repoDir, `worktree remove ${force ? '--force ' : ''}"${wt.path}"`);
    if (!r.ok && /unknown subcommand|not a git command|usage: git worktree/i.test(r.out)) {
        // git < 2.17: delete the folder by hand, then prune the registration.
        try { fs.rmSync(wt.path, { recursive: true, force: true }); }
        catch (e) { return { ok: false, detail: 'manual delete failed: ' + String(e).slice(0, 200) }; }
        r = await git(repoDir, 'worktree prune');
    }
    if (!r.ok) { return { ok: false, detail: r.out.trim().slice(0, 300) }; }
    const b = await git(repoDir, `branch ${force ? '-D' : '-d'} ${wt.branch}`);
    return { ok: true, detail: b.ok ? 'worktree and branch removed' : 'worktree removed (branch kept — unmerged?)' };
}
