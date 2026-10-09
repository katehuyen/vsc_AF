/**
 * U-244 — A FILTER ROW GIVES GROUND BEFORE IT WRAPS (media/common.css .afms-fit).
 *
 * Notices, Queue, A2A Notes and A2A Tasks drew each filter picker at the width it reserves for the
 * widest text it can ever print (A-14), on a wrapping row: a narrower window sent pickers to a second
 * line while every box on the first stood half empty. Measured on the Notices fixture before the
 * repair: at a 952px row Projects, Accounts and the sort were on a line of their own.
 *
 * Each row is laid out at four widths and measured against itself with the class taken off (which is
 * the reserved width, exactly as before): with room nothing changes; crowded, every picker stays on
 * the first line and narrows, never below half of what it reserved; and a menu nobody opened is shut.
 *
 *   node test/test_filter_row_fit.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const PAGES = [
    { fixture: 'notices', row: '.nt-controls', tight: 952 },
    { fixture: 'queue', row: '.q-controls', tight: 760 },
    { fixture: 'a2anotes', row: '.a2a-controls', tight: 560 },
    { fixture: 'a2atasks', row: '.a2a-controls', tight: 500 }
];

{
    const src = { notices: 'notices.js', queue: 'queue.js', a2a: 'afA2A.js' };
    for (const [k, f] of Object.entries(src)) {
        ok(`${k}: its filter row carries afms-fit`, /class="(nt|q|a2a)-controls afms-fit"/.test(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8')));
    }
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
    const node = args => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const pg of PAGES) {
        node([path.join('test', 'render_page.js'), pg.fixture]);
        // The row's own width is set; the class is taken off once to read what each picker reserves.
        const expr = `(function(){var row=document.querySelector('${pg.row}');if(!row){return 'no row';}`
            + "var ps=[].slice.call(row.querySelectorAll(':scope > .afms'));if(!ps.length){return 'no pickers';}"
            + "var W=function(e){return Math.round(e.getBoundingClientRect().width);};"
            + "var F=function(){var b=row.firstElementChild.getBoundingClientRect().bottom;"
            + "return ps.every(function(p){return p.getBoundingClientRect().top<b;});};"
            + "row.style.flex='none';row.style.width='2400px';row.classList.remove('afms-fit');"
            + `var reserved=ps.map(W);row.style.width='${pg.tight}px';var before=F();`
            + "row.classList.add('afms-fit');var out={reserved:reserved,before:before,at:[]};"
            + `[2400,1352,${pg.tight},${Math.round(pg.tight * 0.7)}].forEach(function(w){row.style.width=w+'px';`
            + "out.at.push({w:w,widths:ps.map(W),first:F()});});"
            + "out.shut=[].slice.call(row.querySelectorAll('[data-afms-menu][hidden]')).every(function(m){return getComputedStyle(m).display==='none';});"
            + "return out;})()";
        let r = null;
        try { const raw = node([path.join('test', 'measure_page.js'), pg.fixture, expr]); r = JSON.parse(raw.slice(raw.indexOf('{'))); } catch { r = null; }
        ok(`${pg.fixture}: the filter row answered with pickers to measure`, !!(r && r.at && r.at.length === 4));
        if (!r || !r.at) { continue; }
        const at = w => r.at.find(a => a.w === w);
        const say = a => a.w + ':' + a.widths.join('/');
        ok(`‼️ ${pg.fixture}: with room every picker keeps exactly what it reserved (${r.reserved.join('/')} = ${say(at(2400))})`,
            at(2400).widths.every((v, i) => Math.abs(v - r.reserved[i]) <= 1));
        ok(`${pg.fixture}: a ${pg.tight}px row is one the reserved widths do not fit on one line`, r.before === false);
        ok(`‼️ ${pg.fixture}: at a ${pg.tight}px row every picker is still on the first line, and narrower (${say(at(pg.tight))})`,
            at(pg.tight).first && at(pg.tight).widths.some((v, i) => v < r.reserved[i] - 1));
        const all = r.at.flatMap(a => a.widths.map((v, i) => v - Math.floor(r.reserved[i] / 2)));
        ok(`${pg.fixture}: no picker ever below half of what it reserved, crowded or not (min margin ${Math.min(...all)}px)`,
            all.every(d => d >= -1) && r.at.every(a => a.widths.every((v, i) => v <= r.reserved[i] + 1)));
        ok(`${pg.fixture}: a menu nobody opened stays shut`, r.shut === true);
    }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
