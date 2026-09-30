// X-442 — THE PHONE IN A SCRIPT (tools/remote_probe.js) against a real host:
// pairs from a link, saves the device, comes back without a code, calls an op,
// prints pushed events, and says plainly when a pin or an address is wrong.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { startRemoteHost } = require(path.join(ROOT, 'out', 'remote', 'serve.js'));
const { run, parseArgs } = require(path.join(ROOT, 'tools', 'remote_probe.js'));

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-probe-'));
    const listeners = new Set();
    const calls = [];
    const port = {
        farm: () => ({ id: 'farm_p', name: 'Ev' }),
        callOp: async (op, args) => {
            calls.push([op, args]);
            return op === 'bad.op' ? { ok: false, error: 'no such op' } : { ok: true, result: { op } };
        },
        subscribe: l => { listeners.add(l); return () => listeners.delete(l); },
        can: () => ({ allowed: true }),
        storageDir: () => path.join(dir, 'remote'),
        log: () => undefined,
    };
    const host = await startRemoteHost(port, { host: '127.0.0.1', port: 0 });
    const state = path.join(dir, 'probe.json');
    const lines = [];
    const say = l => lines.push(l);
    try {
        const o = parseArgs(['--state', state, '--name', 'Probe', '--listen', '0.4', '--call', 'farm.ops', '--args', '{"q":1}']);
        ok('options are read', o.state === state && o.name === 'Probe' && o.listen === 0.4 && o.call === 'farm.ops' && o.args.q === 1);
        ok('the default call is a read op, and it listens 5 s', parseArgs([]).call === 'farm.health' && parseArgs([]).listen === 5);

        const link = host.server.pairingLink([`127.0.0.1:${host.port}`]);
        setTimeout(() => { for (const l of listeners) { l({ type: 'notice.posted', data: { id: 'n1', title: 'Rapor' } }); } }, 150);
        let code = await run({ ...o, link }, say);
        ok('a first run pairs, is welcomed, calls and exits 0', code === 0
            && lines.some(l => /^ok {3}paired as dev_/.test(l)) && lines.some(l => /^ok {3}welcomed/.test(l)));
        ok('the call reaches the op with its args', calls.some(([op, a]) => op === 'farm.ops' && a && a.q === 1)
            && lines.some(l => /^ok {3}farm\.ops -> \{"op":"farm\.ops"\}/.test(l)));
        ok('a pushed event is printed with its number', lines.some(l => /^event #\d+ notice\.posted .*Rapor/.test(l)));
        const saved = JSON.parse(fs.readFileSync(state, 'utf8'));
        ok('the device is saved with its key and the pin', /^dev_/.test(saved.device) && saved.privateKey.includes('PRIVATE KEY')
            && saved.fp === host.fingerprint);

        lines.length = 0;
        code = await run({ ...o, link: '', listen: 0 }, say);
        ok('a later run needs no code: the saved device is welcomed', code === 0 && lines.some(l => /welcomed/.test(l)));

        lines.length = 0;
        await run({ ...o, link }, say).then(() => ok('a used code is refused', false),
            e => ok('a used code is refused, saying so', /pairing refused: 403/.test(e.message)));

        lines.length = 0;
        const bad = link.replace(/fp=[0-9a-f]+/, 'fp=' + '0'.repeat(64));
        await run({ ...o, link: bad }, say).then(() => ok('a wrong pin fails', false),
            e => ok('a wrong pin fails, naming the pin', /no address/.test(e.message) && lines.some(l => /pin mismatch/.test(l))));

        lines.length = 0;
        const gone = link.replace(/a=[^&]+/, 'a=127.0.0.1%3A1');
        await run({ ...o, link: gone }, say).then(() => ok('an unreachable address fails', false),
            e => ok('an unreachable address fails and says to check the network', /same network\? firewall\?/.test(e.message)));
        await run({ ...o, link: 'https://x' }, say).then(() => ok('not a link', false), e => ok('a non-link is refused', /not a pairing link/.test(e.message)));
        await run({ ...o, link: '', state: path.join(dir, 'none.json') }, say).then(() => ok('no state', false),
            e => ok('no saved device and no link says what to pass', /pass a pairing link/.test(e.message)));

        lines.length = 0;
        code = await run({ ...o, link: '', listen: 0, call: 'bad.op' }, say);
        ok('a refused call exits 1 with a FAIL line (a fresh call id: not the first run\'s remembered answer)', code === 1 && lines.some(l => /^FAIL bad\.op -> "no such op"/.test(l)));

        // a server with the farm's own certificate that is not a farm: /health is 404
        const { makeHostCert } = require(path.join(ROOT, 'out', 'remote', 'server', 'cert.js'));
        const cert = makeHostCert('stranger');
        const https = require('https');
        const stranger = https.createServer({ key: cert.keyPem, cert: cert.certPem }, (q, s) => { s.writeHead(404); s.end('{}'); });
        await new Promise(r => stranger.listen(0, '127.0.0.1', r));
        lines.length = 0;
        const other = link.replace(/fp=[0-9a-f]+/, 'fp=' + cert.fingerprint).replace(/a=[^&]+/, 'a=127.0.0.1%3A' + stranger.address().port);
        await run({ ...o, link: other }, say).then(() => ok('a non-farm fails', false),
            e => ok('an address whose /health is not 200 is not taken', /no address/.test(e.message) && lines.some(l => /health -> 404/.test(l))));
        stranger.close();

        host.devices.revoke(saved.device);
        lines.length = 0;
        await run({ ...o, link: '', listen: 0 }, say).then(() => ok('revoked', false),
            e => ok('a revoked device is refused at hello', /hello refused/.test(e.message)));
    } finally {
        await host.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
