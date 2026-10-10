// U-248 — THE SCROLLBAR TRACK IS THE PAGE'S GROUND IN A LIGHT THEME. VS Code's own webview sheet paints the
// track on the root, html { scrollbar-color: <slider> var(--vscode-editor-background) }, and every inner
// scroller inherits it — so a dark editor.background set by hand stood as a dark bar beside a white page,
// out of reach of the layer's body-keyed ground. Measured, not reasoned: headless Chrome draws a real
// classic scrollbar once --hide-scrollbars is left out, and the track's pixels are read off the photograph.
//   · the instrument is sensitive: without the layer's track rules the track is the ground set by hand;
//   · a light kind's root track and inner track are its ground, the thumb drawn as in the plain kind;
//   · a dark kind's track is exactly what VS Code's sheet paints, whatever it is handed.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const T = require('./theme_vars.json');
const { headlessFlags } = require('./headless_chrome');

let bin = null;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) { console.log('test_theme_track: no Chrome here — skipped'); done(); }

// VS Code's default webview sheet as the installed VS Code (T.vscode) writes it (webview/browser/pre/index.html,
// _defaultStyles), prepended to the head before every page's own styles. With scrollbar-color set, Chrome
// ignores the ::-webkit-scrollbar rules beside it; they are kept so the page is handed what VS Code hands it.
const VSCODE_SHEET = 'html { scrollbar-color: var(--vscode-scrollbarSlider-background) var(--vscode-editor-background); }\n'
    + 'body { overscroll-behavior-x: none; background-color: transparent; color: var(--vscode-editor-foreground); }\n'
    + '::-webkit-scrollbar { width: 10px; height: 10px; }\n'
    + '::-webkit-scrollbar-corner { background-color: var(--vscode-editor-background); }\n'
    + '::-webkit-scrollbar-thumb { background-color: var(--vscode-scrollbarSlider-background); }';
const common = read('media/common.css');
const layer = read('media/theme.css');
const noTrack = layer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/scrollbar-color\s*:[^;}]*;?/g, '');
ok('the layer carries track rules the measurement can take away', noTrack.length < layer.replace(/\/\*[\s\S]*?\*\//g, '').length);
ok('the instrument leaves out a flag every other shot keeps', headlessFlags('p').includes('--hide-scrollbars'));

const hand = Object.values(T.under || {}).map(s => s.colours['editor.background']).filter(Boolean)[0] || '#2c2c25';
const LIGHT = 'vscode-light', HCL = 'vscode-high-contrast vscode-high-contrast-light', DARK = 'vscode-dark', HC = 'vscode-high-contrast';
// Light Modern's slider (#64646466); the same one in every case, so a thumb differs only by the track under it
const SLIDER = 'rgba(100, 100, 100, 0.4)';
// [name, body class, editor background handed, layer]
const CASES = [
    ['bare', LIGHT, hand, noTrack],
    ['light under the hand-set ground', LIGHT, hand, layer],
    ['plain light', LIGHT, T.themes.light['editor-background'], layer],
    ['hc-light under the hand-set ground', HCL, hand, layer],
    ['plain hc-light', HCL, T.themes['hc-light']['editor-background'], layer],
    ['a tinted light theme', LIGHT, '#fdf6e3', layer],
    ['plain dark', DARK, T.themes.dark['editor-background'], layer],
    ['dark under the hand-set ground', DARK, hand, layer],
    ['plain hc-dark', HC, T.themes['hc-dark']['editor-background'], layer],
];
const W = 300, H = 200, COLS = 3;
const at = i => ({ x: (i % COLS) * (W + 10), y: Math.floor(i / COLS) * (H + 10) });
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const frame = ([, cls, bg, sheet]) => {
    const lines = Array.from({ length: 30 }, (_, n) => `<div>line ${n}</div>`).join('');
    return '<!doctype html><html style="--vscode-editor-background:' + bg + ';--vscode-scrollbarSlider-background:' + SLIDER
        + ';--vscode-foreground:#3b3b3b;--vscode-editor-foreground:#3b3b3b"><head><style>' + VSCODE_SHEET + '</style><style>' + common
        + '</style><style>' + sheet + '</style></head><body class="' + cls + '"><div style="position:absolute;left:20px;top:20px;width:120px;'
        + 'height:150px;overflow-y:scroll;background:#eeeeee">' + lines + '</div><div style="height:3000px"></div></body></html>';
};
const page = '<!doctype html><html><head><style>html,body{margin:0;background:#808080}iframe{position:absolute;border:0;width:' + W + 'px;height:' + H + 'px}</style></head><body>'
    + CASES.map((c, i) => `<iframe style="left:${at(i).x}px;top:${at(i).y}px" srcdoc="${esc(frame(c))}"></iframe>`).join('') + '</body></html>';

function decode(buf) {
    const cs = [];
    for (let p = 8; p < buf.length;) { const len = buf.readUInt32BE(p); cs.push({ type: buf.toString('latin1', p + 4, p + 8), data: buf.subarray(p + 8, p + 8 + len) }); p += 12 + len; }
    const ih = cs.find(c => c.type === 'IHDR').data;
    const w = ih.readUInt32BE(0), h = ih.readUInt32BE(4), bpp = ih[9] === 6 ? 4 : 3, stride = w * bpp;
    const raw = zlib.inflateSync(Buffer.concat(cs.filter(c => c.type === 'IDAT').map(c => c.data)));
    const px = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
            let v = raw[src + x];
            if (f === 1) { v += a; } else if (f === 2) { v += b; } else if (f === 3) { v += (a + b) >> 1; } else if (f === 4) {
                const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[row + x] = v & 255;
        }
    }
    return (x, y) => { const i = (y * w + x) * bpp; return '#' + [px[i], px[i + 1], px[i + 2]].map(n => n.toString(16).padStart(2, '0')).join(''); };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-theme-track-'));
let px = null;
try {
    const file = path.join(tmp, 'track.html'), png = path.join(tmp, 'track.png');
    fs.writeFileSync(file, page, 'utf8');
    const rows = Math.ceil(CASES.length / COLS);
    try {
        execFileSync(bin, headlessFlags(path.join(tmp, 'profile')).filter(f => f !== '--hide-scrollbars').concat([`--window-size=${COLS * (W + 10)},${rows * (H + 10)}`,
            '--virtual-time-budget=4000', `--screenshot=${png}`, 'file:///' + file.replace(/\\/g, '/')]), { timeout: 120000, stdio: 'ignore' });
    } catch { /* Chrome may exit non-zero after writing the shot; the file decides */ }
    if (fs.existsSync(png)) { px = decode(fs.readFileSync(png)); }
} finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome still holds it */ } }
ok('the cases are photographed with their scrollbars drawn', !!px);
if (!px) { done(); }

// the root track low on the frame's right edge (the thumb sits at the top), the inner scroller's track low on
// its right edge, its thumb near the top (below the arrow), and the page's ground away from both
const read4 = i => { const { x, y } = at(i); return { page: px(x + 200, y + 185), root: px(x + W - 5, y + H - 25), inner: px(x + 135, y + 145), thumb: px(x + 135, y + 50) }; };
const got = CASES.map((c, i) => read4(i));
const by = name => got[CASES.findIndex(c => c[0] === name)];
const hexOf = h => h.toLowerCase();

const bare = by('bare');
ok(`the instrument sees the defect: without the track rules a light page (${bare.page}) has the hand-set track (${bare.root} · ${bare.inner})`,
    bare.page === '#ffffff' && bare.root === hexOf(hand) && bare.inner === hexOf(hand));
for (const [kind, plainName] of [['light under the hand-set ground', 'plain light'], ['hc-light under the hand-set ground', 'plain hc-light']]) {
    const g = by(kind), p = by(plainName);
    ok(`‼️ ${kind}: the root track is the page's ground (${g.root} on ${g.page})`, g.root === g.page && g.page === '#ffffff');
    ok(`‼️ ${kind}: an inner scroller's track is the ground too (${g.inner})`, g.inner === '#ffffff');
    ok(`${kind}: every pixel read is the plain kind's (${JSON.stringify(g)} vs ${JSON.stringify(p)})`, JSON.stringify(g) === JSON.stringify(p));
}
const tint = by('a tinted light theme');
ok(`a tinted light theme keeps its tint on both tracks, as VS Code paints them (${tint.root} · ${tint.inner})`, tint.root === '#fdf6e3' && tint.inner === '#fdf6e3' && tint.page === '#fdf6e3');
for (const name of ['plain dark', 'dark under the hand-set ground', 'plain hc-dark']) {
    const c = CASES.find(x => x[0] === name), g = by(name), want = hexOf(c[2]);
    ok(`‼️ ${name}: both tracks are exactly what VS Code's sheet paints (${want} → ${g.root} · ${g.inner})`, g.root === want && g.inner === want);
}
done();
