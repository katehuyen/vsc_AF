// S-31 — the runs Agent Farm starts stay findable, whatever folder they ran in.
//
// The bug in one line: a scheduled task with `workDir` in a code repo produced a
// transcript whose cwd is not under any agent's folder, so `assignAgent` gave it
// no owner and the scope filter threw the file away — 45 minutes of work, 3.2 MB
// of transcript and six limit-retries, invisible to `sessions.find`, to Sessions
// → Auto and to the Console's Resume list at once.
//
// The pure matcher is tested here directly; the index's use of it is tested
// through a REAL SessionIndex over real files on disk, because the whole defect
// lived in the ORDER of two lines inside `indexFile` and a matcher test would
// have passed throughout.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter,
    Disposable: { from: () => ({ dispose() { } }) },
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};

const { bindSession, isBindingHit, normCwd, applyBinding } =
    require(path.join(ROOT, 'out', 'core', 'launchBinding.js'));
const { SessionIndex } = require(path.join(ROOT, 'out', 'core', 'sessions.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => {
    if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); }
};

const T0 = 1786660510640;          // the real run: 2026-08-14 05:35 local
const T1 = 1786663215545;          // …and 06:20, when the limit stopped it
const REPO = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm';
const AGENTDIR = 'D:/zone/agent/ajanlar/developer';

const binding = (over) => Object.assign({
    taskId: 'mss3jcnfoxftb', agentId: AGENTDIR, agentName: 'developer',
    kind: 'schedule', launcherId: 'msrvelkoo52qf', label: 'Gece — M-10 M-11 U-56 S-19 tamamla',
    engine: 'claude', cwd: REPO, startedAt: T0, endedAt: T1
}, over || {});

const session = (over) => Object.assign({
    sessionId: '190e5baf-e937-4bc9-a83f-8a26d7248c89',
    file: 'C:/u/.claude/projects/D--zone-dev-git-miropharm-vsc-AgentFarm/190e5baf.jsonl',
    cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
    firstTs: T0 + 4000, lastTs: T1 - 2000
}, over || {});

// ===========================================================================
// 1) THE MATCHER — ENGINE, FOLDER, LIFESPAN, AND ONLY WHEN ONE FITS
// ===========================================================================
{
    ok('paths compare case-folded, slash-normalised and without a trailing one',
        normCwd('D:\\zone\\Dev\\') === normCwd('d:/zone/dev'));

    const hit = bindSession(session(), [binding()], T1 + 60_000);
    ok('‼️ the real case: a run in a code repo is claimed by its own launch record',
        isBindingHit(hit) && hit.binding.taskId === 'mss3jcnfoxftb');
    ok('…and it says the id was DEDUCED, not declared', isBindingHit(hit) && hit.proof === 'matched');

    ok('a subfolder of the working folder still belongs to that run',
        isBindingHit(bindSession(session({ cwd: REPO + '\\src\\core' }), [binding()], T1 + 1)));

    ok('another engine in the same folder at the same time is NOT this run',
        !bindSession(session({ source: 'codex' }), [binding()], T1 + 1));
    ok('…and a claude session is not claimed by a codex binding either',
        !bindSession(session(), [binding({ engine: 'codex' })], T1 + 1));

    ok('a conversation from another folder is not claimed',
        !bindSession(session({ cwd: 'D:/zone/dev/git/other' }), [binding()], T1 + 1));
    ok('one that started before the run did is not claimed',
        !bindSession(session({ firstTs: T0 - 10 * 60_000 }), [binding()], T1 + 1));
    ok('one still being written after the run ended is not claimed',
        !bindSession(session({ lastTs: T1 + 10 * 60_000 }), [binding()], T1 + 1));

    // ‼️ A run still going has no endedAt, and its window has to close somewhere
    // — on `now`, passed in, so a test is not at the mercy of the clock.
    ok('a RUNNING task still claims the transcript it is writing right now',
        isBindingHit(bindSession(
            session({ lastTs: T0 + 60_000 }),
            [binding({ endedAt: undefined })],
            T0 + 90_000)));

    ok('a subagent transcript is never bound — it is a branch of a run, not a run',
        !bindSession(session({ isSidechain: true }), [binding()], T1 + 1));
}

// ===========================================================================
// 2) DECLARED BEATS DEDUCED, AND AMBIGUITY IS AN ANSWER
// ===========================================================================
{
    // S-19 → S-31: a resumed run was TOLD which conversation to continue, so
    // there is nothing to deduce and nothing a clock can contradict.
    const declared = bindSession(
        session({ firstTs: 1, lastTs: 2, cwd: 'somewhere/else' }),
        [binding({ sessionId: '190e5baf-e937-4bc9-a83f-8a26d7248c89' })],
        T1 + 1);
    ok('‼️ an id known before the spawn wins over every clock test',
        isBindingHit(declared) && declared.proof === 'declared');

    const byFile = bindSession(
        session({ firstTs: 1, lastTs: 2, cwd: 'somewhere/else' }),
        [binding({ transcriptFile: session().file })], T1 + 1);
    ok('…and so does a transcript the cost matcher already named',
        isBindingHit(byFile) && byFile.proof === 'reported');

    // Two of our own runs, same engine, same folder, overlapping. There is no
    // honest answer from the outside, and a guess would file a real transcript
    // under the wrong task for ever.
    const amb = bindSession(session(), [
        binding(),
        binding({ taskId: 'other', label: 'başka koşu', startedAt: T0 - 1000, endedAt: T1 + 1000 })
    ], T1 + 1);
    ok('‼️ two overlapping runs of ours produce an AMBIGUITY, never a pick',
        !!amb && !isBindingHit(amb) && amb.candidates.length === 2);
    ok('…and the reason names what could not be told apart',
        /overlap this transcript/.test(amb.why));

    // …unless one of them has already declared its own id, which takes it out
    // of the running for anything else.
    const settled = bindSession(session(), [
        binding(),
        binding({ taskId: 'other', sessionId: 'a-different-session', startedAt: T0 - 1000, endedAt: T1 + 1000 })
    ], T1 + 1);
    ok('a run that already owns another transcript stops competing for this one',
        isBindingHit(settled) && settled.binding.taskId === 'mss3jcnfoxftb');
}

// ===========================================================================
// 3) WHAT A BINDING MAY CHANGE — AND WHAT IT MAY NOT
// ===========================================================================
{
    const hit = { binding: binding({ projectId: 'prj_9ujsbtzr' }), proof: 'matched' };
    const fresh = applyBinding({}, hit);
    ok('an unowned session gets the run\'s agent', fresh.agentId === AGENTDIR && fresh.agentName === 'developer');
    ok('…its project, which no path could have told us', fresh.projectId === 'prj_9ujsbtzr');
    ok('…and the mechanism that started it, which is what Origin reads',
        fresh.launchedBy.kind === 'schedule' && /Gece/.test(fresh.launchedBy.label));

    // ‼️ The path test is the STRONGER statement: a transcript genuinely inside
    // an agent's folder belongs to that agent, and a bookkeeping slip in a run
    // record must not be able to move it.
    const owned = applyBinding({ agentId: 'basit', agentName: 'basit' }, hit);
    ok('‼️ a session the path already owns is never re-owned by a binding',
        owned.agentId === 'basit' && owned.agentName === 'basit');
    ok('…but it still learns who launched it', owned.launchedBy.kind === 'schedule');

    // ‼️ X-125 — AND WHICH MISSION, WHERE THE BINDING KNOWS ONE.
    //
    // A mission binding has carried the run's id in `launcherId` since it was
    // written, and `applyBinding` copied kind/label/mode and nothing else. So a
    // session this binding PROVES belongs to a mission still had no
    // `missionId`, which is the only field `sessionMission` reads — and after a
    // reload, once the run record or the task rows were gone, a planner or
    // delegation session lost its 🎯 and reappeared in the pool a person's own
    // dialogs live in.
    const mHit = {
        binding: binding({
            kind: 'mission', launcherId: 'run_7', launcherTitle: 'Parser mission',
            label: 'fix the parser'
        }),
        proof: 'matched'
    };
    const mFresh = applyBinding({}, mHit);
    ok('‼️ X-125 — a mission binding stamps the session with WHICH mission',
        mFresh.launchedBy.kind === 'mission' && mFresh.launchedBy.missionId === 'run_7'
        && mFresh.launchedBy.missionTitle === 'Parser mission');
    ok('…and keeps the step\'s own label, which says more than the run\'s name',
        mFresh.launchedBy.label === 'fix the parser');
    // The binding is published once before the mission store exists, so a
    // title-less mission binding is a normal state: the id is the fact.
    const mBare = applyBinding({}, { binding: binding({ kind: 'mission', launcherId: 'run_7' }), proof: 'matched' });
    ok('…a binding with no title yet still carries the id rather than nothing',
        mBare.launchedBy.missionId === 'run_7' && mBare.launchedBy.missionTitle === undefined);
    // Enrichment, never overwriting: a stamp already on the session — the
    // fresher one, or the persisted snapshot — is what survives.
    const already = applyBinding(
        { launchedBy: { kind: 'mission', label: 'planner', missionId: 'run_1', missionTitle: 'Older run' } },
        mHit
    );
    ok('‼️ …and a session that already carries a stamp is not restamped by a binding',
        already.launchedBy.missionId === 'run_1' && already.launchedBy.missionTitle === 'Older run');
    const unstamped = applyBinding({ launchedBy: { kind: 'task', label: 'a step' } }, mHit);
    ok('…while one that carries a launcher but NO stamp is enriched with it',
        unstamped.launchedBy.missionId === 'run_7');
    // ‼️ `sessionMission` reads kind AND missionId, so a stamp filed under
    // `kind: 'task'` marks nothing — the enrichment has to move the kind too,
    // and keep the step's own label, which says more than the run's name.
    ok('‼️ …kind travels with the stamp, or the mark the stamp was for is still missing',
        unstamped.launchedBy.kind === 'mission' && unstamped.launchedBy.label === 'a step');
    const notMission = applyBinding({}, hit);
    ok('…and a schedule binding stamps nothing at all — the stamp is missions only',
        notMission.launchedBy.missionId === undefined);
}

// ===========================================================================
// 3b) X-128 — THE SWEEP, AT A SIZE THE FARM WILL ACTUALLY REACH
//
// ‼️ THE COST GROWS ON THE SESSION AXIS AND NOTHING CAPS IT. Bindings are held
// down by monthly archiving — about fifteen — but every task switch re-binds
// EVERY session, and the number of sessions only ever goes up. The matcher used
// to re-derive the same normalised strings inside those loops: `normCwd` of the
// binding's folder once per SESSION, `normCwd` of the session's file once per
// BINDING, all from a small fixed set of strings, all giving the same answer.
// Over 94 profiles that was 14.3% of all blocking (32 s, ≈97 million calls).
//
// ‼️ AND THE OBVIOUS FIX WAS MEASURED AND THROWN AWAY. Indexing the bindings by
// folder and walking a session's parents to find them reads like the answer and
// is 1.5× SLOWER at fifteen bindings — a hash lookup per ancestor, plus the
// arrays it allocates, costs more than a linear pass with early exits. What was
// expensive was the re-deriving, not the scanning. Measured on this machine,
// 10 000 sessions × 15 bindings: 115 ms before, 23 ms after (5.0×), with all
// 10 000 answers identical to the previous matcher.
{
    const { indexBindings, bindSessionIn } =
        require(path.join(ROOT, 'out', 'core', 'launchBinding.js'));
    const ROOTS = [REPO.replace(/\\/g, '/'), AGENTDIR, 'D:/zone/know/note/obsidian'];
    const ENG = ['claude', 'codex', 'agy'];
    const many = [];
    for (let i = 0; i < 15; i++) {
        many.push(binding({
            taskId: 't' + i, engine: ENG[i % ENG.length], cwd: ROOTS[i % ROOTS.length],
            startedAt: T0 + i, endedAt: T1 + i,
            // a run that has already been resolved records both; that is the
            // steady state, and it is the state the old `find` paid most for
            ...(i % 2 ? { sessionId: 'done-' + i, transcriptFile: 'C:/u/p/' + i + '.jsonl' } : {})
        }));
    }
    const idx = indexBindings(many);

    ok('X-128: the index prepares each binding ONCE — folder and transcript normalised',
        idx.length === 15 && idx.all[0].cwd === normCwd(ROOTS[0])
        && idx.all[1].file === normCwd('C:/u/p/1.jsonl'));

    // ‼️ THE POINT OF THE CHANGE IS THAT NOTHING ABOUT THE ANSWER MOVED. Every
    // session is asked both ways and the two are compared, because a sweep that
    // got faster and started attributing transcripts differently would be a far
    // worse defect than the one it fixed.
    const shape = r => (!r ? 'none' : isBindingHit(r) ? r.binding.taskId + '/' + r.proof
        : 'amb:' + r.candidates.map(c => c.taskId).join(','));
    const crowd = [];
    for (let i = 0; i < 400; i++) {
        crowd.push(session({
            sessionId: 'sid-' + i,
            file: 'C:/u/p/' + (i % 30) + '.jsonl',
            cwd: i % 7 === 0 ? undefined : ROOTS[i % ROOTS.length] + (i % 3 ? '/src/core' : ''),
            source: ENG[i % ENG.length],
            firstTs: T0 + (i % 5) * 400, lastTs: T1 - (i % 4) * 400
        }));
    }
    const moved = crowd.filter(s =>
        shape(bindSessionIn(s, idx, T1 + 5000)) !== shape(bindSession(s, many, T1 + 5000)));
    ok('‼️ X-128: the prepared sweep answers exactly what the one-shot does, for every session',
        moved.length === 0);

    // A ceiling, not a stopwatch: this machine does the 10 000-session sweep in
    // ~23 ms, so a second is an order of magnitude of headroom and fails only on
    // a regression of the kind this item was opened for.
    const big = [];
    for (let i = 0; i < 10000; i++) {
        big.push(session({
            sessionId: 'big-' + i, file: 'C:/u/q/' + i + '.jsonl',
            cwd: ROOTS[i % ROOTS.length] + '/media/pages/deep',
            source: ENG[i % ENG.length],
            firstTs: T0 + (i % 5) * 400, lastTs: T1 - (i % 4) * 400
        }));
    }
    const t = Date.now();
    for (const s of big) { bindSessionIn(s, idx, T1 + 5000); }
    const ms = Date.now() - t;
    ok(`‼️ X-128: 10 000 sessions × 15 bindings in ${ms} ms — one task switch, at ten thousand`,
        ms < 1000);
}

// ===========================================================================
// 3c) X-345 — THE SWEEP IS THE SIZE OF THE CHANGE, NOT OF THE HISTORY
//
// X-128 made each comparison cheap and left the SWEEP alone: every task change
// still asked every session the farm had ever indexed, so the cost of one
// binding change grew with the history (X-127's shared criterion: proportional
// to what CHANGED, never to what is stored). Now the change is worked out first
// — which bindings came, which went (`bindingDelta`) — and only the sessions
// one of those could possibly reach are asked (`bindingReaches`, a SUPERSET of
// what the matcher decides with, out of `ReachIndex`: declared id, declared
// file, lifespan window over a `firstTs`-ordered list). A change that alters no
// binding asks nobody.
{
    const R = require(path.join(ROOT, 'out', 'core', 'bindingReach.js'));
    const { indexBindings, bindSessionIn } = require(path.join(ROOT, 'out', 'core', 'launchBinding.js'));
    const HOUR = 3600_000, DAY = 24 * HOUR;
    const ROOTS = [REPO.replace(/\\/g, '/'), AGENTDIR, 'D:/zone/know/note/obsidian'];
    const ENG = ['claude', 'codex', 'agy'];
    // a deterministic generator, so a failure is the same failure tomorrow
    let seed = 20260921;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const shape = r => (!r ? 'none' : isBindingHit(r) ? r.binding.taskId + '/' + r.proof
        : 'amb:' + r.candidates.map(c => c.taskId).join(','));

    // --- the signature: what a binding decides with, and what it hands over
    const b0 = binding();
    ok('X-345: two bindings with the same fields have one signature',
        R.bindingSig(b0) === R.bindingSig(binding()));
    ok('…and a run that ends, declares its session, reports its transcript or changes mode is a DIFFERENT binding',
        [{ endedAt: T1 + 1 }, { sessionId: 'sid-x' }, { transcriptFile: 'C:/u/p/x.jsonl' }, { mode: 'interactive' }, { launchId: 'lch_1' }]
            .every(over => R.bindingSig(binding(over)) !== R.bindingSig(b0)));

    // --- the delta: what came and what went, not "the list looks different"
    {
        const a = binding({ taskId: 'A' }), b = binding({ taskId: 'B' }), c = binding({ taskId: 'C' });
        const d = R.bindingDelta(indexBindings([a, b]), indexBindings([b, c]));
        ok('X-345: bindingDelta names the binding that came and the one that went',
            d.added.length === 1 && d.added[0].binding.taskId === 'C' && d.removed.length === 1 && d.removed[0].binding.taskId === 'A');
        const upd = R.bindingDelta(indexBindings([a, b]), indexBindings([a, binding({ taskId: 'B', endedAt: T1 + 60_000 })]));
        ok('…a run whose record changed is one removed and one added — its old shape reaches too',
            upd.added.length === 1 && upd.removed.length === 1 && upd.removed[0].binding.endedAt === T1 && upd.added[0].binding.endedAt === T1 + 60_000);
        const same = R.bindingDelta(indexBindings([a, b]), indexBindings([b, a]));
        ok('…and the same bindings in another order are no change at all', same.added.length === 0 && same.removed.length === 0);
    }

    // --- reach is a SUPERSET of the matcher's decision — the property that
    // makes a limited sweep safe. Random crowds, random changes, brute force:
    // every session whose answer moves between the two indexes must be reached
    // by a binding the delta named.
    {
        let moved = 0, checked = 0, unreached = 0, reachedTotal = 0;
        for (let round = 0; round < 12; round++) {
            const mkB = (i) => binding({
                taskId: 't' + round + '-' + i, engine: pick(ENG), cwd: pick(ROOTS),
                startedAt: T0 + Math.floor(rnd() * 6) * HOUR, endedAt: rnd() < 0.2 ? undefined : T0 + Math.floor(rnd() * 8) * HOUR + HOUR,
                ...(rnd() < 0.3 ? { sessionId: 'sid-' + Math.floor(rnd() * 40) } : {}),
                ...(rnd() < 0.2 ? { transcriptFile: 'C:/u/p/' + Math.floor(rnd() * 300) + '.jsonl' } : {}),
                ...(rnd() < 0.2 ? { mode: 'interactive' } : {})
            });
            const before = []; for (let i = 0; i < 10; i++) { before.push(mkB(i)); }
            const after = before.slice();
            after.splice(Math.floor(rnd() * after.length), 1);                       // one archived
            after.push(mkB(100));                                                      // one started
            const k = Math.floor(rnd() * after.length);
            after[k] = { ...after[k], endedAt: (after[k].endedAt ?? T0 + 8 * HOUR) + HOUR }; // one finished later
            const oldIdx = indexBindings(before), newIdx = indexBindings(after);
            const delta = R.bindingDelta(oldIdx, newIdx);
            const changed = [...delta.added, ...delta.removed];
            const crowd = [];
            for (let i = 0; i < 300; i++) {
                // one file per session, as the index's own map is keyed
                crowd.push(session({
                    sessionId: 'sid-' + Math.floor(rnd() * 40), file: 'C:/u/p/' + i + '.jsonl',
                    cwd: rnd() < 0.15 ? undefined : pick(ROOTS) + (rnd() < 0.5 ? '/src/core' : ''),
                    source: pick(ENG), isSidechain: rnd() < 0.05,
                    firstTs: T0 - HOUR + Math.floor(rnd() * 12 * HOUR), lastTs: T0 + Math.floor(rnd() * 14 * HOUR)
                }));
            }
            const now = T0 + 9 * HOUR;
            const reach = new R.ReachIndex(); reach.rebuild(crowd);
            const reached = new Set(reach.reachAll(changed, now));
            reachedTotal += reached.size;
            for (const s of crowd) {
                checked++;
                if (shape(bindSessionIn(s, oldIdx, now)) === shape(bindSessionIn(s, newIdx, now))) { continue; }
                moved++;
                if (!reached.has(s)) { unreached++; }
            }
        }
        ok(`‼️ X-345: every session whose answer moved is reached — ${moved} moved of ${checked}, ${unreached} missed`,
            moved > 0 && unreached === 0);
        ok('…and reach is narrower than the crowd, or the limit would be no limit', reachedTotal < checked);
    }

    // --- the index itself: in step with adds and removes, one item each
    {
        const reach = new R.ReachIndex();
        const s1 = session({ sessionId: 'a', file: 'C:/u/p/1.jsonl', firstTs: T0 + 1000 });
        const s2 = session({ sessionId: 'b', file: 'C:/u/p/2.jsonl', firstTs: T0 + 500 });
        const s3 = session({ sessionId: 'a', file: 'C:/U/P/3.JSONL', firstTs: T0 + 3000 });   // same id, another file
        reach.add(s1); reach.add(s2); reach.add(s3);
        const p = indexBindings([binding({ sessionId: 'a', startedAt: T0 + 100 * DAY, endedAt: T0 + 100 * DAY + HOUR })]).all[0];
        const byId = reach.reach(p, T0 + 200 * DAY);
        ok('X-345: a declared session id reaches every session carrying it, whatever the clock says',
            byId.length === 2 && byId.includes(s1) && byId.includes(s3));
        reach.remove('c:/u/p/3.jsonl');
        ok('…remove is by normalised file and keeps the id\'s other session', reach.size === 2 && reach.reach(p, T0 + 200 * DAY).length === 1);
        reach.add(session({ sessionId: 'a', file: 'C:/u/p/1.jsonl', firstTs: T0 + 60_000 }));
        ok('…add under a file already held replaces it, never doubles it', reach.size === 2);
        const w = indexBindings([binding({ startedAt: T0, endedAt: T0 + 2000 })]).all[0];
        ok('…a lifespan window reaches by firstTs order, not by scanning everything',
            reach.reach(w, T1).length === 1 && reach.reach(w, T1)[0] === s2);
    }

    // --- THE MEASUREMENT X-345 CLOSES ON: a SessionIndex with a year of
    // sessions; one task change costs what the change reaches, at 1 000 and at
    // 10 000 the same.
    {
        const pricing = { costFor: () => 0, priceFor: () => undefined, price: () => 0, costOf: () => 0 };
        const dirX = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x345-'));
        const load = (n) => {
            const idx = new SessionIndex(dirX, () => [], pricing,
                () => [{ id: AGENTDIR, name: 'developer', dir: AGENTDIR, normDir: AGENTDIR }], () => true, () => 150000);
            const map = new Map();
            for (let i = 0; i < n; i++) {
                const first = T0 - 365 * DAY + Math.floor((i / n) * 365 * DAY);
                const file = 'C:/u/y/' + i + '.jsonl';
                map.set(file, session({
                    sessionId: 'y-' + i, file, cwd: ROOTS[i % ROOTS.length] + '/src', source: ENG[i % ENG.length],
                    firstTs: first, lastTs: first + 20 * 60_000, events: [], turns: [], agentId: undefined, agentName: undefined
                }));
            }
            idx.sessions = map;                       // private, reachable at runtime — the shape scanAll leaves
            idx.reachLive.rebuild(map.values());
            return idx;
        };
        const runs = [];
        for (let i = 0; i < 15; i++) {
            const at = T0 - 365 * DAY + Math.floor(((i + 0.5) / 15) * 365 * DAY);
            runs.push(binding({ taskId: 'r' + i, engine: ENG[i % ENG.length], cwd: ROOTS[i % ROOTS.length], startedAt: at, endedAt: at + HOUR }));
        }
        const measure = (n) => {
            const idx = load(n);
            const t0 = process.hrtime.bigint();
            idx.setLaunchBindings(runs);
            const first = idx.lastBindingSweep;
            const t1 = process.hrtime.bigint();
            // a run finishes: one binding's record changes
            const later = runs.map((b, i) => i === 3 ? { ...b, endedAt: b.endedAt + 30 * 60_000 } : b);
            idx.setLaunchBindings(later);
            const second = idx.lastBindingSweep;
            const t2 = process.hrtime.bigint();
            idx.setLaunchBindings(later);
            const third = idx.lastBindingSweep;
            idx.dispose();
            return { first, second, third, allMs: Number(t1 - t0) / 1e6, oneMs: Number(t2 - t1) / 1e6 };
        };
        const small = measure(1000), big = measure(10000);
        console.log(`  X-345: 15 bindings published — touched ${small.first.touched} @1k / ${big.first.touched} @10k (${small.allMs.toFixed(2)} / ${big.allMs.toFixed(2)} ms); `
            + `one run finishing — touched ${small.second.touched} @1k / ${big.second.touched} @10k (${small.oneMs.toFixed(3)} / ${big.oneMs.toFixed(3)} ms)`);
        ok(`‼️ X-345: publishing 15 bindings over a year asks the sessions inside their hours — ${small.first.touched} at 1 000, ${big.first.touched} at 10 000`,
            small.first.added === 15 && big.first.added === 15 && big.first.touched <= 15 * 12 && big.first.touched < 10000 / 10);
        ok(`‼️ X-345: one run finishing asks ONLY its own hour — ${big.second.touched} session(s) at 10 000, ${small.second.touched} at 1 000 (${big.oneMs.toFixed(2)} ms)`,
            big.second.added === 1 && big.second.removed === 1 && big.second.touched <= 12 && small.second.touched <= 12);
        ok('‼️ X-345: the same bindings published again ask nobody', big.third === big.second && small.third === small.second);
        ok(`‼️ X-345: at ten thousand the change costs what it did at one thousand — ${big.oneMs.toFixed(2)} vs ${small.oneMs.toFixed(2)} ms`,
            big.oneMs < Math.max(5, small.oneMs * 4));
        try { fs.rmSync(dirX, { recursive: true, force: true }); } catch { /* tmp */ }
    }
}

// ===========================================================================
// 4) THE INDEX — THE ORDER OF THE TWO LINES, MEASURED ON REAL FILES
//
// `includeUnmatchedProjects` is FALSE here, which is the default and the state
// the bug needs: without the binding the file is deleted from the index, and
// every surface that asks the index a question answers "no such session".
// ===========================================================================
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bind-'));
    const projects = path.join(dir, 'projects', 'D--zone-dev-git-miropharm-vsc-AgentFarm');
    fs.mkdirSync(projects, { recursive: true });
    const SID = '190e5baf-e937-4bc9-a83f-8a26d7248c89';
    const file = path.join(projects, SID + '.jsonl');
    const line = (ts, text) => JSON.stringify({
        type: 'user', sessionId: SID, cwd: REPO, timestamp: new Date(ts).toISOString(),
        message: { role: 'user', content: text }
    });
    const reply = (ts) => JSON.stringify({
        type: 'assistant', sessionId: SID, cwd: REPO, timestamp: new Date(ts).toISOString(),
        message: {
            role: 'assistant', model: 'claude-opus-4-1', content: [{ type: 'text', text: 'tamam' }],
            usage: { input_tokens: 10, output_tokens: 5 }
        }
    });
    fs.writeFileSync(file, [line(T0 + 4000, 'M-10 M-11 U-56 S-19 tamamla'), reply(T1 - 2000)].join('\n') + '\n', 'utf8');

    const pricing = { costFor: () => 0, priceFor: () => undefined, price: () => 0, costOf: () => 0 };
    const mk = () => new SessionIndex(
        dir, () => [], pricing,
        () => [{ id: AGENTDIR, name: 'developer', dir: AGENTDIR, normDir: AGENTDIR }],
        () => false,            // includeUnmatchedProjects OFF — the default
        () => 150000
    );

    const bare = mk();
    return (async () => {
        await bare.scanAll();
        ok('‼️ THE BUG, REPRODUCED: with no binding the run is not in the index at all',
            bare.all().length === 0);
        bare.dispose();

        // The same scan, with the launch record published FIRST — which is the
        // order the extension uses, because the filter runs inside the scan.
        const withB = mk();
        withB.setLaunchBindings([binding()]);
        await withB.scanAll();
        const got = withB.all();
        ok('‼️ …and with it the session is indexed, owned and findable',
            got.length === 1 && got[0].sessionId === SID);
        ok('…by the agent the run belonged to, not by its folder',
            got[0].agentId === AGENTDIR && got[0].agentName === 'developer');
        ok('…carrying the schedule that started it, which is what Origin=Auto reads',
            got[0].launchedBy && got[0].launchedBy.kind === 'schedule');
        ok('…and the project the run was created under', got[0].projectId === undefined
            || got[0].projectId === 'prj_9ujsbtzr');
        withB.dispose();

        // ‼️ THE ORDER THAT ACTUALLY HAPPENS AT RUNTIME: the transcript is
        // written and indexed while the run goes, and the binding lands after.
        // Without the memo of what was dropped there is nothing left to repair.
        const late = mk();
        await late.scanAll();
        ok('a late binding starts from a dropped file', late.all().length === 0);
        late.setLaunchBindings([binding()]);
        ok('‼️ …and rescues it without re-walking every projects folder',
            late.all().length === 1 && late.all()[0].sessionId === SID);

        // Restart persistence: the extension rebuilds the same bindings from the
        // task store, so publishing them twice must be idempotent.
        late.setLaunchBindings([binding()]);
        ok('publishing the same bindings again changes nothing', late.all().length === 1);

        const report = late.launchBindingReport();
        ok('the report says which session each run resolved to',
            report.bindings.length === 1 && report.bindings[0].resolved === SID
            && report.bindings[0].proof === 'matched');
        ok('…and holds no doubts when there were none', report.doubts.length === 0);

        // ‼️ THE ANSWER HAS TO TRAVEL BACK TO THE RUN RECORD. A session the
        // index alone knows about is one the Tasks row still cannot open — and
        // the cost path cannot carry it, because that only runs for fifteen
        // minutes after a run ends and this one ended yesterday.
        const back = late.resolvedBindings();
        ok('the index says which transcript each run ended up with',
            back.length === 1 && back[0].taskId === 'mss3jcnfoxftb'
            && back[0].sessionId === SID && back[0].proof === 'matched');

        const store = path.join(dir, 'farm-tasks.json');
        fs.writeFileSync(store, JSON.stringify({
            tasks: [{
                id: 'mss3jcnfoxftb', agentId: AGENTDIR, agentName: 'developer', title: 'Gece',
                prompt: 'p', mode: 'headless', status: 'failed', createdAt: T0, startedAt: T0, endedAt: T1
            }],
            schedules: [], templates: [], workflows: [], triggers: []
        }), 'utf8');
        const { TaskManager } = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
        const tm = new TaskManager(store, () => [], () => false, () => '', {});
        ok('‼️ a run found long after it ended still gets its transcript link',
            tm.setTaskSession('mss3jcnfoxftb', back[0].file) === true
            && tm.tasks[0].costSessionFile === back[0].file);
        ok('…and it is idempotent, so the reconcile pass cannot loop',
            tm.setTaskSession('mss3jcnfoxftb', 'somewhere/else.jsonl') === false
            && tm.tasks[0].costSessionFile === back[0].file);
        ok('…and it writes no cost, because finding a file is not measuring one',
            tm.tasks[0].costUSD === undefined);
        ok('an unknown run is a no-op', tm.setTaskSession('nope', 'x.jsonl') === false);
        tm.dispose();

        // Two overlapping runs of ours: the file must NOT be silently attributed,
        // and the reason has to be recoverable.
        const two = mk();
        two.setLaunchBindings([
            binding(),
            binding({ taskId: 'other', label: 'başka koşu', startedAt: T0 - 1000, endedAt: T1 + 1000 })
        ]);
        await two.scanAll();
        ok('‼️ an ambiguous transcript is not filed under a guessed run',
            two.all().length === 0);
        ok('…and the doubt is recorded with its reason',
            two.launchBindingReport().doubts.length === 1);
        two.dispose();
        late.dispose();

        // The user's own scope setting is untouched: with it ON, everything is
        // indexed as before and a bound run keeps its real owner rather than
        // "Other projects".
        const wide = new SessionIndex(
            dir, () => [], pricing,
            () => [{ id: AGENTDIR, name: 'developer', dir: AGENTDIR, normDir: AGENTDIR }],
            () => true, () => 150000
        );
        wide.setLaunchBindings([binding()]);
        await wide.scanAll();
        ok('with "other projects" ON the bound run is still the agent\'s, not "Other projects"',
            wide.all().length === 1 && wide.all()[0].agentName === 'developer');
        wide.dispose();

        // ================================================================
        // X-102 - THE JOIN FOR A RUN NO BINDING COVERS, and the thing it must
        // NOT do on the way.
        //
        // `publishLaunchBindings` is built out of TASKS. A terminal or a
        // Console card a person opens by hand writes a manifest exactly the
        // same way and has no binding at all, so its launchId had nowhere to
        // go: the setup was on file and unattachable to the conversation it
        // produced. `setSpawnIds` is the second channel, and its whole safety
        // is that it writes ONE field.
        // ================================================================
        const own = new SessionIndex(
            dir, () => [], pricing,
            () => [{ id: AGENTDIR, name: 'developer', dir: AGENTDIR, normDir: AGENTDIR }],
            () => true, () => 150000
        );
        await own.scanAll();
        // Whatever the path test made of it, that is what it must still be after.
        const ownerBefore = JSON.stringify(own.all().map(s => [s.sessionId, s.agentName, s.agentId]));
        own.setSpawnIds([{ sessionId: SID, launchId: 'lch_byhand01' }]);
        const mine = own.all().find(s => s.sessionId === SID);
        ok('!! a session nobody bound still reaches its manifest',
            !!mine && mine.launchId === 'lch_byhand01');
        // !! THE SAFETY PROPERTY. A binding also supplies the LAUNCHER, and
        // `sessionOrigin` reads the launcher to decide 'you' against
        // 'automation'. Filing a hand-opened terminal as a binding would move
        // it into the automation lane on every surface that filters by origin.
        ok('!! ...and it is still YOUR session, not an automation run',
            !!mine && !mine.launchedBy);
        ok('...and nothing about who owns it moved',
            JSON.stringify(own.all().map(s => [s.sessionId, s.agentName, s.agentId])) === ownerBefore);
        // Idempotent: the same pairs again change nothing, which is what makes
        // it safe to call on every hook event.
        own.setSpawnIds([{ sessionId: SID, launchId: 'lch_byhand01' }]);
        ok('the same pairing again is not a second answer',
            own.all().find(s => s.sessionId === SID).launchId === 'lch_byhand01');
        // !! AND IT NEVER OVERWRITES. A session belongs to the spawn that
        // produced it; a later record naming it is a bookkeeping slip, and
        // taking the newer one would let one slip rewrite a correct history.
        own.setSpawnIds([{ sessionId: SID, launchId: 'lch_someother' }]);
        ok('!! a later id does not rewrite the one already recorded',
            own.all().find(s => s.sessionId === SID).launchId === 'lch_byhand01');
        own.dispose();

        // ...and a binding that carries one still wins, because it is applied
        // first and this channel only fills an empty field.
        const bothWays = new SessionIndex(
            dir, () => [], pricing,
            () => [{ id: AGENTDIR, name: 'developer', dir: AGENTDIR, normDir: AGENTDIR }],
            () => true, () => 150000
        );
        bothWays.setLaunchBindings([binding({ launchId: 'lch_fromtask' })]);
        await bothWays.scanAll();
        bothWays.setSpawnIds([{ sessionId: SID, launchId: 'lch_byhand01' }]);
        ok('!! the binding is the stronger statement and keeps its id',
            bothWays.all().find(s => s.sessionId === SID).launchId === 'lch_fromtask');
        bothWays.dispose();

        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
