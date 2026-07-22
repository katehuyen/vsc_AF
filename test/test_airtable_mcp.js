// Airtable Engine MCP module — pure-node tests over the compiled out/mcp/airtable:
// config parsing, instance discovery on a fixture tree, search filtering, image
// header parsing, record assembly (media + sentence), and the full save/scan/
// update flows against a MOCK engine server speaking the real API contract
// (POST /api/file creates, PUT /api/db updates with expectedVersion, next-id).
// Finally the stdio JSON-RPC server itself is spawned and spoken to.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const readline = require('readline');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.resolve(__dirname, '../out/mcp/airtable');
const cfgMod = require(path.join(OUT, 'config.js'));
const engine = require(path.join(OUT, 'engine.js'));
const media = require(path.join(OUT, 'media.js'));
const sentence = require(path.join(OUT, 'sentence.js'));
const imagesize = require(path.join(OUT, 'imagesize.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-airtable-'));

// ---------------------------------------------------------------- config

const parsed = cfgMod.parseConfig({ roots: ['W:/x'], defaultInstance: ' stem ', requestTimeoutMs: 0 });
ok('legacy "roots" key still reads', parsed.databaseRoots.length === 1 && parsed.databaseRoots[0] === 'W:/x');
ok('defaultInstance trimmed', parsed.defaultInstance === 'stem');
ok('bad timeout falls back', parsed.requestTimeoutMs === 8000);
ok('garbage config → empty', cfgMod.parseConfig('nope').databaseRoots.length === 0);
ok('missing env → empty config', cfgMod.loadConfig({}).databaseRoots.length === 0);

// ---------------------------------------------------------------- discovery fixture

const rootA = path.join(tmp, 'dbroot');
for (const [name, cfg] of [
    ['stem', { server: { port: 43991, host: '127.0.0.1' } }],
    ['draft', { server: { port: 43992 } }],
    ['broken', { server: {} }]
]) {
    fs.mkdirSync(path.join(rootA, name), { recursive: true });
    fs.writeFileSync(path.join(rootA, name, 'config.json'), JSON.stringify(cfg));
}
fs.mkdirSync(path.join(rootA, 'notaninstance'));

const found = engine.discoverInstances([rootA, path.join(tmp, 'missing-root')]);
ok('discovers instances with a valid port only', found.length === 2
    && found.map(i => i.name).join(',') === 'draft,stem');
ok('host defaults to localhost', found.find(i => i.name === 'draft').host === 'localhost');
ok('explicit host respected', found.find(i => i.name === 'stem').host === '127.0.0.1');

// the user may pick the instance folder ITSELF instead of its parent — both work
const direct = engine.discoverInstances([path.join(rootA, 'stem')]);
ok('a root that IS an instance counts as one', direct.length === 1 && direct[0].name === 'stem');
const both = engine.discoverInstances([rootA, path.join(rootA, 'stem')]);
ok('parent + instance overlap dedupes', both.filter(i => i.name === 'stem').length === 1);

// ---------------------------------------------------------------- search

const items = [
    { id: 'm1', topic: 'Mitoz bölünme', tags: ['biology', 'cell'], content: 'anafaz görseli' },
    { id: 'm2', topic: 'Fotosentez', tags: ['biology'], provenance: { generation_prompt: 'chloroplast render' } },
    { id: 'm3', topic: 'Pazarlama', tags: ['marketing'] }
];
ok('query matches topic case-insensitively', engine.searchRecords(items, 'mitoz').length === 1);
ok('query matches generation prompt', engine.searchRecords(items, 'chloroplast')[0].id === 'm2');
ok('tags must ALL match', engine.searchRecords(items, undefined, ['biology', 'cell']).length === 1);
ok('tag + query combine', engine.searchRecords(items, 'foto', ['biology'])[0].id === 'm2');
ok('no filters → all', engine.searchRecords(items).length === 3);
const summary = engine.summarizeRecord({ id: 'x', topic: 't', tags: [], media: { file_path: 'D:/a.png' } });
ok('summary keeps file_path, drops empty tags', summary.file_path === 'D:/a.png' && summary.tags === undefined);

// ---------------------------------------------------------------- image + record assembly

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
    Buffer.from([0, 0, 0, 100, 0, 0, 0, 50, 8, 6, 0, 0, 0])
]);
const dims = imagesize.imageSize(png);
ok('png header parsed', dims && dims.width === 100 && dims.height === 50);
ok('media type from extension', media.guessMediaType('png') === 'image' && media.guessMediaType('mp4') === 'video');

const pngFile = path.join(tmp, 'sample.png');
fs.writeFileSync(pngFile, png);

const skeleton = media.emptyMediaSkeleton();
ok('skeleton has the deep sections', skeleton.provenance && skeleton.workflow && skeleton.completed_sections);

const rec = media.buildMediaRecord({
    id: 'media_png_20260722_0001', absPath: pngFile,
    fileMeta: { fileFormat: 'png', mediaType: 'image', fileSizeBytes: 42, width: 100, height: 50, fileName: 'sample.png' },
    topic: 'Test topic', tags: ['a', 'b'], status: 'quarantine',
    provenance: { model: 'flux', origin: 'ai_generated' },
    templateItem: { id: 'SHOULD-NOT-LEAK', style: 'cinematic', media: { file_path: 'SHOULD-NOT-LEAK' } }
});
ok('identity set', rec.id === 'media_png_20260722_0001' && rec.type === 'media' && rec.status === 'quarantine');
ok('file path forward-slashed', String(rec.media.file_path).includes('/') && !String(rec.media.file_path).includes('\\'));
ok('template merges style but not identity/tech', rec.style === 'cinematic'
    && rec.media.file_path !== 'SHOULD-NOT-LEAK' && rec.id !== 'SHOULD-NOT-LEAK');
ok('tags copied to empty seo.keywords', rec.seo.keywords.join(',') === 'a,b');
ok('provenance merged', rec.provenance.model === 'flux' && rec.provenance.origin === 'ai_generated');

const sent = sentence.buildSentenceRecord({ id: 'sent_20260722_0001', content: 'Su yüz derecede kaynar.', tags: ['physics'] });
ok('sentence word count', sent.word_count === 4);
ok('sentence identity', sent.type === 'sentence' && sent.id === 'sent_20260722_0001');

// ---------------------------------------------------------------- mock engine server

const state = { files: {}, records: {} };
const mediaListing = [
    { id: 'media_old_1', media: { file_path: pngFile.replace(/\\/g, '/') }, topic: 'already recorded' }
];
const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
        const json = body ? JSON.parse(body) : {};
        if (u.pathname === '/api/config') { return send(200, { server: { port: PORT }, ui: { branding: { title: 'Mock Engine' } } }); }
        if (u.pathname === '/api/stats') { return send(200, { lessons: 1, sentences: 2, media: mediaListing.length }); }
        // the LIVE engine answers a BARE ARRAY here (verified 2026-07-22) — mock matches
        if (u.pathname === '/api/db/media' && req.method === 'GET') { return send(200, mediaListing); }
        if (u.pathname === '/api/db/media/media_old_1' && req.method === 'GET') {
            return send(200, { item: state.records.media_old_1 ?? mediaListing[0], version: 3, mtime: 111 });
        }
        if (u.pathname === '/api/db/media/media_old_1' && req.method === 'PUT') {
            if (json.expectedVersion !== 3) { return send(409, { error: 'version_conflict' }); }
            state.records.media_old_1 = json.item;
            return send(200, { ok: true, version: 4 });
        }
        if (u.pathname === '/api/media/next-id') { return send(200, { ok: true, nextSeq: 7, nextId: `media_${u.searchParams.get('fileFormat')}_${u.searchParams.get('date')}_0007` }); }
        if (u.pathname === '/api/collections/sentences/next-id') { return send(200, { ok: true, nextId: `sent_${u.searchParams.get('date')}_0007` }); }
        if (u.pathname === '/api/file' && req.method === 'POST') {
            if (state.files[json.rel]) { return send(400, { error: 'already_exists' }); }
            state.files[json.rel] = json.item;
            return send(200, { ok: true, item: json.item, version: 1, mtime: 1 });
        }
        if (u.pathname === '/api/media/templates/TPL' && req.method === 'GET') {
            return send(200, { item: { style: 'marketing', usage_context: 'social' }, rel: 'x' });
        }
        if (u.pathname === '/api/notes/save' && req.method === 'POST') {
            state.note = json;
            return send(200, { ok: true });
        }
        send(404, { error: 'not_found ' + u.pathname });
    });
});

let PORT = 0;

async function withServer(fn) {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    PORT = server.address().port;
    try { await fn(); } finally { server.close(); }
}

async function networkTests() {
    // discovery root whose instance points at the mock server
    const rootB = path.join(tmp, 'liveroot');
    fs.mkdirSync(path.join(rootB, 'mock'), { recursive: true });
    fs.writeFileSync(path.join(rootB, 'mock', 'config.json'),
        JSON.stringify({ server: { port: PORT, host: '127.0.0.1' } }));
    const config = { databaseRoots: [rootB], mediaRoots: [], defaultInstance: '', defaultLang: '', requestTimeoutMs: 4000 };

    const live = await engine.checkInstances(engine.discoverInstances([rootB]));
    ok('health check sees the mock engine', live.length === 1 && live[0].alive && live[0].title === 'Mock Engine');

    const client = await engine.resolveInstance(config, undefined);
    ok('single live instance auto-resolves', client.instance.name === 'mock');

    let err = '';
    try { await engine.resolveInstance(config, 'yok'); } catch (e) { err = e.message; }
    ok('unknown instance error names the known ones', err.includes('yok') && err.includes('mock'));

    // save media end-to-end (with template)
    const saved = await engine.saveMedia(client, {
        file: pngFile, topic: 'Mock save', tags: ['t1'], template: 'TPL'
    });
    ok('media id from engine next-id', /^media_png_\d{8}_0007$/.test(saved.id));
    ok('rel follows db/media/YYYY-MM/', /^db\/media\/\d{4}-\d{2}\/media_png_\d{8}_0007\.json$/.test(saved.rel));
    ok('record landed on the server', !!state.files[saved.rel] && state.files[saved.rel].topic === 'Mock save');
    ok('template style applied on save', state.files[saved.rel].style === 'marketing');
    ok('image dims measured on save', state.files[saved.rel].media.width === 100);

    let missing = '';
    try { await engine.saveMedia(client, { file: path.join(tmp, 'ghost.png'), topic: 'x' }); }
    catch (e) { missing = e.message; }
    ok('missing file refuses to create a record', missing.includes('not found'));

    // scan folder: sample.png is "known" via mediaListing, a new file is "new"
    const newFile = path.join(tmp, 'fresh.jpg');
    fs.writeFileSync(newFile, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
    const scan = await engine.scanFolder(client, tmp, undefined, false);
    ok('scan classifies known by file_path', scan.known.some(k => k.id === 'media_old_1'));
    ok('scan classifies new files', scan.newFiles.includes(newFile));

    // update with optimistic concurrency
    const upd = await engine.updateRecord(client, 'media', 'media_old_1', { status: 'published', tags: ['x'] });
    ok('update returns the bumped version', upd.version === 4);
    ok('update merged the patch over the current item', state.records.media_old_1.status === 'published'
        && state.records.media_old_1.topic === 'already recorded');

    // sentence save
    const s = await engine.saveSentence(client, { content: 'Bir bilgi atomu.', topic: 'test' });
    ok('sentence rel under db/sentences', /^db\/sentences\/\d{4}-\d{2}\/sent_\d{8}_0007\.json$/.test(s.rel));

    // note save
    await client.saveNote('notes/today.md', '# hi');
    ok('note posted', state.note && state.note.path === 'notes/today.md');

    // ------------------------------------------------------------ stdio server
    const cfgFile = path.join(tmp, 'mcp-config.json');
    fs.writeFileSync(cfgFile, JSON.stringify(config));
    await stdioTests(cfgFile);

    // unconfigured guidance
    const emptyCfg = path.join(tmp, 'empty-config.json');
    fs.writeFileSync(emptyCfg, '{}');
    await stdioGuidanceTest(emptyCfg);
}

function talk(child) {
    const rl = readline.createInterface({ input: child.stdout });
    const pending = new Map();
    rl.on('line', l => {
        try {
            const msg = JSON.parse(l);
            if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        } catch { /* noise */ }
    });
    let id = 0;
    return (method, params) => new Promise(resolve => {
        const mid = ++id;
        pending.set(mid, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method, params }) + '\n');
    });
}

async function stdioTests(cfgFile) {
    const child = spawn(process.execPath, [path.join(OUT, 'index.js')],
        { env: { ...process.env, AIRTABLE_MCP_CONFIG: cfgFile }, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
        const rpc = talk(child);
        const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
        ok('stdio initialize answers with serverInfo', init.result && init.result.serverInfo.name === 'airtable-engine');
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        const tools = await rpc('tools/list', {});
        const names = tools.result.tools.map(t => t.name);
        ok('all 10 tools listed', names.length === 10 && names.includes('airtable_media_save')
            && names.includes('airtable_instances') && names.includes('airtable_knowledge_save'));
        ok('every tool has a schema', tools.result.tools.every(t => t.inputSchema && t.inputSchema.type === 'object'));
        const call = await rpc('tools/call', { name: 'airtable_instances', arguments: {} });
        const text = call.result.content[0].text;
        ok('tools/call instances finds the live mock', !call.result.isError && text.includes('"alive": true'));
        const stats = await rpc('tools/call', { name: 'airtable_stats', arguments: {} });
        ok('tools/call stats round-trips', !stats.result.isError && stats.result.content[0].text.includes('"lessons": 1'));
        const bad = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
        ok('unknown tool → protocol error', !!bad.error);
    } finally {
        child.kill();
    }
}

async function stdioGuidanceTest(cfgFile) {
    const child = spawn(process.execPath, [path.join(OUT, 'index.js')],
        { env: { ...process.env, AIRTABLE_MCP_CONFIG: cfgFile }, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
        const rpc = talk(child);
        await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
        const call = await rpc('tools/call', { name: 'airtable_search', arguments: { collection: 'media' } });
        ok('unconfigured → isError with GUIDANCE, not a crash', call.result.isError
            && call.result.content[0].text.includes('Toolbox'));
    } finally {
        child.kill();
    }
}

withServer(networkTests).then(() => {
    console.log(`${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
    process.exit(0);
}).catch(e => {
    console.error(e);
    console.log(`${pass} passed, ${fail + 1} failed (crashed)`);
    process.exit(1);
});
