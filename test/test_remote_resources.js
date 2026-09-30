// X-443 — WHAT A PHONE PAGE LOADS: /res/<path> from the media folder and
// nothing outside it, through a real host and only with a socket's session;
// and media/afRemote.js, the acquireVsCodeApi a served page gets.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { resolveResource, resourcePage } = require(path.join(ROOT, 'out', 'remote', 'server', 'resources.js'));
const { startRemoteHost } = require(path.join(ROOT, 'out', 'remote', 'serve.js'));
const K = require(path.join(ROOT, 'out', 'remote', 'contract', 'index.js'));
const { request, socket } = require(path.join(ROOT, 'tools', 'remoteClient.js'));

const MEDIA = path.join(ROOT, 'media');

// ---------- which paths may be served ----------
ok('a media file resolves inside the folder', resolveResource(MEDIA, '/res/common.css') === path.join(MEDIA, 'common.css'));
ok('a sub-folder file resolves', resolveResource(MEDIA, '/res/sounds/af_crystal_turn.wav') === path.join(MEDIA, 'sounds', 'af_crystal_turn.wav'));
ok('the query is not part of the path', resolveResource(MEDIA, '/res/common.css?v=3') === path.join(MEDIA, 'common.css'));
for (const bad of ['/res/../package.json', '/res/..%2Fpackage.json', '/res/%2e%2e/package.json', '/res/sounds/../../package.json',
    '/res/..\\package.json', '/res/sounds%5C..%5C..%5Cpackage.json', '/res//etc/passwd.js', '/res/%2Fetc%2Fx.js',
    '/res/./common.css', '/res/common.css%00.js', '/res/x%ZZ.js', '/res/', '/view/common.css', '/res/C:%5Cwin.js']) {
    ok('refused: ' + bad, resolveResource(MEDIA, bad) === null);
}
ok('a climb that lands back inside is still refused (no ".." at all)', resolveResource(MEDIA, '/res/sounds/../common.css') === null);
if (process.platform === 'win32') {
    ok('a drive path is not inside the folder', resolveResource(MEDIA, '/res/C:/Windows/x.js') === null);
}
ok('a type not on the list is refused (a map, a markdown, no extension)', resolveResource(MEDIA, '/res/afWeb.js.map') === null
    && resolveResource(MEDIA, '/res/README.md') === null && resolveResource(MEDIA, '/res/sounds') === null);

const css = resourcePage(MEDIA, '/res/common.css');
ok('a css file is served whole, with its type', css && css.status === 200 && css.type.startsWith('text/css')
    && css.body.equals(fs.readFileSync(path.join(MEDIA, 'common.css'))));
ok('the page shim is served as javascript', resourcePage(MEDIA, '/res/afRemote.js').type.startsWith('text/javascript'));
ok('a missing file is not found', resourcePage(MEDIA, '/res/nope.js') === null);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-res-'));
try {
    const root = path.join(tmp, 'media');
    fs.mkdirSync(path.join(root, 'dir.js'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'secret.js'), 'top secret');
    ok('a folder named like a file is not served', resourcePage(root, '/res/dir.js') === null);
    let linked = true;
    try { fs.symlinkSync(path.join(tmp, 'secret.js'), path.join(root, 'link.js'), 'file'); } catch { linked = false; }
    if (linked) { ok('a link inside the folder does not lead out of it', resourcePage(root, '/res/link.js') === null); }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ---------- media/afRemote.js ----------
const shim = fs.readFileSync(path.join(MEDIA, 'afRemote.js'), 'utf8');
const store = new Map();
const posted = [];
const win = {
    afShell: { post: j => posted.push(j) },
    sessionStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) }
};
win.window = win;
vm.runInNewContext(shim, Object.assign(win, { location: { pathname: '/view/now', search: '?view=v1' } }));
const api = win.acquireVsCodeApi();
ok('a served page gets acquireVsCodeApi, the same object each call', typeof api.postMessage === 'function' && win.acquireVsCodeApi() === api);
api.postMessage({ type: 'refresh', n: 1 });
ok('postMessage goes to the shell as JSON', posted.length === 1 && JSON.parse(posted[0]).type === 'refresh');
ok('no state yet reads as undefined', api.getState() === undefined);
api.setState({ tab: 'x' });
ok('state is kept per view', api.getState().tab === 'x' && [...store.keys()][0] === 'afRemoteState:/view/now?view=v1');
const inVsCode = { acquireVsCodeApi: () => 'vscode', location: { pathname: '/', search: '' } };
inVsCode.window = inVsCode;
vm.runInNewContext(shim, inVsCode);
ok('inside VS Code it changes nothing', inVsCode.acquireVsCodeApi() === 'vscode');
const bare = { location: { pathname: '/', search: '' } };
bare.window = bare;
vm.runInNewContext(shim, bare);
ok('without a shell or storage it neither throws nor keeps', (() => { const a = bare.acquireVsCodeApi(); a.postMessage({}); a.setState(1); return a.getState() === undefined; })());

// ---------- through a real host ----------
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-resh-'));
    const port = {
        farm: () => ({ id: 'farm_r', name: 'Ev' }), callOp: async () => ({ ok: true, result: {} }),
        subscribe: () => () => undefined, can: () => ({ allowed: true }), storageDir: () => dir, log: () => undefined,
        resourceDir: () => MEDIA
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
        const w = await c.wait(f => f.kind === 'welcome');
        ok('without a session /res is refused', (await request(addr, fp, 'GET', '/res/common.css')).status === 401);
        const got = await request(addr, fp, 'GET', '/res/afRemote.js', null, w.session);
        ok('with the socket\'s session the shim is served', got.status === 200 && got.body.includes('acquireVsCodeApi'));
        ok('a climb is not found over the wire too', (await request(addr, fp, 'GET', '/res/..%2Fpackage.json', null, w.session)).status === 404);
        c.close();
    } finally {
        await host.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
