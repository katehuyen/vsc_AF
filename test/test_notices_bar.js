// U-221 — the status bar's Notices mark turns into the question category's own icon while a
// question waits that the user has not opened (src/core/noticesBar.ts).
//
//   node test/test_notices_bar.js
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { QUESTION_MARK, unseenQuestionCount, noticesBarText } = require(path.join(ROOT, 'out', 'core', 'noticesBar.js'));

{
    const list = [
        { type: 'question', read: false, status: 'open' },
        { type: 'question', read: true, status: 'open' },
        { type: 'question', read: false, status: 'answered' },
        { type: 'question', read: false },
        { type: 'update', read: false }
    ];
    ok('an unseen question is an open one never opened (a missing status counts as open)', unseenQuestionCount(list) === 2);
    ok('‼️ while one waits, the mark is the question icon with the count',
        noticesBarText({ count: 5, aging: 3, unseenQuestions: 1 }) === QUESTION_MARK + ' 5');
    ok('…and the aging warning and the bell are unchanged otherwise',
        noticesBarText({ count: 4, aging: 2, unseenQuestions: 0 }) === '$(warning) 4'
        && noticesBarText({ count: 3, aging: 0, unseenQuestions: 0 }) === '$(bell-dot) 3'
        && noticesBarText({ count: 0, aging: 0, unseenQuestions: 0 }) === '$(bell)');
    const page = read('media/notices.js');
    const m = /question:\s*\{\s*icon:\s*'([^']+)'/.exec(page);
    ok('‼️ the mark IS the Notices page\'s question icon, so the two cannot drift', !!m && m[1] === QUESTION_MARK);
    const ext = read('src/extension.ts');
    ok('the status bar asks the core for its text and counts the unseen questions off the whole board',
        /noticesBar\.text = noticesBarText\(\{ count: n, aging, unseenQuestions: unseen \}\);/.test(ext)
        && /unseen: unseenQuestionCount\(all\),/.test(ext)
        && !/noticesBar\.text = n > 0 \?/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
