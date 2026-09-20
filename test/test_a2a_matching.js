// N-5 — THE MATCHING ENGINE (compiled core/a2aMatch.js) and the claim race.
//
// What is pinned:
//   * ‼️ THE PROJECT CONTAINS IN EVERY MODE — a miss excludes under hard,
//     preferred and any alike, and '*' on either side is the fleet;
//   * ‼️ `preferred` IS `hard` ON THE ROLE FOR A WHILE, THEN `any`: inside the
//     grace window the target role has it alone (the refusal says when it
//     opens), after it anyone in the project may take it, ranked below an
//     exact fit; graceMs 0 opens it at once;
//   * `requires` is a filter in every mode, and a capability name that is not
//     one is refused by name rather than silently never matching;
//   * the session is a lineage axis: a note for one session is not another's;
//   * ranking: an address hit (role, session) outranks an aboutness hit;
//   * ‼️ THE CLAIM RACE, WITH REAL PROCESSES: six node processes claim the same
//     task in the same instant against one file; exactly one wins and the
//     others are told why. N-3 proved this with two store objects in one
//     process — this is the cross-process lock doing it for real;
//   * a row written before targetSession existed reads as '*'.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = path.join(__dirname, '..', 'out', 'core');
const M = require(path.join(out, 'a2aMatch.js'));
const N = require(path.join(out, 'a2aNotes.js'));
const T = require(path.join(out, 'a2aTasks.js'));
const { registerA2AOps, capabilitiesArg } = require(path.join(out, 'a2aBridge.js'));
const { BridgeRegistry } = require(path.join(out, 'bridge.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-a2a-match-'));
const H = 3_600_000;
const t0 = 1_800_000_000_000;

const addressed = (o = {}) => ({
    project: 'AF', subsystem: '*', topic: '*', targetRole: 'developer', targetSession: '*',
    strictness: 'preferred', requires: [], ts: t0, ...o
});

(async () => {
    try {
        // ---------- the table ----------
        for (const strictness of ['hard', 'preferred', 'any']) {
            const a = addressed({ strictness });
            ok(`${strictness}: another project is another project`,
                M.fit(a, { project: 'OTHER', role: 'developer' }, t0).why === 'another project');
            ok(`${strictness}: '*' on the work is the fleet`,
                M.fit(addressed({ strictness, project: '*' }), { project: 'OTHER', role: 'developer' }, t0).eligible);
            ok(`${strictness}: '*' asked for is the fleet`,
                M.fit(a, { project: '*', role: 'developer' }, t0).eligible);
            ok(`${strictness}: a coordinate nobody stated is wild, not a miss`,
                M.fit(a, {}, t0).eligible);
            ok(`${strictness}: a missing capability is a refusal in every mode`,
                M.fit(addressed({ strictness, requires: ['browser'] }), { project: 'AF', role: 'developer' }, t0).why === 'missing a required capability');
        }
        // hard
        ok('hard: the role must match', M.fit(addressed({ strictness: 'hard' }), { project: 'AF', role: 'manager' }, t0).why === 'the coordinates are not yours');
        ok('hard: the aboutness must match too',
            M.fit(addressed({ strictness: 'hard', topic: 'bridge' }), { project: 'AF', role: 'developer', topic: 'ui' }, t0).why === 'the coordinates are not yours');
        ok('hard: everything lines up', M.fit(addressed({ strictness: 'hard', topic: 'bridge' }), { project: 'AF', role: 'developer', topic: 'bridge' }, t0).eligible);
        // preferred, in and after grace
        const pref = addressed({ strictness: 'preferred' });
        const inGrace = M.fit(pref, { project: 'AF', role: 'manager' }, t0 + H);
        ok('‼️ preferred, in grace: reserved for the target role', !inGrace.eligible && inGrace.why === 'reserved for its target role');
        ok('…and the refusal says when it opens', inGrace.opensAt === t0 + 2 * H);
        ok('preferred, in grace: the target role has it', M.fit(pref, { project: 'AF', role: 'developer' }, t0 + H).eligible);
        ok('preferred, in grace: aboutness only ranks',
            M.fit(addressed({ strictness: 'preferred', topic: 'bridge' }), { project: 'AF', role: 'developer', topic: 'ui' }, t0 + H).eligible);
        const after = M.fit(pref, { project: 'AF', role: 'manager' }, t0 + 2 * H);
        ok('‼️ preferred, after grace: anyone in the project', after.eligible && after.score === 1);
        ok('…ranked below the exact fit', M.fit(pref, { project: 'AF', role: 'developer' }, t0 + 2 * H).score === 3);
        ok('graceMs 0 opens it at once', M.fit(pref, { project: 'AF', role: 'manager', graceMs: 0 }, t0).eligible);
        ok('a custom grace is honoured', M.fit(pref, { project: 'AF', role: 'manager', graceMs: 10 * H }, t0 + 5 * H).why === 'reserved for its target role');
        ok('the default grace is two hours', M.PREFERRED_GRACE_MS === 2 * H);
        // any
        ok('any: the role only ranks, at once', M.fit(addressed({ strictness: 'any' }), { project: 'AF', role: 'manager' }, t0).eligible);
        // session lineage
        const forOne = addressed({ targetSession: 'sess-A' });
        ok('a note for one session is not another\'s while reserved', M.fit(forOne, { project: 'AF', role: 'developer', sessionId: 'sess-B' }, t0).why === 'reserved for its target role');
        ok('…and is that session\'s', M.fit(forOne, { project: 'AF', role: 'developer', sessionId: 'sess-A' }, t0).eligible);
        ok('…and under hard, never another\'s', M.fit(addressed({ targetSession: 'sess-A', strictness: 'hard' }), { project: 'AF', role: 'developer', sessionId: 'sess-B' }, t0).why === 'the coordinates are not yours');
        ok('a row without the axis reads as any session', M.fit(addressed({ targetSession: undefined }), { sessionId: 'x' }, t0).axes.session === 'wild');
        // ranking
        const roleHit = M.fit(addressed(), { project: 'AF', role: 'developer' }, t0).score;
        const topicHit = M.fit(addressed({ topic: 'bridge', targetRole: '*' }), { project: 'AF', topic: 'bridge' }, t0).score;
        ok('an address hit outranks an aboutness hit', roleHit > topicHit);
        const rows = [
            { row: 'loose', fit: { eligible: true, score: 1 }, ts: 3 },
            { row: 'exact-old', fit: { eligible: true, score: 3 }, ts: 1 },
            { row: 'exact-new', fit: { eligible: true, score: 3 }, ts: 2 },
            { row: 'out', fit: { eligible: false, score: 9 }, ts: 4 }
        ];
        ok('byFit: closest first, newest within a fit, the ineligible gone', M.byFit(rows).join() === 'exact-new,exact-old,loose');
        ok('axis is case-insensitive', M.axis('Developer', 'developer') === 'hit');

        // ---------- capabilities ----------
        ok('capability names are lower-cased, trimmed and de-duplicated',
            M.normaliseCapabilities([' Write_Tools ', 'browser', 'write_tools']).ok.join() === 'write_tools,browser');
        ok('a malformed name is named', M.normaliseCapabilities(['write tools']).bad === 'write tools');
        ok('capabilitiesArg refuses by name', (() => { try { capabilitiesArg({ requires: 'browser,Write Tools' }, 'requires'); return false; } catch (e) { return /"Write Tools" is not a capability name/.test(e.message); } })());
        ok('hasCapabilities is case-insensitive', M.hasCapabilities(['Browser'], ['browser', 'shell']));

        // ---------- the stores stand on the engine ----------
        const note = N.makeNote({ fromAgent: 'a', title: 't', project: 'AF', targetRole: 'developer', strictness: 'preferred' }, t0);
        ok('noteScore: reserved in grace', N.noteScore(note, { project: 'AF', role: 'manager' }, t0 + H) === undefined);
        ok('noteScore: open after grace', N.noteScore(note, { project: 'AF', role: 'manager' }, t0 + 3 * H) === 1);
        ok('noteScore: graceMs on the query', N.noteScore(note, { project: 'AF', role: 'manager', graceMs: 0 }, t0) === 1);
        const task = T.makeTask({ fromAgent: 'a', title: 't', project: 'AF', targetRole: 'developer', strictness: 'preferred', requires: ['browser'] }, t0);
        ok('claimable: the refusal names the reason', T.claimable(task, { agent: 'm', role: 'manager', project: 'AF', capabilities: ['browser'] }, t0 + H) === 'reserved for its target role');
        ok('claimable: capability first', T.claimable(task, { agent: 'm', role: 'developer', project: 'AF' }, t0) === 'missing a required capability');
        ok('claimable: another project', T.claimable(task, { agent: 'm', role: 'developer', project: 'X', capabilities: ['browser'] }, t0) === 'another project');
        ok('taskFit carries opensAt', T.taskFit(task, { agent: 'm', role: 'manager', project: 'AF', capabilities: ['browser'] }, t0).opensAt === t0 + 2 * H);
        const legacy = T.normaliseTask({ id: 'told', fromAgent: 'x', title: 'old row' });
        ok('a task row from before the axis reads as any session', legacy.targetSession === '*');
        ok('a note row from before the axis reads as any session', N.normaliseNote({ id: 'nold' }).targetSession === '*');

        // ---------- over the bridge ----------
        const notes = new N.A2ANotesStore(path.join(dir, 'notes.json'));
        const tasks = new T.A2ATasksStore(path.join(dir, 'tasks.json'));
        let graceHours = 2;
        const reg = new BridgeRegistry();
        registerA2AOps(reg, { notes, tasks, graceMs: () => graceHours * H, resolveProject: (k) => k === 'AF' ? 'AF' : undefined });
        const call = (op, args = {}, from) => reg.dispatch(op, args, from);

        const bad = await call('a2a.tasks.add', { title: 'x', agent: 'manager', project: 'AF', requires: 'write tools' });
        ok('‼️ a malformed capability on add is refused by name, not stored to never match', !bad.ok && /"write tools" is not a capability name/.test(bad.error));
        const t = (await call('a2a.tasks.add', { title: 'For the developer', agent: 'manager', project: 'AF', targetRole: 'developer', requires: 'Browser' })).result;
        ok('requires is stored normalised', t.requires.join() === 'browser');
        const res = await call('a2a.tasks.claim', { id: t.id, agent: 'explorer', role: 'explorer', project: 'AF', capabilities: 'browser' });
        ok('‼️ a claim inside the grace is refused as reserved, with opensAt and the axes as data',
            !res.ok && /reserved for its target role/.test(res.error) && /opens to you at/.test(res.error)
            && res.detail.opensAt === t.ts + 2 * H && res.detail.axes.role === 'miss' && res.detail.axes.project === 'hit');
        const nextEx = await call('a2a.tasks.next', { agent: 'explorer', role: 'explorer', project: 'AF', capabilities: 'browser' });
        ok('next offers nothing reserved', nextEx.result.task === null);
        graceHours = 0;
        const nextOpen = await call('a2a.tasks.next', { agent: 'explorer', role: 'explorer', project: 'AF', capabilities: 'browser' });
        ok('‼️ the setting opens it: grace 0 and the explorer is offered the task', nextOpen.result.task && nextOpen.result.task.id === t.id);
        const exact = (await call('a2a.tasks.add', { title: 'For the explorer', agent: 'manager', project: 'AF', targetRole: 'explorer' })).result;
        const ranked = await call('a2a.tasks.next', { agent: 'explorer', role: 'explorer', project: 'AF', capabilities: 'browser' });
        ok('next ranks the exact fit above the opened one, even though it is newer', ranked.result.task.id === exact.id && ranked.result.waiting === 1);
        graceHours = 2;
        // session lineage over the bridge
        const mine = (await call('a2a.notes.post', { title: 'for sess-A', agent: 'manager', project: 'AF', targetSession: 'sess-A', strictness: 'hard' })).result;
        ok('targetSession is stored', mine.targetSession === 'sess-A');
        const seenA = await call('a2a.notes.list', { agent: 'developer', project: 'AF' }, { sessionId: 'sess-A' });
        const seenB = await call('a2a.notes.list', { agent: 'developer', project: 'AF' }, { sessionId: 'sess-B' });
        ok('‼️ a note for one session reaches that session and no other',
            seenA.result.rows.some(n => n.id === mine.id) && !seenB.result.rows.some(n => n.id === mine.id));
        const badCap = await call('a2a.notes.list', { agent: 'developer', capabilities: 'a b' });
        ok('a malformed capability on a query is refused too', !badCap.ok && /not a capability name/.test(badCap.error));

        // ---------- ‼️ the claim race, with real processes ----------
        const raceFile = path.join(dir, 'race.json');
        const raceStore = new T.A2ATasksStore(raceFile);
        const prize = raceStore.add({ fromAgent: 'manager', title: 'one prize', project: '*', targetRole: '*', strictness: 'any' });
        const worker = path.join(dir, 'worker.js');
        fs.writeFileSync(worker, [
            "const T = require(process.argv[2]);",
            "const s = new T.A2ATasksStore(process.argv[3]);",
            "const start = Number(process.argv[5]);",
            "while (Date.now() < start) { /* line up on the same instant */ }",
            "const r = s.claim(process.argv[4], { agent: 'w' + process.pid });",
            "process.stdout.write(JSON.stringify('task' in r ? { won: true, by: r.task.claimedBy.agent } : { won: false, why: r.refused }));"
        ].join('\n'), 'utf8');
        const start = Date.now() + 1500;
        const results = await Promise.all(Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
            const p = spawn(process.execPath, [worker, path.join(out, 'a2aTasks.js'), raceFile, prize.id, String(start)], { stdio: ['ignore', 'pipe', 'pipe'] });
            let so = '', se = '';
            p.stdout.on('data', d => { so += d; });
            p.stderr.on('data', d => { se += d; });
            p.on('close', code => code === 0 && so ? resolve(JSON.parse(so)) : reject(new Error(`worker ${code}: ${se || so}`)));
        })));
        const winners = results.filter(r => r.won);
        ok('‼️ six processes, one file, one instant: exactly one claim wins', winners.length === 1);
        ok('…and every loser is told why', results.filter(r => !r.won).every(r => r.why === 'already claimed' || r.why === 'the store is busy'));
        raceStore.load();
        ok('…and the file agrees with the winner', raceStore.get(prize.id).claimedBy.agent === winners[0].by);
        ok('…and the lock is gone afterwards', !fs.existsSync(raceFile + '.lock'));

        // ---------- the extension reads the setting ----------
        {
            const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
            ok('the grace comes from agentFarm.a2a.preferredGraceHours', /graceMs: \(\) => Math\.max\(0, cfg\(\)\.get<number>\('a2a\.preferredGraceHours', 2\)\) \* 3_600_000/.test(ext));
            const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
            ok('…which package.json declares with the same default', pkg.contributes.configuration.properties['agentFarm.a2a.preferredGraceHours'].default === 2);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
