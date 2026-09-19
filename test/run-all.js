// Agent Farm test runner — runs every test_*.js in this folder sequentially
// and aggregates their "N passed, M failed" summaries. Exit 1 if anything fails.
// Usage: npm test  (compiles first — tests require out/ and read media/ files)
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * ‼️ COMPILE FIRST, ALWAYS — AND DO IT HERE, NOT ONLY IN `npm test`.
 *
 * Several suites `require` the COMPILED file (`out/core/ctxmenu.js`,
 * `out/core/health.js`, …) because those modules are pure by contract. Run
 * this file directly with a stale `out/` and they compare last build's
 * catalogue against today's package.json — and PASS, having measured nothing.
 * That is exactly how a release shipped six right-click items that were in the
 * catalogue and not in package.json: green tests, dead menu entries. Skip it
 * with AF_NO_COMPILE=1 only when you know the build is current.
 */
if (!process.env.AF_NO_COMPILE) {
    const tsc = spawnSync(process.execPath,
        [path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(__dirname, '..')],
        { encoding: 'utf8' });
    if (tsc.status !== 0) {
        console.log('FAIL compile — the tests read out/, so nothing below would have measured this build.');
        console.log(((tsc.stdout || '') + (tsc.stderr || '')).trim());
        process.exit(1);
    }
}

const files = fs.readdirSync(__dirname).filter(f => /^test_.*\.js$/.test(f)).sort();
let totalPass = 0, totalFail = 0;
const failed = [];
const t0 = Date.now();

for (const f of files) {
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], {
        encoding: 'utf8',
        timeout: 180000 // some suites spin up mock HTTP servers / child processes
    });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = /(\d+) passed, (\d+) failed/.exec(out);
    const pass = m ? Number(m[1]) : 0;
    const fail = m ? Number(m[2]) : 0;
    totalPass += pass;
    totalFail += fail;
    if (r.status !== 0 || !m || fail > 0) {
        failed.push(f);
        // ‼️ X-299 — A FILE THAT CRASHED IS NOT A FILE THAT FAILED, and the
        // line has to say which. A crash after a clean summary printed `FAIL`
        // over output where every check passed, which reads exactly like a real
        // red — so the habit it teaches is to wave the next real red through as
        // "that flaky one again". Naming it sends the reader to the teardown
        // rather than to the assertions.
        // ‼️ A TIMED-OUT OR UNSPAWNABLE FILE IS NEITHER of the two. It carries
        // `status: null` and an `error`, and calling that "died with exit null"
        // would be a third wrong label replacing the second one.
        const crashed = fail === 0 && !r.error && typeof r.status === 'number' && r.status !== 0;
        console.log(`${crashed ? 'CRASH' : 'FAIL '} ${f}`
            + (crashed ? ` — every check passed, then the process died (exit ${r.status})` : '')
            + (r.error ? ' — ' + r.error.message : ''));
        console.log(out.trim().split('\n').map(l => '    ' + l).join('\n'));
    } else {
        console.log(`ok   ${f} (${pass})`);
    }
}

/**
 * ‼️ THE SUITE SWEEPS UP AFTER ITSELF, whatever any one file forgot.
 *
 * Nearly every test builds its fixtures in `os.tmpdir()/af-*`, and a file that
 * ends on `process.exit` — or crashes — leaves the whole tree behind. Measured
 * on this machine: 14 977 folders and 16 GB of them, on a C: drive that had
 * reached ZERO bytes free and could no longer run the suite at all. One file
 * remembering its teardown is one file; this is the backstop for all 212.
 *
 * Only OUR prefix, and only what is more than a day old, so a suite running in
 * another window never has its fixtures pulled out from under it.
 */
{
    const tmp = os.tmpdir();
    const old = Date.now() - 24 * 60 * 60 * 1000;
    let swept = 0;
    for (const name of (() => { try { return fs.readdirSync(tmp); } catch { return []; } })()) {
        if (!name.startsWith('af-')) { continue; }
        const p = path.join(tmp, name);
        try {
            const st = fs.statSync(p);
            if (!st.isDirectory() || st.mtimeMs > old) { continue; }
            fs.rmSync(p, { recursive: true, force: true });
            swept++;
        } catch { /* in use, or gone already — either way not ours to force */ }
    }
    if (swept) { console.log(`\nswept ${swept} stale af-* fixture folder(s) out of ${tmp}`); }
    // ‼️ X-311 — and what the headless Chrome those fixtures drove left behind
    // (the other disk-filler: 15.5 GB of half-installed extensions in %TEMP%).
    try { require('./headless_chrome').sweepAndReport(); } catch { /* the sweep is a backstop, never a failure */ }
}

console.log(`\n${files.length} files · ${totalPass} passed · ${totalFail} failed · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) {
    console.log('Failed: ' + failed.join(', '));
    process.exit(1);
}
