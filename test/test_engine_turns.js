// S-40 — THE TURNS PAGE IS THE WHOLE FARM, OR IT IS A LIE ABOUT THE FARM.
//
// `buildTurnRows` maps over `SessionInfo.turns`. Three of the five engines left
// that array empty, and the failure that produces is not a thin row — it is NO
// ROW, and no entry in the page's engine picker either, because the picker's
// options are derived from the rows present. The page said "every user turn
// across the farm" and listed two engines' turns.
//
// ‼️ AND THE NUMBER HAS TO BE THE SAME NUMBER. A row folds open by asking the
// VIEWER for `turn === n`. The index and the viewer therefore have to count the
// same file the same way, or a fold shows somebody else's prompt — silently,
// and only for the sessions whose first record happens to differ. So every case
// below parses the same fixture BOTH ways and holds the two together.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: {}, window: {}, commands: { executeCommand: () => Promise.resolve() },
            EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
            ViewColumn: {}, ConfigurationTarget: {}, env: {}
        };
    }
    return origLoad.apply(this, arguments);
};

const T = require(path.join(__dirname, '..', 'out', 'core', 'cliTranscripts.js'));
const V = require(path.join(__dirname, '..', 'out', 'core', 'cliViewer.js'));
const { buildTurnRows } = require(path.join(__dirname, '..', 'out', 'core', 'turns.js'));
const { PricingEngine } = require(path.join(__dirname, '..', 'out', 'core', 'pricing.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const pricing = () => new PricingEngine([
    { match: 'gemini-2\\.5-pro', input: 1.25, output: 10, cacheWrite: 0, cacheRead: 0.31 }
]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-turns-'));
const iso = ts => new Date(ts).toISOString().replace(/\.\d+Z$/, 'Z');
const t0 = Date.parse('2026-08-18T09:00:00.000Z');

/**
 * The shared assertion: one session, parsed as a ROW and as a VIEWER document,
 * has to agree about how many turns it has and what each one was asked.
 */
function agree(engine, info) {
    const raw = fs.readFileSync(info.file, 'utf8');
    const view = V.parseCliViewer(raw, info.file, pricing());
    ok(`${engine}: the viewer reads the same file`, !!view);
    if (!view) { return; }
    const seen = new Set(view.messages.map(m => m.turn).filter(n => typeof n === 'number' && n > 0));
    ok(`‼️ ${engine}: the index numbers the turns exactly as the viewer does`,
        info.turns.length === seen.size
        && info.turns.every(t => seen.has(t.n)));
    // …and the row's label is the prompt the viewer shows at the top of that
    // turn, so a reader recognises the row they clicked.
    const firstAsk = n => {
        const m = view.messages.find(x => x.turn === n && x.role === 'user');
        return (m && m.text ? m.text : '').replace(/\s+/g, ' ').trim().slice(0, 40);
    };
    ok(`${engine}: every row is labelled with its own prompt`,
        info.turns.every(t => t.label.replace(/\s+/g, ' ').slice(0, 40) === firstAsk(t.n)));
}

// ------------------------------------------------------------------ gemini
{
    const chats = path.join(root, 'gemini', 'chats');
    fs.mkdirSync(chats, { recursive: true });
    const file = path.join(chats, 'session.json');
    fs.writeFileSync(file, JSON.stringify({
        sessionId: 'g-turns',
        startTime: iso(t0),
        lastUpdated: iso(t0 + 1800_000),
        messages: [
            { type: 'user', content: 'sahne 3 için storyboard yaz', timestamp: iso(t0) },
            {
                type: 'gemini', model: 'gemini-2.5-pro', timestamp: iso(t0 + 60_000),
                tokens: { input: 4000, output: 800, cached: 1000, thoughts: 200, tool: 50, total: 6050 }
            },
            // ‼️ No clock of its own — the shape the real files take, and the one
            // that used to leave a turn stamped at epoch 0 (bottom of the page,
            // "56 years ago") or at the document's own end.
            { type: 'user', content: 'daha kısa olsun' },
            {
                type: 'gemini', model: 'gemini-2.5-pro',
                tokens: { input: 5000, output: 400, cached: 4000, thoughts: 100, tool: 0 }
            },
            // An empty prompt is not a turn — the viewer skips it, so this must too.
            { type: 'user', content: '   ' }
        ]
    }), 'utf8');
    const rows = T.geminiSessionsSource(() => path.join(root, 'gemini'), () => [], pricing, 0).scan();
    ok('gemini: the session is a row', rows.length === 1);
    const info = rows[0];
    ok('gemini: two prompts, two turns', info.turns.length === 2);
    ok('gemini: the first turn is stamped with its own line',
        info.turns[0].ts === t0 && info.turns[0].label === 'sahne 3 için storyboard yaz');
    ok('‼️ gemini: a prompt with no clock takes the last time the FILE stated, never the document\'s end',
        info.turns[1].ts === t0 + 60_000);
    ok('gemini: the turn carries its own spend, off the same reply as the session total',
        info.turns[0].tokens === 4000 - 1000 + 50 + 800 + 200 + 1000
        && info.turns[0].apiCalls === 1 && info.turns[0].steps === 1
        && info.turns[0].cost > 0 && info.turns[0].models.join() === 'gemini-2.5-pro');
    ok('gemini: the two turns\' spend adds up to the session\'s',
        info.turns.reduce((a, t) => a + t.tokens, 0)
        === info.usage.input + info.usage.output + info.usage.cacheRead + info.usage.cacheWrite);
    ok('‼️ gemini: no window figure is published, so Ctx stays an honest zero',
        info.turns.every(t => t.endCtx === 0));
    agree('gemini', info);
}

// ------------------------------------------------------------- antigravity
{
    const home = path.join(root, 'agy');
    const dir = path.join(home, 'brain', 'conv-turns', '.system_generated', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(file, [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: iso(t0), content: '<USER_REQUEST>\nRun the daily backup commit.\n</USER_REQUEST>' },
        { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 2000), content: 'Looking.' },
        {
            step_index: 2, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 2500),
            tool_calls: [{ name: 'run_command', args: { CommandLine: JSON.stringify('git status') } }]
        },
        { step_index: 3, source: 'MODEL', type: 'RUN_COMMAND', status: 'DONE', exit_code: 0, created_at: iso(t0 + 3000), content: 'M one.txt' },
        { step_index: 4, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: iso(t0 + 9000), content: 'now push it' },
        { step_index: 5, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'ERROR', created_at: iso(t0 + 11000), content: 'nope' }
    ].map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
    const rows = T.agySessionsSource(() => home, () => ({}), undefined, 0).scan();
    ok('agy: the conversation is a row', rows.length === 1);
    const info = rows[0];
    ok('agy: two asks, two turns', info.turns.length === 2);
    ok('agy: the turn holds its own work', info.turns[0].tools === 1 && info.turns[0].steps === 2
        && info.turns[0].ms === 3000);
    ok('agy: a failed step bills to the turn it failed in',
        info.turns[1].errors === 1 && info.turns[0].errors === 0);
    ok('‼️ agy: this engine publishes no tokens and no price — the money columns stay zero, never borrowed',
        info.turns.every(t => t.tokens === 0 && t.cost === 0 && t.wTokens === 0));
    agree('agy', info);
}

// --------------------------------------------- Agent Farm-hosted Antigravity
{
    const dir = path.join(root, 'console');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'c-turns.json');
    fs.writeFileSync(file, JSON.stringify({
        format: 'agent-farm-console-v1', engine: 'agy', sessionId: 'c-turns',
        agentId: 'dev', agentName: 'developer', cwd: 'D:\\zone', model: 'gemini-3.1-pro',
        effort: 'high', permissionMode: 'acceptEdits',
        startedAt: t0, lastTs: t0 + 60_000, cost: 0.42, tokens: 30_000, wTokens: 12_000,
        turns: 2, contextTokens: 18_000,
        messages: [
            { id: 'm1', role: 'user', ts: t0, text: 'read the backlog' },
            { id: 'm2', role: 'agent', ts: t0 + 1000, text: 'thinking about it', kind: 'think' },
            { id: 'm3', role: 'tool', ts: t0 + 2000, tool: { name: 'Read', detail: 'Backlog.md' }, kind: 'read' },
            { id: 'm4', role: 'agent', ts: t0 + 3000, text: 'here it is', kind: 'say' },
            { id: 'm5', role: 'result', ts: t0 + 4000, cost: 0.3, tokens: 20_000, ms: 4000 },
            // ‼️ Said INTO the running turn — it does not open one, exactly as
            // the viewer treats it, or a steered turn becomes two rows.
            { id: 'm6', role: 'user', ts: t0 + 5000, text: 'also the plan', steer: true },
            { id: 'm7', role: 'user', ts: t0 + 30_000, text: 'now close U-1' },
            { id: 'm8', role: 'error', ts: t0 + 31_000, text: 'refused' },
            { id: 'm9', role: 'result', ts: t0 + 40_000, cost: 0.12, tokens: 10_000, ms: 10_000 }
        ]
    }), 'utf8');
    const rows = T.farmConsoleSessionsSource(() => dir, () => ({}), 0).scan();
    ok('console: the hosted conversation is a row', rows.length === 1);
    const info = rows[0];
    ok('‼️ console: a steered line stays inside its turn — two prompts, two rows',
        info.turns.length === 2 && info.turns[0].label === 'read the backlog');
    ok('console: the turn reads the engine\'s own result row rather than dividing the total',
        info.turns[0].tokens === 20_000 && Math.abs(info.turns[0].cost - 0.3) < 1e-9
        && info.turns[0].ms === 4000 && info.turns[0].apiCalls === 1);
    ok('console: reasoning is counted apart from the steps it is part of',
        info.turns[0].steps === 3 && info.turns[0].thinking === 1 && info.turns[0].tools === 1);
    ok('console: an error bills to the open turn', info.turns[1].errors === 1);
    ok('console: the turn wears the model the session ran on',
        info.turns[0].models.join() === 'gemini-3.1-pro');
    agree('console', info);
}

// ------------------------------------------------------------------ codex
{
    const home = path.join(root, 'codex');
    const dir = path.join(home, 'sessions', '2026', '08', '18');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'rollout-0.149.jsonl');
    const first = '<project-context>machine brief</project-context>\n\nrestore Codex turns';
    fs.writeFileSync(file, [
        { timestamp: iso(t0), type: 'session_meta', payload: { session_id: 'codex-turns', cwd: 'D:\\zone', cli_version: '0.149.0' } },
        { timestamp: iso(t0), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<recommended_plugins>not dialogue</recommended_plugins>' }] } },
        { timestamp: iso(t0 + 1000), type: 'turn_context', payload: { model: 'gpt-5.6-sol' } },
        { timestamp: iso(t0 + 2000), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: first }] } },
        { timestamp: iso(t0 + 2000), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: first }] } } },
        { timestamp: iso(t0 + 3000), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: 'first answer' }] } } },
        { timestamp: iso(t0 + 3000), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'first answer' }] } },
        { timestamp: iso(t0 + 4000), type: 'event_msg', payload: { type: 'token_count', info: { model: 'gpt-5.6-sol', last_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20, total_tokens: 120 }, total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20, total_tokens: 120 } } } },
        { timestamp: iso(t0 + 6000), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'continue safely' }] } },
        { timestamp: iso(t0 + 6000), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'continue safely' }] } } },
        { timestamp: iso(t0 + 7000), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: 'second answer' }] } } },
        { timestamp: iso(t0 + 7000), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'second answer' }] } }
    ].map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
    const rows = T.codexSessionsSource(() => home, () => ({}), pricing, 0).scan();
    ok('codex 0.149: the session is a row', rows.length === 1);
    const info = rows[0];
    ok('codex 0.149: two human prompts, two turns, no host-machinery turn',
        info.turns.length === 2 && info.turns[0].label === 'restore Codex turns'
        && info.turns[1].label === 'continue safely');
    agree('codex', info);
}

// ---------------------------------------------------------------- opencode
{
    const dir = path.join(root, 'opencode');
    fs.mkdirSync(dir, { recursive: true });
    const SES = 'ses_ffae93e06ffe3OOx0X42HLDzT2';
    const spend = (total, input, output, reasoning, read) =>
        ({ total, input, output, reasoning, cache: { write: 0, read } });
    const file = path.join(dir, SES + '.json');
    fs.writeFileSync(file, JSON.stringify({
        info: {
            id: SES, projectID: '52088de5', directory: 'D:\\zone', title: 'NONCE',
            agent: 'build', model: { id: 'big-pickle', providerID: 'opencode' }, version: '1.18.18',
            cost: 0, tokens: { input: 6232, output: 26, reasoning: 63, cache: { read: 10112, write: 0 } },
            time: { created: t0, updated: t0 + 9000 }
        },
        messages: [
            {
                info: { role: 'user', time: { created: t0 }, agent: 'build', id: 'msg_1' },
                parts: [{ type: 'text', text: 'Sadece şunu yaz: NONCE=af-msu9oo6n', id: 'p1' }]
            },
            {
                info: {
                    role: 'assistant', agent: 'build', cost: 0.05, tokens: spend(8192, 6196, 13, 63, 1920),
                    modelID: 'big-pickle', providerID: 'opencode', finish: 'stop',
                    time: { created: t0 + 100, completed: t0 + 5000 }, id: 'msg_2'
                },
                parts: [
                    { type: 'step-start', id: 'p2' },
                    { type: 'reasoning', text: 'The user wants only the nonce.', time: { start: t0 + 1000, end: t0 + 1400 }, id: 'p3' },
                    {
                        type: 'tool', tool: 'glob', callID: 'call-1',
                        state: { status: 'completed', input: { pattern: '**/package.json' }, output: 'x', time: { start: t0 + 1500, end: t0 + 1600 } },
                        id: 'p4'
                    },
                    { type: 'text', text: 'NONCE=af-msu9oo6n', time: { start: t0 + 1700, end: t0 + 1750 }, id: 'p5' },
                    { type: 'step-finish', reason: 'stop', tokens: spend(8192, 6196, 13, 63, 1920), cost: 0, id: 'p6' }
                ]
            },
            {
                info: { role: 'user', time: { created: t0 + 6000 }, agent: 'build', id: 'msg_3' },
                parts: [{ type: 'text', text: 'Az önce yazdığın NONCE değerini tekrar yaz.', id: 'p7' }]
            },
            {
                info: {
                    role: 'assistant', agent: 'build', cost: 0, tokens: spend(8241, 36, 13, 0, 8192),
                    modelID: 'big-pickle', providerID: 'opencode', finish: 'stop',
                    time: { created: t0 + 6100, completed: t0 + 9000 }, id: 'msg_4'
                },
                parts: [
                    { type: 'step-start', id: 'p8' },
                    { type: 'text', text: 'NONCE=af-msu9oo6n', time: { start: t0 + 8000, end: t0 + 8100 }, id: 'p9' },
                    { type: 'step-finish', reason: 'stop', tokens: spend(8241, 36, 13, 0, 8192), cost: 0, id: 'p10' }
                ]
            }
        ]
    }), 'utf8');
    const rows = T.opencodeSessionsSource(() => dir, () => ({}), pricing, 0).scan();
    ok('opencode: the export is a row', rows.length === 1);
    const info = rows[0];
    ok('opencode: two prompts, two turns', info.turns.length === 2);
    ok('‼️ opencode: reasoning is added to OUTPUT in the turn exactly as in the session total',
        info.turns[0].tokens === 6196 + 13 + 63 + 1920);
    ok('opencode: one round trip per step-finish, and the parts are the steps',
        info.turns[0].apiCalls === 1 && info.turns[0].steps === 3
        && info.turns[0].thinking === 1 && info.turns[0].tools === 1);
    ok('‼️ opencode: Ctx is the call\'s own total — the window, not the lifetime spend',
        info.turns[0].endCtx === 8192 && info.turns[1].endCtx === 8241);
    ok('opencode: the price is the engine\'s own figure', Math.abs(info.turns[0].cost - 0.05) < 1e-9);
    ok('opencode: the turn wears the model that served it',
        info.turns[0].models.join() === 'big-pickle');
    agree('opencode', info);
}

// ------------------------------------------------- and the page itself
{
    // The whole point: a turn row exists for every engine, so the Turns page's
    // engine picker — whose options are derived from the rows — can offer them.
    const sessions = []
        .concat(T.geminiSessionsSource(() => path.join(root, 'gemini'), () => [], pricing, 0).scan())
        .concat(T.agySessionsSource(() => path.join(root, 'agy'), () => ({}), undefined, 0).scan())
        .concat(T.farmConsoleSessionsSource(() => path.join(root, 'console'), () => ({}), 0).scan())
        .concat(T.codexSessionsSource(() => path.join(root, 'codex'), () => ({}), pricing, 0).scan())
        .concat(T.opencodeSessionsSource(() => path.join(root, 'opencode'), () => ({}), pricing, 0).scan());
    const rows = buildTurnRows(sessions, () => false);
    const engines = [...new Set(rows.map(r => r.engine))].sort();
    ok('‼️ every engine reaches the Turns page — the picker lists what the rows carry',
        engines.join() === 'agy,codex,gemini,opencode');
    ok('the page is sorted newest first, across engines',
        rows.every((r, i) => i === 0 || rows[i - 1].ts >= r.ts));
    ok('every row can name the session it belongs to and how many turns that had',
        rows.every(r => r.session && r.of > 0 && r.n >= 1 && r.n <= r.of));
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
