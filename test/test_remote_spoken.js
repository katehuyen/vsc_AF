// U-217 — WHAT A PHONE READS ALOUD COMES FROM THE HOST: the remote events carry
// `spoken: { text, lang }` made by the PC's own cleaner, in the text's language.
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const out = m => require(path.join(ROOT, 'out', 'core', m));
const R = out('remoteEvents.js');
const RS = out('remoteSpoken.js');
const A = out('answerSoon.js');
const S = out('speech.js');
const L = out('speechLang.js');
const K = require(path.join(ROOT, 'out', 'remote', 'contract', 'index.js'));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'remote', 'contract', 'remote-contract.v1.json'), 'utf8'));
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

const passes = (type, data) => K.checkFrame({ kind: 'event', seq: 1, type, ts: 1, data }).ok;

// ---------- a finished turn ----------
const card = (messages, endedAt) => ({ id: 's1', agentName: 'developer', status: 'idle', messages, lastTurn: { endedAt } });
const TR = 'Derleme bitti ve testler yeşil, şimdi sürümü çıkarıyorum.\n\n```ts\nconst a = 1;\nconst b = 2;\n```';
const turnOf = (messages, ui) => {
    const m = R.consoleEvents(R.EMPTY_CONSOLE_MEMO, 's1', card(messages, 1), ['s1']).memo;
    return R.consoleEvents(m, 's1', card(messages, 2), ['s1'], ui).events.find(e => e.type === 'turn.finished');
};
const t = turnOf([{ role: 'user', text: 'Yayınla' }, { role: 'agent', text: TR }], 'en');
ok('a Turkish turn carries spoken in Turkish whatever the interface is', t && t.data.spoken && t.data.spoken.lang === 'tr');
ok('its code block is said by size in Turkish words, never the phone\'s English "code block"',
    t && /2 satırlık bir kod bloğu/.test(t.data.spoken.text) && !/code block/i.test(t.data.spoken.text) && !/const a/.test(t.data.spoken.text));
ok('‼️ the same text the PC reader would say: the one cleaner, its ceiling, the language\'s words',
    t && t.data.spoken.text === S.sanitizeForSpeech(TR, S.DIALOGUE_MAX, L.phrasesFor('tr')));
const steps = turnOf([{ role: 'user', text: 'Go' }, { role: 'agent', text: 'Reading the files first.' }, { role: 'agent', text: 'All tests pass now.' }], 'en');
ok('the turn is read by what it ENDED with, not every step before it (the PC reader\'s `said`)',
    steps && steps.data.spoken.text === 'All tests pass now.' && /Reading the files/.test(steps.data.summary));
const LONG = 'This is the answer and it is long. '.repeat(80);
const long = turnOf([{ role: 'agent', text: LONG }], 'en');
ok('a long answer is cut at the reader\'s own ceiling, no shorter, and says there is more',
    long && long.data.spoken.text === S.sanitizeForSpeech(LONG, S.DIALOGUE_MAX, L.phrasesFor('en'))
    && long.data.spoken.text.length > S.DIALOGUE_MAX * 0.8 && long.data.spoken.text.endsWith('There is more.'));
const code = '```\nls -la\n```';
ok('a text with no sign of its own is read in the interface\'s language',
    turnOf([{ role: 'agent', text: code }], 'tr').data.spoken.lang === 'tr'
    && turnOf([{ role: 'agent', text: code }], 'tr').data.spoken.text === 'tek satırlık bir kod bloğu.'
    && turnOf([{ role: 'agent', text: code }], '').data.spoken.lang === 'en');
ok('the old summary still rides beside it for an older phone', t && typeof t.data.summary === 'string' && t.data.summary.length > 0);
ok('turn.finished with spoken passes the contract', t && passes('turn.finished', t.data));

// ---------- a question ----------
const ASK = { requestId: 'q1', questions: [{ question: 'Hangisi?', options: [{ label: 'A' }, { label: 'B' }] }] };
const askEv = (ui) => {
    const m = R.consoleEvents(R.EMPTY_CONSOLE_MEMO, 's1', card([{ role: 'agent', text: 'x' }], 1), ['s1']).memo;
    return R.consoleEvents(m, 's1', Object.assign(card([{ role: 'agent', text: 'x' }], 1), { pendingAsk: ASK }), ['s1'], ui)
        .events.find(e => e.type === 'ask.opened');
};
const q = askEv('tr');
ok('ask.opened reads who asks, the question and its options (askSpoken)',
    q && q.data.spoken && /^developer soruyor: Hangisi\?/.test(q.data.spoken.text) && /Seçenekler: A, B\./.test(q.data.spoken.text));
ok('‼️ the contract\'s ask.opened example is what the host really says', q && JSON.stringify(q.data.spoken) === JSON.stringify(C.events['ask.opened'].example.spoken));
ok('ask.opened with spoken passes the contract', q && passes('ask.opened', q.data));

// ---------- a permission ----------
const perm = (sid, detail) => ({ urgency: 0, kind: 'permission', agentName: 'developer', title: 'Permission', detail, ref: { sessionId: sid } });
const permEv = (row, askOf, ui) => R.needsEvents(R.EMPTY_NEEDS_MEMO, [row], ui || 'en', askOf).events.find(e => e.type === 'permission.opened');
const asked = [];
const p = permEv(perm('s9', 'Claude needs your permission to use Bash'), sid => { asked.push(sid); return { tool: 'Bash', detail: 'git status', questions: [] }; });
ok('a permission is read as the PC reads it: the session\'s own ask, looked up by its session', asked.join() === 's9'
    && p && JSON.stringify(p.data.spoken) === JSON.stringify(C.events['permission.opened'].example.spoken));
const bare = permEv(perm('s9', 'Claude needs your permission to use Edit'), () => ({ questions: [] }));
ok('an ask that knows nothing falls back to the tool the row names', bare && bare.data.spoken && bare.data.spoken.text === 'developer wants to use Edit.');
ok('no session: nothing is looked up, the row\'s tool is said',
    permEv(perm('', 'Claude needs your permission to use Bash'), () => { throw new Error('looked up'); }).data.spoken.text === 'developer wants to run.');
const none = permEv(perm('s9', ''), undefined);
ok('nothing to say leaves the field off rather than an empty one', none && !('spoken' in none.data));
ok('permission.opened with spoken passes the contract', p && passes('permission.opened', p.data));

// ---------- a notice ----------
const n = R.noticeEvent({ id: 'n_12', title: 'Rapor hazır', level: 2, agentName: 'developer' }, 'en');
ok('‼️ a notice reads its title, in the title\'s language — the contract example is the real output',
    JSON.stringify(n.data.spoken) === JSON.stringify(C.events['notice.posted'].example.spoken));
const longTitle = R.noticeEvent({ id: 'n', title: 'Word '.repeat(80), level: 1, agentName: 'd' }, 'en');
ok('a notice is a headline: cut at the announcement ceiling', longTitle.data.spoken.text.length <= S.SPEAK_MAX + 20);
ok('an empty title says nothing', !('spoken' in R.noticeEvent({ id: 'n', title: '', level: 1, agentName: 'd' }).data));

// ---------- a question about to answer itself (U-214) ----------
const due = Object.assign({ cardId: '4f567a07', requestId: 'q1', agentName: 'developer', sessionId: 's1', state: 'armed', dueAt: 1790760120000, timeoutSeconds: 300 }, { remainingMs: 110_000 });
const soon = A.answerSoonEvent(due, 'en');
ok('‼️ ask.answersSoon carries the reminder\'s sentence — the contract example is the real output',
    JSON.stringify(soon.data.spoken) === JSON.stringify(C.events['ask.answersSoon'].example.spoken));
ok('in the interface\'s language: the sentence has no text of its own to sense',
    A.answerSoonEvent(due, 'tr').data.spoken.lang === 'tr' && /kendiliğinden cevaplanacak/.test(A.answerSoonEvent(due, 'tr').data.spoken.text));
ok('a nameless card still names someone', /^an agent's question/.test(A.answerSoonEvent(Object.assign({}, due, { agentName: '' }), 'en').data.spoken.text));
ok('ask.answersSoon passes the contract', passes('ask.answersSoon', soon.data));

// ---------- the contract ----------
ok('every event that carries spoken declares it optional', Object.keys(RS.SPOKEN_MAX).every(type => C.events[type] && C.events[type].fields.spoken === 'object?'));
ok('ask.answersSoon is in the contract', K.eventTypes().includes('ask.answersSoon'));
ok('the contract says what spoken is and that a phone falls back without it', C.rules.some(r => /^spoken \{ text, lang \}/.test(r) && /falls back/.test(r)));
ok('quota.warn says no reading of its own (its numbers are the headline)', !('quota.warn' in RS.SPOKEN_MAX));

// ---------- the host ----------
ok('the Console\'s events are told the interface\'s language',
    /consoleEvents\(remoteConsoleMemo, id, consoleHost\.get\(id\), consoleHost\.list\(\)\.map\(x => x\.id\), currentUiLanguage\(\)\.lang\)/.test(ext));
ok('Needs You\'s events get the language and the PC reader\'s ask',
    /needsEvents\(remoteNeedsMemo, buildNeeds\(\), currentUiLanguage\(\)\.lang, remoteAskOf\)/.test(ext)
    && /const remoteAskOf = \(sid: string\) => \{ const s = live\.sessions\(\)\.find\(x => x\.sessionId === sid\); return s \? askOfSession\(s\) : undefined; \};/.test(ext));
ok('notices and the answer-soon reminder too',
    /noticeEvent\(n, currentUiLanguage\(\)\.lang\)/.test(ext) && /answerSoonEvent\(d, currentUiLanguage\(\)\.lang\)/.test(ext));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
