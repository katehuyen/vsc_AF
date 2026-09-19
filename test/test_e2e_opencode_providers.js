// X-117 — OPENCODE PROVIDERS END TO END, AGAINST LOCAL MOCK ENDPOINTS.
//
// The real `opencode` CLI with two custom OpenAI-compatible providers declared
// the way a user declares them (a config the engine owns — here handed in through
// OPENCODE_CONFIG_CONTENT, never written to disk), each pointed at a local HTTP
// server. Agent Farm's side is exercised exactly as it runs: the catalog is read
// from `opencode models --verbose`, the adapter resolves the selection into
// `-m provider/model`, and the identity comes back out of `opencode export`.
// No real token is spent; the user's own OpenCode data and config are never
// touched (XDG_* point into a temp folder, and that is asserted).
//
//   1. The catalog read from the engine offers both custom providers, and the
//      adapter refuses a model none of them serves.
//   2. Two providers running AT THE SAME TIME reach their own endpoint with their
//      own key and never each other's.
//   3. Requested vs reported: the export names the provider and model that ran.
//   4. The engine's own cost figure is `engine-reported`, not a plan window.
//
// Skipped (not failed) only when the CLI is not on PATH. ~1 minute on an old PC.
'use strict';
const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const B = require(path.join(ROOT, 'out', 'core', 'billing.js'));

function cliPresent() {
    try {
        cp.execSync(process.platform === 'win32' ? 'where opencode' : 'command -v opencode', { stdio: 'ignore' });
        return true;
    } catch { return false; }
}

/** A local endpoint speaking just enough of the Chat Completions API. */
function mock() {
    const hits = [];
    const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', d => { body += d; }).on('end', () => {
            let j = {};
            try { j = JSON.parse(body); } catch { /* not JSON */ }
            hits.push({ method: req.method, url: req.url, auth: req.headers['authorization'] || '', model: j.model || '' });
            if (req.method !== 'POST' || !req.url.includes('/chat/completions')) { res.writeHead(404); res.end('{}'); return; }
            const model = j.model || 'mock';
            const usage = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 };
            if (!j.stream) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model,
                    choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }], usage }));
                return;
            }
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            const chunk = (delta, finish) => res.write('data: ' + JSON.stringify({ id: 'c1', object: 'chat.completion.chunk',
                created: 1, model, choices: [{ index: 0, delta, finish_reason: finish || null }] }) + '\n\n');
            chunk({ role: 'assistant', content: '' });
            chunk({ content: 'pong' });
            chunk({}, 'stop');
            res.write('data: ' + JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model, choices: [], usage }) + '\n\n');
            res.write('data: [DONE]\n\n');
            res.end();
        });
    });
    return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({
        url: `http://127.0.0.1:${srv.address().port}/v1`, hits,
        posts: () => hits.filter(h => h.method === 'POST'),
        close: () => new Promise(r => srv.close(r))
    })));
}

function run(cmd, env, cwd, timeout = 170000) {
    return new Promise(resolve => {
        const child = cp.spawn(cmd, { env, cwd, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        const kill = setTimeout(() => child.kill(), timeout);
        child.on('close', code => { clearTimeout(kill); resolve({ code, out, err }); });
    });
}

const jsonLines = text => text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

async function main() {
    if (!cliPresent()) {
        console.log('  skipped: the opencode CLI is not on PATH');
        console.log(`\n${pass} passed, ${fail} failed`);
        return;
    }
    const a = await mock();
    const b = await mock();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-oc-'));
    const work = path.join(tmp, 'work');
    fs.mkdirSync(work);
    try {
        const provider = (m, key) => ({ npm: '@ai-sdk/openai-compatible', options: { baseURL: m.url, apiKey: key },
            models: { m1: { name: 'M1' } } });
        const config = { $schema: 'https://opencode.ai/config.json',
            provider: { oca: provider(a, 'sk-oca-CANARY'), ocb: provider(b, 'sk-ocb-CANARY') } };
        const env = { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
            XDG_DATA_HOME: path.join(tmp, 'data'), XDG_CONFIG_HOME: path.join(tmp, 'config'),
            XDG_STATE_HOME: path.join(tmp, 'state') };

        // ---- 1. the catalog, read from the engine ----
        const models = await run('opencode models --verbose', env, work);
        const adapter = R.adapterFor('opencode', { profiles: [], secretFor: () => undefined, inheritedEnv: {},
            openCodeCatalogText: models.out });
        const cat = adapter.catalog();
        const ids = (cat.providers || []).map(p => p.providerId);
        ok('the catalog read from the engine offers both custom providers', ids.includes('oca') && ids.includes('ocb'));
        ok('…as a catalog the ENGINE reported', cat.source === 'engine-reported');
        ok('the adapter passes a model the catalog offers', adapter.preflight({ engine: 'opencode', providerId: 'oca', modelId: 'oca/m1' }).length === 0);
        ok('‼️ …and refuses one no provider serves', adapter.preflight({ engine: 'opencode', providerId: 'oca', modelId: 'oca/nope' }).length > 0);

        // ---- 2. two providers, concurrently ----
        const rtA = adapter.resolveRuntime({ engine: 'opencode', providerId: 'oca', modelId: 'oca/m1' });
        const rtB = adapter.resolveRuntime({ engine: 'opencode', providerId: 'ocb', modelId: 'ocb/m1' });
        ok('the selection becomes the engine\'s own -m', rtA.args.join(' ') === '-m oca/m1' && rtB.args.join(' ') === '-m ocb/m1');
        ok('‼️ and no environment of Agent Farm\'s is put on an engine that owns its sign-in', !rtA.spawnEnv && !rtA.clearEnv);
        const [runA, runB] = await Promise.all([
            run(`opencode run ${rtA.args.join(' ')} --format json "say ping"`, env, work),
            run(`opencode run ${rtB.args.join(' ')} --format json "say ping"`, env, work)
        ]);
        ok('both turns finished', runA.code === 0 && runB.code === 0);
        if (runA.code !== 0 || runB.code !== 0) { console.log('  stderr:', (runA.err + runB.err).slice(0, 400)); }
        ok('‼️ provider A reached ITS endpoint with ITS key only', a.posts().length >= 1
            && a.posts().every(h => h.auth === 'Bearer sk-oca-CANARY' && h.model === 'm1'));
        ok('‼️ provider B reached ITS endpoint with ITS key only', b.posts().length >= 1
            && b.posts().every(h => h.auth === 'Bearer sk-ocb-CANARY' && h.model === 'm1'));
        ok('no key reaches the CLI output', !/CANARY/.test(runA.out + runA.err + runB.out + runB.err));

        // ---- 3. requested vs reported, out of the export ----
        const evA = jsonLines(runA.out);
        const ses = (evA.find(e => e.sessionID) || {}).sessionID || '';
        ok('the run names its session', /^ses_/.test(ses));
        const exp = await run(`opencode export ${ses}`, env, work);
        let doc = null;
        try { doc = JSON.parse(exp.out.slice(exp.out.indexOf('{'))); } catch { /* reported below */ }
        ok('the export parses', !!doc);
        const reported = adapter.identityFromEvents(doc ? [doc] : []) || {};
        ok('‼️ the export reports the provider that ran', (reported.reportedProviderIds || []).includes('oca')
            && !(reported.reportedProviderIds || []).includes('ocb'));
        ok('…and the model', (reported.reportedModels || []).some(m => /m1$/.test(m)));
        ok('the identity records what was asked for', rtA.identity.providerId === 'oca');

        // ---- 4. cost ----
        const finish = evA.find(e => e.type === 'step_finish') || {};
        ok('the engine publishes its own cost and tokens for the step',
            typeof (finish.part || {}).cost === 'number' && ((finish.part || {}).tokens || {}).total === 12);
        const bill = B.billingOf({ engine: 'opencode', providerId: 'oca' });
        ok('‼️ …and that figure is engine-reported, on no plan window', bill.cost === 'engine-reported' && bill.planWindow === false);

        // ---- the user's own OpenCode home was not touched ----
        ok('‼️ the runs wrote their sessions into the temp data home, not the user\'s',
            fs.existsSync(path.join(tmp, 'data', 'opencode')));
    } finally {
        await Promise.all([a.close(), b.close()]);
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
