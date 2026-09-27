// U-151 (d) — 'RUN WITH…': one run's own values, drawn with the page form.
//
// Every workflow row carries 'with…' — a workflow with no inputs too, whose only
// run-level value is its wake set. The card starts at the last run's values (the
// inputs AND the wake choice, remembered by the host) and posts them on submit.
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const { runPage } = require('./lib_page_dom');
const fixture = require('./fixtures/tasks');

const base = fixture.variants().find(v => v.id === 'tasks-wf-runcard');
const clone = x => JSON.parse(JSON.stringify(x));
const start = (edit) => {
    const data = clone(base.data);
    if (edit) { edit(data); }
    return runPage(fixture.script, data, fixture.window || {}, base.state);
};
const af = (r, key) => r.query('[data-af]').find(e => e.dataset.af === key);

console.log('== the row ==');
{
    const r = start(d => { d.plan[0].inputs = []; d.plan[0].lastInputs = {}; d.plan[0].lastWake = 'smart'; d.workflows[0].inputs = []; });
    const w = r.query('[data-plan="runwith"]');
    ok('every workflow row carries with…', w.length === 1 && w[0].dataset.kind === 'workflow');
    const before = r.posted.length;
    w[0].click();
    ok('‼️ a workflow with no inputs opens the card too, posting nothing yet',
        !!af(r, 'wi-wake') && r.posted.length === before && /Run “Klip kes” with/.test(r.html()));
    ok('the wake picker starts at the last run\'s choice', af(r, 'wi-wake').value === 'smart');
    ok('…and says so first on its tooltip (MIRROR)', /title="Smart — the last run/.test(r.html()));
    r.query('[data-afact="submit"]')[0].click();
    const m = r.last();
    ok('‼️ Run with these posts the run with its wake', m && m.type === 'plan' && m.act === 'run' && m.kind === 'workflow'
        && m.id === 'w9' && m.wake === 'smart' && JSON.stringify(m.inputs) === '{}');
    ok('…and the card closes', !af(r, 'wi-wake'));
}
{
    const r = start();
    r.query('[data-plan="run"][data-kind="workflow"]')[0].click();
    ok('run on a workflow with inputs still opens the card, its boxes at the last run\'s values',
        af(r, 'wi-run.clip').value === 'D:/in/2026-09-24_tanitim.mp4' && af(r, 'wi-run.size').value === 'short');
    r.query('[data-afact="cancel"]')[0].click();
    ok('✕ / Cancel closes it without running', !af(r, 'wi-run.clip') && r.posted.every(m => !(m.type === 'plan' && m.act === 'run')));
}
{
    const r = start();
    r.query('[data-plan="run"][data-kind="workflow"]')[0].click();
    const el = af(r, 'wi-run.clip');
    el.value = 'D:/in/b.mp4';
    el.fire('input');
    r.query('[data-afact="submit"]')[0].click();
    const m = r.last();
    ok('a typed value is posted; the workflow\'s wake is said as empty', m && m.inputs.clip === 'D:/in/b.mp4' && m.wake === '');
}

console.log('== the host ==');
{
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    ok('‼️ a Run with… run remembers its wake choice on the workflow, and forgets it when the run took the workflow\'s',
        /case 'workflow:run':[\s\S]{0,900}if \(typeof msg\.wake === 'string' && msg\.wake\) \{ w\.lastWake = msg\.wake; \} else \{ delete w\.lastWake; \}/.test(panel));
    ok('the plan row carries it to the card', /lastWake: w\.lastWake \?\? ''/.test(panel));
    const flex = fs.readFileSync(path.join(ROOT, 'media', 'afFlex.js'), 'utf8');
    ok('the registry names the card as the run-level surface of both points',
        /run: \{ surface: 'media\/afRunWith\.js#wi-wake'/.test(flex) && /run: \{ surface: 'media\/afRunWith\.js#wi-run'/.test(flex));
    const baseTs = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('every page loads the card', /'afRunWith\.js'/.test(baseTs) && /src="\$\{runWith\}"/.test(baseTs));
}

console.log(`\ntest_run_with.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
