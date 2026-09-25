// M-48 — the one core both supervisors decide through (src/core/decisionCore.ts):
// the checkpoint supervisor (M-43/M-44) and the retry supervisor (M-13).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const D = require(path.join(ROOT, 'out/core/decisionCore.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- reading an answer ---------- */
eq('bare JSON', D.answerObject('{"a":1}').raw, { a: 1 });
eq('prose and a fence around it', D.answerObject('Here:\n```json\n{"a":2}\n```\nbye').raw, { a: 2 });
eq('a fence with no object in it does not hide the object outside', D.answerObject('```bash\nls\n```\n{"a":3}').raw, { a: 3 });
eq('a second object is not read', D.answerObject('{"a":4} and {"b":5}').raw, { a: 4 });
eq('braces inside a string are text', D.answerObject('{"why":"a } b"}').raw, { why: 'a } b' });
ok('a list is refused', /a list, not one decision/.test(D.answerObject('[{"a":1}]').error));
ok('no object is refused', /holds no JSON object/.test(D.answerObject('resume, I think').error));
ok('broken JSON says both things the two supervisors always said', /could not be read — it does not parse/.test(D.answerObject('{"a": b}').error));

/* ---------- the ceilings ---------- */
eq('room left', D.ceilingRefusal({ calls: 1, maxCalls: 2, spentUSD: 0, per: 'run' }), '');
ok('‼️ the calls, counted over what the caller says', /used its 2 calls for this task/.test(D.ceilingRefusal({ calls: 2, maxCalls: 2, spentUSD: 0, per: 'task' })));
ok('a hard budget stops the asking', /budget \(\$1\.00\) is spent — a hard ceiling for this run/.test(D.ceilingRefusal({ calls: 0, maxCalls: 9, spentUSD: 1, budgetUSD: 1, per: 'run' })));
eq('a soft budget does not', D.ceilingRefusal({ calls: 0, maxCalls: 9, spentUSD: 5, budgetUSD: 1, budgetMode: 'soft', per: 'run' }), '');
ok('…it is said instead', /over its soft \$1\.00 budget \(\$5\.00\)/.test(D.softBudgetNote({ spentUSD: 5, budgetUSD: 1, budgetMode: 'soft' })));
eq('no budget, no money ceiling', D.ceilingRefusal({ calls: 0, maxCalls: 9, spentUSD: 99, budgetUSD: 0, per: 'run' }), '');

/* ---------- the confidence gate ---------- */
eq('sure enough, or silent about it', [D.underConfidence(0.6, 0.6), D.underConfidence(undefined, 0.6)], ['', '']);
ok('below it, in one sentence', /40% sure; the threshold is 60%/.test(D.underConfidence(0.4, 0.6)));

/* ---------- ‼️ both supervisors go through it ---------- */
const src = f => fs.readFileSync(path.join(ROOT, 'src/core', f), 'utf8');
ok('‼️ the checkpoint supervisor reads its answer and gates confidence through the core', /answerObject\(answer\)/.test(src('supervisorDecision.ts')) && /underConfidence\(d\.confidence/.test(src('supervisorDecision.ts')) && !/function firstObject/.test(src('supervisorDecision.ts')));
ok('‼️ the retry supervisor (M-13) does too', /return answerObject\(text\)/.test(src('retrySupervisor.ts')) && /underConfidence\(d\.confidence/.test(src('retrySupervisor.ts')));
ok('both ceilings are the core\'s', /ceilingRefusal\(\{[^}]*per: 'task'/.test(src('retrySupervisor.ts')) && /ceilingRefusal\(\{[^}]*per: 'run'/.test(src('supervisorRun.ts')));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
