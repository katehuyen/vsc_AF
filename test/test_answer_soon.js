// U-214 — A QUESTION THAT ANSWERS ITSELF SAYS SO FIRST. A setting's worth before
// a Console question's K-43 clock runs out, the reminder's tone plays and (Say
// who on for Asking you) a sentence names whose question it is and how long is
// left. Once per question, on the reminder's own sweep; an answered, stopped or
// closed question stays quiet; Mute all and quiet hours hold it, Silent does not.
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const A = require(path.join(ROOT, 'out', 'core', 'answerSoon.js'));
const SP = require(path.join(ROOT, 'out', 'core', 'speechPhrases.js'));

// ---- the setting ----
ok('the lead is the default when unset or not a number, clamped otherwise, 0 = off',
    A.answerSoonSeconds(undefined) === 120 && A.answerSoonSeconds('x') === 120 && A.answerSoonSeconds(-5) === 0
    && A.answerSoonSeconds(99999) === A.ANSWER_SOON_MAX_SECONDS && A.answerSoonSeconds(0) === 0 && A.answerSoonSeconds(90.4) === 90);

// ---- when it is said ----
const T0 = 1_000_000;
const card = (over) => Object.assign({ cardId: 'c1', requestId: 'r1', agentName: 'developer', sessionId: 's1', state: 'armed', dueAt: T0 + 300_000, timeoutSeconds: 300 }, over || {});
{
    const m = new A.AnswerSoonMemo();
    ok('nothing while more than the lead is left', m.due(T0, [card()], 120).length === 0 && m.due(T0 + 175_000, [card()], 120).length === 0);
    const d = m.due(T0 + 190_000, [card()], 120);
    ok('inside the lead it is said, with the time really left', d.length === 1 && d[0].remainingMs === 110_000 && d[0].agentName === 'developer');
    ok('‼️ once per question: the next sweeps stay quiet', m.due(T0 + 220_000, [card()], 120).length === 0 && m.due(T0 + 250_000, [card()], 120).length === 0);
    ok('…a new question on the same card is a new wait', m.due(T0 + 250_000, [card({ requestId: 'r2' })], 120).length === 1);
}
{
    const m = new A.AnswerSoonMemo();
    m.due(T0 + 190_000, [card()], 120);
    m.due(T0 + 200_000, [], 120);
    ok('‼️ an answered or closed question is forgotten, so the same id coming back is told again',
        m.due(T0 + 210_000, [card()], 120).length === 1);
}
{
    const m = new A.AnswerSoonMemo();
    ok('‼️ a question whose timer a person stopped never rings', m.due(T0 + 190_000, [card({ state: 'held' })], 120).length === 0);
    ok('…nor one whose clock never ran (the filter kept it for a person)', m.due(T0 + 190_000, [card({ state: 'waiting', dueAt: 0 })], 120).length === 0);
    ok('…nor anything with the setting at 0', m.due(T0 + 190_000, [card()], 0).length === 0);
    ok('…nor a wait no longer than the lead: the question\'s own alert said it', m.due(T0 + 10_000, [card({ dueAt: T0 + 60_000, timeoutSeconds: 60 })], 120).length === 0);
    ok('…nor a clock already run out', m.due(T0 + 300_000, [card()], 120).length === 0);
    ok('two cards in the window are each told', m.due(T0 + 190_000, [card(), card({ cardId: 'c2', agentName: 'psikolog' })], 120).length === 2);
}

// ---- what is said ----
ok('whole minutes, never zero', A.minutesLeft(110_000) === 2 && A.minutesLeft(20_000) === 1 && A.minutesLeft(0) === 1);
ok('the sentence in English and Turkish',
    SP.SPEECH_PHRASES.en.answersSoon('developer', 2) === 'developer\'s question answers itself in 2 minutes'
    && SP.SPEECH_PHRASES.en.answersSoon('developer', 1) === 'developer\'s question answers itself in a minute'
    && SP.SPEECH_PHRASES.tr.answersSoon('developer', 2) === 'developer: soru 2 dakika içinde kendiliğinden cevaplanacak');
const ev = A.answerSoonEvent(Object.assign(card(), { remainingMs: 110_000 }));
ok('the phone gets the same moment as its own event',
    ev.type === 'ask.answersSoon' && ev.data.session === 'c1' && ev.data.askId === 'r1' && ev.data.agent === 'developer' && ev.data.minutes === 2);

// ---- the host ----
const ext = src('src/extension.ts');
ok('‼️ it rides the reminder\'s sweep, no clock of its own',
    /setInterval\(\(\) => \{ void nudgeSweep\(\); answerSoonTick\(\); \}, 30_000\)/.test(ext) && !/setInterval\([^\n]*answerSoon[^\n]*\)/.test(ext.replace('void nudgeSweep(); answerSoonTick();', '')));
const tick = ext.slice(ext.indexOf('answerSoonTick = () => {'), ext.indexOf('answerSoonTick = () => {') + 900);
ok('the cards come from the Console host\'s own auto-answer view, the lead from the setting',
    /consoleHost\.autoAnswerView\(c\.id\)/.test(tick) && /answerSoonSeconds\(cfg\(\)\.get\('console\.autoAnswer\.remindSeconds'\)\)/.test(tick));
ok('the phone is told when one is listening, with the reading in the interface\'s language (U-217)',
    /if \(remoteLive\) \{ remoteEmit\(\[answerSoonEvent\(d, currentUiLanguage\(\)\.lang\)\]\); \}/.test(tick));
const ring = ext.slice(ext.indexOf('const remindAnswerSoon = '), ext.indexOf('const remindAnswerSoon = ') + 1400);
ok('‼️ Mute all and quiet hours hold it, a session\'s Silent does not (the gate asked with no session)', /if \(alertSilence\(\)\.silent\) \{ return; \}/.test(ring));
ok('the reminder\'s own tone, through the one queue', /n\.voice && v\.playable/.test(ring) && /alertArbiter\.submit\(`answer-soon:\$\{d\.cardId\}:\$\{d\.requestId\}`, 'question'/.test(ring));
ok('the sentence only with Say who on for Asking you, in the voice\'s language',
    /if \(!speaks\(spk, 'question'\)\) \{ return tone; \}/.test(ring) && /how\.words\.answersSoon\(d\.agentName, minutesLeft\(d\.remainingMs\)\)/.test(ring));

// ---- the setting is a setting everywhere ----
const pkg = JSON.parse(src('package.json'));
const props = Object.assign({}, ...[].concat(pkg.contributes.configuration).map(c => c.properties || {}));
const p = props[A.ANSWER_SOON_KEY];
ok('the setting: seconds, default 120, 0 to half an hour', !!p && p.type === 'number' && p.default === 120 && p.minimum === 0 && p.maximum === 1800);
ok('…in the live category', /'console\.autoAnswer\.remindSeconds': 'live'/.test(src('src/core/settingsops.ts')));
ok('…and a flex point reached by settings.set', /setting\('console\.autoAnswer\.remindSeconds', N_\('Question timer reminder \(seconds before\)'\), 'number', 120, 'agentFarm\.console\.autoAnswer\.remindSeconds'/.test(src('media/afFlex.js')));

console.log(`test_answer_soon: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
