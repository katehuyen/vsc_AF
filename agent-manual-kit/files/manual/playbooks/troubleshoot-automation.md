---
id: troubleshoot-automation
title: Why did my schedule or trigger not run?
area: automation
summary: Diagnose a missed or skipped automation from the gate, its precondition, its task record and the waits, without guessing from timestamps.
intents:
  - why did the morning job not run
  - the trigger did not fire
  - my schedule was skipped
  - nothing happened at 9
keywords: [did not run, missed, skipped, not fired, broken schedule, trigger failed, why]
ops: [automations.status, schedules.list, triggers.list, tasks.list, tasks.get, farm.waits, reports.triggers, service.status]
---
## Steps
1. `automations.status` — master switch off, paused until, quiet hours (deferred), and per automation fired/skipped counts with the skip reason (for example "precondition: no files waiting").
2. `schedules.list` / `triggers.list` — enabled? the right time, agent, engine? `fireIf` path correct?
3. Did it queue a task that never started? `tasks.list`, then `tasks.get id=<id>` → `events` and `heldBy` (concurrency, budget, quota, retry wait).
4. `farm.waits` — anything still holding it and what ends the wait.
5. VS Code was closed at the time: schedules fire only while it runs unless the headless service is installed (`service.status`); `missed` decides what happens on return.
6. Triggers over time: `reports.triggers` (armed but never fired, always fails).

## Tell the user
The exact cause in one sentence and the one change that fixes it; make the change only if they agree.
