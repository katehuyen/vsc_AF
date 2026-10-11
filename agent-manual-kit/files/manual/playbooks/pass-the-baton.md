---
id: pass-the-baton
title: You are a relay leg and were told to pass the baton
area: relay
summary: What a leg does at its handover line: finish the atomic step, commit, write the successor's first message, pass, end the turn.
intents:
  - context handover pass the baton
  - quota handover notice received
  - i am in a baton relay and must hand over
keywords: [handover, pass, baton, successor, quota, context, leg, end run]
ops: [baton.pass, baton.status, chains.pause, sessions.whoami]
---
## When
Your first message opened with a relay chain header, or Agent Farm's CONTEXT HANDOVER or QUOTA HANDOVER notice told you to pass the baton. Never pass before such a notice.

## Steps
1. Start nothing new. Finish the atomic step in flight and verify it.
2. Commit your work. Leave no stray branch or worktree behind (merge or delete; name any that must stay).
3. Write the successor's first message to a file, then pass:
```json
{ "op": "baton.pass", "args": { "prompt": "Done (with commit hashes): ...\nRemaining, in order: ...\nFirst five minutes: open <files and line ranges>, run <command>.", "note": "<one line for the human reading the chain>" } }
```
   Call `baton.pass @baton.json`. Read `sentence` in the answer: it says what happens when your session ends.
4. End your turn. Agent Farm ends the session and opens the next leg on the chain's setup and account pool.

## If the answer says `braked`
- The user's brake (last leg, chain stopped, leg ceiling): write a handover note in the project's usual place instead, then end.
- The barren-chain brake or an error: fix the cause it names (usually: nothing was committed) and pass again.

## Pitfalls
- Do not close your own Console card; Agent Farm does it.
- A break the user asks for is `chains.pause session=<you> mode=here words="<where you stopped>"`, not an open question.
