// Z4: task ↔ session cost attribution — pure matcher + TaskManager.setTaskCost.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = require('path').resolve(__dirname, '..');

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
const { matchTaskSession } = require(path.join(ROOT, 'out/core/taskcost.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- matcher ----------
const T0 = 1_800_000_000_000;
const task = { startedAt: T0, endedAt: T0 + 5 * 60_000 }; // 5-minute task
const ses = (firstOff, lastOff, extra) => Object.assign(
    { file: 'f' + firstOff, firstTs: T0 + firstOff, lastTs: T0 + lastOff, cost: 0.42 }, extra);

ok('clean match: session inside the task span',
    matchTaskSession(task, [ses(5_000, 290_000)])?.cost === 0.42);
ok('tolerance: session ends slightly after the task',
    !!matchTaskSession(task, [ses(5_000, 5 * 60_000 + 60_000)]));
ok('no match: session started long before the task',
    matchTaskSession(task, [ses(-10 * 60_000, 290_000)]) === undefined);
ok('no match: session ran long after the task ended',
    matchTaskSession(task, [ses(5_000, 30 * 60_000)]) === undefined);
ok('ambiguous (two candidates) -> honest none',
    matchTaskSession(task, [ses(5_000, 200_000), ses(10_000, 250_000)]) === undefined);
ok('external sessions never match',
    matchTaskSession(task, [ses(5_000, 290_000, { source: 'gemini' })]) === undefined);
ok('sidechains never match',
    matchTaskSession(task, [ses(5_000, 290_000, { isSidechain: true })]) === undefined);
ok('unfinished task -> none',
    matchTaskSession({ startedAt: T0 }, [ses(5_000, 290_000)]) === undefined);
ok('candidate mix: one valid among invalid ones still matches',
    matchTaskSession(task, [
        ses(-10 * 60_000, 290_000),
        ses(5_000, 290_000),
        ses(6_000, 200_000, { source: 'codex' })
    ])?.file === 'f5000');

// ---------- TaskManager.setTaskCost ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cost-'));
    const storage = path.join(dir, 'farm-tasks.json');
    fs.writeFileSync(storage, JSON.stringify({
        tasks: [{ id: 't1', agentId: 'a1', agentName: 'x', title: 'iş', prompt: 'p', mode: 'headless', status: 'done', createdAt: 1, startedAt: 2, endedAt: 3 }],
        schedules: [], templates: [], workflows: [], triggers: []
    }), 'utf8');
    const tm = new TaskManager(storage, () => [], () => false, () => '', {});
    tm.setTaskCost('t1', 0.1234, 'C:/t/x.jsonl');
    const t = tm.tasks.find(x => x.id === 't1');
    ok('cost + source file attached', t.costUSD === 0.1234 && t.costSessionFile === 'C:/t/x.jsonl');
    const disk = JSON.parse(fs.readFileSync(storage, 'utf8'));
    ok('cost persisted', disk.tasks[0].costUSD === 0.1234);
    tm.setTaskCost('t1', 9.99, 'other.jsonl');
    ok('idempotent: a second attach never overwrites', tm.tasks[0].costUSD === 0.1234);
    tm.setTaskCost('missing', 1, 'f');
    ok('unknown task id is a no-op', tm.tasks.length === 1);
    tm.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
