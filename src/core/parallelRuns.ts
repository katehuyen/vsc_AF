import type { AgentInfo } from './agents';
import { slugify } from './util';
import { BRANCH_PREFIX, createWorktree, isGitRepo, worktreeBase } from './worktree';

/**
 * B-17 — ONE PARALLEL LAUNCH, TWO DOORS. The command palette's "Run Parallel…"
 * and the bridge op `parallel.run` fan prompts out over git worktrees through
 * these three functions, so an agent that sets up a parallel run gets exactly
 * the worktrees, the tasks and the concurrency the person gets — and the op's
 * dry run is the SAME plan the command decides on, not a second reading of it.
 */

/** How many prompts one launch may carry — the rest are dropped and named. */
export const PARALLEL_MAX = 6;

/** How much of a prompt names its worktree (before slugify, which caps at 40). */
export const PARALLEL_NAME_CHARS = 24;

/** Appended to every prompt: a run in its own worktree must leave commits behind. */
export const PARALLEL_COMMIT_NOTE = ' — İş bittiğinde değişiklikleri anlamlı bir mesajla commit et.';

export interface ParallelPrompts {
    prompts: string[];
    /** prompts past PARALLEL_MAX, in order — never launched, always reported */
    dropped: string[];
}

/** Split the input-box string (`;` between runs) or take an array; trim, drop empties, cap. */
export function parallelPrompts(raw: unknown): ParallelPrompts {
    const all = (Array.isArray(raw) ? raw.map(x => String(x ?? '')) : String(raw ?? '').split(';'))
        .map(s => s.trim()).filter(Boolean);
    return { prompts: all.slice(0, PARALLEL_MAX), dropped: all.slice(PARALLEL_MAX) };
}

export interface ParallelPlanRun {
    prompt: string;
    /** the slug the worktree/branch will be named after (git adds a 4-char stamp) */
    worktree: string;
    branch: string;
}

export interface ParallelPlan {
    agent: string;
    repo: string;
    gitRepo: boolean;
    worktreeBase: string;
    maxConcurrentPerAgent: number;
    /** more prompts than the agent may run at once: they execute in turn, worktrees stay isolated */
    serial: boolean;
    runs: ParallelPlanRun[];
}

export interface ParallelPlanDeps {
    maxConcurrent: () => number;
    isGitRepo?: (dir: string) => Promise<boolean>;
}

/** What a launch WOULD do — the command's own checks, readable before anything is created. */
export async function planParallel(deps: ParallelPlanDeps, agent: AgentInfo, prompts: string[]): Promise<ParallelPlan> {
    const maxConc = deps.maxConcurrent();
    return {
        agent: agent.name,
        repo: agent.dir,
        gitRepo: await (deps.isGitRepo ?? isGitRepo)(agent.dir),
        worktreeBase: worktreeBase(agent.dir),
        maxConcurrentPerAgent: maxConc,
        serial: prompts.length > 1 && maxConc > 0 && maxConc < prompts.length,
        runs: prompts.map(prompt => {
            const worktree = slugify(prompt.slice(0, PARALLEL_NAME_CHARS), { ascii: true, max: 40 }) || '<stamp>';
            return { prompt, worktree, branch: `${BRANCH_PREFIX}${worktree}-<stamp>` };
        })
    };
}

export interface ParallelLaunched {
    worktree: string;
    branch: string;
    path: string;
    taskId: string;
    title: string;
}

export interface ParallelResult {
    launched: ParallelLaunched[];
    failed: { prompt: string; error: string }[];
}

export interface ParallelLaunchDeps {
    /** queue AND start one headless task in the worktree; answer its id and title */
    launch: (agent: AgentInfo, title: string, prompt: string, workDir: string) => { id: string; title: string };
    createWorktree?: (repoDir: string, name: string) => Promise<{ wt?: { path: string; branch: string; name: string }; error?: string }>;
}

/** Create one worktree per prompt and start one task in each; a worktree that fails is reported, not fatal. */
export async function launchParallel(deps: ParallelLaunchDeps, agent: AgentInfo, prompts: string[]): Promise<ParallelResult> {
    const launched: ParallelLaunched[] = [];
    const failed: ParallelResult['failed'] = [];
    for (const prompt of prompts) {
        const { wt, error } = await (deps.createWorktree ?? createWorktree)(agent.dir, prompt.slice(0, PARALLEL_NAME_CHARS));
        if (!wt) { failed.push({ prompt, error: error ?? 'worktree failed' }); continue; }
        const task = deps.launch(agent, `⑂ ${wt.name}`, prompt + PARALLEL_COMMIT_NOTE, wt.path);
        launched.push({ worktree: wt.name, branch: wt.branch, path: wt.path, taskId: task.id, title: task.title });
    }
    return { launched, failed };
}
