// U-229 — a Farm Settings row whose right values are known is set with the mouse alone: a model from its engine's
// own list (+ Custom…), an engine, an effort, an agent, a secret NAME (+ Set secret…), a local Airtable database,
// a weekday, an hour, a time with its off switch, chips, an ordered ladder, the web token's Show / Generate / Copy,
// and Browse on every folder. A stored value no list holds is drawn as itself and drawing never writes a value.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const CAT = require(path.join(ROOT, 'out', 'core', 'settingsCatalog', 'index.js'));
const { settingValueSources } = require(path.join(ROOT, 'out', 'core', 'settingSources.js'));
const { ENGINE_IDS } = require(path.join(ROOT, 'out', 'core', 'engines.js'));
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;
const { runPage } = require('./lib_page_dom.js');
const fx = require('./fixtures/picksettings.js');

const K = k => 'agentFarm.' + k;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- the host's half: the catalog names a control the page can draw, from a source the host fills ----------
{
    const src = settingValueSources({});
    const bad = [];
    for (const k of CAT.catalogKeys()) {
        const e = CAT.catalogEntry(k);
        if (!e.control) { continue; }
        const from = e.control === 'chips' || e.control === 'orderedChips' ? e.from : e.control;
        if ((e.control === 'chips' || e.control === 'orderedChips') && !e.from) { bad.push(k + ' (chips without from)'); }
        if (['agent', 'engine', 'secret', 'airtableBase', 'stage', 'enrichSection'].includes(from) && !(from in src)) { bad.push(k + ' (no source ' + from + ')'); }
        if ((from === 'model' || from === 'effort') && !e.engine && !e.engineFrom) { bad.push(k + ' (a model with no engine)'); }
        if (e.engine && !ENGINE_IDS.includes(e.engine)) { bad.push(k + ' (engine ' + e.engine + ')'); }
        if (e.engineFrom && !CAT.catalogEntry(e.engineFrom)) { bad.push(k + ' (engineFrom ' + e.engineFrom + ')'); }
    }
    ok('every control the catalog names has its values: a source the host fills, or an engine' + (bad.length ? ': ' + bad.join(', ') : ''), bad.length === 0);
    ok('the engine list is the engines the product knows', src.engine.join() === ENGINE_IDS.join());
    const at = (values, key) => S.buildSettingsModel(PROPS, k => (k in values ? values[k] : PROPS[k].default))
        .flatMap(c => c.items).find(i => i.key === K(key));
    ok('a model picker follows the setting that names its engine: wikiEngine empty is claude, agy is agy',
        at({}, 'wikiModel').engine === 'claude' && at({ [K('wikiEngine')]: 'agy' }, 'wikiModel').engine === 'agy'
        && at({ [K('sentryLeaderEngine')]: 'codex' }, 'sentryLeaderModel').engine === 'codex');
    ok('…and a fixed one keeps its own: the video model is agy\'s', at({}, 'libraryEnrichVideoModel').engine === 'agy');
    const folders = ['claudeDir', 'projectsRoot', 'projectsArchiveRoot', 'kapici.rulesDir', 'contentCalendarDir', 'toolOutDir', 'codexHome',
        'geminiDir', 'agyHome', 'autoReportFolder', 'digestTtsFolder', 'reportDir', 'vaultDir', 'answerDir'];
    const noBrowse = folders.filter(k => (PROPS[K(k)] || {})['x-af-browse'] !== 'folder' || PROPS[K(k)].type !== 'string');
    ok('the fourteen folder settings declare Browse and stay strings' + (noBrowse.length ? ': ' + noBrowse.join(', ') : ''), noBrowse.length === 0);
}

// ---------- the page ----------
const p = runPage(fx.script, fx.data());
const html = p.html();
const sel = key => (html.match(new RegExp(`<select id="c-${esc(key)}"[\\s\\S]*?</select>`)) || [''])[0];
const opts = key => (sel(key).match(/<option[^>]*>[^<]*/g) || []).map(o => o.replace(/^<option[^>]*>/, ''));
const picked = key => ((sel(key).match(/<option[^>]*selected[^>]*>([^<]*)/) || [])[1] || '');
const el = (attr, key) => p.query(`[data-${attr}]`).find(e => e.dataset[attr] === K(key));
const sets = () => p.posted.filter(m => m && m.type === 'set');

ok('drawing the page writes nothing — no stored value is moved', sets().length === 0);

// models
ok('a model is picked from its engine\'s list, with Not set first and Custom… last',
    opts('newAgentModel')[0] === '— not set —' && ['haiku', 'sonnet', 'opus', 'claude-sonnet-5'].every(m => opts('newAgentModel').includes(m))
    && opts('newAgentModel').slice(-1)[0] === 'Custom…' && picked('newAgentModel') === 'sonnet' && !!el('pick', 'newAgentModel'));
ok('a stored model id the list lacks is drawn as itself, marked custom, and stays chosen',
    picked('quotaDowngradeModel') === 'claude-haiku-4-5-20251001 (custom)');
ok('the wiki model lists the wiki engine\'s models (agy), not claude\'s',
    opts('wikiModel').includes('gemini-3.8-pro-high') && !opts('wikiModel').includes('opus') && picked('wikiModel') === 'gemini-3.8-pro-high');
ok('the video model lists agy\'s, the image model claude\'s',
    opts('libraryEnrichVideoModel').includes('gemini-3.8-flash-low') && opts('libraryEnrichModel').includes('sonnet'));
{
    const m = el('pick', 'sentryLeaderModel');
    m.value = 'haiku'; m.fire('change');
    ok('picking a model writes it', JSON.stringify(sets().slice(-1)[0]) === JSON.stringify({ type: 'set', key: K('sentryLeaderModel'), value: 'haiku' }));
    const n = sets().length;
    m.value = '__custom__'; m.fire('change');
    ok('Custom… opens a box for a typed id and writes nothing yet', sets().length === n && !!el('custom', 'sentryLeaderModel'));
    const box = el('custom', 'sentryLeaderModel');
    box.fire('keydown', { key: 'Escape' });
    ok('…Esc goes back to the list', !el('custom', 'sentryLeaderModel') && !!el('pick', 'sentryLeaderModel'));
}

// engine, effort, agent, base
ok('an engine is picked from the engines the product knows', ENGINE_IDS.every(e => opts('sentryLeaderEngine').includes(e)));
ok('an effort is picked from the engine\'s efforts', ['low', 'medium', 'max'].every(e => opts('libraryEnrichEffort').includes(e)) && picked('libraryEnrichEffort') === 'medium');
ok('the showrunner is picked from the agents', opts('showrunner').includes('developer') && picked('showrunner') === 'youtuber');
ok('the Studio database is picked from the local Airtable databases', opts('studioLibraryBase').includes('studio') && picked('studioLibraryBase') === 'stem');
{
    const e = el('set', 'libraryEnrichEffort');
    e.value = 'high'; e.fire('change');
    ok('picking an effort writes it', JSON.stringify(sets().slice(-1)[0]) === JSON.stringify({ type: 'set', key: K('libraryEnrichEffort'), value: 'high' }));
}

// secrets: names only
ok('a secret is picked by name from the vault, with Set secret… last',
    opts('mediaAuthSecret').includes('GEMINI_API_KEY') && picked('mediaAuthSecret') === 'FAL_KEY' && opts('mediaAuthSecret').slice(-1)[0] === 'Set secret…');
ok('a stored name the vault does not hold is drawn as itself, not in the vault',
    picked('replicateAuthSecret') === 'OLD_REPLICATE_TOKEN (not in vault)');
{
    const r = el('pick', 'replicateAuthSecret');
    r.value = '__secret__'; r.fire('change');
    ok('Set secret… on a stored name opens the Secrets page to store that name',
        JSON.stringify(p.last()) === JSON.stringify({ type: 'engineKey', name: 'OLD_REPLICATE_TOKEN' }));
    const g = el('pick', 'kapici.keyName');
    g.value = '__secret__'; g.fire('change');
    ok('…on an empty one it opens the Secrets page', JSON.stringify(p.last()) === JSON.stringify({ type: 'openSecrets' }));
}

// weekday, hour, time
ok('a weekday is picked by its name, Off first', opts('projectDigestDay')[0] === 'Off' && opts('projectDigestDay').length === 8 && picked('projectDigestDay') === 'Monday');
ok('an hour is picked from the 24 of a day', opts('projectDigestHour').length === 24 && picked('projectDigestHour') === '09:00');
{
    const d = el('set', 'projectDigestDay');
    d.value = '3'; d.fire('change');
    ok('picking a weekday writes its number', JSON.stringify(sets().slice(-1)[0]) === JSON.stringify({ type: 'set', key: K('projectDigestDay'), value: '3' }));
}
ok('a time is a time box beside its switch, on at the stored time',
    /<input type="checkbox" role="switch" class="setswitch" data-timeoff="agentFarm\.dailyDigest" checked/.test(html)
    && /<input type="time" id="c-dailyDigest" data-set="agentFarm\.dailyDigest"\s+value="21:30" aria-label/.test(html));
{
    const sw = el('timeoff', 'dailyDigest');
    sw.checked = false; sw.fire('change');
    ok('switching the time off writes off', JSON.stringify(sets().slice(-1)[0]) === JSON.stringify({ type: 'set', key: K('dailyDigest'), value: 'off' }));
}

// chips
{
    const chip = v => p.query('[data-chip]').find(e => e.dataset.chipkey === K('airtableInputStages') && e.dataset.chip === v);
    ok('a comma list is a row of chips: the known values, plus a stored one nobody knows, pressed',
        ['source', 'raw', 'semi', 'final', 'asset', 'archive'].every(v => !!chip(v))
        && /data-chip="archive"/.test(html) && /class="setchip on lost"[^>]*data-chip="archive"/.test(html));
    chip('raw').fire('click');
    ok('pressing a chip writes the same comma list, known values in their order, the unknown one kept',
        JSON.stringify(sets().slice(-1)[0]) === JSON.stringify({ type: 'set', key: K('airtableInputStages'), value: 'raw, final, asset, archive' }));
    chip('asset').fire('click');
    ok('pressing a pressed chip lets it go', sets().slice(-1)[0].value === 'final, archive');
}

// the ladder
{
    const rung = v => p.query('[data-rung]').find(e => e.dataset.rung === v);
    const x = v => p.query('[data-rungx]').find(e => e.dataset.rungx === v);
    ok('an ordered list is a row of chips in its order', /data-rung="haiku"[\s\S]*data-rung="sonnet"[\s\S]*data-rung="my-judge"/.test(html));
    x('sonnet').fire('click');
    ok('✕ takes a rung out', sets().slice(-1)[0].value === 'haiku,my-judge');
    const add = el('rungadd', 'judgeLadder');
    add.value = 'opus'; add.fire('change');
    ok('+ Add… puts a model at the end', sets().slice(-1)[0].value === 'haiku,sonnet,my-judge,opus');
    rung('my-judge').fire('dragstart'); rung('haiku').fire('drop');
    ok('dragging a rung onto an earlier one puts it before it', sets().slice(-1)[0].value === 'my-judge,haiku,sonnet');
    rung('haiku').fire('dragstart'); rung('sonnet').fire('drop');
    ok('…onto a later one, after it', sets().slice(-1)[0].value === 'sonnet,haiku,my-judge');
}

// the token
{
    ok('the web token is a hidden box with Show, Generate and Copy',
        /<input type="password" id="c-web\.token" data-set="agentFarm\.web\.token"/.test(html) && /data-tokshow=/.test(html) && /data-tokcopy=/.test(html));
    el('tokgen', 'web.token').fire('click');
    ok('Generate asks the host for a new token', JSON.stringify(p.last()) === JSON.stringify({ type: 'webTokenNew' }));
}

// folders
ok('a folder setting has Browse', ['vaultDir', 'reportDir'].every(k => new RegExp(`data-browse="agentFarm\\.${k}"`).test(html)));

// the defaults scene
{
    const off = runPage(fx.script, fx.variants()[1].data);
    const h = off.html();
    ok('at its default the digest is off: the switch out, the time box resting',
        /data-timeoff="agentFarm\.dailyDigest"\s*\n?\s*aria-label/.test(h) && /<input type="time" id="c-dailyDigest"[^>]*value=""[^>]*disabled/.test(h));
    const sw = off.query('[data-timeoff]').find(e => e.dataset.timeoff === K('dailyDigest'));
    const n = off.posted.length;
    sw.checked = true; sw.fire('change');
    ok('…switching it on with no time opens the box and writes nothing yet', off.posted.length === n);
    ok('an empty ladder offers its models to add', /data-rungadd="agentFarm\.judgeLadder"/.test(h) && !/data-rung="/.test(h));
    ok('drawing the defaults writes nothing either', off.posted.filter(m => m && m.type === 'set').length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
