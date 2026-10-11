---
id: automation
title: Automation — schedules, triggers and the automation gate
order: 6
summary: Run agents at set times (schedules) or on events (file/folder watch, agent hook, webhook); pause, quiet hours, preconditions, headless service.
ui: "Agent Farm: Open Tasks" ▸ Automations tab; status bar automation switch
keywords: [schedule, every day, daily, weekly, every monday, at 9, cron, recurring, once, remind, timer, trigger, watch folder, when a file, webhook, hook, automation, pause automations, quiet hours, fireIf, precondition, did not run, missed]
related: [tasks, workflows, agents, relay]
---
# Automation

## Schedules
`schedules.add agent=<a> title="..." prompt="..." kind=daily|weekly|once hour=H minute=M` queues a task at that **local** time. `kind` defaults to daily, time to 09:00. Weekly takes `dow` (0 = Sunday ... 6 = Saturday); once takes `onceAt="YYYY-MM-DD HH:MM"`. Several weekdays = one weekly schedule per day. Titles are unique. A schedule carries the same run dimensions as a task. `missed=skip|run|ask` decides what happens to a firing missed while VS Code was closed.

## Triggers
`triggers.add title="..." type=watch|hook|webhook ...` with an action: `action=task agent=<a> prompt="..."`, `action=dispatch` (the dispatcher picks the agent), or `action=workflow workflow=<w>`. Watch triggers need an existing `watch` path; prompts may use `{file}`, `{watch}`, `{payload}`. Hook triggers fire on agent events (`hookEvent=stop|start|prompt|...`, `hookAgent`). Webhook triggers return a local POST URL. Brakes: `debounceSec`, `cooldownSec`, `maxPerHour`.

## Preconditions: never pay for a wake-up that finds nothing
Both take `fireIf={kind, path, minCount, except, hours, recursive}`: `folderHasFiles`, `fileMissing`, `pathChangedWithin`, `queueHasWork` (triggers also `kapici`). When it fails no agent is started and the skip is logged. Paths accept `{today}` and `{yesterday}`. Give every automation a `fireIf` unless it truly must run every time.

## The gate
`automations.status` shows the master switch, pause, quiet hours and per-automation fired/skipped counts. `automations.pause minutes=60 reason="..."`, `automations.resume`, `automations.quietHours from=23:00 to=07:00` (due schedules are deferred to the end of the window, not dropped), `automations.bulk set=off kind=schedule`.

## Common intents
- Make it recurring: playbook recurring-task. React to a file or event: playbook react-to-events.
- Test now: `schedules.runNow id=<title>`, `triggers.fire id=<title>`.
- What will run: `schedules.list`, `triggers.list`, `schedules.forecast days=7`.
- Change: `schedules.edit`, `triggers.edit` (id survives); on/off: `schedules.toggle`, `triggers.toggle`.
- Why did it not run: playbook troubleshoot-automation.
- Fire while VS Code is closed (Windows): `service.status`, `service.install` (plans first; `confirm=true` installs).
- "Is the system still serving its purpose" checks: `living.checks`, `living.pulse`.

## Rules
- A schedule prompt should point at the procedure (for example the agent's duty) rather than restate long steps.
- Creating an automation is a standing cost: confirm the agent, the time and the prompt with the user's words; read it back with `schedules.list` after creating.
