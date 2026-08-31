// U-127 — ONE COLUMN, ONE VOCABULARY.
//
// The Runs table's Sessions column is the string a reader matches against a
// Console card, a swim lane or a log line. On a Claude row it held a session id;
// on the Antigravity row directly under it, the literal word "transcript".
//
// The cause is not the engine, it is where each CLI puts the id. Claude names
// the FILE after the session (`<uuid>.jsonl`); Antigravity names the FOLDER
// (`…/brain/<uuid>/.system_generated/logs/transcript.jsonl`) and gives every
// conversation a file of the same name. Reading the basename is therefore right
// on one engine and reads out a constant on the other — and a constant is
// exactly what a column of identifiers must never contain.
//
// Both real shapes below were taken from this machine's own farm-tasks.json.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: { joinPath: () => ({}) }, ViewColumn: {}, env: {},
            ConfigurationTarget: { Global: 1 },
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } },
            window: {}, commands: {},
            workspace: {
                getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }),
                workspaceFolders: []
            }
        };
    }
    return origLoad.apply(this, arguments);
};

const { sessionIdOf } = require(path.resolve(__dirname, '../out/panels/tasksPanel.js'));

const CLAUDE = 'C:\\Users\\x\\.claude\\projects\\D--zone-agent-ajanlar-developer'
    + '\\bc384059-0f37-4430-a97e-96f1c9cd370a.jsonl';
const AGY = 'C:\\Users\\x\\.gemini\\antigravity-cli\\brain'
    + '\\18b148ce-12ae-4fc4-acac-eb45750457f4\\.system_generated\\logs\\transcript.jsonl';

// ------------------------------------------------------------ what was right
ok('Claude names the file after the session, and that is still the answer',
    sessionIdOf(CLAUDE) === 'bc384059-0f37-4430-a97e-96f1c9cd370a');
ok('…on posix separators too',
    sessionIdOf(CLAUDE.replace(/\\/g, '/')) === 'bc384059-0f37-4430-a97e-96f1c9cd370a');
ok('nothing matched is still nothing', sessionIdOf() === '' && sessionIdOf('') === '');

// ------------------------------------------------------------- ‼️ the defect
ok('‼️ U-127 — the Antigravity row says an ID, not the word "transcript"',
    sessionIdOf(AGY) === '18b148ce-12ae-4fc4-acac-eb45750457f4');
ok('…on posix separators too',
    sessionIdOf(AGY.replace(/\\/g, '/')) === '18b148ce-12ae-4fc4-acac-eb45750457f4');
ok('…and the id is in the same vocabulary as the Claude row (both full uuids)',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionIdOf(AGY))
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionIdOf(CLAUDE)));
// The store keeps paths portable; the id is a path SEGMENT either way, so the
// token in front of it changes nothing.
ok('…including the tokenized form the task store actually holds',
    sessionIdOf('${home}\\.gemini\\antigravity-cli\\brain'
        + '\\18b148ce-12ae-4fc4-acac-eb45750457f4\\.system_generated\\logs\\transcript.jsonl')
    === '18b148ce-12ae-4fc4-acac-eb45750457f4');

// ------------------------------------------------- ‼️ what must NOT be read
//
// The folder test is a full uuid because a looser one would start answering with
// directory names. Claude's project slug is the one that sits exactly where the
// Antigravity id does, so it is the one pinned here.
ok('‼️ a project folder is never mistaken for a session id',
    sessionIdOf('C:/Users/x/.claude/projects/D--code-added-cafe/rollout-x.log')
    !== 'D--code-added-cafe');
ok('…and a codex rollout is left exactly as it was — a name, not a guess',
    sessionIdOf('C:/Users/x/.codex/sessions/2026/08/31/rollout-2026-08-31T10-00-00.jsonl')
    === 'rollout-2026-08-31T10-00-00');
// Nearest first: a conversation living under another conversation's folder is
// its own, not its parent's.
ok('the folder that HOLDS the log is the one that names it',
    sessionIdOf('/brain/aaaaaaaa-1111-2222-3333-444444444444'
        + '/sub/bbbbbbbb-1111-2222-3333-444444444444/logs/transcript.jsonl')
    === 'bbbbbbbb-1111-2222-3333-444444444444');

Module._load = origLoad;
console.log(`test_run_session_id: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
