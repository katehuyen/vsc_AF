// X-104 — THE OS WINDOW RUNS IN THE ENVIRONMENT THE LAUNCH RESOLVED.
//
// ‼️ WHY THIS FILE EXISTS. Of every surface that starts a CLI, the external
// terminal was the only one that carried NO environment at all. The integrated
// terminal has taken an overlay since X-101 — the agent's own variables, plus
// the route's endpoint and key, plus the names to CLEAR so an inherited
// Anthropic route cannot answer the same question a second time — and the
// external branch dropped the lot on the floor.
//
// The failure that produces is the quiet kind: with `agentFarm.externalTerminal`
// on, a session picked as Kimi opened on the DEFAULT route, and the launcher
// row, the engine badge and the launch manifest all agreed it was Kimi, because
// every one of them reads the SELECTION rather than the process. Nothing
// anywhere said otherwise.
//
// ‼️ AND THE VALUES ARE A SECRET, WHICH IS WHY THE WINDOWS HALF IS SHAPED THE
// WAY IT IS. There is no in-memory channel to an OS window on Windows: when
// Windows Terminal is already running, `wt.exe` is a thin client and the window
// is created by a process that started long before this one, so an `env:` on the
// spawn reaches nothing. The values therefore travel in a file — and the script
// reads it and DELETES it before it runs anything, so a window closed at any
// later moment, with the CLI still running or killed outright, leaves nothing
// behind. Putting them in the script itself would leave them for as long as the
// session lasts, because `del "%~f0"` is the last line and a session is exactly
// the case that never reaches it.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const EXT = require(path.join(ROOT, 'out', 'core', 'extTerminal.js'));
const { terminalEnvOverlay } = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));

/** Capture what `openExternalTerminal` hands to the OS, without launching one. */
function launched(cwd, command, title, opts, platform) {
    const realSpawn = cp.spawn;
    const realPlatform = process.platform;
    const calls = [];
    cp.spawn = (cmd, args, o) => {
        calls.push({ cmd, args, o });
        return { on() { /* the wt fallback is not exercised */ }, unref() { } };
    };
    if (platform) { Object.defineProperty(process, 'platform', { value: platform, configurable: true }); }
    try { EXT.openExternalTerminal(cwd, command, title, opts); } finally {
        cp.spawn = realSpawn;
        if (platform) { Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true }); }
    }
    return calls;
}
const lastArg = calls => calls[0].args[calls[0].args.length - 1];

const SECRET = 'sk-af-TEST-9c1e+/=key';

/* =========================================================================
 * 1 — NOTHING PASSED IS NOTHING CHANGED
 *
 * Four of the five engines have no provider axis and most launches route
 * nowhere. Every one of those windows has to keep the environment it has always
 * had, byte for byte — an absent overlay is not an instruction.
 * ========================================================================= */
{
    const bare = launched('/tmp', 'claude "hi"', 'AF: x', {}, 'linux');
    const withEmpty = launched('/tmp', 'claude "hi"', 'AF: x', { env: {} }, 'linux');
    ok('an unrouted POSIX window is byte-for-byte what it always was',
        JSON.stringify(bare[0].args) === JSON.stringify(withEmpty[0].args));
    ok('…and says nothing about any variable',
        !/export|unset/.test(JSON.stringify(bare[0].args)));
}

/* =========================================================================
 * 2 — POSIX: the statements travel in the command line, and nowhere else
 * ========================================================================= */
{
    const env = { ANTHROPIC_BASE_URL: 'https://api.moonshot.ai/anthropic', ANTHROPIC_API_KEY: SECRET, ANTHROPIC_AUTH_TOKEN: null };
    const linux = launched('/tmp', 'claude "hi"', 'AF: x', { env }, 'linux');
    const sh = JSON.stringify(linux[0].args);
    ok('a value is exported', sh.indexOf('export ANTHROPIC_BASE_URL=') >= 0);
    ok('…and a null is UNSET, which is the half a merge cannot express',
        sh.indexOf('unset ANTHROPIC_AUTH_TOKEN') >= 0);
    // ‼️ The clear comes FIRST. An inherited route name left standing beside a
    // new one is a second answer to the same question, and the order is the only
    // thing that decides which of the two the CLI reads.
    ok('…and the clearing is said before anything is set',
        sh.indexOf('unset ANTHROPIC_AUTH_TOKEN') < sh.indexOf('export ANTHROPIC_BASE_URL'));
    ok('…before the cd, so the folder\'s own shell startup already sees it',
        sh.indexOf('export ANTHROPIC_BASE_URL') < sh.indexOf('cd '));
    ok('‼️ NOTHING REACHES DISK on POSIX — the shell is our own child',
        linux[0].cmd === 'x-terminal-emulator');

    // ‼️ THE QUOTING IS MEASURED BEFORE THE LAUNCHER'S OWN ESCAPING GOES ON TOP.
    // By the time these reach cp.spawn they have been through `bash -c '…'` as
    // well, and an assertion written against three escapings at once is how a
    // quoting bug hides inside a passing test.
    const stmts = EXT.posixEnvPrefix(env);
    ok('the value is single-quoted, so $ and a backtick in a key are not read',
        stmts.indexOf(`export ANTHROPIC_API_KEY='${SECRET}'`) >= 0);
    // A key is a string somebody else generated; every one of these is a
    // character a shell would otherwise act on.
    ok('…and $ ` ! " a space and a backslash all survive quoting',
        EXT.posixEnvPrefix({ K: 'a$b`c!d"e f\\g' }) === `export K='a$b\`c!d"e f\\g'; `);
    ok('…and a single quote is closed and reopened rather than ending the word',
        EXT.posixEnvPrefix({ K: "it's" }) === `export K='it'\\''s'; `);

    const mac = launched('/tmp', 'claude "hi"', 'AF: x', { env }, 'darwin');
    ok('macOS carries the same statements through osascript',
        /export ANTHROPIC_BASE_URL=/.test(JSON.stringify(mac[0].args))
        && /unset ANTHROPIC_AUTH_TOKEN/.test(JSON.stringify(mac[0].args)));
}

/* =========================================================================
 * 3 — A NAME A SHELL CANNOT HOLD IS NOT WRITTEN
 *
 * The overlay is assembled from an agent's own variables, which a person types.
 * A broken `export` in front of the command would take the whole launch down
 * with it — the one thing worse than dropping a variable.
 * ========================================================================= */
{
    const sh = EXT.posixEnvPrefix({ 'no-dashes-allowed': 'v', '': 'v', 'GOOD_1': 'v' });
    ok('a name with a dash is left out rather than emitted broken',
        sh.indexOf('no-dashes-allowed') < 0);
    ok('…and an empty name too', sh.indexOf("export ='v'") < 0);
    ok('…while the well-formed one beside them still goes', sh === "export GOOD_1='v'; ");
    // An empty value is a clear: a shell has no third state, and "set to
    // nothing" is how a leftover route name survives as a falsy answer.
    ok('an empty value clears rather than setting emptiness',
        EXT.posixEnvPrefix({ A: '' }) === 'unset A; ');
}

/* =========================================================================
 * 4 — WINDOWS: measured by RUNNING the script, not by reading it
 * ========================================================================= */
if (process.platform === 'win32') {
    const env = {
        AF_X104_URL: 'https://api.moonshot.ai/anthropic',
        AF_X104_KEY: SECRET,
        AF_X104_ODD: '50% done, really! & <ok>',
        AF_X104_GONE: null
    };
    const calls = launched('C:\\tmp', 'claude "hi"', 'AF: x', { env });
    const script = fs.readFileSync(lastArg(calls), 'utf8');

    // ---- the secret is not in the launcher -------------------------------
    ok('‼️ THE KEY IS NOT IN THE SCRIPT, which outlives the session on a window nobody closes',
        script.indexOf(SECRET) < 0);
    const envFile = (script.match(/in \("([^"]+af-env-[^"]+)"\)/) || [])[1];
    ok('…it is in a file of its own', !!envFile && fs.existsSync(envFile));
    // ‼️ Stated as what is actually TRUE on this platform. Node's `mode` is a
    // POSIX word and Windows maps only the read-only bit of it, so asserting
    // 0600 here would be a green light for a permission nobody set. What
    // protects the file is that it is in the user's own scratch folder and that
    // it lives for the length of one `for /f` — both measurable, both below.
    ok('…in the user\'s own scratch folder, not beside the work',
        path.dirname(envFile) === os.tmpdir());
    ok('‼️ …and the script DELETES that file before it runs the command',
        script.indexOf('del /q "' + envFile) > 0
        && script.indexOf('del /q "' + envFile) < script.indexOf('claude "hi"'));
    // A name is not a secret, and a clear has no value to hide.
    ok('a clear is an ordinary line in the script', /\nset "AF_X104_GONE="/.test(script));

    // ---- and it actually works -------------------------------------------
    const out = path.join(os.tmpdir(), 'af-x104-probe.txt');
    const rm = f => { try { fs.rmSync(f, { force: true }); } catch { /* gone */ } };
    rm(out);
    // ‼️ MEASURED. The value travels through a file, `for /f`, and `set` — three
    // places cmd.exe rewrites text — so the only honest test runs the script and
    // reads back what the process was really given.
    const probe = launched(undefined,
        'node -e "require(\'fs\').writeFileSync(process.argv[1], JSON.stringify('
        + '[process.env.AF_X104_URL, process.env.AF_X104_KEY, process.env.AF_X104_ODD,'
        + ' process.env.AF_X104_GONE || \'(unset)\']))" '
        + `"${out}"`,
        'AF: t', { keepOpen: false, env: { ...env, AF_X104_GONE: null } });
    const runScript = lastArg(probe);
    const runEnvFile = (fs.readFileSync(runScript, 'utf8').match(/in \("([^"]+af-env-[^"]+)"\)/) || [])[1];
    cp.spawnSync('cmd', ['/c', runScript], { encoding: 'utf8' });
    let got = null;
    try { got = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { got = null; }
    ok('‼️ the URL really reaches the process', !!got && got[0] === env.AF_X104_URL);
    ok('‼️ …and the KEY does, with its + / and = intact', !!got && got[1] === SECRET);
    ok('…and a value carrying % ! & and < arrives whole', !!got && got[2] === env.AF_X104_ODD);
    ok('…and a cleared name is genuinely not there', !!got && got[3] === '(unset)');
    ok('‼️ …and the file the key travelled in is gone afterwards',
        !!runEnvFile && !fs.existsSync(runEnvFile));

    // ---- an unrouted window is untouched ----------------------------------
    const bare = fs.readFileSync(lastArg(launched('C:\\tmp', 'claude "hi"', 'AF: x', {})), 'utf8');
    ok('a window with no overlay writes no env file and no set lines',
        bare.indexOf('af-env-') < 0 && bare.indexOf('\nset "') < 0);

    rm(out);
    rm(envFile);
    for (const c of [calls, probe]) { rm(lastArg(c)); }
}

/* =========================================================================
 * 5 — AND BOTH CALLERS HAND IT OVER
 *
 * The component being right is not the fix. The fix is that the two doors which
 * open an OS window pass the SAME overlay their integrated twin gets — and the
 * way this regresses is somebody adding a third door and copying the old call.
 * ========================================================================= */
{
    const tasksTs = read('src', 'core', 'tasks.ts');
    const extTs = read('src', 'extension.ts');

    // An interactive task: the target says WHERE a person wants to watch it, and
    // has never been a statement about what it should run on.
    const at = tasksTs.indexOf('private openInteractive(');
    const body = at < 0 ? '' : tasksTs.slice(at, at + 2600);
    ok('the task builds its overlay ABOVE the target branch',
        /const env = terminalEnvOverlay\(/.test(body)
        && body.indexOf('terminalEnvOverlay') < body.indexOf("target === 'external'"));
    ok('…and the OS window is handed it', /openExternalTerminal\([\s\S]{0,400}?\n\s*env\n\s*\}\);/.test(body));
    ok('…and the integrated terminal takes the same one, not a second reading',
        /createTerminal\(\{[\s\S]{0,600}?\n\s*env\n\s*\}\)/.test(body));

    // The session terminal: same shape, one function up.
    // A wide window on purpose: this function is mostly comment, and a guarantee
    // must not be loosened because somebody explained themselves at length.
    const lt = extTs.indexOf('const launchClaudeTerminal = (');
    const term = lt < 0 ? '' : extTs.slice(lt, lt + 9000);
    ok('the session terminal builds its overlay above the branch too',
        /const termEnv = terminalEnvOverlay\(/.test(term)
        && term.indexOf('const termEnv') < term.indexOf("cfg().get<boolean>('externalTerminal'"));
    ok('…and the external branch passes it', /openExternalTerminal\(cwd, command, title, \{ env: termEnv \}\)/.test(term));
    ok('…and the integrated one is the same map',
        /createTerminal\(\{ name: title, cwd, env: termEnv \}\)/.test(term));
    // ‼️ The route the LAUNCHER picked, not the one settings remembers — the
    // whole point of X-103, and it must survive the move above the branch.
    ok('…resolved with the route this launch chose',
        /engineRuntimeFor\(termAgentId, engine \|\| 'claude', route\)/.test(term));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
