// U-182 — 🔊 SOUND › VOICE, in three rows read in the order they take effect:
// WHO says it (the voice, a Speed and a Volume SLIDER, never a raw number box),
// WHAT is said (the sentence, its placeholders added as CHIPS so nobody has to
// know to type {agent}, heard back with ▶ Hear it), and WHICH conversations have
// their answers read aloud — named, with ■ Stop on the one being read now, which
// the status line at the top also carries. The ids are the old strip's, so the
// voice, the sliders and the sentence write through the same arms as before.
'use strict';
const path = require('path');
const fs = require('fs');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));

const fire = (el, type) => (el && el._listeners && el._listeners[type] || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } }));
const withReaders = (readers) => { const d = fx.inUse(); d.alerts.speak = { ...d.alerts.speak, readers }; return d; };

{
    const d = withReaders([
        { sessionId: 'aaaa1111-0000-0000-0000-000000000000', label: 'developer #3', reading: true },
        { sessionId: 'bbbb2222-0000-0000-0000-000000000000', label: 'psikolog', reading: false }
    ]);
    const r = runPage('sound.js', d);
    const doc = r.sandbox.document;
    const html = (doc.getElementById('app') || {}).innerHTML || '';
    const at = s => html.indexOf(s);
    ok('‼️ three rows, in the order they take effect: Say who · Sentence · Read aloud',
        at('>Say who<') > 0 && at('>Say who<') < at('>Sentence<') && at('>Sentence<') < at('>Read aloud<'));
    ok('…after the event table, before the library', at('<table class="settbl alerttbl" data-afcards>') < at('>Say who<') && at('>Read aloud<') < at('>Library'));
    ok('‼️ Speed is a slider, −10 to 10, with its figure beside it',
        /<input type="range" id="alertspeakrate" min="-10" max="10"/.test(html) && /<span class="svval" id="alertspeakrateval">/.test(html));
    ok('‼️ Volume is a slider, 0 to 100', /<input type="range" id="alertspeakvol" min="0" max="100"/.test(html) && /<span class="svval" id="alertspeakvolval">/.test(html));
    ok('no raw number box is left for either', !/type="number" id="alertspeak(rate|vol)"/.test(html));
    ok('‼️ the sentence carries three chips: + agent · + event · + session',
        ['{agent}', '{event}', '{session}'].every(p => html.includes(`data-sptpladd="${p}"`)));
    ok('…and ▶ Hear it', /id="alertspeaktest"[^>]*>▶ Hear it</.test(html));
    ok('‼️ the reader being read now is named, with ■ Stop', /developer #3 · reading now[\s\S]{0,120}data-sndreadstop/.test(html));
    ok('…and one that reads but is not reading now has ✕ to turn it off', /class="svreader">psikolog[\s\S]{0,120}data-sndreadoff="bbbb2222/.test(html));
    ok('‼️ the status line at the top says what is being read, with its own ■',
        /class="sndstate"[^>]*>[^<]*reading: developer #3/.test(html) && (html.match(/data-sndreadstop/g) || []).length === 2);

    const tpl = doc.getElementById('alertspeaktpl');
    r.posted.length = 0;
    fire(doc.querySelectorAll('[data-sptpladd]').find(e => e.dataset.sptpladd === '{session}'), 'click');
    ok('‼️ a chip adds its placeholder and writes the sentence through alertSpeak',
        r.posted.some(m => m.type === 'alertSpeak' && m.template === '{agent}, {event}{session}')
        && tpl.value === '{agent}, {event}{session}');
    r.posted.length = 0;
    fire(doc.querySelectorAll('[data-sndreadstop]')[0], 'click');
    ok('■ Stop asks the host to stop reading (alerts.read stop)', r.posted.some(m => m.type === 'alertReadStop'));
    r.posted.length = 0;
    fire(doc.querySelectorAll('[data-sndreadoff]')[0], 'click');
    ok('✕ turns that session\'s Read aloud off, through alerts.session',
        r.posted.some(m => m.type === 'alertSessionApply' && m.sessionId === 'bbbb2222-0000-0000-0000-000000000000'
            && m.patch && m.patch.read === false));
    const rate = doc.getElementById('alertspeakrate');
    rate.value = '-3';
    fire(rate, 'input');
    ok('dragging the Speed slider updates its figure live', doc.getElementById('alertspeakrateval').textContent === '-3');
    r.posted.length = 0;
    fire(rate, 'change');
    ok('…and letting go writes it as a NUMBER', r.posted.some(m => m.type === 'alertSpeak' && m.rate === -3));
}
{
    const r = runPage('sound.js', withReaders([]));
    const html = (r.sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('with nobody reading, the row says where Read aloud is turned on', /No session reads its answers aloud/.test(html) && /Console card/.test(html));
    ok('…and nothing offers a ■', !/data-sndreadstop/.test(html));
}

// ---- the host half ----
const ext = src('src/extension.ts');
ok('‼️ the model names the readers from the store and the one reader',
    /readers: live\.sessions\(\)\s*\.filter\(x => turnAlerts\.readAloudFor\(x\.sessionId\) \|\| readingNow\.is\(x\.sessionId\)\)/.test(ext));
ok('‼️ a session preference or a reading repaints the Sound page too', /ConsolePanel\.refreshIfOpen\(\); SoundPanel\.refreshIfOpen\(\);/.test(ext));
ok('the strip moved out of afSoundStrips.js whole', !/alertSpeakStrip/.test(src('media/afSoundStrips.js')));
ok('the page draws and wires the Voice section', /S\(\)\.voice\(al\)/.test(src('media/sound.js')) && /S\(\)\.wireVoice\(vscode\)/.test(src('media/sound.js')));
ok('…which every webview loads after the strips', /src="\$\{soundStrips\}"><\/script>\n<script nonce="\$\{nonce\}" src="\$\{soundVoice\}">/.test(src('src/panels/base.ts')));

console.log(`\ntest_sound_voice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
