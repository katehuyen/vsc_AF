// U-8: ONE ROW, ONE MARK.
//
// Two glyph vocabularies met on the same line. The old one is a ROLE picture
// (🔧 tool call, 📄 result) drawn in the row's left gutter; the new one is the
// step KIND (⌘ local · ⇄ MCP · ⌗ web · ⑂ sub-agent · ⚙ harness · ↩ result —
// charts.js STEP_KIND), which was glued to the front of the text. Every tool row
// in the Console and every tool row in the transcript therefore carried both,
// always as a pair, always about the same step.
//
// ‼️ And the fixed one said the LESS of the two: 🔧 is drawn identically on a
// web fetch, an MCP call and a Read off this disk, while the chip is the whole
// point — it says where the cost came from. So the survivor is the chip.
//
// Two things this must NOT do, and both are checked below:
//  · the FILTER chips keep 🔧 — a control that names a category is not a mark on
//    a row, and the user picks tool traffic by that picture on four pages;
//  · the DIALOG rows keep 🧑 / 🤖 — those name a SPEAKER, which no step kind does.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const media = f => fs.readFileSync(path.resolve(__dirname, '..', 'media', f), 'utf8');
const consoleJs = media('console.js');
const viewerJs = media('sessionViewer.js');

// ---- the Console's live stream --------------------------------------------
//
// The rows are built by messageHtml as `<span class="who">…</span><div
// class="body">…`, so "which glyph is in the gutter" and "does anything sit in
// front of the words" are both readable off the template.
const whoSpans = consoleJs.match(/<span class="who">[^]*?<\/span>/g) || [];
ok('the console still draws a gutter on every row', whoSpans.length >= 5);

ok('‼️ no row opens with the old 🔧 any more',
    !whoSpans.some(s => s.includes('🔧')));
ok('‼️ the tool row puts the step KIND in the gutter instead',
    whoSpans.some(s => s.includes('C.stepChip(m.kind, m.stepTokens, m.stepWTokens)')));
ok('…and a tool RESULT row does too',
    whoSpans.some(s => s.includes("m.isError ? '⚠' : C.stepChip(m.kind)")));

// The duplicate was a chip immediately after the body opened. Nothing may
// re-introduce one there: the gutter is the only place a kind mark belongs.
const bodyOpeners = consoleJs.match(/<div class="body">\$\{[A-Za-z.]+/g) || [];
ok('‼️ nothing is glued to the front of a row\'s text',
    !bodyOpeners.some(o => o.includes('stepChip')));

ok('a failed step still says so in the gutter — ⚠ is not a duplicate of anything',
    whoSpans.some(s => s.includes('⚠')));

// The gutter is sized for a 10px uppercase word and dimmed; a glyph dropped in
// unchanged would be the faintest thing on the row it exists to mark.
ok('the gutter gives a chip back its size and its contrast',
    /\.msg \.who \.skind \{[^}]*font-size:13px/.test(consoleJs)
    && /\.msg \.who:has\(\.skind\) \{[^}]*opacity:1/.test(consoleJs));

// ---- the transcript --------------------------------------------------------
//
// Here the chip was already in the right place — it leads the meta line — so
// only the role picture beside it comes off.
const roleGlyph = /const ROLE_GLYPH = \{([^}]*)\}/.exec(viewerJs);
ok('the transcript still has a role-glyph table', !!roleGlyph);
ok('‼️ …and it no longer draws 🔧 or 📄 next to the kind chip',
    !!roleGlyph && !/🔧|📄/.test(roleGlyph[1]));
ok('‼️ the dialog rows are untouched — a speaker is not a step kind',
    !!roleGlyph && /user: '🧑'/.test(roleGlyph[1]) && /assistant: '🤖'/.test(roleGlyph[1]));
ok('the kind still leads the meta line',
    /const meta = \[\s*C\.stepChip\(m\.kind/.test(viewerJs));

// ---- the controls are not rows ---------------------------------------------
//
// Removing the picture from the row must not remove it from the thing you click
// to see those rows. Four pages offer the same choice and all four keep it.
for (const [file, src] of [
    ['console.js', consoleJs],
    ['sessionViewer.js', viewerJs],
    ['turns.js', media('turns.js')],
    ['search.js', media('search.js')]
]) {
    ok(`${file} still offers 🔧 Tool calls as a filter`, /🔧 Tool calls/.test(src));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
