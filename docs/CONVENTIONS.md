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
first) · every turn's prompt · backlog items.

---

## Copy

One clipboard path and one receipt: `AFTextTools.copyFrom(el, value)`. The async
API with an `execCommand` fallback, and a ✓ that appears **only once the write
actually happened** — a tick for a failed copy is worse than no button.

Anything a person repeatedly needs somewhere else (a session id, a path) is worth
one click.

---

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
