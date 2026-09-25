// M-44 — one supervisor session per workflow run: resumed between checkpoints, re-seeded when a
// resume dies, every turn a ModelAssist, ceilings that turn it off, and no second call after a reload.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
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
const S = require(path.join(ROOT, 'out/core/supervisorRun.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const J = o => JSON.stringify(o);

/* ---------- limits: flex points at the workflow level ---------- */
const d = S.supervisorRunLimits(undefined);
eq('built-in limits', [d.model, d.maxCalls, d.budgetUSD, d.budgetMode, d.maxFailures, d.timeoutMs], ['', 10, 0, 'soft', 3, 300000]);
const w = S.supervisorRunLimits({ model: 'haiku', maxCalls: 2, budgetUSD: 0.5, budgetMode: 'hard', timeoutMin: 1 });
eq('the workflow overrides', [w.model, w.maxCalls, w.budgetUSD, w.budgetMode, w.timeoutMs], ['haiku', 2, 0.5, 'hard', 60000]);
ok('…and says where each came from', /maxCalls 2/.test(w.origin) && /built-in/.test(w.origin));
ok('a ceiling out of range is refused', /maxCalls 99 is refused/.test(S.supervisorRunRefusal({ maxCalls: 99 })));
ok('a model that is not a plain name is refused', /not a plain name/.test(S.supervisorRunRefusal({ model: 'haiku; rm -rf' })));
eq('a sound one', S.supervisorRunRefusal({ model: 'claude-haiku-4-5', budgetMode: 'soft' }), '');
const ww = {}; S.setWorkflowSupervisor(ww, S.supervisorFromDraft({ supModel: 'haiku', supCalls: '3', supBudget: '', supBudgetMode: 'hard' }));
eq('the form round trip keeps only what was said', ww.supervisor, { model: 'haiku', maxCalls: 3, budgetMode: 'hard' });
eq('…and seeds its boxes back', [S.supervisorSeed(ww.supervisor).supCalls, S.supervisorSeed(ww.supervisor).supBudget], [3, '']);
S.setWorkflowSupervisor(ww, {}); ok('nothing stated removes it', ww.supervisor === undefined);

/* ---------- ceilings ---------- */
const base = { history: [], retries: {}, directives: [] };
ok('calls per run', /used its 2 supervisor calls/.test(S.turnRefusal({ ...base, calls: 2 }, w)));
ok('a hard budget', /hard ceiling/.test(S.turnRefusal({ ...base, calls: 1, costUSD: 0.6 }, w)));
const soft = { ...w, budgetMode: 'soft', maxCalls: 9 };
ok('a soft budget is never a refusal…', S.turnRefusal({ ...base, costUSD: 0.6 }, soft) === '');
ok('…it is said', /over its soft \$0\.50 budget \(\$0\.60\)/.test(S.softNote({ ...base, costUSD: 0.6 }, soft)));
let st = base;
for (let i = 0; i < 3; i++) { st = S.recordTurn(st, { ok: false, ms: 10, model: 'haiku', note: 'boom' }, d, 1000 + i); }
ok('‼️ failures in a row turn it off for the run', /3 supervisor calls failed in a row/.test(st.off) && S.turnRefusal(st, d) === st.off);
st = S.recordTurn(S.recordTurn(base, { ok: false, ms: 1, model: 'm' }, d, 1), { ok: true, ms: 1, model: 'm', costUSD: 0.02 }, d, 2);
eq('a success resets the count, and every turn is a ModelAssist', [st.failures, st.calls, st.costUSD, st.assists.length, st.assists[1].costUsd], [0, 2, 0.02, 2, 0.02]);

/* ---------- visits: a reload never asks the same checkpoint twice ---------- */
let v = S.enterVisit(base, 's2');
eq('a first visit', [v.key, v.cutOff, v.state.inFlight], ['s2#1', false, 's2#1']);
const again = S.enterVisit(v.state, 's2');
ok('‼️ the same checkpoint entered while its call was in flight = cut off', again.cutOff && again.key === 's2#1');
v = S.enterVisit({ ...v.state, inFlight: undefined }, 's2');
eq('a later visit counts on', v.key, 's2#2');

/* ---------- a turn through the session ---------- */
(async () => {
    const calls = [];
    const fake = (answers) => async (prompt, o) => { calls.push({ prompt, o }); return answers.shift(); };
    const clock = (() => { let t = 0; return () => (t += 100); })();
    let t = await S.sessionTurn(base, d, 'BRIEF-1', 'haiku', fake([{ ok: true, raw: '{"decision":"proceed"}', sessionId: 'sx', costUSD: 0.01 }]), clock);
    ok('‼️ the first turn opens a session seeded with its standing rules', /You supervise ONE workflow run/.test(calls[0].prompt) && !calls[0].o.resume && calls[0].o.model === 'haiku');
    eq('…its answer, its session and its cost are kept', [t.out, t.state.sessionId, t.state.calls, t.state.costUSD], ['{"decision":"proceed"}', 'sx', 1, 0.01]);
    t = await S.sessionTurn({ ...t.state, history: ['proceed:'] }, d, 'BRIEF-2', 'haiku', fake([{ ok: true, raw: 'x', sessionId: 'sx' }]), clock);
    ok('‼️ the next checkpoint RESUMES it and sends only the brief', calls[1].o.resume === 'sx' && calls[1].prompt === 'BRIEF-2');
    t = await S.sessionTurn({ ...t.state, history: ['proceed:', 'retry:s1'] }, d, 'BRIEF-3', 'haiku',
        fake([{ ok: false, raw: '', error: 'No conversation found' }, { ok: true, raw: 'y', sessionId: 'sy' }]), clock);
    ok('‼️ a resume that dies is replaced by a fresh session carrying the ledger',
        calls[3].o.resume === undefined && /earlier decisions on this run, oldest first: proceed: · retry:s1/.test(calls[3].prompt) && t.state.sessionId === 'sy');
    ok('…and the row says so', /could not be resumed/.test(t.state.assists[t.state.assists.length - 1].note));
    const n = calls.length;
    t = await S.sessionTurn({ ...base, calls: 10 }, d, 'B', 'haiku', fake([]), clock);
    ok('a refused turn spawns nothing', calls.length === n && /used its 10/.test(t.error));

    /* ---------- the real call's shape (a fake spawn) ---------- */
    let seen;
    const spawn = (cmd, args) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.stdin = { end: (p) => { seen = { cmd, args, prompt: p }; setImmediate(() => { child.stdout.emit('data', J({ type: 'result', subtype: 'success', is_error: false, result: '{"decision":"stop"}', session_id: 'real-1', total_cost_usd: 0.003 })); child.emit('close', 0); }); } };
        return child;
    };
    const r = await S.spawnSessionCall(os.tmpdir(), spawn)('çok satırlı\nbrifing', { resume: 'real-0', model: 'haiku', effort: 'low', account: '', timeoutMs: 5000 });
    ok('‼️ read-only (plan mode), json, the model, the effort and --resume on the vector', seen.cmd === 'claude'
        && ['--permission-mode plan', '--output-format json', '--model haiku', '--effort low', '--resume real-0'].every(f => seen.args.join(' ').includes(f)));
    ok('‼️ lean: no tools, no MCP servers, its own short system prompt — and -p stays last', ['--tools', '--strict-mcp-config', '--system-prompt'].every(f => seen.args.includes(f))
        && seen.args[seen.args.length - 1] === '-p' && seen.args[seen.args.indexOf('--tools') + 1] !== undefined);
    ok('‼️ the prompt goes down stdin, never through a shell line', seen.prompt === 'çok satırlı\nbrifing' && !seen.args.join(' ').includes('brifing'));
    eq('the envelope is read', [r.ok, r.raw, r.sessionId, r.costUSD], [true, '{"decision":"stop"}', 'real-1', 0.003]);

    /* ---------- the engine: one session across two checkpoints, the ceiling, a reload ---------- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-suprun-'));
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'yazar', dir: agentDir };
    const store = path.join(tmp, 's.json');
    const got = [];
    let answer = () => ({ ok: true, raw: J({ decision: 'proceed', confidence: 0.9 }), sessionId: 'run-sess', costUSD: 0.01 });
    const make = () => new TaskManager(store, () => [agent], () => false, () => '', {
        quotaCheck: () => 'hold', supervisorSession: async (prompt, o) => { got.push({ prompt, o }); return answer(); }
    });
    let mgr = make();
    let k = 0;
    const complete = (task, body) => {
        const f = path.join(tmp, `o${k++}.md`);
        fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
        task.outputFile = f; mgr.completeTask(task);
    };
    const tick = async () => { for (let i = 0; i < 20; i++) { await new Promise(res => setImmediate(res)); } };
    const queued = (wId) => mgr.tasks.filter(x => x.workflowId === wId && x.status === 'queued');
    const st2 = (id, extra) => ({ id, agentId: 'a1', agentName: 'yazar', title: id, prompt: 'p-' + id, mode: 'headless', ...(extra || {}) });
    const cp = (id) => ({ ...st2(id), agentId: '', agentName: 'checkpoint', checkpoint: {} });
    const chain = (title, sup) => {
        const wf = mgr.addWorkflow(title, [st2('s1'), cp('c1'), st2('s2'), cp('c2'), st2('s3')]);
        if (sup) { S.setWorkflowSupervisor(wf, sup); }
        return wf;
    };
    let wf = chain('İki', { model: 'haiku' });
    let run = mgr.runWorkflow(wf);
    complete(queued(wf.id)[0], 'bir'); await tick();
    complete(queued(wf.id)[0], 'iki'); await tick();
    ok('‼️ the second checkpoint resumed the run\'s session', got.length === 2 && !got[0].o.resume && got[1].o.resume === 'run-sess');
    ok('the workflow\'s model reached the call', got[0].o.model === 'haiku');
    const rows = mgr.tasks.filter(x => x.workflowRunId === run && x.agentName === 'checkpoint');
    ok('‼️ each checkpoint row carries its own supervisor cost', rows.length === 2 && rows.every(x => x.costUSD === 0.01));
    const sup = mgr.workflowRunState(run).supervisor || mgr.runRecords.get(run).supervisor;
    eq('the run keeps the session, the calls and a ModelAssist per turn', [sup.sessionId, sup.calls, sup.assists.length, sup.inFlight], ['run-sess', 2, 2, undefined]);

    got.length = 0;
    wf = chain('Tavan', { maxCalls: 1 });
    run = mgr.runWorkflow(wf);
    complete(queued(wf.id)[0], 'bir'); await tick();
    complete(queued(wf.id)[0], 'iki'); await tick();
    const second = mgr.tasks.find(x => x.workflowRunId === run && x.stepIndex === 3);
    ok('‼️ past the calls ceiling the checkpoint goes mechanical without a call, and says why',
        got.length === 1 && /(mechanical: the run has used its 1 supervisor call)/.test(fs.readFileSync(second.outputFile, 'utf8')));
    eq('…and the run carries on', queued(wf.id).map(x => x.stepIndex), [4]);

    got.length = 0;
    answer = () => new Promise(() => { /* the window closes mid-call */ });
    wf = chain('Yeniden');
    run = mgr.runWorkflow(wf);
    complete(queued(wf.id)[0], 'bir'); await tick();
    ok('the call was made once', got.length === 1);
    mgr = make();
    answer = () => ({ ok: true, raw: J({ decision: 'stop', confidence: 1 }), sessionId: 's', costUSD: 0.01 });
    const cut = mgr.tasks.find(x => x.workflowRunId === run && x.stepIndex === 1);
    mgr.resumeWorkflowFromTask(cut); await tick();
    ok('‼️ after a reload the cut-off checkpoint is NOT asked again', got.length === 1);
    const redo = mgr.tasks.filter(x => x.workflowRunId === run && x.stepIndex === 1).pop();
    ok('…it carries on, saying why', /reload cut this checkpoint/.test(fs.readFileSync(redo.outputFile, 'utf8')) && queued(wf.id).some(x => x.stepIndex === 2));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
