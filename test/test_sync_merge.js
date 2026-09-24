// X-342 — the store owner takes the merge. Three things are pinned: the
// extension's body answers exactly as the engine's _setup/sync/t2.js does, the
// store table in extension.ts agrees with _setup/sync-classes.json, and the
// sync.merge op merges under the lock, archives first, and re-reads the store.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BridgeRegistry } = require('../out/core/bridge');
const { mergeT2 } = require('../out/core/syncMerge');
const { registerSyncMergeOps } = require('../out/core/syncMergeOps');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-syncmerge-'));
const SETUP = process.env.AF_AGENT_SETUP || 'D:\\zone\\agent\\_setup';

const cases = [
    ['map union, a conflict keeps live', { shape: 'map' }, { a: 'x', b: 'y' }, { b: 'Y', c: 'z' }],
    ['map into nothing', { shape: 'map' }, undefined, { a: 1, b: 2 }],
    ['items: newer wins, rev bumps', { shape: 'items', list: 'items', key: 'id', time: 'ts' },
        { rev: 4, items: [{ id: '1', ts: 10, t: 'old' }, { id: '2', ts: 5 }] },
        { rev: 2, items: [{ id: '1', ts: 20, t: 'new' }, { id: '3', ts: 1 }, { ts: 9 }] }],
    ['items: no time field, conflict kept live', { shape: 'items', list: 'notices', key: 'id' },
        { notices: [{ id: 'n', v: 1 }] }, { notices: [{ id: 'n', v: 2 }] }],
    ['items: ISO time', { shape: 'items', list: 'candidates', key: 'id', time: 'addedAt' },
        { candidates: [{ id: 'w', addedAt: '2026-09-01T00:00:00Z', s: 'a' }] },
        { candidates: [{ id: 'w', addedAt: '2026-09-02T00:00:00Z', s: 'b' }] }],
    ['identical sides change nothing', { shape: 'items', list: 'items', key: 'id', time: 'ts' },
        { rev: 1, items: [{ id: '1', ts: 1 }] }, { rev: 1, items: [{ id: '1', ts: 1 }] }],
    ['X-363 prefer: the chosen map key takes the source', { shape: 'map' }, { a: 'x', b: 'y' }, { b: 'Y', c: 'z' }, ['b']],
    ['X-363 prefer: a chosen record wins even when the live one is newer', { shape: 'items', list: 'items', key: 'id', time: 'ts' },
        { items: [{ id: '1', ts: 50, t: 'live' }, { id: '2', ts: 1 }] }, { items: [{ id: '1', ts: 10, t: 'src' }, { id: '2', ts: 2 }] }, ['1']]
];

// ------------------------------------------------------------------ the body
{
    const r0 = mergeT2(cases[0][1], cases[0][2], cases[0][3]);
    ok('map: union of keys', JSON.stringify(r0.merged) === JSON.stringify({ a: 'x', b: 'y', c: 'z' }));
    ok('map: the clash is listed, live kept', r0.conflicts.length === 1 && r0.conflicts[0].key === 'b' && r0.added === 1);
    const r2 = mergeT2(cases[2][1], cases[2][2], cases[2][3]);
    ok('items: the newer record replaces', r2.merged.items[0].t === 'new' && r2.replaced === 1 && r2.added === 1);
    ok('items: a record with no id is skipped', r2.merged.items.length === 3);
    ok('items: rev is max + 1 on a change', r2.merged.rev === 5);
    const r5 = mergeT2(cases[5][1], cases[5][2], cases[5][3]);
    ok('identical sides: unchanged, rev kept', !r5.changed && r5.merged.rev === 1);
    const p6 = mergeT2(cases[6][1], cases[6][2], cases[6][3], cases[6][4]);
    ok('prefer: the chosen key takes the source and says so', p6.merged.b === 'Y' && p6.conflicts[0].kept === 'source' && p6.replaced === 1);
    const p7 = mergeT2(cases[7][1], cases[7][2], cases[7][3], cases[7][4]);
    ok('prefer: beats the newer live record; an unchosen record still follows K2', p7.merged.items[0].t === 'src' && p7.merged.items[1].ts === 2);
}

// --------------------------------------------------- the same answer as t2.js
const engine = path.join(SETUP, 'sync', 't2.js');
if (fs.existsSync(engine)) {
    const t2 = require(engine);
    for (const [name, spec, live, src, prefer] of cases) {
        const a = mergeT2(spec, live, src, prefer), b = t2.mergeT2(spec, live, src, prefer);
        ok('parity with t2.js: ' + name, JSON.stringify(a) === JSON.stringify(b));
    }
} else {
    console.log('  SKIP parity with t2.js — ' + engine + ' is not on this machine (set AF_AGENT_SETUP)');
}

// -------------------------------------- the store table agrees with the classes
const classes = path.join(SETUP, 'sync-classes.json');
if (fs.existsSync(classes)) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const t2 = JSON.parse(fs.readFileSync(classes, 'utf8')).classes.find(c => c.class === 'T2');
    for (const f of t2.files) {
        const name = path.basename(f.path);
        const line = src.split('\n').find(l => l.includes(`file: '${name}'`)) || '';
        const want = f.shape === 'map' ? "spec: { shape: 'map' }" : `items('${f.list}', '${f.time}')`;
        ok(`extension.ts registers ${name} with the classes' spec`, line.includes(want) && (f.shape === 'map' || (f.key || 'id') === 'id'));
    }
} else {
    console.log('  SKIP store table vs sync-classes.json — not on this machine');
}

// ------------------------------------------------------------------- the op
(async () => {
    const live = path.join(dir, 'notices.json');
    const other = path.join(dir, 'other', 'notices.json');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(live, JSON.stringify({ notices: [{ id: 'a', ts: 1 }] }));
    fs.writeFileSync(other, JSON.stringify({ notices: [{ id: 'b', ts: 2 }] }));
    let reloads = 0;
    const reg = new BridgeRegistry();
    registerSyncMergeOps(reg, [{ file: 'notices.json', path: live, spec: { shape: 'items', list: 'notices', key: 'id', time: 'ts' }, reload: () => reloads++ }]);
    ok('sync.merge is on the bridge', reg.catalog().some(x => x.op === 'sync.merge'));

    const bad = await reg.dispatch('sync.merge', { items: [{ file: 'secrets.json', source: other }] });
    ok('a file the extension does not own is refused', !bad.ok);
    const self = await reg.dispatch('sync.merge', { items: [{ file: 'notices.json', source: live }] });
    ok('merging a store with itself is refused', !self.ok);
    const arcBad = await reg.dispatch('sync.merge', { items: [{ file: 'notices.json', source: other, archive: path.join(dir, 'x.json') }] });
    ok('an archive outside a sync-archive folder is refused', !arcBad.ok);

    const arc = path.join(dir, 'sync-archive', 'ts1', 'notices.json');
    const r = await reg.dispatch('sync.merge', { items: [{ file: '_run_folder_move/vscode/muvusoft.agent-farm/notices.json', source: other, archive: arc }] });
    const got = JSON.parse(fs.readFileSync(live, 'utf8'));
    ok('merge: answered ok, one added', r.ok && r.result.results[0].added === 1 && r.result.results[0].changed);
    ok('merge: the file holds both', got.notices.map(n => n.id).join() === 'a,b');
    ok('merge: the live copy was archived first', JSON.parse(fs.readFileSync(arc, 'utf8')).notices.length === 1 && r.result.results[0].archived);
    ok('merge: the owner re-read its store', reloads === 1);
    ok('merge: bytes is the size on disk', r.result.results[0].bytes === fs.statSync(live).size);
    ok('merge: no lock is left behind', !fs.existsSync(live + '.lock'));

    const again = await reg.dispatch('sync.merge', { items: [{ file: 'notices.json', source: other }] });
    ok('idempotent: the same source again changes nothing and repaints nothing', again.ok && !again.result.results[0].changed && reloads === 1);

    const back = await reg.dispatch('sync.merge', { items: [{ file: 'notices.json', source: arc, replace: true }] });
    ok('replace (rollback): the archived copy is taken verbatim', back.ok && back.result.results[0].restored
        && JSON.parse(fs.readFileSync(live, 'utf8')).notices.length === 1 && reloads === 2);

    const theirs = path.join(dir, 'other', 'theirs.json');
    fs.writeFileSync(theirs, JSON.stringify({ notices: [{ id: 'a', ts: 0, text: 'theirs' }] }));
    const pref = await reg.dispatch('sync.merge', { items: [{ file: 'notices.json', source: theirs, prefer: ['a'] }] });
    ok('op: prefer carries the user\'s choice — the older source record wins for that key',
        pref.ok && pref.result.results[0].replaced === 1 && JSON.parse(fs.readFileSync(live, 'utf8')).notices[0].text === 'theirs');

    const junk = path.join(dir, 'junk.json');
    fs.writeFileSync(junk, '[1,2]');
    const part = await reg.dispatch('sync.merge', { items: [{ file: 'notices.json', source: junk }] });
    ok('a source that is not an object is that item\'s error, not the call\'s', part.ok && /not a JSON object/.test(part.result.results[0].error));

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
