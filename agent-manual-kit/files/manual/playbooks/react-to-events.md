---
id: react-to-events
title: React to a file, folder, agent event or webhook (trigger)
area: automation
summary: Install a trigger that starts a task, the dispatcher or a workflow when a watched path changes, an agent hook fires, or a webhook is called.
intents:
  - when a file lands in this folder have the agent process it
  - watch the inbox folder
  - when the designer finishes, start the reviewer
  - give me a webhook url to start this workflow from n8n
  - run the workflow whenever this file changes
  - when these conditions are met start the agent
keywords: [trigger, watch, folder, file, when, webhook, hook, event, n8n, zapier, on change, condition, fireIf]
ops: [agents.list, workflows.list, triggers.add, triggers.list, triggers.fire, triggers.edit, reports.triggers]
effect: write
---
## Choose the type
- `type=watch` with `watch=<existing path>`: a file or folder changes. Prompts can use `{file}` (what changed) and `{watch}`.
- `type=hook` with `hookEvent=stop|start|prompt|toolStart|toolEnd|permission|notify|subagent|compact|end` and `hookAgent=<agent>`: an agent session event.
- `type=webhook`: Agent Farm returns a local POST URL; the body is `{payload}`.

## Steps
1. `agents.list` (and `workflows.list` for a workflow action).
2. Install (file payload):
```json
{ "op": "triggers.add", "args": { "title": "Process inbox", "type": "watch", "watch": "<folder>", "action": "task", "agent": "<agent>", "prompt": "A new file arrived: {file}. Process it as follows: ...", "debounceSec": 30, "fireIf": { "kind": "folderHasFiles", "path": "<folder>", "minCount": 1, "except": ["_LOG_.md"] } } }
```
   For a workflow: `"action": "workflow", "workflow": "<title>"`, optionally `"inputs": {"<input>": "{file}"}`. For routing to the best agent: `"action": "dispatch"`.
3. Read back: `triggers.list`. Test only with the user's consent (it starts a run): `triggers.fire id=<title> file=<path>`.

## Pitfalls
- A folder watch fires on any change: always add `fireIf` and a `debounceSec`, and prefer a daily schedule with a precondition when latency does not matter.
- Reliability over time: `reports.triggers`.
