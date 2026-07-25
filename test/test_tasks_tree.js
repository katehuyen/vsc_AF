// Tasks sidebar tree (compiled views/tasksTree.js). The sidebar is a NAVIGATOR:
// it must teach the same model as the Tasks page (PLAN / NOW / RECENT), never
// hide a feature because it happens to be empty, and never unfold into a wall
// of finished history with nothing to do about it.
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- minimal vscode stub (the tree only touches TreeItem/ThemeIcon/Emitter) --
class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } }
class ThemeColor { constructor(id) { this.id = id; } }
class TreeItem {
    constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; }
}
const vscodeStub = {
    TreeItem,
    ThemeIcon,
    ThemeColor,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } }
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') { return 'vscode'; }
    return origResolve.call(this, request, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const { TasksTreeProvider } = require(path.join(__dirname, '..', 'out', 'views', 'tasksTree.js'));

const NOW = Date.now();
function manager(over) {
    return Object.assign({
        schedules: [], triggers: [], workflows: [], templates: [], tasks: [],
        onDidChange: () => ({ dispose() { } })
    }, over);
}
const kinds = (nodes) => nodes.map(n => n.kind);
const tree = (m, opts) => new TasksTreeProvider(m, opts && opts.trig, opts && opts.stat, opts && opts.runner);
const childrenOf = (t, kind) => t.getChildren({ kind });

// ---------- the three roots are ALWAYS there ----------
{
    const t = tree(manager());
    const roots = t.getChildren();
    ok('an empty farm still shows all three roots',
        JSON.stringify(kinds(roots)) === JSON.stringify(['plan-root', 'now-root', 'recent-root']));

    // the old tree hid a whole section when it had no content, which made the
    // feature behind it look missing (real complaint: "there's no workflow section")
    const withWork = tree(manager({
        schedules: [{ id: 's', title: 'x', agentName: 'a', kind: 'daily', hour: 5, minute: 0, enabled: true, mode: 'headless', prompt: 'p' }]
    }));
    ok('adding content does not add or remove roots',
        JSON.stringify(kinds(withWork.getChildren())) === JSON.stringify(['plan-root', 'now-root', 'recent-root']));

    const follower = tree(manager(), { runner: () => false });
    ok('a follower window is announced above the roots',
        follower.getChildren()[0].kind === 'follower-note');
}

// ---------- empty roots explain themselves ----------
{
    const t = tree(manager());
    const plan = childrenOf(t, 'plan-root');
    ok('an empty Plan offers a way in', plan.length === 1 && plan[0].kind === 'empty');
    ok('the empty Plan row says what to add',
        /add a schedule or a trigger/i.test(t.getTreeItem(plan[0]).label));
    ok('the empty Plan row is clickable', !!t.getTreeItem(plan[0]).command);
    ok('an empty Now says so', /nothing running/i.test(t.getTreeItem(childrenOf(t, 'now-root')[0]).label));
    ok('an empty Recent says so', /no finished runs/i.test(t.getTreeItem(childrenOf(t, 'recent-root')[0]).label));
}

// ---------- PLAN holds every kind of definition, in one list ----------
{
    const m = manager({
        schedules: [
            { id: 's1', title: 'batch', agentName: 'manager', kind: 'daily', hour: 5, minute: 0, enabled: true, mode: 'headless', prompt: 'p', model: 'opus', fireIf: { kind: 'folderHasFiles', path: '/x' } },
            { id: 's2', title: 'scan', agentName: 'manager', kind: 'daily', hour: 6, minute: 0, enabled: false, mode: 'headless', prompt: 'p' }
        ],
        triggers: [{ id: 't1', title: 'watcher', type: 'watch', watchPath: '/w', enabled: true, debounceSec: 10, cooldownSec: 60, maxPerHour: 6, action: { kind: 'task', agentId: 'a', agentName: 'genel', title: 'w', prompt: 'p', mode: 'headless' } }],
        workflows: [{ id: 'w1', title: 'chain', steps: [{ agentName: 'genel', title: 'one', mode: 'headless' }] }],
        templates: [{ id: 'p1', title: 'tpl', agentName: 'basit', mode: 'headless', prompt: 'p' }]
    });
    const t = tree(m, { trig: { isArmed: () => true } });
    const plan = childrenOf(t, 'plan-root');
    ok('all four definition kinds live under one Plan root', plan.length === 5
        && new Set(kinds(plan)).size === 4);
    ok('schedules come first, then triggers, then workflows, then templates',
        JSON.stringify(kinds(plan)) === JSON.stringify(['schedule', 'schedule', 'trigger', 'workflow', 'template']));
    ok('enabled schedules sort by time of day', plan[0].schedule.id === 's1');

    // contextValues are the contract with every right-click menu — unchanged
    ok('schedule contextValue still distinguishes on/off',
        t.getTreeItem(plan[0]).contextValue === 'schedule-on'
        && t.getTreeItem(plan[1]).contextValue === 'schedule-off');
    ok('trigger contextValue unchanged', t.getTreeItem(plan[2]).contextValue === 'trigger');
    ok('workflow contextValue unchanged', t.getTreeItem(plan[3]).contextValue === 'workflow');
    ok('template contextValue unchanged', t.getTreeItem(plan[4]).contextValue === 'template');

    // what a row tells you at a glance
    const s1 = t.getTreeItem(plan[0]);
    ok('a schedule row shows agent, time and model', /manager.*daily 05:00.*opus/.test(s1.description));
    ok('a guarded schedule does NOT say "no guard"', !/no guard/.test(s1.description));
    const s2 = t.getTreeItem(plan[1]);
    ok('a disabled schedule says off', /off/.test(s2.description));
    // A switched-off automation costs nothing, so it is NOT nagged about a
    // missing guard — only live ones are.
    ok('a disabled schedule is not nagged about its guard', !/no guard/.test(s2.description));
    ok('the tooltip names the kind in words', /SCHEDULE/.test(s1.tooltip));
    ok('the tooltip spells out the precondition', /runs only if:/.test(s1.tooltip));
    ok('an unguarded tooltip says what that costs', /whether or not there is work/.test(s2.tooltip));

    const liveUnguarded = tree(manager({
        schedules: [{ id: 'u1', title: 'u', agentName: 'a', kind: 'daily', hour: 9, minute: 0, enabled: true, mode: 'headless', prompt: 'p' }]
    }));
    ok('an ENABLED unguarded schedule is flagged on the row',
        /no guard/.test(liveUnguarded.getTreeItem(childrenOf(liveUnguarded, 'plan-root')[0]).description));

    const wf = t.getTreeItem(plan[3]);
    ok('a workflow says it is manual', /manual/.test(wf.description));
    ok('a template says it is manual', /manual/.test(t.getTreeItem(plan[4]).description));
    ok('a workflow node expands to its steps',
        t.getChildren({ kind: 'workflow', workflow: m.workflows[0] }).length === 1);

    const root = t.getTreeItem({ kind: 'plan-root' });
    ok('the Plan root counts what is switched on', /2\/3 on/.test(root.description));
    ok('and counts the manual ones separately', /2 manual/.test(root.description));
}

// ---------- a trigger with a broken watch path is unmissable ----------
{
    const m = manager({
        triggers: [{ id: 't1', title: 'w', type: 'watch', watchPath: '/gone', enabled: true, debounceSec: 1, cooldownSec: 1, maxPerHour: 1, skipCount: 23, lastSkipReason: 'no files waiting', action: { kind: 'task', agentId: 'a', agentName: 'g', title: 'w', prompt: 'p', mode: 'headless' } }]
    });
    const t = tree(m, { trig: { isArmed: () => false } });
    const item = t.getTreeItem(childrenOf(t, 'plan-root')[0]);
    ok('a missing watch path is shouted', /PATH MISSING/.test(item.description));
    ok('suppressed firings are counted on the row', /23 skipped/.test(item.description));
    ok('the last skip reason is in the tooltip', /no files waiting/.test(item.tooltip));
}

// ---------- NOW = what needs you; RECENT = capped evidence ----------
{
    const task = (id, status, when) => ({
        id, title: 't' + id, agentId: 'a1', agentName: 'manager', mode: 'headless',
        status, prompt: 'p', createdAt: when, endedAt: status === 'running' || status === 'queued' ? undefined : when
    });
    const many = [];
    for (let i = 0; i < 40; i++) { many.push(task('d' + i, 'done', NOW - i * 60000)); }
    const m = manager({
        tasks: [
            task('q1', 'queued', NOW - 1000),
            task('r1', 'running', NOW - 2000),
            task('f1', 'failed', NOW - 500),
            ...many
        ]
    });
    const t = tree(m);

    const now = childrenOf(t, 'now-root');
    ok('Now holds only live work', now.length === 2);
    ok('running comes before queued', now[0].task.status === 'running' && now[1].task.status === 'queued');
    ok('no finished task leaks into Now', !now.some(n => n.task.status === 'done'));

    const recent = childrenOf(t, 'recent-root');
    ok('Recent is capped, not a wall of history', recent.length === 12);
    ok('Recent is newest-first', recent.every((n, i) =>
        i === 0 || (recent[i - 1].task.endedAt ?? 0) >= (n.task.endedAt ?? 0)));
    ok('40+ finished runs do not all land in the sidebar',
        m.tasks.filter(x => x.status === 'done').length === 40 && recent.length === 12);
    ok('no live task leaks into Recent',
        !recent.some(n => n.task.status === 'running' || n.task.status === 'queued'));

    const rootNow = t.getTreeItem({ kind: 'now-root' });
    ok('the Now root counts running and queued', /1 running · 1 queued/.test(rootNow.description));
    ok('the Now root explains what a task IS', /A TASK is one execution/.test(rootNow.tooltip));
    const rootRecent = t.getTreeItem({ kind: 'recent-root' });
    ok('the Recent root flags failures', /1 failed/.test(rootRecent.description));
    ok('the Recent root points at the full history', /Tasks page/.test(rootRecent.tooltip));

    // task rows keep their menu contract and gain provenance
    const item = t.getTreeItem(recent[0]);
    ok('a failed task keeps its final contextValue', item.contextValue === 'task-final');
    ok('the task tooltip says it is one run', /TASK \(one run\)/.test(item.tooltip));
    ok('the task tooltip says what started it', /started by: you/.test(item.tooltip));
    ok('the task row leads with its agent', /^manager/.test(item.description));

    const live = t.getTreeItem(now[0]);
    ok('a running task still opens its terminal on click',
        live.command && live.command.command === 'agentfarm.revealTaskTerminal');
    ok('a queued task keeps its queued contextValue', t.getTreeItem(now[1]).contextValue === 'task-queued');
}

// ---------- provenance is read from the task, not guessed ----------
{
    const base = { id: 'x', title: 'x', agentId: 'a', agentName: 'm', mode: 'headless', status: 'done', prompt: 'p', createdAt: NOW, endedAt: NOW };
    const t = tree(manager({ tasks: [Object.assign({}, base, { fromSchedule: 's1' })] }));
    ok('a scheduled run says so', /started by: schedule/.test(
        t.getTreeItem(childrenOf(t, 'recent-root')[0]).tooltip));
    const t2 = tree(manager({ tasks: [Object.assign({}, base, { fromTrigger: 't1' })] }));
    ok('a triggered run says so', /started by: trigger/.test(
        t2.getTreeItem(childrenOf(t2, 'recent-root')[0]).tooltip));
    const t3 = tree(manager({ tasks: [Object.assign({}, base, { workflowId: 'w1', stepIndex: 0 })] }));
    ok('a workflow step says so', /started by: workflow/.test(
        t3.getTreeItem(childrenOf(t3, 'recent-root')[0]).tooltip));
    ok('and it keeps the resume-chain contextValue',
        t3.getTreeItem(childrenOf(t3, 'recent-root')[0]).contextValue === 'task-final-workflow');
}

console.log(`test_tasks_tree: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
