// M-49 — the workflow's tool step: no model, the recipe's result is the step's JSON,
// templates filled from the run, a refused recipe fails the step by name.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: {
        showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const C = require(path.join(ROOT, 'out/core/toolCall.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

(async () => {
    ok('a tool step is checked at save time', /no recipe "blur"/.test(C.toolStepRefusal({ recipe: 'blur' })) && /needs an input/.test(C.toolStepRefusal({ recipe: 'loudnorm' })) && C.toolStepRefusal({ recipe: 'split', input: '{input.clip}', params: { segmentSec: 10 } }) === '');
    const filled = C.fillTool({ recipe: 'concat', params: { files: '{prev}' } }, s => s.replace('{prev}', '["a.mp4","b.mp4"]'));
    ok('a template that becomes a JSON list is that list', JSON.stringify(filled.params.files) === '["a.mp4","b.mp4"]');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-toolstep-'));
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const calls = [];
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [{ id: 'a1', name: 'yazar', dir: agentDir }], () => false, () => '', {
        quotaCheck: () => 'hold', toolDefaults: () => ({ outDir: path.join(tmp, 'o'), overwrite: 'suffix' }),
        runTool: async c => { calls.push(c); return { ok: true, recipe: c.recipe, outputs: [path.join(c.outDir, 'p1.mp4'), path.join(c.outDir, 'p2.mp4')], runs: 2, ms: 5 }; }
    });
    const tick = async () => { for (let i = 0; i < 30; i++) { await new Promise(r => setImmediate(r)); } };
    const w = mgr.addWorkflow('Kes', [
        { id: 's1', agentId: '', agentName: 'tool', title: 'Böl', prompt: '', mode: 'headless', tool: { recipe: 'split', input: '{input.clip}', params: { segmentSec: 10 } } },
        { id: 's2', agentId: 'a1', agentName: 'yazar', title: 'Anlat', prompt: 'parçalar: {prev_json.outputs.0}', mode: 'headless' }
    ]);
    w.inputs = [{ name: 'clip', type: 'file' }];
    const runId = mgr.runWorkflow(w, { inputs: { clip: 'D:\\klip.mp4' } });
    await tick();
    ok('‼️ the recipe ran with its template filled and the flex defaults', calls.length === 1 && calls[0].input === 'D:\\klip.mp4' && calls[0].overwrite === 'suffix' && /[\\/]o$/.test(calls[0].outDir));
    const row = mgr.tasks.find(t => t.workflowRunId === runId && t.stepIndex === 0);
    ok('the step row is done, and no model was asked', row && row.status === 'done' && row.agentName === 'tool');
    const next = mgr.tasks.find(t => t.workflowRunId === runId && t.stepIndex === 1);
    ok('‼️ the next step reads the result as JSON', next && /parçalar: .*p1\.mp4/.test(next.prompt));

    const w2 = mgr.addWorkflow('Yanlış', [{ id: 's1', agentId: '', agentName: 'tool', title: 'X', prompt: '', mode: 'headless', tool: { recipe: 'split' } }]);
    const r2 = mgr.runWorkflow(w2);
    await tick();
    const bad = mgr.tasks.find(t => t.workflowRunId === r2);
    ok('a recipe refused at run time fails the step, saying why', bad && bad.status === 'failed' && /needs an input file/.test(fs.readFileSync(bad.outputFile, 'utf8')));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
