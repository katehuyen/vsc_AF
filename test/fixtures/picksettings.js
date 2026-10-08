/**
 * U-229 — Farm Settings rows whose right values are known, drawn as pickers by the real model
 * (settingsops.buildSettingsModel + the catalog's control): models from each engine's own list, an engine,
 * an effort, an agent, a secret name, a local Airtable database, a weekday and an hour, a time with its off
 * switch, chips, an ordered ladder, the web token, and the folders that gained Browse. Several rows hold a
 * stored value no list has, which is drawn as itself — the case the item exists to keep from moving.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const { settingValueSources } = require(path.join(ROOT, 'out', 'core', 'settingSources.js'));
const ALL = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;

const KEYS = ['newAgentModel', 'quotaDowngradeModel', 'wikiEngine', 'wikiModel', 'sentryLeaderEngine', 'sentryLeaderModel',
    'libraryEnrichModel', 'libraryEnrichVideoModel', 'libraryEnrichEffort', 'showrunner', 'mediaAuthSecret', 'replicateAuthSecret',
    'kapici.keyName', 'studioLibraryBase', 'projectDigestDay', 'projectDigestHour', 'dailyDigest', 'airtableInputStages',
    'studioLibraryStages', 'libraryEnrichSections', 'judgeLadder', 'web.token', 'vaultDir', 'reportDir'];
const PROPS = Object.fromEntries(KEYS.map(k => ['agentFarm.' + k, ALL['agentFarm.' + k]]));

const VALUES = {
    'agentFarm.quotaDowngradeModel': 'claude-haiku-4-5-20251001',
    'agentFarm.wikiEngine': 'agy',
    'agentFarm.wikiModel': 'gemini-3.8-pro-high',
    'agentFarm.sentryLeaderModel': 'opus',
    'agentFarm.libraryEnrichEffort': 'medium',
    'agentFarm.showrunner': 'youtuber',
    'agentFarm.mediaAuthSecret': 'FAL_KEY',
    'agentFarm.replicateAuthSecret': 'OLD_REPLICATE_TOKEN',
    'agentFarm.studioLibraryBase': 'stem',
    'agentFarm.projectDigestDay': 1,
    'agentFarm.projectDigestHour': 9,
    'agentFarm.dailyDigest': '21:30',
    'agentFarm.airtableInputStages': 'asset, final, archive',
    'agentFarm.libraryEnrichSections': 'identity, tags',
    'agentFarm.judgeLadder': 'haiku,sonnet,my-judge',
    'agentFarm.web.token': '9f2c4e1a7b3d5f60a8c2e4b6d8f0a1c3',
    'agentFarm.vaultDir': 'D:\\zone\\know\\note\\obsidian'
};

const choice = id => ({ id, label: id, detail: '' });
const ENGINE_MODELS = {
    claude: {
        models: [choice(''), ...['haiku', 'sonnet', 'opus', 'fable', 'claude-sonnet-5'].map(choice)],
        efforts: { '': ['low', 'medium', 'high', 'xhigh', 'max'].map(choice) }, defaultEffort: {}, source: 'aliases', note: ''
    },
    agy: {
        models: [choice(''), ...['gemini-3.8-flash-low', 'gemini-3.8-pro-high', 'gemini-3.8-pro-low'].map(choice)],
        efforts: { '': [] }, defaultEffort: {}, source: 'cli', note: ''
    }
};

const base = (values) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: ENGINE_MODELS, wiki: null, superpowers: null,
    alerts: null, telegram: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: S.buildSettingsModel(PROPS, k => (k in values ? values[k] : PROPS[k].default)),
    pathVars: [],
    pathPreview: {},
    valueSources: settingValueSources({
        agentNames: () => ['developer', 'psikolog', 'youtuber', 'basit'],
        secretNames: () => ['FAL_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'TYPESAFE_API_KEY'],
        airtableBases: () => ['stem', 'studio']
    })
});

const data = () => base(VALUES);

// the pickers' sections open and the setting sets bar left shut: that bar is measured by allsettings, and this
// fixture holds the theme audits to no budget at all, so a contrast debt here is the pickers' own
const state = d => ({ open: d.categories.map(c => c.id), more: ['*'] });

const variants = () => ([
    { id: 'picksettings', label: 'Settings — every picker U-229 draws, several holding a stored value no list has', data: base(VALUES), state: state(base(VALUES)) },
    {
        id: 'picksettings-off',
        label: 'Settings — the same rows left at their defaults: the digest off, the ladder empty, no token',
        data: base({}), state: state(base({}))
    }
]);

module.exports = { script: 'settings.js', data, variants, VALUES, KEYS };
