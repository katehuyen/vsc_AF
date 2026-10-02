// X-456 — THE DASHBOARD ON A 360px PHONE, MEASURED. Each Farm Status row held a
// 140px name, its words squeezed into a strip beside it and a button pushed past
// the screen's edge; the agent comparison's controls ran off the right; eight
// figure tiles stood one per row. On a phone the tiles are two a row, a status row
// puts its words under its name, the comparison's controls wrap — and what opens
// an agent's page, starts a session, makes an agent, opens the guide, settings or
// a Farm Status door on the PC is not drawn. The usage card's engine tab switches
// on the phone only: the PC's status bar keeps its own choice.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const fx = require('./fixtures/dashboard_phone');
const PC_ONLY = ['data-detail="', 'data-start="', 'data-dnewagent="1"', 'data-status-kind="command"'];

// ---------- the same board, on the PC and on a phone ----------
{
    const pc = runPage(fx.script, fx.data(), require('./fixtures/dashboard').window);
    const phone = runPage(fx.script, fx.data(), fx.window);
    const pcHtml = pc.html(), phHtml = phone.html();
    ok('the PC still draws Detail, Start session, New Agent and the Farm Status doors', PC_ONLY.every(s => pcHtml.includes(s)));
    const left = PC_ONLY.filter(s => phHtml.includes(s));
    ok(`‼️ a phone draws none of them (${left.join(' ') || 'none'})`, left.length === 0);
    ok('a phone still has the ranges, the agents and the sessions table', /data-range="14"/.test(phHtml)
        && /class="card agent-card"/.test(phHtml) && /id="sessblock"/.test(phHtml));

    const card = (b) => b.query('.agent-card')[0];
    card(pc).click();
    ok('on the PC an agent card opens the agent\'s page', pc.posted.some(m => m.type === 'openAgent'));
    card(phone).click();
    ok('on a phone it asks the PC for nothing', !phone.posted.some(m => m.type === 'openAgent'));
}

// ---------- the usage card's engine tab ----------
{
    const pu = require('./fixtures/planusage');
    const pick = (b) => b.query('[data-puengine]').find(e => e.dataset.puengine === 'codex');
    const pc = runPage(pu.script, pu.data(), {});
    pick(pc).click();
    ok('on the PC an engine tab asks the host, which moves the status bar too', pc.posted.some(m => m.type === 'setUsageEngine' && m.id === 'codex'));
    const phone = runPage(pu.script, pu.data(), { __AFUI__: { remote: true } });
    pick(phone).click();
    ok('‼️ on a phone it switches the card and leaves the PC\'s status bar alone',
        !phone.posted.some(m => m.type === 'setUsageEngine') && /aria-selected="true" data-puengine="codex"/.test(phone.html()));
    phone.send({ type: 'data', data: pu.data() });
    ok('…and a refresh from the PC does not put it back', /aria-selected="true" data-puengine="codex"/.test(phone.html()));
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
    node([path.join('test', 'render_page.js'), 'dashboard_phone']);
    const probe = "(function(){var doc=document.documentElement,out={cw:doc.clientWidth,phone:doc.classList.contains('af-phone')};"
        + "var clip=function(e){for(var p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible'){return true;}}return false;};"
        + "out.sw=Math.max.apply(null,[0].concat([].slice.call(document.body.querySelectorAll('*')).filter(function(e){return e.getBoundingClientRect().width>0&&!clip(e);})"
        + ".map(function(e){return Math.round(e.getBoundingClientRect().right);})));"
        + "var k=[].slice.call(document.querySelectorAll('.kpis > .card'));out.kpis=k.length;"
        + "out.kpiRows=new Set(k.map(function(e){return Math.round(e.getBoundingClientRect().top);})).size;"
        + "var s=[].slice.call(document.querySelectorAll('.st-row'));out.st=s.length;"
        + "out.stUnder=s.every(function(r){var l=r.querySelector('.st-label'),d=r.querySelector('.st-detail');return l&&d&&d.getBoundingClientRect().top>=l.getBoundingClientRect().bottom-1;});"
        + "out.hidden=[].slice.call(document.querySelectorAll('[data-guide],[data-manage-projects],a[data-status-kind]')).every(function(e){return getComputedStyle(e).display==='none';});"
        + "return out;})()";
    const ph = json(node([path.join('test', 'measure_page.js'), 'dashboard_phone', probe, '--phone'])) || {};
    const say = JSON.stringify(ph);
    ok(`‼️ phone: the page is in phone mode and nothing pushes it sideways (${say})`, ph.phone === true && ph.sw <= ph.cw + 1);
    ok('phone: the figure tiles stand two a row', ph.kpis >= 6 && ph.kpiRows <= Math.ceil(ph.kpis / 2));
    ok('phone: every Farm Status row puts its words under its name', ph.st > 0 && ph.stUnder === true);
    ok('phone: the guide, settings and project links step aside', ph.hidden === true);
}

console.log(`\ntest_dashboard_phone_layout: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
