// The Console's resume list, as a question instead of a fixed sentence
// (compiled core/consoleresume.js, pure).
//
// The list used to be "your shelf plus the fifteen newest transcripts", which
// answers "carry on with what I was just doing" and nothing else: the session
// from last Tuesday was indexed, alive on disk, and unreachable from the panel
// unless fourteen newer ones had not happened. These checks pin down the two
// things that make the filter trustworthy — the shelf is never cut by a row
// count, and an empty query still returns exactly the old list.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    filterResumable, isResumeFiltered, resumeRange, RESUME_DEFAULT_N, RESUME_MAX
} = require(path.join(__dirname, '..', 'out', 'core', 'consoleresume.js'));

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-07-29T12:00:00Z');
const row = (o) => Object.assign({
    title: 'a session', agentName: 'developer', tags: [], pinned: false,
    ts: NOW - DAY, origin: 'user'
}, o);

// a fleet's worth of history: 40 recent, a few old, two on the shelf
const POOL = [];
for (let i = 0; i < 40; i++) {
    POOL.push(row({ title: `recent ${i}`, ts: NOW - i * 3600000 }));
}
POOL.push(row({ title: 'shelf one', pinned: true, ts: NOW - 200 * DAY }));
POOL.push(row({ title: 'shelf two', pinned: true, ts: NOW - 9 * DAY }));
POOL.push(row({ title: 'ZEN sürüm notları', agentName: 'psikolog', ts: NOW - 40 * DAY, tags: ['zen'] }));
POOL.push(row({ title: 'nightly duty sweep', agentName: 'manager', ts: NOW - 2 * DAY, origin: 'auto' }));

// ---------- an empty query is the list exactly as it always was ----------
{
    ok('nothing asked is not a filter', !isResumeFiltered({}));
    ok('…nor is a limit on its own — that is how many, not which',
        !isResumeFiltered({ limit: 40 }));
    ok('…but any real criterion is', isResumeFiltered({ text: 'zen' })
        && isResumeFiltered({ agent: 'developer' }) && isResumeFiltered({ when: '7' })
        && isResumeFiltered({ pinnedOnly: true }) && isResumeFiltered({ userOnly: true }));

    const r = filterResumable(POOL, {}, NOW);
    ok('the default list is the shelf plus the newest fifteen',
        r.rows.length === 2 + RESUME_DEFAULT_N);
    ok('…the shelf first, whatever its age',
        r.rows[0].pinned && r.rows[1].pinned && !r.rows[2].pinned);
    ok('…then strictly newest first',
        r.rows[2].title === 'recent 0' && r.rows[3].title === 'recent 1');
    ok('…and it says how many there were in all', r.total === POOL.length);
}

// ---------- how many: yours to set, and the shelf is exempt ----------
{
    const r = filterResumable(POOL, { limit: 3 }, NOW);
    ok('a row count is honoured', r.rows.filter(x => !x.pinned).length === 3);
    ok('…and never cuts the shelf', r.rows.filter(x => x.pinned).length === 2);
    ok('…while the total still counts everything that matched', r.total === POOL.length);

    const many = [];
    for (let i = 0; i < 400; i++) { many.push(row({ title: 't' + i, ts: NOW - i * 60000 })); }
    const capped = filterResumable(many, { limit: 5000 }, NOW);
    ok('a list this panel cannot draw is capped, not sent', capped.rows.length === RESUME_MAX);
    ok('…and the count still tells the truth about what was matched', capped.total === 400);
}

// ---------- which ones ----------
{
    const byText = filterResumable(POOL, { text: 'ZEN' }, NOW);
    ok('text matches the name, whatever the case', byText.total === 1
        && byText.rows[0].title === 'ZEN sürüm notları');
    ok('…the agent counts as text too', filterResumable(POOL, { text: 'manager' }, NOW).total === 1);
    ok('…and so do the labels you put on it',
        filterResumable(POOL, { text: 'zen' }, NOW).total === 1);

    ok('one agent means exactly that agent',
        filterResumable(POOL, { agent: 'manager' }, NOW).total === 1);
    ok('…and "every agent" is not a filter at all',
        filterResumable(POOL, { agent: '' }, NOW).total === POOL.length);

    ok('the shelf on its own', filterResumable(POOL, { pinnedOnly: true }, NOW).total === 2);
    ok('…and hiding what a program started',
        filterResumable(POOL, { userOnly: true }, NOW).total === POOL.length - 1);
}

// ---------- when ----------
{
    // 25: the 24 hourly rows inside the window plus the one sitting exactly on
    // its edge — a session is in the day you ask for, not out of it by a tick
    ok('a day window keeps today and drops yesterday',
        filterResumable(POOL, { when: '1' }, NOW).total === 25);
    ok('a week window reaches further', filterResumable(POOL, { when: '7' }, NOW).total === 41);
    ok('…and "any time" reaches everything',
        filterResumable(POOL, { when: '' }, NOW).total === POOL.length);

    // ‼️ An end date that drops its own day is the off-by-one that makes a
    // filter untrustworthy: you pick the day something happened and see nothing.
    const day = new Date(NOW - 2 * DAY).toISOString().slice(0, 10);
    const exact = filterResumable(POOL, { when: 'custom', from: day, to: day }, NOW);
    ok('a single custom day includes that whole day',
        exact.rows.some(r => r.title === 'nightly duty sweep'));
    const range = resumeRange({ when: 'custom', from: '2026-07-01', to: '2026-07-02' }, NOW);
    ok('…and the end of the range is the end of its day',
        range.to === Date.parse('2026-07-02') + DAY);
    ok('a half-open custom range is still a range',
        resumeRange({ when: 'custom', from: '2026-07-01' }, NOW).to === Number.MAX_SAFE_INTEGER);
    ok('nonsense dates narrow nothing rather than hiding everything',
        resumeRange({ when: 'custom', from: 'not a date', to: '' }, NOW).from === 0);
    ok('an unknown window is "any time", not "nothing"',
        resumeRange({ when: 'soon' }, NOW).from === 0);
}

// ---------- criteria stack ----------
{
    const r = filterResumable(POOL, { text: 'recent', when: '1', limit: 4, userOnly: true }, NOW);
    ok('several criteria narrow together', r.rows.filter(x => !x.pinned).length === 4 && r.total === 25);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
