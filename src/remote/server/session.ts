/**
 * One phone's socket, from challenge to close: the signed hello, the welcome
 * with what it missed, calls answered exactly once, page frames handed to the
 * views, events pushed as they happen. Transport-agnostic: it speaks through
 * a Wire, so the handshake is tested without a socket.
 */
import * as crypto from 'crypto';
import { CONTRACT_VERSION, checkFrame, signedText } from '../contract';
import type { FeatureAnswer } from '../features';
import type { FarmIdentity, OpResult, RemoteCaller, RemoteViewsPort } from '../port';
import type { DeviceBook } from './devices';
import type { EventFrame, EventLog } from './eventLog';

export interface Wire {
    send(text: string): void;
    close(code?: number): void;
}

/** Page frames go here (X-441); without it, or when it refuses, a page open is answered "unavailable". */
export type ViewSink = Omit<RemoteViewsPort, 'page'>;

export interface SessionDeps {
    farm: FarmIdentity;
    devices: DeviceBook;
    events: EventLog;
    calls: CallMemory;
    callOp(op: string, args: Record<string, unknown>, caller: RemoteCaller): Promise<OpResult>;
    features(caller: RemoteCaller): Record<string, FeatureAnswer>;
    views: ViewSink | null;
    helloTimeoutMs: number;
}

/** Answers already given, per device and call id, so a resend returns the same answer instead of running twice. */
export class CallMemory {
    private done = new Map<string, Promise<Record<string, unknown>>>();
    constructor(private readonly keep = 1000) { }
    /** The answer for this call: a known one (also while it is still running), or `run`'s — started once. */
    answer(device: string, id: string, run: () => Promise<Record<string, unknown>>): { result: Promise<Record<string, unknown>>; duplicate: boolean } {
        const key = device + '|' + id;
        const known = this.done.get(key);
        if (known) { return { result: known, duplicate: true }; }
        const result = run();
        this.done.set(key, result);
        if (this.done.size > this.keep) { this.done.delete(this.done.keys().next().value as string); }
        return { result, duplicate: false };
    }
}

export class RemoteSession {
    readonly nonce = 'b64:' + crypto.randomBytes(16).toString('base64');
    /** The page-route session token, issued with the welcome. */
    token: string | null = null;
    caller: RemoteCaller | null = null;
    private views = new Set<string>();
    private timer: NodeJS.Timeout | null;

    constructor(private readonly wire: Wire, private readonly d: SessionDeps) {
        this.frame({ kind: 'challenge', nonce: this.nonce, farm: d.farm, contract: CONTRACT_VERSION });
        this.timer = setTimeout(() => this.refuse('not-allowed', 'no hello in time'), d.helloTimeoutMs);
        this.timer.unref?.();
    }

    onMessage(text: string): void {
        let f: Record<string, unknown>;
        try { f = JSON.parse(text); } catch { return; }
        const check = checkFrame(f);
        if (!this.caller) {
            if (!check.ok || f.kind !== 'hello') { return this.refuse('not-allowed', check.ok ? 'hello first' : check.error); }
            return this.hello(f);
        }
        if (!check.ok) {
            if (f.kind === 'call' && typeof f.id === 'string') { this.frame({ kind: 'result', id: f.id, ok: false, error: check.error }); }
            return;
        }
        switch (f.kind) {
            case 'call': void this.call(f.id as string, f.op as string, (f.args as Record<string, unknown>) ?? {}); return;
            case 'ping': this.frame({ kind: 'pong', ts: f.ts }); return;
            case 'view.open': this.openView(f.view as string, f.page as string, f.args as Record<string, unknown> | undefined); return;
            case 'view.msg': if (this.views.has(f.view as string)) { this.d.views?.message(this.caller, f.view as string, f.message); } return;
            case 'view.close': this.closeView(f.view as string); return;
        }
    }

    push(ev: EventFrame): void { if (this.caller) { this.frame(ev); } }

    /** Ends the socket with a refusal the phone shows by reason. */
    refuse(reason: string, detail?: string, extra: Record<string, unknown> = {}): void {
        this.frame({ kind: 'refuse', reason, ...(detail ? { detail } : {}), ...extra });
        this.wire.close(1000);
    }

    /** The socket closed: pages opened through it close too. */
    ended(): void {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        for (const v of [...this.views]) { this.closeView(v); }
    }

    private hello(f: Record<string, unknown>): void {
        if (f.contract !== CONTRACT_VERSION) {
            return this.refuse('contract', `this farm speaks contract ${CONTRACT_VERSION}`, { minContract: CONTRACT_VERSION });
        }
        const device = this.d.devices.get(f.device as string);
        if (!device) { return this.refuse('unknown-device'); }
        if (device.revoked) { return this.refuse('revoked'); }
        if (!this.d.devices.verify(device.id, signedText(this.d.farm.id, device.id, this.nonce), f.signature as string)) {
            return this.refuse('bad-signature');
        }
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.caller = { device: device.id, scope: device.scope };
        this.token = 's_' + crypto.randomBytes(18).toString('base64url');
        this.frame({
            kind: 'welcome', farm: this.d.farm, device: device.id, scope: device.scope,
            features: this.d.features(this.caller), lastSeq: this.d.events.lastSeq, session: this.token,
        });
        if (typeof f.resumeAfter === 'number') {
            const r = this.d.events.replay(f.resumeAfter);
            if (r.gap) { this.frame({ kind: 'gap', ...r.gap }); }
            for (const ev of r.events) { this.frame(ev); }
        }
    }

    private async call(id: string, op: string, args: Record<string, unknown>): Promise<void> {
        const caller = this.caller!;
        const { result, duplicate } = this.d.calls.answer(caller.device, id, async () => {
            let r: OpResult;
            try { r = await this.d.callOp(op, args, caller); } catch (e) { r = { ok: false, error: String((e as Error)?.message ?? e) }; }
            return r.ok ? { kind: 'result', id, ok: true, result: r.result } : { kind: 'result', id, ok: false, error: r.error };
        });
        const out = await result;
        this.frame(duplicate ? { ...out, duplicate: true } : out);
    }

    private openView(view: string, page: string, args: Record<string, unknown> | undefined): void {
        const opened = !!this.d.views
            && this.d.views.open(this.caller!, view, page, args, message => this.frame({ kind: 'view.post', view, message }));
        if (!opened) { return this.frame({ kind: 'view.close', view, reason: 'unavailable' }); }
        this.views.add(view);
    }

    private closeView(view: string): void {
        if (this.views.delete(view) && this.caller) { this.d.views?.close(this.caller, view); }
    }

    private frame(f: Record<string, unknown> | EventFrame): void { this.wire.send(JSON.stringify(f)); }
}
