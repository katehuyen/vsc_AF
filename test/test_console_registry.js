// S-37 (reopened) — the Console's own record of which sessions it hosted, and
// the origin rule that stops guessing when that record is the only evidence.
//
// WHAT WENT WRONG, MEASURED ON THE USER'S MACHINE. `console-sessions.json` held
// every Console session up to 2026-08-14 19:51 and then nothing until
// 2026-08-16 12:18 — one whole day of the user's own dialogs missing, with
// exactly three exceptions: the three whose cards were still open in the panel.
// The store was read into memory once, at activation, and written back WHOLE on
// every change, so a window that had been open since the day before overwrote
// everything a second window had added. With the note gone there was nothing
// left to read but `entrypoint: "sdk-cli"` — which a Console conversation and a
// headless `claude -p` both write — and eight of the user's own conversations
// drew 🤖 automation on every surface.
//
// Two rules are held here:
//   1. the store only ever GROWS — no window can erase another's ids;
//   2. inside an agent's folder, the absence of one of Agent Farm's own records
//      means the run was NOT one of Agent Farm's.
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + (JSON.stringify(a) === JSON.stringify(b) ? '' :
    `: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`), JSON.stringify(a) === JSON.stringify(b));

const R = require(path.join(__dirname, '..', 'out', 'core', 'consoleRegistry.js'));
// `sessions.ts` imports vscode for the index class; the two pure functions this
// file is about do not, so the module is loaded with the usual stub.
const S = (() => {
    const Module = require('module');
    const orig = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                Uri: {}, window: {}, EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } },
                workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                ViewColumn: {}, ConfigurationTarget: {}, env: {}
            };
        }
        return orig.apply(this, arguments);
    };
    try { return require(path.join(__dirname, '..', 'out', 'core', 'sessions.js')); }
    finally { Module._load = orig; }
})();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-console-reg-'));
const file = path.join(dir, 'console-sessions.json');

// ---------- the store ----------
{
    eq('a missing file is no ids, not an error', R.readConsoleIds(file), []);
    eq('so is a corrupt one', R.readConsoleIds(
        (fs.writeFileSync(path.join(dir, 'bad.json'), '{oops'), path.join(dir, 'bad.json'))), []);

    const first = R.recordConsoleIds(file, [], ['a', 'b']);
    eq('a first write puts the live cards on disk', first.ids, ['a', 'b']);
    eq('…and says what it added', first.added, ['a', 'b']);
    eq('…and the file agrees', R.readConsoleIds(file), ['a', 'b']);

    // ‼️ THE WHOLE BUG, IN ONE ASSERTION. `stale` is a second window's view of
    // the world, taken before 'b' existed. Writing its snapshot whole is what
    // deleted a day of the user's sessions.
    const stale = ['a'];
    const second = R.recordConsoleIds(file, stale, ['c']);
    eq('‼️ a stale window cannot erase what another window wrote',
        second.ids.slice().sort(), ['a', 'b', 'c']);
    eq('…and the file itself holds the union', R.readConsoleIds(file).slice().sort(), ['a', 'b', 'c']);
    eq('…and only the genuinely new id is reported as added', second.added, ['c']);

    const noop = R.recordConsoleIds(file, ['a', 'b', 'c'], ['a']);
    eq('nothing new means nothing added', noop.added, []);

    eq('order is oldest-first so the cap drops the oldest',
        R.mergeConsoleIds(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
    eq('blank ids never reach the file', R.mergeConsoleIds(['a', '', '  ', 'b']), ['a', 'b']);
    const many = Array.from({ length: R.CONSOLE_ID_CAP + 10 }, (_, i) => 's' + i);
    const capped = R.mergeConsoleIds(many);
    eq('the cap keeps the NEWEST ids', [capped.length, capped[capped.length - 1]],
        [R.CONSOLE_ID_CAP, 's' + (R.CONSOLE_ID_CAP + 9)]);

    const bad = R.recordConsoleIds(path.join(dir, 'nope', '\0', 'x.json'), [], ['z']);
    ok('a failed write reports itself instead of vanishing', !!bad.error);
    eq('…and this window still has the id', bad.ids, ['z']);
}

// ---------- the origin rule ----------
{
    const dev = 'dev';
    eq('a launcher is still the first word — a run of ours is automation',
        S.sessionOrigin({ entrypoint: 'sdk-cli', agentId: dev, launchedBy: { kind: 'schedule', label: 's' } }), 'auto');
    eq('…and it still outranks the Console mark',
        S.sessionOrigin({ entrypoint: 'sdk-cli', agentId: dev, consoleHosted: true, launchedBy: { kind: 'task', label: 't' } }), 'auto');
    eq('a Console-marked session is a person', S.sessionOrigin({ entrypoint: 'sdk-cli', consoleHosted: true }), 'user');

    // ‼️ THE EIGHT LOST SESSIONS. Inside an agent's folder, `sdk-cli` with no
    // record of ours cannot be one of ours: every mechanism Agent Farm has
    // writes a task, an archived task or a launch binding.
    eq('‼️ sdk-cli in an agent folder with no record of ours is the user, not a robot',
        S.sessionOrigin({ entrypoint: 'sdk-cli', agentId: dev }), 'user');
    eq('…and it is therefore not headless either',
        S.sessionHeadless({ entrypoint: 'sdk-cli', agentId: dev }), false);

    // Outside the fleet Agent Farm keeps no ledger, so the absence proves
    // nothing and the entrypoint still gets to answer.
    eq('outside the fleet the entrypoint still decides',
        S.sessionOrigin({ entrypoint: 'sdk-cli' }), 'auto');
    eq('…and such a run is headless', S.sessionHeadless({ entrypoint: 'sdk-cli' }), true);
    eq('a terminal session outside the fleet is a person',
        S.sessionOrigin({ entrypoint: 'cli' }), 'user');

    eq('an interactive run of ours is automation that is NOT headless',
        [S.sessionOrigin({ entrypoint: 'cli', agentId: dev, launchedBy: { kind: 'task', label: 't' } }),
        S.sessionHeadless({ entrypoint: 'cli', agentId: dev, launchedBy: { kind: 'task', label: 't' } })],
        ['auto', false]);
}

try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
