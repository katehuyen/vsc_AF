/**
 * The local web surface — Agent Farm, readable from a phone.
 *
 * A tiny HTTP server over the snapshot file (websnapshot.ts). Three routes and
 * nothing else:
 *
 *   GET /            the page (one self-contained HTML document)
 *   GET /snapshot.json   the data the page polls
 *   GET /health      liveness, no auth (so a monitor can ping it)
 *
 * Deliberate limits, because this is the one part of Agent Farm that can face
 * a network:
 *  - **off by default**, and bound to 127.0.0.1 unless LAN is opted into;
 *  - a **token is mandatory** — no token configured means the server refuses
 *    to start rather than serving the farm to whoever asks;
 *  - **read only**. There is no route that starts, stops or changes anything.
 *    Driving the farm from outside is the bridge's job, behind the user's own
 *    machine boundary.
 *
 * No dependencies: node's http, and the page is a string.
 */

import * as fs from 'fs';
import * as http from 'http';
import { renderPage } from './webpage';

export type WebRoute = 'page' | 'snapshot' | 'health' | 'notfound';

/** Route from a request path — pure, so the table is testable. */
export function routeOf(rawUrl: string): WebRoute {
    const path = String(rawUrl || '/').split('?')[0].replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/index.html') { return 'page'; }
    if (path === '/snapshot.json') { return 'snapshot'; }
    if (path === '/health') { return 'health'; }
    return 'notfound';
}

/**
 * Is this request allowed? The token may travel as `?t=`, as an
 * `Authorization: Bearer` header, or as the cookie the page sets after its
 * first authorised load (so a phone bookmark keeps working without the token
 * sitting in the address bar). Comparison is length-safe but deliberately
 * simple — this is a LAN token, not a password vault.
 */
export function authorize(
    rawUrl: string,
    headers: { authorization?: string; cookie?: string },
    token: string
): boolean {
    if (!token) { return false; }
    const qs = String(rawUrl || '').split('?')[1] ?? '';
    const fromQuery = new URLSearchParams(qs).get('t') ?? '';
    if (fromQuery && safeEqual(fromQuery, token)) { return true; }
    const auth = headers.authorization ?? '';
    const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (bearer && safeEqual(bearer[1].trim(), token)) { return true; }
    const cookie = /(?:^|;\s*)af_token=([^;]+)/.exec(headers.cookie ?? '');
    if (cookie && safeEqual(decodeURIComponent(cookie[1]), token)) { return true; }
    return false;
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) { return false; }
    let diff = 0;
    for (let i = 0; i < a.length; i++) { diff |= a.charCodeAt(i) ^ b.charCodeAt(i); }
    return diff === 0;
}

/** A token nobody has to invent: 32 hex chars from the runtime's own RNG. */
export function generateToken(): string {
    let out = '';
    for (let i = 0; i < 32; i++) { out += Math.floor(Math.random() * 16).toString(16); }
    return out;
}

export interface WebServerOptions {
    port: number;
    /** 'local' = 127.0.0.1 only; 'lan' = every interface (opt-in) */
    bind: 'local' | 'lan';
    token: string;
    /** file the snapshot is read from on every request — never cached */
    snapshotFile: string;
    /** who is serving right now, shown on the page */
    writer: 'extension' | 'service';
    onLog?: (line: string) => void;
}

export interface RunningWebServer {
    close(): void;
    url(): string;
    port: number;
}

export function startWebServer(
    opts: WebServerOptions,
    onError?: (err: Error) => void
): RunningWebServer | undefined {
    if (!opts.token) {
        onError?.(new Error('refusing to start without a token'));
        return undefined;
    }
    const host = opts.bind === 'lan' ? '0.0.0.0' : '127.0.0.1';
    const server = http.createServer((req, res) => {
        const route = routeOf(req.url ?? '/');
        if (route === 'health') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, writer: opts.writer }));
            return;
        }
        if (route === 'notfound') {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('not found');
            return;
        }
        if (!authorize(req.url ?? '', req.headers as { authorization?: string; cookie?: string }, opts.token)) {
            res.writeHead(401, { 'content-type': 'text/plain' });
            res.end('Agent Farm: a token is required — open the URL the panel gave you (…?t=…)');
            return;
        }
        if (route === 'snapshot') {
            let body = '{}';
            try { body = fs.readFileSync(opts.snapshotFile, 'utf8'); } catch { /* not written yet */ }
            res.writeHead(200, {
                'content-type': 'application/json',
                'cache-control': 'no-store'
            });
            res.end(body);
            return;
        }
        // the page — set the cookie so a bookmark without ?t= keeps working
        res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'set-cookie': `af_token=${encodeURIComponent(opts.token)}; Path=/; SameSite=Strict; Max-Age=31536000`
        });
        res.end(renderPage());
    });
    server.on('error', e => {
        opts.onLog?.(`web server error: ${String(e)}`);
        onError?.(e as Error);
    });
    try {
        server.listen(opts.port, host);
    } catch (e) {
        onError?.(e as Error);
        return undefined;
    }
    return {
        close: () => { try { server.close(); } catch { /* already closed */ } },
        port: opts.port,
        url: () => `http://${opts.bind === 'lan' ? lanAddress() : '127.0.0.1'}:${opts.port}/?t=${opts.token}`
    };
}

/** First non-internal IPv4 address — what to type into the phone. */
export function lanAddress(): string {
    try {
        // required lazily: the service side has no need for os until now
        const os = require('os') as typeof import('os');
        for (const list of Object.values(os.networkInterfaces())) {
            for (const ni of list ?? []) {
                if (ni.family === 'IPv4' && !ni.internal) { return ni.address; }
            }
        }
    } catch { /* fall through */ }
    return '127.0.0.1';
}
