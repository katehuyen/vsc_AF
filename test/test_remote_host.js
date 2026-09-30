// X-442 — THE REMOTE HOST END TO END, as the phone meets it.
//
// A real https listener with the host's own certificate and a client that
// trusts only its fingerprint: pair with the link's one-time code, answer the
// challenge with a signature, call an op, receive a pushed event, read a page
// route with the socket's session (and be refused without it), and be dropped
// the moment the device is revoked.
'use strict';
const crypto = require('crypto');
const path = require('path');
const tls = require('tls');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = p => require(path.join(ROOT, 'out', 'remote', ...p));
const { createRemoteServer } = out(['server', 'host.js']);
const { makeHostCert } = out(['server', 'cert.js']);
const { DeviceBook } = out(['server', 'devices.js']);
const { EventLog } = out(['server', 'eventLog.js']);
const { CallMemory } = out(['server', 'session.js']);
const K = out(['contract', 'index.js']);

/** One TLS connection that must present `fp`; resolves with the raw socket. */
function pinned(port, fp) {
    return new Promise((resolve, reject) => {
        const s = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, () => {
            const got = crypto.createHash('sha256').update(s.getPeerCertificate().raw).digest('hex');
            if (got !== fp) { s.destroy(); reject(new Error('pin')); } else { resolve(s); }
        });
        s.on('error', reject);
    });
}

async function request(port, fp, method, url, body, auth) {
    const s = await pinned(port, fp);
    const data = body ? JSON.stringify(body) : '';
    s.write(`${method} ${url} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n${auth ? `Authorization: AF ${auth}\r\n` : ''}` +
        `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`);
    let raw = '';
    for await (const c of s) { raw += c; }
    const [head, ...rest] = raw.split('\r\n\r\n');
    return { status: Number(head.split(' ')[1]), body: rest.join('\r\n\r\n') };
}

async function socket(port, fp) {
    const s = await pinned(port, fp);
    const key = crypto.randomBytes(16).toString('base64');
    s.write(`GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const frames = [];
    let buf = Buffer.alloc(0), up = false;
    const c = { frames, closed: false };
    s.on('data', d => {
        buf = Buffer.concat([buf, d]);
        if (!up) { const e = buf.indexOf('\r\n\r\n'); if (e < 0) { return; } up = true; buf = buf.subarray(e + 4); }
        while (buf.length >= 2) {
            let n = buf[1] & 127, off = 2;
            if (n === 126) { n = buf.readUInt16BE(2); off = 4; }
            if (buf.length < off + n) { break; }
            if ((buf[0] & 15) === 1) { frames.push(JSON.parse(buf.subarray(off, off + n).toString())); }
            buf = buf.subarray(off + n);
        }
    });
    s.on('close', () => { c.closed = true; });
    c.send = obj => {
        const p = Buffer.from(JSON.stringify(obj)), m = crypto.randomBytes(4);
        const head = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length]) : Buffer.from([0x81, 0x80 | 126, p.length >> 8, p.length & 255]);
        const b = Buffer.from(p); for (let i = 0; i < b.length; i++) { b[i] ^= m[i & 3]; }
        s.write(Buffer.concat([head, m, b]));
    };
    c.wait = async (pred, ms = 2000) => { const end = Date.now() + ms; while (Date.now() < end) { const f = frames.find(pred); if (f) { return f; } await new Promise(r => setTimeout(r, 10)); } return null; };
    return c;
}

(async () => {
    const farm = { id: 'farm_host', name: 'Ev Masaüstü' };
    const cert = makeHostCert(farm.name);
    const devices = new DeviceBook(null);
    const logs = [];
    const server = createRemoteServer({
        farm, cert, devices, events: new EventLog(null), calls: new CallMemory(), views: null, helloTimeoutMs: 3000,
        features: () => ({}), log: l => logs.push(l),
        callOp: async (op, args, caller) => ({ ok: true, result: { op, device: caller.device } }),
        page: (p, caller) => (p.startsWith('/view/now') ? { status: 200, type: 'text/html', body: `<p>${caller.device}</p>` } : null),
    });
    const port = await server.listen(0, '127.0.0.1');
    try {
        const link = K.parsePairingUri(server.pairingLink([`127.0.0.1:${port}`]));
        ok('the pairing link carries the farm, the certificate fingerprint and the address', link.farm === farm.id && link.fp === cert.fingerprint && link.addresses[0] === `127.0.0.1:${port}`);
        const health = await request(port, cert.fingerprint, 'GET', '/health');
        ok('/health answers with the farm and contract', health.status === 200 && JSON.parse(health.body).contract === K.CONTRACT_VERSION);

        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const pairBody = { code: link.code, name: 'Pixel 8', publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), platform: 'android 14', app: 'test' };
        const paired = await request(port, cert.fingerprint, 'POST', '/pair', pairBody);
        const dev = JSON.parse(paired.body);
        ok('a pairing with the link\'s code returns a device, the farm and its scope', paired.status === 200 && /^dev_/.test(dev.device) && dev.farm.id === farm.id && dev.scope === 'manage');
        ok('the same code does not pair twice', (await request(port, cert.fingerprint, 'POST', '/pair', pairBody)).status === 403);
        ok('a malformed pairing is 400', (await request(port, cert.fingerprint, 'POST', '/pair', { code: 'x' })).status === 400);

        const c = await socket(port, cert.fingerprint);
        const ch = await c.wait(f => f.kind === 'challenge');
        ok('the socket opens with a challenge', ch && ch.farm.id === farm.id);
        const sig = crypto.sign('sha256', Buffer.from(K.signedText(farm.id, dev.device, ch.nonce)), privateKey).toString('base64');
        c.send({ kind: 'hello', device: dev.device, contract: K.CONTRACT_VERSION, signature: sig });
        const w = await c.wait(f => f.kind === 'welcome');
        ok('a signed hello is welcomed', w && w.device === dev.device && typeof w.session === 'string');

        c.send({ kind: 'call', id: 'c_1', op: 'farm.ping' });
        const r = await c.wait(f => f.kind === 'result' && f.id === 'c_1');
        ok('a call reaches the op as this device', r && r.ok && r.result.device === dev.device);
        server.emit('notice.posted', { id: 'n1', agent: 'a', title: 'Duyuru', level: 'info' });
        const ev = await c.wait(f => f.kind === 'event');
        ok('an emitted event is pushed with its seq', ev && ev.type === 'notice.posted' && ev.seq > 0);

        ok('a page route without a session is 401', (await request(port, cert.fingerprint, 'GET', '/view/now')).status === 401);
        const pg = await request(port, cert.fingerprint, 'GET', '/view/now', null, w.session);
        ok('with the socket\'s session it is served, for this caller', pg.status === 200 && pg.body.includes(dev.device));
        ok('an unknown page is 404', (await request(port, cert.fingerprint, 'GET', '/view/other', null, w.session)).status === 404);

        devices.revoke(dev.device);
        server.dropRevoked();
        const rv = await c.wait(f => f.kind === 'refuse');
        await new Promise(res => setTimeout(res, 50));
        ok('a revoked device is refused on its open socket and dropped', rv && rv.reason === 'revoked' && c.closed);
        ok('and its session no longer serves pages', (await request(port, cert.fingerprint, 'GET', '/view/now', null, w.session)).status === 401);
        await pinned(port, '0'.repeat(64)).then(() => ok('a wrong pin is refused', false), () => ok('a wrong pin is refused', true));
        ok('pairing is logged by device and name', logs.some(l => l.includes(dev.device) && l.includes('Pixel 8')));
    } finally {
        await server.close();
    }
    console.log(`remote host: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
