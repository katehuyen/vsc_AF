// X-445 — the phone as one of the farm's alert channels:
// (4) the PC's alert gate (🔇, a session muted on its own, quiet hours) rides on every alerting
//     event as `quiet` (src/core/remoteEvents.ts withQuiet), declared in the contract;
// (6a) one question, one channel — while a phone that may answer is connected, Telegram does not
//     carry the question too (src/core/telegramDigest.ts digestYieldsToPhone, RemoteControl.answering).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const R = require(path.join(OUT, 'core', 'remoteEvents.js'));
const T = require(path.join(OUT, 'core', 'telegramDigest.js'));
const { silence } = require(path.join(OUT, 'core', 'alertGate.js'));
const K = require(path.join(OUT, 'remote', 'contract', 'index.js'));
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'remote', 'contract', 'remote-contract.v1.json'), 'utf8'));

console.log('\n== (4) the alert gate rides on the phone\'s alerts ==');
{
    const quiet = { inside: true, from: '23:00', to: '08:00' };
    const asked = [];
    const gate = muted => s => { asked.push(s); return silence({ muted, sessionMuted: s === 'muted-session', quiet: muted === 'night' ? quiet : undefined }); };
    const ask = { type: 'ask.opened', data: { session: 'cs1', agent: 'developer', askId: 'q1', question: 'A or B?', options: [] } };
    const loud = R.withQuiet(ask, gate(false));
    ok('‼️ an event the gate lets through is left EXACTLY as it was (same object, no quiet key)', loud === ask && !('quiet' in ask.data));
    const muted = R.withQuiet(ask, gate(true));
    ok('‼️ the farm muted (🔇): the question still goes, marked quiet with the reason', muted.type === 'ask.opened' && muted.data.askId === 'q1'
        && muted.data.quiet && muted.data.quiet.reasons.join() === 'fleet' && /muted/.test(muted.data.quiet.detail));
    ok('…and the original event is not mutated', !('quiet' in ask.data));
    const night = R.withQuiet(ask, gate('night'));
    ok('‼️ quiet hours: marked quiet, the PC\'s own sentence carried', night.data.quiet.reasons.join() === 'quiet-hours' && /08:00/.test(night.data.quiet.detail));
    asked.length = 0;
    const own = R.withQuiet({ type: 'turn.finished', data: { session: 'muted-session', agent: 'a', title: 't', summary: 's' } }, gate(false));
    ok('a session muted on its own is asked by the event\'s own session', asked[0] === 'muted-session' && own.data.quiet.reasons.join() === 'session');
    asked.length = 0;
    R.withQuiet({ type: 'quota.warn', data: { engine: 'claude', percent: 91, window: '5h' } }, gate(false));
    ok('an event with no session asks the gate for the farm as a whole', asked.length === 1 && asked[0] === undefined);
    const alerting = ['ask.opened', 'ask.answersSoon', 'permission.opened', 'turn.finished', 'notice.posted', 'quota.warn'];
    ok('every alerting event is marked when silenced', alerting.every(t => R.withQuiet({ type: t, data: { session: 'x' } }, gate(true)).data.quiet));
    const shown = ['needs.changed', 'ask.closed', 'permission.closed', 'session.ended'];
    ok('‼️ what only changes the phone\'s view (closed, ended, counts) is never marked', shown.every(t => { const e = { type: t, data: { session: 'x' } }; return R.withQuiet(e, gate(true)) === e; }));
}

console.log('\n== (4) the contract declares it ==');
{
    const withQuietField = Object.entries(contract.events).filter(([, e]) => e.fields.quiet === 'object?').map(([t]) => t).sort();
    ok('‼️ exactly the alerting events declare an optional quiet object', withQuietField.join() === [...R.ALERTING_EVENTS].sort().join());
    ok('a rule says what quiet means: the farm would not ring, the reasons say which rule', contract.rules.some(r => /quiet \{ reasons/.test(r) && /would not ring/.test(r)));
    const frame = { kind: 'event', seq: 1, type: 'ask.opened', ts: 1, user: 'owner',
        data: { session: 's', agent: 'a', askId: 'q', question: 'x', options: [], quiet: { reasons: ['quiet-hours'], detail: 'quiet hours' } } };
    ok('a quiet event is a valid frame', K.checkFrame(frame).ok);
    ok('…and so is one without it (old clients and quiet-less events unchanged)', K.checkFrame({ ...frame, data: { ...frame.data, quiet: undefined } }).ok);
}

console.log('\n== (6a) one question, one channel ==');
{
    const asking = { pendingAsk: { requestId: 'r1', questions: [{ question: 'A or B?', options: [{ label: 'A' }] }] } };
    ok('‼️ a card waiting on a question yields to a connected phone that may answer', T.digestYieldsToPhone(asking, 1) === true);
    ok('…not when no such phone is connected (Telegram carries it as before)', T.digestYieldsToPhone(asking, 0) === false);
    ok('a turn report is no question: it still goes to Telegram', T.digestYieldsToPhone({ pendingAsk: undefined }, 2) === false);
    ok('a wait with no question on it (the phone gets no ask.opened for it) stays Telegram\'s', T.digestYieldsToPhone({ pendingAsk: { requestId: 'r', questions: [] } }, 2) === false);
}

console.log('\n== (6a) RemoteControl.answering: welcomed sockets whose device may answer ==');
const serve = require(path.join(OUT, 'remote', 'serve.js'));
let callers = [];
serve.startRemoteHost = async () => ({
    port: 4443, fingerprint: 'fp', devices: { list: () => [] },
    server: { sessions: () => callers.length, callers: () => callers, dropRevoked() { }, rescope() { }, pairingLink: () => '', emit() { } },
    stop: async () => { }
});
const { createRemoteControl } = require(path.join(OUT, 'remote', 'index.js'));
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x445-'));
    try {
        const rc = createRemoteControl({ farm: () => ({ id: 'f', name: 'F' }), callOp: async () => ({ ok: true }), subscribe: () => () => { },
            can: () => ({ allowed: true }), storageDir: () => dir, log: () => { } });
        ok('not listening: no phone answers', rc.answering() === 0);
        await rc.apply({ host: '127.0.0.1', port: 4443, addresses: ['127.0.0.1'] });
        callers = [{ device: 'd1', scope: 'read' }];
        ok('‼️ a read-only phone cannot answer, so Telegram keeps the question', rc.answering() === 0);
        callers = [{ device: 'd1', scope: 'read' }, { device: 'd2', scope: 'answer' }, { device: 'd3', scope: 'manage' }, { device: 'd4', scope: 'admin' }];
        ok('answer, manage and admin phones count', rc.answering() === 3);
        await rc.apply(null, 'stopped');
        ok('stopped again: none', rc.answering() === 0);
        await rc.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    console.log('\n== the wiring ==');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const host = fs.readFileSync(path.join(ROOT, 'src', 'remote', 'server', 'host.ts'), 'utf8');
    ok('the host lists the callers of its WELCOMED sockets only', /callers: \(\) => \[\.\.\.live\]\.flatMap\(s => \(s\.caller \? \[s\.caller\] : \[\]\)\)/.test(host));
    ok('‼️ every phone event goes through withQuiet before any listener', /for \(const raw of events\) \{ const e = withQuiet\(raw, remoteQuietOf\); for \(const l of remoteListeners\) \{ l\(e\); \} \}/.test(ext));
    ok('…asking the PC\'s own gate, a Console card read as its engine session', /const remoteQuietOf = \(session\?: string\) => alertSilence\(session \? consoleHost\.get\(session\)\?\.sessionId \?\? session : undefined\);/.test(ext));
    ok('‼️ the Telegram digest yields a question to a connected phone before it is written', /if \(digestYieldsToPhone\(s, remote\.answering\(\)\)\) \{ return; \}\s*const text = digestText\(s, chatDigestCtx\(s\)\);/.test(ext));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
