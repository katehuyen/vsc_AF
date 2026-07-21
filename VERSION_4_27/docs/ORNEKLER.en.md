# Agent Farm — Example Usages

> This document is a set of scenarios for using Agent Farm **not as an information screen but as a system that gets work done**. Each scenario is written step by step so that someone with no prior knowledge can follow it. Scenarios marked ✅ were verified with **real runs** on the `deneme` (practice) agent (13 haiku sessions, total cost $0.17). Open it any time from the command palette with `Agent Farm: Open Examples`.

## Before You Start: The Practice Agent

There is a practice agent named **`deneme`** in the agent root (set up during testing). Inside it:

- `CLAUDE.md` — a mini identity + a DUTIES.md directive
- `DUTIES.md` — an "Inbox triage" duty is set up
- `inbox/` and `arsiv/` folders — the duty practice ground
- `.claude/settings.local.json` — the model pinned to **haiku** (practice runs cheaply)

You can apply the scenarios below on `deneme` first and then move them to your real agents. When you're done, just delete the folder — the panel updates itself.

---

## S1 — Inbox Duty: "Triage whatever lands in the folder" ✅

**Goal:** The agent processes by itself every file you drop into a folder (your FAST_NOTE flow).

**Steps:**

1. In the Agents tree, expand the agent → right-click the **Duties** row → **Add Standing Duty**.
2. Title: `Inbox triage` → cadence: **every-turn** → pick the folder with **Pick a folder to watch…** (e.g. `01_INBOX\00_FAST_NOTE`).
3. Do line: `Treat every file in the folder as an inbox entry: give it a proper name, move it to the proper folder.`
4. If the extension asks "CLAUDE.md does not mention DUTIES.md", say **Append to CLAUDE.md** — without this the agent won't look at the duty.
5. **Try it:** drop a file into the watched folder. Within a few seconds, an orange eye + **"1 waiting"** appears on the Duties row (also `👁 1 pending` on the Dashboard agent card).
6. Run the agent: right-click the agent → **Start Claude Session** (when the session opens the agent looks at the inbox per DUTIES.md) — or without opening a session, one shot: Tasks → **+** → prompt: `Read your DUTIES.md and apply your every-turn duties now` → **Headless**.
7. **Verify:** the file is moved to the target folder, the Duties badge becomes **"empty"**, and `read Xs ago` appears in the Duties header (proof the agent looked at the duty).

> ✅ Test: on the `deneme` agent, the `inbox/not-2026.md` file was read by haiku and moved to `arsiv/`; the badge went "1 waiting" → "empty"; the compliance signal (`read …`) dropped.

---

## S2 — Clarification Loop: A written question-answer line with the agent ✅

**Goal:** The agent writes what's on its mind to a file; you answer when you're free; when the agent sees the answer it does what's needed and deletes the question.

**Steps:**

1. Create a `CLARIFICATION REQUESTS.md` file in the vault root (it can be empty).
2. Add a duty to the agent's Duties section: cadence **every-turn**, Watch = this file, Do: `If there's an answered question, do what's needed and delete that question from the file. If there are new questions to be clarified, add them to the file as "- Question: ...".`
3. If the agent's CLAUDE.md directive was added, the loop is ready.
4. **Usage rhythm:** when you see **"changed 2h ago"** on the Duties row it can mean two things: the agent wrote a new question (open the file, answer) or your answer hasn't been processed yet (wait for the agent's next turn).
5. After you write an answer, on the agent's first turn: what's needed is done + the question is deleted → the file gets cleaner.

**Tip:** If this file is shared with several agents, add the same duty to each; add to the Do line to have whoever asked prefix the question with its name.

> ✅ Test: an answered question was placed in `deneme/NETLESTIRME.md` ("Answer: No, keep the file names as they are"); on the duty turn haiku deleted the answered line from the file and didn't touch the unanswered content; the "changed …" signal worked correctly.

---

## S3 — Bind Routine Automation to a Cheap Model ✅

**Goal:** Daily mechanical jobs (triage, summary, check) shouldn't run on an expensive model.

**Steps:**

1. Settings (`Ctrl+,`) → search "agent farm" → **Task Extra Args** → type `--model haiku`. Now **all task and workflow commands** run with haiku (it doesn't touch the model of interactive sessions — only Tasks/Workflows).
2. Alternative (per agent): add `"model": "claude-haiku-4-5-20251001"` to the agent's `.claude/settings.local.json` — everything that agent does becomes haiku.
3. Tasks → calendar icon → **Add Scheduled Task**: Daily 08:30, prompt: `triage the inbox and write a single-paragraph morning summary`, mode: **Headless**.
4. Next morning: the task runs by itself; right-click → **Open Task Output** to read the output. See the cost in the Dashboard — pennies with haiku.

> ✅ Test: headless tasks ran with `--model haiku`; the total of 4 real runs was $0.06, outputs were archived, exit codes handled correctly.

---

## S4 — A Two-Agent Morning Routine: Handoff Chain ✅

**Goal:** the psychologist analyzes, the assistant uses that analysis to make a plan — hand to hand.

**Steps:**

1. Click the chain icon on the Tasks header (**New Multi-Agent Workflow…**), name: `Morning routine`.
2. **Step 1:** agent `psychologist`, title `analyze`, prompt: `Analyze yesterday's journal entries; write the mood and important topics as bullet points.`, mode **Headless** (required for output handoff in the chain), on-fail: Stop.
3. **Step 2:** agent `assistant`, title `plan`, prompt: `The psychologist's analysis is in this file: {prev_output} — read the file and produce today's plan based on it.`, mode **Headless**.
4. **Finish workflow** → "Run now".
5. **Watch:** `Open Live Timeline` → in the **Workflow runs** strip, step 1 is blue (running) → green, then step 2 starts. When done, a "workflow completed ✓" notification.
6. Outputs: right-click on each step in Tasks → **Open Task Output**.
7. If you want it every morning automatically: trigger this chain not by hand but from the scheduled task in S3 — the cleanest, rather than making the prompt `Think of the Morning routine workflow and...`, is to turn the chain into a morning task: put step 1's prompt in the scheduled task and leave the handoff to the workflow.

> ✅ Test: the two-step chain really ran; step 2 actually read step 1's output file via `{prev_output}` and used its content; the completion notification dropped.

---

## S5 — Conditional Alarm Chain: "Intervene only if necessary" ✅

**Goal:** if the word alarm appears in the analysis, run the urgent-plan step; otherwise skip it.

**Steps:**

1. Set up the chain from S4; when adding **Step 2**, answer the "run only if previous output matches" question with `ALARM` (also add an instruction to step 1's prompt: "if there's a critical situation, use the word ALARM").
2. Or on an installed chain: the pencil icon on the step → **Edit Step…** → **Run-if condition** → `ALARM`.
3. When adding step 3 (a job that should run in all cases, like archiving), answer the on-fail question with **Continue** — the archive runs even if the previous step was skipped/failed.
4. **Verify:** run it with no alarm → you'll see "step 2 skipped (condition not met)" in the notification; the chain continues from step 3.

> ✅ Test (both branches real): on a "Situation normal" output step 2 was skipped; on an "ALARM: disk space critical" output step 2 ran and haiku wrote a real intervention plan ("delete the temp directory and old logs…"). This test also caught a bug: the condition used to also look at the workflow name in the archive header (the name "Alarm check" triggered the condition) — fixed in 0.7.2, the condition now only looks at the model's output.

---

## S6 — Context Diet: Make the Agent Cheaper (Optimization) ✅

**Goal:** shrink the fixed context that's loaded automatically every session and get a permanent saving.

**Steps:**

1. **Measure:** the Agent Detail page → the **Fixed context load** card. If the bar exceeds the budget (or there's a `context-load` warning in Insights) it's diet time. The card has the CLAUDE.md / MEMORY.md / AGENTS.md breakdown — see which one is fat.
2. **Move:** open CLAUDE.md (the Identity row in the Agents tree). Keep the identity and working style; move **detail info and rarely-needed instructions** into separate files under `memory/`, and add a one-line summary to the MEMORY.md index. Memory files are only read when needed — they don't enter the fixed cost.
3. **Check:** so a `memory-index` finding doesn't appear in Insights, link every file you moved into MEMORY.md (an orphan file = the agent won't recall it).
4. **Re-measure:** Refresh on the Agents header → see the token count drop on the detail page.
5. **Compute the gain:** the drop × the number of daily sessions = daily token savings. Cutting 2,000 tokens with 10 sessions a day is 20k tokens/day.

> ✅ Test: a 2,662-token section was added to `deneme`'s CLAUDE.md (65→2,727), the budget warning was verified; when the section was moved to a memory file and indexed the load dropped back to 83 tokens, the warning cleared, and no orphan-file finding appeared.

---

## S7 — Fix Duplicate Memories: Diff → Merge → Sync ✅

**Goal:** bring the same file's copies — scattered across agents and drifted apart — down to a single truth (example: `agent_setup.md`).

**Steps:**

1. Command palette → **Agent Farm: Sync Shared Memory…** — the groups are listed: ✓ identical, ⚠ diverged.
2. Pick the diverged group → **Compare two copies** → the two agents' copies in the diff screen; understand what the difference is.
3. Decide:
   - If one copy is clearly correct: run the command again → **Sync all copies from one source** → pick the source (the newest is marked) → **Sync**. An `.afbak` backup is left next to each overwritten file.
   - If both copies have valuable lines: **Create merge draft** → in the opened draft, merge the final text by hand from the `=== FROM ... ===` blocks → command palette → **Agent Farm: Apply Merged Memory** → confirm.
4. **Verify:** the `duplicate-memory` warning in Insights drops to "duplicated identically" (info) level.

> ✅ Test: with a temporary second agent (deneme2) on real files: divergence detection, newest-source suggestion, backed-up sync (v1 preserved in backup), the merge draft containing both variants, the merged v3 being written to both copies with a backup — all verified; the test agent was deleted afterward.

---

## S8 — Budget and Trend Discipline ✅

**Goal:** manage cost by thresholds, not surprises.

**Steps:**

1. Settings → `agentFarm.budgets` → **Edit in settings.json** → e.g.:
```
"agentFarm.budgets": { "psychologist": 20, "general": 10, "*": 40 }
```
2. Behavior: ⚠ in Insights at 80%, ⛔ + a once-a-day notification on overrun; a fill bar on agent cards in the Dashboard, a fleet bar on the "Cost today" card.
3. The trend side is on by itself: if an agent's weekly cost rises to 2× the previous week you'll see a `trend` warning in Insights (configured with `trendAlertFactor`, 0 = off).
4. **Monthly routine:** Dashboard → Agent comparison → look at the **Cache eff.** column. 90%+ is good; if it's low, that agent's sessions are short and the context is constantly rewritten — think about combining jobs.

> ✅ Test: `deneme`'s **real** daily cost ($0.06) was tested against a $0.01 budget → a ⛔ error finding was produced; no warning appeared while the fleet budget wasn't exceeded; a single day of real data produced no trend false positive.

---

## S9 — A Morning Task While VS Code Is Closed (Windows) ✅

**Goal:** the 08:30 task runs even when the computer is on but VS Code is closed.

**Steps:**

1. First set up the task as a normal scheduled task (S3 step 3).
2. Tasks → under Scheduled, right-click the task → **Export as Windows Scheduled Task…**
3. Notification: the script was written, the `schtasks /Create ...` command was copied to the clipboard. Open a terminal (`` Ctrl+` ``), paste, Enter. You should see "SUCCESS" in the output.
4. **Verify:** `schtasks /Query /TN "AgentFarm\<task name>"` — the record is listed. Outputs accumulate in the log file in the **Open log folder** folder from the notification.
5. If you want to remove it: `schtasks /Delete /TN "AgentFarm\<task name>" /F`.

**Note:** the `claude` command must be on PATH (check by typing `claude --version` in a terminal).

> ✅ Test: the real registration loop was run with the format the extension produces — `schtasks /Create` (both DAILY and ONCE) returned SUCCESS, `/Query` saw the record, `/Delete` cleaned it up. The date format is fine on this system.

---

## S10 — Automatic Scorecard to the Vault ✅

**Goal:** the weekly fleet report + the outputs of overnight jobs drop into Obsidian without you lifting a finger.

**Steps:**

1. Settings → `agentFarm.autoReportFolder` → a folder path inside the vault (e.g. `D:\zone\know\note\obsidian\20_PROGRESS\agent-scorecards`).
2. `agentFarm.autoReport` → `weekly` (or `daily`).
3. That's all. The extension checks hourly; if the period's report doesn't exist it produces it (`AgentFarm-Report-2026-W28.md`) and notifies you. If there's headless task output within the period, a **Task outputs** section is added to the report.
4. When you open the folder in Obsidian, the comparison table, model usage, health findings and job outputs are all in one note.

> ✅ Test: with real fleet data + real task outputs, the report was produced and written to the target folder; the comparison table, the "Task outputs" section (with real chain outputs) and health findings were verified.

---

## S11 — Catch a Stalled Agent and Intervene ✅

**Goal:** if an agent silently stops during a long job, know within minutes.

**Prerequisite:** live observation set up (**Install Live Hooks** + having restarted the sessions).

**Steps:**

1. Normally you do nothing — when an agent drops to a permission approval a `⚠ waiting for permission` notification arrives, and when no event is produced for 4 minutes a `looks stalled` notification arrives by itself; the status bar turns yellow.
2. The **Open Timeline** in the notification → look at the stalled agent's strip: what was the last event, which tool did it stop on (`STALLED` + the last tool name on the card).
3. Intervene: if it's waiting for permission, switch to its terminal and approve/reject; if it's really frozen, cancel the task from Tasks (`Cancel Task` ends the process safely) or close the terminal, then continue where it left off with **Continue Latest Session**.
4. If the same agent stalls often, look at the `error-rate` finding in Insights — usually there's a broken tool script or a missing permission.

> ✅ Test (infrastructure): the hooks were installed on the `deneme` agent, a **real** claude session's hook events (session start → prompt → stop → end) flowed live to the listener, the agent was resolved correctly, and the model setting was verified preserved after removal. The permission/stall state transitions were separately tested with synthetic events (Phase 2).

---

## S12 — Inbox Factory: No Touch, It Starts Itself ✅

**Goal:** the full automation of S1 — without even waiting for an agent session, the moment a file lands in the folder the triage chain runs and a judge verifies the result.

**Steps:**

1. First set up the chain (Tasks → New Multi-Agent Workflow): a single step is enough — agent `deneme`, prompt: `Read your DUTIES.md and apply the Inbox triage duty now. At the end, report what you moved where.`, mode **Headless**, verification criterion: `The output must clearly report that a file in the inbox was moved to the arsiv folder.`
2. Set up the trigger: Tasks header **⋯** → **Add Trigger** → name `Inbox factory` → **Watch a folder** → pick the inbox folder → **Run a workflow** → pick the chain.
3. In the Triggers section, verify your ⚡ row shows "armed".
4. **The moment:** drop a file into the watched folder. After ~10s (debounce) a notification drops: "trigger fired → workflow". The task runs, the judge PASSes the output, the chain completes.
5. **Verify:** the file is in the target folder, `verify pass` on the task row, the judge's verdict at the end of the output, `fired 1×` on the trigger row.

Guards: if you drop 10 files in a row the debounce collapses them into a single fire; no new fire within 60s (cooldown); at most 6 fires an hour. If the quota guard is on (S8), the factory waits politely while the window is full.

> ✅ Test (exit criterion): a real file dropped into `deneme/inbox` fired the trigger, haiku moved the file to the archive, the judge (haiku) wrote the verdict "PASS — clearly states the file name, source and target folders" into the archive, the chain completed — with no human touch.

## S13 — Field-Level Handoff: A JSON-Contract Chain ✅

**Goal:** bind the handoff between steps to structured fields, not text coincidences.

**Steps:**

1. Set up a chain: **Step 1** (headless, output contract: **JSON**): `Write valid JSON with these fields: status (ALARM/normal), level (1-5), summary.` **Step 2** (headless, run-if: `json:status~ALARM`): `Level {prev_json.level} alarm: {prev_json.summary}. Write a one-sentence intervention plan.`
2. Run: if status=ALARM, step 2's prompt gets real values embedded ("Level 3 alarm: disk space critical…"); if status=normal, the step is skipped.
3. Even if the model wraps the JSON in a code fence, the parser tolerates it — you just write the field names correctly.

> ✅ Test (both branches with real haiku): the fields were embedded into the prompt correctly, the ALARM branch ran, a plan was produced; fenced-JSON tolerance was verified with real output.

## S14 — The n8n Bridge: A Two-Way Line to the Outside World ✅ (mechanics)

**Goal:** external events (mail, Telegram, calendar…) trigger the agent factory; the factory delivers results to the outside world. n8n is the example — the same logic applies identically in Make/Zapier.

**Prep:** if you have API keys, put them in the vault first: `Agent Farm: Set Secret…` (e.g. name `N8N_TOKEN`). Don't write keys into config files — the panel already warns.

**Inbound line (n8n → Agent Farm):**

1. Tasks → **Add Trigger** → give a name → **Webhook** → choose a task as the action, example prompt: `Process this request: {payload}` → the secret URL is copied to the clipboard (`http://127.0.0.1:8377/trigger/…`).
2. Set up a flow in n8n: (trigger: Gmail/Telegram/whatever) → an **HTTP Request** node: POST, URL = the address you copied, body JSON (e.g. `{"job":"process invoice","from":"…"}`).
3. If n8n is on the same machine it works directly; if it's on another machine you deliberately need to set up a tunnel/proxy (the endpoint listens only on 127.0.0.1 for security).
4. **Try it:** trigger the n8n flow by hand → an Agent Farm notification drops, the task runs, `{payload}` is in the prompt.

**Outbound line (Agent Farm → n8n → Telegram):**

1. Set up a flow with a **Webhook** node in n8n (attach a Telegram/Slack/mail node behind it), get the webhook address.
2. Two uses:
   - **As a chain step:** when building a workflow, **🌐 Webhook step** → URL = the n8n address → body: `{"text":"{prev_text}"}` — the previous agent step's output goes to Telegram; n8n's response can also be used in the next step with `{prev_json.field}`.
   - **As notification forwarding:** Settings → `agentFarm.notifyWebhookUrl` = the n8n address → permission-wait/stall/budget/chain events flow as JSON; n8n turns them into a message. Now "psychologist waiting for permission" is on your phone.

> ✅ Test (with real HTTP mechanics): a POST with the correct token to the /trigger endpoint → the task fired and `{payload}` entered the prompt; a wrong token got a 404. Webhook step: `{secret:}` in the URL, `{prev_json.*}` in the body were resolved, the server response handed off to the next step (3/3 steps done). A permission event arrived as JSON via the forward channel. The n8n side is a recipe — when you connect your own flow, the line is ready.

## S15 — Content Factory: Text → Image → Video ✅ (pipeline; real production awaits credit)

**Goal:** the agent writes the text, media models produce the image and the video — a single chain, with a gallery and a scorecard.

**One-time setup (key):**

1. Get your API key from your [fal.ai](https://fal.ai) account (Keys section) and load credit into your account (Billing).
2. `Ctrl+Shift+P` → **Agent Farm: Set Secret…** → name: `FAL_KEY` → paste the value. That's it — the key is in the OS keychain, in no file. (Detail: Guide → Secret Vault → "How to Add an API Key".)

**Chain setup (the easy way — a recipe):**

1. Tasks header **⋯** → **New Recipe Workflow…** → **Text → Image → Video** → pick the agent (e.g. `general`).
2. In the installed chain under Workflows, hit the pencil icon on step 1 → Prompt → replace the `PUT THE TOPIC HERE` part with your real topic (e.g. "a motivating short video about the morning routine").
3. Update the video step's model if you like (Edit Step → Media model) — check the current model names on fal.ai/models.
4. ▶ **Run Workflow**: the agent writes the English cinematic prompt → produces the Flux cover image → produces the Kling short video. The video step can take minutes; you watch its run in the Timeline.
5. **Result:** the 📷 icon in the Tasks header → **Media Gallery** — the image and video with previews, model + input + estimated cost. Don't like it? **Vary…** to edit the prompt and regenerate. The **Media cost** card in the Dashboard shows the spending.

**Common snags:** a "Set Secret" error = FAL_KEY not entered; "Exhausted balance" in the archive = no credit in the fal account; a model-name error = get the current id from fal.ai/models.

> ✅ Test: the whole pipeline was verified end to end with a fake fal server (agent prompt → production → image download → gallery/cost → the video handing off to the next step). On real fal.ai, authentication and the error path were tested with your key: it recognized the API key, rejected the credit-less account with "Exhausted balance", and that error was written into the archive cleanly. The day you load credit, this scenario makes its first real run.

## S16 — Smart Oversight: Quality Scorecard, Instruction Suggestion, Search ✅ (mechanics)

**Goal:** put quality next to cost, turn a mistake the agent repeats into a rule, find an old conversation in a second.

**Quality scorecard (part of your weekly rhythm):**

1. `Ctrl+Shift+P` → **Agent Farm: Sample Output Quality Now** — a cheap-model judge scores 2 new sessions per agent 1-5 (a few seconds/session).
2. Dashboard → the **Quality** column in the **Agent comparison** table: the 14-day average. The same column appears in the fleet report.
3. If you want to keep watching: `agentFarm.qualitySample` = `weekly`. If the score starts dropping a `quality` warning appears in Insights — if cost is cheap but the scorecard is broken, the automation is a loss.

**Instruction suggestion (let the agent improve itself):**

1. If you've been writing the same correction to an agent for a few sessions ("write titles in Turkish") → **Agent Farm: Scan for Instruction Suggestions…** → pick the agent.
2. A cheap model scans the follow-up messages; if it finds a repeating pattern a 💡 row drops in Insights.
3. Click the 💡 → the suggestion and its basis are shown → if you say **Apply to CLAUDE.md** the rule is added to the agent's CLAUDE.md under `## Learned rules (Agent Farm)`; if you say **Dismiss** it closes. Nothing is written without approval.

**Transcript search:**

1. The 🔍 on the Recent Sessions header (or **Search Transcripts…**) → type the query (it searches by itself at 3+ characters, or with Enter).
2. There's an agent filter and a `regex` box; in the results the match shows highlighted with its context. Click → the session viewer opens.

**Weekly summary (bonus):** `agentFarm.weeklySummary` = `true` → on the first open of each week, a three-sentence human-language scorecard notification; if `autoReportFolder` is set it's written to the vault too, and it goes to the n8n webhook as a `summary` event.

> ✅ Test: all the mechanics were verified with real haiku calls — sampling produced and stored scores (the same session isn't scored twice), a rule suggestion came out of the repeated "Turkish title / date format" corrections and was added as a section to CLAUDE.md, search was tested with plain text/regex/agent-filter/limit cases, the weekly summary with the three-sentence limit (28 checks).

## S17 — Scale: A Second Machine, Scorecard in Your Pocket, a Portable Agent ✅ (mechanics)

**Goal:** as the fleet grows, keep the command center single: the laptop's sessions in this panel too, the daily scorecard on Telegram, the agent itself in a single file.

**Connect the second machine:**

1. Mirror the laptop's `~/.claude` folder to this machine with a sync tool (Syncthing recommended; OneDrive/SSH copy works too). One direction is enough: laptop → here.
2. Add to settings: `"agentFarm.extraClaudeDirs": [{ "name": "laptop", "dir": "D:/sync/laptop/.claude" }]`.
3. **Refresh** → the laptop's sessions appear in Recent Sessions with a **⇄ laptop** badge. If you use the same agent-folder layout on both machines the sessions are counted to the right agent; cost, scorecard, search — all now see both machines.

**Send the daily scorecard to your pocket:**

1. If you have your S14 n8n → Telegram line, nothing extra is needed: `agentFarm.dailyDigest` = `"21:30"`.
2. Every evening after that time a single message drops: today's cost, top spenders (with budget percentage), task/duty status, warnings. No model call — zero extra cost.
3. To try it: **Agent Farm: Send Daily Digest Now** (shows as a notification if there's no webhook).

**Move / share an agent:**

1. Right-click an agent → **Export Agent Pack…** → save `barista.agentpack`. Identity, duties, tools and the agent's workflows/triggers/schedules in a single file; **its memory and your secrets stay out** (it also skips credential-smelling files by itself and says so).
2. On the target machine **Import Agent Pack…** → pick the file → root + name → confirm. The agent is set up with a fresh memory; triggers and schedules come in off for safety — review, define secrets with `Set Secret…` for steps that use `{secret:NAME}`, then turn them on.

> ✅ Test: the mechanics were verified with real files (26 checks) — pack export/import roundtrip, exclusion of a secret-smelling file, exclusion of `memory/`, path-escape (zip-slip) protection, rebinding by name and an unknown agent falling to self, triggers/schedules coming in off; multi-machine scanning with two fake `.claude` directories (⇄ badge, agent matching, missing-sync warning); the digest card's full/clean-day contents.

## S18 — Two Brains: Run the Agent Under Antigravity Too ✅ (mechanics)

**Goal:** the agent you set up for Claude runs under Google Antigravity (Gemini) too, with the same identity and memory when you want — and what's learned in the two worlds flows to each other.

**Setup (once):**

1. Right-click an agent → **Sync Agent with Antigravity…** → confirm. Three things are produced: `AGENTS.md` (from CLAUDE.md), `.agents/workflows/` (your active duties — they become slash commands in Antigravity like `/inbox-triage`), and if there's a `.mcp.json`, an MCP merge suggestion.
2. Open Antigravity in the agent folder — it reads the AGENTS.md identity and the memory/ memory (since it's plain markdown) directly. If you use MCP, merge the suggestion file into `~/.gemini/config/mcp_config.json`.

**Keeping it alive (this is the real value):**

- You improved CLAUDE.md in a Claude session → a "CLAUDE.md changed…" reminder appears in Insights → run the command, AGENTS.md is refreshed.
- An Antigravity session added a lesson to AGENTS.md → the command notices and asks: **Apply to CLAUDE.md** → the gain is carried, backed up, to the Claude side. The optimization heritage isn't trapped on one side.
- If both changed, a conflict warning: **Show Diff** first, then pick a direction — the losing content sits in the `.afbak` backup.

**Common snags:** if you have an AGENTS.md you wrote by hand, the command doesn't overwrite it without approval; workflow files you edited by hand are skipped in sync (said in a note); the single source of a duty definition stays DUTIES.md.

> ✅ Test: the full lifecycle was verified with real files (27 checks) — production, forward/back sync (including self-reference conversions: "CLAUDE.md" ↔ "AGENTS.md"), conflict detection and resolution, foreign-file/hand-edit protections, zero Insights noise on a non-opt-in agent.

## S19 — Command by Sentence + Work That Finds Its Own Way ✅

**Goal:** set up work conversationally without ever entering setup screens; and let incoming work find the right agent by itself.

**Natural language command:**

1. The 🚀 on the Tasks header → type *"run the psychologist's weekly analysis report tomorrow morning at 09:00"*.
2. A cheap model produces the plan, a preview comes: `📅 Schedule: … Agent: psychologist … once — 2026-07-10 09:00`. If you say **Create** it's set up — if you don't, nothing happens.
3. You can set up a chain too: *"have the writer draft first, then the editor fix it"* → a 2-step workflow, the `{prev_text}` handoff ready.

**Dispatcher:**

1. Put the obvious rules in `agentFarm.dispatchRules`: `[{"match": "sleep|anxiety|dream", "agent": "psychologist"}]` — deterministic and free.
2. Add a trigger: **Add Trigger** → Webhook → action: **Dispatch — route to the best agent**. Now every job dropping in from n8n goes first to the rules, and if none match, to the cheap-model classifier (which reads the agents' CLAUDE.md role summaries).
3. To try without setting up, **Test Dispatcher…**: *"I couldn't sleep last night"* → `psychologist [rule]` or, if there's no rule, `psychologist [model] — rationale`.

> ✅ Test: verified with real haiku calls — the "tomorrow 09:00" expression was converted to the right date (2026-07-10 09:00), the two-step chain was set up in the right agent order, the classifier routed the sleep/anxiety text to the psychologist; broken regexes are skipped, an unknown agent name doesn't let the plan through (16 checks).

## S20 — The Voice Loop: Speak from Your Phone, Let the Factory Process (the F4 recipe)

**Goal:** a voice note turns into text by itself and enters the right chain — all with building blocks that exist today.

1. **Audio → Text:** `New Recipe Workflow…` → the **Audio → Text (Whisper)** recipe (FAL_KEY required). The first step transcribes the audio file, the second summarizes/processes it with the agent.
2. **Let it start itself:** if your phone's voice notes drop into a folder (NoteScribe/Syncthing/OneDrive), set up a **watch trigger** on that folder; make its action the workflow above. An audio file dropped → the chain started.
3. **Let it go to the right agent:** if you make the action **Dispatch** instead of a workflow, the job goes to the psychologist/assistant/whoever fits based on the transcript content (S19).
4. **The answer to your pocket:** add a webhook step at the end of the chain → n8n → a summary comes back to Telegram. (For voicing it with TTS, an extra media step with a fal.ai TTS model — verify the model on fal.ai/models.)

This recipe is today's equivalent of F4 in the plan; as the NoteScribe side matures, a direct bridge (a trigger from the app) can be added.

## S21 — Search by Meaning, Send to a Site ✅ (mechanics)

**Goal:** solve the "what was that thing we talked about?" question by meaning, and bind API-less sites into the chain.

**Semantic search:**

1. Pick a provider: the easiest is Gemini — get a key from [aistudio.google.com](https://aistudio.google.com) → **Set Secret…** → `GEMINI_API_KEY` → setting: `embeddingsProvider: "gemini"`. If you want it fully local: install Ollama, `ollama pull nomic-embed-text`, settings: `embeddingsProvider: "openai"`, `embeddingsBaseUrl: "http://127.0.0.1:11434/v1"`, `embeddingsModel: "nomic-embed-text"` — no key needed, nothing leaves the machine.
2. **Build Semantic Index** → the last 300 sessions go into vectors (incremental — a second run only handles the new ones).
3. Tick **semantic** in the search panel → *"where I talked with the agent about low motivation and the morning routine"* → results sorted by similarity percentage; click, the session opens.

**Browser step:**

1. Install a browser MCP on the agent: Agents → MCP → **Add MCP Server…** → e.g. `npx chrome-devtools-mcp@latest`.
2. Set up a chain: **New Multi-Agent Workflow…** → **Browser step** → agent + URL (e.g. `https://example.com/report`) + objective ("find the latest report, extract the numbers") + allowed domain (`example.com`).
3. Run: a modal approval comes first (URL+objective shown — every time until you set `browserApproval: "auto"`). The chain fails **without starting at all** on a URL off the allowlist; the agent's report passes to the next step as `{prev_text}`.

> ✅ Test: the semantic pipeline was verified end to end with a fake embedding server (OpenAI+Gemini schemas, incremental index, persistence, prune, the "coffee" query finding the coffee session); the allowlist guards (subdomain accepted, similar-name rejected, empty list rejected) and the browser prompt's hard rules were tested with 20 checks.

## S22 — Command Center Morning: Queue, Board, Anomaly ✅

**Goal:** manage a day with 5+ agents from a single screen — "who's waiting for me, what's running, where does the money go?"

1. **First look in the morning:** `🔔 2 need you` in the status bar → click → the **Needs You** queue opens. At the top a session waiting for permission (Open Session → approve), below it yesterday's browser-step approval (say **Run**, the workflow runs on from where it left off).
2. **Keep the board open:** **Open Task Board (Kanban)** → write the day's jobs into the command bar as a sentence: *"have the assistant triage the inbox at noon"* → preview → Create. Start the piled-up Inbox cards in order by dragging them to Running; double-click a finished card's output.
3. **Weekly cost maintenance:** if you see ⚠ *"psychologist is at 4.2× its normal today"* in Insights → **Cost Anomaly Report** → open the most expensive session in the heavy-hitters list, look at the cause (a runaway loop? bloated context? see S6 context diet).
4. **Change instructions by measuring:** if you're going to add a rule to CLAUDE.md, first collect 3-5 **eval cases** from bad traces (Add Eval Case…), add the rule, **Run Eval Set…** → don't count the new rule as final until you see "5/5 passed". If a case regressed, the report says which one.
5. **"What happened last night?"** — if the overnight run's row in Recent Sessions carries a ⧉ 3 sub badge, open the tree, find the expensive subagent; open the session and jump to the moment of the error with **▶ Replay** (next error ⚠).

> ✅ Test: queue sorting/actions, the approval race (first decision wins), the anomaly math (median+MAD, 4.2x detection, quiet-day immunity), the heavy-hitters computation, the eval store+comparison and the subagent parent link+rollup with 45 unit checks; the eval pipeline was verified with a real haiku run (positive case PASS, negative control FAIL).

## S23 — A Self-Auditing Factory: Guardrail, Pulse, Night Shift ✅

**Goal:** make the automation itself reliable — permissions tight, triggers measured, work turning even when VS Code is closed.

1. **Permission scan (comes with setup):** when you see ⚠ *"Overly broad allow rule Bash(*)"* in Insights, click it → settings.local.json opens → narrow the rule to the commands the agent actually uses (`Bash(git *)`, `Bash(npm run *)`). Never leave a ⛔ dangerous-pattern finding waiting.
2. **Turn on the pulse:** `agentFarm.pulse: "nightly"` → every night a cheap "say who you are" test to each agent. If there's a ⛔ *"Pulse check FAILED"* in Insights in the morning, the agent is broken before it gets to real work (did CLAUDE.md break? did an MCP crash?). On first setup, try it by hand: **Run Pulse Check Now**.
3. **Give your triggers a scorecard:** trigger rows in the Tasks tree now show `fired 12× • 7d: 9✓/1✗ • start ~4s`. If a ⚠ "always fails" warning comes → **Trigger Reliability Report** → open the recent outputs, find where the chain broke.
4. **Night shift:** **Install Headless Service (Windows)…** → confirm. Now the 03:00 schedule and the inbox watch trigger work even when VS Code is closed; when the panel opens in the morning, a *"headless service ran 3 task(s) while you were away"* notification + the tasks in the list. The service sleeps while VS Code is open — no double-running.

> ✅ Test: 40 unit checks — the lint rules (bypass/dangerous/broad/unused/duplicate, force-with-lease exemption), trigger statistics (median latency, always-fails/never-fired), the pulse store; the service ran end to end with a fake `claude.cmd` (a schedule fired, a watch trigger opened a task with `{watch}` substitution, outputs were archived, it slept on a fresh heartbeat). The pulse pipeline got a PASS with real haiku.

## S24 — Instruction Engineering by Measurement: Version, Experiment, Distillation ✅

**Goal:** answer "would it be better if I added this rule to CLAUDE.md?" with measurement, not feel; and keep memory maintained too.

1. **History accumulates by itself:** every time you change CLAUDE.md (by hand, by applying a suggestion, or by Antigravity sync) the panel records the new version. A month later, **Instruction History & Impact…** → a table: quality ▲0.4 since v3, cost/day ▼$0.8. If you see a worsening, the content is in the history — going back is copy-paste.
2. **Race the rule first:** is there a 💡 suggestion in Insights? Instead of applying directly, **A/B Instruction Experiment…** → "Try the suggestion" → your eval cases are run as the prompt set → *"A 1 · B 3 · equal 1"* → **Apply B**. The rule is now proven.
3. **Memory maintenance day (once a month):** **Distill Memory File…** → the candidate list (bloated/stale first) → review the draft in the diff: repeats merged, contradictions labeled `⚠ CONTRADICTION:` → Apply (.afbak). Then verify with **Ask Fleet Memory…** *"what do we know about X?"* — the information shouldn't have been lost.
4. **Model discipline by itself:** write once into settings: `modelPolicy: [{"source":"trigger","model":"haiku"},{"source":"schedule","model":"haiku"}]` + `quotaDowngradePercent: 70`. Routines cheap, hands-on work the full model; if the window exceeds 70%, the factory pulls itself down to cheap and writes that into the output header.

> ✅ Test: 44 unit checks — version dedupe/correlation (a quality ▲2.0 table), policy rules (first-match, broken-regex skipping, quota priority), distillation candidates/backed-up application/fence stripping + limit-message and frontmatter guards, memory chunking, the A/B position-bias correction (swap/unswap) verified end to end with a fake claude. (The live distillation run was tested with the fake-model pipeline because the quota window was full.)

## S25 — Ecosystem Day: Parallel Code, Remote Liveness, Voice Report ✅

**Goal:** combine the Phase J tools in a single workday.

1. **Morning — parallel code:** there are three ideas in the code agent's repo. **Run Parallel Worktrees…** → *"fix the login bug ; add dark theme ; speed up the tests"* → all three run in their own worktree, your main working copy stays spotless. At noon, **Worktree Runs…** → look at the diffstats: **Merge** two, **Open** one in a new window to review, **Discard** if you don't like it.
2. **All day — a remote eye:** `farmRelay.js` runs on the laptop (you set it up once: **Save Relay Script…** + a startup task). In the panel on the desktop, the laptop's psychologist session shows live WORKING — no channel opened other than the file sync.
3. **Evening — external reporting:** for the weekly review, **Export Traces (OpenTelemetry JSON)…** → upload the file to Langfuse; the subagent cost tree shows as a span hierarchy.
4. **Need a new agent:** add a teammate's shared repo to `packGalleryRepos` → **Browse Agent Pack Gallery…** → pick the "editor" pack → safe import (triggers come in off, no secrets).
5. **Closing on your phone:** **Speak Daily Briefing (TTS)** → the day's scorecard drops into your phone folder as mp3; listen in the car. (A small job you want to run on Gemini can also go through the same queue with `cliProfiles`.)

> ✅ Test: 40 unit checks — the OTLP span hierarchy (parent/child, error status), the worktree lifecycle on a real git repo (create→commit→status→merge→cleanup; including git 2.14 fallback), the relay tailer (offset/interruption/no-duplication) + the remote script end to end (a real process, no old-line repetition), the gallery (local + file:// clone + pull), CLI template substitution, briefing error paths.

## Closing: A Rhythm Suggestion

- **10 seconds every day:** the status bar + the Duties badges (any pending?).
- **5 minutes every week:** the Dashboard comparison + Insights reset + the vault scorecard + quality sampling (S16).
- **15 minutes every month:** the context diet (S6) + duplicate-memory check (S7) + budget review (S8).

When you need a new scenario, this document is ready to grow — like the Blueprint, it's a document that lives alongside the extension.
