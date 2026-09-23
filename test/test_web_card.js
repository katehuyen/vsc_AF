// U-85 — THE WEB VIEW CARD, drawn by the real page script and driven through
// the real host module.
//
// ‼️ TWO LIES THIS SUITE EXISTS TO CATCH, and neither one fails a string test
// that greps for the word "running":
//
//   1. A LINK NOBODY CAN USE, offered as if they could. With the view off the
//      card drew the whole address and a `copy` button beside it — what that
//      puts on the clipboard is a URL that refuses every request. Seen in the
//      render, not in a test, which is why the copy button is counted here.
//   2. A QR CODE THAT CANNOT BE SCANNED. Over `http://127.0.0.1:…` it
//      photographs exactly like one that works and fails silently on the
//      phone. So the code is counted per state, not merely looked for.
//
// ‼️ AND THE HOST SIDE IS DRIVEN, NOT MOCKED AROUND: turning LAN on is a
// decision about somebody's network, so a DECLINED confirmation must leave the
// machine untouched — asserted below by counting what the host was asked to do.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const FX = require(path.join(__dirname, 'fixtures', 'toolbox.js'));

// ---------- THE CARD, PER STATE, THROUGH THE REAL PAGE SCRIPT ----------
const draw = (webOpts) => {
    const data = FX.base({ telegram: FX.tg({ botUsername: 'b' }), web: FX.web(webOpts) });
    return runPage('toolbox.js', data).html();
};

{
    const lan = draw();
    ok('the reachable state draws a real QR — an <svg>, not a placeholder',
        /class="webqr-img"><svg /.test(lan) && lan.indexOf('<path d="M') > 0);
    ok('…and offers the link to copy', lan.indexOf('data-web="copy"') > 0);
    ok('…and says the machine is on the network', lan.indexOf('192.168.1.40') > 0);

    // ‼️ The green lie: everything correct, nothing scannable.
    const local = draw({ bind: 'local' });
    eq('LOCAL draws NO code', (local.match(/class="webqr-img"/g) || []).length, 0);
    ok('…and says in the card why there is none',
        /No code: the link is 127\.0\.0\.1/.test(local));
    ok('…and still offers copy, because that link DOES work on this computer',
        local.indexOf('data-web="copy"') > 0);

    // ‼️ The clipboard trap, counted.
    const off = draw({ enabled: false, serving: false });
    eq('OFF offers no copy button at all',
        (off.match(/data-web="copy"/g) || []).length, 0);
    // ‼️ THE FULL FORM, because the STYLESHEET mentions the class too: a bare
    // `indexOf('weburl-dead')` is satisfied by the CSS rule that defines it and
    // would pass on a card that never drew one (docs/CONVENTIONS.md).
    ok('…and strikes the address through rather than hiding it',
        off.indexOf('class="weburl weburl-dead"') > 0);
    ok('…and says it is not live, in those words', /not live/.test(off));
    ok('…and the binding select is disabled: the two start buttons already choose it',
        /id="web-bind"[^>]*disabled/.test(off));
    ok('…and both start doors are offered', /data-bind="local"/.test(off) && /data-bind="lan"/.test(off));

    const noToken = draw({ token: '', serving: false });
    ok('with no token the card says there is no link YET, not a broken one',
        /no link until a token exists/.test(noToken)
        && noToken.indexOf('class="weburl') < 0);
    eq('…and draws no code either', (noToken.match(/class="webqr-img"/g) || []).length, 0);

    // A window that hosts nothing draws a card that says so, never a blank.
    const none = runPage('toolbox.js',
        FX.base({ telegram: FX.tg({ botUsername: 'b' }) })).html();
    ok('a window with no web host says so instead of drawing an empty card',
        /web view is not available in this window/.test(none));
}

// ---------- THE FOUR ACTS, THROUGH THE REAL HOST MODULE ----------
{
    const warns = [];
    let answer;
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                window: {
                    showWarningMessage: (m) => { warns.push(m); return Promise.resolve(answer); }
                },
                env: { clipboard: { writeText: () => Promise.resolve() } }
            };
        }
        return origLoad.apply(this, arguments);
    };
    const W = require(path.join(ROOT, 'out', 'panels', 'toolboxWeb.js'));

    const fakeHost = () => {
        const calls = [];
        return {
            calls,
            snapshot: () => ({
                enabled: true, port: 8378, bind: 'local',
                token: 'abc', serving: true, lanAddress: '10.0.0.5'
            }),
            enableWebView: async (b) => { calls.push('enable:' + b); },
            disableWebView: async () => { calls.push('disable'); },
            setWebBind: async (b) => { calls.push('bind:' + b); },
            newWebToken: async () => { calls.push('token'); }
        };
    };
    const run = async (msg, host) => {
        const said = [];
        const took = await W.webCardMessage(msg, { host, say: m => said.push(m) });
        return { took, said };
    };

    (async () => {
        // ‼️ A DECLINED CONFIRMATION CHANGES NOTHING.
        answer = undefined;
        let h = fakeHost();
        await run({ type: 'web-start', bind: 'lan' }, h);
        eq('a refused LAN start touches the machine not at all', h.calls, []);
        ok('…and it really asked', warns.length === 1 && /whole network/.test(warns[0]));

        await run({ type: 'web-bind', bind: 'lan' }, h);
        eq('a refused LAN rebind touches nothing either', h.calls, []);

        // local needs no question: the port never leaves this machine.
        h = fakeHost();
        warns.length = 0;
        await run({ type: 'web-start', bind: 'local' }, h);
        eq('starting on LOCAL asks nothing and starts', h.calls, ['enable:local']);
        eq('…and no dialog was raised', warns.length, 0);

        answer = 'Serve on the network';
        h = fakeHost();
        await run({ type: 'web-start', bind: 'lan' }, h);
        eq('an accepted LAN start goes through', h.calls, ['enable:lan']);

        h = fakeHost();
        await run({ type: 'web-bind', bind: 'lan' }, h);
        eq('…and so does an accepted rebind', h.calls, ['bind:lan']);

        // ‼️ A bind that is not one of the two is NAMED, never trusted: a
        // webview posting bind:"../.." must not reach a setting.
        h = fakeHost();
        await run({ type: 'web-bind', bind: '../..' }, h);
        eq('an unknown bind falls to local rather than being written through',
            h.calls, ['bind:local']);
        eq('webBind names the value rather than trusting it',
            [W.webBind('lan'), W.webBind('local'), W.webBind('LAN'), W.webBind(undefined), W.webBind({})],
            ['lan', 'local', 'local', 'local', 'local']);

        // Stop needs no question — it only ever takes something away.
        h = fakeHost();
        warns.length = 0;
        await run({ type: 'web-stop' }, h);
        eq('stopping asks nothing', [h.calls, warns.length], [['disable'], 0]);

        // ‼️ A new token is the REVOKE, so it is asked about.
        answer = undefined;
        h = fakeHost();
        await run({ type: 'web-token' }, h);
        eq('a refused token mint changes nothing', h.calls, []);
        ok('…and the question says what it destroys',
            warns.length === 1 && /bookmark/.test(warns[0]));
        answer = 'New token';
        h = fakeHost();
        await run({ type: 'web-token' }, h);
        eq('an accepted one goes through', h.calls, ['token']);

        // Ours and only ours.
        const other = await run({ type: 'hooks-restart' }, fakeHost());
        ok('a message that is not ours is left for the panel', other.took === false);
        const noHost = await run({ type: 'web-stop' }, undefined);
        ok('a window that hosts nothing says so instead of throwing',
            noHost.took === true && noHost.said[0] && noHost.said[0].ok === false);

        // ---------- THE DATA THE CARD IS HANDED ----------
        const d = W.webCardData(fakeHost());
        ok('the card data carries the verdict, not the ingredients',
            d.status && d.status.state === 'local' && d.status.phoneReachable === false);
        ok('‼️ …and NO code in a state where one could not be scanned', d.qr === undefined);
        eq('…and the link is the core formula s', d.url, 'http://127.0.0.1:8378/?t=abc');
        ok('no host, no card', W.webCardData(undefined) === undefined);

        // ---------- THE DASHBOARD'S TOP-BAR DOOR ----------
        // The button asks the header for an ACTION (not a nav), the panel runs
        // the palette's own command — the one that asks local/LAN when the view
        // is off — and the parity manifest ties that door to web.enable.
        {
            const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
            const dj = rd('media/dashboard.js');
            const dt = rd('src/panels/dashboard.ts');
            ok('the Dashboard header carries the web action',
                /related: \[\{\s*action: 'openWebView'/.test(dj));
            ok('…with a tooltip that says what it does and where the rest lives',
                /Mobile Web Dashboard — [^']*read-only/.test(dj) && /Toolbox → Services/.test(dj));
            ok('the panel answers it with the palette command, and only that one',
                /case 'headerAction':\s*if \(msg\.action === 'openWebView'\) \{\s*void vscode\.commands\.executeCommand\('agentfarm\.openWebView'\)/.test(dt));
            const man = JSON.parse(rd('parity.manifest.json'));
            const cap = (man.capabilities || man.entries || []).find(c => c.capability === 'dashboard.ts#headerAction');
            ok('parity ties the door to web.enable', !!cap && (cap.ops || []).includes('web.enable'));
        }

        Module._load = origLoad;
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
