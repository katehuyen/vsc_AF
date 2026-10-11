# Engineering — how code is written in any repository

Binding on **whichever agent** writes or changes code in **any** repo. These are the lessons `vsc_AgentFarm` paid for, stated without its specifics; a project keeps only its own implementation of them (its `docs/CONVENTIONS.md`). Tests and gates: `_REF/test-discipline.md`. UI: `_REF/ui-conventions.md`. Commits and releases: `_REF/git.md`.

## 1. Size — anti-monolith

- A file stays focused: **target under 300 lines, hard limit 500.** Measured by a gate test, not by memory (`_TEMPLATES/test-harness/test/test_file_size.js`).
- **Never blindly append** features, handlers, state or helpers to a file that is already long. Create a module under the right folder (`services/`, `handlers/`, `components/`, `utils/`, `core/`) and import it.
- **Extract before growing:** a file near 500 lines is split into cohesive modules first, then the new work goes in.

## 2. Layers

- **Entry and barrel files compose and wire** (`index.ts`, `app.ts`, `main.ts`, `MainActivity.kt`); they never hold business logic.
- **A pure core:** domain logic — models, reducers, formatters, decisions — lives in a layer with no platform import (no VS Code API, no Android, no DOM). It is what the fast tests reach, and a gate test forbids platform imports in it.
- **UI talks to the core through messages or calls, never by reaching into its state.**

## 3. Wiring

- **Callbacks and dependencies are passed by name** (an options object, named arguments). A positional parameter whose default is a no-op (`() => {}`) can be left off at a call site and nothing notices — the type checker cannot (the default makes it optional) and a unit test cannot (it constructs the object itself). Past two or three parameters, use an options object.
- **One verdict, one function.** A surface that needs a decision (who started this, what "Default" resolves to, is it connected) asks the one function that decides it, handing it the whole record — never re-derives it from pieces, and never takes one dependency per input. Two derivations are two answers that will disagree.
- **A carrier is copied by its shape, never by a hand-written field list.** When one object's fields travel to another (a retry, a launch, a save), spread the shape and override after; a hand list is right the day it is written and silently wrong the day a field is added.
- **A projection is a copy, never a trim in place** — the same object is often held by a second owner (an index and a store), and emptying it there deletes the record.

## 4. Changes travel with their documents

- The architecture/protocol document, the user-facing guide and the test plan are updated **in the same commit** as the code they describe. A doc left behind is a second, older truth.
- A rule learned while fixing something is written where it binds: in the repo's `docs/CONVENTIONS.md` if it is about that codebase, in `_REF` if it is about software (the constitution's universality check).

## 5. Parallel sessions share the working tree

- Before staging: `git status`. Commit **only your own paths**; another session's uncommitted files are not yours to commit, package or revert. A foreign half-state in a shared file → commit your hunk only, leave the release to the next clean tree, and tell the other session on A2A.
- Never package or install a build compiled from a tree that carries someone else's uncommitted work.

## 6. Delivery is verified from the artefact

- What ships is what is **inside** the package, not what the source says: read the artefact's own listing (zip entries, APK/VSIX contents) against what must be there and what must not (sources, tests, keys).
- Installed is not loaded: confirm the running version from the host's own record, not from a folder existing.

## 7. Feature & Capability Design Discipline (User Journey & 360° Matrix)

- **Applicability & Boundary:** Binding when designing any new feature, module, subsystem, or umbrella backlog family (e.g., audio/TTS, custom providers, new pages/panels, multi-device sync). Atomic bugfixes, typo fixes, and localized tweaks are exempt.
- **Project Design Principles Compliance:** Every design must strictly adhere to the target project's established design conventions (e.g., `docs/CONVENTIONS.md`, `Tasarım İlkeleri.md`, DENSITY rules, layout invariants). Never introduce rogue UI styles or clutter that disrupts the existing product structure.
- **Mandatory 4-Phase Design Protocol:** An agent MUST NEVER jump straight into a shallow technical checklist or start coding before documenting all four phases:

### Phase 1: Multi-Scenario User Journey (Walkthrough Before Architecture)
Document at least 3 concrete user journeys from the end-user's perspective:
1. **Primary Flow (Happy Path):** Chronological step-by-step of what the user clicks, sees, hears, and receives from trigger to completion.
2. **Interruption & Cancellation Flow:** Halting mid-way, pausing, switching tabs, closing windows, or resetting state.
3. **Context & Edge Variations:** Variations across interaction modes (keyboard shortcuts vs mouse clicks vs auto-triggers), themes (light/dark), text selections, language phonetics (e.g., TR vs EN), and mobile/remote surfaces.

### Phase 2: The 360° Systems Matrix (6 Mandatory Layers)
Trace every user journey across all 6 technical layers to eliminate blind spots:
1. **Trigger & Surface:** Visible buttons, context menus, hotkeys, auto-triggers.
2. **UI States & Feedback:** Visual states (idle, active/streaming, paused, error, status badges).
3. **Core Engine & Data Flow:** Process lifecycle, background tasks, stdout/stderr streams, buffers.
4. **Bridge & Protocol:** Specific bridge ops, events, and IPC contracts connecting UI to Core.
5. **Premortem & Failure Modes:** Language/encoding mismatch, timeouts, concurrency collisions, process crashes.
6. **Teardown & Resource Disposal:** Terminating child processes, unhooking listeners, clearing state.

### Phase 3: Premortem & "What Did We Forget?" Self-Audit (Mandatory Challenge)
Before finalizing, explicitly challenge the design:
- *"If the user reviews this tomorrow, what are the top 3–5 obvious features, controls, or failure modes they will ask 'Why didn't you think of this?' (e.g., missing read button, volume slider, language switcher, pause shortcut, audio clipping)?"*
- Integrate those missing pieces directly into the scope before task decomposition.

### Phase 4: Child Item Decomposition & Definition of Done
Generate child backlog items only after Phases 1–3 are documented. Every child item must carry a concrete, single-sentence Acceptance Criterion: *"When [action], the system must [observable result]."*

## 8. Verification: Autonomous Proof First, Teammate Collaboration When Blocked

- **Self-Sufficiency Principle:** The agent must autonomously verify everything within its technical power (headless DOM/fixture tests for UI, execution smoke tests and exit codes for core/services). Never offload routine, automatable checks to the user out of convenience.
- **Genuine Blockers & Team Collaboration:** We work as a pair-programming team. When an agent genuinely reaches a technical limit (e.g., physical sound perception, hardware constraints, external auth, or subjective design nuance), asking for human assistance is completely encouraged — provided the agent first states what was already proven autonomously and specifies the exact focus point needing human eyes/ears.
