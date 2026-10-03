// U-189 — the interface language: one implementation (media/afI18n.js) for pages and the extension host.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const fresh = () => { const w = {}; vm.runInNewContext(read('media', 'afI18n.js'), { window: w }); return w.AFI18n; };
// the Türkçe catalog is every file its language lists (media/afI18n.js files())
const TR = Object.assign({}, ...require(path.join(ROOT, 'media', 'afI18n.js')).files('tr').map(f => require(path.join(ROOT, 'media', f))));

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

// U-189 second slice — the Now page draws in the interface language, from the real snapshot builder
{
    const { runPage } = require('./lib_page_dom');
    const fx = require('./fixtures/now.js');
    const html = (lang, data) => {
        const sb = runPage('now.js', data, lang ? { __AFUI__: { lang, locale: lang } } : undefined).sandbox;
        return (sb.document || sb.window.document).getElementById('app').innerHTML;
    };
    const tr = html('tr', fx.data());
    ok('the Now page\'s sections, states, box and header line are drawn in Türkçe',
        ['Seni bekleyenler', 'Çalışanlar', 'Bugün', 'bugün harcandı', 'Bildirimler', 'Gönder', 'Yeni', 'seni bekliyor', ' bekliyor · ']
            .every(s => tr.indexOf(s) >= 0) && !/>Waiting for you|>Running|>Send</.test(tr));
    ok('…and its relative times through the clock', /\d+ (dk|sa|gün) önce|az önce/.test(tr) && !/\d+[mhd] ago|just now/.test(tr));
    const quiet = html('tr', fx.data({ needs: [], sessions: [], notices: [], quotas: [], todayCost: 0 }));
    ok('…the quiet farm too', ['Seni bekleyen bir şey yok.', 'Çalışan oturum yok.', 'Henüz bildirim yok.', 'Çalışan oturum yok — bir tane başlat'].every(s => quiet.indexOf(s) >= 0));
    const en = html('', fx.data());
    ok('in English the page reads as it did', ['Waiting for you', 'Running', 'spent today', '>Send<', 'waits for you'].every(s => en.indexOf(s) >= 0));
    // the visual gate tells the truth: a phone shot of a --lang render carries that language into the phone layer
    const { withPhoneLayer } = require('./phone_frame');
    const phoneTr = withPhoneLayer('<html lang="tr"><body>x</body></html>', 'now');
    ok('a phone shot of a Türkçe render loads the catalog and the language before the phone layer',
        phoneTr.indexOf('window.__AFUI__={"lang":"tr","locale":"tr"}') >= 0 && phoneTr.indexOf('\'Sessions\': \'Oturumlar\'') > 0
        && phoneTr.indexOf('__AFUI__={') < phoneTr.indexOf('AFMobile'));
    ok('…and an English one loads none', withPhoneLayer('<html><body>x</body></html>', 'now').indexOf('window.__AFUI__={') < 0);
    ok('the render names its language on <html>, and the scene label stays English', /<html\$\{lang \? ` lang="\$\{lang\}"` : ''\}>/.test(read('test', 'render_page.js'))
        && /class="rndr-h" lang="en"/.test(read('test', 'render_page.js')));
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
    // U-189 second slice — ago() and every clock's hover speak the chosen language too
    const AT = require(path.join(ROOT, 'media', 'afTime.js'));
    const back = (ms) => AT.ago(Date.now() - ms);
    i18n.applyUiLanguage({ lang: 'tr', locale: 'tr' });
    const trAgo = [back(0), back(5 * 60000), back(3 * 3600000), back(2 * 86400000)].join('|');
    const trTip = AT.tip(at, 'Started');
    i18n.applyUiLanguage({ lang: 'en', locale: 'en' });
    ok('ago() speaks the chosen language', trAgo === 'az önce|5 dk önce|3 sa önce|2 gün önce');
    ok('…and reads exactly as before in English', [back(0), back(5 * 60000), back(3 * 3600000), back(2 * 86400000)].join('|') === 'just now|5m ago|3h ago|2d ago');
    ok('a clock\'s hover translates its label and the machine line', /^Başladı: /.test(trTip) && /\nbu makinede UTC[+-]\d\d:\d\d$/.test(trTip));
    ok('…and is unchanged in English', /^Started: /.test(AT.tip(at, 'Started')) && /\nUTC[+-]\d\d:\d\d on this machine$/.test(AT.tip(at, 'Started')));
    ok('every language listed has a catalog file, and every part it lists exists', i18n.LANGUAGES.every(l => l.id === 'en'
        || (i18n.catalogFiles(l.id)[0] === `afI18n.${l.id}.js` && i18n.catalogFiles(l.id).every(f => fs.existsSync(path.join(ROOT, 'media', f))))));
    ok('a part is drawn: the host draws a Chains and a Needs string from their own files', (() => { i18n.applyUiLanguage({ lang: 'tr', locale: 'tr' });
        const r = i18n.t('Chains') === 'Zincirler' && i18n.t('Needs You') === 'Seni Bekleyenler'; i18n.applyUiLanguage({ lang: 'en', locale: '' }); return r; })());
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

// U-189 third slice — a sentence the HOST composes travels as its template and values; the page translates where it draws
{
    const { said } = require(path.join(ROOT, 'out', 'core', 'uiSentence.js'));
    const s = said('{agent} is waiting for permission', { agent: 'developer' });
    ok('said(): the English sentence for the bridge, the template and values for the page',
        s.title === 'developer is waiting for permission' && s.titleKey === '{agent} is waiting for permission' && s.titleVars.agent === 'developer');
    const N = require(path.join(ROOT, 'out', 'core', 'needs.js'));
    const q = N.buildNeedsQueue({ liveSessions: [{ sessionId: 's1', agentName: 'developer', status: 'waiting-permission', lastPrompt: 'Bash: npm test', lastEventTs: 1 }], approvals: [], insights: [] });
    ok('a Needs row keeps its English title and carries the template beside it', q[0].title === 'developer is waiting for permission' && q[0].titleKey === '{agent} is waiting for permission');
    // every quoted template between a said( and its values object
    const keys = [...new Set(['needs.ts', 'consoleNeeds.ts', 'engineFaultWatch.ts', 'calendarSignals.ts', 'humanAsk.ts'].flatMap(f => {
        const src = read('src', 'core', f);
        return [...src.matchAll(/said(?:Detail)?\(/g)].flatMap(m => [...src.slice(m.index, src.indexOf(', {', m.index)).matchAll(/'([^']*\{\w+\}[^']*)'/g)].map(x => x[1]));
    }))];
    const untr = keys.filter(k => !(k in TR));
    ok('every title and detail template the Needs sources compose is in the Türkçe catalog (' + keys.length + ')' + (untr.length ? ' — missing: ' + untr.join(' | ') : ''),
        keys.length >= 22 && !untr.length);
    // the two that carried an English value inside a translated template: an approval's line, an overdue post's age
    const ap = N.buildNeedsQueue({ liveSessions: [], insights: [], approvals: [{ id: 'a1', kind: 'upload', title: 'Drive', goal: 'the cut', createdAt: 1 }] })[0];
    ok('an approval\'s line keeps its English and carries its template', ap.detail === 'send files from this computer to Drive: the cut'
        && ap.detailKey === 'send files from this computer to {title}: {goal}' && ap.detailVars.goal === 'the cut');
    const C = require(path.join(ROOT, 'out', 'core', 'calendarSignals.js'));
    const od = C.publishNeedItems([{ entry: { title: 'Reel', platform: 'IG', date: '2026-10-01', status: 'ready', file: 'x.md' }, lateMs: 3 * 3600000 }], 5)[0];
    ok('an overdue post says its age as before, with the unit in the template', od.title === '"Reel" was due on IG 3 h ago' && od.titleKey === '"{title}" was due on {platform} {n} h ago'
        && od.detail === '2026-10-01 · ready · no publish step names this note' && C.span(3 * 3600000) === '3 h' && C.span(20 * 60000) === '20 min' && C.span(72 * 3600000) === '3 days');
    const { runPage } = require('./lib_page_dom');
    const draw = (script, data, lang) => {
        const sb = runPage(script, data, lang ? { __AFUI__: { lang, locale: lang } } : undefined).sandbox;
        return (sb.document || sb.window.document).getElementById('app').innerHTML;
    };
    const now = require('./fixtures/now.js').data();
    ok('the Now page draws a waiting title and a notice type in Türkçe', draw('now.js', now, 'tr').includes('developer izin bekliyor') && draw('now.js', now, 'tr').includes('güncelleme'));
    ok('…and in English as before', draw('now.js', now).includes('developer is waiting for permission') && />developer · update</.test(draw('now.js', now).replace(/\s+/g, ' ')));
    const needs = require('./fixtures/needs.js').data();
    const titles = [...draw('needs.js', needs, 'tr').matchAll(/class="need-title">([^<]*)/g)].map(m => m[1]);
    ok('the Needs page draws its titles in Türkçe (the right-click payload keeps the English for the host)',
        titles.some(x => x.includes('izin bekliyor')) && !titles.some(x => /is waiting for permission|looks stalled/.test(x)));
    const ntr = draw('needs.js', needs, 'tr');
    ok('…and its own words: heading, tags, toolbar, the row buttons and a host-built detail line',
        ['Seni Bekleyenler', 'İZİN', 'TAKILDI', 'Tümünü temizle', 'İzin ver', 'Zaman çizelgesi', 'son araç: Bash', 'Sürdür'].every(s => ntr.includes(s))
        && !/>(Clear all|Allow|Timeline)</.test(ntr.replace(/>[^<]*?(✅|⌨|🧹)\s*/g, '>')));
    const nen = draw('needs.js', needs);
    ok('…while English reads as it did', ['Needs You', 'PERMISSION', 'Clear all', 'Allow', 'last tool: Bash'].every(s => nen.includes(s)));
}

// U-189 — the Work Queue page, in its own catalog part; its shared hands (AFBulk, AFCtx.hint) translate their own words
{
    const { runPage } = require('./lib_page_dom');
    const draw = (data, lang) => {
        const sb = runPage('queue.js', data, lang ? { __AFUI__: { lang, locale: lang } } : undefined).sandbox;
        return (sb.document || sb.window.document).getElementById('app').innerHTML;
    };
    const q = require('./fixtures/queue.js').data();
    // one item that came from a question, so the source line and its badge are drawn too
    q.items[0] = Object.assign({}, q.items[0], { sourceNoticeId: 'n1', sourceNoticeType: 'question', sourceNoticeTitle: 'Which repo?' });
    const qtr = draw(q, 'tr'), qen = draw(q);
    ok('the Work Queue draws in Türkçe: heading, lanes, categories, filters, the bulk bar, the capture button and a notice\'s kind',
        ['İş Kuyruğu', 'Seni bekliyor', 'Senin kayıtların', 'Ajanların izlediği devirler', 'Hedefler', 'bırakılanları göster',
            'Kalıcı olarak sil', 'tümü', 'Kuyruğa ekle', 'daha fazlası için sağ tıkla', 'Kaynak: soru', 'Soru: ', 'Hedefler: tümü', 'Tümünü seç'].every(s => qtr.includes(s))
        && !/>\s*(Your captures|show dropped|Add to queue)\s*</.test(qtr));
    ok('…while English reads as it did', ['Work Queue', 'Needs you', 'Your captures', 'Agent-tracked delegations', 'show dropped',
        '＋ Add to queue', 'right-click for more', 'From a question', 'Question: ', 'Targets: all', 'Select all'].every(s => qen.includes(s)) && !qen.includes('Kuyruk'));
    // every complete literal the page hands t() or lab() is in the Türkçe catalog, unless it reads the same in both
    const src = read('media', 'queue.js');
    const same = new Set(['— model —', '{axis}: {v}']);
    const unq = s => s.replace(/\\'/g, '\'').replace(/\\n/g, '\n');
    const keys = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\s*[,)]/g)].map(m => unq(m[1]))
        .concat([...src.matchAll(/\blab\('((?:[^'\\]|\\.)*)'\)/g)].map(m => unq(m[1]).replace(/^[^\p{L}\p{N}]*/u, '').trim()));
    const missing = [...new Set(keys)].filter(k => !same.has(k) && !(k in TR));
    ok('every word the Work Queue hands t() / lab() has its Türkçe (' + keys.length + ')' + (missing.length ? ' — missing: ' + missing.join(' | ') : ''),
        keys.length >= 80 && !missing.length);
}

// U-189 — the Notices page, in its own catalog part
{
    const { runPage } = require('./lib_page_dom');
    const draw = (data, lang) => {
        const sb = runPage('notices.js', data, lang ? { __AFUI__: { lang, locale: lang } } : undefined).sandbox;
        return (sb.document || sb.window.document).getElementById('app').innerHTML;
    };
    const d = require('./fixtures/notices.js').data();
    const ntr = draw(d, 'tr'), nen = draw(d);
    ok('the Notices page draws in Türkçe: heading, chips, sort, filters, the action bar and the row buttons',
        ['Bildirimler', ' toplam', 'Tümü (', 'Okunmamış (', 'Sırala: Önce en yeni', 'Tür: tümü', 'Tümünü aç', 'Okunanları temizle',
            'Şuraya dosyala…', 'Geri al', 'Ajana devret', 'Açmak için tıkla — açmak onu okundu yapar'].every(s => ntr.includes(s))
        && !/>\s*(Clear read|Expand all|Single-open|Mark read|Mark unread)\s*</.test(ntr));
    ok('…while English reads as it did', ['Notices', ' total', 'All (', 'Unread (', 'Sort: Newest first', 'Type: all', 'Expand all',
        'Clear read', 'File under…', 'Undo', 'Hand to agent'].every(s => nen.includes(s)) && !nen.includes('Bildirim'));
    // the search box is sized for its English placeholder (min-width), so a translation longer than it is cut on the page
    ok('the search box\'s Türkçe placeholder is no longer than the English one it is sized for',
        TR['search (text or #tag)'].length <= 'search (text or #tag)'.length && TR['search'].length <= 'search'.length);
    const src = read('media', 'notices.js');
    const unq = s => s.replace(/\\'/g, '\'').replace(/\\n/g, '\n');
    const keys = [...src.matchAll(/\btr\('((?:[^'\\]|\\.)*)'\s*[,)]/g)].map(m => unq(m[1]))
        .concat([...src.matchAll(/\blab\('((?:[^'\\]|\\.)*)'\)/g)].map(m => unq(m[1]).replace(/^[^\p{L}\p{N}]*/u, '').trim()));
    const missing = [...new Set(keys)].filter(k => !(k in TR));
    ok('every word the Notices page hands tr() / lab() has its Türkçe (' + keys.length + ')' + (missing.length ? ' — missing: ' + missing.join(' | ') : ''),
        keys.length >= 80 && !missing.length);
}

// U-189 — the search grammar's hover (AFQuery.tip) and a project's hover and picker rows (AFProject) translate their own words
{
    const charts = { option: (v, l, o) => '<option title="' + o.detail + '">' + l + '</option>' };
    const w = { AFCharts: charts };
    const ctx = { window: w };
    vm.runInNewContext(read('media', 'afI18n.js'), ctx);
    w.AFI18n.add('tr', TR);
    w.AFI18n.setLanguage('tr');
    vm.runInNewContext(read('media', 'afQuery.js'), ctx);
    vm.runInNewContext(read('media', 'afProject.js'), ctx);
    const q = w.AFQuery.tip('Searched here.', { wholeWord: true });
    ok('AFQuery.tip draws its grammar in Türkçe; the subject (the page\'s to translate) and the examples stay as handed',
        q.startsWith('Searched here.') && ['iki terim de geçmeli', 'Tam sözcük AÇIK', '"tırnak"', 'codex OR gemini'].every(s => q.includes(s))
        && !/both terms|Whole word is ON/.test(q));
    const Q = require(path.join(ROOT, 'media', 'afQuery.js'));
    const lines = Q.SYNTAX_ROWS.map(r => r.what).concat([Q.BARE_WORD_NOTE, Q.WHOLE_WORD_ON]);
    ok('…every line of the grammar has its Türkçe', lines.every(s => typeof TR[s] === 'string'));
    ok('…while Node (and a page without a catalog) reads it as it did', Q.tip('x', { wholeWord: true }) === 'x\n\n' + Q.WHOLE_WORD_ON + '\n\n' + Q.SYNTAX);
    const p = w.AFProject.tip({ name: 'AF', status: 'active', kind: 'product', folder: 'D:/docs', repos: ['D:/r'], budgetUSD: 5, tags: ['a', 'b'] });
    ok('AFProject.tip: the head and the labels in Türkçe, the values as they are', p.head === 'Proje · AF'
        && p.body === ['Durum: active · product', 'Belgeler: D:/docs', 'Kod: D:/r', 'Bütçe: $5/gün', 'Etiketler: a, b'].join('\n'));
    ok('…a row with no project says so', w.AFProject.tip(undefined).head === 'Proje yok' && w.AFProject.tip(undefined).body === 'Bunu kimse bir projeye bağlamadı.');
    const o = w.AFProject.options([], '', { withNone: true });
    ok('…and so do the picker\'s own rows', ['Herhangi bir proje', 'Proje yok', 'Yalnızca hiçbir proje belirtmeyen satırlar.'].every(s => o.includes(s)));
    const we = { AFCharts: charts };
    vm.runInNewContext(read('media', 'afProject.js'), { window: we });
    const pe = we.AFProject.tip({ name: 'AF', status: 'active', budgetUSD: 5 });
    ok('…while without a catalog it reads as it did', pe.head === 'Project · AF' && pe.body === 'Status: active\nBudget: $5/day');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
