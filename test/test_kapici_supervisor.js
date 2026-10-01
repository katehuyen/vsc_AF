// M-58 — Kapıcı as the retry supervisor: an action the incident cannot take
// is never offered, the fields Jev cannot write are filled mechanically and
// pass the same validateDecision an LLM's answer does, low confidence falls
// back, and off / shadow / on each keep today's supervisor where they should.
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const KS = require(path.join(ROOT, 'out/core/kapiciSupervisor.js'));
const S = require(path.join(ROOT, 'out/core/retrySupervisor.js'));
const { SupervisorRunner, KAPICI_ENGINE } = require(path.join(ROOT, 'out/core/supervisorRunner.js'));
const { DEFAULT_CONTINUATION_PROMPT } = require(path.join(ROOT, 'out/core/retry.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const verdict = (o = {}) => Object.assign({ passed: true, decision: 'wait', confidence: 0.86, answers: {}, reason: 'action=wait (p=0.9) · confidence 0.86 · jev-1.13.0 · 90 ms', provider: 'jev', latencyMs: 90, ruleId: 'retry.next-action', ruleVersion: 1, layer: 'builtin', costUsd: 0.00002 }, o);

(async () => {
    // --- options and the mechanical fields
    ok('all five when resumable and the reset is known', KS.supervisorOptions({ resumable: true, resetAt: 5 }).join() === 'resume,retryOriginal,wait,stop,needsUser');
    ok('no resume without a session', !KS.supervisorOptions({ resumable: false, resetAt: 5 }).includes('resume'));
    ok('no wait without a reset', !KS.supervisorOptions({ resumable: true }).includes('wait'));
    ok('never fewer than the three always possible', KS.supervisorOptions({ resumable: false }).join() === 'retryOriginal,stop,needsUser');
    const now = 1_000_000, resetAt = now + 30 * 60_000;
    const ctx = { resumable: true, resetAt, continuation: 'Carry on, read first.' };
    const check = (text) => S.validateDecision(JSON.parse(text), { now, resetAt, resumable: true });
    let t = KS.kapiciAnswerText(verdict({ decision: 'resume' }), ctx);
    let c = check(t);
    ok('resume: the policy\'s continuation as its prompt, and it validates', c.ok && c.decision.prompt === 'Carry on, read first.' && c.decision.action === 'resume');
    t = KS.kapiciAnswerText(verdict({ decision: 'wait' }), ctx);
    c = check(t);
    ok('wait: notBefore is the reset, and it validates', c.ok && c.decision.notBefore === resetAt);
    for (const a of ['retryOriginal', 'stop', 'needsUser']) {
        c = check(KS.kapiciAnswerText(verdict({ decision: a }), ctx));
        ok(a + ': validates with the synthesized reason and Jev\'s confidence', c.ok && /^Gatekeeper: action=/.test(c.decision.reason) && c.decision.confidence === 0.86);
    }
    ok('an action the incident cannot take gives no answer', KS.kapiciAnswerText(verdict({ decision: 'resume' }), { resumable: false, continuation: 'x' }) === undefined && KS.kapiciAnswerText(verdict({ decision: 'wait' }), { resumable: true, continuation: 'x' }) === undefined);
    ok('a fallback decision name gives no answer', KS.kapiciAnswerText(verdict({ decision: 'fallback' }), ctx) === undefined);
    ok('the action read back out of an LLM answer', KS.answeredAction('```json\n{"action":"stop","reason":"r"}\n```') === 'stop' && KS.answeredAction('no json') === undefined);

    // --- the runner, off / engine kapici / shadow / on
    const mkRow = (o) => Object.assign({
        id: 'r1', status: 'queued', prompt: 'devam et', retryOf: 't0', resumeSessionId: 's1', resetAt: now + 60_000,
        supervision: { key: 'k1', state: 'pending', at: 0, atWhy: '', failedTask: 't1', calls: 0 }
    }, o);
    const LLM = '{"action":"retryOriginal","reason":"it went the wrong way","confidence":0.8}';
    const harness = ({ engine = 'codex', kapici, llm = LLM, rowO } = {}) => {
        const h = { settled: [], llmCalls: 0, evals: [] };
        const pol = S.normalizeSupervisor({ engine, minConfidence: 0.6 });
        const r = mkRow(rowO);
        const k = kapici && Object.assign({ mode: kapici.mode, evaluate: async (bundle, options, m, actual) => { h.evals.push({ bundle, options, m, actual }); return kapici.v ? kapici.v() : verdict(); } });
        h.runner = new SupervisorRunner({
            due: () => (r.supervision.state === 'pending') ? [r] : [],
            begin: (x) => { x.supervision = Object.assign({}, x.supervision, { state: 'asking', calls: x.supervision.calls + 1 }); return true; },
            settle: (x, o, meta) => { h.settled.push({ o, meta }); x.supervision = Object.assign({}, x.supervision, { state: 'done' }); },
            find: (id) => ({ t0: { id: 't0', prompt: 'özgün iş' }, t1: { id: 't1', prompt: 'önceki' } })[id],
            policyOf: () => pol,
            incidentOf: async () => ({ key: 'k1', task: { id: 'r1', title: 'T', prompt: 'p' }, failure: { phase: 'limit', why: 'usage limit', engine: 'claude', resetAt: r.resetAt }, attempts: [], lastTurns: '', remaining: { retries: 2 } }),
            ask: async () => { h.llmCalls++; return { text: llm, costUsd: 0.01 }; },
            kapici: () => k,
            continuationOf: () => 'Carry on from the transcript.',
            now: () => now
        });
        h.run = async () => { await Promise.all(h.runner.sweep()); await new Promise(res => setTimeout(res, 10)); return h; };
        return h;
    };
    let h = await harness({}).run();
    ok('off: today\'s supervisor decides, Gatekeeper never asked', h.llmCalls === 1 && h.settled[0].o.decision.action === 'retryOriginal' && h.settled[0].meta.engine === 'codex');
    h = await harness({ engine: KAPICI_ENGINE }).run();
    ok('engine kapici with Gatekeeper off for retries: fallback, says why', h.settled[0].o.kind === 'fallback' && /agentFarm\.kapici\.retry/.test(h.settled[0].o.note) && h.llmCalls === 0);
    h = await harness({ engine: KAPICI_ENGINE, kapici: { mode: 'on' } }).run();
    ok('engine kapici: its decision, no model asked, engine recorded as kapici', h.llmCalls === 0 && h.settled[0].o.kind === 'decision' && h.settled[0].o.decision.action === 'wait' && h.settled[0].meta.engine === 'kapici');
    ok('engine kapici: the incident is the state, the doable actions the options', h.evals[0].bundle.failure.why === 'usage limit' && h.evals[0].options.join() === 'resume,retryOriginal,wait,stop,needsUser' && h.evals[0].m === 'on');
    h = await harness({ engine: KAPICI_ENGINE, kapici: { mode: 'on' }, rowO: { resumeSessionId: undefined, resetAt: undefined } }).run();
    ok('not resumable, no reset: neither offered', h.evals[0].options.join() === 'retryOriginal,stop,needsUser');
    h = await harness({ engine: KAPICI_ENGINE, kapici: { mode: 'on', v: () => verdict({ fallback: 'mechanical', confidence: 0.4 }) } }).run();
    ok('engine kapici, low confidence: the policy\'s fallback', h.settled[0].o.kind === 'fallback' && /Gatekeeper could not decide/.test(h.settled[0].o.note) && h.llmCalls === 0);
    h = await harness({ engine: KAPICI_ENGINE, kapici: { mode: 'on', v: () => verdict({ decision: 'resume' }) } }).run();
    ok('resume through the runner carries the continuation', h.settled[0].o.decision.prompt === 'Carry on from the transcript.');
    h = await harness({ kapici: { mode: 'shadow' } }).run();
    ok('shadow: the LLM supervisor decides as today', h.llmCalls === 1 && h.settled[0].o.decision.action === 'retryOriginal' && h.settled[0].meta.engine === 'codex');
    ok('shadow: Gatekeeper asked beside it with the LLM\'s action', h.evals.length === 1 && h.evals[0].m === 'shadow' && h.evals[0].actual === 'retryOriginal');
    h = await harness({ kapici: { mode: 'on' } }).run();
    ok('on: a confident Gatekeeper decides first, the model is not asked', h.llmCalls === 0 && h.settled[0].o.decision.action === 'wait' && h.settled[0].meta.engine === 'kapici');
    h = await harness({ kapici: { mode: 'on', v: () => verdict({ fallback: 'mechanical', confidence: 0.3 }) } }).run();
    ok('on, low confidence: escalates to the LLM supervisor', h.llmCalls === 1 && h.settled[0].o.decision.action === 'retryOriginal');
    h = await harness({ kapici: { mode: 'on', v: () => { throw new Error('jev down'); } } }).run();
    ok('on, Gatekeeper throws: the LLM supervisor decides', h.llmCalls === 1 && h.settled[0].o.kind === 'decision');
    ok('the default continuation exists for a row with no policy text', typeof DEFAULT_CONTINUATION_PROMPT === 'string' && DEFAULT_CONTINUATION_PROMPT.length > 20);

    console.log(`test_kapici_supervisor: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
