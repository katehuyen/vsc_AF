// X-442 — ONE PHONE'S SOCKET, challenge to close, without a socket.
//
// Every refusal the handshake owes (order, contract, unknown, revoked, bad
// signature, silence), the welcome with what the phone missed, calls answered
// exactly once — also when the resend arrives while the first is still running —
// and page frames routed to the views and closed with the socket.
'use strict';
const crypto = require('crypto');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = p => require(path.join(ROOT, 'out', 'remote', ...p));
const { RemoteSession, CallMemory } = out(['server', 'session.js']);
const { DeviceBook } = out(['server', 'devices.js']);
const { EventLog } = out(['server', 'eventLog.js']);
const K = out(['contract', 'index.js']);

const farm = { id: 'farm_t', name: 'Ev' };
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const devices = new DeviceBook(null);
const dev = devices.add('Pixel', publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
const gone = devices.add('Old', publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
devices.revoke(gone.id);
let t = 100;
const events = new EventLog(null, 2, () => t);
['a', 'b', 'c'].forEach(x => events.append('notice.posted', { id: x }));

let runs = 0;
function open(extra = {}) {
    const sent = [];
    const wire = { closed: false, send: s => sent.push(JSON.parse(s)), close: () => { wire.closed = true; } };
    const calls = extra.calls || new CallMemory();
    const s = new RemoteSession(wire, {
        farm, devices, events, calls, views: extra.views || null, helloTimeoutMs: extra.timeout || 5000,
        features: c => ({ 'remote.control': { allowed: c.scope === 'manage' } }),
        callOp: async (op, args, caller) => {
            runs++;
            await new Promise(r => setTimeout(r, 20));
            if (op === 'boom') { throw new Error('patladı'); }
            return { ok: true, result: { op, args, caller } };
        },
    });
    return { s, sent, wire, last: () => sent[sent.length - 1] };
}
const sign = (nonce, device = dev.id, key = privateKey) => crypto.sign('sha256', Buffer.from(K.signedText(farm.id, device, nonce)), key).toString('base64');
const hello = (x, more = {}) => x.s.onMessage(JSON.stringify({ kind: 'hello', device: dev.id, contract: K.CONTRACT_VERSION, signature: sign(x.s.nonce), ...more }));
const refusal = x => (x.wire.closed && x.last().kind === 'refuse') ? x.last() : null;
const tick = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    let x = open();
    ok('the socket opens with a challenge naming the farm and contract', x.sent[0].kind === 'challenge' && x.sent[0].farm.id === 'farm_t' && x.sent[0].contract === K.CONTRACT_VERSION && x.sent[0].nonce === x.s.nonce);
    x.s.onMessage(JSON.stringify({ kind: 'ping', ts: 1 }));
    ok('anything before hello is refused not-allowed', refusal(x)?.reason === 'not-allowed');

    x = open(); hello(x, { contract: K.CONTRACT_VERSION + 1 });
    ok('another contract is refused with the version this farm needs', refusal(x)?.reason === 'contract' && refusal(x).minContract === K.CONTRACT_VERSION);
    x = open(); hello(x, { device: 'dev_nobody' });
    ok('an unknown device is refused', refusal(x)?.reason === 'unknown-device');
    x = open(); x.s.onMessage(JSON.stringify({ kind: 'hello', device: gone.id, contract: K.CONTRACT_VERSION, signature: sign(x.s.nonce, gone.id) }));
    ok('a revoked device is refused as revoked', refusal(x)?.reason === 'revoked');
    x = open(); hello(x, { signature: sign('b64:another-nonce') });
    ok('a signature over another nonce is refused', refusal(x)?.reason === 'bad-signature');
    x = open({ timeout: 30 }); await tick(60);
    ok('silence after the challenge is refused in time', refusal(x)?.reason === 'not-allowed');

    x = open(); hello(x, { resumeAfter: events.lastSeq - 3 });
    const w = x.sent[1];
    ok('a signed hello is welcomed with scope, features, lastSeq and a page session',
        w.kind === 'welcome' && w.device === dev.id && w.scope === 'manage' && w.features['remote.control'].allowed === true && w.lastSeq === events.lastSeq && /^s_/.test(w.session) && x.s.token === w.session);
    ok('what it missed follows: the gap, then the held events', x.sent[2].kind === 'gap' && x.sent.slice(3).map(e => e.seq).join() === [events.lastSeq - 1, events.lastSeq].join());
    ok('the welcome is a valid contract frame', K.checkFrame(w).ok);

    const before = runs;
    x.s.onMessage(JSON.stringify({ kind: 'call', id: 'c1', op: 'farm.ping', args: { a: 1 } }));
    x.s.onMessage(JSON.stringify({ kind: 'call', id: 'c1', op: 'farm.ping', args: { a: 1 } }));
    await tick(60);
    const results = x.sent.filter(f => f.kind === 'result' && f.id === 'c1');
    ok('a resend while the first is running runs the op once', runs - before === 1 && results.length === 2);
    ok('the second answer is the same one, marked duplicate', results[1].duplicate === true && JSON.stringify(results[1].result) === JSON.stringify(results[0].result));
    ok('the op sees the caller: device and scope', results[0].result.caller.device === dev.id && results[0].result.caller.scope === 'manage');
    x.s.onMessage(JSON.stringify({ kind: 'call', id: 'c2', op: 'boom' })); await tick(40);
    ok('a throwing op answers ok:false with its message', x.last().id === 'c2' && x.last().ok === false && x.last().error === 'patladı');
    x.s.onMessage(JSON.stringify({ kind: 'call', id: 'c3' }));
    ok('a malformed call answers its own id with the reason', x.last().id === 'c3' && x.last().ok === false && /op/.test(x.last().error));
    x.s.onMessage(JSON.stringify({ kind: 'ping', ts: 7 }));
    ok('ping is answered pong with its ts', x.last().kind === 'pong' && x.last().ts === 7);
    x.s.push(events.append('turn.finished', { session: 's', agent: 'a', title: 't', summary: '' }));
    ok('an event is pushed to a welcomed phone', x.last().kind === 'event' && x.last().seq === events.lastSeq);
    const y = open(); y.s.push(events.append('x', {}));
    ok('nothing is pushed before the welcome', y.sent.length === 1);

    x.s.onMessage(JSON.stringify({ kind: 'view.open', view: 'v1', page: 'now' }));
    ok('without views a page open is answered unavailable', x.last().kind === 'view.close' && x.last().view === 'v1' && x.last().reason === 'unavailable');
    const log = [];
    const views = {
        open: (caller, view, page, args, post) => { log.push('open:' + view + ':' + page + ':' + caller.device); post({ hi: 1 }); },
        message: (view, m) => log.push('msg:' + view + ':' + JSON.stringify(m)),
        close: view => log.push('close:' + view),
    };
    const z = open({ views }); hello(z);
    z.s.onMessage(JSON.stringify({ kind: 'view.open', view: 'v2', page: 'now' }));
    ok('a page open reaches the views with the caller, and its posts reach the phone', log[0] === 'open:v2:now:' + dev.id && z.last().kind === 'view.post' && z.last().view === 'v2' && z.last().message.hi === 1);
    z.s.onMessage(JSON.stringify({ kind: 'view.msg', view: 'v2', message: { q: 1 } }));
    z.s.onMessage(JSON.stringify({ kind: 'view.msg', view: 'v9', message: {} }));
    ok('page messages reach only views this socket opened', log[1] === 'msg:v2:{"q":1}' && log.length === 2);
    z.s.ended();
    ok('a closed socket closes its pages', log[2] === 'close:v2');

    console.log(`remote session: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
