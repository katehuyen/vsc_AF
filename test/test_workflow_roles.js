// M-53 — a step can name a ROLE instead of an agent; the workflow fills it, else the showrunner (src/core/workflowRoles.ts).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(), createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } }) }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const R = require(path.join(ROOT, 'out/core/workflowRoles.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const AG = [{ id: 'a1', name: 'youtuber' }, { id: 'a2', name: 'yazar' }, { id: 'a3', name: 'developer' }];

/* ---------- the core ---------- */
eq('role names: plain ones pass', ['senarist', 'prompt-2', 'kurgu'].map(R.roleKeyRefusal), ['', '', '']);
ok('a role name that is not one is refused, saying what one is', /lower-case letters/.test(R.roleKeyRefusal('Senarist')) && /lower-case/.test(R.roleKeyRefusal('')));
ok('a step kind or the showrunner is not a role', /step kind/.test(R.roleKeyRefusal('media')) && /showrunner/.test(R.roleKeyRefusal('showrunner')));
eq('roles saved without blanks; nothing = undefined', [R.cleanRoles({ senarist: ' yazar ', kurgu: '' }), R.cleanRoles({ a: '' }), R.cleanRoles('x')], [{ senarist: 'yazar' }, undefined, undefined]);
eq('roles refused by name', [R.rolesRefusal({ senarist: 'yazar' }, AG), R.rolesRefusal(undefined, AG)], ['', '']);
ok('…an agent that does not exist', /role "senarist": there is no agent "hayalet"/.test(R.rolesRefusal({ senarist: 'hayalet' }, AG)));
ok('…a role that is not one, and a list instead of an object', /not a role name/.test(R.rolesRefusal({ 'Kurgu Ekibi': 'yazar' }, AG)) && /roles is an object/.test(R.rolesRefusal(['yazar'], AG)));
const f1 = R.fillRole('senarist', { workflow: { senarist: 'yazar' }, showrunner: 'youtuber', agents: AG });
ok('‼️ the workflow\'s own binding fills the role, and says so', f1.agent.id === 'a2' && f1.from === 'workflow' && /from this workflow/.test(f1.why));
const f2 = R.fillRole('kurgu', { workflow: { senarist: 'yazar' }, showrunner: 'youtuber', agents: AG });
ok('‼️ an open role goes to the showrunner, with where that came from', f2.agent.id === 'a1' && f2.from === 'showrunner' && /from Farm Settings/.test(f2.why) && /leaves open/.test(f2.why));
const f3 = R.fillRole('kurgu', { agents: AG });
ok('no setting at all: the built-in showrunner youtuber', f3.agent.id === 'a1' && /built-in default/.test(f3.why));
ok('by id too, and a name in any case', R.fillRole('x', { workflow: { x: 'a3' }, agents: AG }).agent.name === 'developer' && R.fillRole('x', { workflow: { x: 'YAZAR' }, agents: AG }).agent.id === 'a2');
const f4 = R.fillRole('kurgu', { showrunner: 'kanal-yoneticisi', agents: AG });
ok('a showrunner that does not exist: no agent, and the error names it', !f4.agent && /the showrunner "kanal-yoneticisi", and there is no such agent/.test(f4.error));
eq('the roles the steps name, first appearance first', R.stepRoles([{ role: 'kurgu' }, {}, { role: 'senarist' }, { role: 'kurgu' }]), ['kurgu', 'senarist']);
const rep = R.rolesReport({ steps: [{ role: 'senarist' }, { role: 'kurgu' }], roles: { senarist: 'yazar' } }, 'youtuber', AG);
eq('workflows.roles: who fills what', rep.roles.map(r => [r.role, r.agent, r.from]), [['senarist', 'yazar', 'workflow'], ['kurgu', 'youtuber', 'showrunner']]);

/* ---------- the flex point ---------- */
const F = require(path.join(ROOT, 'media/afFlex.js'));
const pt = (F.POINTS || []).find(p => p.id === 'workflow.role');
ok('workflow.role is a flex point: Farm Settings and the workflow form', pt && pt.default === 'youtuber'
    && pt.levels.settings.surface === 'setting:agentFarm.showrunner' && pt.levels.workflow.surface === 'media/afRoles.js#wf-roles' && pt.levels.workflow.bridge === 'workflows.add:roles');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const setting = [].concat(pkg.contributes.configuration).map(c => (c.properties || {})['agentFarm.showrunner']).find(Boolean);
ok('the setting exists with the same default', setting && setting.default === pt.default);

/* ---------- the step card and the save ---------- */
const P = require(path.join(ROOT, 'out/panels/tasksPanel.js'));
const card = extra => P.stepFromDraft(Object.assign({ stype: 'agent', title: 'Senaryo', agent: 'developer', prompt: 'p' }, extra), AG, 1);
const c1 = card({ role: 'senarist' }).step;
eq('a card with a role: the step names the role, no agent', [c1.role, c1.agentId, c1.agentName], ['senarist', '', 'senarist']);
eq('a card with no role runs its agent', [card({ role: '' }).step.agentId, card({}).step.role], ['a3', undefined]);
ok('a role that is not one is refused on the card', /not a role name/.test(card({ role: 'Kötü Rol' }).error || ''));
ok('a role is kept only where an agent runs', P.stepFromDraft({ stype: 'approval', title: 'Onay', role: 'senarist', apMsg: 'ok' }, AG, 1).step.role === undefined);

/* ---------- the page ---------- */
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media/afRoles.js'), 'utf8'), box);
const AR = box.window.AFRoles;
const C = { esc: s => String(s).replace(/"/g, '&quot;'), option: (v, l, o) => `<option value="${v}"${o && o.selected ? ' selected' : ''}>${l}</option>` };
const comp = { steps: [{ role: 'senarist' }, { role: 'kurgu' }, {}], roles: { senarist: 'yazar' } };
const html = AR.workflowBox(comp, ['youtuber', 'yazar'], 'youtuber', C);
ok('‼️ the Roles box: one picker per role, its binding selected, the open one on the showrunner', /id="nt-wf-roles"/.test(html)
    && /id="nt-wf-role-senarist"><option value="">youtuber — showrunner<\/option><option value="youtuber">youtuber<\/option><option value="yazar" selected>/.test(html)
    && /id="nt-wf-role-kurgu"><option value="" selected>youtuber — showrunner/.test(html));
ok('…its hover opens with the value it holds', /title="yazar\n\nThis workflow gives role senarist to yazar/.test(html) && /title="youtuber\n\nNobody is named here/.test(html));
ok('no role on any step: the box says how to get one', /No step names a role/.test(AR.workflowBox({ steps: [{}] }, [], 'youtuber', C)));
ok('a binding to an agent that is gone stays visible, marked', /⚠ eski/.test(AR.workflowBox({ steps: [{ role: 'kurgu' }], roles: { kurgu: 'eski' } }, ['youtuber'], 'youtuber', C)));
const handlers = {};
AR.wireWf((id, ev, fn) => { handlers[id] = fn; }, () => comp);
handlers['nt-wf-role-kurgu']({ target: { value: 'yazar' } });
handlers['nt-wf-role-senarist']({ target: { value: '' } });
eq('picking writes the binding; the showrunner line clears it', comp.roles, { kurgu: 'yazar' });
ok('the step card has a Role box on agent and browser steps only', /id="nt-st-role"/.test(AR.stepField({ stype: 'agent', role: 'kurgu' }, comp, C))
    && /id="nt-st-role"/.test(AR.stepField({ stype: 'browser' }, comp, C)) && AR.stepField({ stype: 'media' }, comp, C) === '');
const st = { stype: 'agent' };
let redrawn = 0;
AR.wireStep((id, ev, fn) => { handlers[id] = fn; }, () => st, () => { redrawn++; });
handlers['nt-st-role']({ target: { value: ' kurgu ' } });
ok('typing a role writes it and redraws, so the Roles box shows it', st.role === 'kurgu' && redrawn === 1);

/* ---------- part 2: this run's own agent per role ---------- */
const fr = R.fillRole('kurgu', { run: { kurgu: 'developer' }, workflow: { kurgu: 'yazar' }, showrunner: 'youtuber', agents: AG });
ok('‼️ this run\'s agent beats the workflow\'s and the showrunner, and says so', fr.agent.id === 'a3' && fr.from === 'run' && /set for this run/.test(fr.why));
ok('…a run agent that is gone is named as this run\'s', /goes to this run's "yok"/.test(R.fillRole('kurgu', { run: { kurgu: 'yok' }, agents: AG }).error));
ok('workflow.role has a run level on the Run card and workflows.run', pt.levels.run && pt.levels.run.surface === 'media/afRoles.js#wi-roles' && pt.levels.run.bridge === 'workflows.run:roles');
const sels = [];
const Fm = { sel: (id, label, opts, v, o) => { sels.push({ id, label, opts, v, o }); return `<sel ${id}>`; } };
const slots = { roleSlots: [{ role: 'senarist', agent: 'yazar', from: 'workflow' }, { role: 'kurgu', agent: 'youtuber', from: 'showrunner' }] };
AR.runBoxes(slots, { roles: { kurgu: 'developer' } }, ['youtuber', 'yazar', 'developer'], Fm);
ok('‼️ the Run card: a box per role, its first line the agent it will get and whose', sels.length === 2 && sels[0].id === 'wi-roles.senarist'
    && sels[0].opts[0].label === 'yazar — the workflow\'s' && sels[1].opts[0].label === 'youtuber — the showrunner' && sels[1].v === 'developer' && /^developer — this run/.test(sels[1].o.tip));
ok('no role on any step: no boxes', AR.runBoxes({}, {}, [], Fm) === '');
const draft = { roles: {} };
AR.applyRun(slots, draft, { 'wi-roles.kurgu': 'developer', 'wi-roles.senarist': '' });
eq('the Run card writes this run\'s roles; the first line clears one', draft.roles, { kurgu: 'developer' });
const read2 = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const rw = read2('media/afRunWith.js'), tpage = read2('media/tasksPage.js'), tpanel = read2('src/panels/tasksPanel.ts'), extsrc = read2('src/extension.ts');
ok('the Run card draws and reads the role boxes', /AFRoles\.runBoxes\(p, run, agents, F\(\)\)/.test(rw) && /AFRoles\.applyRun\(p, run, values\)/.test(rw) && /DATA\.scenes, DATA\.agents[,)]/.test(tpage));
ok('the run is sent its roles, refused by name, and started with them', /roles: wiRun\.roles \|\| \{\}/.test(tpage) && /rolesRefusal\(msg\.roles, this\.deps\.getAgents\(\)\)/.test(tpanel)
    && /roleSlots: rolesReport\(w, deps\.showrunner/.test(tpanel));
eq('a role step in the list reads as the role and who fills it', [AR.who('senarist', { roles: { senarist: 'yazar' } }, 'youtuber'), AR.who('kurgu', null, '')], ['senarist → yazar', 'kurgu → youtuber']);
ok('…the step list uses it for agent and browser steps', /const agentOf = none => \(s\.role && window\.AFRoles \? window\.AFRoles\.who\(s\.role, composer, DATA\.showrunner\)/.test(tpage)
    && /s\.stype === 'browser' \? agentOf\('\?'\)/.test(tpage) && /: agentOf\('\(no agent\)'\) \+ ' · '/.test(tpage));
ok('workflows.run takes roles=, refused by name', /const runRolesNo = rolesRefusal\(args\.roles, agents\)/.test(extsrc) && /roles\? \(M-53 — this run only/.test(extsrc));

/* ---------- the wiring ---------- */
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const page = src('media/tasksPage.js'), ext = src('src/extension.ts'), base = src('src/panels/base.ts'), tp = src('src/panels/tasksPanel.ts');
ok('the page draws and wires both boxes', /AFRoles\.workflowBox\(c, DATA\.agents, DATA\.showrunner, C\)/.test(page) && /AFRoles\.stepField\(s, c, C\)/.test(page)
    && /AFRoles\.wireWf\(byId/.test(page) && /AFRoles\.wireStep\(byId, \(\) => composer\.step, render\)/.test(page));
ok('every page loads afRoles.js, and the render harness too', /'afRoles\.js'/.test(base) && /src="\$\{roles\}"/.test(base) && /'afRoles\.js'/.test(src('test/lib_shared_media.js')));
ok('the save refuses a bad binding and keeps the roles', /rolesRefusal\(item\.roles, this\.deps\.getAgents\(\)\)/.test(tp) && /existing\.roles = roles/.test(tp) && /made\.roles = roles/.test(tp) && /roles: w\.roles \?\? \{\}/.test(tp));
ok('the bridge: steps[].role, roles= on add and update, and workflows.roles through rolesReport', /const role = raw\.role === undefined/.test(ext)
    && (ext.match(/const rolesNo = rolesRefusal\(args\.roles, agents\)/g) || []).length === 2 && /op: 'workflows\.roles'[\s\S]{0,900}rolesReport\(w, cfg\(\)\.get<string>\('showrunner', 'youtuber'\), agents\)/.test(ext));
ok('the task manager is handed the showrunner', /showrunner: \(\) => cfg\(\)\.get<string>\('showrunner', 'youtuber'\)/.test(ext));

/* ---------- the runtime: a role step runs as whoever fills it ---------- */
(async () => {
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-roles-'));
    const agents = AG.map(a => ({ ...a, path: path.join(tmp, a.name), cwd: path.join(tmp, a.name) }));
    agents.forEach(a => fs.mkdirSync(a.path, { recursive: true }));
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => agents, () => false, () => '', { quotaCheck: () => 'hold', showrunner: () => 'youtuber' });
    const settle = () => new Promise(r => setTimeout(r, 30));
    try {
        const w = mgr.addWorkflow('Kısa video', [{ agentId: '', agentName: 'senarist', role: 'senarist', title: 'Senaryo', prompt: 'yaz', mode: 'headless' }]);
        const run1 = mgr.runWorkflow(w);
        await settle();
        const t1 = mgr.tasks.find(t => t.workflowRunId === run1);
        ok('‼️ an open role runs as the showrunner', t1 && t1.agentId === 'a1');
        w.roles = { senarist: 'yazar' };
        const run2 = mgr.runWorkflow(w);
        await settle();
        const t2 = mgr.tasks.find(t => t.workflowRunId === run2);
        ok('‼️ the workflow\'s binding runs it as that agent', t2 && t2.agentId === 'a2');
        const run2b = mgr.runWorkflow(w, { roles: { senarist: 'developer' } });
        await settle();
        const t2b = mgr.tasks.find(t => t.workflowRunId === run2b);
        ok('‼️ a run started with its own roles runs as that agent, over the workflow\'s', t2b && t2b.agentId === 'a3');
        w.roles = { senarist: 'gitti' };
        const run3 = mgr.runWorkflow(w);
        await settle();
        const st3 = mgr.workflowRunState(run3);
        ok('a binding to an agent that is gone ends the run, naming the role and the agent', !mgr.tasks.some(t => t.workflowRunId === run3)
            && st3 && st3.status === 'failed' && /role "senarist" goes to this workflow's "gitti", and there is no such agent/.test(st3.reason || ''));
    } finally {
        mgr.dispose();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
