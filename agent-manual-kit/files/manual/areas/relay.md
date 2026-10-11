---
id: relay
title: Baton relay — long work that continues across sessions
order: 9
summary: Open a relay chain so work continues in a fresh session when a quota or context limit is reached; pass, pause, resume, brake, end and inspect chains.
ui: "Agent Farm: Open Chains"; the ⑂ chip on Console cards and the status bar
keywords: [baton, relay, chain, handover, hand over, continue, keep going, overnight, marathon, legs, quota wall, context limit, next session, pass the baton, pause chain, resume chain, stop chain]
related: [tasks, console, accounts, sentry]
---
# Baton relay

## Model
A **chain** is a sequence of sessions (**legs**) doing one long job. When a leg reaches its handover line (5-hour quota or context fill, thresholds in `sessions.contextGuard`), Agent Farm tells it to pass the baton: the leg commits, writes its successor's first message with `baton.pass`, and ends its turn. Agent Farm then ends that session and opens the next leg on the chain's setup (same engine, model, folder, project), placing it on an account from the chain's **pool** (an account rule such as `@emptiest`; parked until a reset when every account is full). Brakes: the leg ceiling (`maxHops`, default from settings), the barren-chain brake (two legs in a row with no new commit), and the user's brakes. A leg that dies without passing is judged by a failsafe that may open an emergency leg from its notes.

## Start a chain (user intent "keep working on this until it is done")
- New run that opens a chain: `tasks.add ... baton=true maxHops=N account=@emptiest` (optionally `chainId`). Also `console.start ... baton=true`, and `baton=true` on `schedules.add`, `triggers.add`, `templates.add` (each firing opens its own chain).
- Make a session that is already running leg 1: `baton.attach session=<id>` (default: the caller).
- Playbook baton-relay.

## Inside a chain (you are a leg)
When your handover notice says "pass the baton": finish the atomic step, commit, write `{"prompt": "..."}` to a file and run `baton.pass @file.json`, then end your turn. Never pass before the notice. Playbook pass-the-baton.

## Control and inspect
- `chains.list` (state, leg/maxLegs, totals, signals: hanging, stuck-wait, cut, fault, brake), `baton.status`, `baton.legs chain=<id>`.
- Pause: `chains.pause chain=<id> mode=here|pass`; continue: `chains.resume chain=<id>`.
- Ceiling: `baton.setLegs chain=<id> maxLegs=N` or `add=K`. Last leg: `baton.lastLeg chain=<id>`.
- Start a waiting successor now: `baton.now session=<id>`. Change the account of next legs: `chains.setAccount`.
- Stop: `baton.stop chain=<id> why="..."`; end on purpose: `chains.end chain=<id>`; reopen: `chains.continue chain=<id>`. Clean hanging chains: `chains.endHanging dryRun=true` first.
- Find every leg's session: `sessions.find q=<chn_id>`.

## Rules
Starting, continuing or reopening a chain spends quota for hours: only on the user's request. Braking and pausing are user decisions unless the user delegated them to you.
