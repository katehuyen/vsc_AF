// X-442 — WHAT THE PHONE HEARS: Console cards, the Needs You queue, usage
// readings and Notices turned into the remote contract's events, each fact once.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const R = require(path.join(__dirname, '..', 'out', 'core', 'remoteEvents.js'));

// ---------- Console ----------
const ASK = { requestId: 'r1', questions: [{ question: 'Deploy?', options: [{ label: 'Yes', description: 'go' }, { label: 'No' }] }] };
const TWO = { requestId: 'r2', questions: [{ question: 'A?', options: [{ label: 'x' }] }, { question: 'B?', options: [] }] };
const st = extra => Object.assign({
    id: 's1', agentName: 'developer', status: 'idle',
    messages: [{ role: 'user', text: 'Fix the build\nplease' }, { role: 'agent', text: 'Done: tests green.' }],
    lastTurn: { endedAt: 1000 }
}, extra || {});

let m = R.EMPTY_CONSOLE_MEMO;
let r = R.consoleEvents(m, 's1', st(), ['s1']);
ok('first sight of a finished card says nothing (it is not news)', r.events.length === 0);
m = r.memo;
r = R.consoleEvents(m, 's1', st({ lastTurn: { endedAt: 2000 } }), ['s1']);
const turn = r.events.find(e => e.type === 'turn.finished');
ok('a new turn end is turn.finished', r.events.length === 1 && !!turn);
ok('turn.finished carries session, agent, title (first line asked) and summary',
    turn && turn.data.session === 's1' && turn.data.agent === 'developer'
    && turn.data.title === 'Fix the build' && turn.data.summary === 'Done: tests green.');
m = r.memo;
ok('the same turn end twice is said once', R.consoleEvents(m, 's1', st({ lastTurn: { endedAt: 2000 } }), ['s1']).events.length === 0);

const long = 'x'.repeat(1000);
const lr = R.consoleEvents(m, 's1', st({ lastTurn: { endedAt: 3000 }, messages: [{ role: 'agent', text: long }] }), ['s1']);
const ls = lr.events[0].data.summary;
ok('a long summary keeps its END, cut to 400 with an ellipsis', ls.length === 400 && ls.startsWith('…') && ls.endsWith('x'));
ok('a card with no question in it names the agent as its title', lr.events[0].data.title === 'developer');

r = R.consoleEvents(m, 's1', st({ lastTurn: { endedAt: 2000 }, pendingAsk: ASK }), ['s1']);
const ask = r.events.find(e => e.type === 'ask.opened');
ok('an open question is ask.opened with its request id', ask && ask.data.askId === 'r1' && ask.data.question === 'Deploy?');
ok('a single question carries its options (labels only)',
    ask && ask.data.options.length === 2 && ask.data.options[0].label === 'Yes' && ask.data.options[0].description === undefined);
m = r.memo;
ok('the same question twice is said once', R.consoleEvents(m, 's1', st({ lastTurn: { endedAt: 2000 }, pendingAsk: ASK }), ['s1']).events.length === 0);
r = R.consoleEvents(m, 's1', st({ lastTurn: { endedAt: 2000 }, pendingAsk: TWO }), ['s1']);
ok('a many-question ask carries no options: one tap cannot answer it', r.events[0].data.options.length === 0 && r.events[0].data.question === 'A?');
const empty = R.consoleEvents(R.EMPTY_CONSOLE_MEMO, 's9', st({ id: 's9', pendingAsk: { requestId: 'p', questions: [] } }), ['s9']);
ok('an ask with no questions (a permission) is not ask.opened', !empty.events.some(e => e.type === 'ask.opened'));

r = R.consoleEvents(m, 's1', undefined, []);
ok('a card that goes away is session.ended with its agent', r.events.length === 1
    && r.events[0].type === 'session.ended' && r.events[0].data.agent === 'developer' && r.events[0].data.session === 's1');
ok('and the memo forgets it', r.memo.agent.s1 === undefined && r.memo.digest.turnAt.s1 === undefined);
ok('an unknown card going away says nothing', R.consoleEvents(r.memo, 's1', undefined, []).events.length === 0);

// ---------- Needs You ----------
const perm = (sid, detail) => ({ urgency: 0, kind: 'permission', agentName: 'dev', title: 'Permission', detail, ref: { sessionId: sid } });
const idle = { urgency: 5, kind: 'idle', agentName: 'x', title: 'Idle', detail: '', ref: {} };
let n = R.needsEvents(R.EMPTY_NEEDS_MEMO, []);
ok('first sight of an empty queue says its count (0)', n.events.length === 1 && n.events[0].type === 'needs.changed' && n.events[0].data.count === 0);
ok('an empty queue has no top', n.events[0].data.top === undefined);
n = R.needsEvents(n.memo, [perm('a', 'wants to use Bash'), idle]);
const po = n.events.find(e => e.type === 'permission.opened');
ok('a new permission row is permission.opened, keyed by its needKey', po && po.data.permId === 'permission|a' && po.data.key === 'permission|a');
ok('the tool is read from "to use X"', po && po.data.tool === 'Bash' && po.data.session === 'a' && po.data.summary === 'wants to use Bash');
const nc = n.events.find(e => e.type === 'needs.changed');
ok('only blocking rows count', nc && nc.data.count === 1 && nc.data.top.kind === 'permission');
n = R.needsEvents(n.memo, [perm('a', 'wants to use Bash'), idle]);
ok('the same queue again says nothing', n.events.length === 0);
n = R.needsEvents(n.memo, [perm('a', 'x'), perm('b', 'Edit: src/a.ts')]);
ok('a second permission: only the new one opens', n.events.filter(e => e.type === 'permission.opened').length === 1
    && n.events.find(e => e.type === 'permission.opened').data.tool === 'Edit');
n = R.needsEvents(n.memo, []);
ok('the queue emptying is needs.changed 0', n.events.length === 1 && n.events[0].data.count === 0);
n = R.needsEvents(n.memo, [perm('a', '')]);
ok('a row seen before, gone, then back opens again; no detail falls back to the title',
    n.events.some(e => e.type === 'permission.opened' && e.data.summary === 'Permission' && e.data.tool === ''));

// ---------- Usage ----------
const q = (slotId, percent) => ({ slotId, engine: 'claude', percent, window: '5h' });
let qm = R.EMPTY_QUOTA_MEMO;
let qr = R.quotaEvents(qm, q('A', 89.6), 90);
ok('under the line: nothing', qr.events.length === 0);
qr = R.quotaEvents(qr.memo, q('A', 90), 90);
ok('crossing the line: quota.warn, rounded', qr.events.length === 1 && qr.events[0].type === 'quota.warn'
    && qr.events[0].data.percent === 90 && qr.events[0].data.engine === 'claude' && qr.events[0].data.window === '5h');
qr = R.quotaEvents(qr.memo, q('A', 97), 90);
ok('staying over: said once', qr.events.length === 0);
ok('another slot has its own edge', R.quotaEvents(qr.memo, q('B', 95), 90).events.length === 1);
qr = R.quotaEvents(qr.memo, q('A', 20), 90);
ok('falling back re-arms quietly', qr.events.length === 0 && qr.memo.warned.A === false);
ok('and the next climb warns again', R.quotaEvents(qr.memo, q('A', 91), 90).events.length === 1);
ok('no reading changes nothing', R.quotaEvents(qr.memo, q('A', undefined), 90).memo === qr.memo
    && R.quotaEvents(qr.memo, q('A', NaN), 90).events.length === 0);
ok('the phone is warned at the handover line', R.QUOTA_WARN_PCT === 90);

// ---------- Notices ----------
const ne = R.noticeEvent({ id: 'n1', title: 'Report ready', level: 2, agentName: 'dev', extra: 'no' });
ok('a notice is notice.posted with id, title, level, agent only',
    ne.type === 'notice.posted' && JSON.stringify(ne.data) === JSON.stringify({ id: 'n1', title: 'Report ready', level: 2, agent: 'dev' }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
