// X-285 — the large-file valve as the migration gate sees it: the largest committed
// files always named, 50 MB said, 90 MB or a big file in no backup fails.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const W = require(path.join(ROOT, 'out/core/repoWeight.js'));
const C = require(path.join(ROOT, 'out/core/credentialCarry.js'));
const { migrationGate } = require(path.join(ROOT, 'out/core/migrationGate.js'));
const MB = 1048576;

// ---------- parsing git ls-tree -r -l -z ----------
const z = [
    `100644 blob aaaa1111 ${5 * MB}\tsmall.txt`,
    `100644 blob bbbb2222 ${Math.round(44.3 * MB)}\tdeep/dir/big one.jsonl`,
    `160000 commit cccc3333       -\tsub`,
    `100644 blob dddd4444 ${60 * MB}\tweird\ttab.bin`,
    ''
].join('\0');
const top = W.largestBlobs(z, 5);
ok('blobs come out largest first, gitlinks skipped', top.length === 3 && top[0].mb === 60 && top[1].mb === 44.3 && top[2].mb === 5);
ok('a path with spaces or a tab survives', top[0].file === 'weird\ttab.bin' && top[1].file === 'deep/dir/big one.jsonl');
ok('top caps the list', W.largestBlobs(z, 1).length === 1);
ok('thresholds are GitHub\'s warn line and a margin under its wall', W.BIG_WARN_MB === 50 && W.BIG_FAIL_MB === 90);
ok('verdicts', W.bigVerdict(49.9) === 'ok' && W.bigVerdict(50) === 'warn' && W.bigVerdict(90) === 'fail');
const lo = W.leftOutBig([{ file: 'a', bytes: 10 * MB }, { file: 'b', bytes: 96 * MB }, { file: 'c', bytes: 51 * MB }]);
ok('left-out keeps only files at the warn line or over, largest first', lo.length === 2 && lo[0].file === 'b' && lo[1].file === 'c');

// ---------- the gate item ----------
const gate = weight => migrationGate({
    roots: [], fs: { lstatSync: () => ({ isSymbolicLink: () => true, isDirectory: () => true }) },
    completeness: () => [], twins: () => new Map(), unportable: () => [], stores: () => [],
    repo: () => ({ root: 'D:/zone/agent', remote: 'git@github-x:o/a.git', visibility: 'hidden', why: '404', carry: C.credentialCarry([]), weight })
});
const big = v => v.items.find(i => i.id === 'repo:big-files');
{
    const v = gate({ top: [{ file: 'x.jsonl', mb: 44.3 }], leftOut: [] });
    ok('under 50 MB passes and names the largest', v.ok && big(v).ok && /largest committed: x\.jsonl \(44\.3 MB\)/.test(big(v).detail));
}
{
    // measured live: right after a reload git timed out, came back empty, and the gate said "nothing committed" — a pass
    const v = gate({ top: [], leftOut: [], unread: 'Command failed: git ls-tree (timeout)' });
    ok('‼️ an UNREAD weight fails and says so — never "nothing committed"', !v.ok && !big(v).ok
        && /could not be read/.test(big(v).detail) && !/nothing committed/.test(big(v).detail));
}
{
    const v = gate({ top: [{ file: 'w.bin', mb: 61 }], leftOut: [] });
    ok('50–90 MB passes but says GitHub warns', v.ok && /GitHub warns over 50 MB — w\.bin \(61 MB\)/.test(big(v).detail));
}
{
    const v = gate({ top: [{ file: 'f.bin', mb: 92 }, { file: 'w.bin', mb: 61 }], leftOut: [] });
    ok('‼️ a committed file of 90 MB or more fails, naming only it', !v.ok && !big(v).ok && /f\.bin \(92 MB\)/.test(big(v).detail) && !/w\.bin/.test(big(v).detail) && /refuses a push over 100 MB/.test(big(v).fix));
}
{
    const v = gate({ top: [{ file: 'x', mb: 1 }], leftOut: [{ file: 'huge.bin', mb: 120 }] });
    ok('‼️ a big file in NO backup fails — the silent carve-out is now said', !v.ok && /in NO backup — huge\.bin \(120 MB\)/.test(big(v).detail) && /local vault/.test(big(v).fix));
}
{
    const v = gate(undefined);
    ok('no weight measured: no item (a repo read that could not weigh is not a verdict)', !big(v));
}

// ---------- the wire ----------
const svc = fs.readFileSync(path.join(ROOT, 'src/service/agentRepo.ts'), 'utf8');
ok('the service weighs with one ls-tree call and the module\'s parsers',
    /'ls-tree', '-r', '-l', '-z', 'HEAD'/.test(svc) && /largestBlobs\(/.test(svc) && /leftOutBig\(untracked\)/.test(svc) && /'--exclude-standard'/.test(svc));
const psFile = 'D:/zone/agent/_setup/doctor/BigFiles.ps1';
if (fs.existsSync(psFile)) {
    const ps = fs.readFileSync(psFile, 'utf8');
    ok('the Doctor side carries the same thresholds', /\$Script:BigWarnMB = 50/.test(ps) && /\$Script:BigFailMB = 90/.test(ps));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
