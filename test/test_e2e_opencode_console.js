// X-117 — THE CONSOLE DOOR ON OPENCODE, WHICH IS A DIFFERENT TRANSPORT.
//
// The Claude Console card is a `claude -p` process per turn. An OpenCode card is
// not: one shared `opencode acp` process serves every card on the host, and the
// turn travels as a JSON-RPC frame on its stdin. That is a second wire nothing
// had ever watched end to end — the provider tests drive `opencode run`, and
// `run` and `acp` are different programs inside the same binary.
//
//   1. A hosted card answers over the real ACP process.
//   2. The provider the CARD named is the one the wire shows — its endpoint, its
//      bearer — and the other declared provider is never touched.
//
// ‼️ THE ACP CHILD INHERITS THIS PROCESS'S ENVIRONMENT, AND THAT IS THE DESIGN.
// `nodeOpencodeIo` spawns with no `env` because OpenCode owns its own sign-in:
// its account axis is `unmapped` on purpose (moving the XDG data root would move
// every other XDG application with it), and its route resolves to no environment
// of Agent Farm's at all. So the providers are declared where the engine reads
// them — in the environment this test is running in.
//
// Skipped (not failed) when the CLI is not on PATH.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { cliPresent, openAiMock } = require('./e2e_mocks');
const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const { ConsoleHost, nodeOpencodeIo } = require(path.join(ROOT, 'out', 'core', 'consolehost.js'));

async function main() {
    if (!cliPresent('opencode')) {
        console.log('  skipped: the opencode CLI is not on PATH');
        console.log(`\n${pass} passed, ${fail} failed`);
        return;
    }
    const a = await openAiMock();
    const b = await openAiMock();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-occ-'));
    const work = path.join(tmp, 'work');
    fs.mkdirSync(work);

    const provider = (m, key) => ({ npm: '@ai-sdk/openai-compatible',
        options: { baseURL: m.url, apiKey: key }, models: { m1: { name: 'M1' } } });
    const config = { $schema: 'https://opencode.ai/config.json',
        provider: { oca: provider(a, 'sk-oca-CANARY'), ocb: provider(b, 'sk-ocb-CANARY') } };
    const keys = ['OPENCODE_CONFIG_CONTENT', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME'];
    const saved = {};
    for (const k of keys) { saved[k] = process.env[k]; }
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config);
    // The user's own OpenCode home is never read or written — asserted below.
    process.env.XDG_DATA_HOME = path.join(tmp, 'data');
    process.env.XDG_CONFIG_HOME = path.join(tmp, 'config');
    process.env.XDG_STATE_HOME = path.join(tmp, 'state');

    let host;
    try {
        const adapter = R.adapterFor('opencode', { profiles: [], secretFor: () => undefined, inheritedEnv: {} });
        const asked = [];
        host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined,
            nodeOpencodeIo(),
            (agentId, engine, route) => {
                asked.push({ agentId, engine, route });
                const rt = adapter.resolveRuntime({ engine: 'opencode',
                    providerId: route && route.providerId, modelId: 'oca/m1' });
                return { spawnEnv: rt.spawnEnv, clearEnv: rt.clearEnv };
            });

        const id = host.start({ agentId: 'a1', agentName: 'e2e', cwd: work, engine: 'opencode',
            model: 'oca/m1', providerId: 'oca', permissionMode: 'manual', firstPrompt: 'say ping' });
        let s;
        const t0 = Date.now();
        while (Date.now() - t0 < 180000) {
            s = host.get(id);
            if (s && s.messages.some(m => m.role === 'agent' && /pong/i.test(m.text || ''))) { break; }
            if (s && /error/.test(s.status)) { break; }
            await sleep(500);
        }
        ok('the hosted OpenCode card answered over the real ACP process',
            !!s && s.messages.some(m => m.role === 'agent' && /pong/i.test(m.text || '')));
        if (!s || !s.messages.some(m => m.role === 'agent' && /pong/i.test(m.text || ''))) {
            console.log('  state:', s && s.status, JSON.stringify((s && s.messages) || []).slice(0, 400));
        }
        ok('‼️ the provider the CARD named is the one that served it',
            a.posts().length >= 1 && a.posts().every(h => h.auth === 'Bearer sk-oca-CANARY' && h.model === 'm1'));
        ok('‼️ …and the other declared provider was never touched', b.posts().length === 0);
        ok('no key reached the card\'s own text',
            !((s && s.messages) || []).some(m => /CANARY/.test(m.text || '')));
        ok('‼️ the card wrote its session into the temp data home, not the user\'s',
            fs.existsSync(path.join(tmp, 'data', 'opencode')));
    } finally {
        try { host && host.dispose(); } catch { /* ended already */ }
        for (const k of keys) {
            if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
        }
        await Promise.all([a.close(), b.close()]);
        await sleep(1500);
        // ‼️ X-354 — THE SWEEPING UP IS NOT ONE OF THE CHECKS. Every assertion
        // above has already run by the time this line does; on Windows the
        // engine's own child can still hold the data home open after dispose,
        // and `rmSync` then throws EPERM straight out of `finally` — turning a
        // green run red over a folder. The folder is in `os.tmpdir()` under the
        // `af-` prefix the convention reserves for exactly this, so leaving it
        // costs nothing — but it is SAID rather than swallowed, because a
        // cleanup that silently never happens is how a temp drive fills up.
        try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
        catch (e) { console.log(`  note  the temp data home is still held open, left behind: ${tmp} (${e && e.code || e})`); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
