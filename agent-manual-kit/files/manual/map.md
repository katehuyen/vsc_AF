# Agent Farm — map for agents

Agent Farm is a VS Code extension that runs the user's coding-agent CLIs (Claude Code, Codex, Gemini, Antigravity, OpenCode) as a fleet. Every action a person can take in its pages has a bridge op, so you can do it too. You drive it; you do not describe it.

## How to work any request

1. **Find**: `farm.find q="<the user's request in English>"` returns the best playbooks, areas and ops.
2. **Read**: `farm.guide id=<playbook>` gives the steps; `farm.ops op=<name>` gives the exact contract (args, defaults, refusals).
3. **Check**: confirm names exist (`agents.list`, `projects.list`, `engines.status`); use a preview op where one exists (`missions.preview`, `dryRun=true`, bare `confirm`-gated calls).
4. **Act**: one call per intent. Pass long or non-ASCII text as `@file.json`.
5. **Verify**: read the answer; then read back (`tasks.get`, `schedules.list`, `missions.status`...).
6. **Report**: tell the user what now exists, its id, and how to see it. If the user is not in this chat, use `notices.post`.

Ask the user only for what you cannot look up and the request does not imply (e.g. which agent, when). Never invent agent names, ids or models.

## Calling

`node <af.js> <op> [key=value ...] | @args.json | -` (stdin). Values `true`, `false`, `null` and numbers are typed; everything else is a string. Arrays and objects need `@args.json`. `--out <file>` writes the answer to a file (UTF-8), `--timeout <ms>` waits longer.
- Answers are `{ok, result}` or `{ok:false, error, detail?}`. A refusal is data: read `error`, fix the cause, do not retry blindly.
- Timeout with `detail.state: "unclaimed"`: VS Code is closed; nothing ran. With `"running"`: it is running (often waiting on a person); never repeat it.
- Names: agents, projects, workflows, schedules and triggers accept a name or an id. Sessions accept the 8-character id prefix.
- Lists that page return `{rows, total, more, last}`; pass `after=<last>` for the next page.

## Effects shown on every op

`[read]` changes nothing. `[write]` changes Agent Farm state. `[run]` starts or continues a paid agent or model run: only when the user asked for that work. `[destructive]` stops, cancels, deletes or overwrites: confirm intent first. `[ui]` only shows something to the user. `asks` = the user gets a confirmation dialog (the call may wait). `plans first` = the call only previews unless you pass the named flag.

## Pick the mechanism

| The user wants | Use | Playbook |
|---|---|---|
| an agent to do a job now, unattended | task (`tasks.add`) | run-task |
| to talk with an agent, or watch it work | Console session (`console.start`) | start-session |
| something to happen at a time, repeatedly | schedule (`schedules.add`) | recurring-task |
| something to happen when a file, hook or webhook fires | trigger (`triggers.add`) | react-to-events |
| fixed steps, each by an agent, output passed on | workflow (`workflows.add`) | multi-step-workflow |
| a team under a lead agent until a goal is met | mission (`missions.start`) | team-mission |
| long work that continues across sessions when quota or context runs out | baton relay (`baton:true`) | baton-relay |
| several variants of one job side by side | parallel runs (`parallel.run`) | parallel-worktrees |
| a project backlog worked through unattended | sentry campaign (`sentry.start`) | sentry-campaign |
| to hear from you (news, report, question) | notice (`notices.post`) | notify-user |
| to drop work for later | work queue (`queue.add`) | work-queue |
| one agent to hand work or knowledge to another | A2A task or note | delegate-to-agent |
| an agent to keep watching something | duty (`duties.add`) plus an automation | standing-duty |

## Words

**Agent**: a folder with instructions (CLAUDE.md, AGENTS.md); runs on any engine. **Engine**: the CLI (claude, codex, gemini, agy, opencode). **Run dimensions**: engine, model, effort, permissionMode, account, providerId/tier, project, workDir, mode (headless or interactive); the same names on every op that starts work. **Task**: one unattended run on the Tasks board. **Session**: one conversation; a **Console card** is a session hosted in the panel. **Account**: a captured sign-in of an engine; rules like `@emptiest` pick one. **Chain**: a baton relay of sessions (legs). **Notices**: the agent-to-user board. **Work queue**: the user-to-agent inbox. **A2A**: the agent-to-agent board. **Project**: a folder of documents plus code roots; sessions and work are filed under it.

## Areas

<!-- af:areas -->

## Playbooks

<!-- af:playbooks -->
