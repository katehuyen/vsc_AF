// E2a: external-CLI session lifecycle — namespaced cli: ids, source derivation,
// SessionStart/SessionEnd flow, rebuild-after-reload, claude path untouched.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
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
const { LiveMonitor, cliSourceOf } = require(require('path').resolve(__dirname, '../out/core/live.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

// -- cliSourceOf: namespace parsing --
eq('cli id derived', cliSourceOf('cli:gemini:dev:123'), 'gemini');
eq('claude uuid → undefined', cliSourceOf('0a1b2c3d-e4f5'), undefined);
eq('bare cli: → undefined', cliSourceOf('cli:'), undefined);
eq('relay feed id untouched', cliSourceOf('laptop:0a1b2c3d'), undefined);

const cfg = {
    enabled: false, port: 0, stuckThresholdMs: 240 * 1000,
    notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
};
const resolveAgent = (cwd) => cwd === 'D:/agents/dev'
    ? { agentId: 'dev', agentName: 'developer' } : {};

// -- live flow: SessionStart → row, SessionEnd → ended --
const store = path.join(os.tmpdir(), 'af-test-cli-' + Date.now() + '.jsonl');
{
    const live = new LiveMonitor(() => cfg, resolveAgent, undefined, store);
    live.handle({
        session_id: 'cli:gemini:dev:1', cwd: 'D:/agents/dev',
        hook_event_name: 'SessionStart', source: 'gemini'
    });
    const s = live.sessions().find(x => x.sessionId === 'cli:gemini:dev:1');
    eq('cli session appears', !!s, true);
    eq('cli session idle', s.status, 'idle');
    eq('agent resolved from cwd', s.agentName, 'developer');
    eq('source derived from namespace', s.source, 'gemini');
    eq('start event detail carries cli id', live.events(60000).find(e => e.kind === 'start').detail, 'gemini');

    // claude-style session in parallel: source must stay undefined (untouched path)
    live.handle({ session_id: 'aaaa-bbbb', cwd: 'D:/agents/dev', hook_event_name: 'SessionStart', source: 'startup' });
    eq('claude session has no source', live.sessions().find(x => x.sessionId === 'aaaa-bbbb').source, undefined);

    live.handle({ session_id: 'cli:gemini:dev:1', cwd: 'D:/agents/dev', hook_event_name: 'SessionEnd', reason: 'terminal closed' });
    eq('cli session ended on terminal close', live.sessions().find(x => x.sessionId === 'cli:gemini:dev:1').status, 'ended');
    live.dispose(); // flushes pending writes synchronously
}

// -- rebuild after reload: cli lane revived with source; ended one stays gone --
{
    const now = Date.now();
    const lines = [
        JSON.stringify({ ts: now - 10 * 60000, sessionId: 'cli:codex:dev:2', agentId: 'dev', agentName: 'developer', kind: 'start', detail: 'codex' }),
        JSON.stringify({ ts: now - 9 * 60000, sessionId: 'cli:gemini:dev:3', agentId: 'dev', agentName: 'developer', kind: 'start', detail: 'gemini' }),
        JSON.stringify({ ts: now - 8 * 60000, sessionId: 'cli:gemini:dev:3', agentId: 'dev', agentName: 'developer', kind: 'end', detail: 'terminal closed' })
    ].join('\n') + '\n';
    const store2 = path.join(os.tmpdir(), 'af-test-cli-rebuild-' + Date.now() + '.jsonl');
    fs.writeFileSync(store2, lines, 'utf8');
    const live = new LiveMonitor(() => cfg, resolveAgent, undefined, store2);
    const ids = live.sessions().map(s => s.sessionId);
    eq('open cli lane revived', ids.includes('cli:codex:dev:2'), true);
    eq('closed cli lane stays gone', ids.includes('cli:gemini:dev:3'), false);
    const revived = live.sessions().find(s => s.sessionId === 'cli:codex:dev:2');
    eq('revived lane keeps source', revived.source, 'codex');
    eq('revived lane keeps agent', revived.agentName, 'developer');
    // rebind sweep contract: source + agentName reconstruct the terminal name
    eq('terminal name reconstructable', `${revived.source}: ${revived.agentName}`, 'codex: developer');
    live.dispose();
    fs.unlinkSync(store2);
}

fs.unlinkSync(store);
console.log(`\n${pass} passed, ${fail} failed`);
Module._load = origLoad;
process.exit(fail ? 1 : 0);
