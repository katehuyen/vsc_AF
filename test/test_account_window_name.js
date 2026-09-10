// audit B-04.3 — WHOEVER MEASURED THE WINDOW NAMES IT, AND NOBODY ELSE DOES.
//
// The defect this pins was not a missing feature and no string test could have
// failed on it: every one of these sentences was grammatical, well-formed and
// wrong. `dist/render/enginespanel.s2.png` carried the proof in one picture —
// the Codex card said "Current week 72%" and its own hover panel, three inches
// away, said "72% of the five-hour window used". The same figure under two
// window names, one of them a lie with a real number in it.
//
// The cause was arithmetic: six places drew an account's window and each had
// typed the words out. Only ONE of them (the Engines card) had been taught that
// Codex publishes a WEEK. The other five — the engine chip's panel, the picker
// MIRROR every page shares (media/afAccount.js), the campaign strip, the leader
// picker and the "Resume as…" quick pick — said "five-hour" to every row on
// every engine, for ever.
//
// So the rule this file measures is not "say Current week here". It is:
//
//   ‼️ A SURFACE MAY NOT NAME AN ACCOUNT'S WINDOW. It prints the name the
//      READING carried, and the host fills the silence exactly once
//      (windowNameOf, src/core/accountUsage.ts).
//
// which is why the assertions below are mostly of the form "this figure and
// this window name appear TOGETHER, and this figure never appears beside any
// other window name" — a rule about agreement, not about wording.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const A = require(path.join(ROOT, 'media', 'afAccount.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** Every window name that exists, so "it says the WRONG one" can be asked as a
 *  question rather than guessed at one name at a time. */
const NAMES = ['five-hour window', '5-hour window', 'Current week', 'current week', 'usage window'];
/** ‼️ CASE IS A HIDING PLACE. The sweep below is case-INSENSITIVE for exactly
 *  one measured reason: the seventh copy of this string was 'Five-hour window'
 *  at the head of a line, and a case-sensitive rule walked straight past it. */
const NAMED = /(five-hour window|5-hour window|usage window|current week)/i;

/** The names a stretch of text puts next to a given percentage. The window at
 *  ±90 characters is wide enough for "72% of the …" in either order and narrow
 *  enough that the NEXT card's label is not in it. */
function namesBeside(text, figure) {
    const out = new Set();
    let i = text.indexOf(figure);
    while (i >= 0) {
        const near = text.slice(Math.max(0, i - 90), i + 90);
        const low = near.toLowerCase();
        for (const n of NAMES) { if (low.indexOf(n.toLowerCase()) >= 0) { out.add(n.toLowerCase()); } }
        i = text.indexOf(figure, i + 1);
    }
    return out;
}

// ---- 1. the host decides the name, and it is the only thing that does ------
{
    const U = require(path.join(ROOT, 'out', 'core', 'accountUsage.js'));
    ok('a reading that named its own window keeps that name',
        U.windowNameOf('Current week', 'codex') === 'Current week');
    ok('…an engine that named none is on the five-hour window',
        U.windowNameOf('', 'claude') === 'five-hour window');
    // ‼️ THE ONE THAT IS NOT A DEFAULT. A disk-backed reading nobody has taken
    // has no window LENGTH yet — it is in the reading — so "five-hour" is the
    // single claim about it that is certainly wrong.
    ok('…but an unread disk-backed slot is named for what it is, not for five hours',
        U.windowNameOf(undefined, 'codex') === 'usage window');
    ok('…and the sentence form lowers the heading rather than quoting it',
        U.windowPhraseOf('Current week', 'codex') === 'current week'
        && U.windowPhraseOf('', 'claude') === 'five-hour window');
}

// ---- 2. the picker MIRROR every page shares -------------------------------
{
    const weekly = A.detail({ id: 'x', label: 'work@studio', health: 'ready',
        percent: 72, window: 'Current week' });
    ok('the shared picker panel names the window the reading carried',
        weekly.indexOf('72% of the current week used.') >= 0);
    ok('…and does not also call it five-hour', !/five-hour|5-hour/.test(weekly));

    const claude = A.detail({ id: 'y', label: 'personal', health: 'ready',
        percent: 12, window: 'five-hour window' });
    ok('…a Claude row still reads the way it always did',
        claude.indexOf('12% of the five-hour window used.') >= 0);
}

// ---- 3. the Engines page — the card and its own panel, in one picture ------
{
    const fixture = require(path.join(__dirname, 'fixtures', 'enginespanel.js'));
    const r = runPage('engines.js', fixture.data());
    const h = r.html();

    // ‼️ THE MEASUREMENT THE PNG MADE BY EYE. 72 is the Codex slot's figure and
    // it appears twice on this page — on the card and in the panel behind it.
    // Both must name the same window; before the repair they named two.
    const at72 = namesBeside(h, '72%');
    ok('the Codex figure is drawn under its own window name', at72.has('current week'));
    ok('‼️ …and NOWHERE on the page is that same figure called a five-hour window',
        !at72.has('five-hour window') && !at72.has('5-hour window'));

    const at91 = namesBeside(h, '91%');
    ok('the Claude figure keeps the five-hour window',
        at91.has('five-hour window') && !at91.has('current week'));

    // The unread Codex slot: no figure at all, and the one window name that
    // would certainly be wrong about it.
    ok('an unread disk-backed slot says "usage window", never "five-hour"',
        h.indexOf('usage window — not read yet') >= 0
        && h.indexOf('five-hour window — not read yet') < 0);
}

// ---- 4. the Missions page — the strip and the leader picker ----------------
{
    const fixture = require(path.join(__dirname, 'fixtures', 'missions.js'));
    const V = fixture.variants();
    const live = V.find(v => v.id === 'sentry-live');
    const r = runPage('missions.js', live.data, fixture.window);
    const h = r.html();

    // The strip says how much is LEFT, so its figure is 100 - 38.
    const at62 = namesBeside(h, '62%');
    ok('the campaign strip names the running account\'s own window',
        at62.has('five-hour window') && !at62.has('current week'));

    // ‼️ NAME THE SURFACE OR THE ASSERTION MEASURES A DIFFERENT ONE. The pool
    // chips and the leader picker both draw a percentage on this page, and the
    // first version of this file credited the leader picker with a figure that
    // was in fact a pool chip's — the picker filters to the leader ENGINE, so
    // it holds no Codex row in this scene at all. Two surfaces, two slices.
    const form = V.find(v => v.id === 'sentry-form');
    const rf = runPage('missions.js', form.data, fixture.window);
    form.act(rf);
    const hf = rf.html();

    // ---- the account pool, which is the one place BOTH engines are drawn ---
    const chip = (id) => {
        const at = hf.indexOf('data-spool="' + id + '"');
        return at < 0 ? '' : hf.slice(at, at + 700);
    };
    const codex = chip('slot-x2');
    const claude = chip('slot-1');
    ok('both engines really have a chip on this scene',
        codex.indexOf('41%') >= 0 && claude.indexOf('23%') >= 0);
    ok('‼️ the Codex chip names a WEEK over its figure',
        codex.indexOf('Current week: 41% used') >= 0);
    ok('‼️ …and never five hours, which is what it said for its whole life',
        !/five-hour|5-hour/i.test(codex));
    ok('…while the Claude chip beside it is unchanged',
        claude.indexOf('Five-hour window: 23% used') >= 0
        && claude.indexOf('Current week') < 0);

    // ---- the leader picker, in its own words -------------------------------
    const optAt = hf.indexOf('<option value="slot-1"');
    const opt = optAt < 0 ? '' : hf.slice(optAt, optAt + 260);
    ok('the leader picker is on this scene, with an account in it', opt.length > 0);
    ok('…and names that account\'s own window',
        opt.indexOf('23% of its five-hour window is used.') >= 0);
}

// ---- 5. nothing types the words out any more -------------------------------
{
    // ‼️ THE RULE ITSELF, AS A SWEEP. Six copies is how the drift happened and a
    // seventh would happen the same way — so a page that spells a window name in
    // its own source is the failure, whatever it happens to say today.
    //
    // ‼️ THE NOUN PHRASE, NOT THE WORDS. "The five-hour percentage that counts
    // as a wall" is the sentry CEILING's own label and names no account's
    // window; matching the phrase a reading actually carries is what keeps this
    // rule from becoming an allowlist that rots.
    const offenders = [];
    for (const f of ['afAccount.js', 'engines.js', 'missions.js', 'console.js', 'tasksPage.js']) {
        const p = path.join(ROOT, 'media', f);
        if (!fs.existsSync(p)) { continue; }
        // ‼️ CR IS A LINE TERMINATOR TO `.`, so a `.*` anchored at the end never
        // reached the end of a CRLF line and every comment in this repo read as
        // code. The first run of this sweep reported three offenders and all
        // three were prose.
        const lines = fs.readFileSync(p, 'utf8').replace(/\r/g, '').split('\n');
        lines.forEach((ln, i) => {
            const code = ln.replace(/^\s*(\/\/|\*|\/\*)[^\n]*/, '');
            const quoted = code.match(/'[^']*'|"[^"]*"|`[^`]*`/g) || [];
            if (quoted.some(q => NAMED.test(q))) {
                offenders.push(f + ':' + (i + 1) + ' ' + ln.trim().slice(0, 80));
            }
        });
    }
    if (offenders.length) { offenders.forEach(o => console.log('    ' + o)); }
    ok('‼️ no page names an account window in its own source (' + offenders.length + ' found)',
        offenders.length === 0);
}

console.log((fail ? 'FAIL' : 'ok') + ' — test_account_window_name.js: '
    + pass + ' passed, ' + fail + ' failed');
if (fail) { process.exit(1); }
