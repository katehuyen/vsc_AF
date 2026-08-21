// ‼️ S-43 — THE DAEMON'S SPARE WORKER, AND THE TREE ABOVE IT.
//
// Two failures, one cause. Claude Code v2.1+ keeps a daemon and one pre-warmed
// idle worker so a `claude` you type starts instantly. That worker registers
// itself like a real session (`"kind":"bg","spare":true,"status":"idle"`) and
// fires the same SessionStart hook — so the Live Timeline drew a card for a
// session nobody had started; and "End session" killed the LEAF the registry
// names, which the daemon above it immediately replaced under a new id. The
// user could kill the same ghost for ever without leaving the editor.
//
// What is worth pinning here is not "does the filter filter":
//
//   * the answer at SessionStart can honestly be **"I do not know"** — the hook
//     fires the instant the worker is born and its registry file may not be
//     written yet. A filter that decides there and then passes its own test and
//     leaks in real life, which is why the verdict is re-taken on every read;
//   * a spare that is HANDED to a real conversation must come back — that is
//     what the daemon's spare is FOR, and a rule that kept reading `spare:true`
//     would hide the conversation with it;
//   * no other engine has a registry file at all, so "no record" must never
//     mean "hide it" — that would blank Codex, Gemini and Antigravity;
//   * and the climb must refuse to enter our OWN process tree. A Console
//     session's claude is a child of this window; a rule that climbed far
//     enough would aim taskkill at VS Code.
'use strict';
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return fn => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve() },
    commands: { executeCommand: () => Promise.resolve() }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};

const OUT = p => path.resolve(__dirname, '..', 'out', 'core', p);
const { LiveMonitor } = require(OUT('live.js'));
const CLI = require(OUT('cliSessions.js'));
const PT = require(OUT('processTree.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => {
    if (got === want) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

// ===================================================== the registry record
//
// The field names are not invented here: they were read off a live spare on
// disk (`~/.claude/sessions/<pid>.json`) while this was being written.
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-spare-'));
    const dir = path.join(root, 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    const write = (pid, o) => fs.writeFileSync(path.join(dir, pid + '.json'),
        JSON.stringify(Object.assign({ pid, sessionId: 's-' + pid, cwd: 'D:\\x', version: '2.1.238' }, o)), 'utf8');

    // process.pid is alive by definition — readCliSessions drops dead ones, and
    // a fixture that used a made-up pid would test nothing at all.
    write(process.pid, { kind: 'bg', spare: true, status: 'idle', entrypoint: 'cli' });
    const recs = CLI.readCliSessions(root);
    eq('the registry is read', recs.length, 1);
    eq('…and `spare` comes off the record', recs[0].spare, true);
    eq('…as does `kind`', recs[0].kind, 'bg');
    ok('a record marked spare is one', CLI.isSpareCliSession(recs[0]));
    ok('…and so is a bare background worker', CLI.isSpareCliSession({ pid: 1, sessionId: 'x', kind: 'bg' }));
    ok('an interactive session is not', !CLI.isSpareCliSession({ pid: 1, sessionId: 'x', kind: 'interactive' }));
    ok('…nor is one the CLI said nothing about',
        !CLI.isSpareCliSession({ pid: 1, sessionId: 'x' }));

    eq('the verdict for a known spare', CLI.spareVerdict(root, 's-' + process.pid), true);
    // ‼️ The third answer. Not false — *unknown*.
    eq('‼️ an id with no record gets NO verdict, not a negative one',
        CLI.spareVerdict(root, 'nobody'), undefined);
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* windows */ }
}

// ================================================ the filter, through the hooks
{
    // The verdict this run will give. Mutable, because the whole point is that
    // it can change between the hook and the read.
    let verdict = new Map();
    const cfg = {
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        spareOf: id => verdict.get(id)
    };
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'basit' }));
    const ev = (id, name, extra) => live.handle(Object.assign(
        { session_id: id, cwd: '/x', hook_event_name: name }, extra));
    const shown = () => live.sessions().map(s => s.sessionId).sort();

    // 1. The registry already knows: never drawn, and nothing written to the lane.
    verdict.set('SPARE', true);
    const eventsBefore = live.events(60_000).length;
    ev('SPARE', 'SessionStart', { source: 'startup' });
    eq('‼️ a known spare draws no card', shown().indexOf('SPARE'), -1);
    eq('…and no `start` reaches the timeline either', live.events(60_000).length, eventsBefore);

    // 2. A real session, told so by the registry.
    verdict.set('REAL', false);
    ev('REAL', 'SessionStart', { source: 'startup' });
    ok('a session the registry vouches for is drawn', shown().indexOf('REAL') >= 0);

    // 3. ‼️ THE RACE. The hook beats the registry file to disk, so the answer at
    //    SessionStart is `undefined` — and nothing is held on a shrug, which is
    //    the old behaviour exactly. Then the file lands.
    ev('LATE', 'SessionStart', { source: 'startup' });
    ok('‼️ an unknown session is NOT hidden on a guess', shown().indexOf('LATE') >= 0);
    verdict.set('LATE', true);
    eq('‼️ …and the moment the registry can answer, the card is gone',
        shown().indexOf('LATE'), -1);

    // 4. …and the same in reverse: a card that was held comes back once the
    //    registry says the session is real.
    verdict.set('LATE', false);
    ok('a held session returns when the verdict turns', shown().indexOf('LATE') >= 0);

    // 5. ‼️ THE SPARE IS HANDED OVER. This is what the daemon keeps it for: a
    //    real conversation adopts it, and no verdict may hide it after that.
    verdict.set('SPARE', true);
    ev('SPARE', 'UserPromptSubmit', { prompt: 'merhaba' });
    ok('‼️ a spare that receives a prompt is a session, whatever the registry says',
        shown().indexOf('SPARE') >= 0);
    eq('…and it keeps the history it collected while held',
        live.sessions().find(s => s.sessionId === 'SPARE').prompts, 1);

    // 6. The fleet must not light up for a worker nobody started.
    verdict.set('GHOST', true);
    ev('GHOST', 'SessionStart', { source: 'startup' });
    eq('the ghost is held', shown().indexOf('GHOST'), -1);
    // Counted by hand rather than against sessions(): comparing two figures
    // that share the same filter would pass even if the filter were gone.
    // SPARE (adopted), REAL and LATE are real; GHOST is not.
    eq('‼️ a held spare is not counted among an agent\'s sessions',
        live.agentStatus('a1').sessions, 3);
}

// ================================== no registry at all: the other four engines
{
    const cfg = {
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        spareOf: () => undefined            // nothing on disk knows these ids
    };
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    for (const id of ['cli:codex:abc', 'cli:gemini:def', 'cli:agy:ghi']) {
        live.handle({ session_id: id, cwd: '/x', hook_event_name: 'SessionStart' });
    }
    eq('‼️ an engine with no claude registry is never held', live.sessions().length, 3);

    // …and with no spareOf injected at all, which is every existing test and
    // every host that has not been taught about this.
    const plain = new LiveMonitor(() => ({
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
    }), () => ({}));
    plain.handle({ session_id: 'P1', cwd: '/x', hook_event_name: 'SessionStart' });
    eq('no filter injected = the old behaviour, exactly', plain.sessions().length, 1);
}

// ======================================================= the climb
{
    // A real shape: the orphan claude somebody left open, the daemon under it,
    // the spare worker under that — and a shell and an editor above the lot.
    const table = [
        { pid: 100, ppid: 4, name: 'explorer.exe' },
        { pid: 200, ppid: 100, name: 'WindowsTerminal.exe' },
        { pid: 300, ppid: 200, name: 'claude.exe' },      // the orphan
        { pid: 400, ppid: 300, name: 'claude.exe' },      // the daemon
        { pid: 500, ppid: 400, name: 'claude.exe' },      // the spare worker
        // this window, and a Console session's claude under it
        { pid: 900, ppid: 100, name: 'Code.exe' },
        { pid: 910, ppid: 900, name: 'node.exe' },        // extension host
        { pid: 920, ppid: 910, name: 'claude.exe' }       // a hosted session
    ];

    const t = PT.findKillTarget(500, table, new Set());
    eq('‼️ the climb reaches the orphan at the top of the claude tree', t.root, 300);
    eq('…and stops there because its parent is not one of ours', t.stop, 'foreign-parent');
    eq('…having collected the whole chain to show', t.chain.length, 3);
    eq('…leaf first', t.chain[0].pid, 500);

    // ‼️ THE DANGEROUS CASE. Our own ancestry is handed in, and the climb must
    // stop at the boundary rather than aim taskkill /T at the editor.
    const mine = PT.ancestorsOf(910, table);
    ok('our own ancestry includes the editor', mine.has(900) && mine.has(910));
    const hosted = PT.findKillTarget(920, table, mine);
    eq('‼️ the climb refuses to enter our own tree', hosted.root, 920);
    eq('…and says why', hosted.stop, 'own-tree');

    // A leaf whose parent is already gone (the orphan case) has nothing above it.
    const alone = PT.findKillTarget(300, table.filter(p => p.pid !== 200), new Set());
    eq('a leaf with no parent left is its own root', alone.root, 300);
    eq('…and says so', alone.stop, 'no-parent');

    // A pid the table does not contain at all — a process that died between the
    // registry read and the scan. It must still be a valid, harmless target.
    const gone = PT.findKillTarget(7777, table, new Set());
    eq('an unknown pid is its own root', gone.root, 7777);

    // A cycle (a pid reused mid-scan) must terminate rather than hang.
    const cyclic = [
        { pid: 1, ppid: 2, name: 'claude.exe' },
        { pid: 2, ppid: 1, name: 'claude.exe' }
    ];
    const c = PT.findKillTarget(1, cyclic, new Set());
    ok('a cycle in the table terminates', c.chain.length <= 16);

    ok('a shell is not something to climb through', !PT.isClaudeProcess('cmd.exe'));
    ok('…nor is the editor', !PT.isClaudeProcess('Code.exe'));
    ok('claude is', PT.isClaudeProcess('claude.exe') && PT.isClaudeProcess('CLAUDE.EXE'));
    ok('…and so is a node-hosted one', PT.isClaudeProcess('node'));

    // What the confirmation says — the user is told which processes go, by name
    // and pid, before anything is killed.
    const said = PT.describeKillTarget(t);
    ok('the dialog names every process in the chain',
        said.includes('(500)') && said.includes('(400)') && said.includes('(300)'));
    ok('…and says the daemon cannot come back', /daemon/i.test(said));
    ok('a lone process is described honestly, not dressed up as a tree',
        /Nothing above/.test(PT.describeKillTarget(alone)));
}

// ======================================= the table readers, on real text
{
    eq('windows: a single row arrives as a bare object, not an array',
        PT.parseWindowsTable('{"ProcessId":12,"ParentProcessId":4,"Name":"claude.exe"}').length, 1);
    const w = PT.parseWindowsTable('[{"ProcessId":12,"ParentProcessId":4,"Name":"a.exe"},{"ProcessId":13,"ParentProcessId":12,"Name":"b.exe"}]');
    eq('windows: two rows', w.length, 2);
    eq('windows: the parent link survives', w[1].ppid, 12);
    eq('windows: rubbish is not a crash', PT.parseWindowsTable('not json').length, 0);
    const p = PT.parsePosixTable('  100     1 launchd\n  200   100 claude\n');
    eq('posix: two rows', p.length, 2);
    eq('posix: a name with no padding', p[1].name, 'claude');
}

Module._load = origLoad;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
