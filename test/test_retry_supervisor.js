// M-13 — THE SUPERVISOR'S CONTRACT, pure half: the policy, the decision and the
// TaskManager's check of it, when it may be asked (the quota truth), the
// incident it is shown, and how `behavior: supervisor` reads through retry.ts.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const S = require(path.join(OUT, 'retrySupervisor.js'));
const I = require(path.join(OUT, 'retryIncident.js'));
const R = require(path.join(OUT, 'retry.js'));

const NOW = 1790000000000;
const H = 3600e3;

console.log('\n== the policy ==');
ok('no engine → no supervisor', S.normalizeSupervisor({ model: 'haiku' }) === undefined && S.normalizeSupervisor(null) === undefined);
const P = S.normalizeSupervisor({ engine: ' Claude ', model: 'haiku' });
ok('defaults: 2 calls, 0.6, falls back to smart', P.engine === 'claude' && P.maxCalls === 2 && P.minConfidence === 0.6 && P.lowConfidence === 'smart' && !('budgetUsd' in P));
const Q = S.normalizeSupervisor({ engine: 'codex', maxCalls: 99, minConfidence: 7, budgetUsd: 0.5, lowConfidence: 'park' });
ok('clamped: calls ≤ 5, confidence ≤ 1; budget and fallback kept', Q.maxCalls === 5 && Q.minConfidence === 1 && Q.budgetUsd === 0.5 && Q.lowConfidence === 'park');
ok('an unknown fallback is smart', S.normalizeSupervisor({ engine: 'codex', lowConfidence: 'yolo' }).lowConfidence === 'smart');

console.log('\n== reading the answer ==');
ok('a fenced block with prose around it', S.parseDecision('Here:\n```json\n{"action":"stop","reason":"x","confidence":1}\n```\nbye').ok);
ok('bare JSON', S.parseDecision('{"action":"wait"}').raw.action === 'wait');
ok('no object → refused', !S.parseDecision('I think you should resume').ok);
ok('broken JSON → refused, saying so', /could not be read/.test(S.parseDecision('{"action": resume}').error));
ok('an array → refused', !S.parseDecision('[{"action":"stop"}]').ok);

console.log('\n== the TaskManager\'s check ==');
const ctx = { now: NOW, resetAt: NOW + H, resumable: true };
const v = (raw, c) => S.validateDecision(raw, Object.assign({}, ctx, c));
ok('an unknown action is refused', /unsupported action/.test(v({ action: 'deploy', reason: 'r', confidence: 1 }).error));
ok('no reason → refused', /no reason/.test(v({ action: 'stop', confidence: 1 }).error));
ok('confidence outside 0..1 → refused', !v({ action: 'stop', reason: 'r', confidence: 2 }).ok && !v({ action: 'stop', reason: 'r' }).ok);
ok('resume on an unknown session → refused', /not known/.test(v({ action: 'resume', prompt: 'go', reason: 'r', confidence: 1 }, { resumable: false }).error));
ok('resume with an empty prompt → refused', /needs the prompt/.test(v({ action: 'resume', prompt: '  ', reason: 'r', confidence: 1 }).error));
ok('wait without notBefore → refused', /needs notBefore/.test(v({ action: 'wait', reason: 'r', confidence: 1 }).error));
ok('‼️ notBefore before the reset → refused', /before the limit resets/.test(v({ action: 'wait', notBefore: NOW + H - 1, reason: 'r', confidence: 1 }).error));
ok('‼️ an unbounded wait → refused', /ceiling/.test(v({ action: 'wait', notBefore: NOW + 13 * H, reason: 'r', confidence: 1 }).error));
ok('a prompt past the cap → refused', /longer than/.test(v({ action: 'resume', prompt: 'x'.repeat(2001), reason: 'r', confidence: 1 }).error));
const good = v({ action: 'resume', prompt: ' Finish the failing test, then stop. ', reason: 'drifted', confidence: 0.8, notBefore: new Date(NOW + 2 * H).toISOString() });
ok('a good resume: trimmed, ISO time read', good.ok && good.decision.prompt === 'Finish the failing test, then stop.' && good.decision.notBefore === NOW + 2 * H);
ok('retryOriginal / stop / needsUser need no prompt', ['retryOriginal', 'stop', 'needsUser'].every(a => v({ action: a, reason: 'r', confidence: 0.9 }).ok));
ok('below the threshold is not confident', !S.confident({ confidence: 0.5 }, P) && S.confident({ confidence: 0.6 }, P));

console.log('\n== when it may be asked — the quota truth ==');
const when = (sup, o) => S.supervisorWhen(Object.assign({ now: NOW, plannedAt: NOW + 30 * 60e3, resetAt: NOW + H, taskEngine: 'claude', taskAccount: 'claude-kate', supervisor: sup, room: 'free' }, o));
ok('‼️ Claude on the SAME slot waits for the reset, even with "room"', when(P, { supervisorAccount: 'claude-kate' }).at === NOW + H);
ok('same slot and no reset known → the planned retry', when(P, { supervisorAccount: 'claude-kate', resetAt: undefined }).at === NOW + 30 * 60e3);
ok('another Claude slot with room → now', when(P, { supervisorAccount: 'claude-other' }).at === NOW);
ok('Codex with room → now', when(Q, {}).at === NOW);
ok('‼️ unknown usage is not room → the planned retry', when(Q, { room: 'unknown' }).at === NOW + 30 * 60e3 && /not known/.test(when(Q, { room: 'unknown' }).why));
ok('a full supervisor → the planned retry', when(Q, { room: 'full' }).at === NOW + 30 * 60e3);
ok('limit domains: a Claude slot each, other engines one each', S.limitDomain('claude', 'a') !== S.limitDomain('claude', 'b') && S.limitDomain('codex', 'a') === S.limitDomain('codex', 'b'));

console.log('\n== once per incident, within the caps ==');
ok('the incident key is stable', S.incidentKey('tsk_1', 1, NOW) === S.incidentKey('tsk_1', 1.0, NOW) && S.incidentKey('tsk_1', 1, NOW) !== S.incidentKey('tsk_1', 2, NOW));
ok('the call cap refuses', /already asked 2/.test(S.supervisorRefusal(P, { calls: 2, spentUsd: 0 })));
ok('the budget refuses', /budget/.test(S.supervisorRefusal(Q, { calls: 0, spentUsd: 0.5 })) && S.supervisorRefusal(Q, { calls: 1, spentUsd: 0.1 }) === '');

console.log('\n== the incident it is shown ==');
const b = I.buildIncident({
    key: 'k', task: { id: 'tsk_1', title: 'T', prompt: 'p'.repeat(5000) },
    failure: { phase: 'interrupted', why: 'limit', engine: 'claude', sessionId: 's1', resetAt: NOW + H, resetSource: 'engine' },
    attempts: Array.from({ length: 9 }, (_, n) => ({ n, at: NOW - n, why: 'w' })),
    lastTurns: 'OLD'.repeat(2000) + 'THE END', changes: { status: ' M a.ts', stat: '1 file' },
    remaining: { retries: 3 }
});
ok('the prompt is capped from the end, the conversation from the front', b.task.prompt.length === 4000 && b.lastTurns.endsWith('THE END') && b.lastTurns.length === 3000);
ok('only the last six attempts', b.attempts.length === 6);
const text = I.supervisorPrompt(b, NOW);
ok('the prompt states the contract, the limits and the incident',
    /EXACTLY ONE JSON object/.test(text) && /must NOT edit files/.test(text) && text.includes(new Date(NOW + H).toISOString()) && /"sessionId": "s1"/.test(text));

console.log('\n== behavior: supervisor through retry.ts ==');
const pol = R.normalizeRetry({ max: 3, behavior: 'supervisor', supervisor: { engine: 'codex' } });
ok('stored with its supervisor', pol.behavior === 'supervisor' && pol.supervisor.engine === 'codex');
ok('no engine → it is the smart it falls back to', R.normalizeRetry({ behavior: 'supervisor' }).behavior === 'smart');
ok('the bridge/form refusal names the missing engine', /needs supervisor\.engine/.test(R.retryRefusal({ behavior: 'supervisor' })) && R.retryRefusal({ behavior: 'supervisor', supervisor: { engine: 'codex' } }) === '');
ok('it falls through from the default policy', R.resolveRetry({ max: 2 }, pol).behavior === 'supervisor' && R.resolveRetry({ max: 2 }, pol).supervisor.engine === 'codex');
const LIMIT = 'Claude usage limit reached — resets 7pm';
const d = R.retryDecision(pol, { attempt: 0, output: LIMIT, progress: { assistantSteps: 4, toolCalls: 9 }, now: NOW });
ok('‼️ a limit that cut off work → supervise, with smart\'s continuation as the fallback', d.retry && d.supervise === true && d.continueRun === true && /decides how it goes on/.test(d.why));
ok('a failure that was not a limit → no supervisor (first version: limits only)',
    !R.retryDecision(Object.assign({}, pol, { when: 'any' }), { attempt: 0, output: 'TypeError', progress: { assistantSteps: 4 }, now: NOW }).supervise);
ok('nothing had started → no supervisor', !R.retryDecision(pol, { attempt: 0, output: LIMIT, progress: { assistantSteps: 0, toolCalls: 0 }, now: NOW }).supervise);
ok('told to hand over → no resume, no supervisor', !R.retryDecision(pol, { attempt: 0, output: LIMIT, progress: { assistantSteps: 4 }, now: NOW, handover: { told: true } }).supervise);
ok('smart alone never supervises', !R.retryDecision(R.normalizeRetry({ behavior: 'smart' }), { attempt: 0, output: LIMIT, progress: { assistantSteps: 4 }, now: NOW }).supervise);
ok('the summary says who decides', /codex decides how it continues/.test(R.describeRetry(pol)));

console.log(`\ntest_retry_supervisor: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
