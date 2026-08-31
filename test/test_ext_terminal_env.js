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

/**
 * Every launcher script this file made. On Windows `openExternalTerminal`
 * writes a real `.cmd` (and, with an overlay, its env file); nothing here runs
 * most of them, so nothing deletes them either — and a test suite that leaves a
 * file per case per run silts up the user's own scratch folder. Swept at the
 * end, which is also the moment it can be SAID that no script left behind
 * carries a value.
 */
const MADE = [];

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
    const last = calls.length ? calls[0].args[calls[0].args.length - 1] : '';
    if (/af-run-[^\\/]+\.cmd$/.test(String(last))) { MADE.push(last); }
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
    // Widened, not loosened (X-106 added the task's own route to the overlay and
    // said why): the window has to reach past `createTerminal` or the second half
    // of the guarantee is not read at all. Measured — the call sits ~2 300
    // characters in, and its own body needs another 600.
    const body = at < 0 ? '' : tasksTs.slice(at, at + 3400);
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

/* =========================================================================
 * 6 — ‼️ THE CHARACTERS A QUALIFIED PROVIDER/MODEL NAME IS MADE OF
 *
 * X-104's acceptance line names them: `/ : [ ]`. They are not decoration —
 * OpenCode addresses a model as `<provider>/<model>` (`anthropic/claude-sonnet-4-5`),
 * a route can be written `openrouter:anthropic/claude-3.7`, and a catalog label
 * carries its state in brackets (`github-copilot/gpt-4.1 [preview]`). Every one
 * of those strings goes through places that rewrite text: a `.cmd` file read by
 * cmd.exe, a `for /f` split on `=`, a `set`, and — for the window's own title —
 * a PowerShell string literal.
 *
 * A mangled model ref is the same class of failure X-104 exists to end: the
 * process runs on something other than what every surface says it runs on. So
 * these are measured by RUNNING the thing, never by reading it.
 * ========================================================================= */
const QUALIFIED = 'anthropic/claude-sonnet-4-5';
const ROUTED = 'openrouter:anthropic/claude-3.7';
const LABELLED = 'github-copilot/gpt-4.1 [preview]';
{
    // ---- POSIX: single-quoting leaves all four alone -----------------------
    ok('a qualified provider/model survives POSIX quoting whole',
        EXT.posixEnvPrefix({ AF_M: QUALIFIED }) === `export AF_M='${QUALIFIED}'; `);
    ok('…and a routed one, with its colon', EXT.posixEnvPrefix({ AF_M: ROUTED })
        === `export AF_M='${ROUTED}'; `);
    ok('…and a bracketed label, with its space', EXT.posixEnvPrefix({ AF_M: LABELLED })
        === `export AF_M='${LABELLED}'; `);
    // …and in the COMMAND, which is where a model ref usually actually lives
    // (`opencode -m <provider>/<model>`). The command is passed through, so what
    // is pinned here is that nothing on the way rewrites it.
    const cmd = `opencode run -m ${QUALIFIED}`;
    ok('a model ref on the command line reaches the POSIX shell unrewritten',
        JSON.stringify(launched('/tmp', cmd, 'AF: x', { env: { AF_M: QUALIFIED } }, 'linux')[0].args)
            .indexOf(cmd) >= 0);
}

if (process.platform === 'win32') {
    const out = path.join(os.tmpdir(), 'af-x104-qualified.txt');
    const rm = f => { try { fs.rmSync(f, { force: true }); } catch { /* gone */ } };
    rm(out);
    const env = { AF_X104_M: QUALIFIED, AF_X104_R: ROUTED, AF_X104_L: LABELLED };
    // ‼️ The model ref is read back BOTH ways it can travel: as a variable
    // (through the file, the `for /f` and the `set`) and as an argument on the
    // command line itself (through the `.cmd` and cmd.exe's own parsing). They
    // are different paths through different rewriters, and X-104 uses both.
    const probe = launched(undefined,
        'node -e "require(\'fs\').writeFileSync(process.argv[2], JSON.stringify('
        + '[process.env.AF_X104_M, process.env.AF_X104_R, process.env.AF_X104_L,'
        + ' process.argv[1]]))" '
        + `${QUALIFIED} "${out}"`,
        'AF: dev [kimi]', { keepOpen: false, env });
    const script = lastArg(probe);
    // ‼️ Read it BEFORE running it: the last line of a `keepOpen:false` script
    // is `del "%~f0"`, so a script that has run is a script that is gone.
    const text = fs.readFileSync(script, 'utf8');
    cp.spawnSync('cmd', ['/c', script], { encoding: 'utf8' });
    let got = null;
    try { got = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { got = null; }
    ok('‼️ X-104 — a qualified provider/model reaches the Windows process whole',
        !!got && got[0] === QUALIFIED);
    ok('‼️ …and one carrying a colon as well', !!got && got[1] === ROUTED);
    ok('‼️ …and a bracketed label, brackets and space intact', !!got && got[2] === LABELLED);
    ok('‼️ …and the same ref given as a command-line ARGUMENT, not a variable',
        !!got && got[3] === QUALIFIED);
    // The title is pinned so the window can be found again (below). Brackets in
    // it are ordinary text to `title`, and must stay that way.
    ok('a bracketed title is written as itself', /\ntitle AF: dev \[kimi\]/.test(text));
    rm(out); rm(script);
}

/* =========================================================================
 * 7 — ‼️ launchId AND THE BINDINGS THAT FIND THE WINDOW AGAIN
 *
 * An OS window is not a `vscode.Terminal`: there is no object to hold, so
 * everything later done to that session — focus it, send it an Esc, tell which
 * launch it came from — is done through the record written at the spawn. The
 * external branch therefore has to write the SAME record as the integrated one,
 * minus the terminal it cannot have. A field forgotten there is not a small
 * gap: `launchId` is X-102's join, so without it a hand-opened OS window's
 * manifest describes a launch that nothing can be attached to.
 *
 * `termBindings` lives inside activate(), so the record itself is read out of
 * the source; what the record is USED for is measured against the real
 * resolver below.
 * ========================================================================= */
{
    const extTs = read('src', 'extension.ts');
    const lt = extTs.indexOf('const launchClaudeTerminal = (');
    // A wide window on purpose — see section 5: this function is mostly comment.
    const term = lt < 0 ? '' : extTs.slice(lt, lt + 9000);
    const push = /termBindings\.push\(\{([^}]*)\}\)/g;
    const records = [];
    for (let m = push.exec(term); m; m = push.exec(term)) {
        records.push(m[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean));
    }
    ok('both doors write a launch record — the OS window and the integrated one',
        records.length === 2);
    const [ext, integrated] = records;
    ok('‼️ X-104 — the OS window\'s record carries the launchId, or X-102 has nothing to join on',
        !!ext && ext.includes('launchId'));
    ok('…and the session lane, so the window can be found by session',
        !!ext && ext.includes('sessionId'));
    ok('…and the pinned title, which is the ONLY handle an OS window has',
        !!ext && ext.includes('title'));
    ok('‼️ …and it differs from the integrated record by exactly one field: the terminal',
        !!ext && !!integrated
        && JSON.stringify(integrated.filter(f => f !== 'term')) === JSON.stringify(ext));

    // ---- what the record is FOR, measured on the real resolver -------------
    const { resolveInterrupt } = require(path.join(ROOT, 'out', 'core', 'interrupt.js'));
    const pinned = 'claude: dev #7';
    // The trap this closes: an integrated terminal named for the same agent is
    // open at the same time. Esc must NOT go there — that is somebody else's
    // conversation — and the answer must name the window's own pinned title.
    const t = resolveInterrupt({
        sessionId: 'S1', agentName: 'dev',
        bindings: [{ title: pinned, sessionId: 'S1', hasTerminal: false }],
        terminalNames: ['claude: dev #3']
    });
    ok('an OS-window session resolves to the window, never to a same-named tab',
        t.kind === 'external');
    ok('…and it is searched for by ITS OWN pinned title first',
        t.kind === 'external' && t.titles[0] === pinned);

    // ---- focus follows the same rule --------------------------------------
    const fs2 = extTs.indexOf("registerCommand('agentfarm.focusSessionTerminal'");
    const focus = fs2 < 0 ? '' : extTs.slice(fs2, fs2 + 3000);
    ok('focus puts an OS window\'s own title first, for the same reason',
        /const titles = binding && !binding\.term \? \[binding\.title\] : \[\]/.test(focus));
    ok('…and does not settle for an integrated terminal when the binding has none',
        /if \(!\(binding && !binding\.term\) && match\.length\)/.test(focus));
}

/* ---- and the title survives the shell that has to find the window ---------
 *
 * Focus is done by PowerShell, so a pinned title is a PowerShell string literal
 * before it is a window title. Brackets are what a looser quoting would lose
 * first. Measured by asking PowerShell itself to read the list back — nothing is
 * activated, so no window on this desktop is touched. */
if (process.platform === 'win32') {
    const titles = ['AF: dev [kimi]', `claude: ${QUALIFIED}`, "o'brien: dev", ROUTED];
    const realExecFile = cp.execFile;
    let script = '';
    cp.execFile = (_cmd, args) => { script = args[args.length - 1]; return { on() { } }; };
    try { EXT.focusExternalTerminal(titles, () => { }); } finally { cp.execFile = realExecFile; }
    // Non-greedy and anchored on what follows: the script has a SECOND `)){`
    // in `AppActivate($t)){`, and a greedy read swallows the loop body with the
    // list — which is how a quoting test ends up measuring its own regex.
    const list = (/in @\((.*?)\)\)\{ if/.exec(script) || [])[1];
    ok('the focus script is built at all', !!list);
    const r = list ? cp.spawnSync('powershell',
        ['-NoProfile', '-NonInteractive', '-Command', `@(${list}) -join '|'`],
        { encoding: 'utf8', windowsHide: true }) : { stdout: '' };
    ok('‼️ PowerShell reads every pinned title back exactly as it was given',
        String(r.stdout).trim() === titles.join('|'));
}

/* =========================================================================
 * 8 — ‼️ AND IT LEAKS NOWHERE: NOT INTO US, NOT INTO THE NEXT WINDOW
 *
 * The other half of X-104's acceptance line. A route's value is an API key, and
 * the two ways an overlay stops being one window's business are both easy to
 * write by accident:
 *
 *   - setting it on OUR OWN process (`process.env.X = …`), which would hand it
 *     to every child VS Code spawns for the rest of the session, on every
 *     surface, for ever;
 *   - handing it to the launcher's spawn, which on Windows is `wt.exe` — a thin
 *     client whose window is created by a process that started long before this
 *     one, so the value would be given away for nothing in return.
 *
 * And two windows opened on two different routes must not be able to read each
 * other: each carries its own file, and each file is gone before its command
 * runs.
 * ========================================================================= */
{
    const KEY = 'AF_X104_LEAK_PROBE';
    const before = process.env[KEY];
    const calls = launched('C:\\tmp', 'claude "hi"', 'AF: x',
        { env: { [KEY]: SECRET } }, 'win32');
    ok('‼️ the overlay is NEVER set on the extension host\'s own process',
        process.env[KEY] === before);
    ok('‼️ …nor handed to the launcher\'s spawn, which does not own the window',
        !calls[0].o || calls[0].o.env === undefined);
    ok('…and the launcher\'s own arguments carry no value either',
        JSON.stringify(calls[0].args).indexOf(SECRET) < 0);

    // POSIX is the same rule said in the other shell: the statements are in the
    // command line the terminal is told to run, and the spawn stays bare.
    const posix = launched('/tmp', 'claude "hi"', 'AF: x', { env: { [KEY]: SECRET } }, 'linux');
    ok('POSIX sets nothing on us either', process.env[KEY] === before);
    ok('…and its spawn carries no env of its own', !posix[0].o || posix[0].o.env === undefined);

    // The Windows probe above wrote a script and its env file; neither is run,
    // so neither deletes itself.
    const script = lastArg(calls);
    try {
        const f = (fs.readFileSync(script, 'utf8').match(/in \("([^"]+af-env-[^"]+)"\)/) || [])[1];
        if (f) { fs.rmSync(f, { force: true }); }
        fs.rmSync(script, { force: true });
    } catch { /* already gone */ }
}

if (process.platform === 'win32') {
    const rm = f => { try { fs.rmSync(f, { force: true }); } catch { /* gone */ } };
    const fileOf = (script) => (fs.readFileSync(script, 'utf8')
        .match(/in \("([^"]+af-env-[^"]+)"\)/) || [])[1];
    const a = lastArg(launched('C:\\tmp', 'claude "hi"', 'AF: a',
        { env: { ANTHROPIC_BASE_URL: 'https://api.moonshot.ai/anthropic', ANTHROPIC_API_KEY: SECRET } }));
    const b = lastArg(launched('C:\\tmp', 'claude "hi"', 'AF: b',
        { env: { ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic', ANTHROPIC_API_KEY: 'sk-af-OTHER' } }));
    const fa = fileOf(a), fb = fileOf(b);
    ok('two windows on two routes get two files, never one shared one', !!fa && !!fb && fa !== fb);
    const ta = fs.readFileSync(fa, 'utf8'), tb = fs.readFileSync(fb, 'utf8');
    ok('‼️ …and neither file can be read for the other window\'s route',
        ta.indexOf('sk-af-OTHER') < 0 && tb.indexOf(SECRET) < 0
        && ta.indexOf('minimax') < 0 && tb.indexOf('moonshot') < 0);
    ok('…and each script reads only its own', fs.readFileSync(a, 'utf8').indexOf(fb) < 0);
    for (const f of [a, b, fa, fb]) { rm(f); }
}

/* ---- sweep, and say what was in what is being swept ---------------------- */
{
    let carried = 0;
    for (const script of MADE) {
        let text = '';
        try { text = fs.readFileSync(script, 'utf8'); } catch { continue; }
        if (text.indexOf(SECRET) >= 0) { carried++; }
        const envFile = (text.match(/in \("([^"]+af-env-[^"]+)"\)/) || [])[1];
        try { if (envFile) { fs.rmSync(envFile, { force: true }); } } catch { /* gone */ }
        try { fs.rmSync(script, { force: true }); } catch { /* gone */ }
    }
    // ‼️ The strongest form of section 8's rule, stated over every script this
    // file produced rather than over the one it happened to look at: a launcher
    // script is the artefact that OUTLIVES the window, so a key in one is a key
    // on disk for as long as nobody empties their temp folder.
    ok('‼️ not one launcher script ever written carried the key', carried === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
