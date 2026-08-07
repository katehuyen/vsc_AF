// Step kinds: what a step IS, and therefore where its cost comes from.
//
// ‼️ TWO COPIES OF THE TABLE EXIST — `src/core/stepkind.ts` for the host and
// `media/charts.js` for the webviews — and this suite is why that is safe. A
// chip in the Console and a cell in the transcript must not describe one step
// two different ways; the first half of this file holds them identical, the
// second half pins the classification itself against tool names that were
// COUNTED in this machine's own transcripts, not imagined.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } }; }
    return origLoad.apply(this, arguments);
};
const SK = require(path.join(__dirname, '..', 'out', 'core', 'stepkind.js'));
Module._load = origLoad;

// the REAL webview table, loaded the way a webview loads it
const box = { window: {}, document: {}, console };
box.globalThis = box;
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../media/charts.js'), 'utf8'), box);
const C = box.window.AFCharts;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- the two tables are one table ----------
{
    const tsKinds = SK.STEP_KINDS.map(s => s.kind);
    const jsKinds = Object.keys(C.STEP_KIND);
    ok('both copies list the same kinds, in the same order',
        JSON.stringify(tsKinds) === JSON.stringify(jsKinds));
    let same = true;
    for (const s of SK.STEP_KINDS) {
        const j = C.STEP_KIND[s.kind];
        if (!j || j.glyph !== s.glyph || j.label !== s.label || j.cost !== s.cost) { same = false; }
    }
    ok('…with identical glyph, label and cost sentence on every one', same);
    ok('every glyph is distinct — the chip IS the category',
        new Set(SK.STEP_KINDS.map(s => s.glyph)).size === SK.STEP_KINDS.length);
    ok('every kind explains what it costs', SK.STEP_KINDS.every(s => s.cost && s.cost.length > 20));
}

// ---------- classification, against tools that really occur ----------
{
    // Counted in 60 transcripts / 21 705 lines on 2026-08-04. If a name here
    // ever moves category, it moved for a real reason.
    const cases = [
        ['Bash', 'local'], ['PowerShell', 'local'], ['Read', 'local'], ['Edit', 'local'],
        ['Write', 'local'], ['Grep', 'local'], ['Glob', 'local'], ['NotebookEdit', 'local'],
        ['mcp__obsidian__vault_patch', 'mcp'], ['mcp__obsidian__vault_read', 'mcp'],
        ['mcp__airtable__airtable_get', 'mcp'],
        // a browser driven over MCP is still traffic to the open web
        ['mcp__playwright__browser_navigate', 'web'],
        ['mcp__chrome-devtools__take_screenshot', 'web'],
        ['WebFetch', 'web'], ['WebSearch', 'web'],
        ['Task', 'subagent'], ['Agent', 'subagent'],
        ['TaskCreate', 'harness'], ['TaskUpdate', 'harness'], ['ToolSearch', 'harness'],
        ['AskUserQuestion', 'harness'], ['Skill', 'harness']
    ];
    let bad = '';
    for (const [name, want] of cases) {
        const got = SK.stepKindForTool(name);
        if (got !== want) { bad += `${name}→${got}(want ${want}) `; }
    }
    ok('every tool that really occurs lands in the right category' + (bad ? ': ' + bad : ''), !bad);

    // ‼️ AN UNKNOWN TOOL IS LOCAL, NOT REMOTE. Guessing "network" about a tool
    // nobody listed would put a scary label on something harmless; guessing
    // "local" is the assumption that costs nothing when it is wrong.
    ok('a tool nobody has listed reads as local', SK.stepKindForTool('SomeFutureTool') === 'local');
    ok('an empty name does not crash or invent a category', SK.stepKindForTool('') === 'local');

    // MCP prefix beats everything except the browser rule
    ok('any mcp__ server is an MCP call', SK.stepKindForTool('mcp__brand_new__thing') === 'mcp');
}

// ---------- blocks ----------
{
    ok('thinking is its own kind', SK.stepKindForBlock('thinking') === 'think');
    ok('…including the redacted form', SK.stepKindForBlock('redacted_thinking') === 'think');
    ok('text is the model speaking', SK.stepKindForBlock('text') === 'say');
    ok('a tool_use takes the tool\'s category', SK.stepKindForBlock('tool_use', 'WebSearch') === 'web');
    ok('a server_tool_use does too', SK.stepKindForBlock('server_tool_use', 'WebFetch') === 'web');
    ok('a tool_result is its own kind', SK.stepKindForBlock('tool_result') === 'result');
    ok('anything else is "never reached a model"', SK.stepKindForBlock('image') === 'none');
}

// ---------- the chip ----------
{
    const chip = C.stepChip('local', 0, 0);
    ok('a chip is one glyph with the explanation on hover',
        chip.indexOf('⌘') >= 0 && chip.indexOf('runs on this machine') >= 0);
    ok('…and says outright that a figure-less row rode on the call above it',
        chip.indexOf('rode on the call above it') >= 0);
    const paid = C.stepChip('say', 120000, 30000);
    ok('a step that carried its call\'s cost shows both figures',
        paid.indexOf('This call:') >= 0 && paid.indexOf('⚖') >= 0);
    ok('an unknown kind draws nothing rather than a wrong chip', C.stepChip('nonsense') === '');
    ok('a row from an older transcript (no kind) draws nothing', C.stepChip(undefined) === '');
    const legend = C.stepKindLegend();
    ok('the legend names every kind', SK.STEP_KINDS.every(s => legend.indexOf(s.label) >= 0));

    // ‼️ A GLYPH IS ONLY AS GOOD AS THE PLACE YOU CAN RE-LEARN IT. The plain
    // text twin is what hangs on the Console's session id — the one label that
    // is always on screen and never moves.
    const txt = C.stepKindLegendText();
    ok('the text legend carries every glyph', SK.STEP_KINDS.every(s => txt.indexOf(s.glyph) >= 0));
    ok('…and every label and cost sentence',
        SK.STEP_KINDS.every(s => txt.indexOf(s.label) >= 0 && txt.indexOf(s.cost) >= 0));
    ok('…and explains a row that carries no figure',
        txt.indexOf('written once') >= 0);
    ok('…as plain text, because a title attribute cannot render markup',
        txt.indexOf('<') < 0);
}

// ---------- the console reducer tags what it emits ----------
{
    const CP = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));
    let st = CP.newSessionState({ id: 'c1', cwd: 'D:/x', now: 1000 });
    const usage = { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 100000 };
    st = CP.reduceEvent(st, {
        type: 'assistant', request_id: 'r1',
        message: {
            id: 'm1', model: 'claude-opus-5', usage, content: [
                { type: 'thinking', thinking: 'hmm' },
                { type: 'text', text: 'here you go' },
                { type: 'tool_use', name: 'Read', input: { file_path: 'D:/a.ts' } },
                { type: 'tool_use', name: 'mcp__obsidian__vault_read', input: {} }
            ]
        }
    }, 2000).state;

    const rows = st.messages;
    ok('the reply row is tagged as the model speaking', rows[0].kind === 'say');
    ok('the local tool row is tagged local', rows[1].kind === 'local');
    ok('the MCP row is tagged mcp', rows[2].kind === 'mcp');

    // ‼️ THE CALL'S COST IS WRITTEN ONCE — on the first visible block. Writing
    // it on all three would say the turn cost three times what it did.
    ok('the first block carries the call\'s cost', rows[0].stepTokens === 101110);
    ok('…and the rest carry none', !rows[1].stepTokens && !rows[2].stepTokens);
    ok('…with the weighted twin beside it', rows[0].stepWTokens > 0);

    // thinking is counted even though it is deliberately not rendered
    ok('thinking is counted, not shown', st.turnThinking === 1 && rows.every(r => r.kind !== 'think'));

    // ‼️ AND IT IS IN THE TOTAL. A step is one thing the agent did — it
    // reasoned, it wrote, or it called a tool — so this batch is four, not the
    // three that were drawn. The Console used to work the number out from the
    // rows on screen, which could not see the thinking block at all and swept
    // in every tool RESULT instead: short of the dearest step and double-counting
    // the answers. Counted here now, off the same blocks the tables count.
    ok('‼️ every step is in the turn total — reasoning included', st.turnSteps === 4);
    ok('…and a tool RESULT is not a step the agent took',
        CP.reduceEvent(st, {
            type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] }
        }, 2200).state.turnSteps === 4);

    // a repeated line (same call, next block batch) must not charge again
    const before = st.messages.length;
    st = CP.reduceEvent(st, {
        type: 'assistant', request_id: 'r1',
        message: { id: 'm1', model: 'claude-opus-5', usage, content: [{ type: 'text', text: 'again' }] }
    }, 2100).state;
    ok('a repeat of the same call adds a row but no second charge',
        st.messages.length === before + 1 && !st.messages[before].stepTokens);

    // tool results come back tagged too
    st = CP.reduceEvent(st, {
        type: 'user', message: { content: [{ type: 'tool_result', content: 'file contents' }] }
    }, 2200).state;
    ok('a tool result is tagged as one', st.messages[st.messages.length - 1].kind === 'result');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
