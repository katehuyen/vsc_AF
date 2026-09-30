// X-444 — THE AGENT FARM APP CARD in Toolbox: its data decided in core/remoteCard,
// its four acts in panels/toolboxRemote, drawn by media/afPhoneApp.js.
'use strict';
const Module = require('module');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const C = require(path.join(ROOT, 'out', 'core', 'remoteCard.js'));

const NOW = Date.parse('2026-09-30T12:00:00Z');
const input = o => Object.assign({
    mode: 'lan', port: 7443, runner: true,
    status: { listening: true, farm: { id: 'farm_1', name: 'Ev' }, port: 7443, addresses: ['192.168.1.40:7443'],
        fingerprint: 'ab'.repeat(32), sockets: 1 },
    devices: [
        { id: 'd1', name: 'Pixel', scope: 'answer', pairedAt: NOW - 5e8, revoked: false },
        { id: 'd2', name: 'Old', scope: 'read', pairedAt: NOW - 1e6, revoked: true },
        { id: 'd3', name: 'Tablet', scope: 'read', pairedAt: NOW - 1e7, revoked: false }
    ]
}, o || {});

// ---------- the state, one sentence each ----------
const st = o => C.remoteCardStatus(input(o));
ok('off: no phone, whatever the host says', st({ mode: 'off' }).state === 'off' && st({ mode: 'off' }).tone === 'off' && !st({ mode: 'off' }).phoneReachable);
ok('another window runs the queue: it hosts the phone', st({ runner: false }).state === 'other-window' && st({ runner: false }).tone === 'warn');
const nl = st({ status: { ...input().status, listening: false, reason: 'port 7443 is already in use' } });
ok('chosen but not listening: bad, with the host\'s reason', nl.state === 'not-listening' && nl.tone === 'bad' && /already in use/.test(nl.detail));
ok('a reason ending in a question mark is not given a second full stop', /running\?$/.test(st({ status: { ...input().status, listening: false, reason: 'is Tailscale running?' } }).detail)
    && /in use\.$/.test(nl.detail));
ok('local: listening, but no phone can reach it', st({ mode: 'local' }).state === 'local-only' && !st({ mode: 'local' }).phoneReachable);
ok('lan: reachable on this network', st().state === 'listening' && st().phoneReachable && /Wi-Fi/.test(st().detail));
ok('tailscale: reachable from anywhere', /anywhere/.test(st({ mode: 'tailscale' }).detail));

// ---------- the data ----------
const d = C.remoteCardData(input(), NOW);
ok('paired phones first, newest first; revoked last', d.devices.map(x => x.id).join() === 'd3,d1,d2');
ok('only active phones are counted', d.activeDevices === 2);
ok('the host\'s facts pass through', d.port === 7443 && d.sockets === 1 && d.farm.name === 'Ev' && d.addresses[0] === '192.168.1.40:7443');
ok('no pairing code unless one was made', d.pair === undefined);

const LINK = 'agentfarm://pair?v=1&farm=farm_1&name=Ev&code=483920&fp=' + 'ab'.repeat(32) + '&a=192.168.1.40:7443';
const withPair = o => C.remoteCardData(input(Object.assign({ pair: { link: LINK, addresses: ['192.168.1.40:7443'], until: NOW + 9.5 * 60e3 } }, o)), NOW);
const p = withPair().pair;
ok('a fresh code is drawn as a QR, with the minutes left rounded up', p && /<svg/.test(p.qr) && p.minutes === 10 && p.link === LINK);
ok('an expired code is gone', withPair({ pair: { link: LINK, addresses: [], until: NOW } }).pair === undefined);
ok('a code is never drawn where a phone cannot use it', withPair({ mode: 'local' }).pair === undefined
    && withPair({ runner: false }).pair === undefined);
const huge = withPair({ pair: { link: 'x'.repeat(5000), addresses: [], until: NOW + 60e3 } }).pair;
ok('a link too long for a QR keeps the link and draws no code', huge && huge.qr === undefined && huge.minutes === 1);

// ---------- the four acts, through the real host module ----------
(async () => {
    let answer;
    const warns = [];
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { window: { showWarningMessage: m => { warns.push(m); return Promise.resolve(answer); } } };
        }
        return origLoad.apply(this, arguments);
    };
    const T = require(path.join(ROOT, 'out', 'panels', 'toolboxRemote.js'));
    Module._load = origLoad;

    const calls = [];
    let listening = true;
    const host = {
        snapshot: () => ({ ...input(), status: { ...input().status, listening, reason: listening ? undefined : 'no Tailscale address' } }),
        setRemoteListen: async m => { calls.push(['listen', m]); },
        pairingLink: () => listening ? { link: LINK, addresses: ['192.168.1.40:7443'] } : { error: 'not listening (off)' },
        revoke: id => { calls.push(['revoke', id]); return id === 'nope' ? 0 : id === undefined ? 2 : 1; }
    };
    let said, pair = 'unset';
    const ctx = { host, setPair: x => { pair = x; }, say: m => { said = m; } };
    const send = msg => T.remoteCardMessage(msg, ctx);

    ok('someone else\'s message is not the card\'s', (await send({ type: 'web-start' })) === false);
    ok('without a host it says so', (await T.remoteCardMessage({ type: 'remote-pair' }, { setPair() {}, say: m => { said = m; } })) && said.ok === false);

    await send({ type: 'remote-listen', mode: 'lan' });
    ok('listen sets the mode and drops a shown code', JSON.stringify(calls.pop()) === '["listen","lan"]' && pair === undefined && said.ok);
    await send({ type: 'remote-listen', mode: 'wifi' });
    ok('an unknown mode is refused, nothing written', calls.length === 0 && said.ok === false);
    listening = false;
    await send({ type: 'remote-listen', mode: 'tailscale' });
    ok('a mode that could not listen says why', said.ok === false && /no Tailscale address/.test(said.text));
    await send({ type: 'remote-listen', mode: 'off' });
    ok('off says so', said.ok && /off/.test(said.text));
    calls.length = 0;

    await send({ type: 'remote-pair' });
    ok('pair while not listening: the host\'s reason, no code', said.ok === false && pair === undefined);
    listening = true;
    const t0 = Date.now();
    await send({ type: 'remote-pair' });
    ok('pair keeps the code for the host\'s 10 minutes', pair && pair.link === LINK && pair.until >= t0 + T.PAIR_TTL_MS && pair.until <= Date.now() + T.PAIR_TTL_MS);

    answer = undefined;
    await send({ type: 'remote-revoke', device: 'd1', name: 'Pixel' });
    ok('revoke asks first; a dismissed question revokes nothing', calls.length === 0 && said === undefined && /Pixel/.test(warns.pop()));
    answer = 'Revoke';
    await send({ type: 'remote-revoke', device: 'd1', name: 'Pixel' });
    ok('confirmed, it revokes that phone', JSON.stringify(calls.pop()) === '["revoke","d1"]' && said.ok);
    await send({ type: 'remote-revoke', device: 'nope', name: 'Ghost' });
    ok('a phone that was not paired says so', said.ok === false && calls.pop()[1] === 'nope');
    await send({ type: 'remote-revoke' });
    ok('a revoke naming nobody asks nothing', said.ok === false && calls.length === 0);
    answer = 'Revoke';
    await send({ type: 'remote-revoke-all' });
    ok('revoke all needs its own answer', calls.length === 0 && said === undefined);
    answer = 'Revoke all';
    await send({ type: 'remote-revoke-all' });
    ok('confirmed, every phone', calls.pop()[1] === undefined && /2 phone/.test(said.text));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
