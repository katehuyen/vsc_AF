// Agent Farm — the phone's pages under 📱 Mobile (U-247): Web and Devices, each one card drawn as the Toolbox
// drew it (media/afWeb.js, media/afPhoneApp.js); Now, the third tab, is media/now.js.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const esc = v => window.AFCharts.esc(v);
    const post = m => vscode.postMessage(m);
    let DATA = window.__DATA__;
    /** what the host did about the card's last act, said IN the card (the Toolbox's contract) */
    let said = null;

    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data || {};
        if (m.type === 'data') { DATA = m.data; repaint(); return; }
        if (m.type === 'web-said' || m.type === 'remote-said') { said = { ok: !!m.ok, text: String(m.text || '') }; render(); }
    });

    const N_ = s => s;
    const SUB = {
        web: N_('The farm in a browser or on your phone: read-only and token-protected.'),
        devices: N_('Pair a phone with the Agent Farm app, see the phones paired, and let them in through your network.')
    };

    function render() {
        const web = DATA.view === 'web';
        const card = web ? window.AFWeb.card(DATA.web, { msg: said })
            : DATA.remote ? window.AFPhoneApp.card(DATA.remote, { msg: said })
                : `<p class="muted">${esc(t('The phone app is not available in this build.'))}</p>`;
        document.getElementById('app').innerHTML = `
            <style>${window.AFWeb.css()}${window.AFPhoneApp.css()}</style>
            ${window.AFHeader.tabs(DATA.view)}
            ${window.AFHeader.html({ page: DATA.view, title: esc(t(web ? 'Web' : 'Devices')), sub: esc(t(SUB[DATA.view])) })}
            ${card}`;
        window.AFHeader.wire(vscode);
        if (web) { window.AFWeb.wire(post); } else { window.AFPhoneApp.wire(post); }
    }

    render();
})();
