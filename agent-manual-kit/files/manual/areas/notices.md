---
id: notices
title: Notices, Work Queue and Needs You — the channels with the user
order: 11
summary: Tell the user things (Notices), take work from the user (Work Queue), and see what is blocked on the user (Needs You); answers, digests and the Now page.
ui: "Agent Farm: Open Notices" (bell in the status bar), "Open Work Queue" (Ctrl+Alt+A to add), "Open Needs You", "Open Now"
keywords: [notice, notify, tell the user, report, message, question, ask the user, remind, warning, result, inbox, work queue, todo, capture, later, needs you, approval, digest, summary, now]
related: [a2a, projects, alerts, remote]
---
# Notices, Work Queue, Needs You

Three channels, never mixed:
- **Notices**: agent → user. News, results, reports, reminders, suggestions, warnings and asynchronous questions.
- **Work Queue**: user → agent. Things the user drops for agents to handle later; they persist until handled.
- **Needs You**: what the farm is blocked on until a person acts (permission waits, approvals, mission questions, cut runs).
Agent-to-agent communication is A2A (area a2a), not these.

## Notices
`notices.post title="..." type=<update|report|result|reminder|suggestion|warning|question> level=<1..4> body="..."` — always via `@args.json` when there is a body.
- One thing = one notice. Multi-part content goes in `sections=[{title, body}]`, each section self-contained.
- `level` is mandatory in spirit: 1 routine, 2 medium, 3 important, 4 critical and rare. Do not inflate.
- Substantial content: put a short summary in `body` and the full Markdown in `report` (saved to the report folder and linked), or link a file you wrote with `reportPath`.
- `project` is filled from your project session; pass it to file elsewhere or `project="(none)"`.
- Posting is not idempotent: an identical post within 10 minutes is refused and the first is returned. Change a notice with `notices.edit`; withdraw with `notices.dismiss` (undo: `notices.undo`).
- Questions (`type=question`) are answered by the user in the UI. Answering usually turns the notice into a Work Queue item addressed to you, so check both: `notices.list agent=<you> type=question handled=false` and `queue.list sourceNoticeAgent=<you> active=true`. After acting: `notices.resolve id=<id>` and `queue.stamp id=<item> resolution="..."`.
- Write user-facing text in the user's language (`farm.brief` reports it); everything else in English.

## Work Queue
Items move `captured → grouped → delegated → done` (+ `blocked` = waiting on the user, `dropped` = invalid). Live items cannot be deleted; drop them with `queue.stamp status=dropped`.
- Capture: `queue.add text="..." target=<agent or area> urgency=normal|soon|urgent`.
- Items for you: `queue.list target=<you> active=true` and `queue.list sourceNoticeAgent=<you> active=true`.
- Handle: do the work, then `queue.stamp id=<id> resolution="what was done"` (status done by default).
- A manager agent sweeping the queue starts with `queue.maturity`, groups with `queue.group`, delegates with `tasks.add` or `missions.start`, links with `queue.delegate`, and stamps when verified.
- Belongs to a project's backlog instead: `projects.backlog.promote`.

## Needs You and Now
- `needs.list` — rows blocked on a person. `needs.act key=<key> action=<...>` presses the same button the panel offers; use it only on the user's instruction (approvals and permissions are theirs).
- `now.get` — what waits, what runs, today's spend and quota. `digest.daily` — today's digest (`send=true` sends it through the configured channel).
