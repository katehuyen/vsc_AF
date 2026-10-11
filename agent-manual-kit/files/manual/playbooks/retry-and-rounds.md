---
id: retry-and-rounds
title: Make a run robust (retries, smart continue, multi-turn rounds, resume)
area: tasks
summary: Retry policies for limits and failures, continuing interrupted work, several turns in one conversation, and continuing an earlier session.
intents:
  - if it hits the limit try again after the reset
  - retry three times if it fails
  - continue where it stopped
  - send a follow-up prompt after it answers
  - continue that earlier session as a task
keywords: [retry, limit, reset, fail, again, continue, rounds, follow-up, resume, robust]
ops: [tasks.add, tasks.get, tasks.rerun, tasks.supervision]
---
## Options on tasks.add (also on schedules, triggers and templates)
- `retry`: `{max, delayMin, when, resetAware, behavior}`. `when=limit` (default) retries only when a usage limit stopped the run; `when=any` on any failure. `resetAware=true` waits for the window to reopen. `behavior=smart` continues a run that had already done work instead of starting over; `behavior=supervisor` lets a cheap read-only supervisor decide. Omit `retry` to inherit the user's default; `{max: 0}` means never.
- `rounds`: further prompts sent into the same conversation once the previous one is answered, optionally after `delayMin`: `[{prompt, delayMin}]`. Headless only.
- `resume=<sessionId>`: continue an existing conversation instead of starting a new one (its own engine and folder are used).
```json
{ "op": "tasks.add", "args": { "agent": "<agent>", "title": "<title>", "prompt": "<round 1>", "retry": { "max": 3, "delayMin": 10, "when": "limit", "resetAware": true, "behavior": "smart" }, "rounds": [ { "prompt": "<round 2: review your result and fix issues>", "delayMin": 0 } ] } }
```
## After the fact
- `tasks.get id=<id>` shows `retryPolicy`, events and retries. Same work again, maybe on another engine: `tasks.rerun id=<id> engine=codex`.
- A supervised retry row waiting on a decision: `tasks.supervision id=<id> act=run|deterministic|edit`.
