---
id: basics
title: Basics — the bridge, discovery and farm health
order: 1
summary: How to call Agent Farm, discover what it can do, check its health, clean up what is stuck, restart it.
ui: Status bar items; command "Agent Farm: Open Now"; Farm Settings
keywords: [bridge, af.js, catalog, help, discover, health, version, restart, reload, stuck, cleanup, waiting, work area, scratch]
related: [notices, sessions, settings]
---
# Basics

## The bridge
Every Agent Farm function is a bridge op. You call it with the `af.js` helper; the running extension executes it through the same code the pages use and writes the answer back. Discovery ops (`farm.guide`, `farm.find`, `farm.ops`) are answered locally and work even when VS Code is closed. Everything else needs the extension running; if it is not, the call ends with `detail.state: "unclaimed"` and nothing ran.

## Discover
- `farm.guide` — the map. `farm.guide id=<area or playbook>` — one guide.
- `farm.find q="..."` — rank playbooks, areas and ops for a request.
- `farm.ops` — compact index of every op by area. `farm.ops op=<name>` — one full contract. `farm.ops area=<id>` — one area's ops with summaries. `farm.ops full=true --out <file>` — the full legacy dump (large: write it to a file, never into your context).
- `farm.brief` — live state for the calling session: who you are, your agent and project, what waits for you, what runs, quota.

## Health and state
- `farm.health` — version, uptime, `build.pending` (an installed build not yet loaded), leftover processes, the vault path in force.
- `farm.waits` — everything the fleet is waiting for, each row with what ends the wait (`clearedBy`: clock, event or human) and the op that ends it.
- `now.get` — the Now page: what blocks, what runs, today's spend and quota.
- `farm.cleanup` — what has been stuck 24 hours or more (queued rows, dead running rows, waiting batons, idle Console cards, hanging chains). Bare it only lists; `apply=true` cancels, stops or closes them (nothing is deleted). Clean only on the user's request.
- `farm.workArea` — the scratch folder agents should write temporary files to. Writes into retired folders are refused by a hook.

## Restarting
- `farm.restartExtensionHost` restarts the extension host; windows and terminals survive, Console sessions are lost unless `resume=true`. It does NOT load a newly installed build.
- `farm.reloadWindow` reloads the window: the only way to load a new build. Open terminals block it.
- Check `farm.health` `build.pending` first; when it is true, `farm.restartExtensionHost` plans a window reload itself and says so.
- Both have a 20-second cooldown. Only restart when the user asked or when you installed a build on their instruction.

## Rules
- Agent Farm's own data (sessions, transcripts, tasks, missions, notices, projects) is asked of the bridge, never read from disk. A hook refuses disk searches for session ids.
- Every bridge request shows the user a small notification (discovery ops excepted): do not loop calls needlessly.
