// U-237 — THE THEME LAYER CANNOT TOUCH THE DARK THEME. media/theme.css holds the values that
// differ by VS Code theme kind: every rule in it is keyed on a body theme class other than dark
// and sets only --af-* variables (the scrollbar track aside, test_theme_track.js); every use of such a variable names the dark value as its
// var() fallback. So dark is the fallback by construction. And every page shell that links
// common.css links the layer after it, and the renderer draws with it — or the light theme
// the audit measures (test_theme_audit.js) is not the one a user gets.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const sheet = read('media/theme.css').replace(/\/\*[\s\S]*?\*\//g, '');

const rules = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2].trim() }));
const rest = sheet.replace(/([^{}]+)\{([^{}]*)\}/g, '').trim();
ok('the theme layer is plain rules and nothing else' + (rest ? ' — stray: ' + rest.slice(0, 60) : ''), rules.length > 0 && !rest);
const scoped = s => s.split(',').every(part => /^(html:has\(> )?body\.vscode-(light|high-contrast|high-contrast-light)\b/.test(part.trim()) && !/vscode-dark/.test(part));
const bad = rules.filter(r => !scoped(r.sel));
ok('‼️ every rule is keyed on a body theme class, never the dark one' + (bad.length ? ' — not: ' + bad.map(r => r.sel).join(' | ') : ''), bad.length === 0);
const decls = rules.flatMap(r => r.body.split(';').map(d => d.trim()).filter(Boolean));
// U-248 — the one exception: VS Code's own sheet paints the scrollbar track on the root with the editor's
// background, where no variable of ours reaches, so a light kind restyles that one property itself.
const TRACK = /^scrollbar-color\s*:/;
const notVar = decls.filter(d => !/^--af-[\w-]+\s*:/.test(d) && !TRACK.test(d));
ok('‼️ …and sets only --af-* variables — it restyles no element itself, save the scrollbar track' + (notVar.length ? ' — not: ' + notVar.join(' | ') : ''), notVar.length === 0);
const lightOnly = s => s.split(',').every(part => /vscode-(light|high-contrast-light)\)?$/.test(part.trim()));
const trackRules = rules.filter(r => r.body.split(';').some(d => TRACK.test(d.trim())));
ok('‼️ …and the track is restyled only under a light kind, never under High Contrast\'s dark one' + (trackRules.some(r => !lightOnly(r.sel)) ? ' — not: ' + trackRules.filter(r => !lightOnly(r.sel)).map(r => r.sel).join(' | ') : ''), trackRules.length > 0 && trackRules.every(r => lightOnly(r.sel)));
const names = [...new Set(decls.filter(d => !TRACK.test(d)).map(d => d.split(':')[0].trim()))];

// Every use in the pages, with its fallback.
const media = fs.readdirSync(path.join(ROOT, 'media')).filter(f => /\.(js|css)$/.test(f) && f !== 'theme.css').map(f => 'media/' + f);
const srcTs = [];
(function walkTs(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = dir + '/' + e.name;
        if (e.isDirectory()) { walkTs(p); } else if (/\.ts$/.test(e.name)) { srcTs.push(p); }
    }
})('src');
const uses = [];
for (const f of media.concat(srcTs)) {
    const src = read(f);
    for (const m of src.matchAll(/var\(\s*(--af-[\w-]+)\s*(,\s*[^)]*)?\)/g)) {
        if (names.includes(m[1])) { uses.push({ f, name: m[1], fallback: (m[2] || '').replace(/^,\s*/, ''), at: src.slice(Math.max(0, m.index - 40), m.index + m[0].length + 2) }); }
    }
}
ok('every variable the layer sets is used by a page', names.every(n => uses.some(u => u.name === n)));
const bare = uses.filter(u => !u.fallback);
ok('‼️ every use names the dark value as its fallback' + (bare.length ? ' — bare: ' + bare.map(u => u.f).join(', ') : ''), bare.length === 0);
// --af-dimk: dimmed text is opacity: calc(1 - D * var(--af-dimk, 1)); at 1 that is the dark dimming exactly.
const dim = uses.filter(u => u.name === '--af-dimk');
const malformed = dim.filter(u => !/opacity\s*:\s*calc\(1 - \.\d+ \* var\(--af-dimk, 1\)\)/.test(u.at));
ok('every dimmed text is written calc(1 - D * var(--af-dimk, 1)), so dark keeps its own D' + (malformed.length ? ' — not: ' + malformed.map(u => u.f + ': ' + u.at.trim()).join(' | ') : ''), dim.length > 0 && malformed.length === 0);

// --af-ink-X: coloured text is var(--af-ink-X, var(--vscode-X …)) — dark falls back to the very
// variable the page used before, and light's ink is that same variable mixed darker. A hue the
// user picked by hand (OpenCode's badge) has no VS Code variable: its ink falls back to the
// literal, the same literal at every use, and the layer mixes that literal — never a VS Code
// colour's name with a literal behind it.
const vscodeNames = new Set(Object.values(require('./theme_vars.json').themes).flatMap(Object.keys));
const inks = names.filter(n => n.startsWith('--af-ink-'));
const closed = s => s + ')'.repeat(Math.max(0, (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length));
const literalOf = n => {
    const fbs = [...new Set(uses.filter(u => u.name === n).map(u => closed(u.fallback.trim())))];
    return fbs.length === 1 && /^(rgb\(|#[0-9a-f]{3,8}$)/i.test(fbs[0]) && !vscodeNames.has(n.slice(9)) ? fbs[0] : null;
};
const wrongFb = uses.filter(u => u.name.startsWith('--af-ink-') && !new RegExp('^var\\(--vscode-' + u.name.slice(9) + '(,|$)').test(u.fallback) && !literalOf(u.name));
ok('every ink falls back to the VS Code variable of its own name, or a hand-picked hue to its one literal' + (wrongFb.length ? ' — not: ' + wrongFb.map(u => u.f + ': ' + u.at.trim()).join(' | ') : ''), inks.length > 0 && wrongFb.length === 0);
const inkDecl = decls.filter(d => d.startsWith('--af-ink-'));
const strayInk = inkDecl.filter(d => { const n = d.split(':')[0].trim(); const lit = literalOf(n); return !d.includes(lit || 'var(--vscode-' + n.slice(9) + ')'); });
ok('…and the layer derives each ink from that same dark value' + (strayInk.length ? ' — not: ' + strayInk.join(' | ') : ''), inkDecl.length > 0 && strayInk.length === 0);

// Every page shell links it after common.css, inside the head (the quota style keeps its place
// right after common.css — test_quota_style.js; the layer only sets variables, so its order among
// the shared styles does not matter, only that it is there).
const shells = [];
const walk = dir => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = dir + '/' + e.name;
        if (e.isDirectory()) { walk(p); } else if (/\.ts$/.test(e.name) && /'media',\s*'common\.css'/.test(read(p))) { shells.push(p); }
    }
};
walk('src');
ok('the page shells are found (base.ts and the guide)', shells.includes('src/panels/base.ts') && shells.includes('src/panels/guide.ts'));
for (const s of shells) {
    const src = read(s);
    const v = /const (\w+) = \w+\.asWebviewUri\(vscode\.Uri\.joinPath\([^)]*'media',\s*'theme\.css'\)\)/.exec(src);
    const linked = v && new RegExp('<link rel="stylesheet" href="\\$\\{css\\}">(\\n[^\\n]*){0,2}\\n<link rel="stylesheet" href="\\$\\{' + v[1] + '\\}">[\\s\\S]*?</head>').test(src);
    ok(`‼️ ${s} links media/theme.css after common.css, in the head`, !!linked);
}
const render = read('test/render_page.js');
ok('the renderer draws with the layer, after the shared styles', /'media',\s*'theme\.css'/.test(render) && /\$\{css\}\n(\$\{quotaCss\}\n)?\$\{themeLayer\}/.test(render));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
