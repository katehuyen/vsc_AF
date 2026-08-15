// S-33 — an OpenCode conversation as a sessions ROW and as a VIEWER document.
//
// The fixture is the real export of this machine's `ses_ffae93e06ffe3OOx0X42HLDzT2`
// (opencode 1.18.18, 2026-08-15) plus the tool part measured on
// `ses_ffae85422ffev4asDVFfc6QHCX`, which is the only measured conversation that
// ran tools.
//
// ‼️ WHY THE SOURCE READS A FOLDER AND NOT THE CLI. `SessionSource.scan()` runs
// on every repaint; OpenCode's history is only reachable by spawning. The
// harvester writes each export into a cache directory on its own slow clock and
// this reads that directory — so what is tested here is a file-based source,
// exactly like the Codex and Gemini ones, and the spawning is tested apart.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// `sessions.ts` reaches for `vscode`, which does not exist outside the host —
// the same stub every other transcript test installs.
class Emitter {
    constructor() { this.handlers = []; }
    get event() { return fn => { this.handlers.push(fn); return { dispose() {} }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() {}
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

const T = require(path.join(__dirname, '..', 'out', 'core', 'cliTranscripts.js'));
const V = require(path.join(__dirname, '..', 'out', 'core', 'cliViewer.js'));
const { PricingEngine } = require(path.join(__dirname, '..', 'out', 'core', 'pricing.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const DIR = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm';
const SES = 'ses_ffae93e06ffe3OOx0X42HLDzT2';
const pricing = () => new PricingEngine([]);

const spend = (total, input, output, reasoning, read) =>
    ({ total, input, output, reasoning, cache: { write: 0, read } });

const EXPORT = {
    info: {
        id: SES, projectID: '52088de5', directory: DIR, title: 'NONCE değeri yazma',
        agent: 'build', model: { id: 'big-pickle', providerID: 'opencode' }, version: '1.18.18',
        cost: 0, tokens: { input: 6232, output: 26, reasoning: 63, cache: { read: 10112, write: 0 } },
        time: { created: 1786791772666, updated: 1786791781550 }
    },
    messages: [
        {
            info: { role: 'user', time: { created: 1786791772767 }, agent: 'build', id: 'msg_1' },
            parts: [{ type: 'text', text: 'Sadece şunu yaz: NONCE=af-msu9oo6n', id: 'p1' }]
        },
        {
            info: {
                role: 'assistant', agent: 'build', cost: 0, tokens: spend(8192, 6196, 13, 63, 1920),
                modelID: 'big-pickle', providerID: 'opencode', finish: 'stop',
                time: { created: 1786791772817, completed: 1786791778453 }, id: 'msg_2'
            },
            parts: [
                { type: 'step-start', id: 'p2' },
                { type: 'reasoning', text: 'The user wants only the nonce.', time: { start: 1786791777208, end: 1786791777601 }, id: 'p3' },
                {
                    type: 'tool', tool: 'glob', callID: 'call-1',
                    state: {
                        status: 'completed', input: { pattern: '**/package.json' },
                        output: DIR + '\\package.json', time: { start: 1786791777300, end: 1786791777400 }
                    },
                    id: 'p4'
                },
                { type: 'text', text: 'NONCE=af-msu9oo6n', time: { start: 1786791777606, end: 1786791777649 }, id: 'p5' },
                { type: 'step-finish', reason: 'stop', tokens: spend(8192, 6196, 13, 63, 1920), cost: 0, id: 'p6' }
            ]
        },
        {
            info: { role: 'user', time: { created: 1786791778567 }, agent: 'build', id: 'msg_3' },
            parts: [{ type: 'text', text: 'Az önce yazdığın NONCE değerini tekrar yaz.', id: 'p7' }]
        },
        {
            info: {
                role: 'assistant', agent: 'build', cost: 0, tokens: spend(8241, 36, 13, 0, 8192),
                modelID: 'big-pickle', providerID: 'opencode', finish: 'stop',
                time: { created: 1786791778599, completed: 1786791781540 }, id: 'msg_4'
            },
            parts: [
                { type: 'step-start', id: 'p8' },
                { type: 'text', text: 'NONCE=af-msu9oo6n', time: { start: 1786791780677, end: 1786791780752 }, id: 'p9' },
                { type: 'step-finish', reason: 'stop', tokens: spend(8241, 36, 13, 0, 8192), cost: 0, id: 'p10' }
            ]
        }
    ]
};

// ---------- the sessions row ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-opencode-'));
try {
    fs.writeFileSync(path.join(dir, SES + '.json'), JSON.stringify(EXPORT), 'utf8');
    // …and two files that belong to nobody here: a corrupt one and a Codex
    // rollout. Neither may become a row, and neither may take the source down.
    fs.writeFileSync(path.join(dir, 'ses_ffae7722affes1Qn18uy3uqmYH.json'), '{"info":{"id":', 'utf8');
    fs.writeFileSync(path.join(dir, 'rollout-2026.json'),
        JSON.stringify({ info: { id: 'rollout-2026' }, messages: [] }), 'utf8');

    const source = T.opencodeSessionsSource(
        () => dir,
        cwd => cwd === DIR ? { agentId: 'dev', agentName: 'developer' } : {},
        pricing, 0);
    const rows = source.scan();
    ok('one export, one row — and the two files that are not exports are not rows',
        rows.length === 1 && rows[0].sessionId === SES);
    const r = rows[0];
    ok('the row wears this engine\'s id, so every surface can name it', r.source === 'opencode');
    ok('‼️ `file` points at OUR cached copy — the engine leaves no transcript',
        r.file === path.join(dir, SES + '.json'));
    ok('the conversation\'s own folder is the attribution, exactly as for every other engine',
        r.agentId === 'dev' && r.agentName === 'developer' && r.cwd === DIR);
    ok('the times are the engine\'s, not the file\'s',
        r.firstTs === 1786791772666 && r.lastTs === 1786791781550);
    ok('‼️ reasoning is added to OUTPUT — it is not inside it on this engine',
        r.usage.output === 26 + 63 && r.usage.input === 6232 && r.usage.cacheRead === 10112);
    ok('‼️ the cost is the engine\'s own figure — 0 on a free model is a REAL zero, not a missing rule',
        r.cost === 0);
    ok('two prompts, two answers', r.userTurns === 2 && r.assistantMsgs === 2);
    ok('the tool call is counted and named', r.toolCalls === 1 && r.tools.glob === 1);
    ok('nothing failed, so nothing is reported as an error', r.errors === 0);
    ok('‼️ the Ctx cell is the LAST call\'s own total (8241), not the conversation\'s running sum',
        r.lastCtxTokens === 8241);
    ok('the title is the engine\'s, not a placeholder', r.title === 'NONCE değeri yazma');
    ok('the model reaches the row', r.models.length === 1 && r.models[0] === 'big-pickle');

    // …and the placeholder title falls back to the first prompt
    const other = 'ses_ffae7344fffeoXeFqarl3jq8eB';
    fs.writeFileSync(path.join(dir, other + '.json'), JSON.stringify({
        ...EXPORT, info: { ...EXPORT.info, id: other, title: 'New session - 2026-08-15T11:05:06.224Z' }
    }), 'utf8');
    const again = T.opencodeSessionsSource(() => dir, () => ({}), pricing, 0).scan();
    const placeholder = again.find(s => s.sessionId === other);
    ok('‼️ a `New session - <ISO>` title is a placeholder — the row shows the first prompt instead',
        !!placeholder && /NONCE/.test(placeholder.title));

    ok('a directory that is not there is no rows, not a throw',
        T.opencodeSessionsSource(() => path.join(dir, 'nope'), () => ({}), pricing, 0).scan().length === 0);
} finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* leave it */ }
}

// ---------- the viewer document ----------
{
    const raw = JSON.stringify(EXPORT);
    const p = V.parseCliViewer(raw, 'x.json', pricing());
    ok('the viewer recognises an OpenCode export', !!p && p.engine === 'opencode');
    ok('both turns are turns', p.turnCount === 2);
    ok('the first turn opens with what the user actually typed',
        /Sadece şunu yaz/.test(p.turns[0].prompt));
    ok('‼️ the second turn costs its OWN 8241, not a delta against a total that went down',
        p.turns[1].tokens === 8241 && p.turns[0].tokens === 8192);
    ok('…and the ctx after each turn is that turn\'s own total',
        p.turns[0].endCtx === 8192 && p.turns[1].endCtx === 8241);
    ok('the thinking is counted as thinking', p.turns[0].thinking === 1);
    ok('‼️ …AND DRAWN — the export carries the model\'s own words, unlike a Codex rollout',
        p.messages.some(m => m.role === 'assistant' && m.kind === 'think'
            && /only the nonce/.test(m.text)));
    ok('the tool call is a row with its arguments', p.messages.some(m =>
        m.role === 'tool' && m.tool === 'glob' && /package\.json/.test(m.input)));
    ok('…and its result is the row under it', p.messages.some(m =>
        m.role === 'toolResult' && /package\.json/.test(m.text)));
    ok('every turn is named on its rows, which is what the turn table walks',
        p.messages.filter(m => m.turnStart).length === 2);
    ok('the engine\'s own dollars are the total — no pricing rule was applied', p.cost === 0);
    ok('the usage is the sum of the two turns, with reasoning in output',
        p.usage.input === 6196 + 36 && p.usage.output === 13 + 63 + 13);
    ok('the session\'s ctx is where it ended', p.context.tokens === 8241);
    ok('the mode the conversation ran in is carried, under the engine\'s own word',
        p.permissionMode === 'build');
    ok('one tool call, no errors', p.toolCalls === 1 && p.errors === 0);
}

// ---------- and it does not steal a file that is not its own ----------
{
    const console_ = JSON.stringify({
        format: 'agent-farm-console-v1', engine: 'agy', sessionId: 'c1',
        messages: [{ id: 'm1', ts: 1, role: 'user', text: 'hi' }],
        agentId: '', agentName: '', cwd: '', model: '', effort: '', permissionMode: '',
        startedAt: 1, lastTs: 1, cost: 0, tokens: 0, wTokens: 0, turns: 1, contextTokens: 0
    });
    ok('‼️ the Console\'s own snapshot still goes to its own reader',
        V.parseCliViewer(console_, 'c.json', pricing()).engine === 'agy');
    ok('a corrupt document is nothing, not a crash',
        V.parseCliViewer('{"info":{"id":', 'x.json', pricing()) === undefined);
}

// ---------- a turn the engine cut says so ----------
{
    const cut = JSON.parse(JSON.stringify(EXPORT));
    cut.messages[1].info.finish = 'cancelled';
    const p = V.parseCliViewer(JSON.stringify(cut), 'x.json', pricing());
    ok('‼️ a cancelled turn is marked — otherwise a cut answer and a short one look identical',
        p.messages.some(m => m.role === 'system' && /cancelled/.test(m.text)));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
