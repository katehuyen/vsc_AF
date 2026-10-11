---
id: check-inbox
title: Check what waits for you (answers, queue items, A2A)
area: notices
summary: The session-start sweep an agent does to pick up the user's answers, work addressed to it, and A2A notes and tasks.
intents:
  - did the user answer my question
  - check my notices and queue
  - anything for me
  - session start routine
keywords: [inbox, answered, pending, my questions, my tasks, session start]
ops: [notices.list, queue.list, a2a.status, notices.resolve, queue.stamp, a2a.notes.list, a2a.tasks.next]
---
## Steps
1. Questions you asked the user that are still open or answered-but-kept:
```json
{ "op": "notices.list", "args": { "agent": "<you>", "type": "question", "handled": false } }
```
2. Notices of yours the user answered or turned into work (answering usually moves the notice into the queue):
```json
{ "op": "queue.list", "args": { "sourceNoticeAgent": "<you>", "active": true } }
```
3. Work queue items routed to you: `queue.list target=<you> active=true`.
4. Agent-to-agent board: `a2a.status agent=<you>`; read unread notes with `a2a.notes.list agent=<you> unreadOnly=true`; take a task if you have room with `a2a.tasks.next agent=<you> claim=true`.
5. Act on each item. Then close it: `notices.resolve id=<id>` for a question you acted on; `queue.stamp id=<id> resolution="<what you did>"` for a queue item.

## Pitfalls
- An item in neither list is resolved or deleted: never ask it again.
- A declined question (status declined) means the user did not take it up; note it and resolve it.
