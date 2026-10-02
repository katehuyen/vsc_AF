// X-176 — THE CAMPAIGN AS A RECORD: what the user switched on, and what it did.
//
// `planSentry` decides; this is the thing the decision is made ABOUT, and the
// only part of the sentry that survives a window reload. Three rules earn it a
// file of its own:
//
//   · ‼️ THE STORED RECORD *IS* THE PLANNER'S INPUT. No translation layer, no
//     second shape to keep in step — `planSentry({ campaign: record, ... })`
//     takes it as it comes off the disk. A mapping function between the two
//     would be one more place for "stopped" to mean "running".
//   · ‼️ WHETHER A ROUND IS GOING IS DERIVED FROM THE ROWS, never stored. A
//     boolean on the record is a second source of truth for a fact the task
//     board already owns, and the failure it produces is the worst one this
//     item has: a campaign that believes it is still running a round that died
//     with the window, and therefore never starts another as long as it lives.
//   · ‼️ AN UNREADABLE NUMBER IS NOT A SETTING. A ceiling of "soon" leaves the
//     field ABSENT so the Account ceiling applies (startRoom.ts startWall) — the
//     one default is the user's setting, and a store that invents a number of
//     its own makes changing it a two-file job that will be done in one.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const {
    newSentry, refuseSentry, stopSentry, pauseSentry, resumeSentry, sentryRunning, noteSentryPlan, noteSentryRound,
    sentryDue, SENTRY_TAKEN_KEEP
} = require(path.join(OUT, 'sentryCampaign.js'));
const { planSentry } = require(path.join(OUT, 'sentryRun.js'));
const { startWall } = require(path.join(OUT, 'startRoom.js'));
// X-471 — the host's composition: the campaign's own ceiling into startWall, under the Account ceiling and the handover line
const wallOf = (rec) => startWall({ setting: 70, handoverPct: 90, own: rec.ceiling, ownWhy: 'the campaign\'s wall' });
const WALL = wallOf({});
const { presetConditions } = require(path.join(OUT, 'sentryPolicy.js'));

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const MIN = 60 * 1000;
const asked = { project: 'prj_9ujsbtzr', agent: 'developer' };

// ---- the record the planner takes as it comes off the disk -----------------
{
    const rec = newSentry(asked, NOW);
    ok('a started campaign is running, on the project and agent it was given',
        rec.status === 'running' && rec.project === asked.project && rec.agent === 'developer');
    ok('...it has an id and the moment the user switched it on',
        typeof rec.id === 'string' && rec.id.length > 3 && rec.startedAt === NOW);
    ok('...and no rounds yet, because it has done nothing', !rec.rounds);

    // ‼️ THE POINT OF THE SHAPE: no translation layer between store and decision.
    const p = planSentry({
        campaign: rec, usage: [], next: { code: 'X-177', text: 'a' }, prompt: 'go', wall: WALL, now: NOW
    });
    ok('‼️ the stored record IS what the planner plans over, with nothing in between',
        p.action === 'start');
}

// ---- what is refused, and refused BY NAME ----------------------------------
{
    ok('a campaign with no project is refused, naming what is missing',
        /project/i.test(refuseSentry(undefined, { agent: 'developer' }) || ''));
    ok('a campaign with no agent is refused, naming what is missing',
        /agent/i.test(refuseSentry(undefined, { project: 'p' }) || ''));
    ok('a campaign with both is not refused', refuseSentry(undefined, asked) === undefined);

    const live = newSentry(asked, NOW);
    const second = refuseSentry(live, { project: 'other', agent: 'basit' }) || '';
    ok('‼️ a second campaign while one runs is refused — the runner is sequential',
        second.length > 10);
    ok('...and it names the project the live one is on, so the user can stop it',
        second.indexOf(asked.project) >= 0);
    ok('a campaign that was stopped stands in nobody"s way',
        refuseSentry(stopSentry(live, NOW), asked) === undefined);
}

// ---- ‼️ an unreadable number is not a setting ------------------------------
{
    ok('a ceiling above the whole window is brought back to it',
        newSentry(Object.assign({ ceiling: 400 }, asked), NOW).ceiling === 100);
    ok('a ceiling below one is brought up to it',
        newSentry(Object.assign({ ceiling: -3 }, asked), NOW).ceiling === 1);
    ok('a ceiling that is not a number is left ABSENT, so the Account ceiling applies',
        newSentry(Object.assign({ ceiling: 'soon' }, asked), NOW).ceiling === undefined);
    const soon = newSentry(Object.assign({ ceiling: 'soon' }, asked), NOW);
    const at = (pct, rec) => planSentry({
        campaign: rec,
        usage: [{ slotId: 'a', engine: 'claude', state: 'ok', percent: pct, resetsAt: NOW + 60 * MIN, plan: 'pro', fetchedAt: NOW }],
        next: { code: 'X-177', text: 'a' }, prompt: 'go', wall: wallOf(rec), now: NOW
    }).action;
    ok('‼️ X-471 — …and the Account ceiling really is that one default (69 starts, 75 waits on a 70 ceiling)',
        wallOf(soon).value === 70 && at(69, soon) === 'start' && at(75, soon) === 'sleep');
    const own95 = newSentry(Object.assign({ ceiling: 95 }, asked), NOW);
    ok('‼️ …and a campaign\'s own ceiling above the quota handover line acts AT that line (92 waits under 95 → 90)',
        wallOf(own95).value === 90 && /quota handover line/.test(wallOf(own95).why) && at(92, own95) === 'sleep' && at(85, own95) === 'start');
    ok('a safety buffer of zero is a real answer and survives',
        newSentry(Object.assign({ safetyBufferMin: 0 }, asked), NOW).safetyBufferMin === 0);
    ok('a negative safety buffer is brought up to zero',
        newSentry(Object.assign({ safetyBufferMin: -5 }, asked), NOW).safetyBufferMin === 0);
    ok('the engine and model travel when they are given, and are absent when they are not',
        newSentry(Object.assign({ engine: 'claude', model: 'haiku' }, asked), NOW).engine === 'claude'
        && newSentry(asked, NOW).model === undefined);
    ok('a campaign may carry its own failure brake',
        newSentry(Object.assign({ failLimit: 5 }, asked), NOW).failLimit === 5);
    ok('‼️ a brake of zero is SWITCHED OFF, and that is a real answer that survives',
        newSentry(Object.assign({ failLimit: 0 }, asked), NOW).failLimit === 0);
    ok('a brake that is not a number is left absent, so the setting default applies',
        newSentry(Object.assign({ failLimit: 'lots' }, asked), NOW).failLimit === undefined);
}

// ---- stopping is the user's, and it is visible -----------------------------
{
    const rec = stopSentry(newSentry(asked, NOW), NOW + MIN);
    ok('a stopped campaign says so and remembers when',
        rec.status === 'stopped' && rec.stoppedAt === NOW + MIN);
    ok('...and the planner plans nothing for it',
        planSentry({ campaign: rec, usage: [], next: { code: 'X', text: 'a' }, prompt: 'go', wall: WALL, now: NOW })
            .action === 'stopped');
}

// ---- ‼️ PAUSE: a hold that belongs to the campaign (X-177) ------------------
// The farm's master switch stops every automation there is; this stops one
// campaign. Kept apart from `stopped` because they answer different questions:
// stopped is a record nobody is coming back to, paused is one the user is
// standing over — so it still holds the single slot, and everything it had
// already worked out survives the hold.
{
    const held = pauseSentry(newSentry(asked, NOW), NOW + MIN);
    ok('a paused campaign says so and remembers when',
        held.status === 'paused' && held.pausedAt === NOW + MIN);
    ok('‼️ a paused campaign is NEVER due — the pump does not tick it at all',
        sentryDue(held, false, 10, NOW + 999 * MIN) === false);
    ok('...and it still stands in the way of a second one, because it is not finished with',
        /paus/i.test(refuseSentry(held, asked) || ''));

    held.carry = { prompt: 'the words the last round earned', code: 'X-177', at: NOW };
    const back = resumeSentry(held, NOW + 5 * MIN);
    ok('resuming puts it back to running and clears the hold',
        back.status === 'running' && back.pausedAt === undefined);
    ok('‼️ ...and the words the campaign had already earned survive it',
        back.carry.prompt === 'the words the last round earned');

    const idled = noteSentryPlan(newSentry(asked, NOW),
        { action: 'idle', rule: 'nothing-to-take', why: 'x' }, NOW);
    const again = resumeSentry(pauseSentry(idled, NOW + MIN), NOW + 5 * MIN);
    ok('...and it looks AT ONCE, rather than serving out the poll it was paused in the middle of',
        sentryDue(again, false, 10, NOW + 5 * MIN) === true);

    ok('pausing a stopped campaign does nothing — stopped is finished with',
        pauseSentry(stopSentry(newSentry(asked, NOW), NOW), NOW).status === 'stopped');
    ok('...and resuming one does not raise the dead either',
        resumeSentry(stopSentry(newSentry(asked, NOW), NOW), NOW).status === 'stopped');
}

// ---- ‼️ whether a round is going is DERIVED from the rows -------------------
{
    const id = 'sc-1';
    const rows = (over) => [Object.assign({ id: 't1', sentryOf: id, status: 'done' }, over || {})];
    ok('a queued round of this campaign counts as running — it is about to spend',
        sentryRunning(rows({ status: 'queued' }), id) === true);
    ok('a running round counts', sentryRunning(rows({ status: 'running' }), id) === true);
    ok('a finished round does not', sentryRunning(rows({ status: 'done' }), id) === false);
    ok('a cancelled round does not', sentryRunning(rows({ status: 'cancelled' }), id) === false);
    ok('another campaign round is not this one',
        sentryRunning(rows({ status: 'running', sentryOf: 'sc-2' }), id) === false);
    ok('an ordinary task nobody marked is nobody round',
        sentryRunning([{ id: 't', status: 'running' }], id) === false);
    ok('no rows at all is not running', sentryRunning([], id) === false);
}

// ---- the last decision is kept, so a surface can say why nothing happens ----
{
    const rec = newSentry(asked, NOW);
    noteSentryPlan(rec, {
        action: 'sleep', rule: 'wait-for-reset', why: 'everything is walled', wakeAt: NOW + 90 * MIN
    }, NOW);
    ok('the last plan is on the record, in its own words',
        rec.lastRule === 'wait-for-reset' && /walled/.test(rec.lastWhy) && rec.lastAt === NOW
        && rec.lastAction === 'sleep');
    ok('...and the moment to wake up with it', rec.wakeAt === NOW + 90 * MIN);

    noteSentryPlan(rec, { action: 'idle', rule: 'nothing-to-take', why: 'the pile is empty' }, NOW + MIN);
    ok('‼️ a later plan with no wake time CLEARS the old one rather than leaving it to mislead',
        rec.wakeAt === undefined && rec.lastRule === 'nothing-to-take');
}

// ---- the rounds it ran are a record, not a limit ---------------------------
{
    const rec = newSentry(asked, NOW);
    noteSentryRound(rec, 'X-177', 't1', NOW);
    noteSentryRound(rec, 'X-178', 't2', NOW + MIN);
    ok('every round is counted', rec.rounds === 2);
    ok('...the codes it took are kept in the order it took them',
        (rec.taken || []).join() === 'X-177,X-178');
    ok('...and the row of the last one, so a surface can open it', rec.lastTaskId === 't2');

    noteSentryRound(rec, 'X-177', 't3', NOW + 2 * MIN);
    ok('a code taken twice is recorded twice — it really did open two sessions on it',
        (rec.taken || []).join() === 'X-177,X-178,X-177' && rec.rounds === 3);

    for (let n = 0; n < SENTRY_TAKEN_KEEP + 10; n++) { noteSentryRound(rec, 'X-9', 't', NOW); }
    ok('the list of codes is capped, because a campaign the user never stops runs for ever',
        rec.taken.length === SENTRY_TAKEN_KEEP);
    ok('...and the count is NOT capped, because it is the honest number',
        rec.rounds === 3 + SENTRY_TAKEN_KEEP + 10);
}

// ---- ‼️ when to look again, WITHOUT a second scheduler ----------------------
{
    const POLL = 10;
    const due = (rec, running, now) => sentryDue(rec, running, POLL, now);

    ok('nothing to drive when there is no campaign', due(undefined, false, NOW) === false);
    ok('a stopped campaign is never due', due(stopSentry(newSentry(asked, NOW), NOW), false, NOW) === false);
    ok('‼️ a campaign with a round on the board is NOT due — that round ending is what drives it',
        due(newSentry(asked, NOW), true, NOW + 99 * MIN) === false);
    ok('a campaign that has never been looked at is due at once, not in ten minutes',
        due(newSentry(asked, NOW), false, NOW) === true);

    const idle = noteSentryPlan(newSentry(asked, NOW), { action: 'idle', rule: 'nothing-to-take', why: 'x' }, NOW);
    ok('an idling campaign is left alone until the poll comes round',
        due(idle, false, NOW + (POLL - 1) * MIN) === false);
    ok('...and then looks again, because a new item may have been written',
        due(idle, false, NOW + (POLL + 1) * MIN) === true);

    const asleep = noteSentryPlan(newSentry(asked, NOW),
        { action: 'sleep', rule: 'wait-for-reset', why: 'walled', wakeAt: NOW + 180 * MIN }, NOW);
    ok('‼️ a measured sleep OUTRANKS the poll — a three-hour wall is not poked every ten minutes',
        due(asleep, false, NOW + (POLL + 1) * MIN) === false);
    ok('...and the moment it lifts, it is due', due(asleep, false, NOW + 180 * MIN) === true);
}

// ---- it is stored, so it must survive being written down -------------------
{
    const rec = newSentry(Object.assign({ ceiling: 90 }, asked), NOW);
    noteSentryPlan(rec, { action: 'start', rule: 'has-room', why: 'a has room' }, NOW);
    noteSentryRound(rec, 'X-177', 't1', NOW);
    const back = JSON.parse(JSON.stringify(rec));
    ok('a record round-trips through the store unchanged',
        JSON.stringify(back) === JSON.stringify(rec));
    ok('...and the planner reads the copy exactly as it read the original',
        planSentry({ campaign: back, usage: [], next: { code: 'X', text: 'a' }, prompt: 'go', wall: WALL, now: NOW }).action
        === planSentry({ campaign: rec, usage: [], next: { code: 'X', text: 'a' }, prompt: 'go', wall: WALL, now: NOW }).action);
}

// ---- X-194 — A CAMPAIGN IS STARTED WITH A MODE, not patched into one --------
//
// ‼️ MEASURED (2026-09-05): the record had `policy` and the round read it, but
// NOTHING could set it — `sentry.start` took no preset and no conditions, so
// every campaign anybody could actually start fell to the mechanical default
// and the leader X-191 built never woke. The three modes are ONE condition set
// with three fillings (X-190), so starting one is choosing a preset — and a
// preset nobody knows is refused BY NAME rather than quietly becoming
// mechanical, which is how a night of thinking turns into a night of templates
// without anyone being told.
{
    const mech = newSentry({ project: 'p', agent: 'a', preset: 'mechanical' }, 1);
    ok('the mechanical preset is a condition set that is EMPTY, not a missing policy',
        mech.policy && mech.policy.preset === 'mechanical' && mech.policy.conditions.length === 0);

    const smart = newSentry({ project: 'p', agent: 'a', preset: 'intelligent' }, 1);
    ok('a preset fills the conditions from the dictionary, not from the page',
        smart.policy.preset === 'intelligent'
        && smart.policy.conditions.length === presetConditions('intelligent').length);

    const hyb = newSentry({ project: 'p', agent: 'a', preset: 'hybrid' }, 1);
    ok('...and hybrid arrives with the set somebody can then edit',
        hyb.policy.conditions.length === presetConditions('hybrid').length);

    // The user's own words: "the conditions must be as wide and flexible as
    // possible". Given ones win, and the preset is kept so a surface can say
    // what they were edited FROM.
    const own = newSentry({
        project: 'p', agent: 'a', preset: 'hybrid',
        conditions: [{ id: 'mine', field: 'quota.percent', operator: 'gte', value: 80 }]
    }, 1);
    ok('conditions given by hand win, and say which preset they came from',
        own.policy.conditions.length === 1 && own.policy.conditions[0].id === 'mine'
        && own.policy.preset === 'hybrid');

    ok('‼️ a preset nobody knows is REFUSED BY NAME, never quietly mechanical',
        (() => {
            try { newSentry({ project: 'p', agent: 'a', preset: 'akilli' }, 1); return false; }
            catch (e) { return /akilli/.test(String(e.message)) && /mechanical, intelligent, hybrid/.test(String(e.message)); }
        })());

    ok('asking for no mode at all still starts a campaign — the round has its own default',
        newSentry({ project: 'p', agent: 'a' }, 1).policy === undefined);
}

// ---- X-194 — THE LEADER'S LEASH, PER CAMPAIGN ------------------------------
//
// `leaderCaps` has been on the record since X-191 and `leaderCapsFor` has read
// it, but nothing anywhere could WRITE one — so every campaign ran the leader on
// the machine-wide settings and a campaign nobody wanted to spend on could not
// be given a smaller purse. This is the writer.
{
    const rec = newSentry(Object.assign({
        leaderModel: 'haiku', leaderDailyUsd: 5, leaderMaxUsd: 0.25
    }, asked), NOW);
    ok('a campaign given a leader model, a daily purse and a per-turn ceiling keeps all three',
        rec.leaderCaps.model === 'haiku' && rec.leaderCaps.dailyUsd === 5
        && rec.leaderCaps.maxUsd === 0.25);

    // ‼️ MONEY IS NOT ROUNDED. The ceiling and the buffer are whole numbers and
    // are rounded; a per-turn ceiling of $0.25 rounded to $0 would switch the
    // leader off for ever and look like a setting the user chose.
    ok('‼️ …and the cents survive — a rounded purse is a leader that never wakes',
        newSentry(Object.assign({ leaderMaxUsd: 0.25 }, asked), NOW).leaderCaps.maxUsd === 0.25);

    // ‼️ ASKING FOR NOTHING IS NOT ASKING FOR ZERO. No caps at all means the
    // settings decide, which is what every campaign started before this did;
    // writing a purse nobody chose would be this function deciding for them.
    ok('‼️ a campaign that asked for nothing carries NO caps at all',
        newSentry(asked, NOW).leaderCaps === undefined);
    ok('…and one that named only a model carries only that',
        JSON.stringify(newSentry(Object.assign({ leaderModel: 'sonnet' }, asked), NOW).leaderCaps)
        === '{"model":"sonnet"}');

    // An unreadable figure leaves the field absent so the setting still applies
    // — the same rule the ceiling follows, for the same reason.
    ok('an unreadable purse is not a purse of zero',
        newSentry(Object.assign({ leaderDailyUsd: 'soon' }, asked), NOW).leaderCaps === undefined);
    ok('…and a negative one is refused rather than stored',
        newSentry(Object.assign({ leaderMaxUsd: -4 }, asked), NOW).leaderCaps === undefined);
}

// ---------- X-207: the accounts the campaign is ALLOWED to spend ------------
/*
 * ‼️ THE WHOLE POINT IS THE WORD "ALLOWED". Until this item the pool was every
 * account of the campaign's engine — the user could not say "not that one", and
 * a sentry running all night on an account they were keeping for their own work
 * was not a bug anybody could point at, because nothing in the record even
 * expressed the idea of permission.
 */
{
    const base = { project: 'P', agent: 'dev', engine: 'claude' };

    // Backward compatibility is the first assertion, not the last: every record
    // already on disk has no pool, and none of them may change behaviour.
    ok('a campaign with no pool carries no pool field at all',
        newSentry({ ...base }, 1).pool === undefined);
    ok('…and no rotation either, so the planner falls to the free pool',
        newSentry({ ...base }, 1).rotation === undefined);

    ok('a pool given as an array is kept, in the order it was given',
        JSON.stringify(newSentry({ ...base, pool: ['b', 'a', 'c'] }, 1).pool) === '["b","a","c"]');
    // ‼️ IT TRAVELS ON A COMMAND LINE. `sentry.start` is called by agents with
    // `pool=a,b`, so a comma string and an array are the same request — the
    // same reasoning that keeps `leaderDailyUsd` flat.
    ok('‼️ a comma string and an array reach the same pool',
        JSON.stringify(newSentry({ ...base, pool: 'b, a ,c' }, 1).pool) === '["b","a","c"]');
    ok('blanks and duplicates are dropped rather than stored as choices',
        JSON.stringify(newSentry({ ...base, pool: ['a', '', 'a', ' b '] }, 1).pool) === '["a","b"]');
    ok('an empty pool is no pool, not a pool of nobody',
        newSentry({ ...base, pool: [] }, 1).pool === undefined
        && newSentry({ ...base, pool: '  ' }, 1).pool === undefined);

    ok('the rotation strategy is kept when it is one of the two',
        newSentry({ ...base, rotation: 'tiered' }, 1).rotation === 'tiered');
    ok('…and an unknown word is not stored as a strategy nobody implements',
        newSentry({ ...base, rotation: 'clever' }, 1).rotation === undefined);
    ok('free is the default and so is not written onto the record',
        newSentry({ ...base, rotation: 'free' }, 1).rotation === undefined);

    // ‼️ AN ID THAT IS NOT CAPTURED IS REFUSED AT THE START, at 21:00, rather
    // than discovered as "no usable account" at 03:00.
    ok('‼️ a pool naming an account that is not captured is refused, by name',
        /nope/.test(refuseSentry(undefined, { ...base, pool: ['a', 'nope'] }, ['a', 'b']) || ''));
    ok('…and a pool of captured accounts is not refused',
        refuseSentry(undefined, { ...base, pool: ['a', 'b'] }, ['a', 'b']) === undefined);
    // The known list is optional: a caller that cannot say which accounts exist
    // must not have its campaign refused for accounts it never claimed about.
    ok('a caller that names no captured accounts does not get a refusal it cannot fix',
        refuseSentry(undefined, { ...base, pool: ['a'] }) === undefined);
}

console.log(`test_sentry_campaign: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
