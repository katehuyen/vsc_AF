/**
 * The remote host's own TLS certificate: a self-signed P-256 certificate built
 * with node's crypto alone. The phone never trusts it through a CA — it pins
 * the SHA-256 of these DER bytes, which the pairing QR carries — so all it
 * needs is to parse. A new certificate is a new fingerprint: every device
 * re-pairs, so it is made once per install and kept.
 */
import * as crypto from 'crypto';

export interface HostCert {
    certPem: string;
    keyPem: string;
    /** SHA-256 over the certificate's DER bytes, lower-case hex: the `fp` a pairing link carries. */
    fingerprint: string;
}

const OID = {
    ecdsaWithSha256: '1.2.840.10045.4.3.2',
    commonName: '2.5.4.3',
    basicConstraints: '2.5.29.19',
};

function len(n: number): Buffer {
    if (n < 0x80) { return Buffer.from([n]); }
    const bytes: number[] = [];
    for (let v = n; v > 0; v >>= 8) { bytes.unshift(v & 0xff); }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, body: Buffer): Buffer {
    return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
}

const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => tlv(0x31, Buffer.concat(parts));
const explicit = (n: number, inner: Buffer) => tlv(0xa0 + n, inner);

function oid(dotted: string): Buffer {
    const [a, b, ...rest] = dotted.split('.').map(Number);
    const out = [40 * a + b];
    for (const v of rest) {
        const chunk = [v & 0x7f];
        for (let x = v >>> 7; x > 0; x >>>= 7) { chunk.unshift(0x80 | (x & 0x7f)); }
        out.push(...chunk);
    }
    return tlv(0x06, Buffer.from(out));
}

/** A positive INTEGER from raw bytes (a leading zero keeps the sign bit clear). */
function integer(bytes: Buffer): Buffer {
    return tlv(0x02, bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
}

function time(d: Date): Buffer {
    const iso = d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
    const y = d.getUTCFullYear();
    return y >= 1950 && y < 2050 ? tlv(0x17, Buffer.from(iso.slice(2), 'ascii')) : tlv(0x18, Buffer.from(iso, 'ascii'));
}

const name = (cn: string) => seq(set(seq(oid(OID.commonName), tlv(0x0c, Buffer.from(cn, 'utf8')))));
const bitString = (bytes: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0]), bytes]));

export function fingerprintOf(certPem: string): string {
    return new crypto.X509Certificate(certPem).fingerprint256.replace(/:/g, '').toLowerCase();
}

/** A fresh certificate for `commonName`, valid from a day before `now` for `years`. */
export function makeHostCert(commonName: string, now = new Date(), years = 20): HostCert {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const serial = crypto.randomBytes(16);
    serial[0] = (serial[0] & 0x7f) | 0x01;
    const notBefore = new Date(now.getTime() - 24 * 3600 * 1000);
    const notAfter = new Date(now.getTime());
    notAfter.setUTCFullYear(notAfter.getUTCFullYear() + years);
    const sigAlg = seq(oid(OID.ecdsaWithSha256));
    const notCa = seq(oid(OID.basicConstraints), tlv(0x04, seq()));
    const tbs = seq(
        explicit(0, integer(Buffer.from([2]))),
        integer(serial),
        sigAlg,
        name(commonName),
        seq(time(notBefore), time(notAfter)),
        name(commonName),
        publicKey.export({ type: 'spki', format: 'der' }),
        explicit(3, seq(notCa)),
    );
    const signature = crypto.sign('sha256', tbs, privateKey);
    const der = seq(tbs, sigAlg, bitString(signature));
    const certPem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END CERTIFICATE-----\n`;
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    return { certPem, keyPem, fingerprint: fingerprintOf(certPem) };
}
