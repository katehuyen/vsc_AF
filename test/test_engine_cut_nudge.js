// X-483 — a relay leg whose turn the engine cut with no stop asked is asked ONCE to go on
// (src/core/engineCutNudge.ts, the mark on lastTurn in consoleproto.ts, the wiring in extension.ts).
//
// What must not go wrong quietly: a stop somebody asked for is never answered with a nudge;
// a turn that was not cut leaves every card byte-for-byte as before; a leg that passed, a Last
// leg, an ended chain, a leg told to hand over and a leg paused in place are left alone; the turn
// a nudge opened is never nudged again (no loop); a person who spoke after the cut is not talked over.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const C = require(path.join(OUT, 'engineCutNudge.js'));
const { reduceEvent, newSessionState, acceptUserText } = require(path.join(OUT, 'consoleproto.js'));
const { NO_STOP_ASKED } = require(path.join(OUT, 'stopSource.js'));

const NOW = 1791400000000;
const seal = { id: 'b0', chainId: 'chn_t', hop: 0, state: 'started', from: { sessionId: 's1' }, toSessionId: 's1', createdAt: NOW - 9e6, updatedAt: NOW - 9e6 };
const opener = (extra = {}) => Object.assign({ id: 'b1', chainId: 'chn_t', hop: 1, state: 'started', from: { sessionId: 's1' }, toSessionId: 's2', createdAt: NOW - 5e6, updatedAt: NOW - 5e6 }, extra);
const chain = (extra) => [seal, opener(extra)];
const card = (extra = {}) => Object.assign({ id: 'cs1', sessionId: 's2', status: 'idle', queued: 0, asking: false, lastTurn: { endedAt: NOW, engineCut: true }, opened: 'go on with X-483' }, extra);
const order = (c, list = chain(), handover) => C.cutOrder({ card: c, list, handover });

console.log('\n== the mark: only a silent cut with no stop asked carries engineCut ==');
const fresh = () => newSessionState({ id: 'c1', agentId: 'dev', agentName: 'developer', cwd: '/x', now: NOW });
const reduce = (s, ev, now = NOW) => reduceEvent(s, ev, now).state;
const working = (extra) => Object.assign({}, fresh(), { status: 'working', turnStartedAt: NOW - 5000 }, extra);
const cutEv = { type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0 };
{
    const cut = reduce(working(), cutEv);
    ok('‼️ the engine ending a turn in silence with no stop asked marks lastTurn.engineCut', cut.lastTurn.engineCut === true && cut.lastTurn.outcome === 'interrupted');
    ok('…on exactly the turn whose row says NO_STOP_ASKED', cut.messages[cut.messages.length - 1].text.endsWith(NO_STOP_ASKED));
    const asked = reduce(working({ stopAsked: { from: 'console-esc', ts: NOW - 100 } }), cutEv);
    ok('‼️ a stop somebody asked for is NOT a cut — explicit stops are respected', !('engineCut' in asked.lastTurn) && asked.lastTurn.outcome === 'interrupted');
    const worded = reduce(working(), Object.assign({}, cutEv, { error: 'turn cancelled — the engine stopped where it was' }));
    ok('an engine that said why (X-26) is not a silent cut', !('engineCut' in worded.lastTurn));
    const done = reduce(working(), { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.1, result: 'ok' });
    ok('‼️ a finished turn carries no engineCut KEY at all (byte-for-byte as before)', !('engineCut' in done.lastTurn) && done.lastTurn.outcome === 'done');
    const failed = reduce(working(), { type: 'result', subtype: 'error_max_turns', is_error: true, total_cost_usd: 0 });
    ok('a failed (not interrupted) turn is no cut', !('engineCut' in failed.lastTurn) && failed.lastTurn.outcome === 'failed');
    const spoke = acceptUserText(cut, 'wait, stop there', NOW + 1000).state;
    ok('‼️ a person speaking after the cut starts a turn, which clears lastTurn — nothing left to nudge', spoke.lastTurn === undefined && spoke.status === 'working');
}

console.log('\n== turnOpener: the prompt that opened the last finished turn ==');
{
    ok('the last user line before the closing row', C.turnOpener([{ role: 'user', text: 'a' }, { role: 'agent', text: 'x' }, { role: 'result', text: 'r' }]) === 'a');
    ok('a steered line joins a turn and never opens one', C.turnOpener([{ role: 'user', text: 'a' }, { role: 'user', text: 'b', steer: true }, { role: 'result' }]) === 'a');
    ok('an older turn is not read through the newest closing row', C.turnOpener([{ role: 'user', text: 'old' }, { role: 'result' }, { role: 'user', text: 'new' }, { role: 'result' }]) === 'new');
    ok('no closing row, nothing', C.turnOpener([{ role: 'user', text: 'a' }]) === '' && C.turnOpener([]) === '');
    const hostCard = { id: 'cs9', sessionId: 's2', status: 'idle', queued: ['held'], pendingAsk: { q: 1 }, lastTurn: { endedAt: NOW, engineCut: true },
        messages: [{ role: 'user', text: C.cutNudgeText() }, { role: 'result', text: 'turn interrupted' }] };
    const cc = C.cutCardOf(hostCard);
    ok('cutCardOf narrows the host card (queue, a question open, the opener)', cc.queued === 1 && cc.asking === true && cc.opened.startsWith(C.CUT_NUDGE) && cc.lastTurn.engineCut === true);
}

console.log('\n== the verdict ==');
{
    const o = order(card());
    ok('‼️ a flowing leg the engine cut is asked once to go on', o.act === 'nudge' && o.leg === 2 && o.chainId === 'chn_t' && /asked once/.test(o.why));
    ok('a turn that was not cut is none', order(card({ lastTurn: { endedAt: NOW } })).act === 'none' && order(card({ lastTurn: undefined })).act === 'none');
    ok('a card at work, with a question open, or with a message queued is none',
        order(card({ status: 'working' })).act === 'none' && order(card({ asking: true })).act === 'none' && order(card({ queued: 1 })).act === 'none');
    ok('a session that is no relay leg is none', order(card({ sessionId: 'zz' })).act === 'none' && order(card({ sessionId: '' })).act === 'none');
    const passed = chain().concat([{ id: 'b2', chainId: 'chn_t', hop: 2, state: 'waiting-end', from: { sessionId: 's2' }, createdAt: NOW, updatedAt: NOW }]);
    ok('‼️ a leg that passed the baton is left to S-86', order(card(), passed).act === 'none' && /passed/.test(order(card(), passed).why));
    ok('‼️ a Last leg is left alone (the chain ends with it anyway)', order(card(), chain({ lastLeg: { at: NOW - 1, by: 'the user' } })).act === 'none');
    const ended = chain({ lastLeg: { at: NOW - 1, by: 'the user' } }).concat([{ id: 'b3', chainId: 'chn_t', hop: 2, state: 'done', from: { sessionId: 's2' }, createdAt: NOW, updatedAt: NOW }]);
    ok('a chain the user ended is left alone', order(card(), ended).act === 'none');
    const newer = chain().concat([{ id: 'b4', chainId: 'chn_t', hop: 2, state: 'started', from: { sessionId: 's9' }, toSessionId: 's3', createdAt: NOW, updatedAt: NOW }]);
    ok('a chain gone past the leg is left alone', order(card(), newer).act === 'none');
    ok('‼️ a leg a HANDOVER order reached is left to S-90 and the failsafe', order(card(), chain(), sid => sid === 's2').act === 'none' && order(card(), chain(), () => false).act === 'nudge');
    ok('‼️ a leg paused in place (fresh here mark) is left alone', order(card(), chain({ pause: { mode: 'here', at: NOW - 1000, by: 'the user' } })).act === 'none');
    ok('…a stale here mark (the leg worked on long after it) does not hold the nudge back', order(card(), chain({ pause: { mode: 'here', at: NOW - 3600e3, by: 'the user' } })).act === 'nudge');
    ok('…and a pause at the pass does not either: the leg is to go on and pass', order(card(), chain({ pause: { mode: 'pass', at: NOW - 1000, by: 'the user' } })).act === 'nudge');
    const again = order(card({ opened: C.cutNudgeText() }));
    ok('‼️ the turn a nudge opened, cut again, is never nudged twice (no loop) — spent', again.act === 'spent' && /not asked twice/.test(again.why));
    ok('a cut after the nudge\'s turn went through and the agent was spoken to again is a new cut', order(card({ opened: 'PASS NOW — pass the baton' })).act === 'nudge');
}

console.log('\n== the watch: applies each cut once ==');
{
    const said = [], sent = [];
    let cards = [card()];
    let refuse = false;
    const w = new C.EngineCutWatch({
        batons: () => chain(), cards: () => cards, handover: () => false,
        nudge: (id, text) => { if (refuse) { return false; } sent.push({ id, text }); return true; },
        say: (title, body, key, level, type) => said.push({ title, body, key, level, type })
    });
    w.check();
    ok('‼️ the cut card is sent ONE nudge into the same card', sent.length === 1 && sent[0].id === 'cs1' && sent[0].text === C.cutNudgeText());
    ok('…and the person is told, quietly', said.length === 1 && said[0].level === 1 && said[0].type === 'info' && /asked once to go on/.test(said[0].title) && said[0].key === `cut:s2:${NOW}`);
    w.check();
    ok('a second sweep over the same cut sends nothing more', sent.length === 1 && said.length === 1);
    cards = [card({ status: 'working', lastTurn: undefined, opened: '' })];
    w.check();
    cards = [card({ lastTurn: { endedAt: NOW + 60e3, engineCut: true }, opened: C.cutNudgeText() })];
    w.check(); w.check();
    ok('‼️ the nudge\'s own turn cut again: no second nudge, one warning that the chain waits', sent.length === 1 && said.length === 2 && said[1].level === 2 && said[1].type === 'warning' && /waits for you/.test(said[1].title));
    cards = [card({ lastTurn: { endedAt: NOW + 900e3, engineCut: true }, opened: 'carry on with the queue' })];
    w.check();
    ok('a later cut of a turn somebody else opened is answered again', sent.length === 2);
    refuse = true;
    cards = [card({ lastTurn: { endedAt: NOW + 1800e3, engineCut: true }, opened: 'next' })];
    w.check(); w.check();
    ok('a nudge the Console refuses is said once as a warning and not retried every sweep', sent.length === 2 && said.length === 4 && said[3].level === 2 && /could not be sent/.test(said[3].title));
    const thrower = new C.EngineCutWatch({ batons: () => chain(), cards: () => [card()], handover: () => false, nudge: () => { throw new Error('x'); }, say: () => { throw new Error('y'); } });
    let threw = false;
    try { thrower.check(); } catch { threw = true; }
    ok('a throwing nudge or notice never breaks the sweep', !threw);
}

console.log('\n== the wiring ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('extension.ts builds the watch from the Console cards through cutCardOf', /new EngineCutWatch\(\{[\s\S]{0,400}consoleHost\.list\(\)\.filter\(c => !!c\.sessionId\)\.map\(cutCardOf\)/.test(ext));
    ok('…asks S-90\'s own handover question', /handover: sid => !!handoverOrderOf\(sid\)/.test(ext));
    ok('…speaks through consoleHost.send, the channel Pass now and Pause use', /nudge: \(id, text\) => \{ const r = consoleHost\.send\(id, text\); if \(!r \|\| r\.refused\) \{ return false; \}/.test(ext));
    ok('‼️ …and the 60 s relay sweep runs it', /const batonSweep = setInterval\(\(\) => \{[^\n]*engineCuts\.check\(\);/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
