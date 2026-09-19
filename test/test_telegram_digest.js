// U-114 — THE TURN AS A CARD A PHONE CAN READ, AND THE TAPS THAT ANSWER IT.
//
// What is pinned here:
//   * the card is three blocks under Telegram's 4096 ceiling however long the
//     turn was, and the block that gives is the agent's own text — cut at the
//     HEAD, so the closing words (the verdict) survive;
//   * tool noise never reaches the card: only what the agent said in words,
//     after the reader's last prompt;
//   * a question's options are buttons, a permission is Allow/Deny, and the
//     four end-of-turn gestures stand under them — every callback_data under
//     the 64-byte ceiling;
//   * a tap on yesterday's card cannot answer today's question (request id);
//   * the memo announces a turn ONCE, seeds silently on first sight, and fires
//     a question on first sight because an unanswered one is actionable;
//   * the transport: a callback_query parses to a tap with the card's id, and
//     sendMessage carries the keyboard as reply_markup.
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '..', 'out', 'core', 'telegramDigest.js'));
const { parseUpdates } = require(path.join(__dirname, '..', 'out', 'core', 'messaging.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'telegram.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const msg = (role, text, over = {}) => ({ id: 'm' + Math.random(), role, ts: 1, text, ...over });
const base = (over = {}) => ({
    id: 'cs3-mu8snitf', agentId: 'developer', agentName: 'developer', cwd: 'D:/x', status: 'idle',
    permissionMode: 'default', messages: [
        msg('user', 'Fix the poll retry test so it stops crashing\nsecond line'),
        msg('agent', 'Looking at the file.'),
        msg('tool', 'Read test/test_poll_retry.js', { tool: { name: 'Read' } }),
        msg('user', 'now the second thing'),
        msg('tool', 'Bash git status', { tool: { name: 'Bash' } }),
        msg('agent', 'First I measured it.'),
        msg('tool', 'Edit …', { tool: { name: 'Edit' } }),
        msg('agent', 'Closed the sockets before exit; 42 runs, 0 crashes.'),
        msg('result', '', { cost: 0.18, turns: 3 })
    ],
    queued: [], costUSD: 0.5, turns: 7, tokens: 12400, wTokens: 12400, startedAt: 1, lastTs: 2,
    lastTurn: { endedAt: 1000, ms: 192000, tokens: 12400, cost: 0.18, outcome: 'done', model: 'opus' },
    ...over
});

// ---------- the card ----------
{
    const t = D.digestText(base(), { project: 'AgentFarm', priced: true });
    ok('header: agent · project · the first prompt as the subject · turn number',
        /^🤖 developer · 📁 AgentFarm · 🎯 Fix the poll retry test so it stops crashing · Turn 7$/m.test(t));
    ok('‼️ DONE is what the agent SAID after the last prompt, in order, tool lines left out',
        /📝 DONE\nFirst I measured it\.\n\nClosed the sockets before exit; 42 runs, 0 crashes\./.test(t)
        && !/Looking at the file/.test(t) && !/Bash git status/.test(t) && !/Edit …/.test(t));
    ok('STATUS on an idle card says the turn ended', /❓ STATUS\nTurn ended — waiting for your next instruction\./.test(t));
    ok('metric: duration · tokens · price · model', /⏱ 3m 12s · 12\.4k tok · \$0\.18 · opus$/.test(t));
    ok('three rules part four blocks', (t.match(/──────────/g) || []).length === 3);

    const unpriced = D.digestText(base(), { priced: false });
    ok('‼️ X-19 — a plan-billed engine says tokens, never $0.18', /12\.4k tok · opus/.test(unpriced) && !/\$/.test(unpriced));
    const noProject = D.digestText(base(), { priced: true });
    ok('no project → no 📁', !/📁/.test(noProject) && /🤖 developer · 🎯/.test(noProject));

    const failed = D.digestText(base({ lastTurn: { ...base().lastTurn, outcome: 'failed' } }), { priced: true });
    ok('a failed turn says so in the status block', /The turn FAILED\./.test(failed));
    const working = D.digestText(base({ status: 'working', lastTurn: undefined }), { priced: true });
    ok('a working card with no ended turn: still working, no figures', /Still working\./.test(working) && /no figures for this turn/.test(working));

    const silent = D.digestText(base({ messages: [msg('user', 'go'), msg('tool', 'x', { tool: { name: 'Bash' } })] }), { priced: true });
    ok('a turn of tool work only says so rather than drawing an empty block', /tool work only/.test(silent));
}

// ---------- the ceiling ----------
{
    const long = 'Paragraph of the report. '.repeat(400) + 'THE VERDICT IS AT THE END.';
    const t = D.digestText(base({ messages: [msg('user', 'q'), msg('agent', long)] }), { priced: true });
    ok('‼️ a ten-thousand-character turn fits under 4096', t.length <= D.DIGEST_LIMIT);
    ok('…cut at the HEAD, so the closing words survive', /THE VERDICT IS AT THE END\./.test(t) && /📝 DONE\n…/.test(t));
    ok('…and the status and metric blocks are intact under it', /❓ STATUS/.test(t) && /⏱ 3m 12s/.test(t));
    const many = Array.from({ length: 30 }, (_, i) => msg('agent', 'step ' + i + ' ' + 'x'.repeat(150)));
    const t2 = D.digestText(base({ messages: [msg('user', 'q'), ...many] }), { priced: true });
    ok('many short texts that overflow: the LAST one is kept whole', /step 29 x+\n/.test(t2) && !/step 0 /.test(t2) && t2.length <= D.DIGEST_LIMIT);
}

// ---------- a question, as buttons ----------
const ASK = {
    requestId: 'req-abcdef12-3456', tool: 'AskUserQuestion', interactive: true, input: {}, detail: '', ts: 1,
    questions: [{
        question: 'Which store first?', header: 'Store',
        options: [{ label: 'Chrome Web Store' }, { label: 'Google Play' }, { label: 'Both' }]
    }]
};
{
    const st = base({ status: 'working', pendingAsk: ASK });
    const t = D.digestText(st, { priced: true });
    ok('the status block carries the question and its options', /❓ WAITING ON YOU\nWhich store first\?\n   · Chrome Web Store\n   · Google Play\n   · Both/.test(t));
    const kb = D.keyboardFor(st);
    ok('one button per option, one row each', kb.length === 4 && kb.slice(0, 3).every(r => r.length === 1)
        && kb[0][0].text === 'Chrome Web Store' && kb[2][0].text === 'Both');
    ok('…each carrying the card, the request and the indexes', kb[1][0].data === 'q:cs3-mu8snitf:req-abcd:0:1');
    ok('…then Cancel · Diff · Status (no Continue while it is asking)',
        kb[3].map(b => b.text).join('|') === '⏸ Cancel|📄 Diff|📊 Status');
    ok('‼️ every callback_data is under 64 bytes', kb.flat().every(b => Buffer.byteLength(b.data) <= D.CALLBACK_LIMIT));

    const two = { ...ASK, questions: [ASK.questions[0], { question: 'Ship today?', options: [{ label: 'Yes' }, { label: 'No' }] }] };
    const kb2 = D.keyboardFor(base({ pendingAsk: two }));
    ok('two questions: numbered, so 1: Both and 2: Yes tell apart', kb2[2][0].text === '1: Both' && kb2[3][0].text === '2: Yes'
        && kb2[3][0].data === 'q:cs3-mu8snitf:req-abcd:1:0');
    const t2 = D.digestText(base({ pendingAsk: two }), { priced: true });
    ok('…and the block numbers them too', /1\. Which store first\?/.test(t2) && /2\. Ship today\?/.test(t2));
}

// ---------- a permission, as Allow / Deny ----------
{
    const perm = { requestId: 'perm-9', tool: 'Bash', displayName: 'Bash', interactive: false, input: {}, detail: 'rm -rf dist', ts: 1, questions: [] };
    const st = base({ status: 'working', pendingAsk: perm });
    ok('the block names the tool and the detail', /Permission: Bash\nrm -rf dist/.test(D.digestText(st, { priced: true })));
    const kb = D.keyboardFor(st);
    ok('Allow / Deny on one row, then the gestures', kb[0].map(b => b.text).join('|') === '✅ Allow|🚫 Deny'
        && kb[0][0].data === 'p:cs3-mu8snitf:perm-9:allow' && kb[0][1].data === 'p:cs3-mu8snitf:perm-9:deny');
}

// ---------- the gestures by state ----------
{
    const idle = D.keyboardFor(base());
    ok('idle: Continue · Diff · Status — no Cancel, nothing is running', idle.length === 1
        && idle[0].map(b => b.text).join('|') === '✅ Continue|📄 Diff|📊 Status' && idle[0][0].data === 'c:cs3-mu8snitf:continue');
    const working = D.keyboardFor(base({ status: 'working' }));
    ok('working: Cancel · Diff · Status — no Continue mid-turn', working[0].map(b => b.text).join('|') === '⏸ Cancel|📄 Diff|📊 Status');
    ok('ended: no buttons at all', D.keyboardFor(base({ status: 'ended' })).length === 0
        && D.keyboardFor(base({ status: 'error' })).length === 0);
}

// ---------- taps ----------
{
    ok('c: tap', JSON.stringify(D.parseTap('c:cs3-mu8snitf:diff')) === JSON.stringify({ kind: 'diff', id: 'cs3-mu8snitf' }));
    ok('q: tap', JSON.stringify(D.parseTap('q:cs3-mu8snitf:req-abcd:0:2'))
        === JSON.stringify({ kind: 'option', id: 'cs3-mu8snitf', rid: 'req-abcd', question: 0, option: 2 }));
    ok('p: tap', JSON.stringify(D.parseTap('p:cs3-mu8snitf:perm-9:deny'))
        === JSON.stringify({ kind: 'permission', id: 'cs3-mu8snitf', rid: 'perm-9', allow: false }));
    ok('not ours → undefined', D.parseTap('') === undefined && D.parseTap('x:1:2') === undefined
        && D.parseTap('c:id:explode') === undefined && D.parseTap('q:id:r:a:b') === undefined && D.parseTap('p:id:r:maybe') === undefined);

    const tap = D.parseTap('q:cs3-mu8snitf:req-abcd:0:1');
    const a = D.tapAnswer(ASK, tap);
    ok('an option tap becomes the answer the Console posts: { "<question>": "<label>" }',
        a.label === 'Google Play' && JSON.stringify(a.answers) === JSON.stringify({ 'Which store first?': 'Google Play' }));
    ok('‼️ a tap on an OLD card is refused, not applied to the new question',
        !!D.tapAnswer({ ...ASK, requestId: 'req-zzzzzz' }, tap).refused && !!D.tapAnswer(undefined, tap).refused);
    ok('…and an option that is not on the question any more', !!D.tapAnswer(ASK, D.parseTap('q:cs3-mu8snitf:req-abcd:0:9')).refused);
}

// ---------- the memo ----------
{
    let m = D.EMPTY_MEMO;
    let r = D.digestEvents(m, base());
    ok('‼️ first sight of an ended turn seeds silently — a reload does not re-announce every card', r.events.length === 0 && r.memo.turnAt['cs3-mu8snitf'] === 1000);
    r = D.digestEvents(r.memo, base());
    ok('the same turn again: nothing', r.events.length === 0);
    r = D.digestEvents(r.memo, base({ lastTurn: { ...base().lastTurn, endedAt: 2000 } }));
    ok('a new end time: one turn event', r.events.join() === 'turn' && r.memo.turnAt['cs3-mu8snitf'] === 2000);
    r = D.digestEvents(r.memo, base({ lastTurn: { ...base().lastTurn, endedAt: 2000 } }));
    ok('…once', r.events.length === 0);
    r = D.digestEvents(r.memo, base({ status: 'working', pendingAsk: ASK, lastTurn: { ...base().lastTurn, endedAt: 2000 } }));
    ok('‼️ a question fires on first sight — unanswered is actionable', r.events.join() === 'ask');
    r = D.digestEvents(r.memo, base({ status: 'working', pendingAsk: ASK, lastTurn: { ...base().lastTurn, endedAt: 2000 } }));
    ok('…once', r.events.length === 0);
    r = D.digestEvents(r.memo, base({ status: 'working', lastTurn: { ...base().lastTurn, endedAt: 2000 } }));
    ok('answered: the ask memo is cleared, nothing fires', r.events.length === 0 && r.memo.askId['cs3-mu8snitf'] === undefined);
    r = D.digestEvents(r.memo, base({ status: 'working', pendingAsk: ASK, lastTurn: { ...base().lastTurn, endedAt: 2000 } }));
    ok('the same question re-parked fires again (it is pending again)', r.events.join() === 'ask');
    const fresh = D.digestEvents(D.EMPTY_MEMO, base({ status: 'working', pendingAsk: ASK }));
    ok('a brand-new card already asking: ask fires, the turn seeds', fresh.events.join() === 'ask');
    const kept = D.forgetMemo(r.memo, []);
    ok('forgetMemo drops what the host no longer has (X-127)', Object.keys(kept.turnAt).length === 0 && Object.keys(kept.askId).length === 0);
}

// ---------- the transport ----------
{
    const payload = {
        ok: true, result: [
            { update_id: 10, callback_query: { id: 'cbq1', data: 'c:cs3-mu8snitf:status', from: { username: 'murat' }, message: { message_id: 77, chat: { id: -100123 }, message_thread_id: 5 } } },
            { update_id: 11, message: { text: 'hi', chat: { id: -100123 }, from: { first_name: 'M' }, message_id: 78 } },
            { update_id: 12, callback_query: { id: 'cbq2', from: { username: 'x' } } }
        ]
    };
    const msgs = parseUpdates(payload);
    ok('a callback_query parses to a tap: empty text, the callback id and data, the CARD\'s message id and topic',
        msgs.length === 2 && msgs[0].text === '' && msgs[0].callback.id === 'cbq1' && msgs[0].callback.data === 'c:cs3-mu8snitf:status'
        && msgs[0].messageId === 77 && msgs[0].threadId === 5 && msgs[0].chatId === -100123 && msgs[0].from === 'murat');
    ok('…a plain message still parses beside it', msgs[1].text === 'hi' && msgs[1].callback === undefined);
    ok('…and a callback without a chat is dropped, not thrown on', msgs.every(m => m.updateId !== 12));

    const calls = [];
    const call = async (method, params) => { calls.push({ method, params }); return { ok: true, result: { message_id: 5 } }; };
    (async () => {
        const id = await T.sendMessage('tok', -1, 'card', 9, call, [[{ text: 'A', data: 'c:x:diff' }], [{ text: 'B', data: 'c:x:status' }]]);
        ok('sendMessage carries the keyboard as reply_markup, Telegram\'s own shape', id === 5
            && JSON.parse(calls[0].params.reply_markup).inline_keyboard[1][0].callback_data === 'c:x:status'
            && calls[0].params.message_thread_id === 9);
        await T.sendMessage('tok', -1, 'plain', undefined, call, []);
        ok('…and none when there are no buttons', calls[1].params.reply_markup === undefined);
        await T.answerCallbackQuery('tok', 'cbq1', 'Done', call);
        ok('answerCallbackQuery names the query and the toast', calls[2].method === 'answerCallbackQuery'
            && calls[2].params.callback_query_id === 'cbq1' && calls[2].params.text === 'Done');
        await T.answerCallbackQuery('tok', 'cbq1', undefined, async () => { throw new Error('net'); });
        ok('…and a failed acknowledgement is swallowed', true);
        const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'core', 'telegram.ts'), 'utf8');
        ok('the poller asks Telegram for callback_query updates', /allowed_updates: '\["message","callback_query"\]'/.test(src));
        console.log(`test_telegram_digest: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
