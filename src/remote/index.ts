/**
 * The remote host's entry: the only module the rest of the extension imports.
 *
 * activateRemote() checks the port is usable; startRemoteHost() puts the host
 * together from the same port and listens where it is told.
 */
import { CONTRACT_NAME, CONTRACT_VERSION } from './contract';
import type { RemotePort } from './port';

export type { RemotePort, RemoteCaller, RemoteViewsPort, ServedPage, FarmIdentity, FarmEvent, OpResult, Unsubscribe } from './port';
export { scopeAtLeast } from './scopes';
export { allOpen, featureMap, isFeature } from './features';
export type { FeatureAnswer, FeatureGate, FeatureId } from './features';
export { startRemoteHost } from './serve';
export { farmIdentity } from './server/farmId';
export { createRemoteControl } from './control';
export type { DeviceRow, ListenTarget, RemoteControl, RemoteStatus } from './control';
export type { ListenAt, RunningRemote } from './serve';

export interface RemoteHandle {
    readonly contract: string;
    dispose(): void;
}

export function activateRemote(port: RemotePort): RemoteHandle {
    const contract = `${CONTRACT_NAME}/${CONTRACT_VERSION}`;
    port.log(`remote: ${contract} ready for farm ${port.farm().id} (not listening)`);
    return { contract, dispose: () => undefined };
}
