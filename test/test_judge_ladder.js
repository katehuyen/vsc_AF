// A-27 — the judge's ladder (src/core/judgeLadder.ts) and a cost preset for one workflow run.
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
const L = require(path.join(ROOT, 'out/core/judgeLadder.js'));
const { workflowRunPreset } = require(path.join(ROOT, 'out/core/runWithTask.js'));
const { BUILTIN_PRESETS } = require(path.join(ROOT, 'out/core/flexPresets.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the pure rules ---------- */
eq('rungs cheapest first, blanks and repeats gone', [L.ladderOf('haiku, sonnet haiku'), L.ladderOf(''), L.ladderOf(['sonnet', ' opus '])], [['haiku', 'sonnet'], [], ['sonnet', 'opus']]);
eq('model names pass; anything else is refused by name', [L.ladderRefusal('haiku,sonnet'), L.ladderRefusal(''), L.ladderRefusal('claude-haiku-4-5-20251001 sonnet')], ['', '', '']);
ok('…a rung that is no model name is named', /not "ha;iku"/.test(L.ladderRefusal('ha;iku,sonnet')));
eq('this run beats Farm Settings; nothing = no ladder', [L.ladderFor(undefined, 'sonnet,opus', 'haiku'), L.ladderFor({}, '', 'haiku,sonnet'), L.ladderFor(undefined, undefined, '')],
    [{ rungs: ['sonnet', 'opus'], from: 'run' }, { rungs: ['haiku', 'sonnet'], from: 'settings' }, { rungs: [], from: 'builtin' }]);
eq('‼️ a step that names its own judge engine or model keeps it', [L.ladderFor({ engine: 'agy' }, 'haiku,sonnet', ''), L.ladderFor({ model: 'opus' }, 'haiku,sonnet', '')], [{ rungs: [], from: 'step' }, { rungs: [], from: 'step' }]);
eq('the line a climbed check writes', L.escalationLine({ model: 'haiku', reason: 'FAIL eksik' }, { model: 'sonnet', pass: true, reason: 'PASS tamam' }),
    'Escalated: haiku said FAIL (FAIL eksik) → sonnet says PASS — overturned, no retry paid: PASS tamam');

/* ---------- the cost profile carries it ---------- */
const byName = n => BUILTIN_PRESETS.find(p => p.name === n);
eq('‼️ Economy, Balanced, Quality — each one\'s values for a workflow run', ['Economy', 'Balanced', 'Quality'].map(n => workflowRunPreset(byName(n))),
    [{ judgeLadder: 'haiku', spendCap: 5 }, { judgeLadder: '', spendCap: 0 }, { judgeLadder: 'sonnet,opus', spendCap: 0 }]);

/* ---------- the wiring ---------- */
const tasks = fs.readFileSync(path.join(ROOT, 'src/core/tasks.ts'), 'utf8');
const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const panel = fs.readFileSync(path.join(ROOT, 'src/panels/tasksPanel.ts'), 'utf8');
ok('both judges climb: the text check and the vision check', /this\.climbJudge\(task, step, sj => this\.runJudge\(/.test(tasks) && /this\.climbJudge\(task, step, sj => this\.runVisionJudge\(/.test(tasks));
ok('workflows.run: a preset\'s run values under the call\'s own, the ladder refused in words', /const pre = runPresetValues\(optStr\(args, 'preset'\)/.test(ext) && /const ladNo = ladderRefusal\(given\('judgeLadder'\)\)/.test(ext));
ok('the Run card: a preset under the boxes the person filled', /const ladIn = msg\.judgeLadder === undefined \|\| msg\.judgeLadder === '' \? pre\.judgeLadder : msg\.judgeLadder;/.test(panel));

/* ---------- the runtime: a real check climbs ---------- */
(async () => {
    const oneShot = require(path.join(ROOT, 'out/core/oneShot.js'));
    const calls = [];
    let verdicts = {};
    oneShot.execOneShot = async (o) => { calls.push(o.model || '(none)'); return { out: verdicts[o.model] || 'PASS', error: '' }; };
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ladder-'));
    const agents = [{ id: 'a1', name: 'yazar', path: path.join(tmp, 'yazar'), cwd: path.join(tmp, 'yazar'), dir: path.join(tmp, 'yazar') }];
    agents.forEach(a => fs.mkdirSync(a.path, { recursive: true }));
    let setting = '';
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => agents, () => false, () => '', { quotaCheck: () => 'hold', judgeLadderSetting: () => setting });
    const settle = (ms) => new Promise(r => setTimeout(r, ms || 60));
    const step = (verify) => [{ id: 'yaz', agentId: 'a1', agentName: 'yazar', title: 'Yaz', prompt: 'yaz', mode: 'headless', verify }];
    // the step "ran": its output is on disk, then it finishes and is judged
    const finishFirst = async (runId) => {
        await settle();
        const t = mgr.tasks.find(x => x.workflowRunId === runId);
        const f = path.join(tmp, t.id + '.md');
        fs.writeFileSync(f, 'Bir metin.', 'utf8');
        t.outputFile = f;
        mgr.completeTask(t);
        await settle(150);
        return t;
    };
    const retries = runId => mgr.tasks.filter(x => x.workflowRunId === runId && x.attempt).length;
    try {
        const w = mgr.addWorkflow('Merdiven', step({ criteria: 'Türkçe olsun', retries: 1 }));

        calls.length = 0; verdicts = { haiku: 'FAIL eksik', sonnet: 'PASS tamam' };
        const r1 = mgr.runWorkflow(w, { judgeLadder: 'haiku,sonnet' });
        const t1 = await finishFirst(r1);
        eq('‼️ cheap-first, and a FAIL judged once more one rung up', calls, ['haiku', 'sonnet']);
        ok('‼️ the upper PASS overturns it: passed, and no retry was paid for', t1.verified === 'pass' && retries(r1) === 0);
        ok('the output says it climbed and why', /Escalated: haiku said FAIL \(FAIL eksik\) → sonnet says PASS — overturned/.test(fs.readFileSync(t1.outputFile, 'utf8'))
            && /judge ladder 1\/2 haiku \(run\) → judge ladder 2\/2 sonnet \(run\)/.test(fs.readFileSync(t1.outputFile, 'utf8')));

        calls.length = 0; verdicts = { haiku: 'FAIL eksik', sonnet: 'FAIL hâlâ eksik' };
        const r2 = mgr.runWorkflow(w, { judgeLadder: 'haiku,sonnet' });
        const t2 = await finishFirst(r2);
        ok('an upheld FAIL goes to the retry as before', calls.join() === 'haiku,sonnet' && t2.verified === 'fail' && retries(r2) === 1);

        calls.length = 0; verdicts = { haiku: 'FAIL eksik' };
        setting = 'haiku';
        const r3 = mgr.runWorkflow(w);
        const t3 = await finishFirst(r3);
        ok('one rung (Economy): the cheap judge alone decides — Farm Settings\' ladder', calls.join() === 'haiku' && t3.verified === 'fail' && retries(r3) === 1);

        calls.length = 0; verdicts = { haiku: 'PASS iyi' };
        setting = 'haiku,sonnet';
        const r4 = mgr.runWorkflow(w);
        await finishFirst(r4);
        eq('a PASS on the bottom rung never climbs', calls, ['haiku']);

        calls.length = 0; verdicts = { opus: 'FAIL kendi hakemi' };
        const w2 = mgr.addWorkflow('Kendi hakemi', step({ criteria: 'Türkçe olsun', retries: 0, model: 'opus' }));
        const r5 = mgr.runWorkflow(w2, { judgeLadder: 'haiku,sonnet' });
        await finishFirst(r5);
        eq('a step with its own judge model is judged by it alone', calls, ['opus']);

        calls.length = 0; setting = '';
        const r6 = mgr.runWorkflow(w);
        await finishFirst(r6);
        eq('no ladder anywhere: the one judge, as before', calls, ['(none)']);
    } finally {
        mgr.dispose();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
