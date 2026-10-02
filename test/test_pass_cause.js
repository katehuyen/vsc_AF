// X-472 — WHY A LEG PASSED, MEASURED, NEVER TAKEN FROM THE AGENT (src/core/passCause.ts).
// Measured reason: 2026-10-02, chn_muqifjzc001n2b hop 2 — the leg read 90% on its own probe, Agent Farm
// read 89%, no quota order had gone out, and the pass was counted "not the quota's": the stay kept the
// successor on the full account. One verdict from every reading; the agent's figure only raises it.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const C = require(path.join(ROOT, 'out', 'core', 'passCause.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const cause = (o) => C.passCause(Object.assign({ readings: {}, quotaHandoverPct: 90, contextHandoverPct: 40 }, o));

console.log('\n== the verdict ==');
{
    const hop2 = cause({ slot: 'wmmuratvural', readings: { 'agent-farm': 89, agent: 90 } });
    ok('‼️ chn_muqifjzc001n2b hop 2 replayed: Agent Farm 89, the agent\'s probe 90, no order — it IS the quota\'s',
        hop2.kind === 'quota' && hop2.quotaPct === 90 && hop2.quotaFrom === 'agent' && /wmmuratvural was at 90%/.test(hop2.why));
    ok('‼️ an agent\'s figure only RAISES: 10 from the agent never lowers Agent Farm\'s 95',
        cause({ readings: { 'agent-farm': 95, agent: 10 } }).kind === 'quota' && cause({ readings: { 'agent-farm': 95, agent: 10 } }).quotaPct === 95);
    ok('the guard\'s last reading counts as a reading', cause({ readings: { 'agent-farm': 80, guard: 91 } }).quotaFrom === 'guard');
    ok('…and so does the verdict recorded at the pass, at the door', cause({ readings: { 'agent-farm': 70, recorded: 92 } }).kind === 'quota');
    ok('the plan limit comes first, whatever the figures say', cause({ fault: 'limit', readings: { 'agent-farm': 12 } }).kind === 'limit');
    ok('the context line, when the quota is under its own', cause({ readings: { 'agent-farm': 50 }, contextPct: 41 }).kind === 'context'
        && /context window was at 41%/.test(cause({ readings: { 'agent-farm': 50 }, contextPct: 41 }).why));
    ok('a flagged conversation is said as such', cause({ fault: 'flagged', readings: { 'agent-farm': 20 } }).kind === 'flagged');
    const early = cause({ slot: 'kate', readings: { 'agent-farm': 30 }, contextPct: 12 });
    ok('‼️ none of them: an EARLY pass, recorded and said', early.kind === 'early' && /early pass/.test(early.why) && /kate at 30%/.test(early.why));
    ok('a line switched off (0) decides nothing', cause({ readings: { 'agent-farm': 99 }, quotaHandoverPct: 0 }).kind === 'early'
        && cause({ readings: {}, contextPct: 99, contextHandoverPct: 0 }).kind === 'early');
    ok('no reading at all is -1, never a guessed figure', cause({}).quotaPct === -1 && /unmeasured/.test(cause({}).why));
    ok('a negative or absent reading is not a reading', C.highestReading({ 'agent-farm': -1, guard: undefined, agent: 40 }).pct === 40);
}

console.log('\n== what the brake skips is read off the verdict ==');
{
    ok('starved: the limit and the quota', /plan limit/.test(C.starvedOf(cause({ fault: 'limit' }))) && /quota handover line 90%/.test(C.starvedOf(cause({ readings: { 'agent-farm': 90 } }))));
    ok('not starved: context, flagged, early, nothing', !C.starvedOf(cause({ contextPct: 45 })) && !C.starvedOf(cause({ fault: 'flagged' })) && !C.starvedOf(cause({})) && !C.starvedOf(undefined));
}

console.log('\n== one verdict, every reader ==');
{
    const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\r\n/g, '\n');
    const ext = src('extension.ts');
    ok('‼️ the stay reads the verdict, not the order flag (contextGuard …quota.handover is gone from it)',
        /quotaHandover: cause\.kind === 'quota', walled: cause\.kind === 'limit'/.test(ext) && !/quotaHandover: !!\(sid && contextGuard\.record\(sid\)\?\.quota\?\.handover\)/.test(ext));
    ok('the relay door and the sentry\'s next round both classify through passCauseOf before they stay',
        /const cause = passCauseOf\(\{ sessionId: b\.from\.sessionId, slot: was, fault: b\.fault, recorded: b\.cause \}\);\n\s*const stay = handoverStay\(was, cause\);/.test(ext)
        && /stay: handoverStay\(finishedTask\.account, passCauseOf\(\{ sessionId: successorSessionOf\(finishedTask\), slot: finishedTask\.account \}\)\)/.test(ext));
    ok('the pass and the runner record it (causeOf), and the old starved derivation is gone',
        (ext.match(/causeOf: \(b, agentPct\) => passCauseOf\(/g) || []).length === 2 && !/legStarvedOf|starvedWhy/.test(ext)
        && !fs.existsSync(path.join(ROOT, 'src', 'core', 'batonRoom.ts')));
    const legEnd = src('core/batonLegEnd.ts');
    ok('the failsafe reads the same verdict (no second "plan limit" sentence of its own)', /starvedOf\(cause\)/.test(legEnd) && !/'its account hit the plan limit'/.test(legEnd));
    ok('the Console card says why each leg passed', /Passed: \$\{left\.cause\.why\}/.test(src('core/batonView.ts')));
}

console.log(`test_pass_cause: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
