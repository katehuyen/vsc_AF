---
id: restart-or-update
title: Restart Agent Farm or load a newly installed build
area: basics
summary: Check what is running, then restart the extension host or reload the window without losing other people's work.
intents:
  - restart agent farm
  - load the new version
  - the extension seems stuck, restart it
keywords: [restart, reload, update, new version, install, build, vsix, stuck extension]
ops: [farm.health, farm.restartExtensionHost, farm.reloadWindow]
effect: destructive
---
## Steps
1. `farm.health` — version, `build.pending` (a build on disk not loaded), live Console sessions.
2. Restart only on the user's request (or after installing a build they asked for):
```json
{ "op": "farm.restartExtensionHost", "args": { "resume": true } }
```
   When `build.pending` is true it plans a window reload instead (the only thing that loads a new build) and says so. Other agents' running turns are waited for, not cut.
3. After it comes back: `farm.health` again and compare `bootId` and version.

## Pitfalls
A window reload closes integrated terminals; open terminals block it. There is a 20-second cooldown.
