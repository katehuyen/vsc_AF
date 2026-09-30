// A phone's side of the remote host, in Node builtins: TLS pinned to the
// fingerprint a pairing link carries, the pairing POST, and a WebSocket that
// answers the host's challenge. Used by tools/remote_probe.js and its test.
'use strict';
const crypto = require('crypto');
const tls = require('tls');

/** One TLS connection that must present `fp` (sha256 of the raw certificate). */
function pinned(host, port, fp, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const s = tls.connect({ host, port, rejectUnauthorized: false, servername: undefined }, () => {
            s.setTimeout(0);
            const got = crypto.createHash('sha256').update(s.getPeerCertificate().raw).digest('hex');
            if (got !== fp) { s.destroy(); reject(new Error(`certificate pin mismatch (got ${got.slice(0, 16)}…)`)); } else { resolve(s); }
        });
        s.setTimeout(timeoutMs, () => { s.destroy(); reject(new Error(`no answer from ${host}:${port} in ${timeoutMs} ms`)); });
        s.on('error', reject);
    });
}

async function request(addr, fp, method, url, body, auth) {
    const s = await pinned(addr.host, addr.port, fp);
    const data = body ? JSON.stringify(body) : '';
    s.write(`${method} ${url} HTTP/1.1\r\nHost: ${addr.host}\r\nConnection: close\r\n`
        + (auth ? `Authorization: AF ${auth}\r\n` : '')
        + `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`);
    let raw = '';
    for await (const c of s) { raw += c; }
    const [head, ...rest] = raw.split('\r\n\r\n');
    const text = rest.join('\r\n\r\n');
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: Number(head.split(' ')[1]), body: text, json };
}

async function socket(addr, fp) {
    const s = await pinned(addr.host, addr.port, fp);
    const key = crypto.randomBytes(16).toString('base64');
    s.write(`GET /ws HTTP/1.1\r\nHost: ${addr.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n`
        + `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const frames = [];
    let buf = Buffer.alloc(0), up = false;
    const c = { frames, closed: false, onFrame: null };
    s.on('data', d => {
        buf = Buffer.concat([buf, d]);
        if (!up) { const e = buf.indexOf('\r\n\r\n'); if (e < 0) { return; } up = true; buf = buf.subarray(e + 4); }
        while (buf.length >= 2) {
            let n = buf[1] & 127, off = 2;
            if (n === 126) { if (buf.length < 4) { break; } n = buf.readUInt16BE(2); off = 4; }
            else if (n === 127) { if (buf.length < 10) { break; } n = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + n) { break; }
            if ((buf[0] & 15) === 1) {
                const f = JSON.parse(buf.subarray(off, off + n).toString());
                frames.push(f);
                if (c.onFrame) { c.onFrame(f); }
            }
            buf = buf.subarray(off + n);
        }
    });
    s.on('close', () => { c.closed = true; });
    s.on('error', () => { c.closed = true; });
    c.send = obj => {
        const p = Buffer.from(JSON.stringify(obj)), m = crypto.randomBytes(4);
        const head = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length])
            : Buffer.from([0x81, 0x80 | 126, p.length >> 8, p.length & 255]);
        for (let i = 0; i < p.length; i++) { p[i] ^= m[i & 3]; }
        s.write(Buffer.concat([head, m, p]));
    };
    c.wait = async (pred, ms = 5000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            const f = frames.find(pred);
            if (f) { return f; }
            if (c.closed) { return null; }
            await new Promise(r => setTimeout(r, 10));
        }
        return null;
    };
    c.close = () => s.destroy();
    return c;
}

/** "host:port" → { host, port } (IPv4 or a name; the contract names IPv4 addresses). */
function addrOf(text) {
    const i = String(text).lastIndexOf(':');
    return { host: text.slice(0, i), port: Number(text.slice(i + 1)) };
}

module.exports = { pinned, request, socket, addrOf };
