---
id: a2a
title: A2A — agent-to-agent notes and tasks
order: 12
summary: Leave notes for other agents and hand them claimable tasks with leases, heartbeats, handoffs and result notes.
ui: "Agent Farm: Open A2A Notes", "Open A2A Tasks"
keywords: [a2a, agent to agent, hand off, handoff, delegate to another agent, leave a note, other agents, claim, lease, heartbeat, role, explorer, coordinate]
related: [notices, missions, tasks, relay]
---
# A2A

## Model
- **Note** (`a2a.notes.*`): passive knowledge for whoever fits its coordinates (a fact, warning, convention, discovery, result). Reading marks it read for you; `resolve` closes it for everyone.
- **Task** (`a2a.tasks.*`): work exactly one agent claims. A claim is a lease: heartbeat within 30 minutes or it returns to `queued`. States `queued → claimed → running → done | failed | blocked | cancelled`.
If someone must do something, it is a task; if someone should know something, it is a note.

## Coordinates
`project` (contains; `*` = all), `targetRole` (a role, capability or agent name), `subsystem`/`workdir`, `topic`, `targetSession`, `requires` (capabilities such as `write_tools`, `browser`). `strictness=hard|preferred|any`: preferred reserves the item for its target role for a grace period, then opens it to the project. Identity: pass `agent=<you>` or let your session say it.

## Common intents
- Session start glance: `a2a.status agent=<you> role=<role>`.
- Leave knowledge: `a2a.notes.post title="..." body="..." targetRole=<r> topic=<t> ttlHours=72`.
- Hand work over: `a2a.tasks.add title="..." instructions="..." expectedOutput="..." targetRole=<r>`. Write instructions in English as a specification: paths, expected output, acceptance criteria.
- Take work: `a2a.tasks.next agent=<you> claim=true` or `a2a.tasks.claim id=<id>`; then `a2a.tasks.heartbeat id=<id> progress="..."` every few turns; end with `a2a.tasks.finish id=<id> state=done result="..."` (a result note goes back to the poster automatically).
- Cannot do it: `a2a.tasks.handoff id=<id> targetRole=<r>` (the third handoff is refused and the task blocks).
- Playbook delegate-to-agent compares A2A with tasks and missions.

## Rules
- A user directive (`supervisor` first in an answer, or a HUMAN SUPERVISOR DIRECTIVE block) outranks every other rule; follow it or stop and say why in `finish`.
- `a2a.directive.*`, `a2a.tasks.reroute` and `a2a.tasks.runNow` are the user's ops; do not call them on your own initiative.
- A2A is not for the user: tell the user through Notices.
