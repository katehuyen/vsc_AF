/**
 * Guard: EVERY BOX ON A CONTROL ROW NAMES ITS AXIS — WITHOUT EATING ITS VALUE.
 *
 * The history matters, because this is round 2 and round 1 made it worse.
 *
 * ROUND 1 (audit B-03.21). The row that STARTS a session drew three boxes in a
 * row reading nothing but `Default`, so which was model, which was effort and
 * which was permissions was answerable only by hover. The repair put the axis
 * INSIDE every option — `effort → Default`, `perm → Default`.
 *
 * ROUND 2, measured on dist/render/console.s9.png. These boxes are ~100px wide,
 * so what a prefix buys is that the part which never changes is the part that
 * survives the clipping: the row drew `model → Defa`, `effort → Def`, `perm →
 * De`, and `xhigh` no longer showed even its first letter — which it had before
 * round 1. The value is the half a reader is looking for and it was the half
 * that was thrown away. A `<label>` beside the box is the same theft of width
 * by another route, which is why round 1 refused it and why this does too.
 *
 * ‼️ THE REPAIR THAT COSTS THE VALUE NOTHING: a native `<optgroup>` label is a
 * heading the browser draws at the TOP of the OPEN list and refuses to let
 * anybody select. The axis is named exactly where somebody is choosing, once,
 * and the collapsed box goes back to being all value. While the list is SHUT
 * the axis is answered by the hover — see test_axis_mirror.js, which measures
 * that the panel keeps up with the box.
 *
 * ‼️ AND THE ROW HAS ONE SHAPE, NOT THREE. Round 1 left four boxes with an
 * AFTip panel and five with a native `title`, three of those with a `<span>`
 * label beside them. A row where the same question is answered three ways is
 * not a design; it is three unfinished ones.
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

    // Every control row the page draws — the one that STARTS a session (it has
    // the engine picker) and the one a RUNNING card wears. Both are the same
    // row of the same kind of box, and round 1 treated them as two.
    const expr = "(function(){var out=[];"
        + "[].slice.call(document.querySelectorAll('.crow')).forEach(function(r,i){"
        + "var boxes=[];"
        + "[].slice.call(r.querySelectorAll('select')).forEach(function(s){"
        + "var w=s.closest('.af-tipw');"
        + "var h=w?w.querySelector('.af-tiph'):null;"
        + "var b=w?w.querySelector('.af-tipb'):null;"
        + "var g=[].slice.call(s.querySelectorAll('optgroup')).map(function(x){return x.label;});"
        + "var bare=[].slice.call(s.children).filter(function(x){return x.tagName==='OPTION';}).length;"
        + "boxes.push({id:s.id,shown:((s.options[s.selectedIndex]||{}).text||''),"
        + "groups:g,bare:bare,title:s.getAttribute('title')||'',"
        + "lbl:!!(s.closest('label')),axis:w?(w.getAttribute('data-axis-name')||''):'',"
        + "head:h?h.textContent:'',body:b?b.textContent:'',"
        + "why:[].slice.call(s.options).filter(function(o){return o.getAttribute('data-why')!==null;}).length,"
        + "opts:s.options.length});});"
        + "if(boxes.length){out.push({row:i,boxes:boxes});}});return out;})()";
    const raw = node([path.join('test', 'measure_page.js'), 'console', expr]);
    let rows = [];
    try { rows = JSON.parse(raw.slice(raw.indexOf('['))); } catch { rows = []; }

    const all = rows.flatMap(r => r.boxes.map(b => Object.assign({ row: r.row }, b)));
    ok(`the page drew control rows with boxes on them (${rows.length} rows, ${all.length} boxes)`,
        rows.length > 0 && all.length > 0);

    const say = (list) => list.length ? '\n      ' + list.slice(0, 6).join('\n      ') : '';

    // ---- 1. the axis is the LIST's heading --------------------------------
    /**
     * ‼️ THE RULE IS "EVERY HEADING NAMES THE AXIS", NOT "THERE IS EXACTLY ONE".
     *
     * Counting to one was the right guard while every box had one flat list, and
     * X-305 is the case it could not express: the account box offers two KINDS
     * of answer — rules, re-decided at every launch, and slots, which are not —
     * and a flat list makes them look like the same choice. So it draws two
     * headings, and each one still opens with `Account`, which is the whole of
     * what B-03.21 asked for: these boxes are ~110px, the axis is printed
     * nowhere beside them, and the list's heading is the only thing that answers
     * "which box is this?". A box that grouped without naming the axis would
     * break the rule; one that names it twice does not.
     */
    // ‼️ The heading is the axis in its SHORT form (`Perm` for `Permissions`),
    // so it is not compared against `data-axis-name`. What is held is that every
    // heading on one box opens on the SAME word — the axis — and that a box
    // which groups says the axis in each group rather than once and then not.
    const root = (g) => String(g || '').split(' · ')[0].trim();
    const headless = all.filter(b => !b.groups.length
        || b.groups.some(g => !root(g))
        || new Set(b.groups.map(root)).size !== 1)
        .map(b => `row ${b.row}: #${b.id} headings [${b.groups.join(' | ')}]`);
    ok(`‼️ EVERY BOX NAMES ITS AXIS AS THE HEADING OF ITS OWN LIST (${all.length})${say(headless)}`,
        all.length > 0 && headless.length === 0);
    const loose = all.filter(b => b.bare > 0)
        .map(b => `row ${b.row}: #${b.id} has ${b.bare} options outside the heading`);
    ok(`…and no option escapes it, which would draw a second, nameless group${say(loose)}`,
        loose.length === 0);

    // ---- 2. and it is NOT in front of the value ---------------------------
    // The axis word, in any of the forms a prefix takes, at the START of what
    // the box reads. This is the round-1 shape and it is what must not return.
    const eaten = all.filter(b => {
        const axis = String(b.groups[0] || '').trim();
        return axis && new RegExp('^' + axis + '\\s*[:→>-]', 'i').test(String(b.shown || '').trim());
    }).map(b => `row ${b.row}: #${b.id} reads ${JSON.stringify(b.shown)} — its axis is eating its value`);
    ok(`‼️ AND NO BOX SPENDS ITS OWN WIDTH SAYING WHAT IT IS${say(eaten)}`, eaten.length === 0);
    const labelled = all.filter(b => b.lbl)
        .map(b => `row ${b.row}: #${b.id} sits in a <label>, which takes the same width`);
    ok(`…and none of them wears a label beside it either${say(labelled)}`, labelled.length === 0);

    // ---- 3. one shape for the whole row -----------------------------------
    const mixed = all.filter(b => !b.axis)
        .map(b => `row ${b.row}: #${b.id} is not an axis box — it answers some other way`);
    ok(`‼️ ONE SHAPE FOR EVERY BOX ON THE ROW: all of them are axis boxes${say(mixed)}`,
        mixed.length === 0);
    const native = all.filter(b => b.title.trim())
        .map(b => `row ${b.row}: #${b.id} still carries a native title="${b.title.slice(0, 40)}"`);
    ok(`…and none of them keeps a native tooltip beside its panel${say(native)}`, native.length === 0);

    // ---- 4. the hover answers on its own ----------------------------------
    // ‼️ The box says the value and the list says the axis; only the hover says
    // BOTH while the list is shut, which is the state it is in all the time.
    const thin = [];
    for (const b of all) {
        const head = (b.head || '').trim();
        const body = (b.body || '').trim();
        if (!head) { thin.push(`row ${b.row}: #${b.id} has no panel heading`); continue; }
        if (head.indexOf(b.axis) !== 0) {
            thin.push(`row ${b.row}: #${b.id} panel opens ${JSON.stringify(head)}, not with its axis`);
        }
        const shown = (b.shown || '').trim();
        if (shown && head.indexOf(shown) < 0) {
            thin.push(`row ${b.row}: #${b.id} panel says ${JSON.stringify(head)}, box says ${JSON.stringify(shown)}`);
        }
        if (!body || body === head) {
            thin.push(`row ${b.row}: #${b.id} panel body adds nothing to its heading`);
        }
    }
    ok(`‼️ EVERY BOX ANSWERS FROM ITS HOVER ALONE — axis, value, then why (${all.length})${say(thin)}`,
        thin.length === 0);

    // …and the panel spells out what the heading abbreviates, which is the only
    // reason a heading over a ~100px column may abbreviate at all.
    const perm = all.find(b => b.id === 'c-perm');
    ok('the panel spells out what the list abbreviates (Perm → Permissions)',
        !!perm && perm.groups[0] === 'Perm' && /^Permissions\b/.test((perm.head || '').trim()));

    // ---- 5. and the rebuild has what it needs -----------------------------
    // MIRROR is live (test_axis_mirror.js), and it rebuilds from the markup
    // rather than from the host. A box whose options carry no `data-why` would
    // silently lose its first paragraph the moment somebody used it.
    const mute = all.filter(b => b.why !== b.opts)
        .map(b => `row ${b.row}: #${b.id} — ${b.opts - b.why} of ${b.opts} options carry no data-why`);
    ok(`…and every option carries the line the panel will need when it is chosen${say(mute)}`,
        mute.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
