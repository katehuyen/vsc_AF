// M-12 + M-10 (second half) — what a failed run MANAGED, and what a retry IS.
//
// The case both items come from: task `mss3jcnfoxftb` ran 45 minutes, wrote a
// 3.2 MB transcript with 269 tool calls, and was reported as a run where
// "nothing was attempted" — after which six blind retries resent the original
// prompt into six fresh conversations that could not see any of that work.
//
// M-12 is the diagnosis (three phases, evidence-based). M-10's second half is
// the treatment (continue the same conversation instead of repeating it).
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
const shown = [];
const fakeVscode = {
    EventEmitter: FakeEmitter,
    Disposable: { from: () => ({ dispose() { } }) },
    window: {
        showInformationMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
        showWarningMessage: (m) => { shown.push(m); return Promise.resolve(undefined); },
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

const R = require(path.join(ROOT, 'out', 'core', 'retry.js'));
const { TaskManager, describeFailurePhase } = require(path.join(ROOT, 'out', 'core', 'tasks.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => {
    if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); }
};

const LIMIT = 'Claude usage limit reached — you have hit your session limit. resets 10:30am';
const PLAIN = 'error: ENOENT: no such file or directory';

// ===========================================================================
// 1) M-12 — THREE PHASES, AND ONLY ONE OF THEM MAY SAY "NOTHING WAS ATTEMPTED"
// ===========================================================================
{
    const noEvidence = R.classifyFailure({ output: LIMIT });
    ok('‼️ with no transcript bound, the phase is UNKNOWN — not "nothing happened"',
        noEvidence.phase === 'unknown' && noEvidence.limit === true);
    ok('…and it says so out loud rather than implying idleness',
        /not known yet/.test(noEvidence.why) && !/nothing was attempted/.test(noEvidence.why));

    const started = R.classifyFailure({ output: LIMIT, progress: { assistantSteps: 0, toolCalls: 0 } });
    ok('‼️ a run that really did nothing IS allowed to say so',
        started.phase === 'not-started' && /nothing was attempted/.test(started.why));

    // The real case: 269 tool calls in 45 minutes, stopped by the limit.
    const real = R.classifyFailure({
        output: LIMIT,
        progress: { assistantSteps: 120, toolCalls: 269, elapsedMs: 45 * 60_000 }
    });
    ok('‼️ THE BUG: 45 minutes and 269 tool calls is INTERRUPTED, not "nothing attempted"',
        real.phase === 'interrupted');
    ok('…and the sentence warns against resending the work',
        /read the transcript before sending it again/i.test(real.why)
        && !/nothing was attempted/.test(real.why));
    ok('…and it counts what it found', /269 tool calls/.test(real.why) && /45 min/.test(real.why));

    // ‼️ TIME IS NOT PROGRESS. A run can hold a lock for an hour and attempt
    // nothing, so elapsed time alone must never promote the phase.
    ok('‼️ elapsed time ALONE is not evidence of work',
        R.classifyFailure({
            output: LIMIT, progress: { assistantSteps: 0, toolCalls: 0, elapsedMs: 60 * 60_000 }
        }).phase === 'not-started');

    ok('a non-limit failure is classified the same way and is not called a limit',
        R.classifyFailure({ output: PLAIN, progress: { toolCalls: 4 } }).phase === 'interrupted'
        && R.classifyFailure({ output: PLAIN, progress: { toolCalls: 4 } }).limit === false);
}

// ===========================================================================
// 2) THE DECISION STOPS ASSERTING WHAT IT HAS NOT MEASURED
// ===========================================================================
{
    const blind = R.retryDecision({ max: 3, delayMin: 40 }, { attempt: 0, output: LIMIT });
    ok('‼️ the retry line no longer claims "nothing was attempted" without evidence',
        blind.retry === true && !/nothing was attempted/.test(blind.why));
    ok('…and it carries the phase, so the row can record it', blind.phase === 'unknown');

    const known = R.retryDecision({ max: 3, delayMin: 40 },
        { attempt: 0, output: LIMIT, progress: { toolCalls: 269, elapsedMs: 45 * 60_000 } });
    ok('…and with evidence it says the run was cut off', known.phase === 'interrupted');

    // ‼️ The phase is a fact about the run, so it is reached even when there is
    // no retry left — that row is exactly the one somebody opens to ask.
    const spent = R.retryDecision({ max: 1, delayMin: 40 },
        { attempt: 1, output: LIMIT, progress: { toolCalls: 269 } });
    ok('‼️ a run that is OUT of retries still says what it managed',
        spent.retry === false && spent.phase === 'interrupted');
}

// ===========================================================================
// 3) M-10 — SIMPLE IS UNCHANGED, SMART CONTINUES
// ===========================================================================
{
    // ‼️ NOTHING MIGRATES. A policy written before these fields existed must
    // behave exactly as it did, or every scheduled run in the fleet changes
    // meaning on an upgrade.
    const old = R.retryDecision({ max: 6, delayMin: 40 },
        { attempt: 0, output: LIMIT, progress: { toolCalls: 269 } });
    ok('‼️ a policy that says nothing is SIMPLE — it never resumes on its own',
        old.retry === true && !old.continueRun && !old.promptTemplate && !old.hold);

    const smart = R.retryDecision(
        { max: 6, delayMin: 40, behavior: 'smart' },
        { attempt: 0, output: LIMIT, progress: { toolCalls: 269 } });
    ok('‼️ smart + interrupted = CONTINUE, not repeat', smart.continueRun === true);
    ok('…and it carries the words to send', !!smart.promptTemplate
        && /without redoing work that is already done/i.test(smart.promptTemplate));
    ok('…and the line calls it a continuation', /continue 1 of 6/.test(smart.why));

    const fresh = R.retryDecision(
        { max: 6, delayMin: 40, behavior: 'smart' },
        { attempt: 0, output: LIMIT, progress: { assistantSteps: 0, toolCalls: 0 } });
    ok('‼️ smart + nothing started = an ORDINARY retry of the original prompt',
        fresh.retry === true && !fresh.continueRun);

    // The unknown branch — the one that must never resend the original prompt.
    const held = R.retryDecision(
        { max: 6, delayMin: 40, behavior: 'smart' }, { attempt: 0, output: LIMIT });
    ok('‼️ smart + unknown = HELD by default, never a blind repeat',
        held.retry === true && held.hold === 'park' && !held.continueRun);
    ok('…and the hold says what it is waiting for', /cannot yet tell whether/.test(held.why));

    ok('unknownProgressFallback "simple" opts back into the old behaviour',
        !R.retryDecision({ max: 6, delayMin: 40, behavior: 'smart', unknownProgressFallback: 'simple' },
            { attempt: 0, output: LIMIT }).hold);
    ok('…"stop" refuses the retry and says why',
        R.retryDecision({ max: 6, delayMin: 40, behavior: 'smart', unknownProgressFallback: 'stop' },
            { attempt: 0, output: LIMIT }).retry === false);
    ok('…"ask" holds it and says the user is the one deciding',
        /you asked to be the one who decides/.test(
            R.retryDecision({ max: 6, delayMin: 40, behavior: 'smart', unknownProgressFallback: 'ask' },
                { attempt: 0, output: LIMIT }).why));

    // Reset-aware and smart are independent dimensions and must compose: WHEN
    // it goes and WHAT it sends are two different questions.
    const both = R.retryDecision(
        { max: 6, delayMin: 40, behavior: 'smart', resetAware: true, safetyBufferMin: 3 },
        {
            attempt: 0, output: LIMIT, progress: { toolCalls: 269 },
            now: Date.UTC(2026, 7, 14, 3, 0), engineResetAt: Date.UTC(2026, 7, 14, 4, 0)
        });
    ok('‼️ waiting for the window and continuing the conversation are independent',
        both.continueRun === true && both.notBefore === Date.UTC(2026, 7, 14, 4, 0) + 3 * 60_000);

    // =======================================================================
    // ‼️ S-64 — THE ONE INTERRUPTED RUN THAT IS NEVER RESUMED.
    //
    // Smart continue is right about interrupted work and wrong about exactly
    // one run: the one whose window had reached the handover line. The law is
    // explicit — the next run is a FRESH session that starts from the note,
    // never a resume of the saturated one — and resuming it puts the new turn
    // into a window that was already full, walking straight back into the wall
    // the retry was sent to escape.
    // =======================================================================
    const told = R.retryDecision(
        { max: 6, delayMin: 40, behavior: 'smart' },
        {
            attempt: 0, output: LIMIT, progress: { toolCalls: 269 },
            handover: { told: true, pct: 41 }
        });
    ok('‼️ a run that was told to hand over is NOT continued, however much work it did',
        told.retry === true && told.continueRun !== true && !told.promptTemplate);
    ok('…the row still calls it a retry, so nobody reads it as a continuation',
        /retry 1 of 6/.test(told.why) && !/continue 1 of 6/.test(told.why));
    ok('…and the record says which rule stopped the continuation, with the reading',
        /told to hand over at 41%/.test(told.why)
        && /saturated conversation is never resumed/.test(told.why));
    ok('…and names the note when one closed it',
        /2026-09-17_devir_05\.md closed it/.test(R.retryDecision(
            { max: 6, delayMin: 40, behavior: 'smart' },
            {
                attempt: 0, output: LIMIT, progress: { toolCalls: 269 },
                handover: { told: true, note: '2026-09-17_devir_05.md' }
            }).why));
    ok('‼️ `told: false` is not a handover — the continuation stands',
        R.retryDecision({ max: 6, delayMin: 40, behavior: 'smart' },
            {
                attempt: 0, output: LIMIT, progress: { toolCalls: 269 },
                handover: { told: false }
            }).continueRun === true);
    ok('‼️ knowing the window was full says nothing about whether the work landed — unknown still HOLDS',
        (() => {
            const h = R.retryDecision({ max: 6, delayMin: 40, behavior: 'smart' },
                { attempt: 0, output: LIMIT, handover: { told: true } });
            return h.hold === 'park' && h.continueRun !== true;
        })());
    ok('‼️ a SIMPLE policy is untouched by it — it never continued anything to begin with',
        (() => {
            const s = R.retryDecision({ max: 6, delayMin: 40 },
                { attempt: 0, output: LIMIT, progress: { toolCalls: 269 }, handover: { told: true, pct: 41 } });
            return s.retry === true && !s.continueRun && !/told to hand over/.test(s.why);
        })());
}

// ===========================================================================
// 4) THE CONTINUATION TEXT — WHICH ONE, AND WITH WHAT IN IT
// ===========================================================================
{
    const p = {
        continuationPrompt: 'devam et', continuationPrompt2: 'ikinci tur',
        continuationPromptLater: 'sonraki turlar'
    };
    ok('the 1st, 2nd and 3rd+ pick-ups each have their own words',
        R.continuationPromptFor(p, 1) === 'devam et'
        && R.continuationPromptFor(p, 2) === 'ikinci tur'
        && R.continuationPromptFor(p, 4) === 'sonraki turlar');
    ok('…and each falls back one step at a time rather than to the built-in default',
        R.continuationPromptFor({ continuationPrompt: 'tek' }, 3) === 'tek');
    ok('an empty policy uses the documented default',
        R.continuationPromptFor({}, 1) === R.DEFAULT_CONTINUATION_PROMPT);
    ok('‼️ …and the default tells the engine to READ before it writes',
        /Read the transcript/i.test(R.DEFAULT_CONTINUATION_PROMPT));

    ok('placeholders are filled',
        R.fillContinuation('{taskTitle} · {attempt}', { taskTitle: 'Gece', attempt: '2' })
        === 'Gece · 2');
    ok('‼️ an unknown placeholder is LEFT IN rather than silently blanked',
        R.fillContinuation('{taskTitle} · {nope}', { taskTitle: 'Gece' }) === 'Gece · {nope}');
}

// ===========================================================================
// 5) NORMALIZE — SMART IS OPT-IN AND ONLY THE WORD TURNS IT ON
// ===========================================================================
{
    const beh = (raw) => (R.normalizeRetry(raw) || {}).behavior;
    ok('‼️ only the word "smart" turns it on',
        beh({ behavior: 'smart' }) === 'smart'
        && beh({ behavior: true }) === undefined
        && beh({ behavior: 'SMART' }) === undefined
        && beh({ max: 3 }) === undefined);
    // ‼️ …and a policy whose ONLY field was a bad `behavior` normalises to
    // nothing at all, which is the same as never having stated one.
    ok('a policy that says only a bad behaviour is no policy',
        R.normalizeRetry({ behavior: 'sort-of' }) === undefined);
    const fb = (raw) => (R.normalizeRetry(raw) || {}).unknownProgressFallback;
    ok('an unrecognised fallback is dropped rather than half-applied',
        fb({ unknownProgressFallback: 'maybe' }) === undefined
        && fb({ unknownProgressFallback: 'ask' }) === 'ask');
    ok('a continuation prompt is capped, not refused',
        R.normalizeRetry({ continuationPrompt: 'x'.repeat(5000) }).continuationPrompt.length
        === R.RETRY_PROMPT_MAX_CHARS);
    // resolveRetry: a run stating only "wait 5 minutes" must still inherit the
    // user's smart setting, or a partial policy silently switches it off.
    ok('‼️ a partial run policy inherits the user\'s behaviour rather than resetting it',
        R.resolveRetry({ delayMin: 5 }, { behavior: 'smart', continuationPrompt: 'sürdür' })
            .behavior === 'smart');
}

// ===========================================================================
// 6) THE MANAGER — THE ROW, THE HOLD, AND THE RELEASE
// ===========================================================================
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-smart-'));
    const store = path.join(dir, 'farm-tasks.json');
    const agent = { id: 'a1', name: 'developer', dir, normDir: dir.replace(/\\/g, '/').toLowerCase() };
    const outFile = path.join(dir, 'out.md');
    fs.writeFileSync(outFile, LIMIT, 'utf8');
    fs.writeFileSync(store, JSON.stringify({
        tasks: [{
            id: 't1', agentId: 'a1', agentName: 'developer', title: 'Gece — dört kalemi bitir',
            prompt: 'M-10 M-11 U-56 S-19 tamamla', mode: 'headless', status: 'failed',
            createdAt: 1, startedAt: 1000, endedAt: 1000 + 45 * 60_000,
            outputFile: outFile, engine: 'claude',
            retry: { max: 6, delayMin: 40, behavior: 'smart' }
        }],
        schedules: [], templates: [], workflows: [], triggers: []
    }), 'utf8');

    const tm = new TaskManager(store, () => [agent], () => false, () => '', {});
    const t1 = tm.tasks.find(x => x.id === 't1');

    // Before any evidence: unknown, and the row says so rather than "nothing".
    ok('a failed run with no bound transcript reads as "not known yet"',
        describeFailurePhase(Object.assign({}, t1, { failurePhase: 'unknown' }))
            .indexOf('not known') > 0);

    // S-31 hands over the evidence.
    const changed = tm.setRunProgress('t1', {
        sessionId: '190e5baf', file: 'C:/t/190e5baf.jsonl', assistantSteps: 120, toolCalls: 269
    });
    ok('‼️ the evidence upgrades the phase without a rerun', changed === true
        && tm.tasks[0].failurePhase === 'interrupted');
    ok('…and the run\'s own session id is recorded, which is what a continuation resumes',
        tm.tasks[0].runSessionId === '190e5baf');
    ok('…and the row sentence contradicts the old one out loud',
        /CUT OFF, not untouched/.test(describeFailurePhase(tm.tasks[0])));
    ok('…and it is written down as an event, not only in memory',
        (tm.tasks[0].events || []).some(e => /what it managed/.test(e.note || '')));
    ok('re-stating the same evidence changes nothing',
        tm.setRunProgress('t1', {
            sessionId: '190e5baf', file: 'C:/t/190e5baf.jsonl', assistantSteps: 120, toolCalls: 269
        }) === false);
    ok('a run that SUCCEEDED is given no phase — the question does not apply',
        (() => {
            tm.tasks[0].status = 'done';
            tm.tasks[0].failurePhase = undefined;
            tm.setRunProgress('t1', { assistantSteps: 1, toolCalls: 2 });
            const none = tm.tasks[0].failurePhase === undefined;
            tm.tasks[0].status = 'failed';
            tm.tasks[0].failurePhase = 'interrupted';
            return none;
        })());
    tm.dispose();

    // -----------------------------------------------------------------------
    // ‼️ THE HELD RETRY, RELEASED BY THE ANSWER IT WAS WAITING FOR.
    //
    // This is the ordinary sequence and not an edge case: the run fails, the
    // retry is decided immediately, and the transcript is bound a beat later.
    // So the retry is created HELD and remade once the evidence lands.
    // -----------------------------------------------------------------------
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'af-held-'));
    const store2 = path.join(dir2, 'farm-tasks.json');
    const out2 = path.join(dir2, 'out.md');
    fs.writeFileSync(out2, LIMIT, 'utf8');
    const policy = { max: 6, delayMin: 40, behavior: 'smart', continuationPrompt: 'devam: {progressSummary}' };
    fs.writeFileSync(store2, JSON.stringify({
        tasks: [
            {
                id: 'p1', agentId: 'a1', agentName: 'developer', title: 'Gece (retry 1)',
                prompt: 'özgün iş', mode: 'headless', status: 'failed', createdAt: 1,
                startedAt: 1000, endedAt: 1000 + 45 * 60_000, outputFile: out2, engine: 'claude',
                retry: policy, retryOf: 'p0', retryAttempt: 1, failurePhase: 'unknown'
            },
            {
                id: 'p2', agentId: 'a1', agentName: 'developer', title: 'Gece (retry 2)',
                prompt: 'özgün iş', mode: 'headless', status: 'queued', createdAt: 2,
                engine: 'claude', retry: policy, retryOf: 'p0', retryAttempt: 2,
                deferredCode: 'progress:unknown', deferredReason: 'waiting for evidence', parkEpisode: 1
            }
        ],
        schedules: [], templates: [], workflows: [], triggers: []
    }), 'utf8');
    const tm2 = new TaskManager(store2, () => [agent], () => false, () => '', {});
    tm2.setRunProgress('p1', {
        sessionId: '190e5baf', file: 'C:/t/190e5baf.jsonl', assistantSteps: 120, toolCalls: 269
    });
    const held = tm2.tasks.find(x => x.id === 'p2');
    ok('‼️ the held retry is released once the evidence lands',
        !held.deferredCode && held.status === 'queued');
    ok('‼️ …as a CONTINUATION of that run\'s own conversation',
        held.resumeSessionId === '190e5baf' && held.continuationOf === 'p1');
    ok('…the row says continue rather than retry', /\(continue 2\)$/.test(held.title));
    ok('‼️ …and the ORIGINAL prompt is not what gets sent',
        held.prompt !== 'özgün iş' && /^devam:/.test(held.prompt));
    ok('…with the placeholder filled from what was actually measured',
        /269 tool call/.test(held.prompt));
    ok('…and the release is on the record, with the reason',
        (held.events || []).some(e => /released — the run it follows DID work/.test(e.note || '')));
    tm2.dispose();

    // ‼️ AND THE OTHER ANSWER: nothing had started, so the original prompt IS
    // the right thing to send and no conversation is resumed.
    fs.writeFileSync(store2, JSON.stringify({
        tasks: [
            {
                id: 'p1', agentId: 'a1', agentName: 'developer', title: 'Gece (retry 1)',
                prompt: 'özgün iş', mode: 'headless', status: 'failed', createdAt: 1,
                startedAt: 1000, endedAt: 1000 + 60_000, outputFile: out2, engine: 'claude',
                retry: policy, retryOf: 'p0', retryAttempt: 1, failurePhase: 'unknown'
            },
            {
                id: 'p2', agentId: 'a1', agentName: 'developer', title: 'Gece (retry 2)',
                prompt: 'özgün iş', mode: 'headless', status: 'queued', createdAt: 2,
                engine: 'claude', retry: policy, retryOf: 'p0', retryAttempt: 2,
                deferredCode: 'progress:unknown', deferredReason: 'waiting', parkEpisode: 1
            }
        ],
        schedules: [], templates: [], workflows: [], triggers: []
    }), 'utf8');
    const tm3 = new TaskManager(store2, () => [agent], () => false, () => '', {});
    tm3.setRunProgress('p1', { sessionId: 'abc', assistantSteps: 0, toolCalls: 0 });
    const plain = tm3.tasks.find(x => x.id === 'p2');
    ok('‼️ nothing started = released as an ordinary retry, no conversation resumed',
        !plain.deferredCode && !plain.resumeSessionId && plain.prompt === 'özgün iş');
    ok('…and the row still says retry', /\(retry 2\)$/.test(plain.title));
    tm3.dispose();

    // ‼️ `ask` IS THE USER'S OWN HOLD. Evidence arriving answers the machine's
    // question, not theirs, so it must not release the row behind their back.
    fs.writeFileSync(store2, JSON.stringify({
        tasks: [
            {
                id: 'p1', agentId: 'a1', agentName: 'developer', title: 'Gece (retry 1)',
                prompt: 'özgün iş', mode: 'headless', status: 'failed', createdAt: 1,
                startedAt: 1000, endedAt: 1000 + 45 * 60_000, outputFile: out2, engine: 'claude',
                retry: policy, retryOf: 'p0', retryAttempt: 1, failurePhase: 'unknown'
            },
            {
                id: 'p2', agentId: 'a1', agentName: 'developer', title: 'Gece (retry 2)',
                prompt: 'özgün iş', mode: 'headless', status: 'queued', createdAt: 2,
                engine: 'claude', retry: policy, retryOf: 'p0', retryAttempt: 2,
                deferredCode: 'progress:ask', deferredReason: 'waiting for you', parkEpisode: 1
            }
        ],
        schedules: [], templates: [], workflows: [], triggers: []
    }), 'utf8');
    const tm4 = new TaskManager(store2, () => [agent], () => false, () => '', {});
    tm4.setRunProgress('p1', { sessionId: '190e5baf', assistantSteps: 9, toolCalls: 9 });
    ok('‼️ a hold the USER asked for is not lifted by the machine',
        tm4.tasks.find(x => x.id === 'p2').deferredCode === 'progress:ask');
    tm4.dispose();

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
    try { fs.rmSync(dir2, { recursive: true, force: true }); } catch { /* temp */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
