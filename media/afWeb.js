// Agent Farm — THE WEB VIEW CARD: the farm on a phone, and the code that opens it.
//
// ‼️ WHY THIS IS A COMPONENT AND NOT A BLOCK INSIDE toolbox.js (U-85): that
// file is past its size budget, and the fact this card carries is the same
// kind the Telegram card carries — "can your phone reach the farm". A card
// written twice disagrees the first day one copy is touched, and it disagrees
// in green, which is the only direction that matters here.
//
// ‼️ AND THE CARD DECIDES NOTHING. `status`, the tone, the sentence and the
// link all arrive from `src/core/webCockpit.ts`; the QR arrives already
// encoded from the host (`panels/toolboxWeb.ts`). A page that worked out "is
// it reachable" from `enabled && serving` would be a second copy of the rules
// — and it would get the one case wrong that matters: every switch correct,
// bound to `local`, and the phone cannot open a single link.
(function () {
    'use strict';

    const esc = v => (window.AFCharts && window.AFCharts.esc)
        ? window.AFCharts.esc(v)
        : String(v === null || v === undefined ? '' : v);

    const TONE_DOT = { ok: '●', bad: '●', warn: '●', off: '○' };

    function words(state) { return String(state || '').replace(/-/g, ' '); }

    function dot(w) {
        if (!w) { return '⚙️'; }
        return `<span class="svc-dot t-${esc(w.status.tone)}">${TONE_DOT[w.status.tone] || '●'}</span>`;
    }

    function line(w) { return w ? 'Web view — ' + words(w.status.state) : 'not available'; }

    /** MIRROR — the badge is narrow, so its panel opens with the current value. */
    function badge(w) {
        const s = w.status;
        return window.AFTip.wrap(
            `<span class="svc-badge t-${esc(s.tone)}">${TONE_DOT[s.tone] || '●'} ${esc(words(s.state))}</span>`,
            'Web view — ' + words(s.state),
            s.detail + (s.next ? '\n\n' + s.next : '')
            + '\n\nBinding: ' + (w.bind === 'lan' ? 'every interface (LAN)' : '127.0.0.1 (this computer only)')
            + '\nPort: ' + w.port
            + '\nToken: ' + (w.hasToken ? 'set' : 'MISSING — the server refuses to start without one')
            + '\nThis machine on the network: ' + (w.lanAddress || 'no non-internal address')
            + '\n\nIt is READ ONLY: three routes, none of which starts, stops or changes anything. '
            + 'Driving the farm from outside is the bridge\'s job.',
            'svc-tip');
    }

    /**
     * ‼️ THE CODE IS DRAWN ONLY WHERE IT WOULD WORK, and where it would not the
     * card says WHY in the same space. A QR over a loopback URL photographs
     * exactly like one that works and fails silently on the phone — so the
     * empty state here is a sentence, never a greyed-out square.
     */
    function qrBlock(w) {
        if (w.qr) {
            return `<div class="webqr">
                <div class="webqr-img">${w.qr}</div>
                <div class="webqr-cap muted small">Point the phone's camera at it — the link carries the token.</div>
            </div>`;
        }
        const why = w.status.state === 'local'
            ? 'No code: the link is 127.0.0.1, which only this computer can open. Switch the binding to LAN.'
            : w.status.state === 'lan-no-address'
                ? 'No code: this machine has no address on a network right now.'
                : w.status.state === 'off'
                    ? 'No code while the view is off.'
                    : 'No code: ' + w.status.state.replace(/-/g, ' ') + '.';
        return `<div class="webqr webqr-none"><div class="webqr-cap muted small">${esc(why)}</div></div>`;
    }

    /**
     * The link, whole, with the two things anybody does to it.
     *
     * ‼️ NO `copy` WHILE NOTHING IS LISTENING. Seen in the render: with the
     * view switched off the card still offered a full address and a copy
     * button, and what that puts on the clipboard is a URL that refuses every
     * request. The address is still worth showing — it is what the link WILL
     * be — but shown as what it is, and without the button that spreads it.
     */
    function linkRow(w) {
        if (!w.url) {
            return `<div class="svc-row">
                <label class="svc-lbl">Link</label>
                <div class="svc-val"><span class="muted small">There is no link until a token exists.</span></div>
            </div>`;
        }
        return `<div class="svc-row">
            <label class="svc-lbl">Link</label>
            <div class="svc-val">
                <code class="weburl${w.serving ? '' : ' weburl-dead'}" title="${esc(w.url)}">${esc(w.url)}</code>
                ${w.serving
                ? '<button class="mini" data-web="copy">copy</button>'
                : '<span class="muted small">not live — nothing is listening on this address yet</span>'}
                ${window.AFTip.wrap('<button class="mini" data-web="token">new token</button>',
            'New token',
            'Mints a fresh token and puts it in force at once.\n\n‼️ Every link made from the old one '
            + 'dies with it, including a bookmark saved on the phone — the page stores the token in a '
            + 'cookie, so a phone that was working simply starts being refused.', 'svc-tip')}
            </div>
        </div>`;
    }

    /** ‼️ LAN IS A SECURITY CHOICE, so the switch says what it does before it is moved. */
    function bindRow(w) {
        // ‼️ EVERY OPTION CARRIES ITS OWN TITLE. A row cut by a narrow select
        // says nothing on hover otherwise, and a binding is the one choice on
        // this card that decides who can read the farm.
        const opt = (v, label, why) =>
            `<option value="${v}" title="${esc(why)}"${w.bind === v ? ' selected' : ''}>${label}</option>`;
        return `<div class="svc-row">
            <label class="svc-lbl">Binding</label>
            <div class="svc-val">
                ${window.AFTip.wrap(
            `<select id="web-bind" ${w.enabled ? '' : 'disabled'}>
                        ${opt('local', 'local — 127.0.0.1, this computer only',
                'The port stays on the loopback address: nothing outside this machine can open it, '
                + 'and there is no code worth scanning.')}
                        ${opt('lan', 'LAN — every interface, reachable from your phone',
                    'The dashboard is served to everyone on this network who has the link. '
                    + 'It stays READ ONLY, and you are asked to confirm the move every time.')}
                    </select>`,
            'Binding — ' + (w.bind === 'lan' ? 'LAN' : 'local'),
            'local keeps the port on 127.0.0.1: nothing outside this machine can open it, and there '
            + 'is no code to scan.\n\nLAN serves the dashboard to everyone on this network who has '
            + 'the link. You are asked to confirm it every time, because that is a decision about '
            + 'your network and not a preference.\n\nEither way it stays READ ONLY.', 'svc-tip')}
                <span class="muted small">${w.lanAddress
                ? 'this machine is ' + esc(w.lanAddress) + ' on its network'
                : 'this machine has no non-internal address right now'}</span>
            </div>
        </div>`;
    }

    function head(w) {
        const s = w.status;
        return `<div class="svc-head">
            <b>Agent Farm on your Phone</b> ${badge(w)}
            <span class="muted small">port ${esc(w.port)}</span>
            <span class="svc-sp"></span>
            ${w.enabled
                ? '<button class="mini" data-web="stop">turn off</button>'
                : `<button class="mini" data-web="start" data-bind="local">start local</button>
                   <button class="mini" data-web="start" data-bind="lan">start on LAN</button>`}
        </div>
        <div class="muted small svc-detail">${esc(s.detail)}${s.next ? ' <b>' + esc(s.next) + '</b>' : ''}</div>`;
    }

    /**
     * @param w    the card data, composed by `panels/toolboxWeb.webCardData`
     * @param opts { msg }
     */
    function card(w, opts) {
        const o = opts || {};
        if (!w) {
            return `<div class="card"><b>The web view is not available in this window.</b>
                <span class="muted">The page was opened without the extension's service view.</span></div>`;
        }
        const msg = o.msg;
        return `<div class="card svc-card">
            ${head(w)}
            ${msg ? `<div class="svc-msg ${msg.ok ? 'ok' : 'bad'}">${esc(msg.text)}</div>` : ''}
            <div class="svc-facts">
                <span class="svc-fact">Serving <b class="${w.serving ? 'svc-y' : 'svc-n'}">${w.serving ? 'yes' : 'no'}</b></span>
                <span class="svc-fact">Token <b class="${w.hasToken ? 'svc-y' : 'svc-n'}">${w.hasToken ? 'set' : 'missing'}</b></span>
                <span class="svc-fact">Phone can reach it <b class="${w.status.phoneReachable ? 'svc-y' : 'svc-n'}">${w.status.phoneReachable ? 'yes' : 'no'}</b></span>
            </div>
            <div class="webbody">
                <div class="webbody-l">
                    ${bindRow(w)}
                    ${linkRow(w)}
                </div>
                ${qrBlock(w)}
            </div>
        </div>`;
    }

    /**
     * ‼️ EVERY CONTROL POSTS AND WAITS — the host owns the settings file, and a
     * card that painted the new binding before the write landed would show a
     * state that does not exist the moment a write is refused. Wiring is safe
     * on a surface that drew nothing: every lookup finds nothing.
     */
    function wire(post) {
        const bind = document.getElementById('web-bind');
        if (bind) {
            bind.addEventListener('change', () => post({ type: 'web-bind', bind: bind.value }));
        }
        document.querySelectorAll('[data-web]').forEach(b => b.addEventListener('click', () => {
            const act = b.dataset.web;
            // ‼️ The four types are written out rather than built from the
            // attribute: a message type assembled at runtime is a door the
            // parity gate cannot see.
            if (act === 'start') { post({ type: 'web-start', bind: b.dataset.bind }); }
            else if (act === 'stop') { post({ type: 'web-stop' }); }
            else if (act === 'token') { post({ type: 'web-token' }); }
            else if (act === 'copy') {
                const el = document.querySelector('.weburl');
                post({ type: 'web-copy', url: el ? el.textContent : '' });
            }
        }));
    }

    /** ONE copy of the card's rules, injected by whichever page draws it. */
    function css() {
        return `
            .webbody { display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; }
            .webbody-l { flex:1 1 320px; min-width:280px; }
            .weburl { font-family:var(--vscode-editor-font-family); font-size:11px;
                background:var(--vscode-textBlockQuote-background); padding:2px 6px; border-radius:3px;
                max-width:100%; overflow-wrap:anywhere; }
            /* An address nothing answers on reads as one: struck through, so it
               is never mistaken for a link to hand somebody. */
            .weburl-dead { opacity:.6; text-decoration:line-through; }
            .webqr { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; gap:4px;
                max-width:200px; }
            /* The code keeps its own black on white in every theme: a scanner
               reads contrast, and a QR tinted to match a dark panel is the one
               that fails on the phone while looking right on the screen. */
            .webqr-img svg { display:block; border-radius:4px; }
            .webqr-cap { text-align:center; max-width:190px; }
            .webqr-none { padding:10px 0; }
            html.af-phone [data-web=copy] { display:none; }
        `;
    }

    window.AFWeb = { card: card, wire: wire, css: css, dot: dot, line: line, words: words };
})();
