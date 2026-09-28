// Wave B2 tests: injectMediaFeedback + verifyMediaThenAdvance flow.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Emitter {
    constructor() { this.h = []; }
    get event() { return (fn) => { this.h.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const f of this.h) f(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    },
    commands: { executeCommand: () => Promise.resolve(undefined) },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
    Uri: { file: (f) => ({ fsPath: f }) },
    ThemeIcon: class { }, ThemeColor: class { }
};
const origLoad = Module._load;
Module._load = function (request) { if (request === 'vscode') { return fakeVscode; } return origLoad.apply(this, arguments); };
const OUT = require('path').resolve(__dirname, '../out/core');
const { TaskManager } = require(path.join(OUT, 'tasks.js'));
const media = require(path.join(OUT, 'media.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { pass++; } else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- injectMediaFeedback ----------
eq('injects into prompt', media.injectMediaFeedback('{"prompt":"a cat"}', 'FAIL: yüz bulanık'),
    JSON.stringify({ prompt: 'a cat (Önceki denemede şu sorun vardı: yüz bulanık. Bunu düzelt.)' }));
eq('strips PASS/FAIL prefix', JSON.parse(media.injectMediaFeedback('{"prompt":"x"}', 'FAIL - altı parmak')).prompt,
    'x (Önceki denemede şu sorun vardı: altı parmak. Bunu düzelt.)');
eq('no prompt field → unchanged', media.injectMediaFeedback('{"image_url":"u"}', 'FAIL bad'), '{"image_url":"u"}');
eq('non-json → unchanged', media.injectMediaFeedback('not json', 'FAIL bad'), 'not json');
eq('empty feedback → unchanged', media.injectMediaFeedback('{"prompt":"x"}', 'PASS'), '{"prompt":"x"}');

// ---------- verifyMediaThenAdvance ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-b2-'));
const outputsDir = path.join(tmp, 'outputs'); fs.mkdirSync(outputsDir);
const tm = new TaskManager(path.join(tmp, 'tasks.json'), () => [], () => false, () => '', {});
Object.defineProperty(tm, 'outputsDir', { value: outputsDir, writable: true });

const wf = tm.addWorkflow('W', [
    { agentId: '', agentName: 'media', title: 'üret', prompt: '', mode: 'headless',
      media: { model: 'flux', input: '{"prompt":"a cat"}' }, verify: { criteria: 'net yüz', retries: 2 } }
]);
const runId = 'r1';
tm.handoffs.set(runId, { text: 'upstream' });

function makeMediaTask(attempt) {
    const id = 'mt' + (attempt ?? 0) + '_' + Math.random().toString(36).slice(2, 6);
    const outFile = path.join(outputsDir, id + '.md');
    fs.writeFileSync(outFile, '# media\n\n---\n\n{}\n', 'utf8');
    const assetFile = path.join(outputsDir, id + '-1.png');
    fs.writeFileSync(assetFile, 'PNG', 'utf8');
    fs.writeFileSync(path.join(outputsDir, id + '.media.json'), JSON.stringify({
        taskId: id, title: 'üret', model: 'flux', input: '{}', assetFiles: [assetFile],
        assetUrls: ['http://x/' + id + '.png'], estCost: 0, ts: Date.now()
    }), 'utf8');
    const task = { id, agentId: '', agentName: 'media', title: 'üret', mode: 'headless', status: 'done',
        createdAt: Date.now(), outputFile: outFile, attempt, workflowId: wf.id, workflowRunId: runId, stepIndex: 0 };
    tm.tasks.push(task);
    return task;
}

(async () => {
    // Signature: verifyMediaThenAdvance(task, w, step).
    let advanced = null, retried = null;
    tm.advanceWorkflow = (t, s) => { advanced = s; };
    tm.runMediaStep = async (_w, _i, _h, _r, retry) => { retried = retry; };

    // PASS → advance done, no retry
    tm.runVisionJudge = async () => ({ pass: true, reason: 'PASS net' });
    let t = makeMediaTask(0);
    await tm.verifyMediaThenAdvance(t, wf, wf.steps[0]);
    eq('PASS advances done', advanced, 'done');
    eq('PASS no retry', retried, null);
    eq('PASS marks verified', t.verified, 'pass');
    ok('PASS logged to output', /Vision verify \(attempt 1\): PASS/.test(fs.readFileSync(t.outputFile, 'utf8')));

    // FAIL with attempts left → regenerate (runMediaStep called with attempt+1 + feedback)
    advanced = null; retried = null;
    tm.runVisionJudge = async () => ({ pass: false, reason: 'FAIL yüz bulanık' });
    t = makeMediaTask(0);
    await tm.verifyMediaThenAdvance(t, wf, wf.steps[0]);
    eq('FAIL(0) no advance yet', advanced, null);
    ok('FAIL(0) regenerates', retried && retried.attempt === 1 && /yüz bulanık/.test(retried.feedback));
    eq('FAIL(0) marks verified fail', t.verified, 'fail');

    // FAIL at last attempt (attempt == retries) → fail the step
    advanced = null; retried = null;
    tm.runVisionJudge = async () => ({ pass: false, reason: 'FAIL hala kötü' });
    t = makeMediaTask(2); // retries=2, attempt=2 → exhausted
    await tm.verifyMediaThenAdvance(t, wf, wf.steps[0]);
    eq('FAIL exhausted advances failed', advanced, 'failed');
    eq('FAIL exhausted task failed', t.status, 'failed');
    eq('FAIL exhausted no regen', retried, null);

    // ‼️ M-42 — no asset is NOT a pass: nothing was looked at, so judge.unjudged decides.
    advanced = null;
    tm.runVisionJudge = async () => { throw new Error('should not be called'); };
    t = makeMediaTask(0);
    // remove the asset file to simulate pruned/failed download
    const meta = media.readMediaMetas(outputsDir).find(m => m.taskId === t.id);
    fs.unlinkSync(meta.assetFiles[0]);
    await tm.verifyMediaThenAdvance(t, wf, wf.steps[0]);
    eq('no asset, nobody to ask → it did not pass', [advanced, t.verified], ['failed', 'unjudged']);
    ok('…and the archive says NOT JUDGED and why', /NOT JUDGED — there is no downloaded asset to look at/.test(fs.readFileSync(t.outputFile, 'utf8')));

    advanced = null;
    tm.opts.judgeUnjudged = () => 'pass';
    t = makeMediaTask(0);
    fs.unlinkSync(media.readMediaMetas(outputsDir).find(m => m.taskId === t.id).assetFiles[0]);
    await tm.verifyMediaThenAdvance(t, wf, wf.steps[0]);
    eq('no asset + judge.unjudged = pass → continues, said so', advanced, 'done');
    delete tm.opts.judgeUnjudged;

    // M-55 — the library had moved the clip out of the outputs dir and the judge was sent there with its bare
    // name ("the file is not on this system"), its criteria still reading {input.brief}: four false FAILs, a paid retry
    delete tm.runVisionJudge;
    const oneShot = require(path.join(OUT, 'oneShot.js'));
    const realShot = oneShot.execOneShot;
    const seen = [];
    oneShot.execOneShot = async (o) => { seen.push(o); return { out: 'PASS sıcak', error: '' }; };
    const libDir = path.join(tmp, 'library', 'semi'); fs.mkdirSync(libDir, { recursive: true });
    const wf2 = tm.addWorkflow('W2', [{ agentId: '', agentName: 'media', title: 'düzenle', prompt: '', mode: 'headless',
        media: { model: 'flux', input: '{"prompt":"x"}' }, verify: { criteria: 'The clip shows: {input.brief}.', retries: 0 } }]);
    tm.runRecords.set(runId, { inputs: { brief: 'sıcak gün batımı tonları' } });
    advanced = null;
    t = makeMediaTask(0);
    t.workflowId = wf2.id;
    const moved = path.join(libDir, path.basename(media.readMediaMetas(outputsDir).find(m => m.taskId === t.id).assetFiles[0]));
    fs.renameSync(media.readMediaMetas(outputsDir).find(m => m.taskId === t.id).assetFiles[0], moved);
    const metaFile = path.join(outputsDir, t.id + '.media.json');
    fs.writeFileSync(metaFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(metaFile, 'utf8')), assetFiles: [moved] }), 'utf8');
    await tm.verifyMediaThenAdvance(t, wf2, wf2.steps[0]);
    oneShot.execOneShot = realShot;
    eq('‼️ the vision judge runs in the folder the file is in now', seen.length && seen[0].cwd, libDir);
    ok('‼️ …and reads criteria with the run\'s inputs filled', seen.length && /The clip shows: sıcak gün batımı tonları\./.test(seen[0].prompt) && !/\{input\./.test(seen[0].prompt));
    eq('…so it can pass', advanced, 'done');

    // finish() routes media+verify to the vision path (not the crashing text path)
    let calledVision = false;
    tm.verifyMediaThenAdvance = async () => { calledVision = true; };
    tm.verifyThenAdvance = async () => { throw new Error('text path must not run for media'); };
    const ft = makeMediaTask(0);
    ft.status = 'running';
    tm.finish(ft, 'done');
    ok('finish routes media verify to vision path', calledVision);

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    Module._load = origLoad;
    process.exit(fail ? 1 : 0);
})();
