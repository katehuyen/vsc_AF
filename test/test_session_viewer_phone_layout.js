// X-456 — A TRANSCRIPT ON A 360px PHONE, MEASURED. Each turn's band was one
// unbreakable line (title, figures, ‹ › arrows) and pushed the page 113px
// sideways; on a phone the band breaks after its title now. The controls that
// only work on the PC (resume in a terminal, the terminal, the export, the raw
// file, the agent's page) are not drawn there.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

{
    const src = fs.readFileSync(path.join(ROOT, 'media', 'sessionViewer.js'), 'utf8');
    ok('on a phone the turn band may wrap', /html\.af-phone \.turnhdr \{ flex-wrap:wrap;/.test(src));
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
    node([path.join('test', 'render_page.js'), 'sessionviewer_phone']);
    // The fixture lays a chain menu into the page for one scene; it is not part of the page.
    const probe = "(function(){var doc=document.documentElement,out={cw:doc.clientWidth,phone:doc.classList.contains('af-phone')};"
        + "[].slice.call(document.querySelectorAll('.afchain-menu')).forEach(function(e){e.remove();});"
        + "var clip=function(e){for(var p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible'){return true;}}return false;};"
        + "out.sw=Math.max.apply(null,[0].concat([].slice.call(document.body.querySelectorAll('*')).filter(function(e){return e.getBoundingClientRect().width>0&&!clip(e);})"
        + ".map(function(e){return Math.round(e.getBoundingClientRect().right);})));"
        + "var bands=[].slice.call(document.querySelectorAll('.turnhdr'));out.bands=bands.length;"
        + "out.bandRight=Math.max.apply(null,[0].concat(bands.map(function(b){return Math.max.apply(null,[].slice.call(b.children).map(function(k){return Math.round(k.getBoundingClientRect().right);}));})));"
        + "out.pc=['resume','focusterm','exportmd','raw'].map(function(id){var e=document.getElementById(id);return e?getComputedStyle(e).display:'gone';});"
        + "out.kept=['renamesess','replaytoggle'].map(function(id){var e=document.getElementById(id);return e?getComputedStyle(e).display:'gone';});"
        + "return out;})()";
    const ph = json(node([path.join('test', 'measure_page.js'), 'sessionviewer_phone', probe, '--phone'])) || {};
    const say = JSON.stringify(ph);
    ok(`‼️ phone: the page is in phone mode and nothing pushes it sideways (${say})`, ph.phone === true && ph.sw <= ph.cw + 1);
    ok('‼️ phone: every turn band stays inside the screen', ph.bands > 0 && ph.bandRight <= ph.cw);
    ok('phone: resume-in-a-terminal, the terminal, the export and the raw file are not drawn',
        Array.isArray(ph.pc) && ph.pc.every(d => d === 'none'));
    ok('phone: rename and replay are', Array.isArray(ph.kept) && ph.kept.every(d => d !== 'none' && d !== 'gone'));
}

console.log(`\ntest_session_viewer_phone_layout: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
