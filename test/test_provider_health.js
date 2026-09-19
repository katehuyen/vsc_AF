// X-114 — MOTOR-BİLİNÇLİ SAĞLAYICI SAĞLIK VE UYUMLULUK TESTİ.
//
// The item's acceptance is three sentences and every one of them is pinned
// here:
//
//   1. configured / available / tested are DISTINCT STATES, not one ladder. A
//      route can exist and be unusable; a provider can be usable and never have
//      been tried; a verdict can exist about a configuration that has changed.
//   2. An OpenCode provider with NO CREDENTIAL is not unhealthy. Measured on
//      this machine and already written into `engines.ts`: with an empty
//      auth.json the CLI lists and runs seven models on its own connected
//      provider. A check that demanded a key per provider would paint the one
//      provider that works red.
//   3. `providers.status` / `providers.test` return no secret. There is no
//      field here that could carry one: a credential is a BOOLEAN on the way
//      in (`hasSecret`) and never appears on the way out.
//
// And the defect this module exists to end: `engines.status` answers about the
// ENGINE. Every fault below lives one level down, on the route, where nothing
// was looking.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const H = require(path.join(ROOT, 'out', 'core', 'providerHealth.js'));
const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const T = require(path.join(ROOT, 'out', 'core', 'engineTest.js'));

const deps = (profiles, secrets = [], catalogText) => ({
    profiles,
    secretFor: id => (secrets.includes(id) ? 'not-a-real-key' : undefined),
    inheritedEnv: {},
    ...(catalogText === undefined ? {} : { openCodeCatalogText: catalogText })
});

const route = (over = {}) => ({
    id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'moonshot',
    baseUrl: 'https://api.moonshot.ai/anthropic',
    tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }, revision: 3, ...over
});

const input = (over = {}) => {
    const profiles = over.profiles ?? [route()];
    const adapter = R.adapterFor(over.engine ?? 'claude',
        deps(profiles, over.secrets ?? ['kimi'], over.catalogText));
    return {
        engine: over.engine ?? 'claude',
        adapter,
        catalog: adapter.catalog(),
        profiles,
        hasSecret: id => (over.secrets ?? ['kimi']).includes(id),
        cli: over.cli ?? { present: true, version: '2.1.0' },
        inheritedEnv: over.inheritedEnv ?? {},
        ...(over.settingsEnv ? { settingsEnv: over.settingsEnv } : {}),
        ...(over.engineCredentials ? { engineCredentials: over.engineCredentials } : {}),
        ...(over.records ? { records: over.records } : {})
    };
};

const rowOf = (report, id) => report.rows.find(r => r.providerId === id);

/* ---------- 1) the three states are three, and they do not imply each other */
{
    const report = H.providerHealth(input());
    const r = rowOf(report, 'kimi');
    ok('a route Agent Farm holds is configured', r.configured === true);
    eq('…and says who declares it', r.configuredBy, 'a route Agent Farm holds');
    eq('…and with a key and a catalog it is available', r.available, 'yes');
    ok('…and it is NOT tested, because nothing ran', r.tested === undefined);

    const noKey = H.providerHealth(input({ secrets: [] }));
    const nk = rowOf(noKey, 'kimi');
    ok('a route with no key is still CONFIGURED', nk.configured === true);
    eq('…and not available', nk.available, 'no');
    ok('…for the adapter\'s own reason, in its own words',
        nk.problems.some(p => /no stored key/.test(p)));
}

/* ---------- 2) unknown is an answer, and it is not "no" */
{
    // The OpenCode adapter with NOTHING read: the catalog source is
    // `not-fetched`, which refuses nothing and proves nothing.
    const report = H.providerHealth(input({ engine: 'opencode', profiles: [] }));
    eq('an unread catalog leaves the source not-fetched', report.source, 'not-fetched');
    ok('…and it says so rather than reporting a fault',
        report.notes.some(n => /unknown rather than false/.test(n)));
    eq('…with no rows invented for it', report.rows.length, 0);
}

/* ---------- 3) ‼️ THE SECOND ACCEPTANCE CLAUSE — an empty credentials file is
 * not a fault on an engine that owns its own. */
{
    const VERBOSE = `opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "name": "Big Pickle",
  "limit": { "context": 200000, "output": 32000 },
  "capabilities": { "toolcall": true },
  "variants": {}
}`;
    const report = H.providerHealth(input({
        engine: 'opencode', profiles: [], catalogText: VERBOSE,
        engineCredentials: { file: '~/.local/share/opencode/auth.json', present: true, entries: 0 }
    }));
    const r = rowOf(report, 'opencode');
    ok('the provider the catalog offers has a row', !!r);
    eq('…and an empty credentials file leaves it AVAILABLE', r.available, 'yes');
    eq('…with no problem raised about the missing credential', r.problems, []);
    ok('…and the absence explained as a note instead',
        r.notes.some(n => /offering this provider anyway/.test(n)));
    ok('…and the measurement said once, at the engine level',
        report.notes.some(n => /empty credentials file/.test(n)));
    eq('…and it is declared by the engine, not by us',
        r.configuredBy, 'the engine\'s own catalog');
    eq('…with the models it published', r.models, 1);
    ok('…and nothing invented about variants it does not publish',
        !r.notes.some(n => /variant/.test(n)));
}

/* ---------- 3b) ‼️ ACP/CLI CAPABILITY — what the transport cannot carry, said
 * where somebody picking a provider will read it. Measured (X-103): the
 * interactive TUI takes no --variant flag and ACP declares only model and mode,
 * so a hosted card runs the model's default however the picker was set. */
{
    const WITH_VARIANTS = `opencode/ling-3.0-flash-fin-free
{
  "id": "ling-3.0-flash-fin-free",
  "providerID": "opencode",
  "name": "Ling 3.0 Flash",
  "limit": { "context": 262144, "output": 32768 },
  "capabilities": { "reasoning": true, "toolcall": true },
  "variants": { "thinking": {}, "standard": {} }
}`;
    const report = H.providerHealth(input({
        engine: 'opencode', profiles: [], catalogText: WITH_VARIANTS
    }));
    const r = rowOf(report, 'opencode');
    ok('a provider that publishes variants says what a hosted card cannot carry',
        r.notes.some(n => /thinking, standard/.test(n) && /ACP declares only model and mode/.test(n)));
    eq('…and it is a note, never a fault — the provider is available on all three',
        r.available, 'yes');
    eq('…with no problem raised for it', r.problems, []);
}

/* ---------- 4) the faults that live on the ROUTE and nowhere else */
{
    const blank = H.providerHealth(input({
        profiles: [route({ tiers: { opus: 'kimi-k2-thinking', sonnet: '  ' } })]
    }));
    ok('a tier mapped to nothing is a fault',
        rowOf(blank, 'kimi').problems.some(p => /"sonnet" tier maps to no model/.test(p)));

    // ‼️ THE THIRD ANSWER TO THE ROUTE QUESTION. X-101 clears the inherited
    // environment; a name in the CLI's OWN settings file is read afterwards,
    // from inside the process, and no amount of clearing reaches it.
    const settings = H.providerHealth(input({
        settingsEnv: { ANTHROPIC_BASE_URL: 'https://elsewhere.example', MAX_THINKING_TOKENS: '4096' }
    }));
    ok('a route name in the CLI\'s own settings.json is an engine-wide problem',
        settings.problems.some(p => /ANTHROPIC_BASE_URL/.test(p) && /cannot clear/.test(p)));
    ok('…and a setting that is NOT a route is left out of it',
        !settings.problems.some(p => /MAX_THINKING_TOKENS/.test(p)));
    eq('…named once, not once per route', settings.problems.length, 1);

    // The inherited environment is the opposite case: a launch on a route
    // clears it by name, so it is a note about routeless runs.
    const inherited = H.providerHealth(input({
        inheritedEnv: { ANTHROPIC_API_KEY: 'x', PATH: '/usr/bin' }
    }));
    ok('an inherited route name is a note, not a fault',
        inherited.notes.some(n => /ANTHROPIC_API_KEY/.test(n))
        && !inherited.problems.some(p => /ANTHROPIC_API_KEY/.test(p)));
}

/* ---------- 5) an engine with no provider axis answers completely */
{
    const adapter = R.adapterFor('codex', deps([]));
    const report = H.providerHealth({
        engine: 'codex', adapter, catalog: adapter.catalog(), profiles: []
    });
    eq('a provider-less engine has no rows', report.rows.length, 0);
    eq('…and says why rather than looking broken', report.axis, 'not-applicable');
    ok('…in words', report.notes.some(n => /no provider axis/.test(n)));
}

/* ---------- 6) the CLI is asked before any route is */
{
    const report = H.providerHealth(input({ cli: { present: false } }));
    ok('no CLI is an engine-wide problem',
        report.problems.some(p => /is not on PATH/.test(p)));
    eq('…and nothing on it is available', rowOf(report, 'kimi').available, 'no');
}

/* ---------- 7) ‼️ A VERDICT NAMES WHAT IT PROVED, so a stale one cannot pass
 * for a current one — and is not thrown away either. */
{
    const key = H.keyFor(
        { engine: 'claude', adapter: R.adapterFor('claude', deps([route()])), cli: { version: '2.1.0' }, profiles: [route()] },
        'kimi', 'kimi-k2-thinking');
    eq('the key carries the route revision', key.revision, 3);
    eq('…and the CLI revision', key.cli, '2.1.0');
    ok('…and the adapter that resolved it', /@/.test(key.adapter));

    const record = { key, ok: true, at: 1000, ms: 900, detail: 'Answered.' };
    const found = H.findTest([record], key);
    ok('the record for this exact configuration is current', found.record === record);

    const edited = { ...key, revision: 4 };
    const after = H.findTest([record], edited);
    ok('after the route is edited it is NOT current', after.record === undefined);
    ok('…but it is not thrown away either', after.superseded === record);
    ok('…and the reason is the one that tells you whether to press again',
        /revision 3 → 4/.test(after.why));

    const newCli = H.findTest([record], { ...key, cli: '2.2.0' });
    ok('a CLI upgrade supersedes it too', /CLI has changed/.test(newCli.why));
    const otherModel = H.findTest([record], { ...key, modelId: 'kimi-k2' });
    ok('…and so does a verdict about another model',
        /ran on kimi-k2-thinking/.test(otherModel.why));

    eq('two keys differing in nothing are one key',
        H.testKeyOf(key), H.testKeyOf({ ...key }));
    ok('…and differing in the revision are not',
        H.testKeyOf(key) !== H.testKeyOf(edited));
}

/* ---------- 8) the report carries a record when there is one */
{
    const base = input();
    const key = H.keyFor(base, 'kimi', 'kimi-k2-thinking');
    const record = { key, ok: true, at: 5, ms: 10, detail: 'Answered.' };
    const report = H.providerHealth({ ...base, records: [record] });
    const r = rowOf(report, 'kimi');
    ok('a pass for this configuration is reported as tested', r.tested === record);
    eq('…and tested did not change what available says', r.available, 'yes');
}

/* ---------- 9) ‼️ NOTHING IS SPENT TO REDISCOVER A FAULT THAT WAS FREE TO READ */
{
    const bad = rowOf(H.providerHealth(input({ secrets: [] })), 'kimi');
    ok('a turn on an unavailable route is refused before it is spawned',
        /already known/.test(H.smokeRefusal(bad, 'kimi-k2-thinking')));
    const unknown = { available: 'unknown', problems: [], modelRefs: [] };
    ok('…and so is one aimed through a catalog nobody has read',
        /no catalog has been read/.test(H.smokeRefusal(unknown, '')));
    ok('a provider that publishes no model has nothing to send a turn to',
        /nothing to send a turn to/.test(
            H.smokeRefusal({ available: 'yes', problems: [], modelRefs: [] }, '')));
    ok('a provider that does not exist is not silently tested',
        /no such provider/.test(H.smokeRefusal(undefined, 'x')));
    const good = rowOf(H.providerHealth(input()), 'kimi');
    eq('…and a healthy one is not refused', H.smokeRefusal(good, 'kimi-k2-thinking'), '');
}

/* ---------- 10) the aimed turn replaces the model rather than adding a second */
{
    const claude = T.aimedArgs('claude', ['-p', 'Reply with exactly: OK', '--model', 'haiku'],
        { providerId: 'kimi', modelRef: 'kimi-k2-thinking' });
    eq('the engine\'s own cheap model is REPLACED, never doubled',
        claude, ['-p', 'Reply with exactly: OK', '--model', 'kimi-k2-thinking']);
    eq('…and exactly one --model survives',
        claude.filter(a => a === '--model').length, 1);

    const opencode = T.aimedArgs('opencode', [], { providerId: 'opencode', modelRef: 'opencode/big-pickle' });
    ok('on OpenCode the whole line is rebuilt by its owner module',
        opencode.includes('opencode/big-pickle') && opencode.includes('plan'));

    const unaimed = T.aimedArgs('claude', ['-p', 'x'], { providerId: 'kimi' });
    eq('with no model named, nothing is rewritten', unaimed, ['-p', 'x']);

    const extra = T.aimedArgs('claude', ['-p', 'x', '--model', 'haiku'],
        { providerId: 'kimi', modelRef: 'm', args: ['--settings', 'none'] });
    eq('…and the adapter\'s own argv is carried after it',
        extra, ['-p', 'x', '--model', 'm', '--settings', 'none']);
}

/* ---------- 11) ‼️ NO FIELD HERE COULD CARRY A SECRET */
{
    const report = H.providerHealth(input());
    const text = JSON.stringify(report);
    ok('the key a test profile holds never reaches the report',
        !/not-a-real-key/.test(text));
    ok('…and neither does any field named like one',
        !/"(apiKey|key|secret|token|authToken)"\s*:/.test(text));
    // The endpoint IS public — it is the route, and a reader has to be able to
    // see which one they are about to spend a turn on.
    ok('the endpoint is public and stays readable elsewhere',
        typeof report.rows[0].label === 'string');
}

/* ---------- 12) …and it is actually WIRED, on the bridge, in this commit.
 * `_REF/agentfarm-dev.md`: a function an agent could reasonably trigger reaches
 * the bridge in the SAME commit or the feature is not done. */
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

    const at = ext.indexOf("op: 'providers.status'");
    ok('the free verdict is on the bridge', at > 0);
    const status = ext.slice(at, at + 4200);
    ok('…answering through the shared health function rather than its own reading',
        /providerHealth\(await providerHealthInput\(engine\)\)/.test(status));
    ok('…and its contract tells an agent the three states are not a ladder',
        /NOT A LADDER/.test(status));
    ok('…and that a missing credential is not a fault on OpenCode',
        /NOT A FAULT ON AN ENGINE THAT OWNS ITS/.test(status));

    const ta = ext.indexOf("op: 'providers.test'");
    ok('the costly one is on the bridge too', ta > 0);
    const test = ext.slice(ta, ta + 4200);
    ok('…and its contract warns that it costs a turn', /THIS COSTS A TURN/.test(test));
    // ‼️ THE OP AND THE PAGE'S BUTTON PRESS ONE FUNCTION. Two implementations
    // of "test this route" is how a button and an op come to mean different
    // things, so the op is pinned to the shared one rather than to a body of
    // its own.
    ok('…and it delegates rather than resolving its own way',
        /await runProviderTest\(engine, providerId, optStr\(args, 'model'\)\)/.test(test));
    ok('…and the page is handed the SAME two functions',
        /providerHealth: \(\) => providerHealthAll\(\)/.test(ext)
        && /runProviderTest\(engine, providerId, model\)/.test(ext));

    const sa = ext.indexOf('const runProviderTest = async (');
    ok('the shared runner exists', sa > 0);
    const run = ext.slice(sa, sa + 3600);
    // ‼️ THE ONE THING THIS MUST NEVER DO — a bridge response is written to a
    // file by `af.js --out`, read by agents and quoted into notices.
    ok('‼️ it returns the NAMES of what was injected, never the values',
        /injected: Object\.keys\(rt\.spawnEnv/.test(run));
    // The private half DOES exist in here — it is what goes to the child
    // process — so the assertion is about the RETURNED object, not the file.
    const returned = run.slice(run.indexOf('return {', run.indexOf('rememberProviderTest')));
    ok('…and never hands the private half back',
        returned.length > 0 && !/spawnEnv:/.test(returned.slice(0, 600)));
    ok('…and says so where an agent will read it', /NAMES, NEVER VALUES/.test(run));
    ok('it refuses before spawning whatever the free check already knows',
        /smokeRefusal\(row, modelRef\)/.test(run));
    ok('…and files the verdict under what it proved',
        /keyFor\(input, providerId, modelRef\)/.test(run) && /rememberProviderTest\(record\)/.test(run));
    ok('…through the registry, with the route the adapter resolved',
        /adapterFor\(engine, registryDeps\(\)\)/.test(run)
        && /resolveRuntime\(\{ engine, providerId, modelId: modelRef \}\)/.test(run));

    // The route really is the environment on this engine, so the runner has to
    // be able to empty the inherited answer as well as give its own.
    ok('the engine runner carries the route environment',
        /const engineRunner: EngineRunner = \(command, args, timeoutMs, shell = true, stdin, runEnv\)/
            .test(ext));
    ok('‼️ …and CLEARS a name rather than setting it to an empty string',
        /delete childEnv\[name\]/.test(ext));
    ok('the CLI revision is read with a local call, never a turn',
        /engineRunner\(command, \['--version'\], 15000, true\)/.test(ext));
    ok('…and the credentials file is COUNTED, never read out',
        /Object\.keys\(j as Record<string, unknown>\)\.length/.test(ext)
        && /THE COUNT\s*\n?\s*\*? ?IS THE WHOLE OF WHAT LEAVES THIS FUNCTION/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
