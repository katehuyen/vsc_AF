/**
 * The host certificate on disk: made once per install and read back after,
 * because a new certificate is a new fingerprint and every paired phone would
 * have to scan a new QR. A pair that does not parse or does not match is
 * replaced — and `made` says so, so the caller can tell the user why.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fingerprintOf, makeHostCert, type HostCert } from './cert';

const CERT = 'host-cert.pem';
const KEY = 'host-key.pem';

export interface StoredCert extends HostCert {
    /** true when this call created the certificate (first start, or the old pair was unusable). */
    made: boolean;
}

function readPair(dir: string): HostCert | null {
    try {
        const certPem = fs.readFileSync(path.join(dir, CERT), 'utf8');
        const keyPem = fs.readFileSync(path.join(dir, KEY), 'utf8');
        if (!new crypto.X509Certificate(certPem).checkPrivateKey(crypto.createPrivateKey(keyPem))) { return null; }
        return { certPem, keyPem, fingerprint: fingerprintOf(certPem) };
    } catch {
        return null;
    }
}

export function loadOrMakeCert(dir: string, commonName: string): StoredCert {
    const kept = readPair(dir);
    if (kept) { return { ...kept, made: false }; }
    const fresh = makeHostCert(commonName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, KEY), fresh.keyPem, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(path.join(dir, CERT), fresh.certPem, 'utf8');
    return { ...fresh, made: true };
}
