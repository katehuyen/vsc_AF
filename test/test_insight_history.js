// E1 — insight history: does this finding keep coming back, and did what I
// did about it hold? The Insights list was a snapshot, so both questions were
// unanswerable. The ledger's whole value rests on two rules being right:
// a finding that is still listed is the SAME appearance (not a new one every
// refresh), and a finding that returns AFTER the user acted is a regression —
// the difference between "the fix worked" and "the fix looked like it worked".
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    normalizeHistory, recordSighting, recordAction, describeRecord, summarize, pruneHistory
} = require(path.join(__dirname, '..', 'out', 'core', 'insighthistory.js'));

const DAY = 24 * 3600 * 1000;
const T0 = Date.parse('2026-06-01T09:00:00Z');
const seen = (key, extra) => Object.assign({
    key, label: 'memory index is stale', agentName: 'dev', category: 'memory', severity: 'warning'
}, extra);

// ---------- sightings ----------
{
    let s = recordSighting({}, [seen('a'), seen('b')], T0);
    ok('a new finding is recorded once', s.a.occurrences === 1 && s.a.firstSeen === T0 && s.a.open);
    s = recordSighting(s, [seen('a'), seen('b')], T0 + 60_000);
    ok('a refresh is NOT a new occurrence', s.a.occurrences === 1);
    ok('…but it does move lastSeen', s.a.lastSeen === T0 + 60_000);
    ok('firstSeen never moves', s.a.firstSeen === T0);

    s = recordSighting(s, [seen('a')], T0 + 2 * DAY);          // b resolved
    ok('a finding that disappears is closed, not deleted', s.b && s.b.open === false);
    ok('…keeping its history', s.b.firstSeen === T0);
    s = recordSighting(s, [seen('a'), seen('b')], T0 + 5 * DAY); // b came back
    ok('coming back IS a new occurrence', s.b.occurrences === 2);
    ok('…and reopens it', s.b.open === true);
    ok('an untouched finding is unaffected', s.a.occurrences === 1);
    ok('the label is refreshed from the live finding',
        recordSighting(s, [seen('a', { label: 'new wording', severity: 'error' })], T0 + 6 * DAY).a.label === 'new wording');
}

// ---------- did the fix hold? ----------
{
    let s = recordSighting({}, [seen('x')], T0);
    s = recordAction(s, 'x', 'fix', T0 + 3600_000);
    ok('an action is stamped', s.x.actedAt === T0 + 3600_000 && s.x.actedKind === 'fix');
    ok('acting does not close the finding by itself', s.x.open === true);

    s = recordSighting(s, [], T0 + 2 * DAY);                    // gone after the fix
    ok('gone after an action = cleared', s.x.clearedAt === T0 + 2 * DAY && !s.x.open);
    ok('…and NOT a regression', !s.x.regressedAt);
    ok('a holding fix reads as such', /has not come back/.test(describeRecord(s.x, T0 + 3 * DAY)));

    s = recordSighting(s, [seen('x')], T0 + 9 * DAY);           // …then it came back
    ok('coming back after an action is a regression', !!s.x.regressedAt);
    ok('…and it says the fix did not hold',
        /did not hold/.test(describeRecord(s.x, T0 + 9 * DAY)));
    const again = recordSighting(recordSighting(s, [], T0 + 10 * DAY), [seen('x')], T0 + 11 * DAY);
    ok('the regression stamp is not overwritten by later churn',
        again.x.regressedAt === s.x.regressedAt);

    // a finding nobody acted on that comes and goes is NOT a regression
    let q = recordSighting({}, [seen('q')], T0);
    q = recordSighting(q, [], T0 + DAY);
    q = recordSighting(q, [seen('q')], T0 + 2 * DAY);
    ok('churn without an action is never called a broken fix', !q.q.regressedAt && q.q.occurrences === 2);

    // acting again after a regression starts the watch over
    const restarted = recordAction(s, 'x', 'delegate', T0 + 12 * DAY);
    ok('acting again clears the old verdict',
        !restarted.x.regressedAt && !restarted.x.clearedAt && restarted.x.actedKind === 'delegate');
    // acting on something already gone: it is clear FROM NOW, so a later
    // return still reads as a regression instead of never earning a verdict
    const closed = recordSighting(recordSighting({}, [seen('z')], T0), [], T0 + DAY);
    const actedOnClosed = recordAction(closed, 'z', 'fix', T0 + 2 * DAY);
    ok('acting on an already-resolved finding marks it clear from that moment',
        actedOnClosed.z.clearedAt === T0 + 2 * DAY);
    ok('…and its return is still a regression',
        !!recordSighting(actedOnClosed, [seen('z')], T0 + 4 * DAY).z.regressedAt);
}

// ---------- the sentence on the row ----------
{
    const s = recordSighting({}, [seen('n')], T0);
    ok('a fresh finding says so', /first seen today/.test(describeRecord(s.n, T0)));
    ok('an old one gives its age', /first seen 10d ago/.test(describeRecord(s.n, T0 + 10 * DAY)));
    const twice = recordSighting(recordSighting(s, [], T0 + DAY), [seen('n')], T0 + 2 * DAY);
    ok('a repeat offender leads with the count', /^2× \(came back\)/.test(describeRecord(twice.n, T0 + 2 * DAY)));
    const acted = recordSighting(recordAction(s, 'n', 'fix', T0), [seen('n')], T0 + 4 * DAY);
    ok('an action that changed nothing yet is stated honestly',
        /acted 4d ago, still here/.test(describeRecord(acted.n, T0 + 4 * DAY)));
    ok('no record = no sentence', describeRecord(undefined, T0) === '');
}

// ---------- summary + pruning + hostile input ----------
{
    let s = {};
    s = recordSighting(s, [seen('a'), seen('b'), seen('c')], T0);
    s = recordSighting(s, [seen('a')], T0 + DAY);
    s = recordSighting(s, [seen('a'), seen('b')], T0 + 2 * DAY);
    s = recordAction(s, 'c', 'fix', T0 + DAY);
    s = recordSighting(s, [seen('a'), seen('b')], T0 + 3 * DAY);
    const sum = summarize(s);
    ok('everything is tracked', sum.tracked === 3);
    ok('open counted', sum.open === 2);
    ok('recurring counted', sum.recurring === 1);
    ok('a holding fix counted', sum.fixedHolding === 1);
    ok('the worst offender leads the list', sum.top[0].key === 'b');

    const pruned = pruneHistory(s, T0 + 300 * DAY);
    ok('old CLOSED entries are pruned', !pruned.c);
    ok('…open ones never are', !!pruned.a && !!pruned.b);

    ok('garbage yields an empty ledger',
        Object.keys(normalizeHistory(null)).length === 0
        && Object.keys(normalizeHistory('x')).length === 0);
    const norm = normalizeHistory({ good: { firstSeen: 1, occurrences: 3, open: true }, bad: { label: 'x' } });
    ok('an entry without firstSeen is not a record', !norm.bad && norm.good.occurrences === 3);
    ok('missing fields get honest defaults', norm.good.lastSeen === 1 && norm.good.severity === 'info');
}

// ---------- wiring ----------
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the ledger is written from the insight refresh', /recordSighting\(insightHistory\(\)/.test(ext));
    ok('Fix stamps the ledger', /noteInsightAction\(target, 'fix'\)/.test(ext));
    ok('Delegate stamps it too', /noteInsightAction\(i, 'delegate'\)/.test(ext));
    ok('it is on the bridge', /op: 'insights\.history'/.test(ext));
    const trees = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'trees.ts'), 'utf8');
    ok('the tree row shows the repeat count', /↻\$\{rec\.occurrences\}/.test(trees));
    ok('…and flags a broken fix', /⚠back/.test(trees));
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok('the history command exists',
        pkg.contributes.commands.some(c => c.command === 'agentfarm.insightHistory'));
    ok('…and has a button on the Insights view',
        [].concat(...Object.values(pkg.contributes.menus))
            .some(m => m.command === 'agentfarm.insightHistory' && /agentfarm\.insights/.test(m.when || '')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
