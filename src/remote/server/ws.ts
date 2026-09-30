/**
 * The server side of a WebSocket (RFC 6455) with node builtins only: text
 * messages (fragmented or not), ping/pong, close. Hardened for a listener on
 * the LAN: a client frame must be masked, a message may not outgrow
 * MAX_MESSAGE, and anything else it does not speak (binary, extensions,
 * reserved bits) closes the socket rather than being guessed at.
 */
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_MESSAGE = 16 * 1024 * 1024;

export const acceptKey = (key: string) => crypto.createHash('sha1').update(key + GUID).digest('base64');

export function encodeFrame(opcode: number, payload: Buffer): Buffer {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | opcode, n])
        : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255])
            : Buffer.concat([Buffer.from([0x80 | opcode, 127, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; })()]);
    return Buffer.concat([head, payload]);
}

/** One accepted socket. Emits 'message' (string) and 'close' (code). */
export class WsConn extends EventEmitter {
    private buf = Buffer.alloc(0);
    private parts: Buffer[] = [];
    private partLen = 0;
    open = true;

    constructor(private readonly socket: Duplex, first: Buffer) {
        super();
        socket.on('data', (d: Buffer) => { this.buf = Buffer.concat([this.buf, d]); this.drain(); });
        socket.on('close', () => this.closed(1006));
        socket.on('error', () => this.closed(1006));
        if (first.length) { this.buf = Buffer.from(first); setImmediate(() => this.drain()); }
    }

    private drain(): void {
        while (this.open && this.buf.length >= 2) {
            const fin = (this.buf[0] & 0x80) !== 0;
            const op = this.buf[0] & 15;
            if ((this.buf[0] & 0x70) !== 0) { return this.close(1002); }
            if ((this.buf[1] & 0x80) === 0) { return this.close(1002); }
            let len = this.buf[1] & 127;
            let off = 2;
            if (len === 126) { if (this.buf.length < 4) { return; } len = this.buf.readUInt16BE(2); off = 4; }
            else if (len === 127) {
                if (this.buf.length < 10) { return; }
                if (this.buf.readUInt32BE(2) !== 0) { return this.close(1009); }
                len = this.buf.readUInt32BE(6); off = 10;
            }
            if (len > MAX_MESSAGE) { return this.close(1009); }
            const need = off + 4 + len;
            if (this.buf.length < need) { return; }
            const key = this.buf.subarray(off, off + 4);
            const body = Buffer.from(this.buf.subarray(off + 4, need));
            for (let i = 0; i < body.length; i++) { body[i] ^= key[i & 3]; }
            this.buf = this.buf.subarray(need);
            if (op === 8) { return this.close(1000); }
            if (op === 9) { this.write(10, body); continue; }
            if (op === 10) { continue; }
            if (op === 2 || (op !== 0 && op !== 1)) { return this.close(1003); }
            if (op === 1 && this.parts.length) { return this.close(1002); }
            if (op === 0 && !this.parts.length) { return this.close(1002); }
            this.partLen += body.length;
            if (this.partLen > MAX_MESSAGE) { return this.close(1009); }
            this.parts.push(body);
            if (fin) {
                const text = Buffer.concat(this.parts).toString('utf8');
                this.parts = []; this.partLen = 0;
                this.emit('message', text);
            }
        }
    }

    private write(op: number, payload: Buffer): void {
        if (this.open) { this.socket.write(encodeFrame(op, payload)); }
    }

    send(text: string): void { this.write(1, Buffer.from(text, 'utf8')); }

    close(code = 1000): void {
        if (!this.open) { return; }
        const b = Buffer.alloc(2);
        b.writeUInt16BE(code);
        this.write(8, b);
        this.socket.end();
        this.closed(code);
    }

    private closed(code: number): void {
        if (!this.open) { return; }
        this.open = false;
        this.emit('close', code);
    }
}

/** Answers an http(s) 'upgrade' request; null (socket destroyed) when it is not a WebSocket upgrade. */
export function acceptUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): WsConn | null {
    const key = req.headers['sec-websocket-key'];
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    if (typeof key !== 'string' || upgrade !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return null;
    }
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
    return new WsConn(socket, head);
}
