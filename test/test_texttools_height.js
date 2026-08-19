// K-9 — the dragged height of a text box, measured rather than asserted as
// source. The real `AFTextTools.keepHeight` runs here against a DOM small
// enough to say exactly what happened.
//
// ‼️ WHY THIS FILE EXISTS. K-9 was closed once and came back, because what was
// checked was that the code SAID it restored the height — and the fault was in
// the arrangement, not the wording. Three things it now has to prove:
//
//   * the height goes on the DOCUMENT ROOT, so a page that rewrites its whole
//     markup cannot lose it and nothing has to remember to put it back;
//   * it is CLAMPED on the way in AND on the way out, which is the half that
//     was missing: the number goes back into storage, so one figure let through
//     above the ceiling is read back as the new normal — that is the box that
//     came back taller every time it snapped back, until it covered the page;
//   * stop() really stops, because an observer left on a box that no longer
//     exists writes the height THAT box had into the same slot.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** A style map that behaves like the one on an element. */
function styleBag() {
    const map = {};
    return {
        map,
        setProperty: (k, v) => { map[k] = v; },
        removeProperty: k => { delete map[k]; },
        getPropertyValue: k => map[k]
    };
}

/** The smallest DOM keepHeight can be run in, plus a hand-driven observer. */
function sandbox() {
    const observers = [];
    const root = { style: styleBag() };
    const win = {
        innerHeight: 1000,
        listeners: {},
        addEventListener: (t, fn) => { (win.listeners[t] = win.listeners[t] || []).push(fn); },
        removeEventListener: (t, fn) => {
            const l = win.listeners[t] || [];
            const i = l.indexOf(fn);
            if (i >= 0) { l.splice(i, 1); }
        },
        fire: t => (win.listeners[t] || []).slice().forEach(fn => fn())
    };
    class RO {
        constructor(fn) { this.fn = fn; this.targets = []; observers.push(this); }
        observe(el) { this.targets.push(el); }
        disconnect() { this.targets = []; this.dead = true; }
    }
    const ctx = {
        window: win, document: { documentElement: root }, ResizeObserver: RO,
        console
    };
    ctx.window.document = ctx.document;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../media/afTextTools.js'), 'utf8'), ctx);
    // The page script talks to these two globals, not to the context object.
    ctx.ResizeObserver = RO;
    return {
        ctx, root, win, observers,
        keep: o => ctx.window.AFTextTools.keepHeight(o),
        box: () => ({ style: { height: '' } }),
        /** A grab bar: listens, forgets, and reports what it was pointed at. */
        handle: () => {
            const l = {};
            return {
                addEventListener: (t, fn) => { (l[t] = l[t] || []).push(fn); },
                removeEventListener: (t, fn) => {
                    const a = l[t] || [];
                    const i = a.indexOf(fn);
                    if (i >= 0) { a.splice(i, 1); }
                },
                setPointerCapture: () => { /* the real one keeps moves coming */ },
                releasePointerCapture: () => { /* … and this gives them back */ },
                fire: (t, ev) => (l[t] || []).slice().forEach(fn => fn(ev || {}))
            };
        },
        /** what a real resize handle does, then what the browser does after it */
        drag: (el, px) => { el.style.height = px + 'px'; observers.forEach(o => { if (!o.dead && o.targets.indexOf(el) >= 0) { o.fn(); } }); }
    };
}

const varOf = s => s.root.style.map['--af-boxh'];

// ---- the height is on the root, where a rebuild cannot reach it -------------
{
    const s = sandbox();
    let stored = 0;
    const el = s.box();
    s.keep({ el, varName: '--af-boxh', min: 64, read: () => stored, write: px => { stored = px; } });
    ok('‼️ a box that was never dragged sets no height at all — the css min-height stands',
        varOf(s) === undefined);

    s.drag(el, 240);
    ok('a drag is recorded as a number, not a css length', stored === 240);
    ok('‼️ …and published on the DOCUMENT ROOT, which no page rebuild rewrites',
        varOf(s) === '240px');

    // The rebuild: the element is thrown away and a new one made. Nothing is
    // restored — the property is still there, so the new box is born its size.
    const el2 = s.box();
    ok('‼️ the height survives a rebuild without anybody putting it back',
        varOf(s) === '240px' && el2.style.height === '');
}

// ---- the ceiling is enforced where the number is STORED ---------------------
{
    const s = sandbox();               // innerHeight 1000 → ceiling 700
    let stored = 0;
    const el = s.box();
    s.keep({ el, varName: '--af-boxh', min: 64, read: () => stored, write: px => { stored = px; } });

    s.drag(el, 4000);
    ok('‼️ a drag past the ceiling is stored AT the ceiling, not above it',
        stored === 700 && varOf(s) === '700px');
    // This is the reopened bug in one line: a figure above the ceiling that
    // reaches storage is read back as the new normal on the next pass.
    s.drag(el, 4000);
    ok('‼️ …and a second one cannot raise it — the box stops creeping', stored === 700);

    s.drag(el, 10);
    ok('a drag below the floor is stored at the floor', stored === 64 && varOf(s) === '64px');
}

// ---- a value already in storage is clamped on the way OUT too --------------
{
    const s = sandbox();
    let stored = 5000;                 // written by an older build, before K-9
    const el = s.box();
    s.keep({ el, varName: '--af-boxh', min: 64, read: () => stored, write: px => { stored = px; } });
    ok('‼️ a stored figure from before the ceiling existed is drawn clamped',
        varOf(s) === '700px');

    // A smaller window lowers the ceiling; the box follows it down and the
    // number the user chose is kept, so widening the window gives it back.
    s.win.innerHeight = 400;
    s.win.fire('resize');
    ok('a narrower window lowers the box with it', varOf(s) === '280px');
    s.win.innerHeight = 1000;
    s.win.fire('resize');
    ok('…and widening it gives the dragged height back', varOf(s) === '700px');
}

// ---- only a DRAG is a choice ------------------------------------------------
{
    const s = sandbox();
    let stored = 0, writes = 0;
    const el = s.box();
    s.keep({ el, varName: '--af-boxh', min: 64, read: () => stored, write: px => { stored = px; writes++; } });
    // A re-layout changes the RENDERED height and leaves the inline one alone.
    s.observers.forEach(o => o.fn());
    ok('‼️ a re-layout is not a drag and is never stored', writes === 0 && stored === 0);
    s.drag(el, 300);
    s.drag(el, 300);
    ok('…and the same height is not written twice', writes === 1);
}

// ---- stop() stops -----------------------------------------------------------
{
    const s = sandbox();
    let stored = 0;
    const el = s.box();
    const stop = s.keep({ el, varName: '--af-boxh', min: 64, read: () => stored, write: px => { stored = px; } });
    s.drag(el, 300);
    stop();
    // The dead box still carries the height it had. If its observer were still
    // alive, this is the moment that height comes back on its own.
    s.drag(el, 900);
    ok('‼️ a stopped keeper writes nothing more, so a dead box cannot resize a live one',
        stored === 300);
    ok('…and it lets go of the window too',
        (s.win.listeners.resize || []).length === 0);
}

// ---- both boxes that have this ask for it, and neither has its own copy -----
{
    const console_ = fs.readFileSync(path.resolve(__dirname, '../media/console.js'), 'utf8');
    const projects = fs.readFileSync(path.resolve(__dirname, '../media/projects.js'), 'utf8');
    ok('‼️ the console composer and the capture box share ONE answer to "how tall"',
        /AFTextTools\.keepHeight\(/.test(console_) && /AFTextTools\.keepHeight\(/.test(projects));
    ok('…and neither keeps a ResizeObserver of its own for the height any more',
        !/new ResizeObserver\(\(\) => \{\s*\n\s*const h = \w+\.style\.height;/.test(console_)
        && !/new ResizeObserver\(\(\) => \{\s*\n\s*const h = \w+\.style\.height;/.test(projects));
    ok('…and each states its ceiling in css as well, so the two cannot disagree',
        /max-height:70vh/.test(console_) && /max-height:70vh/.test(projects));
}

// ---- the bar the page drags itself, for the box the engine cannot measure ---
//
// ‼️ THE COMPOSER GROWS UPWARDS OUT OF THE BOTTOM OF THE WINDOW, so its own top
// moves while it is being dragged — and the engine's resize takes the height
// from where the pointer falls INSIDE the box it is moving. Pull down: the box
// gains a pixel, its top rises a pixel, the pointer is a pixel deeper, and it
// gains another. Here the arithmetic is ours: one anchor at pointerdown, every
// move measured against that anchor and against nothing that moves.
{
    const s = sandbox();
    let stored = 0;
    const el = s.box();
    el.getBoundingClientRect = () => ({ height: 120 });
    const bar = s.handle();
    const seen = [];
    const stop = s.keep({
        el, handle: bar, grow: 'up', varName: '--af-boxh', min: 64,
        read: () => stored, write: px => { stored = px; },
        onDrag: px => seen.push(px)
    });
    // Never dragged: the anchor is the height the layout gave it.
    bar.fire('pointerdown', { clientY: 500, pointerId: 1 });
    bar.fire('pointermove', { clientY: 400 });
    ok('‼️ dragging the bar UP makes the box taller, one pixel for one pixel',
        stored === 220 && varOf(s) === '220px');
    // The runaway this replaces: the same pointer position asked for twice must
    // ask for the same height, however far the box has already travelled.
    bar.fire('pointermove', { clientY: 400 });
    bar.fire('pointermove', { clientY: 400 });
    ok('‼️ …and a pointer that has not moved cannot make it grow', stored === 220);
    bar.fire('pointermove', { clientY: 450 });
    ok('…coming back down is the same subtraction, not an undo of a total',
        stored === 170);
    bar.fire('pointermove', { clientY: -700 });
    ok('‼️ …and the ceiling holds DURING the drag, not after it',
        stored === 700 && varOf(s) === '700px');
    bar.fire('pointermove', { clientY: 900 });
    ok('…as does the floor', stored === 64);
    ok('the bar is told every figure it sets, so its panel can say the truth',
        seen.length > 3 && seen[seen.length - 1] === 64);
    bar.fire('pointerup', { pointerId: 1 });
    bar.fire('pointermove', { clientY: 100 });
    ok('‼️ …and with the button up the bar is deaf: a stray move resizes nothing',
        stored === 64);
    ok('‼️ nothing wrote an inline height — this figure lives in one place',
        el.style.height === '');
    // A later drag starts from the STORED figure rather than the measured one:
    // the same number when nothing is going on, and not the same while a
    // repaint is still catching up.
    bar.fire('pointerdown', { clientY: 300, pointerId: 2 });
    bar.fire('pointermove', { clientY: 200 });
    ok('a later drag picks up from the height that was set, not from the layout',
        stored === 164);
    bar.fire('dblclick', {});
    ok('‼️ double-click hands the height back to the layout',
        stored === 0 && varOf(s) === undefined);
    stop();
    bar.fire('pointerdown', { clientY: 300, pointerId: 3 });
    bar.fire('pointermove', { clientY: 100 });
    ok('…and a stopped keeper lets go of the bar as well as of the window',
        stored === 0);
}

// ---- a box with a bar keeps no observer, so nothing reads a height nobody set
{
    const s = sandbox();
    let stored = 0;
    const el = s.box();
    el.getBoundingClientRect = () => ({ height: 100 });
    s.keep({
        el, handle: s.handle(), grow: 'up', varName: '--af-boxh', min: 64,
        read: () => stored, write: px => { stored = px; }
    });
    s.drag(el, 900);
    ok('‼️ an inline height from anywhere else is not a setting and is not stored',
        stored === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
