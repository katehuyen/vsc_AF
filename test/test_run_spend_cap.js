// A-27 — the run's hard spend cap (src/core/runSpendCap.ts): mechanical, between steps and between branches.
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
const C = require(path.join(ROOT, 'out/core/runSpendCap.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the pure rules ---------- */
eq('a cap is dollars, 0 or more; blank is not set', [undefined, '', 0, 5, '2.5'].map(C.spendCapRefusal), ['', '', '', '', '']);
ok('a negative or a word is refused in words', /0 or more/.test(C.spendCapRefusal(-1)) && /not "x"/.test(C.spendCapRefusal('x')));
eq('this run beats the workflow, which beats Farm Settings', [C.runSpendCap(2, 5, 9), C.runSpendCap(undefined, 5, 9), C.runSpendCap('', undefined, 9), C.runSpendCap(undefined, undefined, undefined)],
    [{ usd: 2, from: 'run' }, { usd: 5, from: 'workflow' }, { usd: 9, from: 'settings' }, { usd: 0, from: 'builtin' }]);
eq('below the cap, or no cap: nothing', [C.spendCapStop(0.99, { usd: 1, from: 'run' }), C.spendCapStop(50, { usd: 0, from: 'builtin' }), C.spendCapStop(50, undefined)], ['', '', '']);
eq('at the cap the run stops, naming what it spent, the cap and where the cap came from', C.spendCapStop(1.2345, { usd: 1, from: 'workflow' }),
    'spend cap reached — the run has spent $1.23 of its $1.00 cap (workflow); no further step starts');
const fe = { branches: [{ index: 0, status: 'done' }, { index: 1, status: 'running' }, { index: 2, status: 'waiting' }, { index: 3, status: 'waiting' }] };
eq('waiting branches close as not started; the one in flight finishes', [C.capWaitingBranches(fe, 'spend cap reached'), fe.branches.map(b => b.status)], [2, ['done', 'running', 'failed', 'failed']]);
ok('…and each says why', fe.branches[3].reason === 'not started — spend cap reached');

/* ---------- the wiring ---------- */
const tasks = fs.readFileSync(path.join(ROOT, 'src/core/tasks.ts'), 'utf8');
const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const panel = fs.readFileSync(path.join(ROOT, 'src/panels/tasksPanel.ts'), 'utf8');
ok('‼️ between steps: after the step limit, before a step starts', /step limit reached \(possible loop[\s\S]{0,200}const capped = spendCapStop\(this\.runSpent\(runId\), this\.runRecords\.get\(runId\)\?\.spendCap\);[\s\S]{0,300}this\.endWorkflowRun\(runId, 'stopped', capped, index\)/.test(tasks));
ok('‼️ between branches: the waiting ones close, and the fan-in ends when none is in flight', /const capped = spendCapStop[\s\S]{0,120}capWaitingBranches\(run, capped\);[\s\S]{0,120}if \(!run\.branches\.some\(b => b\.status === 'running'\)\) \{ this\.finishForEach\(w, runId, false\); \}/.test(tasks));
ok('the cap is settled once, when the run starts: run → workflow → Farm Settings', /runSpendCap\(opts\?\.spendCap, w\.spendCap, this\.opts\.spendCapSetting\?\.\(\)\)/.test(tasks));
ok('workflows.status shows the cap in force', /\.\.\.\(rec\?\.spendCap \? \{ spendCap: rec\.spendCap \} : \{\}\)/.test(tasks));
ok('the bridge: workflows.add (the shared save), workflows.update and workflows.run take spendCap, refused in words', (ext.match(/spendCapRefusal\(args\.spendCap\)/g) || []).length === 2 && /spendCapRefusal\(given\('spendCap'\)\)/.test(ext));
ok('the task manager and the panel read Farm Settings', (ext.match(/spendCapSetting: \(\) => cfg\(\)\.get<number>\('workflowSpendCap', 0\)/g) || []).length === 2);
ok('the panel: the workflow form saves it, Run with… sends it', /if \(cap\) \{ existing\.spendCap = cap; \} else \{ delete existing\.spendCap; \}/.test(panel) && /spendCap: runCap/.test(panel) && /spendCapRefusal\(capIn\)/.test(panel));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const props = [].concat(pkg.contributes.configuration).reduce((a, c) => Object.assign(a, c.properties || {}), {});
ok('agentFarm.workflowSpendCap is a number, default 0, not below 0', props['agentFarm.workflowSpendCap'] && props['agentFarm.workflowSpendCap'].type === 'number' && props['agentFarm.workflowSpendCap'].default === 0 && props['agentFarm.workflowSpendCap'].minimum === 0);

/* ---------- the runtime: a real run stops at its cap ---------- */
(async () => {
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-spendcap-'));
    const agents = [{ id: 'a1', name: 'yazar', path: path.join(tmp, 'yazar'), cwd: path.join(tmp, 'yazar') }];
    agents.forEach(a => fs.mkdirSync(a.path, { recursive: true }));
    let setting = 0;
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => agents, () => false, () => '', { quotaCheck: () => 'hold', spendCapSetting: () => setting });
    const settle = (ms) => new Promise(r => setTimeout(r, ms || 400));
    // step 1 fails fast (no such file) and costs what the test says; step 2 would start after it
    const chain = () => [
        { id: 'cut', agentId: '', agentName: 'tool', title: 'Kes', prompt: '', mode: 'headless', onFail: 'continue', tool: { recipe: 'split', input: path.join(tmp, 'yok.mp4') } },
        { id: 'write', agentId: 'a1', agentName: 'yazar', title: 'Yaz', prompt: 'yaz', mode: 'headless' }
    ];
    const costFirst = (runId, usd) => { const t = mgr.tasks.find(x => x.workflowRunId === runId); if (t) { t.costUSD = usd; } return !!t; };
    const until = async (runId, pred) => { for (let i = 0; i < 40; i++) { const st = mgr.workflowRunState(runId); if (st && pred(st)) { return st; } await settle(100); } return mgr.workflowRunState(runId); };
    try {
        const w = mgr.addWorkflow('Tavan', chain());
        const r1 = mgr.runWorkflow(w, { spendCap: 1 });
        ok('the first step\'s row is there to carry a spend', costFirst(r1, 2));
        const s1 = await until(r1, st => st.status !== 'running');
        ok('‼️ a run past its cap stops before the next step, and says why', s1 && s1.status === 'stopped'
            && /spend cap reached — the run has spent \$2\.00 of its \$1\.00 cap \(run\)/.test(s1.reason || ''));
        ok('‼️ …the next step never started', !mgr.tasks.some(t => t.workflowRunId === r1 && t.title.includes('Yaz')));
        eq('…and the status names the cap in force', s1 && s1.spendCap, { usd: 1, from: 'run' });

        const r2 = mgr.runWorkflow(w);
        costFirst(r2, 2);
        await until(r2, st => st.steps && st.steps.length > 1);
        ok('no cap anywhere: the same spend carries on to the next step', mgr.tasks.some(t => t.workflowRunId === r2 && t.title.includes('Yaz')));

        setting = 1.5;
        const r3 = mgr.runWorkflow(w);
        costFirst(r3, 2);
        const s3 = await until(r3, st => st.status !== 'running');
        ok('Farm Settings\' cap stops a workflow that sets none', s3 && s3.status === 'stopped' && /of its \$1\.50 cap \(settings\)/.test(s3.reason || ''));

        w.spendCap = 5;
        const r4 = mgr.runWorkflow(w);
        costFirst(r4, 2);
        await until(r4, st => st.steps && st.steps.length > 1);
        ok('the workflow\'s own cap beats Farm Settings\' (5 over 1.5 — $2 carries on)', mgr.tasks.some(t => t.workflowRunId === r4 && t.title.includes('Yaz')));
    } finally {
        mgr.dispose();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
