// A-27 part 3 — what a failed check does next (src/core/judgeDecision.ts): stop, replan, and what the run saved.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(), createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } }) }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const D = require(path.join(ROOT, 'out/core/judgeDecision.js'));
const K = require(path.join(ROOT, 'out/core/workflowWake.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the pure rules ---------- */
eq('FAIL-METHOD (or YÖNTEM) is a method verdict; a plain FAIL is not', ['FAIL-METHOD yanlış araç', 'fail_method x', 'FAIL YÖNTEM yanlış', 'FAIL eksik', 'PASS'].map(D.methodFail), [true, true, true, false, false]);
ok('the same defect in other words is the same failure', D.sameFailure('FAIL başlık eksik, özet yok', 'FAIL özet yok ve başlık eksik'));
ok('a different defect is not', !D.sameFailure('FAIL başlık eksik', 'FAIL kaynak gösterilmemiş, tarih yanlış'));
ok('nothing to compare is never "the same"', !D.sameFailure('FAIL', 'FAIL'));
eq('a first FAIL with retries left retries', D.afterFail({ attempt: 0, retries: 2, reason: 'FAIL eksik', canWake: false, attemptUSD: 0.1 }), { go: 'retry' });
eq('no retries left: it fails, nothing decided', D.afterFail({ attempt: 1, retries: 1, reason: 'FAIL-METHOD x', prior: 'FAIL x', canWake: true, attemptUSD: 0.1 }), { go: 'fail' });
const stuck = D.afterFail({ attempt: 1, retries: 3, reason: 'FAIL başlık eksik', prior: 'FAIL başlık eksik', canWake: false, attemptUSD: 0.1 });
eq('‼️ STOP — the retry failed for the same reason: the two retries left are not bought', [stuck.go, stuck.decision.kind, stuck.decision.savedUSD], ['fail', 'stopped', 0.2]);
ok('…and it says why, and that nobody was asked', /attempt 2 failed for the same reason as attempt 1 — 2 retries not paid for; the run's wake is mechanical/.test(stuck.decision.line));
const re = D.afterFail({ attempt: 0, retries: 1, reason: 'FAIL-METHOD bu model yazı çizemez', canWake: true, attemptUSD: 0.05 });
eq('‼️ REPLAN — a method verdict with a supervisor to wake', [re.go, re.decision.kind, re.decision.savedUSD], ['fail', 'replan', 0.05]);
ok('…says the supervisor is woken instead of the retry', /^Replan: the judge says the method is wrong — the supervisor is woken to change the plan instead of 1 retry more of the same$/.test(re.decision.line));
eq('an overturned FAIL saves the retry it would have bought; with none left it saves nothing', [D.climbDecision(true, 'l', true, 0.3), D.climbDecision(true, 'l', false, 0.3), D.climbDecision(false, 'l', true, 0.3)],
    [{ kind: 'overturned', line: 'l', savedUSD: 0.3 }, { kind: 'overturned', line: 'l' }, { kind: 'upheld', line: 'l' }]);
const e = D.runEconomy([{ judgeDecisions: [{ kind: 'overturned', line: 'a', savedUSD: 0.3 }] }, {}, { judgeDecisions: [{ kind: 'upheld', line: 'b' }, { kind: 'stopped', line: 'c', savedUSD: 0.2 }] }]);
eq('the run adds its rows up', e, { climbs: 2, overturned: 1, stopped: 1, replans: 0, picked: 0, savedUSD: 0.5, lines: ['a', 'b', 'c'] });
eq('…and says it short', D.economyShort(e), '2 climbs · 1 overturned · 1 stopped · ~$0.50 saved');
eq('…and for a narrow cell, the decision that mattered most', [D.economyCell(e), D.economyCell({ climbs: 1, overturned: 0, stopped: 0, replans: 0, picked: 0, savedUSD: 0, lines: [] }), D.economyCell({ climbs: 0, overturned: 0, stopped: 0, replans: 0, picked: 1, savedUSD: 0, lines: [] })], ['stopped ~$0.50', 'upheld', 'picked']);
eq('no decision anywhere: no economy', D.runEconomy([{}, { judgeDecisions: [] }]), undefined);

/* ---------- the wiring ---------- */
const tasks = fs.readFileSync(path.join(ROOT, 'src/core/tasks.ts'), 'utf8');
ok('both checks go through judgeNext', (tasks.match(/const go = this\.judgeNext\(task, w, step, judged, attempt, retries\);/g) || []).length === 2);
ok('both judges are told they may say FAIL-METHOD', (tasks.match(/FAIL ya da FAIL-METHOD olsun/g) || []).length === 2);
// ‼️ the Run card redraws only when ownOf moves: a preset it did not count left the cap and ladder boxes showing the old values
ok('picking a Cost preset redraws the Run card', /run\.preset \? \['preset:' \+ run\.preset\] : \[\]/.test(fs.readFileSync(path.join(ROOT, 'media/afRunWith.js'), 'utf8')));

/* ---------- the runtime ---------- */
(async () => {
    const oneShot = require(path.join(ROOT, 'out/core/oneShot.js'));
    let verdicts = [];
    oneShot.execOneShot = async () => ({ out: verdicts.shift() || 'PASS', error: '' });
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-judgedec-'));
    const agents = [{ id: 'a1', name: 'yazar', path: path.join(tmp, 'yazar'), cwd: path.join(tmp, 'yazar'), dir: path.join(tmp, 'yazar') }];
    agents.forEach(a => fs.mkdirSync(a.path, { recursive: true }));
    const prompts = [];
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => agents, () => false, () => '', {
        quotaCheck: () => 'hold', superviseTurn: async (p) => { prompts.push(p); return { out: JSON.stringify({ decision: 'stop', confidence: 0.9, why: 'yöntem değişmeli' }) }; }
    });
    const settle = (ms) => new Promise(r => setTimeout(r, ms || 60));
    const step = (verify) => [{ id: 'yaz', agentId: 'a1', agentName: 'yazar', title: 'Yaz', prompt: 'yaz', mode: 'headless', verify }];
    // an attempt "ran" and cost $0.10: its output is on disk, then it finishes and is judged
    const finish = async (runId, attempt) => {
        await settle();
        const t = mgr.tasks.find(x => x.workflowRunId === runId && (x.attempt ?? 0) === attempt && !x.wokeBy);
        const f = path.join(tmp, t.id + '.md');
        fs.writeFileSync(f, 'Bir metin.', 'utf8');
        t.outputFile = f;
        t.costUSD = 0.1;
        mgr.completeTask(t);
        await settle(150);
        return t;
    };
    const attempts = runId => mgr.tasks.filter(x => x.workflowRunId === runId && !x.wokeBy).length;
    try {
        const w = mgr.addWorkflow('Tavan', step({ criteria: 'Başlık ve özet olsun', retries: 3 }));
        verdicts = ['FAIL başlık eksik, özet yok', 'FAIL özet yok, başlık eksik'];
        const r1 = mgr.runWorkflow(w);
        await finish(r1, 0);
        const t1 = await finish(r1, 1);
        ok('‼️ the retry that failed the same way is the last one paid for', attempts(r1) === 2 && t1.status === 'failed');
        ok('…its output says so', /Stopped: attempt 2 failed for the same reason as attempt 1 — 2 retries not paid for/.test(fs.readFileSync(t1.outputFile, 'utf8')));
        const s1 = mgr.workflowRunState(r1);
        eq('workflows.status carries the run\'s economy', [s1.economy.stopped, s1.economy.savedUSD], [1, 0.2]);

        verdicts = ['FAIL eksik', 'FAIL bambaşka bir kusur: kaynak yok'];
        const r2 = mgr.runWorkflow(w);
        await finish(r2, 0);
        await finish(r2, 1);
        ok('a retry that failed for a NEW reason is still retried', attempts(r2) === 3 && !mgr.workflowRunState(r2).economy);

        const wh = mgr.addWorkflow('Yöntem', step({ criteria: 'Görsel çiz', retries: 2 }));
        K.setWorkflowWake(wh, K.wakePresetConditions('hybrid'));
        verdicts = ['FAIL-METHOD bu ajan görsel üretemez'];
        const r3 = mgr.runWorkflow(wh);
        const t3 = await finish(r3, 0);
        await settle(200);
        const woke = mgr.tasks.find(x => x.workflowRunId === r3 && x.wokeBy);
        ok('‼️ a method verdict buys no retry and wakes the supervisor to replan', attempts(r3) === 1 && t3.verified === 'fail' && !!woke && woke.wokeBy.includes('replan'));
        ok('…which is told why', prompts.some(p => /replan \(Replan: the judge says the method is wrong/.test(p)));
        eq('…and the run counts it', mgr.workflowRunState(r3).economy.replans, 1);

        // ‼️ what a check costs reaches the step and the run: claude is asked for its envelope, every rung counted
        const asked = [];
        const env = (result, usd) => JSON.stringify({ type: 'result', result, total_cost_usd: usd, is_error: false });
        const answers = { haiku: env('FAIL eksik', 0.002), sonnet: env('PASS tamam', 0.011) };
        oneShot.execOneShot = async (o) => { asked.push(!!o.json); return { out: answers[o.model] || env('PASS', 0.001), error: '' }; };
        const wl = mgr.addWorkflow('Hakem parası', step({ criteria: 'Türkçe olsun', retries: 1 }));
        const r4 = mgr.runWorkflow(wl, { judgeLadder: 'haiku,sonnet' });
        const t4 = await finish(r4, 0);
        ok('the claude judge is asked for its envelope, and read out of it', asked.length === 2 && asked.every(Boolean) && t4.verified === 'pass');
        eq('both rungs are the step\'s check spend', t4.judgeUSD, 0.013);
        ok('…and the run\'s total counts it beside the step\'s own', Math.abs(mgr.workflowRunState(r4).costUSD - 0.113) < 1e-9);
        oneShot.execOneShot = async () => ({ out: JSON.stringify({ type: 'result', result: '', subtype: 'error_max_turns', is_error: true, total_cost_usd: 0.004 }), error: '' });
        const r5 = mgr.runWorkflow(mgr.addWorkflow('Hakem hatası', step({ criteria: 'Türkçe olsun', retries: 1 })));
        const t5 = await finish(r5, 0);
        ok('‼️ an error envelope is no verdict: unjudged, never a FAIL nobody gave', t5.verified === 'unjudged' && /the judge could not run \(the turn ended in error_max_turns\)/.test(fs.readFileSync(t5.outputFile, 'utf8')));
    } finally {
        mgr.dispose();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
