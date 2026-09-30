/**
 * RemotePort — the ONE surface through which src/remote touches Agent Farm.
 *
 * src/remote imports nothing from the rest of the extension (test_remote_boundary
 * holds that); everything it needs arrives through this object, which
 * src/extension.ts builds. It is shaped like a public extension API so the
 * remote host can later move into an extension of its own unchanged.
 */
import type { FeatureAnswer } from './features';

/** Who is calling: the paired device and the scope it was granted. */
export interface RemoteCaller {
    device: string;
    scope: string;
}

export interface FarmIdentity {
    id: string;
    name: string;
}

/** The bridge's own answer shape — a remote call is a bridge call. */
export type OpResult = { ok: true; result: unknown } | { ok: false; error: string };

/** A farm event on its way to the phone; `seq` is assigned by the remote host, not here. */
export interface FarmEvent {
    type: string;
    data: Record<string, unknown>;
}

export type Unsubscribe = () => void;

export interface RemotePort {
    farm(): FarmIdentity;
    /** Runs a bridge op on behalf of a device; the handler is the same one agents call. */
    callOp(op: string, args: Record<string, unknown>, caller: RemoteCaller): Promise<OpResult>;
    subscribe(listener: (e: FarmEvent) => void): Unsubscribe;
    can(feature: string): FeatureAnswer;
    /** A private directory the remote host may keep its state in (devices, keys, event log). */
    storageDir(): string;
    log(line: string): void;
}
