// M-38 — a workflow is given inputs when it starts; a trigger hands it the file that changed.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');

class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
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
const W = require(path.join(ROOT, 'out/core/workflowInputs.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const { TriggerManager } = require(path.join(ROOT, 'out/core/triggers.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

/* ---------- the schema ---------- */
{
    const n = W.normalizeInputs([
        { name: 'clip', type: 'file', required: true, description: 'the clip to cut' },
        { name: 'size', type: 'choice', choices: ['short', 'long'], default: 'short' },
        { name: 'n', type: 'number', default: '3' }
    ]);
    eq('a sound schema keeps every input', [n.errors, n.inputs.map(i => i.name)], [[], ['clip', 'size', 'n']]);
    ok('a bad name is refused and says what a name is', /a name is letters/.test(W.normalizeInputs([{ name: '1x' }]).errors[0]));
    ok('a name used twice is refused', /used twice/.test(W.normalizeInputs([{ name: 'a' }, { name: 'a' }]).errors[0]));
    ok('a choice needs its choices', /needs its choices/.test(W.normalizeInputs([{ name: 'c', type: 'choice' }]).errors[0]));
    ok('a default that does not fit its type is refused', /not a number/.test(W.normalizeInputs([{ name: 'n', type: 'number', default: 'x' }]).errors[0]));
    eq('no type = text', W.normalizeInputs([{ name: 't' }]).inputs[0].type, 'text');
    const c = W.checkWorkflowInputs([{ name: 'clip' }], [{ prompt: 'cut {input.clip} by {input.clp}' }]);
    ok('‼️ a step reading an input nobody declared is refused at save', /\{input\.clp\}/.test(c.error));
}

/* ---------- a run's values ---------- */
const SCHEMA = W.normalizeInputs([
    { name: 'clip', type: 'file', required: true, description: 'the clip to cut' },
    { name: 'size', type: 'choice', choices: ['short', 'long'], default: 'short' },
    { name: 'dir', type: 'folder' }
]).inputs;
{
    const v = W.resolveInputs(SCHEMA, { clip: 'D:/in/a.mp4' });
    eq('a given value and a default', [v.ok, v.values, v.origin], [true, { clip: 'D:/in/a.mp4', size: 'short' }, { clip: 'run', size: 'workflow' }]);
    const miss = W.resolveInputs(SCHEMA, {});
    ok('‼️ a missing required input refuses, naming it and why', !miss.ok && /input "clip" is required — the clip to cut/.test(miss.problems[0]));
    ok('an unknown name refuses rather than being dropped', /no input "clpi"/.test(W.resolveInputs(SCHEMA, { clip: 'x', clpi: 'y' }).problems[0]));
    ok('a value outside a choice refuses', /not one of short, long/.test(W.resolveInputs(SCHEMA, { clip: 'x', size: 'huge' }).problems[0]));
    eq('a trigger\'s values are named as the trigger\'s', W.resolveInputs(SCHEMA, { clip: 'x' }, 'trigger').origin.clip, 'trigger');
    eq('{input.x} is filled; one with no value is empty', W.fillInputs('cut {input.clip} {input.size}|{input.dir}|', { clip: 'a', size: 'b' }), 'cut a b||');
}

/* ---------- a trigger's mapping ---------- */
{
    eq('unstated: the file goes to the first file input, the watched path to the first folder input',
        W.defaultTriggerMapping(SCHEMA), { clip: '{file}', dir: '{watch}' });
    eq('the default mapping filled from a firing', W.triggerInputs(SCHEMA, undefined, { watch: 'D:/in', file: 'D:/in/a.mp4' }),
        { clip: 'D:/in/a.mp4', dir: 'D:/in' });
    eq('a stated mapping, with a payload field', W.triggerInputs(SCHEMA, { clip: '{payload.video.url}', size: 'long' },
        { payload: { video: { url: 'https://x/v.mp4' } } }), { clip: 'https://x/v.mp4', size: 'long' });
    ok('a mapping naming an input the workflow lacks is refused', /no input "nope"/.test(W.checkTriggerMapping(SCHEMA, { nope: '{file}' }).error));
    eq('an empty mapping is no mapping', W.checkTriggerMapping(SCHEMA, {}), { error: '' });
}

/* ---------- the runtime: a run starts with its values, and every step reads them ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wfin-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
const mgr = new TaskManager(path.join(tmp, 'f.json'), () => [agent], () => false, () => '', { quotaCheck: () => 'hold' });
const step = (title, prompt) => ({ agentId: 'a1', agentName: 'yazar', title, prompt, mode: 'headless' });
const first = (wId) => mgr.tasks.find(t => t.workflowId === wId && t.stepIndex === 0);
{
    const w = mgr.addWorkflow('Kes', [step('cut', 'Şu klibi kes: {input.clip} ({input.size})')], SCHEMA);
    ok('‼️ the refusal names the missing input', /"Kes" did not start: input "clip" is required/.test(mgr.workflowRunRefusal(w, {})));
    eq('…and nothing starts', mgr.runWorkflow(w), undefined);
    const run = mgr.runWorkflow(w, { inputs: { clip: 'D:/in/a.mp4' } });
    ok('with the input it starts', typeof run === 'string');
    eq('‼️ the first step\'s prompt carries the value and the default', first(w.id) && first(w.id).prompt, 'Şu klibi kes: D:/in/a.mp4 (short)');
    eq('the values a person typed are remembered for the next Run card', w.lastInputs, { clip: 'D:/in/a.mp4' });
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'f.json'), 'utf8'));
    eq('the run record keeps its values across a reload', saved.workflowRuns[run].inputs, { clip: 'D:/in/a.mp4', size: 'short' });
}

/* ---------- ‼️ END TO END: a file dropped into a watched folder reaches the workflow's first step ---------- */
(async () => {
    const inbox = path.join(tmp, 'inbox'); fs.mkdirSync(inbox);
    const w = mgr.addWorkflow('Gelen', [step('look', 'Bak: {input.clip}')],
        W.normalizeInputs([{ name: 'clip', type: 'file', required: true }]).inputs);
    mgr.addTrigger({
        title: 'klasöre düşen', type: 'watch', watchPath: inbox, enabled: true,
        debounceSec: 1, cooldownSec: 0, maxPerHour: 0, action: { kind: 'workflow', workflowId: w.id }
    });
    const trig = new TriggerManager(mgr, () => [agent]);
    const dropped = path.join(inbox, 'klip.mp4');
    await new Promise(r => setTimeout(r, 200));
    fs.writeFileSync(dropped, 'x');
    for (let i = 0; i < 40 && !first(w.id); i++) { await new Promise(r => setTimeout(r, 100)); }
    ok('the trigger fired the workflow', !!first(w.id));
    eq('‼️ the dropped file\'s path is in the first step\'s prompt', first(w.id) && first(w.id).prompt, `Bak: ${dropped}`);

    // and a trigger that cannot fill a required input is skipped, never silent
    const w2 = mgr.addWorkflow('Metin ister', [step('s', '{input.note}')],
        W.normalizeInputs([{ name: 'note', type: 'text', required: true }]).inputs);
    const t2 = mgr.addTrigger({
        title: 'eksik', type: 'webhook', token: 'tok', enabled: true,
        debounceSec: 1, cooldownSec: 0, maxPerHour: 0, action: { kind: 'workflow', workflowId: w2.id }
    });
    eq('a trigger that cannot fill a required input does not fire', trig.fire(t2, 'manual'), false);
    ok('…and says why on its record', /input "note" is required/.test(t2.lastSkipReason || ''));
    t2.action.inputs = { note: '{payload.text}' };
    eq('mapped from the payload it fires', trig.fire(t2, 'manual', { text: 'merhaba' }), true);
    eq('…and the step reads it', first(w2.id) && first(w2.id).prompt, 'merhaba');

    trig.dispose();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
