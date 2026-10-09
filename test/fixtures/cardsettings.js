/**
 * U-233 — the one card a special block of Farm Settings is drawn as. "Open with" ready, and warning when a custom
 * app has no command (its Details open on the boxes that fix it); "Agent folders" ready on one line, and warning on a
 * folder listed twice and one that is gone (Details open on the roots and their agents); Engines and Claude Code ready,
 * and warning with no engine ready and a settings.json that does not parse. Each scene opens only the
 * section its card heads, with one row or none beside it, so it shows the card and nothing the other fixtures measure.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const ALL = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;
const { withCardSections } = require('../lib_settings_model.js');

const PROPS = { 'agentFarm.consoleDropZone': ALL['agentFarm.consoleDropZone'] };
const MODES = ['vscode', 'preview', 'obsidian', 'custom'];

const base = (docOpen, folders, more) => Object.assign({
    focus: '', profiles: [], prompts: null, docOpen, folders: folders || null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    alerts: null, telegram: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: withCardSections(S.buildSettingsModel(PROPS, k => PROPS[k].default), ['agents', 'engines']),
    pathVars: [],
    pathPreview: {},
    valueSources: {}
}, more);

const READY = { defaultMode: 'preview', modes: MODES, customCommand: '', customArgs: '{file}' };
const WARN = { defaultMode: 'custom', modes: MODES, customCommand: '', customArgs: '{file}' };
const state = { open: ['general'] };

const agent = (dir, name, extra) => Object.assign({ dir, name, excluded: false, agentId: 'id-' + name }, extra);
const NEST = {
    root: 'D:/zone/agents', kind: 'nest', duplicate: false,
    candidates: [agent('D:/zone/agents/developer', 'developer'), agent('D:/zone/agents/writer', 'writer'),
        agent('D:/zone/agents/old', 'old', { excluded: true, agentId: '' })]
};
const FOLDERS = { reports: [NEST], excludes: ['D:/zone/agents/old'] };
const FOLDERS_WARN = {
    reports: [NEST, { root: 'd:/zone/agents', kind: 'plain', duplicate: true, candidates: [] },
        { root: 'E:/agents', kind: 'missing', duplicate: false, candidates: [] }],
    excludes: ['D:/zone/agents/old']
};
const agents = { open: ['agents'] };

const ENGINES = require('./engines.js').engines;
const CC = require(path.join(ROOT, 'out', 'core', 'claudesettings.js'));
const claude = parseError => ({
    file: 'C:/Users/me/.claude/settings.json', parseError, raw: '{\n  "model": "opus"\n}',
    items: JSON.parse(JSON.stringify(CC.buildClaudeModel({ model: 'opus', env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: '1' } })))
});
const ACCOUNTS = { engines: ENGINES(), claude: claude('') };
const ACCOUNTS_WARN = { engines: ENGINES().map(e => Object.assign(e, { ready: false })), claude: claude('Unexpected token } in JSON at position 18') };
const engines = { open: ['engines'] };

const data = () => base(READY);

const variants = () => ([
    { id: 'cardsettings', label: 'Settings — the Open with card, ready: its state, its sentence and its pick on one line', data: base(READY), state },
    {
        id: 'cardsettings-warn',
        label: 'Settings — the same card warning: a custom app with no command, Details open on the boxes that fix it',
        data: base(WARN), state
    },
    {
        id: 'cardsettings-folders',
        label: 'Settings — the Agent folders card, ready: two agents in one folder and + Add folder on one line, the roots behind Details',
        data: base(null, FOLDERS), state: agents
    },
    {
        id: 'cardsettings-folders-warn',
        label: 'Settings — the same card warning: a folder listed twice and one that is gone, Clean duplicates beside + Add folder, Details open on the roots and their agents',
        data: base(null, FOLDERS_WARN), state: agents
    },
    {
        id: 'cardsettings-engines',
        label: 'Settings — the Engines and Claude Code cards, ready: what runs, what its settings.json sets, and the page each opens, one line each',
        data: base(null, null, ACCOUNTS), state: engines
    },
    {
        id: 'cardsettings-engines-warn',
        label: 'Settings — both warning: no engine ready and a settings.json that does not parse, Details open on the rows and the raw editor',
        data: base(null, null, ACCOUNTS_WARN), state: engines
    }
]);

module.exports = { script: 'settings.js', data, variants };
