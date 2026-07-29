// LIVE smoke for the Console session host — spawns REAL claude processes, so
// it costs real money and is deliberately NOT part of `npm test`. Run it by
// hand after touching consolehost.ts / consoleproto.ts:
//
//     node test/smoke_console_live.js
//
// It proves the things unit tests cannot: a hosted process answers, a message
// typed mid-turn is delivered INSIDE that turn (steering) while one you hold
// back waits — editable — for the turn to end, an interrupt stops a running
// turn, and a refused tool is unblocked by changing the session's permission
// mode live (which is what the Console's permission box does).
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

    // ---------- 2. ‼️ mid-turn: steering, holding, and editing what is held ----------
    // The claim under test is the one that cannot be unit-tested: a line written
    // to stdin while a turn runs is delivered to the model INSIDE that turn.
    // It needs a turn with steps in it (the CLI hands the message over at a step
    // boundary), hence the sleeps and its own bypassPermissions session.
    const id2 = host.start({
        agentId: 'x', agentName: 'steer', cwd: dir,
        model: 'haiku', permissionMode: 'bypassPermissions',
        firstPrompt: 'Run three Bash commands one after another: "sleep 8; echo one", '
            + 'then "sleep 8; echo two", then "sleep 8; echo three". '
            + 'Say each number as it arrives, then say DONE.'
    });
    let t = await waitFor(id2, x => x.messages.some(m => m.tool && m.tool.name === 'Bash'), 90_000);
    ok('the steering session got to work', t.status === 'working');

    // held first, while we know a turn is running
    const held = host.send(id2, 'When everything above is finished, say exactly: PING4', true);
    ok('Hold really holds — nothing is said', held && held.queued === true);
    ok('…and it is editable before it is ever said',
        host.editQueued(id2, 0, 'When everything above is finished, say exactly: PING5')
        && (host.get(id2).queued[0] || '').endsWith('PING5'));

    // …and now the thing itself
    const before = host.get(id2);
    const steer = host.send(id2,
        'One more thing while you work: say the word PINEAPPLE in your very next sentence, '
        + 'then carry on with the commands.');
    ok('a message typed mid-turn is SENT, not held', steer && steer.queued === false);
    const last = host.get(id2).messages.filter(m => m.role === 'user').pop();
    ok('…and joins the conversation marked as steering', !!last && last.steer === true);
    ok('…without restarting the turn it joined',
        host.get(id2).turnStartedAt === before.turnStartedAt);
    t = await waitFor(id2, x => /PINEAPPLE/i.test(textOf(x)), 150_000);
    ok('the running turn really receives it', /PINEAPPLE/i.test(textOf(t)));
    // ‼️ Read off the ORDER of the lines, not off a counter sampled by a poll:
    // "still turn one" measured 400ms later is a race, and a race that passes
    // proves nothing. The word has to land before the line that closed the turn.
    const said = t.messages.findIndex(m => m.role === 'agent' && /PINEAPPLE/i.test(m.text || ''));
    const closed = t.messages.findIndex(m => m.role === 'result');
    ok('…INSIDE that same turn, not in the next one',
        said >= 0 && (closed === -1 || said < closed));

    // the held one is still waiting, and goes when the turn ends — as edited
    t = await waitFor(id2, x => /PING5/.test(textOf(x)), 180_000);
    ok('a held message is handed over when the turn ends, in its edited wording',
        /PING5/.test(textOf(t)) && !/PING4/.test(textOf(t)));
    host.close(id2);

    // ---------- 3. interrupt stops the running turn ----------
    host.send(id, 'Write a 400-word essay about rope. Do not stop early.');
    await sleep(1500);
    const q = host.send(id, 'Reply with exactly: PING2', true);
    ok('a held message survives an interrupted turn', q && q.queued === true);
    ok('…and the panel can see it waiting', (host.get(id).queued || []).length === 1);
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
    const spent = host.list().reduce((n, x) => n + (x.costUSD || 0), 0);
    console.log(`\n  total cost of this smoke: $${spent.toFixed(4)}`);

    host.dispose();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
