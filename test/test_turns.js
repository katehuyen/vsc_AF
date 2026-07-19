// Turns page + honest memory recalls (compiled TS, pure):
// 1) parseSessionFile collects a per-turn rollup (labels, tokens/cost, tools,
//    errors, models) with viewer semantics — commands open turns and show as
//    their name, sidechain prompts never open a turn;
// 2) memoryReads is keyed by FULL path and memoryUsage attributes recalls only
//    to the agent whose memory/ folder was read — a fresh cross-agent copy
//    starts at zero (the "10 recalls out of nowhere" matrix bug);
// 3) buildTurnRows unrolls sessions into rows (session title, n/of, duration);
// 4) registerTurnsOps exposes the same data as the turns.list bridge op.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(`${n} (got ${JSON.stringify(got)} want ${JSON.stringify(want)})`, got === want);

// let the compiled core load in plain node by mocking the 'vscode' import
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {}, EventEmitter: function () { this.event = () => ({ dispose() {} }); this.fire = () => {}; } };
    }
    return origLoad.apply(this, arguments);
};
const { parseSessionFile } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
const { memoryUsage, memoryLastUsed } = require(path.join(__dirname, '..', 'out', 'core', 'memusage.js'));
const { buildTurnRows, registerTurnsOps } = require(path.join(__dirname, '..', 'out', 'core', 'turns.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
Module._load = origLoad;

// ---------- fixture transcript: 2 turns + sidechain noise ----------
const now = Date.now();
const iso = msAgo => new Date(now - msAgo).toISOString();
const T1 = iso(10 * 60000), T2 = iso(5 * 60000);
const lines = [
    // turn 1: plain prompt → text reply + 2 tool calls (one memory read of the
    // agent's OWN file, one of ANOTHER agent's same-named file) + 1 tool error
    { type: 'user', timestamp: T1, cwd: 'D:\\agents\\dev', message: { role: 'user', content: 'fix the login bug please' } },
    { type: 'assistant', timestamp: iso(9.5 * 60000), requestId: 'r1', costUSD: 0.5, message: { id: 'a1', model: 'claude-opus-4-8', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: 'on it' }] } },
    { type: 'assistant', timestamp: iso(9 * 60000), requestId: 'r2', costUSD: 0.1, message: { id: 'a2', model: 'claude-opus-4-8', usage: { input_tokens: 10, output_tokens: 10 }, content: [
        { type: 'tool_use', name: 'Read', input: { file_path: 'D:\\agents\\dev\\memory\\notes.md' } },
        { type: 'tool_use', name: 'Read', input: { file_path: 'D:\\agents\\other\\memory\\notes.md' } }
    ] } },
    { type: 'user', timestamp: iso(8.5 * 60000), message: { role: 'user', content: [{ type: 'tool_result', is_error: true, content: 'boom' }] } },
    // turn 2: a typed /command → cheap haiku reply
    { type: 'user', timestamp: T2, message: { role: 'user', content: '<command-name>/deploy</command-name>\n<command-args></command-args>' } },
    { type: 'assistant', timestamp: iso(4 * 60000), requestId: 'r3', costUSD: 0.2, message: { id: 'a3', model: 'claude-haiku-4-5', usage: { input_tokens: 30, output_tokens: 5 }, content: [{ type: 'text', text: 'deployed' }] } },
    // sidechain prompt: must NOT open a third turn
    { type: 'user', timestamp: iso(4 * 60000), isSidechain: true, message: { role: 'user', content: 'subagent work' } }
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-turns-'));
const file = path.join(dir, 'sess1.jsonl');
fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n'), 'utf8');

const pricing = { costFor: () => 0 };
const info = parseSessionFile(file, pricing, 0);

// ---------- 1) per-turn rollup ----------
eq('two turns collected (sidechain opened none)', info.turns.length, 2);
eq('turn 1 label = the prompt', info.turns[0].label, 'fix the login bug please');
eq('turn 2 label = the command name', info.turns[1].label, '/deploy');
eq('turn 1 tokens (both replies)', info.turns[0].tokens, 170);
ok('turn 1 cost summed from costUSD', Math.abs(info.turns[0].cost - 0.6) < 1e-9);
eq('turn 1 tool calls', info.turns[0].tools, 2);
eq('turn 1 errors', info.turns[0].errors, 1);
ok('turn 1 models', info.turns[0].models.length === 1 && info.turns[0].models[0] === 'claude-opus-4-8');
eq('turn 2 tokens', info.turns[1].tokens, 35);
ok('turn 2 models', info.turns[1].models.join(',') === 'claude-haiku-4-5');
eq('turn numbers are 1-based', info.turns[0].n + '/' + info.turns[1].n, '1/2');
ok('turn ts = the opening prompt time', info.turns[0].ts === Date.parse(T1) && info.turns[1].ts === Date.parse(T2));

// ---------- 2) memory recalls attribute by folder owner ----------
ok('memoryReads keyed by full normalized path',
    info.memoryReads['d:/agents/dev/memory/notes.md'] === 1 &&
    info.memoryReads['d:/agents/other/memory/notes.md'] === 1);
const indexMock = { forAgent: () => [info] };
const devUse = memoryUsage(indexMock, 'dev', 30 * 24 * 3600 * 1000, 'D:\\agents\\dev');
eq('own memory read counts once', devUse.get('notes.md'), 1);
const otherUse = memoryUsage(indexMock, 'dev', 30 * 24 * 3600 * 1000, 'D:\\agents\\fresh');
ok('a fresh copy on an uninvolved agent starts at zero recalls', !otherUse.has('notes.md'));
const lastUsed = memoryLastUsed(indexMock, 'dev', 'D:\\agents\\dev');
ok('last-recall follows the same ownership rule',
    lastUsed.get('notes.md') === info.lastTs && !memoryLastUsed(indexMock, 'dev', 'D:\\agents\\fresh').has('notes.md'));

// ---------- 3) buildTurnRows ----------
info.agentName = 'dev';
info.machine = 'laptop';
const rows = buildTurnRows([info], s => s.file === file);
eq('one row per turn', rows.length, 2);
ok('newest turn first', rows[0].n === 2 && rows[1].n === 1);
ok('row carries session identity', rows[0].session === info.title && rows[0].file === file && rows[0].sessionId === 'sess1');
eq('agent display keeps the machine suffix', rows[0].agent, 'dev ⇄ laptop');
eq('n/of context', rows[1].n + '/' + rows[1].of, '1/2');
eq('turn 1 duration runs to the next turn (min)', rows[1].durationMin, 5);
ok('last turn duration runs to the session end', rows[0].durationMin >= 1 && rows[0].durationMin <= 2);
ok('active flag from the callback', rows[0].active === true);

// ---------- 4) turns.list bridge op ----------
(async () => {
    const reg = new BridgeRegistry();
    registerTurnsOps(reg, { sessions: () => [info], isActive: () => false });
    ok('farm.ops lists turns.list', reg.catalog().some(c => c.op === 'turns.list'));
    const all = await reg.dispatch('turns.list', {});
    ok('dispatch returns rows newest first', all.ok && all.result.length === 2 && all.result[0].turn === '2/2');
    ok('row shape: label/tokens/models ride along',
        all.result[1].label === 'fix the login bug please' && all.result[1].tokens === 170 && all.result[1].models[0] === 'claude-opus-4-8');
    const limited = await reg.dispatch('turns.list', { limit: 1 });
    ok('limit honored', limited.ok && limited.result.length === 1);
    const filtered = await reg.dispatch('turns.list', { agent: 'nobody' });
    ok('agent filter honored', filtered.ok && filtered.result.length === 0);

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
