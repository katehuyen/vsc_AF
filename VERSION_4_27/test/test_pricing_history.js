// Dated pricing history: costFor(model, u, atTs) prices each message at the
// rate in effect at its time, so editing rates only re-prices new usage and
// past costs stay frozen. Covers the PricingEngine unit + the parseSessionFile
// wiring that feeds it message timestamps.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = require('path').resolve(__dirname, '..');

// sessions.js imports 'vscode'; stub the parts it touches at load time.
const fakeVscode = {
    EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } dispose() { } },
    Disposable: { from: () => ({ dispose() { } }) },
    window: {},
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};

const { PricingEngine, DEFAULT_PRICING } = require(path.join(ROOT, 'out/core/pricing.js'));
const { parseSessionFile } = require(path.join(ROOT, 'out/core/sessions.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// 1M tokens on one dimension makes cost === that dimension's per-1M rate.
const M = 1_000_000;
const usage = (o) => ({ input: 0, output: o, cacheWrite: 0, cacheRead: 0 });
const opusOnly = (out) => [{ match: 'opus', input: 0, output: out, cacheWrite: 0, cacheRead: 0 }];

// ---------- backward compatibility ----------
const legacy = new PricingEngine(opusOnly(75));
ok('legacy ctor: costFor(model, u) unchanged', near(legacy.costFor('claude-opus-4-8', usage(M)), 75));
ok('legacy ctor: atTs ignored with a single version',
    near(legacy.costFor('claude-opus-4-8', usage(M), 1_000), 75));
ok('legacy ctor: currentRules returns the rules', legacy.currentRules()[0].output === 75);
ok('unknown model → 0 and tracked', legacy.costFor('gpt-5', usage(M)) === 0 && legacy.unknownModels.has('gpt-5'));
ok('synthetic model → 0, not tracked', legacy.costFor('<synthetic>', usage(M)) === 0 && !legacy.unknownModels.has('<synthetic>'));

// ---------- dated history / freeze ----------
const T = 1_800_000_000_000; // some fixed "change" moment
const eng = PricingEngine.fromHistory([
    { effectiveFrom: 0, rules: opusOnly(75) },   // original rate
    { effectiveFrom: T, rules: opusOnly(30) }    // dropped later
]);
ok('before change → old rate', near(eng.costFor('claude-opus-4-8', usage(M), T - 1), 75));
ok('exactly at change → new rate', near(eng.costFor('claude-opus-4-8', usage(M), T), 30));
ok('after change → new rate', near(eng.costFor('claude-opus-4-8', usage(M), T + 999), 30));
ok('no ts → current (latest) rate', near(eng.costFor('claude-opus-4-8', usage(M)), 30));
ok('ts 0 → current (latest) rate', near(eng.costFor('claude-opus-4-8', usage(M), 0), 30));
ok('currentRules = most recent version', eng.currentRules()[0].output === 30);

// unsorted history is normalised
const unsorted = PricingEngine.fromHistory([
    { effectiveFrom: T, rules: opusOnly(30) },
    { effectiveFrom: 0, rules: opusOnly(75) }
]);
ok('history sorted regardless of input order', near(unsorted.costFor('claude-opus-4-8', usage(M), T - 1), 75));

// empty / malformed history falls back to defaults
const seeded = PricingEngine.fromHistory([]);
ok('empty history seeds DEFAULT_PRICING', near(seeded.costFor('claude-opus-4-8', usage(M)),
    DEFAULT_PRICING.find(r => r.match === 'opus').output));
const dirty = PricingEngine.fromHistory([{ effectiveFrom: 0, rules: null }, { effectiveFrom: 5, rules: opusOnly(9) }]);
ok('malformed entries skipped', near(dirty.costFor('claude-opus-4-8', usage(M), 10), 9));

// invalid regex in a version is skipped, not fatal
const bad = PricingEngine.fromHistory([{ effectiveFrom: 0, rules: [
    { match: '(', input: 0, output: 99, cacheWrite: 0, cacheRead: 0 },
    { match: 'opus', input: 0, output: 75, cacheWrite: 0, cacheRead: 0 }
] }]);
ok('invalid regex rule skipped, next rule wins', near(bad.costFor('claude-opus-4-8', usage(M)), 75));

// ---------- end-to-end: parseSessionFile prices per message timestamp ----------
const tChange = Date.parse('2026-06-01T00:00:00.000Z');
const before = '2026-01-01T00:00:00.000Z';
const after = '2026-07-01T00:00:00.000Z';
const line = (ts, id) => JSON.stringify({
    type: 'assistant', timestamp: ts, requestId: id,
    message: { id, model: 'claude-opus-4-8', usage: { output_tokens: M } }
});
const tmp = path.join(os.tmpdir(), `af-pricing-${Date.now()}.jsonl`);
fs.writeFileSync(tmp, line(before, 'm1') + '\n' + line(after, 'm2') + '\n');

const histEngine = PricingEngine.fromHistory([
    { effectiveFrom: 0, rules: opusOnly(75) },
    { effectiveFrom: tChange, rules: opusOnly(30) }
]);
const info = parseSessionFile(tmp, histEngine, 0);
ok('parseSessionFile: two messages counted', info.assistantMsgs === 2);
ok('parseSessionFile: pre-change message frozen at old rate, post-change at new (75 + 30)',
    near(info.cost, 105));
// day buckets keep their own frozen cost
const dayCosts = Object.values(info.daily).map(d => d.cost).sort((a, b) => a - b);
ok('parseSessionFile: daily buckets reflect per-day frozen rates', near(dayCosts[0], 30) && near(dayCosts[1], 75));

// same transcript re-priced with a single flat rate → both at that rate
const flat = parseSessionFile(tmp, new PricingEngine(opusOnly(10)), 0);
ok('flat engine prices every message the same (freeze off) → 20', near(flat.cost, 20));
fs.unlinkSync(tmp);

Module._load = origLoad;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
