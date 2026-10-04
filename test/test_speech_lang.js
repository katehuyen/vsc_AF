// U-203 — A READING IS VOICED IN ITS OWN LANGUAGE, AND THE WORDS IT INSERTS ARE THE VOICE'S.
//
// Measured before: with no voice chosen a Turkish answer was read by an en-US voice (unintelligible),
// and "a one-line code block" / "There is more." / an announcement's {event} were English even in a
// Turkish voice. Now: the text's language is sensed (script, letters, common words — code and links
// left out); with no voice chosen (Auto) the installed voice of that culture reads it; a chosen voice
// always wins; the inserted words come from the table of the language the voice speaks; a template
// the user typed is said as typed. The table is data — every language in it has every phrase.
//
//   node test/test_speech_lang.js
'use strict';
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const OUT = path.join(__dirname, '..', 'out', 'core');
const L = require(path.join(OUT, 'speechLang.js'));
const P = require(path.join(OUT, 'speechPhrases.js'));
const S = require(path.join(OUT, 'speech.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));

// --- the sensing ---
const TR = 'Bu değişiklik için önce testleri çalıştırdım ve hepsi geçti; şimdi sürümü hazırlıyorum.';
const EN = 'I ran the tests and all of them passed; the build is ready for you to try now.';
ok('a Turkish answer reads as Turkish', L.detectLang(TR) === 'tr');
ok('an English answer reads as English', L.detectLang(EN) === 'en');
ok('Turkish without its letters still reads as Turkish, by its words', L.detectLang('Bu iş bitti ama daha var, sonra bakarız.') === 'tr');
ok('‼️ code and links do not outvote the prose around them',
    L.detectLang('Şunu çalıştır:\n```\nnpm install the and is to of for with this\n```\nve sonra `the and is` çıktısına bak: https://example.com/the/and/is') === 'tr');
ok('‼️ inline code alone does not outvote the prose either', L.detectLang('Bu `the and is to of for with this you was not on be` ile olur') === 'tr');
ok('a Turkish name in English prose stays English', L.detectLang('Murat asked for the report and it is ready now.') === 'en');
ok('no sign → no language', ['', 'OK', '12345', '```\nconst x = 1;\n```'].every(t => L.detectLang(t) === ''));
ok('cultures map to the table\'s tags; others to nothing',
    L.langOfCulture('tr-TR') === 'tr' && L.langOfCulture('en-US') === 'en' && L.langOfCulture('de-DE') === '' && L.langOfCulture('') === '');

// --- the voice ---
const V = (name, culture, engine) => ({ id: `HKEY_LOCAL_MACHINE\\X\\${name}`, name, culture, engine });
const voices = [V('Microsoft David Desktop', 'en-US', 'sapi5'), V('Microsoft Zira', 'en-US', 'onecore'), V('Microsoft Tolga', 'tr-TR', 'onecore'), V('Microsoft Mark', 'en-US', 'onecore')];
ok('the voice of a language: OneCore first, then by name', L.voiceForLang(voices, 'tr').name === 'Microsoft Tolga' && L.voiceForLang(voices, 'en').name === 'Microsoft Mark');
ok('no voice for a language → none', L.voiceForLang(voices, 'de') === undefined && L.voiceForLang(voices, '') === undefined);
const auto = L.chooseSpeechVoice('', TR, voices, 'en');
ok('Auto + a Turkish answer → the Turkish voice, by its token id, Turkish words', auto.how === 'auto' && auto.voice === voices[2].id && auto.lang === 'tr');
ok('Auto + an English answer → an English voice', L.chooseSpeechVoice('', EN, voices, 'tr').voice === voices[3].id);
ok('‼️ a voice chosen by hand always wins — and the words follow THAT voice\'s language',
    (c => c.how === 'chosen' && c.voice === 'David' && c.lang === 'en')(L.chooseSpeechVoice('David', TR, voices, 'tr')));
ok('a chosen name nothing answers is passed as written (the speaker fails it loudly), words in the text\'s language',
    (c => c.voice === 'Nobody' && c.lang === 'tr' && c.how === 'chosen')(L.chooseSpeechVoice('Nobody', TR, voices, 'en')));
ok('no sign in the text → the interface language decides',
    L.chooseSpeechVoice('', '{agent}', voices, 'tr').voice === voices[2].id && L.chooseSpeechVoice('', ' , ', voices, 'en').voice === voices[3].id);
const none = L.chooseSpeechVoice('', TR, voices.filter(v => v.culture !== 'tr-TR'), 'en');
ok('no Turkish voice installed → the system voice (\'\'), still Turkish words', none.how === 'default' && none.voice === '' && none.lang === 'tr');
const gaps = L.autoVoices(voices.filter(v => v.culture !== 'tr-TR'));
ok('autoVoices names every table language, a missing one without a voice', gaps.length === L.SPEECH_LANGS.length && !gaps.find(a => a.tag === 'tr').voice && gaps.find(a => a.tag === 'en').voice.name === 'Microsoft Mark');

// --- the table is complete ---
const EVENTS = Object.keys(P.EN_PHRASES.events);
const KEYS = Object.keys(P.EN_PHRASES);
ok('every language in the table has every phrase English has, every event included',
    L.SPEECH_LANGS.every(l => {
        const w = P.SPEECH_PHRASES[l.tag];
        return w && EVENTS.every(e => w.events[e]) && KEYS.every(k => typeof w[k] === typeof P.EN_PHRASES[k]
            && (typeof w[k] === 'function' ? String(w[k](2, 2, 3)).trim() : typeof w[k] !== 'string' || w[k].trim()));
    }));
ok('U-204 — the shapes are said in the voice\'s language too',
    S.sanitizeForSpeech('Bak:\n\n    npm test\n\nve extension.ts:12 ile b408c739.', 0, P.SPEECH_PHRASES.tr)
        === 'Bak: tek satırlık bir kod bloğu. ve extension.ts, satır 12 ile bir kimlik.');
ok('an unknown language falls back to English', L.phrasesFor('xx') === P.EN_PHRASES && L.phrasesFor(undefined) === P.EN_PHRASES);

// --- the cleaner speaks the voice's language ---
const md = 'Şöyle:\n```\nnpm test\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nAyrıntı: https://example.com/x ve ![](i.png).';
const tr = S.sanitizeForSpeech(md, undefined, L.phrasesFor('tr'));
ok('Turkish words in a Turkish reading: the code block, the table, the link, the image',
    /tek satırlık bir kod bloğu/.test(tr) && /\d satırlık bir tablo/.test(tr) && /bir bağlantı/.test(tr) && /bir görsel/.test(tr));
ok('‼️ no English inserted into it', !/code block|a table of|a link|an image/.test(tr));
ok('English stays exactly as before when no language is named', /a one-line code block/.test(S.sanitizeForSpeech(md)) && /a table of \d rows/.test(S.sanitizeForSpeech(md)));
const long = ('Bu cümle uzun bir cevabın parçasıdır ve okunacaktır. ').repeat(60);
ok('the cut says "there is more" in the voice\'s language', S.sanitizeForSpeech(long, undefined, L.phrasesFor('tr')).endsWith('Devamı var.')
    && S.sanitizeForSpeech(long).endsWith(S.DIALOGUE_MORE));

// --- the announcement ---
const cfg = S.speakConfig({ template: '{agent}, {event}' });
ok('{event} and the missing agent in the voice\'s language', S.announcement(cfg, { event: 'question' }, L.phrasesFor('tr')) === 'bir ajan, sana soruyor');
ok('‼️ the words the user typed are said as typed', S.announcement(S.speakConfig({ template: 'Dikkat {agent}: {event}' }), { event: 'turn-ready', agent: 'developer' }, L.phrasesFor('tr')) === 'Dikkat developer: tur bitti');
ok('English unchanged by default', S.announcement(cfg, { event: 'question', agent: 'developer' }) === 'developer, asking you');

// --- the Sound page says what Auto does ---
{
    const r = runPage('sound.js', fx.autoGap());
    const html = (r.sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('the no-voice row is Auto, not "System default"', /Auto — match the answer(&#39;|')s language/.test(html) && !/System default — whichever voice/.test(html));
    ok('the gap is said under the box, with the free fix', /No Turkish voice is installed, so Auto reads Turkish with the system voice/.test(html) && /Add voices/.test(html));
    const full = runPage('sound.js', fx.inUse());
    const fh = (full.sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('with every language voiced, no gap line', !/voice is installed, so Auto/.test(fh));
}

console.log(`test_speech_lang: ${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
