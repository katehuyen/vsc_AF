/**
 * Guard: THE COMPOSER'S `show` PICKER GIVES GROUND WHEN THE ROW IS CROWDED.
 *
 * The Console's pre-spawn strip carries nine controls and Send on one
 * `flex-wrap:nowrap` line. Every one of them could narrow except this one:
 * `afFilters` reserves the widest text the button can ever print and writes it
 * as a fixed `width`, which is right for a row that must not rock as the choice
 * changes — and wrong as the last word on the subject, because it made the
 * WIDEST control on the strip the only one that could not help.
 *
 * Measured at 1030px before the repair: `show` held 142px while the boxes that
 * hold a VALUE — model, effort, account, permissions — were squeezed to single
 * digits beside it. A word that never changes was being paid for with the four
 * answers a reader is actually looking for.
 *
 * So: unchanged where there is room, and down to half — never below — where
 * there is not. The floor is computed from `--afms-w`, the width the component
 * itself reserved, rather than from a number typed here that would go stale the
 * first time an option's text changed.
 *
 *   node test/test_console_show_width.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

// The component's half of the contract, asked of the source: the page cannot
// compute a floor from a width the component does not publish.
{
    const src = fs.readFileSync(path.join(ROOT, 'media', 'afFilters.js'), 'utf8');
    ok('‼️ the picker publishes the width it reserved, as --afms-w',
        /--afms-w:\$\{buttonWidth\(o, opts\)\}ch/.test(src));
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
    node([path.join('test', 'render_page.js'), 'console']);

    // The row is laid out at four widths and the picker measured at each. The
    // host element is narrowed rather than the viewport because the strip's
    // behaviour is a property of the row, not of the window.
    const expr = "(function(){var b=document.querySelector('.crow .afms-btn');"
        + "if(!b){return 'no show picker on the composer row';}"
        + "var row=b.closest('.crow');var host=row.parentElement;var out=[];"
        + "[1400,1030,820,600].forEach(function(w){host.style.width=w+'px';"
        + "row.getBoundingClientRect();"
        + "out.push({at:w,show:Math.round(b.getBoundingClientRect().width),"
        + "text:b.scrollWidth});});"
        + "host.style.width='';return out;})()";
    const raw = node([path.join('test', 'measure_page.js'), 'console', expr]);
    let rows = [];
    try { rows = JSON.parse(raw.slice(raw.indexOf('['))); } catch { rows = []; }
    ok('the composer row answered with a show picker to measure', rows.length === 4);

    if (rows.length === 4) {
        const at = (w) => rows.find(r => r.at === w) || {};
        const wide = at(1400).show;
        const tight = at(600).show;
        const say = JSON.stringify(rows.map(r => r.at + ':' + r.show));

        // ‼️ WITH ROOM, NOTHING CHANGED. `flex-grow` is 0, so it can never take
        // more than the component reserved — the row still does not rock.
        ok(`‼️ with room to spare it keeps its reserved width (${say})`,
            wide > 0 && rows.every(r => r.show <= wide));

        // ‼️ AND WHEN THE ROW IS CROWDED IT REALLY NARROWS. Without this the
        // whole item is a comment: the box sat at its full width while the
        // value-bearing boxes beside it went to single digits.
        ok(`‼️ a crowded row makes it narrow (1400:${wide}px → 600:${tight}px)`,
            tight < wide);

        // …but never past half. Below that the value stops being readable at
        // all, and a control that has vanished is not a contribution.
        ok(`‼️ …and never below half of what it reserved (${tight}px vs ${Math.round(wide / 2)}px)`,
            tight >= Math.floor(wide / 2));
    }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
