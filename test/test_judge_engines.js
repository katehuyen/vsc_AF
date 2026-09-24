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

/* ---------- M-42 (2) — the judge is chosen per step, and says where it came from ---------- */
const SHIPPED = '--model claude-haiku-4-5-20251001';
const w0 = J.judgeWant(undefined, SHIPPED);
eq('no step choice + shipped args → claude, built-in, args kept', [w0.engine, w0.model, w0.args], ['claude', undefined, SHIPPED]);
ok('…and the origin says built-in for both halves', /^judge claude — built-in default · args --model claude-haiku-4-5-20251001 — built-in default$/.test(w0.origin));
const w1 = J.judgeWant(undefined, '--model claude-sonnet-5 --verbose');
ok('a Farm Settings judge args is named as such', /args --model claude-sonnet-5 --verbose — from Farm Settings/.test(w1.origin));
const w2 = J.judgeWant({ model: 'claude-opus-5-5' }, '--model claude-sonnet-5 --verbose');
eq('‼️ a step model replaces the args model, never a second --model', [w2.model, w2.args], ['claude-opus-5-5', '--verbose']);
ok('…and the origin says the model came from this step', /model claude-opus-5-5 — from this step/.test(w2.origin));
const w3 = J.judgeWant({ engine: 'Gemini' }, SHIPPED);
eq('Claude flags never ride on another engine', [w3.engine, w3.args], ['gemini', '']);
ok('…and the engine is named as this step\'s', /^judge Gemini — from this step/.test(w3.origin));
eq('no engine = no refusal', J.judgeEngineRefusal(''), '');
eq('claude can judge', J.judgeEngineRefusal('claude'), '');
ok('‼️ an engine with no one-shot judge turn is refused by name', /"gemini" has no one-shot judge turn yet/.test(J.judgeEngineRefusal('gemini')));

ok('‼️ no "passed through" left in the text judge', !/passed through/.test(src.slice(src.indexOf('private runJudge('), src.indexOf('private runVisionJudge('))));
ok('‼️ a media step with no asset is unjudged, not passed', !/no downloaded asset to verify — passed through/.test(src));
ok('both judges run on the step\'s own choice', (src.match(/judgeWant\(step, this\.opts\.judgeArgs\?\.\(\)\)/g) || []).length === 2);
ok('the verdict line carries the judge and its origin', /\[\$\{judged\.judge\}\]/.test(src));
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
ok('the bridge refuses a judge engine at save time', /judgeEngineRefusal\(verifyIn\?\.engine\)/.test(ext));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
