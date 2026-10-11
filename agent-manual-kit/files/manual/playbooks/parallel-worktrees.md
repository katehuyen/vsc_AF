---
id: parallel-worktrees
title: Run several variants side by side in git worktrees
area: tasks
summary: Fan up to six prompts out as isolated headless runs, each in its own git worktree and branch, then merge or discard.
intents:
  - try three different approaches in parallel
  - run these prompts side by side
  - spike several variants of this change
keywords: [parallel, worktree, variants, branches, side by side, fan out, alternatives]
ops: [parallel.run, tasks.list]
effect: run
---
## Steps
1. Plan (the default; nothing is created):
```json
{ "op": "parallel.run", "args": { "agent": "<agent with a git repo>", "prompts": ["<variant A>", "<variant B>", "<variant C>"] } }
```
   Check `gitRepo` (must be true), `serial` (concurrency setting) and the branches.
2. Launch only when the user asked for these runs: same args with `"dryRun": false`.
3. Follow with `tasks.list`; each run is a task titled with ⑂. Merge or discard each worktree from "Worktree Runs…" in the UI.

## Pitfalls
Up to six prompts; N runs spend N times the quota. Each prompt should say "commit when done".
