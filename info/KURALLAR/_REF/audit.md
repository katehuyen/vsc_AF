# Retrospective Audit — judging work that was already called done

The fleet's defect rate is not a mystery: **"done" was self-declared and never
re-checked.** The agent that did the work wrote the closing note, and every
later agent read that note instead of the code. This is the procedure for the
opposite job — going back over closed work and holding it against what the user
actually asked for.

Binding on **whichever agent** is running the audit track. It does not replace
`_REF/project-session.md`; the handover protocol (`_REF/handover.md`) still applies.

## The unit is a CLAIM, not a session

| source | what it is | trust |
|---|---|---|
| the user's own turn, verbatim | **the specification** | the only binding text |
| the agent's closing note / handover | **the claim** | the defendant's testimony |
| today's code and screen | **reality** | measured, never asserted |

A discrepancy between the three is a finding. An audit that reads only the
closing note has audited nothing.

## Where it lives

- **Ledger** (holds the position, survives sessions):
  `00_AGENT_AREA/10_PROJECTS/PRS.MuratVural_DEV_VSC.AgentFarm/10_Notes/DENETİM - Sicil.md`
  — its own legend defines the row grammar and the verdicts. Read it once.
- **Tools** (in `vsc_AgentFarm`): `tools/audit_extract.js` (dossier),
  `tools/audit_lint.js` (the gate), `test/test_audit_ledger.js` (the gate is
  itself measured, and runs in `npm test`).

## The loop — one pass per row

1. `node tools/audit_lint.js --next` → the next ⬜ row. Never pick a row by
   preference; the ledger's order was measured, yours is a mood.
2. If the row is `⬜ dosya çıkarılmadı`: `node tools/audit_extract.js <sid8>`.
   Read the **user turns** first and the closing note second. Convert the turn
   into checkable claims and write them into that block as ⬜ rows, replacing
   the placeholder. This is the judgement work — a claim that cannot be checked
   is not written as a claim.
3. Take a claim. Establish reality:
   - **code** — read the flow the claim names, not the file that sounds right;
   - **behaviour** — run the probe/test, or write one if none exists;
   - **screen** — anything visual gets `node test/render_page.js <fixture>` then
     `node test/shoot_page.js <fixture>`, and the PNG is **looked at**, `--light`
     too. Empty · one · many are separate scenes; the smallest comes first.
     ‼️ **NAME THE SCENE AND SHOOT ONLY IT** — `--scenes` numbers them,
     `--scene N` photographs one at its own size. A montage is 19 scenes and
     ~18,000px; scaled to be read that is ~100px a scene, and until A-12.10 the
     tool also cut everything past 2,400px without saying so. Every "looked at,
     both themes" verdict written before that had seen the first three scenes.
   - **layout** — the eye finds a misaligned column; only a measurement says
     what is deciding it. `node test/measure_page.js <fixture> "<expr>"` runs one
     expression against the laid-out DOM. Column headers over the wrong data, a
     row grid whose rows are not columns, and an agent name squeezed to ZERO
     pixels were all found this way and all had correct markup — no string test
     could have failed. Two sweeps worth running on any surface you open: every
     `overflow:hidden` element whose `scrollWidth/Height` exceeds its box, and
     every text node drawn narrower than one character of itself.
   - **the scene itself** — before trusting a picture, ask whether the scene
     really produces the state its label claims. Three scenes were photographing
     the page above them (one of them labelled "panel open"), and one that
     exists to prove a refusal list had never drawn one, because it answered the
     host with a token the page discards.
4. Record the verdict with its evidence. **A verdict with no artefact is
   refused by the gate** — that is the whole design.
5. A ❌ / ⚠️ / ⛔ small enough to repair inside the turn is repaired now, and
   left at **🔁**. Never ✅ your own repair; the next agent verifies it. Too big
   to repair now: it stays ❌ with the evidence, and the next pass has a head
   start it did not have to rediscover.
6. `node tools/audit_lint.js` before the turn ends. Red means the row is not
   written yet.

## Rules that are not negotiable

- **No evidence, no verdict.** `dosya:satır`, a command with its output, or a
  PNG under `dist/render/`.
- **Nobody closes their own repair.** `fix@` may not equal `@`.
- **No new feature items.** This track is retrospective; findings live in the
  ledger, not in `Backlog.md`. A genuinely new idea is put to the user, not
  filed.
- **The user's words are the spec.** Never let a handover note stand in for
  them; the extractor prints them verbatim for exactly this reason.
- **Do not widen the corpus by yourself.** It opened on the 28
  `OTOMATİK PRO HESAP DEĞİŞTİRME` sessions plus the surface sweep, by the
  user's decision. Widening it is another decision (Principle 2).

## Handing it over

The ledger holds the position — a handover note does not replace it, it points
at it. The next agent's first five minutes are `node tools/audit_lint.js --next`.
