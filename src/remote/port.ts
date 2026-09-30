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

/** One answer of the page and resource routes. */
export interface ServedPage { status: number; type: string; body: Buffer | string }

/**
 * The farm's pages as a phone opens them (X-441): a view is opened over the
 * socket, its HTML fetched from /view/<page>?view=<id>, and its messages go
 * both ways as view.msg / view.post. Views belong to the device that opened them.
 */
export interface RemoteViewsPort {
    /** False when this page does not exist for the phone or the device may not open it. */
    open(caller: RemoteCaller, view: string, page: string, args: Record<string, unknown> | undefined, post: (message: unknown) => void): boolean;
    message(caller: RemoteCaller, view: string, message: unknown): void;
    close(caller: RemoteCaller, view: string): void;
    /** GET /view/… for this caller; may wait briefly for a view whose open is still on its way. */
    page(url: string, caller: RemoteCaller): Promise<ServedPage | null>;
}

export interface RemotePort {
    farm(): FarmIdentity;
    /** Runs a bridge op on behalf of a device; the handler is the same one agents call. */
    callOp(op: string, args: Record<string, unknown>, caller: RemoteCaller): Promise<OpResult>;
    subscribe(listener: (e: FarmEvent) => void): Unsubscribe;
    can(feature: string): FeatureAnswer;
    /** A private directory the remote host may keep its state in (devices, keys, event log). */
    storageDir(): string;
    /** The folder a page's /res/ files are read from (the extension's media folder); absent = none served. */
    resourceDir?(): string;
    /** The pages a phone may open; absent = none (a page open is answered unavailable). */
    views?(): RemoteViewsPort;
    log(line: string): void;
}
