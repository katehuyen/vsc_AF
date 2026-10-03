// Agent Farm — THE BULK HAND (N-11). Notices' list contract, shared by every
// list page that has one: a box at the HEAD of each row, a ✕ at its TAIL, and
// one bar on its own line UNDER the filters — [ ] all · the bulk buttons —
// aimed at the SELECTED rows, or at every row shown when none is.
//
// ‼️ The bar never sits among the filters. A list control floating between a
// search box and the pickers reads as one more filter; `afb-break` starts it on
// a line of its own, which is how Notices has always drawn it.
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
    const tip = (html, head, body) => (window.AFTip ? window.AFTip.wrap(html, head, body) : html);
    // U-189 — this hand's own words; what a page hands it (a label, a head) the page has already translated.
    const t = s => (window.AFI18n ? window.AFI18n.t(s) : s);

    /** The row's head. */
    function cb(id, checked) {
        return `<input type="checkbox" class="afb-cb" data-cb="${esc(id)}"${checked ? ' checked' : ''}`
            + ` title="${esc(t('Select for the bulk actions under the filters'))}">`;
    }

    /** The row's tail. `held` disables it and says why — a live hand is on the row. */
    function x(id, label, held) {
        return `<button class="secondary afb-x" data-row-delete="${esc(id)}" aria-label="${esc(label)}"`
            + ` title="${esc(held || label)}"${held ? ' disabled' : ''}>✕</button>`;
    }

    /** The bar: `id` names the select-all box, `buttons` are drawn after it. */
    function bar(id, allChecked, buttons) {
        return '<span class="afb-break"></span><span class="afb-bar">'
            + `<label class="afb-selall" title="${esc(t('Select / deselect every row shown'))}"><input type="checkbox" id="${esc(id)}"${allChecked ? ' checked' : ''}> ${esc(t('all'))}</label>`
            + buttons.join('') + '</span>';
    }

    function delBtn(head, body) {
        return tip(`<button class="secondary danger" data-hact="bulkDelete"><span class="afb-trash">🗑</span> ${esc(t('Delete'))}</button>`, head, body);
    }

    function clearBtn(act, label, head, body) {
        return tip(`<button class="secondary" data-hact="${esc(act)}"><span class="afb-dot">●</span> ${esc(label)}</button>`, head, body);
    }

    /** "2h ago" on the row, the full clock with UTC on hover. */
    function age(ts, head) {
        return tip(`<span class="afb-age">${esc(window.AFTime.ago(ts))}</span>`, head, window.AFTime.tip(ts, head));
    }

    function dayLabel(ts, now) {
        const d = new Date(ts), n = new Date(now || Date.now());
        const k = v => `${v.getFullYear()}-${v.getMonth()}-${v.getDate()}`;
        const y = new Date(n); y.setDate(n.getDate() - 1);
        if (k(d) === k(n)) { return t('Today'); }
        if (k(d) === k(y)) { return t('Yesterday'); }
        return d.toLocaleDateString((window.AFI18n && window.AFI18n.locale()) || undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }

    /** The rows, with a day header wherever the calendar day changes. */
    function days(items, draw, now) {
        let out = '', last = '';
        for (const it of items) {
            const d = dayLabel(it.ts, now);
            if (d !== last) { out += `<div class="afb-day">${esc(d)}</div>`; last = d; }
            out += draw(it);
        }
        return out;
    }

    /**
     * o: { allId, selected (Set), shown () → ids, repaint (), onRowDelete (id), onBulk (act, ids) }.
     * Every hand here stops the click, so a row that opens on click does not open under it.
     */
    function wire(o) {
        document.querySelectorAll('[data-cb]').forEach(el => el.addEventListener('click', ev => {
            ev.stopPropagation();
            if (el.checked) { o.selected.add(el.dataset.cb); } else { o.selected.delete(el.dataset.cb); }
            o.repaint();
        }));
        const all = document.getElementById(o.allId);
        if (all) {
            all.addEventListener('change', ev => {
                o.shown().forEach(id => (ev.target.checked ? o.selected.add(id) : o.selected.delete(id)));
                o.repaint();
            });
        }
        document.querySelectorAll('[data-row-delete]').forEach(el => el.addEventListener('click', ev => {
            ev.stopPropagation();
            o.selected.delete(el.dataset.rowDelete);
            o.onRowDelete(el.dataset.rowDelete);
        }));
        document.querySelectorAll('[data-hact]').forEach(el => el.addEventListener('click', ev => {
            ev.stopPropagation();
            const ids = o.selected.size ? [...o.selected] : o.shown();
            o.onBulk(el.dataset.hact, ids);
        }));
    }

    window.AFBulk = { cb, x, bar, delBtn, clearBtn, age, dayLabel, days, wire, esc };
})();
