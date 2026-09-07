// X-254 — THE WORK QUEUE'S FOURTH ROUTE AXIS: WHOSE PLAN PAYS.
//
// ‼️ WHAT WAS MEASURED (2026-09-07). `WorkItem` carries `engine · model ·
// effort` and its own comment counts three of four: "the age of five engines
// asks instead: which engine, on which model, at what effort". The fourth —
// the ACCOUNT — was never written; the word did not appear in the file once.
//
// And the queue is exactly where the autonomous fleet takes its work from. With
// no axis there, a sentry runner cannot be told "do this one on that plan", the
// queue cannot be filtered by sign-in, and one account hitting its wall cannot
// change what gets picked up next.
//
// ‼️ AN EMPTY ACCOUNT IS A REAL ANSWER, exactly as it is on the other three:
// "this item does not care, the resolved account decides". So nothing is
// defaulted at capture — a value invented there is indistinguishable from one
// the user chose, and `(none)` must go on meaning "the ones nobody claimed".
//
// ‼️ AND IT IS NOT LOWER-CASED. The other axes are: `engine` is an id and
// `effort` is a word. An account is a SLOT ID the user minted, and folding its
// case would point at a directory that does not exist.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const Q = require(path.join(__dirname, '..', 'out', 'core', 'workqueue.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------- the axis exists and behaves like its three siblings ----------
{
    const r = Q.coerceRoute({ engine: ' Claude ', account: '  claude-murvietnam-2  ' });
    ok('the account rides on the same coercion as the other three axes',
        r.account === 'claude-murvietnam-2');
    ok('‼️ …and is NOT lower-cased, because a slot id is a directory name',
        Q.coerceRoute({ account: 'Claude-WMM' }).account === 'Claude-WMM');
    ok('an empty one is left OFF the object, so "nobody said" has one spelling',
        !('account' in Q.coerceRoute({ account: '   ' })));
    ok('…and the engine beside it still behaves as it did',
        r.engine === 'claude');
}

// ---------- capture ----------
{
    const n = Q.makeWorkItem({ text: 'do the thing', account: 'slot-2' });
    ok('an item can say whose plan should pay for it', n.account === 'slot-2');
    ok('‼️ …and one that does not say is left EMPTY, never defaulted',
        Q.makeWorkItem({ text: 'x' }).account === undefined);
}

// ---------- the filter, including the sentinel ----------
{
    const mk = (id, account) => Object.assign(Q.makeWorkItem({ text: id, account }), { id });
    const list = [mk('a', 'slot-1'), mk('b', 'slot-2'), mk('c', undefined)];
    const ids = f => Q.filterItems(list, f).map(n => n.id).sort().join('');
    ok('"the work for this sign-in" is one call', ids({ account: 'slot-2' }) === 'b');
    ok('‼️ "the work nobody claimed a plan for" is a DIFFERENT call',
        ids({ account: '(none)' }) === 'c');
    ok('‼️ …and omitting the axis means EVERY item, claimed or not',
        ids({}) === 'abc');
}

// ---------- moving one axis never moves another ----------
{
    const n = Q.makeWorkItem({ text: 'x', engine: 'claude', account: 'slot-2' });
    const store = { engine: n.engine, account: n.account };
    ok('the item starts with both axes set', store.engine === 'claude' && store.account === 'slot-2');
    // setRoute is the store's, so the shape is pinned on coerceRoute + the op's
    // describe; what matters here is that clearing is expressible at all.
    ok('an account can be cleared, which is what "unclaimed" means',
        !('account' in Q.coerceRoute({ engine: 'claude', account: '' })));
}

// ---------- the bridge carries it, and SAYS it (agentfarm-dev rule 1) ----------
{
    const reg = new BridgeRegistry();
    Q.registerQueueOps(reg, {
        store: new Q.WorkQueueStore(path.join(__dirname, '..', '.tmp', 'queue-account-test.json')),
        onChange: () => { }, resolveProject: () => undefined
    });
    const ops = reg.catalog();
    const describeOf = op => {
        const row = ops.find(o => o.op === op);
        return row ? String(row.describe || '') : '';
    };
    ['queue.add', 'queue.list', 'queue.route', 'queue.edit'].forEach(op => {
        ok('‼️ ' + op + ' names the account axis in its own describe, or an agent '
            + 'cannot know it exists', /account/i.test(describeOf(op)));
    });
}

console.log((fail ? 'FAIL' : 'ok') + ' — test_queue_account.js: '
    + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
