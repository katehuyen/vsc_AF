// X-427 — a relay leg whose ENGINE fails a turn: the classifier (src/core/engineFault.ts),
// the decision and the watch (src/core/engineFaultWatch.ts), the mechanical pass through the
// failsafe's rescue path (batonLegEnd.ts enginePass), Needs You, the settings and the wiring.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? {} : origLoad.call(this, r, p, m); };
const OUT = path.join(ROOT, 'out', 'core');
const E = require(path.join(OUT, 'engineFault.js'));
const W = require(path.join(OUT, 'engineFaultWatch.js'));
const O = require(path.join(OUT, 'engineFaultOps.js'));
const N = require(path.join(OUT, 'needs.js'));
const D = require(path.join(OUT, 'batonDoor.js'));
const LE = require(path.join(OUT, 'batonLegEnd.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BatonRunner } = require(path.join(OUT, 'batonRunner.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const FLAG = 'API Error: Opus 5.5\'s safeguards flagged this message (https://www.anthropic.com/legal/aup). This sometimes happens with safe, normal conversations. '
    + 'Claude Code can\'t respond to this message with Opus 5.5. Try rephrasing the request in a new session or change your model. Details: [reasoning_extraction] Request ID: req_011C';

console.log('\n== the classifier ==');
{
    const k = t => E.classifyEngineFault(t).kind;
    ok('‼️ the user\'s own flagged message is FLAGGED (not an outage, though it says API Error)', k(FLAG) === 'flagged');
    ok('…and its words are kept, on one line, cut to fit', /safeguards flagged/.test(E.classifyEngineFault(FLAG).said) && E.classifyEngineFault(FLAG).said.length <= 200);
    ok('529 overloaded is an outage', k('API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}') === 'outage');
    ok('500 is an outage', k('API Error: 500 {"type":"error","error":{"type":"api_error","message":"Internal server error"}}') === 'outage');
    ok('a connection error is an outage', k('API Error: Connection error.') === 'outage');
    ok('a timeout is an outage', k('API Error: Request timed out.') === 'outage');
    ok('a rate limit is an outage (waiting helps)', k('API Error: 429 rate_limit_error') === 'outage');
    ok('ECONNRESET is an outage', k('fetch failed: read ECONNRESET') === 'outage');
    ok('401 is auth', k('API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}') === 'auth');
    ok('an expired OAuth token is auth', k('OAuth token has expired. Please run /login') === 'auth');
    ok('a failed turn that is not the engine is none', k('turn failed (error_max_turns)') === 'none');
    ok('nothing said is none', k('') === 'none' && k(undefined) === 'none');
}

console.log('\n== faultText: only the engine\'s error words of the turn that ended ==');
{
    const t = E.faultText([
        { role: 'result', isError: true, text: 'API Error: 500 old turn' },
        { role: 'user', text: 'go on' },
        { role: 'agent', text: 'The queue is overloaded with work, so I split it.' },
        { role: 'result', isError: true, text: 'API Error: 529 overloaded_error' }
    ]);
    ok('the closing error of THIS turn, nothing from before the last user message', t === 'API Error: 529 overloaded_error');
    ok('‼️ an agent\'s own prose about "overloaded" is never read', !/split it/.test(t));
    const t2 = E.faultText([{ role: 'user', text: 'x' }, { role: 'agent', text: FLAG }, { role: 'result', isError: true, text: 'turn failed (error)' }]);
    ok('an engine error printed as the reply is read too', E.classifyEngineFault(t2).kind === 'flagged');
    ok('a turn that went through leaves nothing to read', E.faultText([{ role: 'user', text: 'x' }, { role: 'result', isError: false, text: '' }]) === '');
}

const NOW = 1790000000000;
const from = sid => ({ sessionId: sid, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'lch_' + sid });
const inherit = { model: 'opus', surface: 'console', account: 'claude-kate' };
const baton = o => Object.assign({
    id: 'btn_1', chainId: 'chn_a', hop: 1, prompt: 'build X-427', from: from('s-leg1'), inherit,
    want: { surface: 'inherit', account: '@pool' }, state: 'started', toSessionId: 's-leg2',
    why: 'started', createdAt: NOW - 3600e3, updatedAt: NOW - 3600e3
}, o);
const seal = baton({ id: 'btn_0', hop: 0, from: from('s-leg1'), toSessionId: 's-leg1', prompt: '(first leg)' });
const opener = baton();
const card = o => Object.assign({ id: 'con_2', sessionId: 's-leg2', status: 'idle', queued: 0, asking: false, lastTurn: { endedAt: NOW - 10e3, outcome: 'failed' }, text: FLAG }, o);
const opts = o => Object.assign({ waitMs: 24 * 3600e3, maxFlagged: 3, flaggedModel: '' }, o);
const order = (c, list, o = {}) => W.faultOrder(Object.assign({ card: c, list, now: NOW, opts: opts() }, o));

console.log('\n== the decision ==');
{
    ok('a session no baton opened is not watched', order(card({ sessionId: 's-other' }), [seal, opener]).act === 'none');
    ok('a leg that already passed is left alone', order(card(), [seal, opener, baton({ id: 'b2', hop: 2, from: from('s-leg2'), state: 'waiting-end', toSessionId: undefined })]).act === 'none');
    ok('a running turn is never judged', order(card({ status: 'working' }), [seal, opener]).act === 'none');
    ok('…nor a card with a question open or a message queued', order(card({ asking: true }), [seal, opener]).act === 'none' && order(card({ queued: 1 }), [seal, opener]).act === 'none');
    const p = order(card(), [seal, opener]);
    ok('‼️ FLAGGED on a running leg: the baton is passed for it, on the chain\'s own model', p.act === 'pass' && !p.model && /passes the baton for it/.test(p.why));
    const flaggedOpener = baton({ fault: 'flagged' });
    const p2 = order(card(), [seal, flaggedOpener], { opts: opts({ flaggedModel: 'sonnet' }) });
    ok('…the second flagged pass in a row opens on the fallback model', p2.act === 'pass' && p2.model === 'sonnet');
    ok('…with no fallback set, the chain keeps its model', !order(card(), [seal, flaggedOpener]).model);
    ok('W.flaggedStreak counts the flagged hops at the chain\'s tail', W.flaggedStreak([seal, flaggedOpener], 'chn_a') === 1 && W.flaggedStreak([seal, opener], 'chn_a') === 0);
    const h = order(card(), [seal, flaggedOpener], { opts: opts({ maxFlagged: 1 }) });
    ok('‼️ the cap: flagged passes in a row reached it, the chain HOLDS for a person', h.act === 'hold' && /waits for you/.test(h.why));
    ok('…0 = no cap of its own', order(card(), [seal, flaggedOpener], { opts: opts({ maxFlagged: 0 }) }).act === 'pass');
    ok('an episode already passed is not passed twice', order(card(), [seal, opener], { episode: { kind: 'flagged', state: 'passed' } }).act === 'none');

    const out = card({ text: 'API Error: 529 overloaded_error' });
    const w = order(out, [seal, opener]);
    ok('‼️ OUTAGE: never a new leg — the same session waits, asked again in a minute', w.act === 'wait' && w.at === NOW - 10e3 + 60e3 && /no new leg/.test(w.why));
    const n = order(out, [seal, opener], { now: NOW + 60e3 });
    ok('…and asked once the minute is up (attempt 1)', n.act === 'nudge' && /attempt 1/.test(n.why));
    const ep = { kind: 'outage', state: 'waiting', since: NOW - 3600e3, nudges: 3, lastNudgeAt: NOW - 60e3 };
    const n3 = order(out, [seal, opener], { episode: ep });
    ok('each next attempt waits twice as long (after 3: 8 min)', n3.act === 'wait' && n3.at === NOW - 10e3 + 8 * 60e3 && n3.since === NOW - 3600e3);
    ok('the step never exceeds an hour', W.nudgeDelay(20) === 3600e3 && W.nudgeDelay(0) === 60e3);
    const g = order(out, [seal, opener], { episode: Object.assign({}, ep, { since: NOW - 25 * 3600e3 }) });
    ok('‼️ past the ceiling: it stops asking and waits for a person', g.act === 'give-up' && /ceiling/.test(g.why));
    ok('…said once', order(out, [seal, opener], { episode: Object.assign({}, ep, { since: NOW - 25 * 3600e3, state: 'gave-up' }) }).act === 'none');
    ok('…0 hours = no ceiling', order(out, [seal, opener], { episode: Object.assign({}, ep, { since: NOW - 99 * 3600e3 }), opts: opts({ waitMs: 0 }) }).act !== 'give-up');
    ok('auth waits the same way', order(card({ text: 'API Error: 401 authentication_error' }), [seal, opener]).act === 'wait');
    ok('‼️ the turn went through: the episode is CLEARED', order(card({ lastTurn: { endedAt: NOW, outcome: 'done' } }), [seal, opener], { episode: ep }).act === 'clear');
    ok('…and a failed turn that is not the engine clears it too', order(card({ text: 'turn failed (error_max_turns)' }), [seal, opener], { episode: ep }).act === 'clear');
    ok('no episode and no fault: nothing', order(card({ lastTurn: { endedAt: NOW, outcome: 'done' } }), [seal, opener]).act === 'none');
    ok('leg 1 (the seal\'s own session) is watched too', order(card({ sessionId: 's-leg1' }), [seal]).act === 'pass');
}

(async () => {
    console.log('\n== the watch, against a real runner ==');
    const mk = (list, extra = {}) => {
        const store = new BatonStore(null);
        store.put(...list);
        const opened = [], told = [], nudged = [], passes = [];
        let cards = [card()];
        let now = NOW;
        const runner = new BatonRunner({
            store, now: () => now,
            door: b => { opened.push(b); return { taskId: 'tsk_n', sessionId: 's-next' }; },
            evidence: () => ({ registered: false, live: 'ended', registers: true }),
            legFacts: async (sid, at) => ({ sessionId: sid, endedAt: at, dirty: '', commits: 'abc123 half of X-427' }),
            launchIdOf: () => undefined, maxLegs: () => 6,
            notify: (title, body, key, level) => told.push({ title, body, key, level })
        });
        const watch = new W.EngineFaultWatch(Object.assign({
            batons: () => store.all(), cards: () => cards, opts: () => opts(extra.opts || {}),
            pass: (sid, why, model) => { const p = runner.enginePass(sid, why, model); passes.push(p); return p; },
            nudge: (id, text) => { nudged.push({ id, text }); return true; },
            say: (title, body, key, level) => told.push({ title, body, key, level }),
            now: () => now
        }, extra.deps || {}));
        return { store, runner, watch, opened, told, nudged, passes, setCards: c => { cards = c; }, setNow: t => { now = t; } };
    };
    {
        const t = mk([seal, opener]);
        t.watch.check();
        await Promise.all(t.passes);
        const b = t.store.all().find(x => x.from.sessionId === 's-leg2');
        ok('‼️ flagged: a baton is written FROM the flagged leg, marked, and it WAITS for the session\'s end', b && b.state === 'waiting-end' && b.fault === 'flagged' && b.hop === 2 && /flagged/.test(b.rescue));
        ok('…nothing opens beside the live card (two agents in one repo, never)', t.opened.length === 0);
        ok('…its evidence carries what the leg committed and its own brief', /half of X-427/.test(b.prompt) && /build X-427/.test(b.prompt));
        ok('…and the advice not to paste the flagged words back', b.prompt.includes(LE.FLAGGED_ADVICE));
        ok('…said once on Notices', t.told.some(x => /flagged leg/.test(x.title)));
        ok('the watch shows the episode as passed', t.watch.list()[0].state === 'passed');
        t.watch.check();
        await Promise.all(t.passes);
        ok('a second pass over the same card writes no second baton', t.store.all().filter(x => x.from.sessionId === 's-leg2').length === 1);
        t.runner.sessionEnded('s-leg2', 'card closed');
        ok('‼️ the card ends (the ender closes it) → the SAME release opens the successor', t.opened.length === 1 && t.opened[0].fault === 'flagged');
        const row = D.successorRow(t.opened[0], { agentName: 'developer' });
        ok('…whose first message is the emergency header with the evidence', /EMERGENCY HANDOVER/.test(row.prompt) && /flagged/.test(row.prompt));
    }
    {
        const t = mk([seal, baton({ fault: 'flagged' })], { opts: { flaggedModel: 'sonnet' } });
        t.watch.check();
        await Promise.all(t.passes);
        const b = t.store.all().find(x => x.from.sessionId === 's-leg2');
        ok('the second flagged pass in a row: the successor inherits the fallback model', b && b.inherit.model === 'sonnet');
    }
    {
        const t = mk([seal, baton({ fault: 'flagged' })], { opts: { maxFlagged: 1 } });
        t.watch.check();
        await Promise.all(t.passes);
        ok('at the cap nothing is written; the chain holds', !t.store.all().some(x => x.from.sessionId === 's-leg2') && t.watch.list()[0].state === 'held');
        const items = N.buildNeedsQueue({ liveSessions: [], approvals: [], insights: [], engineFaults: t.watch.list() });
        const it = items[0];
        ok('‼️ Needs You: a held chain is a row that opens the session', items.length === 1 && it.kind === 'engine-fault' && it.ref.consoleId === 'con_2' && it.actions[0].id === 'open-console');
        ok('…it blocks, is keyed by the session, and can be cleared', N.blockingCount(items) === 1 && N.needKey(it) === 'engine-fault|s-leg2' && N.isClearable(it));
    }
    {
        const t = mk([seal, opener]);
        t.setCards([card({ text: 'API Error: 529 overloaded_error' })]);
        t.watch.check();
        ok('outage: nothing is written, nothing opened — the leg waits', !t.store.all().some(x => x.from.sessionId === 's-leg2') && t.opened.length === 0 && t.nudged.length === 0);
        ok('…said once on Notices', t.told.filter(x => /Engine fault/.test(x.title)).length === 1);
        ok('an outage still in its waiting is news, not a Needs You row', N.buildNeedsQueue({ liveSessions: [], approvals: [], insights: [], engineFaults: t.watch.list() }).length === 0);
        t.setNow(NOW + 61e3);
        t.watch.check();
        ok('‼️ the minute is up: the SAME session is asked to continue', t.nudged.length === 1 && t.nudged[0].id === 'con_2' && /attempt 1 to continue/.test(t.nudged[0].text));
        t.watch.check();
        ok('…once, not on every pass', t.nudged.length === 1 && t.watch.list()[0].nudges === 1);
        t.setCards([card({ text: 'API Error: 529 overloaded_error', lastTurn: { endedAt: NOW + 70e3, outcome: 'failed' } })]);
        t.setNow(NOW + 70e3 + 121e3);
        t.watch.check();
        ok('it failed again: attempt 2 two minutes after that turn', t.nudged.length === 2 && /attempt 2/.test(t.nudged[1].text));
        t.setCards([card({ text: '', lastTurn: { endedAt: NOW + 300e3, outcome: 'done' } })]);
        t.watch.check();
        ok('‼️ the engine is back: the episode clears, the same session goes on, and it is said', t.watch.list().length === 0 && t.told.some(x => /Engine back/.test(x.title)) && t.opened.length === 0);
    }
    {
        const t = mk([seal, opener]);
        t.setCards([card({ text: 'API Error: 529 overloaded_error' })]);
        t.watch.check();
        t.setCards([]);
        t.watch.check();
        ok('a card that is gone takes its episode with it', t.watch.list().length === 0);
    }

    console.log('\n== the settings ==');
    {
        const d = O.faultOpts(() => undefined);
        ok('nothing written: 24 h, 3 passes, the chain\'s own model', d.waitMs === 24 * 3600e3 && d.maxFlagged === 3 && d.flaggedModel === '');
        const own = { batonFaultWaitHours: 2, batonFlaggedPasses: 0, batonFlaggedModel: 'sonnet' };
        const s = O.faultOpts(k => own[k]);
        ok('the user\'s values win, and each says where it came from', s.waitMs === 2 * 3600e3 && s.maxFlagged === 0 && s.flaggedModel === 'sonnet' && /Farm Settings/i.test(s.sentences.flaggedModel));
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
        const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
        ok('the three settings are contributed', ['batonFaultWaitHours', 'batonFlaggedPasses', 'batonFlaggedModel'].every(k => props['agentFarm.' + k]));
    }

    console.log('\n== the bridge op ==');
    {
        const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
        const t = mk([seal, opener]);
        t.setCards([card({ text: 'API Error: 529 overloaded_error' })]);
        const reg = new BridgeRegistry();
        O.registerFaultOps(reg, t.watch, () => O.faultOpts(() => undefined));
        const cat = await reg.dispatch('farm.ops', {});
        ok('baton.faults is in the catalog', cat.ok && cat.result.some(o => o.op === 'baton.faults'));
        const r0 = await reg.dispatch('baton.faults', {});
        ok('read: no pass has run yet, nothing listed; the settings and their origins answer', r0.ok && r0.result.faults.length === 0 && r0.result.settings.maxFlagged === 3 && !!r0.result.settings.from.waitHours);
        const r1 = await reg.dispatch('baton.faults', { check: true });
        ok('check:true runs a pass now and lists the episode with what was done', r1.ok && r1.result.faults.length === 1 && r1.result.faults[0].kind === 'outage' && r1.result.orders[0].act === 'wait');
    }

    console.log('\n== the wiring ==');
    {
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        ok('the watch runs on the relay\'s minute sweep', /batonEnder\.check\(\); engineFaults\.check\(\);/.test(ext));
        ok('its pass is the runner\'s (the failsafe\'s rescue path)', /pass: \(sid, why, model\) => batonRunner\.enginePass\(sid, why, model\)/.test(ext));
        ok('its nudge is said into the same Console card', /nudge: \(id, text\) => !!consoleHost\.send\(id, text\)/.test(ext));
        ok('Needs You reads its episodes', /engineFaults: engineFaults\.list\(\)/.test(ext));
        ok('the bridge op is registered', /registerFaultOps\(bridge, engineFaults/.test(ext));
        const page = fs.readFileSync(path.join(ROOT, 'media', 'needs.js'), 'utf8');
        ok('the Needs You page knows the kind', /'engine-fault':\s*\{ icon:/.test(page));
    }

    console.log(`\ntest_engine_fault: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
