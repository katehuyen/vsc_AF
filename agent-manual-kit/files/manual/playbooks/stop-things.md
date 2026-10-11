---
id: stop-things
title: Stop, pause or cancel anything safely
area: basics
summary: The right op to stop each kind of work, what survives, and how to pause instead of destroy.
intents:
  - stop everything
  - cancel that task
  - stop the mission
  - pause all automations
  - stop the relay chain
  - interrupt the session
keywords: [stop, cancel, pause, halt, interrupt, kill, end, abort, brake]
ops: [tasks.cancel, console.interrupt, sessions.interrupt, sessions.end, missions.pause, missions.cancel, chains.pause, chains.end, baton.stop, workflows.decide, automations.pause, sentry.pause, sentry.stop]
effect: destructive
---
## Pick the narrowest stop
| What | Pause (keeps state) | Stop |
|---|---|---|
| A task | — | `tasks.cancel id=<id>` |
| A Console turn | — | `console.interrupt id=<card>` (conversation survives) |
| A terminal session's turn | — | `sessions.interrupt sessionId=<id>`; end the process: `sessions.end` (asks the user) |
| A mission | `missions.pause id=<run>` | `missions.cancel id=<run>` |
| A relay chain | `chains.pause chain=<id> mode=pass` | `chains.end chain=<id>`, or `baton.stop chain=<id>` for a waiting successor |
| A running workflow | `workflows.decide runId=<id> decision=stop` | — |
| All schedules and triggers | `automations.pause minutes=<n> reason="..."` | `automations.bulk set=off` |
| The sentry campaign | `sentry.pause` | `sentry.stop` |

## Rules
- "Stop everything" from the user: pause automations first, then list what runs (`now.get`, `tasks.list`, `missions.list`, `chains.list`) and confirm before cancelling running work.
- Nothing here deletes history; say what was stopped and how to resume.
