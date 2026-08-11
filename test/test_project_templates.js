// Faz 7 — project templates (compiled core/projectTemplates.js, pure): the list
// is a SETTING, so every field arrived by hand and every coercion here is what
// stands between a typo and a project created with somebody else's budget. The
// two rules that matter: identity fields (id/folder/parentId) never travel, and
// an explicit argument always beats what the template carries.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    coerceTemplate, coerceTemplates, findTemplate, upsertTemplate, removeTemplate,
    templateFromProject, applyTemplate, describeTemplate
} = require(path.join(__dirname, '..', 'out', 'core', 'projectTemplates.js'));

const now = 1786000000000;
const project = {
    id: 'prj_abc12345', name: 'TalkScribe', status: 'done', kind: 'product',
    folder: 'D:\\vault\\TalkScribe', parentId: 'prj_parent00',
    repos: ['D:\\code\\zen', 'D:\\code\\zep'],
    match: { agents: ['developer'] },
    people: [{ name: 'Murat', role: 'owner', kind: 'self' }],
    budgetUSD: 3, budgetTotalUSD: 200,
    summary: 'voice dictation', tags: ['voice'], color: '#c0ffee', icon: '🎙',
    createdAt: now, updatedAt: now
};

// ---------- coercion ----------
{
    ok('a template with no name is not a template', !coerceTemplate({ kind: 'product' }));
    ok('a non-object is refused', !coerceTemplate('client') && !coerceTemplate(null));
    const t = coerceTemplate({
        name: '  Client work  ', kind: 'nonsense', status: 'active',
        tags: ['a', '', 7, ' b '], repos: ['D:\\x'], agents: ['dev'],
        budgetUSD: -4, budgetTotalUSD: 50, people: [{ name: 'Ada', role: 'whatever' }],
        plan: ['Kickoff', { text: 'Invoice', section: 'Next up' }, { text: '   ' }, 42],
        backlog: ['Set up repo', { text: 'Scope', area: 'p', effort: 'm', kinds: ['feat'] }],
        skeleton: ['Notes.md', { path: 'X/', holds: 'decisions' }],
        savedAt: now, fromProject: 'Old thing'
    });
    ok('the name is trimmed', t.name === 'Client work');
    ok('an unknown kind is dropped rather than stored', t.kind === undefined);
    ok('a known status survives', t.status === 'active');
    ok('list fields are cleaned of blanks and non-strings',
        t.tags.join(',') === 'a,b' && t.repos.length === 1 && t.agents.length === 1);
    ok('a negative budget is not a budget', t.budgetUSD === undefined && t.budgetTotalUSD === 50);
    ok('an unknown person role falls back rather than dropping the person',
        t.people.length === 1 && t.people[0].role === 'contact');
    ok('‼️ a bare string is a valid plan item — the setting must be writable by hand',
        t.plan.length === 2 && t.plan[0].text === 'Kickoff' && t.plan[1].section === 'Next up');
    ok('backlog areas and efforts are upper-cased the way codes are',
        t.backlog[1].area === 'P' && t.backlog[1].effort === 'M');
    ok('a skeleton string becomes an entry', t.skeleton.length === 2 && t.skeleton[0].path === 'Notes.md');
    ok('provenance survives', t.fromProject === 'Old thing' && t.savedAt === now);
}

// ---------- the list ----------
{
    const list = coerceTemplates([
        { name: 'A' }, { name: 'a', kind: 'internal' }, 'nope', { name: 'B' }
    ]);
    ok('duplicate names are one template, first wins',
        list.length === 2 && list[0].name === 'A' && list[0].kind === undefined);
    ok('a non-array list is empty, not a crash', coerceTemplates('x').length === 0);
    ok('lookup is case- and padding-insensitive', findTemplate(list, ' b ').name === 'B');
    ok('a name nobody holds returns nothing', !findTemplate(list, 'C'));

    const swapped = upsertTemplate(list, { name: 'A', kind: 'ops' });
    ok('‼️ saving over a template edits it IN PLACE — the picker order does not shuffle',
        swapped.length === 2 && swapped[0].name === 'A' && swapped[0].kind === 'ops');
    ok('a new name is appended', upsertTemplate(list, { name: 'C' }).length === 3);
    ok('removal is by name, case-insensitively', removeTemplate(list, 'A').length === 1);
}

// ---------- deriving one from a project ----------
{
    ok('a template needs a name of its own', !!templateFromProject(project, '   ').error);

    const bare = templateFromProject(project, 'Bare').template;
    ok('nothing travels unless it is asked for',
        bare.kind === undefined && bare.repos === undefined && bare.people === undefined
        && bare.budgetUSD === undefined);
    ok('…but provenance always does', bare.fromProject === 'TalkScribe' && !!bare.savedAt);

    const full = templateFromProject(project, 'Product', {
        identity: true, repos: true, agents: true, budgets: true, people: true,
        plan: ['Kickoff'], backlog: [{ text: 'Scope', area: 'P' }],
        description: 'how a product project starts'
    }, now).template;
    ok('identity carries kind, summary, tags and the visual mark',
        full.kind === 'product' && full.summary === 'voice dictation'
        && full.tags.join() === 'voice' && full.color === '#c0ffee' && full.icon === '🎙');
    ok('‼️ STATUS is not carried — a template off a finished project would create everything done',
        full.status === undefined);
    ok('‼️ id, folder and parentId never travel — they are identity, not shape',
        full.id === undefined && full.folder === undefined && full.parentId === undefined);
    ok('repos, agent rules, budgets and people travel when ticked',
        full.repos.length === 2 && full.agents.join() === 'developer'
        && full.budgetUSD === 3 && full.people.length === 1);
    ok('the people are copied, not shared with the project',
        full.people[0] !== project.people[0]);
    ok('plan and backlog lines travel', full.plan.length === 1 && full.backlog[0].area === 'P');
}

// ---------- applying one ----------
{
    const t = coerceTemplate({
        name: 'T', kind: 'customer', status: 'planned', summary: 'from the template',
        tags: ['x'], repos: ['D:\\r'], agents: ['dev'], budgetUSD: 9, icon: '📦',
        people: [{ name: 'Ada', role: 'client' }]
    });
    const plain = applyTemplate(t);
    ok('the template fills what it carries',
        plain.kind === 'customer' && plain.status === 'planned' && plain.budgetUSD === 9
        && plain.match.agents.join() === 'dev' && plain.people.length === 1);
    ok('the arrays are copies', plain.tags !== t.tags && plain.repos !== t.repos);

    const overridden = applyTemplate(t, { kind: 'internal', summary: 'what I typed' });
    ok('‼️ what the person typed beats what the template says',
        overridden.kind === 'internal' && overridden.summary === 'what I typed');
    ok('…and the untouched fields still come from the template', overridden.budgetUSD === 9);

    ok('an explicit empty CLEARS a field the template would have set',
        applyTemplate(t, { summary: '' }).summary === undefined
        && applyTemplate(t, { repos: [] }).repos === undefined);
    ok('undefined is "say nothing", not "clear it"',
        applyTemplate(t, { summary: undefined }).summary === 'from the template');
    ok('no template at all is an empty contribution, not a crash',
        Object.keys(applyTemplate(undefined)).length === 0);
    ok('…and overrides still apply with no template',
        applyTemplate(undefined, { kind: 'ops' }).kind === 'ops');
}

// ---------- the picker line ----------
{
    ok('a template that carries nothing says so',
        describeTemplate({ name: 'X' }) === 'nothing but its name');
    const line = describeTemplate(coerceTemplate({
        name: 'X', kind: 'product', repos: ['a'], plan: ['p1', 'p2'], budgetUSD: 5
    }));
    ok('…and one that carries things lists them with their counts',
        /product/.test(line) && /1 repo\b/.test(line) && /2 plan items/.test(line)
        && /a budget/.test(line));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
