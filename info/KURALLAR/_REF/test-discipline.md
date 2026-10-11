# Universal Test Discipline & Quality Gate

Binding on **every agent** making code changes in any repository. The goal is that no code is shipped without automated verification and zero silent regressions. Code-writing rules: `_REF/engineering.md`; a new repo: `_REF/project-bootstrap.md`.

## 1. The Core Principle: Never Done Without Verification

A task or bugfix is never considered complete without automated or verifiable proof.
- "It looks correct" is not verification.
- Green test suite execution is proof.

## 2. Bootstrapping a Test Harness (`_TEMPLATES/test-harness/`)

When starting a new project or entering an uninstrumented repository:
1. **Check for test runner:** Verify if `test/` or `npm test` (or equivalent test runner for that language) exists.
2. **If missing, scaffold immediately**, before writing feature code:
   ```bash
   node D:/zone/agent/ajanlar/_TEMPLATES/test-harness/setup.js <target-dir>
   ```
   It installs the runner, `test/lib.js`, the universal checks (encoding, tracked-file credentials, file size), `tools/scan_staged.js`, `.githooks/pre-commit`, `.gitattributes`, and enables the hook. Its README lists what to adjust per project.
3. **Configure the mechanical gate:** `git config core.hooksPath .githooks` on every clone; `"test": "node test/run-all.js"` in `package.json` where one exists.

## 3. Two Tiers

- **Local tier — seconds, every commit:** `.githooks/pre-commit` runs `node test/run-all.js` (the repo's shape rules) and `tools/scan_staged.js` (credentials in the staged content). It needs no build.
- **CI tier — the build the machine cannot do:** where the real build, emulator or device run cannot happen locally (the user's PC is weak), the same local gate runs first in CI, then the build and its tests (`_TEMPLATES/android-ci/` for Android). Work is not done until that run is green — and, for a visual change, its screenshots were looked at.

## 4. Two-Phase Development Cycle

- **Phase A — Iterative Drafting (Targeted):** While developing or diagnosing a bug, run only the relevant test file (`node test/test_<feature>.js`) for sub-second rapid feedback.
- **Phase B — Delivery Gate (Full Suite Mandatory):** Before committing, closing a task, or creating a release, running the full test suite (`npm test` or `node test/run-all.js`) is MANDATORY. 100% of tests must pass (0 failed).
- **Prose-only exception — no test run.** If every change in the turn is prose (a Markdown/text file, a comment, or the wording inside a message string) and no code logic, identifier, key, number, path or command the code executes changed, run no tests, targeted or full. If a test quotes the changed sentence verbatim, update that quote in the same edit, also without running it. The automatic pre-commit hook still runs by itself.

## 5. Mechanical Quality Gate

- If any test fails, git blocks the commit outright (`COMMIT BLOCKED`).
- Bypassing pre-commit with `--no-verify` is strictly forbidden unless authorized by the user for emergencies.

## 6. How a Test Is Written

- **Derive the rule from the source, never from a list written in the test.** A test that enumerates the fields, methods or files it guards is right the day it is written and silently wrong the day the next one is added; read them from the code or the document that defines them.
- **A shape assertion is a shape:** compare positions, order, presence — never a character budget. Read files through one helper that normalises CRLF (`test/lib.js` `read`); Windows checkouts must not flip a result.
- **Prove a guard bites:** break the guarded thing on purpose, watch the test fail, restore from your own copy (never `git checkout --`, which restores HEAD and takes uncommitted work with it). Name the mutation in the commit body.
- **An async test must not be able to end early and look green.** A promise that never settles leaves the runtime nothing to wait for; it exits 0 with no summary. The runner requires the summary line, and the test file fails on `exit` when its end was not reached — a mutation tool that reads only the exit code otherwise reports a caught mutation as missed.
- **A red test nobody can explain is fixed or deleted in the turn it is found** — never carried as a known failure; a suite that is always a little red stops being read.
- **A test written for a real incident is pinned.** List it in the repo's pin file (incident id · file · assertion title); a gate fails when a pinned assertion disappears. Removing or loosening a pin needs the user's yes, asked in chat — a refactor that drops an incident's guard is a regression by definition.
- **A fixture the code under test built never holds what a person makes by hand.** Where the user can create or edit the same file themselves (an empty file, no frontmatter, another line ending), one fixture is written by the test as a person would — and the live check runs on the user's real data, where such a file was found failing after a green suite.
- **Fixtures live in temp directories** (`os.tmpdir()`), never inside `test/` or the repo, and are removed after.

## 7. Commit Proof

In accordance with `_REF/git.md`, every commit message body must explicitly state its verification proof:
- Automated suite: `Full suite N files / M passed / 0 failed (Xs)`, plus the CI run that proves the rest where there is a CI tier.
- A guard added or changed: the mutation that proved it bites.
- Pure non-code/documentation commits: explicitly state `Pure documentation edit (exempt)`
- Un-automatable environments: explicitly list manual verification steps performed.
