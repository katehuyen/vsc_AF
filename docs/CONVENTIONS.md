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
| **MIRROR** | *a control says what is IN it before it says what it is for* | A `<select>` narrow enough to cut its own text puts its CURRENT value on the first line of its tooltip, then a blank line, then the standard description. Reading a box must never cost a click that could change it. |
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
there, and it costs the reader nothing. Two rules, and they are not negotiable.

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
- **Fixtures live in `test/fixtures/`** and their shape is the point. A fixture
  with one open item and one closed one makes any palette look balanced; a real
  ledger is mostly `done`, which is how a scheme that shouts on `done` becomes
  one flat green. Give it the real distribution, and give it Turkish text —
  that is what these pages actually carry.
- **Check the light theme too** (`--light`). `color-mix` over a dark fallback
  and `color:#fff` on a chip are the two that fail there and only there.

It asserts nothing and is not in `npm test` — a page that looks right proves
the CSS, never the behaviour. It is the looking glass, and looking is the part
that kept being skipped.

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
`testDispatch` (a diagnostic). `test_dialog_sweep.js` lists them by name, so
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
