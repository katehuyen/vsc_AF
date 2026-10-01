import {
    ALIGNMENT, blocks, dataCodewords, EC_BITS, QR_MAX_VERSION, QrEc, rsEncode, sizeOf, totalCodewords
} from './qrTables';

/**
 * U-85 — A QR CODE, DRAWN HERE RATHER THAN FETCHED. The phone cockpit needs a
 * code on screen that a camera can read; this extension ships **no runtime
 * dependencies** and a link carrying an access token must never be handed to
 * an online generator to be drawn. So: byte mode, versions 1-10, the whole
 * encoder in two files.
 *
 * ‼️ WHAT IS EASY TO GET WRONG HERE IS INVISIBLE. A symbol with the wrong mask,
 * a misplaced alignment pattern or a bad block interleave looks exactly like a
 * correct one on screen and scans as nothing. Two things guard it: the block
 * table is checked against the symbol's own geometry (`qrTables.ts`), and the
 * tests READ THE SYMBOL BACK — unmask, de-interleave, decode the byte segment
 * — so placement and masking are proved rather than eyeballed.
 */

export interface QrMatrix {
    version: number;
    ec: QrEc;
    mask: number;
    size: number;
    /** true = dark */
    modules: boolean[][];
}

const bytesOf = (text: string): number[] => Array.from(Buffer.from(text, 'utf8'));

/** The smallest version that holds these bytes at this level. */
export function versionFor(byteLen: number, ec: QrEc): number {
    for (let v = 1; v <= QR_MAX_VERSION; v++) {
        const countBits = v < 10 ? 8 : 16;
        if (4 + countBits + byteLen * 8 <= dataCodewords(v, ec) * 8) { return v; }
    }
    throw new Error(`qr: ${byteLen} bytes do not fit in version ${QR_MAX_VERSION} at level ${ec}`);
}

/** Mode indicator, length, payload, terminator, padding — one bit array. */
function bitstream(data: number[], version: number, ec: QrEc): number[] {
    const bits: number[] = [];
    const push = (value: number, len: number): void => {
        for (let i = len - 1; i >= 0; i--) { bits.push((value >> i) & 1); }
    };
    push(0b0100, 4);
    push(data.length, version < 10 ? 8 : 16);
    for (const b of data) { push(b, 8); }
    const capacity = dataCodewords(version, ec) * 8;
    for (let i = 0; i < 4 && bits.length < capacity; i++) { bits.push(0); }
    while (bits.length % 8 !== 0) { bits.push(0); }
    const pad = [0xec, 0x11];
    for (let i = 0; bits.length < capacity; i++) { push(pad[i % 2], 8); }
    return bits;
}

/** Split into blocks, add their error correction, interleave both. */
function codewords(bits: number[], version: number, ec: QrEc): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) { b = (b << 1) | bits[i + j]; }
        bytes.push(b);
    }
    const spec = blocks(version, ec);
    const groups: number[][] = [];
    let at = 0;
    for (const [count, size] of [spec.group1, spec.group2]) {
        for (let i = 0; i < count; i++) { groups.push(bytes.slice(at, at + size)); at += size; }
    }
    const ecs = groups.map(g => rsEncode(g, spec.ecPerBlock));
    const out: number[] = [];
    const longest = Math.max(...groups.map(g => g.length));
    for (let i = 0; i < longest; i++) {
        for (const g of groups) { if (i < g.length) { out.push(g[i]); } }
    }
    for (let i = 0; i < spec.ecPerBlock; i++) {
        for (const e of ecs) { out.push(e[i]); }
    }
    return out;
}

type Grid = (boolean | null)[][];

const placeFinder = (g: Grid, row: number, col: number): void => {
    for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
            const rr = row + r, cc = col + c;
            if (rr < 0 || cc < 0 || rr >= g.length || cc >= g.length) { continue; }
            const edge = r === 0 || r === 6 || c === 0 || c === 6;
            const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            g[rr][cc] = (r >= 0 && r <= 6 && c >= 0 && c <= 6) && (edge || core);
        }
    }
};

/** Everything that is not data: finders, timing, alignment, the dark module, the reserved strips. */
function functionPatterns(version: number): { grid: Grid; reserved: boolean[][] } {
    const size = sizeOf(version);
    const grid: Grid = Array.from({ length: size }, () => new Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const claim = (r: number, c: number, dark: boolean): void => {
        grid[r][c] = dark;
        reserved[r][c] = true;
    };

    placeFinder(grid, 0, 0);
    placeFinder(grid, 0, size - 7);
    placeFinder(grid, size - 7, 0);
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) { if (grid[r][c] !== null) { reserved[r][c] = true; } }
    }
    for (let i = 8; i < size - 8; i++) {
        claim(6, i, i % 2 === 0);
        claim(i, 6, i % 2 === 0);
    }
    const centres = ALIGNMENT[version] ?? [];
    for (const r of centres) {
        for (const c of centres) {
            if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) { continue; }
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    claim(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
                }
            }
        }
    }
    // the format strips (written later) and the one module that is always dark
    for (let i = 0; i < 9; i++) {
        if (grid[8][i] === null) { claim(8, i, false); }
        if (grid[i][8] === null) { claim(i, 8, false); }
    }
    for (let i = 0; i < 8; i++) {
        claim(8, size - 1 - i, false);
        claim(size - 1 - i, 8, false);
    }
    claim(size - 8, 8, true);
    if (version >= 7) {
        for (let i = 0; i < 18; i++) {
            const r = Math.floor(i / 3), c = i % 3;
            claim(size - 11 + c, r, false);
            claim(r, size - 11 + c, false);
        }
    }
    return { grid, reserved };
}

/** The zig-zag walk, skipping the vertical timing column. */
function placeData(grid: Grid, reserved: boolean[][], data: number[]): void {
    const size = grid.length;
    let bit = 0;
    const next = (): boolean => {
        const byte = data[bit >> 3];
        const value = byte === undefined ? false : ((byte >> (7 - (bit & 7))) & 1) === 1;
        bit++;
        return value;
    };
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
        if (right === 6) { right = 5; }
        for (let step = 0; step < size; step++) {
            const row = upward ? size - 1 - step : step;
            for (const col of [right, right - 1]) {
                if (reserved[row][col]) { continue; }
                grid[row][col] = next();
            }
        }
        upward = !upward;
    }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0,
    (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0
];

/** BCH(15,5) with the spec's generator and mask. */
export function formatBits(ec: QrEc, mask: number): number {
    const data = (EC_BITS[ec] << 3) | mask;
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) {
        if ((rem >> i) & 1) { rem ^= 0x537 << (i - 10); }
    }
    return ((data << 10) | rem) ^ 0x5412;
}

/** BCH(18,6) for version 7 and up. */
export function versionBits(version: number): number {
    let rem = version << 12;
    for (let i = 17; i >= 12; i--) {
        if ((rem >> i) & 1) { rem ^= 0x1f25 << (i - 12); }
    }
    return (version << 12) | rem;
}

/**
 * grid[row][col]. Bit 0 is the least significant: the first copy runs down column 8 (rows 0-5, 7, 8)
 * then left along row 8 (cols 7, 5-0); the second runs right-to-left along row 8 (bits 0-7) and down
 * column 8 (bits 8-14). Written as (x, y) in the spec's reference code — read as (row, col) it is the
 * mirror image, which looks right on screen and scans as nothing.
 */
function writeFormat(grid: Grid, ec: QrEc, mask: number): void {
    const size = grid.length;
    const bits = formatBits(ec, mask);
    const at = (i: number): boolean => ((bits >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) { grid[i][8] = at(i); }
    grid[7][8] = at(6);
    grid[8][8] = at(7);
    grid[8][7] = at(8);
    for (let i = 9; i <= 14; i++) { grid[8][14 - i] = at(i); }
    for (let i = 0; i <= 7; i++) { grid[8][size - 1 - i] = at(i); }
    for (let i = 8; i <= 14; i++) { grid[size - 15 + i][8] = at(i); }
    grid[size - 8][8] = true;
}

function writeVersion(grid: Grid, version: number): void {
    if (version < 7) { return; }
    const size = grid.length;
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
        const on = ((bits >> i) & 1) === 1;
        const r = Math.floor(i / 3), c = i % 3;
        grid[size - 11 + c][r] = on;
        grid[r][size - 11 + c] = on;
    }
}

/** The spec's four penalty rules — lower is better. */
export function penalty(m: boolean[][]): number {
    const n = m.length;
    let score = 0;
    const run = (get: (i: number, j: number) => boolean): void => {
        for (let i = 0; i < n; i++) {
            let last = get(i, 0), len = 1;
            for (let j = 1; j < n; j++) {
                const v = get(i, j);
                if (v === last) { len++; } else { if (len >= 5) { score += len - 2; } last = v; len = 1; }
            }
            if (len >= 5) { score += len - 2; }
        }
    };
    run((i, j) => m[i][j]);
    run((i, j) => m[j][i]);
    for (let r = 0; r + 1 < n; r++) {
        for (let c = 0; c + 1 < n; c++) {
            const v = m[r][c];
            if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) { score += 3; }
        }
    }
    const P = [true, false, true, true, true, false, true];
    const hit = (get: (k: number) => boolean, start: number, n2: number): boolean => {
        for (let k = 0; k < 7; k++) { if (get(start + k) !== P[k]) { return false; } }
        const before = start - 4 >= 0 && [1, 2, 3, 4].every(d => !get(start - d));
        const after = start + 10 < n2 && [7, 8, 9, 10].every(d => !get(start + d));
        return before || after;
    };
    for (let i = 0; i < n; i++) {
        for (let j = 0; j + 6 < n; j++) {
            if (hit(k => m[i][k], j, n)) { score += 40; }
            if (hit(k => m[k][i], j, n)) { score += 40; }
        }
    }
    const dark = m.reduce((a, row) => a + row.filter(Boolean).length, 0);
    score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return score;
}

export interface QrOptions {
    ec?: QrEc;
    /** force a mask (tests); otherwise the best-scoring one is chosen */
    mask?: number;
}

export function qrEncode(text: string, opts: QrOptions = {}): QrMatrix {
    const ec = opts.ec ?? 'M';
    const data = bytesOf(text);
    const version = versionFor(data.length, ec);
    const words = codewords(bitstream(data, version, ec), version, ec);
    const size = sizeOf(version);

    let best: { mask: number; modules: boolean[][] } | undefined;
    const masks = opts.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [opts.mask];
    for (const mask of masks) {
        const { grid, reserved } = functionPatterns(version);
        placeData(grid, reserved, words);
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (!reserved[r][c] && MASKS[mask](r, c)) { grid[r][c] = !grid[r][c]; }
            }
        }
        writeFormat(grid, ec, mask);
        writeVersion(grid, version);
        const modules = grid.map(row => row.map(v => v === true));
        if (!best || penalty(modules) < penalty(best.modules)) { best = { mask, modules }; }
    }
    const chosen = best as { mask: number; modules: boolean[][] };
    return { version, ec, mask: chosen.mask, size, modules: chosen.modules };
}

export interface QrSvgOptions {
    /** pixels per module */
    scale?: number;
    /** modules of quiet zone — the spec says 4, and a scanner needs them */
    quiet?: number;
    dark?: string;
    light?: string;
    title?: string;
}

/**
 * One `<path>` for every dark module: a webview can draw it at any size, and
 * it carries no script and no external reference.
 */
export function qrSvg(m: QrMatrix, o: QrSvgOptions = {}): string {
    const scale = o.scale ?? 4;
    const quiet = o.quiet ?? 4;
    const side = (m.size + quiet * 2) * scale;
    let d = '';
    for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
            if (m.modules[r][c]) { d += `M${(c + quiet) * scale} ${(r + quiet) * scale}h${scale}v${scale}h-${scale}z`; }
        }
    }
    const title = o.title ? `<title>${o.title.replace(/[<>&]/g, '')}</title>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" role="img">`
        + title
        + `<rect width="${side}" height="${side}" fill="${o.light ?? '#ffffff'}"/>`
        + `<path d="${d}" fill="${o.dark ?? '#000000'}"/></svg>`;
}
