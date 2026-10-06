// U-192 — a Sessions table column is never drawn narrower than the fact it holds (media/afColFit.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('media/afColFit.js');
const win = {};
vm.runInNewContext(SRC, { window: win });
const { fit } = win.AFColFit;

{
    const r = fit(['a', 'b'], { a: 1, b: 3 }, { a: 10, b: 10 }, 400);
    ok('shares that hold every floor are kept exactly, and nothing is marked as bound',
        r.w.a === 100 && r.w.b === 300 && r.bound === false);
    const s = fit(['title', 'cost'], { title: 3, cost: 1 }, { title: 50, cost: 60 }, 200);
    ok('a column under its floor gets the floor and the rest share what is left',
        s.w.cost === 60 && s.w.title === 140 && s.bound === true);
    const c = fit(['a', 'b', 'c'], { a: 1, b: 1, c: 8 }, { a: 30, b: 25, c: 0 }, 200);
    ok('a second column pushed under its floor by the first is caught too',
        c.w.a === 30 && c.w.b === 25 && Math.abs(c.w.c - 145) < 1e-9);
    const o = fit(['a', 'b'], { a: 1, b: 1 }, { a: 100, b: 100 }, 150);
    ok('floors wider than the box are all kept, so the table grows past it and scrolls',
        o.w.a === 100 && o.w.b === 100 && o.bound === true);
}

{
    const page = read('media/sessionsTable.js');
    const base = read('src/panels/base.ts');
    const shareKeys = Object.keys(eval('(' + /const SHARE = (\{[\s\S]*?\n    \});/.exec(page)[1] + ')'));
    const floorKeys = Object.keys(eval('(' + /const FLOOR_EM = (\{[\s\S]*?\n    \});/.exec(page)[1] + ')'));
    ok('every share column of the Sessions table declares its floor',
        shareKeys.length > 10 && shareKeys.every(k => floorKeys.indexOf(k) >= 0));
    ok('the table fits itself after every draw', /el\.innerHTML = sectionHtml\(\);\s*wire\(el\);\s*window\.AFColFit\.attach\(el,/.test(page));
    ok('every page is shipped the fitter, before the table that calls it',
        base.indexOf('src="${colFit}"') > 0 && base.indexOf('src="${colFit}"') < base.indexOf('src="${sessTable}"'));
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
    const dom = require('./lib_page_dom.js');
    const spec = (() => {
        const sb = dom.runPage('sessionsPage.js', { sessions: [] }).sandbox;
        const w = sb.window || sb;
        return w.AFSessionsTable ? { shares: w.AFSessionsTable.SHARE, floorsEm: w.AFSessionsTable.FLOOR_EM } : null;
    })();
    ok('the table hands out its shares and floors', !!(spec && spec.shares && spec.floorsEm));
    // The static render carries no live script, so the fitter is run here the way a page runs it. Every
    // painted piece of a cell that no clipping box inside the cell holds back must lie inside the cell.
    const EXPR = (on) => `(()=>{${SRC}
const SPEC=${JSON.stringify(spec)};const out={over:[],tables:0,scroll:0,moved:0};
document.querySelectorAll('table.sesstable').forEach(t=>{
  const row=t.querySelector('tr.sessrow');if(!row)return;out.tables++;
  const cols=[...row.children].map(td=>td.getAttribute('data-col')).filter(Boolean);
  if(${on})window.AFColFit.attach(t.parentElement.parentElement,{table:'table.sesstable',head:'tr[data-afcardhead]',cols,shares:SPEC.shares,floorsEm:SPEC.floorsEm});
  const w=t.parentElement;if(w.scrollWidth>w.clientWidth+1)out.scroll++;
  t.querySelectorAll(':scope>colgroup>col').forEach(c=>{if(c.dataset.afShare!==undefined&&c.style.width!==c.dataset.afShare)out.moved++;});
  [t.querySelector('tr[data-afcardhead]'),...t.querySelectorAll('tr.sessrow')].forEach(tr=>{[...tr.children].forEach((cell,i)=>{
    const b=cell.getBoundingClientRect();let worst=0;
    const tw=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
    for(let n=tw.nextNode();n;n=tw.nextNode()){
      if(!n.textContent.trim())continue;let clipped=false;
      for(let p=n.parentElement;p&&p!==cell;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible'){clipped=true;break;}}
      if(clipped)continue;const r=document.createRange();r.selectNodeContents(n);const q=r.getBoundingClientRect();
      worst=Math.max(worst,Math.round(q.right-b.right),Math.round(b.left-q.left));}
    if(worst>1)out.over.push((cols[i-3]||i)+(tr.hasAttribute('data-afcardhead')?' head':'')+' +'+worst);
  });});
});return out;})()`;
    node([path.join('test', 'render_page.js'), 'sessions']);
    const measure = (on, width) => {
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), 'sessions', EXPR(on), '--width', String(width)])); } catch { return null; }
    };
    const before = measure(false, 800);
    ok('the instrument sees the defect: without the fitter, figures overflow their columns at 800px'
        + (before ? ` (${before.over.length} cells)` : ''), !!(before && before.tables > 0 && before.over.length > 10));
    for (const width of [800, 1300]) {
        const m = measure(true, width);
        const uniq = m ? [...new Set(m.over.map(s => s.replace(/ \+\d+$/, '')))] : [];
        ok(`‼️ at ${width}px no header or figure of the Sessions table reaches past its column`
            + (uniq.length ? ' — ' + uniq.join(', ') : ''), !!(m && m.tables > 0 && m.over.length === 0));
        if (width === 800) { ok('…and at 800px the floors are wider than the box, so the table scrolls sideways', !!(m && m.scroll === m.tables)); }
    }
    // ‼️ S-131 — the Tokens floor is the widest figure the format can reach, put into a real cell:
    // it holds it, and it carries no leftover width (the "(off-plan)" word once widened it by 1.7em).
    const TOKX = `(()=>{const t=document.querySelector('table.sesstable');const td=[...t.querySelectorAll('td[data-col="tokens"]')].find(x=>x.querySelector('.wtok'));
if(!td)return null;const fs=parseFloat(getComputedStyle(t).fontSize),cs=getComputedStyle(td),sp=td.querySelector('.wtok');
const tw=document.createTreeWalker(td,NodeFilter.SHOW_TEXT);for(let n=tw.nextNode();n;n=tw.nextNode()){if(n.textContent.trim()&&!sp.contains(n)){n.textContent='888.8M ';break;}}
sp.textContent='\\u2696 888.8M';const r=document.createRange();r.selectNodeContents(td);
return (r.getBoundingClientRect().width+parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight))/fs;})()`;
    let tokEm = null;
    try { tokEm = JSON.parse(node([path.join('test', 'measure_page.js'), 'sessions', TOKX, '--width', '1700'])); } catch { tokEm = null; }
    ok(`‼️ S-131 — the Tokens floor holds "888.8M ⚖ 888.8M" and is no wider than it needs (${tokEm ? tokEm.toFixed(2) : '?'}em of ${spec.floorsEm.tokens}em)`,
        typeof tokEm === 'number' && tokEm <= spec.floorsEm.tokens && spec.floorsEm.tokens - tokEm < 0.5);
    const wide = measure(true, 1700);
    ok('at 1700px the shares already hold every floor: the declared layout is untouched and nothing scrolls',
        !!(wide && wide.tables > 0 && wide.moved === 0 && wide.scroll === 0 && wide.over.length === 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
