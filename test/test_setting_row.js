// U-227 — one setting row: the name and its summary on the left, the control in a fixed column on the right,
// so every simple row of a section starts its control at one x; a wide editor under the name; the description
// panel on the name; no markdown mark in anything drawn. Measured on the settings fixtures that between them
// draw every kind of row — numbers, pick-one lists, paths, lists, forms, tables, multi-line text — on a desktop
// and on a phone. (Every description of the manifest is checked without a page: test/test_setting_text.js.)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ROWCSS = read('media/afSettingRowCss.js');
const ITEM = read('media/afSettingItem.js');

ok('the row is a grid: a flexible name column and a fixed control column', /grid-template-columns:minmax\(240px, 1fr\) \$\{CTL\}px/.test(ROWCSS));
ok('…which stacks under 700px', /@media \(max-width:700px\) \{\s*\.setitem\.srow \{ grid-template-columns:minmax\(0, 1fr\)/.test(ROWCSS));
ok('the page\'s style block takes it', /window\.AFSettingRowCss\.css\(\)/.test(read('media/afSettingPage.js')));
ok('the name opens the description panel, and the row\'s right-click hint stays off it',
    /window\.AFTip\.wrap\(`<span class="setname">/.test(ITEM) && /'setnamew', 'title=""'/.test(ITEM));
ok('a list, table, form, map or multi-line text is a wide row', /const isWide = it => !!it\.multiline \|\| it\.type === 'array' \|\| it\.type === 'object'/.test(ITEM));

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
    // Per section: the x each simple row's control column starts at. Per row: the narrowest name column, a
    // simple row whose control column is not under its name column on a phone, and any markdown mark left in
    // its text — the closed description panel included (a ``` fence the text tells the reader to type is content).
    const EXPR = `(()=>{const o={rows:0,wide:0,xs:{},minName:1e9,sideBySide:0,raw:[],over:document.documentElement.scrollWidth-innerWidth,
segs:document.querySelectorAll('.srow .setseg[role=radiogroup]').length,segOff:[...document.querySelectorAll('.srow .setseg')].filter(g=>g.querySelectorAll('input:checked').length!==1).length,
switches:document.querySelectorAll('.srow input[role=switch]').length,units:document.querySelectorAll('.srow .setnum .setunit').length,
bareBoxes:document.querySelectorAll('.srow .setctl > input[type=number], .srow .setctl > input[type=checkbox]:not([role=switch])').length};
document.querySelectorAll('h2.cat').forEach(h=>{let el=h.nextElementSibling;const xs=new Set();
while(el&&el.tagName!=='H2'){el.querySelectorAll('.setitem.srow:not(.wide) > .setr').forEach(r=>xs.add(Math.round(r.getBoundingClientRect().left)));el=el.nextElementSibling;}
o.xs[h.id]=[...xs];});
document.querySelectorAll('.setitem.srow').forEach(r=>{o.rows++;if(r.classList.contains('wide')){o.wide++;}
const l=r.querySelector(':scope > .setl'),c=r.querySelector(':scope > .setr');
if(l&&c&&!r.classList.contains('wide')){const a=l.getBoundingClientRect(),b=c.getBoundingClientRect();o.minName=Math.min(o.minName,Math.round(a.width));if(b.top<a.bottom-1){o.sideBySide++;}}
const tx=r.textContent.split('\\u0060\\u0060\\u0060').join('');if(/\\*\\*|#agentFarm\\.|\\u0060/.test(tx)){o.raw.push(r.dataset.item);}});
return o;})()`;
    const measure = (fixture, extra) => {
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), fixture, EXPR].concat(extra || []))); } catch { return null; }
    };
    const PAGES = ['disciplinesettings', 'sentrysettings', 'jsonsettings', 'kapicisettings', 'tgsettings'];
    PAGES.forEach(f => node([path.join('test', 'render_page.js'), f]));
    const all = PAGES.map(f => measure(f));
    for (const [i, f] of PAGES.entries()) {
        const d = all[i];
        ok(`${f}: drawn as rows` + (d ? ` (${d.rows}, ${d.wide} wide)` : ''), !!(d && d.rows > 0));
        const split = d ? Object.keys(d.xs).filter(k => d.xs[k].length > 1) : ['?'];
        ok(`‼️ ${f}: in every section the simple rows start their control at one x` + (split.length ? ': ' + split.map(k => k + ' ' + d.xs[k].join('/')).join(', ') : ''),
            !!d && split.length === 0);
        ok(`${f}: the control sits beside the name, and the name column keeps its 240px` + (d && d.minName < 1e9 ? ` (narrowest ${d.minName}px)` : ''),
            !!d && (d.rows === d.wide || d.minName >= 240) && d.sideBySide === d.rows - d.wide);
        ok(`‼️ ${f}: no markdown mark is left in anything a row draws` + (d && d.raw.length ? ': ' + d.raw.slice(0, 8).join(', ') : ''), !!d && d.raw.length === 0);
        ok(`${f}: every choice of two to four shows exactly one picked` + (d && d.segOff ? ` (${d.segOff} not)` : ''), !!d && d.segOff === 0);
        ok(`${f}: no bare number box or check box — a number has its unit wrapper, a yes/no is a switch`, !!d && d.bareBoxes === 0);
    }
    const sum = (a, k) => a.reduce((n, x) => n + (x ? x[k] : 0), 0);
    ok(`the fixtures draw the three standard controls (${sum(all, 'segs')} choices, ${sum(all, 'switches')} switches, ${sum(all, 'units')} units)`,
        sum(all, 'segs') > 0 && sum(all, 'switches') > 0 && sum(all, 'units') > 0);
    ok(`the fixtures between them draw simple and wide rows (${sum(all, 'rows')} rows, ${sum(all, 'wide')} wide)`,
        sum(all, 'wide') > 3 && sum(all, 'rows') - sum(all, 'wide') > 10);

    for (const f of ['disciplinesettings', 'sentrysettings']) {
        const p = measure(f, ['--phone']);
        ok(`${f} on a phone: the control goes under the name` + (p ? ` (${p.sideBySide} side by side)` : ''), !!p && p.rows > 0 && p.sideBySide === 0);
        ok(`…and no row pushes the page wider than the screen` + (p ? ` (${p.over}px over)` : ''), !!p && p.over <= 0);
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
