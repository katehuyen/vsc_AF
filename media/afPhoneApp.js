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

    const TONE_DOT = { ok: '●', bad: '●', warn: '●', off: '○' };
    const WORDS = {
        off: 'off', 'other-window': 'in another window', 'not-listening': 'not listening',
        'local-only': 'this computer only', listening: 'listening'
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
            <td>${window.AFTip.wrap(esc(d.scope), 'Scope: ' + d.scope,
            'read: sees the farm · answer: also answers questions and permissions · manage: also starts and stops work · admin: everything', 'svc-tip')}</td>
            <td class="muted">${esc(day(d.pairedAt))}</td>
            <td>${d.revoked ? '<span class="muted">revoked</span>'
                : `<button class="mini" data-remote="revoke" data-device="${esc(d.id)}" data-name="${esc(d.name)}">revoke</button>`}</td>
        </tr>`).join('');
        return `<table class="rm-devices"><thead><tr>
            <th>Phone</th><th>Scope</th><th>Paired</th><th></th>
        </tr></thead><tbody>${rows}</tbody></table>`;
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
                </div>
                ${pairBlock(r)}
            </div>
        </div>`;
    }

    /** Every control posts and waits; the types are written out for the parity gate. */
    function wire(post) {
        const mode = document.getElementById('remote-mode');
        if (mode) { mode.addEventListener('change', () => post({ type: 'remote-listen', mode: mode.value })); }
        document.querySelectorAll('[data-remote]').forEach(b => b.addEventListener('click', () => {
            const act = b.dataset.remote;
            if (act === 'pair') { post({ type: 'remote-pair' }); }
            else if (act === 'revoke') { post({ type: 'remote-revoke', device: b.dataset.device, name: b.dataset.name }); }
            else if (act === 'revoke-all') { post({ type: 'remote-revoke-all' }); }
        }));
    }

    function css() {
        return `
            .rm-devices { border-collapse:collapse; margin-top:6px; font-size:12px; }
            .rm-devices th, .rm-devices td { text-align:left; padding:2px 10px 2px 0; }
            .rm-devices th { font-weight:normal; opacity:.7; }
            .rm-revoked td:first-child { text-decoration:line-through; opacity:.6; }
        `;
    }

    window.AFPhoneApp = { card: card, wire: wire, css: css };
})();
