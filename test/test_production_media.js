// Wave A tests: production manifest + external asset registry + ingest scan.
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = require('path').resolve(__dirname, '../out/core');
const prod = require(path.join(OUT, 'production.js'));
const media = require(path.join(OUT, 'media.js'));
const ingest = require(path.join(OUT, 'ingest.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wavea-'));
const agentDir = path.join(tmp, 'agent1'); fs.mkdirSync(agentDir);
const outputsDir = path.join(tmp, 'outputs'); fs.mkdirSync(outputsDir);
const ingestDir = path.join(tmp, 'downloads'); fs.mkdirSync(ingestDir);

(async () => {
    // ---------- production.ts ----------
    const p = prod.newProduction('Tanıtım Filmi!', ['Açılış', 'Ürün', 'Kapanış']);
    // X-9: the id is ASCII because it becomes a folder name and a key — but
    // ASCII by FOLDING, not by deletion. This used to read `tan-t-m-filmi`:
    // every letter the alphabet does not share was turned into a separator, so
    // a Turkish title arrived as a row of dashes. `slugify` (core/util.ts) maps
    // the six Turkish letters and decomposes the rest, so the word survives.
    eq('slug id', p.id, 'tanitim-filmi');
    eq('scene ids', p.scenes.map(s => s.id), ['s01', 's02', 's03']);
    eq('scene default status', p.scenes[0].status, 'draft');

    prod.writeProduction(path.join(agentDir, 'production.json'), p);
    const read = prod.readProduction(agentDir);
    eq('round-trip', read.title, 'Tanıtım Filmi!');
    eq('round-trip scenes', read.scenes.length, 3);

    ok('setSceneStatus ok', prod.setSceneStatus(read, 's02', 'review') === true);
    ok('setSceneStatus unknown scene', prod.setSceneStatus(read, 'sXX', 'review') === false);
    eq('status applied', read.scenes[1].status, 'review');

    // corrupt / bad-shape manifests fail soft
    fs.writeFileSync(path.join(agentDir, 'production.json'), '{not json', 'utf8');
    eq('corrupt manifest → undefined', prod.readProduction(agentDir), undefined);
    fs.writeFileSync(path.join(agentDir, 'production.json'),
        JSON.stringify({ id: 'p1', title: 'X', scenes: [{ id: 's1', title: 'A', status: 'BOGUS' }, { bad: true }] }), 'utf8');
    const sanitized = prod.readProduction(agentDir);
    eq('bogus status → draft', sanitized.scenes[0].status, 'draft');
    eq('bad scene dropped', sanitized.scenes.length, 1);
    prod.writeProduction(path.join(agentDir, 'production.json'), p); // restore

    const disc = prod.discoverProductions([
        { id: 'a1', name: 'agent1', dir: agentDir },
        { id: 'a2', name: 'agent2', dir: path.join(tmp, 'nope') }
    ]);
    eq('discover finds one', disc.length, 1);
    eq('discover carries agent', disc[0].agentName, 'agent1');

    // ---------- media.ts: assetKind + register + update + backward compat ----------
    eq('assetKind image', media.assetKind('x/y/a.PNG'), 'image');
    eq('assetKind video', media.assetKind('a.mp4'), 'video');
    eq('assetKind audio', media.assetKind('a.wav'), 'audio');
    eq('assetKind other', media.assetKind('a.txt'), 'file');

    // old meta without new fields still reads (backward compat)
    fs.writeFileSync(path.join(outputsDir, 'old1.media.json'), JSON.stringify({
        taskId: 'old1', title: 'eski', model: 'fal-ai/flux', input: '{}',
        assetFiles: [path.join(outputsDir, 'old1-1.png')], estCost: 0.02, ts: Date.now() - 1000
    }), 'utf8');
    fs.writeFileSync(path.join(outputsDir, 'old1-1.png'), 'png', 'utf8');
    let metas = media.readMediaMetas(outputsDir);
    eq('old meta readable', metas.length, 1);
    eq('old meta has no source', metas[0].source, undefined);

    const extFile = path.join(ingestDir, 'clip one.mp4');
    fs.writeFileSync(extFile, 'x'.repeat(100), 'utf8');
    const meta1 = media.registerExternalAsset(outputsDir, extFile, { projectId: p.id, sceneId: 's01', source: 'external:manual' });
    ok('register returns meta', !!meta1 && meta1.model === 'external');
    eq('register scene link', [meta1.projectId, meta1.sceneId], [p.id, 's01']);
    const dup = media.registerExternalAsset(outputsDir, extFile.toUpperCase(), {});
    eq('dedup (case-insensitive)', dup, undefined);

    const upd = media.updateMediaMeta(outputsDir, meta1.taskId, { sceneId: 's03' });
    eq('updateMediaMeta patch', upd.sceneId, 's03');
    const cleared = media.updateMediaMeta(outputsDir, meta1.taskId, { projectId: undefined, sceneId: undefined });
    eq('updateMediaMeta clear', [cleared.projectId, cleared.sceneId], [undefined, undefined]);
    eq('update unknown id', media.updateMediaMeta(outputsDir, 'nope', {}), undefined);

    // ---------- sceneMatrix ----------
    media.updateMediaMeta(outputsDir, meta1.taskId, { projectId: p.id, sceneId: 's01' });
    fs.writeFileSync(path.join(outputsDir, 'm2.media.json'), JSON.stringify({
        taskId: 'm2', title: 'görsel', model: 'fal-ai/flux', input: '{}',
        assetFiles: [path.join(outputsDir, 'old1-1.png')], estCost: 0, ts: Date.now(),
        projectId: p.id
    }), 'utf8');
    fs.writeFileSync(path.join(outputsDir, 'm3.media.json'), JSON.stringify({
        taskId: 'm3', title: 'başka proje', model: 'fal-ai/flux', input: '{}',
        assetFiles: ['a.png'], estCost: 0, ts: Date.now(), projectId: 'OTHER'
    }), 'utf8');
    metas = media.readMediaMetas(outputsDir);
    const matrix = prod.sceneMatrix(p, metas);
    eq('matrix rows: 3 scenes + unassigned', matrix.length, 4);
    eq('s01 video count', matrix.find(r => r.sceneId === 's01').counts.video, 1);
    eq('unassigned image count', matrix[3].counts.image, 1);
    eq('other project excluded', matrix.reduce((a, r) => a + r.total, 0), 2);

    // ---------- ingest.ts scan ----------
    const fresh = path.join(ingestDir, 'yeni.png');
    fs.writeFileSync(fresh, 'data', 'utf8');
    const old = path.join(ingestDir, 'eski.png');
    fs.writeFileSync(old, 'data', 'utf8');
    const past = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    fs.utimesSync(old, past, past);
    fs.writeFileSync(path.join(ingestDir, 'not-media.txt'), 'x', 'utf8');
    const growing = path.join(ingestDir, 'buyuyor.mp4');
    fs.writeFileSync(growing, 'aaaa', 'utf8');
    setTimeout(() => { try { fs.appendFileSync(growing, 'bbbb'); } catch { } }, 500);

    const res = await ingest.scanIngestFolders(outputsDir,
        [{ path: ingestDir, label: 'dl', projectId: p.id }]);
    eq('scan registers only fresh media', res.registered.map(m => m.title).sort(), ['yeni.png']);
    eq('scan source label', res.registered[0].source, 'external:dl');
    eq('scan folder projectId', res.registered[0].projectId, p.id);
    eq('growing file pending', res.pending.length, 1);
    // second scan: growing file now stable → registered; fresh one deduped
    const res2 = await ingest.scanIngestFolders(outputsDir, [{ path: ingestDir, label: 'dl' }]);
    eq('second scan registers stabilized file', res2.registered.map(m => m.title), ['buyuyor.mp4']);
    const res3 = await ingest.scanIngestFolders(outputsDir, [{ path: ingestDir }]);
    eq('third scan quiet', [res3.registered.length, res3.pending.length], [0, 0]);
    // bad folder never throws
    const res4 = await ingest.scanIngestFolders(outputsDir, [{ path: path.join(tmp, 'yok') }]);
    eq('missing folder tolerated', res4.registered.length, 0);

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
