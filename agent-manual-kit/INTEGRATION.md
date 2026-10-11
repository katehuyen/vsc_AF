# Integration guide — Agent Manual (X-536)

For the agent that applies this kit to the Agent Farm development repository. Read `DESIGN.md` first if
you need the why; this file is the how. Everything here follows the repo's own rules
(`_REF/agentfarm-dev.md`, `docs/CONVENTIONS.md`): bridge parity, settings catalog, tests, `npm run package`
plus `npm run verify`, documentation on both sides.

Base: commit `6c634b0` (Agent Farm **3.930.0**, "v12.105"). The patch was built and tested against it.

---

## 1. What changes

`patch/CHANGED_FILES.txt` lists every path. Summary:

| Kind | Path | What |
|---|---|---|
| new | `manual/card.md` | the start card template (`{{AF}}`, `{{VERSION}}`) |
| new | `manual/map.md` | the map; `<!-- af:areas -->` and `<!-- af:playbooks -->` are filled at render time |
| new | `manual/areas/*.md` (24) | one guide per area: frontmatter (`id`, `title`, `order`, `summary`, `ui`, `keywords`, `related`) + body |
| new | `manual/playbooks/*.md` (31) | one per user intent: frontmatter (`id`, `title`, `area`, `summary`, `intents`, `keywords`, `ops`, `effect`) + steps |
| new | `manual/ops.meta.json` | area · effect · summary (· `asks` · `plan`) for all 585 ops |
| new | `manual/intents.eval.json` | 77 real requests → the guide or op that must rank top 3 |
| new | `src/service/manualQuery.ts` | zero-import reader: renderers, search (BM25 + synonyms + coverage), did-you-mean, `answerManualOp` |
| new | `src/core/manualSource.ts` | parses `manual/` (frontmatter subset, ops.meta.json) |
| new | `src/core/manualBuild.ts` | compiles source + live registry catalog → `CompiledManual` (derives metadata for undescribed ops, lists problems) |
| new | `src/core/manualStage.ts` | writes `<globalStorage>/bridge/manual.json` and the stable launcher `~/.agentfarm/af.js` + `bridge.json` |
| new | `src/core/startCard.ts` | start-card text, modes `card · line · off`, which channel carries it per engine |
| new | `src/core/manualBrief.ts` | `farm.brief`: composed from public ops through `bridge.dispatch`, 4 s timeout each |
| new | `src/core/manualGaps.ts` | the local gap log (`manual-gaps.jsonl`, bounded) |
| new | `src/core/manualInstall.ts` | the `agent-farm` skill: targets, plan, install, refresh, remove |
| new | `src/core/manualOps.ts` | registers `farm.guide`, `farm.find`, `farm.brief`, `manual.status/install/remove/gaps` and gives the built-in `farm.ops` its new answer (`answerOpsWith`); `QUIET_MANUAL_OPS` |
| changed | `src/core/bridge.ts` | unknown op → did-you-mean + listener (`onUnknownOp`), `has()`, `answerOpsWith()` (new answer for the built-in `farm.ops`, one declaration); `stageBridgeCli` stages `af.js` **and** `manualQuery.js` (`STAGED_CLI_FILES`) |
| changed | `src/service/af.ts` | loads the manual reader lazily (a lone `af.js` still drives the bridge); answers the three manual reads locally; prints markdown answers as text; bare call = start card; `find …` / `help …` / `guide …` shorthands; offline `farm.brief` message; gap log; `exitCode` instead of `exit()` after printing |
| changed | `src/core/tasks.ts` | `startCardFor?(engine)` option; per-turn engines get `<agent-farm>` card before the first prompt |
| changed | `src/core/consolehost.ts` | `setStartCard()`; `card` on a hosted per-turn/shared-ACP session; prefixed once like the brief |
| changed | `src/extension.ts` | imports; early block (manual source, command, `startCardNow`); SessionStart hook sends the card; quiet toast for manual reads; TaskManager option; late block (compile, stage, register ops, unknown-op gaps, hook detection) |
| changed | `package.json` | setting `agentFarm.agentManual.startCard` (`card` default, `line`, `off`) |
| changed | `src/core/settingsCatalog/sessions.ts` | its catalog row (group `guards`, tier `basic`, option labels) |
| deleted | `src/core/bridgeStartText.ts` | replaced by `startCard.ts` |
| changed | `test/test_bridge_start_text.js` | now checks the start card wiring |
| new | `test/test_manual_content.js` | the drift gate (metadata, references, arguments, budgets, language) |
| new | `test/test_manual_query.js` | reader units + the intents eval (top-3 ≥ 95 %, top-1 ≥ 80 %) |
| new | `test/test_manual_stage.js` | stages into a scratch home and runs the launcher like an agent, VS Code absent; a lone `af.js` still works |
| changed | `test/test_opencode_task.js` | the "continuation does not repeat the brief" check now also covers the start card |
| new | `test/test_manual_ops.js` | the ops on a real registry: replaced farm.ops, did-you-mean, brief, skills, gaps |
| new | `tools/manual_meta.js` | drafts `ops.meta.json` entries for new ops (`--write`, `--stale`) |
| changed | `tools/verify_vsix.js` | the VSIX must contain `out/service/af.js`, `out/service/manualQuery.js` and every `manual/` file |
| changed | `docs/BLUEPRINT.en.md`, `README.md` | human side: "Agent Manual" section, discovery item updated, feature line |

`manual/` ships in the VSIX automatically (`.vscodeignore` does not exclude it; `verify_vsix` now checks it).

---

## 2. Apply

**Unpack the kit outside the repository** (e.g. `~/agent-manual-kit`). Inside it, the repo's `tsconfig.json`
(default include `**/*`, `rootDir: src`) picks up `files/src/**/*.ts` and the build fails with TS6059 — measured.

```bash
git switch -c feature/x-536-agent-manual
git apply --3way ~/agent-manual-kit/patch/agent-manual.patch
```

- If the dev repo is still at `6c634b0` the patch applies cleanly (verified).
- If it has moved on, `--3way` merges what it can; resolve the rest with section 4 (every change is described by
  the code it sits next to, not by line numbers). New files never conflict.
- `files/` holds every new or changed file as it is after the patch, at its repo path. New files can be copied
  as they are. **Do not** copy a changed file over a newer version of it; merge it with section 4.

## 3. Verify

```bash
npx tsc -p ./
node test/test_manual_content.js && node test/test_manual_query.js && node test/test_manual_stage.js \
  && node test/test_manual_ops.js && node test/test_bridge_start_text.js && node test/test_bridge.js \
  && node test/test_activation.js && node test/test_settings_catalog.js && node test/test_encoding.js \
  && node test/test_parity.js && node test/test_opencode_task.js && node test/test_kapici_mcp.js
AF_NO_COMPILE=1 node test/run-all.js
npm run package && npm run verify
```

Measured in the build environment (Linux, no VS Code, no Chrome, behind a proxy): **all 764 test files run**.
The new suites: 14 + 27 + 30 + 25 assertions; `test_bridge` 984, `test_parity` 29, `test_settings_catalog` 24,
`test_encoding` 1916, `test_opencode_task` 49, `test_kapici_mcp` 26 — green. **19 files are red there, and every
one of them is red identically (same pass/fail counts) on the untouched base commit** — environment, not this
change: `test_a2a_pages`, `test_accounts_page`, `test_airtable_ext`, `test_browser_recipes`, `test_console_seat`,
`test_cpu_profile`, `test_e2e_claude_routes`, `test_e2e_console_route`, `test_e2e_task_route`,
`test_e2e_terminal_route`, `test_media_recipes`, `test_media_upload`, `test_opencodeharvest`,
`test_project_archive`, `test_run_library`, `test_run_session_id`, `test_settings_fold`, `test_sound_header`,
`test_system_config_ops`. On the development machine run the full gate yourself; a failure that is not also red on
the base commit is ours to fix.

### Live checks after install (`code --install-extension dist/vsix/agent-farm-<v>.vsix --force`, then window reload)

1. `node "$HOME/.agentfarm/af.js"` prints the start card naming that launcher.
2. `node "$HOME/.agentfarm/af.js" farm.guide` prints the map (as text, no JSON envelope, no toast in VS Code).
3. `node "$HOME/.agentfarm/af.js" find every monday at 8 run the weekly report` ranks `recurring-task` first.
4. `node "$HOME/.agentfarm/af.js" help tasks.add` prints the contract with `[run]`.
5. `node "$HOME/.agentfarm/af.js" farm.brief` names the session, agent, what waits, engines, the user's language.
6. `node "$HOME/.agentfarm/af.js" manual.status`: `derivedOps` empty, `problems` empty, `staged.command` set.
7. Close VS Code; repeat 2–4: they still answer. `farm.brief` says Agent Farm is not running.
8. Open a new Claude Code session anywhere: its start context contains the card (ask it how to reach Agent Farm).
9. Start a Gemini or OpenCode task through Agent Farm: the transcript's first prompt starts with `<agent-farm>`.
10. `manual.install` (plans) → on the user's yes `manual.install confirm=true` → `~/.claude/skills/agent-farm/SKILL.md`
    and `~/.codex/skills/agent-farm/SKILL.md` exist; `manual.remove` takes them out.

PowerShell 5.1 note: `node "$HOME/.agentfarm/af.js" ...` expands `$HOME` there too. cmd.exe users write
`%USERPROFILE%\.agentfarm\af.js`.

## 4. Change-by-change (for a repo that moved on)

**`src/core/bridge.ts`**
- `import { suggestOps } from '../service/manualQuery';`
- In `BridgeRegistry`: a private `unknownListener`, `onUnknownOp(listener)`, `has(op)`.
- `answerOpsWith(describe, handler)`: swaps the describe and handler of the registry's own `farm.ops`. **Do not**
  register `farm.ops` a second time with `{ replace: true }`: `test_parity.js` ("no op is registered twice") counts
  static declarations and fails.
- In `dispatch`, the unknown-op branch: compute `suggestOps([...this.ops.keys()], op)`, call the listener, answer
  `Unknown op "x". Did you mean a, b? Search the manual: farm.find q="…" · the map: farm.guide · N ops in all: farm.ops`
  (keep the word `farm.ops`: `test_bridge.js` expects it).
- `stageBridgeCli`: copy every file of `STAGED_CLI_FILES = ['af.js', 'manualQuery.js']` from `out/service`, and
  re-stage when any of them is missing even if the version matches.

**`src/service/af.ts`** — see the file in `files/`; the new pieces are `loadManual`, `applyShorthand`, `recordGap`,
`emit`, and the new `main` (help → bare call prints the card → shorthands → payload → local manual answer → bridge →
offline `farm.brief` sentence). Keep the old exports (`parseCliArgs`, `resolvePayload`, `executeBridgeRequest`,
`writeResponseFile`, …): `test_bridge.js` imports them.
- **The reader is loaded lazily**: `import type { CompiledManual }` only, and `manualReader()` `require`s
  `./manualQuery` on first need (null when absent). A top-level import breaks every copy of `af.js` that sits
  alone — the Gatekeeper MCP server loads the staged helper, and `test_kapici_mcp.js` copies only `af.js`.

**`src/core/tasks.ts`**
- Options interface, beside `projectContextFile`: `startCardFor?: (engine: string) => string;`
- Where the per-turn prompt is built (`engineContextPrefix(this.readContext(ctxFile))`): append
  `+ startCardPrefix(this.opts.startCardFor?.(engine.id) ?? '')` inside the same `safeResume ? '' : (…)` so a resume
  never repeats it. Import `startCardPrefix` from `./startCard`.
- `test/test_opencode_task.js` checks that expression by its source text; the patch updates its regex (and its
  name) to the new shape, so the check now also proves a continuation repeats neither the brief nor the card.

**`src/core/consolehost.ts`**
- `Hosted`: `card?: string` beside `context`.
- Class: `private startCardFor = () => ''` and `setStartCard(fn)`.
- Both places that set `context: init.resume ? undefined : this.readProjectContext(...)` also set
  `card: init.resume ? undefined : this.startCardFor(engine.id) || undefined`.
- Both places that prefix `engineContextPrefix(h.context)` become
  `if (h.context || h.card) { prompt = engineContextPrefix(h.context ?? '') + startCardPrefix(h.card ?? '') + prompt; h.context = undefined; h.card = undefined; }`.

**`src/extension.ts`** (five edits)
1. Imports: replace the `bridgeStartText` import with the manual imports (`compileManual`, `appendGap`,
   `refreshInstalled/skillTargets/skillText`, `QUIET_MANUAL_OPS/registerManualOps`, `readManualSource`,
   `afCommand/launcherDir/stageManual/StageResult`, `normalizeStartCardMode/startCardForLaunch/startCardText`,
   `CompiledManual`); add `HOOK_MARKER` to the `./core/hooksInstaller` import.
2. **Before** `const live = new LiveMonitor(`: `manualSrc = readManualSource(<extension>/manual)`, `manualVersion`,
   `let manualStaged`, `let manualHookLive = () => true`, `manualCommand()`, `startCardNow()`,
   `startCardForEngine(engine)`. They must exist before the live monitor is built (its hook callback calls
   `startCardNow`) — this placement avoids the temporal-dead-zone class of activation bug.
3. In the live monitor's `startContext`, replace `bridgeStartText(stagedBridgeCliPath(...))` with `startCardNow()`.
4. In `processBridge`'s `finish`, show the per-request toast unless `outcome.ok && QUIET_MANUAL_OPS.has(opName)`.
5. In the `new TaskManager(...)` options, beside `projectContextFile`: `startCardFor: (engine) => startCardForEngine(engine)`.
6. **At the end of `activate()`**, just before the final `onDidChangeConfiguration` listener (the registry is complete
   there): `manualNow()` (compile when the registry size changed; stage; refresh installed skills),
   `manualHookLive` (Claude: `hasOurHooks(infraDeps.userSettingsFile())`; Codex: `$CODEX_HOME/hooks.json` contains
   `HOOK_MARKER`), `consoleHost.setStartCard(startCardForEngine)`, `registerManualOps(bridge, {...})`,
   `bridge.onUnknownOp(...)` → `appendGap`, and a 3 s deferred `manualNow()`.

**`package.json`** — the `agentFarm.agentManual.startCard` schema (enum, descriptions, default `card`).
**`src/core/settingsCatalog/sessions.ts`** — its row (`group: 'guards', tier: 'basic'`, `options: { card: 'Start card', line: 'One line', off: 'Nothing' }` — `test_settings_catalog` requires a label for every value).
Then `node test/test_encoding.js` (package.json encoding gate) and `node test/test_settings_catalog.js`.

## 5. Release

Follow the usual SOP: version bump, `CHANGELOG.md` entry ("Agent Manual: agents learn to drive Agent Farm…"),
commit message in the repo's format, `npm run package`, `npm run verify`, install, reload, live checks of section 3.
The human documentation is in the patch (`docs/BLUEPRINT.en.md` → "Agent Manual", README feature line).

## 6. Keeping the manual true (add to `_REF/agentfarm-dev.md` as one rule)

> **A new or changed bridge op updates the Agent Manual in the same commit.** `node tools/manual_meta.js --write`
> drafts its `manual/ops.meta.json` entry — fix the effect, write the summary in plain English. If it changes how a
> user request is carried out, update that playbook; a new kind of request gets a playbook (two `intents`, the ops it
> uses) and a row in `manual/intents.eval.json`. `test/test_manual_content.js` and `test/test_manual_query.js` fail
> otherwise. Agent-facing text in `manual/` is English, without ticket ids.

When an agent got lost in real use: `manual.gaps` shows what it asked; fix the guide or add the synonym, and add the
request to `intents.eval.json` so it can never regress.

## 7. Next phases (not in the patch, in order of value)

1. **UI door for the skill install.** A command "Agent Farm: Teach Agents to Use Agent Farm…" calling the same
   `planInstall`/`applyInstall` (with a parity manifest entry), and a step in the first-run onboarding
   (`docs/URUNLESME_HAZIRLIKLARI/01_…`). Today it is bridge-only (`manual.install`).
2. **Measure Gemini CLI and Antigravity skill folders** per `docs/YENI-MOTOR-EKLEME-SOP` on real installs and flip
   their `measured` flag in `manualInstall.ts`. Until then they install only when named (`engines=gemini`).
3. **Claude without user-scope hooks.** The card then reaches Claude only through the skill. If that matters, add it
   to the appended system prompt file (`systemPromptFileFor`) for launches whose hook is not live — include the card
   in the context file's cache key (`contextFileName`) so pinned resumes keep identical bytes.
4. **Insights / Living row** for `manual.gaps` (e.g. "agents could not find 5 things this week").
5. **Optional MCP adapter** (`src/mcp/farm`, modelled on `src/mcp/kapici`): tools `farm_guide`, `farm_find`, `farm_op`,
   `farm_brief`, `farm_call {op, args}` — typed arguments, no shell quoting; opt-in registration like
   `kapici.mcp.register`. Same `manualQuery` underneath, so no second truth.
6. **Contract hygiene ratchet** from `FINDINGS.md`: a ratchet file counting contracts with ticket ids, Turkish, or over
   2,000 characters; it may only shrink. Move rationale from `describe` strings into code comments.
7. **Blind-agent smoke** (`test/smoke_manual_agent.mjs`, not in `npm test`): a cheap model gets only the start card and a
   fake bridge that records requests (`lib_fake_engine.js`), is given ten requests from `intents.eval.json`, and its op
   sequence is compared with the playbook's.
