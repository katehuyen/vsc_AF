---
id: team-mission
title: Build a team under a lead agent to reach a goal (mission)
area: missions
summary: Start a mission where a lead agent plans and delegates to a team (or a pool) until the goal or success criteria are met, within hard limits.
intents:
  - set up a team led by the architect with the coder and the tester and work until the feature is done
  - have these agents work together on this goal
  - let the manager coordinate the others until all tests pass
  - form a squad to research and write the report
  - keep working until these criteria are met
keywords: [team, mission, lead, leader, squad, together, coordinate, goal, until, criteria, multi-agent, orchestrate]
ops: [agents.list, missions.preview, missions.start, missions.status, missions.answer, missions.approve, missions.cancel, missions.guide]
effect: run
---
## Ask only if missing
The goal (or the conditions that mean "done"), the lead, the team members (or "anyone in the fleet"), and limits the user accepts (money, time, rounds). Offer sensible limits if the user gave none and get a yes.

## Choose the mode
- The user describes the work and who does it → **classic**: `goal`, `lead`, `team`.
- The user describes an outcome ("until all tests pass", "until the report covers A, B and C") → **adaptive**: `mode=adaptive`, `successCriteria` (each verifiable), optional `pool` and `poolScope=selected` to restrict to named agents, `autonomy=ask-when-unsure`.

## Steps
1. `agents.list` — exact names for lead and members.
2. Write the arguments to a file and preview them (starts nothing, reports every refusal at once):
```json
{ "op": "missions.preview", "args": { "title": "<title>", "goal": "<the full goal>", "lead": "<lead>", "team": [ { "agent": "<coder>", "role": "implementer" }, { "agent": "<tester>", "role": "reviewer", "permissionMode": "plan" } ], "approvalMode": "auto", "maxRounds": 6, "maxTasks": 12, "maxCostUSD": 20, "maxTokens": 2000000, "maxMinutes": 240, "maxParallel": 2 } }
```
   Adaptive variant: add `"mode": "adaptive"`, `"successCriteria": [ { "id": "c1", "text": "all unit tests pass", "required": true } ]` and `"pool"` instead of `team`.
3. Fix every problem the preview lists; then call `missions.start` with the same file. Keep the run id.
4. Follow: `missions.status id=<run>`. If it waits on a question: relay it to the user and answer with `missions.answer id=<run> answer="..."`. With `approvalMode=each-round`, the user approves via `missions.approve id=<run> ok=true`.
5. Steer an adaptive run: `missions.guide id=<run> text="..."`.

## Tell the user
Run id, lead, team, limits, how to watch it (Missions view) and how to stop it (`missions.cancel`).

## Pitfalls
- The planner always runs on Claude Code; delegations may run on any engine (`engine` per mission or per member).
- Every limit you leave at 0 is unlimited on that axis. `maxTokens` is the brake for engines that state no price.
- Two writers never share a folder at once; mark reviewers and researchers `permissionMode=plan`.
