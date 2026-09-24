// M-43 (part) — the supervisor's decision JSON: parsed, held against the run, refused in words.
'use strict';
const path = require('path');
const D = require(path.join(path.resolve(__dirname, '..'), 'out/core/supervisorDecision.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const lim = { allowed: D.DECISION_KINDS, maxInsert: 2, insertKinds: ['agent', 'media'], maxRetriesPerStep: 2, minConfidence: 0.6, lowConfidence: 'ask', budgetLeftUSD: 1 };
const ctx = { stepIds: ['s1', 's2', 's3'], currentStep: 's2', retries: { s2: 1 }, history: [] };
const read = (o, c = ctx, l = lim) => D.readDecision(typeof o === 'string' ? o : JSON.stringify(o), c, l);

/* ---------- every decision kind passes when it is sound ---------- */
ok('proceed', read({ decision: 'proceed', confidence: 0.9 }).ok);
const r = read({ decision: 'retry', patch: { prompt: 'daha kısa' } });
ok('retry defaults to the current step', r.ok && r.decision.target === 's2' && r.decision.patch.prompt === 'daha kısa');
ok('jump to a step the chain has', read({ decision: 'jump', target: 's1' }).ok);
ok('insert within the ceiling and kinds', read({ decision: 'insert', insert: [{ kind: 'agent', title: 'özetle', prompt: 'x' }] }).ok);
ok('ask_user with a question and options', read({ decision: 'ask_user', question: 'Hangisi?', options: ['A', 'B'] }).ok);
ok('stop', read({ decision: 'stop', why: 'hedefe ulaşıldı' }).ok);
ok('prose around the JSON is allowed', read('Karar:\n```json\n{"decision":"proceed","why":"ok {tamam}"}\n```').ok);

/* ---------- every refusal says why and goes mechanical ---------- */
const why = (o, c, l) => { const v = read(o, c, l); return v.ok ? '' : `${v.action}|${v.reason}`; };
ok('no JSON at all', /^mechanical\|.*no JSON object/.test(why('bence devam')));
ok('broken JSON', /^mechanical\|.*does not parse/.test(why('{"decision": "proceed",}')));
ok('an unknown decision', /"wait" is not a decision/.test(why({ decision: 'wait' })));
ok('a decision the workflow does not allow', /not a decision this workflow allows/.test(why({ decision: 'insert', insert: [{ kind: 'agent', title: 'x' }] }, ctx, { ...lim, allowed: ['proceed', 'stop'] })));
ok('jump without a target', /jump needs a target/.test(why({ decision: 'jump' })));
ok('jump to a step it does not have', /names step "s9", which this workflow does not have/.test(why({ decision: 'jump', target: 's9' })));
ok('retry over its ceiling', /has used its 2 retries/.test(why({ decision: 'retry', target: 's2' }, { ...ctx, retries: { s2: 2 } })));
ok('insert too many', /asks for 3 steps; the ceiling is 2/.test(why({ decision: 'insert', insert: [1, 2, 3].map(i => ({ kind: 'agent', title: 't' + i })) })));
ok('insert a kind not allowed', /inserted "browser" step is not allowed/.test(why({ decision: 'insert', insert: [{ kind: 'browser', title: 'b' }] })));
ok('insert a malformed step', /each with a kind and a title/.test(why({ decision: 'insert', insert: [{ title: 'no kind' }] })));
ok('ask_user without a question', /carries no question/.test(why({ decision: 'ask_user' })));
ok('a patch of something it may not change', /patch cannot change agent/.test(why({ decision: 'retry', patch: { agent: 'x' } })));
ok('spend with the budget gone', /budget is spent/.test(why({ decision: 'retry' }, ctx, { ...lim, budgetLeftUSD: 0 })));
ok('‼️ the same decision three times in a row is locked', /repeat lock/.test(why({ decision: 'jump', target: 's1' }, { ...ctx, history: ['jump:s1', 'jump:s1'] })));
ok('…but two in a row is not', read({ decision: 'jump', target: 's1' }, { ...ctx, history: ['proceed:', 'jump:s1'] }).ok);
ok('confidence outside 0..1', /from 0 to 1/.test(why({ decision: 'proceed', confidence: 7 })));
ok('low confidence follows the setting (ask)', /^ask\|.*40% sure; the threshold is 60%/.test(why({ decision: 'stop', confidence: 0.4 })));
ok('…or escalate', /^escalate\|/.test(why({ decision: 'stop', confidence: 0.4 }, ctx, { ...lim, lowConfidence: 'escalate' })));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
