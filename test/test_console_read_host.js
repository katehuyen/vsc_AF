// U-200 — the Console's side of reading a message aloud: every row with words
// knows its transcript line (the step key the reader takes), the sound handler
// every Console-like page shares answers 🔊 / ■ / ▶ and Read last answer with
// the bodies of alerts.readNow / alerts.reading, and a phone cannot make the
// PC speak.
//
// Measured before this was built (claude-cli, 2026-10-06, two haiku turns): a
// stream-json assistant event's uuid IS its transcript line's uuid, and the
// uuid the host stamps on a stream-json user line becomes that line's uuid.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const out = (...p) => path.join(ROOT, 'out', ...p);

const { reduceEvent, newSessionState, acceptUserText, shiftQueued } = require(out('core', 'consoleproto.js'));
const { transcriptMessages } = require(out('core', 'consolehistory.js'));
const { readingView } = require(out('core', 'readerOps.js'));
const { ReadingNow } = require(out('core', 'soundCard.js'));
const { EN_PHRASES } = require(out('core', 'speechPhrases.js'));
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return {}; }
    return origLoad.apply(this, arguments);
};
const { handleAlertMessage } = require(out('panels', 'alertMessages.js'));
const { remotePages } = require(out('panels', 'remotePages.js'));
const { messageScope } = require(out('panels', 'remoteViews.js'));
Module._load = origLoad;

const NOW = 1791280000000;
const fresh = () => newSessionState({ id: 'c1', agentId: 'a', agentName: 'dev', cwd: 'D:/a', model: 'haiku', now: NOW });
const said = (uuid, text, extra) => Object.assign({
    type: 'assistant', uuid, session_id: 's1',
    message: { id: 'm1', model: 'claude-haiku', content: [{ type: 'text', text }], usage: { input_tokens: 5, output_tokens: 3 } }
}, extra || {});

// ---------------------------------------------------------------- the rows know their line
{
    let s = fresh();
    s = acceptUserText(s, 'merhaba', NOW, false, [], 'u-stamp').state;
    ok('a prompt the host stamped carries the stamp — it IS its transcript line\'s uuid',
        s.messages[s.messages.length - 1].uuid === 'u-stamp');
    s = reduceEvent(s, said('a-line', 'Selam.'), NOW + 1).state;
    ok('an answer carries its event\'s uuid — the same as its transcript line\'s', s.messages[s.messages.length - 1].uuid === 'a-line');
    s = reduceEvent(s, said('sub-line', 'aside', { parent_tool_use_id: 'toolu_1' }), NOW + 2).state;
    const aside = s.messages.find(m => m.text === 'aside');
    ok('‼️ a sub-agent\'s words carry none — they are another transcript\'s', !!aside && aside.uuid === undefined);
    s = acceptUserText(s, 'one more', NOW + 3, false, [], 'u-steer').state;
    ok('a message said into the running turn is stamped too', s.messages[s.messages.length - 1].uuid === 'u-steer');
    const plain = acceptUserText(fresh(), 'no stamp', NOW).state;
    ok('an engine whose lines are not stamped gives its rows none', plain.messages[0].uuid === undefined);
    const held = { ...fresh(), status: 'idle', queued: ['later'] };
    const q = shiftQueued(held, NOW, 'u-queued');
    ok('a held message released later is stamped as it is said', q.text === 'later' && q.state.messages[q.state.messages.length - 1].uuid === 'u-queued');
}
{
    const lines = [
        { type: 'user', uuid: 'L1', timestamp: '2026-10-06T09:00:00Z', message: { content: 'ilk soru' } },
        { type: 'assistant', uuid: 'L2', timestamp: '2026-10-06T09:00:05Z', message: { content: [{ type: 'text', text: 'ilk cevap' }] } },
        { type: 'user', uuid: 'L3', timestamp: '2026-10-06T09:01:00Z', message: { content: [{ type: 'text', text: 'ikinci' }] } }
    ].map(l => JSON.stringify(l));
    const rows = transcriptMessages(lines, { now: NOW }).rows;
    ok('rows read back from the transcript carry their line\'s uuid',
        rows.map(r => r.uuid).join() === 'L1,L2,L3');
}

// ---------------------------------------------------------------- the sound handler answers it
(async () => {
    const asked = [], spoke = [], acts = [], posted = [];
    const at = { paragraph: 0, paragraphs: 1, paused: false, live: true };
    const reading = new ReadingNow();
    const reader = {
        conversation: ref => (ref === 's1'
            ? { sessionId: 's1', label: 'dev', steps: [{ role: 'user', text: 'merhaba', turn: 1, uuid: 'u1' }, { role: 'assistant', text: 'Son cevap bu.', turn: 1, uuid: 'a1' }] }
            : { error: `no session matches "${ref}"` }),
        voiceOf: () => '', fleet: () => ({ on: false, voice: '', rate: 0, volume: 100, events: [], template: '' }),
        reading: () => ({ voice: '', rate: 0, length: 'first', code: 'size' }),
        speechFor: async w => ({ voice: w, words: EN_PHRASES }),
        dialogue: {
            speaking: true, get state() { return at; }, act: a => { acts.push(a); return true; }, setRate: () => true,
            speak: paras => { spoke.push([].concat(paras).join(' ')); return new Promise(() => undefined); }
        },
        readingNow: reading, stop: () => { reading.stop(); return true; }
    };
    const surface = { error: e => posted.push({ type: 'error', e }), refresh: () => undefined, post: m => posted.push(m) };
    const send = m => handleAlertMessage(m, { reader }, surface);

    ok('a message\'s 🔊 is the sound handler\'s', await send({ type: 'readAloud', sessionId: 's1', pick: { msg: 'a1' }, surface: 'console' }));
    ok('…and reads that step of THAT card\'s conversation, whole', spoke[0] === 'Son cevap bu.' && reading.source.msg === 'a1'
        && reading.source.surface === 'console');
    ok('the reading view says which step is being read', JSON.stringify(readingView(reader)) === '{"sessionId":"s1","key":"a1","paused":false}');
    await send({ type: 'readAloud', sessionId: 's1', pick: {} });
    ok('Read last answer — no pick — reads the conversation\'s last answer', spoke[1] === 'Son cevap bu.' && reading.source.surface === 'page');
    await send({ type: 'readAloud', sessionId: 's1', pick: { text: 'Bir Codex satırı.' } });
    ok('a row with no line of its own is read by its words', spoke[2] === 'Bir Codex satırı.');
    await send({ type: 'readControl', action: 'pause' });
    ok('■ / ▶ are alerts.reading\'s body', acts.includes('pause'));
    posted.length = 0;
    await send({ type: 'readAloud', sessionId: 'gone', pick: { msg: 'a1' } });
    await send({ type: 'readControl', action: 'shout' });
    ok('a refusal goes back to the page as a toast, in the host\'s words',
        posted.filter(m => m.type === 'readRefused').length === 2 && /no session matches/.test(posted[0].error));
    ok('a page with no reader takes the message and does nothing', await handleAlertMessage({ type: 'readAloud', sessionId: 's1' }, {}, surface));
    ok('nothing being read is drawn as nothing', readingView(undefined) === null);

    for (const page of ['console', 'timeline', 'sound']) {
        const spec = remotePages({})[page];
        if (!spec) { continue; }
        ok(`‼️ a phone's ${page} view cannot make the PC speak`, messageScope(spec, 'readAloud') === null && messageScope(spec, 'readControl') === null);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
