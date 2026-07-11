# Changelog

All notable changes to Agent Farm. Detailed Turkish release notes live in the built-in guide (`Agent Farm: Open Guide` → Sürüm Notları).

## 2.35.0 — Poll retry & crash-proofing, wave F3 (2026-07-11)

- **A network blip no longer kills a long render.** All media/webhook poll loops (fal, Replicate, webhook poll mode) now tolerate transient failures — network errors, 5xx and 429 are retried with growing waits before the job is declared failed; permanent errors (4xx) still fail fast. **Submits are deliberately never retried** — a duplicate submit could queue (and charge) the job twice.
- **No more silently stuck media steps**: a network error during submit or polling used to surface as an unhandled rejection, leaving the task "running" forever with the chain dead. Every provider call is now fenced — any unexpected error fails the step honestly through the normal `onFail` routing, and the reattach path is fenced the same way.

## 2.34.0 — Codex & Gemini transcript adapters, wave E3b (2026-07-11)

- **Sessions from Codex CLI and Gemini CLI now appear in the external-session history with real token usage.** Codex rollout transcripts (`~/.codex/sessions/**/rollout-*.jsonl`, archived ones included) are parsed for prompts, tool calls, model, cwd (→ agent assignment) and the cumulative `token_count` totals; Gemini chat files (`~/.gemini/tmp/<hash>/chats/*.json|jsonl`) for prompts, per-turn token usage and models — the project hash is matched against your agents' directory hashes to assign sessions to agents. Paths are configurable via `agentFarm.codexHome` / `agentFarm.geminiDir`.
- **Costs are honest**: each external model's usage is priced through your `agentFarm.pricing` rules — add a rule (e.g. `"gpt-5"` or `"gemini-2\\.5-pro"`) and the dashboard line and session rows show real dollar values; without a rule the cost is $0 and the model appears in the existing unknown-models warning. Clicking an external session opens its raw transcript; claude-only analytics still never see these sessions (side-list architecture from 2.32.0).
- Formats were implemented against the upstream sources (openai/codex protocol + gemini-cli, July 2026) and are fail-soft: an unrecognized file or line is skipped silently, and live-event lanes that overlap a parsed transcript are deduplicated (the transcript wins). Formats drift — if a session doesn't show up, it costs nothing.

## 2.33.0 — Long-job durability, wave F (2026-07-11)

- **Media renders survive window reloads**: the moment a fal/Replicate job is queued, its poll URLs are persisted on the task. If the window closes mid-render, the next window **reattaches** — polling resumes, assets download, the gallery meta is written, and the workflow chain continues exactly where it left off (the archive notes the reattach). Jobs whose deadline already passed fall back to the resume offer below.
- **Interrupted workflow runs are detected and offered for resume**: workflow steps that were running when the window closed used to become zombie "queued" rows that silently killed the chain. They are now honestly marked *cancelled* (excluded from success-rate analytics), the archive gets an "Interrupted" note, and at startup one notification offers **Resume** — re-entering each run at its earliest interrupted step with the previous step's handoff rebuilt from disk (parallel groups re-fan from the group start). Declining keeps the per-task Resume buttons.
- Provider poll loops were split into reusable `pollFalResult` / `pollReplicateResult` (submit behavior unchanged, verified against the existing mock-server suite). Provider retry/backoff policies remain a separate roadmap item.

## 2.32.0 — External sessions in history views, wave E3a (2026-07-11)

- **External-CLI sessions now have a history presence**: they appear in the Sessions tree and under each agent's Sessions section (terminal icon, CLI badge, prompt/tool counts, "no transcript" tooltip; clicking opens the Live Timeline), and the dashboard shows an honest one-liner ("External CLI sessions: gemini ×3 · codex ×1 — tokens/cost not included above"). Data comes from the live event store (`cli:` lanes, ~31 days) — **no foreign log-format guessing**, and cost stays honestly at 0 until real transcript adapters exist.
- Architecture: a new `SessionSource` seam (`core/sessionSource.ts`) normalizes foreign sessions to `SessionInfo`, but they live in a **side list** on the index — `all()`/`forAgent()` stay claude-only, so claude-specific analytics (context health, cache efficiency, skill/MCP/memory usage, reports, search, OTLP export) structurally never see them. Sources are fail-soft: a broken source contributes nothing.

## 2.31.0 — Hook bridge for external CLI events, wave E2b (2026-07-11)

- **Any external CLI can now feed rich events onto its timeline lane.** Terminals opened via *Start Session With…* carry `AGENT_FARM_SESSION` / `AGENT_FARM_CWD` / `AGENT_FARM_EVENT_PORT` / `AGENT_FARM_HOOK` env vars, and the extension ships a tiny bridge script (`cliHook.js`): wire it into the CLI's notify/hook mechanism (e.g. codex `notify`) or a wrapper, and prompts/tools/turn-ends appear live on the session's lane — `node "$AGENT_FARM_HOOK" --event Stop`, `--event PreToolUse --tool Bash`, or pipe the CLI's notify JSON to `--json` (known types like `agent-turn-complete` are mapped automatically). **Agent Farm: Copy CLI Hook Bridge Command** puts a ready-to-paste invocation on the clipboard.
- Fail-soft by design: the bridge always exits 0, never blocks the CLI, and is inert when the listener is off. Without a session env var, events from the same folder fold into a stable `cli:external:<folder>` lane. Claude terminals get no env vars — the Claude hook path is untouched. Cost tracking for external CLIs remains honestly absent (transcript adapters are the next step).

## 2.30.0 — External CLI session lifecycle on the timeline, wave E2a (2026-07-11)

- **Sessions opened with another CLI now show up on the Live Timeline**: starting a gemini/codex/… session via *Start Session With…* adds an `idle` lane row the moment the terminal opens and marks it `ended` when the terminal closes. The card carries a CLI badge and an honest "external CLI — lifecycle only" note — external CLIs emit no hooks, so intermediate states (working/tool), prompts and cost are not tracked (that's the event-feeder / transcript-adapter roadmap steps). Session ids are namespaced (`cli:<cliId>:…`) so they can never collide with Claude's session ids; **the Claude hook path is untouched**.
- After a window reload, external lanes re-attach to their restored terminal by name; if the terminal didn't come back, the lane is closed out instead of lingering as a ghost row. In `agentFarm.externalTerminal` mode there is no terminal object to watch, so lifecycle tracking is honestly skipped.

## 2.29.0 — Start a session with another CLI, wave E1 (2026-07-11)

- **Start Session With… (choose CLI)**: a new agent right-click / palette command opens a terminal session in the agent's folder using a CLI you pick — Claude Code (default) or any `agentFarm.cliProfiles` entry (gemini, codex, …), launched with the profile's `interactive` command. The last CLI you used for each agent is remembered and floats to the top. It honours `agentFarm.externalTerminal`. **The Claude path is untouched** — this is a separate sibling command; existing *Start Claude Session* / *Continue Latest Session* behave exactly as before. Live monitoring, transcripts and cost stay Claude-specific for now (multi-CLI session monitoring — event feeder + transcript adapters — is the next roadmap step).

## 2.28.0 — Premiere bridge (sequence export), wave D (2026-07-11)

- **Export a production as an editor sequence**: `Agent Farm: Export Premiere Sequence` (or the **Export sequence →** button in the gallery when a production is selected) turns a production manifest + its assets into an **FCP7 XML** (Premiere imports it via File → Import) and a **CMX3600 EDL**. One clip per scene in manifest order — a video you kept in a selection step wins, else any video, else an image; rejected assets are skipped; scenes with no asset are omitted. Pick the frame rate (24/25/30/60) and a default per-scene clip length.
- **Naming-convention auto-linking**: when an ingest folder is tied to a production, a scene token in the filename (`…_s03_…` or `…_S3_…`) auto-assigns the ingested file to that scene — so re-importing a `P01_S03_T02.mp4` export lands on the right scene and closes the loop.
- Completes wave D of the media roadmap. A UXP Premiere panel is intentionally deferred until the XML/EDL path is exhausted.

## 2.27.0 — Webhook poll mode (generic queue client), wave C (2026-07-11)

- **Webhook step: auth headers + poll mode**. The webhook step can now carry an auth header (`Authorization: Bearer {secret:TOKEN}`, `{secret:}` substituted) and, more importantly, a **poll mode** that turns it into a submit→poll queue client for *any* queued API — no bespoke media provider needed. The wizard asks for a JSON path to the poll URL in the submit response (e.g. `urls.get`, `status_url`), a status field, and a "done" regex; the step then polls until the job finishes and hands off the final response. This covers Gemini's long-running media operations, self-hosted queues, and anything else with a submit-then-poll shape. Auth headers are carried into the poll requests; interval and timeout are configurable. Completes wave C of the media roadmap.

## 2.26.0 — Media provider abstraction + Replicate, wave C (2026-07-11)

- **Media providers**: the media step no longer hard-codes fal.ai. The model id now routes to a provider — unprefixed ids go to fal.ai exactly as before (every existing workflow is unchanged), and `replicate:owner/name` (or `replicate:owner/name:version`) goes to **Replicate's prediction API**. Downloading, the asset archive, gallery, cost, selection and vision QA all work identically regardless of provider. Store your Replicate token as the `REPLICATE_API_TOKEN` secret (configurable via `agentFarm.replicateAuthSecret`). New providers plug in behind one interface (`run(model, input, auth)`), so fal's behaviour is preserved bit-for-bit.
- Under the hood `MediaProvider` / `providerFor(model)` (`core/mediaProviders.ts`); `mediaAuth`/`mediaBaseUrl` are now provider-aware. Gemini and a generic webhook poll-mode remain for a later increment.

## 2.25.0 — Media vision QA, wave B2 (2026-07-11)

- **Vision QA on media steps**: give a media step an optional quality criterion (the wizard asks). As soon as the asset is produced, a **vision-capable model** (the cheap judge, haiku by default) opens the file via its Read tool and rules PASS/FAIL with a reason. On FAIL the step **regenerates itself** — the reason is folded into the input's `prompt` field — up to the configured retry count; if it still fails, the step's onFail policy applies. It's the visual counterpart of the text `verify` gate ("one person, sharp face, no six fingers, matches the storyboard brief"). Fail-open: if the judge can't run, the pipeline is not blocked. This also fixes verify on media steps, which previously crashed on retry (media tasks have no agent). Completes wave B of the media roadmap.

## 2.24.0 — Visual selection step, wave B1 (2026-07-11)

The heart of media production: pick a subset of generated candidates and continue only with those.

- **Select-assets step** (`$(checklist) Select assets (visual pick)` in the workflow wizard): when the chain reaches it, every asset produced so far in the run opens in a **gallery-picker** panel. Keep some (min, or min-max); **Use selected** stays disabled until the minimum is met and blocks past the maximum. The chosen asset **URLs become the handoff** — the next media/agent step works only with them via `{prev_json.selected.0}` (one URL) or `{prev_text}` (all kept URLs, one per line). It's the remote URL that flows, not the local path, so a downstream fal.ai image→video step consumes it directly. Cancel applies the step's onFail policy; with no UI wired (headless) everything is kept so chains don't hang. Kept/dropped assets are badged `✓ kept` / `✗ dropped` in the gallery.
- Media metas now record `assetUrls` (remote URLs aligned to downloaded files) so selections can hand off URLs.

## 2.23.0 — Media asset pipeline, wave A (2026-07-11)

First wave of the media/video-production roadmap (`docs/ROADMAP.media.tr.md`): make every asset — generated or hand-downloaded — trackable by production scene.

- **Production manifests**: a `production.json` in an agent's folder describes a scene-by-scene project (title → scenes, each with a status: draft/generating/review/approved). Create one via `Agent Farm: New Production`; edit by hand anytime. Parsed fail-soft.
- **Gallery scene board + filters**: the Media Gallery now groups by production. Filter by production / scene / source; a scene status board (rows = scenes, columns = image/video/audio/other) shows where each scene stands — click a cell to filter, click a status badge to change it. Assign any asset to a scene with the new **Scene…** button.
- **Asset ingest** (`agentFarm.ingestFolders`): watched folders (downloads, render exports…) are scanned every 30s; new media files are registered into the gallery **in place** (no copy), tagged `external:<label>`, with a size-stability check (skips half-downloaded files) and a 48h backfill limit. `Agent Farm: Register Media Asset(s)…` does the same by hand. External assets show an `external:` badge and skip Re-run/Vary.
- **Media step scene linking**: media steps (and gallery Re-run/Vary) carry `projectId/sceneId`; the workflow wizard asks which scene produced assets belong to when a manifest exists.
- **Monthly media budget alert**: `agentFarm.mediaBudgetMonthUSD` (0 = off) warns once per month when the last 30 days' estimated media cost crosses the threshold (also forwarded to the webhook).
- **Fix — Live sessions blank after reload**: reopening VS Code showed agents in the timeline swim lanes but "no sessions tracked" in the Live sessions list until a new prompt arrived. The session cards are now rebuilt from the persisted event store on startup (statuses replayed; ended sessions stay gone; stale mid-work ones are marked stalled quietly).

## 2.22.0 — Per-agent "your turn" notifications (2026-07-11)

- **Swim-lane turn-ready toggles**: each agent's lane in the Live Timeline now carries four toggles in the left gutter — **♪ sound · ◎ focus · ▣ modal · ▭ toast**. Whatever an agent has selected fires when it crosses INTO YOUR TURN (a turn finishes / it starts waiting for your input). Independent per agent; click to toggle. Selections persist in `globalState` and the firing runs host-side, so it works even when the timeline panel is closed. Sound = a short beep (PowerShell on Windows); Focus = reveals the timeline panel; Modal = a blocking "Sıra sende: <agent>" dialog with an Open-transcript button; Toast = the corner notification. One alert per turn (3s per-agent coalescing). This is separate from the global `agentFarm.notifyTurnEnd` toast.
- **Dashboard → Live Timeline button** in the header row (between Refresh and Guide).
- **New living roadmap document**: `docs/ROADMAP.media.tr.md` — what the extension offers today for scene-by-scene media/video production workflows (storyboard → image gen → video gen → Premiere), what it can't do yet, and a wave-based development plan (asset pipeline, visual approval/selection, media provider abstraction, Premiere bridge, multi-CLI sessions, long-job resilience).

## 2.21.0 — Task forecast & digest outcomes, wave 4 (2026-07-11)

- **Task Forecast** (calendar icon in the Tasks view title): a markdown projection of what runs next — each schedule's fire times over the next `forecastDays` (default 7), grouped by day, annotated with the same job's 30-day median duration and success rate (from task-history analytics); plus the current queue, running tasks, and an estimated total agent-time. Duration is computed from successful runs only.
- **Daily digest gains task outcomes**: the daily summary card now includes a "finished today: X✓ Y✗ — failures: …" line.
- Per-task dollar-cost estimation is intentionally deferred — token cost lives in session transcripts, not tied to tasks, so the forecast projects duration and success rather than fabricating a cost. This completes the task roadmap (waves 1–4).

## 2.20.0 — Parallel steps & fan-in, wave 3b (2026-07-11)

- **Parallel step groups**: mark a workflow step *Parallel* (in the New Workflow wizard or Edit Step) and consecutive parallel steps form a group. When the chain reaches the group, every step launches at once with the same handoff (fan-out); once all branches finish, their outputs merge into one handoff and the step after the group runs (fan-in). The merged `{prev_text}` is labeled by step title and `{prev_json.branches}` is a `[{step, text, json}]` array. Each branch can carry its own `runIf` (a non-matching branch is skipped, not failed); if any branch fails, the group's first-step `onFail` policy applies. Real concurrency is bounded by `maxConcurrentTasks`/`maxConcurrentPerAgent`. Fully backward compatible — steps without the flag run sequentially as before. Group members show a ∥ merge icon in the Tasks tree. This completes wave 3 (DAG orchestration).

## 2.19.0 — Workflow approval step, wave 3a (2026-07-11)

- **Approval gate step**: drop a human-in-the-loop gate into any multi-agent workflow (New Workflow → *Approval gate*). When the chain reaches it, it pauses and waits for your sign-off — no agent, no model call. The request appears both as a notification and in the **Needs You** panel (first settle wins). **Approve** passes the previous step's output straight through to the next step; **Reject** applies the step's onFail policy (stop by default). The gate shows as an `approval` row in the Tasks tree with an APPROVED/REJECTED stamp in its output archive. Runs only while VS Code is open; the headless service auto-approves so unattended chains never hang. (First half of wave 3 — parallel/fan-in steps are a separate wave.)

## 2.18.0 — Task lifecycle ergonomics, wave 2 (2026-07-11)

Managing delegated work is now one click from the Tasks tree.

- **Retry / Retry with edited prompt**: any finished task (done/failed/cancelled) can be re-queued as a fresh copy (`(retry N)` title, incrementing attempt counter), optionally after editing the prompt in place.
- **Resume workflow from this step**: a finished workflow-step task can restart the chain from its own step, rebuilding the handoff from the previous step's output in the same run — no more re-running the whole workflow to get past a failed step.
- **Run Next + priority/aging**: bump a queued task to the front of the launch order (`⬆ next`); the queue is no longer pure insertion order — higher priority launches first, ties break oldest-first, and every queued task gains +1 priority per 30 minutes waited so nothing starves.
- **Duplicate guard**: adding a task whose exact prompt is already queued for that agent now asks for confirmation.

## 2.17.0 — Task health & analytics, wave 1 (2026-07-11)

The "see at a glance + health signals" maturity from skills/MCP/memory, applied to the task system. Statistics merge the live task list with the `task-history/YYYY-MM.jsonl` archive, so finished-and-cleared runs still count.

- **"Task health" card on the Agent Detail page**: the last 30 days of delegated work — runs (✓/✗/cancelled), success rate (green ≥80%, red <50%), median duration, retries and verify outcomes, source breakdown (manual/schedule/trigger/workflow), media cost and the live queue. Consecutive failures show a red warning line naming the last failed task.
- **Tasks grid in the Capability Matrix**: task families × agents (repeated runs of the same job group together — retry suffixes, dates and numbers are normalized). Cells show completed-run counts: green = all succeeded, red = all failed, orange ring = mixed; a source tag (`man/sch/trg/wf`) marks where the family's runs come from and a red dot flags families whose last runs all failed. Click any cell for the full task history.
- **Task reliability insights**: an agent whose 30-day success rate drops below 50% (with ≥5 completed runs) and any task family whose last runs all FAILED now raise `task` warnings in the Insights view — broken chains surface before they burn more quota.

## 2.16.0 — Memory & duty management, wave 3: unified intelligence (2026-07-11)

- **Capability Matrix grows two grids**: *Memory files × agents* — cross-agent copies with 30-day recall heat and a **divergence ring** (orange = this copy's content differs from the newest one); ＋ copies the file to that agent with the MEMORY.md pointer line. *Duties × agents* — cadence cells (`turn/start/daily/weekly/manual`, ⏸ = paused, tooltip shows watch/do); ＋ copies the duty (with the CLAUDE.md DUTIES.md-reference check on the target). Multi-agent rows sort first.
- **"Context health" card on the Agent Detail page**: memory hygiene (files, on-demand tokens, orphans, not-recalled 30d, stale 45d+), skills/MCP usage summaries and duty compliance (last DUTIES.md read + sessions this week) in one glance. The Memory files table gains a **Recalls 30d** column and orphan markers.
- **Scan Memory Contradictions…** (right-click a Memory section): a cheap model cross-reads the agent's memory corpus and lists conflicting claims (which files, which claims, short note) as a markdown report. Date/recency differences don't count; output passes JSON validation and the quota-message guard. Findings are suggestions — read both records before merging or deleting anything.
- **Frontmatter audit**: memory files without a description now surface as info insights (index lines and semantic recall key on the description).

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
