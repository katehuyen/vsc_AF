# Agent Farm — Guide & Blueprint

> This document evolves alongside the extension. Every **?** button in the UI brings you to the relevant section of this guide. You can also open it any time from the command palette with `Agent Farm: Open Guide`.

## What Is Agent Farm

Agent Farm is the **command center for the Claude Code agents** that live on your computer. You view, manage, cost out and health-check your agents from a single panel.

It is fully local: no data leaves your machine, no server is contacted. It reads two data sources:

1. **Your agent folders** (the roots in the `agentFarm.agentRoots` setting) — subfolders containing a `CLAUDE.md`, `.claude` or `memory/` are the agents; identity, memory, tool and permission files are read from there. A root whose subfolders are agents is a **nest** — its own `CLAUDE.md` counts as shared instructions all its agents load (that's exactly how Claude Code treats parent `CLAUDE.md` files), not as an agent. A root with no agent-like subfolders is a single agent itself. Roots and per-folder exclusions are managed in the **Agent folders** section of Farm Settings (2.61.0).
2. **Your Claude Code session logs** (`~/.claude/projects/*/*.jsonl`) — each session's model, token usage, tool calls and timestamps are read from here. Sessions are matched to agents by their working directory.

## Quick Start {#hizli-baslangic}

If you're brand new, start here. You can return to this section any time from the command palette (`Ctrl+Shift+P`) by typing **Agent Farm: Quick Start**.

> Alongside this guide there is also an **Example Usages** document: 11 step-by-step operational scenarios tested with real runs (inbox duty, handoff chain, context diet, vault scorecard…). Command palette → **Agent Farm: Open Examples**. For media/video production workflows (storyboard → image → video → editing), status and roadmap live in a separate living document: [ROADMAP.media.tr.md](ROADMAP.media.tr.md).

### The First 3 Minutes: Meet the Panel

1. Click the **four-node network icon** in the Activity Bar on the left — the Agent Farm panel opens. You'll see six sections:
   - **Agents** — your agents; a green dot = running right now. Expand an agent: identity, standing duties, memory, permissions, sessions.
   - **Tasks** — the jobs you've queued for agents, scheduled tasks, templates and workflows.
   - **Missions** — multi-agent missions: every run as a tree of rounds and delegations; pending approvals/questions are answered right on the row. ([details](#missions))
   - **Recent Sessions** — the fleet's most recent sessions; click → readable transcript.
   - **Insights** — health findings: what has bloated, what has broken, what has gone stale.
   - **Live Feed** — the fleet's most recent events.

   > **Missing a section?** VS Code permanently remembers when a view has been hidden once or dragged to another panel. **Right-click** any section header in the Agent Farm panel → tick the missing section (e.g. **Tasks**) in the list; it comes back. If a section was dragged to another panel, find it in the same list and drag it back into Agent Farm.
2. Look at the status bar at the bottom: `🤖 1 active • $2.4 today`. Click it → the **Dashboard** opens: today's cost, charts, agent cards, most expensive sessions.
3. Click an agent card in the Dashboard → that agent's **detail page**: cost trend, memory table, health findings, session list.

Every **?** button you see in the UI brings you to the relevant section of this guide — you can't get lost.

### The First 10 Minutes: Three Core Habits

1. **Set up live observation (once):** Command palette → `Agent Farm: Install Live Hooks` → User settings → confirm → restart your open claude sessions. Agents are now tracked live, and you get a notification when one waits for permission. ([details](#live-observation))
2. **Add your first standing duty:** In the Agents tree, right-click an agent's **Duties** row → **Add Standing Duty**. Move your "keep checking here every turn" agreements with the agent into here. ([details](#nobet-gorevleri))
3. **Set a budget:** Settings → `agentFarm.budgets` → something like `{"psychologist": 20, "*": 50}`. You'll be notified when it's exceeded. ([details](#butce-uyarilari))

### What Do You Want to Do? (Recipe List)

| What you want | Where |
| --- | --- |
| How much did I spend today? | Status bar, or Dashboard → Cost today |
| What is this agent burning money on? | Agent card → Detail → Cost by model + Top sessions |
| What is the agent doing right now? | Agents tree (WORKING/TOOL badges) or `Open Live Timeline` |
| Read a past conversation | Recent Sessions → click; there's a search box inside |
| Start / continue an agent | Right-click agent → Start / Continue Latest Session |
| Set up a new agent | The **+** on the Agents header → a scaffolded template appears |
| Queue a job for an agent | Tasks → **+** Add Task (Interactive/Headless) |
| An automatic job every morning at 08:30 | Tasks → calendar icon → Daily 08:30 ([should it run even when VS Code is closed?](#scheduling-outside-vscode)) |
| Run agents chained together | Tasks → `New Multi-Agent Workflow…` — handoff via `{prev_output}` ([conditions](#conditional-branching)) |
| Give a goal, let a lead agent run it round by round | The **Missions** section in the sidebar → **+**, or the **Missions** button on top of every page ([details](#missions)) |
| A "check here every turn" agreement | Duties → Add Standing Duty ([details](#nobet-gorevleri)) |
| Sync duplicate memories across agents | Command palette → `Sync Shared Memory…` |
| Weekly scorecard / vault report | `Export Fleet Report` or automatic: the `autoReport` setting |
| What did the overnight jobs produce? | `Export Task Outputs Digest` |
| Is something broken? | The Insights view — click, the relevant file opens |
| Which agent did I discuss this with? | The 🔍 on the Recent Sessions header → `Search Transcripts…` ([details](#transcript-search)) |
| Are the agents working well? | `Sample Output Quality Now` → the Quality column in the Dashboard ([details](#kalite-karnesi)) |
| The agent keeps making the same mistake | `Scan for Instruction Suggestions…` → apply the 💡 suggestion in Insights ([details](#talimat-onerileri)) |
| "Let me just say it in a sentence and have it set up" | The 🚀 on the Tasks header → `Natural Language Command…` ([details](#natural-language-command)) |
| Search by meaning ("what was that topic?") | The **semantic** box in the search panel ([details](#transcript-search)) |
| Have an agent visit a site and collect data | A Browser step in the chain ([details](#browser-steps)) |
| Have incoming work route itself to the right agent | Trigger action: Dispatch ([details](#dispatcher)) |
| Watch the fleet on my laptop from here too | Sync folder + `extraClaudeDirs` ([details](#multiple-machines)) |
| Send the daily scorecard to Telegram | `agentFarm.dailyDigest` = "21:30" ([details](#daily-digest-card)) |
| Move / share an agent to another machine | Right-click agent → `Export Agent Pack…` ([details](#agent-packs)) |
| Have the agent work under Antigravity too | Right-click agent → `Sync Agent with Antigravity…` ([details](#antigravity-uyumlulugu)) |

### Concepts (in 30 Seconds)

- **Agent** = a folder containing a `CLAUDE.md`. Agent Farm changes nothing, it only reads (with three exceptions it writes with your approval: a new agent scaffold, hook installation, a standing-duty file).
- **Cost** = the API-equivalent value of token usage; on a subscription it isn't a bill, it's a measure of yield.
- **Standing duty** = a continuity agreement with an agent ("watch here, do this when it changes") — it lives in `DUTIES.md`.
- **Task/Workflow** = jobs you start; unlike a standing duty, an agent isn't triggering itself inside a session, it's triggered from the queue.

## Modules

### Agents Tree

The main tree in the side panel. Each agent expands with these sub-sections:

| Section | Contents |
| --- | --- |
| Identity | `CLAUDE.md` — opens on click, with its estimated token size |
| Duties | Standing duties (`DUTIES.md`) — see [Standing Duties](#nobet-gorevleri) |
| Memory | Files under `memory/`; token, last change + **30-day recall count and orphan flag** — see [Memory Management](#hafiza-yonetimi) (2.14.0) |
| Tools | Scripts in the `tools/` folder |
| MCP | The agent's MCP servers + real 30-day usage — see [MCP Management](#mcp-yonetimi) |
| Skills | Agent Skills (`.claude/skills` + `~/.claude/skills`) + real 30-day usage — see [Skill Management](#skill-yonetimi) (2.12.0) |
| Permissions | `.claude/settings.local.json` permission summary |
| Sessions | The last 15 sessions; clicking opens the Session Viewer |

Right-click menu on an agent: **Start Claude Session**, **Continue Latest Session**, **Open Agent Detail**, **Open in New Window**, **Reveal in File Explorer**.

Right-click menu on a session row (2.7.0):

- **Resume Session in Terminal** — opens a terminal in that session's folder and runs `claude --resume <session-id>`: you continue **any past session** where you left off (Continue Latest only resumes the most recent one). The ⏵ icon that appears on hover does the same. The **⏵ Resume** button at the top-right of the Session Viewer does the same job too.
- **Focus Session Terminal (2.58.0)** — the ⌨/terminal icon on hover (and in the right-click menu) jumps straight to that session's terminal window. The same ⌨ is available on **every** surface a session appears: Dashboard and Agent Detail table rows, Timeline live cards, the Session Viewer's top bar and Needs You items.
- **Rename Session…** — give the session your own name (to remember it); leave it blank and the automatic title comes back. Names are persistent, the transcript file is untouched.

Since 2.7.0 session titles are derived from the conversation: commands like `/compact`, `<...>` harness blocks and `!` shell lines are no longer used as titles — the first real user sentence is the title.

### Dashboard

The fleet's overview board. Opens with the `Agent Farm: Open Dashboard` command or by clicking the status bar.

**One header on every page (2.59.0):** every panel's top bar is rendered by a single shared component, so alignment, spacing and ordering are identical everywhere — title and subtitle on the left, one right-aligned toolbar. The toolbar has two halves separated by a thin divider: the **left half is the page's own** scope controls and actions (range/window selectors, Start/Resume/⌨/Export…), and the **right half is the global cluster, the exact same buttons in the exact same order on every page** — **Dashboard · Live Timeline · (related panel) · ⌕ Search · ⚙ Settings · Refresh · ? Guide** — minus only the page you are already on. ⌕ Search is pre-scoped where it makes sense (this agent / this session). Pages differ in their left half; the right half is muscle memory.

- **KPI cards**: active agent count, today's cost, cost for the selected range, session count, the 5-hour window, total finding count.
- **Farm Status card (2.39.0):** just below the KPIs, an honest activation row per subsystem — **green dot = live in use, blue = installed but idle, grey = never used.** Nine rows: live monitoring, tasks/scheduling, triggers, workflows, media pipeline, external CLIs, asset ingest, smart oversight, secret vault. Each dormant row has a **one-click wake-up** button (set up example, add a key, the relevant setting/guide). If something is dormant the card opens expanded; if everything is live it collapses to a single summary. The external-CLI row also reminds you of the fail-soft nature of the adapters: if a profile exists but no session shows up, it may be a sign of format drift.
- **Daily cost by agent**: a stacked cost chart per agent. Range selector (widened in 2.13.0): **7 / 14 / 30 / 90 / 180 / 365 days**. Beyond 120 days the daily bars are automatically **grouped weekly** so they stay readable (a "weekly buckets" note in the title). Since all daily data already comes from session logs, the 1-year view adds no extra load.
- **Cost by model**: a donut chart showing how much was spent on which model.
- **Token types**: input / output / cache write / cache read distribution. A high cache-read ratio means prompt caching is working efficiently — that's good.
- **Activity heatmap**: message density by day-of-week × hour. Shows your work rhythm.
- **Agent cards**: status, today/range cost, mini trend line, finding badges. Click a card → detail page.
- **Sessions table (2.50.0 — merges the former Top/Recent tables; shared with the Agent Detail page since 2.57.0)**: one table with a **Sort by** selector — Recent (default) · Cost · Tokens · **Ctx now** (2.57.0) · Duration · Turns; whichever criterion you pick, the genuine farm-wide top rows are shown, and the choice is remembered. Columns carry tools/errors and **Ctx now** — the approximate context in the model window after the session's last reply, the instant answer to "which session is close to compact time?" (— means the transcript didn't record it). A green **●** marks sessions active right now; **every row carries a ⌨ button** (2.58.0) that jumps to that session's terminal — a window can be open while the session idles, and if none is found the command says so honestly. The **▸** on a row unfolds that session's **turn list** — each turn's title with its per-turn tokens and cost, parsed on demand from the transcript. Session rows are tinted and accent-edged so an expanded row's turns read as nested content. The Turns controls work like the viewer accordion: **Expand all / Collapse all / Single-open** (one session's turns open at a time, remembered). Clicking the row itself opens the transcript; **clicking a turn row opens it right at that turn** (2.51.0) — and if the viewer is already open, that tab is revealed and scrolled there instead of a second one opening.
- A **Live Timeline** button in the top row (2.22.0): between Refresh and Guide — one click from the board to the swim-lane view.

The Dashboard updates itself automatically as session logs change.

### Agent Detail Page

The command screen for a single agent:

- The top button row has **Dashboard** and **Live Timeline** (2.43.0) — one-click travel between the three main surfaces.
- Total cost, average per session, tool-call and error counts.
- Cost chart and model distribution for the last 30 days.
- **Fixed context load**: the budget bar for the fixed context loaded automatically every session (`CLAUDE.md` + `MEMORY.md` + `AGENTS.md`). See the Health section below for detail.
- **Top tools**: the tools this agent uses most — an X-ray of what the agent actually does.
- **Health & optimization**: findings specific to this agent; clicking a row opens the relevant file.
- **Task health** card: a 30-day scorecard of the jobs delegated to this agent — see [Task Health](#gorev-sagligi) for detail.
- **Memory files**: a memory table with size, token and freshness info.
- **Sessions (the Dashboard's advanced table since 2.57.0)**: this agent's sessions in **the exact same component** as the Dashboard's Sessions table — Sort by (Recent · Cost · Tokens · **Ctx now** · Duration · Turns, remembered per page), the **▸ turn accordion** with per-turn tokens/cost and click-to-jump into the transcript at that turn, **Expand all / Collapse all / Single-open**, a green ● on active rows + **⌨ jump-to-terminal on every row** (2.58.0), and duration/turn/tool/error/token/**Ctx now**/cost columns. Shows the agent's top 50 per criterion instead of the Dashboard's 12.

### Session Viewer

Turns a session's raw JSONL log into a readable conversation:

- Messages are color-coded: blue = user, green = assistant, yellow = tool call, purple = tool result. Failed tool results have a red border and come expanded.
- Every assistant message shows model, tokens and cost. Even the tokens of assistant steps that only make a tool call (no text) aren't lost — they show up on the first tool-call row (2.6.0).
- **Turn bands (2.6.0, made prominent in 2.8.0):** every user command opens a new turn. A turn start is no longer a thin line but a **full-width colored band**: an accent-colored left edge, a bold `Turn 3/12`, the first sentence of the command, and that turn's tokens/cost. The band is **sticky** — while scrolling fast, the band for the turn you're in stays pinned at the top, so turn transitions aren't missed. The **checkbox** in the band selects whether that turn is included in the MD export; the **↑ ↓ arrows** (2.9.0) jump to the previous/next turn without scrolling — since the band is sticky the arrows are always within reach (the ↑ arrow's "doesn't scroll at all" bug was fixed in 2.11.0).
- **Turn accordion (2.48.0):** the turn bands double as fold headers — **a single click on a band** folds that turn down to its band (a ▸/▾ caret shows the state; a folded band also shows its message count) and a second click reopens it. The `Turns:` row above the message list has **Expand all / Collapse all** — collapse all turns the whole session into a clickable list of highlighted bands, then you open only the turns you care about. **Single-open** switches the accordion to one-turn-at-a-time: expanding a turn automatically folds the previously open one (the mode is remembered). Everything that jumps to a turn — the breakdown table, the ↑ ↓ arrows, timeline/search/feed click-through — auto-unfolds its target. Folding is display-only: filters, replay and Export MD ignore it.
- **⬇ Export MD (2.8.0):** exports exactly what you currently see to a Markdown file — **whatever you see**: the Show chips (e.g. only Dialog or only Tool calls), the text filter and the replay position are applied exactly; turns excluded from the selection stay out. The top of the file has the session id, duration, totals and a summary of the applied filters. The save dialog opens in **the last folder you saved to** (2.9.0; on first use, the session's own folder); the suggested filename carries a **date + time stamp** (`session-abcd1234-2026-07-10_143522.md`, 2.11.0) — exporting the same session back to back won't collide. After saving, the file opens in the editor.
- **Export selection (2.9.0):** turn selection is done from two places, **in sync** — the checkbox in the turn's band and the `md` column in the Turn breakdown table show the same selection, and changing one updates the other instantly. The **All / None / Invert** buttons in the table make bulk selections; the **only** button on a row selects "just this turn" in one move. The header row and the Export MD button show a `12/37 in export` counter when there's a selection.
- **Turn breakdown table (2.7.0):** the expandable box just below the KPI cards lists all turns in **one table**: turn number, first sentence of the command, tokens, cost. Click a row → jump to that turn's marker (during replay, it moves playback to that turn). Turn totals now match the session total exactly — the tokens of thinking steps are also attributed to their turn.
- **Show filter (2.7.0; Dialog is the default since 2.52.0):** the chip row above the message list filters by type: **All · Dialog · User · Assistant · Tool calls · Results · Errors**. "Dialog" leaves only you + assistant conversation (tool traffic is hidden) and is what a viewer now opens with — one click on **All** brings everything back. Chips are multi-selectable. The filter **also affects replay** — with Dialog selected, only dialogue flows during replay. A deep link (timeline/search/feed/turn row) pointing at something the filter hides **clears the filter** rather than missing the target.
- **Per-turn model (2.52.0):** each turn band, the breakdown table and the Markdown export show the model that served that turn — the model changes mid-session in roughly one of four sessions, so this is per turn, not per session. Model ids are read **verbatim from the transcript**: a newly released model needs no update here (only a pricing rule). The same mechanism would surface an effort/reasoning label the moment Claude Code starts recording one — today it records none, so none is shown.
- **⏵ Resume (2.7.0):** the top-right button resumes this session in the terminal with `claude --resume`.
- **⌨ Terminal (2.55.0, session-exact since 2.56.0):** jumps focus to **this session's own** terminal — the same button sits on active Dashboard session rows and Timeline live-session cards. Each launch registers its terminal and the live monitor binds the session id to it, so two concurrent sessions of one agent each focus their own window. Session terminals are titled `claude: <agent> #n` (unique per launch); external Windows Terminal windows open as their own window and are found by that pinned title. If nothing is known about the session (started before 2.55.0, or outside Agent Farm), it falls back to the agent's most recent terminal — and says so honestly when even that fails.
- **Context now card (2.6.0, model-aware in 2.11.0):** the last request's context size (prompt + cache + output) and its percentage within **the session model's context window**. The ceiling is no longer a fixed 200K, it's found from the model: Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 and older generations → 200K. It turns yellow at 70% and suggests `/compact` or `/clear`, red at 90%. **If the model isn't in the table** no percentage or color is shown — only the raw context size (no ceiling is made up). You can force a fixed ceiling with the `agentFarm.contextWindowTokens` setting (0 = automatic). While the session is running, the card refreshes **live** each time the log changes — the instant answer to "is the context full, is it compact time?"
- The search box at the top filters messages and tool names; when it has content, an **✕** appears on its right to clear the filter in one click (2.37.0).
- **Open raw JSONL** opens the raw log in the editor.
- **⌂ \<agent\> (2.60.0):** the button right next to it names the session's **owner agent** and opens that agent's page in one click — no more "whose session was this again?" detours through the Dashboard. Sessions that live outside the agent roots have no owner, so they show no button.
- For very long sessions the last N messages are shown (`agentFarm.maxTranscriptMessages`, default 1500).
- **▶ Replay** plays the session step by step — see [Session Replay](#session-replay) for detail.

### Insights Tree

All of the fleet's health findings in one list: ⛔ error, ⚠ warning, ℹ info. Clicking a finding opens the relevant file. Findings are produced from the Health rules below.

### Live Feed

A live stream of the fleet's most recent events: user commands (prompts), tool calls and errors, together with the agent name. It refreshes itself as session logs change. Clicking an event opens its session and scrolls the viewer **exactly to that event's message** (2.42.0 — the same mechanism as timeline and search).

### Status Bar

`🤖 N active • $X today` — the active agent count and today's total cost. Hover to also see the 5-hour window summary. Updates every 30 seconds and on every data change.

**Token lap counter (2.6.0):** like the lap button on a stopwatch or the daily trip meter in a car — the main counters (today / 5-hour window) are derived from transcripts and can't be reset, but you can start **your own resettable counter**:

- **Agent Farm: Reset Token Lap** — starts counting the whole fleet's tokens/cost/messages from that moment; it shows as `⏱ 84.2K` in the status bar, with details and reset/clear links in the tooltip.
- **Reset Token Lap** again for a new lap; **Clear Token Lap** to remove the counter.
- Limit: the lap is fed from the last 48 hours of messages — a lap older than 48 hours only counts the last 48 hours (the tooltip warns you).

## Terminal Rendering Health {#terminal-rendering-health}

VS Code's terminal isn't a real terminal — it's the **xterm.js** emulator running inside Chromium (shell → PTY → xterm.js → Electron → GPU). Because of the number of layers, long TUI sessions (like claude) can show rendering glitches: ghost gaps that look present as you type, lines that vanish/garble, an image that fixes itself when you scroll. There are two remedies, both in one command: **Agent Farm: Terminal Rendering Fix…**

- **Apply render fix (recommended):** `terminal.integrated.gpuAcceleration: off` + `smoothScrolling: off` — a DOM renderer instead of GPU/WebGL. This resolves most ghost-gap/line-loss reports. It applies to newly opened terminals.
- **Claude sessions in external terminal:** toggles the `agentFarm.externalTerminal` setting. When on, **Start Session / Continue Latest / Resume** sessions open in the **OS terminal** instead of the VS Code terminal (Windows Terminal if present, otherwise a plain cmd window) — xterm.js fully out of the loop, native rendering. Farm tasks deliberately stay in the integrated terminal: their lifecycle is tracked from the terminal-close event.
- **Disable persistent sessions:** terminals restored after a reload are also a frequent source of a garbled image; this option turns restoration off (the cost: terminals are lost on reload).
- **Restore VS Code defaults:** returns all three settings to default. The command shows the current state when it opens (`gpu off · smoothScrolling off · …`).

## Live Observation {#live-observation}

The real-time monitoring layer introduced with Phase 2. Session logs hit disk with a few seconds' lag; live observation, on the other hand, captures events instantly via **Claude Code hooks**: the moment a command is entered, the moment a tool runs, the moment permission is awaited.

### How It Works

1. The extension opens a small listener reachable only from this machine: `127.0.0.1:8377` (configurable).
2. A one-line `curl` command for 9 events is added to Claude Code's hook system; each event is POSTed to the listener as JSON.
3. From the events, the extension runs a **state machine** per session:

| State | Meaning |
| --- | --- |
| WORKING | A command was received, the model is thinking |
| TOOL | A tool is running right now (its name is shown) |
| PERMISSION? | **Waiting for permission approval** — stopped until you approve |
| YOUR TURN | Finished its turn, waiting for your input |
| STALLED | It was working but no event for a long time — it may be stuck |
| IDLE / ENDED | Idle / the session was closed |

No data leaves the machine; the listener is bound only to localhost.

### Setup: Install Live Hooks

1. Run **Agent Farm: Install Live Hooks** from the command palette.
2. Choose the target: **User settings** (recommended — covers all sessions, single file: `~/.claude/settings.json`) or per-agent `.claude/settings.local.json`.
3. Confirm. The extension **does not touch** your existing settings: it adds its own entries alongside, takes an `.agentfarm-bak` backup on the first write, and preserves the hooks you placed by hand.
4. **Important:** Hooks are read when a session starts — no events arrive until you restart your already-open claude sessions.

To remove: **Agent Farm: Remove Live Hooks** — deletes only Agent Farm's own entries, leaving yours untouched.

### Timeline

Opens with the **Agent Farm: Open Live Timeline** command or the pulse icon in the Live Feed view.

- **Swim lanes:** Each agent is a strip; green blocks show tool runs (with their duration), dots/diamonds show events: blue dot = command, red diamond = permission wait, purple diamond = compaction, orange dot = subagent done, line = turn end.
- **Concurrent sessions of the same agent (2.45.0):** If the same agent is open in more than one session at once, each concurrent session gets **its own row** (`dev #1`, `dev #2` …) — events no longer overlap. Sequential (non-overlapping) sessions still share a single row as before, so row count doesn't balloon. Session cards, notifications and the Needs You queue also use the same `#k` label; a `×2` badge appears next to the status in the agent tree.
- **Click → go to that exact moment (2.37.0):** Clicking any marker in a lane **or a green tool block** doesn't just open the Session Viewer — it scrolls the log to **the exact message of that event** and highlights the message briefly with a frame. If the viewer is already open, the same click brings it forward and moves it to that point.
- **Your-turn notifications (2.22.0):** the four boxes to the left of each lane — **♪ sound · ◎ focus · ▣ modal · ▭ toast** — pick the actions to run when that agent moves to **YOUR TURN** (when a job finishes and it starts waiting for your input). Independent per agent; click a box, select/deselect. The selection is written to `globalState` and the triggering is host-side — **it works even when the panel is closed**. *Sound:* a short beep (a PowerShell beep on Windows). *Focus:* brings the timeline panel forward (VS Code has no API that guarantees bringing the OS window forward; modal is the strongest attention-grabber). *Modal:* a blocking "Your turn: <agent>" dialog + Open transcript. *Toast:* a non-modal corner notification. One notification per turn (a 3-second per-session suppression). This is separate from the global `notifyTurnEnd` setting — that fires a single toast for all agents; this is per-agent selectable and rich in actions.
- **Per-session alert override (2.45.0):** the lane boxes are the agent's **default** and cover all its sessions; if you want to configure one specific session differently, click the chips on that session's **Live sessions card** — the change applies only to that session (the card shows "session override — reset"; reset returns to the default). Turning off all chips silences that session, while the agent default keeps running on its other sessions. Overrides are stored by session id and cleared automatically when the session closes.
- A red vertical line = now. Window selector (widened in 2.43.0): **15m / 1h / 4h / 8h / 16h / 24h** detailed swim-lane view + **3d / 7d / 30d** density view. 16h and 24h are now drawn as the classic flow (lanes) too — since the monitor keeps 24 hours in memory, dropping to bars is only needed at 3 days and beyond.
- A **Dashboard** button at the top-right (2.43.0): one-click travel in the Dashboard ↔ Agent Detail ↔ Timeline triangle (the Dashboard has Live Timeline, the Agent Detail has both).
- **Density view (24h+):** at that scale individual dots aren't readable — each lane is split into 168 time buckets, and an activity bar is drawn per bucket (green = tools, blue = commands, √ scale); the red band above the strip = a permission wait occurred in that bucket. The point is to see patterns: which agent worked which day/hour, where it got stuck.
- **Persistence (2.13.0):** events are now written to a `globalStorage/live-events.jsonl` file — closing and reopening VS Code doesn't reset the timeline. The last 24 hours are kept in memory (long ranges are read from disk), and the file keeps the last **31 days** (older ones are pruned automatically, 64MB size limit). It doesn't go back further than 31 days not because of load but because of meaning: at that scale hook events don't carry pattern information — for the long view, the Dashboard (up to 1 year) is the right tool.
- **Live sessions cards:** each session's live state, last command, counters and start time (2.45.0); a `#k` session label in the header if needed; the your-turn chips are configurable per session from the card; "Open transcript" jumps into the log.
- The panel updates itself as events arrive.
- Note: since events prior to 2.13.0 weren't written to disk, long ranges fill in over time after installation.

### Notifications

| Setting | Default | When |
| --- | --- | --- |
| `agentFarm.notifyPermission` | on | When an agent starts waiting for permission approval |
| `agentFarm.notifyStuck` | on | When no event arrives from a running session for `stuckThresholdSeconds` (240s) |
| `agentFarm.notifyTurnEnd` | off | Every time an agent finishes its turn (can be noisy) |

The **Open Timeline** button in the notification takes you straight to the swim-lane view. The status bar also turns yellow when there's a permission/stall: `🤖 2 active • $1.42 today • 🔔 1 waiting`.

### Security and Performance

- The listener is `127.0.0.1` only — unreachable from outside, no data goes to any external service.
- The hook command has the pattern `curl -m 3 ... || cd .`: if the listener is down it silently gives up in at most 3 seconds and **never blocks the agent** (the exit code is always 0).
- Each tool call adds ~2 tiny processes (curl); imperceptible in practice.
- If two VS Code windows are open, the first to open takes the listener; the other shows "port in use" in the Timeline title — this is fine, one listener is enough.

## Task Queue

The coordination layer introduced with Phase 3. From the **Tasks** view in the side panel you queue jobs for your agents; each task opens a terminal in the agent's folder and starts `claude` with your prompt.

### One-Click Example Setup (2.39.0)

Against the blank-page problem: **Agent Farm: Set Up Example Automation…** sets up one of three working examples as a real, editable definition — 📥 **Inbox duty** (pick a folder → watch trigger + triage task), 🌅 **Morning briefing** (pick an agent → daily 09:00 headless task), 🔗 **Two-agent chain** (A analyze → `{prev_text}` → B summarize workflow, run it right away if you like). What's set up isn't magic; it shows up in the Tasks view, is editable, is deletable. Besides the command palette, it's reachable from the Tasks view's empty welcome screen, the Farm Status card in the Dashboard, and the setup walkthrough. The "Agent Farm: Setup in Five Steps" walkthrough under VS Code's **Welcome → Walkthroughs** section walks the five steps from introducing an agent to your first automation in order.

### Adding and Running Tasks

1. In the Tasks view, **+** (Add Task): pick agent → title → prompt → pick mode.
2. Two modes:
   - **Interactive:** `claude "prompt"` — a session opens, the prompt goes as the first message, you can continue.
   - **Headless:** `claude -p "prompt"` — runs the task, prints the output to the terminal and exits. Ideal for automation.
3. Queued tasks wait in order; you start them with ▶ and reorder with ↑↓.
4. When a task terminal closes (or a headless command finishes) the task automatically becomes **done**. If shell integration is on, it's also marked **failed** based on the exit code. You can mark it complete by hand with ✓ any time.
5. If you turn on the `agentFarm.queueAutoAdvance` setting, when one task finishes the next task in that agent's queue starts by itself — chained running.

Task states: ○ queued → ⟳ running → ✓ done / ⛔ failed / ⊘ cancelled. Clicking a running task brings its terminal forward.

**Dedup protection (2.18.0):** if the exact same prompt for the same agent is already in the queue, Add Task warns you — preventing an accidental second add.

### Rerun and Priority {#rerun-and-priority}

On finished or waiting tasks, in one click (2.18.0):

- **Retry** (⟳ on finished tasks): requeues the task as a fresh copy (`(retry N)` title, incrementing attempt counter). **Retry with edited prompt…** does the same but first opens a box for you to fix the prompt. Works on all `done`/`failed`/`cancelled` tasks.
- **Resume workflow from this step** (⏵, on finished tasks belonging to a workflow step): restarts the chain from that step; the handoff is rebuilt from the previous step's output in the same run — continue where you left off without running from scratch.
- **Run Next** (⌃, on waiting tasks): moves the task to the front of the queue (raises its priority above the other waiting ones); when capacity opens up it starts first. It shows with a `⬆ next` label on the row.

**Priority and aging:** the queue is no longer pure insertion order — higher priority starts first, ties broken by the older task first. Every waiting task gains +1 priority every 30 minutes (aging), so even under a steady stream of high-priority work the old ones don't starve.

### Long-Job Resilience (Wave F)

Hourly renders and overnight runs survive a window close (2.33.0):

- **Media reattach:** the moment a fal/Replicate job enters the queue, its poll URLs are written to the task (persisted to disk). If the window closes mid-render, the next window **reattaches** to the job — polling resumes where it left off, assets download, gallery metadata is written and the chain continues from that step (a "reattached" note is added in the archive). Jobs whose deadline passed fall to the resume offer below. **Parallel-group exception (2.36.0):** if a reattached job is a branch of a parallel group it does NOT advance the chain — since the group's fan-in state died with the window, the run is paused and Resume is offered when the last branch completes (Resume re-runs the whole group; the notification says so explicitly).
- **Interrupted-run detection + resume offer:** workflow steps running while the window closes used to turn into zombie rows waiting forever, with the chain dying silently. Now they're honestly marked *cancelled* (they don't enter the success-rate analytics, an "Interrupted" note is added in the archive) and a single notification on startup offers **Resume**: each run continues from its earliest interrupted step, with the previous step's output rebuilt from disk (parallel groups re-fan-out from the group start — the fan-in state was in memory, an honest limit). If you decline, the Resume buttons on the task rows always remain; the offer is one-time.
- Ad-hoc media runs (with no persistent workflow) aren't offered a resume — if the reattach window passed, use **Re-run** from the gallery to regenerate.
- **Network-blip tolerance (2.35.0):** all media/webhook poll loops withstand transient errors (network error, 5xx, 429) with growing back-offs; permanent errors (4xx) fail immediately. **Submit is never retried** — the risk of double-queue/double-charge. Provider calls are fenced: an unexpected error no longer leaves the task "running" forever; the step falls honestly through the `onFail` path.

### Scheduled Tasks

With the calendar icon in the Tasks view (**Add Scheduled Task**) you set up recurring jobs:

- **Daily** — every day at the given time (e.g. an 08:30 morning plan)
- **Weekly** — a specific day and time of the week (e.g. Sunday 21:00 weekly report)
- **Once** — one-time, date+time

To change an installed schedule, right-click → **Edit Schedule…** (2.42.0): title, prompt, time and (for weekly) day are edited in place — it used to require delete + re-create.

A task whose time has come is automatically queued, started, and notified. One-time ones turn themselves off after running.

**Important limit:** This scheduler runs while VS Code is open — if it's closed, that run is skipped (if you open it during the day, that day's task is triggered late). For things that must run independently of VS Code, see the next section.

### Scheduling Outside VS Code (Windows) {#scheduling-outside-vscode}

You can move a scheduled task to the **Windows Task Scheduler**: right-click the schedule → **Export as Windows Scheduled Task…**

1. The extension generates a `.cmd` script that runs `claude -p "prompt"` in the agent folder and writes the output to a log file.
2. A ready `schtasks /Create ...` command is copied to the clipboard — paste it into a terminal and run it to complete registration.
3. Now the task runs even when VS Code (or even the session) is closed; outputs accumulate in the log file (reach it with "Open log folder").

Requirement: `claude` must be on PATH. To remove: `schtasks /Delete /TN "AgentFarm\<name>"`.

### Task Output Archive

Headless tasks (from 0.4.0) run not in a terminal but as a **background process**, and all output is archived automatically:

- Each headless task's output is written to a Markdown file with title/agent/start info; the exit code and duration are appended at the end.
- After the task finishes, open it with right-click → **Open Task Output** (you can also see partial output while it runs).
- If the exit code isn't 0, the task is automatically marked **failed** — a reliable automation signal.
- When the task is deleted or you say **Clear Finished Tasks**, the output files are cleaned up too.

### Task Templates

Templatize your frequently-used tasks: right-click a task → **Save as Template**. A template can be bound to an agent or be "any agent" (it asks when you run it). From the **Templates** section in the Tasks view, ▶ produces a new task in one click. Example templates: "Daily plan", "Weekly summary", "Memory maintenance".

### Concurrency and the Quota Guard

From 0.8.0 the queue is a real queue: the number of concurrently running tasks is limited (`maxConcurrentTasks` default 2, `maxConcurrentPerAgent` default 1). A start that hits the limit is **not cancelled** — it waits with a "deferred" badge and runs by itself when capacity opens up.

**Quota guard:** if `windowTokenLimit` is defined and `quotaGuardPercent` (e.g. 85) is set, when the 5-hour window reaches that fullness, automatic jobs are **deferred** — an overnight factory won't have eaten your morning quota. When the window loosens, the deferred ones start in order.

**Multi-window safety (2.38.0):** Only **one** VS Code window runs the task queue at a time. On startup, windows race for a lease file (`tasks.owner`); the window that takes the lease runs the pump/scheduler, the others become **read-only followers** — a lock-badged "Read-only — another window runs the queue" row shows at the top of the Tasks view, and the list mirrors the runner's records live. Changes made in a follower aren't saved (a warning appears; do task management in the runner window). When the runner window closes, the lease falls free within ~20 seconds and one of the followers **takes over by itself** (interrupted runs are detected at that moment and Resume is offered). Previously two windows could double-start the same scheduled task and overwrite each other's running rows as "cancelled" — this is structurally closed.

### Task Cost (2.40.0)

Every finished headless task is matched to the transcript that its `claude -p` run wrote via a **lifetime match**, and the transcript's priced token cost drops onto the task row as a badge (`done • $0.12 • 3m ago`); the day's total is also added to the daily digest. The honesty rule: if there's a second session in the same agent folder at the same time (ambiguity), the number is **not made up** — the task stays cost-less. No matching is done for terminal-mode tasks (the session continues after the task). The matched transcript sits in the task's tooltip; media steps' `mediaCost` is separate from this.

### Task History

Finished tasks aren't lost: when the list hits the ceiling or you say **Clear Finished Tasks**, the records move to monthly `task-history/YYYY-MM.jsonl` files (open with the `Open Task History` command). The output-archive folder is also cleaned of the oldest, unreferenced outputs once it exceeds the `outputsMaxMB` ceiling.

### Task Forecast {#task-forecast}

**Task Forecast** (the calendar icon in the Tasks view header, 2.21.0) — shows what will run, and when, over the coming days in a markdown document:

- **Scheduled runs:** each schedule's fire times over the next `forecastDays` (default 7) days, grouped by day; next to each run, that same job's **median duration and success rate over the last 30 days** (from Task Health data — empty if there's no history).
- **Currently running** and **queued waiting** tasks (with the defer reason on waiting ones).
- At the top, the total run count and estimated **agent-time** (the sum of known medians).

Note: The duration forecast is computed only from the median of successful runs (so a fast failure doesn't skew the duration). Since per-task dollar cost isn't tracked (token cost is in the session transcript, not bound to the task), the forecast predicts duration/success rather than dollars; media cost is separately in the Dashboard.

### Task Health {#gorev-sagligi}

How reliably do the jobs you delegate come back? (2.17.0) The history archive + live task list are combined and rendered onto three surfaces:

- **The "Task health" card on the Agent Detail page** — a 30-day scorecard: run count (✓/✗/cancelled), success percentage (green ≥80%, red <50%), median duration, retry and verify counts, source breakdown (manual/schedule/trigger/workflow), media cost, and the current queue state. If there are consecutive failures, a red warning row shows the last failed task by name.
- **The Tasks grid in the Capability Matrix** — see the [Capability Matrix](#yetenek-matrisi) section below.
- **Insights warnings** — if an agent's 30-day success rate drops below 50% (with at least 5 completed runs) and the recent runs of a task family are all FAILED, a warning drops in the `task` category: the chain is broken, look at the output before it keeps burning quota.

Repeated runs are grouped as a **task family**: the `(retry N)` suffix in the title, dates and numbers are normalized — "Duty round 2026-07-08" and "Duty round 2026-07-09" are the same family. Cancelled tasks don't count toward the success rate (it's a user decision, not an error).

## Triggers

The heart of automation (0.8.0): jobs don't start only by the clock, but by an **event**. The ⚡ **Triggers** section in the Tasks view.

### Trigger Types

- **Watch (folder/file):** fires when the watched path changes. The action bridge of the duty system: a duty "watches while the agent runs", but a trigger starts the task/chain the instant a change happens **even while the agent is closed**. Example: a file dropped into FAST_NOTE → 10s later the triage chain is running.
- **Hook (live event):** a live event fires it (Live Hooks must be installed): `stop` (agent finished its turn), `end` (session closed), `permission`, `compact`, `subagent`. Optional agent filter. Example: when the psychologist session ends, run the assistant's summary task.

### Action and Guards

When a trigger fires it does one of three things (the wizard asks "What should it do when it fires?"):

- **Run a task on an agent you pick** — in the next step **you pick the agent**, then you write the prompt (in the prompt, `{watch}` gives the watched path, `{payload}` the webhook body). This is the way to set up "when an event happens, give this agent this command".
- **Dispatch — route to the best agent automatically** — no fixed agent; on every fire, rules (`agentFarm.dispatchRules`) + a cheap-model classifier route the work to the most suitable agent. There is **deliberately** no agent-picking step.
- **Run a workflow** — runs a saved chain.

Storm guards are built in and **configured per-trigger from 2.8.0** — the wizard's last step asks "Default timing / Customize timing…":

- **Debounce** (default 10s on watch): back-to-back changes collapse into a single fire.
- **Cooldown** (default 60s): a quiet period after a fire.
- **Hourly cap** (default 6/hour, 0 = unlimited): exceeded ones are skipped with a warning.
- A trigger that watches its own output archive can't be set up / is disabled if it was (feedback-loop protection).

Management: the **Add Trigger** wizard; on the trigger row ▶ (fire by hand), toggle on/off, delete; right-click → **Edit Trigger** to change name, prompt, target agent, debounce, cooldown and hourly cap afterwards (2.8.0 — editing `farm-tasks.json` by hand is no longer needed). How many times it fired and the last fire time show on the row. If the watch path is lost, the row shows a red "PATH MISSING".

## Multi-Agent Workflows

Phase 4's most powerful tool: **Workflows** — chains where several agents run in sequence. Set up with `Agent Farm: New Multi-Agent Workflow…`: step by step you pick agent + title + prompt + mode.

Finishing the wizard (fixed in 2.8.0): after adding at least one step, `✓ Finish & save workflow` appears at the **top** of the agent list — select it, and the chain is saved and drops into the **Workflows** section of the Tasks view. If you press Esc your effort isn't wasted: it asks "Save / Discard". If you cancel in the middle of a step (in the title/prompt box) only **that step** is cancelled, and the wizard stays on the step picker. The "If this step fails: stop the workflow" option asked during step setup is not a command to finish the chain — it selects what happens if **that step fails** (see [Conditional Branching](#conditional-branching)).

- When a step becomes **done** the next step starts by itself (it can be a different agent). If a step **fails**, the chain stops and a notification drops.
- **Handoff mechanism:** if you write `{prev_output}` in a step's prompt, the path of the previous step's archived output file is placed there. The next agent starts by reading that file — a real handoff of information from agent to agent.
- Chain steps show numbered in the Tasks view in the form `Chain name 1/3: ...`.
- **Headless** is recommended for steps (output is archived and handed off); an interactive step continues the chain when its terminal closes.

Example: "Morning routine" = 1. psychologist (headless): "analyze yesterday's journal" → 2. assistant (headless): "using this analysis, produce a day plan: {prev_output}".

### Conditional Branching {#conditional-branching}

With 0.5.0 chains stopped being straight lines — every step has two branching tools (the wizard asks during setup):

- **Conditional run (runIf):** if you give a step a regex, the step runs only if **the previous step's output** matches this pattern; if it doesn't, it's skipped and the chain continues from the next step (the output handoff isn't broken). Example: if the psychologist's analysis contains "ALARM", let the assistant make an urgent plan; if it doesn't, skip that step.
- **Failure routing (onFail):** you choose what happens if a step fails: **Stop** (default — the chain stops), **Continue** (move to the next step) or **Jump to step N** (jump to a specific step — e.g. a cleanup/compensation step).

Safety: against infinite loops that `onFail` jumps could create, each run is limited to **25 step executions**; a chain that hits the limit stops with a warning.

Example smart chain: 1. psychologist: "scan the journal" → 2. assistant (runIf: `ALARM`): "urgent intervention plan: {prev_output}" → 3. general (always): "archive the day" (onFail: Continue).

### Verify Steps

The key to trusting an overnight job (0.8.0): if you give a headless step a **verification criterion**, when the step finishes a cheap "judge" call (haiku — the `judgeArgs` setting) evaluates the output PASS/FAIL against the criterion:

- **PASS** → the chain proceeds normally; the verdict is written to the end of the output archive (`Verify (attempt 1): PASS — …`).
- **FAIL** → the step is **retried** with the judge's rationale appended to the prompt (`retries`, default 1). If the retries run out, the step counts as failed and falls to the onFail path.

A `verify pass/fail` badge shows on the task row. Since judge calls also drop into the agent's session logs, their costs are reflected in the scorecard automatically.

### Structured Handoff (JSON)

Alongside `{prev_output}` (file path) and `{prev_text}` (output text), there is now **field-level handoff** (0.8.0):

1. Make the step's **output contract** JSON → the step runs with `--output-format json`.
2. Write a prompt that asks the model for JSON (the parser is tolerant whether it's fenced or embedded in prose).
3. In the next step, `{prev_json.field}` (nested: `{prev_json.a.b}`) is replaced with the real value.
4. In conditions, the `json:field~regex` syntax: `runIf: json:status~ALARM` — branch on a field rather than tripping on text coincidences.

### Parallel Steps (Fan-out / Fan-in) {#parallel-steps}

Run independent jobs at the same time, then merge the results (2.20.0). You mark a step **parallel** (the "Parallel" option in the wizard or Edit Step → Parallel); **consecutive parallel steps form a group**.

- **Fan-out:** when the chain reaches the group, ALL of the group's steps start at once with the same handoff. (Real concurrency is as much as the `maxConcurrentTasks`/`maxConcurrentPerAgent` settings allow; otherwise they finish sequentially but still as a group.)
- **Fan-in:** when all branches of the group finish, their outputs **merge into a single handoff** and move to the step after the group. `{prev_text}` = each branch's output labeled with its title; `{prev_json.branches}` = a `[{step, text, json}]` array. (The merged handoff has no single file — `{prev_output}` is empty at fan-in.)
- **Branch condition:** each branch can have its own `runIf`; a branch that doesn't match is silently skipped (it doesn't drop the group).
- **Group error:** if even one branch fails, the group's **first step's onFail** is applied (stop/continue/jump).
- Group members are marked with ∥ (a purple git-merge icon) in the Tasks tree.
- **Warning:** if VS Code closes while a group is running (the in-flight run state is held in memory) the fan-in doesn't complete — this is the same as the current workflow-run behavior. Approval/webhook/media/browser steps can also be part of a group; the only exception is that a human-approval step doesn't pass the handoff through inside a group (it adds its own APPROVED note).

### Approval Step (Human Gate) {#approval-step}

You place an **Approval gate** in the chain (2.19.0): when the chain reaches that step, it STOPS and waits for your approval — no agent, no model call. The **$(check) Approval gate** option in the New Workflow wizard; it asks for an optional message (`{prev_text}`/`{prev_json.x}` resolved).

- The approval request appears both as a notification and in the **Needs You** panel (the same request, first answer wins) — Approve/Reject.
- **Approve:** the previous step's output (handoff) passes to the next step as is — the approval note doesn't get inserted.
- **Reject:** the step's **onFail** policy is applied (default: stop the chain; you can make it continue/jump with Edit Step).
- The approval step is a visible row in the Tasks tree (`approval`), and an APPROVED/REJECTED stamp drops into the output archive.
- **Warning:** the approval gate only works while VS Code is open; in the headless service (while you're away) the gate is auto-approved so the chain doesn't hang.

### Visual Selection Step (Wave B)

The heart of production: **pick 2 of 8 candidate images and continue only with those.** You place a **$(checklist) Select assets (visual pick)** step in the chain (2.24.0): when it's reached, all assets the run has produced so far open in a **gallery-picker** panel; you pick how many to keep (min, or min-max).

- The wizard asks: title, picker message (`{prev_text}`/`{prev_json.x}` resolved), how many to keep (`2` or `1-3` or blank = at least 1).
- In the panel you click and select candidates; **Use selected** is disabled until min is met, and beyond max extra ones are blocked.
- **The selected ones' URLs become the handoff:** the next step works with only the selected ones via `{prev_json.selected.0}` (a single URL) or `{prev_text}` (all selected URLs, line by line). The critical subtlety: not the local file path but the **remote URL** the model produced flows — so the next fal.ai step (image→video) consumes it directly.
- The unselected are marked `✗ dropped` in the gallery, the selected `✓ kept`.
- **Cancel:** the step's **onFail** policy is applied. A visible `select` row in the Tasks tree; in headless (no UI) all are kept so the chain doesn't hang.

Typical chain: *agent writes prompt → media (produce 4 candidates) → **visual selection (keep 2)** → media (image→video, `{prev_json.selected.0}`)*.

### Editing Workflows

You don't need to delete and rebuild an installed chain (0.7.0):

- **On a workflow:** ▶ run, **+** add step, trash to delete; right-click → **Rename Workflow**.
- **On a step:** pencil icon → **Edit Step…** asks which field to change (title / prompt / agent / mode / on-fail / run-if); reorder with ↑↓; right-click → delete the step.
- Changes are persistent and take effect on the next run; they don't affect a run in progress.

### Visualizing Chains

The Live Timeline now has a **Workflow runs** section: every chain run in the last 4 hours in its own strip, with steps as numbered blocks — green = done, blue = running, red = failed. Hover over a block: step name, agent and duration. You literally watch one agent hand work off to another.

## Missions {#missions}

Workflows are pre-drawn: every step, branch and jump is fixed before the run starts. A **Mission** (2.62.0) is the opposite — you give a **goal**, a **lead agent** and a **team**, and the next step is decided **at run time**, round by round, from the previous results. "An orchestrator analyzes, the coder implements, the reviewer reviews, the tester runs the tests, and the lead merges it all" — without drawing that as a DAG first. A failed delegation doesn't kill the mission; it's information the lead re-plans on.

**How it runs.** `Agent Farm: Missions` (the **Missions** button in every page's top toolbar, or the **Missions** section in the sidebar — 2.63.0) → **+ New Mission**. The extension then drives a planner loop:

1. The **lead agent** is called headlessly with a briefing: the goal, the team roster (names + your role labels + one identity line from each agent's own CLAUDE.md), the remaining budget, and a strict JSON decision schema.
2. The lead answers with one decision per round: **delegate** (tasks aimed at team agents, each with a self-contained prompt and success criteria), **ask_user** (a question for you), or **finish/abort** (verdict + summary).
3. Delegations run as **ordinary headless tasks** — they appear in the Tasks view, outputs are archived, costs are metered, quota/concurrency guards apply. Nothing is reinvented.
4. Results (status, cost, an excerpt of each output, the full archive's path) are fed back into the **same planner session** (`claude -p --resume`) — the lead keeps its context and prompt cache across rounds. If a resume ever dies, a compact extension-side ledger reseeds a fresh session.
5. Repeat, until the lead finishes — or a limit forces it to.

**Hard limits — never the model's goodwill.** Every mission carries a budget: max cost, rounds, tasks, minutes (time spent waiting on you doesn't count) and parallel delegations. When one is spent the planner gets a **finish-only round**: delegating is refused, it must wrap up with an honest verdict (`success / partial / failed`). Sending the same work to the same agent twice is blocked (planning-loop guard), and an absolute planner-call cap backstops everything.

**Approval modes.** Default **each round**: the round's delegations land in **Needs You** (and a toast) with Approve/Reject — a rejection is fed back and the lead re-plans. **auto** runs without gates; the hard limits still apply. `ask_user` questions also land in Needs You (Answer…) and in the panel; the wall clock pauses until you answer.

**Workdir safety.** Give the mission a workdir and every delegation runs inside it — and **two writers never run in parallel**: steps the planner marks `readonly` (research, review) may share a wave, writers are serialized.

**The planner plans — it does not work (2.64.0).** The lead's planning call is a *decision*, not a work session, and that is enforced mechanically, not by trust: write-tools (Edit/Write/Bash/…) are disabled on planner calls, a hard turn cap stops a lead that wanders off exploring (one "decide NOW" nudge is retried in the same session before the round fails), and a timed-out call is genuinely killed — process tree and all — instead of billing on in the background. The briefing says the same thing in words: *scale your effort to the goal; a small goal is one short round.* Deep digging is delegated as a `readonly` task, where it's tracked and budgeted like everything else.

**Who runs on which model (2.64.0).** Three layers, most specific wins: the **Planner model** field pins the lead's planning calls; each team member's **model** field pins that member's delegations; anything left empty falls to your global **model-policy rules** (Farm Settings) and finally the agent's own default. So "smart model plans, cheap models execute" is one form away — and the chosen models are visible on the run's team chips and in each task's output header.

**You can see it breathe.** While a run is active the page shows a live **now strip** — *lead is planning round 2 · 1m 40s*, *round 2: running coder + reviewer (wave 1/2)* — fed by the same state events the engine writes anyway (zero extra load on the run). The sidebar run row carries the same line.

**Pause with honest feedback.** Pause never interrupts mid-activity — the current planner call or wave finishes first. Since 2.64.0 the request itself is visible: the button flips to a pressed **Pausing… (undo)** state and a hold strip explains what happens; clicking again withdraws the request. Once parked, **Resume** feeds the collected results back into the lead's own session.

**Interruptions and failures.** A window reload parks running missions as *paused*; Needs You offers **Resume** — delegation states are re-collected from the task records and the lead continues in its own session. Cancel any time; cancelling also cancels the running delegations. A run that **fails** never fails silently: the reason (timeout, invalid planner replies, budget stop…) is in the closing notification, in a red banner on the run's page, and in the run's tooltip in the sidebar.

**What makes a good lead:** an agent whose CLAUDE.md says it plans and delegates instead of doing the work itself — e.g. *"You lead multi-agent missions: decompose the goal, delegate with self-contained prompts and acceptance criteria, judge results skeptically, and prefer finishing with a partial result over burning the budget."* The role labels you type next to team members ("coder", "reviewer", "tester", "researcher", "git") reach the lead as hints.

The panel shows each run round by round — the lead's reasoning, the delegation table (status / cost / output links), question-and-answers, the budget bar, and the final verdict. The closing summary also goes out as a notification and the `mission` webhook event.

**The Missions section in the sidebar (2.63.0)** is the tree twin of the same tracking — between Tasks and Recent Sessions. Each run is listed with its status/verdict icon, round count (`R3/8`), spent dollars and age; expand it for the rounds and each round's delegations (status, cost — click one to open its archived output). A round awaiting approval and the lead's question surface as **actionable rows** at the top: Approve/Reject and Answer right on the row. Row actions: Pause / Resume / Cancel, **Run again** (a fresh run of the same goal-team-limits, confirmed first) and **Delete run**. Clicking a run opens the full Missions page.

## MCP Management {#mcp-yonetimi}

Your agents' tool gateways to the outside world — MCP servers — now show up in the panel (0.9.0). Each agent's **MCP** section in the Agents tree:

- Servers are read from the same files Claude Code reads (`.mcp.json`, `.claude/settings*.json`); name, transport type (stdio/http/sse) and definition source are shown.
- **Status at a glance (2.13.0):** the section header shows an `N server(s) • M used (30d) • K disabled` summary. The server row shows the last-use time (`last 3h`); the tooltip shows a **breakdown of the most-called tools** (`vault_read ×394, search_query ×88…`) — you can tell at a glance which MCP tool actually does work.
- **Real usage:** each server's real tool-call count over the last 30 days shows on the row (counting `mcp__server__tool` from session logs). A green plug = in use.
- **Add/Remove:** the **+** in the section → a wizard writes to the agent's `.mcp.json`; a trash icon on a server → deletes it from its source (with a one-time `.afbak` backup).
- **Management (2.13.0, right-click):**
  - **Edit MCP Server…** — edits the command/URL in place (backed up).
  - **Disable / Enable MCP Server** — adds/removes the server to the agent's `disabledMcpjsonServers` list in `.claude/settings.local.json` (the same key Claude Code honors). To turn off temporarily without deleting; a disabled server shows greyed with ⊘ in the tree.
  - **Copy MCP Server to Agent…** — copies the definition to another agent's `.mcp.json` (spread a single definition fleet-wide).
- The change takes effect on the agent's next session.
- **Insights audit:** a defined server that has gone 30 days without any use produces an info finding — every server adds load at session startup, clean out the dead ones.

## Skill Management {#skill-yonetimi}

Your agents' taught abilities — Agent Skills (SKILL.md folders) — show up in the panel (2.12.0). Each agent's **Skills** section in the Agents tree:

- Skills are read from the same folders Claude Code reads: `.claude/skills/` in the agent folder (**agent** scope) + `~/.claude/skills/` (**user** scope — shared by all agents). For a skill with the same name, agent scope shadows user scope. The row shows the name, scope and the description from the SKILL.md frontmatter (tooltip); clicking opens the SKILL.md.
- **Status at a glance (2.13.0):** the section header shows an `N skill(s) • M used (30d)` summary; the skill row shows the last-use time (`last 2d`).
- **Real usage:** the call count over the last 30 days shows on the row — both the model's calls via the `Skill` tool and the `/skill-name` commands you typed are counted from session logs. A green spark = in use.
- **Add/Remove:** the **+** in the section → asks for a name + one-line description, scaffolds and opens the agent's `.claude/skills/<name>/SKILL.md` (you write the instructions); a trash icon on the skill row → deletes the folder (a one-time backup goes under `.claude/skills.afbak/`). When deleting a user-scope skill, the modal explicitly says all agents will lose it.
- **Management (2.13.0, right-click):**
  - **Copy Skill to Agent…** — copies the skill folder (with its helper files) to another agent.
  - **Move Skill Between Agent/User Scope…** — moves an agent-scope skill to `~/.claude/skills` (share with all agents) or pulls a user-scope one down into this agent's folder (customize). Approved, single move.
  - **Reveal Skill Folder** — opens the SKILL.md folder in the system file manager.
- The change takes effect on the agent's next session.
- **Insights audit (2.13.0):** a warning for a SKILL.md with no description (claude loads a skill by looking at its description — with no description it rarely fires) + an info finding for an agent-scope skill unused for 30 days.
- Note: plugin skills that come with an extension install live outside these folders and don't appear in the list — the panel focuses on the file-based skills you manage.

## Capability Matrix {#yetenek-matrisi}

**Agent Farm: Open Capability Matrix** (the table icon in the Agents tree header) — shows all of the fleet's skill and MCP capabilities in a single grid (2.13.0). The point: which agent has which capability, which is actually used, which is dead weight — all at a glance.

- **Two matrices:** *Skills × Agents* and *MCP servers × Agents*. Row = capability, column = agent.
- **Cells:** a filled green badge + number = used in the last 30 days (color intensity = call frequency); a faint ✓ = installed but unused; ⏻ = disabled on that agent; **＋** = not installed — clicking **copies** the capability from another agent **to that agent** (approved).
- **Summary chips:** total / used (30d) / unused count per matrix. A row no agent used in 30 days is marked with a yellow ● — capabilities that could be cleaned up fleet-wide.
- Clicking a row name or a filled cell opens the relevant SKILL.md / config file. The matrix refreshes itself after any copy/edit.
- **Memory files matrix (2.16.0):** which agents have same-named memory files, with the 30-day recall count in the cell; **a cell with an orange ring = the copy has DIVERGED from the newest one** (different content — updated in one, old in another). Copy the file to that agent with ＋ (with an index row into the target MEMORY.md). Multi-agent rows are on top — sync/divergence matters most there.
- **Duties matrix (2.16.0):** duty titles × agents; the cell shows a cadence abbreviation (`turn/start/daily/weekly/manual`), ⏸ = paused; the tooltip shows watch/do; ＋ copies the duty to that agent (if the target's CLAUDE.md has no DUTIES.md reference, it's added with approval).
- **Tasks matrix (2.17.0):** task families × agents — the 30 busiest families of the last 30 days ([Task Health](#gorev-sagligi)). The cell shows the completed run count: green = all successful, red = all failed, orange ring = mixed (`2✓/1✗`); the row label says its source (`man/sch/trg/wf`), a family whose recent runs are all failed gets a red ●. Clicking a cell/row opens the full task history.

## Secret Vault {#sir-kasasi}

So API keys don't wander around config files in plaintext (0.9.0): the **Set Secret…** command puts the value into the **OS keychain** (VS Code SecretStorage). Vaulted secrets enter the work in two ways:

1. **As an environment variable:** automatically injected into every task/workflow process (if you saved it as `FAL_KEY`, the process sees a `FAL_KEY` env var).
2. **As a template variable:** in the URL/body of webhook steps and in the notification URL, the `{secret:FAL_KEY}` syntax is replaced with the real value at call time — the value is never written to any file.

`List Secrets` shows only names; values are never displayed. If the health engine sees plaintext that looks like a key (`sk-…` etc.) in config files, it warns you to move it to the vault.

### How to Add an API Key (step by step)

Example: connecting the fal.ai key —

1. Copy your key from the **Keys** section of your [fal.ai](https://fal.ai) account (its format is `xxxx:yyyy`).
2. In VS Code `Ctrl+Shift+P` → **Agent Farm: Set Secret…**
3. For the name, type **`FAL_KEY`** (media steps look for this name by default; if you want a different name, change the `agentFarm.mediaAuthSecret` setting).
4. Paste the key into the value prompt (it's hidden as you type) → Enter. Done — the key is in the OS keychain.
5. Check: the **List Secrets** command lists the name (never the value). The key is used automatically when a media step runs.

The same method works for every service: `ELEVENLABS_KEY`, `N8N_TOKEN`… — whatever the name, it enters tasks as an env var and is accessible via the `{secret:NAME}` template. **Three golden rules:** never write a key to a file/prompt; if you pasted it into chat/screen, rotate it from the service panel; delete what you don't use with **Delete Secret…**.

## Media Production Pipeline

With 1.0 the extension changed category: text agents and **media models** (image/video/audio) run in the same chain — a Content Factory.

### Media Step (🎬)

When building a workflow, choose **Media step**: the step calls a production model. The model id is free text and **its prefix determines which provider it goes to** (2.26.0 — the MediaProvider abstraction):

- **fal.ai (default):** with no prefix it goes to the fal.ai queue API — like `fal-ai/flux/schnell`. With this single-gateway strategy you reach hundreds of models in the Kling, Seedance, Veo, Flux, Nano Banana class. Key: **FAL_KEY**. All existing workflows run unchanged (no prefix added).
- **Replicate:** with the `replicate:` prefix it goes to the Replicate prediction API — `replicate:black-forest-labs/flux-schnell` (latest) or `replicate:owner/name:<version>` (pinned version). Key: **REPLICATE_API_TOKEN** (store it as a secret; setting `agentFarm.replicateAuthSecret`).

The provider difference is transparent to the step: download, asset archive, gallery, cost, selection and vision QA all work the same. New providers are added through a single interface (`submit/poll/assets`); fal behavior is preserved exactly.

- **The input template** is JSON and `{prev_text}` / `{prev_json.field}` are resolved: the prompt the agent wrote flows straight to the model.
- The produced **assets are downloaded and archived**; the response JSON becomes the next step's handoff (like `{prev_json.images.0.url}`).
- Long video jobs can take minutes — the step stays `running`, and the queue status is polled regularly (per-step timeout configurable).
- Prerequisite: the **FAL_KEY** secret (the steps above). If the key is missing, the step doesn't run and fails with a clear message; if credits run out, fal's error drops into the archive.
- **Visual quality check (vision QA — 2.25.0):** you give the media step an optional quality criterion (the wizard asks). As soon as production finishes, a **vision-capable model** (a cheap judge, default haiku) **opens the produced file with the Read tool**, inspects it, and returns PASS/FAIL + rationale against the criterion. On FAIL the step appends the rationale to the input's `prompt` field and **regenerates itself** (up to the configured retry count); if it still doesn't pass on the last attempt, onFail is applied. It's the visual equivalent of the text `verify` criterion — like "one person, clear face, no six fingers, matches the recipe". If the judge can't run (model/permission) it doesn't block the pipeline, it lets it through.

### Media Gallery

`Agent Farm: Open Media Gallery` (the camera icon in the Tasks header): all produced images/videos/audio — preview, model, input, estimated cost, which chain it came from. **Re-run** regenerates with the same parameters; **Vary…** lets you edit the input and generates; **Feedback… (2.40.0)** asks "what didn't you like?" and injects your critique into the prompt and regenerates (the manual version of the vision-QA retry). **Scene…** binds/unbinds the asset to a production scene. Click → the file opens.

### Production Scenes (Wave A)

For scene-by-scene productions (storyboard → image → video → editing), a **production manifest**: `production.json` in the agent's folder — a project title + scenes (each scene's status: `draft / generating / review / approved`). Editable by hand; also set up with the `Agent Farm: New Production` wizard (title + comma-separated scene list).

- In the gallery you filter assets with the **production / scene / source** filters at the top.
- The selected production's **scene status board**: row = scene, column = asset type (image/video/audio/other); click a cell → filter to that scene, click the status badge → change the status (written to `production.json`).
- In the media-step wizard (if there's a manifest) produced assets can be bound to a scene; also assigned later from the gallery with **Scene…**.

### External Asset Ingest (Ingest — Wave A)

Productions outside fal.ai (a clip downloaded by hand from Higgsfield/Flow, a Premiere export, a ComfyUI output) enter the system too:

- **Watched folders** (`agentFarm.ingestFolders`): scanned every 30s; new image/video/audio files are registered **in place** in the gallery (no copy — video is big). While a download is in progress it waits until the file stops growing; files older than 48 hours aren't scanned. A folder can be pre-assigned a project/scene.
- **Manual registration:** `Agent Farm: Register Media Asset(s)…` — pick file(s), bind to a scene if you like. External assets are marked with an `external:` badge in the gallery; Re-run/Vary don't apply to them (there's no source parameter).

### Media Cost and Budget

With the `agentFarm.mediaPricing` rules (USD per image / per second / per request) each job's estimated cost is computed and rendered into the gallery and the **Media cost** card in the Dashboard — text + media, all your AI spending on one scorecard. The default prices are placeholders: verify and set from fal.ai's pricing page. **Monthly budget alert:** `agentFarm.mediaBudgetMonthUSD` (0 = off) — warns once a month when the estimated media cost of the last 30 days exceeds the threshold (it also drops into the webhook forward).

### The Editing Bridge — Premiere Sequence (Wave D)

After producing and approving scenes one by one, you turn **"the clips in a folder" into a sequence that opens in Premiere**: `Agent Farm: Export Premiere Sequence` (or the **Export sequence →** button in the gallery when a production is selected).

- Following the **scene order** in the production manifest, one clip is laid out per scene's asset. If you made a selection, the **kept (selected) video** is preferred; otherwise video, otherwise image; rejected ones aren't taken; a scene with no asset is skipped.
- Two files are written: **FCP7 XML** (`.xml` — Premiere opens it with `File → Import`; the bin/clip structure carries the scene order) and **CMX3600 EDL** (`.edl`). The frame rate (24/25/30/60) and a default clip duration per scene are asked; durations are refined in editing.
- **Naming convention:** if a production is bound to the watched (ingest) folder, the scene marker in the filename (`…_s03_…` or `…_S3_…`) is automatically bound to that scene. So when you name a Premiere export like `P01_S03_T02.mp4` and drop it back, it lands on the right scene — the loop closes.
- **Export watch:** by adding the render/export folder to `agentFarm.ingestFolders` and binding it to a watch trigger, you can set up an "export dropped → next step/task" automation (the existing trigger infrastructure).

### Recipes

`Agent Farm: New Recipe Workflow…` sets up ready-made factory templates: **Text → Image**, **Text → Image → Video**, **Audio → Text (Whisper)**. You edit the placeholders (TOPIC, URL) in the installed chain and run it — no blank-page problem.

## Browser Steps {#browser-steps}

The gateway to services with no API: add a **Browser step** to the chain — the step's agent, with its own browser MCP, visits the site, fulfills the objective, and hands its findings to the next step as `{prev_text}`.

**Prerequisite:** the agent must have a browser MCP server installed (Agents tree → MCP → **Add MCP Server…** → e.g. `npx chrome-devtools-mcp@latest` or Playwright MCP). Agent Farm doesn't carry a browser engine; it carries the security envelope:

- **Domain allowlist (non-negotiable):** if the step's `allowHosts` list or the global `agentFarm.browserAllowHosts` doesn't cover the URL, the step fails **without running at all** (your onFail rules apply). Subdomains are included.
- **Per-step approval:** `agentFarm.browserApproval` = `ask` (default) — a modal approval with URL+objective before each run; `auto` only by a deliberate choice.
- Hard rules are embedded in the agent prompt: don't open a link off the list, don't fabricate credentials, don't try without an MCP — report "NO BROWSER MCP".

Setup: `New Multi-Agent Workflow…` → **Browser step** → agent + URL + objective + allowed domains. `Edit Step…` changes the URL/objective/allowlist later; `{prev_text}`/`{prev_json.x}` are resolved in the URL and objective.

## Webhook Bridge

The universal gateway for the outside-world connection (0.9.0): n8n, Make, Zapier — anything that speaks webhooks.

### Outbound: Webhook Step

When building a workflow you can choose **🌐 Webhook step** instead of an agent: the step is an HTTP call, not claude.

- In the URL and JSON body templates, `{prev_text}`, `{prev_json.field}`, `{prev_output}` and `{secret:NAME}` are resolved.
- The response body is written to the archive and **becomes the next step's handoff** — you keep reading from the JSON n8n returned with `{prev_json.field}`. A non-2xx response makes the step fail (your onFail rules apply).
- Example chain: psychologist analysis → the webhook step POSTs the analysis to n8n (n8n forwards to Telegram) → n8n's response is used in the chain.
- **Auth header (2.27.0):** the wizard asks for an optional header (like `Authorization: Bearer {secret:MY_TOKEN}`; `{secret:}` resolved) — to connect to APIs that require identity.
- **Poll mode (2.27.0) — a general queue client:** when the wizard asks "Poll until done?" the webhook step turns into a queue client that does **submit → poll**. The first call starts the job; a poll URL is read from a JSON path in the response (`urlField`, e.g. `urls.get`/`status_url`/`name`); on each poll a status field (`statusField`, e.g. `status`) is evaluated against the given "done"/"fail" regexes; when the job finishes the final response becomes the handoff. So **any queued API without writing a provider** (long-running operation APIs like Gemini, self-hosted queues) enters the chain — the auth header is carried on poll requests too, and the timeout and interval are configurable.

### Inbound: the /trigger Endpoint

**Add Trigger → Webhook** produces a new secret URL: `http://127.0.0.1:<port>/trigger/<token>` (copied to the clipboard; re-copyable from the trigger row). Every POST to this address fires the trigger; the JSON body enters the task prompt as `{payload}`. On the n8n side a single HTTP Request node is enough: an invoice hits Gmail → n8n → an Agent Farm "process the invoice" task.

Security: the endpoint listens only on 127.0.0.1 + requires a token; a wrong token gets a 404; the cooldown/hourly-cap guards apply on the trigger. If you need access from an external network you deliberately set up your own tunnel (not needed if n8n is local).

### Notification Forwarding (Fleet in Your Pocket)

Set `agentFarm.notifyWebhookUrl` → the events you choose (permission waiting, stalled, budget exceeded, chain finished/failed — `notifyWebhookEvents`) are POSTed as JSON to that address: `{source:"agent-farm", type, message, ts}`. When you set up a webhook→Telegram flow in n8n, "psychologist waiting for permission" drops onto your phone while you're in the kitchen. `{secret:NAME}` can be used in the URL.

## Standing Duties {#nobet-gorevleri}

The system for the **continuity agreements** you make with agents: "check this file every turn, do what's needed if a reply came", "check this folder every day, triage if files have piled up" — stay-on-alert tasks. Over time these multiply and get muddled — which folder was it, what was the task, every turn or every day? This system gathers them all in one place.

### How It Works: One Source, Two Readers

Duties live in a **`DUTIES.md`** file in the agent's folder. This is a deliberate design decision:

- **The agent reads:** with a short directive in CLAUDE.md, the agent reads DUTIES.md at the start of every session and follows its rules. The template at the top of the file also contains cadence rules for the agent ([every-turn] = check every turn, etc.).
- **You and the panel read:** each agent's **Duties** section in the Agents tree is fed from this file — all duties, their cadences and **pending-work status** at a glance.
- **Flexibility:** You can also edit the file by hand; the panel preserves the lines you add. The format is simple: `## Title [cadence]` + `- **Watch:**` + `- **Do:**` lines.

### Adding a Duty

In the Agents tree, right-click the agent's **Duties** row → **Add Standing Duty** (or **Add duty** on the agent detail page):

1. **Title** — e.g. "Clarification requests"
2. **Cadence** — `every-turn` / `session-start` / `daily` / `weekly` / `manual`
3. **Watch** — the target to watch: pick a file, pick a folder, type a path by hand, or leave blank (a target-less duty is fine too: like "check my mood every turn")
4. **Do** — the work to do when a change is seen: "Do what's needed for answered questions and delete the question from the file"

When you add the first duty, if the agent's CLAUDE.md has no DUTIES.md reference, the extension notices and adds a short directive section **with your approval** — a duty without a reference is a duty the agent will never look at.

### At-a-Glance Tracking

This is where the panel's real power is — the Duties section isn't just a list, it's a **status display**:

- If files have piled up in the watched **folder**: an orange eye + `3 waiting` — there's work in the inbox. **The tooltip now shows the pending ones (2.14.0):** which files are waiting (the first 5 names) and how long the oldest has been sitting (`oldest 3d ago`) — you see "what has piled up" without going to the panel.
- If the watched **file** changed in the last 24 hours: an orange eye + `changed 2h ago` — you probably wrote a reply and the agent hasn't processed it yet.
- If the watched path is **lost**: a red warning + a finding in Insights — the folder was moved, the duty broke.
- **Paused** duties show faint and the agent skips them by the template rule.

Management: right-click a duty → **Edit Duty…** (2.14.0 — change title/cadence/watch/do/note fields in a wizard pre-filled with their current values; no need to open the file by hand), **Pause/Resume** (freeze without deleting), **Delete**, **Open DUTIES.md** (edit by hand), **Move Up / Move Down** (2.15.0 — changes the block order in DUTIES.md; the agent reads the file top to bottom, put the important duty on top). The agent detail page also has the full table: title, cadence, watch, do, status.

Three management depths introduced with 2.15.0:

- **Add Duty from Template…** (right-click the Duties section): proven duty patterns set up with a single selection — *Question-answer loop* (do what's needed for the answered ones in the watched file), *Inbox triage* (name/move what's piled up in a folder), *Weekly memory maintenance*, *Output-folder duty*. The template asks for the watch target; refine the rest with Edit Duty…
- **Automate Duty (create trigger)…** (right-click a duty): the bridge between duty and automation. A manual duty only works **while the agent runs**; this command produces a **watch trigger** from a duty whose watch target is a real file/folder — when the target changes, a headless task fires **even while the agent is idle** (debounce 10s, cooldown 60s, at most 6/hour; managed from the Tasks view). The duty stays in DUTIES.md; the two complement each other.
- **Copy Duty to Agent…** (right-click a duty): copies the duty to another agent (warns if the same title exists); if the target agent's CLAUDE.md doesn't reference DUTIES.md, it's added with approval.

**Is the agent actually looking? (0.7.0)** The Duties header now has a compliance indicator: `read 2h ago` = the agent last touched DUTIES.md at that time (detected from session logs); `never read` = never looked at it in recorded sessions. If the agent had a session this week but never read the file, a warning drops in Insights — the agreement stayed on paper; strengthen the CLAUDE.md directive.

### Examples

```
## Clarification requests [every-turn]
- **Watch:** `D:\zone\know\note\obsidian\CLARIFICATION REQUESTS.md`
- **Do:** If there's an answered question, do what's needed and delete the question from the file; if there are new questions to be clarified, add them to the file.

## Inbox triage [every-turn]
- **Watch:** `D:\zone\know\note\obsidian\01_INBOX\00_FAST_NOTE`
- **Do:** Treat every file inside as an inbox entry: give it a proper name, move it to the proper folder.

## Weekly memory maintenance [weekly]
- **Do:** Review the files under memory/; update or archive the ones that have gone stale.
```

**Tip:** Don't confuse the difference with a Task/Workflow — a standing duty is the check the agent does by itself **while inside a session**; the Tasks queue is jobs you (or the scheduler) start from outside. "Check every turn" only works while the agent runs; if the agent never opens, you need a daily Task to trigger a session — the two complement each other.

## Memory Management {#hafiza-yonetimi}

The agent's memory (`memory/*.md`) is no longer just listed — **whether it's actually used** is measured and managed from the panel (2.14.0). The **Memory** section in the Agents tree:

- **Status at a glance:** the section header shows `N files • ~X tok • M recalled (30d)` — how many files, their total weight, how many were actually recalled in the last 30 days.
- **Recall tracking:** each file row shows `recalled ×5 (30d), last 2h` or `not recalled (30d)`; a recalled file's icon is green. "Recall" = the agent **explicitly** opening the file with a tool (Read/Edit/Write) — counted from session logs. The MEMORY.md index is exempt from this metric since it's loaded passively every session (marked `index — loads every session`). The memory equivalent of the Skills/MCP "used/unused" logic: a file not recalled in 30 days is a candidate for dead weight that takes up space in the index.
- **Orphan flag:** a file with no reference in MEMORY.md shows `⚠ orphan` on the row — since the agent won't find it from the index, that memory is effectively lost.
- **Identity in the tooltip:** the file's frontmatter `type` (project/feedback/user/reference) and `description` show in the tooltip.
- **New Memory File…** (the **+** in the section): asks for name + type + one-line description; scaffolds a file with frontmatter and **automatically adds the pointer row to MEMORY.md** — a new memory is never born orphaned.
- **Archive Memory File** (the archive icon on a file row): instead of deleting, moves it to the `memory/archive/` folder (out of scan scope) and drops its row from MEMORY.md (the index is backed up). The safe way to take "maybe I'll need it" files out of context.
- **Copy Memory File to Agent…** (2.15.0, right-click): copies the file to another agent and automatically adds the pointer row to the target's MEMORY.md — the copy isn't born orphaned.
- **Scan Memory Contradictions…** (2.16.0, right-click the Memory section): a cheap model cross-reads the agent's memory files and lists **statements that contradict each other** (which two files, which two claims, a short assessment) — the result opens as a markdown report. A date/recency difference isn't counted as a contradiction; the model output passes JSON validation and a limit-message guard. **The findings are advisory: don't delete/merge without verifying.**
- **Frontmatter audit (2.16.0):** a memory file with no description drops an info finding in Insights — the index row and semantic search rely on the description.
- **Fix Memory Index…** (2.15.0, right-click the Memory section/MEMORY.md): repairs the index in one shot — adds pointer rows for orphan files (description from frontmatter), drops dead rows pointing to non-existent files. The suggested fixes are individually selectable; the index is backed up.

### Memory Graph {#hafiza-grafigi}

**Agent Farm: Open Memory Graph** (right-click the Memory section or the command palette) — makes visible the `[[wikilink]]` fabric that connects memory records to each other (2.15.0). Here you see whether the record-writing discipline ("link related records with [[name]]") actually works in practice:

- **Graph:** each record is a node (size = token weight, green = recalled in the last 30 days, dashed yellow ring = not in MEMORY.md), each `[[link]]` an edge. `[[target]]` resolves to both the file name and the frontmatter `name:` slug. Click a node → the file opens. Since MEMORY.md is the index it isn't a node.
- **Broken links:** `[[targets]]` that resolve to no file — a typo or a record "planned but forgotten". (By the user's convention a broken link isn't an error but a marker for a record to be written — but you want to be aware of it.)
- **Islands:** records that give/receive no links — information not connected to the fabric; link it or archive it.
- **Hubs:** the records that receive the most links — the centers of knowledge; don't bloat them, keep them maintained.
- The **Fix Memory Index…** button in the **Not in MEMORY.md** card starts the repair from the panel.
- The agent selector is on top; data is read fresh from the files on every open/Refresh.

## Memory Synchronization

The resolution tool for the **duplicate memory** problem the health engine catches: `Agent Farm: Sync Shared Memory…`

1. Memory files found with the same name across agents are listed (✓ identical, ⚠ diverged).
2. Pick a file → one of two actions:
   - **Compare two copies:** compare two agents' copies side by side in the VS Code diff screen — see exactly where the divergence is.
   - **Sync all copies from one source:** pick the source copy (the newest one is marked), confirm; all other copies are overwritten.
3. Next to each overwritten file, a timestamped `.afbak` backup is left — regret is reversible.

After sync, Insights refreshes itself; the group drops to "identical".

### Merge Draft

If the copies have diverged and there's valuable information in both, "pick one, overwrite the other" isn't enough. The third option is **Create merge draft**:

1. All copies are opened one below another in a single draft document with `=== FROM agent (N days ago) ===` headers (the newest on top).
2. You edit the draft by hand into its final form — delete the marker lines and the parts you don't want, combine the valuable lines from the two copies.
3. Run the `Agent Farm: Apply Merged Memory` command: the content you edited (with the remaining marker lines automatically stripped) is written to **all copies**; an `.afbak` backup is taken of each file.

There's an empty-result guard: if you delete the draft entirely, nothing is written to any file.

## Fleet Report

`Agent Farm: Export Fleet Report (Markdown)` — produces the fleet's comparative scorecard as a Markdown file (7/30/90 days). Tailor-made for saving into your Obsidian vault.

Contents: fleet totals, agent comparison table (session, cost, token, tool, error rate, **cache efficiency**, context load, memory count), model usage table, most expensive sessions, health findings.

**Cache efficiency** = the share of prompt tokens read from cache. If it's high (90%+), the same context is being read cheaply over and over; if it's low, sessions may be short and the context constantly rewritten — think about short sessions that could be combined.

The same comparison table also shows live in the **Agent comparison** section of the Dashboard; clicking a row goes to the agent detail.

### Automatic Report (to the Vault)

Instead of taking the report by hand you can put it on autopilot — a regular scorecard drops into your Obsidian vault:

1. Write the target folder to the `agentFarm.autoReportFolder` setting (e.g. a folder inside the vault).
2. Set the `agentFarm.autoReport` setting to `daily` or `weekly`.
3. The extension checks hourly; if that day's/week's report doesn't exist it produces it (`AgentFarm-Report-2026-07-08.md` or `AgentFarm-Report-2026-W28.md`) and drops a notification. The covered period is set with `agentFarm.autoReportDays` (default 7 days).

Runs while VS Code is open; on the first open of the day, that day's report is produced.

From 0.7.0, if there's archived headless task output within the period, a **Task outputs** section is added to the automatic report — scorecard and job outputs in one document. If you don't want it, `agentFarm.autoReportIncludeOutputs: false`.

### Task Outputs Digest

`Agent Farm: Export Task Outputs Digest (Markdown)` — gathers archived headless task outputs into a single document (today / 7 days / 30 days). For each task: agent, duration, status and the output itself (trimmed if long); failed tasks are marked with ⛔. The at-a-glance answer at the end of the day to "what did these produce?" for scheduled jobs and workflows. The default save location is `autoReportFolder` (if set) — so it drops into your vault.

## Health and Optimization

Agent Farm audits your agents with eight rules. The goal: **cheaper, more consistent agents that forget less.**

### Insight Lifecycle (2.41.0)

Insights are no longer a read-only list — every finding has a **path to closure**. On hover (or right-click) three actions appear:

- **🛠 Fix** — in categories that already have a mechanical fix, one click starts the relevant flow: `memory-index` → index repair, `duplicate-memory` → merge draft, `stale-memory`/`large-memory` → distillation, `antigravity` → sync, `secrets` → move the key to the vault, `pulse` → re-run the pulse. Shown only in fixable categories.
- **🚀 Delegate to Agent** — delegates the finding (or, with the button in the view header, **multiple findings**) to the chosen agent as a headless task. The work order is written automatically: findings listed numbered, plus the rules "read first, understand the root cause, fix what you can fix safely, DO NOT do what you're unsure of — report it". In a multi-delegate, each finding goes **to its own agent** (for fleet-wide findings with no agent, you pick an agent once); one task per agent is opened. When the task finishes, a report of what was fixed sits in the output archive.
- **✕ Dismiss** — so "an event that happened" findings (like a cost anomaly) don't stay in the list forever: hide for 1 day / 7 days / permanently. Dismissed ones are honestly counted — an "n dismissed insight(s) hidden" row appears at the bottom of the list; clicking it opens a restore picker (**Restore Dismissed Insights…** in the view menu). The identity is tied to agent+category+file, not the message text: "4.2×" being "3.9×" tomorrow keeps the same finding hidden.

**Click behavior got smart too:** clicking a `cost-anomaly` / `trend` / `budget` / `error-rate` finding now opens **the agent's own cost view** (Agent Detail), not a guide paragraph — the evidence is there.

**Auto-delegate (optional, off by default):** write category names into the `agentFarm.insightAutoDelegate` setting (e.g. `["memory-index", "duties"]`) — the warning/error findings of those categories drop as a headless task to their own agent as soon as they appear. At most one task per problem in 24 hours (a pending warning doesn't spawn a task every hour); only the task-runner window queues them, and every auto-delegate is announced with a notification. Since it spends agent time/money, it's turned on deliberately.

### Health: Context Load {#saglik-baglam-yuku}

`CLAUDE.md` + `memory/MEMORY.md` + `.agents/AGENTS.md` are loaded into context automatically at the start of every session — we call this the **fixed context load** and it's paid again every session. Agents that exceed the `agentFarm.contextBudgetTokens` budget (default 8,000 tokens) get a warning.

**How to fix:** shorten CLAUDE.md; move detail into memory files (they're only read when needed); limit the MEMORY.md index to one-line summaries.

### Health: Memory Index {#saglik-hafiza-indeksi}

The `MEMORY.md` index is compared against the files on disk:

- A file in the index but not on disk → **warning** (broken link).
- A file on disk but not in the index → **info** (an orphan file — the agent may never recall it).
- Memory files exist but there's no MEMORY.md at all → **warning**.

### Health: Duplicate Memory {#saglik-kopya-hafiza}

If a same-named memory file exists in more than one agent:

- If the contents are identical → **info**: consider tying to a single source.
- If the contents have diverged → **warning**: the copies drifted apart, the agents may contradict each other. Pick the most current and sync the rest.

### Health: Stale Memory {#saglik-bayat-hafiza}

Memory files untouched for longer than `agentFarm.staleMemoryDays` (default 45) are flagged. Review: if it's still true, touch it and leave it; if not, update or archive it.

### Health: Large File {#saglik-buyuk-dosya}

Memory files exceeding 20 KB get a warning. A large file = a large token cost every time the agent reads it. Split it by topic.

### Health: Identity {#saglik-kimlik}

An agent folder with no `CLAUDE.md` gets an **error** — an agent without identity starts every session without a personality.

### Health: Error Rate {#saglik-hata-orani}

If more than 10% of tool calls in the last 7 days errored, a warning is produced. A high error rate usually comes from: a broken tool script, a missing permission, a memory record that assumes a wrong path.

## Smart Oversight

You already see cost; this section puts **quality** on the same scorecard too. Four tools: quality scorecard, instruction suggestions, weekly smart summary and transcript search. The three that need a model call inside always run with a cheap model (`agentFarm.judgeArgs`), and their automatic loops are **off** by default — no API spending until you turn them on; the manual commands are always available.

### Quality Scorecard {#kalite-karnesi}

A cheap-model judge takes samples from the agents' recent sessions: it reads the agent's last reply against the session's first request and scores it 1-5.

- **By hand:** `Agent Farm: Sample Output Quality Now` — scores `qualitySamplesPerAgent` (default 2) new, unscored sessions per agent.
- **Automatic:** `agentFarm.qualitySample` = `daily` or `weekly` (default `off`).
- **Where it shows:** the **Quality** column in the Dashboard comparison table (14-day average), the Quality column in the fleet report.
- **Warnings:** if this week's average drops noticeably from last week (≥0.8 points) or the last two weeks' average is below 3, a `quality` warning appears in Insights.

Scores live in `quality.json` (globalStorage); the same session isn't scored twice. If cost is low but quality is low too, the automation is a loss — watch the two curves side by side.

### Instruction Suggestions {#talimat-onerileri}

The agent's self-improvement loop: a cheap model scans the **follow-up messages** in the last 14 days of sessions (excluding the first request — the corrections are in the follow-ups) and suggests a CLAUDE.md rule from repeating correction patterns (like "write titles in Turkish").

- **By hand:** `Agent Farm: Scan for Instruction Suggestions…` — you pick an agent; if there aren't enough follow-up messages (at least 4) it doesn't scan.
- **Automatic:** `agentFarm.suggestScan` = `weekly` (default `off`).
- **Where it shows:** as a 💡 row in Insights. Clicking opens a review: **Apply to CLAUDE.md** adds the rule to the agent's CLAUDE.md under a `## Learned rules (Agent Farm)` section; **Dismiss** closes the suggestion. No rule is written without approval.
- To review all open suggestions: `Agent Farm: Review Instruction Suggestions…` (the 💡 in the Insights header).

### Weekly Smart Summary

Against signal fatigue: instead of ten separate warnings, once a week a three-sentence human-language summary — cost trajectory, issues that need attention (budget/error/duty/quality) and a single suggestion.

- **By hand:** `Agent Farm: Generate Weekly Summary Now`.
- **Automatic:** `agentFarm.weeklySummary` = `true` (default `false`) — runs once on the first VS Code open of each ISO week.
- The summary is shown as a notification, also written to the vault as `AgentFarm-Weekly-Summary-<week>.md` if `autoReportFolder` is set, and can be forwarded to your pocket via `notifyWebhookUrl` (the `summary` event).

### Transcript Search {#transcript-search}

"I discussed this with an agent, but which one?" — as the fleet grows, your memory panel is on the job.

- **Open:** `Agent Farm: Search Transcripts…`, the 🔍 on the Recent Sessions header, or the **⌕ Search** buttons on the Dashboard, an Agent Detail page and the Session Viewer (2.53.0) — the latter two open the panel **pre-scoped** to that agent / that session, and the ✕ on the scope pill widens back to the whole fleet.
- **What is searched (2.53.0):** the default is **Dialog** — your requests + agent replies. The chip row widens it to **tool inputs** (file paths, commands, code — "which session touched this file?") and **tool results** (outputs, error messages); *Everything* covers all four. Measured on a ~95 MB fleet, a full everything-scan stays under ~1.5 s. Two extra sources ride along, each with its own tick: the agents' **memory notes** (`memory/*.md`, hits open the file) and **orphaned live events** — events whose transcript no longer exists (external CLIs, pruned sessions); events still backed by a transcript are deliberately excluded, the transcript scan already covers them.
- **Agent picker (checkbox dropdown, 2.60.0):** the `Agents: all ▾` button opens a tick list of every agent — pick **any combination**: one, two, all-but-one… **Select all / Clear** links do the bulk moves. Everything is ticked by default (new agents join automatically), so "all agents" needs no separate mode; unticking narrows the scan (memory notes and live events follow the same pick). The button reads `Agent: dev`, `Agents: 2/7` or `Agents: none` — an all-unticked pick honestly finds nothing. Opening the panel from an Agent Detail page pre-ticks just that agent; changing the pick retires the stale agent pill.
- Other options: `regex` box (plain text by default, case-insensitive), `match case`.
- **The search re-runs by itself** (2.54.0): changing any control — agent, chips, sources, regex/case — re-searches immediately (measured cheap, and a superseded search's results are dropped). Only semantic mode still waits for Enter, since each semantic query is a paid embedding call.
- **Results are grouped per session with turn sub-headers** (2.53.0): each session is one block (header click → open the session), hits inside it are labeled `Turn 3 — <its opening prompt>`; tool hits carry the tool name. Clicking a hit opens the session viewer and scrolls to **the exact matching message** (2.40.0) — briefly highlighted with a frame.
- Results are limited to 3 per session, 150 total (a session-scoped search gets much higher caps) — narrow the query if it overflows. A runaway regex is cut by a **10 s time budget**; partial results say so honestly.

**Semantic mode (meaning-based search):** searches meaning, not words — for questions like *"where I talked with the agent about low motivation"*. Tick the **semantic** box in the panel.

- Setup: `agentFarm.embeddingsProvider` = `gemini` (Google API — add the `GEMINI_API_KEY` secret with Set Secret) or `openai` (any OpenAI-compatible endpoint — if you want it **fully local**, Ollama: `embeddingsBaseUrl` = `http://127.0.0.1:11434/v1`, model e.g. `nomic-embed-text`, no key needed).
- Index: the **Build Semantic Index** command vectorizes the last `semanticMaxSessions` (300) sessions in chunks; it's file-based, works incrementally (only new/changed sessions), and refreshes itself up to 20 sessions on every semantic search.
- Results show a similarity-percentage badge; in semantic mode no automatic search happens as you type (each query is an embedding call), you search with Enter.

## Command Center

As the fleet grows, the bottleneck is you: who's waiting for permission, which browser step wants approval, where did the budget overflow? The Command Center layer (Phase G) is for answering these questions on a single screen.

### Approval Queue {#onay-kuyrugu}

**Agent Farm: Open Needs You (Approval Queue)** — everything that comes to you in a single, urgency-sorted queue:

1. 🛡️ **Sessions waiting for permission** (from live hook data) — one click opens the session or the Timeline.
2. 🌐 **Browser steps waiting for approval** — **Run / Reject** directly from the queue. The notification and the queue race; the first decision wins. If you miss the notification the request waits in the queue and the workflow doesn't advance until it gets approval.
3. ⛓ **Interrupted workflow runs (2.42.0)** — chains cut off by a window close are no longer just a startup notification: they're a persistent row in the queue, the **Resume / Dismiss** buttons are on the row, and they count toward the status-bar badge until a decision is made. Missing the startup toast doesn't lose the run.
4. ⏳ **Stalled sessions** · 💸 **budget overruns** · ⇄ **Antigravity conflicts** (one-click reconcile) · 💡 **open instruction suggestions** · 🕓 **parked tasks** (concurrency/quota) · 💬 **your-turn** sessions.

The status bar now counts this queue: if `🔔 N need you` shows, clicking it opens the queue. Three blocking kinds are counted: permission, browser approval, stalled.

### Kanban Board {#kanban-panosu}

**Agent Farm: Open Task Board (Kanban)** (the $(layout) icon in the Tasks header) — the manager surface for the task queue:

- Columns: **📥 Inbox** (queued, to be started by hand) · **🕓 Parked** (waiting on capacity/quota) · **⚙️ Running** · **🛡️ Needs Approval** (permission + browser approvals, Run/Reject on the card) · **🏁 Done** (last 30).
- **Drag and drop** cards: Inbox→Running = start, Running→Done = complete, Inbox→Done = cancel. The card shows agent, duration, verify badge, media cost; **double-click** a card that has an output archive = open the output.
- Above the board is a **command bar**: type your natural-language sentence, a cheap model turns it into a plan, and it's set up with a preview approval (the same flow as Natural Language Command below).

### Cost Anomaly {#maliyet-anomalisi}

A fixed budget threshold has a blind spot; the anomaly detector catches "today is very different from usual" with statistics:

- Per agent (and fleet) the last **14-day median + MAD** (robust deviation) is computed; if today is above `median + 3.5σ` **and** at least 2× the median, a ⚠ drops in Insights: *"psychologist is at 4.2× its normal today"*.
- Days below `agentFarm.costAnomalyMinUsd` (default $1) are counted as noise; 0 turns the detector off. It works independently of budgets, with no model call.
- **Agent Farm: Cost Anomaly Report** — today/median/multiplier in a table + a **heavy hitters report**: a list of the sessions that ate 50% of the tokens in the last 7 days ("5% of sessions ate half the tokens").

### Eval Set

The natural evolution of the quality scorecard: production traces that went badly become **regression test cases** (the trace→dataset loop).

1. **Add Eval Case…** — the candidate list comes automatically: low-scoring quality samples (≤2/5), steps where verify FAILed, or write it by hand. A case = **input** (the prompt to re-ask the agent) + **expectation** (the judge criterion, in plain language).
2. **Run Eval Set…** — approved and with a known cost: each case is one agent call (`agentFarm.evalRunArgs`, default haiku — clear it if you want to test the real model) + one cheap judge call. The result is a scorecard: *"12/14 passed, 2 regressed"* — regressions/improvements against the previous run are reported by case name.
3. **Review Eval Cases…** — review/delete cases. Running the set after you change CLAUDE.md makes the effect of an instruction change measurable.

### Session Replay {#session-replay}

**▶ Replay** in the session viewer — the fastest answer to "what happened?": messages and tool calls flow step by step, faithful to the real time intervals (capped at 5s, 1x-8x speed). Jump to critical moments with the **next error ⚠** and **next prompt 💬** buttons; step frame by frame with −1/+1.

The control bar is **sticky** (2.6.0): as messages flow down, the bar pins to the top of the screen — no matter how far playback goes, the Pause/speed/jump buttons are always within reach. The bar also has an **✕ Exit** (2.7.0) — you don't have to scroll up to exit replay.

Replay obeys the **Show filter** (2.7.0): if Dialog is selected only dialogue messages play; clicking a row in the Turn breakdown table moves playback to the start of that turn.

### Subagent Tree

Subagents are the invisible part of cost. Recent Sessions and agent session lists are now a **tree**: subagent logs (`…/session-id/subagents/*.jsonl`) are gathered under the parent session, and a **⧉ N sub • $X total** rollup shows on the parent row (itself + up to 5 levels below). Individual costs sit in the sub-rows.

## Security and Reliability

As the autonomous fleet grows, two questions become critical: "what are my agents allowed to do?" and "can I trust my automation?" (Phase H).

### Guardrail Auditor {#guardrail-denetcisi}

Each agent's `.claude/settings(.local).json` permission rules are audited automatically (`agentFarm.permissionLint`, on by default) and findings drop into Insights; clicking opens the config file, where you tighten the rule:

- ⛔ **bypass mode:** `defaultMode: bypassPermissions` — means all permission questions are off.
- ⛔ **dangerous pattern:** patterns like `rm -rf`, `curl … | sh`, `-EncodedCommand`, `git push --force`, disk format inside an allow rule (`--force-with-lease` is exempt).
- ⚠ **overly broad rule:** `Bash(*)`, bare `Bash`, `*`, `WebFetch(domain:*)` — everything runs without asking.
- ℹ **unused broad rule:** a rule with a wildcard, but that tool was never called in the last 30 days — free risk surface.
- ℹ **duplicate rule** and broken-JSON warning.

### Trigger Scorecard {#tetik-karnesi}

Trust in automation must be measurable. Each trigger row in the Tasks tree now carries its scorecard: `fired 12× • 7d: 9✓/1✗ • start ~4s` (7-day success/failure + median start latency). **Agent Farm: Trigger Reliability Report** gives the full table. Two smells drop into Insights automatically:

- ⚠ **always fails:** the trigger's recent runs are FAILED back to back — the chain it starts is broken.
- ℹ **never fired:** the trigger is installed but never ran — check the watch path/hook filter/webhook caller.

### Pulse Check {#nabiz-kontrolu}

Let problems be caught on the pulse, not on the job: each agent gets a fixed cheap "say who you are in one sentence" prompt, and a cheap judge PASSes/FAILs the answer's consistency with the CLAUDE.md identity. A broken CLI, a corrupted CLAUDE.md, an agent that can't answer — all become visible before they get to real work.

- `agentFarm.pulse`: `off` (default) / `nightly` / `weekly`; by hand: **Run Pulse Check Now**.
- A FAILing agent becomes a ⛔ in Insights; the cost is two cheap calls per agent (the `judgeArgs` model).

### Headless Service

The cure for the "while VS Code is open" constraint: **Install Headless Service (Windows)…** registers a small node process to logon (schtasks, current user). The service:

- **Sleeps** while VS Code is running (it watches the heartbeat the extension writes every 30s) — no conflict; when VS Code closes it takes over within ~90s.
- When it takes over it handles **scheduled tasks** and **watch triggers**: runs `claude -p` headless, writes output to the same archive, adds task records to `farm-tasks.json` — when the panel opens everything is in place, and a "the service ran N tasks while you were away" notification arrives.
- The scope is deliberately narrow: hook/webhook triggers want the live listener, workflow/dispatch actions want the full engine — those stay in VS Code. Service tasks always run headless.
- `node` must be on PATH. Status: **Headless Service Status**; removal: **Remove Headless Service**. Log: `service-runs.jsonl`.

## Natural Language Command {#natural-language-command}

The shortcut for the setup UI: the 🚀 in the Tasks header (or `Agent Farm: Natural Language Command…`) → write a single sentence:

> *"run the psychologist's weekly analysis tomorrow at 09:00"* · *"have the writer draft first, then the editor fix it"* · *"give the assistant this job now: …"*

A cheap model turns the sentence into a structured plan (one-time job / schedule / multi-step chain), and you're shown a **human-language preview** — nothing is set up until you say *Create* or *Create & Run*. The plan is validated: only your real agent names are accepted, times and steps are checked; if the model rambles you see the error together with the raw output, nothing wrong is set up silently. Expressions like "tomorrow" are computed relative to the current date.

## Dispatcher {#dispatcher}

As the fleet grows, "which agent is this job for?" also becomes automatic. When adding a trigger, choose **Dispatch — route to the best agent** as the action: on every fire, the incoming text (webhook body / watched path) is examined and the job is given to the most suitable agent.

1. **Rules first:** `agentFarm.dispatchRules` — regex → agent; the first match wins. E.g. `[{"match": "sleep|anxiety", "agent": "psychologist"}]`. Deterministic and free.
2. **Classifier next:** if no rule matches, a cheap model picks by looking at the agents' CLAUDE.md role summaries (`agentFarm.dispatchClassifier`, on by default; if you turn it off, work that matches no rule is dropped and reported).

The chosen agent and method are written into the task title (`inbox job → psychologist [model]`). To try without setting up: `Agent Farm: Test Dispatcher…` — write the text, see who'd take it and the reasoning.

## Intelligence Depth

The layer that moves instruction engineering from guesswork to measurement (Phase I): every CLAUDE.md change is logged, its effect measured, memory maintenance semi-automatic.

### Instruction Versioning

Every time an agent's CLAUDE.md changes it's automatically taken into a timestamped history (with the content — you can look back). The **Instruction History & Impact…** command opens the version table: how many sessions ran during each version's tenure, what the quality average was (▲/▼ against the previous version), what the daily cost was. *"Quality +0.6 after this rule"* is now a table row. When an A/B experiment's winner is applied, it's recorded into the history too.

### A/B Instruction Experiment

**A/B Instruction Experiment…** — two CLAUDE.md variants, the same prompt set, a side-by-side judge:

1. Variant B can come from three sources: try an open **instruction suggestion** (current + rule), pick **from a file**, or write the rule **by hand**.
2. Prompt set: the agent's **eval cases** automatically if it has them (at most 5); otherwise you write them separated by `;`.
3. Each prompt runs in two isolated sandboxes (a temp folder: variant CLAUDE.md + a memory copy — the real agent isn't touched). A cheap judge sees the answers in **random order** (position bias controlled) and says 1/2/EQUAL.
4. Report: A-B-equal score + rationales per prompt. **If B won** it's made permanent in one click (`.afbak` backup, recorded into the version history).

### Memory Distillation

The semi-automatic form of the context diet: **Distill Memory File…** → bloated (~2000+ token) or stale files come first in the candidate list → a cheap model produces a condensation draft (repeats merged, contradictions marked with `⚠ CONTRADICTION:`, stale lines in an "Archive candidate" section, frontmatter as is) → you compare it in a **diff screen** → if you say Apply it's applied with an `.afbak` backup. Guards: a model limit/error message is never treated as a draft; a draft that drops the frontmatter is rejected; the MEMORY.md index is never a candidate (handmade).

### Semantic Memory Query

Transcript search finds the past; this finds the **knowledge**. **Ask Fleet Memory…** → *"what is known about the user's sleep pattern?"* → all agents' memory/*.md files are searched in the embedding index (same provider settings: `embeddingsProvider`), results listed with agent + file + similarity percentage, and the file opens when you select. The index is incremental (only changed files are re-vectorized) and separate from the transcript index.

### Model Policy

The proactive form of the quota guard: the model depends on where the task was born.

- `agentFarm.modelPolicy` rules — the first match wins: `[{"source": "trigger", "model": "haiku"}]` = every routine job born from a trigger on a cheap model; `source` = trigger/schedule/workflow/manual/any, plus `agent` and `promptMatch` regexes.
- **Quota downgrade:** `quotaDowngradePercent` (e.g. 70) — when the 5-hour window exceeds this fullness percentage, every factory-sourced task is forced to `quotaDowngradeModel` (default haiku). Sessions you opened by hand are left alone.
- The applied policy is written to the headless output header (`Model policy: quota window 82% ≥ 70% — downgraded…`) — what ran cheap and why is always traceable.

## Scale and Portability

When the fleet doesn't fit on a single machine: watch other machines' sessions in the same panel, send the daily scorecard to your pocket, move your agents with a single file.

### Multiple Machines {#multiple-machines}

Mirror the second machine's `.claude` folder read-only to this machine with a sync tool (Syncthing, OneDrive, an SSH copy), then:

```json
"agentFarm.extraClaudeDirs": [
  { "name": "laptop", "dir": "D:/sync/laptop/.claude" }
]
```

- That machine's sessions come into the panel with a **⇄ laptop** badge; cost, scorecard and search all cover them.
- Agent matching still looks at the working directory: if you use the same folder layout on both machines, remote sessions are counted to the right agent; unmatched ones are gathered under `Other projects (laptop)` (when `includeUnmatchedProjects` is on).
- If the `projects` folder isn't found in the sync copy, you get a warning on startup — check that the sync is working.
- Agent Farm **writes nothing** to the remote folder; monitoring is one-way.

### Daily Digest Card (Pocket) {#daily-digest-card}

The little sibling of the weekly smart summary — no model call, pure data, phone-friendly single message: today's cost, active agents, top spenders (with budget percentage), task/duty status and warnings.

- **By hand:** `Agent Farm: Send Daily Digest Now`.
- **Automatic:** `agentFarm.dailyDigest` = a time like `"21:30"` — it's sent once a day on the first check after that time to `notifyWebhookUrl` as a `digest` event (drops into your pocket via the n8n → Telegram line).
- If the webhook isn't set, a manual run shows the result as a notification.

### Agent Packs {#agent-packs}

A single file to templatize an agent and move or share it to another machine: `.agentpack`.

- **Export:** right-click an agent → **Export Agent Pack…** (or the command palette). What goes into the pack: `CLAUDE.md`, `DUTIES.md`, `tools/`, `.claude` settings, `.mcp.json` + the workflows/triggers/schedules/templates the agent is involved in.
- **What NEVER goes in:** `memory/` (personal memory) and secrets. Files that smell of credentials are skipped automatically with a warning; webhook tokens are removed from the pack. `{secret:NAME}` references are preserved — they work when you define a secret with the same name on the target machine.
- **Import:** **Import Agent Pack…** → pick the pack file → root folder + new name → confirm. A fresh `memory/MEMORY.md` scaffold is set up; workflow steps are bound to the new agent (same-named local agents are resolved by name, unfound ones fall to self with a warning); triggers and schedules come in **off** — review and turn them on yourself.

### Antigravity Compatibility {#antigravity-uyumlulugu}

Your agents are optimized for Claude; but if you like, the same agent runs under Google Antigravity (Gemini) too. Antigravity's standard: **AGENTS.md** in the root (a cross-tool instruction file), `.agents/workflows/*.md` (slash-command workflows), `.agents/skills/` (ability guides); MCP configuration in the global `~/.gemini/config/mcp_config.json` (the same `mcpServers` schema as Claude's `.mcp.json`). Since `memory/` files are plain markdown, **both sides use them as is — no conversion needed**.

**Set up:** right-click an agent → **Sync Agent with Antigravity…**

- `CLAUDE.md` → `AGENTS.md` is produced (self-references adapted; a sync marker at the top of the file).
- Active standing duties → `.agents/workflows/` files (called in Antigravity as `/duty-name`).
- If there's a `.mcp.json` → an `.agents/mcp_config.suggested.json` suggestion (you merge it into the global gemini file by hand — Agent Farm never writes to `~/.gemini`).

**Keep it alive (directional sync):** This isn't a one-time export. On every sync, content fingerprints are written to `.agents/af-antigravity-sync.json`; on the next run it's determined which side moved ahead:

- **CLAUDE.md changed** → a reminder in Insights; the command refreshes AGENTS.md.
- **AGENTS.md changed** (an Antigravity session taught the agent something) → the command asks: if you say **Apply to CLAUDE.md** the gain is carried, backed up, into CLAUDE.md — the optimization heritage lives on both sides.
- **Both changed** → a conflict warning: view the Diff or pick a direction; the losing side is preserved with an `.afbak` backup.
- Workflow files you edited by hand and an AGENTS.md you wrote (that we didn't produce) aren't touched without approval.

### Parallel Worktree Runs

The scale key for code agents (Phase J): several jobs in the same repo, zero conflicts.

- **Run Parallel Worktrees…** → agent (must be a git repo) → separate prompts with `;` → each prompt runs headless in its own `git worktree` (an `af/` branch, in a `.af-worktrees-*` folder next to the repo); a "commit when done" instruction is automatically added to the agent. The cards show with a `⑂` prefix in the board.
- **Worktree Runs…** → a list of runs: how many commits, diffstat, any uncommitted changes → when you select, three actions: **Merge** (`--no-ff` onto the current branch, then worktree cleanup), **Open** (open in a new window, review by hand), **Discard** (worktree + branch deleted, approved).
- On old git versions (no `worktree remove`) cleanup is done with a manual delete + `worktree prune` — the version check is automatic.

### Live Relay (Remote Machine)

E1's folder sync carries the past; a relay carries **liveness**. Setup:

1. On this machine: **Save Relay Script for Another Machine…** → save `farmRelay.js`, copy it to the other machine.
2. On the other machine: `node farmRelay.js --claude %USERPROFILE%\.claude --out <syncFolder>\relay-laptop.jsonl --machine laptop` (you can also put it at startup). The script watches the lines appended to transcripts and writes a compact event stream — no network, the transport is your own sync tool.
3. On this machine: `agentFarm.relayFeeds` = `[{"name": "laptop", "file": "D:\\Sync\\relay-laptop.jsonl"}]` → events flow into the live monitor: the remote agent shows WORKING in the Live Feed/on the agent row. Agent matching is done by folder name (a same-named agent folder on both machines = the same agent).

### OpenTelemetry Export

**Export Traces (OpenTelemetry JSON)…** — all sessions (subagent trees with parent-child span relationships) are written to an OTLP/JSON file: you can feed it to Langfuse, Grafana Tempo or any OTLP consumer. Locality is preserved: only a file is written, where you send it is your call. Span attributes: agent, model, tokens (`gen_ai.*`), cost, tool count, errors (an errored session = ERROR status).

### Agentpack Gallery

The consumption side of agent packs: `agentFarm.packGalleryRepos` = git URLs or local folders → **Browse Agent Pack Gallery…** syncs the sources (git: shallow clone + pull), lists the `.agentpack` files found, and the one you pick is set up with the normal **safe import flow** (memory/secrets are never in the pack, triggers come in off, a new webhook token).

### Multi-CLI Runner

The task runner is no longer locked to claude: `agentFarm.cliProfiles` = `[{"name": "gemini", "headless": "gemini -p \"{prompt}\"", "interactive": "gemini"}]` → the Add Task wizard lets you pick a CLI. **The expectation is clearly bounded:** non-claude runners get an output archive + exit-code status; transcript analysis, live hooks, cost and quality layers are Claude-specific. With Antigravity sync (1.3.0) the same agent identity works on both sides.

**Open a season with a different model (2.29.0 — Wave E1):** right-click an agent → **Start Session With… (choose CLI)** or the same from the command palette: it lets you pick a CLI (Claude Code default + gemini/codex/… from `cliProfiles`) and opens a terminal session in the agent folder with that profile's `interactive` command. **The Claude path is preserved exactly** — this is a separate sibling command, it doesn't touch the existing Start Claude Session. The CLI you last used per agent is remembered and floats to the top of the list (it also obeys the `externalTerminal` setting). Note: for an interactive session write the profile's `interactive` field as a plain launcher (like `"gemini"`).

**External sessions' lifecycle is tracked (2.30.0 — Wave E2a):** a non-claude session opened with Start Session With… now shows in the Live Timeline — an `idle` row drops into the lane when the terminal opens, and it becomes `ended` when the terminal closes. The session id is namespaced with `cli:<cliId>:...` (no collision with claude UUIDs), and the card shows a CLI badge + an "external CLI — lifecycle only" label. **Honest limit:** since the CLI emits no hooks, intermediate states (working/tool/cost) aren't tracked — only open/closed; in `externalTerminal` mode, with no terminal object, the lifecycle isn't tracked at all. After a reload the row reattaches to the restored terminal whose name matches; if the terminal didn't come back, the row is honestly closed.

**Hook bridge — rich events from an external CLI (2.31.0 — Wave E2b):** the Start Session With… terminal carries the `AGENT_FARM_SESSION` / `AGENT_FARM_CWD` / `AGENT_FARM_EVENT_PORT` / `AGENT_FARM_HOOK` environment variables; the `cliHook.js` bridge script that ships with the extension reads these variables and POSTs the event to the live listener. Bind it to the CLI's notify/hook mechanism or a wrapper: **for codex**, `notify = ["node", "<path to cliHook.js>"]` in `~/.codex/config.toml` is enough — codex passes the payload JSON as the LAST ARGUMENT and the bridge auto-detects it (2.36.0; known types are mapped: `agent-turn-complete`→Stop). Manual use: `node "%AGENT_FARM_HOOK%" --event Stop`, `--event PreToolUse --tool Bash`, `--event UserPromptSubmit --prompt "..."`; for tools that provide JSON on stdin, `--json`. For a ready command: **Copy CLI Hook Bridge Command**. The bridge is fail-soft: it always exits 0 and never blocks the CLI; with no session env, a folder's events are gathered in a stable `cli:external:<folder>` lane. No env is given to Claude terminals — the claude path didn't change. **Honest limit:** which CLI can emit which event depends on the CLI (the wiring is on the user's side).

**External session history (2.32.0 — Wave E3a):** external CLI sessions show in the Sessions tree and in the agent's Sessions section (a terminal icon + a CLI badge + prompt/tool counts; click → Live Timeline; since there's no transcript there are no viewer/rename/delete/resume menus) and an honest single-line summary appears in the dashboard. The data is derived from the live event store (`cli:` lanes, ~31 days) — a foreign log format is NOT GUESSED; token/cost is honestly ignored (not even said to be 0, doesn't enter totals). Architecture: the `SessionSource` interface normalizes foreign sessions into `SessionInfo` but keeps them in a **side list** in the index — `all()`/`forAgent()` stay claude-only, so claude-specific analytics (context health, cache efficiency, skill/MCP/memory usage, reports, search, OTLP) structurally never see a foreign session. **Codex & Gemini transcript adapters (2.34.0 — Wave E3b):** Codex CLI rollout transcripts (`~/.codex/sessions/**/rollout-*.jsonl` + archived ones; customizable with `agentFarm.codexHome`) and Gemini CLI chat files (`~/.gemini/tmp/<hash>/chats/`; `agentFarm.geminiDir`) are scanned and enter the external session history with REAL token usage. Agent matching: from the `cwd` field in the transcript for codex, and by comparing the `sha256(project root)` hash in the folder name against the agent folders' hash for gemini. **Cost honesty:** each model's usage passes through the `agentFarm.pricing` rules — if you add a rule (e.g. `"gpt-5"`, `"gemini-2\\.5-pro"`) the real dollar value shows; without a rule, $0 + an unknown-model warning. Clicking a session opens the raw transcript. The formats were taken from upstream source code (openai/codex protocol + gemini-cli, July 2026) and are fail-soft — an unrecognized file/line is silently skipped, and if a format drifts nothing breaks, that session just doesn't show; a transcript that overlaps a live-event lane is deduplicated (the transcript wins).

### Voice Briefing

The return half of the NoteScribe loop: **Speak Daily Briefing (TTS)** runs the daily digest card through a fal.ai TTS model and drops the mp3 into `digestTtsFolder` (a folder synced to your phone / vault). Settings: `digestTtsModel` (verify the real model id on fal), the key is the same `FAL_KEY` secret. If the folder is empty, `autoReportFolder` is used.

### Marketplace / Publishing

The extension is prepared at publishing quality: `LICENSE` (MIT), `CHANGELOG.md`, a privacy statement in the README ("no telemetry") and publishing steps. Going to the Marketplace/Open VSX is a productization decision and it's yours — the steps are in the README's "Publishing" section (a publisher account + `vsce publish`).

## Cost Accounting

Token usage is read from local logs and priced with the `agentFarm.pricing` rules (USD per million tokens; the first matching regex wins):

| Model pattern | Input | Output | Cache Write | Cache Read |
| --- | --- | --- | --- | --- |
| opus | 15 | 75 | 18.75 | 1.50 |
| fable, mythos | 15 | 75 | 18.75 | 1.50 |
| sonnet | 3 | 15 | 3.75 | 0.30 |
| haiku | 1 | 5 | 1.25 | 0.10 |

**Important:** On a subscription plan (Pro/Max) these numbers aren't a bill — they're the **API-equivalent value** of your usage. It's the answer to "how much value did I get out of my subscription this month?". If the price list is updated, correct it in the settings; unmatched models are listed as a warning at the bottom of the Dashboard and counted as $0.

You can edit these rates without touching JSON: open any agent's detail page and use the **Model pricing** editor. A change applies **going forward only** — sessions already recorded keep the rate they were billed at, so updating a price never rewrites past costs. The rates are remembered next time (stored in the `agentFarm.pricing` setting), while a dated history behind the scenes lets each message be priced at the rate in effect when it ran (2.47.0).

**The 5-hour window:** On subscription plans, the quota works in ~5-hour rolling windows. The Dashboard shows the token total for the last 5 hours; if you write your plan limit into the `agentFarm.windowTokenLimit` setting you get a percentage bar.

### Budget Alerts {#butce-uyarilari}

With the `agentFarm.budgets` setting you define a **daily budget** per agent (and fleet-wide with `"*"`):

```
"agentFarm.budgets": { "psychologist": 20, "*": 50 }
```

- An agent that reaches **80%** of its budget gets a ⚠ warning in Insights; an agent that **exceeds** it becomes a ⛔ error and a notification drops once a day.
- Budgeted agent cards show a fill bar in the Dashboard; the fleet budget is rendered into the "Cost today" card.
- The numbers are API-equivalent value — on a subscription it's not a bill but a consumption discipline: like "psychologist shouldn't exceed $20 in value today".

### Trend Alerts {#trend-uyarilari}

A budget looks at "today"; a trend alert looks at the **weekly trajectory**. If an agent's cost over the last 7 days reaches `agentFarm.trendAlertFactor` times (default 2x) the previous 7 days, a warning appears in Insights: *"Weekly cost trend: $24 this week vs $6 last week (4.0x)."* The fleet as a whole is watched separately too.

Noise protection: if the previous week is below $0.50 and this week below $1, no warning is produced (the multiplier is meaningless at small numbers). `trendAlertFactor: 0` turns it off entirely. This warning doesn't mean "bad" — sometimes it's a busy project week; its purpose is to show silent cost creep early.

## Settings

### Farm Settings page (2.54.0)

You don't have to dig through VS Code's settings UI: **Agent Farm: Farm Settings** (also the **⚙ Settings** button on the Dashboard) opens a single page with **every `agentFarm.*` setting**, grouped by area (Core, Live Monitoring, Cost, Tasks, Media, Search, Multi-CLI, Health, Reports), with a filter box, each setting's description under its name and the full key + default in the tooltip. Booleans are checkboxes, enums are dropdowns, lists/objects get a JSON editor with validation — a bad value is rejected with an inline error instead of being written. Settings changed from their default carry a marker and a one-click **↺ reset**. Changes save immediately to your user settings; edits made elsewhere show up here live.

The page is **schema-driven**: it renders whatever the extension manifest declares, so a setting added in a future version appears automatically.

**Setting sets:** save the current non-default values as a named set (*Save current as…*), then **Apply** restores it later — applying a set also resets modified settings the set doesn't mention, so a set is a complete state, not an overlay (a confirmation tells you exactly how many values change). Sets can be **exported to / imported from a JSON file** — portable across machines.

**Agent folders section (2.61.0):** the page's first section manages **where agents live** — the piece that used to be a one-time setup question and then a raw JSON array. Every root in `agentFarm.agentRoots` is a row with a badge saying what discovery made of it: **nest · N agents** (its subfolders are the agents; the root's own `CLAUDE.md` is shared instructions, not an agent), **single agent**, plain **N agents**, **folder missing** or **duplicate entry** (the same folder spelled twice — one click cleans it up, spelling differences in case or slashes no longer distort discovery). Each row lists its agents as chips: click a name to open that agent's page, or **Exclude** to keep a folder out of the farm entirely — it stops being an agent everywhere (views, analytics, session ownership) until you **Include** it back; excluded folders stay visible, greyed out, so the way back is always one click. **+ Add root…** opens a folder picker; **Remove** stops scanning a root after a confirmation that states how many agents leave the views (the folder itself is never touched); **Reveal** shows it in the file explorer. Stale exclude entries that no longer match anything are listed separately for one-click removal. Under the hood these edit `agentFarm.agentRoots` / `agentFarm.excludeAgentDirs`, so hand edits and setting sets stay in sync with the page.

**Claude Code (claude CLI) section (2.55.0):** the same page also edits **claude's own** `~/.claude/settings.json` — the file behind terminal tips like *"Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …"*. A curated, explained catalog covers the default model, permission default mode, co-authored-by, transcript retention (`cleanupPeriodDays` — bounds how far back Agent Farm's search and analytics can see), output style and the well-known env switches (PowerShell tool preview, thinking/output token caps, bash timeouts, auto-update/telemetry opt-outs). Clearing a value removes the key so Claude's own default takes over. Everything else is editable in the validated **raw JSON editor** below the catalog — broken JSON is never saved, and a one-time `.agentfarm-backup` copy is kept next to the file. Changes apply to **new** claude sessions.

### Reference table

| Setting | Default | What it does |
| --- | --- | --- |
| `agentFarm.guideLanguage` | en | Language for the in-app help (Guide, Quick Start, Examples): en / tr |
| `agentFarm.agentRoots` | `["D:/zone/agent/ajanlar"]` | The roots scanned for agent folders (see the Agent folders section) |
| `agentFarm.excludeAgentDirs` | [] | Folders never treated as agents, even when they look like one |
| `agentFarm.claudeDir` | empty (`~/.claude`) | Claude Code data directory |
| `agentFarm.extraClaudeDirs` | [] | Other machines' synced `.claude` folders (`{name, dir}`) |
| `agentFarm.activeThresholdSeconds` | 150 | A session whose log changed within this window is "active" |
| `agentFarm.staleMemoryDays` | 45 | Stale-memory threshold |
| `agentFarm.contextBudgetTokens` | 8000 | Fixed context-load budget |
| `agentFarm.windowTokenLimit` | 0 (off) | 5-hour window limit (for the percentage bar) |
| `agentFarm.maxTranscriptMessages` | 1500 | Max messages shown in the session viewer |
| `agentFarm.contextWindowTokens` | 0 (auto) | The "Context now" ceiling. 0 = found automatically from the session's model (no percentage for an unknown model); enter a value to force a fixed ceiling |
| `agentFarm.includeUnmatchedProjects` | false | Also include sessions that don't match the agent roots |
| `agentFarm.pricing` | the table above | Model pricing rules |
| `agentFarm.liveMonitor` | true | Run the live event listener |
| `agentFarm.livePort` | 8377 | Listener port (reinstall hooks when you change it) |
| `agentFarm.stuckThresholdSeconds` | 240 | Stall threshold |
| `agentFarm.notifyPermission` | true | Permission-wait notification |
| `agentFarm.notifyStuck` | true | Stall notification |
| `agentFarm.notifyTurnEnd` | false | Turn-end notification |
| `agentFarm.queueAutoAdvance` | false | Auto-start the next task when one finishes |
| `agentFarm.taskExtraArgs` | empty | CLI arguments added to task commands (e.g. `--model haiku`) |
| `agentFarm.judgeArgs` | haiku | CLI arguments for verifier (judge) calls — keep it a cheap model |
| `agentFarm.maxConcurrentTasks` | 2 | Concurrent running-task cap in the fleet (0 = unlimited) |
| `agentFarm.maxConcurrentPerAgent` | 1 | Concurrent-task cap per agent |
| `agentFarm.quotaGuardPercent` | 0 (off) | Defer automatic jobs when the 5h window reaches this fullness |
| `agentFarm.outputsMaxMB` | 200 | Output-archive size ceiling |
| `agentFarm.notifyWebhookUrl` | empty | Webhook to forward notifications to (n8n→Telegram etc.) |
| `agentFarm.notifyWebhookEvents` | all | The event types to forward |
| `agentFarm.mediaAuthSecret` | FAL_KEY | The name of the secret holding the media key |
| `agentFarm.mediaPricing` | table | Media cost-estimation rules (verify from fal.ai) |
| `agentFarm.mediaBaseUrl` | empty | fal queue address override (test/proxy) |
| `agentFarm.autoReport` | off | Automatic fleet report: off / daily / weekly |
| `agentFarm.autoReportFolder` | empty | The folder to write automatic reports to (vault) |
| `agentFarm.autoReportDays` | 7 | The number of days the automatic report covers |
| `agentFarm.budgets` | {} | Daily USD budget per agent; `"*"` = fleet-wide |
| `agentFarm.trendAlertFactor` | 2 | Weekly cost multiplier threshold (0 = off) |
| `agentFarm.autoReportIncludeOutputs` | true | Add task outputs to the automatic report |
| `agentFarm.qualitySample` | off | Automatic quality sampling: off / daily / weekly |
| `agentFarm.qualitySamplesPerAgent` | 2 | Sessions to score per agent per sampling |
| `agentFarm.suggestScan` | off | Weekly instruction-suggestion scan: off / weekly |
| `agentFarm.weeklySummary` | false | A three-sentence smart fleet summary once a week |
| `agentFarm.dailyDigest` | off | The time to send the daily digest card to the webhook (e.g. "21:30") |
| `agentFarm.dispatchRules` | [] | Dispatcher rules: regex → agent (first match wins) |
| `agentFarm.dispatchClassifier` | true | Let a cheap model pick the agent when no rule matches |
| `agentFarm.embeddingsProvider` | off | Semantic search: gemini / openai (Ollama included) |
| `agentFarm.embeddingsModel` | empty (auto) | Embedding model |
| `agentFarm.embeddingsBaseUrl` | empty (auto) | Endpoint override (Ollama: http://127.0.0.1:11434/v1) |
| `agentFarm.embeddingsSecret` | empty (auto) | The name of the secret holding the key (GEMINI_API_KEY / OPENAI_API_KEY) |
| `agentFarm.semanticMaxSessions` | 300 | The number of sessions the semantic index covers |
| `agentFarm.browserAllowHosts` | [] | Global domain allowlist for browser steps |
| `agentFarm.browserApproval` | ask | Approval before a browser step: ask / auto |
| `agentFarm.costAnomalyMinUsd` | 1 | Cost-anomaly detector floor (USD); 0 turns it off |
| `agentFarm.evalRunArgs` | --model haiku… | CLI arguments for eval runs; empty = the agent's default model |
| `agentFarm.permissionLint` | true | Guardrail audit of permission rules (Insights) |
| `agentFarm.pulse` | off | Synthetic pulse check: off / nightly / weekly |
| `agentFarm.modelPolicy` | [] | Rule-based model routing (source/agent/promptMatch → model) |
| `agentFarm.quotaDowngradePercent` | 0 | Factory tasks drop to a cheap model when the window exceeds this % |
| `agentFarm.quotaDowngradeModel` | haiku | The model forced on quota downgrade |
| `agentFarm.cliProfiles` | [] | Alternative CLI runners ({prompt}/{args} templates) |
| `agentFarm.relayFeeds` | [] | Remote-machine live relay files ({name, file}) |
| `agentFarm.packGalleryRepos` | [] | Agentpack gallery sources (git URL / local folder) |
| `agentFarm.digestTtsModel` | empty | fal.ai TTS model id for the voice briefing |
| `agentFarm.digestTtsFolder` | empty | The folder the briefing mp3 drops into (empty = autoReportFolder) |

## Commands

All in the command palette with the `Agent Farm:` prefix:

- **Open Dashboard** — the overview board
- **Open Guide** — this document
- **Refresh** — re-scan agents and sessions
- **New Agent** — a new agent scaffold from a template (CLAUDE.md + memory + .claude)
- **Add Agent Root Folder** — add a new root folder
- **Start Claude Session / Continue Latest Session** — opens a terminal in the agent folder and starts `claude`
- **Open Agent in New Window / Reveal in File Explorer**
- **Open Live Timeline** — swim-lane view (live observation)
- **Install Live Hooks / Remove Live Hooks** — install/remove the live-observation hooks
- **Add Task / Add Scheduled Task** — the task queue and scheduling
- **Add Trigger** — an event trigger (watch/hook/webhook); ▶ on a trigger row = fire by hand
- **Open Task History** — monthly task history records
- **Set Secret… / Delete Secret… / List Secrets** — the secret vault
- **Add MCP Server… / Remove MCP Server** — MCP inventory (from the MCP section in the Agents tree)
- **Add Skill… / Remove Skill** — skill inventory (from the Skills section in the Agents tree; scaffolds a SKILL.md / deletes with a backup)
- **Copy Skill to Agent… / Move Skill Between Agent/User Scope… / Reveal Skill Folder** — skill fleet management (right-click)
- **Edit MCP Server… / Disable MCP Server / Enable MCP Server / Copy MCP Server to Agent…** — MCP management (right-click)
- **Open Capability Matrix (Skills × MCP × Agents)** — the fleet's capability grid, usage density and one-click copy
- **Copy Webhook URL** — the secret address of a webhook trigger
- **Open Media Gallery** — produced media (preview + Re-run/Vary)
- **New Recipe Workflow…** — ready-made factory templates
- **New Multi-Agent Workflow… / Run Workflow** — multi-agent chains
- **Edit Step… / Add Step / Rename Workflow** — editing an installed chain
- **Missions / New Mission…** — dynamic orchestration: a lead agent plans round by round and delegates to a team (see [Missions](#missions))
- **Save as Template / New Task from Template** — task templates
- **Open Task Output** — the headless task output archive
- **Export as Windows Scheduled Task…** — scheduling independent of VS Code
- **Sync Shared Memory… / Apply Merged Memory** — duplicate-memory sync and manual merge
- **Export Fleet Report (Markdown)** — comparative fleet report
- **Export Task Outputs Digest (Markdown)** — a bundled digest of headless outputs
- **Quick Start** — opens the getting-started section of this guide
- **Add Standing Duty / Add Duty from Template… / Edit Duty… / Copy Duty to Agent… / Automate Duty… / Move Duty Up-Down / Open DUTIES.md** — standing-duty management
- **New Memory File… / Archive Memory File / Copy Memory File to Agent… / Fix Memory Index… / Scan Memory Contradictions…** — memory management (frontmatter scaffold + automatic index row / backed-up archiving / one-click index repair / cheap-model contradiction scan)
- **Open Memory Graph** — the memory's [[wikilink]] fabric: hubs, islands, broken targets, recall coloring
- **Search Transcripts…** — text/regex search across all session logs
- **Sample Output Quality Now** — manual sampling for the quality scorecard (cheap model)
- **Scan for Instruction Suggestions… / Review Instruction Suggestions…** — a CLAUDE.md rule suggestion from correction patterns and approved application
- **Generate Weekly Summary Now** — a three-sentence smart fleet summary (cheap model)
- **Send Daily Digest Now** — send the daily digest card to the webhook/notification
- **Export Agent Pack… / Import Agent Pack…** — move/share an agent with a single file (memory and secrets excluded)
- **Sync Agent with Antigravity…** — AGENTS.md + workflow generation and two-way diff sync
- **Natural Language Command…** — approved task/schedule/chain setup from a sentence (cheap model)
- **Test Dispatcher…** — show who the dispatcher would give a text to
- **Build Semantic Index** — build/refresh the session vector index for semantic search
- **Open Ultra Roadmap** — the research-based second-generation roadmap
- **Open Needs You (Approval Queue)** — everything that comes to you in a single urgency-sorted queue
- **Open Task Board (Kanban)** — a drag-and-drop task board + command bar
- **Cost Anomaly Report** — the median+MAD anomaly table and heavy-hitters report
- **Add Eval Case… / Run Eval Set… / Review Eval Cases…** — build and run a regression set from bad traces
- **Run Pulse Check Now** — a synthetic pulse to all agents (cheap model + cheap judge)
- **Trigger Reliability Report** — the trigger reliability table (fires, ✓/✗, latency)
- **Install / Remove Headless Service (Windows), Headless Service Status** — a local service that handles scheduling/watch triggers while VS Code is closed
- **Instruction History & Impact…** — CLAUDE.md version history + quality/cost correlation
- **A/B Instruction Experiment…** — race two instruction variants with the same prompts, apply the winner
- **Distill Memory File…** — a cheap-model condensation draft for a bloated/stale memory file (diff + approval)
- **Ask Fleet Memory… (Semantic)** — "what does the fleet know about this?" — semantic search in memory files
- **Run Parallel Worktrees… / Worktree Runs…** — conflict-free parallel code runs + merge/discard management
- **Export Traces (OpenTelemetry JSON)…** — sessions out as OTLP spans
- **Browse Agent Pack Gallery…** — import from a git/folder-sourced pack gallery
- **Speak Daily Briefing (TTS)** — voice the daily digest to mp3 with fal.ai TTS
- **Save Relay Script for Another Machine…** — the remote-machine live relay script

## Data and Privacy

- **No telemetry.** The extension collects no data and reports nowhere.
- **It makes no network request on its own.** The only things that go to the network are the ones you configured: media production (with your fal.ai key), webhook forwarding (your URLs) and the `claude` runs you started. The live event listener binds only to `127.0.0.1`.
- **Secrets** live in the OS keychain (SecretStorage) — not written to files, not included in agent packs.
- Claude Code already keeps the session logs; Agent Farm only reads them. The places it writes are always with your approval and are known: a new agent scaffold, hook installation (backed up), DUTIES.md, report/pack files.
- Agent-matching rule: if a session's working directory (`cwd`) is under an agent folder, it's counted to that agent. Projects outside the roots are out of scope by default.

## FAQ

**My agent isn't in the list.** Is there a `CLAUDE.md` (or `.claude` / `memory/`) in its folder? Check the **Agent folders** section of Farm Settings: is its root listed, is the folder excluded there, is the root flagged missing/duplicate? Then **Refresh**.

**A folder shows up as an agent but isn't one.** Open Farm Settings → **Agent folders** and click **Exclude** on it. Note that a root whose subfolders are agents never appears as an agent itself — its `CLAUDE.md` is treated as shared instructions (a nest).

**Costs show 0.** The model may not have matched any pricing rule — look at the warning at the bottom of the Dashboard and add a rule to `agentFarm.pricing`.

**"ACTIVE" never lights up.** Activeness looks at the transcript file's last-modified time. If the session runs on another machine/directory, it isn't visible. You can widen the threshold with `activeThresholdSeconds`.

**The numbers aren't exactly the same as ccusage.** Rounding and window-definition differences are normal; the big picture is the same.

**What are the subagent (sub-badged) sessions?** The main session's side jobs (sidechain). Their costs show as a separate row so you can see where the tokens went.

**The timeline is empty, it says "No live events yet".** Three possible reasons: (1) hooks weren't installed — run **Install Live Hooks**; (2) hooks were installed but the open claude sessions weren't restarted; (3) the listener port is held by another window — look at the status in the title.

**What's the difference between Live Feed and Timeline?** Both show live events; the Feed as a list in the side panel, the Timeline on a time axis with lanes. Without hooks, the Feed falls back to events derived from session logs (with a few seconds' lag).

**The scheduled task didn't run at its time.** Was VS Code open at that time? The scheduler only works while VS Code is open. Also, the double quotes inside your prompt are turned into single quotes — for command-line safety.

**The task is done but shows "running".** The terminal may still be open; close the terminal or mark it complete by hand with ✓. If shell integration is on (the VS Code default) it's marked automatically when the command finishes.

**I picked the wrong source in sync.** A timestamped `.afbak` backup sits next to each overwritten file — copy the content back.

**A workflow step got stuck / the chain isn't advancing.** The next one doesn't start until a step is "done". On an interactive step you have to close the terminal; on a headless step it waits for the `claude` exit code. If the chain stopped with failed, the notification says which step it was; fix the task and re-run the workflow.

**A headless task didn't start / failed instantly.** Is `claude` on PATH? Open the output file (Open Task Output) — the spawn error and stderr show there.

**My runIf never matches.** The pattern is tested case-insensitively against the previous step's **output file content**. Since there's no previous output on the first step, don't put a runIf on the first step (the wizard doesn't ask anyway). Since interactive steps' output isn't archived, the next step's runIf won't match — use headless in conditional chains.

**Does the budget notification come again and again?** No — once a day per agent. In Insights the state shows continuously.

**The agent isn't looking at its standing duties.** Two conditions: (1) there must be a DUTIES.md reference in CLAUDE.md (Insights warns, the add wizard suggests it); (2) the agent must have an open session — standing duties work while the agent runs. If it still lapses with a session open, strengthen the directive in CLAUDE.md (like "report the DUTIES.md check at the end of every turn").

**I edited DUTIES.md by hand, will the panel break?** No — as long as you preserve the format lines (`## Title [cadence]`, `- **Watch:**`, `- **Do:**`) the panel recognizes everything you add by hand and preserves it across rewrites.

## Roadmap

Completed phases (all 2026-07-08):

- ~~**Phase 2 — Live observation**~~ ✅ 0.2.0 · ~~**Phase 3 — Coordination**~~ ✅ 0.3.0 · ~~**Phase 4 — Automation**~~ ✅ 0.4.0 · ~~**Phase 5 — Intelligence**~~ ✅ 0.5.0 · ~~**Phase 6 — Duties**~~ ✅ 0.6.0 · ~~**Phase 7 — Polish**~~ ✅ 0.7.x (+ a real test campaign)

**What comes next lives in a separate, detailed document:** from the command palette, **Agent Farm: Open Development Plan** — the far-sighted development plan: event triggers, verify steps, the MCP panel, the n8n/webhook bridge, the multimedia production pipeline (a content factory with Kling/Seedance/Nano Banana-class models), smart oversight, multiple machines and the visionary horizon. Coding follows the priority order in that plan.

## Release Notes

### 2.21.0 — Task Forecast & Digest Results, Wave 4 (2026-07-11)

- **Task Forecast:** the next 7 days' scheduled runs + queue + running, with 30d median duration/success per run; estimated agent-time. The calendar icon in the Tasks header. See [Task Forecast](#task-forecast).
- **Task results in the daily digest:** a "Finished today: X✓ Y✗ — errors: …" row in the daily digest card.
- The dollar-cost estimate was deliberately deferred (per-task token cost isn't tracked); the forecast predicts duration/success. **The Tasks roadmap (Waves 1-4) is complete.**

### 2.20.0 — Parallel Steps & Fan-in, Wave 3b (2026-07-11)

- **Parallel step groups:** consecutive `parallel` steps start at once (fan-out), and when all finish their outputs merge into a single handoff for the next step (fan-in). Each branch has its own runIf; on a group error the first step's onFail. Fully backward compatible with the linear engine (unflagged steps are as they are today). See [Parallel Steps](#parallel-steps). Wave 3 (DAG orchestration) is complete.

### 2.19.0 — Workflow Approval Step, Wave 3a (2026-07-11)

- **Approval gate (human gate):** an approval step in the workflow chain — the chain stops at that step, waiting for approval in the Needs You panel/with a notification. Approve → the previous output passes as is; Reject → onFail. No agent/model. See [Approval Step](#approval-step). (The first half of Wave 3; parallel step/fan-in is a separate wave.)

### 2.18.0 — Task Lifecycle Ergonomics, Wave 2 (2026-07-11)

Managing delegated work dropped to one click ([Rerun and Priority](#rerun-and-priority)):

- **Retry / Retry with edited prompt:** requeue a finished task as a fresh copy (with an optional prompt fix).
- **Resume workflow from this step:** continue a failed workflow chain from where it left off, re-feeding the previous step's output — no running from scratch.
- **Run Next + priority/aging:** move a waiting task to the front of the queue; the queue sorts by priority, and waiting tasks gain priority as they age (starvation prevention).
- **Dedup protection:** if the exact same prompt for the same agent is already queued, Add Task warns.

### 2.17.0 — Task Health & Analytics, Wave 1 (2026-07-11)

The "at a glance + health" maturity of Skills/MCP/memory came to the task system. Source: the live task list + the `task-history` archive combined ([Task Health](#gorev-sagligi)).

- **"Task health" card on the Agent Detail:** a 30-day scorecard — runs (✓/✗/cancelled), success percentage, median duration, retry/verify, source breakdown, media cost, live queue; a red warning + last failed task on consecutive failures.
- **Tasks grid in the Capability Matrix:** task families × agents (retry/date noise normalized); a green cell = all successful, red = all failed, orange ring = mixed; source label (`man/sch/trg/wf`); click → task history.
- **Insights `task` warnings:** an agent whose success rate drops below 50% (≥5 runs) and a task family whose recent runs are all FAILED drop a warning.

### 2.16.0 — Memory & Duty Management Wave 3: Unified Intelligence (2026-07-11)

- **Two new matrices in the Capability Matrix:** *Memory files × Agents* (recall density + a **divergence ring** — orange if a copy drifted from the newest version; indexed copy via ＋) and *Duties × Agents* (cadence/⏸ cells, duty copy via ＋). The fleet's entire knowledge and duty fabric on one screen.
- **"Context health" card on the Agent Detail:** memory (file/token/orphan/unrecalled/stale), skills and MCP usage summaries, duty compliance (last DUTIES.md read + weekly session count) — a single card for "what state is this agent's mind in". A **Recalls 30d** column and orphan flag were added to the Memory files table.
- **Scan Memory Contradictions…:** a contradiction scan between memory files with a cheap model; a markdown report. See [Memory Management](#hafiza-yonetimi).
- **Frontmatter audit:** memory files with no description in Insights.

### 2.15.0 — Memory & Duty Management Wave 2 (2026-07-11)

- **Memory Graph panel:** the `[[wikilink]]` fabric of memory records — node size is token, green = recalled, yellow ring = not in the index; broken links / islands / hubs cards; click a node → the file. Detail: [Memory Graph](#hafiza-grafigi).
- **Fix Memory Index…:** add pointers for orphan files + drop dead index rows — selective, backed up, one command.
- **Copy Memory File to Agent…:** the file + the target MEMORY.md pointer together.
- **Add Duty from Template…:** 4 proven duty patterns (question-answer loop, inbox triage, weekly memory maintenance, output duty).
- **Automate Duty…:** a one-click watch trigger from a watched duty — fires even while the agent is idle; the duty stays in place.
- **Copy Duty to Agent… / Move Duty Up-Down:** multiply duties across the fleet, edit the DUTIES.md order from the panel.

### 2.14.0 — Memory & Duty Management Wave 1 (2026-07-11)

The "see at a glance + manage in one click" maturity that came to Skills/MCP was carried to memory and duties:

- **Memory recall tracking:** the Memory section is now `N files • ~X tok • M recalled (30d)`; each file has a real recall count/time (`recalled ×5, last 2h` / `not recalled (30d)`), green = in use. Recall = the agent explicitly opening the file with a tool (from session logs). Detail: [Memory Management](#hafiza-yonetimi).
- **Orphan flag:** a file with no reference in MEMORY.md shows `⚠ orphan`; frontmatter type/description in the tooltip.
- **New Memory File… / Archive Memory File:** frontmatter scaffold + automatic index row; archiving moves to `memory/archive/` and drops the index row with a backup.
- **Edit Duty…:** edit a standing duty in a pre-filled wizard (title/cadence/watch/do/note) — no need to open DUTIES.md by hand.
- **Watch preview:** the `3 waiting` tooltip now shows the waiting file names and the age of the oldest.
- **Session viewer default:** `maxTranscriptMessages` 400 → **1500**.
- **Also (2.13.1–2.13.2):** the timeline session-start marker turned blue; the "Loading…" hang on some session pages was fixed (sessions with `</script>` in the transcript broke the inline script — the injection is now escaped).

### 2.13.0 — Depth in Capability Management + Long Time Ranges (2026-07-10)

**Skills & MCP management — see at a glance, manage in one click:**

- **Capability Matrix panel** (new): Skills × Agents and MCP × Agents grids; 30-day usage density, summary chips, dead-capability markers and one-click copy from an empty cell. See [Capability Matrix](#yetenek-matrisi).
- **At-a-glance status in the tree:** MCP/Skills section headers are now `N • M used (30d)` (+ `K disabled` for MCP); last-use time on rows; most-called-tool breakdown in the MCP tooltip.
- **MCP management (right-click):** Edit MCP Server… (edit in place, backed up), Disable/Enable MCP Server (the agent's `disabledMcpjsonServers` list), Copy MCP Server to Agent…
- **Skill management (right-click):** Copy Skill to Agent…, Move Skill Between Agent/User Scope…, Reveal Skill Folder.
- **Health findings:** a warning for a SKILL.md with no description + info for an unused agent-scope skill.

**Long time ranges:**

- **Live Timeline** now offers **8h** detail + **24h / 3d / 7d / 30d** density views. In the density view each lane is split into time buckets and drawn with activity bars (tools/commands/permission waits). Since events are written to `globalStorage/live-events.jsonl`, a **reload doesn't reset the timeline**; 24 hours in memory, 31 days on disk (64MB ceiling). Why 31 days: hook events don't carry patterns at a longer scale; the Dashboard is the right tool for the long view.
- **Dashboard** cost range gained **180d and 365d**; beyond 120 days the daily bars are grouped weekly to stay readable. No extra load — the data is already in the session logs.

### 2.12.0 — Skill Management (2026-07-10)

- **Skills section in the Agents tree:** under each agent next to MCP — a SKILL.md inventory from the same folders Claude Code reads (`.claude/skills/` agent scope + `~/.claude/skills/` user scope, agent shadows); name, scope, description (tooltip) and the **real call count over the last 30 days** (the model's `Skill` tool calls + your `/command` calls counted from session logs; a green spark = in use). Click → SKILL.md opens. Detail: [Skill Management](#skill-yonetimi).
- **Add Skill… / Remove Skill:** the **+** in the section asks for name + description, scaffolds and opens the `.claude/skills/<name>/SKILL.md`; the trash icon deletes the folder (a one-time backup under `.claude/skills.afbak/`; a "all agents will lose it" warning in the modal when deleting a user-scope skill).

### 2.11.0 — ↑ Jump Fix, Model-Based Context Ceiling, Stamped Export (2026-07-10)

- **↑ arrow fixed:** the ↑ in the turn band (and clicking a turn above in the Turn breakdown table) did nothing. Why: since the bands are sticky (`position: sticky`), every passed band tells the browser "I'm already at the top of the screen", so `scrollIntoView` didn't budge. The jump now anchors on the turn's first message and scrolls, leaving room for the band height — both directions work.
- **Context now ceiling by model:** the fixed 200K assumption is gone. The ceiling is found from the session's model (Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 and older → 200K); with no model in the table, no percentage/color, only the raw context size. The `agentFarm.contextWindowTokens` default is now **0 = auto**.
- **Timestamp in the Export MD filename:** `session-<id>-YYYY-MM-DD_HHMMSS.md` (local time) — repeated exports within the same day don't suggest the same name.

### 2.10.0 — Terminal Rendering Remedies (2026-07-10)

- **Terminal Rendering Fix… command:** one stop for those who have ghost gaps / line loss — shows the current setting state; the render fix (`gpuAcceleration: off` + `smoothScrolling: off`), disabling persistent sessions, return to default, and a shortcut to all terminal settings.
- **`agentFarm.externalTerminal`:** Start/Continue/Resume sessions open in Windows Terminal (or cmd if absent) — long claude sessions never enter xterm.js. Farm tasks stay in the integrated terminal for tracking. Detail: [Terminal Rendering Health](#terminal-rendering-health).

### 2.9.0 — Export Selection Conveniences, Turn Navigation, Focus Audit (2026-07-10)

The response to the immediate feedback on 2.8.0 ("bulk selection and navigation should come unasked"):

- **Export selection from everywhere:** a per-turn checkbox in the Turn breakdown table (the `md` column) — **live-synced with the band checkboxes**; an **only** (just this turn) on the row, **All / None / Invert** bulk buttons on top; a `12/37 in export` counter in the header and on the Export MD button.
- **Turn navigation:** **↑ ↓** in every band — jump to the previous/next turn without scrolling (the band is sticky, the arrows are always visible).
- **Export MD remembers the last saved folder;** the next save dialog opens there.
- **Focus-loss audit (whole extension):** a balanced-bracket scan found 38 QuickPick/InputBox steps **silently closing** on window focus loss — killing the flow mid-wizard with no message (the most likely cause of the "the agent question never came" experience). All 38 were fixed. Also a cross-check: every defined command is registered, every menu reference valid, every right-click `when` condition matches a real tree state.
- **Add Trigger's agent question clarified:** "Which agent runs this task when the trigger fires?" + a setup confirmation that says the target ("armed — runs on psychologist…"). The workflow wizard's "Run now" now runs exactly the newly set-up chain.

### 2.8.0 — Turn Bands, MD Export, Wizard and Trigger Fixes (2026-07-10)

The third feedback round:

- **Prominent turn bands:** the faint `Turn n/m` line became a full-width **colored and sticky** band — an accent-colored edge, a bold turn number, a command summary, tokens/cost. While scrolling, the active turn's band stays pinned at the top.
- **⬇ Export MD:** the viewer's **current view** goes to a Markdown file — the Show chips (only Dialog, only Tool calls…), the text filter and the replay position are applied exactly. Turns are included/excluded individually with the checkbox in each turn band. The session id, totals and filter summary are written at the top of the file; the file opens in the editor after saving.
- **Workflow wizard fixed:** `✓ Finish & save workflow` is now at the **top** of the step picker; pressing Esc with a step present now asks **Save / Discard** instead of silently trashing the wizard (this was the root of the "I can't create a workflow" complaint); cancelling mid-step cancels only that step. The "Stop workflow" label in the step question was clarified: "If this step fails: stop the workflow" — this is a failure-state choice, it doesn't finish the wizard.
- **Per-trigger timing:** the last step of the Add Trigger wizard is **Default timing / Customize timing…** — debounce, cooldown and hourly cap are now set per trigger. On an installed trigger, right-click → **Edit Trigger**: name, prompt, target agent and the three timing fields are edited from the panel; no need to open `farm-tasks.json` by hand.
- **Trigger action clarified:** the distinction between "Run a task **on an agent you pick**" (you pick the agent in the next step) and "Dispatch — route to the best agent **automatically**" (no agent picking by design; rule + classifier route it) is in the label; the agent picker no longer closes silently on window focus loss.

### 2.7.0 — Session Viewer Polish (2026-07-10)

The second feedback round — all about the session-review experience:

- **Resume from any session:** ⏵ / right-click on a session row → **Resume Session in Terminal** (`claude --resume <id>`); **⏵ Resume** at the top-right of the Session Viewer. Continue Latest is no longer the only option.
- **Turn breakdown table:** all turns in one table (no, command summary, tokens, cost); click a row → jump to the turn. Turn accounting fixed: thinking-only assistant steps' tokens are now written to their turn — turn totals match the session total exactly (most of it wasn't visible before).
- **Show filter:** All / Dialog / User / Assistant / Tool calls / Results / Errors chips; filters both the static view and the replay stream. "Dialog" = only you + assistant.
- **✕ Exit in the replay bar** — no more scrolling up to exit.
- **Session names humanized:** `<command-name>…` blocks, `/commands` and `!` lines aren't titles; the title comes from the first real sentence (the new array-content transcript format is supported too). In turn labels, commands show with a short name like `/clear`.
- **Rename Session…:** give a session a permanent custom name; leave it blank → the automatic title comes back.
- The word "Kılavuz" (guide) was cleaned from the UI (the UI language is English).

### 2.6.0 — Observability Polish (2026-07-10)

The first real user-feedback round. Four requests, four features:

- **Per-turn token breakdown:** in the session viewer, every user command opens a turn separator — `Turn 3/12 · 45.2K tok · $0.31`. Which turn the session total was spent in is now visible. The tokens of assistant steps that only call a tool (no text) are no longer lost: shown on the first tool row.
- **Context now indicator:** the last request's context size and its `contextWindowTokens` percentage; yellow + a `/compact` suggestion at 70%, red at 90%. The viewer refreshes itself **live** as the session log changes; the Recent Sessions tooltip also has a `Context now: ~181.9K tokens` row.
- **Sticky replay bar:** the replay controls no longer scroll away with the messages — the bar pins to the top of the screen, Pause/speed always within reach.
- **Token lap counter:** the `Reset Token Lap` command starts a second counter like a stopwatch lap / a daily trip meter; `⏱ 84.2K` in the status bar, detail and reset links in the tooltip. `Clear Token Lap` removes it. (Fed from the last 48-hour window.)
- Also: a "if a section is missing" note in Quick Start (VS Code remembering hidden views).

### 2.5.0 — Scale and Ecosystem / Ultra Phase J (2026-07-09) — ULTRA PLAN COMPLETE

- **Parallel worktree runs (J1):** `Run Parallel Worktrees…` runs each prompt in its own git worktree (af/ branches); `Worktree Runs…` with diffstat + Merge/Open/Discard; old-git-version fallback
- **Live relay (J2):** on a remote machine `farmRelay.js` writes transcript events to a sync file; `agentFarm.relayFeeds` streams that file into the live monitor — the remote agent shows WORKING
- **OpenTelemetry export (J3):** sessions (subagent tree as parent-child spans) as OTLP/JSON — can be fed to Langfuse/Tempo
- **Agentpack gallery (J4):** `packGalleryRepos` (git/folder) → `Browse Agent Pack Gallery…` → the safe import flow
- **Multi-CLI (J5):** gemini/codex tasks with `cliProfiles` ({prompt}/{args} templates); deep observation stays Claude-specific
- **Voice briefing (J6):** `Speak Daily Briefing (TTS)` — the daily summary to your phone/vault as mp3 with fal.ai TTS

### 2.4.0 — Intelligence Depth / Ultra Phase I (2026-07-09)

- **Instruction versioning (I1):** every CLAUDE.md change into history with its content; `Instruction History & Impact…` a per-version session/quality/cost correlation table ("quality ▲0.6 after this rule")
- **A/B instruction experiment (I2):** two variants run in isolated sandboxes with the same prompts (eval cases become the prompt set automatically), a judge compares in random order; if B wins, one-click permanent (.afbak + history)
- **Memory distillation (I3):** a cheap-model condensation draft for bloated/stale memory files → diff → approved application; limit-message/frontmatter-loss guards
- **Semantic memory query (I4):** `Ask Fleet Memory…` — meaning-based search in memory/*.md files, per-agent results (an incremental index separate from the transcript index)
- **Model policy (I5):** source/agent/prompt-based model routing with `agentFarm.modelPolicy` rules + automatic cheap-downgrade when the window fills with `quotaDowngradePercent`; the decision is written to the output header

### 2.3.0 — Security and Reliability / Ultra Phase H (2026-07-09)

- **Guardrail auditor (H1):** permission rules audited automatically — bypass mode, dangerous patterns (`rm -rf`, `curl|sh`, force push…), overly broad rules (`Bash(*)`), wildcard rules unused for 30 days, duplicates; findings in Insights, click = the config file
- **Trigger scorecard (H2):** `fired 12× • 7d: 9✓/1✗ • start ~4s` on the trigger row; `Trigger Reliability Report` table; "always fails" and "never fired" warnings
- **Pulse check (H3):** a fixed cheap prompt per agent + an identity-consistency judge; `agentFarm.pulse` nightly/weekly or by hand; FAIL → Insights ⛔
- **Headless service (H4):** a local node service that handles scheduling + watch triggers while VS Code is closed (schtasks, logon); conflict-free handover via heartbeat; outputs to the same archive, a "ran N tasks while you were away" notification

### 2.2.0 — Command Center / Ultra Phase G (2026-07-09)

- **Approval queue (G1):** the "Needs You" panel — permission waiters, browser approvals (Run/Reject from the queue), stalled, budget overrun, Antigravity conflict, instruction suggestions, parked tasks in a single urgency-sorted list; the status-bar badge now counts the queue and opens it on click
- **Kanban board (G5):** Inbox/Parked/Running/Needs Approval/Done columns, drag-and-drop transitions, card badges, a natural-language command bar on top
- **Cost anomaly (G2):** a 14-day median+MAD detector (budget-independent, no model call) + `Cost Anomaly Report` (heavy hitters: sessions that eat 50% of tokens)
- **Eval set (G3):** low-scoring/verify-FAIL traces into a regression case in one step; an approved run + a "12/14 passed, 2 regressed" scorecard
- **Session replay (G4):** ▶ Replay in the viewer — step-by-step playback with real intervals, 1x-8x speed, error/prompt jumping
- **Subagent tree (G6):** session lists became a tree; a ⧉ cost rollup on the parent row (5 levels)

### 2.1.0 — Semantic Search + Browser Steps + Ultra Roadmap (2026-07-09)

- **Semantic search (D4 done):** a "semantic" mode in the search panel — meaning-based query; Gemini API or an OpenAI-compatible endpoint (can be fully local with Ollama); a file-based incremental vector index, the `Build Semantic Index` command, similarity badges
- **Browser steps (F3 done):** a Browser step in the chain — the agent runs with its own browser MCP; the domain allowlist is non-negotiable (an uncovered URL never runs), a modal per-step approval by default; onFail rules apply
- **ULTRA Development Plan:** an internet-research-based second-generation roadmap (Phases G/H/I/J — approval queue, cost anomaly, eval set, kanban board, guardrail auditor…) — the `Open Ultra Roadmap` command
- Tests: 20 checks — the full semantic pipeline with a fake embedding server (OpenAI+Gemini schemas), incrementality/persistence/prune, allowlist and prompt guards

### 2.0.0 — Natural Language Command and Dispatcher / Plan Phase F core (2026-07-09)

- **🚀 Natural Language Command:** a single sentence → a cheap model → a validated plan (task/schedule/chain) → a human-readable preview → approved setup; only real agent names are accepted, expressions like "tomorrow" resolved to the current date
- **Dispatcher:** the "Dispatch" trigger action — routes incoming work by rules (regex→agent), and if none match a cheap model picks from CLAUDE.md role summaries; try without setting up with `Test Dispatcher…`
- Phase F status: F1+F2 done in code; F3 (browser automation) can be set up today with a browser MCP + the MCP panel (a dedicated step type deferred); F4 (voice loop) is met by the existing Whisper recipe + inbox trigger (S20); F5 (multi-CLI) deferred at low priority
- Tests: 16 checks — plan validation/preview, rule routing; with real haiku, the "tomorrow 09:00" time computation, the order of a 2-step chain, and the classifier picking the right agent

### 1.3.0 — Antigravity Compatibility (2026-07-09)

- **Sync Agent with Antigravity…:** CLAUDE.md → AGENTS.md generation (sync-marked), active duties → `.agents/workflows/` slash commands, a merge suggestion for `.mcp.json` → the global gemini configuration; `memory/` untouched (both tools read plain markdown)
- **Directional sync:** which side moved ahead is detected via fingerprint tracking — Claude→Antigravity refresh, Antigravity→Claude carry-back (backed up), Diff/direction choice on conflict; hand-edited files preserved
- **Insights:** the `antigravity` category — an info reminder if one side moved ahead, a warning if both changed
- Tests: 27 checks — conversion/reconversion, the full lifecycle (none→in-sync→ahead→conflict→resolution), foreign-file protection, zero noise

### 1.2.0 — Scale and Portability / Plan Phase E (2026-07-09)

- **Multiple machines:** other machines' synced `.claude` folders in the same panel with `extraClaudeDirs`; a ⇄ machine badge on sessions, agent matching by cwd, a missing-sync warning
- **Daily digest card:** a phone-friendly, model-call-free daily scorecard — to the webhook (the `digest` event) with the `dailyDigest` time or by hand
- **Agent packs:** `.agentpack` export/import — identity+duties+tools+workflow/trigger/schedule in a single file; memory and secrets never enter the pack, credential-smelling files skipped automatically, imported triggers/schedules come in off
- **Publishing prep:** LICENSE (MIT), CHANGELOG.md, a README privacy statement + publishing steps — the Marketplace decision is yours
- Tests: 26 checks — pack roundtrip/secret exclusion/path escaping/rebinding, digest contents, multi-machine scanning with real files

### 1.1.0 — Smart Oversight / Plan Phase D (2026-07-09)

- **Quality Scorecard:** a cheap-model judge scores recent sessions 1-5; a Quality column in the Dashboard and fleet report; downtrend and low-average warnings in Insights
- **Instruction Suggestions:** a CLAUDE.md rule suggestion from repeated corrections in follow-up messages; a 💡 in Insights, one-click approved application (a `## Learned rules` section)
- **Weekly Smart Summary:** a three-sentence human-language summary of the budget-trend-error-quality headlines; a notification + a vault file + a webhook (the `summary` event)
- **Transcript Search:** a text/regex search panel across all session logs (agent filter, highlighted context, jump to session)
- Automatic loops off by default (`qualitySample`, `suggestScan`, `weeklySummary`) — manual commands always on; internal calls always a cheap model
- Tests: 28 checks — quality sampling/trend, the suggestion engine (dedupe + adding to CLAUDE.md), search (regex/filter/limit), summary; end to end with real haiku calls

### 1.0.0 — Content Factory / Plan Phase C (2026-07-09)

- **🎬 Media steps:** image/video/audio production with the fal.ai queue API inside the chain; assets download to the archive, the response hands off to the next step; keyless/creditless states caught with a clear error
- **Media Gallery:** a preview panel (image/video/audio), model+input+cost+origin info, Re-run and Vary
- **Media cost:** a rule-based estimate, a gallery total and a Dashboard "Media cost" card — text+media on one scorecard
- **Recipes:** Text→Image, Text→Image→Video, Audio→Text ready templates
- **API key guide:** a step-by-step "how to add a key" in the Secret Vault section + three golden rules
- Tests: the full pipeline with a fake fal server (download/meta/cost/handoff) + the real fal.ai credential-error path (key recognized, balance error caught gracefully)

### 0.9.0 — Bridge to the Outside World / Plan Phase B (2026-07-09)

- **MCP Management:** a per-agent server inventory (with real 30-day usage counts), add/remove from the panel, an unused-server audit
- **Secret Vault:** keys in the OS keychain; env injection into tasks + the `{secret:NAME}` template; a plaintext-key warning
- **Webhook Bridge:** a 🌐 webhook step (the response hands off to the chain), a `/trigger/<token>` inbound endpoint (the `{payload}` variable), two-way integration with n8n/Make/Zapier
- **Notification Forwarding:** permission/stall/budget/chain events with a selectable filter, POSTed as JSON to a webhook — the fleet in your pocket
- All tested with real HTTP mechanics (a local server + the real listener; fleet MCP usage verified from real transcripts: obsidian=394 calls/30d)

### 0.8.0 — Automation Core / Plan Phase A (2026-07-09)

- **Triggers:** watch (on file/folder change) and hook (on live event) triggers → a task or workflow; debounce/cooldown/hourly-cap storm guards; the `{watch}` variable; the ⚡ Triggers section in Tasks
- **Verify steps:** a cheap-model judge (PASS/FAIL) + a reasoned automatic retry; the verdict written to the archive; `verify pass/fail` badges
- **Structured handoff:** a JSON output contract, the `{prev_text}` and `{prev_json.field}` variables, `json:field~regex` conditions; a parser tolerant of fenced/embedded JSON (a lesson caught by real testing)
- **Concurrency + quota guard:** task caps, "deferred" holding and an automatic pump; deferring automatic jobs at the 5h window fullness threshold
- **Task history:** a monthly JSONL archive (Open Task History), an output-folder size ceiling
- The exit criterion was proven by a real test: a file dropped into the inbox completed the trigger→chain→judge approval→archive loop with no manual touch

### 0.7.2 — Real Test Campaign (2026-07-08)

- **All 11 scenarios tested with real runs** (13 haiku sessions, $0.17) — a test note was added to each scenario in the Example Usages document
- **Fix (runIf):** the condition now only looks at the model's output — previously the workflow name/prompt text in the archive header could accidentally trigger the condition (a bug caught by real testing)
- **Fix (stdin):** claude's 3-second stdin wait in headless tasks and the "no stdin data" warning leaking into archives were fixed — faster tasks, clean outputs

### 0.7.1 — Examples and Cheap Automation (2026-07-08)

- **Example Usages document:** 11 step-by-step operational scenarios (`Agent Farm: Open Examples`); critical flows tested with real haiku runs
- **`agentFarm.taskExtraArgs`:** add a CLI argument to task/workflow commands — the key to running routine automation cheaply with `--model haiku`
- The guide panel now supports more than one document
- A `deneme` practice agent in the agent root (set up during tests; a practice ground for the scenarios — deletable if you want)

### 0.7.0 — Polish (2026-07-08)

- **Workflow editor:** edit a step (title/prompt/agent/mode/on-fail/run-if), reorder, add, delete; rename a workflow — delete-and-rebuild is history
- **Chains in the Timeline:** a Workflow runs section — each run in its own strip, numbered step blocks, status colors
- **Weekly trend alerts:** an Insights warning when the last 7 days reach `trendAlertFactor` times the previous 7 (agent + fleet)
- **Duty compliance:** `read 2h ago / never read` in the Duties header; a warning for an agent that had a session but never looked at DUTIES.md
- **Outputs in the automatic report:** the period's task output digest is added to the report (`autoReportIncludeOutputs`)
- **Extension icon:** Agent Farm now shows with its own face in the Extensions view

### 0.6.0 — Duties and Accessibility (2026-07-08)

- **Standing Duties:** continuity agreements with an agent in a single system — `DUTIES.md` (the agent reads + the panel manages), cadences (every-turn/session-start/daily/weekly/manual), Watch/Do fields, add-by-wizard, pause/delete, hand-editing preserved
- **Status at a glance:** the number of files piled up in the watched folder (`3 waiting`), the last change in a file, a lost-path warning — in the Agents tree and the agent detail table
- **CLAUDE.md integration:** an automatic directive with approval if there's no reference; Insights audits (reference-less DUTIES.md, lost watch path, a Do-less duty)
- **Turkish Quick Start:** the first-3-minutes tour, three core habits, a 14-item "what do you want to do?" recipe list, concepts in 30 seconds; the `Agent Farm: Quick Start` command

### 0.5.0 — Intelligence (2026-07-08)

- **Conditional branching:** per-step `runIf` (a regex condition on the previous output; the step is skipped if it doesn't match) and `onFail` (Stop / Continue / Jump to step N); a 25-execution loop guard
- **Budget alerts:** daily agent/fleet budgets with `agentFarm.budgets`; a warning at 80%, an error + a once-a-day notification on overrun; budget bars in the Dashboard
- **Merge draft:** open diverged memory copies in a single document, merge by hand, write to all with a backup via `Apply Merged Memory`
- **Task Outputs Digest:** a periodic bundled Markdown report of archived headless outputs

### 0.4.0 — Automation (2026-07-08)

- **Multi-Agent Workflows:** automatic step transitions in agent chains; handing the previous step's output to the next agent with `{prev_output}`; the chain stops on error
- **Headless output archive:** headless tasks run as a background process; output archived to Markdown with title+exit code+duration; Open Task Output
- **Task templates:** Save as Template / New Task from Template; agent-bound or free
- **Automatic fleet report:** daily/weekly, written by itself to a target folder (Obsidian vault)
- **Windows Task Scheduler export:** turns a scheduled task into a schtasks record that runs independently of VS Code (a script + a ready-to-paste command)

### 0.3.0 — Coordination (2026-07-08)

- **Tasks view:** a per-agent task queue; interactive/headless modes, start/reorder/complete/cancel, automatic done/failed via terminal tracking, optional auto-advance (`queueAutoAdvance`)
- **Scheduled tasks:** daily / weekly / one-time; triggered automatically while VS Code is open, with a notification
- **Sync Shared Memory:** find duplicate-memory groups, compare with diff, sync from a single source with a backup
- **Export Fleet Report:** a comparative Markdown scorecard (cache efficiency, error rate, context load…) — Obsidian-friendly
- An **Agent comparison** table was added to the Dashboard

### 0.2.0 — Live Observation (2026-07-08)

- **Live Timeline panel:** a lane per agent, tool-run blocks, event markers, a 15m/1h/4h window, a live "now" line
- **Hook listener:** a local HTTP listener on 127.0.0.1; 9 hook events (PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact)
- **Install/Remove Live Hooks:** a safe setup wizard that backs up and preserves existing settings
- **State machine:** WORKING / TOOL / PERMISSION? / YOUR TURN / STALLED / IDLE / ENDED
- **Notifications:** permission wait, stall (configurable threshold), optional turn end
- The Agents tree and status bar are fed by live state; the status bar turns yellow when an agent is waiting
- The Live Feed shows real-time hook events (falls back to the transcript when there are no hooks)

### 0.1.0 — First release (2026-07-08)

- Agents / Recent Sessions / Insights / Live Feed trees
- Dashboard: KPIs, per-agent daily cost, model distribution, token types, heatmap, the 5-hour window, most expensive sessions
- Agent Detail Page and Session Viewer
- An 8-rule health/optimization engine
- A cost engine (editable pricing rules, cache separation, double-count protection)
- New agent scaffold, session start/continue, status bar
- This guide
