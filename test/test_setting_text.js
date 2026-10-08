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
ok('the model says which settings take a reload, by the one rule the bridge uses',
    rows.every(r => !!r.reloadRequired === B.needsReload(r.description)) && rows.some(r => r.reloadRequired));

const item = fs.readFileSync(path.join(ROOT, 'media', 'afSettingItem.js'), 'utf8');
ok('the row draws the description through it', /<div class="setdesc">\$\{hit\(descOf\(it\)\)\}<\/div>/.test(item)
    && /window\.AFSettingText\.plain\(it\.description \|\| '', nameOf\)/.test(item));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
