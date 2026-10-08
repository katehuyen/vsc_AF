// U-227 — a number, time or multi-line box wears the text box's theme (media/common.css): measured on the
// Settings page, where a white number box sat in the dark theme beside dark text boxes in the same column.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'media/common.css'), 'utf8');

ok('common.css themes the number, time and multi-line boxes with the text box\'s variables',
    /input\[type="number"\], input\[type="time"\], textarea \{\s*color: var\(--vscode-input-foreground\); background: var\(--vscode-input-background\);/.test(CSS));
ok('…and the check and radio marks take the theme\'s button colour', /input\[type="checkbox"\], input\[type="radio"\] \{ accent-color: var\(--vscode-button-background\); \}/.test(CSS));

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
    // Each kind of box on the page, by its computed background; `bare` is a box with the page's
    // rules reverted — the instrument has to see the defect the rule repairs.
    const EXPR = `(()=>{const bg=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).backgroundColor:null;};
const bare=document.createElement('input');bare.type='number';bare.style.all='revert';document.body.appendChild(bare);
const b=getComputedStyle(bare).backgroundColor;bare.remove();
return {text:bg('input[type=text]'),number:bg('input[type=number]'),textarea:bg('textarea'),bare:b};})()`;
    const measure = (fixture) => {
        node([path.join('test', 'render_page.js'), fixture]);
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), fixture, EXPR])); } catch { return null; }
    };
    const a = measure('alertsettings');
    ok('the instrument sees the defect: a number box with the page\'s rules reverted is not the text box\'s colour'
        + (a ? ` (${a.bare} against ${a.text})` : ''), !!(a && a.text && a.bare && a.bare !== a.text));
    ok('‼️ the number box\'s background is the text box\'s' + (a ? ` (${a.number} / ${a.text})` : ''),
        !!(a && a.number && a.number === a.text));
    const d = measure('disciplinesettings');
    ok('‼️ …and so is the multi-line box\'s' + (d ? ` (${d.textarea} / ${d.text})` : ''),
        !!(d && d.textarea && d.text && d.textarea === d.text));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
