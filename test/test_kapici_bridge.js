// B-27 — Kapıcı on the bridge: the six ops are in farm.ops and each one
// answers; statePath carries big input; the key is only ever PRESENT/ABSENT;
// settings resolve the road and the key; the host rebuilds on a setting change.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
const KB = require(path.join(ROOT, 'out/core/kapiciBridge.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const KEY = 'vck_CANARY_gateway_key_0123456789';

(async () => {
    // --- settings and the key
    const get = over => (k, d) => (k in over ? over[k] : d);
    let s = KB.kapiciSettings(get({}));
    ok('settings: defaults', s.rulesDir === '' && s.timeoutMs === 3000 && s.providers.join() === 'heuristic,jev' && s.route === 'auto' && s.keyName === '');
    s = KB.kapiciSettings(get({ 'kapici.providers': ['gpt', 'llm'], 'kapici.timeoutMs': 5, 'kapici.route': 'nowhere' }));
    ok('settings: unknown providers dropped, floor on timeout, unknown route = auto', s.providers.join() === 'llm' && s.timeoutMs === 200 && s.route === 'auto');
    ok('settings: an all-unknown list falls back', KB.kapiciSettings(get({ 'kapici.providers': ['gpt'] })).providers.join() === 'heuristic,jev');
    const base = KB.kapiciSettings(get({}));
    ok('key: TYPESAFE_API_KEY first when both are there', KB.resolveKey(base, () => true).name === 'TYPESAFE_API_KEY');
    let k = KB.resolveKey(base, n => n === 'AI_GATEWAY_API_KEY');
    ok('key: the gateway key takes the vercel road', k.name === 'AI_GATEWAY_API_KEY' && k.route === 'vercel' && k.present);
    k = KB.resolveKey(base, () => false);
    ok('key: none present names the first candidate, absent', k.name === 'TYPESAFE_API_KEY' && !k.present);
    ok('key: a named vercel-looking key goes to vercel', KB.resolveKey(Object.assign({}, base, { keyName: 'MY_VERCEL_KEY' }), () => true).route === 'vercel');
    ok('key: a pinned route wins', KB.resolveKey(Object.assign({}, base, { keyName: 'MY_VERCEL_KEY', route: 'typesafe' }), () => true).route === 'typesafe');
    ok('key: route vercel picks the gateway candidate', KB.resolveKey(Object.assign({}, base, { route: 'vercel' }), () => true).name === 'AI_GATEWAY_API_KEY');

    // --- the host and the ops, with a fake fetch standing in for the classifier
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-kapici-bridge-'));
    const vault = { AI_GATEWAY_API_KEY: KEY, OTHER: 'other-vault-value-42' };
    let settings = { 'kapici.rulesDir': path.join(dir, 'rules') };
    const calls = [];
    const fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({ url, body, auth: init.headers.Authorization });
        const answers = {};
        for (const [id, q] of Object.entries(body.questions)) {
            answers[id] = q.type === 'choice' ? { type: 'choice', choice: Object.keys(q.criteria)[0], probabilities: {}, confidence: 0.95 }
                : q.type === 'score' ? { type: 'score', score: 3, confidence: 0.9 } : { type: 'noul', noul: 0.97 };
        }
        return { status: 200, json: async () => ({ model: body.model, answers, usage: { input_tokens: 500 } }) };
    };
    const host = new KB.KapiciHost({
        secret: n => vault[n], secretValues: () => Object.values(vault), settings: () => KB.kapiciSettings(get(settings)),
        agentRoots: () => [dir], auditDir: path.join(dir, 'audit'), log: () => { }, fetch
    });
    const reg = new BridgeRegistry();
    KB.registerKapiciOps(reg, host);
    const run = (op, args) => reg.dispatch(op, args || {});

    const cat = (await run('farm.ops')).result.map(c => c.op);
    for (const op of ['kapici.eval', 'kapici.ask', 'kapici.rules', 'kapici.rule.check', 'kapici.audit', 'kapici.status']) { ok(op + ' in farm.ops', cat.includes(op)); }

    let r = await run('kapici.status');
    ok('status: key PRESENT by name, never its value', r.ok && r.result.key.name === 'AI_GATEWAY_API_KEY' && r.result.key.present === true && !JSON.stringify(r.result).includes(KEY));
    ok('status: road, address, model', r.result.key.route === 'vercel' && /ai-gateway\.vercel\.sh/.test(r.result.key.url) && r.result.key.model === 'typesafe-ai/jev');
    ok('status: candidates and rule count', r.result.candidates.length === 2 && r.result.rules === 3 && r.result.providers.llm === false);

    r = await run('kapici.eval', { rule: 'retry.next-action', state: { failure: 'usage limit', note: 'token ' + KEY } });
    ok('eval: a verdict through the gateway', r.ok && r.result.decision === 'resume' && r.result.provider === 'jev' && calls[0].url.includes('vercel') && calls[0].auth === 'Bearer ' + KEY);
    ok('eval: the key never left inside the state', !calls[0].body.state.includes(KEY) && !JSON.stringify(r.result).includes(KEY));
    r = await run('kapici.eval', { rule: 'dispatch.route', state: 'fix the login page', criteria: { agent: ['developer', 'asistan'] } });
    ok('eval: criteria folds call-time options in', r.ok && r.result.decision === 'developer' && Object.keys(calls[1].body.questions.agent.criteria).join() === 'developer,asistan');
    const big = path.join(dir, 'state.txt');
    fs.writeFileSync(big, Array.from({ length: 5000 }, (_, i) => `line ${i} of a long incident log`).join('\n'));
    r = await run('kapici.eval', { rule: 'retry.next-action', statePath: big, noCache: true });
    ok('eval: statePath carries big input, trimmed to budget', r.ok && calls[2].body.state.length <= 40000 && /characters cut from the middle/.test(calls[2].body.state));
    const js = path.join(dir, 'state.json');
    fs.writeFileSync(js, JSON.stringify({ failure: 'max turns', resumable: true }));
    r = await run('kapici.eval', { rule: 'retry.next-action', statePath: js, noCache: true });
    ok('eval: a .json statePath is read as an object', r.ok && /"resumable": true/.test(calls[3].body.state));
    r = await run('kapici.eval', { rule: 'retry.next-action', statePath: 'relative.txt' });
    ok('eval: statePath must be absolute', !r.ok && /absolute/.test(r.error));
    r = await run('kapici.eval', { rule: 'retry.next-action', statePath: path.join(dir, 'missing.txt') });
    ok('eval: a missing statePath is named', !r.ok && /no file/.test(r.error));
    r = await run('kapici.eval', { rule: 'retry.next-action' });
    ok('eval: no state refused', !r.ok && /statePath is required/.test(r.error));
    r = await run('kapici.eval', { rule: 'no.such', state: 'x' });
    ok('eval: an unknown rule is a fallback verdict, not an error', r.ok && r.result.fallback === 'fallback');

    r = await run('kapici.ask', { state: 'deploy at 2026-10-01', questions: { risky: { type: 'noul', instructions: 'Is this risky?' }, soon: { type: 'noul', instructions: 'Before October?', check: { op: 'date', before: '2026-10-02' } } } });
    ok('ask: answers every question, the check locally', r.ok && r.result.answers.risky.p === 0.97 && r.result.answers.soon.confidence === 1 && !('soon' in calls[calls.length - 1].body.questions));
    r = await run('kapici.ask', { state: 'x', questions: { a: { type: 'noul', instructions: 'A?' } }, providers: 'heuristic' });
    ok('ask: providers narrows who is asked (heuristic cannot answer, fallback)', r.ok && r.result.fallback === 'fallback');
    r = await run('kapici.ask', { state: 'x', questions: { a: { type: 'noul', instructions: 'A?' } }, providers: ['gpt'] });
    ok('ask: an unknown provider refused', !r.ok && /providers is a list/.test(r.error));
    r = await run('kapici.ask', { state: 'x' });
    ok('ask: questions required', !r.ok && /questions is required/.test(r.error));

    fs.mkdirSync(path.join(dir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'rules', 'broken.json'), '{ not json');
    const mine = { id: 'my.gate', version: 1, description: 'mine', questions: { ok: { type: 'noul', instructions: 'Fine?' } }, decide: { passIf: { q: 'ok', noulGt: 0.5 } }, minConfidence: 0.5, onLowConfidence: 'mechanical', onFailure: 'open', golden: [{ state: 'all good', expect: { ok: true } }, { state: 'on fire', expect: { ok: false } }] };
    fs.writeFileSync(path.join(dir, 'rules', 'mine.json'), JSON.stringify(mine));
    r = await run('kapici.rules');
    const ids = r.result.rules.map(x => x.id + '@' + x.layer);
    ok('rules: builtin and system layers, with golden counts', ids.includes('dispatch.route@builtin') && ids.includes('my.gate@system') && r.result.rules.find(x => x.id === 'my.gate').golden === 2);
    ok('rules: a broken file named', r.result.problems.some(p => /broken\.json/.test(JSON.stringify(p))));
    r = await run('kapici.rule.check', { rule: 'my.gate' });
    ok('rule.check: every golden run, pass/fail per case', r.ok && r.result.total === 2 && r.result.passed === 1 && r.result.cases[1].ok === false && r.result.cases[0].got.ok.p === 0.97);
    r = await run('kapici.rule.check', { rule: 'nope.rule' });
    ok('rule.check: unknown rule refused', !r.ok);

    r = await run('kapici.audit', { limit: 3 });
    ok('audit: newest first, limited', r.ok && r.result.entries.length === 3 && r.result.entries[0].consumer === 'rule.check');
    const lines = fs.readdirSync(path.join(dir, 'audit')).map(f => fs.readFileSync(path.join(dir, 'audit', f), 'utf8')).join('');
    ok('audit: no key, no vault value in any line', !lines.includes(KEY) && !lines.includes('other-vault-value-42') && !lines.includes('incident log'));
    r = await run('kapici.audit', { consumer: 'bridge', since: '2000-01-01T00:00:00Z' });
    ok('audit: consumer and since filters', r.ok && r.result.entries.every(e => e.consumer === 'bridge') && r.result.entries.length >= 5);
    r = await run('kapici.audit', { since: 'yesterday' });
    ok('audit: a bad since refused', !r.ok);
    fs.appendFileSync(path.join(dir, 'audit', fs.readdirSync(path.join(dir, 'audit'))[0]), JSON.stringify({ at: new Date().toISOString(), consumer: 'retry', ruleId: 'retry.next-action', decision: 'wait', actual: 'wait', agreed: true, answers: {} }) + '\n' + JSON.stringify({ at: new Date().toISOString(), consumer: 'retry', ruleId: 'retry.next-action', decision: 'wait', actual: 'resume', agreed: false, answers: {} }) + '\n');
    r = await run('kapici.audit', { consumer: 'retry' });
    ok('audit: shadow agreement per consumer', r.result.agreement.retry.compared === 2 && r.result.agreement.retry.agreed === 1 && r.result.agreement.retry.rate === 0.5);

    const before = host.get();
    ok('host: the same Kapici while nothing changes', host.get() === before);
    settings = Object.assign({}, settings, { 'kapici.timeoutMs': 4000 });
    ok('host: rebuilt when a setting changes', host.get() !== before);
    delete vault.AI_GATEWAY_API_KEY;
    r = await run('kapici.status');
    ok('status: key ABSENT after it is removed', r.result.key.present === false);
    r = await run('kapici.eval', { rule: 'retry.next-action', state: 'x', noCache: true });
    ok('eval without a key: fallback, says no-key', r.ok && r.result.fallback === 'fallback' && /no-key/.test(r.result.reason));

    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    ok('extension.ts wires it in a few lines', /const kapiciHost = new KapiciHost\(\{/.test(ext) && /registerKapiciOps\(bridge, kapiciHost\)/.test(ext));
    ok('dispatch reads its own setting, off by default', /kapiciHost\.dispatch\(consumerMode\(cfg\(\)\.get\('kapici\.dispatch'\)\)\)/.test(ext) && host.dispatch('off') === undefined);
    ok('kapiciBridge.ts under 300 lines', fs.readFileSync(path.join(ROOT, 'src/core/kapiciBridge.ts'), 'utf8').split('\n').length < 300);
    fs.rmSync(dir, { recursive: true, force: true });

    console.log(`test_kapici_bridge: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
