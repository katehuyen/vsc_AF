/**
 * Guard: A BOX'S HOVER PANEL FOLLOWS THE BOX (MIRROR, as a LIVE rule).
 *
 * What is being defended. MIRROR asks a control too narrow for its own text to
 * put its CURRENT value on the first line of its hover. Every panel in this
 * codebase is written into the markup once, when the page draws itself — so the
 * rule held exactly until somebody used the control. Measured on the Console's
 * new-session row (audit B-03.21, round 2): the box read `xhigh` and the panel
 * under it still said `Effort → Default`. That is worse than no panel, because a
 * reader who has learned to trust the hover is now being told the wrong thing
 * with confidence, and nothing on screen says which of the two is stale.
 *
 * ‼️ THE RULE IS IN THE COMPONENT, SO THIS TEST DRIVES THE COMPONENT. Written
 * per page it would be a promise each page keeps until it is rewritten; and the
 * Console is not the only page with a picker in a tight row. A wrapper opts in
 * by carrying `data-axis-name`, and everything the rebuild needs is already in
 * the markup — which is the second thing measured here: no host round trip, so
 * the panel is right on the same event, not after the repaint.
 *
 *   node test/test_axis_mirror.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

// ---- the smallest DOM the component actually touches ----------------------
function mkEl(tag, cls) {
    const el = {
        tagName: String(tag).toUpperCase(), children: [], parent: null, isConnected: true,
        textContent: '', scrollTop: 0,
        cls: new Set(String(cls || '').split(/\s+/).filter(Boolean)),
        attrs: {}
    };
    el.classList = {
        add: c => el.cls.add(c), remove: c => el.cls.delete(c),
        contains: c => el.cls.has(c),
        toggle: (c, on) => (on ? el.cls.add(c) : el.cls.delete(c))
    };
    el.getAttribute = n => (n in el.attrs ? el.attrs[n] : null);
    el.setAttribute = (n, v) => { el.attrs[n] = String(v); };
    const hits = (node, sel) => String(sel).split(',').some(part =>
        part.trim().split('.').filter(Boolean).every(c => node.cls.has(c)));
    el.matches = sel => hits(el, sel);
    el.closest = sel => {
        for (let n = el; n; n = n.parent) { if (hits(n, sel)) { return n; } }
        return null;
    };
    el.contains = other => {
        for (let n = other; n; n = n.parent) { if (n === el) { return true; } }
        return false;
    };
    el.querySelector = () => null;   // the component walks children, on purpose
    el.append = child => { child.parent = el; el.children.push(child); return child; };
    return el;
}

/** The shape `AFTip.wrap` emits for an axis box, hand-built so the test is not
 *  reading its own markup back: wrapper → [select, panel → [head, body]]. */
function mkBox(axis, std, rows, cur) {
    const w = mkEl('span', 'af-tipw axisw');
    w.setAttribute('data-axis-name', axis);
    w.setAttribute('data-axis-std', std);
    const sel = mkEl('select');
    sel.options = rows.map(r => {
        const o = mkEl('option');
        o.text = r.label;
        o.value = r.id;
        o.setAttribute('data-why', r.detail || '');
        return o;
    });
    Object.defineProperty(sel, 'selectedIndex', {
        get: () => sel.options.findIndex(o => o.value === sel.value)
    });
    sel.value = cur;
    w.append(sel);
    const p = w.append(mkEl('span', 'af-tip'));
    const head = p.append(mkEl('span', 'af-tiph'));
    const body = p.append(mkEl('span', 'af-tipb'));
    return { w, sel, head, body };
}

const listeners = {};
const documentStub = {
    documentElement: mkEl('div', 'root'),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    elementFromPoint: () => null
};
const fire = (ev, e) => (listeners[ev] || []).forEach(fn => fn(e));
class MO { constructor(cb) { this.cb = cb; } observe() { } }

const windowStub = { getComputedStyle: () => ({ visibility: 'hidden' }) };
const src = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'afTip.js'), 'utf8');
new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame',
    'setTimeout', 'clearTimeout', src)(
        windowStub, documentStub, MO, fn => fn(), () => 0, () => { });

const AFTip = windowStub.AFTip;
ok('the component exports the live half of MIRROR',
    typeof AFTip.set === 'function' && typeof AFTip.syncAxis === 'function');

// ‼️ IT LISTENS FOR ITSELF. A page that has to remember to call `syncAxis` is a
// page that will forget on the next box it adds — which is the whole reason
// this moved out of console.js.
ok('‼️ and it binds the one event that can change a box, once',
    (listeners.change || []).length === 1);

const EFFORT = [
    { id: '', label: 'Default', detail: 'whatever the engine already does' },
    { id: 'high', label: 'high', detail: 'thinks longer before it answers' },
    { id: 'xhigh', label: 'xhigh', detail: 'the most thinking this model will do' }
];
const STD = 'How hard the model thinks before it answers.';

// ---- the bug: the panel is about the value the page was drawn with ---------
{
    const b = mkBox('Effort', STD, EFFORT, '');
    fire('change', { target: b.sel });
    ok('a box on its default reads "axis → value": the arrow is what the engine resolves to',
        b.head.textContent === 'Effort → Default');

    b.sel.value = 'xhigh';
    fire('change', { target: b.sel });
    ok('‼️ THE PANEL FOLLOWS THE BOX — changing the value rewrites the heading',
        b.head.textContent === 'Effort: xhigh');
    ok('…and the separator changes with it: a named value was CHOSEN, not resolved',
        b.head.textContent.indexOf(':') > 0 && b.head.textContent.indexOf('→') < 0);
    ok('…and the body carries the chosen row\'s own line, then the standing one',
        b.body.textContent.indexOf('the most thinking this model will do') === 0
        && b.body.textContent.indexOf(STD) > 0);
    // MIRROR asks for a blank line between the two, and `lines()` drops `''` —
    // so the gap has to be the component's own marker or it never reaches the
    // screen (audit A-12.9).
    ok('…separated by a real blank line, not a swallowed empty string',
        /\n\s*\n/.test(b.body.textContent));

    b.sel.value = 'high';
    fire('change', { target: b.sel });
    ok('a second change is not a one-off: it follows again',
        b.head.textContent === 'Effort: high'
        && b.body.textContent.indexOf('thinks longer before it answers') === 0);
}

// ---- a row with nothing of its own says the standing sentence alone --------
{
    const b = mkBox('Perm', STD, [{ id: 'plan', label: 'plan' }], 'plan');
    fire('change', { target: b.sel });
    ok('a row with no line of its own does not open a blank first paragraph',
        b.head.textContent === 'Perm: plan' && b.body.textContent === STD);
}

// ---- and a box that never opted in is left alone ---------------------------
{
    const b = mkBox('Effort', STD, EFFORT, 'high');
    b.attrs = {};
    b.w.setAttribute('data-axis-name', '');
    b.head.textContent = 'something the page wrote itself';
    fire('change', { target: b.sel });
    ok('a wrapper with no axis on it is not rewritten — pages may hover a select for other reasons',
        b.head.textContent === 'something the page wrote itself');
}

// ---- the panel that is written is the wrapper's OWN -----------------------
// A trigger may itself contain a wrapper (a hover inside a hover), and a
// `querySelector` from the outer one would reach in and rewrite the inner
// panel — the reader would then see the right words in the wrong place.
{
    const b = mkBox('Effort', STD, EFFORT, 'high');
    const innerW = b.sel.parent === b.w ? mkEl('span', 'af-tipw') : null;
    const inner = mkEl('span', 'af-tip');
    const innerHead = mkEl('span', 'af-tiph');
    innerHead.textContent = 'inner';
    inner.parent = innerW; innerW.children.push(inner);
    inner.children.push(innerHead); innerHead.parent = inner;
    // slipped in FRONT of the real panel, where a document-order search hits it first
    innerW.parent = b.w; b.w.children.unshift(innerW);
    b.sel.value = 'xhigh';
    fire('change', { target: b.sel });
    ok('‼️ a nested panel is not mistaken for this box\'s own',
        innerHead.textContent === 'inner' && b.head.textContent === 'Effort: xhigh');
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
