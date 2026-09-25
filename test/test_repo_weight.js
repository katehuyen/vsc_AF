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

// ---------- X-401: HEAD blobs + index sizes + one batch (never ls-tree -l) ----------
const tree = [
    '100644 blob aaaa1111\tsmall.txt',
    '100644 blob bbbb2222\tdeep/dir/big one.jsonl',
    '160000 commit cccc3333\tsub',
    '100644 blob dddd4444\t"weird\\ttab.bin"',
    '100644 blob eeee5555\tnever-stated.bin',
    '100644 blob ffff6666\tstaged.bin',
    '100644 blob 99997777\tgone.bin',
    ''
].join('\n');
const head = W.headBlobs(tree);
ok('HEAD blobs by path, gitlinks skipped', head.size === 6 && head.get('small.txt') === 'aaaa1111' && !head.has('sub'));
const dbg = (mode, hash, file, size) => [`${mode} ${hash} 0\t${file}`, '  ctime: 1:0', '  mtime: 1:0',
    '  dev: 0\tino: 0', '  uid: 0\tgid: 0', `  size: ${size}\tflags: 0`].join('\n');
const index = [
    dbg('100644', 'aaaa1111', 'small.txt', 5 * MB),
    dbg('100644', 'bbbb2222', 'deep/dir/big one.jsonl', Math.round(44.3 * MB)),
    dbg('160000', 'cccc3333', 'sub', 0),
    dbg('100644', 'dddd4444', '"weird\\ttab.bin"', 60 * MB),
    dbg('100644', 'eeee5555', 'never-stated.bin', 0),
    dbg('100644', '12341234', 'staged.bin', 1),
    dbg('100644', 'abcdabcd', 'untracked-in-head.bin', 70 * MB),
    ''
].join('\n');
const cached = W.indexSizes(index, head);
ok('an index entry holding the HEAD blob gives its size', cached.get('small.txt') === 5 * MB && cached.get('deep/dir/big one.jsonl') === Math.round(44.3 * MB));
ok('a quoted path matches itself across the two lists', cached.get('"weird\\ttab.bin"') === 60 * MB);
ok('size 0 is asked, not believed', !cached.has('never-stated.bin'));
ok('‼️ a staged change (index hash differs) is asked — the index size is not the committed one', !cached.has('staged.bin'));
ok('an index path not in HEAD is ignored', !cached.has('untracked-in-head.bin') && cached.size === 3);
const asked = W.batchSizes(['eeee5555 blob ' + 93 * MB, 'ffff6666 blob ' + 2 * MB, '99997777 missing', ''].join('\n'));
ok('batch sizes by hash, a missing line carries none', asked.get('eeee5555') === 93 * MB && asked.get('ffff6666') === 2 * MB && !asked.has('99997777'));
const top = W.largestBlobs(head, cached, asked, 5);
ok('index and batch sizes merge, largest first', top.length === 5 && top[0].file === 'never-stated.bin' && top[0].mb === 93 && top[1].mb === 60 && top[2].mb === 44.3);
ok('a path with spaces survives; an unanswered blob is left out', top[2].file === 'deep/dir/big one.jsonl' && !top.some(t => t.file === 'gone.bin'));
ok('top caps the list', W.largestBlobs(head, cached, asked, 1).length === 1);
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
ok('‼️ the service never asks ls-tree for sizes (-l read every blob header: 259 s)', !/'ls-tree'[^\]]*'-l'/.test(svc) && /'ls-tree', '-r', 'HEAD'/.test(svc));
ok('the service weighs from the index, then one fed batch, with the module\'s parsers',
    /'ls-files', '-s', '--debug'/.test(svc) && /'cat-file', '--batch-check'/.test(svc) && /cp\.spawn\(/.test(svc)
    && /core\.quotepath=off/.test(svc) && /indexSizes\(/.test(svc) && /batchSizes\(/.test(svc)
    && /leftOutBig\(untracked\)/.test(svc) && /'--exclude-standard'/.test(svc));
ok('an unread tree or batch is carried as unread', /const unread = tree\.err \|\| batch\.err/.test(svc));
const psFile = 'D:/zone/agent/_setup/doctor/BigFiles.ps1';
if (fs.existsSync(psFile)) {
    const ps = fs.readFileSync(psFile, 'utf8');
    ok('the Doctor side carries the same thresholds', /\$Script:BigWarnMB = 50/.test(ps) && /\$Script:BigFailMB = 90/.test(ps));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
