/**
 * U-85 — WHAT THE WEB VIEW CARD IS ALLOWED TO CLAIM.
 *
 * The web surface (`webserver.ts`) is off by default, bound to 127.0.0.1
 * unless LAN is opted into, and refuses to start without a token. Three
 * switches, and the question a person actually has is none of them: **can my
 * phone read this farm right now?**
 *
 * ‼️ THE COMMONEST FAILURE IS A GREEN ONE. `enabled` is on, a token exists,
 * the server really bound — and the binding is `local`, so the only link that
 * exists is `http://127.0.0.1:…`, which the phone standing next to the machine
 * cannot open. A card that reported "running" there would be exactly the
 * decoration `hooksCockpit` warns about: a verdict that cannot go amber for
 * the commonest failure. So `local` is its own state, and it is amber.
 *
 * ‼️ AND A QR CODE IS A PROMISE. Drawing one for a loopback URL hands the
 * reader something to photograph that is guaranteed to fail, with no way to
 * tell that from a code that works. `phoneReachable` is the card's licence to
 * draw it, and it is false wherever the link cannot leave this machine —
 * including `lan` on a machine that has no non-internal address right now.
 *
 * Pure: no vscode, no http, no fs. The host hands in what it already knows
 * (the settings, whether `startWebServer` really returned a server, the first
 * non-internal IPv4) and the whole verdict is derived here, so the page, the
 * bridge op and the command all say the same sentence.
 */

/** ‼️ `serving` is the HOST'S OWN knowledge, never a port scan: the extension
 *  holds the object `startWebServer` returned, so it knows whether it bound. */
export interface WebStatusInput {
    /** agentFarm.web.enabled */
    enabled: boolean;
    /** agentFarm.web.port */
    port: number;
    /** agentFarm.web.bind — 'local' = 127.0.0.1 only, 'lan' = every interface */
    bind: 'local' | 'lan';
    /** a token is configured. ‼️ The verdict never carries the token itself. */
    hasToken: boolean;
    /** the server object exists — it bound and is answering */
    serving: boolean;
    /** the first non-internal IPv4, or '' / '127.0.0.1' when there is none */
    lanAddress?: string;
}

export type WebState = 'off' | 'no-token' | 'not-serving' | 'local' | 'lan-no-address' | 'lan';

export const WEB_TONE: Record<WebState, 'ok' | 'bad' | 'warn' | 'off'> = {
    off: 'off',
    'no-token': 'bad',
    'not-serving': 'bad',
    local: 'warn',
    'lan-no-address': 'warn',
    lan: 'ok'
};

export interface WebStatus {
    state: WebState;
    tone: 'ok' | 'bad' | 'warn' | 'off';
    detail: string;
    next?: string;
    /** ‼️ Whether the link can leave this machine — the card's licence to draw
     *  a QR code, and the one fact `enabled && serving` does not carry. */
    phoneReachable: boolean;
    /** the host the link names: the LAN address when there is one, else loopback */
    host: string;
}

/** An address that is really on a network — loopback and blank are not. */
function realAddress(a: string | undefined): string {
    const s = String(a ?? '').trim();
    return s && s !== '127.0.0.1' && s !== '::1' && s !== '0.0.0.0' ? s : '';
}

/**
 * The host a link must name. `lan` without a real address falls back to
 * loopback rather than printing `0.0.0.0`, which resolves to nothing a browser
 * can open.
 */
export function webHost(bind: 'local' | 'lan', lanAddress?: string): string {
    return bind === 'lan' ? (realAddress(lanAddress) || '127.0.0.1') : '127.0.0.1';
}

/**
 * ‼️ THE ONE FORMULA FOR THE LINK. The command, the card, the QR and the
 * bridge op all call this — a second copy anywhere is a link that goes stale
 * the first time the shape changes, in green.
 */
export function webUrl(o: { bind: 'local' | 'lan'; port: number; token: string; lanAddress?: string }): string {
    return `http://${webHost(o.bind, o.lanAddress)}:${o.port}/?t=${o.token}`;
}

/**
 * ‼️ PRECEDENCE IS A DECISION. No token outranks not serving, because the
 * missing token is WHY it is not serving and naming the symptom would send the
 * reader to the port. Not serving outranks the binding, because the binding of
 * a server that never bound is a detail about nothing.
 */
export function webStatus(input: WebStatusInput): WebStatus {
    const lan = realAddress(input.lanAddress);
    const host = webHost(input.bind, input.lanAddress);
    const base = { host };

    if (!input.enabled) {
        return {
            ...base, state: 'off', tone: WEB_TONE.off, phoneReachable: false,
            detail: 'The web view is off — no port is open and no link exists.',
            next: 'Turn it on to read the farm from a phone on this network.'
        };
    }
    if (!input.hasToken) {
        return {
            ...base, state: 'no-token', tone: WEB_TONE['no-token'], phoneReachable: false,
            detail: 'The web view is on but carries no token, so the server refuses to start rather '
                + 'than serving the farm to whoever asks.',
            next: 'Mint a token — the link and the code are built from it.'
        };
    }
    if (!input.serving) {
        return {
            ...base, state: 'not-serving', tone: WEB_TONE['not-serving'], phoneReachable: false,
            detail: `The web view is on and has a token, but nothing is listening on port ${input.port} — `
                + 'the bind failed or something else is holding it.',
            next: `Free port ${input.port}, or give the view a port of its own in agentFarm.web.port.`
        };
    }
    if (input.bind === 'local') {
        return {
            ...base, state: 'local', tone: WEB_TONE.local, phoneReachable: false,
            detail: `Serving on 127.0.0.1:${input.port} — THIS COMPUTER ONLY. A phone on the same `
                + 'network cannot open that link, so there is no code worth scanning.',
            next: 'Switch the binding to LAN to get a link a phone can reach.'
        };
    }
    if (!lan) {
        return {
            ...base, state: 'lan-no-address', tone: WEB_TONE['lan-no-address'], phoneReachable: false,
            detail: `Serving on every interface on port ${input.port}, but this machine has no `
                + 'non-internal IPv4 address right now — the link falls back to 127.0.0.1, which a '
                + 'phone cannot open.',
            next: 'Connect this machine to the network the phone is on, then reopen this card.'
        };
    }
    return {
        ...base, state: 'lan', tone: WEB_TONE.lan, phoneReachable: true,
        detail: `Serving on ${lan}:${input.port} — anyone on this network who has the link can READ `
            + 'the farm. It is read only: no route starts, stops or changes anything.'
    };
}
