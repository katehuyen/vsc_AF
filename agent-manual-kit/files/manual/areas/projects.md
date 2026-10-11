---
id: projects
title: Projects — documents, code roots, plan, backlog and history
order: 13
summary: Create and inspect projects; file sessions and work under them; plan, backlog, worklog, decisions, deliverables, tracks; project sessions' closing duties.
ui: "Agent Farm: Open Projects", "Open Backlog"; Projects view in the sidebar
keywords: [project, repo, code root, charter, plan, backlog, worklog, log, decision, deliverable, brief, handover, track, history, cost of project, what to work on next, file under project]
related: [sentry, notices, sessions, missions]
---
# Projects

## Model
A **project** is a documents folder (charter, plan, people, log, deliverables, decisions, `Backlog.md`) plus code roots, agents and budgets. Every session belongs to exactly one project (explicit assignment, else the longest matching code root, else the agent rule), and tasks, missions, notices, queue items, schedules and triggers can be filed under one. Documents are the user's own files: Agent Farm edits them surgically and keeps backups.

**Backlog vs plan vs work queue**: the plan is the phase-level roadmap; the backlog is the project's standing pile of coded items (`K-8`, states `[ ]` open, `[/]` doing, `[x]` done, `[-]` cancelled, with an explicit queue order); the work queue is the global user-to-agent inbox.

## Project sessions
A session started inside a project receives a system prompt block `=== AGENT FARM PROJECT CONTEXT ===` with the project brief already in it: do not re-read the folder to orient. Before ending a turn in which you did something: `projects.log` one line; `projects.decision.add` for anything that will be asked "why" later; `projects.plan.check` for a finished plan item; `projects.backlog.check code=<K-n> state=done note="..."` for a finished backlog item; `projects.track code=<K-n>` when you worked on an item without closing it. Playbook project-session-close.

## Common intents
- List and inspect: `projects.list`, `projects.get project=<p>`, `projects.health`, `projects.work project=<p> open=true`, `projects.timeline`, `projects.cost`.
- Create: `projects.create name="..." kind=product repos=[...] summary="..."` (a template is optional). Playbook project-setup.
- This window's active project: `projects.current` (read), `projects.current project=<p>` (set).
- File a session: `projects.assign session=<id> project=<p>`; unfiled sessions with evidence: `projects.suggest`, then `projects.suggest.apply`.
- Backlog: `projects.backlog`, `projects.backlog.next project=<p>` (startable items in order), `projects.backlog.add project=<p> text="..." area=<A> origin=user` (mark `origin=user` when the user dictated it), `projects.backlog.set`, `projects.backlog.move`, `projects.backlog.hold`. Playbook backlog-work.
- History of an item: `projects.tracks project=<p> code=<K-n>` ("how was this solved last time").
- Plan: `projects.plan`, `projects.plan.add`, `projects.plan.check`.
- Documents: `projects.doc.list`, `projects.doc.read` (returns `mtimeMs`), `projects.doc.write` (replacing needs `expectMtime`).
- Cold start for a newcomer: `projects.handover project=<p>`; written report: `projects.report`.

## Rules
- Never rewrite a project document wholesale when an op changes the one line you mean.
- `projects.archive` and `projects.set delete=true` touch the user's organisation: only on request.
