// M-45 — waking the supervisor on an event: presets, the flex chain, the refusals,
// the verdict, and the engine (a hybrid run that never fires is the mechanical run).
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
const K = require(path.join(ROOT, 'out/core/workflowWake.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const J = o => JSON.stringify(o);

/* ---------- presets: the label is derived from the set ---------- */
eq('mechanical is the empty set', K.wakePresetConditions('mechanical'), []);
eq('smart wakes every step', K.wakePresetConditions('smart').map(c => c.field), ['always']);
eq('hybrid: a failed check, a failed step, the run past $2', K.wakePresetConditions('hybrid').map(c => c.id), ['judge-fail', 'step-failed', 'over-2usd']);
eq('each preset names itself', ['mechanical', 'smart', 'hybrid'].map(p => K.wakeMode(K.wakePresetConditions(p))), ['mechanical', 'smart', 'hybrid']);
const edited = K.wakePresetConditions('hybrid'); edited[2].value = 5;
eq('an edited set is custom', K.wakeMode(edited), 'custom');
eq('undefined reads as mechanical', K.wakeMode(undefined), 'mechanical');
ok('a typed "2" is the same question as the preset\'s 2', K.wakeMode(K.wakePresetConditions('hybrid').map(c => ({ ...c, value: String(c.value) }))) === 'hybrid');

/* ---------- the door: a preset name, a list, or a refusal by name ---------- */
eq('a preset name', K.wakeFromArg('hybrid').wake.length, 3);
eq('nothing given is nothing', K.wakeFromArg(''), {});
ok('an unknown word is refused', /neither mechanical/.test(K.wakeFromArg('clever').error));
ok('a field nobody measures is refused', /no field "nope"/.test(K.wakeFromArg([{ id: 'x', field: 'nope', operator: 'eq', value: 1 }]).error));
ok('an operator the type does not take is refused', /does not apply to step.status/.test(K.wakeFromArg([{ id: 'x', field: 'step.status', operator: 'gt', value: 1 }]).error));
ok('a missing value is refused', /cost.run is more than what/.test(K.wakeFromArg([{ id: 'x', field: 'cost.run', operator: 'gt' }]).error));
ok('an empty group is refused', /empty group/.test(K.wakeFromArg([{ id: 'g', all: [] }]).error));
eq('a JSON string of a list is read', K.wakeFromArg(J([{ id: 'x', field: 'always', operator: 'isTrue' }])).wake.length, 1);
eq('a group of valid parts passes', K.wakeFromArg([{ id: 'g', all: [{ id: 'a', field: 'step.kind', operator: 'eq', value: 'media' }, { id: 'b', field: 'cost.step', operator: 'gt', value: 1 }] }]).error, undefined);

/* ---------- the flex chain: live > run > step > workflow > built-in ---------- */
const hy = K.wakePresetConditions('hybrid'), sm = K.wakePresetConditions('smart');
eq('nothing set = mechanical, built-in', [K.resolveWake({}).conditions, K.resolveWake({}).from], [[], 'builtin']);
eq('the workflow\'s', K.resolveWake({ workflow: hy }).from, 'workflow');
eq('‼️ a step\'s [] beats the workflow\'s hybrid — mechanical after that step', [K.resolveWake({ workflow: hy, step: [] }).conditions, K.resolveWake({ workflow: hy, step: [] }).from], [[], 'step']);
eq('the run beats the step', K.resolveWake({ workflow: hy, step: [], run: sm }).from, 'run');
ok('the sentence names the mode and where it came from', /^hybrid — /.test(K.resolveWake({ workflow: hy }).sentence));

/* ---------- the verdict ---------- */
const facts = (o) => K.wakeFacts({ kind: 'agent', status: 'done', attempt: 1, runCostUSD: 0, ...o });
eq('a clean step fires nothing', K.wakeVerdict(hy, facts({})).fired, []);
eq('a failed check fires judge-fail', K.wakeVerdict(hy, facts({ verified: 'fail' })).fired, ['judge-fail']);
eq('a failed step fires step-failed', K.wakeVerdict(hy, facts({ status: 'failed' })).fired, ['step-failed']);
eq('the run past $2 fires', K.wakeVerdict(hy, facts({ runCostUSD: 2.5 })).fired, ['over-2usd']);
ok('the verdict says it in words', /judge-fail \(verify.verdict is fail\)/.test(K.wakeVerdict(hy, facts({ verified: 'fail' })).said));
eq('elapsed is measured in seconds', K.wakeVerdict([{ id: 'slow', field: 'elapsed', operator: 'gt', value: 60 }], facts({ startedAt: 0 + 1, endedAt: 1 + 90000 })).fired, ['slow']);

/* ---------- the words "proceed" stands for ---------- */
eq('done → the next step', K.mechanicalWords('done', 0, 3, undefined), 'go on to step 2');
eq('done on the last → the end', K.mechanicalWords('done', 2, 3, undefined), 'end the run, complete');
eq('failed, stop', K.mechanicalWords('failed', 0, 3, undefined), 'stop the run as failed');
eq('failed, continue', K.mechanicalWords('failed', 0, 3, 'continue'), 'go on to step 2');
eq('failed, goto', K.mechanicalWords('failed', 0, 3, 3), 'jump to step 3');
eq('kinds', [K.kindOfStep({}), K.kindOfStep({ media: {} }), K.kindOfStep({ checkpoint: {} })], ['agent', 'media', 'checkpoint']);

/* ---------- the bridge: the ops carry wake through the one door, and the dictionary is the core's ---------- */
{
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    const block = op => { const i = ext.indexOf(`op: '${op}'`); return i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i)); };
    ok('workflows.wakeFields is registered and answers the core\'s dictionary', /handler: \(\) => wakeDictionary\(\)/.test(block('workflows.wakeFields')));
    for (const op of ['workflows.add', 'workflows.update', 'workflows.run']) {
        ok(`${op} reads wake through wakeFromArg and says so in its describe`, /wakeFromArg\(args\.wake\)/.test(block(op)) && /wake\?/.test(block(op)));
    }
    ok('a bridge step reads its own wake through the same door', /wakeFromArg\(raw\.wake\)/.test(ext));
    const d = K.wakeDictionary();
    ok('the dictionary carries fields, operators and the presets with their sets', d.fields.length > 5 && d.operators.length > 5 && d.presets.map(p => p.id).join() === 'mechanical,smart,hybrid' && d.presets[2].conditions.length === 3);
    const page = fs.readFileSync(path.join(ROOT, 'media/tasksPage.js'), 'utf8');
    ok('the page draws all three surfaces from DATA.wakeDict', ['workflowBlock(c, DATA.wakeDict', 'stepRow(s, c.wake, DATA.wakeDict', 'workflowCard(p, wiRun, C, runPromote(p), DATA.wakeDict'].every(x => page.indexOf(x) >= 0));
    ok('base.ts loads afWake.js', /'afWake\.js'/.test(fs.readFileSync(path.join(ROOT, 'src/panels/base.ts'), 'utf8')));
}

(async () => {
    /* ---------- the engine ---------- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wake-'));
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'yazar', dir: agentDir };
    const answers = [], prompts = [];
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [agent], () => false, () => '', {
        quotaCheck: () => 'hold', superviseTurn: async (p) => { prompts.push(p); return { out: answers.shift() || '' }; }
    });
    let n = 0;
    const write = (task, body) => {
        const f = path.join(tmp, `out${n++}.md`);
        fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
        task.outputFile = f;
    };
    const complete = (task, body) => { write(task, body); mgr.completeTask(task); };
    const failIt = (task, body) => { write(task, body); mgr.finish(task, 'failed'); };
    const tick = async () => { for (let i = 0; i < 20; i++) { await new Promise(r => setImmediate(r)); } };
    const queued = (wId) => mgr.tasks.filter(t => t.workflowId === wId && t.status === 'queued');
    const st = (id, extra) => ({ id, agentId: 'a1', agentName: 'yazar', title: id, prompt: 'p-' + id + ' {prev_text}', mode: 'headless', ...(extra || {}) });
    const chain = (title, wake, steps) => {
        const w = mgr.addWorkflow(title, steps || [st('s1'), st('s2'), st('s3')]);
        if (wake) { K.setWorkflowWake(w, wake); }
        return w;
    };
    /** Runs a clean 3-step chain to the end and returns what each step was handed. */
    const walk = async (w, opts) => {
        const run = mgr.runWorkflow(w, opts);
        const seen = [];
        for (let i = 0; i < 3; i++) {
            await tick();
            const q = queued(w.id);
            seen.push(q.map(t => [t.stepIndex, t.prompt]));
            if (q[0]) { complete(q[0], 'çıktı ' + i); }
        }
        await tick();
        return { run, seen, state: mgr.workflowRunState(run) };
    };

    const mech = await walk(chain('Mekanik'));
    const hyb = await walk(chain('Hibrit', K.wakePresetConditions('hybrid')));
    eq('‼️ KABUL — a hybrid run that never fires hands every step exactly what the mechanical run does', hyb.seen, mech.seen);
    eq('…ends the same way', [hyb.state.status, mech.state.status], ['done', 'done']);
    eq('…and asked nobody, and added no row', [prompts.length, mgr.tasks.filter(t => t.wokeBy).length], [0, 0]);

    // smart at the RUN level: woken after step 1, proceed = the mechanical path
    let w = chain('Akıllı');
    let run = mgr.runWorkflow(w, { wake: K.wakePresetConditions('smart') });
    answers.push(J({ decision: 'proceed', confidence: 0.9, why: 'iyi' }));
    complete(queued(w.id)[0], 'ilk metin');
    await tick();
    let q = queued(w.id);
    eq('proceed after a wake goes on to the next step with the step\'s own handoff', q.map(t => [t.stepIndex, t.prompt]), [[1, 'p-s2 ilk metin']]);
    const woke = mgr.tasks.find(t => t.workflowRunId === run && t.wokeBy);
    ok('‼️ the wake row names the condition that fired', woke && /woken by every-step/.test(woke.title) && J(woke.wokeBy) === J(['every-step']));
    const out = fs.readFileSync(woke.outputFile, 'utf8');
    ok('…and its output says after which step, and where the conditions came from', /Woken after step 1 \(done\)/.test(out) && /smart — /.test(out) && /Woken by every-step \(always is true\): proceed/.test(out));
    ok('the supervisor was told this is not a checkpoint step, and what proceed means', /not a checkpoint step: step 1 \("s1"\) just ended done/.test(prompts[0]) && /go on to step 2/.test(prompts[0]));
    eq('the board keeps the step, not the wake', mgr.workflowRunState(run).board.steps.s1.text, 'ilk metin');

    // retry after a wake
    answers.push(J({ decision: 'retry', target: 's2', patch: { prompt: 'yeniden: {prev_text}' }, confidence: 0.9, why: 'zayıf' }));
    complete(q[0], 'zayıf metin');
    await tick();
    q = queued(w.id);
    eq('‼️ retry sends the step back, patched, with what its predecessor handed it', q.map(t => [t.stepIndex, t.prompt]), [[1, 'yeniden: ilk metin']]);
    ok('…and attempt counts only the step\'s own rows', prompts.length === 2);

    // a broken answer = the mechanical path
    answers.push('bilmiyorum');
    complete(q[0], 'iyi metin');
    await tick();
    q = queued(w.id);
    eq('a broken answer goes the mechanical way', q.map(t => t.stepIndex), [2]);

    // hybrid: a failed step with onFail stop; the supervisor stops it
    w = chain('Hata', K.wakePresetConditions('hybrid'));
    run = mgr.runWorkflow(w);
    answers.push(J({ decision: 'stop', why: 'kaynak yok', confidence: 0.95 }));
    failIt(queued(w.id)[0], 'hata');
    await tick();
    const st1 = mgr.workflowRunState(run);
    ok('‼️ a failed step wakes the hybrid supervisor, and its stop ends the run', st1.status === 'stopped' && /kaynak yok/.test(st1.reason || ''));
    ok('…the row names step-failed', mgr.tasks.some(t => t.workflowRunId === run && t.wokeBy && t.wokeBy[0] === 'step-failed'));

    // hybrid, failed step, proceed = what the chain was going to do (stop)
    w = chain('Hata2', K.wakePresetConditions('hybrid'));
    run = mgr.runWorkflow(w);
    answers.push(J({ decision: 'proceed', confidence: 0.9 }));
    failIt(queued(w.id)[0], 'hata');
    await tick();
    eq('proceed on a failed step with onFail stop = the run fails as written', mgr.workflowRunState(run).status, 'failed');

    // a step's own [] silences the workflow's smart after it
    w = chain('Adım', K.wakePresetConditions('smart'), [st('s1', { wake: [] }), st('s2'), st('s3')]);
    const before = prompts.length;
    run = mgr.runWorkflow(w);
    complete(queued(w.id)[0], 'a');
    await tick();
    eq('no call after a step whose wake is mechanical', [prompts.length - before, queued(w.id).map(t => t.stepIndex)], [0, [1]]);
    answers.push(J({ decision: 'proceed', confidence: 0.9 }));
    complete(queued(w.id)[0], 'b');
    await tick();
    eq('…the next step wakes it as the workflow says', prompts.length - before, 1);

    // resume: a wake row cut by a reload goes the mechanical way, the step is not run again
    w = chain('Yeniden', K.wakePresetConditions('smart'));
    run = mgr.runWorkflow(w);
    answers.push(new Promise(() => { }));
    const hang = mgr.opts.superviseTurn;
    mgr.opts.superviseTurn = () => new Promise(() => { });
    complete(queued(w.id)[0], 'x');
    await tick();
    const cut = mgr.tasks.find(t => t.workflowRunId === run && t.wokeBy);
    cut.status = 'cancelled';
    mgr.opts.superviseTurn = hang;
    answers.length = 0;
    mgr.resumeWorkflowFromTask(cut);
    await tick();
    eq('‼️ resuming a cut wake goes on to step 2 rather than running step 1 again', queued(w.id).map(t => [t.stepIndex, t.prompt]), [[1, 'p-s2 x']]);

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
