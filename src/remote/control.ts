/**
 * The remote host's life in the extension: listen where the settings say,
 * move when they change, stop when this window loses the runner lease — one
 * at a time, so a burst of setting changes never leaves two hosts on a port.
 * Devices can be listed and revoked while nothing listens: the book is a file.
 */
import * as path from 'path';
import type { RemotePort } from './port';
import { scopeAtLeast } from './scopes';
import { AUDIT_FILE, startRemoteHost, type RunningRemote } from './serve';
import { AUDIT_KINDS, AuditLog, type AuditEntry, type AuditQuery } from './server/auditLog';
import { DeviceBook, type Device } from './server/devices';

export interface ListenTarget {
    host: string;
    port: number;
    /** The addresses a pairing QR names (without the port). */
    addresses: string[];
}

export interface RemoteStatus {
    listening: boolean;
    farm: { id: string; name: string };
    host?: string;
    port?: number;
    addresses: string[];
    fingerprint?: string;
    sockets: number;
    /** Why it is not listening, or why the last start failed. */
    reason?: string;
}

export interface DeviceRow {
    id: string; name: string; scope: string; user: string; pairedAt: number; revoked: boolean;
    lastSeen?: number; lastAddress?: string;
}

const rowOf = (d: Device): DeviceRow => ({
    id: d.id, name: d.name, scope: d.scope, user: d.user, pairedAt: d.pairedAt, revoked: d.revoked,
    ...(d.lastSeen ? { lastSeen: d.lastSeen } : {}), ...(d.lastAddress ? { lastAddress: d.lastAddress } : {}),
});

export interface RemoteControl {
    /** target null = stop; `reason` says why for the status line. */
    apply(target: ListenTarget | null, reason?: string): Promise<RemoteStatus>;
    status(): RemoteStatus;
    /** X-445 — open phone connections whose device may answer a question (scope answer or more). */
    answering(): number;
    /** A fresh one-time pairing link, or an error when not listening. */
    pairingLink(): { link: string; addresses: string[] } | { error: string };
    devices(): DeviceRow[];
    revoke(id?: string): number;
    /** Another scope for a paired device; its open sockets hold it at once. */
    setScope(id: string, scope: string): { ok: true; device: DeviceRow; from: string } | { ok: false; error: string };
    /** The audit log, newest first. Works while not listening; throws on a kind it does not know. */
    audit(q?: Omit<AuditQuery, 'what'> & { what?: string[] }): AuditEntry[];
    dispose(): Promise<void>;
}

const sameTarget = (a: ListenTarget | null, b: ListenTarget | null) =>
    JSON.stringify(a) === JSON.stringify(b);

export function createRemoteControl(port: RemotePort): RemoteControl {
    let running: RunningRemote | null = null;
    let target: ListenTarget | null = null;
    let reason: string | undefined = 'not started';
    let chain: Promise<unknown> = Promise.resolve();

    const book = () => running?.devices ?? new DeviceBook(path.join(port.storageDir(), 'devices.json'));
    // One log for the host and this side, so neither overwrites the other's lines.
    let auditLog: AuditLog | null = null;
    const audit = () => (auditLog ??= new AuditLog(path.join(port.storageDir(), AUDIT_FILE)));

    const status = (): RemoteStatus => ({
        listening: !!running, farm: port.farm(),
        ...(running && target ? { host: target.host, port: running.port, fingerprint: running.fingerprint } : {}),
        addresses: running && target ? target.addresses.map(a => `${a}:${running!.port}`) : [],
        sockets: running?.server.sessions() ?? 0,
        ...(reason ? { reason } : {}),
    });

    const doApply = async (next: ListenTarget | null, why?: string): Promise<RemoteStatus> => {
        if (sameTarget(next, target)) { reason = next ? undefined : why ?? reason; return status(); }
        if (running) { const r = running; running = null; await r.stop(); port.log('remote: stopped'); }
        target = next;
        if (!next) { reason = why ?? 'stopped'; return status(); }
        try {
            running = await startRemoteHost(port, { host: next.host, port: next.port }, audit());
            reason = undefined;
        } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            reason = code === 'EADDRINUSE' ? `port ${next.port} is already in use - pick another agentFarm.remote.port`
                : code === 'EADDRNOTAVAIL' ? `address ${next.host} is not on this machine any more`
                : `could not listen on ${next.host}:${next.port}: ${(e as Error).message}`;
            port.log('remote: ' + reason);
            target = null;
        }
        return status();
    };

    return {
        apply: (next, why) => {
            const p = chain.then(() => doApply(next, why));
            chain = p.catch(() => undefined);
            return p;
        },
        status,
        answering: () => (running?.server.callers() ?? []).filter(c => scopeAtLeast(c.scope, 'answer')).length,
        pairingLink: () => {
            if (!running || !target) { return { error: `not listening (${reason ?? 'stopped'}) - set agentFarm.remote.listen first` }; }
            const addresses = target.addresses.map(a => `${a}:${running!.port}`);
            return { link: running.server.pairingLink(addresses), addresses };
        },
        devices: () => book().list().map(rowOf),
        revoke: id => {
            const b = book();
            const hit = b.list().filter(d => !d.revoked && (id === undefined || d.id === id));
            const n = b.revoke(id);
            if (n) { running?.server.dropRevoked(); }
            for (const d of hit) { audit().record({ what: 'revoke', device: d.id, name: d.name, user: d.user, ok: true }); }
            return n;
        },
        setScope: (id, scope) => {
            const r = book().setScope(id, scope);
            if (!r.ok) { return r; }
            if (r.from !== scope) {
                running?.server.rescope(id, scope);
                audit().record({ what: 'scope', device: id, name: r.device.name, user: r.device.user, ok: true, detail: `${r.from} -> ${scope}` });
            }
            return { ok: true, device: rowOf(r.device), from: r.from };
        },
        audit: q => {
            const unknown = (q?.what ?? []).filter(w => !(AUDIT_KINDS as readonly string[]).includes(w));
            if (unknown.length) { throw new Error(`what is one or more of ${AUDIT_KINDS.join(', ')} - not ${unknown.join(', ')}`); }
            return audit().list(q as AuditQuery | undefined);
        },
        dispose: async () => { await chain.then(() => doApply(null, 'disposed')); },
    };
}
