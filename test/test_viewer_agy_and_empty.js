// S-37 — a row that opens a page that shows nothing.
//
// Three defects, all of the same family: the page had content available and did
// not draw it, and then explained itself with the FILTER's message.
//
// 1. Antigravity rows got a `file` for the first time (the source now reads the
//    CLI's step log instead of its stale index), and no reader here understood
//    that format — so every automated `agy` run opened blank.
// 2. The step log announces a CALL on one step and answers it on the NEXT, so a
//    reader that looks for arguments on the step named after the tool finds
//    none: a page of outputs with no commands above them.
// 3. A Claude transcript whose only content is `system` lines (a slash
//    command's own answer) rendered zero messages — measured on session
//    `9490331f-…`, five lines, all of them dropped.
//
// And the empty state itself: "No messages match." is the filter's answer, and
// it was printed over conversations that had no messages at all.
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + (JSON.stringify(a) === JSON.stringify(b) ? '' :
    `: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`), JSON.stringify(a) === JSON.stringify(b));

const Module = require('module');
const stub = () => {
    const orig = Module._load;
    Module._load = function (r) {
        if (r === 'vscode') {
            return {
                Uri: {}, window: {},
                EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } },
                workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                ViewColumn: {}, ConfigurationTarget: {}, env: {}
            };
        }
        return orig.apply(this, arguments);
    };
    return () => { Module._load = orig; };
};
const un = stub();
const viewer = require(path.join(__dirname, '..', 'out', 'panels', 'sessionViewer.js'));
const P = require(path.join(__dirname, '..', 'out', 'core', 'pricing.js'));
un();

const pricing = new P.PricingEngine([]);
const deps = {
    maxMessages: () => 10000, getPricing: () => pricing, contextLimitFor: () => 200000,
    titleFor: () => undefined, pinnedFor: () => false, tagsFor: () => [],
    engineFor: () => undefined, launchedByFor: () => undefined, laneFor: () => false,
    originFor: () => undefined
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-viewer-agy-'));
const iso = ts => new Date(ts).toISOString().replace(/\.\d+Z$/, 'Z');
const t0 = Math.floor((Date.now() - 3600_000) / 1000) * 1000;

// ------------------------------------------------ an Antigravity conversation
{
    const dir = path.join(root, 'brain', 'conv-1', '.system_generated', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(file, [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: iso(t0), content: '<USER_REQUEST>\nCommit the backup.\n</USER_REQUEST>' },
        { step_index: 1, source: 'SYSTEM', type: 'CONVERSATION_HISTORY', status: 'DONE', created_at: iso(t0 + 500) },
        { step_index: 2, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 1000), content: 'Let me look.' },
        {
            step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 1500),
            tool_calls: [{ name: 'run_command', args: { CommandLine: '"git status --short"', Cwd: '"D:\\\\zone\\\\agent"' } }]
        },
        { step_index: 4, source: 'MODEL', type: 'RUN_COMMAND', status: 'DONE', exit_code: 0, created_at: iso(t0 + 2000), content: 'M one.txt' },
        { step_index: 5, source: 'SYSTEM', type: 'CHECKPOINT', status: 'DONE', created_at: iso(t0 + 2500), content: '{{ CHECKPOINT 0 }} truncated' },
        {
            step_index: 6, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 3000),
            tool_calls: [{ name: 'run_command', args: { CommandLine: '"git push"' } }]
        },
        { step_index: 7, source: 'MODEL', type: 'RUN_COMMAND', status: 'ERROR', exit_code: 1, created_at: iso(t0 + 3500), content: 'rejected' },
        { step_index: 8, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 4000), content: 'Done.' }
    ].map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');

    const d = viewer.buildData(file, deps);
    ok('‼️ an Antigravity run opens instead of drawing an empty page', d.messages.length > 0);
    eq('…as Antigravity, not as a Claude transcript that failed to parse', d.engine, 'agy');
    eq('…under its own conversation id, which is its folder', d.sessionId, 'conv-1');
    eq('…titled by what it was asked, without the CLI\'s wrapper', d.title, 'Commit the backup.');

    const roles = {};
    d.messages.forEach(m => { roles[m.role] = (roles[m.role] || 0) + 1; });
    eq('the prompt, the prose, the calls and their answers are all drawn',
        roles, { user: 1, assistant: 2, tool: 2, toolResult: 2, system: 1 });

    const calls = d.messages.filter(m => m.role === 'tool');
    // ‼️ THE ONE THAT MATTERED: the command is on the step BEFORE the result.
    eq('‼️ each call shows the command it ran, taken from the step that announced it',
        calls.map(m => m.input), ['git status --short', 'git push']);
    eq('…named the way the ENGINE names its tools', calls.map(m => m.tool), ['run_command', 'run_command']);
    const bad = d.messages.find(m => m.role === 'toolResult' && m.isError);
    ok('a non-zero exit is drawn as the failure it is', !!bad && /exit 1/.test(bad.text));
    eq('…and counted once', d.errors, 1);
    ok('a CHECKPOINT is shown rather than hidden — it is where the history was cut',
        d.messages.some(m => m.role === 'system' && /CHECKPOINT/.test(m.text || '')));
    eq('one turn, spanning the whole run', [d.turns.length, d.turns[0].tools], [1, 2]);
    // ‼️ `Cwd` is the COMMAND's folder, never the session's — reading it files
    // the run under the wrong agent (measured: a run in `ajanlar\basit` whose
    // every command says `D:\zone\agent`).
    eq('the call\'s Cwd is NOT adopted as the session\'s folder', d.cwd, '');
}

// ---------------------------------- a Claude transcript that is only `system`
{
    const file = path.join(root, '9490331f-4f01-4a86-a6a7-50f1a5ed8773.jsonl');
    fs.writeFileSync(file, [
        { type: 'queue-operation', operation: 'enqueue', timestamp: new Date(t0).toISOString(), sessionId: '9490331f' },
        { type: 'system', subtype: 'local_command', content: '<local-command-stdout>/login isn\'t available in this environment.</local-command-stdout>', timestamp: new Date(t0 + 30).toISOString() }
    ].map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8');

    const d = viewer.buildData(file, deps);
    eq('‼️ a slash command\'s own answer IS the conversation when it is all there is',
        d.messages.length, 1);
    eq('…drawn as a system line', d.messages[0].role, 'system');
    eq('…with the CLI\'s wrapper tags stripped',
        d.messages[0].text, '/login isn\'t available in this environment.');
}

// ------------------------------------------------------- the empty state text
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'sessionViewer.js'), 'utf8');
    ok('‼️ the empty state distinguishes "nothing here" from "nothing matches"',
        /function emptyStateHtml\(\)/.test(js) && /if \(DATA\.messageCount\) \{ return '<p class="muted">No messages match\.<\/p>'; \}/.test(js));
    ok('…and says which of the two kinds of nothing it is',
        /holds no conversation/.test(js) && /past the scan/.test(js));
    ok('…and points at the file rather than leaving the reader stuck',
        /Open raw JSONL/.test(js));
    ok('…on BOTH the first paint and the filter repaint',
        (js.match(/emptyStateHtml\(\)/g) || []).length >= 3);
    ok('and the filter\'s own message is no longer hard-coded at those two sites',
        !/listHtml\(visible\) \|\| '<p class="muted">No messages match/.test(js)
        && !/listHtml\(visibleMsgs\(\)\) \|\| '<p class="muted">No messages match/.test(js));
}

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp */ }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
