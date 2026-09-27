// U-151 3c-3 — A FLEX VALUE ON ONE WORKFLOW RECORD (level workflow).
//
// setWorkflowFlex (src/core/flexWorkflow.ts) is what flex.set level=workflow and the
// Run card's '↑ this flow' write: the wake set, and one input's default. Every other
// workflow-level point travels with its whole object and is refused by name.
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const { setWorkflowFlex } = require(path.join(ROOT, 'out', 'core', 'flexWorkflow.js'));
const { registerFlexOps } = require(path.join(ROOT, 'out', 'core', 'flexBridge.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));

const wf = () => ({
    id: 'w9', title: 'Klip kes',
    inputs: [{ name: 'clip', type: 'file', required: true }, { name: 'size', type: 'choice', choices: ['short', 'long'], default: 'short' }]
});
const refused = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

(async () => {
    console.log('== the wake set ==');
    {
        const w = wf();
        const r = setWorkflowFlex(w, 'workflow.wake', 'hybrid');
        ok('a preset name becomes the workflow\'s own condition list', Array.isArray(w.wake) && w.wake.length === 3 && r.workflow === 'w9');
        setWorkflowFlex(w, 'workflow.wake', undefined);
        ok('back to inherited: mechanical is not kept', w.wake === undefined);
        setWorkflowFlex(w, 'workflow.wake', [{ id: 'c1', field: 'step.status', operator: 'eq', value: 'failed' }]);
        ok('a condition list is kept as given', w.wake.length === 1 && w.wake[0].field === 'step.status');
        ok('a set nothing can judge is refused and nothing changes',
            refused(() => setWorkflowFlex(w, 'workflow.wake', 'sometimes'), /neither mechanical/) && w.wake.length === 1);
    }
    console.log('== an input\'s default ==');
    {
        const w = wf();
        setWorkflowFlex(w, 'workflow.input', 'long', 'size');
        ok('‼️ the named input\'s default is written', w.inputs[1].default === 'long' && w.inputs[0].default === undefined);
        ok('a value the input does not take is refused', refused(() => setWorkflowFlex(w, 'workflow.input', 'huge', 'size'), /not one of short, long/)
            && w.inputs[1].default === 'long');
        ok('an input the workflow lacks is refused, naming the ones it has',
            refused(() => setWorkflowFlex(w, 'workflow.input', 'x', 'clp'), /clip, size/));
        setWorkflowFlex(w, 'workflow.input', undefined, 'size');
        ok('back to inherited: the default is removed', !('default' in w.inputs[1]));
    }
    console.log('== the rest ==');
    {
        ok('a point kept in a whole object names the op that writes it',
            refused(() => setWorkflowFlex(wf(), 'library.enrich.model', 'opus'), /workflows\.update/));
        ok('a point not set per workflow is refused', refused(() => setWorkflowFlex(wf(), 'tool.outDir', 'D:/x'), /not set per workflow/));
        ok('an unknown point is refused', refused(() => setWorkflowFlex(wf(), 'no.such', 1), /not a flex point/));
    }
    console.log('== the bridge ==');
    {
        const calls = [];
        const reg = new BridgeRegistry();
        registerFlexOps(reg, {
            readSetting: () => undefined, writeSetting: async () => undefined,
            setWorkflow: (target, point, value, name) => { calls.push({ target, point, value, name }); return { ok: 1 }; }
        });
        const r = await reg.dispatch('flex.set', { point: 'workflow.input', level: 'workflow', target: 'Klip kes', name: 'size', value: 'long' });
        ok('flex.set level=workflow hands the target, point, value and input name over', r.ok && calls.length === 1
            && calls[0].target === 'Klip kes' && calls[0].point === 'workflow.input' && calls[0].value === 'long' && calls[0].name === 'size');
        await reg.dispatch('flex.set', { point: 'workflow.wake', level: 'workflow', target: 'w9', value: null });
        ok('null is back to inherited', calls[1].value === undefined && calls[1].name === undefined);
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        ok('‼️ the host writes the record through the same core and persists it',
            /setWorkflow: \(target[\s\S]{0,200}setWorkflowFlex\(bridgeWorkflow\(target\)[\s\S]{0,80}taskManager\.persist\(\)/.test(ext));
        ok('the page\'s ↑ this flow goes through it', /args\.level === 'workflow' \? flexDeps\.setWorkflow\(/.test(ext));
    }
    console.log(`\ntest_flex_workflow.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
