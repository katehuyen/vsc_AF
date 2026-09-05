// X-176 — THE DRIVER: one round ends, the next one is decided. Still pure.
//
// `sentryStep` is the whole loop the item asks for, with nothing in it that
// touches a disk: measure (the CALLER does that) → diagnose (X-174) → words
// (X-175) → plan (sentryRun) → the row to create. It reads nothing and starts
// nothing, so every rule below is settled for free instead of at three in the
// morning on somebody's quota.
//
//   · ‼️ WHAT NOBODY MEASURED IS NOT A MEASUREMENT. The facts go to
//     `diagnoseSession` exactly as the caller handed them over; the driver adds
//     no defaults of its own. `undefined` and `[]` are the whole of X-174, and
//     a driver that filled the gaps would manufacture a verdict and then open a
//     session on it.
//   · ‼️ THE USER'S HAND OUTRANKS EVERY OTHER RULE. Cancelling the one round
//     that is running is the user saying stop — so the campaign stops. It is
//     not the machine ending a campaign; it is the machine READING the switch.
//   · ‼️ THE FAILURE BRAKE IS NOT A ROUND BUDGET. The user refused a round
//     budget: a campaign that is working carries on for ever. But a campaign
//     whose sessions produce NOTHING, over and over, is a broken setup opening
//     empty sessions all night — and the quota never stops it, because an
//     instant failure spends nothing. The streak resets on the first round that
//     achieves something, and the limit is a SETTING (0 = no brake).
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const {
    sentryStep, applySentryStep, SENTRY_DEFAULT_FAIL_LIMIT, sentryRoundTitle
} = require(path.join(OUT, 'sentryDriver.js'));
const { newSentry, stopSentry } = require(path.join(OUT, 'sentryCampaign.js'));

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const MIN = 60 * 1000;
const SID = '878ae65b-f73a-485b-ae05-df47cbbe6d1d';

const rec = (over) => Object.assign(
    newSentry({ project: 'prj_9ujsbtzr', agent: 'developer' }, NOW), over || {});

const slot = (id, over) => Object.assign({
    slotId: id, engine: 'claude', state: 'ok', percent: 10,
    resetsAt: NOW + 60 * MIN, plan: 'pro', fetchedAt: NOW - MIN
}, over || {});

const NEXT = { code: 'X-177', text: 'NOBET YUZEYI', effort: 'M' };

/** A round that really did something: the item closed and the repo is clean. */
const goodRound = (over) => Object.assign({
    status: 'done',
    code: 'X-176',
    taskId: 't1',
    facts: {
        sessionId: SID,
        answerFiles: [],
        repos: [{ path: 'D:/zone/dev/git/miropharm/vsc_AgentFarm', dirty: 0 }],
        codes: [{ code: 'X-176', closed: true }],
        progress: { assistantSteps: 40, toolCalls: 120 },
        output: ''
    }
}, over || {});

const step = (over) => sentryStep(Object.assign({
    campaign: rec(), usage: [slot('a')], next: NEXT, now: NOW
}, over || {}));

// ---- the first round: the words are the caller's, because nothing preceded --
{
    const s = step({ opening: 'Take X-177 and work through it.' });
    ok('a campaign with no session behind it starts on the words it was given',
        s.plan.action === 'start' && s.round.prompt === 'Take X-177 and work through it.');
    ok('...and there is no verdict, because there was no session to reach one about',
        s.diagnosis === undefined && s.words === undefined);
    ok('...the row is the next round of this campaign, on the code that was picked',
        s.round.round === 1 && s.round.code === 'X-177');
    ok('...and its title says which round and which item, so the board reads as one campaign',
        s.round.title === sentryRoundTitle(1, 'X-177') && /R1/.test(s.round.title) && /X-177/.test(s.round.title));

    const wordless = step({});
    ok('‼️ a first round with no words is REFUSED rather than opening an empty session',
        wordless.plan.action === 'blocked' && wordless.plan.rule === 'no-prompt' && !wordless.round);
}

// ---- a round that ended: measure → diagnose → words → plan -----------------
{
    const s = step({ finished: goodRound(), project: 'PRS.MuratVural_DEV_VSC.AgentFarm' });
    ok('the finished round gets a verdict from the facts it was handed',
        s.diagnosis.outcome === 'item-done' && s.diagnosis.session === '878ae65b');
    ok('...the words that open the next session come from that verdict',
        s.words.when === s.diagnosis.outcome || s.words.when === '*');
    ok('...the item the backlog picked is in them', /X-177/.test(s.round.prompt));
    ok('...and the plan started it', s.plan.action === 'start' && s.round.code === 'X-177');

    const both = step({ finished: goodRound(), opening: 'IGNORE ME' });
    ok('‼️ when a session really ended, ITS words win over any opening the caller kept',
        both.round.prompt.indexOf('IGNORE ME') < 0);
}

// ---- ‼️ what nobody measured stays unmeasured -------------------------------
{
    const bare = step({ finished: { status: 'done', code: 'X-176', facts: { sessionId: SID } }, opening: 'x' });
    ok('a caller who measured nothing leaves the verdict with things it does not know',
        bare.diagnosis.unknown.length > 0);
    ok('...and the driver invented none of them — it says a cheap turn is worth making',
        bare.words.assist.needed === true);

    const told = step({ finished: goodRound() });
    ok('a caller who measured everything has nothing left to ask',
        told.diagnosis.unknown.length === 0 && told.words.assist.needed === false);
}

// ---- ‼️ the user's hand: a cancelled round stops the campaign ---------------
{
    const s = step({ finished: goodRound({ status: 'cancelled' }), opening: 'x' });
    ok('cancelling the round the sentry is running stops the campaign',
        s.plan.action === 'stopped' && s.plan.rule === 'round-cancelled');
    ok('...it says so in words a person can act on, and opens nothing',
        /cancel/i.test(s.plan.why) && !s.round && typeof s.stop === 'string');

    const r = rec();
    applySentryStep(r, s, undefined, NOW + MIN);
    ok('...and the record really is switched off, with the reason kept',
        r.status === 'stopped' && r.stoppedAt === NOW + MIN && /cancel/i.test(r.stoppedWhy));
}

// ---- ‼️ the failure brake: not a budget, an alarm ---------------------------
{
    const barren = goodRound({ status: 'failed', facts: { sessionId: SID, answerFiles: [], repos: [], codes: [], output: '' } });

    let r = rec();
    for (let n = 1; n <= SENTRY_DEFAULT_FAIL_LIMIT; n++) {
        const s = sentryStep({ campaign: r, usage: [slot('a')], next: NEXT, finished: barren, now: NOW });
        ok(`round ${n} of nothing counts toward the brake`, s.failStreak === n);
        if (n < SENTRY_DEFAULT_FAIL_LIMIT) {
            ok(`...and below the limit the campaign carries on`, s.plan.action === 'start' && !s.stop);
        } else {
            ok('...at the limit it stops, naming the streak',
                s.plan.action === 'stopped' && s.plan.rule === 'fail-streak'
                && s.plan.why.indexOf(String(SENTRY_DEFAULT_FAIL_LIMIT)) >= 0 && !s.round);
        }
        applySentryStep(r, s, s.round ? 't' + n : undefined, NOW);
    }
    ok('the record is off after the streak, and remembers why',
        r.status === 'stopped' && /streak|nothing/i.test(r.stoppedWhy));

    // one good round wipes the streak — a brake that never resets is a budget
    let r2 = rec();
    applySentryStep(r2, sentryStep({ campaign: r2, usage: [slot('a')], next: NEXT, finished: barren, now: NOW }), 't1', NOW);
    ok('a failed round leaves a streak behind', r2.failStreak === 1);
    const good = sentryStep({ campaign: r2, usage: [slot('a')], next: NEXT, finished: goodRound(), now: NOW });
    ok('‼️ a round that achieved something wipes the streak — the brake is not a budget',
        good.failStreak === 0);
    applySentryStep(r2, good, 't2', NOW);
    ok('...and the record forgets it too', !r2.failStreak);
}

// ---- the brake is a SETTING, and it can be switched off ---------------------
{
    const off = rec({ failLimit: 0, failStreak: 99 });
    const s = sentryStep({
        campaign: off, usage: [slot('a')], next: NEXT, now: NOW,
        finished: goodRound({ status: 'failed', facts: { sessionId: SID, answerFiles: [], repos: [], codes: [], output: '' } })
    });
    ok('a brake set to zero never fires, however long the streak',
        s.plan.action === 'start' && !s.stop);

    const tight = rec({ failLimit: 1 });
    const t = sentryStep({
        campaign: tight, usage: [slot('a')], next: NEXT, now: NOW,
        finished: goodRound({ status: 'failed', facts: { sessionId: SID, answerFiles: [], repos: [], codes: [], output: '' } })
    });
    ok('a campaign may set its own limit, and one failure is allowed to be enough',
        t.plan.action === 'stopped' && t.plan.rule === 'fail-streak');
}

// ---- ‼️ a session that produced NOTHING counts, even when the row said done -
{
    const empty = {
        status: 'done', code: 'X-176', taskId: 't1',
        facts: { sessionId: SID, answerFiles: [], repos: [], codes: [], output: '', progress: { assistantSteps: 0, toolCalls: 0 } }
    };
    const s = step({ finished: empty });
    ok('a round the engine called successful but which achieved nothing is a barren round',
        s.diagnosis.outcome === 'nothing-to-continue' && s.failStreak === 1);
}

// ---- the campaign's own dimensions travel to the row it creates -------------
{
    const s = step({
        campaign: rec({
            engine: 'claude', model: 'haiku', permissionMode: 'bypassPermissions', superpowers: true
        }), opening: 'go'
    });
    ok('the engine and model the campaign was started with are on every round it opens',
        s.round.engine === 'claude' && s.round.model === 'haiku');
    ok('‼️ …and so is the permission mode, without which an unattended round stops to ask and never ends',
        s.round.permissionMode === 'bypassPermissions' && s.round.superpowers === true);
    ok('the account the plan chose is the account the row runs on', s.round.slotId === 'a');

    const main = step({ usage: [], opening: 'go' });
    ok('with nothing captured the row names no account — the absence IS the main sign-in',
        main.plan.action === 'start' && main.round.slotId === undefined);
}

// ---- a plan that is not a start still records what it learned --------------
{
    const asleep = step({ usage: [slot('a', { percent: 99 })], finished: goodRound() });
    ok('every account walled means sleep, with a moment to wake at',
        asleep.plan.action === 'sleep' && asleep.plan.wakeAt > NOW && !asleep.round);
    ok('...and the verdict on the round that ended is still reached, because it is free',
        asleep.diagnosis.outcome === 'item-done');

    const r = rec();
    applySentryStep(r, asleep, undefined, NOW);
    ok('the record carries the sleep so a reload knows when to look again',
        r.wakeAt === asleep.plan.wakeAt && r.lastRule === 'wait-for-reset' && r.status === 'running');

    const paused = step({ automation: { paused: true, pauseReason: 'the user is working' }, finished: goodRound() });
    ok('a paused farm blocks the campaign in the gate own words, and opens nothing',
        paused.plan.action === 'blocked' && /pause/i.test(paused.plan.why) && !paused.round);

    const idle = step({ next: undefined, finished: goodRound() });
    ok('an empty backlog is a WAIT — the campaign is still running afterwards',
        idle.plan.action === 'idle' && idle.plan.rule === 'nothing-to-take');
    const r2 = rec();
    applySentryStep(r2, idle, undefined, NOW);
    ok('...and nothing about it switched the campaign off', r2.status === 'running');
}

// ---- ‼️ THE WORDS SURVIVE THE WAIT -----------------------------------------
// A round ends against the quota wall, so the verdict and the sentence that
// answers it ARE built — and then nothing is opened for three hours. The tick
// that finally opens the next round has no finished session behind it, so it
// can build no words of its own. Dropped, those words fall back to the
// campaign's OPENING sentence, and the sentry sends the next session at the
// item the very first round was given — hours after that item closed.
{
    const asleep = step({ usage: [slot('a', { percent: 99 })], finished: goodRound() });
    ok('a plan that opened no round keeps the words it had already built for the next one',
        !!asleep.carry && asleep.carry.prompt === asleep.words.prompt && asleep.carry.code === NEXT.code);

    const r = rec();
    applySentryStep(r, asleep, undefined, NOW);
    ok('...on the record, because the wait is exactly what a reload happens in the middle of',
        !!r.carry && r.carry.prompt === asleep.words.prompt && r.carry.at === NOW);

    const woke = sentryStep({
        campaign: r, usage: [slot('a')], next: NEXT, opening: 'FIRST ROUND WORDS', now: NOW + 60 * MIN
    });
    ok('‼️ the tick that wakes up opens on the CARRIED words, never on the opening sentence again',
        woke.plan.action === 'start' && woke.round.prompt === asleep.words.prompt);

    const spent = rec({ carry: r.carry });
    applySentryStep(spent, woke, 't9', NOW + 60 * MIN);
    ok('a round that really got a row spends them — the tick after it does not repeat the sentence',
        spent.carry === undefined);

    const failed = rec({ carry: r.carry });
    applySentryStep(failed, woke, undefined, NOW + 60 * MIN);
    ok('...but a row that could not be created keeps them, rather than losing the words to a failed write',
        !!failed.carry && failed.carry.prompt === asleep.words.prompt);

    const moved = sentryStep({
        campaign: r, usage: [slot('a')], next: { code: 'X-999', text: 'something else', effort: 'S' },
        opening: 'FIRST ROUND WORDS', now: NOW + 60 * MIN
    });
    ok('‼️ words written for an item that is no longer next are DROPPED — they name it by code',
        moved.plan.action === 'start' && moved.round.prompt === 'FIRST ROUND WORDS');
    const cleared = rec({ carry: r.carry });
    applySentryStep(cleared, moved, undefined, NOW + 60 * MIN);
    ok('...and the stale sentence does not sit on the record for ever', cleared.carry === undefined);
}

// ---- ‼️ …BUT A WAIT IS NOT A MOVE -----------------------------------------
// `backlog.next` gives nothing while every remaining item is XL or waiting on
// an unfinished ⛔ — that is the campaign WAITING, and it says nothing about
// whether the sentence still fits. Dropped there, the same failure comes back
// through another door: the item is at the top again ten minutes later and the
// session opens on the campaign's first-round words instead.
{
    const asleep = step({ usage: [slot('a', { percent: 99 })], finished: goodRound() });
    const held = rec({ carry: { prompt: asleep.words.prompt, code: NEXT.code, at: NOW } });

    const empty = sentryStep({ campaign: held, usage: [slot('a')], now: NOW + 10 * MIN });
    ok('a tick that finds nothing in the backlog KEEPS the sentence it is holding',
        empty.plan.action === 'idle' && !!empty.carry && empty.carry.prompt === asleep.words.prompt);
    applySentryStep(held, empty, undefined, NOW + 10 * MIN);
    ok('...on the record, so the item that comes back ten minutes later still gets it',
        !!held.carry && held.carry.code === NEXT.code);

    const back = sentryStep({
        campaign: held, usage: [slot('a')], next: NEXT,
        opening: 'FIRST ROUND WORDS', now: NOW + 20 * MIN
    });
    ok('...and the round it finally opens is the one those words were written for',
        back.plan.action === 'start' && back.round.prompt === asleep.words.prompt);
}

// ---- ‼️ WORDS BUILT WITH NO ITEM NAME NOTHING ------------------------------
// Every continuation template spells the next item out, so a sentence built
// while the backlog had nothing to give carries an EMPTY code: sent later it
// would tell a paid session to take "the next item: ". It is not the sentence
// that is kept — the one that names an item stands.
{
    const held = rec({ carry: { prompt: 'HELD WORDS FOR X-177', code: NEXT.code, at: NOW } });
    const s = sentryStep({
        campaign: held, usage: [slot('a')], finished: goodRound(), now: NOW + MIN
    });
    ok('a round that ends into an empty backlog builds words that name no item',
        !!s.words && s.words.vars.nextCode === '');
    ok('‼️ ...and those are not the words that are kept',
        !!s.carry && s.carry.prompt === 'HELD WORDS FOR X-177' && s.carry.code === NEXT.code);
    applySentryStep(held, s, undefined, NOW + MIN);
    ok('...so the record still holds the sentence that names its item',
        !!held.carry && held.carry.prompt === 'HELD WORDS FOR X-177');
}

// ---- a stopped campaign is not driven at all -------------------------------
{
    const s = sentryStep({
        campaign: stopSentry(rec(), NOW), usage: [slot('a')], next: NEXT, opening: 'go', now: NOW
    });
    ok('a campaign the user stopped plans nothing and opens nothing',
        s.plan.action === 'stopped' && !s.round);
}

// ---- X-191: the leader's words outrank the template, and its hold is obeyed ----
//
// The driver is where the leader stops being an idea. What matters here is the
// narrowness of what it may do: it may replace the WORDS, it may pick the
// ACCOUNT, and it may say WAIT. It may not stop the campaign, and it cannot
// reach anything else — everything the driver already decided (the brake, the
// gate, the quota wall, the user's hand) still decides first.
{
    const LEAD = { prompt: 'Carry on from the note at line 40.', account: 'b', hold: false, why: 'the note says where it stopped' };

    const s = step({ finished: goodRound(), usage: [slot('a'), slot('b')], leader: LEAD });
    ok('the leader\'s own words are what the next round opens on',
        s.plan.action === 'start' && s.round.prompt === LEAD.prompt);
    ok('...and the record says they came from the leader, not from a template',
        s.words.source === 'leader' && s.words.templateId === 'leader');
    ok('...and the template it replaced is still readable, so nothing is lost',
        typeof s.words.vars === 'object' && !!s.words.when);
    ok('...and the account it picked is the one the round runs on', s.round.slotId === 'b');
    ok('...and the words CARRIED for a later round are the leader\'s too',
        s.carry && s.carry.prompt === LEAD.prompt);

    const held = step({ finished: goodRound(), usage: [slot('a')], leader: { ...LEAD, hold: true, why: 'the quota resets in an hour' } });
    ok('‼️ the leader may say WAIT, and no round is opened',
        held.plan.action === 'idle' && !held.round);
    ok('...naming the leader as the rule, with its own sentence',
        held.plan.rule === 'leader-hold' && /quota resets/.test(held.plan.why));
    ok('...and the campaign is NOT stopped — waiting is not finishing', !held.stop);
    ok('...and the words it wrote are kept for when the wait is over',
        held.carry && held.carry.prompt === LEAD.prompt);

    const bare = step({ finished: goodRound(), usage: [slot('a')], leader: { prompt: '   ', account: null } });
    ok('a leader that said nothing usable leaves the template in charge',
        bare.words.source !== 'leader' && bare.plan.action === 'start');

    const gone = stopSentry(rec(), NOW);
    ok('‼️ AND THE LEADER CANNOT OVERRULE THE USER\'S HAND',
        sentryStep({ campaign: gone, usage: [slot('a')], next: NEXT, leader: LEAD, now: NOW })
            .plan.action === 'stopped');

    const r = rec({ failStreak: SENTRY_DEFAULT_FAIL_LIMIT - 1 });
    const braked = sentryStep({ campaign: r, usage: [slot('a')], next: NEXT,
        finished: { status: 'failed', code: 'X-1', taskId: 't', facts: { sessionId: SID, answerFiles: [], repos: [{ path: 'D:/r', dirty: 0 }], codes: [], progress: { assistantSteps: 0, toolCalls: 0 }, output: '' } },
        leader: LEAD, now: NOW });
    ok('‼️ ...nor the failure brake', braked.plan.action === 'stopped' && braked.plan.rule === 'fail-streak');
}

console.log(`test_sentry_driver: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
