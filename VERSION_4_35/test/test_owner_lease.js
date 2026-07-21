// B11: multi-window safety — OwnerLease election + TaskManager follower mode.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = require('path').resolve(__dirname, '..');

const infoMsgs = [], warnMsgs = [];
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
        showInformationMessage: (m) => { infoMsgs.push(m); return Promise.resolve(undefined); },
        showWarningMessage: (m) => { warnMsgs.push(m); return Promise.resolve(undefined); },
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};
const { OwnerLease } = require(path.join(ROOT, 'out/core/owner.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; }
    else { fail++; console.log('FAIL  ' + name); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- part 1: OwnerLease election ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-lease-'));
    const file = path.join(tmp, 'tasks.owner');
    let clock = 1000;
    const now = () => clock;

    const a = new OwnerLease(file, 'win-A', 20000, now);
    const b = new OwnerLease(file, 'win-B', 20000, now);

    check('empty file: A claims', a.tryClaim() === true);
    check('fresh lease: B is refused', b.tryClaim() === false);
    check('ownerId reports A', a.ownerId() === 'win-A' && b.ownerId() === 'win-A');

    clock += 10000;
    check('renew: A re-claims within ttl', a.tryClaim() === true);
    clock += 15000; // 15s after renew — still fresh (< 20s)
    check('B still refused after renew', b.tryClaim() === false);

    clock += 21000; // beyond ttl since A's last write → stale
    check('stale lease: B takes over', b.tryClaim() === true);
    check('ownerId flips to B', a.ownerId() === 'win-B');
    check('A cannot reclaim while B fresh', a.tryClaim() === false);

    b.release();
    check('release frees the lease', b.ownerId() === undefined && fs.existsSync(file) === false);
    check('A claims after release', a.tryClaim() === true);
    a.release();

    fs.writeFileSync(file, 'not json', 'utf8');
    check('corrupt lease file counts as free', b.tryClaim() === true);
}

// ---------- part 2: TaskManager follower semantics ----------
(async () => {
    const agentTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-fol-'));
    const agentDir = path.join(agentTmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'yazar', dir: agentDir };
    const mkStore = (dir) => {
        const storage = path.join(dir, 'farm-tasks.json');
        fs.writeFileSync(storage, JSON.stringify({
            tasks: [
                { id: 'r1', agentId: 'a1', agentName: 'yazar', title: 'W 1/2: koş', prompt: 'p', mode: 'headless', status: 'running', createdAt: 3, startedAt: 4, workflowId: 'w1', workflowRunId: 'run1', stepIndex: 0 },
                { id: 'q1', agentId: 'a1', agentName: 'yazar', title: 'sırada', prompt: 'p', mode: 'headless', status: 'queued', createdAt: 5, autoStart: true }
            ],
            schedules: [], templates: [],
            workflows: [{ id: 'w1', title: 'W', steps: [{ title: 's1', agentId: 'a1', prompt: 'p' }, { title: 's2', agentId: 'a1', prompt: 'p' }] }],
            triggers: []
        }, null, 2), 'utf8');
        return storage;
    };

    // (a) follower: no stale pass, no writes, no pump
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-folA-'));
        const storage = mkStore(dir);
        const before = fs.readFileSync(storage, 'utf8');
        let followerWrites = 0;
        let runner = false;
        const tm = new TaskManager(storage, () => [agent], () => false, () => '', {
            isRunner: () => runner,
            onFollowerWrite: () => { followerWrites++; }
        });
        check('follower load keeps running row alive', tm.tasks.find(t => t.id === 'r1').status === 'running');
        check('follower offers no interrupted runs', tm.interruptedRuns().length === 0);
        check('follower load never writes the store', fs.readFileSync(storage, 'utf8') === before);

        tm.pump();
        const q = tm.tasks.find(t => t.id === 'q1');
        check('follower pump launches nothing', q.status === 'queued' && q.autoStart === true);

        tm.addTask(agent, 'yeni', 'prompt', 'headless');
        check('follower save is blocked + warned', followerWrites === 1 && fs.readFileSync(storage, 'utf8') === before);

        // (b) follower watch mirrors an external (runner) save
        let changes = 0;
        tm.onDidChange(() => { changes++; });
        const json = JSON.parse(before);
        json.tasks.push({ id: 'x9', agentId: 'a1', agentName: 'yazar', title: 'dışarıdan', prompt: 'p', mode: 'headless', status: 'queued', createdAt: 9 });
        fs.writeFileSync(storage, JSON.stringify(json, null, 2), 'utf8');
        await sleep(1600); // fs.watch + 800ms debounce
        check('follower mirrors external change', !!tm.tasks.find(t => t.id === 'x9'));
        check('mirror fires onDidChange', changes >= 1);
        check('mirror drops the unsaved local task', !tm.tasks.find(t => t.title === 'yeni'));

        // (c) takeover: lease landed here → stale pass + persistence
        runner = true;
        tm.becomeRunner();
        const r1 = tm.tasks.find(t => t.id === 'r1');
        check('becomeRunner cancels the stale workflow row', r1.status === 'cancelled');
        check('becomeRunner records the interrupted run', tm.interruptedRuns().length === 1);
        const onDisk = JSON.parse(fs.readFileSync(storage, 'utf8'));
        check('becomeRunner persists the stale pass', onDisk.tasks.find(t => t.id === 'r1').status === 'cancelled');
        tm.dispose();
    }

    // (d) regression: default (no isRunner option) behaves as the old runner
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-folB-'));
        const storage = mkStore(dir);
        const tm = new TaskManager(storage, () => [agent], () => false, () => '', {});
        check('default mode still cancels stale rows at load', tm.tasks.find(t => t.id === 'r1').status === 'cancelled');
        check('default mode still offers the resume', tm.interruptedRuns().length === 1);
        tm.dispose();
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
