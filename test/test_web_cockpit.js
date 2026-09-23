// U-85 — THE WEB VIEW CARD, AND THE ONE QUESTION IT EXISTS TO ANSWER:
// can my phone read this farm right now?
//
// ‼️ WHAT THIS SUITE IS WATCHING is a GREEN lie, not a red one. Every switch
// can be correct — enabled, token present, the server really bound — while the
// binding is `local` and the only link that exists is `http://127.0.0.1:…`,
// which the phone lying on the desk cannot open. A card that painted that
// green would be right about its three booleans and wrong about the only
// question anybody asks it, and no string test on "running" would notice.
//
// ‼️ AND A QR CODE IS A PROMISE. Drawn over a loopback URL it is something to
// photograph that is guaranteed to fail, indistinguishable from one that
// works. So `phoneReachable` is asserted state by state below, including the
// state the naive version gets wrong: `lan` on a machine with no non-internal
// address, where the link silently falls back to loopback.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const W = require(path.join(ROOT, 'out', 'core', 'webCockpit.js'));

const on = {
    enabled: true, port: 8378, bind: 'lan', hasToken: true,
    serving: true, lanAddress: '192.168.1.40'
};
const st = o => W.webStatus({ ...on, ...o });

// ---------- THE STATES, AND THE PRECEDENCE BETWEEN THEM ----------
{
    eq('off when the switch is off', st({ enabled: false }).state, 'off');

    // ‼️ Precedence: the missing token is WHY nothing is listening. Naming the
    // port instead would send the reader to hunt a process that never existed.
    eq('no token outranks not serving',
        st({ hasToken: false, serving: false }).state, 'no-token');
    eq('…and not serving outranks the binding',
        st({ serving: false, bind: 'local' }).state, 'not-serving');

    eq('local is its own state', st({ bind: 'local' }).state, 'local');
    eq('lan with a real address is the only green one', st({}).state, 'lan');

    // The state the naive version calls green: bound to every interface, but
    // there is no interface to be on.
    eq('lan with no non-internal address is NOT lan',
        st({ lanAddress: '' }).state, 'lan-no-address');
    eq('…and 127.0.0.1 is not an address either',
        st({ lanAddress: '127.0.0.1' }).state, 'lan-no-address');
    eq('…nor is 0.0.0.0, which is a bind and not a destination',
        st({ lanAddress: '0.0.0.0' }).state, 'lan-no-address');
}

// ---------- ‼️ THE GREEN LIE, ASSERTED AS SUCH ----------
{
    const local = st({ bind: 'local' });
    ok('a perfectly configured LOCAL view is NOT green', local.tone === 'warn');
    ok('…and it says the phone cannot reach it, in those words',
        /THIS COMPUTER ONLY/.test(local.detail));
    ok('…and it names the one thing to do about it',
        /LAN/.test(local.next || ''));

    // Every switch is right and the answer is still no.
    ok('enabled + token + serving is not enough to be reachable',
        local.phoneReachable === false);
}

// ---------- THE QR LICENCE ----------
{
    eq('a code may be drawn ONLY in the one reachable state',
        ['off', 'no-token', 'not-serving', 'local', 'lan-no-address', 'lan']
            .map(s => {
                const i = s === 'off' ? { enabled: false }
                    : s === 'no-token' ? { hasToken: false }
                        : s === 'not-serving' ? { serving: false }
                            : s === 'local' ? { bind: 'local' }
                                : s === 'lan-no-address' ? { lanAddress: '' } : {};
                return W.webStatus({ ...on, ...i }).phoneReachable;
            }),
        [false, false, false, false, false, true]);
}

// ---------- THE LINK: ONE FORMULA, AND THE FALLBACK IS NOT 0.0.0.0 ----------
{
    eq('a lan link names the machine, not the bind',
        W.webUrl({ bind: 'lan', port: 8378, token: 'abc', lanAddress: '192.168.1.40' }),
        'http://192.168.1.40:8378/?t=abc');
    eq('a local link is loopback whatever the machine s address is',
        W.webUrl({ bind: 'local', port: 8378, token: 'abc', lanAddress: '192.168.1.40' }),
        'http://127.0.0.1:8378/?t=abc');
    // ‼️ `0.0.0.0` in a link resolves to nothing a browser can open.
    eq('lan with no address falls back to loopback, never to 0.0.0.0',
        W.webUrl({ bind: 'lan', port: 8378, token: 'abc', lanAddress: '' }),
        'http://127.0.0.1:8378/?t=abc');
    eq('the host in the verdict is the host in the link',
        st({}).host, W.webHost('lan', '192.168.1.40'));
}

// ---------- EVERY STATE IS PAINTABLE AND SAYS SOMETHING ----------
{
    const states = ['off', 'no-token', 'not-serving', 'local', 'lan-no-address', 'lan'];
    ok('every state carries a tone the page can paint',
        states.every(s => ['ok', 'bad', 'warn', 'off'].indexOf(W.WEB_TONE[s]) >= 0));
    ok('every state carries a detail sentence',
        states.every(s => {
            const i = s === 'off' ? { enabled: false }
                : s === 'no-token' ? { hasToken: false }
                    : s === 'not-serving' ? { serving: false }
                        : s === 'local' ? { bind: 'local' }
                            : s === 'lan-no-address' ? { lanAddress: '' } : {};
            const v = W.webStatus({ ...on, ...i });
            return typeof v.detail === 'string' && v.detail.length > 20;
        }));
    // The only state with nothing to do about it is the working one.
    ok('every unhappy state names a next step, and the happy one does not',
        st({ enabled: false }).next && st({ hasToken: false }).next
        && st({ serving: false }).next && st({ bind: 'local' }).next
        && st({ lanAddress: '' }).next && !st({}).next);
}

// ---------- ‼️ THE TOKEN IS NEVER IN THE VERDICT ----------
{
    const v = JSON.stringify(st({}));
    ok('the status carries no token — it is handed hasToken, not the value',
        v.indexOf('t=') < 0 && v.indexOf('token') < 0);
}

// ---------- IT IS PURE, SO IT CAN BE TESTED AT ALL ----------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'webCockpit.ts'), 'utf8');
    ok('no vscode in the core', !/from 'vscode'/.test(src));
    ok('no http and no fs in the core — it is handed what the host already knows',
        !/require\('(http|fs)'\)/.test(src) && !/^import .* from '(http|fs)'/m.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
