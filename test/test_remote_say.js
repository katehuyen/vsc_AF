// X-446 — THE PHONE'S console.send MEETS TELEGRAM'S GATE: one ledger, one cap,
// one queue, one billing, and a confirmation honoured only against what this
// device was shown.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { remoteSay, phoneKey, phoneOfKey, CONFIRM_TTL_MS } = require(path.join(ROOT, 'out', 'core', 'remoteSay.js'));
const { turnEnded } = require(path.join(ROOT, 'out', 'core', 'telegramExecution.js'));

function farm(o = {}) {
    let state = { ledger: { day: 'd1', usd: 0 }, inbox: {}, pending: {}, seen: {}, routing: { keep: true }, ...(o.state || {}) };
    const sessions = { s1: { status: 'idle', turns: 3, engine: 'claude', costUSD: 2 }, ...(o.sessions || {}) };
    const sent = [];
    let t = 1000;
    const d = {
        live: id => sessions[id],
        steerable: e => e === 'claude',
        label: id => 'dev/' + id,
        state: () => state,
        save: async next => { state = next; },
        cfg: () => ({ whenBusy: o.whenBusy || 'queue', maxDailyUSD: o.cap ?? 1 }),
        send: (id, text) => { if (!sessions[id]) { return undefined; } if (o.refuse) { return { refused: o.refuse }; } sent.push([id, text]); return {}; },
        day: () => 'd1',
        now: () => t
    };
    return { d, sent, sessions, get state() { return state; }, tick: ms => { t += ms; } };
}

(async () => {
    let f = farm();
    let r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'carry on' });
    ok('an idle conversation takes the words', r.ok && f.sent.length === 1 && f.sent[0][1] === 'carry on');
    ok('…the phone is told where they went', r.result.note === '→ dev/s1');
    ok('…and the turn is marked for the shared ledger at what it cost so far', f.state.seen.s1 === 2);
    ok('…the rest of the chat state is left as it was', f.state.routing.keep === true);

    f = farm({ sessions: { s1: { status: 'working', turns: 4, engine: 'claude', costUSD: 2 } } });
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'and then this' });
    ok('a running turn queues it (Telegram\'s whenBusy)', r.ok && r.result.held === true && f.sent.length === 0);
    ok('…in the persisted inbox, marked as the phone\'s', f.state.inbox.s1.length === 1 && f.state.inbox.s1[0].device === 'dev_a' && f.state.inbox.s1[0].chat === 0);
    ok('…and the phone reads the note', /Queued/.test(r.result.note));
    const second = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'and this too' });
    ok('a second parked message says how many wait', /\(2 waiting\)/.test(second.result.note));
    const end = turnEnded(f.state, 's1', 3, 'd1');
    ok('the turn end releases the first parked phone message, carrying its device', end.release && end.release.device === 'dev_a' && end.release.text === 'and then this');

    f = farm({ sessions: { s1: { status: 'working', turns: 4, engine: 'claude', costUSD: 2 } }, whenBusy: 'steer' });
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'steer it' });
    ok('with whenBusy steer a steerable running turn takes it now', r.ok && f.sent.length === 1 && !r.result.held);

    f = farm({ state: { ledger: { day: 'd1', usd: 5 } } });
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'one more' });
    ok('over the shared budget nothing is sent', r.ok && r.result.sent === false && r.result.confirm === 'budget' && f.sent.length === 0);
    ok('…the phone is shown why, in the same words as Telegram', /budget is used up/.test(r.result.note) && /Not sent yet/.test(r.result.note));
    ok('…and a confirmation is held for this device and text', f.state.pending[phoneKey('dev_a')].text === 'one more' && f.state.pending[phoneKey('dev_a')].why === 'budget');
    r = await remoteSay(f.d, 'dev_b', { id: 's1', text: 'one more', confirm: 'budget' });
    ok('another device cannot confirm it', !r.ok && /nothing to confirm/.test(r.error) && f.sent.length === 0);
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'other words', confirm: 'budget' });
    ok('other words cannot ride on it', !r.ok && f.sent.length === 0);
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'one more', confirm: 'budget' });
    ok('the device that was asked confirms it, and it goes in', r.ok && f.sent.length === 1 && f.sent[0][1] === 'one more');
    ok('…and the confirmation is spent', !f.state.pending[phoneKey('dev_a')]);
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'one more', confirm: 'budget' });
    ok('…so it cannot be used twice', !r.ok && f.sent.length === 1);

    f = farm();
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'please rm -rf build' });
    ok('a destructive command waits for a confirmation', r.ok && r.result.confirm === 'risk' && /cannot be undone/.test(r.result.note) && f.sent.length === 0);
    f.tick(CONFIRM_TTL_MS + 1);
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'please rm -rf build', confirm: 'risk' });
    ok('a confirmation answered too late is refused', !r.ok && f.sent.length === 0);
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'please rm -rf build', confirm: 'everything' });
    ok('an unknown gate cannot be confirmed', !r.ok);

    f = farm();
    r = await remoteSay(f.d, 'dev_a', { id: 'gone', text: 'hello?' });
    ok('a conversation that is not live is refused in words', !r.ok && /no longer live/.test(r.error));
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: '   ' });
    ok('empty words are refused', !r.ok && /needs id and text/.test(r.error));
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'see this', attach: ['C:/x.png'] });
    ok('a path to attach is not taken from a phone', !r.ok && /attachments/.test(r.error) && f.sent.length === 0);
    f = farm({ refuse: 'the session is closing' });
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'hi' });
    ok('the conversation\'s own refusal reaches the phone', !r.ok && r.error === 'the session is closing');

    f = farm({ state: { ledger: { day: 'd1', usd: 5 } } });
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'parked earlier' }, 'budget');
    ok('a released message carries the gate it already passed', r.ok && f.sent.length === 1);

    f = farm({ state: { ledger: { day: 'd1', usd: 5 } } });
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'then rm -rf build' });
    ok('over budget AND destructive asks the budget first', r.ok && r.result.confirm === 'budget');
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'then rm -rf build', confirm: 'budget' });
    ok('…then the risk, keeping the budget yes', r.ok && r.result.confirm === 'risk' && f.sent.length === 0
        && f.state.pending[phoneKey('dev_a')].waived.join() === 'budget');
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'then rm -rf build', confirm: 'risk' });
    ok('…and after the second yes it goes in, never round to the budget again',
        r.ok && f.sent.length === 1 && !f.state.pending[phoneKey('dev_a')]);
    ok('a pending key names its device, a chat id none', phoneOfKey(phoneKey('dev_a')) === 'dev_a' && phoneOfKey('12345') === undefined);

    f = farm({ state: { ledger: { day: 'd1', usd: 5 } }, sessions: { s1: { status: 'working', turns: 4, engine: 'claude', costUSD: 2 } } });
    await remoteSay(f.d, 'dev_a', { id: 's1', text: 'later rm -rf x' });
    await remoteSay(f.d, 'dev_a', { id: 's1', text: 'later rm -rf x', confirm: 'budget' });
    r = await remoteSay(f.d, 'dev_a', { id: 's1', text: 'later rm -rf x', confirm: 'risk' });
    ok('both yeses park with the message on a busy conversation', r.ok && r.result.held === true && f.state.inbox.s1[0].waived.join() === 'budget,risk');
    f.sessions.s1.status = 'idle';
    const rel = turnEnded(f.state, 's1', 3, 'd1');
    r = await remoteSay(f.d, rel.release.device, { id: 's1', text: rel.release.text }, rel.release.waived);
    ok('…and it goes in at the turn end without a third question', r.ok && f.sent.length === 1 && f.sent[0][1] === 'later rm -rf x');

    console.log(`remote say: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
