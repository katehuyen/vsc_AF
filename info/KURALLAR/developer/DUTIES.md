# Standing Duties — Developer Agent

<!-- agentfarm:duties — Agent Farm manages this file; you may also edit it by hand.
     Format: "## Title [cadence]" + "- **Watch:**" + "- **Do:**" lines. -->

Rules in `_REF/duties.md`: `[every-turn]` is checked every turn, `[session-start]` at session start. If the watch target has new content, the Do step runs.

## Answered questions [every-turn]
- **Watch:** bridge `notices.list { agent:"developer", type:"question", handled:false }` AND `queue.list { sourceNoticeAgent:"developer", active:true }` — an answered or converted notice is deleted from Notices by default and lives only in the queue (`_REF/notices.md`).
- **Do:** If any of your own questions is answered, act on it (apply / save to memory), then `notices.resolve`; if declined (the user closed it unanswered), take note and resolve it. A queue item carrying your notice is yours directly (no delegation needed): act on it, then `queue.stamp` it. If a new time-spread question emerges at the end of the turn, leave it with `notices.post { type:"question", agent:"developer" }` (`_REF/notices.md`).

## A2A board — what other agents left for you [session-start]
- **Watch:** bridge `a2a.status { agent:"developer", role:"developer", capabilities:"write_tools,shell,git,browser" }` — unread notes for you, tasks you could take, tasks you hold, results of what you handed over, anything blocked.
- **Do:** Read your unread notes (`a2a.notes.list unreadOnly=true` → `a2a.notes.get`) and act on what is yours. If you hold a task, heartbeat it and finish it before starting anything else. If you have room, `a2a.tasks.next claim=true`. A `supervisor` block in any answer outranks everything — follow it first. Rules and the claim/heartbeat/finish loop: `_REF/a2a.md`.
