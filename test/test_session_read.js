// B-24: sessions.read — WHAT A SESSION SAID, THE SAME SHAPE FOR EVERY ENGINE.
//
// The failure this exists for (2026-09-17): an agent opened a Console snapshot
// itself, filtered for Claude's `assistant`, got nothing back — the snapshot
// calls the reply `agent` — and reported an empty conversation that was full.
// So the op must (1) read through the transcript page's OWN parse, never a
// second reader, (2) answer in one vocabulary, (3) never guess which session
// a reference means, and (4) page honestly.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const R = require(path.resolve(__dirname, '../out/core/sessionRead.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const steps = [
    { role: 'user', ts: 1, turn: 1, text: 'first prompt' },
    { role: 'assistant', ts: 2, turn: 1, text: 'first answer', model: 'm1' },
    { role: 'tool', ts: 3, turn: 1, tool: 'Bash', input: 'npm test' },
    { role: 'toolResult', ts: 4, turn: 1, text: 'ok', isError: true },
    { role: 'assistant', ts: 5, turn: 1, text: 'sub', sidechain: true },
    { role: 'user', ts: 6, turn: 2, text: 'second prompt' },
    { role: 'assistant', ts: 7, turn: 2, text: 'x'.repeat(5000) },
    { role: 'system', ts: 8, turn: 2, text: 'compacted' }
];

// ---- roles ------------------------------------------------------------------
{
    const p = R.readTranscriptPage(steps);
    ok('the default is the conversation itself: user and assistant',
        p.roles.join() === 'user,assistant' && p.messages.every(m => m.role === 'user' || m.role === 'assistant'));
    ok('…without subagent steps unless asked', !p.messages.some(m => m.text === 'sub') && p.total === 4);
    ok('sidechain:true brings them back', R.readTranscriptPage(steps, { sidechain: true }).total === 5);
    ok('"all" is every role', R.readTranscriptPage(steps, { roles: 'all' }).total === 7);
    ok('a comma list and an array say the same thing',
        R.readTranscriptPage(steps, { roles: 'tool, toolResult' }).total === 2
        && R.readTranscriptPage(steps, { roles: ['tool', 'toolResult'] }).total === 2);
    ok('‼️ an engine\'s own words are accepted on the way in — agent → assistant, result → toolResult',
        R.readTranscriptPage(steps, { roles: 'agent' }).total === 2
        && R.readTranscriptPage(steps, { roles: 'result' }).messages[0].role === 'toolResult');
    const bad = R.readTranscriptPage(steps, { roles: 'user,bogus' });
    ok('‼️ an unknown role is an error, never a silently narrower page',
        'error' in bad && /bogus/.test(bad.error));
}

// ---- turns, paging, clipping ---------------------------------------------------
{
    const t2 = R.readTranscriptPage(steps, { turn: 2 });
    ok('turn narrows to one turn', t2.total === 2 && t2.messages.every(m => m.turn === 2));
    ok('turns counts the whole transcript, not the page', t2.turns === 2);

    const p1 = R.readTranscriptPage(steps, { limit: 2 });
    ok('a page says where the next one starts', p1.returned === 2 && p1.from === 1 && p1.next === 3);
    const p2 = R.readTranscriptPage(steps, { limit: 2, from: p1.next });
    ok('…and the last page says there is none', p2.returned === 2 && p2.next === null);
    ok('i counts in the filtered list, so from and next line up',
        p1.messages.map(m => m.i).join() === '1,2' && p2.messages.map(m => m.i).join() === '3,4');
    const tail = R.readTranscriptPage(steps, { from: -1 });
    ok('a negative from counts from the end', tail.returned === 1 && tail.messages[0].text.startsWith('xxx'));
    ok('a from past the end is an empty page, not an error',
        R.readTranscriptPage(steps, { from: 99 }).returned === 0);
    ok('limit is capped', R.readTranscriptPage(steps, { limit: 99999 }).returned === 4
        && R.READ_LIMIT_MAX === 500);

    const long = R.readTranscriptPage(steps, { turn: 2, roles: 'assistant' });
    ok('long text is cut at the default and the step says how long it was',
        long.messages[0].text.length === R.READ_MAX_CHARS_DEFAULT && long.messages[0].clipped === 5000
        && long.clipped === 1);
    const whole = R.readTranscriptPage(steps, { turn: 2, roles: 'assistant', maxChars: 0 });
    ok('maxChars 0 is the whole text', whole.messages[0].text.length === 5000 && !whole.messages[0].clipped);
    const tool = R.readTranscriptPage(steps, { roles: 'tool,toolResult' }).messages;
    ok('tool steps keep their tool and input; errors are marked',
        tool[0].tool === 'Bash' && tool[0].input === 'npm test' && tool[1].isError === true);
    ok('no page from nothing', R.readTranscriptPage(undefined).total === 0);
}

// ---- which session a reference means -------------------------------------------
{
    const pool = [
        { sessionId: 'c07e36fa-34de-4266-a917-3327951a3b63', file: 'C:\\x\\c07e36fa.json' },
        { sessionId: '4355f60b-8949-419a-bdfd-5f0d73723a03', file: 'C:\\x\\4355f60b.jsonl' },
        { sessionId: '4355aaaa-0000-0000-0000-000000000000', file: 'C:\\x\\4355aaaa.jsonl' }
    ];
    ok('an exact id', R.resolveSessionRef(pool, 'C07E36FA-34de-4266-a917-3327951a3b63').by === 'id');
    const pre = R.resolveSessionRef(pool, 'c07e36fa');
    ok('the eight-character prefix every surface prints', pre.ok && pre.by === 'prefix'
        && pre.row.sessionId.startsWith('c07e36fa'));
    const amb = R.resolveSessionRef(pool, '4355');
    ok('‼️ a prefix that fits two sessions is refused with both ids — never a guess',
        !amb.ok && amb.candidates.length === 2 && /2 session ids/.test(amb.error));
    ok('the transcript path, whichever way its slashes lean',
        R.resolveSessionRef(pool, 'c:/x/4355f60b.jsonl').by === 'file');
    const none = R.resolveSessionRef(pool, 'deadbeef');
    ok('an unknown id says so and points at sessions.find', !none.ok && /sessions\.find/.test(none.error));
    ok('an empty reference says what to give', !R.resolveSessionRef(pool, ' ').ok);
}

// ---- ‼️ end to end: a Console snapshot read through the page's own parse ------
{
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, ViewColumn: {}, commands: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
        }
        return origLoad.apply(this, arguments);
    };
    const SV = require(path.resolve(__dirname, '../out/panels/sessionViewer.js'));
    Module._load = origLoad;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-session-read-'));
    try {
        const file = path.join(dir, 'c0ffee00-1111-2222-3333-444444444444.json');
        fs.writeFileSync(file, JSON.stringify({
            format: 'agent-farm-console-v1', engine: 'agy',
            sessionId: 'c0ffee00-1111-2222-3333-444444444444',
            cwd: dir, model: 'gemini', startedAt: 1000, lastTs: 4000,
            messages: [
                { id: 'a', ts: 1000, role: 'user', text: 'what is the plan' },
                { id: 'b', ts: 2000, role: 'tool', tool: 'read_file', kind: 'call' },
                { id: 'c', ts: 3000, role: 'result', text: 'file body' },
                { id: 'd', ts: 4000, role: 'agent', text: 'here is the plan' }
            ]
        }), 'utf8');
        const deps = {
            getPricing: () => ({}),
            maxMessages: () => Number.MAX_SAFE_INTEGER,
            contextLimitFor: () => 0
        };
        const data = SV.buildData(file, deps);
        const page = R.readTranscriptPage(data.messages);
        ok('‼️ the snapshot\'s "agent" reply comes back as assistant — the empty-read trap is closed',
            page.total === 2 && page.messages[1].role === 'assistant'
            && page.messages[1].text === 'here is the plan');
        ok('…and no engine word survives into the answer',
            R.readTranscriptPage(data.messages, { roles: 'all' }).messages
                .every(m => R.READ_ROLES.includes(m.role)));
        ok('the page\'s parse names the engine', data.engine === 'agy');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ---- the op is wired to the page's parse, not to a reader of its own ------------
{
    const src = fs.readFileSync(path.resolve(__dirname, '../src/extension.ts'), 'utf8');
    const at = src.indexOf("op: 'sessions.read'");
    const block = src.slice(at, src.indexOf("op: 'sessions.recent'", at));
    ok('sessions.read is registered', at > 0);
    ok('‼️ it reads through buildViewerData — one parse for the page and the agent',
        /buildViewerData\(s\.file/.test(block) && !/readFileSync/.test(block));
    ok('…with the page\'s message ceiling lifted, so paging reaches the start',
        /maxMessages: \(\) => Number\.MAX_SAFE_INTEGER/.test(block));
    ok('…and the reference is resolved strictly over every engine',
        /resolveSessionRef\(pool, ref\)/.test(block) && /index\.allWithExternal\(\)/.test(block));
    ok('numbers are read as numbers (optNum), never through optStr',
        !/Number\(optStr\(/.test(block) && /optNum\(args, 'from'/.test(block));
    ok('the describe says to use it instead of opening the file',
        /never open a transcript file to read it yourself/.test(block));
}

console.log(`test_session_read: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
