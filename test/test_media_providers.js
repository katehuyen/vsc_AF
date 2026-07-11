// Wave C tests: providerFor routing + Replicate provider against a mock server.
const http = require('http');
const path = require('path');
const OUT = require('path').resolve(__dirname, '../out/core');
const mp = require(path.join(OUT, 'mediaProviders.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { pass++; } else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- routing ----------
eq('unprefixed → fal', mp.providerFor('fal-ai/flux/schnell').id, 'fal');
eq('replicate prefix → replicate', mp.providerFor('replicate:owner/name').id, 'replicate');
eq('two providers registered', mp.MEDIA_PROVIDERS.map(p => p.id).sort(), ['fal', 'replicate']);
eq('fal secret hint', mp.providerFor('x').secretHint, 'FAL_KEY');
eq('replicate secret hint', mp.providerFor('replicate:a/b').secretHint, 'REPLICATE_API_TOKEN');

// ---------- mock Replicate server ----------
let lastSubmit = null, lastAuth = null;
const preds = {}; let counter = 0;
let base = '';
const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        lastAuth = req.headers['authorization'];
        const url = req.url;
        if (req.method === 'POST' && (url === '/v1/predictions' || /^\/v1\/models\/.+\/predictions$/.test(url))) {
            const parsed = body ? JSON.parse(body) : {};
            lastSubmit = { url, body: parsed };
            const input = parsed.input || {};
            const id = 'p' + (++counter);
            const scenario = input.scenario || 'ok';
            preds[id] = { scenario, polls: 0 };
            if (scenario === 'sync-ok') { return json(res, 201, { id, status: 'succeeded', output: ['http://assets/' + id + '.png'], urls: {} }); }
            if (scenario === 'sync-fail') { return json(res, 201, { id, status: 'failed', error: 'blocked', urls: {} }); }
            return json(res, 201, { id, status: 'starting', urls: { get: base + '/v1/predictions/' + id } });
        }
        const m = /^\/v1\/predictions\/(p\d+)$/.exec(url);
        if (req.method === 'GET' && m) {
            const p = preds[m[1]]; p.polls++;
            if (p.scenario === 'fail') { return json(res, 200, { id: m[1], status: 'failed', error: 'nsfw content' }); }
            if (p.polls < 2) { return json(res, 200, { id: m[1], status: 'processing', urls: { get: base + url } }); }
            const output = p.scenario === 'string-out'
                ? 'http://assets/' + m[1] + '.mp4'
                : ['http://assets/' + m[1] + '.png', 'http://assets/' + m[1] + '-2.png'];
            return json(res, 200, { id: m[1], status: 'succeeded', output, urls: { get: base + url } });
        }
        res.statusCode = 404; res.end('{}');
    });
});

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;
    const run = (model, input, opts) => mp.runReplicateJob(model, JSON.stringify(input), 'Bearer TOK', Object.assign({ baseUrl: base, pollMs: 5 }, opts));

    // latest-version path (owner/name, no version) → /v1/models/owner/name/predictions
    let r = await run('replicate:black-forest-labs/flux', { scenario: 'ok', prompt: 'a cat' });
    ok('poll success ok', r.ok);
    eq('two asset urls', r.assetUrls.length, 2);
    eq('submit hit models endpoint', lastSubmit.url, '/v1/models/black-forest-labs/flux/predictions');
    eq('submit body has input, no version', [Object.keys(lastSubmit.body), !!lastSubmit.body.version], [['input'], false]);
    eq('auth header forwarded', lastAuth, 'Bearer TOK');

    // versioned path → /v1/predictions with {version,input}
    r = await run('replicate:owner/model:ver123', { scenario: 'ok' });
    ok('versioned ok', r.ok);
    eq('versioned hits predictions endpoint', lastSubmit.url, '/v1/predictions');
    eq('versioned body has version', lastSubmit.body.version, 'ver123');

    // failed prediction on poll
    r = await run('replicate:o/n', { scenario: 'fail' });
    ok('failed prediction ok=false', r.ok === false);
    ok('failed carries error', /nsfw/.test(r.error));
    eq('failed no assets', r.assetUrls.length, 0);

    // synchronous success (no get url) → no polling, output used
    r = await run('replicate:o/n', { scenario: 'sync-ok' });
    ok('sync-ok', r.ok && r.assetUrls.length === 1);

    // synchronous failure
    r = await run('replicate:o/n', { scenario: 'sync-fail' });
    ok('sync-fail ok=false', r.ok === false && /blocked/.test(r.error));

    // string output (video) → single asset
    r = await run('replicate:o/n', { scenario: 'string-out' });
    ok('string output → 1 asset', r.ok && r.assetUrls.length === 1 && /\.mp4$/.test(r.assetUrls[0]));

    // bad input json
    r = await mp.runReplicateJob('replicate:o/n', 'not json', 'Bearer T', { baseUrl: base });
    ok('bad json ok=false', r.ok === false && /not valid JSON/.test(r.error));

    // submit HTTP error (bad path base → 404)
    r = await mp.runReplicateJob('replicate:o/n', '{"input":{}}', 'Bearer T', { baseUrl: base + '/nope', pollMs: 5 });
    ok('submit http error surfaced', r.ok === false && /submit HTTP/.test(r.error));

    server.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
