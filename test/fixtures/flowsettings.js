/**
 * U-152 — Settings ▸ Flow & Content, in the two states that decide whether the
 * card reads right:
 *
 *   1. SHIPPED — nothing set: every row inherited (drawn faint, no ↺), the
 *      origin column says "built-in default", and Balanced is ● in effect.
 *   2. TUNED — values set (inside taskRetry's object, a flat one, a tri) and a
 *      preset of the user's own that the values have moved off by one.
 *
 * ‼️ THE ROWS ARE DERIVED, NEVER TYPED: `flexSettingsState` over the real
 * registry, exactly what the host posts.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const A = require(path.join(ROOT, 'out', 'core', 'flexActions.js'));
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;

const KEYS = ['agentFarm.flexPresets'];

const categories = (values) => {
    const props = {};
    for (const k of KEYS) { props[k] = PROPS[k]; }
    return S.buildSettingsModel(props, (k) => (k in values ? values[k] : props[k].default));
};

const base = (values) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    alerts: null, telegram: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: categories(values),
    pathVars: [],
    pathPreview: {},
    valueSources: { agent: [] },
    flex: A.flexSettingsState({ readSetting: k => values[k], writeSetting: async () => undefined })
});

const data = () => base({});

const tuned = {
    'agentFarm.taskRetry': { max: 3, supervisor: { engine: 'claude', maxCalls: 4, lowConfidence: 'park' } },
    'agentFarm.judgeArgs': '--model claude-sonnet-5',
    'agentFarm.flexPresets': [{ name: 'Night shift', scope: 'global', values: { 'sentry.leaderBudgetUsd': 3, 'retry.supervisor.maxCalls': 4 } }]
};

const variants = () => ([
    {
        id: 'flowsettings',
        label: 'Settings ▸ Flow & Content — as shipped: every row inherited and faint, Balanced in effect',
        data: base({})
    },
    {
        id: 'flowsettings-tuned',
        label: 'Settings ▸ Flow & Content — ‼️ three values set (one inside taskRetry, one tri), a preset of your own',
        data: base(tuned)
    }
]);

module.exports = { script: 'settings.js', data, variants };
