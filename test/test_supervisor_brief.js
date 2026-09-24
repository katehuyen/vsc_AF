// M-43 (part) — the supervisor's brief: the goal, a line per step, the directives first, only the allowed decisions.
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'out/core/supervisorBrief.js'));
const B = require(path.join(ROOT, 'out/core/runContext.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let board = B.boardWrite(undefined, { id: 's1', index: 0, title: 'Yaz', status: 'done', text: 'x'.repeat(5000), costUSD: 0.2, at: 1 });
board = B.boardWrite(board, { id: 's2', index: 1, title: 'Çiz', status: 'failed', verdict: 'fail', text: 'eller altı parmak', at: 2 });
const lim = { allowed: ['proceed', 'retry', 'stop'], maxInsert: 2, insertKinds: ['agent'], maxRetriesPerStep: 2, minConfidence: 0.6, lowConfidence: 'ask', budgetLeftUSD: 1.25 };
const brief = S.buildBrief({
    workflow: 'Klip', goal: 'Tek kişilik 10 sn klip', criteria: ['yüz net'], inputs: { clip: 'D:/a.mp4' },
    board, lastStep: 's2', assets: [{ path: 'D:/out/k1.png', verdict: 'fail: six fingers' }], costUSD: 0.2,
    directives: ['müzik ekleme'], stepIds: ['s1', 's2', 's3'], limits: lim
});
ok('the person\'s directives come before the goal', brief.indexOf('müzik ekleme') < brief.indexOf('Tek kişilik'));
ok('goal, criteria and inputs are there', /## Goal\n\nTek kişilik/.test(brief) && /- yüz net/.test(brief) && /- clip: D:\/a\.mp4/.test(brief));
ok('one line per step with status, verdict and cost', /- s1 "Yaz": done · \$0\.20/.test(brief) && /- s2 "Çiz": failed · verdict fail/.test(brief));
ok('‼️ a long step text is cut, and says it is a cut — never the whole transcript', /\[cut: 5,000 characters\]/.test(brief) && brief.length < 4000);
ok('the last output is its own section', /## The last output \(s2\)\n\neller altı parmak/.test(brief));
ok('assets with their verdicts', /- D:\/out\/k1\.png — fail: six fingers/.test(brief));
ok('money spent and left', /Spent \$0\.20 · left \$1\.25\./.test(brief));
ok('‼️ only the allowed decisions are offered', /"retry" — run a step again/.test(brief) && !/"insert" —/.test(brief) && !/"jump" —/.test(brief));
ok('the step ids and the confidence floor are named', /Step ids: s1, s2, s3\./.test(brief) && /Below 60% confidence/.test(brief));
const bare = S.buildBrief({ workflow: 'Boş', costUSD: 0, stepIds: ['s1'], limits: { ...lim, budgetLeftUSD: undefined } });
ok('no goal, no steps and no budget are said, not left blank', /no goal was written/.test(bare) && /none has finished yet/.test(bare) && /no budget set/.test(bare));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
