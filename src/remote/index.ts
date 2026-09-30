/**
 * The remote host's entry: the only module the rest of the extension imports.
 *
 * activateRemote() checks the port is usable; startRemoteHost() puts the host
 * together from the same port and listens where it is told.
 */
import { CONTRACT_NAME, CONTRACT_VERSION } from './contract';
import type { RemotePort } from './port';

export type { RemotePort, RemoteCaller, FarmIdentity, FarmEvent, OpResult, Unsubscribe } from './port';
export { allOpen, featureMap, isFeature } from './features';
export type { FeatureAnswer, FeatureGate, FeatureId } from './features';
export { startRemoteHost } from './serve';
export { farmIdentity } from './server/farmId';
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
