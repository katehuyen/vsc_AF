// U-113 — THE OUTBOUND HALF OF THE BRIDGE, WHICH NOTHING HAD EVER RUN.
//
// `telegram.ts` had one injectable door (the poller's `fetch`, U-84) and every
// other call went straight out over HTTPS, so `sendMessage` was unmeasured —
// and the thing it now has to get right is not "did it send" but "what did
// Telegram call the message it just created". That id IS the reply layer: a
// reader replying to it names the conversation exactly, and an id dropped at
// the transport can never be recovered afterwards.
//
// Two refusals are pinned here as well, because both are the difference
// between a degraded bridge and a silent one: a group that is not a Forum, and
// a bot without `can_manage_topics`, must both fall back to the main thread
// rather than stop talking.
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', 'out', 'core', 'telegram.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** A stand-in for the one call the module makes; it records what it was asked. */
const spy = (reply) => {
    const seen = [];
    const call = async (method, params) => { seen.push({ method, params }); return typeof reply === 'function' ? reply(method, params) : reply; };
    return { call, seen };
};

(async () => {
    // ---------- sendMessage: the id is the whole reply layer ----------
    {
        const s = spy({ ok: true, result: { message_id: 4711 } });
        const id = await T.sendMessage('tok', -100123, 'hello', undefined, s.call);
        ok('‼️ THE ID TELEGRAM GAVE THE MESSAGE COMES BACK', id === 4711);
        ok('it is a sendMessage with the chat and the text on it',
            s.seen[0].method === 'sendMessage'
            && s.seen[0].params.chat_id === -100123 && s.seen[0].params.text === 'hello');
        ok('no thread is named when there is no topic',
            !('message_thread_id' in s.seen[0].params));
    }
    {
        const s = spy({ ok: true, result: { message_id: 9 } });
        await T.sendMessage('tok', -100123, 'hi', 77, s.call);
        ok('a message FOR a topic is put in that topic',
            s.seen[0].params.message_thread_id === 77);
    }
    {
        // 0 is not a topic. Passing it as one would address a thread that does
        // not exist, and Telegram answers that with a refusal, not the main chat.
        const s = spy({ ok: true, result: { message_id: 9 } });
        await T.sendMessage('tok', 1, 'hi', 0, s.call);
        ok('‼️ TOPIC 0 IS "NO TOPIC", NEVER A TOPIC',
            !('message_thread_id' in s.seen[0].params));
    }
    {
        const s = spy({ ok: false, description: 'chat not found' });
        ok('a refusal yields no id rather than a made-up one',
            (await T.sendMessage('tok', 1, 'hi', undefined, s.call)) === undefined);
    }

    // ---------- is this chat a Forum ----------
    {
        ok('a Forum group says so', await T.isForumChat('tok', -1, spy({ ok: true, result: { is_forum: true } }).call));
        ok('a private chat is not one, and that is an answer not an error',
            (await T.isForumChat('tok', 1, spy({ ok: true, result: {} }).call)) === false);
        ok('‼️ A TRANSPORT FAILURE READS AS "NOT A FORUM", so the bridge keeps talking',
            (await T.isForumChat('tok', 1, async () => { throw new Error('offline'); })) === false);
    }

    // ---------- opening a topic for one conversation ----------
    {
        const s = spy({ ok: true, result: { message_thread_id: 55 } });
        const made = await T.createForumTopic('tok', -100123, '🧵 developer · AgentFarm', s.call);
        ok('a topic comes back with the thread id its messages need',
            made.ok === true && made.threadId === 55);
        ok('it is opened under the name it was given',
            s.seen[0].method === 'createForumTopic'
            && s.seen[0].params.name === '🧵 developer · AgentFarm');
    }
    {
        // The ordinary failure: the bot is in the group but was never given
        // can_manage_topics. The bridge must degrade to the main thread.
        const r = await T.createForumTopic('tok', -1, 'x',
            spy({ ok: false, description: 'not enough rights to manage topics' }).call);
        ok('‼️ A REFUSAL IS RETURNED, NOT THROWN — the caller falls back, it does not crash',
            r.ok === false && /manage topics/.test(r.error));
        const dead = await T.createForumTopic('tok', -1, 'x', async () => { throw new Error('offline'); });
        ok('…and so is a dead network', dead.ok === false && /offline/.test(dead.error));
    }

    console.log(`test_telegram_transport: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
