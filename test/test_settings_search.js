// U-224 — one ranker for the Settings page and settings.list q (media/afSettingSearch.js).
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const S = require('../media/afSettingSearch.js');
const { buildSettingsModel } = require('../out/core/settingsops.js');
const { rankSettings } = require('../out/core/settingSearch.js');

const pkg = require('../package.json');
const props = {};
for (const c of [].concat(pkg.contributes.configuration)) { Object.assign(props, c.properties || {}); }
const cats = buildSettingsModel(props, () => undefined);
const items = cats.flatMap(c => c.items.map(it => Object.assign({}, it, { place: c.label })));
const keys = (q, n) => S.rank(items, q).slice(0, n).map(r => r.item.key);

{
    const top = keys('sound', 5);
    ok('‼️ "sound" brings the sound settings first — all five of the first five (' + top.join(', ') + ')',
        top.length === 5 && top.every(k => /^agentFarm\.alerts\./.test(k)));
    const port = S.rank(items, 'port').map(r => r.item.key);
    const named = ['agentFarm.livePort', 'agentFarm.web.port', 'agentFarm.remote.port'];
    const lastNamed = Math.max(...named.map(k => port.indexOf(k)));
    const firstReport = port.findIndex(k => /report/i.test(k));
    ok('‼️ "port": livePort, web.port and remote.port come before every setting that only says "report"',
        named.every(k => port.indexOf(k) >= 0) && lastNamed < 3 && firstReport > lastNamed);
    ok('"ses" (Turkish for sound) is a whole word on the sound settings and only part of "sessions": sound first',
        /^agentFarm\.alerts\./.test(keys('ses', 1)[0]));
    const ses = S.rank(items, 'ses');
    const firstPartial = ses.findIndex(r => !r.start);
    ok('…and every row with only a partial hit comes after every row with a whole one',
        firstPartial > 0 && ses.slice(firstPartial).every(r => !r.start));
}

{
    ok('the grammar is AFQuery\'s: -word leaves a row out',
        !keys('sound -quiet', 99).includes('agentFarm.alerts.quietHours') && keys('sound', 99).includes('agentFarm.alerts.quietHours'));
    const either = keys('livePort OR telegram', 99);
    ok('…and a OR b takes both', either.includes('agentFarm.livePort') && either.some(k => /telegram/i.test(k)));
    const all = S.rank(items, '');
    ok('an empty query keeps every setting, in the page\'s own order',
        all.length === items.length && all.every((r, i) => r.index === i));
    const bad = S.rank(items, 'a)');
    ok('a query that does not parse keeps nothing and says why', bad.length === 0 && /\)/.test(bad.error || ''));
    ok('match() makes the same decision rank() makes',
        items.filter(S.match('telegram bot')).length === S.rank(items, 'telegram bot').length);
}

{
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    ok('mark() puts each hit in <mark> and escapes the rest',
        S.mark('livePort <x>', 'port', esc) === 'live<mark>Port</mark> &lt;x>');
    ok('…and leaves text with no query as plain escaped text', S.mark('a<b', '', esc) === 'a&lt;b');
    ok('the name a key implies', S.humanize('agentFarm.alerts.stuckThresholdSeconds') === 'Stuck threshold seconds');
    // U-226 — the table is the catalog's, carried on every row the model builds
    const alertsOn = require('../out/core/settingsops.js').groupIntoSections([{ key: 'agentFarm.alerts.on', type: 'boolean',
        default: true, value: true, modified: false, description: '' }])[0].items[0];
    ok('the words people use live in one table: the sound settings answer to "sound" and "ses"',
        /\bsound\b/.test(alertsOn.terms) && /\bses\b/.test(alertsOn.terms) && S.rank([alertsOn], 'ses').length === 1);
}

{
    const page = fs.readFileSync(path.join(ROOT, 'media/settings.js'), 'utf8');
    const host = fs.readFileSync(path.join(ROOT, 'out/core/settingSearch.js'), 'utf8');
    ok('‼️ one ranker: the host loads the page\'s own file', /media['"],\s*['"]afSettingSearch\.js/.test(host));
    const view = fs.readFileSync(path.join(ROOT, 'media/afSettingResults.js'), 'utf8');
    ok('…and the page asks it which rows are in and in what order (the results view ranks)',
        /const R = window\.AFSettingResults;/.test(page) && /R\.view\(DATA\.categories, filter, changedOnly\)/.test(page)
        && /search\(\)\.rank\(/.test(view));
    ok('…and keeps no word list of its own for a key', !/const (PROMPT|WIKI|SP|TG|AUTOANSWER)_TERMS = '/.test(page));
    ok('the host side ranks the same way', rankSettings(items, 'port').slice(0, 3).map(r => r.item.key).sort().join()
        === keys('port', 3).sort().join());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
