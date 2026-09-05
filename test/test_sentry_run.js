// X-176 — WHAT THE CAMPAIGN DOES NEXT, decided without starting anything.
//
// The runner spends money: it opens sessions on real accounts, unattended, for
// as long as the user leaves it on. So the DECISION is a pure function and the
// driver is thin — every rule below is settled here, for nothing, instead of
// being discovered at three in the morning on somebody's quota.
//
//   · ‼️ NO SECOND SCHEDULER. Permission is `gateBlock` (automation.ts), the
//     sleep is the reset plus retry.ts's safety buffer, the account is
//     `mostRoom` / `nextResetAt` (accountUsage.ts). This file composes them and
//     invents none of them.
//   · ‼️ ENGINE-AGNOSTIC. The word "claude" does not appear in the decision. An
//     engine that publishes no allowance leaves its accounts USABLE — not
//     knowing is not being blocked — and the sleep is computed only from
//     resetsAt values somebody really measured.
//   · ‼️ THE CAMPAIGN ONLY ENDS WHEN THE USER ENDS IT (the user's own call). An
//     empty backlog is therefore a WAIT, not a finish: a code added tomorrow
//     morning has to find the sentry still standing there.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { planSentry, SENTRY_DEFAULT_CEILING } = require(path.join(OUT, 'sentryRun.js'));
const { RETRY_DEFAULT_SAFETY_MIN } = require(path.join(OUT, 'retry.js'));

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const MIN = 60 * 1000;

const campaign = (over) => Object.assign({
    project: 'prj_9ujsbtzr', agent: 'developer', status: 'running'
}, over || {});

const slot = (id, over) => Object.assign({
    slotId: id, engine: 'claude', state: 'ok', percent: 10,
    resetsAt: NOW + 60 * MIN, plan: 'pro', fetchedAt: NOW - MIN
}, over || {});

const next = { code: 'X-177', text: 'NOBET YUZEYI', effort: 'M' };

const plan = (over) => planSentry(Object.assign({
    campaign: campaign(), usage: [slot('a')], next, prompt: 'Take X-177.', now: NOW
}, over || {}));

// ---- the user's switch outranks everything ---------------------------------
{
    const p = plan({ campaign: campaign({ status: 'stopped' }) });
    ok('a stopped campaign plans nothing', p.action === 'stopped');
    ok('...and says so rather than leaving a surface to guess', p.why.length > 10 && !!p.rule);
}

// ---- ‼️ PAUSED IS NOT STOPPED (X-177) --------------------------------------
// A hold that belongs to the CAMPAIGN. The farm's master switch pauses every
// schedule there is, and somebody who wants their sentry to stand still for an
// hour should not have to switch the whole farm off to get it. The answer is
// `blocked` — the same one the gate's own pause produces — rather than
// `stopped`, which is the word for a record nobody is coming back to.
{
    const p = plan({ campaign: campaign({ status: 'paused' }) });
    ok('a paused campaign opens nothing', p.action === 'blocked' && p.prompt === undefined);
    ok('...and is told apart from a stopped one by its RULE, not by its wording alone',
        p.rule === 'user-paused' && /paus/i.test(p.why));
    ok('...and names no moment to wake at, because only the user resumes it',
        p.wakeAt === undefined);
}

// ---- ‼️ SEQUENTIAL, and that is the whole concurrency story for this item ---
{
    const p = plan({ running: true });
    ok('a campaign with a round already running does not start a second',
        p.action === 'idle' && /running|one at a time/i.test(p.why));
}

// ---- the automation gate is the permission, not a second copy of it --------
{
    const paused = plan({ automation: { paused: true, pauseReason: 'demo' } });
    ok('the master switch blocks the campaign like any other automation',
        paused.action === 'blocked' && /paused/.test(paused.why));
    ok('...in the gate\'s own words, so one pause reads the same everywhere',
        /demo/.test(paused.why));

    const quiet = plan({ automation: { quietFrom: '00:00', quietTo: '23:59' } });
    ok('quiet hours block it too', quiet.action === 'blocked' && /quiet/i.test(quiet.why));
    ok('...and it is told WHEN it may wake, so it need not poll',
        typeof quiet.wakeAt === 'number' && quiet.wakeAt > NOW);

    // ‼️ the gate outranks the pile: a paused farm is paused whether or not
    // there is anything to take.
    const both = plan({ automation: { paused: true }, next: undefined });
    ok('a paused farm says PAUSED, not "nothing to do"', both.action === 'blocked');
}

// ---- ‼️ an empty backlog is a WAIT, never an ending ------------------------
{
    const p = plan({ next: undefined });
    ok('with nothing to take the campaign waits rather than finishing',
        p.action === 'idle' && p.action !== 'stopped');
    ok('...and says what it is waiting for, so "why is nothing happening" has an answer',
        /nothing|no item|backlog/i.test(p.why));
}

// ---- nothing is started with nothing to say --------------------------------
{
    const p = plan({ prompt: '' });
    ok('a round with no words is refused rather than opened empty',
        p.action === 'blocked' && /words|prompt/i.test(p.why));
}

// ---- the ordinary turn -----------------------------------------------------
{
    const p = plan({
        usage: [slot('busy', { percent: 80 }), slot('roomy', { percent: 4 }), slot('mid', { percent: 40 })]
    });
    ok('it starts, on the account with the most room left',
        p.action === 'start' && p.slotId === 'roomy');
    ok('...carrying the words it was handed', p.prompt === 'Take X-177.');
    ok('...and naming the rule that decided it', !!p.rule && p.why.length > 10);
}

// ---- ‼️ a measured account beats an unmeasured one -------------------------
{
    const p = plan({
        usage: [
            slot('unread', { state: 'error', percent: -1, resetsAt: 0, fetchedAt: 0 }),
            slot('known', { percent: 30 })
        ]
    });
    ok('a figure somebody read beats a figure nobody has', p.slotId === 'known');
}

// ---- ‼️ an engine that publishes no allowance is still usable --------------
{
    const p = plan({
        usage: [slot('codex-a', {
            engine: 'codex', state: 'no-source', percent: -1, resetsAt: 0, fetchedAt: 0
        })]
    });
    ok('not knowing an allowance is not being blocked by it',
        p.action === 'start' && p.slotId === 'codex-a');
}

// ---- ‼️ no captured accounts is not "no way to run" ------------------------
{
    const p = plan({ usage: [] });
    ok('a campaign with no captured accounts runs on the MAIN sign-in',
        p.action === 'start' && !p.slotId);
    ok('...and says that is what it is doing', /main/i.test(p.why));
}

// ---- every account walled: sleep to the reset, spending nothing ------------
{
    const early = NOW + 20 * MIN, late = NOW + 90 * MIN;
    const p = plan({
        usage: [
            slot('x', { percent: 99, resetsAt: late }),
            slot('y', { percent: 97, resetsAt: early })
        ]
    });
    ok('with every account at the wall it sleeps rather than trying',
        p.action === 'sleep');
    ok('...until the EARLIEST reset, plus the safety buffer',
        p.wakeAt === early + RETRY_DEFAULT_SAFETY_MIN * MIN);
    ok('...and the campaign can set its own buffer',
        plan({
            campaign: campaign({ safetyBufferMin: 11 }),
            usage: [slot('y', { percent: 97, resetsAt: early })]
        }).wakeAt === early + 11 * MIN);
    ok('...and its own ceiling, so 90% can be the wall if the user says so',
        plan({
            campaign: campaign({ ceiling: 90 }), usage: [slot('y', { percent: 92, resetsAt: early })]
        }).action === 'sleep');
    ok('the default ceiling is a stated number, not a magic one',
        typeof SENTRY_DEFAULT_CEILING === 'number'
        && SENTRY_DEFAULT_CEILING > 50 && SENTRY_DEFAULT_CEILING <= 100);
}

// ---- ‼️ a wall with nothing to wait for is a BLOCK, not a sleep ------------
{
    const p = plan({
        usage: [
            slot('gone', { state: 'expired', percent: -1, resetsAt: 0 }),
            slot('also-gone', { state: 'no-auth', percent: -1, resetsAt: 0 })
        ]
    });
    ok('every account signed out is a block, because there is no reset to wait for',
        p.action === 'blocked' && !p.wakeAt);
    ok('...and it says signing in is what would fix it',
        /sign|auth|log/i.test(p.why));
}

// ---- a plan is always explainable ------------------------------------------
{
    const every = [
        plan({ campaign: campaign({ status: 'stopped' }) }),
        plan({ running: true }),
        plan({ automation: { paused: true } }),
        plan({ next: undefined }),
        plan({ prompt: '' }),
        plan(),
        plan({ usage: [slot('y', { percent: 99, resetsAt: NOW + MIN })] })
    ];
    ok('every plan names its rule and says why in words',
        every.every(p => !!p.rule && typeof p.why === 'string' && p.why.length > 10));
    ok('...and never invents an action outside the five',
        every.every(p => ['start', 'sleep', 'idle', 'blocked', 'stopped'].includes(p.action)));
    ok('‼️ the decision never names an engine — it asks, it does not assume',
        every.every(p => !/claude|codex|gemini|opencode|antigravity/i.test(p.why + p.rule)));
}

// ---- X-207: the strategy the campaign was given decides the account --------
/*
 * The planner does not build the pool — `sentryTick` hands it in, already
 * filtered to what the user allowed. What the planner owns is the CHOICE
 * inside it, and the campaign's `rotation` is the field that changes it.
 */
{
    const mixed = [
        slot('c1', { percent: 70 }), slot('c2', { percent: 40 }),
        slot('x1', { engine: 'codex', percent: 5 })
    ];
    ok('a campaign with no rotation spends the roomiest account anywhere',
        plan({ usage: mixed }).slotId === 'x1');
    ok('‼️ a tiered campaign stays on its own engine while it has room',
        plan({ campaign: campaign({ engine: 'claude', rotation: 'tiered' }), usage: mixed })
            .slotId === 'c2');

    // ‼️ THE FALLBACK IS THE ITEM. Every Claude account walled used to mean
    // sleeping until a reset; now it means the round runs on Codex tonight.
    const walled = [
        slot('c1', { percent: 96 }), slot('c2', { percent: 99 }),
        slot('x1', { engine: 'codex', percent: 12 })
    ];
    const fb = plan({
        campaign: campaign({ engine: 'claude', rotation: 'tiered', ceiling: 90 }), usage: walled
    });
    ok('‼️ …and crosses to the next engine rather than sleeping when its own is walled',
        fb.action === 'start' && fb.slotId === 'x1');

    // With every engine walled the old answer stands — and the wake-up is the
    // earliest reset in the WHOLE pool, which is sooner than one engine's.
    const soon = NOW + 20 * MIN;
    const allWalled = plan({
        campaign: campaign({ engine: 'claude', rotation: 'tiered', ceiling: 90, safetyBufferMin: 0 }),
        usage: [
            slot('c1', { percent: 96, resetsAt: NOW + 90 * MIN }),
            slot('x1', { engine: 'codex', percent: 99, resetsAt: soon })
        ]
    });
    ok('every engine walled still sleeps rather than failing',
        allWalled.action === 'sleep');
    ok('‼️ …and wakes at the earliest reset across the whole pool, not just its own engine',
        allWalled.wakeAt === soon);
}

console.log(`test_sentry_run: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
