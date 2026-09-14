/**
 * X-252 (d) — A PRICE CHANGE INVALIDATES THE FIGURES IT INVALIDATES.
 *
 * ‼️ MEASURED BEFORE THIS EXISTED. The external scan remembered each parse
 * against `size:mtimeMs` — the transcript's own file and nothing else. Every
 * `cost` and every `wTokens` in that parse is derived from the price table and
 * the quota weights, and editing either rebuilds the engine and re-runs the
 * scan while every unchanged file answers straight out of the cache with the
 * arithmetic that was just replaced. A stale cost is not an old figure, it is a
 * false one, and nothing anywhere said so.
 *
 * The Claude index already held this rule (`SessionIndex`'s `indexSignature`);
 * this is the half that did not.
 *
 *   node test/test_costing_revision.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
            ViewColumn: {}, ConfigurationTarget: {}, env: {},
            EventEmitter: function () { this.event = () => { }; this.fire = () => { }; this.dispose = () => { }; }
        };
    }
    return origLoad.apply(this, arguments);
};

const P = require(path.join(__dirname, '..', 'out', 'core', 'pricing.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const rules = (out) => [{ match: 'sonnet', input: 3, output: out, cacheWrite: 3.75, cacheRead: 0.3 }];

// --------------------------------------------------------------- the price
{
    const a = new P.PricingEngine(rules(15));
    const same = new P.PricingEngine(rules(15));
    const dearer = new P.PricingEngine(rules(75));
    ok('the same table gives the same revision', a.revision() === same.revision());
    ok('‼️ A CHANGED RATE GIVES A DIFFERENT ONE', a.revision() !== dearer.revision());
    ok('…and it is short enough to sit in a cache key',
        a.revision().length > 0 && a.revision().length <= 16);

    // A dated history is the shape the product really builds, and a version
    // added to it re-prices everything from that date on.
    const one = P.PricingEngine.fromHistory([{ effectiveFrom: 1000, rules: rules(15) }]);
    const two = P.PricingEngine.fromHistory([
        { effectiveFrom: 1000, rules: rules(15) }, { effectiveFrom: 2000, rules: rules(75) }
    ]);
    ok('…and an appended dated version changes it too', one.revision() !== two.revision());
}

// -------------------------------------------------------------- the weights
{
    const p = new P.PricingEngine(rules(15));
    const before = P.costingRevision(p);
    P.setQuotaConfig({ mode: 'raw' });
    const afterMode = P.costingRevision(p);
    ok('‼️ CHANGING THE QUOTA MODE CHANGES THE REVISION — the weighted figure is '
        + 'what a rotation is decided on', before !== afterMode);

    P.setQuotaConfig({
        mode: 'model-aware',
        weights: [{ match: 'sonnet', input: 1, output: 9, cacheWrite: 1, cacheRead: 0.1, cacheWrite1h: 2 }]
    });
    const afterWeights = P.costingRevision(p);
    ok('…and so does re-weighting a model', afterWeights !== before && afterWeights !== afterMode);

    P.setQuotaConfig({ mode: 'model-aware', weights: [] });
    ok('…and putting the shipped table back gives the first answer again',
        P.costingRevision(p) === before);
}

// ----------------------------------------- a stand-in engine is not a crash
{
    // ‼️ `PricingEngine` travels as a SHAPE in this repo — a dozen tests and
    // more than one tool hand in `{ costFor }`. Requiring `revision()` threw
    // inside the scan itself, which is a worse failure than a stale figure.
    let threw = false, rev = '';
    try { rev = P.costingRevision({ costFor: () => 0 }); } catch { threw = true; }
    ok('‼️ AN ENGINE STAND-IN STILL ANSWERS, rather than throwing inside the scan',
        !threw && rev.length > 0);
    ok('…and two stand-ins agree, because their arithmetic does not change',
        P.costingRevision({ costFor: () => 0 }) === P.costingRevision({}));
}

// ------------------------------------------------- and the scan really uses it
{
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'cliTranscripts.ts'), 'utf8');
    ok('‼️ THE SCAN\'S CACHE KEY CARRIES THE RULES, NOT ONLY THE FILE',
        /sig = `\$\{st\.size\}:\$\{st\.mtimeMs\}:\$\{rules\}`/.test(src));
    ok('…and the rules are read ONCE per scan, not once per file',
        /const rules = costing\(\);/.test(src)
        && !/costing\(\)/.test(src.slice(src.indexOf('const cached = cache.get'))));
    const wired = (src.match(/\(\) => costingRevision\(pricing\(\)\)/g) || []).length;
    ok(`…and every source that derives a figure passes one (${wired})`, wired >= 3);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
