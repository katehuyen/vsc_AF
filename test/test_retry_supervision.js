// M-13 — THE HELD ROW AND THE SUPERVISOR'S RUNNER: what a decision (or the
// fallback) does to the row, the runner's never-twice / never-recursive rules,
// and the TaskManager making a supervised retry row HELD with its fallback in it.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter, Disposable: { from: () => ({ dispose() { } }) },
    window: {
        showInformationMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};

const OUT = path.join(__dirname, '..', 'out', 'core');
const V = require(path.join(OUT, 'retrySupervision.js'));
const S = require(path.join(OUT, 'retrySupervisor.js'));
const { SupervisorRunner } = require(path.join(OUT, 'supervisorRunner.js'));
const { TaskManager } = require(path.join(OUT, 'tasks.js'));

const H = 3600e3;
const row = { title: 'Gece (continue 1)', prompt: 'devam et', notBefore: 5000, resumeSessionId: 's1' };
const ctx = { originalPrompt: 'özgün iş', engine: 'codex' };
const dec = (o) => ({ kind: 'decision', decision: Object.assign({ reason: 'r', confidence: 0.9 }, o) });

console.log('\n== what a decision does to the row ==');
{
    const r = V.supervisionEffect(row, dec({ action: 'resume', prompt: 'Önce testi düzelt' }), ctx);
    ok('resume: released with the supervisor\'s next turn, same conversation', r.kind === 'release' && r.set.prompt === 'Önce testi düzelt' && !r.unset.length);
    const o = V.supervisionEffect(row, dec({ action: 'retryOriginal' }), ctx);
    ok('retryOriginal: a fresh run of the ORIGINAL words, the conversation dropped, retitled',
        o.kind === 'release' && o.set.prompt === 'özgün iş' && o.unset.includes('resumeSessionId') && o.set.title === 'Gece (retry 1)');
    const w = V.supervisionEffect(row, dec({ action: 'wait', notBefore: 9000 }), ctx);
    ok('wait: released no earlier than it says', w.kind === 'release' && w.set.notBefore === 9000);
    ok('never earlier than the row already waits', V.supervisionEffect(row, dec({ action: 'wait', notBefore: 10 }), ctx).set.notBefore === 5000);
    ok('stop: cancelled', V.supervisionEffect(row, dec({ action: 'stop' }), ctx).kind === 'cancel');
    const u = V.supervisionEffect(row, dec({ action: 'needsUser' }), ctx);
    ok('needsUser: held for you, with the reason on the row', u.kind === 'hold' && u.code === V.SUPERVISION_ASK_CODE && /needsUser/.test(u.event));
    ok('fallback smart: the row goes as deterministic Smart Continue made it',
        V.supervisionEffect(row, { kind: 'fallback', fallback: 'smart', note: 'x' }, ctx).kind === 'release');
    ok('fallback park / stop do what they say',
        V.supervisionEffect(row, { kind: 'fallback', fallback: 'park', note: 'x' }, ctx).code === V.SUPERVISION_PARK_CODE
        && V.supervisionEffect(row, { kind: 'fallback', fallback: 'stop', note: 'x' }, ctx).kind === 'cancel');
}

console.log('\n== the runner ==');
(async () => {
    const policy = S.normalizeSupervisor({ engine: 'codex', minConfidence: 0.7 });
    const mkRow = (o) => Object.assign({
        id: 'r1', status: 'queued', prompt: 'devam et', retryOf: 't0', resumeSessionId: 's1', resetAt: 1000,
        supervision: { key: 'k1', state: 'pending', at: 0, atWhy: '', failedTask: 't1', calls: 0 }
    }, o);
    const harness = (answer, rowO, pol = policy) => {
        const settled = [];
        const r = mkRow(rowO);
        const runner = new SupervisorRunner({
            due: () => (r.supervision.state === 'pending' || r.supervision.state === 'asking') ? [r] : [],
            begin: (x) => { if (x.supervision.state !== 'pending') { return false; } x.supervision = Object.assign({}, x.supervision, { state: 'asking', calls: x.supervision.calls + 1 }); return true; },
            settle: (x, o, meta) => { settled.push({ o, meta }); x.supervision = Object.assign({}, x.supervision, { state: o.kind === 'decision' ? 'decided' : 'fallback' }); },
            find: (id) => ({ t0: { id: 't0', prompt: 'özgün iş' }, t1: { id: 't1', prompt: 'devam et (önceki)' } })[id],
            policyOf: () => pol,
            incidentOf: async () => ({ key: 'k1', task: { id: 'r1', title: 'T', prompt: 'p' }, failure: { phase: 'interrupted', why: 'w', engine: 'claude' }, attempts: [], lastTurns: '', remaining: { retries: 2 } }),
            ask: typeof answer === 'function' ? answer : async () => answer,
            now: () => 2000
        });
        return { runner, settled, r };
    };
    {
        const h = harness({ text: '```json\n{"action":"resume","prompt":"Testi bitir","reason":"sapmış","confidence":0.9}\n```', costUsd: 0.02, sessionId: 'sup1' });
        await Promise.all(h.runner.sweep());
        ok('a good decision is settled, with its cost and session, and the chain\'s ORIGINAL prompt',
            h.settled.length === 1 && h.settled[0].o.kind === 'decision' && h.settled[0].meta.spentUsd === 0.02
            && h.settled[0].meta.sessionId === 'sup1' && h.settled[0].meta.originalPrompt === 'özgün iş');
        ok('…and it was marked asking first (one call counted)', h.r.supervision.calls === 1);
        await Promise.all(h.runner.sweep());
        ok('a settled row is never asked again', h.settled.length === 1);
    }
    const fb = async (answer, rowO, pol) => { const h = harness(answer, rowO, pol); await Promise.all(h.runner.sweep()); return h.settled[0]; };
    ok('broken JSON → the fallback, saying why', (await fb({ text: 'resume please' })).o.note.includes('no JSON'));
    ok('a refused decision → the fallback', /before the limit resets/.test((await fb({ text: '{"action":"wait","notBefore":500,"reason":"r","confidence":1}' })).o.note));
    ok('‼️ low confidence → the fallback, naming the numbers (M-48: the shared gate)', /50% sure; the threshold is 70%/.test((await fb({ text: '{"action":"stop","reason":"r","confidence":0.5}' })).o.note));
    ok('‼️ the supervisor\'s own failure (its limit) → the fallback, no recursion', /run failed: usage limit/.test((await fb({ text: '', error: 'usage limit reached' })).o.note));
    ok('a call that throws → the fallback', /could not be asked/.test((await fb(async () => { throw new Error('ENOENT codex'); })).o.note));
    ok('‼️ found "asking" after a restart → the fallback, never a second call',
        /never asked twice/.test((await fb({ text: '{}' }, { supervision: { key: 'k1', state: 'asking', at: 0, atWhy: '', failedTask: 't1', calls: 1 } })).o.note));
    ok('out of calls → the fallback (M-48: the shared ceiling)', /used its 2 calls for this task/.test((await fb({ text: '{}' }, { supervision: { key: 'k1', state: 'pending', at: 0, atWhy: '', failedTask: 't1', calls: 2 } })).o.note));
    ok('the policy\'s own fallback is used', (await fb({ text: 'x' }, {}, Object.assign({}, policy, { lowConfidence: 'park' }))).o.fallback === 'park');

    console.log('\n== the TaskManager holds a supervised retry ==');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sup-'));
    const store = path.join(dir, 'farm-tasks.json');
    const agent = { id: 'a1', name: 'developer', dir, normDir: dir.replace(/\\/g, '/').toLowerCase() };
    const outFile = path.join(dir, 'out.md');
    fs.writeFileSync(outFile, 'Claude usage limit reached', 'utf8');
    const now = Date.now();
    fs.writeFileSync(store, JSON.stringify({
        tasks: [{
            id: 't1', agentId: 'a1', agentName: 'developer', title: 'Gece', prompt: 'özgün iş', mode: 'headless',
            status: 'failed', createdAt: 1, startedAt: now - H, endedAt: now - 1000, outputFile: outFile, engine: 'claude', account: 'claude-kate',
            runSessionId: 's1', progress: { assistantSteps: 5, toolCalls: 12 }, failurePhase: 'interrupted',
            retry: { max: 3, delayMin: 40, behavior: 'supervisor', supervisor: { engine: 'codex' } }
        }],
        schedules: [], templates: [], workflows: [], triggers: []
    }), 'utf8');
    const tm = new TaskManager(store, () => [agent], () => false, () => '', { supervisorRoom: () => 'free', accountWall: () => ({ value: 95, why: 'the test wall' }) });
    tm.maybeScheduleRetry(tm.tasks.find(t => t.id === 't1'));
    const held = tm.tasks.find(t => t.retryOf === 't1');
    ok('the retry row exists, queued, as Smart Continue made it (same session, continuation)',
        held && held.status === 'queued' && held.resumeSessionId === 's1' && held.continuationOf === 't1');
    ok('‼️ …and HELD for the supervisor, which a free Codex may be asked at once',
        held.supervision && held.supervision.state === 'pending' && held.deferredCode === V.SUPERVISION_HOLD_CODE
        && held.supervision.at <= Date.now() && /separate limit with room/.test(held.supervision.atWhy));
    ok('it is due, and the pump would not launch it', tm.supervisionDue().some(t => t.id === held.id) && tm.startTask(held) === false && held.status === 'queued');
    ok('begin marks it asking and counts the call, once', tm.beginSupervision(held) === true && held.supervision.state === 'asking' && held.supervision.calls === 1 && tm.beginSupervision(held) === false);
    tm.settleSupervision(held, { kind: 'decision', decision: { action: 'needsUser', reason: 'iki yol var', confidence: 0.9 } }, { engine: 'codex', originalPrompt: 'özgün iş', spentUsd: 0.01 });
    ok('needsUser: still queued, held for you, the decision and cost on the record',
        held.status === 'queued' && held.deferredCode === V.SUPERVISION_ASK_CODE && held.supervision.state === 'decided'
        && held.supervision.decision.action === 'needsUser' && held.supervision.spentUsd === 0.01 && tm.startTask(held) === false);
    const persisted = JSON.parse(fs.readFileSync(store, 'utf8')).tasks.find(t => t.id === held.id);
    ok('the supervision record is in the store (a restart sees it)', persisted.supervision && persisted.supervision.state === 'decided');
    tm.dispose();

    const store2 = path.join(dir, 'farm-tasks2.json');
    const seed = JSON.parse(fs.readFileSync(store, 'utf8'));
    seed.tasks = seed.tasks.filter(t => t.id === 't1');
    seed.tasks[0].retry.supervisor = { engine: 'claude' };
    fs.writeFileSync(store2, JSON.stringify(seed), 'utf8');
    const tm2 = new TaskManager(store2, () => [agent], () => false, () => '', { supervisorRoom: () => 'free', accountWall: () => ({ value: 95, why: 'the test wall' }) });
    tm2.maybeScheduleRetry(tm2.tasks.find(t => t.id === 't1'));
    const same = tm2.tasks.find(t => t.retryOf === 't1');
    ok('‼️ a Claude supervisor on the task\'s own sign-in is NOT asked now, whatever "room" says',
        same.supervision.at >= same.notBefore - 1 && /shares the limit/.test(same.supervision.atWhy));
    tm2.settleSupervision(same, { kind: 'decision', decision: { action: 'stop', reason: 'iş bitmiş', confidence: 0.95 } }, { engine: 'claude', originalPrompt: 'özgün iş' });
    ok('stop: cancelled, with the supervisor\'s words', same.status === 'cancelled' && (same.events || []).some(e => /iş bitmiş/.test(e.note || '')));
    tm2.dispose();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }

    console.log(`\ntest_retry_supervision: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
