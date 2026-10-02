// X-456 — THE NOTICE BOARD ON A 360px PHONE, MEASURED. The search, the three chips, six
// filter pickers, the sort and the reset wrapped into ten rows above the first notice,
// and a row was one unbreakable line cut off at the right. On a phone the filters and
// the board actions are one sideways-scrolled line each and a row's title takes its own
// line. What opens a report, an export dialog, a terminal, a browser or another PC page
// is not drawn there; a body link is copied to the phone instead. The desktop page is
// the same markup it was (the new .nt-acts wrapper is display:contents there).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const phoneFx = require('./fixtures/notices_phone');
const PC_ONLY = ['data-act="handoffNotice"', 'data-act="exportone"', 'data-hact="export"', 'data-doc="main"',
    'class="nt-openitem"', 'data-act="openproj"'];

{
    const src = fs.readFileSync(path.join(ROOT, 'media', 'notices.js'), 'utf8');
    ok('the actions wrapper adds nothing to the desktop layout', /\.nt-acts \{ display:contents; \}/.test(src));
    ok('on a phone a row\'s title may wrap', /html\.af-phone \.nt-title \{[^}]*white-space:normal;/.test(src));
}

// ---------- the same board, on the PC and on a phone ----------
{
    const pc = runPage(phoneFx.script, phoneFx.data(), {});
    const phone = runPage(phoneFx.script, phoneFx.data(), phoneFx.window);
    const pcHtml = pc.html(), phHtml = phone.html();
    ok('‼️ the PC still draws the hand-off, the exports, the report, the queue link and the project button',
        PC_ONLY.every(s => pcHtml.includes(s)));
    const left = PC_ONLY.filter(s => phHtml.includes(s));
    ok(`‼️ a phone draws none of them (${left.join(' ') || 'none'})`, left.length === 0);
    ok('a phone keeps Needs You, editing, queueing, read and dismiss',
        ['data-hact="needs"', 'data-act="edit"', 'data-act="convert"', 'data-act="read"', 'data-act="dismiss"']
            .every(s => phHtml.includes(s)));
    ok('a phone names the report and says where it opens', /2026-08-11_oturum-tablosu\.md<\/span>\s*<span class="muted small">· open it on the PC/.test(phHtml));
    ok('the queue item it spawned is still listed, as text', /<li>📥 Proje sayfasının oturum sekmesini de kontrol et<\/li>/.test(phHtml));

    const link = (b) => b.query('.nt-link').find(e => e.dataset.href === 'https://example.com/run/42');
    link(pc).click();
    ok('on the PC a body link opens the browser', pc.posted.some(m => m.type === 'openExternal' && m.url === 'https://example.com/run/42'));
    link(phone).click();
    ok('‼️ on a phone it is copied to the phone\'s clipboard and opens nothing on the PC',
        phone.posted.some(m => m.type === 'afClipboard' && m.text === 'https://example.com/run/42')
        && !phone.posted.some(m => m.type === 'openExternal'));

    const chip = (b) => b.query('[data-openproj]')[0];
    chip(pc).click();
    ok('on the PC the project mark opens the project', pc.posted.some(m => m.type === 'openProject'));
    chip(phone).click();
    ok('on a phone it asks the PC for nothing', !phone.posted.some(m => m.type === 'openProject'));
}

const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    const json = (raw) => { try { return JSON.parse(raw.slice(raw.search(/[[{]/))); } catch { return null; } };
    node([path.join('test', 'render_page.js'), 'notices_phone']);
    const probe = "(function(){var doc=document.documentElement,out={cw:doc.clientWidth,phone:doc.classList.contains('af-phone')};"
        + "var clip=function(e){for(var p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible'){return true;}}return false;};"
        + "out.sw=Math.max.apply(null,[0].concat([].slice.call(document.body.querySelectorAll('*')).filter(function(e){return e.getBoundingClientRect().width>0&&!clip(e);})"
        + ".map(function(e){return Math.round(e.getBoundingClientRect().right);})));"
        + "out.lines=[].slice.call(document.querySelectorAll('.nt-controls,.nt-acts')).map(function(e){return Math.round(e.getBoundingClientRect().height);});"
        + "var t=[].slice.call(document.querySelectorAll('.nt-title'));out.titles=t.length;"
        + "out.titleRight=Math.max.apply(null,[0].concat(t.map(function(e){return Math.round(e.getBoundingClientRect().right);})));"
        + "return out;})()";
    const ph = json(node([path.join('test', 'measure_page.js'), 'notices_phone', probe, '--phone'])) || {};
    const say = JSON.stringify(ph);
    ok(`‼️ phone: the page is in phone mode and nothing pushes it sideways (${say})`, ph.phone === true && ph.sw <= ph.cw + 1);
    ok('‼️ phone: the filters and the board actions are one line each', Array.isArray(ph.lines)
        && ph.lines.length >= 2 && ph.lines.every(h => h > 0 && h <= 48));
    ok('phone: every title stays inside the screen', ph.titles > 0 && ph.titleRight <= ph.cw);
}

console.log(`\ntest_notices_phone_layout: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
