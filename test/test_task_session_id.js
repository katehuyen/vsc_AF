// X-321 — A FRESH HEADLESS CLAUDE RUN IS TOLD WHICH CONVERSATION IT IS.
//
// Measured on X-309's third fire drill (campaign sc-mu4w20b2): a sentry
// campaign opens its rounds back to back in ONE agent folder, so the second
// round's transcript overlapped the first and third rounds' windows (120 s of
// slack in `bindSession`) and was refused as ambiguous. That round never learnt
// its session id; the diagnosis of it had none; and the third round opened on
// "The previous session ()" with nothing measured behind it.
//
// The answer is not a tighter clock. A Claude run CAN be told its id before the
// transcript exists (`--session-id <uuid>`, measured on 2.1.269 with `-p`), and
// a declared id is exactly what `bindSession` already trusts first.
//
//   · a fresh run's command carries `--session-id <uuid>` BEFORE `-p`
//   · the id is on the row the moment the process exists (`runSessionId`)
//   · a resumed run is NOT given one — it is continuing a conversation
//   · every spawn declares its own, so no two runs can claim one transcript
//   · the launch binding carries it, so the ambiguous case resolves
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter,
    Disposable: { from: () => ({ dispose() { } }) },
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};

const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const { claudeNewSessionArgs } = require(path.join(ROOT, 'out/core/consoleEngine.js'));
const { bindSession } = require(path.join(ROOT, 'out/core/launchBinding.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID = '407c78cb-2e0a-4f11-9d3e-b6c345aa1234';

// ---- the vocabulary ---------------------------------------------------------
{
    ok('claude is told its new id with --session-id <uuid>',
        claudeNewSessionArgs(SID).join(' ') === '--session-id ' + SID);
    ok('‼️ anything that is not a UUID produces no flag — the CLI refuses it and this is a shell string',
        claudeNewSessionArgs('abc').length === 0
        && claudeNewSessionArgs('x" && del *').length === 0
        && claudeNewSessionArgs('').length === 0
        && claudeNewSessionArgs(undefined).length === 0);
}

// ---- the spawn --------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sessionid-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'basit', dir: agentDir };
const spawns = [];
const children = [];
const closeAll = () => { while (children.length) { children.shift().emit('close', 0); } };
const realSpawn = cp.spawn;
cp.spawn = (command, argsOrOpts) => {
    spawns.push(typeof command === 'string' && !Array.isArray(argsOrOpts) ? command : [command, ...(argsOrOpts || [])].join(' '));
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write() { }, end() { } };
    child.pid = 7000 + spawns.length;
    child.kill = () => true;
    children.push(child);
    return child;
};

try {
    const m = new TaskManager(path.join(tmp, 'tasks.json'), () => [agent], () => false, () => '');

    const fresh = m.addTask(agent, 'Sentry R1 · P-1', 'write the file', 'headless', { engine: 'claude' });
    m.startTask(fresh);
    const cmd = spawns[spawns.length - 1] || '';
    const flag = /--session-id ([0-9a-f-]{36})/.exec(cmd);
    ok('‼️ a fresh headless claude run is spawned with --session-id', !!flag);
    ok('...a real UUID', !!flag && UUID_RE.test(flag[1]));
    ok('...BEFORE -p, because everything after -p\'s value is the prompt',
        !!flag && cmd.indexOf('--session-id') < cmd.indexOf(' -p '));
    ok('‼️ the row carries that id as a DECLARATION the moment the process exists',
        !!flag && fresh.spawnSessionId === flag[1]);
    ok('...and as the run\'s own session, so a run killed a second later can still be found',
        !!flag && fresh.runSessionId === flag[1]);

    closeAll();
    const second = m.addTask(agent, 'Sentry R2 · P-1', 'write the file', 'headless', { engine: 'claude' });
    m.startTask(second);
    ok('‼️ every spawn declares its OWN id — two runs can never claim one transcript',
        !!second.spawnSessionId && second.spawnSessionId !== fresh.spawnSessionId);

    closeAll();
    const resumed = m.addTask(agent, 'carry on', 'continue', 'headless', {
        engine: 'claude', resumeSessionId: SID, resumedEngine: 'claude'
    });
    m.startTask(resumed);
    const rcmd = spawns[spawns.length - 1] || '';
    ok('a resumed run continues the conversation it was told',
        rcmd.includes('--resume ' + SID));
    ok('‼️ …and is NOT handed a new id: it is not opening a conversation',
        !rcmd.includes('--session-id') && resumed.spawnSessionId === undefined);
} finally {
    cp.spawn = realSpawn;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ---- the binding the declared id makes decidable ------------------------------
{
    const T0 = Date.UTC(2026, 8, 17, 2, 6, 0);
    const cwd = 'D:\\zone\\agent\\ajanlar\\basit';
    const run = (taskId, start, end, sessionId) => ({
        taskId, agentId: 'basit', agentName: 'basit', kind: 'task', label: taskId,
        engine: 'claude', cwd, startedAt: start, endedAt: end, mode: 'headless',
        ...(sessionId ? { sessionId } : {})
    });
    const session = {
        sessionId: SID, file: 'x/' + SID + '.jsonl', source: 'claude', cwd,
        firstTs: T0 + 65_000, lastTs: T0 + 134_000
    };
    // R1 · R2 · R3, back to back, the second round's transcript inside all three windows
    const guessed = [
        run('r1', T0, T0 + 58_000),
        run('r2', T0 + 63_000, T0 + 137_000),
        run('r3', T0 + 155_000, T0 + 170_000)
    ];
    const blind = bindSession(session, guessed, T0 + 600_000);
    ok('the measured case: three back-to-back rounds in one folder cannot be told apart by the clock',
        !blind || !blind.binding);

    const declared = [
        run('r1', T0, T0 + 58_000, '11111111-1111-4111-8111-111111111111'),
        run('r2', T0 + 63_000, T0 + 137_000, SID),
        run('r3', T0 + 155_000, T0 + 170_000, '33333333-3333-4333-8333-333333333333')
    ];
    const hit = bindSession(session, declared, T0 + 600_000);
    ok('‼️ with the ids declared it is exact: the second round owns its own transcript',
        !!hit && !!hit.binding && hit.binding.taskId === 'r2' && hit.proof === 'declared');
}

// ---- the host publishes it -----------------------------------------------------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the launch binding the host publishes carries the declared spawn id',
        /sessionId:\s*t\.resumeSessionId\s*\|\|\s*t\.hostedSessionId\s*\|\|\s*t\.spawnSessionId/.test(src));
}

console.log(`test_task_session_id: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
