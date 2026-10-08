/**
 * X-57 — Settings ▸ Wiki & Knowledge Base, in the three states the folder can
 * actually be in, because the whole point of the section is that a path in a
 * box cannot tell them apart:
 *
 *   1. READY      — the law, the index and the log are there, and it says what
 *                   the wiki holds.
 *   2. NO LAW     — the folder exists and looks configured, and every compile
 *                   refuses. This is the invisible failure the section exists
 *                   for, so it is drawn in the loudest of the three.
 *   3. NOT THERE  — a path typed on another machine. Also the portable case:
 *                   what was typed sits above what it opened.
 */
// U-226 — filed by the catalog, as the host files them
const settings = (items) => require('../../out/core/settingsops.js').groupIntoSections(items);

const ITEMS = (root) => ([
    {
        key: 'agentFarm.wikiRoot', type: 'string', default: '', browse: 'folder', value: root,
        modified: !!root,
        description: 'Folder that holds the LLM wiki — one folder per category, a page per concept, plus index.md, log.md and _KURALLAR_/-WIKI-ANAYASA-.md. Portable: %USERPROFILE%, ~, $HOME, ${env:VAR} and ${workspaceRoot} are expanded when the folder is opened.'
    },
    {
        key: 'agentFarm.wikiAgent', type: 'string', default: '', value: 'developer', modified: true,
        description: 'Which agent writes the wiki.'
    },
    {
        key: 'agentFarm.wikiEngine', type: 'string', default: '', value: '', modified: false,
        enum: ['', 'claude', 'codex', 'gemini', 'agy', 'opencode'],
        description: 'Which engine a wiki compile runs on when the call does not name one.'
    },
    {
        key: 'agentFarm.wikiModel', type: 'string', default: '', value: 'opus', modified: true,
        description: '--model for a wiki compile (alias or full id) when the call does not name one.'
    },
    {
        key: 'agentFarm.wikiEffort', type: 'string', default: '', value: 'high', modified: true,
        enum: ['', 'low', 'medium', 'high', 'xhigh', 'max'],
        description: '--effort for a wiki compile when the call does not name one.'
    }
]);

const REAL = 'D:\\zone\\know\\note\\obsidian\\00_WIKI';

const files = (root, found) => ([
    { rel: '_KURALLAR_/-WIKI-ANAYASA-.md', file: root + '\\_KURALLAR_\\-WIKI-ANAYASA-.md', found: found[0] },
    { rel: 'index.md', file: root + '\\index.md', found: found[1] },
    { rel: 'log.md', file: root + '\\log.md', found: found[2] }
]);

const ready = () => ({
    root: REAL, setting: REAL, exists: true,
    files: files(REAL, [true, true, true]),
    missing: [],
    categories: [
        { name: 'Ajanlar', pages: 6 },
        { name: 'Felsefe', pages: 2 },
        { name: 'Mimari', pages: 11 },
        { name: 'Teknoloji - Elektronik', pages: 3 },
        { name: 'Teknoloji - Tarım', pages: 0 }
    ],
    pages: 22, misplaced: [], compilable: true
});

const noLaw = () => ({
    ...ready(),
    files: files(REAL, [false, true, true]),
    missing: ['_KURALLAR_/-WIKI-ANAYASA-.md'],
    categories: [{ name: 'Ajanlar', pages: 1 }],
    pages: 1,
    // A second level, which is the other thing a reader would never notice.
    misplaced: ['Ajanlar\\Eski'],
    compilable: false
});

const missing = () => ({
    root: 'C:\\Users\\rotam\\vault\\00_WIKI',
    setting: '%USERPROFILE%\\vault\\00_WIKI',
    exists: false,
    files: files('C:\\Users\\rotam\\vault\\00_WIKI', [false, false, false]),
    missing: ['_KURALLAR_/-WIKI-ANAYASA-.md', 'index.md', 'log.md'],
    categories: [], pages: 0, misplaced: [], compilable: false
});

const base = (wiki, root) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: settings(ITEMS(root)),
    wiki
});

const data = () => base(ready(), REAL);

const variants = () => ([
    { id: 'wikisettings', label: 'Settings ▸ Wiki — the folder is a wiki', data: base(ready(), REAL) },
    {
        id: 'wikisettings-nolaw',
        label: 'Settings ▸ Wiki — ‼️ the law is missing, so every compile refuses',
        data: base(noLaw(), REAL)
    },
    {
        id: 'wikisettings-missing',
        label: 'Settings ▸ Wiki — a portable path typed on another machine',
        data: base(missing(), '%USERPROFILE%\\vault\\00_WIKI')
    }
]);

module.exports = { script: 'settings.js', data, variants, ready, noLaw, missing };
