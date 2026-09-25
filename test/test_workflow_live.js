// M-46 — a person's hand on a running workflow: words (steer · veto · constraint)
// that open the next supervisor brief, live settings from the next boundary on,
// a decision by hand, and the supervisor's question on the window, Needs You and the phone.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const infos = [];
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: {
        showInformationMessage: (m) => { infos.push(m); return Promise.resolve(); }, showWarningMessage: () => Promise.resolve(),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const L = require(path.join(ROOT, 'out/core/workflowLive.js'));
const A = require(path.join(ROOT, 'out/core/workflowAsk.js'));
const K = require(path.join(ROOT, 'out/core/workflowWake.js'));
const M = require(path.join(ROOT, 'out/core/messaging.js'));
const N = require(path.join(ROOT, 'out/core/needs.js'));
const { resolveFlex } = require(path.join(ROOT, 'out/core/flexResolve.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const J = o => JSON.stringify(o);

/* ---------- words ---------- */
ok('a word of an unknown kind is refused', /not steer, veto or constraint/.test(L.wordFromArg('nudge', 'x', 'bridge', 1).error));
ok('an empty word is refused', /empty/.test(L.wordFromArg('steer', '  ', 'bridge', 1).error));
eq('a word is kept as said', L.wordFromArg('VETO', ' mavi olmasın ', 'telegram', 5), { kind: 'veto', text: 'mavi olmasın', at: 5, by: 'telegram' });
ok('the brief opens with it as the highest rule, saying where it came from',
    /^THE USER'S WORD \(veto — not this — decide something else; from the phone\), the highest rule of this decision: mavi olmasın$/.test(L.wordsForBrief([L.wordFromArg('veto', 'mavi olmasın', 'telegram', 5)])[0]));
const landed = L.landWords({ words: [{ kind: 'steer', text: 'a', at: 1, by: 'bridge' }, { kind: 'steer', text: 'b', at: 2, by: 'bridge', landed: 'step 1 (checkpoint)' }] }, 'step 3 (woken)');
eq('landing marks only the waiting ones', landed.words.map(w => w.landed), ['step 3 (woken)', 'step 1 (checkpoint)']);
eq('the phone: /steer 2 text names the second run', L.phoneWord('2 daha kısa'), { index: 2, text: 'daha kısa' });
eq('…and /steer text the only one', L.phoneWord('daha kısa'), { text: 'daha kısa' });
eq('the phone command', M.parseCommand('/steer 2 daha kısa yaz'), { kind: 'word', word: 'steer', arg: '2 daha kısa yaz' });
eq('…/veto and /constraint too', [M.parseCommand('/veto x').word, M.parseCommand('/constraint y').word], ['veto', 'constraint']);

/* ---------- live settings ---------- */
ok('nothing to change is refused', /nothing to change/.test(L.livePatch({}).error));
ok('an unknown wake is refused', /neither/.test(L.livePatch({ wake: 'clever' }).error));
ok('a budget out of range is refused', /budgetUSD must be/.test(L.livePatch({ budgetUSD: -1 }).error));
ok('pause must be a boolean', /pause is true or false/.test(L.livePatch({ pause: 'yes' }).error));
eq('a patch: wake preset, model, calls', L.livePatch({ wake: 'smart', model: 'claude-sonnet-5', maxCalls: 3 }).patch,
    { wake: K.wakePresetConditions('smart'), supervisor: { model: 'claude-sonnet-5', maxCalls: 3 } });
eq('a blank model drops back to the workflow one', L.applyLive({ supervisor: { model: 'x', maxCalls: 2 } }, { supervisor: { model: '' } }).supervisor, { maxCalls: 2 });
ok('every live line says it is live', L.liveLines({ wake: [], supervisor: { model: 'm' }, callMe: true, pause: true }).every(l => /live \(while running\)/.test(l)));
eq('flex.set level=live maps a point onto workflows.live', [L.liveArgOfPoint('workflow.supervisor.budgetUsd', 2), /cannot be set live/.test(L.liveArgOfPoint('judge.args', 'x').error)], [{ budgetUSD: 2 }, true]);
ok('‼️ KABUL — a live value names its origin "changed live"', /changed live/.test(resolveFlex('workflow.wake', { workflow: [], live: K.wakePresetConditions('smart') }).sentence)
    && resolveFlex('workflow.supervisor.model', { workflow: 'a', live: 'b' }).from === 'live');
eq('a decision by hand: ask_user is not one', [L.decisionFromArg({ decision: 'ask_user' }).error !== undefined, L.decisionFromArg('stop').decision.confidence], [true, 1]);

/* ---------- the question on three doors ---------- */
const q = A.newQuestion('wq1', 'r1', 'Klip', 'Hangisi?', ['kısa', 'uzun', ''], 7);
eq('empty options are dropped', q.options, ['kısa', 'uzun']);
eq('the phone gets one button per option', A.askKeyboard(q), [[{ text: 'kısa', data: 'w:wq1:0' }], [{ text: 'uzun', data: 'w:wq1:1' }]]);
eq('…and its tap is read back', A.parseAskTap('w:wq1:1'), { id: 'wq1', option: 1 });
ok('a tap of another kind is not ours', A.parseAskTap('q:x:y:0:1') === undefined);
eq('Needs You: one button per option', A.askActions(q).map(a => a.id), ['wq-0', 'wq-1']);
eq('…or a typed answer when there are none', A.askActions({ ...q, options: [] }).map(a => a.id), ['wq-text']);
eq('the button names its option', [A.actionOption('wq-1'), A.actionOption('wq-text'), A.actionOption('approve')], [1, 'text', undefined]);
const needs = N.buildNeedsQueue({ liveSessions: [], approvals: [], insights: [], interruptedRuns: [], workflowQuestions: [q] });
const row = needs.find(i => i.kind === 'question');
ok('‼️ the question is a Needs You row with its options as buttons', row && /Workflow "Klip" — its supervisor asks/.test(row.title) && row.actions.length === 2 && row.ref.questionId === 'wq1');
ok('…it blocks, and it cannot be cleared away', N.blockingCount(needs) >= 1 && !N.isClearable(row));

/* ---------- the bridge and the surfaces ---------- */
{
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    const block = op => { const i = ext.indexOf(`op: '${op}'`); return i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i)); };
    ok('workflows.steer calls the manager', /taskManager\.steerRun\(/.test(block('workflows.steer')));
    ok('workflows.live calls the manager, and lists with no runId', /taskManager\.setRunLive\(/.test(block('workflows.live')) && /liveRuns\(\)/.test(block('workflows.live')));
    ok('workflows.decide calls the manager', /taskManager\.decideRun\(/.test(block('workflows.decide')));
    ok('the palette command is registered on the same door', /registerCommand\('agentfarm\.workflowLive'[\s\S]{0,200}taskManager\.steerRun\([\s\S]{0,160}taskManager\.setRunLive\(/.test(ext));
    ok('the phone word goes through steerRun with by=telegram', /steerRun\(run\.runId, cmd\.word, pw\.text, 'telegram'\)/.test(ext));
    ok('askChoice is the three doors now', /askChoice: \(question, options, ctx\) => workflowAsks\.ask\(/.test(ext));
    ok('flex.set level=live reaches setRunLive', /setLive: \(runId: string, point: string, value: unknown\)/.test(ext));
}

(async () => {
    /* ---------- the engine ---------- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-live-'));
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'yazar', dir: agentDir };
    const answers = [], prompts = [], confirms = [];
    let confirmAnswer = true;
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [agent], () => false, () => '', {
        quotaCheck: () => 'hold', superviseTurn: async (p) => { prompts.push(p); return { out: answers.shift() || '' }; },
        confirmApproval: async (o) => { confirms.push(o.title); return confirmAnswer; }
    });
    let n = 0;
    const complete = (task, body) => {
        const f = path.join(tmp, `out${n++}.md`);
        fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
        task.outputFile = f; mgr.completeTask(task);
    };
    const tick = async () => { for (let i = 0; i < 20; i++) { await new Promise(r => setImmediate(r)); } };
    const queued = (wId) => mgr.tasks.filter(t => t.workflowId === wId && t.status === 'queued');
    const st = (id, extra) => ({ id, agentId: 'a1', agentName: 'yazar', title: id, prompt: 'p-' + id + ' {prev_text}', mode: 'headless', ...(extra || {}) });
    const chain = (title, steps) => mgr.addWorkflow(title, steps || [st('s1'), st('s2'), st('s3')]);

    // KABUL: a word from the phone lands in the next decision's brief, and the row says where
    let w = chain('Telefon');
    let run = mgr.runWorkflow(w);
    ok('a mechanical run is listed as live', mgr.liveRuns().some(r => r.runId === run && r.where === 'step 1'));
    let r = mgr.steerRun(run, 'steer', 'daha kısa tut', 'telegram');
    ok('the answer says where it will be read', /read at the end of step 1/.test(r.note));
    answers.push(J({ decision: 'proceed', confidence: 0.9 }));
    complete(queued(w.id)[0], 'metin');
    await tick();
    ok('‼️ KABUL — a word from the phone opens the next decision\'s brief', /THE USER'S WORD \(steer — do it this way; from the phone\), the highest rule of this decision: daha kısa tut/.test(prompts[0] || ''));
    const wrow = mgr.tasks.find(t => t.workflowRunId === run && t.wokeBy);
    ok('…a mechanical run was woken by it, and the row names it', wrow && wrow.wokeBy[0] === 'your-word');
    ok('…and its output says the word landed here', /Your word\(s\) landed here: steer: daha kısa tut/.test(fs.readFileSync(wrow.outputFile, 'utf8')));
    eq('proceed carries on', queued(w.id).map(t => t.stepIndex), [1]);
    complete(queued(w.id)[0], 'b');
    await tick();
    eq('a landed word does not wake it again', [prompts.length, queued(w.id).map(t => t.stepIndex)], [1, [2]]);

    // live wake + live model: from the next boundary, origin live
    w = chain('Canlı');
    run = mgr.runWorkflow(w);
    r = mgr.setRunLive(run, { wake: 'smart', model: 'claude-sonnet-5' });
    ok('the live answer lists what was set, each one live', /wake: 1 condition\(s\) — live/.test(r.note) && /supervisor model: claude-sonnet-5 — live/.test(r.note));
    answers.push(J({ decision: 'proceed', confidence: 0.9 }));
    complete(queued(w.id)[0], 'a');
    await tick();
    const lrow = mgr.tasks.find(t => t.workflowRunId === run && t.wokeBy);
    const lout = fs.readFileSync(lrow.outputFile, 'utf8');
    ok('‼️ the live wake woke it, and says it was changed live', lrow.wokeBy[0] === 'every-step' && /smart — changed live/.test(lout));
    ok('…and the live model is on the supervisor line as live', /model claude-sonnet-5 — changed live/.test(lout));

    // callMe: the next decision is put to the person; declining it = the mechanical way
    confirmAnswer = false;
    mgr.setRunLive(run, { callMe: true });
    answers.push(J({ decision: 'stop', why: 'yeter', confidence: 0.95 }));
    complete(queued(w.id)[0], 'b');
    await tick();
    ok('call me: the decision was put to the person', confirms.some(t => /its supervisor decided: stop/.test(t)));
    eq('…declined, the run goes the mechanical way', queued(w.id).map(t => t.stepIndex), [2]);

    // pause at the next boundary, then resume
    w = chain('Dur');
    run = mgr.runWorkflow(w, { wake: [] });
    mgr.setRunLive(run, { pause: true });
    complete(queued(w.id)[0], 'a');
    await tick();
    eq('‼️ paused: the step finished, nothing is queued, the run is held', [queued(w.id).length, mgr.liveRuns().find(x => x.runId === run).paused], [0, true]);
    r = mgr.setRunLive(run, { pause: false });
    await tick();
    ok('resume carries on with the finished step\'s handoff', /resumed/.test(r.note) && J(queued(w.id).map(t => [t.stepIndex, t.prompt])) === J([[1, 'p-s2 a']]));

    // a checkpoint added live, after the running step, on the run's own copy
    r = mgr.setRunLive(run, { addCheckpoint: 'uzun mu?' });
    ok('the checkpoint is placed after the running step', /a checkpoint runs after step 2/.test(r.note));
    answers.push(J({ decision: 'proceed', confidence: 0.9 }));
    complete(queued(w.id)[0], 'b');
    await tick();
    ok('‼️ it ran there and the supervisor read its message', prompts.some(p => /uzun mu\?/.test(p)));
    eq('…the stored workflow never changed', mgr.workflows.find(x => x.id === w.id).steps.length, 3);

    // a decision by hand: applied at the boundary without asking the supervisor
    w = chain('Elle');
    run = mgr.runWorkflow(w);
    const before = prompts.length;
    r = mgr.decideRun(run, { decision: 'stop', why: 'yanlış konu' });
    ok('the answer says it replaces the supervisor', /instead of asking the supervisor/.test(r.note));
    complete(queued(w.id)[0], 'a');
    await tick();
    const ended = mgr.workflowRunState(run);
    ok('‼️ your stop ends the run without a supervisor call', ended.status === 'stopped' && /yanlış konu/.test(ended.reason || '') && prompts.length === before);
    ok('a run that ended takes no more words', /not running/.test(mgr.steerRun(run, 'steer', 'x', 'bridge').error));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
