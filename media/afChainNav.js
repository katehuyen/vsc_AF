// U-167 / U-173 — A RELAY CHAIN ON A SESSION'S OWN PAGE, said once.
//
// The chain id appears ONCE (one click copies it) followed by the walk:
// « first · ‹ previous · ⑂ 24/25 · next › · last » — the counter opens every
// leg in a list (click or right-click) to jump straight to one. The row ends in
// the relay's chip (`⑂ 24`, `⑂ 1 first`, `⑂ 25 latest`), coloured like every
// other ⑂ in the extension. Every piece carries an AFTip; the host decides the
// place (chainMembership.chainPlace) and this only draws it. Look: common.css.
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const short = s => String(s || '').slice(0, 8);
    const when = ts => (ts && window.AFTime ? window.AFTime.stamp(ts) : '');
    let current = null;

    function tip(trigger, head, lines) {
        return window.AFTip
            ? window.AFTip.wrap(trigger, head, window.AFTip.lines(lines))
            : trigger.replace(/^<(\w+)/, `<$1 title="${esc([head, '', ...lines].join('\n'))}"`);
    }

    const legsOf = c => (Array.isArray(c.legs) && c.legs.length ? c.legs : []);
    const legOf = (c, sid) => legsOf(c).find(l => l.sessionId === sid);
    function ran(l) {
        if (!l || (!l.opened && !l.passed)) { return ''; }
        return `Ran: ${l.opened ? when(l.opened) : '?'} → ${l.passed ? when(l.passed) + ' (passed)' : 'no pass on record'}`;
    }
    const legLine = (c, sid) => { const l = legOf(c, sid); return `Session ${short(sid)}${l ? ` — leg ${l.leg}` : ''}`; };

    /** One walking button: the session it opens, or a disabled one saying why not. */
    function step(glyph, name, c, sid, none) {
        if (!sid) { return tip(`<button class="afchain-nav" disabled aria-label="${esc(name)}">${glyph}</button>`, name, [none]); }
        const l = legOf(c, sid);
        return tip(`<button class="afchain-nav" data-chaingo="${esc(sid)}" aria-label="${esc(name)}">${glyph}</button>`,
            `${name} — ⑂ ${l ? l.leg : '?'}`, [legLine(c, sid), ...(ran(l) ? [ran(l)] : []), '', 'Click: open it in this tab.']);
    }

    /**
     * c — { chainId, self, leg, of, max?, legs?, prev?, next?, first, last, open }, or
     * nothing (a session that ran no leg of a relay draws nothing at all).
     */
    function html(c) {
        current = c && c.chainId ? c : null;
        if (!current) { return ''; }
        const legs = legsOf(c);
        const self = legOf(c, c.self);
        const firstSid = legs.length && !c.first ? legs[0].sessionId : '';
        const lastSid = legs.length && !c.last ? legs[legs.length - 1].sessionId : '';
        const cap = typeof c.max === 'number' ? (c.max > 0 ? `${c.max} legs` : 'none') : '';
        const idBtn = tip(`<button class="idcopy" data-chaincopy="${esc(c.chainId)}">${esc(c.chainId)}</button>`,
            `Chain ${c.chainId}`, [
                `Legs on record: ${legs.length || c.of}${c.open ? ' — still running' : ' — ended'}`,
                ...(cap ? [`Ceiling: ${cap}`] : []),
                ...(legs[0] && legs[0].opened ? [`Started: ${when(legs[0].opened)}`] : []),
                '', 'Click: copy the chain id.'
            ]);
        const count = tip(`<button class="afchain-count afbaton" data-chainmenu="1" aria-haspopup="listbox">⑂ ${c.leg}/${c.of}</button>`,
            `Baton relay — leg ${c.leg} of ${c.of}`, [
                `Chain: ${c.chainId}`,
                `Leg: ${c.leg} of ${c.of}${c.open ? ' so far — the chain is still running' : ''}`,
                ...(cap ? [`Ceiling: ${cap}`] : []),
                ...(ran(self) ? [ran(self)] : []),
                `Previous: ${c.prev ? legLine(c, c.prev) : (c.first ? 'none — this leg started the chain' : 'not on record')}`,
                `Next: ${c.next ? legLine(c, c.next) : (c.open ? 'none yet' : 'none — the chain ended here')}`,
                '', 'Click or right-click: every leg — pick one to jump to it.'
            ]);
        return `<span class="afchain">${idBtn} `
            + step('«', 'First leg', c, firstSid, c.first ? 'This is the first leg of the chain.' : 'The first leg is not on record.')
            + step('‹', 'Previous leg', c, c.prev, c.first ? 'This is the first leg of the chain.' : 'The leg before is not on record.')
            + count
            + step('›', 'Next leg', c, c.next, c.open ? 'No next leg yet — the chain is still running.' : 'This is the last leg of the chain.')
            + step('»', 'Last leg', c, lastSid, c.open ? 'This is the newest leg — the chain is still running.' : 'This is the last leg of the chain.')
            + '</span>';
    }

    /** The row's closing chip: `⑂ 24`, `⑂ 1 first`, `⑂ 25 latest` / `last`. */
    function chip(c) {
        if (!c || !c.chainId) { return ''; }
        const word = c.first ? 'first' : c.last ? (c.open ? 'latest' : 'last') : '';
        const self = legOf(c, c.self);
        return tip(`<span class="afchain-badge afbaton">⑂ ${c.leg}${word ? ` <b>${word}</b>` : ''}</span>`,
            `Leg ${c.leg} of chain ${c.chainId}`, [
                word === 'first' ? 'The session that started the relay.'
                    : word === 'latest' ? 'The newest leg — the chain is still running.'
                        : word === 'last' ? 'The chain ended at this leg.' : `A middle leg — ${c.leg - 1} before it on record order, ${c.of - c.leg} after.`,
                ...(ran(self) ? [ran(self)] : [])
            ]);
    }

    function closeMenu() {
        const m = document.querySelector('.afchain-menu');
        if (m) { m.remove(); }
        document.querySelectorAll('button[data-chainmenu][aria-expanded]').forEach(b => b.removeAttribute('aria-expanded'));
    }

    /** The list's rows: every leg on record, this one marked and not pressable. */
    function menuHtml(c) {
        const legs = c ? legsOf(c) : [];
        if (!legs.length) { return ''; }
        return `<div class="afchain-mhead">Chain ${esc(c.chainId)} — ${legs.length} legs${c.open ? ', running' : ''}</div>`
            + legs.map(l => {
                const me = l.sessionId === c.self;
                return `<button class="afchain-mi${me ? ' cur' : ''}" role="option" ${me ? 'aria-selected="true" disabled' : `data-chaingo="${esc(l.sessionId)}"`}>`
                    + `<span class="afbaton">⑂ ${l.leg}</span><span class="afchain-msid">${esc(short(l.sessionId))}</span>`
                    + `<span class="afchain-mt">${esc(when(l.opened || l.passed))}</span></button>`;
            }).join('');
    }

    /** Every leg in a bounded, scrolling list under the counter — kept inside the window. */
    function openMenu(anchor, vscode) {
        closeMenu();
        const rows = menuHtml(current);
        if (!rows) { return; }
        const m = document.createElement('div');
        m.className = 'afchain-menu';
        m.setAttribute('role', 'listbox');
        m.innerHTML = rows;
        document.body.appendChild(m);
        anchor.setAttribute('aria-expanded', 'true');
        const r = anchor.getBoundingClientRect();
        const w = m.offsetWidth, h = m.offsetHeight;
        const left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4));
        const below = window.innerHeight - r.bottom - 4;
        m.style.left = left + 'px';
        m.style.top = (below >= h || below >= r.top ? r.bottom + 2 : Math.max(4, r.top - h - 2)) + 'px';
        const cur = m.querySelector('.afchain-mi.cur');
        if (cur) { cur.scrollIntoView({ block: 'center' }); }
        m.addEventListener('click', ev => {
            const go = ev.target.closest ? ev.target.closest('button[data-chaingo]') : null;
            if (go) { vscode.postMessage({ type: 'chainGo', sessionId: go.dataset.chaingo || '' }); closeMenu(); }
        });
    }

    /** One delegated listener on `root`: copy the id, walk a leg, open the list. */
    function wire(root, vscode) {
        if (!root || root.__afChainWired) { return; }
        root.__afChainWired = true;
        const menuFor = ev => {
            const t = ev.target && ev.target.closest ? ev.target.closest('button[data-chainmenu]') : null;
            if (!t) { return false; }
            ev.preventDefault();
            ev.stopPropagation();
            if (document.querySelector('.afchain-menu')) { closeMenu(); } else { openMenu(t, vscode); }
            return true;
        };
        root.addEventListener('contextmenu', menuFor);
        root.addEventListener('click', ev => {
            const t = ev.target && ev.target.closest ? ev.target : null;
            if (!t || menuFor(ev)) { return; }
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
        // the list closes on a press elsewhere, Escape, or a resize (page shims may lack these hooks)
        if (typeof document.addEventListener === 'function') {
            document.addEventListener('mousedown', ev => {
                if (!ev.target.closest || (!ev.target.closest('.afchain-menu') && !ev.target.closest('button[data-chainmenu]'))) { closeMenu(); }
            });
            document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeMenu(); } });
        }
        if (typeof window.addEventListener === 'function') { window.addEventListener('resize', closeMenu); }
    }

    /**
     * U-174 — the chains a table's rows ran in, newest first, for its ⑂ Chains
     * picker: `{ v: chainId, t: "chn_… · 25 legs" }`. `chainOf(row)` names a
     * row's chain ('' = none), so every table decides membership its own way.
     */
    function options(rows, chainOf) {
        const seen = Object.create(null);
        const out = [];
        (rows || []).forEach(r => {
            const id = chainOf(r);
            if (!id) { return; }
            const ts = r.ts || 0;
            if (!seen[id]) { seen[id] = { v: id, n: 0, ts }; out.push(seen[id]); }
            seen[id].n++;
            if (ts > seen[id].ts) { seen[id].ts = ts; }
        });
        return out.sort((a, b) => b.ts - a.ts).map(x => ({ v: x.v, t: `${x.v} · ${x.n} leg${x.n === 1 ? '' : 's'}` }));
    }

    /** S-123 — the line a ⑂ mark's hover ends with when the mark opens its chain. */
    const OPEN_HINT = 'Click: this chain on the Chains page.';

    /** S-123 — the attributes that make a ⑂ mark open its chain on the Chains page (wireOpen does the rest). */
    function openAttr(chainId) {
        return chainId ? `data-chainopen="${esc(chainId)}" role="link" tabindex="0"` : '';
    }

    /**
     * S-123 — ONE listener per page, on the document in the capture phase: a press on a ⑂ mark opens
     * its chain (afnav `chains:<id>`, routed by handleAfNav) and goes no further, so the row the mark
     * sits in does not open as well — and a mark drawn by a later repaint needs no wiring of its own.
     */
    function wireOpen(vscode) {
        if (window.__afChainOpenWired || typeof document.addEventListener !== 'function') { return; }
        window.__afChainOpenWired = true;
        const go = ev => {
            const t = ev.target && ev.target.closest ? ev.target.closest('[data-chainopen]') : null;
            if (!t) { return; }
            ev.preventDefault();
            ev.stopPropagation();
            vscode.postMessage({ type: 'afnav', to: 'chains:' + t.dataset.chainopen });
        };
        document.addEventListener('click', go, true);
        document.addEventListener('keydown', ev => { if (ev.key === 'Enter') { go(ev); } }, true);
    }

    window.AFChainNav = { html, chip, menuHtml, wire, closeMenu, options, openAttr, wireOpen, OPEN_HINT };
})();
