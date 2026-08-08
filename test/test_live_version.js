// X-7: which Agent Farm build was watching.
//
// What this defends is an ARGUMENT, not a field. "Capture went deaf in version
// N" was unanswerable for days at a time, because nothing in any record said
// which build had written a line — the version had to be inferred from the
// install timestamps of extension folders, which is indirect evidence about a
// claim that is directly measurable. So two promises are held here:
//
//   1. every event carries the build that saw it, and a session carries the
//      builds that watched it — in order, because a session that spans an
//      upgrade is exactly the case an average would hide;
//   2. the comparison is per HOUR OF ACTIVITY, not per calendar hour. A version
//      installed over a quiet weekend is not a version that captured less, and
//      a rate that cannot tell those apart is worse than no rate at all.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: { showInformationMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined) },
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
const ev = (sessionId, kind, tsAgoMin, af, extra) => JSON.stringify(Object.assign({
    ts: now - tsAgoMin * min, sessionId, agentName: 'dev', kind
}, af ? { af } : {}, extra || {}));

const cfg = () => ({
    enabled: false, port: 0, stuckThresholdMs: 4 * min,
    notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
});

// ---- the stamp goes on what this build writes ------------------------------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ver-'));
    const store = path.join(dir, 'live-events.jsonl');
    const lm = new LiveMonitor(cfg, () => ({ agentName: 'dev' }), undefined, store, '3.85.0');
    lm.handle({ session_id: 'S1', hook_event_name: 'SessionStart', cwd: '/w' });
    lm.handle({ session_id: 'S1', hook_event_name: 'UserPromptSubmit', prompt: 'go' });

    const evs = lm.events(60 * min);
    ok('every event carries the build that saw it', evs.length === 2 && evs.every(e => e.af === '3.85.0'));
    ok('…and the session says which build watched it',
        JSON.stringify(lm.sessions()[0].afVersions) === '["3.85.0"]');

    // A build that does not know its own version writes nothing rather than a
    // placeholder — an invented value is what this whole field replaces.
    const bare = new LiveMonitor(cfg, () => ({ agentName: 'dev' }), undefined, undefined);
    bare.handle({ session_id: 'S9', hook_event_name: 'SessionStart', cwd: '/w' });
    ok('‼️ with no version known, nothing is stamped rather than a guess',
        bare.events(60 * min)[0].af === undefined && bare.sessions()[0].afVersions === undefined);
    bare.dispose();
    lm.dispose();
}

// ---- a session that spans an upgrade keeps both, in order ------------------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ver2-'));
    const store = path.join(dir, 'live-events.jsonl');
    fs.writeFileSync(store, [
        ev('S1', 'prompt', 50, '3.84.0'),
        ev('S1', 'toolStart', 49, '3.84.0', { tool: 'Read' }),
        ev('S1', 'stop', 20, '3.85.0')
    ].join('\n') + '\n', 'utf8');
    const lm = new LiveMonitor(cfg, () => ({ agentName: 'dev' }), undefined, store, '3.85.0');
    ok('‼️ an upgrade mid-session is kept as two builds, oldest first',
        JSON.stringify(lm.sessions()[0].afVersions) === '["3.84.0","3.85.0"]');
    lm.dispose();
}

// ---- the comparison the whole thing exists for -----------------------------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ver3-'));
    const store = path.join(dir, 'live-events.jsonl');
    // OLD: six events over ten minutes of work — a busy stretch.
    // NEW: two events over the same ten minutes, then a two-day silence which
    //      must NOT be counted as time it was watching anything.
    const old = [];
    for (let i = 0; i < 6; i++) { old.push(ev('A', 'toolStart', 5000 - i * 2, '3.84.0', { tool: 'Read' })); }
    const fresh = [];
    for (let i = 0; i < 2; i++) { fresh.push(ev('B', 'toolStart', 100 - i * 10, '3.85.0', { tool: 'Read' })); }
    const legacy = [ev('C', 'prompt', 9000, undefined)];
    fs.writeFileSync(store, old.concat(fresh, legacy).join('\n') + '\n', 'utf8');

    const lm = new LiveMonitor(cfg, () => ({ agentName: 'dev' }), undefined, store, '3.85.0');
    const spans = lm.versionSpans();
    const by = v => spans.find(s => s.version === v);

    ok('the log is split by the build that wrote it', spans.length === 3);
    ok('…oldest span first, so the rows read as a history',
        spans[0].from <= spans[1].from && spans[1].from <= spans[2].from);
    ok('‼️ a line written before the stamp existed is UNKNOWN, not attributed',
        !!by('') && by('').events === 1);
    ok('each build reports what it saw', by('3.84.0').events === 6 && by('3.85.0').events === 2);
    ok('…and which sessions it saw them in',
        by('3.84.0').sessions === 1 && by('3.85.0').sessions === 1);
    ok('…broken down by kind, because "fewer calls" is a claim about one kind',
        by('3.84.0').kinds.toolStart === 6 && by('3.85.0').kinds.toolStart === 2);

    // ‼️ THE NUMBER THAT SETTLES THE ARGUMENT.
    const rate = s => s.events / (s.activeMs / 3600000);
    ok('‼️ the busier build measures as busier PER HOUR OF ACTIVITY',
        rate(by('3.84.0')) > rate(by('3.85.0')));
    ok('‼️ …and a two-day silence is not counted as time it was watching',
        by('3.85.0').activeMs < 60 * min);
    lm.dispose();
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
