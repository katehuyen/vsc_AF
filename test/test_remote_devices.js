// X-444 — PAIRED DEVICES and the one-time codes that pair them.
//
// A code pairs once and only for ten minutes; a device survives a reload, a
// revoke survives it too, and the signature check is the one the phone's
// handshake meets: ECDSA P-256 over SHA-256, the key as SPKI DER in base64.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { DeviceBook, CODE_TTL_MS, DEFAULT_SCOPE } = require(path.join(ROOT, 'out', 'remote', 'server', 'devices.js'));

let t = 5_000;
const clock = () => t;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-devices-'));
const file = path.join(dir, 'remote', 'devices.json');
try {
    const book = new DeviceBook(file, clock);
    const code = book.newCode();
    ok('a code is 8 upper-case hex characters', /^[0-9A-F]{8}$/.test(code));
    ok('a code pairs once', book.take(code) === true && book.take(code) === false);
    const late = book.newCode();
    t += CODE_TTL_MS;
    ok('a code past ten minutes does not pair', book.take(late) === false);
    ok('an unknown code does not pair', book.take('NOPE') === false);

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const d = book.add('Pixel 8', spki);
    ok('a device gets an id, the default scope and the clock', /^dev_[0-9a-f]{12}$/.test(d.id) && d.scope === DEFAULT_SCOPE && d.pairedAt === t && !d.revoked);
    const text = 'agentfarm.remote/1|farm_x|' + d.id + '|b64:nonce';
    const sig = crypto.sign('sha256', Buffer.from(text), privateKey).toString('base64');
    ok('its own signature verifies', book.verify(d.id, text, sig));
    ok('a signature over other text does not', !book.verify(d.id, text + 'x', sig));
    ok('another key\'s signature does not', !book.verify(d.id, text, crypto.sign('sha256', Buffer.from(text), crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey).toString('base64')));
    ok('an unknown device does not', !book.verify('dev_x', text, sig));
    ok('garbage does not throw', !book.verify(d.id, text, '%%%'));

    const again = new DeviceBook(file, clock);
    ok('a reload keeps the device and its key', again.get(d.id) && again.verify(d.id, text, sig));
    ok('a reload voids unspent codes', !again.take(code));
    const e = again.add('Tablet', spki);
    ok('revoking one device revokes only it', again.revoke(d.id) === 1 && again.get(d.id).revoked && !again.get(e.id).revoked);
    ok('revoking it again changes nothing', again.revoke(d.id) === 0);
    ok('revoke-all takes the rest', again.revoke() === 1 && again.list().every(x => x.revoked));
    ok('a revoke survives a reload', new DeviceBook(file, clock).get(e.id).revoked === true);
    fs.writeFileSync(file, 'not json');
    ok('an unreadable file reads as no devices', new DeviceBook(file, clock).list().length === 0);
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`remote devices: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
