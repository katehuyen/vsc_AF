import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { slugify } from './util';

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
    /** '' when the branch outlived its worktree (X-535): reviewed by its commits alone */
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
    // ASCII: this is a git branch name. Only NEW worktrees are named here —
    // `listAfWorktrees` reads what git already recorded — so a slug that keeps
    // more of the name cannot orphan a worktree created under the old rule.
    const safe = slugify(name, { ascii: true, max: 40 }) || Date.now().toString(36);
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
    const none = { ok: false, out: '' };
    const dirtyR = wt.path ? await git(wt.path, 'status --porcelain') : none;
    const statR = wt.path ? await git(wt.path, 'diff HEAD --stat') : none;
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
    if (!wt.path) {
        const only = await git(repoDir, `branch ${force ? '-D' : '-d'} "${wt.branch}"`);
        return { ok: only.ok, detail: only.ok ? 'branch removed' : only.out.trim().slice(0, 300) };
    }
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

/** X-535 — one farm branch: the worktree holding it ('' when that is gone) and whether HEAD already holds its tip. */
export interface AfBranch extends WorktreeInfo { merged: boolean }

const branchLines = (out: string): string[] => out.split('\n').map(l => l.replace(/^[*+]?\s+/, '').trim()).filter(Boolean);

/** Every af/ branch of the repo, with a worktree or without — `listAfWorktrees` sees only the first kind. */
export async function listAfBranches(repoDir: string): Promise<AfBranch[]> {
    const all = await git(repoDir, 'branch --list');
    const names = all.ok ? branchLines(all.out).filter(b => b.startsWith(BRANCH_PREFIX)) : [];
    if (!names.length) { return []; }
    const held = new Map((await listAfWorktrees(repoDir)).map(w => [w.branch, w.path]));
    const merged = await git(repoDir, 'branch --merged HEAD');
    const done = new Set(merged.ok ? branchLines(merged.out) : []);
    return names.map(b => ({ branch: b, name: b.slice(BRANCH_PREFIX.length), path: held.get(b) ?? '', merged: done.has(b) }));
}

export interface AfSweep {
    repo: string;
    /** af/ branches still in a worktree of their own */
    worktrees: number;
    /** worktrees whose folder was gone, pruned from git's list before the branches were judged */
    pruned: number;
    /** branches removed: no worktree, and HEAD already held them */
    removed: string[];
    /** branches with no worktree that are still there — work of their own, for the review */
    left: AfBranch[];
}

/**
 * X-535 — A FARM BRANCH OUTLIVES ITS WORKTREE, and nothing listed it: the review reads worktrees only.
 * Swept here: a worktree whose folder was deleted is pruned from git's list (git's own housekeeping), a
 * branch with no worktree that HEAD already holds is removed with `branch -d` (git refuses it for anything
 * not merged), and every other one is left — carrying work of its own — for Worktree Runs… to review.
 */
export async function sweepAfBranches(repoDir: string): Promise<AfSweep> {
    const gone = (await listAfWorktrees(repoDir)).filter(w => !fs.existsSync(w.path));
    if (gone.length) { await git(repoDir, 'worktree prune'); }
    const all = await listAfBranches(repoDir);
    const removed: string[] = [];
    for (const b of all.filter(x => !x.path && x.merged)) {
        if ((await git(repoDir, `branch -d "${b.branch}"`)).ok) { removed.push(b.branch); }
    }
    return {
        repo: repoDir, worktrees: all.filter(x => x.path).length, pruned: gone.length, removed,
        left: all.filter(x => !x.path && !removed.includes(x.branch))
    };
}

/** The repo a folder is in (its top level), or '' when it is in none. */
export async function repoOf(dir: string): Promise<string> {
    const r = await git(dir, 'rev-parse --show-toplevel');
    return r.ok && r.out.trim() ? path.resolve(r.out.trim()) : '';
}

/** The repos the folders are in, each once. */
export async function reposOf(dirs: readonly string[]): Promise<string[]> {
    return [...new Set((await Promise.all(dirs.map(repoOf))).filter(Boolean))];
}

/** X-535 — the af/ branches in the repos of these folders, each said with what holds it. */
export async function afBranchesIn(dirs: readonly string[]): Promise<string[]> {
    const lists = await Promise.all((await reposOf(dirs)).map(async r => ({ r, bs: await listAfBranches(r) })));
    return lists.flatMap(({ r, bs }) => bs.map(b => `${b.branch} in ${r} (${b.path ? 'worktree ' + b.path
        : b.merged ? 'no worktree, already merged' : 'no worktree, work of its own'})`));
}
