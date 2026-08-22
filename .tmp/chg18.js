'use strict';
const fs = require('fs');

const entry = [
'## 3.229.0 — X-46: what a real run found · M-20: a council is a chaired conversation (2026-08-22)',
'',
'### The first real adaptive run, and the two things no unit test could have found',
'',
'A real objective was run on the installed build: a Haiku planner, two OpenCode delegates on free models, `plan` permissions. The planner chose `message`, opened a conversation with the right cast and ordered a real speaking turn. Both faults below came out of that run.',
'',
'**A delegate\'s archive was read as what the agent SAID, and on one engine it is not.** A headless OpenCode turn runs `run --format json`, so its archive is that engine\'s own JSONL event stream — `step_start`, `text`, `tool_use`, `step_finish`. An M-19 speaking turn takes its message text from the archived body, so the record held 4 KB of transport and the next speaker was going to be shown it as "what the other agent said". The same body is the material a `review`, `compare` or `revise` delegate is handed. M-14 had already met this in the workflow handoff and unwrapped it there, in two branches beside one caller; that is now `engineReplyText` in `core/tasks.ts` — one place, **keyed on the engine and never sniffed from the content**, because a bare `response` field in somebody\'s own output contract is their data and not a wrapper for us to unwrap. A mission reads a delegate\'s archive through it with that task\'s own engine. A stream that really carried no prose comes back empty, so the caller\'s own rule about an empty turn is the one that fires; a body the reader recognises nothing in is shown as itself, because a spawn error is not silence.',
'',
'**A delegation a ceiling was holding reported nothing at all.** The run\'s one delegation was parked by the fleet\'s daily budget. The step read `running` on every surface while no process had been launched, the objective spent its entire wall clock waiting for it, and it then stopped with `hard-limit` — three true statements and not one of them the reason. The park\'s own sentence now travels to the step as `held`, is cleared the moment the task launches or settles, refreshes the surfaces while it lasts, and reaches any caller through `missions.status`. A ceiling is a thing the user can lift, and they can only lift the one they were told about.',
'',
'### M-20 — Council',
'',
'**A council is a conversation with a chair and a mandate, not a second engine.** The build this refuses is the obvious one: a council engine that runs round 1 = A, round 2 = B, round 3 = synthesis. That protocol is a guess about a debate nobody has had yet — the moment the second speaker concedes in its first sentence, rounds 2 and 3 are bought anyway, and the transcript reads like deliberation because the shape was printed before anyone spoke. So `council` adds no way of talking: it opens an ordinary M-19 conversation and orders its opening turns in the same decision, and every turn after that is an ordinary `message`. The participant lock, the ref check, the lane honesty, the repeat guard and the independent-round rule are the SAME ones, because there is only one set.',
'',
'**What it adds is what the record cannot state for itself.** The **question** it settles, which is narrower than the objective. A **chair** — and ‼️ a chair that is not the lead really chairs: a turn by anybody else has to name the chair\'s latest message in `refs`, so the speaker reads what the chair actually wrote rather than the lead\'s account of it. A lead that wanted to invent an instruction would have to invent a message, and it cannot. The opening round is the one exception, because there is nothing to cite yet. A **turn cap**, which ends an endless debate mechanically — and ‼️ the cap stops the debate, not the ending: one turn is allowed past it and only if it closes, or every exit would be refused for being one turn too many, including the exit that exists for exactly this. And **seven stated ways out** (`consensus · sufficient evidence · no new information · decision clear · need execution · hard limit · chair abort`), because "the discussion finished" stands equally for "they agreed" and "we ran out of turns".',
'',
'**A vote is optional, and its choice is the voter\'s own word for it.** Read out of the turn\'s real text against the options the council named; a turn that named none is recorded `unclear` rather than resolved into the likeliest one, and a tie is reported as a tie rather than handed to the lead as a leader. ‼️ **A council decides its own question and never the objective** — a majority is what the members think, and only an `evaluate` verdict judges a success criterion. `missions.council` returns one council\'s whole record: mandate, turns spent against the cap, what is still unanswered, which message the next turn has to cite, the votes and the tally, the synthesis\'s real refs, and the exit with what it means. `missions.status` carries one line per council and not the votes.',
'',
''
].join('\n');

let s = fs.readFileSync('CHANGELOG.md', 'utf8');
if (s.indexOf('## 3.229.0') === -1) {
    s = s.replace('## 3.228.0 —', entry + '## 3.228.0 —');
    fs.writeFileSync('CHANGELOG.md', s, 'utf8');
}
let j = fs.readFileSync('package.json', 'utf8');
j = j.replace('"version": "3.228.0"', '"version": "3.229.0"');
fs.writeFileSync('package.json', j, 'utf8');
console.log('version now', JSON.parse(j).version);
