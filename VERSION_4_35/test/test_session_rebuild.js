// LiveMonitor.rebuildSessions: reload must revive session cards from the store.
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
const { LiveMonitor } = require(require('path').resolve(__dirname, '../out/core/live.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const now = Date.now();
const min = 60000;
const ev = (sessionId, kind, tsAgoMin, extra) => JSON.stringify(Object.assign({
    ts: now - tsAgoMin * min, sessionId, agentName: 'dev-' + sessionId, kind,
    transcriptPath: '/t/' + sessionId + '.jsonl'
}, extra));

// S1: live session, ended its turn 5 min ago → waiting-input card expected.
// S2: last event 4h ago (> 3h TTL) → no card.
// S3: SessionEnd → no card.
// S4: mid-tool 30 min ago (> stuck threshold) → stalled, quiet.
const lines = [
    ev('S1', 'start', 60, { detail: 'startup' }),
    ev('S1', 'prompt', 50, { detail: 'ilk istek' }),
    ev('S1', 'toolStart', 45, { tool: 'Read' }),
    ev('S1', 'toolEnd', 44, { tool: 'Read' }),
    ev('S1', 'prompt', 20, { detail: 'ikinci istek' }),
    ev('S1', 'stop', 5),
    ev('S2', 'prompt', 250, { detail: 'eski' }),
    ev('S3', 'prompt', 40, { detail: 'x' }),
    ev('S3', 'end', 35),
    ev('S4', 'prompt', 33, { detail: 'uzun iş' }),
    ev('S4', 'toolStart', 30, { tool: 'Bash' })
].join('\n') + '\n';

const store = path.join(os.tmpdir(), 'af-test-rebuild-' + Date.now() + '.jsonl');
fs.writeFileSync(store, lines, 'utf8');

const cfg = {
    enabled: false, port: 0, stuckThresholdMs: 240 * 1000,
    notifyPermission: false, notifyStuck: true, notifyTurnEnd: false
};
const live = new LiveMonitor(() => cfg, () => ({}), undefined, store);

const sessions = live.sessions();
eq('only live-window sessions revived', sessions.map(s => s.sessionId).sort(), ['S1', 'S4']);

const s1 = sessions.find(s => s.sessionId === 'S1');
eq('S1 status waiting-input', s1.status, 'waiting-input');
eq('S1 prompts counted', s1.prompts, 2);
eq('S1 toolCalls counted', s1.toolCalls, 1);
eq('S1 lastPrompt kept', s1.lastPrompt, 'ikinci istek');
eq('S1 transcript kept', s1.transcriptPath, '/t/S1.jsonl');
eq('S1 agent name kept', s1.agentName, 'dev-S1');

const s4 = sessions.find(s => s.sessionId === 'S4');
eq('S4 stale mid-work → stalled', s4.status, 'stalled');
eq('S4 quiet (no reload-noise notify)', s4.notifiedStuck, true);

// A new Stop for revived S1 must NOT fire turn-ready (already waiting-input)…
const fires = [];
cfg.onTurnReady = (s) => fires.push(s.sessionId);
live.handle({ session_id: 'S1', hook_event_name: 'Notification', message: 'waiting for input' });
eq('no double fire on revived waiting session', fires.length, 0);
// …but a fresh turn does.
live.handle({ session_id: 'S1', hook_event_name: 'UserPromptSubmit', prompt: 'yeni' });
live.handle({ session_id: 'S1', hook_event_name: 'Stop' });
eq('fresh turn fires after revive', fires, ['S1']);

live.dispose();
fs.unlinkSync(store);
console.log(`\n${pass} passed, ${fail} failed`);
Module._load = origLoad;
process.exit(fail ? 1 : 0);
