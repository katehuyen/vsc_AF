// B1 — projects: the grouping axis (compiled core/projects.js, pure) and the
// promise the whole feature rests on: every session lands in EXACTLY ONE
// bucket, so "what did this customer cost" is a number you can add up.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    normalizeProjects, projectOfAgent, projectOfSession, agentProjectMap,
    projectNames, assignAgent, rollupProjects, normalizePath, UNASSIGNED,
    // the entity model (see "PROJECT ENTITY" below)
    PROJECT_STATUSES, CLOSED_STATUSES, PROJECT_KINDS, PERSON_ROLES, PERSON_KINDS,
    UNASSIGNED_ID, emptyLinks, newProjectId, folderNameFor, sameName,
    projectById, projectByName, findProject,
    coerceStatus, coercePerson, coerceProject, coerceProjects, coerceLinks,
    matchRoots, resolveSessionProject, setSessionProject, pruneLinks,
    rollupProjectSessions, folderState, renameProject, migrateLegacyProjects
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

// ===========================================================================
// PROJECT ENTITY — the model the umbrella is built on. Everything above this
// line tests the settings-based grouping it replaces; both live side by side
// until the store is wired in.
// ===========================================================================

const T0 = 1700000000000;
/** A project carrying only what the test at hand cares about. */
const P = (id, extra) => Object.assign(
    { id, name: id, status: 'active', createdAt: T0, updatedAt: T0 }, extra || {});

// ---------- vocabulary ----------
{
    ok('statuses complete', PROJECT_STATUSES.join() === 'planned,active,paused,done,archived');
    ok('closed statuses', CLOSED_STATUSES.join() === 'done,archived');
    ok('kinds present', PROJECT_KINDS.includes('customer') && PROJECT_KINDS.includes('product'));
    ok('roles separate deciding from paying', PERSON_ROLES.includes('owner') && PERSON_ROLES.includes('client'));
    ok('person kinds include self', PERSON_KINDS.join() === 'person,company,self');
    ok('the unassigned sentinel cannot collide with a real id', !UNASSIGNED_ID.startsWith('prj_'));
}

// ---------- ids ----------
{
    const seen = new Set();
    for (let i = 0; i < 500; i++) { seen.add(newProjectId(seen)); }
    ok('500 ids are unique', seen.size === 500);
    ok('id shape', [...seen].every(id => /^prj_[a-z2-9]{8}$/.test(id)));
    ok('never hands back a taken id', newProjectId(['prj_aaaaaaaa'], () => 0) !== 'prj_aaaaaaaa');
}

// ---------- folder names: whatever the user typed, in any language ----------
{
    ok('a plain name survives', folderNameFor('Agent Farm') === 'Agent Farm');
    ok('Turkish characters preserved', folderNameFor('Günlük Şeyler İşi') === 'Günlük Şeyler İşi');
    ok('German characters preserved', folderNameFor('Für Müller') === 'Für Müller');
    ok('Arabic preserved', folderNameFor('مشروع') === 'مشروع');
    ok('hyphens are NOT stripped', folderNameFor('TalkScribe-ZEN') === 'TalkScribe-ZEN');
    ok('only the characters Windows refuses are removed',
        folderNameFor('a/b:c*d?e"f<g>h|i') === 'a b c d e f g h i');
    ok('a trailing dot is dropped (Windows would too)', folderNameFor('Project.') === 'Project');
    ok('whitespace collapses', folderNameFor('  a   b  ') === 'a b');
    ok('a name with nothing usable yields empty', folderNameFor('///') === '');
}

// ---------- lookup ----------
{
    const list = [P('prj_a', { name: 'Agent Farm' }), P('prj_b', { name: 'TalkScribe' })];
    ok('by id', projectById(list, 'prj_b').name === 'TalkScribe');
    ok('by name, case-insensitively', projectByName(list, 'agent farm').id === 'prj_a');
    ok('findProject takes either',
        findProject(list, 'prj_a').id === 'prj_a' && findProject(list, 'TalkScribe').id === 'prj_b');
    ok('findProject on blank', findProject(list, '   ') === undefined);
    ok('sameName ignores padding and case', sameName(' Agent FARM ', 'agent farm'));
}

// ---------- coercion: the store file can be hand-edited ----------
{
    ok('garbage is not a project', coerceProject(null) === undefined && coerceProject(42) === undefined);
    ok('id and name are both required',
        coerceProject({ id: 'prj_x' }) === undefined && coerceProject({ name: 'x' }) === undefined);
    const p = coerceProject({
        id: ' prj_x ', name: '  Thing ', status: 'nonsense', kind: 'customer',
        folder: ' D:\\docs\\thing ', repos: ['  D:\\code  ', '', 7], parentId: 'prj_x',
        budgetUSD: -5, budgetTotalUSD: 250, tags: ['a', 'b'],
        people: [{ name: 'Ali', role: 'nope', kind: 'company' }, { role: 'owner' }],
        match: { agents: ['developer', '  '] }
    }, T0);
    ok('id and name trimmed', p.id === 'prj_x' && p.name === 'Thing');
    ok('an unknown status becomes active', p.status === 'active');
    ok('kind kept', p.kind === 'customer');
    ok('folder trimmed', p.folder === 'D:\\docs\\thing');
    ok('repos cleaned of blanks and non-strings', p.repos.length === 1 && p.repos[0] === 'D:\\code');
    ok('a project cannot be its own parent', p.parentId === undefined);
    ok('a negative budget is not a budget', p.budgetUSD === undefined && p.budgetTotalUSD === 250);
    ok('an unknown role falls back to contact', p.people.length === 1 && p.people[0].role === 'contact');
    ok('a nameless person is dropped', p.people.every(x => !!x.name));
    ok('a blank agent rule is dropped', p.match.agents.join() === 'developer');
    ok('coerceStatus', coerceStatus('paused') === 'paused' && coerceStatus(null) === 'active');
    ok('coercePerson needs a name', coercePerson({ role: 'owner' }) === undefined);

    const list = coerceProjects([
        { id: 'prj_1', name: 'A' }, { id: 'prj_1', name: 'B' },
        { id: 'prj_2', name: 'a' }, { id: 'prj_3', name: 'C' }, 'junk'
    ], T0);
    ok('a duplicate id is dropped', list.filter(x => x.id === 'prj_1').length === 1);
    ok('a duplicate name is dropped too', !list.some(x => x.id === 'prj_2'));
    ok('the good rows survive', list.map(x => x.id).join() === 'prj_1,prj_3');
}
{
    const l = coerceLinks({ sessions: { ' s1 ': ' prj_a ', s2: '', s3: 5, '': 'prj_a' } });
    ok('links are trimmed', l.sessions.s1 === 'prj_a');
    ok('‼️ the empty string is KEPT — it is the explicit-none marker, not an empty field',
        l.sessions.s2 === '');
    ok('a non-string value is dropped', l.sessions.s3 === undefined);
    ok('a blank key is dropped', Object.keys(l.sessions).length === 2);
    ok('garbage yields empty links', Object.keys(coerceLinks(null).sessions).length === 0);
}

// ---------- membership: the five-step order ----------
{
    const projects = [
        P('prj_root', { name: 'Root', repos: ['D:\\zone\\dev\\git\\miropharm'] }),
        P('prj_zen', { name: 'ZEN', repos: ['D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe\\ZEN'] }),
        P('prj_dev', { name: 'DevAgent', match: { agents: ['developer'] } }),
        P('prj_docs', { name: 'Docs', folder: 'D:\\vault\\10_PROJECTS\\Docs' })
    ];

    ok('nothing matching is honestly nothing',
        resolveSessionProject({ sessionId: 's', cwd: 'C:\\elsewhere' }, projects).via === 'none');

    const deep = resolveSessionProject(
        { sessionId: 's1', cwd: 'D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe\\ZEN\\src' }, projects);
    ok('‼️ the LONGEST root wins, not the first declared', deep.projectId === 'prj_zen');
    ok('…and it says which root matched', deep.via === 'path' && deep.matchedRoot.endsWith('/zen'));
    ok('a cwd outside the deeper root still falls to the outer project',
        resolveSessionProject({ sessionId: 's2', cwd: 'D:\\zone\\dev\\git\\miropharm\\other' }, projects).projectId === 'prj_root');
    ok('case and slash direction do not matter',
        resolveSessionProject({ sessionId: 's3', cwd: 'd:/ZONE/dev/git/MIROPHARM/x' }, projects).projectId === 'prj_root');
    ok('the root matches itself',
        resolveSessionProject({ sessionId: 's4', cwd: 'D:\\zone\\dev\\git\\miropharm' }, projects).projectId === 'prj_root');
    ok('a sibling that merely shares the letters does NOT match',
        resolveSessionProject({ sessionId: 's5', cwd: 'D:\\zone\\dev\\git\\miropharm-old' }, projects).via === 'none');
    ok('the docs folder is a match root too',
        resolveSessionProject({ sessionId: 's6', cwd: 'D:\\vault\\10_PROJECTS\\Docs\\20_Decisions' }, projects).projectId === 'prj_docs');

    ok('an agent rule applies when no path did',
        resolveSessionProject({ sessionId: 's7', agentName: 'developer' }, projects).via === 'agent');
    ok('…by id as well as name, case-insensitively',
        resolveSessionProject({ sessionId: 's8', agentId: 'DEVELOPER' }, projects).projectId === 'prj_dev');
    ok('a path beats an agent rule',
        resolveSessionProject({ sessionId: 's9', agentName: 'developer', cwd: 'D:\\zone\\dev\\git\\miropharm' }, projects).projectId === 'prj_root');

    const ex = resolveSessionProject(
        { sessionId: 's9', agentName: 'developer', cwd: 'D:\\zone\\dev\\git\\miropharm' },
        projects, { sessions: { s9: 'prj_zen' } });
    ok('an explicit assignment beats path and agent alike',
        ex.projectId === 'prj_zen' && ex.via === 'explicit');

    const det = resolveSessionProject(
        { sessionId: 's9', agentName: 'developer', cwd: 'D:\\zone\\dev\\git\\miropharm' },
        projects, { sessions: { s9: '' } });
    ok('‼️ "remove from project" is NOT reclaimed by the path rule', det.projectId === undefined);
    ok('…and it says so rather than pretending nothing was decided', det.via === 'explicit-none');

    const stale = resolveSessionProject(
        { sessionId: 's9', cwd: 'D:\\zone\\dev\\git\\miropharm' },
        projects, { sessions: { s9: 'prj_gone' } });
    ok('a link to a deleted project is stale, not a decision — the rules speak again',
        stale.projectId === 'prj_root' && stale.via === 'path');

    ok('a session with no id can still resolve by path',
        resolveSessionProject({ cwd: 'D:\\zone\\dev\\git\\miropharm' }, projects,
            { sessions: { s9: 'prj_zen' } }).projectId === 'prj_root');

    ok('matchRoots normalises', matchRoots(projects[3]).join() === 'd:/vault/10_projects/docs');
    ok('a project with no folder and no repos claims no path', matchRoots(P('prj_e')).length === 0);
}

// ---------- attach · detach · transfer ----------
{
    let l = emptyLinks();
    l = setSessionProject(l, 's1', 'prj_a');
    ok('attach', l.sessions.s1 === 'prj_a');
    l = setSessionProject(l, 's1', 'prj_b');
    ok('transfer is just another value', l.sessions.s1 === 'prj_b');
    l = setSessionProject(l, 's1', '');
    ok('detach writes the explicit-none marker', l.sessions.s1 === '');
    l = setSessionProject(l, 's1', undefined);
    ok('undefined forgets the decision so the rules speak again', !('s1' in l.sessions));
    ok('a blank session id is a no-op', setSessionProject(l, '   ', 'prj_a') === l);

    const pruned = pruneLinks({ sessions: { a: 'prj_live', b: 'prj_dead', c: '' } }, [P('prj_live')]);
    ok('prune drops pointers to deleted projects', pruned.sessions.b === undefined);
    ok('prune keeps live links', pruned.sessions.a === 'prj_live');
    ok('prune keeps the explicit-none marker', pruned.sessions.c === '');
}

// ---------- the rollup: the arithmetic is the promise ----------
{
    const projects = [
        P('prj_a', { name: 'A', repos: ['D:\\a'], budgetUSD: 5 }),
        P('prj_b', { name: 'B', repos: ['D:\\b'], budgetTotalUSD: 100 }),
        P('prj_empty', { name: 'Empty' })
    ];
    const S = (sessionId, cwd, cost, agentName) =>
        ({ sessionId, cwd, agentName, cost, tokens: cost * 1000, todayCost: cost / 2, lastTs: T0 + cost });
    const sessions = [
        S('s1', 'D:\\a\\x', 1, 'developer'),
        S('s2', 'D:\\a\\y', 2, 'developer'),
        S('s3', 'D:\\b', 4, 'manager'),
        S('s4', 'C:\\nowhere', 8, 'basit'),
        S('s5', 'D:\\a\\z', 16, 'basit')
    ];
    const roll = rollupProjectSessions(projects, sessions, { sessions: { s5: '' } });
    const by = Object.fromEntries(roll.map(r => [r.id, r]));

    ok('a project with no sessions is still a project', by.prj_empty && by.prj_empty.sessions === 0);
    ok('A totals', by.prj_a.sessions === 2 && by.prj_a.cost === 3);
    ok('B totals', by.prj_b.sessions === 1 && by.prj_b.cost === 4);
    ok('a detached session is not counted to the project its path points at', by.prj_a.sessions === 2);
    ok('the leftovers land in Unassigned', by[UNASSIGNED_ID].sessions === 2 && by[UNASSIGNED_ID].cost === 24);

    ok('‼️ the buckets sum to the fleet total (cost)',
        Math.abs(roll.reduce((n, r) => n + r.cost, 0) - sessions.reduce((n, s) => n + s.cost, 0)) < 1e-9);
    ok('‼️ …and (sessions)', roll.reduce((n, r) => n + r.sessions, 0) === sessions.length);
    ok('‼️ …and (tokens)',
        roll.reduce((n, r) => n + r.tokens, 0) === sessions.reduce((n, s) => n + s.tokens, 0));

    ok('budgets ride along', by.prj_a.budgetUSD === 5 && by.prj_b.budgetTotalUSD === 100);
    ok('status rides along; the leftover bucket has none', by.prj_a.status === 'active' && by[UNASSIGNED_ID].status === undefined);
    ok('agents are evidence, deduped', by.prj_a.agents.join() === 'developer');
    ok('the newest activity wins', by.prj_a.lastTs === T0 + 2);
    ok('Unassigned is never first', roll[roll.length - 1].id === UNASSIGNED_ID);
    ok('declared order is kept', roll[0].id === 'prj_a' && roll[1].id === 'prj_b');
    ok('with no sessions at all, every project still gets a row',
        rollupProjectSessions(projects, []).length === projects.length);
}

// ---------- folder state ----------
{
    const exists = dir => dir === 'D:\\here';
    ok('no folder chosen yet → unset', folderState(P('prj_a'), exists) === 'unset');
    ok('folder present → ok', folderState(P('prj_a', { folder: 'D:\\here' }), exists) === 'ok');
    ok('‼️ a folder that WAS chosen and is gone says missing, not unset',
        folderState(P('prj_a', { folder: 'D:\\gone' }), exists) === 'missing');
}

// ---------- rename ----------
{
    const list = [P('prj_a', { name: 'Agent Farm' }), P('prj_b', { name: 'TalkScribe' })];
    const res = renameProject(list, 'prj_a', '  Agent Farm 2  ', T0 + 1);
    ok('rename works and trims', !res.error && projectById(res.projects, 'prj_a').name === 'Agent Farm 2');
    ok('rename stamps updatedAt', projectById(res.projects, 'prj_a').updatedAt === T0 + 1);
    ok('‼️ the id is untouched, so every link survives the rename',
        projectById(res.projects, 'prj_a').id === 'prj_a');
    ok('other projects are untouched', projectById(res.projects, 'prj_b').name === 'TalkScribe');
    ok('the input list is not mutated', list[0].name === 'Agent Farm');
    ok('an empty name is rejected', !!renameProject(list, 'prj_a', '   ').error);
    ok('a name another project holds is rejected', !!renameProject(list, 'prj_a', 'talkscribe').error);
    ok('renaming to its own name is fine', !renameProject(list, 'prj_a', 'Agent Farm').error);
    ok('an unknown id is rejected', !!renameProject(list, 'prj_zz', 'x').error);
    ok('a name with no usable folder characters is rejected', !!renameProject(list, 'prj_a', '///').error);
    ok('a rejection returns the list unchanged', renameProject(list, 'prj_a', '   ').projects === list);
}

// ---------- migration off agentFarm.projects ----------
{
    const migrated = migrateLegacyProjects([
        { name: 'Me.DEV.AgentFarm', agents: ['basit', 'developer', 'manager'] },
        { name: 'Customer X', paths: ['D:\\work\\x'], budgetUSD: 3, note: 'fixed price' },
        { name: '' }, 'junk'
    ], T0);
    ok('one project per usable legacy entry', migrated.length === 2);
    ok('names carried', migrated[0].name === 'Me.DEV.AgentFarm');
    ok('agents become a RULE, not membership', migrated[0].match.agents.join() === 'basit,developer,manager');
    ok('paths become code roots', migrated[1].repos.join() === 'D:\\work\\x');
    ok('budget carried', migrated[1].budgetUSD === 3);
    ok('the note becomes the one-line summary', migrated[1].summary === 'fixed price');
    ok('everything starts active', migrated.every(p => p.status === 'active'));
    ok('ids are fresh and unique', new Set(migrated.map(p => p.id)).size === 2);
    ok('‼️ no folder is invented — the user is asked instead',
        migrated.every(p => p.folder === undefined));
    ok('empty input, empty output', migrateLegacyProjects(null).length === 0);
    ok('a migrated agent rule resolves exactly as the old setting did',
        resolveSessionProject({ sessionId: 's', agentName: 'developer' }, migrated).projectId === migrated[0].id);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
