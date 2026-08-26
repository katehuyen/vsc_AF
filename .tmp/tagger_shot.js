// Throwaway: put the wiki tagger popover on a real page so it can be looked at.
// Writes dist/render/wikitag.html; shoot it with test/shoot_page.js wikitag.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'media', 'afWiki.js'), 'utf8');
const light = process.argv.indexOf('--light') >= 0;

const dark = {
    'editor-background': '#1f1f1f', 'foreground': '#cccccc',
    'editorWidget-background': '#252526', 'widget-border': '#454545',
    'badge-background': '#4d4d4d', 'badge-foreground': '#ffffff',
    'button-background': '#0078d4', 'button-foreground': '#ffffff',
    'focusBorder': '#0078d4', 'descriptionForeground': '#9d9d9d',
    'errorForeground': '#f48771', 'editorWarning-foreground': '#d19a66',
    'testing-iconPassed': '#89d185', 'font-family': 'Segoe UI, sans-serif',
    'editor-font-family': 'Consolas, monospace',
    'input-background': '#313131', 'input-foreground': '#cccccc', 'input-border': '#3c3c3c'
};
const lightT = Object.assign({}, dark, {
    'editor-background': '#ffffff', 'foreground': '#3b3b3b',
    'editorWidget-background': '#f8f8f8', 'widget-border': '#c8c8c8',
    'badge-background': '#cccccc', 'badge-foreground': '#3b3b3b',
    'descriptionForeground': '#616161', 'input-background': '#ffffff', 'input-border': '#cecece'
});
const t = light ? lightT : dark;
const root = ':root{' + Object.keys(t).map(k => `--vscode-${k}:${t[k]};`).join('') + '}';

const ASK = {
    type: 'wikiAsk', session: 'S1', ok: true, from: 3, to: 3, exact: true,
    turnCount: 14, label: 'the caret jumps to the front on every keystroke',
    topics: [
        { topic: 'Agent Farm', pending: 3, total: 19 }, { topic: 'Wiki', pending: 1, total: 4 },
        { topic: 'Ayarlar', pending: 0, total: 2 }, { topic: 'Kota', pending: 2, total: 6 },
        { topic: 'JSONC', pending: 1, total: 1 }
    ],
    marks: []
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${root}
${css}
body{margin:0;padding:0;background:var(--vscode-editor-background);
 color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:13px;height:820px;}
.row{padding:10px 16px;border-bottom:1px solid var(--vscode-widget-border);}
</style></head><body>
<div class="row" style="display:flex;gap:6px;align-items:center">
  <button class="afwiki wide secondary">&#128278; Wiki</button>
  <button class="afwiki wide secondary on">&#128278; Wiki</button>
  <button id="resume">&#9205; Resume</button>
  <button class="secondary">&#9998; Rename</button>
  <button class="secondary">&#8681; Export MD</button>
</div>
<div class="row"><span id="anchor">turn 3 — the caret jumps to the front</span></div>
<script>${js}</script>
<script>
  window.AFWiki.init(function(){});
  window.AFWiki.open({ el: document.getElementById('anchor'), session: 'S1', turn: 3 });
  window.AFWiki.receive(${JSON.stringify(ASK)});
  ${process.argv.indexOf('--range') >= 0 ? `
  var seg = document.querySelector('[data-afw-scope="range"]');
  if (seg) { seg.click(); }` : ''}
</script>
</body></html>`;

const out = path.join(ROOT, 'dist', 'render', 'wikitag' + (light ? '.light' : '') + '.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');
console.log(out);
