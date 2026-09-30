// X-442 — THE REMOTE HOST PUT TOGETHER FROM A RemotePort.
//
// With a stand-in port: state lands in the port's storage dir (certificate kept
// across restarts, so paired phones keep their pin), the port's events reach the
// server's log numbered, a stop unsubscribes and frees the listener.
'use strict';
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { startRemoteHost } = require(path.join(ROOT, 'out', 'remote', 'serve.js'));

function fakePort(dir) {
    const listeners = new Set();
    const logs = [];
    return {
        logs, listeners,
        farm: () => ({ id: 'farm_s', name: 'Ev' }),
        callOp: async op => ({ ok: true, result: { op } }),
        subscribe: l => { listeners.add(l); return () => listeners.delete(l); },
        can: f => ({ allowed: f !== 'remote.voice', reason: 'lisans' }),
        storageDir: () => dir,
        log: l => logs.push(l),
        fire: e => { for (const l of listeners) { l(e); } },
    };
}

const health = port => new Promise(resolve => {
    https.get({ host: '127.0.0.1', port, path: '/health', rejectUnauthorized: false, agent: false }, res => {
        let s = ''; res.on('data', d => { s += d; }); res.on('end', () => resolve(JSON.parse(s)));
    }).on('error', e => resolve({ error: e.code }));
});

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-serve-'));
    try {
        const p = fakePort(path.join(dir, 'remote'));
        const r = await startRemoteHost(p, { host: '127.0.0.1', port: 0 });
        ok('it binds the port the system gave', r.port > 0 && (await health(r.port)).farm.id === 'farm_s');
        ok('its state lives in the port\'s storage dir', ['host-cert.pem', 'host-key.pem'].every(f => fs.existsSync(path.join(dir, 'remote', f))));
        ok('a first start says a new certificate was made', p.logs.some(l => l.includes('new host certificate')));
        ok('it subscribes to the port\'s events', p.listeners.size === 1);
        p.fire({ type: 'notice.posted', data: { id: 'n1' } });
        const before = r.server.pairingLink(['127.0.0.1:1']);
        ok('a pairing link carries the kept fingerprint', before.includes('fp=' + r.fingerprint));
        // A request whose body never comes keeps its connection active, not idle.
        const stall = await new Promise(res => { const s = require('tls').connect({ host: '127.0.0.1', port: r.port, rejectUnauthorized: false }, () => res(s)); });
        stall.on('error', () => undefined);
        stall.write('POST /pair HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
        await new Promise(res => setTimeout(res, 50));
        const t0 = Date.now();
        await Promise.race([r.stop(), new Promise(res => setTimeout(res, 3000))]);
        ok('stop does not wait on a request still in flight', Date.now() - t0 < 1000);
        stall.destroy();
        ok('stop unsubscribes', p.listeners.size === 0);
        ok('and frees the listener', (await health(r.port)).error === 'ECONNREFUSED');
        ok('the fired event was numbered into the log on disk', JSON.parse(fs.readFileSync(path.join(dir, 'remote', 'events.json'), 'utf8')).events.some(e => e.type === 'notice.posted'));

        const p2 = fakePort(path.join(dir, 'remote'));
        const r2 = await startRemoteHost(p2, { host: '127.0.0.1', port: 0 });
        ok('a restart keeps the certificate, so paired phones keep their pin', r2.fingerprint === r.fingerprint && !p2.logs.some(l => l.includes('new host certificate')));
        await r2.stop();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    const { farmIdentity } = require(path.join(ROOT, 'out', 'remote', 'index.js'));
    const idDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-farmid-'));
    try {
        const a = farmIdentity(idDir, 'Ev');
        const b = farmIdentity(idDir, 'Ev (yeni ad)');
        ok('a farm id is minted once per install', /^farm_[0-9a-f]{12}$/.test(a.id) && b.id === a.id);
        ok('the name follows the caller, so a renamed machine keeps its phones', b.name === 'Ev (yeni ad)');
        fs.writeFileSync(path.join(idDir, 'farm.json'), '{"id":"x"}');
        ok('an id that is not one is minted again', farmIdentity(idDir, 'Ev').id !== 'x');
    } finally {
        fs.rmSync(idDir, { recursive: true, force: true });
    }
    console.log(`remote serve: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
