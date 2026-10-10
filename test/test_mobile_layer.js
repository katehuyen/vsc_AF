// U-176 — THE PHONE LAYER (media/afMobile.js), measured on the laid-out page in
// a real Chrome: on a phone the header's nav steps aside for a bottom tab bar,
// Menu holds every other page, a tab says where to go, a long press reads an
// AFTip whole; under a mouse nothing of it appears, however narrow the column.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { headlessFlags, sweepAndReport } = require('./headless_chrome');
const { withPhoneLayer, windowSize, PHONE } = require('./phone_frame');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- a row's long-press menu: the real catalogue's page actions, judged against the row (no browser needed)
{
    const vm = require('vm');
    const { ctxPageActions } = require(path.join(__dirname, '..', 'out', 'core', 'ctxmenu.js'));
    const acts = ctxPageActions();
    const sb = { window: { __AFUI__: { ctxMenu: acts } }, document: {}, JSON, RegExp, String, Object, Number, setTimeout, clearTimeout };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'media', 'afMobile.js'), 'utf8'), sb);
    const M = sb.window.AFMobile;
    ok('the page actions are page actions only (a host command has its own phone verdict: test_ctx_phone.js)', acts.length > 0 && acts.every(a => a.act && a.title));
    const names = ctx => M.actionsFor(ctx).map(a => a.act);
    const clearable = names({ webviewSection: 'afNeedRow', afClearable: true, afAgentId: 'a-dev' });
    ok('a clearable Needs row offers Clear and Copy', clearable.includes('ndClear') && clearable.includes('ndCopy'));
    const held = names({ webviewSection: 'afNeedRow', afClearable: false });
    ok('…a row holding a waiting agent is not offered Clear', !held.includes('ndClear') && held.includes('ndCopy'));
    ok('a row of another page is offered none of it', !names({ webviewSection: 'afBacklogRow' }).includes('ndCopy'));
    ok('== and != compare the row\'s value', M.whenTrue("a == 'x' && b != 'y'", { a: 'x', b: 'z' }) && !M.whenTrue("a == 'x'", { a: 'y' }));
    ok('|| offers the item when either side holds', M.whenTrue("a == 'q' || b", { a: 'x', b: 1 }));
    ok('! negates', M.whenTrue('!gone', {}) && !M.whenTrue('!here', { here: true }));
    ok('what only the PC knows (a list, a setting) hides the item',
        !M.whenTrue("webviewSection == 'afSessionRow' && sessionId in agentfarm.chainSessions", { webviewSection: 'afSessionRow', sessionId: 's' }));
}

// ---- a dense table on a phone is cards: each cell says its column (the sessions table)
{
    const { runPage } = require('./lib_page_dom');
    const fx = require('./fixtures/sessions.js');
    const v = fx.variants()[0];
    const html = runPage(fx.script, v.data).html();
    ok('a session row\'s cells carry their column', /<td[^>]*data-col="title"/.test(html) && /<td[^>]*data-col="cost"/.test(html));
    ok('…a figure carries its column\'s name to wear on a card', /data-col="cost" data-label="Cost"/.test(html) && /data-col="when" data-label="When"/.test(html));
    ok('…the title and the agent need no label', !/data-col="title" data-label/.test(html) && !/data-col="agent" data-label/.test(html));
    ok('the table, its rows, its header and its turn rows are marked for cards',
        /<table class="sesstable" data-afcards>/.test(html) && /<tr data-afcardhead>/.test(html)
        && /class="click sessrow[^"]*" data-session="[^"]*" data-afcard\b/.test(html)
        && /<td class="selcell" data-first>/.test(html) && /data-col="title" data-lead/.test(html));
}

let bin;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) {
    console.log('test_mobile_layer: no Chrome here — skipped');
    process.exit(0);
}

const header = fs.readFileSync(path.join(__dirname, '..', 'media', 'afI18n.js'), 'utf8') + '\n'
    + fs.readFileSync(path.join(__dirname, '..', 'media', 'pageHeader.js'), 'utf8');
const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
    + '<div class="af-head"><div class="af-head-nav"><button>Dashboard</button></div></div>'
    + '<span class="af-tipw" id="tw"><b>row</b><span class="af-tip"><span class="af-tiph">developer · PERMISSION</span>'
    + '<span class="af-tipb">Bash: node test/run-all.js — tam paket</span></span></span>'
    + '<table data-afcards><tr data-afcardhead id="chead"><th>Title</th><th>Cost</th></tr>'
    + '<tr data-afcard id="card"><td data-lead>Oturum 3</td><td data-label="Cost">$1.50</td></tr></table>'
    + '<div id="row" data-vscode-context="' + JSON.stringify({ webviewSection: 'afNeedRow', afClearable: true, needTitle: 'developer is waiting' }).replace(/"/g, '&quot;') + '">a need</div>'
    + '<script>window.__AFUI__={ctxMenu:[{title:"Clear this row",act:"ndClear",when:"webviewSection =~ /^afNeed(Row|Session)$/ && afClearable",group:"2_edit@1"},'
    + '{title:"Copy the row",act:"ndCopy",when:"webviewSection =~ /^afNeed(Row|Session)$/",group:"5_copy@1"}]};'
    + 'window.__got=[];window.addEventListener("message",function(e){if(e.data&&e.data.type==="afctx"){window.__got.push(e.data);}});'
    + header.replace(/<\/script/gi, '<\\/script') + '</script>'
    + '</body></html>';

const MARK = 'AF-MOBILE';
function measure(html, expr, size) {
    const probe = '<script>window.addEventListener("load",function(){var out;'
        + 'try{out=JSON.stringify((' + expr + '));}catch(e){out=JSON.stringify("ERROR: "+e.message);}'
        + 'document.body.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";'
        + 'document.getElementById("' + MARK + '").textContent=out;});</script>';
    const file = path.join(os.tmpdir(), 'af-mobile-' + process.pid + '.html');
    fs.writeFileSync(file, html.replace(/<\/body>(?![\s\S]*<\/body>)/i, probe + '</body>'), 'utf8');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-mobile-'));
    try {
        const dom = execFileSync(bin, headlessFlags(profile).concat([windowSize(size), '--virtual-time-budget=3000',
            '--dump-dom', 'file:///' + file.replace(/\\/g, '/')]), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
        const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
        return m ? JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
    } finally {
        fs.rmSync(file, { force: true });
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
    }
}

try {
    // ---- on a phone (the page marked as the remote view marks it), in a 500px window
    const phone = measure(withPhoneLayer(PAGE, 'now'), `(function(){
        var sent=[]; window.acquireVsCodeApi=function(){return{postMessage:function(m){sent.push(m);}};};
        var tabs=[].slice.call(document.querySelectorAll('#af-tabbar [data-aftab]')).map(function(b){return b.dataset.aftab;});
        var on=document.querySelector('#af-tabbar .on');
        var r={phone:document.documentElement.classList.contains('af-phone'), tabs:tabs, on:on&&on.dataset.aftab,
            nav:getComputedStyle(document.querySelector('.af-head-nav')).display,
            pad:parseFloat(getComputedStyle(document.body).paddingBottom),
            card:getComputedStyle(document.getElementById('card')).display,
            chead:getComputedStyle(document.getElementById('chead')).display,
            label:getComputedStyle(document.querySelector('#card td[data-label]'),'::before').content};
        document.querySelector('[data-aftab="console"]').click();
        document.querySelector('[data-aftab="now"]').click();
        r.sent=sent.slice();
        document.querySelector('[data-aftab="menu"]').click();
        var items=[].slice.call(document.querySelectorAll('.af-sheet-go')).map(function(b){return b.dataset.afsheetgo;});
        r.menu=items;
        document.querySelector('[data-afsheetgo="notices"]').click();
        r.afterMenu={sheet:!!document.getElementById('af-sheet'), last:sent[sent.length-1]};
        r.tip=window.AFMobile.openTip(document.getElementById('tw'));
        var s=document.getElementById('af-sheet');
        r.tipText=s?s.textContent:'';
        s.querySelector('[data-afsheetx]').click();
        r.closed=!document.getElementById('af-sheet');
        r.rowMenu=window.AFMobile.openRow(document.getElementById('row'), null);
        var rs=document.getElementById('af-sheet');
        r.rowItems=[].slice.call(rs.querySelectorAll('[data-afrowact]')).map(function(b){return b.textContent;});
        r.rowTitle=rs.querySelector('.af-sheet-h').textContent;
        rs.querySelector('[data-afrowact]').click();
        r.got=window.__got;
        r.rowClosed=!document.getElementById('af-sheet');
        return r;})()`, { w: 500, h: 800 });
    ok('(the probe answered)', !!phone && typeof phone === 'object');
    ok('a phone-width page on a phone is in phone mode', phone.phone === true);
    ok('the tab bar is Now · Console · Sessions · Tasks · Menu', phone.tabs.join() === 'now,console,sessions,tasks,menu');
    ok('…with the page it is on marked', phone.on === 'now');
    ok('the header\'s nav cluster steps aside', phone.nav === 'none');
    ok('the page keeps room above the bar', phone.pad >= 56);
    ok('a dense table\'s row is a card on a phone, its header row gone', phone.card === 'flex' && phone.chead === 'none');
    ok('…and a figure wears its column\'s name', /Cost/.test(phone.label || ''));
    ok('a tab goes to its page; the one you are on does nothing',
        phone.sent.length === 1 && phone.sent[0].type === 'afnav' && phone.sent[0].to === 'console');
    ok('Menu lists the other pages, not the four tabs',
        phone.menu.includes('notices') && phone.menu.includes('projects') && !phone.menu.includes('console') && !phone.menu.includes('now'));
    ok('S-125 — …and the pages with no seat in the desktop\'s full header row (Chains)', phone.menu.includes('chains'));
    ok('a Menu entry goes there and the sheet closes',
        phone.afterMenu.sheet === false && phone.afterMenu.last.to === 'notices');
    ok('a long press reads the AFTip whole', phone.tip === true && /tam paket/.test(phone.tipText) && /PERMISSION/.test(phone.tipText));
    ok('✕ closes the sheet', phone.closed === true);
    ok('a long press on a row opens its menu, named by the row', phone.rowMenu === true && /developer is waiting/.test(phone.rowTitle));
    ok('…with the page actions its context allows', phone.rowItems.join('|') === 'Clear this row|Copy the row');
    ok('‼️ a pick is relayed to the page as the desktop menu relays it (afctx, act, the row\'s context)',
        phone.got.length === 1 && phone.got[0].act === 'ndClear' && phone.got[0].ctx.webviewSection === 'afNeedRow');
    ok('…and the sheet closes', phone.rowClosed === true);

    // ---- landscape phone: wider than the phone cut — the page's own layout, no bar
    const land = measure(withPhoneLayer(PAGE, 'now'), `({phone:document.documentElement.classList.contains('af-phone'), bar:!!document.getElementById('af-tabbar')})`, PHONE.landscape);
    ok('a phone on its side (800px) keeps the page\'s own nav', land.phone === false && land.bar === false);

    // ---- under a mouse: the same script, no phone mark, a narrow window
    const plain = PAGE.replace('</body>', '<script>' + fs.readFileSync(path.join(__dirname, '..', 'media', 'afMobile.js'), 'utf8') + '</script></body>');
    const desk = measure(plain, `({phone:document.documentElement.classList.contains('af-phone'), bar:!!document.getElementById('af-tabbar'), nav:getComputedStyle(document.querySelector('.af-head-nav')).display, card:getComputedStyle(document.getElementById('card')).display})`, { w: 500, h: 800 });
    ok('‼️ a VS Code tab under a mouse never gets the phone layer, however narrow', desk.phone === false && desk.bar === false && desk.nav !== 'none');
    ok('…and its table stays a table', desk.card === 'table-row');
} finally {
    sweepAndReport();
}

console.log(`test_mobile_layer: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
