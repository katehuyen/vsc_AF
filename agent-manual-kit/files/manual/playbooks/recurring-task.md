---
id: recurring-task
title: Run something on a schedule (daily, weekly, once)
area: automation
summary: Install a schedule that queues an agent run at a set local time, with a precondition so it only wakes when there is work.
intents:
  - every day at 9 have the assistant prepare a briefing
  - every monday morning run the weekly report
  - create a recurring task that runs daily at this time
  - remind me tomorrow at 10
  - schedule this job once on friday at 18:00
  - run this every weekday
keywords: [schedule, daily, weekly, once, recurring, every, cron, at, morning, night, weekday, remind]
ops: [agents.list, schedules.add, schedules.list, schedules.runNow, schedules.forecast, schedules.edit, automations.status]
effect: write
---
## Ask only if missing
Agent, time, and what the run should do. Days for weekly. Whether it should skip when there is nothing to do (suggest a `fireIf`).

## Map the request
- "every day at 09:30" → `kind=daily hour=9 minute=30`.
- "every Monday at 08:00" → `kind=weekly dow=1 hour=8 minute=0` (0 Sunday ... 6 Saturday).
- "every weekday" → five weekly schedules, `dow` 1 to 5, distinct titles (for example "Briefing (Mon)").
- "once on 2026-11-20 at 18:00" → `kind=once onceAt="2026-11-20 18:00"`.
- "every hour" is not a schedule kind: propose a watch trigger with a precondition (playbook react-to-events) or a few fixed times.
Times are the machine's local time.

## Steps
1. `agents.list`; make sure the title is new (`schedules.list`).
2. Install (file payload):
```json
{ "op": "schedules.add", "args": { "agent": "<agent>", "title": "Morning briefing", "prompt": "<what to do each time; point at the agent's duty if one exists>", "kind": "daily", "hour": 9, "minute": 0, "missed": "skip", "fireIf": { "kind": "folderHasFiles", "path": "<inbox folder>", "minCount": 1 } } }
```
   Omit `fireIf` only when the run must happen every time. Add run dimensions (`engine`, `model`, `permissionMode`, `project`) as the user wants; an unattended run cannot ask for permissions.
3. Read back: `schedules.list` (it shows the dimensions it will fire with) and `schedules.forecast days=7`.
4. Optional test, only if the user agrees to pay for one run now: `schedules.runNow id=<title>`.

## Tell the user
Title, agent, when it fires next, what it skips on, and how to change it (`schedules.edit`) or pause it (`schedules.toggle`).

## Pitfalls
- The automation gate (`automations.status`) can hold it: master switch off, paused, or quiet hours (deferred, not dropped).
- A schedule runs a task prompt; to run a workflow on a timer, see playbook react-to-events or have the scheduled agent run it.
- Do not duplicate long procedures in the prompt; point at the agent's duty or instructions.
