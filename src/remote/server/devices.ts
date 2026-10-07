/**
 * The paired devices and the one-time codes that pair them. A code lives ten
 * minutes and in memory only — a reload voids an unscanned QR, never a paired
 * phone. Devices are kept on disk: id, name, public key (SPKI DER, base64),
 * scope, the user it belongs to, where and when it was last seen, and a
 * revoked flag that stays so the refusal can name the reason.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SCOPES } from '../contract';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_SCOPE = 'manage';
/**
 * A farm has one user today; devices and the event stream carry the field so a
 * team licence needs no migration, and a record from before it is the owner's.
 * Spelled here AND in core/farmUser.ts (Notices) because src/remote imports
 * nothing outside itself (X-448); test_record_user.js holds the two equal.
 */
export const OWNER = 'owner';
export const userOf = (v: unknown): string => (typeof v === 'string' && v ? v : OWNER);

export interface Device {
    id: string;
    name: string;
    publicKey: string;
    scope: string;
    user: string;
    pairedAt: number;
    revoked: boolean;
    lastSeen?: number;
    lastAddress?: string;
    /** X-451 — the phone's FCM registration token: a content-free wake when its socket is gone */
    wakeToken?: string;
}

export type ScopeChange = { ok: true; device: Device; from: string } | { ok: false; error: string };

export class DeviceBook {
    private codes = new Map<string, number>();
    private devices = new Map<string, Device>();

    constructor(private readonly file: string | null, private readonly now: () => number = Date.now) {
        for (const d of file ? read(file) : []) { this.devices.set(d.id, d); }
    }

    /** A fresh one-time pairing code, valid for CODE_TTL_MS. */
    newCode(): string {
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        this.codes.set(code, this.now() + CODE_TTL_MS);
        return code;
    }

    /** Spends a code: true once, and only before it expires. */
    take(code: string): boolean {
        const until = this.codes.get(code);
        this.codes.delete(code);
        return until !== undefined && this.now() < until;
    }

    add(name: string, publicKey: string, scope = DEFAULT_SCOPE, user = OWNER): Device {
        const d: Device = { id: 'dev_' + crypto.randomBytes(6).toString('hex'), name, publicKey, scope, user, pairedAt: this.now(), revoked: false };
        this.devices.set(d.id, d);
        this.save();
        return d;
    }

    get(id: string): Device | undefined { return this.devices.get(id); }

    list(): Device[] { return [...this.devices.values()]; }

    /** A welcomed connection: when and from where the device was last seen. */
    seen(id: string, address?: string): void {
        const d = this.devices.get(id);
        if (!d) { return; }
        d.lastSeen = this.now();
        if (address) { d.lastAddress = address; }
        this.save();
    }

    /** Grants a paired, unrevoked device another of the contract's scopes. */
    setScope(id: string, scope: string): ScopeChange {
        if (!SCOPES.includes(scope)) { return { ok: false, error: `scope is one of ${SCOPES.join(' | ')}` }; }
        const d = this.devices.get(id);
        if (!d) { return { ok: false, error: `no paired device ${id}` }; }
        if (d.revoked) { return { ok: false, error: `${d.name} is revoked - it must pair again` }; }
        const from = d.scope;
        if (from !== scope) { d.scope = scope; this.save(); }
        return { ok: true, device: d, from };
    }

    /** X-451 — the device's own wake token ('' clears it); a revoked or unknown device gets none. */
    setWakeToken(id: string, token: string): boolean {
        const d = this.devices.get(id);
        if (!d || d.revoked) { return false; }
        const t = String(token ?? '').trim();
        if ((d.wakeToken ?? '') === t) { return true; }
        if (t) { d.wakeToken = t; } else { delete d.wakeToken; }
        this.save();
        return true;
    }

    /** Revokes one device, or every device when `id` is omitted; returns how many changed. */
    revoke(id?: string): number {
        let n = 0;
        for (const d of this.devices.values()) {
            if ((id === undefined || d.id === id) && !d.revoked) { d.revoked = true; delete d.wakeToken; n++; }
        }
        if (n) { this.save(); }
        return n;
    }

    /** Whether `signature` (base64, DER ECDSA over SHA-256) signs `text` with the device's key. */
    verify(id: string, text: string, signature: string): boolean {
        const d = this.devices.get(id);
        if (!d) { return false; }
        try {
            const key = crypto.createPublicKey({ key: Buffer.from(d.publicKey, 'base64'), format: 'der', type: 'spki' });
            return crypto.verify('sha256', Buffer.from(text, 'utf8'), key, Buffer.from(signature, 'base64'));
        } catch {
            return false;
        }
    }

    private save(): void {
        if (!this.file) { return; }
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.list(), null, 1), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tmp, this.file);
    }
}

function read(file: string): Device[] {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(j)
            ? j.filter((d: Device) => typeof d?.id === 'string' && typeof d.publicKey === 'string')
                .map((d: Device) => ({ ...d, user: userOf(d.user) }))
            : [];
    } catch {
        return [];
    }
}
