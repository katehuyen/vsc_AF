/**
 * Where the remote host listens, and which addresses a pairing QR names, for
 * each agentFarm.remote.listen mode. Pure: it reads the interface table it is
 * given (os.networkInterfaces()), so the choice is tested without a network.
 *
 * Tailscale's addresses are its CGNAT range, 100.64.0.0/10. LAN is every other
 * private IPv4 address; a LAN listen binds all interfaces, so a phone on the
 * tailnet reaches it too, but the QR only names what the mode promises.
 */
export type ListenMode = 'off' | 'local' | 'lan' | 'tailscale';
export const LISTEN_MODES: ListenMode[] = ['off', 'local', 'lan', 'tailscale'];
export const DEFAULT_REMOTE_PORT = 7443;

export interface NetAddr { address: string; family: string | number; internal: boolean }
export type NetTable = Record<string, NetAddr[] | undefined>;

export type ListenPlan =
    | { listen: false; reason: string }
    | { listen: true; host: string; addresses: string[] };

export function isListenMode(v: unknown): v is ListenMode {
    return typeof v === 'string' && (LISTEN_MODES as string[]).includes(v);
}

function ipv4(table: NetTable): string[] {
    const out: string[] = [];
    for (const list of Object.values(table)) {
        for (const a of list ?? []) {
            if ((a.family === 'IPv4' || a.family === 4) && !a.internal) { out.push(a.address); }
        }
    }
    return out;
}

export function isTailscale(ip: string): boolean {
    const p = ip.split('.').map(Number);
    return p.length === 4 && p[0] === 100 && p[1] >= 64 && p[1] <= 127;
}

export function isPrivateLan(ip: string): boolean {
    const p = ip.split('.').map(Number);
    if (p.length !== 4) { return false; }
    return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

export function listenPlan(mode: ListenMode, table: NetTable): ListenPlan {
    if (mode === 'off') { return { listen: false, reason: 'agentFarm.remote.listen is off' }; }
    if (mode === 'local') { return { listen: true, host: '127.0.0.1', addresses: ['127.0.0.1'] }; }
    const all = ipv4(table);
    if (mode === 'tailscale') {
        const ts = all.filter(isTailscale);
        return ts.length
            ? { listen: true, host: ts[0], addresses: ts }
            : { listen: false, reason: 'no Tailscale address on this machine (100.64.0.0/10) - is Tailscale running?' };
    }
    const lan = all.filter(isPrivateLan);
    return lan.length
        ? { listen: true, host: '0.0.0.0', addresses: lan }
        : { listen: false, reason: 'no private network address on this machine - is it on Wi-Fi or Ethernet?' };
}

/** host:port strings for a pairing link. */
export function pairAddresses(plan: ListenPlan, port: number): string[] {
    return plan.listen ? plan.addresses.map(a => `${a}:${port}`) : [];
}

/** X-449 — what the extension tells the headless service about the phone (it cannot read VS Code settings). */
export const REMOTE_CONFIG_FILE = 'remote-config.json';
/** How many times VS Code asks for the port again, a retry apart, while the service lets go of it. */
export const PORT_RETRIES = 3;
export const PORT_RETRY_MS = 20_000;

/** The port is taken (the service may still hold it after VS Code was away): try again, quietly, a few times. */
export function retryPort(reason: string | undefined, attempt: number): boolean {
    return /already in use/.test(reason ?? '') && attempt < PORT_RETRIES;
}
