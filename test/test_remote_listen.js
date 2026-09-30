// X-442 — WHERE THE PHONE HOST LISTENS, and which addresses a pairing QR names,
// read from an interface table so the choice is proved without a network.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const L = require(path.join(__dirname, '..', 'out', 'core', 'remoteListen.js'));

const v4 = (address, internal) => ({ address, family: 'IPv4', internal: !!internal });
const TABLE = {
    lo: [v4('127.0.0.1', true)],
    wifi: [v4('192.168.1.20'), { address: 'fe80::1', family: 'IPv6', internal: false }],
    eth: [{ address: '10.0.0.5', family: 4, internal: false }],
    docker: [v4('172.15.0.1'), v4('172.16.0.1'), v4('172.31.9.9'), v4('172.32.0.1')],
    tailscale: [v4('100.101.1.2'), v4('100.63.0.1'), v4('100.128.0.1')],
    public: [v4('8.8.4.4')],
    vnic: [v4('10.99.0.1', true)],
    gone: undefined
};

ok('the four modes are the modes', L.isListenMode('off') && L.isListenMode('local') && L.isListenMode('lan') && L.isListenMode('tailscale'));
ok('anything else is not', !L.isListenMode('LAN') && !L.isListenMode('') && !L.isListenMode(undefined) && !L.isListenMode(1));
ok('the default port', L.DEFAULT_REMOTE_PORT === 7443);

const off = L.listenPlan('off', TABLE);
ok('off does not listen, and says why', off.listen === false && /off/.test(off.reason));
const local = L.listenPlan('local', {});
ok('local binds loopback only, even with no interfaces', local.listen && local.host === '127.0.0.1' && local.addresses.join() === '127.0.0.1');

const lan = L.listenPlan('lan', TABLE);
ok('lan binds every interface', lan.listen && lan.host === '0.0.0.0');
ok('lan names private IPv4 only: 10/8, 172.16-31, 192.168 (numeric family too)',
    lan.addresses.slice().sort().join() === ['10.0.0.5', '172.16.0.1', '172.31.9.9', '192.168.1.20'].sort().join());
ok('an interface the OS marks internal is never named', !lan.addresses.includes('10.99.0.1'));
ok('lan never names loopback, IPv6, a public or a tailnet address',
    !lan.addresses.some(a => a === '127.0.0.1' || a.includes(':') || a === '8.8.4.4' || a.startsWith('100.')));
const noLan = L.listenPlan('lan', { lo: [v4('127.0.0.1', true)], ts: [v4('100.64.0.1')] });
ok('lan with no private address does not listen, and says why', noLan.listen === false && /private network/.test(noLan.reason));

const ts = L.listenPlan('tailscale', TABLE);
ok('tailscale binds its own 100.64/10 address, not all interfaces', ts.listen && ts.host === '100.101.1.2');
ok('tailscale names only the tailnet range (100.64-127)', ts.addresses.join() === '100.101.1.2');
ok('the range edges', L.isTailscale('100.64.0.0') && L.isTailscale('100.127.255.255') && !L.isTailscale('100.63.255.255')
    && !L.isTailscale('100.128.0.0') && !L.isTailscale('100.64.0'));
const noTs = L.listenPlan('tailscale', { wifi: [v4('192.168.1.20')] });
ok('tailscale with no tailnet address does not listen, and says why', noTs.listen === false && /Tailscale/.test(noTs.reason));
ok('private edges', L.isPrivateLan('172.16.0.0') && L.isPrivateLan('172.31.255.255') && !L.isPrivateLan('172.32.0.0')
    && !L.isPrivateLan('192.169.0.1') && !L.isPrivateLan('10.0.0'));

ok('pair addresses carry the port', L.pairAddresses(lan, 7443).includes('192.168.1.20:7443'));
ok('a plan that does not listen pairs nowhere', L.pairAddresses(off, 7443).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
