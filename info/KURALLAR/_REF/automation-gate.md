# The Automation Gate — Never Pay for a Wake-Up That Finds Nothing

Read this before **creating or editing any schedule / trigger**, or when the user asks why an automation did or did not run.

## The rule

An unattended run must pass two questions **before** a model is spawned:

1. **May the farm work right now?** — master switch · pause-until · quiet hours.
2. **Is there actually work?** — the **`fireIf` precondition**.

The old brakes (`debounceSec`, `cooldownSec`, `maxPerHour`) only cap *how often* an agent wakes, never *whether waking is worth anything*. Measured: one folder watch woke opus 23 times in five nights, found nothing every time, cost **$70.90**. A precondition that counts files answers the same question for free.

**Every schedule and trigger you create gets a `fireIf` unless you can say why it does not need one.** Verdicts are logged either way (`automations.status`), so a guard can never silently swallow real work.

## `fireIf` kinds

| kind | fires when | typical use |
|---|---|---|
| `folderHasFiles` | folder holds ≥ `minCount` files, ignoring `except[]` | an inbox that should end up empty (`except:["_LOG_.md"]`) |
| `fileMissing` | the path does **not** exist | nudges: today's day file was never written |
| `pathChangedWithin` | path's mtime is within `hours` | react to fresh activity, ignore a stale tree |
| `queueHasWork` | work queue has ≥ `minCount` actionable items | sweeps — do not wake for an empty queue |

Paths accept **`{today}` / `{yesterday}`** (local `YYYY-MM-DD`). An unknown kind **fails open** (fires) — a guard must never suppress work by accident.

## Model belongs ON the automation

`FarmSchedule.model` / trigger `action.model` beat the `agentFarm.modelPolicy` regex engine. State the model on the automation, not in a settings regex: a policy rule that quietly downgrades a duty its own `DUTIES.md` says needs opus is exactly the silent contradiction the constitution forbids.

## ‼️ A schedule prompt POINTS AT the duty — it never restates its steps

The prompt is what the model actually reads; the `DUTIES.md` / `CLAUDE.md` text is only what *we* think it reads. When the prompt spells the procedure out again, the two drift and **the prompt silently wins**. Measured 2026-09-12: `basit/CLAUDE.md` said the nightly backup stages the whole repo (`git add -A`); the schedule firing that duty told it the opposite — "do not blindly take everything, stage them one by one". For months the backup was partial, every commit body claimed otherwise, and a whole machine's settings were never in the repo.

So a schedule prompt carries **only** what the duty cannot know by itself: which duty to run, the target path, and the rule file to read (`_REF/git.md` B). Never the steps. If the procedure needs changing, change the rule file — a schedule is a trigger, not a second copy of the rule.

## Quiet hours DEFER, they do not drop

Inside the quiet window nothing wakes on its own, and a schedule whose time arrives is **held and fired when the window ends** — a nightly batch is never lost to "no wake-ups after 23:00". Manual **Run now** ignores quiet hours (a button press is not an unattended wake-up); the master switch still applies.

## Budget is a brake, not a warning

`agentFarm.budgets` (per agent, `"*"` = fleet) now **blocks the launch** when today's ceiling is reached. Over the ceiling a task is parked with the reason, not started.

## Bridge ops

`automations.status` (gate + per-automation fired/skipped/skipRate + what would fire now) · `automations.pause {minutes?, reason?}` · `automations.resume` · `automations.quietHours {from,to}` · `automations.bulk {set:on|off, kind?, titles?[], tag?}` · `fireIf` and `model` args on `schedules.add/edit` and `triggers.add/edit`. Always pull `farm.ops` first.

## When an automation "did not run"

Ask `automations.status` before guessing. The answer is one of: gate closed (paused / quiet hours) · precondition not met (with the detail: *"no files waiting"*) · disabled · budget ceiling · never wired at all. Do not re-derive it from timestamps.

**Related:** `_REF/duties.md` (a timed duty needs an automation behind it) · `_REF/model-economy.md` (which model) · `_REF/queue.md` (`queue.maturity` before a sweep).
