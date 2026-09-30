/**
 * The remote host's entry: the only symbol the rest of the extension imports.
 *
 * It receives a RemotePort and returns a handle to stop it. The server itself
 * (X-442) starts here; until then activation only checks the port is usable.
 */
import { CONTRACT_NAME, CONTRACT_VERSION } from './contract';
import type { RemotePort } from './port';

export type { RemotePort, RemoteCaller, FarmIdentity, FarmEvent, OpResult, Unsubscribe } from './port';
export { allOpen, featureMap, isFeature } from './features';
export type { FeatureAnswer, FeatureGate, FeatureId } from './features';

export interface RemoteHandle {
    readonly contract: string;
    dispose(): void;
}

export function activateRemote(port: RemotePort): RemoteHandle {
    const contract = `${CONTRACT_NAME}/${CONTRACT_VERSION}`;
    port.log(`remote: ${contract} ready for farm ${port.farm().id} (no server yet)`);
    return { contract, dispose: () => undefined };
}
