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
| Have the agent work under Antigravity too | Right-click agent → `Sync Agent with the Other Engines…` ([details](#antigravity-uyumlulugu)) |
| Add conversation or turn to wiki candidate pool | `🔖` badge on transcript/Console row, or right-click → `Add to Wiki Candidates…` ([details](#wiki)) |
| Compile wiki candidates into the vault | Command palette → `Agent Farm: Compile Wiki Candidates…` ([details](#wiki)) |
| See, filter and compile the waiting wiki marks | The `📚 Wiki` button in any page's toolbar, or the command palette → `Agent Farm: Open Wiki` ([details](#wiki-kokpiti)) |
| Mirror the shared constitution to the other engines | Toolbox header → `⚖ Sync Constitution` (second row), or the palette → `Agent Farm: Sync Constitution` |
| Stop a session that comes straight back under a new id | Session card → `☠ Force kill`, or right-click → `Force Kill Session Tree` ([details](#spare-oturumlar)) |
| Turn every daily budget off without losing the figures | Settings → Cost & Budgets → `budgetsUnlimited`, or a figure of `0` in `budgets` |
| Inspect turns across all 5 engines | Beside Sessions table → `⤢ Open Turns page` ([details](#turlar-sayfasi)) |
| Copy full text directly from timeline | Right-click dot/tool on timeline → `Copy Corpus` ([details](#live-observation)) |

### Concepts (in 30 Seconds)

- **Agent** = a folder containing a `CLAUDE.md`. Agent Farm changes nothing, it only reads (with three exceptions it writes with your approval: a new agent scaffold, hook installation, a standing-duty file).
- **Cost** = the API-equivalent value of token usage; on a subscription it isn't a bill, it's a measure of yield.
- **Standing duty** = a continuity agreement with an agent ("watch here, do this when it changes") — it lives in `DUTIES.md`.
- **Task/Workflow** = jobs you start; unlike a standing duty, an agent isn't triggering itself inside a session, it's triggered from the queue.

### Filters — the same control everywhere {#filtreler}

Every filter in the extension follows one contract, so what you learn on one page is true on the next.

- **Pick any combination, not "all or one".** A filter drop-down is a **checkbox list**: tick two agents, three levels, four statuses — whatever subset you want. **Select all** / **Clear** sit above the list, and *Clear, then tick the two you care about* is the fast path when the list is long. The button states the pick — `Agents: all`, `Agents: dev`, `Agents: 2/7`, `Agents: none`.
- **All ticked means no filter.** So a value that appears later — a new agent, a new model — is included by itself, without your reopening the picker. **Nothing ticked** honestly matches nothing, and says so on the button.
- **The menu stays open while you tick.** The list behind it re-filters with every tick; the menu doesn't close under your hand.
- **Text and number boxes filter as you type.** A min/max bound, a "title contains…", a date — all apply a beat after you stop typing. No Enter, no clicking somewhere else, and the caret keeps its place.
- Sort boxes, grouping and settings stay single-choice, and editors (settings, pricing, forms) still save on commit rather than per keystroke — there, every keystroke would be a write.

Filters that scope a whole page (the Sessions tables' 🧑/🤖 origin, a production in the Media Gallery) stay one-of, because they are a drill-down and not a subset.

### ‼️ The form is the same control everywhere too — `AFForm` (3.91.0) {#form}

A page that **listed** an object and could not **make** one was this extension's longest-running structural contradiction: eight surfaces listed something they could not create, and the work fell to chains of VS Code boxes. The measurement says why willpower never fixed it: writing a form was a day's work per page, so nobody did, and the platform's own boxes won by default.

So the card is a **component** — `media/afForm.js`, its CSS in `common.css`, both shipped from `htmlShell` to **every page**. A component a page has to opt into is a component the next surface skips, which is exactly how eight of them ended up left behind.

- **A field declares the key it writes and the type it writes it as**, so `read()` hands back a typed draft and nothing lists its field ids twice.
- **`{redraw:true}`** marks the fields that change what *exists* — changing a transport redraws half the card instead of starting over.
- **The OS file picker stays**, as one button next to the box it fills: a folder chooser is the one thing a webview genuinely cannot draw, and typing `D:\zone\know\note\…` by hand is what the dialog chains were defending.
- **Cancel really cancels.** Esc in a chain of boxes left half the job written to a file; the card holds its draft and only Save writes.
- **A refusal shows inside the form**, not in a notification that closed the card.

The surfaces on the card today: tasks · schedules · triggers · templates · workflows · duties · toolbox (skill/subagent/command/MCP) · memory · living checks · the secret vault · the studio · an agent itself · evals. The rule for a new surface is one line: **whatever object the list shows, the card that makes it is on the same page.**

## Right-Click Everywhere {#sag-tik}

Every row in this extension is an **object**: a backlog item, a session, a task
run, a notice, a skill, an asset, a setting, an agent. Everything you can do to
one is in **that object's right-click menu**. A row's buttons do not replace it:
a button is "the thing done most often", the menu is "the thing that can be
done".

Three rules:

1. **The same object carries the same menu wherever it appears.** An agent gives
   the same sixteen items on the Dashboard, in Portfolio, on a Timeline lane, on
   its own page and in the memory graph.
2. **The menu does what the button does** — the same message, to the character.
   There are tests that prove it; they cannot drift apart.
3. **A row can be two things at once.** A Turns row is a *turn* and a *session*;
   a search hit is a *match* and a *session*; a Timeline lane label is a
   *session* and an *agent*; a Needs row is a *blocker* and — when it knows a
   transcript — a *session*. One right-click gives both.

**How you find it:** every row that has a menu carries the `— right-click for
more` tail in its tooltip. There is no row with a menu that stays silent about
it (`test/test_ctxmenu_reach.js` fails if one appears).

**For agents:** the `ui.ctxmenu` op reads the catalogue itself —
`{"op":"ui.ctxmenu"}` lists the kinds of row,
`{"op":"ui.ctxmenu","section":"afBacklogRow"}` says what can be done to one.

**The vault exception:** a secret's menu has **no item that copies its value,
and never will**. What it copies is the name and the `{secret:NAME}` reference.

The whole design and which phase brought what: `docs/SAG-TIK-MENULERI.tr.md`.

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

Right-click menu on an agent: **Start Claude Session**, **Start Session…** (model · effort · permission mode · name · first prompt — see [Starting and Steering Sessions](#oturum-denetim)), **Continue Latest Session**, **Open Agent Detail**, **Open in New Window**, **Reveal in File Explorer**.

Right-click menu on a session row (2.7.0):

- **Resume Session in Terminal** — for Claude, opens a terminal in that session's folder and runs `claude --resume <session-id>`: you continue **any past session** where you left off (Continue Latest only resumes the most recent one). The ⏵ icon that appears on hover does the same. On an external-engine transcript, **⏵ Resume** uses that engine's measured Console resume path instead; an external thread id is never handed to Claude.
- **Focus Session Terminal (2.58.0)** — the ⌨/terminal icon on hover (and in the right-click menu) jumps straight to that session's terminal window. The same ⌨ is available on **every** surface a session appears: Dashboard and Agent Detail table rows, Timeline live cards, the Session Viewer's top bar and Needs You items.
- **Rename Session…** — give the session your own name (to remember it); leave it blank and the automatic title comes back. Names are persistent, the transcript file is untouched.
- **Pin / Unpin Session (3.24.0)** — puts the session on your shelf: pinned sessions are listed first and are exempt from every row limit. The 📌 button on hover does the same. **Label Session…** adds comma-separated labels and **Interrupt Session** stops the running turn with an Esc — see [Starting and Steering Sessions](#oturum-denetim).

Since 2.7.0 session titles are derived from the conversation: commands like `/compact`, `<...>` harness blocks, `!` shell lines and whole-message `[bracketed notices]` are no longer used as titles — the first real user sentence is the title.

### Dashboard

The fleet's overview board. Opens with the `Agent Farm: Open Dashboard` command or by clicking the status bar.

**One header on every page (2.59.0):** every panel's top bar is rendered by a single shared component, so alignment, spacing and ordering are identical everywhere — title and subtitle on the left, one right-aligned toolbar. The toolbar has two halves separated by a thin divider: the **left half is the page's own** scope controls and actions (range/window selectors, Start/Resume/⌨/Export…), and the **right half is the global cluster, the exact same buttons in the exact same order on every page** — **Dashboard · Live Timeline · (related panel) · ⌕ Search · ⚙ Settings · Refresh · ? Guide** — minus only the page you are already on. ⌕ Search is pre-scoped where it makes sense (this agent / this session). Pages differ in their left half; the right half is muscle memory.

- **KPI cards**: active agent count, today's cost, cost for the selected range, session count, the 5-hour window, total finding count.
- **Farm Status card (2.39.0):** just below the KPIs, an honest activation row per subsystem — **green dot = live in use, blue = installed but idle, grey = never used.** Nine rows: live monitoring, tasks/scheduling, triggers, workflows, media pipeline, external CLIs, asset ingest, smart oversight, secret vault. Each dormant row has a **one-click wake-up** button (set up example, add a key, the relevant setting/guide). If something is dormant the card opens expanded; if everything is live it collapses to a single summary. The external-CLI row also reminds you of the fail-soft nature of the adapters: if a profile exists but no session shows up, it may be a sign of format drift.
- **Plan usage card (3.23.0):** to the **right of Farm status, on the same line** — the two boxes answer the paired questions "what can the farm do" and "how much subscription room is left to do it with". This is the only figure on the page that is **not** derived from local transcripts: it is your **real** rate-limit state as **Anthropic** reports it, the same numbers `/usage` prints inside Claude Code — **Current session (5h)** and **Current week (all models)**, plus the per-model weekly bars when your plan has them, each with its percentage, a bar (yellow at 75%, red at 90%) and its reset time as both a clock time and a countdown ("Resets 21:40 · in 2h 20m"). It **refreshes itself** on the shared two-window beat (see below — seconds while an agent is mid-turn, `agentFarm.planUsageRefreshMinutes` when the fleet is idle, 0 = manual only), states which window it is in under the bars, and the **⟳ in its corner** reads it again on demand. The card reads the OAuth session Claude Code already stores on this machine and **never writes to it**: an expired token is reported honestly ("start a Claude Code session to refresh it") rather than silently renewed behind the CLI's back. No login of that kind (API key, gateway, macOS Keychain), no network, or a rate-limited endpoint each print their own one-line reason instead of a wrong number. Bridge: **`usage.plan`**. The same two figures are also **permanently in the status bar** — see below.
- **‼️ The two percentages, without opening anything (3.42.0):** the card above answers *"can I afford the next long turn?"* — a question you ask **before** you spend — and it lived behind a page you had to open, so in practice it was read afterwards. It is now also a **status-bar indicator**, in every window, while you work:

  **`$(dashboard) 3h 49m - 86% / wk 41%`**

  The status bar is the only surface in VS Code that is visible without opening something, which is what "always in view" has to mean — a second panel, a tree row or a webview all fail the requirement by definition. **The first field is the time LEFT in the session window (3.43.0), not a label.** It used to read `5h`, which said only which window the percentage belonged to — a constant, i.e. no information — while looking exactly like a duration, so the one number the bar appeared to give you about time was the one thing it could not tell you. `3h 49m - 86%` answers both halves of the real question at once: how much is gone, and how long until it comes back. The week keeps its label (a second bare span beside the first would be unreadable) and its reset is in the tooltip, where there is room for every limit. A session window whose reset the endpoint did not state falls back to the word `session` — never to an invented span. It turns **yellow** at `agentFarm.planUsageWarnPercent` (80) and **red** at `agentFarm.planUsageDangerPercent` (95), driven by the **worst** limit on your plan — including ones the one-line text has no room to print. **Hover** for every limit with its reset countdown, the plan tier, when it was last checked, **which beat it is running on** and a **Check now** link; **click** for the Dashboard card. `agentFarm.planUsageStatusBar` turns it off.

  Three honesty rules: a machine with **no subscription login** (API key / Bedrock / Vertex) has no percentages and never will, so the indicator **is not shown at all** — one that says "unknown" forever is noise; a login that **can** come back (expired, a transient endpoint failure) stays visible as `usage ?`, because vanishing would read as "you have used nothing"; and it shares the card's `PlanUsageService` **cache**, so the indicator, an open Dashboard and an agent's `usage.plan` together still make **one request per beat**.

- **‼️ One beat, two windows (3.43.0).** These figures move only while a turn is **actually running** — a session that is open but waiting for your next prompt spends nothing — so a single fixed interval is wrong in both directions: too slow to follow the turn you are watching, too fast for a farm that is merely idling. The beat now follows the fleet, and every surface obeys the same decision (`core/planusage.ts` → `refreshMs`, fed by `LiveMonitor.activeTurns()`):
  - **Idle window** — nothing mid-turn: `agentFarm.planUsageRefreshMinutes` (default 5 min; `0` = manual only, and that answer holds in **both** windows, or the setting would be a lie).
  - **Active window** — at least one agent mid-turn: `agentFarm.planUsageActiveRefreshSeconds` (**default 60 s, floor 30 s — 3.45.0**). "Sessions are open" is *not* the question; `working` or running a tool is.
  - **‼️ A finished turn pulls the next read forward — it does not buy an extra one (3.45.1).** A turn **ending** is the moment the figures settle at what it cost, and it is also the moment the beat switches to the slow idle window, so without this the settled number could sit unread for the whole idle interval. A turn **starting** earns nothing: nothing has been spent yet at the instant a turn begins, so the answer is necessarily the one the last read already gave. And the edge's floor is the user's **own active interval**, shared with the beat through one `lastFetchAt` — so no two automatic reads are ever closer together than the number they configured. Measured on the real workload (a burst of 12 quick turns, 10 s apart): **12 requests, 10 s apart → 2 requests, never closer than 60 s.**
  - **The indicator owns the beat and the Dashboard card rides it:** whatever the bar just read is pushed into an open card in the same step, and the card re-arms its own timer from it. Two surfaces, one figure, one request. Both say which window they are in — the card in its footer (`live · every 60 s while an agent works`), the indicator in its tooltip — because a refresh rate you cannot see is one you cannot trust. `usage.plan` returns the same `beat` to agents, so a cached answer's staleness is known.
  - **‼️ Antigravity's quota has a beat of its own, and only Antigravity moves it (X-437).** It is read by running `agy -p /usage` (no turn, no token), and since agy's 2026-09-29 update every run flashes a terminal on screen — so it does not ride Claude's beat, where any Claude agent working meant a read a minute. "Running" here is an **Antigravity** turn (`LiveMonitor.activeTurns('agy')`): Claude or Codex working spends none of this quota. It is read once when the window opens; while an Antigravity turn runs, every `agentFarm.agyUsageActiveRefreshSeconds` (default 60 s, floor 30 s), counted from the run's start; once right after the run ends (the settled figure); then every `agentFarm.agyUsageRefreshMinutes` (default 240 min; `0` = never while Antigravity is idle). Check now always reads. One pure decision (`core/agyUsageBeat.ts`) and one timer drive it — painting a surface never spawns `agy`. Antigravity used outside Agent Farm has no hook wire, so its turns are not seen.
- **‼️ The interval was never what earned the 429s — the missing `User-Agent` was (3.45.0).** A 15-second active beat was rate-limited into uselessness, and the obvious fix (poll less often) is the wrong one: `/api/oauth/usage` is **undocumented** and publishes no limit, no `Retry-After` and no intended polling rate — the requests to document it were closed as *not planned* — but it does have **two buckets**, and the header is what sorts you into one. A request with **no `User-Agent`** — which is what Node's `https` sends by default, i.e. what Agent Farm used to send — lands in an aggressively limited one and gets a **persistent 429 whatever the interval**. Three changes, in the order they matter:
  - **The request now goes out dressed exactly as the CLI's own does.** Read out of the installed binary rather than guessed: `claude-cli/<version> (external, cli)` plus `x-app: cli`, over the same OAuth beta gate. Nothing here works around a limit meant to apply to us — it is the user's own token, their own account, and the very figures `/usage` prints for them in the CLI. **The version is not spawned for:** every Claude Code transcript line carries the version that wrote it, so the newest session row already knows it (`SessionInfo.version`); a machine with no transcripts yet falls back to a known-good string rather than sending a blank.
  - **60 s active, with a 30 s floor enforced in code.** A few-second setting is not a preference the endpoint will honour, so the fast window has a floor of its own (`MIN_ACTIVE_BEAT_MS`) well under the 180 s community tools report as safe, but far away from the behaviour that earns the punitive bucket.
  - **A 429 is answered by backing off, not by asking again.** No `Retry-After` leaves one safe reading: stop, and double the wait each time it happens again — 3 → 6 → 12 → 15 min cap, cleared entirely by one success. **Only a person may spend a request through a backoff** — the ⟳ button, because someone clicking it has decided to, and a control that silently refuses for a quarter of an hour is one that has taught you it is broken. Nothing automatic gets that privilege, and neither does an **agent** calling `usage.plan` with `force` (it takes the edge path: skip the cache, never the backoff). The state is **said out loud** in the tooltip and the card's note (`backing off, next automatic read in 6 min`) — a card that is deliberately going stale must not merely look frozen.
  - **‼️ The three reasons a read can happen are named, because they are allowed to skip different things (3.45.1).** `beat` (the timer) skips nothing. `edge` (a turn just ended) skips the TTL only, and is floored at the active interval. `user` (the button) skips the TTL and the backoff, floored only at 5 s. **This is where the 429s were still coming from after the User-Agent fix:** the edge called the button's `get(true)`, so an automatic reader triggered by one of the busiest events in the system held the *human's* privileges — it walked straight through both the TTL and the backoff meant to rescue it, with only a 5-second floor underneath. A politely configured beat was therefore irrelevant. An automatic read obeying no ceiling is not an optimisation; it is the bug.
- **‼️ A click on either status-bar indicator lands at the TOP of the Dashboard (3.45.0).** The page is retained when hidden, so *revealing* it is not the same as *opening* it: it comes back exactly where the reader last left it, which is usually deep in the sessions table — several screens below the KPI row and the plan usage card that the click was **about**. Both indicators in the cluster share one contract (`OPEN_DASHBOARD_AT_TOP`), because two neighbours answering the same gesture differently is itself the bug; the palette, the global nav and every notification still open the page without moving it. The scroll is instant, not smooth: this is the page being opened, and an animation on arrival reads as a glitch.
- **Daily cost by agent**: a stacked cost chart per agent. Range selector (widened in 2.13.0, **made askable in 3.38.0**): the first week **day by day — 1d 2d 3d 4d 5d 6d 7d** — then **14d / 30d / 90d / 180d / 365d**, then **⇤⇥** for any two dates. (**3.40.0:** the first week was drawn as bare digits, so half of one control had a unit and half did not — and a lone "5" beside "14d" reads as anything but five days.) The jumps used to start at 7, so *"yesterday and today"* was not a question this page could be asked and neither was *"that week in July"*; the custom range opens on the span you were already looking at, refuses a backwards range, and names itself on the card (`Cost · 2026-07-10 → 2026-07-16`). Every path ends in the same list of day keys, so the KPI cards, the chart and the per-agent columns stay exactly as accurate as the daily buckets they sum. Beyond 120 days the daily bars are automatically **grouped weekly** so they stay readable (a "weekly buckets" note in the title). Since all daily data already comes from session logs, the 1-year view adds no extra load.
- **Cost by model**: a donut chart showing how much was spent on which model.
- **Token types**: input / output / cache write / cache read distribution. A high cache-read ratio means prompt caching is working efficiently — that's good.
- **Activity heatmap**: message density by day-of-week × hour. Shows your work rhythm.
- **Agent cards**: status, today/range cost, mini trend line, finding badges. Click a card → detail page.
- **Sessions table (2.50.0 — merges the former Top/Recent tables; shared with the Agent Detail page since 2.57.0)**: one table with a **Sort by** selector — Recent (default) · Cost · Tokens · **Ctx now** (2.57.0) · Duration · Turns; whichever criterion you pick, the genuine farm-wide top rows are shown, and the choice is remembered. Columns carry tools/errors and **Ctx now** — the approximate context in the model window after the session's last reply, the instant answer to "which session is close to compact time?" (— means the transcript didn't record it). A green **●** marks sessions active right now; **every row carries a ⌨ button** (2.58.0) that jumps to that session's terminal — a window can be open while the session idles, and if none is found the command says so honestly. The **▸** on a row unfolds that session's **turn list** — each turn's title with its per-turn tokens and cost, parsed on demand from the transcript. Session rows are tinted and accent-edged so an expanded row's turns read as nested content. The Turns controls work like the viewer accordion: **Expand all / Collapse all / Single-open** — and since 3.20.0 **Single-open is the default here too** (one session's turns open at a time, so the table stays a list you scan instead of a page you scroll); an explicit "off" is remembered. Clicking the row itself opens the transcript; **clicking a turn row opens it right at that turn** (2.51.0) — and if the viewer is already open, that tab is revealed and scrolled there instead of a second one opening.
- **Multi-select (3.58.0):** a checkbox column on every row, **shift-click** for a range in the order you are looking at them, and a header box that takes everything **listed** (not everything filtered away). A bar says how many, what they cost and how many are running. There is deliberately **no action bar of its own**: the selection rides on the row's `data-vscode-context`, so the right-click menu that was already the whole session action set becomes a *bulk* menu — pin, label, file to a project, copy ids, interrupt, end, clear — with no new command and nothing for a page embedding the table to answer. A row **outside** the selection carries no selection, so the menu always acts on what you pointed at. Ending a set asks once and names the number; clearing does not ask, because it destroys nothing. The selection is not persisted (a restored set is an action half-taken) and a row that leaves the pool leaves the selection with it.
- A **Live Timeline** button in the top row (2.22.0): between Refresh and Guide — one click from the board to the swim-lane view.
- **Sessions-table filters (2.72.0):** a **Filters** chip next to the sort box (shared component — the Agent Detail page gets it too) opens a panel over the row's own figures: **title-contains text**, an **agent dropdown** (dashboard variant), **Active now / Has errors / Main only** flags, **min–max ranges** for tokens, cost, ctx, minutes, turns, tools and errors, and a **date range**. Freely combinable, live `N/M sessions` count, honest "No sessions match" row, one-click Clear — all remembered per page.
- **Your dialogs vs the farm's own runs (3.20.0):** with standing duties, schedules and triggers running, the sessions you actually *talked* in are a minority of the table. A narrow **By** column now marks each row's origin — **🧑 you started it** (an interactive session) or **🤖 automation started it** (schedule / trigger / task / mission, or any `claude -p` run) — and the table **opens scoped to 🧑, your own sessions**. The **🧑 chip** right before Filters flips **User ↔ All in one click** (no panel to open); the filter panel's **Started by: All / 🧑 User / 🤖 Auto** row adds the third scope, and the scope is remembered per page. When the scope hides rows, the chip row says so (`12/47 sessions`). The origin is **read from the transcript's own `entrypoint` field**, never guessed from timing or prompt shape — an unknown entrypoint counts as yours, so a filter can never bury a real conversation. The row pool the host ships is built **per origin**, so the User scope still gets its genuine top-N however much automation dominates the raw list. **‼️ And 🤖 covered two different things until 3.140.0.** A robot row is either a **headless** run — a `claude -p` with no terminal and nobody who could have been watching — or a task launched in *interactive* mode, which opened a real terminal a person can type into. A small **🌙 riding on the robot** (🤖🌙) marks the first, on every sessions table and on the Session Viewer's own line, with the hover saying it in words; the filter panel's **Started by:** row gains a **🌙 Headless** chip beside the three scopes — on by default (nothing is hidden unless you ask), and pressing it drops the headless runs from whichever scope is showing, counting itself on the Filters (n) badge so a shut panel cannot hide the fact. It is decided host-side from the same two recorded facts the origin is (`core/sessions.ts` → `sessionHeadless`) and reaches agents as `headless` on every `sessions.recent` / `sessions.find` row, plus a `headless?` filter arg. **‼️ And the two were one axis in the DATA until 3.210.0 (S-41).** An interactive task produced no launch binding at all — the publisher skipped anything whose mode was not headless — so the run had no `launchedBy`, the origin rule fell through to "an agent's folder and no record of ours" and stamped a scheduled run 🧑 **You**. Every task the farm starts is bound now, whatever it runs in, and `sessionHeadless` no longer opens by asking `sessionOrigin`: the two questions are answered from their own evidence, so 🤖 **Auto** + a real terminal is a state the table can actually show.
- **Agent comparison over any window (2.72.0):** the comparison table's fixed "all time" became a **period selector** — 1/2/6/12/16 hours, 1–5 days, 1–4 weeks, 1/2/3/6/9 months, 1/2/3 years, **All time** (default) and **Custom range** (two dates, inclusive). Windows starting within the last 24 h are **hour-exact** (summed from the 48-hour per-message log); longer windows sum the daily buckets at day granularity — the footnote says which. Windowed mode shows Sessions · Cost · Tokens · Msgs per agent; a **sort box + direction flip** orders the table by any column in both modes.
- **You decide how many rows (2.73.0, defaults tuned 2.74.0):** the Sessions tables (Dashboard + Agent Detail) grew a **Show** box next to the sort selector — the Dashboard defaults to **20**, the Agent Detail page to **50**; type a number to list exactly that many, and the **All** chip (or an empty box) lists every session. Changing it rebuilds the row pool host-side, so whatever sort you pick, the shown rows are that criterion's *genuine* top N — not a re-slice of the old pool. The **Agent comparison** table gets the same control: 12 agents by default, a Show box + All, and an honest `Showing N of M agents` footnote when the list is cut.
- **Toolbox & Turns in the header (2.81.0):** the Dashboard's global cluster carries two extra shortcuts between Missions and ⌕ Search — **Toolbox** (the extension console) and **Turns** (the farm-wide turn table, below).
- **⚖ Sync constitution (3.40.0):** next to Turns, in the **lower row with the destinations** — not a destination but the one farm-wide **action** this page owns. It mirrors the shared constitution (the nest root's own `CLAUDE.md`) to the `AGENTS.md` files the other engines read. **It had no button anywhere:** the command palette and the `constitution.sync` bridge op were the only ways in, so the one operation that touches **every agent at once** was the one you could not click — and since it is about the whole fleet rather than any single agent, this is where it belongs. The button calls exactly the command the palette calls: the divergence checks, the modal for a hand-edited `AGENTS.md` and the `.afbak` backups are that command's, and there is one of it. `CLAUDE.md` is only ever **read**.

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
- **Sessions (the Dashboard's advanced table since 2.57.0)**: this agent's sessions in **the exact same component** as the Dashboard's Sessions table — Sort by (Recent · Cost · Tokens · **Ctx now** · Duration · Turns, remembered per page), the **▸ turn accordion** with per-turn tokens/cost and click-to-jump into the transcript at that turn, **Expand all / Collapse all / Single-open**, a green ● on active rows + **⌨ jump-to-terminal on every row** (2.58.0), and duration/turn/tool/error/token/**Ctx now**/cost columns. Defaults to **50** rows (deeper than the Dashboard's 20 — it is this agent's own log); the **Show** box / **All** chip next to the sort selector (2.73.0) picks how many sessions to list. It carries the **By** origin column and the 🧑 User ↔ All switch too (3.20.0) — on a duty-heavy agent this is the difference between finding your conversation and scrolling past forty nightly sweeps.

### Session Viewer

Turns a session's raw JSONL log into a readable conversation:

- Messages are color-coded: blue = user, green = assistant, yellow = tool call, purple = tool result. Failed tool results have a red border and come expanded.
- Every assistant message shows model, tokens and cost. Even the tokens of assistant steps that only make a tool call (no text) aren't lost — they show up on the first tool-call row (2.6.0).
- **Turn bands (2.6.0, made prominent in 2.8.0):** every user command opens a new turn. A turn start is no longer a thin line but a **full-width colored band**: an accent-colored left edge, a bold `Turn 3/12`, the first sentence of the command, and that turn's tokens/cost. The band is **sticky** — while scrolling fast, the band for the turn you're in stays pinned at the top, so turn transitions aren't missed. The **checkbox** in the band selects whether that turn is included in the MD export; the **↑ ↓ arrows** (2.9.0) jump to the previous/next turn without scrolling — since the band is sticky the arrows are always within reach (the ↑ arrow's "doesn't scroll at all" bug was fixed in 2.11.0).
- **Turn accordion (2.48.0; opens folded + single-open since 3.20.0):** the turn bands double as fold headers — **a single click on a band** folds that turn down to its band (a ▸/▾ caret shows the state; a folded band also shows its message count) and a second click reopens it. **A transcript now opens fully folded and in Single-open mode:** what you see first is the session's *turn list* — a clickable map of highlighted bands — instead of a wall of text, and opening a turn folds the previous one. The `Turns:` row above the message list has **Expand all / Collapse all** to override that at any time, and **Single-open** toggles the mode (the choice is remembered — an explicit "off" survives). On a live session, turns that arrive while you read come in folded as well, but a turn you opened by hand is never folded behind your back. Everything that jumps to a turn — the breakdown table, the ↑ ↓ arrows, timeline/search/feed click-through — auto-unfolds its target, so nothing is ever out of reach. Folding is display-only: filters, replay and Export MD ignore it.
- **External transcripts are real transcripts (3.112.0), not Claude-shaped guesses.** A Codex rollout is parsed from its own `session_meta` / `turn_context` / response events: the page uses the real thread UUID rather than the `rollout-…` filename, removes injected project envelopes from the dialogue, deduplicates the two copies of an answer, and shows its tools, usage, model and effort. Antigravity's historical SQLite payload is protobuf with no schema or export command exposed by its CLI, so Agent Farm cannot reconstruct conversations made before this release. For every Antigravity conversation it hosts from now on, it writes the normalized dialogue/tools/totals to a versioned plain-JSON transcript under global storage; that file wins over the metadata-only row and opens on the same viewer. `/context` capture remains Claude-only and external pages say so instead of running `claude --resume` on the wrong id.
- **Turn start date on hover (3.52.1):** hovering a turn band — or a row in the Turn breakdown table — shows `Turn started · 12 May 2026, 18:32 (3 days ago)`. Every other clock in the viewer is a **time of day** (`14:32`), so a transcript opened months later could not say *which day* the work happened on; the band is where the date belongs, since the turn is the unit this page navigates by. Date and time are formatted in your own locale (separately, so a locale cannot drop a weekday into the middle of the number run), and the elapsed time is spelled out in words — minutes, hours, days, months, years. This **replaced** the band's old "Click to expand this turn" tooltip: the ▸/▾ caret, the fold state and the `Turns:` controls row already say the band is clickable, so the one hover a turn gets is spent on what nothing else on the page shows.
- **⬇ Export MD (2.8.0; asks what to include since 2.81.1):** clicking it now **asks first** — **Current view** (default: the Show chips, text filter, replay position, turn checkboxes AND the fold accordion are all applied — you export what you see) or **Everything** (the full transcript, ignoring the on-screen state). When you pick *Current view* and some turns are folded, a second question decides whether folded turns are **omitted entirely** (default) or kept as **titles only** (their `## Turn N` header without the body). The top of the file records the session id, duration, totals and which mode/filters were used. The save dialog opens in **the last folder you saved to** (2.9.0; on first use, the session's own folder); the suggested filename carries a **date + time stamp** (`session-abcd1234-2026-07-10_143522.md`, 2.11.0). After saving, the file opens in the editor.
- **Export selection (2.9.0):** turn selection is done from two places, **in sync** — the checkbox in the turn's band and the `md` column in the Turn breakdown table show the same selection, and changing one updates the other instantly. The **All / None / Invert** buttons in the table make bulk selections; the **only** button on a row selects "just this turn" in one move. The header row and the Export MD button show a `12/37 in export` counter when there's a selection.
- **Turn breakdown table (2.7.0):** the expandable box just below the KPI cards lists all turns in **one table**: turn number, first sentence of the command, tokens, cost. Click a row → jump to that turn's marker (during replay, it moves playback to that turn). Turn totals now match the session total exactly — the tokens of thinking steps are also attributed to their turn.
- **Show filter (2.7.0; Dialog is the default since 2.52.0; "Agent" wording + glyphs 3.20.0):** the chip row above the message list filters by type: **All · Dialog · 🧑 User · 🤖 Agent · 🔧 Tool calls · 📄 Results · ⚠ Errors**. The AI side is called **Agent**, not "Assistant" — what talks back here is an agent, and the label follows the same stance as the composable speaker label. The **dialog** glyphs (🧑 🤖) repeat on the messages themselves, so a long transcript is scanned by mark rather than read word by word — but a tool row carries its **step-kind** chip instead (`⌘ ⇄ ⌗ ⑂ ⚙ ↩`, 3.88.0): 🔧 was drawn identically on a web fetch, an MCP call and a local Read, and one row carries one mark. "Dialog" leaves only you + the agent (tool traffic is hidden) and is what a viewer opens with — one click on **All** brings everything back. Chips are multi-selectable. The filter **also affects replay** — with Dialog selected, only dialogue flows during replay. A deep link (timeline/search/feed/turn row) pointing at something the filter hides **clears the filter** rather than missing the target.
- **Per-turn model (2.52.0):** each turn band, the breakdown table and the Markdown export show the model that served that turn — the model changes mid-session in roughly one of four sessions, so this is per turn, not per session. Model ids are read **verbatim from the transcript**: a newly released model needs no update here (only a pricing rule). The same mechanism would surface an effort/reasoning label the moment Claude Code starts recording one — today it records none, so none is shown.
- **Origin in the subtitle (3.20.0):** the line under the title opens with **🧑 your session** or **🤖 automation run** — the same distinction the Sessions tables filter on, so an opened transcript says at once whether you are reading your own conversation or a scheduled run.
- **⏵ Resume (2.7.0):** the top-right button resumes this session in the terminal with `claude --resume`.
- **⌨ Terminal (2.55.0, session-exact since 2.56.0):** jumps focus to **this session's own** terminal — the same button sits on active Dashboard session rows and Timeline live-session cards. Each launch registers its terminal and the live monitor binds the session id to it, so two concurrent sessions of one agent each focus their own window. Session terminals are titled `claude: <agent> #n` (unique per launch); external Windows Terminal windows open as their own window and are found by that pinned title. If nothing is known about the session (started before 2.55.0, or outside Agent Farm), it falls back to the agent's most recent terminal — and says so honestly when even that fails.
- **Context now card (2.6.0, model-aware in 2.11.0):** the last request's context size (prompt + cache + output) and its percentage within **the session model's context window**. The ceiling is no longer a fixed 200K, it's found from the model: Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 and older generations → 200K. It turns yellow at 70% and suggests `/compact` or `/clear`, red at 90%. **If the model isn't in the table** no percentage or color is shown — only the raw context size (no ceiling is made up). You can force a fixed ceiling with the `agentFarm.contextWindowTokens` setting (0 = automatic). While the session is running, the card refreshes **live** each time the log changes — the instant answer to "is the context full, is it compact time?"
- **Context breakdown popover — the /context split, one click away (3.12.0–3.13.0):** the **whole Context now card is clickable** (the ⛁ glyph in its corner is the permanent affordance; it brightens on hover with a tooltip; click to toggle, dismissed by an outside click or **Esc**) and overlays the `/context` **breakdown by category** on top of the card: System prompt · System tools · MCP tools · Skills · Messages · Free space… — each with its tokens, percentage and a mini bar, never reflowing the KPI row. The numbers are never invented — they come from two **real** sources: (1) a `/context` run recorded earlier in the session's transcript (both the TUI's ANSI shape and print mode's markdown table are recognized); (2) otherwise — or to refresh — the popover's **⟳ Capture now / Refresh** button: the host runs the non-live session through `claude --resume <session> -p "/context"` (**a local command: no API call, zero cost**; it only appends a harmless snapshot line to the same session file, no fork; the session's own model is passed so the window ceiling is right) and the breakdown lands in the popover within seconds. On a **live** session Capture deliberately refuses (we don't race a second writer against the live TUI on one transcript — caught by the live monitor plus a 90s mtime freshness check): the status line points you at the session's terminal — type `/context` there and the watcher refreshes the card by itself. The popover footer shows the snapshot's **timestamp** (it may lag the live gauge slightly — it belongs to the moment it was taken).
- The search box at the top filters messages and tool names; when it has content, an **✕** appears on its right to clear the filter in one click (2.37.0).
- **Open raw JSONL** opens the raw log in the editor.
- **⌂ \<agent\> (2.60.0):** the button right next to it names the session's **owner agent** and opens that agent's page in one click — no more "whose session was this again?" detours through the Dashboard. Sessions that live outside the agent roots have no owner, so they show no button.
- For very long sessions the last N messages are shown (`agentFarm.maxTranscriptMessages`, default 1500).
- **▶ Replay** plays the session step by step — see [Session Replay](#session-replay) for detail.

### Turns Page {#turlar-sayfasi}

**Agent Farm: Open Turns** (or the **⤢ Open Turns page** button right beside the Sessions table) — the whole farm unrolled to **one row per user turn** (2.81.0, 3.171.0). The Sessions table answers "which session?"; this page answers "which *turn*, in any session, farm-wide?". Turn rollups are collected while transcripts are indexed, so the page opens instantly and refreshes itself as logs change.

- **Multi-Engine Coverage across all 5 engines (3.173.0 — S-40):** Unrolls turns across the entire farm without skipping non-Claude engines: **Claude**, **Gemini** (with model and token/price derivation for its reply), **Antigravity (brain log)** (tool calls, planner prose, duration with honest zero tokens), **Antigravity (hosted)** (Console `result` accounting for exact tokens and dollars), and **OpenCode** (`rgb(60, 135, 255)` badge, `step-finish` round-trips, separately tracked `reasoning` and context window bounds).
- **Declared Table Layout & Widths (3.171.0 — U-69):** Built with `table-layout: fixed` and declared `<colgroup>` shares so the table remains visually consistent regardless of active filters. Single-line row clipping keeps rows compact.
- **Single-Subject Cell Hovers (AFTip):** Each cell's hover opens with the full unclipped value on its first line, followed by derived metrics: the **Steps** column breaks down API calls, steps per call, and the share of **reasoning** tokens; the **Tokens** column details plan-weighted ratios alongside costs.
- **🔖 Wiki Candidate Pool Tagger (3.203.0 — K-26):** Every turn row starts with a quiet **🔖** badge. Clicking it or picking **Add to Wiki Candidates…** from the right-click context menu opens a lightweight popover to tag and file the turn directly into the candidate pool.
- **Columns:** **By** — 🧑/🤖 origin · Agent (● active dot, `sub` badge, ⌨ jump-to-terminal) · **Turn** — opening prompt · **Session** — short title · `n/N` turn number · Model/Engine badge · **Steps** · **Tokens** · When · Duration · Tools · Err · Cost.
- **Adapted Controls:** Sort by (Recent · Cost · Tokens · Duration · Tools · Errors · Turn #), **List** count (default **200**), **Expand all / Collapse all / Single-open**, **🧑 origin switch**, and comprehensive **Filters**.
- **Show Filter:** **All · Dialog · 🧑 User · 🤖 Agent · 🔧 Tool calls · 📄 Results · ⚠ Errors** — **Dialog (you + agent) is the default**.
- **▸ unfolds actual turn content;** clicking any row opens the Session Viewer at that exact turn.
- **⬇ Export MD (2.81.1):** exports listed turns to Markdown (`Current view` or `Everything`).
- Bridge op: **`turns.list`** (`agent?`, `origin?`, `engine?`, `limit?`).

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

## Console — talking inside the panel {#console}

*(3.28.0)* The **structural gap** the whole audit was built around: Agent Farm could read everything about a session and **say nothing to one**. The Console closes it.

The **💬 Console** tab (first in the global nav, `Ctrl+Alt+C`) hosts long-lived `claude` processes **inside the panel**, over the CLI's own streaming JSON channel. Left: the sessions this window hosts, plus your shelf and recent transcripts (clicking one **resumes it into the Console**). Right: the conversation and a composer.

**Your install, your subscription:** no API key of ours, no change to the cost model, and the transcript still lands in `~/.claude/projects` — so every analytics / health / timeline engine keeps working untouched.

### The composer

Under the box: **agent · model · effort · permission mode** — all from the launcher's own dictionary (`core/launch.ts`), so the extension has one vocabulary rather than two. `Ctrl+Enter` sends. **All three tuning dimensions stay live once the session is running (3.44.0)** — the folder (agent) is the one thing that really is fixed once the process is up; model, effort and permission mode all travel as control requests the CLI accepts mid-conversation (`/model`, `/effort`, `set_permission_mode`), so a session opened from an agent row can change exactly as much as one opened from the composer.

- **⎋ Interrupt** stops the running turn through the CLI's own control channel. **The turn ends; the session and its context stay.**
- **‼️ Typing mid-turn steers that turn (3.39.0).** What you write while the agent works goes **into the running turn** — the CLI delivers it at the turn's next step, the same way the interactive terminal delivers what you type while it works. So "no, do it the other way" arrives while there is still something to redirect. The line joins the conversation marked **↯**, because it did not start the turn above it. **Measured, twice:** against the raw CLI (a message written to stdin six seconds into a tool-calling turn reached the model at that turn's next step) and through the Console's own host in `smoke_console_live.js`, where the word only counts if it lands **before** the line that closes the turn.
- **⏸ Hold** is the other choice, for "say this next, not now": the message waits above the box — **and it is still yours**. ✎ puts it back in the composer to be rewritten (**↑** in an empty box does the same, the terminal's own key), **⏩** stops holding it and says it into the running turn, **⨯** drops it. Held messages go out in order when the turn ends.
- **‼️ Hold parks WHAT IS IN THE BOX — so an empty box has to say so (3.40.0).** Both composer buttons hand their text to `send()`, which returns **without a word** when there is nothing to send. For Send that is invisible (you pressed it having typed nothing). For Hold it was **the entire feature looking broken**: the natural moment to reach for Hold is right *after* a message has gone into the running turn — and by then the box is empty, so the button did nothing and said nothing, the queue below it never appeared, and the held line with its **✎ ⏩ ⨯** was therefore never seen either. A control that answers a click with silence has taught you it does not work. Hold is now **disabled while there is nothing to park**, with a tooltip saying what would make it live, and the first keystroke brings both it and Send back. Send gets the same treatment rather than eating the click. (And `common.css` finally styles `:disabled` at all — it never had, so a disabled button kept its full colour and its hand cursor: the same lie by a different route, and half a fix until it was rendered and looked at.)
- **‼️ Four mini tools on the box itself: ⎘ paste · ⧉ copy · ✂ cut · ✕ clear (3.43.0, paste 3.45.0).** They act on the **text**, never on the agent — nothing here sends, starts, stops or parks anything, which is exactly why they sit on the box and not in the control row below it. Starting a message over, or lifting a half-written one out to paste somewhere else, was otherwise a keyboard-only job (select all, then a chord) on a page where every other action is a button. They live in the box's bottom-right, **left of the resize grip** which owns the very corner, half-lit until you hover. The three that act on the draft **appear only while there is text** — copy, cut and clear on an empty box are three buttons lying about having work to do. **⧉ and ⎘ answer with a green ✓ for a moment:** cut and clear empty the box in front of you, so the box itself is the receipt, but a copy leaves the screen identical — and a button that answers a click with nothing has taught you it does not work. The caret goes back to the box afterwards, so reaching for the mouse never costs you the keyboard.
- **‼️ …and ⎘ paste is the one that is never hidden, because its work is in the CLIPBOARD (3.45.0).** The moment a paste button is most wanted is the moment the box is **empty** — which is exactly when the rule above would have hidden it — so it is leftmost and permanent, and its three neighbours come and go beside it. **The one thing a paste button gets wrong is the space:** what you paste into a prompt is almost always a name lifted from somewhere else (a path, an error string, a session id) and it lands right after the word you were still typing, so a plain splice at the caret welds the two together — `look atsrc/core/live.ts` — and the fix costs a click into the middle of what you just pasted. So the **caret's neighbours decide**: a word character immediately to the left and one space goes in first; whitespace, a newline, an opening bracket, or the very start of the box, and it goes in untouched — a box that adds a space where there already is one is the same bug from the other side. Only the **left** side earns a space: the right is where the caret is left standing, so the next keystroke is still yours. A selection is replaced exactly as Ctrl+V would, and the caret lands after what was pasted.
- Each row carries its own **cost · turns · the CLI's context estimate**.

### ‼️ The session can ask you something — and the turn waits (3.44.0)

Every hosted session runs with **`--permission-prompt-tool stdio`**, the flag that turns the channel two-way. Without it, measured: the CLI resolves every permission and every `AskUserQuestion` **by itself** ("nobody answered"), the tool comes back as an errored result, and the turn ends — which is what the Console used to see, and mistook for "there is no dialog to answer". With it, measured against the real CLI: a `can_use_tool` control request arrives, **the turn stays open**, and the answer sent back over the same channel lets it carry on — in the same turn, not a new one.

A card **between the conversation and the composer** appears the moment a turn parks on a question, and the session's row says **`asking you`** instead of the misleading `working` a turn that cannot proceed would otherwise show. Two shapes, and the CLI itself says which (`requires_user_interaction`):

- **A question** (`AskUserQuestion`) — its own options, one click each; a multi-select question keeps collecting until you press **Answer**, a single-select one sends on the click that completes it. Free text is always offered too, for "neither — do this instead", which no list of options can hold. The measured contract: the chosen label rides back **inside the tool's own input**, keyed by the question's exact text (`answers["<question>"] = "<label>"`) — `allow` with the input untouched is *not* an answer and produces the same "did not answer" the tool falls back to on its own.
- **A permission** (any other tool) — **three** ways out, the same three a terminal offers (3.93.0): **Allow once**, **Allow \<rule\>**, or **Deny** with a reason.

#### ‼️ The middle button: "allow, and stop asking" (3.93.0)

The panel had only the outer two for a long time, so a run that needed `npm` twenty times asked twenty times and the only escape was widening the whole session. The middle one is a real capability of the channel: the `allow` answer may carry `updatedPermissions`, and the CLI installs them **before** it runs the tool. Measured (2.1.226): three `touch` commands in a `default`-mode session meant **three asks**; approving the first one this way took it to **one**.

- **Bash is scoped by command prefix** (`npm:*`) — the way the CLI writes its own bash rules. A person approving `npm run package` is not saying "allow every Bash".
- **Every other tool** is scoped by name; that is all a tool rule can hold.
- The rule is `destination: 'session'` — it lives as long as the process and is **never written to any settings file**.
- The button **names** the rule it installs; "don't ask again" without saying again about *what* is the kind of button nobody dares press.
- It is not offered on an `AskUserQuestion`: there is no permission to widen there.

Answering a question the CLI has already withdrawn (turn interrupted, session closed, answered from elsewhere) is silently a no-op — the request id is what makes an answer valid, not a click. Interrupting a turn or closing a session with a question still parked answers it with a deny first, so the process is never left holding a request nobody will ever respond to.

**Not on the bridge on purpose:** an agent can answer a *question* (`console.answer`) but can never grant a tool *permission* — the same boundary the general Needs-You queue draws. Deciding whether a tool may touch the machine stays the user's call, in the panel.

### The leftover case: a rule, not a dialog

Most permission decisions now arrive as the card above. What is left is the refusal **nobody was asked about** — a permission RULE, a hook, or an older CLI without the flag — and for that the Console still offers what it can honestly do: **change this session's standing permission rule, live, and ask the agent to retry** — `Allow file edits` · `⚠ Allow everything` · `Plan only`. The permission selector stays live for the whole session, which the terminal path cannot do at all.

#### ‼️ The live vocabulary is not the launcher's — and the CLI can say no (3.93.0)

The live picker was fed the **launcher's** list (`PERMISSION_CHOICES`) for a long time. A running session speaks a shorter one; every row was put to the installed CLI one at a time (2.1.226):

| sent | the CLI's answer |
|---|---|
| `bypassPermissions` | `success` — **only** if the session was launched with the enabling flag |
| `default` · `acceptEdits` · `plan` · `dontAsk` | `success` |
| `auto` | `error: auto mode unavailable for this model` |
| `manual` | `success`, but the CLI answers back `mode: "default"` |
| `""` (the launcher's "Default" row) | `error: must be one of acceptEdits, auto, bypassPermissions, default, dontAsk, plan` |

So of seven rows, **two could never work and one quietly meant something else**. The live picker has its own list now (`PERMISSION_MODES_LIVE`): `default · acceptEdits · plan · dontAsk · ⚠ bypassPermissions`. The start picker is unchanged; the refusal box's `Let it decide` button is gone for the same measured reason.

**‼️ And a refusal is no longer silent.** `set_permission_mode` was the one control request sent fire-and-forget: written to stdin, reported as done, never reconciled with its answer. The reducer only ever handled a *success*, so a refusal changed nothing, said nothing, and the picker snapped back on the next repaint — that is the whole of "I set it to bypass and it kept asking". Worse, the **"grant + retry"** button told the agent *"Permission granted — please retry"* on the strength of a successful **write**, so it retried a permission nobody had. It is a **tracked** request now, like `setModel`/`setEffort`: a refusal becomes a line in the conversation in the CLI's own words; an acceptance shows the mode **the CLI accepted**, not the one asked for (`manual` comes back as `default`); the retry nudge only goes out after the yes. On the bridge, `console.permissionMode` reports the request as **sent** — the CLI has the last word and it arrives on the wire.

#### ‼️ `bypassPermissions` in the settings file no longer applies by itself (S-18, 2026-08-08)

`permissions.defaultMode: "bypassPermissions"` in `~/.claude/settings.json` covered every session for months. The CLI build installed on 2026-08-08 carries a gate the one before it does **not** — the strings are in the binary, and only in the new one:

> `settings defaultMode "bypassPermissions" ignored for a VS Code-owned session without the allow-bypass setting`
> `Permission mode bypassPermissions from settings was ignored — enable the "Claude Code: Allow Dangerously Skip Permissions" setting in VS Code to consent to it`

telemetry key `tengu_settings_bypass_unconsented_noninteractive_ignored` — **present** in `claude.exe`, **absent** from `claude.exe.old`. A hosted Console session is exactly that: VS Code-owned and non-interactive. Two older kill-switches sit beside it — `bypassPermissions mode is disabled by feature gate` (`tengu_disable_bypass_permissions_mode`) and `…disabled by settings` — and they are consulted **per call**, not once at startup, which is why the asking can begin **in the middle of a turn** rather than at a session boundary.

Hosted sessions therefore carry `--allow-dangerously-skip-permissions`. The CLI's own help: *"Enable bypassing all permission checks as an option, without it being enabled by default."* It **grants nothing** — it makes the panel's own ⚠ control possible. The flag that really turns bypass on, `--dangerously-skip-permissions`, is never put on the command line.

### Code changes, inline

Every `Edit`/`Write` appears with its file and two buttons: **open** and **vs HEAD** (3.25.0's diff surface, reused rather than rebuilt).

### ⚡ Superpowers Engineering Discipline — Dormant on Disk & Composer Switch (3.287.0 — X-55, X-132, X-133) {#superpowers}

*(3.286.0 - 3.287.0)* Software engineering disciplines (Test-Driven Development - TDD, Systematic Root Cause Debugging, Step-by-Step Planning, Brainstorming, Verification and Code Review, etc.) from the **Obra Superpowers (v6.3.0)** library are integrated into Agent Farm.

- **Philosophy (0 Token Cost on Disk):** Preloading 14 comprehensive discipline files into every session prompt wastes substantial token budget and slows non-engineering tasks. Skills remain dormant on disk (`D:\zone\agent\ajanlar\_SKILLS\superpowers` or configured via `agentFarm.superpowersPath`) at **0 token cost**.
- **Composer Switch (`[⚡ Superpowers]` Toggle):** Located in the Console header strip beside the Project chip. Hovering (AFTip panel) reveals the exact Root Hook text and index of all 14 skills.
- **Root Hook Injection (`systemPromptFileFor`):** Merges the project brief and Superpowers hook into a single system prompt file. Sends only a lightweight ~2.5 KB Root Hook (`using-superpowers/SKILL.md`) and a disk path manifest to the model.
- **On-Demand Reading:** When debugging or writing code, the model references the manifest and reads only the specific `SKILL.md` needed using its own file reading tools.
- **Agent Defaults:** Default is **ON** for the `developer` agent and OFF for general fleet agents (`agentFarm.superpowersDefaults`).
- **Bridge Operations:** `superpowers.status`, `superpowers.set { agent, on }`, `superpowers.hook`.

### Slash Commands Catalog (/ Menu — 3.333.0 — 3.338.0 — K-29 — K-36)

- **Composer `/` Picker (`K-30`):** Typing `/` in the Console text box opens a dynamic search popup listing all built-in slash commands supported by the active engine (Claude Code, OpenCode, etc.).
- **Engine Parity & Filtering (`K-31`, `K-32`):** Only commands genuinely executable on that session's engine are presented, filtering out unrecognized engine tools.
- **Shell & Terminal Integrity (`K-33`):** Clean separation between PTY shell processes and hosted CLI streams; commands hand off safely to the ready environment.

### Self-Restart & Resilient Console Sessions Surviving Host Reloads (3.408.0 / 3.410.0 — X-230, X-232)

When Agent Farm updates or a new VSIX package is installed, the extension host can refresh without human intervention while preserving open conversations:

- **Self-Restart Bridge (`src/core/selfRestart.ts`):** Three dedicated bridge operations: `farm.health`, `farm.restartExtensionHost`, and `farm.reloadWindow`.
- **Deadlock and Loop Prevention:** Restart commands are fired outside bridge response handlers with a 600ms debounce gap and a synchronous 20s cooldown stamp on disk to strictly prevent boot loops.
- **Draining Active Sessions (`when: "auto"`):** Arms a deferred restart when active sessions are running, automatically restarting the host once the last turn settles.
- **Session Survival (`X-232`):** `farm.restartExtensionHost { resume: true }` seals active session IDs, spend totals, and scrollback state to disk. After host reboot, each card revives in its slot with conversation history restored from transcript **without losing continuity**.

### Composer & Session Launch Architecture (X-152 / X-180 / K-40 / U-136)

*(3.510.0 — 3.517.0)* The control strip below the composer text area (Agent, Engine, Route, Model, Effort, Permissions, Account, Superpowers) manages all **16 Launch Dimensions (`RunDimensions`)**.

- **Pure View of Host Record (`X-152`):** Eliminates fragmented individual messages and disjointed local webview state for dropdowns. The composer is now a pure view over the Extension Host's canonical `RunDimensions` record. Changing an engine or route atomically narrows child dimensions (model, effort, account) reactively without race conditions.
- **One-Click Launch from Saved Setups (`X-180`):** The `Start Session…` action opens directly into the user's **Saved Setups (Launch Profiles)** list. Clicking any saved profile **instantly launches the session** without preliminary dialog friction.
- **Responsive Shorthand Layout (`U-136`):** On narrow panels, control labels automatically adopt compact shorthand forms to prevent wrapping or overflowing.
- **Default Dialog Mode & Per-Session Filter Memory (`K-40`):** New Console session cards consistently open in clean **Dialog** mode (hiding machine traffic). Filter choices (`show`) are remembered per CLI session ID (`consolePrefs.kindsBy[sessionId]`) on the host.
- **Stop / Interrupt Safety (`S-62`):** Clicking **Stop** (or `Interrupt`) tracks trailing background shell processes (`run_in_background`), preventing delayed task notifications from spawning unprompted new turns.
- **Live Dimension Adjustments:** While the session directory (agent) is fixed after launch, model, effort, and permission modes remain adjustable mid-conversation via live control requests (`/model`, `/effort`, `set_permission_mode`).

### ‼️ Two processes cannot share one session (3.29.0)

Claude Code **cannot join a running session.** "Resuming" a session that a terminal already has open starts a **second process** on the same transcript: both write to it, neither sees the other's turns, and the session list stitches them into **one conversation nobody actually had**.

The Console now **checks who owns a session before resuming it** (the CLI's own registry: the same session id under two pids means it is busy) and **refuses by default**, explaining what a second process would mean and offering the two things that do work: **jump to the terminal that has it**, or **start a new session in the same folder**. Rows open elsewhere are greyed in the resume list. Resuming into a *terminal* (⏵ Resume in the side panel) carries the same warning, with a deliberate "open a second process anyway" for when that is genuinely wanted.

### ‼️ A Console session is a person talking (3.31.0)

A conversation held in the panel reaches the CLI over the same streaming `-p` channel a headless run uses, so its transcript records `entrypoint: sdk-cli` — and Agent Farm reads the origin off exactly that field. The result: **every Console conversation was filed as automation**, and the Sessions tables, the dashboards, the agent pages and the Turns page — all of which default to the **User** scope — showed no sign that it had ever happened. The session was indexed and live the whole time; it was simply filtered out of the view.

Agent Farm now **remembers which session ids its own Console hosted** (`globalStorage/console-sessions.json`, so a reload does not lose it) and files those as *user*. Sessions started in the Console **before** 3.31.0 stay classified as automation — the 🤖 scope chip on any sessions table shows them.

### The page is built once, then patched (3.31.0)

A streaming conversation re-renders several times a second. The page used to be rebuilt whole on each of those — which destroyed the textarea you were typing in, recreated it, and re-focused it; focusing an element scrolls it into view, so **the page dragged itself back down while you were reading something further up**, and the layout shifted under the cursor. Now the shell is built when the *shape* changes (a different session, a session that ended) and everything else is written into named slots, only when its content actually differs. What this fixes, concretely:

- **Scrolled up stays scrolled up.** The conversation element is never replaced, so the browser keeps your position; following the tail resumes by itself when you return to the bottom (or press the **↓ N new lines** pill).
- **A line you filtered out is not news you are missing.** The pill counts only lines the **show** filter lets through.
- **Your half-typed message survives** a streamed line, with its cursor where you left it.
- **No gap in the middle of the page.** The Console is a full-height app layout now: the conversation is the only scroller, the composer sits under it, and a short conversation is pushed **down onto** the composer instead of leaving a tall empty box between them.
- **"ctx now" keeps up.** It was read only from the CLI's occasional `thinking_tokens` event, so it froze at whatever the first one said; it is now taken off each assistant message's own usage — the same arithmetic the sessions tables do.
- **‼️ "ctx now" and "this session" are two different measurements (3.142.0 — X-43).** The strip reads `ctx 220.5k / 258.4k · 85%`: what the window HOLDS after the last model call, against the capacity **that session itself reports** — not the model catalogue's published ceiling (measured: a published limit of 1,05M on a thread whose Codex CLI ran an operational window of 258.400). Beside it, `… this session` is the conversation's LIFETIME SPEND, which a tool-using turn can push many times past the window and legitimately so. The AFTip carries the reading, the capacity, the fullness, **where it was read** (`stream-last-call`; for Codex, the session's own rollout) and how old it is. With no per-call source it says `—`: a session or turn total is never shown as "approximate ctx", and `ctx > window` draws no percentage.

### The card carries the session's commands (3.35.0)

A card in the left panel **is** a session, so **right-click it**: Rename · Resume in Terminal · Open transcript · **⎋ Interrupt turn · ⏻ End session · ✕ Remove from list**. Before this, the only way to end a session was to select it first — which changes the conversation you are reading — and then find the button under the box; with eight sessions in the panel that is three steps to stop the one you are pointing at.

**The menu greys items out instead of hiding them.** *Remove from list* is there from the start, in grey: it is what comes **after** ending, and an item that only appears once the session ends teaches you nothing and changes the menu's shape under the pointer. So the order is visible before you need it — *End session* greys once the session has ended, *Interrupt turn* lights up only while a turn is running. The state comes from the card itself (`data-vscode-context` → the `enablement` clauses in `package.json`); the commands still refuse politely when they are invoked another way, since `enablement` disables a menu item, not a command.

**The menu reaches further (3.38.0).** The whole point of a right-click menu is not having to go anywhere else, so Console cards also carry **📌 Pin · Label… · Copy Session ID · ⌨ Terminal**, and a **Live Timeline lane row or live-sessions card** — which is a session too — carries **📌 Pin · Label… · Copy Session ID · Resume in Console** on top of the menu it already had. Pinning from any of them now repaints **every open surface**: the trees used to be the only thing told, so a star appeared on a page only when something else happened to force a redraw, which reads as *"sometimes it works"*.

**…and does both halves at once (3.84.0): 🗑 End & Remove Session.** End and Remove stay separate on purpose — a finished conversation must remain readable — but the ordinary case is both, and it cost two right-clicks with a repaint in between that moves the card you were pointing at, so the second one lands on a neighbour. One item does the pair. The agent-side equivalent already existed: `console.close { id, forget: true }`.

**Three more things the composer got in 3.84.0:**

- **The live strip is two rows.** On one row the sentence (*"Read src/core/live.ts"*) and every figure the turn has produced competed for the same width, and whichever was longer ate the other — the tail of the meta ran off the right edge and could not be read at all. Now **row one is what is happening** and **row two is what it has cost** (duration · money · api calls/steps · held messages · model and effort), right-aligned. The gap between them is deliberately nothing: this is one strip printed on two rows, not two strips.
- **The project chip's hover scrolls.** The chip shows the *whole text* a session is being given — hundreds of lines on a real project. A native tooltip took that, drew as much of it as it felt like, cut, and could be neither scrolled nor reached with the pointer: the one surface built to make an invisible channel visible was the one that could not show what it was hiding. It hangs off the rich panel now (`media/afTip.js`, the box the backlog's `more` proved out).
- **The `show` box gained two gestures**, and they are free on **every** multi-pick dropdown in the extension: the **checkbox** toggles one value as it always did, and the **name beside it means "only this"** — one click for the move people make most, which used to be Clear plus a tick. Between *Select all* and *Clear* sit the named subsets a particular list has a word for; here it is **Dialog** (you and the agent, with the machinery out of the way). See `docs/CONVENTIONS.md` → Filtering.

### Two lines of numbers: the turn above the box, the session below it (3.35.0)

Both strips used to say **ctx** — the same session-wide figure twice, three centimetres apart — while the question you actually have about a running turn had no answer anywhere on the page.

- **Above the box, the running turn:** `⠹ Read src/core/sessions.ts — 41s · ~$0.031 (4.2k tokens) · 6 lines · 2 waiting · opus 5 · xhigh`. The CLI reports what a turn cost only when the turn **ends**, so the money is priced from the tokens seen so far, at the rates every other cost in the extension uses, and carries a **`~`** until the real figure lands. The line that closes the turn — two centimetres up, in the conversation — is the CLI's own number, in the same shape.
- **Below the box, the whole session:** `session 407c78cb · ~24.1k ctx · $0.12 (48.2k tokens) this session · 3 turns`. Context belongs here: it is what the window is holding, not what a turn did.
- **Cost is never written without the tokens that bought it**, in one order everywhere on the page — the money first, the tokens in parentheses. `$0.03` of haiku and `$0.03` of opus are not the same event.
- **‼️ …and the strip ends with WHAT is doing the thinking (3.45.0).** It gave you every *consequence* of the choice — the seconds, the money, the lines — and never the choice, so "why is this turn slow / dear?" ("because it is opus on xhigh") could only be answered by looking away at the pickers below, **which describe the next turn, not this one**. The field that closes the line is now the turn's own **model and effort**, and it is turn-scoped for that exact reason: both switches are accepted mid-conversation and both apply *from the next turn*, so the strip snapshots them when the turn starts and a switch made meanwhile cannot rewrite the turn you are watching. `system:init` is the one thing allowed to correct them mid-turn — that is the CLI naming the model we only had an alias for. The id is shortened the way every other surface shortens it (`claude-opus-5-20260514` → `opus 5`); an id with no known family is printed as it came, because a name we do not recognise is still the answer. Silence is meaningful: no model means the CLI has not said which one yet, no effort means the session never asked for one. **The finished turn keeps both**, so the strip does not lose them the instant they become final.
- **What used to close that line — `⎋ Interrupt stops it` — is gone (3.45.0).** It was a permanent instruction about a button that is on screen two centimetres below it, already labelled `⎋ Interrupt`, so it spent the strip's most valuable column repeating the composer. The Esc key it also taught now lives in that button's tooltip, where a key hint belongs.

### ‼️ A resumed session remembers what it spent (3.38.0)

A hosted process is not the session — it is **this window's turn at it**. Started empty, a resume made the line under the composer describe the process instead of the conversation: `$0.0000 · 0 tokens · 0 turns this session` about a conversation with two hundred turns behind it. And on the first turn back it printed the running turn's tokens **twice** — once above the box as the TURN, once below it as the SESSION — the same number growing in two places, three centimetres apart.

The totals now come back with the transcript: cost, tokens, turns and context, off the same index row the resume list already reads, through every door into a resume (the Console's own list, *Resume in Console*, an agent's `console.start`). The turn is the **difference** it always was. And the strip above the box says which it is out loud: `~$0.031 (4.2k tokens) **this turn**` against `$0.12 (48.2k tokens) **this session**` below.

### ‼️ The figure under the box moves while the money is being spent (3.40.0)

`s.cost` is only ever the money the **CLI has reported**, and the CLI reports a turn's cost when the turn **ends**. So for the whole length of a turn the one line under the box climbed on the left (tokens, counted off every assistant message as it arrives) and stood still on the right — and on a session that had not finished a turn yet it stood at **`$0.0000`** outright. Two halves of one figure disagreeing with each other reads as a broken number, not as a promise that will be kept in a minute.

The running turn's estimate already exists — it is what the strip above the box shows — so the session line adds it and marks the whole thing **`~`**: `~$5.75 (480.0k tokens) this session`. Nothing can be double counted: when the turn closes, its estimate is cleared in the **same step** that adds the CLI's own figure to `s.cost`. And the base is the **session's**, not this window's — a resumed conversation comes back with what it already spent (see *A resumed session remembers what it spent*), so the `~` grows **on top of** the earlier turns instead of starting the sum over.

### ‼️ The turn's figures outlive the turn (3.41.0)

The strip above the box answered *"what is this turn costing me?"* while the turn ran — and went **blank the instant the answer became final**, which is the one moment it was worth reading. The turn's own numbers were pushed into the conversation as a closing line, and then scrolled away with it. So the question you actually ask when the ball comes back — *what did the turn that just ended cost, and how long did it take?* — had no answer anywhere on the page.

The finished turn now **stays in the same place until your next prompt starts a new one**:

`✓ last turn — 41s · $0.031 (4.2k tokens) · 8 lines · your turn now`

- The figures are the **CLI's own** (`result.total_cost_usd`), so there is no `~`: by the time this exists, the guessing is over.
- It cannot be mistaken for the live strip — no motion, a settled glyph, and it says **"last turn"** out loud. A turn that ended badly says which: **⎋ last turn interrupted** · **⚠ last turn failed**.
- The invariant is one sentence: `lastTurn` exists exactly while **the ball is yours and a turn has already run**. Your next prompt clears it (`acceptUserText`), a message steered *into* a running turn does not — that joined a turn, it did not start one.
- On the bridge: `console.sessions` returns `lastTurn` (`ms` · `tokens` · `cost` · `outcome`), `null` while a turn runs.

### The model changes mid-conversation (3.38.0)

`/model` switches the model mid-session in a terminal and the next turn answers with the new one. The panel used to say a running session's model "was decided when it started" — that was never a structural limit, only one nobody had looked up. **`set_model` is a control request the CLI really handles** (verified against the installed binary: it is in the CLI's own set of handled subtypes, it validates that `model` is a string, and it answers success or error).

So the composer offers it beside the permission mode, and `console.setModel` puts it on the bridge for agents. The session, its context and its transcript are untouched; the switch applies **from the next turn**, and it is **pending until the CLI agrees** — `set_model`'s success carries no payload, so the request id is the only link back to what was asked for, and showing the new name before the answer arrives would be a promise the panel cannot keep. A refusal says so as an error and leaves the model alone.

The agent (its folder) and the effort really are fixed once the process is up, and are stated as the plain status line they always were.

### 🔒 "How many to show" is not a filter (3.38.0)

The row count does not choose WHICH sessions, only how many of them you can see — so **clear filter** had no business resetting it. The lock beside the box pins it: **on by default**, the number you set is simply how long the list is, filter or no filter, and it is remembered between sessions. Click it off and it goes back to being part of the question, clearing with the rest.

**And it says which it is without a tooltip (3.39.0).** 🔒 and 🔓 differ by a few pixels of shackle at 10px, so the state was only readable by hovering. State is carried by **colour**, all of it on one side: locked is the accent, at full saturation; unlocked has no colour at all (grayscale and faded) — which no theme can turn back into a signal. The search box also carries **its own ⨯** now: the header's ⌦ clears the whole question, the ⨯ clears just the words you retype, and it only appears while there is something to clear.

### A session can be found by its id (3.38.0)

`#407c78cb` is the handle every other surface shows — a card, a menu, a log line — and it was the one thing the resume filter did not search. Paste any part of one into the text box and land on that session. **Copy Session ID** is on the right-click menu of every card, which is where you get it from.

### ‼️ A session that outlives the window that was reading it (3.37.0)

A Console session is a `claude` the extension host spawned and reads over a pipe. Closing VS Code ends it — but an **extension reload or update is not that clean shutdown**: the new extension host starts with an empty session map while the old process is still alive, still holding its entry in the CLI's session registry.

Everything downstream then behaves correctly and the whole is a trap. The Live Timeline draws the session as running (it *is*). The panel refuses to resume it (it must — Claude Code cannot join a session another process holds). And the shelf keeps offering *click to continue* on a conversation that can never be continued.

- **The way out is offered where you hit the wall:** resuming such a session says *"still running from an earlier window of Agent Farm (pid N) — nothing is reading it"* and offers **End it and continue here**. The transcript stays on disk, `--resume` brings back everything that was said, and the resume waits until the registry has really let go instead of racing a dying process. Asked every time, because it stops a real process.
- **Never a conversation somebody else is in.** Each window records what it is reading under its own extension-host pid (`console-hosting.json`); a claim dies with the window that made it, so "another window is talking in it" can never be mistaken for a leftover.
- **End session ends the process the CLI registered**, not just the shell Agent Farm spawned — which is what stops new leftovers being made.

### The resume list, asked a question (3.36.0)

The list under **Resume an existing session** used to be a fixed sentence: your shelf, plus the fifteen newest transcripts. That answers *"carry on with what I was just doing"* and nothing else — last Tuesday's session was indexed, alive on disk, and unreachable from the panel unless fourteen newer ones had not happened.

The small button beside that row opens a **miniature filter inside the column**: text (name · agent · labels) · one agent · when (24h / 7 / 30 / 90 days / *between…* two dates) · **📌 shelf** · **🧑 mine** (hides schedule / trigger / task runs) · and **show N**, how many rows you want. Same vocabulary as the Sessions tables, deliberately not a second filtering language.

- **The list says how much of the whole it is** — `20 of 1240` — with a **clear filter** link, and the filter button stays **lit** while anything is set, even collapsed: a list that is quietly hiding things has to say so.
- **An unset filter changes nothing.** The default is exactly the old list, and **your shelf is never cut by the row count**.
- **The host answers, not the page.** The page can only filter what it was sent, and the point is to reach a session that is *not* in the newest fifteen. A closed list costs nothing — this snapshot is rebuilt on every event of every hosted session — and the answer is capped at 200 rows however wide the question.
- **A card leads with tokens now** (`482.0k tok`), with the money in the tooltip: a 250px row has space for one figure, the name needs the rest, and `$0.03` does not say whether that was haiku thinking briefly or opus barely starting. Both strips under the conversation still carry the cost in full.

### ‼️ …and it is every engine's list, not Claude's (3.113.0)

External sessions are deliberately kept out of the Claude-only half of the session index, so Claude's own analytics can never average a foreign session in. The resume list was reading that half — which made it not a filtered list but a list that hid its own subject: **every conversation you had had with Codex, Gemini or Antigravity was unreachable from the one panel whose job is to continue a conversation**, and nothing on the panel said so.

- **Both halves now.** A row still needs a folder to be offered (a session whose `cwd` was never learned cannot be started anywhere), which is the only thing that drops one.
- **Every row wears its engine, Claude included.** An unbadged row would mean "Claude" or "this list never learned about engines" with nothing to tell them apart.
- **The text box narrows on it too** — type `codex` and you see only those; a row with no recorded engine answers to `claude`, because that is what it is.
- **A resume starts on the engine the conversation was HAD with**, and the composer's model/effort are narrowed to what that engine offers before they become flags — so a Codex thread is never handed to `claude --resume`, and a Claude alias is never sent to a CLI that can only reject it.

### ⇅ What is allowed to move a card — your call (3.40.0)

The rule was written down and not enforced: the list arrived **ordered by last activity**. With two agents working in parallel that is a race — one writes a line and jumps to the top, the other writes a line a moment later and takes it back — so the 250px column shuffles under the cursor several times a second and clicking the card you meant becomes luck.

**⇅**, to the right of **＋ New session** — the same language as the **⌕** on the resume list, at the other end of the same column — opens a miniature panel. Three answers:

- **`cards never move` — THE DEFAULT.** Cards sit where they arrived (newest first) and stay there. A still list costs nothing to read, and the counter above it already takes you to whoever is waiting, on a click.
- **`waiting for you first`** — the only thing that earns the top is **the ball being yours**: *needs permission* first, then *your turn*. It is a **lift, not a new home**: answer it and the card drops back where it arrived. Within each group nothing moves at all, and a phase changes a few times an hour rather than ten times a second — so this is calm as well as useful: it is the panel's actual subject, sorted.
- **`busiest on top` — damped.** A card may climb only after it has shown **`after`** separate signs of life, and once the order changes it is **held still for `hold` seconds**. The ping-pong two parallel agents produce therefore happens once per hold instead of several times a second. Set **`after` 1 · `hold` 0** and you have the old instant behaviour back, exactly — deliberately left expressible.

The setting is remembered; closed, the column shows nothing but the small button, and the button says with a blue outline when the order is **not** the plain "nothing moves" — a list that can shuffle under you has to say that it can.

### ‼️ The wait grows by itself (3.35.1)

The left panel's whole design is *"the nudge is **time**, not animation"* — a card that has been waiting says `your turn · 41m`, and the line above the cards says `● 3 waiting for you · longest 41m`. Every figure there is written during a **data push**, and a push only arrives when the CLI says something; a session waiting for **you** says nothing, by definition. So those figures were written the moment the turn ended and then stood at `0s` for as long as you were away, telling you the opposite of what they exist to say.

The clock is now a reason to redraw on its own: the left panel re-renders every 10 seconds. Only that panel ticks — it is the only time-dependent part of the page — and a tick where no text actually changed writes nothing.

### Sessions outlive the tab

Closing the Console tab does **not** kill a conversation; sessions end when you end them, or with the window.

### Where to open it

- **💬 Console** in the global nav (on every page) · **`Ctrl+Alt+C`**
- The **💬** button in the **Agents** view title bar (side panel)
- **Right-click an agent → Talk in Console…**
- The **💬 Console** button at the top of the agent page

All of them open the Console with that agent **preselected in the composer**; **no process starts until you say something.**

### The composer has two modes

- **New session:** agent · model · effort · permission-mode pickers + your text → **Start session**. Toggling the **`⑂ Relay`** chip below the composer initiates the session directly as leg 1 of a baton chain.
- **Running session:** the agent/model/effort pickers are **gone** (they were decided when the process started and cannot change — dead boxes helped nobody). In their place a plain status line (`dev · haiku`), live permission mode controls, and baton relay hands on the status strip: **`⑂→`** (*Pass now* — trigger handover immediately), **`✕⑂`** (*Stop chain* — halt subsequent relay legs), **`⑂+`** (*Attach relay* — seal running session as leg 1), **`↪`** (*Continue from handover* — open fresh composer from handover note), and the blue **`⑂ n`** indicator ([detailed architecture](#baton-relay)).

**Bridge:** `console.start` · `console.send` (goes **into** a running turn; `hold:true` parks it) · `console.queue` (read what is held · `edit` · `drop` · `send` · `clear`) · `console.sessions` (reports `asking` when a turn is parked on a question) · `console.interrupt` · `console.setModel` · `console.setEffort` · `console.answer` (settles a parked *question* — never a tool permission, which stays the user's call) · `console.permissionMode` (with `retry`) · `console.close` · `baton.status` · `baton.pass` · `baton.stop` · `baton.now` · `baton.attach`.

> **Verification:** `test/smoke_console_live.js` drives **real** claude processes end to end (answer · mid-turn steering delivered inside the turn · hold + edit + hand-over · interrupt in flight · a refused write · the live grant · the retry that really writes the file · a clean close): **27/27 for $0.112**. It stays out of `npm test` because it spends money. The measurement also caught the one design error worth naming: the CLI emits **nothing at all** until its first stdin line, so holding the first message until the session "looks ready" deadlocks forever — the first message is now always sent.

### Question Auto-Timer Resolution

Prevents unattended sessions parked on `AskUserQuestion` prompts from blocking campaign queues indefinitely when no human is present (`src/core/autoAnswerTimers.ts`).

- **Timeout Configuration:** `agentFarm.console.autoAnswer.timeoutSeconds` (default 300s, clamped 5–7200s; toggled with `agentFarm.console.autoAnswer.enabled`).
- **Autonomous Selection Matrix (`src/core/autoAnswer.ts`):** Upon timeout expiry, chooses the option explicitly flagged `(Recommended)` / `(Önerilen)` by the agent, or falls back to the first available option.
- **Destructive Action Safeguard (`destructive` Refusal):** Questions containing destructive verbs (`delete`, `drop`, `purge`, `remove`, `destroy`, etc.) in their title, body, or options refuse automated timer resolution by architecture (`refused: destructive`). Tool permission prompts (`PreToolUse`) never execute on a timer; human approval remains mandatory.
- **Host-Resident Clock:** The timer lives in the Extension Host process rather than the webview, remaining fully active even when the Console webview is closed or navigating away.
- **Agent and Ledger Transparency:** Answers route through `ConsoleHost.answer()`, explicitly informing the model that the selection was made via auto-timer rather than a human user. Transcripts record `⏱️ Zaman aşımı: önerilen seçenekler seçildi — <question> → <pick>`. The UI card displays a countdown (`⏳ 4:31 left — then "…" is chosen for you [Stop timer]`). Only the person's own Stop timer button stops it, under every filter including `off` (no bridge op can); a pick or a keystroke on the card never does — the host keeps the half-made choice (`askPicks` → `ConsoleHost.noteAskPicks` → `AutoAnswerTimers.note`), and at expiry sends the person's picks and fills only the questions left open with the recommended option (`src/core/autoAnswerPicks.ts`). The transcript marks each answer `(senin seçimin)` or `(önerilen)`, and the agent is told which questions the timer filled and what the user had typed but not sent.
- **Why No Clock Runs, Where You Look (`src/core/consoleNeeds.ts`):** A Console question no timer will answer (a listed word, the strict filter, nothing to pick, the timer switched off, or a person's Stop) is a **Needs You** row (`console-question`, blocking) whose line names the word and the filter and whose button opens that card in the Console; a question whose clock runs is not a row — it resolves itself. The page is redrawn only when that set changes (`consoleNeedSig`), not per streamed word. The **Telegram** card carries the same verdict under the question: `⏳ Auto-answer at HH:MM — then "…" is chosen for you`, `⏸ Timer stopped`, or `⏸ No timer: <word + filter>`.

### Background Task Rest and Steer (waiting-task & Steer)

A dedicated operational state when an agent turn completes while leaving an asynchronous background command (test suite, long build, database migration) running (`src/core/liveMonitor.ts`).

- **`waiting-task` State and Purple Card:** When a turn rests with background tasks running, status transitions to `waiting-task` instead of yellow "YOUR TURN". Renders a purple border (`var(--vscode-charts-purple)`), a `BACKGROUND` badge with a slow 4.2-second breathing animation (`animation: afdeep 4.2s`, honoring `prefers-reduced-motion: reduce`).
- **Elimination of False Alarms:** The "turn-ready" chime is suppressed while waiting on background processes. Audio alerts fire only when the background command actually completes or when genuine user input/permission is required.
- **`Steer` Mode:** The composer button transforms from Send into `Steer`, allowing the user to provide guidance or queue messages for delivery upon command completion.

### Slash Command Catalog (/ Picker — 3.333.0 — 3.338.0 — K-29 — K-36)

- **Interactive `/` Picker in Composer (`K-30`):** Typing `/` in the composer brings up a dynamic search palette containing all valid slash commands for the active engine.
- **Engine-Aware Filtering (`K-31`, `K-32`):** Lists only commands natively executable in the active conversation context, suppressing incompatible commands.
- **Shell & PTY Readiness (`K-33`):** Dispatches slash commands strictly to verified shells without pipe corruption.

### Self-Restart and Extension Host Session Survival (3.408.0 / 3.410.0 — X-230, X-232)

Enables unattended extension host restarts upon new package builds while preserving active Console conversations:

- **Self-Restart Bridge (`src/core/selfRestart.ts`):** Introduces `farm.health`, `farm.restartExtensionHost`, and `farm.reloadWindow`.
- **Deadlock and Loop Guards:** Restart commands never fire synchronously inside bridge request handlers (which would leave unlinked requests on disk and cause restart loops). Commands fire after a 600ms grace window, guarded by a synchronous 20-second cooldown stamp on disk.
- **Automated Wait (`when: "auto"`):** Arms the restart and fires automatically once all active sessions finish.
- **Console Session Survival (`X-232`):** `farm.restartExtensionHost { resume: true }` flushes active Console handles, scrollback, and token spend into a persistent revive manifest. Upon host activation, each session is revived in its exact seat with full conversation history seamlessly restored.


## What Work Costs — two figures and nine kinds of step {#ne-kadar-tutuyor}

*(3.61.0 – 3.63.0)* Five investigations went looking for a token-counting bug because two builds seemed to report different totals for the same work. There is no counting bug — and proving that took an experiment nobody had run.

### The experiment: freeze the data, swap only the code

Every earlier check either **read** the two builds' source and pronounced them the same, or compared **two live sessions** — which changes the code *and* the data at once and can therefore decide nothing. So 3.56.0 and 3.60.1 were built into separate worktrees and their own `parseSessionFile` + `PricingEngine` were run over **the same 355 transcripts**: **4 329 012 662 tokens and $8975.1433 from both**, zero sessions differing, per-turn arrays identical. The figures are right in absolute terms too — an independent parser sharing no code with the extension returned 6.866M / 6.856M / 10.759M for the three turns under dispute, matching the page.

### ‼️ The fault was the UNIT

A raw token total is **94–99 % cache reads**, and the plan's rolling limit charges a cache read at about a tenth of a fresh input token (output at five, a 1-hour cache write at two, Opus at five Sonnets). So the raw figure is dominated by the cheapest thing in it and **is not proportional to the wall it appears to describe**. Measured across 32 days of real transcripts, raw ÷ weighted for a peak 5-hour window ranges **0.80× to 3.86×**.

**So every token figure now carries both.** Raw first, then `⚖` and the weighted twin — Console cards, the live turn strip, the finished-turn line, the session line under the composer, the resume list, the Sessions tables and their per-turn fold-outs, the Turns page, the session viewer's Tokens card / turn band / turn table / Markdown export, the Dashboard's agent tables and range card and 5h card, the Portfolio's 30-day columns and fleet row, the Live Timeline cards, the sidebar hovers, the status-bar lap chip and tooltip, and the fleet report. One definition (`QUOTA_WEIGHTS` in `pricing.ts`), summed off the **same lines, inside the same dedup guard, from the model that served each one** — so the two can never tell different stories. A sub-agent on haiku is weighed as haiku.

### ‼️ Cache writes are priced by TTL, and the 1-hour rate is the one that applies

3.61.0 set the cache-write weight from the published **5-minute** ratio (1.25×) *without first checking what the transcripts contain*. They contain the answer, in a field nobody had read: `usage.cache_creation` splits the write by TTL, and across 3 813 assistant lines in the 40 newest transcripts **17 923 938 of 17 923 938 cache-creation tokens were `ephemeral_1h` and zero were 5-minute**. A 1-hour write costs **2×** input, so every ⚖ figure was 1.6× light on the most expensive thing in a turn. `toUsage()` now reads the split and prices each half at its own rate; a block reporting no split is charged at the **1-hour** rate, because under-stating what a turn cost the limit is the failure being fixed.

### The limit, measured against the real endpoint

Utilization was sampled from the plan's own endpoint twice inside one window (both readings carried the same reset time, so they are the same window): **29 % → 82 % in 28.1 minutes over 96 API calls cost 38.13M raw** — 0.72M raw per percentage point, i.e. **a full 5-hour limit of ~72M raw**, almost exactly the "it used to fill at 75M" that started this. Then the account changed, and a fresh window reached **42 % on 3.15M raw** — an implied limit of **7.5M raw**, ten times smaller. In *weighted* terms those two windows imply 46.9M and 23.8M: the gap closes from **9.6× to 2.0×**. The unit does most of the work — the first window was 98.7 % cache reads, the second 27.6 % cache **writes** — but a 2× residual remains, and with two different accounts there is no way to tell whether that is the weighting or two different allowances. Settling it needs two differently-shaped samples inside **one** account.

### Nine kinds of step

A turn was a list of things that looked alike: `Read D:/x.ts` and the model reasoning for nine seconds drew the same row, though one runs here for free and the other is billed at the output rate — so *"where did my limit go?"* had no answer on any page. The categories were **counted before they were written** (60 transcripts, 21 705 lines): Bash 1349 · Edit 1086 · Read 636 · PowerShell 425 · Grep 230 · Write 168 · `mcp__obsidian__*` 45 · `mcp__playwright__*` 13 · WebFetch 5 · WebSearch 5, plus the harness tools.

| | kind | what it costs |
|---|---|---|
| **◈** | thinking | model reasoning — billed as **output**, the dearest token there is |
| **▸** | reply | model writing — output |
| **⌘** | local tool | runs on this machine — **free to run**; its result is paid on the *next* call |
| **⇄** | MCP tool | a request to an MCP server — no model tokens |
| **⌗** | web | out to the internet — no model tokens; the page comes back into context |
| **⑂** | sub-agent | its own conversation with its own context, spending this session's budget |
| **⚙** | harness | inside the CLI — no model, no network |
| **↩** | tool result | free to produce; **this is what makes the next call bigger** |
| **·** | local only | never reached a model |

**‼️ Thinking was the invisible one.** 1 737 thinking blocks against 878 text blocks — the model reasons about twice as often as it speaks, every one of those tokens is billed at the output rate, and nothing counted them. The rows are still not rendered (they are the model's private working) but the turn says how many there were.

### `26api·99steps` — the pair, and what each number covers

Every surface that sizes a turn writes the same string: **round trips first, then every step they carried**. They are two measurements of the *same* turn on two scales, never two parts of one total — the 99 steps arrived **inside** the 26 calls, so they are not added and the separator is a dot for exactly that reason (`14api/26` was being read as "14 out of 26"). The tokens follow the **calls**.

**And the second number is now actually the total.** A step was defined as *"a reply fragment or a tool call"* — which left the model's own reasoning, the kind the table above prices highest, out of the figure that called itself the total. Measured over this machine's six largest recent transcripts (2026-08-07): **149 replies + 1 583 tool calls counted, 490 thinking blocks not** — 1 732 reported against a true 2 222, a **22 % under-count**, and the missing fifth was the expensive part. A step is now any of the three things an agent does: **it reasoned, it wrote, or it called a tool.** A tool *result* is still not one — it is the answer coming back, and results run 1:1 with calls (1 582 against 1 583 in the same measurement), so counting them doubles the figure.

**One counter, three places, no drift.** The transcript parser (`core/sessions.ts`), the session viewer's own pass and the Console reducer (`core/consoleproto.ts`) count the same three block types. The Console's live strip in particular no longer works the number out from the rows on screen: that swept in every tool result and every system row the panel writes for itself, and it could not see a thinking block at all — too big and short of the dearest step at the same time. Each turn also carries `thinking`, so the hovers can break the total into **reasoning / tool calls / replies** with each one's share.

**Each step also carries what its API call spent**, raw and ⚖, written **once per call, on its first block**. A row with no figure did not cost nothing — it rode on the call above it, and the tooltip says so. Live in the Console conversation, in the working strip (the spinner leads with the *category* of what is happening), in the transcript page's meta line, and in the Markdown export.

**Where the key lives:** the chips are one glyph each and the strip has no room for a legend block, so it hangs on the **session id at the far left of the line under the composer** — the one label always on screen and never moving. Hover `session cb489864` and the whole scheme is there. The transcript page carries the same legend as a visible strip above the conversation. A browser driven over MCP (`mcp__playwright__*`, `mcp__chrome-devtools__*`) is filed as **web**, not MCP; a tool nobody has listed reads as **local**, the assumption that costs nothing when it is wrong. The webview's copy of the table is held identical to `src/core/stepkind.ts` by `test_step_kinds.js`.

### It is all a setting

These numbers are the provider's rate card, not ours; one of them moving must never need a release. Under **Settings → Cost & budgets**:

- **`agentFarm.quotaWeightMode`** — `model-aware` (default: Opus 5, Sonnet 1, Haiku ⅓) · `model-flat` (weigh the *kinds* of token, ignore which model ran) · `raw` (⚖ becomes the raw total — off without ripping it out).
- **`agentFarm.quotaWeights`** — the whole table. Per model regex: `input`, `output`, `cacheWrite` (5-minute), `cacheWrite1h` (1-hour), `cacheRead`, all relative to **one Sonnet input token = 1**. Deliberately separate from `agentFarm.pricing`: correcting a billing rate must not silently move the limit gauge.
- **`agentFarm.quotaBrakeBasis`** — which figure the quota guard and the model-downgrade rule read: `whichever` is further along (default) · `weighted` · `raw`.
- **`agentFarm.windowWeightedTokenLimit`** — the 5-hour ceiling in weighted tokens. Defaults to 0 and **changes nothing until set**; `windowTokenLimit` keeps working exactly as before.

Changing the table re-reads every transcript on the spot — the ⚖ total is summed *during* the parse, so a new rate with old arithmetic behind it would be worse than none. An unusable table (empty array, a typo in a regex) falls back to the shipped one rather than quietly zeroing the gauge being watched.

**Bridge:** `usage.window` returns the rolling 5-hour window in **both** units plus the ratio between them and the percent against whichever ceilings are configured. For the real subscription figure from Anthropic, `usage.plan`.

## Starting and Steering Sessions {#oturum-denetim}


### Active Duration vs. Idle Break Precision (S-52 — `src/core/sessionSpan.ts`)

Previously, session `Duration` simply measured elapsed clock time from first message to last (`lastTs - firstTs`), causing a session resumed the following morning to read as running continuously for 36 hours.

- **`sessionSpan` Engine:** Separates active execution time from idle inter-turn breaks (`50m ⋯25.8 h`).
- **`agentFarm.sessionBreakMin` Setting:** Defaults to 30 minutes (0 disables). Gaps exceeding this threshold are deducted from active work duration.
- **Derived Metrics Accuracy:** Hourly cost rates, minutes per turn, and seconds per API call divide exclusively by active work time rather than overnight sleep.


*(3.24.0)* Agent Farm could **see** sessions; now it can **touch** them. Four parts: what a session starts with, which sessions stay within reach, how a running one is stopped, and how all of it is reached from the keyboard.

### Start Session… — what a session starts with (A1)

Every session used to open as a bare `claude`, with the model, the effort, the permission mode and the first sentence typed into the terminal by hand. There are two layers now:

- **Defaults that apply to every session — `agentFarm.launchDefaults`.** `model` · `effort` · `permissionMode`. Set once; **Start Session, Continue Latest and Resume** all carry them. Every field is optional and **an empty one emits no flag at all** — with the default `{}` a launch is exactly the bare `claude` it always was.
- **The Start Session… launcher** (`Ctrl+Alt+S`, the 🚀 in the Agents view title, the agent right-click menu, the **Start session…** button on the Agent Detail page). One picker that stays open: every row is a dimension of the launch, the top row is the trigger — and **its description is the exact command line that will run.** No hidden flags.

| Row | What it does | CLI / System Flag |
| --- | --- | --- |
| **▶ Start** | launches; its description is the full command line | — |
| Agent | which folder it opens in | `cwd` |
| Where | **a terminal or the Console** (`surface` / `interactiveTarget`) | — |
| Engine | Claude, Codex, Gemini, OpenCode, OpenClaw | `--engine` |
| Model | from your own model knowledge base (`agentFarm.modelAliases`) + free text | `--model` |
| Effort | low · medium · high · xhigh · max | `--effort` |
| Permissions | plan · acceptEdits · auto · manual · dontAsk · ⚠ bypassPermissions | `--permission-mode` |
| Route (Provider) | Claude / OpenRouter provider route | `providerId` |
| Tier | Provider tier | `tier` |
| Account | Explicit slot or smart policy (`@standing`, `@emptiest`, `@round-robin`, `@rule`) | `account` |
| Superpowers | Agent engineering discipline hook On/Off | `superpowers` |
| Project | Associated project scope (`PRS.*`) | `projectId` |
| Session name | shown in the prompt box, the `/resume` picker, the terminal title **and Agent Farm's own session lists** | `-n` |
| First prompt | opens with an opening message instead of an empty session | positional argument |

At the bottom sit the **profiles**: *Save this as a profile…* writes the current picks to `agentFarm.launchProfiles` under a name ("deep review" = opus + xhigh + plan), *Load a profile…* restores one, and *Make model/effort/permissions my defaults* promotes them to `launchDefaults`. The launcher **remembers what each agent was last launched with** — the second time you start the same kind of session it is one Enter.

#### Terminal or Console — every start asks (3.41.0)

A session has had two places to live since the [Console](#console) arrived, and the start commands still knew only one: **Start session**, **Start session…** and **Continue latest** all went to a terminal without a word, so the newer half of the product was invisible from every button that starts a conversation. Now the question is asked, once, wherever you are:

- **On the Agent Detail page** all three buttons keep their names and open a **two-item menu** under themselves — *In a terminal* / *In the Console* — the same menu shape the claimed nav buttons use. (Two buttons side by side would double the toolbar for a choice made in one keystroke.)
- **Everywhere else** — command palette, a tree row's right-click, `Ctrl+Alt+S`, the Dashboard's and Portfolio's own start buttons — a **QuickPick** asks the same two words and remembers what you picked last (`• last used`).
- **In the launcher** it is the **Where** row, a dimension of the launch like the model is. In Console mode the Start row prints the launch summary instead of a command line, because a command line is not what runs there.
- **For an agent**: `sessions.start` takes `surface: "terminal" | "console"` (default `terminal`, validated, never guessed).

**‼️ …and under WHICH PROJECT, asked first and answered "none" by default (3.84.0).** The QuickPick opens with a single **`Project`** row above the two places — one row, never the list of project names, which lives one step in behind it. Two questions in the order a person thinks them: what is this work, then where do I want to sit while I do it. Three rules hold everywhere a new session is started:

- **The answer starts at `◧ No project`, every time, wherever you start from** — the picker, the launcher's own **Project** row, and the Console composer's project box. It used to inherit the window's active project, so one choice made in the status bar hours ago, for other work, silently filed and briefed every session started afterwards. The status bar's active project is still the *window's* answer; it is no longer this session's, and neither writes the other.
- **The choice is per launch.** Answering it here does not move the status bar. (`agentfarm.setActiveProject` is the command that does, and it is unchanged.)
- **▶ → In the Console opens the composer; it does not spawn.** The agent comes **pinned** — its name where the picker was, with a ✕ that gives the picker back — and the project box stays live, because the project rides in on the system prompt *at spawn* and before your first message is the only moment it can still be chosen. The CLI starts when you send.
- A **resume** is never asked: its project was decided when it started and `stampSession` refuses to overwrite that, so the answer would be thrown away.
- For an agent, `sessions.start` still takes `project?` and still inherits the window's active project when it is omitted — an agent has to be explicit either way, and its `describe` says the UI does not inherit.

Two things make the Console path honest rather than approximate:

- **A hosted session has no `-n`.** The name you typed is applied through Agent Farm's own title store the moment the CLI reports the session's id — it is not silently dropped.
- **`--continue` is a terminal affordance:** the CLI picks the folder's newest session itself. A hosted session resumes by **id**, so *Continue latest → In the Console* resolves "latest" from the index (that agent's folder, newest first) and hands it to *Resume in Console*. If there is nothing to continue it **says so** and offers a new session, instead of opening an empty conversation that looks like it lost its history.

**Where the session name is read from (3.24.1, rule corrected in 3.29.0):** the name given with `-n` is **never written to the transcript** — it lives in the CLI's own live registry (`~/.claude/sessions/<pid>.json`), a file deleted when the process exits. Agent Farm reads that registry and **remembers** the name.

> **‼️ The distinction that matters:** Claude Code names **every** session — one nobody named gets an invented label (`basit-2e`, `developer-07`), marked in the registry as **`nameSource: "derived"`**. Agent Farm adopts **only names a human chose** (`nameSource` anything but `derived`, or a name Agent Farm passed itself with `-n`); an unmarked name is not trusted. **A session you start without naming keeps the title derived from the first real thing said in it**, exactly as before.

A session's title therefore has three sources, in this order: **your rename → the name it was started with (`-n`) → the title derived from the conversation**. Nothing is lost behind a name: whatever it replaced stays in the row's tooltip.

**‼️ And "derived from the conversation" means the conversation, not the machinery's own voice.** Several things ride in a transcript as ordinary user messages: `<…>` command blocks and local-command output, `/…` typed commands, `!…` shell passthrough — and **bracketed notices**, which is the one that got through: a real session came out named `[Request interrupted by user]`, named after a *state* rather than after anything anybody said. **The distinction:** only a message that is **entirely** one bracket is machinery. `[Image #2] look at this file` is a person talking with an attachment in front of them — measured, a real title in this vault — so the marker is stripped and the sentence names the session; a blanket "starts with `[`" rule would have destroyed a good name while fixing a bad one. One place decides (`conversationTitle`), and the session page asks it rather than carrying its own copy — two copies is how the rule drifted apart in the first place, and a page disagreeing with the tables about a session's name is a bug explicable from neither side. The same judgment governs the **opening prompt** shown on hover, so the two can never say different things. Measured: of 333 named sessions, 2 changed and both improved.

Free text (name, first prompt) is always quoted: `"` becomes `'`, a backtick (PowerShell's escape character) is dropped, newlines become spaces — it cannot break out of its quotes in any of the three shells (PowerShell · cmd · sh). `$` and `%` are **deliberately left alone**: mangling the user's own text silently is worse than showing the command line, and if a shell would expand a variable **you see it on the Start row**.

### The shelf — pin and labels (A2)

Among hundreds of transcripts are the six you live in. **★** puts them on the shelf:

- The **★** at the start of each row in the Sessions tables (Dashboard + Agent Detail) — a filled star means shelved. **A pinned session is listed first and is exempt from the row limit**: *Show 20* gives you 20 rows *plus* the whole shelf, so pinning a seventh never hides a sixth. The **★ Pinned** chip in the filter panel narrows the table to the shelf alone.
- **Labels:** *Label Session…* (session right-click) takes comma-separated free-text labels — `zen, release, customer x`. They render as chips on the row and **the table's text filter searches them too**, so typing "zen" catches both the titles and the labels.
- **The Recent Sessions tree**: pinned sessions sit at the top with a 📌 icon, outside the 30-row cut; the pin button on hover and the right-click menu do the same.
- **Session shelf…** (`Ctrl+Alt+P`, the 📌 in the Recent Sessions title): the shelf itself — pinned first, then the last 20 sessions; **Enter resumes the session in a terminal**, 📖 opens the transcript, 📌 pins or unpins.

Pins and labels are attached to the session **id** and kept in VS Code's own storage: the transcript file is untouched, and re-scans and restarts leave them alone.

### The session right-click — the same eleven things, everywhere (3.41.0)

A session shows up in six places, and the right-click menu existed in two. On a Console card or a Timeline lane it offered the whole set; on a **Sessions table row** (Dashboard, Agent Detail), a **Turns row**, a **search hit** or a **mission's live feed** it offered *Cut / Copy / Paste* — so the answer to "how do I rename this?" depended on which page you happened to be looking at.

One contract now, on every one of them (`media/afSessionCtx.js` + one `webviewSection == 'afSessionRow'` block in `package.json`):

| Group | Items |
| --- | --- |
| open | Open Transcript · **Resume in Terminal** · **Resume in Console** · Focus Session Terminal |
| mark | Rename Session… · Pin / Unpin · Label Session… · Copy Session ID |
| stop | Interrupt Session · End Session · Clear From Live Timeline |

Two design rules make it work rather than merely exist:

- **A row publishes only what it knows.** `sessionId` *or* the transcript path is enough — a search hit knows only the path, a fresh Console card knows only its host id. One host-side resolver (`sessionFromArg`) fills the rest in from the session index, and the row's own `title`/`cwd` win over the index because a row that was just renamed is newer than the last scan. That is what makes the **next** session surface free: publish the contract, get the menu.
- **The normal menu stays.** `preventDefaultContextMenuItems: false` — Copy/Paste are still there, and this is deliberately *not* a `contextmenu` listener: hijacking right-click would take the page's own menu away.

Timeline cards gained the one item they were missing (**Resume in Terminal**), so the two ways to pick a conversation back up now sit side by side wherever a session is listed.

### ⎋ Interrupt — stopping a running turn (A3)

Headless work (tasks, missions) has always been stoppable — the process is ours, we kill its tree. A session you are talking to is a different animal: the only thing that stops it is **the key a person would press**. So that is what Agent Farm does — it **types Esc into the session's own terminal.** Nothing is killed: **the turn ends, the session and its context stay.**

- Where: the **⎋** next to a **running** row in the Sessions tables · **⎋ Interrupt** on the Timeline's live cards · **⎋ Interrupt** on a stalled row in Needs You · `Ctrl+Alt+I` (picks a session) · the session right-click menu.
- Targeting order: (1) the terminal the session was **launched in**, (2) the newest integrated terminal named for that agent, (3) an external window. **A session that cannot be identified gets nothing** — typing Esc into a random claude window, unlike bringing one to the front, cannot be undone.
- The honest limit: in **external-terminal mode** (`agentFarm.externalTerminal`) the window is not ours to type into — there the window is brought to the front and you are told to press Esc in it. No fake button.
- Bridge: `sessions.interrupt` returns the same distinction as data (`interrupted: false` + the reason).

### The keyboard (A4)

A 173-command extension had exactly one shortcut. Now there is a **hub** and six direct keys — all of them re-bindable in VS Code's Keyboard Shortcuts editor:

| Key | Opens |
| --- | --- |
| **Ctrl+Alt+F** | **Quick Menu** — a grouped, type-to-filter list: Sessions · Pages · Work · System. Every row **prints its own shortcut**, so the menu teaches the direct keys instead of replacing them. |
| Ctrl+Alt+S | Start Session… (the launcher) |
| Ctrl+Alt+P | Session shelf… (pinned + recent) |
| Ctrl+Alt+I | Interrupt session |
| Ctrl+Alt+D | Dashboard |
| Ctrl+Alt+N | Needs You |
| Ctrl+Alt+L | Live Timeline |
| Ctrl+Alt+A | Add to Work Queue |

**Keyboard-layout note:** on Windows, Ctrl+Alt is AltGr. On a Turkish-Q layout AltGr types a character on **Q/E/T** (`@`, `€`, `₺`), so no shortcut sits on those three letters — the rule holds for every binding, with no exemptions, and a test enforces it. **Q is free of Agent Farm entirely:** the extension binds nothing on Ctrl+Q either (that key is VS Code's own *Open View* — `workbench.action.quickOpenView`).

## Projects, Portfolio and Code Changes {#projeler-portfoy}

*(3.25.0)* The farm knew agents and sessions — and nothing **above** them (a grouping), nothing **across** them (the fleet as a portfolio) and nothing **below** them (the code an agent actually produces). All three arrived here.

### Projects — the umbrella everything hangs under

*(3.52.0 — rebuilt.)* A project used to be a name in a setting that grouped agents so cost could be summed per customer. It is now an **entity**: an immutable id, a freely chosen name, a status, a documents **folder**, code roots, people, budgets and dates — while still owning almost no data of its own. Sessions, tasks, missions, notices and commits keep living exactly where they lived; the project is the **join** over them.

**Where it lives.** Two stores, one owner each. The project's **folder** holds everything a human writes (charter · plan · people · worklog, plus notes, decisions, deliverables, resources, archive) — it travels in git, opens in Obsidian with no extension running, and can rebuild the registry. `globalStorage/projects.json` holds only the registry and the **session link table**. That table is the one thing here that cannot be rebuilt from anything on disk, which is why it is written atomically and why the store re-reads before every mutation (two windows, one file).

**Agent Farm never depends on a document's file name.** Charter, plan, worklog and the rest are found by an `af-role` line in their frontmatter. Rename them, move them into a subfolder, write them in any language — nothing breaks. The same `af-id` is what lets a folder **renamed in Obsidian** be recognised as the same project on the next rescan, and a duplicated folder be reported instead of quietly claiming to be the original. `agentFarm.projectSkeleton` replaces the shipped layout wholesale for vaults with their own naming convention; a custom template that forgets `af-id` gets it added, but a key it *declares* is never overwritten.

**Membership — one order, five steps.** An agent may work on as many projects as it actually does; the old one-owner rule is gone. Cost hangs off the **session** instead — the atom that already has a working directory, a time and a dollar figure — and resolves as: explicit assignment → explicit **no project** → longest matching folder root → agent rule → `Unassigned`. Every session still lands in exactly one bucket, so the figures still sum to the fleet total.

Two of those steps are not decoration. **Longest root wins** fixes a silent misattribution: with `…/miropharm` and `…/miropharm/muvu_talkScribe/ZEN` both declared, first-match handed every ZEN session to the wrong project and both answers looked plausible. **Explicit "no project"** is a real state: without it, taking a session off a project let the rules put it straight back and nobody would learn why.

**The active project — what it actually does.** *(3.53.0.)* Setting one **files the sessions you start in that window**: the Console stamps at the first event carrying a session id, a terminal launch stamps when the live monitor binds an id to it, and the project recorded is the one the session **started** in — not whatever the bar says by the time the id arrives. The stamp is deliberately weaker than filing by hand: it writes only where the link table holds nothing at all, so resuming a session you had put elsewhere — or had explicitly taken off every project — keeps what you chose. Missions and notices are **not** stamped yet, and nothing in the UI says they are.

**And you are asked, wherever you start from** *(3.56.0)*. The Console's composer had a project box and no other start path did, so pressing ▶ on an agent in the sidebar filed the session under whatever the status bar happened to say and never mentioned it — the same "new session", two different offers, decided by which button you pressed. **Where** a session runs and **what** it belongs to are dimensions of the same launch, so they travel together: the one-click Start shows both, the full launcher carries Project as a row next to Model and Effort, and both open the same list the status bar opens. A **resume** is not asked — its project was decided when it started, and the answer would be thrown away.

**A resume is told about its OWN project, and is never re-filed** *(3.56.0)*. It used to inherit the window's: a session belonging to *A*, resumed while the bar said *B*, was handed *B*'s brief — the agent then read a state summary for a project it was not working on and had no reason to doubt it. Worse, a session that belonged to *A* only by a rule got an **explicit** *B* assignment written for it, and an explicit assignment beats every rule, so the move was permanent and silent. Now the project comes from the membership order — the same answer every other surface gives — and a resume writes nothing. A terminal resume is re-told too: the flag does not survive `--resume` (measured), and that path was not re-passing it at all.

### The project session protocol — picking a project puts the agent inside it

*(3.54.0.)* A session started under a project **arrives already knowing it**, with the user writing nothing. Before the first message it is given the project's name, its documents folder, its code roots, and a generated **brief**: status, summary, people with their roles, **which file holds which `af-role`**, and the latest worklog lines. The role map is the part that pays for itself — an agent that knows where the worklog is writes to it instead of reading the folder to find out.

**The channel is `--append-system-prompt-file`, and every part of that was measured** (`test/smoke_project_context.mjs`, against the real CLI):

- All three spawn paths run under a shell. **Inline multi-line text survives none of them** — as an argv entry the arguments are concatenated unquoted (`unknown option '---'`); in a command string the newlines break the line. A file path survives all three.
- The flag **exists** even though `claude --help` does not list it among the flags.
- The path is **quoted by Agent Farm**; unquoted, one through a folder named "John Doe" arrives cut at the space.
- The context **does not survive `--resume`**, so it is passed again on every spawn — from the single place each command line is built, which is what makes that true by construction.

**Transparency is not optional here.** The channel leaves no trace in the transcript, so the Console shows a chip above the composer — `◧ <project> — project context active` — whose hover is **the text itself, verbatim**. With no project it says so rather than vanishing. Session rows carry the project they were started under.

**Cost:** a full context is **538 input tokens** (1632 characters — 3.03 chars/token, not the 4 the English rule of thumb assumes), landing in cache-creation so later turns re-read it at ×0.1. The brief is capped at 2500 characters, cut on a line boundary, with the path to the full text appended.

**Reach.** Console sessions, terminal launches and headless tasks all carry it — a task from the project it was **created** under, because a queued task can start hours later in a window that has moved on. A named CLI profile runs a different binary and is left alone. A session you resume yourself in your own terminal gets nothing (measured) — but `_AF/BRIEF.md` is a real file in the project folder, so it can still be read there.

**The window only speaks for tasks a person made** *(3.54.1)*. "Created under" is the right stamp when someone was looking at the window when the task appeared. A **schedule** firing at 03:00, a **trigger** reacting to a file, an **auto-delegated insight** — nobody was, and handing an unattended run a project's context plus "record what you did in its worklog" is worse than handing it nothing. Those three get no project. Binding a schedule to a project is something to declare **on the schedule**, not to infer from a window; Run Now is included, because a button that produces a different run from the timer is not a test of the timer. **Retries and later workflow steps inherit their origin** — the original task's project, or the project the *run* started under, including when that was none.

**`agentFarm.projectContextExtra`** adds one line of your own to every context — where an installation points its agents at its own rules. Empty by default.

**Surfaces.**
- **Sidebar section** (under Agents): the **active project** row is always there, even when none is set — a stamp applied invisibly is exactly the automation nobody should have to trust blindly. **Unassigned** is always last, showing a number that starts out embarrassing, because a rule that fails quietly is not a rule.
- **Its own page** (`◧ Projects`, second in the global nav): every field is edited here — name, status, kind, icon and colour, folder picker, code roots, people **with their roles** (who decides, who pays, who does the work, who you ask), daily *and* total budget, dates, tags, agent rules. Nothing goes into `settings.json`. **Creating one happens here too** *(3.53.0)*: the form asks for the name and the documents folder (with Browse, and a suggestion that follows the name until you take it over) plus status, kind, summary and code roots. Every other route — the palette, the sidebar's empty state, "new project from this session", the "New project…" entries inside the active-project and agent-rule pickers — opens that same form, over one implementation, so the folder skeleton and the error wording cannot differ by which button was pressed.
- **`Sessions (n)`** on a project opens the sessions table **already scoped to it**, and scrolls to it *(3.53.0)*.
- **Every session row, everywhere.** One entry on the shared right-click contract reaches all six surfaces that list sessions (Console · Missions · Search · the sessions tables · Live Timeline · Turns), with four genuinely different outcomes: file it, move it, take it off *and keep it off*, or forget the decision so the rules speak again. Beside them: **new project from this session** (the fastest backfill there is — the session already knows the folder the work happened in) and **add this session's folder as a code root**, which turns a one-off assignment into a standing rule.
- **Status bar:** `◧ <project>`, or `◧ No project`.

**When the folder is gone.** The project does not vanish with it. It stays in the list with a warning and three answers — relink · recreate · ignore — and everything that is not documents (sessions, cost, timeline) keeps working. Nothing is ever recreated silently: a folder that moved must not become a second copy.

**One source.** A project exists in the registry and nowhere else — there is no settings-file definition of the same thing, and no adapter between two shapes of it. An agent's project is resolved by the *same* function a session's is, so the portfolio page and the cost table beside it cannot disagree about whose job something is.

### The project page — Overview · Timeline · Sessions · Cost

*(3.55.0.)* The page could only be **edited**; it could not say what had happened. It has tabs now, and the Faz 1 editor is one of them (⚙ Settings).

**Timeline is the join over everything a project touches** — sessions, the turns inside them, what each session wrote, tasks, mission runs and their rounds, and git commits in the project's declared code roots. Each row deep-links to what it is about. A session is **one** row (stamped where it ended, since the list is read newest-first), and a session's file writes are **one** row: per-file rows would let a single refactor own the day.

**Membership is decided in one place.** `core/projectFeed.ts` is pure and takes rows that already belong to the project; the judgment stays in the resolution order (`core/projects.ts`). Sessions resolve through that order, tasks and missions carry `projectId`, commits come in through a declared code root, and decisions, deliverables and completed plan items come out of the project's own folder *(3.57.0)* — their membership is not a guess at all. **Notices and queue items carry a stamp of their own** *(3.107.0)* and appear when somebody set one; nothing is ever derived from who posted a message, because that is the "an agent owns one project" mistake in a friendlier font. An unstamped one is simply absent, which is the honest answer rather than a plausible one.

**‼️ A document event needs a date the DOCUMENT states, or it does not appear** *(3.57.0)*. A decision states `af-date`; a deliverable states its Date column; a plan item carries the ✅ Obsidian's own Tasks plugin writes when you tick it there. A deliverable due "Q3", or an item ticked from Agent Farm (which writes no ✅), is left **out** rather than stamped with the moment the file happened to be saved — a hundred rows landing at one instant is a timeline that looks precise and says nothing. The page says this too, so a missing row reads as a limit rather than a loss.

**‼️ The kind filter is applied BEFORE the row cap, and that is a measurement.** On a 150-session project, 3000 of 3690 events are turns. Capping at 300 and filtering in the page gives the reader 300 rows that are 81% the kind they switched off — the timeline showed ~50 sessions and called the rest "older" when the rest was turns. So the page sends the kinds it wants and the host cuts after filtering. `counts` is still taken over everything before any filter, so a chip says how many rows turning it on would add. Turns start off.

**Cost, and the thing a cost breakdown may not claim.** Total · today · a per-day series · burn over 7 and 30 days · what it projects at the due date · budget runway. The by-model split is derived at **turn** granularity, because that is the only place the transcript bills a model — a turn served by two models is reported as `mixedTurnCost` rather than divided by an invented ratio, and sessions with no per-turn detail land in `unattributed`. `byModel + mixedTurnCost + unattributed = total`.

**Sessions is `media/sessionsTable.js` embedded whole**, so columns, filters, sorts, the fold-open turn breakdown and the shared right-click contract come free. A button opens the Dashboard scoped to the project, for the fleet-context question the tab does not answer.

**Cost of the page itself, measured:** 150 sessions · 3000 turns · 200 tasks · 10 missions · 120 commits → **42 ms** for the whole feed and rollup. `git log` is cached per repository for 60 s and never spawned inline on a repaint; each tab's data is built only while that tab is open, because this page repaints on every fleet refresh.

### The documents — Plan · Docs · People, and the write side

*(3.57.0.)* A project could be read and could not be **kept**. Its folder had a charter, a plan, a worklog and a deliverables table from the day it was created, and nothing — no page, no agent, no op — ever wrote a line into any of them. The record only grew when somebody remembered to open Obsidian.

**‼️ Ticking a plan item changes exactly one character of your file.** The **Plan** tab draws the plan document's own checkbox lines as checkboxes, grouped by the headings the file uses, showing the 📅 and ✅ the lines carry. Ticking one replaces the space inside `[ ]` with an `x` by offset in the original text — the bullet, the spacing, the indentation, the icons, the Obsidian Tasks metadata (🆔 ⛔ ⏫ 📅) and every line ending in the file survive byte for byte. Rebuilding the line from its parsed pieces would pass the same test and quietly normalise a vault; splitting the file on newlines and rejoining it would turn a one-box request into a whole-file diff in git.

**And no ✅ done-date is added, on purpose.** Obsidian's Tasks plugin writes one when *you* tick the box *there*; Agent Farm does not write metadata it does not own. Unticking an item that has one leaves it and **says so**, rather than silently removing a line the user's own tooling put there. The page states all of this where the boxes are, because the surprising part is the restraint.

**Documents are found the way they always were — never by name.** Decisions are a new `af-role: decision`, one file each (the ADR pattern): appended to a shared document they would become lines nobody can link to, and two agents writing at once would lose one. New ones go next to the decisions already there, or into the folder the skeleton declares it `holds: 'decisions'` — never into a folder matched by its *name*, which would break the moment a vault called it something else. A title already used today gets a suffix; this can never overwrite a record that exists.

**Deliverables go into the user's own table, by its own column names.** A row is inserted after the table's last row, not at the end of the file, and each value is placed by the column that names it — so a table whose columns were **reordered** still gets every value in the right place, and one written in another language is filled positionally in the shipped order. A column the table does not have means the value is left out, never pushed into somebody else's.

**The Docs tab is the folder.** A tree with each document's `af-role` on it and machine-generated files marked as such, the selected file shown as it is on disk, and **Open** in whichever of the four doc-open modes you use elsewhere (VS Code · rendered preview · Obsidian · your own app) — the same contract the Notices and Queue boards use, rather than a fifth half-renderer to keep in step. New notes are created into a folder you pick.

**People moved to their own tab**, because who decides / who pays / who does the work / who you ask is a question **about** the project, not a setting **on** it. The registry list — the one every session is told about — is edited there, next to a link to the project's own People document. The two are deliberately **not** synced: one is structured data Agent Farm injects, the other is the user's prose about the same people, and rewriting prose from a table is a program editing an essay.

**Every write goes through one guarded, atomic path.** Read, change, write — with the mtime taken on the read handed to the write, so a save made in Obsidian in between makes the write **refuse** instead of erasing it. Writes land through a temp file and a rename, so a crash cannot leave half a document. Every path a page or an agent supplies is resolved inside the project folder and refused if it climbs out. And `projects.doc.write` will not replace a file that exists unless the caller passes the `mtimeMs` it got from reading it — a blind overwrite is the one thing this op is designed to make impossible.

**The brief got what it was missing, and stopped losing what it had.** It now carries the **open** plan items (not the finished ones — a brief's budget should not be spent on what is already done) and the latest decisions. Growing it exposed a real defect: the system-prompt cap used to cut the finished text, and the brief's **last** section is "Writing back" — where the worklog is, where the plan is, what not to reformat. So the most actionable part was the first thing dropped. The injected copy is now built to a **budget** that shortens its *lists* instead, stepping down until it fits; `_AF/BRIEF.md` on disk stays the full text, which is what the "cut to fit" pointer points at.

**Settings:** `agentFarm.projectsRoot` · `agentFarm.projectSkeleton` (a folder entry may declare `holds: "decisions"`) · `agentFarm.projectStaleDays` · `agentFarm.projectContextExtra`.
**Bridge:** `projects.list` · `get` · `create` · `set` · `rename` · `assign` · `current` · `health` · `rescan` · `sessions` (one project's sessions, each with *why* it belongs) · `brief` (the state summary; `context:true` returns the exact text a session is given) · `timeline` (the page's own feed, with `counts` taken before the filter and `unfiled` naming what cannot be filed) · `cost` (the page's own rollup, caveats included) · **`doc.list` · `doc.read` · `doc.write` · `log` · `plan` · `plan.add` · `plan.check` · `decision.add` · `deliver` · `people.set`** *(3.57.0 — the write side: an agent that finishes a piece of work records it itself, so the next session's brief is built out of what happened rather than out of what somebody remembered to type)*.

### The work — five stores, one tab, and a stamp on each (3.107.0)

*(Faz 5.)* A project could say what had **happened** and what it had **cost**. The work itself lived on five other pages, each of which had to be filtered by hand — so the question a project page exists to answer, *what is this project actually doing*, had no answer on it.

**‼️ THE STAMP IS THE WHOLE MECHANISM, AND NOTHING IS EVER DERIVED.** Tasks already carried a `projectId`; **missions, notices and work-queue items** carry one now. It is set by whoever makes the thing — the window's active project when a **person** made it, an explicit `project` argument when an agent did, a **declaration on the automation** when nobody was at a window at all — and it is changed or removed from the row afterwards. What no code does is guess: reading a notice's poster and inferring a project would file half of them wrong, because an agent works on several. The price is that unstamped work is absent from the project, and every surface says so instead of looking empty.

**A mark you cannot take off is a mark nobody trusts.** That is why automatic stamping is safe here at all. The queue's capture box **shows** the project it is about to file under and lets you change it before you press Add; every notice and every item has a project picker on its own row whose empty option clears the stamp; both boards do it in bulk over the selection. `notices.project` and `queue.project` are the same operation on the bridge.

**Both boards gained a project filter**, with **"No project"** as a real option rather than the absence of one — filtering by project must never make the unfiled rows vanish with nothing on screen saying they exist, since those are exactly the ones you are about to want to file. A filter naming a project nothing matches returns **nothing**, not everything: a filter that silently stops filtering hands back the whole board and looks like an answer.

**The Work tab** groups all five by how much they need you — *Running now* · *Needs you* · *Queued* · *On the books* · *Fires by itself* · *Settled* — and a group with nothing in it is **not drawn**, because five cards each saying "nothing here" is five paragraphs above the one that has something. A tab with nothing at all says why and what to do instead. Each row carries what its own page would say and no more: a queued task carries the **gate's own words** for why it has not started; a mission says whether it was **started in** this project or is here because its **delegations** were filed here; a schedule shows when it fires and whether it has a brake.

**And work starts here.** *Start a session here* makes the project active **first** — that is what puts its brief into the agent's system prompt at spawn — then opens the Console composer (or a terminal) on it. Beside it: a new task, a new schedule and a new trigger, each opening the **same form** every other route opens, with the project already filled in. Nothing on this tab writes to any of the five stores itself; it forwards to whatever already owns them, which is the only way a task made from a project page can be identical to one made anywhere else.

**A mission's project reaches its delegations.** Every task the planner creates inherits the mission's project rather than reading the window — a wave fires whenever the planner decides to, which may be an hour after anybody looked. Without that, the Work tab would show the mission and none of the work it caused.

**Two things this fixed on the way.** "Open" on a task or a mission row used to pass an id to a command that takes no arguments, so a timeline row opened a list of two hundred and left you to find the one you had just clicked; both panels take a focus now. And the page's relative clock could print `-27304s ago` for a timestamp a few seconds ahead of this machine's — which is normal, and is the page calling itself broken.

**Bridge:** `projects.work` (the same five stores, with `open:true` for only what is unfinished) · `notices.project` · `queue.project` · `project` on `notices.post`, `notices.list`, `queue.add`, `queue.list` and `missions.start`.

### Parts, shapes, a letter and a counterpart (3.109.0)

*(Faz 7 — the last phase of the project axis.)* Four answers to one question: what happens to a project that is not one flat thing in one flat list.

**‼️ A SUB-PROJECT APPEARS IN EXACTLY ONE PLACE.** `parentId` was in the model from Faz 1 and on no screen. A part is now nested under its parent in the sidebar, indented in the page's list, and **never a second time** in a status group — the same project on two rows makes anybody counting them wrong. Its **own status is on its row** (a finished part inside an active parent is otherwise a claim the heading makes about it that is false), and a part whose parent is not in the list — filtered out, deleted in another window — **comes back as a top-level row** instead of disappearing.

**‼️ THE PARTS' FIGURES RIDE ALONGSIDE, NEVER INSIDE.** Sessions are disjoint so the addition is legal, and doing it in place would still be wrong: the rows would stop summing to the fleet total. `partsTotals` hands the fold back separately, always with the count that makes it readable (`$11.60 total · +$84.15 in 2 parts`), and the hover says it is not in the number beside it. One implementation for the page, the sidebar and the bridge. A **brief tells an agent inside a part that it is one** — otherwise its worklog line, decision and backlog item land in the sibling folder, and nothing about the path says which.

**Templates — and the list ships EMPTY.** A template is a claim about how you work; a built-in "Client project" with somebody's guess at five plan items is what gets a feature deleted on sight. The door in is **Save as Template** on a project that already proved itself, and it is a **multi-select — what you do not tick does not travel**: identity, repos, the agent rule, budgets, people, the folder skeleton, the plan's open items, the queued backlog items. **An id, a folder and a parent never travel** (identity, not shape), and **neither does status** — a template off a finished project would create everything `done`. On the create form, **anything you type beats the template**; with none saved the control is a sentence saying where templates come from, never an empty dropdown.

**The handover — the cold-start letter.** Not a second report: a report is a *period*, this is a *starting position* and has none. What it is (the charter's own words) · where every document and code root is, with the ones **not on this machine** called out · who to ask · where it stands · what is open and what is **blocked** · **‼️ what somebody already fought and left open**, from the track ledger with their last note · why it is built this way · what has shipped · how it is actually worked · a numbered **first five minutes** naming the real codes. **‼️ The section machines cannot write is the point:** the document ends in a block that is yours, and regenerating **preserves it verbatim** — which is the only reason the button writes rather than previews. A document that has lost its marker is **refused, not rewritten**.

**Archive mirroring.** A finished project moves to its counterpart (`agentFarm.projectsArchiveRoot`, or derived as `<parent>/99_ARCHIVE/<root>_ARCHIVE` the way the surrounding vault already mirrors itself). **‼️ It never happens by itself:** setting the status to `archived` does not touch the disk, because "I am done with this" and "move my files" are different sentences. Modal confirmation printing **both paths**; the folder keeps its name; it refuses to land on anything already there; the registry follows the move; **Restore is the exact inverse**. `projects.archived` reads the **folder**, not the registry — a project deleted from the registry still has its folder, and that is what somebody looks for two years later.

Bridge: `projects.handover` · `projects.templates` · `projects.template.save` · `projects.template.delete` · `projects.archive` (describes the move; touches nothing until `apply: true`) · `projects.archived`, plus `template` / `parentId` on `projects.create` and `parent` / `children` / `parts` / `archived` on `projects.get`.

### Intelligence — backfilling, the second fold, and a report that reaches you (3.108.0)

*(Faz 6.)* Four things a project could not do: say which of the farm's loose sessions belong to it, say anything about **how** it is being worked rather than what happened, appear on the one screen that answers "is this system alive", and tell you about itself without being asked.

**‼️ BACKFILLING PROPOSES; A PERSON APPROVES.** A farm running for months before projects existed has hundreds of sessions in `Unassigned`, and filing them one at a time is work nobody does. `core/projectSuggest.ts` reads four signals and states each as a **fact you can check in one second**: *wrote 11 of 11 files under `D:\…\muvu_talkScribe`* · *9 other sessions from this exact folder are filed here* · *88% of that agent's filed sessions are in this project* · *its title mentions "agentfarm"*. There is a score and it decides the ORDER; it is never printed, because "84% confident" is a number a reader cannot check and a list of them is a list they abandon.

Four rules, each the answer to a way this goes wrong:

- **Only the undecided.** A session the membership order already places is settled — a proposal there is a second opinion on a closed question. A session you explicitly took **off** every project is never proposed for at all, and is counted separately so its number is not read as a gap: an engine that keeps suggesting what a person refused is one they switch off.
- **The strongest signal is the one no path rule can see.** Membership by path asks where a session *stood*; `files` asks what it *touched*. An agent working in its own home folder and editing a repo three directories away is the ordinary case and was invisible to every rule.
- **The folder cohort counts EXPLICIT filings only.** Counting rule-placed sessions would make the signal an echo of the rule that placed them — agreeing with itself and calling that evidence. A folder split between two projects says *the folder is split* rather than being resolved by majority.
- **‼️ A contested row is reported, never resolved.** Two projects within a hair of each other is a question the engine could not answer; it names both, and **"select all" excludes it**. You can still tick it by hand — you are the one who knows. A bulk gesture that also settled those would file wrong at two hundred times the speed.

Applying sends **session ids and nothing else**: the host re-derives the project, so a page holding a list from four repaints ago cannot write one the engine no longer proposes. Ids it no longer proposes for come back in `skipped` rather than being silently dropped, and everything filed can be taken off again from the session's own menu.

**The second fold — the Analysis tab.** Timeline is *what happened*, Cost is *where the money went*; this is the data folded again. Weeks (sessions, turns, cost, commits, backlog items first worked and closed) · the **rhythm** of when the work actually happens by local weekday and hour · **cycle time** from an item's first recorded touch to its close · the files most written and the agents taking the turns · a recent **pace** stated against the project's own average.

Three rules, and each is a way an analysis page lies:

- **‼️ A figure with no denominator worth dividing by is not printed.** Rhythm needs 40 turns, cycle time 5 closed items, pace 2 weeks. Below that the block is absent and the page says *what* is short and *how much* — "not enough turns yet, 23 so far" is an answer; a shape read off six points is one a reader will believe.
- **‼️ A trend is stated against a control.** "$4.10 per session" says nothing; beside the project's own average it is a claim you can check. The page says so where the figures are.
- **‼️ Local days, Monday weeks.** A session at 23:40 belongs to that evening — `toISOString` moves it to tomorrow east of UTC — and a Sunday-based week splits every weekend. A quiet week is a **zero row**, never a gap: a series with holes in it draws a lie.

The backlog side comes from the **track ledger**, not from dates in the document: a `[x]` says an item *is* closed, only the ledger says *when*, and reading the file would date every item to the last time somebody saved it in Obsidian. A `touch` is an attempt, not a close — treating the last event of any kind as one gives every abandoned item a cycle time.

**The Code tab — two sources, never summed.** Commits are what **git** records in a declared root: everything anybody typed there. `sessionWrites` is what **this project's own sessions** wrote, out of their transcripts, including files outside any repo. They answer different questions and a total over both would be a third number that means nothing — the same line `codeedits.ts` draws between a session's diff and a git diff. A root that is not on this machine is reported **missing**, because an empty commit list there would read as "quiet repo".

**Health reaches the Living page.** The project page has always told the truth about missing folders, blown budgets and projects marked active that nothing has touched — on the project page, which is where you go when you already suspect something. Living is the screen you look at when you do not, and a warning that only exists somewhere you have to think to visit is Principle 1's silent rule. **One row for all of them**, so nine projects cannot push every other loop off the page, but it **names** them: a count with no names is a row you cannot act on. A **missing folder is dead, not a warning** — the plan, the backlog and the worklog are in it, so every write side of the project axis is broken until it is relinked. It does not re-derive the warnings; it prints the ones the project page computed, because a folder-exists check written twice is two answers that will disagree within a week.

**A weekly digest that reaches you.** Off by default (`agentFarm.projectDigestDay`); set a weekday and each open project's week lands on the **Notices board** — the place you already read — as a genuine summary with the full report attached as its second leg. A report written to a folder nobody opens is the exact failure Living exists to make visible. It is stamped with its project, so it also appears on that project's Work tab and timeline. Once per project per week, and the guard is **the board itself** (a `sourceKey`) rather than a timestamp of ours: two open windows cannot double-post, and a digest you deleted can come back if you want it.

**Bridge:** `projects.suggest` · `projects.suggest.apply` · `projects.analysis` · `projects.code` · `projects.report` (the same document over any period, with `post:true` to put it on the board).

### The backlog — the standing pile of work (3.59.0)

**Three different things, kept apart.** The **plan** is the roadmap: macro, phase-sized, ten lines, changing a few times a month. The **work queue** is the global user→agent channel: a flow, captured → grouped → delegated → gone. The **backlog** is a project's *stock*: hundreds of items, coded, ranked, filtered, answering "what is next and which one now". Putting the third in the first was the obvious move and wrong twice over — a hundred "fix this too" lines make a roadmap unreadable, and the brief's six open plan items would fill up with typo fixes.

**‼️ It is a document, not a database.** `Backlog.md`, found by `af-role: backlog`, made of lines the vault already understands: the checkbox is the state (`[ ]` open · `[/]` doing · `[x]` done · `[-]` cancelled), `#bug` is the kind, Obsidian Tasks' own 🔺⏫🔼🔽⏬ is the priority, `⛔ P-5.1` is what it waits on, `[plan:: afprj-05]` links the plan item it serves. Only *effort* needed a field of its own (`[effort:: S]`, Dataview's notation). So it is editable in Obsidian from anywhere, travels in git, and every line keeps working in the user's existing task queries.

**‼️ The field NAMES are English; the items are not.** A field name — `effort`, `plan`, `from`, `was`, `closed` — is part of the mechanism and is the same in every installation, because the extension's working language is English. What you write is yours, in any language. The older spellings already on disk (`efor::`, `boyut::`, `kaynak::`) are still **read**: that is input tolerance, not a second working language — a line written years ago must keep parsing, and since the next field edit rebuilds the line with the English name anyway, the aliases fade out on their own instead of by breaking a file.

**‼️ AN ITEM MAY BE PART OF ANOTHER ONE, AND THE LINK IS A FIELD — NOT AN INDENT, NOT A CODE SHAPE, NOT A POSITION.** `[parent:: P-4]` on the child's own line says it belongs to `P-4`. Three rules follow, and each one is the fix for a way the hierarchy this replaced went wrong:

- **The code stays flat.** A part gets the next free number **in its own area**, so a `U` item being part of a `P` epic is the ordinary case rather than the impossible one. A code says which item, never where in a tree; the dotted form (`U-14.3`) is still *read*, because a code is permanent and a file may already contain one, but it is never handed out and it hangs nothing under anything.
- **No line moves.** Tidying still sorts each area by code, archiving still moves one closed line, and indentation in the file means exactly what it meant before: nothing. The link survives all three because it is stored *in the line*, not in where the line sits.
- **The queue does not know.** A part and its whole are queued **separately**, and either may be worked first — nothing is a "container", nothing is dropped from `next`, and nothing is dragged along. The relation is drawn as a **mark** on the row (`↳ P-4` goes to the whole, `⊂ 3` shows only that family) and the one place a tree is *drawn* is the **family** ordering, which is a way of looking, not an order anything is worked in.

It is **composition, not dependency**: `⛔` is what an item waits on, and a part does not wait on its whole. Closing a whole does **not** close its parts — it says which are still open. A link that names something not in the file, or itself, or one of its own descendants, is refused on the way in and **reported, never corrected**, when a file already contains one.

**Being a part is drawn on the row, in every ordering.** The indent exists only in the **family** view; everywhere else the relation used to be a badge at the far right of the line, which is not where the eye is when you are reading down a column of codes. So the **code itself** says it: *italic*, with a hairline down its leading edge in the same green the `⊂` badge uses. A link whose whole was deleted in Obsidian gets the same shape in the warning colour instead — the row's `⚠` carries the why. Nothing else about the line changes; fading the words would say "this matters less", which is the opposite of what being part of something means.

**Choosing what an item is part of is a box you type into.** The capture strip's *— part of —* filters every live item as you type, by **code or by words**, in the extension's own query language (two words = both · `OR` · `"phrase"` · `wildcard*`); `↑ ↓` move, `Enter` takes the one that is lit, and resting on a line opens the whole item beside it. The row's own `↳` picker opens **the width of the row**, so a list of fifty says which item each line is instead of forty-six characters of it. Both were a native `<select>`, which can only jump on an option's first characters — so the one question this control exists to answer, *"which of my open items is this a part of"*, could be asked with a code you already knew and in no other way.

**⚭ Gather families** — beside 🧹 *Tidy file order*, and the pair is deliberate: **this one rearranges the QUEUE and moves no line; that one rearranges the FILE and moves no queue entry.** Gather pulls every part up to its whole so a family reads as one run instead of being scattered through two hundred entries. The **wholes keep their order among themselves** — where a family sits is a decision you made about the whole — and the parts come to it, keeping the order they already had, depth first. A part that was queued *ahead* of its whole comes back down to it, which is the case it is most often pressed for. One family at a time is on the row's own **right-click** menu (*Gather its parts under it*, drawn only on a row that has parts), and `projects.backlog.gather` is the same write over the bridge.

Dragging inside the `⊂` family view is deliberate and is the **by-hand version of the same move**: a drop always lands against the WHOLE queue, so dropping a part on the lower half of its whole puts it directly behind it however many hidden entries were in between. It can therefore be real and look like nothing happened — which is why the drag handle's hover says so while the list is narrowed.

**The code is permanent; the order is the queue.** `K-8` — an area letter and a number. Numbers only count up: a cancelled item's number stays spent, so a note from three months ago quoting `K-8` still means that item. Ordering happens somewhere else entirely — in the 🎯 block below — and nothing about it renumbers anything. That separation is the whole reason "do the top five" is a sentence you can say without checking anything. Areas come from the file's own `## P — Projects` headings, so **the sections are the dictionary**: what exists, grouped, each area in its own code order (🧹 *Tidy file order* restores that whenever it drifts — and it also carries an item filed under the WRONG heading back under its own, which is the one kind of drift this page hides from you: it groups rows by the CODE, so it draws them in the right place however the file happens to have them, and only somebody scrolling `Backlog.md` to the `## P` section finds five items apparently missing). Where a line sits says nothing about priority.

**Capture costs nothing.** An item may be one line of plain text with no code, no priority and no size; it lands in the `📥` inbox and is filed later by whoever has the context — a person, or an agent sweeping. `Agent Farm: Add to Backlog` (**Ctrl+Alt+B**) takes a thought from anywhere in VS Code and asks no follow-up question, because a box that asks "which area?" is a form, and the thought that has to wait for a form is never written down.

**‼️ `projects.backlog.next` is the engine behind "do the top five".** Anything waiting on an unfinished `⛔` is held back *and reported*. "Top five" means the first five entries of the user's queue with no hidden effort ceiling, so an L/XL item keeps the position the user gave it. A caller may explicitly pass `maxEffort` when the request is instead for work that fits a size ceiling; an unsized item is not excluded because its size is unknown. `score` (priority ÷ effort) is offered as a view, not imposed.

**‼️ THERE IS ONE ORDER AND IT HOLDS EVERYTHING.** Areas are headings, so **line order is a segmented order**: every `K` item comes before every `S` item, for ever, because a line cannot cross a heading without re-filing the item — and "do X-5 next" was therefore not a missing button but a missing *order*. So the order lives in the **`## 🎯 Queue` block at the top of the file**: one list, every open item, shuffled like cards, areas interleaved however you want them.

A half-measure was tried first and is worth naming, because it is the shape this problem invites: a *pinned head* that ordered the first few and let the file decide the rest. That is two orders pretending to be one — moving something to eighth place has to drag the seven above it into the list as a side effect, and an item you never touched acquires a pin. **The block is the whole order now**, and moving one entry moves exactly one entry.

- **On a row:** the number where the drag handle used to be **is** the item's place in the queue. **▲/▼ move it one place; rest the pointer on either and a menu offers 2, 3, 4, 5, 10, 15, 20, or the very top / very bottom of the whole list.** Dragging by that number does the same, and so does dragging a chip in **Next up**.
- **What is written:** only the block, ever. Every item line stays byte-identical; an item keeps its code, its line, its indent and its area. Rearranging the block by hand in Obsidian is the same edit, and a file whose queue you empty is byte-for-byte the file you started with.
- **What is in it:** live items with a code. A closed item is not waiting, and an uncoded capture has no handle that survives an edit — so 🗂 (filing) is also what puts something in the queue. A code the block has not placed yet queues at the back; the first write of any kind materialises the whole list.
- **What it will not do quietly:** an entry whose item was closed or deleted is **reported**, never swept up. The list is the user's.

Both the order and the items live in the same document, so a person reading `Backlog.md` with no extension running sees exactly the queue an agent is handed.

**And the top of it rides in the brief.** Every project session opens with `## Next in backlog`, so "do the first three" needs no paste and no lookup. Everything else here is only useful because of that section.

**The Backlog tab makes the row the editor.** The checkbox closes the item; priority, size and work type each open a small menu with the current value marked — they used to cycle one step per press, which on a six- or nine-value axis meant up to eight presses and **eight writes to the file** to reach a value that was on screen all along. 🗂 files an uncoded capture by asking which area *on the row being filed*. Actions appear on hover rather than walling off two hundred lines with nine buttons each, and they sit in **two lines** at a fixed width — one line of controls was wider than the item it belonged to, which left the words, the whole reason the row exists, squeezed into what was left. **The capture box keeps what you have written** across every repaint — a filter, a host push, a step into another tab — and empties only once the host confirms the add; it carries the same four text tools (paste · copy · cut · clear) as the console composer, from the same component. Every filter axis is a LIST and page-side, so a chip is a repaint rather than a round trip, and each filter row carries its own clear beside the global one; the five dropdown axes — **state · filing · blocked · plan · due** — are **the extension's own multi-pick control** (`media/afFilters.js`), the same one Search, Queue, Notices and the sessions table use, so "done AND cancelled" is sayable, state is a real list rather than a single choice with a "show closed" box bolted beside it, and 📥 *unfiled* is its own axis because having no code is not a state. Sorting stays a single choice, because an ordering genuinely is one.
**‼️ Time-Based Sortings (3.174.0 — X-48):** The sort picker presents three time-related answers:
- **`opened` (🌱 last written first):** The very first timestamp recorded for that code in the track ledger.
- **`last touched` (✎ last worked on first):** The most recent activity / touch timestamp recorded in the track ledger.
- **`closed` (✅ last finished first):** The closing timestamp (to the second from the ledger, or from the `✅` tag).
Dates are drawn on the row with 🌱 and ✎ glyphs, with both timestamps visible on hover. Over the bridge: `projects.backlog { sort: "opened" | "touched" | "closed" }`.
**‼️ Jumping to Backlog from Track Chips (3.169.0 — U-71):** Left-clicking a backlog code chip in the Track view switches directly to the **Backlog tab**, filtering down to that specific item; the ↗ icon opens the file.
**‼️ Work Queue Target Routing (3.180.0 — X-49):** The queue capture form and filters feature three additional routing dimensions beside `target`: `— engine —` · `— model —` · `— effort —`. Blank means unconstrained; tasks can scope their sweeps to only work assigned to their engine/model/size. **A long item opens whole on hover:** the box is as wide as the row and **scrolls**, and the pointer can travel into it, so resting on `more` reads a thousand-word item without opening anything.

**‼️ A pile with families in it has two honest sizes, and the counts strip says which (3.113.0).** `10 open · 110 done` was written before an item could be part of another, so it counts a whole and its four parts as five things to do — the right answer to *how many lines are outstanding* and the wrong one to *how much work is left*, with nothing on screen saying which question it was answering. **The figures are the control**: press them and the parts drop out of the count (`⊟ wholes`), press again and they come back (`⊞ every`), and the choice is remembered. **‼️ And the reduced reading looks reduced (3.140.0).** The two line-drawing glyphs alone were not a state anybody noticed, so *wholes only* now says its own name beside the glyph, states **how many lines it is leaving out** (`−8`), and wears a dashed accent outline — while the plain reading keeps exactly the typography it always had, because a permanent highlight on both is a badge, not a signal. The **area chips follow the same rule**, so two adjacent lines can never disagree, and the hover carries **both readings** — so the question can be settled without pressing anything at all. A file where nothing is `[parent:: …]` of anything is not offered the switch: a toggle between two identical numbers is a button that does nothing. The **family** axis gained the row that reading actually needs alongside it — **wholes only — nobody's part** — because "show me the wholes, not the parts" used to take two ticks (*has parts* plus *stands on its own*), and a subset with no name is a subset nobody finds.

**‼️ And a line an agent wrote says so.** Three different things arrive in a backlog and only one of them is a decision its owner made, so `projects.backlog.add` stamps what it writes: **`#byAI`** when the agent noticed it mid-job and filed it itself (a **proposal** — nobody has agreed to it) and **`#byREQ`** when the user asked for it (`origin:"user"`). The default is `byAI`, because the mistake worth preventing is the silent one: an agent's own suggestion recorded for ever as something the user decided. An item the user types themselves — capture box or Obsidian — carries **neither**; absence is the third state. Both are ordinary `#tags`: they filter with everything else and can be added or removed by hand with no tool. All the page adds is a hover saying what they mean, and it does not give them a work-type colour — who wrote the line is not what the work is. **A long item opens whole on hover:** the box is as wide as the row and **scrolls**, and the pointer can travel into it, so resting on `more` reads a thousand-word item without opening anything — the native tooltip it replaced repeated the two hundred characters already on the line and then stopped wherever the platform felt like. **And the tab explains itself from a `?` beside the counts**, in a panel that opens over the page and closes on the next click or Esc; it used to be ten lines of grey prose under the last row, on screen for ever, in the one place nobody looks. Closing a box changes **exactly one character** and invents no ✅ date, same promise as the plan. A duplicate code is flagged **on the row and never corrected** — rearranging somebody's document to match our idea of it is what this must not do. Archiving moves closed items under a heading at the end of the *same* file, deliberately: a code must never be reissued, and the cheapest guarantee is that every code the project ever used is still in the file the generator reads.

**‼️ The row is a door to the line, and the page follows you back through it.** Clicking an item's **code** (or ↗) opens the document **at that item's line** in the editor chosen under Settings → *Open documents with*: VS Code and the preview mode put the cursor there, Obsidian jumps to the line through its Advanced URI plugin — vault resolved from `.obsidian` plus Obsidian's own registry, because two vaults open at once means an unnamed URI opens the wrong file about half the time — and a custom app receives `{line}` if its template asks. The line is resolved **from the code at the moment of the click**, not from what the page last painted, so a panel left open while the file was edited elsewhere still lands on the right item. And returning to the panel re-reads the documents, because a page that still showed the old text would make the round trip pointless. **Next up** is that queue, made draggable: fourteen startable items with the mark where `.next`'s default five stops, **each one's item WHOLE on hover** — the same rich panel the row's `more` opens, because a code is three letters and the only thing that makes it recognisable is the item behind it — a click that jumps to the row (dropping any filter that hides it, and saying so), and **a drag that moves exactly one entry** to wherever it was let go, from any area. **The position is the only thing on this page that is a rank rather than a fact about the item, so it is the one thing coloured:** inside the default the number is a filled green disc, across the rest of the strip the same hue half lit, and **the row below wears the same number in the same green** — one hue, two steps, in both places, because it is the same number. Past the strip there is no colour at all: those items are not waiting their turn, they are simply also in the file. The card's heading says only what changes (how many are queued, how many an agent takes); the standing explanation is in its hover.

**Bridge:** `projects.backlog` · `.next` · `.add` · `.check` · `.set` · `.code` · `.move` (`dir` + `by`, or `to` for an absolute place) · `.reorder` (before/after another code) · `.queue` (read or replace the whole order) · `.gather` (pull every part up to its whole; with `code`, one family only — writes the queue, never the file) · `.tidy` (the file's own sections back into code order) · `.open` (the document at one item's line, in the user's chosen editor) · `.archive` · `.promote` (a work-queue item becomes a backlog item — the flow handing over to the stock, one direction only). The first four ordering ops all write the same one block and never a line.

### The Backloglog — which session, and which turn of it, an item was solved in (3.68.0)

The code was permanent and the transcripts were on disk, but there was **no join** between them: you could not start from `K-8` and reach the turns it was fought in, so hundreds of sessions sat there as an unsearchable pile. What is gained is not record-keeping — it is **turning the transcripts we already have into a log that can be read backwards**.

**‼️ Two files, two owners, and that split is the whole design.**

- **The ledger — `90_Archive/_tracks/backlog-track.jsonl`, the machine's.** Append-only, never edited in place; it holds the **events**: code, what happened, when, which session, which turn, by whom, how sure. Append-only is not tidiness: two windows and an agent can write in the same second, and appending is the only write with no lost update. The folder is found by the skeleton's `holds: "tracks"` declaration, **never by its name** — a vault that calls its archive folder something else must keep working.
- **The log — `Backloglog.md`, next to `Backlog.md`, shared.** Agent Farm rebuilds each item's **data line** and its **session rows** from the ledger. Every *other* line inside an item's block — a closing note, a warning to a later reader, a hand-made correction — is **read back and written out untouched**. The machine owns the facts, the person owns the prose, and neither can quietly overwrite the other. A block that cannot be placed (a code the backlog no longer holds) is not deleted; it is carried through verbatim under a *"Not in the backlog"* heading.

**The line carries the code, and data against it.** The item's text is not copied here — it lives in `Backlog.md`, it gets reworded there, and a copy would be a second version to keep true. This file answers **"what happened to K-8"**, not "what is K-8".

```markdown
- **K-8** [status:: done] [sessions:: 2] [turns:: 5] [closed:: 9c4d1f2a#3]
    - `3f2a1b2c` #11–14 · 2026-08-04 14:02 · developer · doing
    - `9c4d1f2a` #3 · 2026-08-05 09:20 · developer · **done**
    > Closed by lower-casing both sides of the comparison. The same comparison
    > exists in the memory graph and was NOT touched.
```

**‼️ The `touch` event is what makes the ledger worth keeping.** Most work on an item is not the moment it closes: three sessions of digging that ended in "still not found" is exactly the history somebody needs three months later, and a log that only records endings throws it away. Closing happens once; how many sessions and turns came before it is the item's own story. The state (`[status:: …]`) comes from the **backlog** — the checkbox is the truth about what is done, the ledger is the truth about how it got there.

**Which session it was is INFERRED, and that is said out loud.** An agent dropping a request file on the bridge is by definition **mid-turn**: its session is live and its last event is seconds old, which is enough to name it in every ordinary case. When it is not enough, nothing is guessed — a **doubt code** is written: `multi` (two live sessions of that agent) · `none` (nothing was live) · `stale` (the only candidate had gone quiet) · `turn` (session sure, turn not) · `guess` (reconstructed afterwards, never observed). A wrong session id looks exactly like a right one; silence about it would be worse than the gap.

**Ticking a box in Obsidian produces no event — that hole cannot be closed, but it is not left silent.** Every time the file is looked at, the state the ledger implies is compared with the state the line shows; a disagreement is recorded as an `outside` event. Its turn is unknowable and is not invented; what is gained is that the log has **no silent gaps**. A `✅` date on the line is used when there is one, otherwise the row says plainly that the time is when this was noticed.

**Backfill rests on a clue, or does not happen.** `projects.tracks.backfill` searches the transcripts for **the code itself**: a row is only proposed where the code was *actually written* in that turn, never inferred from one date being near another. An item nobody ever quoted stays visibly blank in the log — that is the honest answer and it is also what shows where the gaps are. Only the **dialog** is searched, not tool output: a turn that merely read the backlog file mentions every code in it and proves nothing. Every row is stamped `by: backfill` + `uncertain: guess`, so it can always be told from something observed; and the op is a **preview** unless `apply` is passed.

**One trace stays in the file itself.** A closing item's backlog line gets `[closed:: 9c4d1f2a#3]` — not the whole history, only the end point, the one piece of information that does not bloat the line. The reason is durability: somebody reading the file in Obsidian with no extension running should still see where the work ended. The stamp goes on through a separate write that does not rebuild the line, so the checkbox's **one-character** promise is untouched.

**The Track tab: four questions over one ledger.** The thing it does that nothing else can is the join — **a session/turn reference is a door into that session's dialogue**. Track is for reading how the item was handled, not selecting one arbitrary event, so every such door resets even an already-open viewer to **Dialog · all turns collapsed · Single-open · page top**, with no focused turn. Around that there are now four views over a single narrowing, so a filter set in one still holds in the next:

- **⬢ Items** — one card per code: every session and turn it was worked in, oldest first, with the closing note somebody wrote for it. *How was this solved last time?* Each card also carries the one figure that needs both files open — the size the backlog estimated, the turns it actually took, and the **median for that size in this project** (stated only once there are enough sized items to have a median worth quoting).
- **≡ Timeline** — every recorded moment, newest first, whichever code it was about. *What happened here lately?* — the backlog's history rather than the folder's.
- **⌸ Sessions** — one card per session: which codes it touched, what it did to them, and how many of that session's own turns went on the backlog. *What did that run actually get through?*
- **⚕ Gaps** — what the record does **not** know: codes with no history at all (with the coverage as a share), attributions that are a best effort broken down by reason, rows that were reconstructed rather than watched, and closures with no session to point at. A log is worth what its holes are visible.

**Filtering** is on two axes at once and they mean different things on purpose: *the item* (search over code · words · closing note · every agent and session id in its history · every event note; area chips; state) and *the record* (event kind, where it came from, why an attribution is doubted, a date range, and three switches — only uncertain · only with a closing note · hide reconstructed). A row survives when it passes the item test **and still has a record left**, so a card with an empty body never appears. Ordering: last worked (default) · first worked · turns spent · sessions · span · closed · code · state · area.

**Three actions, and two of them ask twice.** **✎ Record** puts one event on the ledger by hand — stamped `panel`, which means real but belonging to no session, because a click happens in no conversation. **⚕ Reconstruct** runs the backfill as a **preview first**: it lists the exact rows it would write, and the second press writes *those* rather than re-deriving anything. **↻ Rebuild the log** writes `Backloglog.md` again out of the ledger, keeping every line you wrote in it. Right-click a row for the same things plus *show only this item*, *show it in the Backlog*, and copies (the code · the closing stamp · every session id · the whole history as text).

The tab deliberately **cannot edit the item** — no priority, no size, no queue. That belongs to the Backlog tab, and two surfaces writing the same field differently is a defect this system has already paid for once.

**Bridge:** `projects.track` (I worked on this item in this turn — including `touch`) · `projects.tracks` ("how was this solved last time": sessions, turns, where it closed) · `projects.tracks.backfill` (evidence-based reconstruction, preview by default) · `projects.backloglog` (rebuild the document from the ledger) · `projects.backlog.check` records the same thing *itself*, and takes a `note` for the closing note.

### Agent Portfolio — the fleet on one screen

The **Agents** tab in the global nav (`Open Agent Portfolio`). One row per agent, grouped by project, **sortable on every column**: what it is doing right now · **how many days it has been quiet** (💤 past 14) · 7-day and 30-day sessions/cost/tokens · files written · duties (⏳ work waiting, ⏸ paused) · open findings · memory files · fixed context load. Filter to a project, hide dormant agents, and from the row itself **▶ start a session · ◧ assign a project · 📁 reveal the folder**. "Which of these is dead?" is a column now, not an afternoon.

### What the agent did to the code

Every transcript already carried each `Edit` / `Write` / `MultiEdit` / `NotebookEdit` call **with its own before-and-after text**; none of it was shown anywhere. The Session Viewer now opens with a **Files changed** box: each file, its write count, ±lines and which turns touched it — unfold a file and you get **the session's own hunks**, red above green.

- This is **what that session changed** — not the file's current state. A later session's work can never be read as this one's.
- **vs HEAD** sits next to it and asks the *other* question: what is uncommitted in that file right now. It opens in VS Code's own diff view, and says so honestly when the folder is not a git repository.
- A tool call that came back with an error is marked **failed — not applied** and counted nowhere.
- The Sessions tables gain a **Files** column, counted during the index's existing parse — no extra cost.
- **Bridge:** `sessions.files` (`detail:true` returns the hunks too).

### Obsidian Tasks Metadata Syntax Protection

Ensures strict parsing of Obsidian Tasks format metadata icons (`📅`, `⏳`, `🛫`, `➕`, `✅`, `❌`, `🆔`, `⛔`, `🏁`) in backlog files without corrupting user handwritten task titles and descriptions (`src/core/projectBacklog.ts`).

- **Rationale:** Legacy parsing regexes greedily stripped valued metadata icons along with any non-whitespace tokens trailing them. This corrupted backlog titles: a title containing `'⏳ Yanıt bekleniyor'` was mutilated into `' bekleniyor'` (the icon consumed the word "Yanıt"), and bare `⛔` hold marks consumed the first word of subsequent descriptions (e.g. `"⛔ kullanıcı karar verecek"` became `"karar verecek"`).
- **Strict Typed Validation:** Each icon now requires exact conformance to its expected token format:
  - `📅`, `⏳`, `🛫`, `➕`, `✅`, `❌`: Stripped exclusively when followed by an exact `YYYY-MM-DD` date token. Dateless icons are recognized as intentional user text and preserved intact.
  - `🆔`: Stripped exclusively when followed by a valid identifier pattern (`[A-Za-z0-9_-]+`).
  - `⛔`: Stripped exclusively when followed by a comma-separated blocker code list; a bare `⛔` is interpreted solely as an inline `HOLD` flag and leaves subsequent prose untouched.
  - `🏁`: Stripped exclusively when followed by `delete|keep`.
- **Constitutional Guarantee:** Enforces Agent Constitution Section 6 and Principle 2 ("User-defined formats, icons, and names are never modified or corrupted without authorization") at the parser level.

## Reaching the Farm from Outside — Mobile Web Cockpit and Chat Integration {#disaridan-erisim}

*(3.26.0 — 3.649.0)* Early versions of Agent Farm were confined inside a single VS Code window: impossible to observe from a phone, with no presence while VS Code was closed (the headless service kept the farm **running** but showed nobody anything), and with no mechanism to send a remote instruction and receive a response. The two-tier external access architecture brings the farm to your pocket via a lightweight, read-only mobile web cockpit and a fully interactive, two-way Telegram cockpit.

### Read-Only Mobile Web Cockpit (Port 8378) & Built-in QR Engine

Enabled via `agentFarm.web.enabled`, the built-in HTTP server provides a standalone, thumb-optimized, self-refreshing web application accessible from any mobile browser: **what needs you · what is running · per-agent and per-project spend · recent sessions · notices board**.

- **Snapshot Contract (`web-snapshot.json`):** The web interface issues no heavy database queries; the extension writes an atomic `web-snapshot.json` state dump every 20 seconds, and whoever owns the port serves it. The page **cannot disagree with the VS Code panel**.
- **Headless Handover on VS Code Shutdown:** When VS Code exits, the background daemon (`agent-farm-headless`) seamlessly adopts port 8378, continues serving the last snapshot, and clearly indicates its state on the page (*"VS Code closed — last snapshot"*). When VS Code reopens, the port is handed back without conflict.
- **Security & Mandatory Token:** Authentication is compulsory. If no token is configured, the server **refuses to start**. The token is carried via `?t=`, `Authorization: Bearer`, or an HTTP cookie established on first visit.
- **Zero-Dependency Native QR Code Engine (`src/core/qr.ts`, `src/core/qrTables.ts`):** 
  - Sending a URL containing an access token to an online QR generation service is an unacceptable credential leak. Agent Farm implements its own self-contained Galois Field GF(256), Reed-Solomon error correction (L/M/Q/H), and BCH masking algorithms.
  - The rendered output is a pure SVG `<path>` element without scripts or external dependencies.
- **‼️ "A QR Code is a Promise" and `local` Warning:**
  - `webCockpit.ts` evaluates 6 connection states. When bound to loopback `127.0.0.1`, a QR code photographed by a phone camera will fail silently.
  - Instead of drawing an unscannable symbol, the cockpit shifts to an **amber** warning state, replacing the QR code with an explanatory note (*"Bound to this machine only — select LAN for phone access"*). A QR code is generated only when `phoneReachable` evaluates to true.
- **Dashboard Top-Bar `📱 Web` Button:** A dedicated `📱 Web` action button in the Dashboard header opens the LAN/Local binding and QR cockpit in one click (`webCockpit.ts`).
- **Mobile Battery and Radio Optimization (`core/webpage.ts`):** 
  - When the browser tab is hidden or backgrounded (`document.hidden`), the 15-second polling timer is immediately suspended (`poll(false)`), conserving phone battery and cellular radio wakeups.
  - Upon returning to the foreground, an immediate single `fetch` executes and polling resumes.
  - Full support for `viewport-fit=cover` with `env(safe-area-inset-*)` padding for notched phone displays.
- **Bridge Operations:** `web.status`, `web.stop`, `web.bind`, `web.token.new`.

### Two-Way Chat Cockpit — Telegram Integration

Beyond passive monitoring, a bidirectional Telegram bridge enables remote conversation steering, permission approvals, and session launches directly from mobile messaging.

**Connect Telegram…** prompts for a bot token, validates it against the Telegram API prior to saving, and securely stores it in the **secret vault** — never in plain text in `settings.json`. No inbound ports are opened; the extension conducts secure outbound long-polling.

#### 1. Chat-to-Session Routing and Focus
Messages sent from a chat are dynamically routed to their target Console session (`agentFarm.telegram.routing`):
- `/focus <session-id>` locks the chat to a specific Console session card.
- The focused session is marked in `/sessions` with a `← focus` tag.
- If an agent has exactly one running session, inbound messages target it automatically.

#### 2. Rich Turn Digest Cards on Mobile (core/telegramDigest.ts)
Whenever an agent finishes a turn or requests input, a compact digest card (strictly within Telegram's 4096-character limit) is delivered to the chat:
- **Direct Agent Words:** Avoids costly and lossy LLM paraphrasing; the agent's actual closing remarks are extracted and delivered verbatim.
- **Status & Consumption:** Displays what the session is waiting on, tokens consumed, and session cost.
- **Interactive Inline Buttons (≤64-byte callback payloads):**
  - **Question Options:** Asynchronous multi-choice questions render as instant clickable buttons.
  - **Permission Requests:** Tool permissions appear as immediate `Allow` / `Deny` buttons.
  - **Execution Controls:** `Continue` (resume idle session), `Cancel` (interrupt active turn).
  - **`📄 Diff` Button (`workdirChanges.ts`):** Instantly returns working directory git status (`status --short` and `diff --stat`).

#### 3. Four Strict Execution Gates & Message Queue (core/telegramExecution.ts)
Inbound chat messages pass through four sequential protective gates:
1. **Session Liveness Gate:** Is the target conversation still active?
2. **Daily Budget Shield:** Will the resulting turn exceed `agentFarm.telegram.maxDailyUSD` (default $1)? If spent, execution halts with a budget notification.
3. **Destructive Command Pattern Filter (`riskyIntent`):** Prevents accidental catastrophic execution (`rm -rf`, `git reset --hard`, `git clean -f`, `git branch -D`, `DROP TABLE`, `del /s`, `format`). Risky syntax prompts for explicit confirmation, while natural language queries pass unobstructed.
4. **Working State Gate:** Is a turn currently executing?
   - `agentFarm.telegram.whenBusy: queue` (default): Messages typed while the agent is busy are queued in **saved chat state** (persisting across VS Code window reloads, up to 10 messages per session). When the active turn ends, the oldest queued message is automatically released.
   - `agentFarm.telegram.whenBusy: steer`: Immediately injects the message into the active turn as a steering prompt.

#### 4. Starting Real Console Sessions from Mobile — The 11th Launch Door
While `/agent <name> <prompt>` executes a one-off headless task, **`/new <agent> [prompt]`** launches a full, interactive **Console Session** on the desktop host:
- **Eleventh Launch Door:** Fully integrated into Agent Farm's launch parity manifest (`_REF/agentfarm-dev.md`).
- Assigned an interactive session number in `/sessions`, automatically captures chat focus, and streams turn digest cards to the phone.
- **Seeding (`seedLastLaunch`):** Seamlessly inherits the agent's most recent launch parameters (model, engine, effort, permissions, active project).
- **Life-Cycle Budgeting:** Every turn executed by the session (whether initiated from mobile or desktop) is billed against `agentFarm.telegram.maxDailyUSD`. If the budget is exhausted, the launch gate rejects the command before spawning any process.
- Calling bare `/new` targets the chat's currently bound agent.

#### 5. Mobile Command Reference Summary
- `/new <agent> [prompt]`: Starts a new interactive Console session.
- `/agent <name>`: Binds the chat to a specific default agent.
- `/focus <id>`: Binds chat focus to an active session.
- `/sessions`: Lists active sessions and indicates focus (`← focus`).
- `/status`: Reports running sessions, blocked questions, queued messages, and today's budget spend.
- `/drop`: Clears queued mobile messages without disturbing the active turn.
- `/agents`: Lists all available agents in the fleet.
- `/cancel`: Interrupts the active turn immediately.
- `/help`: Displays command help and usage guidelines.

### Why voice input is not here

A VS Code webview cannot reach a microphone (the iframe carries no `microphone` permission, and there is no API to grant one), so a dictation box inside the panel would need an **external recorder** — a native dependency on a machine with no GPU and no Docker, for the lowest-priority item in the block. Its right home is the **web view**: that is a real browser, where `getUserMedia` already works. So voice input goes there once that surface gains write actions — written into the roadmap rather than half-built.

## Terminal Rendering Health {#terminal-rendering-health}

VS Code's terminal isn't a real terminal — it's the **xterm.js** emulator running inside Chromium (shell → PTY → xterm.js → Electron → GPU). Because of the number of layers, long TUI sessions (like claude) can show rendering glitches: ghost gaps that look present as you type, lines that vanish/garble, an image that fixes itself when you scroll. There are two remedies, both in one command: **Agent Farm: Terminal Rendering Fix…**

- **Apply render fix (recommended):** `terminal.integrated.gpuAcceleration: off` + `smoothScrolling: off` — a DOM renderer instead of GPU/WebGL. This resolves most ghost-gap/line-loss reports. It applies to newly opened terminals.
- **Claude sessions in external terminal:** toggles the `agentFarm.externalTerminal` setting. When on, **Start Session / Continue Latest / Resume** sessions open in the **OS terminal** instead of the VS Code terminal (Windows Terminal if present, otherwise a plain cmd window) — xterm.js fully out of the loop, native rendering. Farm tasks deliberately stay in the integrated terminal: their lifecycle is tracked from the terminal-close event.
- **Disable persistent sessions:** terminals restored after a reload are also a frequent source of a garbled image; this option turns restoration off (the cost: terminals are lost on reload).
- **Restore VS Code defaults:** returns all three settings to default. The command shows the current state when it opens (`gpu off · smoothScrolling off · …`).

## Live Observation

### Live Context & Quota Discipline Signals {#baglam-disiplini}

*(3.538.0 — 3.624.0)* The foundational principle of the fleet constitution and handover law (`_REF/handover.md`) is that no multi-step agent run is allowed to push forward blindly until its context window or account quota is exhausted. However, LLM engines (Claude Code, Antigravity, Codex) have no native awareness of their own context fill percentage or quota status while running. To resolve this blindness, Agent Farm operates an engine-level **live monitoring and whispering (whisper)** architecture.

#### Whispering via Live Hooks (PostToolUse / UserPromptSubmit)

Agent Farm monitors the Console host's live event stream, the transcript's last real model call, and the session index with millisecond precision. When a session crosses a discipline threshold:
1. The listener answers the agent's next tool execution (`PostToolUse`) or prompt submission (`UserPromptSubmit`) with an additional context payload: `{ hookSpecificOutput: { additionalContext: "..." } }`.
2. The engine (Claude Code) places this hook output directly into the model's active window as **additional environment context** before its next step, rather than as a conversational user turn.
3. Without human intervention, the whisper reaches the agent's ear right as it uses a tool.
4. **Single Delivery Rule:** Delivery occurs exactly **once** per threshold per window (`delivered`). If a window empties (e.g., after compaction) and re-crosses a line, the threshold re-arms.
5. **Channel-Less Engine Defense:** In engines whose hooks lack an additional context channel (e.g., Codex), the threshold crossing is logged as **`undelivered` (✕)** rather than pretending a message was received.

#### Two-Dimensional Protection Thresholds

Agent Farm monitors two independent resource boundaries:

| Dimension | Measured Source | CONVERGE (Wrap Up) | HANDOVER (Stop & Hand Over) | Delivered Default Order |
| :--- | :--- | :--- | :--- | :--- |
| **Model Context Window** | Last model call tokens ÷ model context window ceiling | **≥ 35%** | **≥ 40%** | `35%`: Start nothing new, finish in-flight atomic step.<br>`40%`: Stop here, commit clean progress, write handover note and end run. |
| **Account 5-Hour Quota** | The session's own assigned sign-in account (`five_hour`) | *Default off* (`0%`) | **≥ 90%** | `90%`: Account 5-hour window reached 90%. Commit clean progress, write handover note (or pass baton) and exit. |

> **‼️ A fresh reading for the line (S-107, 3.728.0):** the running session's slot is read on the WORKING beat — resolved like the guard resolves it (its Console card's slot, then its sealed launch manifest), and a card mid-turn makes its slot active — so a resumed run is no longer read every five minutes. A guard reading older than two minutes also asks for a fresh one of that slot (at most once a minute, the automatic door, holds respected): a 5-minute-old figure had skipped a 95% line straight to 99%.

> **‼️ 5-Hour Window vs. Weekly Quota Isolation:** Prior to 3.624.0, quota whispering could conflate the 7-day weekly usage rate (`seven_day`) with the 5-hour window, mistakenly ordering a handover on a session whose 5-hour window was only at 34%. Strict isolation is enforced: quota whispering reads exclusively from the session's assigned **5-hour window**; weekly quota is never used as a handover trigger. Furthermore, quota usage is never read from the default home path (`~/.claude`); it strictly evaluates the session's own `CLAUDE_CONFIG_DIR` account slot.

#### Colored Signal Dots (.sigdot) and Visual Status on the Status Row

On the Console status row (`c-status`), beside the token and quota figures, 6px colored dots (`.sigdot`) display real-time discipline state:

- 🟡 / 🟠 **Yellow / Orange Dot (`.ctxsig`, `#cca700`):** Lights up when the `CONVERGE` line (35% context) is crossed, signifying wrap-up instructions have been delivered.
- 🔴 **Red Dot (`.ctxsig.stop` / `.ctxsig.bad`, `#f14c4c`):** Lights up when the `HANDOVER` line (40% context or 90% quota) is reached, commanding an immediate stop and handover; or indicates an `undelivered` crossing on a channel-less engine.
- ⚪ / 🔘 **Grey / Neutral Dot (`.ctxsig.done`):** Displays when the agent has successfully committed clean progress, written its handover note, and ended the run.
- **AFTip Panel:** Hovering over the dot or reading opens a comprehensive panel detailing current token fill, window ceiling, percentage, measurement source, and the exact order text delivered to the agent.

#### ↪ Curved Arrow — Continue from Handover

When a standard (non-relay) session reaches handover limits or closes after writing a handover note, a **`↪`** button appears on its status row:
- **Preserves All Launch Dimensions:** Clicking `↪` opens the composer pre-populated with the predecessor's engine, model, effort level, permission mode, Superpowers flag, and project context.
- **Smart Initial Prompt Generation:**
  - If a handover note was written and detected live or from the transcript:  
    `"The session before you (<sid>) reached the context handover line at 41% and was closed... Its handover note is <path> — read it first and continue from where it stops."`
  - If the predecessor ended without writing a handover note (Failsafe):  
    `"No handover note has been found for it — read what it did with 'af.js sessions.read id=<sid>' before you start."`
- **Does Not Auto-Spawn:** The composer opens with the prompt staged in the box, giving the user an explicit opportunity to swap accounts (e.g., if the previous run stopped on quota) before sending.
- **Handed-Over Conversations Are Never Resumed:** Resuming a conversation that stopped at handover is strictly prevented; a saturated context window would immediately collide with limits on turn one.

#### Configurable Discipline Templates

Discipline sentences are fully decoupled data, not hardcoded strings:
- Managed under Settings ▸ **Handover Discipline** or via `sessions.contextGuard.set` across eight branches:
  - `converge` / `handover`: Standard session wrap-up and handover orders.
  - `relayConverge` / `relayHandover`: Baton relay orders instructing the agent to invoke `baton.pass`.
  - `relayPassedConverge` / `relayPassedHandover`: Orders for legs that already passed and only need to await clean termination.
  - `relayBrakedConverge` / `relayBrakedHandover`: Orders for a leg the user braked as the chain's last (`baton.lastLeg`): no pass, the handover note instead.
- The `{chain}` token in any order is dynamically replaced with the relay's chain and hop identifiers.

#### Bridge Operations

- `sessions.contextGuard` — Query all session context/quota signal records, threshold settings, latest percentages, and live card views (`args: id?, limit?`).
- `sessions.contextGuard.set` — Update live thresholds (`convergePct`, `handoverPct`, `quotaHandoverPct`) and custom order templates (`orders`).
- `console.continueFromHandover` — Open the composer pre-seeded from a session's handover note or transcript fallback (`id, open=true`).

### Sound Alerts, Audio Tones and Live Dialogue Speaker (3.299.0 — 3.314.0 — A-20 — A-26)

Enables auditory fleet monitoring without keeping eyes glued to the screen:

- **Modern Sound Palette (A-20):** Ten curated audio cues leveraging Windows OneCore, SAPI, say, and spd-say backends.
- **Audio Arbiter (A-22):** Sequences audio notifications when multiple agents complete turns simultaneously, eliminating loud cacophony.
- **Quiet Hours & Mute Controls (A-22):** Global mute and scheduled quiet hours for nighttime runs.
- **Per-Session and Per-Agent Tones (A-23, A-24):** Assigns distinctive acoustic signatures to individual sessions and agents.
- **Live Dialogue Speaker (`DialogueSpeaker` - A-26):** Reads agent replies aloud in real time, stripping markdown and code formatting (`sanitizeForSpeech`) for natural text-to-speech output.
 {#live-observation}

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

- **Swim lanes:** Each agent is a strip; green blocks show tool runs (with their duration), dots/diamonds show events: blue filled dot = user command (prompt), blue hollow ring = model reply (`say` event — 3.183.0, both sides of the conversation on one chart), red diamond = permission wait, purple diamond = compaction, orange dot = subagent done, line = turn end.
- **Single-Subject Rich Panels (3.179.0, 3.181.0 — U-67):** Every point and tool span on the timeline is its own `AFTip` panel: **Who** (session, agent, engine, model), **What was said** (prompt whole and quoted / tool command and response), **Where** (clock time, turn number, delta), and **Actions** (click jumps to moment, right-click gives session actions). Tool spans are compact and avoid bloated stdout payloads.
- **Copy Corpus — Full Text at One Click (3.184.0 — U-76):** Right-click any point or tool block on the timeline → **Copy Corpus** copies the full prompt or response directly from the raw transcript on disk without opening the transcript viewer. Bridge op: `timeline.corpus`.
- **Read a Whole Conversation from the Bridge (3.536.0 — B-24):** `sessions.read` hands an agent one session's messages in the transcript page's own vocabulary — `user | assistant | tool | toolResult | system` for every engine, never an engine's own word (a Console snapshot's `agent`/`result`). It takes an id, its 8-character prefix or the transcript path (an ambiguous prefix is refused with the candidates), filters by role, turn and sidechain, pages with `from`/`limit`/`next` (negative `from` counts from the end) and cuts long text at `maxChars` with a `clipped` length. It reads through the viewer's own parse, so an agent never opens a transcript file itself.
- **Concurrent sessions of the same agent (2.45.0):** If the same agent is open in more than one session at once, each concurrent session gets **its own row** (`dev #1`, `dev #2` …) — events no longer overlap. Sequential (non-overlapping) sessions still share a single row as before, so row count doesn't balloon. Session cards, notifications and the Needs You queue also use the same `#k` label; a `×2` badge appears next to the status in the agent tree.
- **Click → go to that exact moment (2.37.0):** Clicking any marker in a lane **or a green tool block** doesn't just open the Session Viewer — it scrolls the log to **the exact message of that event** and highlights the message briefly with a frame. If the viewer is already open, the same click brings it forward and moves it to that point.
- **Your-turn alerts — the setting belongs to the SESSION, not the agent (3.144.0):** the four boxes to the left of each lane — **♪ sound · ◎ focus · ▣ modal · ▭ toast** — pick the actions to run when **that row's session** moves to **YOUR TURN**. A row *is* a session: three concurrent runs of one agent are three rows carrying **three independent selections**, clicking one never moves the others, and there is no "agent default" layer behind them (no selection = no alert). The second copy of the control that used to sit under the card is gone — the setting lives in the lane and only there. A row that draws only history has the boxes **disabled**: an alert is not armed on a conversation that can no longer fire. The selection is written to `globalState` under `agentfarm.turnAlerts[sessionId]`, the triggering is host-side — **it works even when the panel is closed** — and it survives closing the panel and reloading VS Code. When a terminal lane is re-keyed from its synthetic `cli:…` id to the engine's real conversation id, the preference moves in the same step; if the target already has one, nothing is merged and the clash is reported. The old agent-keyed map is copied **once**, by a versioned migration, onto the sessions that are live at that moment — and never read again.
  *Sound:* a short WAV shipped with the extension (`media/sounds/turn-ready.wav`, generated by `tools/make_turn_sound.js` — there is nothing in it to licence), played by a hidden PowerShell `SoundPlayer.PlaySync()` on Windows, `afplay` on macOS, `paplay`→`aplay` on Linux. The path never enters a command string (an environment variable on Windows, an `execFile` argument elsewhere), so there is no shell interpolation. Every attempt returns its backend, exit code, `stderr`, duration and whether it timed out; a failure is reported once with a real diagnosis and repeats are rate-limited. **`exit 0` means the player accepted the file — it is not a claim that anyone heard it.** *Focus:* brings the timeline panel forward (VS Code has no API that raises the OS window). *Modal:* a blocking dialog naming the right session + Open transcript. *Toast:* a non-modal corner notification. The four branches run **independently**: one failing never cuts the others.
  **One alert per turn**, keyed by the session's own turn ordinal rather than a blunt 3-second cooldown: the `Notification(waiting)` and the `Stop` behind it are the same turn and ring once, while a genuinely new turn a second later rings again. A permission wait is not YOUR TURN, and a session rebuilt from the event store on reload is never re-announced. Separate from the global `notifyTurnEnd` setting, which fires one toast for all agents.
- **"Test in 3 seconds" (3.144.0):** the **⏱** box on every live lane runs that row's selected alerts on purpose. The countdown is host-side, so you can switch to another window and see whether focus really comes back. The result appears in the strip under the chart — the session and all four branches, with an AFTip carrying each branch's `ok/failed/skipped`, the sound backend, its exit code, `stderr` and timing. With nothing selected the test is disabled. The same core is on the bridge: `live.alerts.get` · `live.alerts.set` · `live.alerts.test`.
- **AFTip & Live Interaction Rules (3.182.0, 3.195.0, 3.196.0 — U-74, U-81):**
  - **100% Solid & Opaque:** Panels are rendered with `editor.background` at 100% opacity; dimming is inherited via `tip-host` foreground color rather than block opacity, preventing transparency leaks.
  - **Hover Yields to Hand (U-74):** Any click or keystroke immediately mutes the hover panel until the pointer leaves the wrapper. Pressable triggers open slower (.6s) to stay out of the way of intentional clicks.
  - **Flicker-Free Redraws (U-73):** Live Timeline periodic DOM rebuilds safely re-place `tip-free` floating panels without losing scroll position or closing under a resting pointer.
- **Live sessions cards (3.193.0, 3.195.0 — U-80, U-81):** Prompt lines are truncated to 90 characters to preserve grid alignment; hovering opens the full text (up to 4,000 chars) in an `AFTip` alongside dedicated Money, Work, and Time metric blocks.
- **Host-Backed Clipboard (3.194.0 — U-82):** All right-click **Copy ▸ (The code · The words · Code and words)** actions delegate directly to the extension host via `vscode.env.clipboard`, eliminating webview focus failures.
- **Ending and clearing a session (3.31.0):** the card's buttons are ⌨ Terminal · ⎋ Interrupt (stops the turn, keeps the session) · **⏻ End session** (stops the claude process that owns it — asked first, and the transcript stays on disk) · **✕ Clear**. A session whose process the OS no longer knows is marked *"no live process — it is over, its hooks just never said so"*, loses its Interrupt button, and the page header offers to clear all of them at once. `sessions.live` / `sessions.end` / `sessions.dismiss` are on the bridge, so an agent can do all three too.
- **Right-click a lane row, not just a card (3.34.0, 3.202.0):** Rename · Open session · Terminal · Interrupt · End session · Clear · **Add to Wiki Candidates…** (S-38).
- **Clear means gone (3.34.0):** Clear takes the session off this page **whole** — card and row together, in every range, and it stays off across a window reload.
- The panel updates itself as events arrive, and a session nobody has heard from expires on its own within half a minute of its tracking window (3.31.0).
- Note: since events prior to 2.13.0 weren't written to disk, long ranges fill in over time after installation.

### Notifications

| Setting | Default | When |
| --- | --- | --- |
| `agentFarm.notifyPermission` | on | When an agent starts waiting for permission approval |
| `agentFarm.notifyStuck` | on | When no event arrives from a running session for `stuckThresholdSeconds` (240s; 0 = never) |
| `agentFarm.notifyTurnEnd` | off | Every time an agent finishes its turn (can be noisy) |

The **Open Timeline** button in the notification takes you straight to the swim-lane view. The status bar also turns yellow when there's a permission/stall: `🤖 2 active • $1.42 today • 🔔 1 waiting`.

### Security and Performance

- The listener is `127.0.0.1` only — unreachable from outside, no data goes to any external service.
- The hook command has the pattern `curl --connect-timeout 2 -m 15 ... || cd .`: the exit code is always 0, so a hook **never blocks the agent**. ‼️ X-265 — the limit used to be a flat `-m 3`, which never did the job it was there for: on `127.0.0.1` a missing listener is REFUSED in about a millisecond and no timeout is involved. What three seconds actually cut off was a listener that IS there and busy — measured 0.28–0.54s with the extension host idle, **6.7s under load** — and it failed silently, because `|| cd .` swallows the timeout. So the connect is bounded (the only hang a dead listener can really cause is a socket bound but not accepting) and the exchange is not.
- ‼️ **A captured account is a config directory, so it needs its own copy of the hooks** (X-265). `CLAUDE_CONFIG_DIR` moves which `settings.json` the engine reads; a session started on a captured sign-in reads the file in its slot directory. Agent Farm carries the settings file into a slot when it is captured, and repairs slots captured earlier on every activation — but only when the user's own file carries the hooks (removing them is a decision), and by seeding the slot from that whole file rather than a hooks-only stub. `hooks.status` and the cockpit card report a captured account without hooks as **partial**, naming it.
- Each tool call adds ~2 tiny processes (curl); imperceptible in practice.
- If two VS Code windows are open, the first to open takes the listener; the other shows "port in use" in the Timeline title — this is fine, one listener is enough.

## Task Queue

The coordination layer introduced with Phase 3. From the **Tasks** view in the side panel you queue jobs for your agents; each task opens a terminal in the agent's folder and starts `claude` with your prompt.

### One-Click Example Setup (2.39.0)

Against the blank-page problem: **Agent Farm: Set Up Example Automation…** sets up one of three working examples as a real, editable definition — 📥 **Inbox duty** (pick a folder → watch trigger + triage task), 🌅 **Morning briefing** (pick an agent → daily 09:00 headless task), 🔗 **Two-agent chain** (A analyze → `{prev_text}` → B summarize workflow, run it right away if you like). What's set up isn't magic; it shows up in the Tasks view, is editable, is deletable. Besides the command palette, it's reachable from the Tasks view's empty welcome screen, the Farm Status card in the Dashboard, and the setup walkthrough. The "Agent Farm: Setup in Five Steps" walkthrough under VS Code's **Welcome → Walkthroughs** section walks the five steps from introducing an agent to your first automation in order.

### Adding and Running Tasks

1. In the Tasks view, **+** (Add Task): pick agent → title → prompt → pick mode. The **?** popover button on the form (3.192.0) opens the interactive **Task & Retry Architecture Guide** right inside the webview without losing your draft (session continuity, quota windows, 3-prompt steering, and safety brakes).
2. Modes & Execution Targets:
   - **Interactive (3.197.0 — M-26):** Full interactive session control across two orthogonal axes:
     - **Opens in (`interactiveTarget`):** `vscode` (integrated terminal, default), `external` (dedicated OS terminal window / Windows Terminal via generated `.cmd` wrapper capturing `%ERRORLEVEL%`), `console` (Agent Farm's hosted Console webview panel).
     - **When it answers (`interactiveClose`):** `stay-open` (session remains interactive), `auto-close` (runs as a single turn via `claude -p` / `runArgs`; automatically closes the surface and marks the task done once the model replies).
   - **Headless:** `claude -p "prompt"` — runs the task in the background, archives the output, and exits. Ideal for automations.
3. **Saved Prompt Snippets (3.190.0 — M-24):** Right-clicking inside any of the four prompt input boxes on the task form (Task prompt, Retry prompt, Continuation prompt, Workflow step prompt) opens the shared prompt snippet picker (`media/afSnippets.js`) to insert templates directly at the cursor.
4. **Tasks Header Strip & Live Gate Metrics (3.200.0 — M-21):** The header strip on the Tasks page summarizes the farm's live status at a glance: ⚙️ Concurrency ceilings · ⏳ Waiting times & queue ordinal · 🛡️ Human approval gates · 📅 Schedule distribution · 🏁 Daily success rate · 💵 Spend & token derivatives.
5. **Plan & Runs Table AFTip Panels (3.191.0 — M-25):** The Runs table's **Tokens** and **Cost** columns, and the Plan table's **Guard** (saved wake-ups), **Agent**, **Cost 7d** (cost per run average), and **Last run** (exact local/UTC timestamps) cells are explained through rich AFTip panels.
6. Queued tasks wait in order; you start them with ▶ and reorder with ↑↓.
7. When a task terminal closes (or a headless command finishes) the task automatically becomes **done**. If shell integration is on, it's also marked **failed** based on the exit code. You can mark it complete by hand with ✓ any time.
8. If you turn on the `agentFarm.queueAutoAdvance` setting, when one task finishes the next task in that agent's queue starts by itself — chained running.

Task states: ○ queued → ⟳ running → ✓ done / ⛔ failed / ⊘ cancelled. Clicking a running task brings its terminal forward.

**Dedup protection (2.18.0):** if the exact same prompt for the same agent is already in the queue, Add Task warns you — preventing an accidental second add.

### Multi-Round Tasks and Automated Prompt Chains (3.292.0 — M-27 & M-30)

For unattended background workloads needing multi-stage execution within a single ongoing conversation ("first analyze, then refactor, then run test suite"), the **M-27 Round Chain** architecture is implemented:

- **Round 1 = Main Prompt:** The primary prompt textarea acts as the chain origin.
- **Dynamic Rounds (`+ another prompt`):** Each click appends `R2`, `R3`, `R4`... with its own prompt textarea, configurable delay (`wait: [N] min`), and removal button.
- **Same Conversation Binding (`resumeSessionId`):** Upon completing Round 1, the engine captures `runSessionId` and spawns Round 2 by resuming the exact same conversation (`--resume`). The model retains full context of what it did in earlier rounds.
- **Queued as Real Rows (`notBefore`):** Delays between rounds are not transient in-memory timers; they are persisted queue rows (`Task Name · R2`) carrying `notBefore` timestamps. They survive VS Code restarts and can be inspected or cancelled anytime.
- **Retries are Not Rounds:** A retry due to limit resets or errors stays isolated within its own round and does not burn subsequent rounds.
- **Schedules and Templates:** Multi-round prompt chains work uniformly across ad-hoc tasks, Daily/Weekly/OnceAt schedules, and Task Templates.
- **Runs Table `R2/4` Badge:** Active chained tasks display a round badge (e.g. `R2/4`) with rich hover details explaining pending durations.
- **⚡ Superpowers Selection (M-30):** Per-task and per-schedule manual override to enable or disable the Superpowers engineering discipline hook.


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

**Missed-time policy (2.75.0):** Creating a daily/weekly schedule (and Edit Schedule) asks a third question — *what happens when the time passes with no VS Code window open?* **Skip missed runs** (default, the old behavior): that occurrence is lost; opening late the same day still fires it, but a fully missed day is gone. **Catch up at first opportunity:** a fully missed occurrence fires as soon as the next VS Code window is up, no questions asked (the notification says "caught up"); that day's own occurrence still runs at its time. **Ask before catching up:** the missed occurrence is offered with **Run now / Skip this one** buttons — dismissing the toast means the next window asks again, it never dies silently. Configuring the policy settles the past: a freshly created catch-up schedule will not try to run yesterday's occurrence, only ones missed AFTER the choice are caught up.

**External schedule seeding (2.77.0):** an agent, a script or another machine's setup can install schedules by dropping a **`seed-schedules.json`** next to the store — the RUNNER window reads it at startup (and on runner takeovers), installs the schedules deduped by title, and deletes the file. Writing `farm-tasks.json` directly from outside races the runner's saves and loses; this file is the race-free way in. Format: an array of `FarmSchedule` fields (no id; broken entries are skipped, gaps get sane defaults).

**Important limit:** This scheduler runs while VS Code is open — if it's closed, that run is skipped (if you open it during the day, that day's task is triggered late; for fully missed days there is the catch-up policy above). For things that must run independently of VS Code, see the next section.

### Scheduling Outside VS Code (Windows) {#scheduling-outside-vscode}

You can move a scheduled task to the **Windows Task Scheduler**: right-click the schedule → **Export as Windows Scheduled Task…**

1. The extension generates a `.cmd` script that runs `claude -p "prompt"` in the agent folder and writes the output to a log file.
2. A ready `schtasks /Create ...` command is copied to the clipboard — paste it into a terminal and run it to complete registration.
3. Now the task runs even when VS Code (or even the session) is closed; outputs accumulate in the log file (reach it with "Open log folder").

### Farm Bridge — Agents Use the Farm Themselves (2.78.0)

The user directs an agent in chat; the agent uses Agent Farm **like a teammate** — queues tasks, installs schedules, runs workflows, starts missions, reads health findings. The gate is file-based, no port discovery needed:

- **Request:** `<globalStorage>/bridge/<name>.request.json` → `{ "op": "tasks.add", "args": { "agent": "developer", "title": "…", "prompt": "…" } }` (a UTF-8 BOM and surrounding whitespace are tolerated — 2.79.0; PowerShell's `Set-Content -Encoding utf8` output works as-is)
- **Response:** same name `.response.json` → `{ "ok": true, "result": … }` or `{ "ok": false, "error": "…" }`. The request file is deleted once processed; uncollected responses are pruned after 24 h. With VS Code closed the request waits — the next RUNNER window processes it (the caller should time out honestly).
- **The catalog describes itself:** `{ "op": "farm.ops" }` returns EVERY operation of that day's build with a one-line contract — an agent **discovers** instead of memorizing, and a feature added tomorrow joins the catalog with a single `register` line. As of 3.11.0 the catalog is a full **control plane**: `agents.*` · `tasks.*` (list/add/get/cancel/rerun/runNext/delete/clearFinished — `tasks.get` also returns the task's archived output) · `schedules.*` (list/add/**edit**/delete/toggle/runNow) · `triggers.*` (list/**add/edit/delete**/toggle/fire — adding a webhook returns its POST url) · `workflows.*` (list/**add/delete**/run) · `templates.*` (list/**add/delete**/run) · **`duties.*`** (list/add/update/delete/togglePause/move/automate — the standing-duty system is manageable end-to-end; `duties.list` also says whether work is waiting on a watch target, and `duties.add` warns when CLAUDE.md lacks the DUTIES.md reference or appends it itself with `ensureReference=true`) · `missions.*` (list/start/status/**pause/resume/cancel/answer/approve** — a pending question/approval shows in `missions.status` and is answerable over the bridge) · `notices.*` · `toolbox.*` · `turns.list` · `insights.list` · `sessions.recent`. The current, complete list always lives in `farm.ops`.
- Every processed request **shows as a notification** — what an agent does on the farm is never silent. A bad request gets an honest error pointing at the catalog.
- `seed-schedules.json` (2.77.0) stays — the simple path for pure schedule seeding; the bridge is the general gate.

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

**The handover line (3.738.0; `quotaBrake.ts`):** a task that **names an account** (a slot, or a rule resolving to one) is also held when that slot's own 5-hour window is at or past `quotaHandoverPct` — even with `quotaGuardPercent` at 0, because a run started there is told to hand over on its first reading and ends having done nothing. The board says `quota handover line (93% of kate's 5h window, at or past 90%: …)`; it starts by itself when that window resets. A guard set lower than the line keeps its own word; a task that names no account is judged only by the guard; `quotaHandoverPct` 0 turns this off.

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

Management: the **Add Trigger** wizard; on the trigger row ▶ (fire by hand), toggle on/off, delete; right-click → **Edit Trigger** to change name, prompt, target agent, model, precondition, debounce, cooldown and hourly cap afterwards (2.8.0 — editing `farm-tasks.json` by hand is no longer needed). Firings, skips and the last fire time show on the row. If the watch path is lost, the row shows a "path missing" badge.

## The Automation Gate {#otomasyon-kapisi}

Added in 3.17.0. The storm brakes above (debounce / cooldown / hourly cap) are all **frequency** brakes: they cap how *often* an agent wakes, never whether waking is *worth* anything. The measured result: one folder watch woke opus 23 times over five nights, found nothing every time, and cost **$70.90**. The only way to learn "there was nothing to do" was to pay for a full wake-up.

Now every unattended run must pass two questions **before** a model is spawned.

### 1. May the farm work right now?

- **Master switch** — `Pause All Automations` / `Resume All Automations`, with an optional reason so a forgotten pause stays explainable.
- **Timed pause** — 1h / 8h / 24h; it expires on its own, no cleanup.
- **Quiet hours** (`Set Quiet Hours`, e.g. 23:30–04:30, may wrap past midnight) — nothing wakes on its own inside the window. A schedule whose time arrives is **deferred, not dropped**: it fires when the window ends and shows a `deferred` badge. Manual "run now" ignores quiet hours — pressing a button is not an unattended wake-up; the master switch still applies to it.

### 2. Is there actually work? — the `fireIf` precondition

A content brake on schedules and triggers, evaluated **for free**:

| Kind | Fires when | Typical use |
|---|---|---|
| `folderHasFiles` | the folder holds ≥ `minCount` files (`except[]`, `recursive`) | an inbox that should end up empty (`except: ["_LOG_.md"]`) |
| `fileMissing` | the path does **not** exist | nudges: today's diary entry was never written |
| `pathChangedWithin` | the path changed within `hours` | act on fresh activity, ignore a stale tree |
| `queueHasWork` | the work queue holds ≥ `minCount` live items | sweeps — don't wake for an empty queue |

Paths accept **`{today}` / `{yesterday}`** (local `YYYY-MM-DD`). **Opt-in**: nothing that already exists changes behaviour. An unknown kind **fails open** (fires) — a guard must never suppress real work by accident.

A precondition that fails wakes nobody; a schedule stamps that occurrence as settled (so it doesn't retry all day) and a trigger increments `skipCount`. **Every decision (fired/skipped + reason) is written to `automationLog`** — a guard that silently swallowed work would be precisely the "rule that fails silently" the agent constitution forbids. The log is readable at the bottom of the Living page and through `automations.status`.

### 3. The model belongs on the automation

`FarmSchedule.model` and a trigger's `action.model` **beat** the `agentFarm.modelPolicy` regex engine. Reason: a policy rule could silently contradict the duty's own `DUTIES.md` line (real case: the text said "run this on opus" while the rule downgraded it to sonnet). The model is now picked in the wizard and badged on the row.

### 4. Budget is a brake, not a warning

`agentFarm.budgets` (per agent name, `"*"` = fleet) now **blocks the launch** once today's ceiling is reached — the task is parked with the reason. It used to raise an insight and start the task anyway; a ceiling you can walk through is not a ceiling.

### Bridge

`automations.status` (the gate + per-automation fired/skipped/skipRate + what would fire right now) · `automations.pause {minutes?, reason?}` · `automations.resume` · `automations.quietHours {from,to}` · `automations.bulk {set, kind?, titles?, tag?}`, plus `model` and `fireIf` arguments on `schedules.add/edit` and `triggers.add/edit`. Why an automation didn't run is never guessed — it is asked.

## Multi-Agent Workflows

Phase 4's most powerful tool: **Workflows** — chains where several agents run in sequence. Set up with `+ Workflow` on the Tasks page's **Plan** tab.

**‼️ A CHAIN IS A LIST, SO ITS FORM IS A LIST TOO (3.83.0 · U-9 phase 2).** This used to be a 294-line wizard: it asked for step 4 without ever showing steps 1–3, there was no way back to step 2, and Esc discarded the lot. The chain now sits on the page — a list you can read, reorder with `↑ ↓`, copy, delete and edit in place. **Adding, moving and deleting a step act on the DRAFT**, so `Cancel` really cancels and a reorder is one save rather than N separate commands. The save button sends the name and the whole chain in **one message**.

**One step is one card, and what it IS decides the rest of the card.** Six kinds: 🤖 **agent** (runs a prompt), 🌐 **webhook** (an HTTP call, no agent), 🎬 **media** (fal.ai / Replicate), 🧭 **browser** (an agent drives a site), ✋ **approval** (the chain waits for you), 🖼 **select** (you keep some of the produced assets). Changing the kind changes half the card; in the wizard that was the **first question** and everything after it depended on the answer — in a form you can change your mind on step three. The block at the bottom of the card is the same on every kind, because it is about the **chain** rather than the step: failure policy (`onFail`), conditional run (`runIf`), output contract, judge criteria and parallelism. It refuses **inside the card**, never in a modal.

`agentfarm.newWorkflow`, `addWorkflowStep`, `editWorkflowStep` and `renameWorkflow` — from the palette, the sidebar or a row's menu — all open this form; `addWorkflowStep` opens it with a blank card, `editWorkflowStep` on that step. On the bridge: `workflows.update` (name + the whole chain in one call), `workflows.step.add` / `.update` / `.move` / `.delete`.

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
- **Agent side (3.741.0):** `workflows.select` — no args lists the open picks with numbered candidates; `picks` (1-based) or `urls` keeps, `cancel:true` cancels. Same count rule as the page; the first answer wins and the page closes itself.

Typical chain: *agent writes prompt → media (produce 4 candidates) → **visual selection (keep 2)** → media (image→video, `{prev_json.selected.0}`)*.

### Editing Workflows

You don't need to delete and rebuild an installed chain (0.7.0):

- **On a workflow:** the row's `edit` — it opens the name **and the whole chain**. A workflow's "edit" used to be `addWorkflowStep`, which made editing the one thing you could not do to a workflow; the name had a separate "Rename" entry. Both are one entry now (3.83.0).
- **On a step:** `edit` in the form — it opens that step's card. This used to be a **quickpick of FIELD NAMES**: pick "On fail", answer one box, reopen the menu for the next field; fifteen entries deep on a media step, with no way to see two of them at once. `↑ ↓ copy ✕` sit on the row.
- Changes are persistent **once you save** and take effect on the next run; they don't affect a run in progress.

### Visualizing Chains

The Live Timeline now has a **Workflow runs** section: every chain run in the last 4 hours in its own strip, with steps as numbered blocks — green = done, blue = running, red = failed. Hover over a block: step name, agent and duration. You literally watch one agent hand work off to another.

## Supervised Workflow {#denetimli-akis}

Between a workflow (a fixed chain) and a mission (a leader that plans): **the chain stays the skeleton, and a supervisor steers it at the points you choose** (X-365, waves G and H — M-35, M-36). Nothing here is on unless a workflow says so; a workflow that says nothing runs exactly as before — the *mechanical* path.

| Piece | What it does |
|---|---|
| **Checkpoint step** (M-43) | A step with no agent. The run stops there and the supervisor is asked to route it: `proceed` · `retry` · `jump` · `insert` (an agent or an approval step) · `ask_user` · `stop`. Per checkpoint: `message` (what to look at), `allowed` actions, `maxInsert` (0–5), `insertKinds`, `maxRetries` per step, `minConfidence` (a decision below it is not applied). The decision is JSON, validated before it is applied. A `stop` on the chain's **last** step is the run reaching its end: it ends `done` ("the supervisor ended the run at its last step: …"), so the library files its last output as `final` and enriches it (3.738.0); a `stop` earlier, or on a wake after a failed step, ends it `stopped`. An `ask_user` waits on four doors — the window's notification, Needs You, the phone, and `workflows.answer {id|runId, option|answer}` (3.739.0; no args lists the open ones) — and `farm.waits` shows it as a `workflow-question` a person ends; a window reload drops it and the run goes the mechanical way. |
| **Wake** (M-45) | What wakes the supervisor after a step ends: `mechanical` (never — the default), `smart` (every step), `hybrid` (a failed quality check, a failed step, the run past $2), or a list of conditions over `workflows.wakeFields`. Nothing fires → the mechanical path; something fires → the supervisor decides as at a checkpoint, and the row names the condition. |
| **The supervisor** (M-44) | One persistent session per run, with a call ceiling, a budget and a mechanical fall-back when it cannot or should not be asked. |
| **Feeding the flow** (M-35) | Inputs (`workflows.run {inputs}`, a trigger's payload), the run's board (`{steps.<id>.json.x}`, `{run.x}`), for-each fan-out over a list, local files uploaded to a provider, a modality-aware judge. |
| **Live steering** (M-46) | A person can steer a running flow and change its settings live (Needs you, Telegram). |
| **Missions** (M-47) | A mission's `run_workflow` hands a flow its inputs; the supervisor escalates to the mission's leader. |
| **One condition engine** (X-371) | Wake conditions and sentry policies share `policyEngine`. |
| **Supervisor strip** (U-153) | The run page shows each decision, why, what it cost and where it came from. |

The retry supervisor (M-13, a cut-off task deciding how it goes on) is the same core in its special case (M-48). Every choice above is a flex point: a value set in Farm Settings, the workflow form, the step card, the run or live, resolved by `core/flexResolve.ts` with its origin.

### Feeding the flow — inputs, the run's board, for-each, local uploads {#feeding-the-flow}

(M-35: M-38 · M-39 · M-40 · M-41.) What a supervised chain reads and hands on. Each part works on its own, in any workflow, supervised or not.

**Inputs (M-38, `src/core/workflowInputs.ts`).** A workflow declares what it is given when it starts: `inputs: [{name, type, default?, required?, description?, choices?}]`, type `file · folder · text · choice · number · url · airtable` (an `airtable` input carries a search whose records become the value before the first step — X-420). Every step reads one as `{input.<name>}`. A run gets its values from three places, and each value remembers which: **run** (the **Run with…** card, `workflows.run inputs={…}`), **trigger** (a trigger's mapping, filled from its firing with `{watch}` `{file}` `{payload}` `{payload.a.b}`), **workflow** (the input's own default). A run missing a required value **does not start** and says which input and why.

```json
{ "title": "Clip edit", "inputs": [{ "name": "clip", "type": "file", "required": true }, { "name": "brief", "type": "text", "default": "warmer colours" }],
  "steps": [{ "id": "edit", "agent": "kurgu", "title": "Edit", "prompt": "Edit {input.clip}: {input.brief}" }] }
```
A folder trigger that runs it maps `{"clip": "{file}"}`; by hand: `workflows.run id=<id> inputs={"clip":"D:/in/a.mp4"}`.

**The run's board (M-39, `src/core/runContext.ts`).** A run remembers every finished step, not only the last one, under a **stable id** (`s<n>` when none is given; a copied or repeated id is renumbered), so an inserted or jumped-to step never shifts what a later one reads: `{steps.<id>.text}`, `{steps.<id>.json.a.b}`, `{steps.<id>.file}`, `{steps.<id>.verdict}`, plus `{run.cost}` and `{run.note}`. `{prev_text}` / `{prev_json.x}` / `{prev_output}` still mean the step right before (`{prev_text}` cut at Farm Settings' `workflowPrevTextChars`, 1,500). The board lives on the run record and survives a reload; the supervisor's brief is built from it. Example: a publish step's metadata `{"title": "{steps.idea.json.title}", "description": "{steps.script.text}"}`.

**For each (M-40, `src/core/forEachStep.ts`).** A step with `forEach: {list, …}` runs once per element of a list: `{steps.<id>.json.path}`, `{steps.<id>.text}` (one item per line), `{prev_json.path}`, `{prev_text}` or `{input.<name>}`. Each element is a branch whose prompt sees `{item}`, `{item.a.b}` and `{index}` (0-based). Flex points (step level): `concurrency` (4, 1–16), `retries` per element (0–5), `cap` (20, at most 200) with `capMode` `soft` (the first *cap* elements run, the rest are left out and the fan-in says `capped`) or `hard` (a longer list refuses the step), `budgetUSD` per element, and `onBranchFail` — `continue` (the others go on; the failed one is marked) or `drop` (one failed element, after its retries, ends the step). The fan-in hands the next step every branch **in list order** as `json.items[]` — `{index, item, status, text?, json?, file?, reason?}` — plus `total` and `capped`; its text is one section per element. The branches live on the run record: a reload resumes only the ones that had not finished.

```json
{ "id": "shots", "agent": "kurgu", "title": "Render each shot", "forEach": { "list": "{steps.script.json.shots}", "concurrency": 2, "onBranchFail": "continue" },
  "prompt": "Shot {index}: {item.prompt}" }
```

**Local files to a provider (M-41, `src/core/mediaUploadBridge.ts`).** A media step whose input names a file on this computer uploads it to the provider's storage by itself (fal or replicate — Farm Settings `mediaUploadProvider`, else fal) and hands the model the https URL; the same content is uploaded once and reused until the URL expires. The step's task keeps each upload (path, URL, provider, cached). The same door on the bridge: `media.upload path=<file> provider=?` → `{url, provider, cached, hash, expiresAt?}`. It uses the key the media step uses, and says so when there is none.

## Kapici — the generic decision gate {#kapici}

**Core only (X-410 · X-411 · X-412, 3.744.0) — nothing calls it yet; every consumer will get its own `agentFarm.kapici.<consumer>` = off · shadow · on, default off.** A decision Agent Farm takes today with a hand-written rule or an LLM judge can be asked as typed questions (noul = a probability, choice, score) of a small classifier instead. `src/core/kapici/` is a pure core — it imports only its own folder and node `fs`/`path`/`crypto`, never vscode, and everything Agent-Farm-specific comes in one injected `KapiciDeps` (`test_kapici_rules.js` pins the boundary). Rules resolve builtin → system (`_KAPICI/`) → project (`.kapici/`), later wins (`rules.ts`); `kapici.ts` → `evaluate(ruleId, state, opts)` / `ask(state, questions, opts)`: the input is masked (key/token patterns and every vault value) and trimmed to a budget from the middle (`input.ts`), the cache is asked (10 min; never a sensitive rule or a fallback), the providers run in the rule's order — `heuristic` answers every question carrying a local `check` (numbers, dates, counts, patterns never leave), `jev` the rest (TypeSafe `jev-1.13.0`, or the same request through the Vercel AI Gateway `typesafe-ai/jev`; 3 s deadline, one backed-off retry on 429/529), `llm` the injected judge with a +0.1 stricter bar — then the arbiter decides (`arbiter.ts`: threshold, escalate / mechanical / ask, onFailure open / closed / fallback, a reason synthesized from the answers) and one JSONL line goes to `audit-YYYY-MM.jsonl` (hash and length of the input, never the input or a key). It never throws: no rule, no key or a fault of its own comes back as a verdict whose `fallback` hands the decision to the caller's own path. Design: the project note *Kapıcı — Jenerik Karar Kapısı (X-403)*.

**On the bridge (B-27, 3.745.0)** — `src/core/kapiciBridge.ts` (no vscode; `extension.ts` hands in the vault, the settings, the agent roots and the one-shot judge): `kapici.eval {rule, state | statePath, criteria?, project?}` → the verdict · `kapici.ask {state | statePath, questions, providers?}` → answers without a rule · `kapici.rules {project?}` → every rule with its winning layer and golden count, plus the files that failed · `kapici.rule.check {rule}` → the golden examples run for real, pass/fail per case · `kapici.audit {consumer?, rule?, since?, limit?}` → recent decisions and the shadow agreement rate per consumer · `kapici.status` → which vault key it would use and whether it is PRESENT (never the value), the road, the provider order, rule folders. `statePath` is an absolute file (`.json` read as an object, 4 MB cap). Settings: `agentFarm.kapici.rulesDir` · `.timeoutMs` (3000) · `.providers` (heuristic, jev) · `.route` (auto: `TYPESAFE_API_KEY` → TypeSafe, `AI_GATEWAY_API_KEY` → Vercel) · `.keyName`. No op reads or writes the key — the vault's bridge exception holds. A provider's error applies the rule's `onFailure` and never walks on to the next provider (3.746.0) — with no key that would be a silent model call on every decision.

**Off · shadow · on (X-413, 3.746.0)** — `src/core/kapici/shadow.ts` → `gate({mode, today, ask, decisionOf, fromVerdict})` is the one road every consumer takes. *off*: Gatekeeper is never called and `today()` runs exactly as before. *shadow*: `today()` runs and its result is returned untouched; Gatekeeper is asked afterwards in the background with today's decision as `actual`, so the audit line records `agreed` — nothing waits for it and nothing it does reaches the flow. *on*: Gatekeeper first; a confident verdict the consumer can use wins, anything else (low confidence, a failure, an unusable pick, a throw) goes to `today()`. `kapici.audit` → `agreement` per consumer: compared, agreed, rate, the confidence spread and the newest disagreements. Switching shadow → on is the user's call. **The dispatch consumer (M-57)**: `agentFarm.kapici.dispatch` (off by default); when no dispatch rule matches, `dispatch.route` is asked with the candidate agents as its options and their CLAUDE.md hints as the option texts; `DispatchResult.method` gains `kapici`, its `reason` is the synthesized one; low confidence → the Haiku classifier as before. `dispatch.test` (B-17) goes the same road.

**The retry supervisor consumer (M-58, 3.747.0)** — `src/core/kapiciSupervisor.ts`. `SupervisorPolicy.engine = 'kapici'` (`KAPICI_ENGINE` in `supervisorRunner.ts`) asks no model: the incident bundle is the state of rule `retry.next-action`, the five continuations are its choice, and an action the incident cannot take is never offered (`supervisorOptions`: `resume` only with a session to continue, `wait` only with a known `resetAt`). Jev writes no text and no time, so `kapiciAnswerText` fills what `validateDecision` asks for mechanically — resume's `prompt` is the policy's own continuation text for the next attempt (`continuationPromptFor`), wait's `notBefore` the reset, `reason` = `Gatekeeper: ` + the synthesized one, `confidence` Jev's — and writes it as the supervisor's JSON, so it passes the same check an LLM answer does; below `minConfidence` the policy's `lowConfidence` fallback applies as for any engine. Setting `agentFarm.kapici.retry` (off by default): *off* — a Gatekeeper-engine policy falls back naming the setting, every other engine is asked exactly as before; *shadow* — the LLM supervisor decides and Gatekeeper is audited beside it; *on* — Gatekeeper first, anything unsure goes to the LLM supervisor. The settle meta carries `engine: 'kapici'` when Gatekeeper decided, and `supervisorRoom` answers `free` for it (it shares no plan window). The New-task form lists `Gatekeeper — no model` among the supervisor engines only while the setting is not off; a stored Gatekeeper policy stays selected and says it is off.

**The trigger precondition consumer (M-59, 3.748.0)** — `src/core/kapiciTrigger.ts`. `Precondition.kind = 'kapici'` with `rule?` (default the built-in `trigger.has-work`, a noul with `passIf work > 0.5`, `onFailure: open`) and `input?: file | diff`; `parsePrecondition(raw, { kapici: true })` accepts it for triggers only (`triggers.add` / `triggers.edit`), a schedule still refuses it, and the four other kinds parse exactly as before. The synchronous `evaluatePrecondition` passes it on (`Gatekeeper asks <rule> when it fires`), so `tryFire` runs the cheap brakes first — cooldown, hourly cap, the farm gate — and `askKapici` last: it answers `true` at once, marks the trigger `asking` (a second firing meanwhile is skipped with `Gatekeeper is still deciding the previous firing`), and when the verdict comes reads the trigger again (switched off meanwhile → nothing). `kapiciFiring` → the state is the firing (`trigger`, `event`, `file`, `path`, `payload`, and the file's first 64 KB or its `git diff`, falling back to the content when the diff is empty); *off* fires as if the precondition were not there, *shadow* fires and audits Gatekeeper with `actual: 'pass'`, *on* lets a confident verdict decide (`Gatekeeper: <rule> — no work (…; confidence …)` goes to `markTriggerSkipped`), `onFailure: closed` skips, anything else fires. Setting `agentFarm.kapici.trigger` (off by default); `KapiciHost.trigger(mode)`, consumer `trigger`. A dispatch-action trigger now routes through the dispatch consumer too (`DispatchOptions.kapici`).

**The workflow step consumer (M-60, 3.749.0)** — `src/core/kapiciStep.ts`. A step `{ kapici: { rule, input?, onReject? } }` (no agent; `agentName` `kapici`) asks one rule about the run so far — `input` is a template, default `{prev_text}` — and routes the chain with the checkpoint's own words: `proceed`, `stop`, `ask_user`. A pass/reject rule (`passIf` / `rejectIf` / `scoreMin`) proceeds on pass and takes `onReject` (stop by default); a choice rule whose options are exactly the routes names one; any other rule is refused when the workflow is saved (`stepRuleFit`, through `KapiciHost.stepRuleRefusal` in `workflows.add` and the page's save), and so is a Gatekeeper step in parallel or for each item (`kapiciStepRefusal`, also in `checkWorkflowInputs`). `runKapiciStep` in `tasks.ts`: *off* carries on as if the step were not there, *shadow* carries on and audits with `actual: 'pass'`, *on* routes on a confident verdict; `onFailure: closed` stops, a low-confidence `ask` asks you, anything else carries on. `ask_user` goes through the approval gate (`confirmApproval`; none wired = carry on). The upstream handoff passes through untouched; the run board gets `<route>: <why>`; the row carries a `supervisorCall` (model `Gatekeeper`, mechanical when it did not decide), so the Runs table and the supervisor strip draw it like a checkpoint visit — and the trail does not count it as a supervisor call. A stop ends the run `stopped` (`done` on the last step). Setting `agentFarm.kapici.workflow` (off by default); `KapiciHost.step(mode)`, consumer `workflow`; the page's step card is `media/afKapiciStep.js`, its three boxes are flex points `kapici.step.rule / input / onReject`. Example: `{"title":"Tek satır başlık","steps":[{"id":"s1","agent":"yazar","title":"Başlık yaz","prompt":"Bu video için tek satırlık bir başlık yaz: {input.konu}"},{"id":"kapi","title":"Kapı","kapici":{"rule":"metin.tek-satir","onReject":"ask_user"}},{"id":"s3","agent":"yazar","title":"Yayınla","prompt":"Başlığı kanala koy: {prev_text}"}]}`.

**On the pages (U-155, 3.750.0)** — no panel of its own; `media/afKapici.js` draws three things. *The chip*: `src/core/kapiciChip.ts` `chipOf(verdict, consumer, outcome)` keeps what a row needs (rule, decision, confidence, provider, latency, each answer in a few characters, the rule path when it was not the provider's own, why); a trigger stores its last precondition verdict as `lastKapici` (outcome fired / skipped) and the Plan table draws it under the guard; a task Gatekeeper routed to its agent carries `kapici` (`DispatchResult.kapici`, set on the task by a dispatch trigger) and the Runs table draws it under **Started by**, beside the source's panel and never inside another one. The chip reads `🛡 <outcome> <confidence>`; its AFTip carries the figures. *The trigger form* offers Gatekeeper as a guard on a trigger only (a schedule is refused where it was picked): the rule (empty = `trigger.has-work`) and what it reads (the event and the file, or its git diff), read back through `parsePrecondition(…, { kapici: true })`. A retry Gatekeeper decided shows as the supervisor engine `kapici` on the existing retry surfaces; a workflow step draws on the supervisor strip (M-60). *Farm Settings*: every `agentFarm.kapici.*` setting is filed under its own section, **Gatekeeper — the decision gate**, headed by the key (present / missing by name, never the value, and the names looked for), the rules and any broken rule file, and the shadow agreement per consumer over 30 days (`KapiciHost.agreement`); a **Secret vault…** button opens the vault (`openSecrets`, navigation in the parity manifest). *Toolbox*: a **Gatekeeper** tab (not counted, like Services) lists every rule — id, layer, question types, golden count; on hover the description, file, providers and the rule's low-confidence and failure paths — from `KapiciHost.ruleList`, the same list `kapici.rules` answers.

**As an MCP server (B-28, 3.750.0)** — `src/mcp/kapici/` is a zero-dependency stdio server with three tools, `kapici_eval` · `kapici_ask` · `kapici_rules`, each one bridge op (`kapici.eval` / `kapici.ask` with `consumer: "mcp"`, `kapici.rules`); a relative `statePath` is made absolute from the server's working folder. It calls no provider and holds no key: it `require`s the staged bridge helper (`<globalStorage>/bridge/af.js`, or `out/service/af.js` from a checkout) and uses its `executeBridgeRequest`, so there is one request/response protocol. A request nobody takes within `KAPICI_MCP_CLAIM_MS` (8 s) is the error "VS Code is closed … nothing ran"; one taken and still running is waited for up to `KAPICI_MCP_ANSWER_MS` (180 s) through its response file. `src/core/kapiciMcp.ts` stages `out/mcp/kapici/*.js` to `<globalStorage>/mcp/kapici/` on every activation (beside `bridge/af.js`, so the helper is `../../bridge/af.js`) and registers it user-wide in `~/.claude.json` **only when asked** — Farm Settings ▸ Gatekeeper ▸ **Give agents the MCP** / **Take the MCP back**, or `kapici.mcp.register` / `kapici.mcp.unregister`; `kapici.mcp` reads `{staged, path, registered, upToDate, configFile}`, which the section head shows. `npm run verify` checks every `out/mcp/<server>/*.js` is in the VSIX.

## Flexibility — flex points, the resolution chain, presets {#esneklik}

Every value a person chooses — a box, a setting, a bridge argument — is a **flex point** (X-366). It is declared once and resolved one way, so every surface says the same thing about it.

- **The registry** (`media/afFlex.js`, X-367): each point has an id (`library.allin.unsure`, `retry.supervisor.maxCalls`…), a type, a built-in default, and its **levels** — each level with the surface it is set on and the bridge key that sets it. `test/test_flex_points.js` resolves every declared surface and bridge key against the real files and ops, and fails a surface control no point claims: a new preference without a point does not build.
- **The chain** (`core/flexResolve.ts`, X-368), lowest to highest: `builtin` → `settings` (Farm Settings) → `agent` → `project` → `workflow` → `step` → `run` → `live`. The highest level that says something wins; the answer is the value, **where it came from**, what it beat and what was ignored and why — one sentence every surface writes (MIRROR: the value first, then its origin).
- **Presets** (`core/flexPresets.ts`, X-369): named bundles of values applied at one level in one move (e.g. the retry supervisor's cautious / balanced / thorough); the resolution says which preset a winning value came from.
- **Smart forms** (X-370): a range, a tri-state (ask / auto / never), a soft or hard cap, a suggestion.
- **Farm Settings ▸ Flow & Content** (U-152, 3.667.0): every point that has a settings level, derived from the registry, with its origin and the presets; bridge `flex.*` / `presets.*` (`flex.set` writes the settings level).
- **Merged field by field** where a value is an object (U-151, 3.686.0): the retry supervisor keeps only the fields a level said, so a task naming only its engine still takes the calls and budget from Farm Settings.
- **Per agent and per project** (U-151, 3.689.0, `core/flexOverrides.ts`): `agentFarm.flexOverrides` holds values set for one agent (by name) or one project (by id); `flex.set level=agent|project target=…` writes them, `flex.get agent=/project=` reads them, the runtime lays them over Farm Settings for each run, and the task form names the level every empty box inherits from. A workflow's own values live on its record.
- **↑ Make default / ↺ back to inherited** (U-151, 3.694.0, `media/afFlexPromote.js`): a box that holds its own value carries a small ↑; pressed, a strip under the row moves the value up the chain in one move — this project · this agent · everywhere (Farm Settings) — or drops it (↺, nothing written). A box that inherits draws nothing. The page posts `flexPromote`; the host writes through `flex.set`'s own cores (`setFlexOverride` / `setFlexSetting`), answers `flexPromoted` and the box empties to inherit the value it just wrote. A change to `agentFarm.flexOverrides` or `agentFarm.taskRetry` from anywhere (the bridge included) redraws an open task form. Surfaces: the task form's supervisor row, and the workflow form's "Fill the records" boxes (`library.enrich.*`, where the only level above a workflow is everywhere; their empty boxes show the Farm Settings value faint, SHORTHAND `↳ <value>` on a select). The levels offered are read off the registry — `AFFlexPromote.levelsAbove(point, fromLevel, ctx)` keeps the point's declared levels above the surface's own that the run has a target for, and `pointAt(surface)` names the point a box sets — so the step card and run start reuse the same control. The step card (3.696.0): a media or tool step's Library boxes (database, language, template, records) and its "Wake after it" override move up to **this flow** — a move inside the form, into the workflow's own box (`on.local` in `AFFlexPromote.wire`; nothing is posted, the workflow save writes it); a tool step's output folder and "file already there" go **everywhere**. A surface hands its row `promote = { open, levels(point) }` and draws with `AFFlexPromote.up` / `stripFor`, so a point with nothing above it (the library stage) draws no ↑. `levelsAbove` never offers a Farm-wide level the host cannot write as a VS Code setting. The Run card (3.697.0): an input box whose value differs from the workflow's default, and a Wake preset picked for this run, carry ↑ → **this flow**, written by the host onto the workflow record — `flex.set level=workflow target=<workflow id or title>` (`name` = which input), core `core/flexWorkflow.ts` `setWorkflowFlex` (workflow.wake: a preset name or a condition list, checked by `wakeFromArg`; workflow.input: the named input's default, checked by `flexValid` + `valueProblem`; any other workflow-level point travels with its whole object and is refused, naming workflows.update), then `taskManager.persist()`. One point with several boxes is keyed `point#qualifier` (`workflow.input#clip`, `workflow.wake#run` — apart from the step card's `workflow.wake`); the page posts `name` = the qualifier and the host echoes it on `flexPromoted`. A run input made the default keeps its value (it IS the default now); ↺ puts the workflow's default back. The one `AFFlexPromote.wire` call sits outside the composer so the Run card is wired with no form open. What an empty box inherits is drawn on every surface the same way (3.699.0): a text box's placeholder is the inherited value and its origin, faint ("EN — the workflow's", "D:/x — Farm Settings"); a picker leads with `↳ <value>` and is faint (`select.inh`) while it inherits; the tooltip opens with the value and where it comes from (MIRROR: "— set on this step" · "— inherited from the workflow / Farm Settings" · "— built-in"). The step card's Library boxes read the workflow draft being edited; its tool boxes read `launch.flexSettings`, which now carries every point with a workflow OR step level whose Farm-wide value is a VS Code setting. **Run with…** (3.700.0, `media/afRunWith.js`): the Run card is the page form (`AFForm.card`, keys `wi-run.<input>` and `wi-wake` — the run-level surfaces of workflow.input and workflow.wake in the registry), opened by `with…` on EVERY workflow row (one with no inputs gets its wake set alone) and by `run` on a workflow with inputs. Every box starts at the last run's value: the inputs from `lastInputs`, the wake choice from `lastWake`, which the host writes on a Run-with run (`tasksPanel` `workflow:run`: a preset id is kept, "the workflow's" deletes it). A field change keeps the draft in step (`AFRunWith.apply`) and redraws only when a box gained or lost a value of its own (`changed`) — the ↑ comes or goes. `AFForm` fields take `after` (markup after the label, used for the ↑). **Run with… on a schedule** (3.701.0): `with…` appears only on a schedule whose OWN retry is supervised (the plan row carries `supervised` + its `supervisor`; elsewhere nothing applies, so nothing is drawn). `AFRunWith.scheduleCard`: a preset picker (the presets with run-level supervisor values, `launch.runPresets`) and this run's supervisor boxes, each empty one showing what it would use and from where (the preset, this schedule, the default). One door for the page and the bridge: `runScheduleWith` in `extension.ts` — `core/runWithTask.ts` `runSupervisor` checks each value against its `retry.supervisor.*` point (only points with a run level), `presetSupervisor` takes a preset's run-level values (`presetArgs(p, 'run')` → `tasks.add`), typed boxes win over it, `retryForRun` lays them over the schedule's supervised retry (refused when it is not supervised), and `runScheduleNow(s, { retry })` runs it once — the schedule keeps its own. Bridge: `schedules.runNow supervisor={…} preset=<name>`; without either it is the plain run-now. `setFlexSetting` refuses a point whose Farm-wide value is not a VS Code setting (the Airtable page's defaults) and names the op that writes it, instead of writing its surface as a setting key.

A choice the system already lets the user make at the moment of use is a flex point, not a question: nobody is asked for it in advance.

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

**Who runs on which endpoint (3.534.0–3.537.0, X-107).** The same shape for the **route** — the endpoint a Claude delegation really talks to (Anthropic, a Kimi profile, MiniMax…), which the engine itself never says. Each team row carries a **Route** box and, under a route that serves tiers, a **Tier** box (`opus` is `kimi-k2-thinking` on one route and `MiniMax-M2` on another, so the tier is asked under its route and dropped when the route changes); the **Orchestrator** block carries its own pair for the planner's calls; **Apply profile** writes both onto every included row. Empty means what every mission before did: the mission's own route, then the agent's standing record at the spawn. A route the machine cannot point at refuses the mission by name before it exists, not at round three. Drawn only where the engine has routes at all — on an engine with none the row shows a `—` in the slot so the columns stay columns.

**You can see it breathe.** While a run is active the page shows a live **now strip** — *lead is planning round 2 · 1m 40s*, *round 2: running coder + reviewer (wave 1/2)* — fed by the same state events the engine writes anyway (zero extra load on the run). The sidebar run row carries the same line.

**Mission control — everything in one place (2.67.0).** The run page is a full observation room while a mission is in flight, built entirely from data the extension already has (hook events, task outputs, session index — no new pollers):

- **Live activity** (collapsible, under the now strip): a header of per-participant status chips — *lead (lead): working · coder: tool (Edit) · reviewer: quiet* — over a mission-scoped feed of hook events (prompts, tool starts/ends, **permission waits highlighted**), newest first, only this run's agents since this run started. Any row with a transcript is a **click away from that exact moment in the session viewer**. The open page repaints at most once a second; an idle farm pays nothing.
- **Step accordion — who was told what, and what they answered:** click any delegation row to open it: the **full prompt** the lead sent (with the success criteria), and the output box — a **live tail while the step runs** (auto-refreshes every 3 s, host reads only the file's last KBs) that becomes the final output's tail when it's done, plus the open-full-file link. One step opens at a time, so the tail polling is bounded. A running step's row also carries its agent's live chip (*tool (Bash)*).
- **Planner transcript** link in the run header: the lead's entire conversation — briefings, thoughts, decisions, round results — opens in the session viewer.
- **Ledger** (collapsible, after the rounds): the planner's compressed one-line-per-round history — also exactly what a resumed planner is re-briefed with.
- **Richer budget line:** spent/limit for cost, rounds, **tasks and minutes** at a glance.

**One design language with the rest of the panel (2.68.0).** The Missions page now speaks the extension's established idiom instead of its own: the **run list is an accordion** — plain rows (with a **Tokens** column) until you click one, the full detail expands inline under the row, and the viewer's chip controls (**Expand all / Collapse all / Single-open**) sit above the list; nothing opens on its own. Each **round renders as the session viewer's turn band** — caret, tinted band, bold `R2`, action tag, the planner's thought as the band label, and right-aligned `tokens · cost · time` stats (folded bands show a `N delegation(s)` summary), click to fold/unfold. **Tokens flow everywhere cost does:** the planner envelope's usage lands on each round, the delegate's session tokens land on each step via the same cost-attribution match, and run totals show in the list row and budget line. Status chips (`done`, `failed`, `running`, waits) switched to **outline style** — colored border + colored text on the page background — readable in light and dark themes alike. And a publisher/extension-id rename no longer strands old records: stored task/mission output paths under the previous globalStorage id are **migrated once at startup**.

Polish (2.69.0): **rounds got their own accordion chips** — Expand all / Collapse all / Single-open above the rounds of any multi-round run, so a long mission folds in one click; round bands always show the viewer's paired `N tok · $x` stats; numeric columns right-align header-and-value together; and **token figures are backfilled for runs recorded before tokens existed** — each step from its matched transcript, the run total from the planner's own session.

Richer run rows (2.70.0): each list row now characterizes its mission — lead **+ team size**, rounds as `R3/8` used/max, a **Tasks column** with a red `N✕` failed badge, and a **verdict chip** (`partial`/`failed`) next to "done". Hovering the row opens a **full tooltip**: goal, team roster with roles/models, all five limits, delegation and duration figures, and **who ate the tokens** — the per-agent percentage split. The same split renders in the open detail as a `tokens by agent: lead 62% · coder 28%…` line under the budget bar (its tooltip carries the raw token counts).

Sorting & filters (2.71.0): the run list adopts the sessions table's **Sort by** control — Recent, Status (active first), Verdict, Mission A–Z, Lead A–Z, Team size, Rounds, Tasks, Failed tasks, Tokens, Cost, Duration — with a direction-flip chip (string sorts start A–Z, numeric biggest-first). Next to it, a **Filters** chip opens an advanced panel over the same criteria: **selection chips** for status and verdict, **lead / team-member dropdowns**, **min–max ranges** for tokens, cost, rounds, tasks and minutes, and a **started-date range** — combinable freely, with a live `N/M runs` count, an honest "No runs match" row, and one-click **Clear**. Sort, direction and filters all survive reloads.

**Pause with honest feedback.** Pause never interrupts mid-activity — the current planner call or wave finishes first. Since 2.64.0 the request itself is visible: the button flips to a pressed **Pausing… (undo)** state and a hold strip explains what happens; clicking again withdraws the request. Once parked, **Resume** feeds the collected results back into the lead's own session.

**Interruptions and failures.** A window reload parks running missions as *paused*; Needs You offers **Resume** — delegation states are re-collected from the task records and the lead continues in its own session. Cancel any time; cancelling also cancels the running delegations. A run that **fails** never fails silently: the reason (timeout, invalid planner replies, budget stop…) is in the closing notification, in a red banner on the run's page, and in the run's tooltip in the sidebar.

**What makes a good lead:** an agent whose CLAUDE.md says it plans and delegates instead of doing the work itself — e.g. *"You lead multi-agent missions: decompose the goal, delegate with self-contained prompts and acceptance criteria, judge results skeptically, and prefer finishing with a partial result over burning the budget."* The role labels you type next to team members ("coder", "reviewer", "tester", "researcher", "git") reach the lead as hints.

The panel shows each run round by round — the lead's reasoning, the delegation table (status / cost / output links), question-and-answers, the budget bar, and the final verdict. The closing summary also goes out as a notification and the `mission` webhook event.

**The Missions section in the sidebar (2.63.0)** is the tree twin of the same tracking — between Tasks and Recent Sessions. Each run is listed with its status/verdict icon, round count (`R3/8`), spent dollars and age; expand it for the rounds and each round's delegations (status, cost — click one to open its archived output). A round awaiting approval and the lead's question surface as **actionable rows** at the top: Approve/Reject and Answer right on the row. Row actions: Pause / Resume / Cancel, **Run again** (a fresh run of the same goal-team-limits, confirmed first) and **Delete run**. Clicking a run opens the full Missions page.

### Classic vs. Adaptive Missions

The mission engine provides two core orchestration modes: **Classic** and **Adaptive**. These are not mutually exclusive or a "good vs. bad" dichotomy; they represent two distinct architectural philosophies tailored for different problem types, complexity levels, and execution dynamics.

Below are the 5 foundational architectural differences between the two modes and guidelines on when to choose each:

#### 1. Inter-Agent Artefact Pipeline & Review
* **Classic Mission:** Operates as a sequence of independent delegations. When the lead delegates a task to Agent A and Agent A finishes, there is no automated data pipeline linking Agent A's output paths (`outputRef`), code diffs, or textual deliverables into Agent B's system context. The lead must manually recall and copy-paste relevant excerpts into the next prompt. In longer runs, this causes context bloat in the planner and risks losing critical output nuances.
* **Adaptive Mission (`review`, `compare`, `revise`):** Features a first-class artefact handover pipeline. When the lead specifies `review { target: "task-1" }` or `revise`, the engine automatically retrieves the actual output files and diffs from task-1 and places them directly into the reviewer agent's context. Alternative solutions from different agents can be evaluated side-by-side using `compare`, and suboptimal outputs can receive targeted revisions (`revise`) rather than restarting work from scratch.

#### 2. Concurrency & Parallel Execution Waves
* **Classic Mission:** Executes strictly one sequential delegation per planning round. Even if the lead identifies three completely independent sub-tasks (e.g., one agent researching a database schema, another drafting frontend UI, and a third writing unit test suites), they must run in serial order across separate rounds, with each waiting for the predecessor to fully finish.
* **Adaptive Mission (`parallel`):** Powered by an intelligent wave planner (`planWaves`), independent tasks can be dispatched concurrently within the same planning round. While maintaining single-writer safety locks on shared working directories to prevent file collisions, read-only tasks or tasks operating in isolated workspaces run concurrently in parallel waves, substantially reducing overall wall-clock turnaround time.

#### 3. Pre-Defined Workflow Orchestration
* **Classic Mission:** Cannot directly invoke pre-configured multi-step workflows (e.g., *Compile → Test → Lint → Package*). If the lead needs to execute such a pipeline, it must manually delegate each individual step across consecutive rounds, unnecessarily consuming planner rounds and tokens.
* **Adaptive Mission (`run_workflow`):** Seamlessly triggers established workflow chains as a single atomic step (tracked via `runId`). The workflow executes its sequence autonomously in the background and delivers its consolidated final handoff back to the lead upon completion.

#### 4. Hierarchical Nested Objectives
* **Classic Mission:** Structured as a flat, single-level planning loop. When encountering a complex sub-problem (such as deep architectural research or dedicated component development), the lead cannot spin off an autonomous child mission with its own dedicated lead and rounds; everything must be shoehorned into the primary planner loop.
* **Adaptive Mission (`run_mission`):** Allows delegating distinct sub-goals to autonomous "Child Missions" equipped with their own lead, success criteria, and iterative planning rounds. Protected by a 3-level depth ceiling and cycle detection guards, child missions draw from the parent's remaining budget and conclude by returning an explicit verdict and evidence back to the parent lead.

#### 5. Real Agent-to-Agent Conversation
* **Classic Mission:** Agents never address each other. The lead sends work out and reads results back, so the closest thing to a discussion is the lead reading three independent answers and writing its own account of them — which reads exactly like the outcome of a debate that never took place.
* **Adaptive Mission (`message`):** Opens a **conversation** with a stated purpose and a fixed cast, and every turn in it is a real speaking turn: the agent named in `from` runs as an ordinary headless delegation and is shown the **actual text** of the messages listed in `refs`. There is no field through which the lead can describe what somebody said. A message that is *about* something somebody said (`challenge`, `response`, `concede`, `synthesis`, `vote`) is refused unless it names the message ids it rests on, so a "synthesis" that cites nothing cannot enter the record. One participant speaks at a time in a conversation while different participants may speak simultaneously — which is exactly what an independent first round is. Every speaker is told **who else is in the room and which of them the turn is for**: `to` is the record's own field and an empty one means everyone, so a row reading `Ada → Rev, Cy` describes an address the speaker was actually given rather than one only the transcript knows about. **Ordering the identical turn again while nothing has been said since is refused by name** — a repeated speaking turn builds a different prompt (a resumed lane carries its own preamble), so the generic planning-loop guard cannot see it and the lead would otherwise buy the same turn round after round; a retry after a *failed* turn is not a repeat, because nothing was delivered. **And a turn that came back clean with nothing in it fails the step too**, not only the message: the round message is built from step status, so a lead whose speaker said nothing was previously shown a successful round and never offered retry · revise · replan · skip · ask_user · partial. When the same agent speaks again its own session is resumed where the engine has a resume vocabulary for it, and where it has not, the speaker is given the exchange as text and the turn is labelled `handoff` rather than `resumed`. Between rounds the lead is given a bounded **digest** (what is still unanswered, the last few turns, the ids it may name), never the whole transcript — the planner session is resumed each round, so a transcript there would be paid for once per round for the rest of the run. Readers get the full text through `missions.conversation`.

#### 6. Council — a chaired debate, not a debate engine
* **Classic Mission:** no such thing. The lead reads results and writes its own account of them.
* **Adaptive Mission (`council`):** opens a **conversation with a chair, a cap and a named way out** — and nothing else. There is no debate protocol: a built-in "round 1 = A, round 2 = B, round 3 = synthesis" is a guess about a debate nobody has had yet, and it buys rounds 2 and 3 even when the second speaker concedes in its first sentence. Whose turn it is, and about what, is decided each round from what has actually been said, with the ordinary `message` primitive — so a council's turns go through the same participant lock, the same ref check, the same lane honesty and the same repeat guard as every other speaking turn. What the council adds is what the record cannot state for itself: the **question** it settles (narrower than the objective), the **chair**, a **turn cap**, and the **seven stated ways out** (`consensus · sufficient evidence · no new information · decision clear · need execution · hard limit · chair abort`). ‼️ Name a chair other than yourself and the lead **may not order a turn the chair did not call for** — a turn by anybody else has to name the chair's latest message in `refs`, which is what makes the speaker read what the chair really wrote instead of the lead's account of it; the opening round is the one exception, because there is nothing to cite yet. The cap stops the debate and not the ending: one turn is allowed past it, and only if it closes. **A vote is optional, and its choice is the voter's own word for it** — read out of the turn's real text against the options the council named, `unclear` when it named none rather than resolved into the likeliest one, and a tie reported as a tie. ‼️ **A council decides its own question and never the objective**: a majority is what the members think, and only an `evaluate` verdict judges a success criterion. Readers get the whole record — mandate, turns spent, unanswered threads, votes, exit — through `missions.council`.

#### 7. Failure Taxonomy & Strategic Resilience
* **Classic Mission:** If a delegated agent encounters an unexpected tool error or exits with a non-zero code, the engine treats this as an immediate fatal failure for the entire mission and aborts, denying the lead any opportunity to inspect the incident and adapt.
* **Adaptive Mission (`missionFailure`):** Classifies downstream failures into 9 distinct categories (engine rejection, budget exhaustion, missing capabilities, execution failures, etc.). Instead of aborting immediately, the engine presents the error class, attempted work, and actionable remediation advice back to the lead. The lead can then make an informed strategic decision: *"Retry with the same model"*, *"Escalate to a more capable agent"*, *"Revise the prompt"*, or *"Consult the user"*.

#### 8. The user surface — one Missions room, two kinds of work (U-64)
* **Classic Mission:** the only thing this form has ever asked for — a lead, a team, rounds, limits. An adaptive objective could only be started from the bridge.
* **Adaptive Objective:** the same page and the same form, with a permanent choice at the top of it. ‼️ **Classic is the default and nothing about it moved**: its fields, its DOM and the message it posts are unchanged, and a classic Start sends **no `mode` key at all** — the host reads anything that is not the exact string `adaptive` as classic, so the absent key IS the answer. On the adaptive side the basic view asks the three questions an outcome is made of (**what you want to end up with**, what the run **may not do**, and **how the result is judged**); everything that already has a default — lead, pool, workdir, limits, engines, approval gate — lives under **Advanced**. A criterion is `required` by default (an objective nobody can fail is not one) and each carries the stable id (`c1`, `c2`…) every later evaluation refers to for the life of the run. **Switching mode reads the form first:** nothing typed in the other one is lost, it is hidden. **And the model and effort boxes now know which engine they are on** — change a row's engine and that engine's live catalog lands in its model box; an engine with no effort setting draws the box dead and says which engine decided that.
* **The adaptive run detail** opens seven sections a classic run does not grow, each with one subject and no fact repeated between them: **Objective** (every criterion with the latest verdict that still speaks for the work, read by the same staleness rule the success gate uses), **Strategy** (the approach in force + ‼️ **why** each revision was cut — the half that exists only in the journal), **Guide next decision** (a one-off steer that says plainly WHERE it lands: the next planner boundary, never the delegation running now), **Cast** (the roles the lead BOUND at runtime — the only place an adaptive run's team is a fact), **Conversations** (a one-line summary counting only messages that were really spoken), **Evaluations** (every verdict, stale ones kept) and **Runtime graph** (what actually happened, node by node, with each one's fan-in — nothing here was drawn in advance). ‼️ **The lead's hidden reasoning is not drawn**; every sentence shown was said for the record. And an honest ending now **names what it did not reach** — the criterion ids the success gate refused on.

---

#### Selection Guide: When to Use Which?

* **When to choose Classic Mission?**
  Ideal for straightforward, linear tasks where the trajectory is predictable and can be handled by a single agent or a simple sequence in a few rounds. It provides a lightweight, predictable loop with minimal orchestration overhead.

* **When to choose Adaptive Mission?**
  Built for complex, exploratory, or mission-critical projects requiring collaborative multi-agent dynamics—such as peer code reviews, comparative problem solving, parallel investigations, workflow executions, and self-healing error recovery where strategy must evolve dynamically as empirical evidence emerges.




## Autonomous Sentry System — Multi-Account Rotation & Campaigns (Sentry) {#otonom-nobet}

*(3.373.0 — 3.531.0, X-167, X-309 family)* In long-running development efforts and overnight shifts, a single Pro account's 5-hour quota window (~85-90%) or weekly limit eventually runs out. The **Autonomous Sentry (Sentry)** engine was built to ensure that development continues uninterrupted by rotating across authorized accounts and fallback engines.

### Sentry Architecture and Key Actors

1. **Sentry Leader Agent (`X-191`):** When a sentry shift activates, the leader agent (default `developer` or `manager`) wakes up. Its first duty is reading transcripts, git logs, and recent handover notes to grasp project status (`plans/2026-09-05-x191-sentry-leader.md`). It synthesizes progress, selects next steps, executes or delegates tasks, writes a new handover note, and goes back to sleep until the next cycle.
2. **Policy & Condition Engine (`X-190`, `X-194`, `X-309`):** Governs when shifts rotate, pause, or terminate.
   - **5-Hour & 7-Day Weekly Quota Ceilings (Binding Bar - `X-309`):** The pool evaluates both the 5-hour and 7-day all-models weekly windows (`seven_day` bar). An account at 100% of its weekly limit is recognized as walled and is never mistakenly picked as the emptiest slot; the campaign automatically advances to the next viable account.
   - **AND Condition Groups:** Conditions evaluate live quota metrics alongside turn/error limits.
   - **Sentry Live Probe (`sentry.probe`):** Inspects the active account, remaining quota, and campaign metrics on demand.
3. **Sentry Watchdog (`X-178`):** Monitors runs during unattended hours (e.g. 02:00 AM), terminating deadlocked child processes or hung network calls and resuming the campaign loop cleanly.
4. **Template and Prompt Pool (`X-175`, `X-192`, `X-319`, `X-320`):**
   - **First Round Item Injection (`X-320`):** Whatever the campaign opening prompt is, the taken backlog item's code and description (`withItemLine`) are injected directly into the first round's instructions, preventing blind starts.
   - **Task Delivery After Empty Turns (`X-319`):** If a previous turn terminated without producing progress (hit-the-wall / nothing-to-continue), the next round receives the original item definition rather than a blind "carry on" command.
5. **Account Whitelist & Multi-Engine Fallback (`X-207`, `X-312`):** Explicitly bounds which accounts a campaign is allowed to spend. If Claude accounts exhaust their window, fallback routes to Codex or OpenCode. Retries initiated from a sentry turn remain strictly inside the campaign pool (`X-312`).
6. **Fire Drills & Handover Discipline (`X-309`, `X-321`–`X-323`):**
   - **Pre-Allocated Session IDs (`X-321`):** Fresh headless Claude rounds launch with `--session-id <uuid>`, ensuring transcript bindings are established immediately without relying on fuzzy timestamp heuristics.
   - **Handover Note Discrimination (`X-322`):** Distinguishes genuine handover notes from ordinary markdown artifacts written during code execution, eliminating irrelevant evidence dumps.
   - **CLI Item Check Command Injection (`X-323`):** Injects the full shell command (`node <af.js> projects.backlog.check ...`) into the prompt so models can reliably close backlog items without searching for nonexistent tools.
   - **Failure Brake:** Automatically stops the campaign loop if 5 consecutive rounds complete without forward progress.

### Surfaces and Controls

- **Console Live Strip (`X-177`):** Houses the sentry indicator, active shift account badge, and inline `Pause / Resume` actions.
- **Settings Sentry Section (`X-193`):** Dedicated cockpit for sentry templates, directory variables, and path previews.
- **Bridge Operations:** `sentry.status`, `sentry.start`, `sentry.stop`, `sentry.pause`, `sentry.resume`, `sentry.templates`, `sentry.probe`.


## Baton Relay — Continuous Handover Across Sessions {#baton-relay}

*(3.620.0 — 3.651.0)* In long-running and multi-step engineering tasks, a single agent session will inevitably hit the model's context window limits (35–40% discipline thresholds) or the account's 5-hour quota ceiling (90% threshold). In standard session handovers (`handover note`), the session stops, writes a markdown note to disk, and waits for a human or a sentry round to spin up a new run. The **Baton Relay** turns this lifecycle into an autonomous relay race: when an agent approaches its limit, instead of burying its progress in a file note, it hands over the opening prompt for its successor in a single call (`baton.pass`). As soon as the predecessor ends, Agent Farm automatically spins up a fresh session (`leg n+1`) under the same launch dimensions and on the chain's designated account pool.

### The Three Pillars

The relay runs on three decoupled actors verified by tangible evidence:

1. **The Whisper (Sentry):** Agent Farm → running runner. An agent cannot observe its own context fill directly. Agent Farm watches the live stream via hooks (`PostToolUse`); when context reaches 35% it whispers `CONVERGE` (wrap up the flight step), and at 40% context or 90% quota it delivers `HANDOVER`. When a session carries a baton, the whisper does not say "write a handover note"; it explicitly commands **"pass the baton: baton.pass"**.
2. **The Baton:** Runner → Agent Farm. When deciding to hand over, the agent commits all clean progress to git, writes a payload containing what its successor starts from, and executes `node af.js baton.pass "@<file>"` (or JSON string), then ends its turn. Because Console cards and terminal sessions do not terminate automatically when a turn finishes, Agent Farm observes when the runner that passed has come to rest (no queued messages, no open questions, ~10s of quiet) and **ends the session cleanly itself**. A session is never killed while a turn is still executing.
3. **The Receiver (Bed):** Agent Farm → fresh runner. Agent Farm verifies that the predecessor has genuinely ended (two legs never run concurrently). It then selects the best eligible sign-in from the chain's pool (`@emptiest`, etc.) and launches a fresh session (`leg 2/6`, etc.) preserving all original launch dimensions (`engine, model, effort, permissions, superpowers, project`). The entry point is the task board itself (`tasks.add baton:true`); there is no secondary hidden launcher.

### Starting and Attaching Relays

A baton relay can be initiated through three distinct doors or attached to an existing live run:

- **Starting from Composer:** Toggle the **`⑂ Relay`** chip below the Console composer. Optionally set a custom leg ceiling (`max hops`) and account pool. When the prompt is sent, the run is immediately sealed as **Leg 1 (`⑂ 1`)**.
- **Starting from Tasks Form:** Check the `⑂ Relay` option when creating a task on the Tasks page (`tasks.add baton:true`).
- **Attaching to a Live Run (`⑂+ Attach relay`):** On any normal (non-relay) live session, clicking the `⑂+` button on its status row opens the attach strip. Choosing the pool and ceiling and clicking `⑂ Attach` seals the running session as **Leg 1** without restarting it (`baton.attach`). Its next limit whisper will instruct it to pass the baton instead of writing a note.

### UI Surfaces and Live Controls

The Console card and session tables feature dedicated controls when handling a relay:

- **`⑂→` (Pass now):** A manual handover trigger that bypasses waiting for quota or context limits. When clicked, it injects an immediate `PASS NOW —` whisper into the session. The agent commits in-flight progress, invokes `baton.pass`, and the next leg is triggered.
- **`✕⑂` (Stop chain):** The chain brake. Clicking it sets all waiting or parked batons in that chain to `stopped`. The running leg finishes its current work, but no successor leg will be spawned. A successor task row a baton had already written that has NOT started (queued, or parked on a reset) is cancelled with it (S-94, 3.725.0) — before, a freed seat opened the stopped chain's next leg anyway; a row already running is a session and is never touched.
- **`⑂ n` Chip & Detail Panel:** Renders a distinct blue `⑂ 1`, `⑂ 2` chip on the card's status row. Hovering it opens a rich panel displaying the `chainId`, current hop count, assigned account pool, and limit readings.
- **Sessions Table `⑂` Column:** Across all session tables, a dedicated `⑂` column displays `⑂ n` exclusively for relay legs, remaining clean and blank for ordinary sessions.
- **Status Bar Live Counter:** When a relay is actively executing, the status bar displays a live counter formatted as `⑂ 1/6`.

### Automatic Brakes and Failsafes

Five distinct safety mechanisms protect the relay from endless loops, token waste, or silent stalls:

1. **Leg Ceiling (`agentFarm.batonMaxHops`):** The maximum number of legs permitted per chain (default 6; 0 = unlimited). When exceeded, `baton.pass` will not spawn a successor; the chain stops, the agent is instructed to write a fallback handover note, and Notices is informed.
2. **Barren Chain Brake:** If two consecutive legs terminate on the exact same git commit (`HEAD`) without producing new commits, the chain halts immediately to prevent wasteful loops on unresolved errors. A leg is measured where its work lands: its own folder **and the code repositories of the project it runs in** (`legRoots.ts`) — a project session is started in the agent's folder but commits in the project's repos, and reading the folder alone once called two productive legs barren and stopped a rescue (S-83). A leg that passed OUT OF ROOM — its account at the quota handover line, or stopped by the plan limit — is starved, never barren (X-462): quota delays a chain, it never ends it. Measured on chn_muptzpk5002246: two legs that had no quota left tripped the brake, which then told a leg with no quota to repair the chain, and nothing opened again though an account turned over an hour later. **Why a leg passed is measured, never taken from the agent (X-472, `passCause.ts`):** at the pass (and the failsafe's or the engine's pass for it) the passing slot is re-read (a failed or slow read leaves its floor) and ONE verdict is written on the baton as `cause` — `limit` (the plan limit), `quota` (the highest of Agent Farm's figure, the guard's last reading for the session while its window stands, and the figure the agent sent with `baton.pass quota=` is at or past `quotaHandoverPct` — an agent's figure only raises, never lowers), `context` (the guard's last context reading at or past `contextHandoverPct`), `flagged`, or `early` (none of them — recorded and said). The starved note the brake skips is read off it (`starvedOf`); the door classifies again, raised by what the pass recorded, and the stay on the account reads that verdict instead of whether a quota order reached the run (measured on chn_muqifjzc001n2b: the agent read 90, Agent Farm 89, no order went out, and the pass counted as "not the quota's"); the sentry's next round does the same; the Console card says `Passed: <cause>`.
3. **Emergency Handover Failsafe (EMERGENCY HANDOVER):** If a leg terminates without passing (process crash, closed window, runtime error, or hitting limits before calling pass), Agent Farm inspects the failure. If the leg finished cleanly or was closed by the user, the chain ends normally (`done`). However, if uncommitted changes (in its folder or its project's repos), an error, or an unfulfilled handover order are detected, Agent Farm automatically spawns the next leg under an **`EMERGENCY HANDOVER`** header. The successor is handed the leg's handover note when it wrote one; without one, **the brief the leg itself started from**, what it committed during its run and what it left uncommitted — so a leg cut off at the quota wall is continued on its job, not guessed at — plus the predecessor's transcript link. The rescue passes the same brakes as `baton.pass`. If the emergency successor crashes within 30s without invoking tools, the chain halts permanently (`failed` loop protection).
4. **Stalled Console Leg Closure:** Console cards stay rendered even after an engine rests. A leg that received a handover order but rests for 30s without passing is automatically closed by Agent Farm, allowing the emergency handover failsafe to rescue and advance the chain. Only a card someone SPOKE to after the order is left alone — read from the card's latest user row (X-462), never from a turn's timing: a background command finishing makes the CLI open a turn nobody typed, and that turn used to hand a walled leg to "the user" for ever.
5. **Engine Faults (X-427, 3.723.0; `engineFault.ts`, `engineFaultWatch.ts`):** A turn that fails on the ENGINE's side ends nothing — the card rests idle on a failed turn, so the failsafe (which waits for an end) never fired and the chain stalled in silence. Every minute the running legs' cards are read at turn end and the engine's own words are classified. **Flagged** ("safeguards flagged this message … can't respond"): nothing said in that session is answered again and the agent may be unable to pass, so Agent Farm writes the baton FOR it through the failsafe's rescue path (evidence = its commits, uncommitted state and its own brief, plus a line telling the successor not to paste the flagged words back), leaves it waiting for the session's end, and the ender closes the card at rest — the successor opens on the usual release, through the same brakes. `agentFarm.batonFlaggedPasses` (default 3; 0 = none of its own) flagged passes in a row hold the chain for a person (Needs You); from the second one in a row the successor opens on `agentFarm.batonFlaggedModel` when set. **Plan limit** (X-462 — "You've hit your session/weekly limit · resets …", "usage limit reached"): the leg's ACCOUNT is spent, often in the middle of its own handover, so it cannot pass; Agent Farm passes for it the same way (`fault: limit`, a line telling the successor to finish only the records it had not yet written), and the door places the successor on the chain's pool — an account with room, or parked until the first reset (S-73). S-106 never keeps it on the walled account, whatever that account's figure still reads — the walled account counts as full until its window turns over (`markWalled`). A successor walled on arrival is starved, not barren, so the chain goes on waiting for room; a parked successor that wakes while every account is still past the wall keeps waiting (`relayWakeHold`) instead of being launched into a refusal that would fail its row. **Outage** (5xx, 529 overloaded, network, timeout, the service's 429 rate limit) and **auth** (401/403, expired sign-in): never a new leg — it would fail the same way. The SAME session is asked to continue at 1, 2, 4 … minutes, at most an hour apart; a working turn clears it ("Engine back" on Notices). Past `agentFarm.batonFaultWaitHours` (default 24; 0 = no ceiling) it stops asking and Needs You gets an `engine-fault` row (also for auth at once, and for a held flagged chain) that opens the session. Only relay legs are watched.
6. **Misplaced Alarm (X-474, 3.785.0; `misplaced.ts`):** the guard keeps every session's FIRST quota reading as it was read (`QuotaSignalRecord.first`: figure, account, the quota handover line in force). A relay leg whose first reading already stands at or past that line was put on a full account by the pass that opened it: that hop carries `misplaced` {slot, pct, wall, line, at, why}, the leg's relay bar says "Misplaced: …", `baton.status` and `baton.legs` carry it, and one Notice goes out per placement. A sentry round is judged the same way under its campaign's wall and gets a `misplaced` event on its row. No time window — the definition is the first reading; a chain's first leg (the seal) is a person's placement and is not judged; a handover line that is off judges nothing. The watch runs on the relay tick, and the records it writes are what keep it from saying anything twice after a reload.

### Smart Account Pool Inheritance

- **Staying on the account (S-106, 3.726.0; `stayAccount.ts`):** under `agentFarm.contextHandoverStayAccountPct` (0–100, default 70; 0 = off) a handover that is NOT the quota's — a context handover, or a pass the run made on its own — opens the next leg on the SAME account while that account is under the line of its five-hour window (a window that has already reset counts as 0%). At or above the line, or when a QUOTA HANDOVER reached the run, the pool picks as before. **A stay is a start (X-470, 3.781.0):** the line never stands above the wall every start obeys (`startWall`, below) — set higher it acts at that wall, and the Settings row says so (`stayInForceNote`). The account's FIGURE decides, not whether a quota order reached the agent: on 2026-10-02 (chn_muqifjzc001n2b) a leg passed on its own probe at 90 while Agent Farm read 89 and no order had gone out, the 90 stay line kept its successor there, and the successor opened at 92%. Only that one leg is placed on the slot (`DoorContext.account`); the baton keeps the chain's pool, so the leg after it is placed from the pool again. The sentry's next round follows the same rule for the finished round's account (below a leader's own choice, never past the campaign's ceiling).
- **The policies' wall (S-105, 3.727.0; `accountPolicy.ts` `effectiveCeiling`):** the built-in policies (`@emptiest`, `@round-robin`, `@standing`, `@pool`) and every rule step that names no wall pass over a sign-in at or past `agentFarm.defaultAccountCeiling` (default 70) of its five-hour window — and the wall never stands above `agentFarm.quotaHandoverPct`: with the handover line at 70% an 80% slot used to be picked and told to hand over on its first reading, a loop. The policies walk with the lower of the two (`PolicyWorld.ceiling`); a rule, step or campaign pool that names its own wall keeps it, but never above the handover line either (X-471, `PolicyWorld.handoverPct`). The Account Policies table's wall tip and `policies.list` say the wall in force and why (`ceilingWhy`). **One wall for every unattended start (X-469, 3.781.0; `startRoom.ts`):** `startWall` is the only answer to "may a session start on this account?" — the Account ceiling, or a wall a rule, campaign, task or caller names for itself, never above the quota handover line — and `startRoom` judges one account against it. `POLICY_DEFAULT_CEILING` is read from the box's flex point, never written as a number. `test/test_start_wall.js` reads `src/` and fails the build on a door that states a wall of its own (a number, a wall constant, or no wall at all) outside `test/startwall.manifest.json` (exempt entries only, each with its why; the pending list is empty and may only stay so) — and on a record's optional ceiling handed in raw, which falls to the primitive's 100 when unset. **Every door asks it (X-471, 3.782.0):** the sentry keeps no wall of its own — the host resolves the campaign's (`campaignWall`: its own `ceiling`, else the Account ceiling, capped at the handover line) once per tick and hands it to the facts, the leader turn's seat, `planSentry` and `sentryStep`, where the stay AND the slot the leader names obey it too (a leader naming a full account is overruled, and the round's reason says so); a run carried to another account after a limit asks `TaskManagerOptions.accountWall` (the campaign's wall when it is one of its rounds); `accounts.status` defaults to the Account ceiling and caps a caller's figure (`ceilingWhy`); the Accounts card's rotation line walks the same wall. `sentry.status` and the Missions payload carry `wall` {value, why}, and the campaign's Ceiling box says what an empty box acts at. **And the spawn asks again (X-473, 3.784.0; `tasks.ts` `launchBlock`):** a row the SYSTEM placed on a concrete slot carries the pool it was placed from (`FarmTask.accountPool`): a relay leg kept on its slot carries the chain's policy (`batonDoor.successorRow`), a sentry round on a slot `@pool`, a run carried by a rule that rule. At every start — after the clock wait, before the quota check — `TaskManagerOptions.replaceAccount` asks `startRoom` again under the row's own wall (its campaign's for a sentry round, else the Account ceiling); a slot that filled while the row waited sends the row back to its pool, recorded as a `placed` event with the figure and the wall, and the launch picks from the pool — or the pool's hold (`relayWakeHold`) parks it until the first window turns over. A slot a person stated carries no pool and is never re-placed here (`quotaBrake` keeps the handover line for it). So a door that forgets the wall is still caught at the one place every run passes through.
- **A known figure outlives a failed read (X-462; `usageFloor.ts`, `usageFloorFile.ts`):** a slot's last good five-hour reading stands as its FLOOR until that window turns over, and the floors are kept on disk — so a 429, a failed read or a window reload no longer turns an account at 95% into "not read = empty" and places a leg on it. The plan limit leaves a floor of 100% until the window turns over or a good reading replaces it (`markWalled`). Every wall and the S-106 stay read the figure in force (`percentNow`), the starved verdict the five-hour window the same way (`fiveHourNow`); an account whose window has turned over reads fresh, and one never measured stays unmeasured (X-215: not seeing is not the same as not usable).

- **Pool Locking:** Whichever account policy seeded the first leg (`@GelistirmeHavuzu`, `@emptiest`, etc.) is strictly enforced on all subsequent legs. If an agent attempts to pass to a different account, the system maintains the chain pool (`poolKept`).
- **Automatic Parking:** If all accounts in the pool are quota-exhausted, the system never falls back to the primary personal sign-in; the relay is parked (`waiting-end`) until the earliest reset time (`resetsAt`), resuming automatically when the window clears.

### Bridge Operations (CLI & IPC)

- `baton.status` — Real-time ledger of all chains, active legs, parked batons, and stop reasons.
- `baton.pass` — Runner's handover dispatch (`prompt`, optional `surface`, `account`, `note`).
- `baton.stop` — Halts an entire chain (`chainId`) or individual baton, and cancels a successor row that has not started (S-94); the same brake as ✕⑂ and `farm.cleanup`.
- `baton.now` — Bypasses parking delays to trigger a waiting baton immediately.
- `baton.lastLeg` — The soft brake (S-95): makes the leg running now the chain's last (`on=true`) or takes it back (`on=false`) until it passes. Braked, its handover order names the note, its pass is answered `braked` and the failsafe stays out. The Console card's ⑂⊣ Last leg runs the same body.
- `farm.cleanup` — What is stuck (S-101): task rows queued and never started, rows "running" with nothing working, relay batons still waiting and idle Console cards — anything waiting 24h+, which a restart does not clear. Lists by default; `apply=true` (optionally `ids=`) cancels / stops / closes them, deleting nothing. The status-bar 🧹 chip (shown only while something is stuck), its review picker and the once-a-day notice's "Clean now" run the same body; `farm.health` carries the count as `stale`.
- `baton.attach` — Seals an active run as Leg 1 of a new relay (`sessionId`, `account`, `maxHops`).
- `baton.faults` — Relay legs whose engine failed a turn (X-427): each episode (`kind` flagged | outage | auth, `state` waiting | passed | held | gave-up, the engine's words, attempts, next attempt) and the three settings with where each came from; `check=true` runs a pass now.


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
- **＋ never picks its source on its own (2.81.0, variant-grouped 2.81.1):** the same rule for **all four kinds — skills, MCP servers, memory files AND duties**. One donor → a confirm naming it. **More than one donor → always a picker**, even when the copies are identical, so the choice is yours. The picker **groups the copies by content**: identical copies share a lettered variant (`A` = the most common / newest version), so a row reads `variant A (shared by 3)` vs `variant B (unique)` — you see at a glance which agents agree and which one stands apart, and choose the source accordingly. Change date, size and recall count ride along. No more silent "first agent found".
- **Summary chips:** total / used (30d) / unused count per matrix. A row no agent used in 30 days is marked with a yellow ● — capabilities that could be cleaned up fleet-wide.
- Clicking a row name or a filled cell opens the relevant SKILL.md / config file. The matrix refreshes itself after any copy/edit.
- **Memory files matrix (2.16.0):** which agents have same-named memory files, with the 30-day recall count in the cell; **a cell with an orange ring = the copy has DIVERGED from the newest one** (different content — updated in one, old in another). Copy the file to that agent with ＋ (with an index row into the target MEMORY.md). Multi-agent rows are on top — sync/divergence matters most there. **Recall counts are per-folder (2.81.0):** a cell counts only reads of *that agent's own* memory/ file — reading another agent's same-named file (or the `~/.claude` auto-memory) no longer inflates it, and a freshly copied file honestly starts at **0 recalls**.
- **Duties matrix (2.16.0):** duty titles × agents; the cell shows a cadence abbreviation (`turn/start/daily/weekly/manual`), ⏸ = paused; the tooltip shows watch/do; ＋ copies the duty to that agent (if the target's CLAUDE.md has no DUTIES.md reference, it's added with approval).
- **Tasks matrix (2.17.0):** task families × agents — the 30 busiest families of the last 30 days ([Task Health](#gorev-sagligi)). The cell shows the completed run count: green = all successful, red = all failed, orange ring = mixed (`2✓/1✗`); the row label says its source (`man/sch/trg/wf`), a family whose recent runs are all failed gets a red ●. Clicking a cell/row opens the full task history.

## Toolbox {#toolbox}

**Agent Farm: Open Toolbox** (the Toolbox sidebar section, or the wrench icon in its header) — one console for EVERYTHING that extends a claude installation (2.80.0): Skills, Subagents, Commands, MCP servers, Hooks, Plugins, Output Styles and the settings files themselves — at **both** levels: **user scope** (`~/.claude` plus the MCP servers in `~/.claude.json`, shared by every agent and session on the machine) and **agent scope** (each agent folder's `.claude/`). The Capability Matrix answers "who USES what"; the Toolbox answers "what is INSTALLED where, what exactly is it, and how do I manage it".

- **Sidebar section:** kind → scope → item, with per-kind counts (`2 user · 3 agent`); clicking an item opens its defining file, the header's tools icon opens the full management page.
- **Overview tab:** a count card per kind with a one-line explainer of what that kind *is* — a map of the machine's whole extension surface, and a place to learn the vocabulary.
- **Skills / Subagents / Commands / Styles tabs:** name, scope badge, frontmatter description, argument hints, model/tools facts, 30-day real usage (skills); actions: open, reveal in Explorer, **remove with backup** (the item moves to a sibling `.afbak` folder — nothing is lost), and **scaffold new** at either scope (a `:` in a command name nests it into folders, e.g. `git:cleanup`).
- **MCP tab — with a real probe:** every server at both scopes with transport and masked definition. **Probe** actually connects to the server (stdio or streamable HTTP — the same handshake claude performs) and lists the **actual tools it exposes**: name, description, parameters (required ones starred). Results are cached on disk until you re-probe. Per-agent disable/enable (`disabledMcpjsonServers`), removal with backup — user-scope removals edit `~/.claude.json` surgically and leave everything else byte-for-byte alone.
- **Hooks tab:** every lifecycle hook from user + agent settings files — event, matcher, command — and removal of a single hook without disturbing the rest of the file.
- **Plugins tab:** installed marketplaces with their catalogs (name, category, author, description, homepage); enable/disable writes the `enabledPlugins` key in user settings.json — the same key claude honors, applied on the next session start.
- **Files tab:** the config files themselves at both scopes (settings.json, settings.local.json, `.claude.json`, keybindings.json, CLAUDE.md) with their top-level keys and sizes — one click to open. Curated, explained editing of the most useful keys stays in Farm Settings → Claude Code.
- **‼️ Every tab narrows by its OWN columns.** There are several hundred rows here and until 3.87.0 the only way in was a text box, which answers "does this word appear" — the wrong question nearly every time: *"the Anthropic ones that are actually enabled"* is two axes, and typing `anthropic` returns everything that merely mentions them. Each tab now carries the facets that tab's table already shows — Skills: scope · used/never used · Subagents: scope · model · Commands: scope · namespace · MCP: scope · transport · enabled/disabled · probed/failed/not probed · Hooks: scope · event · Plugins: enabled/disabled · author · marketplace · category — plus a sort (name, most used, enabled first, largest, scope) and a live count of what survived. **Facets are ANDed** (that is the point of having more than one) and their options are read off the DATA, so a new marketplace, transport or hook event appears in the picker on its own. **The selection is kept per TAB**, because building a view is four clicks and stepping into MCP for a glance should not throw it away; the text box is per page, since typed words rarely mean the same thing on the next tab. `✕ clear` drops both for that tab only.
- **Bridge ops:** `toolbox.list`, `toolbox.inspect`, `toolbox.mcptools` — agents can query the same inventory and trigger the same probe through the farm bridge (`farm.ops` lists the contracts). **`toolbox.list` takes the page's own facets** — `q` (the query language), `scope`, `agent`, `kind`, `state` (enabled|disabled, one word whichever the row itself speaks), `event`, `transport`, `author`, `marketplace`, `model` — ANDed, so a question the page can ask an agent can ask too.
- **‼️ …and it can WRITE, which for a while it could not.** The page installs, copies, removes and switches tools; the bridge could only read them, so an agent asked to set one up had to answer "open the page yourself". `toolbox.install` (skill · subagent · command scaffold their file; `mcp` writes the JSON entry, with the `args`/`env`/`headers` no dialog chain could ever ask for, and `mode:"edit"` keeps every key it was not asked about) · `toolbox.copy` (to another agent, or `to:"user"` to SHARE a skill — which **moves** it, so there is no shadow) · `toolbox.remove` (`.afbak` beside whatever went, which is the only way back) · `toolbox.enable` (an MCP server per agent, a plugin in user settings — the reversible half of remove). **One implementation, two doors:** the page and the bridge both call `saveToolboxItem` / `removeToolboxItem` in `core/toolboxBridge.ts`, so the two can never write different things.

## Evals — the regression set and A/B {#degerlendirme}

**Agent Farm: Open Evals** (🧪 Evals in the top nav) — an agent's **regression set**, its runs, and WHAT CHANGED between the last two, on one page (3.92.0). Until now this had no surface at all: four command-palette entries were the whole of it, so a suite you spent an afternoon building could only be read back one quickpick line at a time.

- **A case = an input plus an expectation.** The input is the prompt replayed against the agent on every run; the **expectation** is handed to the judge verbatim. A vague expectation produces a vague verdict — write what MUST be true, not what would be nice.
- **A case is normally born from a BAD TRACE.** The picker at the top of the card offers sessions you scored low (⭐ ≤2) and tasks whose verification failed; choosing one fills the input below it and records where the case came from, so the same trace is never turned into two cases. Writing one by hand is the same card.
- **A run asks for confirmation, because it spends money:** one agent call per case (`agentFarm.evalRunArgs`) plus one cheap judge call. The result lands on the page and the full report opens in a markdown editor.
- **‼️ The real gain: what changed.** The page compares the latest run against the one before it, case by case — **⛔ regressed** (it passed last time), **✅ fixed** (it failed last time), **🆕 new**, and the unchanged rest. A quickpick could never say this.
- **A/B — the agent's own instructions.** A is the agent's current `CLAUDE.md`; B is the same file plus one rule, or a different file entirely. The readiest source of that rule is an open **suggestion** for this agent, and those are offered directly on the card. The comparison prompts default to the agent's eval cases (a suite you already trust is the fairest comparison there is). If B wins, applying it is offered with an `.afbak` backup.
- **What stays native, deliberately:** the **modal** in front of a run and an A/B (real money), the generated **report document** (a markdown editor reads a long answer diff better than a webview), and the **OS file picker** for a variant-B file.

## Airtable Engine Module {#airtable-engine}

Your own data engine (knowledge atoms + media records; each deploy an "instance" on its own port) is now a **built-in module** of the extension (3.0.0): it ships with the install, nothing separate to set up. Agents talk to the engine through the `airtable_*` MCP tools — search, save, update; media files are **referenced by absolute path**, never moved or copied.

**The module has its own page: Agent Farm: Open Airtable Engine** (also via the 🗄️ Airtable Engine button in the Toolbox header, or the module tile on Toolbox → Overview). The page reads like a control room, ordered by importance:

1. **Instances** (on top) — every deploy discovered under the folders is a CARD: live/down light, port, content counts (lessons/sentences/media); **Open UI** opens the engine's own panel, **Set default** promotes one. A down instance is dimmed and says how to start it. Ports are never assumed — rediscovered on every look.
2. **Folders** — **+ Add folder** adds your engine folder: the parent of your instances OR an instance folder itself (both work — `config.json` is looked for at both levels). The pick is validated; if nothing is found you are warned but may add it anyway. Several folders, one-by-one removal; `%VAR%` tokens work. Media library folders sit next to it.
3. **Defaults & connection** — the default instance (empty = the single running one), the language tree, the timeout; the registration line and the module config file, one click to open.
4. **Register MCP** (header actions) — writes the user-scope registration into `~/.claude.json`; every NEW claude session sees the `airtable_*` tools. The registration points at the version-independent **staged copy** with `${APPDATA}` tokens — neither an extension update nor a machine change breaks it; a version-pinned old registration **self-heals** on activation with a notification. **Probe tools** actually connects to the registered server and verifies its tool list.
5. **Agent access** — what agents can actually do with the engine: the 10 tools (live-verified once probed) plus a usage example.

**Agent tools (`airtable_*`):** `instances` (discovery + health — call first), `stats`, `search` (keyword/tag in a collection), `get` (full record), `media_templates`, `media_scan_folder` (new vs already-recorded files in a folder — the ingest loop's entry), `media_save` (the core: a full-schema record referencing the file by absolute path; provenance for AI output, quarantine+failure for kept trials), `media_update` (optimistic concurrency — a panel edit is never silently overwritten), `knowledge_save` (knowledge atom → sentences), `note_save` (free-form note → archive). On an unconfigured module the tools **guide** instead of erroring ("add a folder on the Toolbox card").

**The technical chain — ONE source of truth:** the module's own store file `<globalStorage>/airtable-config.json`. The page edits it, the MCP process re-reads it on every tool call — no layer in between; a change on the page reaches running agents without a restart, and every failed write is REPORTED to the user (nothing is lost silently). **Bridge ops (§19.C):** `airtable.status`, `airtable.instances`, `airtable.config.get/set`, `airtable.folders.add/remove` (one folder at a time, through the same `addStoreFolder`/`removeStoreFolder` the page's + Add and remove use — a folder already listed, in either case or slash, is not doubled, and an engine folder with no instance needs `anyway:true`), `airtable.register/unregister`.

**The media library (X-417):** every base (instance) has its own media folder under a media root — `<root>\media_<base>\<image|video|audio>\<stage>\`. The stages, in the user's words: **source** (input material) · **raw** (unclassified but kept — nothing is thrown away) · **semi** (half done) · **final** (truly succeeded) · **asset** (the reusable treasure, reached only by a promotion). `media_<base>\all_in\` is the user's waiting area for files nobody has processed yet — agents never file into it, and it is refused by name. The stage is written into the record's `workflow.stage` too, and the record is filled like the Admin panel's entry form: the form does most of the classifying, the folder is the last link. A run's file takes its stage from its role — input → source · candidate / intermediate → semi · failed / rejected → raw · final → final · unknown → raw. Core: `src/core/mediaLibrary.ts`. **Bridge:** `media.library` (roots, bases found, stages and meanings, default mapping), `media.library.plan` (where one file goes and why, without moving it: its own name, `-2`, `-3`… when taken), `media.library.file` (moves it there — across drives copied then removed, never overwriting; the record is then written with `airtable_media_save`). Filing a run's output automatically, the record, the form filled by a model, Airtable as a run's input and Studio as its view are X-418…X-421. **Backfill (3.683.0, X-426):** `studio.library.backfill` puts the media that lived only in the extension's outputs folder into the library once — every file a gallery sidecar names is filed and recorded (a generation → semi, one dropped in Studio → raw with the drop written, one kept → semi with the keep written, an external file → source) and the sidecar follows it; a file the database already has (same path or same bytes) stays where it is. A dry run unless `apply=true`; the engine must answer, since it is how a file is matched to its record; a second run finds nothing to do. Core `src/core/mediaBackfill.ts`. **The waiting area (3.684.0, X-422):** `media.allin` processes `media_<base>\all_in\` — each image looked at by claude, each video by agy (frames), and given a stage (source · raw · semi · final — never asset); a file the model is **sure** of is filed, recorded (as `media.record`) and its form filled (as `media.enrich`, same `library.enrich.*` models) — about two model turns a file; an unsure one, an audio file and a non-media file **stay** — flex point `library.allin.unsure` (`agentFarm.allInUnsure`, then the op's `unsure`): `ask` = one Notices question listing them, `wait` = the next pass. `library.allin.when` (`agentFarm.allInWhen` daily | manual): the manager's daily media batch calls it with `scheduled=true`, skipped under `manual`. Dry run unless `apply=true`; a base whose engine is down is left alone. Core `src/core/allInIntake.ts`, op `src/core/allInOps.ts`.

**End to end — the chain, with no copy and paste (X-423, measured on TEST 2026-09-27):** (1) a run makes: a workflow with a tool step and a `library` block (base, `enrich {when:end, scope:final}`) is handed a file from outside; (2) it is filed and recorded as it goes — the input → `source`, the step's output → `semi`, each record with its mechanical fields and fingerprint, the output linked to the input as its effect; (3) at the run's end the last output → `final` and a model fills its form; (4) the Studio's Assets wall shows the records (stage, fill, cause/effect on hover); (5) ↑ promotes the output to `asset` — file and record together; (6) the next run takes its material from the library with an `airtable` input (`stages: asset`) and a for-each tool step walks `{item.file}` — what it makes names the asset as its cause. What the run's end did in the library (promotions, each record's enrichment or why it failed) is on `workflows.status` as `libraryEnd` (3.685.0); a failed model turn says the engine's own last words, not the echo of its command line. A turn that failed is redone for one record with `media.enrich`.

**Starting an engine (X-416):** a down instance card on the Airtable page carries **Start**: `node server.js` in `<instance>\Admin`, hidden and detached, no `npm install`, no UI build, no browser tab — it outlives VS Code like `start_admin.bat`'s window, its output in `<globalStorage>\airtable-engine-<name>.log`. Bridge: `airtable.start` (then writes the records that waited for it). Core: `src/core/airtableStart.ts`.

**Every file a run makes is filed and recorded (X-418):** a media step's downloads and a tool step's outputs go straight into their stage folder of the workflow's database — a candidate or a part → semi, a failed step's file → raw — and each gets a full media record: the file core, the technical fields read off `ffmpeg -i` (duration, fps, size, ratio, codec, bitrate, sample rate, channels, resolution class; there is no ffprobe on the machine), Provenans (origin, model, prompt and its hash, the run and step in Orijinal Bağlam), the run as its batch, `workflow.stage`, a `pipeline_history` line per event, the `<Type>-<Stage>` template when the base has one, and the content `fingerprint` (sha256) — the same bytes are never recorded twice. A local file a step read that the run did not make is its **input**: recorded where it is (one already in a stage folder keeps its stage), linked as the `causal.causes` of what was made from it. A vision-judge FAIL and a file a selection left out move to raw with their Başarı Statüsü; when the run reaches its end its last producing step's files move to final and its inputs from outside the library to source — the file and its record in one call; an input the database already has a record of is in the library wherever it lies, so it is linked and never moved. Every file is written in the run's ledger (its record, persisted), so a reload loses nothing and the next step is handed the path the file has NOW. The engine is started first when it is down (ask · auto · never); still down, the file is filed anyway and its record waits in the pending list (`<globalStorage>\airtable-pending.json`) until the engine answers. Flex points `library.*`: database and language (Airtable page → workflow → step), a closed engine (workflow), which files get a record — all (default, failures too) · passed · none (library off) — and the template (workflow → step), the stage (step; a named stage is never promoted), and the production's own **stage folders** (workflow, X-417: `library.stages.{input, intermediate, failed, rejected, final}` — a run input, a part or passed candidate, a judge FAIL, a left-out, the last output, each to a stage of the workflow's choosing; blank = the built-in source · semi · raw · raw · final; the mapping rides on every ledger entry, so a FAIL, a selection and the run's end follow it; a step's named stage wins). A name that is taken gets `-2`, `-3`… — never overwritten, by design, and not a flex point.

**A model fills each record's meaning (X-419):** the recorder writes what code can measure; a model that LOOKS at the file fills what only a look can say — the Admin form's meaning sections (`MEDIA_FIELD_SECTIONS` in the engine's `Admin/src/App.jsx`, its option values copied verbatim): identity (a real name, topic, subtopic, content, description), taxonomy, function (usage_context, content_role, style, level), tone, education (only when the content is educational — otherwise missing, with the reason), marketing, platform fit, accessibility, SEO, tags, and on a failed file the salvage notes (which seconds, frames or regions can still be used). An image is opened by claude (Read), a video by agy (its frames — no sound; the M-42 measured route), an audio file by nobody (skipped, said). Only BLANK fields are filled and the write re-reads on a version conflict, so a person's edit in the Admin panel is never overwritten; a full section sets its `completed_sections` flag, the rest are reported as missing with the reason, and one `pipeline_history` line records model, cost and result. Flex points `library.enrich.*` (Farm setting `agentFarm.libraryEnrich*` → the workflow form's Library block): when — end (default: once the run has ended, one pass, whatever its status) · record (as each file is final or failed) · never; which files — final + failed (default) · final · all; image model (sonnet), video model (gemini-3.8-flash-low), effort (low), sections, dollars per record (claude stops the turn there with `--max-budget-usd`; agy reports no cost, so not enforced — said). The plan rides on every ledger entry like the stage mapping, and the entry records what came of it (`enriched`). Core: `src/core/mediaEnrich.ts` (sections, prompt, answer check, apply), `enrichSpec.ts`, `mediaEnricher.ts`, `runEnrich.ts`. **Bridge:** `media.enrich` (one record by id or file); `workflows.add/update` take `library.enrich`. Core: `src/core/mediaRecorder.ts` (file · record · restage · flush), `mediaRecordFields.ts`, `mediaProbe.ts`, `mediaPending.ts`, `runLibrary.ts` (the run's hooks), `runLibrarySpec.ts`; page `media/afLibrary.js`. **Bridge:** `media.record`, `media.restage` (a promotion to asset is this), `media.pending`, `media.pending.flush`; `workflows.add/update` take `library` and `steps[].library`.

**A run takes its material from the library (X-420):** a workflow input of type `airtable` is a search, not a value — database, words, stages, kind, status, tags, passed/failed, max, order. Before step 1 it runs against the local Airtable's media records and the records it finds become the input's value: a JSON list of `{id, file, name, stage, type, topic, tags, status, failed}`, so a step reads `{input.refs}` and a for-each step walks it (`{item.file}`, `{item.id}`). A tool step fed `{item.file}` records its output with that record as its cause (`relations.causal.causes`) through the ordinary library ledger — nothing new links them. A run's own value replaces the saved words; a file path is that file's own record, which is how a stage folder becomes a trigger: an ordinary folder trigger maps `{file}` into the airtable input. Defaults are the flex points `airtable.input.stages/limit/sort` (the input's search line → Farm settings `agentFarm.airtableInput*` → asset + final · 20 · newest). A lookup that fails (no database, the engine not answering) ends the run before step 1, saying why; what each input found is one line in `workflows.status` → `airtable`, kept with the run so a reload never searches again. An agent step of such a run is told to look in that database first (MCP `airtable_search` / `airtable_get`). Code: `src/core/airtableInput.ts` (pure but for the injected lister), `media/afAirtableInput.js` (the search line), `tasks.ts` `airtableFirst`. **Bridge:** `media.find` (the same search, as a preview), `workflows.add` `inputs[].airtable`.

## Secret Vault {#sir-kasasi}

So API keys don't wander around config files in plaintext (0.9.0): the **Set Secret…** command puts the value into the **OS keychain** (VS Code SecretStorage). Vaulted secrets enter the work in two ways:

1. **As an environment variable:** automatically injected into every task/workflow process (if you saved it as `FAL_KEY`, the process sees a `FAL_KEY` env var).
2. **As a template variable:** in the URL/body of webhook steps and in the notification URL, the `{secret:FAL_KEY}` syntax is replaced with the real value at call time — the value is never written to any file.

**Farm only (X-409, 3.745.0).** A secret Agent Farm uses itself — the Gatekeeper key — can be marked *farm only* on its card in the Secrets page: `env()` then gives it to no agent's task, whichever agents are ticked, while Agent Farm still reads it (`get()`) and an explicit `{secret:NAME}` in a workflow still resolves. `TYPESAFE_API_KEY` is moved into this scope once at activation if its scope was never chosen (`adoptFarmOnly`, `FARM_ONLY_ADOPT` in `src/core/secrets.ts`); a choice made on the card is never overridden. No bridge op, like the rest of the vault.

`List Secrets` shows only names; values are never displayed. If the health engine sees plaintext that looks like a key (`sk-…` etc.) in config files, it warns you to move it to the vault.

### How to Add an API Key (step by step)

Example: connecting the fal.ai key —

1. Copy your key from the **Keys** section of your [fal.ai](https://fal.ai) account (its format is `xxxx:yyyy`).
2. In VS Code `Ctrl+Shift+P` → **Agent Farm: Set Secret…**
3. For the name, type **`FAL_KEY`** (media steps look for this name by default; if you want a different name, change the `agentFarm.mediaAuthSecret` setting).
4. Paste the key into the value prompt (it's hidden as you type) → Enter. Done — the key is in the OS keychain.
5. Check: the **List Secrets** command lists the name (never the value). The key is used automatically when a media step runs.

The same method works for every service: `ELEVENLABS_KEY`, `N8N_TOKEN`… — whatever the name, it enters tasks as an env var and is accessible via the `{secret:NAME}` template. **Three golden rules:** never write a key to a file/prompt; if you pasted it into chat/screen, rotate it from the service panel; delete what you don't use with **Delete Secret…**.

## Engines {#engines}


### Multi-Account Management & Account Cards (X-167 / X-172 / X-217 / X-218)

*(3.374.0 — 3.411.0)* For setups running multiple Claude Pro or Codex subscriptions on a single machine, the Engines page provides dedicated **Account Cards**:

- **Account Capture and Retention (`X-172`, `X-204`):** Automatically detects CLI logins and OAuth grants, storing each account in an isolated slot with custom labels.
- **Single Selection Discipline (`X-217`):** Enforces the single standing account rule per engine (`normalizeActive`). Misleading toggle switches are replaced with clear radio semantics: the active account wears a **`🟢 standing`** state badge (clicking clears active slot back to global sign-in), while all other accounts carry a **`⚡ Use this one`** action chip (`role="radio"` with one `aria-checked="true"`).
- **Live Quota & Staggered Polling (`X-187`, `X-206`, `X-215`):** Displays live 5-hour and weekly quota bars per account. Network-bound Claude reads observe rate-limit delays (5s gap, 429 backoff), while local Codex file reads execute without network queuing.
- **Refresh All Accounts Button (`[🔄 Refresh all accounts (All Engines)]` - `X-218`):** Top-level action refreshing every slot across engines, displaying live progress directly on the control (`◍ 3 in the line`).
- **Dedicated Accounts Page (`X-236`, 3.583.0):** `agentfarm.openAccounts` opens the same section on a page of its own. The view exists once (`media/afAccounts.js`: cards, groups, capture form, stylesheet `AFAccounts.css`), its presses are answered by the handler both panels share (`src/panels/accountsMessages.ts`), and the page's deps are a subset of `EnginesPanelDeps` — two surfaces cannot say two things about one account. Account policies (X-305) stay on the Engines page for now.

### Smart Account Selection Policies, Protocols & Quota Architecture (X-305 / X-324) {#hesap-politikalari}

*(3.520.0 — 3.535.0)* In multi-account environments (especially machines hosting multiple Claude Pro/Max or corporate accounts), the burden of manually guessing **"Which of my accounts will have available quota at that future hour?"** for every task, schedule, or console session has been eliminated through Agent Farm's **Dynamic Account Policies** engine.

The system elevates accounts from static identities into **runtime-resolved dynamic targets based on live quota**.

#### 1. Built-in Smart Policies

The unified account picker (`media/afAccount.js` — Console, Tasks, Missions, Schedules, Workflows, Workqueue) and Farm Bridge offer 4 built-in smart policies:

1. **`@emptiest` (Emptiest Account):** Evaluates **ALL** registered accounts under the engine. Selects whichever account currently has the most available room (`% room`) within its 5-hour (and weekly binding) window.
2. **`@pool` (Sentry Campaign Pool):** Dynamically allocates the next eligible account from the active background **Sentry Campaign** pool. Refuses if no campaign is currently running.
3. **`@standing` (Standing / Default Account):** Binds to the agent's configured account or the machine's current `standing` default slot.
4. **`@round-robin` (Rotational Distribution):** Cycles evenly across all healthy, unwalled accounts on each successive launch to balance load.

#### 2. Custom Named Policies & Rules

Users can create and edit custom named policies (e.g. `Night_Sentry`, `Heavy_Duty`, `Budget_Pool`) via the **Engines & Slots** management view (`src/panels/enginesPanel.ts`) or via Bridge (`policies.save`). Each policy consists of a step list.

##### Two Strategy Modes (Strategy Switch — X-324)
Each policy card features a top-level 2-way Strategy Switch:

- **`🔗 Chain` Mode (Default):** Sequential fallback chain: `Step 1 → Step 2 → Step 3`. The system starts with Step 1. When Step 1 hits its quota ceiling (e.g. 50% wall), it automatically advances to Step 2; if Step 2 is also walled, it falls back to Step 3.
- **`⚡ Emptiest Pool` Mode:** Establishes an **isolated whitelist sub-pool** across the specific accounts listed in the policy steps. Unlike `@emptiest` (which scans *all* accounts across the entire engine), this mode **only evaluates the user's curated subset** (e.g. 3 chosen accounts out of 5) and selects whichever is emptiest at launch time, without requiring a running Sentry Campaign.

##### Auto-Lock Constraint & Safety Guard
- If a custom policy includes nested rules (e.g. `@standing`, `@round-robin`, or another policy) instead of concrete account slots, the `Emptiest` strategy cannot compute a single scalar quota percentage.
- The UI **automatically and strictly locks the strategy to `Chain` mode**, disables the `Emptiest` chip, and attaches an explanatory **AFTip** tooltip (*"Policies with nested rule steps can only operate in Chain mode"*).

#### 3. Launch-Time Filter vs. Mid-Flight Wall

A vital architectural distinction to understand:
- **Quota Ceilings Do Not Interrupt In-Flight Sessions:** A quota ceiling (e.g. 50% wall) is **NOT** a watchdog that abruptly halts or switches an active turn mid-execution.
- **Launch-Time Gate:** Quota ceilings act strictly as a **pre-flight filter** when deciding which account is eligible to *start* a new session or task. If an account is below the ceiling, the session launches safely.
- **Uninterrupted Turns:** If token consumption during the turn pushes the account past 50%, the session continues to completion without disruption. When the *next* separate task/session starts, the pre-flight check detects the wall and routes the new run to the next available account.

#### 4. Quota Caching, Refresh Cycles & Rate-Limit Protection

- **In-Memory Snapshot (`AccountUsageService`):** Anthropic and provider OAuth endpoints enforce strict rate limits (**HTTP 429 Too Many Requests**). Bombarding the endpoint with live HTTP queries for 3–5 accounts on every single launch would instantly blind the machine (*"Asking how much quota is left must not become what spends it — X-170"*). Decision engines read from a polite in-memory cache.
- **Refresh Channels:**
  1. *Periodic Beat (`beat`):* Background daemon updates accounts one by one starting with the stalest (*round-robin by staleness*).
  2. *Turn Completion (`readOnEdge`):* Triggered whenever an agent completes an active turn and settles token spend.
  3. *Manual Refresh:* Triggered on demand from the Engines panel or status bar.
  4. *Hit-the-Wall Failsafe:* If an account encounters an unexpected quota error during launch, Agent Farm catches the event, immediately updates that slot (`refreshSlot`), and hands the run off to the next account (`carryOnAccount`).

#### 5. Bridge Parity

Account policies are fully accessible programmatically via the Farm Bridge:
- `policies.list` — Lists all registered custom policies and their active strategies.
- `policies.save` — Creates or updates a policy (`id`, `label`, `engine`, `strategy: 'chain' | 'emptiest'`, `steps: [{account, rule, ceiling}]`).
- `policies.delete` — Removes a policy definition.

### Provider, Route and Tier Architecture (X-97 — X-117, X-148 — X-151) {#rota-mimarisi}

*(3.341.0 — 3.369.0)* Decouples the execution engine (Claude Code, OpenCode) from the serving endpoint and provider:

- **Engine vs. Provider Separation:** Enables running Claude Code or OpenCode via alternate backends (Kimi, MiniMax, DeepSeek, GLM, etc.) via explicit `providerId`, `routeId`, and `tier` specifications.
- **16 Launch Dimensions (`RunDimensions`):** Centralizes all execution dimensions in `core/launchDimensions.ts`: `engine`, `model`, `effort`, `permissionMode`, `route`, `tier`, `account`, `rounds`, `finishSound`, `superpowers`, etc.
- **208 Parity Obligations (`parity.manifest.json`):** All 13 launch doors (Console, Tasks, OS Terminal, Missions, Schedules, etc.) share unified narrowing rules, ensuring parity across surfaces without silent parameter loss.
- **Route Selection Across Doors:** Composer (`c-route`), Console cards, OS Terminal launchers, and Tasks forms feature interactive route and tier pickers that cascade gracefully on engine shifts.


**Looking at this as "API keys" was the wrong way to look at it.** The four
built-in engines do not share one sign-in or billing route: Claude Code uses a
Pro/Max plan or an API key, Codex a ChatGPT plan or an API key, Gemini CLI its
own Google sign-in or an API key, and Antigravity the app's Google sign-in with
no separate key route. OAuth grants stay with the relevant CLI/app and are
never handed to Agent Farm. So this is not a key screen; it answers **four
questions** per engine:

1. Is the CLI on this machine?
2. **How** is this engine paid for?
3. Is it signed in?
4. What is the **one** thing to do next?

No row stops at naming a state. An engine that is not installed is never told
to sign in — the install command is on the row and **Install** is the primary
button; the sign-in appears only once there is something to sign in to.

The binding end-to-end procedure for adding another built-in engine is
[`YENI-MOTOR-EKLEME-SOP.tr.md`](YENI-MOTOR-EKLEME-SOP.tr.md). Adding an id to
an enum or picker is not an integration: transport, protocol, identity,
resume, accounting, every run/read surface, the Bridge and a real two-turn
acceptance must land together.

**⚡ Test — the one thing disk cannot tell you.** Everything above is read off
disk, and disk can say "signed in" while nothing works: on this machine
`~/.codex/auth.json` held a live ChatGPT grant while every Codex turn died at
the socket (`os error 10013`, local security software). No amount of reading
files finds that; only a call does. The button runs **one real turn**: the
engine's smallest model, a four-word prompt, and read-only sandboxing where the
engine offers it — a health check must never be able to touch a file.

**‼️ It costs a turn, so it never runs by itself.** Not on a schedule, not on
page open, not on a refresh — only when the button is pressed. The verdict is
cached for the life of the window and shown **with its age**: a tick from four
hours ago is not the same claim as one from four seconds ago. On failure it
prints the **engine's own words**, never an invented reason.

### ‼️ Producer · storage · provenance — a file's folder is not who ran it (X-44)

Codex Desktop **converts another agent's history into its own rollout format**
and files it beside the threads it really ran. The extension read the folder as
the engine, so a 13-minute, $12.47 headless Claude mission that Agent Farm had
launched itself was listed as a **13-millisecond, $0, user-typed Codex chat** —
and counted a **second time** beside its own source. Three separate facts were
riding on one `engine` field:

| Field | What it says | In this case |
|---|---|---|
| `producerEngine` | the engine that **did the work** | claude |
| `storageEngine` | the format the file **lives in** | codex |
| `provenance` | `native` · `imported` · `imported-unknown-source` | imported |

The link is **read, not guessed**: `~/.codex/external_agent_session_imports.json`
maps each imported thread to its source transcript's path, content hash and
import time (50 records in one pass on this machine). When the manifest is
missing, broken or silent about a thread, the raw `<EXTERNAL SESSION IMPORTED>`
/ `external-import-turn-*` marks are enough to say "this is a copy of
something" and **not** enough to name the producer — the answer is
`imported-unknown-source`, never an invented engine. The manifest and the
user's transcripts are **read only**.

**One run, one row.** An import whose source is already in the index is not
deleted, it becomes an **alias**: `aliasOf` points at the run and the run knows
the copy through `importAliases`. `external()` / `allWithExternal()` return the
canonical row only, so the work is counted once; `byId` / `byFile` still find
the alias, so resuming the Codex thread and "open the imported copy" keep
working. The alias also **inherits the run's display facts** — time span, cost,
models, entrypoint, launcher — because the copy's own 13 ms and $0 would be a
third lie. If the source is **not** in the index the import stays visible and
offers what it has; nothing is hidden.

Count on `canonicalSessionKey()`, open and resume on `sessionId`. Confusing
those two is the whole of this item. On the bridge, `sessions.find` and
`sessions.recent` rows carry, backwards compatibly, `producer` · `storage` ·
`provenance` · `canonicalId` · `importedFrom` · `importedAt` · `aliasOf` ·
`importAliases`.

### ‼️ `role: "user"` is a protocol channel, not a claim that a person typed it (S-36)

Claude's and Codex's transcripts both call the model's input channel `user`, so
every mission/task/schedule brief Agent Farm **generates itself** arrived on the
same line as something a person wrote. "You are the LEAD of a mission…" turned
up under the 🧑 **You** filter, and `search.transcripts roles:["user"]` promised
"only what a PERSON asked" while returning the extension's own machinery.

The protocol role stays where it is; **authorship is a second axis**, derived
from facts Agent Farm already records (`authorship.ts` → `userAuthorOf`):

- `human` → **You** (including an `sdk-cli` session typed in the Console — that
  exception already lives in `sessionOrigin` and is preserved)
- `automation` → **Mission prompt** · **Task prompt** · **Schedule prompt** ·
  **Trigger prompt** · **Workflow prompt**, or **Automation prompt** when the
  launcher is not on record
- `unknown` → an import that cannot be resolved: **Imported — author
  unverified**. No unproven verdict; the uncertainty stays visible.

In Search this is a **new role chip, `automation`**: `user` now really is only
what a person wrote, the `Conversation` preset takes all three, and **People
only** is the single press that leaves just the person. The record is still
stored in the `user` shard (`storedRoles`); the split happens at read time
against the session's author (`displayRole`), so no corpus is rebuilt.

**And the title comes from the work, not from the wrapper.** `missions.ts`
builds every lead prompt from one template, so three different missions arrived
under one identical title. `conversationTitle` now takes the recognized
template's `## Mission` body as the title; when that body is empty the **launch
binding's own name** is used. An unrecognized prompt is never parsed
speculatively — whatever title it had is kept.

### ‼️ Tell apart sessions that look alike, without deleting real repeats (U-63)

Two different defects read on screen as "the same session three times": the
titles were identical because they came from a template (S-36), and a Claude
transcript and its Codex copy produced two groups (X-44). Three rules on the
search side close it:

1. **The pool is unique on the canonical run** — `orderSessions` folds on
   `canonicalSessionId`, so source + alias are one group and one counter.
2. **The same record arriving twice is one hit** — identity is `role + turn +
   timestamp + tool + the head of the text`, i.e. the record's **place** in the
   transcript. If the user really typed the same word in two different turns,
   both hits survive; blind dedupe on snippet equality is forbidden.
3. **The group header tells them apart** — beside the engine badge, the
   `#<8 characters>` short id, the author's glyph (🧑 / 🤖 / ❔) and the import
   mark `⇄`; the long form is in the AFTip (full id, canonical run, author and
   launcher, producing engine, the provenance sentence). DENSITY + SHORTHAND:
   the shortest unambiguous form in a narrow place, the meaning on hover.

`matchesFound` · `matchesShown` · `sessionsMatched` · `sessionMatches` are
computed **after** that canonicalization, and the UI and `search.transcripts`
show the same `TextSearchService` result.

No credential passes through the extension on any of these paths: the sign-in
and install commands are **typed** into a terminal and not run; the key route
opens the vault's own form; the docs link is `https` only. On the bridge as
`engines.status` (reads) and `engines.test` (spends a turn, and refuses on an
engine that is not installed).

The **Engines** section in Farm Settings is the summary of this page; the depth
is here.

### Choosing one — the engine axis (3.102.0) {#engine-axis}

Knowing which engines work was half the job. The other half is being able to
**start something on one**, and until 3.102.0 every button in the extension went
to `claude` without a word.

**Where you choose it.** The Console composer has an engine box beside the agent;
▶ on a sidebar row asks it as its first question (*Runs on*), as does the full
**Start Session…** launcher; the New-task form has an **Engine** row, which
schedules and triggers inherit because they are tasks that have not happened yet;
a mission takes one for its delegations, and a team member may override it. Set
the one you use most in `agentFarm.launchDefaults.engine` and it is the answer
everywhere until you say otherwise. **You never have to choose between them:** a
Claude session and a Codex session run side by side in the same window, and every
row says which is which.

**An engine that cannot run here is offered and refused.** It stays in the list —
hiding it would make "this build has no Codex" and "your Codex is not signed in"
look identical — but it cannot be chosen, and the row carries the one thing to do
about it. The refusal is one sentence written in one place, so a panel, a quick
pick, a task and the bridge all say the same thing.

**‼️ The two engines are not two spellings of the same thing, and the surfaces
say so.** Claude Code is one long-lived process: a message typed mid-turn steers
that turn, and model, effort and permissions are live controls. `codex exec` is
**one process per turn** — a message typed mid-turn is HELD until the turn ends,
the pickers are the *next* turn's flags, and the permission mode becomes a
**sandbox chosen up front**, because this engine has nobody to ask ("Default"
therefore means read-only there). A running session wears its engine as a badge
on its card and the line under the composer spells out what that changes.

**The project brief travels differently.** Claude takes it as an extra system
prompt on the command line. Codex has no such channel — prompt, `AGENTS.md`,
config, nothing else — so in the Console the brief rides inside the **first
prompt**, fenced, once. A *terminal* session on that engine is not told at all
and says so: typing into your own terminal on your behalf is not this
extension's job.

**‼️ A subscription engine states no price, and $0.00 is not a smaller number —
it is a wrong one.** Codex runs against a plan and reports tokens, never a
per-turn cost, so every figure about it is in tokens and says why there is no
money beside it: the running turn, the session line, the card hover, the line
that closes a turn, and the bridge (`reportsCost` on `tasks.list` / `tasks.add`).
Nothing is estimated for it either — our rate card is Anthropic's, and running it
over a ChatGPT plan's tokens would be wrong twice over.

**And a cost ceiling means nothing on such an engine**, which is why missions
grew a second currency. `maxCostUSD` is the only mission limit with real teeth;
a plan-billed delegate never moves it, so a team of them could burn a whole plan
window against a $5 ceiling it can never reach. `maxTokens` (default 2 000 000,
`0` = none) is checked alongside it, whichever runs out first stops the run, and
the planner is told the token budget in its briefing — a lead that only ever saw
"$5.00 left" would plan as if nothing had been spent.

### The ceilings belong to whoever pays for the run (3.231.0) {#mission-limits-free}

The limits above are the user's, and for a while they were not. `missions.start`
clamped what was typed — 24 hours of wall clock, $500 of budget, 30 rounds, 60
tasks, 6 parallel — and clamped it **silently**, which is worse than refusing it:
a run asked for a five-day marathon, got two days, and ended early for a reason
nobody had written down. Those figures were invented here, for somebody else's
money. A command centre hands out DEFAULTS; the ceiling is a decision its owner
is entitled to make and to pay for.

So nothing is capped from above, and **`0` means UNLIMITED on every axis** —
`maxRounds`, `maxTasks`, `maxCostUSD`, `maxTokens`, `maxMinutes`,
`maxParallel`. It is the one word `maxTokens` already spoke, now spoken by all
six, so a reader learns it once instead of six special cases. What survives is
the FLOOR: a POSITIVE figure below the smallest workable value is a typo rather
than a request and is lifted to it; `0` is how a missing ceiling is spelled.

‼️ **Two leashes were hiding behind the round ceiling** and had to come out with
it. `hardCallCap` was `maxRounds + 6`, so the field that says "run as long as it
takes" would have produced the tightest limit in the file — six planner calls;
and the planner's budget line would have told the lead it had "Infinity round(s)"
left. `maxParallel: 0` runs a whole round in one wave, and the one-writer rule
still splits it, because that rule is about correctness rather than pacing.

The rule left the caller and became `normalizeMissionLimits()` in
`src/core/missions.ts`, because a rule inside a closure cannot be held by a test.
`test/test_mission_limits.js` holds it.

### A ceiling you can pass is not a ceiling (3.233.0) {#mission-wave-guard}

Every limit above was measured at the PLANNER boundary — the top of a round,
where the previous wave has settled and nothing is in flight. That is the one
moment a hung wave never reaches. Measured on a real run (`mt4gqn99mxam3`): one
delegate sat 45+ minutes without answering, the run went past its 50-minute
ceiling, was still `running` at minute 70, and had to be stopped by hand. The
figure said 50 and the run took 70; that is not a cap, it is the appearance of
one — the same thing M-11 said about the budget.

So the wave in flight is measured too, on a coarse timer (`WAVE_GUARD_MS`, 15 s
— a backstop for work that has stopped answering, not a stopwatch). It runs the
SAME `guardReason(remainingBudget(…))` the planner boundary runs, so cost and
tokens ride along for free: a wave can spend both without ever returning either.

‼️ **What it does not do is walk away.** A promise dropped on the floor leaves
real processes running that nothing will ever claim, so the guard asks for the
same cancel a person would — through `cancelWave`, which stops the wave's tasks,
child objectives and chains but NOT the engine — and then still waits for the
wave to settle. The steps come back with a real outcome, the ledger with a real
cost, and each unsettled step carries the sentence *"stopped by the mission
ceiling — …"*. The run ends `hard-limit` with a `partial` verdict naming the
ceiling, never the `cancelled` that would claim a hand did it.

### The model box asks the engine itself (3.103.0) {#engine-models}

The engine axis reached every surface, but **the box beside it did not**:
whichever engine was chosen, the model list was `agentFarm.modelAliases` — four
Claude aliases typed by hand. Picking Codex still offered `sonnet`, a value its
CLI can only reject, while its own `/model` was offering six others.

A second rot grew from the same root, and it was not about Codex at all: **a
hardcoded list is an expiry date.** A model released tomorrow is in the CLI that
evening and still missing here months later, because a constant only changes
when somebody remembers it exists.

So the list is no longer written — it is READ (`core/models.ts`):

- **Codex** — `~/.codex/models_cache.json`, the catalog the CLI refreshes
  against the service. Filtered by `visibility: "list"` and sorted by
  `priority`: the **same rows in the same order** its `/model` draws. The
  catalog also carries each model's OWN reasoning vocabulary, so the effort box
  is answered from here too — luna has five levels, 5.5 has four, and one shared
  list was wrong for both.
- **Claude Code** — no full catalog on disk: the aliases live inside the CLI
  bundle and `~/.claude/.claude.json` holds only `additionalModelOptionsCache`,
  what **this account** was additionally granted. So Claude is your alias list
  **plus** whatever the CLI recorded for the account, which is how a newly
  granted model appears without an edit.
- **Gemini** — nothing measured, so nothing claimed: the setting stands and the
  box's `source` says so.
- **Antigravity** — `agy models` is the engine's only catalog and it is a remote
  request. It is fetched once into memory for the current VS Code process
  (warmed after activation, or immediately on the first picker draw), then every
  picker reuses that answer until the window closes. A new VS Code process asks
  again. When the background answer changes the list, every open picker is
  redrawn; no reopen is required.

Each box states **where its list came from and how old it is** (`note`), because
a list nobody can date is a list nobody can distrust. When a catalog cannot be
read (Codex installed but never run) the aliases stand in — but **not quietly**:
the note says what is being shown is not the engine's own answer.

**The three boxes are one dependent choice.** Changing the engine rebuilds the
model box from that engine's cached catalog and immediately reconciles effort;
changing the model rebuilds effort from that model's own vocabulary and default.
Carrying `sonnet` over to Codex would leave a value its CLI can only reject, so
an invalid value is cleared rather than kept invisibly. Opening *Talk to Agent*
is a fresh composer even when the Console tab already exists: engine, model,
effort and permission are reseeded from the current launch defaults instead of
inheriting the previous unstarted composer. Agents do not pass names blindly
either: `engines.models` carries models per engine, efforts per model, and
whether the answer came from the engine or the setting.

## Media Production Pipeline

### The content layer at a glance (X-365 wave I, M-37) {#content-layer}

The pieces that take a piece of content from an idea to a publish and back to the next idea — each is its own section:

- **Asset backbone** — every produced file lands in the local Airtable media library, in the right stage folder, with its full record (X-372; see Airtable Engine Module).
- **Feeding the chain** — inputs, the run's board, for-each, local uploads (M-38–M-41; see Feeding the flow) and a modality-aware judge (M-42).
- **Local media work** — the tool step's ffmpeg recipes, zero tokens (M-49; see Tool step).
- **Brand kit** (M-50) and **role slots / the content team** — `youtuber` as showrunner, the three content recipes (M-53); both under Production Scenes.
- **Cost** — the run's hard spend cap, the judge's ladder, parallel-cheap candidates, a check's own cost (A-27).
- **Browser recipe book** — Google Flow and Higgsfield on a signed-in profile of their own, downloads filed into the gallery (M-54; see Browser Steps).
- **Calendar and publish** — one vault note per publish, the publish step through your n8n flow (M-51), overdue publishes on Living and Needs You (M-61); see Content Calendar and Publish Step.
- **Analytics feedback** — the metrics step and `{performance}` in the idea/script steps and the supervisor's brief (M-52).
- **The vertical slice** — the 34-second video chain end to end with zero copy-paste (M-55), the acceptance of the whole layer. **Accepted** 2026-09-28 (run `mukrik1bfj06b`, 3.739.0) on an 8-second test clip — the same chain, only shorter, so the proof cost $0.59 instead of ~$1.1: `split` (4 s parts) → `extractAudio` → for-each [Omni Flash v1.1 edit on fal ($0.03/s) → agy vision judge] → checkpoint (both first attempts judged FAIL → the supervisor retried once with a sharper prompt → both PASS) → `concat` → `muxAudio` (8.04 s, original sound) → final checkpoint `stop` → run `done`. The finished video is in `media_TEST/video/final`, the failed attempts in `raw`, the parts and joins in `semi`, every one recorded (final and raw with 41–42 fields filled); every decision is on the supervisor trail with its reason, cost and origin. The inputs: `{"video":"<path>","brief":"Renkleri sıcak, gün batımı tonlarına çevir; başka hiçbir şeyi değiştirme.","partSec":"4","resolution":"720p"}` with the run's `spendCap` 2. A 34-second clip is the same call; Omni edits at most 10 s, so `partSec` ≤ 10 and speech is not edited.

### 🎬 Studio — the pipeline on one page (3.30.0) {#studio}

Four parts worked and none of them was connected to the others: the scene manifest (`production.json`), the asset wall (the Gallery), the sequence export (Premiere) and the machinery that generates and ingests (providers, watched folders, budget). So **the thing the user actually works** — *plan → generate → triage → assign → approve → assemble* — existed nowhere as a whole.

**Studio** is that pipeline; **🎬 Studio** in the global nav, five tabs:

| Tab | What it answers |
| --- | --- |
| **Pipeline** | The production scene by scene: status chip (click to change), counts by kind, a thumbnail strip, and **that scene's next step as a single button** |
| **Assets** | **The media library's wall** (3.681.0, X-424): the records of a local Airtable database — each card carries its stage, status, outcome (reason on hover), A/H score, form fill % and cause/effect chain (hover). A record made here keeps its Open · Re-run · Vary… · Feedback… · Scene… doors; a record nothing here made is a bare card. The `.media.json` sidecars are only a **cache**: engine down, no database chosen, or a file not recorded yet — and the note over the wall says which. The page never starts a stopped engine. Filters (database, stages, kind, success) are flex points: `agentFarm.studioLibrary*` settings, the live filter row, bridge `studio.library`. **The wall writes back** (3.682.0, X-425): ✓ Keep → `workflow.approval_chain` · ✗ Drop → `failure` + `workflow.rejection_count` · ✎ tags / score (`technical_quality.human_quality_score`, 0–1) / note (`moderation.notes`) — written only onto the version the card showed; a record changed since (Admin panel, an agent) is left untouched and the card says so. ↑ promotes (→ asset, → final): the file moves to the next stage folder and its record with it — asked first, or at once with `agentFarm.studioLibraryPromote` = `auto`. Core `core/studioLibraryWrite.ts`, dialogs `panels/studioLibraryActions.ts`, bridge `studio.library.edit` |
| **Triage** | **Assets nobody has judged** — ✓ Keep / ✗ Drop |
| **Assemble** | Exactly the clips the export will contain, in order, with the XML + EDL button |
| **Sources** | Provider keys (present or not), watched folders, register-by-hand, today/30-day/all-time cost and the budget |

**A scene's "next step" is derived from evidence, not guessed** — in this order: nothing made yet → **Generate**; assets nobody judged → **Triage**; judged but not approved → **Set status**; approved → **In sequence**.

**Why Triage is new:** keeping/dropping assets used to exist only *inside* a workflow's selection step — so anything generated outside a workflow, or ingested from a watched folder, could never be judged at all. Studio's Triage writes the same fields (`selectedUrls` / `rejectedUrls`), so the gallery badges and the **sequence picker** honour the decision: **a dropped asset never enters the sequence.**

The old **Open Media Gallery** command still exists and opens Studio's **Assets** tab — which is what the gallery was.

**‼️ Bridge ops — the Studio had none at all, and that is the surface where it cost the most.** Producing media is exactly the long, repetitive, many-step job an agent should be able to drive — write the manifest, generate, judge, assign, approve, assemble — and every one of those gestures existed only as a card a person had to click. Read: `studio.productions` (every manifest, each scene with its status and its asset counts) · `studio.assets` (generations, narrowed by production, scene, or what triage has decided — `state:"undecided"` is the pile worth working through). Write: `studio.production.new` (**one scene title per line**, never split on commas) · `studio.scene.status` · `studio.assign` (file it against a production and a scene; with neither, detach) · `studio.triage` (keep or reject — the same two fields a workflow's selection step writes) · `studio.rerun` (`rerun` sends the identical input · `vary` sends one you rewrote · `feedback` folds a critique into the original, which is what to reach for when the shot is nearly right — the new run inherits where the first was filed) · `studio.export` (`fcpxml`, `edl` or `both` — the XML with the EDL beside it, which is what the Studio's export card writes; only assets assigned to a scene are placed; card and op both write through `core/sequenceExport.ts`). Registration is `core/studioBridge.ts`, calling the same `core/production.ts`, `core/media.ts` and `core/premiere.ts` the page calls.

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
- **Brand kit** (M-50, 3.702.0): the manifest's `brand` block — `style`, `negative`, `colors`, `typography`, `voice` (a TTS voice id), `logo` (`remove|keep|place`) + `logoPlace`, `aspect`, `duration`, and `character: {<key>: {name, ref, desc}}`. Any step reads it as `{brand.<path>}` (`{brand.style}`, `{brand.character.ana.ref}`), filled first, on the step's own words only (an earlier step's output is never re-read). Which production: the workflow's **Brand kit ▸ From production** box (`workflow.production`), a media step's own production (its scene picker, `media.projectId`) for that step; a step's own `brand` fields lie over the kit field by field (`resolveBrand`, origin per field). A field the kit does not set reads empty; with NO kit the placeholder stays as written, so a missing brand shows in the prompt. Core `core/brandKit.ts` (shape, refusals by name, `patchBrand`, `fillBrand`), `TaskManager.stepBrand` (a copy of the handoff per step — a parallel group shares one). Bridge `studio.brand.get` (a production's kit, or `workflow=` `step=` → what that step reads and from where) · `studio.brand.set` (field by field; `""`/null removes; `replace:true`) · `workflows.add/update production=` and `steps[].brand` (refused by name). Flex point `workflow.production`: workflow + step levels. **This run's production and the step card** (3.703.0): the Run card (`with…`) draws **Brand kit from** (`wi-production`, the point's run level; bridge `workflows.run production=`) only when a step reads `{brand.*}` or the workflow names a production (plan row `usesBrand` / `production`); the run record keeps it and `brandProductionFor` puts it above the workflow's and a media step's own. The step card's **Brand** block (`AFBrand.stepRow`, a `<details>` open when the step has fields of its own) shows every kit field and each kit character field by field: an empty box shows the production's value faint (placeholder), a typed one is the step's own (`step.brand`), and each tooltip opens with the value and where it came from (MIRROR). Not drawn on checkpoint/approval/select steps, nor where there is no production and no `{brand.*}`. Emptying every box leaves no `brand` (the step inherits again). The page gets every kit as `DATA.brandKits`. Flex points `brand.<field>` (style, negative, colors, typography, voice, aspect, duration, logo, logoPlace, character) at the step level (`workflows.add:steps.brand.<field>`). **Studio ▸ Sources ▸ Brand kits and kits kept as presets** (3.704.0): every production's row shows its kit in short (AFTip: every field), **Edit kit** opens an editor (every field, the logo rule, characters with key/name/reference/description, + character) whose **Save kit** writes the whole kit (`brand:set` → `setProductionBrand`, the op's own function); **Keep as preset…** saves it into the preset library (`agentFarm.flexPresets`, family `brand`, values the `brand.<field>` points; `brand.character` is an object point) through `saveBrandPreset` = `studio.brand.save`; **Take a kept kit…** only fills the editor with a preset's values — nothing is written until Save, so a kit is never overwritten by one click. Bridge: `studio.brand.set preset=<name>` makes a production's kit a copy of a kept one (`applyBrandPreset`), `studio.brand.save production= name= project?`. Core `core/brandPresets.ts` (`brandPreset`, `kitFromPreset`, `brandPresetsIn`), panel `panels/studioBrand.ts`, page `AFBrand.studioSection` / `wireStudio`.
- **Role slots** (M-53, 3.706.0): a workflow step can name a **role** (`senarist`, `kurgu`, `yayinci` …) instead of an agent — the Role box on an agent or browser step's card, `steps[].role` on the bridge. Which agent fills it is decided where the workflow is used: the workflow form's **Roles** box (`workflows.add/update roles={"<role>": "<agent>"}`), else the **showrunner** — Farm Settings `agentFarm.showrunner`, default `youtuber`, who takes every role a workflow leaves open. One flex point, `workflow.role` (settings → workflow), resolved in `src/core/workflowRoles.ts`; `workflows.roles` says who fills each role and why, and a role bound to an agent that is gone stops the run naming both.
- **Role slots for one run** (M-53, 3.707.0): **Run with…** draws one box per role the steps name, its first line the agent the run will get and whose (the workflow's or the showrunner); a pick is this run only (`workflows.run roles=`), above the workflow's binding — the run level of `workflow.role`. The step list reads a role step as `senarist → developer`.
- **The recipe book** (M-53, 3.708.0): **New Recipe Workflow** installs a whole workflow in one pick, from `src/core/contentRecipes.ts`: three content recipes that name roles, never agents — **Video parça düzenleme** (a video split, each part edited with Gemini Omni Flash from one brief the `prompt-muhendisi` role turns into the model's words, judged, joined over the original sound), **Uzundan kısalar** (Whisper transcript → the `kurgu` role picks the moments with their SRT → each cut into a subtitled vertical short by the local `short` tool recipe in ONE re-encode) and **Haftalık kanal ritmi** (`fikir` → `senarist` → shots rendered and joined → your approval → the `yayinci` role's publishing package, uploading nothing) — plus the three quick one-agent recipes. A recipe is the `workflows.add` argument object and is saved through that op's own validator; it pins no judge or supervisor model, so the cost preset in force decides them. Bridge: `workflows.recipes`, `workflows.addRecipe recipe= agent? title?`. A media step now fills its JSON input inside the string values (`src/core/jsonTemplate.ts`), so a Windows path, a quote or a line end handed from an earlier step stays valid JSON and a local file it names is found to upload.
- **The run's hard spend cap** (A-27 part 1, 3.709.0): one flex point, `workflow.spendCap` — Farm Settings `agentFarm.workflowSpendCap` → the workflow form's **Cost** row (Run cap $) / `workflows.add|update spendCap=` → **Run with…** (Run cap $) / `workflows.run spendCap=`; 0 = none. It is settled once when the run starts and shown on `workflows.status` as `spendCap {usd, from}`. Once the run has spent that much — every step row's spend, media and supervisor turns included — no further step starts (checked in `routeToStep`, after the step limit) and no further for-each branch starts (the waiting ones close as "not started — spend cap reached", the ones in flight finish, then the fan-in ends); the run stops saying what it spent, the cap and where the cap came from. Nothing is asked, so a silent or broken supervisor cannot spend past it. The soft ceiling stays a wake condition on `cost.run`. `src/core/runSpendCap.ts`.
- **The judge's ladder and a cost preset per run** (A-27 part 2, 3.710.0): flex point `judge.ladder` — Farm Settings `agentFarm.judgeLadder` → Run with… (Judge ladder) / `workflows.run judgeLadder=`; models cheapest first (`haiku,sonnet`). A step's check (text and vision) is judged on the first rung (cheap-first); a FAIL is judged once more on the next rung before the step is paid for again (escalate) — an upper PASS overturns it and no retry is made, an upper FAIL goes to the retry as before; the next check starts at the bottom (de-escalate). A step that names its own judge engine or model keeps it. The output carries `Escalated: <lower> said FAIL (…) → <upper> says PASS — overturned, no retry paid`. The cost profile now carries it: Economy `haiku` + a $5 run cap, Balanced none (the shipped behaviour), Quality `sonnet,opus` and no cap. `workflows.run preset=` (and the **Cost preset** picker on Run with…) lays a preset's workflow-run values — every point whose run level is a `workflows.run` key, today `spendCap` and `judgeLadder` — under what the call or the boxes name themselves (`workflowRunPreset`, `src/core/runWithTask.ts`). `src/core/judgeLadder.ts`.
- **Stop, replan, and what a run's checks saved** (A-27 part 3, 3.711.0): a retry is bought only while it can still help. The judge may answer `FAIL-METHOD` (the approach itself is wrong; the same instructions will not fix it), and a retry whose FAIL names the same defect as the attempt before it (half or more of the reason's words shared) made no progress. Either way the retries left are withheld: when the run's wake is not mechanical, the step fails and its supervisor is woken with `replan` in the fired list, whatever the conditions say, to patch, insert, jump or stop; on a mechanical wake the step stops failed and nobody is asked. Every decision is recorded on the step row (`judgeDecisions`: overturned · upheld · stopped · replan, with an estimate — an unpaid retry priced at the attempt it follows) and added up by `workflows.status` as `economy` (climbs, overturned, stopped, replans, ~$ saved, one line each); the Runs table shows it under the status badge (`overturned ~$0.04`) with the lines on its hover. `src/core/judgeDecision.ts`.
- **Parallel-cheap** (A-27 part 3, 3.712.0): flex point `media.candidates` (step level: the media step's Candidates box / `workflows.add steps[].media.candidates`, 1–4, built-in 1). A media step makes that many at once in ONE row (`Promise.all` over the provider; each answer's first asset; `mergeCandidates`), each billed on its own answer (`billMedia` sums `{candidates}`), a failed download dropping its answer too (`alignCandidates`). Its vision check judges them in order, each on the judge ladder, and the first PASS is picked: the archive body is rewritten to that candidate alone (`pickedBody` — its own answer, `outputs: [its file]`, `picked: {candidate, of}`), so the next step's `{prev_json.…}` reads what a one-candidate step would hand on, and the gallery record lists it first. None passes → FAIL naming every candidate's reason, retries as before (each retry makes N again). Without a check the first candidate is handed on. A reload mid-render reattaches the first candidate's job only. The pick is a `judgeDecisions` entry (`picked`), counted by `economy.picked`. `src/core/mediaCandidates.ts`.
- **A check's own cost** (A-27, 3.713.0): a claude judge (text and vision) is asked for its JSON envelope (`judgeJson`) and read out of it (`judgeReply`, `src/core/judgeEngines.ts`): the verdict from `result`, the spend from `total_cost_usd`; an error envelope is no verdict (unjudged, M-42). `climbJudge` adds both rungs, `pickCandidate` every candidate, and the step keeps it as `judgeUSD`; `stepSpend` = the step's own spend + `judgeUSD`, so the run total, the board, the hard cap and a withheld retry's price all count the checks. The text check runs in the task-outputs folder (3.714.0), never the step agent's: there it loaded the agent's CLAUDE.md chain and a haiku check was measured at $0.034 against a $0.024 step. A headless task's own cost (3.715.0, `tryAttachCosts` in `src/extension.ts`) is found by the session id its stream bound (`index.byId`) before the time window (`matchTaskSession`, which matched neither of two back-to-back runs), and `costReady` (`src/core/taskcost.ts`) waits while the read is $0 and 0 tokens — the index not at the file's end yet — instead of locking a zero in. A claude check is lean (3.716.0, `judgeLean`): `--tools ""` (the vision check `--tools Read`), `--strict-mcp-config` and a one-line `--system-prompt` (`JUDGE_SYSTEM`), after a step's own judge args — measured on haiku $0.0245 → $0.0021 for the same verdict, the cut the supervisor already had.
- **The vision check looks where the file is, at what the step was asked** (3.739.0): the library files a media step's asset into its stage folder before the check runs, so the vision judge runs in **that file's folder** (not the task outputs) and is handed its name there; and a `verify.criteria` is filled like the step's own input — `{input.x}`, `{steps.<id>…}`, `{brand.*}` — before it is asked (`judgeCriteria`). Measured on M-55: sent to the outputs folder with `The clip shows the change asked for: {input.brief}`, agy answered `FAIL-METHOD the file is not on this system and {input.brief} is empty` on all four clips, and the supervisor paid for a retry of edits that had in fact done what was asked.
- **An edit is judged against what it started from** (M-62, 3.743.0): when a media step's input was a local image/video it uploaded, or an earlier step's asset its input names by URL (`judgeSources`, `src/core/judgeCompare.ts`), the vision judge gets both — copied side by side as `before` / `after` into a temp `af-judge-*` folder (the user's folders are never written to; removed after the verdict) — and is asked whether ONLY what was asked changed; what was already in the source (a test card's colour bars, text, logos) is not a change. No source found = the result is judged alone, as before. Flex point `judge.compare` (`agentFarm.judgeCompare`: auto · never). Measured on the M-55 clip whose lone judge said FAIL (the colour bars read as an unwanted layer): with its source, PASS on the first try, agy, 67 s, no media-API call.

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

### Tool step — local media recipes, zero tokens (M-49) {#tool-steps}

A **tool step** (`steps[].tool`, the step card's **tool** type, `media/afTool.js`; `src/core/mediaRecipes.ts`, `src/core/toolCall.ts`) runs one local **ffmpeg recipe** — no agent, no model, no token. ffmpeg is spawned with an argument list, never a shell line, so nothing can be injected through a value. The recipes (`tools.recipes` lists each with its parameters, defaults and ranges):

| Recipe | What it does | Parameters |
|---|---|---|
| `split` | cut into parts of a fixed length, optionally overlapping; each part re-encoded to start on a key frame | `segmentSec`, `overlapSec` |
| `concat` | join files end to end in the given order (stream copy — same codec and size) | `files`, `name` |
| `extractAudio` | the sound track on its own | `format` |
| `muxAudio` | lay an audio file under the picture, shifted for sync | `audio`, `offsetSec` |
| `reframe` | change the aspect: crop from the centre or fit with bars | `aspect`, `mode`, `height` |
| `burnSubtitles` | draw a .srt/.ass file onto the picture | `subtitles` |
| `short` | one moment cut, reframed and subtitled in a single re-encode | `start`, `end`, `aspect`, `mode`, `height`, `srt` |
| `keyframes` | stills: N evenly spaced, or one per scene change | `mode`, `count`, `threshold` |
| `loudnorm` | broadcast loudness (EBU R128), picture copied | `lufs`, `truePeak` |
| `transcode` | re-encode to a codec and quality | `codec`, `crf`, `preset`, `audioKbps` |

A step is `{recipe | preset, input?, params?, outDir?, overwrite?}`; values may be templates (`{input.clip}`, `{steps.split.json.outputs}`, `{item}`), and a `files` parameter takes a list off the board. Named **presets** fill parameters the step does not give: *Omni Flash parts* (split, 10 s), *Vertical short (9:16)* (reframe, crop), *Web loudness* (loudnorm −16 LUFS). Flex points: `tool.outDir` (Farm Settings, else an `af-tool` folder beside the input) and `tool.overwrite` (`never` · `always` · `suffix`). The result is the step's JSON on the board — `{ok, recipe, outputs, runs, ms, durationSec?, error?}` — so `{steps.<id>.json.outputs}` feeds a for-each or a join; every output is filed into the media library (intermediate, or failed with a salvage note). Save refuses an unknown recipe, preset or parameter name. The same door by hand: `tools.run recipe=… input=… params={…}`.

## Browser Steps {#browser-steps}

The gateway to services with no API: add a **Browser step** to the chain — the step's agent, with its own browser MCP, visits the site, fulfills the objective, and hands its findings to the next step as `{prev_text}`.

**Prerequisite:** the agent must have a browser MCP server installed (Agents tree → MCP → **Add MCP Server…** → e.g. `npx chrome-devtools-mcp@latest` or Playwright MCP). Agent Farm doesn't carry a browser engine; it carries the security envelope:

- **Domain allowlist (non-negotiable):** if the step's `allowHosts` list or the global `agentFarm.browserAllowHosts` doesn't cover the URL, the step fails **without running at all** (your onFail rules apply). Subdomains are included.
- **Per-step approval:** `agentFarm.browserApproval` = `ask` (default) — a modal approval with URL+objective before each run; `auto` only by a deliberate choice.
- Hard rules are embedded in the agent prompt: don't open a link off the list, don't fabricate credentials, don't try without an MCP — report "NO BROWSER MCP".

Setup: `New Multi-Agent Workflow…` → **Browser step** → agent + URL + objective + allowed domains. `Edit Step…` changes the URL/objective/allowlist later; `{prev_text}`/`{prev_json.x}` are resolved in the URL and objective.

**The recipe book** (M-54, 3.717.0): a browser step that names a **recipe** (`web` · `flow` · `higgsfield` — the step card's Recipe box, `steps[].browser.recipe`; `src/core/browserRecipes.ts`) does not use the agent's own MCP. Its claude runs with `--mcp-config <step>.mcp.json --strict-mcp-config --allowedTools mcp__afbrowser`: Agent Farm's own Playwright MCP (`npx @playwright/mcp@latest`) on a **persistent profile per recipe** (`--user-data-dir <globalStorage>/browser-profiles/<recipe>`) saving into a **download folder** (`--output-dir`, the step's own folder under the task outputs unless `browser.downloadDir` names one). The recipe fills the URL and hosts the step leaves empty and tells the agent how the site works; a login wall is reported as `LOGIN NEEDED`, never typed. **Sign in once**: **Sign in…** beside the step card's Recipe box / `browser.login recipe=<id>` opens an ordinary Chrome window on that profile (never an automated one, never a debugging port, the user's own windows untouched); close it before a step runs — a step whose profile another Chrome still holds (its `lockfile` cannot be opened, EBUSY) fails at once, naming the window, before any agent run is paid for (3.718.0). `browser.recipes` lists them with `profileExists` and `inUse`. When the step ends, every file newer than its start in the download folder — Playwright's own `page-<iso>.yml/.png` excluded — is filed into the library (`lib.produced`, productionType `browser`), gets a gallery sidecar (`<taskId>.media.json`, source `browser`) and is listed under "Downloaded files" in the step's answer, before the chain moves on. Flex points: `browser.recipe`, `browser.hosts` (settings → step, the recipe's as its preset), `browser.confirm` (Farm Settings `browserApproval` → the step's own Ask first), `browser.downloadDir`. A recipe step runs on claude only. Higgsfield also ships an official agent CLI (`@higgsfield/cli`, OAuth, plan credits) — the recipe's note says so.

**The hosts are held by the browser, not only by the prompt** (3.735.0): the step's MCP starts with `--init-script <step>.guard.js` (`hostGuardScript`), which runs before the site's own code on every page; a top-frame page on a host outside the step's list is swapped for `about:blank#BLOCKED BY AGENT FARM …` naming the host, and the prompt tells the agent that page means "go back, never switch, add or sign out of an account". Frames (sign-in, embedded video) are left alone. **Google Flow** lives at `flow.google.com` (the old `labs.google/fx/tools/flow` only redirects there; hosts `flow.google.com`, `labs.google`, `accounts.google.com`) and is **a chat** now: the recipe tells the step to type the request into the "What do you want to create?" box, never click its suggestion chips, send once, answer a clarifying question in one line, and look again every 20 seconds until the result has rendered; on an account chooser it picks the account already listed (3.737.0–3.738.0). **Accepted** (M-54, 2026-09-28): a haiku step generated one image in Flow and downloaded it; the file reached the gallery and the library by itself, the run's end promoted it to `final`, and its record was filled (41 fields). Example step: `{"id":"flow","agent":"basit","model":"haiku","effort":"low","browser":{"recipe":"flow","confirm":"auto","goal":"Generate one image, not a video: a small red paper boat on calm water… wait until it has rendered, then download it. Reply in English: the file name."}}`. A step pinned to an account whose 5-hour window is past the handover line waits for that window (see Concurrency and the Quota Guard).

## Content Calendar and Publish Step {#publish-steps}

(M-51, 3.719.0.) **The calendar is a fact, so it lives in the vault**: a folder (Farm Settings `contentCalendarDir`, flex point `calendar.dir`; built-in `${vault}/01_INBOX/02_Calendar/CONTENT`) with **one note per publish**, in the Full Calendar plugin's own frontmatter — `title`, `date` (YYYY-MM-DD), `startTime` (HH:MM), `allDay`, `type: single`, `completed` — plus `platform`, `status` (`planned` · `producing` · `ready` · `published` · `cancelled`; the Turkish words are read too), `url`, `record` (the media record id) and `publishedAt`. Add the folder as a Full Calendar source and every publish shows in Obsidian's calendar. Agent Farm only ever patches the keys it owns; the note's body and every other line stay as written (`src/core/contentCalendar.ts`). Bridge: `calendar.list days=7` (entries, **upcoming** = due in the window and still open, **overdue** = past due and still open), `calendar.add title date platform [startTime record body]` (named `<date> <platform> - <title>.md`, never replaces a note), `calendar.set entry=<name|title> status= url= …` (`published` also ticks `completed`).

**The publish step** (`steps[].publish`, the step card's **publish** type, `media/afPublish.js`; `src/core/publishStep.ts`) sends ONE platform's publish through a **connection** — for now a webhook (`connection: webhook`): your n8n flow listens on `url` (`{secret:N8N_PUBLISH_URL}` is filled from Secrets) and does the YouTube / Instagram / TikTok upload. The payload is JSON: `{platform, title (the metadata's, else the note's, else the step's), publishAt? (planned), files (the previous step's outputs), text (its text), calendar, record, metadata, run}`; `body` is the platform's **metadata template** (JSON, filled inside its values — a quote stays valid). `entry` names the calendar note (`{input.note}` works). Before sending, **approval** (flex `publish.approval`: Farm Settings `publishApproval` → the step's Ask first): `ask` (default) stops for a yes through the approval gate, `auto` sends, `never` **rehearses** — the payload is built and recorded, nothing is sent. **Schedule** (`publish.schedule`): `now`, or `planned` = the note's date and time as `publishAt`. The flow's answer `{url | pub_url | link, id | videoId | postId, publishedAt | published_at, scheduled}` is read fail-soft; the note becomes `published` with the URL and time (or `ready` when the flow only scheduled it), and the media record's `publishing` fields are patched (`status`, `platform`, `pub_url`, `status_date`, and `published_at` once out — `MediaRecorder.published`; the engine is not started for it). Platform list and order: Farm Settings `publishPlatforms` (flex `publish.platforms`). A missing note fails the step before anything is sent.

**The calendar on Living and Needs You** (M-61, 3.721.0; `src/core/calendarSignals.ts`). A publish past its time and still open is a loop that did not close. **Living** carries one row for the calendar: overdue publishes = a warn row naming each and how late (oldest first, → Needs You); none overdue = an ok row with the next one due and how many fall this week; an empty calendar = no row. **Needs You** carries one clearable, non-blocking row per overdue publish (`publish-overdue`, keyed by the note, so moving its date or marking it ends the row) with **Open the note** and **Open its publish step** — the workflow step whose `publish.entry` names the note literally (a `{placeholder}` cannot say which note it is); with no such step the second button is **Tasks**. Both read `calendarView` over `contentCalendarDir`, the same view `calendar.list` returns.

### Analytics feedback — the metrics step {#metrics-steps}

(M-52, 3.720.0.) **The metrics step** (`steps[].metrics`, the step card's **metrics** type, `media/afMetrics.js`; `src/core/contentMetrics.ts`) closes the loop from publishing back to the next idea. It takes the content calendar's **published** notes that carry a URL — optionally one `platform`, the last `days` (30) — and posts `{fields, items: [{calendar, title, platform, url, record?, publishedAt?}]}` to a **connection** (a webhook: your n8n flow reads YouTube / Instagram / TikTok analytics). The flow answers one row per publish, named by `url`, `record` or `calendar`, with any of `views · watchSeconds · completion · likes · comments · shares · saves · engagement` (common aliases such as `view_count` or `avg_view_duration_seconds` are read too; a rate may be 0..1 or a percent; engagement is worked out from the interactions when it is missing). Each row lands on its **media record** — `analytics.view_count / avg_view_duration_seconds / completion_rate / like_count / comment_count / share_count / save_count` and `marketing.engagement_rate` (`MediaRecorder.metrics`) — and on the **performance snapshot** (`<globalStorage>/content-performance.json`, one row per publish, the record's topic kept for matching). A row that names nothing asked is skipped and said; an answer with no numbers fails the step. **How often** is the workflow's own schedule — there is no second clock.

**Where it is read.** `performanceSummary` writes the block "how similar published content performed": the measured publishes that share words with the query (title and record topic, case and Turkish letters folded), their numbers, their average and the overall average — or, when nothing resembles it, the best performers. A step prompt's **`{performance}`** is filled with it (query = the run's inputs + the previous step's text; the content recipe's idea and script steps ask for it), and the **supervisor's brief** carries it after the inputs (query = the workflow's title, goal and inputs). Flex points: **`metrics.fields`** (which numbers are asked for and shown — Farm Settings `metricsFields`, a step's own list wins) and **`performance.brief`** (Farm Settings `performanceBrief`; off = both stay empty). Bridge: `performance.summary {query?, all?}` returns the snapshot and the exact block.

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

## Farm Bridge and CLI Helper (af.js) {#farm-bridge}

Agent Farm provides a cross-platform file bridge (`Farm Bridge`) that allows any agent in the fleet (or external script) to interact with the VS Code extension bi-directionally.

### Self-Provisioning Deployment

On extension activation, `af.js` is automatically staged into the global storage directory:
- **Windows:** `%APPDATA%\Code\User\globalStorage\muvusoft.agent-farm\bridge\af.js`
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/muvusoft.agent-farm/bridge/af.js`
- **Linux:** `~/.config/Code/User/globalStorage/muvusoft.agent-farm/bridge/af.js`

### Usage Modes for Agents & External Processes

1. **Catalog Discovery (`farm.ops`):**
   ```bash
   node <bridgeDir>/af.js farm.ops
   ```
   The extension returns all available operations and argument schemas.

2. **Shell-Safe Simple Arguments:**
   ```bash
   node <bridgeDir>/af.js notices.list handled=false limit=5
   ```
   `key=value` pairs need no quote escaping in PowerShell, cmd, or Bash. Boolean,
   numeric, and `null` values are coerced; other values remain strings.

3. **Payload via File (`@args.json` - Recommended for Complex Content):**
   Prevents shell quote-mangling for multi-line markdown or large text payloads:
   ```bash
   node <bridgeDir>/af.js notices.post @args.json
   ```

4. **Answer to a File (`--out` / `-o`):**
   The reverse direction, and the same reason. `node af.js farm.ops > catalog.json`
   hands the bytes to the **shell**, and Windows PowerShell 5.1 re-encodes them on the
   way out — UTF-16LE, the ANSI codepage, or UTF-8 with a BOM depending on the operator.
   What lands on disk is mojibake, and `JSON.parse` refuses a leading BOM outright.
   `--out` writes the file from inside the helper, always UTF-8 without a BOM, and
   prints one summary line instead of the payload:
   ```bash
   node <bridgeDir>/af.js farm.ops --out docs/farm_ops_catalog.json
   # ok farm.ops -> D:\...\docs\farm_ops_catalog.json (184213 bytes, utf8)
   ```
   Missing directories are created; `--raw` still chooses compact vs. pretty.

5. **Raw File Drop (Alternative):**
   Write `<id>.request.json` and await `<id>.response.json`.

### Bridge Guard and Search Interceptor (bridgeGuard)

The Agent Farm ecosystem enforces architectural rules mechanically at the hook level rather than relying on passive written instructions (`src/core/bridgeGuard.ts`).

- **Rationale:** CLI engine internal session directories and schemas change across releases. Searching the disk for session identifiers using `grep`, `glob`, `find`, `rg`, `ls`, `dir`, or `Select-String` leads to blind recursive scans that burn model context and quota. Farm data is never hunted on disk; it is queried through the bridge.
- **Mechanical Interception (`PreToolUse` Hook):** Whenever an agent attempts a disk search containing a session ID (a 36-character full UUID or an 8-character known hex prefix), the `PreToolUse` hook interceptor triggers `denyResponseBody` and blocks the tool execution (`permissionDecision: 'deny'`).
- **Guiding Refusal Directive:** The agent receives a concise, actionable one-line directive explaining what the identifier is and which bridge call to execute instead:
  ```text
  "<id>" is a session id, and Agent Farm data is asked of the bridge, never hunted for on disk.
  Run `af.js sessions.find q=<id>` instead (answers file, engine, agent, cwd),
  and `af.js sessions.read id=<id>` hands over the conversation itself.
  ```
- **Escape Hatch (`af:allow-id`):** When raw disk search or legitimate transcript file analysis is strictly required, including the `af:allow-id` token anywhere in the command or pattern bypasses the guard for that invocation. Bridge calls (`af.js`, `sessions.find`, `sessions.read`) are never intercepted.
- **Engine Coverage Transparency (`bridgeGuardCoverage`):** Engine capabilities (`claude-hook`, `codex-hook`, or unsupported `none`) are tracked and reported explicitly so unmonitored engines are never assumed to be guarded.

### Evidence-Based Session Identification (sessions.whoami)

An agent executing within the farm runs several layers below the driving CLI process (CLI → Shell → `node af.js`). When calling the bridge, resolving "Which session am I?" is determined purely from immutable evidence rather than guessing from the working directory (`src/core/whoami.ts`).

- **Directory Guessing Prohibited:** Having multiple concurrent sessions within the same working directory (`cwd`) is standard operating procedure. Guessing identity from folder path is rejected by architecture.
- **Three-Tier Evidence Resolution:**
  1. **Argument (`arg`):** Explicit session ID passed directly in the call arguments (`session`).
  2. **Environment (`env`):** CLI process environment variable (`envSessionId`) forwarded transparently by the `af.js` helper.
  3. **Process Registry Ancestry (`registry`):** `af.js` forwards its parent process ID (`ppid`). The host inspects active CLI registry files (`<config-dir>/sessions/<pid>.json`) and traverses the caller's process tree; the closest ancestor CLI process confirms the true session identity (`sessionId`, `pid`, `depth`).
- **Applications:** Ensures flawless context inheritance for baton handovers (`baton.pass`), session sealing (`baton.seal`), and notice responses without requiring manual identity prompts.

### Normalized Multi-Engine Transcript Reader (sessions.read)

Different AI CLI engines persist conversation steps in vastly different structures and vocabularies (Claude `assistant`, Console `agent`/`result`, OpenCode SQLite databases, etc.). The `sessions.read` bridge operation normalizes all conversation history into a unified schema (`src/core/sessionRead.ts`).

- **Unified Role Model (`ReadRole`):** `user`, `assistant`, `tool`, `toolResult`, `system`. Input accepts engine-specific aliases (`human`, `prompt`, `agent`, `model`, `call`, `result`) and normalizes them into canonical roles.
- **Single Source with Transcript Webview:** Employs the identical `buildData` engine used by the visual transcript webview; what the user sees in the UI and what the agent reads over the bridge are guaranteed identical.
- **Pagination and Context Safeguards:**
  - `limit`: Steps per page (default 50, maximum 500).
  - `from`: Offset index; negative values target trailing steps (e.g. `from=-10`).
  - `turn`: Filters steps to a specific conversation turn.
  - `maxChars`: Per-step character clipping (default 4000 chars); reports `clipped` byte count when truncation occurs.
  - Response metadata includes `matched`, `returned`, `clipped`, and `next` cursor.

### Markdown Document Export Operations (*.export and mdTable)

All visual Markdown export controls in the Agent Farm UI and their corresponding bridge operations share unified document generation cores. Documents produced by human clicks and agent bridge calls cannot diverge.

- **Unified Table Engine (`src/core/mdTable.ts`):** Handles table escaping for pipes (`|`) and line breaks, prevents ragged rows with automatic column padding, and critically preserves falsy values like `0` and `false` rather than blanking them. Columns are derived dynamically from row records (`tableOfRecords`), automatically incorporating new fields.
- **`tasks.export`:** Exports the entire task board (`taskRows()`) as a structured Markdown table, reporting `costUSD`, status, agent, engine, session ID, and duration.
- **`turns.export`:** Exports the conversation transcript table (matching `turnsPanel.ts`), formatting turn headers, user input, assistant output, tool calls, and tool outputs hierarchically. Defaults to 50 turns with `matched` and `truncated` counters.
- **`tasks.analytics.export`:** Generates Markdown reports from task analytics and cost summaries (`media/taskAnalytics.js`), mirroring `reports.tasks` data in tabular format.

### Isolated Git Worktree Parallel Orchestration (parallel.run)

Orchestrates concurrent multi-task execution for an agent while maintaining strict filesystem isolation using git worktrees (`src/core/parallelRuns.ts`).

- **Twin Doors, Shared Core:** The command palette `"Agent Farm: Run Parallel…"` action and the bridge operation `parallel.run` execute through identical `planParallel` and `launchParallel` implementations.
- **Filesystem Isolation via Worktrees:** Generates independent temporary `git worktree` instances and `af/<worktree>-<stamp>` branches off the agent repository, preventing file collisions.
- **Concurrency & Resource Limits:**
  - Accepts up to 6 prompts (`PARALLEL_MAX = 6`); prompts beyond the limit are reported under `dropped`.
  - Concurrency is throttled by `agentFarm.maxConcurrentPerAgent`; tasks execute either concurrently or in sequential order (`serial`), preserving worktree isolation in both modes.
- **Plan-First Default (`dryRun: true`):** Defaults to `dryRun: true`. Calling `parallel.run` returns repository validation (`gitRepo`), planned branch names, and serial/concurrent status without spawning tasks. Actual execution requires explicit `dryRun: false`.
- **Mandatory Commit Discipline:** Appends a mandatory commit directive (`" — İş bittiğinde değişiklikleri anlamlı bir mesajla commit et."`) to each task prompt, enabling clean worktree merges via `"Worktree Runs…"`.

### Zero Parity Gap Guarantee (parity.manifest.json)

A fundamental architectural tenet of Agent Farm is complete parity: every action accessible to a human in the UI must be programmatically accessible to an agent via the bridge.

- **Strict Zero Gap Budget (`gapBudget: 0`):** `parity.manifest.json` maps every UI panel, button, and command to corresponding bridge operations (`ops`). No unmapped capabilities are permitted.
- **Explicit Documented Exemptions (`exempt`):** Capabilities without bridge counterparts are strictly limited to pure viewport navigation (`navigation` exemptions that move UI focus without altering system state).
- **Automated Parity Quality Gate (`test_parity.js`):** The automated test suite executes `test_parity.js` on every build. Adding a UI feature without a matching bridge operation or an approved manifest exemption immediately fails CI. No feature can remain inaccessible to autonomous agents.

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
- **The page makes the file itself (3.91.0):** a new memory file, a copy onto another agent and a distillation are all cards on this page — name + type + one-line description, and the file and its MEMORY.md line are born in the **same write**.

### ‼️ Memory on the bridge: the one store an agent is meant to keep itself (3.93.0)

3.91.0 gave the page the power to make a file and did not tell the bridge; `memory.*` did not exist **at all** — not even a read. It matters more here than almost anywhere: an agent's memory is the store the agent itself is expected to keep, and until now it could only do that by writing files behind the extension's back — no index line, no refresh, no frontmatter convention.

- **`memory.list { agent }`** — the files, their `type` and `description`, and on every row **`inIndex`**. The honest question about a memory file is not "does it exist" but "will the agent ever open it": the index is the only thing loaded every session.
- **`memory.add { agent, name, description, type? }`** — calls the very writer the page calls (`core/memusage.ts`), so the file and its **MEMORY.md line are written together**. The `description` is not decoration: **that line IS the index entry.** The name must be kebab-case (it becomes a file name and an index target), the type is one of `user|feedback|project|reference`, and a second file with the same name is refused rather than silently merged.

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

## LLM Wiki — Candidate Pool and Compilation (X-50) {#wiki}

*“Obsidian is the IDE, LLM is the programmer, wiki is the codebase.”* A user never authors `00_WIKI` by hand; agents write it. However, when an insight surfaces in the middle of a flowing conversation, forcing the question **"where exactly does this belong in the wiki?"** guarantees the thought will never be captured. The system therefore separates the workflow into two clean stages: **instant, zero-friction candidate marking** and **disciplined, structured compilation**.

### Candidate Pool Philosophy (3.201.0 — B-14)

**Marking is free, reversible, and touches no vault files.** The candidate pool (`wiki_candidates.json`) acts as a lightweight staging ground between raw transcripts and the vault's `00_WIKI` structure. Tagging a conversation or turn creates no files and mutates no existing pages; compilation is a deliberate, governed batch process.

- **Overlapping Tags Merge Automatically:** Tagging the same turn or session multiple times across different surfaces (Console, Live Timeline, Turns view) does not produce duplicate candidate entries. Topics are cleanly merged, and turn ranges are expanded.

### Marking Entry Points

1. **Turn-Level Marking (3.203.0 — K-26):**
   - Console prompt rows, transcript turn banners, and Turns table rows feature a quiet **🔖** badge.
   - Clicking the badge or selecting **Add to Wiki Candidates…** from the right-click menu opens a lightweight popover (`media/afWiki.js`).
   - The popover allows choosing a turn range (`4`, `3-7`, or blank for the entire session), selecting existing candidate topic chips, and adding new topic tags on the fly.
   - Already tagged turns display an active (`lit`) badge that opens with existing topics pre-checked.

2. **Session-Level Marking (3.202.0 — S-38):**
   - The Sessions table, Console session cards, and Live Timeline swim-lane context menus feature **Add to Wiki Candidates…**.
   - Tags entire sessions across chosen topics in a single click and reports pending compilation counts.

### Compilation Engine: Synthesis & Headless Execution (3.204.0 — M-23)

The extension does not synthesize wiki pages directly with heuristic templates; mechanical summarization produces the exact shallow prose this architecture seeks to avoid. Instead, a strict division of labor is enforced:

1. **Briefing Generation (`wiki.compile`):** Gathers target candidate entries, resolves transcripts and precise turn ranges on disk, reads the vault's constitution (`-WIKI-ANAYASA-.md`), analyzes existing wiki pages and categories, and builds an exhaustive synthesis briefing for the agent.
2. **Headless Compilation Run (`wiki.compile.run`):** Triggering **Agent Farm: Compile Wiki Candidates…** from the Command Palette presents all pending candidates. Pressing Enter launches a headless compilation task under `agentFarm.wikiAgent` (default: `developer` or assigned wiki agent).
3. **Concurrency & Claim Protection:** A running compilation marks its candidates as claimed (`pool.compiling`), preventing parallel runs from compiling the same candidate twice. If a task crashes, stale claims drop automatically after a timeout and revert back to `pending`.
4. **Synthesis Rules (Vault Constitution):**
   - **One concept per page:** A concept is never split across multiple pages.
   - **Contradictions are preserved:** Outdated knowledge is not silently erased; updates are recorded with dated annotations.
   - **Every fact has provenance:** Footnotes link back to the exact transcript file and turn ordinal.
5. **Completion Contract:** When the agent finishes synthesis, it calls `wiki.candidates.edit {state:"compiled", pages:[…]}` over the bridge, marking candidates compiled and indexing newly created/updated pages.

### The Wiki Cockpit — The One Surface That READS The Pool (3.205.0 — U-70) {#wiki-kokpiti}

Four doors WROTE to the pool (the 🔖 badge, a session's right-click, the bridge, the palette command) and no surface READ it: what was waiting, what it was about, and where a compile actually put it were all invisible. The Wiki panel (**📚 Wiki** in every page's toolbar, or `Agent Farm: Open Wiki`) answers those three questions at a glance.

- **Vault strip (top):** the wiki root, `-WIKI-ANAYASA-.md`, `index.md` and `log.md` — each one clickable, each missing one marked **⚠**. With the root or the law absent, **both compile buttons are dead and say why before the press**; a button that looks alive over a compile that will be refused is the exact lie this feature exists to avoid.
- **Filter bar:** a topic multi-select (each option carrying how many marks under it are still waiting), state toggles (All / ⏳ Waiting / ✅ Compiled / 🚫 Dropped), and a live search box speaking the farm's shared query grammar (`foo bar` = both, `-foo` = exclude, `"exact phrase"`). The search looks at a mark's topics, its opening prompt, its note, its session and the pages a compile wrote for it, all at once.
- **DENSE table:** one mark is **one line**, and everything that could grow is an AFTip instead. State · source (session + turn range) · topic chips (more than three collapse to `+N`) · what was said · when it was marked · pages written. The source cell opens the conversation; the row's AFTip gives the session, the agent, the engine, the turn range, the note and who marked it when — **with zero clicks**.
- **Two compile buttons:** **📚 Compile Selected** takes the ticked rows, **⚡ Compile All Pending** takes everything waiting, both as ONE run. Both are `wiki.compile.run`: **neither marks anything compiled** — a row stays `pending` until the run reports back with `wiki.candidates.edit`.
- **A mark with a run out cannot be selected:** `compiling` is not a state in the pool (the state dictionary is a published contract, B-14); it is a **pending** row with a live run. That row draws no tick box and is not in the "pending" count — it is the only thing standing between the system and filing the same concept twice.
- **Inline editing:** ✎ opens the topics in a comma-separated box (Enter saves, Escape leaves it; an emptied list is never sent, because a mark with no topic has lost the pool's filing key). 🚫 takes a mark out of the queue, ↺ puts it back, ✕ deletes it — **none of them touch a page already written in the vault.**
- **Provenance breadcrumb:** compiled rows carry clickable `Category / Concept` page links; pressing one opens the file with your `docOpen` preference (Obsidian / VS Code / a custom app).
- **🩺 Lint:** reports `wiki.lint` into the page itself (orphan pages, broken `[[links]]`, unindexed pages, folders nested too deep). It **reports and never repairs**.

### Bridge Operations & Health Auditing

- **`wiki.candidates.add` / `wiki.candidates.list` / `wiki.candidates.edit` / `wiki.candidates.remove`:** Candidate pool CRUD operations.
- **`wiki.status`:** Reports pool counts (pending, compiling, compiled) and vault wiki topology (root, constitution, indexes, category depths).
- **`wiki.lint`:** Audits vault wiki integrity (orphan pages, broken `[[wikilinks]]`, unindexed documents).
- **Settings:** `agentFarm.wikiRoot` (Obsidian wiki path, e.g. `00_AGENT_AREA/00_WIKI`), `agentFarm.wikiAgent` (agent responsible for wiki compilation).


### Wiki Phase 2 — Compile Approval Strip, Searchable Taxonomy and Settings (3.285.0 — X-56, U-90..U-95, X-57..X-58) {#wiki-phase2}

*(3.281.0 - 3.285.0)* Wiki pool and cockpit Phase 2 enhancements:
- **Compile Confirmation Strip (3.285.0 — U-95):** Shows agent, engine, model, and effort before running.
- **Batch Actions:** **⚡ Compile these N**, **🚫 Drop**, **✕ Remove**; breathing animation for compiling state.
- **Searchable Menu & Editor (3.284.0 — U-92):** Search box for 12+ categories; ✎ inline editor for topic, note, and excluded turns.
- **Settings & Vault Health (3.283.0 — X-57, X-58):** `agentFarm.wikiRoot` section, 3-file health check, `🛠 Start the wiki here`.
- **In-Turn Tagger (3.282.0 — U-90, U-91):** Searchable menu from 🔖 badge with `+ Start category`.
- **Turn Scope Strip (3.281.0 — U-93, U-94):** Visual turn-strip selector and `Whole session` button.


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

### Insight History — does it keep coming back, and did your fix hold? (3.27.0) {#insight-tarihcesi}

Insights were a **snapshot**: a finding appeared, you fixed or dismissed it, and the farm forgot. So the two questions that decide whether a finding is worth acting on had no answer — **how long has this been here / how many times has it come back**, and **did what I did last time actually help**.

A **ledger** now rides along with the same refresh that builds the list. It records three moments (first seen · last seen · your last action) and derives the one fact that matters most: **regressed** — it was gone after you acted, and then came back. That is the difference between "the fix worked" and "the fix looked like it worked".

- **Every row carries its own record:** **↻4** when a finding has returned four separate times, **⚠back** when your fix did not hold, and the sentence in the tooltip (`3× (came back) · first seen 12d ago · your fix did not hold — back after 2d`).
- **Insight History…** (a button on the Insights view) lists the ledger, worst offenders first, with the real counts in its header: how many are open, how many keep returning, **how many came back after you acted**, how many fixes are holding.
- **A refresh is not an occurrence:** a finding that is still listed is the *same* appearance, so "seen 4 times" means four separate visits, not four dashboard renders. Churn on something you never acted on is never called a broken fix.
- **Bridge:** `insights.history` (`limit?`, `recurringOnly?`) — "what keeps breaking?" is answered from the record, not from today's snapshot.

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
- **‼️ Every engine (3.114.0).** The scan used to read Claude transcripts and nothing else, so a fleet running on four CLIs was searchable on one and no surface said so. Codex, Gemini and Antigravity transcripts are now read with the very parser the Session Viewer reads them with, and every result row carries its **engine badge**.
- **One compact control panel, then the answer (3.118.0).** The panel reads as three bands: **how** to read the query (Mode · Text · Regex · Meaning, Aa Case, ▣ Whole word, Syntax), **where** to look (opening scope, Agents, Find session ID…, ⚙ Filters), and **what** to look at (Quick scope and the content badges). The query is **one line at a fixed height** — a query is not a paragraph, and the old resizable textarea could be dragged over the controls beneath it. `Enter` runs it; Text and Regex also run themselves half a second after you stop typing. Content badges use the canonical compact names 🧑 **You** · 🤖 **Agent** · 📤 **Delegator** · 📥 **Handler** · 🔧 **Tools** · 📄 **Results**, with 📝 **Memory** and ⌁ **Events** as a second run beside them, while the complete explanation stays in the wide AFTip. **Conversation · Delegation · Tool trail · Everything** live in a purple-framed `Quick scope` pill on the row above. Results begin immediately below.
  - **‼️ The caret does not leave the box.** The page rebuilds its whole card on every change, so a search that runs while you type used to throw the cursor out of the query box the moment an answer arrived — the next letter went nowhere and you had to click back in. The focused control and its caret position now survive every repaint, and a chip pressed from the keyboard comes back under the keyboard.
  - **‼️ Nothing moves when a control lights up.** The content block is two fixed rows, the six kinds and the two extra sources wrap as whole groups rather than orphaning one badge, the `⚙ Filters` chip reserves room for its own count, and both ✕ clearers sit in slots that hold their width whether the button is drawn or not. Measured: identical geometry with nothing set and with two filters set.
  - **The query box has no hover.** A paragraph that opens every time the pointer crosses the control you are using is noise when `Syntax ▾` is one press below it. Everything the hover carried — what the box searches, what each mode does to the grammar, the ten-second regex budget, what Meaning does not cover, and what Whole word is doing while it is on — is in that card.
  - **‼️ A delegating agent is not a user.** In a subagent lane the prompts are written by the agent that handed the work over; they used to arrive labelled `user`, so "search only what I asked" answered with paragraphs one agent wrote to another. They are **Delegator** now (named: `delegator (manager)`) and the replies are **Handler**. Dialog therefore means you and the agent, and the delegation lane is one press away — the results line always says which kinds were searched and how many were not.
  - **The chips are badges: a click adds or removes a kind**, so two kinds at once is one gesture; Ctrl/⌘-click means *only this one*. The scope never empties — taking the last chip off returns to Dialog.
  - Measured on a ~95 MB fleet, a full everything-scan stays under ~1.5 s. Two extra sources ride along as chips of their own: the agents' 📝 **memory notes** (`memory/*.md`, hits open the file) and ⌁ **orphaned live events** — events whose transcript no longer exists (external CLIs, pruned sessions); events still backed by a transcript are deliberately excluded, the transcript scan already covers them.
- **Session filters are present without permanently taking the page.** Agent stays in the compact control row. Engine, Project, Model, Session id/title/path, Started by, Lane, Pinned, Has errors, message date and result order open together under **⚙ Filters (n)** and fold back into that one badge. Session owns the wide flexible field in that row. **‼️ Each clearer answers for the block it sits in (3.118.0):** a **✕ beside the Filters chip** puts every session axis back to *all* — agents, opening scope and everything in the panel — and a **✕ at the end of the badge row** resets the content scope to Conversation with both extra sources on. Neither touches the other, and neither touches the query. (Before, one Reset lit up for filters it did not touch and sat at the far end of the row from the badges it put back, with Clear filters where the reset belonged.) Opening the filter panel or the syntax card, and changing the sort, no longer mark the answer on screen as stale — sorting is done over hits the page already holds — while **Aa Case** and **▣ Whole word** re-run the search rather than asking you to press Search again. The Engine picker never loses an engine merely because the current pool is quiet: it always reads the product's one registry of **Claude · Codex · Gemini · Antigravity**. Filters narrow **the set that is scanned**, not the results afterwards. Project membership is resolved for each session (explicit membership → code root → agent default), never guessed from the agent name alone.
- **Agent picker (checkbox dropdown, 2.60.0):** the `Agents: all ▾` button opens a tick list of every agent — pick **any combination**: one, two, all-but-one… **Select all / Clear** links do the bulk moves. Everything is ticked by default (new agents join automatically), so "all agents" needs no separate mode; unticking narrows the scan (memory notes and live events follow the same pick). The button reads `Agent: dev`, `Agents: 2/7` or `Agents: none` — an all-unticked pick honestly finds nothing. Opening the panel from an Agent Detail page pre-ticks just that agent; changing the pick retires the stale agent pill.
- Text, Regex and Meaning are separate mode buttons. Text offers **Match case** and **Whole words**; **Query guide** opens the full grammar as symbol, meaning and example. Every selected mode/content control keeps a fill, border, check mark and accessibility state after the pointer leaves it.
- **‼️ "I know the id" (X-34, 3.117.0).** Paste a session id — or the eight-character prefix this extension prints on every track chip and log line — into the query and press **`Find session ID…`** in the top row. It opens the direct whole-index finder instead of filtering text results; full ids and prefixes work across every engine. Running ordinary Search for that id finds its textual mentions and draws the matching session link above the answer. The Session detail field instead narrows which sessions will be scanned. The same finder is available elsewhere as **`Agent Farm: Find Session by ID…`** and the 🔑 on the Sessions view header; Sessions table text filters also match the id.

**‼️ The query language (3.84.0) — one grammar, every box that searches.** Every filter box in the extension used to ask one question, "does this substring appear?", which is the wrong one the moment a list is longer than a screen: you could not ask for two words that are not next to each other, nor for either of two things, nor for a whole word rather than a fragment of a longer one, nor to leave something out. The grammar below is the answer, and it is **the same grammar everywhere** — the Search page, the backlog, sessions, turns, tasks, notices, the queue, secrets, the toolbox, settings, the Console's resume filter and its saved-prompts picker. The extension host and the pages literally run the same file (`media/afQuery.js`, loaded by `src/core/query.ts`), so the two can never disagree.

| You type | It means |
|---|---|
| `foo bar` | **both**, in any order — whitespace is AND |
| `foo OR bar` | either (`|` works too). `AND` may be written out. |
| `-foo` / `NOT foo` | rows **without** it |
| `(a OR b) c` | parentheses group; AND binds tighter than OR |
| `"tool call"` | that **phrase**, in order — and **whole words**: `"log"` is not found inside `dialogue` |
| `refact*` | `*` stands for any run of non-space characters |
| `"refact* the pars*"` | the two together: finds *"refactor the parser"* **and** *"refactored the parsing"* |

- **A bare word is still a plain case-insensitive substring** — deliberately: nothing anybody typed before this existed behaves differently now. Quotes are how you ask for *more* precision, not less.
- **`whole word` is that precision without the quotes** (3.114.0): tick it on the Search page and a bare word must match a whole word — `log` stops finding `dialogue`. A `*` still opens whichever end it is written on, so `refact*` keeps finding `refactoring` in the mode. It does nothing in `regex` mode, where a raw pattern already states its own boundaries. The box says so in its hover while the mode is on.
- `OR`, `AND`, `NOT` are **uppercase only**, because "or" is an ordinary word people search for. A hyphen inside a word (`agent-farm`) is a hyphen; only one at the start of a term is an operator.
- The whole-word anchor is Unicode-aware, so it works on Turkish letters — `\b` would not.
- **A half-typed query is not an error.** These boxes filter as you type, so an unclosed `"` or `(` is treated as the prefix it is rather than blanking the list under your hands. A genuinely broken query (a stray `)`) says so in words.
- `regex` on the Search page still hands the box to `RegExp` untouched — none of the grammar above applies in that mode.
- Every box carries the grammar in a rich, scrollable `AFTip`, with a first line saying what *that* box searches. Explanatory text never uses a native `title` tooltip.
- **Text and Regex are live.** After at least three characters and a 500 ms pause, the answer refreshes without waiting for Search; `Ctrl/⌘+Enter` runs immediately. Meaning never runs from typing or filter changes because each query may be a paid embedding call; the primary **Search** button runs it deliberately.
- **Results are grouped per session with turn sub-headers** (2.53.0): each session is one block (header click → open the session), hits inside it are labeled `Turn 3 — <its opening prompt>`; tool hits carry the tool name. Clicking a hit opens the session viewer and scrolls to **the exact matching message** (2.40.0) — briefly highlighted with a frame.
- Preview output is limited to 12 per session and 250 total (a session-scoped search gets much higher caps), but matching continues. The page separately reports **matches found · previews shown · sessions matched · sessions scanned**, and each session says `12 of 47 shown`; a preview cap can never pose as the full answer. A runaway regex is cut by a **10 s time budget** and unreadable transcripts are counted.
- **‼️ It is fast now, and nothing about the answer changed (X-42, 3.141.0).** The page was reading the whole transcript pool on every query — 405 sessions, 664 MB — on the extension host's main thread: a fleet search that matched nothing took **6,5 seconds and the second one took 7**, because the 80-file cache evicted its own head on every newest→oldest pass. Worse, the parser produced every role even when the search was the default You+Agent: of 79,9 million searchable characters, the dialogue is 2,76 million, so the default search was paying for 77 million characters of tool traffic it had been told not to look at. Same query today: **58 ms**, and **zero** transcript reads.
  - A **persistent, role-split corpus** under globalStorage holds the normalized text, one shard per role per session, keyed by `mtime + size + engine + lane`. Dialog reads the dialogue and never opens the tool trail; only a session whose signature changed is rebuilt; a deleted one is pruned; a corrupt manifest or a missing shard is a rebuild, never an error. It is **a cache and never your transcripts** — losing it costs a rebuild and nothing else.
  - **Nothing is built at startup.** The first query on the Search page builds it, newest first, yielding between files, and the page says `Preparing search corpus n/total…` while it does. One time, 12,7 s for 664 MB; 77,5 MB on disk.
  - **The candidate pass comes from the grammar itself**, not from a second reading of what you typed: the parse tree yields the literals a match cannot do without, and a file may be skipped only where a false negative is impossible. NOT never narrows, raw regex never narrows, and every record that survives is still judged by the same matcher — so AND/OR/NOT, parentheses, phrases, wildcards, Turkish Unicode, case and whole-word behave exactly as they did. **ripgrep is used only where it earns its own startup cost** (the ~80-million-character tool trail; below that Node reads the whole corpus faster than a process can be spawned), and **only exit 1 counts as an honest zero** — a missing binary, a crash or a timeout falls back to the full read rather than reporting an empty page quickly and wrongly.
  - **A superseded search now stops.** Typing a sentence used to queue four full fleet scans on the host, each paid for in full, while the page merely declined to draw three of them.

**Meaning mode (semantic search):** searches conceptually similar passages for questions like *"where I talked with the agent about low motivation"*. It deliberately covers indexed main-session conversation passages only — not tool traffic, memory, events, message dates or engines absent from the index. The workspace disables those content choices and states this boundary instead of silently ignoring them. Session metadata filters still apply, and their allowed session IDs restrict the vector pool **before** top-k ranking.

- Setup: `agentFarm.embeddingsProvider` = `gemini` (Google API — add the `GEMINI_API_KEY` secret with Set Secret) or `openai` (any OpenAI-compatible endpoint — if you want it **fully local**, Ollama: `embeddingsBaseUrl` = `http://127.0.0.1:11434/v1`, model e.g. `nomic-embed-text`, no key needed).
- Index: the **Build Semantic Index** command vectorizes the last `semanticMaxSessions` (300) sessions in chunks; it's file-based, works incrementally (only new/changed sessions), and refreshes itself up to 20 sessions on every semantic search.
- Results show a similarity-percentage badge; in semantic mode no automatic search happens as you type (each query is an embedding call), you search with Enter.

## Notices and the Work Queue — the agent↔you channel {#notices-kuyruk}

A two-way async channel; presented across global navigation in a unified four-tab strip: **🔔 Notices | 📥 Queue | 🤖 A2A Notes | ⚡ A2A Tasks** (with a visual divider between pairs). Status bar attention badge (colored bell for Notices/Queue; quiet grey badge only on their respective tabs for A2A).

**Notices (agent → you):** every agent leaves **one row per thing it wants to tell you**. Two axes: `type` (update · report · result · reminder · suggestion · warning · question) and `level` (1 routine → 4 ultra). Long content travels on two legs: the **summary** on the board plus a full report written into `10_REPORT` behind it ("📄 Open full report"). The `question` type carries an async lifecycle: the agent asks, you answer in the UI (→answered) or close it unanswered (→declined), and the agent applies the answer and resolves it on its next turn. For **ageing**, see [the Living page](#yasam-panosu).

**Work Queue (you → agent):** the frictionless channel for fixes you notice while working (`Ctrl+Alt+A`); items **do not disappear until handled**. Pipeline: `captured → grouped → delegated → done` (+ `blocked` = a question for you, the only attention-grabbing state; `dropped` = invalid). A non-terminal item **cannot be deleted** — a bad entry moves to `dropped`, which counts as handled.

**Full Notice Conversion to Queue Item:** Converting a notice to a queue item ("Add to queue" button or user answering an async question) no longer preserves just the title; the complete notice snapshot is preserved: `sourceNoticeAgent`, `type`, `body`, `sections`, `reportPath`, and `projectId`. Built via a single pure function (`core/noticeToQueue.ts`). The item is automatically routed back to the asking agent's queue (notices generated by Agent Farm itself remain unrouted). The queue card displays a `❓ Question: <title> · from <agent>` badge, and clicking **▸ Original** expands the full original notice body, sections, and report button inline. Agents inspect `queue.list { sourceNoticeAgent: "<me>" }` to discover answers to their own questions (both Notices and Queue boards are checked at `[session-start]`).

**Maturity engine — `queue.maturity` (3.18.1).** The grouping/maturity decision (group · wait · delegate) moved from prose into code: it applies the thresholds (`agentFarm.queue.groupSize`, `queue.maxAgeHours`) and returns `{ actionable, reason, ripe[], ungrouped, starving[] }`. **`starving` is what `queue.groups` cannot show you:** an item that was never grouped has no `groupId`, so a sweep reading only the group digest concludes "the queue is idle" while the user's own answer rots past the ceiling — which is exactly what happened. **Every sweep starts with `queue.maturity`.**

## A2A (Agent-to-Agent) Protocol — Inter-Agent Communication and Work Handoff {#a2a-protokolu}

Notices is the agent→human board, and the Work Queue is the human→agent channel. **A2A (Agent-to-Agent)** is an independent protocol (`a2a.*` bridge operations) designed for agents across the fleet to leave **technical notes for each other**, **delegate and hand off tasks**, and **preserve cross-session technical memory** without cluttering Notices or distracting the user.

A2A data is stored in Agent Farm's `globalStorage` (`a2a-notes.json` and `a2a-tasks.json`), queried strictly via the bridge API rather than by touching raw files.

### Two Distinct Concepts: Note vs Task

The A2A architecture separates passive knowledge from active work:

1. **Note (`a2a.notes.*`) — PASSIVE:**
   - A technical fact, discovery, dependency warning, locked database notice, transient API error, or task completion result.
   - Not assigned to anyone; any agent whose coordinates match may read it.
   - An agent reading a note marks it read *for that agent alone*. Calling `a2a.notes.resolve` closes the note for everyone.
   - Promotion: If a note turns out to require action, it is promoted to a task once via `a2a.tasks.fromNote` (a second conversion of the same note is refused by name).

2. **Task (`a2a.tasks.*`) — CLAIMED:**
   - Actionable work that must be claimed and executed by exactly one agent.
   - Operates on a **lease** model: the claiming agent is granted a 30-minute window. The agent must periodically send `heartbeat` updates; otherwise, the lease expires and the task is returned to `queued`.
   - Lifecycle states: `queued → claimed → running → done | failed | blocked | cancelled`.

### 5-Axis Coordinate System and Strictness Matrix

A pure matching engine (`src/core/a2aMatch.ts`) evaluates five coordinates:

- **`project`**: Scope boundary. `*` represents a fleet-wide broadcast; otherwise matches the workspace project. **‼️ Project contains in every mode; no strictness setting ever crosses project boundaries.**
- **`targetRole`**: Addressee (role, capability, or specific agent name).
- **`subsystem` / `workdir` and `topic`**: Describe the subject; act as ranking factors except under `hard`.
- **`targetSession`**: Session lineage; a resumed session preserves its identifier.
- **`requires`**: Capability filter (`write_tools`, `browser`, `shell` etc.); strictly validated as lowercase `[a-z0-9_-]+`, with invalid names refused upon creation.

| Coordinate Axis | `hard` | `preferred` (during grace) | `preferred` (after grace) | `any` |
|---|---|---|---|---|
| **`project`** | must | must | must | must |
| **`role` · `session`** | must | must | rank | rank |
| **`subsystem` · `topic`** | must | rank | rank | rank |

**Grace Window (`agentFarm.a2a.preferredGraceHours`, default 2h):** Under `preferred`, a task is reserved exclusively for the target role during the grace window. If another agent attempts to claim it, the engine refuses with structured data: `reserved for its target role`, the exact opening timestamp (`opensAt`), and mismatched `axes`, preventing wasteful polling. Once the window elapses, the task becomes claimable by other capable agents in the project.

**Multi-Process Concurrency Protection (Claim Race):** When multiple independent Node processes attempt to claim the same task simultaneously, atomic file locking ensures exactly one winner emerges, while all competing processes receive informative refusal errors. `a2a.tasks.next` returns the closest coordinate fit first, oldest within a tie.

### Task Lifecycle and Loop Guard

1. **Claim:** `a2a.tasks.claim id=…` (or `a2a.tasks.next claim=true`).
2. **Heartbeat:** `a2a.tasks.heartbeat id=… progress="one line"`. Extends the lease every few turns. The return value MUST be inspected: directives issued by human supervisors arrive here.
3. **Finish:** `a2a.tasks.finish id=… state=done|failed|blocked result="summary"`. Automatically leaves a **result note** for the originating agent; no Notices spam is generated for the user.
4. **Handoff & Loop Guard:** If an agent cannot complete a task but knows another specialist can, it calls `a2a.tasks.handoff id=… targetRole=…`. **‼️ The third consecutive handoff is strictly refused by the system, placing the task into `blocked` state.** This mechanical loop guard prevents endless inter-agent bouncing. Blocked work requires human intervention to reroute.

### ‼️ Human Supervisor Directive — Supreme Override

The human supervisor's command (`humanDirective`: `steer` | `veto` | `constraint`) is the highest authority:

- **Absolute Precedence:** A supervisor directive (`⚠️ [HUMAN SUPERVISOR DIRECTIVE]`) outranks the constitution, the agent's system prompt, and the task's original instructions. In case of conflict, the directive is obeyed without hesitation.
- **First Key Delivery:** When an agent inspects or claims a directed item (`a2a.tasks.claim`, `a2a.tasks.next`, `a2a.tasks.heartbeat`, `a2a.notes.get`), the **FIRST key** of the API response is `supervisor`. It cannot be overlooked.
- **Live Injection:** If a supervisor directive is applied while a task is running, it is delivered immediately on the next `heartbeat`.
- **Supervisor Cockpit:** Hovering over any card reveals a `+` button that opens an inline `AFForm` panel directly beneath the row (`src/core/a2aSupervisor.ts`).
  - A colored 👤 badge indicates the directive type (amber = steer, blue = constraint, red = veto) with tooltip preview.
  - Notes allow setting or removing directives.
  - Tasks allow setting directives, **Re-route** (handoff with loop guard counter reset), and **⚡ Run Now** (`a2a.tasks.runNow`). `Run Now` opens a dedicated Console session for the named agent and claims the task through standard claim mechanics.

### Baton Handovers on the A2A Board and Board Hygiene

The baton relay (`baton.pass`) records handovers not just in internal machine logs (`batons.json`), but posts them onto the A2A board:

- **Baton Cards:** Created with `category: 'baton'`, `topic: chainId` (`chn_...`), and `strictness: 'hard'` addressing the specific successor agent.
- **Auto-Resolution:** The moment the successor session starts running, the handover card is automatically marked `resolved`.
- **Hygiene Policy (`a2aHygiene.ts`):** Resolved cards initiate a 48-hour expiration timer (`resolvedAt`). When a chain terminates (`done` / `failed` / stopped), a 24-hour TTL is stamped on all its cards, and the background sweep cleans them up.
- **Pinning (📌 Pin):** Pinned cards are immune to all automatic sweeps and expirations; only explicit manual deletion removes them (`a2a.notes.pin`, `a2a.notes.delete`).
- **Board UI Controls:**
  - **Tri-State Relay Switch:** `⑂ Batons: all` → `hidden` → `only`.
  - **Chain Lock:** Clicking a card's `⑂ chn_...` chip locks the view to that specific race, clearing unrelated filters and ordering cards chronologically (oldest-first).
  - **Selective Deletion:** `✕ Delete` on open cards, row checkboxes with `🗑 Delete` (selected or shown), and `● Clear resolved` for closed cards.

### Four-Tab Agent Inbox UI

Unified navigation across `🔔 Notices | 📥 Queue | 🤖 A2A Notes | ⚡ A2A Tasks`:
- **Common Card Grammar (`afA2A.js`):** Project chips, workdir segment indicators, 30-minute lease progress bar (green/amber/red).
- **A2A Notes Page (`a2aNotesPanel.ts`):** Resolve/reopen, convert to task (`a2a.tasks.fromNote`), markdown file links, facts table.
- **A2A Tasks Page (`a2aTasksPanel.ts`):** Open/closed tabs, cancel, lease tracking, progress reporting, and cross-links.
- **Session-Start Habit:** Agents invoke `a2a.status` on startup to review unread notes, claimable tasks, and active leases in a single call (`DUTIES.md` `[session-start]` watch).

### A2A Bridge Operations Reference

| Category | Operation | Description |
|---|---|---|
| **Status** | `a2a.status` | Returns unread notes, claimable tasks, and held leases for an agent in a single call. |
| **Notes** | `a2a.notes.list` | Lists notes with filters (`unreadOnly`, `category`, `project`, `topic`, `strictness`). |
| | `a2a.notes.get` | Gets note details; marks `read` for caller; returns `supervisor` as first key if present. |
| | `a2a.notes.add` | Creates a new technical note (`project`, `targetRole`, `subsystem`, `topic`, `ttlHours`). |
| | `a2a.notes.resolve` | Marks note resolved; starts 48-hour expiration timer. |
| | `a2a.notes.pin` | Toggles pin state (pinned notes are protected from sweep). |
| | `a2a.notes.delete` / `.deleteMany` / `.clear` | Deletes notes individually, in batches, or by category/topic. |
| | `a2a.notes.sweep` | Cleans up resolved, expired notes (protects pinned notes). |
| **Tasks** | `a2a.tasks.list` | Lists tasks with filters (`status`, `project`, `targetRole`, `subsystem`). |
| | `a2a.tasks.get` | Gets task details; returns `supervisor` as first key if present. |
| | `a2a.tasks.add` | Queues a new task (`instructions`, `targetRole`, `strictness`, `requires`). |
| | `a2a.tasks.claim` | Claims a task with a 30-min lease; race-safe atomic lock; `supervisor` first key. |
| | `a2a.tasks.next` | Picks and ranks the best-fit task; `claim=true` claims it immediately. |
| | `a2a.tasks.heartbeat` | Renews task lease, reports progress; receives live supervisor directives. |
| | `a2a.tasks.finish` | Completes a task (`done` / `failed` / `blocked`); leaves result note for creator. |
| | `a2a.tasks.handoff` | Hands off task to another role; blocked on 3rd handoff by loop guard. |
| | `a2a.tasks.cancel` | Cancels a task. |
| | `a2a.tasks.fromNote` | Promotes an A2A note into a single task. |
| | `a2a.tasks.reroute` | User op: reroutes task to new coordinates and resets loop guard counter. |
| | `a2a.tasks.runNow` | User op: launches Console session and runs task immediately. |
| **Supervisor** | `a2a.directive.set` / `.remove` | Sets or removes human supervisor directive (`steer`, `veto`, `constraint`). |

## The Living Page {#yasam-panosu}

**Agent Farm: Open Living** (**💓 Living** in the global nav) — 3.18.0. One screen answering one question: **is the system alive today?**

It exists because of a measured failure: the daily LifeOS cycle stopped for 16 days while the safety-net duty ran **correctly** every morning and posted its reminder, which nobody read. There was no error and no red part — and the system was dead. Every other page reports on a **part**; this one reports on **loops**: something opened — did it close?

Rows:

- **Notices** — the **age** of unread level-3+ messages (not the count). More than three stale ones = stopped.
- **Questions** — open, unanswered questions. *Read ≠ answered.* Answered-but-unprocessed questions get their own row.
- **Queue** — the age of the oldest live item; a `captured` item past `queue.maxAgeHours` means the pipeline stopped. Blocked items get their own row.
- **Automations** — all switched off = dead; enabled but silent for 7 days = the quiet death; enabled but unguarded = a cost warning; a closed gate gets its own row.
- **Duties** — a `[daily]`/`[weekly]` duty with no schedule or trigger behind it (`[every-turn]` is passive by design, exempt).
- **Spend** — today against the ceiling; with no ceiling set it reads "idle", not healthy.
- **Your own checks** — `agentFarm.livingChecks`: the precondition engine read as **"TRUE = needs attention"**, so the same `{today}` tokens check a diary file or a folder that should be empty. The checks are **rows on this page** (3.92.0): one open at a time, and the whole list written on Save — so a reorder is one write and Cancel is not a lie. On the bridge: `living.checks` (read), `living.check.add` and `living.check.remove` (write — **by label**, so adding the same label again *tunes* a check instead of growing a pile of near-identical ones nobody can tell apart on the page).

**Score:** a dead loop counts zero, a warning counts half — a system with one dead loop must not read as "94% healthy". At the bottom sits the **automation decision log**: when, what fired, what was skipped, and **why**.

**Notice ageing (the second beat):** an unread level-3+ notice or unanswered question older than `agentFarm.noticeStaleHours` (default 24) turns the status-bar bell into a warning naming the oldest item and its age, and nags **once** per unanswered question. The goal is not nagging — it is that ignoring something has a consequence.

## Command Center

As the fleet grows, the bottleneck is you: who's waiting for permission, which browser step wants approval, where did the budget overflow? The Command Center layer (Phase G) is for answering these questions on a single screen.

### Approval Queue {#onay-kuyrugu}

**Agent Farm: Open Needs You (Approval Queue)** — everything the farm is **stuck on**, in a single urgency-sorted queue.

**‼️ THE ADMISSION TEST — "if I never touch it, does the farm stay stuck?"** Only rows that pass it belong here. A fact about something that already happened (a blown budget), a proposal (an instruction suggestion), a state that resolves itself (a task parked for capacity) and an idle session are **news, not work**: they go to **Notices**, which is built to be read and kept. A page that mixes the two teaches you to ignore it — the one failure a blocking queue cannot afford.

1. 🛡️ **Sessions waiting for permission** (from live hook data) — one click opens the session or the Timeline.
2. 🌐 **Browser steps waiting for approval** — **Run / Reject** directly from the queue. The notification and the queue race; the first decision wins. If you miss the notification the request waits in the queue and the workflow doesn't advance until it gets approval.
3. 🎯 **Missions with an open question or a cut run** — **Answer… / Resume / Dismiss** on the row.
4. ⛓ **Interrupted workflow runs** — chains cut off by a window close are a persistent row in the queue, the **Resume / Dismiss** buttons are on the row, and they count toward the status-bar badge until a decision is made. Missing the startup toast doesn't lose the run.
5. ⏳ **Stalled sessions** · ⇄ **Antigravity conflicts** (one-click reconcile) — drift passes the test because no clock, no agent and no retry will ever clear it; only you will.

**Clearing rows.** A row you have seen and judged goes away: the **✕** on the row, the checkboxes plus **🧹 Clear selected**, or **🧹 Clear all**. Cleared rows come back with **↩ Restore (N)**.

**‼️ Clearing is self-healing — you can never permanently blind yourself to a condition.** The record is keyed on the row's identity (session + kind of problem; deliberately no timestamp and no message text, because those move while the problem stands still) and lives **only for as long as the row keeps being produced**. The moment the condition ends, the row stops appearing, the key goes stale and is dropped: the **same** wait stays cleared for its whole life, and the **next** one — a new permission prompt from the same session, the same session stalling again — arrives with a clean slate.

**The one row that cannot be cleared: a browser approval.** A real agent is parked on `await` behind it; hiding the row would leave it parked forever with no surface left to answer from. Its clear is **Reject**, which settles the promise honestly — so the row carries a 🔒 instead of a checkbox.

The status bar counts this queue: if `🔔 N need you` shows, clicking it opens the queue.

**Agent side:** `needs.list` · `needs.clear` (`keys` or `all:true`) · `needs.restore` · `needs.act` (`key` + `action` — presses a row's button through the panel's own handler; `answer` carries the text a typed button asks for; view-only buttons are refused with the op to read instead).

**A step waiting on you says so in three places, in one sentence (3.742.0).** A browser step asking to run, a workflow approval (an approval step, a publish, a judge that could not judge, a supervisor's decision to confirm), a media step asking to upload a local file and a pick step: while the question is open, the step's row reads *waiting for your answer: …*, `farm.waits` lists it as `human-answer` (on the task, or on the run when the browser step has no row yet; `op` names `needs.act`, or `workflows.select` for a pick) and Needs You carries the same sentence; the answer removes it from all three. The upload question now goes through the approval queue too, so it is answerable from Needs You and over the bridge, not only from the notification.

### Five concepts — which is which? {#gorev-kavramlari}

In one place so they never blur:

| Concept | What it is | Runs on its own? |
|---|---|---|
| ⏰ **Schedule** | gives an agent work at a set time | **yes** |
| ⚡ **Trigger** | gives work when something happens (file change, webhook, live event) | **yes** |
| 🔗 **Workflow** | a chain of steps (several agents, approval/selection gates, media) | no — you or a trigger launches it |
| ↳ **Checkpoint step** | a step with no agent: the supervisor is woken there and routes the run — proceed, retry, jump, insert a step, ask you, stop (M-43) | inside a workflow run |
| ↳ **Tool step** | a step with no agent and no model: a local ffmpeg recipe (split, concat, transcode, key frames…) — zero tokens (M-49) | inside a workflow run |
| 📋 **Template** | a saved prompt you fire by hand | no |
| ▶ **Task** | **one single run.** Everything above PRODUCES tasks | — |

**A task is not a fifth type — it is the execution itself.** A schedule's time arrives and it spawns a task; a trigger fires and spawns a task; every workflow step is a task; and **+ Run a task** lets you open one directly (a one-off job). That is why the first four live on the **Plan** tab (definitions) and tasks live on the **Runs** tab (executions) — and why the page is called Tasks: everything ends up as one.

### Tasks Page — the agent-activity control panel {#tasks-sayfasi}

**Agent Farm: Open Tasks** (the **Tasks** button in the global nav) — **redesigned from scratch in 3.19.0**. The old four-section layout (Board / Automations / Reusables / Analytics) is gone: the section names described the implementation's internal types rather than the objects in the user's head, and the *plan* for a thing lived in a different tab from its *runs* ("there are triggers, but where are the tasks?").

The page is now built on the one distinction that actually exists in the data:

- **PLAN** — everything that **defines** work: schedules, triggers, workflows, templates. Four different internal types that the user manages **the same way** (switch it, guard it, pick its model, run it, edit it, delete it) — so they live in **one table** with a kind column.
- **RUN** — what those definitions actually did.

Management comes first and gets the rich surface.

#### Control strip (fixed on both tabs)

The automation gate's state plus one-move controls: **⏸ Pause all** / **▶ Resume all**, 1h / 8h / 24h timed pause, **🌙 quiet hours**. Beside them the numbers: running/limit · queued · needs you · **how many plans are on** · finished/failed today · the automations' **7-day cost** · **suppressed wake-ups** · **rows needing attention** (clicking filters the table down to them).

#### PLAN tab

One table, one row language:

| Column | What it tells you |
|---|---|
| kind + name | ⏰ schedule · ⚡ trigger · 🔗 workflow · 📋 template, with problem badges |
| when | "every day 05:00" · "on change · …/inbox" · "when you run it" + the next run |
| agent / model | the model stated **on** the automation (it beats the policy engine); otherwise "default" |
| guard | the `fireIf` precondition + **how many wake-ups it saved** |
| cost 7d | what that definition actually spent |
| last run | when + the reason behind the last decision ("no files waiting") |
| on/off | a real **switch**; things with no on/off state say "manual" instead of faking one |

- **Search** covers name, prompt, agent and the timing text at once.
- **Filters**: kind · agent · model · state · guard · "needs attention". **Every active filter is VISIBLE as a removable chip** ("showing 3 of 12 — kind: trigger ✕") with a one-click **Reset filters** beside it. A filter you forgot you set is worse than no filter.
- **Grouping**: by kind (default) · by agent · flat. Sorting from the column headers; a second click flips the direction.
- **Bulk**: row checkboxes + select-all → switch many on/off in one move (behind a confirm).
- **Row detail expands inline** (▸): full prompt, target, timing, precondition, the 7-day run/skip/cost breakdown, and the step list for a workflow. Nothing opens a mystery second page.
- **Adding** is on the same bar: + Schedule · + Trigger · + Workflow.
- Problem badges: `no guard` (fires whether or not there is work) · `path missing` · `always fails` · `never ran` · `deferred` (held by quiet hours) · `no steps`.

#### RUN tab

Live, queued, parked and finished runs in one list: status · **where it came from** (schedule / trigger / workflow / you) · duration · cost · when. Row actions: start · move to front · terminal · cancel · re-run · output · delete; a parked run gets "retry start". Detail expands inline (full prompt + transcript). Filters: agent · status · source + search, with the same chip/reset behaviour as PLAN. The **natural-language command bar** lives on this tab.

Filter state is remembered **per tab**; switching tabs never bleeds one tab's filters into the other.

#### The Tasks tree in the sidebar

It teaches **the same model** as the page; it was reworked in 3.19.0 too. Three roots, **always visible**:

- **Plan** — all four definition kinds in one list (schedules → triggers → workflows → templates; enabled schedules by time of day). Rows show agent, time, model and the `no guard` / `PATH MISSING` / `deferred` warnings plus the suppressed-firing count; the tooltip names the kind **in words** ("⏰ SCHEDULE") and spells out the precondition. The root shows `on/total` plus how many are manual.
- **Now** — only what is **running or queued**: the work that concerns you. Clicking a running task reveals its terminal.
- **Recent** — the last **12** finished runs, newest first, with the failure count on the root. The rest lives on the page and in the monthly archive.

Two faults fixed. (1) Sections used to appear **only when they had content** — a farm with no workflows had no Workflows section at all, so the feature looked missing; all three roots are now permanent and an empty one **says what to add** (and is clickable). (2) Tasks were grouped **per agent with all history included**, so every agent unfolded into a wall of finished runs with nothing to do about them; history now sits behind Recent and is capped.

Every right-click menu is preserved (leaf `contextValue`s unchanged). Inline buttons: **+ Schedule / + Trigger / open the page** on the Plan root, **+ Task** on Now, **clear finished** on Recent.

#### Analytics is now its own page

**Agent Farm: Open Task Analytics** (the 📊 Analytics button on the PLAN bar) — 30-day KPIs, throughput chart, per-agent scorecard, task families, alerts and the forecast. Split off **deliberately**: those numbers are for *reading*; you should not have to hunt for a switch underneath charts while turning an automation on. Every table there carries its own search/filter/sort/↺ reset/⬇ MD export.

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

Your agents are optimized for Claude; but if you like, the same agent runs under Google Antigravity (Gemini) and OpenAI Codex too. `memory/` files are plain markdown, so **both sides use them as is — no conversion needed**.

**Two engines, two instruction files — because they look in different places.** This is not a preference, it is what each engine does:

| | Reads | Walks up? |
|---|---|---|
| **Codex** | one `AGENTS.md` per directory, merged **from the git root down to its cwd** (32 KiB ceiling) | **Yes** — a shared file one level up arrives on its own |
| **Antigravity** | `<workspace root>/.agents/AGENTS.md` + the global `~/.gemini/config/AGENTS.md` | **No** — nothing above the open workspace is ever loaded |

So the sync writes both: `AGENTS.md` in the agent folder (Codex's cross-tool file) **and** `.agents/AGENTS.md` (Antigravity's rules file, its workspace customization root). Same source, different addressees.

**Set up:** right-click an agent → **Sync Agent with the Other Engines…**

- `CLAUDE.md` → `AGENTS.md` is produced (self-references adapted; a sync marker at the top of the file).
- `CLAUDE.md` (+ the shared constitution, see below) → `.agents/AGENTS.md`, the file Antigravity actually reads.
- Active standing duties → `.agents/workflows/` files (called in Antigravity as `/duty-name`).
- If there's a `.mcp.json` → an `.agents/mcp_config.suggested.json` suggestion (you merge it into the global gemini file by hand — Agent Farm never writes to `~/.gemini`) and `.agents/codex/mcp.suggested.toml` for Codex.

**The shared constitution.** When agents live in a *nest* — a root folder that holds the agent folders and has its own `CLAUDE.md` — that file is the constitution every agent loads. Claude Code loads a parent instruction file for free; the other engines do not, each in its own way:

- **Codex** gets it once the nest folder has an `AGENTS.md` of its own: the **⚖ Sync constitution button on the Dashboard** (3.40.0 — the command palette and the `constitution.sync` bridge op call the same command) mirrors it there, and Codex merges it on its walk down to whatever agent folder it is running in. One copy, no duplication — which is also why the agent's own `AGENTS.md` deliberately does **not** repeat it.
- **Antigravity** cannot be reached that way at all, so each agent's `.agents/AGENTS.md` carries the constitution **inline**, in a fenced `agent-farm:shared-constitution` block, ahead of the agent's own instructions.
- The constitution is **read, never written**: the reverse sync strips the fenced block before anything reaches an agent's `CLAUDE.md`, and no command writes the nest `CLAUDE.md`. When the constitution changes, Insights says which agents are still carrying the old text.

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

### Working With Other Engines — End to End

There are two deliberately different paths. **Claude Code · Codex · Gemini · Antigravity are first-class engines**; `agentFarm.cliProfiles` is the escape hatch for an arbitrary command Agent Farm does not understand. Do not add the four built-in engines to `cliProfiles`: choose them from the **Engine** box in Console, Start Session…, New Task, schedules/triggers, missions and teams. The first-class route carries the engine's real model and effort vocabulary, resume rules, transcript adapter and token accounting. A generic profile gets an archived stdout/stderr file and exit status — no invented transcript, price or live semantics.

**Set up and run a first-class engine.**

1. Open **Engines** and install/sign in to the CLI there; **⚡ Test** spends one read-only turn and records the engine's own verdict.
2. Run **Sync Agent with the Other Engines…** once for the agent. Codex reads `AGENTS.md`; Antigravity reads `.agents/AGENTS.md` and its generated workflows. The same sync keeps the shared constitution parallel.
3. Pick the engine where the work starts. `agentFarm.launchDefaults.engine` makes one the fleet default; an agent can remember its own model/effort default per engine.
4. Resume from **Console** when the engine's terminal CLI has no safe resume form. Codex and Gemini are per-turn engines; Claude is a persistent process; Antigravity is driven through its `agy` CLI when Agent Farm hosts it. The panel explains the difference instead of translating one engine's flags into another's.

The Antigravity desktop application is still a separate editor. The sync prepares its workspace files; the first-class `agy` integration is the CLI path Agent Farm can host. These are complementary, not two names for the same launch.

### Coverage and honest boundaries (3.120.0)

The session index intentionally has two halves. `all()` / `forAgent()` are the **Claude-shaped measurement set**; `allWithExternal()` / `forAgentWithExternal()` are the **complete log**. A record surface must list every engine. An analytic stays on the format it can actually measure and says what it excludes. Mixing the two would either hide conversations or average honest zeroes into figures that then look real.

| Surface / fact | Coverage |
| --- | --- |
| Sessions tables, the sidebar's per-agent session list and its header count, agent session log, Console resume/history, Text/Regex search, Live Timeline, Portfolio activity, dashboard session counts, the session shelf, the farm-status board's recent list, project session lists, task-run history and OTLP export | Every engine; rows carry an engine badge. OTLP writes `gen_ai.system`. |
| Turns — the table, a row's folded-open content and the Markdown export, plus the `turns.list` op | Claude and Codex have real per-turn rows; the table identifies the engine and every step behind it reads the same pool. |
| “Is this agent active right now” (sidebar dot, portfolio, dashboard card, status bar, `agents.list`) | Every engine. Liveness is a timestamp, which every engine's rows carry honestly. |
| Meaning search | Claude Code transcript index only; the mode and index status say how many other-engine sessions are outside it. |
| Cost/cache/context health, quality, skill/MCP/memory use and duty compliance | Claude Code transcript analytics. Fleet **and per-agent** findings, the Cost Anomaly Report and cost warnings state the exclusion instead of folding foreign sessions into a false average — one wording, from `claudeOnlyScopeNote`, carried as the finding's `scope` field so a surface can place it (the sidebar in the hover, the agent page once above its table). |
| Plan limits | Per engine: Claude's OAuth endpoint, Codex's recorded rate-limit block, and an explicit “not published / no plan” answer where nothing measurable exists. Missing never means 0%. |

The same rule reaches the awkward edges: rename survives rescans on every engine; Resume opens the recorded engine rather than handing a Codex id to Claude; “Open transcript” and “Copy transcript path” explain permanently unreadable Antigravity protobuf storage; `includeUnmatchedProjects` governs every engine; overlapping live-lane and transcript records deduplicate with the richer transcript winning.

**The sidebar has no separate path for a foreign row.** One builder draws every session row: the same right-click menu, the same viewer, and refusals that come from the engine's own facts — no working folder means not resumable, no readable transcript means the click explains why in that engine's words rather than opening an empty editor.

Codex usage is treated as the cumulative counter it is: each turn publishes the delta from the previous total, `reasoning_output_tokens` is already inside output, and the context gauge uses the window recorded by that rollout. Task runs are matched only to a session on the same engine. Claude can show API-equivalent dollars; a plan-billed engine shows the tokens it actually reported and never a misleading `$0.00`.

### Generic CLI profiles

For a CLI Agent Farm does not know — aider, opencode, an internal script — add a template:

```json
{"name": "aider", "headless": "aider --message \"{prompt}\"", "interactive": "aider"}
```

The profile is a command runner, not a fifth engine. It receives `{prompt}` / `{args}`, archives output and reports the exit code. If the CLI offers hooks, `cliHook.js` can mirror the lifecycle into Live Timeline; real session history requires a dedicated `SessionSource` adapter. Agent Farm never guesses a foreign log format.

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

**Per-agent default model (2.75.0, knowledge base 2.78.0):** every agent chip carries a **model** dropdown — the default model for that agent's sessions. The options come from **your model knowledge base** (`agentFarm.modelAliases`, default haiku/sonnet/opus/fable): when a new model name appears, add it there once and every picker offers it permanently. For anything not listed, the **custom…** entry opens a free-text input (Enter saves, Esc cancels); a full model id already written in the folder is preserved and listed too. The choice is written to the `model` key of the agent's `.claude/settings.local.json`; picking **CLI default** removes the key so claude's own default takes over. A full model id can be typed into the file by hand — the box displays it and never clobbers it. For new agents there is `agentFarm.newAgentModel` (default **sonnet**): every agent created via **New Agent** gets that model written into its `settings.local.json`; leave it empty to write none.

**Session launch defaults (3.24.0):** `agentFarm.launchDefaults` — the `model` · `effort` · `permissionMode` every interactive session carries (Start, Continue and Resume alike); an empty field emits no flag, so the default `{}` changes nothing. `agentFarm.launchProfiles` holds named setups ("deep review" = opus + xhigh + plan) and is what the **Start Session…** launcher lists. Both live in Farm Settings' **Core & Agents** section — see [Starting and Steering Sessions](#oturum-denetim).

**Machine-independent stores and paths (2.76.0):** the extension's persisted files (`farm-tasks.json`, `missions.json`, the task history archive) can travel between machines via git: on save, absolute machine paths are turned into `${claudeDir}` / `${globalStorage}` / `${home}` tokens, and on load the tokens expand to this machine's real roots. Foreign absolute paths in records written before the tokens (e.g. another machine's `C:\Users\<name>\.claude\...`) **heal themselves on load** — everything after the `.claude` / `globalStorage` marker is re-rooted onto this machine; only values that are entirely a path are healed, prose (prompts) is never touched. All folder settings (`agentRoots`, `claudeDir`, `extraClaudeDirs`, `codexHome`, `geminiDir`, `autoReportFolder`, `digestTtsFolder`, `ingestFolders`) also accept `%USERPROFILE%`, `${env:VAR}` and `~` — a git-synced settings.json needs no machine-specific paths.

**Claude Code (claude CLI) section (2.55.0):** the same page also edits **claude's own** `~/.claude/settings.json` — the file behind terminal tips like *"Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …"*. A curated, explained catalog covers the default model, permission default mode, co-authored-by, transcript retention (`cleanupPeriodDays` — bounds how far back Agent Farm's search and analytics can see), output style and the well-known env switches (PowerShell tool preview, thinking/output token caps, bash timeouts, auto-update/telemetry opt-outs). Clearing a value removes the key so Claude's own default takes over. Everything else is editable in the validated **raw JSON editor** below the catalog — broken JSON is never saved, and a one-time `.agentfarm-backup` copy is kept next to the file. Changes apply to **new** claude sessions.

### Reference table

| Setting | Default | What it does |
| --- | --- | --- |
| `agentFarm.guideLanguage` | en | Language for the in-app help (Guide, Quick Start, Examples): en / tr |
| `agentFarm.agentRoots` | `["D:/zone/agent/ajanlar"]` | The roots scanned for agent folders (see the Agent folders section) |
| `agentFarm.excludeAgentDirs` | [] | Folders never treated as agents, even when they look like one |
| `agentFarm.newAgentModel` | `sonnet` | Default model written into a New Agent's `settings.local.json` (empty = write none) |
| `agentFarm.modelAliases` | `[haiku, sonnet, opus, fable]` | Your model-name knowledge base: add a name once, every model picker offers it permanently (2.78.0) |
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
| `agentFarm.stuckThresholdSeconds` | 240 | Stall threshold; 0 = never mark a session stalled (U-158, 3.724.0 — Farm Settings "Stuck warning" group) |
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
| `agentFarm.agentRowCostUnit` | tokens | Daily-usage unit on each agent row in the Agents view: tokens / cost |
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
- **New Agent** — a new agent scaffold from a template (CLAUDE.md + memory + .claude). **‼️ And over the bridge too:** `agents.create` (name · mission · model · root — the mission is not decoration, it replaces the template's "describe this agent's identity" placeholder, and an agent made without one is a template nobody comes back to fill in) · `agents.roots` (the two lists it validates against, so a caller never guesses a folder or a model alias) · `agents.pack.import` (from an exported `.afpack` instead of the blank template). All three call the same write the fleet page calls.
- **Add Agent Root Folder** — add a new root folder
- **Start Claude Session / Continue Latest Session** — opens a terminal in the agent folder and starts `claude` (carrying `agentFarm.launchDefaults`, if set)
- **Start Session… (model · effort · permissions · first prompt)** `Ctrl+Alt+S` — the launcher; see [Starting and Steering Sessions](#oturum-denetim)
- **Quick Menu (everything, one key)** `Ctrl+Alt+F` — the grouped quick-access list; every row prints its own shortcut
- **Session Shelf… (pinned + recent)** `Ctrl+Alt+P` · **Pin / Unpin Session** · **Label Session…** — the shelf
- **Interrupt Session (send Esc)** `Ctrl+Alt+I` — stops the running turn without closing the session
- **Manage Projects… / Assign Agent to Project…** — the project axis ([Projects, Portfolio and Code Changes](#projeler-portfoy))
- **Open Agent Portfolio** — the fleet on one screen (**Agents** in the global nav)
- **Open Web View…** — the read-only, phone-friendly board ([Reaching the Farm from Outside](#disaridan-erisim))
- **Connect Telegram…** — message an agent from a chat, answer in the same thread
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
- **Open Backlog (the active project's standing pile of work)** — the project page, opened straight onto its Backlog tab. It follows the status bar: whatever project is active in this window is the one it opens, and it only asks when nothing is active — the answer then becomes the window's active project, so it is asked once rather than at every press
- **Open Turns (every turn across the farm)** — one row per user turn, farm-wide ([Turns Page](#turlar-sayfasi))
- **Open Wiki (candidate pool + the vault’s own pages)** — the pool and the vault side by side ([Wiki Cockpit](#wiki-kokpiti))
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
- **Sync Agent with the Other Engines…** — AGENTS.md + workflow generation and two-way diff sync
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

### 3.646.0 — 3.654.0 — OpenCode Startup Lock Race Recovery, Reasoning Variants, Wiki Category Merging, and Full Notice Queue Conversion (2026-09-23 — 2026-09-24)

- **OpenCode Startup Lock Race Retry (3.654.0):** Two OpenCode sessions starting in the same second no longer crash on SQLite first-use migrations (`CREATE TABLE ...` / `database is locked`). Runs failing with lock collisions are automatically retried once after 2s.
- **Persistent Inspection Panels Across Redraws (3.652.0 — 3.653.0):** Background task panels on the Console strip and Live Timeline hover panels no longer re-fade or flicker during 120ms redraw intervals; panels render solid immediately and lane tools open within 200ms.
- **Relay Leg Chip in Sessions List (3.651.0):** Session cards in the left rail display the `⑂ N` chip on their secondary line; hovering reveals chain ID, predecessors, successors, and chain brakes.
- **Search Shard Consistency (3.650.0):** Resolves a race condition where asynchronous deletion of stale search shards overwrote freshly rebuilt shards, ensuring deterministic search indexing.
- **Telegram Live Console Launcher Door (3.649.0):** `/new <agent> [prompt]` opens an interactive Console session directly from Telegram, streaming turn cards to the chat, supporting remote steering, and enforcing lifetime daily budgets (`maxDailyUSD`).
- **Wiki Category Renaming and Merge Engine (3.648.0):** Atomically updates the root directory, `index.md` heading, and candidate topics. Existing target names trigger collision-checked directory and index merges with provenance preservation.
- **OpenCode Reasoning Variants (3.647.0):** Exposes model-specific `--variant` levels (low, medium, high, etc.) on the New Task form, rejecting unsupported variants before launch.
- **Full Notice Conversion to Queue Item (3.646.0):** Preserves complete notice state (body, options, sections, report links, originating agent) when moving notices to the work queue (`▸ Original`).

### 3.633.0 — 3.645.0 — Background Task Waiting State (waiting-task), A2A Baton Cards, and Obsidian Syntax Protection (2026-09-22 — 2026-09-23)

- **Background Command Rest and Purple Status (3.644.0):** Turns waiting on in-flight background commands transition to `waiting-task` instead of yellow "YOUR TURN". Renders a purple border, a `BACKGROUND` badge with slow breathing animation (4.2s), and switches the composer to `Steer` mode without false chime alerts.
- **Baton Handovers on A2A Board and Board Hygiene (3.633.0 — 3.635.0):** Relays post handover cards to A2A; cards auto-resolve upon successor activation. Pinned cards are immune to sweeps, and finished chains clean up after 24 hours.
- **Console Status Strip Minimalism (3.632.0):** Refactors status indicators into quiet 6px dots (`.sigdot`) and compact action chips.
- **Obsidian Tasks Metadata Syntax Protection (3.630.0):** Restricts Tasks metadata icons (`📅`, `⏳`, `⛔`, `🆔`) to strictly consume valid tokens, preventing dateless or bare icons from stripping user title words.
- **A2A Supervisor Cockpit & Run Now (3.604.0):** Provides inline supervisor directives (`steer`, `veto`, `constraint`), agent re-routing, and one-click session launching via `Run Now`.

### 3.620.0 — 3.632.0 — Baton Relay, Markdown Export Suite, and Zero Parity Gap Guarantee (2026-09-21 — 2026-09-22)

- **Autonomous Baton Relay Engine (3.620.0):** Seamless session-to-session handover via `baton.pass`, spawning fresh successor legs without manual notes.
- **Interactive Relay Controls:** Composer `⑂ Relay` switch, New Task `⑂ Relay` checkbox, `⑂+ Attach relay` for live sessions, `⑂→ Pass now` manual trigger, and `✕⑂ Stop chain` emergency brake.
- **Four Safety Brakes:** Leg ceiling (`maxHops`), barren chain brake (halting on zero-commit repetitions), `EMERGENCY HANDOVER` crash recovery, and auto-closing resting Console cards.
- **Unified Markdown Export Suite (3.627.0 — 3.628.0):** `tasks.export`, `turns.export`, `tasks.analytics.export`, and `sessions.export` built over a shared table engine (`mdTable`).
- **Zero Parity Gap Budget (3.629.0):** All UI panel functions mirrored as bridge operations or explicit navigation exemptions; `gapBudget` locked at 0.

### 3.605.0 — 3.619.0 — Question Auto-Timer, Session Identity Resolution, and A2A Matching Engine (2026-09-21)

- **Question Auto-Timer Resolution (3.618.0):** Automatically resolves unattended `AskUserQuestion` prompts after a timeout (default 300s) using recommended options, blocking destructive prompts.
- **Evidence-Based Session Identity (`sessions.whoami` - 3.619.0):** Resolves caller identity from process registry hierarchy and environment variables rather than guessing from folders.
- **5-Axis A2A Coordinate Matching (3.603.0):** Evaluates tasks across project, role, subsystem, session, and requires dimensions with a 2-hour grace window.
- **Four-Tab Agent Inbox UI (3.603.0):** Unifies Notices, Work Queue, A2A Notes, and A2A Tasks in a shared card grammar.

### 3.586.0 — 3.604.0 — A2A Protocol, Supervisor Directives, and Telegram Cockpit (2026-09-20 — 2026-09-21)

- **A2A Protocol Core:** Decouples passive technical notes (`a2a.notes.*`) from claimed 30-minute leased tasks (`a2a.tasks.*`).
- **Human Supervisor Directive:** Outranks system instructions and task prompts; delivered as the first key in API responses.
- **Loop Guard:** Mechanically rejects a 3rd consecutive handoff, locking runaway tasks in `blocked` state.
- **Telegram Two-Way Remote Cockpit:** Enables mobile session routing, interactive question responses, approval gates, and zero-dependency local QR server (port 8378).

### 3.570.0 — 3.585.0 — Dedicated Accounts Page, Antigravity Quotas, and Unified Multi-Wall Charts (2026-09-19 — 2026-09-20)

- **Dedicated Accounts Page (3.583.0):** Separates account management into its own view (`agentfarm.openAccounts`) sharing a unified handler.
- **Antigravity Quota Ingestion (3.580.0):** Pulls live quota metrics directly from the `/usage` endpoint.
- **Unified Multi-Wall Quota Charts (3.572.0):** Combines 5-hour and 7-day usage limits into unified visualizations.
- **Handover Account Preference (3.570.0):** Prompts user choice for quota-exhausted continuations.

### 3.548.0 — 3.569.0 — Multi-Provider Route Architecture, Model Context Ceilings, and Security Boundaries (2026-09-18 — 2026-09-19)

- **Provider Isolation and Mixed Cost Tracking:** Segregates billing windows across Kimi, MiniMax, and Claude, explicitly tagging mixed financial totals.
- **Dynamic Context Ceiling Discovery (3.564.0 — 3.566.0):** Reads and visualizes model-published context ceilings on Console cards.
- **Fixed Height Session Cards (3.553.0):** Eliminates layout shifts during live streaming.
- **Route Filtering (3.569.0):** Filters session lists by provider routes alongside engine filters.

### 3.532.0 — 3.547.0 — Bridge Search Interceptor, Live Context Discipline, and Handover Continuation (2026-09-17 — 2026-09-18)

- **Bridge Search Guard (`bridgeGuard` - 3.541.0 — 3.542.0):** Intercepts disk-based session ID searches, routing callers to bridge operations with an `af:allow-id` bypass.
- **Live Context & Quota Whispering (3.538.0 — 3.540.0):** Injects live `CONVERGE` (35%) and `HANDOVER` (40% context / 90% quota) signals, enforcing clean restarts for limit-exhausted runs.
- **Continue from Handover (3.544.0):** Opens a pre-seeded composer session directly from a handover note (`↪`).
- **Normalized Transcript Reader (`sessions.read` - 3.536.0):** Bridges transcript access across all AI engines into canonical role schemas.
- **Decoupled Quota Polling (3.532.0):** Backgrounds quota synchronization on independent per-account intervals.

### 3.531.0 — X-324 / X-106: Strategy Selector for Smart Account Policies (Chain vs. Emptiest Pool) and Launch Dimensions on Console Tasks (2026-09-17)

- **Strategy Selector on Account Policies (X-324):** Added `strategy: 'chain' | 'emptiest'` to user-defined account policies. Previously, policies evaluated steps strictly in order (`chain`), meaning load could not distribute across multiple accounts until the first hit a wall. In `emptiest` mode, the listed accounts form an isolated pool compared at launch against live quota readings (`roomOrder`), spawning on the account with the most available room.
- **Shape Lock for Rules (X-324):** A rule containing another rule as a step cannot be reduced to a single quota figure; the system automatically locks such policies to `chain` mode, disabling the `emptiest` selector on the Engines page with an informative tooltip.
- **Dimension Preservation on Console Tasks (X-106):** Tasks launched into the Console (`interactiveTarget: 'console'`) now carry their full `RunDimensions` matrix via `runExtras(task)`, ensuring `providerId`, `tier`, `account` (resolved once via `launchAccountFor`), and `superpowers` are preserved at the door.

### 3.529.0 — 3.530.0 — X-309 / X-321 / X-322 / X-323: Sentry Fire Drill Findings, Pre-Allocated Session IDs, and Warning Types (2026-09-17)

- **Pre-Allocated Session IDs (X-321):** Fresh headless Claude runs are spawned with `--session-id <uuid>`, allowing immediate transcript resolution without ambiguous 120-second timestamp bindings across back-to-back rounds.
- **Handover Note Discrimination (X-322):** Files authored by a session are not adopted as handover notes unless they match explicit handover naming conventions, preventing unrelated notes from cluttering prompt contexts.
- **CLI Item Check Command Injection (X-323):** Sentry rounds are injected with the exact shell command (`node <af.js> projects.backlog.check ...`) to close backlog items, preventing agents from hallucinating missing MCP tools.
- **Notice Type Correction (X-309):** Sentry failure brake and leader stop notifications now publish as legitimate `warning` notices rather than loose 'alert' strings.

### 3.524.0 — 3.528.0 — X-309 / X-312 / X-318 / X-319 / X-320: Sentry Drills, First-Round Item Injection, and Weekly Quota Ceiling (2026-09-16)

- **First-Round Item Injection (X-320):** Opening prompts across all campaign paths automatically receive the backlog item code and description via `withItemLine`, eliminating blind first rounds.
- **Task Transfer after Empty Rounds (X-319):** If a previous round terminates without progress, the subsequent round is supplied with the original item specification rather than a blind resume prompt.
- **Sentry Retry Pool Boundary (X-312):** Automatic retries for sentry rounds are strictly confined to the campaign's account rotation whitelist.
- **Binding Weekly Quota Bar (X-309):** The sentry pool enforces the 7-day weekly quota limit (`seven_day`) alongside the 5-hour rolling window, preventing exhausted accounts from being selected.

### 3.520.0 — 3.523.0 — X-305: Smart Account Selection Policies, Engine UI Editor, and Bridge Operations (2026-09-15 — 2026-09-16)

- **Smart Account Policies Core:** Introduced user-configurable account selection rules (`agentFarm.accountPolicies`) alongside system rules (`@standing`, `@emptiest`, `@round-robin`).
- **Launch-Time Quota Resolution (`launchAccountFor`):** Rules resolve dynamically at spawn time against real-time quota probe readings.
- **Engines View Rule Editor:** Added an interactive Account Policies section on the Engines page with visual rule cards, drag-and-drop step reordering, and instant test simulation.
- **Bridge Integration:** Added `policies.list`, `policies.save`, `policies.delete`, and `policies.test` IPC operations.

### 3.513.0 — 3.517.0 — X-152: Composer Architectural Simplification and Host-Record Model (2026-09-15)

- **Host-Record Architecture:** Centralized composer intent and state in the Extension Host, transforming the webview into a pure view.
- **IPC Traffic Optimization:** Eliminated 16+ piecemeal UI sync messages in favor of a single unified state broadcast, eliminating UI desynchronization.

### 3.510.0 — 3.512.0 — X-180 / K-40: Saved Setups, One-Click Launch, and Default Dialog Mode (2026-09-14 — 2026-09-15)

- **Saved Setups Menu (X-180):** `Start Session…` opens directly onto user-defined Saved Setups for instant one-click session creation.
- **Default Dialog Mode (K-40):** Console cards default to Dialog view, with per-session filter preferences stored in host state.

### 3.500.0 — 3.509.0 — S-60 / S-62 / U-136 / X-307 / X-252 / X-258: Stop Safety, Responsive Layout, and Account Analytics (2026-09-14)

- **Background Process Tracking on Stop (S-62):** Interrupting a turn halts detached shell subprocesses, preventing orphaned notifications from triggering unintended turns.
- **Responsive Shorthand Layout (U-136):** Composer controls adapt gracefully to narrow sidebars using shorthand labels without layout clipping.
- **Account Cost Analytics (X-252):** Account cards display monthly and per-session token usage and USD cost breakdowns.
- **Live Account Occupancy (X-258):** Account cards show live running agent and queued turn indicators.
- **Antigravity Permission Guard (S-60):** Unsupported permission modes are filtered out for the Antigravity engine.

### 3.460.0 — 3.499.0 — X-301 / X-302 / X-277 / S-53 / X-296 / S-63 / S-59 / X-268: Pool Leadership, Process Isolation, and Resilience (2026-09-13 — 2026-09-14)

- **Sentry Leader Quota Reservation (X-302):** Dedicated quota allocation and execution guarantees for campaign leader turns.
- **Fleet-Wide Command History (X-277):** Unified terminal command history across the fleet.
- **Self-Healing Slot Maintenance (X-301):** Background maintenance automatically detects and repairs corrupted account slots.
- **Active Turn Duration Calculation (S-53):** Session metrics measure actual turn compute duration rather than open wall-clock time.
- **429 Rate-Limit Exponential Backoff (S-63 / X-278):** Intelligent backoff handling when hitting API rate limits.
- **Orphan Process Cleanup (S-59):** Detection and graceful termination of orphaned background CLI processes.
- **Bridge Request Pre-Claiming (X-268):** IPC requests are claimed synchronously on disk before execution to prevent race conditions.

### 3.412.0 — 3.459.0 — X-230 / X-232 / X-217 / X-218 / X-226 / X-228 / X-229: Self-Restart Bridge, Console Revive, and Launch Dimensions (2026-09-06 — 2026-09-13)

- **Self-Restart Bridge (X-230):** Extension host restart automation via `farm.health`, `farm.restartExtensionHost`, and `farm.reloadWindow`.
- **Console Session Revive (X-232):** Active Console sessions survive extension host restarts via serialized transcript replay.
- **Standing Account Radio Chips (X-217):** Replaced toggle switches on account cards with clear `🟢 standing` and `⚡ Use this one` chips.
- **Unified Account Refresh (X-218):** Single button to refresh all account quotas across all engines.
- **Workflow Step Launch Dimensions (X-228):** Step cards support engine, model, effort, permissions, route, and tier dimensions.
- **Multi-Round Dimension Inheritance (X-229):** Second and subsequent session rounds reliably inherit accounts and dimensions.

### 3.411.0 — X-218 — one press for every account, and the two costs under it (2026-09-06)

- Every engine already had its own group-wide read; what was missing was the press above them — all of them, whichever engine. The item's warning is the whole design: the two halves do not cost the same thing. A Claude figure is a REQUEST against a budget the whole fleet shares (five seconds apart, and a 429 pulls every account back); a Codex figure is a file under that account's own folder. One button that paced the file reads behind the requests would make the free half wait for nothing, and one that paced nothing would spend the budget the line exists to protect.
- **No new rule was written to keep them apart, because the split is already:** **there.** `queueAccountRefresh` reads a slot whose figure is on disk here and now and never puts it in the line (X-215). So the button hands every readable slot of every engine to the function that already knows the difference — `data-acrefreshall=""`, which means on this side exactly what `refreshableSlots('')` already means on the other — and spends its sentence saying which half of the press waits and which half does not.
- **The line is drawn moving:** A card knows its own place (X-206); the section knows how much of the line is left, so while it runs the button reads `◍ 3 in the line` and its panel opens with `3 in the line — 1 being read, 2 still waiting`. A press that acts over half a minute with nothing changing is one nobody presses once and everybody presses five times.
- **And it is not drawn where it would be the button below it, twice:** With a single engine on this machine, "all engines" and "all Claude Code accounts" are the same press, and a control whose only distinction is its position is furniture — the group button already reads every account there is.

### 3.410.0 — X-232 — the console sessions that survive the restart (2026-09-06)

- X-230 had measured the loss and drawn the only conclusion available then: a Console card's handle lives in the extension host's memory, so a restart loses every live one — therefore wait for the window to go quiet, or `force` and lose the conversation. This is the third way.
- `farm.restartExtensionHost { resume: true }` writes what is running into the stamp the cooldown already lives in — the same synchronous write, for the same reason: it has to survive the death it is about. On the other side every row is started again by the id its engine gave it, in its own seat, with its scrollback read back from the transcript and what it already spent restored.
- **And a resume changes the decision, not just the aftermath:** A session that will be taken up again was never a reason to wait, so it stops being a blocker and the restart happens at once. A session the engine never NAMED still is one: there is nothing to resume it by, so it is reported as lost rather than quietly dropped — the reader saw a card there. A terminal is never saved by any of this, so a window reload still waits for the terminals.
- **Two refusals to fake anything:** The row that travels is DERIVED from `RunDimensions` — add a dimension there and the build fails until a revived session carries it too, because a session brought back on another account or route is not that session, it is a new one wearing its transcript. And a session killed MID-TURN says so in its own first line: the transcript has what was said, nothing has what was being said, and a reader who is not told waits for a reply nobody is writing.

### 3.409.0 — X-217 — the account cards stop drawing a promise the code refuses to keep (2026-09-06)

- **It could not, and never could: `normalizeActive` has always enforced one standing account per engine:** So turning a second switch on turned the first one off by itself — which is not what a switch means anywhere else in this product, or anywhere else at all. The control was drawing an arithmetic the code does not have.
- A single selection is now drawn as one: the standing account wears a STATE badge (`🟢 standing`) and every other card carries an ACTION chip (`⚡ Use this one`). Both are the same class in two states, both announce themselves as `role="radio"` with exactly one `aria-checked="true"` — so the shape says "one of these is chosen" to a reader looking at pixels and to one that never will.
- Pressing the badge is still the way back to the main sign-in, which is the one gesture with no card of its own: the main sign-in is the ABSENCE of a slot, and a page that can enter a state it cannot leave is a trap.
- **ONE SUBJECT: the head pill that also said `standing` is gone:** The fact is drawn once, by the control that owns it — two drawings of one fact are two things that can disagree.

### 3.408.0 — X-230 — the farm can load its own new build (2026-09-06)

- It could not, and the developer rule said so in writing: *"the user only restarts VS Code."* At the desk that is friction. During an unattended night it is a deadlock — the loop stops until a human comes back to press Reload Window, and the one repository where that happens is this one.
- Three ops — `farm.health`, `farm.restartExtensionHost`, `farm.reloadWindow` — over one core the rule actually lives in (`core/selfRestart.ts`). Two things it refuses to do, both measured rather than assumed:
- **It never restarts inside the handler:** `processBridge` claims a request off the disk before dispatching it (X-268) and writes the response only after the handler returns — a handler that killed the host inside itself would therefore die with no answer ever written and its caller told nothing. The command is fired on a timer, inside the gap the response is written in, and a cooldown stamp written synchronously to disk refuses a second restart within 20 seconds. `force` does not open that guard: force is about sessions, the loop is about the bridge.
- **And it never destroys work silently:** A Console session is a spawned child whose handle lives in the extension host's memory, so a host restart loses every live one of them; an integrated terminal belongs to the window and survives — which is exactly why an agent working in a terminal can restart the host under itself and live to verify the result. So the default (`when: "auto"`) ARMS the restart and fires it by itself once the last session ends, and says in the same answer what it is waiting for.

### 3.407.0 — X-216 — the standing account the indicator did not follow (2026-09-06)

- **X-212 wired exactly one half of that:** `usageCredentialsFile` and `usageAccountLabel` follow `activeAccounts['claude']`; the Codex side of `usageProbe` went on reading a FIXED root — the `agentFarm.codexHome` setting, or this machine's own `~/.codex`. So making a Codex account standing renamed the heading over the figure and changed nothing underneath it. That is the worst shape a control can have: it looks like it worked.
- The root is now the standing slot's own folder, derived by `slotSessionDir` — the same function the account cards read a slot's figure with (X-215), so the indicator and the card can never point at two different folders. Nothing standing is the ordinary answer and is unchanged: the setting, then `~/.codex`.
- The repaint half turned out to be right already, and is pinned by a test so it stays that way: both surfaces are repainted before any engine-specific branch, and the engine matrix behind them is read live — so for an engine whose figures are files, a repaint IS the new reading. The Claude-only branch below it buys a fresh ENDPOINT read, which is the one thing that is Claude's alone.

### 3.406.0 — X-215 — the sentence that kept the Codex cards blank (2026-09-06)

- The user found this by comparing two surfaces of one product: *"the status bar says week 72% for Codex — why is that not on the account cards?"* The cards were not missing a feature. They were being told, in a stamped sentence, that there was nothing to read:
- ``` quotaSource: () => ({ kind: 'none', reason: 'Codex keeps no readable quota figure on disk' }) ```
- ‼️ **That sentence was false, and a wrong reason is worse than a blank bar because it closes the question.** `core/engineUsage.ts` has read `rate_limits.primary` out of the tail of the newest rollout since U-27 — it is where the status bar's "week 72%" comes from. `accountUsage.ts` read the stamp, not the world, and dropped every Codex slot from the list of things it could read.
- `QuotaSource` has a third branch now — `session-tail`, the engine's own transcripts under **the slot's own directory**, which is what makes the answer per account rather than per machine. One parser serves both roots: the status bar asks `readCodexUsage` for the machine's `~/.codex/sessions`, a card asks the same function for its own folder, and a second copy is how the two would come to disagree about one week.

### 3.405.0 — X-226 — the run that slept until 07:50 while three accounts sat at 4% (2026-09-06)

- The X-211 family promised one thing: *when the quota runs out mid-work, change account and carry on.* It was built into the Console window (X-213) — the surface that needs it **least**, because a person is sitting in front of it and can move the card by hand. The surface that needs it most had none of it: a headless run at 03:00 meets a usage limit, `retryDecision` reads **one** plan's reset (M-10) and parks the retry until that window reopens. Three signed-in accounts can sit at 4% for four hours while the work sleeps.
- **‼️ And the commonest case is worse than the documented one:** `resetAware` ships **off**, so an unconfigured run does not wait for a window at all — it waits its policy's forty minutes, on a plan that is walled for four hours, and fails again. Six times. There was never a reset to be aware of; there was another account.
- `carryOnAccount` (`core/accountUsage.ts`) answers the one question the Console answers with a person: **which sign-in should carry this work on.** It does not decide *which* — `pickAccount` does, X-207's own answer to whose turn it is, because a second rotation rule is how the campaign and the queue come to disagree about the same night. What it adds is who may be asked at all, and it refuses more often than it agrees:
- * never the account that just refused the work, whatever its last read says — the refusal is fresher than the figure; * never another engine. The sentry may cross engines because it opens a NEW round; a carried-on run resumes a transcript, and a transcript belongs to one CLI; * never out of an empty pool — the absence of a slot is the main sign-in (X-172), and it cannot be asked how much room it has; * never a run pinned to `@machine`. *"Nothing is injected"* is an instruction the user typed into the form, and a handover would inject one; * never for a failure that was not a limit. A broken script breaks the same way on every sign-in, and moving it spends a second plan to prove it.

### 3.404.0 — X-225 — the mission that was not allowed to say whose plan it spends (2026-09-06)

- `missionDoor` declared the account **exempt**, with the reason written on the door: *"a mission runs for HOURS across rounds and its delegates spawn one at a time. An account frozen into the mission would pin round nine to a plan that round two exhausted."* The risk is real. Refusing the dimension is not an answer to it — it is the decision taken away from the person who owns the plans, on the one surface that runs longest, while the model, the effort and the permission mode beside it were overridable both mission-wide and per member all along.
- **‼️ And the exemption bought nothing it promised:** It ended *"each delegate run resolves the account at its own spawn, from the one place that holds it."* Measured: the delegate was queued as a task with **no account on it at all**, and `missionPlannerCallOnce` — the call that carries a mission from round to round — spawned with **no `env` whatsoever**, so the planner ran as whatever the VS Code window happened to be holding. Neither half of that sentence described any code.
- Two axes now, because they are two questions:
- * **`account`** — whose plan every delegation is billed to, on exactly the axis `engine` is; a member overrides it with its own. The ladder is member → mission → **nothing**, and the floor is deliberate: there is no per-agent and no fleet rung, because `activeAccounts` is not a default to fall through to, it is what the spawn resolves when nothing was stated. Nothing stated leaves every mission behaving exactly as it did. * **`plannerAccount`** — whose plan the orchestrator itself spends. One headless `claude` in the lead's folder, called once per round for the life of the run. A long mission whose planner and whose workers share one sign-in is precisely the run that stops in the middle.

### 3.403.0 — X-228 — the step card that could not say what runs it (2026-09-06)

- A workflow step card asked six questions — what the step IS, its title, its agent, its prompt, its mode and (since X-224) whose sign-in pays — and drew **no launch box at all.** No engine, no model, no effort, no permissions, no route.
- **The measurement is what makes it a defect rather than a gap: the host was ready in BOTH directions:** `stepSeed` published `sengine`/`smodel`/`seffort`/ `spermissionMode`, `stepFromDraft` read them back, `WorkflowStep extends RunDimensions`, and `runExtras(step)` carried every one of them to the run. The data model, the persistence and the run path were all in place; there was nowhere to SAY it. So every step of every chain built on this page fell to the fleet default, and a value written through the bridge was invisible on the one page that edits it — surviving the round trip only because `readStep` writes back the keys it names and leaves the rest alone. An invisible setting is worse than a missing one.
- The route was not even seeded, so a step could be pointed at an endpoint from the bridge and from nowhere else. It is seeded now (`sproviderId`/`stier`), and a tier with no route under it is dropped — the same refusal `runExtras` makes one layer down, because `opus` is a different model on every route.
- **‼️ And the rows are BUILT ONCE:** The engine picker, the permission paragraph and the route/tier pair used to be written out inside the task form, which is exactly where a second surface would have copied them from — X-149's four copies of one narrowing rule, one screen over. `ntEngineRow` / `ntPermTip` / `ntRouteRows` are shared now, and the step narrows through `stepNarrow`, which VIEWS the step as a run and asks `media/afLaunch.js` and the form's own `ntNarrowRoute` / `ntNarrowAccount`. Moving a step onto another engine drops the model, the effort, the route, the tier and the sign-in that engine cannot take.

### 3.402.1 — X-229 — round two answered the conversation as somebody else (2026-09-06)

- Found while fixing X-227, one screen away from it: the **third** hand-copied dimension list in `core/tasks.ts`. The one that queues the next round of a multi-round task carried thirteen fields and dropped five — **account, providerId, tier, finishSound, superpowers.**
- **This is worse than X-227, and the reason is two lines further down in the same literal:** A round is not a new run: it is a REPLY, and it goes back into the same conversation by `resumeSessionId`. So round two `--resume`d a transcript on a sign-in that had never seen it — the mid-run drift the whole X-211 family was built to end, arriving through the front door of the feature that produces the longest runs in the product. The route mattered too: with it dropped, the second half of a chain spoke to a different model behind the same word.
- Fixed the way X-227 was: `runExtras` is the ONE carrier of `RunDimensions`, and this literal now goes through it, with the round's own fields written after so they still win — `rounds` here is what is LEFT to say, not what the task started with. Measured in `test_retry.js` against `RunDimensions` read out of the source, in a second region beside X-227's; both named their missing fields out loud before the fix.
- **Three lists, three readings, one carrier:** If a fourth appears, the test that found this one is the shape to copy.

### 3.402.0 — X-227/X-224 — the retry nobody is watching, and the chain that ate one plan (2026-09-06)

- **X-227 — the unattended retry was dropping seven dimensions, and this one was found by reading rather than reported:** There are two retries in the product. `retryTask`, the one a person presses, carries every dimension of the original across by hand and says why beside each: *"a retry that quietly moved to the agent's standing endpoint is a different run wearing the same name."* `maybeScheduleRetry` — the one that fires BY ITSELF when a run fails, typically at 03:00, with nobody at a window — had its own shorter hand-written list.
- Measured against `RunDimensions`, it was dropping **account, providerId, tier, finishSound, superpowers, interactiveTarget and interactiveClose.** Each has its own cost, and the first is the worst: `retryDecision` reads the engine's published reset time and WAITS for one plan's window to reopen (M-10) — and then the run went to whichever account happened to be standing. The wait and the run disagreeing about whose window was being waited for. The route was next: the same word names a different model on two of them, so the run that finally succeeded was not necessarily the run that had been asked for. And the finish sound, on the one path whose whole justification is that nobody is watching it.
- **The fix is not a longer list — a longer list is the same bug with a later date:** `runExtras` already exists as the ONE carrier of `RunDimensions`, and a schedule, a trigger, a template and a workflow step all travel through it. This retry now does too, with the retry's own fields written after it so they still win. The rule is measured in `test_retry.js`, derived from `RunDimensions` in the source: when it was written it named all seven out loud.
- **X-224 — a workflow step can be billed to its own sign-in:** A chain is the shape that needs this most: every step is headless, so three steps on one plan eat it and the chain hits the wall in the middle with nobody in front of it. `WorkflowStep extends RunDimensions` and `runExtras(step)` has always carried the account to the run — the step's two readings and its card were the only places that could not say it. `stepSeed` now returns it, `stepFromDraft` reads it, and the card asks for it with the same `[machine global]` row the task form got in 3.401.0. The fixture `tasks-step-account` draws the card that holds it, in both themes, because a card nobody photographs is a layout nobody checked.

### 3.401.0 — X-221/X-222/X-223 — the Tasks form had an account box that went nowhere (2026-09-06)

- An audit of the X-167 and X-211 families — asked for because the user remembered functions being discussed that they could no longer find — turned up a closed item whose wire was never connected.
- **X-169 put an account box on the Tasks form, seeded it, tested it against mock launch doors, and closed:** The box drew. The page posted the value. And `src/panels/tasksPanel.ts` never read the field: `task-new` carried nine dimensions to `addTask` and not that one, the retry branch carried eleven and not that one, and `dims()` — the automation path, the one that matters most because a schedule fires at 03:00 with nobody at a window — collected fifteen and not that one. Measured before the fix: the word `account` appeared **four times** in a 2,400-line panel, and none of the four was a wire.
- So every task written from that page for four months ran on whichever sign-in happened to be standing, silently billed a plan nobody named, and offered the box back the next time the form was opened. `scheduleSeed` and `triggerSeed` did not read it back either, so editing a saved automation's *time* wrote the emptiness over an account somebody had chosen on purpose.
- **The measurement that could not see it, and the one that now can:** The existing sweep (`test_task_seed.js`) pins one direction: every `RunDimensions` field comes back OUT of a stored task and into the form. The mirror was never stated — a dimension the form is SEEDED with is a dimension the form can be SAVED with — so a box could be alive, carry a value, and be dropped one line before the store with every test green. That return leg is now measured on all five readings (three save paths, two automation seeds), derived from `RunDimensions` in the source, so the next dimension somebody draws a box for fails until its wire is connected. When it was written it went red on exactly one name: `account`.

### 3.400.2 — the Codex account card said something that was not true (2026-09-06)

- The Codex adapter answered, whenever anybody asked why its account cards show no quota: *"Codex keeps no readable quota figure on disk — its plan limits are only visible inside the CLI itself."*
- **That is false, and it has been false since U-27:** `core/engineUsage.ts` reads the figure off the tail of the newest rollout under `sessions/` (`rate_limits.primary.used_percent`, `window_minutes`) and the status bar and the Dashboard have been drawing it — "week 72%" — the entire time. The user found it by comparing two surfaces of the same product and asking why one of them knew something the other said was unknowable.
- **A stated reason is a claim about the world, and a wrong one is worse than a blank bar: it closes the question:** The `kind` stays `none`, because the account cards genuinely are not wired to that reader yet — that is X-215, opened for it — but the sentence now says which of those two things is true, so the next person to read it is pointed at the work instead of away from it.
- **No behaviour changed:** This is the half of the fix that can be shipped honestly on its own; the plumbing needs the read path in `AccountUsageService` to grow a branch that does NOT go through the shared network budget (a figure read from disk must not wait behind a 5-second floor meant for an endpoint), and that is not a change to make halfway.

### 3.400.1 — X-203 — the Engines button vanished exactly when the page became worth opening (2026-09-06)

- The user's report: *"Dashboard/Engines satırı sonunda buton var demiştin ama yok."* They were right, and the reason is a one-branch mistake with a general lesson in it.
- `farmstatus.ts` put the `Engines` action on the **dormant** branch only — the branch that means "only Claude Code is ready here". The moment a second engine was installed, or any foreign session existed on disk, the row became `ready` or `active` and drew no button at all. So the door was offered to the machine with nothing to look at and withdrawn from the machine with four engines and 35 sessions.
- **A row's action is a way to the SUBJECT of the row, not a fix-it prompt for a subsystem nobody switched on:** The action is now on the row in every state, under one label, because it is one door.
- And the reason it survived a page anybody could have screenshotted: the dashboard fixture carried `farmStatus: []`, so the card was never drawn in any render. It is now built through the REAL `buildFarmStatus` — the same rule the missions fixture follows for its conditions — describing a machine in the ACTIVE state, which is precisely the state the button used to disappear in. A fixture that types its own rows photographs a card the code cannot produce.

### 3.400.0 — X-207 — the accounts a campaign is ALLOWED to spend, and the engine it falls back to (2026-09-06)

- The user's own complaint, and it had two halves: *"nöbet sistemi limiti boş olan herhangi bir hesaba motor gözetmeden mi atlıyor? … kullanıcının izin verdiği hesaplar arasında rotasyon yapmalı, izinsiz hesaba dokunmamalı"* — and then *"peki kullanıcı şu motordan 3 hesap bu motordan 2 hesap seçip toplam 5'i arasında rotasyon isterse?"*
- **Neither was expressible:** The pool was every account of the campaign's engine, built in one line of `sentryTick`, and there was nowhere in the record, the form or the bridge that even held the IDEA of permission. A sentry left running all night on the account somebody was keeping for their own work was not a bug you could point at.
- - **‼️ THE POOL IS A WHITELIST, IN THE ORDER IT WAS PICKED.** `pool` on the campaign names the accounts it may spend; with one, nothing else on the machine is touched, whatever room it has. **Absent is the old answer and stays the old answer** — every record already on disk plans identically to the day it was written, which is why "no pool" is a distinct value rather than an empty list somebody has to interpret. The order is the priority, so no second field states it: two fields for one question disagree the first time one is reordered. - **‼️ AND IT MAY CROSS ENGINES.** Three Claude sign-ins and two Codex ones are ONE pool of five. `rotation` picks how it is walked: **free** (the default, and what every campaign did before) takes the most room anywhere in the pool; **tiered** keeps to one engine — the campaign's own first, then the pool's own order — and crosses only when EVERY account of the current one is at or above the ceiling. That is the fallback the item exists for: the night used to end in a sleep while a signed-in Codex account sat idle. Every tier walled still sleeps, and it wakes at the earliest reset in the WHOLE pool, which is sooner than one engine's. - **‼️ THE ROUND OPENS ON THE CHOSEN ACCOUNT'S ENGINE.** The round spec took `campaign.engine` unconditionally, which was right for exactly as long as a pool could hold one engine. Let it cross and that same line opens a Claude session pointed at a Codex sign-in — a round that dies looking like a broken account. **And the campaign's model is dropped when the engine changes**, because a model name belongs to an engine: `opus` means nothing to Codex, and carrying it would turn a working fallback into a round that fails on its first line. - **‼️ AN ACCOUNT THAT IS NOT CAPTURED IS REFUSED AT 21:00, BY NAME** — rather than skipped every round and found as "no usable account" at 03:00. And one FORGOTTEN while the campaign runs is news, not a gap: the strip names it, and a pool that has lost all of them BLOCKS (`pool-empty`) rather than falling back to every account — falling back would spend exactly the sign-ins the user fenced off, which is the one thing this item exists to prevent. - **The form got the control the idea needs.** Every captured account, grouped by engine, each carrying the room it has right now — because the figure is already measured and sending the reader to the Engines page to look it up, in order to come back and tick a box, is a click DENSITY says must not be charged. The tick ORDER is drawn (1. 2. 3.), since it is a real input to the tiered walk and an input nobody can see is not an input. MIRROR on both fields: empty says what will happen instead. The running campaign's strip trades "rotates claude accounts" for the count, the engines and the strategy, with the list and the rooms in its panel. - **Bridge, same commit:** `sentry.start` takes `pool` (array or comma string) and `rotation`; `sentry.status` answers `pool`, `rotation` and `poolMissing` — the last being the only place "a pool of five running on three" can be explained.
- Written design first, as the item itself demanded: `10_Notes/A-PLN - Nöbet Hesap Rotasyon Havuzu ve Çok Motorlu Yedekleme - X-207 - 260906.md`.

### 3.399.4 — the extension could not be switched on, and no test could see it (2026-09-06)

- **‼️ 3.399.0 through 3.399.3 DO NOT ACTIVATE:** Not a broken page — no pages. `activate()` threw on its first surface and every command in the product answered "command not found":
- ``` ReferenceError: Cannot access 'storedAccounts' before initialization at usageAccountLabel (extension.js) at PlanUsageBar.heading → tooltip → paint → new PlanUsageBar at activate (extension.js) ```
- **The root cause is one of position, and one line long:** X-212 (3.399.0) gave the status bar the words for WHOSE plan it is showing — `usageAccountLabel`, declared beside the indicator it serves and reading `storedAccounts` out of the accounts block 470 lines further down. Ordinarily that is fine: a closure is allowed to name a `const` declared after it, because by the time anybody calls it the declaration has run. `PlanUsageBar` is the case where nobody waits — it paints inside its own constructor, so the very first thing that happens after `new` is a call back into a binding still in its temporal dead zone. The two readers are declared at the top of `activate()` now, with the rule written where they sit: **anything constructed during activation may call its dependencies before its constructor returns, so a reader handed to one is declared first.**
- **‼️ AND THE PART THAT MATTERS MORE — 18 972 assertions could not see it:** The suite was green, the vsix verified 16/16, the package installed, and the product was dead. Every file in `test/` tested a piece; not one had ever called `activate()`. Being able to switch the extension on is the precondition of everything the other assertions describe, and it was the one claim nothing checked — a rule that fails silently is not a rule.

### 3.399.3 — X-196 (part 2): the hover that repeated the row (2026-09-06)

- The Settings page's sentry section came through the audit clean — every path row already shows what its variables resolve to, every box holds its own value, and no description is cut. One thing on the same page did not: a declared object's field description is drawn on an ellipsised line, so a hover is right — but it was a native `title` carrying the IDENTICAL string. That is the exact complaint the panel component was built for: the platform tooltip repeats what is already on the row and then stops wherever it feels like stopping. The cut line is the SHORTHAND now and the panel is the sentence, whole and scrollable. The wrapper takes the row's sizing, because wrapping a line makes the wrapper the flex child and a column sized by the line's own rule silently stops being sized.

### 3.399.2 — X-196 (part 1): the sweep reaches the sentry block and the account cards (2026-09-06)

- The user's own instruction behind the item: read the finished backlog, see what we have complained about, and take the interface out of it. Three of those complaints were still true of this family's own surfaces.
- - **‼️ A SHORTHAND WORD WITH NOTHING BEHIND IT.** Six state words came out of the sentry chip — OFF · PAUSED · STOPPED · RUNNING · SLEEPING · WAITING — and not one had a panel. WAITING and SLEEPING are the same picture to a reader who does not already know that one is between rounds and the other is sitting out a quota wall; BLOCKED said nothing about what was blocking it. Each now opens with its long form and then the campaign's own figures — what it works through, as whom, how many rounds, the last decision and when, and for SLEEPING the clock that is the whole difference. - **‼️ PROSE IN A NATIVE `title`.** Five labels on the campaign form carried two and three sentences inside a platform tooltip: cut at a length nobody controls, unscrollable, and gone the moment the pointer reaches for it. They are AFTips now. **And MIRROR:** Ceiling %, Safety min and Failure brake are empty BY DESIGN and empty means "the setting decides" — so each panel opens with the figure in force and where it comes from, because an unset ceiling and a ceiling typed at the same number are not the same answer. - **A thin cell is a bug, and an undefined column is one too.** Status, Opened and Took had no `<th>` definition at all; Took drew `20m` and nothing else. The columns are defined once, on their headers, and the cell carries the figures the row already implies — opened, ended, took, status. A round still on the board says so rather than drawing a figure that is stale as it is painted. - **‼️ THE BLOCK THE ACCOUNT CARD IS FOR HAD NO PANEL.** A bar, a percentage and one line about the reset — and how much is LEFT, which is the figure somebody is actually after, was nowhere: 38% used and 62% left are the same fact and only one of them answers the question being asked. The window block now carries used, left, the reset, how old the reading is and whose plan it is; an account with no figure says WHICH of the two silences it is in. - `AFTip.label` joins `AFTip.cell`: a form label whose whole area is the trigger and which stays the element its row is laid out with. Wrapping a `<label>` puts a span between it and its flex row, and the row then lays out the span.

### 3.399.1 — X-195 closed: and WHICH handover note the words were built on (2026-09-06)

- **The last line of the item, and the one a reader cannot check for themselves:** A continuation prompt is largely somebody else's note: "the previous session left this behind" is a claim, and until now nothing said which file it was or which source offered it. The round's record carries `handover` now — the note's path, the source that found it and the score it was chosen by — and both panels draw it. **A search that found nothing is its own answer** (`found: false`) and says so: it is what explains a thin prompt, and reading it as "never looked" hides a search that failed.

### 3.399.0 — X-211 family closed, and X-195: every round says why it opened on those words (2026-09-06)

- **Three surfaces named an account and a fourth ran the process:** Every item below closes one of those gaps; together they are the X-211 umbrella.
- - **‼️ X-212 — the status bar and the Dashboard read the account that is STANDING.** `PlanUsageService` was pointed at `~/.claude/.credentials.json` and nothing else, which was right for exactly as long as there was one sign-in: make an account standing on the Engines page and every session ran on it while the indicator went on reporting the main account's window. The reader is dynamic now, the cached snapshot remembers WHICH file it came out of (a cache that outlived an account switch would put the new name over the old figures), the heading says `Claude Code (murat@…) — plan usage` / `(Machine Global)`, the Dashboard card carries the same owner, and making an account standing repaints and re-reads in the same gesture instead of waiting up to five minutes for the next beat. `usage.plan` answers with `account` too. - **‼️ X-211 — "the machine's own sign-in" is a VALUE, not a blank (`@machine`).** The empty account was two answers wearing one face: *nobody chose*, which falls through to the standing account and must, and *I chose the machine's own*, which must not. They are different values now, and the second one CLEARS the engine's config variable rather than merely not setting it — a window that itself carries one used to hand it to the card while every surface named something else. - **‼️ X-213 — the ghost selection, and the lock.** The composer's box had no row for the machine's own sign-in, so the browser drew the FIRST account as selected while the composer stated nothing. It has a root row now, it OPENS on the standing account with its dot, it is drawn on any engine that can hold a second sign-in (a machine with nothing captured is the case that most needed it), and what it shows is what `start` states. One layer down: three of the four session-start paths never recorded the account on the card's state, so Claude — the engine this family is for — re-spawned as `undefined`. - **‼️ X-213 — and the box no longer locks when the session starts.** A window that hits its five-hour ceiling mid-task used to mean a second terminal, a `/login`, and `claude --resume` by hand. Now the account box stays open on a live card: pick another sign-in and the next message ends the process and brings the SAME conversation back up on it with `--resume`, carrying the running totals so the conversation does not get cheaper for changing account. The old process is watched out of the CLI's own registry rather than assumed away, and a hold-out is reported. On a per-turn engine there is no process between turns, so the change is simply true and says so. New op **`console.setAccount`**. - **X-214 — a terminal resume names its account too.** That door passed no account layer at all. It asks now — the standing account first, so Enter does what the machine would have done — and cancelling opens nothing.
- Two gaps found REVIEWING that family, and fixed here rather than written down as caveats:
- - **‼️ A HELD MESSAGE KEPT NO PROMISE.** `send` re-sealed the session for a message said into an idle card, but a message PARKED while a turn was running is released somewhere else entirely — straight down the pipe of the process the conversation is leaving, with the card still saying the swap was pending. The reader was told the next message would run on the other sign-in and then watched it spend the old one, with nothing on screen saying so. It re-seals there too now, taking the held text out of the queue WITHOUT opening a turn so the resumed session says it exactly once. - **‼️ THE TERMINAL RESUME CLEARED THE VARIABLE ON A MACHINE WITH NO SLOTS.** Nobody was asked, so nobody answered — and `@machine` is an ANSWER, one that removes the engine's config variable. On a machine with no captured account the window's own `CLAUDE_CONFIG_DIR` is the only sign-in there is, and the Console's own spawn inherits it: two surfaces, two identities. Nothing stated is what it answers now.

### 3.398.0 — X-194 closed: what every condition reads today, AND parts, and the leader's own purse (2026-09-05)

- **The editor could WRITE a rule and could not show what the rule was about:** Three things finish it.
- **- **‼️ Every condition row says what its field reads TODAY** — `repo.dirty | is more than | 0 | now 3`:** The reading comes from the round that ended last, through the evaluator's OWN reader (`factsSnapshot` runs `read()` over the field dictionary), so the figure on the row is by construction the figure the condition will be compared against. A field added to the dictionary turns up with a reading without either side being touched. With nothing measured yet the row says "not measured yet" rather than showing a zero — "nothing fired" and "nothing was read" are opposite answers. - **And whether it would fire tonight, ASKED rather than guessed.** The page posts a debounced probe on every repaint of the draft and paints what the real evaluator answered: the rows that hold are marked, and the set says in one sentence whether "a round ending like the last one would wake the leader", naming which conditions did it. New op **`sentry.probe`** is the same function behind the bridge, so an agent can ask before a night is spent finding out. - **‼️ AND groups.** `Condition.all` has been in the core since X-190 and the editor drew a flat OR list, so the only policy anybody could build was "any one of these". A line can now be given AND parts: the lines are ORed, the parts of one line are ANDed. "The repo is dirty AND the item did not close" is a real night; either half alone is an ordinary one. Take the last part away and the line goes back to being a plain condition. - **The leader's own leash, per campaign.** `leaderCaps` has been on the record since X-191 with no writer anywhere, so every campaign spent the machine-wide settings. Three boxes — the model its short deciding turn runs on, the dollars per calendar day, and what one turn may cost before the next is refused (not the round's model or budget). All three empty by default, and empty means the setting decides: **MIRROR** puts the figure in force on the first line of each panel, because an empty purse and a purse of zero look identical and one of them switches the leader off. An untouched box sends nothing, so changing the setting later still changes this campaign. Also on `sentry.start` as `leaderModel` / `leaderDailyUsd` / `leaderMaxUsd`. - **Three defects found on the way.** The mode strip said `custom · from hybrid` over a set nobody had edited (a value was compared by TYPE, so `0` and `"0"` were two questions); reading the form back walked inside each row and so measured nothing in the page harness, leaving every row holding the first row's boxes; and `+ condition` named a new row by the count, handing out a name already on the board after a delete — and the verdict names conditions by their handle.

### 3.397.0 — X-194 (part 2): the sentry form gets a mode and its conditions (2026-09-05)

- The host has taken `preset` and `conditions` since 3.390.0 and the round has read the policy since X-191 — but no surface could SET one, so every campaign anybody actually started fell to the mechanical default and the leader never woke. This is the half that was missing. **‼️ X-194 is not closed:** each row still has to show that field's CURRENT value (so you can see whether the condition would fire today), and the lead settings — model, daily budget, round ceiling — are still to come.
- **- **A mode strip above the conditions:** Not set · Mechanical · Intelligent · Hybrid:** They are not code paths — pressing one FILLS the condition set from `core/sentryPolicy.ts`. "Not set" is a fourth position and not the absence of one: no policy is written at all and the round's own default decides, which is what every campaign started before this control existed did. - **‼️ The mode is READ OFF THE CONDITIONS on every paint, never remembered.** Edit a row and the strip says `custom · from hybrid`; undo the edit and it says Hybrid again by itself. A preset name printed over five edited conditions is a label that lies about what will run tonight. - **A condition editor fed by the dictionary.** Fields, operators and presets all come from `sentryPolicy.ts` over the page's data, so a fact the round learns to measure turns up in the editor the day it is added and the page does not change. A row offers only the operators its field's TYPE admits, a closed set gets a picker, an operator that takes no value gets no value box, and a field the dictionary no longer names is kept, marked and explained rather than silently swapped for whatever sits first in the list. - Rows can be added, dropped and reordered, and the order is not cosmetic: the conditions are ORed and the verdict names the ones that fired in the order they were written. The block says that in one sentence, where the decision is made.

### 3.396.0 — U-131 — right-click is the second position of the switch (2026-09-05)

- The Console's `show` box is opened, scrolled and re-ticked all day to do one thing: drop to the conversation and come back. That is not a choice between eight options, it is a switch — and a switch that costs a click, a read and two ticks is not a switch.
- - **Right-click the trigger and it flips**, without opening the menu: everything → the picker's first preset; the preset → unfiltered; **any other combination → the preset first**, because somebody reaching for a shortcut in the middle of a hand-built filter means "take me there", not "throw my filter away". - **It lives in the component** (`media/afFilters.js`), so every `AFFilter.multi` that declares a preset has it — the same box is drawn on nine pages, and one written per page would have been nine gestures that disagree. - **‼️ A picker with no preset does not take the gesture at all** — no listener and no `preventDefault`, so the platform's own menu is untouched. A gesture that silently does nothing on the other pages is worse than no gesture: the reader learns it, tries it, and stops trusting it. - The hover says the gesture exists and names what it flips to, built from the same list the listener reads. A feature nobody is told about is a feature nobody uses.

### 3.395.0 — U-130 — 2 205 options that said nothing, paid off in full (2026-09-05)

- A `<select>` cuts its own text and the popup it opens is drawn by the operating system, so no hover panel of ours can reach into it — the option's native `title` is the only surface there is. U-128 measured the damage and fixed the Console; the other twenty-two pages were left on a budget. That budget is now **zero**, on every page.
- - **One emitter, not twenty-three copies.** `C.option(value, label, { selected, disabled, detail })` and `C.optionTip(label, detail)` live in `media/charts.js` — already on every page as `window.AFCharts`. The option's own text comes first, then a blank line, then the detail: the same order MIRROR puts a control's current value before its explanation. - **And the detail is a FACT, not a restatement.** A settings enum says which of its values is the default; an alert tone says where the file lives and why a greyed row is greyed; a voice says which language it reads and what picking it writes into the setting; a queue position says how many items it jumps; a project says the same `Label: value` readout its own row hover carries. The three shared components (`afProject`, `afForm`, `afTelegram`) were fixed once and paid for six pages at a time. - **The gate is now a ban rather than a budget.** `test/optiontips.manifest.json` is empty and `bare` is `0`, so a page missing from it must be at zero — a new picker cannot arrive silent. A `<datalist>` option is no longer counted: it is a suggestion behind a text box, it opens no popup, and no browser shows a `title` on it, so counting it invited markup nobody can ever see. - **‼️ And a test that hand-wrote its own `window.AFCharts` now borrows the real one** (`test/lib_charts_stub.js`). Thirteen sandboxes each carried a partial copy, so the day a shared helper was added every one of them died with `C.<new thing> is not a function` while the extension itself was fine — a false alarm on one side and no alarm at all on the other.

### 3.394.0 — X-197 — one atomic writer, and a failure you can retry (2026-09-05)

- A `projects.backlog.add` call fell over with `EPERM: rename Backlog.md.af.tmp -> Backlog.md` because Obsidian had the file open. The real damage was not the failure — it was that the caller could not tell a refusal from a half-applied batch, retried, and wrote six items TWICE, spending their codes for ever.
- - Both writers (`reportBridge.atomicWrite`, `projectDocs.safeWriteDoc`) now go through the one `core/atomicFile.ts` introduced with X-204, instead of each keeping its own copy of temp+rename. - **The rename is retried** through a short backoff (150/300/600/900 ms) while the target looks locked — EPERM, EACCES, EBUSY. On Windows those locks are measured in milliseconds, so waiting is the honest answer. A fault that will never clear (a missing directory, a read-only volume) is reported at ONCE rather than after two seconds of hoping. - **‼️ And the failure carries the guarantee that makes a retry safe:** the error states that NOTHING WAS WRITTEN, names the file, and names the kind of process that is probably holding it. The temp file is swept up, so nothing is left behind that could be mistaken for the document.

### 3.393.0 — X-206 — read them all, in a line (2026-09-05)

- **Before switching accounts you have to see which one has room — and there was no way to ask:** The page-wide beat reads ONE slot per turn, whichever is stalest, so the card you were looking at could be minutes old and nothing on the page would tell you: it printed beside a percentage, which is the age of the ACCOUNT, not of the figure.
- - **‼️ "Refresh all" is a LINE, not a burst.** `accountUsage` still refuses to have a `refreshAll()` — the new `core/accountQueue.ts` holds an ORDER and starts one read every five seconds through the same single-slot door. N accounts are still N requests; the spacing is the only thing that keeps asking how much quota is left from becoming what spends it, and it is the SAME constant the manual floor is built from rather than a second number. - **The queue is drawn, because a queue nobody can see is a hang.** A waiting card wears its PLACE in the line (a number you can act on, not a spinner that says soon); the one in flight spins; **pressing a waiting card takes it back out** — a queue you cannot leave is one you learn not to join. A slot already being read cannot be cancelled and says so: the figure will land either way. - **One engine, one group.** A Claude account and a Codex account are never alternatives to each other, so the flat list made you filter by eye before you could compare anything (ONE SUBJECT). Each group carries its own `⟳ all`, which is the press somebody actually makes before switching. - **Every card says when its own figure was read** (`read 40s ago` / ), beside when the account was filed. The two answer different questions and only one of them decides a switch. - New bridge op **`accounts.refresh`** (id = toggle · engine = that group · all).

### 3.392.0 — X-205 — the standing account is a switch, not a sentence (2026-09-05)

- **`Use next` read as *hand the next one to whoever is next* — the opposite of what it did:** It makes THIS account the one every new session of that engine opens as, and the state is binary and exclusive per engine, which is what a switch is for.
- - The two text buttons (`Use next` / `Main account`) are now **one control in its two positions**: a switch, ON in the same blue the standing badge and the card's left rule already wear — one colour for one fact, read down a column of cards without stopping to parse a label. - **MIRROR** — a control with no words opens its tooltip with the position it is IN (`ON — the standing Claude Code account` / `OFF — switch to this account`), then the whole consequence: that turning one on turns the other off, and that nothing already running moves either way. - `role="switch"` and `aria-checked`, so the state is not only a colour. - The Console account box and the launcher dimension no longer point at a button by a name that no longer exists.

### 3.391.0 — X-204 — an expired access token is not a signed-out account (2026-09-05)

- **MEASURED, and it cost an account to learn:** Two things were true at once and only one of them was in the code that decided whether a session could start:
- - `engineAccounts.readClaudeIdentity` has always said an expired access token is routine and only a dead REFRESH token needs a person. - `accountUsage` read HTTP 401 from the usage endpoint as `expired`, `slotIsUsable` refuses an expired slot, and the sentry's own fleet filter (`extension.ts`, `sentryWatch`) drops it. So an account whose token had simply aged out of its few hours **left the fleet**, and the user was sent to a browser to fix nothing. Not a cosmetic alarm: the account could not be switched to.
- - **The grant's short half is now refreshed** the way the CLI refreshes it in the same directory — `platform.claude.com/v1/oauth/token`, endpoint, client id and body shape READ OUT OF THE INSTALLED CLI rather than invented (`oauthRefresh.ts`). A 401 is refreshed and retried once; a token already expired on the clock is refreshed **before** the request, so the machine's shared budget is not spent on a call that is known to fail. - **‼️ A REFRESH IS NOT A READ.** Measured against the live endpoint: Anthropic ROTATES the refresh token on every exchange and REVOKES the access token that was in force. Two rules follow, and both are in the code rather than in a note: - a slot with a **session running on it is never exchanged** — that would take the credential out from under somebody's turn. It is re-READ instead, because the engine using it refreshes the grant itself and has usually already written the answer to disk; - the rotated grant is parked in a **sidecar** (`.credentials.json.rotated.json`) BEFORE the real file is replaced, and a sidecar found on the next read is adopted. The window between "the server rotated" and "the file says so" is where an account is lost, and it is now survivable. - **Weather is never reported as a sign-out.** An unreachable endpoint, an HTTP 500, a locked file: the slot stays USABLE with an honest sentence. `expired` now means only what it says — the refresh grant itself is gone, or a token minted seconds ago was refused. - **One atomic writer, and its failure carries a guarantee** (`atomicFile.ts`). The rename is retried through a short backoff while the target looks locked (EPERM/EACCES/EBUSY — Windows, an editor or a scanner, milliseconds), and when the attempts are spent the error states that NOTHING WAS WRITTEN, which is what makes the caller's retry safe. A fault that will never clear is reported at once rather than after two seconds of waiting.

### 3.390.0 — X-194 (part): a campaign can be STARTED with a mode (2026-09-05)

- MEASURED: the campaign record has carried `policy` since X-190 and the round has read it since X-191 — and **nothing could set it**. `sentry.start` took no preset and no conditions, so every campaign anybody could actually start fell to the mechanical default and the leader X-191 built never woke once.
- **- `sentry.start` now takes **`preset`** (`mechanical` · `intelligent` · `hybrid`) and **`conditions`**:** They are not three code paths: one condition set with three fillings, so a preset FILLS the conditions from the dictionary and your own `conditions` win over it, with the preset kept beside them so a surface can say what they were edited FROM. - **‼️ A preset nobody knows is REFUSED BY NAME**, never quietly mechanical — that silence would turn a night of thinking into a night of templates and tell no one. Same rule X-190 applies to an unknown FIELD, at the other end of the same dictionary. - **Asking for no mode still starts a campaign** and writes no policy at all: the round already has its own default, and inventing one here would be this function deciding something nobody asked for. - The Missions page's own door takes the same two arguments, so the form X-194 still owes has nothing left to invent on the host side.
- ‼️ **X-194 IS NOT CLOSED BY THIS.** The mode selector and the condition editor — its visible half — are still to build; this is the host-side gap that made them impossible to wire.

### 3.389.0 — X-193 — the sentry gets a section, and every path says where it points (2026-09-05)

- Thirteen settings for one unattended campaign were scattered down a page about task concurrency and dispatch rules. Each of them was filed there for a reason that was right about that one setting and wrong about the set: somebody tuning an overnight run had to hunt for the words it starts on, the folders it reads, the leader's leash and three thresholds, one at a time, in alphabetical order.
- - **Its own section, and four questions instead of thirteen boxes.** *Where it looks for the handover note · The words it starts the next session with · The leader, and its leash · When a round is going nowhere.* Each group says what the question IS, not just which keys are in it. - **‼️ A key the grouping has never heard of is still drawn**, under **More**. The grouping is hand-written editorial and will go stale; a settings page that HIDES a setting is worse than one that groups it badly. - **‼️ EVERY PATH ROW SAYS WHERE IT POINTS.** `${vault}\00_AGENT_AREA\…` in a box tells you nothing about the folder it opens, and that gap is where an unattended campaign reads the wrong place and reports "no handover note" about a folder nobody ever opened. Each row now carries the real resolved path underneath it — no click, no dialog (DENSITY). A path that cannot be built carries the REASON instead and no path at all, because a half-built path looks usable and points somewhere nobody meant. - **The variable legend is DRAWN from the dictionary**, not repeated on the page: a variable added to `core/pathVars.ts` turns up here untouched. MIRROR — each chip's panel opens on what the variable IS on this machine, then a blank line, then what it means. One with nothing behind it is marked, because that is the case that silently cancels a path. - **The order is the value, so a row can be moved.** `handoverSources` is tried most-truthful-first and the instruction pool decides whose block wins; reordering used to mean deleting a row and retyping it at the bottom. Rows now drag, and carry ↑/↓ for the hand that would rather not drag and the keyboard that cannot. Nothing is saved by moving — **Save the list** still is. - **Which settings get all this is DERIVED from their own schema** (`x-af-browse`), never from a list of keys — the disease that key was introduced to cure. - **Bridge:** new `settings.paths` — where a path setting actually points on this machine, through the same resolver the page and the campaign use, so all three agree. With no arguments it answers for every path setting plus each variable and what it is here; `templates` resolves a value you have not written yet. - **U-128 paid down while passing through:** the list editor's dropdown rows and the setting-set picker now title their options, so six other pages' budgets came down with them and `spsettings` reached zero. - What deliberately did NOT move: `answerDir` (where an answer is WRITTEN — that belongs to the work queue) and `automation.*` (the master gate over every unattended thing on this machine, not over this one).

### 3.388.0 — X-192 — one pool of your own words, read twice (2026-09-05)

- **Your saved instructions were never a second file to invent:** `sentryTemplatesFile` already held blocks you had written; the campaign just refused every heading that did not name a verdict and then **threw the block away**. So "always give it the session id", "after 3am keep it short" — the things you actually type by hand out of the right-click menu — had nowhere in the machine to live.
- - **One pool, two uses.** A block whose heading names a verdict (`item-done`, `clean-handover`, `nothing-to-continue`, `hit-the-wall`, `*`) is a TEMPLATE and the mechanical round fills it, exactly as before. **Every** block — including the ones under a heading of your own — is MATERIAL the leader blends into the next session's opening words. Same file, same format, read twice. - **‼️ A refusal is no longer a loss, and it says so.** A heading naming no verdict is still refused BY NAME (dropping it silently is how somebody spends an evening wondering why their template never fires), but the sentence now ends "it is kept as material for the leader" — because a refusal that reads as a loss teaches people to stop writing the blocks this exists to collect. - **The pool is a LIST, not a file.** New `agentFarm.sentryInstructionFiles`, taking the X-188 path variables (`${vault}`, `${projectNotes}`, `${today}` …). `sentryTemplatesFile` is read first and the list follows it — they are **assembled**, not chosen between, so nobody's precedence changes and a file named in both is **read once**: a doubled instruction would be a doubled prompt on a model metered by the word. - **The leader is not handed the whole pool.** `materialFor` gives it your standing instructions plus the ONE block that answers the round that actually happened, and the catch-all. The other verdicts' wording is noise it pays for and, worse, something to copy. - **Still self-contained (X-179).** With nothing configured the pool is empty, every verdict still has a built-in answer, and no folder of yours is needed anywhere. A path whose variables will not resolve is SKIPPED **with its reason** rather than pointed at the wrong folder (X-182); a path that is gone is reported and the rest of the pool still reads. - **Bridge:** new `sentry.instructions` (what the leader receives, and with `outcome` what a leader woken on that verdict would receive); `sentry.templates` now reports `files`, `missingPaths` and `skipped` alongside what it already said.

### 3.387.0 — X-191 — the leader wakes, takes the situation in hand, and goes back to sleep (2026-09-05)

- **This is the defect the whole X-167 family was reopened for:** `ModelAssist` and `modelNeeded()` were WRITTEN and never wired: `sentryStep({…})` had never once been handed an `assist`, so the sleeping leader you designed did not exist. What shipped filled a template and could not think.
- **And the reason it was not built is the thing to get right:** The `automation.ts` precedent burned $70.90 over five nights asking a model something that could have been counted, and the agent that wrote this family over-corrected into "never call a model". ‼️ The answer was never "do not call" — it is **govern when, and how much**. New pure module `src/core/sentryLeader.ts`.
- - **Six leashes, each of them tested as a leash.** The leader wakes only when a condition fires, so a routine night costs nothing at all · the model is cheap by default (`haiku`) and the default is named in one place · a turn has a time ceiling and a cost ceiling · a campaign has a DAILY budget · every turn is recorded as a `ModelAssist` (model, ms, $, ok) · N failures in a row drop the mode to mechanical and say so. - **‼️ Not one of them is a brake on the WORK.** Budget spent, brake tripped, turn cut, answer unreadable, runner missing — every path opens the round anyway, on the template. A leader that could halt the night is a worse failure mode than a leader that is occasionally wrong, so nothing thrown inside a leader turn leaves it. - **What the leader may do is deliberately narrow:** replace the WORDS, pick the ACCOUNT, or say WAIT. It cannot overrule your hand, the failure brake, the automation gate or the quota wall — all of which are decided around it, never by it. Waiting is `idle`, not stopped, and the words it wrote are carried to the round that does open. - **The brief tells the truth about what is not known.** X-174's law travels into the prompt: a fact nobody measured is presented as unmeasured, because an absent fact is an invitation to invent one. - **The reply is read with a string-aware brace scanner**, not a regular expression — the thing the leader writes is a PROMPT, and prompts here are full of `{placeholders}` and stray braces. - New: `sentry.leader` on the bridge (read-only and free — an op that spent money to answer a question about spending money would be the same bill with an extra step) · five settings under Tasks & Automation with the campaign's other brakes · `SentryRecord.leader` / `.policy` / `.leaderCaps`. - `sentryTick` is now async, and its port settles the promise rather than letting a rejection walk past the `try`/`catch` into the extension host.

### 3.386.0 — X-189 — the handover note is looked for where it was actually written (2026-09-05)

- The sentry looked for the last session's handover note in ONE hard-coded folder under ONE millimetric name pattern. An agent that wrote its note anywhere else, or called it anything else, was invisible — and the campaign then diagnosed `hit-the-wall` about a session that had handed over perfectly well. That is not a missing measurement, it is a false one: it sends the next round after the wrong thing, and you find out in the morning. New pure module `src/core/handoverDiscovery.ts`.
- - **‼️ Four sources, in order, and the order is the argument.** `transcript` first — the files the finished session ITSELF wrote, read back out of its own transcript, because where the agent actually wrote beats where a setting says it should have. Then `configured` (`agentFarm.handoverFolders`, with X-188 path variables), then the project's own `10_Notes`, and only then the folder this extension shipped with. A folder reached twice is listed once. - **‼️ Scoring replaced the all-or-nothing pattern — not the identity check.** The session id in the name or the session having written the file (+3), the word devir/handover (+2), a date near today (+1), the full canonical name (+2). The canonical name is still preferred; it is just no longer required. But one of the two identity proofs is REQUIRED at any score: adopting another session's handover note is a worse failure than finding none, and "devir + today + canonical" describes every note in the folder. - **‼️ A folder nobody could read is unknown, never empty.** X-174's law makes the trip intact: `measured:false` means say nothing about whether a note exists. A skipped source reports the reason in the caller's own words. - **The near misses are kept**, ranked, with the components that scored — so the answer to "why was my note not picked up" is on the record rather than in somebody's head. - **The legacy vault folder is now a named constant** reached last by both its readers, never a `||` default. X-188's test tightened accordingly. - New: `sentry.handover` on the bridge (read-only, calls no model, writes nothing) · settings `agentFarm.handoverSources` and `agentFarm.handoverFolders`, both filed under Tasks & Automation with the campaign's other brakes.

### 3.385.0 — X-190 — the sentry gets a policy, and the three modes stop being three code paths (2026-09-05)

- **The sentry that shipped was purely mechanical: measure, fill a template, open the next round, never think:** You asked for the switch instead — mechanical / intelligent / hybrid — with condition inputs wide and flexible, because "çok dar kalıplara sıkışmış bir hibrit sistem çok etkili olmaz". New pure module `src/core/sentryPolicy.ts` decides, and it costs nothing to decide.
- - **‼️ The three modes are three PRESETS over one condition set, not three branches.** Mechanical is the empty set, intelligent is a set that always fires, hybrid is whatever you build. Written as branches, two of them would rot unwatched — and three fixed modes would be exactly the narrow mould. As presets, the mechanical path is exercised by every hybrid round that fires nothing. - **Seventeen fields, ten operators, AND groups.** Fields cover the diagnosis, the handover note and where it came from, the repository, the round, the quota, the accounts and the raw output. Conditions are ORed; a group's parts are ANDed; an empty group is not "always". - **‼️ An unknown field fails with its eyes open.** It does not fire — firing on a name nobody implemented spends money at 3 a.m. — and it is not swallowed either, because a condition that quietly never fires is a rule that failed silently. It comes back by name, and a broken row never disarms the working ones. Same for a regular expression that will not compile. - **The verdict names what woke the leader**, so a round can say why it was opened the way it was. - The dictionary lives in one exported list, so the missions editor (X-194) draws it rather than repeating it: adding a field touches no UI.
- **Nothing is wired to it yet — the leader turn itself is X-191:** This is the decision, tested on its own, with no way for it to spend anything.

### 3.384.0 — X-188 — a folder setting you can write, and a resolver that refuses to guess (2026-09-05)

- Three folders in this extension ended in one person's Obsidian vault, spelled out in the source: the wiki root, the report folder and the answers folder. Your words about it were exact — a program is written open-ended and elastic, not against today's folder — and about what may survive: today's folders may stay, **as a fallback and nothing more**.
- - **`${vault}` `${workspace}` `${home}` `${today}` `${date:YYMMDD}` and nine others now work in every one of those settings.** The syntax is `${…}` because that is what the settings file next to it already speaks (`${workspaceFolder}`, `${userHome}`), and both of VS Code's names work as aliases. Prompt templates keep their own `{name}`: two subjects, neither borrowing the other's punctuation. - **‼️ An unresolved variable CANCELS the path — it never becomes an empty string.** `${vault}/01_CEVAPLAR` on a machine with no vault skips that folder rather than looking in `\01_CEVAPLAR`, finding nothing and reporting it as an answer. An unknown name and a known one with nothing behind it are told apart in the reason: one is a typo you can fix, the other is a machine that has no such thing. - **New setting `agentFarm.vaultDir`** — say where your vault is once, and the three folders derive from it. The built-in defaults are now `${vault}/00_WIKI`, `${vault}/…/10_REPORT`, `${vault}/…/01_CEVAPLAR`, so the legacy absolute path is only reached when neither your setting nor the built-in template can be BUILT. Nothing changes for you until you set it. - A resolved value is not re-expanded, so a folder literally called `${home}` cannot loop or reach anywhere it was not pointed. - The dictionary of variables lives in one exported list, so the settings surface X-193 adds can draw it instead of repeating it.

### 3.383.0 — X-187 — the Engines page asks for the quota it draws (2026-09-05)

- **You captured three accounts, opened Engines and saw no limit anywhere — no bar, no reset countdown:** The page was telling the truth: nobody had ever looked. `AccountUsageService` was built with three doors (`beat()` for a timer, `readOnEdge()` for a turn that just ended, `refresh()` for a person) and on the day it shipped exactly one of them was wired — the bridge's own `accounts.list`. The page read `current()`, which never touches the network, so on a cold host every card drew percent -1 and resetsAt 0.
- - **Opening the page asks for a reading, and revealing an open one asks again.** The answer lands as a fresh payload, so the figures arrive somewhere the page actually redraws from. - **Capturing, standing up or forgetting an account asks too** — each changes which accounts there are to have figures for. - **One timer for the page, never one per account.** The service already walks the slots in turn behind a single machine-wide floor and backoff, so three accounts still do not mean three times the requests. The timer is skipped while the tab is hidden and cleared when the page closes. - The old guard "this panel schedules nothing" was a proxy for what actually matters — nothing may spend a TURN on its own — and is now stated that way, with an allow-list of exactly one thing a timer here may call. A usage reading is a free GET; an engine test costs your plan, and still runs only from the button.

### 3.382.0 — U-130 (1/n): the sessions table pays its own hover debt (2026-09-05)

- **The first page off the budget U-128 opened:** The shared Sessions table's sort box drew six options that said nothing; each now opens with its own name and then says what picking it DOES — which is a different fact from what the figure means (that is the column's `<th>`), so neither repeats the other.
- - Because the table is shared, one fix lowered four pages at once: **sessions 30→0, agentdetail 6→0, dashboard 39→33, planusage 156→132.** Fleet total 2 291 → 2 225 and the budget is relocked at the new floor, which is the whole point of a number that may only shrink. - The Duration option says out loud what S-52 changed: it sorts on the longest RUN, never the longest span.

### 3.381.0 — U-128 — an option in a narrow box says its own name (2026-09-05)

- You asked why the Console's project picker did not show a project's full name on hover when the boxes beside it did — and answered it in the asking: our own design principles already said it had to. The measurement was worse than the report. **2 291 of the 2 639 options this extension draws carried no usable `title` at all**, including 126 on the Console itself, because options were built as `title="${detail}"` and most lists carry no detail.
- - **Every option the Console draws now opens its hover with its own text**, and a detail follows after a blank line — the same order `boxTip` puts the current value before the standing explanation. One helper (`optionTip`) that all six of the page's option builders go through, so the next list cannot forget it. - **The project picker** carries the whole project name; **the agent picker** carries the name and the folder the session will open in — the thing that box's own tooltip has always promised. - **‼️ And it is measured, so it cannot come back.** `test/test_option_tips.js` renders every page fixture and counts the options that say nothing; `test/optiontips.manifest.json` holds a per-page budget that may only SHRINK, exactly like the parity gate's `gapBudget`. A page missing from the manifest must be at zero, so a NEW page cannot arrive with the defect in it. The Console is at **0 of 249**; the other 23 pages are recorded at today's numbers and can be paid down one at a time.

### 3.380.0 — S-52 — a session you resume tomorrow did not run for a day (2026-09-05)

- **The Sessions table measured Duration from the first message to the last:** That figure is true, but it was the only one on the row — so a conversation picked up again the next morning read as a day and a half, and every rate derived from it was divided by a night's sleep. Measured on this machine: **36 sessions** carry a gap of over an hour, the worst of them reporting 1 247 minutes for 144 minutes of work.
- - **Duration is now what the session RAN**, with the span it ran ACROSS beside it — `50m ⋯25.8 h` — in the same shape the token column already uses for its second figure. A session that was never put down is drawn exactly as before, mark and all absent. - **‼️ Absence is measured BETWEEN turns, never inside one.** A three-hour headless round is the work itself; a rule that called a long turn absence would subtract exactly what the figure exists to show. - **‼️ Nothing is subtracted on no evidence.** A session whose turns were not recorded is unmeasured, not idle: active falls back to the wall clock rather than to a guess. - **The rates follow the work.** Cost per hour, minutes per turn and seconds per API call are divided by what ran; below an hour of real work no rate is stated at all, where the wall clock used to manufacture one out of the sleep (23 cents an hour said nothing). - The cell's hover carries the absence, how many times it happened, and the wall clock it was carved out of — and says none of it on a session that has none. - `agentFarm.sessionBreakMin`, default 30 minutes, decides when a pause stops being someone thinking and becomes someone away. **0 switches the split off** and Duration goes back to being first-to-last.

### 3.379.0 — X-178 — the watchdog, and a sign-in that falls at two in the morning (2026-09-04)

- **The campaign's loop is driven by rounds ENDING:** That left one state nothing could recover from — a round that never ends — and the quota does not break it either, because a session parked on a permission prompt spends nothing.
- - **A watchdog on the beat the farm already keeps** (no second scheduler): the same pump tick that asks "is the campaign due?" now also asks "is the round on the board still alive?". Silence is measured from the run's own output, so it is engine-agnostic and a thinking turn is never touched. `agentFarm.sentryStallMin`, default 45 minutes, 0 to switch it off. - **‼️ The stalled round is ended as FAILED, never as cancelled.** Cancelling the round the sentry is running is your hand on the campaign and stops it — the opposite of what a watchdog is for. Failed is a barren round, so three stalls in a row still hit the failure brake and a genuinely broken setup still ends. It is **not retried**: the row a retry would re-run is the row that went quiet. - **The reason is written down in three places** — the row's own event, a level-2 notice, and the campaign's next decision. Silent stopping is forbidden by the item's own words. - **A fallen sign-in is now reported.** It never stopped the campaign (an expired slot is already refused and the rest carry the work) — but nobody was told, which is the same loss in slow motion. Told **once per fall**, re-armed when the slot answers again, and raised to level 3 with different words when it was the last usable account. - `sentry.status` now carries `stallMin` and `downSlots`.

### 3.378.0 — X-177 — the sentry, in one line, where your eye already is (2026-09-04)

- **The other half of the item:** Missions carries the campaign's setup and its history; the **Console** — the page you are already looking at — now carries what is true this second, and no fact is drawn on both.
- - **A one-line sentry strip under the Console header.** Running, it says which round is open on which item, as whom, on which sign-in, and **how much of that account's five-hour window is left** — the one figure no task row can carry. Sleeping, it says when it wakes and why it is waiting, in the campaign's own words. Paused, it says so. Stopped, it is still drawn, faded, saying what stopped it — because a campaign that ended at three in the morning is exactly what somebody needs to read at nine. - It has **no controls of its own**: pressing it goes to Missions, where they are. The whole sentence, the project, the round count and the words the next round is already holding are one hover away. - **‼️ The live clock left Missions.** That block already said in its own comment that what is true this second is the Console's subject, and then drew the campaign's wake moment anyway. It is now in one place. - **‼️ Fixed: a wait destroyed the sentence the next round was holding.** `backlog.next` gives nothing while every remaining item is XL or waiting on an unfinished ⛔ — a WAIT, which says nothing about whether the words still fit. They were dropped there anyway, so the item back at the top ten minutes later opened on the campaign's FIRST-round sentence: the same failure 3.377.0 fixed, through another door. Only a DIFFERENT item drops them now. And words built while the backlog had nothing to give — they name an empty item — are no longer kept over words that name a real one.

### 3.377.0 — X-177 — the sentry has a face, and a pause of its own (2026-09-04)

- **The campaign shipped in 3.376.0 could only be reached from the bridge:** It now has the surface it belongs on: **Missions**, which is already the page for work that runs while nobody is watching. No third panel was opened — the item forbids one by name.
- **- **A Sentry block at the top of Missions.** Off, it says what a campaign would do before you press anything:** Set up, it is four rows of controls: the project whose backlog it works through, the agent it runs as, the engine (naming one is what turns account rotation on), the model, the permissions, the ceiling, the safety buffer, the failure brake, and the words the FIRST round opens on — which are yours because every continuation sentence is built on "the previous session" and the first round has none. - **Running, it is the campaign's own account of itself:** the state in one word, the last plan IN ITS OWN WORDS (why nothing is happening right now is the question a surface has to answer), what it is working through and as whom, the barren streak against its brake, the moment it wakes if it is sleeping off a quota wall, and every round it has opened with the account each one spent. - **‼️ Pause is now the campaign's own, not the farm's.** The automation master switch stops every schedule there is; wanting the sentry to stand still for an hour is not wanting that. A paused campaign opens nothing, still holds the one campaign slot, and keeps everything it had worked out — above all the sentence it had already built for its next round. Resume looks at the backlog AT ONCE rather than serving out the poll it was paused in the middle of. `sentry.pause` and `sentry.resume` on the bridge. - **‼️ A round that ends while the campaign is paused is still read.** The verdict and the next session's words are free to compute, so a hold does not throw away what the round earned.

### 3.376.0 — X-176 — the sentry campaign actually runs (2026-09-04)

- X-174 could say what a finished session left behind and X-175 could say what to tell the next one, but nothing CALLED either of them. This release is the runner: switch a campaign on for a project, and it takes the next item off that project's backlog, opens a clean unattended session on it, watches that session end, diagnoses it, writes the next session's opening words from the verdict, and opens the next round — until you stop it.
- - **A round is an ORDINARY TASK ROW.** The same runner opens it, the same terminal is watched, the same cancel button ends it, the same pump launches it. That is how "no second scheduler" — the item's own condition — holds all the way down to the launch. The price is that the task board fills with campaign rounds, which is the accepted cost. - **‼️ Only you end a campaign.** There is no round budget and no time budget, so an EMPTY BACKLOG IS A WAIT rather than a finish: an item written tomorrow morning finds the sentry still standing there. The brakes that do exist are the ones that already existed — the automation gate (master switch, pause, quiet hours), the five-hour ceiling per account, and a sleep until the earliest MEASURED reset plus a safety buffer. - **‼️ Cancelling the round cancels the campaign.** The sentry runs one session at a time, so reaching for cancel on the round it is running is you saying stop. The machine is reading your switch, not inventing one of its own. - **‼️ A failure brake, which is not a round budget.** A campaign whose sessions produce NOTHING, over and over, is a broken setup opening empty sessions all night — and no quota stops it, because a session that fails instantly spends nothing. Three barren rounds in a row switch it off with a notice; the streak is wiped by the first round that achieves something. `agentFarm.sentryFailureLimit` changes it, `0` switches it off, and a campaign may carry its own. - **‼️ What nobody measured is not a measurement**, all the way through the runner. An answers folder that would not list is not "no handover note"; a `git status` that would not answer is not "clean"; and one unreadable repository makes the whole repo fact unmeasured, because "clean" is a claim about all of them. Those land in the verdict's `unknown`, where they ask instead of assuming. - **‼️ Engine-agnostic, by name.** A campaign that names no engine runs every round on the main sign-in and rotates no account — choosing one would mean assuming an engine. `sentry.start` and `sentry.status` both say so (`rotatesAccounts`) rather than leaving you to wonder why nothing rotates. - **On the bridge:** `sentry.start` (project, agent, the words the first round opens on, and the dimensions every round is launched with — including `permissionMode`, without which an unattended round can stop to ask and never end), `sentry.stop` (the record is kept; a round already on the board is left alone), and `sentry.status` (the last plan in its own words, the moment it wakes, the rounds it opened, the streak against its brake). - **New settings** in Farm Settings → Tasks & Automation: `agentFarm.sentryFailureLimit` and `agentFarm.sentryIdlePollMin` (how often an idling campaign looks at the backlog again — it never shortens a measured sleep, so a three-hour quota wall is waited out rather than poked every ten minutes).

### 3.375.0 — X-174 · X-175: what a finished session left behind, and the sentence the next one opens on (2026-09-04)

- The sentry (X-167) has to answer two questions every time a session ends, and both of them used to be answered by asking a model: *what did that session actually leave behind*, and *what do I say to the next one*. Neither needs a model, and the precedent for what happens when you ask one anyway is on this repo's own bill — a question that could have been counted cost $70.90 over five nights.
- - **The verdict is counted, not asked.** `sessionDiagnosis` takes facts somebody MEASURED and reaches one of four verdicts: the item was closed, a clean handover note was left, there was nothing to carry on from, or the session hit the wall with work outstanding. It reads nothing itself — no disk, no git, no model — which is what makes "this is free" auditable rather than a claim. - **‼️ What nobody measured is not a measurement.** A folder that was never listed lands in `unknown`; a folder that was listed and was empty is evidence. Collapse those two and the machine invents a verdict out of its own defaults, then starts the next session on it. - **The decision ladder is a POLICY, not a rule carved in.** Four named keys, with the defaults spelled out, so a campaign can hand its own down; every verdict carries which policy produced it and which rule fired. - **The prompt the next session opens on** is rendered from that verdict, the item `projects.backlog.next` picked and the path of the handover note. A model is called only while facts are missing, and the module says so as a decision — `assist.needed`, plus the questions worth asking — instead of making the call itself. What a call cost (which model, how long, how much) travels in the words the next session reads. - **‼️ Every template ships INSIDE Agent Farm** and answers every verdict with nothing configured — no file, no vault, no folder of yours anywhere. Name a markdown file in `agentFarm.sentryTemplatesFile` (Settings → Tasks & Automation) and it REPLACES only the verdicts it answers, so adding a case is a block rather than a release. A heading naming no verdict is refused by name and reported: a template that silently never fires is an evening nobody gets back. A path that is not on disk is reported, never cleared. - **On the bridge:** `sentry.templates` says which words are in force and where they came from, `sentry.prompt` turns measured facts into the sentence. Neither calls anything and neither writes anything, so asking twice costs nothing and answers the same.

### 3.374.0 — X-172 — the sign-ins the Engines page can capture, stand up and drop (2026-09-04)

- The chip slice made the Engines page SAY which account each engine is plugged into and left every gesture on the bridge. A page that shows a state it cannot change is the dead end this page exists to remove, in a new costume.
- - **One card per captured sign-in** — the label, the address, the plan being paid for, and how much of the five-hour window is gone. - **A bar only where a figure was really read.** `-1` is not 0%: an account nobody has read a percentage for and an account with nothing left would draw the same empty bar, and one of them is ready to work. The other two states say which one they are in, in words. - **The way back exists.** The main sign-in is the ABSENCE of a slot, so there is no row to press: the standing card offers "Main account", which clears the engine rather than naming one. Without it the page could put an engine on an account and never take it off again. - **Capture is offered only where two identities can really be kept apart** — three of the five engines have no verified way, and they say WHY in the adapter's own words rather than being left out of the list. - **Both defaults are the op's, deliberately:** capturing does not become the standing choice, and forgetting does not delete the directory. The page says both out loud. - `captureAccount` / `activateAccount` / `forgetAccount` are one function each, called by BOTH the page's buttons and the `accounts.*` ops — a page and its op cannot drift into meaning different things.

### 3.373.0 — X-169 — which sign-in pays for the session, at every door (2026-09-04)

- Three Claude Pro plans on one machine, switched by hand all day: `/login` in a terminal, the right Chrome profile, sometimes a fresh Google sign-in. X-168 measured the way out — `CLAUDE_CONFIG_DIR` isolates an account completely, so switching is not copying files over the live one, it is pointing the SPAWN at a different directory. This is that measurement turned into a launch dimension.
- `account` is the seventeenth field of `LaunchOptions`, which means the matrix that counts "every dimension, every door" grew from 208 obligations to 221 and went red until every one of the thirteen had a verdict. Eleven doors carry it; two say out loud why they do not.
- - **The composer has a box for it**, beside the route, and it opens on whatever the standing choice is — so the account a session will spend is readable before Send rather than discoverable afterwards. Its hover says which one is set, then what "empty" means: the main sign-in, the identity this machine is logged in as. - **The launcher has a row**, the Tasks form has a box, and `sessions.start`, `console.start` and `tasks.add` all take an `account` argument and answer with the one they really started as. A task is unattended, so "the nightly batch on the second plan" can only be said when the task is WRITTEN or it is never said. - **An id naming no stored slot is REFUSED, not downgraded.** Falling back to the main account for a slot that was forgotten would start the run on whoever happens to be signed in — the exact accident this whole family exists to end. An account belongs to one engine and is refused on another. - **The variable's NAME is the engine adapter's** (`engineAccounts.accountEnv`). No door and no runner spells `CLAUDE_CONFIG_DIR`; an engine that cannot isolate a sign-in shows no control at all rather than one that pretends to work. - **It is NOT remembered per agent, and that is the decision.** A model is a preference; an account is a STATE — how much of a plan is left, which changes hourly. Remembered, it would pin an agent to an exhausted plan and, through the S-34 layer order, would silently outrank the "use this next" gesture: a button that does nothing visible. `agentFarm.activeAccounts` holds it, per engine, and a launch that names one still wins. - **One injection path, not a second one.** The environment goes in through the `layers` argument `providerRuntime.spawnEnvironment` and `terminalEnvOverlay` already take — the place that knows a name left OUT of a terminal overlay is not removed by leaving it out (only `null` removes it). - **A card keeps the account it started on.** It is on the session state, like the route, so a re-spawn or a window reload cannot walk a live conversation onto whichever plan the button was last pressed for.
- Nothing changes on a machine that has captured no accounts: no variable is injected, no box is drawn, and every launch is byte for byte what it was.

### 3.372.0 — U-129 — the install button types a command that can actually run (2026-09-03)

- Every Install button on the Engines page typed `npm install -g …` into a terminal, and on the machine that needs it most — a bare one, with no engine on it — that machine has no Node either. So the answer was `npm is not recognized`, for all of them, which reads as a page whose buttons do not work.
- Three of the five engines ship an official installer that needs nothing at all, and the user's own migration system (`_setup\Install-Engines.ps1`) already puts those FIRST: the `Script` method is method #1 for Claude Code, Codex and Antigravity, with npm as the fallback. This page now copies that table rather than giving a second answer to the same question. Measured on this machine: `claude` resolves to `~/.local/bin`, `codex` to `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` — both native installs, neither from npm.
- - **Claude Code · Codex · Antigravity** — the vendor's own script, picked by platform: `irm … | iex` on Windows, `curl … | bash` elsewhere. Antigravity had no install command at all before, only a sentence, so it was the one row the page could not put in front of a terminal. - **Gemini · OpenCode** — still npm, because that really is where they come from, and the row now says the route needs Node.js v20+ instead of leaving the shell to say something unreadable. - **The sign-in was wrong too, in the way that is hardest to see:** `claude /login` is not an error. It starts an ordinary session with `/login` as the prompt — the CLI opens, nothing signs in. It is `claude auth login`, read off the CLI's own help. Codex and OpenCode were already right. - **And the line is typed into a shell that can run it.** On Windows the terminal is opened as PowerShell: `irm … | iex` typed into cmd is the same unreadable failure, one layer further out.
- **Nothing runs by itself:** The command is still typed, not executed, and the user reads it and presses Enter.

### 3.371.0 — U-126 — the thing that opens is a dot, not a session (2026-09-03)

- **One press on a colour dot opened two palettes:** Not always — only when the same session was drawn twice in the left column, which is exactly when the reader is most likely to press one.
- **The open state was the SESSION ID:** `colorDot()` is called from three places for the three card kinds — the live card, the "where you left off" shelf, the resume list — and each of them drew a palette for any dot whose id matched. A session standing on two surfaces therefore answered a single press with two pickers, the second one hanging over a card the reader never touched.
- The slot is not the answer either: the live cards and the shelf are both inside `c-list`, and the same session really can be on both — a hosted session that has ENDED keeps its card and comes back onto the shelf the moment it is no longer running. So the key is now `<surface>|<sessionId>`, carried by the dot itself (`data-cdot`), and the handler reads it off the button rather than off the slot it was wired for.
- **The colour is still a mark filed against the session id alone:** Only "which dot is open" became per-surface — which is what it always meant.

### 3.370.0 — X-166 — ticking a box and typing a sentence no longer costs you the boxes (2026-09-03)

- The user answered four questions, ticked all four, added a sentence — and the agent was handed the sentence alone. It read as an agent ignoring them. It was not.
- **MEASURED, over every AskUserQuestion in the transcript history (26 calls, eight months): when `response` is present the CLI renders `"The user responded: <text>"` and DROPS `answers` outright:** Eight of those calls lost picks that way. The picks were never lost from the RECORD — `toolUseResult.answers` has all four of them, sitting in the transcript that same evening — only from the model's view. That is the worst shape a bug can have: no error, no gap, an answer that looks complete.
- `answerAsk` was sending both, because the composer always sends both: the picks it has and whatever is in the free-text box. So `askInput` now folds the picks INTO the response text, which is the only channel that survives, and still sends `answers` alongside — it costs nothing, it is what the transcript records, and a CLI that one day honours both would merely repeat itself. The failure worth avoiding is the silent one.
- **Untouched: picking with nothing typed, and typing with nothing picked:** Only the combination changes, and only because the combination was the one that lost data.

### 3.369.0 — X-151 — the doors are modules, and the matrix calls them (2026-08-31)

- `test/test_launch_parity.js` wrote this file's reason down before it existed:
- **> "These live inside quickpick loops and message handlers in extension.ts, which > nothing can call:** **THE SOURCE IS THE HANDLE**, and a missing door here is the > structural failure `_REF/agentfarm-dev.md` names."
- So door parity was measured by throwing regular expressions at 30.476 lines of source, and that measurement was wrong in both directions at once. A door that passed a whole `LaunchOptions` through named none of its fields and read as thirteen gaps; a door that merely MENTIONED a dimension in a comment read as carrying it. And neither could say anything about a dimension nobody had thought to write a regex for — which is exactly how `providerId` and `tier` reached the type, reached the launcher, and never reached the composer.
- **The 13 doors are modules now (`src/launch/doors/`):** , each with one job: `collect(ctx)` returns the intent it has assembled. ‼️ **A door does not start a session.** The spawning, the recording and the UI plumbing stay exactly where they were — this is a live product, and extracting the ANSWER is all the matrix ever needed, while extracting the ACT would have moved seven spawn paths at once for no extra measurement.

### 3.368.0 — X-150 (2/2): 208 obligations, counted (2026-08-31)

- **A matrix can:** 16 dimensions crossed with 13 doors is 208 cells, and every one of them must now hold a verdict in `launch.matrix.json`: `carried`, `exempt: <reason>`, or `gap: <reason>`. A seventeenth dimension therefore arrives with THIRTEEN cells that have no verdict and the suite is red until somebody says, per door, which of the three it is. The obligation is created by the dimension, not by somebody remembering to create it — which is the whole item.
- **‼️ The first count is 67 carried, 141 gaps, and 7 of the 13 doors cannot be pointed at at all:** That is not a regression; it is the first time anybody has had the number. Most doors live inside quickpick loops and message handlers in a 30.476-line file, so their cells are declared rather than measured — and declared as gaps, because `door not addressable yet` is a count and not an excuse. Driving it to zero is X-151's acceptance criterion, stated in a figure rather than a paragraph.
- **And the half that already bites, bites today:** A cell declared `carried` on a door that CAN be addressed is re-measured on every run, so taking a dimension out of `runLauncher` goes red now, without waiting for X-151. `gapBudget` may only be lowered: raising it means a door stopped carrying something, which is the failure being counted. Reseed the observable half with `node test/test_launch_matrix.js --fix` — it never invents an exemption, because only a person can say a dimension does not apply to a door, and saying it requires writing why.
- The 74 source regexes in `test_launch_parity.js` stay where they are for now: they are today's per-cell evidence, and deleting them before the doors are callable would replace measured guarantees with weaker ones. They fall away in X-151, when a door can be called with a fixture and asked what it collected.

### 3.367.0 — X-150 (1/2): the 16 launch dimensions are data now (2026-08-31)

- **A session here is described by 16 answers and can be started from 13 places:** That is 208 obligations, and the sentence stating them lived in a 1.690-line document, in a `_REF` rule, and in 74 hand-written regexes — all three of which depend on a person remembering to read them. What that costs was measured: `providerId` and `tier` were added to the type, wired into the launcher, and simply never given a box in the Console composer. Nothing went red, because nothing was counting.
- **The list is now a record, in `media/afDimensions.js`:** Each row says who the answer belongs to, whether a launch writes it back, whether it is remembered per ENGINE (X-145), whether changing it rebuilds the composer shell, where the dimension does not exist at all — and one line of why it is the way it is. It lives in `media/` for the reason the clock and the narrowing rule do: both sides need it, and the shell key has to be computed BY THE PAGE or every repaint waits a round trip. `src/core/launchDimensions.ts` is its typed door.
- **‼️ The array is pinned to `LaunchOptions` in BOTH directions:** A field added to the interface with no row goes red; a row for a field that no longer exists goes red too. That is the difference between this and the constant it replaced.
- **Three places that counted these fields by hand now fold over the list:** `ENGINE_MEMORY_FIELDS` is derived rather than typed; the row `launchToRemember` files under an engine is built from it; and the six engine-owned dimensions `withLastLaunch` used to name one by one are inherited by the shape. A seventh of them is a flag on a row now, not six edits somebody has to remember.

### 3.366.0 — X-149 — one narrowing rule, loaded by both sides (2026-08-31)

- **There is now one rule and it lives in `media/afLaunch.js`:** , the arrangement the clock and the query language already proved: the pages load it in the webview and the extension host loads the SAME FILE through `src/core/aflaunch.ts`. The four bodies are gone, not shadowed — a page that kept its own would have passed every test and stayed free to drift, so the absence is measured: `defaultEffort`, the one piece of arithmetic the rule owns, no longer appears in any of the three page scripts at all.
- **‼️ It did NOT make the four agree — that would have changed behaviour on surfaces that took months to get right:** The differences are real answers to real cases, so they are PARAMETERS now instead of divergences hidden in a copy: `keep` is S-34 (a setup a real launch on this engine used beats the catalogue), `preferModelDefault` is the Console's "a model was just picked by hand", `resolveAlias` is S-47/K-28 (`big-pickle` resolving to `opencode/big-pickle`), and `takesEffort` is X-35 (an engine with no effort flag offers none, answered at each call site because the two page surfaces resolve it differently before a catalogue has landed). Every one of them is now a word somebody can read, and converging them is a decision there is finally one place to take.
- **`test/test_launch_narrow.js` is one fixture table and every entry point answers all of it:** — Node, a webview sandbox, and the host's own compiled `narrowLaunch`. A case added there is a case every surface has to pass, and the page's answer is asserted equal to the host's on all 23 of them, which is the assertion the four copies could never make. Two source-text regexes in `test_launch_parity.js` and one in `test_tasks_webview.js` were replaced by running the rule rather than reading it: their subject had moved, and re-pointing a regex at the new file would have been the same measurement with the same blind spot.
- First of the four moves in the launch-axis hardening (X-148).

### 3.365.0 — X-106 — an unattended run can say which route serves it (2026-08-31)

- Every launch dimension on a stored automation is there because of one sentence: an automation fires with nobody at a window, so anything about the run has to be stated when the automation is WRITTEN or it is not stated at all. The endpoint the process really talks to was the one dimension that could not be stated anywhere — a nightly job took whichever standing route the agent happened to have at 3 a.m., which is a decision nobody made about a run nobody watched.
- **It travels by the shape, not by ten call sites:** `providerId` and `tier` are now part of `RunDimensions`, so a schedule, a trigger, a template and a workflow step carry them without any of those knowing they exist — and a retry, a clone and an edit inherit them the same way. Both spawn shapes in the runner (the headless one and the interactive one, which live 400 lines apart) pass the task's own route to the same resolver the Console and the terminals already use.
- **Refused, not narrowed — and that is the difference between a composer and an automation:** A composer redraws, so dropping an impossible value and saying so is right there. An automation is written once and read months later, so a route quietly discarded at write time is a run that silently takes the agent's standing endpoint for ever after. A route this engine cannot be pointed at, a tier the route does not map, a tier with no route at all, and a route beside a `cli` profile are each refused by name at the moment they are written down.
- Whether a route EXISTS is not a question `core/bridge.ts` can answer — it needs the engine's adapter and the user's own profiles — so it arrives as a callback, and the callback is attached in exactly ONE place. Ten doors passing their own would be ten places to leave it off, and the one left off is the schedule that stores a typo tonight and refuses it at 3 a.m.

### 3.364.0 — X-105 (6/n): the card says who served the last turn, not only who was asked for (2026-08-31)

- X-102 keeps a run's DECLARED half and its REPORTED half apart because they are allowed to differ, and the Console card had only ever shown the first. On the engine that may change provider at a turn boundary that gap is a whole state: the change lands, the next turn has not started, and the engine's own events still name the provider that served turn four while the card is configured on another. A card that could state only one of those was answering the wrong question for the entire window between the two.
- The route mark now carries three facts and each line is drawn only when it says something the line above it does not: the pill is **who serves the next turn**, `Started on:` is the launch record (untouched — the manifest is immutable), and `Last turn ran on:` is **what the engine itself reported**, in its own words rather than as the request. Both derived through the anti-guess reader, so a prefix is a provider only where the engine published it — which is why this is absent on Claude and always will be: the transcript names a model and never a route, measured, and reading one out of the other is the one thing this family forbids.
- `console.sessions` and `console.switch` hand back the same three facts from the same single reader, so an agent and the panel cannot come away with different answers about one card.

### 3.363.0 — X-105 (5/n): a provider change is answered, not guessed (2026-08-31)

- The item's second sentence is a POLICY, and it had no home in the code: Claude forbids a provider change inside one conversation and wants a new session or a fork, while OpenCode genuinely allows one at a turn boundary and records it as a new turn identity. Until now nothing asked the question at all — `console.setModel` on OpenCode moved the provider silently (the wire name **is** `provider/model`), and the card went on naming the route it launched on.
- **The verdict is the adapter's, and no engine is named to reach it:** `src/core/providerSwitch.ts` answers one question — may this live session change who serves it, and when — out of `providerScope` and `canSwitchProviderAtTurnBoundary`. Four answers, and `unchanged` is one of them: `unchanged` · `now` · `turn-boundary` · `refuse`. A refusal carries the remedy (`fork` when there is a conversation to carry over, `new` when there is not), because a no with nothing after it leaves the caller nowhere. The module names no engine at all, and a test measures that: a sixth engine gets the right answer by declaring its scope, not by somebody remembering to edit a list.
- **`console.switch` is the one door:** It asks the policy, THROWS a refusal rather than returning a success with a sentence beside it, and — on the engine where the model names the provider — refuses to invent a model, listing what that provider actually serves instead. `console.setModel` still changes what answers; this changes who serves it, and on two engines those are different questions.
- **And the card says who is serving it NOW:** On OpenCode a mid-session model change moves the provider, so a pill naming the launch value was pointing at an endpoint the session had stopped talking to. Both facts are kept and neither is stored twice: the current provider is DERIVED from the model the card is on (through the anti-guess reader — a prefix is only a provider when the engine published it), the launch record is untouched because X-102 made it immutable, and the panel's first line is the current one with `Started on:` under it. Same mark, no second pill, and the line is drawn only on a card that really moved.

### 3.362.0 — X-105 (4/n): the composer PICKS the route, and the bridge can too (2026-08-31)

- **X-103 made the route pickable in the launcher; X-105 (2/n) made the started card say what serves it:** Between those two the composer carried the pick **blind**: a route handed over by a launcher was applied and had no box, so the person about to press Send could not see it, change it, or clear it — and a composer opened without one had no way to choose at all.
- It has two controls now, and **the words are the engine's**: `Route` on Claude, `Provider` on OpenCode, `Tier` under it — all read off the engine's own adapter through the SAME `providerFormFor` the launcher's route row is built from and the card's pill resolves through. A fourth reader is exactly what X-105's acceptance line cannot survive.
- **‼️ AND THE SUB-AXIS IS ONLY A BOX WHERE IT IS A TIER:** Where the engine's sub-axis is the MODEL — OpenCode names one `provider/model` — that axis is already on this strip, so a picked provider **narrows the model box that is there** instead of adding a second one beside it. Two controls for one subject can disagree within a click, and ONE SUBJECT is the rule that would break.
- **‼️ Nothing is drawn where there is nothing to choose:** Four of five engines have no provider axis, and the fifth gets no box until a route has actually been set up — so the row measured at `nowrap` is unchanged for everybody who has never made one. There is no variant control either, and that is the transport's answer rather than an omission: a hosted card is spoken to over ACP, which declares only model and mode. The form says why, in the route box's own hover.

### 3.361.0 — S-51 — the engine moves, and the boxes move with it (2026-08-31)

- **In the user's words: *"change the engine and the models and the efforts used to follow it; now they do not:** You go to open the model box yourself, and only once you press it does it become what it should have been."*
- **That last sentence was the whole diagnosis:** The model list, the effort list and the hint that says what an engine changes about the composer are **all** drawn off the composer's current engine, so none of them moves without a shell rebuild — and the engine picker had no rebuild of its own. Its only one was the host's echo of the choice, which arrives at the one moment the reader's hand is still on the picker they just used, because a native `<select>` keeps focus after a choice. M-33 read that as hands-on and put the rebuild on the slate; the debt was then paid by the `focusout` of the user reaching for the model box — which is precisely why the list corrected itself the instant they went to argue with it.
- **M-33 was not the thing to loosen:** Its rule already says *only a rebuild nobody asked for waits*, and this one was asked for by the very hand it was waiting on. So the fix is the answer the model picker beside it has always used: the engine picker repaints on the spot, and hands focus back to itself afterwards so an arrow-key walk through the engine list still reaches its second step.
- Measured on the page, with the hand held on the picker the way the browser holds it — and the deferral it does **not** touch is measured in the same file: a rebuild nobody asked for still waits while a box is held, and is still paid the moment the hands come free.

### 3.360.0 — X-105 (3/n): one reader for the route, and the bridge says it too (2026-08-31)

- `console.sessions` described every dimension of a hosted card except the one this whole line of work exists to establish: **what is answering on the other side of the engine.** An agent could read the engine, the shape, the model, the effort, the permissions and the tokens — and still not know which company served the conversation.
- It says `route` now: the route's id and name, the engine's own noun for it, the tier, the endpoint, the auth kind, and the engine's own words for how long the pick lasts. `null` where there is none — and the op's description says what that means, because otherwise a missing route reads as a missing feature.
- **And it is the same reader the card draws from:** The resolution lives in one place that both the page and the op delegate to, and it asks the engine's own adapter — the same one the launcher's route row is built from — for the words it uses. If those were two readings, "what the card says is what the process runs on" could not be true by construction: it can only hold while there is one statement.

### 3.359.0 — X-105 (2/n): the card says what it is served by (2026-08-31)

- **The engine badge has always said which **program** is running:** It has never said what that program is *talking to* — and two cards on the same engine can be served by two different companies' models at the same moment. The Console has carried the pick since 3.35x and said it out loud nowhere, which made the one fact this whole line of work exists to establish the one fact you could not check.
- **The route is now its own mark, beside the engine badge:** Not a line inside it: the engine is the program, the route is the endpoint, and a badge that answers two questions is a badge that will eventually answer one of them wrong.
- **It appears only when there **is** a route:** Four of the five engines have no provider axis at all and most Claude launches pick none — a pill reading "none" on every row would cost every reader something to learn nothing.
- The pill carries the route's own short name; hovering it opens with the long form, then the **endpoint** — the line that makes the mark checkable instead of decorative — the tier, and the engine's own words for how long the pick lasts (fixed for the session on Claude; changeable at a turn boundary on OpenCode). Those words come from the same reader the launcher's route row is built from, so what the card says and what the picker said cannot drift apart.

### 3.358.0 — X-105 (1/n): the Console card runs on the route the card says it is on (2026-08-31)

- **The same defect, a fourth time — this time on the surface the Console exists for:** 
- Three surfaces already hand the CLI a complete environment: the per-turn engines since X-101, the OS terminal window since X-104. The Console's own Claude path never did. It started the process with a working directory and nothing else, so the session inherited whatever the VS Code window happened to be carrying.
- What that produces is this family's quiet failure, and it is the reason it went unnoticed: a card started on Kimi keeps Kimi on its state, writes Kimi into the launch manifest and reports Kimi on every surface — while the process talks to whichever endpoint the window held. Every surface agrees with every other one, and all of them are wrong about the only thing that matters.
- **And the card with no route chosen is the half that is easy to miss:** "No route" is not "no statement": the official endpoint is reached by *clearing* what was inherited. A leftover `ANTHROPIC_BASE_URL` in the window answered the exact question the official route was picked to answer, and nothing here could say otherwise because nothing here was said at all.

### 3.357.0 — S-50 and U-127: the Console the door opened, and one Sessions column (2026-08-31)

- Two long-standing wrongs, each fixed at the one place it was made.
- ### S-50 — the play button works even when the Console was closed
- Every door that starts a session hands the Console the agent, the engine and the whole setup: the ▶ on an agent row, the launcher's **Start Session**, "Talk to agent", the project page. It worked — as long as the Console was **already open**. Opened cold, none of it arrived: not the agent, not the engine, not the model, effort or permission mode. The composer came up on the fleet defaults as though nobody had chosen anything, on both doors at once, which is exactly why it read as "the feature does not work" rather than as a timing bug.
- **The cause was one line of ordering:** The page's shell was built inside the panel's constructor, which runs **before** `show()` applies the caller's options — so the first payload the page ever read described a panel nobody had told anything yet. The refresh that followed pushed the real answers into a webview whose script had not run, and **a push into an unloaded page is not late, it is lost**. The preselected agent is deliberately one-shot (it seeds the picker once and is let go), so that dropped payload did not merely arrive late: it took the agent with it, and nothing could ever say it again. With no session running, no host event fires either — so "later" never came at all.

### 3.356.0 — X-104 (1/n): the OS terminal window runs on the route you picked (2026-08-31)

- Of every surface that starts a CLI, the external terminal was the only one that carried **no environment at all**.
- The integrated terminal has taken an overlay since 3.34x — the agent's own variables, plus the route's endpoint and key, plus the names to CLEAR so an inherited Anthropic route cannot answer the same question a second time. The external branch, three lines away, dropped every bit of it. So with `Agent Farm: External Terminal` switched on, a session you picked as Kimi (or MiniMax, or any custom route) opened on the **default** route — and the launcher row, the engine badge and the launch manifest all said Kimi, because every one of them reads what you SELECTED rather than what the process was given. Nothing anywhere contradicted it. The same hole swallowed a custom CLI's own variables, and it was there for both doors that open an OS window: a session terminal and an interactive task set to "OS terminal window".
- **Both doors now hand the window exactly the map their integrated twin gets:** Where you want to watch a run has never been a statement about what it should run on.
- **On Windows the values travel in a file the script eats, and they are not in the script:** There is no in-memory channel to an OS window here: when Windows Terminal is already running, `wt.exe` is a thin client and the window is opened by a process that started long before this one, so an environment set on the spawn reaches nothing. A route's value is an API key, so the design is about how briefly it exists: the launcher script's first act is to read the file and **delete** it, before it runs anything. A window closed later — with the CLI still running, or killed — leaves nothing behind. Writing the values into the script instead would have left them for as long as the session lasted, because the script only removes itself on its last line and a session is exactly the case that never reaches it.

### 3.355.0 — M-33 closed: the Plan tab can delete, and no page repaints under your hands (2026-08-31)

- **Two halves of one report:** The first was fixed last release on the page it was reported from; both are finished here.
- ### Plan rows can be deleted — in bulk, and one at a time
- **Both, and the difference between them is the point:** **The row ✕ asks nothing**: one row, you are pointing straight at it, and a box in the way of every tidy-up is the thing that made the page feel like it was arguing. What replaces the question is an **Undo** — the object goes back with its own id and in its own place, so a workflow that comes back is still the workflow its triggers point at. Re-creating it from the title would have made a new one and left them aimed at nothing. **The bulk delete asks first** and says what it counted, broken down by kind: "delete 6 items" hides that four of them were workflows.
- **Every row can be ticked now, not only the switchable ones:** A workflow and a template have no switch, so they could not be picked at all — and the one act that applies to all four kinds was exactly the one that could not reach them. The two switch buttons say how much of your selection they can touch and grey out when the answer is none; the ticks are pruned to what is actually on screen, so "4 selected" always means four boxes in front of you and a filter change cannot leave a hidden row inside a delete.

### 3.354.0 — M-33 — the caret stops getting thrown out of the box (2026-08-31)

- **Space did nothing:** Focus had already gone. When something changes elsewhere in the farm the extension pushes fresh data at every open page, and a page answers by redrawing itself completely — which detaches the box you were typing in, and a detached box cannot hold the caret. The browser hands focus back to the page body, and on the body space IS Page Down.
- **Every detail of the report follows from that one line:** It is intermittent because it depends on a push landing while you type; it bites when another agent is running because that is what produces the pushes; it bites hardest right after opening a page because that is when the first ones arrive; and it never happened on the Backlog page because nothing pushes at it.
- The rule against it had already been written — for the Tasks page's own 30-second refresh, with the comment "never re-render under the user's fingers". The push simply did not go through it.
- **Now there is one guard, and it ships to every page rather than being something a page has to remember:** It knows three things the old check did not:

### 3.353.0 — X-102 — what a run was asked to be, beside what actually answered (2026-08-31)

- **Agent Farm has always recorded which MODEL a session ran:** It recorded nothing about which ROUTE served it, which stored profile at which revision, or what was REQUESTED as opposed to what came back — and no transcript carries any of those. Measured on a real Claude JSONL (2.1.251, 1373 records): the file names the session id, the folder, the version, the entrypoint and the permission mode, and nothing else that matters here. So for those questions the launch manifest is not the convenient witness, it is the only one.
- **The manifest itself has been written on every spawn since 3.352.0 — terminal, Console and every automated run:** This release is the half that makes it worth having: the answer that comes BACK, and the two held side by side.
- **What the engine actually said, read out of its own events:** One rule, and it is the one the catalogs already followed: *the field, not the printed prefix*. A provider is reported when the engine NAMED it in a field of its own; a model spelled with a slash in it proves nothing. OpenCode publishes the same fact three ways — its export, its JSON run stream, its ACP config options — and has changed its wire shape twice already, so one scan collects the named fields wherever they sit rather than three readers that each need remembering. The one qualified name the engine states as its own current value is cut only where the head is a provider that same engine published.
- **Claude reports no route, and never will:** Measured in August against a local fake endpoint: two Claude processes ran concurrently on separate routes under one model name, and the transcript preserved neither. So `claude-opus-5` is not evidence of Anthropic, the reported-provider list on this engine is permanently empty, and that is an answer rather than a gap. The MODEL is a different field and the transcript does name it — which is what the manifest now has to compare itself against.

### 3.352.0 — S-49 + S-48: the composer stops arguing with the hand on it, and the row you pressed is the agent you get (2026-08-31)

- Two halves of the same complaint — the agent · engine · model · effort · permission matrix, where fixing one dimension has kept breaking another.
- **S-49 — a DOOR seeds the composer; the composer never reseeds itself:** Set a model, set an effort, set a permission mode in the Console composer, then change your mind about WHO runs it — and all three answers were replaced by the newly chosen agent's last-launch record. That rule (S-34) is right for a door that OPENS the panel and wrong for a box the person is standing in: the last decision of a launch was silently undoing the first three. The agent picker now REPAINTS and does nothing else. Where the boxes open from is still decided once, host-side, by the door that opened the panel (`ConsolePanel.show` → `composerLaunch`); once they are drawn, the only thing that writes them is a hand on them. The Superpowers chip follows the new agent exactly as before, because an untouched choice is resolved against the agent the picker is showing rather than written anywhere — and a chip the user HAS pressed now keeps their answer for the same reason the boxes do.
- **S-48 — the row you pressed is the agent you get:** Pressing the play triangle on an agent row sometimes asked "Select an agent" anyway, and picking a different name there really did start a different agent, so aiming at the row meant nothing. It was a RACE, and it began when the engine work multiplied the live events: `live` fires once per hook, every one of them rebuilt every row in the Agents view including the inline action bar under the pointer, and a press landing inside that rebuild reaches an action with no row behind it — so the command arrives with no argument at all.
- **- **The cure:** the Agents tree is redrawn at most once per 250 ms instead of once per event:** Below the eye's threshold for a status column, far above the width of a click — and cheaper on an old machine besides. - **The belt:** the Agents view is now a real `TreeView`, so play can ask which row it is standing on before it asks the person. One row, an agent row, a visible view — anything less still falls through to the picker. It is not a silent substitution: the surface dialog that follows is titled with the agent's name. - **And the argument NAMES an agent; the fleet ANSWERS** (`core/agentArg.ts`). A tree row's own `AgentInfo` is a snapshot of the fleet as of the last redraw, and it used to be believed on sight — an agent renamed or moved since then started a session in a folder that is not there any more. A caller naming somebody the fleet no longer has is now refused BY NAME instead of being turned into a menu, and a name two agents answer to is refused rather than resolved to whichever came first.

### 3.351.0 — U-84 — the Telegram bridge card, on the page that is made of its settings (2026-08-30)

- **U-84's first half put a live management card on the Toolbox:** Its item asked for that card in TWO places, and the second one was the harder half to get right: Farm Settings already draws `telegram.enabled`, `allowedChats`, `maxDailyUSD` and `defaultAgent` as four ordinary rows, and a card that repeated them would be a page that can disagree with itself.
- **So the card carries only what a settings row cannot:** The token is in the secret vault, the day's spend is in the extension's own storage, and "is the poller alive" is a fact about a running process — none of the three is in any box, and all three are the reason somebody opens this page when their phone gets no answer. The card says: token in the vault or not, which bot answered, poller alive or stopped, how many chats the list admits, and what today has cost against today's ceiling. Plus the two acts that are not settings at all — connect a token, ask Telegram who this bot is.
- **‼️ ONE CARD, and that is now structural rather than a promise:** The badge, the tones, the budget bar and the wiring live in `media/afTelegram.js`, shipped to every page by the shell; the data is composed once by `telegramCard()` in `core/telegramCockpit.ts`; and every `svc-*` message both pages can post is handled by one function in `panels/base.ts` — including the allowlist of the three settings a webview may write, which is the thing a second copy forgets. The tests fail if either page grows a tone vocabulary of its own.
- **‼️ A SETTING WHOSE ANSWER IS A NAME THAT HAS TO EXIST NOW GETS A PICKER:** `telegram.defaultAgent` was a text box, so the one way to get it wrong — type a name no agent has — was the easiest thing to do and produced no error anywhere. The correct values are not a fact of the manifest (they are whatever agents this machine has today), so the schema names a SOURCE instead: `"x-af-values": "agent"`, and the host fills it in on every draw. Derived, never a list of keys on the page — the same rule `x-af-browse` follows, and `wikiAgent` gets the picker for free. A stored name the host has never heard of stays selected and is marked "not on this machine", because a page that silently swapped it would be changing a setting nobody touched.

### 3.350.0 — X-103 — the route is something you can PICK (2026-08-30)

- X-101 built one entrance for resolving which route a launch runs on, and then left the choice unreachable: it was read from `agentFarm.agentEngineDefaults[<agent>]["claude"].providerId` and nothing wrote it, so the only way to run a session on Kimi or MiniMax was to hand-edit `settings.json`. The Start Session launcher now draws the whole axis — **engine → route/provider → tier/model → variant** — from the adapter's own catalog, and a saved profile stores it.
- **The rows come from the adapter, never from the engine's name:** A form with `if (engine === 'claude')` in it is a second statement of what each engine offers, and the day an adapter changes its mind the form goes on drawing the old answer confidently. The filter for what may be offered is the engine's own word — `normalizeSelection`.
- **‼️ Only what can actually run is offered:** The Claude catalog carries the shipped route *templates* (Anthropic, Kimi, MiniMax) beside your own profiles. A template is a SHAPE: no id to hold a credential under, nothing behind it. Picked, it resolves to `unknown` identity and injects **nothing** — the session would run on whatever the shell was already carrying while the row said "Kimi". That is exactly the lie X-101 exists to prevent, so the launcher offers profiles and the template list stays where you create one.
- **Changing a row drops what is below it, and says so:** Pick MiniMax after choosing a Kimi tier and the tier goes, named, with the tiers that route really maps. Pick a different OpenCode provider and a model it does not serve goes. Silence there is how a person stops trusting a form.

### 3.349.0 — X-101 (3/3): the Console, and the acceptance line closed (2026-08-30)

- The ACP host spawned with **no `env` at all**, which means it inherited whatever the VS Code window happened to be carrying. On four engines that is correct; on Claude it is a second answer to the question a route profile was chosen to answer — the runner's defect, on the surface people actually sit and watch.
- It now builds a complete environment through the same `spawnEnvironment` the runner uses, from the same resolved runtime, handed in as a dependency: the host reads no profiles and touches no keychain, and the suite fails the build if it starts to.
- **‼️ The item's acceptance line, closed and measured:** All four launch surfaces — headless runs, interactive task terminals, session terminals and Console cards — resolve through one symbol, `engineRuntimeFor(agentId, engine)`. The suite reads the real source and fails if a second resolution appears beside it, or if any spawn site returns to spreading `process.env` with the route still in it.
- Three routes side by side (Anthropic, Kimi, MiniMax) and an OpenCode native selection are measured not to contaminate one another: their keys never cross, their endpoints never cross, and the first-party route — the one most easily got wrong, since it has no base url and no key of its own — still clears an inherited one rather than quietly running on it while the manifest says Anthropic.

### 3.348.0 — X-101 (2/2): the terminal surfaces, where absence is not an instruction (2026-08-30)

- **3.347.0 isolated the route for spawned runs:** A terminal is a different shape of problem and not a duplicate of that one.
- **`cp.spawn` is handed a COMPLETE environment, so removing a name means simply not putting it in:** `vscode.window.createTerminal({ env })` is handed an OVERLAY that VS Code merges onto the window's own environment — so a route name left out changes nothing at all and the inherited one survives untouched. On that surface the absence of an instruction is not an instruction.
- Measured in the API's own declaration rather than assumed:
- env?: { [key: string]: string | null | undefined }

### 3.347.0 — X-101 — one entrance, and a route a run cannot be lied to about (2026-08-30)

- **X-98 wrote the adapter contract, X-99 the catalogs, X-100 the ownership and the vault boundary:** **None of them ran.** `readClaudeRouteCatalog` and `readOpenCodeCatalog` were called from nowhere — measured with grep — and the adapter interface had no implementations at all. This release is where the four become one call: `resolveRuntime(engine, selection)` in `core/providerRegistry.ts`, with the two real adapters behind it.
- **‼️ The environment names were MEASURED, not remembered:** Read out of the real `claude` binary on this machine, a 217 MB bundle:
- grep -ao 'ANTHROPIC_[A-Z0-9_]*' claude | sort -u -> 75 names grep -ao 'CLAUDE_[A-Z0-9_]*' claude | sort -u -> ~200 names
- **The documentation lists a fraction of them:** A list written from the docs would have missed `ANTHROPIC_PROFILE`, `ANTHROPIC_CONFIG_DIR`, `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_UNIX_SOCKET`, the Bedrock / Vertex / Foundry / Mantle families, `CLAUDE_CODE_HTTP_PROXY` and `CLAUDE_CODE_CLIENT_CERT` — every one of which moves the route somewhere else.

### 3.346.0 — U-84 — the Telegram bridge, on a card that cannot lie about it (2026-08-30)

- The bridge that lets a chat talk to your agents has been in the extension for a while, and it announced itself through two `showWarningMessage` calls at startup and then went silent. A token that expired on Tuesday looked exactly like a bridge nobody had switched on, and the only way to change anything about it was to find four settings by name.
- The Toolbox page grows a **Services** tab — the first tab on that page that is about something RUNNING rather than files on disk — holding a Telegram Bridge card with its state, its sign-in, its allowlist, its ceiling and its default agent.
- **‼️ The card derives nothing for itself:** Every badge and figure comes from `core/telegramCockpit.ts`, which is measured against what `applyChatBridge()` really does. A page working out "is it running" from `enabled && hasToken` would be a second copy of the launch rules living in a file nobody thinks of as launch logic, going out of date the first time that function changes — in green.
- **‼️ RUNNING and USABLE are two different questions:** , and this was measured rather than assumed: an empty allowlist does NOT stop the poller. It warns and starts anyway, and every message that arrives is refused. A single badge collapsing the two would call a live-but-deaf bridge "off" and send somebody to restart a service that is running fine.

### 3.345.0 — X-100 (surface): the routes Agent Farm holds, and the boundary drawn where it can be measured (2026-08-30)

- **The other half of X-100:** 3.343.0 shipped the core — who owns which fact, how a secret is keyed, what the public half of a profile is — and shipped it with nothing calling it. This is the surface, the bridge ops and the parity entry, in one commit because the item's acceptance requires all three together.
- **The failure this prevents is still two vaults:** , and the surface is where that becomes a thing a person can act on. So the Engines page now draws the ownership table itself: engine × kind of data, each cell saying which side owns it and carrying the reason in words on its hover. ‼️ The `selection` column reads **Agent Farm on every engine** — which provider a run was actually started with is history, not configuration, and no engine keeps it.
- ‼️ **That column was missing from the first drawing and it was found by looking at the page, not by a test.** `ownershipTable` listed the rows in `OWNERSHIP`, and `selection` is answered by rule rather than by row — so a kind that exists in the type and is enforced by `ownerOf` appeared nowhere a person could look. The table is now derived from `ownerOf`, one call per cell: one rule, one reader.
- **The routes themselves:** get CRUD, copy, revision and credential status:

### 3.344.0 — X-145 — a remembered setup belongs to ONE engine, and ▶ answers from Settings (2026-08-30)

- **The reported fault, in the user's own sequence:** Start OpenCode from the launcher without permissions (`manual`). Then press ▶ on the same agent's row and choose Claude — whose default in `~/.claude/settings.json` is `bypassPermissions`. The Claude session came up in `manual`. Nobody had ever said `manual` about Claude.
- Three separate defects were behind it, and this release closes all three.
- **1. The memory had ONE box for an agent used on three engines:** The record kept one model, one effort and one permission mode per agent, so every engine overwrote the last. S-34 had already dropped the model and the effort on an engine switch — half a fix, because dropping is not remembering: an agent used on two engines has two setups, and emptying the boxes made the user retype the one they had chosen on that engine an hour earlier. The record now holds `byEngine`, one row per engine, and a switch **recalls** that engine's setup. The other engines' rows survive every launch.
- ‼️ **And the permission mode falls with them.** S-34 kept it across the switch on the grounds that `plan` is Agent Farm's word rather than any CLI's — true about the spelling, false about the effect. It becomes a **flag**, and a flag beats the engine's own settings file. Silence is what lets that file decide, so silence is what an engine with no row of its own gets.

### 3.343.0 — X-100 (core): who owns which fact, and where the vault boundary runs (2026-08-30)

- **‼️ **The core half of X-100:** The Engines/Providers surface, its bridge ops and the parity entry are NOT in this release** — the item stays open.
- **The failure this prevents is two vaults:** The obvious design gives every engine the same provider-profile manager. For Claude Code that is exactly right: a provider there is a route Agent Farm assembles, and if Agent Farm does not hold it, nobody does. For OpenCode it is exactly wrong — that engine already owns `/connect`, `opencode auth login`, `auth.json` and `opencode.json`, and a second copy makes two vaults and two revisions where the stale one wins silently.
- So ownership is a fact **per engine per kind of data**, in one table a surface can draw, each row saying WHY in words a person can check. `core/providerOwnership.ts` also settles three things once:
- - **The secret is keyed by the profile ID, never the label.** A key built from a name moves the moment somebody edits the name, and the old entry stays in the OS keychain forever with nothing to collect it — the profile silently has no credential. - **The public half is built by NAMING what is public, never by deleting what is not.** Settings, the bridge, the CLI, a notice and an export are the same question asked five times; a deny-list grows a hole the first time somebody adds a field. ‼️ Whether a credential EXISTS is public; the credential is not. - **Agent Farm refuses to manage what it does not own** — and the refusal names the engine's own way of doing it (`opencode auth login`), because a refusal that does not say what to do instead is just a wall.

### 3.342.0 — X-99 — what is on offer, from the two places that actually know (2026-08-30)

- **Two engines, two owners, and the ownership is the design:** OpenCode owns its provider list, its credentials and its config; Agent Farm reads the public half and records what was chosen rather than keeping a second copy — two vaults, two revisions and two contradicting truths being the alternative. So that catalog is **measured**. Claude Code has no provider list at all: a provider there is a ROUTE Agent Farm assembles (base URL, auth kind, tier→model mapping), so that catalog is **declared** — and because living provider names must not require a code change, the templates are DATA and a route the user describes in settings is read by the same function into the same shape, replacing a shipped row of the same name rather than appearing twice beside it.
- `core/providerCatalog.ts` reads `opencode models --verbose` by brace depth (the objects are multi-line and hold braces of their own, so a line-based split joins two models the first time one gains a field), and takes the provider from the `providerID` **field** — never from splitting the printed `provider/model` line. That is X-98's rule one layer up, and it is one line of code.
- **Measured on OpenCode 1.18.19 here, 30 Aug 2026 — three things the shape had to be honest about:** 
- - **Reasoning is not the same question as variants.** All six models this machine reaches report `capabilities.reasoning: true`; exactly two publish a `variants` map. A level box drawn off the capability would offer the engine words it will not take, so only published variants are offered. - **Zero is a figure; nothing is not.** The free provider really does cost zero, and calling that "unknown" makes an honest catalog unreadable. The other half: one model states no input limit at all, and reporting 0 there would be inventing a ceiling. - **`ref === providerID + "/" + id` on every row** — so the printed line is a cross-check and the field is the source, which is exactly the right way round.

### 3.341.0 — X-98 — who actually served this session, as one shape for every engine (2026-08-30)

- **The first item of the X-97 family:** Nothing on screen changes — this is the sentence the next twenty items are written against.
- **Agent Farm starts sessions on five engines and records, for each, which MODEL ran:** It records **no provider at all** — and the two engines that have a provider axis do not mean the same thing by the word. On **Claude Code** a provider is a ROUTE (base URL, auth, tier) that Agent Farm owns and injects, fixed for the whole session: changing it is a different program, not a resume. On **OpenCode** the provider is the engine's own identity and the first half of the wire name (`opencode/big-pickle`), and the engine legitimately allows it to change at a turn boundary. Written down as one shape that difference is a single field — `scope`. Written down per surface it becomes an `if (engine === 'claude')` in twenty places, and the first one somebody forgets is a session claiming a route it did not run on.
- `core/providerIdentity.ts` carries `ProviderIdentity`, `TurnRuntimeIdentity` and the axes they turn on: `origin` (agent-farm-profile · engine-native · external · legacy-inherit · unknown · not-applicable), `scope`, and `proof` (launch-declared · engine-reported · matched · unknown). `core/providerAdapter.ts` carries the contract the engines answer — catalog, runtime, preflight, identity, resume, billing — plus the complete answer for an engine that has no provider axis at all, which three of the five do not.
- **‼️ NOTHING GUESSES THE PROVIDER FROM THE MODEL NAME, and that is now measured rather than asked for:** `claude-opus-5` does not prove Anthropic served it: measured in August against a local fake endpoint, two routes answered under the same model name and the transcript preserved neither. So a provider is DECLARED, or REPORTED, or unknown — and `unknown` is an answer this system has to be able to give rather than an absence it fills in. A record from before any of this stays `legacy-inherit`, which says "nobody was asked" and can be backfilled from real evidence later, rather than `unknown`, which would say "asked, no answer".

### 3.340.0 — S-34 reopened: a remembered model belongs to the engine it ran on (2026-08-30)

- **‼️ Switch the launcher from Antigravity to Claude, press Start, and the Console came up saying Claude with the Antigravity model in the box beside it:** A setup that cannot run, drawn as if it would. 3.339.0 taught the composer to keep a seeded model the engine's published catalog does not list — right, because a catalog is what an engine OFFERS and not everything it can run — but it decided whether to keep by comparing the seeded value against itself, a comparison that cannot fail. So the reconcile was not narrowed, it was silenced, and the one case it exists for went with it.
- Being per-engine is a thing that has to be **checked**, and three readers now check it against the same rule (`rememberedOn`):
- - **The memory layer.** `withLastLaunch` inherited the model and the effort from the record whatever engine the launch stated. `gemini-3-pro` is not something Claude can be asked to be, and the record is one row per agent — so any door that changed the engine carried the previous engine's model across. The model and the effort are the engine's own vocabulary and are dropped with it; the permission mode and the ⚡ discipline are this extension's own words, spelled the same on every engine, and stay. - **The Console panel.** It reads the record directly rather than through that layer, so the rule did not reach it: told to open on Claude for an agent whose record says Antigravity, it handed the composer the Antigravity model. - **The page.** A handed-over setup now names the engine it was built for, and the composer keeps it only while that engine is the one on screen.
- ‼️ **A record with no engine on it is still inherited.** It predates the engine being recorded, so it cannot contradict anything, and treating silence as a mismatch would empty the boxes for every agent that has not been started since.

### 3.339.0 — S-34 — it remembered, but not all of it — and the row never said what it would start (2026-08-30)

- Three defects with one shape: a launch setup that is known and not shown, or shown and not kept.
- **‼️ "Sometimes it forgets the model, sometimes the effort" — and it was one line in the page:** Every door seeds the composer's boxes from the agent's record; the composer then reconciled them against the engine's published catalog and **cleared anything the catalog does not list**. A catalog is what an engine is OFFERING, not what it can run — an alias typed into the launcher's "Other…" box, a model added to `agentFarm.modelAliases` and later removed, a level a catalog stopped advertising. So the model vanished; and because the effort list is looked up BY model, an emptied model then landed on a different list and took the effort with it. A value a real launch on **this** engine used now survives the check, and the select draws it. An engine CHANGE still clears both — those values belong to a different program, which is the case the reconcile exists for.
- **‼️ Starting an agent from a Projects page silently reset that agent's remembered engine:** That door stated the fleet default engine as its own answer — which beats the memory, because what a caller says wins — and then recorded it. Two doors writing one record, one of them with an answer nobody gave: which is the whole of "sometimes it insists on Antigravity and then suddenly it is Claude again". It now inherits like every other door.
- **‼️ The Start row said what was CHANGED, not what will run:** `describeLaunch` drops the engine when it is Claude and the model when nothing was typed — right for a toast, backwards on the row you press: the two facts that decide what a session IS were the two it left out, and the line read `effort high · auto · superpowers on`. There is now a SETUP line, always in the same order — **engine · model · effort · permissions · ⚡ · project** — and it prints the resolved answer rather than the word "default", because a row saying "agent default" makes you open a second screen to find out what will happen. Short on purpose: the effort is the bare word, the discipline is `⚡on`/`⚡off`, and a field nobody stated is left out rather than spending a column on "default". The model is named either way, because "which model" is never a detail.

### 3.338.0 — K-36 · M-32: the list the install actually has, and the form that gives it back (2026-08-30)

- Two losses of information, both silent, both now measured.
- **‼️ K-36 — the `/` picker offered 18 commands where the same machine's terminal offers 49:** The catalog's one authoritative source is a running session's `system:init`, and the composer's `/` is pressed exactly when there is not one yet — so the picker fell back to the shipped table, and no shipped table can ever close that gap: two thirds of the real list is skills and plugins, i.e. facts about THIS install. So the report is now **remembered** (per engine, and per agent where an agent has folders of its own), written by every door that sees one and read by the ones that cannot. Nothing is spawned to learn it — a session started for its own reasons pays for it once and every later composer is right. `toolbox.slashCommands` reads the same record, so an agent asking "what could I type here" is told what the picker offers.
- **‼️ And a report is a COMPLETE answer, not an addition:** Measured against a real Claude: 49 names, and `/cost` — which is in the shipped table — is not among them. Offering it anyway teaches a command that answers "unknown", so once a process has named its commands, a shipped row it did not name is dropped. The disk is untouched by this: a file that exists is a command whether or not a running session listed it.
- **‼️ Two more answers out of the same event, replacing two guesses:** `system:init.skills` names which of the reported commands are SKILLS — filing them as the engine's own printed a claim about a machine as a claim about a program — and `system:init.terminal_slash_commands` is the `tui` flag measured rather than marked by hand (the CLI names `doctor` and `color`; the table guessed five). Where the CLI says nothing, the shipped guess stands.

### 3.337.0 — K-32 — the parity that matters is not "both exist" (2026-08-30)

- **The acceptance half of K-14:** The bridge op, the merge and the picker were built across K-29 · K-30 · K-31; this is what now **fails the build** if they come apart.
- **‼️ The Console's door and the bridge op are the same capability, and it is pinned by DERIVATION:** `parity.manifest.json` already said so; what makes it true is that the page's `slashCommands` handler calls the same `scanSlashSources` + `getSlashCommands` rather than assembling a catalog of its own. A second assembler would drift on the first engine anybody added, and the symptom would be an agent being told about commands the picker never offers. The sweep also checks the door hands over the **whole** catalog — the narrowing is the page's, per keystroke, and a `q` on that message would be the round trip K-29 was built to avoid.
- **‼️ X-97's `provider` is carried and does not narrow — now measured as such:** A provider decides which *models* a session may run on; nothing anybody has measured says it decides which *commands* the CLI offers. The op accepts it and returns the identical list, and the test says why: a filter invented here would take commands away on the strength of a guess, and the loss would look exactly like a catalog that failed to scan.
- Also pinned: an engine this build has never measured is not an error — it gets what is on disk plus whatever it reports, which is the honest answer for a CLI nobody has sat down with.

### 3.336.0 — K-31 — whose command it is, and the one it cannot run here (2026-08-30)

- The picker's rows now say the two things a name and a sentence cannot.
- **Whose command it is, in the badge every other surface draws:** A command the CLI itself owns wears the ENGINE badge (X-110, the same colour as on a card, a turn and a session row): `/model` on Claude and `/model` on Codex are different programs' commands, and a list that called both of them "engine" would be hiding the one thing that decides whether it can be typed here at all. A command that came from a file is nobody's engine, so it says which kind of file instead — **local · skill · workflow**.
- **‼️ And the one it cannot run here:** `/model` with no argument opens an interactive menu *in a terminal*. This session is hosted over stream-json and has no terminal to open it in, so it can only answer with text — offering it silently is offering a way to spend a turn on nothing. The row carries a ▤, and the sentence is a **line in the panel that follows the highlight**: `▤ /model opens a menu in a terminal. This session is hosted, so it can only answer with text — give it its argument (/model [name]) and it acts.` It is not a hover, because a panel over a list you are arrowing through covers the very rows you are comparing.
- The shipped table is now **swept rather than spot-checked**: every command in it must carry a name, a sentence that ends, and an argument hint that is either `<required>` or `[optional]` — the picker prints that hint beside the name, so the brackets are the explanation. The failure this catches is a sixth engine added in a hurry.

### 3.335.0 — K-30 — the "/" picker, where the composer already is (2026-08-30)

- K-29 built the catalog — **which commands this session could actually run**, as a merge of what is on disk, what the running session reported at `system:init` and a short shipped table per engine. This is the half you can see: type `/` in the Console composer and the list opens over it.
- **‼️ A TYPEAHEAD, NOT A WINDOW, and that is the whole design:** The saved-prompt picker takes the screen because choosing a prompt is what you stopped to do; this opens *while* you are mid-sentence. A window that took the focus would mean typing the query twice — once to open it, once inside it. So the box keeps the caret, the box keeps the query, and the list draws above it. There is no filter input in the picker: **`/mod` in the composer IS the filter.**
- **- **The `/` icon in the box's bottom-left corner types the slash** rather than opening a second door:** One rule decides when the list is open (`slashQueryAt`, read off the caret), so there is no second state machine to fall out of step with what is written in the box. Mid-word it puts the space in first, because `abc/` is a path and correctly opens nothing. - **↑ ↓ move · ↵ inserts · Esc closes · a click on a row does what ↵ does.** Escape belongs to whichever is open: with the list up it closes the list, and the very next Escape stops the running turn the way it always did. Ctrl+Enter is never the picker's — with a list open or shut, that chord sends. - **↵ REPLACES the query rather than adding to it.** The `/mod` under the caret is the query; an insert that only added text would send the engine `/mod/model`. What lands is the command and a space — and the space is what ends the query, so the list closes itself and the argument is your own text. - **The catalog is asked for once per engine · agent · session**, when the picker opens — never on the payload, because this page rebuilds its data several times a second while a turn runs and the scan walks three folders. Typing narrows in the page. A late answer about an engine the composer has moved on from is dropped rather than drawn. - Each row carries what you need to choose: the name, the argument hint the file declared, the description, and where it came from (engine · local · skill · workflow). Nothing is sent — a pick lands in the box, still yours to edit.
- The rule and the filter are mirrored into the page (`media/afSlashPicker.js`) because they run per keystroke inside a webview, and the mirror is **pinned against the compiled core** — the picker and the bridge's `toolbox.slashCommands` cannot come to disagree about what a slash even is.

### 3.334.0 — Three answers the user gave: the red box, the hover nobody needed, the popup that would not shut (2026-08-30)

- Small, and all three are the same kind of fault — a control that was almost right and cost the reader something every time they met it.
- **U-121, settled — the box stays, and it goes red:** The mark filed under nothing keeps the ordinary checkbox, so it can still be ticked with four others and dropped in one press; what it gets is a **red frame**. No icon beside it and no second word: the colour is the whole message, and the sentence explaining it already lives in the State cell (ONE SUBJECT). The pick button that briefly stood there took the row out of every bulk act to say something the row could say by looking different.
- **The colour dot no longer opens a hover:** It said the same three sentences on every card in the list — a colour is a mark, it is kept against the session id, it survives the window closing — and it spilled under the conversation pane, so it was unreadable exactly where it appeared. A hover identical on twenty cards is not information; it is a paragraph dismissed twenty times. The dot is its own answer: the colour it is drawn in is the colour it carries. The **dead** dot keeps a short native title, because a control that refuses a press still owes a reason — and a native tooltip is drawn by the host above every pane, so it cannot be clipped by the one it sits in.
- **The colour palette closes the way everything else closes:** It was openable and un-closable: every control inside it stops the click, so the only way out was the same dot that opened it, and it stood over the next card while the reader worked on. A click anywhere else now shuts it, and so does Escape. The listener is on the document and bound once — a repaint rewires the dots, and a close handler rebound with them would stack up one per repaint — and it repaints only when something was actually open.

### 3.333.0 — K-29 — the slash command catalog, and whose answer it is (2026-08-30)

- The groundwork for the `/` picker (K-14): a catalog that can say **which commands this session could actually run**. No UI yet — that is K-30 — but the answer exists and is readable from the bridge.
- **‼️ The finding that shaped it, measured rather than assumed:** A real Claude `system:init` on this machine named **47** slash commands, and the list mixed the CLI's own (`/model`, `/compact`, `/context`) with the SKILLS this machine happens to have installed (`/dataviz`, `/account-signup`) and two internal names nobody types (`__remote-workflow`). No table shipped inside Agent Farm can be right about that. So the catalog is a **merge**, not a table.
- Three sources, and they do not carry the same authority:
- 1. **The disk** — `.claude/commands/**/*.md` namespaced by their own folders, so `commands/git/cleanup.md` is `/git:cleanup`; the skill folders; and an engine's own `.agents/workflows`. Read by the scanners the Toolbox page already uses, never by a second reader. 2. **The running session** — what it reported at `system:init`, the only source that knows THIS install. 3. **A short shipped table per engine** — for the one moment before any session exists to be asked. Antigravity's `/goal` and `/plan` are not Claude's `/compact` and `/context`, and offering one engine's commands on another is offering a way to break the session.

### 3.332.0 — S-34 — the setup an agent last ran with belongs to every door (2026-08-30)

- Agent Farm has always remembered what an agent was last started with — the engine, the model, the effort, the permission mode, the discipline switch and the window it ran in. It remembered it in **one** place and offered it back in **one** place: the multi-dimension launcher. Press ▶ on the same agent's row instead, or open its composer from "Talk to agent", or start it from a project page, and it ran on the fleet defaults, whatever it had been running as ten minutes earlier. A memory nine doors out of ten cannot see is not a memory; it is a feature of one picker.
- **Now it is a layer, and every door stands on it:** The resolution order is the same everywhere: what this launch states → what this AGENT was last started with → the agent's engine defaults → `agentFarm.launchDefaults`. Reading is one function (`seedLastLaunch`), writing is one function (`rememberLaunch`), and what is kept is decided once, in the core — so the next dimension added to a launch is remembered by the shape rather than by ten call sites, which is the failure this item is named for.
- - **▶ and the tree menus** open the surface picker on the agent's own last engine and last window, and the row says *last used for `<agent>`* rather than crediting the window for a choice that agent never made. - **The Console composer** opens on the remembered model, effort, permission mode and Superpowers state instead of five boxes reading "Default". - **Changing the agent in the composer's own picker** reseeds those boxes from the new agent's record — an agent chosen there used to keep the previous agent's setup, with nothing on screen saying so. - **"Talk to agent" and the Projects page** start it as it last ran; only the project is new.
- **‼️ What the composer shows is what runs:** The boxes are seeded from the record and then left alone: an empty box is a person asking for the default, and re-applying the memory at Send would be the panel arguing with a control they had just cleared.

### 3.331.0 — M-31 — the list follows the count (2026-08-30)

- The figures at the top of the backlog answer two honest questions one press apart — `⊞ every` line, or `⊟ wholes` with the parts folded into the jobs they belong to. But the ROWS underneath never moved. Pressing for "how much work is left" put the reduced number in the headline and left the full list below it, so the strip contradicted the thing it was a strip for.
- **Now the press moves the family filter with it:** `⊟` ticks *wholes only*, `⊞` puts the axis back to *any* — and because "wholes only" is the SAME predicate the roll-up counts by (nobody's part), the rows on screen are exactly the lines behind the number, never a near-miss.
- **‼️ The arrow points one way:** The strip writes the axis; the axis never writes the strip. Narrowing to *part of something* is a question about the family tree, not an instruction to change what the headline counts. And what you pick AFTER a press stands — change the axis, or clear the filters altogether, and nothing re-applies it until you press the figure again.
- The press is unconditional on purpose: a press whose effect depended on what the axis happened to hold is a press whose result you cannot predict. Both hovers say so before it happens — the strip's, and the family axis's own.

### 3.330.0 — K-35 — a colour label on a Console card (2026-08-29)

- The left panel is a column of cards that all look alike — same shape, same two lines of grey figures, and the agent name repeated down it because three of them belong to one agent. Finding "the one about the wiki" means READING, every time, and reading is what a panel you glance at cannot ask for.
- **So a session can carry a colour:** , picked from a dot at the bottom-right of its card: ten fixed swatches, a colour of your own, and "none" to take it off. It is a MARK — the same kind of thing as the pin and the labels (`core/sessionmarks.ts`), keyed by session id and remembered for ever.
- **‼️ Which is why the dot is on every card kind in that panel:** — live, "where you left off", and resumable. A colour that is right on two surfaces out of three is a colour nobody trusts on any of them.
- **And a card with no session id cannot carry one:** The mark is filed against the id, and a process that has not written its first turn has not got one: that dot is drawn dead and says why, rather than being pressable and saving nothing.

### 3.329.0 — U-122 — every object on the vault strip is a path (2026-08-29)

- **The Wiki cockpit's vault strip named six things and let you press three:** A path you can see and cannot copy, a drop box you can read the name of and cannot open, and the agent procedure rendered as a dead `<span>` are one omission with three faces: the object is DRAWN but is not an object.
- **‼️ `_REF/wiki.md` opens:** It is the file a compile is told to read first, named on the one page that starts compiles, and it could not be opened from there. It is resolved against the configured agent roots — the FIRST root that really holds it wins — and on a machine where none of them do it stays plain text rather than becoming a link that opens nothing.
- **📥 `_RAW_` is on the strip, with the count that is the reason to look at it:** The whole promised gesture is "drop a browser export in `_RAW_` and do nothing else"; a folder you have to hunt for in Explorer is that gesture with a hunt in front of it. Pressing it opens the folder.
- **Everything on the strip has a right-click menu:** — open it in the editor, show it in the folder, copy the absolute path, and for the root, open Wiki settings. Nothing there is new behaviour invented for a menu: each item sends the message the strip's own press already sends, so the menu and the button cannot drift.

### 3.328.0 — U-120 — a chip says which scope it belongs to (2026-08-29)

- A mark on the WHOLE conversation covers turn 2, so pressing turn 2's badge ticked it alongside a mark that covered turns 1–3 and nothing else. Two scopes, one colour, one list — the aggregation illusion — and the next topic went under whichever chip the eye landed on.
- **A session-wide chip is now warm:** (the editor's own warning pair, so it holds its contrast in both themes) and a partial one keeps the ordinary accent. The rule is the same from a turn's badge and from a session's, because both popovers are the same panel.
- **‼️ And what a chip reports is what pressing "Keep it" LEAVES BEHIND:** — every turn the topic is already kept on, plus the scope now chosen. That second half is why it is worth repainting: choosing *Whole session* turns the partial chips warm **before** the press rather than after it. The hover states the count the way the cockpit says it (`Whole session (10 turns)` · `3 turns (3/10)`), then the span (`Turns: 1–3, 7`), then where the topic stands today and what this press would add.
- X-58's exclusions are part of that arithmetic: a whole-session mark that leaves two turns out reads `Whole session (8 of 10 turns) · except 9–10` rather than claiming ten. They now travel with the mark on the wire, because a count the compile will not honour is worse than no count.

### 3.327.0 — U-121 — the tick box stops being the compile's box (2026-08-29)

- Three separate frustrations in the Wiki cockpit, all of them the same mistake: the tick box was the COMPILE's box rather than a selection box.
- **‼️ So the master box could only be pressed once:** It was drawn unchecked on every repaint, which means a browser click always read as *turn on*: ticking everything worked and untticking it was impossible — the one gesture that box exists for. It now takes its `checked` from the rows themselves and its `indeterminate` from a partial selection (a property, so it cannot be written in markup and has to be set after the paint), and its hover says which of the two presses you are about to make.
- **And the `dropped` and `compiled` tabs had no boxes at all:** , so five dropped marks could only be brought back one row at a time — which is what made 🚫 Drop feel irreversible even though every row has had its own ↺ all along. Every row is tickable now except the one a run is out for, where anything you do fights the run, and the bulk group gained **↺ Reopen**.
- **‼️ And when the ticked set and the compilable set differ, every button says its own number:** A selection of six that compiles two says `Compile Selected (2)`, `Drop 1`, `Reopen 1`, `Remove 6` — each act taking exactly the slice it counted, and the compile button's hover saying out loud how many of your ticks it is leaving out and why. A button that says 3 and sends 6 is the silent narrowing these counts exist to prevent.

### 3.326.0 — X-140 — the compile is told what a dropped file is, and where to put it afterwards (2026-08-29)

- The brief and the compile prompt are written in the grammar of a CLI transcript — a turn scope, turn numbers, what each turn opened with. A markdown export somebody saved out of a browser has none of it, and it was being handed to the run under a heading identical to every other heading, with `turn scope: whole file` under it. A run reads that and goes looking for turns.
- So a dropped file is now **declared** in the first line of its own block: *EXTERNAL FILE — NOT A CLI SESSION*, read the whole of it, it has no turns. Its note travels as **⚠️ KULLANICI DİREKTİFİ** rather than "why it was kept" — on a file that is not context, it is the only way a person can say which part matters, because there are no turn numbers to narrow it by, and the prompt says outright that it outranks the run's own judgement.
- **‼️ And a compiled drop is moved into `_RAW_/_DONE_` — by the agent, in the same breath as the report:** The extension never learns that a page was written; only `wiki.candidates.edit {state:"compiled"}` says so, so a file moved on the strength of a run that then wrote nothing would be filed as done while the pool still said pending. One actor, one moment. The prompt names the pair together and says what each half costs alone: a file left in the drop box is offered to the next compile as though nothing had happened, and a file moved without the report leaves the pool waiting for a file that is no longer where the mark points.
- **The paths are **computed, never described**:** A model asked to work out an archive path works out a plausible one; a provenance link pointing at where the file currently is breaks the moment the move next to it succeeds. So the brief carries `rawArchive` (the exact destination) and `rawLink` (`_RAW_/_DONE_/<file>`, which is what goes on the page as `- [YYYY-MM-DD] Harici Kaynak: [[…]]`), and the prompt prints the move as `from -> to`.

### 3.325.0 — U-117 — a dropped file stops pretending to be a session (2026-08-29)

- X-139 put files in the cockpit that never happened in a CLI, and the table drew them exactly like the ones that did. A conversation saved out of Claude Web appeared as `raw:clau` — eight characters of a key that identify nothing — alongside `whole session`, over a markdown export with no turns at all. It is now what it is: **📄 the file's own name**, a `RAW` badge, and `DONE` once a compile has archived it into `_RAW_/_DONE_`. Sessions carry 💬 in the same column, because a distinction only one side of a pair signals is one the eye has to work for.
- **‼️ And the stage a drop arrives in is its own state, not `waiting`:** A raw file lands with no topic on purpose — a topic is the key a page is filed under and a scan will not guess one. So the row reads `🌱 needs a topic`, its empty topics cell says `pick a category…` instead of a dash, and where the tick box would be there is a 🌱 that opens the picker. Three stages, visible at a glance: dropped → filed → compiled.
- **That is not a hint the page draws over a host that would have accepted the press:** `startCompileRun` now **refuses a topicless mark by name** — and names the *file*, because an id tells you nothing about which drop you forgot to file. `all:true` simply leaves such marks out, so one un-triaged file can never block Compile All; and when leaving them out leaves nothing, the refusal says which files are waiting rather than "nothing matched". The cockpit's counts follow the same rule, so `Compile All Pending` never offers a mark the run would reject.
- The rest of it, each fixing something that was quietly wrong:

### 3.324.0 — X-139 — the drop box becomes a pool, with nobody pressing anything (2026-08-29)

- **X-138 made `_RAW_`:** On its own that is a box files go into and nothing comes out of: the folder existed, and a conversation saved into it stayed a file. The whole gesture is meant to be *save it in there* — so the pool notices, and it notices on the calls that are already being made rather than on a button somebody has to remember. `wiki.status` and `wiki.candidates.list` both sync now, which means a file dropped a second ago is in the answer the cockpit is drawing itself from.
- A dropped file becomes an **untagged** candidate: whole-scope, `engine: raw-file`, `addedBy: auto-raw`, and **no topics**, because what a file is about is the one thing only a person can supply and a scan inventing it would file the conversation under a guess. Its label is the file's first real line, with a YAML front matter block skipped — an exported chat whose first line is `---` would otherwise be listed as `---`. Only `.md` and `.txt`; a screenshot is not a transcript.
- Three rules, each the answer to a way this could quietly go wrong:
- - **‼️ The file is the identity, not a turn range.** Every other row in this pool is "this conversation, these turns" and merges by exactly that. A dropped file has no turns, so it is keyed by its own name and a row is created only when no row holds that key **in any state** — which is what stops a candidate somebody dropped on purpose from being resurrected on the next scan, for ever. - **It never creates a folder.** Healing the drop box is `ensureRawDirs`'s job and its callers do it first. A listing that silently made directories would also make them from a root that was mistyped. - **‼️ A file that vanishes never takes somebody's work with it.** Moved into `_DONE_` means consumed, not gone: the path on the row is corrected (that path is what a compile reads) and the state is kept. Deleted outright may only drop the row when nobody has touched it — no topics, no note, still pending, added by the scan itself. A row a person tagged keeps its state and is told on its own line why it is stuck, because a mark that disappears from the cockpit is indistinguishable from one that was never made.

### 3.323.0 — S-47 — a resumed session comes back as itself on EVERY engine (2026-08-29)

- S-45 was built and tested against the Claude parser alone, so four of the five engines still came back from a resume wearing the fleet's current defaults. What each of them actually records was measured, one at a time, and only what is really written down is read:
- **- **Codex** — the figure was already here and the field was missing:** The parser has tracked the last model since it was written (it is what prices the session) and never put it on the row, so the resume ladder fell back to `models[models.length - 1]` — a set in first-seen order, whose last element names the model the session **stopped** using. Measured: two rollouts of 110 on this machine would have resumed on the wrong one. Its `turn_context` also states the **effort** per turn (60 of 110 rollouts) and the **sandbox** it ran under, which gives the permission mode back for 35 of them. - **‼️ …and only half of that mode is readable.** A rollout records the sandbox, not the mode that was picked, and `default` and `plan` BOTH map to `read-only`. Reading it would put a word in the box the user may never have chosen, so `read-only` names nothing; `workspace-write` and `danger-full-access` invert cleanly and are the two that let a run write. - **The Console's own mirror** — the record that never had to be inferred and was read least. It is Agent Farm's snapshot of a session Agent Farm launched: model, effort and permission mode have been written into it since it was invented, and only the model was ever read back, into the display list. Measured: 63 conversations, 55 with a model, 54 with an effort, 63 with a mode. - **Gemini** — the same one-line omission, with one subtlety: `models` is only added to when a reply reported usage, which is right for a spend column and wrong for "what is it on now". A reply that answered without being billed still answered. - **OpenCode** — its export records `big-pickle` while its catalogue publishes `opencode/big-pickle` (K-28), so the recorded name reached the resume gate and was dropped. A bare id that is the tail of **exactly one** published id is now resolved to it; a tail two providers both claim resolves to nothing. ‼️ The rule is inert by construction where ids carry no provider prefix — there every id is its own tail — so Claude, Codex and Antigravity cannot be affected.
- Absence stays absence throughout: an engine, or a file, that never said which model it was on says nothing rather than the fleet default wearing the session's name.

### 3.322.0 — S-46 — Antigravity keeps its model, and its effort (2026-08-29)

- Choosing **Gemini 3.7 Flash** and pressing send got you a session that never started:
- ``` invalid model selection (--model "gemini-3.7-flash" --effort ""): --model gemini-3.7-flash requires --effort (available: low, medium, high) ```
- **while the effort box on screen read **Default → medium** the whole time:** Both halves of that were true, which is why it was invisible: X-26 made the row NAME the effort it would send, but the field every reader actually asks — `defaultEffort[model]` — was left empty for this engine alone. So an effort of `''` had nothing to be completed to, survived every narrowing untouched, and the `<select>` showed its first option because its value matched none of them. The label was right and the value behind it was empty.
- - **The catalog now states the default effort per model**, derived by the same call that writes the label, so the two cannot drift apart again. A model that takes no `--effort` at all still gets none. - **And where nothing narrows** — a mission member, a task row, a bridge call — a model that cannot run bare is now **refused before the run** instead of dying at the CLI hours later. It is the catalogue's own shape that refuses, not a named engine, and only a model's OWN vocabulary may do it: an engine that says nothing about a model still refuses nothing.

### 3.321.0 — B-20 — the notices board's own actions, on the bridge (2026-08-29)

- **An agent could **post** a notice and then do nothing else with it:** Four things the board could do had no op at all, and the gap showed: a title that turned out wrong stayed wrong, nothing could be kept at the top of a busy board, a run had no way to mark which of forty results were the two worth reading — and a dismiss was **final**.
- **- **`notices.edit`** — the board's own edit, on the same store:** Pass only what changes. ‼️ The first edit snapshots the original, so the board can show the difference: a correction on the record, never a quiet substitution. An edit that changes nothing is refused rather than stamping the notice `edited` for no reason. - **`notices.pin`** — hold it at the top, or let it go. A pin also protects a notice from the sweeps. - **`notices.stars`** — rate it. ‼️ The scale is **0-3**, and anything outside it becomes **0** rather than clamping — so a "5" from a caller who assumed five stars *clears* the rating. The op says so, because that is the kind of thing an agent gets wrong forever otherwise. - **`notices.undo`** — put the last removal back.
- **‼️ And undo is why the store changed, not just the ops:** The board's Undo kept the removed notices on the **panel**, which made it a property of a window: an agent that dismissed the wrong batch over the bridge had nothing to take back, and the person's own Undo vanished the moment the board was closed. The memory lives on the store now, so the button and the op undo the same removal — one deep, deliberately, because Undo here means "that was a mistake" and not "walk back through the day".
- Four named gaps in the parity manifest are closed with this: the gap budget goes 38 → **34**, and 326 capabilities now reach the bridge.

### 3.320.0 — X-138 — the wiki's drop box, relative and self-healing (2026-08-29)

- **Groundwork for the wiki's Phase 3: a folder you can simply **drop a file into**:** A Claude Web answer, a ChatGPT export, something somebody typed by hand — into `<wikiRoot>/_RAW_`, with no command, no conversion and no naming rule to get right first. A compiled one moves to `_RAW_/_DONE_`, so the drop box stays a to-do list rather than a growing pile.
- **Relative to the root, never absolute:** `agentFarm.wikiRoot` is a setting the user retypes on every machine, `%USERPROFILE%` and all. A path baked into the code would be right on exactly one computer.
- **‼️ Self-healing, because the folder lives in the user's own vault:** — where Obsidian, a sync client and their own hand all reach it. It *will* be deleted, renamed, or simply absent on a fresh machine, and every one of those is a normal Tuesday rather than an error worth a dialog. `ensureRawDirs` makes whatever is missing, recursively and silently, and says what it had to make. It runs on `scaffoldWiki`, `wikiHealth` and `wikiStatus`: asking "is something wrong here" is the moment a user asks, so answering "`_RAW_` is missing" and leaving it missing would be a diagnosis where the fix costs one syscall.
- **‼️ And it still refuses to create the ROOT:** `mkdir -p <root>/_RAW_/_DONE_` brings the root into existence too — and the root is a hand-typed path. A typo would quietly become a real empty folder on the disk while the real wiki sat untouched beside it, and the health check meant to *report* the problem would have manufactured the evidence that there wasn't one. An unset root is refused outright: `path.join('', '_RAW_')` is the **relative** `_RAW_`, which would appear in whatever directory the process happens to be in.

### 3.319.0 — U-111 — the agent page can be asked about a period (2026-08-29)

- **The dashboard has had a range row for a long time:** The agent page — the one place you go to ask about **one** agent — was frozen at *last 30 days* for its chart and *all time* for every figure above it, so "what did this agent cost me last week" was not a question it could be asked.
- **The same row, on the agent page:** the first week day by day, then 14 / 30 / 90 / 180 / 365, then two dates. It opens on **30d**, which is exactly what the page already drew — the row arriving changes nothing about the first thing you see.
- It governs the **cost card** (summed from the same daily buckets the chart draws, so the number and the bars can never disagree), the **sessions card**, and the **daily cost chart** — which now buckets weekly past 120 days, or a year of bars would be a pixel each. Both cards keep their all-time figure in the sub-line rather than trading one question for another.
- **‼️ And the two cards it cannot govern say so:** Tool calls are kept per session, not per day, so there is no honest way to cut them by a span; the memory count is a picture of the present. A page where some cards are scoped and others silently are not is worse than one where none are.

### 3.318.0 — K-33 — a command is given to a shell that is ready for it (2026-08-29)

- Right-click a live Console card, *Resume in Terminal*, and the terminal opened on Claude's **login screen** instead of the conversation. Two races, both real.
- **The shell was still starting:** Every terminal here was driven the same way: `createTerminal` … `show()` … `sendText(command, true)` **on the very next statement** — before the shell inside the pty had finished running the user's own startup (a PowerShell profile, oh-my-posh, conda init). On a slow profile the written line is swallowed by or interleaved with that startup's output, and a `claude --resume <id>` that loses its tail runs as a bare `claude`: a fresh process, no conversation, the onboarding screen. The session looks like it evaporated. (The **external** terminal path was always immune — it writes the command to a `.cmd` file first — which is why switching to it "fixed" it.)
- **The line now waits for the shell to report in:** VS Code can only install its own integration once the shell has started, so `Terminal.shellIntegration` becoming defined is exactly the signal that was missing. ‼️ **The delivery is unchanged** — still `sendText`. `shellIntegration.executeCommand` looks made for this and is deliberately not used: it sends ^C first to interrupt whatever is running, and what these terminals run is a full-screen TUI.
- Three ways out, so a launch can never hang on it: integration switched off in settings sends **immediately** (no ceiling paid for a promise nobody made), the 3-second ceiling sends anyway (today's behaviour, so the worst case of this change is the behaviour it replaces), and a terminal closed first sends nothing. And it happens **once** whichever of the three fires — a resume sent twice would put two processes on one transcript.

### 3.317.0 — S-45 — a resumed session comes back as itself (2026-08-29)

- **Picking a conversation back up handed it whatever the **settings page currently said**:** So a session you had deliberately put on a bigger model, at a higher effort, under bypass, restarted on the fleet default every time — and the three had to be re-chosen by hand on every sitting. Worse than tedious: nothing on the row says the model changed, so the wrong one just runs.
- **The transcript is the answer, and it is the right one:** A `/model` typed INSIDE a session changes the run without Agent Farm ever hearing about it, so anything written down at launch would be stale exactly when it mattered. The file records what actually happened, so a resume now reads it:
- **- **the model that answered last** — `SessionInfo.lastModel`:** ‼️ Not `models[models.length - 1]`, which every reader had been using: `models` is a set in first-seen order, so a session that went opus -> sonnet -> opus named **sonnet**, the model it had stopped using. - **the effort it ran at** — new. The CLI writes it on the assistant line itself, beside `type` and `timestamp`; nothing had ever read it. - **the permission mode** — X-124's field, now used rather than only shown.
- **All four doors, not the two the report named:** The Console's own resume, the terminal resume, *Resume in Console* (which already reached for the model — and reached wrong) and the `sessions.start` bridge op. `sessions.context` was resuming on the wrong model for the same reason and is fixed with them.
- **Every door comes back the way the card's own Resume does (3.740.0):** an ended Console card records the model, effort, mode and sign-in its conversation ran with, which is why its Resume was the one door that always came back right. So *Resume in Console* (Sessions page, palette, session page) and the Console's list row now hand a conversation that has an ended card to that card's Resume. A conversation without one reads, in order: the transcript (what really happened last) → **its own launch manifest** (what it was started with: model, effort, mode, Superpowers — the transcript is usually silent on the mode) → the composer box / the agent's own defaults → the fleet default; the sign-in is still the manifest's, else the engine's own record. The terminal resume and `sessions.start resume=` read the manifest the same way.

### 3.316.0 — K-34 — every door that starts a session carries the same setup (2026-08-29)

- **X-133 gave the Console composer a ⚡ chip:** That is **one of ten** ways a session gets started here, and the other nine went on deciding the engineering discipline from a per-agent setting the person starting the session could not see — so the same agent worked one way in the panel and another way in a terminal, and a saved profile reproduced everything about a launch **except** that.
- **`⚡ Superpowers` is a launch dimension now:** , like the model and the permissions: on `LaunchOptions`, so the multi-dimension launcher, the sidebar tree rows, the surface picker, a **saved profile** and the terminal itself all carry it. The launcher shows what will actually happen — *`agent default (on for developer)`* — rather than leaving the reader to guess which setting answered.
- **‼️ Three answers, and the empty one is not "off":** *Agent default* hands the decision back to `agentFarm.superpowersDefaults`, which is what every session started before this row existed did. A profile that says nothing about the discipline **clears** it on load rather than leaving the last launcher's answer standing — the same rule the model already followed.
- **And the launcher no longer spawns behind you:** Picking *Where: the Console panel* used to start the session the instant you pressed Start: the setup was baked in, and every dimension became unchangeable at the exact moment you finally had a window to change one in — a wrong model picked in a quickpick could only be fixed by ending the session and starting again. **The composer now opens *on* the setup**: the same answers, still editable, a first prompt sitting in the box rather than sent, and nothing running until you press Send. The terminal branch is untouched, because a terminal has no composer to preserve.

### 3.315.0 — M-30 — the discipline is a property of the JOB, not only of the agent (2026-08-29)

- X-133 put the Superpowers engineering discipline — brainstorm before building, a plan before code, systematic debugging before a fix — behind **one switch per agent**. That answers *"how does `developer` work"* and cannot answer *"…except for this job"*. A nightly lint sweep and a feature build are the same agent doing work of two different kinds, and the Console composer's ⚡ chip could say so only for a session somebody was sitting in front of.
- **`⚡ Superpowers`:** , in the new-task form beside Model, Effort and Permissions — so a **task, a schedule, a trigger, a template and a workflow step** can each say it, and an automation that fires at 03:00 says it when it is *written*, which is the only moment anybody is there to say it.
- **‼️ THREE ANSWERS, AND THE EMPTY ONE IS NOT "OFF":** *Agent default* hands the decision back to the agent's own setting — which is exactly what every task ever written before this row existed said, and what they all keep saying. *On* and *Off* are a person overriding that default for this job alone. A checkbox would have had two states and would have had to invent an answer for every existing automation on the day it shipped.
- **An explicit pick beats the default, and a retry inherits it:** A rerun that quietly fell back to the agent's setting would be a different job from the one being retried — the same defect the engine, the model and the finish sound each had here once.

### 3.314.0 — A-26 — the farm reads the answer, not just the news (2026-08-29)

- **A tone says *something happened*:** The announcement (A-20) says *which agent*. Neither says **what it answered** — so the walk back to the screen happened anyway, and for most turns the answer was one sentence long.
- **`🔊 Read this session aloud`:** , in the same right-click the mute and the voice already live in (`Sound for this session…`). Turn it on for the ONE conversation you walked away from, and every turn it finishes is read out loud in that session's own voice.
- **Per session, and only per session:** There is no fleet-wide "read everything": eight agents reading over each other is a crowd, not a cockpit. For the same reason there is **one reader for the window** — a newer answer cuts short an older one still being read, on purpose.
- **It is not part of the alert plan:** A session with every ♪ box unticked still reads when you ask it to, and a muted fleet does not silence it: mute exists to stop noise nobody chose, and this switch was thrown by hand. It does not go through the alert queue either — that queue serialises short tones, and a minute-long reading would hold every chime in the farm behind it.

### 3.313.0 — U-123 — the nudge has a control instead of a JSON box (2026-08-29)

- The last raw box on the Alert sounds card, and the odd one out: the rest of the gate — mute · quiet hours · the sessions muted on their own — has lived on one line since A-22, while the **one control that makes a sound you did not arm** sat three fields deep in `agentFarm.alerts.nudge` as JSON.
- **`⏰ Nudge after [3] min, [2] × [tone]`:** , on the gate strip, beside the two switches that decide whether the FIRST alert is heard at all. That is where it belongs: it answers the gate's question — *will a sound happen* — not the table's, *which sound*.
- **And what is waiting right now is on the strip:** `2 waiting` is the number of questions actually armed for a reminder at this moment; a session that is answered or leaves the list disarms itself, so it is what is outstanding rather than a running total. **The card head says the nudge is on** too, beside the armed count — a policy that produces an unrequested chime some minutes later is worth a badge.
- **The tone picker offers exactly what the op accepts:** One grouped list, shared with the event rows, and a sound this machine cannot play is **drawn and disabled** rather than dropped — a setting naming a missing file must go on naming it. Off is `minutes: 0`, the setting's own word for it, so there is no fourth field that could disagree with the other three.

### 3.312.0 — A-24 — a run can say what it sounds like when it ends (2026-08-29)

- The last piece of A-23, and it was held back for three releases by one honest objection: **"Silent" could not be built.** The two authorities over a sound ADD and neither may subtract from the other, so nothing a session said about itself could make it quiet — and a three-option field with one option that does nothing is worse than no field. A-22 answered it with the session mute, so the field is now three real answers.
- **Sound on finish:** , on the New-task form and on the schedule and trigger editors beside it: *Default* · a tone · *Silent — no sound at all*. Drawn for every run, headless included — a headless run has no window to open, but it does END, and it is the one nobody is watching.
- **It adds no step to the alert chain:** The moment the run's session has an id, the pick is written onto **that session's own step** — the one A-23 built, that the resolution chain already reads and the Live Timeline already draws. So the row goes on saying "this session's own choice" and is telling the truth. Declared ids (a Console run, a resumed conversation) are stamped at the spawn; an ordinary headless run is stamped the moment its transcript names it.
- **Picking a tone also arms that session's ♪:** — otherwise the choice would be accepted, stored, drawn, and silent whenever the fleet switch happened to be off, which is the defect the field exists to fix.

### 3.311.0 — A-25 — the announcement has a face (2026-08-29)

- **A-20 built the whole engine and left it behind a raw JSON box:** Seven fields, one of them a voice NAME that has to exist on this machine — and a settings box cannot know whether it does. **That was the worst of the four boxes this card has now absorbed**, because the engine's answer to a name nothing answers to is a FAILED announcement (`exit 5`), on purpose, rather than a quiet fall back to English. The one thing the box could never show was the one thing that decided whether the feature worked at all.
- **The strip:** Under the gate, on the same card, in the order the two are read: *is anything heard at all* → *and what does it say*. Switch · voice · rate · volume · the sentence · ▶ test. `agentFarm.alerts.speak` no longer appears as a box beside it.
- **Every voice on the machine, with its LANGUAGE on the row:** Both of Windows' registries, asked of the machine and not guessed, sorted by language — because an `en-US` voice reading Turkish is not accented, it is unintelligible. The answer costs a PowerShell process, so it is asked once when the card opens and kept; ↻ is for the language pack installed a minute ago.
- **And which voice the setting ACTUALLY REACHES:** `Tolga` is a legal setting and no voice is called that, so the picker selects the voice it *resolves to* — `Microsoft Tolga - Turkish (Turkey)` — and a name **nothing** answers to is shown as a warning here rather than discovered at the moment the alert does not arrive. ‼️ Only where the list is authoritative: listing voices is Windows-only, so on macOS the strip says the platform cannot answer instead of calling a working setting broken.

### 3.310.0 — A-20 — every voice on the machine, and one per conversation (2026-08-29)

- **3.309.0 shipped the announcement and told the user their machine had only two en-US voices:** That was wrong, and the user said so.
- **Windows keeps its voices in TWO registries and `System.Speech` sees one:** SAPI 5 reads `Speech\Voices\Tokens` — David and Zira, en-US. Every voice a user has ever installed from Settings goes to `Speech_OneCore\Voices\Tokens`, and `SelectVoice` can neither list nor choose one. Measured on this machine: SAPI 5 had two voices, OneCore had four — one of them **`Microsoft Tolga — Turkish`, already installed and completely unreachable.** So the advice the last release printed ("install a language pack") was for a problem the user did not have.
- **The COM server underneath reaches both:** `SpVoice.GetVoices()` enumerates the SAPI 5 set only, but `SpObjectToken.SetId(<registry path>)` loads ANY token by id, OneCore included — verified out loud, in Turkish, before it was written. The Windows backend is now that, walking both registries to find a voice by name: **`Tolga` finds `Microsoft Tolga - Turkish (Turkey)`.** Every voice on the machine is selectable, in every language it has.
- **The voice list says what it really is:** Six rows here, each with its culture and which registry it came from, sorted by language — because the question a reader brings to the list is "is there one that speaks mine?".

### 3.309.0 — A-20 — the fleet can say which agent (2026-08-29)

- **The third part of A-20:** Twenty voices answer "what KIND of news is this?" and nothing else. With eight lanes running, the question you actually have from the next room is **which one** — and no palette of tones can carry a name.
- **A spoken line can, and it costs nothing:** `System.Speech` has been in every Windows install for twenty years; macOS `say` and Linux `spd-say` are equally already there. No network, no account, no model, no per-token anything.
- **It is an addition to the tone, not a replacement:** A tone reaches the ear in half a second and is recognised before it finishes; a sentence takes two and cannot be told from a podcast in the next room until it is over. So the tone still says what kind, immediately, and the sentence arrives behind it saying which one. **Both ride in one queue ticket** — submitted separately, another lane's chime would land in the middle of this one's sentence, which is the exact overlap the queue exists to stop. It follows the same mute, the same quiet hours and the same per-session mute.
- **It ships off, and out of the box announces only `question`:** That is the argument for the feature rather than a limitation of it: `question` is the one event where an agent is STOPPED and the cost of not knowing is the whole run standing still. A fleet that announces every finished turn out loud is one you silence in an afternoon — and then you hear nothing at all, including the question.

### 3.308.0 — A-20 — ten sounds that are ten different objects (2026-08-29)

- **The second part of A-20 — the palette:** The nine tones A-18 generated are one mechanism heard nine ways: a sine, an octave above it, and a decay. From the next room they are recognisably relatives, and telling "your turn" from "it is asking you" while doing something else was the condition this whole feature was opened for.
- **So the ten new ones are ten different OBJECTS:** The partials of a real thing are not a harmonic series, and that — not the envelope — is what makes wood sound like wood: a marimba bar rings at 1 : 3.9 : 9.2, a tubular bell at 1 : 2.76 : 5.40. Three new instruments in the generator (a struck body with arbitrary partial ratios, a pitch glide whose phase is integrated so it does not click, and a seeded noise transient) make: **Crystal** · **Intercom knock** · **Zen bowl** · **Deep sonar** · **Lullaby** · **Marimba** · **Pop** · **Thin ticks** · **Bell, urgent** · **Pulse**.
- **And they are measured, because nobody can listen to them in a review:** `node tools/make_alert_sounds.js --stats` prints each voice's length, brightness and body, and checks the pairs that carry the feature. The two defaults — Crystal for a finished turn, Intercom knock for a question — sit a factor of **4.7 apart in brightness** and differ as much again in body: one is struck glass, the other a knuckle on a panel with almost no pitch at all. That is a difference you hear through a closed door, which a difference of melody is not.
- **All five defaults changed, and that is said out loud rather than shipped quietly:** A default nobody hears is not a delivery. What is safe about it: alerts ship OFF, so anybody hearing anything has been to the settings page already; and a voice you CHOSE lives a step above the default in the chain and is untouched. Only "sound on, never picked a voice" moves.

### 3.307.0 — A-20 — the Windows alert was arriving eight seconds late (2026-08-29)

- **The first of three parts of A-20 — the player itself, before the sounds it plays:** It began as "add mp3 and flac" and turned up something worse on the way.
- **Measured: every Windows alert was eight seconds late:** `MediaPlayer` is a WPF `DispatcherObject`, and its `MediaEnded` event is raised on a Dispatcher that `powershell -Command` never runs. So the event never came, the process sat in its wait loop for 17.7 seconds, this module's own timeout killed it at eight, the backend was reported as broken — and the sound you finally heard was the SoundPlayer fallback, announcing a turn that had ended eight seconds earlier. Nothing in the extension was in a position to notice: the fallback returned success, so the alert was working, just late enough to be useless.
- **The player asks the file how long it is instead:** `NaturalDuration` is filled in by the media engine and needs no dispatcher — which makes it two answers at once: how long to wait, and, when it never arrives, the codec saying it cannot open this file. Measured end to end: **1.8 s for a `.wav`, 2.3 s for an `.mp3`**, and a file no codec can open now reports that, in those words. Before, a refused file left through the same silent loop with exit 0 and was reported as PLAYED.
- **And it was reported as played:** That is the second half of the same bug and the more dangerous one: `.mp3`, `.flac` and anything else the codec refused came back green. A user who pointed an alert at their own file was told it worked and heard nothing, for ever.

### 3.306.0 — A-22 — eight agents finishing together make eight sounds, not one noise (2026-08-29)

- **The other half of A-22:** 3.305.0 answered "should anything sound"; this answers "in what order, and what if nobody comes".
- **One queue for the whole window:** Eight lanes is the normal case, and eight players started in the same 40 ms do not make eight sounds — they make ONE noise, out of which nothing can be told apart, which is the exact ability ten named tones exist to give. The sounds now go one at a time, ordered by how much the news matters: `question` first (the only event where the agent is STOPPED and waiting on you), then `error`, `stalled`, `ended`, and `turn-ready` last — the one that happens most and costs least to miss, because the Timeline shows it anyway.
- **The 500 ms gap is measured from the END of the last sound:** , not its start. The tones are up to 1.2 s long, so a gap counted from the start would let them overlap, which is the whole thing the queue exists to stop.
- **The queue has a small ceiling, and something IS dropped:** A backlog of twenty chimes is twenty seconds of noise describing a fleet that has since moved on — not merely useless but actively misleading. Over six waiting, the LEAST urgent goes and says so. The same alert twice is one alert.

### 3.305.0 — A-22 — the farm can be told to be quiet (2026-08-29)

- **Alert sounds could be configured and armed, and there was no way to make them stop:** Somebody walks into the room at 23:40 with eight agents finishing turns, and the only remedy was to walk to the machine and untick five boxes they would then have to remember to tick again. **A-22 adds the gate: a 🔇 in the status bar, a nightly window, and a mute for one conversation.**
- **Which sound and whether it sounds are two questions, and they stay two:** `resolveVoice` answers the first and is guaranteed to always have an answer; teaching it to resolve to nothing would make every fall-through in it indistinguishable from a deliberate silence. The gate (`core/alertGate.ts`) sits in FRONT of the chain, names who closed it, and edits no choice.
- **🔇, one click, from wherever the eye already is:** A status bar item that APPEARS the first time anything is armed — the whole family ships off, and an icon sitting there for months on a fleet that has never made a noise is clutter — and stays up while muted, because a control that hides itself once pressed is one nobody can undo. It is the same act as `Agent Farm: Mute / Unmute Alert Sounds`, the Settings card and the `alerts.mute` op: one function, three doors.
- **Quiet hours WRAP MIDNIGHT:** 23:00→08:00 read as `from <= now < to` is quiet for exactly no minutes of the day, and that is the only shape anybody sets. A time that is not `HH:MM` is refused BY NAME rather than stored: a schedule that reads as configured and silences nothing is the worst of the three outcomes. Start equal to end is an EMPTY window, never all day, so a typo cannot mute a farm around the clock.

### 3.304.0 — X-142 — reopening something archived takes it out of the archive (2026-08-28)

- **Ticking an archived item back open changed one character and left the line hanging under `## 🗄 Archive`:** That is the worst of both states: the item counted as open, and every default view hides the archive — the page folds it away and `backlog.next` reads the file from the top — so the work was neither shown nor finished, and nothing anywhere said why it had vanished.
- **X-145 already diagnosed exactly this shape and built the carry-home:** It only ever ran on a deliberate `projects.backlog.tidy`, so the file stayed wrong until somebody happened to run one. **The reopen is the moment the line becomes live work, so it is the moment it goes home** — same machinery, called at the moment that creates the problem instead of at some later moment that happens to notice it.
- **The line's text is not touched:** It is lifted and re-inserted verbatim; what changes is where it sits. `setBacklogState`'s promise has always been that it never REBUILDS somebody's line out of parsed pieces, and that still holds.
- **Only that one item moves:** The full sweep is still a deliberate act: quietly relocating four other mis-filed lines because somebody unticked a box would be an edit they did not ask for, in a file they read by eye.

### 3.303.0 — A-23 — a conversation can have a tone of its own, and the row says which (2026-08-28)

- **Fifth step of A-18, and it closes a hole that had been open since the first one:** `resolveVoice` has always answered "which sound?" in four steps — **session, agent, settings, default** — and the top step was **never wired to anything**. Nothing in the extension could write it, so "give THIS conversation its own sound" — the thing the item was opened for — quietly resolved to the fleet-wide setting every time. The chain was right; it was reading a store that did not exist.
- ### The `session` step, written at last
- It lives in the SESSION preference store (`turnAlerts.ts`) rather than in a map of its own, because everything a per-session preference needs is already there: the **rekey** when a terminal lane learns the engine's real conversation id, the TTL, the ceiling, the forget. A second copy of that machinery would have drifted on the first change to either.
- **The two questions stay separate:** Clearing a row's four boxes does **not** unpick its tone, and clearing its tone is **not** muting it — an empty choice hands the answer back to your setting for everybody and then to the built-in default. There is no "this session is silent" in the chain; muting is the ♪ box, which is a different question and a different control.

### 3.302.0 — A-21 — the alert sounds get a card that says which one will play (2026-08-28)

- **Fourth step of A-18:** `agentFarm.alerts.on` and `agentFarm.alerts.voices` were two JSON boxes on the settings page, and **both are empty objects out of the box** — so the page showed `{}` twice for a feature that already plays five different tones, and the one question a person opens that page with ("which sound will I hear, and why that one?") had no answer anywhere on it. Only the resolution chain can answer it, so the host now hands the **resolved** rows over and the boxes are gone rather than decorated. Same lesson the wiki root (X-57) and the Superpowers folder (X-136) each cost a week.
- One row per event: the tick that arms it for every session, the sound picked for everybody, **what would actually play and which step of the chain chose it**, and a ▶ that plays it. The picker offers the default as a named option rather than a blank, because "use whatever the default is" and "pin it to chime-soft" are different answers and only one of them survives a version that changes the default.
- A chosen sound and a playing sound are drawn as different things, and they differ exactly when something is wrong — a file deleted in Explorer, a format no player here opens. The chain **falls through to the step below rather than going silent**, so the alert still rings; the row says what it landed on and the hover lists every step it passed over with the reason. An armed event that has run out of steps entirely — a partial update that took `error-buzz` with it — is called out on the card’s badge, because that is the one state where the sound really would be silence, and silence is indistinguishable from the switch being off.
- It sits **beside the notification switches on purpose**: those open a VS Code notification, these make a noise, and "I turned the sound off and a notification still arrives" is the confusion that keeping them apart-but-adjacent prevents.

### 3.301.0 — K-22 · U-118 · U-119: a blocked session stops being a dead end (2026-08-28)

- Three items around one failure, reported the same morning: a session asked for permission on a terminal nobody was watching and sat there for an hour and a half. Every layer had a way of not helping.
- ### K-22 — bypass on the card has to mean bypass in the process (the CLI half)
- **The Console half was fixed in 3.135.1:** **The terminal and headless paths were still spelling bypass their own way**, and the spelling they used does not enforce it: `--permission-mode bypassPermissions` is read through a branch the CLI guards and `gad()` can downgrade, while `--dangerously-skip-permissions` short-circuits at the top. Three places spelling one instruction is what this item has been about from the start, so all three now go through `permissionFlags`.
- **And `Default` was never resolved at all:** A user whose own settings say `permissions.defaultMode: bypassPermissions` got an asking terminal session — the picker even promised it would ask. The layers are read before the command line is built, exactly as the Console reads them, and the launcher's preview shows the flags the launch will really carry. **A bypass that a policy forbids refuses to start** rather than opening under a label it cannot keep: in a terminal that failure is invisible, because nothing draws a card.

### 3.300.0 — A-20 (step 2): the farm says WHICH kind of attention it wants (2026-08-28)

- **Step two of the auditory cockpit (A-18):** Step one built the ten voices and the chain that picks one, and nothing was wired to it. This wires it: the live monitor now reports every edge that wants the user, carrying the event that names what happened, and the alert dispatch takes that event all the way to the sound, the modal and the toast.
- **`waiting-input` was two different endings wearing one status:** A turn that finished hands control back; a turn parked on an `AskUserQuestion` is still open and wants an ANSWER. They were the same beep and the same "your turn" modal, so the only way to tell them apart was to walk back and look — which is the whole thing the sound was for. `LiveConfig.pendingAskOf` is injected, because only the host knows: a hosted conversation's pending ask lives in the Console, and the monitor keeps its promise never to reach outside itself.
- **Four edges, one emit site:** `waiting-permission` → `question`, `waiting-input` → `question` or `turn-ready` depending on the parked ask, `SessionEnd` → `ended`, the stall sweep → `stalled`. **Once per crossing**, exactly as before: the "waiting" Notification and the `Stop` behind it are one edge, and a session parked in a state does not keep ringing. `onTurnReady` survives unchanged as the narrow view of the same emit — wire one or the other, never both.
- **A second permission ask in the same turn is no longer silent:** The dedupe key was the prompt ordinal alone, so a question asked mid-turn would have swallowed the turn's own ending, and a second tool approval would have made no noise at all — precisely the case somebody is away from the screen for. The key now carries the event and the tool ordinal too, and neither counter moves between the two events that announce one turn ending, so that collapse still holds.

### 3.299.0 — A-20 (step 1): ten alert voices, and which one plays (2026-08-28)

- **The first step of the auditory cockpit (A-18), and nothing is wired to it yet:** — this is the core plus its assets, in the build order the design note lays out. The farm could make exactly one noise, on the one edge where a turn finished. Away from the screen, "your turn" and "it is asking you something" were the same beep, so the only way to tell them apart was to walk back and look — which is the whole thing the sound was for.
- **Ten voices, generated rather than sourced:** (`tools/make_alert_sounds.js`). The obvious way to get ten alert sounds is to download them, and then the extension ships ten files whose licence nobody can state; these are written from arithmetic, cost 340 kB together, and each one's character is a line of code somebody can read and argue with. All are ≤1.2 s, 44.1 kHz mono, normalised to −3 dBFS. **`chime-soft` is `turn-ready.wav` and is not regenerated** — it is the sound every current install already makes, and a "nicer" replacement would have changed it silently.
- **`src/core/alertVoices.ts` — one place answers "which sound, and why":** Session beats agent beats settings beats the built-in default, and the answer says which step gave it, because "why did it play that?" has to be answerable on the page. **A voice whose file is gone falls through rather than silencing the alert**, and the step it passed over is reported with the reason: silence is indistinguishable from an alert that never fired. Out of the box "your turn" and "asking you" are different sounds — one settled chime, one rising double knock.
- **Windows now plays through `MediaPlayer`, with `SoundPlayer` behind it:** `SoundPlayer.PlaySync()` opens `.wav` only and blocks for the length of the sound; the moment a user points an alert at a file of their own, an `.mp3` handed to it throws and the alert becomes silence with no error anywhere. MediaPlayer is the same Windows install, opens mp3/m4a/wma/wav and is asynchronous. SoundPlayer stays as the fallback, because MediaPlayer lives in PresentationCore and a Windows without WPF would otherwise lose the alert it has today. Linux gains `ffplay` between `paplay` and `aplay`.

### 3.298.0 — U-110 — a set of name → value pairs is a row editor (2026-08-28)

- **Three settings are a free-form object:** — `budgets`, `superpowersDefaults`, `agentEngineDefaults`. Nothing can list their keys, which is why all three were left as a JSON textarea, and it is the wrong conclusion: **the key is free, the pair is not.** Setting a budget meant hand-writing `{"developer": 20}` including the brace, the quote and the colon, and getting the agent's name right from memory — with a misfiled name failing silently for ever.
- **One row per pair now: **a name box, an arrow, a value box, a ✕**, `+ add`, and **Save the pairs**:** The name box **suggests and does not constrain** — the fleet the page is already holding is offered, and a name nobody has yet is still typeable, because `*` is a real key and so is an agent created tomorrow.
- **The three maps are not the same shape, and each now says so:** `budgets` is name → **number** and gets number boxes; `superpowersDefaults` is name → **boolean** and gets a yes/no picker that can still say "not set"; `agentEngineDefaults` declares nothing about its values and keeps their JSON, honestly, in one cell. All read off `additionalProperties`. **Where the names come from is a manifest fact too** (`x-af-keys`), because the three differ: `budgets` takes agent names and `*` for the whole fleet, `superpowersDefaults` takes names with **no wildcard at all** (it is an exact match), and `agentEngineDefaults` is keyed by an agent's folder. One guessed list for all three would have offered `*` where it does nothing.
- **Four refusals a pair editor owes, all in words:** a value with no name, a name with no value (writing `""` would file a budget of nothing under a real agent — set-looking and inert), the same name twice, and a figure typed in words. The draft is a **list** of pairs rather than an object, so a pair being renamed does not jump around under the hand.

### 3.297.0 — U-109 — the settings whose fields the manifest already declared (2026-08-28)

- **Fifteen settings name every field of their value, type it, say which ones are required and write a sentence about each — and the page drew a JSON textarea over the top of all of it:** `taskRetry` declares SIXTEEN fields; the user was asked to hand-write its braces and to remember that `backoff` takes one of four words, while typing it into a box that accepts anything.
- **One object with declared fields is now a FORM:** (`taskRetry`, `launchDefaults`) — one box per field, its own sentence beside it. **A list of them is a TABLE** (`cliProfiles`, `launchProfiles`, `pricing`, `mediaPricing`, `quotaWeights`, `modelPolicy`, `dispatchRules`, `relayFeeds`, `ingestFolders`, `extraClaudeDirs`, `projectSkeleton`, `projectTemplates`, `livingChecks`) — one row per entry, `+ add`, a ✕ to drop one, **Save the table** to commit. A closed set is a picker rather than a box that accepts anything, a required column is marked where it is asked for, and a number typed into with words is refused in words rather than written as `NaN`. Both are chosen from `shape.kind`, so a setting whose fields are declared tomorrow gets its editor with nobody touching the page.
- **A boolean field is a three-way picker, not a checkbox:** An unticked box cannot say "not set", and here that is the opposite answer to `false`: a field left empty is LEFT OUT of the object, so its own default stays in charge. A checkbox would have turned one edit into an override of every field the user never looked at.
- **`livingChecks` got the items schema it never had:** — label and precondition required, level a closed set, every field described. It was the last box the schema refused to describe; there are now none.

### 3.296.0 — U-108 — a plain list is a list of boxes, not a JSON document (2026-08-28)

- **Nine settings are an array of strings or numbers:** — root folders, excluded folders, model names, Telegram chat ids, queue targets, webhook events, allowed hosts, pack gallery sources, insight categories. The schema says `items.type: "string"` and nothing more: there is no structure to get right in any of them. The page asked for JSON anyway — a textarea, a pair of brackets, and a comma the user had to remember — which is the report U-89 was opened about.
- **One box per entry now, a ✕ to drop one, one button to add one, and **Save the list** to commit them:** Adding and removing act on a DRAFT, so a list half-edited and abandoned leaves the setting exactly as it was, and every structural gesture reads the boxes first — type a path, press + on the row above, and without that the path is gone. The value is sent as a **real array**, which is the whole point of not making the user write the brackets: it cannot fail to parse.
- **Where the schema says the entries are PATHS, every row gets a Browse:** Declared as `x-af-browse` on `items`, exactly as a scalar path setting declares it on itself — so `agentRoots` and `excludeAgentDirs` get the picker as a fact of the manifest, and the next list of paths gets it by one line there rather than by editing the page. The row picker **saves nothing**: it posts the path back and the draft takes it, because the list around that row is still being edited and saving would commit every other row at the same moment.
- **Which settings get any of this is nowhere written down:** `shape.kind` chooses the editor, `shape.itemBrowse` the picker and `shape.itemAllowed` turns a row into a dropdown — all three read off the manifest (`core/settingShape.ts`), so a list added tomorrow gets the editor with nobody touching the page. **And the JSON box does not go away:** a value the schema cannot describe is always possible, so "Edit as JSON" is one click and comes back, carrying what was typed either way.

### 3.295.0 — M-27 (v2): Multi-Round Tasks Audit & Defect Fixes (2026-08-28)

- **Asynchronous Session Binding Guard (`round:binding`):** Prevents dropping subsequent rounds when engine sessions are matched asynchronously; rounds are parked as queue rows (`round:binding`) and automatically released (`releaseRounds`) once transcripts land on disk.
- **Automation & Schedule Chains (`RunDimensions`):** `rounds` is elevated to a full `RunDimension`; `FarmSchedule`, `FarmTrigger`, and `FarmTemplate` preserve round chains across saving, editing, and execution (`runExtras`).
- **Interactive Mode Exclusion:** Clearly informs users and disables rounds when interactive mode is selected, since conversation resume is strictly a headless operation.
- **DOM Shim Fix:** Corrects `<textarea>` value property handling in virtual DOM tests (`test/lib_page_dom.js`).

### 3.294.0 — U-89: Schema Field Descriptions & First-Match Order Guard (2026-08-28)

- **Pricing & Media Pricing Schemas:** Every field in `pricing` and `mediaPricing` receives comprehensive description strings and required property badges.
- **Match Rule Precedence Guard:** Explicitly documents and warns in schema popovers that the first matching pattern wins (order is significant).

### 3.293.0 — U-89: Schema-Derived JSON Shape Cards & Example Insertion (2026-08-28)

- **Shape Cards for JSON Textareas:** Raw JSON inputs now display a descriptive shape badge (`a list of entries · 3 field(s)`, `one object · 16 field(s)`) backed by an AFTip inspection panel showing property types, enums, requirements, and documentation (`src/core/settingShape.ts`).
- **Example Button:** Injects a schema-validated canonical example directly into the textarea without saving.

### 3.292.0 — M-27: Multi-Round Tasks and Automated Prompt Chains (2026-08-28)

- **Dynamic Round Chains (`src/core/taskRounds.ts`):** 1st round primary prompt, `+ another prompt` dynamically adding chained rounds with per-round delays (`wait min`).
- **Session Continuity:** Subsequent rounds automatically resume the exact same conversation (`resumeSessionId`), preserving model context across turns.
- **Queue Persistence:** Round delays are persisted as independent queue rows (`Task Name · R2`) with `notBefore` timestamps surviving restarts.
- **Runs Table `R2/4` Badge:** Displays real-time round progress and pending durations on hover.

### 3.291.0 — X-130: BacklogEcho — Suppressing Extension Self-Write Echoes (2026-08-28)

- **Echo Suppressor (`BacklogEcho`):** The directory watcher detects internal extension writes by byte comparison, eliminating redundant parse cycles (~54 ms → 6.2 ms speedup).

### 3.290.0 — X-134 / X-135: Backlog Archive Guard & Automated OpenedAt Ordering (2026-08-27)

- **Archive Seating Guard (X-134):** Newly created backlog items are guarded against dropping below `## 🗄 Archive`; misplaced open items are automatically recovered.
- **`openedAt` Timestamp Ordering (X-135):** Captures timestamp events for new items, ensuring accurate top-of-list chronological sorting.

### 3.289.0 — X-136: Superpowers Settings Section & Dynamic Portable Root (2026-08-27)

- **Dedicated Settings Panel:** Health indicator (hook discovery), AFTip capabilities catalog, and per-agent default checkboxes.
- **Dynamic Skill Root:** Empty configurations dynamically resolve to `_SKILLS/superpowers` adjacent to agent roots across machines.

### 3.288.0 — U-106 / U-107: Backlog Archive Separation & 3-State Filter Chip (2026-08-26)

- **Archived vs Done Separation (U-106):** Clear distinction for items moved to `## 🗄 Archive` with a dedicated 🗄 badge.
- **3-State `🗄 archive N` Filter Chip (U-107):** One-click toggle across show in list · hide · show archive only.

### 3.287.0 — X-133: Superpowers Composer Toggle & System Prompt Injection (2026-08-26)

- **Unified System Prompt Injection (`systemPromptFileFor`):** Combines project brief with the Superpowers hook in a single `--append-system-prompt-file` pass.
- **Composer `[⚡ Superpowers]` Chip:** Displays exact injected hook text on hover.
- **Per-Agent Defaults (`agentFarm.superpowersDefaults`):** `developer` starts enabled; exposed via `superpowers.set` bridge op.

### 3.286.0 — X-132: Dormant Disk Skills & Hook Registry (2026-08-26)

- **14 Software Engineering Skills (`_SKILLS/superpowers`):** TDD, systematic debugging, root-cause analysis, and verification stored at zero base token cost.
- **Hook Registry (`src/core/superpowers.ts`):** Dynamic skill directory resolution and hook construction; exposed via `superpowers.status` and `superpowers.hook`.

### 3.209.0 — X-54: A Shipped Example Is Not A Private Note, And A Cap You Cannot Suspend (2026-08-21)

- **The budget example named a real agent of this installation, in Turkish**, in a manifest read by everybody the extension is ever installed for: `{"psikolog": 20, "*": 50}`. It is `{"agent_one": 20, "*": 50}` now, and the dispatcher's example — Turkish match words and the same agent name — went with it. Both faults are the same fault, so the settings manifest is now swept for it: a check fails the build if any shipped description names one of this farm's agents or is written in the user's own language.
- **A figure of `0` in `budgets` means NO CAP on that name** (the brake tests `> 0`), so `{"*": 0}` lifts the fleet ceiling while every per-agent figure stays in force — the same "0 = unlimited" word the mission ceilings speak.
- ‼️ **And the reader does not trust the configuration registry alone (3.232.0).** Exactly one of the 124 settings this build contributes — `agentFarm.budgetsUnlimited` — is missing from the running window's registry on the author's machine: `getConfiguration().get()` hands back `undefined` instead of the declared default and `update()` refuses it with "is not a registered configuration", while the keys either side of it in the same manifest object both work. Nothing is wrong with the manifest and no extension can put a dropped key back from inside. A setting that vanishes is not a setting, so every Agent Farm value is now read through one door that falls back to the user's own `settings.json` (JSONC-aware: comments, trailing commas, and the `//` inside every path in that file) when the registry has nothing to say. The fallback is on the READ side only — reading a file cannot corrupt it — and a write that VS Code refuses now answers with the file path and the exact line to paste rather than stopping at the refusal.
- **`budgetsUnlimited` — suspend every daily budget without losing what you typed.** There was no way to lift a cap short of deleting the figures and typing them back in later. While the switch is on, no agent has a cap and nothing warns or blocks on spend; the figures stay in settings, untouched, and turning it off puts them straight back in force. Off by default — a ceiling is never removed by an upgrade.
- **‼️ And it is honoured everywhere or it is not honoured at all.** Seven places read the budgets, and a switch obeyed by six of them is worse than no switch: the cap looks off and something still refuses to run. Nobody reads the setting directly any more — one accessor returns an empty map while the switch is on, which is already the shape every reader treats as "no cap set" — and a test fails the build the moment a new call site reads it raw.

### 3.208.0 — S-43: The Session Nobody Started, And The Process Above The One You Can See (2026-08-21) {#spare-oturumlar}

- **A daemon's spare worker is no longer drawn as a session.** Claude Code v2.1+ keeps a daemon and one pre-warmed idle worker ready so a `claude` you type starts instantly. That worker registers itself like a real session (`"kind":"bg","spare":true,"status":"idle"`) and fires the same SessionStart hook — so the Live Timeline showed a card for a session nobody had started, and it belonged to whichever agent's folder the worker happened to sit in.
- **‼️ The verdict is re-taken on every read, in both directions.** The hook fires the instant the worker is born and its registry file may not be on disk yet, so the answer at SessionStart can honestly be *"I do not know"* — and a filter that decides there and then passes its own test and leaks in real life. Nothing is hidden on a shrug (which is exactly the old behaviour, so no other engine can regress); the question is simply asked again whenever the list is read, by which time the file exists. A session that has ever submitted a prompt is released and never held again — that is the daemon handing its spare to a real conversation, and a rule that kept reading `spare:true` would hide the conversation with it.
- **☠ Force kill — end the tree, not the leaf.** "End session" stops the process the registry names, and on Windows `taskkill /T` only ever walks DOWN from there: the daemon above it saw its worker die, bred another under a new id, and the card came back for ever. Force Kill climbs to the top of the **claude** part of the tree and stops it there. The climb is bounded three ways, each a safety rule: it never enters VS Code's own ancestry, it only climbs through a process that is recognisably claude (so a session started from a terminal stops at the topmost claude and never touches the shell), and it gives up after a fixed depth so a reused pid cannot become a loop. The confirmation names every process that will go, by name and pid.
- On the session card, in both right-click menus, and on the bridge as `sessions.forceKill`. A Console-hosted session is refused by name — its tree runs under this window, and End session already closes it properly.
- 45 checks in `test/test_spare_sessions.js`, including the race, the hand-over, the four engines that have no claude registry at all, and the dangerous case: a leaf whose grandparent is the editor.

### 3.206.0 — X-51 (X-50): The Chain Walked End To End, And The Build Read (2026-08-21)

- **End-to-end acceptance (`test/test_wiki_e2e.js`, 41 checks):** mark → brief → start the run (claimed, still `pending`, a second run refused by name) → **write exactly what the prompt instructs** → report back → ask both sides → check the shape of what was written. Each piece had a suite; the **seam** never did.
- **‼️ A real defect found on its first run:** a `[[link]]` and the `index.md` line must use the page's **filename form** (`[[Aday_Havuzu]]`, not `[[Aday Havuzu]]`). Obsidian resolves a link against the filename and so does `wiki.lint` — a spaced link is broken on both sides. The agent procedure (`_REF/wiki.md` §2, §4) now says so.
- **Build verification (`npm run verify` → `tools/verify_vsix.js`, 12 checks):** every gate in this repo ran **before** `vsce`, so `.vscodeignore` — a list of patterns — could drop a new `media/*.js` or `out/panels/*.js` silently: the extension installs cleanly and the page is blank the first time it is opened. This reads the VSIX's own zip listing and checks that every panel, core module, media asset and **every script `htmlShell` asks the webview for** is really inside.

### 3.205.0 — U-70 (X-50): The Wiki Cockpit — The One Surface That Reads The Pool (2026-08-21)

- **A dedicated Wiki panel:** `Agent Farm: Open Wiki` or Toolbox → **📚 Wiki**. Four doors wrote to the pool and no surface read it ([details](#wiki-kokpiti)).
- **Vault strip:** root · `-WIKI-ANAYASA-.md` · `index.md` · `log.md` — clickable, missing ones marked ⚠. **With the root or the law absent both compile buttons are dead and say why before the press.**
- **DENSE table:** one mark = one line; everything longer is an AFTip. Hovering a row gives the session, agent, engine, turn range, note and who marked it when — zero clicks.
- **[Compile Selected] / [Compile All Pending]:** both are `wiki.compile.run`. **Neither marks anything compiled** — only the run reporting back closes a mark.
- **A mark with a run out is not offered:** `compiling` is not a state in the pool but a `pending` row with a live claim; it draws no tick box and is not in the count.
- **Inline editing and provenance:** ✎ topics (an emptied list is never sent), 🚫 drop, ↺ reopen, ✕ delete — none of them touch a page already written; compiled rows carry a `Category / Concept` breadcrumb.
- **🩺 Lint:** reports `wiki.lint` into the page — reported, never repaired.

### 3.204.0 — M-23 (X-50): Wiki Compilation Engine and Headless Runs (2026-08-21)

- **Headless Compilation (`wiki.compile.run`):** Independent headless agent execution synthesizing accumulated candidates under the vault's `-WIKI-ANAYASA-.md` rules.
- **Command Palette Entry:** `Agent Farm: Compile Wiki Candidates…` lists all pending candidate items; starts synthesis in one click.
- **Concurrency & Claim Protection:** Running compilation claims its candidate entries (`pool.compiling`), preventing duplicate runs on the same topics. Crashed processes release stale claims automatically.
- **Contract:** Agent calls `wiki.candidates.edit {state:"compiled", pages:[…]}` to finalize compiled entries and record created/updated pages.

### 3.203.0 — K-26 (X-50): 🔖 Wiki Tagger Badge on Turn Rows (2026-08-21)

- **Direct Turn Tagging:** Console prompt lines, transcript turn banners, and the Turns table feature a quiet **🔖** tagger badge.
- **Popover Picker (`afWiki.js`):** Clicking opens a lightweight popover to select turn ranges (`4`, `3-7`, or full session), existing topic chips, and new topic inputs. Overlapping tags merge cleanly without duplicates.

### 3.202.0 — S-38 (X-50): Session and Timeline Candidate Tagging (2026-08-21)

- **Session Context Menu Picker:** Right-click context menus across the Sessions table, Console cards, and Live Timeline swim lanes feature **Add to Wiki Candidates…**.
- **Topic Selection & Merging:** Lists existing candidate pool topics as selectable checkboxes with instant new-topic additions.

### 3.201.0 — B-14 (X-50): Wiki Candidate Pool Infrastructure (2026-08-21)

- **Lightweight Candidate Pool (`wiki_candidates.json`):** Zero-friction, fully reversible staging ground touching no vault files upon tagging.
- **`wiki.compile` Briefing:** Gathers transcripts, resolves turn ranges, analyzes vault constitution and existing pages, providing an exhaustive briefing to the agent.
- **Bridge & Health:** `wiki.status` reports pool/vault metrics; `wiki.lint` checks orphan and unindexed pages.

### 3.200.0 — M-21: Tasks Header Strip Derived Metrics (2026-08-21)

- **Rich Header Tooltips:** ⚙️ Concurrency ceilings, ⏳ Waiting time distributions, 🛡️ Approval gates, 📅 Schedules, 🏁 Daily success rates, 💵 Cost derivatives explained via rich AFTip panels.

### 3.197.0 — M-26: Interactive Task Targets and Close Policies (2026-08-21)

- **`interactiveTarget`:** `vscode` (integrated terminal), `external` (dedicated OS terminal window / Windows Terminal via `.cmd` wrapper capturing real `%ERRORLEVEL%`), `console` (hosted webview).
- **`interactiveClose`:** `stay-open` (session remains interactive), `auto-close` (single-turn execution via `claude -p` / `runArgs` that closes surface upon completion).

### 3.196.0 / 3.195.0 — U-81: Session Cards AFTip and Full-Text Tooltips (2026-08-21)

- **Full-Text Tooltip:** First and last prompt lines open up to 4,000 characters in AFTip hover panels; removed duplicate "How it opened" block.
- **100% Solid Opaque Panels:** Applied `editor.background` and `tip-host` foreground styling to prevent parent transparency inheritance, sized cleanly for 260px cards.

### 3.194.0 — U-82: Host-Backed Clipboard Integration (2026-08-21)

- **Secure Clipboard Bridge:** Routed all **Copy ▸** context menu actions (`media/afCtx.js`) through the extension host (`vscode.env.clipboard`), eliminating webview clipboard permission failures.

### 3.193.0 — U-80: Live Sessions Cards Prompt Truncation (2026-08-21)

- **90-Character Row Truncation:** Live Timeline cards truncate prompt rows to 90 characters to maintain clean grid layout, delegating full text to AFTip hovers.

### 3.192.0 — Interactive In-Webview Task & Retry Guide (2026-08-20)

- **Embedded Modal Guide:** The `?` button on the New Task form opens an interactive architectural guide (S-19 continuity, M-3/M-10 quota windows, M-12 3-prompt steering) without navigating away or losing form state.

### 3.191.0 — M-25: Tasks Plan and Runs Tables AFTip Panels (2026-08-20)

- **Metric Breakdowns:** Plan table Guard wake-up savings, Runs table Tokens/Cost cells, and average per-run costs detailed via rich AFTip panels.

### 3.190.0 — M-24: Saved Prompt Snippets in Task Forms (2026-08-20)

- **Right-Click Snippet Picker:** All prompt inputs across the task form open `media/afSnippets.js` via right-click to paste saved prompt templates directly at the cursor.

### 3.189.0 — M-21: New Task Placement and Runs Tokens Column (2026-08-20)

- **Top Action Bar Placement:** Moved "New task" button from the Runs tab to the top action strip. Added sortable **Tokens** column to the Runs table.

### 3.188.0 — K-28: OpenCode Resume Model Mapping Fix (2026-08-20)

- **Model Option Matching:** Resumed OpenCode sessions match `opencode/big-pickle` formats against the engine's active option list, preventing invalid model rejection.

### 3.187.0 — K-27: Honest Interruption Status Guard (2026-08-20)

- **Accurate State Distinction:** Tool execution failures are no longer falsely marked as user "Stop" interruptions (`last turn interrupted`); truthful outcomes preserved for Antigravity, Codex, and Gemini.

### 3.186.0 — U-75: Antigravity Transcript Merging Integrity (2026-08-20)

- **ID-Based Session Merging:** Resumed Antigravity sessions in the Console no longer overwrite previous turns in the transcript, maintaining complete history across turns.

### 3.185.0 — U-73: Live Timeline Tooltip Anti-Flicker (2026-08-20)

- **Redraw Bridge:** Periodic Live Timeline DOM refreshes preserve floating `tip-free` tooltips under resting pointers without flickering or dismissing.

### 3.184.0 — U-76: Full Text Copy from Timeline (Copy Corpus) (2026-08-20)

- **Direct Transcript Extraction:** Right-click any point or tool block on the timeline → **Copy Corpus** copies full raw transcript text directly to the clipboard (`timeline.corpus`).

### 3.183.0 — U-78: Model Replies on Live Timeline (`say` Event) (2026-08-20)

- **First-Class Assistant Events:** Model replies render as hollow blue rings (`say`), while user prompts remain solid blue circles.

### 3.182.0 — U-74: Hover Yields to Hand (2026-08-20)

- **Input Muting:** AFTip hover panels mute immediately upon click or keystroke. Clickable buttons feature longer (.6s) hover delays to prevent misclicks.

### 3.180.0 — X-49: Queue Routing by Engine, Model, and Effort (2026-08-20)

- **Target Axes:** Added `engine`, `model`, `effort` dimensions to queue capture forms and filter bars.

### 3.175.0 — X-47: Console Window Isolation for Background Processes (2026-08-19)

- **Windows Hide Enforcement:** Enforced `windowsHide: true` on all background `child_process` spawn calls (`test_no_console_flash.js`).

### 3.174.0 — X-48: Backlog Opened and Last Touched Sortings (2026-08-19)

- **Temporal Orderings:** Added `opened` (first written timestamp 🌱) and `last touched` (last worked timestamp ✎) sort modes to Backlog.

### 3.173.0 — S-40: 5-Engine Turns Page (2026-08-19)

- **All Engines in One View:** Unrolls Claude, Gemini, Antigravity (brain log & Console), and OpenCode sessions into single user turns (`turns.list`).

### 3.171.0 — U-69: Fixed Layout and AFTip Cells for Turns Table (2026-08-19)

- **Declared Table Widths:** `<colgroup>` and `table-layout: fixed` lock column proportions. Added **reasoning** breakdown to Steps column.

### 3.168.0 — X-52: OpenCode Model Catalog Warmup (2026-08-19)

- **Background Model Polling:** Proactively scans `opencode models` into `globalState` on startup, populating model pickers before any session is opened.

### 2.21.0 — Task Forecast & Digest Outcomes, Wave 4 (2026-07-11)

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

- **Sync Agent with the Other Engines…:** CLAUDE.md → AGENTS.md generation (sync-marked), active duties → `.agents/workflows/` slash commands, a merge suggestion for `.mcp.json` → the global gemini configuration; `memory/` untouched (both tools read plain markdown)
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


---

## Appendix: Agent Ecosystem Setup & Portability Blueprint {#portability-blueprint}

> [!abstract] 📖 PURPOSE AND SCOPE OF THIS BLUEPRINT
> This master blueprint is an end-to-end architectural guide for building, configuring, or porting an autonomous AI agent fleet, the **Agent Farm** VS Code cockpit, and the underlying **Obsidian Knowledge Base (LifeOS)** from scratch on any computer.
> 
> Whether executing a disaster recovery scenario after formatting your system or setting up a brand-new hardware workstation, following these steps in order will yield a fully operational agent ecosystem in 15–20 minutes.

---

### 00. Introduction & Architecture Philosophy

The primary limitation of traditional AI tools is their "statelessness." When an agent finishes a task and closes, context is lost, project history is forgotten, and systemic cohesion dissolves.

This ecosystem structures AI not as an ephemeral chat bot, but as a **living, rule-governed, memory-retaining, and self-coordinating autonomous fleet**.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           HUMAN OPERATOR                                │
│         (Strategic Decisions, Goal Setting, Approvals & Vision)         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ (Visual Monitoring & Notices)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AGENT FARM COCKPIT (VS Code)                         │
│   Fleet Status · Budget Tracking · Sessions · Live Feed · Work Queue    │
└──────────────────┬───────────────────────────────────┬──────────────────┘
                   │ (Bridge IPC / JSONL)              │ (REST API / MCP)
                   ▼                                   ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────┐
│        AGENT FLEET (CLI)             │  │   KNOWLEDGE BASE (LifeOS)     │
│ • Developer (Code & Debugging)       │  │ • Projects & Backlog          │
│ • Manager (Planning & Coordination)  │◄─┼─►• Agent Constitutions         │
│ • Psychologist (Focus & Context)     │  │ • Wiki & Memory Pool          │
│ • Basic / Haiku (Mechanical Tasks)   │  │ • Live System Definitions     │
└──────────────────────────────────────┘  └───────────────────────────────┘
```

---

#### 0.1 The Three Pillars: Human, Cockpit, Fleet

1. **Knowledge Base & Memory (Obsidian LifeOS):** The Single Source of Truth. Project plans, backlogs, constitutions, decision logs, and user preferences live here.
2. **Management Cockpit (Agent Farm - VS Code Extension):** The visual command center where the human operator monitors agents, dispatches tasks, and tracks token costs.
3. **Working Fleet (CLI Engines — Claude Code, Gemini, Antigravity):** Independent execution engines that write code, run tests, modify files, and delegate tasks to peer agents.

> [!info] 📖 PRINCIPLE: SINGLE SOURCE OF TRUTH
> Storing the same data in two places guarantees contradictions. All *FACTS* live in the Obsidian Vault; all *METHODS* live in agent constitutions (`CLAUDE.md` and `_REF/`). Agents reference locations rather than copying data into local memory.

---

#### 0.2 Portability & Isolation Principles

To ensure this ecosystem runs seamlessly across OS platforms (Windows, macOS, Linux) and any user folder:

*   **1. Never Hardcode Machine Paths:** Use environment variables (`${env:USERPROFILE}`, `~`, or relative paths) instead of user-bound absolute paths.
*   **2. Separate Rules from Code:** Agent constitutions live in standalone Markdown files, decoupled from application source code.
*   **3. Parameterize Root Directories:** All root paths are configured centrally via VS Code settings (`agentFarm.agentRoots`, `agentFarm.projectsRoot`).

---

#### 0.3 MASTER DEPENDENCY MATRIX

> [!important] 🔴 PRE-FLIGHT CHECKLIST
> All tools, plugins, engines, and ports required to run the ecosystem are categorized across 5 primary layers:

##### 1. Host & Runtime Layer (Foundation)
*   🔴 **Node.js (v20+ LTS):** `winget install OpenJS.NodeJS.LTS` / `brew install node` (Required)
*   🔴 **Git (v2.40+):** Version control and subagent worktree isolation.
*   🔴 **VS Code (v1.90+):** The host IDE for Agent Farm.
*   🔴 **Global NPM Tools:** `npm i -g @anthropic-ai/claude-code @vscode/vsce`

##### 2. AI Engine & CLI Layer (Intelligence)
*   🔴 **Claude Code CLI (`@anthropic-ai/claude-code`):** Primary agent execution CLI (`claude login` required).
*   🟢 **Antigravity / Gemini CLI:** Multi-model alternative engine (`GEMINI_API_KEY`).
*   🟢 **OpenCode / Codex CLI:** Open-source or local LLM execution CLI (`agentFarm.codexHome`).

##### 3. Knowledge Base Layer (Memory)
*   🔴 **Obsidian App:** Vault root container.
*   🔴 **`obsidian-local-rest-api`:** Vault HTTP REST API bridge (Port `27123`/`27124` + Bearer Token).
*   🔴 **`obsidian-tasks-plugin`:** Task metadata formatting standard (🆔, ⛔, ⏫, 📅).
*   🟡 **`dataview`:** Dynamic project indices and queries.
*   🟢 **`obsidian-git`:** Automatic background vault backup.

##### 4. Local Ports & Protocols Layer (Networking)
*   `4141` — **Bridge IPC Socket:** JSONL messaging between agents and VS Code.
*   `8377` — **Live Hook Listener:** Live timeline events (prompt, tool, permission waits).
*   `8378` — **Read-Only Web View:** Phone/LAN dashboard for fleet status and costs.
*   `27123/27124` — **Obsidian REST API:** Vault file access endpoint.

##### 5. External Cloud & Messaging Layer (Optional Integrations)
*   🟢 **Airtable API:** Cloud task table synchronization (`AIRTABLE_API_KEY` + `BASE_ID`).
*   🟢 **Telegram Bot API:** Remote mobile chat trigger bridge (`agentFarm.telegram.enabled`).
*   🟢 **Replicate API:** Agent image/media generation (`mediaAuthSecret`).

---

### 01. Layer 0 — Host Environment and Runtime

```powershell
# Verify runtime tools
node -v
npm -v
git --version
```

```powershell
# Install global CLI tools
npm install -g @anthropic-ai/claude-code
npm install -g @vscode/vsce

# Authenticate Claude CLI
claude
```

---

### 02. Layer 1 — Knowledge Base (Obsidian Vault)

```text
📁 {{VAULT_DIR}} (Obsidian Vault Root)
├── 📁 00_AGENT_AREA/                # Agent operational domain
│   ├── 📁 10_PROJECTS/              # Active and archived project folders
│   ├── 📁 20_WIKI/                  # Distilled knowledge synthesis pool
│   └── 📁 99_SYSTEM/                # System constitutions & LifeOS definitions
├── 📁 01_INBOX/                     # Operational inbox & flow
│   ├── 📁 10_TODO/                  # Task lists (__TODO__.md)
│   └── 📁 20_PROGRESS/              # Ongoing progress reports
└── 📁 90_OTHER/                     # Templates, archives, and helpers
```

---

### 03. Layer 2 — Agent Core, Constitutions & Duties

```text
📁 {{AGENT_DIR}} (Agent Fleet Root)
├── 📄 AGENTS.md             # Shared Constitution (Common rules for all agents)
├── 📄 CLAUDE.md             # Claude CLI root instructions
├── 📁 _REF/                 # On-demand recipe library
│   ├── 📄 bridge.md         # Bridge protocol rules
│   ├── 📄 notices.md        # Notification & Q&A formats
│   └── 📄 duties.md         # Duty checklist formats
└── 📁 developer/            # Example Agent: Software Developer
    ├── 📄 AGENTS.md         # Agent role & domain focus
    ├── 📄 DUTIES.md         # Periodic watch duty checklist
    └── 📁 memory/           # Long-term memory store (≤12 words/line index)
```

---

### 04. Layer 3 — Credentials & MCP Protocols

`📂 ~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": [
        "-y",
        "obsidian-mcp",
        "--vault-path",
        "YOUR_VAULT_PATH_HERE",
        "--api-key",
        "YOUR_OBSIDIAN_REST_API_KEY_HERE"
      ]
    }
  }
}
```

---

### 05. Layer 4 — Agent Farm Cockpit (VS Code Extension)

```powershell
# Build VSIX package from source
cd ~/projects/vsc_AgentFarm
npm install
npm run compile

# Build and install VSIX
vsce package --no-dependencies
code --install-extension agent-farm-3.206.0.vsix
```

`📂 %APPDATA%\Code\User\settings.json`:
```json
{
  "agentFarm.agentRoots": [
    "~/projects/ai-agents"
  ],
  "agentFarm.projectsRoot": "~/documents/lifeos_vault/00_AGENT_AREA/10_PROJECTS",
  "agentFarm.livePort": 8377,
  "agentFarm.web.enabled": false,
  "agentFarm.web.port": 8378,
  "agentFarm.newAgentModel": "sonnet"
}
```

---

### 06. Layer 5 — Bridge & Notices Engine

Bridge operates over a local socket (`localhost:4141`) using JSONL line-delimited messages:

```json
{
  "type": "notice",
  "agent": "developer",
  "noticeType": "question",
  "title": "Architectural Approval Required",
  "content": "Proceed with database schema migration?",
  "handled": false
}
```

---

### 07. Layer 6 — Verification & Disaster Recovery Checklist

```text
┌───┐
│ ✔ │ 1. Do Node.js, Git, and Claude CLI respond correctly in terminal?
├───┤
│ ✔ │ 2. Is Obsidian running with Local REST API plugin enabled?
├───┤
│ ✔ │ 3. Do 00_AGENT_AREA and 99_SYSTEM directories exist in the Vault?
├───┤
│ ✔ │ 4. Are AGENTS.md and _REF/ present in the agent root?
├───┤
│ ✔ │ 5. Does the Agent Farm panel list all agents as ready/green?
└───┘
```

#### Quick Start Cheat Sheet

```powershell
# 1. Setup environment
winget install OpenJS.NodeJS.LTS Git.Git
npm install -g @anthropic-ai/claude-code @vscode/vsce

# 2. Authenticate
claude

# 3. Build & install Agent Farm
cd ~/projects/vsc_AgentFarm
npm install
npm run compile
vsce package --no-dependencies
code --install-extension agent-farm-*.vsix
```
