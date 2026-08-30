// X-101 — THE SHARED RUNTIME REGISTRY, AND THE ENVIRONMENT A CLAUDE ROUTE MUST
// NOT INHERIT.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. Agent Farm spawns every engine with
// `env: { ...process.env, ... }` (tasks.ts). That is the right default for four
// engines and a silent defect for the fifth: an `ANTHROPIC_BASE_URL` sitting in
// the user's shell is a SECOND answer to the question a route profile was
// chosen to answer, and the child obeys the inherited one for anything the
// profile did not name. Two routes, one session, no evidence in the transcript
// — which is exactly the failure X-98 measured in August.
//
// ‼️ THE LIST IS MEASURED, NOT REMEMBERED. Every name here was read out of the
// real `claude` binary on this machine (2026-08-30, 217 MB bundle):
//   grep -ao 'ANTHROPIC_[A-Z0-9_]*' claude | sort -u   → 75 names
//   grep -ao 'CLAUDE_[A-Z0-9_]*'    claude | sort -u
// The docs list a fraction of them. A hand-written allowlist built from the
// documentation would have missed ANTHROPIC_PROFILE, ANTHROPIC_CONFIG_DIR,
// ANTHROPIC_CUSTOM_HEADERS, ANTHROPIC_UNIX_SOCKET and the whole Bedrock /
// Vertex / Foundry family — every one of which redirects the route.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const R = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));

// ---------- THE RULE: WHICH NAMES DECIDE WHERE A CLAUDE PROCESS TALKS ----------
{
    // ‼️ A PREFIX, NOT A LIST, ON THE ANTHROPIC SIDE. All 75 measured names are
    // route, credential, model-mapping, alternate-backbone or org identity —
    // there is no ANTHROPIC_* that a run legitimately inherits while being told
    // to use a different route. A named list would go stale the first time the
    // CLI shipped a new one, and it would go stale SILENTLY, in the direction
    // of leaking.
    ok('a name nobody has invented yet is still a route name',
        R.isRouteEnvName('ANTHROPIC_SOMETHING_SHIPPED_NEXT_YEAR') === true);

    for (const n of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
        'ANTHROPIC_CUSTOM_HEADERS', 'ANTHROPIC_UNIX_SOCKET', 'ANTHROPIC_PROFILE',
        'ANTHROPIC_CONFIG_DIR', 'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_VERTEX_PROJECT_ID',
        'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_ORGANIZATION_ID']) {
        ok(`measured route name is recognised: ${n}`, R.isRouteEnvName(n) === true);
    }

    // ‼️ THE CLAUDE_ FAMILY IS NOT A PREFIX, AND THAT IS THE WHOLE POINT OF
    // MEASURING IT. It holds the alternate backbones and the plan credential —
    // and it also holds the working context Agent Farm itself depends on.
    // Clearing CLAUDE_PROJECT_DIR would break the user's own hooks in the name
    // of isolating a route they are not even changing.
    for (const n of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
        'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_HOST_CREDS_FILE',
        'CLAUDE_CODE_SESSION_ACCESS_TOKEN', 'CLAUDE_CONFIG_DIR']) {
        ok(`measured CLAUDE_ route name is recognised: ${n}`, R.isRouteEnvName(n) === true);
    }
    for (const n of ['CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_JOB_DIR',
        'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']) {
        ok(`working context is NOT a route name and survives: ${n}`,
            R.isRouteEnvName(n) === false);
    }
    for (const n of ['PATH', 'HOME', 'OPENAI_API_KEY', 'ANTHROPICS_OWN_THING', 'CLAUDECODE']) {
        ok(`unrelated name is left alone: ${n}`, R.isRouteEnvName(n) === false);
    }

    // ‼️ THE NAMES ARE READ OUT OF THE ENVIRONMENT THAT WOULD ACTUALLY BE
    // INHERITED, not asserted from a table. Clearing a name that is not set
    // costs nothing but says nothing either; the point of the list is that it
    // names what is REALLY there, so a launch manifest can record it.
    const found = R.inheritedRouteEnv({
        PATH: '/usr/bin',
        ANTHROPIC_BASE_URL: 'https://api.kimi.example',
        ANTHROPIC_API_KEY: 'sk-should-not-survive',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_PROJECT_DIR: 'D:/work',
        ANTHROPIC_EMPTY: ''
    });
    eq('only the route names present in the environment are named',
        found.slice().sort(),
        ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK'].sort());
    ok('an empty value is nothing to clear',
        found.includes('ANTHROPIC_EMPTY') === false);
    ok('the working context is not in the clear list',
        found.includes('CLAUDE_PROJECT_DIR') === false);
    eq('an environment with no route in it produces no clear list',
        R.inheritedRouteEnv({ PATH: '/usr/bin', HOME: '/home/x' }), []);
    eq('no environment at all is not an error', R.inheritedRouteEnv(undefined), []);
}

// ---------- THE INJECTION: a chosen route, and nothing of the one it replaces ----------
{
    const profile = {
        id: 'kimi-work', label: 'Kimi (work)', engine: 'claude', providerId: 'kimi',
        baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
        tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }, revision: 3
    };
    const inherited = {
        PATH: '/usr/bin',
        ANTHROPIC_BASE_URL: 'https://someone-elses-route.example',
        ANTHROPIC_AUTH_TOKEN: 'inherited-token',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_PROJECT_DIR: 'D:/work'
    };

    // ‼️ NOTHING CHOSEN IS NOT A REASON TO TOUCH ANYTHING. A user who has never
    // opened this feature is running on their own shell's setup deliberately;
    // sanitising it because Agent Farm now COULD would break a working machine
    // to enforce a choice nobody made.
    const none = R.claudeRouteRuntime(undefined, undefined, inherited);
    eq('no route chosen clears nothing', none.clearEnv, []);
    eq('…and injects nothing', none.spawnEnv, {});
    eq('…and claims no route', none.route, {});

    const run = R.claudeRouteRuntime(profile, 'sk-secret-value', inherited, 'opus');

    // ‼️ THE POINT OF THE WHOLE ITEM. An inherited base url is a second answer
    // to the question the profile was chosen to answer.
    ok('the inherited base url is cleared', run.clearEnv.includes('ANTHROPIC_BASE_URL'));
    ok('the inherited token is cleared', run.clearEnv.includes('ANTHROPIC_AUTH_TOKEN'));
    ok('an inherited alternate backbone is cleared',
        run.clearEnv.includes('CLAUDE_CODE_USE_BEDROCK'));
    ok('the working context survives the isolation',
        run.clearEnv.includes('CLAUDE_PROJECT_DIR') === false);

    eq('the chosen base url is what the child gets',
        run.spawnEnv.ANTHROPIC_BASE_URL, 'https://api.moonshot.ai/anthropic');
    eq('an api-key route signs in with ANTHROPIC_API_KEY',
        run.spawnEnv.ANTHROPIC_API_KEY, 'sk-secret-value');
    ok('…and does not also set the oauth variable',
        run.spawnEnv.ANTHROPIC_AUTH_TOKEN === undefined);
    eq('the tier is resolved to the model THIS route serves for it',
        run.spawnEnv.ANTHROPIC_MODEL, 'kimi-k2-thinking');

    // ‼️ CLEARING AND SETTING THE SAME NAME IS NOT A CONTRADICTION, IT IS THE
    // ORDER. `clearEnv` is applied to the inherited environment and `spawnEnv`
    // is written afterwards; a name in both ends up holding the chosen value.
    // Recorded so a reader of the manifest is not left wondering.
    ok('a name can be both cleared and set — that is the isolation working',
        run.clearEnv.includes('ANTHROPIC_BASE_URL')
        && run.spawnEnv.ANTHROPIC_BASE_URL === 'https://api.moonshot.ai/anthropic');

    // ---- the credential boundary, measured rather than promised ----
    const asText = JSON.stringify(run.route);
    ok('‼️ the public route half carries no credential',
        asText.includes('sk-secret-value') === false);
    eq('the public half names the endpoint', run.route.baseUrl, 'https://api.moonshot.ai/anthropic');
    eq('…and the KIND of sign-in, never the sign-in', run.route.authKind, 'api-key');
    eq('…and the tier that was asked for', run.route.tier, 'opus');
    eq('the public half has exactly the three redacted fields',
        Object.keys(run.route).sort(), ['authKind', 'baseUrl', 'tier']);

    // An oauth route uses the other variable — measured from the CLI, which
    // treats ANTHROPIC_AUTH_TOKEN as a bearer and ANTHROPIC_API_KEY as a key.
    const oauth = R.claudeRouteRuntime(
        { ...profile, authKind: 'oauth' }, 'oauth-bearer', inherited, 'sonnet');
    eq('an oauth route signs in with ANTHROPIC_AUTH_TOKEN',
        oauth.spawnEnv.ANTHROPIC_AUTH_TOKEN, 'oauth-bearer');
    ok('…and does not also set the api key', oauth.spawnEnv.ANTHROPIC_API_KEY === undefined);
    eq('…and resolves its own tier', oauth.spawnEnv.ANTHROPIC_MODEL, 'kimi-k2');

    // ‼️ NO CREDENTIAL IS NOT AN EMPTY CREDENTIAL. Writing an empty key would
    // sign in as nobody against a route that expects one, and the CLI's error
    // would name an auth failure rather than the missing profile key.
    const noKey = R.claudeRouteRuntime(profile, undefined, inherited, 'opus');
    ok('a profile with no stored key sets no key variable',
        noKey.spawnEnv.ANTHROPIC_API_KEY === undefined
        && noKey.spawnEnv.ANTHROPIC_AUTH_TOKEN === undefined);
    ok('…but the route is still isolated, because the choice was still made',
        noKey.clearEnv.includes('ANTHROPIC_BASE_URL'));

    // A tier the route does not map is not silently the wrong model.
    const badTier = R.claudeRouteRuntime(profile, 'k', inherited, 'haiku');
    ok('an unmapped tier names no model rather than guessing one',
        badTier.spawnEnv.ANTHROPIC_MODEL === undefined);

    // ‼️ THE USER'S OWN ANTHROPIC ROUTE IS STILL A CHOICE. Picking "Anthropic"
    // has no base url and no key of its own — the sign-in is in the credentials
    // FILE — but an inherited base url would still send it somewhere else while
    // the manifest recorded Anthropic. So it isolates and injects nothing.
    const firstParty = R.claudeRouteRuntime(
        { id: 'anthropic', label: 'Anthropic', engine: 'claude', providerId: 'anthropic', tiers: {}, revision: 1 },
        undefined, inherited);
    ok('choosing the first-party route still clears an inherited one',
        firstParty.clearEnv.includes('ANTHROPIC_BASE_URL'));
    eq('…and injects nothing at all', firstParty.spawnEnv, {});
}

// ---------- THE ENVIRONMENT A SPAWN ACTUALLY GETS ----------
//
// ‼️ THIS IS WHERE THE ITEM EITHER LANDS OR STAYS A LIBRARY. `tasks.ts` builds
// `{ ...process.env, ...engineEnv, ...secrets }` at two call sites; until the
// clearing happens THERE, every measurement above is a fact nobody acts on.
{
    const inherited = {
        PATH: '/usr/bin',
        ANTHROPIC_BASE_URL: 'https://inherited.example',
        ANTHROPIC_API_KEY: 'inherited-key',
        CLAUDE_PROJECT_DIR: 'D:/work',
        NOT_SET: undefined
    };
    const engineEnv = { AGENT_FARM_CONSTITUTION: '/path/to/CLAUDE.md' };
    const secrets = { GITHUB_TOKEN: 'gh-token' };

    // Nothing resolved is the four-engine case, and it must stay byte-for-byte
    // what it was before this item existed.
    const plain = R.spawnEnvironment(inherited, [engineEnv, secrets], undefined);
    eq('with no route resolved the environment is the plain merge',
        [plain.PATH, plain.ANTHROPIC_BASE_URL, plain.AGENT_FARM_CONSTITUTION, plain.GITHUB_TOKEN],
        ['/usr/bin', 'https://inherited.example', '/path/to/CLAUDE.md', 'gh-token']);
    ok('…and an unset name does not become the string "undefined"',
        Object.prototype.hasOwnProperty.call(plain, 'NOT_SET') === false);

    const isolated = R.spawnEnvironment(inherited, [engineEnv, secrets], {
        clearEnv: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'],
        spawnEnv: { ANTHROPIC_BASE_URL: 'https://api.moonshot.ai/anthropic', ANTHROPIC_API_KEY: 'chosen-key' }
    });
    eq('the chosen endpoint is what the child sees',
        isolated.ANTHROPIC_BASE_URL, 'https://api.moonshot.ai/anthropic');
    eq('…and the chosen key', isolated.ANTHROPIC_API_KEY, 'chosen-key');
    eq('everything unrelated is untouched',
        [isolated.PATH, isolated.CLAUDE_PROJECT_DIR, isolated.AGENT_FARM_CONSTITUTION, isolated.GITHUB_TOKEN],
        ['/usr/bin', 'D:/work', '/path/to/CLAUDE.md', 'gh-token']);

    // ‼️ A NAME CLEARED AND NOT RE-SET IS GONE, NOT EMPTY. `ANTHROPIC_API_KEY=''`
    // is a variable the CLI still finds and still tries to sign in with; the
    // absence is what makes it fall through to the credentials file.
    const cleared = R.spawnEnvironment(inherited, [], { clearEnv: ['ANTHROPIC_BASE_URL'] });
    ok('a cleared name is absent rather than empty',
        Object.prototype.hasOwnProperty.call(cleared, 'ANTHROPIC_BASE_URL') === false);

    // ‼️ THE CLEARING REACHES THE LATER LAYERS TOO, AND THAT IS A DECISION.
    // A per-agent secret named ANTHROPIC_BASE_URL and a chosen route are two
    // answers to one question. The route wins because the route is what gets
    // WRITTEN DOWN — the launch manifest records it and the transcript does not
    // (measured, X-98), so letting the quieter one win would make the only
    // record of the run a lie. Where no route is chosen, nothing is cleared and
    // the per-agent value is used exactly as before.
    const conflict = R.spawnEnvironment(
        inherited,
        [{ ANTHROPIC_BASE_URL: 'https://per-agent.example' }],
        { clearEnv: ['ANTHROPIC_BASE_URL'], spawnEnv: { ANTHROPIC_BASE_URL: 'https://chosen.example' } });
    eq('a per-agent value cannot outrank the route that gets recorded',
        conflict.ANTHROPIC_BASE_URL, 'https://chosen.example');

    // The private half is the last word, so a name in both lists ends up
    // holding the chosen value — the order this whole design rests on.
    const order = R.spawnEnvironment({ X: 'inherited' }, [], {
        clearEnv: ['X'], spawnEnv: { X: 'chosen' }
    });
    eq('cleared then set leaves the chosen value', order.X, 'chosen');
}

// ---------- THE SAME ISOLATION, THROUGH A VS CODE TERMINAL ----------
//
// ‼️ A TERMINAL IS NOT A SPAWN, AND THE DIFFERENCE IS THE WHOLE OF THIS PIECE.
// `cp.spawn` is handed a COMPLETE environment, so removing a name means not
// putting it in. `vscode.window.createTerminal({ env })` is handed an OVERLAY
// merged onto the window's environment, so leaving a name out changes nothing —
// the inherited one survives untouched, which is precisely the failure.
//
// Measured in the API's own types rather than assumed:
//   env?: { [key: string]: string | null | undefined }
//   …and `null` is the documented way to REMOVE a variable.
// Without that, an isolated route would be impossible on this surface and the
// honest thing would have been to refuse the launch rather than run it wrong.
{
    const overlay = R.terminalEnvOverlay(
        [{ GITHUB_TOKEN: 'gh' }],
        {
            clearEnv: ['ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK'],
            spawnEnv: { ANTHROPIC_BASE_URL: 'https://chosen.example', ANTHROPIC_API_KEY: 'k' }
        });

    // ‼️ `null`, NOT `''`. An empty string is a variable the CLI still finds and
    // still signs in with; only the removal makes it fall through.
    eq('an inherited name with no replacement is REMOVED, not blanked',
        overlay.CLAUDE_CODE_USE_BEDROCK, null);
    eq('a cleared name that IS replaced carries the chosen value',
        overlay.ANTHROPIC_BASE_URL, 'https://chosen.example');
    eq('…and an injected name that was never inherited is simply set',
        overlay.ANTHROPIC_API_KEY, 'k');
    eq('other layers pass through untouched', overlay.GITHUB_TOKEN, 'gh');

    // Nothing resolved must leave this surface exactly as it was.
    eq('with no route resolved the overlay is just the layers',
        R.terminalEnvOverlay([{ GITHUB_TOKEN: 'gh' }], undefined), { GITHUB_TOKEN: 'gh' });
    eq('…and no layers either is an empty overlay, not a crash',
        R.terminalEnvOverlay([], undefined), {});
    eq('an undefined layer is skipped rather than spread',
        R.terminalEnvOverlay([undefined, { A: '1' }], undefined), { A: '1' });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
