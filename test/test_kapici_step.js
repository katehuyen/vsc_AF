// M-60 — a workflow step Kapıcı decides: its shape, which rules can route a
// step, off / shadow / on and the rule's own paths, and the chain it routes —
// carry on with the upstream handoff, stop the run, or ask you.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const ROOT = path.join(__dirname, '..');
class FakeEmitter { constructor() { this.l = []; this.event = f => { this.l.push(f); return { dispose() { } }; }; } fire(v) { this.l.forEach(f => f(v)); } dispose() { } }
const fakeVscode = {
    EventEmitter: FakeEmitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};
const K = require(path.join(ROOT, 'out/core/kapiciStep.js'));
const B = require(path.join(ROOT, 'out/core/kapici/builtinRules.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const { checkWorkflowInputs } = require(path.join(ROOT, 'out/core/workflowInputs.js'));
const { supervisorTrail } = require(path.join(ROOT, 'out/core/supervisorTrail.js'));
const { stepFromDraft } = require(path.join(ROOT, 'out/panels/tasksPanel.js'));

const verdict = o => Object.assign({ passed: true, decision: 'pass', confidence: 0.9, answers: {}, reason: 'ok p=0.90',
    provider: 'jev', latencyMs: 1, ruleId: 'my.rule', ruleVersion: 1, layer: 'system' }, o);

(async () => {
    console.log('\n== the step\'s shape, and where it may stand ==');
    {
        eq('a rule is all it needs', K.kapiciStepRefusal({ rule: 'my.rule' }), '');
        ok('no rule is refused', /names its rule/.test(K.kapiciStepRefusal({})));
        ok('a malformed rule id is refused', /names its rule/.test(K.kapiciStepRefusal({ rule: 'two words' })));
        ok('onReject is stop or ask_user', /onReject/.test(K.kapiciStepRefusal({ rule: 'r', onReject: 'retry' })));
        ok('not in parallel', /cannot run in parallel/.test(K.kapiciStepRefusal({ rule: 'r' }, { parallel: true })));
        ok('not once per item', /once per item/.test(K.kapiciStepRefusal({ rule: 'r' }, { forEach: { list: 'x' } })));
        ok('the workflow check refuses it too', /step 1: .*parallel/.test(checkWorkflowInputs([], [{ title: 'k', prompt: '', kapici: { rule: 'r' }, parallel: true }]).error));
    }

    console.log('\n== which rules can route a step ==');
    {
        eq('a pass/reject rule can', K.stepRuleFit(B.TRIGGER_HAS_WORK), '');
        ok('a rule choosing agents cannot', /picks among \$call|decides nothing/.test(K.stepRuleFit(B.DISPATCH_ROUTE)));
        ok('a rule choosing other words cannot, and names them', /picks among resume, retryOriginal/.test(K.stepRuleFit(B.RETRY_NEXT_ACTION)));
        const routes = { id: 'gate.route', questions: { way: { type: 'choice', instructions: 'x', criteria: { proceed: 'a', stop: 'b', ask_user: 'c' } } }, decide: { actionFrom: 'way' } };
        eq('a rule choosing among the routes can', K.stepRuleFit(routes), '');
        eq('pass → proceed', K.routeOfVerdict(verdict({}), { rule: 'r' }), 'proceed');
        eq('reject → stop by default', K.routeOfVerdict(verdict({ passed: false, decision: 'reject' }), { rule: 'r' }), 'stop');
        eq('reject → ask_user when the step says so', K.routeOfVerdict(verdict({ passed: false, decision: 'reject' }), { rule: 'r', onReject: 'ask_user' }), 'ask_user');
        eq('a route chosen is the route', K.routeOfVerdict(verdict({ decision: 'ask_user' }), { rule: 'r' }), 'ask_user');
    }

    console.log('\n== off · shadow · on, and the rule\'s own paths ==');
    {
        const spec = { rule: 'my.rule' };
        let calls = [];
        const hook = (mode, v) => ({ mode, log: () => { }, evaluate: async (rule, state, m, actual) => { calls.push({ rule, state, m, actual }); if (v instanceof Error) { throw v; } return v; } });
        let o = await K.kapiciStepRoute(spec, 'metin', undefined);
        ok('no hook (off): carries on', o.route === 'proceed' && o.by === 'today' && /off/.test(o.why));
        o = await K.kapiciStepRoute(spec, 'metin', hook('off', verdict({ passed: false })));
        ok('off: carries on, Kapıcı never called', o.route === 'proceed' && calls.length === 0);
        o = await K.kapiciStepRoute(spec, 'metin', hook('shadow', verdict({ passed: false, decision: 'reject' })));
        await o.shadow;
        ok('shadow: carries on, and Kapıcı is audited beside it', o.route === 'proceed' && calls.length === 1 && calls[0].m === 'shadow' && calls[0].actual === 'pass' && calls[0].state === 'metin');
        o = await K.kapiciStepRoute(spec, 'metin', hook('on', verdict({ passed: false, decision: 'reject', reason: 'ok p=0.10' })));
        ok('on, reject: stops, and says why', o.route === 'stop' && o.by === 'kapici' && /^Kapıcı: my\.rule — ok p=0\.10 \(confidence 0\.90\)$/.test(o.why));
        o = await K.kapiciStepRoute(spec, 'metin', hook('on', verdict({ passed: false, decision: 'closed', fallback: 'closed', confidence: 0, reason: 'jev failed (no-key)' })));
        ok('on, a failure the rule closes: stops', o.route === 'stop' && /no-key/.test(o.why));
        o = await K.kapiciStepRoute(spec, 'metin', hook('on', verdict({ passed: false, decision: 'reject', fallback: 'ask', confidence: 0.3 })));
        ok('on, not sure and the rule asks: asks you', o.route === 'ask_user');
        o = await K.kapiciStepRoute(spec, 'metin', hook('on', verdict({ passed: true, decision: 'open', fallback: 'open', confidence: 0 })));
        ok('on, a failure the rule opens: carries on', o.route === 'proceed' && o.by === 'today');
        o = await K.kapiciStepRoute(spec, 'metin', hook('on', new Error('boom')));
        ok('on, Kapıcı throws: carries on', o.route === 'proceed');
    }

    console.log('\n== the form draft becomes the step ==');
    {
        const built = stepFromDraft({ stype: 'kapici', title: 'kapı', kpRule: 'my.rule', kpInput: '{steps.s1.text}', kpReject: 'ask_user' }, [], 2);
        eq('the step carries its kapici block and no agent', [built.step.agentName, built.step.kapici], ['kapici', { rule: 'my.rule', input: '{steps.s1.text}', onReject: 'ask_user' }]);
        ok('a rule id with a space is refused where it was typed', /Step 2 \("kapı"\): .*names its rule/.test(stepFromDraft({ stype: 'kapici', title: 'kapı', kpRule: 'a b' }, [], 2).error));
        eq('stop is not written down, it is the default', stepFromDraft({ stype: 'kapici', title: 'k', kpRule: 'r', kpReject: 'stop' }, [], 1).step.kapici, { rule: 'r' });
    }

    console.log('\n== the chain it routes ==');
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-kapici-step-'));
        const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
        const agent = { id: 'a1', name: 'yazar', dir: agentDir };
        let answer = verdict({});
        let approve = true;
        let hookMode = 'on';
        const asked = [];
        const mgr = new TaskManager(path.join(tmp, 'k.json'), () => [agent], () => false, () => '', {
            quotaCheck: () => 'hold',
            confirmApproval: async (info) => { asked.push(info.message); return approve; },
            kapiciStep: () => hookMode === 'off' ? undefined : { mode: hookMode, evaluate: async (rule, state) => { asked.push(rule + '|' + state); return answer; } }
        });
        let n = 0;
        const complete = (task, body) => {
            const f = path.join(tmp, `out${n++}.md`);
            fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
            task.outputFile = f; mgr.completeTask(task);
        };
        const tick = async () => { for (let i = 0; i < 30; i++) { await new Promise(r => setImmediate(r)); } };
        const queued = wId => mgr.tasks.filter(t => t.workflowId === wId && t.status === 'queued');
        const st = (id, prompt) => ({ id, agentId: 'a1', agentName: 'yazar', title: id, prompt, mode: 'headless' });
        const chain = (title, kapici) => mgr.addWorkflow(title, [st('s1', 'yaz'), { id: 'k', agentId: '', agentName: 'kapici', title: 'kapı', prompt: '', mode: 'headless', kapici }, st('s3', 'yayınla: {prev_text}')]);
        const gateRow = wId => mgr.tasks.find(t => t.workflowId === wId && t.stepIndex === 1);

        let w = chain('Geçer', { rule: 'my.rule' });
        let run = mgr.runWorkflow(w);
        complete(queued(w.id)[0], 'kısa metin');
        await tick();
        ok('Kapıcı reads the previous step\'s output with the step\'s rule', asked[0] === 'my.rule|kısa metin');
        eq('pass: the chain goes on, and the next step reads the output before the gate', queued(w.id).map(t => [t.stepIndex, t.prompt]), [[2, 'yayınla: kısa metin']]);
        let g = gateRow(w.id);
        ok('the gate\'s row: a kapici step, done, its decision on the supervisor strip', g.agentName === 'kapici' && g.status === 'done' && g.supervisorCall.decision === 'proceed' && g.supervisorCall.model === 'Kapıcı' && g.supervisorCall.confidence === 0.9);
        ok('the run board holds the route', /^proceed: Kapıcı: my\.rule/.test(mgr.runRecords.get(run).board.steps.k.text));
        eq('a Kapıcı row is not counted as a supervisor call', supervisorTrail(run, mgr.tasks).calls, 0);

        answer = verdict({ passed: false, decision: 'reject', reason: 'ok p=0.05' });
        w = chain('Durur', { rule: 'my.rule' });
        run = mgr.runWorkflow(w);
        complete(queued(w.id)[0], 'boş');
        await tick();
        eq('reject: nothing after it starts', queued(w.id).length, 0);
        const ended = mgr.runRecords.get(run).ended;
        ok('…and the run is stopped, saying it was Kapıcı at step 2', ended.status === 'stopped' && /^Kapıcı stopped the run at step 2: Kapıcı: my\.rule — ok p=0\.05/.test(ended.reason));

        asked.length = 0;
        approve = false;
        w = chain('Sorar', { rule: 'my.rule', onReject: 'ask_user' });
        run = mgr.runWorkflow(w);
        complete(queued(w.id)[0], 'belki');
        await tick();
        ok('ask_user: you are asked, with the reason', asked.length === 2 && /Kapıcı: my\.rule/.test(asked[1]));
        g = gateRow(w.id);
        ok('you said no: stopped, and the row says it was you', mgr.runRecords.get(run).ended.status === 'stopped' && g.supervisorCall.decision === 'ask_user' && /you stopped it$/.test(g.supervisorCall.why));
        approve = true;
        w = chain('Sorar2', { rule: 'my.rule', onReject: 'ask_user' });
        run = mgr.runWorkflow(w);
        complete(queued(w.id)[0], 'belki');
        await tick();
        ok('you said yes: the chain goes on', queued(w.id).map(t => t.stepIndex).join() === '2' && /you let it carry on$/.test(gateRow(w.id).supervisorCall.why));

        hookMode = 'off';
        asked.length = 0;
        answer = verdict({ passed: false, decision: 'reject' });
        w = chain('Kapalı', { rule: 'my.rule' });
        run = mgr.runWorkflow(w);
        complete(queued(w.id)[0], 'x');
        await tick();
        ok('off: nothing asked, the chain goes on as if the step were not there', asked.length === 0 && queued(w.id).map(t => t.stepIndex).join() === '2');
        g = gateRow(w.id);
        ok('…and the row says it carried on the mechanical way', !!g.supervisorCall.mechanical && /off for workflows/.test(g.supervisorCall.mechanical));
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
