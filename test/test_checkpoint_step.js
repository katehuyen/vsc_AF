// M-43 — the checkpoint step: its limits (flex points), the supervisor turn settled once
// (escalate · ask · question), the route, the run's own copy of the chain, and the engine.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const warnings = [];
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: {
        showInformationMessage: () => Promise.resolve(), showWarningMessage: (m) => { warnings.push(m); return Promise.resolve(); },
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const K = require(path.join(ROOT, 'out/core/checkpointStep.js'));
const W = require(path.join(ROOT, 'out/core/workflowInputs.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const J = o => JSON.stringify(o);

/* ---------- limits: every one a flex point, a blank box is the built-in ---------- */
const dl = K.checkpointLimits({});
eq('built-in limits', [dl.allowed.length, dl.maxInsert, dl.insertKinds, dl.maxRetriesPerStep, dl.minConfidence, dl.lowConfidence], [6, 2, ['agent', 'approval'], 2, 0.6, 'ask']);
ok('…and each says where it came from', /built-in/.test(dl.origin));
const sl = K.checkpointLimits({ allowed: 'proceed, stop', maxInsert: 1, maxRetries: 0, minConfidence: 0.8, lowConfidence: 'escalate', insertKinds: '' });
eq('the step overrides', [sl.allowed, sl.maxInsert, sl.maxRetriesPerStep, sl.minConfidence, sl.lowConfidence, sl.insertKinds], [['proceed', 'stop'], 1, 0, 0.8, 'escalate', ['agent', 'approval']]);

/* ---------- refused at save time, in words ---------- */
const refuse = cp => K.checkpointRefusal({ checkpoint: cp });
ok('an unknown decision', /"skip" is not a decision/.test(refuse({ allowed: 'proceed,skip' })));
ok('an insert kind it cannot make', /cannot insert a "media"/.test(refuse({ insertKinds: 'media' })));
ok('an unknown low-confidence behaviour', /not "guess"/.test(refuse({ lowConfidence: 'guess' })));
ok('a ceiling outside its range', /maxInsert 9 is refused/.test(refuse({ maxInsert: 9 })));
ok('a checkpoint in parallel', /cannot run in parallel/.test(K.checkpointRefusal({ checkpoint: {}, parallel: true })));
eq('a sound one', refuse({ allowed: 'proceed,retry', maxRetries: 3 }), '');
ok('the workflow save path refuses it too', /step 2: .*not a decision/.test(W.checkWorkflowInputs([], [{ id: 's1' }, { id: 's2', checkpoint: { allowed: 'x' } }]).error));

/* ---------- the route ---------- */
const ids = ['s1', 's2', 's3'];
eq('proceed = next', K.routeOf({ decision: 'proceed' }, ids, 1, 's1'), { go: 'next' });
eq('no decision (mechanical) = next', K.routeOf(undefined, ids, 1, 's1'), { go: 'next' });
eq('retry with no target = the step before the checkpoint', K.routeOf({ decision: 'retry' }, ids, 1, 's1'), { go: 'step', index: 0 });
eq('jump carries its patch', K.routeOf({ decision: 'jump', target: 's3', patch: { model: 'haiku' } }, ids, 1, 's1'), { go: 'step', index: 2, patch: { model: 'haiku' } });
eq('insert', K.routeOf({ decision: 'insert', insert: [{ kind: 'agent', title: 't' }] }, ids, 1, 's1').go, 'insert');
eq('stop says why', K.routeOf({ decision: 'stop', why: 'yeterli' }, ids, 1, 's1'), { go: 'stop', why: 'yeterli' });

/* ---------- the run's own copy of the chain ---------- */
const st = (id, extra) => ({ id, agentId: 'a1', agentName: 'yazar', title: id, prompt: 'p-' + id, mode: 'headless', ...(extra || {}) });
const wf = { id: 'w', title: 'W', steps: [st('s1'), st('s2', { checkpoint: {} }), st('s3', { media: { model: 'm', input: '{}' } })] };
const ins = K.stepsFromInsert([{ kind: 'agent', title: 'özetle', prompt: 'kısalt' }, { kind: 'approval', title: 'bak', prompt: 'onayla?' }], K.anchorAgent(wf.steps, 1), 's2', ['s1', 's2', 's3']);
eq('inserted steps get fresh ids and their kind', ins.map(s => [s.id, s.agentName, !!s.approval]), [['s2x1', 'yazar', false], ['s2x2', 'approval', true]]);
const edits = { patches: { s1: { prompt: 'daha kısa' }, s3: { input: '{"a":1}', model: 'flux' } }, inserts: [{ after: 's2', steps: ins }] };
const view = K.applyRunEdits(wf, edits);
eq('‼️ the view: inserted after the checkpoint, the rest shifted', view.steps.map(s => s.id), ['s1', 's2', 's2x1', 's2x2', 's3']);
eq('…a patch reaches prompt, a media input and the model', [view.steps[0].prompt, view.steps[4].media.input, view.steps[4].model], ['daha kısa', '{"a":1}', 'flux']);
eq('‼️ the stored workflow is untouched, so the view derives the same twice', [wf.steps.length, wf.steps[0].prompt, K.applyRunEdits(wf, edits).steps.length], [3, 'p-s1', 5]);
ok('no edits = the same object', K.applyRunEdits(wf, undefined) === wf);
ok('an agent insert with no agent on the chain is refused', /no agent/.test(K.stepsFromInsert([{ kind: 'agent', title: 'x' }], undefined, 's2', []).error));
eq('the anchor agent skips gates', K.anchorAgent([st('s1'), { ...st('s2'), agentId: '', approval: {} }, st('s3', { checkpoint: {} })], 2), { agentId: 'a1', agentName: 'yazar' });
const board = { steps: { s1: { id: 's1', index: 0, title: 'x', status: 'done', text: 'ilk', at: 1 } } };
eq('going back hands a step what its predecessor left', [K.handoffFromBoard(board, wf.steps, 1), K.handoffFromBoard(board, wf.steps, 0)], [{ text: 'ilk' }, {}]);
eq('escalation ladder', [K.escalateModel('haiku'), K.escalateModel(undefined, '--model claude-sonnet-4-6'), K.escalateModel('opus')], ['sonnet', 'opus', undefined]);

/* ---------- the card and the goal ---------- */
eq('a blank card is an empty spec', K.checkpointFromDraft(k => String({ cpMsg: '', cpConf: '' }[k] ?? '')), {});
const seed = K.checkpointSeed({ message: 'bak', maxRetries: 3, lowConfidence: 'mechanical' });
eq('card round trip', K.checkpointFromDraft(k => String(seed[k] ?? '')), { message: 'bak', maxRetries: 3, lowConfidence: 'mechanical' });
const g = {}; K.setWorkflowGoal(g, ' 34 sn klip ', 'dikey\n\n altyazılı ');
eq('goal and criteria (one per line)', g, { goal: '34 sn klip', criteria: ['dikey', 'altyazılı'] });
K.setWorkflowGoal(g, '', []); eq('…empty removes them', g, {});

/* ---------- the supervisor turn, settled once ---------- */
const lim = K.checkpointLimits({});
const brief = { workflow: 'W', goal: 'kısa klip', criteria: ['35 sn altı'], costUSD: 0.2, stepIds: ids, limits: lim };
const ctx = { stepIds: ids, currentStep: 's1', retries: {}, history: [] };
const host = (answers, extra) => {
    const seen = [];
    return Object.assign({ seen, ask: async (p, tier) => { seen.push({ p, tier }); const a = answers.shift(); return typeof a === 'string' ? { out: a, model: 'haiku' } : a; } }, extra || {});
};
(async () => {
    let h = host([J({ decision: 'proceed', confidence: 0.9, why: 'iyi' })]);
    let o = await K.superviseCheckpoint(brief, ctx, h);
    ok('proceed is taken', o.decision && o.decision.decision === 'proceed' && !o.mechanical);
    ok('‼️ the brief carries the goal and criteria, never a transcript', /kısa klip/.test(h.seen[0].p) && /35 sn altı/.test(h.seen[0].p));
    o = await K.superviseCheckpoint(brief, ctx, host(['bence devam']));
    ok('‼️ broken JSON goes the mechanical way', !o.decision && /no JSON object/.test(o.mechanical));
    o = await K.superviseCheckpoint(brief, ctx, host([{ out: '', error: 'timeout' }]));
    ok('a supervisor that could not run goes mechanical', /could not answer \(timeout\)/.test(o.mechanical));
    h = host([J({ decision: 'stop' })]);
    o = await K.superviseCheckpoint({ ...brief, limits: K.checkpointLimits({ allowed: 'proceed' }) }, ctx, h);
    ok('a decision the checkpoint does not allow is refused', /not a decision this workflow allows/.test(o.mechanical));
    ok('…and the contract names only what is allowed', !/"stop" —/.test(h.seen[0].p) && /"proceed" —/.test(h.seen[0].p));
    const unsure = J({ decision: 'jump', target: 's3', confidence: 0.3 });
    o = await K.superviseCheckpoint(brief, ctx, host([unsure], { confirm: async () => true }));
    ok('low confidence → ask → yes applies it', o.decision && o.decision.target === 's3');
    o = await K.superviseCheckpoint(brief, ctx, host([unsure], { confirm: async () => false }));
    ok('…no goes mechanical', /the person said no/.test(o.mechanical));
    o = await K.superviseCheckpoint(brief, ctx, host([unsure]));
    ok('…nobody to ask goes mechanical', /nobody can be asked/.test(o.mechanical));
    const esc = { ...brief, limits: K.checkpointLimits({ lowConfidence: 'escalate' }) };
    h = host([unsure, J({ decision: 'stop', confidence: 0.9 })]);
    o = await K.superviseCheckpoint(esc, ctx, h);
    ok('escalate asks once more, on the stronger tier', o.decision && o.decision.decision === 'stop' && h.seen[1].tier === 1);
    o = await K.superviseCheckpoint(esc, ctx, host([unsure, unsure]));
    ok('…and never twice', /even escalated/.test(o.mechanical));
    h = host([J({ decision: 'ask_user', question: 'Hangi ton?', options: ['ciddi', 'eğlenceli'] }), J({ decision: 'proceed', confidence: 0.9 })], { pick: async () => 'eğlenceli' });
    o = await K.superviseCheckpoint(brief, ctx, h);
    ok('‼️ its question is answered and it decides again with the answer', o.decision.decision === 'proceed' && /the answer: eğlenceli/.test(h.seen[1].p));
    ok('…where it may not ask a second time', !/"ask_user" —/.test(h.seen[1].p) && /"ask_user" —/.test(h.seen[0].p));
    eq('…and the answer is kept as a directive', o.directives, ['You asked "Hangi ton?" — the answer: eğlenceli']);
    o = await K.superviseCheckpoint(brief, ctx, host([J({ decision: 'ask_user', question: 'X?' })], { pick: async () => undefined }));
    ok('an unanswered question goes mechanical', /did not answer/.test(o.mechanical));

    /* ---------- the engine: retry with a patch, insert, stop, a broken answer ---------- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-checkpoint-'));
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'yazar', dir: agentDir };
    const answers = [], prompts = [];
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [agent], () => false, () => '', {
        quotaCheck: () => 'hold', superviseTurn: async (p) => { prompts.push(p); return { out: answers.shift() || '' }; }
    });
    let n = 0;
    const complete = (task, body) => {
        const f = path.join(tmp, `out${n++}.md`);
        fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
        task.outputFile = f; mgr.completeTask(task);
    };
    const tick = async () => { for (let i = 0; i < 20; i++) { await new Promise(r => setImmediate(r)); } };
    const queued = (wId) => mgr.tasks.filter(t => t.workflowId === wId && t.status === 'queued');
    const chain = (title) => {
        const w = mgr.addWorkflow(title, [st('s1', { prompt: 'yaz' }), { ...st('s2'), agentId: '', agentName: 'checkpoint', checkpoint: { message: 'kısa mı?' } }, st('s3', { prompt: 'yayınla: {prev_text}' })]);
        K.setWorkflowGoal(w, 'kısa metin', ['tek satır']);
        return w;
    };
    let w = chain('Geri');
    let run = mgr.runWorkflow(w);
    answers.push(J({ decision: 'retry', patch: { prompt: 'daha kısa yaz' }, confidence: 0.9, why: 'uzun' }));
    complete(queued(w.id)[0], 'çok uzun bir metin');
    await tick();
    let q = queued(w.id);
    eq('‼️ retry sends the run back to the step before, with the patch', q.map(t => [t.stepIndex, t.prompt]), [[0, 'daha kısa yaz']]);
    ok('the supervisor was shown the goal, its own brief and the step so far', /kısa metin/.test(prompts[0]) && /kısa mı\?/.test(prompts[0]) && /çok uzun/.test(prompts[0]));
    answers.push(J({ decision: 'proceed', confidence: 0.9 }));
    complete(q[0], 'kısa');
    await tick();
    q = queued(w.id);
    eq('proceed carries on, the handoff passing through the checkpoint', q.map(t => [t.stepIndex, t.prompt]), [[2, 'yayınla: kısa']]);
    const rs = mgr.workflowRunState(run);
    eq('the decisions are on the board and in the run record', rs.board.steps.s2.json.decision, 'proceed');

    w = chain('Ekle');
    run = mgr.runWorkflow(w);
    answers.push(J({ decision: 'insert', insert: [{ kind: 'agent', title: 'özetle', prompt: 'özet: {prev_text}' }], confidence: 0.9 }));
    complete(queued(w.id)[0], 'metin');
    await tick();
    q = queued(w.id);
    eq('‼️ an inserted step runs next, on the chain\'s agent, in a 4-step chain', q.map(t => [t.stepIndex, t.prompt, t.agentId, /3\/4: özetle/.test(t.title)]), [[2, 'özet: metin', 'a1', true]]);
    complete(q[0], 'özet');
    q = queued(w.id);
    eq('…and the original next step follows it', q.map(t => [t.stepIndex, t.prompt]), [[3, 'yayınla: özet']]);
    eq('the stored workflow never changed', mgr.workflows.find(x => x.id === w.id).steps.length, 3);

    w = chain('Dur');
    run = mgr.runWorkflow(w);
    answers.push(J({ decision: 'stop', why: 'konu yanlış', confidence: 0.95 }));
    complete(queued(w.id)[0], 'metin');
    await tick();
    const ended = mgr.workflowRunState(run);
    ok('‼️ stop ends the run as stopped, saying why', ended.status === 'stopped' && /supervisor stopped the run at step 2: konu yanlış/.test(ended.reason || ''));
    eq('…and nothing is queued', queued(w.id).length, 0);

    w = chain('Bozuk');
    run = mgr.runWorkflow(w);
    answers.push('evet devam edelim');
    complete(queued(w.id)[0], 'metin');
    await tick();
    q = queued(w.id);
    eq('a broken answer carries on', q.map(t => t.stepIndex), [2]);
    const cpTask = mgr.tasks.find(t => t.workflowRunId === run && t.stepIndex === 1);
    ok('…and the checkpoint row says it went mechanical, and why', /mechanical: .*no JSON object/.test(fs.readFileSync(cpTask.outputFile, 'utf8')));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
