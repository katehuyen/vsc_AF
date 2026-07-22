// Dependency-free image dimension reader for the Airtable engine module.
//
// The old prototype pulled in the `image-size` npm package, but the Agent Farm
// VSIX ships no node_modules (only compiled out/**), so a runtime dependency
// would silently fail once packaged. This reads width/height straight from the
// file header for the formats the engine cares about (PNG, JPEG, GIF, WebP,
// BMP). Anything it can't parse returns null and the record simply stores 0×0.

import * as fs from 'fs';

export interface ImageDims { width: number; height: number; type: string; }

/** Parse dimensions from an in-memory image buffer, or null if unrecognised. */
export function imageSize(buf: Buffer): ImageDims | null {
    if (buf.length < 24) { return null; }

    // PNG — 89 50 4E 47, IHDR width/height as big-endian uint32 at 16/20.
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
    }

    // GIF — "GIF8", logical screen width/height little-endian uint16 at 6/8.
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' };
    }

    // BMP — "BM", width int32 at 18, height int32 at 22 (may be negative).
    if (buf[0] === 0x42 && buf[1] === 0x4d) {
        return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)), type: 'bmp' };
    }

    // WebP — "RIFF"...."WEBP", then a VP8 / VP8L / VP8X chunk.
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const dims = webpSize(buf);
        if (dims) { return dims; }
    }

    // JPEG — FFD8, scan segments for a Start-Of-Frame marker.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        return jpegSize(buf);
    }

    return null;
}

function webpSize(buf: Buffer): ImageDims | null {
    const fourcc = buf.toString('ascii', 12, 16);
    try {
        if (fourcc === 'VP8 ') {
            // Lossy: 3-byte frame tag + 3-byte start code (0x9d012a) at 20, dims at 26/28 (14-bit).
            const width = buf.readUInt16LE(26) & 0x3fff;
            const height = buf.readUInt16LE(28) & 0x3fff;
            return { width, height, type: 'webp' };
        }
        if (fourcc === 'VP8L') {
            // Lossless: signature 0x2f at 20, then 14-bit width-1 / height-1 packed.
            const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
            const width = 1 + (((b2 & 0x3f) << 8) | b1);
            const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
            return { width, height, type: 'webp' };
        }
        if (fourcc === 'VP8X') {
            // Extended: 24-bit canvas width-1 at 24, height-1 at 27 (little-endian).
            const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
            const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
            return { width, height, type: 'webp' };
        }
    } catch { /* truncated header */ }
    return null;
}

function jpegSize(buf: Buffer): ImageDims | null {
    let offset = 2;
    const len = buf.length;
    while (offset < len) {
        // Markers are 0xFF followed by a type byte; runs of 0xFF are padding.
        if (buf[offset] !== 0xff) { offset++; continue; }
        let marker = buf[offset + 1];
        while (marker === 0xff && offset + 1 < len) { offset++; marker = buf[offset + 1]; }
        // SOF markers carry the frame size. C4 (DHT), C8 (JPG) and CC (DAC) do not.
        if (marker >= 0xc0 && marker <= 0xcf &&
            marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const height = buf.readUInt16BE(offset + 5);
            const width = buf.readUInt16BE(offset + 7);
            return { width, height, type: 'jpg' };
        }
        // Standalone markers (RSTn, SOI, EOI) have no length payload.
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        const segLen = buf.readUInt16BE(offset + 2);
        if (segLen < 2) { return null; }
        offset += 2 + segLen;
    }
    return null;
}

/** Best-effort dimensions for an image file on disk. Never throws. */
export async function imageDimsOfFile(absPath: string): Promise<{ width: number; height: number }> {
    try {
        const buf = await fs.promises.readFile(absPath);
        const dims = imageSize(buf);
        if (dims && dims.width > 0 && dims.height > 0) {
            return { width: dims.width, height: dims.height };
        }
    } catch { /* unreadable or unsupported */ }
    return { width: 0, height: 0 };
}
