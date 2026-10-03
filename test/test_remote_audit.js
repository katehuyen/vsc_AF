// X-444 — THE AUDIT LOG: every remote act by the device that did it.
//
// The log itself (newest first, the filters, kept on disk, cut back, a torn
// line survived), the calls it writes (a change or a scope refusal, never a
// look), and the socket's own acts: a connection stamps the device's last
// seen, a refused handshake names the reason, a page press is written and a
// page look is not.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = p => require(path.join(ROOT, 'out', 'remote', ...p));
const { AuditLog, AUDIT_KINDS, auditor, auditedCalls } = out(['server', 'auditLog.js']);
const { RemoteSession, CallMemory } = out(['server', 'session.js']);
const { DeviceBook } = out(['server', 'devices.js']);
const { EventLog } = out(['server', 'eventLog.js']);
const K = out(['contract', 'index.js']);

(async () => {
    // ---------- the log ----------
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-audit-'));
    const file = path.join(dir, 'remote', 'audit.jsonl');
    try {
        let t = 1000;
        const log = new AuditLog(file, 3, () => t);
        for (const w of ['pair', 'connect', 'call', 'action']) { t += 10; log.record({ what: w, device: 'd1', name: 'Pixel', user: 'owner', ok: true }); }
        ok('newest first, the last `keep` held', log.list().map(e => e.what).join() === 'action,call,connect');
        ok('a limit', log.list({ limit: 1 }).length === 1);
        ok('a kind filter', log.list({ what: ['call', 'pair'] }).map(e => e.what).join() === 'call');
        ok('since stops at older entries', log.list({ since: 1030 }).map(e => e.what).join() === 'action,call');
        log.record({ what: 'revoke', device: 'd2', name: 'Tab', user: 'owner', ok: true });
        ok('a device filter', log.list({ device: 'd2' }).length === 1 && log.list({ device: 'd1' }).length === 2);
        ok('every entry carries its time', log.list().every(e => typeof e.ts === 'number'));
        const lines = () => fs.readFileSync(file, 'utf8').trim().split('\n').length;
        ok('lines are appended', lines() === 5);
        t += 10; log.record({ what: 'scope', device: 'd1', name: 'Pixel', user: 'owner', ok: true });
        ok('up to twice keep', lines() === 6);
        t += 10; log.record({ what: 'scope', device: 'd1', name: 'Pixel', user: 'owner', ok: true });
        ok('then the file is cut back to what memory holds', lines() === 3);
        fs.appendFileSync(file, '{"ts":9999,"what":"call","dev');
        const again = new AuditLog(file, 3);
        ok('a reload keeps the entries and skips a torn last line', again.list().length === 3 && again.list()[0].what === 'scope');
        ok('the kinds are the eight the design names', AUDIT_KINDS.length === 8 && AUDIT_KINDS.includes('pair-refused'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }

    // ---------- the calls it writes ----------
    const devices = new DeviceBook(null);
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const dev = devices.add('Pixel', spki);
    const gone = devices.add('Old', spki);
    devices.revoke(gone.id);
    const mem = new AuditLog(null);
    const note = auditor(mem, devices);
    const calls = auditedCalls(async (op) => {
        if (op === 'boom.start') { throw new Error('patladı'); }
        if (op === 'accounts.list') { return { ok: false, error: 'scope: accounts.list needs admin, this device has manage' }; }
        return { ok: true, result: op };
    }, note);
    const caller = { device: dev.id, scope: 'manage' };
    await calls('tasks.list', {}, caller);
    ok('a look is not written', mem.list().length === 0);
    await calls('console.start', {}, caller);
    let e = mem.list()[0];
    ok('a change is written with the device\'s name and user', e.what === 'call' && e.op === 'console.start' && e.ok && e.name === 'Pixel' && e.user === 'owner');
    await calls('accounts.list', {}, caller);
    e = mem.list()[0];
    ok('a look the scope refused is written, with the refusal', e.op === 'accounts.list' && !e.ok && /needs admin/.test(e.detail));
    let threw = false;
    try { await calls('boom.start', {}, caller); } catch { threw = true; }
    ok('a call that throws is written and still throws', threw && mem.list()[0].op === 'boom.start' && !mem.list()[0].ok && mem.list()[0].detail === 'patladı');
    note.note('', 'pair-refused', { ok: false, name: 'Intruder', detail: 'code' });
    ok('an entry naming no device keeps the name it was given', mem.list()[0].name === 'Intruder' && mem.list()[0].user === '');

    // ---------- the socket's own acts ----------
    const farm = { id: 'farm_a', name: 'Ev' };
    const pressed = [];
    const views = {
        open: () => true,
        message: (c, view, m) => {
            pressed.push(m.type);
            return m.type === 'refresh' ? { page: 'chains', type: 'refresh', act: false, ran: true }
                : { page: 'chains', type: m.type, act: true, ran: c.scope !== 'read' };
        },
        close: () => undefined,
    };
    function open(address) {
        const sent = [];
        const wire = { closed: false, send: s => sent.push(JSON.parse(s)), close: () => { wire.closed = true; } };
        const s = new RemoteSession(wire, {
            farm, devices, events: new EventLog(null), calls: new CallMemory(), views, helloTimeoutMs: 5000,
            features: () => ({}), callOp: async () => ({ ok: true, result: null }), audit: note,
        }, address);
        return { s, sent, wire };
    }
    const sign = (nonce, id) => crypto.sign('sha256', Buffer.from(K.signedText(farm.id, id, nonce)), privateKey).toString('base64');
    const hello = (x, id, more = {}) => x.s.onMessage(JSON.stringify({ kind: 'hello', device: id, contract: K.CONTRACT_VERSION, signature: sign(x.s.nonce, id), ...more }));

    let x = open('10.0.0.5');
    hello(x, dev.id);
    e = mem.list()[0];
    ok('a welcomed connection is written with where it came from', x.sent[1].kind === 'welcome' && e.what === 'connect' && e.ok && e.address === '10.0.0.5' && e.name === 'Pixel');
    ok('and stamps the device\'s last seen', devices.get(dev.id).lastAddress === '10.0.0.5' && typeof devices.get(dev.id).lastSeen === 'number');
    x.s.onMessage(JSON.stringify({ kind: 'view.open', view: 'v1', page: 'chains' }));
    const before = mem.list().length;
    x.s.onMessage(JSON.stringify({ kind: 'view.msg', view: 'v1', message: { type: 'refresh' } }));
    ok('a page look reaches the page and is not written', pressed.join() === 'refresh' && mem.list().length === before);
    x.s.onMessage(JSON.stringify({ kind: 'view.msg', view: 'v1', message: { type: 'stop' } }));
    e = mem.list()[0];
    ok('a page press is written with the page and the message', e.what === 'action' && e.page === 'chains' && e.op === 'stop' && e.ok);
    x.s.onMessage(JSON.stringify({ kind: 'view.msg', view: 'nope', message: { type: 'stop' } }));
    ok('a press on a view this socket never opened is neither run nor written', pressed.length === 2 && mem.list().length === before + 1);
    x.s.rescope('read');
    x.s.onMessage(JSON.stringify({ kind: 'view.msg', view: 'v1', message: { type: 'stop' } }));
    ok('a rescoped socket is judged by its new scope, and the refused press is written', mem.list()[0].op === 'stop' && mem.list()[0].ok === false);

    x = open('10.0.0.6');
    hello(x, gone.id);
    e = mem.list()[0];
    ok('a revoked device turned away is written with the reason', e.what === 'refused' && !e.ok && e.detail === 'revoked' && e.name === 'Old' && e.address === '10.0.0.6');
    x = open();
    hello(x, 'dev_nobody');
    e = mem.list()[0];
    ok('an unknown device is written by the id it gave', e.what === 'refused' && e.device === 'dev_nobody' && e.detail === 'unknown-device' && e.address === undefined);
    x = open();
    hello(x, dev.id, { signature: 'AAAA' });
    ok('a bad signature is written', mem.list()[0].detail === 'bad-signature' && mem.list()[0].name === 'Pixel');
    x = open();
    hello(x, dev.id, { contract: K.CONTRACT_VERSION + 1 });
    ok('another contract is written', mem.list()[0].detail === 'contract');

    console.log(`remote audit: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
