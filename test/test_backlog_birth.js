// X-357 — the birth of a backlog line, read off the project folder's git
// history: the first commit whose diff ADDS the checkbox line carrying the code.
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'out', 'core', 'backlogBirth.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S1 = 1790000000, S2 = 1790003600, S3 = 1790007200;
// the shape `git log --reverse --format=@@AF %ct -p --unified=0` prints
const LOG = [
    `${H.BIRTH_LOG_MARK}${S1}`, '',
    'diff --git a/Backlog.md b/Backlog.md',
    '--- a/Backlog.md', '+++ b/Backlog.md',
    '@@ -10,0 +11,2 @@',
    '+- [ ] X-339 smart merge core',
    '+- [ ] Console dedup is a key, not a set — an uncoded capture',
    `${H.BIRTH_LOG_MARK}${S2}`, '',
    '--- a/Backlog.md', '+++ b/Backlog.md',
    '@@ -11 +11 @@',
    '-- [ ] X-339 smart merge core',
    '+- [/] X-339 smart merge core, reworded',
    '+- [x] P-5.3 a dotted code',
    '+  - [ ] X-400 an indented child line',
    '+see X-401 in prose — not a checkbox line',
    `${H.BIRTH_LOG_MARK}${S3}`, '',
    '+- [ ] X-340 born last\r'
].join('\n');

const first = H.firstAddedByCode(LOG);
ok('the args ask git for the oldest commit first, added lines only',
    H.birthLogArgs('Backlog.md').join(' ') === `log --reverse --format=${H.BIRTH_LOG_MARK}%ct -p --unified=0 --no-color --no-ext-diff -- Backlog.md`);
ok('‼️ a code is born at the FIRST commit that adds its line', first.get('X-339') === S1 * 1000);
ok('…a later rewording does not move it', first.get('X-339') !== S2 * 1000);
ok('a dotted code is read whole', first.get('P-5.3') === S2 * 1000);
ok('an indented checkbox line counts', first.get('X-400') === S2 * 1000);
ok('a code in prose is not a birth', !first.has('X-401'));
ok('an uncoded capture has no code to date', first.size === 4);
ok('CRLF output is read the same', first.get('X-340') === S3 * 1000);
ok('an empty or missing log is no births', H.firstAddedByCode('').size === 0 && H.firstAddedByCode(undefined).size === 0);

// ---------- which births are proposed ----------
const item = (code) => ({ code, state: 'open', text: code });
const at = first.get('X-339');
{
    const rows = H.birthsFromHistory([item('X-339'), item('X-340'), item('X-999')], [], first);
    ok('an item with no ledger at all gets its birth', rows.some(r => r.code === 'X-339' && r.ts === at));
    ok('…stamped as a reconstruction, never as something watched',
        rows.every(r => r.event === 'opened' && r.by === 'backfill' && r.uncertain === 'guess' && /first commit/.test(r.note)));
    ok('a code git never saw gets nothing', !rows.some(r => r.code === 'X-999'));
}
{
    const own = [{ code: 'X-339', event: 'opened', ts: at + 5000, by: 'agent' }];
    ok('an item with its own `opened` is left alone', H.birthsFromHistory([item('X-339')], own, first).length === 0);
    const earlier = [{ code: 'X-339', event: 'touch', ts: at - 1000, by: 'agent', session: 's' }];
    ok('a ledger already holding something EARLIER is not contradicted',
        H.birthsFromHistory([item('X-339')], earlier, first).length === 0);
    const later = [{ code: 'X-339', event: 'touch', ts: at + 86400000, by: 'agent', session: 's' }];
    ok('a ledger whose first word is LATER gains the earlier birth',
        H.birthsFromHistory([item('X-339')], later, first).length === 1);
}

// ---------- the door uses it ----------
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('runBackfill runs git with the shared args, no shell',
        /cp\.spawnSync\('git', birthLogArgs\(/.test(ext));
    ok('…and a failed git is no rows, never an error', /if \(log\.status === 0\) \{ first = firstAddedByCode/.test(ext));
    ok('…and reports how many births it found', /births: births\.length/.test(ext));
}

console.log(`test_backlog_birth.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
