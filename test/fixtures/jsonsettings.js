/**
 * U-89 — the settings that are a raw JSON box, which is where the page was
 * unusable.
 *
 * ‼️ THE MODEL IS BUILT FROM THE REAL MANIFEST, not from a hand-written
 * fixture. The whole claim of this change is that the answer to "what goes in
 * here" is DERIVED from the schema Agent Farm already ships — so a picture made
 * from invented data would prove nothing at all. `buildSettingsModel` is handed
 * `package.json`'s own `agentFarm.*` properties, and what is drawn is what a
 * user sees.
 *
 * Four rows, one of each shape the derivation has to get right:
 *   · `cliProfiles`      — a list of ENTRIES with declared, described fields.
 *   · `browserAllowHosts`— a plain list of strings: no JSON to get right at all.
 *   · `taskRetry`        — one object, sixteen described fields, the widest
 *                          panel on the page and the one that has to scroll.
 *   · `budgets`          — a free-form map: nothing can list the keys, so the
 *                          example is built from the shipped default.
 */
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'out', 'core', 'settingsops.js'));
const manifest = require(path.join(__dirname, '..', '..', 'package.json'));

const SHOWN = [
    'agentFarm.cliProfiles',
    'agentFarm.browserAllowHosts',
    'agentFarm.taskRetry',
    'agentFarm.budgets'
];

// What the user has actually put in each box. A live value beside a derived
// shape is the whole reading: "this is what is in there, this is what may be".
const VALUES = {
    'agentFarm.cliProfiles': [
        { name: 'gece-tarayici', command: 'my-cli --headless "{prompt}"' }
    ],
    'agentFarm.browserAllowHosts': ['docs.anthropic.com', 'code.visualstudio.com'],
    'agentFarm.taskRetry': { max: 3, delayMin: 30, when: 'limit' },
    'agentFarm.budgets': {}
};

const model = () => {
    const props = {};
    for (const key of SHOWN) {
        props[key] = manifest.contributes.configuration.properties[key];
    }
    const cats = S.buildSettingsModel(props,
        (key) => (VALUES[key] !== undefined ? VALUES[key] : props[key].default));
    // One section, in the order above, so the four shapes read as a series
    // rather than as whatever the category map happened to do with them.
    const items = [];
    for (const key of SHOWN) {
        for (const c of cats) {
            const hit = c.items.find(i => i.key === key);
            if (hit) { items.push(hit); }
        }
    }
    return [{ id: 'json', label: 'The settings that are a JSON box', items }];
};

const data = () => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: model(),
    superpowers: null
});

const variants = () => ([
    {
        id: 'jsonsettings',
        label: 'Settings — a JSON box now says what goes in it, and can write one',
        data: data()
    },
    {
        // ‼️ The panel IS the change. Shut, the row gains one chip; the field
        // table, the allowed values and the example only exist inside it — so
        // it is photographed with `--tip tip-shape:<n>` (U-81), which opens it
        // with the component's own stay-open class at its real size.
        id: 'jsonsettings-open',
        label: 'Settings — the shape panel, open (shoot with --tip tip-shape:1)',
        data: data()
    }
]);

module.exports = { script: 'settings.js', data, variants };
