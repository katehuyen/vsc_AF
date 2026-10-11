---
id: console
title: Console — sessions hosted inside the panel
order: 4
summary: Start a conversation with an agent in the Console, send messages, answer its questions, change model, effort, account or route mid-session.
ui: "Agent Farm: Open Console" (Ctrl+Alt+C); one card per session
keywords: [console, chat, talk to agent, conversation, send message, steer, card, question, ask, model switch, effort, permission mode, held message]
related: [sessions, tasks, relay, accounts]
---
# Console

## Model
A Console session is an agent process the VS Code window hosts: its events stream into a card, it can be interrupted and steered, and it survives as a resumable conversation when the card closes. Each engine behaves differently, and `console.sessions` says so per row (`steerable`, `turnShape`, `takesEffort`, `reportsCost`). Read those fields before acting.

## Common intents
- Open a conversation: `console.start agent=<a> prompt="..."` (+ `engine`, `model`, `effort`, `permissionMode`, `account`, `project`, `baton=true` for a relay). Returns the console `id` you use next. Long prompts go in `@args.json`.
- Say something: `console.send id=<id> text="..."`. On Claude it steers the running turn; on other engines it is held until the turn ends (`held: true`).
- See held messages: `console.queue id=<id>`.
- What is each card doing, is anything asking: `console.sessions`.
- Answer a question the session asked (AskUserQuestion): `console.answer id=<id> answers=...` or `response="..."`. Permission prompts are NOT answerable by agents; they are the user's.
- Stop the turn: `console.interrupt id=<id>`. Close the card: `console.close id=<id>` (the conversation stays resumable).
- Change mid-session: `console.setModel`, `console.setEffort`, `console.permissionMode`, `console.setAccount` (moves to another sign-in from the next message), `console.switch` (route, where the engine allows).
- A card that hit its context or quota handover: `console.continueFromHandover id=<id>` starts the fresh follow-up session from its note.
- What it changed on disk: `console.changes id=<id>`.

## Rules
- `console.send` spends a turn: send only what the user asked you to relay or what your task requires.
- Never answer another session's permission request.
