// S-88 — a Console-hosted task row follows its conversation across a restart.
//
// Measured on 2026-09-23: `farm.restartExtensionHost resume=true` took session
// 8e51b211 up again in a NEW card (cs1-mudihvzu -> cs1-mudketf4), while its
// task row went back to `queued`, lost its card, and said the session "did not
// survive". A relay leg reloads to load a build on every leg, so its row would
// sit parked beside a running conversation — and ▶ on it opens a second leg.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        const off = () => ({ dispose() { } });
        return {
            Uri: {}, window: { onDidCloseTerminal: off, onDidOpenTerminal: off, showWarningMessage: () => { } },
            ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } dispose() { } },
            QuickPickItemKind: { Separator: -1 }, commands: { executeCommand: () => { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }) }
        };
    }
    return origLoad.apply(this, arguments);
};

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const { reattachPlan } = require(path.join(OUT, 'consoleTaskRevive.js'));
const { rowSessionId } = require(path.join(OUT, 'batonDoor.js'));
const T = require(path.join(OUT, 'tasks.js'));
const UUID = '8e51b211-3c3e-4540-a3f1-fd6ccdcf2083';

console.log('\n== the plan: matched on the engine\'s session id, one card per row ==');
{
    const rows = [
        { id: 't1', status: 'queued', hostedSessionId: UUID },
        { id: 't2', status: 'queued' },
        { id: 't3', status: 'running', hostedSessionId: 'other' },
        { id: 't4', status: 'queued', hostedSessionId: 'gone' }
    ];
    const cards = [
        { id: 'cs1-mudketf4', sessionId: UUID, status: 'idle' },
        { id: 'cs2', sessionId: 'other', status: 'idle' },
        { id: 'cs3', sessionId: 'gone', status: 'ended' }
    ];
    const plan = reattachPlan(rows, cards);
    ok('‼️ the row goes back on the card that holds its conversation', plan.length === 1 && plan[0].taskId === 't1' && plan[0].cardId === 'cs1-mudketf4');
    ok('a row whose engine never named its session stays parked', !plan.some(p => p.taskId === 't2'));
    ok('a row somebody already started is left alone', !plan.some(p => p.taskId === 't3'));
    ok('an ended card takes nobody', !plan.some(p => p.taskId === 't4'));
    ok('two rows naming one conversation: the card is given once',
        reattachPlan([{ id: 'a', status: 'queued', hostedSessionId: UUID }, { id: 'b', status: 'queued', hostedSessionId: UUID }], cards).length === 1);
}

console.log('\n== a real manager, reloaded ==');
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-console-revive-'));
    const file = path.join(dir, 'tasks.json');
    const agent = { id: 'a1', name: 'developer', dir };
    let state = { state: 'idle', answered: false, sessionId: UUID };
    const opts = { startConsoleTask: () => ({ sessionId: 'cs1-mudihvzu', launchId: 'lch_1' }), consoleTaskState: () => state };
    const tm1 = new T.TaskManager(file, () => [agent], () => false, () => '', opts);
    const leg = tm1.addTask(agent, 'Baton — leg 2 of chain chn_x', 'p', 'interactive', { interactiveTarget: 'console', interactiveClose: 'stay-open', autoStart: false });
    tm1.startTask(leg);
    tm1.pumpConsoleTasks();
    const bare = tm1.addTask(agent, 'no engine id yet', 'p', 'interactive', { interactiveTarget: 'console', interactiveClose: 'stay-open', autoStart: false });
    state = undefined;
    tm1.startTask(bare);
    const startedAt = tm1.tasks.find(t => t.id === leg.id).startedAt;
    tm1.dispose();

    const tm2 = new T.TaskManager(file, () => [agent], () => false, () => '', opts);
    const a = tm2.tasks.find(t => t.id === leg.id);
    const b = tm2.tasks.find(t => t.id === bare.id);
    ok('(M-21, kept) the reload unhooks the row from its dead card and parks it', a.status === 'queued' && !a.consoleSessionId);
    ok('‼️ …but the engine id stays on the row, so the relay still finds it', a.hostedSessionId === UUID && rowSessionId(a) === UUID);
    ok('…and the row no longer claims the session died', /the Console card it was hosted in went with it/.test((a.events || []).slice(-1)[0].note) && !/did not survive/.test(JSON.stringify(a.events)));
    const back = tm2.reattachConsoleRuns([{ id: 'cs1-mudketf4', sessionId: UUID, status: 'idle' }]);
    ok('‼️ the restart that took the conversation up hooks the row onto the NEW card, running',
        back.length === 1 && a.status === 'running' && a.consoleSessionId === 'cs1-mudketf4');
    ok('…says so on its timeline', /took this conversation up again \(card cs1-mudketf4\)/.test((a.events || []).slice(-1)[0].note) && a.events.slice(-1)[0].kind === 'resumed');
    ok('…and keeps its real start time', a.startedAt === startedAt || Math.abs(a.startedAt - startedAt) < 2000);
    ok('a row the engine never named stays parked', b.status === 'queued' && !b.consoleSessionId);
    ok('asked once: a second call changes nothing', tm2.reattachConsoleRuns([{ id: 'cs9', sessionId: UUID, status: 'idle' }]).length === 0 && a.consoleSessionId === 'cs1-mudketf4');
    ok('it is on the disk', new RegExp(`"consoleSessionId":\\s*"cs1-mudketf4"`).test(fs.readFileSync(file, 'utf8')));
    tm2.dispose();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

console.log('\n== the host asks only on a restart that asked for continuity, with the seats the revive opened ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ gated like the headless revive', /const reattached = askedForResume\s*\? taskManager\.reattachConsoleRuns\(seats\)\s*: \[\];/.test(ext));
    ok('the seats are recorded in the revive loop, with the conversation\'s id', /seats\.push\(\{ id: seatId, sessionId: row\.sessionId, status: 'idle' \}\);/.test(ext));
    ok('the toast counts them', /Console task\(s\) followed their conversation/.test(ext));
}

console.log(`\ntest_console_task_revive: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
