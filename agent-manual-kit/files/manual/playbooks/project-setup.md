---
id: project-setup
title: Set up a project
area: projects
summary: Create a project with its documents folder, code roots and agents, make it the active project, and file existing sessions under it.
intents:
  - create a project for the mobile app
  - start a new project with these repos
  - file these sessions under the project
keywords: [project, create project, new project, repo, code root, active project, file sessions]
ops: [projects.list, projects.create, projects.current, projects.get, projects.suggest, projects.suggest.apply, projects.assign]
effect: write
---
## Steps
1. `projects.list` (the name must be new; maybe it exists already).
2. Create:
```json
{ "op": "projects.create", "args": { "name": "<name>", "kind": "product", "summary": "<one line>", "repos": ["<absolute path of a code root>"], "agents": ["<agent rule>"] } }
```
   The documents folder goes under the projects root unless `folder` is given; a `template` (from `projects.templates`) seeds plan and backlog.
3. If the user works in it now: `projects.current project=<name>` (new sessions in this window are filed under it).
4. Existing sessions: `projects.suggest` shows evidence-based proposals; `projects.suggest.apply project=<name> all=true` files the clear ones; single sessions with `projects.assign session=<id> project=<name>`.
5. Read back: `projects.get project=<name>`; `projects.health` reports charter gaps to fill with the user.
