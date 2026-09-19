// U-113 — `telegram.routing` / `telegram.focus` ON THE BRIDGE.
//
// The handlers in extension.ts need vscode to reach globalState and the Console
// host, so what is measured here is the CONTRACT they are built out of: the
// same registry, the same arg helpers, the same pure routing core, and the four
// promises an agent calling these ops is entitled to —
//
//   · a word that fits two conversations is REFUSED by name, never resolved to
//     whichever one sorted first (that is the wrong-target failure the whole
//     item exists to prevent, arriving through the back door);
//   · a focus naming a conversation that has ended reads as NULL rather than as
//     a live target — the table is pruned on every read;
//   · clearing needs no session, because the reason to clear is that the one
//     you had is gone;
//   · ‼️ NO TOKEN AND NO CHAT CONTENT CROSSES. Same boundary telegram.status
//     draws, same reason.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { BridgeRegistry, need, argStr, optBool, optNum } = require(path.join(OUT, 'bridge.js'));
const R = require(path.join(OUT, 'telegramRouting.js'));
const fs = require('fs');

const sess = (id, agentName, over = {}) => ({
    id, agentId: agentName, agentName, sessionId: 'sid-' + id,
    project: '', status: 'idle', lastTs: 1, ...over
});

// Two of one agent is the case the numbering exists for; a name alone cannot
// separate them and the op must say so instead of choosing.
const live = [
    sess('h1', 'developer', { project: 'AgentFarm' }),
    sess('h2', 'asistan'),
    sess('h3', 'developer', { project: 'TalkScribe', status: 'working' })
];

/** The handlers, over the same pure core the extension wires to vscode. */
const build = (state) => {
    const reg = new BridgeRegistry();
    const pruned = () => {
        state.routing = R.forgetGone(state.routing, live);
        return state.routing;
    };
    reg.register([
        {
            op: 'telegram.routing',
            describe: 'the conversations and where each chat points',
            handler: () => {
                const t = pruned();
                const topicOf = (id) => Object.entries(t.byTopic).find(([, v]) => v === id)?.[0];
                return {
                    conversations: live.map((s, i) => ({
                        n: i + 1, id: s.id, agent: s.agentName, project: s.project || '',
                        status: s.status ?? '', label: R.sessionLabel(s),
                        topicId: topicOf(s.id) ? Number(topicOf(s.id)) : null,
                        focusOf: Object.entries(t.focus).filter(([, v]) => v === s.id).map(([k]) => Number(k))
                    })),
                    chats: Object.entries(t.focus).map(([chat, id]) => ({
                        chatId: Number(chat), focus: id,
                        resolves: live.find(s => s.id === id)?.id ?? null
                    })),
                    replyMap: Object.keys(t.byMessage).length,
                    topics: Object.keys(t.byTopic).length
                };
            }
        },
        {
            op: 'telegram.focus',
            describe: 'set which conversation a chat\'s plain messages go to',
            handler: (args) => {
                const chatId = optNum(args, 'chat', 0);
                need(Number.isFinite(chatId) && chatId !== 0, 'chat must be a Telegram chat id');
                const t = pruned();
                if (optBool(args, 'clear')) {
                    state.routing = R.setFocus(t, chatId, '');
                    return { chatId, focus: null };
                }
                const pick = R.pickFocus(argStr(args, 'session'), live);
                need(pick.kind !== 'none', 'nothing matches that');
                need(pick.kind !== 'ambiguous',
                    pick.kind === 'ambiguous'
                        ? `that fits ${pick.candidates.length} conversations — say which: ${pick.candidates.map(s => s.id).join(' · ')}`
                        : '');
                state.routing = R.setFocus(t, chatId, pick.session.id);
                return { chatId, focus: pick.session.id, label: R.sessionLabel(pick.session) };
            }
        }
    ]);
    return reg;
};

const run = async (reg, op, args) => reg.dispatch(op, args || {}, 'test');

(async () => {
    // ---------- focus: choosing, and refusing to choose ----------
    {
        const state = { routing: { ...R.EMPTY_ROUTING } };
        const reg = build(state);
        const byNumber = await run(reg, 'telegram.focus', { chat: '-100123', session: '2' });
        ok('a /sessions number picks the conversation that had it',
            byNumber.ok === true && byNumber.result.focus === 'h2');
        const byId = await run(reg, 'telegram.focus', { chat: '-100123', session: 'sid-h3' });
        ok('so does the engine session id', byId.ok && byId.result.focus === 'h3');
        const uniq = await run(reg, 'telegram.focus', { chat: '-100123', session: 'asistan' });
        ok('and a name that fits exactly one', uniq.ok && uniq.result.focus === 'h2');
    }
    {
        const reg = build({ routing: { ...R.EMPTY_ROUTING } });
        const two = await run(reg, 'telegram.focus', { chat: '-100123', session: 'developer' });
        ok('‼️ A NAME THAT FITS TWO IS REFUSED, NEVER RESOLVED TO THE FIRST',
            two.ok === false && /fits 2 conversations/.test(two.error));
        ok('…and the refusal names both, so the caller can pick one',
            /h1/.test(two.error) && /h3/.test(two.error));
        const none = await run(reg, 'telegram.focus', { chat: '-100123', session: 'nobody' });
        ok('a word that matches nothing is refused too', none.ok === false);
    }
    {
        const reg = build({ routing: { ...R.EMPTY_ROUTING } });
        const bad = await run(reg, 'telegram.focus', { chat: 'not-a-chat', session: '1' });
        ok('a chat id that is not a number is refused before anything is written',
            bad.ok === false && /chat id/.test(bad.error));
        // ‼️ `af.js telegram.focus chat=-100123` hands the id over as a WORD,
        // and a JSON caller sends a number. One helper has to read both, or the
        // op works from exactly one of the two doors it has.
        const s2 = { routing: { ...R.EMPTY_ROUTING } };
        const asWord = await run(build(s2), 'telegram.focus', { chat: '-100123', session: '1' });
        const s3 = { routing: { ...R.EMPTY_ROUTING } };
        const asNumber = await run(build(s3), 'telegram.focus', { chat: -100123, session: '1' });
        ok('‼️ A CHAT ID TYPED AS A WORD AND AS A NUMBER ARE THE SAME CHAT',
            asWord.ok && asNumber.ok && asWord.result.chatId === asNumber.result.chatId);
    }
    {
        const state = { routing: R.setFocus({ ...R.EMPTY_ROUTING }, -100123, 'h1') };
        const reg = build(state);
        const cleared = await run(reg, 'telegram.focus', { chat: '-100123', clear: 'true' });
        ok('‼️ CLEARING NEEDS NO SESSION — the reason to clear is that yours is gone',
            cleared.ok === true && cleared.result.focus === null
            && state.routing.focus['-100123'] === undefined);
    }

    // ---------- routing: what it is allowed to claim ----------
    {
        let t = { ...R.EMPTY_ROUTING };
        t = R.setFocus(t, -100123, 'h2');
        t = R.rememberTopic(t, 77, 'h3');
        t = R.rememberOutgoing(t, 4711, 'h1');
        const reg = build({ routing: t });
        const r = (await run(reg, 'telegram.routing', {})).result;
        ok('every live conversation is numbered the way /sessions numbers it',
            r.conversations.map(c => c.n).join() === '1,2,3'
            && r.conversations[1].id === 'h2');
        ok('a bound topic travels with its conversation',
            r.conversations[2].topicId === 77 && r.conversations[0].topicId === null);
        ok('a conversation says which chats point at it',
            r.conversations[1].focusOf.join() === '-100123');
        ok('the reply map is counted, not printed',
            r.replyMap === 1 && r.topics === 1 && !JSON.stringify(r).includes('4711:'));
        ok('‼️ NO TOKEN AND NO MESSAGE TEXT IS IN THE ANSWER',
            !/token|bot[0-9]/i.test(JSON.stringify(r)));
    }
    {
        // The failure this layer exists to end: a focus naming a conversation
        // that ended, reported as if a message could still reach it.
        const state = { routing: R.setFocus({ ...R.EMPTY_ROUTING }, -100123, 'gone') };
        const reg = build(state);
        const r = (await run(reg, 'telegram.routing', {})).result;
        ok('‼️ A DEAD FOCUS KEEPS NO SEAT — it is pruned out rather than reported live',
            r.chats.length === 0 && state.routing.focus['-100123'] === undefined);
    }

    // ---------- the ops really are registered in the extension ----------
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('‼️ BOTH OPS ARE ON THE REAL BRIDGE, not only in this suite',
            /op: 'telegram\.routing'/.test(src) && /op: 'telegram\.focus'/.test(src));
    }

    console.log(`test_telegram_bridge: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
