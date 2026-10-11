# Language Boundaries

**Communication with the user is ALWAYS TURKISH.** Chat replies, Notices messages, reports and answers presented to the user, vault content written for the user — all Turkish. The user reads their native language for nuanced communication; this is their deliberate choice.

**System files are ALWAYS ENGLISH.** The constitution, `_REF/`, agent `CLAUDE.md` files, `DUTIES.md`, `memory/`, agent-to-agent delegation instructions, inter-agent replies, headless/background reasoning, mission LEAD↔TEAM communication, sub-agent calls. Because these files load on every turn, the language difference is a permanent cost.

**Size of the gain — measure, don't assume.** English tokenizes at a fairly stable ~2.7 chars/token. Turkish varies with content: ~1.3 chars/token on prose-heavy text (so English is ~2× cheaper), but ~2.2 chars/token on files dense with paths, code identifiers, and markdown tables, where the gain shrinks to ~1.25×. Translating a procedure file typically saves 10-20%, not half. English is still the correct default — it is never the more expensive side, and it keeps agent-to-agent work consistent — but do not promise large savings without measuring the specific file.

**Boundary:** An agent delegates to another agent **in English** → receives an **English** reply → **translates to Turkish when relaying the result to the user.** The return to Turkish happens only at the user-facing boundary.

**UI is always English** — Agent Farm and other extension interfaces.

**Scope: ALL agents.** This rule applies whenever any agent runs or delegates to another agent (mission, sub-agent, `tasks.add`…).

## Recognized exception — the `psikolog` agent stays in Turkish

Everything under `ajanlar/psikolog/` — its `CLAUDE.md`, `DUTIES.md`, and its entire `memory/` — is written and kept in **Turkish**, by the user's decision. That agent works on the user's inner life, where meaning depends on nuances of thinking and expressing in Turkish; translating it would damage the substance, and the token saving is not worth that.

This is a **recognized exception, not a rule violation.** Do not translate those files, do not "correct" them, and do not report them as an inconsistency. If you delegate work to `psikolog`, write the delegation instruction in Turkish as well.

