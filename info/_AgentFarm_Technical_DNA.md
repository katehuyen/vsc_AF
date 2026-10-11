---
title: Agent Farm — Technical DNA & Architecture Reference
type: technical-dna
project: prj_9ujsbtzr
source_repo: D:\zone\dev\git\miropharm\vsc_AgentFarm
source_version: 3.923.0
source_commit: aa940841
generated: 2026-10-11
generated_by: developer (gemini-3.7-flash-high), read from the real code
purpose: SSOT for the daily AI-Engines Radar follow-up (bulletin → Agent Farm impact → backlog candidates)
tags: [agentfarm, architecture, technical-dna, radar, engines, acp, mcp, bridge, hooks, cli]
---

# Agent Farm — Technical DNA (SSOT for the daily AI-Engines Radar)

**How the radar task uses this file.** Read §8 (matrix) first. Classify each bulletin item by *engine × change class*, open only the files the matching row names, and output: impact (`none · verify · change · new capability`), the files touched, the gates a change must pass (bridge op · parity entry · flex point · setting category · 11 launch doors), and a backlog candidate (`area`, `kind`, `priority`, `effort`). Never rescan the repo to answer a row; open the named file.

**Freshness rule.** Valid for v3.923.0 / commit `aa940841`. Before trusting a section, run `git log --oneline aa940841..HEAD -- <files of that section>`; any hit on the engine files of §2 means re-read those files, not this text. Every engine fact below was *measured against a real binary* at the versions in §2.0 — a bulletin naming a newer CLI version is by itself a "re-measure" candidate (SOP: `docs/YENI-MOTOR-EKLEME-SOP.tr.md`).

---

## 0. Vital statistics

| Fact | Value |
|---|---|
| Version / date | 3.923.0 (2026-10-11), publisher `muvusoft.agent-farm`, `main: ./out/extension.js` |
| VS Code engine / activation | `^1.90.0` / `onStartupFinished` |
| Runtime dependencies | **zero** (`dependencies: {}`). devDeps: `typescript`, `@types/node`, `@types/vscode`, `fast-check`. WebSocket server, TLS cert, QR encoder, MCP stdio servers, image-size reader — all Node builtins |
| Source size | 600+ `.ts` files in `src/` (including 16 modular `settingsCatalog/*.ts`), 120+ files in `media/`, 718+ `test/test_*.js` (35,600+ passed) |
| Contributions | 586 commands · 242 `agentFarm.*` settings · 1 activity-bar container with 8 views (`agents, projects, tasks, missions, toolbox, sessions, insights, feed`) · 10 keybindings (`ctrl+alt+` c Console · f Quick Menu · s Launch · p Shelf · i Interrupt · d Dashboard · n Needs · l Timeline · a Queue add · b Backlog add) |
| Bridge | ~560 static op names in ~75 namespaces (largest: `projects` 59, `sessions` 31, `a2a` 26, `workflows` 22, `queue` 20, `tasks`/`missions`/`accounts` 19, `console` 18, `alerts` 17, `studio` 15, `memory` 14) |
| Local ports | live-hook listener **8377** (`agentFarm.livePort`, 127.0.0.1) · read-only web view **8378** · phone remote host **7443** (TLS) |
| Engines | `claude` · `codex` · `gemini` (`@google/gemini-cli`) · `agy` (Antigravity CLI) · `opencode` — `EngineId` union in `src/core/engines.ts` |
| Gate | `npm test` = `tsc -p ./ && node test/run-all.js`; full gate `AF_NO_COMPILE=1 node test/run-all.js`; package `npm run package` (encoding + ctxmenu + parity tests, then `vsce` → `dist/vsix/`); `npm run verify` checks the VSIX zip listing |

---

## 1. System purpose & architectural invariants

**Purpose.** Orchestration, console, bridge and UI engine for CLI coding agents. It **runs no LLM itself**: it drives the user's own CLIs, on the user's own subscriptions/keys, and leaves transcripts where each CLI writes them, then reads them back for analytics.

### 1.1 Layers

| Layer | Where | Rule |
|---|---|---|
| Composition root | `src/extension.ts` (44,353 lines) | `activate()`, every `bridge.register([...])`, command registration, host wiring. A legacy monolith — new logic goes to `src/core/`, never appended here |
| Pure domain core | `src/core/` | Most modules are *pure over injected readers* (no `fs`, no `vscode`). Pattern: a pure decision file + a thin io file (`accountAttribution`/`accountEvidence`, `autoAnswer`/`autoAnswerTimers`, `baton`/`batonStore`, `sentryRun`/`sentryDriver`) |
| Webview hosts | `src/panels/` (54) | Talk to core through host callbacks; drawn on a `PanelHost` (`panelHost.ts`, X-441) so one page renders in a VS Code tab **or** on the phone (`remoteViews.ts`) |
| Webview code | `media/` | No build step. Single-implementation modules shared by webview **and** Node: `afTime.js`, `afQuery.js`, `afLaunch.js`, `afDimensions.js`, `afFlex.js`, `afI18n.js`, `afRunFilter.js` (Node loads them via `core/aftime.ts`, `query.ts`, `aflaunch.ts`, `launchDimensions.ts`, `flexPoints.ts`, `i18n.ts`, `runFilter.ts`) |
| Launch doors | `src/launch/` | `doors/*.ts` registry of every session entry point, `reopen.ts`, `reopenDoors.ts`, `accountPlacement.ts` |
| Phone host | `src/remote/` | Imports nothing from the extension except through `RemotePort` (`test_remote_boundary`) |
| Standalone scripts | `src/service/` | Staged to globalStorage: `af.ts` (bridge CLI), `farmService.ts` (headless scheduler), `cliHook.ts` (external-CLI hook forwarder), `farmRelay.ts` (remote-machine relay) |
| MCP servers | `src/mcp/airtable`, `src/mcp/kapici` | stdio, staged standalone under globalStorage (version-independent path) |
| Decision gate | `src/core/kapici/` | Imports nothing outside its folder, never `vscode` — package-ready |

### 1.2 Invariants and the gate that holds each

| Invariant | Enforcement |
|---|---|
| Anti-monolith (< 300 lines per new module) | Convention (charter). Legacy giants exist: `extension.ts` 44k, `tasks.ts` 8.7k, `missions.ts` 5.1k, `consolehost.ts` 3.2k, `tasksPanel.ts` 3.0k, `consolePanel.ts` 2.9k, `projectBacklog.ts` 2.6k, `sessions.ts` 2.6k, `consoleproto.ts` 2.4k |
| Every user-triggerable action has a bridge op | `test/test_parity.js` vs `parity.manifest.json`: each command, right-click item and panel message → op(s), or an exemption (`navigation · visual · file-picker · secrets · human-only`), or a named `gap`; `gapBudget` may only shrink |
| One op, one registration | `BridgeRegistry.register` throws on a duplicate at startup (`{replace:true}` to override on purpose) |
| Every launch dimension reaches all **11 entry points** | `src/launch/doors/` + `test_launch_parity.js`; `RunDimensions` travels *by shape* (`runExtras`), the test reads the type out of the source |
| A reopen uses what the session **closed** with | `reopenDoors.ts` + `test_reopen_parity.js` (S-109) |
| New `agentFarm.*` setting → category | `src/core/settingsops.ts` + `test_settingsops.js` |
| New user preference → flex point | `media/afFlex.js` + `test_flex_points.js`; resolution chain built-in → Farm Settings → agent → project → workflow → step → run start → live (`flexResolve.ts`) |
| UI text through `t()` | `test_i18n_ratchet.js`; English is source and key |
| `package.json` encoding | `test_encoding.js` (pre-commit + package) |
| Engine facts are measured, not read from docs | Named exported constants pinned by tests (`CODEX_RESUME_REFUSES`, `AGY_PRINT_TIMEOUT`, `GEMINI_HAS_NO_EFFORT_FLAG`, `OPENCODE_ACP_PROTOCOL`, …); every engine file states the CLI version it was measured on |
| Exhaustive engine dispatch | `switch (spec.id)` over `EngineId` with a `never` default in `consoleEngine.ts` — the compiler finds a forgotten engine |

### 1.3 Persistence & multi-window

- **globalStorage** (`%APPDATA%/Code/User/globalStorage/muvusoft.agent-farm/`): `bridge/`, `tasks.owner` (lease), `live.heartbeat`, `farm-tasks.json`, `task-history/YYYY-MM.jsonl`, `missions.json`, `batons.json`, `projects.json`, `closing-setup/`, `service-runs.jsonl`, `airtable-config.json`, remote storage (cert, devices, event log).
- **Writes**: `atomicFile.ts` (temp + rename); keyed stores merged under lock by their owner (`syncMerge.ts`, `syncMergeOps.ts`); `jsonJournal.ts` bounded append-only evidence logs.
- **Portability**: `portableState.ts` lifts fleet state out of machine-bound `state.vscdb`; `portablePaths.ts` rewrites machine-specific absolute paths in git-synced stores; `pathVars.ts` resolves `${vault}`, `${temp}` and refuses to guess.
- **One runner window**: `OwnerLease` (`owner.ts`) on `tasks.owner`; the holder runs the task pump, scheduler, bridge and phone host; other windows are read-only followers and take over when the lease ages out.

---

## 2. Engine launchers & process execution

> There is no `src/core/launchers/` folder. The engine layer is: `engines.ts` (is it usable here) · `consoleEngine.ts` (how a turn reaches it) · `consoleproto.ts` + `<engine>proto.ts` (translation) · `consolehost.ts` (hosted process) · `tasks.ts` `spawnHeadless` (unattended runs) · `launch.ts` (terminal command line) · `opencodeacp.ts` (shared ACP process).

### 2.0 Measured baselines (re-measure when a bulletin names a newer version)

| Engine | Measured on | Evidence file |
|---|---|---|
| Claude Code | 2.1.x (2026-07-27), 2.1.220 (settings/UA), 2.1.232 (bypass incident); env names read from the 217 MB binary 2026-08-30 | `consoleproto.ts`, `permissionmode.ts`, `providerRuntime.ts`, `planusage.ts` |
| Codex | codex-cli 0.147.0 (2026-08-10) | `consoleEngine.ts`, `codexproto.ts`, `codexHooks.ts` |
| Gemini CLI | 0.55.1 (2026-08-13), from `--help`, bundled docs and source | `gemini.ts`, `geminiproto.ts` |
| Antigravity `agy` | 1.1.11 (2026-08-10); quota-read change 2026-09-29 | `agy.ts`, `agyproto.ts`, `agyUsageBeat.ts` |
| OpenCode | 1.18.18 (2026-08-15), ACP protocolVersion 1 | `opencode.ts`, `opencodeacp.ts`, `docs/OPENCODE-ENTEGRASYON.tr.md`, `tools/opencode_acp_probe.js` |

### 2.1 Transport table (`consoleEngine.ts` → `ENGINES`)

| Engine | exe | shape | live controls | cost source | prompt on | shell | resume in terminal | readable transcript |
|---|---|---|---|---|---|---|---|---|
| claude | `claude` | `persistent` (1 process / session) | yes | `cli` ($ stated) | stdin (stream-json) | yes (`.cmd` shim) | `--resume` | JSONL |
| codex | `codex` | `perTurn` | no | `tokens` | stdin (`-`) | yes | **no** (`exec resume` is a subcommand) | rollout JSONL |
| gemini | `gemini` | `perTurn` | no | `tokens` | stdin (no `-p`) | yes | `--resume <uuid>` | chat JSON/JSONL |
| agy | `agy` | `perTurn` | no | `tokens` | **argv** (`--print`) | **no** (real `.exe`) | `--conversation` / `--continue` | **no** (protobuf in SQLite) |
| opencode | `opencode` | `sharedAcp` (**1 process for the whole extension**) | no (changes at turn boundary) | `cli` ($ stated, 0 is real) | JSON-RPC / stdin | yes | `-s` / `-c` | no (SQLite; `session list`/`export`) |

`reportsCost:false` is a capability ("prints no dollars"), never a billing claim; billing mode comes from the engine's own credentials (`engines.ts` `AuthMode`: `subscription · apikey · none`).

### 2.2 Claude Code

- **Hosted Console** (`consoleproto.hostArgs`): `claude -p --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio <permission launch flag> [--resume <sid>] [--model M] [--effort E] [--permission-mode X] [--append-system-prompt-file "<ctx>"]`. `--permission-prompt-tool stdio` is mandatory — it makes the channel two-way (without it AskUserQuestion errors out and the turn ends).
- **stdin**: user messages as Anthropic content arrays (images base64 first, path attachments as backticked text), top-level `uuid` stamped (S-54). **Control requests**: `interrupt` · `set_permission_mode` · `set_model` · `apply_flag_settings {effortLevel}` (= `/effort`) · `get_settings` → `applied {model, effort, advisor, ultracode}` (the CLI's own resolution; free). **stdout** types reduced: `system` (`init`: model, tools, `slash_commands`), `assistant`, `user`, `result`, `control_request` (`can_use_tool`, incl. `requires_user_interaction` for AskUserQuestion), `control_response`, `control_cancel_request`.
- **Project context** goes on *every* spawn including resumes (appended system prompt does not survive `--resume`), as the **pinned identical bytes** to keep the prompt cache (X-267: a regenerated file re-billed 303,987 tokens).
- **Headless task** (`tasks.ts spawnHeadless`): `claude [--session-id <uuid> | --resume <sid>] [extraArgs] [model-policy args] [launch args] [browser --mcp-config] [--output-format json] [--append-system-prompt-file "<ctx>"] -p "<prompt>"`, `shell:true`, `windowsHide`, output streamed to the task archive. `--session-id` pre-declares the transcript id (X-321) so the run is bound before the file exists.
- **Terminal** (`launch.ts`): interactive `claude` with model/effort/permission/name/first prompt, `--add-dir`, `--append-system-prompt-file`; native terminal option (`extTerminal.ts`).
- **Permissions** (`permissionmode.ts`, K-22): three facts kept apart — *requested* · *from settings* (layers `managed > local > project > user`) · *enforced*. Flags: enforced bypass → `--dangerously-skip-permissions`; otherwise `--allow-dangerously-skip-permissions` + `--permission-mode <requested>`. `permissions.disableBypassPermissionsMode` → the session is **refused**, not silently downgraded. The remote gate `tengu_disable_bypass_permissions_mode` is invisible on disk; the reducer auto-answers so a bypass card never shows a prompt.
- **Full system prompt**: account slots carry `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0` in their `settings.json` (`engineAccounts.ts` `requiredEnv`).
- **Context window env (X-522)**: When a provider route states a context window (`Context`), Agent Farm passes `CLAUDE_CODE_MAX_CONTEXT_TOKENS=<tokens>` to Claude Code (`providerRuntime.ts`). This sets Claude Code's initial window and suppresses the unknown-model 200k context notice. It also serves as the denominator for the context meter and handover thresholds (`routeWindow.ts`).

### 2.3 Codex

- First turn: `codex exec --json --skip-git-repo-check -c sandbox_mode="<m>" [-c model_reasoning_effort="<e>"] [-m M] [-i <img>…] [-C "<cwd>"] -`. Later turns: `codex exec resume <thread_id> --json --skip-git-repo-check -c … [-m] [-i] -`. **`resume` refuses `-s/--sandbox/-C/--cd` (exit 2)** → sandbox via `-c`, cwd = process cwd (`CODEX_RESUME_REFUSES`).
- Headless: same without `--json`, plus `-o "<lastMessageFile>"`. TUI: `codex -s <sandbox> [-c model_reasoning_effort] [-m] [-C]`.
- Prompt on stdin (given as argv it still drains a piped stdin and hangs).
- Sandbox map `CODEX_SANDBOX`: `default/plan → read-only` · `acceptEdits → workspace-write` · `bypassPermissions → danger-full-access`. Codex cannot stop and ask.
- No system-prompt flag (`CODEX_HAS_NO_SYSTEM_PROMPT_FLAG`) → brief rides in the first prompt as `<project-context>…</project-context>`.
- Events (`codexproto.ts`): `thread.started`, `turn.started/completed/failed`, `item.started/updated/completed` with items `command_execution`, `file_change`, `mcp_tool_call`, `web_search`, `todo_list`, `error`.
- Context: rollout `token_count` → `model_context_window` (`codexctx.ts`, X-43 — lifetime spend is not context).
- Hooks: `hooks.json` + trust records in `config.toml` `[hooks.state.'<path>:<event>:<group>']` with `trusted_hash`, reproduced the way `codex app-server → hooks/list` reports (`codexHooks.ts`, X-295). Hooks carry **no `additionalContext`**.
- Models: `~/.codex/models_cache.json` (visibility, priority, per-model reasoning vocabulary). Auth: `~/.codex/auth.json` `auth_mode` (`chatgpt` | key). Instructions: `AGENTS.md` (`codex.ts`). Imported foreign history in `~/.codex/sessions` is not Codex work (`externalImports.ts`, X-44).

### 2.4 Gemini CLI (`@google/gemini-cli`, not `agy`)

- Hosted: `gemini --output-format stream-json [-m M] --approval-mode <a> [--resume <uuid> | --session-id <uuid>] [--include-directories a,b]`, prompt on stdin (`-p` would duplicate it). Headless `--output-format json`. TUI `--resume latest`.
- `GEMINI_APPROVAL`: `default→default` · `plan→plan` · `acceptEdits→auto_edit` · `bypassPermissions→yolo`. Headless: `ask_user` = **deny**; leaving plan mode non-interactively switches to **YOLO** (trap stated in `geminiModeNote`).
- Unique: `--session-id <UUID>` presets the id (`GEMINI_CAN_PRESET_SESSION_ID`). Missing: effort flag (`GEMINI_HAS_NO_EFFORT_FLAG`), system-prompt flag.
- Exit codes: `0` ok · `1` error/API · `42` input error · `53` turn limit. Events: `init`, `message`, `tool_use`, `tool_result`, `result`, `error`. Transcripts `~/.gemini/tmp/<sha256(projectRoot)>/chats/`. Google-account login retired June 2026 → API key. Account isolation: **unmapped**.

### 2.5 Antigravity (`agy`)

- Hosted: `agy --output-format stream-json --print-timeout 120m [--add-dir <cwd>] --model M [--effort E] [--mode plan|accept-edits] [--conversation <id>] --print "<prompt>"`, spawned **without a shell** (argv prompt survives newlines, quotes, backtick, `$ % &`). Headless `--output-format json`.
- `--add-dir` is mandatory (otherwise it works in `~/.gemini/antigravity-cli/scratch`). `--effort` conflicts with effort-bearing model names (`agyModelArgs`). Default print timeout 5 min → always `AGY_PRINT_TIMEOUT='120m'`. Refused modes: `manual`, `dontAsk`. No image channel, no system-prompt flag.
- Events (`agyproto.ts`): `init`, `user_input`, `step_update`, `agent_response`, `checkpoint`, `error_message`, `result`.
- Models: `agy models` must be *run* (no cache file). Quota: `agy -p /usage`; since 2026-09-29 each run flashes a terminal, so it is read only while agy is active (`agyUsageBeat.ts`). Auth borrowed from the desktop app — no credential file. `antigravity.ts` syncs `AGENTS.md`, `.agents/workflows|skills`, `~/.gemini/config/mcp_config.json`.

### 2.6 OpenCode

- **Hosted over ACP**: one `opencode acp` process (~383 MB idle working set) multiplexes every card by `sessionId` (`opencodeacp.ts`, K-25). Takes lent provider routes dynamically (`openCodeAdapter.ts`, `opencodeRoutes.ts`, `opencodeSharedRoutes.ts`, X-516..X-519), restarts itself when routes change (never under a running turn, `opencodeReload.ts`). Contract in §3.4; probe op `providers.contract` (`opencodeContract.ts`, `opencodeContractProbe.ts`).
- **Shared process lifecycle & route restarts (X-519)**: The shared OpenCode process takes all lent routes with valid keys. Changing or removing a route restarts the process *only* when every card is idle; cards preserve their model and permission mode across restarts; messages sent during restart wait.
- **Grouped selectors & badging (X-521)**: Provider and model lists on all launch doors are partitioned into two headed groups (*Agent Farm routes* and *OpenCode's own*). Badges show the route label in company colors for lent routes, or the catalog model name for OpenCode's own models (never generic 'opencode').
- **Temp file leak prevention (X-528)**: Harvest passes (`opencodeharvest.ts`) run with `OPENCODE_DISABLE_MODELS_FETCH=1` (`opencodeCacheTemps.ts`) to prevent background `models.dev` temporary files (`models.json.PID.MS.tmp`) from accumulating in `%USERPROFILE%/.cache/opencode`. Leftover stale temp files (>1h, writer PID not alive) are swept by `sweepCatalogTemps`.
- Headless: `opencode run --format json [-s <id>] [-m M] [--variant v] [--agent plan|<x>] [--auto] [--dir "<cwd>"] [-f "<file>"…]` (`opencoderun.ts`; `sessionID` and `cost` arrive on the first lines → bound while running). `--variant` is per model (`opencode models --verbose`, `opencodeVariant.ts`).
- First-use SQLite migration race (`database is locked`) → exactly one retry (`opencodeLockRetry.ts`). Constitution injection via `OPENCODE_CONFIG_CONTENT` when the instruction walk stops at a git worktree (`opencodesync.ts`, X-39). Usable with zero credentials (built-in free models; `OPENCODE_READY_WITHOUT_CREDENTIAL`). History: `session list` / `export`, spawned off the render path (`opencodeharvest.ts`).

### 2.7 Spawn environment, routes, accounts

- **Layering** (`providerRuntime.spawnEnvironment`): `process.env` → engine layer → agent env (secrets) → account layer → route runtime (`spawnEnv` + `clearEnv`); `null` deletes.
- **Provider routes — Single entry, two engines (X-513..X-519):** Single route definition supports `claude` and `opencode` (`routeEngines.ts`). Claude route isolation (X-101): every `ANTHROPIC_*` cleared by prefix (75 names measured); `CLAUDE_*` cleared by *meaning* while keeping project/plugin dirs. OpenCode route lending (X-517): `OPENCODE_CONFIG_CONTENT` injection with auth headers and baseUrl mapping. Route tiers become per-alias model variables (`routeModels.ts`); `oauth` routes → `ANTHROPIC_AUTH_TOKEN` (Bearer), others → API-key (`routeAuth.ts`). Route can't change inside a live session (`providerSwitch.ts` X-105; `resumeGate.ts` X-109). Provider stack: `providerAdapter` · `providerCatalog` · `providerOwnership` · `providerProfiles` · `providerRegistry` · `providerHealth` · `providerIdentity` · `providerKeys`.
- **Route settlement & safety (X-525)**: Removing or unticking an engine on a route settles all saved setups naming it first (repoint, clear, delete); launches landing on a defunct or unassigned route are refused at all doors (`savedRoutes.ts`).
- **Accounts = directories** (`engineAccounts.ts`, X-168). Support levels: `claude` **measured** (`CLAUDE_CONFIG_DIR`; own `.credentials.json` + `.claude.json` at home root; junctioned `projects, todos, shell-snapshots, plugins, skills`; shared file `history.jsonl`; `settings.json` *projected* per key — `keyOwnership.ts`, `slotSettings.ts`; sign-in `claude auth login` / `auth status`; quota from OAuth credentials) · `codex` **measured** (`CODEX_HOME`; own `auth.json`; `config.toml` projected with hook trust; `codex login`; quota from session tail) · `gemini`, `opencode`, `agy` **unmapped**. Birth contract `slotCompleteness.ts`, return leg `slotPromote.ts`, fleet-file watch `slotWatch.ts`, repairs as events `slotRepairs.ts`, plain-text token carry `credentialCarry.ts`.
- **Account lifecycle & sleep/wake (X-530, X-531):** Accounts can be disabled/enabled (`accountLife.ts`, `accountLifeOps.ts`) without removing slots. Sign out clears credentials without deleting the account directory or slot configuration. `Forget` unified into explicit `Delete`.
- **Account choice by rule** (`accountPolicy.ts`, e.g. `@emptiest`), `startRoom.ts` ("may a session start on this account now"), `wall.ts` (5h + all-models week), `quotaBrake.ts` (row's own account), `stayAccount.ts` (non-quota handover stays put).
- **Quota** (`planusage.ts`): `GET https://api.anthropic.com/api/oauth/usage`, `anthropic-beta: oauth-2025-04-20`, CLI-shaped `User-Agent: claude-cli/<v> (external, <entrypoint>)` + `x-app: cli` (no UA → aggressive 429 bucket), ~180 s safe interval; `usageGate.ts` one budget per token; `usageShelf.ts` one reading shared; `usageFloor.ts` last good reading is a floor until turnover. `oauthRefresh.ts`: `platform.claude.com/v1/oauth/token` with the CLI's client id, refresh + atomic write-back. Non-Claude: `engineUsage.ts`.

### 2.8 Process lifecycle, crash, memory, terminal

- **Hosted Claude**: `StringDecoder` line reader; `child.on('error'|'close')` → status `error|ended` + `exitReason`; queue held per shape (steer on persistent, held on per-turn).
- **Kill** (`processTree.ts`, S-43): Claude 2.1+ runs a daemon with a pre-warmed worker; the registry names the worker, so AF climbs to the top of the claude tree (never into its own ancestry, only through claude processes, bounded depth) and `taskkill /T` there.
- **CLI registry** (`cliSessions.ts`): `<config-dir>/sessions/<pid>.json` `{pid, sessionId, cwd, startedAt…}`, per config home; two files naming one `sessionId` = twin (`farm.health` → `sessions.twins`); daemon spares filtered.
- **One writer per session**: `consoleRegistry.ts` (S-37) across windows; `ConsoleHost.reclaim` ends a holder before `--resume`.
- **Survive host restart**: `consoleRevive.ts` (X-232) stamps live cards before death and resumes them in the same seat with every `RunDimensions` field; `consoleTaskRevive.ts` (S-88); `selfRestart.ts` (X-230, `farm.restartExtensionHost`; only a window reload loads a new VSIX → `build.pending`).
- **Faults**: `engineFault.ts` names the kind of engine fault that failed a turn; `engineFaultWatch.ts` (X-427) never lets a relay leg stall on one; `stallJudge.ts` (silence while own tool runs ≠ stall); `liveWait.ts`/`turnWait.ts` (background work); `interrupt.ts` + `stopSource.ts` (who asked to stop); `retry.ts` (M-3 policy), Smart Continue, `retrySupervisor.ts` (M-13).
- **Memory / OOM**: no explicit OOM handler; protection is structural — shared OpenCode process, `sessionResident.ts` (index projection, X-129), `sessionStore.ts` (on-disk parsed index; avoids a 703 MB / 7.5 s re-read), streamed JSONL with `MAX_STREAM_BYTES` 512 MB and whole-file `MAX_FILE_BYTES` 24 MB, `textSearchCorpus.ts` (X-42), `transcriptRead.ts` (read only once stable, S-30).
- **Terminal / TUI**: `terminalRender.ts` (repairs `terminal.integrated` keys that garble a claude TUI; native-terminal switch), `extTerminal.ts` (OS terminal instead of xterm.js), `shellReady.ts` (K-33: send only to a shell-integration-ready terminal), `handoffLine.ts` (per-shell quoting).

---

## 3. Bridge & communication protocols

### 3.1 Farm Bridge — file IPC (`core/bridge.ts`, `extension.ts processBridge`)

- **Request** `<globalStorage>/bridge/<id>.request.json` `{op, args, from:{sessionId?, ppid?}}` → **claim**: runner unlinks the request, writes `<id>.pending.json` `{op, takenAt, bootId, pid}` → **response** `<id>.response.json` `{ok:true, result}` | `{ok:false, error, detail?}`; answers remembered for duplicates; responses pruned after a day.
- **Pickup**: `fs.watch(bridgeDir)` + 300 ms settle, plus a 30 s poll; first pass deferred past activation. Only the lease-holding runner window executes; with no window, requests wait.
- **Registry**: `{op, describe, handler(args, from)}`; `farm.ops` returns the catalog; `BridgeRefusal` carries a structured `detail` and is never truncated; arbitrary exceptions capped (300 chars). Op naming `<area>.<verb>`; handler calls the same manager the UI calls.
- **Caller identity** is a *claim, never a credential*: `CLAUDE_CODE_SESSION_ID` or `AGENT_FARM_SESSION` + `ppid`; `whoami` (S-68) walks the process tree up to a CLI registry entry.
- **`af.js`** (`service/af.ts`, staged into `bridge/`): `node af.js <op> [k=v… | json | @file.json | -] [--stdin-base64] [--timeout ms] [--bridge-dir dir] [--out file]`. Dir resolution: `__dirname == bridge` → `AGENT_FARM_BRIDGE_DIR` → platform default. Default timeout 20 s (`AGENT_FARM_BRIDGE_TIMEOUT`). Timeout **with** pending marker = "still running"; without = "unclaimed, nothing ran". `--out`/`--stdin-base64` defeat PowerShell 5.1 re-encoding.
- **Secrets values never cross the bridge; secret names and bindings do** (`secrets.list` returns names and bound metadata; `providers.bindSecret`, `kapici.bindSecret`, `mcp.servers.bindSecret` and `secretRef` on `providers.add`/`set` bind by name, B-31; values remain in OS keychain).

### 3.2 Live hook channel — HTTP (`core/live.ts`, `core/hooksInstaller.ts`)

- Listener `127.0.0.1:8377`: `POST /event` (hook payloads), `POST /trigger/<token>` (webhook triggers).
- Installed into every account's Claude `settings.json` (marker `agentfarm-live`) for `PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact`. Command spelled twice — POSIX/cmd vs Windows PowerShell 5.1 (`curl.exe`, quoted `'@-'`, `; exit 0`) — with `--connect-timeout 2 -m 15`.
- **Answer channels**: `hookSpecificOutput.additionalContext` (context/quota signals into the model, Claude only) · `PreToolUse` `permissionDecision:"deny"` + reason (guards, §6) · `SessionStart` answer (work-area line). Codex hooks: `hooks.json` event map (`pre_compact`, `post_compact`, `session_start`, …), trusted, no context channel. `cliHook.js` forwards gemini/codex events.

### 3.3 Engine wire protocols → one reducer

Claude stream-json + control protocol · Codex exec JSONL · Gemini stream-json/json · agy stream-json/json · OpenCode ACP v1 JSON-RPC. Each `<engine>proto.ts` is "a translation layer, not a new protocol": all reduce into `ConsoleSessionState` / `ConsoleMessage` (`consoleproto.ts`). Field names share nothing across engines — never map by analogy.

### 3.4 ACP (Agent Client Protocol) — status & readiness

- **AF as ACP client — implemented for OpenCode only.** `initialize` with `protocolVersion: 1` (anything else is refused by `opencodeCapabilityRefusal`), `clientCapabilities {fs:{readTextFile:true, writeTextFile:true}, terminal:false}`. Capabilities read: `loadSession`, `sessionCapabilities {close, fork, list, resume}`, `promptCapabilities {image, embeddedContext}`, `mcpCapabilities {http, sse}`, `agentInfo`. Methods: `session/new`, `session/load` (crash reload, only after the old process is gone), `session/prompt` (result `usage` = turn spend), `session/cancel`, `session/set_config_option` (**`configId`, not `id`** → else −32602). Agent→client requests that **must be answered or the turn hangs**: `session/request_permission` (spec-derived, never yet observed on the wire), `fs/read_text_file`, `fs/write_text_file`. Updates: `agent_message_chunk`, `agent_thought_chunk`, `user_message_chunk`, `tool_call`, `tool_call_update`, `usage_update` (occupancy + capacity + `cost.amount`), `available_commands_update`. `StringDecoder` mandatory (split multibyte chars).
- **Reuse path**: `EngineShape 'sharedAcp'` exists in the type system; the runtime class is still OpenCode-named (`OpencodeRuntime`). An engine that ships an ACP server mode = generalize `opencodeacp.ts` into an engine-agnostic runtime + a contract file like `opencode.ts` + translator; the per-turn/persistent transport stays the fallback.
- **AF as ACP server/agent — not implemented.** External entry points today: the bridge (`af.js`), the Kapıcı MCP server, the phone WebSocket contract.

### 3.5 MCP

- **Consumer**: `mcp.ts` (inventory from the CLIs' own config files + real `mcp__<server>__<tool>` usage from transcripts), `mcpProbe.ts` (real `initialize → tools/list` over stdio NDJSON or streamable HTTP), `toolbox.ts`/`toolboxBridge.ts`, `capabilities.ts`. Browser recipes run on AF's own Playwright MCP with persistent per-recipe profiles (`browserRecipes.ts`, `browserLogin.ts`, `browserDownloads.ts`).
- **Provider**: Airtable Engine MCP (stdio; config via `AIRTABLE_MCP_CONFIG`; `src/mcp/airtable`) and Kapıcı MCP (3 tools, each a bridge op; key never leaves AF; `src/mcp/kapici`, `kapiciMcp.ts`). Registered in `~/.claude.json` only on request.

### 3.6 Phone, web, chat, relay

- **Remote host** (`src/remote/`): HTTPS/WSS on 7443; self-signed P-256 cert pinned by SHA-256 in the pairing QR (own encoder `qr.ts`); one-time 10-min pairing codes; device SPKI keys; signed hello; RFC 6455 WebSocket on builtins (masked frames, `MAX_MESSAGE`); numbered event log with `resumeAfter` replay; scopes `read · answer · manage · admin` (phones pair at `manage`); audit log; `remote-contract.v1.json` shared with the Android shell; `features.ts can()`; firewall verdict + UAC rule (`firewallVerdict.ts`, `firewallWin.ts`).
- **Web view** 8378: read-only snapshot page, token, loopback by default (`webserver.ts`, `websnapshot.ts`).
- **Telegram**: long polling, no inbound port (`telegram*.ts`: routing, commands, digest, execution gates, `/new <agent>` opens a Console session). Outbound webhook `notifyWebhookUrl`; inbound `messaging.ts`.
- **Headless service** (`farmService.ts`): runs schedules/watch-triggers with `claude -p` while `live.heartbeat` (30 s) is stale. **Relay** (`farmRelay.ts` → `relay.ts`, polled feed files). **OTLP** export to file (`otel.ts`).

---

## 4. Session, console & transcript lifecycle

### 4.1 Console (hosted sessions)

`ConsoleHost` (`consolehost.ts`) + `panels/consolePanel.ts` + `media/console.js`: `start(init)` spawns per shape → reducer state → queue (`editQueued/takeQueued/releaseQueued`) → `answer(ask)` → `interrupt(from)` → `setModel/setEffort/setPermissionMode` (live on Claude, next-turn flag on per-turn, config option on ACP) → `setAccount` (= a new spawn) → `close/forget/dispose`. Resume rebuilds history from the transcript (`consolehistory.ts`) and carries totals (`applyCarried`).

### 4.2 Human questions inside a turn

`can_use_tool` (Claude) / `session/request_permission` (ACP) → a `ConsoleAsk` card. AskUserQuestion answer = `updatedInput.answers[<question>] = <label>`, same turn continues. **Auto-answer** K-43 (`autoAnswer.ts` pure, `autoAnswerTimers.ts` in host): an unattended question takes its recommended option at expiry; K-45 filters leave matching questions to a person (→ Needs You row, `consoleNeeds.ts`); partial picks kept (`autoAnswerPicks.ts`); reminder before expiry (`answerSoon.ts`, U-214). Allow / allow-and-stop-asking / deny; `PERMISSION_GRANTS` covers refusals arriving as errored tool results.

### 4.3 Records of a run

`launchManifest.ts` (X-102, immutable, written before spawn) · `reportedIdentity.ts` (engine's own testimony) · `turnRuntime.ts`/`appliedTurn.ts` (asked vs ran, per turn) · `launchBinding.ts` (S-31, what AF started, bound before the transcript exists) · `closingSetup*.ts` (S-109, per-session closing model/effort/permission/account) · `authorship.ts` (S-36, `role:user` is a channel, not a human).

### 4.4 Session index & transcripts

`sessions.ts` `SessionIndex` (Claude JSONL under `~/.claude/projects`, `extraClaudeDirs`, account slots) · `sessionStore.ts` (disk index) · `sessionResident.ts` (heap projection) · `sessionSource.ts` (external engines kept out of `all()`; opt in via `index.external()`) · `cliTranscripts.ts` (fail-soft adapters: Codex rollout `session_meta/turn_context/event_msg token_count/user_message/response_item`; Gemini chat `messages[]`/JSONL; agy metadata index; OpenCode export) · `sessionRead.ts` (B-24, one conversation shape for every engine) · `consoleresume.ts` (every engine's resume list) · `sessionFind.ts`, `sessionmarks.ts`, `sessionExport.ts`, `chainMembership.ts`.

### 4.5 Token accounting & cost

`pricing.ts`: usage = input · output · cacheRead · cacheWrite (5-min TTL ×1.25 vs **1-hour TTL ×2** of input). `DEFAULT_PRICING` USD/M tokens: opus 15/75/18.75/1.5 · fable\|mythos 15/75/18.75/1.5 · sonnet 3/15/3.75/0.3 · haiku 1/5/1.25/0.1; `agentFarm.pricing` first regex match wins; unknown model = honest $0 + warning. Weighted tokens = Sonnet-input-equivalent for the 5h window (`QUOTA_WEIGHTS`, `quotaWeightMode`). `billing.ts` (who is billed per route), `taskcost.ts` (task↔session), `accountSpend.ts` (per sign-in), `stepkind.ts` (nine kinds of step), `anomaly.ts` (median + MAD), `forecast.ts`.

### 4.6 Context window & compaction

- `contextAfter(usage)` = input + cache_read + cache_creation + output of the **last** call. Window: from the stream/model, overridable by `agentFarm.contextWindowTokens`; Codex `model_context_window`; OpenCode `usage_update` size. `/context` output parsed in both shapes (TUI gauge, print-mode markdown table; categories verbatim) in `panels/sessionViewer.ts`.
- Compaction: `PreCompact` hook ingested by `live.ts`; Codex `pre_compact/post_compact` mapped. **No `compact_boundary` transcript parsing exists** — the next context reading simply drops.

### 4.7 Handover discipline & baton relay

- **Context/quota guard** (`contextGuard.ts`, S-64): `contextConvergePct 35`, `contextHandoverPct 40`, `quotaConvergePct 0`, `quotaHandoverPct 90`, `quotaWeeklyHandoverPct 98` (flex default); words `CONTEXT CONVERGE/HANDOVER`, `QUOTA CONVERGE/HANDOVER`; delivered **once** via `additionalContext` on the next tool call; engines without the channel are recorded `undelivered`. `passCause.ts` (X-472), `misplaced.ts` (X-474).
- **Baton** (S-66…S-129): states `armed · waiting-end · parked · started · stopped · refused · done · failed`. `baton.pass` starts nothing; `batonRunner.ts` releases on session **end** (SessionEnd hook, Console exit, terminal close → one channel); `batonDoor.ts` opens the successor through `tasks.add`; `batonSeal.ts` leg 1; `batonBrake.ts` (ceiling `maxLegs`, barren, user `lastLeg`); `batonFailsafe.ts` (unpassed end rescued only on evidence); `batonEnd.ts` (AF ends passed interactive legs); default account `@emptiest`; store cap 200; chain board `chains.list/continue/end`; `relaySeat.ts`. Settings: `batonMaxHops`, `batonHandoverTemplate`, `batonEmergencyTemplate`, `batonFaultWaitHours`.

---

## 5. Multi-agent orchestration & workflow mesh

| Subsystem | Core files | Mechanics |
|---|---|---|
| Tasks | `tasks.ts` (TaskManager), `taskRounds.ts`, `retry*.ts`, `worktree.ts`, `parallelRuns.ts` | Rows pumped under `maxConcurrentPerAgent`; `RunDimensions` (engine, model, effort, permissionMode, providerId, tier, variant, account, superpowers…); multi-turn tasks (M-27); retry policy (M-3) + supervisor (M-13); parallel runs on `git worktree` branches `af/` |
| Schedules / triggers / automation gate | `triggers.ts`, `automation.ts`, `kapiciTrigger.ts`, `triggerstats.ts` | Master switch · pause-until · quiet hours; preconditions `folderHasFiles · fileMissing · pathChangedWithin · queueHasWork · kapici`; frequency brakes debounce/cooldown/maxPerHour |
| Workflows | `tasks.ts`, `forEachStep.ts`, `runContext.ts`, `workflowInputs.ts`, `workflowRoles.ts`, `checkpointStep.ts`, `kapiciStep.ts`, `publishStep.ts`, `toolRun.ts`/`mediaRecipes.ts` | Steps: agent turn, media, tool (ffmpeg arg lists, no shell), browser, select, checkpoint, kapici, publish, metrics; for-each fan-out (M-40); roles (M-53); inputs incl. local-Airtable search (X-420); every step remembered (M-39); supervisor wake conditions (`workflowWake.ts`, `policyEngine.ts`); live steer/veto/constraint (`workflowLive.ts`); questions on three doors (`workflowAsk.ts`) |
| Missions | `missions.ts`, `missionMode.ts`, `missionPrimitives.ts`, `missionEvaluation.ts`, `missionFailure.ts`, `missionConversation.ts`, `missionCouncil.ts`, `missionTrace.ts`, `missionOutcomes.ts`, `plannerLaunch.ts` | Classic (team + lead per round, approval `each-round|auto`) vs adaptive (objective: successCriteria, constraints, pool, autonomy); planner = headless `claude` in the lead's folder; primitives declared once; evaluation ≠ "agent finished"; append-only trace; learned outcomes |
| A2A | `a2aNotes.ts`, `a2aTasks.ts`, `a2aMatch.ts`, `a2aStore.ts`, `a2aSupervisor.ts`, `a2aHygiene.ts`, `a2aBridge.ts` | Notes passive (matched by coordinates); tasks claimed as a **lease** (`LEASE_MS` 30 min, heartbeat with progress), `MAX_HANDOFF_DEPTH 3` → `blocked`; states `queued · claimed · running · done · failed · blocked · cancelled`; supervisor directives steer/veto/constraint |
| Work Queue / Notices / Needs | `workqueue.ts`, `notices.ts`, `noticeToQueue.ts`, `needs.ts` | Queue = user→agent capture, lanes, handle with stamp + resolution (+ answer file); Notices = agent→user, type `update/reminder/report/question` × level 1–4, question lifecycle answered/declined; Needs You = urgency list of stuck items |
| Sentry (nöbet) | `sentry*.ts` | Unattended round campaigns; pure decision (`sentryRun.ts`), leader model wakes on policy (`sentryLeaderEngine/Model/BudgetUsd`), watch for silent death, account rotation pool |
| Kapıcı (decision gate) | `src/core/kapici/*`, `kapiciBridge.ts` | `evaluate(ruleId, state)`: rule layers builtin → system (`_KAPICI`/`kapici.rulesDir`) → project (`.kapici/`); input masked + trimmed + hashed; 10-min cache; providers heuristic (local, exact) → Jev (TypeSafe API / Vercel AI Gateway / OpenRouter) → LLM (Haiku via `oneShot`); arbiter thresholds; monthly audit JSONL; per-consumer `off|shadow|on` |
| Projects | `projects.ts`, `projectContext.ts`, `projectDocs.ts`, `projectBacklog.ts`, `backlogTrack.ts`, `projectHandover.ts` | Project session protocol: brief → `--append-system-prompt-file` (Claude) or first-prompt prefix (others); backlog/tracks/handover ops |
| Fleet's own short turns | `oneShot.ts` (X-260) | Judge, pulse, quality, suggestion, summary — one controlled environment |

---

## 6. Security, guards & resource gates

| Guard | File | Where it acts | Refuses / does | Escape |
|---|---|---|---|---|
| Shell guard (X-439) | `shellGuard.ts` | `PreToolUse` on the shell tool | non-ASCII; backtick (Claude/Git Bash only — Codex's Windows shell is PowerShell); heredoc with `\` or `${` or > 20 lines; quoted literal > 600 chars | `af:allow-shell` |
| Bridge guard (B-23) | `bridgeGuard.ts`, `bridgeGuardLog.ts` | `PreToolUse` on Grep/Glob/search verbs | searching the disk for a full session id or a known short id (git hashes untouched) | `af:allow-id`; never fires on `af.js` |
| Work-area guard (B-30) | `workArea.ts` | `SessionStart` tells · `AGENT_FARM_WORKAREA` env · `PreToolUse` | writes into a retired work area (cap 8); default `${temp}/agent_farm` | `af:allow-workarea` |
| Context/quota guard (S-64) | `contextGuard.ts` | `PostToolUse` / `UserPromptSubmit` | injects CONVERGE/HANDOVER once | — |
| Permission contract (K-22) | `permissionmode.ts` | spawn | bypass label ⇒ bypass in process, or refuse | — |
| Permission lint (H1) | `permlint.ts` | audit | blanket allows, dangerous patterns, bypassed modes | — |
| Secrets vault (B2/B4) | `secrets.ts`, `secretsPanel.ts` | task env + `{secret:NAME}` | OS keychain (`agentfarm.secret.*`), metadata in globalState, per-agent scope, `farmOnly`; **never on the bridge** | — |
| Output scrubbing (X-115) | `secretScrub.ts` | task archives, test verdicts | route keys removed from what a child prints | — |
| Route keys (X-488/491/492) | `providerKeys.ts`, `routeKey.ts` | launch | key in keychain, bound to the endpoint it was given for | — |
| Route isolation (X-101) | `providerRuntime.ts` | spawn env | clears inherited `ANTHROPIC_*` / route-carrying `CLAUDE_*` | — |
| Kapıcı input masking | `kapici/input.ts`, `audit.ts` | before any call leaves | keys/tokens masked; audit keeps hash + length only | — |
| Budgets & spend | `agentFarm.budgets` (daily USD per agent or `*`, warn 80%), `budgetsUnlimited`, `mediaBudgetMonthUSD`, `runSpendCap.ts`, `sentryLeaderBudgetUsd`, `modelpolicy.ts` (downgrade at `quotaDowngradePercent` → `quotaDowngradeModel`), `quotaGuardPercent` | launch / run | hard and soft caps | — |
| Quota gates | `quotaBrake.ts`, `startRoom.ts`, `wall.ts`, `usageGate.ts` | unattended start | per-account 5h + weekly wall; one usage budget per token (no `refreshAll`) | — |
| Automation quiet hours | `automation.ts` (work) · `alertGate.ts` (sounds) | firing / alerting | separate switches | — |
| Remote | `src/remote/server/*` | phone | pinned TLS, device keys, scopes, audit, path-traversal refusal on `/res/`, hardened WS | — |
| AF's own shell hygiene | `toolRun.ts`, `agy` no-shell spawn, `jsonTemplate.ts`, hooks per-shell spelling | everywhere | payloads never inside a shell string | — |

**Sandboxing**: AF does not sandbox agents itself; it maps its permission vocabulary onto each engine's sandbox (Claude modes, Codex `sandbox_mode`, Gemini `--approval-mode`, agy `--mode`, OpenCode `--auto`/plan agent) and isolates parallel runs in worktrees. **Stale cleanup** (S-101): cancel/stop/close, never delete.

---

## 7. UI, webview & human interaction

- **Webview shell** (`panels/base.ts`): CSP `default-src 'none'`, nonce'd scripts, `style-src cspSource 'unsafe-inline'`, `img-src cspSource data:`; HTML built once, then patched by `postMessage` (`afui` config pushes, `afctx` right-click relays, clipboard round-trips). `panelAsk.ts` (X-447) asks whoever is looking (desktop window or phone).
- **Pages** (54 hosts): Console, Dashboard, Sessions, Session Viewer, Turns, Live Timeline, Tasks (+Analytics), Missions, Projects, Notices, Queue, A2A Notes/Tasks, Chains, Needs You, Now, Living, Portfolio, Engines, Accounts, Settings (+Flex), Secrets, Toolbox, Capabilities, Memory Graph, Search, Wiki, Studio (+Library, Brand), Airtable, Evals, Sound, Guide, Selection.
- **Status bar / trees**: `planUsageBar.ts` (5h + week countdown), `muteBar.ts`, `statusBar.ts`; trees in `src/views/`.
- **Shared components** (`media/`): AFTip (`afTip.js`, hover yields to the hand), AFForm (`afForm.js`), filters/query (`afFilters.js`, `afQuery.js`), `afCombo.js`, `afColFit.js` (DENSITY), `afSlashPicker.js`, `afSnippets.js`, `afSoundPop.js`, `afI18n.js` (+ `afI18n.tr.*.js`). Right-click catalogue in one file: `core/ctxmenu.ts`.
- **Slash commands** (`slashCommands.ts`, K-29): session-reported (`system:init.slash_commands`) > disk (`.claude/commands/**`, skills, workflows) > shipped fallback.
- **Human-in-the-loop surfaces**: Console ask cards + auto-answer timer, Needs You, Notices questions, workflow ask (window · Needs · Telegram buttons), phone pages, Telegram `/new`.
- **Audio / reader**: `alertVoices.ts` (which sound: session > agent > settings > default), `alertGate.ts` (mute all, quiet hours, session silent), `toneVolume.ts`, `speech.ts` (Windows `System.Speech` SAPI 5 + OneCore voices, rate −10..10), `speechLang.ts` (sense language → pick voice), `speechPhrases.ts`/`speechShapes.ts` (`sanitizeForSpeech`: code/tables by size), `askSpoken.ts` (reads the question), `soundWhy.ts` ("why didn't I hear it"), farm-wide events (U-213), `briefing.ts` (fal.ai TTS digest).
- **Language**: English is the source; `agentFarm.language` `auto`; no backlog codes in user text.

---

## 8. Daily radar comparison matrix

### 8.1 Procedure per bulletin item

1. **Classify**: engine (`claude · codex · gemini · agy · opencode · new`) × class (A–L below).
2. **Version check** vs §2.0. Newer CLI + a class in A–F ⇒ at least `verify` (re-measure with the SOP worksheet, `docs/YENI-MOTOR-EKLEME-SOP.tr.md` → "Motoru ölçme çalışma kâğıdı").
3. **Open the row's files**; check the named constants first (they are the measured claims).
4. **Gates for any user-facing change**: bridge op + `parity.manifest.json` · `RunDimensions` + 11 doors (if it is a launch dimension) · flex point (if a preference) · `settingsops.ts` (if a setting) · `t()` (if UI text) · a test pinning the new measurement.
5. **Write the candidate**: title, area, kind, priority, effort, files, acceptance (what measurement proves it).

### 8.2 Matrix

| # | When an engine release brings… | Agent Farm components to change | Notes / traps |
|---|---|---|---|
| **A — CLI invocation** ||||
| A1 | New / renamed / removed CLI flag | Claude: `consoleproto.hostArgs`, `launch.ts`, `tasks.ts spawnHeadless` · Codex: `consoleEngine.codexArgs/codexRunArgs/codexTuiArgs` · `gemini.ts` · `agy.ts` · `opencode.ts` | First vs resume vocabularies differ (Codex); `engineFlagFor` probes flags off the builders; update pinned constants |
| A2 | New output/event type or renamed field | `<engine>proto.ts` + `consoleproto.ts` reducer; files: `cliTranscripts.ts` | Fail-soft parsing; never borrow another engine's field names |
| A3 | Prompt channel change (stdin ↔ argv, `-p` semantics) | `ENGINES.promptOn/spawnShell`, `tasks.ts` argv branch, consolehost per-turn path | Wrong side hangs or sends an empty turn silently |
| A4 | System-prompt flag added (codex/gemini/agy) | Drop `*_HAS_NO_SYSTEM_PROMPT_FLAG`; `projectContext.ts`, `engineContextPrefix`; pinned-copy cache rule | Brief currently rides in the first prompt |
| A5 | Effort/reasoning flag added or vocabulary changed | `models.ts` (per-model vocab), `agentDefaults.ts`, `opencodeVariant.ts`, `agyModelArgs`, `engineTakesEffort`; flex point | Gemini has none today; agy conflicts with effort-suffixed names |
| A6 | Session-id preset / resume semantics change | `claudeNewSessionArgs/claudeResumeArgs`, `launchBinding.ts`, `resumeGate.ts`, `headlessResumeRefusal`, `reopen.ts`, `consoleRevive.ts` | A resume that silently opens a new conversation is worse than a refusal |
| A7 | Timeouts / turn limits / exit codes | `AGY_PRINT_TIMEOUT`, Gemini exit 53/42, `engineFault.ts` | Default timeouts read as broken engines |
| **B — Permissions & sandbox** ||||
| B1 | New permission mode (e.g. an auto/dontAsk-style mode) | `permissionmode.ts`, consoleproto permission choices, `CODEX_SANDBOX`, `GEMINI_APPROVAL`, `AGY_MODE`/`AGY_MODES_REFUSED`, `opencodePermissionFor`, `*ModeNote` | A label must mean the enforced mode (K-22) |
| B2 | Bypass policy / remote gate change | `permissionmode.ts` (`disableBypassPermissionsMode`), reducer auto-answer | Refuse rather than downgrade |
| B3 | Sandbox semantics (network, write roots) | `CODEX_SANDBOX`, `codexModeNote`, Gemini plan→YOLO note | Unattended engines cannot ask |
| **C — Live control & interaction** ||||
| C1 | New Claude control subtype (stream-json `control_request`) | `consoleproto` control builders + reducer, `consolehost` method, `console.*` bridge op, Console UI | `get_settings.applied` is the truth source for what is in force |
| C2 | AskUserQuestion / `can_use_tool` schema change | `consoleproto.answerAsk`, `autoAnswer*.ts`, `consoleNeeds.ts`, Telegram/phone ask surfaces | Answer key is the question text today |
| C3 | MCP **elicitation** or a new interactive request type | **Not handled anywhere (zero references)** → reducer + Console card + auto-answer policy + Needs You + remote contract event + bridge answer op | Backlog seed |
| C4 | Live model/effort/mode switching on a per-turn or ACP engine | `ENGINES.liveControls`, `ConsoleHost.setModel/setEffort` branches, `engineChangeNote` | OpenCode decision frozen in A-16 — flip only on measurement |
| **D — Protocols** ||||
| D1 | ACP version bump / capability change | `opencode.ts` (`OPENCODE_ACP_PROTOCOL`, capability gate), `opencodeacp.ts`, `opencodeproto.ts`; re-run `tools/opencode_acp_probe.js` | v2 is refused by design until measured |
| D2 | Another engine ships an ACP server mode | Generalize `OpencodeRuntime` into an engine-agnostic ACP runtime; reuse `sharedAcp`; new contract + translator; keep CLI transport as fallback | One process per extension is the memory reason |
| D3 | New ACP method (live mode, terminal capability, permission shape) | `opencodeacp.ts` handlers, `opencodeInitializeParams` (`terminal:false` today) | Unanswered agent→client requests hang the turn |
| D4 | MCP transport/auth change | `mcpProbe.ts` (stdio NDJSON / streamable HTTP), `mcp.ts`, `toolbox.ts`, `src/mcp/*` servers | Probe connects the way the CLI does |
| D5 | New hook event (e.g. PostCompact, permission/notification variants) | `hooksInstaller.ALL_HOOK_EVENTS`, `live.ts` event switch, `codexHooks.ts` event map, `syncHooksToAccounts` | Re-install hooks into every account slot |
| D6 | Hook output schema change (`additionalContext`, `permissionDecision`) | `live.ts` (`contextSignal`, `toolGuard`, `startContext`), `contextGuard.ts` delivery channel | Guards and handover signals ride on this |
| D7 | Hook trust / config format (Codex) | `codexHooks.ts`, `engineAccounts.ts` codex projection | Untrusted hook = deaf timeline |
| **E — Sessions, transcripts, processes** ||||
| E1 | Transcript location/format change | `sessions.ts`, `cliTranscripts.ts`, `opencodehistory.ts`/`opencodeharvest.ts`, `externalImports.ts`, `consolehistory.ts`, `transcriptRead.ts` | Index cost: keep incremental (`sessionStore.ts`) |
| E2 | CLI live-session registry change (`sessions/<pid>.json`) | `cliSessions.ts`, `whoami.ts`, `farm.health` twins, `consoleRegistry.ts` | Registry is per config home |
| E3 | Process model change (daemon/worker, background agents) | `processTree.ts`, `cliSessions.ts` spare filter, `interrupt.ts`, `liveWait.ts`/`turnWait.ts`, `stallJudge.ts` | Killing the visible pid may respawn a worker |
| E4 | Env published to child tools (`CLAUDE_CODE_SESSION_ID` etc.) | `service/af.ts callerIdentity`, `whoami.ts` | Claim, never credential |
| **F — Tokens, context, quota, price** ||||
| F1 | New model / new price / alias | `pricing.ts DEFAULT_PRICING` + `agentFarm.pricing`, `modelAliases`, `models.ts` catalog readers, `QUOTA_WEIGHTS`, `billing.ts` | Unpriced model = $0 + warning |
| F2 | Context-window size change (e.g. 1M tiers) | consoleproto window, `contextWindowTokens`, `codexctx.ts`, session-viewer gauge, `contextGuard` % semantics | Percent thresholds shift meaning with window size |
| F3 | Cache TTL / caching price semantics | `pricing.ts` (5-min ×1.25 vs 1-h ×2) | Largest line of a turn's cost |
| F4 | Usage endpoint / headers / OAuth change | `planusage.ts` (`USAGE_PATH`, `OAUTH_BETA`, UA), `usageGate.ts`, `accountUsage.ts`, `engineUsage.ts`, `oauthRefresh.ts` | Missing UA → 429 bucket |
| F5 | New limit windows (weekly, per-model) | `wall.ts`, `quotaWeek.ts`, `quotaView.ts`, `startRoom.ts`, `accountPolicy.ts`, handover settings | Never read one window as the other |
| F6 | Compaction behaviour / `compact_boundary` | `contextGuard.ts`, `live.ts` PreCompact; consider boundary parsing in `sessions.ts` | Boundary parsing is a gap |
| F7 | `/context` output format | `panels/sessionViewer.ts parseContextReport` | Category rows are verbatim — a new label needs no code |
| **G — Auth, accounts, env, secrets** ||||
| G1 | Config-dir env added/renamed (any engine) | `engineAccounts.ts` adapter row (`support: measured/declared/unmapped`), `slotCompleteness.ts`, `slotSettings.ts`, `keyOwnership.ts`, `credentialCarry.ts` | Promote an engine only after measuring isolation |
| G2 | Credential file/keychain move | `engines.ts` probes, `readClaudeIdentity`, `accountEvidence.ts`, `planusage.ts` credentials path | "Auth file exists" ≠ "engine works" (`engineTest.ts`) |
| G3 | Login command change | adapter `signIn` in `engineAccounts.ts` | `claude auth login`, `codex login` today |
| G4 | New backbone/provider env (Bedrock/Vertex/Foundry/gateway/proxy) | `providerRuntime.ts` patterns, `routeModels.ts`, `routeAuth.ts`, `providerCatalog/Registry/Profiles.ts`, `secretScrub.ts` | Prefix rule covers future `ANTHROPIC_*` |
| G5 | Behaviour env (system prompt, PowerShell tool, telemetry) | `engineAccounts.requiredEnv`, `slotSettings.ts`, `claudesettings.ts` | Applied before spawn only |
| **H — Instructions, skills, plugins, MCP config** ||||
| H1 | Instruction-file convention change (CLAUDE.md, AGENTS.md, GEMINI.md, `.agents/`) | `antigravity.ts`, `codex.ts`, `opencodesync.ts`, `ruleWalk.ts` (walk to nearest `.git`) | Shared constitution reach differs per engine |
| H2 | Skills/plugins/commands location | `skills.ts`, `toolbox.ts`, `slashCommands.ts`, `superpowers.ts`, adapter `sharedPaths` (`plugins`, `skills`) | Slots must share fleet installs |
| H3 | MCP config file location/shape | `mcp.ts`, `antigravity.ts` (`mcp_config.json`), codex `config.toml`, `kapiciMcp.ts` registration | — |
| **I — Terminal / TUI / shell** ||||
| I1 | TUI rendering / alt-screen / fullscreen changes | `terminalRender.ts`, `extTerminal.ts`, `shellReady.ts` | xterm.js glitches → native terminal switch |
| I2 | Engine's Windows shell tool changes (bash ↔ PowerShell) | `shellGuard.ts` (backtick rule is engine-dependent), `hooksInstaller.ts` spellings | — |
| **J — Engine-native orchestration** ||||
| J1 | Background tasks / async subagents | `liveWait.ts`, `turnWait.ts`, `stallJudge.ts`, `turnAlerts.ts` lanes, `otel.ts` subagent spans | Silence while waiting ≠ stall |
| J2 | Native multi-agent / teams / handoff / cloud sessions | Compare with missions, A2A, baton; expose as adapter capability, not a parallel control plane | Avoid duplicate orchestration |
| **K — New engine** ||||
| K1 | A new CLI agent worth supporting | SOP order: `engines.ts` → `consoleEngine.ENGINES` (exhaustive switches) → provider axis → `<engine>proto.ts` → `consolehost.ts` → `launch.ts` → `engineTest.ts` → `models.ts`/`agentDefaults.ts` → compat sync → `engineUsage.ts` → `cliTranscripts.ts`/`sessions.ts` → `live.ts`/`sessionSource.ts`/`consoleresume.ts` → RunDimensions + 11 doors + bridge + parity + engine badge | Acceptance gates and proven failure patterns are in the SOP |
| **L — Deprecations** ||||
| L1 | Engine drops a login/feature | `engines.ts` AuthMode notes, UI copy, adapter support level | e.g. Gemini Google login retired 2026-06 |

### 8.3 Known gaps — standing backlog seeds

1. MCP elicitation / new interactive request kinds: not handled (C3).
2. `compact_boundary` and compaction events not parsed from transcripts (F6).
3. No CLI-process OOM/crash signature classification beyond exit code and turn-fault kinds (§2.8).
4. ACP runtime is OpenCode-specific; no engine-agnostic ACP client; AF exposes no ACP server (§3.4).
5. Account isolation unmapped for `gemini`, `opencode`, `agy` (§2.7).
6. Gemini: no system-prompt or effort flag; agy: no image channel, no system-prompt flag (A4/A5).
7. OpenCode `session/request_permission` frame is spec-derived, never observed (§3.4).
8. Context/quota signals cannot reach Codex sessions (no `additionalContext` in its hooks) (§3.2).

### 8.4 Refreshing this DNA

Regenerate a section when `git log b4d28c91..HEAD` touches its files: §2 ← `consoleEngine.ts, consoleproto.ts, codex*.ts, gemini*.ts, agy*.ts, opencode*.ts, launch.ts, tasks.ts, permissionmode.ts, providerRuntime.ts, engineAccounts.ts, planusage.ts` · §3 ← `bridge.ts, service/af.ts, live.ts, hooksInstaller.ts, opencodeacp.ts, mcp*.ts, src/remote/` · §4 ← `consolehost.ts, sessions.ts, cliTranscripts.ts, pricing.ts, contextGuard.ts, baton*.ts` · §5 ← `missions*.ts, a2a*.ts, workqueue.ts, notices.ts, automation.ts, kapici/` · §6 ← `*Guard.ts, workArea.ts, secrets*.ts` · §7 ← `panels/base.ts, media/af*.js, speech*.ts, alert*.ts`. Update `source_version` and `source_commit` in the frontmatter.
