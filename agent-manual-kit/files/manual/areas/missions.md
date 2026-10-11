---
id: missions
title: Missions — a lead agent and a team working toward a goal
order: 8
summary: Start a mission where a lead plans in rounds and delegates to a team (or a pool) until a goal or success criteria are met, within hard limits.
ui: Missions view in the sidebar; "Agent Farm: Missions", "Agent Farm: New Mission…"
keywords: [mission, team, crew, squad, lead, leader, orchestrate, delegate, goal, until done, success criteria, adaptive, rounds, budget, council, debate, multi-agent]
related: [tasks, workflows, a2a, relay, projects]
---
# Missions

## Model
A **mission** gives a goal to a **lead** agent. Each round the lead (a planner that always runs on Claude Code and does no work itself) decides: delegate tasks to team members, finish, ask the user, or abort. Delegations are ordinary headless runs on any engine. The run stops when the lead finishes, the user cancels, or a limit is hit. Two modes:
- **classic** (default): `goal`, `lead`, `team=[{agent, role?, model?, engine?, effort?, permissionMode?, account?}]`.
- **adaptive** (`mode=adaptive`): an outcome instead of a recipe: `successCriteria=[{id, text, required?}]`, optional `constraints`, `pool` (who it may draw on; `poolScope=selected` to restrict to exactly them), `autonomy` (ask-when-unsure or decide-alone). The lead may be omitted. The run is judged against the criteria, so "work until X is true" belongs here.

## Limits (set them all; 0 means unlimited on that axis)
`maxRounds`, `maxTasks`, `maxCostUSD`, `maxTokens` (the brake that still works on engines that state no price), `maxMinutes`, `maxParallel`. `approvalMode=each-round` makes the user approve every round's plan; `auto` runs on, still asking when the lead chooses to ask. A mission has no cost optimisation: limits are hard ceilings only.

## Common intents
- Team toward a goal: playbook team-mission. Always `missions.preview` with the exact arguments first; it returns every refusal without starting anything.
- Follow: `missions.status id=<run>` (rounds, steps, budget, criteria verdicts, pending question), `missions.list`, `missions.trace` (adaptive journal).
- It is waiting on someone: `missions.answer id=<run> answer="..."`, `missions.approve id=<run> ok=true`.
- Steer an adaptive run: `missions.guide` (reaches the lead at its next planning step).
- Pause, resume, cancel: `missions.pause`, `missions.resume`, `missions.cancel`. Again from scratch: `missions.rerun`.
- See its sessions: `sessions.page mission=<run>`.

## Rules
- Delegations write files: two writers never share a folder at once; reviewers and researchers should use `permissionMode=plan`.
- A small clear goal deserves one round and one delegation. Do not inflate team or limits.
- Filing: pass `project` or the window's active project is used.
