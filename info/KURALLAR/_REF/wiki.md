# LLM Wiki — Distilling Sessions into `00_WIKI`

**Obsidian is the IDE, the LLM is the programmer, the wiki is the codebase.** The user does not write `00_WIKI`; agents do. The user curates, directs, and asks. Human-side law: vault `00_WIKI/_KURALLAR_/-WIKI-ANAYASA-.md` — read it before a compile; **it outranks this file.**

**Three Layers:**
1. **RAW** (immutable): Sessions, transcripts, clipped sources. Agents read from here, never edit.
2. **WIKI** (`00_WIKI/<Category>/<Concept>.md`): Persistent, synthesized knowledge owned and maintained by agents.
3. **SCHEMA**: `-WIKI-ANAYASA-.md` + this reference procedure.

Knowledge is **compiled once and kept current**, not re-derived per query.

---

## 1. Candidate Pool vs Wiki

Marking a turn (`wiki.candidates.add`) is cheap, reversible, and writes nothing to the vault — it lands in `wiki_candidates.json`. Never compile a chat turn that was never marked.

**The drop box.** `<root>/_RAW_/` is the pool's other door: a `.md`/`.txt` file saved out of a browser (Claude Web, ChatGPT, Gemini) and dropped there **becomes a candidate by itself** — no command, no naming rule. The file's own name is its identity (`raw:<file>`), so dropping it twice makes one row; a row whose file has vanished is only withdrawn if nobody had touched it. **‼️ YOU move a compiled drop into `_RAW_/_DONE_` yourself** (creating that folder first if it is gone), in the same breath as `wiki.candidates.edit {state:"compiled"}` — nothing else can, because nothing else learns that the pages exist. A file left in the drop box is offered to the next compile as though nothing had happened; a file moved without the report leaves the pool waiting for a file that is no longer where the mark points. Its `note` is a **directive**, not context. **Self-healing:** both folders are remade by `wiki.status` / `wiki.health` and by the compile brief whenever they are missing — they live in the user's vault and will be deleted, so nothing here ever answers "that folder does not exist". The **root** is never created: it is a path typed by hand per machine, and a typo must be reported, not turned into a real empty folder. **‼️ It arrives with NO topic and is therefore NOT compilable**: a topic is the key a page is filed under and nothing guesses one. `all:true` leaves such marks out; asking for one by id is refused by name. Give it one with `wiki.candidates.edit { id, topics:[…] }` — and its `note` is the only way to say which part of the file matters, because a file has no turns to exclude.

---

## 2. Directory Structure and File Naming

- **Layout:** `00_WIKI/<Category>/<Concept_Name>.md` (e.g. `00_WIKI/Agents/Weighted_Tokens.md`, `00_WIKI/System/Memory_Graph.md`).
- **Hierarchy:** Strictly single-level category folders. Deeply nested subfolders are prohibited.
- **Naming:** Filename is verbatim the concept name (`Weighted_Tokens.md`). Never prefix dates, turn numbers, or session IDs to filenames.
- **‼️ Links use the FILENAME form:** `[[Weighted_Tokens]]`, never `[[Weighted Tokens]]`. Obsidian resolves a `[[link]]` against the filename, and so does `wiki.lint` — a spaced link to an underscored file is broken on both sides. Same for the line `index.md` carries for the page.
- **Navigation Files:**
  - `00_WIKI/index.md`: Categorized index of all concept pages with one-line descriptions. Updated on every compile.
  - `00_WIKI/log.md`: Append-only chronological audit log (`## [YYYY-MM-DD] compile | <Topic>`).

---

## 3. Atomicity and Page Creation Threshold

- **One Page = One Concept:** Named after the concept, not the conversation ("Weighted Tokens", not "Session Aug 20").
- **Page Creation Threshold:**
  - Open a new page when a concept is referenced from **2+ distinct sessions/sources** or represents an independent core architecture/domain concept.
  - Otherwise, integrate incremental findings as a section into an existing parent concept page.
- **Single Source of Truth:** Never duplicate paragraphs across two pages. A concept lives on its primary page; other pages link to it via `[[Wiki Links]]`.
- **Language Standard:** Wiki content is written in **Turkish** (vault knowledge base standard).

---

## 4. Standard Page Template

Pages in `00_WIKI` adhere to this exact structure:

```markdown
---
tags: [<category>, <concept>]
updated: YYYY-MM-DD
---

# <Concept Title>

**Özet:** 1-2 cümlelik net ve yalın kavram tanımı.

## Açıklama ve Detaylar
Kavramın çalışma mantığı, kuralları ve mimarisi. İlgili diğer kavramlara bolca [[Ic_Baglanti]] verilir (bağlantı **dosya adı biçiminde** yazılır — bkz. §2).

## Kaynaklar
- [YYYY-MM-DD] Oturum: `<sessionId>` (Tur <N>)
- [YYYY-MM-DD] Harici Kaynak: [[_RAW_/_DONE_/dosya_adi.md]]
```

The second form is for a **dropped file** (§1) and points at the **archive** path — where the file will be once you have moved it, which is where anybody following the link will look.

---

## 5. Contradictions and Superseding

- **No Silent Deletions:** When new evidence contradicts existing wiki content, never delete the old text silently.
- **Dated Annotation:** Annotate the change with context:
  `> **[YYYY-MM-DD Güncellemesi]:** Önceki yaklaşım (<eski durum>) yerine artık <yeni durum> geçerlidir. (Gerekçe: ...)`
- If two facts irreconcilably clash and intent is ambiguous, do not guess — post a question on Notices (`notices.post type:"question"`).

---

## 6. Provenance and Confidence

- Every fact must be attributable to a source under `## Kaynaklar`.
- Verified system/code facts and measurements are stated directly.
- Speculative inferences, agent suggestions, or unconfirmed hypotheses must carry an explicit `[Hipotez]` or `[Öneri]` tag.

---

## 7. Research Policy (Web Access)

- Primary sources are session transcripts, user directives, and the local vault.
- Web search (Layer 1 WebSearch) is permitted **only** to verify general third-party libraries, terminology definitions, or open standards. Never search the web to guess personal user preferences or custom internal system rules.

---

## 8. Step-by-Step Compilation Workflow (`wiki.compile`)

**Two doors, one brief.** `wiki.compile` hands the brief to *you*, here and now. `wiki.compile.run` starts a **headless run** that carries out these same steps — use it when the compile is not the work you are in the middle of. Either way the steps below are the work, and only step 6 closes a mark.

When `wiki.compile` runs:
1. **Read Candidates:** Fetch pending candidates from `wiki.candidates.list`.
2. **Extract Facts:** Read the corresponding session transcripts and distill key concepts.
3. **Inspect Index & Existing Pages:** Read `00_WIKI/index.md` and check if concept pages already exist.
4. **Write/Update Pages:** Create new `.md` files or update existing pages adhering to Section 4 & 5.
5. **Update Navigation:**
   - Add/update the one-line pointer in `00_WIKI/index.md`.
   - Append `## [YYYY-MM-DD] compile | <Concept>` to `00_WIKI/log.md`.
6. **Reconcile Pool:** Mark processed candidates as compiled via `wiki.candidates.edit`.

---

## 9. Maintenance and Linting (`wiki.lint`)

- Triggered on demand (not on background timers).
- **Scope:** Scans for orphan pages (no inbound links), broken links (`[[NonExistent]]`), unresolved contradictions, and unindexed pages.
- **Non-destructive:** Lint **only reports findings** to `00_WIKI/log.md` and Notices; it never silently edits or deletes pages.

---

## 10. Bridge Operations

- `wiki.candidates.add` — mark a turn (`turn: 4`, `turn: "3-7"`, or omit for the whole session). Cheap, reversible, writes nothing to the vault. Needs at least one topic: it is the filing key. Marking **the same range** again merges topics into that row; a **different** range is a different mark, so marking a whole session does NOT swallow the single turns already kept inside it — a session filed under one subject can hold one turn that is the best thing written about another. `excludeTurns: [14,15]` says "the whole scope except these", which is the cheap way to leave the closing turns out.
- `wiki.candidates.list` · `wiki.candidates.edit` · `wiki.candidates.remove` — read, amend, drop. A `state` sweep on remove never touches pending work. `edit` also takes `excludeTurns` (`[]` removes them) and `retry: true`, which clears the reason a failed compile left behind.
- `wiki.compile` — **‼️ hands back a BRIEF; it does not write a page.** It gathers the chosen candidates, resolves each to a transcript and a turn range, finds the rules, lists what the wiki already holds, and states the steps. You do the reading and the writing, then report back with `wiki.candidates.edit { id, state:"compiled", pages:[…] }` — asking for a brief marks nothing compiled.
- `wiki.compile.run` — the same brief, **started as a headless run** instead of handed back. Same three selectors (`ids` / `topic` / `all`), plus `agent?` (default `agentFarm.wikiAgent`), `engine?` `model?` `effort?` `start?`. ‼️ **Starting a run marks nothing compiled** — the run reports back with `wiki.candidates.edit`, which is still the only thing that closes a mark. A mark with a run already out is **refused rather than read twice**; a claim whose run has ended is stale and ignored, so a crashed compile never locks a turn out.
- `wiki.status` — both sides at once: the pool (pending/compiled/**compiling**/**failed**, topics) and the vault (root, rules, index, log, page count, categories).
- `wiki.categories` · `wiki.category.add` — what a mark can be filed under (the root's folders AND the pool's topics, reported separately), and starting one folder. Single level; an existing category in ANY spelling is reported rather than duplicated.
- `wiki.category.rename { from, to }` — rename a category, or merge it into one that exists, in all three places it lives: the folder, its `## <Category>` section in `index.md`, and the topics (and page paths) of every mark in the pool. **Never rename a category folder by hand** — the index and the pending marks stay behind and the next compile re-opens the old folder. A target that exists in any spelling is a MERGE into that spelling; a page name present in both refuses the whole merge, with the list, before anything moves. Logs to `log.md` and answers with the lint. The Wiki page's ✏ Rename category button is the same body.
- `wiki.health` · `wiki.init` — is the chosen root a wiki, and make it one. `init` **only creates**: a file already on disk is reported and never rewritten, because the law is the user's own.
- `wiki.lint` — the shape check of §9, as an op.

**‼️ A CRASHED COMPILE NEVER LOCKS A TURN OUT.** A run stamps every mark it takes so two compiles cannot read the same turns twice; when that run ends — a rate limit, a cancel, a VS Code restart, or **finishing without reporting a page** — the claim is released the next time the pool is read and the reason lands on the mark (`lastError`). The mark is `pending`, offered to a compile again, and drawn as ⚠ `failed` rather than as work nobody has reached. A mark whose transcript has been moved off disk is **skipped by name** and the rest of the compile proceeds.

Root: `agentFarm.wikiRoot` (empty = `D:\zone\know\note\obsidian\00_WIKI`; `%USERPROFILE%`, `~`, `${env:VAR}` and `${workspaceRoot}` are expanded when the folder is opened, never written back into the setting) · writer: `agentFarm.wikiAgent` · and with what intelligence: `agentFarm.wikiEngine` / `wikiModel` / `wikiEffort`. All of it is on **Settings ▸ Wiki & Knowledge Base**, which reads the folder and says which of the three files are missing. A compile is **refused** when the root or `-WIKI-ANAYASA-.md` is missing — the law outranks this file, so compiling without it would be a guess.

**The user's own doors:** command palette → *Agent Farm: Compile Wiki Candidates…* (everything waiting is ticked; Enter compiles it all), and the **Wiki page** (*Agent Farm: Open Wiki*, or Toolbox → 📚 Wiki) — the pool and the vault side by side, with the same two selectors as buttons. The page is a view of these ops, not a second implementation: it edits, drops, removes and compiles through the same bodies, so anything you change here it shows.
