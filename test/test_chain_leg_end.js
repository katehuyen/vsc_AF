// S-128 — WHY A LEG ENDED IS READ OFF ITS RECORD, AND THE CHAINS PAGE SAYS IT.
//
// The legs strip draws a mark per leg — 📊 the context line, ⏱ the quota line (a plan limit too),
// 👤 the user (⑂ Pass now said into it, its brake / End, or ended by hand), 🛑 a fault (a failsafe
// rescue, a flagged conversation, the crash-loop guard) — and nothing for an early pass or a clean
// end. Every answer stands on a FIELD of the leg's pass / closing record or its opener, never on a
// sentence: two of those fields are new here (opener.passNow, closing.byUser), because the record
// held neither fact before. The leg's hover also names the account rule it was placed by and the
// slot it ran on; its words cell carries the whole handover words and a ⧉ to copy them.
//
//   node test/test_chain_leg_end.js
'use strict';
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const OUT = path.join(__dirname, '..', 'out', 'core');
const { legEndOf } = require(path.join(OUT, 'chainLegEnd.js'));
const { markPassNow } = require(path.join(OUT, 'batonAttach.js'));
const { failsafeVerdict } = require(path.join(OUT, 'batonFailsafe.js'));
const P = require(path.join(OUT, 'chainsPage.js'));
const M = require(path.join(OUT, 'chainMembership.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fx = require(path.join(__dirname, 'fixtures', 'chains.js'));

const NOW = 1790400000000;
const from = sessionId => ({ sessionId, agentId: 'dev', engine: 'claude', cwd: 'D:/zone', launchId: 'l' });
const bat = (o) => ({
    id: o.id, chainId: o.chainId || 'chn_a', hop: o.hop, prompt: o.prompt ?? (o.hop ? 'devir sözleri' : ''), from: from(o.from),
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: o.account || '@emptiest' }, state: o.state || 'started',
    ...(o.to ? { toSessionId: o.to } : {}), why: o.why || o.state || 'started', createdAt: o.at ?? NOW, updatedAt: o.at ?? NOW, ...(o.extra || {})
});
const cause = (kind) => ({ cause: { kind, quotaPct: 50, why: `cause ${kind}` } });
const seal = bat({ id: 's', hop: 0, from: 'a', to: 'a', at: NOW - 3600e3, account: '@pool' });

// --- the verdict, field by field ---
ok('no record → no verdict (unknown is never evidence)', legEndOf(undefined, seal) === undefined);
ok('a pass with neither cause nor fault → no verdict', legEndOf(bat({ id: 'p', hop: 1, from: 'a', to: 'b', extra: {} }), seal) === undefined);
const kindOf = (extra, opener = seal, state = 'started') => (legEndOf(bat({ id: 'p', hop: 1, from: 'a', to: 'b', state, extra }), opener) || {}).kind;
ok('context cause → context', kindOf(cause('context')) === 'context');
ok('quota cause → quota', kindOf(cause('quota')) === 'quota');
ok('a plan limit is the quota\'s', kindOf(cause('limit')) === 'quota');
ok('a flagged conversation is a fault', kindOf(cause('flagged')) === 'fault');
ok('an early pass is early (no mark)', kindOf(cause('early')) === 'early');
ok('a pass from before X-472 with only fault=limit → quota', kindOf({ fault: 'limit' }) === 'quota');
ok('… with only fault=flagged → fault', kindOf({ fault: 'flagged' }) === 'fault');
ok('a failsafe rescue is a fault, and its why is the rescue\'s', kindOf({ rescue: 'it ended without passing', ...cause('context') }) === 'fault'
    && legEndOf(bat({ id: 'p', hop: 1, from: 'a', extra: { rescue: 'it ended without passing' } }), seal).why === 'it ended without passing');
ok('a braked pass keeps its cause (the brake is the chain\'s, not why the leg handed over)', kindOf({ brake: 'ceiling', ...cause('context') }, seal, 'stopped') === 'context');
const asked = { ...seal, passNow: { at: NOW - 60e3, by: 'the user (Console card)' } };
const byUser = legEndOf(bat({ id: 'p', hop: 1, from: 'a', at: NOW, extra: cause('context') }), asked);
ok('Pass now said before the pass → user, and the why keeps the measured cause', byUser.kind === 'user' && /pressed Pass now — cause context/.test(byUser.why));
ok('Pass now said AFTER the pass does not claim it', kindOf(cause('context'), { ...seal, passNow: { at: NOW + 1, by: 'u' } }) === 'context');
ok('the crash-loop guard\'s closing record → fault', kindOf({}, seal, 'failed') === 'fault');
ok('a clean end with no hand on it → done (no mark)', kindOf({}, seal, 'done') === 'done');
ok('a closing record under the user\'s brake / End → user', kindOf({}, { ...seal, lastLeg: { at: NOW, by: 'the user' } }, 'done') === 'user');
ok('a closing record of a leg ended by hand → user', kindOf({ byUser: true }, seal, 'done') === 'user');

// --- the failsafe writes byUser; the clean end does not ---
const list = [seal];
const v = failsafeVerdict(list, { sessionId: 'a', endedAt: NOW, byUser: true });
ok('the failsafe\'s by-hand verdict carries byUser', v.act === 'done' && v.byUser === true);
const clean = failsafeVerdict(list, { sessionId: 'a', endedAt: NOW, dirty: '' });
ok('its clean natural end does not', clean.act === 'done' && clean.byUser === undefined);

// --- Pass now is stamped on the running leg's opener, nothing else moves ---
const stamped = markPassNow(list, 'a', 'the user (Console card)', NOW);
ok('Pass now stamps the opener: when and by whom', !!stamped && stamped.id === 's' && stamped.passNow.at === NOW && stamped.passNow.by === 'the user (Console card)');
ok('… and leaves updatedAt alone (the crash-loop guard reads it as the leg\'s start)', stamped.updatedAt === seal.updatedAt);
ok('a session in no relay is not stamped', markPassNow(list, 'zz', 'u', NOW) === undefined);
ok('a leg that already passed is not stamped', markPassNow([seal, bat({ id: 'p', hop: 1, from: 'a', to: 'b', state: 'waiting-end' })], 'a', 'u', NOW) === undefined);

// --- chainLegLines carries the verdict, the rule and the slot ---
const two = [seal, bat({ id: 'p1', hop: 1, from: 'a', to: 'b', at: NOW - 1800e3, extra: cause('quota') }), bat({ id: 'c', hop: 2, from: 'b', state: 'done', prompt: '', at: NOW, extra: { byUser: true } })];
const ix = M.chainIndex(two.map(M.linkOf));
const lines = P.chainLegLines(ix, 'chn_a', two, () => undefined, sid => ({ a: 'kate', b: 'murat' })[sid]);
ok('leg 1: quota, placed by @pool, ran on kate', lines[0] && lines[0].end.kind === 'quota' && lines[0].rule === '@pool' && lines[0].account === 'kate');
ok('leg 2: ended by hand, placed by its opener\'s rule, ran on murat', lines[1] && lines[1].end.kind === 'user' && lines[1].rule === '@emptiest' && lines[1].account === 'murat');
ok('no slot reader → no account field', !('account' in P.chainLegLines(ix, 'chn_a', two, () => undefined)[0]));

// --- the page draws it ---
const r = runPage('chains.js', fx.data());
const row = r.query('.ch-row').find(e => e.dataset.chain === 'chn_night');
if (row) { row.click(); }
r.send({ type: 'legs', chainId: 'chn_night', legs: fx.legsOf('chn_night') });
const html = r.html();
const marks = [...html.matchAll(/<span class="ch-cause">([^<]*)<\/span>/g)].map(m => m[1]);
ok('every mark the user chose is drawn, and only those', ['📊', '⏱', '👤', '🛑'].every(m => marks.includes(m)) && marks.every(m => ['📊', '⏱', '👤', '🛑', ''].includes(m)));
ok('the early pass draws no mark', marks.includes(''));
ok('the user\'s Pass now leg says so on its number', /User intervention[\s\S]{0,200}pressed Pass now/.test(html));
ok('a leg\'s title hover names the rule and the slot', html.includes('Account: @emptiest → claude-murvietnam'));
const copies = r.query('.ch-copy').filter(b => !/^chn_/.test(b.dataset.copy || ''));
ok('every leg with words carries ⧉ with the WHOLE words', copies.length === 12 && copies.every(b => /\n/.test(b.dataset.copy || '')));
ok('the words cell\'s hover holds the whole words', /Handover words<\/span><span class="af-tipb">Devir 1:[^<]*\n/.test(html));

console.log(`test_chain_leg_end: ${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
