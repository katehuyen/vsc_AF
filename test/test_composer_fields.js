// M-21 — EVERY BOX ON THE NEW-TASK FORM RECORDS ITSELF AS IT IS TOUCHED.
//
// ‼️ WHY THIS FILE EXISTS. The Tasks page redraws itself on every host push
// (`type === 'data'` → `render()`), and `render()` replaces the whole of `#app`.
// So a field that lives only in the DOM is a field that a task finishing
// somewhere else silently empties, mid-sentence, with nobody watching. Every
// field therefore has to write itself into the draft as it is typed — which
// means every id `readComposer()` / `readStep()` reads must ALSO appear in the
// wiring with an `input` or a `change` listener.
//
// That was true of all but one field, and the one was `nt-continuationprompt`:
// the longest text on the card, read at submit time and nowhere else, and the
// one that only matters when nobody is looking. It was found by hand, by
// listing both sides and comparing them. A rule found by hand once is a rule
// that rots (Principle 1), so the comparison is the gate now — and it is
// DERIVED from the page rather than declared here, so a field added tomorrow is
// checked tomorrow without anybody remembering this file exists.
//
// It runs BOTH WAYS on purpose. A read with no listener loses what was typed; a
// listener for something nothing reads is a wire to nowhere, which is how a
// renamed field goes quietly dead.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const src = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');

/**
 * The body of a top-level `function <name>() { … }` in this file.
 *
 * ‼️ The end marker is matched WITHOUT the line ending: this file is CRLF and
 * looking for `\n    }\n` finds nothing, which silently returns the rest of the
 * file — and a gate that reads the whole file finds every id in it and passes.
 */
function bodyOf(name) {
    const head = `    function ${name}() {`;
    const i = src.indexOf(head);
    if (i < 0) { throw new Error(`${name} is gone — this gate is measuring nothing`); }
    const end = src.slice(i).search(/\r?\n {4}\}\r?\n/);
    if (end < 0) { throw new Error(`${name} has no end — the gate would read the whole file`); }
    return src.slice(i, i + end);
}

/** Every quoted string inside one `[ … ]` literal. */
const arrayIds = lit => (lit.match(/'([a-zA-Z0-9_-]+)'/g) || []).map(s => s.slice(1, -1));

// ---------------------------------------------------------------- what is READ
const composerReads = new Set();
{
    const body = bodyOf('readComposer');
    // `v('prompt', 'prompt')` / `n('dow', 'dow')` / `b('start', 'start')` — the
    // helper DEFINITIONS are arrow assignments and do not match this shape.
    for (const m of body.matchAll(/\b([vnb])\('([a-zA-Z0-9_-]+)'/g)) { composerReads.add(m[2]); }
}

const stepReads = new Set();
{
    const body = bodyOf('readStep');
    // `['stype', 'title', …].forEach(v)`
    for (const m of body.matchAll(/\[([^\]]*)\]\.forEach\([vnb]\)/g)) {
        arrayIds(m[1]).forEach(id => stepReads.add(id));
    }
    for (const m of body.matchAll(/\b([vnb])\('([a-zA-Z0-9_-]+)'\)/g)) { stepReads.add(m[2]); }
}

// ------------------------------------------------------------- what is WIRED
/** ids reached through `byId('<prefix>' + id, 'input'|'change', …)` from a list. */
function wiredFor(prefix) {
    const found = new Set();
    const listed = new RegExp(
        `\\[([^\\]]*)\\]\\.forEach\\(id =>\\s*[\\s\\S]{0,40}?byId\\('${prefix}' \\+ id, '(?:input|change)'`, 'g');
    for (const m of src.matchAll(listed)) { arrayIds(m[1]).forEach(id => found.add(id)); }
    // …and the ones wired one at a time, which is what a field that redraws or
    // restores its own caret needs.
    const single = new RegExp(`byId\\('${prefix}([a-zA-Z0-9_-]+)', '(?:input|change)'`, 'g');
    for (const m of src.matchAll(single)) { found.add(m[1]); }
    // `typeAhead('nt-retryformula')` is an `input` listener with a caret restore
    // around it — the same wire, through one more function.
    const ta = new RegExp(`typeAhead\\('${prefix}([a-zA-Z0-9_-]+)'\\)`, 'g');
    for (const m of src.matchAll(ta)) { found.add(m[1]); }
    return found;
}

const composerWired = wiredFor('nt-');
const stepWired = wiredFor('nt-st-');
// `nt-` matches `nt-st-…` too; a step field is not a composer field.
for (const id of [...composerWired]) { if (id.startsWith('st-')) { composerWired.delete(id); } }

// ‼️ `typeAhead` is only a wire because it calls `readComposer()` itself. If it
// ever stops doing that, every field it carries goes quiet and nothing else
// here would notice.
ok('`typeAhead` still writes the draft — it is the wire for two boxes',
    /const typeAhead = \(id\) => byId\(id, 'input', \(\) => \{\s*\n\s*readComposer\(\);/.test(src));

// --------------------------------------------------------------- the two gates
{
    ok('the form has fields to check at all', composerReads.size > 40 && stepReads.size > 20);

    const lost = [...composerReads].filter(id => !composerWired.has(id));
    ok('‼️ EVERY field readComposer() reads writes itself as it is touched'
        + (lost.length ? ` — LOST: ${lost.join(', ')}` : ''), lost.length === 0);

    // ‼️ THE HALF NOBODY HAD LOOKED AT. A workflow step is read through a
    // different helper (`nt-st-` ids, list-driven), so the hand audit that
    // cleared the composer never covered it — and a step's prompt is exactly
    // the kind of long text that only matters when nobody is watching.
    const lostStep = [...stepReads].filter(id => !stepWired.has(id));
    ok('‼️ …and so does every field readStep() reads'
        + (lostStep.length ? ` — LOST: ${lostStep.join(', ')}` : ''), lostStep.length === 0);

    // ‼️ ONE HONEST EXEMPTION, NAMED. `nt-kind` is wired and is not read onto
    // the draft, because changing the kind REOPENS the composer under the new
    // one (`openComposer(seed, …)`) — the handler reads the draft first, so
    // nothing typed is lost, and `kind` is set by the reopen rather than stored
    // by the reader. It is listed here so that removing its listener still fails.
    ok('the kind picker reads the draft before it reopens the form',
        /byId\('nt-kind', 'change', e => \{\s*\r?\n\s*readComposer\(\);/.test(src));
    const EXEMPT = new Set(['kind']);

    const dead = [...composerWired].filter(id => !composerReads.has(id) && !EXEMPT.has(id));
    ok('no composer field is wired to a listener that nothing reads'
        + (dead.length ? ` — DEAD: ${dead.join(', ')}` : ''), dead.length === 0);

    const deadStep = [...stepWired].filter(id => !stepReads.has(id));
    ok('…nor any step field'
        + (deadStep.length ? ` — DEAD: ${deadStep.join(', ')}` : ''), deadStep.length === 0);

    // ‼️ THE THIRD DIRECTION: a box that is DRAWN and never read is a control
    // whose answer is discarded — "a box with no referent is a bug"
    // (docs/CONVENTIONS.md), and the reader has no way of telling. Only the
    // four field helpers and raw `<input|select|textarea id="nt-…">` count;
    // a button is an action, not an answer. One-directional on purpose: the
    // scan may not see every markup shape, so it asserts drawn ⊆ read and
    // never the reverse.
    const drawn = new Set();
    for (const m of src.matchAll(/\b(?:choiceSel|pickSel|textF|numF)\('([a-zA-Z0-9_-]+)'/g)) {
        drawn.add(m[1]);
    }
    for (const m of src.matchAll(/<(?:input|select|textarea)[^>]*\bid="nt-([a-zA-Z0-9_-]+)"/g)) {
        drawn.add(m[1]);
    }
    const allRead = new Set([...composerReads, ...[...stepReads].map(id => 'st-' + id)]);
    const discarded = [...drawn].filter(id => !allRead.has(id) && !EXEMPT.has(id));
    ok('the form has boxes to check at all', drawn.size > 60);
    ok('‼️ no box is drawn whose answer nothing ever reads'
        + (discarded.length ? ` — DISCARDED: ${discarded.join(', ')}` : ''), discarded.length === 0);
}

// ------------------------------------------------- the premise, still standing
{
    // If the page ever stops repainting on a host push, this whole gate is
    // measuring a rule that no longer has a reason — which is worth knowing.
    //
    // ‼️ M-33 CHANGED WHEN, NOT WHETHER. The push used to repaint on arrival,
    // including while somebody was typing — which is what threw the caret out
    // of the box. It now goes through the repaint guard, so it waits for the
    // hands and then paints. The form is still rebuilt from scratch afterwards
    // and every box's answer still has to survive that, so this gate stands
    // exactly as it did; what it may no longer assume is the WORD `render` on
    // that line.
    ok('the page still repaints on a host push, which is why any of this matters',
        /ev\.data\.type === 'data'\) \{ DATA = ev\.data\.data;[^}]*repaint\(\);/.test(src)
        && /window\.AFRepaint\.guard\(render,/.test(src));
    // …and the guard defers rather than drops, or the page would be showing
    // yesterday's figures to somebody who simply never left a field.
    ok('…and a deferred repaint is owed and paid, never dropped',
        /guarded\.flush = flush;/.test(
            fs.readFileSync(path.join(__dirname, '..', 'media', 'afRepaint.js'), 'utf8')));
    ok('…and what is submitted is read out of the boxes, so a wired field is not the only path',
        /function submitComposer\(force\) \{\s*\r?\n\s*readComposer\(\);/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
