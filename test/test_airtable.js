// Airtable engine module (compiled out/mcp/airtable/* + out/core/airtable*).
// Pure unit tests — NO live engine required, NO writes to real data. The live
// end-to-end (save → search → delete against a running instance) lives in the
// manual smoke script test/airtable_smoke.mjs.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const R = (p) => require(path.join(__dirname, '..', 'out', p));

// ---------- imagesize: dependency-free header parsing ----------
{
    const { imageSize } = R('mcp/airtable/imagesize.js');

    const png = Buffer.alloc(24);
    png[0] = 0x89; png[1] = 0x50; png[2] = 0x4e; png[3] = 0x47;
    png.writeUInt32BE(1024, 16); png.writeUInt32BE(768, 20);
    ok('PNG dims', (() => { const d = imageSize(png); return d && d.type === 'png' && d.width === 1024 && d.height === 768; })());

    const gif = Buffer.alloc(24);
    gif.write('GIF89a', 0, 'ascii'); gif.writeUInt16LE(320, 6); gif.writeUInt16LE(240, 8);
    ok('GIF dims', (() => { const d = imageSize(gif); return d && d.width === 320 && d.height === 240; })());

    const bmp = Buffer.alloc(32);
    bmp[0] = 0x42; bmp[1] = 0x4d; bmp.writeInt32LE(640, 18); bmp.writeInt32LE(-480, 22);
    ok('BMP dims (top-down negative height)', (() => { const d = imageSize(bmp); return d && d.width === 640 && d.height === 480; })());

    const jpg = Buffer.alloc(24);
    [0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x04, 0x00].forEach((b, i) => { jpg[i] = b; });
    ok('JPEG dims via SOF0', (() => { const d = imageSize(jpg); return d && d.width === 1024 && d.height === 512; })());

    const webp = Buffer.alloc(32);
    webp.write('RIFF', 0, 'ascii'); webp.write('WEBP', 8, 'ascii'); webp.write('VP8X', 12, 'ascii');
    const w = 1024 - 1, h = 768 - 1;
    webp[24] = w & 0xff; webp[25] = (w >> 8) & 0xff; webp[26] = (w >> 16) & 0xff;
    webp[27] = h & 0xff; webp[28] = (h >> 8) & 0xff; webp[29] = (h >> 16) & 0xff;
    ok('WebP VP8X canvas dims', (() => { const d = imageSize(webp); return d && d.width === 1024 && d.height === 768; })());

    ok('unrecognised buffer -> null', imageSize(Buffer.alloc(24)) === null);
}

// ---------- media record building (shape matches a real panel record) ----------
{
    const { buildMediaRecord, emptyMediaSkeleton } = R('mcp/airtable/media.js');
    const rec = buildMediaRecord({
        id: 'media_png_20260721_0001', lang: 'TR', status: 'quarantine',
        absPath: 'D:\\zome\\media\\media_stem\\image\\raw\\x.png',
        fileMeta: { fileFormat: 'png', mediaType: 'image', fileSizeBytes: 123, width: 1024, height: 768, fileName: 'x.png' },
        topic: 'Test konu', tags: ['ai', 'lab'],
        provenance: { model: 'flux', seed: 7, generation_prompt: 'a lab' },
        failure: { is_failed: true, salvageable: true },
    });
    ok('media id + type', rec.id === 'media_png_20260721_0001' && rec.type === 'media');
    ok('file_path normalised to forward slashes', rec.media.file_path === 'D:/zome/media/media_stem/image/raw/x.png');
    ok('media dims from fileMeta', rec.media.width === 1024 && rec.media.height === 768 && rec.media.file_format === 'png');
    ok('content defaults to filename', rec.content === 'x.png');
    ok('topic applied', rec.topic === 'Test konu');
    ok('tags copied into seo.keywords when empty', JSON.stringify(rec.seo.keywords) === JSON.stringify(['ai', 'lab']));
    ok('provenance deep-merged', rec.provenance.model === 'flux' && rec.provenance.seed === 7 && rec.provenance.generation_prompt === 'a lab');
    ok('failure deep-merged', rec.failure.is_failed === true && rec.failure.salvageable === true);
    ok('status honoured', rec.status === 'quarantine');
    ok('version starts at 1', rec.version === 1);
    ok('relations section present (matches real record)', !!rec.relations && Array.isArray(rec.relations.variants));

    const skel = emptyMediaSkeleton();
    const needSections = ['id', 'media', 'provenance', 'failure', 'seo', 'relations', 'analytics', 'workflow', 'completed_sections', 'localization'];
    ok('skeleton has every top-level section', needSections.every((k) => k in skel));
    ok('empty skeleton default status draft', skel.status === 'draft');
}

// ---------- sentence (knowledge atom) record building ----------
{
    const { buildSentenceRecord } = R('mcp/airtable/sentence.js');
    const s = buildSentenceRecord({ id: 'sent_20260721_0001', content: 'Bir iki üç dört beş.', topic: 'Konu', domain: 'Bilim', tags: ['x'] });
    ok('sentence id + type', s.id === 'sent_20260721_0001' && s.type === 'sentence');
    ok('word_count computed', s.word_count === 5);
    ok('taxonomy + topic applied', s.topic === 'Konu' && s.domain === 'Bilim');
    ok('semantic + workflow sections present', !!s.semantic && !!s.workflow && !!s.workflow.completed_sections);
    ok('tags applied', JSON.stringify(s.tags) === JSON.stringify(['x']));
}

// ---------- ~/.claude.json upsert (pure, safe) ----------
{
    const { upsertServer } = R('core/airtableRegisterCore.js');
    const want = { command: 'node', args: ['/ext/out/mcp/airtable/index.js'], env: { AIRTABLE_MCP_CONFIG: '/gs/airtable-config.json' } };

    let r = upsertServer({}, 'airtable', want);
    ok('added into empty config', r.outcome === 'added' && r.json.mcpServers.airtable.command === 'node');
    r = upsertServer(r.json, 'airtable', want);
    ok('unchanged when identical', r.outcome === 'unchanged');
    r = upsertServer({ mcpServers: { airtable: { command: 'node', args: ['/old.js'], env: {} }, obsidian: { url: 'http://x' } } }, 'airtable', want);
    ok('updated when different', r.outcome === 'updated' && r.json.mcpServers.airtable.args[0] === '/ext/out/mcp/airtable/index.js');
    ok('other servers preserved', r.json.mcpServers.obsidian.url === 'http://x');
}

// ---------- bridge ops (§19.C): catalogued + dispatch against a fixture registry ----------
(async () => {
    const { BridgeRegistry } = R('core/bridge.js');
    const { registerAirtableOps } = R('core/airtableBridge.js');

    const calls = [];
    const stub = {
        cfg: { defaultInstance: 'stem' },
        instances: async () => [{ name: 'stem', port: 3003, live: true, title: 'T', root: 'r' }],
        resolveInstance: async (n) => ({ name: n || 'stem', port: 3003, live: true }),
        stats: async () => ({ media: 5, sentences: 770 }),
        search: async (i, a) => ({ instance: 'stem', collection: a.collection || 'media', items: [] }),
        getItem: async () => ({ id: 'media_x', topic: 'T' }),
        mediaSave: async (i, a) => { calls.push(a.file_path); return { ok: true, id: 'media_new' }; },
        mediaUpdate: async () => ({ ok: true, id: 'media_x', version: 2 }),
        knowledgeSave: async () => ({ ok: true, id: 'sent_new' }),
        noteSave: async () => ({ ok: true, path: 'p' }),
        mediaScanFolder: async () => ({ instance: 'stem', items: [{ file_path: 'a.png', in_db: false }, { file_path: 'b.png', in_db: true }] }),
    };
    const reg = new BridgeRegistry();
    registerAirtableOps(reg, { getRegistry: () => stub });

    const cat = reg.catalog();
    const wantOps = ['airtable.instances', 'airtable.stats', 'airtable.search', 'airtable.get', 'airtable.mediaSave', 'airtable.mediaUpdate', 'airtable.knowledgeSave', 'airtable.noteSave', 'airtable.scanFolder', 'airtable.ingestFolder'];
    ok('all airtable ops catalogued with a describe', wantOps.every((op) => cat.some((c) => c.op === op && c.describe.length > 0)));

    let d = await reg.dispatch('airtable.instances', {});
    ok('airtable.instances dispatches', d.ok && d.result[0].name === 'stem');

    d = await reg.dispatch('airtable.mediaSave', {});
    ok('airtable.mediaSave requires file_path', !d.ok && /file_path/.test(d.error));

    d = await reg.dispatch('airtable.mediaSave', { file_path: 'x.png', topic: 'y' });
    ok('airtable.mediaSave dispatches', d.ok && d.result.id === 'media_new');

    d = await reg.dispatch('airtable.mediaUpdate', { id: 'media_x' });
    ok('airtable.mediaUpdate requires patch', !d.ok && /patch/.test(d.error));

    d = await reg.dispatch('airtable.knowledgeSave', {});
    ok('airtable.knowledgeSave requires content', !d.ok && /content/.test(d.error));

    d = await reg.dispatch('airtable.ingestFolder', { folder: 'F' });
    ok('airtable.ingestFolder saves only NEW files', d.ok && d.result.saved === 1 && d.result.new_files === 1 && calls.includes('a.png') && !calls.includes('b.png'));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
