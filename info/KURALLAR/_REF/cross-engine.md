# Cross-Engine Copies — Read Before Changing an Instruction File

Claude reads `CLAUDE.md`. The other engines do **not** — they read `AGENTS.md`. Agent Farm generates those copies; they are **generated artifacts** — a change made in one of them is lost, a change made in the source has to be pushed out.

## Who reads what

| Engine | Reads | Walks up to the parent folder? |
|---|---|---|
| **Claude Code** | `<agent>/CLAUDE.md` + every parent `CLAUDE.md` (so the constitution is free) | yes |
| **Codex** | one `AGENTS.md` per directory, merged from the **git root down to its cwd**, 32 KiB total ceiling | yes |
| **Antigravity** | every `AGENTS.md` / `GEMINI.md` (and `.agents/` folder) from the cwd **up to the repository root**, plus global `~/.gemini/GEMINI.md` + `~/.gemini/AGENTS.md`. De-duplicates by **path, not content**; 24,000-byte cap per file; a 20,000-token rules budget, past which a file is reduced to its path | yes, to the repository root |
| **OpenCode** | the **same** `AGENTS.md` — every one from the cwd up to the **git worktree**. `AGENTS.md` shadows `CLAUDE.md` entirely (first matching NAME wins) | yes, but it **stops at the git worktree** |

Consequence: the constitution reaches all three as a **single mirror** at `ajanlar/AGENTS.md`, and each agent's own text as `<agent>/AGENTS.md`. Nothing else carries either. Because Antigravity de-duplicates by path, a second copy is loaded twice and pushes the rules past its budget — so `<agent>/.agents/AGENTS.md` is written **only where Antigravity's walk does not reach the mirror** (the agent folder is its own repository, or there is no repository), and then it carries the constitution alone. Where the walk reaches, the sync deletes its own unedited copy and reports a hand-edited or foreign one. OpenCode's walk stops at the worktree the same way; for that case the sync adds `instructions: ["../AGENTS.md"]` to the agent's `opencode.json`. `agents.sync` answers `opencode.reachesConstitution` and `antigravity` (`reachesConstitution`, and `load`: the files the walk finds, their bytes, `duplicates`, `overFileCap`) per agent — facts you can check rather than assume.

OpenCode also loads **one** global instruction file: `~/.config/opencode/AGENTS.md`, or — when that does not exist — the user's personal `~/.claude/CLAUDE.md`.

**Agent Farm never writes the engines' global slots** (`~/.gemini/GEMINI.md`, `~/.gemini/AGENTS.md`, `~/.config/opencode/AGENTS.md`): they apply to every project opened on the machine, not just agent work, so the constitution is delivered workspace-scoped instead — in the repo, travelling by git. The user's own `~/.gemini/GEMINI.md` (rules for Antigravity alone) is theirs; it lives in the agent repo through the `~/.gemini` folder link (`_REF/machine-setup.md`) and is counted in `antigravity.load`.

## Generated files — never hand-edit

`ajanlar/AGENTS.md` · `<agent>/AGENTS.md` · `<agent>/.agents/AGENTS.md` (only where the walk falls short) · `<agent>/.agents/workflows/*.md` · `<agent>/.opencode/command/*.md` · `.agents/af-antigravity-sync.json` and `.opencode/af-opencode-sync.json` (fingerprints) · `.agents/*mcp*suggested*` · `.opencode/mcp.suggested.json`.

The MCP suggestions are **suggestions**: nobody's live config is edited for them. Skills are not copied at all — OpenCode auto-loads `~/.claude/skills/<name>/SKILL.md`, which is where they already are.

An `AGENTS.md` edited on the engine side is not thrown away: the sync detects it and offers to carry the gain back into `CLAUDE.md`. `.agents/AGENTS.md` is generated-only — a hand edit is reported (Insights), never deleted, and a forced sync overwrites it where it is still needed, so move the gain into `CLAUDE.md` yourself.

## When you change a source, refresh the copies — in the same commit

| You changed | Run |
|---|---|
| `ajanlar/CLAUDE.md` (the constitution) | `constitution.sync`, **then `agents.sync` for every agent** — a no-op for the constitution where the walk reaches the mirror, and the refresh of the embedded copy where it does not |
| one agent's `CLAUDE.md` or `DUTIES.md` | `agents.sync` for that agent |

Via the bridge (`_REF/bridge.md`): `{"op":"constitution.sync"}` then `{"op":"agents.sync","args":{"agent":"<name>"}}`. From the UI: **Sync Shared Constitution with the Other Engines…** and right-click an agent → **Sync Agent with the Other Engines…**

Neither op is destructive without `force`: a file Agent Farm did not generate, or one edited since it last wrote it, is reported and left alone. `CLAUDE.md` is only ever written by the explicit reverse sync, which strips the constitution fence first — a shared rule must never end up duplicated inside an agent's own instructions.

**Skipping the refresh is a silent failure** (Principle 1): the Claude side moves on while the other engines keep answering from the old rules, and nothing complains except an Insights line nobody read.
