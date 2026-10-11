---
id: tasks
title: Tasks — unattended agent runs
order: 5
summary: Queue and start one-off agent runs on any engine; follow, retry, re-run, reorder, template and fan out over worktrees.
ui: "Agent Farm: Open Tasks" (Board, Automations, Reusables, Analytics); Tasks view in the sidebar
keywords: [task, job, run, do this, headless, background, queue a run, retry, rerun, template, reusable, worktree, parallel, cancel task, task output, result]
related: [automation, relay, workflows, missions, console]
---
# Tasks

## Model
A **task** is one agent run that nobody sits in: it gets a prompt, runs on an engine in the agent's folder (or `workDir`), and ends with an archived output. It moves `queued → running → done | failed | cancelled`. Concurrency limits, the daily budget, the 5-hour quota guard and retry waits can **park** a queued task; the reason is on the row (`heldBy`, `heldByCode`) and in `tasks.get` events.

## Run dimensions (shared with schedules, triggers, templates, sessions)
`engine` (claude default, codex, gemini, agy, opencode) · `model` (check `engines.models`) · `effort` (low..max; refused on gemini and opencode) · `permissionMode` (plan, acceptEdits, auto, manual, dontAsk, bypassPermissions — an unattended run cannot stop to ask, so choose up front; on Codex and Gemini a task is effectively read-only unless widened) · `account` (a slot id or a rule like `@emptiest`) · `providerId`/`tier` (an alternative endpoint) · `project` · `workDir` · `priority` · `mode` (headless default, interactive opens a terminal or the Console) · `superpowers` · `finishSound`. Omit a dimension to let the agent's defaults decide. Invalid values are refused when written, not at run time.

## Common intents
- Do a job now: `tasks.add agent=<a> title="..." prompt="..."` (starts by default; `start=false` only queues). Playbook run-task.
- Follow it: `tasks.get id=<id>` (status, events, cost, output tail), `tasks.list`.
- It must survive limits: `retry={max, delayMin, when, resetAware, behavior}`; several turns in one conversation: `rounds=[...]`; continue a past conversation: `resume=<sessionId>`. Playbook retry-and-rounds.
- Long work across sessions: `baton=true` (area relay).
- Same job again, maybe on another engine: `tasks.rerun id=<id> engine=codex`.
- Order: `tasks.move`, `tasks.runNext`, `tasks.start`; release a parked run: `tasks.unpark`.
- Stop: `tasks.cancel id=<id>`; mark finished by hand: `tasks.complete`.
- Reusable setup: `templates.add` then `templates.run`. Playbook templates.
- N variants side by side in git worktrees: `parallel.run` (plans by default). Playbook parallel-worktrees.
- Which agent should take a text: `dispatch.test text="..."`.
- History: `tasks.history`, `tasks.export`.

## Rules
- `tasks.add` spends the agent's quota: only when the user asked for that work. It has no cost ceiling of its own; for large or open-ended work prefer a mission with limits.
- Write the prompt so the run can succeed alone: goal, inputs (paths), output expected, where to write it, and "commit when done" if code changes.
- Do not poll in a tight loop; check `tasks.get` when you need the result.
