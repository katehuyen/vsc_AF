# Handover — ending a run so the next one continues cleanly

Binding on **every run doing multi-step work** — project session, mission role, task or sentry round, a long interactive job — on any engine. A direct answer simply finishes; it never gets near a trigger.

## 1. Work economy

- **Laser focus:** target the task directly. No unsolicited refactoring, conversational filler or meta-summaries.
- **Lean context:** read targeted line ranges, not whole multi-thousand-line files. Every line you read is paid for again on every later turn.
- **Decisive turns:** plan, edit and verify with tests in few, high-yield turns.

## 2. Three triggers — whichever fires first

| Trigger | Read from | Converge | Hand over |
|---|---|---|---|
| **5-hour quota** | the account's own probe (below) | setting (default off) | setting (default 90%) |
| **Weekly quota** | the same probe's `seven_day` line, or Agent Farm's `QUOTA HANDOVER … weekly window` notice | — | setting (`agentFarm.quotaWeeklyHandoverPct`, 0 = off) |
| **Context fill** — the last model call's context ÷ the model's context window | Agent Farm's `CONTEXT CONVERGE` / `CONTEXT HANDOVER` notice | setting (default 35%) | setting (default 40%) |

- **Converge:** start nothing new — no new sub-task, no broad reads or scans — and finish the atomic step in flight.
- **Hand over:** stop there even if the item is unfinished. Never push on to finish it; the next run continues it.
- **Below both thresholds, work at full capacity.** Never wrap up early, and never because an item is large: items do not have to finish in one run, and the handover note exists to carry partial progress (investigation, design, first code, tests). Start the next item, make whatever atomic progress you can, commit it.
- **‼️ THE THRESHOLD IS READ, NOT ROUNDED — 89% is not 90%.** Measured (audit A-08.6): a session announced "quota 89–90% — starting the wrap-up", its last probe before that sentence said **89**, and its closing note then claimed it "did not start before 90". Naming the real number and rounding it up in the same breath is how the rule is broken while appearing to be followed. Quote the figure; if it is under the threshold, keep working.
- **You cannot see your own context fill.** Do not estimate it; act on the notice. No notice = keep working. The notice arrives as extra context after one of your own tool calls (Agent Farm answers the live hook — `CONTEXT CONVERGE 36% — …` / `CONTEXT HANDOVER 41% — …`), once per line; thresholds and every delivery: `af.js sessions.contextGuard`. **The four figures and the SENTENCE the notice carries are settings** (Settings ▸ Handover Discipline · `sessions.contextGuard.set orders=`), so an order you are given may be this fleet's wording rather than this file's — obey the notice you got.
- **The two quota windows are never read for each other.** The weekly (`seven_day`) figure fires only at its OWN setting, never at the 5-hour line. ‼️ Measured 2026-09-21: a `QUOTA HANDOVER 90%` notice saying *"your account's 5-hour window is 90% used"* carried the WEEK's figure on an account whose five-hour window was at 34% (fixed in 3.624.0, X-353). A quota notice is cross-checked against the repo's own probe before you act on it; they disagree → the probe wins and you keep working.

### Reading the 5-hour window

Check with the repo's own tracked probe — in `vsc_AgentFarm`, `node tools/quota.js` — or OAuth usage.

**‼️ READ THE WINDOW OF THE ACCOUNT THIS SESSION IS ACTUALLY RUNNING AS.** A session started from an Agent Farm account slot carries `CLAUDE_CONFIG_DIR`, and its credentials live **there**; `~/.claude` belongs to whatever account the machine happens to be signed in as. Measured 2026-09-06: the home path reported **95%** for an account the session had not spent a token on, while its own window was at **23%** — under the 90% rule that reading would have ended the session for nothing. The script must be **given** the file — `readOauthCredentials()` called bare defaults to `~/.claude` — and it **prints the config dir it read as its FIRST line**. ‼️ Measured again 2026-09-06: the probe on disk had lost that and was calling the default, reporting **0%** for a session whose own window was at **54%** — the opposite failure, working on past the wall. **If the first line is not a config dir, the script is an old copy and its number is a stranger's**; fix the probe before you trust any figure from it.

## 3. Protocol — when a trigger fires

1. Start nothing new; do not expand scope.
2. Finish the atomic step in flight and verify it with tests.
3. Commit the clean progress (`_REF/git.md`).
4. **‼️ Leave no branch or worktree behind — nobody cleans up after you.** Every branch and worktree this run opened, by hand or through Agent Farm (`af/…` parallel runs, a scratch worktree in the work area), is merged or deleted before you go: `git branch -d` (it refuses unmerged work — never `-D` on commits that are not in history), the worktree's folder removed and `git worktree prune`. One that must stay is named in the note with its reason. The note / baton prompt states the measured line for every repo you touched — `git branch` and `git worktree list` show only the main one — and the successor checks it first: a leftover it finds is cleaned (after verifying its content is in git history) before new work starts, never passed on again.
5. Write the handover note (section 4) — **or, in a baton relay, pass the baton instead (section 5).**
6. Name the note's path in your final message and end the run — well before the 100% wall; the space above the threshold is the wrap-up budget. (If you installed a new Agent Farm build, call host reload with resume=false as your final tool call so the next agent starts on the running build; NEVER call resume=true on handover).

In a project session, also do the project extras: `_REF/project-session.md` → "Handing over".

The next run is always a **fresh session that starts from the note** — never a resume of the saturated one.

## 4. The handover note

- **Folder:** `00_AGENT_AREA/00_OUTPUT/01_CEVAPLAR/`.
- **Name:** `YYYY-MM-DD_devir_##_<sessionId:8>_<topic>.md` — `##` is a 2-digit daily sequence counter (`01`, `02`, `03`… reset each calendar day), `<sessionId:8>` the 8-char short session id (Claude: `$CLAUDE_CODE_SESSION_ID`), `<topic>` a short kebab-case summary. Agent Farm finds notes by this name — do not vary it.
- **Frontmatter:** `session`, `engine`, `agent`, `trigger` (`quota` | `context`), `reading` (the figure that fired, e.g. `41%`), and when there is one `project` and `code` (the backlog item).
- **Body, in Turkish** (the user reads it):
  - `## Durum` — what is done, with commit hashes.
  - `## Kalan` — what remains, in order.
  - `## İlk 5 dakika` — the files and line ranges to open and the first command to run, so the next run does not re-read what you already read.

## 5. Baton relay — the handover is a prompt, not a note

A run is **in a relay** when its first message opens with `=== BATON RELAY — chain … ===` (or the user's own header, `agentFarm.batonHandoverTemplate`), or when Agent Farm's `CONTEXT HANDOVER` / `QUOTA HANDOVER` notice says **"pass the baton"** (a run opened with `tasks.add baton:true` is leg 1: sealed when its session is known, no chain header, the notice tells it). Such a run does not write a handover note — its successor's first message IS the handover:

1. Protocol steps 1–4 as above (stop, finish the atomic step, commit, leave no branch or worktree behind).
2. `Write` `{ "prompt": "<what the successor starts from — done with commit hashes · what remains, in order · the first five minutes>" }` to a file, then run `node af.js baton.pass "@<file>"`. Optional keys: `surface` (inherit · console · terminal · headless), `account` (only while the chain has no pool — a chain keeps its first leg's policy on every leg, and a different one comes back as `poolKept`; default `@emptiest`), `note` (for the human reading the chain, never handed on), `quota` (your probe's 5-hour figure — Agent Farm only ever raises its own reading with it).
3. End the run = end your turn. Nothing starts while this session is alive. A headless run exits by itself; a Console card or a terminal session does not, so **Agent Farm ends it for you** once the turn that passed has been at rest ~10 s (nothing queued, no question open) — never close your own card. Then it opens a fresh session on the same setup, the chain header on top (`leg n/N`, counted in legs). If every account is full it parks until the first reset.
4. The notice already says "your baton is passed" → just end the turn.
5. **A new Agent Farm build is loaded by the SUCCESSOR, not by you.** A leg that installed a VSIX does not reload at its end; its baton prompt says "installed, not loaded", and the successor — a fresh Console session with nothing in flight — checks `farm.health` (`build.pending`) first and loads it with `farm.restartExtensionHost resume=true` (`_REF/agentfarm-dev.md`).

**A break the user asks for is `chains.pause session=<you>`, never a question held open:** `mode=here` (a short break, the machine stays on — finish the atomic step, commit, give `words=` where you stopped, end your turn WITHOUT passing; the user's RESUME arrives in this same session) or `mode=pass` (a restart, the night — pass as usual; your successor waits at the door for the user's Continue). The answer carries your order; obey it.

**The chain ends only when the work is done.** While items are open and anything in them can still be done, pass — never end it on your own judgment. End it only when every remaining gap is essential and only the user can close it. `baton.status` shows it; `baton.stop` stops a successor already waiting (✕⑂ Stop chain on the Console card), and `baton.lastLeg` is the user's soft brake on the leg still running (⑂⊣ Last leg): such a leg's handover order names the note instead of the pass — obey it, and never pass around it. The user may also attach a running session (⑂ Attach relay = `baton.attach`) — so when told to "go on as a relay", attach yourself only if `baton.status session=<you>` shows no chain; a refusal naming `already in chain` means the user got there first, and their ceiling stands — or press ⑂ Pass now — that arrives as a `PASS NOW —` message carrying the same order: obey it like the notice. Two brakes act on their own at the pass: the leg ceiling (`agentFarm.batonMaxHops`, default 6 legs, 0 = none) and the barren chain (two legs in a row ending on the same git HEAD — read in the leg's folder AND its project's code repos). **A pass answered with `braked` opened nothing — what you do depends on WHO braked.** The user's brake (Last leg, Stop chain, or the leg ceiling they set) → write the handover note (section 4), then end the run. Any other refusal — the barren-chain brake, an error, a refused pass — is YOUR failure to repair, never an end: remove the cause it names and pass again, or open the next leg yourself (`tasks.add` with `baton:true`, in this folder, your handover as its prompt; if your commits went to a repo the chain does not read, say so there). You do not end the run until a next leg is open. And a pass comes only when a HANDOVER notice or your quota probe reaches the line — never before it. Project extras (worklog line, `touch` on the unfinished item) still apply — naming the baton id instead of a note.

**A relay run that ends WITHOUT passing is judged (S-83 failsafe).** Finished cleanly, or ended by the user → the chain simply ends (`done`). Cut off — a HANDOVER notice had reached it, it wrote a note in its last two minutes, it errored, or it left uncommitted work (folder or project repos) → Agent Farm opens the next leg itself under an `EMERGENCY HANDOVER` header carrying the note's sections — or, with no note, the brief that leg started from, what it committed and what it left uncommitted. So a leg told to hand over still passes: the rescue exists for crashes, not as a shortcut. A Console card never ends by itself, so a leg that got its HANDOVER order and rests **without** passing is closed by Agent Farm after 30 s (S-90; not if the user spoke to it after the order — a turn the CLI opens for a finished background command is not the user), and the failsafe then judges it. A leg whose ACCOUNT hits the plan limit (`You've hit your session limit`) cannot pass at all: Agent Farm passes for it (X-462) and the successor opens on an account with room, or parks until the first reset. A leg whose launch record was lost (e.g. across a restart) still passes, on its chain's setup (`setupFromChain`, S-89). **A leg that wakes up under that header** reads the evidence, runs `git status` before building on uncommitted work, and reads the predecessor's last turns if needed (`sessions.read session=<id> from=-10`). A successor dead within 30 s with no tool call stops the chain (`failed`).
