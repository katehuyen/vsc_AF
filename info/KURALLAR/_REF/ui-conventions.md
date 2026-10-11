# UI Conventions & Visual Verification Gate

Binding on **whichever agent** works on user interfaces, web pages, CSS, HTML, templates, webviews, mobile screens or visual components in **any repository or project**. The patterns every surface follows (controls, defaults, time, copy, forms, waits): `_REF/ui-patterns.md` — read it too when designing or changing a surface.

The goal: (1) never ship a visually broken layout — visual claims rest on evidence; (2) surfaces maximise clarity and density without needless clicks or taps.

---

## 1. Visual Verification Gate (The Iron Rule)

**‼️ A VISUAL CHANGE IS LOOKED AT BEFORE IT IS CALLED DONE.** String assertions, unit tests and green builds pass on layouts nobody drew.

1. **RENDER / RUN** with the project's capture tool (headless browser / Playwright screenshot, `test/shoot_page.js`, the CI emulator job).
2. **CAPTURE — and prove the capture.**
   - It covers the **whole** surface: a headless `--screenshot` shoots the viewport, not the page (measured once: 2,400px of an 18,449px page; 16 of 19 scenes had never been photographed).
   - A phone width is drawn in a frame of that size: headless Chrome widens any window below 500px silently, so `--window-size=360,…` photographs a 500px layout cut down the side.
   - **One capture per state, at its own size** — a scaled-down montage is ~100px a view, which is not looking.
   - The capture records the conditions actually in effect (theme, rotation, width) — a script that asked for dark mode is not proof the shot is dark (the Android CI writes `screen-state.txt`).
   - **It draws the environment the user really runs, not the one the platform ships.** A value the user overrode (a colour customised by hand, a font scale, a forced locale) holds across themes and modes, so a capture fed the shipped defaults measures a product nobody has (measured: a light theme declared done on the shipped white ground while the user's own dark background made every page unreadable). Read the user's real settings; each override that reaches the surface is a scenario with its own capture. The same holds for the embedding: a webview is an iframe, so a probe drawn as a top-level page can lie (measured: a transparent scrollbar track showed the page's white at top level and the host's document inside a frame), and what the platform paints itself, a scrollbar most headless flags hide, is drawn and photographed too.
   - **A scene that needs a press presses it** (hover, open, long-press) in the capture script. Two scenes whose captures are identical are one scene with two labels.
3. **DRAW THE ARITY THE USER GETS:** empty · one · many · too-many are four layouts; fixtures carry a real distribution of states and the user's language (long Turkish words wrap differently). Add the smallest first. **A cap is tested with content past it** (measured: a `max-height:75vh` sheet passed every short list and overran at the first long one, because its padding sat on top of the content-box height — a capped box is `box-sizing:border-box`). A fixture that guards wrapping carries a token with NO break opportunity (an id, a path); prose wraps anyway and proves nothing.
4. **WHEN THE QUESTION IS A NUMBER, MEASURE IT** from the render tree — DOM bounds / `getBoundingClientRect`, Android `uiautomator dump` / Compose semantics: clipped text, a name squeezed to zero width, overlapping siblings. The eye estimates; the tree answers.
5. **INSPECT BEFORE CLAIMING:** light and dark (and portrait/landscape on mobile); no clipping, broken wrapping, stray scrollbars or overlap; hover/active/selected/empty/narrow states; and operator usability — can every filter be cleared in one action, are labels 1–3 words, is the control where a user would look for it.
6. **EVIDENCE BEFORE ASSERTIONS:** state what was seen before saying "done". No render harness in the project → tell the user and list exact manual steps.

---

## 2. The Five Names

Short names so one word carries a whole instruction. The principle is universal; each platform has its own instrument (the project's `docs/CONVENTIONS.md` names it).

| Name | Rule | Web / desktop | Mobile |
|---|---|---|---|
| **DENSITY** | Maximum information, minimum space, minimum clicks/taps. A fact the user can see must not cost a navigation; fill space with derived figures already in memory. Ask: "can they have this on hover / long-press?" | hover | long-press |
| **AFTip** | The ONE shared rich detail panel. Anything that is text or could grow into text goes there, never into a truncated label or a native `title` (cuts off, cannot scroll, races the UI). A hover reads as `Label: value`, not prose. It **yields to the hand**: a click, a key, Back or typing closes it, and it never covers the control being pressed. | styled hover panel | bottom sheet on long-press or ⓘ |
| **SHORTHAND** | Short, unambiguous form on the row or chip; the panel opens with the long form as its first line (`R3` → `Round 3 — …`). Never an abbreviation the user has to learn. | | |
| **MIRROR** | A control's panel opens with its CURRENT value, a blank line, then the description — and follows the value when it changes. Reading what a box holds never requires opening it. Implementation traps: `_REF/ui-patterns.md`. | | |
| **ONE SUBJECT** | An object with several detail panels gives each its own subject; no fact in two of them. | | |

**UI language is the product's own.** Before writing any shown word, check the language the product (or the product a companion app belongs to) is written in and match it — Agent Farm and its Android app are English. The chat language with the user never leaks into a UI. A product is built for the world, not for this user: nothing language- or place-dependent (UI, TTS voice, dictation, date/number formats) is hardcoded to the user's language or machine — it follows the end user's choice, else the system locale; more languages are added as options. Guard it with a test where the repo has a gate.

---

## 3. Screenshots Shared With the User — every project

- Folder: `docs/Screenshots/` in the repo, **git-ignored** (created by `_TEMPLATES/test-harness/setup.js`).
- Name, timestamp first so the folder sorts by time: `YYYYMMDD-HHMMSS_<build>-<env>-<screen>-<result>.png` (e.g. `20260930-141502_b12-emulator-settings-pass.png`).
- A screenshot mentioned to the user is linked by that path.

---

## 4. Project Tooling

- A project with a render/screenshot harness uses it on every UI turn.
- A new UI project gets one before its first screen: web → a Playwright/headless script writing to a local folder; Android → `_TEMPLATES/android-ci/` (emulator screenshots + UI tree).
