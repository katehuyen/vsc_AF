// af-test-budget: 300
// U-220 — THE GROUND A PAGE PAINTS ON IS THE THEME LAYER'S, NEVER THE EDITOR'S BACKGROUND ITSELF.
// A colour customised by hand (workbench.colorCustomizations, unscoped) holds under every theme, so a
// dark editor.background kept from a dark theme is what a LIGHT theme hands a webview, beside its own
// dark text. The light theme was once declared done on a table of the themes as shipped; this holds it
// on the scenario a user really runs (test/theme_vars.json `under`):
//   · every variable a scenario changes is derived by the layer into an --af-* variable, and no page
//     uses that variable any other way — found by scanning, so the next use is caught by name;
//   · the rule as shipped, measured in Chrome: a ground too dark for a light kind's text comes out
//     white, a light one is left alone, none at all is white, and a dark kind is never touched;
//   · a page drawn under the scenario draws the very colours it draws in the plain light kind.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const T = require('./theme_vars.json');
const layer = read('media/theme.css');
const sheet = layer.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].split(',').map(s => s.trim()), decls: m[2].split(';').map(d => d.trim()).filter(Boolean) }));

// ---- what the scenarios change, and who may read it ----
const scenarios = Object.entries(T.under || {});
const changed = [...new Set(scenarios.flatMap(([, s]) => Object.values(s.themes).flatMap(Object.keys)))];
ok('the table carries what a colour customised by hand changes — the editor\'s background among it', changed.includes('editor-background'));

const pages = fs.readdirSync(path.join(ROOT, 'media')).filter(f => /\.(js|css)$/.test(f) && f !== 'theme.css').map(f => 'media/' + f);
(function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = dir + '/' + e.name;
        if (e.isDirectory()) { walk(p); } else if (/\.ts$/.test(e.name)) { pages.push(p); }
    }
})('src');
// the body class a rule must name for a theme kind to get it
const KEYED = { light: /^body\.vscode-light$/, 'hc-light': /^body\.vscode-high-contrast(-light)?$/, 'hc-dark': /^body\.vscode-high-contrast$/ };
for (const v of changed) {
    const use = new RegExp('var\\(\\s*--vscode-' + v + '(?![\\w-])', 'g');
    const deriving = rules.filter(r => r.decls.some(d => new RegExp(use.source).test(d)));
    const names = [...new Set(deriving.flatMap(r => r.decls.filter(d => new RegExp(use.source).test(d)).map(d => d.split(':')[0].trim())))];
    ok(`‼️ ${v}: the theme layer derives a variable of its own from it`, names.length > 0);
    const kinds = [...new Set(scenarios.filter(([, s]) => Object.values(s.themes).some(t => v in t)).flatMap(([, s]) => Object.keys(s.themes).filter(k => v in s.themes[k])))];
    const unkeyed = kinds.filter(k => !deriving.some(r => r.sel.some(s => KEYED[k] && KEYED[k].test(s))));
    ok(`…in every theme kind a scenario changes it under (${kinds.join(', ')})` + (unkeyed.length ? ' — not: ' + unkeyed.join(', ') : ''), kinds.length > 0 && unkeyed.length === 0);
    const bare = [];
    let seen = 0;
    for (const f of pages) {
        const src = read(f);
        for (const m of src.matchAll(use)) {
            seen++;
            const through = /var\(\s*(--af-[\w-]+)\s*,\s*$/.exec(src.slice(Math.max(0, m.index - 60), m.index));
            if (!through || !names.includes(through[1])) { bare.push(f + ': ' + src.slice(Math.max(0, m.index - 30), m.index + 50).replace(/\s+/g, ' ')); }
        }
    }
    ok(`‼️ ${v}: no page reads it itself — every use is var(${names[0] || '--af-…'}, var(--vscode-${v} …)), dark's own value the fallback`
        + (bare.length ? ' — bare: ' + bare.join(' | ') : ''), seen > 0 && bare.length === 0);
}

// ---- the instrument: a render under a scenario is handed the scenario, or the rest measures the plain kind twice ----
const FLAG = { light: ['--light'], 'hc-light': ['--hc-light'], 'hc-dark': ['--hc'] }, SUFFIX = { light: '.light', 'hc-light': '.hclight', 'hc-dark': '.hc' };
const drawn = fs.mkdtempSync(path.join(os.tmpdir(), 'af-theme-under-'));
const draw = flags => {
    try {
        execFileSync(process.execPath, [path.join(__dirname, 'render_page.js'), 'now'].concat(flags), { cwd: ROOT, stdio: 'pipe', timeout: 120000, env: Object.assign({}, process.env, { AF_RENDER_OUT: drawn }) });
        return true;
    } catch { return false; }
};
for (const [id, sc] of scenarios) {
    for (const [kind, vars] of Object.entries(sc.themes)) {
        const file = path.join(drawn, 'now' + SUFFIX[kind] + '.' + id + '.html');
        const html = draw(FLAG[kind].concat(['--under', id])) && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        ok(`‼️ a ${kind} render under ${id} is handed the scenario's variables over the kind's own, in a file of its own`,
            Object.entries(vars).every(([v, val]) => html.includes(`--vscode-${v}: ${val};`) && !html.includes(`--vscode-${v}: ${T.themes[kind][v]};`))
            && html.includes(`--vscode-foreground: ${T.themes[kind].foreground};`));
    }
    ok(`a kind ${id} is not a scenario of is refused — never drawn as the plain kind under the scenario's name`, sc.themes.dark || !draw(['--under', id]));
}
ok('…and so is a scenario the table does not have', !draw(['--light', '--under', 'no-such-scenario']));
try { fs.rmSync(drawn, { recursive: true, force: true }); } catch { /* nothing to hold it */ }

// ---- measured ----
let bin = null;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) { console.log('test_theme_ground: no Chrome here — the measured half is skipped'); done(); }

const rgb = c => {
    let m = /^rgba?\(([^)]+)\)$/.exec(c || ''), k = 1;
    if (!m) { m = /^color\(srgb ([^)]+)\)$/.exec(c || ''); k = 255; }
    return m ? m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(n => Math.round(Number(n) * k)).join(',') : 'unread ' + c;
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
const LIGHT = 'vscode-light', HCL = 'vscode-high-contrast vscode-high-contrast-light', DARK = 'vscode-dark', HC = 'vscode-high-contrast';
const hand = scenarios.map(([, s]) => s.colours['editor.background']).filter(Boolean)[0];
// [body class, the editor background the page is handed, what it must paint with, why]
const CASES = [
    [LIGHT, hand, '255,255,255', 'the dark ground customised by hand is white'],
    [HCL, hand, '255,255,255', 'High Contrast Light under it too'],
    [LIGHT, '#1e1e1e', '255,255,255', 'any ground a light kind\'s text cannot be read on is white'],
    [LIGHT, '#808080', '255,255,255', 'a mid grey is below the line too'],
    [LIGHT, '', '255,255,255', 'handed no ground at all, a light kind paints white'],
    [LIGHT, '#ffffff', '255,255,255', 'Light Modern\'s own white stays'],
    [LIGHT, '#fdf6e3', hex('#fdf6e3'), 'a light theme\'s own tinted ground is left alone'],
    [LIGHT, '#c0c0c0', hex('#c0c0c0'), 'a light grey above the line is left alone — the factor is 0 or 1, never a blend'],
];
// a dark kind is never restyled: it paints with exactly what it is handed, whatever that is
const UNTOUCHED = [[DARK, T.themes.dark['editor-background']], [DARK, hand], [DARK, '#ffffff'], [HC, T.themes['hc-dark']['editor-background']]];
const all = CASES.map(c => [c[0], c[1]]).concat(UNTOUCHED);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-theme-ground-'));
let painted = [];
try {
    const page = path.join(tmp, 'ground.html');
    fs.writeFileSync(page, '<!doctype html><html><head><meta charset="utf-8"><style>' + layer
        + '\n#p { background: var(--af-ground, var(--vscode-editor-background)); }</style></head><body><div id="p">x</div><pre id="out"></pre><script>'
        + 'var C=' + JSON.stringify(all) + ',R=C.map(function(c){document.body.className=c[0];var s=document.documentElement.style;'
        + 'if(c[1]){s.setProperty("--vscode-editor-background",c[1]);}else{s.removeProperty("--vscode-editor-background");}'
        + 'return getComputedStyle(document.getElementById("p")).backgroundColor;});document.getElementById("out").textContent=JSON.stringify(R);</script></body></html>', 'utf8');
    const { headlessFlags } = require('./headless_chrome');
    const dom = execFileSync(bin, headlessFlags(path.join(tmp, 'profile')).concat(['--window-size=800,600', '--virtual-time-budget=3000', '--dump-dom',
        'file:///' + page.replace(/\\/g, '/')]), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
    painted = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : [];
} finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome still holds it */ } }
ok('the rule as shipped is measured in Chrome, case by case', painted.length === all.length);
CASES.forEach((c, i) => ok(`‼️ ${c[3]} (${c[1] || 'unset'} → ${rgb(painted[i])})`, rgb(painted[i]) === c[2]));
UNTOUCHED.forEach((c, i) => {
    const got = painted[CASES.length + i] || '';
    ok(`‼️ a dark kind paints with exactly what it is handed (${c[0]}, ${c[1]} → ${got})`, got === 'rgb(' + hex(c[1]).split(',').join(', ') + ')');
});

// ---- the pages themselves, drawn under each scenario ----
const { run } = require('./theme_audit');
const FIX = ['now', 'dashboard'];
const KINDS = ['light', 'hc-light'];
(async () => {
    const dark = await run('dark', FIX, bin, 2);
    ok('the dark theme\'s own ground is the dark theme\'s (' + FIX.map(p => dark[p].ground).join(' · ') + ')',
        FIX.every(p => dark[p].ground === 'rgb(' + hex(T.themes.dark['editor-background']).split(',').join(', ') + ')'));
    for (const [id, sc] of scenarios) {
        for (const kind of KINDS.filter(k => sc.themes[k])) {
            const plain = await run(kind, FIX, bin, 2), under = await run(kind, FIX, bin, 2, id);
            const broken = FIX.filter(p => plain[p].error || under[p].error);
            ok(`${kind} under ${id}: the pages render and are measured` + (broken.length ? ' — not: ' + broken.join(', ') : ''), broken.length === 0);
            if (broken.length) { continue; }
            ok(`‼️ ${kind} under ${id}: the body paints white, not the ground set by hand (${FIX.map(p => rgb(under[p].ground)).join(' · ')})`,
                FIX.every(p => rgb(under[p].ground) === '255,255,255'));
            ok(`…and plain ${kind} still paints the theme's own ground`, FIX.every(p => rgb(plain[p].ground) === hex(T.themes[kind]['editor-background'])));
            ok(`‼️ ${kind} under ${id}: every element draws the very colours it draws in plain ${kind}`
                + FIX.filter(p => plain[p].fingerprint !== under[p].fingerprint).map(p => ` — ${p} differs (${under[p].low} low against ${plain[p].low})`).join(''),
                FIX.every(p => plain[p].fingerprint === under[p].fingerprint && plain[p].low === under[p].low));
        }
    }
    done();
})();
