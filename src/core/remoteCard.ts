/**
 * The Toolbox "Phone app" card's data, already decided: where the host listens,
 * whether a phone can reach it, the paired phones, and a pairing code while one
 * is fresh. The QR is encoded here — one encoder, the one the tests render.
 */
import { qrEncode, qrSvg } from './qr';

export type RemoteCardMode = 'off' | 'local' | 'lan' | 'tailscale';

export interface RemoteCardInput {
    mode: RemoteCardMode;
    status: {
        listening: boolean; farm: { id: string; name: string }; port?: number; addresses: string[];
        fingerprint?: string; sockets: number; reason?: string;
    };
    port: number;
    devices: { id: string; name: string; scope: string; pairedAt: number; revoked: boolean }[];
    /** a pairing link made on this card, and when its one-time code stops working */
    pair?: { link: string; addresses: string[]; until: number };
    /** false = another window runs the task queue and hosts the phone */
    runner: boolean;
}

export type RemoteCardState = 'off' | 'other-window' | 'not-listening' | 'local-only' | 'listening';

export interface RemoteCardStatus { state: RemoteCardState; tone: 'ok' | 'warn' | 'bad' | 'off'; detail: string; phoneReachable: boolean }

/** Ends a sentence once: a reason that already ends in punctuation keeps its own. */
const sentence = (t: string) => /[.!?]$/.test(t) ? t : t + '.';

export function remoteCardStatus(i: RemoteCardInput): RemoteCardStatus {
    if (i.mode === 'off') {
        return { state: 'off', tone: 'off', phoneReachable: false,
            detail: 'No phone can reach this farm. Choose local, LAN or Tailscale to let the Agent Farm app in.' };
    }
    if (!i.runner) {
        return { state: 'other-window', tone: 'warn', phoneReachable: false,
            detail: 'Another VS Code window runs the task queue, so that window hosts the phone.' };
    }
    if (!i.status.listening) {
        return { state: 'not-listening', tone: 'bad', phoneReachable: false,
            detail: sentence('Not listening: ' + (i.status.reason ?? 'unknown reason')) };
    }
    if (i.mode === 'local') {
        return { state: 'local-only', tone: 'warn', phoneReachable: false,
            detail: 'Listening on 127.0.0.1 only — an emulator on this computer can reach it, a phone cannot.' };
    }
    return { state: 'listening', tone: 'ok', phoneReachable: true,
        detail: i.mode === 'tailscale'
            ? 'Listening on your Tailscale network — a paired phone reaches it from anywhere.'
            : 'Listening on this network — a paired phone on the same Wi-Fi reaches it.' };
}

/** The pairing block: only while listening where a phone can reach, only while the code is fresh. */
function pairBlock(i: RemoteCardInput, st: RemoteCardStatus, now: number): Record<string, unknown> | undefined {
    const p = i.pair;
    if (!p || p.until <= now || !st.phoneReachable) { return undefined; }
    const minutes = Math.max(1, Math.ceil((p.until - now) / 60_000));
    try {
        return { link: p.link, addresses: p.addresses, minutes,
            qr: qrSvg(qrEncode(p.link), { scale: 3, title: 'Scan with the Agent Farm app' }) };
    } catch {
        return { link: p.link, addresses: p.addresses, minutes };
    }
}

export function remoteCardData(i: RemoteCardInput, now: number): Record<string, unknown> {
    const st = remoteCardStatus(i);
    const devices = [...i.devices].sort((a, b) => Number(a.revoked) - Number(b.revoked) || b.pairedAt - a.pairedAt);
    const pair = pairBlock(i, st, now);
    return {
        mode: i.mode,
        port: i.status.port ?? i.port,
        listening: i.status.listening,
        status: st,
        farm: i.status.farm,
        addresses: i.status.addresses,
        fingerprint: i.status.fingerprint ?? '',
        sockets: i.status.sockets,
        devices,
        activeDevices: devices.filter(d => !d.revoked).length,
        ...(pair ? { pair } : {})
    };
}
