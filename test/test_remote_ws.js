// X-442 — THE REMOTE HOST'S WEBSOCKET, node builtins only, measured on the wire.
//
// A raw client writes the frames byte by byte, so every rule is checked against
// what actually crosses the socket: the upgrade answer, masked text (whole and
// fragmented), ping/pong, and the refusals a LAN listener owes a stranger —
// unmasked frames, binary, oversized lengths, a non-WebSocket upgrade.
'use strict';
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const W = require(path.join(ROOT, 'out', 'remote', 'server', 'ws.js'));

function frame(op, payload, { mask = true, fin = true, len } = {}) {
    const n = len === undefined ? payload.length : len;
    const head = [(fin ? 0x80 : 0) | op];
    const m = mask ? 0x80 : 0;
    if (n < 126) { head.push(m | n); } else if (n < 65536) { head.push(m | 126, n >> 8, n & 255); } else {
        head.push(m | 127, 0, 0, 0, 0, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    if (!mask) { return Buffer.concat([Buffer.from(head), payload]); }
    const key = crypto.randomBytes(4);
    const body = Buffer.from(payload);
    for (let i = 0; i < body.length; i++) { body[i] ^= key[i & 3]; }
    return Buffer.concat([Buffer.from(head), key, body]);
}

/** Server echoing every message; one client that writes `bytes` after the upgrade (or with it). */
function session(bytes, { withUpgrade = false, badUpgrade = false } = {}) {
    return new Promise(resolve => {
        const got = { status: '', frames: [], closeCode: null, serverClose: null, messages: [] };
        const server = http.createServer();
        server.on('upgrade', (req, socket, head) => {
            const c = W.acceptUpgrade(req, socket, head);
            if (!c) { return; }
            c.on('message', m => { got.messages.push(m); c.send('echo:' + m); });
            c.on('close', code => { got.serverClose = code; });
        });
        server.listen(0, '127.0.0.1', () => {
            const key = crypto.randomBytes(16).toString('base64');
            const s = net.connect(server.address().port, '127.0.0.1');
            let buf = Buffer.alloc(0);
            let upgraded = false;
            s.on('data', d => {
                buf = Buffer.concat([buf, d]);
                if (!upgraded) {
                    const end = buf.indexOf('\r\n\r\n');
                    if (end < 0) { return; }
                    got.status = buf.subarray(0, end).toString();
                    got.accepted = got.status.includes(W.acceptKey(key));
                    buf = buf.subarray(end + 4);
                    upgraded = true;
                    if (!withUpgrade && !badUpgrade) { s.write(bytes); }
                }
                while (buf.length >= 2) {
                    const len = buf[1] & 127;
                    const off = len === 126 ? 4 : 2;
                    const n = len === 126 ? buf.readUInt16BE(2) : len;
                    if (buf.length < off + n) { break; }
                    const body = buf.subarray(off, off + n);
                    got.frames.push({ op: buf[0] & 15, text: body.toString() });
                    if ((buf[0] & 15) === 8 && body.length >= 2) { got.closeCode = body.readUInt16BE(0); }
                    buf = buf.subarray(off + n);
                }
            });
            const done = () => { server.close(); resolve(got); };
            s.on('close', done);
            s.on('error', () => undefined);
            setTimeout(() => s.destroy(), 400);
            const hdr = badUpgrade
                ? 'GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
                : `GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
            s.write(withUpgrade ? Buffer.concat([Buffer.from(hdr), bytes]) : hdr);
        });
    });
}

const T = s => Buffer.from(s, 'utf8');

(async () => {
    let g = await session(frame(1, T('merhaba · çiftlik')));
    ok('the upgrade is answered 101 with the right accept key', /^HTTP\/1\.1 101/.test(g.status) && g.accepted);
    ok('a masked text message arrives whole (UTF-8 kept)', g.messages[0] === 'merhaba · çiftlik');
    ok('send() reaches the client as an unmasked text frame', g.frames.some(f => f.op === 1 && f.text === 'echo:merhaba · çiftlik'));

    g = await session(Buffer.concat([frame(1, T('bir '), { fin: false }), frame(9, T('p')), frame(0, T('iki '), { fin: false }), frame(0, T('üç'))]));
    ok('a fragmented message is joined, a ping between its parts answered', g.messages[0] === 'bir iki üç' && g.frames.some(f => f.op === 10 && f.text === 'p'));

    g = await session(frame(1, T('x'.repeat(70000))));
    ok('a 16-bit length message arrives', g.messages[0] && g.messages[0].length === 70000);

    g = await session(frame(1, T('açık'), { mask: false }));
    ok('an unmasked client frame closes with 1002 and is not delivered', g.closeCode === 1002 && g.messages.length === 0);

    g = await session(frame(2, T('bin')));
    ok('a binary frame closes with 1003', g.closeCode === 1003);

    g = await session(frame(1, Buffer.alloc(0), { len: W.MAX_MESSAGE + 1 }));
    ok('a length past MAX_MESSAGE closes with 1009 before any body is read', g.closeCode === 1009);

    g = await session(Buffer.concat([frame(1, T('a'), { fin: false }), frame(1, T('b'))]));
    ok('a new message inside a fragmented one closes with 1002', g.closeCode === 1002 && g.messages.length === 0);

    g = await session(frame(8, Buffer.from([3, 232])));
    ok('a client close is answered and the server side reports it', g.serverClose === 1000);

    g = await session(frame(1, T('erken')), { withUpgrade: true });
    ok('bytes that rode in with the upgrade are not lost', g.messages[0] === 'erken');

    g = await session(Buffer.alloc(0), { badUpgrade: true });
    ok('an upgrade without a key or version is refused 400', /^HTTP\/1\.1 400/.test(g.status));

    console.log(`remote ws: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
