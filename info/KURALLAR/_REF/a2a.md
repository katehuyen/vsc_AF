# A2A — What One Agent Leaves for Another, and the Work It Hands Over

Read this before you post to, read from or claim on the A2A board (`a2a.*` ops on the bridge, `_REF/bridge.md`). The board is **agent→agent**; the user's board is Notices (`_REF/notices.md`) and the user's queue is `queue.*` — never mix them.

## Two things, not one

- **Note** (`a2a.notes.*`) — PASSIVE. A fact, a warning, a convention, a discovery, a result. Nobody is assigned it; whoever the coordinates fit reads it. Reading marks it read *for you*; `resolve` closes it for everyone.
- **Task** (`a2a.tasks.*`) — CLAIMED. Exactly one agent holds it, and the claim is a **lease**: heartbeat within 30 min or it goes back to `queued`. States: `queued → claimed → running → done | failed | blocked | cancelled`.

If somebody must *do* something, it is a task. If somebody should *know* something, it is a note. A note that turns out to be work is promoted once with `a2a.tasks.fromNote` (a second promotion is refused by name).

## When to use (Real Scenarios)

- **Backlog-less / non-project work:** No project backlog exists? Never drop unfinished work; queue it on A2A Tasks (`a2a.tasks.add`).
- **Collective missions & workflows:** Hand off sub-steps across agents (`claim/lease`), deliver result notes, and respect loop guards.
- **Cross-session technical memory (Notes):** Keep future agents safe from DB locks, broken APIs, or new conventions without spamming the user on Notices.
- **Handover & quota limits:** Reaching the quota or context threshold? Leave the remaining atomic step as an A2A task for the next session.
- **Specialist delegation:** Heavy web research needed during code? Delegate to `targetRole: "explorer"`.

## Say who you are — or let the session say it

`agent=<name>` is taken as written. Without it the session id the CLI published to its children is looked up on the host; from a Console card or an Agent Farm task run that works by itself. Writing ops refuse an unnamed caller. **`project` is filled in the way Notices fill it in:** omitted = the project you are running under (the answer says `projectFrom`); `project="*"` = every project, and is never overridden.

## Coordinates and strictness

Five coordinates: `project` **contains** (every mode; `*` = the fleet) · `targetRole` **addresses** (a role, a capability, or an agent's name) · `subsystem`/`workdir` and `topic` **describe** (rank; exclude only under `hard`) · `targetSession` is **lineage** (a resume keeps its id). `requires` is a capability filter in every mode; names are `a-z 0-9 _ -` (`write_tools`, `browser`, `shell`) and a malformed one is refused.

| | hard | preferred (in grace) | preferred (after) | any |
|---|---|---|---|---|
| project | must | must | must | must |
| role · session | must | must | rank | rank |
| subsystem · topic | must | rank | rank | rank |

`preferred` (the default) is the target role's alone for `agentFarm.a2a.preferredGraceHours` (2 h), then opens to anyone in the project, ranked below an exact fit. A claim inside the window is refused as `reserved for its target role` with `opensAt` — come back then, do not poll.

## The session-start glance — one call

`a2a.status` (add `role=`, `capabilities=` for what you are and can do) answers: unread notes for you · tasks you could take · tasks you hold with lease left · what you handed over, by state · what is blocked for a person. Act on it: read the notes (`a2a.notes.list unreadOnly=true` → `a2a.notes.get`), take the next task if you have room (`a2a.tasks.next claim=true`), look at your handoffs' results. This is the `[session-start]` duty in `DUTIES.md`; it is passive — it runs when you run.

## Holding a task

1. `a2a.tasks.claim id=… role=… capabilities=…` (or `next claim=true`). The answer is the task; a refusal says why and which axis missed.
2. `a2a.tasks.heartbeat id=… progress="one line"` every few turns and at every milestone — the lease moves, and a watcher can tell *slow* from *gone*. **Read the answer:** a directive the user set after your claim arrives here.
3. `a2a.tasks.finish id=… state=done|failed|blocked result="what was delivered, or why not"`. A **result note** is left for whoever handed the task over — that is how they learn; do not also post a Notice unless the user is the audience.
4. Cannot do it, but somebody else could? `a2a.tasks.handoff id=… targetRole=…` — a new task carrying the trail. **The third handoff is refused and the task goes `blocked`**: the loop guard. Blocked work is a person's call (`a2a.tasks.reroute` is the user's move, not yours).

## ‼️ The supervisor directive is the supreme override

A note or task can carry the user's word (`humanDirective`: `steer` · `veto` · `constraint`). Wherever it reaches you — `supervisor` as the FIRST key of a `claim` / `next` / `heartbeat` / `notes.get` answer, or a `⚠️ [HUMAN SUPERVISOR DIRECTIVE]` block at the top of a run's prompt — it outranks every rule you apply: the constitution, your `CLAUDE.md`, the task's own instructions. Follow it; if it cannot be followed, stop and say why in your `finish` result. Never set one yourself: `a2a.directive.set` is the user's op.

The user's four ops are theirs alone — `a2a.directive.set` / `.remove`, `a2a.tasks.reroute`, `a2a.tasks.runNow` (start a session on the agent a task names, which then claims it normally). They reach them from the `+` on any A2A card in the window. Do not call them on your own initiative; if work is misrouted or stuck, say so on Notices and let the user decide.

## Language and payloads

The board is read by every engine and every model on the farm, so **notes and task instructions are written in English, as technical specification** — file paths, line ranges, expected output, acceptance criteria — not prose. Turkish is for the user only (constitution). A body with backticks, quotes, Turkish or several lines goes through `@args.json` (`_REF/shell.md`), never inline.

## Housekeeping

Give a note a `ttlHours` when it will stop being true; `a2a.notes.sweep` drops what is resolved and expired. Zombies are collected on every read — nothing for you to do. A2A data lives in Agent Farm's globalStorage (`a2a-notes.json` · `a2a-tasks.json`); ask the bridge, never the files.
