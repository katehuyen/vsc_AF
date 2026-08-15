// K-25 — the Console, driving OpenCode over the ONE shared ACP process.
//
// ‼️ THIS FILE IS THE ITEM'S ACCEPTANCE LIST, WRITTEN AS ASSERTIONS. K-25 asks
// for: two cards in two different agent folders under one ACP pid · a two-turn
// conversation on the same `ses_…` · live thought, tool and usage · permission
// once/always/reject · an image · a new turn in the same session after a cancel ·
// a runtime restart followed by a reload · the End/Remove distinction · and no
// card ever killing a process it does not own. Each of those is below.
//
// Nothing is spawned. `ConsoleHost` takes the runtime's io as its last argument
// precisely so this is possible — the interesting states of a shared-process
// engine are a crash and a reload, and reaching them against a real binary costs
// real turns and real minutes.
const path = require('path');
const { ConsoleHost } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
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
    authMethods: [],
    agentInfo: { name: 'OpenCode', version: '1.18.18' }
};
const CONFIG = [
    {
        id: 'model', name: 'Model', category: 'model', currentValue: 'opencode/big-pickle',
        options: [
            { value: 'opencode/big-pickle', name: 'OpenCode Zen/Big Pickle' },
            { value: 'opencode/nemotron-3.5-lightning-free', name: 'OpenCode Zen/Nemotron 3.5 Lightning Free' }
        ]
    },
    { id: 'mode', name: 'Session Mode', category: 'mode', currentValue: 'build', options: [{ value: 'build', name: 'build' }, { value: 'plan', name: 'plan' }] }
];

/**
 * A fake `opencode acp`. It answers `initialize` and `session/new` by itself —
 * a test that had to hand-answer the handshake for every case would be a test
 * about the handshake — and leaves everything else to the case.
 */
function fakeRuntimeIo() {
    const io = {
        children: [],
        sessions: 0,
        // Its own copy: the engine's config really does change under a set, and
        // one shared between cases would leak a model choice into the next test.
        config: JSON.parse(JSON.stringify(CONFIG)),
        spawn(cwd) {
            const c = {
                cwd, written: [], killed: 0, pid: 9000 + io.children.length,
                _out: [], _exit: [],
                write(text) { c.written.push(text); c._auto(text); return true; },
                kill() { c.killed++; for (const f of c._exit) { f(null); } },
                onStdout(f) { c._out.push(f); },
                onStderr() { },
                onExit(f) { c._exit.push(f); },
                frames() { return c.written.map(l => JSON.parse(l)); },
                sent(m) { return c.frames().filter(f => f.method === m); },
                replyTo(id) { return c.frames().filter(f => f.id === id && !f.method).pop(); },
                push(o) { for (const f of c._out) { f(Buffer.from(JSON.stringify(o) + '\n', 'utf8')); } },
                update(sessionId, update) {
                    c.push({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } });
                },
                /** settle a request this test wants to control by hand */
                answer(method, result) {
                    const f = c.sent(method).pop();
                    c.push({ jsonrpc: '2.0', id: f.id, result });
                    return f;
                },
                _auto(text) {
                    let f;
                    try { f = JSON.parse(text); } catch { return; }
                    if (f.method === 'initialize') {
                        setImmediate(() => c.push({ jsonrpc: '2.0', id: f.id, result: INIT_RESULT }));
                    } else if (f.method === 'session/new') {
                        const sid = `ses_${++io.sessions}`;
                        setImmediate(() => c.push({ jsonrpc: '2.0', id: f.id, result: { sessionId: sid, configOptions: io.config } }));
                    } else if (f.method === 'session/set_config_option') {
                        // ‼️ THE REAL ONE ANSWERS WITH THE UPDATED `currentValue`
                        // (measured), and that matters: the host skips a change
                        // that is already what the engine says it is, so a fake
                        // returning a frozen catalogue would make a later change
                        // look like a no-op and hide a real bug.
                        io.config = io.config.map(o => (o.id === f.params.configId
                            ? { ...o, currentValue: f.params.value } : o));
                        setImmediate(() => c.push({ jsonrpc: '2.0', id: f.id, result: { configOptions: io.config } }));
                    }
                }
            };
            io.children.push(c);
            return c;
        },
        readTextFile: () => 'file',
        writeTextFile: () => { }
    };
    return io;
}

const init = (o) => Object.assign({
    agentId: 'dev', agentName: 'developer', cwd: 'D:\\repo',
    engine: 'opencode', permissionMode: 'default'
}, o);

const rows = (s, role) => s.messages.filter(m => m.role === role);

(async () => {

    // ---------- ‼️ TWO CARDS, TWO FOLDERS, ONE PROCESS ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const a = host.start(init({ agentId: 'a', agentName: 'alpha', cwd: 'D:\\agentA' }));
        const b = host.start(init({ agentId: 'b', agentName: 'beta', cwd: 'D:\\agentB' }));
        ok('a card exists before anything has been agreed with the engine',
            host.list().length === 2 && host.get(a).status === 'starting');
        await settle();
        ok('‼️ both cards came out of ONE process — the whole reason for the shape',
            io.children.length === 1);
        ok('…and the runtime says so, which is what the acceptance run reads',
            host.opencodeRuntimeState().cards === 2 && host.opencodeRuntimeState().phase === 'ready');
        const news = io.children[0].sent('session/new');
        ok('…each session declaring its OWN folder',
            news[0].params.cwd === 'D:\\agentA' && news[1].params.cwd === 'D:\\agentB');
        ok('each card learnt its own conversation id',
            host.get(a).sessionId === 'ses_1' && host.get(b).sessionId === 'ses_2'
            && host.get(a).status === 'idle');
        ok('…and the model catalogue arrived with it, so nothing spawns to ask',
            host.opencodeModels(a).length === 2
            && host.opencodeModels(a)[0].label === 'OpenCode Zen/Big Pickle');

        // ‼️ END ONE, THE OTHER GOES ON. Ending a card must not stop a process
        // another conversation is mid-turn on.
        host.close(a);
        await settle(3);
        ok('‼️ ending one card does not touch the process the other is using',
            io.children[0].killed === 0 && host.get(a).status === 'ended');
        ok('…and the card stays on the list, which is what End means (Remove is the other one)',
            host.list().length === 2);
        host.forget(a);
        ok('‼️ Remove is the one that takes the card away', host.list().length === 1);
        host.close(b);
        await settle(3);
        ok('‼️ …and the LAST card takes the shared process with it', io.children[0].killed === 1);
        host.dispose();
    }

    // ---------- a two-turn conversation, live, on one `ses_…` ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({ firstPrompt: 'NONCE yaz' }));
        await settle();
        const c = io.children[0];
        const p1 = c.sent('session/prompt').pop();
        ok('the first prompt went out as a frame on the open connection',
            !!p1 && p1.params.sessionId === 'ses_1' && /NONCE yaz/.test(p1.params.prompt[0].text));
        ok('the card is working while its own prompt is outstanding',
            host.get(id).status === 'working');

        // --- live: a thought, a tool, and the window ---
        c.update('ses_1', { sessionUpdate: 'agent_thought_chunk', messageId: 'm1', content: { type: 'text', text: 'düşünüyorum' } });
        c.update('ses_1', { sessionUpdate: 'tool_call', toolCallId: 'call-1', title: 'read', kind: 'read', status: 'pending', rawInput: {} });
        c.update('ses_1', { sessionUpdate: 'tool_call_update', toolCallId: 'call-1', status: 'in_progress', title: 'read', kind: 'read', rawInput: { filePath: 'D:\\repo\\package.json' } });
        ok('‼️ a tool the engine is running shows up WHILE the turn runs',
            rows(host.get(id), 'tool').some(m => m.tool && m.tool.name === 'Read'));
        c.update('ses_1', { sessionUpdate: 'tool_call_update', toolCallId: 'call-1', status: 'completed', title: 'package.json', content: [{ type: 'content', content: { type: 'text', text: '{"version":"3.144.0"}' } }] });
        ok('…and so does what it said back',
            rows(host.get(id), 'tool').some(m => /3\.144\.0/.test(m.text || '')));
        c.update('ses_1', { sessionUpdate: 'usage_update', used: 8116, size: 200000, cost: { amount: 0 } });
        ok('‼️ the window is the engine\'s OWN figure, capacity included',
            host.get(id).contextTokens === 8116 && host.get(id).contextWindowTokens === 200000
            && host.get(id).contextSource === 'engine-reported');
        c.update('ses_1', { sessionUpdate: 'agent_message_chunk', messageId: 'm2', content: { type: 'text', text: 'NONCE=af-1' } });

        // --- ‼️ a message typed mid-turn is HELD, never claimed as steering ---
        const held = host.send(id, 've bir de şunu');
        ok('‼️ a message sent into a running turn is HELD — this protocol cannot steer',
            held.queued === true && host.get(id).queued.length === 1);

        c.push({ jsonrpc: '2.0', id: p1.id, result: { stopReason: 'end_turn', usage: { inputTokens: 6196, outputTokens: 13, totalTokens: 8192, thoughtTokens: 63, cachedReadTokens: 1920 } } });
        await settle();
        ok('the reply landed as one row, not one per chunk',
            rows(host.get(id), 'agent').filter(m => m.text === 'NONCE=af-1').length === 1);
        ok('the turn was charged what the engine said it cost', host.get(id).tokens === 8192);
        ok('‼️ …and the held message became the NEXT turn on the same conversation',
            host.get(id).queued.length === 0
            && c.sent('session/prompt').length === 2
            && c.sent('session/prompt')[1].params.sessionId === 'ses_1');

        const p2 = c.sent('session/prompt').pop();
        c.push({ jsonrpc: '2.0', id: p2.id, result: { stopReason: 'end_turn', usage: { inputTokens: 36, outputTokens: 13, totalTokens: 8241, cachedReadTokens: 8192 } } });
        await settle();
        ok('‼️ turn 2 is charged its own 8241 — a cumulative reading would have made it free',
            host.get(id).tokens === 8192 + 8241 && host.get(id).turns === 2);
        ok('…and the card is idle with one conversation, not two',
            host.get(id).status === 'idle' && host.get(id).sessionId === 'ses_1');
        host.dispose();
    }

    // ---------- permission: once, always, reject ----------
    for (const [choice, wantOption] of [
        [{ kind: 'allow' }, 'once'],
        [{ kind: 'allow', always: true }, 'always'],
        [{ kind: 'deny', message: 'hayır' }, 'no']
    ]) {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({ firstPrompt: 'yaz' }));
        await settle();
        const c = io.children[0];
        c.push({
            jsonrpc: '2.0', id: 77, method: 'session/request_permission',
            params: {
                sessionId: 'ses_1',
                toolCall: { toolCallId: 'call-9', title: 'write', kind: 'edit', rawInput: { filePath: 'D:\\x.ts' } },
                options: [
                    { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
                    { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
                    { optionId: 'no', name: 'Reject', kind: 'reject_once' }
                ]
            }
        });
        ok(`the turn parks on the engine's own question (${wantOption})`,
            !!host.get(id).pendingAsk && host.get(id).pendingAsk.tool === 'write');
        host.answer(id, choice);
        const back = c.replyTo(77);
        ok(`‼️ the answer travels as the option id the AGENT published (${wantOption})`,
            back.result.outcome.outcome === 'selected' && back.result.outcome.optionId === wantOption);
        ok(`…and the card stops waiting (${wantOption})`, !host.get(id).pendingAsk);
        host.dispose();
    }

    // ---------- ‼️ K-22 ON THIS TRANSPORT: bypass answers itself ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({ permissionMode: 'bypassPermissions', firstPrompt: 'yaz' }));
        await settle();
        const c = io.children[0];
        ok('the card says what bypass means HERE — Agent Farm answering, not a flag',
            /Agent Farm answers yes for you/.test(host.get(id).permissionWhy || ''));
        c.push({
            jsonrpc: '2.0', id: 55, method: 'session/request_permission',
            params: {
                sessionId: 'ses_1',
                toolCall: { toolCallId: 'c', title: 'edit', kind: 'edit', rawInput: { filePath: 'D:\\x.ts' } },
                options: [{ optionId: 'once', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'No', kind: 'reject_once' }]
            }
        });
        ok('‼️ a bypassed session opens no window at all', !host.get(id).pendingAsk);
        ok('…and answers the engine, or the turn waits for ever',
            c.replyTo(55).result.outcome.optionId === 'once');

        // …and the one shape it refuses anyway, out loud (bypassVerdict).
        c.push({
            jsonrpc: '2.0', id: 56, method: 'session/request_permission',
            params: {
                sessionId: 'ses_1',
                toolCall: { toolCallId: 'd', title: 'bash', kind: 'execute', rawInput: { command: 'rm -rf /' } },
                options: [{ optionId: 'once', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'No', kind: 'reject_once' }]
            }
        });
        ok('‼️ "never ask me" is still not consent to the catastrophic shape',
            c.replyTo(56).result.outcome.optionId === 'no'
            && rows(host.get(id), 'error').some(m => /refused automatically/.test(m.text || '')));
        host.dispose();
    }

    // ---------- cancel, and a new turn in the SAME conversation afterwards ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({ firstPrompt: 'uzun iş' }));
        await settle();
        const c = io.children[0];
        const p1 = c.sent('session/prompt').pop();
        ok('interrupt asks the ENGINE to stop', host.interrupt(id) === true
            && c.sent('session/cancel').pop().params.sessionId === 'ses_1');
        ok('‼️ …and kills nothing — the process is shared', c.killed === 0);
        c.push({ jsonrpc: '2.0', id: p1.id, result: { stopReason: 'cancelled', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } });
        await settle();
        ok('the cancelled turn closes the turn and leaves the session alive',
            host.get(id).status === 'idle' && host.get(id).sessionId === 'ses_1');
        host.send(id, 'peki şunu yap');
        await settle(2);
        ok('‼️ …and the next turn goes to the SAME conversation',
            c.sent('session/prompt').length === 2
            && c.sent('session/prompt')[1].params.sessionId === 'ses_1');
        host.dispose();
    }

    // ---------- an image travels as a content block ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({}));
        await settle();
        const c = io.children[0];
        // The host reads the bytes at SEND time, so the file has to exist. This
        // repo's own icon is the cheapest real PNG on the machine.
        const png = path.join(__dirname, '..', 'media', 'icon.png');
        const r = host.send(id, 'bak şuna', false, [{ path: png, name: 'icon.png', bytes: 0, kind: 'image', mediaType: 'image/png' }]);
        await settle(2);
        const p = c.sent('session/prompt').pop();
        ok('an image is sent as an ACP image block, not described in words',
            !r.refused && p.params.prompt[0].type === 'image'
            && p.params.prompt[0].mimeType === 'image/png'
            && typeof p.params.prompt[0].data === 'string' && p.params.prompt[0].data.length > 100);
        ok('…with the text beside it', p.params.prompt[1].text === 'bak şuna');
        host.dispose();
    }

    // ---------- the pickers: live, but only at a turn boundary ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({}));
        await settle();
        const c = io.children[0];
        host.setModel(id, 'opencode/nemotron-3.5-lightning-free');
        await settle(2);
        const cfg = c.sent('session/set_config_option').pop();
        ok('‼️ the model change reaches the LIVE connection, under `configId`',
            cfg.params.configId === 'model' && cfg.params.id === undefined
            && cfg.params.value === 'opencode/nemotron-3.5-lightning-free');
        ok('…and the card only claims the model once the engine has taken it',
            host.get(id).model === 'opencode/nemotron-3.5-lightning-free' && !host.get(id).pendingModel);

        host.send(id, 'çalış');
        await settle(2);
        const before = c.sent('session/set_config_option').length;
        host.setModel(id, 'opencode/big-pickle');
        await settle(2);
        ok('‼️ a change asked for MID-TURN is held, not applied under a running turn',
            c.sent('session/set_config_option').length === before
            && rows(host.get(id), 'system').some(m => /when this turn ends/.test(m.text || '')));
        const p = c.sent('session/prompt').pop();
        c.push({ jsonrpc: '2.0', id: p.id, result: { stopReason: 'end_turn', usage: {} } });
        await settle();
        ok('…and applied the moment the turn is over',
            c.sent('session/set_config_option').length === before + 1
            && host.get(id).model === 'opencode/big-pickle');
        host.dispose();
    }

    // ---------- a refusal is the engine's own words, not a picker that lies ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({}));
        await settle();
        const c = io.children[0];
        // Take the auto-answer off this one call so the refusal can be staged.
        const original = c._auto;
        c._auto = () => { };
        host.setModel(id, 'nope');
        await settle(2);
        const cfg = c.sent('session/set_config_option').pop();
        c.push({ jsonrpc: '2.0', id: cfg.id, error: { code: -32602, message: 'Invalid params', data: { configId: { _errors: ['expected string'] } } } });
        await settle();
        c._auto = original;
        ok('‼️ a refused model change becomes a line in the conversation, not a silent stderr',
            rows(host.get(id), 'error').some(m => /refused the model change/.test(m.text || '') && /configId/.test(m.text || '')));
        ok('…and the card does NOT claim the model it did not get', host.get(id).model !== 'nope');
        host.dispose();
    }

    // ---------- the crash: the conversation survives, the turn does not ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({ firstPrompt: 'iş' }));
        await settle();
        io.children[0].kill();
        await settle();
        const second = io.children[1];
        ok('a new shared process was started', io.children.length === 2);
        const load = second.sent('session/load').pop();
        ok('‼️ the live card is re-opened with session/load, and only on the NEW process',
            !!load && load.params.sessionId === 'ses_1'
            && io.children[0].sent('session/load').length === 0);
        second.push({ jsonrpc: '2.0', id: load.id, result: { configOptions: CONFIG } });
        await settle();
        ok('‼️ the card is usable again and says what happened',
            host.get(id).status === 'idle'
            && rows(host.get(id), 'system').some(m => /re-opened/.test(m.text || '')));
        ok('…and it is honest that the turn in flight did not finish',
            rows(host.get(id), 'system').some(m => /did not finish/.test(m.text || '')));

        // …and the replayed history does NOT double the card.
        const before = host.get(id).messages.length;
        second.update('ses_1', { sessionUpdate: 'user_message_chunk', messageId: 'h1', content: { type: 'text', text: 'iş' } });
        second.update('ses_1', { sessionUpdate: 'agent_message_chunk', messageId: 'h2', content: { type: 'text', text: 'eski cevap' } });
        ok('a late replayed frame does not add the conversation a second time',
            host.get(id).messages.length === before);
        host.dispose();
    }

    // ---------- a build with no runtime says so instead of hanging ----------
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({}));
        await settle(3);
        ok('‼️ a card that cannot be hosted is an ERROR with a sentence, not a card stuck at "starting"',
            host.get(id).status === 'error'
            && /not given a way to start `opencode acp`/.test(host.get(id).exitReason || ''));
        host.dispose();
    }

    // ---------- a resume loads instead of opening a second conversation ----------
    {
        const io = fakeRuntimeIo();
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io);
        const id = host.start(init({ resume: 'ses_OLD' }));
        await settle(4);
        const c = io.children[0];
        ok('‼️ a resume LOADS the conversation — a session/new here would fork it',
            c.sent('session/load').length === 1 && c.sent('session/new').length === 0);
        c.answer('session/load', { configOptions: CONFIG });
        await settle();
        ok('…and the card keeps the id it was resuming',
            host.get(id).sessionId === 'ses_OLD' && host.get(id).status === 'idle');
        host.dispose();
    }

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL harness: ' + e.stack); process.exit(1); });
