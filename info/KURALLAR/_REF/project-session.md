# Project Sessions — when a session carries an Agent Farm project

Agent Farm can start a session **inside a project**. When it does, this file's
procedure applies for the whole session. You do not opt in and you do not ask
the user whether it applies — the context block is the trigger.

## How you know

Your system prompt opens with a block fenced like this:

```
=== AGENT FARM PROJECT CONTEXT ===
This session belongs to the project "<name>" (id: prj_xxxxxxxx).
Docs folder: <path>
Code repos:  <path> · <path>
…
--- PROJECT BRIEF (generated <when>) ---
<the project's current state>
--- END PROJECT BRIEF ---
=== END AGENT FARM PROJECT CONTEXT ===
```

The **brief is already in front of you** — it is not a file you have to open.
It carries the project's status, its code roots, **which file holds which role**
(charter · plan · people · log · deliverables), and the charter's constitution —
Scope & Anti-Scope, Code Architecture, Verification Gate, Project Invariants —
inlined, because those bind every turn. It deliberately carries **no queues**
(backlog, plan items, worklog, decisions, people): they change mid-session and
have ops of their own. If it says it was cut to fit, the full text is at the path given.
A `## Charter gaps` section means one of the three binding sections is missing or
empty in the charter: never guess it — ask the user, and write what they settle
under that heading (`projects.health` lists the same gap per project).

## Opening

1. **Do not read the folder.** The brief is the index; opening files "to get
   oriented" spends a turn re-reading what you were handed.
2. Go to the user's actual subject. They chose the project already — repeating
   it back at them is not orientation, it is delay.
3. Open a document only when the work needs its depth: the **charter** for what
   the project is and why, the **plan** for what is open, a **decision** file for
   why something was settled the way it was.

## Closing — MANDATORY, not at your discretion

Before you finish a turn in which you **did something** (shipped, decided,
measured, changed, discovered):

- **Worklog** — one line, what you did, into the file the brief names as `log`
  (`projects.log`). This is the whole point of the loop: the next session's
  brief is built out of these lines, so a session that writes nothing leaves the
  next one blind.
- **Decision** — anything that will be asked "why is it like this?" in three
  months gets its own record (`projects.decision.add`).
- **Plan** — a plan item you finished gets ticked (`projects.plan.check`), never
  rewritten around. Read the current items with `projects.plan` first.
- **Backlog** — a backlog item you finished gets closed the same way
  (`projects.backlog.check`, by its code) **with a `note`**: one or two sentences
  saying what was done, how it was closed, and anything a reader should watch
  out for later. That note is the closing note a person will read in
  `Backloglog.md`; the session and turn are recorded for you. When the last open
  child of a parent (`parent:"<code>"`) is closed, you MUST close the parent
  umbrella in the same turn (`projects.backlog.check`).
- **Backloglog** — ‼️ **the log is yours to keep, not only at the end.** A coded
  item you worked on and did NOT finish gets `projects.track { code, event:
  "touch", note }` before the turn ends. The attempts are the history: "looked,
  root cause not found" is what somebody needs three months later, and a record
  of endings alone throws it away. Before starting on a code, `projects.tracks
  { code }` tells you whether it has been fought before and where — read that
  transcript instead of rediscovering it.
  In the document, Agent Farm owns each item's data line and session rows and
  rewrites them; **every other line in the block is prose and survives** — that
  is where you (or the user) write, correct and add.
- **Deliverable** — something that actually shipped (a release, a document, a
  handover) gets a row (`projects.deliver`): what, which version, when, where.

Pure conversation, a question answered, a file merely read — nothing to write.
Judge honestly; a worklog padded with "the user asked about X" is as useless as
an empty one.

## Never

- **Never reformat the user's documents.** Their icons, their Obsidian Tasks
  metadata (🆔 ⛔ ⏫ 📅), their headings, their ordering — untouched. You add
  lines; you do not tidy.
- **Never write in a different language from the document you are writing into.**
  The project's content is in whatever language the user writes it; match the
  file, not your own habit.
- **Never rewrite a whole document** to change one line. Append at the anchor,
  patch the one line.
- **Never touch `_AF/`** — it is machine-generated and will be overwritten on the
  next spawn. Anything you put there is lost.
- **Never put arbitrary files in the project root.** The root whitelist is strictly limited to the 6 core role files; all notes, specs, and designs go to `10_Notes/` (see structure below).

## Project Folder Structure & Strict Root Whitelist

The root of a project folder (`00_AGENT_AREA/10_PROJECTS/<Project>/`) is strictly reserved for the core lifecycle files and standard directories defined in `DEFAULT_SKELETON`. Cluttering the project root is strictly forbidden.

**Allowed in Root:**
- Exactly 6 role markdown files: `Charter.md` (`af-role: charter`), `Plan.md` (`af-role: plan`), `Backlog.md` (`af-role: backlog`), `Backloglog.md` (`af-role: backloglog`), `People.md` (`af-role: people`), `Worklog.md` (`af-role: log`).
- Standard directories:
  - `10_Notes/` — All specifications, architectural designs, UI/UX conventions, meeting notes, guides, and drafts MUST live here. `10_Notes/_PROJECT_.md` (`af-role: notes`) is the project's free notes: its body is the Settings tab's Notes box, read and written with `projects.notes` (a hand-made file at that path counts; replacing words needs `expectMtime` from a read, or `append:true`).
  - `20_Decisions/` — Formal decision records (`holds: decisions`).
  - `30_Deliverables/` — Holds `Deliverables.md` (`af-role: deliverables`) and shipped assets.
  - `40_Resources/` — References, cheat sheets, and external material.
  - `90_Archive/` — Archived notes and `90_Archive/_tracks/` (`holds: tracks`).
  - `_AF/` — Machine runtime cache.

## Bridge ops

Read: `projects.brief` (`context:true` gives the exact text you were sent) ·
`projects.doc.list` / `doc.read` · `projects.plan` · `projects.backlog` /
`backlog.next` · `projects.notes` · `projects.sessions` · `projects.timeline` · `projects.current`.

`projects.tracks` (a code's whole history: which sessions, which turns, where it
closed).

Write: `projects.log` · `projects.plan.add` / `plan.check` ·
`projects.backlog.add` / `.check` / `.set` / `.code` / `.move` / `.archive` /
`.promote` · `projects.track` · `projects.decision.add` · `projects.deliver` ·
`projects.doc.write` · `projects.people.set`. Recipes: `_REF/bridge.md`.

**Handing the project over.** `projects.handover` builds the cold-start letter —
where every document and repo is, what is open, **what somebody already fought
and left open**, why it is built this way, and a first five minutes. It is not a
report of a period; ask for it when you are picking a project up, or write it
(`write:true`) when you are putting one down. Writing is a MERGE: everything
below the notes marker is the user's and survives, so it is safe to run again.

## Handing over (project extras)

Triggers, protocol and the note itself: `_REF/handover.md` — binding in a project session as in every multi-step run. In a project session, on top of it:

- the note's frontmatter carries `project:` and, when there is one, the item's `code:`;
- the worklog line (`projects.log`) links the note — `[[<note name>]]` — and deliverables are updated if something shipped;
- an unfinished coded item gets `projects.track { code, event:"touch", note }` naming the note;
- putting the project down — not just pausing a session — also writes the cold-start letter: `projects.handover { write:true }`.


**Moving a project's folder** is `projects.archive` — and it is the one project
op that touches files the user did not ask you to touch. Call it once to see
both paths, and only pass `apply:true` if they said to archive it. It is never
implied by setting the status.

`projects.templates` / `.template.save` are the SHAPE of a project ("another one
like that"). Nothing is shipped in the list; a template is saved off a project
that already proved itself, and what travels is chosen — so do not save one
unless the user asked for it.

**‼️ Opening backlog items:** When adding an item (`projects.backlog.add`), follow the legend at the top of the project's `Backlog.md` and supply its axes (`area`, `kind`, `priority`, `effort`); omitting `area` leaves the item uncoded in the inbox and out of the queue.

**‼️ Every backlog item YOU add says so.** `projects.backlog.add` stamps the
line: `#byAI` when you noticed it yourself (a **proposal** — nobody has
agreed to it) and `#byREQ` when the user asked for it (`origin:"user"` —
pass it, or their words are recorded for ever as your idea). The default is
`byAI`, so the mistake this prevents is the silent one. An item the user
types themselves carries neither.

**An item can be PART OF another** — `parent:"<code>"` on `backlog.add` /
`backlog.set`. It is a link on the child's own line: no code changes, no line
moves, and the two are queued separately, because a part and its whole are
separate work. Use it to break a large item the user gave you into pieces you
can tick one at a time; refused if the parent is not there, is the item itself,
or is one of its own descendants. It is **not** `blockedBy` (⛔): composition,
not dependency — a part does not wait on its whole.

**‼️ Backlog items are strictly single-line.** Every backlog item MUST live on a single, continuous line starting with `- [ ] <code> <Title/Description> #tags [fields...]`. Never break an item into indented sub-lines or multi-line paragraphs below the checkbox: the backlog parser scans line-by-line and drops un-checkboxed sub-lines from the item's body, causing the extension UI to display only the first heading line.

**‼️ The bottom of `Backlog.md` is the ARCHIVE (`## 🗄 Archive`).** NEVER append items to the end of `Backlog.md`. When adding items, always use `projects.backlog.add` or place the line under its active area heading (`## P`, `## K`, `## S`, `## M`, `## U`, `## X` etc.) BEFORE the `## 🗄 Archive` heading. Items placed below `## 🗄 Archive` are treated as archived history and will not be displayed as active.

**‼️ Three lists, and confusing them is the mistake to avoid.** The **plan** is
the roadmap (phase-sized, a few lines, `projects.plan`). The **backlog** is the
project's standing pile of work — coded `P-5.3`, ordered by the user's own line
order, `projects.backlog`. The **work queue** (`queue.*`, `_REF/queue.md`) is
global and belongs to no project. "Do the top five" means
`projects.backlog.next` — it drops containers, holds back items waiting on an
unfinished `⛔`, and caps effort at M so a turn is not spent half-finishing an
XL. The brief does not list the backlog — fetch it when the work needs it.

Three things these ops will not do for you, by design:

- **`plan.check` changes one character** — the space inside `[ ]`. It adds no ✅
  done-date, because that is metadata Agent Farm does not own. Point at an item
  by its 🆔 id, its line, or a piece of its text; text matching more than one
  item is an error, so be specific rather than lucky.
- **`doc.write` refuses to replace a file you have not read.** Pass the
  `mtimeMs` from `doc.read`, or use `append:true`. If it refuses because the
  file changed, the user edited it in Obsidian while you were thinking — re-read
  and reconcile, never retry with a blind write.
- **A decision or a deliverable only reaches the timeline with a real date.**
  `decision.add` writes `af-date` for you; a deliverable whose date you leave as
  prose ("Q3") is recorded in the table but not placed in time.

> **The context does not survive outside Agent Farm.** A session you continue
> yourself with `claude --resume` in your own terminal has no project block —
> measured. The brief still exists as a file (`_AF/BRIEF.md` in the project
> folder); read it if you need it there.
