---
id: sentry
title: Sentry — unattended campaign over a project backlog
order: 10
summary: Work a project backlog item by item in unattended rounds across accounts, until stopped; inspect, pause, resume, stop.
ui: Missions page ▸ Sentry section ("Agent Farm: Missions")
keywords: [sentry, campaign, night shift, overnight, unattended, backlog, rotate accounts, autonomous, rounds]
related: [projects, relay, accounts, tasks]
---
# Sentry

## Model
A **sentry campaign** takes the next startable item from a project backlog, opens a clean unattended session on it as a task row, and when that row ends diagnoses it (item done, clean handover, nothing to continue, hit the wall) and opens the next round with words built from that diagnosis. It never stops on its own: an empty backlog is a wait. Brakes: the automation gate, an account ceiling per 5-hour window (it sleeps until the earliest reset), and a failure brake after N barren rounds. One campaign at a time.

## Common intents
- Start: `sentry.start project=<p> agent=<a> prompt="..." engine=claude` plus `permissionMode` (rounds that must write outside their own folder need `bypassPermissions`), `preset=mechanical|intelligent|hybrid`, `failLimit`, `ceiling`. Playbook sentry-campaign.
- Inspect: `sentry.status` (what it does and why), `sentry.leader`, `sentry.prompt`, `sentry.templates`.
- Pause and continue: `sentry.pause`, `sentry.resume`. Stop: `sentry.stop` (a running round is left alone; cancel it with `tasks.cancel`).

## Rules
A campaign spends real money unattended until stopped: start it only on an explicit request, with the user's agreement on project, agent, engine and brakes. Tell the user how to stop it.
