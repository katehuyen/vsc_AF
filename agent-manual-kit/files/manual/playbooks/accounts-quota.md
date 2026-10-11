---
id: accounts-quota
title: Use several accounts and stay within quota
area: accounts
summary: Capture sign-ins, see room per account, pick accounts per run or by rule, move a live conversation, and set handover thresholds.
intents:
  - use my second claude account
  - which account has room
  - rotate accounts for long runs
  - switch this conversation to another account
keywords: [account, accounts, quota, rotate, second account, switch account, limit, room, sign in]
ops: [accounts.list, accounts.status, accounts.capture, accounts.activate, policies.list, console.setAccount, sessions.contextGuard]
---
## Steps
- Room now: `accounts.status engine=claude`; all slots: `accounts.list`.
- Add a sign-in: the user logs in with the engine's own login, then `accounts.capture engine=claude label="<label>"`.
- Per run: pass `account=<slot id>` or a rule (`@emptiest`, `@round-robin`, names in `policies.list`) on `tasks.add`, `console.start`, `schedules.add`, `missions.start`...
- Next sessions by default: `accounts.activate id=<slot>`; per agent: `agents.defaults.set agent=<a> engine=<e> account=<slot>`.
- Move a live Console conversation: `console.setAccount id=<card> account=<slot or rule>` (from the next message).
- Long work across accounts: a baton relay with an account pool (playbook baton-relay).
- Handover thresholds (context and quota): `sessions.contextGuard`; change only on request.
