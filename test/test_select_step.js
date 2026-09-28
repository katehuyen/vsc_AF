// Wave B tests: mediaCandidates/recordSelection + runSelectStep handoff flow.
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
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
const OUT = require('path').resolve(__dirname, '../out/core');
const { TaskManager } = require(path.join(OUT, 'tasks.js'));
const media = require(path.join(OUT, 'media.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-waveb-'));
const outputsDir = path.join(tmp, 'outputs'); fs.mkdirSync(outputsDir);

// ---------- pure media helpers ----------
const metas = [
    { taskId: 'm1', title: 'kare', model: 'flux', input: '{}', estCost: 0, ts: 1,
      assetFiles: ['/o/m1-1.png', '/o/m1-2.png'], assetUrls: ['http://x/1.png', 'http://x/2.png'] },
    { taskId: 'm2', title: 'tek', model: 'flux', input: '{}', estCost: 0, ts: 2,
      assetFiles: ['/o/m2-1.png'], assetUrls: ['http://x/3.png'] }
];
const cands = media.mediaCandidates(metas);
eq('candidate count', cands.length, 3);
eq('multi-asset titles numbered', cands[0].title, 'kare #1');
eq('single asset title plain', cands[2].title, 'tek');
eq('candidate url', cands[0].url, 'http://x/1.png');
eq('url falls back to file', media.mediaCandidates([{ taskId: 'x', title: 't', assetFiles: ['/o/a.png'] }])[0].url, '/o/a.png');

for (const m of metas) {
    fs.writeFileSync(path.join(outputsDir, `${m.taskId}.media.json`), JSON.stringify(m), 'utf8');
}
media.recordSelection(outputsDir, media.readMediaMetas(outputsDir), ['http://x/1.png', 'http://x/3.png']);
const after = media.readMediaMetas(outputsDir);
eq('m1 selected', after.find(m => m.taskId === 'm1').selectedUrls, ['http://x/1.png']);
eq('m1 rejected', after.find(m => m.taskId === 'm1').rejectedUrls, ['http://x/2.png']);
eq('m2 rejected empty', after.find(m => m.taskId === 'm2').rejectedUrls, []);

// ---------- runSelectStep via TaskManager ----------
const tm = new TaskManager(path.join(tmp, 'tasks.json'),
    () => [{ id: 'a1', name: 'dev', dir: tmp }], () => false, () => '', {});
Object.defineProperty(tm, 'outputsDir', { value: outputsDir, writable: true });

const wf = tm.addWorkflow('Test', [
    { agentId: '', agentName: 'media', title: 'üret', prompt: '', mode: 'headless', media: { model: 'flux', input: '{}' } },
    { agentId: '', agentName: 'select', title: 'seç', prompt: '', mode: 'headless', select: { message: '', min: 1, max: 2 } },
    { agentId: 'a1', agentName: 'dev', title: 'kullan', prompt: 'url: {prev_json.selected.0} · hepsi: {prev_text}', mode: 'headless' }
]);

const runId = 'run1';
tm.tasks.push({ id: 'm1', agentId: '', agentName: 'media', title: 'üret', mode: 'headless',
    status: 'done', createdAt: 1, workflowId: wf.id, workflowRunId: runId, stepIndex: 0 });
tm.tasks.push({ id: 'm2', agentId: '', agentName: 'media', title: 'üret2', mode: 'headless',
    status: 'done', createdAt: 1, workflowId: wf.id, workflowRunId: runId, stepIndex: 0 });

let captured = [];
tm.startTask = (task) => { captured.push({ startedPrompt: task.prompt, title: task.title }); return true; };

(async () => {
    // --- keep 2 → step done, selection flows to next step ---
    let during = null;
    tm.opts.confirmSelection = async (info) => {
        captured.push({ info });
        const r = tm.tasks.find(t => t.agentName === 'select' && t.status === 'running');
        during = { asks: tm.openHumanAsks(), row: r && { id: r.id, waitingOn: r.waitingOn } };
        return ['http://x/1.png', 'http://x/3.png'];
    };
    await tm.runSelectStep(wf, 1, {}, runId);
    // S-108 — while the pick is open the row and the wait list say so; once answered both drop it
    ok('‼️ an open pick is a wait on its own row, in one sentence', during && during.asks.length === 1 && during.asks[0].kind === 'selection'
        && during.row && during.row.waitingOn === during.asks[0].what && during.asks[0].taskId === during.row.id);
    ok('…and the answer clears both', tm.openHumanAsks().length === 0 && tm.tasks.every(t => !t.waitingOn));
    const info = captured.find(c => c.info)?.info;
    ok('picker got 3 candidates', info && info.candidates.length === 3);
    eq('picker min/max', [info.min, info.max], [1, 2]);
    const started = captured.find(c => c.startedPrompt);
    ok('downstream step started', !!started);
    ok('prev_json.selected.0 substituted', started && started.startedPrompt.indexOf('url: http://x/1.png') === 0);
    ok('prev_text = newline-joined urls', started && started.startedPrompt.indexOf('http://x/1.png\nhttp://x/3.png') !== -1);
    eq('select task done', tm.tasks.find(t => t.agentName === 'select').status, 'done');

    // --- cancel → step fails, no downstream ---
    captured = [];
    let advanced = null;
    tm.advanceWorkflow = (task, status) => { advanced = status; };
    tm.opts.confirmSelection = async () => null;
    await tm.runSelectStep(wf, 1, {}, runId);
    eq('cancel fails the step', advanced, 'failed');
    ok('no downstream on cancel', !captured.find(c => c.startedPrompt));

    // --- no UI wired → keep all ---
    captured = [];
    delete tm.opts.confirmSelection;
    await tm.runSelectStep(wf, 1, {}, runId);
    const auto = captured.find(c => c.startedPrompt);
    ok('auto keep-all when no UI', auto &&
        auto.startedPrompt.indexOf('http://x/1.png') !== -1 &&
        auto.startedPrompt.indexOf('http://x/3.png') !== -1);

    // --- no candidates → empty selection, still advances ---
    captured = [];
    tm.tasks = tm.tasks.filter(t => t.agentName !== 'media'); // drop run's media tasks
    await tm.runSelectStep(wf, 1, {}, runId);
    const empty = captured.find(c => c.startedPrompt);
    ok('empty selection still advances', !!empty);
    eq('empty prev_json.selected.0 → blank', empty.startedPrompt, 'url:  · hepsi: ');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    Module._load = origLoad;
    process.exit(fail ? 1 : 0);
})();
