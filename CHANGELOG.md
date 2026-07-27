# Changelog

All notable changes to Agent Farm. Detailed release notes live in the built-in guide (`Agent Farm: Open Guide` → Release Notes / Sürüm Notları).

## 3.29.1 — The leak behind "it says it is still open", and the places a session can be named (2026-07-28)

- **‼️ Closed sessions stayed un-resumable for hours — and it was a process leak of ours.** `shell: true` means the child Agent Farm holds is the shell, not `claude`: `child.kill()` ended the wrapper and left `claude.exe` running, orphaned, still holding its entry in the CLI's session registry — which is exactly what tells everyone "this session is open". Measured on this machine: **five orphaned claude trees**, each with a dozen children, hours old. Console sessions now die with **`taskkill /T`** (the same tree-kill the task and mission runners already use), and — because a hard-killed process can always leave its file behind — **a registry record whose pid is no longer alive is ignored**. Verified against the five real leftovers: 5 files on disk, 0 counted as live. So closing a session frees it **immediately** now.
- **Can a terminal and the Console share one session? Measured: no.** There is no local way to join a running session — no attach subcommand, and `--remote-control` is the cloud remote for the mobile app, not a local channel. A session belongs to one process; `--resume` forks the state. The guard therefore stays, but with the leak fixed it only ever fires for sessions that really are open.
- **One name, three places.** Renaming a session now works from the side panel (as before), from a **right-click on any row in the Console** (hosted or resumable), and from a **✎ Rename** button on the session's own page — all writing the same store, so a name set anywhere shows up everywhere.
- **Console rows carry the session's title**, not just the agent name, so two sessions of one agent are tellable apart.
- **Resume in Console** is now on the session right-click menu in the side panel, and as a **💬 Resume in Console** button on the session page next to ⏵ Resume.
- **The session tab is named after the session.** It used to read `Session: 3f2a91b8` and hovering it repeated the same fragment; it now carries the session's real title (the id is still on the page).
- **The Files-changed box stops re-opening itself.** It is open the first time (it answers "what did this session do") but a box you closed now stays closed through the live re-renders. It only appears for sessions that actually wrote files — that part was intended.
- **The turn checkboxes earn their place, and now say so.** They are not dead: they are a finer cut than the filters for **Export MD → current view** (keep exactly turns 3, 7 and 12), while **Export MD → everything** ignores them. The row now says that instead of leaving it to be guessed.
- **Navigation is ordered by meaning, not by arrival.** Global nav: **Dashboard · 💬 Console · 💓 Living · 🔔 Notices · 📥 Queue · Live Timeline · Agents · Tasks · Missions · Toolbox**. In the side panel the Console icon sits between **Start Session** and **Turns** instead of jumping to the front.
- 34 new checks (tree-kill and the stale-pid guard, the three rename surfaces, the nav order in both places, the Console row title and its right-click, the Files box remembering its state). Suite: **77 files, 2870 checks green.**

## 3.29.0 — Titles restored, and the Console stops claiming two processes are one session (2026-07-28)

Three things reported from use, two of them mine to answer for. All three were settled by **reading the CLI's own session registry** rather than reasoning about it.

- **‼️ Unnamed sessions got junk titles ("basit-2e"), and 3.24.1 caused it.** The registry says exactly what happened: Claude Code names *every* session — a session nobody named gets an invented one — and marks which is which with **`nameSource`**. 3.24.1 adopted the `name` field unconditionally, so invented labels replaced the titles derived from the first real thing said in a session. Now a name is adopted **only when a human chose it** (`nameSource` anything but `derived`, or a name Agent Farm itself passed with `-n`), and an unmarked name is not trusted, because falling back to the conversation's own title is always the safe direction. **The store is rebuilt once on upgrade**, so the wrong titles disappear by themselves. Order is unchanged and unambiguous: **your rename → the name it was started with → the title from the conversation.**
- **‼️ The Console showed two processes as one session.** Resuming a session that a terminal already had open started a *second* `claude` on the same transcript: both wrote to it, neither saw the other's turns, and the session view stitched the two into one conversation nobody had. The registry makes ownership knowable — the same session id was there twice, `entrypoint: cli` and `entrypoint: sdk-cli` — so the Console now **checks before resuming and refuses by default**, saying what a second process would mean and offering the two things that actually work: **jump to the terminal that has it**, or **start a new session in the same folder**. Rows that are open elsewhere are greyed in the resume list. Resuming into a *terminal* carries the same warning, with a deliberate "open a second process anyway" for when that is genuinely wanted.
- **The Console composer showed dead controls.** On a running session the agent / model / effort pickers were disabled boxes — decided when the process started and unchangeable. They are gone: a live session now shows a plain status line (`dev · haiku`) and keeps the **one control that really works mid-session, the permission mode**. The agent picker appears only where it means something — starting a new session — and starting without one focuses the picker instead of swallowing the message.
- **Reaching the Console.** It was only in the page nav. Now: **💬 in the Agents view title bar**, **Talk in Console…** on an agent's right-click menu, and a **💬 Console** button on the agent page — each opening the Console with that agent preselected (nothing is spawned until you say something).
- **The fleet's own line on the Agent Portfolio.** A pinned **ALL N AGENTS** row above the table, outside the sort so it never moves: working / dormant counts, 7d and 30d sessions and cost, tokens, files, duties (with ⏳ waiting), findings, memory files and the **total fixed context load** — the whole-fleet figure that had no home. It sums exactly the rows on screen, so a project filter narrows it too.
- 33 new checks (chosen-vs-invented names in every combination incl. a derived name colliding with one of ours, ownership lookup and its wording, the resume guard in both surfaces, the composer's two modes, the totals row). Suite: **77 files, 2848 checks green.**

## 3.28.0 — Console: the extension stops watching and starts talking (2026-07-27)

The structural gap the whole audit was built around. Agent Farm could read everything about a session and say nothing to one: every dialog happened in a terminal, and the panel's rich picture — cost, context, health — ended in a wall you could look at but not act through. **DALGA 1** closes it.

- **Sessions run *here* now.** A new **💬 Console** page (first in the global nav, `ctrl+alt+c`) hosts long-lived `claude` processes over the CLI's own streaming JSON channel. Left: the sessions this window hosts, plus your shelf and recent transcripts — a click **resumes one into the Console**. Right: the conversation and a composer. It is the user's own CLI and their own subscription: **no API key of ours, no separate cost model**, and the transcript still lands in `~/.claude/projects`, so every analytic, health and timeline engine keeps working untouched.
- **The composer carries the launcher's vocabulary** — agent · model · effort · permission mode — from the same `core/launch.ts` dictionary, so there is one vocabulary in the extension rather than two.
- **Interrupt and queue.** A running turn stops with **⎋ Interrupt** (the CLI's own control-channel interrupt — the turn ends, the session and its context stay). Anything typed mid-turn is **queued**, shown as queued, and sent the moment the turn ends; the queue can be cleared without touching the running turn.
- **Permissions, answered honestly.** Measured first: Claude Code **does not ask the panel anything** — a tool without permission simply comes back as an errored result. So the Console offers no fake "Allow once" button. It detects the refusal and offers what it can really do: **change this session's permission rule, live, and ask the agent to retry** (`Allow file edits` · `Let it decide` · `⚠ Allow everything` · `Plan only`). The permission selector stays live for the whole session — something the terminal path cannot do at all.
- **What it did to the code, inline.** Every `Edit`/`Write` shows as a tool line with its file and two buttons: **open** and **vs HEAD** (the same diff surface 3.25.0 added, reused rather than rebuilt).
- **Sessions outlive the tab.** Closing the Console tab does not kill a conversation; sessions end when you end them, or with the window. Each row carries its own live cost, turn count and the CLI's own context estimate.
- **Bridge (§19.C):** `console.start` · `console.send` (queues when a turn is running) · `console.sessions` · `console.interrupt` · `console.permissionMode` (with `retry`) · `console.close` — the manager agent drives the same channel the panel does.
- **Verified against reality, not mocked.** `test/smoke_console_live.js` drives **real** claude processes end to end — answer, mid-turn queueing, interrupt in flight, a refused write, the live grant, the retry that really writes the file, and a clean close: **18/18 green for $0.076**. It is kept out of `npm test` because it spends money. The measurement also caught the one design error worth naming: the CLI emits **nothing at all** until its first stdin line, so queueing the first message until the session "looks ready" deadlocks forever — the first message is now always sent.
- 62 new unit checks on the protocol itself (flag building, queueing rules, event folding incl. thinking blocks and hook chatter that must never render as conversation, the narrow permission-refusal detector, cost accumulation, junk lines). Suite: **77 files, 2815 checks green.**

## 3.27.0 — A guide you can search, and findings that remember (2026-07-27)

Two of the "it exists but it is not good enough" items, both of which were costing the same thing: information the farm already had, with no way to ask it a question.

- **Search inside the guide (E3).** 1900 lines of manual answered "what does this do" only if you already knew which section to open. The guide now carries its own search box: it marks every hit, walks them with Enter / ↑ ↓ (Esc clears), and — the part a browser's find cannot do — **dims the table of contents down to the sections that actually contain the word**, with a live `4/17 hits in 3 sections` count. So it answers *where is this explained*, not just *here is the next occurrence*. VS Code's own `ctrl+F` find widget is enabled on the panel too, so the muscle-memory key works before anyone notices the box.
- **Insight history (E1).** The Insights list was a snapshot: a finding appeared, you fixed or dismissed it, and the farm forgot — so the two questions that decide whether a finding is worth acting on had no answer. A ledger now rides along with the same refresh that builds the list, recording three moments (first seen, last seen, last action) and one derived fact that matters more than the rest: **regressed** — it was gone after you acted, and then came back. That is the difference between "the fix worked" and "the fix looked like it worked".
  - Every tree row carries its own record: **↻4** when a finding has come back four separate times, **⚠back** when your fix did not hold, and a tooltip that says it in words (`3× (came back) · first seen 12d ago · your fix did not hold — back after 2d`).
  - **Insight History…** (a button on the Insights view) lists the ledger, worst offenders first, with the counts that matter in its header: how many are open, how many keep returning, **how many came back after you acted**, and how many fixes are holding.
  - A refresh is not an occurrence — a finding that is still listed is the same appearance — so "seen 4 times" means four separate visits, not four dashboard renders. Churn with no action is never called a broken fix.
  - **Bridge (§19.C):** `insights.history` (args: `limit?`, `recurringOnly?`) — an agent asked "what keeps breaking?" answers from the record instead of from today's snapshot.
- 56 new checks (the two ledger rules under every ordering — refresh vs return, action-then-clear, action-then-regression, churn without an action, acting on an already-resolved finding; the sentence each state produces; summary, pruning and hand-edited stores; plus the wiring of both surfaces). Suite: **76 files, 2753 checks green.**

## 3.26.1 — The new surfaces announce themselves (2026-07-27)

Three releases added four things a user could only find by knowing they exist. A feature nobody can discover is a feature nobody has.

- **Farm status rows for Projects, Web view and Chat channel** — the dashboard card that already names every dormant subsystem now names these too, each with its one-click way in. Two half-configured states get their own honest wording instead of looking broken: a web view that is **enabled but not serving** says the headless service is probably still holding the port, and a chat channel that is **connected with an empty allowlist** says so and points at the allowlist rather than reading as "active".
- **The Quick Menu (`ctrl+alt+f`) learned the new pages** — Agents (portfolio) under Pages; Manage projects…, Web view… and Connect Telegram… under System.
- 11 new checks (each row's three states, the two half-states and their actions, and that the rows stay absent for callers that report no data). Suite: **75 files, 2708 checks green.**

## 3.26.0 — Access: the farm is readable from a phone, and can be written to from a chat (2026-07-27)

The audit's **C block**. Agent Farm was a set of webviews inside one VS Code window: nothing to look at from a phone, nothing at all while VS Code was closed (the headless service kept the farm *running* and showed nobody anything), and no way to send it a message and get an answer.

- **A read-only web view (C1).** `agentFarm.web.enabled` serves one self-contained page — what needs you, what is running, per-agent and per-project cost, recent sessions, notices — sized for a thumb and refreshing itself. The design is a **snapshot contract**, not a second UI stack: the extension writes `web-snapshot.json` on a 20s beat, and whoever owns the port serves it. So the page can never disagree with the panel, and **when VS Code closes, the headless service takes the port over** and keeps serving the last snapshot — saying so on the page rather than pretending the numbers are live. It hands the port straight back when VS Code returns.
- **…with the rails a network-facing surface needs.** Off by default. **127.0.0.1 unless you opt into LAN.** A **token is mandatory** — no token means the server refuses to start, not that it serves the farm to whoever asks — and it travels as `?t=`, a bearer header, or the cookie the page sets so a phone bookmark keeps working. And it is **read-only by construction**: there is no route that starts, stops or changes anything. **Open Web View…** generates the token, asks local-vs-LAN once, and hands you the URL.
- **An inbound chat channel (C3).** **Connect Telegram…** takes a bot token (verified against Telegram before anything is saved, and stored in the **secret vault** — never in settings.json), and a chat can then talk to your agents: any message runs headlessly on the agent the chat is bound to and the answer comes back in the same thread, with the run's cost. Commands: `/agent <name>` · `/agents` · `/status` (what is running, what needs you, today's spend) · `/cancel` · `/help`. No inbound port is opened — the farm long-polls outward, so nothing has to be exposed.
- **…with two rails that are not optional.** An **allowlist**: a message from an unlisted chat is refused and told **its own chat id**, so allowing it is one copy-paste and nothing else. A **daily cap** (`agentFarm.telegram.maxDailyUSD`, default $1): chat-started runs count against it and stop when it is reached, while `/status` keeps working. An unknown slash command is answered with help, never run as a prompt.
- **Voice input (C2) is deliberately not in this release.** A VS Code webview cannot get at a microphone (the iframe carries no `microphone` permission and there is no API to grant one), so a composer inside the panel would need an external recorder — a native dependency on a machine that has no GPU and no Docker, for the weakest item in the block. The right home for it is the **web view**, which runs in a real browser where `getUserMedia` just works, once that surface gains write actions. Written up in the roadmap rather than half-built.
- 72 new checks — including the **real server over real HTTP**: token refused / query-token / bearer / cookie / 404 / health-without-auth / refusing to start tokenless, plus the page being genuinely self-contained. Then snapshot totals and the honesty of "this is stale", the chat allowlist and the day-rolling budget ledger, update parsing that drops everything unusable, and the guarantee that an unknown command is never executed. Suite: **75 files, 2697 checks green.**

## 3.25.0 — Scope and data model: projects, the fleet on one screen, and what the agent did to the code (2026-07-27)

The audit's **B block**. Three gaps that share a cause: the farm knew agents and sessions, and nothing above or below them — no grouping over agents, no view of the fleet as a portfolio, and no sight of the one thing a code agent actually produces.

- **Projects — the missing axis.** `agentFarm.projects` names a set of agents (and/or folders): a customer, a product, a contract. The Dashboard grows a **Projects table** — sessions, today, total, tokens, last activity, and a budget percentage per project — and clicking a row scopes the Sessions table below it. The Sessions tables gain a **Project column and filter**; the Portfolio groups by it. **One rule keeps the money addable: an agent belongs to exactly one project** (assigning moves it), and everything unclaimed lands in an honest **Unassigned** bucket — so the rows always sum to the fleet total. Set it up with **Manage Projects…** (create, members, folders, daily budget, note, rename, delete) or *Assign Agent to Project…* on an agent row; the raw setting is there for paths and anything the picker does not cover.
- **Agent Portfolio — twelve agents side by side.** A new page (**Agents** in the global nav, `agentfarm.openPortfolio`): one row per agent, grouped by project, sortable on every column — what it is doing right now, **how many days it has been quiet** (💤 past 14), 7-day and 30-day sessions/cost/tokens, files it wrote, duties with ⏳ when work is waiting and ⏸ when paused, open findings, memory files, fixed context load. Filter to a project, hide dormant agents, and start a session / assign a project / reveal the folder from the row. The question "which of these is dead?" now has a column instead of an afternoon.
- **What the agent did to the code.** Every session's transcript already carried each `Edit` / `Write` / `MultiEdit` / `NotebookEdit` call **with its own before-and-after text**; none of it was ever shown. The Session Viewer now opens with a **Files changed** box: every file, write count, ±lines, which turns touched it — and unfolding a file shows **the session's own hunks**, red above green. That is what *this* session changed when it changed it, not what the file looks like now, so a later session's work can never be read as this one's; **vs HEAD** sits next to it as the separate, clearly-labelled git question, opened in VS Code's own diff view. A tool call that came back as an error is marked *failed — not applied* and counted nowhere. The Sessions tables gain a **Files** column, counted during the index's existing parse, so it costs nothing.
- **Bridge (§19.C):** **`projects.list`** (the rollup — "what did this customer cost"), **`projects.assign`** (moves an agent, creating the project if needed), **`projects.set`** (create/update/delete a definition) and **`sessions.files`** (a session's files with ± totals, `detail:true` for the hunks themselves).
- 106 new checks (project normalisation from hand-edited settings, resolution by name/id/path incl. the `acme-other` near-miss, the one-owner rule under moves, a rollup that provably sums to the fleet total; each write tool's own input shape, failed calls excluded, viewer turn numbering incl. sidechains, hostile transcripts; portfolio windows, the dormant rule, duties/findings/budget joins; plus the wiring of every new surface). Suite: **74 files, 2625 checks green.**

## 3.24.1 — The session name shows up, and "Reveal folder" opens the folder (2026-07-27)

Three things 3.24.0 got wrong in the hand, reported from use.

- **A session's name was invisible.** The launcher's *Session name* field passes `-n`, and the CLI shows it in its prompt box — but Agent Farm's tables kept showing the title derived from the first prompt, so naming a session changed nothing where it mattered. The reason: the name is **not written to the transcript**. It lives in the CLI's own live registry, `~/.claude/sessions/<pid>.json` (read from a real one, not assumed: `{pid, sessionId, cwd, kind, entrypoint, name, status, …}`), a file that is deleted when the process exits. So the names are now **read from there and remembered** — scanned at startup, on a quiet 20s beat, and twice right after a named launch, with the persisted map only rewritten when something actually changed. A session's title now has three honest sources in order: **your rename → the name it was started with → the title derived from the conversation**, and whatever a name replaces stays visible in the row's tooltip. This also covers sessions you named yourself outside the panel.
- **"Reveal in File Explorer" opened the agents root, for every agent.** VS Code's `revealFileInOS` always reveals a path *inside its parent*, which is right for a file and wrong for a folder — picking an agent made no difference to what opened. Reveal now decides by kind: a **folder is opened** (Explorer directly on Windows, the OS handler elsewhere, with the old behaviour as a fallback), a **file is revealed inside its folder**. One shared helper backs every reveal in the extension — agent folders, agent roots, skill folders, the outputs folder, Toolbox and Airtable paths — so they all behave the same way.
- **The Start Session button sat on the wrong side.** In the Agents view title it now follows Open Dashboard instead of preceding it.
- 29 new checks (the CLI registry incl. BOM, broken and nameless files; remembering across a session's death and a mid-run rename; the three-source title precedence in both directions; the reveal decision and a guard that no call site goes back to the raw command; the button order). Suite: **71 files, 2519 checks green.**

## 3.24.0 — Interaction and control: the panel can start, shelve and stop sessions (2026-07-27)

The extension could see everything about a session and do nothing to one. Every session opened as a bare `claude` with the model, the effort and the permission mode typed into the terminal by hand; the six sessions you live in were somewhere inside a list of hundreds; a session working on the wrong thing could only be stopped by finding its window; and 173 commands were reachable through exactly one keyboard shortcut. This release closes that block — the **A. Interaction and control** findings of the product audit — on the terminal path, without touching the one-click Start that already works.

- **Start Session… — what a session starts with.** A launcher (`ctrl+alt+s`, the 🚀 in the Agents view title, the agent right-click menu, the Agent Detail page) whose every row is a dimension of the launch — **agent · model · effort · permission mode · session name · first prompt** — and whose top row is the trigger, with **the exact command line as its description**. No hidden flags: what will run is on screen before it runs. Models come from your own `agentFarm.modelAliases` knowledge base plus free text; effort and permission mode offer exactly what `claude --help` documents, with `bypassPermissions` marked ⚠. The launcher remembers what each agent was last launched with, loads and saves named **profiles** (`agentFarm.launchProfiles`), and can promote the current picks to the defaults.
- **…and defaults for every session.** `agentFarm.launchDefaults` (`model` · `effort` · `permissionMode`) is carried by **Start, Continue and Resume** alike — set once instead of typing `--model` into a terminal all day. Every field is optional and an empty one emits **no flag at all**, so the default `{}` launches exactly the bare `claude` it always did.
- **The shelf: pin + labels.** A **★** column on the Sessions tables (Dashboard + Agent Detail) puts a session on your shelf, where it is **listed first and exempt from the row limit** — *Show 20* gives you 20 rows plus the whole shelf, so pinning a seventh never hides a sixth. **Label Session…** adds comma-separated labels that render as chips and are searched by the table's own text filter. Pinned sessions head the Recent Sessions tree outside its 30-row cut, and **Session shelf…** (`ctrl+alt+p`) is the shelf as a picker: Enter resumes, 📖 opens the transcript, 📌 pins. Marks are attached to the session id in the extension's own storage — the transcript is never touched.
- **⎋ Interrupt — a running turn can be stopped.** Headless runs were always killable; a session you talk to is stopped by the key a person would press, so Agent Farm **types Esc into that session's own terminal**: the turn ends, the session and its context stay. On the Sessions tables (running rows), the Timeline's live cards, a stalled row in Needs You, `ctrl+alt+i` and the session context menu. Targeting goes exact launch → newest terminal of that agent → external window, and **a session that cannot be identified gets nothing**: typing Esc into a random claude window, unlike focusing one, cannot be undone. In external-terminal mode the window is brought to the front with an honest "press Esc there" — no fake button.
- **A keyboard, not a keybinding.** `ctrl+alt+f` opens a **Quick Menu**: a grouped, type-to-filter list (Sessions · Pages · Work · System) where every row prints its own shortcut, so the menu teaches the direct keys rather than replacing them. Direct: `ctrl+alt+s` launcher · `ctrl+alt+p` shelf · `ctrl+alt+i` interrupt · `ctrl+alt+d` Dashboard · `ctrl+alt+n` Needs You · `ctrl+alt+l` Timeline, with `ctrl+alt+q` (work queue) untouched. Ctrl+Alt is AltGr on Windows, so no new binding sits on the Q/E/T letters a Turkish-Q layout types characters with — a rule a test now enforces.
- **Bridge (§19.C):** **`sessions.start`** (an interactive launch with the same flags, and it says so — headless work is still `tasks.add`), **`sessions.pin`**, **`sessions.tag`**, **`sessions.shelf`** ("what am I keeping?") and **`sessions.interrupt`**, which reports `interrupted: false` with a reason rather than pretending it typed into a window nobody owns.
- 172 new checks (the command builder flag by flag incl. quoting against three shells, defaults and validation; the marks store against hand-edited state, the pinned row pool and its exemption from the top-N; interrupt targeting case by case including the refusal to grab a stranger's terminal; the ★ column, pinned-first ordering, label search and the ⎋ button in the webview; the Quick Menu walked against package.json — every command real, every printed shortcut the one really bound; all five bridge ops). Suite: **70 files, 2485 checks green.**

## 3.23.0 — Plan usage: the real quota, live on the dashboard (2026-07-26)

Every number on the dashboard was derived from local transcripts — including the "5h window" card, which is Agent Farm's own token estimate measured against a limit you typed into a setting. The one figure that actually decides whether a run will go through, your **subscription's rate-limit state**, existed only inside a Claude Code session as `/usage` and was invisible to the panel that plans the work.

- **The card, next to Farm status.** A **Plan usage** box now sits to the **left of Farm status, on the same line**: the two answer the paired questions "what can the farm do" and "how much room is left to do it with". **Current session (5h)** and **Current week (all models)** (plus the per-model weekly bars when the plan has them), each with its percentage, a bar that goes yellow at 75% and red at 90%, and its reset time as **both** a clock time and a countdown — `Resets 21:40 · in 2h 20m`, because "when" and "can I start this now" are two different questions.
- **Live, two ways.** The card **refreshes itself** on a beat — `agentFarm.planUsageRefreshMinutes`, default 5 minutes, `0` = manual only — and the **⟳ in its corner** reads it again on demand. Both go through one cached service, so a dashboard left open all day makes one request per beat rather than one per render, and a mashed ⟳ can't outrun a 5-second floor.
- **Read from the source, never guessed.** `GET /api/oauth/usage` with the OAuth session Claude Code already stores in `~/.claude/.credentials.json` — the same endpoint and the same row wording the CLI's own `/usage` uses, verified against a live response before a line was written.
- **It reads that file and never writes it.** Refreshing an expired token would rewrite the CLI's own credentials and race it for them, so an expired token is *reported* — "start a Claude Code session to refresh it" — not silently repaired. Every other dead end prints its own one-line reason instead of a wrong number: no OAuth login of that kind (API key, gateway, macOS Keychain), an offline machine, a 401, a 429, any other status, an unparseable body, or an account the endpoint reports no limits for.
- **Nothing blocks on it.** The host answers the card out of band, so a slow or unreachable endpoint never holds up a dashboard render — and a routine data refresh never blanks the figures already on screen.
- **Bridge (§19.C):** **`usage.plan`** (args: `force?`) returns the same bars as data — state, plan, percentages and ISO reset times — so an agent asked "have I got room to run this?" answers from the quota instead of guessing from cost. Shares the card's cache.
- 62 new checks (credentials reading incl. BOM/corrupt/foreign-auth files, ISO vs unix-seconds resets, the payload projection and its flooring/clamping, TTL + force + floor + shared in-flight request, all eight unavailable paths, and the card itself: placement beside Farm status, bar/severity/reset rendering, the ⟳ and its busy state, the self-refresh beat arming and disarming, the honest-note state). Suite: **66 files, 2313 checks green.**

## 3.22.0 — The shared constitution reaches the other engines (2026-07-26)

The cross-engine sync had a hole big enough to make it decorative: it only ever looked at an agent's own `CLAUDE.md`. The **shared constitution** — the nest root's `CLAUDE.md` that Claude Code loads for every child session, the file that defines how these agents work at all — was synced nowhere. An agent running under Antigravity or Codex got its identity and none of its rules. Worse, the file it did write was, for Antigravity, the wrong file.

- **Verified, not assumed.** Codex's docs are explicit: *"Starting at the project root (typically the Git root), Codex walks down to your current working directory"*, one `AGENTS.md` per directory, merged, 32 KiB ceiling — so a constitution one level up reaches it by itself. Antigravity's installed build states its own rule in the prompt it hands the model: *"Workspace Customizations Root: `.agents` (relative to the workspace root)"* — two roots, global and workspace, **no parent walk and no nested loading**. Read from the running product, not from a blog post.
- **Two lanes, because the engines read different files.** Every sync now writes `<agent>/AGENTS.md` (the cross-tool file **Codex** merges on its walk) **and** `<agent>/.agents/AGENTS.md` (**Antigravity**'s rules file). The second one is new: until now the sync wrote only the folder-root file, which Antigravity never reads — the compatibility layer was writing to an address nobody was home at.
- **The constitution goes where each engine can actually reach it.** Codex: mirrored **once** to the nest's own `AGENTS.md` by the new **Sync Shared Constitution with Antigravity + Codex…** command — and deliberately *not* repeated in the agent files, so no Codex run pays for it twice or drifts toward the 32 KiB cap. Antigravity: embedded **inline** in each agent's `.agents/AGENTS.md`, inside a fenced `agent-farm:shared-constitution` block, since nothing above the workspace root is loadable. Codex loads 18.3 KB, Antigravity 18.3 KB, each a single complete copy.
- **The Claude side is never a party to it.** `CLAUDE.md` is read, never written — except by the explicit reverse sync, which now **strips the constitution block first** so a shared rule can never leak into an agent's own instructions, and says so in its result. The nest `CLAUDE.md` is written by no command at all: on divergence the constitution command offers a diff or overwrites the *generated* file, never the source.
- **Drift is visible or it isn't a rule.** The sidecar fingerprints the constitution and the rules file too. Change the constitution and every agent still carrying the old text says so in Insights; a hand-edited `.agents/AGENTS.md` is reported as diverged and left untouched (a forced sync would overwrite it, so the insight tells you to carry the gain into `CLAUDE.md`). A missing rules file counts as drift, so sidecars written before this release don't read as "done".
- **Bridge (§19.C):** `constitution.sync` (args: `root?`, `force?`) mirrors the constitution and reports its state; `agents.sync` now states which constitution the agent carries. Both non-destructive without `force`.
- 48 new checks (both lanes and their payloads, the fence and its stripping, constitution drift + missing/hand-edited rules files, foreign-file protection with backup, the reverse sync's no-leak guarantee, nest detection in `scanRoots`, both bridge ops). Suite: **65 files, 2250 checks green.**

## 3.21.0 — Filters that answer: any combination, applied as you type (2026-07-26)

Every filter drop-down in the extension could express exactly two things — **everything**, or **exactly one**. "Show me the manager and the developer" was not expressible anywhere except the Search page, which had built the right control and kept it to itself. And every filter text box waited for blur or Enter: a number typed into a min/max bound sat there doing nothing until you clicked somewhere else.

- **One filter control, extension-wide.** The Search page's checkbox picker moved into a shared component (`media/afFilters.js`, shipped to every page by `htmlShell`) and now backs **every** filter drop-down: Dashboard + Agent Detail sessions tables (Agents), Turns (Agents, Models), Notices (Type, Level, Agents, Status), Work Queue (Targets, Authors), Missions (Lead, Team has), Tasks — Plan (Kind, Agent, Model, State, Guard) and Runs (Agent, Status, From), Task Analytics (every filterable column), Media Gallery (Sources). Search itself was rewritten onto the shared component, so there is one widget with one behavior rather than two implementations.
- **The semantics are the Search page's, everywhere.** All ticked = **no filter at all**, so an agent or model that appears later is included without reopening the picker. Nothing ticked = an honest empty result. The button always states the pick: `Agents: all` · `Agents: dev` · `Agents: 2/7` · `Agents: none`. **Select all / Clear** sit above the list — *Clear, then tick the two you want* is the point of the control, not a footnote.
- **The menu stays open while you tick.** Each tick re-filters the list behind it; the open menu (and its scroll position) survives the page re-render that causes, so picking three agents is three clicks, not three re-openings.
- **Filters apply as you type.** Text, number and date filter boxes now filter a beat after the last keystroke — no Enter, no clicking away — and the caret survives the re-render the filter triggers: sessions tables and Turns (contains-boxes, every min/max range, the date range, the Show box), Missions (ranges + dates), Dashboard (comparison dates + Show). Boxes that **save** rather than filter (settings, pricing, forms) deliberately stay on commit: there, every keystroke would be a write.
- **Live Timeline — no gaps at the short end.** The range strip gains **30m, 2h and 3h**: `15m · 30m · 1h · 2h · 3h · 4h · 8h · 16h · 24h · 3d · 7d · 30d`. Watching one session live no longer means choosing between "too tight" and "four hours of history".
- **Deliberate exceptions:** sort boxes, grouping and settings pickers stay single-choice (they are not "all or one"), and so do the two page scopes that are a **drill-down** rather than a subset — the sessions tables' 🧑/🤖 origin (two values; all-or-one already covers every combination, and it has a one-click switch) and the Media Gallery's production/scene, whose matrix belongs to one production.
- 41 new checks (the component's own suite: label states, null/[]/subset semantics, Select all / Clear, the menu surviving a re-render, the button relabelling itself on pages that answer without re-rendering, debounced typing, caret restore, number boxes that have no caret to restore; plus picker coverage on Search, the sessions tables, Tasks and Missions, and the timeline range strip). Suite: **64 files, 2202 checks green.**

## 3.20.0 — Sessions tables: your dialogs separated from the farm's own runs (2026-07-26)

With standing duties, schedules and triggers firing all day, the sessions the user actually *talked* in were a minority buried in the same list as every automation run — and there was no way to tell one from the other, let alone filter. The session viewer had two related problems: it called the AI side "Assistant" (these are agents), and it opened as an undifferentiated wall of text.

- **Origin column + scope (Dashboard · Agent Detail · Turns).** A narrow **By** column marks every row: **🧑 you started it** (interactive session) or **🤖 automation started it** (schedule / trigger / task / mission, or any `claude -p`). All three tables **open scoped to 🧑**; the **🧑 chip** right before Filters flips **User ↔ All in one click**, and the filter panel's **Started by: All / 🧑 User / 🤖 Auto** row adds the third scope. Scope is remembered per page, and the chip row states the cut (`12/47 sessions`) whenever rows are hidden.
- **Read, never guessed.** The origin comes from the transcript's own `entrypoint` field — `sdk-*` = a program launched the CLI, anything else = a person at a keyboard. Verified against all 261 transcripts on the machine (`cli` / `sdk-cli` / `claude-desktop`, none missing the field), and against the task store: every task and schedule the farm runs is headless, so every one of them reads as 🤖. An unknown entrypoint counts as yours — a filter must never bury a real conversation.
- **The row pool is built per origin.** The host ships the union of each sort criterion's top-N; that union is now taken separately for the user and auto lanes, so the User scope gets its genuine top-N however much automation dominates the raw list.
- **"Assistant" → "Agent"** in the session viewer, Turns and Search chip rows, with the extension-wide glyph vocabulary applied: **🧑 User · 🤖 Agent · 🔧 Tool calls · 📄 Results · ⚠ Errors**. The message rows carry the same marks, and the viewer's subtitle now opens with **🧑 your session** / **🤖 automation run**.
- **The viewer opens folded, in Single-open mode.** What you land on is the session's turn list — a clickable map — not a wall of text; opening a turn folds the previous one. Expand all / Collapse all / Single-open override it any time (an explicit "off" survives reloads), turns arriving on a live session come in folded, and a turn you opened by hand is never folded behind your back. Every jump (deep link, ↑↓, breakdown row) still auto-unfolds its target.
- **Single-open is the default on every session surface.** The viewer's turn bands, the Turns page (already) and now the Sessions tables' row accordion all open one thing at a time, so a session surface stays a list you scan instead of a page you scroll. An explicit "off" is remembered per page.
- **Bridge (§19.C):** `sessions.recent` and `turns.list` take the same `origin?` scope (`user` / `auto` / omit) and state each row's origin — an agent asked "what did I work on yesterday?" can now answer with dialogs instead of its own scheduled sweeps.
- 51 new checks (origin parsing incl. future `sdk-*` entrypoints, the per-origin pool, column/switch/filter behavior, the new accordion opening states, live turns arriving folded, both bridge ops). Suite: 63 files, **2161 checks green**.

## 3.16.0 — Work-Queue author lanes + "Open with" for report/answer links (2026-07-24)

Two related board upgrades. The manager now self-queues its meaningful delegations (author=`manager`, often status `delegated`), which in a single flat list buried the user's own captures; and every report/answer `.md` link opened as raw, unrendered markdown in a VS Code tab.

- **Work Queue — functional author lanes.** The queue splits into three top-level categories instead of one flat pipeline: **🟠 Needs you** (blocked, author-independent — stays prominent, the attention bell), **🧑 Your captures** (the PRIMARY lane, work FOR the agents, front-and-center), and **🤖 Agent-tracked delegations** (a SECONDARY, collapsible lane so the manager's tracked work never crowds out your captures). The pipeline sub-lanes (New / Grouped / Delegated / Done / Dropped) live inside each category.
- **Live status mirror on agent-tracked items.** A delegated item shows the LIVE status of the mission/task it links (running → done/failed), read fresh via its `missionId`/`taskId`, with a click-through chip that opens the Missions/Tasks panel. The collapsed lane header carries a rollup (e.g. "2 running · 1 done"). The queue refreshes as those tasks change state.
- **"Open with" split button (Notices + Work Queue).** The report link on a notice and the answer/report links on a queue item are now a split button: the main click opens with your default; the ▾ caret offers **VS Code (raw)**, **Markdown preview (rendered)**, **Obsidian** (opens the vault file rendered via `obsidian://`), and a **custom external app** (`{file}` argument template). One shared `openReportDoc` helper backs both panels.
- **Default lives in a module store, not a settings leak.** The chosen default (and the custom-app command) is written to the extension's own `doc-open-config.json` in globalStorage — deliberately kept out of the schema-driven `agentFarm.*` page, since the custom-app path is machine-specific. Configure it from the caret menu (⚙) or `Agent Farm: Configure Report/Answer Open Mode`.
- **Bridge (§19.C):** `docopen.get` / `docopen.set` expose the open-mode config to agents. 28 new pure tests (mode coercion, obsidian URI, space-safe argv, module-store round-trip incl. BOM tolerance, both ops). Suite green.

## 3.13.0 — Capture now: the /context breakdown on demand (2026-07-24)

3.12.x could only SHOW a breakdown if `/context` had been run inside the session — and a corpus scan showed that is almost never true (ONE recorded invocation across every transcript on the machine). The feature was correct and useless. Root-cause fix: produce the breakdown on demand.

- **⟳ Capture now / Refresh button in the popover.** For a non-live session the host runs `claude --resume <sid> -p "/context"` in the session's cwd — verified live: `/context` is a local command (**no API call, zero cost**, no usage line), it appends only a harmless system/local_command snapshot to the SAME session file (no fork), and the stdout parses into the breakdown, which lands in the popover in seconds. The session's own model is passed so the context-window ceiling is correct.
- **Print-mode shape learned.** `claude -p "/context"` emits markdown tables, not the TUI's ANSI gauge — the parser now recognizes both (header/divider rows and the per-tool MCP/Skills tables are excluded by shape, labels stay verbatim so new categories need no code change).
- **Live sessions refuse Capture on purpose** — we never race a second writer against the live TUI on one transcript file. Guarded twice: the live monitor plus a 90s mtime-freshness check (our own capture's append is exempted). The status line points at the session's terminal instead — type `/context` there and the watcher fills the card by itself.
- Verified end-to-end against the real CLI: a real capture run (9s, 7 categories, totals, guards) plus 10 new parser checks and a full webview click-flow harness (toggle/inside/outside/Esc/capture ok/live/error). Suite: 57 files, 1714 checks green.

## 3.12.1 — The /context breakdown is always reachable; whole-card click (2026-07-24)

Found live within the hour: 3.12.0 hid the breakdown button entirely when the session had no `/context` capture — which is exactly the state most sessions are in, so the feature looked absent right where the user went looking for it. Also the button label was Turkish ("detay"), violating the UI-is-always-English rule.

- **The whole Context now card is now the click target** (a small corner button was too easy to miss); the ⛁ glyph in the corner is the permanent affordance — always visible, brighter on hover, accent-colored while the popover is open. Card tooltip explains the click.
- **No snapshot → the popover explains how to get one** (run `/context` in the session's terminal; on a live session the card refreshes itself within seconds). A discoverable empty state instead of a silently missing feature.
- All UI text English. Behavior verified end-to-end in a DOM harness: open/toggle/inside-click/outside-click/Esc, live-push re-render, both states. Suite: 57 files, 1704 checks green (5 new).

## 3.12.0 — Session viewer: the /context breakdown, on the Context now card (2026-07-24)

The terminal's `/context` shows a rich split — System prompt, System tools, MCP tools, Memory files, Skills, Messages, Free space, Autocompact buffer — but that detail was invisible in the extension; the Context now card only had the single live number. It turns out Claude Code records each `/context` run in the transcript (a `system`/`local_command` line), so the data was there all along, unread.

- **`⛁ detay` corner button on the Context now card** (fades in on hover; click toggles, outside-click / **Esc** close). It opens a popover — positioned absolutely so it overlays without reflowing the KPI row — listing every `/context` category with its tokens, percentage and a mini bar (Free space muted, Autocompact buffer in the warning tint).
- **Real data, not a reconstruction.** `buildData` captures the latest `/context` snapshot from the transcript, strips the ANSI + the glyph gauge, and reads the labelled category rows verbatim — so a brand-new category label needs no code change. The popover footer carries the snapshot's **timestamp** and a reminder to re-run `/context` to refresh, since it can lag the live gauge (it belongs to the moment you ran `/context`, not the latest request).
- If a session never ran `/context`, the button is hidden and the card is untouched.
- Tests: 10 new parser/render checks (k/m suffix decoding, rows with/without the word "tokens", fractional percents, "Auto-compact window" not mistaken for a category, latest-snapshot-wins, null when absent) — verified against a real captured transcript. Suite: 57 files, 1699 checks green.

## 3.11.1 — Report filenames: the poster agent is spliced in even with an explicit reportName (2026-07-24)

The shared report folder's naming contract is `YYYY-MM-DD_<agent>_<topic>.md` — the agent's name is mandatory because every agent writes into ONE folder. The auto-name honoured it but an explicit `reportName` was used verbatim (agent lost), which contradicted the constitution's instruction "give only the short topic". Now `reportName` is the topic part and the host splices date + agent around it either way; a date or agent prefix the caller added anyway is stripped first so nothing doubles. (Found live: the v3.11.0 delivery report itself landed without `developer` in its name.)

## 3.11.0 — The bridge becomes a full control plane: duties.*, mission control, edit-in-place everywhere (2026-07-24)

Closing every §19.C gap the manager's bridge audit found — and the ones it didn't. Functions the panels/palette had but the bridge couldn't reach are now ops, so an agent (above all the manager) can run the farm end-to-end programmatically:

- **`duties.*` — the standing-vigilance system is finally bridge-manageable** (the audit's top finding: the pure API existed, the bridge was blind). `duties.list` (per agent or farm-wide, each duty with its LIVE watch status — is work waiting, how many files, since when), `duties.add` (cadence validated; warns when the agent's CLAUDE.md never references DUTIES.md — or appends the instruction itself with `ensureReference=true`), `duties.update` (patch semantics, `""` clears a field), `duties.delete`, `duties.togglePause`, `duties.move`, and `duties.automate` (duty → watch trigger, the same spec the palette command builds — extracted into one shared builder so they can't drift).
- **Mission control from the bridge:** `missions.pause` / `missions.resume` (live engine unpauses in place, a parked/interrupted run relaunches with context) / `missions.cancel` (engine stops, in-flight delegated tasks cancelled, pending approval rejected) — plus the two waits that used to strand a mission until a human clicked: `missions.answer` (the planner's ask-user question) and `missions.approve` (each-round plan approval, ok=false rejects so the planner revises). `missions.status` now reports `pendingQuestion` + `awaitingApproval` so an agent knows which one to call.
- **Edit-in-place everywhere:** `schedules.edit` (any field — title, prompt, agent, kind, time, dow, onceAt, missed policy, enabled — with the same settle-the-past stamp the UI applies when catch-up switches on; no more delete+recreate losing the id) and `triggers.edit` (title/prompt/agent/watch/hook fields/timing). `triggers.add` installs watch/hook/webhook triggers with UI-default timing (a webhook returns its POST url), `triggers.delete` removes them.
- **Results are readable, not just startable:** `tasks.get` returns one task in full detail INCLUDING its archived output body (`tail` caps the chars) — before this an agent could queue work but never read what came back. `tasks.delete` removes a single row (running tasks refused — cancel first).
- **Builder surfaces:** `workflows.add` (steps validated, advanced fields — runIf/onFail/verify/outputContract/webhook/media — pass through untouched) / `workflows.delete` · `templates.add` / `templates.delete`.
- Duty edits refresh the trees/panels immediately; all ops re-read DUTIES.md from disk so bridge edits and hand-edits never race a stale cache.
- Deliberately NOT bridged (security posture, like the secrets vault): the generic Needs-You approval queue (browser-automation and permission approvals stay human-only; mission approvals are bridged because `approvalMode:"auto"` already exists as an agent choice).
- Tests: 44 new bridge-contract checks — duties lifecycle against the real compiled duties.js in a temp dir, schedule/trigger/workflow/template/task guards, mission-control flows. Suite: 57 files, 1686 checks green.

## 3.2.0 — Tasks Board grows up: bulk actions, re-run, filter, live pulse (2026-07-22)

The Board section looked like a monitor but managed like a viewer — every management verb the backend already had (retry, clear-finished, run-next, reveal-terminal) is now ON the page, plus the long-list ergonomics were missing:

- **Bulk actions on columns.** Done gets **clear all** (confirm first; history archived, output files deleted — one click instead of one ✕ per card), multi-item Inbox/Parked get **cancel all** (confirm first).
- **Every card carries its next action.** Finished cards: ↻ **re-run** (fresh copy; a workflow-step task resumes its chain — same engine as the tree's Retry). Queued cards: ▶ **run now** (jumps the queue). Running cards: ⌨ **jump to the terminal**. Cards with an output or a costed transcript get explicit 📄 open-output / 🗒 open-transcript buttons — the double-click shortcut stays but is no longer the only way in.
- **The card tells its story.** Hovering the title shows the full prompt; a provenance badge says where the task came from (🕑 schedule · ⚡ trigger · 🔗 workflow, named in the tooltip); the run's API-equivalent cost shows next to the media cost.
- **Board filter.** A filter box next to the command bar narrows every task column by title/agent/status; column headers show `shown/total`; Needs-Approval cards are never filtered away.
- **Live pulse.** The NOW strip gains a **🏁 today** cell (done/failed since midnight, archive included — clearing the board doesn't zero the day; turns warning-hot on failures). Relative times and running durations re-render every 30s (never while you're typing; the command draft survives re-renders now).
- **Bridge (§19.C):** new ops `tasks.rerun`, `tasks.runNext`, `tasks.clearFinished` — the board's new verbs are agent-reachable, with status-precondition guards.
- Tests: board verbs, bulk buttons + confirm routing, filter narrowing/restore, today cell, tooltip/badges, bridge op contracts. Suite: 56 files, 1555 checks green.

## 3.1.1 — Airtable module: edge-case audit + real end-to-end verification (2026-07-22)

An adversarial sweep of the whole Airtable stack (new `test_airtable_edge.js`, 67 checks) plus real verification through the actual claude CLI, fixing six defects:

- **MCP now expands env tokens in root paths** (`discoverInstances`). The page expanded `%VAR%`/`${env:VAR}` before discovery but the MCP tool side used the raw root — a tokenized/portable config found instances in the UI yet failed for agents. Unified on one expander (`expandRoot`, also handling the `${VAR}` registration form and `~`); the page and the agents now agree.
- **Two agent-facing guidance messages named removed things.** `NOT_CONFIGURED` and the multi-instance error still pointed at the old "Toolbox card" and the deleted `agentFarm.airtable.*` settings — an agent would have relayed instructions for UI that no longer exists. Both now point at "Open Airtable Engine → Add folder".
- **`airtable_media_save` rejects a directory path** — it only checked existence (true for folders), so a folder path produced a bogus `unknown`-type record. Now requires a real file.
- **The MCP server reports its real version** (read from the staged `.version`) instead of a hardcoded `3.0.0` that drifted.
- **The Airtable page shows the config path as a portable token** (`${APPDATA}\…`) matching the registration line, with the resolved path in the tooltip and for the open action — no more alarming raw `C:\Users\…` under a "nothing here is machine-specific" label.
- Config header comment corrected to describe the store-file architecture (not the removed settings mirror).

Verified end-to-end on the real claude: `claude mcp list` connects the server (proves `${APPDATA}` expands in args); a haiku `airtable_instances` call returned live instances (proves the `AIRTABLE_MCP_CONFIG` env token expands and the config reads); a haiku `airtable_media_save` created a real record with correctly marshalled structured args, then hard-deleted and 404-verified (live data left pristine). Suite: 56 files, 1522 checks green; live smoke 10/10. Full technical report in the agent's raporlar/.

## 3.1.0 — Airtable Engine gets its own page; the store file becomes the single source of truth (2026-07-22)

3.0.0's surface repeated shapes from the discarded line and its settings plumbing failed in the field — both fixed by redesign, not patching:

- **Own page, not a card.** The fat block squatting on top of the Toolbox is gone. **Agent Farm: Open Airtable Engine** opens the module's control room: instance CARDS first (live light, counts, Open UI, Set default, start hint on down ones), then folders, defaults/connection, and an **Agent access** panel showing what agents can actually do (live-verified after a probe). Toolbox keeps a normal-sized module tile on Overview + a header button.
- **Single source of truth.** On the user's machine a VS Code settings write silently failed and the folder list evaporated. The settings layer is REMOVED: the module's own store file (`<globalStorage>/airtable-config.json`) is the one config — the page edits it, the MCP re-reads it per call, and every failed write is reported. The `agentFarm.airtable.*` settings keys are gone.
- **Folder picking without a wrong answer:** discovery now accepts a root that IS an instance (…\db\stem) as well as the parent (…\db) — `config.json` is looked for at both levels, deduped.
- **Tasks page gets its pulse:** a permanent **NOW strip** (running vs limit, needs-you, queue, next scheduled run — clickable jumps) visible in every section, and section buttons with live counts (⚠ on Analytics when alerts exist).
- Tests: engine root-as-instance + dedup, store round-trip/legacy-key/patch-merge, the new page webview suite (21), NOW-strip assertions. Suite: 55 files, 1453 checks green.

## 3.0.0 — Airtable Engine module · Tasks command page · global nav (2026-07-22)

A ground-up rebuild of the three goals attempted in the discarded 2.86–2.93 line, this time designed first (the version jump to 3.0.0 marks the break — those numbers stay burned):

- **Airtable Engine as a built-in module.** The user's own data engine (knowledge atoms + media records) ships inside the extension: a zero-dependency MCP server (`out/mcp/airtable`, 10 `airtable_*` tools) **staged** to globalStorage so the `~/.claude.json` registration survives every extension update, `${APPDATA}`-tokenized so it survives machine changes, and **entirely settings-driven** — no hardcoded paths anywhere; empty defaults; `agentFarm.airtable.*` settings visible, explained, and mirrored automatically into the MCP's config file (a settings change reaches agents without restart). A legacy hidden config is migrated INTO the settings with a notification; a version-pinned registration self-heals on activation. The **Toolbox card** is the configuration center: engine/media folder management with a real folder picker + validation, defaults, live-health-checked instances table (ports never assumed), register/unregister/probe. Unconfigured tools answer with guidance, not errors. Bridge ops `airtable.*` (§19.C).
- **Tasks command page** (global nav, left of Missions): Board (the full Kanban with drag-and-drop, NL command bar, per-agent load strip vs concurrency limits), Automations (triggers with reliability scorecards + schedules with next-run, all row actions), Reusables (templates + workflows), Analytics (30d KPIs, daily throughput, per-agent scorecard, task families, alerts, forecast digest, History/Forecast bridges). The standalone Board page folded in; `openBoard` stays as an alias. New bridge ops: `triggers.toggle/fire`, `schedules.runNow`, `templates.list/run`.
- **Global navigation**: Toolbox on every page right of Missions, Tasks left of it — one muscle-memory cluster, duplicate `related:` buttons removed (the double-Toolbox bug class is structurally gone).
- **MCP probe expands `${VAR}`** (plus `${env:VAR}`/`%VAR%`) before launching — the Toolbox probe now starts exactly what claude starts, so tokenized registrations probe green.
- New suites: `test_airtable_mcp.js` (46 checks — discovery, search, record assembly, full save/scan/update flows against a mock engine speaking the real API contract, and the stdio JSON-RPC server itself), `test_airtable_ext.js` (19 — tokenization, staging, registration state/repair on a fixture home), `test_airtable_card.js` (18 — card rendering + action routing), `test_tasks_webview.js` (47). Suite: 55 files, 1437 checks green.

## 2.85.0 — You decide how the AI speaker is labelled (Farm Settings) (2026-07-21)

The data-derived AI label from 2.84.0 is now **fully yours to shape**, in a new **Display & Labels** section of Farm Settings — three settings, live-applied (the open Turns / Session Viewer pages re-render the moment you change them):

- **`speakerLabelTemplate`** — compose the label from tokens filled from each message's model id: `{ai}` (claude · gemini · codex), `{model}` (opus · sonnet · haiku · gpt · …), `{version}` (4.8 · 3.5 · …), `{raw}` (opus-4-8). Anything else is literal, so `MyBot` is a fixed label and `{ai} {model} ({version})` → *Claude Opus (4.8)*. Empty parens / dangling separators from an absent token are cleaned up. Default `{ai}` — the current behaviour.
- **`speakerLabelCase`** — `page` (Sessions upper like `USER`, Turns lower like `user` — the default), or force `upper` / `lower`, or `asis` to keep a fixed label's own case verbatim.
- **`speakerLabelFallback`** — what shows when the model id yields nothing (unknown engine, `<synthetic>`). Default `agent` — never "assistant".

One shared renderer (`src/core/speaker.ts`, mirrored in `media/charts.js`; config reaches the webviews via `window.__AFUI__` in the HTML shell) drives all four sites — Turns screen + export, Session Viewer screen + export — so the label reads identically everywhere. `test_speaker.js` grew to cover model parsing (family + version, dated ids), the template composer, casing and config coercion. Suite green: 51 files, 1307 checks.

## 2.84.0 — The AI speaker is labelled from its model, not a hardcoded name (2026-07-21)

Everywhere a conversation is shown used to hardcode the AI participant's name — the Turns page printed a lowercase `claude`, the Session Viewer an `ASSISTANT`. Both were wrong-in-waiting: the day a Gemini or Codex session is read, a fixed `claude`/`ASSISTANT` would mislabel it. The label is now **derived from the model id each message carries**, so it is always a fact about the data.

- **`ASSISTANT` / `claude` → the engine's own name**, upper-cased on the Session Viewer (to match `USER`), lower-cased on the Turns page (to match `user` / `tool`) — nothing else about the format, font or meta line changes. `claude-opus-4-8` → **CLAUDE**; a `gemini-*` turn → **GEMINI**; an OpenAI / Codex id (`gpt-*`, `o1` / `o3` / `o4`, `*codex*`) → **CODEX**. The model itself (`opus-4-8`) still shows in the meta exactly as before.
- **`agent` when the model is unknown** (missing id, `<synthetic>`) — never "assistant" again; this is an agent.
- One shared derivation drives all four sites — Turns screen + export and Session Viewer screen + export — so the label reads identically everywhere. Host copy in `src/core/speaker.ts`, webview mirror in `media/charts.js` (`aiName` / `aiLabel`).
- New suite `test_speaker.js` (vendor detection incl. old dated ids, case-insensitivity, `agent` fallback, mirror-present guard). Suite green: 51 files, 1287 checks.

## 2.83.0 — One command, two engines: Antigravity + Codex cross-engine sync (2026-07-19)

The "Sync Agent with Antigravity" command now makes an agent compatible with **both** Antigravity **and** OpenAI Codex in a single action — because both engines read the very same `AGENTS.md` the sync already generates from `CLAUDE.md`. Codex needs no second instruction file, no second sidecar, and shares `memory/` as-is; standing duties reach Codex through the AGENTS.md prose that points at DUTIES.md.

- **Renamed to "Sync Agent with Antigravity + Codex…"** — same command, same non-destructive state machine (none / foreign / claude-ahead / antigravity-ahead / conflict, each with `.afbak` backups). The Antigravity core (`CLAUDE.md ↔ AGENTS.md`) is untouched; the Codex layer is added on top of every forward/reverse sync, so **the Claude Code path and existing Antigravity behavior are unchanged**.
- **Codex MCP bridging.** The one real format gap between the engines is MCP: Antigravity reads JSON, Codex reads TOML (`[mcp_servers.*]` in `config.toml`). When an agent has a `.mcp.json`, the sync now also drops a merge-ready `.agents/codex/mcp.suggested.toml` (Windows paths as TOML literal strings, `env`/`http_headers` sub-tables — matching how Codex serializes its own config). Agent Farm never edits your live `~/.codex/config.toml` — you own the merge, exactly as with the Antigravity MCP suggestion.
- **Bridge op `agents.sync` (§19.C).** Agents can now drive the cross-engine forward sync themselves: `CLAUDE.md → AGENTS.md` + Codex MCP snippet. Non-destructive — if `AGENTS.md` diverged from `CLAUDE.md` (conflict / foreign / antigravity-ahead) it reports the state and changes nothing unless `force=true`. This also closes a pre-existing gap where the Antigravity sync had no bridge op at all.
- New suite `test_codex_sync.js` (TOML emitter for stdio + http servers, additive `syncCodexExtras`, CLAUDE.md/AGENTS.md left untouched) and an `agents.sync` dispatch-contract test in `test_bridge.js`. Suite: 50 files, 1264 checks green.

## 2.81.2 — Export MD choices + variant-grouped copy picker (2026-07-19)

- **Export MD now asks what to include — on the Session Viewer AND the new Turns page.** Clicking ⬇ Export MD opens a prompt: **Current view** (the on-screen state applied — filters, the content Show selection, and crucially the **fold/collapse accordion**, which the export used to ignore) or **Everything** (the full content regardless of the view). When you pick *Current view* and something is folded, a second question decides whether folded turns are **omitted** (default) or kept as **titles only**. The Turns page's Export writes one `## agent · turn n/N — prompt` section per listed turn, with session/model/tokens/cost, and the open turns' content filtered by the Show row.
- **Capability Matrix copy picker groups by content.** When several agents have an item, the picker now buckets identical copies into lettered **variants** (`A` = most common / newest): a row reads `variant A (shared by 3)` vs `variant B (unique)`, so you see which agents agree and which stands apart before choosing the source — instead of a flat newest/differs label.
- `test_turns.js` grew Export-MD coverage (view vs everything, folded-titles on/off, Show-row filtering) — 46 checks; suite still 48 files green.

## 2.81.1 — Turns page polish + copy-source rule everywhere (2026-07-19)

- **Turns page:** the row-count default is now **200** (a turn is far finer than a session); the **Tokens** column moved to sit right after **Model**; the **Turn** column is wider and the **Session** column narrower (the prompt is the row's identity, the session is context — both ellipsize with the full text in the tooltip); and a **Show row — All · Dialog · User · Assistant · Tool calls · Results · Errors** — now decides what an unfolded turn shows of its content, exactly like the Session Viewer, **defaulting to Dialog**. The selection is remembered.
- **Capability Matrix — the copy-source rule now covers duties too, and always asks when there is a choice:** ＋ on any kind (skill · MCP · memory · **duty**) with more than one donor **always opens the picker**, even when the copies are identical, so the source is the user's choice; a single donor still just confirms. Duties previously fell through to the old silent "first agent found" path.

## 2.81.0 — Turns page + honest matrix copies (2026-07-19)

- **New "Turns" page** (`Agent Farm: Open Turns`, or the new **Toolbox · Turns** buttons in the Dashboard header between Missions and ⌕ Search): the whole farm unrolled to **one row per user turn**. Columns: agent (● / sub / ⌨), the turn's opening prompt (the row's identity), the session it belongs to (short, full title in the tooltip), `n/N`, model tags, when, duration-to-next-turn, tools, errors, tokens, cost — per-turn figures match the viewer's turn table exactly (subagent work bills to the turn that spawned it). Controls are the Sessions tables' set adapted to turns: sort box, Show/All, Expand/Collapse/Single-open, and a filter panel with **two text boxes** (turn contains / session contains) plus agent & model dropdowns, flags, min–max ranges and dates. **▸ folds a turn open into its actual content** (prompt, replies, tool calls); clicking a row opens the transcript at that turn. The page header carries the exact same seven-button global cluster as the agent pages. Turn rollups are collected during transcript indexing — the page opens instantly and live-refreshes. Bridge op per §19.C: `turns.list`.
- **Capability Matrix — ＋ copy now picks its source honestly:** the host compares every agent's copy (file hash for skills/memory, definition for MCP/duties); identical everywhere → one confirm naming the source; differing → a QuickPick (newest first, `newest / = same as newest / ≠ differs` labels with change date, size, recall count) so the user chooses which variant spreads — no more silent "first agent found" donor.
- **Capability Matrix — memory recall counts fixed:** recalls are now recorded by full path and attributed to the agent whose memory/ folder was actually read. Reading another agent's same-named file (or the `~/.claude` auto-memory) no longer inflates a cell, and a freshly copied file starts at an honest **0 recalls** — previously it could be born showing another agent's history (e.g. "10 recalls" on a brand-new copy).
- New suite: `test_turns.js` (29 checks — turn rollup parsing, ownership-filtered recalls, row building, the `turns.list` bridge op).

## 2.80.0 — Toolbox: every Claude extension, both scopes, one console (2026-07-19)

Until now the extension managed skills and MCP servers per agent only — the USER level (`~/.claude` + `~/.claude.json`, shared by every agent) was invisible, and five other extension kinds weren't shown at all. The Toolbox closes that hole end to end.

- **New "Toolbox" sidebar section** (between Missions and Recent Sessions): Skills, Subagents, Commands, MCP Servers, Hooks, Plugins, Output Styles and Settings Files as kind → scope → item, with per-kind counts. Click an item to open its defining file; the header icon opens the full page.
- **Toolbox page** (`Agent Farm: Open Toolbox`): an Overview map with per-kind explainers, then a management tab per kind — search/filter, scope badges, frontmatter details, 30-day real usage (skills/MCP), open/reveal, **remove with backup** (`.afbak` sibling — nothing is lost), scaffold new skills/commands/subagents at either scope.
- **MCP probe:** "how many tools does this server actually have, and what are they?" — the page connects to the server itself (stdio or streamable HTTP, the same initialize → tools/list handshake claude does) and shows every tool with description and parameters. Cached on disk; re-probe on demand. Plus per-agent disable/enable and surgical user-scope removal from `~/.claude.json`.
- **Hooks management:** every lifecycle hook across user + agent settings files, removable one at a time without touching the rest of the file.
- **Plugins:** marketplaces + catalogs with enable/disable via the `enabledPlugins` settings key claude honors.
- **Bridge ops (per the farm-bridge rule):** `toolbox.list`, `toolbox.inspect`, `toolbox.mcptools` — agents can query the inventory and probe servers through the bridge.
- Secrets in displayed definitions are always masked (`••••` + tail); probes read the raw config only to connect, never to display.
- New suite: `test_toolbox.js` — 50 checks, including a REAL stdio probe against a fixture MCP server and a REAL streamable-HTTP probe (SSE reply + session header) against an in-process endpoint.

## 2.64.0 — Missions: the planner plans, you see everything (2026-07-17)

The first real mission exposed five failures at once; this release fixes all of them at the root.

- **The planner can no longer do the work itself.** The first live mission burned minutes and credits because the lead — a full-tool headless claude — started *implementing* instead of deciding, blew the 10-minute timeout, and the "kill" didn't even kill it (on Windows, `child.kill()` on a `shell:true` process leaves the real claude running and billing in the background). Now: planner calls run with **write-tools disabled** (`Edit/Write/Bash/…`), a **hard turn cap** (a lead that burns it gets one "decide NOW" nudge in the same session before the round fails), a timeout kill that takes the **whole process tree** down, and a briefing that says it in words too: *you are the planner, not the worker; scale your effort to the goal — a small goal is one short round.*
- **Model control, per role.** Who runs on what is now yours to decide, three layers deep: **Planner model** pins the lead's planning calls, each team member's new **model** field pins that member's delegations, and anything left empty falls through to your model-policy rules and the agent's own default. Chosen models show on the run's team chips; every explicit choice is validated (strict charset) and printed in the task's output header.
- **Live "now" strip.** An active run shows what is happening *right now* — "lead is planning round 2 · 1m 40s", "round 2: running coder + reviewer (wave 1/2)" — on the run page and in the sidebar row. Fed entirely by state events the engine already writes: zero extra load on the run.
- **Pause finally answers back.** Clicking Pause flips the button to a pressed **Pausing… (undo)** state with a hold strip explaining that the current activity finishes first; clicking again withdraws the request. The sidebar shows "⏸ pausing…" on the row. Resuming a user-paused run tells the lead it was paused, not "interrupted".
- **Failures explain themselves.** A failed mission's reason (timeout, invalid planner replies, budget stop…) now rides in the closing notification (an error toast, not an info one), in a red FAILED banner on the run page — including the honest note that a killed planner call's spend isn't in the tracked total — and in the sidebar tooltip.
- Full suite: 43 files · 968 passed.

## 2.63.0 — Missions everywhere: global toolbar button + sidebar section (2026-07-17)

2.62.0 shipped Missions but parked its button on the Dashboard alone — the one global shortcut that wasn't global. Fixed structurally, plus a sidebar home:

- **Missions joins the global header cluster.** The shared page header's cluster is now *Dashboard · Live Timeline · Missions · (related panel) · ⌕ Search · ⚙ Settings · Refresh · ? Guide* — so the Missions button appears on **every** page (minus the Missions page itself), exactly like every other global shortcut. The Dashboard's one-off "related" button is gone; one line in `pageHeader.js` did the whole rollout, as designed in 2.59.0.
- **New "Missions" sidebar section** between Tasks and Recent Sessions — the tree twin of the Missions page, fed by the same store and live events. Each run shows a status/verdict icon (partial verdicts glance yellow), round count vs limit, spent $, age; expand for rounds → delegations (status, cost; click a delegation to open its archived output; click the run to open the full page). Pending waits surface as **actionable rows**: Approve/Reject a waiting round, Answer the lead's question — no page-hopping. Row actions: Pause / Resume / Cancel (confirmed), **Run again** (fresh run of the same spec, confirmed — it costs money), **Delete run** (final runs; prunes the spec when orphaned). Empty state links New Mission / Open Missions Page.
- Full suite: 43 files · 952 passed.

## 2.62.0 — Missions: dynamic multi-agent orchestration (2026-07-17)

Workflows are pre-drawn DAGs; a **Mission** decides the next step at run time. You give a goal, a **lead agent** and a **team** — the lead plans round by round, delegates, reads the results and re-plans, until it finishes with an honest verdict. "Orchestrator → coder → reviewer → tester → merge" without drawing it first; a failed delegation is information to re-plan on, not the end.

- **Planner loop with real session continuity.** Each round calls the lead headlessly; results are fed back into the **same planner session** (`claude -p --resume`) so the lead keeps its context (and prompt cache). If a resume dies, a compact ledger reseeds a fresh session. The reply is a strict JSON decision — `delegate` / `ask_user` / `finish` / `abort`; an invalid reply gets exactly one retry with the error fed back.
- **Delegations are ordinary headless tasks** — visible in the Tasks view, archived, cost-metered, quota/concurrency-guarded, cancellable. The Missions panel links each step to its output.
- **Hard limits, never the model's goodwill:** max cost / rounds / tasks / minutes / parallel per mission. Exhausting one forces a **finish-only round** (delegating refused, honest summary required). A planning-loop guard blocks repeated identical delegations; an absolute planner-call cap backstops everything.
- **Approval modes:** default **each round** — delegations land in Needs You + a toast with Approve/Reject, a rejection makes the lead re-plan; **auto** skips the gates (limits still apply). `ask_user` questions land in Needs You and the panel; waiting on you doesn't burn the mission clock.
- **Workdir safety:** with a target folder set, **two writers never run in parallel** — planner-marked `readonly` steps may share a wave, writers serialize.
- **Reload-proof:** a window reload parks running missions as paused; **Resume** (Needs You / panel) re-collects delegation states from the task records and continues in the same planner session.
- **Missions panel:** run list, round-by-round timeline (the lead's reasoning + delegation table with statuses/costs/output links + Q&A), budget bar, Pause/Resume/Cancel, inline Approve/Reject and answer box, and the New Mission form (goal, lead, team with role labels, workdir picker, limits, approval mode). Reachable from the Dashboard and the command palette.
- **Tests:** new `test_missions.js` (58) — decision parsing, wave planning, budget guards/finish-only, duplicate lock, ask_user, resume-fallback, cancel, hard cap, envelope parsing, store pruning, Needs items; new `test_missions_webview.js` (24) — list/detail/waits/controls/form round-trip. Full suite: 43 files · 951 passed.

## 2.61.0 — Agent folders: nests, excludes and a real management UI (2026-07-16)

Where agents live used to be a one-time setup question, a raw JSON array, and one hidden trap. All three fixed:

- **Nest rule in discovery.** A root folder whose subfolders are agents is now a **nest**: its own `CLAUDE.md` counts as shared instructions all its agents load (exactly how Claude Code treats parent `CLAUDE.md` files) — it no longer shows up as an agent itself. A root with no agent-like subfolders is still a single agent, unchanged. This makes the natural "constitution at the root" layout work with zero configuration.
- **Roots are deduped case/slash-insensitively.** The same folder spelled twice in `agentFarm.agentRoots` used to double-scan and silently decide *which* discovery branch ran — whether your child agents appeared at all could depend on a stray lowercase drive letter. Now duplicates are skipped, flagged on the settings page, and cleaned up in one click.
- **`agentFarm.excludeAgentDirs`** — folders that are never agents, however agent-like they look. An excluded folder leaves the farm everywhere: views, analytics, session ownership. Comparison is case- and slash-insensitive.
- **Farm Settings → Agent folders section.** Every root as a row with an honest badge (*nest · N agents*, *single agent*, *N agents*, *folder missing*, *duplicate entry*), its agents as chips — click a name to open the agent page, **Exclude**/**Include** to toggle a folder out of/into the farm (excluded ones stay visible, greyed, so the way back is one click), **+ Add root…** with a folder picker, **Remove** with a confirmation that states the impact, **Reveal** in the file explorer, and one-click cleanup for duplicate roots and stale exclude entries.
- **Tests:** new `test_agents_discovery.js` (18) — nest/single/plain kinds, duplicate-root regression (the old accident, now a rule), exclude insensitivity, missing-root fail-soft; the settings webview test grows an Agent folders block (badges, chip actions, filter). Full suite: 41 files · 876 passed.

## 2.60.0 — ⌂ to the owner agent + pick any agent combination in Search (2026-07-16)

- **⌂ \<agent\> in the Session Viewer.** A new button right next to *Open raw JSONL* names the session's **owner agent** and opens that agent's page in one click — no more working out whose session you're reading and hunting for its page. Ownership comes from the session index (cwd → agent), with the live monitor's resolver as fallback; sessions outside the agent roots have no owner and show no button.
- **Search: the agent filter is now a checkbox dropdown.** The old all-or-one select becomes `Agents: all ▾` — tick **any combination** (two agents, everything except one…), with **Select all / Clear** for bulk moves. Everything is ticked by default, so "all agents" needs no special mode and a newly added agent joins the scan automatically. The pick applies to transcripts, memory notes and live events alike; changing it re-runs the search; an all-unticked pick honestly returns nothing. Opening Search from an Agent Detail page pre-ticks just that agent, and widening the pick retires the stale agent pill. In semantic mode a single ticked agent narrows the query itself; other subsets filter its results.
- **Tests:** engine `agentNames` scope (transcripts/memory/events, empty-set honesty) + the picker webview (labels, subset payloads, preset round-trip) + the viewer's ⌂ button. Full suite: 40 files · 840 passed.

## 2.59.0 — One shared header on every page (2026-07-16)

2.58.x tried to fix toolbar chaos by re-sorting buttons page by page — treating the symptom. The disease was that **every page hand-rolled its own header**, so alignment, spacing, button presence and order all drifted. Cured structurally:

- **One shared header component** (`media/pageHeader.js`) now renders the top bar of **all eleven pages** (Dashboard, Live Timeline, Agent Detail, Session Viewer, Board, Needs You, Capability Matrix, Memory Graph, Media Gallery, Farm Settings, Search). Title + subtitle left; one right-aligned toolbar with two halves split by a thin divider: the page's own controls/actions on the left, and the **global cluster** on the right.
- **The global cluster is identical on every page** — *Dashboard · Live Timeline · (related panel) · ⌕ Search · ⚙ Settings · Refresh · ? Guide* — minus only the page you're on. That means pages that never had them get them now: Timeline gains Search/Settings, Agent Detail gains Settings/Refresh, Board/Needs/Capabilities/Memory Graph/Gallery gain full cross-navigation, Search gains navigation. ⌕ Search stays pre-scoped on Agent Detail (this agent) and the Session Viewer (this session).
- One shared `afnav` route on the extension side serves all panels — a future page gets the whole cluster with one line, and a new global button lands on every page at once.

## 2.58.0 — ⌨ reachable everywhere + one toolbar canon (2026-07-16)

- **⌨ on every session row, not just active ones.** A terminal window is often open while its session idles between turns — the Dashboard/Agent-Detail tables now carry the ⌨ jump-to-terminal button on **all** rows (the green ● alone marks activity). If no window is found, the honest message still applies.
- **⌨ in the sidebar trees.** Session rows in the Agents and Sessions views get a terminal icon on hover plus a **Focus Session Terminal** right-click entry — no need to open a panel first.
- **⌨ in the Needs You queue and the Board's Waiting column.** Permission-wait, stalled and your-turn items get a ⌨ Terminal action — the answer to a permission dialog lives in the terminal, so the unblock is now one click.
- **One toolbar order on every page.** The top-right button rows grew organically and each page had its own idea of ordering. Now a single canon applies everywhere, left to right: *page controls/actions → Refresh → cross-navigation (Dashboard → Live Timeline → …) → ⌕ Search → ⚙ Settings → ? Guide always rightmost.* Session Viewer and Board were reordered to match; the canon is documented in the guide and pinned as a comment at every toolbar for future buttons.

## 2.57.0 — One Sessions table everywhere + Ctx now (2026-07-16)

- **The Agent Detail page gets the Dashboard's advanced Sessions table — the exact same component.** The plain session list is gone; in its place: a **Sort by** selector (remembered per page), the **▸ turn accordion** with per-turn model/tokens/cost and click-to-jump into the transcript **at that turn**, **Expand all / Collapse all / Single-open**, tinted+accent-edged rows so expanded turns read as nested content, and a green **●** + **⌨ jump-to-terminal** on active rows. It shows the agent's top **50** per criterion (Dashboard shows 12), and the top-N-per-criterion pool guarantee applies on both pages. Extracted into a shared component (`media/sessionsTable.js`) rather than copied — one implementation, two pages, and it re-renders only its own block, so an open pricing editor on the agent page is never clobbered by a fold click.
- **"Ctx now" in every Sessions table — and it's a sort criterion.** A new column shows the approximate context in the model window after the session's last reply (input + cache + output of that request; — when the transcript didn't record it), on the Dashboard and the Agent Detail page alike. Sorting by **Ctx now** answers "which session is close to compact time?" in one click; the shipped row pool includes the true ctx champions, so the sort is honest fleet-wide. Dashboard rows also gained the Tools/Err columns the agent page already had — the two tables now share one column set.
- **Tests:** new `test_sessions_table.js` (26) — sorting incl. Ctx now, turn accordion round-trip, single-open/expand/collapse, ⌨ identity, state persistence + legacy fallback; the dashboard webview test now proves the page↔component integration. Full suite: 40 files · 821 passed.

## 2.56.0 — ⌨ finds the exact session terminal (2026-07-16)

- **Session-exact focus.** The ⌨ buttons (Session Viewer, Dashboard active rows, Timeline live cards) now land on **that session's own terminal**, not blindly on the agent's most recent one: every session launch (Start / Continue / Resume / external CLI) is registered, and the live monitor binds the session id reported by hooks back to the launching terminal via its cwd. Two concurrent sessions of one agent (`dev #1` / `dev #3` on the Timeline) each focus their own window now.
- **Unique terminal titles.** Session terminals are named `claude: <agent> #n` (persistent launch counter) — the integrated-terminal dropdown and external `wt` window titles are unambiguous, so title-based focus can't hit a sibling session. External sessions also open with `wt -w new`: a session is never a tab hiding behind another tab's title (only the active tab's title is the window title AppActivate can see).
- **Dashboard/Viewer "no open terminal found" fixed.** Sessions living outside the agent roots used to send a pseudo-name ("Other projects") or a cwd the resolver didn't recognize, so the ⌨ button gave up. The command now ignores pseudo-names, resolves the cwd with the same folder-basename fallback the live monitor uses, and when it only has a session id it asks the live monitor for the cwd.
- **Tests:** dashboard session rows carry `sessionId`/`cwd` for the ⌨ button (asserted in `test_dashboard_sessions.js`). Full suite: 39 files · 795 passed.

## 2.55.0 — Jump to the terminal + Claude Code's own settings (2026-07-16)

- **⌨ one click back to the session's terminal.** Wherever you're reading about a session — the Session Viewer's top bar, an active row in the Dashboard sessions table, a live-session card on the Timeline — a ⌨ button focuses that session's terminal so you never hunt for the window again. Integrated terminals are found by name; **external Windows Terminal windows are found by title**, which new sessions now pin at launch (`wt --title "claude: <agent>" --suppressApplicationTitle`). If nothing is found you get an honest message — sessions started before this version can't be located by title. Also available as the `Focus Session Terminal` command.
- **Claude Code's own settings, explained, on the Farm Settings page.** A new **Claude Code (claude CLI)** section edits `~/.claude/settings.json` — the file behind terminal tips like *"Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …"*. A curated catalog with real explanations: default model, permission default mode, co-authored-by, **transcript retention (`cleanupPeriodDays` — directly bounds how far back Agent Farm's search/analytics can see)**, output style, and the well-known env switches (PowerShell tool preview, thinking/output token caps, bash timeouts, auto-update/telemetry/non-essential-traffic opt-outs). Clearing a value **removes the key** so Claude's own default takes over — we never write a guessed default. Everything else (hooks, statusLine, permission lists) is reachable in a validated **raw JSON editor** underneath; broken JSON is rejected, never saved, and a one-time `.agentfarm-backup` copy of the original is kept next to the file.
- **Tests:** new `test_claudesettings.js` (31) — catalog model, patch-preserves-everything (incl. empty-parent pruning), per-kind coercion, raw validation, page rendering/routing. Full suite: 39 files · 793 passed.

## 2.54.0 — Farm Settings page + live search (2026-07-15)

- **Farm Settings — every setting on one page.** `Agent Farm: Farm Settings` (or **⚙ Settings** on the Dashboard) lists all 71 `agentFarm.*` settings grouped by area, with a filter box, per-setting descriptions and full-key/default tooltips. Booleans, enums, numbers and strings edit in place; lists/objects get a validated JSON editor (bad values are rejected inline, never written). Modified settings carry a marker and a one-click **↺ reset to default**. The page is **schema-driven** — a setting added in a future version shows up with zero extra code — and refreshes live when settings change elsewhere.
- **Setting sets.** Save the current non-default values as a named set, apply it back later (applying resets modified settings the set doesn't mention — a set is a complete state, with a confirmation stating exactly what changes), delete, and **export/import as JSON** for other machines.
- **Search re-runs on any control change.** Switching agent, chips, sources or regex/case no longer waits for the Search button — measured cheap (~1.4 s worst case on 95 MB) and race-safe: results of a superseded search are dropped (`seq` guard). Semantic mode still waits for Enter (each query is a paid embedding call).
- The search panel's "semantic mode is off" hint now links straight to the right setting on the Farm Settings page (deep-link focuses and flashes it).
- **Tests:** new `test_settingsops.js` (34) — category coverage against the real manifest, value sanitizing, profile snapshot/apply-plan/import, page rendering and edit routing. Full suite: 38 files · 762 passed.

## 2.53.0 — Search grows up: tool traffic, scopes, turn grouping, memory & events (2026-07-15)

The search architecture report (S1–S5) implemented in one go. Until now search saw only user prompts + assistant text — **about 10% of the text a fleet actually produces**. Measured on a real ~95 MB corpus:

- **Tool inputs and tool results are searchable (S1).** "Which session touched this file?" finally has an answer — file paths, commands, code and outputs live in tool traffic (~90% of all transcript text). The new **Search in** chip row picks what to scan: **Dialog** (default — same behavior as before), individual kinds, or **Everything**. A full everything-scan of 95 MB measures ~1.4 s; still no index needed.
- **Scopes (S2):** the engine takes a session-file set and a time window (a turn is a time window), and every hit is tagged with its **turn number and the turn's opening prompt**.
- **Search buttons where you are (S3):** Dashboard (fleet-wide), Agent Detail (that agent) and Session Viewer (that session) all carry **⌕ Search**; the panel opens pre-scoped with a pill, ✕ widens back to the fleet. A session-scoped search raises the per-file hit caps so nothing relevant is hidden.
- **Grouped results (S4):** hits are grouped per session with `Turn N — <prompt>` sub-headers; the group header opens the session, a hit opens it **at the exact message**. Tool hits show the tool name.
- **Two more sources (S5):** the agents' **memory notes** (`memory/*.md` — a hit opens the file) and **orphaned live events** — events whose transcript is gone (external CLIs, pruned sessions). Events still backed by a transcript are deliberately not duplicated. Both are on by default, each with its own tick.
- **Regex safety net:** a scan is cut after a 10 s time budget and the partial result says so — a catastrophic regex can no longer hang the search.
- **Tests:** new `test_search_scopes.js` (30) — roles/turns/scopes/budget/sources plus the grouped webview. Full suite: 37 files · 728 passed.

## 2.52.0 — Per-turn model, Dialog by default (2026-07-15)

- **Every turn shows which model served it.** The turn band, the Turn breakdown table, the dashboard's per-session turn list and the Markdown export now carry the model — because the model **changes mid-session in about 1 of 4 real sessions**, so a single per-session model line was hiding the truth.
- **Model names are read verbatim — no lookup tables, no maintenance.** Whatever the transcript says is what you see (the `claude-` prefix is trimmed for width). A model released tomorrow shows up on its own; only *pricing* needs a rule, and that has been user-editable since 2.47.0.
- **Effort/reasoning labels: the hook is in, the data isn't.** Claude Code records no effort field today (probed across 40 real transcripts: zero hits), so nothing is shown rather than something invented. If such a field starts being written, it appears automatically and its value is shown verbatim whatever it says.
- **Dialog is now the session viewer's default view** — you + the assistant, tool traffic one chip away. Note that Export MD still exports *what you see*, so tool traffic is out of the default export.
- **A jump can never be hidden by the filter.** Clicking a tool event in the timeline (or any deep link into filtered-out content) now clears the filter so the target is actually reachable — the same rule as the turn accordion auto-unfolding.
- **Tests:** new `test_viewer_model_dialog.js` (18). Full suite: 36 files · 698 passed.

## 2.51.0 — Dashboard turn rows jump into the transcript (2026-07-15)

- **Click a turn → the transcript opens at that turn.** The turn rows under an expanded session row are now click-through, just like the session row itself: the viewer scrolls to that turn's opening prompt and flashes it. If that session's viewer is **already open, it isn't opened again** — the existing tab is revealed and scrolled to the turn (the same mechanism the timeline, search and feed use). A folded turn band in the viewer unfolds itself on arrival.
- **Session rows are tinted and accent-edged**, so an expanded row's turn list reads as nested content instead of blending into the next session. The open row's accent edge and tint deepen.
- Under the hood the viewer's turn table now carries each turn's opening timestamp, which is what makes the deep link possible.
- **Tests:** `test_dashboard_sessions.js` 28 → 36 (turn-row jump carries the right timestamp and doesn't trigger the row underneath; end-to-end check that a real transcript parse exposes turn timestamps). Full suite: 35 files · 680 passed.

## 2.50.0 — One Sessions table: sortable, active-aware, with per-turn fold-outs (2026-07-15)

The dashboard's *Top sessions by cost* and *Recent sessions* tables (2.49.0) were the same table with different sorts — so they are now **one table** that does more:

- **Sort by selector.** Recent (default) · Cost · Tokens · Duration · Turns. Whichever criterion you pick, the genuine farm-wide top 12 is shown — the data pool is the union of each criterion's true top rows, not one list re-sorted. The choice is remembered.
- **Active sessions are marked.** A green ● in front of the agent name flags sessions with activity right now (same threshold as the agent cards).
- **Fold a session open into its turns.** The ▸ at the start of each row unfolds that session's turn list — every turn's title with its per-turn tokens and cost, parsed on demand from the transcript (and re-fetched automatically when a live session moves on). Clicking the row itself still opens the full transcript.
- **Accordion controls, same as the Session Viewer.** Expand all / Collapse all, plus a **Single-open** mode where unfolding one session folds the previous one; the mode persists.
- A **Turns column** joins the table (also sortable — "which sessions had the most back-and-forth?").
- **Tests:** `test_dashboard_sessions.js` (28) replaces the 2.49.0 table test. Full suite: 35 files · 672 passed.

## 2.49.0 — Recent sessions table on the Dashboard (2026-07-15)

- **Recent sessions.** Right below *Top sessions by cost* the dashboard now shows the same table sorted by last activity — the twelve sessions you touched most recently, newest first (sessions without a timestamp fall back to file mtime). Same columns, same click-to-open-transcript rows.
- **Tests:** new `test_dashboard_recent.js` (15) covers the ordering/cap/row shape and the rendered tables. Full suite: 35 files · 659 passed.

## 2.48.0 — Turn accordion in the Session Viewer (2026-07-15)

Long transcripts are now foldable per turn — the colored turn bands double as accordion headers.

- **Click a turn band to fold/unfold it.** A folded turn keeps only its highlighted band (with a ▸/▾ caret, its message count and the usual tokens/cost); the band's own controls — export checkbox, ↑ ↓ jump arrows — still work without toggling the fold.
- **Expand all / Collapse all.** A new `Turns:` control row sits above the message list. Collapse all reduces the whole session to its band list — a clickable table of contents — and you reopen just the turns you need.
- **Single-open mode.** The third button in the row switches the accordion to one-turn-at-a-time: expanding a turn folds the previously open one (and the view re-anchors on the turn you opened). Off by default — in the normal mode every turn you open stays open. The choice persists across tab switches and reopens.
- **Jumps unfold their target.** The turn-breakdown row click, the ↑ ↓ band arrows and the timeline / search / feed click-through all auto-unfold a folded target turn first, so a jump never lands on hidden content. Folding is display-only: filters, replay and Export MD are unaffected.
- **Fix:** the All / None / Invert export-selection buttons in the Turn breakdown box were also caught by the Show-filter chip handler, silently corrupting the role filter and blanking the message list until a Show chip was clicked again.
- **Tests:** new `test_viewer_accordion.js` (26). Full suite: 34 files · 644 passed.

## 2.47.0 — Editable model rates that don't rewrite the past (2026-07-13)

Cost has always been the token count times the per-model `agentFarm.pricing` rate — but that rate was applied *live*, so editing it silently re-priced every past session too. Now a rate change is dated and only bites going forward.

- **Edit rates on the agent page.** The Agent Detail page has a new **Model pricing** editor — the global rules in USD per 1M tokens (input / output / cache-write / cache-read), with add/remove per model and a live "seen here with no rule" hint. No more hand-editing JSON. Saving writes the `agentFarm.pricing` setting (still hand-editable, and remembered across restarts).
- **Past costs stay frozen.** Every rate change is appended to a dated history (`agentfarm.pricingHistory` in globalState) and `costFor(model, usage, ts)` prices each message at the rate in effect at its timestamp. So changing a price only affects sessions from that moment on; sessions already recorded keep the rate they were billed at — even a session spanning the change is split correctly per message.
- **Consistent across surfaces.** The claude session index, the transcript viewer and codex sessions all pass the message/session time, so the same session shows the same frozen cost wherever you look. A plain rule set (`new PricingEngine(rules)`) still behaves exactly as before — the timestamp is optional.
- **Tests:** new `test_pricing_history.js` (19) covers the freeze semantics and end-to-end pricing through `parseSessionFile`. Full suite: 33 files · 618 passed.

## 2.46.0 — Bilingual guide: English by default, Türkçe selectable (2026-07-12)

The in-app help — the surfaces a user actually opens — is now bilingual, English first. The UI was already English-only; this brings the *help documents* the guide renders into the same default while keeping Turkish one click away, and leaves room for more languages.

- **Guide, Quick Start and Examples are bilingual.** New `docs/BLUEPRINT.en.md` and `docs/ORNEKLER.en.md` are full English translations of the Turkish originals. The guide resolves the doc by language (`BLUEPRINT.<lang>.md`, falling back to Turkish if a translation is missing), so `Open Guide` / `Quick Start` / `Open Examples` all follow the chosen language.
- **New setting `agentFarm.guideLanguage`** (`en` / `tr`, default `en`) plus an **EN | TR toggle inside the guide panel** — clicking it persists the choice globally and re-renders in place. Adding a language later is: author `BLUEPRINT.<lang>.md`, extend the doc registry + the setting enum.
- **Stable deep-link anchors across languages.** `renderMarkdown` now supports an explicit `{#id}` on a heading. The ~27 tokens the code deep-links to (health insight `guideAnchor`s, panel `openGuide` calls, `quickStart`) are pinned in the English doc with `{#token}`; the Turkish original is untouched and keeps resolving them by natural slug. New regression test `test_guide_anchors.js` guards the contract (32 files · 599 passed).
- **Getting-started walkthrough is English by default.** The five walkthrough pages are wired to `.en.md` in `package.json` (VS Code walkthrough media is static, so it can't switch per user); the Turkish originals are preserved untouched as `*.tr.md` siblings.
- **The Turkish documents are untouched** — English versions are added alongside, never in place. Dev-internal docs that a user doesn't reach in normal use (Development Plan, Ultra Roadmap, media roadmap, handoff) stay Turkish-only.

## 2.45.0 — One agent, many sessions: the timeline is now multi-session aware (2026-07-12)

Opening the same agent in two sessions at once used to half-work: the Live-sessions list showed two cards, but the swim lanes merged everything into one row and the turn-ready alert toggles applied to both sessions as one. Fixed end to end:

- **Swim lanes: one row per concurrent session.** An agent's sessions are packed into tracks — overlapping sessions get their own rows (`dev #1`, `dev #2`), sequential ones still share a row, so lane count doesn't balloon. Marks and tool segments land in the row of the session that produced them.
- **Turn-ready alerts: agent default + per-session override.** The swim-lane toggles (♪ ◎ ▣ ▭) remain the persistent *agent default* and are now drawn once per agent. Each Live-sessions card's chips edit *that session only* — turning everything off mutes one session while the default keeps working for the others; a "session override — reset" link returns to the default. Overrides are stored per session id and cleaned up automatically when sessions go away.
- **Alerts fire per session**: the alert cooldown is keyed by session (two sessions finishing near-simultaneously both alert), and notifications, the modal ("Your turn: dev #2"), toast, permission/stalled warnings and the Needs You queue all use the disambiguated `#k` label.
- **Session cards** show the session's start time and the `#k` label in the title, so two cards of the same agent are tellable apart.
- **Agents tree** shows `×n` next to the live status when an agent has several tracked sessions.

## 2.44.0 — UI language sweep: English only (2026-07-12)

The interface had Turkish leaking into an otherwise English UI (most visibly the swim-lane turn-ready toggle tooltips and the hint line above them). A full sweep fixed every surface:

- Timeline: toggle labels/tooltips/hint line, "alert on your turn" chips; Kanban command-bar placeholder; Memory Graph card notes; selection panel title; A/B experiment flow; command bar plan preview (day names included); eval scorecard; instruction-history delta labels; duty-template picker; media/approval/select/webhook wizard defaults and `örn.` placeholders; walkthrough step titles/descriptions (the Welcome-tab chrome); a few command titles that carried Turkish parentheticals.
- **The language rule is now explicit**: UI = English only. Turkish remains everywhere it belongs — prompts sent to (Turkish-speaking) agents and judge models, generated Turkish documents (digest, forecast, A/B report, memory-contradiction report, DUTIES.md template) and ALL documents including the guide, docs/ and the five walkthrough pages.

## 2.43.0 — Cross-navigation + 16h/24h swim lanes (2026-07-12)

- **One-click switching between the three main surfaces**: the Agent Detail page gains **Dashboard** and **Live Timeline** buttons, and the Live Timeline gains a **Dashboard** button (the Dashboard already had Live Timeline) — the triangle is fully connected.
- **Timeline: 16h option + classic swim lanes up to 24h.** The window picker now reads 15m / 1h / 4h / 8h / **16h** / 24h / 3d / 7d / 30d, and 16h/24h render as the normal event-flow swim lanes instead of jumping to density bars — the live monitor keeps 24h in memory, so bars are only needed from 3d up.

## 2.42.0 — Loop-closing sweep: no more dead ends (2026-07-12)

A user-flow pass over every surface, hunting places where the extension shows something but offers no way to act on it (the Insights pattern):

- **Interrupted workflow runs are now a Needs You row**, not just a startup toast: **Resume / Dismiss** buttons inline, counted in the status-bar badge until decided. Missing the toast no longer costs you the run (dismiss can now target a single run).
- **Live Feed clicks jump to the exact event** — same click-through mechanism as the timeline and search. The Live-session card's *Open transcript* button now lands on the **latest activity** instead of the top of the file.
- **Edit Schedule…** (right-click a schedule): title, prompt, time and weekday edited in place — changing a time used to mean delete + recreate (triggers already had this; schedules now match).
- **Unknown-model pricing warning is clickable** — opens Settings filtered to `agentFarm.pricing` instead of naming the setting and leaving you to find it.
- **Empty forecast now says what to do** — points at Add Scheduled Task / Set Up Example Automation instead of ending at "no scheduled runs".

## 2.41.0 — Insights become actionable: fix, delegate, dismiss, auto-delegate (2026-07-12)

Insights used to be a read-only list — click opened a guide section and rows (like a cost anomaly) lingered forever. Every finding now has a closing path:

- **🛠 Fix (inline)**: categories with existing mechanical machinery get a one-click fix — memory-index repair, duplicate-memory merge, stale/large-memory distillation, antigravity sync, plaintext-key → vault, pulse re-run.
- **🚀 Delegate to Agent**: one click turns a finding (or a multi-selected batch via the view-title button) into a headless task with a well-formed work order — findings numbered, "read first, fix only what is safe, report what you did / couldn't do" rules included. Each finding goes to **its own agent** (one task per agent); fleet-level findings ask for an agent once.
- **✕ Dismiss**: hide a finding for a day / a week / forever. Hidden ones are counted honestly ("n dismissed insight(s) hidden" row → restore picker; also `Restore Dismissed Insights…`). Identity is anchored on agent+category+file, so a cost anomaly stays dismissed even when its numbers change; dismissal filters everywhere (tree, dashboard counts).
- **Smarter clicks**: cost-anomaly / trend / budget / error-rate findings now open the agent's own cost view instead of a guide paragraph — the evidence is there.
- **Opt-in auto-delegation** (`agentFarm.insightAutoDelegate`, default off): listed categories are delegated to their own agent automatically when they appear — warnings/errors only, max one task per problem per 24h, runner-window only, each delegation announced.

## 2.40.0 — Task token costs + jump-to-match + gallery feedback (2026-07-11)

- **Finished headless tasks now show what they cost.** The task's `claude -p` transcript is matched by lifespan in the session index and its priced token cost lands on the task row (`done • $0.12`), in the tooltip (with the source transcript) and in the daily digest's outcome line. Honesty rule: if a second session ran in the same agent folder at the same time, no figure is guessed — the task simply stays uncosted. Terminal-mode tasks are never matched.
- **Transcript search results jump to the exact message**: clicking a hit opens the session viewer scrolled to (and flashing) the matched message — same mechanism as the timeline click-through from 2.37.0.
- **Gallery: Feedback… button** (the last open wave-B item): write what was wrong — the critique is injected into the prompt (same mechanism as the vision-QA retry) and the asset regenerates.

## 2.39.0 — Activation wave: Farm Status card, one-click examples, walkthrough (2026-07-11)

A deep review found the biggest gap wasn't missing features but dormant ones — this release is about waking the factory up:

- **Farm Status card on the Dashboard**: nine honest per-subsystem rows (live monitoring, tasks & schedules, triggers, workflows, media pipeline, external CLIs, asset ingest, smart oversight, secret vault) — green = in real use, blue = configured but idle, gray = never used. Every dormant row carries **one wake-up button** (set up an example, add an API key, open the right setting or guide section). The card opens expanded while something is dormant and collapses to one line once everything hums. The external-CLI row doubles as adapter health: profiles configured but zero sessions seen hints at a format drift (adapters are fail-soft by design).
- **`Agent Farm: Set Up Example Automation…`** — one click creates a real, editable definition: 📥 inbox duty (watch trigger + classify task), 🌅 morning briefing (daily 09:00 schedule) or 🔗 two-agent chain (analyze → `{prev_text}` → summarize workflow, with a Run Now offer). Reachable from the palette, the empty Tasks view, the Farm Status card and the walkthrough.
- **Getting-started walkthrough** (VS Code Welcome → Walkthroughs): five steps from adding agent roots to the first automation, in Turkish, with a media page per step.

## 2.38.0 — Multi-window task safety + test suite in-repo (2026-07-11)

- **Only one window runs the task queue now.** Windows race for a lease file (`tasks.owner`); the winner runs the pump/scheduler, the others become read-only followers — a lock-badged row in the Tasks view says so, the list live-mirrors the runner's state, and blocked edits warn instead of silently clobbering. When the runner window closes, a follower takes over automatically within ~20s (running its own stale-detection + resume offer + media reattach). This closes the known B11 limit: two windows could double-launch scheduled work and cancel each other's live rows.
- **The full test suite (26 files, 469 checks) now lives in the repo** under `test/` with an aggregating runner — `npm test` compiles and runs everything. Previously the suite lived in session-temp folders and could be lost to a temp cleanup.

## 2.37.0 — Timeline click-through + filter clear button (2026-07-11)

- **Clicking the timeline now lands you on the exact moment.** Any mark on a swim lane (prompt dot, permission diamond, turn-end tick, …) — and now also the green tool-run blocks — opens the Session Viewer scrolled to the message nearest that event, with a brief highlight frame. If the viewer is already open it is revealed and jumped to the spot. Previously a click just opened the session at the top.
- **Session Viewer filter box has a ✕ clear button**: appears while the box is non-empty; one click clears the filter and refocuses the input.

## 2.36.0 — Bug-scan fixes: codex hook wiring, honest costs, parallel reattach (2026-07-11)

Fixes from a logic-trace bug scan of the workflow + multi-CLI systems:

- **Codex notify wiring actually works now (B1)**: codex passes its notify payload as the *last command-line argument*, not stdin (verified against openai/codex's own test). `cliHook.js` now auto-detects a trailing JSON argument — `notify = ["node", "<path>\\cliHook.js"]` just works; `--json` (stdin) and explicit `--event` args still supported. Flag values that merely look like JSON are not mistaken for the payload.
- **Codex costs include reasoning tokens (B3)**: `reasoning_output_tokens` are disjoint from `output_tokens` in the rollout and are billed as output — they are now added to the output side of the usage.
- **Reattached parallel branches no longer derail the run (B2)**: after a reload, a reattached media job belonging to a *parallel group* used to advance the chain as if sequential — skipping the fan-in merge or re-fanning the group into duplicate renders. Such branches now complete without advancing; the run is paused and offered for resume when the last reattaching branch finishes (resume re-runs the group — its fan-in state died with the window, stated honestly in the prompt). The startup resume offer defers these runs instead of racing them.
- **Smaller fixes**: vision-verify retries after a reload rebuild the `{prev_*}` handoff from disk instead of regenerating with empty context (B4); an unwritable archive can no longer leave a media task stuck "running" (B8); gemini sessions with `lastUpdated` but no per-message timestamps get their real recency (B6); an agent-assigned live lane is no longer suppressed by an unassigned transcript (B7); resuming a run whose cancelled task was archived away now works from stored coordinates (B9); gemini project-hash matching covers drive-letter case variants (B10); external CLI transcripts refresh on a quiet 60s interval, so sessions run outside farm terminals appear without a reload (B5).

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
