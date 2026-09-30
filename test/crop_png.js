#!/usr/bin/env node
'use strict';
/**
 * Cut a rectangle out of a screenshot, so a 12px control can be LOOKED at.
 *
 *   node test/shoot_page.js console --scene 38 --scale 3
 *   node test/crop_png.js dist/render/console.s38.png 900,1640,3200,80
 *
 * A whole-page shot scaled to fit a reader leaves a status-row chip a few
 * pixels wide: "is the icon legible?" cannot be answered from it. Shoot at
 * `--scale N`, then crop the row — the box is in the PNG's own pixels.
 * Writes `<name>.crop.png` beside the input unless an output path is given.
 * No dependencies: 8-bit RGB/RGBA, non-interlaced — what Chrome writes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function chunks(buf) {
    const out = [];
    for (let p = 8; p < buf.length;) {
        const len = buf.readUInt32BE(p);
        out.push({ type: buf.toString('latin1', p + 4, p + 8), data: buf.subarray(p + 8, p + 8 + len) });
        p += 12 + len;
    }
    return out;
}

function decode(buf) {
    const cs = chunks(buf);
    const ih = cs.find(c => c.type === 'IHDR').data;
    const w = ih.readUInt32BE(0), h = ih.readUInt32BE(4);
    const depth = ih[8], ctype = ih[9], interlace = ih[12];
    if (depth !== 8 || (ctype !== 6 && ctype !== 2) || interlace) {
        throw new Error(`unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
    }
    const bpp = ctype === 6 ? 4 : 3;
    const raw = zlib.inflateSync(Buffer.concat(cs.filter(c => c.type === 'IDAT').map(c => c.data)));
    const stride = w * bpp;
    const px = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        const src = y * (stride + 1) + 1;
        const row = y * stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? px[row + x - bpp] : 0;
            const b = y ? px[row - stride + x] : 0;
            const c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
            let v = raw[src + x];
            if (f === 1) { v += a; } else if (f === 2) { v += b; } else if (f === 3) { v += (a + b) >> 1; } else if (f === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[row + x] = v & 255;
        }
    }
    return { w, h, bpp, ctype, px };
}

function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
}

function encode(img, x0, y0, cw, ch) {
    const rows = [];
    for (let y = y0; y < y0 + ch; y++) {
        const start = (y * img.w + x0) * img.bpp;
        rows.push(Buffer.from([0]), img.px.subarray(start, start + cw * img.bpp));
    }
    const ih = Buffer.alloc(13);
    ih.writeUInt32BE(cw, 0); ih.writeUInt32BE(ch, 4); ih[8] = 8; ih[9] = img.ctype;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
        chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

function main() {
    const [input, box, output] = process.argv.slice(2);
    if (!input || !box) {
        console.log('usage: node test/crop_png.js <in.png> x,y,w,h [out.png]');
        return;
    }
    const out = output || input.replace(/\.png$/i, '') + '.crop.png';
    const r = crop(input, box.split(',').map(Number), out);
    console.log(`${path.relative(process.cwd(), out)} · ${r.w}×${r.h} of ${r.of}`);
}

/** Cut [x, y, w, h] (the PNG's own pixels, clamped to it) out of `input` into `out`. */
function crop(input, [x, y, w, h], out) {
    const img = decode(fs.readFileSync(input));
    x = Math.max(0, Math.min(x, img.w - 1)); y = Math.max(0, Math.min(y, img.h - 1));
    w = Math.min(w, img.w - x); h = Math.min(h, img.h - y);
    fs.writeFileSync(out, encode(img, x, y, w, h));
    return { w, h, of: `${img.w}×${img.h}` };
}

if (require.main === module) { main(); }
module.exports = { crop };
