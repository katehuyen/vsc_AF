// X-254 (d) — AN ITEM WHOSE SIGN-IN IS AT ITS WALL WAITS. IT IS NOT SLID ONTO
// ANOTHER PLAN.
//
// ‼️ AND THIS IS NOT A NEW RULE — it is the sibling of one already shipped, and
// the whole point of pinning it here is that a later pass must not reason about
// it a second way. `carryOnAccount` (core/accountUsage.js, X-211) MOVES a walled
// run onto another sign-in, and refuses to for a run pinned to `@machine`, in
// its own words: "'nothing is injected' is an instruction the user typed into
// the form, and a handover would inject one". That is the distinction. A
// RESOLVED account may be handed over; a STATED one is an instruction.
// `WorkItem.account` is always the stated kind — somebody typed it onto the row
// or passed it to `queue.add`.
//
// The three answers that look like details and are not:
//
//   · an item that names NO sign-in is NEVER held. Empty means "the resolved
//     account decides" (the rule the other three axes follow), and holding it
//     would enforce a decision nobody made — the queue would go quiet at 3 a.m.
//     over plans no item ever asked for;
//   · `@machine` is never held: there is no directory to inject and no window
//     to read, so there is no wall to be at;
//   · an account nobody has READ is not at the wall. -1 and 100 are opposite
//     facts (X-256) and the dangerous confusion is in this direction.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    splitByWall, MACHINE_ON_QUEUE
} = require(path.join(__dirname, '..', 'out', 'core', 'workqueue.js'));
const { MACHINE_ACCOUNT } = require(path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));
const { ACCOUNT_WALL_CEILING } = require(path.join(__dirname, '..', 'out', 'core', 'accountUsage.js'));

const T = 1788700000000;
const item = (id, account) => ({ id, text: id, account, status: 'captured', urgency: 'normal' });
// The wall reader the host injects, in miniature.
const wall = (id) => ({
    'full-1': { at: true, percent: 100, resetsAt: T + 3600_000 },
    'full-2': { at: true, percent: 100, resetsAt: 0 },
    'room-1': { at: false, percent: 12, resetsAt: T + 7200_000 }
}[id]);

// ---------- the split ----------
{
    const out = splitByWall([
        item('a', 'room-1'), item('b', 'full-1'), item('c', 'room-1')
    ], wall);
    ok('an item on a sign-in with room is takeable',
        out.ready.map(n => n.id).join(',') === 'a,c');
    ok('‼️ …and one on a walled sign-in WAITS — it is never handed to another plan, '
        + 'because an account written on an item is an instruction, not a preference',
        out.waiting.length === 1 && out.waiting[0].item.id === 'b');
    ok('the wait says WHEN it opens, so a caller can come back rather than poll',
        out.waiting[0].until === T + 3600_000);
    ok('…and says WHICH sign-in, by name — a held item with an anonymous reason '
        + 'sends the reader to another page to learn what it already knew',
        /full-1/.test(out.waiting[0].why));
    ok('an unknown reset is 0 rather than a guessed one',
        splitByWall([item('b', 'full-2')], wall).waiting[0].until === 0);
}

// ---------- the three that are never held ----------
{
    ok('‼️ an item that names NO sign-in is never held — empty means "the resolved '
        + 'account decides", and holding it enforces a decision nobody made',
        splitByWall([item('a'), item('b', ''), item('c', '   ')], wall).ready.length === 3);

    ok('‼️ @machine is never held: nothing is injected, so there is no window to be '
        + 'at the end of',
        splitByWall([item('a', MACHINE_ON_QUEUE)], wall).ready.length === 1);

    // ‼️ THE DANGEROUS DIRECTION. An account nobody has read answers `undefined`,
    // and treating that as a wall would stop the queue on a plan that may be
    // entirely empty — while treating a real 100% as unknown only spends a turn.
    ok('‼️ a sign-in nobody has READ is not at the wall — unknown and full are '
        + 'opposite facts',
        splitByWall([item('a', 'never-read')], wall).ready.length === 1);
}

// ---------- one sentinel, one ceiling ----------
{
    // ‼️ Spelt in workqueue.ts so that module keeps its single dependency, which
    // means the two spellings can drift — so they are pinned together here.
    ok('‼️ the queue and the account store mean the SAME machine sentinel',
        MACHINE_ON_QUEUE === MACHINE_ACCOUNT);
    // …and "full" is defined once, beside the rotation that already used it,
    // rather than a second number invented at the queue.
    ok('‼️ "at the wall" is one number, named where pickAccount already reads it',
        ACCOUNT_WALL_CEILING === 100);
}

// ---------- the op asks for it, and never applies it by itself ----------
{
    const fs = require('fs');
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'workqueue.ts'), 'utf8');
    ok('‼️ queue.list only narrows when the caller ASKS — a list op that quietly '
        + 'returned fewer rows would change what every caller written before today sees',
        /if \(args\.ready !== true \|\| !deps\.accountWall\) \{ return out; \}/.test(src));
    ok('…and the op says so in its own describe, or the fleet cannot know it exists',
        /ready\? \(bool/.test(src));

    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ …and the host really injects the reader — a rule with no caller is a '
        + 'rule that does not exist (Principle 1)',
        /accountWall: \(account\) => \{/.test(ext) && /ACCOUNT_WALL_CEILING/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
