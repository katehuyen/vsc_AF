// S-72 — the quota brake reads the ROW'S OWN ACCOUNT, and the pump hands it the row.
//
// What must not go wrong quietly: a row on a slot with room is never held by
// the machine figure; a row that states no account keeps today's behaviour;
// a rule (@emptiest) is resolved and the resolved slot is judged; a slot whose
// plan publishes nothing falls back to the machine figure; the pump passes the
// task to quotaCheck.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { quotaBrake } = require(path.join(OUT, 'quotaBrake.js'));

const usage = { 'claude-a': { percent: 95, known: true }, 'claude-b': { percent: 10, known: true }, 'claude-c': { percent: 0, known: false } };
const base = {
    guard: 90,
    resolve: s => s === '@emptiest' ? { id: 'claude-b', label: 'kate' } : s.startsWith('claude-') ? { id: s, label: s } : undefined,
    usageOf: id => usage[id],
    machinePct: () => 95
};

ok('no guard, no brake', quotaBrake({ ...base, guard: 0, stated: 'claude-a' }) === undefined);
// M-54 — a step pinned to a slot at 93% started, was told to hand over at once, and its step read done
const line = quotaBrake({ ...base, guard: 0, handover: 90, stated: 'claude-a' });
ok('‼️ with the guard off, a row on a slot past the handover line is still held, and says why', line && line.basis === 'account' && line.slotId === 'claude-a' && /handover line \(95% of claude-a's 5h window, at or past 90%/.test(line.reason));
ok('…a slot under the line runs', quotaBrake({ ...base, guard: 0, handover: 90, stated: 'claude-b' }) === undefined);
ok('…the line never brakes a row with no account (the machine figure stays the guard\'s alone)', quotaBrake({ ...base, guard: 0, handover: 90, stated: '' }) === undefined);
ok('…a guard stricter than the line keeps its own word', /quota guard \(95%/.test(quotaBrake({ ...base, guard: 80, handover: 90, stated: 'claude-a' }).reason));
ok('…a guard looser than the line gives way to it', quotaBrake({ ...base, guard: 99, handover: 90, stated: 'claude-a' }).reason.includes('handover line'));
ok('…and handover 0 is off', quotaBrake({ ...base, guard: 0, handover: 0, stated: 'claude-a' }) === undefined);
const none = quotaBrake({ ...base, stated: '' });
ok('a row with no account keeps the machine figure', none && none.basis === 'machine' && /95% of 5h window/.test(none.reason));
ok('…and passes when the machine has room', quotaBrake({ ...base, stated: '', machinePct: () => 40 }) === undefined);
ok('…and when no ceiling is configured', quotaBrake({ ...base, stated: '', machinePct: () => undefined }) === undefined);
ok('‼️ a row on a slot with room is NOT held by the machine at 95%', quotaBrake({ ...base, stated: 'claude-b' }) === undefined);
const full = quotaBrake({ ...base, stated: 'claude-a' });
ok('a row on a full slot is held by THAT slot, named', full && full.basis === 'account' && full.slotId === 'claude-a' && /95% of claude-a's 5h window/.test(full.reason));
ok('the code is the same ceiling code the board dedupes on', full.code === 'quota:5h');
ok('‼️ a rule resolves to a slot and that slot is judged (@emptiest → kate at 10%)', quotaBrake({ ...base, stated: '@emptiest' }) === undefined);
const rule = quotaBrake({ ...base, stated: '@emptiest', usageOf: () => ({ percent: 92, known: true }) });
ok('…and is held when the resolved slot is full, by its label', rule && /92% of kate's 5h window/.test(rule.reason));
const unk = quotaBrake({ ...base, stated: 'claude-c' });
ok('a slot whose plan publishes nothing falls back to the machine figure', unk && unk.basis === 'machine');
const unresolved = quotaBrake({ ...base, stated: '@nobody' });
ok('a box that resolves to nothing keeps today\'s behaviour (the account gate says why)', unresolved && unresolved.basis === 'machine');
ok('a throwing resolver is a machine verdict, not a crash', quotaBrake({ ...base, stated: 'claude-a', resolve: () => undefined }).basis === 'machine');
ok('exactly at the guard is held', quotaBrake({ ...base, stated: 'claude-a', usageOf: () => ({ percent: 90, known: true }) }) !== undefined);

// ---- the pump hands the row over ----
{
    const Module = require('module');
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
    const { TaskManager } = require(path.join(OUT, 'tasks.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-quota-brake-'));
    const agent = { id: 'a1', name: 'dev', dir: tmp };
    const seen = [];
    const mgr = new TaskManager(path.join(tmp, 't.json'), () => [agent], () => false, () => '', {
        quotaCheck: t => { seen.push(t); return { code: 'quota:5h', reason: `held for ${t.account || 'nobody'}` }; }
    });
    const t = mgr.addTask(agent, 'x', 'y', 'headless', { account: 'claude-b' });
    const started = mgr.startTask(t);
    ok('‼️ the pump passes the ROW to quotaCheck', !started && seen.length === 1 && seen[0].id === t.id && seen[0].account === 'claude-b');
    ok('the hold is the row\'s own', t.deferredCode === 'quota:5h' && /held for claude-b/.test(t.deferredReason));
    // S-73 — a baton's row written with notBefore waits on the board BEFORE any brake is asked
    const wake = Date.now() + 30 * 60_000;
    const parked = mgr.addTask(agent, 'p', 'q', 'headless', { account: '@emptiest', notBefore: wake, notBeforeWhy: 'baton parked — every account is full' });
    const before = seen.length;
    ok('a row with a wake moment is held by the moment, quota not consulted',
        !mgr.startTask(parked) && parked.deferredCode === `wait:${wake}` && /baton parked — every account is full/.test(parked.deferredReason) && seen.length === before);
    mgr.dispose?.();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(`test_quota_brake: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
