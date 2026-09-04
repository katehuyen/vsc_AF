// X-176 — MEASURING THE SESSION THAT JUST ENDED, and admitting what it could not.
//
// The driver is pure because somebody else measures. This is that somebody, and
// it is the one place in the sentry where the X-174 distinction can be lost:
//
//   · ‼️ A THING THAT COULD NOT BE READ IS `undefined`, NOT AN EMPTY ANSWER. An
//     answers folder that would not list is not "no handover note"; a git that
//     would not answer is not "clean". Collapse those and the verdict is
//     manufactured out of this module's own defaults, and a paid session is
//     opened on it.
//   · ‼️ ONE UNREADABLE REPOSITORY MAKES THE WHOLE REPO FACT UNMEASURED. The
//     verdict "clean" is a claim about ALL of them, so reporting the two that
//     answered would be a claim about a repository nobody looked at.
//   · An EMPTY answer is still an answer: a folder that listed and was empty, a
//     project with no repositories at all, a session that touched no code.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { measureSession, codesTouchedIn } = require(path.join(OUT, 'sentryMeasure.js'));
const { diagnoseSession } = require(path.join(OUT, 'sessionDiagnosis.js'));

const SID = '878ae65b-f73a-485b-ae05-df47cbbe6d1d';
const T0 = Date.UTC(2026, 8, 4, 9, 0, 0);

/** Everything answers, and answers emptily. */
const io = (over) => Object.assign({
    answers: () => [],
    dirty: () => 0,
    tracks: () => [],
    output: () => ''
}, over || {});

const measure = (over, ioOver) => measureSession(
    Object.assign({ sessionId: SID, repos: ['D:/repo'] }, over || {}), io(ioOver));

// ---- the ordinary case: everything answered --------------------------------
{
    const f = measure({ progress: { assistantSteps: 12, toolCalls: 30 } });
    ok('the session id is carried through exactly as it was given', f.sessionId === SID);
    ok('a folder that listed and was empty is an ANSWER, not a shrug',
        Array.isArray(f.answerFiles) && f.answerFiles.length === 0);
    ok('a repository that answered is a row with its count', f.repos.length === 1 && f.repos[0].dirty === 0);
    ok('a ledger that was read and named no code is an answer too', Array.isArray(f.codes));
    ok('an empty output is a measurement — the engine simply said nothing', f.output === '');
    ok('...and a verdict built on it has nothing left to ask',
        diagnoseSession(f).unknown.length === 0);
}

// ---- ‼️ what could not be read stays unread --------------------------------
{
    const f = measure({}, { answers: () => undefined });
    ok('an answers folder that would not list leaves the fact ABSENT',
        f.answerFiles === undefined);
    ok('...and the verdict says so rather than ruling a handover note out',
        diagnoseSession(f).unknown.some(u => /answers folder/i.test(u)));

    const g = measure({}, { tracks: () => undefined });
    ok('a ledger that could not be read leaves the codes ABSENT', g.codes === undefined);

    const h = measure({}, { output: () => undefined });
    ok('a run with no output file leaves the output ABSENT', h.output === undefined);
}

// ---- ‼️ one unreadable repository makes the whole fact unmeasured -----------
{
    const answers = { 'D:/a': 0, 'D:/b': 3 };
    const two = measureSession({ sessionId: SID, repos: ['D:/a', 'D:/b'] },
        io({ dirty: (r) => answers[r] }));
    ok('every repository that answered is a row of its own',
        two.repos.length === 2 && two.repos[1].dirty === 3);

    const half = measureSession({ sessionId: SID, repos: ['D:/a', 'D:/b'] },
        io({ dirty: (r) => (r === 'D:/a' ? 0 : undefined) }));
    ok('‼️ one repository that would not answer makes the WHOLE repo fact unmeasured',
        half.repos === undefined);
    ok('...and the verdict asks about it instead of calling the rest clean',
        diagnoseSession(half).unknown.some(u => /repo/i.test(u)));

    const none = measureSession({ sessionId: SID, repos: [] }, io());
    ok('a project with no repositories at all really has nothing dirty — that is an answer',
        Array.isArray(none.repos) && none.repos.length === 0);
}

// ---- what a session touched, from the ledger -------------------------------
{
    const rows = [
        { code: 'X-175', event: 'done', ts: T0, session: SID },
        { code: 'X-176', event: 'touch', ts: T0 + 1, session: SID },
        { code: 'X-99', event: 'done', ts: T0 + 2, session: 'other-session-id' }
    ];
    const got = codesTouchedIn(rows, SID);
    ok('only the codes THIS session touched are counted',
        got.length === 2 && !got.some(c => c.code === 'X-99'));
    ok('an item the session closed is closed', got.find(c => c.code === 'X-175').closed === true);
    ok('an item it only worked on is still open', got.find(c => c.code === 'X-176').closed === false);
    ok('they come back in the order the session touched them',
        got.map(c => c.code).join() === 'X-175,X-176');

    ok('a ledger row written against the eight-character id is the same session',
        codesTouchedIn([{ code: 'X-1', event: 'done', ts: T0, session: '878ae65b' }], SID).length === 1);

    ok('‼️ a cancelled item is CLOSED — it left the pile, so the sentry moves on',
        codesTouchedIn([{ code: 'X-179', event: 'cancelled', ts: T0, session: SID }], SID)[0].closed === true);
    ok('‼️ an item reopened after it closed is open again — the last word wins',
        codesTouchedIn([
            { code: 'X-5', event: 'done', ts: T0, session: SID },
            { code: 'X-5', event: 'reopen', ts: T0 + 5, session: SID }
        ], SID)[0].closed === false);
    ok('a row belonging to no session is nobody\u2019s work',
        codesTouchedIn([{ code: 'X-1', event: 'done', ts: T0 }], SID).length === 0);
    ok('a code that only appears without a code is dropped rather than crashing',
        codesTouchedIn([{ event: 'done', ts: T0, session: SID }], SID).length === 0);
}

// ---- the facts the caller already holds travel unchanged -------------------
{
    const f = measure({ progress: { assistantSteps: 40, toolCalls: 120 } });
    ok('what the run managed to do is carried, not re-derived',
        f.progress.assistantSteps === 40 && f.progress.toolCalls === 120);
    ok('a run whose transcript was never bound carries no progress at all',
        measure({}).progress === undefined);

    const q = measureSession({ sessionId: SID, repos: [] }, io({ quotaPercent: () => 91 }));
    ok('the five-hour figure is carried when somebody read it', q.quotaPercent === 91);
    ok('...and is absent when nobody did', measure({}).quotaPercent === undefined);
}

console.log(`test_sentry_measure: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
