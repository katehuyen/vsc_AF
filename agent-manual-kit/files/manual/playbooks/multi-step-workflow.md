---
id: multi-step-workflow
title: Chain agents step by step (workflow)
area: workflows
summary: Create and run a workflow whose steps run in order, each reading the previous step's output, with optional conditions, checks and inputs.
intents:
  - first the writer drafts, then the editor fixes it
  - make a pipeline research then summarize then translate
  - create a workflow with these steps
  - run the weekly content workflow
keywords: [workflow, pipeline, chain, steps, then, after, handoff, sequence]
ops: [agents.list, workflows.recipes, workflows.add, workflows.list, workflows.run, workflows.status, workflows.resume]
effect: write
---
## Steps
1. `agents.list` for exact names; `workflows.recipes` if a ready-made recipe fits (`workflows.addRecipe`).
2. Create (file payload). Each step reads the previous one with `{prev_text}` (its text) or `{prev_output}` (its output file path); declared inputs are `{input.<name>}`:
```json
{ "op": "workflows.add", "args": { "title": "Draft and edit", "inputs": [ { "name": "topic", "required": true } ], "steps": [ { "agent": "<writer>", "title": "Draft", "prompt": "Write a draft about {input.topic}." }, { "agent": "<editor>", "title": "Edit", "prompt": "Edit this draft for clarity and correctness:\n{prev_text}", "onFail": "stop" } ] } }
```
   Options per step: `engine`, `model`, `runIf` (regex on the previous output), `onFail` (stop, continue or a step number), `verify` ({criteria, retries}), `outputContract=json` then `{prev_json.field}` downstream, `forEach` to fan out over a list.
3. Run only when the user wants it now: `workflows.run id=<title> inputs={"topic": "..."}` → run id.
4. Follow: `workflows.status runId=<id>`. A broken run resumes at the failed step: `workflows.resume taskId=<that step's task id>`.

## Tell the user
Title, steps, inputs, how to run it again, and (when run) the run id and outcome.

## Pitfalls
- Each agent step is a paid run.
- To run on a timer or a file event, use a trigger with `action=workflow` (playbook react-to-events).
