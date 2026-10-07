/**
 * Ops the remote host answers itself: they touch only the calling device's own
 * record, so they never reach the bridge and an agent cannot call them. The
 * headless service hosts the same server, so a phone registers while VS Code
 * is away too.
 */
import type { OpResult, RemoteCaller } from '../port';
import type { DeviceBook } from './devices';

/** X-451 — the phone hands in its FCM registration token; '' clears it. */
export const WAKE_REGISTER_OP = 'remote.wake.register';
export const SELF_OPS: ReadonlySet<string> = new Set([WAKE_REGISTER_OP]);
const MAX_TOKEN = 4096;

/** The answer for a self op; undefined = not one of them, the port answers it. */
export function selfOp(devices: DeviceBook, op: string, args: Record<string, unknown>, caller: RemoteCaller): OpResult | undefined {
    if (op !== WAKE_REGISTER_OP) { return undefined; }
    const token = args.token;
    if (typeof token !== 'string' || token.length > MAX_TOKEN) {
        return { ok: false, error: 'token is the FCM registration token as a string (an empty one clears it)' };
    }
    return devices.setWakeToken(caller.device, token)
        ? { ok: true, result: { registered: token.trim() !== '' } }
        : { ok: false, error: 'this device is not paired here any more' };
}
