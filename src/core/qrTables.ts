/**
 * U-85 — THE NUMBERS A QR CODE IS MADE OF, kept apart from the encoder that
 * uses them so a typo in a table is a typo in ONE readable place.
 *
 * ‼️ AND THE TABLE IS CHECKED AGAINST GEOMETRY RATHER THAN TRUSTED. A wrong
 * block count produces a symbol that looks perfect and scans as nothing, and
 * no round-trip test catches it — the encoder and the decoder would share the
 * mistake. `totalCodewords()` derives the same figure from the symbol's own
 * size, so `blocks()` can be asserted against it for every version and level
 * (test_qr.js does exactly that). This repo ships no dependencies; this is
 * why the tables live here rather than in a package.
 *
 * Scope: versions 1-10, byte mode. A tokenised LAN URL is ~60 characters,
 * which fits version 4 at EC M with room to spare.
 */

export type QrEc = 'L' | 'M' | 'Q' | 'H';
export const QR_EC: QrEc[] = ['L', 'M', 'Q', 'H'];

/** The two-bit field the format information carries for each level. */
export const EC_BITS: Record<QrEc, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Modules per side. */
export const sizeOf = (version: number): number => 17 + 4 * version;

/** Where the alignment patterns are centred, per version (v1 has none). */
export const ALIGNMENT: number[][] = [
    [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

/**
 * How many 8-bit codewords a version holds in total — derived, not listed.
 * Everything that is not data: the three finders with their separators and the
 * format strip (192 + 31 modules), the timing rows, the alignment patterns,
 * and from version 7 the two version blocks.
 */
export function totalCodewords(version: number): number {
    const v = version;
    let bits = (16 * v + 128) * v + 64;
    if (v >= 2) {
        const n = Math.floor(v / 7) + 2;
        bits -= 25 * n * n - 10 * n - 55;
    }
    if (v >= 7) { bits -= 36; }
    return Math.floor(bits / 8);
}

export interface QrBlocks {
    /** error-correction codewords per block */
    ecPerBlock: number;
    /** [blocks, data codewords each] for the short group and the long one */
    group1: [number, number];
    group2: [number, number];
}

// [ecPerBlock, g1blocks, g1data, g2blocks, g2data] per version (1-10) per level.
const TABLE: Record<QrEc, number[][]> = {
    L: [[7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0], [26, 1, 108, 0, 0],
        [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0], [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]],
    M: [[10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
        [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]],
    Q: [[13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0], [18, 2, 15, 2, 16],
        [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20]],
    H: [[17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0], [22, 2, 11, 2, 12],
        [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16]]
};

export const QR_MAX_VERSION = 10;

export function blocks(version: number, ec: QrEc): QrBlocks {
    const r = TABLE[ec][version - 1];
    return { ecPerBlock: r[0], group1: [r[1], r[2]], group2: [r[3], r[4]] };
}

/** Data codewords available to the payload at this version and level. */
export function dataCodewords(version: number, ec: QrEc): number {
    const b = blocks(version, ec);
    return b.group1[0] * b.group1[1] + b.group2[0] * b.group2[1];
}

/** GF(256) with the QR polynomial (0x11d), as exp/log tables. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) { x ^= 0x11d; }
    }
    for (let i = 255; i < 512; i++) { EXP[i] = EXP[i - 255]; }
}

export const gfMul = (a: number, b: number): number =>
    (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/** The generator polynomial for `degree` error-correction codewords. */
export function rsGenerator(degree: number): number[] {
    let poly = [1];
    for (let d = 0; d < degree; d++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let i = 0; i < poly.length; i++) {
            next[i] ^= gfMul(poly[i], EXP[d]);
            next[i + 1] ^= poly[i];
        }
        poly = next;
    }
    return poly;
}

/** The error-correction codewords for one block. */
export function rsEncode(data: number[], ecLen: number): number[] {
    const gen = rsGenerator(ecLen);
    const rem = new Array(ecLen).fill(0);
    for (const byte of data) {
        const factor = byte ^ rem[0];
        rem.shift();
        rem.push(0);
        if (factor !== 0) {
            for (let i = 0; i < ecLen; i++) { rem[i] ^= gfMul(gen[i + 1], factor); }
        }
    }
    return rem;
}
