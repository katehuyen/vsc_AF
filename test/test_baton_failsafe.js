// S-83 — THE FAILSAFE: a relay leg that ended without passing the baton.
//
// What must not go wrong quietly: a run that FINISHED the work (and so passed
// nothing) is never given a successor — that is the chain's one natural end;
// a run that was cut off (told to hand over, wrote a note, crashed, left
// uncommitted work) is; the user's own stop is never overridden; a successor
// that dies at once stops the chain instead of opening another; and every
// judgement leaves a record, so a chain is judged once.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const B = require(path.join(OUT, 'baton.js'));
const F = require(path.join(OUT, 'batonFailsafe.js'));
const D = require(path.join(OUT, 'batonDoor.js'));
const V = require(path.join(OUT, 'batonView.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BatonRunner } = require(path.join(OUT, 'batonRunner.js'));

const NOW = 1790000000000;
const from = (sid) => ({ sessionId: sid, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'lch_' + sid });
const inherit = { model: 'opus', surface: 'headless', account: 'claude-kate' };
const baton = (o) => Object.assign({
    id: 'btn_1', chainId: 'chn_a', hop: 1, prompt: 'go on', from: from('s-leg1'), inherit,
    want: { surface: 'inherit', account: '@pool' }, state: 'started', toSessionId: 's-leg2',
    why: 'started', createdAt: NOW - 3600e3, updatedAt: NOW - 3600e3
}, o);
const seal = baton({ id: 'btn_0', hop: 0, from: from('s-leg1'), toSessionId: 's-leg1', prompt: '(first leg)' });
const opener = baton();
const facts = (o) => Object.assign({ sessionId: 's-leg2', endedAt: NOW, dirty: '' }, o);

console.log('\n== the verdict ==');
{
    ok('a session no baton opened: nothing to judge', F.failsafeVerdict([seal], facts({ sessionId: 's-other' })).act === 'none');
    const clean = F.failsafeVerdict([seal, opener], facts());
    ok('‼️ a clean, unpassed end is the chain\'s NATURAL end — done, never a rescue',
        clean.act === 'done' && /natural end/.test(clean.why) && clean.opener === opener);
    ok('leg 1 (the seal\'s own session) is judged too', F.failsafeVerdict([seal], facts({ sessionId: 's-leg1' })).act === 'done');
    ok('‼️ a leg that passed is not judged', F.failsafeVerdict([seal, opener, baton({ id: 'b2', hop: 2, from: from('s-leg2'), state: 'waiting-end', toSessionId: undefined })], facts({ handover: 'CONTEXT HANDOVER 41%' })).act === 'none');
    ok('…nor one whose pass was braked (kept as stopped)', F.failsafeVerdict([opener, baton({ id: 'b2', hop: 2, from: from('s-leg2'), state: 'stopped', toSessionId: undefined })], facts({ error: 'x' })).act === 'none');
    ok('…nor a chain the user stopped past this leg', F.failsafeVerdict([opener, baton({ id: 'b9', hop: 2, from: from('s-x'), state: 'stopped' })], facts({ handover: 'QUOTA HANDOVER 90%' })).act === 'none');
    const byUser = F.failsafeVerdict([opener], facts({ byUser: true, handover: 'QUOTA HANDOVER 92%', dirty: ' M a.ts' }));
    ok('‼️ the user ended it by hand: the failsafe stays out, whatever else is true', byUser.act === 'done' && /ended by the user/.test(byUser.why));

    const h = F.failsafeVerdict([opener], facts({ handover: 'CONTEXT HANDOVER 41%' }));
    ok('(a) told to hand over and did not pass: rescue', h.act === 'rescue' && /CONTEXT HANDOVER 41% had reached it/.test(h.why));
    const n = F.failsafeVerdict([opener], facts({ note: { path: 'N.md', ts: NOW - 60e3 } }));
    ok('(b) a note written in its last two minutes: rescue', n.act === 'rescue' && /handover note \(N\.md\)/.test(n.why));
    ok('…a note older than that is not its last act', F.failsafeVerdict([opener], facts({ note: { path: 'N.md', ts: NOW - 5 * 60e3 } })).act === 'done');
    ok('(c) a non-zero exit: rescue', /exited with code 1/.test(F.failsafeVerdict([opener], facts({ exitCode: 1 })).why));
    ok('…an error: rescue', F.failsafeVerdict([opener], facts({ error: 'API Error: 529' })).act === 'rescue');
    ok('…uncommitted work: rescue', /uncommitted/.test(F.failsafeVerdict([opener], facts({ dirty: ' M src/a.ts' })).why));
    ok('unknown is never evidence (no dirty read, no exit code)', F.failsafeVerdict([opener], { sessionId: 's-leg2', endedAt: NOW }).act === 'done');

    const fast = baton({ updatedAt: NOW - 12e3 });
    const crash = F.failsafeVerdict([fast], facts({ error: 'auth failed', dirty: ' M a' }));
    ok('‼️ a successor dead 12s after it opened, no tool call: FAILED, not another rescue (crash-loop guard)',
        crash.act === 'failed' && /12s after it opened/.test(crash.why) && /auth failed/.test(crash.why));
    ok('…one that made a tool call is judged normally', F.failsafeVerdict([fast], facts({ toolCalls: 3, dirty: ' M a' })).act === 'rescue');
    ok('…and leg 1 is never a crash (its seal is not when it started)', F.failsafeVerdict([baton({ id: 'b0', hop: 0, from: from('s-leg2'), toSessionId: 's-leg2', updatedAt: NOW - 1000 })], facts()).act === 'done');
}

console.log('\n== what a rescued leg is handed ==');
{
    const note = '---\nsession: x\n---\n# Devir\n\n## Durum\n- done A\n\n## Kalan\n1. do B\n\n## İlk 5 dakika\n- open c.ts\n\n## Other\nnoise';
    ok('the note\'s working sections are kept, its frontmatter and the rest dropped',
        F.noteSections(note) === '## Durum\n- done A\n\n## Kalan\n1. do B\n\n## İlk 5 dakika\n- open c.ts');
    ok('a note without them is handed whole', F.noteSections('just text') === 'just text');
    const ev = F.rescueEvidence(facts({ note: { path: 'N.md', ts: NOW - 1000, text: note }, dirty: ' M a.ts' }), ['CONTEXT HANDOVER 41% had reached it']);
    ok('the evidence says why, carries the note and the uncommitted state',
        /^Why it was rescued: CONTEXT HANDOVER 41% had reached it\./.test(ev) && /Its handover note \(N\.md\)/.test(ev)
        && /## Kalan/.test(ev) && !/noise/.test(ev) && /git status --short\):\n M a\.ts/.test(ev));
    ok('no note: said so', /It wrote no handover note\./.test(F.rescueEvidence(facts({ exitCode: 2 }), ['it exited with code 2'])));

    const b = baton({ id: 'r1', hop: 2, from: from('s-leg2'), state: 'waiting-end', toSessionId: undefined, prompt: 'EVIDENCE', rescue: 'leg 2 ended without passing the baton: it exited with code 2' });
    const rules = require(path.join(__dirname, '..', 'out', 'core', 'batonRules.js')).RELAY_RULES.join('\n');
    const p = F.emergencyPrompt(b, { agentName: 'developer', maxHops: 6, directive: 'run npm test' });
    ok('the built-in header says EMERGENCY and why', /^=== BATON RELAY — chain chn_a · leg 3\/6 · EMERGENCY HANDOVER ===/.test(p) && /ended WITHOUT passing the baton — leg 2 ended/.test(p));
    ok('‼️ it names the predecessor IN FULL and reads its LAST turns (from=-10, never limit alone)',
        /node af\.js sessions\.read session=s-leg2 from=-10/.test(p));
    ok('…the standing directive, then the evidence last', /Standing directive \(the user's, on every leg\): run npm test\n---\nEVIDENCE$/.test(p));
    const u = F.emergencyPrompt(b, { emergencyTemplate: 'SOS {chain} {hop}/{maxHops} {fromSessionId} {agentId} — {why}\n{evidence}\n{nope}', agentName: 'dev', maxHops: 0 });
    ok('the user\'s template is filled; an unknown name is left as typed; no ceiling says none',
        u === 'SOS chn_a 2/none s-leg2 dev — leg 2 ended without passing the baton: it exited with code 2\nEVIDENCE\n{nope}\n' + rules);
    const lost = F.emergencyPrompt(b, { emergencyTemplate: 'SOS', directive: 'd' });
    ok('‼️ a template that forgets {evidence} still hands it over, and the directive and the relay rules',
        lost === 'SOS\n' + rules + '\nStanding directive: d\n---\nEVIDENCE');
    ok('‼️ the built-in emergency header carries the relay rules above the evidence',
        p.includes(rules) && p.indexOf(rules) < p.indexOf('\n---\nEVIDENCE'));
    ok('…a template naming {relayRules} has them there, once',
        F.emergencyPrompt(b, { emergencyTemplate: '{relayRules}\n{evidence}' }) === rules + '\nEVIDENCE');
    ok('the door uses the emergency header for a rescued baton, the ordinary one otherwise',
        /EMERGENCY HANDOVER/.test(D.successorRow(b, {}).prompt) && !/EMERGENCY/.test(D.successorRow({ ...b, rescue: undefined }, {}).prompt));
    ok('its variables are listed for the setting', F.EMERGENCY_TEMPLATE_VARS.join(',') === 'fromSessionId,agentId,chain,leg,hop,maxHops,why,evidence,userDirective,relayRules');
}

console.log('\n== the closing record ==');
{
    const r = F.closingRecord(opener, 's-leg2', 'done', 'finished', 'btn_z', NOW);
    ok('the ended leg is its from; the next hop; nothing handed on',
        r.from.sessionId === 's-leg2' && r.hop === 2 && r.prompt === '' && r.state === 'done' && r.chainId === 'chn_a');
    ok('done and failed are terminal, never live', !B.isLive(r) && !B.isLive({ state: 'failed' }) && B.BATON_DONE.includes('done') && B.BATON_DONE.includes('failed'));
    ok('‼️ with it on record the leg is not judged again', F.failsafeVerdict([opener, r], facts({ handover: 'X' })).act === 'none');
    const v = V.batonCardView([opener, r], 's-leg2');
    ok('the card says the chain ended, and why', v && /Successor: none — the chain ended: finished/.test(v.lines.join('\n')));
    const f = V.batonCardView([opener, { ...r, state: 'failed', why: 'crash' }], 's-leg2');
    ok('…or that it failed', f && /Successor: none — the chain failed: crash/.test(f.lines.join('\n')));
}

console.log('\n== the setting, and the wiring ==');
{
    const fs = require('fs');
    const ROOT = path.join(__dirname, '..');
    const pj = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    ok('agentFarm.batonEmergencyTemplate is a multi-line text box that lists every variable',
        /"agentFarm\.batonEmergencyTemplate": \{\s*"type": "string",\s*"default": "",\s*"editPresentation": "multilineText"/.test(pj)
        && F.EMERGENCY_TEMPLATE_VARS.every(v => new RegExp('\\{' + v + '\\}[^"]*').test(pj.split('"agentFarm.batonEmergencyTemplate"')[1].split('"agentFarm.')[0])));
    ok('…filed under Handover Discipline, in its own group of the page',
        /batonEmergencyTemplate: 'discipline'/.test(fs.readFileSync(path.join(ROOT, 'src', 'core', 'settingsops.ts'), 'utf8'))
        && /keys: \['batonEmergencyTemplate'\]/.test(fs.readFileSync(path.join(ROOT, 'media', 'settings.js'), 'utf8')));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the door reads it, and the runner is given the failsafe\'s sources',
        /emergencyTemplate: cfg\(\)\.get<string>\('batonEmergencyTemplate', ''\)/.test(ext)
        && /legFacts: legFactsFrom\(\{/.test(ext) && /settleMs: 5000/.test(ext) && /launchIdOf: batonAttachDeps\.launchIdOf/.test(ext));
}

console.log('\n== reading a leg\'s end ==');
const LF = require(path.join(OUT, 'batonLegFacts.js'));
const src = (o) => Object.assign({
    card: () => undefined, row: () => undefined, guard: () => undefined, notePath: () => undefined,
    readNote: () => undefined, toolCalls: () => undefined, placeOf: () => ({ cwd: 'D:\\repo' }), gitStatus: async () => ''
}, o);

console.log('\n== the runner ==');
(async () => {
    {
        const f = await LF.legFactsFrom(src({ card: () => ({ status: 'ended', exitReason: 'closed by you' }) }))('s1', NOW);
        ok('a card the user closed is byUser; a clean folder is dirty \'\'', f.byUser === true && f.dirty === '' && f.sessionId === 's1' && f.endedAt === NOW);
        const g = await LF.legFactsFrom(src({ card: () => ({ status: 'ended', exitReason: 'claude exited with code 3' }), toolCalls: () => 7 }))('s1', NOW);
        ok('an exit code is read off the card\'s own words; tool calls from the monitor', g.exitCode === 3 && g.toolCalls === 7 && !g.byUser && !g.error);
        const h = await LF.legFactsFrom(src({ card: () => ({ status: 'error', exitReason: 'spawn EPERM' }), lastTurn: undefined }))('s1', NOW);
        ok('a card in error carries its reason', h.error === 'spawn EPERM');
        const r = await LF.legFactsFrom(src({ row: () => ({ status: 'failed', why: 'API Error 401' }) }))('s1', NOW);
        ok('a failed task row carries its last word; a cancelled one is the user\'s', r.error === 'API Error 401'
            && (await LF.legFactsFrom(src({ row: () => ({ status: 'cancelled' }) }))('s1', NOW)).byUser === true);
        const q = await LF.legFactsFrom(src({ guard: () => ({ handover: { pct: 41 }, quota: { handover: { pct: 92 } } }) }))('s1', NOW);
        ok('the quota handover is named before the context one', q.handover === 'QUOTA HANDOVER 92%');
        const c = await LF.legFactsFrom(src({ guard: () => ({ handover: { pct: 41 } }) }))('s1', NOW);
        ok('…and the context one alone', c.handover === 'CONTEXT HANDOVER 41%');
        const n = await LF.legFactsFrom(src({ notePath: () => 'D:\\N.md', readNote: () => ({ ts: NOW - 5, text: 'T' }) }))('s1', NOW);
        ok('a note found is read with its time', n.note && n.note.path === 'D:\\N.md' && n.note.ts === NOW - 5 && n.note.text === 'T');
        const bad = await LF.legFactsFrom(src({ card: () => { throw new Error('x'); }, gitStatus: async () => { throw new Error('no git'); }, notePath: () => 'D:\\N.md', readNote: () => { throw new Error('gone'); } }))('s1', NOW);
        ok('‼️ a source that fails answers nothing — never a guess', bad.dirty === undefined && !bad.note && !bad.error && bad.byUser === false);
        const nr = await LF.legFactsFrom(src({ gitStatus: async () => undefined }))('s1', NOW);
        ok('not a repository: dirty is unknown, not clean', !('dirty' in nr));
    }
    const mk = (list, factsFor, extra = {}) => {
        const store = new BatonStore(null);
        store.put(...list);
        const opened = [], told = [];
        const runner = new BatonRunner(Object.assign({
            store, now: () => NOW,
            door: (b) => { opened.push(b); return { taskId: 'tsk_n', sessionId: 's-next' }; },
            evidence: () => ({ registered: false, live: 'ended', registers: true }),
            legFacts: async (sid, at) => Object.assign({ sessionId: sid, endedAt: at }, factsFor),
            launchIdOf: () => undefined,
            maxLegs: () => 6,
            notify: (title, body, key, level) => told.push({ title, body, key, level })
        }, extra));
        return { store, runner, opened, told };
    };
    {
        const t = mk([seal, opener], { dirty: '' });
        const r = await t.runner.legEnded('s-leg2', 'end');
        ok('a clean end closes the chain with a done record, and opens nothing', r && r.state === 'done' && t.opened.length === 0 && t.store.all().some(b => b.state === 'done'));
        ok('…Notices hears it once, as routine information', t.told.length === 1 && /Relay finished — chain chn_a/.test(t.told[0].title) && t.told[0].level === 1);
        ok('‼️ judged once: a second end of the same session records nothing more', (await t.runner.legEnded('s-leg2', 'again')) === undefined && t.store.all().length === 3);
    }
    {
        const t = mk([seal, opener], { handover: 'CONTEXT HANDOVER 41%', note: { path: 'N.md', ts: NOW - 30e3, text: '## Kalan\n- B' } });
        const r = await t.runner.legEnded('s-leg2', 'end');
        ok('‼️ a cut-off leg is RESCUED: the next hop goes through the door, from the ended session', t.opened.length === 1
            && t.opened[0].hop === 2 && t.opened[0].from.sessionId === 's-leg2' && !!t.opened[0].rescue && r.state === 'started');
        ok('…with no manifest, the setup is the chain\'s own (the opener\'s), never a guess from elsewhere',
            t.opened[0].inherit.model === 'opus' && t.opened[0].want.account === '@pool' && t.opened[0].from.cwd === 'D:\\repo');
        ok('…its prompt is the evidence: why, and the note\'s sections', /^Why it was rescued: CONTEXT HANDOVER 41% had reached it; it wrote a handover note \(N\.md\)\./.test(t.opened[0].prompt) && /## Kalan\n- B/.test(t.opened[0].prompt));
        ok('…and Notices is told it was rescued', t.told.some(x => /Relay rescued — chain chn_a/.test(x.title)));
    }
    {
        const legs = [seal, opener];
        const t = mk(legs, { exitCode: 1 }, { maxLegs: () => 2 });
        const r = await t.runner.legEnded('s-leg2', 'end');
        ok('‼️ the rescue obeys the brakes: past the leg ceiling it opens nothing and is kept as stopped',
            r && r.state === 'stopped' && /leg ceiling/.test(r.why) && t.opened.length === 0);
    }
    {
        const t = mk([baton({ updatedAt: NOW - 5000 })], { error: 'auth' });
        const r = await t.runner.legEnded('s-leg2', 'end');
        ok('‼️ a successor dead on arrival: failed, nothing opened, Notices warned at level 2',
            r && r.state === 'failed' && t.opened.length === 0 && t.told[0].level === 2 && /Relay failed/.test(t.told[0].title));
    }
    {
        const t = mk([seal, opener], { handover: 'X' });
        t.store.put(baton({ id: 'bw', hop: 2, from: from('s-leg2'), state: 'waiting-end', toSessionId: undefined }));
        const rel = t.runner.sessionEnded('s-leg2', 'end');
        ok('a leg that passed is released as ever — the failsafe is not asked', rel.length === 1 && t.opened.length === 1 && !t.opened[0].rescue);
    }
    {
        const alive = { v: true };
        const t = mk([seal, opener], { dirty: ' M x' }, { evidence: () => (alive.v ? { registered: true, live: 'alive', registers: true } : { registered: false, live: 'ended', registers: true }) });
        t.runner.sweep();
        ok('the sweep sees a running leg alive and does nothing', t.opened.length === 0);
        alive.v = false;
        const s = t.runner.sweep();
        await new Promise(r => setTimeout(r, 10));
        ok('‼️ a leg it had seen alive and now finds dead (no hook) is judged — here rescued', t.opened.length === 1 && t.opened[0].rescue && Array.isArray(s.released));
        const t2 = mk([seal, opener], { dirty: ' M x' });
        t2.runner.sweep();
        await new Promise(r => setTimeout(r, 10));
        ok('‼️ a leg never seen alive in this window (an old chain after a reload) is NOT judged by the sweep', t2.opened.length === 0 && t2.store.all().length === 2);
    }

    console.log(`\ntest_baton_failsafe: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
