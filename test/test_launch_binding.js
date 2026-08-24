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

        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
