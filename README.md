# Agent Farm

Mission control for your **local Claude Code agents** — live fleet status, cost analytics, session explorer, and health/optimization insights, all inside VS Code. Fully local: it reads your `~/.claude/projects` transcripts and your agent folders. No server, no telemetry, nothing leaves your machine.

## Features

- **Agents view** (Activity Bar): every agent with live status, today's cost, memory/tools/permissions/sessions drill-down.
- **Dashboard**: KPI cards, daily cost stacked by agent, cost by model, token-type breakdown, weekly activity heatmap, trailing 5-hour window quota, top sessions by cost.
- **Agent detail page**: 30-day cost trend, fixed context load budget, model split, top tools, memory table, per-agent health findings, full session list.
- **Session viewer**: readable transcript with tool calls/results, per-message tokens & cost, filtering.
- **Insights**: context-load budget warnings, memory index consistency, duplicate/diverged memory copies across agents, stale files, error-rate signals.
- **Live Feed**: recent prompts, tool calls and errors across the fleet — real-time via hooks when installed.
- **Live Timeline** (v0.2): hook-powered swim-lane view per agent — tool-run blocks, prompt/permission/compaction marks, live session cards with WORKING / PERMISSION? / STALLED states, and notifications when an agent waits for permission or stalls. One-command hook setup (`Agent Farm: Install Live Hooks`) with automatic backup; listener binds to 127.0.0.1 only.
- **Management**: start/continue Claude sessions per agent, scaffold new agents, open in new window.
- **Guide (Kılavuz)**: built-in Turkish handbook — every `?` button jumps to the relevant section.

## Getting started

1. `npm install`
2. `npm run compile`
3. Press **F5** in VS Code to launch the Extension Development Host, or `npm run package` to build a `.vsix` and install it with `code --install-extension agent-farm-0.1.0.vsix`.
4. Set `agentFarm.agentRoots` to the folder(s) that contain your agent directories (a folder with a `CLAUDE.md` is treated as an agent).

## How costs are computed

Token usage is read from Claude Code's local JSONL transcripts and priced with the rules in `agentFarm.pricing` (USD per million tokens, first regex match wins). On subscription plans this is the **API-equivalent value** of your usage, not a bill.

## License

MIT
