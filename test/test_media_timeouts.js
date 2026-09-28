// A media request that never answers must still END (measured: an Omni edit step sat "running" for
// 20+ minutes with no event — the poll loop's own timeout was unreachable behind one unbounded fetch).
'use strict';
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'out/core/media.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

(async () => {
    const own = new AbortController();
    ok('a request with no signal of its own is given one; the caller\'s own is kept', !!M.bounded({}).signal && M.bounded({ signal: own.signal }).signal === own.signal);
    ok('JSON calls get minutes, transfers ten', M.REQUEST_TIMEOUT_MS === 120000 && M.TRANSFER_TIMEOUT_MS === 600000);

    const held = [];
    const srv = http.createServer((req, res) => { held.push(res); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}/silent`;

    const t0 = Date.now();
    let threw = '';
    try { await M.jsonFetch(url, {}, 300); } catch (e) { threw = String(e && e.name); }
    ok('‼️ a server that never answers ends the call at its timeout instead of hanging', /Timeout|Abort/.test(threw) && Date.now() - t0 < 3000);

    const t1 = Date.now();
    const r = await Promise.race([
        M.resilientFetch(url, M.bounded({}, 300), 10, 0),
        new Promise(res => setTimeout(() => res('HUNG'), 5000))
    ]);
    ok('‼️ the poll side turns it into a transient failure (status 0) and returns', r !== 'HUNG' && r.status === 0 && !r.ok && Date.now() - t1 < 3000);

    held.forEach(res => res.destroy());
    srv.close();
    console.log(`test_media_timeouts: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
