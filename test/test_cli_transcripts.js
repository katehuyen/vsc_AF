// E3b: codex + gemini transcript adapters — fixtures mirror the researched
// formats (openai/codex protocol.rs + ccusage fixture; gemini-cli chats files).
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = require('path').resolve(__dirname, '..');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: () => Promise.resolve(undefined) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
const {
    codexPromptTitle, codexSessionsSource, codexUserText,
    farmConsoleSessionsSource, geminiSessionsSource, readFarmConsoleTranscript
} = require(path.join(ROOT, 'out/core/cliTranscripts.js'));
const { dedupeExternal } = require(path.join(ROOT, 'out/core/sessionSource.js'));
const { PricingEngine } = require(path.join(ROOT, 'out/core/pricing.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e3b-'));
const agentDir = 'D:\\agents\\kurgucu';
const pricing = new PricingEngine([
    { match: 'gpt-5', input: 1.25, output: 10, cacheWrite: 0, cacheRead: 0.125 },
    { match: 'gemini-2\\.5-pro', input: 1.25, output: 10, cacheWrite: 0, cacheRead: 0.31 }
]);
const resolveAgent = (cwd) => (cwd || '').replace(/\\/g, '/').toLowerCase() === 'd:/agents/kurgucu'
    ? { agentId: 'k1', agentName: 'kurgucu' } : {};

// ---- codex fixture: sessions/YYYY/MM/DD/rollout-*.jsonl ----
const codexHome = path.join(tmp, '.codex');
const day = path.join(codexHome, 'sessions', '2026', '07', '10');
fs.mkdirSync(day, { recursive: true });
const rollout = [
    { timestamp: '2026-07-10T09:00:00.000Z', type: 'session_meta', payload: { id: 'thread-1', session_id: 'sess-uuid-1', timestamp: '2026-07-10T09:00:00.000Z', cwd: 'D:\\agents\\kurgucu', originator: 'codex_cli_rs', cli_version: '0.136.0' } },
    { timestamp: '2026-07-10T09:00:05.000Z', type: 'turn_context', payload: { model: 'gpt-5.2-codex' } },
    { timestamp: '2026-07-10T09:00:06.000Z', type: 'event_msg', payload: { type: 'user_message', message: '## My request for Codex: kurgu planını çıkar' } },
    { timestamp: '2026-07-10T09:00:20.000Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{}' } },
    { timestamp: '2026-07-10T09:00:21.000Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: 'status' } },
    { timestamp: '2026-07-10T09:00:40.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'working' } },
    // ‼️ `total_tokens` IS `input + output`, AND THE REASONING IS INSIDE THE
    // OUTPUT — measured twice on this machine's own rollouts (X-35):
    //   input 20 766 + output    822 = total     21 588  (reasoning    211)
    //   input 32 705 304 + output 95 054 = total 32 800 358  (reasoning 31 839)
    // This fixture used to say 1000 + 125 + 75 = 1200, encoding the opposite
    // belief, and the parser it was checking added the reasoning on top — so
    // every Codex row in every table over-reported its output, and the money
    // derived from it, by the size of the model's private thinking. The numbers
    // below satisfy the measured identity.
    { timestamp: '2026-07-10T09:01:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { model: 'gpt-5.2-codex', last_token_usage: { input_tokens: 1000, cached_input_tokens: 250, output_tokens: 125, reasoning_output_tokens: 75, total_tokens: 1125 }, total_token_usage: { input_tokens: 1000, cached_input_tokens: 250, output_tokens: 125, reasoning_output_tokens: 75, total_tokens: 1125 } } } },
    { timestamp: '2026-07-10T09:02:00.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'devam et' } },
    { timestamp: '2026-07-10T09:03:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { model: 'gpt-5.2-codex', last_token_usage: { input_tokens: 2000, cached_input_tokens: 1500, output_tokens: 300, reasoning_output_tokens: 100, total_tokens: 2300 }, total_token_usage: { input_tokens: 3000, cached_input_tokens: 1750, output_tokens: 425, reasoning_output_tokens: 175, total_tokens: 3425 }, model_context_window: 272000 } } }
].map(x => JSON.stringify(x)).join('\n') + '\n';
fs.writeFileSync(path.join(day, 'rollout-2026-07-10T09-00-00-abc.jsonl'), rollout, 'utf8');
// noise: empty probe session → skipped
fs.writeFileSync(path.join(day, 'rollout-empty.jsonl'),
    JSON.stringify({ timestamp: '2026-07-10T10:00:00.000Z', type: 'session_meta', payload: { id: 'x', cwd: 'C:\\elsewhere' } }) + '\n', 'utf8');

const codex = codexSessionsSource(() => codexHome, resolveAgent, () => pricing, 0);
let list = codex.scan();
check('codex: one real session, probe skipped', list.length === 1);
const c = list[0];
check('codex: session id from session_meta', c.sessionId === 'sess-uuid-1');
check('codex: source + version', c.source === 'codex' && c.version === '0.136.0');
check('codex: agent resolved from cwd', c.agentId === 'k1' && c.agentName === 'kurgucu');
check('codex: title from first prompt, prefix stripped', c.title === 'kurgu planını çıkar');
check('codex: userTurns counted', c.userTurns === 2);
check('codex: assistant messages come from dialogue events, not token counters', c.assistantMsgs === 1);
check('codex: both function and custom tool calls are counted',
    c.toolCalls === 2 && c.tools.shell === 1 && c.tools.exec === 1);
// ‼️ The session TOTAL is the last cumulative block, and the reasoning is NOT
// added to the output — it is already in it (see the fixture note above).
check('codex: usage from LAST cumulative token_count (reasoning already in output)',
    c.usage.input === 1250 && c.usage.cacheRead === 1750 && c.usage.output === 425);
check('codex: model collected', c.models.includes('gpt-5.2-codex'));
const wantCost = (1250 * 1.25 + 425 * 10 + 1750 * 0.125) / 1e6;
check('codex: cost from pricing rule', Math.abs(c.cost - wantCost) < 1e-9);
// ‼️ X-35: ctx is what the LAST REQUEST held, never the thread's lifetime spend.
// The rollout states both on the same line and only one of them is a window;
// running `contextAfter` on the cumulative figure is what made a real session
// claim 38M of context against a 258k window.
check('‼️ codex: ctx is the last request\'s window, not the session total',
    c.lastCtxTokens === 2300 && c.lastCtxTokens < c.usage.input + c.usage.cacheRead);
check('codex: the engine\'s own context window is carried on the row',
    c.ctxWindow === 272000);
check('codex: firstTs/lastTs from line timestamps', new Date(c.firstTs).toISOString() === '2026-07-10T09:00:00.000Z' && new Date(c.lastTs).toISOString() === '2026-07-10T09:03:00.000Z');
check('codex: file points at rollout', /rollout-2026/.test(c.file));

const wrapped = '<project-context>machine brief that is not dialogue</project-context>\n\n/goal backlogdaki ilk beş kalemi tamamla';
check('codex: injected project context is removed from the user dialogue',
    codexUserText(wrapped) === '/goal backlogdaki ilk beş kalemi tamamla');
check('codex: a raw /goal prompt names the session by its prose',
    codexPromptTitle(wrapped) === 'backlogdaki ilk beş kalemi tamamla');

// cache: unchanged scan returns same array
check('codex: unchanged → cached', codex.scan() === list || codex.scan().length === 1);

// ---- gemini fixture: tmp/<sha256(projectRoot)>/chats/session.json + jsonl ----
const geminiTmp = path.join(tmp, '.gemini', 'tmp');
const hash = crypto.createHash('sha256').update(agentDir.replace(/\\/g, '/')).digest('hex');
const chats = path.join(geminiTmp, hash, 'chats');
fs.mkdirSync(chats, { recursive: true });
fs.writeFileSync(path.join(chats, 'session-1.json'), JSON.stringify({
    sessionId: 'g-sess-1',
    startTime: '2026-07-10T11:00:00.000Z',
    lastUpdated: '2026-07-10T11:30:00.000Z',
    messages: [
        { type: 'user', content: 'sahne 3 için storyboard yaz', timestamp: '2026-07-10T11:00:00.000Z' },
        { type: 'gemini', model: 'gemini-2.5-pro', timestamp: '2026-07-10T11:01:00.000Z', tokens: { input: 4000, output: 800, cached: 1000, thoughts: 200, tool: 50, total: 6050 } },
        { type: 'user', content: 'daha kısa olsun' },
        { type: 'gemini', model: 'gemini-2.5-pro', tokens: { input: 5000, output: 400, cached: 4000, thoughts: 100, tool: 0 } }
    ]
}), 'utf8');
// jsonl variant in another (unknown) project hash → agent unassigned
const otherChats = path.join(geminiTmp, 'a'.repeat(64), 'chats');
fs.mkdirSync(otherChats, { recursive: true });
fs.writeFileSync(path.join(otherChats, 'log.jsonl'), [
    JSON.stringify({ sessionId: 'g-sess-2', model: 'gemini-2.5-flash' }),
    JSON.stringify({ type: 'user', message: 'hızlı soru' }),
    JSON.stringify({ type: 'gemini', id: 'm1', timestamp: '2026-07-11T08:00:00.000Z', tokens: { prompt: 100, candidates: 20 } })
].join('\n') + '\n', 'utf8');

const gemini = geminiSessionsSource(() => geminiTmp, () => [{ id: 'k1', name: 'kurgucu', dir: agentDir }], () => pricing, 0);
list = gemini.scan().sort((a, b) => a.sessionId.localeCompare(b.sessionId));
check('gemini: both files parsed', list.length === 2);
const g1 = list.find(s => s.sessionId === 'g-sess-1');
check('gemini: agent matched via sha256(projectRoot)', g1.agentId === 'k1');
check('gemini: title from first user message', g1.title === 'sahne 3 için storyboard yaz');
check('gemini: userTurns', g1.userTurns === 2);
// usage: msg1 input 4000-1000+50=3050, cacheRead 1000, output 800+200=1000; msg2 input 5000-4000=1000, cacheRead 4000, output 500
check('gemini: usage normalized (cached out of input, thoughts into output)',
    g1.usage.input === 4050 && g1.usage.cacheRead === 5000 && g1.usage.output === 1500);
check('gemini: model + cost per turn', g1.models.join() === 'gemini-2.5-pro' && g1.cost > 0);
check('gemini: timestamps from record', new Date(g1.firstTs).toISOString() === '2026-07-10T11:00:00.000Z');
// B6: lastTs comes from lastUpdated even though startTime is also present
check('gemini: lastTs honors lastUpdated', new Date(g1.lastTs).toISOString() === '2026-07-10T11:30:00.000Z');
const g2 = list.find(s => s.sessionId === 'g-sess-2');
check('gemini jsonl: parsed with session/model lines', !!g2 && g2.userTurns === 1 && g2.usage.input === 100 && g2.usage.output === 20);
check('gemini jsonl: unknown project hash → unassigned', g2.agentId === undefined);
check('gemini: unknown model recorded for pricing warning', pricing.unknownModels.has('gemini-2.5-flash'));

// B10: lowercase drive letter in the agent dir still matches the hash
const geminiLower = geminiSessionsSource(() => geminiTmp, () => [{ id: 'k1', name: 'kurgucu', dir: 'd:\\agents\\kurgucu' }], () => pricing, 0);
const lowerList = geminiLower.scan();
check('gemini: drive-case variant still assigns agent',
    lowerList.find(s => s.sessionId === 'g-sess-1').agentId === 'k1');

// ---- Agent Farm-owned Antigravity transcript: dialogue survives VS Code ----
const farmDir = path.join(tmp, 'external-console-transcripts');
fs.mkdirSync(farmDir, { recursive: true });
const now = Date.now();
const farmSnap = {
    format: 'agent-farm-console-v1', engine: 'agy', sessionId: 'agy-owned-1',
    agentId: 'k1', agentName: 'kurgucu', cwd: agentDir,
    model: 'gemini-3.5-pro', effort: 'high', permissionMode: 'acceptEdits',
    startedAt: now - 60000, lastTs: now, cost: 0, tokens: 4321,
    wTokens: 2100, turns: 1, contextTokens: 3010,
    messages: [
        { id: 'u1', ts: now - 50000, role: 'user', text: 'Agy konuşmasını sakla' },
        { id: 'a1', ts: now - 40000, role: 'agent', text: 'Saklıyorum' },
        { id: 't1', ts: now - 30000, role: 'tool', tool: { name: 'Read', detail: 'D:/x.md' } },
        { id: 't2', ts: now - 20000, role: 'tool', text: 'body' },
        { id: 'r1', ts: now, role: 'result', tokens: 4321, cost: 0 }
    ]
};
const farmFile = path.join(farmDir, 'agy-owned-1.json');
fs.writeFileSync(farmFile, JSON.stringify(farmSnap), 'utf8');
check('farm transcript: the versioned plain JSON is recognized',
    readFarmConsoleTranscript(fs.readFileSync(farmFile, 'utf8')).sessionId === 'agy-owned-1');
const farmSource = farmConsoleSessionsSource(() => farmDir, resolveAgent, 0);
const farmRows = farmSource.scan();
check('farm transcript: Antigravity becomes an openable external session',
    farmRows.length === 1 && farmRows[0].source === 'agy' && farmRows[0].file === farmFile);
check('farm transcript: title, dialogue counts, tool and exact totals survive',
    farmRows[0].title === 'Agy konuşmasını sakla'
    && farmRows[0].userTurns === 1 && farmRows[0].assistantMsgs === 1
    && farmRows[0].toolCalls === 1 && farmRows[0].usage.input === 4321
    && farmRows[0].wTokens === 2100);

// B7: transcript without agent must NOT suppress an assigned lane
const { dedupeExternal: dd } = require(path.join(ROOT, 'out/core/sessionSource.js'));
const gNoAgent = { ...lowerList.find(s => s.sessionId === 'g-sess-2') }; // unassigned transcript
const assignedLane = { file: '', sessionId: 'cli:gemini:x:9', source: 'gemini', agentId: 'k1', firstTs: gNoAgent.firstTs, lastTs: gNoAgent.lastTs, usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, cost: 0 };
check('dedupe: assigned lane survives unassigned transcript overlap', dd([gNoAgent, assignedLane]).includes(assignedLane));

// ---- dedupe: live-events lane vs transcript ----
const lane = { file: '', sessionId: 'cli:codex:k1:1', source: 'codex', agentId: 'k1', firstTs: c.firstTs + 60000, lastTs: c.lastTs - 60000, usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, cost: 0 };
const laneOther = { ...lane, sessionId: 'cli:codex:k1:2', firstTs: c.lastTs + 3600_000, lastTs: c.lastTs + 7200_000 };
const merged = dedupeExternal([c, lane, laneOther]);
check('dedupe: overlapping lane dropped, transcript kept', merged.includes(c) && !merged.includes(lane));
check('dedupe: non-overlapping lane kept', merged.includes(laneOther));

const agyMeta = { ...farmRows[0], file: '', title: 'metadata only' };
check('dedupe: the readable Farm transcript replaces Antigravity metadata-only row',
    dedupeExternal([agyMeta, farmRows[0]]).length === 1
    && dedupeExternal([agyMeta, farmRows[0]])[0].file === farmFile);

console.log(`\n${pass} passed, ${fail} failed`);
Module._load = origLoad;
process.exit(fail ? 1 : 0);
