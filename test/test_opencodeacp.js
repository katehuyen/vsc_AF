// K-25 — the ONE shared `opencode acp` process, driven end to end without one.
//
// ‼️ THIS IS THE TEST THE SHAPE EXISTS FOR. An idle `opencode acp` holds ~383 MB
// on this machine (measured, A-16), so Agent Farm runs exactly one for the whole
// window and multiplexes every card through it by `sessionId`. That decision is
// only safe if the lifecycle is right, and the interesting states of a lifecycle
// — an agent request nobody answers, a process that dies mid-turn, a card
// reloaded onto a new process — are ruinously expensive to reach against a real
// binary and free against a fake one. So the runtime is pure over an injected
// spawner, and this is the fake.
//
// The three failures asserted here all HANG rather than throw:
//
//   * an agent request (`session/request_permission`, `fs/*`) that is never
//     answered parks the turn for ever — the probe that measured this engine had
//     to answer them before a single turn would finish;
//   * `String(chunk)` instead of a StringDecoder splits a Turkish reply at a byte
//     boundary and delivers U+FFFD;
//   * a crash that leaves promises pending leaves every card at `working` for ever.
const path = require('path');
const A = require(path.join(__dirname, '..', 'out', 'core', 'opencodeacp.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const tick = () => new Promise(r => setImmediate(r));
// ‼️ REAL TIMERS, NOT `setImmediate` — the recovery path deliberately defers to a
// macrotask so the caller unwinding a rejected promise finishes before the reload
// begins, and a `setImmediate` loop never reaches it.
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await new Promise(r => setTimeout(r, 1)); } };

// --- captured: the `initialize` result, opencode 1.18.18 ----------------------
const INIT_RESULT = {
    protocolVersion: 1,
    agentCapabilities: {
        loadSession: true,
        mcpCapabilities: { http: true, sse: true },
        promptCapabilities: { embeddedContext: true, image: true },
        sessionCapabilities: { close: {}, fork: {}, list: {}, resume: {} }
    },
    authMethods: [{ description: 'Run `opencode auth login` in the terminal', name: 'Login with opencode', id: 'opencode-login' }],
    agentInfo: { name: 'OpenCode', version: '1.18.18' }
};

/**
 * A process that is not one. It records every frame written to it and lets a
 * test push frames back — in whatever byte chunks it likes, which is how the
 * decoder is exercised.
 */
function fakeChild() {
    const child = {
        written: [],
        killed: 0,
        pid: 4242,
        _out: [], _err: [], _exit: [],
        write(text) { child.written.push(text); return true; },
        kill() { child.killed++; for (const fn of child._exit) { fn(null); } },
        onStdout(fn) { child._out.push(fn); },
        onStderr(fn) { child._err.push(fn); },
        onExit(fn) { child._exit.push(fn); },
        // --- the test's side ---
        frames() { return child.written.map(l => JSON.parse(l)); },
        sent(method) { return child.frames().filter(f => f.method === method); },
        lastReplyTo(id) { return child.frames().filter(f => f.id === id && !f.method).pop(); },
        push(obj) { child.pushRaw(Buffer.from(JSON.stringify(obj) + '\n', 'utf8')); },
        pushRaw(buf) { for (const fn of child._out) { fn(buf); } },
        die(code) { for (const fn of child._exit) { fn(code); } }
    };
    return child;
}

/** A runtime whose process answers `initialize` the moment it is asked. */
function runtimeWith(opts = {}) {
    const children = [];
    const io = {
        spawn() {
            const c = fakeChild();
            children.push(c);
            // Answer the handshake on the next tick, the way a real one would.
            const orig = c.write;
            c.write = text => {
                const okWrote = orig(text);
                let frame;
                try { frame = JSON.parse(text); } catch { return okWrote; }
                if (frame.method === 'initialize') {
                    setImmediate(() => c.push({
                        jsonrpc: '2.0', id: frame.id,
                        result: opts.init || INIT_RESULT
                    }));
                }
                return okWrote;
            };
            return c;
        },
        readTextFile: opts.readTextFile,
        writeTextFile: opts.writeTextFile
    };
    return { rt: new A.OpencodeRuntime(io), children };
}

/** A card that records everything the runtime tells it. */
function fakeCard() {
    const card = {
        updates: [], asks: [], reloads: [], notes: [],
        update: u => card.updates.push(u),
        permission: r => card.asks.push(r),
        reloaded: (ok2, why) => card.reloads.push({ ok: ok2, why }),
        note: t => card.notes.push(t)
    };
    return card;
}

(async () => {

    // ---------- the handshake, and what it is allowed to conclude ----------
    {
        const { rt, children } = runtimeWith();
        const caps = await rt.ready('D:\\repo');
        const c = children[0];
        ok('one process is started, and only one', children.length === 1);
        ok('it is asked to initialize with the client fs capability we then honour',
            c.sent('initialize').length === 1
            && c.sent('initialize')[0].params.clientCapabilities.fs.readTextFile === true);
        ok('‼️ sessionCapabilities are OBJECTS and are read as present, not as false',
            caps.sessionList === true && caps.sessionResume === true && caps.sessionFork === true);
        ok('the agent version is recorded and never gated on', caps.agentVersion === '1.18.18');
        ok('a second caller shares the one handshake rather than starting a process',
            (await rt.ready('D:\\repo')) === caps && children.length === 1);
        ok('the runtime says what it is', rt.state === 'ready' && rt.pid === 4242);
        rt.dispose();
    }

    // ---------- a build that cannot be driven is refused BY NAME ----------
    {
        const { rt, children } = runtimeWith({
            init: { ...INIT_RESULT, protocolVersion: 2 }
        });
        let why = '';
        try { await rt.ready('D:\\repo'); } catch (e) { why = e.message; }
        ok('‼️ a protocol nobody has measured is refused, naming both numbers',
            /ACP protocol 2/.test(why) && /speaks 1/.test(why));
        ok('…and the 383 MB process is not left running in case somebody retries',
            children[0].killed === 1 && rt.state === 'refused');
        rt.dispose();
    }

    // ---------- ONE PROCESS, TWO CARDS, TWO FOLDERS — K-25's first acceptance ----------
    {
        const { rt, children } = runtimeWith();
        await rt.ready('D:\\one');
        const c = children[0];

        const openA = rt.newSession('D:\\agentA');
        await tick();
        const newA = c.sent('session/new').pop();
        c.push({ jsonrpc: '2.0', id: newA.id, result: { sessionId: 'ses_AAA', configOptions: [
            { id: 'model', name: 'Model', category: 'model', currentValue: 'opencode/big-pickle',
                options: [{ value: 'opencode/big-pickle', name: 'Big Pickle' }] }
        ] } });
        const madeA = await openA;

        const openB = rt.newSession('D:\\agentB');
        await tick();
        const newB = c.sent('session/new').pop();
        c.push({ jsonrpc: '2.0', id: newB.id, result: { sessionId: 'ses_BBB', configOptions: [] } });
        const madeB = await openB;

        ok('‼️ two sessions in two different folders came out of ONE process',
            children.length === 1 && madeA.sessionId === 'ses_AAA' && madeB.sessionId === 'ses_BBB');
        ok('…each declaring its OWN cwd, which is what makes that possible',
            newA.params.cwd === 'D:\\agentA' && newB.params.cwd === 'D:\\agentB');
        ok('…and the model catalogue arrived unasked, so nothing shells out for it',
            madeA.options[0].options[0].value === 'opencode/big-pickle');

        const cardA = fakeCard(), cardB = fakeCard();
        rt.attach('ses_AAA', 'D:\\agentA', cardA);
        rt.attach('ses_BBB', 'D:\\agentB', cardB);
        ok('the runtime knows how many cards it is carrying', rt.cardCount === 2);

        c.push({ jsonrpc: '2.0', method: 'session/update', params: {
            sessionId: 'ses_BBB', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } } } });
        ok('‼️ an update reaches the card it belongs to and NOT the other one',
            cardB.updates.length === 1 && cardA.updates.length === 0);

        c.push({ jsonrpc: '2.0', method: 'session/update', params: {
            sessionId: 'ses_NOBODY', update: { sessionUpdate: 'agent_message_chunk' } } });
        ok('…and an update for a card nobody holds is dropped rather than guessed at',
            cardA.updates.length === 0 && cardB.updates.length === 1);

        // ‼️ ENDING ONE CARD MUST NOT TOUCH THE OTHER'S PROCESS.
        rt.detach('ses_AAA');
        ok('‼️ detaching one card leaves the shared process running for the rest',
            children[0].killed === 0 && rt.cardCount === 1);
        ok('…and the agent is told that session is closed, since it offers a way',
            c.sent('session/close').length === 1);
        rt.detach('ses_BBB');
        ok('‼️ …and the LAST card takes the process with it — 383 MB serving nobody',
            children[0].killed === 1);
        rt.dispose();
    }

    // ---------- a turn, and the cancel that is not a kill ----------
    {
        const { rt, children } = runtimeWith();
        await rt.ready('D:\\repo');
        const c = children[0];
        const open = rt.newSession('D:\\repo');
        await tick();
        c.push({ jsonrpc: '2.0', id: c.sent('session/new').pop().id, result: { sessionId: 'ses_1', configOptions: [] } });
        await open;

        const turn = rt.prompt('ses_1', A.opencodePromptBlocks('merhaba'));
        await tick();
        const p = c.sent('session/prompt').pop();
        ok('the prompt travels as content blocks inside a frame, never on a command line',
            p.params.sessionId === 'ses_1' && p.params.prompt[0].type === 'text'
            && p.params.prompt[0].text === 'merhaba');

        ok('cancel is a NOTIFICATION — there is no reply to wait for', rt.cancel('ses_1') === true);
        const cancel = c.sent('session/cancel').pop();
        ok('…addressed to the one conversation, not to the process',
            cancel.params.sessionId === 'ses_1' && cancel.id === undefined);
        ok('…and nothing was killed to achieve it', c.killed === 0);

        c.push({ jsonrpc: '2.0', id: p.id, result: { stopReason: 'cancelled', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } });
        const result = await turn;
        ok('the cancelled turn settles as the engine\'s own measured ending',
            result.stopReason === 'cancelled');
        rt.dispose();
    }

    // ---------- the image block, and the empty-prompt guard ----------
    {
        const blocks = A.opencodePromptBlocks('bak şuna', [{ mediaType: 'image/png', data: 'AAA' }]);
        ok('an image rides as its own content block, ahead of the text',
            blocks[0].type === 'image' && blocks[0].mimeType === 'image/png' && blocks[0].data === 'AAA'
            && blocks[1].type === 'text');
        ok('an image with no bytes is dropped rather than sent empty',
            A.opencodePromptBlocks('x', [{ mediaType: 'image/png' }]).length === 1);
        ok('…and a prompt with nothing in it is still a text block, not an empty array',
            A.opencodePromptBlocks('').length === 1);
        ok('…while an images-only message does not get an empty text block',
            A.opencodePromptBlocks('', [{ mediaType: 'image/png', data: 'B' }]).length === 1);
    }

    // ---------- ‼️ THE REQUESTS THAT HANG A TURN IF THEY ARE NOT ANSWERED ----------
    {
        const read = {};
        const wrote = [];
        const { rt, children } = runtimeWith({
            readTextFile: p => { if (read[p] === undefined) { throw new Error('ENOENT'); } return read[p]; },
            writeTextFile: (p, content) => wrote.push([p, content])
        });
        read['D:\\a.txt'] = 'bir\niki\nüç\ndört\nbeş';
        await rt.ready('D:\\repo');
        const c = children[0];
        const card = fakeCard();
        rt.attach('ses_1', 'D:\\repo', card);

        // --- permission ---
        c.push({ jsonrpc: '2.0', id: 90, method: 'session/request_permission', params: {
            sessionId: 'ses_1',
            toolCall: { toolCallId: 'call-9', title: 'write', kind: 'edit', rawInput: { filePath: 'D:\\x.ts' } },
            options: [
                { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
                { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
                { optionId: 'no', name: 'Reject', kind: 'reject_once' }
            ]
        } });
        ok('‼️ a permission request reaches the card instead of being answered for it',
            card.asks.length === 1 && card.asks[0].options.length === 3);
        ok('…carrying what is being asked about, so the card can say',
            card.asks[0].toolCall.title === 'write');
        ok('…and nothing has gone back on the wire yet', !c.lastReplyTo(90));
        ok('the request is known to still be open', rt.hasAsk(card.asks[0].requestId) === true);
        rt.answerPermission(card.asks[0].requestId, 'always');
        const answered = c.lastReplyTo(90);
        ok('‼️ the answer travels as the OPTION ID the agent published, not as a behaviour',
            answered.result.outcome.outcome === 'selected' && answered.result.outcome.optionId === 'always');
        ok('…and answering twice is refused, so a repainted panel cannot answer a dead id',
            rt.answerPermission(card.asks[0].requestId, 'once') === false);

        // --- a request for a card that has gone ---
        c.push({ jsonrpc: '2.0', id: 91, method: 'session/request_permission', params: { sessionId: 'ses_GONE', options: [] } });
        ok('‼️ a request nobody can answer is CANCELLED, never silently allowed',
            c.lastReplyTo(91).result.outcome.outcome === 'cancelled');

        // --- fs, which we promised at initialize ---
        c.push({ jsonrpc: '2.0', id: 92, method: 'fs/read_text_file', params: { path: 'D:\\a.txt' } });
        ok('a file the agent asks for is handed over whole', c.lastReplyTo(92).result.content === read['D:\\a.txt']);
        c.push({ jsonrpc: '2.0', id: 93, method: 'fs/read_text_file', params: { path: 'D:\\a.txt', line: 2, limit: 2 } });
        ok('‼️ …and a request it deliberately made small is honoured, not widened',
            c.lastReplyTo(93).result.content === 'iki\nüç');
        c.push({ jsonrpc: '2.0', id: 94, method: 'fs/read_text_file', params: { path: 'D:\\missing.txt' } });
        ok('‼️ an unreadable file is an ERROR, never empty content — an agent told a file is empty rewrites it',
            !!c.lastReplyTo(94).error && /missing\.txt/.test(c.lastReplyTo(94).error.message));

        c.push({ jsonrpc: '2.0', id: 95, method: 'fs/write_text_file', params: { path: 'D:\\out.txt', content: 'yazıldı' } });
        ok('a write is done and acknowledged', wrote.length === 1 && wrote[0][1] === 'yazıldı'
            && c.lastReplyTo(95).result === null);

        // --- something we do not implement ---
        c.push({ jsonrpc: '2.0', id: 96, method: 'terminal/create', params: {} });
        ok('‼️ an unknown REQUEST is refused, not ignored (ignored hangs the turn) and not accepted',
            c.lastReplyTo(96).error.code === -32601);
        ok('…and the refusal is put in front of a reader rather than buried',
            card.notes.some(n => /terminal\/create/.test(n)));
        rt.dispose();
    }

    // ---------- ‼️ A CHUNK BOUNDARY IS NOT A CHARACTER BOUNDARY ----------
    {
        const { rt, children } = runtimeWith();
        await rt.ready('D:\\repo');
        const c = children[0];
        const card = fakeCard();
        rt.attach('ses_1', 'D:\\repo', card);
        const text = 'hazırım — şu ığdır işi çok güzel oldu';
        const frame = Buffer.from(JSON.stringify({
            jsonrpc: '2.0', method: 'session/update',
            params: { sessionId: 'ses_1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } }
        }) + '\n', 'utf8');
        let seen = 0, bad = 0;
        for (let cut = 1; cut < frame.length; cut++) {
            const one = fakeCard();
            rt.attach('ses_1', 'D:\\repo', one);
            c.pushRaw(frame.subarray(0, cut));
            c.pushRaw(frame.subarray(cut));
            seen++;
            const got = one.updates.map(u => u.content && u.content.text).join('');
            if (got !== text) { bad++; }
        }
        ok('‼️ the reply survives a split at EVERY byte of the frame — decoder plus line buffer',
            seen > 40 && bad === 0);
        rt.dispose();
    }

    // ---------- the crash, and coming back without a second writer ----------
    {
        const { rt, children } = runtimeWith();
        await rt.ready('D:\\repo');
        const first = children[0];
        const card = fakeCard();
        rt.attach('ses_1', 'D:\\repo', card);

        const turn = rt.prompt('ses_1', A.opencodePromptBlocks('uzun bir iş'));
        await tick();
        let rejected = '';
        turn.catch(e => { rejected = e.message; });
        first._err[0](Buffer.from('FATAL: out of memory\n', 'utf8'));
        first.die(1);
        await settle();
        ok('‼️ the turn that was in flight is REJECTED, not left pending for ever',
            /shared OpenCode process stopped/.test(rejected) && /exit 1/.test(rejected));
        ok('…carrying the engine\'s own last words rather than a tidy sentence',
            /out of memory/.test(rejected));

        ok('a new process was started', children.length === 2);
        const second = children[1];
        await settle();
        const load = second.sent('session/load').pop();
        ok('‼️ the live card is picked up with session/load — the conversation is in the engine\'s store',
            !!load && load.params.sessionId === 'ses_1' && load.params.cwd === 'D:\\repo');
        ok('‼️ …and only on the NEW process, so the conversation never has two writers',
            first.sent('session/load').length === 0);
        second.push({ jsonrpc: '2.0', id: load.id, result: { configOptions: [] } });
        await settle();
        ok('the card is told it is back, and why',
            card.reloads.length === 1 && card.reloads[0].ok === true
            && /out of memory/.test(card.reloads[0].why));
        rt.dispose();
    }

    // ---------- a crash with a load that ALSO fails says so ----------
    {
        const { rt, children } = runtimeWith();
        await rt.ready('D:\\repo');
        const card = fakeCard();
        rt.attach('ses_1', 'D:\\repo', card);
        children[0].die(9);
        await settle();
        const load = children[1].sent('session/load').pop();
        children[1].push({ jsonrpc: '2.0', id: load.id, error: { code: -32000, message: 'session not found' } });
        await settle();
        ok('‼️ a conversation that could not be re-opened is SAID, not left as a card that stopped answering',
            card.reloads.length === 1 && card.reloads[0].ok === false
            && /could not be re-opened/.test(card.reloads[0].why));
        rt.dispose();
    }

    // ---------- the forced restart: the last resort, and it carries the cards ----------
    {
        const { rt, children } = runtimeWith();
        await rt.ready('D:\\repo');
        const card = fakeCard();
        rt.attach('ses_1', 'D:\\repo', card);
        rt.restart();
        await settle();
        ok('‼️ a forced restart kills the process this extension owns and nothing else',
            children[0].killed === 1 && children.length === 2);
        const load = children[1].sent('session/load').pop();
        ok('…and the cards it was carrying come back on the new one', !!load);
        rt.dispose();
    }

    // ---------- a process that never starts is an answer, not a wait ----------
    {
        const io = {
            spawn() {
                const c = fakeChild();
                // A binary that is not installed emits `error` and nothing else.
                setImmediate(() => c.die(null));
                return c;
            }
        };
        const rt = new A.OpencodeRuntime(io);
        let why = '';
        try { await rt.ready('D:\\repo'); } catch (e) { why = e.message; }
        ok('‼️ a runtime that dies during its own handshake rejects instead of hanging',
            /shared OpenCode process stopped/.test(why));
        rt.dispose();
    }

    // ---------- the config trap, one call site deep ----------
    {
        const { rt, children } = runtimeWith();
        await rt.ready('D:\\repo');
        const c = children[0];
        const p = rt.setConfig('ses_1', 'model', 'opencode/nemotron-3.5-lightning-free');
        await tick();
        const sent = c.sent('session/set_config_option').pop();
        ok('‼️ the parameter is `configId` — `id` is refused with -32602 on a stderr nobody reads',
            sent.params.configId === 'model' && sent.params.id === undefined);
        c.push({ jsonrpc: '2.0', id: sent.id, error: { code: -32602, message: 'Invalid params', data: { configId: { _errors: ['expected string'] } } } });
        let why = '';
        try { await p; } catch (e) { why = e.message; }
        ok('…and a refusal carries the engine\'s own zod detail, which is what named `configId`',
            /Invalid params/.test(why) && /configId/.test(why));
        rt.dispose();
    }

    // ---------- the line slicer, on its own ----------
    {
        ok('no line and no limit is the whole file', A.sliceLines('a\nb\nc') === 'a\nb\nc');
        ok('a line with no limit runs to the end', A.sliceLines('a\nb\nc', 2) === 'b\nc');
        ok('a limit stops where it says', A.sliceLines('a\nb\nc\nd', 2, 2) === 'b\nc');
        ok('CRLF is not turned into an extra line', A.sliceLines('a\r\nb\r\nc', 2, 1) === 'b');
    }

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL harness: ' + e.stack); process.exit(1); });
