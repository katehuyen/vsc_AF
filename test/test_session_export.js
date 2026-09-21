// B-21 — core/sessionExport: the session page's Export MD, built where an op
// can build it.
//
// The document used to be assembled inside the webview out of the page's view
// state, and the host only filed it — reachable from one button and from
// nowhere else. The page still decides WHAT (it sends its view); the bytes are
// made here, for the button and for sessions.export alike.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { buildSessionMarkdown, normalizeExportRoles, fmtTokWText } =
    require(path.join(__dirname, '..', 'out', 'core', 'sessionExport.js'));

const T0 = Date.parse('2026-08-14T12:00:00Z');
const data = () => ({
    title: 'Fix the parser', sessionId: 'abcd1234-5678-90ab-cdef-000000000000', cwd: 'D:/work/repo',
    firstTs: T0, lastTs: T0 + 90000, totalTokens: 4600000, totalWTokens: 600000, cost: 1.234,
    turnCount: 3, toolCalls: 1, identity: { billing: { mark: 'off-plan' } },
    turns: [
        { n: 1, label: 'read the code', models: ['claude-opus-5'], attrs: { effort: 'high' } },
        { n: 2, label: 'patch it', models: ['claude-opus-5'] },
        { n: 3, label: 'sum up', models: ['claude-haiku-4-5'] }
    ],
    turnTotals: { 1: { tokens: 1200, wTokens: 300, cost: 0.5 }, 2: { tokens: 800, cost: 0.2 }, 3: {} },
    messages: [
        { turn: 1, turnStart: true, role: 'user', ts: T0, text: 'please fix the parser' },
        { turn: 1, role: 'assistant', ts: T0 + 1000, text: 'looking', model: 'claude-opus-5', kind: 'say', tokens: 1200, wTokens: 300, cost: 0.5 },
        { turn: 1, role: 'tool', ts: T0 + 2000, tool: 'Read', input: '{"file":"a|b.ts"}', kind: 'local' },
        { turn: 1, role: 'toolResult', ts: T0 + 3000, text: 'const x = ```y```;', kind: 'result', isError: true },
        { turn: 2, turnStart: true, role: 'user', ts: T0 + 60000, text: 'now patch it' },
        { turn: 2, role: 'assistant', ts: T0 + 61000, text: 'patched', model: 'claude-opus-5', kind: 'say', tokens: 800, cost: 0.2 },
        { turn: 3, turnStart: true, role: 'user', ts: T0 + 80000, text: 'summarise', sidechain: true },
        { turn: 3, role: 'assistant', ts: T0 + 81000, text: 'done', model: 'claude-haiku-4-5', sidechain: true }
    ]
});

// ---------- the header ----------
{
    const md = buildSessionMarkdown(data(), { view: false });
    const lines = md.split('\n');
    ok('the title is the heading', lines[0] === '# Fix the parser');
    ok('the session id and folder are stated', md.includes('- Session: `abcd1234-5678-90ab-cdef-000000000000`')
        && md.includes('- Folder: `D:/work/repo`'));
    ok('the span is two full stamps', /^- Span: .+ → .+$/m.test(md));
    ok('the totals carry the ⚖ figure with its mark, the money and the counts',
        md.includes('- Total: 4.6M (⚖ 600.0k, off-plan) tok · $1.23 · 3 turns · 1 tool calls'));
    ok('"everything" says so and counts the messages',
        md.includes('- Export: everything — the full transcript (8 messages), ignoring the on-screen filters and folding'));
}

// ---------- the body ----------
{
    const md = buildSessionMarkdown(data(), { view: false });
    ok('a turn heading names its number, label, model tags and totals',
        md.includes('## Turn 1/3 — read the code · opus-5 · high · 1.2k (⚖ 300, off-plan) tok · $0.500'));
    ok('a turn with no totals gets only its tags', md.includes('## Turn 3/3 — sum up · haiku-4-5\n'));
    ok('a user step is USER', md.includes('**USER** (▸'.slice(0, 8)) && /\*\*USER\*\* \(\d{2}:\d{2}/.test(md));
    ok('an assistant step is named by the speaker settings (page-upper default)',
        /\*\*CLAUDE\*\* \(▸ reply · .*opus-5 · 1\.2k \(⚖ 300, off-plan\) tok · \$0\.500\)/.test(md));
    ok('a tool call is fenced as json and names the tool',
        md.includes('**TOOL CALL — Read** (⌘ local tool') && md.includes('```json\n{"file":"a|b.ts"}\n```'));
    ok('a result containing ``` gets a longer fence, and an error is marked',
        md.includes('**TOOL RESULT** (↩ tool result') && md.includes('⚠ ERROR') && md.includes('````\nconst x = ```y```;\n````'));
    ok('a sidechain step is a delegation lane: DELEGATOR and HANDLER, marked subagent',
        md.includes('**DELEGATOR** (') && md.includes('**HANDLER** (') && md.includes('subagent'));
    ok('the document ends with a newline', md.endsWith('\n'));
}

// ---------- the view ----------
{
    const d = data();
    const dialog = buildSessionMarkdown(d, { view: true, roles: ['user', 'assistant'] });
    ok('roles narrow the steps and the Export line says so',
        !dialog.includes('TOOL CALL') && dialog.includes('- Export: current view · show: user, assistant · 6 of 8 messages'));
    const filtered = buildSessionMarkdown(d, { view: true, filter: 'patch' });
    ok('the text filter is the shared query grammar, matched on text, tool and input',
        filtered.includes('now patch it') && filtered.includes('patched') && !filtered.includes('please fix')
        && filtered.includes('text filter: "patch"'));
    const excl = buildSessionMarkdown(d, { view: true, excludeTurns: [1, 3] });
    ok('excluded turns are left out and listed',
        !excl.includes('## Turn 1/') && excl.includes('## Turn 2/') && !excl.includes('## Turn 3/')
        && excl.includes('excluded turns: 1, 3'));
    const foldedOut = buildSessionMarkdown(d, { view: true, foldedTurns: [2] });
    ok('a folded turn is omitted by default', !foldedOut.includes('## Turn 2/') && foldedOut.includes('1 folded turn(s) omitted'));
    const foldedTitle = buildSessionMarkdown(d, { view: true, foldedTurns: [2], foldedTitles: true });
    ok('…or kept as its heading only', foldedTitle.includes('## Turn 2/3 — patch it') && !foldedTitle.includes('patched')
        && foldedTitle.includes('1 folded turn(s): titles only'));
    const replay = buildSessionMarkdown(d, { view: true, replayPos: 1 });
    ok('a replay position cuts the visible list after that step',
        replay.includes('please fix the parser') && replay.includes('looking') && !replay.includes('now patch it')
        && replay.includes('replay position: 2/8'));
    const lane = buildSessionMarkdown({ ...d, lane: true, agentName: 'manager' }, { view: false });
    ok('a whole-lane transcript names the delegator by its agent',
        lane.includes('**DELEGATOR (manager)**') && !lane.includes('**USER**'));
    const lower = buildSessionMarkdown(d, { view: false, speaker: { casing: 'lower', template: '{ai} {version}' } });
    ok('the speaker settings are honoured, as on the page', /\*\*claude 5\*\*/.test(lower));
}

// ---------- roles, as an agent says them ----------
{
    ok('array or comma-separated, with the two synonyms',
        normalizeExportRoles(['agent', 'result']).join() === 'assistant,toolResult'
        && normalizeExportRoles('user, tool').join() === 'user,tool');
    ok('"all" means every role', normalizeExportRoles('user,all').length === 0);
    ok('an unknown role is dropped rather than matching nothing', normalizeExportRoles(['nope']).length === 0);
    ok('⚖ text twin: raw alone without a weight, both with', fmtTokWText(1500, 0, '') === '1.5k'
        && fmtTokWText(1500, 400, '') === '1.5k (⚖ 400)' && fmtTokWText(1500, 400, 'x') === '1.5k (⚖ 400, x)');
}

// ---------- ‼️ end to end: a real transcript, through the page's own parse ----------
// The builder reads the shape buildData produces (turn, turnStart, kind, the
// per-turn totals); a fixture written by hand proves only that the fixture and
// the builder agree with each other.
{
    const os = require('os');
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
        }
        return origLoad.apply(this, arguments);
    };
    const viewer = require(path.join(__dirname, '..', 'out', 'panels', 'sessionViewer.js'));
    Module._load = origLoad;

    const T = (s) => `2026-07-15T10:0${s}:00.000Z`;
    const file = path.join(os.tmpdir(), `af-session-export-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    fs.writeFileSync(file, [
        { type: 'user', timestamp: T(1), sessionId: 'feed1234-0000-0000-0000-000000000000', cwd: 'D:/w', message: { content: 'ask one' } },
        { type: 'assistant', timestamp: T(1), message: { id: 'a1', model: 'claude-opus-5', content: [{ type: 'text', text: 'answer one' }], usage: { input_tokens: 10, output_tokens: 5 } } },
        { type: 'assistant', timestamp: T(1), message: { id: 'a2', model: 'claude-opus-5', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }], usage: { input_tokens: 10, output_tokens: 5 } } },
        { type: 'user', timestamp: T(2), message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a.txt' }] } },
        { type: 'user', timestamp: T(3), message: { content: 'ask two' } },
        { type: 'assistant', timestamp: T(3), message: { id: 'a3', model: 'claude-opus-5', content: [{ type: 'text', text: 'answer two' }], usage: { input_tokens: 10, output_tokens: 5 } } }
    ].map(l => JSON.stringify(l)).join('\n'));
    try {
        const d = viewer.buildData(file, {
            extensionUri: {}, getPricing: () => ({ costFor: () => 0.1 }),
            maxMessages: () => Number.MAX_SAFE_INTEGER, contextLimitFor: () => 0
        });
        const all = buildSessionMarkdown(d, { view: false });
        ok('a parsed transcript exports every turn under its heading',
            all.includes('## Turn 1/2') && all.includes('## Turn 2/2') && all.includes('answer one') && all.includes('answer two'));
        ok('…the tool call and its result are fenced, with the shared step kinds',
            /\*\*TOOL CALL — Bash\*\* \(⌘ local tool/.test(all) && /\*\*TOOL RESULT\*\* \(↩ tool result/.test(all)
            && all.includes('```json') && all.includes('a.txt'));
        ok('…and the speaker is named as the page names it', all.includes('**USER**') && all.includes('**CLAUDE**'));
        const dialog = buildSessionMarkdown(d, { view: true, roles: ['user', 'assistant'], excludeTurns: [2] });
        ok('the same parse narrows to the page\'s default dialog view minus a turn',
            !dialog.includes('TOOL CALL') && dialog.includes('answer one') && !dialog.includes('answer two')
            && dialog.includes('show: user, assistant · excluded turns: 2'));
    } finally {
        fs.unlinkSync(file);
    }
}

// ---------- the wiring this module exists for ----------
{
    const ROOT = path.join(__dirname, '..');
    const page = fs.readFileSync(path.join(ROOT, 'media', 'sessionViewer.js'), 'utf8');
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'sessionViewer.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

    ok('the page sends its VIEW with the click, never a document',
        /type: 'exportChoose', hasFolded: collapsed\.size > 0, view: exportView\(\)/.test(page)
        && !/function exportMarkdown/.test(page) && !/type: 'exportMd'/.test(page));
    ok('…and the view is the five things the screen decides',
        /roles: \[\.\.\.roleSel\]/.test(page) && /excludeTurns: \[\.\.\.exportOff\]/.test(page)
        && /foldedTurns: \[\.\.\.collapsed\]/.test(page) && /replayPos: replay\.active \? replay\.pos : null/.test(page));
    ok('the host builds with buildSessionMarkdown from the page\'s own data',
        /buildSessionMarkdown\(this\.viewData\(\), \{/.test(panel) && !/case 'exportMd'/.test(panel));
    ok('…with the reader\'s speaker settings, from the one place the page gets them',
        /speaker: speakerSettings\(\)/.test(panel));
    const at = ext.indexOf("op: 'sessions.export'");
    const block = ext.slice(at, ext.indexOf("op: 'sessions.whoami'", at));
    ok('sessions.export is registered', at > 0);
    ok('‼️ it builds with the same function, from the same parse, with every step',
        /buildSessionMarkdown\(data, \{/.test(block) && /buildViewerData\(s\.file/.test(block)
        && /maxMessages: \(\) => Number\.MAX_SAFE_INTEGER/.test(block));
    ok('…and delivers through the one export contract',
        /deliverDocument\(args, md,/.test(block) && /speaker: speakerSettings\(\)/.test(block));
    ok('…where `file` is the destination, so the transcript is named by session or id only',
        !/optStr\(args, 'file'\)/.test(block));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
