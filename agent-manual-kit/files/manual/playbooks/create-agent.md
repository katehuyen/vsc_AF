---
id: create-agent
title: Create a new agent
area: agents
summary: Create an agent folder with a mission, set its defaults, give it duties, and make other engines read its instructions.
intents:
  - create a new agent for social media
  - add an agent called researcher
  - set up a new assistant agent
keywords: [create, new agent, add agent, scaffold, setup agent]
ops: [agents.roots, agents.list, agents.create, agents.defaults.set, duties.add, agents.sync, superpowers.set]
effect: write
---
## Ask only if missing
Its name (a folder name) and what it is for, in one sentence. Optional: default engine and model, duties.

## Steps
1. `agents.roots` (where agents may live and which model names are valid); `agents.list` to make sure the name is free.
2. Create:
```json
{ "op": "agents.create", "args": { "name": "researcher", "mission": "Finds and summarises sources for the user's projects; writes reports to the report folder.", "model": "sonnet" } }
```
   Pass `root` when `agents.roots` lists more than one.
3. Per-engine defaults if the user named them: `agents.defaults.set agent=researcher engine=codex model=<m>`.
4. Duties if asked (playbook standing-duty). Engineering discipline by default: `superpowers.set agent=researcher on=true`.
5. If you edit its `CLAUDE.md` afterwards, run `agents.sync agent=researcher` so Codex, OpenCode and Antigravity read the same instructions.

## Tell the user
The folder created, its default model, and how to talk to it (Agents view, or playbook start-session).
