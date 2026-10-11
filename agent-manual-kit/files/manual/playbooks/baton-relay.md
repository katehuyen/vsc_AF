---
id: baton-relay
title: Start a baton relay chain (long work that survives quota and context limits)
area: relay
summary: Open a relay so a long job continues in fresh sessions across accounts when a leg reaches its quota or context line; then control the chain.
intents:
  - start a baton chain for this job
  - keep working on this overnight until it is finished
  - run this as a relay across my accounts
  - make this session a relay
  - continue this in a new session when the limit hits
keywords: [baton, relay, chain, overnight, continue, keep going, marathon, legs, accounts, handover]
ops: [agents.list, accounts.status, policies.list, tasks.add, console.start, baton.attach, chains.list, baton.legs, baton.setLegs, chains.pause, chains.resume, chains.end, baton.stop]
effect: run
---
## Ask only if missing
The job and the agent; how many legs at most (`maxHops`, 0 = no ceiling; the default comes from settings); which account pool (default `@emptiest`); whether the legs run headless, in the Console or in a terminal.

## Steps
1. `agents.list`; `accounts.status engine=claude` to see room; `policies.list` if the user named a rule.
2. Open the chain with its first leg. Headless (file payload):
```json
{ "op": "tasks.add", "args": { "agent": "<agent>", "title": "<job> (relay)", "prompt": "<the whole job, what done means, and: commit after every atomic step>", "baton": true, "maxHops": 8, "account": "@emptiest", "permissionMode": "acceptEdits" } }
```
   In the Console instead: `console.start` with the same `agent`, `prompt`, `baton=true`, `maxHops`, `account`.
   An already running session (for example your own): `baton.attach` (default: the caller) with `maxHops` and `account`.
3. Confirm: `chains.list` shows the chain; `baton.legs chain=<chn_id>` lists legs as they open.

## Control (on the user's word)
- More or fewer legs: `baton.setLegs chain=<id> maxLegs=N` (or `add=2`).
- Pause: `chains.pause chain=<id> mode=pass` (the next leg waits at the door) or `mode=here` (short break in the same session); continue with `chains.resume chain=<id>`.
- End: `chains.end chain=<id>` (the running leg writes its note instead of passing); stop a waiting successor: `baton.stop chain=<id> why="..."`.

## Pitfalls
- Each leg is a paid session; a chain can run for hours.
- Each firing of a schedule or trigger with `baton=true` opens its own chain.
- A chain stops by itself after two legs in a row without a new commit (barren brake): the prompt must make legs commit.
