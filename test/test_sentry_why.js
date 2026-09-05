// ‼️ X-195 — WHY THIS ROUND OPENED ON THESE WORDS, AND WHAT IT COST.
//
// The rounds table shows status, account and duration; NOTHING anywhere says
// why a round was given the prompt it was given. "Sessiz durma yasaktır" is a
// rule the round obeys on the session side and has never obeyed on the prompt
// side — a night of eight rounds leaves eight prompts nobody can account for.
//
// This is the RECORD those surfaces will draw. Pure: it takes the verdict, the
// leader's outcome and the words that were built, and answers with one object
// that can sit on a task row and outlive the closure that made it.
'use strict';
const fs = require('fs');
const path = require('path');
const { roundWhy, whyShorthand } = require(path.resolve(__dirname, '../out/core/sentryWhy.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const verdict = (over) => Object.assign({
    verdict: 'mechanical', fired: [], problems: [], why: 'no condition fired'
}, over);

// ---- the mechanical round: free, and still accountable ---------------------
{
    const w = roundWhy({
        verdict: verdict(),
        prompt: 'Continue X-194 from the handover note.\nThe tree is clean.',
        outcome: 'clean-handover'
    });
    ok('a mechanical round records the path it took', w.path === 'mechanical');
    ok('…the diagnosis its template was chosen by', w.outcome === 'clean-handover');
    // ‼️ THE FIRST LINE ONLY. The whole prompt is on the task row already; a
    // second copy inside the record is the same text stored twice and the copy
    // is what goes stale when the row is edited.
    ok('‼️ …and the FIRST LINE of the words it opened on, never the whole prompt',
        w.opening === 'Continue X-194 from the handover note.');
    ok('…with no leader cost, because no leader ran', w.assist === undefined);
    ok('a mechanical round names no conditions', w.fired.length === 0);
}

// ---- the leader round: what woke it, and the bill --------------------------
{
    const assist = { model: 'haiku', ms: 4200, costUsd: 0.031, at: 111, ok: true };
    const w = roundWhy({
        verdict: verdict({ verdict: 'leader', fired: ['no-handover', 'dirty-repo'] }),
        leader: { path: 'leader', assist, why: 'the leader wrote the next round', announce: false },
        prompt: 'Find where 2280dda6 stopped, then finish X-194.',
        outcome: 'nothing-to-continue'
    });
    ok('a leader round records that the leader wrote the words', w.path === 'leader');
    ok('‼️ …and NAMES the conditions that woke it, in the order they were written',
        w.fired.join(',') === 'no-handover,dirty-repo');
    ok('…and carries the bill: which model, how long, how much, and whether it worked',
        w.assist.model === 'haiku' && w.assist.costUsd === 0.031 && w.assist.ok === true);
}

// ---- ‼️ the leader that was ASKED FOR and did not write --------------------
//
// The verdict said leader and the outcome says mechanical: the turn timed out,
// refused, answered prose or ran out of budget. That round IS a template round
// and its record has to say so — while still naming what woke it and what the
// attempt cost, because the money was spent either way.
{
    const assist = { model: 'haiku', ms: 120000, costUsd: 0.02, at: 1, ok: false, note: 'timed out' };
    const w = roundWhy({
        verdict: verdict({ verdict: 'leader', fired: ['round-failed'] }),
        leader: { path: 'mechanical', assist, why: 'the leader turn timed out', announce: true },
        prompt: 'Continue.',
        outcome: 'hit-the-wall'
    });
    ok('‼️ the path is what ACTUALLY built the words, not what was asked for',
        w.path === 'mechanical');
    ok('…and it still names what woke the leader and what the failed turn cost',
        w.fired.join(',') === 'round-failed' && w.assist.ok === false && w.assist.costUsd === 0.02);
    ok('…and says, in one sentence, why the words are the template\'s after all',
        /timed out/.test(w.why));
}

// ---- a condition nobody could judge is never silent ------------------------
{
    const w = roundWhy({
        verdict: verdict({ problems: ['condition "c2" names no field'] }),
        prompt: 'x', outcome: 'item-done'
    });
    ok('a condition that could not be judged travels with the round, by name',
        w.problems.length === 1 && /c2/.test(w.problems[0]));
}

// ---- SHORTHAND: the badge on a narrow row ----------------------------------
{
    // The rounds table has five columns and no room for a sentence, so the row
    // carries the shortest unambiguous mark and the panel carries the rest.
    ok('a leader round is marked L', whyShorthand({ path: 'leader', fired: ['a'] }) === 'L');
    ok('a mechanical round is marked M', whyShorthand({ path: 'mechanical', fired: [] }) === 'M');
    // ‼️ THE THIRD STATE HAS ITS OWN MARK. A round that woke the leader and got
    // nothing usable is not the same as one that never asked, and reading them
    // both as "M" hides the only failure that costs money without buying words.
    ok('‼️ a leader that was asked and did not deliver is marked M!',
        whyShorthand({ path: 'mechanical', fired: ['a'], assist: { ok: false } }) === 'M!');
    ok('nothing recorded is nothing claimed', whyShorthand(undefined) === '');
}

// ---- the FIRST round of a night, which no verdict ever judged --------------
{
    // ‼️ There is nothing to evaluate before a session has finished, so the
    // opening round of a campaign has no verdict at all. Requiring one would
    // have forced the writer to invent an empty verdict, and an invented
    // verdict is indistinguishable on the row from a policy that ran and fired
    // nothing — which is the confusion this whole record exists to remove.
    const w = roundWhy({ prompt: 'Take X-178 and work through it.\nRead the handover first.' });
    ok('a round with no verdict is recorded, not refused', !!w);
    ok('…as mechanical, because no leader turn was taken', w.path === 'mechanical');
    ok('…with nothing fired and nothing unjudged, rather than undefined',
        Array.isArray(w.fired) && !w.fired.length
        && Array.isArray(w.problems) && !w.problems.length);
    ok('…and the first line of the words it opened on', w.opening === 'Take X-178 and work through it.');
    ok('…and no assist, because nothing was spent', w.assist === undefined);
}

// ---- ‼️ THE WRITER, which is the half that was missing ---------------------
//
// `roundWhy` was written, tested and called from NOWHERE — a pure module that
// produced a record nothing ever built (Principle 1). The record is made at the
// one moment both halves are in hand, in `sentryTick`, and carried on the round
// spec to `openSentryRound`, which is one scope down from the block that
// measures it. That wiring is the item, so it is what is pinned here.
{
    const ext = fs.readFileSync(path.resolve(__dirname, '../src/extension.ts'), 'utf8');
    const has = (t) => ext.includes(t);
    ok('‼️ the record is BUILT, on the round that is being opened',
        has('why: roundWhy({') && has('prompt: step.round.prompt,'));
    ok('…and handed to the round spec, which is what writes it to the row',
        has('row = taskManager.openSentryRound(agent, {'));
    ok('…out of the verdict and the diagnosis, kept past the block that measured them',
        has('roundVerdict = verdict;') && has('roundOutcome = diagnosis.outcome;'));
    ok('‼️ …and the PATH is the leader\'s real outcome, never the verdict\'s wish',
        has('...(leader ? { leader } : {}),'));
    ok('the mark is derived by the core function, so the page keeps no second copy',
        has('whyShorthand(t.sentryWhy)'));
    ok('…and an agent can read the same account off the bridge',
        has('why: t.sentryWhy, whyMark: whyShorthand(t.sentryWhy)'));
}

console.log(`test_sentry_why: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
