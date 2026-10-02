// U-189 — the interface language: one implementation (media/afI18n.js) for pages and the extension host.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const fresh = () => { const w = {}; vm.runInNewContext(read('media', 'afI18n.js'), { window: w }); return w.AFI18n; };
const TR = require(path.join(ROOT, 'media', 'afI18n.tr.js'));

{
    const I = fresh();
    ok('a regional tag resolves to its language, and one without a catalog to English',
        I.resolve('tr-TR') === 'tr' && I.resolve('EN_gb') === 'en' && I.resolve('de') === 'en' && I.resolve('') === 'en');
    I.add('tr', TR);
    ok('English is drawn as written while the language is English', I.t('Notices') === 'Notices' && I.lang() === 'en');
    I.setLanguage('tr');
    ok('a chosen language translates what its catalog carries', I.t('Notices') === 'Bildirimler');
    ok('…and leaves what it does not carry yet in English, never blank', I.t('Not in any catalog') === 'Not in any catalog');
    ok('{name} is filled after translating', I.t('Open {page}', { page: 'Kuyruk' }) === 'Kuyruk sayfasını aç');
    ok('a label keeps its mark and its count badge, and translates only the words',
        I.label('🔔 Notices<span data-afcount="notices"> (3)</span>') === '🔔 Bildirimler<span data-afcount="notices"> (3)</span>'
        && I.label('◧ Projects') === '◧ Projeler');
    ok('a chosen language formats dates in itself; a language with no locale given keeps its own', I.locale() === 'tr');
    I.setLanguage('tr', '');
    ok('…while an empty locale means the system\'s own formats', I.locale() === '');
}

{
    const { runPage } = require('./lib_page_dom');
    const sb = runPage('sessionsPage.js', { sessions: [] }).sandbox;
    const w = sb.window || sb;
    const english = w.AFHeader.pages();
    const strip = s => s.replace(/^[^\p{L}\p{N}]+/u, '');
    const missing = english.filter(p => !TR[strip(p.label)] || !TR[p.tip]).map(p => p.id);
    ok('every destination of the header has its name and its sentence in Türkçe' + (missing.length ? ' — ' + missing.join(', ') : ''),
        english.length > 15 && missing.length === 0);
    w.AFI18n.add('tr', TR);
    w.AFI18n.setLanguage('tr');
    const head = w.AFHeader.html({ page: 'dashboard', title: 'Pano', version: true });
    ok('the header row is drawn in Türkçe, count badge and all',
        /🔔 Bildirimler<span class="af-nav-n" data-afcount="notices">/.test(head) && head.indexOf('Canlı Zaman Çizelgesi') >= 0);
    ok('…and so are the buttons that are only an icon (their name and their sentence)',
        ['Ara', 'Motorlar', 'Ayarlar', 'Yenile'].every(n => head.indexOf(`aria-label="${n}"`) >= 0)
        && head.indexOf(TR['All agentFarm settings in one page, with saveable setting sets.']) >= 0);
    ok('the phone\'s page list is translated as well', w.AFHeader.pages().some(p => p.label === '📥 Kuyruk'));
    ok('a name that starts with a letter outside ASCII keeps it',
        /title="Çalışma"/.test(w.AFHeader.html({ page: 'x', title: 'y', related: [{ label: '⚙ Çalışma', nav: 'z' }] })));
}

{
    const i18n = require(path.join(ROOT, 'out', 'core', 'i18n.js'));
    const r = (s, d) => JSON.stringify(i18n.resolveUiLanguage(s, d));
    ok('auto follows VS Code\'s display language where there is a catalog, and keeps the system\'s formats',
        r('auto', 'tr') === '{"lang":"tr","locale":""}' && r(undefined, 'de') === '{"lang":"en","locale":""}');
    ok('a chosen language sets the interface and the formats', r('tr', 'en') === '{"lang":"tr","locale":"tr"}' && r('en', 'tr') === '{"lang":"en","locale":"en"}');
    i18n.applyUiLanguage({ lang: 'tr', locale: 'tr' });
    ok('the extension host draws in the language it was given', i18n.t('Queue') === 'Kuyruk' && i18n.tLabel('📥 Queue') === '📥 Kuyruk');
    const T = require(path.join(ROOT, 'out', 'core', 'aftime.js'));
    const at = new Date(2026, 9, 3, 20, 14).getTime();
    const tr = T.clock(at);
    i18n.applyUiLanguage({ lang: 'en', locale: 'en' });
    const en = T.clock(at);
    i18n.applyUiLanguage({ lang: 'en', locale: '' });
    const sys = T.clock(at);
    ok('the clock follows the chosen language — and the system with none chosen',
        tr === '20:14' && /^0?8:14\sPM$/.test(en) && sys === new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
    ok('every language listed has a catalog file', i18n.LANGUAGES.every(l => l.id === 'en' || fs.existsSync(path.join(ROOT, 'media', `afI18n.${l.id}.js`))));
    const pkg = JSON.parse(read('package.json')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    const ids = ['auto'].concat(i18n.LANGUAGES.map(l => l.id));
    ok('the setting offers exactly auto and the languages that exist, and defaults to auto',
        JSON.stringify(props['agentFarm.language'].enum) === JSON.stringify(ids) && props['agentFarm.language'].default === 'auto');
    ok('…and so does its flex point', read('media', 'afFlex.js').indexOf(`'agentFarm.language', { options: ${JSON.stringify(ids).replace(/"/g, '\'').replace(/,/g, ', ')} }`) > 0);
}

{
    const base = read('src', 'panels', 'base.ts');
    ok('every page is told its language and gets the translator before the header',
        /lang: ui\.lang,\s*locale: ui\.locale/.test(base) && /<html lang="\$\{ui\.lang\}">/.test(base)
        && base.indexOf('src="${i18n}"') > 0 && base.indexOf('src="${i18n}"') < base.indexOf('src="${header}"')
        && base.indexOf('${catalog}') < base.indexOf('src="${header}"'));
    ok('the catalog is loaded only for a language other than English', /ui\.lang === 'en' \? ''/.test(base));
    ok('the language is set before anything draws', /registerLaunchDoors\(\);\s*\/\/[^\n]*\n\s*installUiLanguage\(context\);/.test(read('src', 'extension.ts')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
