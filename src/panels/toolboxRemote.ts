/**
 * The Toolbox "Phone app" card's host side: the data it is handed and the
 * acts its controls perform. The acts are named after the host closures the
 * remote.* bridge ops call, so the card and the ops do the same thing.
 */
import * as vscode from 'vscode';
import { remoteCardData, type RemoteCardInput, type RemoteCardMode } from '../core/remoteCard';

export interface RemoteDevicesHost {
    snapshot(): Omit<RemoteCardInput, 'pair'>;
    setRemoteListen(mode: RemoteCardMode): Promise<unknown>;
    pairingLink(): { link: string; addresses: string[] } | { error: string };
    revoke(id?: string): number;
    /** Windows' admin prompt, then the one firewall rule that lets phones in */
    allowFirewall(): Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
}

/** How long a pairing code works — the host's own CODE_TTL_MS. */
export const PAIR_TTL_MS = 10 * 60 * 1000;

const MODES: RemoteCardMode[] = ['off', 'local', 'lan', 'tailscale'];

export function remoteMode(v: unknown): RemoteCardMode | undefined {
    const s = String(v ?? '');
    return (MODES as string[]).includes(s) ? s as RemoteCardMode : undefined;
}

export function remoteCard(host: RemoteDevicesHost | undefined, pair: RemoteCardInput['pair'], now = Date.now()
): Record<string, unknown> | undefined {
    return host ? remoteCardData({ ...host.snapshot(), ...(pair ? { pair } : {}) }, now) : undefined;
}

export interface RemoteCardContext {
    host?: RemoteDevicesHost;
    /** keep (or drop) the pairing code the card shows */
    setPair(p: RemoteCardInput['pair']): void;
    /** one answer line on the card, then a redraw */
    say(m: { ok: boolean; text: string } | undefined): void;
}

/** Returns true when the message was the card's. */
export async function remoteCardMessage(msg: { type?: unknown;[k: string]: unknown }, ctx: RemoteCardContext): Promise<boolean> {
    const type = String(msg?.type ?? '');
    if (type.indexOf('remote-') !== 0) { return false; }
    const host = ctx.host;
    if (!host) { ctx.say({ ok: false, text: 'This window does not host the phone app.' }); return true; }
    switch (type) {
        case 'remote-listen': {
            const mode = remoteMode(msg.mode);
            if (!mode) { ctx.say({ ok: false, text: 'Unknown mode.' }); return true; }
            ctx.setPair(undefined);
            await host.setRemoteListen(mode);
            const snap = host.snapshot();
            const st = snap.status;
            const fwClosed = mode !== 'local' && snap.firewall?.state === 'closed';
            ctx.say(mode === 'off'
                ? { ok: true, text: 'The phone app is off — no phone can reach this farm.' }
                : !st.listening
                    ? { ok: false, text: 'Could not listen: ' + (st.reason ?? 'unknown reason') }
                    : fwClosed
                        ? { ok: false, text: 'Listening, but Windows Firewall stops phones. Press "allow phones in" first.' }
                        : { ok: true, text: 'Listening. Press "pair a phone" to add one.' });
            return true;
        }
        case 'remote-firewall-allow': {
            const r = await host.allowFirewall();
            ctx.say(r.ok
                ? { ok: true, text: 'Phones are let in now. Press "pair a phone" to add one.' }
                : { ok: false, text: r.cancelled ? 'Nothing changed: Windows asked for permission and the answer was No.' : (r.error ?? 'The rule could not be added.') });
            return true;
        }
        case 'remote-pair': {
            const p = host.pairingLink();
            if ('error' in p) { ctx.say({ ok: false, text: p.error }); return true; }
            ctx.setPair({ ...p, until: Date.now() + PAIR_TTL_MS });
            ctx.say({ ok: true, text: 'Scan the code with the Agent Farm app. It works once, for 10 minutes.' });
            return true;
        }
        case 'remote-revoke': {
            const id = String(msg.device ?? '');
            const name = String(msg.name ?? id);
            if (!id) { ctx.say({ ok: false, text: 'No phone named.' }); return true; }
            if (!await confirm(`Revoke "${name}"? It is disconnected at once and must pair again.`, 'Revoke')) { ctx.say(undefined); return true; }
            const n = host.revoke(id);
            ctx.say(n ? { ok: true, text: `"${name}" is revoked.` } : { ok: false, text: `"${name}" was not paired (or already revoked).` });
            return true;
        }
        case 'remote-revoke-all': {
            if (!await confirm('Revoke EVERY paired phone? Each is disconnected at once and must pair again.', 'Revoke all')) {
                ctx.say(undefined); return true;
            }
            const n = host.revoke();
            ctx.say({ ok: true, text: n ? `${n} phone(s) revoked.` : 'There was no phone to revoke.' });
            return true;
        }
        default:
            return false;
    }
}

async function confirm(text: string, yes: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(text, { modal: true }, yes)) === yes;
}
