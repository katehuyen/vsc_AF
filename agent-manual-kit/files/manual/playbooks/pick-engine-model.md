---
id: pick-engine-model
title: Choose the engine, model, account and route for a run
area: engines
summary: Check what can run on this machine and pick valid run dimensions (engine, model, effort, account, route) for any op that starts work.
intents:
  - run this on codex
  - use opus for this
  - use the cheaper model
  - which engines can I use
  - run it on another account
keywords: [engine, model, opus, sonnet, haiku, codex, gemini, opencode, antigravity, effort, account, route, provider, cheap, expensive]
ops: [engines.status, engines.models, accounts.status, policies.list, providers.list, agents.defaults, launch.profiles]
---
## Steps
1. Installed and signed in: `engines.status`. Not ready means refused at launch.
2. Valid models and efforts for that engine: `engines.models id=<engine>`. Never pass a model name from another engine.
3. Account: `accounts.status engine=<engine>` (room now); pass `account=<slot id>` or a rule (`@emptiest`, `@round-robin`, a name from `policies.list`).
4. Alternative endpoint: `providers.list`, then `providerId=<route>` (+ `tier` on Claude).
5. What happens if you pass nothing: `agents.defaults agent=<agent>` (per engine) and the user's saved setups: `launch.profiles`.

## Guidance
- Mechanical, well-defined work: the cheapest capable model at low effort. Analysis and writing: a mid model. Hard reasoning or risky changes: the strongest model. If unsure start one tier lower and escalate.
- Effort is refused on gemini and opencode. Codex and Gemini cannot stop to ask for permission on unattended runs.
- Only Claude and OpenCode state a dollar price; on other engines compare tokens.
