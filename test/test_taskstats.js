// Ad-hoc tests for taskstats + Task health card + Tasks matrix (Agent Farm 2.17.0).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const ROOT = require('path').resolve(__dirname, '..');
const ts = require(path.join(ROOT, 'out/core/taskstats.js'));

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('FAIL  ' + name); }
}

const NOW = Date.now();
const DAY = 24 * 3600 * 1000;
function mk(over) {
    return Object.assign({
        id: Math.random().toString(36).slice(2),
        agentId: 'a1', agentName: 'yazar', title: 'Günlük rapor',
        status: 'done', mode: 'headless',
        createdAt: NOW - DAY, startedAt: NOW - DAY + 1000, endedAt: NOW - DAY + 61000
    }, over);
}

// ---- 1. readTaskHistory: month filter, since filter, corrupt lines, cache ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-taskstats-'));
const mkey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const oldTs = NOW - 90 * DAY, recentTs = NOW - 5 * DAY;
fs.writeFileSync(path.join(dir, `${mkey(oldTs)}.jsonl`),
    JSON.stringify(mk({ id: 'old1', endedAt: oldTs })) + '\n');
fs.writeFileSync(path.join(dir, `${mkey(recentTs)}.jsonl`),
    JSON.stringify(mk({ id: 'rec1', endedAt: recentTs })) + '\n' +
    'NOT JSON AT ALL\n' +
    JSON.stringify({ nope: true }) + '\n' +
    JSON.stringify(mk({ id: 'rec2', status: 'failed', endedAt: recentTs + 1000 })) + '\n');
fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');

let hist = ts.readTaskHistory(dir, NOW - 30 * DAY);
check('history: recent records read, old month + corrupt lines skipped',
    hist.length === 2 && hist.some(t => t.id === 'rec1') && hist.some(t => t.id === 'rec2'));
check('history: missing dir returns []', ts.readTaskHistory(path.join(dir, 'nope'), 0).length === 0);

// cache: append a record, file must be re-read (mtime/size changes)
fs.appendFileSync(path.join(dir, `${mkey(recentTs)}.jsonl`),
    JSON.stringify(mk({ id: 'rec3', endedAt: recentTs + 2000 })) + '\n');
hist = ts.readTaskHistory(dir, NOW - 30 * DAY);
check('history: cache invalidates on append', hist.length === 3 && hist.some(t => t.id === 'rec3'));

// ---- 1b. M-8 (reopened): one id is one run, whatever the file says twice ----
//
// The archive is append-only and the same run reaches it more than once by
// ordinary use — delete → Undo → delete — so every reader behind it (success
// rate, cost, the run counts on the agent pages) was summing copies of one run.
{
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'af-arch-'));
    const m = mkey(recentTs);
    const dup = mk({ id: 'twice', endedAt: recentTs, costUSD: 3 });
    fs.writeFileSync(path.join(d2, `${m}.jsonl`),
        JSON.stringify(dup) + '\n'
        + JSON.stringify(mk({ id: 'once', endedAt: recentTs })) + '\n'
        + JSON.stringify(Object.assign({}, dup, { status: 'failed' })) + '\n');
    const h = ts.readTaskHistory(d2, NOW - 30 * DAY);
    check('‼️ M-8: an id filed twice is ONE run', h.filter(t => t.id === 'twice').length === 1);
    check('‼️ …and the newest line about it is the one kept',
        h.find(t => t.id === 'twice').status === 'failed');
    check('…and the other rows are untouched', h.length === 2);

    // Undo tells the archive too: a tombstone takes the id back out, and a
    // later delete files it again — the LAST word about an id decides.
    fs.appendFileSync(path.join(d2, `${m}.jsonl`),
        JSON.stringify({ id: 'twice', undeleted: NOW }) + '\n');
    const h2 = ts.readTaskHistory(d2, NOW - 30 * DAY);
    check('‼️ M-8: an undone delete leaves the archive',
        h2.length === 1 && !h2.some(t => t.id === 'twice'));
    fs.appendFileSync(path.join(d2, `${m}.jsonl`),
        JSON.stringify(Object.assign({}, dup, { status: 'cancelled' })) + '\n');
    const h3 = ts.readTaskHistory(d2, NOW - 30 * DAY);
    check('‼️ …and deleting it again files it back, once',
        h3.filter(t => t.id === 'twice').length === 1
        && h3.find(t => t.id === 'twice').status === 'cancelled');

    // M-9's reader: the months it holds, and one month read by name.
    check('M-9: the archive names its months', ts.archiveMonths(d2).join(',') === m);
    check('M-9: a month reads with the same dedupe',
        ts.readArchive(d2, [m]).filter(t => t.id === 'twice').length === 1);
    check('M-9: a month nobody filed reads empty', ts.readArchive(d2, ['1999-01']).length === 0);
    check('M-9: months of a missing dir are none',
        ts.archiveMonths(path.join(d2, 'nope')).length === 0);
}

// ---- 2. mergeTaskRecords ----
const merged = ts.mergeTaskRecords(
    [mk({ id: 'x', status: 'running' })],
    [mk({ id: 'x', status: 'done' }), mk({ id: 'y' })]);
check('merge: dedupe by id, live wins',
    merged.length === 2 && merged.find(t => t.id === 'x').status === 'running');

// ---- 3. titleFamily ----
check('family: retry suffix stripped', ts.titleFamily('Rapor (retry 2)') === ts.titleFamily('Rapor'));
check('family: dates/numbers collapse',
    ts.titleFamily('Rapor 2026-07-11 09:00') === ts.titleFamily('Rapor 2026-07-10 18:30'));
check('family: different jobs stay apart', ts.titleFamily('Rapor') !== ts.titleFamily('Tasnif'));

// ---- 4. buildAgentTaskStats ----
const recs = [
    mk({ id: 't1', status: 'done', startedAt: NOW - 2 * DAY, endedAt: NOW - 2 * DAY + 60000 }),
    mk({ id: 't2', status: 'done', startedAt: NOW - 2 * DAY, endedAt: NOW - 2 * DAY + 120000, fromSchedule: 's1' }),
    mk({ id: 't3', status: 'failed', startedAt: NOW - DAY, endedAt: NOW - DAY + 30000, fromTrigger: 'tr1', verified: 'fail', attempt: 1 }),
    mk({ id: 't4', status: 'failed', startedAt: undefined, endedAt: NOW - 3600_000, title: 'Bozuk iş' }),
    mk({ id: 't5', status: 'cancelled', startedAt: undefined, endedAt: NOW - 1800_000 }),
    mk({ id: 't6', status: 'queued', createdAt: NOW }),
    mk({ id: 't7', status: 'running', createdAt: NOW }),
    mk({ id: 'ancient', status: 'failed', endedAt: NOW - 40 * DAY }) // outside 30d window
];
const stats = ts.buildAgentTaskStats(recs, { now: NOW }).get('a1');
check('stats: window counts', stats.total === 5 && stats.done === 2 && stats.failed === 2 && stats.cancelled === 1);
check('stats: success rate done/(done+failed)', stats.successRate === 0.5);
check('stats: median duration', stats.medianDurationMs === 60000);
check('stats: sources', stats.sources.manual === 3 && stats.sources.schedule === 1 && stats.sources.trigger === 1);
check('stats: retry + verify counts', stats.retries === 1 && stats.verifyFail === 1 && stats.verifyPass === 0);
check('stats: live queued/running', stats.queued === 1 && stats.running === 1);
// streak: order by endedAt = ancient(F) t1 t2 t3(F) t4(F) t5(C) → trailing C skipped → 2
check('stats: fail streak skips trailing cancel', stats.failStreak === 2);
check('stats: last failure captured', stats.lastFailure && stats.lastFailure.title === 'Bozuk iş');

// ---- 5. buildTaskFamilies ----
const famRecs = [
    mk({ id: 'f1', title: 'Nöbet turu 2026-07-01', status: 'done', endedAt: NOW - 9 * DAY, fromTrigger: 'tr' }),
    mk({ id: 'f2', title: 'Nöbet turu 2026-07-05', status: 'done', endedAt: NOW - 5 * DAY, fromTrigger: 'tr' }),
    mk({ id: 'f3', title: 'Nöbet turu 2026-07-08', status: 'done', endedAt: NOW - 2 * DAY, agentId: 'a2', agentName: 'editor', fromTrigger: 'tr' }),
    mk({ id: 'f4', title: 'Kırık zincir', status: 'failed', endedAt: NOW - 3 * DAY }),
    mk({ id: 'f5', title: 'Kırık zincir (retry 1)', status: 'failed', endedAt: NOW - 2 * DAY }),
    mk({ id: 'f6', title: 'Kırık zincir', status: 'failed', endedAt: NOW - DAY })
];
const fams = ts.buildTaskFamilies(famRecs, { now: NOW });
check('families: grouped by normalized title', fams.length === 2);
const nobet = fams.find(f => f.title.startsWith('Nöbet'));
const kirik = fams.find(f => f.title === 'Kırık zincir');
check('families: multi-agent row sorts first', fams[0] === nobet);
check('families: cells per agent', nobet.cells.a1.runs === 2 && nobet.cells.a2.runs === 1);
check('families: dominant source', nobet.source === 'trigger' && kirik.source === 'manual');
check('families: alwaysFails on 3 trailing fails', kirik.alwaysFails === true && nobet.alwaysFails === false);
check('families: cell carries agentName', nobet.cells.a2.agentName === 'editor');

// ---- 6. taskAlerts ----
const failHeavy = ts.buildAgentTaskStats([
    mk({ id: 'q1', status: 'done', endedAt: NOW - DAY }),
    mk({ id: 'q2', status: 'failed', endedAt: NOW - DAY }),
    mk({ id: 'q3', status: 'failed', endedAt: NOW - DAY }),
    mk({ id: 'q4', status: 'failed', endedAt: NOW - DAY }),
    mk({ id: 'q5', status: 'failed', endedAt: NOW - DAY })
], { now: NOW });
const alerts = ts.taskAlerts(failHeavy, fams);
check('alerts: fail-heavy agent warning', alerts.some(a => a.agentId === 'a1' && /failing more/.test(a.message)));
check('alerts: always-failing family warning with agent name',
    alerts.some(a => /Kırık zincir/.test(a.message) && a.agentName === 'yazar'));
check('alerts: healthy families stay silent', !alerts.some(a => /Nöbet/.test(a.message)));

// ---- 7. describeAgentTaskStats ----
const d = ts.describeAgentTaskStats(stats);
check('describe: runs + rate + duration', /5 runs/.test(d) && /50% ok/.test(d) && /~60s/.test(d));

// ---- 8. Webview smoke: capabilities.js Tasks grid ----
function makeDom() {
    // every element carries no-op selector queries so the shared sessions-table
    // component (sessionsTable.js) can wire itself against its container stub
    const el = () => ({
        _html: '', listeners: {}, dataset: {},
        set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
        addEventListener(ev, cb) { this.listeners[ev] = cb; },
        querySelector: () => ({ addEventListener() { } }),
        querySelectorAll: () => []
    });
    const app = el();
    const others = {};
    return {
        app,
        document: {
            // 'app' is the page; other ids (e.g. the sessions container) get
            // their own element so the component can't clobber the page html
            getElementById: id => id === 'app' ? app : (others[id] || (others[id] = el())),
            querySelectorAll: () => []
        }
    };
}
function runWebview(file, data) {
    const dom = makeDom();
    const sandbox = {
        window: { __DATA__: data, addEventListener: () => { } },
        document: dom.document,
        acquireVsCodeApi: () => ({ postMessage: () => { } }),
        Date, Math, Object, JSON, console
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media/charts.js'), 'utf8'), sandbox);
    // htmlShell ships the shared components to every page — the list lives in
    // lib_shared_media.js so it cannot go stale one test file at a time.
    vm.runInContext(require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia(), sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media/sessionsTable.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
    return dom.app._html;
}

const capData = {
    generatedAt: NOW,
    agents: [{ id: 'a1', name: 'yazar' }, { id: 'a2', name: 'editor' }],
    skills: [], mcp: [], memory: [], duties: [],
    tasks: fams
};
const capHtml = runWebview('media/capabilities.js', capData);
check('capgrid: Tasks section renders', /<h2>Tasks /.test(capHtml));
check('capgrid: green pill for all-success cell', /pill used[^>]*>2</.test(capHtml.replace(/"/g, '')));
check('capgrid: red pill for all-fail cell', /pill fail/.test(capHtml) && /3✗/.test(capHtml));
check('capgrid: source tag + always-fails dot', /class="tag">trg</.test(capHtml) && /its last runs all failed/.test(capHtml));
check('capgrid: empty-cell dash for uninvolved agent', /no runs on this agent/.test(capHtml));
const capEmpty = runWebview('media/capabilities.js', Object.assign({}, capData, { tasks: [] }));
check('capgrid: empty state message', /No completed task runs/.test(capEmpty));

// ---- 9. Webview smoke: agentDetail.js Task health card ----
const agentData = {
    agent: {
        id: 'a1', name: 'yazar', dir: 'D:/x', active: false,
        contextLoad: { total: 1000, claudeMd: 800, memoryIndex: 200, agentsMd: 0 },
        contextBudget: 8000, permissionSummary: 'none',
        memoryFiles: [], toolFiles: [], duties: [], dutiesPath: ''
    },
    contextHealth: {
        memory: { files: 0, tokens: 0, orphans: 0, notRecalled: 0, stale: 0 },
        skills: { total: 0, unused: 0 },
        mcp: { total: 0, unused: 0, disabled: 0 },
        duties: { active: 0, paused: 0, lastReadTs: 0, sessionsThisWeek: 0 }
    },
    taskHealth: stats,
    totals: { cost: 1, sessions: 2, toolCalls: 3, errors: 0, avgCostPerSession: 0.5 },
    daily: {}, tools: {}, models: {}, insights: [], sessions: []
};
const detHtml = runWebview('media/agentDetail.js', agentData);
check('detail: Task health card renders', /Task health/.test(detHtml) && /gorev-sagligi/.test(detHtml));
check('detail: runs line with success rate', /Runs \(30d\):<\/strong> 5/.test(detHtml) && /success/.test(detHtml));
check('detail: fail streak warning with last failure', /last 2 runs failed/.test(detHtml) && /Bozuk iş/.test(detHtml));
check('detail: live now line', /1 running · 1 queued/.test(detHtml));
const detEmpty = runWebview('media/agentDetail.js', Object.assign({}, agentData, { taskHealth: null }));
check('detail: empty state', /No task runs in the last 30 days/.test(detEmpty));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
