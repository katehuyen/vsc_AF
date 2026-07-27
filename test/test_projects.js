// B1 — projects: the grouping axis (compiled core/projects.js, pure) and the
// promise the whole feature rests on: every session lands in EXACTLY ONE
// bucket, so "what did this customer cost" is a number you can add up.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    normalizeProjects, projectOfAgent, projectOfSession, agentProjectMap,
    projectNames, assignAgent, rollupProjects, normalizePath, UNASSIGNED
} = require(path.join(__dirname, '..', 'out', 'core', 'projects.js'));

// ---------- normalizing what settings.json holds ----------
{
    ok('a non-array is no projects', normalizeProjects(undefined).length === 0
        && normalizeProjects({}).length === 0);
    const p = normalizeProjects([
        { name: ' Acme ', agents: ['dev', '', 'psikolog'], paths: ['D:/work/acme/'], budgetUSD: 5, note: ' retainer ' },
        { name: 'Acme' },                       // duplicate name
        { name: '' },                           // no name
        { name: 'Empty', agents: [], budgetUSD: -3 },
        'nope', null
    ]);
    ok('names are trimmed', p[0].name === 'Acme');
    ok('blank members dropped', p[0].agents.join('|') === 'dev|psikolog');
    ok('a duplicate name is ignored', p.filter(x => x.name === 'Acme').length === 1);
    ok('nameless / junk entries are dropped', p.length === 2);
    ok('an empty member list is not stored', p[1].agents === undefined);
    ok('a negative budget is not a budget', p[1].budgetUSD === undefined);
    ok('the note is kept, trimmed', p[0].note === 'retainer');
}

// ---------- resolution ----------
{
    const projects = normalizeProjects([
        { name: 'Acme', agents: ['dev'], paths: ['D:/work/acme'] },
        { name: 'Inhouse', agents: ['psikolog', 'manager'] }
    ]);
    ok('an agent resolves by name', projectOfAgent({ name: 'dev' }, projects) === 'Acme');
    ok('…case-insensitively', projectOfAgent({ name: 'DEV' }, projects) === 'Acme');
    ok('an agent resolves by id too', projectOfAgent({ id: 'psikolog' }, projects) === 'Inhouse');
    ok('an unlisted agent has no project', projectOfAgent({ name: 'explorer' }, projects) === undefined);
    ok('an agent inside a project folder resolves by path',
        projectOfAgent({ name: 'x', dir: 'D:\\work\\acme\\sub' }, projects) === 'Acme');

    ok('a session follows its agent',
        projectOfSession({ agentName: 'dev', cwd: 'C:/elsewhere' }, projects) === 'Acme');
    ok('an agentless session resolves by cwd',
        projectOfSession({ cwd: 'D:/work/acme/site' }, projects) === 'Acme');
    ok('a path that merely starts with the same letters does NOT match',
        projectOfSession({ cwd: 'D:/work/acme-other' }, projects) === undefined);
    ok('the folder itself matches', projectOfSession({ cwd: 'D:/work/acme' }, projects) === 'Acme');
    ok('slashes and case do not matter',
        projectOfSession({ cwd: 'd:\\WORK\\Acme\\deep\\er' }, projects) === 'Acme');
    ok('nothing matching = no project', projectOfSession({ cwd: 'E:/other' }, projects) === undefined);
    ok('normalizePath strips the trailing slash', normalizePath('D:/a/b/') === 'd:/a/b');

    ok('the agent→project map is what a webview needs',
        JSON.stringify(agentProjectMap([{ name: 'dev' }, { name: 'psikolog' }, { name: 'x' }], projects))
        === JSON.stringify({ dev: 'Acme', psikolog: 'Inhouse' }));
    ok('project names list keeps declaration order and appends Unassigned',
        projectNames(projects).join('|') === 'Acme|Inhouse|' + UNASSIGNED);
    ok('…and can leave it out', projectNames(projects, false).join('|') === 'Acme|Inhouse');
}

// ---------- the one-owner rule ----------
{
    const projects = normalizeProjects([
        { name: 'Acme', agents: ['dev', 'psikolog'] },
        { name: 'Inhouse', agents: ['manager'] }
    ]);
    const moved = assignAgent(projects, 'Inhouse', 'dev', true);
    ok('assigning moves the agent OUT of its old project',
        (moved.find(p => p.name === 'Acme').agents || []).join('|') === 'psikolog');
    ok('…and INTO the new one',
        moved.find(p => p.name === 'Inhouse').agents.join('|') === 'manager|dev');
    ok('an agent is never in two projects at once',
        moved.filter(p => (p.agents || []).some(a => a === 'dev')).length === 1);
    const off = assignAgent(projects, 'Acme', 'dev', false);
    ok('removing works', (off.find(p => p.name === 'Acme').agents || []).join('|') === 'psikolog');
    const empty = assignAgent(normalizeProjects([{ name: 'Solo', agents: ['dev'] }]), 'Solo', 'dev', false);
    ok('an emptied list is dropped, not stored as []', empty[0].agents === undefined);
    ok('the input is not mutated', projects[0].agents.join('|') === 'dev|psikolog');
}

// ---------- the rollup: buckets must add up ----------
{
    const projects = normalizeProjects([
        { name: 'Acme', agents: ['dev'], budgetUSD: 4, note: 'retainer' },
        { name: 'Inhouse', agents: ['psikolog'] }
    ]);
    const sessions = [
        { agentName: 'dev', cost: 3, tokens: 100, todayCost: 1, lastTs: 500 },
        { agentName: 'dev', cost: 2, tokens: 50, todayCost: 2, lastTs: 900 },
        { agentName: 'psikolog', cost: 1, tokens: 10, todayCost: 0, lastTs: 100 },
        { agentName: 'explorer', cost: 7, tokens: 70, todayCost: 4, lastTs: 300 }   // no project
    ];
    const roll = rollupProjects(projects, sessions,
        [{ name: 'dev' }, { name: 'psikolog' }, { name: 'explorer' }]);
    const by = Object.fromEntries(roll.map(r => [r.name, r]));
    ok('per-project cost is summed', by.Acme.cost === 5 && by.Inhouse.cost === 1);
    ok('today is summed separately', by.Acme.todayCost === 3);
    ok('sessions are counted', by.Acme.sessions === 2);
    ok('the newest activity wins', by.Acme.lastTs === 900);
    ok('unclaimed work lands in Unassigned, not nowhere', by[UNASSIGNED].cost === 7);
    ok('the buckets add up to the fleet total',
        roll.reduce((n, r) => n + r.cost, 0) === sessions.reduce((n, s) => n + s.cost, 0));
    ok('an agent with no sessions still shows under its project',
        by.Inhouse.agents.indexOf('psikolog') >= 0);
    ok('budget and note travel with the bucket', by.Acme.budgetUSD === 4 && by.Acme.note === 'retainer');
    ok('Unassigned is listed last', roll[roll.length - 1].name === UNASSIGNED);
    ok('declared projects keep their order', roll[0].name === 'Acme' && roll[1].name === 'Inhouse');
    const none = rollupProjects([], sessions, []);
    ok('with no projects declared everything is one honest bucket',
        none.length === 1 && none[0].name === UNASSIGNED && none[0].cost === 13);
}

// ---------- the surfaces are actually wired ----------
{
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok('agentFarm.projects is a declared setting', !!pkg.contributes.configuration.properties['agentFarm.projects']);
    const ids = new Set(pkg.contributes.commands.map(c => c.command));
    ok('Manage Projects… exists', ids.has('agentfarm.manageProjects'));
    ok('Assign Agent to Project… exists', ids.has('agentfarm.assignProject'));
    ok('the portfolio page exists', ids.has('agentfarm.openPortfolio'));
    const menus = [].concat(...Object.values(pkg.contributes.menus));
    ok('assigning is reachable from an agent row',
        menus.some(m => m.command === 'agentfarm.assignProject' && /viewItem == agent/.test(m.when || '')));
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    for (const op of ['projects.list', 'projects.assign', 'projects.set', 'sessions.files']) {
        ok(`${op} is on the bridge`, ext.includes(`op: '${op}'`));
    }
    const table = fs.readFileSync(path.join(__dirname, '..', 'media', 'sessionsTable.js'), 'utf8');
    ok('the sessions table filters by project', /filters\.projects/.test(table));
    ok('…and has a Project column', /project: r =>/.test(table));
    const dash = fs.readFileSync(path.join(__dirname, '..', 'media', 'dashboard.js'), 'utf8');
    ok('the dashboard has a Projects card', /Projects<\/h2>/.test(dash));
    ok('…that clicks through to the sessions below it', /setProjectFilter/.test(dash));
    const nav = fs.readFileSync(path.join(__dirname, '..', 'media', 'pageHeader.js'), 'utf8');
    ok('the portfolio page is in the global nav', /id: 'portfolio'/.test(nav));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
