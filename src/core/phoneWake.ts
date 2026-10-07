/**
 * X-451 — WHICH PHONES AN EVENT WAKES. An event the farm would ring for (an
 * ALERTING_EVENTS type carrying no `quiet`) wakes every paired phone that holds
 * a wake token and has no socket open here — a phone on a socket has the event
 * already. The wake carries the farm id and nothing of the event: the phone
 * connects and reads what it missed over its own channel, so one wake per phone
 * per WAKE_GAP_MS is enough however many events come in that time.
 */
import type { SendResult, WakeSend } from './fcm';
import { ALERTING_EVENTS, type RemoteEvent } from './remoteEvents';

export const WAKE_GAP_MS = 60_000;

export interface PhoneToWake { device: string; name: string; token: string }

export interface WakeDeps {
    /** Phones holding a token; `all` = with an open socket too (a test wake). */
    targets(all?: boolean): PhoneToWake[];
    /** The sender built from the key in Secrets, or why there is none. */
    sender(): WakeSend | { error: string };
    /** FCM said the token is dead. */
    forget(device: string, token: string): void;
    farmId(): string;
    now(): number;
    log(line: string): void;
}

export interface WakeOutcome { device: string; name: string; ok: boolean; error?: string; gone?: boolean }

export function wakes(e: RemoteEvent): boolean {
    return ALERTING_EVENTS.has(e.type) && !e.data.quiet;
}

export class PhoneWaker {
    private readonly last = new Map<string, number>();
    private said = '';

    constructor(private readonly d: WakeDeps, private readonly gapMs = WAKE_GAP_MS) {}

    async onEvent(e: RemoteEvent): Promise<WakeOutcome[]> {
        if (!wakes(e)) { return []; }
        const now = this.d.now();
        const due = this.d.targets().filter(t => !(now - (this.last.get(t.device) ?? -Infinity) < this.gapMs));
        if (!due.length) { return []; }
        const s = this.d.sender();
        if ('error' in s) {
            if (this.said !== s.error) { this.said = s.error; this.d.log(`remote: no phone wake - ${s.error}`); }
            return [];
        }
        this.said = '';
        // marked before the sends, so a burst of events in flight wakes each phone once
        for (const t of due) { this.last.set(t.device, now); }
        return Promise.all(due.map(t => this.one(s, t)));
    }

    /** remote.wake.test — every phone holding a token (or the one named), open socket or not, outside the gap. */
    async test(device?: string): Promise<WakeOutcome[] | { error: string }> {
        const s = this.d.sender();
        if ('error' in s) { return { error: s.error }; }
        return Promise.all(this.d.targets(true).filter(t => !device || t.device === device).map(t => this.one(s, t)));
    }

    private async one(send: WakeSend, t: PhoneToWake): Promise<WakeOutcome> {
        const r: SendResult = await send(t.token, { wake: '1', farm: this.d.farmId() })
            .catch((e: unknown) => ({ ok: false as const, error: String((e as Error)?.message ?? e) }));
        if (r.ok) { return { device: t.device, name: t.name, ok: true }; }
        if (r.gone) { this.d.forget(t.device, t.token); this.last.delete(t.device); }
        this.d.log(`remote: wake to ${t.name} failed - ${r.error}`);
        return { device: t.device, name: t.name, ok: false, error: r.error, ...(r.gone ? { gone: true } : {}) };
    }
}
