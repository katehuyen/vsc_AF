// X-451 — THE PHONE'S WAKE TOKEN, held by the remote host.
//
// The token is kept on the device's own record (devices.ts setWakeToken); a revoked
// phone keeps none. The phone hands it in with remote.wake.register, which the host
// answers itself (server/selfOps.ts): any scope, its own record only, never the
// bridge. The control lists the phones a wake could reach — holding a token, no
// socket open, and only while listening — and never shows the token itself.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tls = require('tls');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = p => require(path.join(__dirname, '..', 'out', 'remote', ...p));
const { DeviceBook } = out(['server', 'devices.js']);
const { selfOp, WAKE_REGISTER_OP } = out(['server', 'selfOps.js']);
const { requiredScope, scopeAllows } = out(['scopes.js']);
const { createRemoteControl } = out(['index.js']);
const K = out(['contract', 'index.js']);

function pinned(port) {
    return new Promise((resolve, reject) => {
        const s = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, () => resolve(s));
        s.on('error', reject);
    });
}
async function request(port, method, url, body) {
    const s = await pinned(port);
    const data = body ? JSON.stringify(body) : '';
    s.write(`${method} ${url} HTTP/1.1\r\nHost: x\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`);
    let raw = '';
    for await (const c of s) { raw += c; }
    const [head, ...rest] = raw.split('\r\n\r\n');
    return { status: Number(head.split(' ')[1]), body: rest.join('\r\n\r\n') };
}
async function socket(port) {
    const s = await pinned(port);
    s.write(`GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const frames = [];
    let buf = Buffer.alloc(0), up = false;
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
    s.on('error', () => undefined);
    const send = obj => {
        const p = Buffer.from(JSON.stringify(obj)), m = crypto.randomBytes(4);
        const head = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length]) : Buffer.from([0x81, 0x80 | 126, p.length >> 8, p.length & 255]);
        for (let i = 0; i < p.length; i++) { p[i] ^= m[i & 3]; }
        s.write(Buffer.concat([head, m, p]));
    };
    const wait = async (pred, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { const f = frames.find(pred); if (f) { return f; } await new Promise(r => setTimeout(r, 10)); } return null; };
    return { send, wait, end: () => s.destroy() };
}
const until = async (pred, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) { return true; } await new Promise(r => setTimeout(r, 20)); } return false; };

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wake-'));
    try {
        // ---------- the record ----------
        const file = path.join(dir, 'devices.json');
        const book = new DeviceBook(file);
        const a = book.add('Pixel', 'pk-a');
        const b = book.add('Tablet', 'pk-b');
        ok('a new device has no wake token', a.wakeToken === undefined);
        ok('‼️ the phone\'s token is kept on its own record, trimmed', book.setWakeToken(a.id, '  fcm-token-1 ') && book.get(a.id).wakeToken === 'fcm-token-1');
        ok('…and survives a reload', new DeviceBook(file).get(a.id).wakeToken === 'fcm-token-1');
        ok('another device is untouched', book.get(b.id).wakeToken === undefined);
        ok('an empty token clears it', book.setWakeToken(a.id, '') && !('wakeToken' in book.get(a.id)));
        ok('an unknown device gets none', book.setWakeToken('dev_nope', 'x') === false);
        book.setWakeToken(b.id, 'fcm-token-2');
        book.revoke(b.id);
        ok('‼️ revoking a phone drops its token: a revoked phone is never woken', book.get(b.id).revoked && book.get(b.id).wakeToken === undefined);
        ok('…and a revoked phone cannot set one again', book.setWakeToken(b.id, 'again') === false && book.get(b.id).wakeToken === undefined);

        // ---------- the self op ----------
        const me = { device: a.id, scope: 'read' };
        ok('a self op is for every scope, and only that op leaves the remote namespace', requiredScope(WAKE_REGISTER_OP) === 'read'
            && scopeAllows('read', WAKE_REGISTER_OP) && requiredScope('remote.devices') === 'admin' && requiredScope('remote.wake.test') === 'admin');
        ok('the host answers it itself', selfOp(book, WAKE_REGISTER_OP, { token: 't9' }, me).ok && book.get(a.id).wakeToken === 't9');
        ok('any other op is the port\'s', selfOp(book, 'farm.ping', {}, me) === undefined);
        ok('a token that is not a string is refused and changes nothing', !selfOp(book, WAKE_REGISTER_OP, { token: 5 }, me).ok
            && !selfOp(book, WAKE_REGISTER_OP, {}, me).ok && book.get(a.id).wakeToken === 't9');
        ok('an oversized one is refused', !selfOp(book, WAKE_REGISTER_OP, { token: 'x'.repeat(5000) }, me).ok);
        ok('an empty one clears, and says so', selfOp(book, WAKE_REGISTER_OP, { token: '' }, me).result.registered === false && !book.get(a.id).wakeToken);
        ok('a revoked device is told it is not paired', /not paired/.test(selfOp(book, WAKE_REGISTER_OP, { token: 'x' }, { device: b.id, scope: 'admin' }).error));

        // ---------- end to end: a real host, a real phone ----------
        const store = path.join(dir, 'remote');
        const portOps = [];
        const port = {
            farm: () => ({ id: 'farm_w', name: 'Ev' }),
            callOp: async (op, args, caller) => { portOps.push(op); return { ok: true, result: { op, device: caller.device } }; },
            subscribe: () => () => undefined,
            can: f => (f === 'remote.wake' ? { allowed: false, reason: 'no key' } : { allowed: true }),
            storageDir: () => store,
            log: () => undefined,
        };
        const ctl = createRemoteControl(port);
        const st = await ctl.apply({ host: '127.0.0.1', port: 0, addresses: ['127.0.0.1'] });
        const link = K.parsePairingUri(ctl.pairingLink().link);
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const dev = JSON.parse((await request(st.port, 'POST', '/pair', { code: link.code, name: 'Pixel 8',
            publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), platform: 'android 14', app: 'test' })).body).device;
        const c = await socket(st.port);
        const ch = await c.wait(f => f.kind === 'challenge');
        c.send({ kind: 'hello', device: dev, contract: K.CONTRACT_VERSION,
            signature: crypto.sign('sha256', Buffer.from(K.signedText('farm_w', dev, ch.nonce)), privateKey).toString('base64') });
        const w = await c.wait(f => f.kind === 'welcome');
        ok('the welcome tells the phone whether this farm can wake it, and why not', w && w.features['remote.wake'].allowed === false && w.features['remote.wake'].reason === 'no key');
        const call = async (id, op, args) => { c.send({ kind: 'call', id, op, args }); return c.wait(f => f.kind === 'result' && f.id === id); };

        let r = await call('c1', WAKE_REGISTER_OP, { token: ' tok-1 ' });
        ok('‼️ the phone registers its token over its own socket', r && r.ok && r.result.registered === true);
        ok('‼️ …and the bridge never sees it: an agent cannot call it', !portOps.includes(WAKE_REGISTER_OP));
        const row = ctl.devices().find(d => d.id === dev);
        ok('the device row says it can be woken, never with the token', row.wake === true && !JSON.stringify(ctl.devices()).includes('tok-1'));
        ok('‼️ a phone with its socket open is not a wake target — it has the event already', ctl.wakeTargets().length === 0);
        ok('a test wake reaches it all the same', JSON.stringify(ctl.wakeTargets(true)) === JSON.stringify([{ device: dev, name: 'Pixel 8', token: 'tok-1' }]));
        r = await call('c2', 'farm.ping', {});
        ok('every other op still goes to the port', r.ok && portOps.includes('farm.ping'));

        ctl.setScope(dev, 'read');
        r = await call('c3', WAKE_REGISTER_OP, { token: 'tok-2' });
        ok('‼️ a phone at read registers too: it is the device\'s own record', r && r.ok);
        r = await call('c4', 'remote.devices', {});
        ok('…while the rest of the remote namespace stays admin', r && !r.ok && /needs admin/.test(r.error));
        ok('a registration is the phone\'s own bookkeeping, not a farm action the audit log writes', !ctl.audit({}).some(e => e.op === WAKE_REGISTER_OP));

        c.end();
        ok('‼️ with its socket gone the phone is a wake target, with the token it gave last', await until(() => ctl.wakeTargets().some(t => t.device === dev && t.token === 'tok-2')));
        ctl.forgetWake(dev, 'tok-1');
        ok('a dead token the phone has already replaced does not drop the new one', ctl.wakeTargets()[0]?.token === 'tok-2');
        ctl.forgetWake(dev, 'tok-2');
        ok('the dead token itself is dropped', ctl.wakeTargets().length === 0 && !ctl.devices().find(d => d.id === dev).wake);
        await ctl.apply(null, 'test');
        new DeviceBook(path.join(store, 'devices.json')).setWakeToken(dev, 'tok-3');
        ok('‼️ while nothing listens there is no one to wake: a woken phone would find no farm',
            ctl.devices().find(d => d.id === dev).wake === true && ctl.wakeTargets(true).length === 0);
        await ctl.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
