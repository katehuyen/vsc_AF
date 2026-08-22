// ‼️ M-18 (X-32) — WHAT A LEAD IS TOLD WHEN A PRIMITIVE FAILS.
//
// Every primitive could fail, and each one failed in prose: `step.note` was a
// sentence written at the site — "agent not found", "workflow no longer
// exists", "child objective refused — …". A person reads those fine. The lead
// gets one line inside a round message and has to decide from it whether to
// order the same thing again — so it guessed, and mostly it retried, and a
// delegation to an agent that does not exist failed identically for as many
// rounds as the ceiling allowed.
//
// What is pinned here:
//
//   * the CLASS is a closed set and each class states, ONCE and centrally, what
//     the lead should do about it — eight copies of an instruction are eight
//     chances for one of them to be different;
//   * the raw sentence is never thrown away: classifying is an addition;
//   * the failure carries the IDS of the evidence, because a lead that must not
//     paraphrase work it never saw needs something to point at;
//   * ‼️ a task that never started and a delegate that ran and came back failed
//     are DIFFERENT facts — one wants another engine, the other wants its
//     output read, and one word for both is a lead that cannot tell them apart;
//   * the block reaches the lead inside the round message, and only for a step
//     that actually failed: a step carrying a mere remark reads as it always did.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    }
    return origLoad.apply(this, arguments);
};
const M = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const eq = (msg, got, want) => ok(msg + (got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`), got === want);

// ==================================================== 1. the set is CLOSED
{
    console.log('\n-- the classes are a closed set and every one says what to do');
    const kinds = M.FAILURE_KINDS;
    const names = Object.keys(kinds);
    ok('there are classes at all', names.length >= 8);
    ok('every class states a retry advice from the closed vocabulary',
        names.every(n => ['same', 'different', 'fix-request', 'stop'].includes(kinds[n].retry)));
    ok('‼️ every class carries a sentence written for the LEAD to act on',
        names.every(n => typeof kinds[n].says === 'string' && kinds[n].says.length > 40));
    // ‼️ The advice is the point: a class whose advice equals another's is a
    // class that did not need to exist. These four have to differ.
    eq('an agent that is not in the fleet cannot be retried as written',
        kinds['agent-missing'].retry, 'different');
    eq('a reload interrupting a run is not the run\'s fault', kinds.interrupted.retry, 'same');
    eq('a request the engine refused is the LEAD\'s own to fix',
        kinds['request-refused'].retry, 'fix-request');
    eq('a person pressing cancel means stop', kinds.cancelled.retry, 'stop');
    eq('and so does a ceiling', kinds['budget-stopped'].retry, 'stop');
}

// ============================================ 2. what was attempted, in words
{
    console.log('\n-- "failed" with no subject is not a fact anybody can act on');
    eq('a plain delegation names its agent',
        M.attemptOf({ title: 'wire the resume path', agentName: 'developer' }),
        'delegation to developer — "wire the resume path"');
    eq('a workflow step is a workflow, and the agent is not the subject',
        M.attemptOf({ title: 'nightly chain', agentName: 'developer', kind: 'workflow' }),
        'workflow — "nightly chain"');
    eq('a child objective says so', M.attemptOf({ title: 'prove cancel', kind: 'mission' }),
        'child objective — "prove cancel"');
    eq('a typed intent is named as itself',
        M.attemptOf({ title: 'check it', agentName: 'basit', intent: 'review' }),
        'review — "check it"');
    eq('an unnamed action still has a shape', M.attemptOf({}), 'delegation — "an unnamed action"');
}

// ================================== 3. the raw sentence survives, and the ids
{
    console.log('\n-- classifying is an ADDITION: the original words are kept');
    const f = M.failure('target-missing',
        { title: 'run the chain', kind: 'workflow', workflowRunId: 'wr_1', outputFile: 'D:/o.md' },
        'workflow no longer exists');
    eq('the class is what the caller said it was', f.class, 'target-missing');
    eq('‼️ the sentence written at the site is kept whole', f.detail, 'workflow no longer exists');
    eq('and the evidence is addressable', f.refs.workflowRunId, 'wr_1');
    eq('every ref that exists is carried', f.refs.outputFile, 'D:/o.md');
    ok('a failure with nothing to point at carries no refs key at all',
        M.failure('agent-missing', { title: 't' }, 'x').refs === undefined);
    ok('…and no empty detail either',
        M.failure('agent-missing', { title: 't' }).detail === undefined);
}

// ======================== 4. ‼️ the two ways a TASK fails are different facts
{
    console.log('\n-- ‼️ a run that never started and a delegate that came back failed');
    const step = { title: 'wire it', agentName: 'developer', taskId: 'tk_1' };

    const refused = M.classifyTaskFailure(step,
        { status: 'failed', deferredReason: 'codex is not installed on this machine' });
    eq('a task that never started is engine-refused, not delegate-failed',
        refused.class, 'engine-refused');
    eq('…and the advice is to try another engine', M.FAILURE_KINDS[refused.class].retry, 'different');

    const budget = M.classifyTaskFailure(step,
        { status: 'failed', deferredCode: 'budget:fleet', deferredReason: 'fleet daily budget spent ($388.91 of $380)' });
    eq('a ceiling names itself in the CODE and is not confused with an engine refusal',
        budget.class, 'budget-stopped');
    eq('…and there is no more rope', M.FAILURE_KINDS[budget.class].retry, 'stop');
    // ‼️ The code is the identity and the reason is prose — that is what
    // `deferredCode` is FOR. A sentence that merely contains the word must not
    // be read as a ceiling, or a delegate that wrote about budgets and failed
    // gets told to stop.
    eq('‼️ a reason that merely mentions a budget is NOT a ceiling',
        M.classifyTaskFailure(step,
            { status: 'failed', deferredReason: 'could not read the budget spreadsheet' }).class,
        'engine-refused');

    const ran = M.classifyTaskFailure({ ...step, outputFile: 'D:/out.md' },
        { status: 'failed', deferredReason: 'exited 1' });
    eq('a delegate that produced output ran — reading it is the next move',
        ran.class, 'delegate-failed');
    eq('and its output is the evidence', ran.refs.outputFile, 'D:/out.md');

    eq('a cancelled task is a person, not a fault',
        M.classifyTaskFailure(step, { status: 'cancelled' }).class, 'cancelled');
    eq('and a task record that is gone says exactly that',
        M.classifyTaskFailure(step, undefined).class, 'record-lost');
}

// ================================================= 5. the block the lead reads
{
    console.log('\n-- the lead is handed a shape, not a sentence');
    const text = M.describeFailure(M.failure('agent-missing',
        { title: 'wire it', agentName: 'ghost', taskId: 'tk_2' },
        'no agent named "ghost" is in this fleet'));
    ok('the class and the retry advice lead', /^Failure: agent-missing \(retry: different\)/.test(text));
    ok('what was attempted is named', /Attempted: delegation to ghost — "wire it"/.test(text));
    ok('the original sentence is quoted', /Reported: no agent named "ghost"/.test(text));
    ok('the evidence is addressable', /Evidence: task tk_2/.test(text));
    ok('and the last line is what to DO', /What to do: That agent is not in this fleet/.test(text));
    eq('nothing at all for a step that did not fail', M.describeFailure(undefined), '');
    eq('the one-line form leads with the class, which is the part decided on',
        M.shortFailure(M.failure('record-lost', { title: 't' }, 'task record lost')),
        'record-lost — task record lost');
}

// ================================ 6. it reaches the lead, and only when it should
{
    console.log('\n-- the block rides in the round message, on failed steps only');
    const rem = { costUSD: 4, tasks: 5, rounds: 3, minutes: 60, tokens: Infinity };
    const plain = {
        step: {
            id: 's1', agentName: 'developer', title: 'wire it', status: 'done',
            note: 'took two goes'
        },
        excerpt: 'done.'
    };
    const broken = {
        step: {
            id: 's2', agentName: 'ghost', title: 'wire it', status: 'failed',
            note: 'agent not found',
            failure: M.failure('agent-missing', { title: 'wire it', agentName: 'ghost' },
                'no agent named "ghost" is in this fleet')
        },
        excerpt: ''
    };
    const msg = M.buildRoundMessage([plain, broken], rem);
    ok('a step that merely carries a remark reads exactly as it always did',
        /### developer — "wire it" → DONE \(took two goes\)/.test(msg)
        && !/Failure:.*\n.*developer/.test(msg));
    ok('the failed step gets the shape under its heading',
        /→ FAILED \(agent not found\)\nFailure: agent-missing \(retry: different\)/.test(msg));
    ok('…with what to do about it', /What to do: That agent is not in this fleet/.test(msg));
    ok('and there is exactly ONE block — not one per step',
        (msg.match(/^Failure: /gm) || []).length === 1);
}

// ====================================================== 7. every site classifies
{
    console.log('\n-- a failure site that writes prose and no class is the bug this closes');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'missions.ts'), 'utf8');
    const media = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');

    // ‼️ Every `step.note = '…'` that marks a step FAILED or CANCELLED must be
    // accompanied by a classification. Counted rather than listed, so a new
    // failure site added without one fails this line rather than a reviewer.
    const noteSites = (ext.match(/step\.note = /g) || []).length;
    const classified = (ext.match(/step\.failure = /g) || []).length;
    ok(`every failure site in the extension classifies (${classified} of ${noteSites} note writes)`,
        classified >= noteSites - 1);
    ok('the approval rejection classifies too, and reads as a person saying no',
        /s\.failure = failure\('cancelled', s, 'the round was rejected at approval'\)/.test(src));
    ok('‼️ and a TASK is classified through the reader that knows the two cases apart',
        /step\.failure = classifyTaskFailure\(step, t\);/.test(ext));

    ok('the bridge hands the shape out, retry advice included',
        /retry: FAILURE_KINDS\[s\.failure\.class\]\?\.retry \?\? null/.test(ext));
    ok('…and says so in its own describe, naming the closed set',
        /Object\.keys\(FAILURE_KINDS\)\.join\(', '\)/.test(ext));

    ok('SHORTHAND: the class rides on the row next to the status',
        /\$\{chip\(s\.status\)\}\$\{failChip\(s\.failure\)\}/.test(media));
    ok('‼️ …and what it MEANS comes from the host\'s one registry, never a copy',
        /failureKinds: FAILURE_KINDS/.test(ext)
        && /\(DATA\.failureKinds \|\| \{\}\)\[f\.class\]/.test(media));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
