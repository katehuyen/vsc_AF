#!/usr/bin/env node
// THE PHONE, IN A SCRIPT: checks a live Agent Farm remote host end to end
// without a phone — pair with a link, answer the challenge, call an op, print
// the events that arrive.
//
//   node tools/remote_probe.js "<agentfarm://pair?... link>"   first run: pairs
//   node tools/remote_probe.js                                 later runs: the saved device
//   options: --state <file> (default: <tmp>/agentfarm-probe.json)
//            --name <device name> · --call <op> (default farm.health) · --args <json>
//            --listen <seconds> (default 5)
//
// The saved device holds a private key; delete the file (and revoke the device
// in Toolbox) when done.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { request, socket, addrOf } = require('./remoteClient');
const K = require(path.join(__dirname, '..', 'out', 'remote', 'contract', 'index.js'));

function parseArgs(argv) {
    const o = { link: '', state: path.join(os.tmpdir(), 'agentfarm-probe.json'), name: 'remote_probe',
        call: 'farm.health', args: {}, listen: 5 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--state') { o.state = argv[++i]; }
        else if (a === '--name') { o.name = argv[++i]; }
        else if (a === '--call') { o.call = argv[++i]; }
        else if (a === '--args') { o.args = JSON.parse(argv[++i]); }
        else if (a === '--listen') { o.listen = Number(argv[++i]); }
        else { o.link = a; }
    }
    return o;
}

/** The first address that answers /health with the pinned certificate. */
async function reachable(addresses, fp, say) {
    for (const text of addresses) {
        const addr = addrOf(text);
        try {
            const h = await request(addr, fp, 'GET', '/health');
            if (h.status === 200) { say(`ok   ${text} answers: farm ${h.json.farm.name} (${h.json.farm.id}), contract ${h.json.contract}`); return addr; }
            say(`FAIL ${text} /health -> ${h.status}`);
        } catch (e) { say(`FAIL ${text}: ${e.message}`); }
    }
    return null;
}

async function pair(o, say) {
    const link = K.parsePairingUri(o.link);
    if (!link) { throw new Error('not a pairing link (agentfarm://pair?...)'); }
    const addr = await reachable(link.addresses, link.fp, say);
    if (!addr) { throw new Error('no address in the link answers - same network? firewall?'); }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const r = await request(addr, link.fp, 'POST', '/pair', {
        code: link.code, name: o.name, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        platform: `node ${process.version} ${process.platform}`, app: 'remote_probe'
    });
    if (r.status !== 200) { throw new Error(`pairing refused: ${r.status} ${r.body.slice(0, 200)}`); }
    const state = { farm: link.farm, fp: link.fp, addresses: link.addresses, device: r.json.device, scope: r.json.scope,
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
    fs.writeFileSync(o.state, JSON.stringify(state, null, 2), { mode: 0o600 });
    say(`ok   paired as ${state.device} (scope ${state.scope}); saved to ${o.state}`);
    return { state, addr };
}

async function run(o, say) {
    let state, addr;
    if (o.link) { ({ state, addr } = await pair(o, say)); }
    else {
        if (!fs.existsSync(o.state)) { throw new Error(`no saved device at ${o.state} - pass a pairing link first`); }
        state = JSON.parse(fs.readFileSync(o.state, 'utf8'));
        addr = await reachable(state.addresses, state.fp, say);
        if (!addr) { throw new Error('the saved farm does not answer'); }
    }
    const c = await socket(addr, state.fp);
    try {
        const ch = await c.wait(f => f.kind === 'challenge');
        if (!ch) { throw new Error('no challenge on the socket'); }
        const sig = crypto.sign('sha256', Buffer.from(K.signedText(state.farm, state.device, ch.nonce)),
            crypto.createPrivateKey(state.privateKey)).toString('base64');
        c.send({ kind: 'hello', device: state.device, contract: K.CONTRACT_VERSION, signature: sig });
        const w = await c.wait(f => f.kind === 'welcome' || f.kind === 'refuse');
        if (!w || w.kind === 'refuse') { throw new Error('hello refused: ' + (w ? w.reason : 'no answer')); }
        say(`ok   welcomed (session ${String(w.session).slice(0, 8)}…)`);
        if (o.call) {
            // a fresh id per run: the host answers a repeated id from its exactly-once memory
            const id = 'probe_' + crypto.randomBytes(6).toString('hex');
            c.send({ kind: 'call', id, op: o.call, args: o.args });
            const r = await c.wait(f => f.kind === 'result' && f.id === id, 15000);
            if (!r) { throw new Error(`${o.call}: no result`); }
            say(`${r.ok ? 'ok  ' : 'FAIL'} ${o.call} -> ${JSON.stringify(r.ok ? r.result : r.error).slice(0, 300)}`);
            if (!r.ok) { return 1; }
        }
        c.onFrame = f => { if (f.kind === 'event') { say(`event #${f.seq} ${f.type} ${JSON.stringify(f.data).slice(0, 200)}`); } };
        c.frames.filter(f => f.kind === 'event').forEach(c.onFrame);
        await new Promise(r => setTimeout(r, Math.max(0, o.listen) * 1000));
        return c.closed ? 1 : 0;
    } finally { c.close(); }
}

if (require.main === module) {
    run(parseArgs(process.argv.slice(2)), l => console.log(l))
        .then(code => process.exit(code), e => { console.log('FAIL ' + e.message); process.exit(1); });
}

module.exports = { run, parseArgs };
