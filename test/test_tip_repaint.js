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

// U-57 gave the component a grace period on the way OUT, which is a duration —
// so the clock is the test's, not the machine's. A test that slept 340ms to see
// a timeout fire would be a test nobody runs.
const timers = new Map();
let timerSeq = 0;
const setTimeoutStub = (fn) => { timers.set(++timerSeq, fn); return timerSeq; };
const clearTimeoutStub = id => { timers.delete(id); };
const runTimers = () => {
    const due = Array.from(timers.values());
    timers.clear();
    due.forEach(fn => fn());
};

const windowStub = {};
const src = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'afTip.js'), 'utf8');
new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame',
    'setTimeout', 'clearTimeout', src)(
        windowStub, documentStub, MO, fn => fn(),     // run the frame at once: a
        setTimeoutStub, clearTimeoutStub);            // test must not wait on paint

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
    runTimers();
    const seven = mkTip();
    six.w.isConnected = false;
    at[key(70, 70)] = seven.w;
    repaint();
    ok('a wrapper the pointer had already left is not reopened by a repaint',
        !seven.w.classList.contains('af-on'));
}

// ---- U-57: the walk from the trigger INTO the panel ------------------------
// The complaint, verbatim: "it is a scrollable tooltip but I cannot get to it
// with the mouse, it closes at once." True wherever the panel does not touch its
// trigger — which is every `tip-block` row, i.e. exactly the rows with enough to
// say to need scrolling. Closing was instant, so the crossing was fatal.
{
    at = {};
    const a = mkTip();
    at[key(90, 90)] = a.w;
    fire('pointerover', { target: a.w, clientX: 90, clientY: 90 });
    fire('pointerout', { target: a.w, relatedTarget: null });
    ok('‼️ leaving a wrapper HOLDS the panel open instead of closing it',
        a.w.classList.contains('af-hold'));

    // …and arriving inside it — the panel is a child of the wrapper — is the
    // reader getting there, so the timer must not fire behind them.
    fire('pointerover', { target: a.t, clientX: 95, clientY: 140 });
    ok('…reaching the panel cancels the hold rather than closing under the pointer',
        !a.w.classList.contains('af-hold'));
    runTimers();
    ok('…and the cancelled timer cannot come back to close it', !a.w.classList.contains('af-hold'));

    // A hold is a grace period, not a second state: nothing arrives, it ends.
    const b = mkTip();
    at[key(120, 120)] = b.w;
    fire('pointerover', { target: b.w, clientX: 120, clientY: 120 });
    fire('pointerout', { target: b.w, relatedTarget: null });
    ok('a panel nobody walked into is still held for the length of the walk',
        b.w.classList.contains('af-hold'));
    runTimers();
    ok('‼️ …and then it closes — a hold that outlived the gesture would follow you around',
        !b.w.classList.contains('af-hold'));

    // Two panels open at once is the failure this guards against: moving from
    // one row to the next must not leave the first one hanging over the second.
    const c = mkTip(), e = mkTip();
    at[key(150, 150)] = c.w; at[key(180, 180)] = e.w;
    fire('pointerover', { target: c.w, clientX: 150, clientY: 150 });
    fire('pointerout', { target: c.w, relatedTarget: null });
    fire('pointerover', { target: e.w, clientX: 180, clientY: 180 });
    ok('‼️ moving to another row closes the one you left AT ONCE — never two panels',
        !c.w.classList.contains('af-hold') && !e.w.classList.contains('af-hold'));

    // tip-free runs its own open/close timers (U-43); a second set here would
    // fight them.
    const f = mkTip();
    f.w.cls.add('tip-free');
    at[key(210, 210)] = f.w;
    fire('pointerover', { target: f.w, clientX: 210, clientY: 210 });
    fire('pointerout', { target: f.w, relatedTarget: null });
    ok('a tip-free panel is left to its own placer and its own timers',
        !f.w.classList.contains('af-hold'));
    timers.clear();
}

// ---- K-18: it opens towards the middle, never towards the edge -------------
// The bug the user reported: the composer's `?` sits a few pixels off the
// BOTTOM of the window and its panel opened downwards, so nearly all of it was
// outside the viewport. The rule is the component's — a page should not have to
// know where it happens to be on screen — so it is driven here directly.
{
    // a 1000×800 window, and a panel 300 tall × 400 wide
    documentStub.documentElement.clientWidth = 1000;
    documentStub.documentElement.clientHeight = 800;

    /** A wrapper whose trigger sits at the given rect, with a panel of a known
     *  size. `offsetParent` is left unset, so the wrapper IS the anchor —
     *  exactly what a plain `position:relative` wrapper gives. */
    const mkAt = (left, top, w, h, cls) => {
        const t = mkTip();
        if (cls) { cls.split(/\s+/).forEach(c => t.w.cls.add(c)); }
        t.w.getBoundingClientRect = () => ({ left: left, top: top, right: left + w, bottom: top + h });
        t.t.getBoundingClientRect = () => ({});
        t.t.offsetHeight = 300;
        t.t.offsetWidth = 400;
        return t;
    };
    const hover = t => { at = {}; at[key(1, 1)] = t.w; fire('pointerover', { target: t.w, clientX: 1, clientY: 1 }); };

    const low = mkAt(40, 770, 14, 14);          // the composer's `?`: 16px of room under it
    hover(low);
    ok('‼️ a trigger against the bottom edge opens its panel UPWARDS',
        low.w.classList.contains('af-up'));

    const high = mkAt(40, 60, 14, 14);
    hover(high);
    ok('…and one with room under it is left alone', !high.w.classList.contains('af-up'));

    const right = mkAt(940, 300, 40, 14);       // 20px of room to its right
    hover(right);
    ok('‼️ a trigger against the right edge opens back across the row',
        right.w.classList.contains('af-left'));

    const mid = mkAt(100, 300, 40, 14);
    hover(mid);
    ok('…and one with room to its right is left alone', !mid.w.classList.contains('af-left'));

    // The page's own placement rules are statements about a LAYOUT; the flip is
    // a statement about the window. The window never overrules the layout.
    const declared = mkAt(940, 300, 40, 14, 'tip-right');
    hover(declared);
    ok('a page that already said tip-right is not argued with',
        !declared.w.classList.contains('af-left'));
    const block = mkAt(940, 300, 40, 14, 'tip-block');
    hover(block);
    ok('…nor is tip-block, whose panel is the block\'s width anyway',
        !block.w.classList.contains('af-left'));
    const blockLow = mkAt(40, 770, 14, 14, 'tip-block');
    hover(blockLow);
    ok('…but a tip-block near the bottom still flips upwards — that edge is nobody\'s layout',
        blockLow.w.classList.contains('af-up'));

    // tip-free is placed in full by the component's own placer (U-43); a class
    // that moves it as well would fight those numbers.
    const free = mkAt(40, 770, 14, 14, 'tip-free');
    hover(free);
    ok('a tip-free panel is left to its placer', !free.w.classList.contains('af-up'));

    // A decision has to be re-taken when the row is replaced under a still
    // pointer — the new node need not be where the old one was.
    const wasLow = mkAt(40, 770, 14, 14);
    at = {}; at[key(5, 5)] = wasLow.w;
    fire('pointerover', { target: wasLow.w, clientX: 5, clientY: 5 });
    const nowHigh = mkAt(40, 60, 14, 14);
    wasLow.w.isConnected = false;
    at[key(5, 5)] = nowHigh.w;
    repaint();
    ok('a repaint re-measures rather than inheriting the old side',
        nowHigh.w.classList.contains('af-on') && !nowHigh.w.classList.contains('af-up'));

    // ---- A-12: the flip still decides, on a panel that has no box yet --------
    // A CLOSED panel is clamped to nothing in the sheet (see the CSS block
    // below), so whether it has measurable size when the pointer arrives is an
    // ordering question about `:hover` and the pointer event — and if the answer
    // ever came back "not yet", the flip would silently stop rather than fail.
    // The component gives it a box for the length of the measurement instead.
    {
        const shy = mkAt(940, 300, 40, 14);
        let measuredW = 0, measuredH = 0;
        Object.defineProperty(shy.t, 'offsetWidth', {
            get() { return shy.w.classList.contains('af-measure') ? (measuredW = 400) : 0; }
        });
        Object.defineProperty(shy.t, 'offsetHeight', {
            get() { return shy.w.classList.contains('af-measure') ? (measuredH = 300) : 0; }
        });
        hover(shy);
        ok('‼️ A-12 — a panel with no box yet is given one for the measurement',
            measuredW === 400 && measuredH === 300);
        ok('…so the edge flip still happens', shy.w.classList.contains('af-left'));
        ok('‼️ …and the box is handed straight back — it is a measurement, not a state',
            !shy.w.classList.contains('af-measure'));
    }

    documentStub.documentElement.clientWidth = undefined;
    documentStub.documentElement.clientHeight = undefined;
}

// ---- the CSS half: the class has to mean something -------------------------
{
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'common.css'), 'utf8');
    ok('common.css honours the stand-in class',
        /\.af-tipw\.af-on\s*>\s*\.af-tip\s*\{[^}]*visibility:\s*visible/.test(css));
    ok('…with no delay — it is already open, and fading it in twice is a blink',
        /\.af-tipw\.af-on\s*>\s*\.af-tip\s*\{[^}]*transition-delay:\s*0s/.test(css));
    // K-18: the classes the script writes have to mean something in the sheet,
    // and they have to come after the page-declared ones they may override.
    ok('‼️ …and the flip classes, which are what K-18 is',
        /\.af-tipw\.af-up\s*>\s*\.af-tip\s*\{[^}]*bottom:\s*100%/.test(css)
        && /\.af-tipw\.af-left\s*>\s*\.af-tip\s*\{[^}]*right:\s*0/.test(css));
    ok('…declared after tip-block, so the flip is the last word on its edge',
        css.indexOf('.af-tipw.af-up') > css.indexOf('.af-tipw.tip-block'));

    // ‼️ A-12 — THE PAGE IS NOT MADE WIDER BY THINGS THAT ARE NOT DRAWN.
    // `visibility: hidden` hides a box; it does not take it out of layout, and
    // an absolutely positioned box nothing clips grows the DOCUMENT's scroll
    // width. Measured on the Search page at an 884px window before this rule:
    // scrollWidth 1384 — 500px of empty page, scrollable, containing six
    // invisible tooltips and nothing else.
    const closed = /\.af-tipw:not\(:hover\)[^{]*>\s*\.af-tip\s*\{([^}]*)\}/.exec(css);
    ok('‼️ A-12 — a closed panel is clamped to no box at all', !!closed);
    ok('‼️ …including min-width, which BEATS max-width and would leave 280px standing',
        !!closed && /min-width:\s*0/.test(closed[1]) && /max-width:\s*0/.test(closed[1]));
    ok('…and it opens again for every state the component calls open',
        !!closed && ['af-open', 'af-on', 'af-hold', 'af-measure', ':hover']
            .every(s => closed[0].includes(s)));
    // U-57 — the grace period is worth nothing if the sheet still collapses the
    // box the moment `:hover` goes.
    ok('‼️ U-57 — common.css keeps a held panel visible while the pointer walks to it',
        /\.af-tipw\.af-hold\s*>\s*\.af-tip\s*\{[^}]*visibility:\s*visible/.test(css));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
