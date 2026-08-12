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
const { buildTurnsMarkdown } = require(path.join(__dirname, '..', 'out', 'panels', 'turnsPanel.js'));
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
// ‼️ Milliseconds, not minutes. Every surface formats a duration with the one
// shared helper now, and rounding to minutes here threw away everything it
// shows below one — a 40-second turn read as "0m".
eq('turn 1 duration runs to the next turn', rows[1].durationMs, 5 * 60000);
ok('last turn duration runs to the session end',
    rows[0].durationMs >= 60000 && rows[0].durationMs <= 2 * 60000);
// The turn's OWN running time is a different number from the gap to the next
// turn: the gap includes however long the ball sat with the user.
ok('the turn carries its own running time too', typeof rows[0].ms === 'number');
ok('round trips and steps both ride on the row',
    typeof rows[0].apiCalls === 'number' && typeof rows[0].steps === 'number');
ok('and where the turn left the window', typeof rows[0].endCtx === 'number');
ok('active flag from the callback', rows[0].active === true);
ok('origin rides on every turn of the session', rows.every(r => r.origin === 'user'));
{
    // the same session recorded as an SDK run → every one of its turns is automation
    const autoInfo = Object.assign({}, info, { entrypoint: 'sdk-cli' });
    ok('an sdk-cli session marks its turns as automation',
        buildTurnRows([autoInfo], () => false).every(r => r.origin === 'auto'));
}

// ---------- 4) turns.js page contract (source-level regression guards) ----------
// The page script is a webview module (needs a DOM); these guard the exact
// layout/behavior the user specified without standing up a full DOM stub.
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'turns.js'), 'utf8');
    const cols = /const COLUMNS = \[([^\]]+)\]/.exec(js);
    ok('COLUMNS list present', !!cols);
    const order = cols ? cols[1].split(',').map(s => s.trim().replace(/'/g, '')) : [];
    ok('the origin glyph column leads the row', order[0] === 'origin');
    ok('the page opens scoped to your own sessions and can flip in one click',
        /origin: 'user'/.test(js) && /af-oswitch/.test(js) && /af-forig-/.test(js));
    ok('the AI side of the Show chips is "Agent", never "Assistant"',
        /🤖 Agent/.test(js) && !/'Assistant'/.test(js));
    // Steps → Tokens → Ctx: what the turn did, what it cost, where it left the
    // window — the figures that explain each other, side by side.
    ok('Steps, Tokens and Ctx sit together after Model',
        order.indexOf('steps') === order.indexOf('models') + 1 &&
        order.indexOf('tokens') === order.indexOf('steps') + 1 &&
        order.indexOf('ctx') === order.indexOf('tokens') + 1 &&
        order.indexOf('when') === order.indexOf('ctx') + 1);
    ok('default row count is 200', /DATA\.tableN \|\| 200/.test(js));
    ok('Show chips exist with Dialog default',
        /ROLE_DEFAULT = \['user', 'assistant'\]/.test(js) &&
        /new Set\(Array\.isArray\(saved\.roles\) \? saved\.roles : ROLE_DEFAULT\)/.test(js) &&
        /data-preset="dialog"/.test(js) && /data-chip=/.test(js));
    ok('Turn column kept ~70% and Session ~40% of the old widths',
        /LABEL_CHARS = 77/.test(js) && /SESSION_CHARS = 15/.test(js));
    // the TS default must agree with the webview fallback
    const panel = fs.readFileSync(path.join(__dirname, '..', 'out', 'panels', 'turnsPanel.js'), 'utf8');
    ok('TURNS_TABLE_N default is 200 host-side', /TURNS_TABLE_N = 200/.test(panel));
}

// ---------- 5) Export MD (buildTurnsMarkdown): view/everything + folded titles ----------
{
    // a tiny index stub over the single fixture session
    const idx = { all: () => [info], allWithExternal: () => [info], isSessionActive: () => false };
    const depsStub = {
        extensionUri: {}, index: idx, getPricing: () => pricing
    };
    const shown = [ { file, n: 2 }, { file, n: 1 } ]; // as the page lists them
    const bothKeys = new Set([`${file}#2`, `${file}#1`]);
    const oneOpen = new Set([`${file}#1`]); // only turn 1 unfolded

    // view mode, both open, Dialog roles → headers + only user/assistant lines
    const viewBoth = buildTurnsMarkdown(depsStub, shown, bothKeys, ['user', 'assistant'],
        { view: true, foldedTitles: false });
    ok('view export names both turns', /turn 2\/2/.test(viewBoth) && /turn 1\/2/.test(viewBoth));
    ok('view export carries the prompt as the turn heading', /fix the login bug please/.test(viewBoth));
    ok('Dialog roles keep the assistant reply', /on it/.test(viewBoth));
    ok('Dialog roles drop tool calls/results', !/TOOL CALL/.test(viewBoth) && !/TOOL RESULT/.test(viewBoth));

    // view mode, only turn 1 open, folded titles OFF → turn 2 omitted entirely
    const foldedOff = buildTurnsMarkdown(depsStub, shown, oneOpen, [], { view: true, foldedTitles: false });
    ok('folded turn omitted when titles off', !/turn 2\/2/.test(foldedOff) && /turn 1\/2/.test(foldedOff));

    // view mode, only turn 1 open, folded titles ON → turn 2 as a header, no body
    const foldedOn = buildTurnsMarkdown(depsStub, shown, oneOpen, [], { view: true, foldedTitles: true });
    ok('folded turn kept as a title when titles on', /turn 2\/2/.test(foldedOn));
    ok('folded turn shows no body (deploy content absent)', !/deployed/.test(foldedOn));
    ok('the open turn still shows its body', /on it/.test(foldedOn));

    // everything mode ignores fold + roles → both turns, tool traffic included
    const everything = buildTurnsMarkdown(depsStub, shown, new Set(), ['user'], { view: false, foldedTitles: false });
    ok('everything exports both turns fully', /turn 2\/2/.test(everything) && /turn 1\/2/.test(everything));
    ok('everything ignores the Show filter (tool call present)', /TOOL CALL/.test(everything));
    ok('everything header states the mode', /Export: everything/.test(everything));

    // ‼️ X-35 — THE EXPORT READS THE POOL THE TABLE WAS BUILT FROM. The page's
    // rows come from `allWithExternal()`, and every lookup here used to go to
    // the claude-only `all()`: a Codex turn you could see and tick was silently
    // dropped out of the Markdown. A stub whose claude list is EMPTY pins it —
    // if the export ever goes back to `all()`, this is the assertion that fires.
    const foreignOnly = {
        extensionUri: {}, getPricing: () => pricing,
        index: { all: () => [], allWithExternal: () => [info], isSessionActive: () => false }
    };
    const foreignMd = buildTurnsMarkdown(foreignOnly, shown, bothKeys, [], { view: false, foldedTitles: false });
    ok('‼️ a row outside the claude-only list still exports',
        /turn 2\/2/.test(foreignMd) && /turn 1\/2/.test(foreignMd));
    ok('…with its real header, not a bare turn number',
        /fix the login bug please/.test(foreignMd));
}

// ---------- 6) turns.list bridge op ----------
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
    ok('origin rides along on the op rows', all.result.every(r => r.origin === 'user'));
    const userOnly = await reg.dispatch('turns.list', { origin: 'user' });
    const autoOnly = await reg.dispatch('turns.list', { origin: 'auto' });
    ok('origin filter honored both ways',
        userOnly.ok && userOnly.result.length === 2 && autoOnly.ok && autoOnly.result.length === 0);
    const anyScope = await reg.dispatch('turns.list', { origin: 'all' });
    ok('an unrecognized origin means "both", not "nothing"', anyScope.ok && anyScope.result.length === 2);

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
