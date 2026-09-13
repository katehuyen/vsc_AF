# Agent Farm — UI conventions

House rules for the extension's own surfaces. They are here so that the next
person (or agent) touching a panel does not have to be told them again, and so
that "the page I just wrote looks nothing like the others" stops happening.

Binding on every change to `media/` and `src/panels/`.

---

## The principle everything below serves

**‼️ MAXIMUM INFORMATION IN MINIMUM SPACE, AT MINIMUM CLICKS.** This is the
house rule these pages are designed against, and every convention further down
is a consequence of it. A reader who can see a fact should not have to open
anything to get at it: the click that leaves the page costs them their place,
their scroll position and the comparison they were in the middle of making.

So when you are laying out a table, a card or any page element, the question is
never "where would this fact fit" — it is **"can the reader have this without
pressing anything?"** Where the answer is yes, the hover is the tool: it is
free, it is already under the pointer, and it can be as long as the fact is.

The worked example to copy is the **sessions table** — every column, and every
figure in it, carries what a reader would otherwise have opened the session for.
A new surface is finished when it reads like that one, and not before.

---

## The five names (U-55)

‼️ **These principles have NAMES, and the names are the point.** They were being
re-explained from scratch on every backlog item — "use the new scrollable
tooltip", "put the short thing on the row and the long thing on hover", a
paragraph each time — which is how a standing rule turns into a per-item request
somebody has to remember to make. One word each, so a whole design instruction
fits in a clause and so the user never has to ask for them again.

| Name | Says | The rule |
|---|---|---|
| **AFTip** | *the panel* | Our own scrollable hover panel (`media/afTip.js`). Anything that is TEXT, or could grow into text, is an AFTip — never a native `title`. "Put an AFTip on it." |
| **DENSITY** | *maximum information, minimum space, minimum clicks* | A fact the reader can see must not cost them a click. Ask of every element: "can they have this on hover?" The sessions table is the worked example. |
| **SHORTHAND** | *short on the surface, whole in the panel* | In a narrow place — a badge, a cell, a chip — write the shortest unambiguous form and let the AFTip carry the meaning, opening with the long form as its first line. `R3` on the row, `Round 3 — …` in the panel. Never an abbreviation the reader has to learn. |
| **MIRROR** | *a control says what is IN it before it says what it is for* | A `<select>` narrow enough to cut its own text puts its CURRENT value on the first line of its tooltip, then a blank line, then the standard description. Reading a box must never cost a click that could change it — **and the panel follows the box**, or it is a mirror of a value that has been replaced. |
| **ONE SUBJECT** | *one fact, one panel* | An object carrying several hovers gives each one its own subject; no fact appears in two of them. A run's identity belongs to its title cell, the ceiling holding it to its status cell. |

They are not five separate ideas: **DENSITY** is the principle, **AFTip** is the
instrument, and **SHORTHAND**, **MIRROR** and **ONE SUBJECT** are the three
places it is most often got wrong. Every one of them is applied WITHOUT BEING
ASKED — a surface that makes the reader click for something a hover could have
said is unfinished, and saying so is not a request the user should have to
repeat. The human-facing copy of this page lives in the project folder
(`Tasarım İlkeleri.md`).

---

## Hover

**A hover is the most valuable surface on a page** — the pointer is already
there, and it costs the reader nothing. The rules below are not negotiable, and
this one comes before all of them.

### ‼️ FIRST OF ALL: A HOVER PANEL YIELDS TO THE HAND (U-74)

A panel answers a question the reader has **while they are looking**. The moment
they stop looking and start **working** — a press, a key — it has nothing left
to say and everything to be in the way of. It is not a decoration that fades on
its own schedule; it is a guest that leaves when the room is needed.

The toolbar proved what happens when it does not. `Console` is one button that
drops a two-item menu **under itself**, in exactly the place its own panel
opens. Reach for the button: the panel is already there. Press it: the panel
stays — the pointer never left the trigger, so `:hover` never ended — and the
menu is behind a paragraph. The control could not be used at all.

So, and this is `media/afTip.js`'s own behaviour, not something a page asks for:

- **A press mutes the trigger under it** (`af-mute`), with no fade and no box,
  and the mute lasts until the pointer **leaves that wrapper**. Coming back is a
  new hover and waits the full delay again — a panel that reopens under a hand
  mid-gesture is the bug, not the fix.
- **A press INSIDE the panel is exempt.** Selecting a line of a prompt is
  reading, not leaving.
- **A key does the same.** Escape, or typing anywhere: the pointer is only
  resting.
- **A trigger you can press opens slower** (`tip-act`, .6s against the ordinary
  .25s; 700ms against 420ms on `tip-free`), so the ordinary act of aiming at a
  control and pressing it never sees a panel at all. The class is written from
  what the pointer is on — a `button`, an `a[href]`, a menu item, or anything
  carrying `data-aftipact`. **No call site asks for it**; a rule a page has to
  remember is a rule the next page will not have.
- **A control whose own list is open has nothing to explain**: put
  `data-aftip-mute="<selector>"` on the wrapper naming the state, and no panel
  opens while the trigger sits inside it. Honoured on both panel kinds.

**Designing a new hover surface starts here:** ask what the reader will PRESS
under it, and make sure the panel is gone before their hand arrives.

### 0. The thing has a name, and the name is `AFTip`

There are exactly **two** hover surfaces in this extension and confusing them is
the most-repeated defect in this repo's history:

| Name | What it is | What it may carry |
|---|---|---|
| **`AFTip`** | our own panel — `media/afTip.js`, `AFTip.wrap` / `AFTip.cell` | anything: it is as wide as it needs, it **scrolls** past a limit, and the pointer can travel into it |
| `title` | the platform's native tooltip | a handful of **figures**, nothing else |

**The rule, and nobody should ever have to be told it again: anything that is
TEXT, or that COULD grow into text, is an `AFTip`.** A prompt, a backlog item, a
description, a path list, a name that a row cuts, a paragraph of guidance, a
readout of eight `Label: value` lines — all `AFTip`. `title` survives only for a
short readout of figures that will never grow.

Say **"put an AFTip on it"**; the component ships to every page from
`htmlShell`, so there is nothing to wire and no excuse to hand-roll one.

**‼️ A BLANK LINE INSIDE A PANEL IS `AFTip.GAP`, NEVER `''` (audit A-12.9).**
`AFTip.lines` drops an empty string, because that is how a caller writes a
conditional line — so `''` cannot also mean "blank line here", and for as long
as it was written that way **not one MIRROR gap in the product was drawn**: the
rule read as applied and every panel ran its value straight into its paragraph.
`AFTip.GAP` is a single space, which survives `lines`, `filter(Boolean)`, a bare
`.join('\n')` and a native `title` alike, so a gap means the same thing wherever
a page writes one. `test/test_aftip_gap.js` holds both halves apart and refuses
a bare `''` written on its own line anywhere in `media/` — it is either a gap
(use the marker) or an argument (put it on its neighbour's line).

**‼️ A PICKER NAMES ITS AXIS IN THE LIST, NOT IN FRONT OF ITS VALUE (B-03.21).**
A row of pickers has to answer "which box is this?", and there are three ways to
do it. Two of them are the same mistake: a `<label>` beside the box and the axis
written into every option both pay for the answer **out of the value's width**,
and on a ~100px box that means the part which never changes is the part that
survives the clipping — measured, the Console's row drew `model → Defa`,
`effort → Def`, `perm → De`, and `xhigh` stopped showing even its first letter.

The third costs nothing: **an `<optgroup label="…">` heading**. The browser
draws it at the top of the OPEN list and refuses to let anybody select it, so
the axis is named exactly where somebody is choosing — once — and the collapsed
box is left entirely to the value. While the list is shut, the axis is answered
by the hover, which is MIRROR's job anyway.

So a picker in a tight row is built like this, and every picker on the same row
is built the same way — a row that answers one question three ways is three
unfinished designs:

- the wrapper carries `data-axis-name` (what the PANEL calls the axis, spelled
  out where there is room: `Perm` in the list, `Permissions` in the panel) and
  `data-axis-std` (the standing explanation, written once);
- each `<option>` carries `data-why`, its own line;
- `AFTip.syncAxis` rebuilds the panel on `change` — bound once, by the
  component, so no page has to remember to call it;
- `:` is a choice somebody made, `→` is what the engine resolves to when
  nothing is named here. Two facts, two marks.

`test/test_console_axis_labels.js` measures the shape on the laid-out page and
`test/test_axis_mirror.js` drives the component itself: change the box, the
panel's heading has to change with it.

**‼️ The one place a `title` is not a compromise: an `<option>` (U-128, U-130).**
A `<select>` cuts its own text and the popup it opens is drawn by the operating
system — no `AFTip` can reach into it, so the option's native `title` is the
only surface there is, and an option without one is a fact the reader cannot get
to at all. **Never write an `<option>` tag by hand: call `C.option(value,
label, { selected, disabled, detail })`** (`media/charts.js`, on every page as
`window.AFCharts`), which puts the option's own text on the first line, a blank
line, then the detail — the same order MIRROR puts a control's current value
before its explanation. `C.optionTip(label, detail)` builds that text alone for
a site that already has its own markup. `test/test_option_tips.js` measures
every page against `test/optiontips.manifest.json`, which is now at **zero and
empty**: a page missing from it must be at zero, so the gate is a ban rather
than a budget and a new picker cannot arrive silent. A `<datalist>` option is
NOT one of these — it is a suggestion behind a text box, it opens no popup, and
no browser shows a `title` on it; the gate skips them and so should you.

### 1. A cell hover is a READOUT, not a paragraph

`Label: value`, one per line, the way a spreadsheet says it. You understand a
number from its column, not from a sentence next to it. So:

- **No explanations in cells.** Not "wall clock, not time spent working", not
  "a plan session is not billed this way". Whatever a column MEANS is said once,
  on its `<th>`, in a short definition — never repeated under every figure on
  every row.
- **Fill the space with figures instead.** Every hover should carry the derived
  numbers the row already implies: per turn, per API call, per hour, share of
  the total, top-N breakdowns. All of it from data the page ALREADY has —
  never a second query per row, which is what makes a table expensive.
- **A thin tooltip is a bug.** One line under a hover is a wasted hover. If a
  column genuinely has only one fact, add the neighbouring facts about the same
  object: the row is the subject, not the cell.
- **Don't invent a figure whose denominator is not worth dividing by.** A
  twenty-minute session has no hourly rate; say nothing rather than clamp.

**The one exception** is a definition behind its own glyph — the ⚖ weighted-token
note (`charts.js` `WEIGHTED_TIP`), which hangs off a `?` and exists only to
explain. A tooltip whose whole job is to teach is allowed to use words.

### 1b. A CONTROL's hover says what is IN it before it says what it is for

‼️ **The changing half first, then the standing explanation, with a blank line
between them.** A `<select>` in a dense row shows its chosen value cut
(`Default → son…`, `acceptEd…`), and a multi-pick button can only ever read
`show: 3/7` — so the one question a reader has in front of a filtered list
(*which three?*) could be answered only by OPENING the control, which is the
gesture for "I am about to change this", performed by somebody who only wanted
to look. Meanwhile the hover was spending all of itself on a sentence that never
changes.

- **`AFFilter.multi` does it for every picker in the extension** (`selectionLine`
  in `media/afFilters.js`): the whole selection by name, then the page's own
  subject line, then the shared interaction guidance. Its button is wrapped in
  a scrollable `AFTip` with `tip-free`; a page never falls back to a native
  `title` for the explanation. Nothing a page does has to know.
- **A hand-rolled `<select>` does it with a two-line helper** — the Console's
  composer is the worked example (`boxTip` in `media/console.js`).
- **A box with nothing to name opens on the explanation**, never on a blank
  first line: an empty line above the text reads as a value that is empty.

### 2. Anything that is TEXT uses `AFTip`, never `title`

A native tooltip repeats what the cell already drew and then stops wherever the
platform feels like stopping. For a prompt, a backlog item, a project's details,
a path list, that is the worst possible treatment.

Use **`media/afTip.js`** (`AFTip.cell` / `AFTip.wrap`) — the box the backlog's
`more` proved out: as wide as it needs, scrollable past a limit, and the pointer
can travel INTO it (`:hover` is on the wrapper, no gap). It ships to every page
from `htmlShell`, so there is nothing to wire.

```js
// a whole <td> becomes the trigger
AFTip.cell(cls, attrs, inner, head, body)
// wrap an inline trigger (a button, a word)
AFTip.wrap(triggerHtml, head, body)
```

- `head` — one line of scale: what this is and how big (`"Turn 3 · 12 May · 2,480 characters"`).
- `body` — the thing itself, **whole**. Do not truncate to be polite; the panel
  scrolls. The only caps are at the data layer, and they are documented there
  (`SessionInfo.firstPrompt`, `TURN_PROMPT_MAX`).
- ‼️ **A blank separator is part of a STRING, never an entry of its own.**
  `AFTip.lines` drops `''` so a caller can write `cond ? x : ''`; a separator
  written as an empty entry therefore vanishes, and the standing sentence ends
  up glued to the last figure. Write `'\nAnd the sentence…'` (or `x + '\n'`),
  the way the composer's `boxTip` does.

Where this already applies, and where a new surface should follow it: session
Title (title + the whole opening prompt) · Project (what the project IS, folders
first) · every turn's prompt · backlog items · the Next up strip's codes · every
line of a Console card and of the Resume list (U-50).

**‼️ A CARD IS AN OBJECT, SO IT CARRIES SEVERAL PANELS — ONE PER SUBJECT, AND NO
FACT IN TWO OF THEM.** The Console's cards are the worked example: the identity
line says WHO and WHERE, the name says WHAT THIS CONVERSATION IS, the figure
says WHAT IT HAS SPENT, the phase says WHAT IS HAPPENING RIGHT NOW. Split that
way, four panels answer four questions; split badly, they are four copies of one
paragraph and the reader learns to ignore all of them — which is the state U-50
was raised about. Two tests come out of it and both are cheap: **name a
subject** for every trigger you add, and **grep the card for a label you have
written twice**.

**‼️ …AND THE ROW ITSELF THEN CARRIES NO `title`.** A native tooltip anywhere on
an object that also has panels races them: which of the two you get depends on
which pixel you stopped on. Put everything the row-level `title` said into
whichever panel owns that subject, and delete it.

**‼️ `cls` LANDS ON THE WRAPPER, AND THE WRAPPER BECOMES THE CHILD.** Wrapping a
trigger takes it out of its parent's layout: a flex item sized by a rule on the
trigger silently stops being sized at all. Move that rule to the wrapper class
in the same edit, then **measure the row** (`measure_page.js`) — this one is
invisible in a string test and obvious in a picture only once it is bad enough
to overflow.

**‼️ …BUT NOT INSIDE A WINDOW THE READER OPENED.** The rule above is about a row
you *pass over* on a page that is showing you something else. A modal list — the
Console's saved-prompts picker — is already the thing that was asked for, and
its rows are read against each other: a panel opening on each one covers the two
neighbours being compared, on a gesture nobody made. So a picker row carries the
label and a short preview and **no hover at all**; whatever the panel would have
held has to be reachable another way (choosing pastes the whole text; `✎ Edit the
file` opens the source). Nothing in a modal earns a second layer over itself.

**‼️ A trigger inside a SCROLLING box needs `tip-free`.** The panel grows out of
its trigger, so an ancestor with `overflow:auto` — the backlog capture's "part
of" picker, a 340px column — clips a 620px box down to nothing and puts the rest
where the pointer cannot reach it. `AFTip.wrap(trigger, head, body, 'tip-free',
'data-aftip-anchor=".the-block"')` takes it out of the flow (`position:fixed`,
the one thing `overflow` cannot clip) and afTip.js places it against the named
BLOCK rather than against the row you happened to be on. It also slows both
edges of the gesture: longer to open, because sweeping a list must not flash a
paragraph at every row, and a grace period on the way out so the pointer can
travel into it.

**‼️ A HOVER SURFACE OPENS TOWARDS THE MIDDLE OF THE WINDOW, NEVER TOWARDS THE
EDGE IT IS ALREADY ON.** This is the rule, and it is not about one control: the
Console composer's `?` sits a few pixels off the BOTTOM of the window, the panel
hung *downwards* out of it, and nearly all of it was off screen — which is the
same mistake as a 760px panel on the last column of a row growing further right.
Anything anchored near an edge flips to the roomier side; where neither side
fits, the roomier one still shows more.

`afTip.js` does it for every panel from real measurements the moment the pointer
arrives — before the open delay, so nothing is ever seen moving — by writing
`af-up` / `af-left`, which `common.css` honours. **The classes are the
component's**: a page's own `tip-right` / `tip-block` are statements about a
LAYOUT and are never overruled by them, and a `tip-free` panel is placed in full
by the placer instead. So there is nothing to opt into and nothing to remember —
but if you ever hand-roll a floating surface (a menu, a popover, a card that
grows out of a button), it owes the reader the same measurement.

**‼️ It survives a repaint, and that is the component's job, not yours.** These
pages redraw whole sections on the host's beat, and a browser does not put
`:hover` back on the node that replaced the one the pointer was on until the
pointer moves — so a panel somebody was reading used to close by itself. The
component bridges it (a `.af-on` class, the scroll position carried over, dropped
the moment the pointer moves); `test_tip_repaint.js` holds it. Nothing a page
does has to know about this, and no page should re-invent it.

---

## A run's dimensions travel by the SHAPE, and the rule is DERIVED

**`runExtras` (`src/core/tasks.ts`) is the one carrier of `RunDimensions`. A
place that hands one run's dimensions to another goes through it — never through
a hand-written list of field names.** If a path has its own fields to state
(a retry's policy, a round's remaining prompts), they are written AFTER the
spread so they win.

Measured on one day in 2026-09: three hand-written lists in this file, each
believed complete by whoever wrote it. `maybeScheduleRetry` dropped seven
dimensions; the round boundary dropped five and did it while `--resume`ing the
same conversation, so round two answered as an account that had never seen the
transcript; the Tasks panel's three save paths dropped the account entirely, so
every task written from that form for four months billed a plan nobody named.
A hand-written list is not wrong when it is written. It is wrong on the day the
eighteenth dimension is added, and nothing tells anybody.

**And the rule is measured by READING `RunDimensions` OUT OF THE SOURCE, not by
listing the fields in the test.** `test_retry.js` (two regions) and
`test_task_seed.js` (five readings) cut each literal out by brace balance and
require every field of the interface to be named inside it. A dimension added
tomorrow fails these tests until its wire is connected — which is the only
version of this rule that survives the person who wrote it.

X-169 is the argument. It was tested against mock launch doors, went green, and
closed with its live wire never connected. **A test that does not derive the rule
proves that somebody once wrote the code correctly, not that the rule holds.**
When a fourth list appears, copy the shape of those tests: find the anchor text,
cut the object literal by brace balance, look for each field name inside it.

## The parity gate

**Every user-triggerable action is recorded in `parity.manifest.json`, and the
build fails if a new one is not.** `test/test_parity.js` reads the three places
a capability can be declared — `contributes.commands`, the right-click
catalogue, and the `case '…':` arms of the panels' message handlers — and
checks each against the manifest, where it carries its UI doors and **either**
the bridge op(s) that do the same thing **or** a reasoned exemption. This is
the rule in `_REF/agentfarm-dev.md` with a machine behind it: B-3 closed 62
gaps found by a hand scan, and a hand scan rots the day it finishes.

- **`node test/test_parity.js`** audits (and runs in `npm test` and
  `npm run package`). **`--fix`** re-derives the manifest from the real
  commands, keeping every decision that is still about something that exists.
  **`node tools/parity_suggest.js`** answers "then which op *would* have
  matched?" while you are filling one in.
- **An exemption is one of five kinds** and nothing else: `navigation`,
  `visual`, `file-picker`, `secrets`, `human-only`. "We will do it later" is
  refused by name — an unfinished capability belongs in the backlog.
- **The shared core is DERIVED, not declared.** A mapped capability passes only
  if its handler and its op share a real symbol — a core function, a wired
  dependency, a manager method. An op that reimplements what the page does has
  nothing in common with it, and that is the failure this gate exists for.
  **`--why <capability>`** prints which symbols each side has and which are
  shared, so a `core-drift` is named instead of hunted. The wire is read with
  comments blanked (a doc comment once matched `store:` and stapled 38 KB of
  host onto both sides — green by accident), and a dep value that is a bare
  host name (`store: docOpenStore`) is read through to its declaration, one
  hop, because that is where both sides were handed the same object.
- **`gap` is the honest third answer:** on the UI, not on the bridge, with a
  sentence saying what the missing op would have to do. `gapBudget` is a
  ratchet — lower it when you close one; raising it is a line in a diff with
  your name on it.
- A right-click item is a second **door**, not a second capability (it is
  either a command drawn again or a relay to the page's own handler), and
  `test_ctxmenu_reach.js` is what proves those relays land.

### An account slot's contents are the SHAPE of its adapter, too (X-284)

The same rule, one level down. What a captured account must carry to count as
COMPLETE is not a list anybody writes: `core/slotCompleteness` derives it from
the engine adapter's own fields — every `ownFiles` entry an `own:` clause
(identity, the account's, never repaired in place), every `carryFiles` entry a
`carry:` clause and every `requiredEnv` var an `env:` clause (reproduced by
X-269), every `sharedPaths` entry a `link:` clause (a junction to the pool,
X-271), every `ownership` entry a `keys:` clause (the fleet's keys INSIDE a
file the slot holds, X-274), and the adapter's `liveWire` the `hooks` clause
(the engine's own wire, X-295). `CONTENT_KEYS` / `META_KEYS`
classify every field of `EngineAuthAdapter`, and `test_slot_completeness.js`
reads the interface out of the source: a new field in neither list fails the
build. So the eleventh thing an isolated session turns out to need (plugins,
skills, folder trusts, MCP grants — X-273, X-274) is added by giving the
adapter a field and this module a deriver, and every gate, the
`accounts.complete` op, the card badge and the Doctor line see it at once.

- **The unit of ownership is the KEY, not the file (X-274).** `.claude.json`
  is the slot's sign-in, the fleet's folder trusts and MCP servers, and a page
  of telemetry in one file, so neither `own:` (copy once) nor `carry:` (render
  over) is right for the whole of it. The adapter's `ownership` names each
  key's policy — `fleet` (projected at every gate, absence included) · `slot`
  (never touched) · `ignore` (never compared, never written) — one level down
  too for map-shaped keys (`projects.<path>`), in every entry the fleet has;
  an entry only the slot has is the slot's. **The default is `ignore` and that
  is load-bearing:** counting the 21 telemetry fields of a project entry as
  drift would rewrite every slot on every gate for ever (the 3.469.1 fault).
  Compared by value (`core/keyOwnership`), and an unreadable slot file is a
  gap the repair refuses to write into — a projection into `{}` would erase
  the sign-in.

- **A carried file the directory must SIGN FOR ITSELF is projected (X-295).**
  A verbatim carry is compared as bytes (X-279: a TOML file parsed as JSON is
  `{}` on both sides and a clause that cannot fail). But Codex keys its hook
  trust in `config.toml` by the hook file's path *as it resolves it*, so the
  fleet's bytes, copied, trust nothing in the slot. `carryProject[file]` is
  the honest text: the fleet's bytes with every hook of the fleet's
  `hooks.json` trusted under the slot's `realpathSync.native` path
  (`core/codexHooks` reproduces Codex's hash and is pinned to the seven values
  the real machine reported). Still nothing parsed, nothing re-serialised, and
  a record the directory added on its own is kept — X-291's rule for an answer.
- **The wire is the engine's, not a file name's (X-295).** `hooks` used to be
  derived from "carries `settings.json`" — an engine file name in the
  engine-agnostic layer, which is how a second engine reads as "no wire" for a
  release. An adapter declares `liveWire` (read / repair / whether the fleet's
  own directory is its to sign / which JSON keys it owns inside a carried
  file); `slotCompleteness` names no engine file, and `test_codex_hooks.js`
  greps that it does not.
- **Two things describe one hosted conversation, so the mirror says only what the
  wire will not (X-297).** The engine's hooks and the Console's own mirror write
  into the same live lane, and silencing the mirror wholesale the moment a hook
  spoke lost everything no hook carries: the agent's reply (U-78), the question a
  turn is parked on (A-18), and the END of a Codex lane, whose seven hooks include
  no `SessionEnd`. Suppression is **per event** — `mirrorOwns` in `core/live.ts`,
  a function a test can pin rather than a closure inside `activate()`.
  **‼️ And it suppresses against what has been HEARD, never what a file claims.**
  Codex declares a `Stop` hook and `config.toml` trusts it; measured on the build
  that first shipped this rule, two turns in a row produced no `stop` at all, so
  trusting the declaration removed the only turn-end that lane had. The adapter's
  `liveWire.events` is the upper bound (Claude's is the installer's list, Codex's
  is READ from the user's `hooks.json`); what actually arrived is the proof, kept
  per engine in `globalState` so the NEXT session's first event can already stand
  aside — which is what closes the race where Codex names its thread eight seconds
  before its first hook fires.
- **"Complete" means "carries the LEAST possible"** (X-270). A clause's repair
  never copies something new into a slot: it links, or it re-renders from the
  fleet's source. The acceptance test of the contract is to delete a slot folder
  and capture the account again and lose the user nothing.
- **A repair is the gate's own primitive, never a second implementation.**
  `completeSlot` calls `reproduceSlotSettings`, the injected
  `repairSharedLinks`, the adapter's own `liveWire.repair` — the code the gates run — so
  the contract cannot disagree with the gates about what "fixed" means.
- **A question before a tool.** `accounts.complete` defaults to `dryRun:true`.

---

## A shape assertion is measured as a SHAPE, never as a character budget

Dozens of guarantees in this suite are regexes over `src/` text — "the overlay
is built above the branch", "the same map reaches both doors". They are the
right instrument for a wiring rule no unit test can see. Two ways they lie, and
both were found red and dismissed as "pre-existing failures" for days while the
code they check was correct the whole time:

- **A distance budget fails for editing, not for breaking.** `A[\s\S]{0,1400}B`
  is not the claim "A happens before B", it is the claim "no more than 1 400
  characters of prose fit between them" — and a comment in `close()` grew by
  **nineteen** characters. Write the ordering: take the two indexes and compare
  them. If the two really must be near each other, say why in a comment; if they
  merely are today, the budget is measuring the author's typing.
- **Line endings are per file in this repo, so a regex with a literal `\n` is
  reading one of them.** `src/core/tasks.ts` is CRLF: `env\r\n` never matched
  `env\n`, and two assertions about a correct guarantee went red without a line
  of the guarantee having moved. **Read source through one helper that
  normalises** (`.replace(/\r\n/g, '\n')`) — the assertion is about the shape,
  and the newline is not part of it.

A red test nobody can explain gets fixed or deleted in the turn it is found. It
does not get carried in a handover note as a known failure: the moment a suite's
number is "N passed, 4 failed, the same four", nobody reads the four again.

## The wiring gate — a callback that defaults to a no-op can be left off (X-267)

**What happened.** `ConsoleHost` was given a ninth constructor parameter,
`pinProjectContext`, defaulted — like every one of its siblings — to `() => {}`.
`extension.ts` was never changed to pass it. The build compiled, the twenty-nine
assertions of `test_context_pin.js` stayed green, and the Console silently never
pinned a conversation: measured on a live session, the `pinned/` folder had not
even been created. Every revive went on re-composing the brief the pin existed
to reuse — the 304k-token cache miss the release was named after.

Neither of the two things that normally catch a mistake can catch this one. The
**type checker** cannot: a default is precisely what makes the argument
optional. A **suite** cannot: it constructs the object itself, with every
argument, which is what a mock is for. It is only visible at the call site, so
that is where it is measured.

**The rule.** A constructor parameter whose default is a **no-op-shaped
callback** (`() => {}`, `() => undefined`, `sid => undefined`) MUST be passed at
every `new` site in `src/`. Two exemptions, both meaning something:

- a `?` **optional** parameter — absent is a real answer there;
- a **real** default (`= 'claude'`, `= 200`) — leaving it off asks for that
  value, which is a decision rather than a silent nothing.

`test/test_wiring.js` enforces it, derived rather than declared: the parameter
list is parsed out of the class and the argument list out of the `new`, so
neither is written down in the test to drift from the code. With the argument
removed it reports `new ConsoleHost(…8 args) drops pinProjectContext` and exits
1. Run over the whole of `src/core` it found exactly one gap — this one.

**And the design lesson underneath it.** Callbacks passed **by name**, in an
options object, cannot be lost this way: `tasks.ts` and the mission planner take
`pinProjectContext` as a named field and a missing one is a compile error. They
were both correct on the day the Console was not. Prefer an options object for
anything past two or three constructor arguments; a long positional list with
defaults is a place where a wire can go missing in silence.

---

## Adding a mission primitive (X-69)

**A primitive is a row in two places, and both are checked.** `PRIMITIVES` in
`src/core/missionPrimitives.ts` declares what EXISTS — name, scope, shape, kind,
the words the lead is shown. It holds no behaviour on purpose: it is data, the
prompt is built from it and surfaces reading a recorded run import it, so an
engine import would make a cycle out of a list. `PRIMITIVE_HANDLERS` in
`src/core/missions.ts` is what each declared name is DONE with.

- **`parse` is required on every row.** It takes a `ParseCtx` and returns a
  `ParseResult` — the same contract for all of them, so there is no chain to
  fall off the end of. Two primitives may share one parse (`finish`/`abort`,
  `delegate`/`parallel`) when the reply they read is genuinely the same.
- **`prepare` is required on every `work` row** — `PrepareCtx` in, tasks or a
  refusal out. A handler reaches the engine only through `lend` (the engine's
  own work, passed by name): if a new primitive needs something else, add it
  there in the open rather than reaching for `this`.
- **`ownRound: true` is the one alternative to `prepare`,** and `evaluate` is
  the only row that carries it: it orders work but the verdict IS its round, so
  it runs its own wave. A new row does not get this without a reason of the
  same size.
- **Narrow the decision with a guard, never a cast:**
  `if (d.action !== 'x') { return wrongHandler(d); }`. The table is written by
  hand and the mistake it invites is wiring a row to its neighbour's function.
- **The gate is `primitiveHandlerParity()`**, asserted in
  `test/test_mission_primitives.js`: a declared name with no parse, a `work`
  name with neither `prepare` nor `ownRound`, a non-work name that carries
  either, or a handler for a name nobody declared — each one fails the build.
  The type system catches the same thing earlier (the table is total over
  `PrimitiveName`); the test also catches a row appended at runtime, which is
  the shape of "somebody added a primitive and forgot the rest".

---

## Looking at it

**A selected control must remain selected after the pointer leaves it.** Hover
is an action hint, never selection state. Toggle cards and segmented modes use
all four signals together: persistent fill, focus-colour border, a check mark,
and `aria-pressed="true"`. Do not rely on colour alone; a theme may collapse the
difference between two backgrounds.

**‼️ A VISUAL CHANGE IS NOT DONE UNTIL SOMEBODY HAS SEEN IT.** Nothing between
writing a CSS rule and shipping a VSIX draws these pages: the page script runs
in a webview, the tests read its markup as strings, and every string assertion
in this repo passes just as happily on ten tabs in one hue and a six-character
badge in a 92px box. Both of those shipped. Both were obvious in one look.

```
node test/render_page.js <fixture>            → dist/render/<fixture>.html
node test/shoot_page.js  <fixture>            → …and a PNG beside it
node test/render_page.js track --only timeline --light
node test/shoot_page.js  track --light                 → BOTH take --light
```

- `render_page.js` runs the REAL page script through the tests' own DOM shim
  (`lib_page_dom.js`), wraps its markup in `media/common.css` and a stand-in for
  the editor's theme variables, **puts it back inside `#app`**, and writes one
  self-contained HTML file. ‼️ That last part was missing and it mattered: the
  shim hands back what a page WROTE into `#app`, not the element, so a page
  capping its own width there (`#app{max-width:1180px}` — the Search page) was
  photographed at the full window instead. Every width read off those pictures
  was a width of a layout the user cannot produce.
- `shoot_page.js` photographs it with a headless Chrome **already on the
  machine** — no Playwright download. It uses a throwaway profile: the user's
  own browser windows are never touched, which is not a nicety.
- **‼️ AND IT PHOTOGRAPHS THE WHOLE PAGE, WHICH IT DID NOT UNTIL A-12.10.**
  Chrome's `--screenshot` captures the VIEWPORT, and this tool used to hand it a
  fixed `--window-size=<w>,2400` — so every fixture taller than that was cut at
  2400 and nothing said so. Measured: `missions` is **18,449px over 19 scenes**,
  and scenes 4–19 had never appeared in any picture anybody looked at. The
  height is measured off the laid-out page now (`--dump-dom`, the same route
  `measure_page.js` takes — never a debug port), and the tool prints the size it
  took.
- **‼️ …AND THE HEIGHT IS WHAT IS DRAWN, NOT WHAT THE PAGE SAYS IT IS.** A-12.10
  fixed the cutting; the same expression was still inflating. A fixture carries
  the PAGE's stylesheet, and `media/console.js` declares
  `html, body { height:100% }` — so `body.scrollHeight` answered the measuring
  window and **every `--scene N` of the Console came back 1400×2305**, five
  times its own height, for scenes as short as 418px. Nothing said so: the
  picture was right at the top and empty below, and a reader scaling 2305px to
  fit shrank the scene to a fifth for nothing. The height is now the lowest edge
  anything is **drawn** at — `checkVisibility` leaves out a closed AFTip panel
  (a 5,169px block inside a `position:fixed` shell), every clipping ancestor is
  intersected (a scrolled-away row is not on the screen), and the body itself is
  not counted as a clipper (it declares its own overflow, and counting it threw
  away every scene past the first). `test/test_shot_height.js` measures all
  three cases; `test_shoot_page.js` pins the shape.
- **‼️ READ A MONTAGE ONE SCENE AT A TIME.** Nothing is lost any more, but
  18,449px scaled down to fit a reader is ~100px a scene, which is not looking
  either. `node test/shoot_page.js <fixture> --scenes` numbers them; `--scene N`
  removes the others before measuring and writes `<fixture>.sN.png` at the
  scene's own size. **The scene you photograph is the one that carries the thing
  you changed** — a montage's first scene is almost never it.
- **Fixtures live in `test/fixtures/`** and their shape is the point. A fixture
  with one open item and one closed one makes any palette look balanced; a real
  ledger is mostly `done`, which is how a scheme that shouts on `done` becomes
  one flat green. Give it the real distribution, and give it Turkish text —
  that is what these pages actually carry.
- **‼️ DRAW THE ARITY THE USER ACTUALLY GETS, not the one that shows the
  feature off.** U-133 is the record of this: the fold control on the ask
  card was pushed to the right edge by a rule that lived on the ANSWERED
  COUNT, and the count is only drawn when there is more than one question.
  The fixture scene asked FOUR and so did its test, which is the single arity
  where that layout came out right — so every picture ever taken showed the
  control neatly in the corner while the card an agent usually puts up (ONE
  question) dropped it mid-row, straight after the words "is asking". Both
  the render and the suite certified the bug for a day, and the user found it
  in one look at their own screen.
  **So: one and many are two pictures, not one.** Empty, one, many, and
  too-many are different layouts wherever a count, a wrap, a scroller or an
  `auto` margin is involved — and the one to add first is the SMALLEST, because
  the rich scene is the one somebody already built to demo the feature.
- **Check the light theme too** (`--light`). `color-mix` over a dark fallback
  and `color:#fff` on a chip are the two that fail there and only there.
- **‼️ Render again before you shoot — `shoot_page.js` photographs whatever
  render is on disk.** A mutation run (a guard's own test calls `render_page`)
  leaves `dist/render/<fixture>.html` drawn with the MUTANT stylesheet; restore
  the source and the render stays. Measured (B-06.2): the repair was in the
  file, the measurement said 0 cut, and the first picture still read
  `Antigra…` — a photograph of the defect, one command away from being filed as
  proof of its repair. `render_page` (both themes) is the first half of every
  look, not a step you did earlier.
- **‼️ What only exists after a press has to be photographable, or it ships
  blind.** A hover panel, a filter menu and a row editor are each a closed
  button in a picture taken of the page as it loads. Three ways in, in order of
  preference: a variant's own `act(r)` **presses** what a reader presses (the
  shim binds the same handlers, so this is the honest one — it is how the wiki's
  row editor is drawn); `--tip <class>[:n]` opens a hover panel with the
  component's own stay-open class — ‼️ it could not open an `AFTip.cell` panel
  at all until A-12.9 (`cell` writes `class="turncol af-tipw"` and the matcher
  was anchored at `class="af-tipw`), and it said so in one line and rendered the
  page anyway, so the shot that followed photographed a closed panel; a `--tip`
  that opens nothing now **exits non-zero**; and `--menu [id]` takes the `hidden`
  attribute off a filter menu, which is needed because the page shim does not
  wire `afFilters` at all (its stub menus have no `querySelectorAll`), so no
  press can open one. A `--menu` that opens nothing exits non-zero too.
- **‼️ …AND A SCENE THAT NEEDS ONE OF THOSE NAMES IT ON ITSELF** — `tip: 'tip-hist'`,
  `menu: 'wk-topic'` on the variant, beside its `label`. A flag is something a
  person has to remember, and the measurement of what happens when they do not
  is `missions/history`: labelled "the recorded history strip, **panel open**",
  it had no `act` and no tip, so every photograph ever taken of it was byte for
  byte the scene above it and the panel existed only in the label. Two more were
  in the same state (`jsonsettings-open`, `wiki/topics`), one of them carrying
  the flag in its label as an instruction. `test/test_scenes_differ.js` draws
  every scene of every fixture and refuses an **undeclared** duplicate; a scene
  that really is a twin of another (the Console's palette needs a press this
  shim cannot make) says `twin: '<id>'` and says why in a comment.
- **‼️ AND A SCENE THAT ANSWERS THE HOST HAS TO BE ANSWERING WHAT THE PAGE ASKED.**
  `missions/form-preview` exists to prove the refusal list a draft collects and
  a row drawing its own engine's catalogue. It showed neither, for its whole
  life: the page accepts a resolution only when its token matches the draft as
  it stands (`previewSeq`), and the scene invented `seq: 0`, which the first
  render has already moved past. A fixture may give the shim a real
  `setTimeout` (`window: { setTimeout: (fn) => { fn(); return 0; } }`) so the
  page's own debounced request is really posted, then read that request out of
  `r.posted` and answer with **its** `seq` — which is all the host ever does
  (`missionsPanel.ts`, `case 'preview'`).

**‼️ AND SOME DEFECTS ARE ONLY VISIBLE TO A MEASUREMENT, so they get a test that
measures.** Three were found in one audit session and not one of them could
fail a string assertion — the markup was correct in every case:

- `test/test_table_row_display.js` — a class on a `<tr>`/`<td>`/`<th>` may not
  be given a non-table `display`. The Missions delegation table drew its column
  headers in the right third of the page because `.srow` was ALSO the mission
  composer's `display:flex` form row, 350 lines away; a `<tr>` turned into a
  flex container leaves its `<thead>` laying itself out alone.
- `test/test_team_row_columns.js` — a repeated row grid draws the same slots in
  every row. Dropping the account picker on a member whose engine has no
  sign-ins (right: a box with no referent is forbidden) let the other five
  controls grow, so three rows of the same five axes had none of them in the
  same column. The box still is not drawn; the SLOT is held.
- `test/test_console_identity_width.js` — nothing is drawn narrower than one
  character of itself, and every session card shows its whole name and id. The
  session list is a fixed 250px column, and a card with four badges squeezed
  the agent name to **zero** pixels; below one character there is not even an
  ellipsis to say something is missing. It runs Chrome and skips itself when
  there is none, like `test_shoot_page.js`.
- `test/test_console_column_ruler.js` — blocks stacked in one column share one
  left edge and one right edge. The "still working" strip carried 4px of
  padding where the composer has a 1px border and 8px, so its right-aligned
  meta line ended 5px past every row below it. Five pixels nobody would find by
  looking at the strip — until the "/" picker opens over it, hanging off
  `.tawrap`, and those five pixels are the only part of the covered line left on
  the screen: the tail of a letter floating beside the panel.
- `test/test_shot_height.js` — the picture is as tall as what is drawn on it,
  measured on the three cases whose obvious repairs break each other (a short
  scene of a body-pinning page · an open panel hanging below its page box · the
  whole montage of that same page).
- `test/test_settings_control_width.js` — **‼️ A NATIVE `<select>` IS INVISIBLE
  TO BOTH OF THE SWEEPS ABOVE**, and nine surfaces of audit walked past this
  because of it: its `scrollWidth` never exceeds its box, and its value is not a
  text node at all — the browser paints it. So neither "an `overflow:hidden` box
  whose content overflows" nor "a text node drawn narrower than one character"
  can ever fire on one. The third sweep measures the **selected option's text in
  the select's own font** against the select's own content box:

  ```
  var cs = getComputedStyle(s); c.font = cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
  var need = c.measureText((s.options[s.selectedIndex]||{}).text||'').width;
  var room = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 16;   // 16 = the arrow
  ```

  Found: `opencode/nemotron-3.5-lightning-free` needing 173px in a box pinned to
  150px, **on a row with 1,106px of unused width beside it** — and the scene's
  own title was "where a model id is a sentence". Run over all 30 fixtures it
  answers with **77 clipped boxes on four surfaces**; not every one is a defect
  (a placeholder 11px short is not), but `💻 Machine Global` in 44px and `low`
  in 12px are. Judge each on its own surface; the sweep only finds them.

It asserts nothing and is not in `npm test` — a page that looks right proves
the CSS, never the behaviour. It is the looking glass, and looking is the part
that kept being skipped. The looking glass ITSELF is in `npm test`, though
(`test/test_shoot_page.js`): a tool that quietly hands back a third of the
evidence is worse than no tool, because everything downstream of it reads as
measured.

**‼️ …AND WHEN THE QUESTION IS A NUMBER, MEASURE IT.** A picture answers "does
this look right"; it does not answer "how wide is that box, and what is
deciding it". Widths in this repo have been argued about in *shares of numbers
nobody read off the screen*, and a share of a guess is a guess.

```
node test/render_page.js console
node test/measure_page.js console "[...document.querySelectorAll('.crow select')].map(e => e.id + ' ' + Math.round(e.getBoundingClientRect().width))"
```

`measure_page.js` runs the same rendered file through the same already-installed
Chrome, evaluates one expression against the laid-out DOM and prints what it
returns. It uses `--dump-dom`, **not** a debug port: opening a CDP connection on
a user's machine is a thing to ask about first, and a DOM dump needs no
permission at all.

---

## Copy

One clipboard path and one receipt: `AFTextTools.copyFrom(el, value)`. The async
API with an `execCommand` fallback, and a ✓ that appears **only once the write
actually happened** — a tick for a failed copy is worse than no button.

Anything a person repeatedly needs somewhere else (a session id, a path) is worth
one click.

---

## Filtering

### A search box is a QUERY box

**`media/afQuery.js` is the only place a query becomes a match.** Never write
`hay.toLowerCase().includes(q)` again: compile once outside the row loop, then
ask.

```js
const q = window.AFQuery.compile(state.q);       // once per render
rows.filter(r => q.test(r.title + ' ' + r.agent));
// q.empty is true when nothing was typed — test() is true for everything then,
// so the guard is only worth writing where the haystack is expensive to build.
```

- **The extension host runs the same file** (`src/core/query.ts` loads it out of
  `media/`), so a page filter and the search that feeds it cannot drift apart.
  Anything host-side goes through `compileQuery` for the same reason.
- **Pass the RAW box value.** The grammar decides its own case handling; a
  pre-lowercased string breaks `match case` and nothing else improves.
- **Every box gets `AFQuery.tip('what THIS box searches.')` as its hover** — one
  line of subject, then the shared grammar. A box that explains the grammar in
  its own words is a box that will explain it differently next month.
- ‼️ **…EXCEPT THE ONE BOX A WHOLE PAGE IS FOR.** A hover is free on a cell you
  pass over; on the control you are *using*, it is a paragraph that opens every
  time the pointer crosses the thing your hands are already on. The Search
  page's query box has a `Syntax ▾` card one press below it, so it carries no
  hover at all — and everything the hover knew that the card did not (what the
  box actually searches, what each mode does to the grammar, the regex time
  budget, what Meaning does not cover) was **moved into the card**, not dropped.
  The test is ownership: a filter box in a table row keeps its hover, because
  there is nowhere else for the grammar to live. A page that draws the grammar
  in full does not also whisper it.
- ‼️ **The hover text is BUILT from the Syntax card's own rows** — `SYNTAX` is
  derived from `SYNTAX_ROWS`, not written beside it. It used to be a second
  hand-written list whose comment claimed otherwise, and it drifted exactly as
  you would expect: the card grew a rule (`"a* b*"`) that twenty hovers never
  learned, while every hover went on telling boxes to press a **Whole word**
  toggle that exists on one page out of eleven. If you add a rule, add a row.
- The grammar itself is documented for users in `docs/BLUEPRINT.{en,tr}.md`; the
  file is the spec, `test/test_query.js` is the guard.
- ‼️ **And it is swept, not remembered** — `test/test_query_boxes.js` fails on
  any `media/` file that decides a match with `toLowerCase().includes(…)`, and on
  any page that compiles a query without offering the grammar on its box. Both
  checks were written because two boxes had been left behind for months (the
  Session Viewer's transcript filter and the Task Analytics tables), and nothing
  on either page looked wrong.

### The SHAPE of a control states the arithmetic of the choice (X-217)

A switch says "these go on and off independently". A radio — or the badge/chip
pair below — says "exactly one of these is chosen". A chip says "pressing me
does something". Before drawing a control, read what the code actually enforces:
the Engines page drew a row of switches over the standing accounts, where
`normalizeActive` had always kept exactly one per engine, so turning a second one
on turned the first off by itself. That is not what a switch means anywhere else,
here or outside — the control was promising an arithmetic the code refuses.

Single selection is drawn as single selection: the chosen member wears a **state
badge** (`🟢 standing`), every other one carries an **action chip**
(`⚡ Use this one`); one class, two states; `role="radio"` with exactly one
`aria-checked="true"`, so the shape says it to a reader who never looks at a
pixel. And it is drawn ONCE — the head pill that also said `standing` went with
it, because a fact in two places is two facts that can disagree.

A switch stays right where members really do toggle independently. Both shapes
existing is the reason they must not look alike.

### On a control row the FACTS do not shrink — the boxes do

The user's own words, the day they reported it: *"they stay fixed, what has to
squeeze, what has to get smaller, is the boxes."* Two kinds of thing sit on a
control row and they behave differently when it narrows:

- a **FACT** is what cannot be changed from that row — the agent a session
  opened in, the engine badge, the route beside it. It is the row's identity;
  shrinking it buys the reader nothing and costs them the label that says whose
  conversation this is. `flex:none`, always.
- a **CHOICE** is a box. Boxes are what give ground, and the spacer (`.grow`)
  gives its slack up first, because a gap holds no information.

A fact still needs a floor for the absurd case: the ellipsis goes on the **inner
span**, never on the wrapper — the wrapper is the AFTip panel's parent, and
clipping it clips the panel.

‼️ **AND THE MEASUREMENT THAT CLEARS THIS ROW MUST ASK THE LEAVES.** Every
control here is an AFTip wrapper and a wrapper reports a width of **zero**: ask
those and the row answers "clean" at every width, which is exactly how this
defect passed a measurement, shipped, and was reported live by the user a day
later. Measure the painted leaves, pair by pair, at several widths — a name
whose box shrank while its text did not is drawn straight over its neighbour
(measured: 10px over the badge at 900px, 23px at 760px, 35px at 640px).
Guard: `test/test_console_identity_width.js`.

### A multi-pick dropdown has TWO gestures

`AFFilter.multi` (`media/afFilters.js`), and both are free on every picker in
the extension — there is nothing to opt into:

- **the checkbox toggles** one value, as it always did;
- **the NAME beside it means "only this"** — one click for the move people make
  most, which used to be Clear plus a tick. This is why an item is a `<span>`
  and not a `<label>`: a label hands every click to its checkbox, which is
  exactly the behaviour being split in two. The name underlines on hover; a
  re-bound click with no affordance is worse than no gesture.
- **`presets`** are the named subsets a *particular* list has a word for —
  `[{ id, label, title, values }]`, drawn between Select all and Clear. The
  Console's `show` box declares `Dialog` (you + the agent). The component knows
  the mechanism; only the page knows what the word means, so never put a preset
  in the component.
- ‼️ **RIGHT-CLICKING THE TRIGGER FLIPS BETWEEN EVERYTHING AND THE FIRST PRESET**
  (U-131) — no menu, no read, no ticks. Three states, one rule: everything → the
  preset; the preset → unfiltered (`null`, the component's own word for it, not
  "all of them ticked"); **any other combination → the preset**, because
  somebody reaching for a shortcut mid-filter means "take me there", not "throw
  my filter away". The hover names what it flips to, built from the same list
  the listener reads. **A picker with NO preset does not take the gesture at
  all** — no listener, so the platform's own menu is untouched: a gesture that
  silently does nothing on the other eight pages is worse than no gesture.
  ‼️ **The bar, so a row does not fill up with decoration** (U-52): the subset
  needs a name somebody would use out loud; it must be **two options or more**,
  because a single option is already one click — on its own name; and a picker
  built from a list of NAMES (agents, projects, targets) has no vocabulary for a
  subset to be named out of. Where a preset applies it applies everywhere the
  same axis does — the backlog and Track share one `state` constant rather than
  two copies of one idea. The failure to watch for is the one the backlog had
  for three versions: a `presets` declared in a page's list and **dropped on the
  way to the component** by a call site that never forwarded it, which draws
  nothing and says nothing. `test/test_presets.js` presses every one of them.

`test/lib_afms_dom.js` drives all of it (`toggle` · `clickName` · `preset` ·
`selectAll` · `clear`), so a picker's behaviour is testable from any page test.

**Chips that are a scope are BADGES, and a badge toggles.** A row of chips is
read the way the Session Viewer's is: what is lit is what is included, a click
adds or removes one, and **Ctrl/⌘-click means "only this one"**. The gesture is
written beside the chips, not only in the code, and the scope can never empty —
the last chip taken off returns to the default rather than to a page that
matches nothing.

- **The named subsets get their own chips** (`Dialog`, `Delegation`,
  `Everything` on the Search page), because "the usual reading" and "exactly
  these" are two different questions and one row should answer both.
- **The lit chips ARE the answer.** Do not print a second sentence at the end of
  the row saying which scope is on; that is the row asking to be read twice.
- ‼️ This was briefly inverted — a plain click meant "only this" — after a
  report that pressing a lit chip switched it off. The inversion cost the thing
  the row exists for: **two kinds at once**, which the engine has always
  accepted (U-42). The toggle is the rule; "only this" is the modifier.

### A text filter box has a ✕ inside it

`AFFilter.clearable(input, onClear)` (`media/afFilters.js`, styled `.af-clr` in
`common.css`). The button sits **inside** the box's right edge, so clearing
happens where the text is rather than at a second widget along the row.

- **It is created and destroyed with the text**, never hidden and shown: an
  empty box with a dead ✕ in it is a control claiming it can do something.
- **`onClear` is the same handler the box filters with** — clearing IS a filter
  change, not just a blank box. Where the box drives a round trip (the Search
  page's query), clearing drops the last results too: hits sitting under an
  empty box are the page claiming to have found something for nothing.
- Wiring the same element twice is a no-op, so a render path may call it freely.

### A box that searches as you type must not lose the caret

‼️ **A REPAINT IS NOT ALLOWED TO EVICT THE CURSOR.** These pages rebuild a whole
card on every change, and a live box re-runs while you are still typing in it —
so the answer arriving was itself what threw the caret out of the box. The next
letter went nowhere and the only way back in was the mouse: a search that had to
be re-aimed after every result, which is worse than one that waits for Enter.

- `AFFilter.live` already does it for a box whose handler repaints synchronously
  (`snapshot` / `restore`). Use it and you get this for nothing.
- **A round trip needs more**, because the second repaint happens when the HOST
  answers, long after the handler returned. Note the focused control at the top
  of the repaint and give it back at the bottom — `focusMark` / `focusBack` in
  `media/search.js` is the worked example. Address it by `id` where it has one,
  otherwise by the data attribute it is bound through, so a **chip** pressed
  from the keyboard also comes back under the keyboard.
- **The first paint focuses the box the page is for**, once, and never again:
  stealing focus on a later repaint is the same bug from the other side.
- ‼️ **And it is testable — `lib_page_dom.js` models focus.** Writing `#app`
  detaches everything and drops `activeElement`, exactly as a browser does, so a
  page that has LOST the caret cannot answer off the dead node. A live box
  without a caret assertion is a box waiting to break again.

### A block's clearer belongs to that block, and reserves its own width

Two failures, and they arrived together. A `Reset` that lit up for state it did
not touch, and a `Clear` sitting at the opposite end of the panel from the
control it cleared, each pointing at the other's block.

- **One clearer per block, inside it, answering only for it.** If a reader has
  to work out what a ✕ reaches, it is in the wrong place.
- **The slot is drawn whether the button is or not** (`.act-slot`, a fixed
  width). A clearer that appears the moment something becomes clearable is
  right; a row that jumps sideways at that same moment is not — the ✕ arrives in
  a gap that was already being kept for it.
- **A control whose LABEL grows reserves for its widest label** — `⚙ Filters`
  gaining `(3)` must not shove its neighbours (`min-width`).
- ‼️ **…AND A PICKER RESERVES THE WIDEST THING IT COULD EVER PRINT.** The widest
  is knowable when the control is drawn — its label, its `allLabel`, `none`,
  `n/total`, and every option — so `AFFilter.multi` measures it and writes a
  fixed `ch` width. Nothing opts in. This is the backlog's control row: choosing
  `filed — has a code` grew the button by forty characters, pushed the tail of
  the row onto a second line, and undoing the choice pulled it back, so the
  whole strip rocked under the hand. The other half of the same fix is that **an
  option may be a sentence in the open MENU and only its head on the button** —
  the menu is where you are choosing between them and has a line each; the
  button is a readout, and the hover carries the sentence whole.
- **Do not add a second signal for what the button already says in words.**
  `state: 2/4` is not `state: every state`; an inset bar and a re-tinted fill on
  top of that repeat the fact and read, on a small button with rounded corners,
  as a stray bracket beside the box.

### A date box commits on `change`, never on `input`

`AFFilter.live` enforces this and you get it for nothing — but know why, because
the same trap catches any control with a native popup. `fn` repaints, a repaint
replaces the element, and the calendar popup belongs to the element it was
opened from — so it shuts. `<input type="date">` fires `input` the moment its
three segments happen to form a valid date, which during a picker gesture is
while the user is still moving through it: the calendar closed under the cursor,
and only sometimes. `change` is the event that means *a date was chosen* and
arrives after the popup has closed itself.

---

## Time

**Every clock goes through `AFTime` (`media/afTime.js`).** Never
`toLocaleTimeString` or `toLocaleString` in a page, a tree or a status bar
again. The extension host loads the same file through `src/core/aftime.ts`, so
the two sides cannot round a minute differently.

**Why UTC is not decoration here.** Everything this extension shows is a record
of when a machine did something, and machines state their times in UTC: a
transcript, a plan-quota window, a rate limit, a scheduled run. The page renders
them in whatever zone this computer is set to, so `14:32` on its own is not a
fact — it is a fact plus an offset nothing on screen mentioned. Comparing a run
against a provider's own log then means doing the arithmetic in your head,
which is the sort of small tax that makes people stop checking.

| Where the clock is | What to call | What it gives |
|---|---|---|
| a table cell, a dense meta line | `clock(ts)` **+ `title={tip(ts, label)}`** | `20:14`, hover carries the rest |
| a detail line, a card footer, a page sub | `clockUtc(ts)` / `full(ts)` | `20:14 (17:14 UTC)` |
| a tree or status-bar hover, an exported file | `full(ts)` | there is no second hover to hide in |
| "how long ago" | `ago(ts)` | `4h ago` |

- **No clock is ever bare.** A cell may show `20:14` alone, but then its `title`
  is `tip(ts, …)` — three lines: the moment to the second, its UTC, and this
  machine's offset *at that moment* (not today's — a session from before a DST
  change was not recorded in the offset we are in now).
- **`tip` takes a label**, because a row has three dates that look alike and a
  hover with no subject makes the reader guess which one they are on.
- **A missing timestamp prints nothing**, never `Invalid Date` and never
  1 Jan 1970. Rows with an unset date are normal — a task that has never fired,
  a session with no end.
- **Inline UTC does not go in a table cell.** Widening every date column by
  eleven characters to repeat what the hover already says costs the columns that
  carry the actual measurements.

---

## Making things

**An object is made by a form on the page. A chain of VS Code boxes is not a
fallback, it is a missing feature.** The extension exists because the platform's
own surfaces cannot say enough: `showInputBox` asks one question, cannot show a
default list, cannot redraw when an answer changes what else matters, and loses
everything typed so far when Esc is pressed by accident. Every dialog chain in
this repo has been found asking four questions and unable to ask the five that
decide what the object actually does.

- **One form per object, and every route opens the same one.** The toolbar `+`,
  the sidebar `+`, a row's Edit, the walkthrough and the command palette all
  post to the panel and the panel opens the form. Two doors that build the
  object differently is the defect this rule exists to prevent — measured twice:
  a task made from the tree once carried different fields from one made on the
  page, and a schedule could state less about a run than the task it produces.
- **The form redraws when a choice changes what exists.** "Weekly" brings a day
  picker, "watch" brings a path, a guard brings its own row. A field that only
  appears after a reload is a field nobody finds.
- **A refusal is shown IN the form**, next to the button that was pressed. A
  modal that takes focus off the half-filled fields it is complaining about is
  the worst of both worlds.
- **Anything that runs a CLI takes the launcher's own vocabulary** — the same
  model list, efforts and permission modes a session start offers
  (`core/launch.ts`), plus project, working folder and priority. Empty means
  "no flag", exactly as it does there.

- **An object whose content is a LIST gets a list editor, not a wizard.** A
  workflow is the case that proved it: asking for step 4 without ever showing
  steps 1–3, with no way back to step 2 and Esc discarding the lot, is not a
  form with extra pages — it is a form that cannot be read. Draw the list, put
  `↑ ↓ copy ✕` on each row, and open ONE item at a time in a nested card. The
  list is part of the **draft**: reordering and deleting must not touch the
  stored object, or `Cancel` is a lie and a reorder becomes N commands.
- **A sub-object's KIND is a picker, not a first question.** Six kinds of
  workflow step used to be the wizard's opening quickpick, and everything after
  it depended on that answer, so changing your mind meant starting over. In a
  form the kind is one field near the top: it redraws the half of the card that
  depends on it and keeps everything that does not.
- **A picker over rows a page already draws belongs ON that page.** "Which
  template?" is the Plan tab filtered to templates — the rows carry the agent,
  the mode, the last run and a Run button, which a quickpick of bare titles
  cannot. Where there is no such page, draw an in-page chooser card
  (`chooser` on the Tasks page) rather than a floating list: it can say how big
  each item is and when it was last written.

**What stays native, deliberately:** a **modal confirmation** for something
destructive (a page-side warning can be missed while the focus is elsewhere),
and the **OS file picker** (`showOpenDialog`), which has no webview equivalent.

### A box that takes a prompt offers the saved ones — `media/afSnippets.js`

**Never write a second prompt picker.** The window, its filter, its file dialog
and the paste rule are one component; it ships to every page from `htmlShell`
and its CSS is in `common.css` (`.af-snip*`), so there is nothing to wire but
the trigger.

```js
window.AFSnippets.init(vscode);              // once, with this page's api
window.AFSnippets.bind('c-send', 'c-text');  // a BUTTON, landing in a box elsewhere
window.AFSnippets.bindAll(['nt-prompt', 'nt-retryprompt']);  // the BOXES themselves
if (window.AFSnippets.receive(ev.data)) { return; }          // in the message listener
```

- **The trigger is a right-click, and left-click is untouched** — on a send
  button it still sends, in a text box the caret still lands where you pressed.
  `bind(trigger)` with no target means the trigger IS the box.
- **`AFSnippets.HINT` goes in the trigger's tooltip.** A menu nobody knows
  about is not a feature; every surface that has the gesture says so.
- **A pick is PASTED, never sent** — through `AFTextTools.insert`, so a block
  landing beside half a sentence behaves exactly like `Ctrl+V`.
- **…and the box is told with an `input` event**, so the page's own listener
  records it into whatever draft it keeps. No page passes a callback, and no
  page can forget to.
- **The window hangs off `<body>`**, because every page redraws its own `#app`
  and a picker inside one would be taken away by the next host push.
- **The host answers in one place** — `promptSnippetMessage` in
  `panels/base.ts`. A panel that wants the picker calls it before its own
  switch and supplies a `promptSnippets()` dep; it never grows its own cases.

### The form is a component — `media/afForm.js`

**Never hand-roll a form card again.** The Tasks page proved the shape and then
kept it to itself for three versions, which is exactly why eight other surfaces
stayed on dialog chains: writing one was a day per page. `AFForm` ships to every
page from `htmlShell`, and the CSS is in `common.css`, so there is nothing to
wire.

```js
const F = window.AFForm;
F.card({ id: 'dutyform', title: 'New duty', lede: '…', submit: 'Add the duty',
         msg: refusal, warn: true,
         body: F.grid([ F.text('title', 'Title', v, { required: true, wide: true }),
                        F.sel('cadence', 'How often', list, v, { tip: '…' }) ])
             + F.sec('Watch', 'what the agent looks at')
             + F.grid([ F.path('watch', 'File or folder', v, { kind: 'folder' }) ]) });
F.wire(root, { onEdit, onRedraw, onSubmit, onCancel, onBrowse, onList });
```

- **A field declares the key it writes and the type it writes it as.**
  `F.read(root)` hands back a typed object; a number field reads as a number.
  Nothing lists its field ids twice, which is how a form quietly stops carrying
  one.
- **`{ redraw: true }` on the fields that change what EXISTS**, and only those.
  `wire` binds `change` for every control and `input` for text as well — a
  redraw on `input` repaints the page under the cursor.
- **`F.path` keeps the OS picker** next to the box: the page posts
  `{type:'af-browse', key, kind}` and the host answers with `handleFormBrowse`
  (`panels/base.ts`), which fills that one field and disturbs nothing else.
- **`F.list`** is for an object whose content is a list — rows with
  `↑ ↓ edit copy ✕` acting on the DRAFT, never on the stored object.
- **The refusal goes in the card** (`msg`), never in a modal.

**The measurement, so the next sweep can be compared to it.** Every
`registerCommand` body in `extension.ts`, cut at the next registration **or at
its own closing line, whichever comes first**. `test/test_dialog_sweep.js`
computes it and fails if the numbers climb back.

| | commands | opens a native dialog | uses input box / quick pick | 2+ box chain |
|---|---|---|---|---|
| 2026-08-08 (U-9 phase 4) | 215 | 113 | 58 | 20 |
| 2026-08-09 (U-14, surfaces 1–3) | 217 | 67 | 42 | 13 |
| 2026-08-09 (U-14 complete, 8 surfaces) | 219 | 54 | 28 | 2 |

‼️ **The first two rows over-count**, and the reason is worth knowing: cutting a
body only at the next registration makes the LAST command of a
`context.subscriptions.push(…)` block swallow everything up to the next block.
That reported a fifteen-box `missionStepOutput`, which is three lines long and
opens no dialog at all. The row above is measured with the closing-line rule and
is the honest one.

The finding worth keeping is not the count but its shape — nearly every one of
those objects already HAD a page, and that page listed the object without being
able to make one. The exception was **evals**, which had no page at all and got
one. The full table is in the project's `10_Notes/U-9 Faz 4 - diyalog supurme
taramasi.md`.

‼️ **The scan only reads `extension.ts`.** A panel may open its own dialogs and
the number will not move — the Toolbox's `+ new skill` was two input boxes
inside `toolboxPanel.ts` and no measurement ever saw it. The sweep test now
greps the six converted panels as well; add yours to that list when you convert
one.

**What the remaining twenty-eight are, and why they stay.** A quickpick over
rows that ALREADY EXIST is what a quickpick is for; this rule is about MAKING an
object. `quickMenu` (the palette itself), `setupExample`, `worktreeRuns`,
`browsePackGallery`, `addRecipe`, `startSessionWith`, `assignProject`,
`dismissInsight`, `installHooks`, the `export*` pickers — all pick, none build.
And a single box asking a single string about a thing that already exists is not
a form either: `renameSession`, `tagSession`, `connectTelegram` (a token),
`testDispatch` (a diagnostic). A-23's `setSessionAlertVoice` picks twice over
lists that exist (five edges, then the tones) and each tone row plays itself —
ten names like `chime-bright` are unchooseable from the words, so the picker is
not a step in front of the choice, it IS the choice.
`test_dialog_sweep.js` lists them by name, so
"finishing the job" by converting them is a decision somebody has to make on
purpose rather than by momentum.

## Right-click

Every surface that shows a session carries the full session menu —
`AFSessionCtx.row(...)` on the row, and `infoCtx` on a page whose whole subject
is one session (`AFHeader.html`). A page that shows an object and offers only
Copy/Paste on it is unfinished.

---

## Which engine (the badge)

**‼️ ONE BADGE, ONE COLOUR PER ENGINE, EVERY SURFACE — `media/afEngine.js`.**
The badge was invented on the Console, for Codex, in one colour, with one rule:
*Claude is the default, so it wears nothing.* Every part of that turned out to
be wrong once there were four engines and the user had to read a table:

- **A row with no badge is unreadable.** It means "Claude" or it means "this
  surface never learned about engines", and those look identical.
- **One purple for every non-Claude engine** answers "not the default" and not
  "which one" — which is the actual question in a list of sessions.
- **A colour invented per page** is a colour that disagrees per page.

So: `window.AFEngine.badge(id, title)`, colours in `media/common.css`
(`.af-eng.claude|.codex|.gemini|.agy|.other`), and an id this build has never
heard of is still drawn — as itself, in the neutral colour. An external CLI
profile can put any name in a session's `source`, and dropping the badge there
would hide the one fact the column exists to show.

The `title` follows the hover rule above: **figures, `Label: value`**. What an
engine *changes about talking to it* is a separate affordance (the `?` beside
the composer's engine box), never the badge.

### A percentage is named by whoever MEASURED it

**‼️ NO SURFACE MAY NAME AN ACCOUNT'S QUOTA WINDOW.** The reading names its own
window (`SlotUsage.window`), the host fills the silence exactly once
(`windowNameOf` / `windowPhraseOf`, `src/core/accountUsage.ts`), and every page
prints what it was handed.

The reason is arithmetic, not style. Seven places drew an account's window and
each had typed the words out; exactly **one** of them had been taught that Codex
publishes a **week**. Measured on one screenshot: the Codex card read
`Current week 72%` while its own hover panel, three inches away, read
`72% of the five-hour window used` — the same figure under two window names, one
of them a lie with a real number in it. The seventh copy had a capital F
(`Five-hour window:`) and survived the first sweep that went looking for the
other six.

Two silences, and they are filled differently: an engine that named no window is
on the five-hour one (what every row meant before a second engine had a figure);
a **disk-backed reading nobody has taken yet** has no window length — it is *in*
the reading — so it is `usage window`, because "five-hour" is the one claim
about it that is certainly wrong.

Gate: `test/test_account_window_name.js`. The rule it measures is agreement, not
wording — *the same figure never appears beside two different window names* —
plus a case-insensitive source sweep, because case is where the seventh copy
hid.

---

## "Default" never stands alone

**‼️ A BOX WHOSE ONLY WORD IS "Default" IS A BOX WITH NO REFERENT.** The user's
own wording of the bug: *I may have set that agent's default to sonnet for
Claude, but if I open the same agent with Codex, what does Default still mean
there, and which model does it correspond to? That part is a mystery.*

Every default-shaped box names **the value it will actually produce and who
decided it** — `Default → sonnet`, not `Default`. `core/agentDefaults.ts`
resolves the layers (the agent's own file · Agent Farm's per-engine store ·
the fleet-wide `launchDefaults` · the CLI) and returns the sentence with the
value, so the words the box prints and the value the launcher sends come from
one function and cannot disagree.

**‼️ …AND IT NAMES ITS AXIS, NOT ONLY ITS VALUE.** The rule above fixes *which
sonnet*; it does not fix *which box*. Measured (audit B-03.21, B-04.1): the
Console's new-session row drew three boxes in a row reading nothing but
`Default`, and Farm Settings drew `developer [gpt-5.6-terra] [high]` where
nothing on the screen said `high` was an effort rather than a second model.
Worse, the axis appeared and vanished **with the choice** — the zero rows half
knew it (`effort: default`) and the chosen rows did not.

So the axis travels **inside the value**, and the two separators are load-bearing:

```
effort: high        somebody chose this here
effort → low        nobody did; this is what it resolves to
perm  → Default     …and the engine decides
```

A separate `<label>` is the other way and is right where there is room — the
Console's RUNNING row uses `permlbl`, the route and account use `rtlbl`. It was
refused on the starting row by measurement, not taste: `.crow` is
`flex-wrap:nowrap` and had 69px of slack where four labels want ~166.

The cost is that the value is clipped harder, so **the hover carries the whole
answer and is an `AFTip` panel, never a native `title`**: the heading is the
axis spelled out in full (`perm` in the box, `permissions` in the panel) with
what it is set to, and the body is the chosen row's own words followed by the
standing sentence, **once**. A panel that repeats its own heading is a panel
nobody finishes reading.

Gates: `test/test_console_axis_labels.js` (the rule is *no two boxes on a row
read the same thing* — "these four words are present" would go green on a row
where every box said only `axis`) and the chip half of
`test/test_settings_control_width.js`.

### ‼️ …AND A BOX THAT OPENS ON "Default" FOR A VALUE THE USER SET IS THE SAME BUG

A launch box is a **mirror of what will happen**, so every layer that decides
what will happen has to reach it. The order is written in `core/launch.ts` and
is the same at every door:

```
what this launch states  →  what this agent was LAST STARTED with
                         →  what this agent is SET to for this engine
                         →  the fleet's agentFarm.launchDefaults
```

The third layer existed only at the **spawn**. Every door seeded from the
memory and fell straight through to the fleet, so a model or an effort chosen
for that agent in Farm Settings was applied to the session and **invisible in
the box that offers to change it**. Measured on `developer`: the composer opened
`Model: Default` beside `Effort: xhigh`, both set in the same row of the same
page — the effort showed only because it happened to be in the memory too.

Two functions, deliberately, because they answer two questions:

- `withAgentEngineDefaults` (extension.ts) is the **spawn's** reader and returns
  an **empty model on Claude** on purpose: its CLI reads the agent's own
  `.claude/settings.local.json`, so a flag would be a second source of truth
  (X-145).
- `agentSeedDefault` (`core/agentDefaults.ts`) is the **box's**, and folds that
  file back in — because `Default` is the one word that is false about an agent
  the user set to `opus`.

It is applied as a LAYER inside `seedLastLaunch`, so a door inherits it by
calling the one function every door already calls. Per **field**, never per
record: a memory holding an effort and no model must not silence the layer that
holds the model. Gates: `test/test_launch_parity.js`,
`test/test_console_agent_default.js` (sections 1–4 measure the spawn, section 5
measures the BOX — and 1–4 were green the whole time the box was wrong).

---

## A `<select>` renders an unknown value as its FIRST option

Not as blank, and **not** as nothing — as whatever row happens to be first,
which on every launch box is `Default`. So a control that READS a value the
catalogue does not publish silently redraws it as its own opposite.

Measured on a live session: the bridge reported `model: claude-opus-5` while the
box beside it read `Default`, because the Claude catalogue publishes four
aliases (`haiku` `sonnet` `opus` `fable`) and the CLI reports the resolved id.
The markup was correct, every string test passed, and the reader was told the
session was on the default.

- **A catalogue lists what an engine is OFFERING, never everything it can be
  running.** Any box drawing a value that came back from a process wraps its
  list in `AFLaunch.withCurrent` — the rule already used by the composer (S-34).
- **Where the narrower list is a RULE about what you may pick**, borrow the row
  back from the wider one (`withCurrentFrom` in `media/console.js`): a running
  session's permission list drops `bypassPermissions` because you may not raise
  a live conversation into it, and that rule about *choosing* was deciding what
  the box could *say*.
- **And the shell key has to carry it.** Those boxes are markup; a `<select>`
  only moves when the markup does. The Console's key was
  `selected | ended | pinned | account`, so the model a card was built with was
  the model it showed for the whole session — the card is selected the instant
  the process starts, before the CLI has resolved anything. `liveBrainShape`.

Gates: `test/test_console_page.js` (the running row follows the CLI, same
session) and `test/test_console_axis_labels.js`.

---

## `[hidden]` loses to any class rule — a component shuts ITSELF

`hidden` is an attribute the browser enforces with `[hidden] { display: none }`
from its own stylesheet, which **any** class selector outranks. So a page's
layout rule can un-hide a component's menu without anybody writing a line about
menus.

Measured: `.crow .afms > *` on the Console — written so the AFTip wrapper would
be the flex child — caught the picker's own menu, and eleven of them stood
permanently open above the composer, laid out as a **row** (flex with no
direction), so all a reader saw was the tools line and a horizontal scrollbar.
Nobody had pressed anything.

- A component that can be re-shown by a stylesheet it does not control is not a
  component: `media/common.css` carries `.afms .afms-menu[hidden]
  { display: none }`, specific enough to win wherever it is loaded.
- A page rule that means "the trigger" **names the trigger**, never `> *`.
- And an element that relies on an unstated `display` states it, because an
  unstated one holds only until somebody states another.

Gate: `test/test_console_show_width.js` — measured on the laid-out DOM, since
the markup is right in both worlds.

---

## Origin (🧑 / 🤖)

Who started a session is decided in `core/sessions.ts` `sessionOrigin`, in this
order:

1. **A launcher Agent Farm itself recorded** (`launchedBy` — the task, schedule,
   trigger, mission or workflow that owns the transcript) ⇒ `auto`. A recorded
   fact beats every reading.
2. **The Console hosted it** ⇒ `user`. A person typing reaches the CLI over the
   same streaming channel a headless run does.
3. **The transcript's own `entrypoint`**: `sdk-*` ⇒ `auto`, everything else ⇒
   `user`. Unknown reads as `user` — hiding a real dialog is worse than showing
   an extra robot row.

Never guess from timing, prompt shape or file name.

**‼️ AND A SURFACE ASKS FOR THE VERDICT, IT DOES NOT RE-DERIVE IT (S-37).** The
inputs above live in the INDEX. A page that builds its own object out of a
transcript is missing `consoleHosted` and cannot know it is missing it, so it
returns a confident wrong answer — the Session page said 🤖🌙 "automation run"
about conversations the Sessions table, calling the very same two functions on
the full record, correctly showed as 🧑. When a surface cannot see all the
inputs, it takes **one** dep returning the whole verdict (`ViewerDeps.originFor`
→ `{ origin, headless }`), never one dep per input: two are two chances to wire
only one of them, and the next input these functions learn to read goes missing
again.

---

## Saving a whole form

Three separate bugs in one day were this same sentence (P-15 · M-21), so it is a
rule now.

**‼️ A FORM THAT SUBMITS THE WHOLE OBJECT MUST BE ABLE TO REMOVE A FIELD, AND
MUST NOT REMOVE ONE IT NEVER SHOWED.** Two halves, and each is silent on its own.

1. **The view hands the page every field the form edits.** A field the editor
   writes but the payload drops is not a display gap — it is a DELETE: the form
   renders the missing value as empty and the next Save writes that emptiness
   over the stored one. `projectView` dropped `color`, `icon`, `startedAt` and
   `dueAt`; the colour "went back to grey" and a start date disappeared on a
   Save pressed to change something else.
2. **A missing INPUT is not an empty input.** Read every field through a helper
   that posts nothing at all when its element is not on the page, so adding a
   field to the model and forgetting it in the form is harmless instead of
   destructive (`collect()` in `media/projects.js`).
3. **`Object.assign(stored, fields)` cannot say "gone".** It adds and changes
   and never removes, so a cleared box is accepted, announced as saved, and
   ignored — the Tasks form could move a schedule ONTO another engine but never
   back off it. State every field, let `undefined` mean delete, and merge with a
   helper that deletes it (`applyForm` in `src/panels/tasksPanel.ts`). A key
   genuinely left OUT of the patch still means "not mentioned" and survives.

A control that cannot express "nothing" — a `<input type="color">` has no empty
state — gets its own ✕ beside it, the same one the folder field uses.

**And the fixture carries the field.** None of this was visible in a screenshot
because no fixture had a colour, an icon, a date or a non-default engine on it —
a fixture without the field renders exactly like a page that drops it.

---

## Editing an automation is not running it

**‼️ SAVING A SCHEDULE MUST NEVER FIRE IT (M-21).** `scheduleDue` decides on
`lastRunKey` and nothing else, so whatever an edit leaves there decides whether
closing a form starts an agent. Clearing it makes BOTH branches say yes: past
the time, today looks unhandled; before it, a catch-up policy looks at yesterday
and finds nothing. An edit settles whichever occurrence is already behind the
schedule's (possibly new) time — `settledKeyAfterEdit`, which reads
`scheduleDue`'s own two branches in the same order so the two cannot drift.

The same rule covers switching one back **on** (it was off, so it missed
nothing) and drops a quiet-hours deferral of the occurrence the edit replaced.
It all lives behind `TaskManager.updateSchedule`, which the page and the bridge
both call — the page used to reach past it and keep its own opinion, which is
how the two doors came to behave differently in the first place.

The confirmation says **when it next fires** and that saving never runs it: the
old "Schedule saved." was true and useless, and left the surprise nowhere to be
caught.

## A wait is an answer, and it has one shape

Anything in this extension that stops and waits — a parked run, a mission asking
for an approval, a sleeping campaign, an armed restart — reports it through
`core/waits.ts` and through nothing else. The shape is `kind · subject · reason ·
since · until? · blockedBy[] · clearedBy · op?`, and three of those are rules
rather than fields:

- **`reason` is the sentence the source ALREADY wrote.** Never a second one. Two
  sentences about one wait is how a surface and an op come to disagree about the
  same fact, and the second copy is always the one that goes stale.
- **`clearedBy` is the answer, not the timestamp.** `clock` ends by itself,
  `event` ends when something else finishes, `human` means nobody is coming. A
  caller deciding whether to wait needs that before it needs a moment.
- **An op that MAKES a caller wait answers in this shape too.** The wait handed
  back in the moment and the wait read afterwards are one object, built by one
  function.

‼️ **And a new reason to wait cannot be added silently.** `test_waits.js` reads
`launchBlock` out of `tasks.ts` and the `MissionRunStatus` union out of
`missions.ts` and fails, by name, on anything nothing translates. If you add a
wait somewhere with no such union to derive from, add the gate with it — a rule
that only lives in this paragraph is a rule that lasts until the next person.
