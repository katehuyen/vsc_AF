// X-37 — ONE SEARCH ENGINE, AND EVERY BOX SAYS SO.
//
// The Search page was rebuilt: a real grammar underneath it and a Syntax card
// beside it. The question this file exists to keep answered is the one the user
// asked afterwards — *are the OTHER boxes the same?* Two of them were not. The
// Session Viewer's message filter and the Task Analytics table search were
// still `hay.toLowerCase().includes(typed)`, which cannot ask for two words that
// are not next to each other and cannot exclude anything, on two of the longest
// lists in the extension. And a box whose hover never mentions the grammar is a
// box whose grammar nobody will ever try.
//
// So: a sweep, not a list of the boxes that happened to be remembered.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const MEDIA = path.join(__dirname, '..', 'media');
const files = fs.readdirSync(MEDIA).filter(f => f.endsWith('.js'));
const read = f => fs.readFileSync(path.join(MEDIA, f), 'utf8');

// ---- nobody hand-rolls a match any more -----------------------------------
// The shape that keeps coming back, in every page that forgot the component
// exists. Written as a sweep so a new page cannot reintroduce it quietly.
{
    /**
     * ‼️ ONE EXEMPTION, AND IT IS NOT A SEARCH BOX (K-30).
     *
     * `afSlashPicker.js` narrows a list of COMMAND NAMES against the `/mod`
     * being typed in the composer, and its `narrow` is a mirror of
     * `narrowSlash` in core/slashCommands.ts — the very function the bridge's
     * `toolbox.slashCommands` op filters with. The rule this sweep enforces is
     * "a box the user searches in gets the grammar"; applying it here would
     * make the picker answer a DIFFERENT question from the op that documents
     * the same catalog to an agent, which is the one failure the mirror is
     * tested against (test_console_page → "the page and the compiled core
     * agree"). A `-tag` or a two-word query means nothing to a command name.
     */
    const NOT_A_SEARCH_BOX = new Set(['afSlashPicker.js']);
    const guilty = files.filter(f => !NOT_A_SEARCH_BOX.has(f)
        && /toLowerCase\(\)\s*\.\s*(includes|indexOf)\(/.test(read(f)));
    ok('‼️ no page decides a match with a lowercased substring — that is what AFQuery is for'
        + (guilty.length ? ' (' + guilty.join(', ') + ')' : ''),
        guilty.length === 0);
    // The exemption is only worth having while the mirror is real: if the
    // picker stops matching the core's own filter, it is a hand-rolled search
    // box again and belongs back under the rule above.
    ok('‼️ …and the one exemption still mirrors the core rather than inventing a filter',
        /narrowSlash/.test(read('afSlashPicker.js')));
}

// ---- a page that filters, explains ----------------------------------------
// One deliberate exception, and it is the rule's own strongest case: the Search
// page draws the grammar IN FULL, one press below the box it belongs to
// (docs/CONVENTIONS.md). A page that draws the grammar does not also whisper it.
{
    const EXPLAINS_ITSELF = new Set(['search.js']);
    const filtering = files.filter(f => /AFQuery\.compile\(/.test(read(f)));
    ok('the sweep found the filtering pages at all', filtering.length >= 8);
    const silent = filtering.filter(f => !EXPLAINS_ITSELF.has(f) && !/AFQuery\.tip\(/.test(read(f)));
    ok('‼️ every page that filters on a typed box offers the grammar on that box'
        + (silent.length ? ' (' + silent.join(', ') + ')' : ''),
        silent.length === 0);
}

// ---- the two that were behind ---------------------------------------------
{
    const sv = read('sessionViewer.js');
    ok('the Session Viewer filters the transcript with the shared grammar',
        /window\.AFQuery\.compile\(filter\)/.test(sv)
        && /function matchesText\(m, q\)/.test(sv)
        && /q\.test\(\(m\.text/.test(sv));
    ok('…compiled once per pass, never once per message',
        /const q = window\.AFQuery\.compile\(filter\);\s*\n\s*return DATA\.messages\.filter/.test(sv));
    ok('…and the box says what it searches', /id="filter"[\s\S]{0,220}AFQuery\.tip\(/.test(sv));
    // The grammar decides its own case handling; a pre-lowercased string only
    // takes away what it offers (docs/CONVENTIONS.md → Filtering).
    ok('‼️ …from the RAW box value', /filter = input\.value;/.test(sv) && !/filter = input\.value\.toLowerCase/.test(sv));

    const ta = read('taskAnalytics.js');
    ok('an analytics table searches with the same grammar',
        /const q = window\.AFQuery\.compile\(s\.q\)/.test(ta) && /q\.test\(hay\)/.test(ta));
    ok('…compiled outside the row loop', ta.indexOf('AFQuery.compile(s.q)') < ta.indexOf('allRows.filter('));
    ok('…and its box carries the grammar too', /data-tq=[\s\S]{0,200}AFQuery\.tip\(/.test(ta));
    ok('…with reset still lighting on a typed query', /!q\.empty \|\| s\.sort/.test(ta));
}

// ---- the hover and the card cannot drift ----------------------------------
// They were two hand-written texts, one of which claimed in a comment to be
// derived from the other. The card grew `"a* b*"` and no hover ever learned it;
// every hover told the reader to turn on a Whole word toggle that exists on one
// page out of eleven.
{
    const Q = require(path.join(MEDIA, 'afQuery.js'));
    ok('‼️ the flat grammar is BUILT from the card\'s rows',
        Q.SYNTAX_ROWS.every(r => Q.SYNTAX.includes(r.sym) && Q.SYNTAX.includes(r.what) && Q.SYNTAX.includes(r.example)));
    ok('…including the phrase-plus-wildcard row the hovers used to miss',
        Q.SYNTAX.includes('"a* b*"'));
    ok('…and it closes with what a bare word does, in words any box can act on',
        Q.SYNTAX.includes(Q.BARE_WORD_NOTE) && /quotes/.test(Q.BARE_WORD_NOTE));
    ok('‼️ a plain box is not told to press a toggle only the Search page has',
        !/Turn on Whole word/i.test(Q.SYNTAX));
    ok('…while a box that HAS the mode still says what it is doing',
        Q.tip('x', { wholeWord: true }).includes(Q.WHOLE_WORD_ON));
}

// ---- and the bridge answers the same question as the picker ---------------
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ prompts.list uses the grammar its own picker uses',
        /const q = compileQuery\(optStr\(args, 'q'\)/.test(ext)
        && /q\.test\(`\$\{i\.label\} \$\{i\.group\} \$\{i\.text\}`\)/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
