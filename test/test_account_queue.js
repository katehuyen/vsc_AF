// X-206 — READING EVERY ACCOUNT WITHOUT BECOMING THE THING THAT BURNS THE QUOTA.
//
// ‼️ The failure this suite exists to prevent is `refreshAll()`. `accountUsage`
// refuses to have one on purpose: a method that reads every slot at once is the
// multiplication that module was written to stop. The user's question — *which
// of these do I switch to, and how much is left in each* — is answered instead
// by a LINE: N requests, spaced by the machine's own floor, taken in turn.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const q = require(path.join(__dirname, '..', 'out', 'core', 'accountQueue.js'));
const { MIN_FETCH_INTERVAL_MS } = require(path.join(__dirname, '..', 'out', 'core', 'planusage.js'));

const NOW = Date.parse('2026-09-05T12:00:00Z');

// ---------- the gesture ----------
{
    let s = q.emptyQueue();
    ok('an empty line has nobody waiting and nobody in the chair',
        !s.pending.length && !s.reading && q.positionOf(s, 'a') === 'idle');

    s = q.toggle(s, 'a');
    ok('pressing a card puts it in the line', q.positionOf(s, 'a') === 'queued' && q.placeOf(s, 'a') === 1);

    s = q.toggle(s, 'b');
    ok('…and the next one goes behind it, in the order they were asked for',
        q.placeOf(s, 'a') === 1 && q.placeOf(s, 'b') === 2);

    // ‼️ A queue you cannot leave is a queue you learn not to join.
    s = q.toggle(s, 'a');
    ok('‼️ pressing a WAITING card again takes it back out',
        q.positionOf(s, 'a') === 'idle' && q.placeOf(s, 'b') === 1);

    ok('an empty id is not a member of anything', JSON.stringify(q.toggle(s, '')) === JSON.stringify(s));
}

// ---------- a request already in flight cannot be un-asked ----------
{
    let s = q.enqueue(q.emptyQueue(), ['a', 'b']);
    const started = q.startNext(s, NOW);
    s = started.state;
    ok('the head of the line is the one that goes', started.slotId === 'a' && s.reading === 'a');
    ok('…and it is out of the waiting list while it is in the chair',
        q.positionOf(s, 'a') === 'reading' && !s.pending.includes('a'));

    // ‼️ The figure WILL land. A control that said "cancelled" would leave the
    // reader expecting the old number and getting a new one.
    const same = q.toggle(s, 'a');
    ok('‼️ a slot being read RIGHT NOW cannot be cancelled — the request is already gone',
        same === s && q.positionOf(same, 'a') === 'reading');
}

// ---------- the spacing is the machine's floor, not a number chosen here ------
{
    let s = q.enqueue(q.emptyQueue(), ['a', 'b', 'c']);
    s = q.startNext(s, NOW).state;
    s = q.finish(s, 'a');
    ok('nothing starts again the instant the last one finished',
        q.startNext(s, NOW + 1).slotId === '' && q.startNext(s, NOW + MIN_FETCH_INTERVAL_MS - 1).slotId === '');
    ok('‼️ …and the wait is the SAME floor a mashed refresh button is held to',
        q.nextDueAt(s) === NOW + MIN_FETCH_INTERVAL_MS
        && MIN_FETCH_INTERVAL_MS === 5000);

    const go = q.startNext(s, NOW + MIN_FETCH_INTERVAL_MS);
    ok('past the floor the next one in line goes, and only that one',
        go.slotId === 'b' && go.state.pending.join(',') === 'c');

    // Two reads never overlap: the second is what would make three accounts
    // cost three simultaneous requests, which is the whole thing being avoided.
    ok('‼️ nothing starts while one is in the chair, however long it has been',
        q.startNext(go.state, NOW + 10 * MIN_FETCH_INTERVAL_MS).slotId === '');
}

// ---------- "all of them" adds; it does not reshuffle ----------
{
    let s = q.enqueue(q.emptyQueue(), ['b']);
    s = q.enqueue(s, ['a', 'b', 'c']);
    ok('‼️ pressing "all" keeps whoever was already waiting in the place they had',
        s.pending.join(',') === 'b,a,c');
    ok('…and nobody is queued twice', q.enqueue(s, ['a', 'b']).pending.join(',') === 'b,a,c');

    let r = q.startNext(q.enqueue(q.emptyQueue(), ['x']), NOW).state;
    ok('…and the one being read is not queued again behind itself',
        q.enqueue(r, ['x']).pending.length === 0);

    ok('clearing empties the line and leaves the one in flight alone',
        q.clear(r).reading === 'x' && q.clear(s).pending.length === 0);
}

// ---------- nothing is due when nothing is waiting ----------
{
    ok('an empty line has no next time — a timer set on it would be a wake-up for nothing',
        q.nextDueAt(q.emptyQueue()) === 0);
    const s = q.startNext(q.enqueue(q.emptyQueue(), ['a']), NOW).state;
    ok('…and neither does one whose only member is already being read', q.nextDueAt(s) === 0);
    ok('the very first read waits for nothing — the floor is about the PREVIOUS one',
        q.startNext(q.enqueue(q.emptyQueue(), ['a']), NOW).slotId === 'a');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
