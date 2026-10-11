# Kapıcı — the Decision Gate

Agent Farm shows it to users as **Gatekeeper**; ops (`kapici.*`), settings (`agentFarm.kapici.*`) and rule folders keep `kapici`.

Agent Farm's gate for **narrow, repeated judgments inside automation** (is there work? which agent? retry or park? does the chain go on?). It answers typed questions — `noul` (yes/no), `choice`, `score` — from a **rule**, asking providers in order: `heuristic` (local checks, never sent anywhere) → `jev` (a small classifier; needs its key) → `llm` (the judge model; slow, costs a model call). It is an **add-on**: every consumer is off by default and nothing breaks without a key or a rule.

## When to use it — and when not

- **Use** for a cheap, repeatable decision a script would otherwise guess or a model would be woken for. Prefer a rule (`kapici.eval`) for anything asked twice; `kapici.ask` is for one-offs.
- **Do not** send counting, numbers or dates to a model — a `check` (`empty · regex · num · date · lines · chars`) answers them locally.
- **Do not** leave a security or irreversible decision to Kapıcı alone.
- **Never** send raw transcripts, whole logs or secrets. Prune to the part that decides; mark private content `sensitive: true` (it never leaves the machine).

## How to call it

VS Code must be open — Kapıcı answers only through Agent Farm, so its key never leaves it.

| Way | What |
|---|---|
| Bridge (`_REF/bridge.md`) | `kapici.eval {rule, state \| statePath, criteria?, project?, noCache?}` · `kapici.ask {state \| statePath, questions, providers?}` · `kapici.rules` · `kapici.rule.check {rule}` · `kapici.audit` · `kapici.status` |
| MCP (any Claude Code session) | tools `kapici_eval` · `kapici_ask` · `kapici_rules`, same arguments; a relative `statePath` is taken from the session's folder. Given to agents only when the user asks: Farm Settings ▸ Kapıcı ▸ **Give agents the MCP**, or `kapici.mcp.register` (`kapici.mcp` reads the state, `.unregister` takes it back). A session started after that gets the tools. |

A verdict never throws for a missing key or rule: it carries `fallback` and the reason. Read `decision` + `confidence`, not only `passed`.

## The four consumers — switched by the user, not by you

`agentFarm.kapici.dispatch` (routing incoming work) · `.retry` (a held retry) · `.trigger` (a trigger's precondition `{kind:"kapici", rule?, input?: "file" | "diff"}`) · `.workflow` (a Kapıcı step `{kapici:{rule, input?, onReject?}}`). Each is `off | shadow | on`, **default off**. `off` = today's path exactly. `shadow` = today's path decides, Kapıcı answers beside it and is audited. `on` = a confident verdict decides; a failure takes the rule's `onFailure`. The shadow agreement per consumer is in Farm Settings ▸ Kapıcı and in `kapici.audit`. Switching a consumer to `on` changes behavior — it is the user's decision (Principle 2): propose it with the agreement figure, do not flip it.

## Writing a rule

One JSON file per rule, in `<agent root>/_KAPICI/` or the folder `agentFarm.kapici.rulesDir` names; a project's `.kapici/` wins over both; a file with a shipped rule's id replaces it. The template is any shipped rule in `src/core/kapici/builtinRules.ts`; the loader's refusal names the first thing wrong (`kapici.rules` lists broken files with the reason).

- Fields: `id` (`area.name`), `version` (bump on every change — the audit records which one decided), `description` (the decision, one line), `questions`, `decide` (`actionFrom` · `passIf` · `rejectIf` · `scoreMin`), `minConfidence`, `onLowConfidence` (`escalate · mechanical · ask`), `onFailure` (`open` passes · `closed` stops · `fallback` = the caller's own path), `golden`, optional `providers`, `sensitive`, `inputBudgetChars`, `timeoutMs`.
- **Questions in English; one narrow judgment per question.** Two judgments = two questions, combined in `decide`.
- **Golden examples are mandatory** (5–10 `{state, expect}`), and a new or changed rule is checked with `kapici.rule.check` before anyone relies on it. Each example is a real call — Jev is billed per token; say so before running a large set.
- Choose `onFailure` for the day there is no key: a gate that must not block work is `open` or `fallback`; `closed` only where stopping is safe.

## The key

Secret vault, **Farm only** ticked: `TYPESAFE_API_KEY` (TypeSafe road), `AI_GATEWAY_API_KEY` (Vercel road — its free credit does NOT cover Jev: HTTP 403) or `OPENROUTER_API_KEY` (OpenRouter road — the one that answers today, from existing credit); another name → `agentFarm.kapici.keyName` (a name containing openrouter/vercel/gateway picks its road on `route: auto`). `kapici.status` says present/missing by name, never the value. Without it every question goes down its rule's failure path. On a new machine the key is re-entered by the user (`_REF/machine-setup.md`).
