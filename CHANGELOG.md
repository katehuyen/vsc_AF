# Changelog

All notable changes to Agent Farm. Detailed Turkish release notes live in the built-in guide (`Agent Farm: Open Guide` → Sürüm Notları).

## 2.8.0 — Turn bands, Markdown export, wizard & trigger fixes (2026-07-10)

Third round of real-user feedback:

- **Prominent turn bands**: the thin `Turn n/m` divider is now a full-width tinted, sticky band (accent border, bold turn number, prompt snippet, tokens/cost) — turn boundaries stay visible while scrolling fast.
- **⬇ Export MD**: exports exactly the current view of the session (Show chips + text filter + replay position all apply) as a Markdown file — dialog-only, tool-calls-only or everything. Each turn band has a checkbox; untick a turn to leave it out of the export. Save dialog defaults to the session's folder.
- **Workflow wizard fixed**: "Finish & save workflow" now sits at the *top* of the step picker; pressing Esc with steps in hand asks *Save / Discard* instead of silently throwing the workflow away (the old behavior made workflows "impossible to create"); cancelling a field mid-step drops only that step, not the whole wizard. The confusing per-step "Stop workflow" choice is now clearly labeled "If this step fails: …".
- **Trigger timing per trigger**: the Add Trigger wizard ends with *Default timing / Customize timing…* (debounce, cooldown, hourly cap), and every trigger now has right-click → **Edit Trigger** for name, prompt, target agent, debounce, cooldown and cap — no more editing `farm-tasks.json` by hand.
- **Clearer trigger actions**: "Run a task on an agent you pick" (you choose the agent next) vs "Dispatch — route to the best agent automatically"; the agent picker no longer dies silently when the window loses focus.

## 2.7.0 — Session viewer polish (2026-07-10)

Second round of real-user feedback, all about reviewing sessions:

- **Resume any session**: ⏵ / right-click → **Resume Session in Terminal** on session rows (Agents tree and Recent Sessions), and a **⏵ Resume** button in the session viewer — opens a terminal in the session's folder and runs `claude --resume <id>`. Continue Latest is no longer the only way back in.
- **Turn breakdown table**: a collapsible box under the KPI cards lists every turn in one table (number, prompt snippet, tokens, cost); clicking a row jumps to that turn (or moves the replay position). Turn accounting fixed: usage on non-rendering assistant lines (thinking-only stream lines) now bills to its turn — per-turn totals add up to the session total exactly.
- **Show filter**: chip row (All / Dialog / User / Assistant / Tool calls / Results / Errors) filters the message list *and* the replay stream — "Dialog" plays back just you and the assistant.
- **✕ Exit in the sticky replay bar** — no more scrolling up to leave replay.
- **Human session titles**: `<command-name>` blocks, slash commands and `!` shell lines no longer become titles; array-content prompts (newer transcript format) are recognized. Turn labels show commands as e.g. `/clear`.
- **Rename Session…**: give any session a persistent custom name (empty restores the automatic title); stored in extension state, transcripts untouched.
- Removed the Turkish word "Kılavuz" from the English UI strings.

## 2.6.0 — Observability polish (2026-07-10)

First round of real-user feedback — four requests, four features:

- **Per-turn token breakdown**: the session viewer draws a divider at every user prompt — `Turn 3/12 · 45.2K tok · $0.31` — so the session total is now itemized by turn. Tokens of tool-only assistant steps (no text block) are no longer dropped; they show on the first tool-call row.
- **Context gauge**: a "Context now" card shows the last request's context size (prompt + cache + output) against `agentFarm.contextWindowTokens` (default 200K) — amber at 70% with a `/compact` hint, red at 90%. The viewer now live-refreshes while the session is running, and session tooltips in the tree show `Context now: ~X tokens`.
- **Sticky replay controls**: the replay bar pins to the top of the viewer, so Pause/speed/jump buttons stay reachable while messages stream past (previously they scrolled out of view).
- **Token lap counter**: `Reset Token Lap` starts a trip-meter (like a stopwatch lap) counting fleet-wide tokens/cost from that moment — shown as `⏱ 84.2K` in the status bar with details and reset/clear links in the tooltip; `Clear Token Lap` removes it. Fed from the 48h recent-message window.
- Quick Start now explains how to restore a hidden sidebar section (VS Code remembers hidden views — e.g. a missing **Tasks** view).

## 2.5.0 — Scale & Ecosystem (Ultra Phase J) (2026-07-09)

- **Parallel worktree runs (J1)**: each prompt runs in its own `git worktree` (`af/` branches) — conflict-free parallel code work; `Worktree Runs…` shows diffstats and offers Merge / Open / Discard (with a fallback for old git versions).
- **Live relay (J2)**: `farmRelay.js` on another machine turns its Claude activity into a compact event feed file; synced here and listed in `agentFarm.relayFeeds`, remote agents light up in the live monitor. Transport is your own file sync — no sockets.
- **OpenTelemetry export (J3)**: sessions (with subagent parent/child span hierarchy) as OTLP/JSON for Langfuse / Grafana Tempo / any OTLP consumer. Only writes a file; you choose where it goes.
- **Agent pack gallery (J4)**: git-repo or folder pack sources (`agentFarm.packGalleryRepos`) → browse → import through the normal safe flow.
- **Multi-CLI executor (J5)**: `agentFarm.cliProfiles` runs tasks on gemini/codex-style CLIs via `{prompt}`/`{args}` templates; deep monitoring stays Claude-specific by design.
- **Spoken briefing (J6)**: the daily digest as an mp3 via fal.ai TTS, dropped into a phone-synced folder.

## 2.4.0 — Intelligence Depth (Ultra Phase I) (2026-07-09)

- **Instruction versioning (I1)**: every CLAUDE.md change is snapshotted; `Instruction History & Impact…` correlates versions with quality scores and cost per day — rule changes become measurable.
- **A/B instruction experiments (I2)**: two variants answer the same prompt set (eval cases auto-selected) in isolated sandboxes; a cheap judge compares with randomized order; the winner applies with backup + history entry.
- **Memory distillation (I3)**: cheap-model condensing drafts for oversized/stale memory files — diff view, explicit approval, `.afbak` backup; guards against CLI limit messages and dropped frontmatter.
- **Semantic memory query (I4)**: `Ask Fleet Memory…` searches all agents' memory files by meaning (separate incremental index, same embeddings providers).
- **Model policy engine (I5)**: rule-based `--model` routing by task source/agent/prompt (`agentFarm.modelPolicy`) plus automatic downgrade when the 5h window passes `quotaDowngradePercent`; decisions are stamped into task output headers.

## 2.3.0 — Safety & Reliability (Ultra Phase H) (2026-07-09)

- **Guardrail auditor (H1)**: automatic permission lint per agent — bypassed permission modes, dangerous whitelisted patterns (`rm -rf`, `curl | sh`, force push…), blanket allows (`Bash(*)`), wildcard rules unused for 30 days, duplicates. Findings in Insights, click-through to the settings file.
- **Trigger reliability scorecard (H2)**: every trigger row shows `fired 12× • 7d: 9✓/1✗ • start ~4s`; `Trigger Reliability Report` for the full table; "always fails" and "never fired" alerts.
- **Synthetic pulse checks (H3)**: a fixed cheap prompt per agent + cheap identity-coherence judge (`agentFarm.pulse` nightly/weekly or `Run Pulse Check Now`); failures become error insights before real work breaks.
- **Headless service (H4)**: a dependency-free node process (Windows scheduled task) keeps schedules and watch triggers running while VS Code is closed; heartbeat handover, shared task store and outputs archive, "ran N tasks while you were away" digest.

## 2.2.0 — Command Center (Ultra Phase G) (2026-07-09)

- **Needs You queue (G1)**: one urgency-sorted panel for everything blocked on you — permission waits, browser-step approvals (Run/Reject from the queue; races the notification, first decision wins), stalled sessions, budget breaches, Antigravity conflicts, open suggestions, parked tasks. The status-bar badge now counts and opens this queue.
- **Kanban board (G5)**: Inbox / Parked / Running / Needs Approval / Done columns with drag-and-drop transitions, card badges (agent, duration, verify, media cost) and the natural-language command bar on top.
- **Cost anomaly detector (G2)**: median+MAD statistics over the trailing 14 days flag "today is 4.2x normal" per agent and fleet — independent of budgets, no model calls. `Cost Anomaly Report` adds the heavy-hitters view (which few sessions eat 50% of tokens).
- **Eval sets (G3)**: low-scored sessions and FAIL-verified steps become regression cases in one step; replay the set on demand (cheap model + cheap judge) and get a scorecard with regressions vs the previous run.
- **Session replay (G4)**: ▶ Replay in the session viewer — step-through playback honoring real gaps, 1x-8x speed, jump to next error / next prompt.
- **Subagent tree (G6)**: session lists are now trees; parent rows show a ⧉ cost rollup of the whole subagent subtree (up to 5 levels).

## 2.1.0 — Semantic Search, Browser Steps & Ultra Roadmap (2026-07-09)

- **Semantic search**: "semantic" mode in Transcript Search — meaning-based queries over an incremental, file-based vector index. Providers: Gemini API or any OpenAI-compatible endpoint (fully local via Ollama). `Build Semantic Index` command, similarity badges.
- **Browser steps (F3)**: workflow step where the agent drives its own browser MCP. Non-negotiable host allowlist (a non-covered URL never runs) + per-step approval modal by default; onFail routing applies.
- **Ultra Roadmap**: research-based second-generation roadmap (`docs/ULTRA-GELISIM.tr.md`, `Open Ultra Roadmap` command) — approval queue, cost anomaly detection, eval sets, kanban board, guardrail linting and more.

## 2.0.0 — Natural-Language Command & Dispatcher (2026-07-09)

- **Natural Language Command…**: one sentence → cheap-model plan (task / schedule / multi-step workflow) → human-readable preview → installed only on approval. Agent names are validated; relative times ("tomorrow 9:00") resolve against the current date.
- **Dispatcher**: new trigger action "Dispatch — route to the best agent". Regex rules first (`agentFarm.dispatchRules`), cheap-model classifier fallback using CLAUDE.md role hints (`agentFarm.dispatchClassifier`). `Test Dispatcher…` dry-runs routing.
- Phase F status: F1/F2 shipped; browser automation (F3) achievable today via a browser MCP server; the voice loop (F4) is documented as a recipe (Whisper + watch/dispatch trigger); multi-CLI (F5) deferred.

## 1.3.0 — Antigravity Compatibility (2026-07-09)

- **Sync Agent with Antigravity…**: generates `AGENTS.md` from `CLAUDE.md`, turns active duties into `.agents/workflows/` slash-commands, and prepares an MCP merge suggestion; `memory/` is shared as-is (plain markdown).
- **Directional sync**: content fingerprints detect which side moved — refresh forward (Claude → Antigravity), carry hand-edits back (Antigravity → Claude, with backups), or resolve conflicts via diff; foreign files and hand-edited workflows are never overwritten silently.
- Insights: `antigravity` category reminds you when the two sides drift.

## 1.2.0 — Scale & Portability (2026-07-09)

- **Multi-machine**: `agentFarm.extraClaudeDirs` watches synced `.claude` folders from other machines; their sessions appear with a ⇄ machine badge and are matched to agents by working directory.
- **Daily digest**: compact phone-friendly fleet scorecard posted to your webhook (n8n → Telegram) at a configured time — no model call. `Send Daily Digest Now` for manual runs.
- **Agent packs**: `Export Agent Pack…` / `Import Agent Pack…` — identity, duties, tools and the agent's workflows/triggers/schedules in one `.agentpack` file. Memory and secrets are never included; imported triggers/schedules arrive disabled.
- Marketplace prep: LICENSE, CHANGELOG, README refresh, privacy statement.

## 1.1.0 — Smart Supervision (2026-07-09)

- **Quality scorecard**: a cheap-model judge samples recent sessions (1-5); Quality column on the dashboard and fleet report; decline-trend and low-average warnings in Insights.
- **Instruction suggestions**: repeated user corrections in transcripts become proposed CLAUDE.md rules — reviewed and applied only with explicit approval.
- **Weekly summary**: a three-sentence human-language fleet status note (budget/trend/errors/quality), as a notification, vault file and webhook event.
- **Transcript search**: text/regex search across all session transcripts with agent filter and highlighted context.
- All automatic loops ship disabled; internal helper calls always use a cheap model.

## 1.0.0 — Content Factory (2026-07-09)

- **Media steps**: image/video/audio generation via the fal.ai queue API inside workflows; assets download into the outputs archive.
- **Media gallery** with previews, Re-run/Vary; **media cost** estimation and dashboard card; ready-made **recipes** (Text→Image, Text→Image→Video, Speech→Text).

## 0.9.0 — Outside-World Bridge (2026-07-09)

- Secrets vault (OS keychain), MCP server panel with usage counts, webhook workflow steps, inbound `/trigger/<token>` endpoint, notification forwarding to any webhook.

## 0.8.0 — Automation Core (2026-07-09)

- Triggers (file watch / hook / webhook), cheap-model verify steps with retry, structured JSON handoffs (`{prev_json.field}`), concurrency limits + quota guard, monthly task history.

## 0.1.0 – 0.7.3 (2026-07-08)

- Fleet dashboard, cost analytics, session explorer, health insights, live hook-based monitoring and timeline, task queue and schedules, multi-agent workflows, standing duties (DUTIES.md), shared-memory sync, fleet reports, Turkish guide and examples, real-run test campaign.
