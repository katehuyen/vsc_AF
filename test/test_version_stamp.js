// U-147 — THE RUNNING BUILD, ON THE TWO PAGES THAT ASK FOR IT.
//
// The stamp is only worth anything if it is the version that is LOADED: a
// number typed into a page, or read from package.json on disk, says what was
// installed — and an installed VSIX is not the running code until the window
// reloads. So the host reads its own manifest once in activate, hands it to
// every page in window.__AFUI__, and the header draws it only where the page
// asked (Dashboard, Farm Settings) and only when the host said something.
// The layout half is measured: flush right on the title's own line.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- the header, driven ----------
{
    const sandbox = { window: {}, document: { querySelectorAll: () => [], addEventListener: () => { } } };
    sandbox.window.addEventListener = () => { };
    sandbox.window.window = sandbox.window;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('media/afI18n.js'), sandbox);
    vm.runInContext(read('media/pageHeader.js'), sandbox);
    const H = sandbox.window.AFHeader;
    const draw = (o, afui) => { sandbox.window.__AFUI__ = afui; return H.html(Object.assign({ page: 'dashboard', title: 'Agent Farm' }, o)); };

    const on = draw({ version: true }, { version: '3.640.0' });
    ok('asked for, and the host said a version: the stamp is drawn', /<span class="af-head-ver"[^>]*>v3\.640\.0<\/span>/.test(on));
    ok('…on the title\'s own line', /<div class="af-head-title"><h1>Agent Farm<\/h1><span class="af-head-ver"/.test(on));
    ok('…and the info block takes the whole first row, so it is the far corner', /class="af-head-info af-head-full"/.test(on));
    ok('…with the long form on hover', /title="Agent Farm 3\.640\.0 — the build running in this window"/.test(on));

    const notAsked = draw({}, { version: '3.640.0' });
    ok('a page that did not ask draws none, whatever the host says',
        !/af-head-ver"/.test(notAsked.replace(/<style>[\s\S]*?<\/style>/, '')) && !/af-head-full/.test(notAsked.replace(/<style>[\s\S]*?<\/style>/, '')));
    const silent = draw({ version: true }, {});
    ok('asked, but the host said nothing: no stamp, never a bare "v"',
        !/class="af-head-ver"/.test(silent) && !/class="af-head-title"/.test(silent));
    const hostile = draw({ version: true }, { version: '3.1<img src=x>' });
    ok('the value is a version, not markup', !/<img/.test(hostile) && /v3\.1imgsrcx/.test(hostile));
}

// ---------- the two pages, and only them ----------
{
    const media = fs.readdirSync(path.join(ROOT, 'media')).filter(f => f.endsWith('.js'));
    // U-225 — a media/afSetting*.js part is Farm Settings itself (the header is drawn by afSettingPage.js)
    const page = f => (/^afSetting\w*\.js$/.test(f) ? 'settings.js' : f);
    const asking = [...new Set(media.filter(f => /\n\s*version: true,/.test(read('media/' + f))).map(page))];
    ok(`exactly Dashboard and Farm Settings ask (got ${asking.join(', ')})`,
        asking.length === 2 && asking.includes('dashboard.js') && asking.includes('settings.js'));
}

// ---------- the host side: the manifest, once, into every page ----------
{
    const base = read('src/panels/base.ts');
    ok('the shell hands the running version to every page', /version: runningVersion,?\r?\n/.test(base));
    const ext = read('src/extension.ts');
    ok('activate reads it from the extension\'s own manifest, not from a constant',
        /setRunningVersion\(String\(\(context\.extension\?\.packageJSON as \{ version\?: string \} \| undefined\)\?\.version \?\? ''\)\);/.test(ext));
}

// ---------- measured: flush right, on the title line, at two widths ----------
const CHROME = [process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].some(p => p && fs.existsSync(p));
if (!CHROME) {
    console.log('  (no Chrome or Edge — the measured half is skipped)');
} else {
    const node = args => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    const EXPR = "(() => { const v = document.querySelector('.af-head-ver'); if (!v) { return null; } "
        + "const h = v.closest('.af-head-title').querySelector('h1').getBoundingClientRect(); "
        + "const a = v.closest('.af-head').getBoundingClientRect(); const r = v.getBoundingClientRect(); "
        + "return { gap: Math.round(a.right - r.right), onLine: r.top < h.bottom && r.bottom > h.top, clear: r.left > h.right }; })()";
    for (const fx of ['dashboard', 'jsonsettings']) {
        node([path.join('test', 'render_page.js'), fx]);
        for (const w of [1400, 700]) {
            let m = null;
            try { m = JSON.parse(node([path.join('test', 'measure_page.js'), fx, EXPR, '--width', String(w)])); } catch { m = null; }
            ok(`${fx}@${w}: the stamp is drawn`, !!m);
            ok(`${fx}@${w}: flush right against the header's own edge (gap ${m && m.gap}px)`, !!m && Math.abs(m.gap) <= 1);
            ok(`${fx}@${w}: on the title's line, clear of the title`, !!m && m.onLine && m.clear);
        }
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
