# Agent Farm

Mission control for your **local coding agents** — live fleet status, cost analytics, session explorer, and health/optimization insights, all inside VS Code. Fully local: it reads your agent folders and each CLI's own transcripts on disk. No server, no telemetry, nothing leaves your machine.

**Five engines.** A session, a task, a schedule, a trigger, a workflow step and a mission delegation can each run on **Claude Code**, **Codex**, **Gemini**, **Antigravity** or **OpenCode**, and Agent Farm reads all five CLIs' histories: `~/.claude/projects` (Claude), Codex rollouts, `~/.gemini/tmp/*/chats` (Gemini), Antigravity's own conversation index and OpenCode's `session list` / `export`.

Two limits are stated rather than hidden, because they follow from what the engines themselves offer:

- **Only Claude Code and OpenCode publish a price per turn.** The others count tokens and state no dollars, so a cost figure beside them is *derived* from your `agentFarm.pricing` rules — good for comparing runs, not a bill. `$0.00` is never printed where no price exists; on OpenCode a free model's zero is the engine's own figure and a real one.
- **Live hooks are Claude Code's alone.** It fires them itself, so its sessions reach the Live Timeline mid-turn. The per-turn engines have no process between turns to hook: Agent Farm mirrors their lifecycle from the sessions it hosts and launches, which is a turn-granular view rather than a tool-granular one. Some cost/quality/health analytics are therefore Claude-only, and every surface that is says so.

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
- **Automation core** (v0.8): file/hook/webhook triggers that start tasks or workflows, cheap-model verify steps with automatic retry, structured JSON handoffs (`{prev_json.field}`), concurrency caps + 5h-window quota guard, monthly task history.
- **Outside-world bridge** (v0.9): secrets vault in the OS keychain (`{secret:NAME}` + env injection), MCP server inventory with real usage counts, webhook workflow steps, an inbound `127.0.0.1/trigger/<token>` endpoint for n8n/Make, and notification forwarding to any webhook.
- **Content factory** (v1.0): media generation steps (fal.ai queue — image/video/audio) inside workflows, a media gallery with previews and Re-run/Vary, rule-based media cost estimation, ready-made recipes.
- **Smart supervision** (v1.1): quality scorecard (cheap-model judge scores sampled sessions 1-5 — Quality column + decline alerts), instruction suggestions mined from your repeated corrections (applied to CLAUDE.md only with approval), weekly three-sentence fleet summary, transcript search across all sessions.
- **Scale & portability** (v1.2): watch other machines' synced `.claude` folders in the same panel (⇄ badges), a daily phone-friendly digest card via webhook, and `.agentpack` export/import to move or share agents (memory and secrets never leave the machine).
- **Guide (Kılavuz)**: built-in Turkish handbook — every `?` button jumps to the relevant section.
- **Agent Manual**: agents learn to drive Agent Farm themselves — a start card in every session, `farm.guide` (map, area guides, playbooks for common requests), `farm.find` (request → the right op), exact op contracts and a live `farm.brief`; works from any shell via `node "$HOME/.agentfarm/af.js" <op>`, even while VS Code is closed.

## Getting started

1. `npm install`
2. `npm run compile`
3. Press **F5** in VS Code to launch the Extension Development Host, or `npm run package` to build a `.vsix` and install it with `code --install-extension agent-farm-0.1.0.vsix`.
4. Set `agentFarm.agentRoots` to the folder(s) that contain your agent directories (a folder with a `CLAUDE.md` is treated as an agent).

## How costs are computed

Token usage is read from Claude Code's local JSONL transcripts and priced with the rules in `agentFarm.pricing` (USD per million tokens, first regex match wins). On subscription plans this is the **API-equivalent value** of your usage, not a bill.

## Privacy

- **No telemetry.** The extension collects nothing and phones home to no one.
- **No network calls of its own.** The only network traffic is what *you* configure: media generation (your fal.ai key), webhook forwarding (your URLs), and the `claude` CLI runs it launches on your behalf. The live-event listener binds to `127.0.0.1` only.
- **Secrets** live in the OS keychain via VS Code SecretStorage — never in files, never in exported agent packs.
- All data (transcripts, agent folders, task archives) stays on your disk.

## Publishing (maintainer notes)

The extension is publish-ready: `LICENSE`, `CHANGELOG.md`, icon, and this README. To release:

1. Create a publisher on [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) matching `"publisher": "muvusoft"` and get a Personal Access Token.
2. `npx vsce login muvusoft`, then `npx vsce publish` (add `repository` to package.json once the repo is public).
3. Optionally publish to Open VSX: `npx ovsx publish -p <token>`.

## License

MIT — see the LICENSE file.
