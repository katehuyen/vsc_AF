// X-35 — WHICH SESSION IS THIS? asked once, and answered for every engine.
//
// ‼️ THE DEFECT THIS CLOSES. The same three-line lookup was written out at a
// dozen call sites — `index.all().find(s => s.sessionId === id)` — and every
// one of them was therefore CLAUDE-ONLY. Each failed differently and quietly on
// a foreign session:
//
//   * the Console resumed a Codex thread with no carried usage, so the first
//     turn back was charged with the whole conversation (F-03);
//   * the live rows lost their title, tokens and turn count, and printed 0 for
//     "not found" — measured on a live Codex session with 186 tool calls whose
//     own transcript said 137 779 tokens (F-04);
//   * the Session Viewer lost the owning agent and the launcher (F-05).
//
// And the other direction was worse, because it looked like a resolver:
// `path.basename(file).replace(/\.jsonl$/, '')` is the session id ONLY on
// Claude. Codex writes `rollout-2026-08-12T…-<uuid>.jsonl` and Gemini
// `session-1.json`, both stating the real id INSIDE the file — so every map
// keyed on a basename simply never matched (F-13, F-18).
//
// These tests drive the real `SessionIndex`, not a regex over its source.
const Module = require('module');
const path = require('path');
const os = require('os');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: () => Promise.resolve(undefined) },
    Disposable: class { dispose() { } }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
const { SessionIndex, sessionHeadless } = require(path.resolve(__dirname, '../out/core/sessions.js'));
const { PricingEngine } = require(path.resolve(__dirname, '../out/core/pricing.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const index = new SessionIndex(
    path.join(os.tmpdir(), 'af-identity-no-claude-dir'),
    // `includeUnmatched: true` — the farm's own scope switch, so a session in a
    // folder that is not an agent's is still a row. Without it the two rows
    // below with no agent would be filtered out before the resolver ever ran.
    () => [], new PricingEngine([]), () => [], () => true, () => 150000);

// Three foreign sessions whose FILENAMES are nothing like their ids — which is
// the normal case on two of the three engines.
const external = [
    {
        file: 'D:/rollouts/rollout-2026-08-12T14-03-51-019fe859.jsonl',
        sessionId: '019fe859-aaaa-bbbb-cccc-000000000001',
        source: 'codex', cwd: 'D:/repo', title: 'rewrite the rollout parser', autoTitle: 'rewrite the rollout parser',
        agentId: 'dev', agentName: 'developer',
        userTurns: 4, usage: {}, isSidechain: false, firstTs: 1, lastTs: 2,
        mtime: 2, models: [], wTokens: 0, cost: 0, assistantMsgs: 0, toolCalls: 186,
        tools: {}, skillCalls: {}, memoryReads: {}, filesEdited: {}, errors: 0,
        daily: {}, heat: [], events: [], recentMsgs: [], turns: []
    },
    {
        file: 'C:/Users/x/.gemini/tmp/9f2/chats/session-1.json',
        sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        source: 'gemini', cwd: 'D:/repo2', title: 'summarise the notes', autoTitle: 'summarise the notes',
        userTurns: 1, usage: {}, isSidechain: false, firstTs: 1, lastTs: 3,
        mtime: 3, models: [], wTokens: 0, cost: 0, assistantMsgs: 0, toolCalls: 0,
        tools: {}, skillCalls: {}, memoryReads: {}, filesEdited: {}, errors: 0,
        daily: {}, heat: [], events: [], recentMsgs: [], turns: []
    },
    {
        // Antigravity keeps no readable transcript at all — an EMPTY file on
        // purpose, and a resolver must not fall over it.
        file: '',
        sessionId: 'agy-0001',
        source: 'agy', cwd: 'D:/repo3', title: 'plan the release', autoTitle: 'plan the release',
        userTurns: 2, usage: {}, isSidechain: false, firstTs: 1, lastTs: 4,
        mtime: 4, models: [], wTokens: 0, cost: 0, assistantMsgs: 0, toolCalls: 0,
        tools: {}, skillCalls: {}, memoryReads: {}, filesEdited: {}, errors: 0,
        daily: {}, heat: [], events: [], recentMsgs: [], turns: []
    }
];
index.setExternal(external);
// ‼️ The launcher map is the REAL mechanism (publishLaunchers → setLaunchers)
// and it is keyed by SESSION ID — which is exactly what the basename trick got
// wrong for two engines out of four, so every automated Codex/Gemini run showed
// 🧑 User as its origin.
index.setLaunchers({
    '019fe859-aaaa-bbbb-cccc-000000000001': { kind: 'schedule', label: 'nightly sweep' }
});

// ---------------------------------------------------------------------------
// byId — the record question, answered across every engine
// ---------------------------------------------------------------------------
{
    ok('‼️ a Codex session is found by its REAL id',
        index.byId('019fe859-aaaa-bbbb-cccc-000000000001')?.source === 'codex');
    ok('‼️ a Gemini session too — its file is called `session-1.json`',
        index.byId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')?.title === 'summarise the notes');
    ok('…and an Antigravity row with no transcript file at all',
        index.byId('agy-0001')?.source === 'agy');
    ok('the row carries what the live table used to zero: turns, tool calls, owner',
        (() => {
            const r = index.byId('019fe859-aaaa-bbbb-cccc-000000000001');
            return r.userTurns === 4 && r.toolCalls === 186 && r.agentName === 'developer';
        })());
    ok('…and the launcher, so an automated foreign run is not reported as 🧑 User',
        index.byId('019fe859-aaaa-bbbb-cccc-000000000001').launchedBy.kind === 'schedule');
    ok('‼️ an automated foreign run with no entrypoint is correctly recognized as headless',
        sessionHeadless(index.byId('019fe859-aaaa-bbbb-cccc-000000000001')) === true);
    ok('…while an interactive automated run is NOT headless',
        sessionHeadless({ ...index.byId('019fe859-aaaa-bbbb-cccc-000000000001'), launchedBy: { kind: 'task', label: 'manual', mode: 'interactive' } }) === false);
    ok('an unknown id is undefined, not a throw and not a wrong row',
        index.byId('nope') === undefined
        && index.byId('') === undefined && index.byId(undefined) === undefined);
    ok('‼️ the FILENAME is not accepted as an id — that is the confusion, not the fix',
        index.byId('rollout-2026-08-12T14-03-51-019fe859') === undefined
        && index.byId('session-1') === undefined);
}

// ---------------------------------------------------------------------------
// byFile — the other direction, which is what the launcher map needed
// ---------------------------------------------------------------------------
{
    const f = 'D:/rollouts/rollout-2026-08-12T14-03-51-019fe859.jsonl';
    ok('‼️ a transcript path resolves to the session INSIDE it',
        index.byFile(f)?.sessionId === '019fe859-aaaa-bbbb-cccc-000000000001');
    ok('…which is exactly what the basename would have got wrong',
        path.basename(f, '.jsonl') !== index.byFile(f).sessionId);
    ok('a Gemini chat file too',
        index.byFile('C:/Users/x/.gemini/tmp/9f2/chats/session-1.json')?.source === 'gemini');
    ok('an unknown or empty path is undefined rather than a lucky match',
        index.byFile('D:/nope.jsonl') === undefined
        && index.byFile('') === undefined && index.byFile(undefined) === undefined);
}

// ---------------------------------------------------------------------------
// …and the SPLIT the two pools exist for is still intact
// ---------------------------------------------------------------------------
//
// ‼️ Widening the RECORD side must not widen the MEASUREMENT side. Claude's
// cost, quality and health analytics run on `all()` precisely so a foreign
// session — whose dollars are derived, not quoted — can never be averaged into
// them. If this ever goes green the other way, the fix has gone too far.
{
    ok('all() is still Claude-only', index.all().length === 0);
    ok('forAgent() is still Claude-only', index.forAgent('dev').length === 0);
    ok('allWithExternal() is the record pool, and holds all three',
        index.allWithExternal().length === 3);
    ok('forAgentWithExternal() widens the same way for one agent',
        index.forAgentWithExternal('dev').length === 1);
    ok('external() still isolates the side list', index.external().length === 3);
}

index.dispose();
Module._load = origLoad;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
