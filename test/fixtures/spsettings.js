/**
 * X-136 — Settings ▸ Superpowers & Engineering Discipline, in the three states
 * the folder can actually be in, because the whole point of the section is that
 * two boxes could not tell them apart:
 *
 *   1. READY    — the hook is there, the skills are behind it, and the matrix
 *                 says who opens a session with the discipline already on.
 *   2. NO HOOK  — a folder full of skills with no `using-superpowers/SKILL.md`
 *                 in it. A switched-on session is given NOTHING, which looks
 *                 exactly like the switch being off, so it is the loudest of
 *                 the three.
 *   3. NOT THERE — a path typed on another machine. Also the portable case:
 *                 what was typed sits above what it opened.
 *
 * And the fourth thing only the matrix shows: an agent nobody named is ticked
 * because the BUILT-IN list says so, not because anybody chose it.
 */
const settings = (items) => ([{
    id: 'superpowers', label: 'Superpowers & Engineering Discipline', items
}]);

const ITEMS = (root) => ([
    {
        key: 'agentFarm.superpowersPath', type: 'string', default: '', browse: 'folder',
        value: root, modified: !!root,
        description: 'Folder that holds the Superpowers engineering-discipline skills (one folder per skill, each with a SKILL.md, plus using-superpowers/SKILL.md — the root hook). Empty = found next to your agents.'
    },
    {
        key: 'agentFarm.superpowersDefaults', type: 'object', default: {},
        value: { developer: true }, modified: true,
        description: 'Which agents start a session with the Superpowers engineering discipline already switched on, keyed by the agent\'s NAME.'
    }
]);

const REAL = 'D:\\zone\\agent\\ajanlar\\_SKILLS\\superpowers';

const SKILLS = [
    { id: 'brainstorming', name: 'brainstorming', description: 'You MUST use this before any creative work — creating features, building components, adding functionality, or modifying behavior.', extras: 0 },
    { id: 'executing-plans', name: 'executing-plans', description: 'Use when you have a written implementation plan to execute in a separate session with review checkpoints', extras: 1 },
    { id: 'systematic-debugging', name: 'systematic-debugging', description: 'Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes', extras: 2 },
    { id: 'test-driven-development', name: 'test-driven-development', description: 'Use when implementing any feature or bugfix, before writing implementation code', extras: 0 },
    { id: 'using-superpowers', name: 'using-superpowers', description: 'Use when starting any conversation — establishes how to find and use skills', extras: 0 },
    { id: 'verification-before-completion', name: 'verification-before-completion', description: 'Use when about to claim work is complete, fixed, or passing, before committing or creating PRs', extras: 0 },
    { id: 'writing-plans', name: 'writing-plans', description: 'Use when you have a spec or requirements for a multi-step task, before touching code', extras: 0 },
    { id: 'writing-skills', name: 'writing-skills', description: 'Use when creating new skills, editing existing skills, or verifying skills work before deployment', extras: 3 }
];

const AGENTS = [
    { id: 'developer', name: 'developer', on: true, explicit: true },
    { id: 'manager', name: 'manager', on: false, explicit: true },
    // ‼️ Nobody has said anything about these three. Two of them are off and
    // one is on, and all three answers come from the built-in list rather than
    // from a choice — which is the distinction the row has to carry.
    { id: 'asistan', name: 'asistan', on: false, explicit: false },
    { id: 'psikolog', name: 'psikolog', on: false, explicit: false },
    { id: 'basit', name: 'basit', on: false, explicit: false }
];

const ready = () => ({
    root: REAL, setting: REAL, exists: true,
    hook: REAL + '\\using-superpowers\\SKILL.md', hookFound: true,
    skills: SKILLS, usable: true, why: '',
    defaults: { developer: true, manager: false },
    defaultAgents: ['developer'],
    agents: AGENTS
});

const noHook = () => ({
    ...ready(),
    hookFound: false, usable: false,
    skills: SKILLS.filter(s => s.id !== 'using-superpowers'),
    why: 'using-superpowers\\SKILL.md is missing — that file IS the hook; without it there is nothing to put in front of a model.'
});

const missing = () => ({
    root: 'C:\\Users\\rotam\\agents\\_SKILLS\\superpowers',
    setting: '%USERPROFILE%\\agents\\_SKILLS\\superpowers',
    exists: false,
    hook: 'C:\\Users\\rotam\\agents\\_SKILLS\\superpowers\\using-superpowers\\SKILL.md',
    hookFound: false, skills: [], usable: false,
    why: 'The skills folder is not there: C:\\Users\\rotam\\agents\\_SKILLS\\superpowers',
    defaults: {}, defaultAgents: ['developer'],
    agents: AGENTS.map(a => ({ ...a, explicit: false, on: a.name === 'developer' }))
});

const base = (superpowers, root) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: settings(ITEMS(root)),
    superpowers
});

const data = () => base(ready(), REAL);

const variants = () => ([
    { id: 'spsettings', label: 'Settings ▸ Superpowers — the folder can supply a session', data: base(ready(), REAL) },
    {
        id: 'spsettings-nohook',
        label: 'Settings ▸ Superpowers — ‼️ no hook, so a switched-on session gets nothing',
        data: base(noHook(), REAL)
    },
    {
        id: 'spsettings-missing',
        label: 'Settings ▸ Superpowers — a portable path typed on another machine',
        data: base(missing(), '%USERPROFILE%\\agents\\_SKILLS\\superpowers')
    }
]);

module.exports = { script: 'settings.js', data, variants, ready, noHook, missing };
