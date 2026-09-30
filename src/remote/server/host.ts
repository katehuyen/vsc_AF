/**
 * The remote host's HTTPS listener: /health, /pair (a one-time code buys a
 * device), the page and resource routes (only with a live socket's session),
 * and /ws, where each socket becomes a RemoteSession. Events fan out to every
 * welcomed socket; a revoke ends that device's sockets at once.
 */
import * as https from 'https';
import type { IncomingMessage, ServerResponse } from 'http';
import { CONTRACT_VERSION, checkPairRequest, pairingUri } from '../contract';
import type { RemoteCaller, ServedPage } from '../port';
import type { HostCert } from './cert';
import { RemoteSession, type SessionDeps } from './session';
import { acceptUpgrade } from './ws';

const MAX_BODY = 16 * 1024;

export type Page = ServedPage;

export interface HostDeps extends SessionDeps {
    cert: HostCert;
    /** GET /view/… and /res/… for a caller with a live session; null = not found. */
    page: ((path: string, caller: RemoteCaller) => Page | null | Promise<Page | null>) | null;
    log(line: string): void;
}

export interface RemoteServer {
    listen(port: number, host: string): Promise<number>;
    close(): Promise<void>;
    /** Records an event and pushes it to every welcomed socket. */
    emit(type: string, data: Record<string, unknown>): void;
    /** Ends the sockets of devices that are no longer allowed (after a revoke). */
    dropRevoked(): void;
    /** A pairing link with a fresh one-time code for these host:port addresses. */
    pairingLink(addresses: string[]): string;
    sessions(): number;
}

export function createRemoteServer(d: HostDeps): RemoteServer {
    const live = new Set<RemoteSession>();

    const json = (res: ServerResponse, status: number, body: unknown) => {
        const text = JSON.stringify(body);
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
        res.end(text);
    };

    const readBody = (req: IncomingMessage) => new Promise<unknown>(resolve => {
        let size = 0;
        const parts: Buffer[] = [];
        req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { req.destroy(); resolve(null); } else { parts.push(c); } });
        req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { resolve(null); } });
        req.on('error', () => resolve(null));
    });

    const callerOf = (req: IncomingMessage): RemoteCaller | null => {
        const m = /^AF (\S+)$/.exec(String(req.headers.authorization || ''));
        if (!m) { return null; }
        for (const s of live) { if (s.token === m[1] && s.caller) { return s.caller; } }
        return null;
    };

    async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = (req.url || '/').split('?')[0];
        if (req.method === 'GET' && url === '/health') { return json(res, 200, { ok: true, farm: d.farm, contract: CONTRACT_VERSION }); }
        if (req.method === 'POST' && url === '/pair') {
            const b = await readBody(req);
            const check = checkPairRequest(b);
            if (!check.ok) { return json(res, 400, { error: check.error }); }
            const r = b as { code: string; name: string; publicKey: string; platform: string };
            if (!d.devices.take(r.code)) { return json(res, 403, { error: 'code' }); }
            const dev = d.devices.add(r.name, r.publicKey);
            d.log(`remote: paired ${dev.id} (${r.name}, ${r.platform})`);
            return json(res, 200, { device: dev.id, farm: d.farm, scope: dev.scope });
        }
        if (req.method === 'GET' && /^\/(view|res)\//.test(url)) {
            const caller = callerOf(req);
            if (!caller) { return json(res, 401, { error: 'session' }); }
            const p = (await d.page?.(req.url || url, caller)) ?? null;
            if (!p) { return json(res, 404, { error: 'not found' }); }
            res.writeHead(p.status, { 'content-type': p.type, 'content-length': Buffer.byteLength(p.body), 'cache-control': 'no-store' });
            return void res.end(p.body);
        }
        json(res, 404, { error: 'not found' });
    }

    const server = https.createServer({ cert: d.cert.certPem, key: d.cert.keyPem }, (req, res) => { void onRequest(req, res); });
    server.on('upgrade', (req: IncomingMessage, socket, head: Buffer) => {
        if ((req.url || '').split('?')[0] !== '/ws') { socket.destroy(); return; }
        const conn = acceptUpgrade(req, socket, head);
        if (!conn) { return; }
        const s = new RemoteSession(conn, d);
        live.add(s);
        conn.on('message', (t: string) => s.onMessage(t));
        conn.on('close', () => { live.delete(s); s.ended(); });
    });

    return {
        listen: (port, host) => new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, host, () => { server.off('error', reject); resolve((server.address() as { port: number }).port); });
        }),
        close: () => new Promise(resolve => {
            for (const s of live) { s.refuse('busy', 'the farm is stopping'); }
            server.close(() => resolve());
            // A kept-alive HTTP connection would otherwise hold close() open and keep answering.
            server.closeAllConnections();
        }),
        emit(type, data) {
            const ev = d.events.append(type, data);
            for (const s of live) { s.push(ev); }
        },
        dropRevoked() {
            for (const s of live) {
                const dev = s.caller ? d.devices.get(s.caller.device) : undefined;
                if (s.caller && (!dev || dev.revoked)) { s.refuse('revoked'); }
            }
        },
        pairingLink: addresses => pairingUri({
            v: CONTRACT_VERSION, farm: d.farm.id, name: d.farm.name, code: d.devices.newCode(), fp: d.cert.fingerprint, addresses,
        }),
        sessions: () => live.size,
    };
}
