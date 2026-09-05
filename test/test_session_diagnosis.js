// X-174 — WHAT A FINISHED SESSION LEFT BEHIND, WITHOUT ASKING A MODEL.
//
// The sentry's first question about a session that has just ended is "can the
// next one pick this up, and from what". Almost all of that is MEASUREMENT:
// a handover note either exists or it does not, a repo is either clean or it is
// not, an item either closed or it did not. The precedent is automation.ts —
// asking a model a question that could have been counted burned $70.90 over
// five nights.
//
// So this module reasons and never reads: every fact is handed to it. That is
// what makes the "no model call" claim checkable rather than promised.
//
// ‼️ AND IT NEVER GUESSES. A fact that was not measured is not the same as a
// fact that came back empty: `answerFiles: undefined` means nobody listed the
// folder, `answerFiles: []` means it was listed and there was nothing in it.
// The first goes on `unknown` — which is precisely the list X-175 reads to
// decide whether a model is worth calling at all — and the second is evidence.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const D = require(path.join(__dirname, '..', 'out', 'core', 'sessionDiagnosis.js'));
const { diagnoseSession, DEFAULT_DIAGNOSIS_POLICY, parseHandoverName, handoverFor,
    handoverName, nextHandoverSeq } = D;

const SID = 'dc980395-1e2f-4a7b-9c33-8b21aa77c001';
const NOTE = '2026-09-04_devir_03_dc980395_x172-kapandi.md';
const OTHER = '2026-09-04_devir_02_e4965de9_x169-kapandi-x172-basladi.md';

/** The ordinary shape: everything measured, nothing missing. */
const facts = (over) => Object.assign({
    sessionId: SID,
    answerFiles: [OTHER],
    repos: [{ path: 'D:/repo', dirty: 0 }],
    codes: [{ code: 'X-174', closed: false }],
    progress: { assistantSteps: 12, toolCalls: 47 },
    output: ''
}, over || {});

// ---- the note's name is one rule, owned here -------------------------------
{
    const n = parseHandoverName(NOTE);
    ok('the fixed name is read apart', !!n && n.date === '2026-09-04' && n.seq === 3
        && n.session === 'dc980395' && n.topic === 'x172-kapandi');
    ok('a file that is not a handover note is not one',
        !parseHandoverName('2026-09-04_rapor_x172.md') && !parseHandoverName('notes.md'));
    ok('the note is found by the session it names, not by position',
        handoverFor(SID, [OTHER, NOTE]).file === NOTE);
    ok('...and a folder that names another session has none for this one',
        !handoverFor(SID, [OTHER]));
    // ‼️ X-175 has to BUILD this name. Reading and writing it in one place is
    // the only way the pattern cannot drift between the two halves.
    ok('the same rule builds the name it reads', handoverName({
        date: '2026-09-04', seq: 3, sessionId: SID, topic: 'X172 kapandı'
    }) === '2026-09-04_devir_03_dc980395_x172-kapandi.md');
    ok('the daily counter counts THAT day and starts at 01',
        nextHandoverSeq([OTHER, NOTE], '2026-09-04') === 4
        && nextHandoverSeq([OTHER, NOTE], '2026-09-05') === 1);
}

// ---- the four answers ------------------------------------------------------
{
    const done = diagnoseSession(facts({ codes: [{ code: 'X-172', closed: true }] }));
    ok('a closed item on a clean repo is finished work', done.outcome === 'item-done');
    ok('...and it says which item, because a verdict with no referent is a mood',
        done.evidence.some(e => /X-172/.test(e)));

    const handed = diagnoseSession(facts({ answerFiles: [OTHER, NOTE] }));
    ok('an open item with a note naming this session is a clean handover',
        handed.outcome === 'clean-handover' && handed.handover.file === NOTE);

    const wall = diagnoseSession(facts({ output: 'You have hit your session limit. Try again later.' }));
    ok('work was done, nothing closed, no note — that is the wall',
        wall.outcome === 'hit-the-wall' && wall.limit === true);
    ok('...and the engine\'s own sentence is the evidence, not a guess',
        wall.evidence.some(e => /plan window|session limit/i.test(e)));

    const idle = diagnoseSession(facts({
        progress: { assistantSteps: 0, toolCalls: 0 }, codes: []
    }));
    ok('a session that produced nothing has its own answer',
        idle.outcome === 'nothing-to-continue');
    ok('...which is NOT the wall — an alarm nobody needs is an alarm nobody reads',
        idle.limit === false && !/wall/.test(idle.rule));
}

// ---- the ladder is policy, not a rule carved into the code -----------------
{
    // The user approved these as DEFAULTS, and said out loud they must stay
    // adjustable: a campaign decides how strict its own sentry is.
    ok('the defaults are the ones that were agreed',
        DEFAULT_DIAGNOSIS_POLICY.closedItemNeedsCleanRepo === true
        && DEFAULT_DIAGNOSIS_POLICY.idleIsItsOwnOutcome === true
        && DEFAULT_DIAGNOSIS_POLICY.handoverBeatsClosedItem === false
        && DEFAULT_DIAGNOSIS_POLICY.dirtyFloor === 0);

    const dirty = facts({ codes: [{ code: 'X-172', closed: true }], repos: [{ path: 'D:/repo', dirty: 3 }] });
    ok('by default a closed item with uncommitted work is NOT a finish',
        diagnoseSession(dirty).outcome === 'hit-the-wall');
    ok('...and with a note explaining it, it is a handover',
        diagnoseSession(Object.assign({}, dirty, { answerFiles: [NOTE] })).outcome === 'clean-handover');
    ok('a campaign may say a closed item is enough on its own',
        diagnoseSession(dirty, { closedItemNeedsCleanRepo: false }).outcome === 'item-done');
    ok('...and may raise the floor instead of switching the rule off',
        diagnoseSession(dirty, { dirtyFloor: 5 }).outcome === 'item-done');
    ok('a campaign may put the note above the closed item',
        diagnoseSession(Object.assign({}, dirty, { repos: [{ path: 'D:/repo', dirty: 0 }], answerFiles: [NOTE] }),
            { handoverBeatsClosedItem: true }).outcome === 'clean-handover');
    ok('a campaign may refuse the fourth answer and take the three',
        diagnoseSession(facts({ progress: { assistantSteps: 0, toolCalls: 0 }, codes: [] }),
            { idleIsItsOwnOutcome: false }).outcome === 'hit-the-wall');
    ok('‼️ every verdict carries the policy it was produced under',
        diagnoseSession(facts(), { dirtyFloor: 5 }).policy.dirtyFloor === 5
        && diagnoseSession(facts()).policy.dirtyFloor === 0);
    ok('...and names the rule that fired, so a verdict can be argued with',
        typeof diagnoseSession(facts()).rule === 'string' && diagnoseSession(facts()).rule.length > 0);
}

// ---- ‼️ WHAT WAS NOT MEASURED IS NOT A FACT --------------------------------
//
// This is the half that keeps the module honest, and it is the half X-175 acts
// on: a model is worth calling exactly when `unknown` is not empty.
{
    const blind = diagnoseSession({ sessionId: SID });
    ok('nothing measured means nothing claimed', blind.unknown.length >= 3);
    ok('...and it says WHICH facts are missing, by name',
        blind.unknown.some(u => /handover|answers/i.test(u))
        && blind.unknown.some(u => /transcript|what the session/i.test(u))
        && blind.unknown.some(u => /repo/i.test(u)));
    ok('...and does not pretend a folder nobody listed is empty',
        !blind.evidence.some(e => /no handover note/i.test(e)));
    ok('an unlisted folder cannot be called idle either — that would be a guess',
        blind.outcome !== 'nothing-to-continue');

    const listed = diagnoseSession(facts({ answerFiles: [] }));
    ok('‼️ a folder that WAS listed and came back empty is evidence, not unknown',
        listed.evidence.some(e => /no handover note/i.test(e))
        && !listed.unknown.some(u => /handover|answers/i.test(u)));

    const noProgress = diagnoseSession(facts({ progress: undefined }));
    ok('an unread transcript is unknown, and the verdict says so rather than idle',
        noProgress.unknown.some(u => /transcript/i.test(u))
        && noProgress.outcome !== 'nothing-to-continue');
}

// ---- the figures a person reads --------------------------------------------
{
    const d = diagnoseSession(facts({
        quotaPercent: 91,
        repos: [{ path: 'D:/repo', dirty: 2 }, { path: 'D:/other', dirty: 0 }]
    }));
    ok('every repo that was measured is in the evidence, dirty or clean',
        d.evidence.filter(e => /D:\/repo|D:\/other/.test(e)).length === 2);
    ok('the five-hour figure is carried when it was read', d.evidence.some(e => /91%/.test(e)));
    ok('...and is not invented when it was not',
        !diagnoseSession(facts()).evidence.some(e => /%/.test(e)));
    ok('the transcript counters are said as figures, not as a story',
        d.evidence.some(e => /12/.test(e) && /47/.test(e)));
    ok('every verdict has one line a person can read', typeof d.why === 'string' && d.why.length > 10);
}

// ---- X-189: the search that replaced the one folder and the one pattern ----
//
// `answerFiles` was one folder listed under one millimetric name pattern. It
// still works, because a caller that only has that is not wrong — it is just
// looking in one place. What is new is that the host may hand in a whole SEARCH
// (`handoverSearch`, from `core/handoverDiscovery`), and then the verdict says
// where the note was found and how sure it is, which is what a condition reads.
{
    const { discoverHandover } = require(path.join(__dirname, '..', 'out', 'core', 'handoverDiscovery.js'));
    const at = { sessionId: SID, today: '2026-09-04', now: new Date(2026, 8, 4, 23, 0, 0).getTime() };

    const found = discoverHandover([
        { source: 'transcript', dir: 'D:/notes', files: ['dc980395-devir.md'], authored: ['dc980395-devir.md'] }
    ], at);
    const d = diagnoseSession(facts({ answerFiles: undefined, handoverSearch: found }));
    ok('a note the session wrote under a name the old pattern refused is now a clean handover',
        d.outcome === 'clean-handover' && d.handover.file === 'dc980395-devir.md');
    ok('...and the verdict says which source it came from and how sure it is',
        d.handover.source === 'transcript' && typeof d.handover.score === 'number');
    ok('...and the search does not leave the note unknown',
        !d.unknown.some(u => /handover|answers/i.test(u)));
    ok('...and what the search saw is evidence, not a second story',
        found.evidence.every(e => d.evidence.includes(e)));

    const nowhere = discoverHandover([{ source: 'fallback', dir: 'D:/vault', files: [OTHER] }], at);
    ok('a search that read a folder and found nothing is a MEASUREMENT',
        diagnoseSession(facts({ answerFiles: undefined, handoverSearch: nowhere }))
            .unknown.every(u => !/handover|answers/i.test(u)));

    const blind = discoverHandover([{ source: 'configured', skipped: '${vault} has nothing behind it' }], at);
    ok('...and a search that could read nowhere is NOT — it goes on unknown, in its own words',
        diagnoseSession(facts({ answerFiles: undefined, handoverSearch: blind }))
            .unknown.some(u => /\$\{vault\}/.test(u)));

    ok('the search outranks the legacy folder listing when both are handed in',
        diagnoseSession(facts({ answerFiles: [OTHER, NOTE], handoverSearch: nowhere })).handover === undefined);
    ok('...and the legacy listing still stands alone when there is no search',
        diagnoseSession(facts({ answerFiles: [OTHER, NOTE] })).handover.file === NOTE);
}

// ---- the limit sentence is retry.ts', not a second copy --------------------
{
    const R = require(path.join(__dirname, '..', 'out', 'core', 'retry.js'));
    const sentence = 'Claude usage limit reached. Your limit will reset at 3pm.';
    ok('‼️ the limit is read with the function that already knows every engine\'s words',
        R.isLimitFailure(sentence) === true
        && diagnoseSession(facts({ output: sentence })).limit === true);
}

console.log(`test_session_diagnosis: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
