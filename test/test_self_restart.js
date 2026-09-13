// X-230 — the self-restart core: how the farm loads its OWN new build without
// a human being at the desk.
//
// Two facts this file exists to keep true, both measured rather than assumed:
//
// 1. ‼️ THE BRIDGE WRITES ITS RESPONSE *AFTER* THE HANDLER RETURNS
//    (`extension.ts` → `processBridge`: claim the request off the disk, dispatch,
//    THEN write `.response.json` — X-268). A handler that restarts the extension
//    host inside itself therefore dies before its answer is written, and its
//    caller is told nothing. So the plan never says "restart now, synchronously":
//    it always carries a delay the caller can read, and a cooldown stamp survives
//    the death so a request that somehow outlives one restart is REFUSED rather
//    than obeyed a second time. The cooldown is unconditional; `force` does not
//    open it, because `force` is about live sessions and the loop is about the
//    bridge.
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
    // ‼️ AND THE ONE THAT COST THE MOST (audit A-02.4). An `idle` card is a
    // seat, not a flow: its turn is over and it is waiting for a human. It used
    // to block, and because the session ASKING for the restart is on the screen
    // asking, what got armed could never fire — the protection removed the
    // autonomy it was written to protect, and the user had to restart by hand.
    ok('‼️ AN IDLE SESSION IS NOT A BLOCKER — a turn in flight blocks, a seat does not',
        liveBlockers(world({ sessions: [{ id: 's', agentName: 'a', status: 'idle' }] }),
            'extensionHost').length === 0);
    ok('…so the caller\'s own restart FIRES once its turn ends, which is the whole '
        + 'point: armed while working, ready the moment it goes idle',
        !armedReady({ kind: 'extensionHost', armedAt: NOW, delayMs: RESTART_DELAY_MS, waitingFor: [] },
            world({ sessions: [working('me', 'developer')] }))
        && armedReady({ kind: 'extensionHost', armedAt: NOW, delayMs: RESTART_DELAY_MS, waitingFor: [] },
            world({ sessions: [{ id: 'me', agentName: 'developer', status: 'idle' }] })));
    ok('…and the sentence names the FLOW, not the cards on the screen',
        /turn\(s\) still running/.test(planRestart({ kind: 'extensionHost' },
            world({ sessions: [working('h1', 'developer')] })).reason || ''));
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
    // ‼️ IN FLIGHT, and unnamed by the engine — since A-02.4 an `idle` card is
    // not a blocker at all, so a resume test written on one would measure the
    // idle rule twice and X-232 not once.
    const noId = { id: 'h2', agentName: 'basit', status: 'working' };

    ok('without resume, a turn in flight blocks whether or not the engine named it',
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

// ---------- ‼️ THE BUILD ON DISK IS NOT THE BUILD IN THE REGISTRY ----------
// The user reported this one: after farm.restartExtensionHost the Extensions
// card still carried its "Restart Extensions" button, as if Agent Farm alone had
// not been restarted. It had been — and the button was right. Measured in VS
// Code 1.103.2's own workbench.desktop.main.js:
//   `workbench.action.restartExtensionHost` = stopExtensionHosts() then
//   startExtensionHosts() with NO argument, and startExtensionHosts(e) applies a
//   delta only `if (e)` — otherwise it starts from _registry.getSnapshot(). The
//   extensions folder is never re-read, so the OLD version comes back.
//   The card's button is updateRunningExtensions(), the one and only call site
//   in the bundle that passes startExtensionHosts({toAdd, toRemove}), and its
//   own condition is `installedVersion !== runningVersion`.
// So: a host restart asked for over a pending build is planned as the thing that
// actually loads it, and every answer carries the two versions.
{
    const pending = { installed: '3.441.0', running: '3.440.0' };

    const p = planRestart({ kind: 'extensionHost' }, world({ build: pending }));
    ok('‼️ a host restart over a pending build is planned as a WINDOW RELOAD',
        p.decision === 'restarting' && p.kind === 'window'
        && p.command === RESTART_COMMANDS.window);
    ok('…and says which ask it came from, so nothing is escalated silently',
        p.build && p.build.escalatedFrom === 'extensionHost' && p.build.willLoad === true);
    ok('…carrying both versions rather than making the caller ask a second op',
        p.build.installed === '3.441.0' && p.build.running === '3.440.0');
    ok('…and one sentence naming the two commands',
        typeof p.note === 'string'
        && p.note.includes('3.441.0') && p.note.includes('3.440.0')
        && p.note.includes(RESTART_COMMANDS.window));

    const asked = planRestart({ kind: 'extensionHost', loadBuild: false }, world({ build: pending }));
    ok('loadBuild:false bounces the host as asked',
        asked.decision === 'restarting' && asked.kind === 'extensionHost');
    ok('‼️ …and is TOLD the build it is leaving on disk — the silence was the bug',
        asked.build && asked.build.willLoad === false && !asked.build.escalatedFrom
        && asked.note.includes('NOT load it'));

    ok('a window reload over a pending build stays a window reload and reports it will load',
        (() => {
            const w = planRestart({ kind: 'window' }, world({ build: pending }));
            return w.kind === 'window' && w.build.willLoad === true && !w.build.escalatedFrom;
        })());

    ok('the same version on both sides is not a pending build at all',
        planRestart({ kind: 'extensionHost' },
            world({ build: { installed: '3.440.0', running: '3.440.0' } })).kind === 'extensionHost');
    ok('‼️ an UNKNOWN is never read as a mismatch — a development host has no extensions.json',
        planRestart({ kind: 'extensionHost' }, world({ build: null })).kind === 'extensionHost'
        && planRestart({ kind: 'extensionHost' },
            world({ build: { installed: '', running: '3.440.0' } })).kind === 'extensionHost');
    ok('…and a plan with no pending build carries no build field to be misread',
        planRestart({ kind: 'extensionHost' }, world()).build === undefined);

    // ‼️ The escalation changes what blocks it, and that has to be visible: a
    // terminal never held a host restart back, and now it can — because the
    // thing that loads a build is a window reload. Silence here would be the
    // A-02.4 deadlock again, so the wait's own sentence carries the why.
    const inTerminal = planRestart({ kind: 'extensionHost' },
        world({ build: pending, terminals: [{ name: 'claude' }] }));
    ok('‼️ escalated, an open terminal blocks it — and it is armed, not silently ignored',
        inTerminal.decision === 'armed' && inTerminal.kind === 'window');
    ok('…and the armed reason carries the build sentence, so farm.waits explains itself',
        inTerminal.reason.includes('3.441.0') && inTerminal.reason.includes(RESTART_COMMANDS.window));
    ok('when:"now" over a pending build refuses with the build sentence attached',
        (() => {
            const r = planRestart({ kind: 'extensionHost', when: 'now' },
                world({ build: pending, terminals: [{ name: 'claude' }] }));
            return r.decision === 'refused' && r.reason.includes('3.441.0');
        })());
    ok('force goes through the escalated window reload rather than the host',
        (() => {
            const f = planRestart({ kind: 'extensionHost', force: true },
                world({ build: pending, terminals: [{ name: 'claude' }] }));
            return f.decision === 'restarting' && f.kind === 'window' && f.killed.length === 1;
        })());
    ok('the cooldown still comes first and still refuses — a build never opens it',
        planRestart({ kind: 'extensionHost' },
            world({ build: pending, lastRestartAt: NOW - 1000 })).decision === 'refused');
    ok('…and cancel still cancels, carrying the build reading with it',
        (() => {
            const c = planRestart({ kind: 'extensionHost', when: 'cancel' }, world({ build: pending }));
            return c.decision === 'cancelled' && c.build.installed === '3.441.0';
        })());
}

// ---------- audit A-02.16: THE VERSION STRING IS NOT THE BUILD ----------
//
// ‼️ MEASURED IN THE FIELD, ON THIS MACHINE. `npm run package` then
// `code --install-extension --force` under the SAME version number is what the
// dev loop does between commits. VS Code replaces the folder in place and the
// running host keeps the code it loaded — but both strings still read
// `3.443.0`, so `pendingBuild` returned null, `farm.health` answered
// `pending:false`, and the agent believed its own code was live. The extension
// folder's package.json was written at 09:38; the host had booted at 09:24.
//
// A version number cannot express "a different build of the same version", so
// the FOLDER's identity is carried instead, and only it can say `replaced`.
{
    const NOW = 1_000_000;
    const w = (build) => ({ now: NOW, sessions: [], terminals: [], lastRestartAt: null, build });

    ok('two different versions are still a pending build, as they always were',
        planRestart({ kind: 'extensionHost' },
            w({ installed: '3.444.0', running: '3.443.0' })).build.installed === '3.444.0');

    const same = planRestart({ kind: 'extensionHost' }, w({ installed: '3.443.0', running: '3.443.0' }));
    ok('the same version with nothing else said is NOT pending — an unknown is not a mismatch',
        same.build === undefined && same.decision === 'restarting' && same.kind === 'extensionHost');

    const rebuilt = planRestart({ kind: 'extensionHost' },
        w({ installed: '3.443.0', running: '3.443.0', replaced: true }));
    ok('‼️ …but the same version with the FOLDER replaced is pending, and it escalates like any other',
        rebuilt.kind === 'window' && rebuilt.build.escalatedFrom === 'extensionHost'
        && rebuilt.build.replaced === true && rebuilt.build.willLoad === true);
    ok('‼️ …and its sentence does not claim two equal numbers differ — it names the folder',
        !/3\.443\.0 is installed and 3\.443\.0 is running/.test(rebuilt.note)
        && /different build of 3\.443\.0 is on disk/.test(rebuilt.note)
        && /same version number/.test(rebuilt.note));
    ok('…and `replaced:false` said out loud is still not a mismatch',
        planRestart({ kind: 'extensionHost' },
            w({ installed: '3.443.0', running: '3.443.0', replaced: false })).build === undefined);

    // ‼️ AND farm.health MAY NOT WORK THIS OUT A SECOND TIME. It used to answer
    // `installed !== extVersion` on its own, which is why the planner could
    // learn this rule and the surface could not.
    const fs2 = require('fs');
    const extTs2 = fs2.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const health = extTs2.slice(extTs2.indexOf("op: 'farm.health'"),
        extTs2.indexOf("op: 'farm.restartExtensionHost'"));
    ok('‼️ farm.health reads the PLANNER\'s answer, not a second definition of "pending"',
        /pendingBuild\(w\)/.test(health) && !/installed !== extVersion/.test(health));
    ok('…and passes `replaced` on, so a poll loop can tell which kind of wait it is in',
        /replaced: true/.test(health));
    // The half the extension owns: the boot stamp, and that it is compared live.
    ok('‼️ …and the extension takes the folder\'s identity AT BOOT and compares it live',
        /const bootManifestStamp = ownManifestStamp\(\);/.test(extTs2)
        && /now !== bootManifestStamp/.test(extTs2));
    ok('…reading its OWN extensionPath rather than a guessed extensions dir',
        /ownManifestStamp = \(\)[\s\S]{0,200}context\.extensionPath, 'package\.json'/.test(extTs2));

    // ‼️ A-02.15 — AND A BOOT THE FARM DID NOT PLAN SAYS SO. VS Code restarts
    // the extension host on its own (a --force install, the Extensions card's
    // button, a crash); no stamp is written, so no revive plan exists and no
    // console session comes back. Measured here: bootId changed and the seat was
    // replaced while selfRestart.json was eight hours old. Recovering is the
    // user's decision; REPORTING it is not, and silence is what made it a
    // mystery both times it happened.
    ok('‼️ farm.health says whether this boot was one the farm itself planned',
        /bootPlanned:/.test(health));
    ok('…judged against the stamp it would have written, not against a clock alone',
        /bootPlanned: !!stamp && stamp\.at <= bootAt/.test(health));
}

// ---------- audit A-02.10: THE WORLD THE PLANNER IS ACTUALLY HANDED ----------
//
// ‼️ EVERY RULE ABOVE IS MEASURED ON A WORLD THIS FILE BUILDS ITSELF, and that
// is exactly how a rule can be green here and dead in the product. `resume`'s
// exemption keys on `sessionId`; `restartWorld()` in `extension.ts` mapped the
// console list down to `{id, agentName, status}` and dropped it, so the branch
// the X-232 tests above pin could never be reached by the running extension —
// every `resume:true` restart armed and waited for sessions it had promised to
// bring back. No test failed, because no test had ever looked at the wiring.
//
// So the world's SHAPE is pinned here, against the source, next to the rules
// that depend on it. A field the planner reads and the wiring does not send is
// the bug that reports nothing.
{
    const fs = require('fs');
    const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const world = (() => {
        const m = /const restartWorld = \(\) => \(\{/.exec(extTs);
        if (!m) { return ''; }
        let i = m.index + m[0].length - 2, depth = 0;
        for (; i < extTs.length; i++) {
            if (extTs[i] === '(') { depth++; }
            else if (extTs[i] === ')') { depth--; if (!depth) { break; } }
        }
        return extTs.slice(m.index, i);
    })();

    ok('restartWorld() is findable — this test is worthless if the shape moved and it did not notice',
        world.length > 0);
    ok('‼️ the console mapping carries sessionId, or resume can never exempt anything in the product',
        /sessions:\s*consoleHost\.list\(\)\.map\([\s\S]*?sessionId/.test(world));
    // The other three the planner reads, pinned the same way for the same reason.
    ok('…and it still carries the three the blockers themselves are built from',
        /\bid:\s*s\.id/.test(world) && /agentName:\s*s\.agentName/.test(world)
        && /status:\s*s\.status/.test(world));
    ok('…and terminals, lastRestartAt, armed and build are all still sent',
        /terminals:/.test(world) && /lastRestartAt:/.test(world)
        && /armed:/.test(world) && /build:/.test(world));

    // And the field is real on the state it is read off, not an invention here.
    const proto = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'consoleproto.ts'), 'utf8');
    ok('‼️ …and sessionId is a real field of ConsoleSessionState, not a hopeful spelling',
        /interface ConsoleSessionState \{[\s\S]*?\n\}/.exec(proto)[0].includes('sessionId?: string'));
}

console.log(`test_self_restart.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
