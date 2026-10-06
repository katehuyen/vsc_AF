// U-208 — WITH READ ALOUD ON, THE QUESTION IS READ TOO.
//
// Measured before: the reading took the turn-ready edge only, so an agent that stopped on an
// AskUserQuestion or a permission ask — the moment somebody across the room most wants to hear —
// read nothing. Now the question edge reads the QUESTION (never the half answer before it): the
// Console card's questions and options, or the tool waiting for permission, in the voice's language.
//
//   node test/test_ask_spoken.js
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, a === b);
const OUT = path.join(__dirname, '..', 'out', 'core');
const A = require(path.join(OUT, 'askSpoken.js'));
const P = require(path.join(OUT, 'speechPhrases.js'));
const S = require(path.join(OUT, 'speech.js'));
const EN = P.SPEECH_PHRASES.en, TR = P.SPEECH_PHRASES.tr;
const read = (who, ask, w) => S.sanitizeForSpeech(A.askSpoken(who, ask, w), 0, w);

// --- the Console's card (ConsoleAsk) ---
const card = {
    requestId: 'r1', tool: 'AskUserQuestion', interactive: true, input: {}, detail: 'Which database?', ts: 1,
    questions: [{ question: 'Which database?', options: [{ label: 'Postgres', description: 'big' }, { label: 'SQLite' }] }]
};
eq('a question is read with its options', read('developer', A.askFrom(card), EN),
    'developer asks: Which database? Options: Postgres, SQLite.');
eq('…and every question of the card, the name said once',
    read('developer', A.askFrom({ ...card, questions: [...card.questions, { question: 'Which port', options: [{ label: '5432' }] }] }), EN),
    'developer asks: Which database? Options: Postgres, SQLite. Which port. Options: 5432.');
eq('a question with no options is read as asked', read('developer', A.askFrom({ ...card, questions: [{ question: 'Name it?', options: [] }] }), EN),
    'developer asks: Name it?');
eq('a permission card reads the command it wants to run',
    read('developer', A.askFrom({ requestId: 'r2', tool: 'Bash', interactive: false, input: { command: 'npm test' }, questions: [], detail: 'npm test', ts: 1 }), EN),
    'developer wants to run: npm test.');
eq('…and another tool by its name, its path cut to the file',
    read('developer', A.askFrom({ tool: 'Edit', questions: [], detail: 'src/core/speech.ts' }), EN),
    'developer wants to use Edit: speech.ts.');

// --- a hook-watched session: the tool it last started ---
eq('without a card, the last tool start is what waits for permission',
    read('codex', A.askFrom(undefined, 'Bash', 'git push'), EN), 'codex wants to run: git push.');
eq('…a tool with no detail is named alone', read('codex', A.askFrom(undefined, 'WebFetch'), EN), 'codex wants to use WebFetch.');
ok('‼️ a question tool whose questions are not known reads NOTHING — never a guessed question',
    A.askSpoken('codex', A.askFrom(undefined, 'AskUserQuestion', ''), EN) === ''
    && A.askSpoken('codex', A.askFrom({ tool: 'AskUserQuestion', questions: [] }), EN) === '');
ok('…and nothing known at all reads nothing', A.askSpoken('codex', A.askFrom(undefined), EN) === '');
eq('a session with no name is "an agent"', read('', A.askFrom(undefined, 'Bash', 'ls'), EN), 'an agent wants to run: ls.');
ok('a malformed card is no question, not a crash',
    A.askFrom({ questions: [null, 3, { question: 7 }, { question: 'Q?', options: [null, { label: '' }, 'A'] }] }).questions.length === 1
    && A.askFrom({ questions: [{ question: 'Q?', options: [null, { label: '' }, 'A'] }] }).questions[0].options.join() === 'A');

// --- language ---
ok('the language is sensed from what the agent wrote, not from the tool name',
    A.askSense(A.askFrom(card)) === 'Which database? Postgres SQLite' && A.askSense(A.askFrom(undefined, 'Bash', 'npm test')) === 'npm test');
eq('in a Turkish voice the inserted words are Turkish',
    read('developer', A.askFrom({ ...card, questions: [{ question: 'Hangi veritabanı?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }] }), TR),
    'developer soruyor: Hangi veritabanı? Seçenekler: Postgres, SQLite.');
eq('…the permission too', read('developer', A.askFrom(undefined, 'Bash', 'npm test'), TR), 'developer şunu çalıştırmak istiyor: npm test.');

// --- the wiring: the question edge reaches the reader, on its own key ---
const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
const fn = ext.slice(ext.indexOf('function readTurnAloud('), ext.indexOf('function askOfSession('));
ok('readTurnAloud takes the question edge and reads the ask, not the half answer',
    /event !== 'turn-ready' && event !== 'question'/.test(fn) && /const words = readingWords\(how\.words, prefs\)/.test(fn)
    && /askSpoken\(live\.labelOf\(s\), ask, words\)/.test(fn));
// U-205 — the session's own voice, else the reading's ('' = Auto), chosen by the question's own words
ok('…the voice chosen by the question\'s own words', /speechFor\(readingVoiceWant\(turnAlerts\.speechVoiceFor\(s\.sessionId\), prefs\), sense\)/.test(fn));
ok('…and a question and the turn that follows it are two readings, not one', /read:\$\{event\}:/.test(fn));
ok('the ask comes from the Console card first, else the session\'s last tool start',
    /pendingAsk[\s\S]{0,120}askFrom\(card\)[\s\S]{0,260}kind === 'toolStart'/.test(ext.slice(ext.indexOf('function askOfSession(')).slice(0, 700)));

console.log(`test_ask_spoken: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
