---
id: orient
title: Get oriented in a farm session (first minute)
area: basics
summary: What to call first when you start working on a machine running Agent Farm.
intents:
  - what can you do with agent farm
  - where am I, which agent am I
  - get oriented, what is going on
keywords: [start, first, orient, who am i, overview, help]
ops: [farm.brief, farm.guide, sessions.whoami, agents.list]
---
## Steps
1. `farm.brief` — who you are (session, agent, project, account), what waits for you, what runs, quota, the user's language. If it says Agent Farm is not running, only discovery works: tell the user to open VS Code if they asked for an action.
2. If a project context block opened your system prompt, the project brief is already in front of you: do not re-read the project folder.
3. If `farm.brief` lists items waiting for you (answered questions, queue items, A2A tasks), handle them first: playbook check-inbox.
4. For any request touching Agent Farm: `farm.find q="<request>"`, read the top playbook with `farm.guide id=<id>`, then act.

## Pitfalls
- Do not infer your session or agent from the folder: `sessions.whoami` decides.
- Do not dump the full op catalog into your context; use `farm.find` and `farm.ops op=<name>`.
