---
id: engines
title: Engines, routes, prices, secrets and hooks
order: 15
summary: Which agent CLIs are installed and signed in, their models, alternative provider routes, model prices, Farm Secrets by name, live hooks.
ui: "Agent Farm: Open Engines"; Farm Settings ▸ Engines, Providers, Secrets
keywords: [engine, cli, claude code, codex, gemini, antigravity, opencode, installed, signed in, model list, which models, provider, route, endpoint, kimi, openrouter, price, pricing, secret, api key, hooks, live hooks, port]
related: [accounts, sessions, toolbox, settings]
---
# Engines, routes, prices, secrets and hooks

## Engines
Five engine ids: `claude` (Claude Code), `codex`, `gemini` (Gemini CLI), `agy` (Antigravity), `opencode`. They differ in real ways: Claude can be steered mid-turn and stops to ask permission; Codex and Gemini cannot ask on unattended runs; Gemini and OpenCode have no reasoning effort; only Claude and OpenCode state a dollar price per turn; Claude Code and Codex send live hook events, the others are followed turn by turn.
- Ready or not, and how it is paid: `engines.status` (or `id=<e>`).
- Models and their efforts: `engines.models id=<e>` before passing `model=`.
- Prove a call gets through: `engines.test id=<e>` (one real, small call).

## Routes (alternative endpoints)
A **route** points Claude Code or OpenCode at another provider endpoint (for example an Anthropic-compatible gateway), with tiers mapping `opus`/`sonnet`/`haiku` to that provider's models. Runs choose one with `providerId` (+ `tier` on Claude). `providers.list`, `providers.status` (free check), `providers.test id=<route>` (real call), `providers.runtime agent=<a> engine=<e>` (what a launch would really use). Add or change with `providers.add`, `providers.set`; keys are entered by the user in the Engines page or bound by secret name with `providers.bindSecret`.

## Prices
`pricing.rules` shows price rules and `unpriced` models (billed as $0 until priced); `pricing.set match="<regex>" input=.. output=.. cacheWrite=.. cacheRead=..` (USD per 1M tokens).

## Secrets
Values never cross the bridge. `secrets.list` gives names and bindings; workflows use `{secret:NAME}`; bind by name with `providers.bindSecret`, `kapici.bindSecret`, `mcp.servers.bindSecret`. Creating or reading a secret value is the user's job in the Secrets panel.

## Live hooks
Live Timeline, context and quota handover notices and the session start card depend on hooks. `hooks.status`; install with `hooks.install scope=user` (`dryRun=true` first); the listener: `hooks.port`, `hooks.listener.restart`.
