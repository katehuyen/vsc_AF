---
id: sentry-campaign
title: Work through a project backlog unattended (sentry campaign)
area: sentry
summary: Start, watch, pause and stop a sentry campaign that opens unattended rounds on a project's backlog items across accounts.
intents:
  - work through the backlog overnight
  - start the night shift on this project
  - keep taking backlog items until I stop you
keywords: [sentry, night shift, overnight, backlog, unattended, campaign, autonomous]
ops: [projects.backlog.next, accounts.status, sentry.start, sentry.status, sentry.pause, sentry.resume, sentry.stop]
effect: run
---
## Ask only if missing
Project, agent, engine, the opening instruction, and the brakes the user accepts (failure limit, account ceiling). Make sure they know it runs until stopped.

## Steps
1. `projects.backlog.next project=<p>` — what it would take first; `accounts.status engine=<e>` — room.
2. Start:
```json
{ "op": "sentry.start", "args": { "project": "<project>", "agent": "<agent>", "engine": "claude", "prompt": "<how to work an item: take the next startable backlog item, implement, test, commit, close it with a note>", "permissionMode": "acceptEdits", "preset": "hybrid", "failLimit": 3 } }
```
   Rounds that must write outside their own folder need `permissionMode=bypassPermissions`, only if the user accepts it.
3. Watch: `sentry.status` (what it does and why).
4. Pause, resume, stop on the user's word: `sentry.pause`, `sentry.resume`, `sentry.stop why="..."` (a running round continues; cancel it with `tasks.cancel` if asked).
