// X-442 — THE PHONE HOST ON THE BRIDGE: the remote.* ops dispatched through
// the real registry over stand-in deps, and wired in extension.ts to the host.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { remoteOps } = require(path.join(OUT, 'remoteOps.js'));

(async () => {
    const calls = [];
    let listening = false;
    const deps = {
        mode: () => 'lan',
        status: () => ({ listening, sockets: 0, mode: 'WRONG' }),
        setRemoteListen: async (mode, port) => { calls.push(['listen', mode, port]); return { listening: mode !== 'off' }; },
        pairingLink: () => listening ? { link: 'agentfarm://pair?c=1', addresses: ['1.2.3.4:7443'] } : { error: 'not listening (off)' },
        devices: () => [{ id: 'd1', name: 'Pixel', scope: 'read', pairedAt: 1, revoked: false }],
        revoke: id => { calls.push(['revoke', id]); return id === undefined ? 2 : 1; },
        setScope: (id, scope) => { calls.push(['scope', id, scope]); return id === 'd1' ? { ok: true, device: { id, scope }, from: 'manage' } : { ok: false, error: 'no paired device ' + id }; },
        audit: q => { calls.push(['audit', q]); if ((q.what || []).includes('nope')) { throw new Error('what is one or more of pair, call'); } return [{ ts: 1, what: 'call' }]; },
        firewall: async () => { calls.push(['firewall']); return { state: 'closed', canFix: true }; },
        allowFirewall: async () => { calls.push(['allow']); return { ok: true, verdict: { state: 'open' } }; }
    };
    const reg = new BridgeRegistry();
    reg.register(remoteOps(deps));
    const call = (op, args) => reg.dispatch(op, args || {});

    const ops = await call('farm.ops');
    const names = JSON.stringify(ops.result);
    ok('all seven ops are in the catalog', ['remote.status', 'remote.listen', 'remote.pair', 'remote.devices', 'remote.revoke',
        'remote.firewall', 'remote.firewall.allow'].every(o => names.includes(o)));

    let f = await call('remote.firewall');
    ok('firewall reads the verdict and changes nothing', f.ok && f.result.state === 'closed' && JSON.stringify(calls.pop()) === '["firewall"]');
    f = await call('remote.firewall.allow');
    ok('firewall.allow runs the card\'s act and hands back the fresh verdict', f.ok && f.result.ok && f.result.verdict.state === 'open'
        && JSON.stringify(calls.pop()) === '["allow"]');
    ok('firewall.allow warns that a person must answer the prompt', /a person must answer Yes/.test(names));

    let r = await call('remote.status');
    ok('status: the settings mode, over the host\'s status', r.ok && r.result.mode === 'lan' && r.result.listening === false);

    r = await call('remote.listen', { mode: 'tailscale' });
    ok('listen passes the mode, no port when none given', r.ok && r.result.listening && JSON.stringify(calls.pop()) === '["listen","tailscale",null]');
    r = await call('remote.listen', { mode: 'lan', port: 8443 });
    ok('a numeric port is passed', r.ok && JSON.stringify(calls.pop()) === '["listen","lan",8443]');
    r = await call('remote.listen', { mode: 'off', port: '9000' });
    ok('a port typed as text (af.js port=9000) is a number', r.ok && calls.pop()[2] === 9000);
    for (const bad of [{}, { mode: 'wifi' }, { mode: 'LAN' }]) {
        r = await call('remote.listen', bad);
        ok('listen refuses mode ' + JSON.stringify(bad.mode), !r.ok && calls.length === 0);
    }
    for (const port of [80, 1023, 65536, 7443.5, 'abc']) {
        r = await call('remote.listen', { mode: 'lan', port });
        ok('listen refuses port ' + port, !r.ok && /1024-65535/.test(r.error) && calls.length === 0);
    }
    ok('the edges are allowed', (await call('remote.listen', { mode: 'lan', port: 1024 })).ok
        && (await call('remote.listen', { mode: 'lan', port: 65535 })).ok);
    calls.length = 0;

    r = await call('remote.pair');
    ok('pair while not listening is refused with the host\'s reason', !r.ok && /not listening/.test(r.error));
    listening = true;
    r = await call('remote.pair');
    ok('pair while listening is the link and its addresses', r.ok && r.result.link.startsWith('agentfarm://pair?') && r.result.addresses.length === 1);

    r = await call('remote.devices');
    ok('devices is a list under devices', r.ok && r.result.devices.length === 1 && r.result.devices[0].id === 'd1');

    r = await call('remote.revoke');
    ok('revoke with nothing named is refused', !r.ok && /device/.test(r.error) && calls.length === 0);
    r = await call('remote.revoke', { all: false });
    ok('all:false is not all', !r.ok && calls.length === 0);
    r = await call('remote.revoke', { device: 'd1' });
    ok('revoke one', r.ok && r.result.revoked === 1 && JSON.stringify(calls.pop()) === '["revoke","d1"]');
    r = await call('remote.revoke', { all: 'true' });
    ok('revoke all (also as text), even if a device is named too', r.ok && r.result.revoked === 2 && calls.pop()[1] === undefined);
    r = await call('remote.revoke', { all: true, device: 'd1' });
    ok('all wins over a named device', r.ok && calls.pop()[1] === undefined);

    // ---------- X-444: a phone's scope and the audit log ----------
    ok('scope and audit are in the catalog', names.includes('remote.scope') && names.includes('remote.audit'));
    r = await call('remote.scope', { device: 'd1', scope: 'admin' });
    ok('scope passes device and scope, answers what it was', r.ok && r.result.from === 'manage' && JSON.stringify(calls.pop()) === '["scope","d1","admin"]');
    r = await call('remote.scope', { device: 'dX', scope: 'read' });
    ok('a refusal from the host is the op\'s error', !r.ok && /no paired device dX/.test(r.error) && calls.pop()[1] === 'dX');
    r = await call('remote.scope', { scope: 'read' });
    ok('scope without a device asks nothing of the host', !r.ok && calls.length === 0);
    r = await call('remote.audit');
    ok('audit with no args is the host\'s default list', r.ok && r.result.entries.length === 1 && JSON.stringify(calls.pop()) === '["audit",{}]');
    r = await call('remote.audit', { device: 'd1', what: 'call, action', since: '1000', limit: 5 });
    ok('audit passes the filters, a comma list and numbers typed as text',
        r.ok && JSON.stringify(calls.pop()) === '["audit",{"device":"d1","what":["call","action"],"since":1000,"limit":5}]');
    r = await call('remote.audit', { what: ['revoke'] });
    ok('what may come as a list', r.ok && JSON.stringify(calls.pop()[1].what) === '["revoke"]');
    r = await call('remote.audit', { what: 'nope' });
    ok('a kind the log does not know is the op\'s error', !r.ok && /one or more of/.test(r.error));
    calls.length = 0;

    // ---------- wiring in extension.ts ----------
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('extension registers remoteOps over the host control', /bridge\.register\(remoteOps\(\{[\s\S]{0,400}setRemoteListen/.test(src));
    ok('only the task-runner window listens', /!taskRunner\s*\?\s*await remote\.apply\(null,/.test(src));
    ok('a lease flip re-applies the host', /leaseFlipped\.push\(\(\) => \{ void applyRemote\(false\); \}\)/.test(src)
        && (src.match(/leaseFlipped\.forEach\(f => f\(\)\)/g) || []).length === 2);
    ok('a change to agentFarm.remote re-applies', /affectsConfiguration\('agentFarm\.remote'\)\) \{ void applyRemote\(\); \}/.test(src));
    ok('usage readings reach the phone', /usageRead\.forEach\(f => f\(usage\)\)/.test(src));
    ok('notices reach the phone', /noticesStore\.onAdd = n =>/.test(src));
    ok('the firewall guard watches the program that listens', /firewallGuard\(\{ exe: process\.execPath, port: \(\) => remoteCfg\(\)\.port \}\)/.test(src));
    ok('listening where a phone reaches re-reads the firewall and offers the fix once', /if \(remoteLive && phoneModes\(c\.mode\)\) \{\s*const fw = await firewall\.check\(\);\s*if \(warn && fw\?\.state === 'closed' && fw\.canFix && !firewallAsked\)/.test(src));
    ok('the card and the ops share one allow', /revoke: id => remote\.revoke\(id\),\s*allowFirewall\s*\};/.test(src)
        && /firewall: async \(\) => [^\n]*\n\s*allowFirewall\s*\}\)\);/.test(src));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
