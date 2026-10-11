# Delegation — tasks vs missions

Read before delegating work to another agent. All calls go through the bridge (`_REF/bridge.md`); **always pull `farm.ops` first** to see that version's operations, then pick the op. Delegation instructions are written in **English** (`_REF/lang.md`).

## A. Simple single job → `tasks.add`

For work that goes to one agent and needs no splitting. `args`: `agent` (name), `title`, `prompt`, `mode?` (headless by default). The job runs with the target agent's own default model. Track with `tasks.list` / task outputs.

⚠️ **`tasks.add` has no budget ceiling.** Use it only for genuinely small work. Anything non-trivial goes through `missions.start` with `maxCostUSD` — an uncapped headless task can run far longer than expected.

## B. Complex / multi-part job → `missions.start`

Runs a goal with a **LEAD** + **TEAM** + hard budget; the engine iterates round by round.

`args`:
- `goal` — the target, stated fully and precisely.
- `lead` — the orchestrating agent.
- `team` — `[{ agent, role?, model? }]` — which agents, and **which model each gets** (apply `_REF/model-economy.md` here).
- `plannerModel?` — the model for planning; the pattern is **a smart model plans, cheap models execute**.
- `approvalMode` — `auto` for full autonomy; the engine still falls back to `ask_user` at a fork that genuinely needs a user decision.
- Budget ceilings — **set all of them**: `maxRounds`, `maxTasks`, `maxCostUSD`, `maxMinutes`, `maxParallel`.
- `workdir?` — the target repo/folder (becomes the working directory for delegated work).

**How the engine works:** each round the LEAD (headless) returns a JSON decision: `delegate`, `finish`, `ask_user`, or `abort`. The LEAD **does no work itself** — its write tools are disabled; everything happens through delegation. The engine feeds results into the next round and loops until the budget runs out, forcing "finish-only" when a ceiling is hit. Never hand the same job to the same agent twice (the loop guard trips). Two **writers** cannot enter the same folder at once — mark read-only jobs with `readonly: true` so they can run in parallel.

**Scale discipline:** a small, clear goal deserves a small plan — usually **one round, one delegation, then finish**. Extra rounds and research beyond need are waste. Planning cost counts toward the total.

## C. Delegate but own it

Delegating is the **start** of the job, not the end. Inspect every delegation's output **raw, yourself**: does it meet what the user actually asked for, is the quality sufficient, is anything wrong or missing? Then either (a) close and report it, or (b) re-delegate with correction instructions, or fix it yourself if that is faster and cheaper. Saying "done" without seeing the output is forbidden — the owner of the outcome is the delegator.
