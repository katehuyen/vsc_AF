// X-442 (step 1) — THE SHELL ↔ HOST CONTRACT, measured from its one source.
//
// The Android shell carries a copy of src/remote/contract/remote-contract.v1.json
// and derives its models from it. So the JSON has to be internally sound: every
// frame and event declares its sender and fields, and every example it gives
// passes the very checker the host will run. A frame whose example fails its own
// declaration would be copied to the phone and fail there first.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const K = require(path.join(ROOT, 'out', 'remote', 'contract', 'index.js'));
const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'remote', 'contract', 'remote-contract.v1.json'), 'utf8'));

// ---------- THE FILE ----------
ok('version is a positive integer', Number.isInteger(K.CONTRACT_VERSION) && K.CONTRACT_VERSION >= 1);
ok('the module reads the same version as the file', K.CONTRACT_VERSION === json.version);
ok('frame kinds are the file\'s frames', JSON.stringify(K.frameKinds()) === JSON.stringify(Object.keys(json.frames)));
ok('event types are the file\'s events', JSON.stringify(K.eventTypes()) === JSON.stringify(Object.keys(json.events)));
ok('scopes are ordered least to most', JSON.stringify(K.SCOPES) === JSON.stringify(['read', 'answer', 'manage', 'admin']));
ok('feature ids are unique and remote.*', new Set(K.FEATURES).size === K.FEATURES.length && K.FEATURES.every(f => /^remote\.[a-z]+$/.test(f)));

// ---------- EVERY DECLARATION CARRIES AN EXAMPLE THAT PASSES IT ----------
for (const kind of K.frameKinds()) {
    ok(`${kind}: declares its sender`, ['host', 'client', 'either'].includes(K.frameSender(kind)));
    const ex = K.frameExample(kind);
    ok(`${kind}: has an example`, !!ex);
    ok(`${kind}: example names its own kind`, ex && ex.kind === kind);
    const r = K.checkFrame(ex);
    ok(`${kind}: example passes the checker${r.ok ? '' : ' — ' + r.error}`, r.ok);
}
for (const type of K.eventTypes()) {
    const ex = K.eventExample(type);
    const r = K.checkFrame({ kind: 'event', seq: 1, type, ts: 1, data: ex });
    ok(`event ${type}: example passes${r.ok ? '' : ' — ' + r.error}`, !!ex && r.ok);
}
const pair = K.pairingShapes();
ok('pair.request example passes', K.checkPairRequest(pair.request.example).ok);
ok('pair.response example passes', K.checkFields(pair.response.example, pair.response.fields, 'r').ok);

// ---------- THE CHECKER BITES ----------
{
    const hello = { ...K.frameExample('hello') };
    delete hello.signature;
    const r = K.checkFrame(hello);
    ok('a missing required field is refused, by name', !r.ok && /signature/.test(r.error));
    const noResume = { ...K.frameExample('hello') };
    delete noResume.resumeAfter;
    ok('a missing optional field is fine', K.checkFrame(noResume).ok);
    ok('a wrong type is refused', !K.checkFrame({ ...K.frameExample('ping'), ts: 'now' }).ok);
    ok('an unknown kind is refused', !K.checkFrame({ kind: 'teleport' }).ok);
    ok('no kind at all is refused', !K.checkFrame({ view: 'v1' }).ok);
    ok('an extra field from a newer peer is fine', K.checkFrame({ ...K.frameExample('ping'), later: 1 }).ok);
    const badEvent = { kind: 'event', seq: 2, type: 'ask.opened', ts: 1, data: { session: 's' } };
    ok('an event whose data misses fields is refused', !K.checkFrame(badEvent).ok);
    const unknownEvent = { kind: 'event', seq: 3, type: 'future.thing', ts: 1, data: {} };
    ok('an unknown event type passes (clients ignore it)', K.checkFrame(unknownEvent).ok);
}

// ---------- THE TWO STRINGS BOTH SIDES MUST SPELL THE SAME ----------
{
    ok('signed text follows the declared rule',
        K.signedText('farm_7f3a', 'dev_1', 'n0') === `agentfarm.remote/${K.CONTRACT_VERSION}|farm_7f3a|dev_1|n0`);
    ok('the transport rule quotes the same text', json.transport.signature.includes('agentfarm.remote/1|<farm id>|<device id>|<nonce>'));
    const info = { v: 1, farm: 'farm_7f3a', name: 'Masaüstü & Ofis', code: '7Q2M-9KXD', fp: 'AB12cd', addresses: ['192.168.1.40:8379', '100.64.0.7:8379'] };
    const uri = K.pairingUri(info);
    ok('pairing uri has the declared scheme', uri.startsWith('agentfarm://pair?'));
    const back = K.parsePairingUri(uri);
    ok('pairing uri round-trips (Turkish name, &, two addresses)', back && back.name === info.name && back.addresses.length === 2 && back.code === info.code);
    ok('fingerprint is normalised to lowercase', back && back.fp === 'ab12cd');
    ok('a uri missing a declared field is refused', K.parsePairingUri(uri.replace(/&code=[^&]*/, '')) === undefined);
    ok('a foreign uri is refused', K.parsePairingUri('https://example.com/?v=1') === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
