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
//     field ABSENT so `SENTRY_DEFAULT_CEILING` applies — the one default lives
//     in the planner, and a store that invents 95 of its own makes changing it
//     a two-file job that will be done in one.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const {
    newSentry, refuseSentry, stopSentry, sentryRunning, noteSentryPlan, noteSentryRound,
    SENTRY_TAKEN_KEEP
} = require(path.join(OUT, 'sentryCampaign.js'));
const { planSentry, SENTRY_DEFAULT_CEILING } = require(path.join(OUT, 'sentryRun.js'));

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
        campaign: rec, usage: [], next: { code: 'X-177', text: 'a' }, prompt: 'go', now: NOW
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
    ok('a ceiling that is not a number is left ABSENT, so the planner default applies',
        newSentry(Object.assign({ ceiling: 'soon' }, asked), NOW).ceiling === undefined);
    ok('...and the planner really is the one place that default lives',
        planSentry({
            campaign: newSentry(Object.assign({ ceiling: 'soon' }, asked), NOW),
            usage: [{
                slotId: 'a', engine: 'claude', state: 'ok', percent: SENTRY_DEFAULT_CEILING - 1,
                resetsAt: NOW + 60 * MIN, plan: 'pro', fetchedAt: NOW
            }],
            next: { code: 'X-177', text: 'a' }, prompt: 'go', now: NOW
        }).action === 'start');
    ok('a safety buffer of zero is a real answer and survives',
        newSentry(Object.assign({ safetyBufferMin: 0 }, asked), NOW).safetyBufferMin === 0);
    ok('a negative safety buffer is brought up to zero',
        newSentry(Object.assign({ safetyBufferMin: -5 }, asked), NOW).safetyBufferMin === 0);
    ok('the engine and model travel when they are given, and are absent when they are not',
        newSentry(Object.assign({ engine: 'claude', model: 'haiku' }, asked), NOW).engine === 'claude'
        && newSentry(asked, NOW).model === undefined);
}

// ---- stopping is the user's, and it is visible -----------------------------
{
    const rec = stopSentry(newSentry(asked, NOW), NOW + MIN);
    ok('a stopped campaign says so and remembers when',
        rec.status === 'stopped' && rec.stoppedAt === NOW + MIN);
    ok('...and the planner plans nothing for it',
        planSentry({ campaign: rec, usage: [], next: { code: 'X', text: 'a' }, prompt: 'go', now: NOW })
            .action === 'stopped');
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

// ---- it is stored, so it must survive being written down -------------------
{
    const rec = newSentry(Object.assign({ ceiling: 90 }, asked), NOW);
    noteSentryPlan(rec, { action: 'start', rule: 'has-room', why: 'a has room' }, NOW);
    noteSentryRound(rec, 'X-177', 't1', NOW);
    const back = JSON.parse(JSON.stringify(rec));
    ok('a record round-trips through the store unchanged',
        JSON.stringify(back) === JSON.stringify(rec));
    ok('...and the planner reads the copy exactly as it read the original',
        planSentry({ campaign: back, usage: [], next: { code: 'X', text: 'a' }, prompt: 'go', now: NOW }).action
        === planSentry({ campaign: rec, usage: [], next: { code: 'X', text: 'a' }, prompt: 'go', now: NOW }).action);
}

console.log(`test_sentry_campaign: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
