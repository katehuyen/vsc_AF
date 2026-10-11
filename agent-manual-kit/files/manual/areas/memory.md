---
id: memory
title: Memory — agents' memory files and their index
order: 16
summary: Inspect, search, add, copy, deduplicate, merge, distill and archive agents' memory files safely.
ui: Agent Detail page ▸ Memory; "Agent Farm: Open Memory Graph"
keywords: [memory, MEMORY.md, index, remember, notes, facts, duplicate, merge, distill, archive, semantic search, contradictions]
related: [agents, knowledge]
---
# Memory

## Model
Each agent has `memory/` with one fact per file and `memory/MEMORY.md` as the index (one pointer line per file). A file not in the index is never opened by the agent; an index line with no file is a dead pointer. The ops keep both sides consistent and write backups (`.afbak`) before any overwrite.

## Common intents
- What an agent remembers: `memory.list agent=<a>` (size and staleness per file).
- Fleet-wide question: `memory.ask query="..."` (meaning search; needs `memory.semantic.build` and an embeddings provider).
- Add a fact: `memory.add` (creates the file and its index line together).
- Give a fact to another agent: `memory.copy`.
- Fix the index: `memory.index.plan agent=<a>` (read), then `memory.index.fix agent=<a> lines=[...] apply=true` (or `all=true apply=true`).
- Same file in several agents: `memory.duplicates`; reconcile with `memory.sync` (one copy wins) or `memory.merge.draft` → edit → `memory.merge.apply`. Both plan first; `confirm=true` writes.
- Bloated file: `memory.distill` (cheap-model call; `apply=true` overwrites). Old file: `memory.archive` (plans first; `confirm=true` moves it).
- Conflicting claims: `memory.contradictions agent=<a>` (one cheap-model call, writes nothing).

## Rules
Run cost-bearing ops (`distill`, `contradictions`, `semantic.build`) only when the user asks. Show the plan before `confirm=true`.
