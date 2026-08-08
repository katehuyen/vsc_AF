// B1 — projects: the grouping axis (compiled core/projects.js, pure) and the
// promise the whole feature rests on: every session lands in EXACTLY ONE
// bucket, so "what did this customer cost" is a number you can add up.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    normalizePath, UNASSIGNED, agentProject, agentProjectNames,
    PROJECT_STATUSES, CLOSED_STATUSES, PROJECT_KINDS, PERSON_ROLES, PERSON_KINDS,
    UNASSIGNED_ID, emptyLinks, newProjectId, folderNameFor, sameName,
    projectById, projectByName, findProject,
    coerceStatus, coercePerson, coerceProject, coerceProjects, coerceLinks,
    matchRoots, resolveSessionProject, setSessionProject, pruneLinks,
    rollupProjectSessions, folderState, renameProject
} = require(path.join(__dirname, '..', 'out', 'core', 'projects.js'));

// ---------- an agent's project ----------
// ‼️ ONE resolution, shared with sessions. The portfolio page and the
// dashboard's per-agent map both group by this, and they sit beside cost
// figures grouped by `resolveSessionProject` — a second implementation here
// would let the two disagree with no way for a reader to tell which is right.
{
    const TA = 1700000000000;
    const A = (id, extra) => Object.assign(
        { id, name: id, status: 'active', createdAt: TA, updatedAt: TA }, extra || {});
    const projects = [
        A('prj_acme00001', { name: 'Acme', match: { agents: ['dev'] }, repos: ['D:/work/acme'] }),
        A('prj_house0001', { name: 'Inhouse', match: { agents: ['psikolog', 'manager'] } })
    ];
    ok('an agent resolves by its rule, by name', agentProject({ name: 'dev' }, projects).name === 'Acme');
    ok('…case-insensitively', agentProject({ name: 'DEV' }, projects).name === 'Acme');
    ok('an agent resolves by id too', agentProject({ id: 'psikolog' }, projects).name === 'Inhouse');
    ok('an unruled agent has no project', agentProject({ name: 'explorer' }, projects) === undefined);
    ok('an agent whose folder sits under a code root resolves by path',
        agentProject({ name: 'x', dir: 'D:\\work\\acme\\sub' }, projects).name === 'Acme');
    ok('a path that merely starts with the same letters does NOT match',
        agentProject({ name: 'x', dir: 'D:/work/acme-other' }, projects) === undefined);
    ok('normalizePath strips the trailing slash', normalizePath('D:/a/b/') === 'd:/a/b');
    ok('the agent→project map is what a webview needs',
        JSON.stringify(agentProjectNames([{ name: 'dev' }, { name: 'psikolog' }, { name: 'x' }], projects))
        === JSON.stringify({ dev: 'Acme', psikolog: 'Inhouse' }));
}

// ---------- the surfaces are actually wired ----------
{
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    // ‼️ The settings-based model is GONE, not deprecated. A project is an
    // entity in the store with a folder of its own; a second definition of the
    // same thing sitting in settings.json is a second answer waiting to
    // disagree with the first.
    ok('‼️ the old agentFarm.projects setting is no longer declared',
        !pkg.contributes.configuration.properties['agentFarm.projects']);
    // P-12 — …and it is no longer left sitting in the user's file either.
    // Undeclaring a setting does not delete what somebody typed: VS Code marks
    // the block "Unknown Configuration Setting", and any older VSIX installed to
    // check a symptom still carries the importer that reads it. The value is
    // ARCHIVED FIRST — that is what makes removing it without asking honest —
    // and the marker is a one-shot, so a user who types the key back is not
    // argued with every window.
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('the dead setting is retired on activation',
            /retireProjectsSetting/.test(src) && /agentfarm\.projectsSetting\.retired/.test(src));
        const archiveAt = src.indexOf('RETIRED_SETTINGS_FILE, JSON.stringify(archive');
        const removeAt = src.indexOf("cfg().update('projects', undefined, target)");
        ok('…every scope it could be written in is looked at',
            /globalValue/.test(src) && /workspaceValue/.test(src) && /workspaceFolderValue/.test(src));
        ok('‼️ …and the copy is written BEFORE the removal, never after',
            archiveAt > 0 && removeAt > 0 && archiveAt < removeAt);
        ok('…the user is told, with the copy one press away',
            /Show the copy/.test(src));
    }
    const ids = new Set(pkg.contributes.commands.map(c => c.command));
    // P-11 — the backlog is two presses from the tree, and it FOLLOWS the status
    // bar rather than asking a question the window already has an answer to.
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const panel = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'panels', 'projectsPanel.ts'), 'utf8');
        const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'projects.js'), 'utf8');
        ok('the Backlog shortcut exists', ids.has('agentfarm.openBacklog'));
        const body = src.slice(src.indexOf("registerCommand('agentfarm.openBacklog'"));
        ok('…it opens the project page ON the backlog tab',
            /ProjectsPanel\.show\(.*, 'backlog'\)/.test(body.slice(0, 1400)));
        ok('…it reads the window\'s active project first',
            body.slice(0, 1400).includes('activeProjectId()'));
        ok('…and asks with the ONE picker when there is none',
            body.slice(0, 1400).includes('chooseActiveProject('));
        ok('…a deleted project counts as no answer, not as an error',
            /projectStore\.get\(id\)/.test(body.slice(0, 1400)));
        // ‼️ `tab` is echoed on every refresh (the host builds only the open
        // tab's data); a shortcut that set THAT would drag the reader back every
        // repaint. `openTab` is the one-shot beside it.
        ok('the panel carries a one-shot open-on-this-tab', /openTab/.test(panel));
        ok('…cleared the moment it is sent', /this\.openTab = '';/.test(panel));
        ok('…and the page obeys it once', /DATA\.openTab/.test(page));
    }
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
// PROJECT ENTITY — the model the umbrella is built on, and the only one there
// is. The settings-based grouping it replaced is gone with its setting.
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

// ---------- the project surfaces are actually wired ----------
// A feature nobody can reach is not a feature. These assert the three places a
// project has to exist: its own sidebar view, its own page, and — the one that
// matters most — the SHARED session right-click contract, where one entry
// reaches every surface that lists a session.
{
    const fs = require('fs');
    const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
    const pkg = JSON.parse(read('package.json'));
    const cmds = new Set(pkg.contributes.commands.map(c => c.command));
    const menus = pkg.contributes.menus;

    // the sidebar section
    const views = pkg.contributes.views.agentFarm.map(v => v.id);
    ok('‼️ Projects has its own sidebar view', views.includes('agentfarm.projects'));
    ok('…directly under Agents', views.indexOf('agentfarm.projects') === views.indexOf('agentfarm.agents') + 1);

    // the page and the commands behind it
    for (const c of ['agentfarm.openProjects', 'agentfarm.openProject', 'agentfarm.newProject',
        'agentfarm.setActiveProject', 'agentfarm.rescanProjects']) {
        ok(`${c} is a command`, cmds.has(c));
    }
    ok('the page is in the global nav', /id: 'projects'/.test(read('media', 'pageHeader.js')));
    ok('…and the nav routes to it', /projects: 'agentfarm\.openProjects'/.test(read('src', 'panels', 'base.ts')));
    ok('the page script exists', !!read('media', 'projects.js'));

    // ‼️ the shared session contract — one entry, every surface
    const sessionMenu = (menus['webview/context'] || [])
        .filter(m => /afSessionRow/.test(m.when || '')).map(m => m.command);
    for (const c of ['agentfarm.assignSessionProject', 'agentfarm.projectFromSession',
        'agentfarm.addSessionFolderToProject']) {
        ok(`${c} is on every session row`, sessionMenu.includes(c) && cmds.has(c));
    }
    // the pages that inherit those items by using the contract
    const users = ['console.js', 'missions.js', 'search.js', 'sessionsTable.js', 'timeline.js', 'turns.js']
        .filter(f => /AFSessionCtx/.test(read('media', f)));
    ok('the contract is used by every session-listing page', users.length === 6);

    // the view's own buttons and row menu
    const titleBtns = (menus['view/title'] || [])
        .filter(m => m.when === 'view == agentfarm.projects').map(m => m.command);
    ok('the view has a New Project button', titleBtns.includes('agentfarm.newProject'));
    ok('…and a rescan button', titleBtns.includes('agentfarm.rescanProjects'));
    const rowMenu = (menus['view/item/context'] || [])
        .filter(m => /viewItem == afProject\b/.test(m.when || '')).map(m => m.command);
    ok('a project row opens', rowMenu.includes('agentfarm.openProject'));
    ok('…and can be made active', rowMenu.includes('agentfarm.setActiveProject'));

    // settings
    const props = pkg.contributes.configuration.properties;
    for (const s of ['agentFarm.projectsRoot', 'agentFarm.projectSkeleton', 'agentFarm.projectStaleDays']) {
        ok(`${s} is declared`, !!props[s]);
    }
    ok('the skeleton setting explains that role, not the file name, is what matters',
        /never its file name/i.test(props['agentFarm.projectSkeleton'].description));

    // the bridge — every user-triggerable function reaches an agent too
    const ext = read('src', 'extension.ts');
    for (const op of ['projects.list', 'projects.get', 'projects.create', 'projects.set',
        'projects.rename', 'projects.assign', 'projects.current', 'projects.health',
        'projects.rescan', 'projects.sessions', 'projects.brief',
        'projects.timeline', 'projects.cost']) {
        ok(`${op} is on the bridge`, ext.includes(`op: '${op}'`));
    }
    // The page and an agent must read the SAME answer — one builder, two callers.
    ok('the timeline op goes through the page\'s own feed builder',
        /const feed = projectFeedFor\(\(p as Project\)\.id, \{/.test(ext));
    ok('…and the cost op through the page\'s own rollup',
        /\.\.\.projectCostFor\(project\.id\)/.test(ext));
    ok('‼️ the timeline op tells an agent what it CANNOT show, by name',
        /unfiled: UNFILED_EVENT_KINDS/.test(ext));
    ok('…and refuses an event kind it does not have rather than returning nothing',
        /unknown event kind\(s\)/.test(ext));
    ok('‼️ the cost op warns that a multi-model turn is not split',
        /mixedTurnCost/.test(ext) && /cannot be split/.test(ext));
    ok('projects.brief can also hand back the exact text a session is given',
        /if \(args\.context === true\)/.test(ext));
    ok('the context-extra setting is declared', !!props['agentFarm.projectContextExtra']);
    // The page's Sessions button reads this; an agent asking the same question
    // must not have to reimplement the resolution order to answer it.
    ok('projects.sessions reports WHY each session belongs',
        /via: projectStore\.resolve\(\{/.test(ext));
    ok('the store is created and loaded on activate',
        /new ProjectStore\(/.test(ext) && /projectStore\.load\(\)/.test(ext));
    ok('‼️ nothing reads the old setting any more — it is gone, not deprecated',
        !/migrateLegacy/.test(ext) && !/ProjectDef/.test(ext));
    ok('the active project is window-scoped, not shared between windows',
        /workspaceState\.get<string>\('af\.activeProject'/.test(ext));
    ok('the status bar always shows the active project, even when there is none',
        /No project/.test(ext));

    // ---- U-5: the item is a fixed width; the name and everything about it
    // moved into the tooltip, which costs nothing until it is hovered ----
    ok('‼️ the project NAME is not on the status bar item any more',
        /projectBar\.text = p \? '◧ Project' : '◧ No project'/.test(ext));
    ok('…and it sits to the RIGHT of the plan-usage percentages',
        /createStatusBarItem\(vscode\.StatusBarAlignment\.Left, 87\)/.test(ext)
        && /a lower number sits further right/.test(ext));
    const barBlock = ext.slice(ext.indexOf('const paintProjectBar'),
        ext.indexOf('const paintProjectBar') + 2600);
    ok('the tooltip carries the name, the state and the spend',
        /appendMarkdown\(`\*\*◧ \$\{p\.name\}\*\*/.test(barBlock)
        && /p\.status/.test(barBlock) && /todayCost/.test(barBlock));
    ok('‼️ …and is a MarkdownString with live commands, not a dead string',
        /isTrusted = \{/.test(barBlock) && /agentfarm\.openProject/.test(barBlock)
        && /agentfarm\.backlogAdd/.test(barBlock));
    ok('…including the one-click clear a quick-pick used to cost',
        /barCmd\('agentfarm\.setActiveProject', \[\{ id: '' \}\]\)/.test(barBlock));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
