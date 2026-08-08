// U-10 — THE CLOCK (media/afTime.js, loaded by both sides).
//
// The rule this file guards: every time this extension prints carries UTC in
// its hover, and a time with room around it carries UTC inline. What made it
// worth a shared module is that a bare `14:32` is only a fact if you also know
// which offset rendered it — and everything here is compared against somebody
// else's log (a provider's quota window, a rate limit, a scheduled run), all of
// which are stated in UTC.
const path = require('path');
const T = require(path.join(__dirname, '..', 'media', 'afTime.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// A fixed moment: 2026-08-08T17:14:07Z.
const TS = Date.UTC(2026, 7, 8, 17, 14, 7);

// ---------- UTC is UTC wherever this machine happens to be ----------
{
    ok('utcClock reads the UTC wall clock, not the local one',
        T.utcClock(TS) === '17:14');
    ok('…with seconds when a surface shows them', T.utcClock(TS, { seconds: true }) === '17:14:07');
    ok('utc() is the parenthesised half without the parentheses', T.utc(TS) === '17:14 UTC');
    ok('clockUtc puts the local time first and UTC in brackets',
        /^\d{1,2}[:.]\d{2}.* \(17:14 UTC\)$/.test(T.clockUtc(TS)));
    ok('full() is a date, a time and the UTC',
        /2026/.test(T.full(TS)) && /\(17:14 UTC\)$/.test(T.full(TS)));
    ok('stamp() is the same without the UTC — for a cell that has a hover',
        /2026/.test(T.stamp(TS)) && !/UTC/.test(T.stamp(TS)));
}

// ---------- the hover every clock gets ----------
{
    const tip = T.tip(TS, 'Started');
    ok('‼️ the hover names WHICH date it is — a row has three and they look alike',
        /^Started: /.test(tip));
    ok('…then the moment, to the second', /17:14:07 UTC/.test(tip));
    ok('…and which offset THIS machine rendered it in, so a difference can be read',
        /UTC[+-]\d{2}:\d{2} on this machine/.test(tip));
    ok('a hover with no label is still three facts', T.tip(TS).split('\n').length === 3);
    ok('the offset is the one at THAT moment, not today\'s',
        T.offset(TS) === T.offset(new Date(TS)));
}

// ---------- ‼️ a missing timestamp prints NOTHING, never 1 Jan 1970 ----------
//
// Every one of these is called straight out of a template string on a row whose
// date may simply not be set yet — a task that has never fired, a session with
// no end. `new Date(undefined)` gives `Invalid Date`, and a page that prints
// that has told the reader something false about their own data.
{
    for (const empty of [undefined, null, '', NaN, 'not a date']) {
        const all = [T.clock(empty), T.utc(empty), T.clockUtc(empty),
            T.stamp(empty), T.full(empty), T.ago(empty), T.offset(empty)];
        ok('nothing in, nothing out: ' + JSON.stringify(empty),
            all.every(s => s === '') && T.at(empty) === null);
    }
    ok('…and a label with no time is still the label', T.tip(null, 'Started') === 'Started');
}

// ---------- what it accepts ----------
{
    ok('a Date, a number and a numeric string are the same moment',
        T.utc(new Date(TS)) === T.utc(TS) && T.utc(String(TS)) === T.utc(TS));
    ok('an ISO string too', T.utc('2026-08-08T17:14:07.000Z') === '17:14 UTC');
}

// ---------- relative ----------
{
    ok('ago: under a minute is "just now"', T.ago(Date.now() - 5000) === 'just now');
    ok('ago: minutes', T.ago(Date.now() - 12 * 60000) === '12m ago');
    ok('ago: hours', T.ago(Date.now() - 4 * 3600e3) === '4h ago');
    ok('ago: days', T.ago(Date.now() - 3 * 24 * 3600e3) === '3d ago');
}

// ---------- both sides load the SAME file ----------
{
    const host = require(path.join(__dirname, '..', 'out', 'core', 'aftime.js'));
    ok('‼️ the extension host and the pages answer identically — one clock',
        host.utc(TS) === T.utc(TS)
        && host.full(TS) === T.full(TS)
        && host.timeTip(TS, 'Started') === T.tip(TS, 'Started')
        && host.clockUtc(TS) === T.clockUtc(TS));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
