// N-4 — THE A2A STORES OVER THE BRIDGE (compiled core/a2aBridge.js).
//
// N-3 built two stores nothing could talk to; this is the door. What is pinned:
//   * ‼️ THE CALLER SAYS WHO IT IS OR THE SESSION DOES — an `agent=` is taken as
//     written, without one the CLI's published session id is looked up on the
//     host, and an op that writes refuses when neither names anyone;
//   * ‼️ THE PROJECT IS FILLED IN THE WAY NOTICES FILL IT IN (N-1): omitted = the
//     project the caller runs under (and the answer says so), a name resolves to
//     the id, "*" means every project and is never overridden;
//   * every handler CALLS the store: claim is compare-and-set through the same
//     lock, a refusal is a BridgeRefusal with the reason as data;
//   * reading a note MARKS it read; listing does not;
//   * a finished task leaves a RESULT NOTE addressed to the agent that handed it
//     over, so the caller is woken by its own next list rather than by polling;
//   * a note that already has a live task is not promoted twice by accident;
//   * only the holder heartbeats / finishes; only the holder or the poster hands on;
//   * the loop guard blocks the third handoff — and a HUMAN reroute is the way
//     out: no guard, depth reset, the user's directive travelling with the work;
//   * a directive can be set on a note or a task by id, and taken off again;
//   * a2a.status is the session-start glance, in figures.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { registerA2AOps, listArg } = require(path.join(__dirname, '..', 'out', 'core', 'a2aBridge.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
const { A2ANotesStore } = require(path.join(__dirname, '..', 'out', 'core', 'a2aNotes.js'));
const { A2ATasksStore } = require(path.join(__dirname, '..', 'out', 'core', 'a2aTasks.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-a2a-bridge-'));

(async () => {
    try {
        const notes = new A2ANotesStore(path.join(dir, 'notes.json'));
        const tasks = new A2ATasksStore(path.join(dir, 'tasks.json'));
        let changes = 0;
        const reg = new BridgeRegistry();
        registerA2AOps(reg, {
            notes, tasks,
            agentOfSession: (sid) => ({ 'sid-dev': 'developer', 'sid-mgr': 'manager' })[sid],
            inferProject: (agent) => agent === 'developer' ? 'prj_af' : undefined,
            resolveProject: (key) => ({ 'prj_af': 'prj_af', 'agent farm': 'prj_af', 'prj_ts': 'prj_ts' })[key.toLowerCase()],
            onChange: () => { changes++; }
        });
        const call = (op, args = {}, from) => reg.dispatch(op, args, from);

        // ---------- listArg: both shapes the CLI produces ----------
        ok('listArg takes an array', listArg({ x: [' a ', 'b', ''] }, 'x').join() === 'a,b');
        ok('listArg takes a csv', listArg({ x: 'a, b ,,c' }, 'x').join() === 'a,b,c');
        ok('listArg absent is empty', listArg({}, 'x').length === 0);

        // ---------- the catalogue ----------
        const cat = (await call('farm.ops')).result.map(o => o.op);
        for (const op of ['a2a.notes.post', 'a2a.notes.list', 'a2a.notes.get', 'a2a.notes.resolve', 'a2a.notes.sweep',
            'a2a.tasks.add', 'a2a.tasks.fromNote', 'a2a.tasks.list', 'a2a.tasks.next', 'a2a.tasks.claim',
            'a2a.tasks.heartbeat', 'a2a.tasks.finish', 'a2a.tasks.cancel', 'a2a.tasks.handoff',
            'a2a.directive.set', 'a2a.directive.remove', 'a2a.tasks.reroute', 'a2a.status']) {
            ok(`${op} is in farm.ops`, cat.includes(op));
        }

        // ---------- who is speaking ----------
        const anon = await call('a2a.notes.post', { title: 'x' });
        ok('‼️ a note from nobody is refused, and the refusal says how to say who you are',
            !anon.ok && /agent=<name>/.test(anon.error));
        const bySession = await call('a2a.notes.post', { title: 'from a session' }, { sessionId: 'sid-dev' });
        ok('‼️ the session the CLI published names the agent', bySession.ok && bySession.result.fromAgent === 'developer');
        ok('…and the project is the one that agent runs under, and the answer says so',
            bySession.result.project === 'prj_af' && /session/.test(bySession.result.projectFrom));
        ok('…and the session id travels on the note', bySession.result.fromSessionId === 'sid-dev');
        const byName = await call('a2a.notes.post', { title: 'by name', agent: 'manager', project: 'Agent Farm' });
        ok('agent= is taken as written', byName.ok && byName.result.fromAgent === 'manager');
        ok('a project NAME resolves to the id', byName.result.project === 'prj_af' && byName.result.projectFrom === undefined);
        const star = await call('a2a.notes.post', { title: 'to all', agent: 'developer', project: '*' });
        ok('‼️ project="*" is every project, never overridden by inference', star.result.project === '*');
        const unknownProj = await call('a2a.notes.post', { title: 'p', agent: 'manager', project: 'nowhere' });
        ok('an unknown project key is kept as a coordinate rather than guessed at', unknownProj.result.project === 'nowhere');

        // ---------- validation is by name ----------
        const badCat = await call('a2a.notes.post', { title: 'x', agent: 'developer', category: 'gossip' });
        ok('a category off the list is refused by name', !badCat.ok && /category must be one of/.test(badCat.error));
        const badStrict = await call('a2a.notes.post', { title: 'x', agent: 'developer', strictness: 'very' });
        ok('a strictness off the list is refused by name', !badStrict.ok && /strictness must be one of/.test(badStrict.error));

        // ---------- a note with coordinates, ttl and files ----------
        const conv = await call('a2a.notes.post', {
            agent: 'developer', title: 'Never argStr an optional arg', body: 'X-334 — describe `?` means optStr.',
            project: 'prj_af', subsystem: 'bridge', topic: 'conventions', targetRole: 'manager',
            strictness: 'hard', category: 'convention', contextFiles: 'src/core/bridge.ts, test/test_bridge.js', ttlHours: 2
        });
        ok('a csv contextFiles arrives as a list', conv.result.contextFiles.length === 2);
        ok('ttlHours becomes an expiry in ms', conv.result.expiresAt > Date.now() + 7_000_000);

        // ---------- listing: coordinates, unread, fromMe ----------
        const asMgr = await call('a2a.notes.list', { agent: 'manager', project: 'prj_af', role: 'manager' });
        ok('the manager sees the convention note addressed to it', asMgr.ok && asMgr.result.rows.some(n => n.id === conv.result.id));
        const asOther = await call('a2a.notes.list', { agent: 'explorer', project: 'prj_af', role: 'explorer' });
        ok('‼️ a hard note is not shown to a role it was not for', !asOther.result.rows.some(n => n.id === conv.result.id));
        ok('…while the broadcast still is', asOther.result.rows.some(n => n.id === star.result.id));
        const unreadNoAgent = await call('a2a.notes.list', { unreadOnly: true });
        ok('unreadOnly without an agent is refused', !unreadNoAgent.ok && /agent=<name>/.test(unreadNoAgent.error));
        const fromMe = await call('a2a.notes.list', { agent: 'manager', fromMe: true, includeExpired: true });
        ok('fromMe lists only what I wrote', fromMe.result.rows.length === 2 && fromMe.result.rows.every(n => n.fromAgent === 'manager'));
        const limited = await call('a2a.notes.list', { limit: 1 });
        ok('limit cuts the page but total says the whole', limited.result.rows.length === 1 && limited.result.total >= 5);

        // ---------- reading marks; peeking does not ----------
        const peek = await call('a2a.notes.get', { id: conv.result.id, agent: 'manager', markRead: false });
        ok('markRead=false leaves no trace', peek.ok && peek.result.readBy.length === 0);
        const got = await call('a2a.notes.get', { id: conv.result.id, agent: 'manager' });
        ok('‼️ reading a note marks it read for the reader', got.result.readBy.includes('manager'));
        const unread = await call('a2a.notes.list', { agent: 'manager', unreadOnly: true, role: 'manager', project: 'prj_af' });
        ok('…and it leaves the unread list', !unread.result.rows.some(n => n.id === conv.result.id));
        const again = await call('a2a.notes.get', { id: conv.result.id, agent: 'manager' });
        ok('reading twice is not news (idempotent)', again.result.readBy.filter(r => r === 'manager').length === 1);
        const missing = await call('a2a.notes.get', { id: 'nnope' });
        ok('a missing note is refused by id', !missing.ok && /No such note "nnope"/.test(missing.error));

        // ---------- tasks: add, next (FIFO), claim (compare-and-set), heartbeat, finish ----------
        const t1 = await call('a2a.tasks.add', {
            title: 'Fix the flaky test', instructions: 'test_x is red one run in five', expectedOutput: 'green 20 times',
            targetRole: 'developer', requires: 'write_tools', maxTurns: 10, sourceQueueItemId: 'wq-7'
        }, { sessionId: 'sid-mgr' });
        ok('a task from a session names its poster', t1.ok && t1.result.fromAgent === 'manager' && t1.result.state === 'queued');
        ok('requires arrives as a list, the queue item as a link', t1.result.requires.join() === 'write_tools' && t1.result.sourceQueueItemId === 'wq-7');
        ok('the manager runs under no project, so the task is for every project', t1.result.project === '*');
        await new Promise(r => setTimeout(r, 5));
        const t2 = await call('a2a.tasks.add', { title: 'Write the release note', agent: 'manager', targetRole: 'developer', project: 'prj_af' });
        ok('a second task', t2.ok);

        const noCap = await call('a2a.tasks.next', { agent: 'developer', role: 'developer' });
        ok('‼️ next skips a task whose requires I lack, and offers the next one', noCap.ok && noCap.result.task.id === t2.result.id && noCap.result.waiting === 0);
        const nextDev = await call('a2a.tasks.next', { agent: 'developer', role: 'developer', capabilities: 'write_tools,browser' });
        ok('next is FIFO — the oldest open task first', nextDev.result.task.id === t1.result.id && nextDev.result.waiting === 1);
        const nextMgr = await call('a2a.tasks.next', { agent: 'manager', role: 'manager', capabilities: 'write_tools' });
        ok('a role the task was not for gets nothing (preferred, no hit, a miss)', nextMgr.result.task === null);

        const claimed = await call('a2a.tasks.claim', { id: t1.result.id, role: 'developer', capabilities: 'write_tools', leaseMinutes: 45 }, { sessionId: 'sid-dev' });
        ok('claim by session', claimed.ok && claimed.result.state === 'claimed' && claimed.result.claimedBy.agent === 'developer');
        ok('…with the session on the claim and the lease as asked', claimed.result.claimedBy.sessionId === 'sid-dev'
            && claimed.result.claimedBy.leaseExpiresAt - Date.now() > 44 * 60_000);
        const second = await call('a2a.tasks.claim', { id: t1.result.id, agent: 'explorer', capabilities: 'write_tools' });
        ok('‼️ the second claimant is refused with the reason as DATA', !second.ok && /already claimed/.test(second.error)
            && second.detail && second.detail.refused === 'already claimed');
        const noSuch = await call('a2a.tasks.claim', { id: 'tnope', agent: 'developer' });
        ok('claiming a missing task is refused by id', !noSuch.ok && /No such task/.test(noSuch.error));

        const notHolder = await call('a2a.tasks.heartbeat', { id: t1.result.id, agent: 'explorer', progress: 'x' });
        ok('‼️ only the holder heartbeats', !notHolder.ok && /not held by explorer \(held by developer\)/.test(notHolder.error));
        const hb = await call('a2a.tasks.heartbeat', { id: t1.result.id, agent: 'developer', progress: 'found the race' });
        ok('a heartbeat records progress and moves claimed → running', hb.ok && hb.result.state === 'running' && hb.result.claimedBy.progress === 'found the race');

        const mine = await call('a2a.tasks.list', { agent: 'developer', mine: true });
        ok('mine lists what I hold', mine.result.rows.length === 1 && mine.result.rows[0].id === t1.result.id);
        const theirs = await call('a2a.tasks.list', { agent: 'manager', fromMe: true });
        ok('fromMe lists what I handed over, with its state', theirs.result.rows.length === 2 && theirs.result.rows.some(t => t.state === 'running'));
        const claimable = await call('a2a.tasks.list', { agent: 'developer', claimable: true, role: 'developer' });
        ok('claimable lists only what I could take now', claimable.result.rows.length === 1 && claimable.result.rows[0].id === t2.result.id);
        const badState = await call('a2a.tasks.list', { state: 'pending' });
        ok('a state off the list is refused by name', !badState.ok && /state must be one of/.test(badState.error));

        const notHolderFinish = await call('a2a.tasks.finish', { id: t1.result.id, agent: 'manager', result: 'x' });
        ok('only the holder finishes', !notHolderFinish.ok && /not held by manager/.test(notHolderFinish.error));
        const fin = await call('a2a.tasks.finish', { id: t1.result.id, agent: 'developer', result: 'Race in the fixture; fixed and ran 20x green.' });
        ok('finish closes the task as done', fin.ok && fin.result.task.state === 'done' && /20x green/.test(fin.result.task.resultSummary));
        ok('‼️ …and leaves a RESULT NOTE addressed to the poster', fin.result.resultNote && fin.result.resultNote.category === 'result'
            && fin.result.resultNote.targetRole === 'manager' && fin.result.resultNote.fromAgent === 'developer'
            && /done: Fix the flaky test/.test(fin.result.resultNote.title));
        const wake = await call('a2a.notes.list', { agent: 'manager', role: 'manager', unreadOnly: true, category: 'result' });
        ok('…which the poster finds on its own next unread list', wake.result.rows.some(n => n.id === fin.result.resultNote.id));
        const quiet = await call('a2a.tasks.claim', { id: t2.result.id, agent: 'developer', role: 'developer' });
        const finQuiet = await call('a2a.tasks.finish', { id: t2.result.id, agent: 'developer', state: 'failed', result: 'no', notify: false });
        ok('notify=false leaves no note; state=failed is honoured', quiet.ok && finQuiet.ok && finQuiet.result.resultNote === null && finQuiet.result.task.state === 'failed');
        const badFinish = await call('a2a.tasks.claim', { id: t2.result.id, agent: 'developer' });
        ok('a finished task is not open for claiming', !badFinish.ok && /not open for claiming/.test(badFinish.error));

        // ---------- fromNote: once, unless meant ----------
        const promo = await call('a2a.tasks.fromNote', { id: conv.result.id, agent: 'manager', requires: 'write_tools', expectedOutput: 'a test that pins it' });
        ok('a note becomes a task carrying sourceNoteId and its coordinates', promo.ok && promo.result.sourceNoteId === conv.result.id
            && promo.result.title === conv.result.title && promo.result.targetRole === 'manager' && promo.result.workdir === 'bridge'
            && promo.result.strictness === 'hard' && promo.result.expectedOutput === 'a test that pins it');
        ok('…the body and the files become the instructions', /X-334/.test(promo.result.instructions) && /bridge\.ts/.test(promo.result.instructions));
        const twice = await call('a2a.tasks.fromNote', { id: conv.result.id, agent: 'manager' });
        ok('‼️ promoting it again is refused, naming the live task', !twice.ok && twice.detail && twice.detail.taskId === promo.result.id);
        const meant = await call('a2a.tasks.fromNote', { id: conv.result.id, agent: 'manager', again: true, resolveNote: true });
        ok('again=true makes another; resolveNote closes the note', meant.ok && meant.result.id !== promo.result.id
            && (await call('a2a.notes.get', { id: conv.result.id, markRead: false })).result.resolved === true);
        await call('a2a.tasks.cancel', { id: meant.result.id, why: 'duplicate' });

        // ---------- handoff: holder or poster, then the loop guard, then a human ----------
        const h0 = await call('a2a.tasks.add', { title: 'Round trip', agent: 'manager', targetRole: 'developer' });
        const stranger = await call('a2a.tasks.handoff', { id: h0.result.id, agent: 'explorer', targetRole: 'developer' });
        ok('‼️ a stranger cannot hand a task on', !stranger.ok && /neither held nor posted by explorer/.test(stranger.error));
        const h1 = await call('a2a.tasks.handoff', { id: h0.result.id, agent: 'manager', targetRole: 'explorer' });
        ok('the poster hands on: a NEW task, depth 1, the old one closed with the trail',
            h1.ok && h1.result.parentTaskId === h0.result.id && h1.result.handoffDepth === 1 && h1.result.targetRole === 'explorer'
            && tasks.list().find(t => t.id === h0.result.id).state === 'done');
        await call('a2a.tasks.claim', { id: h1.result.id, agent: 'explorer', role: 'explorer' });
        const h2 = await call('a2a.tasks.handoff', { id: h1.result.id, agent: 'explorer', targetRole: 'developer' });
        ok('the holder hands on: depth 2', h2.ok && h2.result.handoffDepth === 2);
        await call('a2a.tasks.claim', { id: h2.result.id, agent: 'developer', role: 'developer' });
        const h3 = await call('a2a.tasks.handoff', { id: h2.result.id, agent: 'developer', targetRole: 'explorer' });
        ok('‼️ THE LOOP GUARD: the third handoff is refused as data and the task is BLOCKED, not cancelled',
            !h3.ok && /loop guard/.test(h3.error) && h3.detail && h3.detail.state === 'blocked'
            && tasks.list().find(t => t.id === h2.result.id).state === 'blocked');
        const dir1 = await call('a2a.directive.set', { id: h2.result.id, kind: 'steer', text: 'Explorer does it; developer only reviews.' });
        ok('the user sets a directive on the blocked task', dir1.ok && dir1.result.humanDirective.kind === 'steer');
        const rr = await call('a2a.tasks.reroute', { id: h2.result.id, targetRole: 'explorer', project: 'Agent Farm', why: 'wrong role' });
        ok('‼️ a HUMAN reroute passes the guard: a new task at depth 0, under the project named, the directive travelling with it',
            rr.ok && rr.result.handoffDepth === 0 && rr.result.parentTaskId === h2.result.id && rr.result.project === 'prj_af'
            && rr.result.fromAgent === 'user' && rr.result.humanDirective && rr.result.humanDirective.kind === 'steer');
        ok('…and the old one says why', /wrong role/.test(tasks.list().find(t => t.id === h2.result.id).resultSummary));
        const rrDone = await call('a2a.tasks.reroute', { id: h0.result.id, targetRole: 'x' });
        ok('a task already closed is not rerouted', !rrDone.ok && /is done/.test(rrDone.error));

        // ---------- directives on notes, and off again ----------
        const nd = await call('a2a.directive.set', { id: star.result.id, kind: 'veto', text: 'Not this.' });
        ok('a directive lands on a note by id', nd.ok && nd.result.humanDirective.kind === 'veto');
        const badKind = await call('a2a.directive.set', { id: star.result.id, kind: 'hint', text: 'x' });
        ok('a kind off the list is refused by name', !badKind.ok && /kind must be one of/.test(badKind.error));
        const off = await call('a2a.directive.remove', { id: star.result.id });
        ok('…and is taken off again — the key is gone, not set to nothing', off.ok && !('humanDirective' in off.result));
        const offTask = await call('a2a.directive.remove', { id: rr.result.id });
        ok('the same for a task', offTask.ok && !('humanDirective' in offTask.result));

        // ---------- status: the session-start glance ----------
        const st = await call('a2a.status', { agent: 'manager', role: 'manager' });
        ok('status names the agent and counts its unread notes', st.ok && st.result.agent === 'manager' && st.result.unreadNotes >= 1);
        ok('…what it handed over, by state', st.result.handedOver.done >= 2 && st.result.handedOver.failed === 1);
        ok('…and what is blocked waiting for a person', Array.isArray(st.result.blocked));
        const stDev = await call('a2a.status', { agent: 'developer', role: 'developer' });
        ok('a holder sees its lease', Array.isArray(stDev.result.held));
        const stAnon = await call('a2a.status', {});
        ok('status without an agent still answers the board-wide figures', stAnon.ok && stAnon.result.agent === null && typeof stAnon.result.claimable === 'number');

        // ---------- resolve, sweep, cancel ----------
        const res = await call('a2a.notes.resolve', { id: byName.result.id });
        ok('resolve closes a note', res.ok && res.result.resolved === true);
        const reopen = await call('a2a.notes.resolve', { id: byName.result.id, resolved: false });
        ok('resolved=false reopens it', reopen.ok && reopen.result.resolved === false);
        const sw = await call('a2a.notes.sweep');
        ok('sweep drops nothing that is unresolved or without a ttl', sw.ok && sw.result.dropped === 0);
        const cancelled = await call('a2a.tasks.cancel', { id: rr.result.id, why: 'moot' });
        ok('cancel stops a task and records why', cancelled.ok && cancelled.result.state === 'cancelled' && cancelled.result.resultSummary === 'moot');

        ok('every write told the host something changed', changes >= 25);

        // ---------- the extension wires it ----------
        {
            const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
            ok('the extension registers the A2A ops', /registerA2AOps\(bridge, \{/.test(ext));
            ok('…over two files under globalStorage', /'a2a-notes\.json'/.test(ext) && /'a2a-tasks\.json'/.test(ext));
            ok('‼️ …with the project inferred the way notices infer it (N-1), the same function',
                /inferProject: projectOfRunningAgent/.test(ext));
            ok('…and the caller named from the session the CLI published, hosted card first',
                /agentOfSession: \(sid\) => consoleHost\.list\(\)\.find\(s => s\.sessionId === sid\)\?\.agentName/.test(ext));
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
