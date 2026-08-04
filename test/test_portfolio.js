// B2 — the Agent Portfolio: twelve agents side by side. The per-agent page
// answers everything about one agent; this page answers the portfolio
// questions — who is working, who has been dead for weeks, who costs what,
// whose duties are waiting, who is on which job. The row builder is the join;
// these checks pin down the arithmetic and the "is this one dead" rule.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } dispose() { } },
            Uri: {}, window: {}, commands: {}, env: {}, ViewColumn: {}, ConfigurationTarget: {},
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
        };
    }
    return origLoad.apply(this, arguments);
};
const { buildPortfolioRows } = require(path.join(__dirname, '..', 'out', 'panels', 'portfolioPanel.js'));
Module._load = origLoad;

const NOW = Date.parse('2026-07-27T12:00:00Z');
const D = 24 * 3600 * 1000;
const usage = t => ({ input: t, output: 0, cacheWrite: 0, cacheRead: 0 });
const session = (agentId, agedays, cost, files) => ({
    agentId, lastTs: NOW - agedays * D, mtime: NOW - agedays * D,
    cost, usage: usage(100), daily: { '2026-07-27': { cost: agedays === 0 ? cost : 0 } },
    filesEdited: Object.fromEntries((files || []).map(f => [f, 1]))
});
const agent = (id, extra) => Object.assign({
    id, name: id, dir: 'D:/agents/' + id, duties: [], memoryFiles: [],
    contextLoad: { total: 4000 }
}, extra);

const store = {
    dev: [session('dev', 0, 3, ['a.ts', 'b.ts']), session('dev', 3, 2, ['a.ts']), session('dev', 40, 9, ['old.ts'])],
    psikolog: [session('psikolog', 20, 1, [])],
    ghost: []
};
const deps = {
    getAgents: () => [
        agent('dev', { duties: [{ title: 'd1', watch: undefined, paused: false }, { title: 'd2', paused: true }] }),
        agent('psikolog'),
        agent('ghost')
    ],
    index: {
        forAgent: id => store[id] || [],
        isAgentActive: () => false
    },
    getInsights: () => [
        { agentId: 'dev', severity: 'error' }, { agentId: 'dev', severity: 'warning' },
        { agentId: 'psikolog', severity: 'info' }
    ],
    live: { agentStatus: id => (id === 'dev' ? { status: 'tool', sessions: 1 } : undefined) },
    // a real project out of the registry — the page resolves an agent's project
    // the same way the cost figures beside it do
    projects: () => [{
        id: 'prj_acme00001', name: 'Acme', status: 'active',
        createdAt: 1, updatedAt: 1, match: { agents: ['dev'] }
    }],
    budgets: () => ({ dev: 4 })
};

const rows = buildPortfolioRows(deps, NOW);
const by = Object.fromEntries(rows.map(r => [r.name, r]));

// ---------- the windows ----------
ok('7-day cost counts only the last 7 days', by.dev.cost7 === 5);
ok('30-day cost excludes the 40-day-old session', by.dev.cost30 === 5);
ok('session counts follow the same windows', by.dev.sessions7 === 2 && by.dev.sessions30 === 2);
ok('today\'s cost is separate', by.dev.costToday === 3);
ok('distinct files are de-duped across sessions', by.dev.filesEdited30 === 2);
ok('a 40-day-old file does not count in the 30-day window',
    !JSON.stringify(rows).includes('old.ts'));

// ---------- is this one dead? ----------
ok('an agent that ran today is not dormant', by.dev.dormant === false && by.dev.quietDays === 0);
ok('20 days quiet IS dormant', by.psikolog.dormant === true && by.psikolog.quietDays === 20);
ok('an agent with no sessions at all reads as never', by.ghost.quietDays === -1 && by.ghost.dormant === true);

// ---------- status, project, duties, findings ----------
ok('the live status is taken from the monitor', by.dev.status === 'tool' && by.dev.active === true);
ok('an agent with no live session is idle', by.psikolog.status === 'idle' && by.psikolog.active === false);
ok('the project comes from the project map', by.dev.project === 'Acme');
ok('an unclaimed agent lands in Unassigned', by.psikolog.project === 'Unassigned');
ok('duties are counted, paused ones marked', by.dev.duties === 2 && by.dev.dutiesPaused === 1);
ok('findings are split by severity', by.dev.errors === 1 && by.dev.warnings === 1);
ok('info findings are not warnings', by.psikolog.errors === 0 && by.psikolog.warnings === 0);
ok('the per-agent budget travels with the row', by.dev.budget === 4 && by.psikolog.budget === 0);
ok('every agent appears exactly once', rows.length === 3);

// ---------- the page is wired ----------
{
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok('the command exists',
        pkg.contributes.commands.some(c => c.command === 'agentfarm.openPortfolio'));
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'portfolio.js'), 'utf8');
    ok('the page groups by project', /Group by project/.test(js));
    ok('…can hide dormant agents', /Hide dormant/.test(js));
    ok('…and every column is sortable', /data-sort=/.test(js));
    const base = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8');
    ok('the global nav can route to it', /portfolio: 'agentfarm\.openPortfolio'/.test(base));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
