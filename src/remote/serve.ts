/**
 * Puts the remote host together from a RemotePort: the certificate, devices
 * and event log live in the port's storage dir, calls go to the port's ops,
 * the port's events are numbered and pushed, and features come from its gate.
 * The caller only says where to listen.
 */
import * as path from 'path';
import { featureMap } from './features';
import type { RemoteCaller, RemotePort, Unsubscribe } from './port';
import { scopeGated } from './scopes';
import { loadOrMakeCert } from './server/certStore';
import { DeviceBook } from './server/devices';
import { resourcePage } from './server/resources';
import { EventLog } from './server/eventLog';
import { createRemoteServer, type RemoteServer } from './server/host';
import { CallMemory } from './server/session';

export interface ListenAt {
    host: string;
    port: number;
}

export interface RunningRemote {
    /** The port actually bound (0 asks the system for one). */
    port: number;
    fingerprint: string;
    devices: DeviceBook;
    server: RemoteServer;
    stop(): Promise<void>;
}

export async function startRemoteHost(port: RemotePort, at: ListenAt): Promise<RunningRemote> {
    const dir = port.storageDir();
    const farm = port.farm();
    const cert = loadOrMakeCert(dir, `Agent Farm · ${farm.name}`);
    if (cert.made) { port.log(`remote: new host certificate ${cert.fingerprint.slice(0, 12)}… - paired phones scan a new QR`); }
    const devices = new DeviceBook(path.join(dir, 'devices.json'));
    const views = port.views ? port.views() : null;
    const res = port.resourceDir ? port.resourceDir() : null;
    const page = (url: string, caller: RemoteCaller) => url.startsWith('/view/')
        ? (views ? views.page(url, caller) : null)
        : (res ? resourcePage(res, url) : null);
    const server = createRemoteServer({
        farm, cert, devices,
        events: new EventLog(path.join(dir, 'events.json')),
        calls: new CallMemory(),
        callOp: scopeGated((op, args, caller) => port.callOp(op, args, caller)),
        features: () => featureMap(f => port.can(f)),
        views,
        page,
        helloTimeoutMs: 10_000,
        log: line => port.log(line),
    });
    const bound = await server.listen(at.port, at.host);
    const unsubscribe: Unsubscribe = port.subscribe(e => server.emit(e.type, e.data));
    port.log(`remote: listening on ${at.host}:${bound}, ${devices.list().filter(d => !d.revoked).length} device(s)`);
    return {
        port: bound, fingerprint: cert.fingerprint, devices, server,
        stop: async () => { unsubscribe(); await server.close(); },
    };
}
