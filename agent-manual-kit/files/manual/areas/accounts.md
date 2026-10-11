---
id: accounts
title: Accounts and usage — sign-ins, quota windows, selection rules
order: 14
summary: Captured sign-ins per engine, how much of each plan is left, rules that pick an account at launch (@emptiest, @round-robin...), usage and quota figures.
ui: "Agent Farm: Open Accounts"; plan usage bar in the status bar
keywords: [account, sign-in, login, subscription, plan, quota, limit, 5-hour, weekly, usage, rate limit, rotate accounts, emptiest, round robin, which account, switch account]
related: [engines, relay, console, sentry]
---
# Accounts and usage

## Model
An **account** is a captured sign-in of one engine, stored as its own config directory (a slot). Starting a run with an account points that engine at the slot; nothing already running changes. Each slot has 5-hour and weekly windows Agent Farm reads in the background. An **account rule** picks a slot at launch time: `@emptiest` (most of its 5-hour window left), `@round-robin`, `@standing` (the agent's own, else the machine-wide one), `@pool` (a sentry campaign's pool) or a named rule from `policies.list`. Every op that starts work takes `account=<slot id or rule>`.

## Common intents
- Can a run start now, and where: `accounts.status engine=claude`.
- All sign-ins with usage: `accounts.list`; Claude plan figures: `usage.plan`; every engine: `usage.engines`.
- The next session should use another account: `accounts.activate id=<slot>` (`id=""` = main sign-in). Per agent instead: `agents.defaults.set agent=<a> engine=<e> account=<slot>`.
- Move a live Console conversation: `console.setAccount id=<card> account=<slot or rule>`.
- Add a sign-in: the user signs in once with the engine's own login, then `accounts.capture engine=claude label="..."`. Renewing a sign-in is a browser flow only a person completes: `accounts.reauth` gives the command.
- Rules: `policies.list`, `policies.save name=<n> chain=[...]`, `policies.delete`.
- Sleep or wake a slot: `accounts.disable`, `accounts.enable`. Remove: `accounts.signout`, `accounts.forget`, `accounts.delete` (destructive, refused while in use).
- Handover thresholds by quota or context: `sessions.contextGuard` (area relay).

## Rules
- Never read credential files or try to sign in; accounts are captured from what the user signed in.
- Quote quota figures as read (89 is not 90) and say which window and which account they belong to.
