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
    eq('‼️ and BOTH reconcile call sites use it — the reload and missions.trace, '
        + 'or two surfaces answer differently about one run',
        (ext.match(/reconcileRun\([\s\S]{0,120}?missionExternalLookup\)/g) || []).length, 2);
    eq('…and no reconcile is left asking the journal alone',
        (ext.match(/reconcileRun\(/g) || []).length, 2);
    ok('the interrupted branch keeps the figures',
        /step\.failure = missionFailure\('interrupted', step, step\.note\);\s*\n[\s\S]{0,600}?if \(a\.costUSD !== undefined\) \{ step\.costUSD = a\.costUSD; \}/.test(ext));
    ok('the recovered branch restores the child\'s verdict',
        /if \(step\.missionRunId && !step\.resultText\) \{/.test(ext)
        && /step\.resultText = childResultText\(cr\);/.test(ext));
    eq('‼️ and the verdict sentence has exactly ONE author, so the recovered '
        + 'wording cannot drift from the live one',
        (ext.match(/childResultText\(/g) || []).length, 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
