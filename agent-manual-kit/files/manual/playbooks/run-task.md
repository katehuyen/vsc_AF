---
id: run-task
title: Have an agent do a job now (task)
area: tasks
summary: Queue and start one unattended agent run, follow it, and report the result.
intents:
  - have the researcher look into X
  - run this job with agent Y
  - ask agent Z to do this in the background
  - start a task for the writer
  - do this with codex
  - open a task for the coder to fix the login bug
keywords: [task, job, run, background, headless, delegate, now, open a task, new task]
ops: [agents.list, engines.status, engines.models, tasks.add, tasks.get, tasks.list, tasks.cancel]
effect: run
---
## Ask only if missing
Which agent (offer names from `agents.list`) and what result the user expects. Engine, model and permissions default to the agent's own settings; set them only when the user named them.

## Steps
1. `agents.list` — confirm the agent exists (use its exact name).
2. If the user named an engine or model: `engines.status id=<engine>` and `engines.models id=<engine>`.
3. Write the prompt so the run succeeds alone: goal, inputs (paths, links), constraints, the expected output and where to write it, and "commit when done" for code. Put it in a file:
```json
{ "op": "tasks.add", "args": { "agent": "<agent>", "title": "<short title>", "prompt": "<full instructions>", "engine": "claude", "permissionMode": "acceptEdits" } }
```
   Call: `tasks.add @task.json`. The answer has the task `id` (and `retryPolicy`).
4. Follow when needed: `tasks.get id=<id>` (status, `events`, cost, output tail). A parked task shows `heldBy` (concurrency, budget, quota or a retry wait); it starts by itself when that clears.

## Verify and tell the user
State the task title, agent, engine and id, and where to watch it (Tasks page). When it ends, summarise its output from `tasks.get`; if the user is not in this chat, use playbook notify-user.

## Pitfalls
- A task costs quota: only when the user asked for this work. For open-ended or large work prefer playbook team-mission (it has limits).
- Unattended runs cannot answer permission prompts. On Claude choose `permissionMode` up front (`acceptEdits` for edits in its folder, `bypassPermissions` only if the user accepts it); Codex and Gemini tasks are effectively read-only unless widened.
- `effort` is refused on gemini and opencode.
- Never repeat `tasks.add` after a timeout with `detail.state: "running"`.
