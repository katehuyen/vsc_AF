---
id: start-session
title: Open a conversation with an agent (Console or terminal)
area: console
summary: Start an interactive session for the user or a Console card you drive, send messages, and hand it back.
intents:
  - open a session with the designer
  - start talking to agent X
  - open claude for the backend agent
  - send this message to that session
keywords: [session, console, chat, talk, conversation, open, terminal]
ops: [agents.list, console.start, console.send, console.sessions, console.answer, sessions.start]
effect: run
---
## Choose
- The user will talk to it themselves in a terminal: `sessions.start agent=<a>` (`surface=console` for the panel, `engine`, `model`, `prompt`, `resume=<sessionId>` to continue).
- You will drive it (send messages, read answers): `console.start`.

## Steps (Console)
1. `agents.list` for the exact agent name.
2. Start it, with the first message in a file:
```json
{ "op": "console.start", "args": { "agent": "<agent>", "prompt": "<first message>", "engine": "claude" } }
```
   Keep the returned console `id`.
3. Follow: `console.sessions id=<id> messages=5`. If it is `asking` a question, answer only what the user decided: `console.answer id=<id> response="..."`. Permission prompts are the user's.
4. Next message: `console.send id=<id> text="..."` (held until the turn ends on engines other than Claude).

## Tell the user
Which agent, engine and card; they can open it with "Agent Farm: Open Console".

## Pitfalls
- Each message is a paid turn.
- One card per session: resuming a session that already has a card returns that card.
