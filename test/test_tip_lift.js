/**
 * Guard: U-146 — AN OPEN AFTIP PANEL IS NEVER SEEN THROUGH A DIMMED ANCESTOR.
 *
 * `opacity` below 1 anywhere above a panel composites the panel at that
 * opacity too, however opaque its own background, and no rule on the panel can
 * undo it. Dimmed rows — an ended session, a done item, a paused card — are
 * exactly where the panels live, so they were drawn half-transparent over the
 * text behind them. The fix lifts a panel's translucent ancestors for as long
 * as it is open (afTipEdge.js marks them, common.css lifts them).
 *
 * ‼️ MEASURED, because the thing that goes wrong is a computed value no string
 * test can see: each fixture is rendered, the REAL afTipEdge.js + afTip.js are
 * loaded into it, every panel that sits under a translucent ancestor is hovered
 * through the component's own pointer handler and put in its open state, and
 * the product of every ancestor's computed opacity is read. It must be 1. The
 * same page is then measured with the marking taken out, to prove it bites.
 *
 *   node test/test_tip_lift.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// The pages the inventory found veiled panels on (see the measured half).
const FIXTURES = ['turns', 'a2atasks', 'console', 'wiki', 'enginespanel', 'search'];

// ---------- the rules, where they have to be ----------
{
    const css = rd('media/common.css');
    const hover = (css.match(/\.af-dimhost:has\(:where\(\.af-tipw:not\(\.af-mute\):not\(\.tip-free\):hover\) > \.af-tip\),\s*\.af-tipw\.af-dimhost:where\(:not\(\.af-mute\):not\(\.tip-free\):hover\) \{([^}]*)\}/) || [])[1] || '';
    const open = (css.match(/\.af-dimhost:has\(\.af-tipw:not\(\.af-mute\):is\(\.af-open, \.af-on, \.af-hold\) > \.af-tip\),\s*\.af-tipw\.af-dimhost:not\(\.af-mute\):is\(\.af-open, \.af-on, \.af-hold\) \{([^}]*)\}/) || [])[1] || '';
    ok('the lift is keyed on the panel\'s own states — a marked host, or a marked wrapper itself',
        /opacity: 1 !important/.test(hover) && /opacity: 1 !important/.test(open));
    ok('…a plain hover waits the ordinary open delay, so a sweeping pointer flashes no row',
        /transition: opacity 0s linear \.25s !important/.test(hover));
    ok('…a panel already on screen lifts at once — and that rule outranks the delayed one',
        /transition: none !important/.test(open)
        && css.indexOf('.af-dimhost:has(.af-tipw:not(.af-mute):is(') > css.indexOf('.af-dimhost:has(:where('));
    const edge = rd('media/afTipEdge.js');
    ok('the edge module marks BEFORE it leaves a tip-free panel to its placer',
        edge.indexOf('mark(w);') > 0 && edge.indexOf('mark(w);') < edge.indexOf("contains('tip-free')"));
    const base = rd('src/panels/base.ts');
    const at = n => base.indexOf(`<script nonce="\${nonce}" src="\${${n}}"></script>`);
    ok('every page loads afTipEdge.js, BEFORE afTip.js which calls it', at('tipEdge') > 0 && at('tipEdge') < at('tip'));
}

// ---------- measured ----------
const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

const PROBE = `(() => {
  const veil = w => { let op = 1; for (let n = w; n && n !== document.documentElement; n = n.parentElement) { op *= parseFloat(getComputedStyle(n).opacity); } return op; };
  const out = { veiled: 0, clear: 0, bad: [] };
  for (const w of document.querySelectorAll('.af-tipw')) {
    const tip = w.querySelector(':scope > .af-tip');
    if (!tip || !(veil(w) < 0.999)) { continue; }
    out.veiled++;
    const r = w.getBoundingClientRect();
    w.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: r.left + 1, clientY: r.top + 1 }));
    w.classList.add('af-on');
    const op = veil(w);
    if (op > 0.999) { out.clear++; } else { out.bad.push(op.toFixed(2) + ' ' + String(w.className).slice(0, 40)); }
    w.classList.remove('af-on');
    w.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    w.classList.remove('af-hold');
  }
  out.bad = [...new Set(out.bad)].slice(0, 8);
  return out;
})()`;

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    const edge = rd('media/afTipEdge.js');
    const tip = rd('media/afTip.js');
    const wrap = e => '(function(){ ' + e + '\n;' + tip + '\n; return ' + PROBE + '; })()';
    const on = path.join(os.tmpdir(), `af-tiplift-${process.pid}.js`);
    const off = path.join(os.tmpdir(), `af-tiplift-off-${process.pid}.js`);
    fs.writeFileSync(on, wrap(edge), 'utf8');
    fs.writeFileSync(off, wrap(edge.replace(/\bmark\(w\);/, '/* off */')), 'utf8');
    const measure = (fx, file) => {
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), fx, '@' + file])); } catch { return null; }
    };
    try {
        for (const fx of FIXTURES) {
            node([path.join('test', 'render_page.js'), fx]);
            const r = measure(fx, on);
            ok(`${fx}: measured, and it has panels under a dimmed ancestor — a page with none proves nothing`,
                !!r && r.veiled > 0);
            ok(`‼️ ${fx}: EVERY OPEN PANEL IS FULLY OPAQUE` + (r && r.bad.length ? ' — ' + r.bad.join(' · ') : ''),
                !!r && r.bad.length === 0 && r.clear === r.veiled);
        }
        const bite = measure(FIXTURES[0], off);
        ok(`‼️ …and with the marking taken out, ${FIXTURES[0]} shows them through the veil again — the guard bites`,
            !!bite && bite.veiled > 0 && bite.bad.length > 0);
    } finally {
        for (const f of [on, off]) { try { fs.rmSync(f, { force: true }); } catch { /* a temp file */ } }
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
