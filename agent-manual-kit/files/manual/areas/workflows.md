---
id: workflows
title: Workflows — fixed step chains with handoff
order: 7
summary: Chain agent steps (and checks, approvals, media, webhooks) where each step gets the previous output; run, follow, steer and resume them; presets and preferences.
ui: "Agent Farm: Open Tasks" ▸ Reusables (workflows); Live Timeline workflow lanes
keywords: [workflow, chain, pipeline, step, steps, then, after that, handoff, prev output, sequence, writer then editor, branching, runIf, onFail, forEach, verify, supervisor, recipe, preset, preference, flex]
related: [tasks, automation, missions, studio, kapici]
---
# Workflows

## Model
A **workflow** is a saved list of steps. Each step is usually an agent run (`agent`, `title`, `prompt`, plus run dimensions per step) and can read earlier results: `{prev_text}` (the previous step's text), `{prev_output}` (its output file path), `{prev_json.field}` (when it returned JSON with `outputContract=json`), `{steps.<id>.text}`, and the run's inputs `{input.<name>}`. Flow control per step: `runIf` (regex on the previous output), `onFail` (stop, continue, or a step number), `verify` (a judge with retries), `forEach` (fan a step over a list). Special steps: approval, select, webhook, media, browser, tool (ffmpeg), checkpoint, Gatekeeper. Use a workflow when the steps are known in advance; use a mission when a lead should decide them.

## Common intents
- Create: `workflows.add title="..." steps=[...]` (always via `@args.json`). Playbook multi-step-workflow.
- Ready-made: `workflows.recipes`, then `workflows.addRecipe recipe=<id> agent=<a>`.
- Run: `workflows.run id=<title> inputs={...}` → run id. Follow: `workflows.status runId=<id>`.
- Edit: `workflows.step.add`, `workflows.step.update`, `workflows.step.move`, `workflows.step.delete`, or `workflows.update steps=[...]` (full replace).
- Resume a broken run at the failed step: `workflows.resume` with the failed step's task id.
- Steer a running supervised run: `workflows.steer`, `workflows.decide`; answer its questions: `workflows.answer`; pick assets: `workflows.select`.
- Run it on a timer or event: a schedule cannot run a workflow directly; use `triggers.add action=workflow` or a schedule whose agent runs it.
- Preferences across levels (settings, agent, project, workflow, step, run): `flex.list`, `flex.get`, `flex.set`. Cost presets (Economy, Balanced, Quality): `presets.list`, `presets.apply`.

## Rules
- Every step that names an agent is a paid run; `workflows.run` starts the whole chain.
- Check names with `agents.list`; a missing agent or unknown engine is refused when saved.
