// X-456 — A PAGE'S OWN FILES ON A PHONE. A file the panel's code turns into an
// address (asWebviewUri) on a phone's view gets a random token in that view, and
// /res/~/<view>/<token> serves exactly that file — to that device, while the view
// is open, through the host's session. Nothing else on the disk has an address.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

class EventEmitter {
    constructor() { this.listeners = []; }
    get event() { return f => { this.listeners.push(f); return { dispose: () => { this.listeners = this.listeners.filter(x => x !== f); } }; }; }
    fire(e) { for (const f of [...this.listeners]) { f(e); } }
    dispose() { this.listeners = []; }
}
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return { EventEmitter, window: {} }; }
    return origLoad.apply(this, arguments);
};
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { ViewFiles, mimeOf, FILE_URL } = require(path.join(ROOT, 'out', 'panels', 'remoteFiles.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));
const { startRemoteHost } = require(path.join(ROOT, 'out', 'remote', 'serve.js'));
const K = require(path.join(ROOT, 'out', 'remote', 'contract', 'index.js'));
const { request, socket } = require(path.join(ROOT, 'tools', 'remoteClient.js'));

const fileUri = p => ({ scheme: 'file', path: p.replace(/\\/g, '/'), fsPath: p });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-viewfiles-'));
const PIC = path.join(TMP, 'sahne 1.png');
const BIG = path.join(TMP, 'clip.mp4');
const OTHER = path.join(TMP, 'other.png');
fs.writeFileSync(PIC, 'PNG-BYTES');
fs.writeFileSync(BIG, Buffer.alloc(2048, 1));
fs.writeFileSync(OTHER, 'OTHER');

(async () => {
    // ---------- one view's addresses ----------
    const files = new ViewFiles('v1');
    const a = files.address(PIC);
    ok('a file gets an address under /res/~/ in its view, a 24-hex token and no name', /^\/res\/~\/v1\/[a-f0-9]{24}$/.test(a) && FILE_URL.test(a));
    ok('the same file keeps its token', files.address(PIC) === a);
    ok('a missing file and a folder get none', files.address(path.join(TMP, 'nope.png')) === undefined && files.address(TMP) === undefined);
    ok('pictures, clips and sounds go with their type; anything else is plain bytes', mimeOf(PIC) === 'image/png' && mimeOf(BIG) === 'video/mp4'
        && mimeOf('x.JPG') === 'image/jpeg' && mimeOf('x.wav') === 'audio/wav' && mimeOf('x.json') === 'application/octet-stream');
    const tokenOf = u => FILE_URL.exec(u)[2];
    const got = await files.serve(tokenOf(a));
    ok('its token serves the file whole', got.status === 200 && got.type === 'image/png' && got.body.toString() === 'PNG-BYTES');
    ok('a token never given serves nothing', (await files.serve('0'.repeat(24))) === null);
    const big = await files.serve(tokenOf(files.address(BIG)), 1024);
    ok('a file past the limit is refused, never read', big.status === 413 && typeof big.body === 'string');

    // ---------- the views ----------
    const made = [];
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: {
            wall: {
                open: 'read', act: 'manage', looks: [], answers: [], pcOnly: [],
                make: host => { made.push(host); host.webview.html = '<p>wall</p>'; }
            }
        }
    });
    const A = { device: 'dev_a', scope: 'read' }, B = { device: 'dev_b', scope: 'read' };
    views.open(A, 'v1', 'wall', undefined, () => undefined);
    const w = made[0].webview;
    const media = String(w.asWebviewUri(fileUri(path.join(ROOT, 'media', 'common.css'))));
    const pic = String(w.asWebviewUri(fileUri(PIC)));
    ok('a media file stays /res/<path>; a file the panel shows gets the view\'s token; a missing one no address',
        media === '/res/common.css' && /^\/res\/~\/v1\/[a-f0-9]{24}$/.test(pic) && String(w.asWebviewUri(fileUri(path.join(TMP, 'x.png')))) === '/res/-');
    ok('an address that is not a file on the disk is none either', String(w.asWebviewUri({ scheme: 'https', path: '/x.png', fsPath: '/x.png' })) === '/res/-');
    const served = await views.page(pic, A);
    ok('‼️ the device that was given it gets the file', served && served.status === 200 && served.body.toString() === 'PNG-BYTES');
    ok('‼️ another device asking the same address gets nothing', (await views.page(pic, B)) === null);
    ok('…nor the same device under another view', (await views.page(pic.replace('/v1/', '/v2/'), A)) === null);
    ok('…nor a file of the same folder it was never given', (await views.page('/res/~/v1/' + 'a'.repeat(24), A)) === null);
    views.close(A, 'v1');
    ok('‼️ a closed view\'s addresses are gone', (await views.page(pic, A)) === null);

    // ---------- through a real host ----------
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-viewfilesh-'));
    const port = {
        farm: () => ({ id: 'farm_f', name: 'Ev' }), callOp: async () => ({ ok: true, result: {} }),
        subscribe: () => () => undefined, can: () => ({ allowed: true }), storageDir: () => dir, log: () => undefined,
        resourceDir: () => path.join(ROOT, 'media'), views: () => views
    };
    const host = await startRemoteHost(port, { host: '127.0.0.1', port: 0 });
    try {
        const addr = { host: '127.0.0.1', port: host.port }, fp = host.fingerprint;
        const link = K.parsePairingUri(host.server.pairingLink([`127.0.0.1:${host.port}`]));
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const dev = (await request(addr, fp, 'POST', '/pair', { code: link.code, name: 't', platform: 't', app: 't',
            publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') })).json;
        const c = await socket(addr, fp);
        const ch = await c.wait(f => f.kind === 'challenge');
        c.send({ kind: 'hello', device: dev.device, contract: K.CONTRACT_VERSION,
            signature: crypto.sign('sha256', Buffer.from(K.signedText(link.farm, dev.device, ch.nonce)), privateKey).toString('base64') });
        const hi = await c.wait(f => f.kind === 'welcome');
        views.open({ device: dev.device, scope: 'read' }, 'v9', 'wall', undefined, () => undefined);
        const addrOf = String(made[made.length - 1].webview.asWebviewUri(fileUri(PIC)));
        ok('without a session the file is refused', (await request(addr, fp, 'GET', addrOf)).status === 401);
        const r = await request(addr, fp, 'GET', addrOf, null, hi.session);
        ok('‼️ over the wire the view\'s file reaches its phone, with its type', r.status === 200 && r.body === 'PNG-BYTES');
        ok('a token never given is not found over the wire', (await request(addr, fp, 'GET', '/res/~/v9/' + 'b'.repeat(24), null, hi.session)).status === 404);
        c.close();
    } finally {
        await host.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\nview files: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
