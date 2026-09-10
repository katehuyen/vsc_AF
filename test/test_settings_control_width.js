/**
 * Guard: A CONTROL ON THE FARM SETTINGS PAGE IS NOT NARROWER THAN THE VALUE IT
 * HOLDS.
 *
 * Found in audit B-04.1, on the scene whose own title is "defaults for
 * OPENCODE, where a model id is a sentence" — the fixture exists to put a long
 * id in that box, and the box cut it. Measured:
 *
 *   opencode/nemotron-3.5-lightning-free   needs 173px
 *   .agchip .agmodel                       had   150px (a hard max-width)
 *   the row it sits in                     had 1,106px of unused width to its right
 *
 * So the screen read `opencode/nemotron-3.5-lig` and the only way to tell that
 * id from the next one was hover — which this audit already called a defect in
 * B-02.4 and B-03.21. The ceiling was not removed (one pathological id may not
 * eat the row); it was raised to where a real id fits, and this file is what
 * says so about the NEXT id somebody adds.
 *
 * ‼️ WHY THIS SWEEP AND NOT THE TWO THAT ALREADY EXIST. The audit's standing
 * measurements are (a) an `overflow:hidden` box whose `scrollWidth` exceeds it
 * and (b) a text node drawn narrower than one character of itself. A native
 * `<select>` answers neither: its `scrollWidth` never exceeds its box, and its
 * value is not a text node at all — the browser paints it. Nine surfaces of
 * audit went past this one for exactly that reason. The measurement here is the
 * option's text measured in the select's own font against the select's own
 * content box.
 *
 *   node test/test_settings_control_width.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

// The scene's own contract. If the fixture stops carrying a long id, this file
// measures a page that cannot fail and says so instead of going quietly green.
{
    const fx = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'engines.js'), 'utf8');
    ok('the fixture still carries a model id long enough to test the box',
        /nemotron-3\.5-lightning-free/.test(fx));
}

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    node([path.join('test', 'render_page.js'), 'engines']);

    // Every visible `<select>`, its selected option's text measured in its own
    // font, against its own content box. `16` is the room the arrow takes; it
    // is subtracted so a value that only just fits is not called a failure.
    const expr = "(function(){var c=document.createElement('canvas').getContext('2d');var out=[];"
        + "document.querySelectorAll('select').forEach(function(s){"
        + "var b=s.getBoundingClientRect();if(b.width<=0||b.height<=0){return;}"
        + "if(s.checkVisibility&&!s.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})){return;}"
        + "var cs=getComputedStyle(s);c.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;"
        + "var t=(s.options[s.selectedIndex]||{}).text||'';"
        + "var w=c.measureText(t).width;"
        + "var inner=s.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-16;"
        + "var row=s.closest('.aglist')||s.parentElement;"
        + "var rb=row.getBoundingClientRect();"
        + "out.push({t:t,need:Math.round(w),room:Math.round(inner),"
        + "free:Math.round(rb.right-b.right),id:s.id||s.className});});"
        + "return out;})()";
    const raw = node([path.join('test', 'measure_page.js'), 'engines', expr]);
    let boxes = [];
    try { boxes = JSON.parse(raw.slice(raw.indexOf('['))); } catch { boxes = []; }

    ok(`the page answered with controls to measure (${boxes.length})`, boxes.length > 0);

    const cut = boxes.filter(b => b.need > b.room + 1);
    ok('‼️ NO CONTROL IS NARROWER THAN THE VALUE IT HOLDS'
        + (cut.length ? '\n      ' + cut.slice(0, 6).map(b =>
            `${JSON.stringify(b.t)} needs ${b.need}px in ${b.room}px (${b.free}px free beside it) [${b.id}]`
        ).join('\n      ') : ''),
        cut.length === 0);

    // …and the value this was found on is really on the page, at its full length.
    const long = boxes.find(b => /nemotron-3\.5-lightning-free/.test(b.t));
    ok('the long model id is drawn whole' + (long ? ` (${long.need}px in ${long.room}px)` : ''),
        !!long && long.need <= long.room + 1);

    // ‼️ THE OTHER HALF OF THE REPAIR. Widening a box inside a `nowrap` row is
    // how a fix becomes the next defect: the agents would fall onto a second
    // line and the page would grow a stripe nobody asked for. Each agent list
    // draws its chips on ONE line, and that is measured rather than assumed.
    const rowsExpr = "(function(){var out=[];document.querySelectorAll('.aglist').forEach(function(l){"
        + "var tops=[];l.querySelectorAll('.agchip').forEach(function(k){"
        + "var t=Math.round(k.getBoundingClientRect().top);if(tops.indexOf(t)<0){tops.push(t);}});"
        + "out.push(tops.length);});return out;})()";
    let rows = [];
    try {
        const r2 = node([path.join('test', 'measure_page.js'), 'engines', rowsExpr]);
        rows = JSON.parse(r2.slice(r2.indexOf('[')));
    } catch { rows = []; }
    ok(`every agent list still draws its chips on one line (${JSON.stringify(rows)})`,
        rows.length > 0 && rows.every(n => n === 1));

    // ‼️ AND EACH BOX SAYS WHICH AXIS IT IS — audit B-04.1, the same rule and
    // the same user decision as B-03.21 on the Console. The chip read
    // `developer [gpt-5.6-terra] [high]` and nothing on the screen said `high`
    // was an effort; the axis appeared only on the rows nobody had chosen.
    const chipExpr = "(function(){var out=[];document.querySelectorAll('.aglist .agchip').forEach(function(c){"
        + "var vals=[];c.querySelectorAll('select').forEach(function(s){"
        + "vals.push((s.options[s.selectedIndex]||{}).text||'');});"
        + "if(vals.length){out.push(vals);}});return out;})()";
    let chips = [];
    try {
        const r3 = node([path.join('test', 'measure_page.js'), 'engines', chipExpr]);
        chips = JSON.parse(r3.slice(r3.indexOf('[')));
    } catch { chips = []; }
    const nameless = [];
    let chipBoxes = 0;
    for (const vals of chips) {
        for (const v of vals) {
            chipBoxes++;
            if (!/^(model|effort)\s*[:→]/.test(v)) { nameless.push(JSON.stringify(v)); }
        }
    }
    ok(`‼️ EVERY AGENT-CHIP BOX NAMES ITS AXIS (${chipBoxes} boxes)`
        + (nameless.length ? ' — ' + nameless.slice(0, 4).join(', ') : ''),
        chipBoxes > 0 && nameless.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
