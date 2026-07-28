// LiveMonitor.dismiss: "Clear" takes a session off the Live Timeline WHOLE —
// card and lane row — and it stays off across a reload; "End session" does not
// (what a run did stays on the page as history).
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
const { LiveMonitor } = require(path.resolve(__dirname, '../out/core/live.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const now = Date.now();
const min = 60000;
const ev = (sessionId, kind, tsAgoMin, extra) => JSON.stringify(Object.assign({
    ts: now - tsAgoMin * min, sessionId, agentName: 'dev', kind,
    transcriptPath: '/t/' + sessionId + '.jsonl'
}, extra));

// S1, S2: live sessions. S3: already ended — no card, but its events still
// draw a lane row, which is the case a card's Clear button cannot reach.
const lines = [
    ev('S1', 'prompt', 40, { detail: 'one' }),
    ev('S1', 'toolStart', 39, { tool: 'Read' }),
    ev('S1', 'toolEnd', 38, { tool: 'Read' }),
    ev('S1', 'stop', 5),
    ev('S2', 'prompt', 30, { detail: 'two' }),
    ev('S2', 'stop', 6),
    ev('S3', 'prompt', 50, { detail: 'three' }),
    ev('S3', 'end', 45)
].join('\n') + '\n';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-clear-'));
const store = path.join(dir, 'live-events.jsonl');
const sidecar = path.join(dir, 'live-cleared.json');
fs.writeFileSync(store, lines, 'utf8');

const cfg = () => ({
    enabled: false, port: 0, stuckThresholdMs: 4 * min,
    notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
});
const open = () => new LiveMonitor(cfg, () => ({ agentName: 'dev' }), undefined, store);
const ids = (m) => m.sessions().map(s => s.sessionId).sort();
const evIds = (m) => [...new Set(m.events(24 * 3600 * 1000).map(e => e.sessionId))].sort();

// ---- what the page starts with ----
let lm = open();
ok('both live sessions are tracked', JSON.stringify(ids(lm)) === '["S1","S2"]');
ok('the ended session has no card', ids(lm).indexOf('S3') === -1);
ok('…but still draws its lane row', evIds(lm).indexOf('S3') !== -1);

// ---- Clear: card AND lane row, together ----
ok('clearing a tracked session reports success', lm.dismiss('S1', 'cleared in Agent Farm', true) === true);
ok('its card is gone', ids(lm).indexOf('S1') === -1);
ok('its lane row is gone too — no orphan row left behind',
    evIds(lm).indexOf('S1') === -1);
ok('the other sessions are untouched', JSON.stringify(evIds(lm)) === '["S2","S3"]');
ok('nothing is written into the lane as a parting event',
    lm.events(24 * 3600 * 1000).every(e => e.sessionId !== 'S1'));

// ---- a row that outlived its card can be cleared from the row ----
ok('an untracked session that is still drawn can be cleared',
    lm.dismiss('S3', 'cleared in Agent Farm', true) === true);
ok('…and its row goes', evIds(lm).indexOf('S3') === -1);
ok('a session that is neither tracked nor drawn returns false',
    lm.dismiss('NOPE', 'cleared in Agent Farm', true) === false);

// ---- End session is NOT Clear: the run stays on the page as history ----
ok('ending a session drops its card', lm.dismiss('S2', 'ended from Agent Farm') === true);
ok('…but keeps its lane row', evIds(lm).indexOf('S2') !== -1);
ok('…closed with the end event that never arrived',
    lm.events(24 * 3600 * 1000).some(e => e.sessionId === 'S2' && e.kind === 'end'));
lm.dispose();

// ---- a Clear survives a window reload ----
ok('the cleared ids are persisted next to the store', fs.existsSync(sidecar));
lm = open();
ok('the cleared sessions do not come back as cards', JSON.stringify(ids(lm)) === '[]');
ok('…nor as lane rows', JSON.stringify(evIds(lm)) === '["S2"]');
ok('the ended-but-not-cleared session still draws its row', evIds(lm).indexOf('S2') !== -1);

// ---- nor in the long-range density view (that one reads the store file) ----
{
    const d = lm.density(31 * 24 * 3600 * 1000);
    const counted = d.lanes.reduce((n, l) => n + l.buckets.reduce((a, b) => a + b[0] + b[1] + b[2] + b[3], 0), 0);
    ok('density counts only what is still on the page', counted === d.totalEvents && counted === 3);
}

// ---- Clear is not a blacklist: a session that speaks again comes back ----
lm.handle({ session_id: 'S1', hook_event_name: 'UserPromptSubmit', prompt: 'back', cwd: 'D:/a/dev' });
ok('a cleared session that reports an event is tracked again', ids(lm).indexOf('S1') !== -1);
ok('…and draws again', evIds(lm).indexOf('S1') !== -1);
ok('…and its clear is lifted on disk',
    !Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(sidecar, 'utf8')), 'S1'));
lm.dispose();

try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
