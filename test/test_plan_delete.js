// M-33 — DELETING A PLAN ROW: ONE DOOR, AND A WAY BACK.
//
// ‼️ WHY THIS FILE EXISTS. The Plan tab let a reader tick rows and then offered
// them two buttons that only switched things on and off — the one act that
// applies to all four kinds, delete, was not there at all, and the two kinds
// that have no switch (a workflow, a template) could not even be ticked. The
// row ✕ existed but answered for itself four different ways: two kinds asked a
// modal question in the panel, two handed the press to a command that asked its
// own. So there was no single delete a bulk act could be built out of.
//
// What replaced it is one core call, `deletePlanRows`, with the four named
// deletes as names for it — and the thing that makes the un-asked ✕ safe is
// that the call REMEMBERS what it took and where from. That is what is pinned
// here: an undo that hands the object back with its own id. A restore that
// re-created the row from its title would give a workflow a new id and leave
// every trigger aimed at it pointing at nothing — a delete that silently
// breaks two other rows is worse than the modal it replaced.
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
    Disposable: { from: () => ({ dispose() { } }) },
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

const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-plandel-'));
const agentDir = path.join(tmp, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
const agents = () => [{ id: 'a1', name: 'dev', dir: agentDir }];

function fresh() {
    const dir = fs.mkdtempSync(path.join(tmp, 'w-'));
    const storage = path.join(dir, 'farm-tasks.json');
    const mgr = new TaskManager(storage, agents, () => true, () => '', {});
    mgr.schedules = [
        { id: 's1', title: 'nightly scan', agentId: 'a1', prompt: 'p', kind: 'daily', time: '05:00', enabled: true },
        { id: 's2', title: 'weekly roll-up', agentId: 'a1', prompt: 'p', kind: 'daily', time: '06:00', enabled: false },
        { id: 's3', title: 'hourly poke', agentId: 'a1', prompt: 'p', kind: 'daily', time: '07:00', enabled: true }
    ];
    mgr.triggers = [
        { id: 't1', title: 'inbox watch', enabled: true, action: { kind: 'workflow', workflowId: 'w1' } }
    ];
    mgr.workflows = [
        { id: 'w1', title: 'publish pipeline', steps: [{ agentId: 'a1', title: 'one', prompt: 'p' }] },
        { id: 'w2', title: 'review pipeline', steps: [{ agentId: 'a1', title: 'one', prompt: 'p' }] }
    ];
    mgr.templates = [
        { id: 'p1', title: 'triage inbox', agentId: 'a1', prompt: 'p' }
    ];
    return { mgr, storage };
}

// ---------- one door: it takes what was asked for, and says what it took ----
{
    const { mgr } = fresh();
    const gone = mgr.deletePlanRows([{ kind: 'schedule', id: 's2' }, { kind: 'workflow', id: 'w1' }]);
    ok('it deletes across kinds in one call', gone.length === 2
        && mgr.schedules.length === 2 && mgr.workflows.length === 1);
    ok('…and reports each row by kind and title',
        gone.some(g => g.kind === 'schedule' && g.title === 'weekly roll-up')
        && gone.some(g => g.kind === 'workflow' && g.title === 'publish pipeline'));
    ok('…and records the PLACE each came from, not just that it went',
        gone.find(g => g.kind === 'schedule').at === 1
        && gone.find(g => g.kind === 'workflow').at === 0);
    ok('the rows that were not named are untouched',
        mgr.schedules.map(s => s.id).join() === 's1,s3'
        && mgr.workflows[0].id === 'w2' && mgr.templates.length === 1);
}

// ---------- an id that is not there is silence, not a throw ----------
{
    const { mgr } = fresh();
    const gone = mgr.deletePlanRows([
        { kind: 'schedule', id: 'nope' },
        { kind: 'sideways', id: 's1' },
        { kind: 'template', id: 'p1' }
    ]);
    // ‼️ The bulk act sends the selection the PAGE was holding, and a definition
    // can go between the tick and the press (another window, an agent, a
    // schedule that deleted itself). One stale key must not cost the reader the
    // rows that really are there.
    ok('an unknown id and an unknown kind are skipped, the real one still goes',
        gone.length === 1 && gone[0].kind === 'template' && mgr.templates.length === 0);
    ok('…and the schedule an unknown KIND named is not taken by accident',
        mgr.schedules.length === 3);
}

// ---------- the undo: the object itself, in its own place ----------
{
    const { mgr } = fresh();
    const w1 = mgr.workflows[0];
    const gone = mgr.deletePlanRows([{ kind: 'workflow', id: 'w1' }, { kind: 'schedule', id: 's1' }]);
    const back = mgr.restorePlanRows(gone);
    ok('undo puts back everything it took', back === 2
        && mgr.workflows.length === 2 && mgr.schedules.length === 3);
    // ‼️ THE WHOLE REASON THE UNDO IS A RESTORE AND NOT A RE-CREATION.
    ok('…the SAME object, with its own id, so what pointed at it still does',
        mgr.workflows[0] === w1 && mgr.workflows[0].id === 'w1'
        && mgr.triggers[0].action.workflowId === 'w1');
    ok('…and in the place it was taken from, not appended to the end',
        mgr.schedules.map(s => s.id).join() === 's1,s2,s3'
        && mgr.workflows.map(w => w.id).join() === 'w1,w2');
}

{
    const { mgr } = fresh();
    const gone = mgr.deletePlanRows([{ kind: 'schedule', id: 's3' }]);
    mgr.restorePlanRows(gone);
    ok('undoing twice does not double the row', mgr.restorePlanRows(gone) === 0
        && mgr.schedules.filter(s => s.id === 's3').length === 1);
}

{
    const { mgr } = fresh();
    const gone = mgr.deletePlanRows([{ kind: 'schedule', id: 's1' }]);
    // The list shrank while the row was out; the index it remembers is past the
    // end now. It goes back at the end rather than nowhere.
    mgr.schedules.length = 0;
    ok('an index the list has outgrown lands at the end, not off it',
        mgr.restorePlanRows(gone) === 1 && mgr.schedules[0].id === 's1');
}

// ---------- the four named deletes are names for the one call ----------
{
    const { mgr } = fresh();
    mgr.deleteSchedule(mgr.schedules[0]);
    mgr.deleteTrigger(mgr.triggers[0]);
    mgr.deleteWorkflow(mgr.workflows[0]);
    mgr.deleteTemplate(mgr.templates[0]);
    ok('deleteSchedule/Trigger/Workflow/Template still each remove their own row',
        mgr.schedules.length === 2 && mgr.triggers.length === 0
        && mgr.workflows.length === 1 && mgr.templates.length === 0);
    ok('…and take nothing else with them',
        mgr.schedules.map(s => s.id).join() === 's2,s3' && mgr.workflows[0].id === 'w2');
}

// ---------- it is written down ----------
{
    const { mgr, storage } = fresh();
    mgr.deletePlanRows([{ kind: 'schedule', id: 's2' }]);
    const onDisk = JSON.parse(fs.readFileSync(storage, 'utf8'));
    ok('the delete reaches the store', Array.isArray(onDisk.schedules)
        && !onDisk.schedules.some(s => s.id === 's2'));
    mgr.restorePlanRows([{ kind: 'schedule', at: 1, title: 'weekly roll-up', item: { id: 's2', title: 'weekly roll-up' } }]);
    const after = JSON.parse(fs.readFileSync(storage, 'utf8'));
    ok('…and so does the undo', after.schedules.some(s => s.id === 's2'));
    // Nothing matched, nothing changed: no write, and no claim of one.
    ok('a delete that matched nothing writes nothing and reports nothing',
        mgr.deletePlanRows([{ kind: 'schedule', id: 'ghost' }]).length === 0);
}

// ---------- the bridge op says what it refuses ----------
//
// ‼️ `plan.delete` is the bulk delete the page's bar posts, and the one arg
// shape it must NEVER honour is a bare kind: "delete every schedule I have" is
// not a call anybody makes on purpose. The describe is what an agent reads
// before calling, so the refusal is stated there as well as enforced.
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const at = src.indexOf("op: 'plan.delete'");
    const decl = at < 0 ? '' : src.slice(at, at + 3000);
    ok('plan.delete is registered on the bridge', at > 0);
    ok('…and goes through the one core call rather than four of its own',
        /taskManager\.deletePlanRows\(/.test(decl));
    ok('…and refuses a bare kind in the code',
        /need\(titles \|\| tag,/.test(decl));
    ok('…and says so in the describe an agent reads first',
        /bare kind[\s\S]{0,80}REFUSED/.test(decl));
    ok('…and repaints the surfaces that were showing the rows',
        /TasksPanel\.refreshIfOpen\(\)/.test(decl));
}

// ---------- the page's ✕ does not ask, and the bar does ----------
{
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    const at = panel.indexOf('private deletePlan(');
    const body = at < 0 ? '' : panel.slice(at, at + 1600);
    ok('the panel has one delete for all four kinds', at > 0);
    // ‼️ The user's words: the row ✕ deletes straight away. A confirm here would
    // put back the modal the whole item exists to remove — and the character
    // window is wide enough to survive a comment being added above it.
    ok('…and it does NOT confirm — the row ✕ is the un-asked delete',
        !/this\.confirm\(/.test(body));
    ok('…it offers an Undo instead, which is what makes that safe',
        /'Undo'/.test(body) && /restorePlanRows\(/.test(body));
    const four = ["case 'schedule:delete': this.deletePlan(", "case 'trigger:delete': this.deletePlan(",
        "case 'workflow:delete': this.deletePlan(", "case 'template:delete': this.deletePlan("];
    ok('…and all four row buttons go through it',
        four.every(s => panel.includes(s)));
    // The other way round on purpose: many rows, one press, no row left to
    // point at afterwards — so the count is said BEFORE anything goes.
    const bulkAt = panel.indexOf("if (msg.act === 'delete')");
    const bulk = bulkAt < 0 ? '' : panel.slice(bulkAt, bulkAt + 1400);
    ok('the BULK delete asks first', /await this\.confirm\(/.test(bulk));
    ok('…and says how many, broken down by kind, not just "some items"',
        /live\.length/.test(bulk) && /tally\.join/.test(bulk));
    ok('…and counts only rows that are still there',
        /rows\.filter\(r => this\.planNode\(/.test(bulk));
}

Module._load = origLoad;
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
