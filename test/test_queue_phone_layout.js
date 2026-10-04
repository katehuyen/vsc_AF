// X-466 — THE WORK QUEUE ON A 360px PHONE, MEASURED. The lanes already fit a phone;
// what did not belong there were the doors to the PC: the source notice's link, the
// notice's report, an answer or report file's open-with button, a project's page and
// the terminal hand-off. On a phone the files are named with "open it on the PC", a
// link is copied instead of opened, and the right-click menu says where those open.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const pcFx = require('./fixtures/queue');
const phFx = require('./fixtures/queue_phone');
const scene = (fx, id) => {
    const v = phFx.variants().find(x => x.id === id);
    const p = runPage(fx.script, v.data, fx.window);
    if (v.act) { v.act(p); }
    return p;
};
const both = (id) => [scene(pcFx, id), scene(phFx, id)];

// ---------- the same items, opened, on the PC and on a phone ----------
{
    const [pcN, phN] = both('fromnotice');
    const [pcO, phO] = both('phone-open');
    const pcHtml = pcN.html() + pcO.html(), phHtml = phN.html() + phO.html();
    const PC_ONLY = ['class="q-openNotice"', 'data-act="srcreport"', 'data-doc="main"', 'data-act="handoff"', 'data-act="openproj"'];
    const missing = PC_ONLY.filter(s => !pcHtml.includes(s));
    ok(`the PC draws the source notice link, its report, the open-with buttons, the hand-off and a project's Open (${missing.join(' ') || 'all'})`, missing.length === 0);
    const left = PC_ONLY.filter(s => phHtml.includes(s));
    ok(`‼️ a phone draws none of them (${left.join(' ') || 'none'})`, left.length === 0);
    const named = (phHtml.match(/class="muted small q-pcfile"/g) || []).length;
    ok('a phone names the notice\'s report and the answer and report files, to open on the PC', named === 3 && /open it on the PC/.test(phHtml));
    ok('a phone still has the capture box, an edit, the answer box and the route pickers',
        /id="q-add-text"/.test(phHtml) && /class="q-edit/.test(phHtml) && /class="q-answer/.test(phHtml) && /q-routerow/.test(phHtml));

    // The right-click menu: what opens on the PC is refused on a phone with a toast.
    const toasts = (p) => {
        const said = [];
        const w = p.sandbox.window || p.sandbox;
        w.AFCtx.toast = (m) => said.push(String(m));
        return said;
    };
    const pcSaid = toasts(pcN), phSaid = toasts(phN);
    const ctx = { item: 'q7' };
    for (const [act, want] of [['qNotice', 'openNotice'], ['qFile:noticeReport', 'openFile'], ['qHand', 'handoff']]) {
        const before = pcN.posted.length, phBefore = phN.posted.length;
        pcN.send({ type: 'afctx', act, ctx });
        phN.send({ type: 'afctx', act, ctx });
        ok(`menu ${act}: the PC asks its host (${want})`, pcN.posted.slice(before).some(m => m.type === want));
        ok(`‼️ menu ${act}: a phone asks the PC for nothing and says it opens there`,
            phN.posted.length === phBefore && phSaid.length > 0 && /opens on the PC/.test(phSaid[phSaid.length - 1]));
    }
    ok('the PC never toasts for these', pcSaid.length === 0);
    const phBefore = phN.posted.length;
    phN.send({ type: 'afctx', act: 'qUrg:urgent', ctx });
    ok('a phone\'s menu still re-urges the item', phN.posted.slice(phBefore).some(m => m.type === 'setUrgency' && m.id === 'q7' && m.urgency === 'urgent'));
}

// ---------- a link and a project's mark ----------
{
    const withLink = (fx) => {
        const d = pcFx.data();
        d.items = d.items.map(n => n.id === 'q1' ? Object.assign({}, n, { text: n.text + ' https://example.com/x' }) : n);
        const p = runPage(fx.script, d, fx.window);
        p.query('[data-toggle="q1"]')[0].click();
        const copied = [];
        (p.sandbox.window || p.sandbox).AFCtx.copy = (v) => copied.push(v);
        return { p, copied };
    };
    const pc = withLink(pcFx), ph = withLink(phFx);
    pc.p.query('.q-link')[0].click();
    ph.p.query('.q-link')[0].click();
    ok('on the PC a link opens in the browser', pc.p.posted.some(m => m.type === 'openExternal' && m.url === 'https://example.com/x'));
    ok('‼️ on a phone it is copied, and the PC opens nothing', !ph.p.posted.some(m => m.type === 'openExternal') && ph.copied.join() === 'https://example.com/x');
    const mark = (b) => b.query('[data-openproj]')[0];
    ok('an item filed under a project carries its mark', !!mark(pc.p) && !!mark(ph.p));
    mark(pc.p).click();
    mark(ph.p).click();
    ok('on the PC the mark opens the project\'s page', pc.p.posted.some(m => m.type === 'openProject'));
    ok('on a phone it asks the PC for nothing', !ph.p.posted.some(m => m.type === 'openProject'));
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
    node([path.join('test', 'render_page.js'), 'queue_phone']);
    const probe = "(function(){var doc=document.documentElement,out={cw:doc.clientWidth,phone:doc.classList.contains('af-phone')};"
        + "var clip=function(e){for(var p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible'){return true;}}return false;};"
        + "out.sw=Math.max.apply(null,[0].concat([].slice.call(document.body.querySelectorAll('*')).filter(function(e){return e.getBoundingClientRect().width>0&&!clip(e);})"
        + ".map(function(e){return Math.round(e.getBoundingClientRect().right);})));"
        + "var q=function(s){return document.querySelectorAll(s).length;};"
        + "out.open={add:q('#q-add-text'),edit:q('.q-edit'),files:q('.q-pcfile'),cards:q('.q-card')};"
        + "return out;})()";
    const ph = json(node([path.join('test', 'measure_page.js'), 'queue_phone', probe, '--phone'])) || {};
    const say = JSON.stringify(ph);
    ok(`‼️ phone: the page is in phone mode and nothing pushes it sideways (${say})`, ph.phone === true && ph.sw <= ph.cw + 1);
    const o = ph.open || {};
    ok('phone: the measured scene really has the capture box, an edit and the named files open', o.add >= 1 && o.edit >= 1 && o.files >= 2 && o.cards >= 10);
}

console.log(`\ntest_queue_phone_layout: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
