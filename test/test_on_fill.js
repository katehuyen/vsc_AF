// A-29 — TEXT ON A HUE FILL IS READ IN EVERY THEME. A chip, a badge or a selected pill filled with a
// chart hue once wrote its text as a literal white: in a dark theme the hue is a light colour, and
// white on it read 1.8:1 on the green, 2.4:1 on the cyan. Such a text is now written
// color: var(--af-on-fill, #000) in the same rule as its fill: black where the hue is light, and the
// theme layer (media/theme.css) makes it white in a light theme, whose fill is the hue's ink.
//   · no page writes a literal white text colour — the one named exception sits on a scrim;
//   · every on-fill text is computed against its own fill, in the four theme kinds VS Code really
//     gives (test/theme_vars.json) and with no variable at all (the phone in the dark, where every
//     rule draws its own fallback), the rule's opacity included, and must read 4.5:1.
// No browser: the values are resolved from the sources — var() fallbacks, the layer's own
// declarations, color-mix() — so the dark theme, which no standing audit measures, is held too.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const walk = (dir, re, out = []) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (e.isDirectory()) { walk(dir + '/' + e.name, re, out); } else if (re.test(e.name)) { out.push(dir + '/' + e.name); }
    }
    return out;
};
const pages = fs.readdirSync(path.join(ROOT, 'media')).filter(f => /\.(js|css)$/.test(f)).map(f => 'media/' + f);

// ── 1. No literal white text ────────────────────────────────────────────────────────────────
const WHITE = /(^|[^-\w])color\s*[:=]\s*['"]?\s*(#fff(?:fff)?\b|white\b|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*1\s*)?\))/i;
/** A white that is right in every theme: its ground is the same in every theme. */
const ON_A_SCRIM = [{ file: 'media/selection.js', beside: 'rgba(0,0,0,0.45)', why: 'the tick over a picture, on a dark scrim or the selection blue' }];
const whites = [];
for (const f of pages.concat(walk('src', /\.ts$/))) {
    read(f).split('\n').forEach((line, i) => { if (WHITE.test(line)) { whites.push({ f, n: i + 1, line }); } });
}
const allowed = w => ON_A_SCRIM.some(x => x.file === w.f && w.line.includes(x.beside));
const stray = whites.filter(w => !allowed(w));
ok('‼️ no page writes a literal white text colour — text on a fill is var(--af-on-fill, #000)'
    + (stray.length ? ' — not: ' + stray.map(w => w.f + ':' + w.n).join(', ') : ''), stray.length === 0);
ok('every named exception is still there', ON_A_SCRIM.every(x => whites.some(w => w.f === x.file && w.line.includes(x.beside))));

// ── 2. The themes: VS Code's own values, and what the layer sets under each body class ──────
const tv = require('./theme_vars.json');
const BODY = new Function('return ' + (/const BODY_CLASS = (\{[^}]*\})/.exec(read('test/render_page.js')) || [])[1])();
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const layerRules = [...strip(read('media/theme.css')).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
const applies = (sel, classes) => sel.split(',').some(part => {
    const nots = [...part.matchAll(/:not\(\.([\w-]+)\)/g)].map(m => m[1]);
    const has = [...part.replace(/:not\([^)]*\)/g, '').matchAll(/\.([\w-]+)/g)].map(m => m[1]);
    return has.every(c => classes.includes(c)) && nots.every(c => !classes.includes(c));
});
const layerOf = classes => {
    const out = {};
    for (const r of layerRules.filter(x => applies(x.sel, classes))) {
        for (const d of r.body.split(';')) { const i = d.indexOf(':'); if (i > 0) { out[d.slice(0, i).trim()] = d.slice(i + 1).trim(); } }
    }
    return out;
};
const THEMES = Object.keys(tv.themes).map(k => ({ name: k, vars: tv.themes[k], none: tv.none[k] || [], layer: layerOf(String(BODY[k]).split(' ')) }));
THEMES.push({ name: 'no variables', vars: {}, none: null, layer: {} });
ok('the four theme kinds are read with the body classes the renderer gives them', THEMES.length === 5 && ['dark', 'light', 'hc-dark', 'hc-light'].every(k => typeof BODY[k] === 'string'));
const sets = k => Object.prototype.hasOwnProperty.call(THEMES.find(t => t.name === k).layer, '--af-on-fill');
ok('the layer turns the on-fill text white on a light ground, and only there', sets('light') && sets('hc-light') && !sets('dark') && !sets('hc-dark'));

// ── 3. A colour, resolved the way the browser would ─────────────────────────────────────────
const splitTop = s => {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '(') { depth++; } else if (ch === ')') { depth--; }
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else { cur += ch; }
    }
    out.push(cur.trim());
    return out;
};
const inside = (s, fn) => s.startsWith(fn + '(') && s.endsWith(')') ? s.slice(fn.length + 1, -1) : null;
/** null: a colour this cannot read — never a guess. Only opaque colours are mixed. */
function colour(expr, T) {
    const s = String(expr || '').trim();
    const v = inside(s, 'var');
    if (v !== null) {
        const parts = splitTop(v), name = parts[0], fb = parts.slice(1).join(', ');
        if (name.startsWith('--vscode-')) {
            const key = name.slice(9);
            if (T.vars[key] !== undefined) { return colour(T.vars[key], T); }
            return T.none && !T.none.includes(key) ? null : colour(fb, T);
        }
        return T.layer[name] !== undefined ? colour(T.layer[name], T) : colour(fb, T);
    }
    const mix = inside(s, 'color-mix');
    if (mix !== null) {
        const p = splitTop(mix);
        if (p.length !== 3 || p[0] !== 'in srgb') { return null; }
        const side = x => { const k = /^(.*\S)\s+([\d.]+)%$/.exec(x); return k ? { c: colour(k[1], T), p: Number(k[2]) / 100 } : { c: colour(x, T), p: null }; };
        const a = side(p[1]), b = side(p[2]);
        if (!a.c || !b.c || a.c.a !== 1 || b.c.a !== 1) { return null; }
        if (a.p === null && b.p === null) { a.p = b.p = .5; } else if (a.p === null) { a.p = 1 - b.p; } else if (b.p === null) { b.p = 1 - a.p; }
        const sum = a.p + b.p;
        return { r: (a.c.r * a.p + b.c.r * b.p) / sum, g: (a.c.g * a.p + b.c.g * b.p) / sum, b: (a.c.b * a.p + b.c.b * b.p) / sum, a: 1 };
    }
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m && [3, 4, 6, 8].includes(m[1].length)) {
        const h = m[1].length < 6 ? m[1].replace(/./g, c => c + c) : m[1];
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) { const n = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return n.length >= 3 && n.every(x => !isNaN(x)) ? { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 } : null; }
    return null;
}
const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** A rule's opacity: a plain number, or the dimmed-text form the layer scales. */
const opacityOf = (s, T) => {
    const dim = /^calc\(1 - (\.\d+) \* var\(--af-dimk, 1\)\)$/.exec(s);
    if (dim) { return 1 - Number(dim[1]) * Number(T.layer['--af-dimk'] === undefined ? 1 : T.layer['--af-dimk']); }
    return /^(\d*\.)?\d+$/.test(s) ? Number(s) : NaN;
};

// ── 4. Every on-fill text, with the fill it is declared beside ──────────────────────────────
const ON = ['--af-on-fill', '--af-on-charts-yellow'];
const decl = (body, prop) => { const m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(body); return m ? m[1].trim() : null; };
const uses = [];
for (const f of pages.filter(p => p !== 'media/theme.css')) {
    const rules = [...read(f).matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(m => ({
        sel: strip(m[1].split('*/').pop()).split(/[;>`]/).pop().trim().replace(/\s+/g, ' '), body: strip(m[2]).replace(/\s+/g, ' ') }));
    for (const r of rules) {
        const on = ON.find(n => r.body.includes('var(' + n));
        if (!on) { continue; }
        // the opacity it is drawn at: its own, or what the class it extends dims it to
        const classes = new Set(r.sel.match(/\.[\w-]+/g) || []);
        const base = rules.filter(x => x !== r && x.sel.split(',').some(p => classes.has(p.trim()))).map(x => decl(x.body, 'opacity')).filter(Boolean);
        const own = decl(r.body, 'opacity');
        uses.push({ f, sel: r.sel, on, color: decl(r.body, 'color'), fill: decl(r.body, 'background(?:-color)?'), opacity: own ? [own] : base });
    }
}
const found = s => uses.some(u => u.sel.split(',').some(p => p.trim() === s));
ok('the scan finds the chips of every page that draws them', ['.engbadge.b-ok', '.pokey.k-yes', '.acsel.on', '.pj-bl-kind.t-bug', '.pj-trk-kind.t-secu'].every(found));
const loose = uses.filter(u => u.color !== 'var(' + u.on + ', #000)' || !u.fill);
ok('‼️ every on-fill text is black in the dark and names its fill in the same rule'
    + (loose.length ? ' — not: ' + loose.map(u => u.f + ' ' + u.sel).join(' | ') : ''), uses.length > 0 && loose.length === 0);

const low = [], unread = [];
for (const T of THEMES) {
    for (const u of uses.filter(x => x.fill)) {
        const fg = colour(u.color, T), fill = colour(u.fill, T);
        const op = Math.min(1, ...u.opacity.map(o => opacityOf(o, T)));
        if (!fg || !fill || fill.a !== 1 || fg.a !== 1 || isNaN(op)) { unread.push(`${u.f} ${u.sel} (${T.name})`); continue; }
        const drawn = { r: fg.r * op + fill.r * (1 - op), g: fg.g * op + fill.g * (1 - op), b: fg.b * op + fill.b * (1 - op) };
        const k = ratio(drawn, fill);
        if (k < 4.5) { low.push(`${u.sel} ${k.toFixed(2)}:1 in ${T.name} (${u.f})`); }
    }
}
ok('‼️ every colour of every pair is read — none skipped unseen' + (unread.length ? ' — not: ' + unread.slice(0, 6).join(' | ') : ''), unread.length === 0);
ok('‼️ every on-fill text reads 4.5:1 on its fill in every theme kind' + (low.length ? ' — not: ' + low.join(' | ') : ''), low.length === 0);
if (process.argv.includes('--list')) { for (const u of uses) { console.log(`${u.f} ${u.sel} :: ${u.fill} / ${u.color} / ${u.opacity.join(' ') || 1}`); } }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
