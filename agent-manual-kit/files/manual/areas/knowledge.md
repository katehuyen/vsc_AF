---
id: knowledge
title: Knowledge — the wiki and the transcript meaning index
order: 17
summary: Mark valuable turns as wiki candidates, compile them into the wiki, keep the wiki healthy; build the semantic index for meaning search.
ui: "Agent Farm: Open Wiki"; Search page ▸ Meaning mode
keywords: [wiki, knowledge base, compile, remember this, worth keeping, candidate, category, semantic, meaning search, embeddings, index]
related: [memory, sessions, projects]
---
# Knowledge

## Wiki
Turns worth keeping are **marked** into a candidate pool (cheap, reversible, never touches the vault), then **compiled** into wiki pages by an agent following the wiki's own rules file.
- Mark: `wiki.candidates.add session=<id> topics="a, b" turn=4` (or a range "3-7"; omit for the whole session). List: `wiki.candidates.list`.
- Compile: `wiki.compile` returns the brief; `wiki.compile.run topic=<t>` (or `ids=[...]`, `all=true`) starts a headless run that writes the pages.
- Health: `wiki.status`, `wiki.health`, `wiki.lint` (reports, never repairs); set up: `wiki.init`; categories: `wiki.categories`, `wiki.category.add`, `wiki.category.rename`.

## Meaning search
`search.index.build` embeds transcripts for the Search page's Meaning mode (needs an embeddings provider; costs embedding calls). For text search use `search.transcripts` (area sessions); for agent memory use `memory.ask` (area memory).
