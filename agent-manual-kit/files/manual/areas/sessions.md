---
id: sessions
title: Sessions — conversations, transcripts and launches on every engine
order: 3
summary: Find, read, search, start, interrupt and end sessions on any engine; who am I; launch profiles and what a run really ran on.
ui: "Agent Farm: Open Sessions", "Open Turns", "Open Live Timeline"; Recent Sessions view in the sidebar
keywords: [session, conversation, transcript, history, read session, find session, session id, search, turns, interrupt, stop, end session, resume, whoami, launch profile, timeline, live]
related: [console, tasks, relay, projects]
---
# Sessions

## Model
A **session** is one conversation of one engine CLI. It has an id (an 8-character prefix is enough everywhere), an agent, an engine, a project, and a transcript stored where that engine stores it. Agent Farm indexes every engine's transcripts so one set of ops answers for all of them. A session can run in a terminal, in the Console panel (a hosted "card"), or headless as a task.

## Common intents
- Which session am I: `sessions.whoami` (evidence-based; never infer it from the folder).
- The user quotes an id or a title: `sessions.find q=<id-prefix or words>` (engine, agent, transcript file, chain).
- What did a session say: `sessions.read session=<id> from=-20` (same message shape for every engine; page with `next`). Never open transcript files yourself.
- Which session talked about X: `search.transcripts query="..."` (filters for agents, engines, projects, dates, roles).
- Recent activity: `sessions.recent limit=20` (`origin=user|auto|baton`), `sessions.live` (live monitor), `turns.list`.
- Start an interactive session for the user: `sessions.start agent=<a>` (terminal by default, `surface=console` for the panel). For a conversation you will drive, use `console.start` (area console). For unattended work, use `tasks.add` (area tasks).
- Stop the current turn: `sessions.interrupt sessionId=<id>` (the session survives). End the process: `sessions.end sessionId=<id>` (asks the user first).
- A session waiting on a permission prompt: permission decisions belong to the user. Tell them, or use `sessions.answerPermission` only when the user explicitly told you to.
- What a run really ran on (route, model, account): `launch.runtime sessionId=<id>`; before launching: `providers.runtime`, `launch.permission`.
- The user's usual setups: `launch.profiles`; save one with `launch.profile.set`.
- Organise: `sessions.rename`, `sessions.tag`, `sessions.pin`, `sessions.color`.
- Export: `sessions.export session=<id>`, `turns.export`.

## Rules
- Hooks refuse disk searches that carry a session id; use `sessions.find`.
- Cost figures: Claude and OpenCode state a price; Codex, Gemini and Antigravity report tokens only, so a zero cost there means "no price", not "free".
