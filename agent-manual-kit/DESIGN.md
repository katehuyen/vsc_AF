# Agent Manual — design

How agents learn to drive Agent Farm: what exists, where it is, how to use it and how not to — so that a
user's spoken request ("run this every morning at 9", "start a baton chain on this", "build a team led by
this agent until the tests pass") is carried out with the right mechanism, on the first try, by any engine.

All numbers below were measured on commit `6c634b0` (Agent Farm 3.930.0) with the live registry catalog
(578 ops before this change, 585 after). "Tokens" are characters ÷ 4.

---

## 1. The problem, measured

**How an agent learned Agent Farm before.** One sentence at session start (X-505, `bridgeStartText`):

> Agent Farm bridge: run node "<globalStorage>/bridge/af.js" <op> [@args.json] from the shell … farm.ops lists every op.

So everything an agent knew beyond "there is a command" had to come from `farm.ops`:

| | measured |
|---|---|
| ops in the registry | **578** |
| `farm.ops` answer (every `describe`, concatenated) | **458,416 chars ≈ 114,600 tokens** |
| largest contracts | `tasks.add` 14,426 chars · `workflows.add` 9,355 · `missions.start` 8,239 · `console.start` 7,489 · `triggers.add` 6,287 |
| contracts over 2,000 chars | 27 |
| contracts carrying a ticket id (`X-231`, `M-53` …) | 264 |
| contracts carrying `‼️` emphasis | 243 |
| contracts with Turkish words | 8 |

What that means for an agent:

1. **It cannot read the catalog.** 115K tokens is more than many engines' whole working budget, and every
   agent that tries pays for it again. In practice agents guess op names, or call `farm.ops` and lose the
   thread.
2. **The contracts answer "what does this op do", never "which op do I need".** A user says *"every Monday
   at 8"*; nothing maps that to `schedules.add` rather than `triggers.add`, `duties.add`, `workflows.add` or a
   mission. Choosing between 13 overlapping mechanisms (task, session, schedule, trigger, workflow, mission,
   baton relay, parallel runs, sentry campaign, notice, work queue, A2A, duty) is exactly the expert knowledge
   that was missing.
3. **The contracts are written for the developer.** Rationale, ticket history, incidents and emphasis are
   interleaved with the arguments. Useful in the code; noise for a caller.
4. **The path is not stable.** `<globalStorage>` differs per OS and per VS Code flavour (Code, Insiders,
   Cursor, VSCodium, Windsurf …); the user's own rule files had to spell it out per platform.
5. **The knowledge lived in the user's personal rules** (`info/KURALLAR/_REF/*.md`, ~70 KB on the bridge,
   A2A, missions, queue, notices, duties, sessions …). End users of a world release will not have them. The
   product must carry its own manual.

## 2. Goals and non-goals

Goals
- An agent picks the right mechanism for any common request in **≤ ~3–4K tokens** of reading.
- Works for **every engine** Agent Farm runs (Claude Code, Codex, Gemini CLI, Antigravity, OpenCode) and for
  any agent with a shell, inside or outside Agent Farm, **with VS Code closed**.
- **Cannot drift** from the code: the build fails when an op, argument or reference is wrong.
- **Reports its own blind spots** (what agents asked for and did not find).
- English only; no ticket ids; no personal paths, names or habits.
- Same truth for agents and people: the human-facing Blueprint describes the same system.

Non-goals (now)
- Rewriting the 578 contracts. They stay the authoritative reference; the manual sits on top of them.
- An MCP server. Planned as an adapter on the same reader (INTEGRATION §7.5), not a second truth.
- A natural-language executor. The agent still decides and calls ops; the manual makes it competent.

## 3. Architecture: five layers, read top-down, each one call away

```
L0  start card   ~300 tokens   who/what/how to call, 5 rules        (delivered automatically)
L1  map          ~2.7K         method, calling, effects, "pick the mechanism", words, areas, playbooks
L2  playbooks    31, median ~500     one per user intent: steps, ops, pitfalls
    areas        24, median ~1.2K    one per feature area: concepts, UI names, every op of the area
L3  op contract  median ~430, p90 ~690  the live describe + effect + playbooks that use it
    ops index    ~2.7K         every op name grouped by area
L4  live brief   farm.brief    who am I, my agent, what waits for me, fleet, engines, user language
```

A typical journey — *"every day at 9 run the morning briefing"* — is card → `farm.find` → playbook
`recurring-task` → contract of `schedules.add`: **3,055 tokens, against 114,604 for the dump** (37× less), and
the agent has the steps and the pitfalls, not only the arguments.

```
                      manual/ (markdown + ops.meta.json, in the VSIX)
                                     │ readManualSource
 live BridgeRegistry.catalog() ─────►│ compileManual  (manualBuild.ts)
                                     ▼
                               CompiledManual ──► stageManual ──► <globalStorage>/bridge/manual.json
                                     │                              ~/.agentfarm/af.js + bridge.json
                                     ▼
          registerManualOps: farm.guide · farm.find · farm.ops · farm.brief · manual.*
                                     │
     ┌───────────────┬───────────────┴─────────────┬───────────────────────────┐
  SessionStart hook   first prompt of a per-turn     agent-farm Agent Skill      af.js answers manual
  (Claude, Codex)     engine run by Agent Farm       (~/.claude, $CODEX_HOME)    reads locally, offline
       card               <agent-farm>card              name+description            no VS Code needed
```

## 4. Content model

`manual/` is plain markdown with a small frontmatter, so it diffs, reviews and translates like any doc.

- `card.md` — the start card template (`{{AF}}` = the command, `{{VERSION}}`). Hard budget 1,600 chars.
- `map.md` — the map. `<!-- af:areas -->` and `<!-- af:playbooks -->` are filled at render time from the
  frontmatter, so adding a guide never means editing the map.
- `areas/<id>.md` — `id, title, order, summary, ui, keywords, related` + body: concepts, where it is in the UI,
  how agents use it, how not to.
- `playbooks/<id>.md` — `id, title, area, summary, intents (≥ 2 real phrasings), keywords, ops, effect` + steps,
  example calls, pitfalls.
- `ops.meta.json` — per op: `area`, `effect`, `summary` (≤ 160 chars, plain English), optional `asks` (the op
  itself opens a confirmation dialog) and `plan` (the flag that turns a preview into an act: `confirm=true`,
  `dryRun=false`, `apply=true`).
- `intents.eval.json` — 83 requests phrased the way agents phrase them, each with the guide or op that must
  come up.

**Effects** are the safety vocabulary every op page shows: `[read]` changes nothing · `[write]` changes Agent
Farm state · `[run]` starts a paid agent/model run (only on the user's request) · `[destructive]` stops,
cancels, deletes or overwrites (confirm intent first) · `[ui]` only shows something. Distribution over 585
ops: read 229, write 250, run 43, destructive 56, ui 7; 3 ops ask the user themselves; 35 plan first.

**Compilation** (`manualBuild.ts`) merges the source with the *live* registry catalog at activation. An op
with no metadata is never missing: it gets a derived entry (area from its namespace, effect from its verb,
summary from its contract's first sentence) and is listed in `manual.status → derivedOps`. The content gate
fails the build on any derived op, so this fallback only protects users from a release that slipped.

**"Pick the mechanism"** — the table in the map that turns the 13 overlapping mechanisms into one decision:

| The user wants | Use |
|---|---|
| a job done now, unattended | task |
| to talk with / watch an agent | Console session |
| something at a time, repeatedly | schedule |
| something when a file, hook or webhook fires | trigger |
| fixed steps, each by an agent, output passed on | workflow |
| a team under a lead until a goal is met | mission |
| long work across quota/context limits | baton relay |
| variants side by side | parallel runs |
| a backlog worked through unattended | sentry campaign |
| to hear from the agent | notice |
| to drop work for later | work queue |
| one agent handing work to another | A2A task/note |
| an agent that keeps watching something | duty + automation |

## 5. Delivery: how the card reaches each engine (and only once)

| Who | Channel | When |
|---|---|---|
| Claude Code (any session on the machine) | SessionStart hook `additionalContext` | Agent Farm's user-scope hooks installed |
| Codex | SessionStart hook in `$CODEX_HOME/hooks.json` | Agent Farm's hook installed |
| Gemini, Antigravity, OpenCode, any per-turn engine Agent Farm launches (task, schedule, trigger, workflow, mission, Console) | `<agent-farm>…</agent-farm>` before the first prompt | launch is not a resume |
| Claude/Codex launched by Agent Farm without a live hook | the same prompt prefix | hook not detected |
| Claude Code, Codex, OpenCode (skill-aware) | `agent-farm` Agent Skill | after `manual.install confirm=true` |
| Any agent with a shell, anywhere | `node "$HOME/.agentfarm/af.js"` with no args prints the card | always |

`startCardForLaunch(engine, card, hookLive)` decides per launch: a hooked engine with its hook live gets no
prefix, so the card is never delivered twice. The prefix is added only when the run is not a resume, so a
resumed session keeps byte-identical prompts (prompt cache). The setting `agentFarm.agentManual.startCard`
(`card` default · `line` one sentence · `off`) applies to every channel.

**The stable launcher.** `~/.agentfarm/af.js` is a small forwarder that reads `~/.agentfarm/bridge.json`
(`af`, `bridgeDir`, `manual`) and runs the staged `af.js`. The command an agent is given is therefore the same
on every OS and every VS Code flavour — `node "$HOME/.agentfarm/af.js"` (PowerShell expands `$HOME` too) —
and survives updates. `AGENT_FARM_HOME` moves it. It is rewritten only when its content hash changes.

## 6. The bridge surface

| Op | Effect | What |
|---|---|---|
| `farm.guide [id=…]` | read | the map; with `id` a playbook, an area (plus every op of it), or an op contract |
| `farm.find q="…"` | read | ranked playbooks, areas and ops for a request in plain words |
| `farm.ops` | read | **new answer** (same op, `answerOpsWith`): the compact index by area; `op=<name>` one contract; `area=<id>`; `full=true` the old `[{op, describe}]` array for tools that parse it |
| `farm.brief` | read | live state about the caller, composed from public ops (`sessions.whoami`, `agents.list`, `now.get`, `notices.list`, `queue.list`, `a2a.status`, `engines.status`, `projects.current`, `automations.status`), 4 s timeout each |
| `manual.status` | read | version, staged paths, command, start-card mode, derived ops, problems, skills |
| `manual.install` | write | plans the skill install; writes only with `confirm=true` |
| `manual.remove` | destructive | removes Agent Farm's skills, keeps foreign ones |
| `manual.gaps [clear=true]` | read | what agents asked for and did not find |

**Local answering.** `af.js` answers `farm.guide`, `farm.find` and `farm.ops` itself from the staged
`manual.json` — no round trip, no VS Code needed, no toast. Every other op goes through the bridge as before.
`farm.brief` with VS Code closed says so and points back to the manual.

**Shorthands** for agents: `find <words…>`, `help <op>`, `guide <id>`. Markdown answers print as text, not as
a JSON envelope (`--raw` keeps the envelope).

**Unknown ops** are refused with a did-you-mean (edit distance + namespace + shared words):
`Unknown op "tasks.ad". Did you mean tasks.add? Search the manual: farm.find q="tasks ad" · the map: farm.guide`.

**Quiet reads.** Every bridge request shows a VS Code toast today. The manual reads would make that noise
constant, so successful reads in `QUIET_MANUAL_OPS` skip the toast; writes and failures still show it.

## 7. Search

`farm.find` is the step that turns "what the user said" into "which guide". It is deliberately boring:

- **BM25** (k1 1.2, b 0.5) over title, intents, keywords, op names, summary and body, with field weights.
- **Light stemming** (schedule/schedules/scheduled/scheduling meet; running/run; stopped/stop).
- **Domain synonyms** (~110) and a small stop-word list: *daily, every, weekly, cron, morning* → schedule; *team, lead, until, goal* →
  mission; *relay, chain, overnight, marathon* → baton; *watch, webhook, folder, arrives* → trigger …
- **Kind boost**: playbook 1.35, area 1.1, op 1.0 — an intent should land on the guide first, the op second.
- **Name coverage**: hits whose name covers most query words are lifted (×1.6 / ×1.15); an exact op name
  typed in full is first.
- **Weak detection**: if the best hit covers under half the query and is not an exact name, the answer says
  "weak matches" and the query is written to the gap log.

Result on the 83-request eval (including the six requests the product owner gave as examples): **top-3 83/83, top-1 73/83**. The gate is top-3 ≥ 95 % and top-1 ≥ 80 %.
Off-topic queries ("banana smoothie recipe", "quantum entanglement") are called weak.

Why not embeddings: zero dependencies, offline, deterministic, explainable in a failing test, cheap to
re-run on every build; the corpus is ~640 small documents, where lexical search with domain synonyms is as
good as it gets and every miss is fixable by a sentence.

## 8. Drift prevention

| Gate | Fails when |
|---|---|
| `test/test_manual_content.js` | a registered op has no `ops.meta.json` entry · an entry names an op that no longer exists · a summary is not 15–160 chars, carries a ticket id, `‼️` or Turkish · `plan` is not one `flag=value` · any `` `op key=…` `` in the manual names an unknown op or an argument its contract does not mention · a JSON example does not parse or names a wrong op/arg · a `farm.guide id=…` or "playbook x" reference is dangling · a playbook has < 2 intents · a related area is missing · the card, map, an area or a playbook is over budget (1,600 / 13,000 / 11,000 / 6,500 chars) · the map misses an area or playbook |
| `test/test_manual_query.js` | the eval drops under top-3 95 % / top-1 80 %, or nonsense is answered with confidence |
| `test/test_manual_stage.js` | the launcher, offline answers, shorthands, did-you-mean, gap log or start-card channels break |
| `test/test_manual_ops.js` | the bridge surface (new `farm.ops` answer, brief, skill install/remove, gaps, quiet set) breaks |
| `tools/verify_vsix.js` | the VSIX lacks `af.js`, `manualQuery.js` or any `manual/` file |
| dev rule (INTEGRATION §6) | — the human part: a new op updates the manual in the same commit; `tools/manual_meta.js --write` drafts it |

The content gate finds ops statically (parity's `discoverOps` plus a fallback regex for the two registrations
it misses — FINDINGS §4), so it runs without VS Code.

## 9. Feedback: the gap log

`<bridgeDir>/manual-gaps.jsonl` (bounded to 500 lines, local only, never sent anywhere) records two things:
an **unknown op** an agent called (with the suggestions it got), and a **weak search** (the query). `manual.gaps`
summarises them by frequency. This is how the manual learns from real use: fix the guide or add the synonym,
then add the request to `intents.eval.json` so it can never regress.

## 10. The Agent Skill

Skill-aware engines index a skill by its `name` and `description` and load the body when relevant — a free,
always-present pointer to the manual. `manual.install` plans per target: `create · update · same · via`
(OpenCode reads Claude's skills folder) `· foreign` (a skill of the same name the user wrote: never touched) ·
`unmeasured` (Gemini CLI `~/.gemini/skills`, Antigravity `~/.gemini/antigravity/skills` — folder conventions
not yet verified on real installs; installed only when named explicitly). Ours carry a managed marker so
refresh and remove only ever touch Agent Farm's own files. Installed skills are refreshed on activation when
the text changed. Nothing is written into another tool's home without the user's yes.

## 11. Decisions and the alternatives not taken

| Decision | Alternative | Why |
|---|---|---|
| Layered manual, read on demand | one big document in every system prompt | 115K tokens; paid on every session; invalidates prompt caches; stale the day an op changes |
| Shell command first, MCP adapter later | MCP server as the primary door | X-505 measured that not every engine/account/route sees MCP servers; the shell works everywhere. An adapter on the same reader is planned (typed args, no quoting) |
| Human-written summaries + playbooks | generate guides from contracts | the contracts answer "what", never "which"; generated text inherits the noise. Derivation stays as a safety net only |
| Lexical search + synonyms | embeddings / vector store | offline, zero deps, deterministic, testable; corpus is small |
| Card once at start, rest on demand | card in every prompt | tokens and cache stability |
| New answer for `farm.ops`, keep `full=true` | add a new op, keep the dump | agents already call `farm.ops` first; the default should be the useful answer. Tools that parse the array pass `full=true` |
| Answer reads inside `af.js` | every read over the bridge | works with VS Code closed, instant, no toast; staleness bounded because the manual is restaged from the live catalog on every activation (hash-checked) |
| Stable `~/.agentfarm/af.js` | the globalStorage path | one command on every OS and VS Code flavour; survives updates |
| Knowledge in the product | the user's personal `_REF` rules | end users do not have them; personal rules may still add personal preferences on top |
| Skill install behind plan + confirm | install skills automatically | it writes into other tools' configuration in the user's home |

## 12. Safety

- Effects and `asks`/`plan` are on every op page and in the index, so an agent sees `[destructive]` or `[run]`
  before calling.
- The card's rules: act through the command, never edit Agent Farm's files or read its data on disk; read the
  contract before any write; `[run]` only on the user's explicit request; a timeout with `state: running` is
  not a failure — never repeat a mutating op.
- Playbooks name the read-back step (`tasks.get`, `schedules.list`, `missions.status` …) and the preview step
  where one exists.
- The gap log and the brief stay on the machine.

## 13. Numbers at a glance

| | value |
|---|---|
| start card | ~300 tokens (1,156 chars) |
| map | ~2,700 tokens |
| ops index | ~2,700 tokens |
| playbooks | 31 · median ~500 · max ~850 tokens |
| areas | 24 · median ~1,200 · max ~2,300 tokens |
| op page | median ~430 · p90 ~690 · max ~4,000 (`tasks.add`) |
| typical journey | ~3,050 tokens (vs ~114,600) |
| ops with metadata | 585 / 585 |
| eval | top-3 83/83 · top-1 73/83 |
| new tests | 14 + 27 + 30 + 25 assertions; `test_bridge_start_text` rewritten (9) |
