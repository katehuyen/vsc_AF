/**
 * Guard: A TABLE'S LAST ROW OPENS ITS PANEL WHOLE — measured, not read (U-162).
 *
 * `.tablewrap { overflow-x:auto }` is a scroll box vertically too (CSS
 * computes the other axis to auto), and the edge flip measured the room below
 * a trigger against the WINDOW only. So every panel in the last row or two of
 * a table (Tasks → Plan / Runs: title, status, the Kapıcı chip) opened
 * downwards, was cut at the table's floor and grew a scrollbar where the rest
 * of it went — while the window under the table had all the room it needed.
 *
 * The fix reads the box that really clips the panel on both axes, opens
 * upwards inside it when that is the roomier side, and lets a panel the box
 * cannot hold either way leave it (`af-fixed`, placed on the window). This
 * hovers every table panel on the rendered Tasks page with the real component
 * and measures the panel against every ancestor that clips it; then it takes
 * the escape out and shows the same page failing, so the guard is known to bite.
 *
 *   node test/test_tip_table_floor.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------- read ----------
const edge = rd('media/afTipEdge.js');
ok('the flip measures against the box that clips it, not the window alone', /const box = clipBox\(tip, vw, vh\);/.test(edge));
ok('…on both axes: overflowY is read as well as overflowX', /cs\.overflowY/.test(edge) && /cs\.overflowX/.test(edge));
ok('a panel the box cannot hold either way leaves it', /if \(box\.y && h > Math\.max\(below, above\) && escape\(/.test(edge));
ok('…and the escape is cleared before every new measurement', /w\.classList\.remove\('af-fixed'\);/.test(edge));
ok('the escape places the panel only while it is open',
    /\.af-tipw\.af-fixed:is\(:hover, \.af-open, \.af-on, \.af-hold, \.af-measure\) > \.af-tip \{[^}]*position: fixed;/.test(rd('media/common.css')));

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
  const CLIPS = /auto|scroll|hidden|clip/;
  const vh = document.documentElement.clientHeight;
  const out = { hovered: 0, escaped: 0, bad: [] };
  for (const w of document.querySelectorAll('.tablewrap .af-tipw')) {
    if (w.classList.contains('tip-free')) { continue; }
    const tip = w.querySelector(':scope > .af-tip');
    if (!tip) { continue; }
    w.scrollIntoView({ block: 'center' });
    const tr = w.getBoundingClientRect();
    if (!tr.width && !tr.height) { continue; }
    w.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: tr.left + 1, clientY: tr.top + 1 }));
    w.classList.add('af-on');
    out.hovered++;
    const b = tip.getBoundingClientRect();
    const fixed = getComputedStyle(tip).position === 'fixed';
    if (fixed) { out.escaped++; }
    let t = 0, f = vh;
    if (!fixed) {
      for (let n = w.parentElement; n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (CLIPS.test(cs.overflowY) || CLIPS.test(cs.overflowX)) {
          const c = n.getBoundingClientRect();
          t = Math.max(t, c.top); f = Math.min(f, c.bottom);
        }
      }
    }
    const over = Math.max(0, t - b.top) + Math.max(0, b.bottom - f);
    if (over > 1) {
      out.bad.push(Math.round(over) + 'px cut [' + (w.textContent || '').trim().slice(0, 18) + ']');
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
    const src = edge + '\n;' + rd('media/afTip.js');
    const expr = path.join(os.tmpdir(), `af-tipfloor-${process.pid}.js`);
    const exprOff = path.join(os.tmpdir(), `af-tipfloor-off-${process.pid}.js`);
    const wrap = s => '(function(){ ' + s + '\n; return ' + PROBE + '; })()';
    fs.writeFileSync(expr, wrap(src), 'utf8');
    fs.writeFileSync(exprOff, wrap(src.replace(/if \(box\.y && h > Math\.max\(below, above\) && escape\(w, a, h, wd, vw, vh\)\) \{ done\(\); return; \}/, '/* off */')), 'utf8');
    const measure = file => {
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), 'tasks', '@' + file])); }
        catch { return null; }
    };
    try {
        node([path.join('test', 'render_page.js'), 'tasks']);
        const r = measure(expr);
        ok('the Tasks page was measured and its table panels hovered', !!r && r.hovered >= 3);
        ok('‼️ NO TABLE PANEL IS CUT AT THE TABLE\'S FLOOR OR ROOF'
            + (r && r.bad.length ? ' — ' + r.bad.join(' · ') : ''), !!r && r.bad.length === 0);
        ok('the escape really carried a panel out of its table', !!r && r.escaped > 0);
        const off = measure(exprOff);
        ok('‼️ …and with the escape taken out the same page IS cut — the guard bites',
            !!off && off.bad.length > 0 && off.escaped === 0);
    } finally {
        for (const f of [expr, exprOff]) { try { fs.unlinkSync(f); } catch { /* gone */ } }
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
