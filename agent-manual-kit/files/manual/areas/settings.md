---
id: settings
title: Settings — Agent Farm's own settings, setting sets, paths
order: 24
summary: Read and change Agent Farm settings safely (schema-validated), save and switch setting sets, see where path settings point, document opening, terminal rendering.
ui: "Agent Farm: Farm Settings"
keywords: [setting, settings, configure, preference, option, default, set sets, profile of settings, path, vault, folder, report folder, open documents, terminal rendering, migration]
related: [workflows, engines, basics]
---
# Settings

- Find a setting: `settings.list category=<section>` (sections: general, projects, agents, engines, sessions, notify, cost, handover, tasks, monitor, reports, knowledge, media, sentry, gatekeeper, remote). One in full: `settings.get key=<key>` (the `agentFarm.` prefix is optional).
- Change one: `settings.set key=<key> value=<v> dryRun=true`, then without `dryRun`. Values are validated against the schema; unknown keys are refused. Reset: `settings.reset key=<key>`.
- Named snapshots: `settings.sets`, `settings.sets.save name=<n>`, `settings.sets.apply name=<n> dryRun=true` (applying resets everything the set does not mention).
- Where path settings really point (variables such as `${vault}` expanded): `settings.paths`.
- Preferences that can be set per agent, project, workflow, step or run: `flex.list`, `flex.get`, `flex.set` (area workflows).
- How report links open: `docopen.get`, `docopen.set`. Garbled terminals: `terminal.render.get`, `terminal.render.apply`.
- Engine-side settings (Claude Code's own settings.json): `claude.settings`, `claude.settings.set` (area engines).

Change settings only when the user asks; read the current value back and tell them what changed.
