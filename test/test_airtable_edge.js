// Airtable Engine — adversarial edge-case sweep across every layer, plus
// network error paths against a mock engine that returns the real failure
// shapes (409 version_conflict, 404, 400 already_exists, malformed JSON,
// bare-array vs {items} listings, non-file paths). This is the "break it on
// purpose" suite — anything that throws where it should degrade, or degrades
// where it should throw, is a finding.
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const throws = async (n, fn, re) => {
    try { await fn(); fail++; console.log('  FAIL ' + n + ' (did not throw)'); }
    catch (e) { if (!re || re.test(e.message)) { pass++; } else { fail++; console.log(`  FAIL ${n} (wrong msg: ${e.message})`); } }
};

const OUT = path.resolve(__dirname, '../out/mcp/airtable');
const cfg = require(path.join(OUT, 'config.js'));
const engine = require(path.join(OUT, 'engine.js'));
const media = require(path.join(OUT, 'media.js'));
const sentence = require(path.join(OUT, 'sentence.js'));
const imagesize = require(path.join(OUT, 'imagesize.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-edge-'));

// ================================================================ config
(function config() {
    for (const bad of [null, undefined, 42, 'str', true, [1, 2]]) {
        ok('parseConfig(' + JSON.stringify(bad) + ') → empty', cfg.parseConfig(bad).databaseRoots.length === 0);
    }
    ok('legacy roots key', cfg.parseConfig({ roots: ['A'] }).databaseRoots[0] === 'A');
    ok('databaseRoots wins over legacy roots', cfg.parseConfig({ databaseRoots: ['NEW'], roots: ['OLD'] }).databaseRoots[0] === 'NEW');
    ok('roots trimmed', cfg.parseConfig({ databaseRoots: ['  X  '] }).databaseRoots[0] === 'X');
    ok('non-string roots filtered', cfg.parseConfig({ databaseRoots: ['ok', 42, null, '', '  ', {}] }).databaseRoots.join(',') === 'ok');
    for (const t of [-5, 0, '8000', NaN, null]) {
        ok('bad timeout ' + JSON.stringify(t) + ' → 8000', cfg.parseConfig({ requestTimeoutMs: t }).requestTimeoutMs === 8000);
    }
    ok('good timeout kept', cfg.parseConfig({ requestTimeoutMs: 5000 }).requestTimeoutMs === 5000);
    ok('non-string defaultInstance → empty', cfg.parseConfig({ defaultInstance: 42 }).defaultInstance === '');

    // BOM tolerance in parseJsonFile
    const bomFile = path.join(tmp, 'bom.json');
    fs.writeFileSync(bomFile, '﻿{"databaseRoots":["B"]}', 'utf8');
    ok('parseJsonFile strips BOM', cfg.parseConfig(cfg.parseJsonFile(bomFile)).databaseRoots[0] === 'B');
    // loadConfig with missing env / missing file / garbage file
    ok('loadConfig no env → empty', cfg.loadConfig({}).databaseRoots.length === 0);
    ok('loadConfig missing file → empty', cfg.loadConfig({ AIRTABLE_MCP_CONFIG: path.join(tmp, 'nope.json') }).databaseRoots.length === 0);
    const garbage = path.join(tmp, 'garbage.json');
    fs.writeFileSync(garbage, '{not valid json');
    ok('loadConfig garbage file → empty (no throw)', cfg.loadConfig({ AIRTABLE_MCP_CONFIG: garbage }).databaseRoots.length === 0);

    // stale-message guard: NOT_CONFIGURED must not name removed things
    ok('NOT_CONFIGURED does not mention removed agentFarm.airtable setting',
        !/agentFarm\.airtable/.test(cfg.NOT_CONFIGURED));
    ok('NOT_CONFIGURED does not call it a Toolbox "card"',
        !/Toolbox.{0,20}card/i.test(cfg.NOT_CONFIGURED));
})();

// ================================================================ discovery
(function discovery() {
    const root = path.join(tmp, 'droot');
    const mk = (name, obj) => {
        fs.mkdirSync(path.join(root, name), { recursive: true });
        fs.writeFileSync(path.join(root, name, 'config.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
    };
    mk('good', { server: { port: 3003, host: '127.0.0.1' } });
    mk('noport', { server: {} });
    mk('zeroport', { server: { port: 0 } });
    mk('negport', { server: { port: -1 } });
    mk('strport', { server: { port: '3003' } });   // numeric string tolerated
    mk('floatport', { server: { port: 3003.5 } });
    mk('malformed', '{ not json');
    fs.mkdirSync(path.join(root, 'noconfig'), { recursive: true });

    const found = engine.discoverInstances([root]);
    // integer>0 or a numeric string; no-port/zero/neg/float/malformed excluded
    ok('valid ports discovered, junk excluded', found.map(i => i.name).sort().join(',') === 'good,strport');
    ok('missing root skipped (no throw)', engine.discoverInstances([path.join(tmp, 'ghost')]).length === 0);

    // root that IS an instance
    const direct = engine.discoverInstances([path.join(root, 'good')]);
    ok('root that is an instance counts', direct.length === 1 && direct[0].name === 'good');
    // parent + instance dedup
    ok('parent+instance dedup', engine.discoverInstances([root, path.join(root, 'good')])
        .filter(i => i.name === 'good').length === 1);

    // ENV TOKEN in a root — the page expands these; the MCP side must too, or
    // a portable config works in the UI but fails for agents.
    const envRoot = path.join(tmp, 'envroot');
    fs.mkdirSync(path.join(envRoot, 'inst'), { recursive: true });
    fs.writeFileSync(path.join(envRoot, 'inst', 'config.json'), JSON.stringify({ server: { port: 4100 } }));
    process.env.AF_EDGE_ROOT = envRoot;
    const viaToken = engine.discoverInstances(['${env:AF_EDGE_ROOT}']);
    ok('discovery expands ${env:VAR} tokens in roots', viaToken.length === 1 && viaToken[0].name === 'inst');
    const viaPct = engine.discoverInstances(['%AF_EDGE_ROOT%']);
    ok('discovery expands %VAR% tokens in roots', viaPct.length === 1);
    delete process.env.AF_EDGE_ROOT;
})();

// ================================================================ searchRecords
(function search() {
    const items = [
        { id: 'a', topic: 'Cell (biology).', tags: ['bio', 'cell'], content: 'x*y+z' },
        { id: 'b', topic: 'Chem', provenance: { generation_prompt: 'a.b.c pattern' }, tags: ['chem'] },
        { id: 'c', tags: [1, 2, null], topic: null, content: undefined }  // hostile field types
    ];
    ok('regex metachars treated as literal substring', engine.searchRecords(items, 'x*y').length === 1);
    ok('dot metachar literal', engine.searchRecords(items, 'a.b.c')[0].id === 'b');
    ok('paren in query literal (no crash)', engine.searchRecords(items, '(biology)').length === 1);
    ok('whitespace-only query → all', engine.searchRecords(items, '   ').length === 3);
    ok('hostile null/number fields do not crash', engine.searchRecords(items, 'cell').length === 1);
    ok('tags must all match', engine.searchRecords(items, undefined, ['bio', 'cell']).length === 1);
    ok('non-string tags coerced for match', engine.searchRecords(items, undefined, ['1']).length === 1);
    ok('empty tag entries ignored', engine.searchRecords(items, undefined, ['', '  ']).length === 3);
    // summarize hostile
    const sm = engine.summarizeRecord({ id: 5, tags: 'notarray', media: { file_path: 42 } });
    ok('summarize coerces id to string, drops bad tags/file_path', sm.id === '5' && sm.tags === undefined && sm.file_path === undefined);
})();

// ================================================================ imagesize
(function images() {
    ok('truncated buffer → null', imagesize.imageSize(Buffer.alloc(10)) === null);
    ok('non-image → null', imagesize.imageSize(Buffer.from('hello world this is not an image!!')) === null);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 1, 44, 0, 0, 0, 200, 8, 6, 0, 0, 0])]);
    const pd = imagesize.imageSize(png);
    ok('PNG dims', pd && pd.width === 300 && pd.height === 200);
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x40, 0x01, 0x20, 0x00]), Buffer.alloc(20)]);
    const gd = imagesize.imageSize(gif);
    ok('GIF dims (LE)', gd && gd.width === 0x0140 && gd.height === 0x0020);
    // corrupt JPEG (SOI then junk, no SOF)
    ok('JPEG without SOF → null', imagesize.imageSize(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(40, 0x11)])) === null);
})();

// ================================================================ media record assembly
(function mediaRec() {
    const fm = { fileFormat: 'png', mediaType: 'image', fileSizeBytes: 10, width: 4, height: 4, fileName: 'f.png' };
    // template must not leak identity/tech; must not overwrite populated seo.keywords
    const rec = media.buildMediaRecord({
        id: 'ID1', absPath: 'C:\\a\\b\\f.png', fileMeta: fm, status: 'published',
        tags: ['t1'],
        templateItem: { id: 'LEAK', version: 99, seo: { keywords: ['pre'] }, media: { file_path: 'LEAK', width: 999 }, style: 'cine' }
    });
    ok('template id/version stripped', rec.id === 'ID1' && rec.version === 1);
    ok('template media tech stripped', rec.media.file_path === 'C:/a/b/f.png' && rec.media.width === 4);
    ok('backslashes → forward slashes', !String(rec.media.file_path).includes('\\'));
    ok('template style kept', rec.style === 'cine');
    ok('populated seo.keywords NOT overwritten by tags', rec.seo.keywords.join(',') === 'pre');
    ok('status published sets published_at', typeof rec.published_at === 'string' && rec.published_at.length > 0);

    const rec2 = media.buildMediaRecord({ id: 'ID2', absPath: '/x/y.png', fileMeta: fm });
    ok('no tags → seo.keywords stays empty', rec2.seo.keywords.length === 0);
    ok('content defaults to filename', rec2.content === 'f.png');
    ok('draft → published_at empty', rec2.published_at === '');

    // deepMerge semantics
    const tgt = { a: { b: 1, c: 2 }, arr: [1, 2] };
    media.deepMerge(tgt, { a: { c: 9, d: 3 }, arr: [7], nu: null, un: undefined });
    ok('deepMerge merges nested objects', tgt.a.b === 1 && tgt.a.c === 9 && tgt.a.d === 3);
    ok('deepMerge arrays REPLACE not concat', tgt.arr.length === 1 && tgt.arr[0] === 7);
    ok('deepMerge keeps null, skips undefined', tgt.nu === null && !('un' in tgt));

    // sentence word count edge
    ok('sentence empty content → 0 words', sentence.buildSentenceRecord({ id: 's', content: '   ' }).word_count === 0);
    ok('sentence multi-space words', sentence.buildSentenceRecord({ id: 's', content: 'a   b\tc' }).word_count === 3);
})();

// ================================================================ network error paths (mock engine)
const state = { records: {}, files: {} };
let PORT = 0;
const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
        const j = body ? JSON.parse(body) : {};
        if (u.pathname === '/api/config') return send(200, { server: { port: PORT }, ui: { branding: { title: 'Mock' } } });
        if (u.pathname === '/api/db/media' && req.method === 'GET') return send(200, [{ id: 'exist', media: { file_path: 'C:/lib/known.png' } }]);
        if (u.pathname === '/api/db/media/missing' && req.method === 'GET') return send(404, { error: 'not_found' });
        if (u.pathname === '/api/db/media/conflictrec' && req.method === 'GET') return send(200, { item: { id: 'conflictrec' }, version: 3 });
        if (u.pathname === '/api/db/media/conflictrec' && req.method === 'PUT') return send(409, { error: 'version_conflict' });
        if (u.pathname === '/api/media/next-id') return send(200, { nextId: 'media_png_20260722_0001' });
        if (u.pathname === '/api/media/next-id-empty') return send(200, {});
        if (u.pathname === '/api/file' && req.method === 'POST') {
            if (state.files[j.rel]) return send(400, { error: 'already_exists' });
            state.files[j.rel] = j.item; return send(200, { ok: true, version: 1 });
        }
        if (u.pathname === '/api/media/templates/GHOST') return send(200, {}); // no item body
        if (u.pathname === '/api/malformed') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{ broken'); }
        send(404, { error: 'route_not_found ' + u.pathname });
    });
});

async function network() {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    PORT = server.address().port;
    const inst = { name: 'mock', dir: 'C:/x/mock', host: '127.0.0.1', port: PORT, configPath: 'x' };
    const client = new engine.EngineClient(inst, 4000);

    // 404 / 409 / 400 surfacing as thrown errors with the engine's message
    await throws('getRecord 404 throws with detail', () => client.getRecord('media', 'missing'), /HTTP 404|not_found/);
    await throws('updateRecord version_conflict surfaces', () =>
        engine.updateRecord(client, 'media', 'conflictrec', { status: 'x' }), /409|version_conflict/);

    // saveMedia: file must exist AND be a file (not a dir)
    await throws('saveMedia missing file', () => engine.saveMedia(client, { file: path.join(tmp, 'ghost.png'), topic: 't' }), /not found/i);
    await throws('saveMedia rejects a directory path', () => engine.saveMedia(client, { file: tmp, topic: 't' }), /file|directory|not a/i);

    // engine returns no nextId
    const clientEmpty = new engine.EngineClient(inst, 4000);
    clientEmpty.nextMediaId = () => Promise.resolve({}); // force empty
    const realFile = path.join(tmp, 'real.png');
    fs.writeFileSync(realFile, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 0, 4, 0, 0, 0, 4, 8, 6, 0, 0, 0])]));
    await throws('saveMedia no nextId throws', () => engine.saveMedia(clientEmpty, { file: realFile, topic: 't' }), /nextId/);

    // template with no item body
    const clientTpl = new engine.EngineClient(inst, 4000);
    await throws('saveMedia template with no item body', () => engine.saveMedia(clientTpl, { file: realFile, topic: 't', template: 'GHOST' }), /template/i);

    // scanFolder classifies against a bare-array listing
    const scanDir = path.join(tmp, 'scan');
    fs.mkdirSync(scanDir, { recursive: true });
    fs.writeFileSync(path.join(scanDir, 'known.png'), 'x');   // will NOT match (different abs path than C:/lib/known.png)
    fs.writeFileSync(path.join(scanDir, 'fresh.jpg'), 'y');
    const scan = await engine.scanFolder(client, scanDir, undefined, false);
    ok('scanFolder handles bare-array listing (all new here)', scan.newFiles.length === 2 && scan.known.length === 0);
    await throws('scanFolder missing folder throws', () => engine.scanFolder(client, path.join(tmp, 'noscan')), /not found/i);

    // resolveInstance guidance messages must not name removed settings
    const oneRoot = { databaseRoots: [path.dirname(inst.dir)], mediaRoots: [], defaultInstance: '', defaultLang: '', requestTimeoutMs: 4000 };
    // (no real instance dir here) -> "no instances" path
    await throws('resolveInstance no-instances message', () => engine.resolveInstance({ ...oneRoot, databaseRoots: [path.join(tmp, 'empty-root')] }), /No engine instances|config\.json/);

    // guidance messages must not name removed settings
    ok('resolveInstance messages carry no removed agentFarm.airtable setting',
        !/agentFarm\.airtable/.test(engine.resolveInstance.toString()));

    await new Promise(r => server.close(r));
    server.unref();
}

network().then(() => {
    console.log(`${pass} passed, ${fail} failed`);
    // Set exitCode and let the loop drain naturally — forcing process.exit()
    // while libuv handles are still closing crashes on this Node/Windows build.
    process.exitCode = fail ? 1 : 0;
}).catch(e => { console.error(e); console.log(`${pass} passed, ${fail + 1} failed (crash)`); process.exitCode = 1; });
