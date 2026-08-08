# Agent Farm — UI conventions

House rules for the extension's own surfaces. They are here so that the next
person (or agent) touching a panel does not have to be told them again, and so
that "the page I just wrote looks nothing like the others" stops happening.

Binding on every change to `media/` and `src/panels/`.

---

## Hover

**A hover is the most valuable surface on a page** — the pointer is already
there, and it costs the reader nothing. Two rules, and they are not negotiable.

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

### 2. Anything that is TEXT uses the rich panel, never `title`

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

Where this already applies, and where a new surface should follow it: session
Title (title + the whole opening prompt) · Project (what the project IS, folders
first) · every turn's prompt · backlog items · the Next up strip's codes.

**‼️ It survives a repaint, and that is the component's job, not yours.** These
pages redraw whole sections on the host's beat, and a browser does not put
`:hover` back on the node that replaced the one the pointer was on until the
pointer moves — so a panel somebody was reading used to close by itself. The
component bridges it (a `.af-on` class, the scroll position carried over, dropped
the moment the pointer moves); `test_tip_repaint.js` holds it. Nothing a page
does has to know about this, and no page should re-invent it.

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
- The grammar itself is documented for users in `docs/BLUEPRINT.{en,tr}.md`; the
  file is the spec, `test/test_query.js` is the guard.

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

`test/lib_afms_dom.js` drives all of it (`toggle` · `clickName` · `preset` ·
`selectAll` · `clear`), so a picker's behaviour is testable from any page test.

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

**The measurement, so the next sweep can be compared to it** (2026-08-08, U-9
phase 4): of 215 commands, **113** open some native dialog, **58** use
`showInputBox`/`showQuickPick`, and **20** are chains of two or more boxes. The
finding worth keeping is not the count but its shape — nearly every one of those
objects already HAS a page, and that page lists the object without being able to
make one. The full table is in the project's `10_Notes/U-9 Faz 4 - diyalog
supurme taramasi.md`; the remaining work is backlog `U-14`.

## Right-click

Every surface that shows a session carries the full session menu —
`AFSessionCtx.row(...)` on the row, and `infoCtx` on a page whose whole subject
is one session (`AFHeader.html`). A page that shows an object and offers only
Copy/Paste on it is unfinished.

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
