// X-473 — THE LAST LINE: a row the system placed on a concrete slot carries its pool, and at its start
// the slot is asked again; past the wall the row goes back to its pool (the launch picks, or the pool's
// hold parks it). A slot a person stated is theirs: untouched here (quotaBrake keeps the handover line).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// fake vscode (the test_task_events.js pattern)
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
const { TaskManager } = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
const D = require(path.join(ROOT, 'out', 'core', 'batonDoor.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-seam-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'developer', dir: agentDir };
const asked = [];
const mk = (name, full) => new TaskManager(path.join(tmp, name + '.json'), () => [agent], () => false, () => '', {
    isRunner: () => true,
    quotaCheck: () => 'test hold',
    accountWall: () => ({ value: 70, why: '70% — defaultAccountCeiling' }),
    replaceAccount: (t) => { asked.push(t.id); return full.includes(t.account) ? { account: t.accountPool, why: `${t.account}: at 92%, past the 70% wall — placed again from ${t.accountPool}` } : undefined; }
});

console.log('\n== the start asks again ==');
{
    const m = mk('seam', ['claude-full']);
    const kept = m.addTask(agent, 'leg', 'go', 'headless', { account: 'claude-full', accountPool: '@emptiest' });
    m.startTask(kept);
    ok('‼️ a system-placed slot past the wall at the start goes back to its pool', kept.account === '@emptiest');
    ok('…and the record says so (placed)', (kept.events || []).some(e => e.kind === 'placed' && /placed again from @emptiest/.test(e.note || '')));
    const room = m.addTask(agent, 'leg2', 'go', 'headless', { account: 'claude-room', accountPool: '@emptiest' });
    m.startTask(room);
    ok('a slot with room keeps the row', room.account === 'claude-room' && !(room.events || []).some(e => e.kind === 'placed'));
    const person = m.addTask(agent, 'mine', 'go', 'headless', { account: 'claude-full' });
    const before = asked.length;
    m.startTask(person);
    ok('‼️ a slot a person stated is never re-placed here (no pool, not asked)', person.account === 'claude-full' && asked.length === before);
    m.dispose();
}

console.log('\n== the incident, replayed at the spawn ==');
{
    // the host's answer, built on the real startRoom: the slot's figure at the start against the Account ceiling
    const { startRoom } = require(path.join(ROOT, 'out', 'core', 'startRoom.js'));
    const now = Date.now();
    const usage = { 'claude-kept': 92, 'claude-free': 40 };
    const wall = { value: 70, why: '70% — defaultAccountCeiling' };
    const m = new TaskManager(path.join(tmp, 'incident.json'), () => [agent], () => false, () => '', {
        isRunner: () => true,
        quotaCheck: () => 'test hold',
        accountWall: () => wall,
        replaceAccount: (t) => {
            const pct = usage[t.account];
            const room = startRoom({ slotId: t.account, engine: 'claude', state: 'ok', percent: pct, resetsAt: now + 7200000, plan: 'max', fetchedAt: now }, wall, now);
            return room.ok ? undefined : { account: t.accountPool, why: `${t.account}: ${room.why} — placed again from ${t.accountPool}` };
        }
    });
    const leg = m.addTask(agent, 'relay leg 3', 'go on', 'headless', { account: 'claude-kept', accountPool: '@emptiest' });
    m.startTask(leg);
    ok('‼️ chn_muqifjzc001n2b replayed at the spawn: a leg kept on a slot reading 92% at its start goes back to @emptiest — never started there',
        leg.account === '@emptiest' && (leg.events || []).some(e => e.kind === 'placed' && /92% of its window, at or past the 70% wall/.test(e.note || '')));
    const fine = m.addTask(agent, 'relay leg 4', 'go on', 'headless', { account: 'claude-free', accountPool: '@emptiest' });
    m.startTask(fine);
    ok('…the same leg on a slot under the wall starts where it was kept', fine.account === 'claude-free');
    m.dispose();
}

console.log('\n== who carries a pool ==');
{
    const b = {
        id: 'btn_2', chainId: 'chn_a', hop: 2, prompt: 'go on',
        from: { sessionId: 's2', agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'l' },
        inherit: { surface: 'headless' }, want: { surface: 'inherit', account: '@emptiest' }, state: 'waiting-end', why: 'w', createdAt: 1, updatedAt: 1
    };
    ok('a relay leg kept on its slot carries the chain\'s pool', D.successorRow(b, { account: 'claude-kate' }).extra.accountPool === '@emptiest');
    ok('…a leg placed from the pool carries none (it already is the pool)', D.successorRow(b, {}).extra.accountPool === undefined);
    ok('…nor a chain whose want names one slot', D.successorRow(Object.assign({}, b, { want: { surface: 'inherit', account: 'claude-x' } }), { account: 'claude-kate' }).extra.accountPool === undefined);
    const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    ok('a sentry round on a slot carries the campaign pool (@pool), a carried run its rule',
        /account: spec\.slotId, accountPool: POOL/.test(tasks) && /isPolicyId\(carryWant\) \? \{ accountPool: carryWant \}/.test(tasks));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host asks startRoom under the row\'s own wall, and a re-placed row waits like a relay leg',
        /const room = startRoom\(u, own\);/.test(ext) && /campaignWall\(camp\) : accountCeiling\(\);/.test(ext)
        && /if \(!task\.accountPool && !batonStore\.all\(\)\.some\(x => x\.taskId === task\.id && isLive\(x\)\)\) \{ return undefined; \}/.test(ext));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test_spawn_seam: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
