// X-442 — THE PHONE HOST'S LIFE IN THE EXTENSION: listen where told, move when
// told, stop, one change at a time; devices listed and revoked while stopped too;
// a taken port or a failed start reads as a reason, never a throw.
'use strict';
const fs = require('fs');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// Count the running server's socket drops: control reaches the host through the module's export.
const serve = require(path.join(ROOT, 'out', 'remote', 'serve.js'));
let drops = 0;
const realStart = serve.startRemoteHost;
serve.startRemoteHost = async (...a) => {
    const r = await realStart(...a);
    const d = r.server.dropRevoked.bind(r.server);
    r.server.dropRevoked = () => { drops++; return d(); };
    const rs = r.server.rescope.bind(r.server);
    r.server.rescope = (dev, scope) => { rescopes.push(dev + ':' + scope); return rs(dev, scope); };
    return r;
};
const rescopes = [];
const { createRemoteControl } = require(path.join(ROOT, 'out', 'remote', 'index.js'));
const { DeviceBook } = require(path.join(ROOT, 'out', 'remote', 'server', 'devices.js'));

function fakePort(dir) {
    const listeners = new Set();
    const logs = [];
    return {
        logs, listeners,
        farm: () => ({ id: 'farm_c', name: 'Ev' }),
        callOp: async op => ({ ok: true, result: { op } }),
        subscribe: l => { listeners.add(l); return () => listeners.delete(l); },
        can: () => ({ allowed: true }),
        storageDir: () => dir,
        log: l => logs.push(l),
    };
}

const health = port => new Promise(resolve => {
    https.get({ host: '127.0.0.1', port, path: '/health', rejectUnauthorized: false, agent: false }, res => {
        let s = ''; res.on('data', d => { s += d; }); res.on('end', () => resolve(JSON.parse(s)));
    }).on('error', e => resolve({ error: e.code }));
});
const postJson = (port, p, body) => new Promise(resolve => {
    const data = JSON.stringify(body);
    const req = https.request({ host: '127.0.0.1', port, path: p, method: 'POST', rejectUnauthorized: false, agent: false,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', e => resolve(e.code));
    req.end(data);
});
const freePort = () => new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-control-'));
    const store = path.join(dir, 'remote');
    try {
        fs.mkdirSync(store, { recursive: true });
        const seed = new DeviceBook(path.join(store, 'devices.json'));
        const a = seed.add('Pixel', 'pk-a');
        const b = seed.add('Tablet', 'pk-b');

        const p = fakePort(store);
        const c = createRemoteControl(p);
        let st = c.status();
        ok('before anything it is not listening, and says so', !st.listening && st.reason === 'not started' && st.addresses.length === 0);
        ok('its farm is the port\'s', st.farm.id === 'farm_c');
        ok('a pairing link is refused while not listening', 'error' in c.pairingLink() && /not listening/.test(c.pairingLink().error));
        ok('devices are listed from the file while stopped', c.devices().map(d => d.name).sort().join() === 'Pixel,Tablet');
        ok('a device row carries id, name, scope, user, pairedAt, revoked - never the key, last-seen only once seen',
            Object.keys(c.devices()[0]).sort().join() === 'id,name,pairedAt,revoked,scope,user' && c.devices()[0].user === 'owner');
        ok('revoking one while stopped writes the file', c.revoke(a.id) === 1
            && new DeviceBook(path.join(store, 'devices.json')).get(a.id).revoked === true);

        // X-444 - a scope chosen on the card, while stopped: the file holds it
        let sc = c.setScope(b.id, 'read');
        ok('a scope change while stopped writes the file and names what it was', sc.ok && sc.from === 'manage' && sc.device.scope === 'read'
            && new DeviceBook(path.join(store, 'devices.json')).get(b.id).scope === 'read');
        ok('a revoked phone keeps its scope: it must pair again', !c.setScope(a.id, 'admin').ok && /revoked/.test(c.setScope(a.id, 'admin').error));
        ok('a scope the contract does not know is refused by name', /read \| answer \| manage \| admin/.test(c.setScope(b.id, 'owner').error));
        ok('an unknown phone is refused', !c.setScope('dev_none', 'read').ok);
        let log = c.audit();
        ok('the revoke and the change are in the audit log, newest first, with the names',
            log.length === 2 && log[0].what === 'scope' && log[0].detail === 'manage -> read' && log[0].name === 'Tablet'
            && log[1].what === 'revoke' && log[1].device === a.id && log[1].name === 'Pixel' && log[1].user === 'owner');
        ok('the same scope again writes nothing', c.setScope(b.id, 'read').from === 'read' && c.audit().length === 2);
        let threw = '';
        try { c.audit({ what: ['nope'] }); } catch (e) { threw = e.message; }
        ok('a kind the log does not know is refused, naming the kinds', /pair-refused/.test(threw) && /not nope/.test(threw));
        ok('a kind filter keeps only that kind', c.audit({ what: ['revoke'] }).length === 1);

        const port1 = await freePort();
        st = await c.apply({ host: '127.0.0.1', port: port1, addresses: ['127.0.0.1'] });
        ok('apply listens where told', st.listening && st.port === port1 && st.host === '127.0.0.1' && !st.reason);
        ok('the status names host:port addresses and a fingerprint', st.addresses.join() === `127.0.0.1:${port1}` && /^[0-9a-f]{64}$/.test(st.fingerprint));
        ok('it really answers', (await health(port1)).farm.id === 'farm_c');
        const pl = c.pairingLink();
        ok('a pairing link while listening names the addresses', pl.link && pl.link.startsWith('agentfarm://pair?') && pl.addresses.join() === `127.0.0.1:${port1}`);
        ok('the same target again is not a restart', (await c.apply({ host: '127.0.0.1', port: port1, addresses: ['127.0.0.1'] })).listening
            && p.logs.filter(l => l.includes('stopped')).length === 0);
        sc = c.setScope(b.id, 'answer');
        ok('a scope change while running reaches the open sockets at once', sc.ok && rescopes.join() === b.id + ':answer'
            && c.devices().find(d => d.id === b.id).scope === 'answer');
        ok('no change, no socket touched', c.setScope(b.id, 'answer').ok && rescopes.length === 1);
        ok('a wrong pairing code is turned away', await postJson(port1, '/pair', { code: 'WRONG000', name: 'Intruder', publicKey: 'pk', platform: 'android', app: '0.2.0' }) === 403);
        ok('and the host writes it, with the name it gave and where from', c.audit()[0].what === 'pair-refused'
            && c.audit()[0].name === 'Intruder' && c.audit()[0].device === '' && c.audit()[0].address === '127.0.0.1');
        ok('revoking every phone while running', c.revoke() === 1 && c.devices().every(d => d.revoked));
        log = c.audit();
        ok('the running host and this side write one log', log.length === 5 && log[0].what === 'revoke' && log[0].device === b.id
            && log[1].what === 'pair-refused'
            && fs.readFileSync(path.join(store, 'audit.jsonl'), 'utf8').trim().split('\n').length === 5);
        ok('and their open sockets are dropped at once', drops === 1);
        ok('revoking nobody drops nothing', c.revoke('nope') === 0 && drops === 1);

        // two changes at once: served one after the other, the last one wins
        const port2 = await freePort(), port3 = await freePort();
        const [s2, s3] = await Promise.all([
            c.apply({ host: '127.0.0.1', port: port2, addresses: ['127.0.0.1'] }),
            c.apply({ host: '127.0.0.1', port: port3, addresses: ['127.0.0.1'] })
        ]);
        ok('changes are served in order', s2.port === port2 && s3.port === port3);
        ok('after a burst only the last one listens', (await health(port3)).farm && (await health(port1)).error && (await health(port2)).error);

        // a taken port is a reason, not a throw
        const taken = net.createServer();
        await new Promise(r => taken.listen(0, '127.0.0.1', r));
        const busy = taken.address().port;
        st = await c.apply({ host: '127.0.0.1', port: busy, addresses: ['127.0.0.1'] });
        ok('a taken port: not listening, the reason names the setting', !st.listening && /already in use/.test(st.reason) && /agentFarm\.remote\.port/.test(st.reason));
        ok('and the old listener is gone', (await health(port3)).error !== undefined);
        taken.close();
        st = await c.apply({ host: '127.0.0.1', port: busy, addresses: ['127.0.0.1'] });
        ok('the same target after the port frees up is tried again', st.listening && st.port === busy);

        st = await c.apply(null, 'another window runs the task queue');
        ok('stop says why', !st.listening && st.reason === 'another window runs the task queue' && st.sockets === 0);
        ok('and frees the port', (await health(busy)).error !== undefined);
        ok('stopping twice keeps the latest reason', (await c.apply(null, 'off')).reason === 'off');
        ok('stop without a reason keeps the one it had', (await c.apply(null)).reason === 'off');

        await c.apply({ host: '127.0.0.1', port: busy, addresses: ['127.0.0.1'] });
        await c.dispose();
        ok('dispose stops it', !c.status().listening && c.status().reason === 'disposed' && (await health(busy)).error !== undefined);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
