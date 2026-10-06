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
        ok('U-207 — a page names its own text by key; no key, no name',
            readAskOf({ text: 'A notice.', key: ' notice:n1 ' }).key === 'notice:n1' && !('key' in readAskOf({ text: 'A notice.' }))
            && readAskOf({ text: 'x', key: 'k'.repeat(300) }).key.length === 200);
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
    const { readTarget, readingTimeoutMs } = require(path.join(ROOT, 'out', 'core', 'reader.js'));
    const { readTranscriptPage } = require(path.join(ROOT, 'out', 'core', 'sessionRead.js'));
    const { DIALOGUE_TIMEOUT_MS } = require(path.join(ROOT, 'out', 'core', 'turnAlerts.js'));
    // One Claude line can carry a sentence AND the tool call after it (a1).
    const steps = [
        { role: 'user', text: 'hi', turn: 1, uuid: 'u1' },
        { role: 'assistant', text: 'Let me look.', turn: 1, uuid: 'a1' },
        { role: 'tool', tool: 'Read', input: '{}', turn: 1, uuid: 'a1' },
        { role: 'toolResult', text: 'file body', turn: 1, uuid: 'r1' },
        { role: 'assistant', text: 'Done: the answer.', turn: 1, uuid: 'a2' },
        { role: 'assistant', text: 'a subagent aside', turn: 1, sidechain: true, uuid: 's1' },
        { role: 'user', text: 'next', turn: 2, uuid: 'u2' },
        { role: 'tool', tool: 'Bash', input: '{}', turn: 2, uuid: 't2' }
    ];
    {
        const last = readTarget(steps, { kind: 'last', sessionId: 'x' });
        ok('the last answer is the newest thing the agent itself said in words (a tool-only turn and a subagent are passed over)',
            last.text === 'Done: the answer.' && last.msg === 'a2' && last.turn === 1);
        ok('a turn reads its answer — the last words of that turn, not its narration',
            readTarget(steps, { kind: 'turn', sessionId: 'x', turn: 1 }).msg === 'a2');
        ok('a turn with no words, and a turn that does not exist, are refused by name',
            /turn 2 has no answer/.test(readTarget(steps, { kind: 'turn', sessionId: 'x', turn: 2 }).error)
            && /no turn 3 — the conversation has 2/.test(readTarget(steps, { kind: 'turn', sessionId: 'x', turn: 3 }).error));
        const a1 = readTarget(steps, { kind: 'msg', sessionId: 'x', msg: 'a1' });
        ok('a step key names the line: its words are read, the tool call on it carries none', a1.text === 'Let me look.' && a1.turn === 1);
        ok('a #n key is the place in the whole conversation', readTarget(steps, { kind: 'msg', sessionId: 'x', msg: '#4' }).text === 'file body');
        ok('an unknown key, and a step with no words, are refused by name',
            /no step "#99"/.test(readTarget(steps, { kind: 'msg', sessionId: 'x', msg: '#99' }).error)
            && /nothing to read/.test(readTarget(steps, { kind: 'msg', sessionId: 'x', msg: 't2' }).error));
        const cli = steps.map(({ uuid, ...s }) => s);
        ok('an engine that writes no line ids is keyed by place', readTarget(cli, { kind: 'last', sessionId: 'x' }).msg === '#5');
        const page = readTranscriptPage(steps, { roles: 'assistant' });
        ok('‼️ sessions.read lists each step\'s key, the same one a reading takes — kept across the filter',
            page.messages.map(m => m.key).join() === 'a1,a2'
            && readTranscriptPage(cli, { roles: 'all', from: 4, limit: 1 }).messages[0].key === '#4');
    }
    {
        ok('a short reading keeps the player\'s own limit', readingTimeoutMs(200) === DIALOGUE_TIMEOUT_MS);
        ok('‼️ a long one is given the time the slowest measured rate (5 characters a second) needs',
            readingTimeoutMs(20000) > 20000 / 5 * 1000 && readingTimeoutMs(20000) > DIALOGUE_TIMEOUT_MS);
    }
    {
        const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
        const { registerReaderOps } = require(path.join(ROOT, 'out', 'core', 'readerOps.js'));
        const { EN_PHRASES } = require(path.join(ROOT, 'out', 'core', 'speechPhrases.js'));
        const long = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of the long report.`).join(' ');
        const conv = { sessionId: 'abcd1234-full', label: 'developer', steps: [...steps, { role: 'assistant', text: long, turn: 2, uuid: 'L' }] };
        const spoke = [], wants = [], acts = [];
        let stops = 0;
        const reading = new ReadingNow();
        const deps = {
            conversation: ref => 'abcd1234-full'.startsWith(ref) ? conv : { error: `no session matches "${ref}"` },
            voiceOf: id => id === 'abcd1234-full' ? 'Tolga' : '',
            fleet: () => ({ on: false, voice: 'Zira', rate: 0, volume: 70, events: [], template: '' }),
            // U-205 — a reading has its own voice and speed; the announcement lends only its volume
            reading: () => ({ voice: 'David', rate: 2, length: 'first', code: 'size' }),
            speechFor: async (want) => { wants.push(want); return { voice: want, words: EN_PHRASES }; },
            dialogue: {
                speaking: false, state: { paragraph: 0, paragraphs: 2, paused: false, live: true },
                act: a => { acts.push(a); return a !== 'next'; }, setRate: r => { acts.push('rate ' + r); return true; },
                speak: (text, cfg, d) => { spoke.push({ text: [].concat(text).join(' '), paras: text, cfg, d }); return new Promise(() => undefined); }
            },
            readingNow: reading,
            stop: () => { stops++; reading.stop(); return true; }
        };
        const reg = new BridgeRegistry();
        registerReaderOps(reg, deps);
        const d = (op, args) => reg.dispatch(op, args);
        const a = await d('alerts.readNow', { sessionId: 'abcd', turn: 1 });
        ok('alerts.readNow reads a turn\'s answer in the conversation\'s own voice, named by its full id',
            a.ok && a.result.sessionId === 'abcd1234-full' && a.result.msg === 'a2' && a.result.turn === 1 && a.result.label === 'developer'
            && spoke[0].text === 'Done: the answer.' && spoke[0].cfg.voice === 'Tolga' && a.result.voice === 'Tolga');
        ok('…and the one channel records what it reads and that the bridge asked',
            reading.source.sessionId === 'abcd1234-full' && reading.source.msg === 'a2' && reading.source.turn === 1 && reading.source.surface === 'bridge');
        const b = await d('alerts.readNow', { sessionId: 'abcd' });
        ok('‼️ a session alone reads its last answer WHOLE, with the time a long reading needs',
            b.ok && b.result.msg === 'L' && spoke[1].text.length > DIALOGUE_MAX && /Line 120 of the long report\./.test(spoke[1].text)
            && !/There is more/.test(spoke[1].text) && spoke[1].d.timeoutMs > DIALOGUE_TIMEOUT_MS);
        const c = await d('alerts.readNow', { text: 'Your build is ready.' });
        ok('free text is read in the reading\'s voice and speed with no session, at the announcement\'s volume', c.ok && c.result.sessionId === ''
            && spoke[2].cfg.voice === 'David' && spoke[2].cfg.rate === 2 && spoke[2].cfg.volume === 70
            && reading.source.sessionId === '' && wants[2] === 'David');
        const refused = [await d('alerts.readNow', { sessionId: 'abcd', msg: 't2' }), await d('alerts.readNow', { sessionId: 'zzz' }),
            await d('alerts.readNow', { sessionId: 'abcd', msg: 'a1', turn: 1 })];
        ok('a step with no words, an unknown session and two picks are refused, nothing spoken',
            !refused[0].ok && /nothing to read/.test(refused[0].error) && /no session matches "zzz"/.test(refused[1].error)
            && /ONE of/.test(refused[2].error) && spoke.length === 3);
        const st = await d('alerts.reading', {});
        ok('alerts.reading says what is being read', st.ok && st.result.reading && st.result.source.surface === 'bridge' && st.result.speaking === false);
        const sp = await d('alerts.reading', { action: 'stop' });
        ok('action=stop runs the one stop and the channel is empty after it', sp.ok && sp.result.done && stops === 1 && sp.result.reading === false);
        const pz = await d('alerts.reading', { action: 'PAUSE', rate: 3 });
        ok('U-198 — an action and a rate go to the player, and the answer says where it is', pz.ok && pz.result.done && acts.join('|') === 'pause|rate 3'
            && pz.result.at.paragraphs === 2);
        ok('nowhere to go is done:false, not an error', (await d('alerts.reading', { action: 'next' })).result.done === false);
        ok('an action the player does not have, and a rate that is not a number, are refused by name',
            /"rewind" is not known — one of stop, pause, resume, toggle, next, prev/.test((await d('alerts.reading', { action: 'rewind' })).error)
            && /rate is a number from -10/.test((await d('alerts.reading', { rate: 'fast' })).error));
        const names = (reg.catalog() || []).map(o => o.op);
        ok('both ops are in farm.ops', names.includes('alerts.readNow') && names.includes('alerts.reading'));
    }
    {
        // U-199 — the whole of a turn, and from a step to the end, each step under its own key
        const { readingKeyNow } = require(path.join(ROOT, 'out', 'core', 'reader.js'));
        ok('whole goes with a turn; from is one more pick',
            readAskOf({ sessionId: 's', turn: 2, whole: true }).whole === true && readAskOf({ sessionId: 's', from: 'a1' }).kind === 'from'
            && /whole goes with turn/.test(readAskOf({ sessionId: 's', whole: true }).error)
            && /ONE of msg, turn, from, last or text/.test(readAskOf({ sessionId: 's', from: 'a1', last: true }).error));
        const all = readTarget(steps, { kind: 'turn', sessionId: 'x', turn: 1, whole: true });
        ok('the whole turn is what was asked and every word the agent said — no tool output, no subagent',
            all.segments.map(s => s.key).join() === 'u1,a1,a2' && all.msg === 'u1' && all.turn === 1 && /^hi\n\nLet me look\./.test(all.text));
        const rest = readTarget(steps, { kind: 'from', sessionId: 'x', from: 'a1' });
        ok('from a step: that step, then the agent\'s words to the end', rest.segments.map(s => s.key).join() === 'a1,a2' && rest.msg === 'a1');
        ok('from the prompt by place', readTarget(steps, { kind: 'from', sessionId: 'x', from: '#1' }).segments.map(s => s.key).join() === 'u1,a1,a2');
        ok('from nowhere, and with nothing after it, are refused by name',
            /no step "zz"/.test(readTarget(steps, { kind: 'from', sessionId: 'x', from: 'zz' }).error)
            && /nothing in words follows step "t2"/.test(readTarget(steps, { kind: 'from', sessionId: 'x', from: 't2' }).error));
        const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
        const { registerReaderOps } = require(path.join(ROOT, 'out', 'core', 'readerOps.js'));
        const { EN_PHRASES } = require(path.join(ROOT, 'out', 'core', 'speechPhrases.js'));
        let at = { paragraph: 0, paragraphs: 3, paused: false };
        const spoke = [];
        const reading = new ReadingNow();
        const reg = new BridgeRegistry();
        registerReaderOps(reg, {
            conversation: () => ({ sessionId: 'sid-full', label: 'dev', steps }),
            voiceOf: () => '', fleet: () => ({ on: false, voice: '', rate: 0, volume: 100, events: [], template: '' }),
            reading: () => ({ voice: '', rate: 0, length: 'first', code: 'size' }),
            speechFor: async w => ({ voice: w, words: EN_PHRASES }),
            dialogue: { speaking: true, get state() { return at; }, act: () => true, setRate: () => true,
                speak: (paras) => { spoke.push(paras); return new Promise(() => undefined); } },
            readingNow: reading, stop: () => true
        });
        const r = await reg.dispatch('alerts.readNow', { sessionId: 'sid', turn: 1, whole: true });
        ok('a reading of several steps says so and hands each paragraph its step',
            r.ok && r.result.steps === 3 && spoke[0].length === 3 && reading.source.keys.join() === 'u1,a1,a2');
        const k0 = (await reg.dispatch('alerts.reading', {})).result.key;
        at = { ...at, paragraph: 2 };
        const k2 = (await reg.dispatch('alerts.reading', {})).result.key;
        ok('‼️ the step being read moves with the paragraph the player is on', k0 === 'u1' && k2 === 'a2');
        await reg.dispatch('alerts.readNow', { sessionId: 'sid', msg: 'a2' });
        ok('a one-step reading carries no key list — its key is the step', !reading.source.keys && readingKeyNow(reading.source, at) === 'a2'
            && readingKeyNow(null, at) === '');
    }
    {
        const fs = require('fs'), os = require('os');
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function (request) {
            if (request === 'vscode') {
                return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
            }
            return origLoad.apply(this, arguments);
        };
        const viewer = require(path.join(ROOT, 'out', 'panels', 'sessionViewer.js'));
        Module._load = origLoad;
        const file = path.join(os.tmpdir(), `af-reader-${Date.now()}.jsonl`);
        const T = '2026-10-06T09:00:00.000Z';
        fs.writeFileSync(file, [
            { type: 'user', uuid: 'u-1', timestamp: T, message: { content: 'read me' } },
            { type: 'assistant', uuid: 'a-1', timestamp: T, message: { id: 'm1', model: 'claude-x', content: [{ type: 'text', text: 'the answer' }] } }
        ].map(l => JSON.stringify(l)).join('\n'));
        try {
            const data = viewer.buildData(file, { extensionUri: {}, getPricing: () => ({ costFor: () => 0 }), maxMessages: () => 50, contextLimitFor: () => 0 });
            const t = readTarget(data.messages, { kind: 'last', sessionId: 'x' });
            ok('the transcript page\'s parse carries each line\'s uuid, so a reading names the step the file names',
                data.messages.map(m => m.uuid).join() === 'u-1,a-1' && t.msg === 'a-1' && t.text === 'the answer');
        } finally { fs.rmSync(file, { force: true }); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
