// ‼️ M-18 (X-45) — A WINDOW RELOAD, NOW THAT AN ACTION CAN BE MORE THAN A TASK.
//
// X-45 taught a run to survive a reload: the journal says what was set in
// motion, the task store says whether it finished while we were gone, and
// nothing is ever silently restarted. Then M-18 gave the lead two primitives
// that start something OTHER than a task — `run_workflow` starts a chain and
// `run_mission` starts a whole child objective — and the recovery was never
// measured against either. It could not have worked: the lookup began with
// `if (kind !== 'task') { return undefined; }`, so a chain or a child that
// finished perfectly while the window was closed came back as "interrupted —
// fate unknown". Cost lost, verdict lost, and a lead told nothing happened is a
// lead that orders it again — which for a child objective means paying for the
// same run twice.
//
// What is pinned here:
//
//   * the three stores are all asked, each for its own kind and nothing else;
//   * `stopped` — a workflow's word for what a task calls `cancelled` — is a
//     SETTLED status; a word missing from that table is not read as "unknown
//     vocabulary" but as unfinished, which is the silent version of this bug;
//   * ‼️ money already spent is finished work even when the OUTCOME is not: an
//     interrupted child carries its ledger up, or the parent believes it has a
//     budget it does not — on exactly the runs where the ceiling is the only
//     fence there is;
//   * a recovered child hands back its VERDICT, not just a status, and the
//     sentence is the same one it would have had if nobody had closed the
//     window — one function, two callers, because those two must agree.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    }
    return origLoad.apply(this, arguments);
};
const M = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'missionTrace.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const eq = (msg, got, want) => ok(msg + (got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`), got === want);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-reload-'));
const f = name => path.join(tmp, name);
const line = (seq, type, extra = {}) => JSON.stringify({ v: 1, seq, ts: seq * 1000, type, ...extra });
const writeLines = (file, lines) => fs.writeFileSync(file, lines.join('\n'), 'utf8');

/** A run that had all three kinds of action in flight when the window died. */
const traceFile = f('r-mixed.jsonl');
writeLines(traceFile, [
    line(1, 'strategy.changed', { strategy: 'split it three ways' }),
    line(2, 'action.created', { actionId: 'a1', kind: 'task', title: 'wire it' }),
    line(3, 'action.started', { actionId: 'a1', kind: 'task', refId: 'task-1' }),
    line(4, 'action.created', { actionId: 'a2', kind: 'workflow', title: 'nightly chain' }),
    line(5, 'action.started', { actionId: 'a2', kind: 'workflow', refId: 'wr-1' }),
    line(6, 'action.created', { actionId: 'a3', kind: 'mission', title: 'prove cancel' }),
    line(7, 'action.started', { actionId: 'a3', kind: 'mission', refId: 'run-child' }),
    ''
]);
const read = T.readTrace(traceFile);
const byId = (rec, id) => rec.actions.find(a => a.actionId === id);

// ================= 1. the bug: a lookup that only knows about tasks
{
    console.log('\n-- ‼️ the shape of the bug: only the task store was ever asked');
    const taskOnly = T.reconcileRun(read, 7,
        (kind, id) => (kind === 'task' && id === 'task-1'
            ? { status: 'done', costUSD: 0.5, tokens: 100 } : undefined));
    eq('the task is recovered', byId(taskOnly, 'a1').outcome, 'done');
    eq('…and the chain that finished is called interrupted', byId(taskOnly, 'a2').outcome, 'interrupted');
    eq('…and so is the child objective', byId(taskOnly, 'a3').outcome, 'interrupted');
    eq('two thirds of the run reported as fate-unknown', taskOnly.interrupted, 2);
}

// ================================ 2. each kind asked of its own store
{
    console.log('\n-- each kind is asked of the store that actually ran it');
    let asked = [];
    const rec = T.reconcileRun(read, 7, (kind, id) => {
        asked.push(kind + ':' + id);
        if (kind === 'task') { return { status: 'done', costUSD: 0.5, tokens: 100, outputFile: 'o1.md' }; }
        // a workflow's own word for "a person or a guard ended it"
        if (kind === 'workflow') { return { status: 'stopped', costUSD: 1.25, tokens: 900, outputFile: 'h.md' }; }
        if (kind === 'mission') { return { status: 'done', costUSD: 2.5, tokens: 4000 }; }
        return undefined;
    });
    eq('all three were looked up, each named by its kind', asked.join(' '),
        'task:task-1 workflow:wr-1 mission:run-child');
    eq('the task settles', byId(rec, 'a1').outcome, 'done');
    eq('‼️ the chain settles as CANCELLED — "stopped" is that store\'s word for it',
        byId(rec, 'a2').outcome, 'cancelled');
    eq('and the chain\'s handoff comes back as its output', byId(rec, 'a2').outputFile, 'h.md');
    eq('the child objective settles', byId(rec, 'a3').outcome, 'done');
    eq('with the money it spent', byId(rec, 'a3').costUSD, 2.5);
    eq('and its tokens', byId(rec, 'a3').tokens, 4000);
    eq('nothing is left unaccounted for', rec.interrupted, 0);
    eq('three recovered', rec.recovered, 3);
    ok('a healthy journal with recovered work resumes', rec.resume === 'ok');
}

// ============= 3. ‼️ money already spent is finished work; the outcome is not
{
    console.log('\n-- ‼️ an interrupted child still carries its ledger upward');
    const rec = T.reconcileRun(read, 7, (kind) => {
        if (kind === 'mission') { return { status: 'running', costUSD: 3.75, tokens: 12000 }; }
        if (kind === 'workflow') { return { status: 'running', costUSD: 0.4, tokens: 900 }; }
        return undefined;
    });
    const child = byId(rec, 'a3');
    eq('a child still claiming to run is NOT a settle — its engine died with the window',
        child.outcome, 'interrupted');
    eq('nobody pretends to know its fate', child.from, 'unknown');
    eq('‼️ but what it spent is not forgotten', child.costUSD, 3.75);
    eq('nor its tokens', child.tokens, 12000);
    eq('the same for a chain', byId(rec, 'a2').costUSD, 0.4);
    ok('a record that was never found carries no figures at all',
        byId(rec, 'a1').costUSD === undefined);
    eq('and all three are counted as interrupted', rec.interrupted, 3);
}

// ============================== 4. a child hands back a VERDICT, not a status
{
    console.log('\n-- a recovered child says what it concluded, not that it is over');
    eq('a finished child reads as its verdict',
        M.childResultText({
            status: 'done',
            result: { verdict: 'partial', stopReason: 'budget', summary: 'two of three done' }
        }),
        'Child objective partial (budget): two of three done');
    ok('…and names what it did not reach',
        M.childResultText({
            status: 'done',
            result: {
                verdict: 'partial', summary: 'nearly',
                unmet: [{ id: 'c2', text: 'tests pass', verdict: 'fail' }]
            }
        }).includes('Still unmet: [c2] tests pass → fail'));
    eq('a child with no verdict at all says so honestly, with its note',
        M.childResultText({ status: 'failed', note: 'the lead never replied' }),
        'Child objective failed — the lead never replied');
    eq('and with nothing to add, just the status',
        M.childResultText({ status: 'cancelled' }), 'Child objective cancelled');
}

// ================================================ 5. the wiring, in the host
{
    console.log('\n-- the host asks all three, on BOTH surfaces that reconcile');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('there is one lookup, named, rather than a closure per call site',
        /const missionExternalLookup: ExternalLookup = \(kind, refId\) => \{/.test(ext));
    ok('…that reads a chain through the workflow engine\'s own reader',
        /taskManager\.workflowRunState\(refId\)/.test(ext));
    ok('…and a child through its own run record',
        /const cr = missionStore\.run\(refId\);/.test(ext));
    // ‼️ U-64 added the THIRD — the Missions page's own trace view, which draws
    // the strategy history and the runtime graph. The rule is unchanged and is
    // the reason this is counted rather than eyeballed: a reconcile that asked
    // the journal alone would tell the reader an action was interrupted while
    // the task store had it finished ten minutes ago.
    eq('‼️ and EVERY reconcile call site uses it — the reload, missions.trace and '
        + 'the page\'s trace view, or three surfaces answer differently about one run',
        (ext.match(/reconcileRun\([\s\S]{0,120}?missionExternalLookup\)/g) || []).length, 3);
    eq('…and no reconcile is left asking the journal alone',
        (ext.match(/reconcileRun\(/g) || []).length, 3);
    // ‼️ X-89 — and the reload reads the projection's GUIDANCE too. It read
    // `answers` and stopped there, so both write-ahead windows lost: a steer
    // that only reached the journal vanished, and one the journal proved was
    // delivered was sent again by `reopenGuidance`.
    ok('‼️ the reload puts the journal\'s guidance back into the snapshot',
        /reconcileGuidance\(r, rec\.projection\.guidance\)/.test(ext));
    ok('…before the engine is ever built, so nothing is reopened first',
        ext.indexOf('reconcileGuidance(r, rec.projection.guidance)')
        < ext.indexOf('const missionEngines = new Map'));
    ok('…and both outcomes are said out loud on the ledger, not fixed in silence',
        /guidance \$\{id\} was recovered from the journal/.test(ext)
        && /guidance \$\{id\} had already reached the lead/.test(ext));
    ok('the interrupted branch keeps the figures',
        /step\.failure = missionFailure\('interrupted', step, step\.note\);\s*\n[\s\S]{0,600}?if \(a\.costUSD !== undefined\) \{ step\.costUSD = a\.costUSD; \}/.test(ext));
    ok('the recovered branch restores the child\'s verdict',
        /if \(step\.missionRunId && !step\.resultText\) \{/.test(ext)
        && /step\.resultText = childResultText\(cr\);/.test(ext));
    // ‼️ THE POINT IS ONE AUTHOR, NOT ONE CALLER. Three paths write a child's
    // result — the live observation loop, the startup reconciliation and the
    // resume — and every one of them must produce the identical sentence. What
    // would be the bug is any of them composing it inline again.
    ok('every path that reports a child calls the one composer',
        (ext.match(/childResultText\(/g) || []).length >= 3);
    ok('‼️ …and none of them builds the sentence by hand any more',
        !/`Child objective \$\{/.test(ext));

    console.log('\n-- the RESUME path settles every kind too, not only a delegate round');
    ok('‼️ having steps is the condition, not the round\'s action being "delegate"',
        /if \(last && last\.steps\.length && !last\.rejectedReason\) \{/.test(ext));
    ok('…and the step is looked up through the one reader that knows its kind',
        /const missionStepRecord = \(step: MissionStep\): ExternalRecord \| undefined =>/.test(ext)
        && /const rec = missionStepRecord\(step\);/.test(ext));
    ok('…which asks a chain, a child and a task in that order of specificity',
        /step\.missionRunId \? missionExternalLookup\('mission'/.test(ext)
        && /step\.workflowRunId \? missionExternalLookup\('workflow'/.test(ext)
        && /step\.taskId \? missionExternalLookup\('task'/.test(ext));
    ok('…and a chain\'s "stopped" is read as cancelled here too',
        /SETTLED_ON_RESUME = new Set\(\['done', 'failed', 'cancelled', 'stopped'\]\)/.test(ext));
}

// ‼️ X-74 — THE BOND IS WRITTEN DOWN BEFORE THE WORK IS STARTED.
//
// A workflow step and a child objective were STARTED first and recorded second:
// `runWorkflow` / `startMission` were called, they made real work run, and only
// afterwards did the parent's step learn which run it owned, the child learn who
// its parent was, and the journal learn that anything had begun. Every one of
// those facts therefore lived in one window's memory while money was being
// spent. A crash in that gap left a chain or a child working for nobody — and
// the reload could not repair it, because the one place that knew which run
// belonged to which action was the journal, and the journal's ref was thrown
// away by the reconciliation that read it.
{
    console.log('\n-- ‼️ X-74 the reload can say WHICH run an action owns');
    const settled = f('r-settled.jsonl');
    writeLines(settled, [
        line(1, 'action.created', { actionId: 'b1', kind: 'mission', title: 'child' }),
        line(2, 'action.started', { actionId: 'b1', kind: 'mission', refId: 'run-kid' }),
        line(3, 'action.settled', { actionId: 'b1', kind: 'mission', outcome: 'done', refId: 'run-kid' }),
        ''
    ]);
    const done = T.reconcileRun(T.readTrace(settled), 3);
    eq('‼️ an action the journal saw settle names the run it settled',
        byId(done, 'b1').refId, 'run-kid');

    const rec = T.reconcileRun(read, 7, (kind) =>
        (kind === 'task' ? { status: 'done', costUSD: 0.5, tokens: 100 } : undefined));
    eq('one recovered from its own store names it too', byId(rec, 'a1').refId, 'task-1');
    eq('‼️ and so does one whose fate is unknown — that is the case it exists for',
        byId(rec, 'a3').refId, 'run-child');
    eq('…the chain as well', byId(rec, 'a2').refId, 'wr-1');
    const created = f('r-created.jsonl');
    writeLines(created, [
        line(1, 'action.created', { actionId: 'c1', kind: 'workflow', title: 'a chain nobody started' }),
        ''
    ]);
    const none = T.reconcileRun(T.readTrace(created), 1);
    ok('an action that never started points at nothing rather than at a guess',
        !!byId(none, 'c1') && byId(none, 'c1').refId === undefined);

    console.log('\n-- ‼️ X-74 the host allocates, bonds, saves, and only then starts');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const rising = (hay, keys) => {
        const at = keys.map(k => hay.indexOf(k));
        return at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1]));
    };
    const kid = ext.slice(ext.indexOf('const childRun = prepareMission(child'), ext.indexOf('if (step.kind === \'workflow\')'));
    ok('a child objective is prepared, bonded, traced and SAVED before it is launched',
        rising(kid, ['prepareMission(child', 'parentRunId: run.id', 'sourceActionId: step.id',
            'step.missionRunId = childRun.id', 'traceEvent(run, \'action.started\'',
            'missionChanged();', 'launchMission(child, childRun);']));
    const chain = ext.slice(ext.indexOf('const wRunId = taskManager.prepareWorkflowRun'));
    ok('a chain is named, bonded, traced and saved before its first task exists',
        rising(chain.slice(0, 900), ['prepareWorkflowRun(wf', 'step.workflowRunId = wRunId',
            'traceEvent(run, \'action.started\'', 'missionChanged();',
            'taskManager.startWorkflowRun(wRunId, wf);']));
    ok('‼️ nothing calls the one-breath starters on the delegation path any more',
        !/const childRun = startMission\(/.test(ext) && !/taskManager\.runWorkflow\(wf/.test(ext));
    ok('and a run cannot be launched twice under the same id',
        /if \(missionEngines\.has\(run\.id\)\) \{ return; \}/.test(ext));

    console.log('\n-- ‼️ X-74 …and the reload puts the ref back before it judges the step');
    ok('the journal\'s ref is restored onto a step that never got it',
        /step\.missionRunId \?\?= a\.refId;/.test(ext)
        && /step\.workflowRunId \?\?= a\.refId;/.test(ext)
        && /step\.taskId \?\?= a\.refId;/.test(ext));
    ok('…before anything reads those fields to decide what happened',
        ext.indexOf('step.missionRunId ??= a.refId;')
        < ext.indexOf('if (a.outcome === \'interrupted\') {'));
    ok('‼️ …and a subsystem that has no record of the id at all says nothing ran, '
        + 'rather than frightening the lead with "fate unknown"',
        /nothing ran and nothing was spent/.test(ext)
        && /const never = !!a\.refId && \(a\.kind === 'mission' \|\| a\.kind === 'workflow'\)/.test(ext));
}

// ‼️ X-72 — THE MONEY A CLOSED WINDOW NEVER COUNTED.
//
// Reconciliation restores what each step really spent, but `remainingBudget`
// reads the RUN totals and nothing recomputed those. A window closing between
// a wave settling and its rollup therefore came back with expensive steps and
// an untouched budget — and the resume started fresh work on money that was
// already gone.
{
    console.log('\n-- ‼️ X-72 the run totals catch up with the steps that settled');
    const step = (id, over = {}) => ({
        id, round: 1, agentId: 'a1', agentName: 'Ada', title: id, prompt: 'p',
        status: 'done', costUSD: 0.25, tokens: 1000, ...over
    });
    const runWith = (rounds) => ({
        id: 'r', specId: 'm', status: 'paused', rounds, ledger: [],
        totalCostUSD: 0, totalTokens: 0, startedAt: 0
    });
    const r1 = runWith([{ n: 1, action: 'delegate', thought: 't', steps: [step('s1'), step('s2')], plannerCostUSD: 0, at: 5 }]);
    eq('a round that settled but was never booked is recovered', M.bookSettledRounds(r1), 1);
    ok('…with what its steps really cost', Math.abs(r1.totalCostUSD - 0.5) < 1e-9);
    eq('…and the tokens, which is the only currency on a plan-billed engine', r1.totalTokens, 2000);
    eq('‼️ a second reload counts nothing again', M.bookSettledRounds(r1), 0);
    ok('…and the total has not moved', Math.abs(r1.totalCostUSD - 0.5) < 1e-9);
    eq('no ledger line is invented — the ledger is what the run SAID at the time', r1.ledger.length, 0);

    const r2 = runWith([{ n: 1, action: 'delegate', thought: 't', booked: true, steps: [step('s1')], plannerCostUSD: 0, at: 5 }]);
    eq('‼️ a round the engine already booked is left alone', M.bookSettledRounds(r2), 0);
    eq('…so the total stays where the engine put it', r2.totalCostUSD, 0);

    const r3 = runWith([{
        n: 1, action: 'delegate', thought: 't', plannerCostUSD: 0, at: 5,
        steps: [step('s1'), step('s2', { status: 'running', costUSD: undefined })]
    }]);
    eq('‼️ a round still holding live work is the engine\'s to book, not ours',
        M.bookSettledRounds(r3), 0);
    ok('…so nothing is charged for a wave that has not come back', r3.totalCostUSD === 0);

    const r4 = runWith([{ n: 1, action: 'delegate', thought: 't', plannerCostUSD: 0, at: 5, steps: [step('s1', { status: 'cancelled' })] }]);
    eq('a cancelled step still spent what it spent', M.bookSettledRounds(r4), 1);
    ok('…and it is on the run', Math.abs(r4.totalCostUSD - 0.25) < 1e-9);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
