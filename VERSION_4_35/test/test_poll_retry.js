// F3: poll retry/backoff — transient 5xx/network blips survive, permanent
// errors fail fast, submits are never retried, nothing throws.
'use strict';
const http = require('http');
const path = require('path');
const OUT = require('path').resolve(__dirname, '../out/core');
const media = require(path.join(OUT, 'media.js'));
const mp = require(path.join(OUT, 'mediaProviders.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };

let base = '';
const counters = {};
const hit = (k) => counters[k] = (counters[k] ?? 0) + 1;
const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        const url = req.url;
        // fal status: two 500s, then IN_PROGRESS, then COMPLETED
        if (url === '/blip/status') {
            hit('blip');
            if (counters.blip <= 2) { return json(res, 500, { error: 'upstream hiccup' }); }
            return json(res, 200, { status: counters.blip === 3 ? 'IN_PROGRESS' : 'COMPLETED' });
        }
        if (url === '/blip') { return json(res, 200, { images: [{ url: base + '/a.png' }] }); }
        // permanent 400 on status → fail fast, no retries
        if (url === '/bad/status') { hit('bad'); return json(res, 400, { error: 'no such request' }); }
        // fal submit for the never-retry check
        if (req.method === 'POST' && url === '/fal-ai/boom') {
            hit('submit500');
            return json(res, 500, { error: 'queue down' });
        }
        // replicate: two 500s then succeeded
        if (url === '/pred/blip') {
            hit('rblip');
            if (counters.rblip <= 2) { return json(res, 502, {}); }
            return json(res, 200, { id: 'p', status: 'succeeded', output: [base + '/a.png'] });
        }
        // webhook poll: one 500 then done
        if (url === '/hook/status') {
            hit('hook');
            if (counters.hook === 1) { return json(res, 503, {}); }
            return json(res, 200, { status: 'succeeded', value: 42 });
        }
        if (url === '/a.png') { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from([1])); }
        res.statusCode = 404; res.end('{}');
    });
});

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;

    // 1. fal poll survives two 500 blips
    let r = await media.pollFalResult(base + '/blip/status', base + '/blip', 'Key K', { pollMs: 5 });
    check('fal poll survives 5xx blips', r.ok && r.assetUrls.length === 1);

    // 2. permanent 4xx fails fast — exactly one status request (no retry)
    r = await media.pollFalResult(base + '/bad/status', base + '/bad', 'Key K', { pollMs: 5 });
    check('permanent 400 fails', !r.ok && /400/.test(r.error));
    check('permanent 400 not retried', counters.bad === 1);

    // 3. submit 500 → fail immediately, exactly one submit (never retried)
    r = await media.runFalJob('fal-ai/boom', '{}', 'Key K', { baseUrl: base, pollMs: 5 });
    check('submit 500 fails', !r.ok && /submit HTTP 500/.test(r.error));
    check('submit never retried', counters.submit500 === 1);

    // 4. network error (closed port) → honest failure, no throw
    const dead = 'http://127.0.0.1:9';
    r = await media.runFalJob('fal-ai/x', '{}', 'Key K', { baseUrl: dead, pollMs: 5 });
    check('submit network error → ok:false, no crash', !r.ok && /submit failed/.test(r.error));
    r = await media.pollFalResult(dead + '/s', dead + '/r', 'Key K', { pollMs: 5, timeoutMs: 2000 });
    check('poll network error → ok:false, no crash', r.ok === false);

    // 5. replicate poll survives 5xx blips
    r = await mp.pollReplicateResult(base + '/pred/blip', 'Bearer T', { pollMs: 5 });
    check('replicate poll survives 5xx blips', r.ok && r.assetUrls[0] === base + '/a.png');

    // 6. webhook poll survives a 503 blip
    r = await mp.pollWebhookResult({ poll_url: base + '/hook/status' },
        { 'Content-Type': 'application/json' },
        { urlField: 'poll_url', statusField: 'status' }, { pollMs: 5 });
    check('webhook poll survives blip', r.ok && r.response.value === 42);

    server.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH (F3 must never throw):', e); process.exit(1); });
