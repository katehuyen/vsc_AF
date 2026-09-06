// X-230 — the self-restart core: how the farm loads its OWN new build without
// a human being at the desk.
//
// Two facts this file exists to keep true, both measured rather than assumed:
//
// 1. ‼️ THE BRIDGE WRITES ITS RESPONSE *AFTER* THE HANDLER RETURNS
//    (`extension.ts` → `processBridge`: dispatch, THEN write `.response.json`,
//    THEN unlink `.request.json`). A handler that restarts the extension host
//    inside itself therefore dies with the request file still on disk — and the
//    next activation picks that same request up and restarts again. So the plan
//    never says "restart now, synchronously": it always carries a delay the
//    caller can read, and a cooldown stamp survives the death so a request that
//    somehow outlives one restart is REFUSED rather than obeyed a second time.
//    The cooldown is unconditional; `force` does not open it, because `force` is
//    about live sessions and the loop is about the bridge.
//
// 2. ‼️ A CONSOLE SESSION LIVES IN THE EXTENSION HOST'S MEMORY (`ConsoleHost`'s
//    map, `cp.spawn` children with piped stdio, not detached). Restarting the
//    host loses every one of them. An integrated TERMINAL does not belong to the
//    extension host at all — it survives a host restart and dies only with the
//    window. So the two commands have DIFFERENT blockers, and that difference is
//    the whole reason an autonomous agent can restart the host from a terminal
//    without killing itself.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'selfRestart.js'));
const {
    RESTART_COMMANDS, RESTART_COOLDOWN_MS, RESTART_DELAY_MS,
    RESTART_DELAY_MIN, RESTART_DELAY_MAX,
    planRestart, liveBlockers, armedReady
} = S;

const NOW = 1_800_000_000_000;
const world = (over = {}) => ({
    now: NOW, sessions: [], terminals: [], lastRestartAt: null, armed: null, ...over
});
const working = (id, agentName) => ({ id, agentName, status: 'working' });

// ---------- the two commands ----------
{
    ok('extension host restart names VS Code\'s own command',
        RESTART_COMMANDS.extensionHost === 'workbench.action.restartExtensionHost');
    ok('window reload names VS Code\'s own command',
        RESTART_COMMANDS.window === 'workbench.action.reloadWindow');
}

// ---------- an empty window restarts, and never with zero delay ----------
{
    const p = planRestart({ kind: 'extensionHost' }, world());
    ok('an idle window restarts', p.decision === 'restarting');
    ok('…naming the command it will run', p.command === RESTART_COMMANDS.extensionHost);
    ok('‼️ …and NEVER at zero delay — the bridge response is written after the handler returns',
        p.delayMs >= RESTART_DELAY_MIN && p.delayMs === RESTART_DELAY_MS);
    ok('…and nothing is reported killed', Array.isArray(p.killed) && p.killed.length === 0);

    ok('a caller may lengthen the delay', planRestart(
        { kind: 'extensionHost', delayMs: 2500 }, world()).delayMs === 2500);
    ok('…but not shorten it below the floor', planRestart(
        { kind: 'extensionHost', delayMs: 1 }, world()).delayMs === RESTART_DELAY_MIN);
    ok('…nor stretch it past the ceiling', planRestart(
        { kind: 'extensionHost', delayMs: 9e9 }, world()).delayMs === RESTART_DELAY_MAX);
    ok('…and nonsense falls back to the default', planRestart(
        { kind: 'extensionHost', delayMs: 'soon' }, world()).delayMs === RESTART_DELAY_MS);
}

// ---------- the boot-loop guard ----------
{
    const hot = world({ lastRestartAt: NOW - 5000 });
    const p = planRestart({ kind: 'extensionHost' }, hot);
    ok('‼️ a second restart inside the cooldown is refused', p.decision === 'refused');
    ok('…and says how long the caller must wait',
        p.retryInMs === RESTART_COOLDOWN_MS - 5000 && /15s left/.test(p.reason));
    ok('…and names the loop it is preventing', /request|loop/i.test(p.reason));

    ok('‼️ force does NOT open the cooldown — force is about sessions, the loop is about the bridge',
        planRestart({ kind: 'extensionHost', force: true }, hot).decision === 'refused');
    ok('a window reload is guarded by the same stamp',
        planRestart({ kind: 'window', force: true }, hot).decision === 'refused');

    ok('once the window has passed the restart is allowed', planRestart(
        { kind: 'extensionHost' },
        world({ lastRestartAt: NOW - RESTART_COOLDOWN_MS - 1 })
    ).decision === 'restarting');

    ok('a stamp from the future is not trusted into a permanent refusal', planRestart(
        { kind: 'extensionHost' }, world({ lastRestartAt: NOW + 60_000 })).decision === 'restarting');

    ok('cancelling is never blocked by the cooldown', planRestart(
        { kind: 'extensionHost', when: 'cancel' }, hot).decision === 'cancelled');
}

// ---------- blockers: what each command actually destroys ----------
{
    const busy = world({
        sessions: [working('h1', 'developer'), { id: 'h2', agentName: 'basit', status: 'ended' }],
        terminals: [{ name: 'claude — developer' }]
    });

    const hostBlockers = liveBlockers(busy, 'extensionHost');
    ok('a live console session blocks a host restart',
        hostBlockers.length === 1 && hostBlockers[0].id === 'h1' && hostBlockers[0].kind === 'console');
    ok('…and it is named, so the caller knows what it would lose',
        hostBlockers[0].name === 'developer' && hostBlockers[0].status === 'working');
    ok('an ended session is not a blocker', !hostBlockers.some(b => b.id === 'h2'));
    ok('‼️ a terminal does NOT block a host restart — it is not the host\'s child',
        !hostBlockers.some(b => b.kind === 'terminal'));

    const winBlockers = liveBlockers(busy, 'window');
    ok('‼️ a terminal DOES block a window reload — the window takes it down with it',
        winBlockers.some(b => b.kind === 'terminal' && b.name === 'claude — developer'));
    ok('…on top of the console sessions', winBlockers.length === 2);

    const errored = liveBlockers(world({ sessions: [{ id: 'e', agentName: 'a', status: 'error' }] }),
        'extensionHost');
    ok('a session that already failed is not a blocker', errored.length === 0);
    ok('a starting session IS a blocker', liveBlockers(
        world({ sessions: [{ id: 's', agentName: 'a', status: 'starting' }] }), 'extensionHost').length === 1);
    ok('an idle session IS a blocker — its process is alive and waiting', liveBlockers(
        world({ sessions: [{ id: 's', agentName: 'a', status: 'idle' }] }), 'extensionHost').length === 1);
}

// ---------- auto: the default arms rather than refusing, and SAYS SO ----------
{
    const busy = world({ sessions: [working('h1', 'developer'), working('h2', 'basit')] });
    const p = planRestart({ kind: 'extensionHost' }, busy);
    ok('the default arms the restart instead of destroying work', p.decision === 'armed');
    ok('…and reports exactly what it is waiting for',
        p.waitingFor.length === 2 && p.waitingFor.map(b => b.name).join(',') === 'developer,basit');
    ok('…in a reason a caller can print', /console/i.test(p.reason) && /developer/.test(p.reason));
    ok('‼️ …and tells the caller how to watch it, because the bridge can never block',
        p.pollWith === 'farm.health');
    ok('…carrying the delay the firing will use', p.delayMs === RESTART_DELAY_MS);
    ok('…and stamped with when it was armed', p.armedAt === NOW);

    ok('when:"idle" on an empty window is simply a restart',
        planRestart({ kind: 'extensionHost', when: 'idle' }, world()).decision === 'restarting');
    ok('when:"idle" on a busy window arms',
        planRestart({ kind: 'extensionHost', when: 'idle' }, busy).decision === 'armed');
}

// ---------- now / force: the caller who will not wait ----------
{
    const busy = world({ sessions: [working('h1', 'developer')] });
    const p = planRestart({ kind: 'extensionHost', when: 'now' }, busy);
    ok('when:"now" refuses rather than silently deferring', p.decision === 'refused');
    ok('…and names both ways out', /force/.test(p.reason) && /idle/.test(p.reason));
    ok('…and still names the session it would have killed', /developer/.test(p.reason));

    const f = planRestart({ kind: 'extensionHost', force: true }, busy);
    ok('force restarts through live sessions', f.decision === 'restarting');
    ok('‼️ …and reports what it is killing, so the loss is never silent',
        f.killed.length === 1 && f.killed[0].name === 'developer');
}

// ---------- arming is idempotent, and cancellable ----------
{
    const armed = { kind: 'extensionHost', armedAt: NOW - 60_000, delayMs: RESTART_DELAY_MS, waitingFor: [] };
    const busy = world({ sessions: [working('h1', 'developer')], armed });

    const p = planRestart({ kind: 'extensionHost' }, busy);
    ok('asking twice does not stack a second arm', p.decision === 'armed' && p.armedAt === armed.armedAt);
    ok('…and it re-reads what is blocking it NOW', p.waitingFor.length === 1);

    const c = planRestart({ kind: 'extensionHost', when: 'cancel' }, busy);
    ok('an armed restart can be called off', c.decision === 'cancelled');
    ok('…and the answer says what was called off', c.was && c.was.armedAt === armed.armedAt);
    ok('cancelling nothing is not an error',
        planRestart({ kind: 'extensionHost', when: 'cancel' }, world()).decision === 'cancelled');

    ok('‼️ force overrides an existing arm rather than being swallowed by it',
        planRestart({ kind: 'extensionHost', force: true }, busy).decision === 'restarting');
}

// ---------- X-232: a session that will be TAKEN UP AGAIN is not a loss ----------
{
    const withId = { id: 'h1', agentName: 'developer', status: 'working', sessionId: 'sess-1' };
    const noId = { id: 'h2', agentName: 'basit', status: 'idle' };

    ok('without resume, a live session blocks whether or not the engine named it',
        liveBlockers(world({ sessions: [withId, noId] }), 'extensionHost').length === 2);

    const saved = liveBlockers(world({ sessions: [withId, noId] }), 'extensionHost', true);
    ok('‼️ with resume, a session the engine HAS named is no longer a blocker — it comes back',
        !saved.some(b => b.id === 'h1'));
    ok('‼️ …but one it never named still is: there is nothing to resume it by',
        saved.length === 1 && saved[0].id === 'h2');

    ok('so a window full of resumable sessions restarts at once instead of waiting',
        planRestart({ kind: 'extensionHost', resume: true },
            world({ sessions: [withId] })).decision === 'restarting');
    ok('…and one holding an unnamed session still arms',
        planRestart({ kind: 'extensionHost', resume: true },
            world({ sessions: [noId] })).decision === 'armed');
    ok('‼️ a terminal is never saved by resume — a window reload still waits for it',
        planRestart({ kind: 'window', resume: true },
            world({ sessions: [withId], terminals: [{ name: 'claude' }] })).decision === 'armed');

    const armed = {
        kind: 'extensionHost', armedAt: NOW, delayMs: RESTART_DELAY_MS, waitingFor: [], resume: true
    };
    ok('an armed plan waits by its OWN rule — resume was asked once, not re-asked at firing',
        armedReady(armed, world({ sessions: [withId] }))
        && !armedReady(armed, world({ sessions: [noId] })));
}

// ---------- armedReady: the event the firing waits for ----------
{
    const armed = { kind: 'extensionHost', armedAt: NOW, delayMs: RESTART_DELAY_MS, waitingFor: [] };
    ok('an armed host restart waits while a session lives',
        !armedReady(armed, world({ sessions: [working('h1', 'developer')] })));
    ok('…and fires the moment the last one ends',
        armedReady(armed, world({ sessions: [{ id: 'h1', agentName: 'developer', status: 'ended' }] })));
    ok('‼️ …and an open terminal never holds a HOST restart back',
        armedReady(armed, world({ terminals: [{ name: 'claude' }] })));

    const winArm = { ...armed, kind: 'window' };
    ok('an armed window reload does wait for the terminals',
        !armedReady(winArm, world({ terminals: [{ name: 'claude' }] })));
    ok('…and fires once the window is empty', armedReady(winArm, world()));
}

console.log(`test_self_restart.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
