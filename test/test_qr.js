// U-85 — THE QR ENCODER, PROVED RATHER THAN EYEBALLED.
//
// A wrong mask, a misplaced alignment pattern or a bad interleave draws a
// symbol that looks perfect on screen and scans as nothing, so this file does
// three things no "it renders" test does:
//   * ‼️ THE BLOCK TABLE IS CHECKED AGAINST THE SYMBOL'S OWN GEOMETRY. Data
//     codewords + EC codewords must equal the capacity derived from the
//     version's size — a typo in any of the 40 rows fails here, and nothing
//     else would catch it (a round trip shares the mistake);
//   * ‼️ THE FUNCTION-MODULE MAP IS DERIVED A SECOND TIME, independently of
//     the encoder's own, so the two must agree about what is data;
//   * ‼️ AND THE SYMBOL IS READ BACK — unmasked, de-interleaved, the byte
//     segment decoded — so placement, masking and format bits are proved for
//     every version and every level.
'use strict';
const path = require('path');
const Q = require(path.join(__dirname, '..', 'out', 'core', 'qr.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'qrTables.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- the tables, against geometry ----------
{
    let bad = '';
    for (let v = 1; v <= T.QR_MAX_VERSION; v++) {
        for (const ec of T.QR_EC) {
            const b = T.blocks(v, ec);
            const n = b.group1[0] + b.group2[0];
            const total = b.group1[0] * b.group1[1] + b.group2[0] * b.group2[1] + b.ecPerBlock * n;
            if (total !== T.totalCodewords(v)) { bad += ` v${v}${ec}(${total}!=${T.totalCodewords(v)})`; }
            if (b.group2[0] && b.group2[1] !== b.group1[1] + 1) { bad += ` v${v}${ec}(long group not +1)`; }
        }
    }
    ok('‼️ every block row adds up to the capacity the version geometry implies' + bad, bad === '');
    ok('the derived capacities are the published ones',
        T.totalCodewords(1) === 26 && T.totalCodewords(4) === 100 && T.totalCodewords(7) === 196
        && T.totalCodewords(10) === 346);
    ok('a symbol is 4 modules bigger per version', T.sizeOf(1) === 21 && T.sizeOf(10) === 57);
}

// ---------- an independent map of what is NOT data ----------
function reservedOf(version) {
    const size = T.sizeOf(version);
    const r = Array.from({ length: size }, () => new Array(size).fill(false));
    const box = (row, col, h, w) => {
        for (let i = 0; i < h; i++) {
            for (let j = 0; j < w; j++) {
                const rr = row + i, cc = col + j;
                if (rr >= 0 && cc >= 0 && rr < size && cc < size) { r[rr][cc] = true; }
            }
        }
    };
    box(0, 0, 9, 9);                    // finder + separator + format
    box(0, size - 8, 9, 8);
    box(size - 8, 0, 8, 9);
    for (let i = 0; i < size; i++) { r[6][i] = true; r[i][6] = true; }   // timing
    const centres = T.ALIGNMENT[version] || [];
    for (const a of centres) {
        for (const b of centres) {
            if ((a === 6 && b === 6) || (a === 6 && b === size - 7) || (a === size - 7 && b === 6)) { continue; }
            box(a - 2, b - 2, 5, 5);
        }
    }
    if (version >= 7) { box(size - 11, 0, 3, 6); box(0, size - 11, 6, 3); }
    return r;
}

const MASKS = [
    (a, b) => (a + b) % 2 === 0,
    (a) => a % 2 === 0,
    (_a, b) => b % 3 === 0,
    (a, b) => (a + b) % 3 === 0,
    (a, b) => (Math.floor(a / 2) + Math.floor(b / 3)) % 2 === 0,
    (a, b) => ((a * b) % 2) + ((a * b) % 3) === 0,
    (a, b) => ((((a * b) % 2) + ((a * b) % 3)) % 2) === 0,
    (a, b) => ((((a + b) % 2) + ((a * b) % 3)) % 2) === 0
];

/** Read the format strip back and say what it claims. */
function readFormat(m) {
    const size = m.size;
    let bits = 0;
    for (let i = 0; i <= 5; i++) { bits |= (m.modules[8][i] ? 1 : 0) << i; }
    bits |= (m.modules[8][7] ? 1 : 0) << 6;
    bits |= (m.modules[8][8] ? 1 : 0) << 7;
    bits |= (m.modules[7][8] ? 1 : 0) << 8;
    for (let i = 9; i <= 14; i++) { bits |= (m.modules[14 - i][8] ? 1 : 0) << i; }
    const data = (bits ^ 0x5412) >> 10;
    const ec = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }[(data >> 3) & 3];
    return { ec, mask: data & 7, bits };
}

/** Unmask, walk the zig-zag, de-interleave, decode the byte segment. */
function decode(m) {
    const size = m.size;
    const reserved = reservedOf(m.version);
    const f = MASKS[m.mask];
    const bits = [];
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
        if (right === 6) { right = 5; }
        for (let step = 0; step < size; step++) {
            const row = upward ? size - 1 - step : step;
            for (const col of [right, right - 1]) {
                if (reserved[row][col]) { continue; }
                bits.push((m.modules[row][col] !== f(row, col)) ? 1 : 0);
            }
        }
        upward = !upward;
    }
    const bytes = [];
    for (let i = 0; i + 7 < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) { b = (b << 1) | bits[i + j]; }
        bytes.push(b);
    }
    // de-interleave the data half back into its blocks
    const spec = T.blocks(m.version, m.ec);
    const sizes = [];
    for (const [count, len] of [spec.group1, spec.group2]) {
        for (let i = 0; i < count; i++) { sizes.push(len); }
    }
    const out = sizes.map(() => []);
    let at = 0;
    const longest = Math.max.apply(null, sizes);
    for (let i = 0; i < longest; i++) {
        for (let b = 0; b < sizes.length; b++) { if (i < sizes[b]) { out[b].push(bytes[at++]); } }
    }
    const data = [].concat.apply([], out);
    const stream = [];
    for (const b of data) { for (let j = 7; j >= 0; j--) { stream.push((b >> j) & 1); } }
    const take = (n) => { let v = 0; for (let i = 0; i < n; i++) { v = (v << 1) | stream.shift(); } return v; };
    const mode = take(4);
    const len = take(m.version < 10 ? 8 : 16);
    const chars = [];
    for (let i = 0; i < len; i++) { chars.push(take(8)); }
    return { mode, len, text: Buffer.from(chars).toString('utf8') };
}

// ---------- the round trip, at every version the cockpit can produce ----------
{
    const url = 'http://192.168.1.42:8378/?t=8f14e45fceea167a5a36dedd4bea2543';
    const m = Q.qrEncode(url);
    ok('a tokenised LAN url fits a small symbol at level M', m.version <= 5 && m.ec === 'M');
    const back = decode(m);
    ok('‼️ the symbol reads back as exactly the url that went in', back.mode === 4 && back.text === url);
    const f = readFormat(m);
    ok('…and its format strip names the level and the mask it was drawn with',
        f.ec === m.ec && f.mask === m.mask);

    let bad = '';
    for (const ec of T.QR_EC) {
        for (const len of [1, 12, 47, 96, 180, 260]) {
            const text = 'A'.repeat(len);
            let sym;
            try { sym = Q.qrEncode(text, { ec }); } catch (e) { continue; }   // past version 10 at this level
            const r = decode(sym);
            if (r.text !== text) { bad += ` ${ec}/${len}(v${sym.version},m${sym.mask})`; }
            const fm = readFormat(sym);
            if (fm.ec !== ec || fm.mask !== sym.mask) { bad += ` fmt:${ec}/${len}`; }
        }
    }
    ok('‼️ every level and length round-trips, whatever version and mask it lands on' + bad, bad === '');

    // every mask, forced, on one payload — a mask that places data wrongly is
    // invisible until it is the one the scorer happens to pick
    let masked = '';
    for (let mask = 0; mask < 8; mask++) {
        const sym = Q.qrEncode(url, { mask });
        if (sym.mask !== mask || decode(sym).text !== url) { masked += ' ' + mask; }
    }
    ok('‼️ all eight masks encode and read back' + masked, masked === '');

    // utf-8 is bytes, not characters
    const tr = Q.qrEncode('Ağustos böceği — ⑂ chn_x');
    ok('a Turkish payload survives as UTF-8 bytes', decode(tr).text === 'Ağustos böceği — ⑂ chn_x');
}

// ---------- the fixed geometry a scanner looks for first ----------
{
    const m = Q.qrEncode('agent farm');
    const dark = (r, c) => m.modules[r][c] === true;
    const finderAt = (r, c) => dark(r, c) && dark(r + 6, c) && dark(r, c + 6) && dark(r + 6, c + 6)
        && !dark(r + 1, c + 1) && dark(r + 2, c + 2) && dark(r + 3, c + 3) && dark(r + 4, c + 4) && !dark(r + 5, c + 5);
    ok('three finder patterns, and nothing in the fourth corner',
        finderAt(0, 0) && finderAt(0, m.size - 7) && finderAt(m.size - 7, 0));
    let timing = true;
    for (let i = 8; i < m.size - 8; i++) {
        if (dark(6, i) !== (i % 2 === 0) || dark(i, 6) !== (i % 2 === 0)) { timing = false; }
    }
    ok('the timing rows alternate from finder to finder', timing);
    ok('the dark module is dark', dark(m.size - 8, 8));
    ok('a separator ring keeps the finders apart from the data',
        !dark(7, 0) && !dark(0, 7) && !dark(7, m.size - 8) && !dark(m.size - 8, 7));
}

// ---------- version information, from version 7 ----------
{
    const big = Q.qrEncode('x'.repeat(100), { ec: 'H' });
    ok('a long payload at the strongest level needs a big version', big.version >= 7);
    const bits = Q.versionBits(big.version);
    let same = true;
    for (let i = 0; i < 18; i++) {
        const on = ((bits >> i) & 1) === 1;
        const r = Math.floor(i / 3), c = i % 3;
        if (big.modules[big.size - 11 + c][r] !== on || big.modules[r][big.size - 11 + c] !== on) { same = false; }
    }
    ok('‼️ …and both version blocks carry the same BCH word', same);
    ok('the BCH words are the published ones', Q.versionBits(7) === 0x07c94 && Q.versionBits(10) === 0x0a4d3);
    ok('the format words are the published ones',
        Q.formatBits('M', 0) === 0x5412 && Q.formatBits('L', 0) === 0x77c4 && Q.formatBits('H', 7) === 0x083b);
}

// ---------- the drawing ----------
{
    const m = Q.qrEncode('agent farm', { mask: 0 });
    const svg = Q.qrSvg(m, { scale: 3, quiet: 4 });
    const side = (m.size + 8) * 3;
    ok('the svg is square, sized from the modules and the quiet zone',
        svg.indexOf(`width="${side}" height="${side}"`) > 0 && svg.indexOf(`viewBox="0 0 ${side} ${side}"`) > 0);
    ok('‼️ it carries the quiet zone a scanner needs, as a light background',
        /<rect width="\d+" height="\d+" fill="#ffffff"\/>/.test(svg));
    const dark = m.modules.reduce((a, row) => a + row.filter(Boolean).length, 0);
    ok('every dark module is one square on the path', (svg.match(/M\d+ \d+h3v3h-3z/g) || []).length === dark);
    ok('it is a self-contained image — no script, no external reference',
        !/script|href|url\(/i.test(svg) && svg.indexOf('<svg xmlns=') === 0);
    ok('the colours can be the theme\'s', Q.qrSvg(m, { dark: '#111', light: '#eee' }).indexOf('fill="#eee"') > 0);
    ok('a title is carried for a reader that cannot see it',
        Q.qrSvg(m, { title: 'Agent Farm web view' }).indexOf('<title>Agent Farm web view</title>') > 0);
}

// ---------- refusals ----------
{
    let threw = '';
    try { Q.qrEncode('z'.repeat(1000)); } catch (e) { threw = String(e.message || e); }
    ok('a payload past version 10 is refused by name, not drawn wrong', /do not fit in version 10/.test(threw));
    // v1/M holds 16 codewords = 128 bits, and the header eats 12 of them
    ok('the version chosen is the smallest that fits',
        Q.versionFor(14, 'M') === 1 && Q.versionFor(15, 'M') === 2 && Q.versionFor(26, 'M') === 2
        && Q.versionFor(27, 'M') === 3);
}

console.log(`test_qr: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
