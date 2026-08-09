// Agent Farm test runner — runs every test_*.js in this folder sequentially
// and aggregates their "N passed, M failed" summaries. Exit 1 if anything fails.
// Usage: npm test  (compiles first — tests require out/ and read media/ files)
const { spawnSync } = require('child_process');
const fs = require('fs');
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
        console.log(`FAIL ${f}${r.error ? ' — ' + r.error.message : ''}`);
        console.log(out.trim().split('\n').map(l => '    ' + l).join('\n'));
    } else {
        console.log(`ok   ${f} (${pass})`);
    }
}

console.log(`\n${files.length} files · ${totalPass} passed · ${totalFail} failed · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) {
    console.log('Failed: ' + failed.join(', '));
    process.exit(1);
}
