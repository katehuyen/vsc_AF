---
id: delegate-to-agent
title: Hand work or knowledge to another agent
area: a2a
summary: Choose between a task, an A2A task, an A2A note, a mission or a queue item, and do the handoff correctly.
intents:
  - ask the researcher to take this over
  - leave this for the next agent
  - hand this subtask to another agent
  - let the other agent know about this
  - delegate to whoever has the browser capability
keywords: [delegate, hand off, handover, another agent, pass work, note, other agent, role, capability]
ops: [tasks.add, a2a.tasks.add, a2a.notes.post, missions.start, queue.add, a2a.status, a2a.tasks.finish]
---
## Choose
| Situation | Use |
|---|---|
| A specific agent should run it now, unattended | `tasks.add` (playbook run-task) |
| Whoever fits a role or capability should claim it when free | `a2a.tasks.add` |
| Other agents should know something (fact, warning, convention) | `a2a.notes.post` |
| It needs several agents and a lead | `missions.start` (playbook team-mission) |
| It is for the user's attention, or a manager agent batches work | `queue.add` |

## A2A task
```json
{ "op": "a2a.tasks.add", "args": { "title": "<short title>", "instructions": "<specification: paths, inputs, constraints>", "expectedOutput": "<what done looks like>", "targetRole": "<role, capability or agent>", "requires": ["write_tools"] } }
```
The taker claims it (`a2a.tasks.claim` or `a2a.tasks.next claim=true`), heartbeats, and finishes with `a2a.tasks.finish state=done result="..."`; a result note comes back to you (`a2a.status`).

## Pitfalls
- Write handoff instructions in English as a specification.
- Delegating is not finishing: check the result yourself before telling the user it is done.
