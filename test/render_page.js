/**
 * RENDER A PAGE TO A REAL HTML FILE, SO A VISUAL CHANGE CAN BE LOOKED AT.
 *
 * ‼️ WHY THIS EXISTS. Every colour, width and badge in `media/` has been changed
 * blind: the page script runs inside a webview, the tests read its markup as
 * strings, and nothing between writing a rule and shipping a VSIX ever DRAWS it.
 * That is how a tab strip ended up with one hue repeated across ten tabs and a
 * six-character badge in a 92px box — both of which pass every string assertion
 * in the repo.
 *
 * This runs the REAL page script through the same DOM shim the tests use
 * (`lib_page_dom.js`), wraps its markup in the same stylesheet the shell ships
 * (`media/common.css`) plus a stand-in for the editor's own theme variables, and
 * writes one self-contained HTML file. Open it in any browser — or drive it with
 * Playwright and take a picture.
 *
 *   node test/render_page.js track              → dist/render/track.html
 *   node test/render_page.js --list             → the fixtures there are
 *   node test/render_page.js track --light      → the light theme instead
 *
 * ‼️ IT IS A LOOKING GLASS, NOT A TEST. It asserts nothing and it is not wired
 * into `npm test`; a rendered page that looks right proves the CSS, never the
 * behaviour. The fixtures live in `test/fixtures/` and are shared with the real
 * page tests wherever the shapes match.
 */
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const OUT = path.join(ROOT, 'dist', 'render');

/**
 * The editor's own variables, as a webview receives them. Values are VS Code's
 * Dark Modern / Light Modern defaults — the point is not to match a theme
 * exactly but to give every `var(--vscode-…)` in the sheet something real to
 * resolve to, because a fallback-only render flatters a palette that would be
 * invisible on a user's actual screen.
 */
const THEMES = {
    dark: {
        'font-family': '"Segoe WPC", "Segoe UI", sans-serif',
        'editor-font-family': 'Consolas, "Courier New", monospace',
        foreground: '#cccccc',
        'editor-background': '#1f1f1f',
        'editorWidget-background': '#202020',
        'sideBar-background': '#181818',
        'panel-border': '#2b2b2b',
        'widget-border': '#313131',
        focusBorder: '#0078d4',
        descriptionForeground: '#9d9d9d',
        errorForeground: '#f14c4c',
        'editorError-foreground': '#f14c4c',
        'editorWarning-foreground': '#cca700',
        'list-hoverBackground': '#2a2d2e',
        'list-activeSelectionBackground': '#04395e',
        'list-activeSelectionForeground': '#ffffff',
        'button-background': '#0078d4',
        'button-foreground': '#ffffff',
        'button-hoverBackground': '#026ec1',
        'button-secondaryBackground': '#313131',
        'button-secondaryForeground': '#cccccc',
        'button-secondaryHoverBackground': '#3c3c3c',
        'badge-background': '#616161',
        'badge-foreground': '#f8f8f8',
        'input-background': '#313131',
        'input-foreground': '#cccccc',
        'input-border': '#3c3c3c',
        'inputValidation-errorBackground': '#5a1d1d',
        'inputValidation-warningBackground': '#352a05',
        'inputValidation-infoBackground': '#063b49',
        'textLink-foreground': '#4daafc',
        'textLink-activeForeground': '#4daafc',
        'textCodeBlock-background': '#2b2b2b',
        'toolbar-hoverBackground': '#313131',
        'menu-background': '#1f1f1f',
        'menu-foreground': '#cccccc',
        'menu-border': '#454545',
        'menu-selectionBackground': '#0078d4',
        'menu-selectionForeground': '#ffffff',
        'editor-findMatchHighlightBackground': '#9e6a03',
        'editor-selectionHighlightBackground': '#3a3d41',
        'charts-red': '#f14c4c',
        'charts-blue': '#3794ff',
        'charts-yellow': '#cca700',
        'charts-orange': '#d18616',
        'charts-green': '#89d185',
        'charts-purple': '#b180d7',
        'charts-foreground': '#cccccc',
        'charts-lines': '#808080'
    },
    light: {
        'font-family': '"Segoe WPC", "Segoe UI", sans-serif',
        'editor-font-family': 'Consolas, "Courier New", monospace',
        foreground: '#3b3b3b',
        'editor-background': '#ffffff',
        'editorWidget-background': '#f8f8f8',
        'sideBar-background': '#f8f8f8',
        'panel-border': '#e5e5e5',
        'widget-border': '#d4d4d4',
        focusBorder: '#005fb8',
        descriptionForeground: '#3b3b3b99',
        errorForeground: '#e51400',
        'editorError-foreground': '#e51400',
        'editorWarning-foreground': '#bf8803',
        'list-hoverBackground': '#f2f2f2',
        'list-activeSelectionBackground': '#e8e8e8',
        'list-activeSelectionForeground': '#000000',
        'button-background': '#005fb8',
        'button-foreground': '#ffffff',
        'button-hoverBackground': '#0258a8',
        'button-secondaryBackground': '#e5e5e5',
        'button-secondaryForeground': '#3b3b3b',
        'button-secondaryHoverBackground': '#cccccc',
        'badge-background': '#cccccc',
        'badge-foreground': '#3b3b3b',
        'input-background': '#ffffff',
        'input-foreground': '#3b3b3b',
        'input-border': '#cecece',
        'inputValidation-errorBackground': '#f2dede',
        'inputValidation-warningBackground': '#f6f5d2',
        'inputValidation-infoBackground': '#d6ecf2',
        'textLink-foreground': '#005fb8',
        'textLink-activeForeground': '#005fb8',
        'textCodeBlock-background': '#f3f3f3',
        'toolbar-hoverBackground': '#e5e5e5',
        'menu-background': '#ffffff',
        'menu-foreground': '#3b3b3b',
        'menu-border': '#cecece',
        'menu-selectionBackground': '#005fb8',
        'menu-selectionForeground': '#ffffff',
        'editor-findMatchHighlightBackground': '#a8ac94',
        'editor-selectionHighlightBackground': '#add6ff80',
        'charts-red': '#cd3131',
        'charts-blue': '#316bcd',
        'charts-yellow': '#bf8803',
        'charts-orange': '#d18616',
        'charts-green': '#388a34',
        'charts-purple': '#652d90',
        'charts-foreground': '#3b3b3b',
        'charts-lines': '#61616188'
    }
};

function themeCss(name) {
    const t = THEMES[name] || THEMES.dark;
    return ':root {\n' + Object.keys(t).map(k => `    --vscode-${k}: ${t[k]};`).join('\n') + '\n}';
}

function listFixtures() {
    if (!fs.existsSync(FIXTURES)) { return []; }
    return fs.readdirSync(FIXTURES).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''));
}

function main() {
    const args = process.argv.slice(2);
    if (!args.length || args.indexOf('--list') >= 0) {
        console.log('fixtures: ' + (listFixtures().join(' ') || '(none)'));
        console.log('usage: node test/render_page.js <fixture> [--light]');
        return;
    }
    const name = args[0];
    const theme = args.indexOf('--light') >= 0 ? 'light' : 'dark';
    const fixturePath = path.join(FIXTURES, name + '.js');
    if (!fs.existsSync(fixturePath)) {
        console.error(`no fixture "${name}" — have: ${listFixtures().join(' ')}`);
        process.exitCode = 1;
        return;
    }
    // A fixture says which page script it drives and what payload to drive it
    // with, so one renderer serves every page.
    const fixture = require(fixturePath);
    let variants = fixture.variants ? fixture.variants() : [{ id: name, data: fixture.data() }];
    // One variant at a time, because a picture of six of them is a picture in
    // which none of them can be read.
    const oIdx = args.indexOf('--only');
    if (oIdx >= 0) {
        const want = String(args[oIdx + 1] || '').split(',');
        variants = variants.filter(v => want.indexOf(v.id) >= 0);
        if (!variants.length) { console.error('no such variant'); process.exitCode = 1; return; }
    }

    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    const sections = variants.map(v => {
        const r = runPage(fixture.script, v.data, fixture.window || {});
        // A view that is reached by pressing something is reached by pressing
        // it here too — the shim binds the same handlers the webview does, so a
        // variant never has to reach into the page's private state.
        if (v.act) { v.act(r); }
        return `<h1 class="rndr-h">${v.label || v.id}</h1>\n<div class="rndr-page">${r.html()}</div>`;
    }).join('\n');

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${name} — ${theme}</title>
<style>
${themeCss(theme)}
${css}
/* the renderer's own frame — nothing here belongs to the extension */
body { margin: 0; padding: 0 0 60px;
    background: var(--vscode-editor-background); color: var(--vscode-foreground);
    font-family: var(--vscode-font-family); font-size: 13px; }
.rndr-h { position: sticky; top: 0; z-index: 50; margin: 0; padding: 6px 16px;
    font-size: 11px; font-weight: 400; letter-spacing: .08em; text-transform: uppercase;
    background: #7c3aed; color: #fff; }
.rndr-page { padding: 12px 16px 28px; }
</style></head>
<body>
${sections}
</body></html>`;

    fs.mkdirSync(OUT, { recursive: true });
    const out = path.join(OUT, `${name}${theme === 'light' ? '.light' : ''}.html`);
    fs.writeFileSync(out, html, 'utf8');
    console.log(out);
}

main();
