/**
 * U-227 — Farm Settings with EVERY agentFarm.* setting of the manifest, built by the real model
 * (settingsops.buildSettingsModel), so a row the catalog files and the manifest describes is drawn
 * exactly as the page draws it. The page-level cards (engines, Claude Code, folders, Open with) are
 * left out: this fixture is about the setting rows. A few rows are changed from their default — the
 * first switch, the first pick-one list, the first number with a unit and the first path — so the
 * changed mark, the reset button and a value in its unit are on the page too.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;

function changed() {
    const keys = Object.keys(PROPS);
    const first = f => keys.find(k => f(PROPS[k], k));
    const out = {};
    const b = first(p => p.type === 'boolean');
    if (b) { out[b] = !PROPS[b].default; }
    const e = first(p => Array.isArray(p.enum) && p.enum.length > 1);
    if (e) { out[e] = PROPS[e].enum.find(o => o !== PROPS[e].default); }
    const n = first((p, k) => p.type === 'number' && /Seconds$|Pct$|Minutes$/.test(k));
    if (n) { out[n] = Number(PROPS[n].default || 0) + 10; }
    const f = first(p => p['x-af-browse'] === 'folder' && p.type === 'string');
    if (f) { out[f] = 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA'; }
    return out;
}

const base = (values) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    alerts: null, telegram: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: S.buildSettingsModel(PROPS, k => (k in values ? values[k] : PROPS[k].default)),
    pathVars: [],
    pathPreview: {},
    valueSources: { agent: ['developer', 'psikolog', 'basit'] }
});

const data = () => base(changed());

const variants = () => ([
    {
        id: 'allsettings',
        label: 'Settings — every setting of the manifest in its section and group; four changed from their default',
        data: base(changed())
    }
]);

module.exports = { script: 'settings.js', data, variants };
