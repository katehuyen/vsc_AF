---
id: standing-duty
title: Make an agent keep watching something (standing duty)
area: agents
summary: Record a duty in the agent's DUTIES.md and wire an automation behind it so it actually happens while the agent is idle.
intents:
  - keep an eye on this folder and process new files
  - every morning check the inbox and triage it
  - watch for new issues and tell me
  - make this a standing duty of the assistant
keywords: [duty, duties, watch, keep an eye, monitor, standing, routine, every turn]
ops: [duties.add, duties.automate, duties.list, schedules.add]
effect: write
---
## Model
A duty in `DUTIES.md` (`## Title [cadence]`, Watch, Do) is read by the agent while it runs. Cadences: every-turn, session-start, daily, weekly, manual. A daily or weekly duty with no automation behind it never happens; an every-turn duty only runs while the agent is already running.

## Steps
1. Record it:
```json
{ "op": "duties.add", "args": { "agent": "<agent>", "title": "Inbox triage", "cadence": "daily", "watch": "<folder>", "do": "File each new note into the right folder and log it." } }
```
2. Wire it, in the same move:
   - Latency matters: `duties.automate agent=<agent> title="Inbox triage"` (a watch trigger; needs a real path).
   - Otherwise (usually better): a daily schedule with a precondition that names the duty (playbook recurring-task), `fireIf {kind: folderHasFiles, path: <folder>}`.
3. Check: `duties.list agent=<agent>` shows the duty with its live watch status.

## Pitfalls
A folder watch fires on any change: prefer a daily batch with `fireIf` unless the user needs quick reaction.
