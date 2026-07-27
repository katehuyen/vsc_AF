// LIVE smoke for the Console session host — spawns REAL claude processes, so
// it costs real money and is deliberately NOT part of `npm test`. Run it by
// hand after touching consolehost.ts / consoleproto.ts:
//
//     node test/smoke_console_live.js
//
// It proves the four things unit tests cannot: a hosted process answers, a
// message typed mid-turn is queued and sent afterwards, an interrupt stops a
// running turn, and a refused tool is unblocked by changing the session's
// permission mode live (which is what the Console's permission box does).
// Model: haiku, shortest possible prompts.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ConsoleHost } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-console-'));
const host = new ConsoleHost();

const waitFor = async (id, pred, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        const s = host.get(id);
        if (s && pred(s)) { return s; }
        await sleep(400);
    }
    return host.get(id);
};
const textOf = s => s.messages.filter(m => m.role === 'agent').map(m => m.text).join(' ');

(async () => {
    // ---------- 1. a hosted session answers ----------
    const id = host.start({
        agentId: 'x', agentName: 'smoke', cwd: dir,
        model: 'haiku', permissionMode: 'manual',
        firstPrompt: 'Reply with exactly: PING1'
    });
    let s = await waitFor(id, x => /PING1/.test(textOf(x)) && x.status === 'idle', 90_000);
    ok('the hosted process answers', /PING1/.test(textOf(s)));
    ok('it reports claude\'s own session id', !!s.sessionId);
    ok('the turn is billed to the session', s.costUSD > 0);
    ok('it goes back to idle, ready for the next turn', s.status === 'idle');

    // ---------- 2. queueing while a turn runs ----------
    host.send(id, 'Write a 400-word essay about rope. Do not stop early.');
    await sleep(1500);
    const q = host.send(id, 'Reply with exactly: PING2');
    ok('a message sent mid-turn is QUEUED, not dropped', q && q.queued === true);
    ok('…and the panel can see it waiting', (host.get(id).queued || []).length === 1);

    // ---------- 3. interrupt stops the running turn ----------
    ok('interrupt is accepted', host.interrupt(id) === true);
    s = await waitFor(id, x => x.messages.some(m => m.role === 'result' && /interrupted/.test(m.text || '')), 60_000);
    ok('the running turn ends as interrupted',
        s.messages.some(m => m.role === 'result' && /interrupted/.test(m.text || '')));
    // the queued message must go out once the turn is over
    s = await waitFor(id, x => /PING2/.test(textOf(x)), 90_000);
    ok('the queued message is sent after the interrupt', /PING2/.test(textOf(s)));
    ok('…and the session survived the interrupt', host.get(id).status !== 'ended');

    // ---------- 4. a refused tool, then the live grant ----------
    host.send(id, 'Use the Write tool to create note.txt containing exactly: hello');
    s = await waitFor(id, x => !!x.pendingPermission, 90_000);
    ok('a permission refusal is detected as such', !!s.pendingPermission);
    ok('…and the file was NOT written', !fs.existsSync(path.join(dir, 'note.txt')));
    ok('changing the mode live is accepted', host.setPermissionMode(id, 'acceptEdits') === true);
    s = await waitFor(id, x => x.permissionMode === 'acceptEdits', 30_000);
    ok('the session reports the new mode', s.permissionMode === 'acceptEdits');
    ok('…and the pending refusal is cleared', !s.pendingPermission);
    host.send(id, 'Permission granted — please retry the action you were refused.');
    s = await waitFor(id, () => fs.existsSync(path.join(dir, 'note.txt')), 90_000);
    ok('after the grant + retry the file is really written',
        fs.existsSync(path.join(dir, 'note.txt')));
    ok('the write shows up as a tool message with its file',
        s.messages.some(m => m.tool && m.tool.name === 'Write' && /note\.txt$/.test(m.tool.file || '')));

    // ---------- 5. closing ----------
    host.close(id);
    s = await waitFor(id, x => x.status === 'ended', 15_000);
    ok('closing ends the session', s.status === 'ended');
    console.log(`\n  total cost of this smoke: $${(s.costUSD || 0).toFixed(4)}`);

    host.dispose();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
