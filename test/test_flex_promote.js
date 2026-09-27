// U-151 3b — '↑ MAKE DEFAULT' / '↺ BACK TO INHERITED' beside a flex box.
//
// Pinned three ways: the shared control (media/afFlexPromote.js), the supervisor
// row that draws it only beside a box holding its own value, and the real task
// form in the page shim — ↑ opens the strip, a level posts `flexPromote` with the
// value in the point's own type, the host's `flexPromoted` empties the box, and ↺
// empties it without writing anything. The host side goes through flex.set's cores.
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const { runPage } = require('./lib_page_dom');
const fixture = require('./fixtures/tasks');

console.log('== the control ==');
const sandbox = { window: {} };
for (const f of ['afRecipes.js', 'afFlex.js', 'afFlexForms.js', 'afFlexPromote.js', 'afSupervisor.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8'), sandbox);
}
const P = sandbox.window.AFFlexPromote;
{
    const lv = P.levelsFor('developer', { id: 'prj_1', name: 'AgentFarm' });
    ok('most specific first: project, agent, everywhere', lv.map(l => l.level).join() === 'project,agent,settings'
        && lv[0].target === 'prj_1' && lv[1].target === 'developer' && lv[2].target === '');
    ok('no agent and no project: only everywhere', P.levelsFor('', null).map(l => l.level).join() === 'settings');
    ok('‼️ a box that inherits draws no ↑ (DENSITY)', P.button('retry.supervisor.model', '', false) === ''
        && P.button('retry.supervisor.model', '  ', false) === '');
    ok('a box with its own value does', /data-flexup="retry\.supervisor\.model"/.test(P.button('retry.supervisor.model', 'sonnet', false)));
    const st = P.strip('retry.supervisor.model', 'Supervisor model', 'sonnet', lv);
    ok('the strip offers every level and the way back',
        (st.match(/data-flexup-to=/g) || []).length === 3 && /data-flexup-back=/.test(st) && /this agent · developer/.test(st));
    ok('the value goes in the point\'s own type', P.typed('retry.supervisor.maxCalls', '3') === 3
        && P.typed('retry.supervisor.model', ' sonnet ') === 'sonnet');
}

console.log('== the supervisor row ==');
{
    const C = { esc: s => String(s), option: (v, l) => `<option value="${v}">${l}</option>` };
    const S = sandbox.window.AFSupervisor;
    const promote = { open: '', levels: P.levelsFor('developer', null) };
    const html = S.row({ model: 'sonnet', maxCalls: '' }, [], C, {}, promote);
    ok('↑ beside the box that holds a value, nowhere else',
        (html.match(/data-flexup="/g) || []).length === 1 && /data-flexup="retry\.supervisor\.model"/.test(html));
    ok('no strip until it is opened', !/flexup-strip/.test(html));
    const open = S.row({ model: 'sonnet' }, [], C, {}, Object.assign({}, promote, { open: 'model' }));
    ok('opened: the strip names the box and its value', /flexup-strip/.test(open) && /Supervisor model = <b>sonnet<\/b>/.test(open));
    ok('without the promote argument the row is what it was', !/flexup/.test(S.row({ model: 'sonnet' }, [], C, {})));
}

console.log('== the task form ==');
const variant = fixture.variants().find(v => v.id === 'tasks-retry-supervisor-promote');
const start = () => { const r = runPage(fixture.script, variant.data, fixture.window || {}, variant.state); variant.act(r); return r; };
{
    const r = start();
    ok('↑ pressed: the strip is drawn', /data-flexup-strip="retry\.supervisor\.model"/.test(r.html()));
    const to = r.query('[data-flexup-to]').find(e => e.dataset.level === 'agent');
    to.click();
    const m = r.last();
    ok('‼️ a level posts flexPromote with the point, the level, its target and the value',
        m && m.type === 'flexPromote' && m.point === 'retry.supervisor.model' && m.level === 'agent'
        && m.target === 'developer' && m.value === 'sonnet');
    r.send({ type: 'flexPromoted', point: 'retry.supervisor.model' });
    const box = r.query('#nt-supmodel')[0];
    ok('the host says it is written: the box empties and inherits', box && box.value === '' && !/data-flexup-strip=/.test(r.html()));
}
{
    const r = start();
    const before = r.posted.length;
    r.query('[data-flexup-back]')[0].click();
    ok('↺ back to inherited empties the box and writes nothing',
        r.query('#nt-supmodel')[0].value === '' && r.posted.slice(before).every(m => m.type !== 'flexPromote'));
}

console.log('== the workflow form (library.enrich) ==');
{
    ok('a box names its point through the registry', P.pointAt('media/afLibrary.js#wf-libEnModel') === 'library.enrich.model'
        && P.pointAt('media/nowhere.js#x') === '');
    ok('above a workflow, an enrich point has only everywhere', P.levelsAbove('library.enrich.model', 'workflow', {}).map(l => l.level).join() === 'settings');
    ok('the registry decides the levels: a supervisor point above a run',
        P.levelsAbove('retry.supervisor.model', 'run', { agent: 'developer', project: { id: 'prj_1', name: 'AgentFarm' } }).map(l => l.level).join() === 'project,agent,settings');
    ok('a level the run has no target for is left out', P.levelsAbove('retry.supervisor.model', 'run', {}).map(l => l.level).join() === 'settings');
    const wv = fixture.variants().find(v => v.id === 'tasks-wf-library-promote');
    const r = runPage(fixture.script, wv.data, fixture.window || {}, wv.state);
    wv.act(r);
    const html = r.html();
    ok('an empty box shows its Farm Settings value faint', /placeholder="medium — Farm Settings"/.test(html) && /placeholder="0\.1 — Farm Settings"/.test(html));
    ok('…and an empty select says it too, SHORTHAND', /↳ at the run&#39;s end|↳ at the run's end/.test(html));
    ok('↑ only beside the box this workflow sets', (html.match(/data-flexup="/g) || []).length === 1);
    r.query('[data-flexup-to]').find(e => e.dataset.level === 'settings').click();
    const m = r.last();
    ok('‼️ everywhere posts the enrich point with its value', m && m.type === 'flexPromote' && m.point === 'library.enrich.model'
        && m.level === 'settings' && m.target === '' && m.value === 'opus');
    r.send({ type: 'flexPromoted', point: 'library.enrich.model' });
    ok('written: the workflow\'s box empties', r.query('#nt-wf-libEnModel')[0].value === '' && !/data-flexup-strip=/.test(r.html()));
}

console.log('== the wire ==');
{
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    ok('the panel hands it to the host and answers flexPromoted',
        /case 'flexPromote':[\s\S]{0,200}this\.deps\.flexPromote\(/.test(panel) && /type: 'flexPromoted'/.test(panel));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the host writes through flex.set\'s own cores',
        /flexPromote: async[\s\S]{0,300}setFlexOverride\(flexDeps[\s\S]{0,120}setFlexSetting\(flexDeps/.test(ext));
    ok('a promotion made over the bridge reaches an open task form',
        /affectsConfiguration\('agentFarm\.flexOverrides'\)[\s\S]{0,120}TasksPanel\.refreshIfOpen\(\)/.test(ext));
    const base = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('every page loads the control', /'afFlexPromote\.js'/.test(base) && /src="\$\{flexPromote\}"/.test(base));
    const parity = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity.manifest.json'), 'utf8'));
    const list = parity.entries || parity.capabilities || parity;
    const e = list.find(x => x.capability === 'tasksPanel.ts#flexPromote');
    ok('parity: the page door and flex.set are one capability', !!e && (e.ops || []).indexOf('flex.set') >= 0);
}

console.log(`test_flex_promote.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
