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
- **Tasks & scheduling** (v0.3): per-agent task queue (interactive or headless `claude -p` runs, auto-advance option) and daily/weekly/once schedules that fire while VS Code is open.
- **Automation** (v0.4): multi-agent workflows with `{prev_output}` handoff between steps, archived headless outputs with exit-code tracking, task templates, automatic daily/weekly fleet reports into a folder of your choice (e.g. an Obsidian vault), and one-click export of schedules to the Windows Task Scheduler for VS Code-independent runs.
- **Intelligence** (v0.5): conditional workflow branching (`runIf` regex on previous output + onFail stop/continue/jump routing with a loop guard), per-agent daily budget alerts with dashboard budget bars, a hand-merge draft flow for diverged memory copies, and a Markdown digest of archived task outputs.
- **Standing duties** (v0.6): the recurring "keep watching X, then do Y" agreements you make with agents, managed as `DUTIES.md` per agent — the agent reads it every session, the panel shows every duty with cadence and live watch status (`3 waiting` for a filling inbox folder, missing-path alerts), with a wizard, pause/resume, and hand-edit-safe rewrites. Plus a Turkish Quick Start section in the built-in guide (`Agent Farm: Quick Start`).
- **Polish** (v0.7): in-place workflow editing (edit/reorder/add/delete steps, rename), workflow-run lanes on the Live Timeline, weekly cost-trend alerts, duty compliance tracking (`read 2h ago / never read`), task-output digests appended to automatic reports, and a proper extension icon.
- **Shared memory sync** (v0.3): find duplicated memory files across agents, diff diverged copies, and sync them from a chosen source with timestamped backups.
- **Fleet report** (v0.3): export a comparative Markdown report (cost, tokens, error rate, cache efficiency, context load) — Obsidian-friendly; same comparison table lives in the dashboard.
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
