---
id: project-session-close
title: Close a turn in a project session (worklog, decisions, plan, backlog)
area: projects
summary: The closing duties of a session that did something inside a project, so the next session's brief knows what happened.
intents:
  - log what you did in the project
  - record this decision
  - mark the backlog item done
  - close the item with a note
keywords: [worklog, log, decision, close item, done, backlog check, plan check, track, project session, wrap up]
ops: [projects.log, projects.decision.add, projects.plan.check, projects.backlog.check, projects.track, projects.deliver]
---
## When
Your system prompt carries `=== AGENT FARM PROJECT CONTEXT ===` and in this turn you shipped, decided, measured, changed or discovered something.

## Steps
1. One worklog line: `projects.log project=<p> entry="<what you did>"`.
2. A decision someone will ask "why" about later: `projects.decision.add project=<p> title="..." body="<context, options, decision>"`.
3. A finished plan item: `projects.plan.check project=<p> item="<unique text>"`.
4. A finished backlog item, with a closing note a person reads months later:
```json
{ "op": "projects.backlog.check", "args": { "project": "<p>", "code": "K-8", "state": "done", "note": "<what was done, how it was closed, what to watch out for>" } }
```
5. Worked on an item without closing it: `projects.track project=<p> code=K-8 event=touch note="<where it stands>"`.
6. Something shipped: `projects.deliver project=<p> what="..." version="..."`.

## Pitfalls
Never rewrite a project document to tick a box: these ops change exactly one line.
