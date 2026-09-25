// M-47 — a workflow run a mission started: its supervisor's question goes to the
// lead first (workflow.askEscalation), and the mission reads the result WITH the board.
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
const W = require(path.join(ROOT, 'out/core/workflowMission.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const F = require(path.join(ROOT, 'out/core/flexPoints.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

(async () => {
    /* ---------- the flex point ---------- */
    const p = F.flexPoint('workflow.askEscalation');
    ok('‼️ workflow.askEscalation is a flex point, set in Farm Settings', p && p.default === 'leader-then-human' && p.levels.settings && /agentFarm\.workflowAskEscalation/.test(p.levels.settings.bridge));
    eq('its options are the three orders', p && p.options, ['leader-then-human', 'leader', 'human']);
    eq('an unknown value reads as the default', [W.askEscalationOf('x'), W.askEscalationOf('human')], ['leader-then-human', 'human']);

    /* ---------- the lead's reply ---------- */
    const opts = ['Kapak A', 'Kapak B'];
    eq('an option, word for word (case aside)', W.readLeaderAnswer('ok {"answer":"kapak b","why":"marka rengi"}', opts), { answer: 'Kapak B', why: 'marka rengi' });
    ok('null = left to the person, with its reason', /left it to the person: zevk meselesi/.test(W.readLeaderAnswer('{"answer":null,"why":"zevk meselesi"}', opts).why));
    ok('an answer outside the options is not an answer', W.readLeaderAnswer('{"answer":"Kapak C"}', opts).answer === undefined);
    ok('no JSON is not an answer', /did not answer with a JSON/.test(W.readLeaderAnswer('bence A', opts).why));
    eq('with no options, the sentence is the answer', W.readLeaderAnswer('{"answer":"ikisi de olur"}', []).answer, 'ikisi de olur');
    const pr = W.leaderAskPrompt({ goal: 'Haftalık klip', workflow: 'Klip hattı', question: 'Hangi kapak?', options: opts });
    ok('the lead is shown the mission, the chain, the question and its options', /Haftalık klip/.test(pr) && /"Klip hattı"/.test(pr) && /Hangi kapak\?/.test(pr) && /"Kapak A", "Kapak B"/.test(pr));

    /* ---------- the order of asking ---------- */
    let humanAsked = 0;
    const human = v => async () => { humanAsked++; return v; };
    const lead = raw => async () => raw;
    let r = await W.escalateAsk({ mode: 'leader-then-human', leader: lead('{"answer":"Kapak A","why":"brief böyle"}'), human: human('Kapak B'), options: opts });
    eq('‼️ the lead answers first, and the person is not asked', [r.answer, r.by, humanAsked], ['Kapak A', 'leader', 0]);
    r = await W.escalateAsk({ mode: 'leader-then-human', leader: lead('{"answer":null,"why":"zevk"}'), human: human('Kapak B'), options: opts });
    ok('‼️ a question the lead leaves open comes to the person, saying why', r.answer === 'Kapak B' && r.by === 'human' && /zevk; the person answered/.test(r.note));
    humanAsked = 0;
    r = await W.escalateAsk({ mode: 'leader', leader: lead('{"answer":null}'), human: human('x'), options: opts });
    ok('leader only: an open question stays unanswered, the person never asked', r.answer === undefined && humanAsked === 0 && /only the lead is asked/.test(r.note));
    r = await W.escalateAsk({ mode: 'human', leader: lead('{"answer":"Kapak A"}'), human: human('Kapak B'), options: opts });
    eq('human: straight to the person', [r.answer, r.by], ['Kapak B', 'human']);
    r = await W.escalateAsk({ mode: 'leader-then-human', human: human('Kapak B'), options: opts });
    eq('no mission, no lead: the person, as ever', [r.answer, r.by], ['Kapak B', 'human']);
    r = await W.escalateAsk({ mode: 'leader-then-human', leader: async () => { throw new Error('cli gone'); }, human: human(undefined), options: opts });
    ok('a lead that cannot be asked falls to the person; nobody answering says so', r.answer === undefined && /could not be asked/.test(r.note) && /did not answer/.test(r.note));

    /* ---------- the board beside the result ---------- */
    const board = { steps: { s2: { id: 's2', index: 1, title: 'Özetle', status: 'done', text: 'kısa özet', at: 2 }, s1: { id: 's1', index: 0, title: 'Topla', status: 'done', verdict: 'pass', costUSD: 0.12, at: 1 } }, notes: ['supervisor asked "?" — the mission lead answered'] };
    eq('one line a step, in order, then the notes', W.boardSummary(board), [
        '- s1 "Topla": done · verdict pass · $0.12', '- s2 "Özetle": done — kısa özet', '- note: supervisor asked "?" — the mission lead answered']);
    const txt = W.missionHandoffText('Klip', 'SON METİN', board);
    ok('the result first, then every step', txt.indexOf('SON METİN') < txt.indexOf('## Run board') && /- s1 "Topla"/.test(txt));

    /* ---------- the engine: a note on the run, the mission's copy of the result ---------- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wfmission-'));
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [{ id: 'a1', name: 'yazar', dir: agentDir }], () => false, () => '', { quotaCheck: () => 'hold' });
    const st = (id, extra) => Object.assign({ id, agentId: 'a1', agentName: 'yazar', title: id, prompt: 'x', mode: 'headless' }, extra || {});
    const w = mgr.addWorkflow('İki adım', [st('s1'), st('s2', { prompt: '{prev_text}' })]);
    const runId = mgr.runWorkflow(w);
    let n = 0;
    const complete = (task, body) => {
        const f = path.join(tmp, `out${n++}.md`);
        fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
        task.outputFile = f; mgr.completeTask(task);
    };
    const queued = () => mgr.tasks.filter(t => t.workflowRunId === runId && t.status === 'queued');
    ok('while it runs, the mission reads the running handoff (no copy yet)', !/\.mission\.md$/.test(mgr.missionHandoffFile(runId) || ''));
    complete(queued()[0], 'ilk');
    mgr.noteOnRun(runId, 'supervisor asked "hangi?" — the mission lead answered: A');
    complete(queued()[0], 'son');
    const f = mgr.missionHandoffFile(runId);
    const body = f ? fs.readFileSync(f, 'utf8') : '';
    ok('‼️ an ended run reads as its result WITH the board', /\.mission\.md$/.test(f || '') && /son/.test(body) && /## Run board/.test(body) && /- s1 /.test(body) && /- s2 /.test(body));
    ok('…and the note of who answered is on it', /the mission lead answered: A/.test(body));

    /* ---------- the wiring ---------- */
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    ok('‼️ the checkpoint question goes through the escalation', /askChoice: \(question, options, ctx\) => askWorkflowQuestion\(/.test(ext) && /escalateAsk\(\{/.test(ext));
    ok('the mode is resolved by the flex point', /resolveFlex\('workflow\.askEscalation'/.test(ext));
    ok('the lead is asked by the planner call its rounds use, and the cost lands on the run', /missionPlannerCallOnce\(spec, run\)\(leaderAskPrompt\(/.test(ext) && /run\.totalCostUSD \+= r\.costUSD/.test(ext));
    ok('both places a mission reads a run read the copy with the board', (ext.match(/missionHandoffFile\(/g) || []).length >= 3);
    ok('the run is started with the lead\'s wake', /prepareWorkflowRun\(wf, \{ projectId: spec\.projectId, inputs: step\.inputs, \.\.\.\(step\.wake/.test(ext));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
