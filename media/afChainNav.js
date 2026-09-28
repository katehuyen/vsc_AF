// U-167 — A RELAY CHAIN ON A SESSION'S OWN PAGE: the chain id (one click
// copies it, like the session id beside it), ‹ › to the leg before and after —
// the way a browser walks its history — and a badge on the chain's first leg
// and on its last. The host decides the place (chainMembership.chainPlace);
// this only draws it and says which leg was asked for. Its look is in common.css.
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /** One leg's arrow: the session it opens, or a disabled arrow saying why not. */
    function arrow(glyph, sid, leg, none) {
        return sid
            ? `<button class="afchain-nav" data-chaingo="${esc(sid)}" title="Open leg ${leg} (session ${esc(sid.slice(0, 8))})">${glyph}</button>`
            : `<button class="afchain-nav" disabled title="${esc(none)}">${glyph}</button>`;
    }

    /**
     * c — { chainId, leg, of, prev?, next?, first, last, open }, or nothing
     * (a session that ran no leg of a relay draws nothing at all).
     */
    function html(c) {
        if (!c || !c.chainId) { return ''; }
        const badge = c.first ? '<span class="afchain-badge">first</span>' : '';
        const end = c.last ? `<span class="afchain-badge">${c.open ? 'latest' : 'last'}</span>` : '';
        const tipLines = [
            `Chain: ${c.chainId}`,
            `Leg: ${c.leg} of ${c.of}${c.open ? ' so far — the chain is still running' : ''}`,
            `Previous: ${c.prev ? 'session ' + c.prev.slice(0, 8) : (c.first ? 'none — this leg started the chain' : 'not on record')}`,
            `Next: ${c.next ? 'session ' + c.next.slice(0, 8) : (c.open ? 'none yet' : 'none — the chain ended here')}`
        ];
        const chip = window.AFTip
            ? window.AFTip.wrap(`<span>⑂ ${c.leg}/${c.of}</span>`, `Baton relay — leg ${c.leg} of ${c.of}`, window.AFTip.lines(tipLines))
            : `<span title="${esc(tipLines.join('\n'))}">⑂ ${c.leg}/${c.of}</span>`;
        return `<span class="afchain">${arrow('‹', c.prev, c.leg - 1, c.first ? 'This is the first leg of the chain' : 'The leg before is not on record')}`
            + ` ${chip} <button class="idcopy" data-chaincopy="${esc(c.chainId)}" title="Click to copy this chain id">${esc(c.chainId)}</button>`
            + ` ${arrow('›', c.next, c.leg + 1, c.open ? 'No next leg yet — the chain is still running' : 'This is the last leg of the chain')}${badge}${end}</span>`;
    }

    /** One delegated listener on `root`: copy the id, or ask the host for a leg. */
    function wire(root, vscode) {
        if (!root || root.__afChainWired) { return; }
        root.__afChainWired = true;
        root.addEventListener('click', ev => {
            const t = ev.target && ev.target.closest ? ev.target : null;
            if (!t) { return; }
            const cp = t.closest('button[data-chaincopy]');
            if (cp) {
                ev.stopPropagation();
                if (window.AFTextTools) { window.AFTextTools.copyFrom(cp, cp.dataset.chaincopy || ''); }
                return;
            }
            const go = t.closest('button[data-chaingo]');
            if (go && !go.disabled) {
                ev.stopPropagation();
                vscode.postMessage({ type: 'chainGo', sessionId: go.dataset.chaingo || '' });
            }
        });
    }

    window.AFChainNav = { html, wire };
})();
