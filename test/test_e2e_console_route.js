// X-117 — THE CONSOLE DOOR, END TO END: a hosted Claude card on a route.
//
// `ConsoleHost` is what a Console card runs through. It is handed the SAME
// resolver the extension hands it (`engineRuntime`, 7th constructor argument)
// and an account layer (8th) — here pointing the CLI at a temp config home. The
// real `claude` CLI then answers a turn against local mock endpoints; nothing
// leaves the machine and no real token is spent.
//
//   1. The card's OWN route (`providerId`/`tier` on the init) is what reaches the
//      wire — its endpoint, key and tier model — and the inherited route never.
//   2. The resolver is asked for exactly the card's route, and nothing else.
//
// Skipped (not failed) only when the CLI is not on PATH.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { cliPresent, anthropicMock } = require('./e2e_mocks');
const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const RT = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
const { ConsoleHost } = require(path.join(ROOT, 'out', 'core', 'consolehost.js'));

async function main() {
    if (!cliPresent('claude')) {
        console.log('  skipped: the claude CLI is not on PATH');
        console.log(`\n${pass} passed, ${fail} failed`);
        return;
    }
    const kimiM = await anthropicMock();
    const wrongM = await anthropicMock();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-console-'));
    // The host spawns with `process.env` as the inherited layer, so the inherited
    // route is put THERE — exactly where a VS Code window would carry it.
    const saved = {};
    const inherited = { ANTHROPIC_BASE_URL: wrongM.url, ANTHROPIC_API_KEY: 'sk-inherited-CANARY',
        ANTHROPIC_AUTH_TOKEN: 'sk-inherited-bearer-CANARY' };
    for (const k of Object.keys(process.env)) {
        if (RT.isRouteEnvName(k) || k === 'CLAUDE_CONFIG_DIR') { saved[k] = process.env[k]; delete process.env[k]; }
    }
    Object.assign(process.env, inherited);
    let host;
    try {
        const profiles = [{ id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'kimi', baseUrl: kimiM.url,
            authKind: 'api-key', tiers: { opus: 'kimi-k2' }, revision: 2 }];
        const adapter = R.adapterFor('claude', { profiles, secretFor: id => `sk-${id}-CANARY`, inheritedEnv: inherited });
        const asked = [];
        host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, undefined,
            (agentId, engine, route) => {
                asked.push({ agentId, engine, route });
                if (!route || !route.providerId) { return undefined; }
                const rt = adapter.resolveRuntime({ engine: 'claude', providerId: route.providerId, tier: route.tier });
                return { spawnEnv: rt.spawnEnv, clearEnv: rt.clearEnv };
            },
            () => ({ CLAUDE_CONFIG_DIR: tmp, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }));

        const id = host.start({ agentId: 'a1', agentName: 'e2e', cwd: tmp, permissionMode: 'manual',
            providerId: 'kimi', tier: 'opus', firstPrompt: 'say ping' });
        let s;
        const t0 = Date.now();
        while (Date.now() - t0 < 120000) {
            s = host.get(id);
            if (s && s.status === 'idle' && s.messages.some(m => m.role === 'agent' && /pong/.test(m.text || ''))) { break; }
            if (s && /error|ended|exited/.test(s.status)) { break; }
            await sleep(400);
        }
        ok('the hosted card answered from the mock', !!s && s.messages.some(m => m.role === 'agent' && /pong/.test(m.text || '')));
        if (!s || !s.messages.some(m => m.role === 'agent')) { console.log('  state:', s && s.status, JSON.stringify((s && s.messages) || []).slice(0, 300)); }
        ok('the resolver was asked for the card\'s own route', asked.length >= 1
            && asked.every(a => a.engine === 'claude' && a.route && a.route.providerId === 'kimi' && a.route.tier === 'opus'));
        ok('‼️ the card reached ITS route\'s endpoint, with its key and tier model', kimiM.posts().length >= 1
            && kimiM.posts().every(h => h.key === 'sk-kimi-CANARY' && h.model === 'kimi-k2' && !/inherited/.test(h.auth)));
        ok('‼️ …and the inherited route, sitting in the window\'s own environment, was never reached', wrongM.posts().length === 0);
    } finally {
        try { host && host.dispose(); } catch { /* ended already */ }
        for (const k of Object.keys(inherited)) { delete process.env[k]; }
        Object.assign(process.env, saved);
        await Promise.all([kimiM.close(), wrongM.close()]);
        await sleep(500);
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
