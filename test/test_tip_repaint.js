// The rich hover panel (media/afTip.js) has to survive a REPAINT under a
// stationary pointer.
//
// What is being defended: the pages this component lives on redraw whole
// sections on the host's own beat, and a browser does not put `:hover` back on
// the node that replaced the one the pointer was on until the pointer moves
// again. Without the stand-in class, a panel somebody was three lines into
// reading closed by itself and did not come back — with the mouse never having
// left it. Every surface that uses the component had it, which is why the fix
// is in the component and why this test drives the component directly.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- the smallest DOM the component actually touches ----------------------
function mkEl(cls) {
    const el = {
        children: [], parent: null, isConnected: true, scrollTop: 0,
        cls: new Set(String(cls || '').split(/\s+/).filter(Boolean))
    };
    el.classList = {
        add: c => el.cls.add(c),
        remove: c => el.cls.delete(c),
        contains: c => el.cls.has(c)
    };
    el.closest = sel => {
        const want = sel.replace(/^\./, '');
        for (let n = el; n; n = n.parent) { if (n.cls.has(want)) { return n; } }
        return null;
    };
    el.contains = other => {
        for (let n = other; n; n = n.parent) { if (n === el) { return true; } }
        return false;
    };
    el.querySelector = sel => {
        const want = sel.replace(/^\./, '');
        const walk = n => {
            for (const c of n.children) {
                if (c.cls.has(want)) { return c; }
                const d = walk(c);
                if (d) { return d; }
            }
            return null;
        };
        return walk(el);
    };
    return el;
}

/** A wrapper with its panel inside it, the shape `AFTip.cell`/`wrap` produce. */
function mkTip() {
    const w = mkEl('af-tipw');
    const t = mkEl('af-tip');
    t.parent = w;
    w.children.push(t);
    return { w: w, t: t };
}

const listeners = {};
let at = {};                       // "what is at this point" — the test says so
const observers = [];
const key = (x, y) => x + ',' + y;

const documentStub = {
    documentElement: mkEl('root'),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    elementFromPoint: (x, y) => at[key(x, y)] || null
};
const fire = (ev, e) => (listeners[ev] || []).forEach(fn => fn(e));

class MO {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() { }
}
const repaint = () => observers.forEach(o => o.cb());

const windowStub = {};
const src = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'afTip.js'), 'utf8');
new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame', src)(
    windowStub, documentStub, MO, fn => fn()          // run the frame at once: a
);                                                    // test must not wait on paint

ok('the component still exports its two shapes',
    typeof windowStub.AFTip.wrap === 'function' && typeof windowStub.AFTip.cell === 'function');
// ‼️ TWO `pointerover` listeners, and they are two different mechanisms: the
// repaint bridge below, and the `tip-free` placer (U-43) that takes a panel out
// of a scrolling menu. Counted rather than ignored so a THIRD one cannot appear
// unnoticed — this file is the only thing watching what the component binds.
ok('and it installed the pointer bridge rather than trusting :hover alone',
    (listeners.pointerover || []).length === 2 && (listeners.pointermove || []).length === 1
    && (listeners.pointerout || []).length === 1 && observers.length === 1);

// ---- the bug: a repaint under a stationary pointer -------------------------
{
    const one = mkTip();
    at[key(10, 10)] = one.w;
    fire('pointerover', { target: one.w, clientX: 10, clientY: 10 });
    // the reader had scrolled a long prompt
    one.t.scrollTop = 120;
    fire('scroll', { target: one.t });

    // the host resends the pool: the whole section is rebuilt in place
    const two = mkTip();
    one.w.isConnected = false;
    at[key(10, 10)] = two.w;
    repaint();

    ok('‼️ the panel is put back on the node that replaced the one you were on',
        two.w.classList.contains('af-on'));
    ok('…and it opens where you had scrolled to, not back at the first line',
        two.t.scrollTop === 120);
    ok('the dead wrapper is not carrying the class into nothing',
        !one.w.classList.contains('af-on'));
}

// ---- and it lasts exactly until the pointer moves off ----------------------
{
    const three = mkTip();
    at = {};
    at[key(30, 30)] = three.w;
    fire('pointerover', { target: three.w, clientX: 30, clientY: 30 });
    const four = mkTip();
    three.w.isConnected = false;
    at[key(30, 30)] = four.w;
    repaint();
    ok('the stand-in is on', four.w.classList.contains('af-on'));

    // moving WITHIN the same wrapper hands over to a real :hover, silently
    fire('pointermove', { clientX: 30, clientY: 30 });
    ok('a move onto the same wrapper drops the stand-in — :hover is honest again',
        !four.w.classList.contains('af-on'));
}

// ---- a repaint with nothing open must not open anything --------------------
{
    const five = mkTip();
    at = {};
    at[key(50, 50)] = five.w;
    repaint();
    ok('‼️ a repaint nobody was hovering opens no panel',
        !five.w.classList.contains('af-on'));
}

// ---- leaving the wrapper closes it the ordinary way ------------------------
{
    const six = mkTip();
    at = {};
    at[key(70, 70)] = six.w;
    fire('pointerover', { target: six.w, clientX: 70, clientY: 70 });
    fire('pointerout', { target: six.w, relatedTarget: null });
    const seven = mkTip();
    six.w.isConnected = false;
    at[key(70, 70)] = seven.w;
    repaint();
    ok('a wrapper the pointer had already left is not reopened by a repaint',
        !seven.w.classList.contains('af-on'));
}

// ---- the CSS half: the class has to mean something -------------------------
{
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'common.css'), 'utf8');
    ok('common.css honours the stand-in class',
        /\.af-tipw\.af-on\s*>\s*\.af-tip\s*\{[^}]*visibility:\s*visible/.test(css));
    ok('…with no delay — it is already open, and fading it in twice is a blink',
        /\.af-tipw\.af-on\s*>\s*\.af-tip\s*\{[^}]*transition-delay:\s*0s/.test(css));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
