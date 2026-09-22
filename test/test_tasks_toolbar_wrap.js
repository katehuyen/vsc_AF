/**
 * Guard: U-145 — THE TASKS TOOLBARS BREAK BETWEEN TWO BLOCKS, NEVER A BUTTON AT A TIME.
 *
 * The Runs and Plan toolbars were one `flex-wrap` row of a search box, four or
 * five filter pickers and five or six action buttons. A little narrower than
 * their natural width, the row pushed its LAST buttons to the next line one by
 * one — ⬇ MD alone under the table header, then Clear finished beside it —
 * while the search box and the pickers kept every pixel they had.
 *
 * Now the row is two blocks: filters (`.tbf`) and actions (`.tba`). The filter
 * block's basis is zero, so the row breaks on its min-content: with some room
 * missing the filters shrink and both blocks stay on one line; with too much
 * missing the actions move down as one unbroken block.
 *
 * Only a laid-out DOM can say any of this, so it is measured.
 *
 *   node test/test_tasks_toolbar_wrap.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

{
    const src = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    ok('both toolbars are split into a filter block and an action block',
        (src.match(/<div class="toolbar"><span class="tbf">/g) || []).length === 2
        && (src.match(/<\/span><span class="tba">/g) || []).length === 2);
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
    node([path.join('test', 'render_page.js'), 'tasks']);

    // One toolbar of each tab, its host narrowed to each width in turn. Tops
    // are compared, not heights: "on one line" is "at the same top".
    const probe = (sel) => "(function(){var q=document.querySelector('" + sel + "');"
        + "if(!q){return {miss:1};}var bar=q.closest('.toolbar');var host=bar.parentElement;"
        + "var f=bar.querySelector('.tbf'),a=bar.querySelector('.tba');var out=[];"
        + "var tops=function(el){return [].slice.call(el.children).filter(function(k){return k.getBoundingClientRect().width>0;})"
        + ".map(function(k){return Math.round(k.getBoundingClientRect().top+k.getBoundingClientRect().height/2);});};"
        + "var rows=function(t){return t.filter(function(v,i){return t.findIndex(function(x){return Math.abs(x-v)<6;})===i;}).length;};"
        + "[1700,1200,960].forEach(function(w){host.style.width=w+'px';bar.getBoundingClientRect();"
        + "out.push({at:w,sameLine:Math.abs(f.getBoundingClientRect().top-a.getBoundingClientRect().top)<6,"
        + "actionRows:rows(tops(a)),filterRows:rows(tops(f)),search:Math.round(q.getBoundingClientRect().width)});});"
        + "host.style.width='';return out;})()";

    for (const [tabName, sel] of [['Runs', '#runq'], ['Plan', '#planq']]) {
        const rows = json(node([path.join('test', 'measure_page.js'), 'tasks', probe(sel)])) || [];
        ok(`${tabName}: the toolbar answered at three widths`, Array.isArray(rows) && rows.length === 3);
        if (!Array.isArray(rows) || rows.length !== 3) { continue; }
        const at = (w) => rows.find(r => r.at === w) || {};
        const say = JSON.stringify(rows);
        ok(`${tabName}: with room, one line and the search at its widest (${say})`,
            at(1700).sameLine === true && at(1700).search >= at(1200).search);
        // ‼️ THE POINT: a row a little short gives ground in the filters and
        // keeps both blocks on one line, instead of dropping a button.
        ok(`‼️ ${tabName}: a little short, the FILTERS give ground and the blocks stay on one line (${at(1200).search}px search)`,
            at(1200).sameLine === true && at(1200).search < at(1700).search && at(1200).actionRows === 1);
        // ‼️ …and a lot short, the actions move down TOGETHER.
        ok(`‼️ ${tabName}: a lot short, the actions move down as ONE block — never a button at a time`,
            at(960).sameLine === false && at(960).actionRows === 1 && at(960).filterRows === 1);
    }

    // The narrowest window: the media query lets each block wrap inside itself
    // rather than push the page sideways.
    const over = "(function(){return [].slice.call(document.querySelectorAll('.toolbar')).slice(0,1)"
        + ".map(function(b){return {sw:b.scrollWidth,cw:b.clientWidth};});})()";
    const narrow = json(node([path.join('test', 'measure_page.js'), 'tasks', over, '--width', '600'])) || [];
    ok(`at a 600px window the toolbar does not overflow sideways (${JSON.stringify(narrow)})`,
        narrow.length === 1 && narrow[0].sw <= narrow[0].cw + 1);

    // As on the Console strip: `display` on a class selector outranks the
    // browser's [hidden] rule, so a menu can be drawn open with nobody's hand on it.
    const shut = "(function(){return [].slice.call(document.querySelectorAll('.toolbar [data-afms-menu][hidden]'))"
        + ".map(function(m){return {d:getComputedStyle(m).display,h:Math.round(m.getBoundingClientRect().height)};});})()";
    const menus = json(node([path.join('test', 'measure_page.js'), 'tasks', shut])) || [];
    ok(`‼️ a toolbar menu nobody pressed takes no space (${menus.length} shut)`,
        menus.length > 0 && menus.every(m => m.d === 'none' && m.h === 0));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
