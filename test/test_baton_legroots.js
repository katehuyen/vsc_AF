// S-83 (reopened) — WHERE A RELAY LEG'S WORK LANDS: its folder AND its project's repositories.
//
// The live case this pins (2026-09-26, chain chn_muibreo5001gr7): a project
// session runs in the agent folder and commits in the project's repo. Legs 5
// and 6 committed three times there while the agent folder's HEAD stood still;
// the barren brake read the folder alone, called two productive legs barren and
// stopped the failsafe's rescue of leg 6 — the chain broke. And the rescue it
// would have opened carried nothing of the job: "It wrote no handover note."
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const R = require(path.join(OUT, 'legRoots.js'));
const { batonBrake } = require(path.join(OUT, 'batonBrake.js'));
const LF = require(path.join(OUT, 'batonLegFacts.js'));
const F = require(path.join(OUT, 'batonFailsafe.js'));
const { LegEndWatch } = require(path.join(OUT, 'batonLegEnd.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));

const AGENT = 'D:\\zone\\agent\\ajanlar\\developer';
const REPO = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm';
const PRJ = 'prj_9ujsbtzr';
const A0 = '2a5fce2c0000000000000000000000000000beef';
const C5a = '62355f0000000000000000000000000000000001';
const C5b = 'd1320da000000000000000000000000000000002';
const C6 = '8fea0e9000000000000000000000000000000003';
const C4 = 'b68b255000000000000000000000000000000004';
const reposOf = id => (id === PRJ ? [REPO, REPO.toLowerCase() + '\\', AGENT] : undefined);

(async () => {
    console.log('== the roots ==');
    ok('the folder first, then the project\'s repositories — each once (case and a trailing slash are the same path)',
        JSON.stringify(R.legRoots({ cwd: AGENT, projectId: PRJ }, reposOf)) === JSON.stringify([AGENT, REPO]));
    ok('no project: the folder alone, as S-78 always read it', JSON.stringify(R.legRoots({ cwd: AGENT }, reposOf)) === JSON.stringify([AGENT]));
    ok('a project store that throws costs the repositories, never the folder',
        JSON.stringify(R.legRoots({ cwd: AGENT, projectId: PRJ }, () => { throw new Error('x'); })) === JSON.stringify([AGENT]));
    ok('no folder, no project: nothing', R.legRoots({ cwd: '' }).length === 0);

    console.log('== the readings ==');
    const heads = { [AGENT]: A0, [REPO]: C6 };
    ok('one root keeps the bare hash — a chain with no project reads exactly as before',
        await R.headsOf([AGENT], async r => heads[r]) === A0);
    const fp = await R.headsOf([AGENT, REPO], async r => heads[r]);
    ok('several roots: one fingerprint, a line per root', fp === `${A0} ${AGENT}\n${C6} ${REPO}`);
    ok('a root that is not a repository drops out of the fingerprint', await R.headsOf([AGENT, REPO], async r => (r === REPO ? C6 : undefined)) === `${C6} ${REPO}`);
    ok('no root answers: no fingerprint', await R.headsOf([AGENT, REPO], async () => { throw new Error('no git'); }) === undefined);
    ok('the fingerprint reads back into its pairs', JSON.stringify(R.headPairs(fp, [])) === JSON.stringify([{ root: AGENT, hash: A0 }, { root: REPO, hash: C6 }]));
    ok('a bare hash belongs to the first root', JSON.stringify(R.headPairs(A0, [AGENT, REPO])) === JSON.stringify([{ root: AGENT, hash: A0 }]));
    ok('the label names each root by its last folder', R.headsLabel(fp) === '2a5fce2c developer · 8fea0e90 vsc_AgentFarm' && R.headsLabel(A0) === '2a5fce2c');

    const st = await R.statusOf([AGENT, REPO], async r => (r === REPO ? ' M src/x.ts\n?? media/y.js' : ' M ../../_run_folder_move/claude/projects/p/s.jsonl'));
    ok('several roots: each status line carries its root, so two repos never collide',
        st.split('\n').length === 3 && st.includes(` M ${REPO}/src/x.ts`) && st.includes(`?? ${REPO}/media/y.js`));
    ok('…and the engines\' own pool is still not the leg\'s dirt (S-92)', LF.newDirt(st, '') === ` M ${REPO}/src/x.ts\n?? ${REPO}/media/y.js`);
    ok('one root: the status exactly as git gave it', await R.statusOf([REPO], async () => ' M a.ts') === ' M a.ts');
    ok('no root is a repository: status unknown, never clean', await R.statusOf([AGENT, REPO], async () => undefined) === undefined);

    const logs = { [REPO]: `${C6.slice(0, 7)} v11.689 - x-424 wired`, [AGENT]: '' };
    const seen = [];
    const cm = await R.commitsSince(`${A0} ${AGENT}\n${C5b} ${REPO}`, [AGENT, REPO], async (root, since) => { seen.push([root, since]); return logs[root]; });
    ok('what each root committed since the open, under its root; a root with none says nothing',
        cm === `${REPO}:\n${C6.slice(0, 7)} v11.689 - x-424 wired` && seen.length === 2 && seen[1][1] === C5b);
    ok('nothing readable: undefined, not "no commits"', await R.commitsSince(`${A0} ${AGENT}`, [AGENT], async () => undefined) === undefined);
    ok('no open fingerprint: nothing to compare', await R.commitsSince(undefined, [AGENT], async () => 'x') === undefined);

    console.log('== ‼️ the live case: chain chn_muibreo5001gr7, leg 6 cut off at the 5-hour wall ==');
    const NOW = 1790440399518;
    const from = sid => ({ sessionId: sid, agentId: 'd:/zone/agent/ajanlar/developer', engine: 'claude', cwd: AGENT, projectId: PRJ, launchId: 'lch_' + sid });
    const mk = (id, hop, sid, to, head, prompt = 'go on') => ({
        id, chainId: 'chn_muibreo5001gr7', hop, prompt, from: from(sid), inherit: { model: 'opus', account: 'claude-x' },
        want: { surface: 'inherit', account: '@emptiest' }, state: 'started', toSessionId: to, why: 'started', head,
        createdAt: NOW - (7 - hop) * 3600e3, updatedAt: NOW - (7 - hop) * 3600e3
    });
    const fpAt = repo => `${A0} ${AGENT}\n${repo} ${REPO}`;
    // hop 4 = leg 4 passed (repo at C4) · hop 5 = leg 5 passed (repo at C5b) · leg 6 ends with the repo at C6
    const BRIEF = 'KOTA — spend the quota with care.\nX-424 remaining: wire the Studio wall.';
    const prior = [mk('btn_h4', 4, 's-leg4', 's-leg5', fpAt(C4)), mk('btn_h5', 5, 's-leg5', 's-leg6', fpAt(C5b), BRIEF)];
    const draft = Object.assign({}, prior[1], { id: 'btn_h6', hop: 6, from: from('s-leg6'), state: 'waiting-end', head: fpAt(C6) });
    ok('‼️ legs that committed in the project\'s repo are NOT barren — the rescue is not braked', batonBrake(draft, prior, 21) === undefined);
    const old = [mk('btn_h4', 4, 's-leg4', 's-leg5', A0), mk('btn_h5', 5, 's-leg5', 's-leg6', A0)];
    const oldBrake = batonBrake(Object.assign({}, draft, { head: A0 }), old, 21);
    ok('(the defect, reproduced: the agent folder alone reads the same three commits as none)', oldBrake && oldBrake.kind === 'barren');
    const still = batonBrake(Object.assign({}, draft, { head: fpAt(C5b) }), [mk('btn_h4', 4, 's-leg4', 's-leg5', fpAt(C5b)), prior[1]], 21);
    ok('a chain that really commits nothing anywhere is still braked, and the sentence names every root',
        still && still.kind === 'barren' && still.why.includes(`no new commit in ${AGENT}, ${REPO}`)
        && still.why.includes('HEAD still 2a5fce2c developer · d1320da0 vsc_AgentFarm'));

    // the whole failsafe, as the window runs it: the leg ends, its facts are read, the rescue opens
    const store = new BatonStore(null);
    store.put(...prior);
    const git = R.legGitReaders({
        reposOf, head: async r => ({ [AGENT]: A0, [REPO]: C6 })[r], status: async () => '',
        log: async (root, since) => (root === REPO && since === C5b ? `${C6.slice(0, 7)} v11.689 - x-424 wired (not released)\n` : '')
    });
    const opener = sid => store.all().find(b => b.state === 'started' && b.toSessionId === sid);
    const legFacts = LF.legFactsFrom({
        card: () => ({ status: 'idle' }), row: () => undefined,
        guard: () => ({ quota: { handover: { pct: 99 } } }),
        notePath: () => undefined, readNote: () => undefined, toolCalls: () => 212,
        placeOf: sid => opener(sid)?.from, gitStatus: git.dirtOf,
        openDirt: sid => opener(sid)?.dirt, openHead: sid => opener(sid)?.head, commitsOf: git.commitsOf
    });
    const released = [], told = [];
    const watch = new LegEndWatch({
        store, legFacts, isEnded: () => true, headOf: git.headOf, dirtOf: git.dirtOf, maxLegs: () => 21,
        now: () => NOW, log: () => undefined, notify: (title, body) => told.push({ title, body })
    }, (b, why) => { released.push({ b, why }); return b; });
    const r = await watch.legEnded('s-leg6', 'swept: no live process');
    ok('‼️ the cut-off leg is RESCUED — the chain goes on to leg 7', r && released.length === 1 && r.hop === 6 && r.state !== 'stopped'
        && told.some(t => /^Relay rescued — chain chn_muibreo5001gr7/.test(t.title)));
    const p = r ? r.prompt : '';
    ok('the rescue says why, and what the leg committed in the project\'s repo', /QUOTA HANDOVER 99% had reached it/.test(p)
        && p.includes('What it committed during its run') && p.includes(`${REPO}:\n${C6.slice(0, 7)} v11.689 - x-424 wired`));
    ok('‼️ with no note, the successor is handed the brief the leg itself started from', p.includes('The brief it started from') && p.includes(BRIEF));
    ok('the rescue records the new fingerprint, so the NEXT brake compares like with like', r && r.head === fpAt(C6));

    console.log('== the evidence shapes ==');
    const base = { sessionId: 's', endedAt: NOW };
    const withNote = F.rescueEvidence(Object.assign({}, base, { note: { path: 'N.md', ts: NOW, text: '## Durum\nx' } }), ['r'], BRIEF);
    ok('a note wins: the brief is not repeated under it', withNote.includes('## Durum') && !withNote.includes('The brief it started from'));
    ok('a seal has no brief: nothing is invented', !F.rescueEvidence(base, ['r'], '').includes('The brief it started from'));

    console.log(`\ntest_baton_legroots: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
