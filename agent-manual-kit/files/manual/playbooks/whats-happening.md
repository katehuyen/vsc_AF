---
id: whats-happening
title: What is running, waiting or stuck right now
area: basics
summary: One-call overviews of the fleet's live state and how to drill down into tasks, missions, chains and sessions.
intents:
  - what is running now
  - what is the fleet doing
  - is anything stuck
  - what is waiting for me
  - status report
keywords: [status, running, now, overview, stuck, waiting, blocked, dashboard, what is happening]
ops: [now.get, farm.waits, needs.list, tasks.list, missions.list, chains.list, sessions.live, farm.cleanup]
---
## Steps
1. `now.get` — blocking items, running Console sessions, today's spend, quota, latest notices.
2. `farm.waits` — every wait in one shape: what it waits for, until when, what ends it (`clearedBy` clock, event or human, and the `op`).
3. `needs.list` — what only the user can unblock.
4. Drill down: `tasks.list`, `missions.list`, `chains.list attention=true`, `sessions.live`.
5. Stuck for a day or more: `farm.cleanup` lists it; clean with `apply=true` only on the user's request.

## Tell the user
Lead with what needs them, then what runs, then anything odd, in a few lines.
