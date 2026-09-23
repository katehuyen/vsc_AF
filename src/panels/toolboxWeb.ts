/**
 * U-85 — THE WEB VIEW CARD'S HOST SIDE: the data it is handed, and the four
 * acts its buttons perform.
 *
 * ‼️ THE PAGE IS HANDED CONCLUSIONS, NOT INGREDIENTS — the same rule the
 * Telegram and Live Hooks cards were built on. `state`, `tone`, `detail` and
 * the link all arrive from `core/webCockpit.ts`; the QR is encoded HERE, not
 * on the page, because a webview drawing its own code would be a second copy
 * of the encoder that no test renders.
 *
 * ‼️ AND THE CODE IS ONLY DRAWN WHERE IT WOULD WORK. `phoneReachable` is the
 * licence: a QR over `http://127.0.0.1:…` is something to photograph that is
 * guaranteed to fail and looks exactly like one that does not. So the card
 * gets `qr: undefined` in every unreachable state and says why instead.
 */
import * as vscode from 'vscode';
import { qrEncode, qrSvg } from '../core/qr';
import { webStatus, webUrl } from '../core/webCockpit';

/** What the extension host lends the card. Optional everywhere: a window that
 *  supplies nothing simply does not draw it. */
export interface WebViewHost {
    /** the settings plus the one thing only the host knows: did the server bind */
    snapshot(): {
        enabled: boolean;
        port: number;
        bind: 'local' | 'lan';
        token: string;
        serving: boolean;
        lanAddress: string;
    };
    /**
     * ‼️ THE FOUR ACTS ARE NAMED AFTER THE HOST CLOSURES THEY CALL, not after
     * the buttons. The bridge ops call those same four functions, so the name
     * is what makes "the card and the op do the same thing" a fact a reader
     * and the parity gate can both check — rather than a claim in a comment.
     */
    /** mint a token if there is none, record the binding, switch on, start */
    enableWebView(bind: 'local' | 'lan'): Promise<void>;
    /** switch off — the port closes and every link stops working */
    disableWebView(): Promise<void>;
    /** move the binding while it is on; the server rebinds */
    setWebBind(bind: 'local' | 'lan'): Promise<void>;
    /** ‼️ a NEW token: every link and every phone bookmark made before it dies */
    newWebToken(): Promise<void>;
}

/** ‼️ A BIND COMES OFF A MESSAGE, so it is named rather than trusted. */
export function webBind(v: unknown): 'local' | 'lan' {
    return String(v ?? '') === 'lan' ? 'lan' : 'local';
}

/**
 * Everything the card reads, already decided. `url` carries the token because
 * the link is useless without it and this is the user's own window — the same
 * link the "Open Web View…" command has always shown.
 */
export function webCardData(host: WebViewHost | undefined): Record<string, unknown> | undefined {
    if (!host) { return undefined; }
    const s = host.snapshot();
    const status = webStatus({
        enabled: s.enabled, port: s.port, bind: s.bind,
        hasToken: !!s.token, serving: s.serving, lanAddress: s.lanAddress
    });
    const url = s.token ? webUrl({ bind: s.bind, port: s.port, token: s.token, lanAddress: s.lanAddress }) : '';
    return {
        enabled: s.enabled,
        port: s.port,
        bind: s.bind,
        hasToken: !!s.token,
        serving: s.serving,
        lanAddress: s.lanAddress,
        url,
        status,
        // ‼️ encoded here, and only where it would work (see the head note)
        ...(status.phoneReachable && url
            ? { qr: qrSvg(qrEncode(url), { scale: 4, title: 'Open Agent Farm on your phone' }) }
            : {})
    };
}

export interface WebCardContext {
    host?: WebViewHost;
    /** one answer line on the card, then a redraw */
    say(m: { ok: boolean; text: string } | undefined): void;
}

/**
 * The card's four acts. Returns true when the message was ours, so the panel's
 * switch can fall through to its own cases.
 *
 * ‼️ TURNING LAN ON IS ASKED ABOUT, EVERY TIME. It makes the dashboard
 * readable by anyone on the network who has the link — the same confirmation
 * the `web.enable` bridge op requires, for the same reason, and it is asked
 * here rather than trusted to the page: a webview is not where a security
 * decision is allowed to live.
 */
export async function webCardMessage(
    msg: { type?: unknown;[k: string]: unknown },
    ctx: WebCardContext
): Promise<boolean> {
    const type = String(msg?.type ?? '');
    if (type.indexOf('web-') !== 0) { return false; }
    const host = ctx.host;
    if (!host) { ctx.say({ ok: false, text: 'This window does not host the web view.' }); return true; }

    switch (type) {
        case 'web-start': {
            const bind = webBind(msg.bind);
            if (bind === 'lan' && !await confirmLan()) { ctx.say(undefined); return true; }
            await host.enableWebView(bind);
            ctx.say({
                ok: true, text: bind === 'lan'
                    ? 'The web view is on and reachable from this network — scan the code.'
                    : 'The web view is on, on this computer only.'
            });
            return true;
        }
        case 'web-stop':
            await host.disableWebView();
            ctx.say({ ok: true, text: 'The web view is off — the port is closed and every link stops working.' });
            return true;
        case 'web-bind': {
            const bind = webBind(msg.bind);
            if (bind === 'lan' && !await confirmLan()) { ctx.say(undefined); return true; }
            await host.setWebBind(bind);
            ctx.say({
                ok: true, text: bind === 'lan'
                    ? 'Bound to this network — the link now names this machine.'
                    : 'Bound to 127.0.0.1 — this computer only, and no code to scan.'
            });
            return true;
        }
        case 'web-token': {
            const yes = await vscode.window.showWarningMessage(
                'Mint a new token? Every link and every phone bookmark made from the old one stops working.',
                { modal: true }, 'New token');
            if (yes !== 'New token') { ctx.say(undefined); return true; }
            await host.newWebToken();
            ctx.say({ ok: true, text: 'A new token is in force — the old links are dead. Scan the new code.' });
            return true;
        }
        case 'web-copy': {
            const url = String(msg.url ?? '');
            if (!url) { ctx.say({ ok: false, text: 'There is no link to copy yet.' }); return true; }
            await vscode.env.clipboard.writeText(url);
            ctx.say({ ok: true, text: 'The link is on the clipboard — it carries the token.' });
            return true;
        }
        default:
            return false;
    }
}

async function confirmLan(): Promise<boolean> {
    const yes = await vscode.window.showWarningMessage(
        'Serve the dashboard to this whole network? Anyone on it who has the link can READ your farm. '
        + 'It stays read only — no route starts, stops or changes anything.',
        { modal: true }, 'Serve on the network');
    return yes === 'Serve on the network';
}
