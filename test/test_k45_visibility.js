// K-45 part 3 — WHY NO CLOCK RUNS IS SAID WHERE THE READER LOOKS.
//
// A Console question no timer will answer is a Needs You row that names the
// word and the filter; one whose clock runs is not a row (it resolves itself).
// The Telegram card says when the clock answers, that it was stopped, or why
// there is none.
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const A = require(path.join(OUT, 'autoAnswer.js'));
const CN = require(path.join(OUT, 'consoleNeeds.js'));
const N = require(path.join(OUT, 'needs.js'));
const D = require(path.join(OUT, 'telegramDigest.js'));

const ask = (requestId, question, options) => ({
    requestId, interactive: true, ts: 1000, detail: question,
    questions: [{ question, options: options.map(label => ({ label })) }]
});
const card = (id, a) => ({ id, agentName: 'developer', pendingAsk: a });
const settings = A.autoAnswerSettings({ timeoutSeconds: 300 });
const viewOf = asks => id => A.autoAnswerView(asks[id], settings);

console.log('== the Needs You row ==');
{
    const asks = {
        c1: ask('r1', 'Delete the old branch?', ['Delete it (Recommended)', 'Keep it']),
        c2: ask('r2', 'Which approach?', ['Small (Recommended)', 'Big'])
    };
    const list = CN.consoleNeedAsks([card('c1', asks.c1), card('c2', asks.c2), card('c3')], viewOf(asks));
    ok('only the question no clock will answer becomes a row', list.length === 1 && list[0].consoleId === 'c1');
    ok('its reason names the word and the filter, without the "waiting for you" the row already says',
        /"Delete"|"delete"/i.test(list[0].why) && /question timer filter: recommended/.test(list[0].why) && !/^waiting for you/.test(list[0].why));
    const items = N.buildNeedsQueue({ liveSessions: [], approvals: [], insights: [], consoleAsks: list });
    const row = items[0];
    ok('‼️ the row line keeps the word AND the filter inside its 140 characters',
        row && row.kind === 'console-question' && row.detail.length <= 140 && /filter: recommended/.test(row.detail));
    ok('the opened row carries the reason and the question whole',
        /Delete the old branch\?/.test(row.body) && row.body.indexOf(list[0].why) === 0);
    ok('it answers from the Console', row.actions.some(a => a.id === 'open-console') && row.ref.consoleId === 'c1');
    ok('it counts as blocking', N.blockingCount(items) === 1);
    ok('its key is the card and the ask', N.needKey(row) === 'console-question|c1|r1');

    const perm = { c4: Object.assign(ask('r4', 'x', ['a']), { interactive: false }) };
    ok('a permission ask is not a question row here', CN.consoleNeedAsks([card('c4', perm.c4)], viewOf(perm)).length === 0);
    ok('the signature moves when a row would', CN.consoleNeedSig(list) !== CN.consoleNeedSig([]) && CN.consoleNeedSig(list) === CN.consoleNeedSig(list.slice()));
}

console.log('== the Telegram card ==');
{
    const state = {
        id: 'c1', agentName: 'developer', turns: 1, status: 'working', messages: [],
        pendingAsk: Object.assign(ask('r1', 'Which approach?', ['Small (Recommended)', 'Big']), { tool: 'AskUserQuestion' })
    };
    const armed = A.autoAnswerView(state.pendingAsk, settings);
    const t1 = D.digestText(state, { priced: false, clock: armed });
    const at = new Date(armed.dueAt).toTimeString().slice(0, 5);
    ok('an armed clock says when it answers and what', t1.indexOf('⏳ Auto-answer at ' + at) >= 0 && /"Small \(Recommended\)" is chosen for you/.test(t1));
    const t2 = D.digestText(state, { priced: false, clock: A.autoAnswerView(state.pendingAsk, settings, 5000) });
    ok('a stopped clock says so', /⏸ Timer stopped — this question waits for you/.test(t2));
    const bad = Object.assign({}, state, { pendingAsk: Object.assign(ask('r2', 'Delete it?', ['Delete (Recommended)']), { tool: 'AskUserQuestion' }) });
    const t3 = D.digestText(bad, { priced: false, clock: A.autoAnswerView(bad.pendingAsk, settings) });
    ok('‼️ no clock: the card names the word and the filter', /⏸ No timer: this question says "Delete"/.test(t3) && /filter: recommended/.test(t3));
    ok('no clock view, no line', !/Auto-answer|No timer|Timer stopped/.test(D.digestText(state, { priced: false })));
}

console.log('== the wire ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the Needs queue reads the Console questions', /consoleAsks: consoleNeedsOf\?\.\(\) \?\? \[\]/.test(ext));
    ok('…and is redrawn only when that list changes', /consoleNeedSig\(consoleNeedsOf!\(\)\)/.test(ext));
    ok('the row\'s button opens that card', /case 'open-console':\s*if \(item\.ref\.consoleId\) \{ ConsolePanel\.show\(consoleDeps, \{ sessionId: item\.ref\.consoleId \}\)/.test(ext));
    ok('the phone card is handed the clock', /clock: s\.pendingAsk \? consoleHost\.autoAnswerView\(s\.id\) : null/.test(ext));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'needs.js'), 'utf8');
    ok('the Needs page draws the kind', /'console-question': \{ icon: '❓', label: 'QUESTION'/.test(page));
}

console.log(`test_k45_visibility.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
