# Findings — what writing the Agent Manual exposed

Writing a guide for every area means reading every contract as a caller would. These are the problems found on
commit `6c634b0` (3.930.0). None is fixed by the patch except where noted: they are in code the manual does not
own, and each is its own change. Line numbers are from `6c634b0`. Ordered by what they cost a user or an agent.

---

## 1. Contracts point agents at ops that do not exist  — high

A contract (or a refusal message) tells the agent to call an op that is not registered. An agent that follows
the instruction gets "Unknown op". With the patch it now gets a did-you-mean, but the contract is still wrong.

| Named in the contract | Real op | Where |
|---|---|---|
| `engines.providers` ("lists what is set up") | `providers.list` | `src/core/bridge.ts:740` (the shared run-dimension text, so it reaches `tasks.add`, `schedules.add`, `templates.add`, `templates.run`, `triggers.add`), `src/extension.ts:13113`, `:13180`, `:13682` (`console.switch`), and two **runtime refusals** `:24697`, `:24700` |
| `sessions.open` | `sessions.read` (or the session viewer) | `src/extension.ts:11913` (`sessions.recent`), `:13965` and `:13981` (`console.close`, the second is a runtime answer), `:15487` (`projects.tracks`), `:15786` |
| `agents.models` | `engines.models` | `src/extension.ts:25788` (`agents.create`) |
| `alerts.test` | `live.alerts.test` | `src/extension.ts:12600` (`alerts.play`) |
| `tasks.stop` | `tasks.cancel` | `src/extension.ts:12361` (`sessions.interrupt`) |
| `plan.check` | `projects.plan.check` | `src/extension.ts:14772` (`projects.plan`) |
| `sentry.policy` ("lists the fields, the operators …") | no such op; nearest are `sentry.templates` / `sentry.status` | `src/extension.ts:43940` (`sentry.start`) |

Fix: correct the names. Then make it impossible to regress: add to `test/test_parity.js` (or a new
`test_contract_refs.js`) a check that every `` `ns.verb` `` / `ns.verb lists` reference inside a `describe` or a
refusal string names a registered op, for namespaces that exist. The manual's own gate already does this for
`manual/` (`test_manual_content.js`), so the code is there to reuse. Field paths that look like ops
(`browser.recipe`, `media.projectId`, `sessions.twins` as a field of `farm.health`) need a small allow-list.

## 2. Model prompts are in Turkish  — high for a world release

The product UI is English with an i18n layer and a ratchet (`test/test_i18n_ratchet.js`), but the **prompts
sent to models** are not covered by it, and at least 15 of them are written in Turkish. An English-speaking
user's judge, dispatcher, weekly summary and command bar therefore reason in Turkish, and often answer in it.

| What | Where |
|---|---|
| quality judge (task criteria) | `src/core/tasks.ts:5548`, `:5591` |
| eval judge | `src/core/evals.ts:136` |
| quality judge (request vs output) | `src/core/quality.ts:121` |
| A/B referee | `src/core/abtest.ts:64` |
| visual judge | `src/core/judgeCompare.ts:56` |
| work dispatcher (which agent takes it) | `src/core/dispatch.ts:58` |
| natural-language command bar planner | `src/core/commandbar.ts:42` |
| memory distiller (and the `## Arşiv adayı` / `⚠ ÇELİŞKİ:` markers it writes into the user's files) | `src/core/distill.ts:87`, `:165` |
| weekly fleet summary | `src/core/summary.ts:63` |
| prompt suggestions | `src/core/suggest.ts:132` |
| identity consistency check | `src/core/pulse.ts:96` |
| insight root-cause task | `src/core/insightops.ts:87` |
| example workflow prompts | `src/core/examples.ts:63` |
| content recipes | `src/core/contentRecipes.ts:51`, `:96` |

A rough measure: 230 string-literal lines with Turkish letters across `src/` (46 in `contentRecipes.ts`, 16 in `extension.ts`); some are
legitimate (the language picker's "Türkçe", Turkish case folding in `search.transcripts`), most are prompts,
defaults or messages. Fix: prompts in English, each ending with "Answer in <user language>" from
`agentFarm.language` / `vscode.env.language` (the same value `farm.brief` reports); markers the product writes
into user files in English. Add the prompt files to a ratchet that may only shrink.

Contracts with Turkish: `alerts.nudge` ("AKILLI DÜRTME"), `alerts.read` ("CANLI DİYALOG OKUYUCU"),
`alerts.speak` ("SESLİ ANONS"), `media.record`, `media.restage` (Turkish field names of the media record),
`memory.distill` ("## Arşiv adayı"), `wiki.category.add` (a Turkish example). The manual's summaries for these
ops are English; the contracts are not.

## 3. Personal defaults ship to every user  — high for a world release

| Default | Where | Effect on a stranger's machine |
|---|---|---|
| `agentFarm.showrunner` = `"youtuber"` | `package.json:10039`, read at `src/extension.ts:4621`, `:16754`, `:26040` | workflow roles bound to nobody are given to an agent named "youtuber", which does not exist |
| built-in folders `${vault}/00_AGENT_AREA/00_OUTPUT/10_REPORT`, `…/01_CEVAPLAR`, `${vault}/01_INBOX/02_Calendar/CONTENT`, `${vault}/00_WIKI` | `src/extension.ts:17436`, `:17732`, `:17736`, `:18409`, `:18533` | one person's Obsidian layout (with Turkish folder names) is created inside every user's vault |
| last-resort legacy paths `D:\zone\know\note\obsidian\…` | `src/extension.ts:17438`, `:17733`, `:17737`, `:18407` (`LEGACY_ANSWER_DIR`) | on Windows, writes into `D:\zone\…` if nothing else resolves |

Fix: neutral defaults (`Agent Farm/Reports`, `Agent Farm/Answers`, `Agent Farm/Calendar`, `Agent Farm/Wiki`
under the vault, or under the workspace when there is no vault); `showrunner` empty = "ask / first agent"; the
legacy `D:` paths removed (migrate the author's own machine with an explicit setting instead). The manual
documents the settings, never these values.

## 4. The parity scanner misses two registrations  — medium

`discoverOps` (`src/core/parity.ts:259`) backs up from `op:` to the object's `{`, and skips a `{` preceded by an
identifier character because it might be a template `${`. A section comment right before the object —
`// ------------------------------------------------ notes` — ends in a word, so the brace is skipped and the
scanner attaches the op to the wrong object. Result: `a2a.notes.post` (`src/core/a2aBridge.ts:180`) and
`a2a.tasks.add` (`:280`) are **not seen by the parity gate** (their UI twins are not checked and their handlers
are not classified). The manual's content test works around it with a second regex.

Fix: in the back-up loop, ignore characters inside line and block comments (`scanCode` already knows how), or
only treat `{` as `${` when the previous character is `$`. Add a test with a comment line before an op.

## 4b. A source-text gate that cannot see a multi-line import  — low (fixed by the patch)

`test/test_whoami.js` guards the rule "af.ts imports nothing but node built-ins (it is copied out alone)" with
`/^import .* from '…';/gm` — one line only. The first version of this change imported the manual reader in a
multi-line `import { … } from './manualQuery'` and the gate stayed green while the rule was broken (a lone af.js
could no longer load: `test_kapici_mcp.js` caught it). The patch loads the reader lazily and widens the regex to
`/^import\b[^;]*? from '…';/gm`. Other source-text gates with `.*` on one line may share the blind spot.

## 5. Contract hygiene  — medium (cost for every agent, every call)

| | count |
|---|---|
| contracts over 2,000 chars | 27 (`tasks.add` 14,426 · `workflows.add` 9,355 · `missions.start` 8,239 · `console.start` 7,489 · `triggers.add` 6,287 · `sessions.start` 6,229 · `schedules.add` 5,668 · `sentry.start` 5,311 · `templates.run` 5,138 · `templates.add` 5,038) |
| contracts with ticket ids | 264 of 578 |
| contracts with `‼️` | 243 of 578 |
| contracts without an `args:` section | 29 |
| total | 458,416 chars ≈ 114,600 tokens |

The contracts mix three audiences: the caller (arguments, defaults, refusals), the maintainer (why, incidents,
tickets) and the reviewer (emphasis). With the manual, callers mostly read the summary and the playbook, but the
contract is still what `farm.ops op=<name>` shows. Fix, gradually: the rationale moves to a code comment above
the registration; the contract keeps "what it does · args · defaults · refusals · what it answers". A ratchet
(`test/contract_hygiene.ratchet.json`: chars over 2,000, ticket ids, `‼️`, Turkish) that may only shrink keeps
new ops clean without a big-bang rewrite.

## 6. Argument names differ for the same idea  — medium

| Idea | Names in use |
|---|---|
| search text | `q` (`sessions.find`, `prompts.list`, `settings.list`, `toolbox.list`, `toolbox.slashCommands`) · `query` (`memory.ask`, `media.find`, `search.transcripts`, `performance.summary`, `workflows.add`) |
| the agent | `agent` (41 contracts start with it) · `agentId` · `agentName` in places |

Agents generalise from one op to the next; a mismatch is a refusal or, worse, a silently ignored argument.
Fix: accept both spellings of the search argument everywhere (an alias in the registry's argument parsing),
document one (`q`). The manual's playbooks always use each op's real name (the content gate checks it).

## 7. Every bridge request shows a toast  — medium (noise)

`processBridge` (`src/extension.ts:19867–19874`) shows `Agent Farm bridge: <op> — ok` for every request. Agents
read a lot; a session that orients itself would pop a dozen toasts. The patch makes the manual's own reads quiet
(`QUIET_MANUAL_OPS`). Next step: quiet every successful op whose `effect` is `read` in `manual/ops.meta.json`
(the compiled manual is in scope there), and keep the toast for writes, runs, destructive ops and failures.

## 8. The start text pointed at a path that is not stable  — fixed by the patch

`bridgeStartText` (X-505) gave the staged `af.js` under `<globalStorage>`, which differs per OS and per VS Code
flavour and is what personal rule files had to spell out per platform. Replaced by the stable launcher
`node "$HOME/.agentfarm/af.js"` (DESIGN §5).

## 9. Tests that fail on Linux on the untouched base  — low (environment)

In the build container (Linux, UTC, no Chrome) four suites fail identically on `6c634b0` with and without the
patch: `test_a2a_pages`, `test_accounts_page`, `test_airtable_ext`, `test_browser_recipes`. They pass on the
author's Windows machine, so they assume a platform (path separators, a time zone, a local Chrome). Worth making
portable before CI runs on Linux or macOS, which a world release needs.

## 10. Smaller things noticed

- `memory.ask` takes `query` while `sessions.find` — the op agents most often reach for first when they search —
  takes `q`; an agent that learned one passes the other (see §6).
- `memory.index.fix` only acts with `apply=true`; its contract says so late. `plan` in `ops.meta.json` now
  surfaces it as "plans first" on the op page; 35 ops have such a flag.
- `farm.health` reports `sessions.twins`, `sessions.leftovers`, `sessions.revived` as fields; written with
  backticks they read like op names. Calling them "fields" in the contract avoids the confusion.
- The bridge falls back to a 30 s poll when `fs.watch` misses an event (`src/extension.ts:19890`); on network
  drives and some sync folders that is the normal path. The CLI's default timeout is 20 s
  (`src/service/af.ts`, `AGENT_FARM_BRIDGE_TIMEOUT`), shorter than the poll, so there a request can be withdrawn
  as `unclaimed` while VS Code is running. A 5 s poll, or a CLI default above 30 s, closes the gap.
