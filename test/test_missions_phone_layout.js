// X-466 — THE MISSIONS PAGE ON A 360px PHONE, MEASURED. The run list was a nine-column
// table and the open run's detail ran to 923px. On a phone the runs are cards, the
// detail is a full-width block whose inner tables scroll in place — and what can only
// happen on the PC (the folder picker, a run's Sessions page, an output file, an
// agent's page or Console, the guide) is not drawn, or says so when the menu asks.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const pcFx = require('./fixtures/missions');
const phFx = require('./fixtures/missions_phone');
const open = (fx) => {
    const p = runPage(fx.script, fx.data({}), fx.window);
    p.query('.mrow')[0].click();
    p.query('[data-step]')[0].click();
    return p;
};
const council = (fx) => {
    const v = fx.variants().find(x => x.id === 'run-adaptive');
    const p = runPage(fx.script, v.data, fx.window);
    v.act(p);
    return p.html();
};

// ---------- the same run, open on a step, on the PC and on a phone ----------
{
    const pc = open(pcFx), phone = open(phFx);
    const pcHtml = pc.html() + council(pcFx), phHtml = phone.html() + council(phFx);
    // The Sessions button; the output link in a step's open detail, on its row, and on a council turn.
    const PC_ONLY = ['id="d-sessions-run1"', 'Open the full archived output', 'this delegation wrote', 'this turn produced'];
    ok('the PC draws the run\'s Sessions button and every output-file link', PC_ONLY.every(s => pcHtml.includes(s)));
    const left = PC_ONLY.filter(s => phHtml.includes(s));
    ok(`‼️ a phone draws none of them (${left.join(' | ') || 'none'})`, left.length === 0 && !phHtml.includes('data-openfile='));
    ok('a phone still opens the run: its rounds and steps are there', /class="[^"]*rundetail/.test(phHtml) && phHtml.includes('wire the resume path'));
    ok('a phone keeps the session links (a transcript reaches the phone)', /data-opensession=/.test(phHtml));

    const form = (fx) => {
        const p = runPage(fx.script, fx.data({}), fx.window);
        p.query('#newmission')[0].click();
        return p.html();
    };
    const pcForm = form(pcFx), phForm = form(phFx);
    ok('the PC\'s new-mission form has the folder picker', pcForm.includes('id="f-browse"'));
    ok('‼️ a phone\'s form has no folder picker, and still has the goal box', !phForm.includes('id="f-browse"') && phForm.includes('id="f-goal"'));

    // The right-click menu: what opens on the PC is refused on a phone with a toast.
    const ctx = { run: 'run1', step: 's1', agentId: 'a1' };
    const toasts = (p) => {
        const said = [];
        const w = p.sandbox.window || p.sandbox;
        w.AFCtx.toast = (m) => said.push(String(m));
        return said;
    };
    const pcSaid = toasts(pc), phSaid = toasts(phone);
    for (const act of ['mstOut', 'mstAgent', 'mtOpen', 'mtTalk']) {
        const before = pc.posted.length, phBefore = phone.posted.length;
        pc.send({ type: 'afctx', act, ctx });
        phone.send({ type: 'afctx', act, ctx });
        const want = { mstOut: 'openFile', mstAgent: 'openAgent', mtOpen: 'openAgent', mtTalk: 'consoleAgent' }[act];
        ok(`menu ${act}: the PC asks its host (${want})`, pc.posted.slice(before).some(m => m.type === want));
        ok(`‼️ menu ${act}: a phone asks the PC for nothing and says it opens there`,
            phone.posted.length === phBefore && phSaid.length > 0 && /opens on the PC/.test(phSaid[phSaid.length - 1]));
    }
    ok('the PC never toasts for these', pcSaid.length === 0);
    const phBefore = phone.posted.length;
    phone.send({ type: 'afctx', act: 'msCtl:pause', ctx });
    ok('a phone\'s menu still controls the run', phone.posted.slice(phBefore).some(m => m.type === 'control' && m.action === 'pause' && m.runId === 'run1'));
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
    node([path.join('test', 'render_page.js'), 'missions_phone']);
    const probe = "(function(){var doc=document.documentElement,out={cw:doc.clientWidth,phone:doc.classList.contains('af-phone')};"
        + "var clip=function(e){for(var p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible'){return true;}}return false;};"
        + "out.sw=Math.max.apply(null,[0].concat([].slice.call(document.body.querySelectorAll('*')).filter(function(e){return e.getBoundingClientRect().width>0&&!clip(e);})"
        + ".map(function(e){return Math.round(e.getBoundingClientRect().right);})));"
        + "var r=[].slice.call(document.querySelectorAll('#mlist > tbody > tr.mrow'));out.rows=r.length;"
        + "out.cards=r.every(function(e){return getComputedStyle(e).display==='flex';});"
        + "var g=[].slice.call(document.querySelectorAll('[data-guide]'));out.guides=g.length;"
        + "out.hidden=g.every(function(e){return getComputedStyle(e).display==='none';});"
        + "return out;})()";
    const ph = json(node([path.join('test', 'measure_page.js'), 'missions_phone', probe, '--phone'])) || {};
    const say = JSON.stringify(ph);
    ok(`‼️ phone: the page is in phone mode and nothing pushes it sideways (${say})`, ph.phone === true && ph.sw <= ph.cw + 1);
    ok('phone: every run row is a card', ph.rows > 0 && ph.cards === true);
    ok('phone: the guide links step aside', ph.guides > 0 && ph.hidden === true);
}

console.log(`\ntest_missions_phone_layout: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
