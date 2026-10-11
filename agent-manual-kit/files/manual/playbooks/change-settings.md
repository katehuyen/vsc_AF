---
id: change-settings
title: Change an Agent Farm setting
area: settings
summary: Find the right setting, preview the change, write it, and read it back; snapshots for switching whole setups.
intents:
  - change the report folder
  - turn off notifications for finished turns
  - set the default model for launches
  - save my settings as a profile
keywords: [setting, settings, configure, change option, preference, default, folder path]
ops: [farm.find, settings.list, settings.get, settings.set, settings.reset, settings.sets.save, settings.paths]
---
## Steps
1. Find it: `farm.find q="<what the user wants to change>"` or `settings.list category=<section>`.
2. Inspect: `settings.get key=<key>` (type, allowed values, default, current value).
3. Preview: `settings.set key=<key> value=<value> dryRun=true`; then write without `dryRun`.
4. Path settings with variables: `settings.paths` shows where they really point.
5. Before large changes: `settings.sets.save name="before-<change>"` so the user can switch back.

## Pitfalls
Only change settings the user asked about; report old and new value.
