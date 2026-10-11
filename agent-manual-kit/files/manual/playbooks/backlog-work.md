---
id: backlog-work
title: Work with a project backlog (add, order, pick next, close)
area: projects
summary: Add items with the right origin, see what is startable next, reorder, hold, and learn how an item was handled before.
intents:
  - add this to the backlog
  - what should I work on next
  - do the top five backlog items
  - move K-7 after S-2
  - how was this solved last time
keywords: [backlog, item, next, priority, order, queue, hold, park, code, add item, history of item]
ops: [projects.backlog, projects.backlog.next, projects.backlog.add, projects.backlog.reorder, projects.backlog.move, projects.backlog.hold, projects.backlog.check, projects.tracks]
---
## Steps
- What to do next (startable items in queue order; blocked and held ones listed apart): `projects.backlog.next project=<p> limit=5`.
- Add an item. Mark `origin=user` when the user asked for it; your own proposals keep the default:
```json
{ "op": "projects.backlog.add", "args": { "project": "<p>", "text": "<item text>", "area": "K", "priority": "high", "effort": "S", "origin": "user" } }
```
- Reorder: `projects.backlog.reorder` (before or after another item) or `projects.backlog.move` (up, down, top, bottom). Park: `projects.backlog.hold`.
- Before starting an item, read its history: `projects.tracks project=<p> code=<K-n>`.
- Start and finish: `projects.backlog.check ... state=doing`, later `state=done note="..."` (playbook project-session-close).
