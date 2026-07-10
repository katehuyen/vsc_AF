# Changelog

All notable changes to Agent Farm. Detailed Turkish release notes live in the built-in guide (`Agent Farm: Open Guide` → Sürüm Notları).

## 2.15.0 — Memory & duty management, wave 2 (2026-07-11)

- **Memory Graph panel** (`Agent Farm: Open Memory Graph`, or right-click a Memory section): the `[[wikilink]]` structure of each agent's memory as a graph — node size = token weight, green = recalled (30d), dashed yellow ring = missing from MEMORY.md; edge = resolved wikilink (targets resolve via basename AND frontmatter `name:` slug). Cards list **broken links** (targets that resolve to nothing), **islands** (records with no links at all) and **hubs** (most linked-to records). Click a node to open the file.
- **Fix Memory Index…**: one command repairs MEMORY.md — proposes a pointer line for every orphan file (description pulled from its frontmatter) and drops index lines whose every file reference is dead; you pick which fixes to apply, the index is backed up.
- **Copy Memory File to Agent…**: copies the file and appends the pointer line to the target's MEMORY.md, so copies never arrive orphaned.
- **Add Duty from Template…**: four proven vigilance patterns installed in one pick (Q&A loop on a watched file, inbox triage on a folder, weekly memory upkeep, output-folder review); the wizard asks only for the watch target.
- **Automate Duty (create trigger)…**: bridges duties and automation — a duty watching a real file/folder gets a watch trigger that fires a headless task on the same agent even while it is idle (debounce 10s, cooldown 60s, max 6/h). The duty itself stays in DUTIES.md; the two complement each other.
- **Copy Duty to Agent…** (with title-collision guard + CLAUDE.md reference check on the target) and **Move Duty Up/Down** (reorder DUTIES.md blocks from the tree).

## 2.14.0 — Memory & duty management, wave 1 (2026-07-11)

The "see at a glance + manage in one click" maturity from Skills/MCP, applied to memory and duties:

- **Memory recall tracking**: the Memory section header now reads `N files • ~X tok • M recalled (30d)`; each file row shows its real recall count/time (`recalled ×5 (30d), last 2h` or `not recalled (30d)`, green icon = in use). A recall is the agent explicitly opening the file with a tool (Read/Edit/Write), counted from transcripts; MEMORY.md is exempt (it loads passively every session, marked `index — loads every session`).
- **Orphan marker**: files not referenced from MEMORY.md show `⚠ orphan` (the agent can never find them through the index). Tooltips show the frontmatter `type` and `description`.
- **New Memory File…** (+ on the section): name + type + one-line description → scaffolds the frontmatter file AND appends the MEMORY.md pointer line, so new memories are never born orphaned.
- **Archive Memory File**: moves the file to `memory/archive/` (out of the scan) and drops its MEMORY.md line with a timestamped index backup — the safe way to remove dead weight without deleting.
- **Edit Duty…** (right-click a duty): change title/cadence/watch/do/note in a wizard prefilled with current values; no more hand-editing DUTIES.md for small changes.
- **Watch preview**: a duty's `3 waiting` tooltip now lists the waiting file names and the age of the oldest one.
- `agentFarm.maxTranscriptMessages` default raised 400 → **1500**.

## 2.13.2 — Fix: session viewer stuck on "Loading…" (2026-07-11)

- Some session pages hung forever on "Loading…" with raw JSON leaking into the page. Cause: the transcript data is injected into an inline `<script>window.__DATA__ = …</script>` tag, and any session whose transcript quoted a literal `</script>` (e.g. this project's own webview code) closed that tag early, corrupting the page. Fixed at the source (`base.ts`): the injected JSON now escapes `<` as `<` and the U+2028/U+2029 line separators, so no transcript content can break out of the script tag. Affects every Agent Farm webview, not just the session viewer.

## 2.13.1 — Timeline session-start color (2026-07-10)

- Live Timeline "session start" marks are now pure blue (#0000FF) instead of green, so they read distinctly against the green tool-run bars.

## 2.13.0 — Deeper capability management + long time ranges (2026-07-10)

**Skills & MCP — see at a glance, manage in one click:**

- **Capability Matrix panel** (new, `Agent Farm: Open Capability Matrix`, table icon in the Agents view title): skills × agents and MCP servers × agents grids with 30-day usage heat, summary chips (total / used / unused), dead-capability markers, and one-click copy from an empty cell to install a capability onto that agent. Clicking a used cell or row name opens the source file.
- **At-a-glance tree status:** MCP/Skills section headers now read `N • M used (30d)` (MCP also `K disabled`); rows show last-used time; MCP tooltips list the top called tools (`vault_read ×394, search_query ×88…`).
- **MCP management (right-click):** Edit MCP Server… (edit command/URL in place, backed up), Disable/Enable MCP Server (via the agent's `disabledMcpjsonServers` — the same key Claude Code honors; disabled servers render greyed with ⊘), Copy MCP Server to Agent….
- **Skill management (right-click):** Copy Skill to Agent…, Move Skill Between Agent/User Scope…, Reveal Skill Folder.
- **Health insights:** warns on a SKILL.md with no description (claude loads skills by description, so it would rarely fire) and flags agent-scope skills unused for 30 days.

**Long time ranges:**

- **Live Timeline** gains an **8h** detail window plus **24h / 3d / 7d / 30d** density views (per-lane activity bars — tools/prompts/permission-waits — bucketed over 168 slots). Events now persist to `globalStorage/live-events.jsonl`, so **a reload no longer resets the timeline**: memory holds the last 24h, the file keeps 31 days (64MB cap, auto-pruned). 31 days by design, not load — hook events carry no pattern beyond that; the Dashboard is the tool for longer horizons.
- **Dashboard** cost range adds **180d and 365d**; past 120 days the daily bars are bucketed weekly so they stay readable. No extra load — the data already lives in the transcripts.

## 2.12.0 — Skills management (2026-07-10)

- **Skills section in the Agents tree**: each agent now lists its Agent Skills (SKILL.md folders) next to MCP — read from the same directories Claude Code reads (`.claude/skills/` in the agent folder = agent scope, `~/.claude/skills/` = user scope shared by all agents; agent scope shadows user scope on name clashes). Rows show name, scope and **real 30-day usage** counted from transcripts (both `Skill` tool calls by the model and typed `/command` invocations); green sparkle = in use. Click opens SKILL.md.
- **Add Skill… / Remove Skill**: **+** on the section scaffolds `.claude/skills/<name>/SKILL.md` (name + one-line description wizard) and opens it for editing; the trash icon on a skill removes its folder with a one-time backup in a sibling `skills.afbak/` folder. Removing a user-scope skill warns that every agent loses it.

## 2.11.0 — Viewer fixes: ↑ jump, per-model context gauge, timestamped export (2026-07-10)

- **↑ turn jump fixed**: the up arrow on turn bands (and clicking an earlier row in the Turn breakdown table) did nothing. Cause: the bands are `position: sticky`, so every band already scrolled past reports its *stuck* position — pinned at the top of the viewport — and `scrollIntoView` on it is a no-op. Jumps now anchor on the turn's first message (which sits in normal flow) and offset by the band height, so both directions land the band at the top.
- **Context gauge no longer assumes 200K**: the ceiling is now resolved from the session's current model (Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 and older generations → 200K). Unknown models show the raw context size with no percent and no amber/red coloring — no guessed ceiling. `agentFarm.contextWindowTokens` now defaults to **0 = auto**; set a value only to force a fixed ceiling.
- **Export MD filenames carry a timestamp**: `session-<id>-YYYY-MM-DD_HHMMSS.md` (local time) — repeated exports of the same session no longer collide on the same suggested name.

## 2.10.0 — Terminal rendering remedies (2026-07-10)

VS Code's terminal is xterm.js inside Chromium — long TUI sessions (claude) can hit rendering glitches there: ghost spaces while typing, lost/garbled lines. Two remedies, one command:

- **`Agent Farm: Terminal Rendering Fix…`** shows the current state of the relevant settings and offers: **Apply render fix** (`terminal.integrated.gpuAcceleration: off` + `smoothScrolling: off` — the DOM renderer fixes most glitch reports), **Disable persistent sessions** (restored terminals are a common source of garbled output), **Restore VS Code defaults**, and a shortcut to all terminal settings.
- **`agentFarm.externalTerminal`** (toggle in the same command): Start Session / Continue Latest / Resume open in the **OS terminal** — Windows Terminal when available, plain cmd window as fallback — skipping xterm.js entirely. Farm tasks intentionally stay in the integrated terminal so their lifecycle can be tracked.

## 2.9.0 — Export selection UX, turn navigation, focus-loss audit (2026-07-10)

Follow-up to 2.8.0 after immediate feedback ("bulk operations and navigation must come without being asked"):

- **Export selection, everywhere**: the Turn breakdown table now has a checkbox per turn **synced live with the turn bands** (change either side, both update), an **only** button per row (export just that turn), and **All / None / Invert** bulk buttons. The summary line and the Export MD button show a live `included/total` counter when anything is excluded.
- **Turn-to-turn navigation**: every turn band carries **↑ ↓** buttons — jump straight to the previous/next turn without scrolling; the band is sticky, so the buttons are always at hand.
- **Export MD remembers the last folder** you saved to; the save dialog opens there next time (falls back to the session folder).
- **Focus-loss audit (fleet-wide)**: a balanced-paren scan found **38** QuickPick/InputBox steps that silently dismissed when the window lost focus — mid-wizard this killed the flow with no message (the most likely cause of "the agent question never appeared" reports). All 38 now keep focus. Also cross-checked: every declared command is registered, every menu reference exists, every context-menu `when` clause matches a real tree item state.
- **Add Trigger asks the agent question unambiguously** ("Which agent runs this task when the trigger fires?") and the confirmation states the target ("armed — runs on psikolog…"). The wizard's "Run now" after creating a workflow now runs the exact workflow it created.

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
