// A DELIBERATE BLANK LINE IN A HOVER PANEL — the marker, and the gate that
// keeps it from being written as `''` again.
//
// What is being defended (audit A-12.9): MIRROR says a control narrow enough to
// cut its own text puts its CURRENT value on the first line of its panel, THEN
// A BLANK LINE, then the description. Every panel in the product was written
// that way — and none of them drew the blank line, because `AFTip.lines` drops
// an empty string. It has to: a conditional line says "nothing here" by
// evaluating to `''`, and that is the commoner case by far, so one value cannot
// carry both intentions. The rule read as applied, the screen ran the figures
// into the paragraph, and nothing anywhere said so — Principle 1's own shape.
//
// `AFTip.GAP` is the second intention with its own name. It is a single space:
// a line that IS there and is blank, so it survives every joiner a page might
// reach for (`lines`, `filter(Boolean)`, a bare `.join('\n')`, a native
// `title`) without any of them having to learn about it.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- the component, driven directly ---------------------------------------
const windowStub = { getComputedStyle: () => ({ visibility: 'hidden' }) };
const documentStub = {
    addEventListener: () => {}, removeEventListener: () => {},
    querySelectorAll: () => [], body: { classList: { add: () => {}, remove: () => {} } }
};
const src = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'afTipEdge.js'), 'utf8') + '\n'
    + fs.readFileSync(path.resolve(__dirname, '..', 'media', 'afTip.js'), 'utf8');
new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame',
    'setTimeout', 'clearTimeout', src)(
    windowStub, documentStub, function () { this.observe = () => {}; this.disconnect = () => {}; },
    fn => fn(), () => 0, () => {});

const T = windowStub.AFTip;
ok('the component exports GAP', typeof T.GAP === 'string' && T.GAP.length > 0);

// ‼️ THE TWO INTENTIONS, SIDE BY SIDE. If these two ever agree, the bug is back.
ok('a conditional empty is still dropped', T.lines(['a', '', 'b']) === 'a\nb');
ok('a GAP draws the blank line', T.lines(['a', T.GAP, 'b']) === 'a\n' + T.GAP + '\nb');
ok('the gap really is blank', T.GAP.trim() === '');

// The joiners a page reaches for when it is not calling `lines` — a gap has to
// mean the same thing through all of them, or the marker is a per-file trick.
ok('GAP survives filter(Boolean)', ['a', T.GAP, 'b'].filter(Boolean).length === 3);
ok('GAP survives a !== \'\' filter', ['a', T.GAP, 'b'].filter(x => x !== '').length === 3);
ok('an empty string does not survive filter(Boolean)',
    ['a', '', 'b'].filter(Boolean).length === 2);

// A panel that is NOTHING but a gap is still nothing — `wrap` drops it, so a
// caller cannot accidentally open an empty box on a blank line.
ok('a body of only gaps opens no panel',
    T.wrap('<i>x</i>', 'head', T.lines([T.GAP, T.GAP])) === '<i>x</i>');

// ---- the gate: no page writes a bare `''` on its own line ------------------
//
// This is the shape the mistake takes. A line whose entire content is `''` is
// one of two things and both are wrong: a blank-line separator that will be
// silently swallowed (write `AFTip.GAP`), or a positional argument nobody can
// identify at a glance (put it on the line with its neighbour, or name it in a
// comment). Neither is worth the ambiguity that cost the product every MIRROR
// gap it had.
const mediaDir = path.resolve(__dirname, '..', 'media');
const offenders = [];
for (const f of fs.readdirSync(mediaDir).filter(n => n.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(mediaDir, f), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
        if (/^\s*''\s*,?\s*$/.test(line)) { offenders.push('media/' + f + ':' + (i + 1)); }
    });
}
ok('no media page writes a bare \'\' on its own line'
    + (offenders.length ? ' — ' + offenders.join(', ') : ''), offenders.length === 0);

// ---- and the marker is actually in use ------------------------------------
// A gate with nothing behind it passes on an empty product. This counts the
// call sites so a sweep that quietly reverts is visible as a number.
let uses = 0;
for (const f of fs.readdirSync(mediaDir).filter(n => n.endsWith('.js') && n !== 'afTip.js')) {
    const body = fs.readFileSync(path.join(mediaDir, f), 'utf8');
    uses += (body.match(/(?:window\.AFTip|\bT)\.GAP\b/g) || []).length;
}
ok('the marker is used across the pages (' + uses + ' call sites)', uses >= 50);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
