// U-180 — the session sound panel keeps its longest voice name inside its own edge (media/afSoundPop.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'media/afSoundPop.js'), 'utf8');
const CSS = (/el\.textContent = `([\s\S]*?)`;/.exec(SRC) || [])[1] || '';
const FIX = 'width:100%; max-width:100%; box-sizing:border-box;';

ok('a select in a panel line fills the line and no more: its widest option no longer sizes the column',
    /\.sp-line select \{[^}]*width:100%; max-width:100%; box-sizing:border-box;/.test(CSS));

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
    // The panel as the Sound page draws it, on the fixture's voices: real Windows labels, the longest one chosen.
    const { runPage } = require('./lib_page_dom.js');
    const fx = require('./fixtures/sound.js');
    const d = fx.inUse();
    const sb = runPage('sound.js', d).sandbox;
    const win = sb.window || sb;
    const voices = (d.alerts.speak || {}).voices || [];
    const longest = voices.slice().sort((a, b) => String(b.label).length - String(a.label).length)[0] || {};
    const tone = ((d.alerts.voices || [])[0] || {}).id || '';
    const profile = { sessionId: 's1', label: 'developer #3', sound: 'like-all', speechVoice: longest.name, read: false, also: {},
        tones: [{ event: 'turn-ready', voice: tone, chosen: false }, { event: 'question', voice: tone, chosen: true }] };
    const HTML = win.AFSoundPop.html(profile, d.alerts);
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    node([path.join('test', 'render_page.js'), 'sound']);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sndpop-'));
    // Every control and line of the panel against the panel's own inner right edge.
    const measure = (css) => {
        const f = path.join(tmp, 'expr.js');
        fs.writeFileSync(f, `(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s);
const root=document.createElement('div');root.innerHTML=${JSON.stringify(HTML)};document.body.appendChild(root);
const pop=root.querySelector('.sp-pop'),pr=pop.getBoundingClientRect(),cs=getComputedStyle(pop);
const edge=pr.right-parseFloat(cs.paddingRight)-parseFloat(cs.borderRightWidth);const over=[];
pop.querySelectorAll('select,button,label,input,.sp-line,.sp-tone').forEach(e=>{const r=e.getBoundingClientRect();
if(r.right>edge+0.5)over.push((Object.keys(e.dataset)[0]||e.className||e.tagName)+' +'+Math.round(r.right-edge));});
const sel=pop.querySelector('[data-spspeech]');
return {w:Math.round(pr.width),over,chosen:sel.options[sel.selectedIndex].text};})()`, 'utf8');
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), 'sound', '@' + f])); } catch { return null; }
    };
    try {
        const loose = measure(CSS.replace(FIX, ''));
        ok('the instrument sees the defect: without the rule the voice box runs past the panel'
            + (loose ? ' (' + loose.over.join(', ') + ')' : ''),
            !!(loose && loose.over.some(s => /^spspeech /.test(s))));
        const m = measure(CSS);
        ok(`‼️ with the longest voice chosen ("${m ? m.chosen : '?'}") nothing in the panel reaches past its edge`
            + (m && m.over.length ? ' — ' + m.over.join(', ') : ''),
            !!(m && m.over.length === 0 && m.chosen === longest.label && m.w === 440));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
