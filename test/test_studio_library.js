// X-424 — the Studio wall's card, read from a library record (src/core/studioLibrary.ts)
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const L = require(path.join(ROOT, 'out/core/studioLibrary.js'));
const { libraryCard } = L;
const A = require(path.join(ROOT, 'out/core/airtableInput.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

const rec = {
    id: 'media_mp4_1', name: '', status: 'draft', tags: ['kedi'], version: 3, created_at: '2026-09-26T10:00:00Z',
    media: { type: 'video', file_path: 'D:/zome/media/media_TEST/video/final/a.mp4' },
    workflow: { stage: 'final' }, failure: { is_failed: true, reason: 'eller eridi' },
    technical_quality: { human_quality_score: 0, auto_quality_score: 7 },
    completed_sections: { media_core: true, provenance: true, workflow: true, seo: false },
    relations: { causal: { causes: ['media_gif_1'], effects: [] } }
};
const c = libraryCard(rec);
eq('the summary fields come through', [c.id, c.stage, c.type, c.status, c.failed, c.name], ['media_mp4_1', 'final', 'video', 'draft', true, 'a.mp4']);
eq('‼️ the auto score when no person gave one, and says so', [c.score, c.scoreBy], [7, 'auto']);
eq('‼️ a person\'s score beats the machine\'s', [libraryCard({ ...rec, technical_quality: { human_quality_score: 9, auto_quality_score: 7 } }).score, libraryCard({ ...rec, technical_quality: { human_quality_score: 9 } }).scoreBy], [9, 'human']);
eq('form fill = the true sections of all of them', c.fill, 75);
eq('why it failed, its chain, its version', [c.reason, c.causes, c.effects, c.version], ['eller eridi', ['media_gif_1'], [], 3]);
eq('a bare record: zeros and blanks, never a throw', (({ score, scoreBy, fill, reason, causes, version }) => [score, scoreBy, fill, reason, causes, version])(libraryCard({ id: 'x' })), [0, '', 0, '', [], 0]);

const q = A.resolveQuery({ stages: 'final,raw', limit: 5 });
const items = [rec, { ...rec, id: 'r2', workflow: { stage: 'raw' }, created_at: '2026-09-27T10:00:00Z' }, { ...rec, id: 'r3', workflow: { stage: 'semi' } }];
eq('‼️ matchRecords gives the whole records, newest first, filtered as findRecords is', A.matchRecords(items, q).map(r => r.id), ['r2', 'media_mp4_1']);
eq('…and findRecords is exactly its summaries', A.findRecords(items, q).map(r => r.id), A.matchRecords(items, q).map(r => r.id));


// ---- the wall: the view, the library, and the sidecar cache that stands in for it
eq('created_at rides on the card as at', c.at, Date.parse('2026-09-26T10:00:00Z'));
const v0 = L.resolveView({}, {}, 'TEST');
eq('‼️ the built-in view is every stage, every kind, both outcomes, on the Airtable page\'s default base', [v0.base, v0.stages, v0.kind, v0.success], ['TEST', [], '', '']);
const v1 = L.resolveView({ kind: 'video' }, { stages: 'final, asset', kind: 'image', base: 'stem' }, 'TEST');
eq('the page\'s live filter beats the Farm setting, the setting beats the built-in', [v1.base, v1.stages, v1.kind], ['stem', ['final', 'asset'], 'video']);
ok('each value says where it came from', /changed live/.test(v1.why.join(' ')) && /Farm Settings/.test(v1.why.join(' ')));
eq('an impossible view is refused by name', [L.viewRefusal({ stages: 'final,draft' }), L.viewRefusal({ kind: 'gif' }), L.viewRefusal({ success: 'maybe' }), L.viewRefusal({ base: 'a/b' }), L.viewRefusal({ stages: 'raw', kind: 'audio' })],
    ['stages has no draft — source, raw, semi, final, asset', 'kind is image | video | audio', 'success is passed | failed', 'base is a plain name', '']);

const F = p => p.replace(/\//g, path.sep);
const recs = [rec, { ...rec, id: 'r2', workflow: { stage: 'raw' }, failure: {}, media: { type: 'image', file_path: 'D:/zome/media/media_TEST/image/raw/b.png' }, created_at: '2026-09-27T10:00:00Z' }];
const cache = [
    { file: F('D:/zome/media/media_TEST/video/final/a.mp4'), name: 'gen a', kind: 'video', at: 5 },
    { file: F('C:/ext/outputs/c.png'), name: 'gen c', kind: 'image', at: Date.parse('2026-09-28T10:00:00Z') }
];
const deps = (list, settings) => ({ list: async () => list, settings: () => settings || {}, defaultBase: () => 'TEST', lang: () => 'TR' });
(async () => {
    const w = await L.libraryWall({}, cache, deps(recs));
    eq('‼️ engine up: the records, and a sidecar whose file has no record, newest first', w.cards.map(x => [x.id || x.name, x.from]), [['gen c', 'cache'], ['r2', 'library'], ['media_mp4_1', 'library']]);
    ok('…and the note says both', w.source === 'library' && /2 record\(s\) from TEST/.test(w.note) && /1 file\(s\) with no record yet/.test(w.note));
    const wv = await L.libraryWall({ kind: 'video' }, cache, deps(recs));
    eq('the view filters the records AND the cache the same way', wv.cards.map(x => x.id), ['media_mp4_1']);
    const wf = await L.libraryWall({ success: 'failed' }, cache, deps(recs));
    eq('a sidecar knows no failure: "failed" never shows one', wf.cards.map(x => x.id), ['media_mp4_1']);
    const wd = await L.libraryWall({}, cache, deps({ down: 'ECONNREFUSED' }));
    ok('‼️ engine down: the whole wall is the cache, and it SAYS so (Principle 1)', wd.source === 'cache' && wd.cards.length === 2 && wd.cards.every(x => x.from === 'cache') && /not answering \(ECONNREFUSED\)/.test(wd.note) && /not the database/.test(wd.note));
    const wn = await L.libraryWall({}, cache, { ...deps(recs), defaultBase: () => '' });
    ok('no database anywhere: the cache, and the note says where to set one', wn.source === 'cache' && /No database chosen/.test(wn.note));
    const many = Array.from({ length: 205 }, (_, i) => ({ ...rec, id: 'm' + i, created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() }));
    const wm = await L.libraryWall({}, [], deps(many));
    ok('the wall stops at 200 and says how many there were', wm.cards.length === 200 && wm.matched === 205 && /the newest 200 of 205/.test(wm.note) && wm.cards[0].id === 'm204');

    // ---- the join: a card keeps its sidecar's doors
    const side = [{ taskId: 'g1', title: 'gen a', assetPath: F('D:/ZOME/media/media_TEST/video/final/A.mp4') }, { taskId: 'g2', title: 'lost', assetPath: F('C:/x/y.png') }];
    const items = L.wallItems(side, w);
    eq('before the wall arrives the sidecar items are drawn as they are', L.wallItems(side, undefined).map(i => i.taskId), ['g1', 'g2']);
    const a = items.find(i => i.lib && i.lib.id === 'media_mp4_1');
    ok('‼️ a record is joined to the sidecar of its file (case folded) and keeps its taskId', a && a.taskId === 'g1' && a.title === 'gen a');
    const b = items.find(i => i.lib && i.lib.id === 'r2');
    ok('a record nothing here generated is a bare item: no taskId, source library', b && b.taskId === '' && b.source === 'library' && b.kind === 'image' && b.title === 'b.png');
    ok('a sidecar outside the view is not on the wall', !items.some(i => i.taskId === 'g2'));
    eq('cacheOf: one entry per meta whose file is still there', L.cacheOf([{ taskId: 't', title: '', ts: 3, assetFiles: [F('C:/gone.png'), F('C:/here.webm')] }, { taskId: 'u', title: 'x', ts: 1, assetFiles: [] }], p => p.endsWith('here.webm')), [{ file: F('C:/here.webm'), name: 'here.webm', kind: 'video', at: 3 }]);

    // ---- the op reads the same function the page does
    const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
    const { registerStudioLibraryOps } = require(path.join(ROOT, 'out/core/studioLibraryOps.js'));
    const reg = new BridgeRegistry();
    const seen = [];
    registerStudioLibraryOps(reg, { outputsDir: () => path.join(require('os').tmpdir(), 'af-x424-none'), read: async (view, c, start) => { seen.push([view, c.length, start]); return { cards: [] }; } });
    const r1 = await reg.dispatch('studio.library', { base: 'TEST', kind: 'video', autoStart: true });
    eq('studio.library passes the view and autoStart through', [r1.ok, seen[0]], [true, [{ base: 'TEST', kind: 'video' }, 0, true]]);
    const r2 = await reg.dispatch('studio.library', { stages: 'draft' });
    ok('…and refuses an impossible view before reading', r2.ok === false && /stages has no draft/.test(r2.error) && seen.length === 1);
    const r3 = await reg.dispatch('studio.library', {});
    eq('the page\'s default: never start a stopped engine', seen[1][2], false);
    ok('studio.library is listed', reg.catalog().some(o => o.op === 'studio.library'));

    // ---- the page component: the strip and the row say what the card and the wall are
    const win = { AFTip: { wrap: (t, h, b) => t + '<tip>' + h + '\n' + b + '</tip>' } };
    require('vm').runInNewContext(require('fs').readFileSync(path.join(ROOT, 'media/afStudioLibrary.js'), 'utf8'), { window: win });
    const SL = win.AFStudioLib;
    const st = SL.strip({ ...c, from: 'library' }, 'TEST');
    ok('the strip: stage, outcome with its reason, A-score, fill, chain', /final/.test(st) && /failed/.test(st) && /eller eridi/.test(st) && />A7</.test(st) && />75%</.test(st) && /C1 E0/.test(st) && /media_gif_1/.test(st));
    ok('a cache card says it has no record, and in which database', /no record/.test(SL.strip({ from: 'cache', stage: 'raw' }, 'TEST')) && /record in TEST/.test(SL.strip({ from: 'cache' }, 'TEST')));
    const hd = SL.head({ source: 'cache', note: wd.note, view: {}, resolved: { base: 'TEST', stages: [] } });
    ok('‼️ the row over a cache wall carries the cache badge and the note', /badge warn[^>]*>cache</.test(hd) && /not the database/.test(hd) && /id="sl-base"/.test(hd) && /id="sl-kind"/.test(hd) && /id="sl-success"/.test(hd));
    eq('a page with no reader draws no row', SL.head({ source: 'off' }), '');

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
