---
id: work-queue
title: Capture work for later and handle the work queue
area: notices
summary: Add items to the user's work queue, find items addressed to you, handle and stamp them; the manager's batching sweep.
intents:
  - add this to the queue
  - note this for later
  - what is in my queue
  - process the work queue
keywords: [queue, todo, later, capture, inbox, backlog item, work item, handle, stamp]
ops: [queue.add, queue.list, queue.get, queue.stamp, queue.maturity, queue.group, queue.delegate, projects.backlog.promote]
---
## Capture
```json
{ "op": "queue.add", "args": { "text": "<the one-line request, in the user's words>", "target": "<agent or area>", "urgency": "normal" } }
```
## Handle items for you
1. `queue.list target=<you> active=true` and `queue.list sourceNoticeAgent=<you> active=true`; `queue.get id=<id>` for the full item.
2. Do the work. Close it: `queue.stamp id=<id> resolution="<what was done and where>"` (`status=blocked` with a question if you need the user; `status=dropped` for an invalid item).
## Manager sweep (only for an agent whose role is to dispatch the queue)
`queue.maturity` → `queue.group ids=[...]` → `tasks.add` or `missions.start` → `queue.delegate ids=[...] taskId=<id>` → verify the result → `queue.stamp`.
## Pitfalls
- Live items cannot be deleted; drop them with a stamp.
- An item that belongs to a project's backlog: `projects.backlog.promote`.
