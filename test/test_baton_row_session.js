// S-85 — a baton names the ENGINE's session, never the Console card's.
//
// Measured on 2026-09-23: every Console-hosted successor's baton held the
// card id (`cs13-mudes5rc`) as its session, so the next pass opened a NEW
// chain at hop 1, the card showed no relay, ⑂ Attach sealed a second chain on
// a session that was already a successor, and the handover whisper told it to
// write a note. What must hold: the row learns the engine's id, the baton binds
// to it (late, when the engine names it), a baton written with a card id is
// repaired from the row, and the baton that OPENED a session beats a seal
// written on it later.
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
const B = require(path.join(OUT, 'baton.js'));
const { rowSessionId } = require(path.join(OUT, 'batonDoor.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BatonRunner } = require(path.join(OUT, 'batonRunner.js'));
const { sealFirstLeg } = require(path.join(OUT, 'batonSeal.js'));
const { batonCardView } = require(path.join(OUT, 'batonView.js'));
const T = require(path.join(OUT, 'tasks.js'));

const NOW = 1790000000000;
const UUID = '8e51b211-3c3e-4540-a3f1-fd6ccdcf2083';
const manifestFor = (launchId) => ({
    launchId, at: NOW - 1000, engine: 'claude',
    identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer',
    mechanism: 'session', cwd: 'D:\\repo', surface: 'console'
});
const pass1 = (store, sessionId, now = NOW) => {
    const r = B.passBaton({ prompt: 'carry on', sessionId, launchId: 'lch_' + sessionId, manifest: manifestFor('lch_' + sessionId), prior: store.all(), now });
    if (!r.ok) { throw new Error(r.why); }
    store.put(r.baton, ...r.superseded);
    return r.baton;
};

console.log('\n== the row\'s session is the engine\'s ==');
{
    ok('‼️ a Console row never answers with its card id', rowSessionId({ consoleSessionId: 'cs13-mudes5rc' }) === undefined);
    ok('…it answers with the engine id the card reported', rowSessionId({ consoleSessionId: 'cs13-x', hostedSessionId: UUID }) === UUID);
    ok('…or with the id the card holds right now', rowSessionId({ consoleSessionId: 'cs13-x' }, c => (c === 'cs13-x' ? UUID : undefined)) === UUID);
    ok('a headless row answers with the id it was told at the spawn, then the deduced one',
        rowSessionId({ spawnSessionId: 'sp', runSessionId: 'rn' }) === 'sp' && rowSessionId({ runSessionId: 'rn' }) === 'rn');
    ok('nothing known = undefined', rowSessionId({}) === undefined);
}

console.log('\n== the task manager writes the engine id the card reports ==');
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-row-session-'));
    const agent = { id: 'a1', name: 'developer', dir };
    let state = { state: 'starting', answered: false };
    const tm = new T.TaskManager(path.join(dir, 'tasks.json'), () => [agent], () => false, () => '', {
        startConsoleTask: () => ({ sessionId: 'cs1-mudihvzu', launchId: 'lch_1' }),
        consoleTaskState: () => state
    });
    const task = tm.addTask(agent, 'Baton — leg 2', 'p', 'interactive', { interactiveTarget: 'console', interactiveClose: 'stay-open', autoStart: false });
    tm.startTask(task);
    ok('the row holds the card it was handed to', task.consoleSessionId === 'cs1-mudihvzu' && task.status === 'running');
    tm.pumpConsoleTasks();
    ok('before the engine names it, the row knows no session', !task.hostedSessionId && rowSessionId(task) === undefined);
    state = { state: 'idle', answered: false, sessionId: UUID };
    tm.pumpConsoleTasks();
    ok('‼️ once the card reports its engine id, the row keeps it', task.hostedSessionId === UUID && rowSessionId(task) === UUID);
    ok('…and it is on the disk, so a reload or a forgotten card does not lose it',
        new RegExp(`"hostedSessionId":\\s*"${UUID}"`).test(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8')));
    tm.dispose();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

console.log('\n== the door answers "running" before the engine names the session; follow() binds it ==');
{
    const store = new BatonStore();
    const row = { status: 'running' };
    const notes = [];
    const runner = new BatonRunner({
        store,
        door: () => ({ taskId: 'tsk_1', running: true }),
        evidence: () => ({ registered: false, live: 'ended', registers: true }),
        task: () => row,
        notify: (title, body, key) => notes.push({ title, body, key }),
        now: () => NOW + 5000
    });
    const a = pass1(store, 'sess-A');
    const [st] = runner.sessionEnded('sess-A', 'end');
    ok('‼️ a running row makes the baton started, unbound — never "waiting for the pump"',
        st.state === 'started' && st.taskId === 'tsk_1' && !st.toSessionId && /bound when the engine names it/.test(st.why));
    ok('nothing to bind while the row names nothing', runner.follow().length === 0 && !store.get(a.id).toSessionId);
    row.sessionId = UUID;
    const [bound] = runner.follow();
    ok('‼️ follow() binds it the moment the row names the engine id', bound && store.get(a.id).toSessionId === UUID && /successor session 8e51b211 is running/.test(store.get(a.id).why));
    ok('…and leaves it alone afterwards', runner.follow().length === 0);
    const r2 = { status: 'failed', why: 'engine died' };
    const store2 = new BatonStore();
    const runner2 = new BatonRunner({ store: store2, door: () => ({ taskId: 't2', running: true }), evidence: () => ({ registered: false, live: 'ended', registers: true }), task: () => r2, notify: (t, b, k) => notes.push({ t, k }), now: () => NOW });
    pass1(store2, 'sess-Z');
    runner2.sessionEnded('sess-Z', 'end');
    runner2.follow(); runner2.follow();
    ok('a row that ended before its engine named a session is SAID, once', notes.filter(n => /Baton refused/.test(n.t || '')).length === 1);
}

console.log('\n== the measured break, replayed: a card id on the baton, then the pass ==');
{
    const store = new BatonStore();
    // leg 1 of chain A passed; its successor ran in the Console and the baton held the CARD id
    const hop1 = { ...pass1(store, '7bcfd941-314a-436f-84e1-a993f2c11cf0'), state: 'started', taskId: 'mudihvjgjnngl', toSessionId: 'cs1-mudihvzu', why: 'successor session cs1-mudi opened' };
    store.put(hop1);
    ok('(as measured) with the card id, the successor\'s pass opens a NEW chain at hop 1',
        (() => { const r = B.passBaton({ prompt: 'x', sessionId: UUID, launchId: 'lch_s', manifest: manifestFor('lch_s'), prior: store.all(), now: NOW + 9 }); return r.ok && r.baton.chainId !== hop1.chainId && r.baton.hop === 1; })());
    ok('(as measured) and ⑂ Attach would seal a second chain on it',
        !!sealFirstLeg({ leg: { sessionId: UUID, launchId: 'lch_s' }, manifest: manifestFor('lch_s'), prior: store.all(), now: NOW + 9 })?.ok);
    ok('(as measured) and its card shows no relay', batonCardView(store.all(), UUID) === undefined);

    const row = { status: 'running', sessionId: UUID };
    const runner = new BatonRunner({ store, door: () => { throw new Error('no door here'); }, evidence: () => ({ registered: true, live: 'alive', registers: true }), task: () => row, now: () => NOW + 10 });
    runner.sweep();
    const fixed = store.get(hop1.id);
    ok('‼️ the sweep repairs it from the row: the baton now names the engine id', fixed.toSessionId === UUID && /held cs1-mudihvzu/.test(fixed.why));
    const r = B.passBaton({ prompt: 'x', sessionId: UUID, launchId: 'lch_s', manifest: manifestFor('lch_s'), prior: store.all(), now: NOW + 11 });
    ok('‼️ …so its pass CONTINUES the chain: same chain, hop 2', r.ok && r.baton.chainId === hop1.chainId && r.baton.hop === 2);
    ok('…⑂ Attach refuses it as already in a chain', sealFirstLeg({ leg: { sessionId: UUID, launchId: 'lch_s' }, manifest: manifestFor('lch_s'), prior: store.all(), now: NOW + 11 }) === undefined);
    const card = batonCardView(store.all(), UUID);
    ok('…its card shows leg 2 of that chain', card && card.chainId === hop1.chainId && card.chip === '⑂ 2');
    ok('…and the whisper tells it to pass the baton, in that chain', B.batonRelayOf(store.all(), UUID)?.chainId === hop1.chainId);
}

console.log('\n== the baton that OPENED a session beats a seal written on it later ==');
{
    const store = new BatonStore();
    const real = { ...pass1(store, 'pred', NOW), state: 'started', taskId: 't', toSessionId: UUID };
    store.put(real);
    const seal = { ...real, id: 'btn_seal', chainId: 'chn_seal', hop: 0, taskId: undefined, toSessionId: UUID, createdAt: NOW + 50, updatedAt: NOW + 50 };
    store.put(seal);
    ok('‼️ openerOf prefers the real opener to the later seal', B.openerOf(store.all(), UUID).id === real.id);
    ok('…the pass, the whisper and the card all follow it',
        B.batonRelayOf(store.all(), UUID).chainId === real.chainId && batonCardView(store.all(), UUID).chainId === real.chainId);
    ok('a seal alone still opens its chain', B.openerOf([seal], UUID).id === 'btn_seal');
    ok('nothing names it = undefined', B.openerOf(store.all(), 'nobody') === undefined && B.openerOf(store.all(), '') === undefined);
}

console.log('\n== the host wires the engine id, not the card ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ successorSessionOf is rowSessionId over the card\'s own engine id',
        /const successorSessionOf = \(t: FarmTask\): string \| undefined =>\s*rowSessionId\(t, card => \{ try \{ return consoleHost\.get\(card\)\?\.sessionId;/.test(ext));
    ok('the Console\'s report carries the engine id', /reason: s\.exitReason,\s*\.\.\.\(s\.sessionId \? \{ sessionId: s\.sessionId \} : \{\}\)/.test(ext));
    ok('the door says a started row is running', /\.\.\.\(task\.status === 'running' \? \{ running: true \} : \{\}\)/.test(ext));
    const failsafe = fs.readFileSync(path.join(ROOT, 'src', 'core', 'batonFailsafe.ts'), 'utf8');
    const view = fs.readFileSync(path.join(ROOT, 'src', 'core', 'batonView.ts'), 'utf8');
    ok('no part of the relay looks the opener up by hand any more',
        /return openerOf\(list, sessionId\);/.test(failsafe) && /const opener = openerOf\(list, sid\);/.test(view)
        && !/b\.state === 'started' && b\.toSessionId === sid\)/.test(failsafe + view));
}

console.log(`\ntest_baton_row_session: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
