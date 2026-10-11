# Agent Manual kit for Agent Farm

A self-contained package. Nothing in this repository's `src/` was changed: everything that goes into the
extension is in `patch/agent-manual.patch` (against commit `6c634b0`, Agent Farm 3.930.0) and, file by file,
in `files/` (same paths as in the repo).

**Keep this folder outside the Agent Farm repository** when you use it (e.g. `~/agent-manual-kit`): inside it,
the repo's TypeScript build picks up `files/src/**/*.ts` and fails (TS6059). For the same reason the branch that
carries this kit is a delivery vehicle, not something to merge.

Read in this order:
1. `DESIGN.md` — what the system is and why it is built this way.
2. `INTEGRATION.md` — the exact steps for the agent that applies it to the development repo.
3. `FINDINGS.md` — problems found in the current contracts and code that the manual exposed.
4. `personal/` — optional: how to slim the user's own `_REF` rules once the manual ships.
