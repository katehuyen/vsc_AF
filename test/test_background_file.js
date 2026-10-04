// X-500 — a state file written off the extension host's thread: the newest content wins, in
// order, a reader never sees half a file, a lock is waited out, and a shutdown flush is final.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { performance } = require('perf_hooks');
const ROOT = path.resolve(__dirname, '..');
const { BackgroundFile } = require(path.join(ROOT, 'out', 'core', 'backgroundFile.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
// a promise left hanging empties the event loop without a summary: that is a failure, not a pass
process.exitCode = 1;

// A disk the test drives: every write waits until the test lets it go.
function fakeDisk() {
    const files = new Map();
    const log = [];
    const gates = [];
    let renameFails = [];
    let writeFails = 0;
    const io = {
        mkdir: async () => { },
        write: (file, content) => new Promise((resolve, reject) => gates.push(() => {
            files.set(file, content);
            if (writeFails > 0) { writeFails--; log.push('write failed'); reject(new Error('disk full')); return; }
            log.push('write ' + content); resolve();
        })),
        rename: async (from, to) => {
            const f = renameFails.shift();
            if (f) { const e = new Error(f); e.code = f; throw e; }
            files.set(to, files.get(from)); files.delete(from); log.push('rename ' + files.get(to));
        },
        remove: async file => { files.delete(file); log.push('remove'); },
        sleep: async () => { log.push('sleep'); }
    };
    const syncWrites = [];
    const writeSync = (file, content) => { files.set(file, content); syncWrites.push(content); return { ok: true }; };
    return {
        io, files, log, syncWrites, writeSync,
        release: async bf => { for (let i = 0; i < 200 && bf.busy; i++) { while (gates.length) { gates.shift()(); } await new Promise(r => setImmediate(r)); } },
        failRenames: list => { renameFails = list; },
        failWrites: n => { writeFails = n; }
    };
}
const T = 'C:/x/state.json';

(async () => {
    {
        const d = fakeDisk();
        const bf = new BackgroundFile(T, d.io, [1, 1, 1], d.writeSync);
        const t0 = performance.now();
        bf.write('a');
        ok('‼️ write() returns at once while the disk is still holding the bytes', performance.now() - t0 < 20 && bf.busy && !d.files.has(T));
        bf.write('b');
        bf.write('c');
        await d.release(bf);
        await bf.idle();
        ok('the newest content is the one on disk', d.files.get(T) === 'c');
        ok('‼️ content superseded while a write ran is never written', !d.log.includes('write b'));
        ok('in order: what was running first, then the newest', d.log.filter(l => l.startsWith('rename')).join(',') === 'rename a,rename c');
        ok('through a temp file renamed over the target', !d.files.has(T + '.af.bg.tmp') && bf.written === 2 && !bf.busy);
    }
    {
        const d = fakeDisk();
        const bf = new BackgroundFile(T, d.io, [1, 1, 1], d.writeSync);
        d.failRenames(['EPERM', 'EBUSY']);
        bf.write('x');
        await d.release(bf); await bf.idle();
        ok('a held target is waited out and then replaced', d.files.get(T) === 'x' && d.log.filter(l => l === 'sleep').length === 2 && !bf.lastError);
    }
    {
        const d = fakeDisk();
        d.files.set(T, 'old');
        const bf = new BackgroundFile(T, d.io, [1, 1, 1], d.writeSync);
        d.failRenames(['ENOENT']);
        bf.write('x');
        await d.release(bf); await bf.idle();
        ok('another failure is not waited on: the target untouched, the temp removed, the error kept',
            d.files.get(T) === 'old' && !d.log.includes('sleep') && !d.files.has(T + '.af.bg.tmp') && /could not replace/.test(bf.lastError));
        bf.write('y');
        await d.release(bf); await bf.idle();
        ok('…and the next write goes through and clears it', d.files.get(T) === 'y' && bf.lastError === undefined);
    }
    {
        const d = fakeDisk();
        d.files.set(T, 'old');
        const bf = new BackgroundFile(T, d.io, [1, 1, 1], d.writeSync);
        d.failWrites(1);
        bf.write('x');
        await d.release(bf); await bf.idle();
        ok('a temp file that cannot be written: the target untouched, the half-written temp removed, said',
            d.files.get(T) === 'old' && !d.files.has(T + '.af.bg.tmp') && /could not write/.test(bf.lastError) && !d.log.some(l => l.startsWith('rename')));
    }
    {
        const d = fakeDisk();
        d.files.set(T, 'old');
        const bf = new BackgroundFile(T, d.io, [1, 1], d.writeSync);
        d.failRenames(['EPERM', 'EPERM', 'EPERM']);
        bf.write('x');
        await d.release(bf); await bf.idle();
        ok('a lock that outlasts every retry gives up with the target untouched', d.files.get(T) === 'old' && /could not replace/.test(bf.lastError));
    }
    {
        const d = fakeDisk();
        const bf = new BackgroundFile(T, d.io, [1], d.writeSync);
        bf.write('older');
        ok('flushSync writes before it returns', bf.flushSync('newest') === true && d.files.get(T) === 'newest' && d.syncWrites[0] === 'newest');
        await d.release(bf); await bf.idle();
        ok('‼️ a background write started before the flush never lands after it', d.files.get(T) === 'newest' && !d.log.includes('rename older'));
        ok('…and its temp file is removed', !d.files.has(T + '.af.bg.tmp'));
        bf.write('later');
        await d.release(bf); await bf.idle();
        ok('writing goes on normally after a flush', d.files.get(T) === 'later');
    }

    // The real disk.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bgfile-'));
    try {
        const f = path.join(dir, 'sub', 'state.json');
        const bf = new BackgroundFile(f);
        bf.write('{"n":1}');
        bf.write('{"n":2}');
        await bf.idle();
        ok('on the real disk: the folder is made, the newest content lands, no temp file is left',
            fs.readFileSync(f, 'utf8') === '{"n":2}' && fs.readdirSync(path.dirname(f)).join() === 'state.json');

        // The context guard keeps its store through it.
        const G = require(path.join(ROOT, 'out', 'core', 'contextGuard.js'));
        const store = path.join(dir, 'context-guard.json');
        const mk = () => new G.ContextGuard({ thresholds: () => ({ convergePct: 35, handoverPct: 40 }), read: () => undefined,
            channelFor: () => ({ channel: 'claude-hook' }), storeFile: store, now: () => 1000 });
        const g = mk();
        g.markHandedOver('s1', 'devir.md');
        await new Promise(r => setTimeout(r, 300));
        await g.stored();
        ok('the context guard\'s debounced save lands through the background writer',
            JSON.parse(fs.readFileSync(store, 'utf8')).records.some(r => r.sessionId === 's1'));
        g.markHandedOver('s2', 'devir2.md');
        g.flush();
        ok('…and its shutdown flush is on disk when flush() returns', mk().record('s2').handedOver.note === 'devir2.md');
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
    }

    // The wiring.
    const cg = fs.readFileSync(path.join(ROOT, 'src', 'core', 'contextGuard.ts'), 'utf8');
    ok('the context guard saves through it and flushes through it',
        /store\.write\(this\.storeText\(\)\)/.test(cg) && /this\.store\?\.flushSync\(this\.storeText\(\)\)/.test(cg) && !/writeFileSync/.test(cg));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the heartbeat and the web snapshot are written through it',
        /const heartbeatWriter = new BackgroundFile\(heartbeatFile\);/.test(ext) && /heartbeatWriter\.write\(String\(Date\.now\(\)\)\)/.test(ext)
        && /const snapshotWriter = new BackgroundFile\(snapshotFile\);/.test(ext) && /snapshotWriter\.write\(JSON\.stringify\(snapshot\)\)/.test(ext));
    ok('‼️ no synchronous write of those two files is left', !/writeFileSync\(heartbeatFile/.test(ext) && !/writeFileSync\(snapshotFile/.test(ext));

    console.log(`\nbackground file: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exitCode = 1; });
