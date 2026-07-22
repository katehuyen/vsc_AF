// Wave C (webhook poll mode): jsonPath + pollWebhookResult against a mock server.
const http = require('http');
const path = require('path');
const mp = require(path.join(require('path').resolve(__dirname, '../out/core'), 'mediaProviders.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { pass++; } else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- jsonPath ----------
eq('nested object', mp.jsonPath({ a: { b: { c: 5 } } }, 'a.b.c'), 5);
eq('array index', mp.jsonPath({ items: [{ url: 'x' }, { url: 'y' }] }, 'items.1.url'), 'y');
eq('missing → undefined', mp.jsonPath({ a: 1 }, 'a.b.c'), undefined);
eq('top-level', mp.jsonPath({ status: 'ok' }, 'status'), 'ok');

// ---------- mock queue server ----------
const jobs = {}; let counter = 0; let base = '';
const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
let lastPollAuth = null;
const server = http.createServer((req, res) => {
    lastPollAuth = req.headers['authorization'];
    const m = /^\/poll\/(j\d+)$/.exec(req.url);
    if (m) {
        const j = jobs[m[1]]; j.polls++;
        if (j.scenario === 'fail') { return json(res, 200, { state: 'ERROR', detail: 'bad prompt' }); }
        if (j.polls < 2) { return json(res, 200, { state: 'RUNNING' }); }
        return json(res, 200, { state: 'SUCCEEDED', result: { video: 'http://cdn/' + m[1] + '.mp4' } });
    }
    if (/^\/nostatus\/(j\d+)$/.test(req.url)) { return json(res, 200, { done: true, out: 'ok' }); }
    res.statusCode = 404; res.end('{}');
});

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;

    const submit = (scenario, urlPath) => {
        const id = 'j' + (++counter);
        jobs[id] = { scenario, polls: 0 };
        return { name: id, meta: { poll: base + (urlPath || '/poll/') + id } };
    };

    // status-based poll → done
    let r = await mp.pollWebhookResult(submit('ok'), { Authorization: 'Bearer T' },
        { urlField: 'meta.poll', statusField: 'state', doneRegex: 'SUCCEEDED', failRegex: 'ERROR' }, { pollMs: 5 });
    ok('poll → done ok', r.ok);
    eq('final response carried', mp.jsonPath(r.response, 'result.video').endsWith('.mp4'), true);
    eq('poll forwarded auth header', lastPollAuth, 'Bearer T');

    // fail status
    r = await mp.pollWebhookResult(submit('fail'), {},
        { urlField: 'meta.poll', statusField: 'state', doneRegex: 'SUCCEEDED', failRegex: 'ERROR' }, { pollMs: 5 });
    ok('poll → fail ok=false', r.ok === false && /ERROR/.test(r.error));

    // no poll url present → treat submit as final
    r = await mp.pollWebhookResult({ result: 'sync' }, {}, { urlField: 'meta.poll', statusField: 'state' }, { pollMs: 5 });
    ok('no poll url → sync ok', r.ok && mp.jsonPath(r.response, 'result') === 'sync');

    // no statusField → first HTTP-ok poll is done
    r = await mp.pollWebhookResult(submit('ok', '/nostatus/'), {}, { urlField: 'meta.poll' }, { pollMs: 5 });
    ok('no statusField → done on first ok', r.ok && mp.jsonPath(r.response, 'done') === true);

    // timeout (never-done scenario via tiny timeout)
    const nd = submit('ok'); jobs[nd.name].scenario = 'never'; // will keep polling RUNNING? use a scenario that never succeeds
    // craft a job that always returns RUNNING by pointing at a fresh id whose polls stay <2 is impossible;
    // instead use failRegex/doneRegex that never match so it times out.
    r = await mp.pollWebhookResult(submit('ok'), {},
        { urlField: 'meta.poll', statusField: 'state', doneRegex: 'NEVERMATCH', failRegex: 'NOPE', timeoutMin: 0.002 }, { pollMs: 15 });
    ok('poll timeout → ok=false', r.ok === false && /timed out/.test(r.error));

    server.close();
    server.unref();
    console.log(`\n${pass} passed, ${fail} failed`);
    // exitCode + natural drain: process.exit() during libuv handle close crashes
    // flakily on this Node/Windows build (same fix as test_airtable_edge).
    process.exitCode = fail ? 1 : 0;
})();
