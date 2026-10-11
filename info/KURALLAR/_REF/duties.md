# `DUTIES.md` — Watch Duty Format

**Reading** `DUTIES.md` happens every turn; read this file when you need to **write or edit** one.

Duties an agent must stay alert to are not written as prose rules but into the `DUTIES.md` in that agent's folder. Agent Farm parses this file, displays it, and audits its health — which is what makes it visible whether the duty is actually being kept.

**Format:** `## Title [cadence]` + `- **Watch:**` (the target to watch) + `- **Do:**` (the action).
**Cadence:** `every-turn` · `session-start` · `daily` · `weekly` · `manual`. An entry marked `[..., paused]` is skipped.
If the watch target has new content or changes, the Do step runs; clearing the target once the work is done is part of the duty.

## ‼️ `[every-turn]` IS PASSIVE — a duty with nothing behind it is dead

An `[every-turn]` duty is checked only **while the agent is already running**; it never wakes the agent by itself. A `[daily]`/`[weekly]` duty with no schedule or trigger behind it **never actually happens.**

- Install the automation **in the same move** as the `DUTIES.md` entry (`duties.automate`, or `schedules.add`), and name the duty in its title/prompt — that is what links them.
- Give it a **`fireIf` precondition** so it does not wake an agent to discover there was nothing to do (`_REF/automation-gate.md`).
- This is now audited: an unwired timed duty raises a health insight and a row on the **Living** page. If you see one, either wire it or change its cadence — do not leave it looking alive.

**Event-driven ≠ per-file.** A folder watch fires on any filesystem change, including noise; waking an expensive orchestrator per dropped file was the single largest waste in this system. Default to a **daily batch with a precondition**; reach for a watch trigger only when latency genuinely matters.
