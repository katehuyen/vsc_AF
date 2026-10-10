'use strict';
// X-533 — a headless OpenCode run's session was filed as the user's own: origin
// user, headless false, and no manifest behind it. The run publishes its session id
// on its own stream (tasks.ts binds it into runSessionId the moment it is read), but
// the launch binding declared only the ids a run is TOLD, so the session fell to the
// clock-and-folder match — which two OpenCode runs in one folder and one minute make
// ambiguous, and an ambiguous match binds nothing.
const path = require('path');
const fs = require('fs');
const { runDeclaredSession } = require('../out/core/runDeclaredSession.js');
const { bindSession, applyBinding } = require('../out/core/launchBinding.js');
// sessions.js reaches vscode through its index, so its module needs the vscode stub
const { sessionOrigin, sessionHeadless } = (() => {
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') { return { Uri: {}, window: {}, commands: {}, env: {}, EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} } }; }
        return origLoad.apply(this, arguments);
    };
    const m = require('../out/core/sessions.js');
    Module._load = origLoad;
    return m;
})();

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');

ok('a headless OpenCode run declares the id it published', runDeclaredSession({ engine: 'opencode', mode: 'headless', runSessionId: 'ses_a' }) === 'ses_a');
ok('…and one with no mode stated is a headless run too', runDeclaredSession({ engine: 'opencode', runSessionId: 'ses_a' }) === 'ses_a');
ok('an interactive OpenCode run publishes nothing on a stream we read, so nothing is declared',
    runDeclaredSession({ engine: 'opencode', mode: 'interactive', runSessionId: 'ses_a' }) === undefined);
ok('‼️ Claude keeps exactly its three told ids, never a written-back match',
    runDeclaredSession({ engine: 'claude', mode: 'headless', runSessionId: 'x' }) === undefined
    && runDeclaredSession({ engine: 'claude', spawnSessionId: 's', runSessionId: 'x' }) === 's'
    && runDeclaredSession({ engine: 'claude', resumeSessionId: 'r', hostedSessionId: 'h', spawnSessionId: 's' }) === 'r'
    && runDeclaredSession({ engine: 'claude', hostedSessionId: 'h', spawnSessionId: 's' }) === 'h');
ok('a told id still outranks the published one', runDeclaredSession({ engine: 'opencode', resumeSessionId: 'r', runSessionId: 'ses_a' }) === 'r');

// the failure, end to end: three OpenCode runs in one folder in one minute
const T0 = 1_791_595_900_000;
const binding = (id, mode, sessionId) => ({
    taskId: id, agentId: 'developer', agentName: 'developer', kind: 'task', label: id, engine: 'opencode',
    cwd: 'D:/zone/agent/ajanlar/developer', startedAt: T0, endedAt: T0 + 60_000, mode,
    ...(sessionId ? { sessionId } : {}), launchId: 'L-' + id
});
const session = {
    sessionId: 'ses_edc8', source: 'opencode', cwd: 'D:/zone/agent/ajanlar/developer',
    firstTs: T0 + 2_000, lastTs: T0 + 30_000, agentId: 'developer'
};
const before = bindSession(session, [binding('head', 'headless'), binding('i1', 'interactive'), binding('i2', 'interactive')], T0 + 90_000);
ok('before: the headless run\'s session matched no single run', !before || !before.binding);
const declared = runDeclaredSession({ engine: 'opencode', mode: 'headless', runSessionId: 'ses_edc8' });
const hit = bindSession(session, [binding('head', 'headless', declared), binding('i1', 'interactive'), binding('i2', 'interactive')], T0 + 90_000);
ok('after: it is bound to its own run, by declaration', hit && hit.binding.taskId === 'head' && hit.proof === 'declared');
const info = applyBinding({ ...session }, hit);
ok('…so it is Auto and headless, and reaches its manifest', sessionOrigin(info) === 'auto' && sessionHeadless(info) === true && info.launchId === 'L-head');

const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
ok('the task bindings declare through this one rule', /sessionId: runDeclaredSession\(t\),/.test(ext)
    && !/sessionId: t\.resumeSessionId \|\| t\.hostedSessionId \|\| t\.spawnSessionId,/.test(ext));

console.log(`test_x533_run_binding: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
