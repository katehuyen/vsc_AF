// S-93 — a Console card that is removed ends the task row it hosted.
//
// Measured on 2026-09-24: relay leg 5's card was removed (End & remove ->
// consoleHost.forget) at 14:27, but its row stayed `running` until the 15:46
// reload, because the pump skipped a row whose card it could not read. The
// agent's one seat stayed taken, so two successors sat parked "agent busy"
// for 80 minutes, and the failsafe — seeing neither a "closed by you" card nor
// a cancelled row — rescued a leg the user had ended on purpose.
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
const T = require(path.join(OUT, 'tasks.js'));
const { legFactsFrom } = require(path.join(OUT, 'batonLegFacts.js'));
const { failsafeVerdict } = require(path.join(OUT, 'batonFailsafe.js'));
const UUID = '59b9cee1-9b5b-49a3-83ec-17a4729fbb30';

const setup = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-card-gone-'));
    const agent = { id: 'a1', name: 'developer', dir };
    const cards = {};
    let seq = 0;
    const tm = new T.TaskManager(path.join(dir, 'tasks.json'), () => [agent], () => false, () => '', {
        startConsoleTask: () => { const id = `cs${++seq}-x`; cards[id] = { state: 'starting', answered: false }; return { sessionId: id }; },
        consoleTaskState: id => cards[id]
    });
    const add = title => tm.addTask(agent, title, 'p', 'interactive', { interactiveTarget: 'console', interactiveClose: 'stay-open', autoStart: false });
    const done = () => { tm.dispose(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); };
    return { tm, cards, add, done };
};

console.log('\n== a removed card ends its row and frees the agent\'s seat ==');
{
    const { tm, cards, add, done } = setup();
    const leg = add('Baton — leg 5');
    tm.startTask(leg);
    cards[leg.consoleSessionId] = { state: 'idle', answered: true, sessionId: UUID };
    tm.pumpConsoleTasks();
    ok('the leg runs on its card and names its session', leg.status === 'running' && leg.hostedSessionId === UUID);

    const next = add('Baton — leg 6');
    tm.startTask(next);
    ok('the successor parks behind it: one seat per agent', next.status === 'queued' && /agent busy/.test(next.deferredReason || ''));

    cards[leg.consoleSessionId] = undefined;
    tm.pumpConsoleTasks();
    ok('a card the reader cannot see is NOT taken for removed (the reader may not be wired yet)', leg.status === 'running');

    cards[leg.consoleSessionId] = { state: 'gone', answered: false };
    tm.pumpConsoleTasks();
    ok('‼️ a removed card ends its row as cancelled', leg.status === 'cancelled');
    ok('…and says why', (leg.events || []).some(e => /Console card was removed/.test(e.note || '')));
    ok('‼️ the seat is free at once: the parked successor starts', next.status === 'running');
    ok('the row keeps the engine id, so the failsafe can still find it', leg.hostedSessionId === UUID);
    done();
}

console.log('\n== an ended card still ends its row as done (unchanged) ==');
{
    const { tm, cards, add, done } = setup();
    const t = add('plain console task');
    tm.startTask(t);
    cards[t.consoleSessionId] = { state: 'ended', answered: true, reason: 'closed by you' };
    tm.pumpConsoleTasks();
    ok('ended -> done', t.status === 'done');
    done();
}

console.log('\n== the failsafe reads a removed leg as ended by the user ==');
(async () => {
    const opener = {
        id: 'btn_5', chainId: 'chn_x', hop: 4, state: 'started', why: '', prompt: 'p',
        from: { sessionId: 'prev', agentId: 'a1', engine: 'claude', cwd: 'D:\\x' },
        inherit: {}, want: {}, toSessionId: UUID, createdAt: 1, updatedAt: 1
    };
    const facts = await legFactsFrom({
        card: () => undefined,
        row: () => ({ status: 'cancelled', why: 'its Console card was removed — the conversation ended with it' }),
        guard: () => undefined, notePath: () => undefined, readNote: () => undefined,
        toolCalls: () => 21, cwdOf: () => 'D:\\x',
        gitStatus: async () => ' M src/work.ts',
        openDirt: () => ''
    })(UUID, 10 * 60_000);
    ok('‼️ no card + a cancelled row = byUser', facts.byUser === true);
    const v = failsafeVerdict([opener], facts);
    ok('‼️ the chain ends as done — no rescue, even with work left in the folder', v.act === 'done' && /ended by the user/.test(v.why));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
