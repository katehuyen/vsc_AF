// X-191 — THE LEADER WAKES, TAKES THE SITUATION IN HAND, AND GOES BACK TO SLEEP.
//
// The defect this ends is the one the whole family was reopened for: `ModelAssist`
// and `modelNeeded()` were WRITTEN and never wired — `sentryStep({…})` has never
// once filled `assist`, so the "sleeping leader agent" the user designed was
// never built at all. What shipped was a template filler that cannot think.
//
// And the reason it was not built is worth keeping in front of us: the
// `automation.ts` precedent burned $70.90 over five nights asking a model
// something that could have been counted. The agent that wrote this family
// over-corrected into "never call a model". ‼️ THE CORRECT ANSWER WAS NEVER
// "DO NOT CALL" — IT IS "GOVERN WHEN, AND HOW MUCH". So every rule below is a
// leash, and each one is tested as a leash:
//
//   · the leader wakes only when a condition fired (X-190 decides that; here it
//     is simply never called otherwise)
//   · the model is cheap by default, and the default is named once
//   · a turn has a time ceiling and a cost ceiling
//   · a campaign has a DAILY budget, and when it is gone the campaign carries on
//     MECHANICALLY rather than stopping — a leash is not a brake on the work
//   · every turn is recorded as a ModelAssist: model, ms, $, ok
//   · N failures in a row drop the mode to mechanical AND SAY SO
//
// ‼️ AND THE LEADER NEVER STOPS THE CAMPAIGN. Unparseable output, a thrown
// runner, a timeout, an empty answer — every one of them falls to the mechanical
// path and is recorded as a fault. A leader that can halt the night is a worse
// failure mode than a leader that is sometimes wrong.
'use strict';
const path = require('path');
const L = require(path.resolve(__dirname, '../out/core/sentryLeader.js'));
const {
    buildLeaderBrief, parseLeaderReply, leaderAllowed, recordLeaderTurn,
    runLeaderTurn, DEFAULT_LEADER_CAPS, MAX_LEADER_PROMPT
} = L;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const TODAY = '2026-09-05';
const NOW = new Date(2026, 8, 5, 7, 30, 0).getTime();

const DIAG = {
    sessionId: '689569e7-94b4-45f9-bb60-4c0f33b2bb5a', session: '689569e7',
    outcome: 'hit-the-wall', rule: 'wall',
    why: 'The session ended with work outstanding and no handover note.',
    evidence: ['D:/repo: 3 uncommitted paths', 'X-189 touched, still open'],
    unknown: ['the transcript was not read, so what the session managed to do is not known'],
    limit: false, policy: {}
};
const VERDICT = {
    verdict: 'leader', fired: ['no-handover', 'dirty-repo'],
    why: 'no-handover and dirty-repo fired', problems: []
};
const BRIEF = {
    diagnosis: DIAG, verdict: VERDICT,
    next: { code: 'X-191', text: 'Leader round and cost governance', effort: 'L' },
    project: 'PRS.MuratVural_DEV_VSC.AgentFarm'
};

// ============================================================== THE BRIEF ====
{
    const b = buildLeaderBrief(BRIEF);
    ok('the brief names the conditions that woke it, by their own ids',
        b.includes('no-handover') && b.includes('dirty-repo'));
    ok('...and carries the verdict a person would read', b.includes(DIAG.why));
    ok('...and the measured evidence', b.includes('3 uncommitted paths'));
    ok('...and the item that is next', b.includes('X-191'));

    // ‼️ X-174's law has to survive INTO the prompt. A fact nobody measured,
    // presented as an absent fact, is how a model is invited to invent one.
    ok('‼️ an unmeasured fact is stated as unmeasured, never as absent',
        /not measured|could not be measured|nobody measured/i.test(b)
        && b.includes('the transcript was not read'));

    ok('the brief asks for the exact shape the parser reads',
        b.includes('"prompt"') && b.includes('"account"') && b.includes('"hold"') && b.includes('"why"'));
    ok('...and says what an unreadable answer costs it, so it does not narrate',
        /mechanical/i.test(b) && /JSON/.test(b));

    ok('‼️ nothing in the brief is a path off this machine — it all comes from the input',
        !/[A-Za-z]:[\\/]|obsidian|Users[\\/]/.test(
            buildLeaderBrief({ diagnosis: { ...DIAG, evidence: [] }, verdict: VERDICT })));
}
{
    const b = buildLeaderBrief({
        ...BRIEF,
        handover: { path: '/notes/devir.md', head: 'Stopped halfway through X-191.' },
        diffStat: ' 3 files changed, 40 insertions(+)',
        accounts: [{ slotId: 'claude-a', percent: 12, usable: true },
            { slotId: 'claude-b', percent: 97, usable: false }]
    });
    ok('a handover note is given with its CONTENTS, not just its path',
        b.includes('/notes/devir.md') && b.includes('Stopped halfway through X-191.'));
    ok('the diff summary rides along', b.includes('3 files changed'));
    ok('the accounts are offered with their quota, since it may pick one',
        b.includes('claude-a') && b.includes('12'));
    ok('...and an unusable one is marked rather than hidden — it may explain a wall',
        b.includes('claude-b'));
}
{
    const b = buildLeaderBrief({ ...BRIEF, instructions: [
        { label: 'gece nöbeti', text: 'Sabaha kadar durma, her kalem sonunda commit at.', when: 'unattended' }
    ] });
    ok('the user\'s own saved instructions are MATERIAL for the leader, not a template',
        b.includes('gece nöbeti') && b.includes('Sabaha kadar durma'));
}
{
    const b = buildLeaderBrief({ ...BRIEF, budget: { day: TODAY, spentUsd: 0.4, turns: 2 } });
    ok('the leader is told it is on a leash, so it can be brief when money is short',
        /0\.4/.test(b) && /budget|spent/i.test(b));
}

// ============================================================== THE REPLY ====
const GOOD = { prompt: 'Carry on from X-191.', account: 'claude-a', hold: false, why: 'the note says so' };
{
    const r = parseLeaderReply(JSON.stringify(GOOD));
    ok('a bare JSON object is read', r.ok && r.decision.prompt === GOOD.prompt);
    ok('...with its account and its reason', r.decision.account === 'claude-a' && r.decision.why === GOOD.why);
}
{
    const r = parseLeaderReply('Here is my decision:\n\n```json\n' + JSON.stringify(GOOD) + '\n```\n');
    ok('a fenced object is read, because a model will fence it', r.ok && r.decision.prompt === GOOD.prompt);
}
{
    const r = parseLeaderReply('I considered {this} and {that}.\n' + JSON.stringify(GOOD) + '\nThat is my answer.');
    ok('a narrated answer gives up its object anyway', r.ok && r.decision.prompt === GOOD.prompt);
}
{
    // The prompt itself is full of braces — the template placeholders the next
    // session's words are made of. A greedy regex would eat itself here.
    const braces = { ...GOOD, prompt: 'Open on {nextCode} — {nextText} (effort {nextEffort}).' };
    const r = parseLeaderReply('thinking...\n' + JSON.stringify(braces));
    ok('‼️ braces INSIDE the prompt do not break the object out of the prose',
        r.ok && r.decision.prompt === braces.prompt);
}
{
    // ‼️ AND THE CASE THAT ACTUALLY NEEDS THE STRING-AWARE SCANNER. Balanced
    // placeholders survive plain brace counting; an UNBALANCED brace inside the
    // prompt does not — and a prompt carrying a snippet of code, or the sentence
    // "close it with a }", is not exotic. (Written after a mutation test showed
    // the placeholder case above passes even with string handling switched off.)
    const lopsided = { ...GOOD, prompt: 'Finish the block: the missing } on line 40.' };
    const r = parseLeaderReply('here you go\n' + JSON.stringify(lopsided));
    ok('‼️ a lone brace inside the prompt does not cut the object short',
        r.ok && r.decision.prompt === lopsided.prompt);
    const opener = parseLeaderReply(JSON.stringify({ ...GOOD, prompt: 'Open the block with { and stop.' }));
    ok('...and neither does a lone opening one', opener.ok && /Open the block/.test(opener.decision.prompt));
}
{
    const r = parseLeaderReply('{"prompt": "first"}\nactually, no:\n{"prompt": "second"}');
    ok('when it changed its mind, the LAST object is the answer',
        r.ok && r.decision.prompt === 'second');
}
{
    const r = parseLeaderReply('I think you should just carry on from the note.');
    ok('prose with no object is refused', !r.ok && !r.decision);
    ok('...in one sentence a person can act on', typeof r.why === 'string' && r.why.length > 10);
}
{
    ok('an object with no prompt is refused — an empty opening is an empty session',
        !parseLeaderReply('{"account":"claude-a","why":"x"}').ok);
    ok('...and so is a blank one', !parseLeaderReply('{"prompt":"   "}').ok);
    ok('nothing at all is refused rather than thrown',
        !parseLeaderReply('').ok && !parseLeaderReply(undefined).ok);
}
{
    const r = parseLeaderReply('{"prompt":"go","account":""}');
    ok('an empty account is nobody, not a slot called empty string', r.ok && r.decision.account === null);
    const n = parseLeaderReply('{"prompt":"go","account":7}');
    ok('...and neither is a number', n.ok && n.decision.account === null);
}
{
    const r = parseLeaderReply('{"prompt":"go","hold":true,"why":"the quota resets in an hour"}');
    ok('the leader may say WAIT, and that is carried through', r.ok && r.decision.hold === true);
    const f = parseLeaderReply('{"prompt":"go","hold":"yes"}');
    ok('...but only when it actually said so', f.ok && f.decision.hold === false);
}
{
    const huge = JSON.stringify({ prompt: 'x'.repeat(MAX_LEADER_PROMPT + 1) });
    const r = parseLeaderReply(huge);
    ok('‼️ an oversized prompt is REFUSED, never silently cut in half',
        !r.ok && /\b(long|large|cap|limit)\b/i.test(r.why));
    ok('...and the cap is a named number, not one buried in a comparison',
        typeof MAX_LEADER_PROMPT === 'number' && MAX_LEADER_PROMPT > 1000);
}

// ============================================================= THE LEASH ====
const CAPS = { ...DEFAULT_LEADER_CAPS };
{
    ok('the cheap model is the DEFAULT, and it is named once',
        DEFAULT_LEADER_CAPS.model === 'haiku');
    ok('...and every leash has a number behind it',
        DEFAULT_LEADER_CAPS.maxSeconds > 0 && DEFAULT_LEADER_CAPS.maxUsd > 0
        && DEFAULT_LEADER_CAPS.dailyUsd > 0 && DEFAULT_LEADER_CAPS.failLimit > 0);
}
{
    const a = leaderAllowed(undefined, CAPS, TODAY);
    ok('a campaign that has never woken its leader may wake it', a.allowed);
    ok('...and is told what it has to spend', a.remainingUsd === CAPS.dailyUsd);
}
{
    const yesterday = { day: '2026-09-04', spentUsd: CAPS.dailyUsd, turns: 9 };
    ok('‼️ the budget is DAILY — yesterday\'s spend does not hold today down',
        leaderAllowed(yesterday, CAPS, TODAY).allowed);
}
{
    const spent = { day: TODAY, spentUsd: CAPS.dailyUsd, turns: 9 };
    const a = leaderAllowed(spent, CAPS, TODAY);
    ok('at the daily budget the leader is refused', !a.allowed);
    ok('...and the refusal says BUDGET, by name', /budget/i.test(a.why));
    ok('...and the user is told, because a campaign silently going stupid is the bug',
        a.announce === true);
    ok('...but only once — a refusal that repeats every round is an alert nobody reads',
        leaderAllowed({ ...spent, announced: true }, CAPS, TODAY).announce === false);
    ok('...and there is nothing left, said as a figure', a.remainingUsd === 0);
}
{
    const broken = { day: TODAY, spentUsd: 0, failStreak: CAPS.failLimit };
    const a = leaderAllowed(broken, CAPS, TODAY);
    ok('‼️ N failed turns in a row drop it to mechanical', !a.allowed);
    ok('...and it SAYS so, rather than quietly going quiet',
        /mechanical/i.test(a.why) && a.announce === true);
    ok('a brake set to zero is no brake, the same convention the round brake uses',
        leaderAllowed(broken, { ...CAPS, failLimit: 0 }, TODAY).allowed);
}
{
    const over = { day: TODAY, spentUsd: 0, log: [{ model: 'haiku', ms: 900, costUsd: CAPS.maxUsd + 1, at: NOW, ok: true }] };
    ok('a turn that blew the per-turn ceiling refuses the NEXT one — money already spent cannot be un-spent',
        !leaderAllowed(over, CAPS, TODAY).allowed);
}

// ============================================================ THE LEDGER ====
{
    const before = { day: TODAY, spentUsd: 0.1, turns: 1, failStreak: 2, log: [] };
    const frozen = JSON.stringify(before);
    const after = recordLeaderTurn(before, { model: 'haiku', ms: 1200, costUsd: 0.05, at: NOW, ok: true }, TODAY);
    ok('a turn adds its cost to today', Math.abs(after.spentUsd - 0.15) < 1e-9 && after.turns === 2);
    ok('a turn that WORKED wipes the failure streak', after.failStreak === 0);
    ok('‼️ the state handed in is never mutated', JSON.stringify(before) === frozen);

    const failed = recordLeaderTurn(after, { model: 'haiku', ms: 300, costUsd: 0, at: NOW, ok: false }, TODAY);
    ok('a turn that failed increases it', failed.failStreak === 1);
    ok('‼️ ...even though it cost nothing — an invisible failure is how a streak never trips',
        failed.turns === 3);

    const rolled = recordLeaderTurn({ day: '2026-09-04', spentUsd: 9, turns: 4 },
        { model: 'haiku', ms: 10, costUsd: 0.01, at: NOW, ok: true }, TODAY);
    ok('crossing midnight starts the day\'s spending again',
        rolled.day === TODAY && Math.abs(rolled.costOfDay ?? rolled.spentUsd) === 0.01);

    let s = { day: TODAY };
    for (let i = 0; i < 12; i++) {
        s = recordLeaderTurn(s, { model: 'haiku', ms: i, costUsd: 0, at: NOW + i, ok: true }, TODAY, 5);
    }
    ok('the log is capped and keeps the NEWEST turns',
        s.log.length === 5 && s.log[s.log.length - 1].ms === 11);
}

// ============================================================== THE TURN ====
const runner = (out) => {
    const f = async (o) => { f.calls.push(o); return typeof out === 'function' ? out(o) : out; };
    f.calls = [];
    return f;
};
const clock = { today: TODAY, now: () => NOW };

(async () => {
    {
        const run = runner({ text: JSON.stringify(GOOD), costUsd: 0.02 });
        const r = await runLeaderTurn(BRIEF, CAPS, run, clock);
        ok('a good turn puts the leader\'s own words in front of the next session',
            r.path === 'leader' && r.decision.prompt === GOOD.prompt);
        ok('...and it is recorded as a ModelAssist, which is the field that was never filled',
            r.assist && r.assist.model === CAPS.model && r.assist.ok === true && r.assist.costUsd === 0.02);
        ok('...and the budget it hands back is the one the caller persists',
            r.budget && Math.abs(r.budget.spentUsd - 0.02) < 1e-9 && r.budget.turns === 1);
        ok('...and the model was asked with the brief, at the cap',
            run.calls.length === 1 && run.calls[0].timeoutMs === CAPS.maxSeconds * 1000
            && run.calls[0].prompt.includes('no-handover'));
    }
    {
        const run = runner({ text: 'I think you should carry on.', costUsd: 0.01 });
        const r = await runLeaderTurn(BRIEF, CAPS, run, clock);
        ok('‼️ PROSE FALLS TO THE MECHANICAL PATH — the leader never stops the campaign',
            r.path === 'mechanical' && !r.decision);
        ok('...and it is recorded as a FAULT that still cost money',
            r.assist.ok === false && r.assist.costUsd === 0.01 && r.budget.failStreak === 1);
        ok('...and says why, so the third one is not a mystery', /json|read/i.test(r.why));
    }
    {
        const run = async () => { throw new Error('claude is not on PATH'); };
        const r = await runLeaderTurn(BRIEF, CAPS, run, clock);
        ok('‼️ A RUNNER THAT THROWS IS CAUGHT — nothing propagates into the night',
            r.path === 'mechanical' && r.assist.ok === false);
        ok('...and the machine\'s own words are kept', /PATH/.test(r.why));
    }
    {
        const run = runner({ text: '', error: 'timed out' });
        const r = await runLeaderTurn(BRIEF, CAPS, run, clock);
        ok('a runner that reports its own failure is believed',
            r.path === 'mechanical' && /timed out/.test(r.why) && r.assist.ok === false);
    }
    {
        const run = runner(() => { throw new Error('must not be called'); });
        const spent = { day: TODAY, spentUsd: CAPS.dailyUsd };
        const r = await runLeaderTurn({ ...BRIEF, budget: spent }, CAPS, run, clock);
        ok('‼️ WITH THE BUDGET GONE THE MODEL IS NEVER CALLED AT ALL',
            run.calls.length === 0 && r.path === 'mechanical');
        ok('...the campaign carries on mechanically rather than stopping', !!r.why);
        ok('...the user is told', r.announce === true);
        ok('...and the budget comes back unchanged, not zeroed by the refusal',
            Math.abs(r.budget.spentUsd - CAPS.dailyUsd) < 1e-9);
    }
    {
        const run = runner({ text: JSON.stringify({ ...GOOD, hold: true, why: 'the quota resets at nine' }), costUsd: 0.01 });
        const r = await runLeaderTurn(BRIEF, CAPS, run, clock);
        ok('the leader may decide to WAIT, and that survives to the caller',
            r.path === 'leader' && r.decision.hold === true);
    }
    {
        const run = runner({ text: JSON.stringify(GOOD), costUsd: CAPS.maxUsd + 5 });
        const r = await runLeaderTurn(BRIEF, CAPS, run, clock);
        ok('a turn that blew the per-turn ceiling is still USED — it is paid for either way',
            r.path === 'leader');
        ok('...but the next one is refused', !leaderAllowed(r.budget, CAPS, TODAY).allowed);
    }
    {
        const run = runner({ text: JSON.stringify(GOOD), costUsd: 0.01 });
        const r = await runLeaderTurn({ ...BRIEF, verdict: { ...VERDICT, verdict: 'mechanical', fired: [] } },
            CAPS, run, clock);
        ok('‼️ A ROUND NOTHING FIRED ON IS FREE — the leader is not even asked',
            run.calls.length === 0 && r.path === 'mechanical');
    }
    {
        const caps = { ...CAPS, model: '' };
        const run = runner({ text: JSON.stringify(GOOD), costUsd: 0.01 });
        await runLeaderTurn(BRIEF, caps, run, clock);
        ok('a campaign that named no model gets the cheap default rather than the fleet\'s',
            run.calls[0].model === DEFAULT_LEADER_CAPS.model);
    }

    console.log(`test_sentry_leader: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
