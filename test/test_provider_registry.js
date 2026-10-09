// X-101 — ONE ENTRANCE, AND THE TWO ENGINES THAT MEAN DIFFERENT THINGS BY
// "PROVIDER" COMING OUT OF IT WITHOUT MIXING.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. The item's acceptance line is that
// terminal, Console and headless all use the SAME registry symbol, and that
// three Claude routes and an OpenCode native selection work side by side
// without contaminating one another. Those are not two wishes — the second is
// what the first buys. A surface that resolves a launch its own way is a second
// answer to "which route is this", and the first time the two disagree nothing
// says so out loud.
//
// ‼️ AND THE TWO ENGINES ARE OPPOSITE IN THE ONE PLACE IT MATTERS. On Claude a
// route is Agent Farm's to inject and is fixed for the session; on OpenCode the
// provider is the ENGINE's, changes legitimately at a turn boundary, and Agent
// Farm must not manage its sign-in a second time. An adapter that treated them
// alike would either leak Agent Farm's key into an engine that has its own, or
// pretend an OpenCode session is pinned to a provider it can change mid-flight.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));

// The three Claude routes the acceptance line names, held as profiles the way
// X-100 stores them, plus one OpenCode-native selection.
const PROFILES = [
    {
        id: 'anthropic', label: 'Anthropic', engines: ['claude'], providerId: 'anthropic',
        tiers: {}, revision: 1
    },
    {
        id: 'kimi-work', label: 'Kimi (work)', engines: ['claude'], providerId: 'kimi',
        baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
        tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }, revision: 3
    },
    {
        id: 'minimax-lab', label: 'MiniMax (lab)', engines: ['claude'], providerId: 'minimax',
        baseUrl: 'https://api.minimax.io/anthropic', authKind: 'api-key',
        tiers: { opus: 'MiniMax-M2' }, revision: 1
    }
];
const SECRETS = { 'kimi-work': 'kimi-key-SECRET', 'minimax-lab': 'minimax-key-SECRET' };
const deps = () => ({
    profiles: PROFILES,
    secretFor: id => SECRETS[id],
    inheritedEnv: {
        PATH: '/usr/bin',
        ANTHROPIC_BASE_URL: 'https://inherited.example',
        ANTHROPIC_API_KEY: 'inherited-key',
        CLAUDE_PROJECT_DIR: 'D:/work'
    }
});

// ---------- THE REGISTRY: one question, one answer, for every engine ----------
{
    eq('claude has a provider axis', G.adapterFor('claude', deps()).axis, 'provider');
    eq('opencode has a provider axis', G.adapterFor('opencode', deps()).axis, 'provider');
    for (const e of ['codex', 'gemini', 'antigravity']) {
        eq(`${e} answers "not applicable" rather than being absent`,
            G.adapterFor(e, deps()).axis, 'not-applicable');
    }
    // ‼️ An engine nobody has heard of is not a crash and not a Claude. The
    // registry is asked by name from surfaces that read the name off a record.
    eq('an unknown engine is not applicable rather than an exception',
        G.adapterFor('some-engine-shipped-later', deps()).axis, 'not-applicable');

    // ‼️ THE FIELD THAT KEEPS THE TWO ENGINES HONEST (X-98's `scope`).
    ok('a claude route is fixed for the session',
        G.adapterFor('claude', deps()).providerScope === 'session'
        && G.adapterFor('claude', deps()).canSwitchProviderAtTurnBoundary === false);
    ok('an opencode provider may change at a turn boundary',
        G.adapterFor('opencode', deps()).providerScope === 'turn'
        && G.adapterFor('opencode', deps()).canSwitchProviderAtTurnBoundary === true);
}

// ---------- CLAUDE: the route is Agent Farm's, and it is injected in isolation ----------
{
    const r = G.resolveRuntime('claude', { engine: 'claude', providerId: 'kimi-work', tier: 'opus' }, deps());

    eq('the chosen route is what the child talks to',
        r.spawnEnv.ANTHROPIC_BASE_URL, 'https://api.moonshot.ai/anthropic');
    eq('the tier is resolved through THIS route', r.spawnEnv.ANTHROPIC_MODEL, 'kimi-k2-thinking');
    eq('the profile key signs it in', r.spawnEnv.ANTHROPIC_API_KEY, 'kimi-key-SECRET');
    ok('the inherited route is cleared', r.clearEnv.includes('ANTHROPIC_BASE_URL'));
    ok('the inherited key is cleared', r.clearEnv.includes('ANTHROPIC_API_KEY'));
    ok('the working context survives', r.clearEnv.includes('CLAUDE_PROJECT_DIR') === false);

    // ---- the identity that goes to the manifest ----
    eq('the identity names the engine', r.identity.engine, 'claude');
    eq('…and the provider, as the catalog spells it', r.identity.providerId, 'kimi');
    eq('…and says Agent Farm owns this route', r.identity.origin, 'agent-farm-profile');
    eq('…and that a claude route is a session-long fact', r.identity.scope, 'session');
    eq('…and which stored profile it was', r.identity.providerProfileId, 'kimi-work');
    eq('…at which revision, so a later edit is visible',
        r.identity.providerProfileRevision, 3);
    eq('…and the model actually requested', r.identity.requestedModelRef, 'kimi-k2-thinking');
    eq('…declared before the spawn, which is the only authority here',
        r.identity.proof, 'launch-declared');

    // ‼️ THE BOUNDARY, MEASURED RATHER THAN PROMISED. The identity is written to
    // manifests, read over the bridge, drawn in the UI and carried into exports.
    // A key reaching it reaches all four.
    ok('‼️ no credential is anywhere in the public identity',
        JSON.stringify(r.identity).includes('SECRET') === false);
    ok('…and the route half carries only the redacted three',
        JSON.stringify(Object.keys(r.identity.route || {}).sort())
        === JSON.stringify(['authKind', 'baseUrl', 'tier']));
    // The key IS in the private half — that half exists to carry it.
    ok('the credential does travel in the private half',
        JSON.stringify(r.spawnEnv).includes('kimi-key-SECRET'));

    // Claude takes no provider argument on the command line: the route is
    // environment, and a `-m` here would be a second answer to the tier.
    eq('a claude route implies no command-line argument', r.args, []);
}

// ---------- THE ACCEPTANCE LINE: three routes side by side, no contamination ----------
{
    const d = deps();
    const kimi = G.resolveRuntime('claude', { engine: 'claude', providerId: 'kimi-work', tier: 'opus' }, d);
    const mini = G.resolveRuntime('claude', { engine: 'claude', providerId: 'minimax-lab', tier: 'opus' }, d);
    const first = G.resolveRuntime('claude', { engine: 'claude', providerId: 'anthropic' }, d);

    eq('kimi keeps its own model', kimi.spawnEnv.ANTHROPIC_MODEL, 'kimi-k2-thinking');
    eq('minimax keeps its own model', mini.spawnEnv.ANTHROPIC_MODEL, 'MiniMax-M2');
    ok('…and their keys never cross',
        kimi.spawnEnv.ANTHROPIC_API_KEY === 'kimi-key-SECRET'
        && mini.spawnEnv.ANTHROPIC_API_KEY === 'minimax-key-SECRET');
    ok('…nor their endpoints',
        kimi.spawnEnv.ANTHROPIC_BASE_URL !== mini.spawnEnv.ANTHROPIC_BASE_URL);

    // ‼️ THE FIRST-PARTY ROUTE IS THE ONE MOST EASILY GOT WRONG. It has no base
    // url and no key of its own — the sign-in lives in the credentials FILE —
    // so "inject nothing" is right and "leave the inherited one alone" is not:
    // an inherited base url would send it to a third party while the manifest
    // said Anthropic. That is the exact lie X-98 measured.
    // Nothing to inject means the field is absent, not an empty object — a
    // caller merging `{}` into an environment and a caller merging nothing are
    // the same thing, and the absent form says which case this is.
    eq('the first-party route injects nothing at all', first.spawnEnv, undefined);
    ok('…but still clears the inherited one',
        first.clearEnv.includes('ANTHROPIC_BASE_URL'));
    ok('…and no other route\'s key rides along',
        JSON.stringify(first.spawnEnv || {}).includes('SECRET') === false);

    // ‼️ A ROUTE WITH NO STORED KEY IS REFUSED BEFORE THE SPAWN, not on a [y/n]
    // in a terminal nobody is watching — except where the route does not need
    // one, which is precisely the first-party case.
    const a = G.adapterFor('claude', d);
    eq('a third-party route that HAS its key is refused nothing',
        a.preflight({ engine: 'claude', providerId: 'minimax-lab' }), []);
    ok('a route that is not in the catalog is refused by name',
        a.preflight({ engine: 'claude', providerId: 'not-a-route' })
            .some(m => /not-a-route/.test(m)));
    eq('the first-party route needs nothing and is refused nothing',
        a.preflight({ engine: 'claude', providerId: 'anthropic' }), []);
    // ‼️ A tier the route does not map fails BEFORE the spawn. Left to the
    // engine it would either error on a prompt nobody is watching or, worse,
    // answer on whatever model the endpoint defaults to.
    ok('a tier this route does not map is refused by name',
        a.preflight({ engine: 'claude', providerId: 'minimax-lab', tier: 'haiku' })
            .some(m => /haiku/.test(m)));

    // ‼️ A THIRD-PARTY ROUTE WITH NO STORED KEY IS THE FAILURE WORTH CATCHING
    // EARLY: it spawns, reaches a stranger's endpoint unauthenticated, and the
    // error a person then reads is about authentication rather than about the
    // profile that has no key in it.
    const keyless = G.adapterFor('claude', { ...d, secretFor: () => undefined });
    ok('a third-party route with no key is refused by name',
        keyless.preflight({ engine: 'claude', providerId: 'minimax-lab' })
            .some(m => /key/i.test(m)));
    eq('…while the first-party route needs none and is still fine',
        keyless.preflight({ engine: 'claude', providerId: 'anthropic' }), []);
}

// ---------- OPENCODE: the engine's own provider, and Agent Farm keeps its hands off ----------
{
    const r = G.resolveRuntime('opencode',
        { engine: 'opencode', providerId: 'opencode', modelId: 'opencode/big-pickle' }, deps());

    eq('the model is passed the way the CLI spells it', r.args, ['-m', 'opencode/big-pickle']);

    // ‼️ THE WHOLE POINT OF THE OPENCODE HALF. That engine owns `auth.json` and
    // `opencode.json`; a second copy of its credential here would be a second
    // vault, a second revision and two truths that eventually disagree. So the
    // adapter contributes NO environment and NO clearing — including no
    // Anthropic clearing, because an OpenCode run through an Anthropic provider
    // is the engine's own arrangement and not ours to sanitise.
    eq('opencode is handed no environment of ours', r.spawnEnv, undefined);
    eq('…and nothing of the user\'s is cleared for it', r.clearEnv, undefined);

    eq('the identity says the engine owns this', r.identity.origin, 'engine-native');
    eq('…and that it may change at a turn boundary', r.identity.scope, 'turn');
    eq('…and names the wire model', r.identity.requestedModelRef, 'opencode/big-pickle');
    ok('…and hangs no Agent Farm profile on it',
        r.identity.providerProfileId === undefined);

    // A bare model with no provider half is still what the engine was given.
    const bare = G.resolveRuntime('opencode', { engine: 'opencode', modelId: 'anthropic/claude-opus-5' }, deps());
    eq('a qualified model without a separate provider still passes through',
        bare.args, ['-m', 'anthropic/claude-opus-5']);
    // ‼️ AND THE PROVIDER IS NOT TAKEN OFF THE FRONT OF THAT NAME. Splitting on
    // the slash would be right most of the time, which is what makes it the
    // wrong rule: it is a guess that happens to agree, and it goes on agreeing
    // confidently after the day it stops being true. Nothing has read the
    // catalog here, so the honest answer is none — which
    // `providerIdentity.ts` requires this system to be able to give.
    eq('an unread catalog names no provider rather than splitting the model name',
        bare.identity.providerId, '');
    eq('…and says so as "unknown" rather than claiming the engine reported it',
        bare.identity.origin, 'unknown');
    // Nothing chosen is nothing added — the engine's own default is the answer.
    eq('no model chosen adds no argument',
        G.resolveRuntime('opencode', { engine: 'opencode' }, deps()).args, []);
}

// ---------- AN ENGINE WITH NO PROVIDER AXIS ----------
{
    const r = G.resolveRuntime('codex', { engine: 'codex', modelId: 'gpt-5' }, deps());
    eq('it carries no provider value at all', r.identity.providerId, '');
    eq('…and says so as an answer', r.identity.origin, 'not-applicable');
    eq('…and nothing is injected or cleared', [r.spawnEnv, r.clearEnv], [undefined, undefined]);
}

// ---------- RESUME: what a route change means, per engine ----------
{
    const claude = G.adapterFor('claude', deps());
    const prev = {
        engine: 'claude', providerId: 'kimi', origin: 'agent-farm-profile', scope: 'session',
        providerProfileId: 'kimi-work', requestedModelRef: 'kimi-k2-thinking', proof: 'launch-declared'
    };
    eq('resuming the same route is just a resume',
        claude.resumePolicy(prev, { engine: 'claude', providerId: 'kimi-work' }).act, 'resume');
    // ‼️ MEASURED IN AUGUST (X-98): resuming a session through a DIFFERENT route
    // mixed two routes' models into one transcript. On this engine a route is a
    // different program, so the honest act is to fork rather than to pretend.
    eq('resuming through a different route forks instead of lying',
        claude.resumePolicy(prev, { engine: 'claude', providerId: 'minimax-lab' }).act, 'fork');
    ok('…and says why in words a person can read',
        /route/i.test(claude.resumePolicy(prev, { engine: 'claude', providerId: 'minimax-lab' }).why || ''));

    // On OpenCode the same change is a documented feature, not a defect.
    const oc = G.adapterFor('opencode', deps());
    eq('opencode resumes across a provider change, because that is its feature',
        oc.resumePolicy(
            { engine: 'opencode', providerId: 'opencode', origin: 'engine-native', scope: 'turn', requestedModelRef: 'opencode/big-pickle', proof: 'engine-reported' },
            { engine: 'opencode', providerId: 'anthropic' }).act,
        'resume');
}

// ---------- BILLING: whose figure is a real bill ----------
{
    const claude = G.adapterFor('claude', deps());
    // A third-party Anthropic-compatible endpoint still makes Claude write an
    // Anthropic-priced total — measured — so that figure is not this vendor's
    // bill. The first-party route's is.
    ok('a third-party route\'s own cost figure is not authoritative',
        claude.billingPolicy({ engine: 'claude', providerId: 'kimi-work' })
            .engineCostIsAuthoritative === false);
    ok('the first-party route\'s figure is',
        claude.billingPolicy({ engine: 'claude', providerId: 'anthropic' })
            .engineCostIsAuthoritative === true);
    ok('…and only a first-party run counts against the plan quota',
        claude.billingPolicy({ engine: 'claude', providerId: 'kimi-work' })
            .countsAgainstPlanQuota === false);
}

// ---------- ‼️ IS ANY OF THIS ACTUALLY WIRED IN ----------
//
// X-100 shipped a correct, well-tested core that NOTHING CALLED, and the defect
// survived a release because every test it had was about the core. This section
// is the answer to that: it reads the real source and fails the build if the
// registry goes back to being a library nobody invokes.
{
    const fs = require('fs');
    // ‼️ NEWLINES NORMALISED, AND THAT IS NOT COSMETIC. The guarantees below are
    // regexes over source and some of them span lines; `src/core/tasks.ts` is
    // CRLF, so `env\r\n` never matched `env\n` and the "same map to both doors"
    // assertion sat red for days with the code it checks correct throughout. A
    // shape assertion must fail for a change of shape and nothing else.
    const src = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
    const ext = src('src', 'extension.ts');
    const tasks = src('src', 'core', 'tasks.ts');

    // ---- the spawn sites ----
    ok('‼️ the runner builds its environment through the shared function',
        /spawnEnvironment\(/.test(tasks));
    // The old shape, byte for byte. If it comes back at either call site, an
    // inherited route rides along again and nothing says so.
    ok('‼️ no spawn site spreads process.env with the route still in it',
        /\.\.\.process\.env, \.\.\.engineEnv/.test(tasks) === false);
    ok('…and both spawn shapes use the one environment that was built',
        (tasks.match(/env: spawnEnv/g) || []).length === 2);
    ok('the runner is handed an ANSWER, not the profiles and the keychain',
        /engineRuntime\?:/.test(tasks) && /providerProfiles/.test(tasks) === false);

    // ---- the TERMINAL surfaces, which the acceptance line names too ----
    //
    // ‼️ A TERMINAL IS AN OVERLAY, NOT A COMPLETE ENVIRONMENT: leaving a route
    // name out of it changes nothing and the inherited one survives. So these
    // two call sites must go through `terminalEnvOverlay`, which says the
    // clearing out loud as `null`, and NOT through the spawn builder.
    //
    // ‼️ X-104 — AND THE OVERLAY IS BUILT ONCE PER SURFACE, ABOVE THE BRANCH.
    // It used to be written inline on the `createTerminal` call, which is how
    // the OS-window branch beside it came to carry NO environment at all: not
    // the agent's variables and not the route's endpoint and key, so a session
    // picked as Kimi opened on the default route with every surface agreeing it
    // had not. The guarantee is not loosened here, it is widened — the same map
    // has to reach BOTH doors.
    ok('‼️ the interactive task terminal isolates through the overlay',
        /const env = terminalEnvOverlay\(/.test(tasks));
    ok('…and hands that same map to the OS window as well as the integrated one',
        /openExternalTerminal\([\s\S]{0,400}?\n\s*env\n\s*\}\);/.test(tasks)
        && /createTerminal\(\{[\s\S]{0,700}?\n\s*env\n\s*\}\)/.test(tasks));
    ok('‼️ the session terminal does too',
        /const termEnv = terminalEnvOverlay\(/.test(ext));
    ok('…and both of its doors take it',
        /openExternalTerminal\(cwd, command, title, \{ env: termEnv \}\)/.test(ext)
        && /createTerminal\(\{ name: title, cwd, env: termEnv \}\)/.test(ext));
    // ‼️ AND ALL OF THEM THROUGH ONE SYMBOL. That is the acceptance line itself:
    // three surfaces resolving a launch three ways are three answers to "which
    // route is this run on", and the transcript records none of them.
    // ‼️ X-103 — …AND THE SIGNATURE NOW CARRIES WHAT THIS LAUNCH PICKED. The
    // route used to be readable only out of the settings file, so asking "this
    // agent on this engine" was the whole question. A per-launch route makes the
    // third argument part of the guarantee: a call site that dropped it would
    // run the session on the agent's standing route while the row the person
    // pressed said otherwise — a lie of exactly the kind X-101 exists to end,
    // arriving through a picker instead of through an inherited variable.
    ok('‼️ every surface resolves through the SAME named function',
        /const engineRuntimeFor = \(/.test(ext)
        && /engineRuntime: \(agentId, engine, route\) => engineRuntimeFor\(agentId, engine, route\)/.test(ext)
        && /engineRuntimeFor\(termAgentId, engine \|\| 'claude', route\)/.test(ext));
    ok('…and the resolution is written once, not once per surface',
        (ext.match(/resolveRuntime\(engine, \{/g) || []).length === 1);

    // ---- the CONSOLE, the third surface the acceptance line names ----
    //
    // ‼️ THIS HOST SPAWNED WITH NO `env` AT ALL, so it inherited whatever the
    // VS Code window carried — the runner's defect, on the surface people
    // actually sit and watch.
    const con = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('‼️ the console builds its spawn environment rather than inheriting the window\'s',
        /env: spawnEnvironment\(/.test(con));
    ok('…through the dep it is handed, not by reading profiles itself',
        /this\.engineRuntime\?\.\(h\.state\.agentId, h\.engine\.id, \{/.test(con)
        && /providerProfiles|secretKeyFor/.test(con) === false);
    // ‼️ X-103 — AND THE CARD'S OWN ROUTE, NOT THE AGENT'S CURRENT ONE. Every
    // re-spawn of a persistent engine comes through that call, so reading the
    // route off the SESSION STATE is what keeps a long conversation on the
    // endpoint it began on — including across a window reload, which is exactly
    // why it is on the state and not on the per-window host record.
    ok('‼️ …and the console asks for the route the CARD was started on',
        /providerId: h\.state\.providerId, tier: h\.state\.tier/.test(con));
    // ‼️ THE TRAILING CHARACTER IS `[,)]` AND NOT `)`: X-169 added a SECOND dep
    // after this one (the account's environment layer), so the call no longer
    // ends here. What is being measured is that the console is handed the same
    // named resolver as the other three surfaces — not where the argument list
    // happens to stop.
    ok('‼️ and the extension gives it the same function the other three use',
        /\(agentId, engine, route\) => engineRuntimeFor\(agentId, engine, route\)[,)]/.test(ext));

    // ---- the extension supplies it ----
    ok('‼️ the extension really supplies the runtime dep',
        /engineRuntime: \(agentId, engine, route\)/.test(ext));
    ok('…resolving through the shared entrance rather than its own reading',
        /resolveRuntime\(engine, \{/.test(ext));
    ok('…and reads the choice from the per-agent store',
        /storedRoute\(/.test(ext));

    // ---- the bridge op, and the boundary it must not cross ----
    const at = ext.indexOf("op: 'providers.runtime'");
    ok('the bridge can be asked what a launch would run on', at > 0);
    const block = ext.slice(at, at + 3200);
    // ‼️ THE ONE THING THIS OP MUST NEVER DO. A bridge response is written to a
    // file by `af.js --out`, read by agents and quoted into notices; a key that
    // reaches it reaches all three.
    ok('‼️ it returns the NAMES of what would be injected, never the values',
        /injects: Object\.keys\(rt\.spawnEnv/.test(block));
    ok('…and never hands back the private half whole',
        /spawnEnv: rt\.spawnEnv/.test(block) === false);
    ok('…and its contract says so where an agent will read it',
        /NAMES, NEVER/.test(block));
    ok('it answers through the registry rather than resolving its own way',
        /adapterFor\(engine, rdeps\)/.test(block));
    ok('…and reports what preflight would refuse before anything spawns',
        /preflight: adapter\.preflight\(sel\)/.test(block));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
