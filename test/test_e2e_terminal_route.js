// X-117 — THE TERMINAL DOORS, END TO END: integrated and external, on a route.
//
// The Console door (test_e2e_console_route.js) hands a spawn a COMPLETE
// environment, so leaving a name out removes it. A terminal is the opposite
// shape of problem and the reason `terminalEnvOverlay` exists at all: VS Code
// merges an OVERLAY onto the window's own environment, and the OS window is
// handed the same map to say in its shell's own words. On both of those, a
// route name left unsaid SURVIVES inherited — so the clearing has to be spoken,
// and until now nothing ran a real CLI through either rendering to see whether
// it was heard.
//
// The real `claude` CLI is run here three ways against local mock endpoints,
// each time in a window that ALREADY carries an inherited route:
//
//   1. Integrated — VS Code's documented merge (`string` sets, `null` removes)
//      applied to the window's environment, exactly as the API declares it.
//   2. External on Windows — the `.cmd` the launcher really writes, run by
//      cmd.exe: `set "NAME="` is the clearing and the values arrive through a
//      file the script eats and deletes.
//   3. External on POSIX — the `export`/`unset` prefix, run by a real shell.
//
// And the clearing is FALSIFIED rather than asserted: the same run with the
// route's `clearEnv` dropped is expected to carry the inherited bearer onto the
// wire. A guard nothing can turn red is not a guard.
//
// Skipped (not failed) when the CLI is not on PATH; the POSIX scene is skipped
// where no `bash` actually runs.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const RT = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
const X = require(path.join(ROOT, 'out', 'core', 'extTerminal.js'));
const { cliPresent, anthropicMock: mock } = require('./e2e_mocks');

const TURN = 'claude -p "say ping" --output-format stream-json --verbose --max-turns 1';

/**
 * ‼️ VS CODE'S OWN RULE, WRITTEN OUT — the integrated terminal is the one door
 * this test cannot actually open, so the merge it performs is reproduced from
 * the declaration `terminalEnvOverlay` was built against:
 *
 *     env?: { [key: string]: string | null | undefined }
 *
 * a value SETS, `null` REMOVES, and a name that is simply absent is untouched.
 * Reproducing it is what makes the third case observable at all: an overlay
 * that forgot a name looks identical to one that cleared it until something
 * merges the two.
 */
function vscodeMerge(windowEnv, overlay) {
    const out = { ...windowEnv };
    for (const [k, v] of Object.entries(overlay || {})) {
        if (v === null) { delete out[k]; continue; }
        if (v === undefined) { continue; }
        out[k] = String(v);
    }
    return out;
}

/**
 * A shell that RUNS, not one that is merely found. On Windows the first `bash`
 * on a PowerShell PATH is WSL's stub (System32\bash.exe): with no distribution
 * installed it exits 1 and prints its complaint on stdout, so the POSIX scene
 * failed whenever the suite was launched from PowerShell rather than Git Bash.
 * Git's own bash is preferred; any candidate must answer `exit 0` to count.
 */
function posixBash() {
    const cands = [];
    if (process.platform === 'win32') {
        try {
            const git = cp.execSync('where git', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim();
            const root = path.resolve(path.dirname(git), '..');
            cands.push(path.join(root, 'bin', 'bash.exe'), path.join(root, 'usr', 'bin', 'bash.exe'));
        } catch { /* no git on PATH */ }
    }
    if (cliPresent('bash')) { cands.push('bash'); }
    for (const c of cands) {
        if (c !== 'bash' && !fs.existsSync(c)) { continue; }
        const r = cp.spawnSync(c, ['-c', 'exit 0'], { windowsHide: true, timeout: 20000 });
        if (r.status === 0) { return c; }
    }
    return null;
}

function run(cmd, args, env, cwd) {
    return new Promise(resolve => {
        const child = cp.spawn(cmd, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        const kill = setTimeout(() => child.kill(), 120000);
        child.on('close', code => { clearTimeout(kill); resolve({ code, out, err }); });
    });
}

async function main() {
    if (!cliPresent('claude')) {
        console.log('  skipped: the claude CLI is not on PATH');
        console.log(`\n${pass} passed, ${fail} failed`);
        return;
    }
    const kimiM = await mock();
    const wrongM = await mock();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-term-'));
    try {
        // ‼️ A KEY CARRYING `=`, `%` AND `!` — the three characters the Windows
        // script's own comment claims to survive (`tokens=1,* delims==` splits on
        // the FIRST `=`; the value is substituted after parsing). A real key is
        // base64 and the claim has never been run.
        const KEY = 'sk-kimi-CANARY=%x!y';
        const profiles = [{ id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'kimi', baseUrl: kimiM.url,
            authKind: 'api-key', tiers: { opus: 'kimi-k2' }, revision: 3 }];
        const inherited = { ANTHROPIC_BASE_URL: wrongM.url, ANTHROPIC_API_KEY: 'sk-inherited-CANARY',
            ANTHROPIC_AUTH_TOKEN: 'sk-inherited-bearer-CANARY' };
        const adapter = R.adapterFor('claude', { profiles, secretFor: () => KEY, inheritedEnv: inherited });
        const rt = adapter.resolveRuntime({ engine: 'claude', providerId: 'kimi', tier: 'opus' });

        // The window a person is sitting in: the machine's environment with an
        // inherited route already in it, and no config home of this session's.
        const windowEnv = {};
        for (const [k, v] of Object.entries(process.env)) {
            if (!RT.isRouteEnvName(k) && k !== 'CLAUDE_CONFIG_DIR') { windowEnv[k] = v; }
        }
        Object.assign(windowEnv, inherited);
        // The layer the launcher passes as `env` — the account's config home.
        const account = { CLAUDE_CONFIG_DIR: tmp, DISABLE_TELEMETRY: '1',
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
        const overlay = RT.terminalEnvOverlay([account], rt);

        // Only the names the route does NOT write itself are left as a removal —
        // one it writes is answered by the value, which is the stronger statement.
        const removed = (rt.clearEnv || []).filter(n => !(n in (rt.spawnEnv || {})));
        ok('the overlay SAYS the clearing rather than leaving the names out',
            removed.length > 0 && removed.every(n => overlay[n] === null));
        ok('‼️ …as null and not as a blank, which is a value the CLI still finds',
            removed.every(n => overlay[n] !== ''));

        // ---- 1. integrated terminal ----
        const intRun = await run(TURN.split(' ')[0],
            ['-p', 'say ping', '--output-format', 'stream-json', '--verbose', '--max-turns', '1'],
            vscodeMerge(windowEnv, overlay), tmp);
        ok('the integrated-terminal turn finished', intRun.code === 0);
        if (intRun.code !== 0) { console.log('  stderr:', intRun.err.slice(0, 400)); }
        ok('‼️ the integrated terminal reached ITS route, with its key and tier model',
            kimiM.posts().length >= 1 && kimiM.posts().every(h => h.key === KEY && h.model === 'kimi-k2'));
        ok('‼️ …and the route already in the window was never reached', wrongM.posts().length === 0);
        ok('‼️ …and no inherited bearer rode along (the clearing, not the overwrite)',
            kimiM.hits.every(h => !/inherited/.test(h.auth)));
        const afterIntegrated = kimiM.hits.length;

        // ---- 2. external terminal, the script cmd.exe really runs ----
        if (process.platform === 'win32') {
            const exitFile = path.join(tmp, 'exit.txt');
            const script = X.writeWindowsRunScript(tmp, TURN, 'af e2e', exitFile, overlay);
            const text = fs.readFileSync(script, 'utf8');
            const envFile = (/in \("([^"]+)"\)/.exec(text) || [])[1];
            ok('‼️ the key never reaches the script itself', !text.includes(KEY));
            ok('the clearing is written as a real removal',
                removed.every(n => text.includes(`set "${n}="`)));
            const extRun = await run('cmd', ['/c', script], windowEnv, tmp);
            /**
             * ‼️ THE LAUNCHER'S OWN CODE SAYS NOTHING HERE, AND THAT IS THE
             * DESIGN RATHER THAN A FLAW IN IT. The script's last line deletes
             * the script, so cmd.exe reaches for a line that is no longer there
             * and returns its own complaint — measured: "The batch file cannot
             * be found", after the CLI has already finished. That is precisely
             * why `exitFile` exists: the run's answer travels through the file,
             * the only channel a window this process does not own has.
             */
            ok('the external-terminal turn finished',
                fs.existsSync(exitFile) && Number(fs.readFileSync(exitFile, 'utf8').trim()) === 0);
            if (!fs.existsSync(exitFile)) { console.log('  stderr:', (extRun.err + extRun.out).slice(0, 400)); }
            const mine = kimiM.hits.slice(afterIntegrated);
            ok('‼️ the OS window reached ITS route, with a key carrying =, % and !',
                mine.filter(h => h.method === 'POST').length >= 1
                && mine.filter(h => h.method === 'POST').every(h => h.key === KEY && h.model === 'kimi-k2'));
            ok('‼️ …and the route already in the window was never reached', wrongM.posts().length === 0);
            ok('‼️ …and no inherited bearer rode along', mine.every(h => !/inherited/.test(h.auth)));
            ok('‼️ the values file the script ate is gone', !!envFile && !fs.existsSync(envFile.split('%%').join('%')));
            ok('‼️ …and so is the script', !fs.existsSync(script));
        } else {
            console.log('  skipped: the Windows script scene needs win32');
        }

        // ---- 3. external terminal, a real POSIX shell ----
        const afterWindows = kimiM.hits.length;
        const bash = posixBash();
        if (bash) {
            const prefix = X.posixEnvPrefix(overlay);
            const shRun = await run(bash, ['-c', prefix + TURN], windowEnv, tmp);
            ok('the POSIX-shell turn finished', shRun.code === 0);
            if (shRun.code !== 0) { console.log('  stderr:', shRun.err.slice(0, 400)); }
            const mine = kimiM.hits.slice(afterWindows).filter(h => h.method === 'POST');
            ok('‼️ the POSIX window reached ITS route, with its key and tier model',
                mine.length >= 1 && mine.every(h => h.key === KEY && h.model === 'kimi-k2'));
            ok('‼️ …and the route already in the window was never reached', wrongM.posts().length === 0);
            ok('‼️ …and `unset` really removed the inherited bearer',
                kimiM.hits.slice(afterWindows).every(h => !/inherited/.test(h.auth)));
        } else {
            console.log('  skipped: the POSIX scene needs a bash that runs');
        }

        // ---- 4. the clearing, falsified ----
        // The same route with nothing to clear: the endpoint and key are still
        // written, so ONLY the clearing can be keeping the inherited bearer off
        // the wire. If this turn does not carry it, the checks above are
        // certifying something that was never at risk.
        const afterAll = kimiM.hits.length;
        const noClear = RT.terminalEnvOverlay([account], { spawnEnv: rt.spawnEnv, clearEnv: [] });
        const leakRun = await run('claude',
            ['-p', 'say ping', '--output-format', 'stream-json', '--verbose', '--max-turns', '1'],
            vscodeMerge(windowEnv, noClear), tmp);
        const leaked = kimiM.hits.slice(afterAll);
        ok('‼️ with nothing cleared the inherited bearer DOES reach the route\'s wire — so the clearing is what keeps it off',
            leaked.length >= 1 && leaked.some(h => /inherited/.test(h.auth)));
        if (!leaked.some(h => /inherited/.test(h.auth))) {
            console.log('  leak scene:', leakRun.code, JSON.stringify(leaked.map(h => ({ a: h.auth, k: h.key }))).slice(0, 300));
        }

        ok('‼️ no key reached any output', !/CANARY/.test(intRun.out + intRun.err));
    } finally {
        await Promise.all([kimiM.close(), wrongM.close()]);
        await new Promise(r => setTimeout(r, 400));
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
