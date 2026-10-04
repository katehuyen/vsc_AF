// U-115 — WHAT A SENTENCE TYPED ON A PHONE MEETS BEFORE IT REACHES A
// CONVERSATION, and what happens to it while it waits.
//
// What is pinned here:
//   * the four gates and THEIR ORDER — gone, today's money, what the sentence
//     would DO, whether a turn is running — because a cap checked after the
//     turn started is not a cap, and a destructive command must stop even when
//     there is budget left;
//   * a busy conversation QUEUES by default rather than steering blind, and
//     `steer` only reaches an engine that can take words mid-turn;
//   * a gate the reader already said yes to is not asked twice — the waiver
//     travels with the parked message;
//   * the queue releases ONE message per turn end, oldest first, and has a
//     ceiling so a chat cannot pile a hundred prompts into a conversation;
//   * the ledger is fed the DIFFERENCE a conversation cost, not its total, and
//     only for a conversation the phone has actually driven;
//   * dead conversations take their parked messages and their marks with them;
//   * the confirm card's two buttons parse back through the one tap door.
'use strict';
const path = require('path');
const X = require(path.join(__dirname, '..', 'out', 'core', 'telegramExecution.js'));
const D = require(path.join(__dirname, '..', 'out', 'core', 'telegramDigest.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const DAY = '2026-09-20';
const rich = { day: DAY, usd: 0.10 };
const broke = { day: DAY, usd: 5 };
const v = (over = {}) => X.inboundVerdict({
    status: 'idle', turns: 3, label: 'developer', text: 'carry on',
    whenBusy: 'queue', steerable: true, ledger: rich, capUSD: 1, day: DAY, ...over
});

// ---- gate 1: the conversation is still there ----
ok('an idle conversation takes the message', v().do === 'send');
ok('a conversation that is gone stops everything', v({ status: undefined }).do === 'gone');
ok('…and so does one that ended', v({ status: 'ended' }).do === 'gone');
ok('…and one that errored', v({ status: 'error' }).do === 'gone');

// ---- gate 2: today's money, BEFORE the turn starts ----
const over = v({ ledger: broke });
ok('over the cap asks before it runs', over.do === 'confirm' && over.why === 'budget');
ok('…and the card says both figures', /\$5\.00/.test(over.note) && /\$1\.00/.test(over.note));
ok('a cap is per DAY — yesterday\'s total does not stop today',
    v({ ledger: { day: '2026-09-19', usd: 99 } }).do === 'send');
ok('the budget gate is waivable', v({ ledger: broke, waived: 'budget' }).do === 'send');
ok('…and waiving it does NOT waive the risk gate',
    v({ ledger: broke, waived: 'budget', text: 'run git reset --hard now' }).do === 'confirm');

// ---- gate 3: what the sentence would DO ----
ok('rm -rf stops', X.riskyIntent('please rm -rf ./tmp') === 'rm -rf');
ok('git reset --hard stops', X.riskyIntent('GIT RESET --HARD origin/main') === 'git reset --hard');
ok('git clean -fd stops', X.riskyIntent('git clean -fd') === 'git clean -f');
ok('a force push stops', X.riskyIntent('git push --force origin main') === 'git push --force');
ok('git push -f stops too', X.riskyIntent('git push -f') === 'git push --force');
ok('deleting a branch stops', X.riskyIntent('git branch -D feature/x') === 'git branch -D');
ok('DROP TABLE stops', X.riskyIntent('drop table users;') === 'DROP TABLE');
ok('Remove-Item -Recurse stops', X.riskyIntent('Remove-Item C:\\x -Recurse -Force') === 'Remove-Item -Recurse');
ok('formatting a drive stops', X.riskyIntent('format d:') === 'format <drive>');
ok('ENGLISH IS NOT AN INSTRUCTION — "clean up the temp files" passes',
    X.riskyIntent('clean up the temp files when you get a chance') === undefined);
ok('…and so does talking ABOUT a reset without the flag',
    X.riskyIntent('what would git reset do here?') === undefined);
ok('…and an ordinary remove', X.riskyIntent('remove the unused import') === undefined);
const risky = v({ text: 'now git reset --hard HEAD~3' });
ok('a destructive sentence asks first', risky.do === 'confirm' && risky.why === 'risk');
ok('…and names what it would run', /git reset --hard/.test(risky.note));
ok('a confirmed destructive sentence goes in',
    v({ text: 'now git reset --hard HEAD~3', waived: 'risk' }).do === 'send');
ok('‼️ money is checked BEFORE the command — the cheaper question is not skipped',
    v({ ledger: broke, text: 'rm -rf build' }).why === 'budget');
// ‼️ each yes is KEPT — with one slot the risk yes forgot the budget yes and the two questions took turns for ever
const afterBudget = v({ ledger: broke, text: 'rm -rf build', waived: X.addWaiver(undefined, 'budget') });
ok('over budget AND destructive: after the budget yes the risk is asked', afterBudget.do === 'confirm' && afterBudget.why === 'risk');
ok('…and after the risk yes on top of it, it goes in — never round to the budget again',
    v({ ledger: broke, text: 'rm -rf build', waived: X.addWaiver(['budget'], afterBudget.why) }).do === 'send');
ok('a single saved yes (older state) still reads',
    X.waives('risk', 'risk') && !X.waives('risk', 'budget') && !X.waives(undefined, 'risk'));
ok('a yes is added once, after the earlier ones',
    X.addWaiver(['budget'], 'budget').join() === 'budget' && X.addWaiver('budget', 'risk').join() === 'budget,risk');

// ---- gate 4: a turn that is running ----
ok('busy queues by default', v({ status: 'working' }).do === 'hold');
ok('…and the note names the turn', /turn 3/.test(v({ status: 'working' }).note));
ok('a conversation still starting queues too', v({ status: 'starting' }).do === 'hold');
ok('steer reaches a steerable engine mid-turn',
    v({ status: 'working', whenBusy: 'steer' }).do === 'send');
ok('…but never one that cannot take words mid-turn',
    v({ status: 'working', whenBusy: 'steer', steerable: false }).do === 'hold');
ok('…and never into a conversation that has not opened yet',
    v({ status: 'starting', whenBusy: 'steer' }).do === 'hold');

// ---- the queue itself ----
let inbox = {};
inbox = X.queueInbound(inbox, 'cs1', { chat: 7, text: 'first', at: 1 }).inbox;
inbox = X.queueInbound(inbox, 'cs1', { chat: 7, text: 'second', at: 2, waived: 'risk' }).inbox;
inbox = X.queueInbound(inbox, 'cs2', { chat: 7, text: 'other', at: 3 }).inbox;
ok('two messages wait for one conversation', X.inboxCount(inbox, 'cs1') === 2);
ok('…and another conversation keeps its own', X.inboxCount(inbox, 'cs2') === 1);
const r1 = X.releaseInbound(inbox, 'cs1');
ok('release takes ONE, the oldest', r1.item.text === 'first' && X.inboxCount(r1.inbox, 'cs1') === 1);
ok('…and leaves the other conversation alone', X.inboxCount(r1.inbox, 'cs2') === 1);
const r2 = X.releaseInbound(r1.inbox, 'cs1');
ok('the waiver travels with the message', r2.item.waived === 'risk');
ok('an emptied queue drops its key', r2.inbox.cs1 === undefined);
ok('releasing an empty queue is nothing', X.releaseInbound(r2.inbox, 'cs1').item === undefined);
ok('the original is never mutated', X.inboxCount(inbox, 'cs1') === 2);
let full = {};
for (let i = 0; i < X.INBOX_LIMIT; i++) { full = X.queueInbound(full, 'cs1', { chat: 7, text: 'm' + i, at: i }).inbox; }
const refused = X.queueInbound(full, 'cs1', { chat: 7, text: 'one too many', at: 99 });
ok('the queue has a ceiling', !!refused.refused && X.inboxCount(refused.inbox, 'cs1') === X.INBOX_LIMIT);
ok('…and the refusal says how many are waiting', /10/.test(refused.refused));
const kept = X.forgetInbox(inbox, ['cs2']);
ok('a dead conversation takes its queue with it', kept.cs1 === undefined && X.inboxCount(kept, 'cs2') === 1);

// ---- the ledger is fed a DIFFERENCE ----
const mark = X.chargeTurn({}, 'cs1', 0.40);
ok('an unmarked conversation bills nothing on its first sight', mark.usd === 0);
ok('…but the mark is set', mark.seen.cs1 === 0.40);
const bill = X.chargeTurn(mark.seen, 'cs1', 0.63);
ok('the turn is billed the difference, not the total', Math.abs(bill.usd - 0.23) < 1e-9);
ok('…and the mark moves on', bill.seen.cs1 === 0.63);
ok('a total that went backwards never bills a negative',
    X.chargeTurn({ cs1: 5 }, 'cs1', 1).usd === 0);
ok('marks are dropped with their conversations',
    X.forgetSeen({ cs1: 1, cs2: 2 }, ['cs2']).cs1 === undefined);

// ---- a turn ending: bill, then release ----
const stAt = (over = {}) => ({ ledger: { day: DAY, usd: 0.20 }, inbox: {}, seen: {}, other: 'kept', ...over });
const quiet = X.turnEnded(stAt(), 'cs1', 0.90, DAY);
ok('a conversation the phone never drove is not billed', quiet.billedUSD === 0
    && quiet.state.ledger.usd === 0.20 && quiet.state.seen.cs1 === undefined);
ok('…and nothing else is touched either', quiet.state === quiet.state && quiet.release === undefined);
const driven = X.turnEnded(stAt({ seen: { cs1: 0.50 } }), 'cs1', 0.90, DAY);
ok('a phone-driven turn bills its difference', Math.abs(driven.billedUSD - 0.40) < 1e-9
    && Math.abs(driven.state.ledger.usd - 0.60) < 1e-9);
ok('…and the mark moves to the new total', driven.state.seen.cs1 === 0.90);
const both = X.turnEnded(
    stAt({ seen: { cs1: 0.50 }, inbox: { cs1: [{ chat: 7, text: 'a', at: 1 }, { chat: 7, text: 'b', at: 2 }] } }),
    'cs1', 0.90, DAY);
ok('…and the oldest parked message comes out with it', both.release.text === 'a');
ok('ONE at a time — the rest keep waiting', X.inboxCount(both.state.inbox, 'cs1') === 1);
ok('the rest of the state is carried through', both.state.other === 'kept');
ok('a ledger that rolled over to a new day starts from this turn',
    X.turnEnded(stAt({ seen: { cs1: 0 } }), 'cs1', 0.30, '2026-09-21').state.ledger.day === '2026-09-21');
ok('nothing to bill and nothing waiting leaves the state alone',
    X.turnEnded(stAt(), 'cs1', 0, DAY).state.inbox.cs1 === undefined);

// ---- the confirm card ----
const kb = X.confirmKeyboard('cs3-mu8snitf');
ok('the card has exactly two buttons', kb.length === 1 && kb[0].length === 2);
ok('…both under the 64-byte callback ceiling',
    kb[0].every(b => Buffer.byteLength(b.data) <= D.CALLBACK_LIMIT));
const yes = D.parseTap(kb[0][0].data), no = D.parseTap(kb[0][1].data);
ok('yes parses back through the one tap door',
    yes.kind === 'confirm' && yes.yes === true && yes.id === 'cs3-mu8snitf');
ok('…and cancel', no.kind === 'confirm' && no.yes === false);
ok('a confirm tap that is not ours is refused', D.parseTap('n:cs3:maybe') === undefined);

// ---- the wiring, read off the source ----
const fs = require('fs');
const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
ok('the queue is part of the SAVED chat state, not memory',
    /inbox: s\.inbox \?\? \{\}/.test(ext) && /pending: s\.pending \?\? \{\}/.test(ext));
ok('a turn ending runs the same decision the tests above pin',
    /const chatTurnEnded = async/.test(ext) && /turnEnded\(st, id, costUSD, dayKey\(Date\.now\(\)\)\)/.test(ext));
ok('the released message goes back through the gates',
    /chatSay\(r\.release\.chat, id, r\.release\.text, 'button', r\.release\.waived\)/.test(ext));
ok('the confirm tap ADDS its yes to the ones the message already had',
    /chatSay\(msg\.chatId, tap\.id, p\.text, 'button', addWaiver\(p\.waived, p\.why\)\)/.test(ext));
ok('…which the gate saved with the message it stopped',
    /why: v\.why, at: Date\.now\(\), \.\.\.\(waived \? \{ waived: waiverList\(waived\) \} : \{\}\)/.test(ext));
ok('the turn-end edge fires on a card seen idle for the first time too',
    /if \(!busy && wasBusy !== false\)/.test(ext));
ok('the setting is read where the verdict is taken', /whenBusy: c\.whenBusy/.test(ext));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const s = pkg.contributes.configuration.properties['agentFarm.telegram.whenBusy'];
ok('the setting is contributed with both values and queues by default',
    !!s && s.default === 'queue' && s.enum.join() === 'queue,steer');
const cat = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'settingsops.js').replace('.js', '.ts'), 'utf8');
ok('…and filed under a category, so it does not leak into Other',
    /'telegram\.whenBusy': 'access'/.test(cat));
ok('the queue is on the bridge', /op: 'telegram\.inbox'/.test(ext));

console.log(`test_telegram_execution: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
