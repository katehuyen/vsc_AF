// X-231 (d) — AND THE PERSON READS THE SAME ANSWER.
//
// `farm.waits` gave an autonomous process one place to ask "why am I not
// moving?". A human standing in front of the same fleet had the same question
// and a worse answer: the facts were spread over four surfaces, so "nothing is
// happening" and "five things are held up and one of them is waiting for YOU"
// looked identical from the front page.
//
// What is pinned here:
//   * the Dashboard says how many waits there are AND what would end them —
//     the split between a clock, an event and a person is the whole decision,
//     because only one of those three needs the reader to get up;
//   * a fleet with nothing held up still ANSWERS. A tile that disappears when
//     the number is zero cannot be told apart from a page that never learned
//     to ask, which is the state this item was opened about;
//   * ‼️ and the page DERIVES NO WAIT OF ITS OWN. It counts and it draws; every
//     kind, reason and verdict was decided in `core/waits.ts` and handed over.
//     A second opinion about one wait is what the whole item exists to prevent.
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = require(path.join(__dirname, 'fixtures', 'dashboard.js'));
const NOW = Date.now();
const MIN = 60 * 1000;

const page = (waits) => {
    const d = fixture.data();
    d.waits = waits;
    return runPage('dashboard.js', d).html();
};

const WAITS = [
    { kind: 'task-clock', subject: { kind: 'task', id: 't1', name: 'nightly sweep' },
        reason: 'waiting until 03:20 — retry 2 (account handover · no other claude account is '
            + 'captured on this machine)',
        since: NOW - 5 * MIN, until: NOW + 20 * MIN, blockedBy: [], clearedBy: 'clock',
        op: 'tasks.unpark' },
    { kind: 'restart-armed', subject: { kind: 'window', id: 'extensionHost', name: 'extensionHost' },
        reason: 'Waiting for 1 live console session(s) (developer) to finish',
        since: NOW - 30 * 1000, blockedBy: ['session:cs1'], clearedBy: 'event',
        op: 'farm.restartExtensionHost' },
    { kind: 'mission-approval', subject: { kind: 'mission', id: 'm1', name: 'audit' },
        reason: 'waiting for your approval (round 2)',
        since: NOW - 40 * MIN, blockedBy: [], clearedBy: 'human', op: 'missions.approve' }
];

// ---- the reading itself -----------------------------------------------------
{
    const h = page(WAITS);
    ok('the front page says how much of the fleet is held up',
        /<div class="label">Waiting<\/div>/.test(h) && /<div class="kpi"[^>]*>3</.test(h));
    ok('‼️ …and what would END them, which is the only part the reader can act on',
        h.indexOf('1 clock · 1 event · 1 human') >= 0);
    ok('‼️ …with each wait named, so the tile is not a number nobody can chase',
        h.indexOf('nightly sweep') >= 0 && h.indexOf('audit') >= 0
        && h.indexOf('waiting for your approval (round 2)') >= 0);
    ok('…and the one with a clock says when, beside the one that has none',
        /nightly sweep[^\n"]*until /.test(h.replace(/&#10;|&amp;#10;/g, '\n')));
}

// ---- the zero is an answer, not an absence ----------------------------------
{
    const h = page([]);
    ok('‼️ a fleet with nothing held up still answers — a missing tile is not a zero',
        /<div class="label">Waiting<\/div>/.test(h) && /<div class="kpi"[^>]*>0</.test(h));
    ok('…in words, because "0" alone reads as "not measured"',
        h.indexOf('nothing is held up') >= 0);
    ok('…and a page given no list at all does not break', page(undefined).indexOf('Waiting') >= 0);
}

// ---- the page decides nothing ----------------------------------------------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'dashboard.js'), 'utf8');
    ok('‼️ the page names no wait KIND — every one of them was decided in core/waits.ts',
        !/'task-clock'|'mission-approval'|'restart-armed'|'sentry-wake'|'task-unknown'/.test(src));
    ok('…and writes no reason of its own: it draws the sentence it was handed',
        /w\.reason/.test(src) && !/waiting until |waiting for your /.test(src));
}

console.log(`test_dashboard_waits: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
