'use strict';
// X-525 (5) — the cleanup's route-ref kind: saved records naming a route that is gone or not marked for their
// engine, moved only by a unique model match, cleared or deleted only on a person's word, else left (refused at launch).
const fs = require('fs');
const path = require('path');
const { brokenRouteRefs, uniqueStandIn, fixRouteRefs } = require('../out/core/routeRefs.js');
const { collectRouteRecords, } = require('../out/core/routeRecords.js');
const { scanStale, staleLines, cleanStale } = require('../out/core/staleScan.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const routes = () => [
    { id: 'or-nemotron', engines: ['claude', 'opencode'], tiers: { opus: 'nvidia/nemotron-ultra', sonnet: 'nvidia/nemotron-ultra' }, hasKey: true },
    { id: 'kimi-a', engines: ['claude'], tiers: { opus: 'kimi-k2', sonnet: 'kimi-k2-turbo' }, hasKey: true },
    { id: 'kimi-b', engines: ['claude', 'opencode'], tiers: { opus: 'kimi-k2' }, hasKey: true },
    { id: 'kimi-nokey', engines: ['claude', 'opencode'], tiers: { opus: 'kimi-k2-turbo', sonnet: 'kimi-k2-turbo' }, hasKey: false },
    { id: 'oc-only', engines: ['opencode'], tiers: { opus: 'glm-5' }, hasKey: true },
    { id: 'keyless', engines: ['claude'], tiers: { opus: 'x' }, hasKey: false }
];
const snap = () => ({
    agentNames: { 'd:/a/dev': 'developer' },
    agentDefaults: { 'd:/a/dev': { claude: { providerId: 'oc-only' } } },
    launchProfiles: [
        { name: 'Genel Qwen3.8', providerId: 'or-qwen38', model: 'qwen/qwen3.8:free' },
        { name: 'Genel NorthCode', providerId: 'or-northcode' },
        { name: 'Kimi turbo', providerId: 'kimi-gone', model: 'kimi-k2-turbo', tier: 'sonnet' },
        { name: 'Kimi big', providerId: 'kimi-gone', model: 'kimi-k2' },
        { name: 'OC glm', engine: 'opencode', model: 'af-glm-gone/glm-5' },
        { name: 'Fine', providerId: 'or-nemotron' },
        { name: 'No key yet', providerId: 'keyless' },
        { name: 'Native', engine: 'opencode', providerId: 'kimi' }
    ],
    lastLaunch: {}, tasks: [], schedules: [], templates: [], workflows: [], triggers: [], missions: [], batons: []
});
const recs = s => collectRouteRecords(s);

/* ---------- what is broken */
{
    const items = brokenRouteRefs(recs(snap()), routes());
    const ids = items.map(x => x.id).sort();
    ok('every gone route and every route not marked for the record\'s engine, one item per route and engine: ' + ids.join(' '),
        ids.join('|') === 'route-ref:claude:kimi-gone|route-ref:claude:oc-only|route-ref:claude:or-northcode|route-ref:claude:or-qwen38|route-ref:opencode:glm-gone');
    ok('a route without a key is a key to give, not a broken binding', !ids.some(i => /keyless/.test(i)));
    ok('the engine\'s own provider is never ours to judge', !ids.some(i => /:kimi$/.test(i)));
    ok('each says why', /no longer exists/.test(items.find(x => x.routeId === 'or-qwen38').why)
        && /is not marked for claude/.test(items.find(x => x.routeId === 'oc-only').why));
    ok('…and names its records', /2 saved records naming "kimi-gone" on claude: Kimi turbo \(launch profile\), Kimi big \(launch profile\)/
        .test(items.find(x => x.routeId === 'kimi-gone').title));
}

/* ---------- the one route a record may move to, by its own model */
{
    const all = recs(snap());
    const by = n => all.find(r => r.label === n);
    ok('‼️ the record\'s model held in its own tier by exactly one keyed route marked for its engine → that route',
        uniqueStandIn(by('Kimi turbo'), routes()) === 'kimi-a');
    ok('‼️ two routes serving the model → no move (kimi-k2 is on kimi-a and kimi-b)', uniqueStandIn(by('Kimi big'), routes()) === undefined);
    ok('no model named → nothing provable', uniqueStandIn(by('Genel NorthCode'), routes()) === undefined);
    ok('no route serves it → no move', uniqueStandIn(by('Genel Qwen3.8'), routes()) === undefined);
    ok('an OpenCode record moves by the model under the route', uniqueStandIn(by('OC glm'), routes()) === 'oc-only');
    const tierWrong = { ...by('Kimi turbo'), rows: [{ providerId: 'kimi-gone', model: 'kimi-k2-turbo', tier: 'opus' }] };
    ok('a Claude record\'s tier must hold the model on the new route', uniqueStandIn(tierWrong, routes()) === undefined);
}

/* ---------- fixing */
{
    const s = snap();
    const r = fixRouteRefs(s, routes());
    ok('unique matches move, and say where', r.moved.map(m => `${m.record}:${m.from}>${m.to}`).sort().join('|')
        === 'Kimi turbo (launch profile):kimi-gone>kimi-a|OC glm (launch profile, opencode):glm-gone>oc-only');
    ok('…in the record\'s own spelling', s.launchProfiles[2].providerId === 'kimi-a' && s.launchProfiles[4].model === 'af-oc-only/glm-5');
    ok('‼️ without a person\'s word nothing else changes', s.launchProfiles[0].providerId === 'or-qwen38'
        && s.launchProfiles[1].providerId === 'or-northcode' && s.launchProfiles[3].providerId === 'kimi-gone'
        && s.agentDefaults['d:/a/dev'].claude.providerId === 'oc-only' && r.settled.length === 0);
    ok('…and what is left is reported', r.left.map(x => x.routeId).sort().join(',') === 'kimi-gone,oc-only,or-northcode,or-qwen38');
    ok('the stores touched are named', r.stores.join(',') === 'launchProfiles');
}
{
    const s = snap();
    s.launchProfiles.push({ name: 'OC Qwen', engine: 'opencode', providerId: 'af-or-qwen38' });
    const r = fixRouteRefs(s, routes(), ['route-ref:claude:or-qwen38', 'route-ref:claude:oc-only'], 'clear');
    ok('‼️ clearing one engine\'s item leaves the same route\'s records on another engine', s.launchProfiles[8].providerId === 'af-or-qwen38');
    s.launchProfiles.pop();
    ok('then=clear clears only the items named', !('providerId' in s.launchProfiles[0]) && !('providerId' in s.agentDefaults['d:/a/dev'].claude)
        && s.launchProfiles[1].providerId === 'or-northcode' && r.left.length === 0 && r.settled.length === 2);
    const d = snap();
    fixRouteRefs(d, routes(), ['route-ref:claude:or-northcode'], 'delete');
    ok('then=delete deletes the launch profiles naming it', !d.launchProfiles.some(p => p.name === 'Genel NorthCode') && d.launchProfiles.length === 7);
}

/* ---------- the cleanup counts and cleans them */
{
    const refs = [{ id: 'route-ref:claude:or-qwen38', title: 'Genel Qwen3.8', why: 'route "or-qwen38" no longer exists' }];
    const items = scanStale({ now: 1000, tasks: [], cards: [], batons: [], routeRefs: refs });
    ok('‼️ a broken binding is counted at once — it does not age', items.length === 1 && items[0].kind === 'route-ref' && items[0].ageMs === 0);
    ok('…and its line says no age', staleLines(items)[0] === '1 routes saved records still name that are gone or not marked for their engine');
    const calls = [];
    const d = {
        tasks: () => [], cards: () => [], batons: () => [], routeRefs: () => refs,
        cancelTask: () => { }, closeCard: () => { }, stopBaton: () => { },
        fixRouteRef: (id, by, then) => { calls.push({ id, by, then }); if (!then) { throw new Error('left: needs a person'); } }
    };
    const r1 = cleanStale(d, undefined, 'the user');
    ok('cleaning without a word fails with what is left, never clears', r1.failed.length === 1 && /needs a person/.test(r1.failed[0].why)
        && calls[0].then === undefined);
    const r2 = cleanStale(d, ['route-ref:claude:or-qwen38'], 'an agent', 'clear');
    ok('…then reaches the fix', r2.cleaned.length === 1 && calls[1].then === 'clear' && calls[1].by === 'an agent');
}

/* ---------- the host */
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the cleanup is handed the bindings and their fix', /routeRefs: \(\) => brokenRouteRefs\(collectRouteRecords\(routeSnapshot\(\)\), routeGoingIo\.routes\(\)\),/.test(ext)
        && /const left = fixRouteRefsNow\(\[id\], then === 'clear' \|\| then === 'delete' \? then : undefined, by\);/.test(ext));
    const pass0 = ext.slice(ext.indexOf('const routeRefPass = (): void => {'), ext.indexOf("routeRefTimer.unref?.();"));
    ok('the pass runs at start and when the route list changes', /setTimeout\(\(\) => \{ routeRefTimer = undefined; routeRefPass\(\); \}, 60_000\)/.test(ext)
        && /if \(!e\.affectsConfiguration\('agentFarm\.providerProfiles'\)\) \{ return; \}/.test(ext));
    ok('…moves first, then asks ONE question about the rest, not again for a week', pass0.indexOf('fixRouteRefsNow(undefined, undefined,') < pass0.indexOf("type: 'question'")
        && /noticesStore\.recentDuplicate\(ask, 7 \* 24 \* 3600 \* 1000\)/.test(pass0) && /Leave them \(nothing to do\)/.test(pass0));
    const sc = fs.readFileSync(path.join(__dirname, '..', 'src', 'staleCleanup.ts'), 'utf8');
    ok('the daily "waiting 24h+" notice does not count them, and its Clean now cleans only what it showed',
        /const items = staleNow\(d\)\.filter\(x => x\.kind !== 'route-ref'\);/.test(sc) && /cleanStale\(d, items\.map\(x => x\.id\), 'the user \(notification\)'\)/.test(sc));
    ok('the review asks a person once about what no route serves', /'Clear the route', 'Delete the launch profiles, clear the rest'\)/.test(sc));
}

console.log(`test_x525_route_refs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
