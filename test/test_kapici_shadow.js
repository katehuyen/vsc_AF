// X-413 + M-57 — every consumer's off / shadow / on: off never calls Kapici,
// shadow returns today's result untouched and asks Kapici afterwards with
// today's decision beside it, on lets a confident verdict win and hands
// everything else to today's path; and the dispatch consumer on top of it.
'use strict';
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');

// the classifier model is the one thing that would leave the machine: stand it in
const classifier = { calls: 0, reply: '{"agent": "asistan", "reason": "haiku says so"}' };
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === './oneShot' && parent && /dispatch\.js$/.test(parent.filename)) {
        return { execOneShot: async () => { classifier.calls++; return { out: classifier.reply, stderr: '' }; } };
    }
    return origLoad.call(this, request, parent, isMain);
};
const S = require(path.join(ROOT, 'out/core/kapici/shadow.js'));
const D = require(path.join(ROOT, 'out/core/dispatch.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const verdict = (o = {}) => Object.assign({ passed: true, decision: 'developer', confidence: 0.9, answers: {}, reason: 'agent=developer (p=0.9) · confidence 0.9 · jev-1.13.0 · 80 ms', provider: 'jev', latencyMs: 80, ruleId: 'dispatch.route', ruleVersion: 1, layer: 'builtin' }, o);

(async () => {
    ok('mode: only shadow and on switch it on', S.consumerMode('shadow') === 'shadow' && S.consumerMode('on') === 'on' && S.consumerMode(undefined) === 'off' && S.consumerMode('ON') === 'off');

    // --- the gate
    const run = async (mode, o = {}) => {
        const seen = { today: 0, asks: [] };
        const g = await S.gate(Object.assign({
            mode,
            today: async () => { seen.today++; return 'T'; },
            ask: async (m, actual) => { seen.asks.push({ m, actual }); return verdict(); },
            decisionOf: t => t,
            fromVerdict: v => 'K:' + v.decision
        }, o));
        if (g.shadow) { await g.shadow; }
        return { g, seen };
    };
    let r = await run('off');
    ok('off: today only, Kapici never asked', r.g.value === 'T' && r.g.by === 'today' && r.seen.asks.length === 0 && !r.g.shadow);
    r = await run('shadow');
    ok('shadow: today\'s value, untouched', r.g.value === 'T' && r.g.by === 'today');
    ok('shadow: Kapici asked afterwards with today\'s decision', r.seen.asks.length === 1 && r.seen.asks[0].m === 'shadow' && r.seen.asks[0].actual === 'T');
    const order = [];
    await (await S.gate({ mode: 'shadow', today: async () => { order.push('today'); return 'T'; }, ask: async () => { order.push('ask'); return verdict(); }, decisionOf: t => t, fromVerdict: () => 'K' })).shadow;
    ok('shadow: today runs first', order.join() === 'today,ask');
    const logs = [];
    r = await run('shadow', { ask: async () => { throw new Error('jev down'); }, log: l => logs.push(l) });
    ok('shadow: a Kapici error never reaches the flow', r.g.value === 'T' && logs.some(l => /jev down/.test(l)));
    let slow = false;
    const g = await S.gate({ mode: 'shadow', today: async () => 'T', ask: () => new Promise(res => setTimeout(() => { slow = true; res(verdict()); }, 60)), decisionOf: t => t, fromVerdict: () => 'K' });
    ok('shadow: nothing waits for Kapici', g.value === 'T' && slow === false);
    await g.shadow;
    r = await run('on');
    ok('on: a confident verdict wins, today not run', r.g.value === 'K:developer' && r.g.by === 'kapici' && r.seen.today === 0 && r.seen.asks[0].m === 'on');
    r = await run('on', { ask: async () => verdict({ fallback: 'mechanical' }) });
    ok('on: low confidence goes to today', r.g.value === 'T' && r.g.by === 'today' && r.g.verdict.fallback === 'mechanical');
    r = await run('on', { ask: async () => verdict({ fallback: 'fallback', decision: 'fallback' }) });
    ok('on: a failure goes to today', r.g.value === 'T');
    r = await run('on', { fromVerdict: () => undefined });
    ok('on: a verdict the consumer cannot use goes to today', r.g.value === 'T');
    r = await run('on', { ask: async () => { throw new Error('boom'); } });
    ok('on: a throw goes to today', r.g.value === 'T' && r.seen.today === 1);
    r = await run('shadow', { decisionOf: () => { throw new Error('x'); } });
    ok('shadow: an unreadable decision is asked without actual', r.seen.asks[0].actual === undefined);

    // --- the dispatch consumer
    const cands = [{ name: 'developer', hint: 'writes code' }, { name: 'asistan', hint: '' }];
    const rules = [{ match: 'fatura', agent: 'asistan' }];
    const kap = (mode, fn) => {
        const k = { mode, calls: [], evaluate: async (text, options, m, actual) => { k.calls.push({ text, options, m, actual }); return fn ? fn() : verdict(); } };
        return k;
    };
    const base = await D.dispatchText('.', '', 'fix the login page', rules, cands, false);
    let k = kap('off');
    let res = await D.dispatchText('.', '', 'fix the login page', rules, cands, false, k);
    ok('dispatch off: the same result as without Kapici, never asked', JSON.stringify(res) === JSON.stringify(base) && k.calls.length === 0);
    classifier.calls = 0;
    const withModel = await D.dispatchText('.', '', 'fix the login page', rules, cands, true);
    k = kap('off');
    res = await D.dispatchText('.', '', 'fix the login page', rules, cands, true, k);
    ok('dispatch off with the classifier: identical, model asked as before', JSON.stringify(res) === JSON.stringify(withModel) && res.method === 'model' && classifier.calls === 2);
    k = kap('on');
    res = await D.dispatchText('.', '', 'fatura kes', rules, cands, true, k);
    ok('dispatch: a matching rule wins before Kapici', res.method === 'rule' && k.calls.length === 0);
    classifier.calls = 0;
    k = kap('on');
    res = await D.dispatchText('.', '', 'fix the login page', rules, cands, true, k);
    ok('dispatch on: Kapici picks, the model is not asked', res.method === 'kapici' && res.agent === 'developer' && /confidence 0\.9/.test(res.reason) && classifier.calls === 0);
    ok('dispatch on: candidates are the options, hints their text', JSON.stringify(k.calls[0].options) === JSON.stringify({ developer: 'writes code', asistan: 'asistan' }) && k.calls[0].m === 'on');
    k = kap('on', () => verdict({ fallback: 'mechanical', confidence: 0.4 }));
    res = await D.dispatchText('.', '', 'fix the login page', rules, cands, true, k);
    ok('dispatch on, low confidence: the Haiku classifier decides', res.method === 'model' && res.agent === 'asistan' && classifier.calls === 1);
    k = kap('on', () => verdict({ decision: 'nobody' }));
    res = await D.dispatchText('.', '', 'fix the login page', rules, cands, false, k);
    ok('dispatch on, an unknown agent: today\'s path', res.method === 'none');
    classifier.calls = 0;
    k = kap('shadow');
    res = await D.dispatchText('.', '', 'fix the login page', rules, cands, true, k);
    await new Promise(r2 => setTimeout(r2, 20));
    ok('dispatch shadow: the classifier decides, as today', res.method === 'model' && res.agent === 'asistan' && classifier.calls === 1);
    ok('dispatch shadow: Kapici asked beside it with today\'s pick', k.calls.length === 1 && k.calls[0].m === 'shadow' && k.calls[0].actual === 'asistan');
    k = kap('on');
    res = await D.dispatchText('.', '', 'x', rules, [], true, k);
    ok('dispatch: no candidates, no Kapici', k.calls.length === 0 && res.method === 'none');

    console.log(`test_kapici_shadow: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
