// X-501 — THE PHONE HOST'S FILES ARE WRITTEN OFF THE HOST'S THREAD, IN ORDER.
//
// QueuedFile's promise is what CallMemory's "on disk before it runs" rests on:
// write() resolves only once a write that STARTED after the ask is on disk, asks
// made before a write starts share it, and a failure is logged, never thrown.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { QueuedFile } = require(path.join(ROOT, 'out', 'remote', 'server', 'queuedFile.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-queued-'));
const file = path.join(dir, 'sub', 'state.json');
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'));

(async () => {
    try {
        let state = { n: 0 }, renders = 0;
        const q = new QueuedFile(file, () => { renders++; return JSON.stringify(state); });
        state = { n: 1 };
        const a = q.write();
        state = { n: 2 };
        const b = q.write();
        ok('asks made before a write starts share it', a === b);
        ok('nothing is written on the caller\'s turn', !fs.existsSync(file));
        await a;
        ok('the shared write renders what stood when it started', disk().n === 2 && renders === 1);

        const c = q.write();
        await Promise.resolve();
        state = { n: 3 };
        const d = q.write();
        ok('an ask after a write has started gets a write of its own', c !== d);
        await d;
        ok('…which holds the later state', disk().n === 3 && renders === 3);
        ok('the folder is made when missing, and no temp file is left', fs.existsSync(path.dirname(file)) && !fs.existsSync(file + '.tmp'));

        const order = [];
        const r = new QueuedFile(file, () => { order.push(state.n); return JSON.stringify(state); });
        for (let i = 4; i <= 6; i++) { state = { n: i }; void r.write(); await Promise.resolve(); }
        await r.settled();
        ok('writes run one at a time, in order, and the newest lands last', disk().n === 6 && order.join() === [...order].sort().join());

        const blocker = path.join(dir, 'blocker');
        fs.writeFileSync(blocker, 'x');
        const lines = [];
        const bad = new QueuedFile(path.join(blocker, 'f.json'), () => '{}', l => lines.push(l));
        let threw = false;
        try { await bad.write(); } catch { threw = true; }
        ok('a write that fails resolves, it does not throw', threw === false);
        ok('…and says so, naming the file', lines.length === 1 && /f\.json not written/.test(lines[0]));
        await bad.write();
        ok('…and the next ask tries again', lines.length === 2);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`remote queued file: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
