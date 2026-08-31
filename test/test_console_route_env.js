// X-105 — THE CONSOLE CARD RUNS ON THE ROUTE THE CARD SAYS IT IS ON.
//
// ‼️ THE DEFECT, AND WHY IT IS THE SAME ONE TWICE. X-101 gave the per-turn
// engines (Codex, Gemini, Antigravity) a complete environment on their spawn,
// and X-104 gave the OS terminal one. The Console's PERSISTENT path — Claude,
// which is the engine the panel exists for — was never given one: `openPersistent`
// spawned with `cwd`, `shell` and `stdio` and nothing else, so the process
// inherited whatever the VS Code window happened to carry.
//
// The failure that produces is the quiet kind this whole family is made of:
//   · a card started on Kimi keeps `providerId` on its state, writes Kimi into
//     the launch manifest and reports Kimi on every surface — while the process
//     talks to whatever `ANTHROPIC_BASE_URL` the window inherited. Every surface
//     agrees with every other one and all of them are wrong about the only
//     thing that matters.
//   · and with no route chosen at all, an `ANTHROPIC_BASE_URL` inherited from
//     the environment answers the question the official route was picked to
//     answer — which is exactly what `clearEnv` exists to prevent, and it could
//     not be said here because nothing was said here.
//
// So what is measured is not "the variable is nice to have". It is: THE CARD'S
// OWN ROUTE, read off the state the card shows, reaches the process that serves
// it — the same guarantee the other three surfaces already give.
'use strict';
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------- the spawn
const spawns = [];
function fakeChild() {
    const child = new EventEmitter();
    const pipe = () => {
        const s = new EventEmitter();
        s.setEncoding = () => { };
        s.destroy = () => { };
        return s;
    };
    child.stdout = pipe();
    child.stderr = pipe();
    child.stdin = { write: () => true, end: () => { } };
    child.pid = 4000 + spawns.length;
    child.kill = () => { };
    return child;
}
const realSpawn = cp.spawn;
cp.spawn = (exe, args, opts) => { spawns.push({ exe, args, opts }); return fakeChild(); };

const { ConsoleHost } = require(path.join(ROOT, 'out', 'core', 'consolehost.js'));

// ‼️ The runtime is asked for by (agent, engine, route) and answers with the
// two halves an overlay has: what to SET and what to CLEAR. This stub is the
// real signature; what the real one builds is providerRuntime.ts's subject and
// is measured there.
const asked = [];
const engineRuntime = (agentId, engine, route) => {
    asked.push({ agentId, engine, route });
    if (route && route.providerId === 'kimi') {
        return {
            spawnEnv: { ANTHROPIC_BASE_URL: 'https://api.moonshot.ai/anthropic', ANTHROPIC_API_KEY: 'sk-af-K' },
            clearEnv: ['ANTHROPIC_AUTH_TOKEN']
        };
    }
    // The official route: nothing to set, and an inherited route name to clear.
    return { spawnEnv: {}, clearEnv: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] };
};

const host = () => new ConsoleHost(
    () => 'claude', () => undefined, () => undefined, () => undefined,
    () => undefined, undefined, engineRuntime);

// A leftover route in the window we are started from — the thing that must not
// be allowed to answer for a session nobody pointed at it.
const hadUrl = process.env.ANTHROPIC_BASE_URL;
process.env.ANTHROPIC_BASE_URL = 'https://inherited.example/anthropic';

// ------------------------------------------------- 1. a card WITH a route
{
    spawns.length = 0; asked.length = 0;
    const h = host();
    h.start({
        agentId: 'a-dev', agentName: 'developer', cwd: 'D:\\repo',
        engine: 'claude', providerId: 'kimi', tier: 'sonnet'
    });
    ok('the Claude card was spawned', spawns.length === 1);
    const env = spawns[0].opts && spawns[0].opts.env;
    ok('‼️ X-105 — the persistent spawn is given an environment at all', !!env);
    ok('‼️ …asked for THIS CARD\'S route, not the agent\'s standing one',
        asked.length === 1 && asked[0].route && asked[0].route.providerId === 'kimi'
        && asked[0].route.tier === 'sonnet');
    ok('…and for the engine the card is on', asked.length === 1 && asked[0].engine === 'claude');
    ok('‼️ …so the process really talks to the route the card names',
        !!env && env.ANTHROPIC_BASE_URL === 'https://api.moonshot.ai/anthropic');
    ok('…with the route\'s own credential', !!env && env.ANTHROPIC_API_KEY === 'sk-af-K');
    ok('‼️ …and the inherited route is GONE, not merely outvoted',
        !!env && env.ANTHROPIC_AUTH_TOKEN === undefined);
    // An overlay, not a replacement: everything the window carried that the
    // route says nothing about is still there, or the CLI loses PATH.
    ok('the rest of the environment is inherited, not thrown away',
        !!env && env.PATH === process.env.PATH);
}

// ------------------------------------------- 2. a card with NO route at all
//
// The half that is easy to forget: "no route" is not "no statement". The
// official endpoint is reached by CLEARING what the window carried, so a card
// with nothing picked is exactly the card an inherited variable hijacks.
{
    spawns.length = 0; asked.length = 0;
    const h = host();
    h.start({ agentId: 'a-dev', agentName: 'developer', cwd: 'D:\\repo', engine: 'claude' });
    const env = spawns[0].opts && spawns[0].opts.env;
    ok('an unrouted card is given an environment too', !!env);
    ok('‼️ …and the route the WINDOW carried does not answer for it',
        !!env && env.ANTHROPIC_BASE_URL === undefined);
    ok('the runtime was still asked, with an empty route',
        asked.length === 1 && asked[0].route
        && !asked[0].route.providerId && !asked[0].route.tier);
}

// ------------------------------------- 3. a build with no runtime at all
//
// `engineRuntime` is optional — a build that was given none must behave exactly
// as it always did rather than start refusing to spawn.
{
    spawns.length = 0;
    const bare = new ConsoleHost(() => 'claude');
    bare.start({ agentId: 'a-dev', agentName: 'developer', cwd: 'D:\\repo', engine: 'claude' });
    ok('a host with no runtime still starts its session', spawns.length === 1);
    const env = spawns[0].opts && spawns[0].opts.env;
    ok('…and inherits the window, which is what it always did',
        !!env && env.ANTHROPIC_BASE_URL === 'https://inherited.example/anthropic');
}

if (hadUrl === undefined) { delete process.env.ANTHROPIC_BASE_URL; }
else { process.env.ANTHROPIC_BASE_URL = hadUrl; }
cp.spawn = realSpawn;
console.log(`test_console_route_env: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
