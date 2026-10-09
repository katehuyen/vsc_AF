/**
 * Gate: EVERY SETTING HAS ONE RECORD IN THE CATALOG, AND THE CATALOG'S TEXT KEEPS THE STANDARD (U-226).
 *
 * What a person reads about a setting — its section, group, tier, name, one-line summary, unit — lives in
 * src/core/settingsCatalog/ and nowhere else. A key added to package.json without a record fails here BY NAME;
 * a record whose key the manifest no longer has fails too. The text rules are the Settings report's §4.5.
 * How many keys still have no name or summary of their own may only fall (test/settings_catalog.ratchet.json).
 *
 *   node test/test_settings_catalog.js          check
 *   node test/test_settings_catalog.js --fix    lower the ratchet to today's counts (never raises it)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };
const list = (a) => (a.length ? ': ' + a.slice(0, 12).join(', ') + (a.length > 12 ? ` (+${a.length - 12})` : '') : '');

const CAT = require(path.join(ROOT, 'out', 'core', 'settingsCatalog', 'index.js'));
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const SH = require(path.join(ROOT, 'out', 'core', 'settingShape.js'));
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;
const short = k => k.replace(/^agentFarm\./, '');
const manifest = Object.keys(PROPS).filter(k => k.startsWith('agentFarm.')).map(short);

// ---------- completeness ----------
const missing = manifest.filter(k => !CAT.catalogEntry(k)).map(k => 'agentFarm.' + k);
ok('every agentFarm.* setting in package.json has a catalog record' + list(missing)
    + (missing.length ? ' — add each to src/core/settingsCatalog/<section>.ts (docs/CONVENTIONS.md → "Adding a setting")' : ''),
    missing.length === 0);
const orphans = CAT.catalogKeys().filter(k => !PROPS['agentFarm.' + k]);
ok('no catalog record names a key the manifest does not have' + list(orphans), orphans.length === 0);
ok('sixteen sections', CAT.SECTIONS.length === 16);

// ---------- ids ----------
const ids = CAT.SECTIONS.map(s => s.id);
ok('section ids are unique', new Set(ids).size === ids.length);
const badGroups = [], dupGroups = [], emptyGroups = [];
for (const s of CAT.SECTIONS) {
    const g = s.groups.map(x => x.id);
    if (new Set(g).size !== g.length || g.includes('more')) { dupGroups.push(s.id); }
    for (const [k, r] of Object.entries(s.rows)) { if (!g.includes(r.group)) { badGroups.push(`${k} → ${s.id}/${r.group}`); } }
    for (const id of g) { if (!Object.values(s.rows).some(r => r.group === id)) { emptyGroups.push(`${s.id}/${id}`); } }
}
ok('every record names a group of its own section' + list(badGroups), badGroups.length === 0);
ok('group ids are unique within a section, and none is the reserved "more"' + list(dupGroups), dupGroups.length === 0);
ok('no group is empty' + list(emptyGroups), emptyGroups.length === 0);
const legacyBad = Object.entries(CAT.LEGACY_SECTION).filter(([, v]) => !ids.includes(v)).map(([k]) => k);
ok('every old category id maps to a real section' + list(legacyBad), legacyBad.length === 0);

// ---------- tiers ----------
const crowded = CAT.SECTIONS.filter(s => Object.values(s.rows).filter(r => r.tier === 'basic').length > 6).map(s => s.id);
ok('no section shows more than 6 basic settings' + list(crowded), crowded.length === 0);
const noBasic = CAT.SECTIONS.filter(s => !Object.values(s.rows).some(r => r.tier === 'basic')).map(s => s.id);
ok('every section has a basic setting to open on' + list(noBasic), noBasic.length === 0);

// ---------- text standard (the report's §4.5) ----------
const words = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const oneSentence = s => /^[^\n]+[.]$/.test(s) && !/[.!?]\s+[A-Z]/.test(s.slice(0, -1));
const UNIT_WORD = /\b(seconds?|secs?|minutes?|mins?|hours?|days?|percent|usd|mb|tokens?|chars?|ms)\b|[%$]/i;
const DEV_CODE = /\b[A-Z]{1,3}-\d+\b/;
const textBad = [];
for (const s of CAT.SECTIONS) {
    if (words(s.label) > 3 || s.label.length > 24 || /[—(:]/.test(s.label)) { textBad.push(`section ${s.id} name "${s.label}"`); }
    if (!oneSentence(s.about)) { textBad.push(`section ${s.id} about`); }
    for (const g of s.groups) {
        if (words(g.label) > 4 || /[—(:]/.test(g.label)) { textBad.push(`group ${s.id}/${g.id} name "${g.label}"`); }
        if (!String(g.about || '').trim()) { textBad.push(`group ${s.id}/${g.id} about`); }
    }
    for (const [k, r] of Object.entries(s.rows)) {
        if (r.label !== undefined && (words(r.label) > 5 || r.label.length > 36 || /[a-z][A-Z]/.test(r.label) || UNIT_WORD.test(r.label))) {
            textBad.push(`${k} name "${r.label}"`);
        }
        if (r.summary !== undefined && (!oneSentence(r.summary) || r.summary.length > 100 || /[`*#_[\]]/.test(r.summary)
            || /agentFarm\.|\b[a-z]+[A-Z]\w*\b/.test(r.summary) || DEV_CODE.test(r.summary))) {
            textBad.push(`${k} summary`);
        }
    }
}
ok('names and summaries keep the text standard' + list(textBad), textBad.length === 0);

const unitBad = [], controlBad = [];
for (const k of CAT.catalogKeys()) {
    const e = CAT.catalogEntry(k);
    const type = [].concat((PROPS['agentFarm.' + k] || {}).type || []);
    if (e.unit !== undefined && (!CAT.UNITS.includes(e.unit) || !type.some(t => t === 'number' || t === 'integer'))) { unitBad.push(k); }
    if (e.control !== undefined && !CAT.CONTROLS.includes(e.control)) { controlBad.push(k); }
    if (e.zeroMeans !== undefined && e.zeroMeans !== 'off') { controlBad.push(k); }
    // U-230 — an option label names a value the schema has, in at most three words
    const en = ((PROPS['agentFarm.' + k] || {}).enum || []).map(String);
    if (e.options && Object.entries(e.options).some(([o, l]) => !en.includes(o) || String(l).trim().split(/\s+/).length > 3)) { controlBad.push(k + ' (options)'); }
    // U-231 — a column heading names a field the schema declares, in at most three plain words
    const declared = ((SH.shapeOf(PROPS['agentFarm.' + k] || {}) || {}).fields || []).map(f => f.name);
    if (e.fields && Object.entries(e.fields).some(([f, l]) => !declared.includes(f) || !String(l).trim()
        || String(l).trim().split(/\s+/).length > 3 || /[a-z][A-Z]/.test(l))) { controlBad.push(k + ' (fields)'); }
}
ok('a unit is one of the known ones, and only on a number' + list(unitBad), unitBad.length === 0);
ok('a control hint is one of the known ones' + list(controlBad), controlBad.length === 0);

// ---------- the model ----------
const model = S.buildSettingsModel(PROPS, k => PROPS[k].default);
const drawn = model.flatMap(c => c.items.map(it => it.key));
ok('every manifest setting is drawn exactly once', drawn.length === Object.keys(PROPS).length && new Set(drawn).size === drawn.length);
ok('the page model follows the catalog\'s section order', model.map(c => c.id).join() === ids.filter(id => model.some(c => c.id === id)).join());
ok('nothing in the real manifest falls into a More group', model.every(c => c.items.every(it => it.group !== 'more')));
ok('every row carries section, group, tier, label and place', model.every(c => c.items.every(it =>
    it.section === c.id && it.group && it.tier && it.label && it.place)));
const row = key => model.flatMap(c => c.items).find(it => it.key === 'agentFarm.' + key);
ok('U-231 — a table column is headed by the name its record gives it, its key staying the stored name',
    row('pricing').shape.fields.find(f => f.name === 'match').label === 'Model pattern'
    && row('modelPolicy').shape.fields.find(f => f.name === 'promptMatch').label === 'Prompt pattern'
    && row('taskRetry').shape.fields.every(f => f.label === undefined));
const page = require('./lib_settings_source').settingsPageSource();
ok('…and the page draws that name on the header, the form row and the messages, the key where none is given',
    /<span class="setth">\$\{C\.esc\(f\.label \|\| f\.name\)\}/.test(page)
    && /<span class="setfname">\$\{C\.esc\(f\.label \|\| f\.name\)\}/.test(page)
    && /\$\{f\.label \|\| f\.name\} is required/.test(page) && /\$\{f\.label \|\| f\.name\} has to be a number/.test(page));
const future = S.buildSettingsModel({ 'agentFarm.futureThing': { type: 'string', default: '' },
    'agentFarm.telegram.futureThing': { type: 'string', default: '' } }, () => '');
ok('a setting invented tomorrow is drawn, in a More group — under General, or beside its dotted siblings',
    future.some(c => c.id === 'general' && c.items.some(i => i.key === 'agentFarm.futureThing' && i.group === 'more'))
    && future.some(c => c.id === 'remote' && c.items.some(i => i.key === 'agentFarm.telegram.futureThing')));
ok('the bridge reads a section id, an old category id or a section name',
    CAT.resolveSectionId('notify') === 'notify' && CAT.resolveSectionId('live') === 'monitor'
    && CAT.resolveSectionId('Quota & Cost') === 'cost' && CAT.resolveSectionId('nope') === undefined);

// ---------- the ratchet ----------
const RATCHET = path.join(__dirname, 'settings_catalog.ratchet.json');
const now = {
    missingLabel: CAT.catalogKeys().filter(k => !CAT.catalogEntry(k).label).length,
    missingSummary: CAT.catalogKeys().filter(k => !CAT.catalogEntry(k).summary).length
};
const base = fs.existsSync(RATCHET) ? JSON.parse(fs.readFileSync(RATCHET, 'utf8')) : {};
if (process.argv.includes('--fix')) {
    const next = { missingLabel: Math.min(now.missingLabel, base.missingLabel ?? now.missingLabel),
        missingSummary: Math.min(now.missingSummary, base.missingSummary ?? now.missingSummary) };
    fs.writeFileSync(RATCHET, JSON.stringify(next, null, 2) + '\n', 'utf8');
    console.log('ratchet: ' + JSON.stringify(next));
}
for (const f of ['missingLabel', 'missingSummary']) {
    ok(`settings without a ${f === 'missingLabel' ? 'name' : 'summary'} of their own: ${now[f]} (ratchet ${base[f]})`,
        typeof base[f] === 'number' && now[f] <= base[f]);
    if (now[f] < base[f]) { console.log(`  note: ${f} fell to ${now[f]} — run --fix to lock it in`); }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
