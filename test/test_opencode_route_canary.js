// X-517 G — LEAK LOCKS for a route lent to OpenCode (the X-115 pattern). A canary key is planted on one
// route and every place a lent route's data is written, shown or answered is asked, each on its own, not
// to carry it. The key lives only in the environment of a process that can call a model.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const out = (m) => require(path.join(ROOT, 'out', 'core', m));

const REG = out('providerRegistry.js');
const ROUTES = out('opencodeRoutes.js');
const OC = out('opencode.js');
const ET = out('engineTest.js');
const MAN = out('launchManifest.js');
const HEALTH = out('providerHealth.js');
const OWN = out('providerOwnership.js');
const SCRUB = out('secretScrub.js');
const CAT = out('providerCatalog.js');
const CONTRACT = out('opencodeContract.js');

const CANARY = 'sk-or-v1-CANARYx517CANARYx517CANARYx517';
const has = (v) => JSON.stringify(v ?? null).includes(CANARY);
const said = (s) => String(s).includes(CANARY);
const route = { id: 'or-bird', label: 'Bird', engines: ['claude', 'opencode'], providerId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api', authKind: 'api-key', tiers: { opus: 'vendor/model:free' }, revision: 2 };
const REF = 'af-or-bird/vendor/model:free';
const adapter = REG.adapterFor('opencode', { profiles: [route], secretFor: id => (id === route.id ? CANARY : undefined), inheritedEnv: {} });
const rt = adapter.resolveRuntime({ engine: 'opencode', providerId: 'af-or-bird', modelId: REF });

ok('the fixture really lends the canary — to the spawn\'s environment, under the route\'s variable', rt.spawnEnv.AF_ROUTE_KEY_OR_BIRD === CANARY);

// ---------- the fragment: a reference to the variable, never the value ----------
{
    ok('‼️ the fragment carries no key', !has(rt.spawnEnv.OPENCODE_CONFIG_CONTENT) && !has(ROUTES.fragmentFor([route])));
    ok('…only the {env:NAME} reference', JSON.parse(rt.spawnEnv.OPENCODE_CONFIG_CONTENT).provider['af-or-bird'].options.apiKey === '{env:AF_ROUTE_KEY_OR_BIRD}');
}

// ---------- argv ----------
{
    ok('‼️ the runtime\'s args carry no key', !has(rt.args));
    ok('…nor a headless run\'s argv', !has(OC.opencodeRunArgs({ model: REF })));
    ok('…nor a terminal\'s', !has(OC.opencodeTuiArgs({ model: REF })));
    ok('…nor a test turn\'s', !has(ET.aimedArgs('opencode', [], { providerId: 'af-or-bird', modelRef: REF, args: rt.args, spawnEnv: rt.spawnEnv })));
}

// ---------- the launch manifest and the session's route summary ----------
{
    const m = MAN.manifestFor({ launchId: 'L-1', at: 1, engine: 'opencode', identity: rt.identity, options: { model: REF, providerId: 'af-or-bird' },
        agentId: 'a1', agentName: 'developer', mechanism: 'task', cwd: 'D:/x', surface: 'headless' });
    ok('‼️ the manifest carries no key', !has(m));
    ok('…and its leak guard finds no credential-named field', MAN.manifestLeaks(m).length === 0);
    ok('…it records the route by its profile and revision', m.identity.providerProfileId === 'or-bird' && m.identity.providerProfileRevision === 2);
    ok('‼️ the session\'s route summary carries no key', !said(MAN.describeManifest(m)));
}

// ---------- the catalog and what is cached of it ----------
{
    ok('‼️ the adapter\'s catalog carries no key', !has(adapter.catalog()));
    // What OpenCode would print if it ever listed a lent provider with its options resolved.
    const echoed = `af-or-bird/vendor/model:free\n${JSON.stringify({ id: 'vendor/model:free', providerID: 'af-or-bird', options: { apiKey: CANARY }, headers: { Authorization: `Bearer ${CANARY}` } }, null, 2)}`;
    ok('‼️ …and the catalog text that is cached keeps only the public half', !said(CAT.publicOpenCodeCatalogText(echoed)));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    const at = ext.indexOf('const refreshOpencodeCatalog = ');
    const fetch = ext.slice(at, ext.indexOf('\n    };', at));
    ok('‼️ the catalog fetch is given no route environment — it inherits the window, nothing is added',
        at > 0 && /cp\.execFile\(OPENCODE_EXE, args, \{/.test(fetch) && !/\benv\s*:/.test(fetch));
}

// ---------- what the bridge answers ----------
{
    const profiles = ROUTES.routeProfilesOn('opencode', [route]);
    const report = HEALTH.providerHealth({ engine: 'opencode', adapter, catalog: adapter.catalog(), profiles, hasSecret: () => true, cli: { present: true, version: '1.18.35' }, inheritedEnv: {} });
    ok('‼️ providers.status carries no key', !has(report));
    ok('‼️ providers.list / providers.ownership publish a route without its key', !has(OWN.publicProfile({ ...route, apiKey: CANARY }, { hasSecret: true })));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    const rp = ext.indexOf("op: 'providers.runtime'");
    ok('‼️ providers.runtime answers with the NAMES of what a launch is given, never the values',
        rp > 0 && /Object\.keys\(/.test(ext.slice(rp, ext.indexOf("op: '", rp + 20))));
    const rpt = ext.indexOf('const runProviderTest = async (');
    ok('‼️ providers.test returns names, never values', /injected: Object\.keys\(rt\.spawnEnv/.test(ext.slice(rpt, rpt + 4200)));
}

// ---------- error texts, test records and Notices ----------
{
    ok('‼️ the key is one of the values a run\'s output and errors are scrubbed of', SCRUB.secretValuesOf(rt.spawnEnv).includes(CANARY));
    const quoted = `401 Unauthorized: invalid key "${CANARY}" for https://openrouter.ai/api/v1/messages`;
    const clean = SCRUB.scrubSecrets(quoted, SCRUB.secretValuesOf(rt.spawnEnv));
    ok('‼️ an error the engine quotes back is stored without it', !said(clean) && /401 Unauthorized/.test(clean));
    const s = new SCRUB.SecretScrubber(SCRUB.secretValuesOf(rt.spawnEnv));
    ok('‼️ …and a task\'s streamed output too', !said(s.push(`x ${CANARY.slice(0, 9)}`) + s.push(`${CANARY.slice(9)} y`) + s.flush()));
    const rec = { key: HEALTH.keyFor({ engine: 'opencode', adapter, cli: { version: '1.18.35' }, profiles: ROUTES.routeProfilesOn('opencode', [route]) }, 'af-or-bird', REF), ok: false, at: 1, ms: 1, detail: clean, error: clean };
    ok('‼️ a test record filed for the route carries no key', !has(rec));
    const probeNotice = CONTRACT.contractProblem({ version: '9', at: 1, status: 'broken', shapes: [], problems: ['anthropic: no request reached /v1/messages'] }, '9');
    ok('‼️ the contract notice and row problem carry no key (the probe never holds one)', !has(probeNotice) && !said(CONTRACT.PROBE_KEY));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const rpt = ext.indexOf('const runProviderTest = async (');
    ok('‼️ the test record is scrubbed with the values injected before it is stored',
        /scrubSecrets\(r\.detail, injectedValues\)/.test(ext.slice(rpt, rpt + 4200)) && /scrubSecrets\(r\.error, injectedValues\)/.test(ext.slice(rpt, rpt + 4200)));
}

// ---------- ‼️ never an OpenCode HTTP server with a route in its environment ----------
// Measured: OpenCode started with its own server (--port, serve, web) answers GET /config and
// /config/providers with the key RESOLVED. So no file that builds or spawns an OpenCode command line may
// spell those flags — opencode.ts holds every opencode-only flag (M-14), and the spawners name OPENCODE_EXE.
{
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { walk(p); } else if (p.endsWith('.ts')) { files.push(p); } } };
    walk(path.join(ROOT, 'src'));
    const spawners = files.filter(f => /OPENCODE_EXE|opencodeRunArgs|opencodeTuiArgs|opencodeAcpArgs/.test(fs.readFileSync(f, 'utf8')));
    ok('the scan finds the files that build or spawn OpenCode', spawners.some(f => f.endsWith(path.join('core', 'opencode.ts'))) && spawners.length >= 3);
    const offenders = spawners.filter(f => /['"`](serve|web|--port|--hostname)['"`]/.test(fs.readFileSync(f, 'utf8')));
    ok(`‼️ no OpenCode server flag is spelled where OpenCode is spawned (${offenders.map(f => path.relative(ROOT, f)).join(', ')})`, offenders.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
