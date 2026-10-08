// U-227 — a setting's description is drawn without its markdown marks (media/afSettingText.js), and whether
// a change takes a window reload is the model's answer (settingsops needsReload), read by page and bridge alike.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const T = require(path.join(ROOT, 'media', 'afSettingText.js'));
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const B = require(path.join(ROOT, 'out', 'core', 'settingsBridge.js'));
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;

const said = T.plain('Uses the **Console** and `claude -p` - see #agentFarm.stuckThresholdSeconds#.', k => (k === 'agentFarm.stuckThresholdSeconds' ? 'Stuck after' : k));
ok('bold, code and a setting named by key come out as plain words: ' + said, said === 'Uses the Console and claude -p - see "Stuck after".');
ok('…a text with none of them is left as it is', T.plain('Days of history to keep.') === 'Days of history to keep.');
ok('the first sentence, for a row with no summary yet', T.firstSentence('One. Two.') === 'One.' && T.firstSentence('v1.2 is it. Next') === 'v1.2 is it.');

const model = S.buildSettingsModel(PROPS, k => PROPS[k].default);
const rows = model.flatMap(c => c.items);
const names = k => (rows.find(r => r.key === k) || {}).label || k;
// a ``` fence a description TELLS the reader to type is content, not a mark
const raw = rows.filter(r => /\*\*|#agentFarm\.|`/.test(T.plain(r.description, names).replace(/```/g, ''))).map(r => r.key);
ok('‼️ no description in the manifest keeps a markdown mark once drawn' + (raw.length ? ': ' + raw.slice(0, 8).join(', ') : ''), raw.length === 0);
// a form's or a table's own fields carry a sentence each, drawn beside the box and in its panel
const fieldRaw = rows.flatMap(r => ((r.shape && r.shape.fields) || []).filter(f => f.description
    && /\*\*|#agentFarm\.|`/.test(T.plainIn(f.description, rows).replace(/```/g, ''))).map(f => r.key + '.' + f.name));
ok('‼️ …nor any field sentence of a form or a table' + (fieldRaw.length ? ': ' + fieldRaw.slice(0, 8).join(', ') : ''),
    fieldRaw.length === 0 && rows.some(r => r.shape && (r.shape.fields || []).some(f => /`/.test(f.description || ''))));
ok('the model says which settings take a reload, by the one rule the bridge uses',
    rows.every(r => !!r.reloadRequired === B.needsReload(r.description)));
ok('a sentence that says a change needs a reload is read as one',
    ['Port for the live listener (restart required).', 'Reload the window after changing this.',
        'Requires a window reload.', 'Takes effect after the next restart.'].every(S.needsReload));
// the three manifest sentences the bare word caught: each uses it for something else
ok('‼️ …and the word used for something else is not',
    !['a message parked before a window reload is still there after it.', 'reopening the window does not restart it',
        'the setting is here so it survives a restart'].some(S.needsReload));

ok('a value reads as a person says it', T.valueText(true) === 'on' && T.valueText(false) === 'off'
    && T.valueText('') === 'not set' && T.valueText(undefined) === 'not set' && T.valueText(300, 's') === '300 s'
    && T.valueText(85, '%') === '85%' && T.valueText(0, '%', 'off') === 'off' && T.valueText(0, '%') === '0%' && T.valueText(5, '$') === '$5' && T.valueText('sonnet') === 'sonnet'
    && T.valueText(['a', 'b']) === '["a","b"]' && T.valueText('x'.repeat(200)).length === 81);
const lines = T.panelLines({ key: 'agentFarm.a', value: 300, default: 120, unit: 's', modified: true,
    description: 'Waits. See #agentFarm.b#.' }, k => (k === 'agentFarm.b' ? 'Bee' : k), ' ').filter(Boolean);
ok('the panel: now and default, a gap, the plain description, a gap, the key — ' + JSON.stringify(lines),
    JSON.stringify(lines) === JSON.stringify(['Now: 300 s · Default: 120 s', ' ', 'Waits. See "Bee".', ' ', 'Key: agentFarm.a']));
const same = T.panelLines({ key: 'agentFarm.a', value: true, default: true, modified: false, description: '', reloadRequired: true }, null, ' ').filter(Boolean);
ok('…a value left alone says so once, an empty description leaves one gap, a reload is said with the key',
    JSON.stringify(same) === JSON.stringify(['Now: on (the default)', ' ', 'Key: agentFarm.a · Needs reload']));

const item = fs.readFileSync(path.join(ROOT, 'media', 'afSettingItem.js'), 'utf8');
ok('the row draws its summary, its search hit and its panel through it', /T\(\)\.plainIn\(it\.description \|\| '', X\.allItems\(\)\)/.test(item)
    && /it\.summary \|\| T\(\)\.firstSentence\(descOf\(it\)\)/.test(item) && /T\(\)\.panelLines\(it, nameOf, window\.AFTip\.GAP\)/.test(item));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
