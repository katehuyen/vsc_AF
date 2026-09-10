/**
 * Guard: EVERY BOX ON THE NEW-SESSION ROW SAYS WHICH AXIS IT IS.
 *
 * Found in audit B-03.21, measured on dist/render/console.s4.png and
 * console.s8.png: the row that STARTS a session drew
 *
 *     [Choose an agen] [Codex] ? route [Kimi] tier [opus] account [murvietnam-2]
 *     [Default] [Default] [Default] [Agent Fa]
 *
 * — three boxes in a row reading nothing but the same word, and a fourth
 * reading `high` beside a model id. Which was model, which was effort and which
 * was permissions was answerable only by hover. The RUNNING row, four inches
 * below, names all four with a `permlbl`; and the engine's own boxes name
 * themselves with `rtlbl`. So the page already knew the rule and one row broke
 * it.
 *
 * ‼️ THE RULE IS "NO TWO BOXES READ THE SAME THING", not "these four words are
 * present". Written the second way it would go green on a row where every box
 * said `axis` and nothing else. Written this way it also catches the next box
 * somebody drops in unlabelled, which is how this row got here.
 *
 * The repair was decided by the user rather than chosen here: the axis travels
 * INSIDE the value (`effort: high`, `perm → Default`) rather than in a separate
 * `<label>`, because `.crow` is `flex-wrap:nowrap` and had 69px of slack where
 * four labels want ~166. The cost is that the value is clipped a little more,
 * and the hover — an AFTip panel now, not a native title — carries the whole
 * answer: the axis spelled out, what it is set to, and what that choice means.
 *
 *   node test/test_console_axis_labels.js
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

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — this whole file is a measurement)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    node([path.join('test', 'render_page.js'), 'console']);

    // Every row that STARTS a session (it has the engine picker; the running
    // row has a fixed engine badge instead), and what each of its boxes reads.
    // A box with a visible label beside it is naming itself that way and is
    // reported as such rather than being skipped silently.
    const expr = "(function(){var out=[];"
        + "[].slice.call(document.querySelectorAll('.crow')).forEach(function(r,i){"
        + "if(!r.querySelector('#c-engine')){return;}"
        + "var boxes=[];"
        + "[].slice.call(r.querySelectorAll('select')).forEach(function(s){"
        + "var lab=s.closest('.rtlbl')||s.closest('.permlbl');"
        + "var w=s.closest('.af-tipw');"
        + "var h=w?w.querySelector('.af-tiph'):null;"
        + "var b=w?w.querySelector('.af-tipb'):null;"
        + "boxes.push({id:s.id,shown:((s.options[s.selectedIndex]||{}).text||''),"
        + "labelled:!!lab,head:h?h.textContent:'',body:b?b.textContent:''});});"
        + "out.push({row:i,boxes:boxes});});return out;})()";
    const raw = node([path.join('test', 'measure_page.js'), 'console', expr]);
    let rows = [];
    try { rows = JSON.parse(raw.slice(raw.indexOf('['))); } catch { rows = []; }

    ok(`the page drew rows that start a session (${rows.length})`, rows.length > 0);

    // ---- the rule ---------------------------------------------------------
    const clashes = [];
    let counted = 0;
    for (const r of rows) {
        const seen = new Map();
        for (const b of r.boxes) {
            counted++;
            const t = (b.shown || '').trim();
            if (!t) { clashes.push(`row ${r.row}: #${b.id} shows nothing at all`); continue; }
            if (seen.has(t)) {
                clashes.push(`row ${r.row}: #${b.id} and #${seen.get(t)} both read ${JSON.stringify(t)}`);
            }
            seen.set(t, b.id);
        }
    }
    ok(`‼️ NO TWO BOXES ON A ROW READ THE SAME THING (${counted} boxes)`
        + (clashes.length ? '\n      ' + clashes.slice(0, 6).join('\n      ') : ''),
        clashes.length === 0);

    // ---- and each of the four names its own axis ---------------------------
    const AXES = { 'c-model': 'model', 'c-effort': 'effort', 'c-perm': 'perm', 'c-proj': 'project' };
    const nameless = [];
    let named = 0;
    for (const r of rows) {
        for (const b of r.boxes) {
            const axis = AXES[b.id];
            if (!axis) { continue; }
            named++;
            if (b.labelled) { continue; }
            if ((b.shown || '').indexOf(axis) !== 0) {
                nameless.push(`row ${r.row}: #${b.id} reads ${JSON.stringify(b.shown)} — no "${axis}" in it`);
            }
        }
    }
    ok(`the four unlabelled boxes carry their axis in their own text (${named})`
        + (nameless.length ? '\n      ' + nameless.slice(0, 6).join('\n      ') : ''),
        named > 0 && nameless.length === 0);

    // ---- the hover is a panel, and it answers on its own -------------------
    // ‼️ The value is clipped harder now, so the hover is not a nicety: it is
    // where the whole answer lives. A panel that only repeats the heading is
    // the thing the user asked this NOT to be.
    const thin = [];
    let panels = 0;
    for (const r of rows) {
        for (const b of r.boxes) {
            if (!AXES[b.id] || b.labelled) { continue; }
            panels++;
            const head = (b.head || '').trim();
            const body = (b.body || '').trim();
            if (!head) { thin.push(`row ${r.row}: #${b.id} has no panel heading`); continue; }
            // The heading spells the axis out where the box abbreviates it, and
            // it carries the value — that is what makes the panel answer alone.
            const val = (b.shown || '').replace(/^[^:→]*[:→]\s*/, '').trim();
            if (val && head.indexOf(val) < 0) {
                thin.push(`row ${r.row}: #${b.id} panel says ${JSON.stringify(head)}, box says ${JSON.stringify(b.shown)}`);
            }
            if (!body || body === head) {
                thin.push(`row ${r.row}: #${b.id} panel body adds nothing to its heading`);
            }
        }
    }
    ok(`‼️ EVERY ONE OF THOSE BOXES ANSWERS FROM ITS HOVER ALONE (${panels} panels)`
        + (thin.length ? '\n      ' + thin.slice(0, 6).join('\n      ') : ''),
        panels > 0 && thin.length === 0);

    // …and `permissions` is spelled out where there is room for it, which is the
    // reason the box may abbreviate at all.
    const perm = rows.flatMap(r => r.boxes).find(b => b.id === 'c-perm' && !b.labelled);
    ok('the panel spells out what the box abbreviates (perm → permissions)',
        !!perm && /^permissions\b/.test((perm.head || '').trim()));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
