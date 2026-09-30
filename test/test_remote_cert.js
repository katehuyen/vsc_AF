// X-442 — THE REMOTE HOST'S CERTIFICATE, built with node's crypto alone.
//
// The phone pins the SHA-256 of the certificate's DER bytes; nothing checks a
// CA. So the certificate has to parse, carry its own valid signature, match its
// key, and actually serve TLS — measured here with a real https server and a
// client that trusts nothing but the fingerprint, as the phone does.
'use strict';
const crypto = require('crypto');
const https = require('https');
const path = require('path');
const tls = require('tls');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { makeHostCert, fingerprintOf } = require(path.join(ROOT, 'out', 'remote', 'server', 'cert.js'));

const now = new Date('2026-09-30T12:00:00Z');
const c = makeHostCert('Agent Farm · Ev', now);
const x = new crypto.X509Certificate(c.certPem);

ok('the subject is the name given (UTF-8 kept)', x.subject === 'CN=Agent Farm · Ev');
ok('self-issued', x.issuer === x.subject);
ok('its signature verifies with its own key', x.verify(x.publicKey));
ok('the key file is this certificate\'s key', x.checkPrivateKey(crypto.createPrivateKey(c.keyPem)));
ok('an EC P-256 key', x.publicKey.asymmetricKeyDetails.namedCurve === 'prime256v1');
ok('valid now', new Date(x.validFrom) < now && new Date(x.validTo) > now);
ok('valid for twenty years', new Date(x.validTo).getUTCFullYear() === 2046);
ok('not a CA', x.ca === false);
const der = x.raw;
ok('the fingerprint is SHA-256 over the DER bytes, lower-case hex',
    c.fingerprint === crypto.createHash('sha256').update(der).digest('hex') && /^[0-9a-f]{64}$/.test(c.fingerprint));
ok('fingerprintOf reads the same', fingerprintOf(c.certPem) === c.fingerprint);
ok('a second certificate is a second fingerprint', makeHostCert('x', now).fingerprint !== c.fingerprint);
const far = new crypto.X509Certificate(makeHostCert('far', new Date('2040-01-01T00:00:00Z'), 30).certPem);
ok('a date past 2049 is written as GeneralizedTime and still parses', new Date(far.validTo).getUTCFullYear() === 2070);

// ---------- IT SERVES TLS, PINNED LIKE THE PHONE ----------
// Trust is decided after the handshake from the peer's DER bytes alone, as the phone's PinTrust does.
function roundTrip(pin) {
    return new Promise(resolve => {
        const server = https.createServer({ cert: c.certPem, key: c.keyPem }, (req, res) => res.end('pong'));
        server.listen(0, '127.0.0.1', () => {
            const done = v => { server.close(); resolve(v); };
            const s = tls.connect({ host: '127.0.0.1', port: server.address().port, rejectUnauthorized: false }, () => {
                const fp = crypto.createHash('sha256').update(s.getPeerCertificate().raw).digest('hex');
                if (fp !== pin) { s.destroy(); return done('error:pin'); }
                let got = '';
                s.on('data', d => { got += d; });
                s.on('end', () => done(got.endsWith('pong') ? 'pong' : got));
                s.write('GET / HTTP/1.0\r\nHost: x\r\n\r\n');
            });
            s.on('error', e => done('error:' + e.message));
        });
    });
}

// ---------- MADE ONCE PER INSTALL ----------
const fs = require('fs');
const os = require('os');
const { loadOrMakeCert } = require(path.join(ROOT, 'out', 'remote', 'server', 'certStore.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cert-'));
try {
    const first = loadOrMakeCert(path.join(dir, 'remote'), 'Ev');
    const again = loadOrMakeCert(path.join(dir, 'remote'), 'Ev');
    ok('the first start makes a certificate', first.made === true);
    ok('the next start reads the same one back', again.made === false && again.fingerprint === first.fingerprint);
    fs.writeFileSync(path.join(dir, 'remote', 'host-key.pem'), makeHostCert('other', now).keyPem);
    const replaced = loadOrMakeCert(path.join(dir, 'remote'), 'Ev');
    ok('a key that does not match its certificate is replaced, and says so', replaced.made === true && replaced.fingerprint !== first.fingerprint);
    fs.writeFileSync(path.join(dir, 'remote', 'host-cert.pem'), 'garbage');
    ok('an unreadable certificate is replaced', loadOrMakeCert(path.join(dir, 'remote'), 'Ev').made === true);
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

(async () => {
    ok('a client pinning the fingerprint gets through', (await roundTrip(c.fingerprint)) === 'pong');
    ok('a client pinning another fingerprint is refused', (await roundTrip('0'.repeat(64))).startsWith('error:'));
    console.log(`remote cert: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
