// F2: media job reattach — poll extraction (fal/replicate), onQueued persist,
// load-time reattach against a mock server, chain continuation after reattach.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = require('path').resolve(__dirname, '..');

const infoMsgs = [], warnMsgs = [];
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
        showInformationMessage: (m) => { infoMsgs.push(m); return Promise.resolve(undefined); },
        showWarningMessage: (m) => { warnMsgs.push(m); return Promise.resolve(undefined); },
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};
const media = require(path.join(ROOT, 'out/core/media.js'));
const mp = require(path.join(ROOT, 'out/core/mediaProviders.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };

// ---- mock server: fal queue + replicate prediction + a downloadable asset ----
let base = '';
let falPolls = 0;
const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        const url = req.url;
        if (req.method === 'POST' && url.startsWith('/fal-ai/')) {
            return json(res, 200, {
                request_id: 'rq1',
                status_url: base + '/queue/rq1/status',
                response_url: base + '/queue/rq1'
            });
        }
        if (url === '/queue/rq1/status') {
            falPolls++;
            return json(res, 200, { status: falPolls < 2 ? 'IN_PROGRESS' : 'COMPLETED' });
        }
        if (url === '/queue/rq1') {
            return json(res, 200, { images: [{ url: base + '/asset.png' }] });
        }
        if (url === '/pred/r9') {
            return json(res, 200, { id: 'r9', status: 'succeeded', output: [base + '/asset.png'] });
        }
        if (url === '/asset.png') {
            res.setHeader('Content-Type', 'image/png');
            return res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        }
        res.statusCode = 404; res.end('{}');
    });
});

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;

    // ---- 1. pure poll functions ----
    let r = await media.pollFalResult(base + '/queue/rq1/status', base + '/queue/rq1', 'Key K', { pollMs: 5 });
    check('pollFalResult completes', r.ok && r.assetUrls.length === 1);
    r = await mp.pollReplicateResult(base + '/pred/r9', 'Bearer T', { pollMs: 5 });
    check('pollReplicateResult completes', r.ok && r.assetUrls[0] === base + '/asset.png');

    // ---- 2. runFalJob onQueued exposes poll URLs, then behaves as before ----
    falPolls = 0;
    let queuedJob = null;
    r = await media.runFalJob('fal-ai/flux', '{"prompt":"kedi"}', 'Key K',
        { baseUrl: base, pollMs: 5, onQueued: j => { queuedJob = j; } });
    check('runFalJob still ok after extraction', r.ok && r.assetUrls.length === 1);
    check('onQueued carries poll urls', !!queuedJob && /\/queue\/rq1\/status$/.test(queuedJob.statusUrl));

    // ---- 3. load-time reattach: task with persisted mediaJob completes + chain advances ----
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-f2-'));
    const storage = path.join(tmp, 'farm-tasks.json');
    const outputs = path.join(tmp, 'task-outputs'); fs.mkdirSync(outputs, { recursive: true });
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'kurgucu', dir: agentDir };
    const outFile = path.join(outputs, 'm1.md');
    fs.writeFileSync(outFile, '# render\n\n---\nsubmitted\n', 'utf8');
    falPolls = 0;
    fs.writeFileSync(storage, JSON.stringify({
        tasks: [{
            id: 'm1', agentId: '', agentName: 'media', title: 'Klip 1/2: render',
            prompt: 'fal-ai/flux', mode: 'headless', status: 'running',
            createdAt: 1, startedAt: 2, outputFile: outFile,
            workflowId: 'wf', workflowRunId: 'run9', stepIndex: 0,
            mediaJob: {
                provider: 'fal',
                statusUrl: base + '/queue/rq1/status',
                responseUrl: base + '/queue/rq1',
                deadline: Date.now() + 5 * 60_000,
                input: '{"prompt":"kedi"}'
            }
        }],
        schedules: [], templates: [], triggers: [],
        workflows: [{
            id: 'wf', title: 'Klip', steps: [
                { agentId: 'a1', agentName: 'kurgucu', title: 'render', prompt: 'x', mode: 'headless', media: { model: 'fal-ai/flux', input: '{"prompt":"kedi"}' } },
                { agentId: 'a1', agentName: 'kurgucu', title: 'kurgula', prompt: 'sonuç: {prev_text}', mode: 'headless' }
            ]
        }]
    }), 'utf8');

    const mgr = new TaskManager(storage, () => [agent], () => false, () => '', {
        quotaCheck: () => 'hold',                    // next step defers, no real spawn
        mediaAuth: () => 'Key TESTKEY',
        mediaPollMs: () => 5
    });
    const m1 = mgr.tasks.find(t => t.id === 'm1');
    check('reattach: task stays running at load (not cancelled)', m1.status === 'running');
    check('reattach announced', infoMsgs.some(m => /reattached to 1 in-flight media job/.test(m)));
    check('no interrupted-run offer for a reattached job', mgr.interruptedRuns().length === 0);

    await new Promise(resolve => {
        const t = setInterval(() => { if (m1.status !== 'running') { clearInterval(t); resolve(); } }, 20);
    });
    check('reattached job finishes done', m1.status === 'done');
    check('mediaJob cleared after completion', m1.mediaJob === undefined);
    check('asset downloaded next to archive', fs.existsSync(path.join(outputs, 'm1-1.png')));
    const meta = JSON.parse(fs.readFileSync(path.join(outputs, 'm1.media.json'), 'utf8'));
    check('gallery meta written with original input', meta.input === '{"prompt":"kedi"}' && meta.model === 'fal-ai/flux');
    check('archive notes the reattach', /reattached after a window reload/.test(fs.readFileSync(outFile, 'utf8')));
    await new Promise(r2 => setTimeout(r2, 50));
    const next = mgr.tasks.find(t => t.workflowRunId === 'run9' && t.stepIndex === 1);
    check('chain continues into step 2 after reattach', !!next);
    check('step 2 got the media handoff', !!next && /sonuç:/.test(next.prompt));
    mgr.dispose();

    // ---- 3b. B2: reattached PARALLEL branch must not drive the chain ----
    falPolls = 5; // status endpoint answers COMPLETED immediately
    const storageP = path.join(tmp, 'farm-tasks-p.json');
    const outP = path.join(outputs, 'm10.md');
    fs.writeFileSync(outP, '# render\n\n---\nsubmitted\n', 'utf8');
    fs.writeFileSync(storageP, JSON.stringify({
        tasks: [
            {
                id: 'm10', agentId: '', agentName: 'media', title: 'P 1/3: render',
                prompt: 'fal-ai/flux', mode: 'headless', status: 'running',
                createdAt: 1, startedAt: 2, outputFile: outP,
                workflowId: 'wfp', workflowRunId: 'runP', stepIndex: 0,
                mediaJob: {
                    provider: 'fal',
                    statusUrl: base + '/queue/rq1/status',
                    responseUrl: base + '/queue/rq1',
                    deadline: Date.now() + 5 * 60_000,
                    input: '{"prompt":"p"}'
                }
            },
            {
                id: 'a11', agentId: 'a1', agentName: 'kurgucu', title: 'P 2/3: anlat',
                prompt: 'x', mode: 'headless', status: 'running',
                createdAt: 3, startedAt: 4,
                workflowId: 'wfp', workflowRunId: 'runP', stepIndex: 1
            }
        ],
        schedules: [], templates: [], triggers: [],
        workflows: [{
            id: 'wfp', title: 'P', steps: [
                { agentId: 'a1', agentName: 'kurgucu', title: 'render', prompt: 'x', mode: 'headless', parallel: true, media: { model: 'fal-ai/flux', input: '{"prompt":"p"}' } },
                { agentId: 'a1', agentName: 'kurgucu', title: 'anlat', prompt: 'y', mode: 'headless', parallel: true },
                { agentId: 'a1', agentName: 'kurgucu', title: 'birleştir', prompt: 'z {prev_text}', mode: 'headless' }
            ]
        }]
    }), 'utf8');
    const mgrP = new TaskManager(storageP, () => [agent], () => false, () => '', {
        quotaCheck: () => 'hold',
        mediaAuth: () => 'Key TESTKEY',
        mediaBaseUrl: () => base,
        mediaPollMs: () => 5
    });
    const m10 = mgrP.tasks.find(t => t.id === 'm10');
    check('B2: sibling branch cancelled at load', mgrP.tasks.find(t => t.id === 'a11').status === 'cancelled');
    check('B2: startup resume offer deferred while branch reattaches', mgrP.interruptedRuns().length === 0);
    await new Promise(resolve => {
        const t = setInterval(() => { if (m10.status !== 'running') { clearInterval(t); resolve(); } }, 20);
    });
    await new Promise(r2 => setTimeout(r2, 80));
    check('B2: branch completes done', m10.status === 'done');
    check('B2: chain NOT advanced past the group', !mgrP.tasks.some(t => t.workflowRunId === 'runP' && t.stepIndex === 2));
    check('B2: no re-fan happened on completion', mgrP.tasks.filter(t => t.workflowRunId === 'runP').length === 2);
    check('B2: pause explained', warnMsgs.some(m => /fan-in state was lost/.test(m)));
    const offered = mgrP.interruptedRuns();
    check('B2: run offered after branch completion, from group start', offered.length === 1 && offered[0].stepIndex === 0);
    falPolls = 5;
    mgrP.resumeInterrupted('runP');
    await new Promise(r2 => setTimeout(r2, 300));
    const refanned = mgrP.tasks.filter(t => t.workflowRunId === 'runP' && t.id !== 'm10' && t.id !== 'a11');
    check('B2: resume re-fans both group branches', refanned.some(t => t.stepIndex === 0) && refanned.some(t => t.stepIndex === 1));
    mgrP.dispose();

    // ---- 4. expired deadline → normal F1 path (cancelled + resume offer) ----
    const storage2 = path.join(tmp, 'farm-tasks2.json');
    const st = JSON.parse(fs.readFileSync(storage, 'utf8'));
    st.tasks = [{
        ...st.tasks.find(t => t.id === 'm1'),
        id: 'm2', status: 'running', outputFile: undefined,
        mediaJob: { provider: 'fal', statusUrl: base + '/x', responseUrl: base + '/x', deadline: Date.now() - 1000 }
    }];
    fs.writeFileSync(storage2, JSON.stringify(st), 'utf8');
    const mgr2 = new TaskManager(storage2, () => [agent], () => false, () => '', { quotaCheck: () => 'hold' });
    check('expired job → cancelled', mgr2.tasks.find(t => t.id === 'm2').status === 'cancelled');
    check('expired job → resume offered', mgr2.interruptedRuns().length === 1);
    mgr2.dispose();

    server.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    Module._load = origLoad;
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
