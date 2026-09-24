// M-41 — a local file in a media input is uploaded to the provider once per content and its URL sent instead.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: {
        showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const U = require(path.join(ROOT, 'out/core/mediaUpload.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
const { registerMediaUploadOps } = require(path.join(ROOT, 'out/core/mediaUploadBridge.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-upload-'));
const img = path.join(tmp, 'kare.png'); fs.writeFileSync(img, 'PNGDATA-1');
const vid = path.join(tmp, 'klip.mp4'); fs.writeFileSync(vid, 'MP4DATA');

/* ---------- what counts as a local file ---------- */
{
    const input = JSON.stringify({ image_url: img, video: `{upload:${vid}}`, ref: 'https://x.test/a.png', prompt: 'a cat' });
    const r = U.localRefs(input);
    eq('an explicit {upload:path} and a value that IS a path', [r.explicit, r.detected], [[vid], [img]]);
    eq('an https URL and plain text are left alone', U.localRefs('{"a":"https://x/y.png","b":"C is a letter"}'), { explicit: [], detected: [] });
    const out = JSON.parse(U.replaceRefs(input, { [img]: 'https://cdn/k.png', [vid]: 'https://cdn/v.mp4' }));
    eq('each is replaced by its URL, the rest untouched', [out.image_url, out.video, out.ref, out.prompt], ['https://cdn/k.png', 'https://cdn/v.mp4', 'https://x.test/a.png', 'a cat']);
    eq('the content type follows the extension', [U.contentType('a.MP4'), U.contentType('a.xyz')], ['video/mp4', 'application/octet-stream']);
}

/* ---------- a mock of both providers ---------- */
const hits = { init: 0, put: 0, rep: 0 };
let last = {};
const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c)).on('end', () => {
        const body = Buffer.concat(chunks);
        const base = `http://127.0.0.1:${server.address().port}`;
        if (req.url.startsWith('/storage/upload/initiate')) {
            hits.init++;
            last.init = { url: req.url, auth: req.headers.authorization, life: req.headers['x-fal-object-lifecycle-preference'], body: JSON.parse(body.toString()) };
            res.end(JSON.stringify({ upload_url: `${base}/put/${hits.init}`, file_url: `https://cdn.fal.test/${hits.init}/${last.init.body.file_name}` }));
        } else if (req.url.startsWith('/put/')) {
            hits.put++;
            last.put = { type: req.headers['content-type'], body: body.toString() };
            res.end('');
        } else if (req.url === '/v1/files') {
            hits.rep++;
            last.rep = { auth: req.headers.authorization, body: body.toString() };
            res.end(JSON.stringify({ id: 'f1', urls: { get: 'https://api.replicate.test/v1/files/f1' }, expires_at: '2099-01-01T00:00:00Z' }));
        } else { res.statusCode = 404; res.end('no'); }
    });
});

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const cacheFile = path.join(tmp, 'cache.json');
    const o = { auth: 'Key k1', baseUrl: base, retentionDays: 7, cacheFile };

    const a = await U.uploadFile(img, 'fal', o);
    ok('fal: initiate, then the bytes PUT to the upload URL', hits.init === 1 && hits.put === 1 && last.put.body === 'PNGDATA-1' && last.put.type === 'image/png');
    eq('…with the key, the file name and fal-cdn-v3', [last.init.auth, last.init.body.file_name, /storage_type=fal-cdn-v3/.test(last.init.url)], ['Key k1', 'kare.png', true]);
    eq('…and the retention as fal\'s lifecycle header', JSON.parse(last.init.life), { expiration_duration_seconds: 604800 });
    eq('the answer is fal\'s file URL, not cached', [a.url, a.cached], ['https://cdn.fal.test/1/kare.png', false]);
    const b = await U.uploadFile(img, 'fal', o);
    ok('‼️ the same content is NOT uploaded again — same URL, cached', b.cached && b.url === a.url && hits.init === 1);
    const late = await U.uploadFile(img, 'fal', { ...o, now: () => Date.now() + 8 * 86400_000 });
    ok('after the retention runs out it is uploaded again', !late.cached && hits.init === 2);
    fs.writeFileSync(img, 'PNGDATA-2');
    const c = await U.uploadFile(img, 'fal', o);
    ok('changed content is a new upload', !c.cached && hits.init === 3);
    const rp = await U.uploadFile(vid, 'replicate', { ...o, auth: 'Bearer r1' });
    ok('replicate: one multipart POST to /v1/files with the file in it', hits.rep === 1 && last.rep.auth === 'Bearer r1' && /name="content"; filename="klip.mp4"/.test(last.rep.body) && /MP4DATA/.test(last.rep.body));
    eq('…its urls.get and expiry are the answer', [rp.url, new Date(rp.expiresAt).getUTCFullYear()], ['https://api.replicate.test/v1/files/f1', 2099]);
    let err = '';
    try { await U.uploadFile(path.join(tmp, 'yok.png'), 'fal', o); } catch (e) { err = e.message; }
    ok('a path that is not a file says so', /is not a file on this computer/.test(err));
    err = '';
    try { await U.uploadFile(vid, 'fal', { ...o, auth: '', cacheFile: path.join(tmp, 'c2.json') }); } catch (e) { err = e.message; }
    ok('no key: refused before anything is sent', /no fal key is stored/.test(err));

    /* ---------- the step's policy: ask · auto · never ---------- */
    const input = JSON.stringify({ image_url: vid, extra: `{upload:${img}}` });
    const never = await U.prepareMediaInput(input, 'fal', 'never', o, async () => true);
    ok('never: a detected path stops the step and says how to send it', /automatic upload is off/.test(never.error) && /\{upload:<path>\}/.test(never.error));
    const asked = [];
    const no = await U.prepareMediaInput(input, 'fal', 'ask', o, async (p) => { asked.push(...p); return false; });
    ok('ask: a person is asked about the detected file, and a no stops it', asked.length === 1 && asked[0] === vid && /declined/.test(no.error));
    const yes = await U.prepareMediaInput(input, 'fal', 'auto', o, async () => false);
    const sent = JSON.parse(yes.input);
    ok('auto: both uploaded, both replaced', /^https:\/\/cdn\.fal\.test\//.test(sent.image_url) && /^https:\/\/cdn\.fal\.test\//.test(sent.extra) && yes.uploads.length === 2);
    const onlyMark = await U.prepareMediaInput(JSON.stringify({ x: `{upload:${img}}` }), 'fal', 'never', o, async () => false);
    ok('an explicit {upload:} uploads even when automatic upload is off', !onlyMark.error && onlyMark.uploads[0].cached === true);
    eq('an input with no local file is passed through untouched', await U.prepareMediaInput('{"a":"b"}', 'fal', 'never', o, async () => false), { input: '{"a":"b"}', uploads: [] });

    /* ---------- the bridge and the task manager: one code path ---------- */
    const bridge = new BridgeRegistry();
    const store = path.join(tmp, 'store', 'f.json');
    fs.mkdirSync(path.dirname(store), { recursive: true });
    const mgr = new TaskManager(store, () => [], () => false, () => '', {
        quotaCheck: () => 'hold', mediaAuth: (p) => (p === 'replicate' ? 'Bearer r1' : 'Key k1'),
        mediaUploadBaseUrl: () => base, mediaUpload: () => ({ mode: 'never', provider: 'auto', retentionDays: 7 })
    });
    registerMediaUploadOps(bridge, { upload: (f, p) => mgr.uploadMediaFile(f, p) });
    const bad = await bridge.dispatch('media.upload', { path: img, provider: 'dropbox' });
    ok('media.upload refuses an unknown provider by name', !bad.ok && /fal, replicate/.test(bad.error));
    const via = await bridge.dispatch('media.upload', { path: img });
    ok('media.upload: the default provider is fal, through the manager', via.ok && via.result.provider === 'fal' && /^https:\/\/cdn\.fal\.test\//.test(via.result.url));
    ok('…and its cache lives beside the task store', fs.existsSync(path.join(tmp, 'store', 'media-uploads.json')));
    const again = await bridge.dispatch('media.upload', { path: img });
    ok('‼️ a second media.upload answers cached:true with the same URL', again.result.cached === true && again.result.url === via.result.url);

    mgr.runMediaAdhoc('kes', 'fal-ai/some-model', JSON.stringify({ video_url: vid }));
    await new Promise(r => setTimeout(r, 300));
    const t = mgr.tasks.find(x => x.title && x.title.includes('kes'));
    const out = t && t.outputFile && fs.existsSync(t.outputFile) ? fs.readFileSync(t.outputFile, 'utf8') : '';
    ok('‼️ a media step with a local path and upload off fails honestly — nothing sent to the model', t && t.status === 'failed' && /automatic upload is off/.test(out));

    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
