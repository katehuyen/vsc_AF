// U-113 — WHICH CONVERSATION A PHONE MESSAGE IS FOR.
//
// The chat bridge could talk to ONE agent. On a farm running three
// conversations at once that is not a missing feature but a wrong answer: a
// message typed about one lands in another, and nothing says it did until the
// wrong agent has acted on it.
//
// What is pinned here is the ORDER and the refusal. Telegram answers the
// question twice before anything has to be remembered — the reply chain and
// the forum topic — so those come first; a remembered focus is third; and
// where nothing decides, the engine refuses and hands back the candidates. A
// confident wrong target is the one outcome this module exists to prevent, so
// "ambiguous" is an answer and not a failure.
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '..', 'out', 'core', 'telegramRouting.js'));
const { parseUpdates } = require(path.join(__dirname, '..', 'out', 'core', 'messaging.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const CHAT = -100123;
const sess = (id, agentName, over = {}) => ({
    id, agentId: agentName, agentName, sessionId: 'sid-' + id,
    project: '', status: 'idle', lastTs: 1, ...over
});
const three = [
    sess('h1', 'developer', { project: 'AgentFarm' }),
    sess('h2', 'asistan'),
    sess('h3', 'developer', { project: 'TalkScribe', status: 'working' })
];
const msg = (over = {}) => ({ chatId: CHAT, ...over });

// ---------- layer 1: the reply chain ----------
{
    let t = R.EMPTY_ROUTING;
    t = R.rememberOutgoing(t, 900, 'h2');
    const r = R.resolve(t, msg({ replyTo: 900 }), three);
    ok('‼️ A REPLY NAMES ITS TARGET EXACTLY', r.kind === 'session' && r.id === 'h2' && r.why === 'reply');
    // ‼️ …and it outranks everything, because it is the only layer that needs
    // no guess at all: the reader pointed at the message.
    let t2 = R.setFocus(R.rememberTopic(t, 7, 'h3'), CHAT, 'h1');
    const r2 = R.resolve(t2, msg({ replyTo: 900, threadId: 7 }), three);
    ok('…and it outranks the topic and the focus', r2.kind === 'session' && r2.id === 'h2');
    // ‼️ A REPLY TO A CONVERSATION THAT ENDED IS NOT A HIT. Telling the reader
    // their instruction reached a session that is gone is worse than asking.
    const r3 = R.resolve(t, msg({ replyTo: 900 }), [three[0], three[2]]);
    ok('‼️ A REMEMBERED ID THAT NO LONGER EXISTS FALLS THROUGH, never answers',
        r3.kind === 'ambiguous' && r3.candidates.length === 2);
    ok('a reply to a message nobody remembers falls through too',
        R.resolve(t, msg({ replyTo: 41 }), three).kind === 'ambiguous');
}

// ---------- layer 2: the forum topic ----------
{
    const t = R.setFocus(R.rememberTopic(R.EMPTY_ROUTING, 12, 'h3'), CHAT, 'h1');
    const r = R.resolve(t, msg({ threadId: 12 }), three);
    ok('a message typed in a topic goes to that topic\'s conversation',
        r.kind === 'session' && r.id === 'h3' && r.why === 'topic');
    ok('…and it outranks the focus, because the reader typed where they typed',
        R.resolve(t, msg({ threadId: 12 }), three).id === 'h3');
    ok('a topic nobody bound falls through to the focus',
        R.resolve(t, msg({ threadId: 99 }), three).id === 'h1');
}

// ---------- layer 3: the focus, and the refusal under it ----------
{
    const t = R.setFocus(R.EMPTY_ROUTING, CHAT, 'h2');
    ok('a plain message goes where the reader last pointed',
        R.resolve(t, msg(), three).why === 'focus');
    ok('another chat does not inherit this chat\'s focus',
        R.resolve(t, msg({ chatId: -999 }), three).kind === 'ambiguous');
    ok('clearing the focus gives the refusal back',
        R.resolve(R.setFocus(t, CHAT, ''), msg(), three).kind === 'ambiguous');
    // ‼️ ONE CONVERSATION IS NOT A CHOICE — asking "which of these one" reads
    // as a broken bridge, and this is the ordinary case on a quiet farm.
    const one = R.resolve(R.EMPTY_ROUTING, msg(), [three[0]]);
    ok('‼️ WITH ONE CONVERSATION OPEN NOTHING IS ASKED',
        one.kind === 'session' && one.id === 'h1' && one.why === 'only-one');
    ok('with none open the answer is none, not an empty question',
        R.resolve(R.EMPTY_ROUTING, msg(), []).kind === 'none');
    // ‼️ THE REFUSAL CARRIES THE CANDIDATES, or the caller has to re-derive
    // them and the numbers in the question stop matching the numbers /focus
    // takes.
    const amb = R.resolve(R.EMPTY_ROUTING, msg(), three);
    ok('‼️ THE QUESTION AND /focus SHARE ONE NUMBERING',
        amb.candidates === three || amb.candidates.every((s, i) => s.id === three[i].id));
    const q = R.askWhich(amb.candidates);
    ok('…and the question numbers them rather than naming them',
        /1\. developer · AgentFarm/.test(q) && /3\. developer · TalkScribe · working/.test(q));
    ok('…because two sessions of one agent is the case this exists for',
        R.pickFocus('3', three).session.id === 'h3');
}

// ---------- /focus, one door for three kinds of answer ----------
{
    ok('a number is the row in the question', R.pickFocus('2', three).session.id === 'h2');
    ok('a host id is taken as it is', R.pickFocus('h3', three).session.id === 'h3');
    ok('…and so is the engine\'s own session id', R.pickFocus('sid-h1', three).session.id === 'h1');
    ok('an agent with one conversation is named by its name',
        R.pickFocus('asistan', three).session.id === 'h2');
    ok('…case does not decide it', R.pickFocus('ASISTAN', three).session.id === 'h2');
    // ‼️ An agent with TWO conversations is the ambiguity, not a first-wins.
    const a = R.pickFocus('developer', three);
    ok('‼️ AN AGENT RUNNING TWICE IS ASKED ABOUT, NEVER TAKEN FIRST-WINS',
        a.kind === 'ambiguous' && a.candidates.length === 2);
    ok('a word that matches nothing is none, not the first row',
        R.pickFocus('nobody', three).kind === 'none'
        && R.pickFocus('', three).kind === 'none'
        && R.pickFocus('9', three).kind === 'none');
}

// ---------- the table stays honest ----------
{
    // ‼️ Every turn the bot sends adds an entry, so an unbounded map is a
    // memory leak with a long fuse; the newest survive because the oldest are
    // the ones nobody will reply to.
    let t = R.EMPTY_ROUTING;
    for (let i = 1; i <= 12; i++) { t = R.rememberOutgoing(t, i, 'h1', 5); }
    const keys = Object.keys(t.byMessage).map(Number).sort((a, b) => a - b);
    ok('‼️ THE REPLY MAP IS BOUNDED, AND IT IS THE NEWEST THAT SURVIVE',
        keys.length === 5 && keys[0] === 8 && keys[4] === 12);
    ok('…and the default bound is generous, because an entry is two strings',
        R.REPLY_MEMORY >= 500);
    // A table mutated in place is one an open page cannot notice.
    const before = R.EMPTY_ROUTING;
    R.rememberOutgoing(before, 5, 'h1');
    R.rememberTopic(before, 5, 'h1');
    R.setFocus(before, CHAT, 'h1');
    ok('every write returns a new table and touches nothing',
        Object.keys(before.byMessage).length === 0
        && Object.keys(before.byTopic).length === 0
        && Object.keys(before.focus).length === 0);
    // ‼️ A conversation that ended must not keep its seat in any of the three.
    let t2 = R.setFocus(R.rememberTopic(R.rememberOutgoing(R.EMPTY_ROUTING, 5, 'h2'), 3, 'h2'), CHAT, 'h2');
    t2 = R.forgetGone(t2, [three[0]]);
    ok('‼️ AN ENDED CONVERSATION IS DROPPED FROM ALL THREE MAPS',
        !Object.keys(t2.byMessage).length && !Object.keys(t2.byTopic).length
        && !Object.keys(t2.focus).length);
    ok('…and a live one is kept',
        Object.keys(R.forgetGone(R.rememberOutgoing(R.EMPTY_ROUTING, 5, 'h1'), three).byMessage).length === 1);
    ok('a write with nothing to write changes nothing',
        R.rememberOutgoing(R.EMPTY_ROUTING, 0, 'h1') === R.EMPTY_ROUTING
        && R.rememberOutgoing(R.EMPTY_ROUTING, 5, '') === R.EMPTY_ROUTING
        && R.rememberTopic(R.EMPTY_ROUTING, 0, 'h1') === R.EMPTY_ROUTING);
}

// ---------- the two facts have to survive the transport ----------
{
    // ‼️ Layers 1 and 2 are Telegram's own answers, and until this they were
    // parsed away: `parseUpdates` kept the text and dropped the reply and the
    // thread, which is what made the bridge a single-session toy.
    const [m] = parseUpdates({
        ok: true,
        result: [{
            update_id: 7,
            message: {
                message_id: 42, message_thread_id: 12, date: 1,
                reply_to_message: { message_id: 900 },
                text: ' go ', chat: { id: CHAT }, from: { username: 'murat' }
            }
        }]
    });
    ok('‼️ THE REPLY AND THE TOPIC REACH THE ROUTER AT ALL',
        m.messageId === 42 && m.replyTo === 900 && m.threadId === 12);
    ok('…and the message still is what it was', m.text === 'go' && m.chatId === CHAT);
    const [p] = parseUpdates({
        ok: true,
        result: [{ update_id: 8, message: { message_id: 3, date: 1, text: 'hi', chat: { id: 5 } } }]
    });
    // ‼️ 0 IS A MESSAGE ID AND A TOPIC ID THAT DO NOT EXIST. A private chat has
    // no topics and a fresh message replies to nothing — absent, never zero.
    ok('‼️ A MESSAGE WITH NEITHER CARRIES NEITHER, rather than two zeros',
        p.messageId === 3 && p.replyTo === undefined && p.threadId === undefined);
    ok('…and the router reads that as "nothing was said", not as topic 0',
        R.resolve(R.rememberTopic(R.EMPTY_ROUTING, 0, 'h1'), p, three).kind === 'ambiguous');
}

// ---------- the names a topic and a row are opened with ----------
{
    ok('a topic is named for what the reader steers by',
        R.topicName(three[0]) === '🧵 developer · AgentFarm');
    ok('…and a session with no project does not carry an empty separator',
        R.topicName(three[1]) === '🧵 asistan');
    // ‼️ Telegram refuses a topic name past 128 characters outright, which
    // takes the whole thread down rather than the name.
    const long = R.topicName(sess('h9', 'x'.repeat(200)));
    ok('‼️ A NAME TOO LONG IS CUT HERE, WHERE THE CUT CAN BE SEEN',
        long.length === 128 && long.endsWith('…'));
    ok('a row says the state only when it is not the ordinary one',
        R.sessionLabel(three[1]) === 'asistan'
        && R.sessionLabel(three[2]) === 'developer · TalkScribe · working');
}

// ---------- /sessions: the list the reader answers with a number ----------
{
    const list = R.sessionList(three, 'h2');
    // ‼️ ONE NUMBERING. The reader is asked a question by `askWhich` and
    // answers it off `/sessions`; two schemes for one list is the confusion
    // this whole module exists to prevent.
    const asked = R.askWhich(three);
    ok('‼️ /sessions AND THE QUESTION NUMBER THE SAME LIST THE SAME WAY',
        three.every((s, i) => list.includes(`${i + 1}. ${R.sessionLabel(s)}`)
            && asked.includes(`${i + 1}. ${R.sessionLabel(s)}`)));
    ok('the conversation in focus is MARKED, never moved to the top',
        /2\. asistan {2}← focus/.test(list) && list.indexOf('1. developer') < list.indexOf('2. asistan'));
    ok('the list says how to answer it', /\/focus <number>/.test(list));
    ok('one conversation is counted in the singular',
        /^1 live conversation:/.test(R.sessionList([three[0]])));
    ok('an empty farm says so instead of printing a heading over nothing',
        /No live conversations/.test(R.sessionList([])));
    ok('a focus that is no longer live marks nothing',
        !R.sessionList(three, 'gone').includes('← focus'));
}

console.log(`test_telegram_routing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
