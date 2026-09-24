// X-371 — one condition engine, two dictionaries: the sentry's (unchanged) and the workflow's.
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'out/core/policyEngine.js'));
const S = require(path.join(ROOT, 'out/core/sentryPolicy.js'));
const W = require(path.join(ROOT, 'out/core/workflowPolicy.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

/* ---------- the engine takes any dictionary ---------- */
{
    const toy = { noun: 'toy', when: 'today', fields: [{ field: 'n', type: 'number', describe: '' }, { field: 'gone', type: 'text', describe: '' }], read: (k, f) => (k === 'n' ? f.n : undefined) };
    const r = E.evaluateConditions(toy, [
        { id: 'big', field: 'n', operator: 'gt', value: 3 },
        { id: 'typo', field: 'nn', operator: 'gt', value: 1 },
        { id: 'unread', field: 'gone', operator: 'contains', value: 'x' },
        { id: 'both', all: [{ id: 'a', field: 'n', operator: 'gte', value: 5 }, { id: 'b', field: 'n', operator: 'lte', value: 5 }] }
    ], { n: 5 });
    eq('ORed conditions; an AND group holds only whole', r.fired, ['big', 'both']);
    ok('‼️ an unknown field is a problem named with the dictionary\'s noun, and does not fire', r.problems.some(p => /"nn", which is not a field this toy knows/.test(p)));
    ok('a field nothing measured is a problem, not a false', r.problems.some(p => /"gone", which nothing measured today/.test(p)));
    eq('hits are per row, in order', E.conditionHits(toy, [{ id: 'x', field: 'n', operator: 'lt', value: 9 }, { id: 'x', field: 'n', operator: 'gt', value: 9 }], { n: 5 }), [true, false]);
}

/* ---------- the sentry keeps its names and its words ---------- */
{
    ok('the sentry re-exports the engine\'s operators (same list)', S.OPERATORS === E.OPERATORS && S.SNAPSHOT_TEXT_MAX === E.SNAPSHOT_TEXT_MAX);
    const v = S.evaluateSentryPolicy({ conditions: [{ id: 'q', field: 'nope', operator: 'isTrue' }] }, { diagnosis: {} });
    ok('…and its problem sentence is word for word what it was', v.problems[0] === 'condition "q" reads "nope", which is not a field this sentry knows');
    eq('the sentry dictionary is its FIELDS', S.SENTRY_DICTIONARY.fields.length, S.FIELDS.length);
}

/* ---------- the workflow dictionary ---------- */
{
    const facts = {
        step: { kind: 'media', status: 'failed', attempt: 2, elapsedMs: 61500, costUSD: 0.4 },
        verify: { verdict: 'fail' }, judge: { score: 3, modality: 'video' },
        run: { costUSD: 2.5 }, assets: { count: 4 }, output: 'Error: 429 rate limit'
    };
    eq('every field reads', W.workflowFactsSnapshot(facts), {
        always: true, 'step.kind': 'media', 'step.status': 'failed', 'verify.verdict': 'fail', 'judge.score': 3,
        'judge.modality': 'video', attempt: 2, 'cost.step': 0.4, 'cost.run': 2.5, 'asset.count': 4,
        output: 'Error: 429 rate limit', elapsed: 62, checkpoint: false
    });
    const r = W.evaluateWorkflowConditions([
        { id: 'judge-fail', field: 'verify.verdict', operator: 'eq', value: 'fail' },
        { id: 'expensive', field: 'cost.run', operator: 'gt', value: 2 },
        { id: 'rate', field: 'output', operator: 'matches', value: '429|rate limit' },
        { id: 'retrying', all: [{ id: 'a', field: 'attempt', operator: 'gte', value: 2 }, { id: 'b', field: 'step.status', operator: 'eq', value: 'failed' }] },
        { id: 'cheap', field: 'cost.step', operator: 'lt', value: 0.1 }
    ], facts);
    eq('a workflow rule set fires by name', r.fired, ['judge-fail', 'expensive', 'rate', 'retrying']);
    const none = W.evaluateWorkflowConditions([{ id: 's', field: 'judge.score', operator: 'lt', value: 5 }, { id: 'u', field: 'step.name', operator: 'eq', value: 'x' }],
        { step: { kind: 'agent', status: 'done' } });
    ok('‼️ no judge ran: its score was not measured — a problem, never a fire', none.fired.length === 0 && /"judge.score", which nothing measured at this step/.test(none.problems[0]));
    ok('an unknown workflow field is named', /"step.name", which is not a field this workflow knows/.test(none.problems[1]));
    eq('a checkpoint step reads as a checkpoint', W.workflowFactsSnapshot({ step: { kind: 'checkpoint', status: 'done' } }).checkpoint, true);
    eq('the dictionary names the thirteen fields', W.WORKFLOW_FIELDS.map(f => f.field), ['always', 'step.kind', 'step.status', 'verify.verdict', 'judge.score', 'judge.modality', 'attempt', 'cost.step', 'cost.run', 'asset.count', 'output', 'elapsed', 'checkpoint']);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
