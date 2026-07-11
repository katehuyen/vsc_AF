// Ad-hoc tests for Dalga 3a — workflow approval step (2.19.0).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = require('path').resolve(__dirname, '..');

// ---- fake vscode ----
const infoMsgs = [], warnMsgs = [];
class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter,
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

const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const needs = require(path.join(ROOT, 'out/core/needs.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };
const wait = () => new Promise(r => setImmediate(r));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-appr-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
const agents = () => [agent];

// ---- 1. needs.ts labeling: browser vs approval ----
const q = new needs.ApprovalQueue();
q.add({ title: 'Scrape', url: 'https://x.com', goal: 'grab' });          // browser (default kind)
q.add({ title: 'Yayın onayı', goal: 'çıktıyı gözden geçir', kind: 'approval' });
const items = needs.buildNeedsQueue({ liveSessions: [], approvals: q.list(), insights: [], deferredTasks: [] });
const browserItem = items.find(i => /Browser step/.test(i.title));
const approvalItem = items.find(i => /Approval needed/.test(i.title));
check('needs: browser approval labelled as browser step', browserItem && browserItem.agentName === 'browser');
check('needs: workflow approval labelled distinctly', approvalItem && approvalItem.agentName === 'workflow' && /Yayın onayı/.test(approvalItem.title));
check('needs: approval action is Approve (not Run)', approvalItem && approvalItem.actions[0].label === 'Approve');
check('needs: both still block (browser-approval kind)', needs.blockingCount(items) >= 2);

async function run() {
    // ---- 2. approve → chain advances (approval as step 0) ----
    let verdict = true;
    const mgr = new TaskManager(path.join(tmp, 'f1.json'), agents, () => false, () => '', {
        quotaCheck: () => 'hold',
        confirmApproval: () => Promise.resolve(verdict)
    });
    const w = mgr.addWorkflow('W', [
        { agentId: '', agentName: 'approval', title: 'Onay', prompt: '', mode: 'headless', approval: { message: 'bak: {prev_text}' } },
        { agentId: 'a1', agentName: 'yazar', title: 'Devam', prompt: 'use {prev_text}', mode: 'headless' }
    ]);
    mgr.runWorkflow(w);
    await wait(); await wait();
    const apprTask = mgr.tasks.find(t => t.stepIndex === 0 && t.workflowId === w.id);
    check('approve: approval task recorded done', apprTask && apprTask.status === 'done');
    check('approve: next step queued after approval', mgr.tasks.some(t => t.stepIndex === 1 && t.workflowId === w.id && t.status === 'queued'));

    // ---- 3. reject → onFail stop halts the chain ----
    verdict = false;
    const w2 = mgr.addWorkflow('W2', [
        { agentId: '', agentName: 'approval', title: 'Onay', prompt: '', mode: 'headless', approval: {} },
        { agentId: 'a1', agentName: 'yazar', title: 'Devam', prompt: 'x', mode: 'headless' }
    ]);
    mgr.runWorkflow(w2);
    await wait(); await wait();
    const apprTask2 = mgr.tasks.find(t => t.stepIndex === 0 && t.workflowId === w2.id);
    check('reject: approval task recorded failed', apprTask2 && apprTask2.status === 'failed');
    check('reject: onFail=stop means no next step', !mgr.tasks.some(t => t.stepIndex === 1 && t.workflowId === w2.id));

    // ---- 4. reject with onFail=continue advances anyway ----
    const w3 = mgr.addWorkflow('W3', [
        { agentId: '', agentName: 'approval', title: 'Onay', prompt: '', mode: 'headless', approval: {}, onFail: 'continue' },
        { agentId: 'a1', agentName: 'yazar', title: 'Devam', prompt: 'x', mode: 'headless' }
    ]);
    mgr.runWorkflow(w3);
    await wait(); await wait();
    check('reject+continue: next step still queued', mgr.tasks.some(t => t.stepIndex === 1 && t.workflowId === w3.id && t.status === 'queued'));

    // ---- 5. upstream handoff passes through on approve (carry-through) ----
    verdict = true;
    const w4 = mgr.addWorkflow('W4', [
        { agentId: '', agentName: 'approval', title: 'Onay', prompt: '', mode: 'headless', approval: { message: 'm' } },
        { agentId: 'a1', agentName: 'yazar', title: 'Devam', prompt: 'ilet: {prev_text}', mode: 'headless' }
    ]);
    await mgr.runApprovalStep(w4, 0, { text: 'CARRY-ME' }, 'run4');
    await wait();
    const carried = mgr.tasks.find(t => t.workflowRunId === 'run4' && t.stepIndex === 1);
    check('carry: approval passes upstream handoff (not the APPROVED note) to next step',
        carried && /CARRY-ME/.test(carried.prompt) && !/APPROVED/.test(carried.prompt));

    // ---- 6. no gate wired = auto-approve ----
    const mgr2 = new TaskManager(path.join(tmp, 'f2.json'), agents, () => false, () => '', { quotaCheck: () => 'hold' });
    const w5 = mgr2.addWorkflow('W5', [
        { agentId: '', agentName: 'approval', title: 'Onay', prompt: '', mode: 'headless', approval: {} },
        { agentId: 'a1', agentName: 'yazar', title: 'Devam', prompt: 'x', mode: 'headless' }
    ]);
    mgr2.runWorkflow(w5);
    await wait(); await wait();
    check('no-gate: auto-approves and advances', mgr2.tasks.some(t => t.stepIndex === 1 && t.status === 'queued'));

    mgr.dispose(); mgr2.dispose();
    Module._load = origLoad;
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}
run();
