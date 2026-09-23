/**
 * Guard: K-44 — AN AFTIP PANEL NEVER OPENS PAST THE BOX THAT CLIPS IT.
 *
 * K-18 gave the component two anchors: the trigger's left edge, or (af-left)
 * its right edge, whichever side is roomier. That is a choice between two
 * failures whenever the panel is wider than the room on BOTH sides — a nav
 * button in the middle of the Console header, a composer chip — and it was
 * measured doing exactly that: a 760px panel hung off `📥 Queue` at a 1400px
 * window opened 21px past the left edge, and at 744px four kinds of panel ran
 * 26–42px off the right. `contain()` is the third answer: shift the panel into
 * the clipping box, and narrow it only when even that box is too small.
 *
 * ‼️ A LAYOUT DEFECT NEVER FAILS A STRING TEST, so the guard is a measurement:
 * the Console render, the REAL afTipEdge.js + afTip.js loaded into it, every non-free trigger
 * hovered through the component's own pointer handler, and every open panel's
 * box compared with the window and every ancestor that clips it — at three
 * widths, because which panels overflow is decided by the width.
 *
 *   node test/test_tip_contain.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------- the rules, where they have to be ----------
{
    const css = rd('media/common.css');
    const fit = css.indexOf('.af-tipw.af-fit:is(');
    ok('the fit rule exists and applies only to an OPEN panel',
        fit > 0 && /\.af-tipw\.af-fit:is\(:hover, \.af-open, \.af-on, \.af-hold, \.af-measure\) > \.af-tip \{[^}]*left: var\(--af-fit-l\)/.test(css));
    ok('…declared after the flip, so it is the final word on the horizontal edge',
        fit > css.indexOf('.af-tipw.af-left > .af-tip'));
    ok('‼️ A-12 still holds: a CLOSED panel carries no fit width — the collapse rule is not overruled',
        !/\.af-tipw\.af-fit > \.af-tip/.test(css) && !/--af-fit-w[^;]*!important/.test(css));
    const tip = rd('media/afTipEdge.js');
    ok('the flip hands every non-free panel to contain()', /\n\s*contain\(w, tip, vw\);/.test(tip));
    ok('…and clears the last answer before measuring a new one', /unfit\(w, tip\);/.test(tip));
    const con = rd('media/console.js');
    ok('the Console caps an ordinary panel at a reading width',
        /\.af-tip \{ max-width: min\(520px, 62vw\); \}/.test(con));
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
  const vw = document.documentElement.clientWidth;
  const clipOf = el => {
    let l = 0, r = vw;
    for (let n = el.offsetParent; n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(n).overflowX)) {
        const b = n.getBoundingClientRect();
        l = Math.max(l, b.left); r = Math.min(r, b.right);
      }
    }
    return { l, r };
  };
  const out = { vw, hovered: 0, fitted: 0, bad: [] };
  for (const w of document.querySelectorAll('.af-tipw')) {
    if (w.classList.contains('tip-free')) { continue; }
    const tip = w.querySelector(':scope > .af-tip');
    const tr = w.getBoundingClientRect();
    if (!tip || (!tr.width && !tr.height)) { continue; }
    w.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: tr.left + 1, clientY: tr.top + 1 }));
    w.classList.add('af-on');
    out.hovered++;
    if (w.classList.contains('af-fit')) { out.fitted++; }
    const b = tip.getBoundingClientRect();
    const c = clipOf(tip);
    const over = Math.max(0, c.l - b.left) + Math.max(0, b.right - c.r);
    if (over > 1) {
      out.bad.push(Math.round(over) + 'px [' + (w.textContent || '').trim().slice(0, 18) + '] ' + Math.round(b.left) + '..' + Math.round(b.right));
    }
    w.classList.remove('af-on', 'af-hold');
    w.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    w.classList.remove('af-hold');
  }
  out.bad = [...new Set(out.bad)].slice(0, 12);
  return out;
})()`;

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    // The render is static — no page script runs in it — so the component is
    // loaded here, and the flip it performs is the real one.
    const src = rd('media/afTipEdge.js') + '\n;' + rd('media/afTip.js');
    const expr = path.join(os.tmpdir(), `af-tipcontain-${process.pid}.js`);
    const exprOff = path.join(os.tmpdir(), `af-tipcontain-off-${process.pid}.js`);
    const wrap = s => '(function(){ ' + s + '\n; return ' + PROBE + '; })()';
    fs.writeFileSync(expr, wrap(src), 'utf8');
    // The same component with contain() taken out — so the guard is shown to
    // bite on the very page it certifies, not assumed to.
    fs.writeFileSync(exprOff, wrap(src.replace(/\n(\s*)contain\(w, tip, vw\);/, '\n$1/* off */')), 'utf8');
    const measure = (file, width) => {
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), 'console', '@' + file, '--width', String(width)])); }
        catch { return null; }
    };
    try {
        node([path.join('test', 'render_page.js'), 'console']);
        for (const width of [1400, 1000, 744]) {
            const r = measure(expr, width);
            ok(`${width}px: the page was measured and answered`, !!r && r.hovered > 100);
            ok(`‼️ ${width}px: NO PANEL OPENS PAST THE WINDOW OR A BOX THAT CLIPS IT`
                + (r && r.bad.length ? ' — ' + r.bad.join(' · ') : ''),
                !!r && r.bad.length === 0);
            // At the narrow width the reading cap alone is not enough; that is
            // where the fit has to be doing the work.
            if (width === 744) { ok('744px: the fit really moved panels there', !!r && r.fitted > 0); }
        }
        const off = measure(exprOff, 744);
        ok('‼️ …and with contain() removed the same page DOES overflow at 744px — the guard bites',
            !!off && off.bad.length > 0 && off.fitted === 0);
    } finally {
        for (const f of [expr, exprOff]) { try { fs.rmSync(f, { force: true }); } catch { /* a temp file */ } }
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
