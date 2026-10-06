// S-136 — a routed launch's record outlives the cap; S-138 — how full the records are is read, not guessed.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const L = require(path.join(ROOT, 'out', 'core', 'launchManifest.js'));
const S = require(path.join(ROOT, 'out', 'core', 'spawnIds.js'));
const H = require(path.join(ROOT, 'out', 'core', 'launchRecordHealth.js'));

const plain = (id, at = 1) => ({ launchId: id, at, engine: 'claude', identity: { engine: 'claude', providerId: '', origin: 'not-applicable' } });
const routed = (id, at = 1) => ({ launchId: id, at, engine: 'claude', identity: { engine: 'claude', providerId: 'kimi', providerProfileId: 'kimi-work' } });
const ids = rows => rows.map(r => r.launchId || r.sessionId).join(',');

// ---------- which launch is routed ----------
{
    ok('a launch on a route profile is routed', L.isRoutedManifest(routed('a')));
    ok('…a launch with no profile is not — not even one an engine named its own provider for',
        !L.isRoutedManifest(plain('a'))
        && !L.isRoutedManifest({ launchId: 'o', identity: { engine: 'opencode', providerId: 'opencode', origin: 'engine-native' } })
        && !L.isRoutedManifest(undefined));
}

// ---------- the manifests' cap ----------
{
    let list = [routed('r1'), plain('p1'), plain('p2')];
    list = L.rememberManifest(list, plain('p3'), 3);
    ok('‼️ over the cap the oldest PLAIN launch goes, and the older routed one stays', ids(list) === 'r1,p2,p3');
    list = L.rememberManifest(list, plain('p4'), 3);
    ok('…again', ids(list) === 'r1,p3,p4');
    const allRouted = L.rememberManifest([routed('r1'), routed('r2'), routed('r3')], routed('r4'), 3);
    ok('routed launches alone past the cap: the oldest of them goes', ids(allRouted) === 'r2,r3,r4');
    const under = L.rememberManifest([plain('p1')], plain('p2'), 3);
    ok('under the cap nothing goes, order kept', ids(under) === 'p1,p2');
    ok('keepRoutedFirst keeps the order of what it keeps',
        L.keepRoutedFirst([1, 2, 3, 4, 5, 6], 3, n => n % 2 === 0).join(',') === '2,4,6');
}

// ---------- the session -> launch pairs' cap ----------
{
    const pair = (s, l) => ({ sessionId: s, launchId: l });
    const sids = rows => rows.map(r => r.sessionId).join(',');
    const stored = [pair('s1', 'r1'), pair('s2', 'p1'), pair('s3', 'p2')];
    const kept = S.keepSpawnPairs(stored, [pair('s4', 'p3')], 3, id => id.startsWith('r'));
    ok('‼️ a routed launch\'s pair outlives the cap; the oldest plain pair goes', kept.changed && sids(kept.pairs) === 's1,s3,s4');
    const old = S.keepSpawnPairs(stored, [pair('s4', 'p3')], 3);
    ok('…a caller that names no routed launch keeps the old rule (oldest first)', sids(old.pairs) === 's2,s3,s4');
}

// ---------- the reading ----------
{
    const d = Date.UTC(2026, 7, 31);
    const h = H.launchRecordHealth([plain('p1', d + 86400000), routed('r1', d), plain('p0', 0)], [{ sessionId: 's', launchId: 'r1' }], 10, 10);
    ok('the reading counts the launches, the routed ones, the pairs, and names the oldest day',
        h.manifests === 3 && h.routed === 1 && h.spawnPairs === 1 && h.cap === 10 && h.pairCap === 10 && h.oldest === '2026-08-31');
    ok('…and says nothing below the line', h.warning === null);
    const many = Array.from({ length: 9 }, (_, i) => plain('p' + i, d));
    const near = H.launchRecordHealth(many, [], 10, 10);
    ok('‼️ near a cap it warns, naming the store and its figure', /launch records 9\/10/.test(near.warning || '') && /a launch on a route profile is kept/.test(near.warning));
    const pairsNear = H.launchRecordHealth([], Array.from({ length: 9 }, (_, i) => ({ sessionId: 's' + i, launchId: 'l' })), 10, 10);
    ok('…for the pairs as well', /session-launch pairs 9\/10/.test(pairsNear.warning || ''));
    ok('the default caps are the stores\' own', H.launchRecordHealth([], []).cap === L.MANIFEST_CAP && H.launchRecordHealth([], []).pairCap === S.SPAWN_PAIR_CAP);
}

// ---------- the host wires both ----------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the pairs are kept with the routed launches named from the manifests',
        /keepSpawnPairs\(spawnPairs, pairs, undefined, id =>\s*\(routed \?\?= new Set\(launchManifests\(\)\.filter\(isRoutedManifest\)\.map\(m => m\.launchId\)\)\)\.has\(id\)\)/.test(src));
    ok('farm.health carries the reading', /launchRecords: launchRecordHealth\(launchManifests\(\), spawnPairs\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
