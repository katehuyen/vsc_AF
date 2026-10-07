// U-240 — the place box at the foot of the backlog's ▲/▼ step menu never widens the menu (media/afBlPlace.js).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'media/afBlPlace.js'), 'utf8');

{
    ok('the row has no say in the menu\'s width: width 0, then all of what the step rows made',
        /\.pj-bl-place \{[^}]*width:0; min-width:100%/.test(SRC));
    ok('the box takes only what the buttons leave', /\.pj-bl-place input \{[^}]*flex:1 1 0; width:0; min-width:0/.test(SRC));
    ok('only the box\'s own focus holds the menu open', /\.pj-bl-steps:has\(\.pj-bl-place input:focus\) \{ visibility:visible; opacity:1; \}/.test(SRC));
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
    // Every step menu, with its widest place in the box, then the same menu with the row taken out.
    // `loose` lifts the row's two width rules first: the instrument has to see a menu that grows.
    const EXPR = (loose) => `(()=>{const out=[];document.querySelectorAll('.pj-bl-steps').forEach(m=>{
const p=m.querySelector('.pj-bl-place');if(!p)return;const i=p.querySelector('input');
if(${loose}){p.style.width='auto';p.style.minWidth='0';i.style.flex='none';i.style.width='auto';}
i.value='888';const w=m.getBoundingClientRect().width,mr=m.getBoundingClientRect();
const inside=[p,...p.children].every(e=>{const r=e.getBoundingClientRect();return r.right<=mr.right+0.5&&r.left>=mr.left-0.5;});
const fit=i.scrollWidth<=i.clientWidth;p.remove();const w0=m.getBoundingClientRect().width;
out.push({w,w0,inside,fit});});return out;})()`;
    node([path.join('test', 'render_page.js'), 'backlog']);
    const measure = (loose) => {
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), 'backlog', EXPR(loose)])); } catch { return null; }
    };
    const grown = measure(true);
    // Not every menu: the ▼ one's "bottom" makes it wider than a loose box (measured 90px against 68px for ▲).
    ok('the instrument sees the defect: a box at its natural width widens the narrower menus'
        + (grown ? ` (${grown.filter(x => x.w > x.w0 + 0.5).length} of ${grown.length})` : ''),
        !!(grown && grown.length > 0 && grown.some(x => x.w > x.w0 + 0.5)));
    const m = measure(false);
    const bad = m ? m.filter(x => Math.abs(x.w - x.w0) > 0.5 || !x.inside || !x.fit) : [];
    ok('‼️ every step menu is exactly as wide with the place box as without it, the box and each of its buttons inside it, a three-figure place fitting'
        + (bad.length ? ' — ' + JSON.stringify(bad.slice(0, 3)) : ''),
        !!(m && m.length >= 2 && bad.length === 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
