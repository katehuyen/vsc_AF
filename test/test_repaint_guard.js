// M-33 — THE CARET THAT GETS THROWN OUT OF THE BOX, and the keypress that was
// blamed for it.
//
// ‼️ THE REPORT: "I start typing, I press space, and it is as if I pressed Page
// Down — the caret leaves the box and the page scrolls. Not every time. Mostly
// right at the start. And it is not only there: when another agent is running I
// cannot even pick from a dropdown, it shuts as I press."
//
// ‼️ SPACE DID NOTHING. Focus had already gone: a host push repainted the whole
// of `#app`, every element handed out so far was detached, and a detached node
// cannot hold the caret — so the browser gave focus back to `<body>`, where
// space IS Page Down. The intermittency is the push arriving or not; "when
// another agent is running" is what produces the pushes; "right at the start" is
// when a freshly opened page gets its first ones.
//
// ‼️ AND THE RULE ALREADY EXISTED, ON ONE ROAD ONLY. `tasksPage.js` guards its
// own 30-second timer ("never re-render under the user's fingers") and the host
// push went straight past it. What is measured here is the rule in ONE place,
// and — the half that makes it better than the timer's — that a deferred
// repaint is OWED and paid, never dropped.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/* -------------------------------------------------------------------------
 * A DOM small enough to say exactly what is being claimed: something can be
 * focused, focus can be lost, and `focusout` fires when it is.
 * ------------------------------------------------------------------------- */
function mkDoc() {
    const listeners = {};
    const doc = {
        activeElement: null,
        addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        fire(ev) { for (const fn of listeners[ev] || []) { fn({}); } },
        /** What a repaint really does: the focused node is detached, so focus
         *  falls back to the body — which is a NON-field, and that is the whole
         *  reason space then scrolls the page. */
        blurToBody() { doc.activeElement = { tagName: 'BODY' }; doc.fire('focusout'); }
    };
    return doc;
}
const field = (tag) => ({ tagName: tag, getAttribute: () => null });

const sandbox = { window: {}, document: undefined, setTimeout: (fn) => fn() };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afRepaint.js'), 'utf8'), sandbox);
const AFRepaint = sandbox.window.AFRepaint;

/* =========================================================================
 * 1 — WHAT COUNTS AS "THE USER'S HANDS ARE ON IT"
 * ========================================================================= */
{
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
        const doc = mkDoc();
        doc.activeElement = field(tag);
        ok(`a focused ${tag} is hands-on`, AFRepaint.inAField(doc) === true);
    }
    // ‼️ `SELECT` IS IN THAT LIST ON PURPOSE. A native dropdown with its list
    // open IS the active element, so the one rule covers the box the user said
    // "shuts as I press" as well as the text they were typing.
    const body = mkDoc();
    body.activeElement = { tagName: 'BODY' };
    ok('the body is not', AFRepaint.inAField(body) === false);
    const btn = mkDoc();
    btn.activeElement = { tagName: 'BUTTON', getAttribute: () => null };
    ok('…and neither is a button — pressing one ASKS for the repaint',
        AFRepaint.inAField(btn) === false);
    const ce = mkDoc();
    ce.activeElement = { tagName: 'DIV', getAttribute: k => (k === 'contenteditable' ? 'true' : null) };
    ok('anything a page made editable itself counts too', AFRepaint.inAField(ce) === true);
    ok('nothing focused is not hands-on', AFRepaint.inAField(mkDoc()) === false);
    ok('…and no document at all does not throw', AFRepaint.inAField(undefined) === false);
}

/* =========================================================================
 * 2 — ‼️ THE BUG ITSELF: A PUSH WHILE TYPING MUST NOT REPAINT
 * ========================================================================= */
{
    const doc = mkDoc();
    let painted = 0;
    const push = AFRepaint.guard(() => painted++, { document: doc });

    push();
    ok('with nobody typing, a push paints at once', painted === 1);

    // The user clicks into the new-task instruction box and starts typing.
    doc.activeElement = field('TEXTAREA');
    push();
    ok('‼️ a push that arrives while they type does NOT repaint', painted === 1);
    ok('…and the repaint is remembered as owed', push.pending() === true);
    // Several pushes while a long thought is being typed are ONE debt, not a
    // queue of repaints waiting to fire in a burst the moment focus is lost.
    push(); push(); push();
    ok('…and four pushes are one debt, not four', painted === 1 && push.pending() === true);

    // They tab away. The hands are free, so the debt is paid.
    doc.activeElement = { tagName: 'BODY' };
    doc.fire('focusout');
    ok('‼️ …and it is PAID when the hands come free — deferred, never dropped',
        painted === 2);
    ok('…once, and then it is not owed any more', push.pending() === false);
    doc.fire('focusout');
    ok('…and a second focusout does not repaint again', painted === 2);
}

/* =========================================================================
 * 3 — ‼️ MOVING BETWEEN TWO BOXES IS NOT "HANDS FREE"
 * ========================================================================= */
{
    // `focusout` fires as the caret LEAVES the first box, before it has settled
    // in the second. Answered on the spot, the guard would see the box being
    // left, call it busy, and stay stale for ever; answered a tick later it sees
    // where the caret actually went. Tabbing from the title field to the
    // instruction field must not repaint the form out from under the journey.
    const doc = mkDoc();
    let painted = 0;
    const push = AFRepaint.guard(() => painted++, { document: doc });
    doc.activeElement = field('INPUT');
    push();
    ok('a push while in the first box is owed', push.pending() === true);
    // …tab: focusout fires and the caret lands in the next field.
    doc.activeElement = field('TEXTAREA');
    doc.fire('focusout');
    ok('‼️ moving from one field to the next does not repaint under them',
        painted === 0 && push.pending() === true);
    doc.activeElement = { tagName: 'BODY' };
    doc.fire('focusout');
    ok('…and leaving both of them does', painted === 1);
}

/* =========================================================================
 * 4 — THE PAGE'S OWN EXTRA ANSWER, ON TOP OF THE UNIVERSAL ONE
 * ========================================================================= */
{
    // ‼️ ON TOP, NOT INSTEAD. Every page has fields and only some have modals,
    // so the focus half lives in the component and cannot be forgotten by the
    // next page that wires this up.
    const doc = mkDoc();
    let painted = 0;
    let composerOpen = true;
    const push = AFRepaint.guard(() => painted++, { document: doc, busy: () => composerOpen });
    push();
    ok('an open composer holds the repaint even with nothing focused',
        painted === 0 && push.pending() === true);
    // Closing it is the page's business; `flush` is how it says the hands are
    // free without waiting for a focus event that will never come.
    composerOpen = false;
    ok('…and the page can pay the debt itself when it closes', push.flush() === true);
    ok('…which paints exactly once', painted === 1);
    ok('…and paying nothing owed is not a repaint', push.flush() === false);
}

/* =========================================================================
 * 5 — ‼️ WHAT MUST NOT BE BROKEN BY ANY OF THIS
 * ========================================================================= */
{
    // A render the USER's own action asked for has to happen at once, even
    // though a field is focused — the field is the thing that asked. That is
    // why this wraps the HOST push and nothing else, and a page that routed
    // every render through here would feel broken in the opposite direction.
    // Measured as: the guard returns a NEW function and leaves the original
    // alone, so the direct calls stay direct.
    const doc = mkDoc();
    let painted = 0;
    const render = () => painted++;
    const push = AFRepaint.guard(render, { document: doc });
    doc.activeElement = field('INPUT');
    render();
    ok('‼️ a render the user asked for still happens while they are typing',
        painted === 1);
    push();
    ok('…while the host push beside it waits', painted === 1 && push.pending() === true);
}

/* =========================================================================
 * 6 — ‼️ AND THE ROAD THE BUG CAME DOWN IS ACTUALLY GUARDED
 * ========================================================================= */
{
    // The component being correct is not the fix. The fix is that the ONE line
    // the report was about goes through it — and the way this regresses is
    // somebody adding a `render()` back onto the push because it "feels more
    // responsive", which is exactly how it read before anyone noticed the caret.
    const page = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    ok('‼️ the host push no longer repaints straight into the page',
        !/type === 'data'\) \{ DATA = ev\.data\.data; pendingCommand = false; render\(\); \}/.test(page));
    ok('…it goes through the guard',
        /type === 'data'\) \{ DATA = ev\.data\.data; pendingCommand = false; repaint\(\); \}/.test(page));
    // ‼️ AND THE STATE IS STILL TAKEN AT ONCE. Deferring the DATA as well would
    // trade a stolen caret for a page answering the user's next press out of
    // yesterday's figures, which is a worse bug and a much quieter one.
    ok('…while the data itself is taken immediately, not deferred',
        /DATA = ev\.data\.data; pendingCommand = false; repaint\(\);/.test(page));
    ok('…with the page\'s own two hands-on answers on top of the focus test',
        /busy: \(\) => !!composer \|\| taskGuideOpen/.test(page));

    // Every page gets the component, for the reason every other shared
    // component ships everywhere: the failure it prevents is the one line EVERY
    // page has, so a guard a page had to opt into is the page where the caret
    // still gets thrown out.
    const shell = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('the guard ships to every page rather than being opted into',
        /'media', 'afRepaint\.js'/.test(shell) && /src="\$\{repaint\}"/.test(shell));
}

/* =========================================================================
 * 7 — ‼️ …ON EVERY PAGE, AND THE NEXT ONE TOO
 *
 * SHIPPING the component to every page is not the same as USING it, and the
 * first sweep left it wired to one page out of twenty-four. The way this rots
 * is nobody's fault and entirely predictable: somebody writes the next page,
 * copies the one line every page has —
 *
 *     if (m.type === 'data') { DATA = m.data; render(); }
 *
 * — and that page throws the caret exactly as all of them used to. So the rule
 * is measured rather than remembered: a page that answers a host `data` push
 * must route it through the guard, or be named here with the reason it does
 * not. A name with no reason is not accepted, because "it is on the list" is
 * how a list stops meaning anything.
 * ========================================================================= */
{
    const dir = path.join(ROOT, 'media');
    // The two pages that answer a push WITHOUT replacing #app, and why.
    const EXCEPT = {
        // ‼️ The Console repaints incrementally on purpose (S-29): the reader
        // watches the output WHILE they type, so deferring the whole paint
        // would be the opposite bug. Exactly one part of it replaces the
        // composer — `buildShell` — and that part does the waiting itself.
        'console.js': /shellOwed/,
        // The component itself, which quotes the line in its own preamble.
        'afRepaint.js': /window\.AFRepaint = /
    };
    const missing = [];
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        // Does this file answer a host `data` push at all?
        if (!/type === 'data'\)/.test(src)) { continue; }
        if (EXCEPT[f]) {
            if (!EXCEPT[f].test(src)) { missing.push(f + ' (named as an exception, but no longer answers for itself)'); }
            continue;
        }
        if (!/AFRepaint\.guard\(/.test(src)) { missing.push(f + ' (repaints straight into the page)'); }
    }
    ok('‼️ every page that answers a host push routes it through the guard'
        + (missing.length ? ' — ' + missing.join(', ') : ''),
        missing.length === 0);

    // …and the wiring is the real thing, not a variable named `repaint` that
    // nothing calls: the push has to reach it.
    const unused = [];
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        if (!/AFRepaint\.guard\(/.test(src)) { continue; }
        if (!/\brepaint\(\)/.test(src)) { unused.push(f); }
    }
    ok('…and every guard that is built is actually called'
        + (unused.length ? ' — ' + unused.join(', ') : ''),
        unused.length === 0);
}

console.log(`test_repaint_guard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
