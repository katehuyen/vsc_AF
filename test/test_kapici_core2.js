// X-411 — Kapici core 2: what leaves the machine is masked then trimmed to a
// budget; answers become a decision against a threshold with a named
// low-confidence path; every decision leaves an audit line with no key and no
// raw input; the same question is not asked twice within the cache window.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const I = require(path.join(ROOT, 'out/core/kapici/input.js'));
const A = require(path.join(ROOT, 'out/core/kapici/arbiter.js'));
const D = require(path.join(ROOT, 'out/core/kapici/audit.js'));
const C = require(path.join(ROOT, 'out/core/kapici/cache.js'));
const B = require(path.join(ROOT, 'out/core/kapici/builtinRules.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const clone = o => JSON.parse(JSON.stringify(o));
const masks = (s, known) => I.maskSecrets(s, known).text;
const hidden = (n, raw, known) => ok(n, !masks('value ' + raw + ' end', known).includes(raw));

// --- masking: every pattern, known values, and no false positives
const R = 'Ab3dEf5hIj7lMn9pQr1tUv3xYz5bCd7fGh9jKl1n';
hidden('private key block', '-----BEGIN CANARY PRIVATE KEY-----\nMIIEow' + R + '\n-----END CANARY PRIVATE KEY-----');
hidden('anthropic key', 'sk-ant-api03-' + R);
hidden('openai project key', 'sk-proj-' + R);
hidden('github token', 'ghp_' + R.slice(0, 36));
hidden('github fine-grained pat', 'github_pat_' + R + '_' + R);
hidden('slack token', 'xoxb-1234567890-' + R.slice(0, 20));
hidden('aws access key', 'AKIA' + 'ABCDEFGHIJ234567');
hidden('google api key', 'AIza' + R.slice(0, 35));
hidden('jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + R.slice(0, 20));
hidden('telegram bot token', '123456789:' + R.slice(0, 35));
ok('bearer keeps its word', masks('Authorization: Bearer ' + R) === 'Authorization: Bearer ***');
ok('basic keeps its word', masks('Basic ' + R.slice(0, 20)) === 'Basic ***');
ok('key=value keeps the key', masks('api_key=' + R.slice(0, 16)) === 'api_key=***');
ok('token: value in JSON keeps the key', masks('"access_token": "' + R.slice(0, 16) + '"') === '"access_token": "***"');
ok('secret= value masked', !masks('client_secret=' + R.slice(0, 14)).includes(R.slice(0, 14)));
ok('known value masked even without a pattern', masks('pw is hunter2hunter', ['hunter2hunter']) === 'pw is ***');
ok('known values: longest first', masks('abcdef123456 abcdef', ['abcdef', 'abcdef123456']) === '*** ***');
ok('known values shorter than 6 ignored', masks('a b abc', ['abc']) === 'a b abc');
ok('masked counts every hit', I.maskSecrets('x ' + 'sk-ant-' + R + ' y ' + 'ghp_' + R.slice(0, 36), []).masked === 2);
for (const clean of [
    'author: Murat Vural', '"input_tokens": 123456789012', '"output_tokens": 98765432101234',
    'tokenizer: cl100k_base', 'password: hunter', 'The token was rejected by the server.',
    'commit 0969fafb v11.761 - 3.743.0', 'skeleton-key-maker', 'Key points: summary'
]) { ok('no false positive: ' + clean, masks(clean) === clean); }

// --- trimming: under the budget, marked, head and tail kept by lines
const lines = Array.from({ length: 400 }, (_, i) => `line ${String(i).padStart(3, '0')} ` + 'x'.repeat(40));
const long = lines.join('\n');
const t = I.trimToBudget(long, 2000);
ok('trim: result within budget', t.text.length <= 2000 && t.trimmed);
ok('trim: head line kept', t.text.startsWith('line 000 '));
ok('trim: tail line kept', t.text.endsWith(lines[399]));
ok('trim: marker names the cut', new RegExp(`\\[\\.\\.\\. ${t.cutChars} characters cut from the middle \\.\\.\\.\\]`).test(t.text));
ok('trim: cut + kept = original', t.cutChars + t.text.split(/\n\[\.\.\. \d+ characters cut from the middle \.\.\.\]\n/).join('').length === long.length);
ok('trim: whole lines only', t.text.split('\n').every(l => /^line \d{3} x{40}$/.test(l) || /^\[\.\.\. /.test(l)));
ok('trim: short text untouched', I.trimToBudget('short', 2000).text === 'short' && !I.trimToBudget('short', 2000).trimmed);
const huge = 'A'.repeat(1000) + 'M'.repeat(8000) + 'Z'.repeat(1000);
const h = I.trimToBudget(huge, 1500);
ok('trim: single huge line cut by characters', h.trimmed && h.text.length <= 1500 && h.text.startsWith('AAAA') && h.text.endsWith('ZZZZ'));
ok('trim: budget floor 200', I.trimToBudget('y'.repeat(5000), 10).text.length <= 200);
for (const b of [200, 333, 1000, 4097]) { ok('trim: <= budget at ' + b, I.trimToBudget(long, b).text.length <= b); }

// --- prepareInput: mask first, then trim; the hash is of what is sent
const secret = 'sk-ant-api03-' + R;
const mid = 'a'.repeat(3000) + '\n' + secret + '\n' + 'b'.repeat(3000);
const p = I.prepareInput({ log: mid }, { budget: 1000, known: [] });
ok('prepare: no fragment of a secret straddling the cut', !p.text.includes('sk-ant') && !p.text.includes(R.slice(0, 10)));
ok('prepare: figures', p.chars === p.text.length && p.hash === I.hashText(p.text) && p.trimmed && p.masked === 1 && /^[0-9a-f]{16}$/.test(p.hash));
const nested = I.prepareInput({ steps: [{ out: 'done\n' + secret }], at: new Date(Date.UTC(2026, 0, 2)), n: 7 });
ok('prepare: a key after a newline inside a nested value is masked', !nested.text.includes('sk-ant') && nested.masked === 1);
ok('prepare: dates and numbers survive the walk', /"at": "2026-01-02T00:00:00.000Z"/.test(nested.text) && /"n": 7/.test(nested.text));
ok('prepare: key=value across JSON fields', !I.prepareInput({ api_key: R.slice(0, 16) }).text.includes(R.slice(0, 16)));
ok('prepare: default budget', I.DEFAULT_INPUT_BUDGET === 40000 && I.prepareInput('x'.repeat(50000)).chars <= 40000);
ok('serialize: string as is, object as JSON', I.serializeState('s') === 's' && JSON.parse(I.serializeState({ a: 1 })).a === 1);

// --- arbiter
const rule = (o = {}) => Object.assign({
    id: 'test.gate', version: 3, description: 'd', questions: {
        ok: { type: 'noul', instructions: 'Is it fine?' }, risk: { type: 'noul', instructions: 'Is it risky?' },
        grade: { type: 'score', instructions: 'How good?', criteria: { 1: 'bad', 2: 'ok', 3: 'good' } }
    }, decide: {}, minConfidence: 0.75, onLowConfidence: 'mechanical', onFailure: 'fallback', golden: []
}, o);
const noul = (pv, c = 0.9) => ({ type: 'noul', p: pv, confidence: c });
const meta = (o = {}) => Object.assign({ provider: 'jev', model: 'jev-1.13.0', latencyMs: 142, layer: 'builtin' }, o);
const retry = clone(B.RETRY_NEXT_ACTION);
const wait = (c) => ({ action: { type: 'choice', choice: 'wait', probs: { wait: 0.81, resume: 0.19 }, confidence: c } });

ok('deciding questions: named only', A.decidingQuestions(rule({ decide: { passIf: { q: 'ok', noulGt: 0.5 } } })).join() === 'ok');
ok('deciding questions: all when none named', A.decidingQuestions(rule()).join() === 'ok,risk,grade');
ok('threshold: jev as written', A.threshold(rule(), 'jev') === 0.75 && A.threshold(rule(), 'heuristic') === 0.75);
ok('threshold: llm +0.1', Math.abs(A.threshold(rule(), 'llm') - 0.85) < 1e-9 && A.LLM_MARGIN === 0.1);
ok('threshold: capped at 1', A.threshold(rule({ minConfidence: 0.95 }), 'llm') === 1);
const gate = rule({ decide: { passIf: { q: 'ok', noulGt: 0.5 }, rejectIf: { q: 'risk', noulGt: 0.7 }, scoreMin: { q: 'grade', min: 2 } } });
const all = (o = {}) => Object.assign({ ok: noul(0.9, 0.9), risk: noul(0.1, 0.8), grade: { type: 'score', score: 2.4, confidence: 0.95 } }, o);
let d = A.decide(gate, all());
ok('decide: pass, confidence = weakest', d.decision === 'pass' && d.passed && d.confidence === 0.8);
ok('decide: passIf fails', A.decide(gate, all({ ok: noul(0.3) })).decision === 'reject');
ok('decide: rejectIf holds', A.decide(gate, all({ risk: noul(0.9) })).passed === false);
ok('decide: scoreMin fails', A.decide(gate, all({ grade: { type: 'score', score: 1.5, confidence: 0.9 } })).passed === false);
ok('decide: choiceIs', A.decide(rule({ decide: { passIf: { q: 'ok', choiceIs: 'yes' } } }), { ok: { type: 'choice', choice: 'yes', confidence: 1 } }).passed);
ok('decide: noulLt', A.decide(rule({ decide: { passIf: { q: 'risk', noulLt: 0.2 } } }), { risk: noul(0.1) }).passed);
ok('decide: missing answer named', A.decide(gate, { ok: noul(0.9) }).missing === 'risk');
ok('decide: NaN confidence counts as missing', A.decide(gate, all({ grade: { type: 'score', score: 3, confidence: NaN } })).missing === 'grade');
ok('decide: actionFrom without a pick is missing', A.decide(retry, { action: { type: 'choice', confidence: 0.9 } }).missing === 'action');
ok('decide: actionFrom picks', A.decide(retry, wait(0.9)).decision === 'wait');

ok('reason text', A.synthesizeReason(retry, wait(0.77), 0.77, meta()) === 'action=wait (p=0.81) · confidence 0.77 · jev-1.13.0 · 142 ms');
ok('reason: cost and note', A.synthesizeReason(retry, wait(0.77), 0.77, meta({ costUsd: 0.0001 }), 'n') .endsWith('$0.000100 · n'));
ok('reason: noul and score', A.synthesizeReason(gate, all(), 0.8, meta({ model: undefined })) === 'ok p=0.9 · risk p=0.1 · grade=2.4 · confidence 0.8 · jev · 142 ms');

let r = A.arbitrate(retry, wait(0.9), meta(), 1);
ok('arbitrate: confident acts', r.confident && !r.next && r.verdict.decision === 'wait' && r.verdict.fallback === undefined && r.verdict.ruleVersion === 1 && r.verdict.layer === 'builtin');
r = A.arbitrate(retry, wait(0.6), meta(), 1);
ok('low confidence: mechanical', !r.confident && !r.next && r.verdict.fallback === 'mechanical' && r.verdict.decision === 'wait' && /below 0\.75 → mechanical/.test(r.verdict.reason));
r = A.arbitrate(Object.assign(clone(retry), { onLowConfidence: 'ask' }), wait(0.6), meta(), 1);
ok('low confidence: ask', !r.confident && !r.next && r.verdict.fallback === 'ask');
r = A.arbitrate(Object.assign(clone(retry), { onLowConfidence: 'escalate' }), wait(0.6), meta(), 1);
ok('low confidence: escalate with a provider left', !r.confident && r.next && r.verdict.fallback === 'mechanical' && /→ escalate/.test(r.verdict.reason));
r = A.arbitrate(Object.assign(clone(retry), { onLowConfidence: 'escalate' }), wait(0.6), meta(), 0);
ok('low confidence: escalate exhausted -> mechanical', !r.confident && !r.next && r.verdict.fallback === 'mechanical' && /→ mechanical/.test(r.verdict.reason));
ok('low confidence path helper', A.lowConfidencePath(Object.assign(clone(retry), { onLowConfidence: 'escalate' }), 2) === 'escalate');
ok('llm margin: 0.8 clears jev', A.arbitrate(retry, wait(0.8), meta(), 0).confident);
ok('llm margin: 0.8 does not clear llm', !A.arbitrate(retry, wait(0.8), meta({ provider: 'llm' }), 0).confident);
r = A.arbitrate(retry, {}, meta({ costUsd: 0.002 }), 1);
ok('missing answer -> onFailure, next when a provider is left', !r.confident && r.next && r.verdict.decision === 'fallback' && r.verdict.fallback === 'fallback' && r.verdict.costUsd === 0.002 && /bad-reply/.test(r.verdict.reason));
ok('missing answer, none left: no next', !A.arbitrate(retry, {}, meta(), 0).next);

for (const [f, passed] of [['open', true], ['closed', false], ['fallback', false]]) {
    const v = A.failureVerdict(Object.assign(clone(retry), { onFailure: f }), 'project', 'timeout', 'no answer in 3000 ms', 3001, 'jev');
    ok('onFailure ' + f, v.passed === passed && v.decision === f && v.fallback === f && v.confidence === 0 && v.layer === 'project' && /jev failed \(timeout\).*onFailure=/.test(v.reason));
}
ok('failure with no provider', /^no provider failed \(no-key\)/.test(A.failureVerdict(retry, 'builtin', 'no-key', 'no key', 0).reason));

// --- audit: no key and no raw input ever reach the file
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-kapici-audit-'));
const SENT_KEY = 'SENTINEL-KEY-' + R;
const SENT_RAW = 'The sentinel raw sentence must never be written.';
const input = I.prepareInput({ note: SENT_RAW, key: SENT_KEY }, { known: [SENT_KEY] });
const v1 = A.arbitrate(retry, wait(0.9), meta(), 0).verdict;
v1.answers.action.raw = SENT_RAW;
v1.answers.action.apiKey = SENT_KEY;
const T0 = Date.UTC(2026, 8, 28, 12);
const e1 = D.auditEntry(v1, input, { consumer: 'retry', mode: 'shadow', model: 'jev-1.13.0', actual: 'resume', known: [SENT_KEY] }, T0);
ok('audit: shadow fields', e1.actual === 'resume' && e1.agreed === false && e1.mode === 'shadow');
ok('audit: hash and length, not the input', e1.inputHash === input.hash && e1.inputChars === input.chars && !('input' in e1));
const vf = A.failureVerdict(retry, 'builtin', 'auth', 'rejected key ' + SENT_KEY, 20, 'jev');
const e2 = D.auditEntry(vf, input, { consumer: 'dispatch', known: [SENT_KEY] }, T0 + 1000);
ok('audit: failure error kept, key masked', /rejected key \*\*\*/.test(e2.error) && e2.fallback === 'fallback');
ok('audit: append returns no error', D.appendAudit(dir, e1, T0) === '' && D.appendAudit(dir, e2, T0 + 1000) === '');
const written = fs.readFileSync(D.auditFile(dir, T0), 'utf8');
ok('audit file named by month', /audit-2026-09\.jsonl$/.test(D.auditFile(dir, T0)));
ok('audit line has NO key', !written.includes(SENT_KEY) && !written.includes(R));
ok('audit line has NO raw input', !written.includes('sentinel raw sentence'));
ok('audit answers reduced to figures', JSON.parse(written.split('\n')[0]).answers.action.probs.wait === 0.81);
const blocker = path.join(dir, 'not-a-dir');
fs.writeFileSync(blocker, 'x');
ok('audit: unwritable dir never throws', D.appendAudit(path.join(blocker, 'sub'), e1, T0) !== '');
const T1 = Date.UTC(2026, 9, 3, 12);
D.appendAudit(dir, D.auditEntry(vf, input, { consumer: 'retry' }, T1), T1);
ok('readAudit: newest first across months', D.readAudit(dir).map(e => e.consumer).join() === 'retry,dispatch,retry');
ok('readAudit: consumer filter', D.readAudit(dir, { consumer: 'dispatch' }).length === 1);
ok('readAudit: ruleId filter', D.readAudit(dir, { ruleId: 'dispatch.route' }).length === 0 && D.readAudit(dir, { ruleId: 'retry.next-action' }).length === 3);
ok('readAudit: since', D.readAudit(dir, { since: T0 + 500 }).length === 2);
ok('readAudit: limit', D.readAudit(dir, { limit: 1 }).length === 1);
ok('readAudit: missing dir is empty', D.readAudit(path.join(dir, 'nope')).length === 0);
fs.rmSync(dir, { recursive: true, force: true });

// --- cache
const qs = retry.questions;
const k = C.cacheKey(retry, 'h1', qs);
ok('cache key: id@version|hash|criteria', k.startsWith('retry.next-action@1|h1|'));
ok('cache key: version changes it', C.cacheKey(Object.assign(clone(retry), { version: 2 }), 'h1', qs) !== k);
ok('cache key: input changes it', C.cacheKey(retry, 'h2', qs) !== k);
ok('cache key: narrowed options change it', C.cacheKey(retry, 'h1', { action: Object.assign({}, qs.action, { criteria: { wait: 'w' } }) }) !== k);
const good = A.arbitrate(retry, wait(0.9), meta(), 0).verdict;
ok('cacheable: own confident verdict', C.cacheable(retry, good));
ok('not cacheable: sensitive rule', !C.cacheable(Object.assign(clone(retry), { sensitive: true }), good));
ok('not cacheable: fallback', !C.cacheable(retry, A.arbitrate(retry, wait(0.5), meta(), 0).verdict) && !C.cacheable(retry, vf));
const cache = new C.VerdictCache(1000, 2);
cache.set('a', good, 0);
ok('cache: hit inside ttl', cache.get('a', 999) === good);
ok('cache: expired at ttl', cache.get('a', 1000) === undefined && cache.size === 0);
ok('cache: default ttl 10 min', C.DEFAULT_CACHE_TTL_MS === 600000);
cache.set('a', good, 0); cache.set('b', good, 0); cache.set('a', good, 1); cache.set('c', good, 2);
ok('cache: max evicts the oldest set', cache.size === 2 && cache.get('b', 3) === undefined && cache.get('a', 3) === good);

// --- every file of the folder stays under 300 lines
const kdir = path.join(ROOT, 'src/core/kapici');
for (const f of ['input.ts', 'arbiter.ts', 'audit.ts', 'cache.ts']) {
    ok(f + ' < 300 lines', fs.readFileSync(path.join(kdir, f), 'utf8').split('\n').length < 300);
}

console.log(`test_kapici_core2: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
