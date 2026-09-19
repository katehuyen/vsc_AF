// X-117 — CLAUDE ROUTES END TO END, AGAINST LOCAL MOCK ENDPOINTS.
//
// The real `claude` CLI, spawned with the environment Agent Farm's OWN resolver
// (`providerRegistry`) and OWN spawn layering (`spawnEnvironment`) produce —
// pointed at three local HTTP servers that speak the Anthropic Messages API.
// Nothing leaves this machine and no real token is spent (measured: ~3.5s a
// turn). What every unit test before this could only assume is watched here on
// the wire:
//
//   1. Two routes running AT THE SAME TIME reach their own endpoint with their
//      own key and their own tier model, and never each other's.
//   2. An inherited ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY is never reached by a
//      routed run — and IS reached by a run with nothing chosen ("nothing chosen
//      means nothing touched", X-101).
//   3. Requested vs reported: a gateway answering under its own model name is
//      recorded as such, beside what was asked for.
//   4. The CLI's own cost figure on a third-party route is arithmetic, not a
//      bill, and fills no plan window.
//   5. No key reaches the CLI's output.
//   6. A removed route resolves to nothing and is refused before a spawn.
//
// Skipped (not failed) only when the CLI is not on PATH.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const RT = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
const B = require(path.join(ROOT, 'out', 'core', 'billing.js'));
const { cliPresent, anthropicMock: mock } = require('./e2e_mocks');

/** One turn of the real CLI in the environment it is handed. */
function runClaude(env, cwd) {
    return new Promise(resolve => {
        const child = cp.spawn('claude -p "say ping" --output-format stream-json --verbose --max-turns 1',
            { env, cwd, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        const kill = setTimeout(() => child.kill(), 120000);
        child.on('close', code => {
            clearTimeout(kill);
            const events = out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
            resolve({ code, events, out, err });
        });
    });
}

async function main() {
    if (!cliPresent('claude')) {
        console.log('  skipped: the claude CLI is not on PATH');
        console.log(`\n${pass} passed, ${fail} failed`);
        return;
    }
    const kimiM = await mock('kimi-k2-0905-gateway');
    const miniM = await mock();
    const wrongM = await mock();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-routes-'));
    try {
        const profiles = [
            { id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'kimi', baseUrl: kimiM.url, authKind: 'api-key',
                tiers: { opus: 'kimi-k2', sonnet: 'kimi-k2-mini' }, revision: 4 },
            { id: 'minimax', label: 'MiniMax', engine: 'claude', providerId: 'minimax', baseUrl: miniM.url, authKind: 'api-key',
                tiers: { opus: 'MiniMax-M2' }, revision: 1 }
        ];
        // ‼️ A BEARER TOKEN AND A MODEL TOO: the route writes a key and a model of
        // its own, so only the CLEARING keeps an inherited bearer off its wire.
        const inherited = { ANTHROPIC_BASE_URL: wrongM.url, ANTHROPIC_API_KEY: 'sk-inherited-CANARY',
            ANTHROPIC_AUTH_TOKEN: 'sk-inherited-bearer-CANARY', ANTHROPIC_SMALL_FAST_MODEL: 'inherited-small' };
        const deps = { profiles, secretFor: id => `sk-${id}-CANARY`, inheritedEnv: inherited };
        const adapter = R.adapterFor('claude', deps);

        // The machine's environment, minus anything that already names a route
        // or a config home — this test must never run as the session's own slot.
        const base = {};
        for (const [k, v] of Object.entries(process.env)) {
            if (!RT.isRouteEnvName(k) && k !== 'CLAUDE_CONFIG_DIR') { base[k] = v; }
        }
        const isolation = { CLAUDE_CONFIG_DIR: tmp, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
        const envFor = runtime => RT.spawnEnvironment({ ...base, ...inherited }, [isolation], runtime);

        // ---- 1–3. two routes, concurrently ----
        const kimiRt = adapter.resolveRuntime({ engine: 'claude', providerId: 'kimi', tier: 'opus' });
        const miniRt = adapter.resolveRuntime({ engine: 'claude', providerId: 'minimax', tier: 'opus' });
        const [kimiRun, miniRun] = await Promise.all([runClaude(envFor(kimiRt), tmp), runClaude(envFor(miniRt), tmp)]);
        ok('both routed turns finished', kimiRun.code === 0 && miniRun.code === 0);
        if (kimiRun.code !== 0 || miniRun.code !== 0) { console.log('  stderr:', (kimiRun.err + miniRun.err).slice(0, 400)); }
        ok('‼️ the Kimi turn reached ITS endpoint, with ITS key and ITS tier model',
            kimiM.posts().length >= 1 && kimiM.posts().every(h => h.key === 'sk-kimi-CANARY' && h.model === 'kimi-k2'));
        ok('‼️ the MiniMax turn reached ITS endpoint, with ITS key and ITS tier model',
            miniM.posts().length >= 1 && miniM.posts().every(h => h.key === 'sk-minimax-CANARY' && h.model === 'MiniMax-M2'));
        ok('‼️ the inherited endpoint was reached by NEITHER routed turn', wrongM.posts().length === 0);
        ok('‼️ …and no inherited bearer or model rode along on a routed wire (the clearing, not the overwrite)',
            [...kimiM.hits, ...miniM.hits].every(h => !/inherited/.test(h.auth) && !/inherited/.test(h.model)));

        ok('the identity records what was asked for', kimiRt.identity.providerId === 'kimi'
            && kimiRt.identity.requestedModelRef === 'kimi-k2' && kimiRt.identity.providerProfileRevision === 4);
        const reported = adapter.identityFromEvents(kimiRun.events) || {};
        ok('‼️ …and what came back is recorded beside it, under the gateway\'s own name',
            (reported.reportedModels || []).includes('kimi-k2-0905-gateway'));
        const miniReported = adapter.identityFromEvents(miniRun.events) || {};
        ok('…and a gateway answering under the asked name reports that name',
            (miniReported.reportedModels || []).includes('MiniMax-M2'));

        // ---- 4. cost ----
        const result = kimiRun.events.find(e => e.type === 'result') || {};
        const bill = B.billingOf({ engine: 'claude', providerId: 'kimi', origin: kimiRt.identity.origin,
            binding: 'declared', route: kimiRt.identity.route });
        ok('the CLI does print its own cost figure for the third-party turn', typeof result.total_cost_usd === 'number');
        ok('‼️ …and it is arithmetic on no plan window, never a bill', bill.planWindow === false && bill.dollar === 'arithmetic');

        // ---- 5. no key in the output ----
        ok('‼️ no key reaches the CLI output', !/CANARY/.test(kimiRun.out + kimiRun.err + miniRun.out + miniRun.err));

        // ---- 2b. nothing chosen means nothing touched ----
        const bareRt = adapter.resolveRuntime({ engine: 'claude' });
        const bareRun = await runClaude(envFor(undefined), tmp);
        ok('a run with no route chosen finished', bareRun.code === 0);
        ok('‼️ …and ran on the inherited endpoint, untouched — which is the rule, not a leak',
            wrongM.posts().length >= 1 && wrongM.posts().every(h => h.key === 'sk-inherited-CANARY'));
        ok('…recorded as a run nobody routed', !bareRt.identity.providerId);

        // ---- 5b. X-113 — where the CONTEXT figure comes from ----
        /**
         * ‼️ THE FIGURE IS THE ENGINE'S, AND ON A THIRD-PARTY ROUTE THAT IS THE
         * WHOLE POINT.
         *
         * A gateway counts its own tokens; nothing this side could recompute
         * them, and a number assembled here would be a guess wearing the
         * engine's authority. So the source is the CLI's own `result` event, and
         * what this proves is that the number the ENDPOINT declared is the
         * number that arrives — the mock answers a fixed usage, and the same
         * usage comes back out of the run on the routed wire.
         */
        ok('‼️ the context figure is the engine\'s own, carried from the endpoint that served it',
            !!result.usage && result.usage.input_tokens === 12 && result.usage.output_tokens === 3);
        ok('…and the run is the one that declared it (one turn, one result)',
            kimiRun.events.filter(e => e.type === 'result').length === 1);

        // ---- 6. a removed route ----
        const gone = R.adapterFor('claude', { ...deps, profiles: profiles.filter(p => p.id !== 'kimi') });
        const goneRt = gone.resolveRuntime({ engine: 'claude', providerId: 'kimi', tier: 'opus' });
        ok('‼️ a removed route resolves to nothing injected and nothing cleared (why X-116 refuses it)',
            !goneRt.spawnEnv && !goneRt.clearEnv && goneRt.identity.origin === 'unknown');
        // ‼️ MEASURED: `preflight` passes it — "kimi" is also a shipped route
        // TEMPLATE the catalog lists with no profile behind it. The rule the
        // spawn refuses by is the launch form's, which offers held routes only.
        const L = require(path.join(ROOT, 'out', 'core', 'launchProvider.js'));
        const pruned = L.pruneProviderPick(gone, { providerId: 'kimi', tier: 'opus' }, 'run');
        ok('…and the launch rule (what `launchRouteRefusal` asks) drops it by name',
            !pruned.pick.providerId && pruned.dropped.some(d => d.field === 'providerId' && d.value === 'kimi'));
    } finally {
        await Promise.all([kimiM.close(), miniM.close(), wrongM.close()]);
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
