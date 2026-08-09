// LIVE smoke for the Console session host — spawns REAL claude processes, so
// it costs real money and is deliberately NOT part of `npm test`. Run it by
// hand after touching consolehost.ts / consoleproto.ts:
//
//     node test/smoke_console_live.js
//
// It proves the things unit tests cannot: a hosted process answers, a message
// typed mid-turn is delivered INSIDE that turn (steering) while one you hold
// back waits — editable — for the turn to end, an interrupt stops a running
// turn, a tool that needs permission ASKS US and runs the moment we allow it,
// an AskUserQuestion parks the turn and carries on with the answer we give it,
// and the effort can be changed mid-conversation.
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

    // ---------- 4. ‼️ the session ASKS US, and the turn waits ----------
    // This is the whole two-way claim. A tool that needs permission no longer
    // fails with "nobody granted it" — the CLI parks the turn on a control
    // request and the panel answers it, exactly as a terminal does.
    host.send(id, 'Use the Write tool to create note.txt containing exactly: hello');
    s = await waitFor(id, x => !!x.pendingAsk, 90_000);
    ok('the session asks for permission instead of failing', !!s.pendingAsk);
    ok('…naming the tool and what it would do',
        s.pendingAsk.tool === 'Write' && /note\.txt/.test(s.pendingAsk.detail));
    ok('…marked as a permission, not a question',
        s.pendingAsk.interactive === false && s.pendingAsk.questions.length === 0);
    ok('…and the file has NOT been written while it waits',
        !fs.existsSync(path.join(dir, 'note.txt')));
    ok('…with the turn still open, not closed by the refusal', s.status === 'working');
    ok('allowing it is accepted', host.answer(id, { kind: 'allow' }) === true);
    s = await waitFor(id, () => fs.existsSync(path.join(dir, 'note.txt')), 90_000);
    ok('…and the file is really written, in the SAME turn',
        fs.existsSync(path.join(dir, 'note.txt')));
    ok('the write shows up as a tool message with its file',
        s.messages.some(m => m.tool && m.tool.name === 'Write' && /note\.txt$/.test(m.tool.file || '')));
    ok('…and nothing is left waiting', !host.get(id).pendingAsk);

    // ---------- 4b. ‼️ the THIRD answer: allow, and stop asking ----------
    // The claim: an allow that carries `updatedPermissions` installs a
    // session-scoped rule, so the SAME kind of call is not asked about again.
    // Three `touch` commands in `default` mode ask three times; answering the
    // first one this way must take it to one.
    await waitFor(id, x => x.status === 'idle', 60_000);
    host.send(id, 'Run these three Bash commands one at a time, in order: '
        + '`touch p1.txt`, then `touch p2.txt`, then `touch p3.txt`. Then say TOUCHED.');
    s = await waitFor(id, x => x.pendingAsk && x.pendingAsk.tool === 'Bash', 90_000);
    ok('a Bash call asks before it runs', !!s.pendingAsk && s.pendingAsk.tool === 'Bash');
    ok('allowing it "always" is accepted', host.answer(id, { kind: 'allow', always: true }) === true);
    s = await waitFor(id, x => x.status === 'idle' && /TOUCHED/.test(textOf(x)), 120_000);
    ok('…all three files are written', ['p1', 'p2', 'p3']
        .every(n => fs.existsSync(path.join(dir, n + '.txt'))));
    ok('…and it never asked again — one ask, three commands',
        s.messages.filter(m => m.role === 'ask' && m.ask && m.ask.tool === 'Bash').length === 1);

    // a deny is an answer too: the tool does not run and the agent is told why
    await waitFor(id, x => x.status === 'idle', 60_000);
    host.send(id, 'Use the Write tool to create secret.txt containing exactly: nope');
    s = await waitFor(id, x => !!x.pendingAsk, 90_000);
    ok('a second tool asks again', !!s.pendingAsk);
    ok('denying it is accepted',
        host.answer(id, { kind: 'deny', message: 'Not that file — leave it alone.' }) === true);
    s = await waitFor(id, x => x.status === 'idle', 90_000);
    ok('…the file is not written', !fs.existsSync(path.join(dir, 'secret.txt')));

    // ---------- 5. ‼️ a QUESTION, answered mid-turn ----------
    const idq = host.start({
        agentId: 'x', agentName: 'ask', cwd: dir,
        model: 'haiku', permissionMode: 'bypassPermissions',
        firstPrompt: 'Use the AskUserQuestion tool to ask me whether I prefer tea or coffee, '
            + 'then tell me what I chose.'
    });
    let a = await waitFor(idq, x => !!x.pendingAsk, 120_000);
    ok('an AskUserQuestion parks the turn on a real question', !!a.pendingAsk);
    ok('…the CLI marks it as one that EXISTS to ask', a.pendingAsk.interactive === true);
    ok('…with its options, ready to be clicked',
        a.pendingAsk.questions.length === 1 && a.pendingAsk.questions[0].options.length >= 2);
    const q0 = a.pendingAsk.questions[0];
    const chosen = (q0.options.find(o => /coffee|kahve/i.test(o.label)) || q0.options[1] || q0.options[0]).label;
    ok('answering it is accepted',
        host.answer(idq, { kind: 'answer', answers: { [q0.question]: chosen } }) === true);
    // ‼️ The proof: the agent uses the answer WITHOUT a new prompt from us.
    a = await waitFor(idq, x => x.status === 'idle' && textOf(x).length > 0, 120_000);
    ok('…and the SAME turn carries on with what we said',
        new RegExp(chosen, 'i').test(textOf(a)));
    ok('…the answer is recorded in the conversation',
        a.messages.some(m => m.role === 'ask' && (m.answer || '').includes(chosen)));
    ok('…and exactly one turn ran — we never had to prompt again',
        a.turns === 1);

    // ---------- 6. effort, changed mid-conversation ----------
    ok('asking for a new effort is accepted', host.setEffort(idq, 'high') === true);
    a = await waitFor(idq, x => x.effort === 'high', 30_000);
    ok('…and the session reports it once the CLI agrees', a.effort === 'high');
    ok('…without a pending switch left over', !a.pendingEffort);
    host.close(idq);

    // ---------- 7. ‼️ what a turn is REALLY running on, with nothing chosen ----------
    // The case the panel used to have no answer for: the pickers are left alone
    // — which is how a session is normally started — so there is no flag, no
    // model name and no effort to read off them, while the turn still runs on a
    // real model at a real effort resolved from the settings chain. The CLI
    // resolves that chain itself and answers `get_settings`; the host asks at
    // session start and at the start of every turn. Nearly free to prove: the
    // first two sessions here never send a prompt at all.
    const idb = host.start({ agentId: 'x', agentName: 'brain', cwd: dir, model: 'opus' });
    let b = await waitFor(idb, x => !!x.applied, 30_000);
    ok('a session with no effort chosen still learns what is in force', !!(b && b.applied));
    ok('…the model, as the CLI names it', /opus/.test((b.applied || {}).model || ''));
    ok('…and an effort NOBODY picked — it comes from the settings chain',
        !!(b.applied || {}).effort);
    ok('…while the picker still honestly says nothing was chosen', !b.effort);
    host.close(idb);

    // …and on a model with no effort levels the answer is "none", not "unknown"
    const idh = host.start({ agentId: 'x', agentName: 'brainh', cwd: dir, model: 'haiku' });
    let bh = await waitFor(idh, x => !!x.applied, 30_000);
    ok('a model with no effort levels says exactly that',
        !!bh.applied && /haiku/.test(bh.applied.model) && bh.applied.effort === '');
    host.send(idh, 'Reply with exactly: BRAIN');
    bh = await waitFor(idh, x => x.status === 'working' && !!x.turnModel, 30_000);
    ok('the running turn is labelled with the CLI\'s own answer, not a picker',
        /haiku/.test(bh.turnModel || ''));
    bh = await waitFor(idh, x => x.status === 'idle' && !!x.lastTurn, 90_000);
    ok('…and the turn that just ended keeps it', /haiku/.test((bh.lastTurn || {}).model || ''));
    host.close(idh);

    // ---------- 8. closing ----------
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
