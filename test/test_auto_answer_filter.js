// K-45 — the question timer's filter is the USER's: a mode and a word list, both
// settings (src/core/autoAnswerFilter.ts). Pinned first: the exact question that
// held a night relay for ~3 hours (session c530aecd, 2026-09-27) arms by default.
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const A = require(path.join(ROOT, 'out', 'core', 'autoAnswer.js'));
const F = require(path.join(ROOT, 'out', 'core', 'autoAnswerFilter.js'));
const settings = raw => A.autoAnswerSettings(Object.assign({ enabled: true, timeoutSeconds: 300 }, raw));
const ask = questions => ({ requestId: 'r', interactive: true, questions, detail: questions.map(q => q.question).join(' · ') });

console.log('\n== the night of 2026-09-27: a word in an option the clock would never pick ==');
const night = ask([{
    question: '"↑ Varsayılan yap" değerleri nerede saklansın?', header: 'Depo',
    options: [
        { label: 'Karma (Önerilen)', description: 'Akış değerleri akışın kendi kaydında.' },
        { label: 'Hepsi tek ayarda', description: 'En basit çözüm, ama silinen ya da kopyalanan akışın değerleri kopar.' }
    ]
}]);
{
    const v = A.autoAnswerFor(night, settings({}));
    ok('‼️ by default (recommended) the clock is ARMED and picks the recommended option',
        v.armed && v.answers[night.questions[0].question] === 'Karma (Önerilen)');
    const all = A.autoAnswerFor(night, settings({ filter: 'all' }));
    ok('the "all" filter still stops it, and names the whole word as written', !all.armed && all.reason === 'destructive' && /"silinen"/.test(all.why));
    ok('…and says which filter and where to change it', /filter: all — Farm Settings/.test(all.why));
}

console.log('\n== the modes ==');
{
    const risky = ask([{ question: 'Proceed?', options: [{ label: 'Yes', description: 'This overwrites the remote branch.' }, { label: 'No' }] }]);
    ok('recommended: the option it would pick is read', A.autoAnswerFor(risky, settings({})).reason === 'destructive');
    ok('off: nothing stops the clock', A.autoAnswerFor(risky, settings({ filter: 'off' })).armed);
    ok('off still never answers a permission ask', A.autoAnswerFor(Object.assign({}, risky, { interactive: false }), settings({ filter: 'off' })).reason === 'permission');
    const unmarked = ask([{ question: 'Which one?', options: [{ label: 'A' }, { label: 'B' }] }]);
    const strict = A.autoAnswerFor(unmarked, settings({ filter: 'strict' }));
    ok('strict: a question that marks no recommendation waits, and says why', !strict.armed && /marks none/.test(strict.why));
    ok('strict: a marked one is answered', A.autoAnswerFor(ask([{ question: 'Which one?', options: [{ label: 'A (Recommended)' }, { label: 'B' }] }]), settings({ filter: 'strict' })).armed);
    eq('an unknown mode is the default', settings({ filter: 'lax' }).filter, 'recommended');
}

console.log('\n== the word list is the user\'s ==');
{
    const q = ask([{ question: 'Deploy to production now?', options: [{ label: 'Yes (Recommended)' }, { label: 'No' }] }]);
    ok('a word the user added stops it', !A.autoAnswerFor(q, settings({ words: ['deploy'] })).armed);
    ok('an empty list stops nothing — it is a choice, not a missing setting',
        A.autoAnswerFor(ask([{ question: 'Delete it?', options: [{ label: 'Yes' }] }]), settings({ words: [] })).armed);
    eq('trimmed, de-duplicated, blanks dropped', F.normalizeWords([' Wipe ', 'wipe', '', 3, 'purge']), ['Wipe', 'purge']);
    eq('not a list = the shipped list', F.normalizeWords(undefined), F.AUTO_ANSWER_DEFAULT_WORDS);
    ok('an entry matches at a word start, any case', F.wordMatcher('silin').test('Kayıtlar Silinecek mi') && F.wordMatcher('overwrite').test('OVERWRITES it'));
    ok('…never inside a word', !F.wordMatcher('sil').test('fosil'));
    ok('a /…/ entry is a regular expression', F.wordMatcher('/\\bsil\\b/').test('dosyayı sil') && !F.wordMatcher('/\\bsil\\b/').test('silah'));
    ok('a /…/ that does not compile is matched as text, never a crash', F.wordMatcher('/([/').test('a /([/ b'));
}

console.log('\n== ‼️ with the filter off, nothing stops the clock ==');
{
    const { AutoAnswerTimers } = require(path.join(ROOT, 'out', 'core', 'autoAnswerTimers.js'));
    let s = settings({ filter: 'off' });
    const a = Object.assign(ask([{ question: 'Go?', options: [{ label: 'Yes (Recommended)' }] }]), { ts: Date.now() });
    const t = new AutoAnswerTimers({ settings: () => s, askOf: () => a, expire: () => {} });
    ok('off: a Stop is refused', t.hold('c1') === false);
    ok('off: the card is told it cannot be stopped', A.autoAnswerView(a, s).holdable === false);
    s = settings({});
    ok('recommended: the person at the card may still stop it', t.hold('c1') === true && A.autoAnswerView(a, s).holdable === true);
}

console.log('\n== one list, three places ==');
{
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const props = Object.assign({}, ...[].concat(pkg.contributes.configuration).map(c => c.properties || {}));
    eq('package.json ships the core list', props[F.AUTO_ANSWER_WORDS_KEY].default, F.AUTO_ANSWER_DEFAULT_WORDS);
    eq('…and the core default mode', props[F.AUTO_ANSWER_FILTER_KEY].default, F.AUTO_ANSWER_DEFAULT_FILTER);
    eq('…and exactly the core modes', props[F.AUTO_ANSWER_FILTER_KEY].enum, F.AUTO_ANSWER_FILTERS);
    const Flex = require(path.join(ROOT, 'media', 'afFlex.js'));
    eq('the flex point carries the same list', Flex.point('console.autoAnswer.words').default, F.AUTO_ANSWER_DEFAULT_WORDS);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
