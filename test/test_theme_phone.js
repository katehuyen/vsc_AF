// U-238 — A PAGE ON THE PHONE FOLLOWS THE DEVICE'S THEME. VS Code gives a webview its theme's
// colours and a body class; a page the phone opens gets neither, so it was always dark. Now a
// light device puts vscode-light on the body (media/afRemote.js) and media/theme-phone.css gives
// the variables VS Code's own light values; dark defines nothing, so the phone's dark is the look
// it always had. The desktop never loads the phone sheet.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const table = JSON.parse(read('test/theme_vars.json'));
const sheet = read('media/theme-phone.css');

// ---- the sheet: VS Code's light values, generated, under the light class only ----
ok('‼️ the phone sheet is exactly what tools/theme_phone.js makes of test/theme_vars.json (rerun it when this fails)',
    sheet === require('../tools/theme_phone').phoneSheet(table).replace(/\r\n/g, '\n'));
const rules = [...sheet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
ok('it is one rule, keyed on the light body class — dark defines nothing', rules.length === 1 && rules[0][1].trim() === 'body.vscode-light');
const light = table.themes.light;
ok('every colour the pages use has its Light Modern value there',
    Object.keys(light).length > 40 && Object.keys(light).every(k => sheet.includes(`--vscode-${k}: ${light[k]};`)));
ok('tools/theme_vars.js rewrites it with the table', /require\('\.\/theme_phone'\)\.phoneSheet\(out\)/.test(read('tools/theme_vars.js')));

// ---- who links it: the phone's pages, never the desktop ----
const base = read('src/panels/base.ts'), guide = read('src/panels/guide.ts');
ok('‼️ a page shell links it only when the page is served to the phone',
    /const phoneCss = webview\.remote === true \? `[^`]*'theme-phone\.css'/.test(base) && /href="\$\{themeCss\}">\$\{phoneCss\}/.test(base));
ok('…and so does the guide', /const phoneCss = phone \? `[^`]*'theme-phone\.css'/.test(guide) && /href="\$\{themeCss\}">\$\{phoneCss\}/.test(guide));

// ---- the class: set from the device, live ----
function run(opts) {
    const cls = new Set(opts.has || []);
    const listeners = [];
    const mq = { matches: opts.light, addEventListener: (e, f) => { if (e === 'change') { listeners.push(f); } } };
    const win = { sessionStorage: { getItem: () => null, setItem: () => undefined }, matchMedia: q => (q === '(prefers-color-scheme: light)' ? mq : null) };
    if (opts.vscode) { win.acquireVsCodeApi = () => ({}); }
    win.window = win;
    const document = { body: { classList: { toggle: (c, on) => { if (on) { cls.add(c); } else { cls.delete(c); } }, contains: c => cls.has(c) } } };
    vm.runInNewContext(read('media/afRemote.js'), Object.assign(win, { document, location: { pathname: '/view/dashboard', search: '?view=a' } }));
    return { cls, flip: v => { mq.matches = v; listeners.forEach(f => f()); } };
}
const lit = run({ light: true });
ok('‼️ a light device: the body carries vscode-light', lit.cls.has('vscode-light'));
lit.flip(false);
ok('…the device turns dark: the class goes, live', !lit.cls.has('vscode-light'));
lit.flip(true);
ok('…and comes back when it turns light again', lit.cls.has('vscode-light'));
ok('a dark device: no class, the look the phone always had', !run({ light: false }).cls.has('vscode-light'));
const desk = run({ light: true, vscode: true, has: [] });
ok('inside VS Code the file does nothing — VS Code sets the class itself', desk.cls.size === 0);
let threw = false;
try { vm.runInNewContext(read('media/afRemote.js'), { window: {}, location: { pathname: '/', search: '' }, sessionStorage: { getItem: () => null, setItem: () => undefined } }); } catch { threw = true; }
ok('a shell without matchMedia or a body still loads the page', !threw);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
