// U-197 — reading on demand: the whole text, one ask spelt one way, and the one channel knowing WHAT it reads.
//
//   node test/test_reader.js
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const { readingText, readAskOf } = require(path.join(ROOT, 'out', 'core', 'reader.js'));
const { DIALOGUE_MAX } = require(path.join(ROOT, 'out', 'core', 'speech.js'));
const { ReadingNow } = require(path.join(ROOT, 'out', 'core', 'soundCard.js'));

(async () => {
    {
        const long = Array.from({ length: 80 }, (_, i) => `Sentence number ${i + 1} of a long answer.`).join(' ');
        const auto = readingText(long, false);
        const asked = readingText(long, true);
        ok('the automatic reading keeps its ceiling and says there is more',
            auto.length <= DIALOGUE_MAX + 40 && /There is more/.test(auto));
        ok('‼️ an ask reads the WHOLE answer — no ceiling, no "There is more"',
            asked.length > DIALOGUE_MAX && /Sentence number 80 of a long answer\./.test(asked) && !/There is more/.test(asked));
        ok('…and is still cleaned for speech (markdown and link targets out)',
            readingText('**bold** and [a link](http://x.y) here', true) === 'bold and a link here.');
    }
    {
        const a = readAskOf({ sessionId: ' abc ', msg: 'm-7' });
        ok('a message ask', a.kind === 'msg' && a.sessionId === 'abc' && a.msg === 'm-7');
        ok('a turn ask, whole numbers from 1 only',
            readAskOf({ sessionId: 'abc', turn: 3 }).kind === 'turn'
            && 'error' in readAskOf({ sessionId: 'abc', turn: 0 }) && 'error' in readAskOf({ sessionId: 'abc', turn: 1.5 }));
        ok('a session alone (or last:true) reads its last answer',
            readAskOf({ sessionId: 'abc' }).kind === 'last' && readAskOf({ sessionId: 'abc', last: true }).kind === 'last');
        ok('free text needs no session — an agent can have a report read to the user',
            readAskOf({ text: 'Your build is ready.' }).kind === 'text');
        ok('two picks at once, or nothing to read, is refused with the reason',
            /ONE of/.test(readAskOf({ sessionId: 'abc', msg: 'm', turn: 2 }).error)
            && /sessionId is required/.test(readAskOf({}).error));
    }
    {
        let changes = 0;
        const r = new ReadingNow(() => { changes++; });
        let end1;
        r.start('s1', new Promise(res => { end1 = res; }), { msg: 'm-1', surface: 'console' });
        ok('‼️ the channel knows WHICH message it reads and who asked',
            r.is('s1') && r.source.sessionId === 's1' && r.source.msg === 'm-1' && r.source.surface === 'console');
        let end2;
        r.start('s2', new Promise(res => { end2 = res; }));
        end1();
        await new Promise(res => setTimeout(res, 0));
        ok('the newest reading wins: the replaced one ending does not clear it',
            r.is('s2') && r.source.surface === 'auto' && r.source.msg === undefined);
        end2();
        await new Promise(res => setTimeout(res, 0));
        ok('…and its own end clears it', r.source === null && r.current === '');
        r.start('', new Promise(() => undefined), { surface: 'bridge' });
        ok('free text is a reading too, with no session', r.source && r.source.sessionId === '' && r.source.surface === 'bridge');
        const before = changes;
        r.stop();
        ok('stopping a free-text reading clears it and tells the panels', r.source === null && changes === before + 1);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
