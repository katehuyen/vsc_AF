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

// Typing redraws #setbody only, and the stub never writes a typed value back into the markup, so the
// picture's box is given its value attribute here, after the page has answered the input.
const typed = q => r => {
    const box = r.query('#filter')[0];
    box.value = q;
    box.fire('input');
    const app = r.els.app;
    app.innerHTML = app.innerHTML.replace(/(<input id="filter"[^>]*?)value=""/, `$1value="${q}"`);
};

const variants = () => ([
    {
        id: 'allsettings',
        label: 'Settings — every setting of the manifest in its section and group; four changed from their default',
        data: base(changed())
    },
    {
        id: 'allsettings-sound', query: 'sound',
        label: 'Settings — the search "sound": a ranked list, the sound settings first, each row naming its section and group',
        // one webhook event: a list's disabled first/last arrows are the first scene's to measure, not the search's
        data: base(Object.assign(changed(), { 'agentFarm.notifyWebhookEvents': ['permission'] })), act: typed('sound')
    },
    {
        id: 'allsettings-port', query: 'port',
        label: 'Settings — the search "port": sections ordered by their best hit, the three port settings ahead of every report setting',
        data: base(changed()), act: typed('port')
    },
    {
        id: 'allsettings-none', query: 'zzz',
        label: 'Settings — a search nothing matches: the query said back and one button back to every setting',
        data: base(changed()), act: typed('zzz')
    },
    {
        id: 'allsettings-changed', changed: true,
        label: 'Settings — Changed pressed: only the four settings changed from their default, with their reset',
        data: base(changed()), act: r => { r.query('#setchanged')[0].click(); }
    }
]);

module.exports = { script: 'settings.js', data, variants };
