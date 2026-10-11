---
id: agents
title: Agents — the fleet, its instructions, defaults and duties
order: 2
summary: List and create agents, set per-engine defaults, manage standing duties, sync instructions to other engines, packs.
ui: Agents view in the Agent Farm sidebar; Agent Detail page (right-click an agent); "Agent Farm: Open Agent Portfolio"
keywords: [agent, fleet, roster, create agent, new agent, defaults, model default, duties, DUTIES.md, watch, superpowers, pack, export agent, import agent, AGENTS.md, CLAUDE.md, sync engines]
related: [automation, memory, toolbox, engines, accounts]
---
# Agents

## Model
An **agent** is a folder under one of the configured agent roots that holds its instructions (`CLAUDE.md`, plus generated `AGENTS.md` copies for other engines), `memory/` and optionally `DUTIES.md`. Any engine can run any agent. Ops take an agent by name or id; get the real names from `agents.list` and never invent one.

## Common intents
- Who exists: `agents.list` (id, name, folder, active now, sessions).
- New agent: `agents.create name=<folder-name> mission="<one sentence: what it is for>"` (root from `agents.roots` when there are several). Then optionally `agents.defaults.set` and duties. Playbook create-agent.
- What an agent runs on by default: `agents.defaults agent=<a>` (per engine: model, effort, sign-in, and where each comes from). Change with `agents.defaults.set agent=<a> engine=<e> model=<m> effort=<x> account=<slot>`.
- Last launch of an agent: `sessions.lastLaunch agent=<a>`.
- Standing duties ("keep watching X, do Y"): `duties.add` then make it actually fire with `duties.automate` (watch trigger) or a schedule. A duty without an automation only runs while the agent is already running. Playbook standing-duty.
- Other engines read `AGENTS.md`, not `CLAUDE.md`: after changing an agent's `CLAUDE.md` or `DUTIES.md` run `agents.sync agent=<a>`; after changing a shared root `CLAUDE.md` run `constitution.sync` then `agents.sync` per agent.
- Engineering discipline (Superpowers skills) by default: `superpowers.set agent=<a> on=true`.
- Move or share an agent: `agents.pack.export` / `agents.pack.import`; `packs.gallery` lists packs on offer.

## Rules
- Never write an agent's files to change Agent Farm state; use the ops. Editing an agent's own instructions is fine when the user asks for it, then run `agents.sync`.
- `agents.roots.remove` and `agents.exclude` hide agents from the farm without touching folders; tell the user that.
