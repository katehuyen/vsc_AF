// M-42 — the vision judge never PASSes what it could not look at.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const J = require(path.join(ROOT, 'out', 'core', 'judgeEngines.js'));

eq('modality by extension', ['a.PNG', 'b.mp4', 'c.mov', 'd.wav', 'e.pdf', 'f.md'].map(J.assetModality),
    ['image', 'video', 'video', 'audio', 'pdf', 'text']);
const v = J.visionRoute('clip.mp4');
eq('‼️ REGRESSION: Claude + video is refused before anything runs', [v.ok, v.why], [false, 'Claude cannot open video']);
eq('Claude + image is judged as before', J.visionRoute('frame.png').ok, true);
eq('an engine that can open video is routed', J.visionRoute('clip.mp4', 'gemini').ok, true);
eq('an engine nobody stated a fact about is not refused', J.visionRoute('clip.mp4', 'opencode').ok, true);

eq('unknown behaviour = ask', J.normalizeUnjudged('whatever'), 'ask');
const why = 'Claude cannot open video';
eq('ask, and nobody could be asked → NOT a pass', J.unjudgedOutcome('ask', why).pass, false);
eq('ask → yes', J.unjudgedOutcome('ask', why, true).pass, true);
eq('ask → no', J.unjudgedOutcome('ask', why, false).pass, false);
eq('pass → continues, said so', [J.unjudgedOutcome('pass', why).pass, /passed through by your setting/.test(J.unjudgedOutcome('pass', why).line)], [true, true]);
eq('stop → stops', J.unjudgedOutcome('stop', why).pass, false);
ok('every line says NOT JUDGED and why', ['ask', 'pass', 'stop'].every(b => /^NOT JUDGED — Claude cannot open video/.test(J.unjudgedOutcome(b, why).line)));

const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
const body = src.slice(src.indexOf('private runVisionJudge('), src.indexOf('private async settleUnjudged('));
ok('the route is checked before the one-shot', body.indexOf('visionRoute(') > 0 && body.indexOf('visionRoute(') < body.indexOf('execOneShot('));
ok('‼️ no "passed through" left in the vision judge', !/passed through/.test(body));
ok('an unjudged step goes to settleUnjudged, not to the PASS branch', /judged\.unjudged\)\s*\{\s*await this\.settleUnjudged/.test(src));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
