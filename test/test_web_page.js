// U-85 — THE PHONE PAGE, RUN RATHER THAN READ.
//
// ‼️ The page is one self-contained document whose whole behaviour lives in an
// inline <script>. A string test can say "setInterval is in there" and stay
// green while the interval keeps firing behind a locked screen — which is the
// defect this suite was written against. So the script is executed here in a
// vm against a fake document, fake timers and a counting fetch, and the
// assertions are about what it DID: how many timers are alive and how many
// requests went out while the page was hidden.
'use strict';
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const { renderPage } = require(path.join(ROOT, 'out', 'core', 'webpage.js'));
const html = renderPage();
const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';

function boot({ hidden = false } = {}) {
    const els = {};
    const el = id => els[id] || (els[id] = { id, textContent: '', innerHTML: '', style: {} });
    const listeners = {};
    const timers = new Map();
    let nextId = 1;
    const doc = {
        hidden,
        getElementById: el,
        addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }
    };
    const snapshot = { ts: Date.now(), host: 'box', writer: 'extension', totals: {} };
    const env = {
        fetches: 0,
        document: doc,
        fetch: () => { env.fetches++; return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) }); },
        setInterval: (f, ms) => { const id = nextId++; timers.set(id, { f, ms }); return id; },
        clearInterval: id => { timers.delete(id); },
        Date, Math, Number, String, JSON, Promise, Error
    };
    vm.runInNewContext(script, env);
    return {
        env, els, timers,
        tick: () => { for (const t of [...timers.values()]) { t.f(); } },
        setHidden: h => { doc.hidden = h; for (const f of listeners.visibilitychange || []) { f(); } }
    };
}

// ---------- the script is really there ----------
ok('the page carries an inline script', script.length > 200);

// ---------- visible: one fetch now, one 15 s poller ----------
{
    const p = boot();
    eq('opening the page fetches once', p.env.fetches, 1);
    eq('one poller is running', p.timers.size, 1);
    eq('it polls every 15 s', [...p.timers.values()][0].ms, 15000);
    p.tick();
    eq('a tick fetches', p.env.fetches, 2);
}

// ---------- hidden: the poller stops, and ticks cost nothing ----------
{
    const p = boot();
    p.setHidden(true);
    eq('hiding the page stops the poller', p.timers.size, 0);
    const before = p.env.fetches;
    p.tick(); p.tick(); p.tick();
    eq('no request goes out while hidden', p.env.fetches, before);

    p.setHidden(false);
    eq('showing it again fetches at once', p.env.fetches, before + 1);
    eq('and restarts exactly one poller', p.timers.size, 1);

    // A browser can report "visible" twice (bfcache, tab switches) — the
    // pollers must not stack, or every show doubles the radio traffic.
    p.setHidden(false);
    p.setHidden(false);
    eq('repeated shows never stack pollers', p.timers.size, 1);
    p.setHidden(true);
    eq('and one hide still clears it', p.timers.size, 0);
}

// ---------- opened in a background tab: no poller until it is looked at ----------
{
    const p = boot({ hidden: true });
    eq('a page born hidden fetches its first snapshot', p.env.fetches, 1);
    eq('but starts no poller', p.timers.size, 0);
    p.setHidden(false);
    eq('the first look starts it', p.timers.size, 1);
}

// ---------- the manual refresh ----------
{
    ok('the ↻ button calls load() with no dead flag', /onclick="load\(\)"/.test(html));
    ok('the dead `if (manual)` branch is gone', !/if \(manual\)/.test(html));
    ok('the icon-only button has a name', /class="ref"[^>]*aria-label="Refresh now"/.test(html));
}

// ---------- the notch: viewport-fit=cover is answered by safe-area padding ----------
{
    ok('the viewport opts into the full screen', /viewport-fit=cover/.test(html));
    for (const side of ['top', 'right', 'bottom', 'left']) {
        ok(`the body pads for safe-area-inset-${side}`,
            new RegExp('body\\s*\\{[^}]*env\\(safe-area-inset-' + side + '\\)').test(html));
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
