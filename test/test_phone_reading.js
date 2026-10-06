// U-209 — A PHONE'S 🔊 IS READ BY THE PHONE: the host's half.
//
// The phone asks readFor; the host prepares the reading exactly as it would read it here (the same
// cleaning, the same inserted words) but in the text's own language, hands it back as readText and
// speaks NOTHING — the reading channel is not touched. And no phone view can make the PC speak:
// readAloud / readControl are the PC's on every page the phone opens, readFor is every page's look.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const out = (...p) => path.join(__dirname, '..', 'out', ...p);

const { spokenReading, readNow, registerReaderOps } = require(out('core', 'readerOps.js'));
const { BridgeRegistry } = require(out('core', 'bridge.js'));
const { ReadingNow } = require(out('core', 'soundCard.js'));
const { EN_PHRASES } = require(out('core', 'speechPhrases.js'));
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return {}; }
    return origLoad.apply(this, arguments);
};
const { handlePageReading, setPageReader } = require(out('panels', 'pageReading.js'));
const { handleAlertMessage } = require(out('panels', 'alertMessages.js'));
const { remotePages } = require(out('panels', 'remotePages.js'));
const { messageScope } = require(out('panels', 'remoteViews.js'));
Module._load = origLoad;

const steps = [
    { role: 'user', text: 'Read me the plan.', turn: 1, uuid: 'U1' },
    { role: 'assistant', text: 'First, the plan has **two** parts.\n\nSecond, `npm test` runs it.', turn: 1, uuid: 'A1' },
    { role: 'assistant', text: 'And a closing word.', turn: 1, uuid: 'A2' }
];
const conv = { sessionId: 'abcd1234-full', label: 'developer', steps };
const wants = [], spoke = [];
const reading = new ReadingNow();
const deps = {
    conversation: ref => 'abcd1234-full'.startsWith(ref) ? conv : { error: `no session matches "${ref}"` },
    voiceOf: id => id === 'abcd1234-full' ? 'Tolga' : '',
    fleet: () => ({ on: false, voice: 'Zira', rate: 0, volume: 70, events: [], template: '' }),
    reading: () => ({ voice: 'David', rate: 3, length: 'first', code: 'size' }),
    speechFor: async (want, text) => { wants.push(want); return { voice: want || 'Auto-voice', words: EN_PHRASES, lang: /plan|word/.test(text) ? 'en' : 'tr' }; },
    dialogue: {
        speaking: false, state: null,
        act: () => true, setRate: () => true,
        speak: (paras) => { spoke.push(paras); return new Promise(() => undefined); }
    },
    readingNow: reading,
    stop: () => true
};

(async () => {
    // ---- the core: prepared, never spoken ----
    const last = await spokenReading(deps, { sessionId: 'abcd' });
    ok('the last answer is prepared for the phone: its conversation, its label', last.sessionId === 'abcd1234-full' && last.label === 'developer');
    ok('…paragraph by paragraph, cleaned for speech', last.paragraphs.length === 1 && /closing word/.test(last.paragraphs[0]));
    ok('…each paragraph under the step it belongs to', last.keys.length === last.paragraphs.length && last.keys.every(k => k === 'A2') && last.msg === 'A2');
    ok('…with each paragraph\'s first words, for the page\'s mark', last.heads.length === 1 && /closing/.test(last.heads[0]));
    ok('…in the text\'s own language and the reading\'s speed', last.lang === 'en' && last.rate === 3);
    ok('‼️ a phone\'s reading asks Auto, never a voice chosen on this machine', wants[wants.length - 1] === '');
    ok('‼️ nothing was spoken and the channel was not touched', spoke.length === 0 && reading.source === null);

    const from = await spokenReading(deps, { sessionId: 'abcd', from: 'A1' });
    ok('a reading of several steps keys every paragraph to its own step',
        from.paragraphs.length === 3 && from.keys.join() === 'A1,A1,A2');
    ok('…and code is said the way this machine says it (no backticks reach the voice)', !from.paragraphs.some(p => p.includes('`')));

    const own = await spokenReading(deps, { text: 'Bir rapor.\n\nİkinci paragraf.', key: 'notice:n1' });
    ok('a page\'s own text keeps its key on every paragraph and has no conversation',
        own.sessionId === '' && own.paragraphs.length === 2 && own.keys.every(k => k === 'notice:n1') && own.lang === 'tr');

    let refused = '';
    await spokenReading(deps, { text: '   ' }).catch(e => { refused = String(e.message); });
    ok('nothing to read is refused by name', /sessionId is required|nothing/.test(refused));

    await readNow(deps, { sessionId: 'abcd' }, 'bridge');
    ok('this machine\'s own reading still asks the conversation\'s voice', wants[wants.length - 1] === 'Tolga' && spoke.length === 1);
    reading.stop();

    const reg = new BridgeRegistry();
    registerReaderOps(reg, deps);
    const viaOp = await reg.dispatch('alerts.readText', { sessionId: 'abcd' });
    ok('alerts.readText is the same body on the bridge', viaOp.ok && viaOp.result.keys.join() === 'A2' && Array.isArray(viaOp.result.paragraphs));
    ok('…and says what it is', reg.catalog().some(o => o.op === 'alerts.readText' && /NOT SAID/.test(o.describe)));

    // ---- the panels: readText back to the page, under the page's token ----
    setPageReader(deps);
    const posted = [];
    const webview = { postMessage: m => { posted.push(m); return Promise.resolve(true); } };
    const ask = { surface: 'notices', resolve: pick => pick.report === 'r1' ? '# Report\n\nThe whole report.' : pick.report === 'gone' ? { error: 'the file is not there any more' } : undefined };
    await handlePageReading({ type: 'readFor', token: 'p1', pick: { text: 'Notice text.', key: 'notice:n2' } }, webview, ask);
    ok('a page\'s readFor is answered readText with its token', posted[0] && posted[0].type === 'readText' && posted[0].token === 'p1' && posted[0].keys[0] === 'notice:n2');
    await handlePageReading({ type: 'readFor', token: 'p2', pick: { report: 'r1', key: 'report:n2' } }, webview, ask);
    ok('a report is read from the panel\'s own record, as on the PC', posted[1].type === 'readText' && /whole report/.test(posted[1].paragraphs.join(' ')) && posted[1].keys[0] === 'report:n2');
    await handlePageReading({ type: 'readFor', token: 'p3', pick: { report: 'gone' } }, webview, ask);
    ok('a refusal goes back under the same token', posted[2].type === 'readRefused' && posted[2].token === 'p3' && /not there/.test(posted[2].error));
    ok('‼️ still nothing spoken on the PC', spoke.length === 1 && reading.source === null);

    const sent = [];
    const surface = { post: m => sent.push(m), error: () => undefined, refresh: () => undefined };
    await handleAlertMessage({ type: 'readFor', token: 'c1', sessionId: 'abcd', surface: 'console', pick: { msg: 'A1' } }, { reader: deps }, surface);
    ok('the Console answers readFor with that step of its session, under the token',
        sent.length === 1 && sent[0].type === 'readText' && sent[0].token === 'c1' && sent[0].keys.every(k => k === 'A1'));
    ok('‼️ the Console spoke nothing either', spoke.length === 1 && reading.source === null);

    // ---- the phone's views ----
    const pages = remotePages({});
    const names = Object.keys(pages);
    ok('the phone\'s page catalog was read', names.length > 20);
    const speaksPc = names.filter(p => messageScope(pages[p], 'readAloud') !== null || messageScope(pages[p], 'readControl') !== null);
    ok('‼️ NO phone view can make the PC speak: ' + speaksPc.join(', '), speaksPc.length === 0);
    const noLook = names.filter(p => messageScope(pages[p], 'readFor') !== pages[p].open);
    ok('readFor is every phone view\'s look (the scope that opens it): ' + noLook.join(', '), noLook.length === 0);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
