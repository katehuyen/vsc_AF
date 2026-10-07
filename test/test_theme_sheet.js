// U-237 — THE THEME LAYER CANNOT TOUCH THE DARK THEME. media/theme.css holds the values that
// differ by VS Code theme kind: every rule in it is keyed on a body theme class other than dark
// and sets only --af-* variables; every use of such a variable names the dark value as its
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
const scoped = s => s.split(',').every(part => /^body\.vscode-(light|high-contrast|high-contrast-light)\b/.test(part.trim()) && !/vscode-dark/.test(part));
const bad = rules.filter(r => !scoped(r.sel));
ok('‼️ every rule is keyed on a body theme class, never the dark one' + (bad.length ? ' — not: ' + bad.map(r => r.sel).join(' | ') : ''), bad.length === 0);
const decls = rules.flatMap(r => r.body.split(';').map(d => d.trim()).filter(Boolean));
const notVar = decls.filter(d => !/^--af-[\w-]+\s*:/.test(d));
ok('‼️ …and sets only --af-* variables — it restyles no element itself' + (notVar.length ? ' — not: ' + notVar.join(' | ') : ''), notVar.length === 0);
const names = [...new Set(decls.map(d => d.split(':')[0].trim()))];

// Every use in the pages, with its fallback.
const media = fs.readdirSync(path.join(ROOT, 'media')).filter(f => /\.(js|css)$/.test(f) && f !== 'theme.css');
const uses = [];
for (const f of media) {
    const src = read('media/' + f);
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
