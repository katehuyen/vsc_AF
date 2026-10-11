# Project Bootstrap — starting a new project or repository

Binding on **whichever agent** scaffolds, initializes or first writes code into a new project or repo. Nobody should have to say "go and look at project X and copy its habits": they are here. Do the steps in order; each ends in something a test or a file proves.

1. **Charter first.** The vault project's `Charter.md` has `## Code Architecture`, `## Verification Gate` and `## Project Invariants` filled — short and binding, they are inlined into every session's brief (`_REF/project-session.md`). The skeleton writes the headings; never delete them.
2. **The gate before feature code.** `node <agents>/_TEMPLATES/test-harness/setup.js <repo>` installs `test/run-all.js`, `test/lib.js`, the universal checks (encoding, tracked-file credentials, file size) and `.githooks/pre-commit` (the suite + the staged credential scan), `.gitattributes` and `git config core.hooksPath .githooks`. Add the project's own checks beside them (`_REF/test-discipline.md`). Where the real build cannot run locally, the same gate runs first in CI.
3. **Conventions file.** Copy `_TEMPLATES/conventions/CONVENTIONS.md` to `docs/CONVENTIONS.md` and fill only its "This project" section: layers and paths, the platform's instrument for each design name, the project's gates. The universal rules stay in `_REF`, never re-typed into the repo.
4. **The record from the first commit** (`_REF/git.md` A): the `v#.#` counter starts at the first formatted commit; the release version lives in ONE place (package manifest, `build.gradle` constant…); `CHANGELOG.md` exists with the first `## <version> - <title> (<YYYY-MM-DD>)` entry, user-facing and in the user's language, and a gate test holds the version and the newest entry together.
5. **Screenshots folder.** `docs/Screenshots/` is created and git-ignored; screenshots shared with the user go there, timestamp-first (`_REF/ui-conventions.md`).
6. **A public repo holds no secret.** Keys go to the CI's secret store or a git-ignored local folder; the staged scan and the tracked-file sweep are on from step 2.
7. **Platform CI and the visual harness** before the first screen is built:
   - **Android:** `_TEMPLATES/android-ci/` (cloud build, emulator screenshots, Firebase Test Lab on `[testlab]`, App Distribution on `[deliver]`, fixed debug signing) — its README lists what the user must provide (Firebase project, app id, service-account secret, tester group).
   - **Web / webview:** a headless render + screenshot tool on every UI turn (`_REF/ui-conventions.md` → Project Tooling).
8. **Docs in place:** architecture/protocol document, `docs/test-plan.md` (scenarios with their last result), README pointing to all of them.
9. **Record it:** worklog line, a decision record for any choice worth a "why" later (build host, platform, public/private), and the first deliverable.
