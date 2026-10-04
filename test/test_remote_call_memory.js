// X-446 — A CALL THAT CHANGES SOMETHING RUNS ONCE, ALSO ACROSS A WINDOW RELOAD.
//
// The phone resends every call it holds no answer for after each welcome
// (and_AgentFarm ConnectionManager.flush), for up to six hours. The host's
// memory of answered ids lived in RAM only, so a reload between running a
// call and the phone receiving its answer ran it a second time. Here a reload
// is a second CallMemory on the same file, and a crash is a file holding a
// started call with no answer.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = p => require(path.join(ROOT, 'out', 'remote', ...p));
const { CallMemory, CALLS_KEEP_MS, KEPT_ANSWER_MAX } = out(['server', 'callMemory.js']);
const { RemoteSession } = out(['server', 'session.js']);
const { DeviceBook } = out(['server', 'devices.js']);
const { EventLog } = out(['server', 'eventLog.js']);
const { looksOnly, requiredScope } = out(['scopes.js']);
const K = out(['contract', 'index.js']);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-callmem-'));
const fileOf = name => path.join(dir, name);
const onDisk = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).calls || []; } catch { return []; } };
const frame = (id, result) => ({ kind: 'result', id, ok: true, result });

(async () => {
    try {
        // ---- a lasting call: written as started before it runs, then with its answer
        const f1 = fileOf('calls.json');
        let runs = 0, seenAtRun = null;
        const m1 = new CallMemory(f1);
        const a = m1.answer('dev_a', 'c1', async () => {
            runs++;
            seenAtRun = onDisk(f1);
            return frame('c1', { sent: true });
        }, true);
        ok('the first call is not a duplicate', a.duplicate === false);
        const first = await a.result;
        await m1.settled();
        ok('it ran once', runs === 1 && first.result.sent === true);
        ok('it was on disk as started BEFORE it ran', Array.isArray(seenAtRun)
            && seenAtRun.some(s => s.key === 'dev_a|c1' && s.answer === undefined));
        ok('…and is on disk with its answer after', onDisk(f1).some(s => s.key === 'dev_a|c1' && s.answer?.result?.sent === true));

        // ---- the reload: a new memory on the same file
        const m2 = new CallMemory(f1);
        const again = m2.answer('dev_a', 'c1', async () => { runs++; return frame('c1', { sent: 'twice' }); }, true);
        const second = await again.result;
        ok('after a reload the resend is a duplicate', again.duplicate === true);
        ok('…the op did not run again', runs === 1);
        ok('…and the answer is the stored one', JSON.stringify(second) === JSON.stringify(first));
        const other = m2.answer('dev_b', 'c1', async () => { runs++; return frame('c1', {}); }, true);
        await other.result;
        ok('the same id from another device is another call', other.duplicate === false && runs === 2);

        // ---- a look is not kept: after a reload it simply runs again
        let looks = 0;
        await m2.answer('dev_a', 'l1', async () => { looks++; return frame('l1', {}); }, false).result;
        await m2.settled();
        ok('a look is not written to disk', !onDisk(f1).some(s => s.key === 'dev_a|l1'));
        const m3 = new CallMemory(f1);
        await m3.answer('dev_a', 'l1', async () => { looks++; return frame('l1', {}); }, false).result;
        ok('…so after a reload it runs again (harmless: it only looks)', looks === 2);

        // ---- a crash mid-run: started on disk, no answer
        const f2 = fileOf('crash.json');
        fs.writeFileSync(f2, JSON.stringify({ v: 1, calls: [{ key: 'dev_a|c9', at: Date.now() }] }), 'utf8');
        let ranAfterCrash = false;
        const m4 = new CallMemory(f2);
        const cut = m4.answer('dev_a', 'c9', async () => { ranAfterCrash = true; return frame('c9', {}); }, true);
        const cutAnswer = await cut.result;
        ok('a call the host died running is NOT run again', ranAfterCrash === false && cut.duplicate === true);
        ok('…the phone is told it was interrupted and to check', cutAnswer.ok === false && cutAnswer.id === 'c9'
            && /^interrupted:/.test(cutAnswer.error) && /check before sending it again/.test(cutAnswer.error));

        // ---- what is kept, and for how long
        const f3 = fileOf('old.json');
        fs.writeFileSync(f3, JSON.stringify({ v: 1, calls: [
            { key: 'dev_a|old', at: Date.now() - CALLS_KEEP_MS - 1000, answer: frame('old', {}) },
            { key: 'dev_a|new', at: Date.now() - 1000, answer: frame('new', { k: 1 }) }
        ] }), 'utf8');
        let oldRuns = 0;
        const m5 = new CallMemory(f3);
        await m5.answer('dev_a', 'old', async () => { oldRuns++; return frame('old', {}); }, true).result;
        ok('an answer older than the phone can resend is forgotten', oldRuns === 1);
        ok('…one inside the window is still answered', m5.answer('dev_a', 'new', async () => frame('new', {}), true).duplicate === true);
        ok('the window outlives the phone outbox (6 h)', CALLS_KEEP_MS > 6 * 60 * 60 * 1000);

        const f4 = fileOf('cap.json');
        const m6 = new CallMemory(f4, { keepSaved: 3 });
        for (const id of ['k1', 'k2', 'k3', 'k4', 'k5']) { await m6.answer('dev_a', id, async () => frame(id, {}), true).result; }
        await m6.settled();
        ok('the file holds only the newest calls', onDisk(f4).map(s => s.key).join() === 'dev_a|k3,dev_a|k4,dev_a|k5');

        const f5 = fileOf('big.json');
        const m7 = new CallMemory(f5);
        const big = 'x'.repeat(KEPT_ANSWER_MAX + 10);
        const bigAnswer = await m7.answer('dev_a', 'b1', async () => frame('b1', { big }), true).result;
        await m7.settled();
        const keptBig = (onDisk(f5).find(s => s.key === 'dev_a|b1') || {}).answer || {};
        ok('a large answer reaches the phone whole the first time', bigAnswer.result.big.length === big.length);
        ok('…but is kept without its payload, with its verdict', keptBig.ok === true && keptBig.result?.kept === false && !('big' in (keptBig.result || {})));

        // ---- a disk that refuses: the call still answers, the line says why
        const blocker = fileOf('blocker');
        fs.writeFileSync(blocker, 'a file where a folder should be', 'utf8');
        const lines = [];
        const m8 = new CallMemory(path.join(blocker, 'calls.json'), { log: l => lines.push(l) });
        const stuck = await m8.answer('dev_a', 'w1', async () => frame('w1', { fine: true }), true).result;
        ok('an unwritable file does not stop the call', stuck.result.fine === true);
        ok('…the host is told the memory is in RAM only', lines.some(l => /calls\.json not written/.test(l) && /in memory only/.test(l)));
        ok('…and RAM still answers a resend', m8.answer('dev_a', 'w1', async () => frame('w1', {}), true).duplicate === true);

        fs.writeFileSync(fileOf('torn.json'), '{"v":1,"calls":[{"key":', 'utf8');
        ok('a torn file loads as empty instead of throwing', new CallMemory(fileOf('torn.json')).answer('d', 'x', async () => frame('x', {}), true).duplicate === false);

        // ---- which calls last: scope is untouched, the phone's minute poll is a look
        ok('looks only: a looking verb, the open farm ops and the phone\'s console.sessions',
            looksOnly('tasks.list') && looksOnly('farm.ping') && looksOnly('console.sessions'));
        ok('…writes last: a message, an answer, a task', !looksOnly('console.send') && !looksOnly('console.answer') && !looksOnly('tasks.add'));
        ok('…and console.sessions still needs the scope it needed', requiredScope('console.sessions') === 'manage');

        // ---- end to end on a socket: the reload between running and answering
        const farm = { id: 'farm_t', name: 'Ev' };
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const devices = new DeviceBook(null);
        const dev = devices.add('Pixel', publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
        const f6 = fileOf('socket.json');
        let opRuns = 0;
        const session = calls => {
            const sent = [];
            const wire = { send: s => sent.push(JSON.parse(s)), close: () => { } };
            const s = new RemoteSession(wire, {
                farm, devices, events: new EventLog(null), calls, views: null, helloTimeoutMs: 5000,
                features: () => ({}),
                callOp: async (op) => { opRuns++; return { ok: true, result: { op } }; },
            });
            const sig = crypto.sign('sha256', Buffer.from(K.signedText(farm.id, dev.id, s.nonce)), privateKey).toString('base64');
            s.onMessage(JSON.stringify({ kind: 'hello', device: dev.id, contract: K.CONTRACT_VERSION, signature: sig }));
            return { s, sent };
        };
        const before = session(new CallMemory(f6));
        before.s.onMessage(JSON.stringify({ kind: 'call', id: 'p1', op: 'console.send', args: { text: 'hi' } }));
        before.s.onMessage(JSON.stringify({ kind: 'call', id: 'p2', op: 'console.sessions' }));
        await new Promise(r => setTimeout(r, 80));
        const after = session(new CallMemory(f6));
        after.s.onMessage(JSON.stringify({ kind: 'call', id: 'p1', op: 'console.send', args: { text: 'hi' } }));
        after.s.onMessage(JSON.stringify({ kind: 'call', id: 'p2', op: 'console.sessions' }));
        await new Promise(r => setTimeout(r, 80));
        const resent = after.sent.find(f => f.kind === 'result' && f.id === 'p1');
        ok('a message resent after a reload is answered as a duplicate', resent && resent.duplicate === true && resent.ok === true);
        ok('…and reached the conversation once (the poll ran twice, the message once)', opRuns === 3);
        ok('the duplicate is a valid contract frame', resent && K.checkFrame(resent).ok);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`remote call memory: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
