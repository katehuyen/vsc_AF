---
id: notify-user
title: Tell the user something, deliver a report, or ask a question (Notices)
area: notices
summary: Post one well-formed notice (with an optional full report) to the user's Notices board, or leave an asynchronous question.
intents:
  - let me know when it is done
  - send me a report
  - notify the user
  - leave me a question
  - remind me
  - post a warning
keywords: [notify, notice, tell, report, message, question, reminder, warning, result, summary]
ops: [notices.post, notices.edit, notices.dismiss, notices.list, notices.resolve]
effect: write
---
## When
The user is not reading this chat (unattended run, task, schedule) or asked to be told on the board. In a live chat, just answer in the chat.

## Steps
1. Choose `type` (update, report, result, reminder, suggestion, warning, question) and an honest `level` (1 routine, 2 medium, 3 important, 4 critical).
2. Write one notice. Summary in `body`; parts in `sections`; the full text in `report` (saved to the report folder and linked):
```json
{ "op": "notices.post", "args": { "title": "Weekly research digest ready", "type": "report", "level": 2, "agent": "<you>", "body": "<3-6 line summary a reader understands without opening the report>", "report": "<full markdown report with sources at the end>", "reportName": "weekly-research-digest" } }
```
   Call `notices.post @notice.json` and keep the returned id.
3. For a question: `"type": "question"`; check for the answer later (playbook check-inbox), act, then `notices.resolve id=<id>`.

## Pitfalls
- One thing = one notice; never one per sub-item.
- Never re-post to read an answer you cut off: an identical post within 10 minutes is refused and the first one is returned. Fix with `notices.edit`; withdraw with `notices.dismiss`.
- Write user-facing text in the user's language (`farm.brief` reports it).
