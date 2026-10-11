---
id: find-session
title: Find and read a past session
area: sessions
summary: Locate a session by id, title, agent or content on any engine and read what was said, without touching transcript files.
intents:
  - what did the agent say in session 4d361981
  - find the session where we discussed the login bug
  - read the last answer of that session
  - which session changed this file
keywords: [session, transcript, find, search, read, history, conversation, id, what was said]
ops: [sessions.find, sessions.read, search.transcripts, sessions.recent, sessions.files, sessions.export]
---
## Steps
- By id, prefix, title or agent: `sessions.find q=<text>` → id, engine, agent, transcript file.
- By content: `search.transcripts query="login bug" agents=["<agent>"]` (filters for engines, projects, dates, roles).
- Recent: `sessions.recent limit=20`.
- Read: `sessions.read session=<id> from=-20` (last 20 steps; `roles=all` includes tools; page with `next`).
- Code it changed (Claude transcripts): `sessions.files sessionId=<id>`.
- As a document: `sessions.export session=<id>`.

## Pitfalls
Never grep transcript folders or guess the engine from an id; the bridge knows where each engine keeps them.
