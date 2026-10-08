// U-205 — HOW A READING SOUNDS (agentFarm.alerts.reading): its own voice, speed, Read aloud's length and
// the way code is said, apart from the announcement; every reading takes them, and the Sound page sets them.
//
//   node test/test_reading_prefs.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const P = require(path.join(ROOT, 'out', 'core', 'readingPrefs.js'));
const S = require(path.join(ROOT, 'out', 'core', 'speech.js'));
const { readNow } = require(path.join(ROOT, 'out', 'core', 'readerOps.js'));
const { ReadingNow } = require(path.join(ROOT, 'out', 'core', 'soundCard.js'));
const { EN_PHRASES } = require(path.join(ROOT, 'out', 'core', 'speechPhrases.js'));
const { handleAlertMessage } = require(path.join(ROOT, 'out', 'panels', 'alertMessages.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const fire = (el, type) => (el && el._listeners && el._listeners[type] || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } }));
const FIELDS = Object.keys(P.READING_DEFAULT);

// --- the stored setting ---
eq('unset, null and garbage are today\'s readings', [undefined, null, 'x', { rate: 'fast', length: 'all', code: 'mute', voice: 7 }].map(P.readingPrefsOf),
    Array(4).fill({ voice: '', rate: 0, length: 'first', code: 'size' }));
eq('a stored value is kept, the rate clamped to −10…10 in whole steps and the voice trimmed',
    P.readingPrefsOf({ voice: '  Tolga ', rate: 14.6, length: 'whole', code: 'skip' }), { voice: 'Tolga', rate: 10, length: 'whole', code: 'skip' });
ok('a patch is refused field by field, by name',
    /rate is a number from -10/.test(P.parseReadingPatch({ rate: 'fast' }).error) && /rate is a number/.test(P.parseReadingPatch({ rate: true }).error)
    && /length is one of first, whole/.test(P.parseReadingPatch({ length: 'all' }).error)
    && /code is one of size, skip/.test(P.parseReadingPatch({ code: 'mute' }).error)
    && /voice is a voice's name/.test(P.parseReadingPatch({ voice: 3 }).error));
eq('…and only what was named is in it', P.parseReadingPatch({ rate: '3', code: 'skip', other: 1 }), { ok: true, patch: { rate: 3, code: 'skip' } });
eq('an ask always reads everything; Read aloud follows length',
    [P.readingLimit(P.READING_DEFAULT, true), P.readingLimit(P.READING_DEFAULT, false), P.readingLimit({ ...P.READING_DEFAULT, length: 'whole' }, false)],
    [0, S.DIALOGUE_MAX, 0]);
ok('the conversation\'s own voice wins over the reading\'s; neither is Auto',
    P.readingVoiceWant('Zira', { ...P.READING_DEFAULT, voice: 'Tolga' }) === 'Zira' && P.readingVoiceWant('', { ...P.READING_DEFAULT, voice: 'Tolga' }) === 'Tolga'
    && P.readingVoiceWant('', P.READING_DEFAULT) === '');
ok('size keeps the words as they are', P.readingWords(EN_PHRASES, P.READING_DEFAULT) === EN_PHRASES);

// --- the cleaner, with code said or skipped ---
const answer = ['Run the build first.', '', '```', 'npm run build', 'npm test', '```', '', 'It failed here:', '',
    'Error: boom', '    at run (/src/app.js:10:5)', '    at main (/src/app.js:20:1)', '', 'The config was:', '',
    '{', '  "a": 1,', '  "b": 2', '}', '', 'And the inline data {"x": 1, "y": 2} came back.', '', '    const x = 1;', '    const y = 2;', '', 'That is all.'].join('\n');
const said = S.speechParagraphs(answer, 0, EN_PHRASES);
ok('size: the code, the trace, the JSON and the indented code are each said by their size',
    said.includes('a 2-line code block.') && said.some(p => /error trace of 2 lines/.test(p)) && said.includes('a 4-line code block.')
    && said.some(p => /a JSON object with 2 keys/.test(p)));
const skipped = S.speechParagraphs(answer, 0, P.readingWords(EN_PHRASES, { ...P.READING_DEFAULT, code: 'skip' }));
ok('skip: none of them is said, and their words are not read either (the error\'s own message is prose and stays)',
    !skipped.some(p => /code block|error trace|JSON|npm|const|app\.js|"a"|run \(|main \(/.test(p)));
ok('‼️ skip leaves no paragraph that is only a stop — the player would step onto silence',
    skipped.every(p => /[\p{L}\p{N}]/u.test(p)) && skipped.length > 0);
eq('skip keeps every sentence the agent wrote, in order', skipped,
    ['Run the build first.', 'It failed here:', 'Error: boom.', 'The config was:', 'And the inline data came back.', 'That is all.']);

// --- every reading asked for takes them ---
(async () => {
    const spoke = [], wants = [];
    const deps = (reading, own) => ({
        conversation: () => ({ sessionId: 'sid-full', label: 'dev', steps: [{ role: 'assistant', text: answer, turn: 1, uuid: 'a1' }] }),
        voiceOf: () => own || '', fleet: () => ({ on: false, voice: 'Zira', rate: -4, volume: 55, events: [], template: '' }),
        reading: () => reading,
        speechFor: async w => { wants.push(w); return { voice: w || 'auto-voice', words: EN_PHRASES }; },
        dialogue: { speaking: false, state: null, act: () => true, setRate: () => true,
            speak: (paras, cfg, d) => { spoke.push({ paras, cfg, d }); return new Promise(() => undefined); } },
        readingNow: new ReadingNow(), stop: () => true
    });
    await readNow(deps({ voice: '', rate: 4, length: 'first', code: 'skip' }), { sessionId: 'sid', last: true }, 'test');
    ok('an ask: Auto when nothing is chosen (never the announcement\'s voice), the reading\'s speed, the announcement\'s volume',
        wants[0] === '' && spoke[0].cfg.voice === 'auto-voice' && spoke[0].cfg.rate === 4 && spoke[0].cfg.volume === 55);
    ok('…code skipped in what it reads', !spoke[0].paras.some(p => /code block|error trace/.test(p)) && spoke[0].paras.includes('That is all.'));
    await readNow(deps({ voice: 'Tolga', rate: 0, length: 'first', code: 'size' }, 'Mark'), { sessionId: 'sid', last: true }, 'test');
    await readNow(deps({ voice: 'Tolga', rate: 0, length: 'first', code: 'size' }), { text: 'Read me.' }, 'test');
    ok('a conversation\'s own voice wins; free text takes the reading\'s voice', wants[1] === 'Mark' && wants[2] === 'Tolga'
        && spoke[1].paras.includes('a 2-line code block.'));

    // --- the host wiring ---
    const ext = src('src/extension.ts');
    const fn = ext.slice(ext.indexOf('function readTurnAloud('), ext.indexOf('function askOfSession('));
    ok('the setting is read on every reading, never cached', /const readingCfg = \(\): ReadingPrefs => readingPrefsOf\(cfg\(\)\.get\('alerts\.reading'\)\)/.test(ext));
    ok('Read aloud: the reading\'s voice, words, ceiling and speed, and the time a whole answer needs',
        /readingVoiceWant\(turnAlerts\.speechVoiceFor\(s\.sessionId\), prefs\)/.test(fn) && /readingWords\(how\.words, prefs\)/.test(fn)
        && /readingLimit\(prefs, false\)/.test(fn) && /rate: prefs\.rate/.test(fn) && /timeoutMs: readingTimeoutMs\(/.test(fn) && !/fleet\.voice/.test(fn));
    ok('every ask reaches the setting through readerDeps', /fleet: speakCfg, reading: readingCfg,/.test(ext));
    const op = ext.slice(ext.indexOf("op: 'alerts.readingSettings'"), ext.indexOf("op: 'alerts.readingSettings'") + 2200);
    ok('alerts.readingSettings writes through alertsSetReading and plays through readNow',
        op.length > 100 && /await alertsSetReading\(raw\)/.test(op) && /readNow\(readerDeps, \{ text:/.test(op) && /Object\.keys\(READING_DEFAULT\)/.test(op));
    ok('the page\'s writes go through the same function', /alertsSetReading: async \(patch\) => \{ await alertsSetReading\(patch\); \}/.test(ext));
    ok('alerts.status carries the reading and the voice it reaches', /reading: \(\(\) => \{\s*const r = readingCfg\(\);[\s\S]{0,200}resolvedName/.test(ext));
    const pkg = JSON.parse(src('package.json')).contributes.configuration;
    const node = (Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties['agentFarm.alerts.reading']).find(Boolean);
    ok('the setting\'s default is the core\'s, field for field', node && JSON.stringify(node.default) === JSON.stringify(P.READING_DEFAULT)
        && FIELDS.every(k => node.properties[k] && JSON.stringify(node.properties[k].default) === JSON.stringify(P.READING_DEFAULT[k])));
    ok('…its choices are the core\'s', JSON.stringify(node.properties.length.enum) === JSON.stringify(P.READ_LENGTHS)
        && JSON.stringify(node.properties.code.enum) === JSON.stringify(P.READ_CODES));
    ok('…in the Sound group', require('../out/core/settingsCatalog/index.js').catalogEntry('alerts.reading').group === 'sound');
    const flex = src('media/afFlex.js');
    ok('a flex point per field, set on the setting and on the op', FIELDS.every(k => new RegExp(`reading\\('${k}', N_\\(`).test(flex))
        && /'setting:agentFarm\.alerts\.reading#' \+ field/.test(flex) && /'alerts\.readingSettings:' \+ field/.test(flex));

    // --- the router ---
    const seen = [];
    let redrawn = 0;
    const surface = { error: e => seen.push(['error', e]), refresh: () => { redrawn++; } };
    await handleAlertMessage({ type: 'alertReading', patch: { code: 'skip' } }, { alertsSetReading: async p => { seen.push(p); } }, surface);
    await handleAlertMessage({ type: 'alertReading', patch: 'x' }, { alertsSetReading: async p => { seen.push(p); } }, surface);
    await handleAlertMessage({ type: 'alertReading', patch: { rate: 'x' } }, { alertsSetReading: async () => { throw new Error('rate is a number'); } }, surface);
    eq('a Reading row writes through the host act and redraws; a refusal is shown', [seen, redrawn],
        [[{ code: 'skip' }, {}, ['error', 'rate is a number']], 2]);

    // --- the Sound page ---
    const d = fx.inUse();
    d.alerts.reading = { voice: '', rate: 3, length: 'whole', code: 'skip', defaults: P.READING_DEFAULT, resolved: '', resolvedName: '' };
    const r = runPage('sound.js', d);
    const html = r.html();
    const at = s => html.indexOf(s);
    const head = at('class="svsub">Reading ');
    ok('Reading sits under Voice, after its rows and before Sessions', head > at('id="alertspeaktpl"') && head < at('>Sessions<')
        && at('id="readvoice"') > head && at('id="readhear"') < at('>Sessions<'));
    ok('its voice box offers Auto (selected) and this machine\'s voices',
        /<select id="readvoice"[^>]*>\s*<option value=""[^>]*selected/.test(html) && /id="readvoice"[\s\S]*Microsoft Tolga - Turkish/.test(html));
    ok('speed at the stored value, length and code at theirs', /id="readrate"[^>]*value="3"/.test(html)
        && /<select id="readlength"[\s\S]*?value="whole"[^>]*selected/.test(html) && /<select id="readcode"[\s\S]*?value="skip"[^>]*selected/.test(html));
    const send = (id, v) => { const el = r.query('#' + id)[0]; el.value = v; fire(el, 'change'); return r.last(); };
    eq('each row writes its own field', [send('readvoice', 'Microsoft Tolga - Turkish (Turkey)'), send('readrate', '-2'), send('readlength', 'first'), send('readcode', 'size')],
        [{ type: 'alertReading', patch: { voice: 'Microsoft Tolga - Turkish (Turkey)' } }, { type: 'alertReading', patch: { rate: -2 } },
            { type: 'alertReading', patch: { length: 'first' } }, { type: 'alertReading', patch: { code: 'size' } }]);
    r.query('#readhear')[0].click();
    const h = r.last();
    ok('Hear it reads a sample with code in it through the one reading channel', h.type === 'readAloud' && h.sessionId === '' && h.surface === 'sound'
        && /^This is how an answer is read aloud/.test(h.pick.text) && /```\nnpm run build\nnpm test\n```/.test(h.pick.text));
    const bad = fx.inUse();
    bad.alerts.reading = { ...d.alerts.reading, voice: 'Nobody', resolvedName: '' };
    ok('a name no voice answers to is shown and marked', /<option value="Nobody"[^>]*selected[^>]*>⚠ Nobody — no voice answers to that/.test(runPage('sound.js', bad).html()));
    const none = fx.inUse();
    none.alerts.speak = { ...none.alerts.speak, voicesLoaded: false };
    delete none.alerts.reading;
    const nh = runPage('sound.js', none).html();
    ok('before the voices are read the box waits; with no reading data the defaults are drawn',
        /<select id="readvoice" disabled>/.test(nh) && /id="readrate"[^>]*value="0"/.test(nh) && /<select id="readcode"[\s\S]*?value="size"[^>]*selected/.test(nh));
    const tr = runPage('sound.js', d, { __AFUI__: { lang: 'tr', locale: 'tr' } }).html();
    ok('in Turkish', /class="svsub">Okuma /.test(tr) && /Otomatik — metnin diline uy/.test(tr) && /Sessizce atla/.test(tr)
        && /id="readhear"[^>]*>▶ Dinle</.test(tr) && /class="svlbl">Uzunluk</.test(tr));
    const sum = rd => r.sandbox.window.AFSoundCard.summary(Object.assign({}, d.alerts, { reading: rd }));
    ok('the Settings summary names what differs from out of the box, and nothing at the defaults',
        /reads in Microsoft Tolga · reading speed 3 · Read aloud reads whole answers · code left out of readings/.test(
            sum({ voice: 'Tolga', resolvedName: 'Microsoft Tolga', rate: 3, length: 'whole', code: 'skip' }))
        && !/reads in|reading speed|whole answers|left out/.test(sum({ ...P.READING_DEFAULT })));

    console.log(`test_reading_prefs: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
