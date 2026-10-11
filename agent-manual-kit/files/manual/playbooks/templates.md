---
id: templates
title: Save a task setup to reuse it (templates and launch profiles)
area: tasks
summary: Save a task with its prompt and run settings as a template, run it later with overrides; save a session setup as a launch profile.
intents:
  - save this as a template
  - run the usual weekly audit task
  - reuse this setup next time
keywords: [template, reuse, reusable, saved task, preset, profile, usual]
ops: [templates.add, templates.list, templates.run, launch.profiles, launch.profile.set]
---
## Steps
1. Save:
```json
{ "op": "templates.add", "args": { "title": "Weekly dependency audit", "prompt": "<instructions>", "agent": "<agent>", "engine": "claude", "model": "sonnet", "permissionMode": "plan" } }
```
   Omit `agent` for a template that asks for the agent at run time.
2. Run (a paid run, on request): `templates.run id="Weekly dependency audit"` (pass any dimension to override it for this run only).
3. Sessions instead of tasks: `launch.profiles` lists saved setups; `launch.profile.set name=<n> engine=<e> model=<m>` saves one (it replaces the whole profile).
4. On a timer: a schedule with the same prompt (playbook recurring-task).
