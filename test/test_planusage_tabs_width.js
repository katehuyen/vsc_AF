/**
 * Guard: A PLAN-USAGE ENGINE HANDLE IS NEVER CUT WHILE THE STRIP HAS ROOM.
 *
 * Audit B-06.2. The strip on the plan card read `Claude · Codex · Gemini ·
 * Antigra… · OpenCo…` with 1,028px of page unused to the right of the card.
 * Measured: Antigravity needed 60px and had 59, OpenCode the same. The markup
 * was correct and every string test passed - the defect was `flex:1 1 0`, a
 * basis of ZERO, which split the card into five equal fifths whatever the
 * names measured. Same family as B-04.4 (a model id in a box narrower than
 * itself) and B-05.5 (the voice pickers): a control narrower than its value
 * with room beside it.
 *
 * The basis is the name now (`flex:1 1 auto`): each handle starts at its own
 * width and the SPARE is what they share. Two things have to stay true at
 * once, and only the laid-out DOM can say either:
 *
 *   1. at the card's real width no handle is cut - the repair;
 *   2. on a card genuinely too narrow the strip is STILL one row and the names
 *      ellipsise rather than push a neighbour off the line - U-40, the rule the
 *      old value was written to keep, which the repair must not have traded
 *      away.
 *
 *   node test/test_planusage_tabs_width.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

// The source half: the basis is the name, and one row is still a rule.
{
    const src = fs.readFileSync(path.join(ROOT, 'media', 'dashboard.js'), 'utf8');
    ok('‼️ the handle\'s flex basis is its own name, not zero',
        /\.pu-tab \{ flex:1 1 auto; min-width:0;/.test(src));
    ok('…and the strip still refuses to wrap (U-40 is a rule, not a hope)',
        /\.pu-tabs \{[^}]*flex-wrap:nowrap;/.test(src));
    ok('…and a name that really has no room ellipsises rather than spills',
        /\.pu-tab \{[^}]*overflow:hidden; text-overflow:ellipsis; white-space:nowrap;/.test(src));
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
    node([path.join('test', 'render_page.js'), 'planusage']);
    const measure = (expr) => {
        const raw = node([path.join('test', 'measure_page.js'), 'planusage', expr]);
        try { return JSON.parse(raw.slice(raw.indexOf('{'))); } catch { return null; }
    };

    // One strip = { w, rows, spilled, cut[] }: its width, how many distinct
    // top edges its handles sit on, how many handles end past its right edge,
    // and which handles draw less than their own text.
    const STRIPS = "function strips(){return [].slice.call(document.querySelectorAll('.pu-tabs')).map(function(s){"
        + "var sr=s.getBoundingClientRect();var kids=[].slice.call(s.children);"
        + "var tops=kids.map(function(k){return Math.round(k.getBoundingClientRect().top);});"
        + "return {w:Math.round(sr.width),rows:tops.filter(function(t,i){return tops.indexOf(t)===i;}).length,"
        + "spilled:kids.filter(function(k){return k.getBoundingClientRect().right>sr.right+1;}).length,"
        + "cut:kids.filter(function(k){return k.scrollWidth>Math.round(k.getBoundingClientRect().width);})"
        + ".map(function(k){return k.textContent.trim()+' '+k.scrollWidth+'px in '+Math.round(k.getBoundingClientRect().width)+'px';})};});}";

    // ---- 1. the card at its own width: nothing is cut ------------------------
    const wide = measure("(function(){" + STRIPS + "return {strips:strips()};})()");
    const ws = (wide && wide.strips) || [];
    ok(`the fixture draws engine strips to measure (${ws.length})`, ws.length > 0);
    if (ws.length) {
        const cut = ws.reduce((a, s) => a.concat(s.cut), []);
        ok('‼️ AT THE CARD\'S OWN WIDTH NO HANDLE DRAWS LESS THAN ITS NAME'
            + (cut.length ? ` (${cut.join(' · ')})` : ''), cut.length === 0);
        ok(`…and every strip is one row (${JSON.stringify(ws.map(s => s.rows))})`,
            ws.every(s => s.rows === 1));
    }

    // ---- 2. a card genuinely too narrow: one row, ellipsis, no spill ---------
    // The card is narrowed rather than the window because the strip's
    // behaviour is a property of the card it sits in, not of the page.
    const tight = measure("(function(){" + STRIPS
        + "[].slice.call(document.querySelectorAll('.pucard')).forEach(function(c){c.style.width='200px';c.style.maxWidth='200px';});"
        + "document.body.getBoundingClientRect();return {strips:strips()};})()");
    const ts = (tight && tight.strips) || [];
    ok('the narrowed card still answers', ts.length === ws.length && ts.length > 0);
    if (ts.length) {
        ok(`‼️ A STRIP OUT OF ROOM IS STILL ONE ROW (${JSON.stringify(ts.map(s => s.rows))})`,
            ts.every(s => s.rows === 1));
        ok('…and no handle is pushed past the strip\'s edge', ts.every(s => s.spilled === 0));
        // Without this the two claims above could be met by a strip that simply
        // grew past its card: the names must give ground, visibly.
        ok('…and the names really ellipsise rather than overflow'
            + ` (${ts[0].cut.length} handles on the first strip)`,
            ts.every(s => s.cut.length > 0));
    }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
