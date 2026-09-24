// M-13 — the task form's supervisor boxes (media/afSupervisor.js): text in the
// draft, a policy only where the user said something, and the same rule the
// host's normalizer applies (src/core/retrySupervisor.ts) on the way back.
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afSupervisor.js'), 'utf8'), sandbox);
const S = sandbox.window.AFSupervisor;
const { normalizeSupervisor, supervisorDraft } = require(path.join(ROOT, 'out', 'core', 'retrySupervisor.js'));

console.log('\n== the draft is text, and an untouched box says nothing ==');
{
    eq('blank', S.blank(), { engine: '', model: '', maxCalls: '', budgetUsd: '', minConfidence: '', lowConfidence: 'smart' });
    eq('no engine = no policy (the host makes that smart)', S.toPolicy(S.blank()), undefined);
    eq('only the engine named', S.toPolicy({ engine: 'codex' }), { engine: 'codex', lowConfidence: 'smart' });
    eq('every box said', S.toPolicy({ engine: 'claude', model: 'haiku', maxCalls: '3', budgetUsd: '0.5', minConfidence: '0.7', lowConfidence: 'park' }),
        { engine: 'claude', model: 'haiku', maxCalls: 3, budgetUsd: 0.5, minConfidence: 0.7, lowConfidence: 'park' });
    eq('a zero budget is no money cap, not a cap of zero', S.toPolicy({ engine: 'claude', budgetUsd: '0' }), { engine: 'claude', lowConfidence: 'smart' });
}

console.log('\n== a box out of range is refused where it was typed ==');
{
    ok('no engine', /engine/.test(S.error({})));
    ok('calls past 5', /1 to 5/.test(S.error({ engine: 'claude', maxCalls: '9' })));
    ok('confidence past 1', /0 to 1/.test(S.error({ engine: 'claude', minConfidence: '1.5' })));
    ok('a word for a budget', /budget/.test(S.error({ engine: 'claude', budgetUsd: 'lots' })));
    eq('a clean draft', S.error({ engine: 'claude', maxCalls: '2', minConfidence: '0.6' }), '');
    eq('a refused draft makes no policy', S.toPolicy({ engine: 'claude', maxCalls: '9' }), undefined);
}

console.log('\n== form -> host -> form is the same policy ==');
{
    const typed = { engine: 'gemini', model: 'flash', maxCalls: '4', budgetUsd: '1.25', minConfidence: '0.8', lowConfidence: 'stop' };
    const stored = normalizeSupervisor(S.toPolicy(typed));
    eq('the host keeps what the form sent', stored, { engine: 'gemini', model: 'flash', maxCalls: 4, budgetUsd: 1.25, minConfidence: 0.8, lowConfidence: 'stop' });
    eq('‼️ and it reopens as the same boxes', supervisorDraft(stored), typed);
    ok('every fallback the form offers is one the host accepts',
        S.FALLBACKS.every(f => normalizeSupervisor({ engine: 'x', lowConfidence: f[0] }).lowConfidence === f[0]));
}

console.log('\n== read takes only the boxes on the page ==');
{
    const page = { 'nt-supengine': 'codex', 'nt-supcalls': '3' };
    eq('absent boxes keep the draft', S.read({ model: 'kept' }, id => page[id]),
        { engine: 'codex', model: 'kept', maxCalls: '3', budgetUsd: '', minConfidence: '', lowConfidence: 'smart' });
    eq('six ids, one per box', S.IDS.length, 6);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
