'use strict';
const fs = require('fs');

const entry = [
'## 3.230.0 — U-64: Classic and Adaptive in one Missions room, and a run that says what it is doing and why (2026-08-22)',
'',
'### One form, two kinds of work',
'',
'**The Missions page has asked for a recipe since the day it existed.** A lead, a team, rounds, limits — and an adaptive objective, which the core has been able to run since M-15, could only be started from the bridge. There is now a choice at the top of the form and nothing else moved: `Classic Mission` is pre-selected and its fields, its DOM and the message it posts are what they always were. ‼️ A classic Start sends **no `mode` key at all** — the host reads anything that is not the exact string `adaptive` as classic, so the absent key IS the answer and a payload that grew a field nobody reads would be the compatibility break this avoids.',
'',
'**`Adaptive Objective` asks the three questions an outcome is made of** — what you want to end up with, what the run may NOT do, and how the result will be judged — and folds everything that already has a default under **Advanced**: the lead (leave it and the first of the pool leads), the pool, the workdir, the limits, the engines and the approval gate. A criterion is `required` by default, because an objective nobody can fail is not one, and each carries the stable id (`c1`, `c2`…) every later evaluation refers to for the life of the run. ‼️ Switching mode **reads the form first**: nothing typed in the other one is lost, it is hidden.',
'',
'**And the model box finally knows which engine it is on.** Every other launch surface narrows the model and the effort to the engine the row is set to; this form offered four Claude aliases and six efforts to a member delegating on OpenCode, and the launch then refused the pair. Both questions now go to `afEngine.js` — the same helper the Console and the Task launcher read — per member row and live: change a member\'s engine, or the mission-wide one that members inherit, and its model box carries that engine\'s own catalog. ‼️ An engine with **no** effort setting draws the box dead and says which engine decided that, rather than offering five words that would be refused at spawn.',
'',
'### A run detail that answers "what is it doing, and why"',
'',
'An adaptive run now opens on seven sections a classic run does not grow, each with one subject and no fact repeated between them.',
'',
'**Objective** — every criterion with the LATEST verdict that still speaks for the work as it stands, read by the same staleness rule the success gate uses, so the page can never show a pass the gate would refuse. Required and optional are visibly different, because the asymmetry is the whole point of the flag. **Strategy** — the approach in force with its version and phase, and ‼️ **every revision with the reason it was cut**, which is the half that exists only in the journal: the run record holds the strategy, the trace holds why it moved. A version is cut when the approach MOVED, so a run of eight rounds under one `v1` changed its mind never, and the round bands say which version each was decided under. **Guide next decision** — a one-off steer through the same door the command and the bridge use, and it says plainly WHERE it lands: the next planner boundary, never the delegation running now, because a task in flight has its prompt and cannot be renegotiated. **Cast** — the roles the lead BOUND at runtime, which is the only place an adaptive run\'s team is a fact, with who is working this moment and who in the pool is still unused. **Conversations** — one line per exchange and per council, counting only messages that were really spoken; the transcript is its own surface and a hollow one here would be a feature that does not exist. **Evaluations** — every verdict, stale ones kept, with who gave it and what it advised. **Runtime graph** — what actually happened, node by node, with each one\'s fan-in: nothing here was drawn in advance, which is the difference between this and a workflow.',
'',
'‼️ **What is not drawn is the lead\'s hidden reasoning.** A round\'s stated thought, a strategy\'s own words and an evaluation\'s evidence are statements made for the record; there is no chain-of-thought here and the absence is deliberate. And an honest ending now names what it did NOT reach — the exact criterion ids the success gate refused on — instead of leaving that in a log.',
'',
'**Two faults came out of drawing it.** A round\'s work was rendered only when the round was called `delegate`, so every `parallel`, `review`, `compare`, `revise`, `message` and `council` round — which is most of what an adaptive lead orders — showed its thought with its delegations invisible; the branch tested the round\'s NAME instead of its contents. And an adaptive run drew an empty `team ·` in its header, reading as a missing fact rather than as a cast that is bound at runtime.',
'',
'### And a gate for the thing that shipped by accident',
'',
'**A stray file in the repo root rides into the VSIX and nothing notices.** Measured while packaging this build: a 1.4 MB file a mistyped shell redirection had left in the root was packed, and every gate passed — each of them names a FOLDER, and the root matched none of them. `npm run verify` now refuses an artefact carrying any root file outside the short known list.',
''
].join('\n');

const file = 'CHANGELOG.md';
const text = fs.readFileSync(file, 'utf8');
const at = text.indexOf('## 3.229.0');
if (at < 0) { throw new Error('anchor not found'); }
fs.writeFileSync(file, text.slice(0, at) + entry + '\n' + text.slice(at), 'utf8');
console.log('changelog: 3.230.0 written');
