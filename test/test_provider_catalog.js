// X-99 — THE TWO-SOURCE PROVIDER / MODEL / VARIANT / CAPABILITY CATALOG.
//
// ‼️ TWO ENGINES, TWO OWNERS, AND THE OWNERSHIP IS THE DESIGN.
//
// OpenCode owns its own provider list, its credentials and its config. Agent
// Farm reads the public half and records what was chosen; it does not keep a
// second copy. So the catalog for that engine is MEASURED — `opencode models
// --verbose`, or the ACP handshake — and a hard-coded list of provider names
// would be a build claiming to know something about a machine.
//
// Claude Code has no provider list of its own: a "provider" there is a ROUTE
// Agent Farm assembles and injects (base URL, auth kind, tier→model mapping).
// So that catalog is DECLARED — a table of route templates — and the acceptance
// line is that living provider and model names must not need a code change:
// the templates are data, and a user's own entry merges in by the same shape.
//
// THE RULE BEING PINNED, and it is X-98's rule one layer up: the provider on an
// OpenCode row comes from the `providerID` FIELD, never from splitting the
// printed `provider/model` line. They agree today on every row of a real
// catalog — measured — and the moment they stop agreeing, the field is the one
// the engine meant.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const C = require(path.join(ROOT, 'out', 'core', 'providerCatalog.js'));

/* =========================================================================
 * ‼️ MEASURED, NOT INVENTED — `opencode models --verbose`, OpenCode 1.18.19,
 * this machine, 30 Aug 2026. Two entries kept verbatim out of the six: one
 * that publishes reasoning VARIANTS and one that does not, because the
 * difference between them is the whole of the variant rule below.
 * ========================================================================= */
const REAL_VERBOSE = `opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "name": "Big Pickle",
  "family": "big-pickle",
  "api": { "id": "big-pickle", "url": "https://opencode.ai/zen/v1", "npm": "@ai-sdk/openai-compatible" },
  "status": "active",
  "headers": {},
  "options": {},
  "cost": { "input": 0, "output": 0, "cache": { "read": 0, "write": 0 } },
  "limit": { "context": 200000, "input": 160000, "output": 32000 },
  "capabilities": {
    "temperature": true,
    "reasoning": true,
    "attachment": false,
    "toolcall": true,
    "input": { "text": true, "audio": false, "image": false, "video": false, "pdf": false },
    "output": { "text": true, "audio": false, "image": false, "video": false, "pdf": false },
    "interleaved": { "field": "reasoning_content" }
  },
  "release_date": "2025-10-17",
  "variants": {}
}
opencode/ling-3.0-flash-fin-free
{
  "id": "ling-3.0-flash-fin-free",
  "providerID": "opencode",
  "name": "Ling 3.0 Flash Fin Free",
  "family": "ling",
  "api": { "id": "ling-3.0-flash-fin-free", "url": "https://opencode.ai/zen/v1", "npm": "@ai-sdk/openai-compatible" },
  "status": "active",
  "headers": {},
  "options": {},
  "cost": { "input": 0, "output": 0, "cache": { "read": 0, "write": 0 } },
  "limit": { "context": 262144, "output": 32768 },
  "capabilities": {
    "temperature": true,
    "reasoning": true,
    "attachment": false,
    "toolcall": true,
    "input": { "text": true, "audio": false, "image": false, "video": false, "pdf": false },
    "output": { "text": true, "audio": false, "image": false, "video": false, "pdf": false },
    "interleaved": false
  },
  "release_date": "2026-08-27",
  "variants": {
    "low": { "reasoningEffort": "low" },
    "medium": { "reasoningEffort": "medium" },
    "high": { "reasoningEffort": "high" }
  }
}`;

/* =========================================================================
 * 1 — THE ENGINE'S OWN CATALOG, READ THE WAY THE ENGINE MEANS IT
 * ========================================================================= */
{
    const cat = C.readOpenCodeCatalog(REAL_VERBOSE);
    eq('the catalog says where it came from', cat.source, 'engine-reported');
    eq('one provider, because that is what this machine reaches',
        cat.providers.map(p => p.providerId), ['opencode']);
    eq('…with both of its models, spelled the way the engine spells them',
        cat.providers[0].models, ['opencode/big-pickle', 'opencode/ling-3.0-flash-fin-free']);

    // ‼️ X-98's RULE, ONE LAYER UP. The head line is the engine PRINTING a
    // qualified name; the `providerID` field is the engine NAMING the provider.
    // The field is the source, and the line is only ever a cross-check.
    const forged = REAL_VERBOSE.replace('opencode/big-pickle\n', 'anthropic/big-pickle\n');
    const f = C.readOpenCodeCatalog(forged);
    eq('a printed prefix does not invent a provider',
        f.providers.map(p => p.providerId), ['opencode']);

    const rows = C.openCodeModelRows(cat);
    const big = rows.find(r => r.ref === 'opencode/big-pickle');
    const ling = rows.find(r => r.ref === 'opencode/ling-3.0-flash-fin-free');
    eq('a row carries the display name the engine gave it', big.label, 'Big Pickle');

    // ‼️ REASONING IS NOT THE SAME QUESTION AS VARIANTS, AND BOTH OF THESE
    // MODELS SAY SO. Measured: all six models on this machine report
    // `capabilities.reasoning: true` and only two publish a `variants` map. A
    // box drawn off the capability would offer levels the engine will not take.
    ok('a model that reasons but publishes no variants offers none',
        big.capabilities.reasoning === true && big.variants.length === 0);
    eq('…while one that publishes them offers exactly those',
        ling.variants, ['low', 'medium', 'high']);

    // ‼️ ZERO IS A FIGURE. NOTHING IS NOT. The free provider really does cost
    // nothing, and `cost: 0` said as "unknown" would make an honest catalog
    // unreadable. An absent limit is the other half of the same rule: `ling`
    // states no input limit, and reporting 0 would be inventing a ceiling.
    eq('a real zero cost is a known zero', big.cost, { input: 0, output: 0 });
    eq('a stated context limit is carried', big.limit.context, 200000);
    eq('…and an unstated input limit stays absent', ling.limit.input, undefined);

    eq('nothing in gives an empty catalog rather than a throw',
        C.readOpenCodeCatalog('').providers, []);
    eq('…and it says it was never answered', C.readOpenCodeCatalog('').source, 'not-fetched');
    eq('garbage between entries is skipped, not fatal',
        C.readOpenCodeCatalog('nonsense\nmore nonsense').providers, []);
}

/* =========================================================================
 * 2 — THE DECLARED SIDE: CLAUDE ROUTE TEMPLATES ARE DATA
 * ========================================================================= */
{
    const cat = C.readClaudeRouteCatalog();
    eq('the declared catalog says so', cat.source, 'agent-farm-profile');
    ok('the first-party route is offered', cat.providers.some(p => p.providerId === 'anthropic'));
    const anthropic = cat.providers.find(p => p.providerId === 'anthropic');
    ok('…and it names no base URL of its own, because it is the default',
        !anthropic.route.baseUrl);

    // ‼️ THE ACCEPTANCE LINE: LIVING NAMES DO NOT NEED A CODE CHANGE. A route
    // the user describes in settings is a first-class provider — same shape,
    // same reader. If adding a provider meant editing a switch statement, the
    // table would be stale the week after it shipped.
    const withMine = C.readClaudeRouteCatalog([{
        providerId: 'my-gateway', providerLabel: 'My Gateway',
        baseUrl: 'https://gw.example.com', authKind: 'api-key',
        tiers: { opus: 'big-one', sonnet: 'mid-one' }
    }]);
    ok('a route described in settings joins the catalog',
        withMine.providers.some(p => p.providerId === 'my-gateway'));
    // ‼️ The tier mapping rides on the TEMPLATE, not on the shared entry: it is
    // a Claude-route fact (what does this endpoint serve when somebody asks for
    // "opus"), and putting it on the shape both engines share would give every
    // OpenCode provider a field that means nothing there.
    eq('…carrying the tier mapping it declared',
        withMine.templates.find(t => t.providerId === 'my-gateway').tiers.opus, 'big-one');
    ok('…and the shipped rows are still there',
        withMine.providers.length === cat.providers.length + 1);
    // A user entry naming a shipped id REPLACES it rather than appearing twice:
    // two rows with one name is a picker that cannot be reasoned about.
    const over = C.readClaudeRouteCatalog([{ providerId: 'anthropic', providerLabel: 'Mine' }]);
    eq('…and one that reuses a shipped name overrides it, once',
        over.providers.filter(p => p.providerId === 'anthropic').length, 1);
    eq('…with the user\'s words winning',
        over.providers.find(p => p.providerId === 'anthropic').providerLabel, 'Mine');

    // ‼️ NO SECRET IS EVER PART OF A CATALOG. A template describes a route's
    // SHAPE; what unlocks it belongs to X-100 and to SecretStorage. Measured on
    // the serialised form, which is what travels to the page and the bridge.
    //
    // ‼️ THE ASSERTION HUNTS THE PLANTED VALUES AND THE FIELD NAMES, not the
    // WORDS: a first pass scanned for /token/i and failed on MiniMax's own
    // documentation URL (`docs/token-plan/...`). A leak test that fires on
    // English prose gets relaxed rather than fixed, and then it is not a test.
    const leaky = C.readClaudeRouteCatalog([{
        providerId: 'leaky', apiKey: 'sk-PLANTED-1', token: 'PLANTED-2',
        headers: { 'x-api-key': 'sk-PLANTED-3' }
    }]);
    const wire = JSON.stringify(leaky);
    ok('no planted credential value survives into the catalog',
        !/PLANTED-[123]/.test(wire));
    const names = new Set();
    const collect = v => {
        if (Array.isArray(v)) { v.forEach(collect); } else if (v && typeof v === 'object') {
            Object.keys(v).forEach(k => { names.add(k.toLowerCase()); collect(v[k]); });
        }
    };
    collect(leaky);
    ok('…and no credential-shaped field name is carried either',
        ![...names].some(n => /apikey|secret|token|password|credential|header/.test(n)));
}

/* =========================================================================
 * 3 — ‼️ A SELECTION THAT CANNOT RUN IS REFUSED BEFORE THE SPAWN
 * ========================================================================= */
{
    const oc = C.readOpenCodeCatalog(REAL_VERBOSE);
    eq('a model the engine still offers passes',
        C.catalogRefusal(oc, { engine: 'opencode', providerId: 'opencode', modelId: 'big-pickle' }), []);
    ok('a model the engine no longer offers is named, before anything starts',
        C.catalogRefusal(oc, { engine: 'opencode', providerId: 'opencode', modelId: 'gone-away' })
            .join(' ').includes('gone-away'));
    ok('…and so is a provider it does not have',
        C.catalogRefusal(oc, { engine: 'opencode', providerId: 'kimi', modelId: 'k2' })
            .join(' ').includes('kimi'));
    ok('a variant the model does not publish is refused',
        C.catalogRefusal(oc, {
            engine: 'opencode', providerId: 'opencode', modelId: 'big-pickle', variant: 'high'
        }).join(' ').toLowerCase().includes('variant'));
    eq('…while one it does publish passes',
        C.catalogRefusal(oc, {
            engine: 'opencode', providerId: 'opencode',
            modelId: 'ling-3.0-flash-fin-free', variant: 'high'
        }), []);

    const cl = C.readClaudeRouteCatalog([{
        providerId: 'kimi', providerLabel: 'Kimi', baseUrl: 'https://api.moonshot.ai/anthropic',
        authKind: 'api-key', tiers: { opus: 'kimi-k2-thinking' }
    }]);
    ok('a Claude tier the route does not map is named, with the ones it does',
        C.catalogRefusal(cl, { engine: 'claude', providerId: 'kimi', tier: 'haiku' })
            .join(' ').includes('opus'));
    eq('…and a tier it maps passes',
        C.catalogRefusal(cl, { engine: 'claude', providerId: 'kimi', tier: 'opus' }), []);

    // ‼️ AN UNFETCHED CATALOG REFUSES NOTHING. Absence of a list is not proof of
    // absence of a model: this engine is reachable long before anything has been
    // read off it, and refusing on silence would block every launch made in the
    // first seconds of a window. The honest failure there is the engine's own.
    const empty = C.readOpenCodeCatalog('');
    eq('silence is not a refusal',
        C.catalogRefusal(empty, { engine: 'opencode', providerId: 'x', modelId: 'y' }), []);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
