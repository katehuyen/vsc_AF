// U-193 — the Tasks page's workflow and step forms fit a phone: measured at 360px on every fixture scene.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

{
    const page = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    ok('a wake row wraps, and neither its selects nor its value box may be wider than the row',
        /\.wkrow \{[^}]*flex-wrap:wrap/.test(page) && /\.wkrow select \{[^}]*max-width:100%/.test(page)
        && /\.wkrow input \{[^}]*max-width:100%/.test(page));
}

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    // Every box that reaches past its scene's right edge. A box inside a scroller is clipped on purpose,
    // and an open AFTip panel is a hover surface (a long-press sheet on the phone), so neither counts.
    const EXPR = "(()=>{const out=[];document.querySelectorAll('div.rndr-page').forEach((pg,i)=>{"
        + "const pr=pg.getBoundingClientRect();let worst=0,who='';"
        + "pg.querySelectorAll('*').forEach(el=>{if(el.closest('.af-tip'))return;"
        + "for(let p=el.parentElement;p&&p!==pg;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible')return;}"
        + "const r=el.getBoundingClientRect();if(!r.width||!r.height)return;const o=Math.round(r.right-pr.right);"
        + "if(o>worst){worst=o;who=el.tagName.toLowerCase()+(el.id?'#'+el.id:'');}});"
        + "out.push({scene:i+1,worst,who});});return out;})()";
    node([path.join('test', 'render_page.js'), 'tasks']);
    let scenes = null;
    try { scenes = JSON.parse(node([path.join('test', 'measure_page.js'), 'tasks', EXPR, '--phone'])); } catch { scenes = null; }
    ok('the tasks fixture was measured at phone width', Array.isArray(scenes) && scenes.length > 40);
    const over = (scenes || []).filter(s => s.worst > 2);
    ok('‼️ no box in any Tasks scene reaches past a 360px phone screen'
        + (over.length ? ' — ' + over.map(s => `#${s.scene} ${s.who} +${s.worst}`).join(', ') : ''), over.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
