// Agent Farm — THE PHONE APP CARD: where the Agent Farm app can reach this farm,
// the code that pairs a new phone, and the phones already paired.
//
// The card decides nothing: the state, tone and sentence come from
// src/core/remoteCard.ts and the pairing QR arrives encoded from the host.
(function () {
    'use strict';

    const esc = v => (window.AFCharts && window.AFCharts.esc)
        ? window.AFCharts.esc(v)
        : String(v === null || v === undefined ? '' : v);
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const N_ = s => s;

    const SCOPES = [
        ['read', N_('read: sees the farm')],
        ['answer', N_('answer: also answers questions and permissions')],
        ['manage', N_('manage: also starts and stops work')],
        ['admin', N_('admin: also settings, accounts, agent files and the phones')]
    ];
    const WHAT = {
        pair: N_('paired'), 'pair-refused': N_('wrong pairing code'), connect: N_('connected'), refused: N_('turned away'),
        call: N_('called'), action: N_('pressed'), revoke: N_('revoked'), scope: N_('scope changed')
    };

    const TONE_DOT = { ok: '●', bad: '●', warn: '●', off: '○' };
    const WORDS = {
        off: 'off', 'other-window': 'in another window', 'not-listening': 'not listening',
        'local-only': 'this computer only', firewall: 'firewall stops phones', listening: 'listening'
    };
    const MODES = [
        ['off', 'off — no phone can reach it', 'Nothing listens. Paired phones stay paired and reconnect when it is on again.'],
        ['local', 'local — 127.0.0.1 (emulator)', 'Only this computer: an Android emulator reaches it at 10.0.2.2, a phone does not.'],
        ['lan', 'LAN — your Wi-Fi', 'Every interface; the pairing code names this machine\'s private addresses. A phone must be paired to get in.'],
        ['tailscale', 'Tailscale — from anywhere', 'Only this machine\'s Tailscale address (100.x). A paired phone on your tailnet reaches it from anywhere.']
    ];

    const day = ms => {
        const d = new Date(ms);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    };
    /** Today: the time; earlier: the day and the time. */
    const when = ms => {
        const d = new Date(ms);
        if (isNaN(d.getTime())) { return ''; }
        const hm = d.toTimeString().slice(0, 5);
        return d.toDateString() === new Date().toDateString() ? hm : day(ms) + ' ' + hm;
    };

    /** MIRROR — the badge opens with the current value, then what is behind it. */
    function badge(r) {
        const s = r.status;
        return window.AFTip.wrap(
            `<span class="svc-badge t-${esc(s.tone)}">${TONE_DOT[s.tone] || '●'} ${esc(WORDS[s.state] || s.state)}</span>`,
            'Phone app — ' + (WORDS[s.state] || s.state),
            s.detail
            + '\n\nMode: ' + r.mode
            + '\nPort: ' + r.port
            + '\nAddresses: ' + (r.addresses.length ? r.addresses.join(', ') : 'none')
            + '\nOpen connections: ' + r.sockets
            + '\nFarm: ' + r.farm.name + ' (' + r.farm.id + ')'
            + (r.fingerprint ? '\nCertificate: ' + r.fingerprint.slice(0, 16) + '…' : '')
            + '\n\nEvery connection is TLS with a certificate the phone pins when it pairs.'
            + (s.hint ? '\n\n' + s.hint : ''),
            'svc-tip');
    }

    function modeRow(r) {
        const opt = m => `<option value="${m[0]}" title="${esc(m[2])}"${r.mode === m[0] ? ' selected' : ''}>${esc(m[1])}</option>`;
        const cur = MODES.find(m => m[0] === r.mode) || MODES[0];
        return `<div class="svc-row">
            <label class="svc-lbl">Reach</label>
            <div class="svc-val">
                ${window.AFTip.wrap(`<select id="remote-mode">${MODES.map(opt).join('')}</select>`,
            'Reach — ' + cur[1], cur[2] + '\n\n' + MODES.map(m => m[1] + ': ' + m[2]).join('\n\n'), 'svc-tip')}
                <span class="muted small">port ${esc(r.port)}</span>
            </div>
        </div>`;
    }

    function pairBlock(r) {
        if (r.pair) {
            return `<div class="webqr">
                ${r.pair.qr ? `<div class="webqr-img">${r.pair.qr}</div>` : ''}
                <div class="webqr-cap muted small">Scan with the Agent Farm app — works once, ${esc(r.pair.minutes)} min left.</div>
                <div class="rm-link">
                    <code class="rm-pairlink" title="Or paste this link into the app's Pair screen">${esc(r.pair.link)}</code>
                    <button class="mini" data-remote="copy-link">copy link</button>
                </div>
            </div>`;
        }
        const why = r.status.phoneReachable
            ? '<button class="mini" data-remote="pair">pair a phone</button>'
            : `<span class="muted small">${esc(r.status.state === 'local-only'
                ? 'An emulator pairs through the address 10.0.2.2; a phone needs LAN or Tailscale.'
                : 'Pairing opens once the farm is listening where a phone can reach it.')}</span>`;
        return `<div class="webqr webqr-none">${why}</div>`;
    }

    function deviceRows(r) {
        if (!r.devices.length) {
            return '<div class="muted small">No phone is paired yet.</div>';
        }
        const rows = r.devices.map(d => `<tr class="${d.revoked ? 'rm-revoked' : ''}">
            <td>${esc(d.name)}</td>
            <td>${scopeCell(d)}</td>
            <td class="muted">${esc(day(d.pairedAt))}</td>
            <td class="muted">${seenCell(d)}</td>
            <td>${d.revoked ? '<span class="muted">revoked</span>'
                : `<button class="mini" data-remote="revoke" data-device="${esc(d.id)}" data-name="${esc(d.name)}">revoke</button>`}</td>
        </tr>`).join('');
        return `<table class="rm-devices"><thead><tr>
            <th>Phone</th><th>Scope</th><th>Paired</th><th>${esc(t('Last seen'))}</th><th></th>
        </tr></thead><tbody>${rows}</tbody></table>`;
    }

    /** A paired phone's scope is chosen here; a revoked one only shows what it had. */
    function scopeCell(d) {
        const levels = SCOPES.map(s => t(s[1])).join('\n');
        const head = t('Scope: {scope}', { scope: d.scope });
        if (d.revoked) { return window.AFTip.wrap(esc(d.scope), head, levels, 'svc-tip'); }
        const opt = s => `<option value="${s[0]}" title="${esc(t(s[1]))}"${d.scope === s[0] ? ' selected' : ''}>${esc(s[0])}</option>`;
        return window.AFTip.wrap(
            `<select class="rm-scope" data-device="${esc(d.id)}" data-name="${esc(d.name)}">${SCOPES.map(opt).join('')}</select>`,
            head, levels + '\n\n' + t('Admin asks first. An open connection holds a new scope at once.'), 'svc-tip');
    }

    function seenCell(d) {
        if (!d.lastSeen) { return '—'; }
        return window.AFTip.wrap(esc(when(d.lastSeen)), t('Last seen: {when}', { when: when(d.lastSeen) }),
            d.lastAddress ? t('From {address}', { address: d.lastAddress }) : t('The address was not recorded.'), 'svc-tip');
    }

    /** Every act redraws the card; an opened activity list stays open through it. */
    let auditOpen = false;

    /** The newest acts of the paired phones; connections are the rows' "last seen". */
    function activity(r) {
        const a = r.audit || [];
        if (!a.length) { return ''; }
        const rows = a.map(e => {
            const what = t(WHAT[e.what] || e.what);
            const thing = e.op ? (e.page ? e.page + ' · ' + e.op : e.op) : (e.detail || '');
            const tip = [
                when(e.ts),
                e.ok ? '' : t('Not done.'),
                e.detail && e.op ? e.detail : '',
                e.address ? t('From {address}', { address: e.address }) : ''
            ].filter(Boolean).join('\n');
            return `<tr class="${e.ok ? '' : 'rm-no'}">
                <td class="muted">${esc(when(e.ts))}</td>
                <td>${esc(e.name || e.device || '—')}</td>
                <td>${window.AFTip.wrap(esc(what) + (e.ok ? '' : ' ✕'), what, tip, 'svc-tip')}</td>
                <td class="muted">${esc(thing)}</td>
            </tr>`;
        }).join('');
        return `<details class="rm-audit"${auditOpen ? ' open' : ''}><summary class="muted small">${esc(t('Recent activity ({n})', { n: a.length }))}</summary>
            <table class="rm-devices"><tbody>${rows}</tbody></table></details>`;
    }

    function card(r, opts) {
        const o = opts || {};
        if (!r) {
            return `<div class="card"><b>The phone app is not available in this window.</b></div>`;
        }
        const msg = o.msg;
        return `<div class="card svc-card">
            <div class="svc-head">
                <b>Agent Farm app</b> ${badge(r)}
                <span class="svc-sp"></span>
                ${r.activeDevices ? '<button class="mini" data-remote="revoke-all">revoke all</button>' : ''}
            </div>
            <div class="muted small svc-detail">${esc(r.status.detail)}${r.status.hint && r.activeDevices && !r.sockets
                ? ' <b>' + esc(r.status.hint) + '</b>' : ''}</div>
            ${r.status.canAllow ? `<div class="rm-fw">${window.AFTip.wrap(
            '<button class="mini" data-remote="firewall-allow">allow phones in</button>',
            'Allow phones in',
            'Windows shows its own permission prompt once (Yes needs an administrator). Agent Farm then adds one '
            + 'Windows Firewall rule, "Agent Farm - phone app": VS Code, port ' + r.port + ', TCP, only from your local '
            + 'network and your Tailscale network. No network setting changes. A rule that blocks VS Code itself is '
            + 'switched off, since it would stop the phone anyway.', 'svc-tip')}</div>` : ''}
            ${msg ? `<div class="svc-msg ${msg.ok ? 'ok' : 'bad'}">${esc(msg.text)}</div>` : ''}
            <div class="svc-facts">
                <span class="svc-fact">Listening <b class="${r.listening ? 'svc-y' : 'svc-n'}">${r.listening ? 'yes' : 'no'}</b></span>
                <span class="svc-fact">Paired phones <b>${esc(r.activeDevices)}</b></span>
                <span class="svc-fact">Connected <b>${esc(r.sockets)}</b></span>
            </div>
            <div class="webbody">
                <div class="webbody-l">
                    ${modeRow(r)}
                    ${deviceRows(r)}
                    ${activity(r)}
                </div>
                ${pairBlock(r)}
            </div>
        </div>`;
    }

    /** Every control posts and waits; the types are written out for the parity gate. */
    function wire(post) {
        const mode = document.getElementById('remote-mode');
        if (mode) { mode.addEventListener('change', () => post({ type: 'remote-listen', mode: mode.value })); }
        document.querySelectorAll('details.rm-audit').forEach(d => d.addEventListener('toggle', () => { auditOpen = !!d.open; }));
        document.querySelectorAll('select.rm-scope').forEach(s => s.addEventListener('change', () =>
            post({ type: 'remote-scope', device: s.dataset.device, name: s.dataset.name, scope: s.value })));
        document.querySelectorAll('[data-remote]').forEach(b => b.addEventListener('click', () => {
            const act = b.dataset.remote;
            if (act === 'pair') { post({ type: 'remote-pair' }); }
            else if (act === 'revoke') { post({ type: 'remote-revoke', device: b.dataset.device, name: b.dataset.name }); }
            else if (act === 'revoke-all') { post({ type: 'remote-revoke-all' }); }
            else if (act === 'firewall-allow') { post({ type: 'remote-firewall-allow' }); }
            else if (act === 'copy-link') {
                const el = document.querySelector('.rm-pairlink');
                post({ type: 'remote-copy-link', link: el ? el.textContent : '' });
            }
        }));
    }

    function css() {
        return `
            .rm-devices { border-collapse:collapse; margin-top:6px; font-size:12px; }
            .rm-devices th, .rm-devices td { text-align:left; padding:2px 10px 2px 0; }
            .rm-devices th { font-weight:normal; opacity:.7; }
            .rm-revoked td:first-child { text-decoration:line-through; opacity:.6; }
            .rm-scope { font-size:11px; padding:0 2px; }
            .rm-audit { margin-top:6px; }
            .rm-audit summary { cursor:pointer; }
            .rm-no td { opacity:.75; }
            .rm-fw { margin:4px 0 2px; }
            .rm-link { display:flex; flex-direction:column; align-items:center; gap:4px; max-width:190px; }
            .rm-pairlink { font-family:var(--vscode-editor-font-family); font-size:10px; word-break:break-all;
                user-select:all; padding:2px 4px; border-radius:3px;
                background:var(--vscode-textCodeBlock-background); }
        `;
    }

    window.AFPhoneApp = { card: card, wire: wire, css: css };
})();
