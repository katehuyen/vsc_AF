// X-9 — one slug rule, two audiences (core/util.ts `slugify`).
//
// ‼️ THE BUG WAS A LETTER THAT STOPS BEING ONE. `'İ'.toLowerCase()` is
// `'i' + U+0307 COMBINING DOT ABOVE`: the fold splits the letter into a letter
// plus a MARK, and a mark is neither `\p{L}` nor `\p{N}`. Every separator rule
// in this codebase therefore turned it into a separator, and a decision titled
// "İş türü kararı" filed itself as `2026-08-05-i-ş-türü-kararı` — a name a
// person reads as broken, on a file whose only job is to be readable in a
// folder listing.
//
// Measured across the four call sites BEFORE the fix:
//
//   decision file name   i-ş-türü-kararı     ← the reported bug
//   guide anchors, duty  is-turu-karari      ← right for Turkish, but
//                        lem-beyoglu-caf       Â/é/î vanished entirely
//   production, worktree i-t-r-karar         ← every non-ASCII letter a dash
//
// Three different answers to one question, two of them wrong in two different
// ways. There is one function now, and this file is the line it draws.
const fs = require('fs');
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (got === want) { pass++; return; }
    fail++;
    console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const orig = Module._load;
Module._load = function (req, ...rest) {
    if (req === 'vscode') { return { Uri: {}, window: {}, workspace: {} }; }
    return orig.call(this, req, ...rest);
};
const { slugify } = require(path.resolve(__dirname, '..', 'out', 'core', 'util.js'));

// ---- the reported failure --------------------------------------------------
eq('‼️ İ is a letter, not a letter plus a stray separator',
    slugify('İş türü kararı'), 'iş-türü-kararı');
eq('…and folded to ASCII it is still a word',
    slugify('İş türü kararı', { ascii: true }), 'is-turu-karari');
ok('‼️ the combining dot never survives into a name',
    !slugify('İstanbul').includes('̇') && !slugify('İstanbul', { ascii: true }).includes('̇'));
eq('…however the dotted I was typed — precomposed or decomposed',
    slugify('İş'), slugify('İş'));

// ---- vault names KEEP their letters ----------------------------------------
//
// The vault's own rule is that Turkish characters in file names are preserved,
// so folding here would be the wrong answer, not a safer one.
eq('a name a person reads keeps its alphabet', slugify('Ölçüm ve Değerlendirme'), 'ölçüm-ve-değerlendirme');
eq('…accents included', slugify('Âlem Beyoğlu Café'), 'âlem-beyoğlu-café');
eq('punctuation is a separator, and never doubles up', slugify('Ölçüm — 2026 (v2)'), 'ölçüm-2026-v2');
eq('…nor hangs off either end', slugify('  ...bir şey!!!  '), 'bir-şey');

// ---- ids and branches are ASCII, by FOLDING and not by deletion ------------
//
// This is the half that used to lose letters outright: `[^a-z0-9]` turned every
// character the two alphabets do not share into a dash, so a Turkish title
// arrived as a row of them.
eq('‼️ the six Turkish letters are mapped, not deleted',
    slugify('çğıöşü ÇĞIÖŞÜ', { ascii: true }), 'cgiosu-cgiosu');
eq('‼️ …and the rest decompose rather than vanish',
    slugify('Âlem Beyoğlu Café', { ascii: true }), 'alem-beyoglu-cafe');
eq('…so a production title survives being made into a folder name',
    slugify('Tanıtım Filmi!', { ascii: true }), 'tanitim-filmi');
ok('an ascii slug really is ascii', /^[a-z0-9-]*$/.test(slugify('İş Ölçüm — Âlem 2026', { ascii: true })));

// ---- ASCII I is left alone -------------------------------------------------
//
// ‼️ NOT `toLocaleLowerCase('tr')`, which also maps plain `I` to `ı` and would
// mangle every English title in the fleet to fix one Turkish one.
eq('an English capital I is still an i', slugify('ISO Standard I/O'), 'iso-standard-i-o');
eq('…in ascii too', slugify('ISO Standard I/O', { ascii: true }), 'iso-standard-i-o');

// ---- edges -----------------------------------------------------------------
eq('nothing in, nothing out', slugify(''), '');
eq('punctuation alone names nothing', slugify('???'), '');
eq('null and undefined are not the string "null"', slugify(null), '');
eq('‼️ a cut never leaves half a word — that reads as corruption, not brevity',
    slugify('bir iki üç dört beş', { max: 12 }), 'bir-iki-üç');
eq('…and the cut is applied to the ascii form too',
    slugify('Tanıtım Filmi Uzun Ad', { ascii: true, max: 14 }), 'tanitim-filmi');
eq('…a cut that lands exactly on a boundary keeps everything before it',
    slugify('bir iki üç', { max: 7 }), 'bir-iki');
eq('…but one long word longer than the budget still has to be called something',
    slugify('development', { max: 5 }), 'devel');
eq('nothing is cut when nothing needs to be',
    slugify('kısa', { max: 60 }), 'kısa');

// ---- one function, every call site ----------------------------------------
//
// Four copies of this judgment is how the three different answers happened.
{
    const src = f => fs.readFileSync(path.resolve(__dirname, '..', 'src', f), 'utf8');
    const users = [
        ['core/projectDocs.ts', /slugify\(title, \{ max: 60 \}\)/],
        ['core/antigravity.ts', /slugify\(title, \{ ascii: true \}\)/],
        ['core/production.ts', /slugify\(title, \{ ascii: true, max: 40 \}\)/],
        ['core/worktree.ts', /slugify\(name, \{ ascii: true, max: 40 \}\)/],
        ['panels/guide.ts', /slugifyText\(s, \{ ascii: true \}\)/]
    ];
    for (const [file, re] of users) {
        ok(`${file} asks the shared rule`, re.test(src(file))
            && !/toLowerCase\(\)\s*\n?\s*\.replace\(\/ç\/g/.test(src(file)));
    }
    // ‼️ The vault-facing one is the ONLY one that keeps its alphabet, and it
    // says why — the next reader will otherwise "fix" it to match the others.
    ok('‼️ …and the decision file name says out loud why it is not folded',
        /NOT ascii-folded/.test(src('core/projectDocs.ts')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
