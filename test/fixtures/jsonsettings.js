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
 * One row of each shape the derivation has to get right:
 *   · `cliProfiles`      — a list of ENTRIES with declared, described fields:
 *                          a TABLE, one row per entry (U-109).
 *   · `browserAllowHosts`— a plain list of strings: no JSON to get right at all.
 *   · `agentRoots`        — the same, but of PATHS, so every row gets a Browse
 *                          (U-108). Which lists do is a fact of the schema.
 *   · `taskRetry`        — one object, sixteen described fields: a FORM, and the
 *                          tallest control on the page (U-109).
 *   · `livingChecks`     — the last box the schema refused to describe. Now a
 *                          table with two REQUIRED columns and one field the
 *                          schema does not flatten (`when`), which keeps its
 *                          JSON in a single cell rather than pretending to be
 *                          a text field.
 *   · `budgets`          — a set of name → NUMBER pairs, whose names are agent
 *                          names and whose `*` is the whole fleet (U-110).
 *   · `superpowersDefaults` — name → BOOLEAN, and NO wildcard: the three maps
 *                          do not agree, which is why each declares its own.
 *   · `alerts.voices`    — A-18: a FORM whose fields are STRINGS rather than
 *                          the checkboxes and numbers `taskRetry` is made of.
 *                          The same derivation drew it the day the setting was
 *                          declared, with nobody editing the page — which is
 *                          the whole claim, and is only proved by a shape it
 *                          had not seen before.
 */
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'out', 'core', 'settingsops.js'));
const manifest = require(path.join(__dirname, '..', '..', 'package.json'));

const SHOWN = [
    'agentFarm.cliProfiles',
    'agentFarm.browserAllowHosts',
    'agentFarm.agentRoots',
    'agentFarm.taskRetry',
    'agentFarm.livingChecks',
    'agentFarm.budgets',
    'agentFarm.superpowersDefaults',
    'agentFarm.alerts.voices'
];

/**
 * ‼️ U-110 — THE FLEET, because the name box SUGGESTS out of it.
 *
 * A budget filed under a misspelled agent name never applies and never says
 * why, so the page offers the names it is already holding. A fixture with no
 * fleet would photograph a suggestion list that is empty for a reason nobody
 * could see.
 */
const FOLDERS = {
    excludes: [],
    reports: [{
        root: 'D:/zone/agent/ajanlar', kind: 'nest', duplicate: false,
        candidates: [
            { name: 'developer', dir: 'D:/zone/agent/ajanlar/developer', excluded: false },
            { name: 'asistan', dir: 'D:/zone/agent/ajanlar/asistan', excluded: false },
            { name: 'psikolog', dir: 'D:/zone/agent/ajanlar/psikolog', excluded: false }
        ]
    }]
};

// What the user has actually put in each box. A live value beside a derived
// shape is the whole reading: "this is what is in there, this is what may be".
const VALUES = {
    'agentFarm.cliProfiles': [
        { name: 'gece-tarayici', command: 'my-cli --headless "{prompt}"' }
    ],
    'agentFarm.browserAllowHosts': ['docs.anthropic.com', 'code.visualstudio.com'],
    'agentFarm.agentRoots': ['D:/zone/agent/ajanlar', 'D:/zone/dev/git/miropharm'],
    'agentFarm.taskRetry': { max: 3, delayMin: 30, when: 'limit' },
    'agentFarm.livingChecks': [
        {
            label: 'bugünün günlüğü yazıldı',
            when: { kind: 'fileMissing', path: '01_INBOX/{today}.md' },
            level: 'alert',
            hint: 'Günlüğü aç ve bugünün satırını yaz.'
        },
        {
            label: 'gelen kutusu boşaltıldı',
            when: { kind: 'folderHasFiles', path: '01_INBOX/00_GELEN', except: ['_LOG_.md'] },
            level: 'warn'
        }
    ],
    'agentFarm.budgets': { developer: 20, '*': 50 },
    'agentFarm.superpowersDefaults': { developer: true, asistan: false }
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
    focus: '', profiles: [], prompts: null, docOpen: null, folders: FOLDERS,
    claude: null, engines: null, engineModels: null, wiki: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: model(),
    superpowers: null
});

const variants = () => ([
    {
        id: 'jsonsettings',
        label: 'Settings — a plain list is a list of boxes, not a JSON document (U-108)',
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
