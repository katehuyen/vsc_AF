// U-235 — a render is only a measurement of the product if it gets the variables VS Code
// really gives a webview. test/theme_vars.json is read off the installed VS Code
// (tools/theme_vars.js); this holds it to the pages: every variable media/ and src/ use is
// accounted for in every theme kind, no kind has anything unresolved, and the renderer
// draws with exactly that table and the body class VS Code puts on.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const T = require(path.join(__dirname, 'theme_vars.json'));
const KINDS = ['dark', 'light', 'hc-dark', 'hc-light'];

const used = new Set();
const walk = (dir, re) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p, re); } else if (re.test(e.name)) {
            for (const m of fs.readFileSync(p, 'utf8').matchAll(/var\(\s*--vscode-([\w-]+)/g)) { if (!/^(font-|editor-font-)/.test(m[1])) { used.add(m[1]); } }
        }
    }
};
walk(path.join(ROOT, 'media'), /\.(js|css)$/);
walk(path.join(ROOT, 'src'), /\.ts$/);

ok('the table names the VS Code it was read from and has the four theme kinds',
    /^\d+\.\d+\.\d+$/.test(T.vscode) && KINDS.every(k => T.themes[k] && T.none[k] && T.unresolved[k]));
for (const k of KINDS) {
    const missing = [...used].filter(v => !(v in T.themes[k]) && !T.none[k].includes(v) && !T.unresolved[k].includes(v));
    ok(`${k}: every variable the pages use is in the table (rerun tools/theme_vars.js when this fails)` + (missing.length ? ' — missing: ' + missing.join(' ') : ''), missing.length === 0);
}
ok('‼️ every kind resolves every variable — nothing in them is a guess' + KINDS.filter(k => T.unresolved[k].length).map(k => ' — ' + k + ': ' + T.unresolved[k].join(' ')).join(''),
    KINDS.every(k => T.unresolved[k].length === 0));
ok('…the high-contrast kinds\' method chains included (Color.fromHex(…).transparent(a), Color.white.transparent(a))',
    T.themes['hc-light']['list-hoverBackground'] === '#0f4a851a' && T.themes['hc-dark']['list-hoverBackground'] === '#ffffff1a');
ok('…and what VS Code itself leaves unset there is only that (no colour: the page\'s fallback applies)',
    ['dark', 'light'].every(k => T.none[k].every(v => ['contrastBorder', 'contrastActiveBorder', 'inputValidation-warningForeground'].includes(v))));
ok('the values are VS Code\'s own, theme by theme (registry defaults included)',
    T.themes.light['charts-green'] === '#388a34' && T.themes.dark['charts-green'] === '#89d185'
    && T.themes.light['editor-background'] === '#ffffff' && T.themes['hc-dark']['contrastBorder'] === '#6fc3df');

// ---- the renderer draws with it ----
const render = (flag, suffix) => {
    execFileSync(process.execPath, [path.join(__dirname, 'render_page.js'), 'now'].concat(flag ? [flag] : []), { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
    return fs.readFileSync(path.join(ROOT, 'dist', 'render', 'now' + suffix + '.html'), 'utf8');
};
const dark = render('', ''), light = render('--light', '.light'), hc = render('--hc', '.hc'), hcl = render('--hc-light', '.hclight');
ok('a light render carries the light table and the body class VS Code puts on',
    light.includes('--vscode-charts-green: #388a34;') && light.includes('--vscode-editor-background: #ffffff;') && /<body class="vscode-light" data-vscode-theme-kind="vscode-light">/.test(light));
ok('a dark render the dark ones', dark.includes('--vscode-charts-green: #89d185;') && /<body class="vscode-dark"/.test(dark));
ok('high contrast and high contrast light render too, each with its classes',
    /<body class="vscode-high-contrast" data-vscode-theme-kind="vscode-high-contrast">/.test(hc)
    && /<body class="vscode-high-contrast vscode-high-contrast-light" data-vscode-theme-kind="vscode-high-contrast-light">/.test(hcl));
ok('a colour VS Code sets none of is left out of the render, as VS Code leaves it', !/--vscode-contrastBorder:/.test(dark) && /--vscode-contrastBorder: #6fc3df;/.test(hc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
