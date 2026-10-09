// X-116 — "silinmiş seçim recovery görünürdür": a saved choice naming a route
// that no longer exists is reported BEFORE it fires, grouped by route, with
// what each kind of record will do about it.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(ROOT, 'out', 'core', 'savedRoutes.js'));
const H = require(path.join(ROOT, 'out', 'core', 'providerHealth.js'));

// ---- the pure verdict ----
{
    const held = new Set(['anthropic', 'kimi']);
    const known = id => held.has(id);
    const saved = [
        { kind: 'agent default', label: 'developer', providerId: 'minimax' },
        { kind: 'schedule', label: 'nightly', providerId: 'minimax' },
        { kind: 'queued task', label: 'one-off', providerId: 'gone2' },
        { kind: 'launch profile', label: 'Kimi fast', providerId: 'kimi' },
        { kind: 'schedule', label: 'no route', providerId: '' }
    ];
    const p = S.goneRouteProblems(saved, known);
    ok('one sentence per gone route, sorted', p.length === 2 && /^route "gone2"/.test(p[0]) && /^route "minimax"/.test(p[1]));
    ok('it names every record still pointing there, with its kind',
        /2 saved choices still name it: developer \(agent default\), nightly \(schedule\)/.test(p[1]));
    ok('‼️ an agent default says what it really does — nothing injected, nothing cleared',
        /nothing injected and nothing cleared/.test(p[1]));
    ok('a schedule says it is refused when it fires', /refused each time it fires/.test(p[1]));
    ok('a queued task says it is refused when it starts', /one saved choice still names it: one-off \(queued task\)/.test(p[0])
        && /refused when it starts/.test(p[0]));
    ok('a route that exists is not reported', !p.join(' ').includes('Kimi fast'));
    ok('an empty route is not a gone route', !p.join(' ').includes('no route'));
    ok('nothing saved → nothing reported', S.goneRouteProblems(undefined, known).length === 0);
}

// ---- reaches the health report, only against a read catalog ----
{
    const adapter = { engine: 'claude', axis: 'provider', preflight: () => [], catalog: () => undefined };
    const catalog = { source: 'agent-farm-profile', providers: [{ providerId: 'anthropic', label: 'Anthropic', models: ['claude-opus-5'] }], rows: [] };
    const savedRoutes = [{ kind: 'agent default', label: 'developer', providerId: 'kimi' }];
    const rep = H.providerHealth({ engine: 'claude', adapter, catalog, savedRoutes, inheritedEnv: {} });
    ok('a gone route lands in the report problems', rep.problems.some(p => /route "kimi" no longer exists/.test(p)));
    const held = H.providerHealth({ engine: 'claude', adapter, catalog, savedRoutes, inheritedEnv: {},
        profiles: [{ id: 'kimi', label: 'Kimi', engines: ['claude'], providerId: 'kimi', tiers: {} }] });
    ok('‼️ a route Agent Farm still holds is not "gone", even when the catalog lacks it',
        !held.problems.some(p => /no longer exists/.test(p)));
    const unread = H.providerHealth({ engine: 'claude', adapter, catalog: { ...catalog, source: 'not-fetched' }, savedRoutes, inheritedEnv: {} });
    ok('‼️ with no catalog read, nothing is called gone', !unread.problems.some(p => /no longer exists/.test(p)));

    // ‼️ MEASURED: the Claude catalog lists the shipped route TEMPLATES (kimi,
    // minimax) with no profile behind them, so a list-based check called a
    // removed "kimi" profile alive while the spawn refused it. The host hands in
    // the spawn's own rule, and it wins over the list.
    const withTemplate = { ...catalog, providers: [...catalog.providers, { providerId: 'kimi', label: 'Kimi', models: [] }] };
    const listOnly = H.providerHealth({ engine: 'claude', adapter, catalog: withTemplate, savedRoutes, inheritedEnv: {} });
    const byRule = H.providerHealth({ engine: 'claude', adapter, catalog: withTemplate, savedRoutes, inheritedEnv: {},
        routeRunnable: () => false });
    ok('a template the catalog lists is alive to a list', !listOnly.problems.some(p => /no longer exists/.test(p)));
    ok('‼️ …and gone to the spawn\'s own rule, which is what decides', byRule.problems.some(p => /route "kimi" no longer exists/.test(p)));
}

// ---- the host gathers every kind, and only where it owns the catalog ----
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const a = ext.indexOf('const savedRoutesFor = (engine: string)');
    const body = a < 0 ? '' : ext.slice(a, ext.indexOf('return out;', a));
    ok('the gatherer exists', body.length > 100);
    ok('it reads the agent defaults through storedRoute', /storedRoute\(defaults, a\.dir, engine as EngineId\)/.test(body));
    ok('…launch profiles, schedules and queued tasks', /launchProfiles\(\)/.test(body)
        && /taskManager\.schedules/.test(body) && /t\.status === 'queued'/.test(body));
    ok('‼️ it writes nothing', !/\.update\(|writeFile|save\(\)|\.set\(/.test(body));
    ok('‼️ only for an engine whose route catalog Agent Farm owns',
        /\.\.\.\(dataOwnerOf\(engine, 'catalog', 'agent-farm-route'\) === 'agent-farm' \? \{\s*savedRoutes: savedRoutesFor\(engine\),/.test(ext));
}

// ---- profile schema upgrade: filled in and skipped, SAID ----
{
    const P = require(path.join(ROOT, 'out', 'core', 'providerProfiles.js'));
    const raw = [
        { id: 'kimi', label: 'Kimi', engines: ['claude'], providerId: 'kimi', tiers: { opus: 'k2' }, revision: 3 },
        { id: 'old', providerId: 'old', tiers: {} },
        { id: 'Kimi Work', providerId: 'x', tiers: {} },
        'not a record'
    ];
    const r = P.readProfilesReport(raw);
    ok('the list is exactly what readProfiles returns', JSON.stringify(r.list) === JSON.stringify(P.readProfiles(raw)));
    ok('a current record is not reported', !r.upgraded.some(u => /"kimi"/.test(u)));
    ok('‼️ an older shape says what was filled in', r.upgraded.length === 1
        && /route "old" was stored in an older shape and is read with engines claude, revision 1, label "old"/.test(r.upgraded[0]));
    ok('‼️ a skipped id is named with the reason, not silently missing',
        r.dropped.some(d => /stored route "Kimi Work" was skipped: a profile id is/.test(d)));
    ok('a non-record is counted by position', r.dropped.some(d => /stored route #4 is not a record/.test(d)));
    const adapter = { engine: 'claude', axis: 'provider', preflight: () => [], catalog: () => undefined };
    const rep = H.providerHealth({ engine: 'claude', adapter, catalog: { source: 'agent-farm-profile', providers: [], rows: [] },
        inheritedEnv: {}, profileRead: r });
    ok('a skipped route is a report problem', rep.problems.some(p => /"Kimi Work" was skipped/.test(p)));
    ok('an upgraded route is a report note', rep.notes.some(n => /route "old" was stored in an older shape/.test(n)));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the host hands health the SAME rule the spawn refuses by',
        /routeRunnable: \(id: string\) => !launchRouteRefusal\(engine, id, ''\)/.test(ext));
    ok('the host reads the stored list through the same reader', /profileRead: readProfilesReport\(cfg\(\)\.get<unknown\[\]>\('providerProfiles', \[\]\)\)/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
