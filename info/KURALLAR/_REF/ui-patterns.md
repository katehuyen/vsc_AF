# UI Patterns

Read with `_REF/ui-conventions.md` (the gate and the five names) when designing or changing any surface. Each pattern is a rule every platform keeps; the instrument differs.

## Labels and controls

- **Cockpit, not literature.** Buttons, tabs, chips, badges, category headers: the shortest unambiguous noun phrase, 1–3 words (`Handover Discipline`, not `Handover Discipline — the lines and their words`). Subtitles, definitions and guidance go in the AFTip panel.
- **The shape states the arithmetic.** Switch/checkbox = independent on/off; radio or badge+chip = exactly one; chip = an action. Ask what the code enforces before drawing: a row of switches over a set where one turns another off promises multi-select and silently corrects the user. Single selection: the chosen member wears a state badge, the others an action chip; `role="radio"` + exactly one `aria-checked="true"`; the state is drawn once.
- **A selected control stays selected — four signals:** fill + border + check mark + the accessible selected state (`aria-selected`/`aria-checked`, Compose `selected`). Never colour alone.
- **A filter or search box has ✕ inside it** when populated (one action restores the unfiltered view); Escape / Back clears or dismisses; a live filter keeps focus and caret across re-render.
- **Logical placement:** a control sits where the user would look for it, not in whatever drawer was easiest to wire.
- **An icon at text size is a text glyph or a vector, never a colour emoji.** A colour emoji is a picture with pixel-wide detail; layout puts it on a fractional pixel and it is redrawn with a stroke half gone, which reads as "cut off". Write the text selector (U+FE0E, as an escape) or draw a vector; "it looks cut" is shot at several device scales and enlarged before any CSS is touched.

## Values

- **"Default" never stands alone:** `Default → sonnet`. The axis travels in the value (`effort: high` chosen here, `effort → low` resolved from elsewhere).
- **An unknown value is shown as itself**, never silently as the first option of the list.
- **Time:** every clock goes through ONE helper — short in a row, full with UTC and offset in the panel. A missing timestamp prints nothing, never `Invalid Date` or `1970`.
- **Copy:** one copy path; the ✓ appears only after the clipboard write succeeded.

## Making and waiting

- **One form per object;** every route that creates or edits it opens that form. A refusal (validation, permission) is shown in the form, next to the field, not in a toast that vanishes.
- **Saving a whole form can remove a field it showed, and never removes one it never showed** — merge onto the stored record, do not overwrite it with the form's subset.
- **A wait is an answer, in one shape:** kind · reason (the source's own sentence) · since · what clears it. Connecting, reconnecting, parked, queued, a question pending — all the same shape.
- **Destructive actions take a confirmation** naming what is lost.

## MIRROR implementation traps

- **The separator has to reach the screen.** Tooltip builders drop empty strings (that is how callers pass conditional lines), so a blank line written as `''` vanishes and the value is glued to its description. Give a deliberate gap its own marker and look at the rendered panel.
- **The panel follows the control.** A panel written into the markup once mirrors the value the page was drawn with: the box reads `xhigh`, the panel still says `high` — worse than no panel. Rebuild on `change`, in the shared panel component (never per page), from data the markup already carries.
- **Naming the control must not cost the value its width.** A label beside a narrow picker, or the axis repeated in every option, leaves only the unchanging half visible after clipping. Use a non-selectable heading inside the open list (`<optgroup label>`); every picker on one row gets the same treatment.
