/**
 * U-155 — Farm Settings' Kapıcı section: the status head (the key, the rules,
 * how often each consumer's shadow agreed) over its nine settings.
 *
 * The settings are built from the REAL manifest (every `agentFarm.kapici.*`
 * property, filed by the real category map), so a setting added later is in
 * the picture without anybody editing this file. The status is the shape
 * `kapici.status` answers, taken from the live bridge.
 *
 * Smallest first: the state the user is actually in today — no key, nothing
 * compared, every consumer off. Then what "missing" means, on its panel. Then
 * the far end: a key, two consumers in shadow, and a rule file that broke.
 */
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'out', 'core', 'settingsops.js'));
const manifest = require(path.join(__dirname, '..', '..', 'package.json'));

const PROPS = manifest.contributes.configuration.properties;
const KEYS = Object.keys(PROPS).filter(k => k.indexOf('agentFarm.kapici.') === 0);

const model = (values) => {
    const props = {};
    for (const key of KEYS) { props[key] = PROPS[key]; }
    const cats = S.buildSettingsModel(props, key => (values[key] !== undefined ? values[key] : props[key].default));
    return cats.filter(c => c.id === 'kapici');
};

const status = (o) => Object.assign({
    key: { name: 'TYPESAFE_API_KEY', present: false, route: 'typesafe', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0' },
    candidates: [{ name: 'TYPESAFE_API_KEY', present: false }, { name: 'AI_GATEWAY_API_KEY', present: false }],
    providers: { chain: ['heuristic', 'jev'], llm: true },
    timeoutMs: 3000, rules: 3, problems: [], rulesDirs: ['D:\\zone\\agent\\ajanlar\\_KAPICI'],
    agreement: {},
    mcp: MCP({})
}, o);

function MCP(o) {
    return Object.assign({ staged: true, path: '${APPDATA}\\Code\\User\\globalStorage\\muvusoft.agent-farm\\mcp\\kapici\\index.js',
        registered: false, upToDate: false, configFile: 'C:\\Users\\x\\.claude.json' }, o);
}

const data = (values, st) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: model(values),
    superpowers: null,
    kapici: st
});

const SHADOW = {
    key: { name: 'TYPESAFE_API_KEY', present: true, route: 'typesafe', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0' },
    candidates: [{ name: 'TYPESAFE_API_KEY', present: true }, { name: 'AI_GATEWAY_API_KEY', present: false }],
    rules: 4,
    mcp: MCP({ registered: true, upToDate: true }),
    problems: [{ layer: 'system', file: 'D:\\zone\\agent\\ajanlar\\_KAPICI\\metin.tek-satir.json', error: 'questions.line: needs a type' }],
    agreement: {
        trigger: { compared: 41, agreed: 38, rate: 38 / 41, confidence: { min: 0.61, median: 0.9, max: 0.98 }, disagreements: [] },
        dispatch: { compared: 12, agreed: 9, rate: 0.75, confidence: { min: 0.52, median: 0.81, max: 0.95 }, disagreements: [] }
    }
};

const variants = () => ([
    {
        id: 'kapicisettings',
        label: 'Settings — Kapıcı: no key, nothing compared, every consumer off (U-155)',
        data: data({}, status({}))
    },
    {
        id: 'kapicisettings-key', tip: 'tip-kpc-key:1',
        label: 'Settings — Kapıcı: the missing key\'s panel, open (U-155)',
        data: data({}, status({}))
    },
    {
        id: 'kapicisettings-mcp', tip: 'tip-kpc-mcp:1',
        label: 'Settings — Kapıcı: the MCP not given to agents yet, its panel open (B-28)',
        data: data({}, status({}))
    },
    {
        id: 'kapicisettings-shadow', tip: 'tip-kpc-agree:1',
        label: 'Settings — Kapıcı: a key, triggers and routing in shadow, one broken rule file, the MCP given; the agreement panel open (U-155)',
        data: data({ 'agentFarm.kapici.trigger': 'shadow', 'agentFarm.kapici.dispatch': 'shadow' }, status(SHADOW))
    }
]);

module.exports = { script: 'settings.js', data: () => data({}, status({})), variants, window: { __AFUI__: { version: '3.750.0' } } };
