// AFColFit — a fixed-layout table whose columns are SHARES keeps every column
// at least as wide as the fact it holds (U-192).
//
// Shares scale with the table, so on a narrow one (a landscape phone, a VS Code
// column) a share became narrower than its own header and figure: measured at
// 800px, twelve of the Sessions table's thirteen columns overflowed into their
// neighbours ("DurationTurnsToolsFiles") and the cost ran off the edge. A
// column's FLOOR is the wider of its header text (measured live, so it follows
// the font) and the widest figure it is declared to hold (in em). Where the
// shares hold every floor nothing is touched; where one would fall under, it
// gets its floor and the others share what is left by their shares; and where
// the floors alone are wider than the box, the table is that wide and its
// .tablewrap scrolls sideways. A figure is never cut and never overlaps.
(function () {
    'use strict';

    /** Pure: px widths for the share columns in `room` px. `bound` says a floor decided it. */
    function fit(cols, shares, floors, room) {
        const w = {};
        let free = cols.slice();
        let left = room;
        let bound = false;
        for (;;) {
            const total = free.reduce((n, c) => n + (shares[c] || 0), 0) || 1;
            const under = free.filter(c => (shares[c] || 0) / total * left < (floors[c] || 0));
            if (!under.length) {
                free.forEach(c => { w[c] = (shares[c] || 0) / total * left; });
                return { w, bound };
            }
            bound = true;
            under.forEach(c => { w[c] = floors[c]; left -= floors[c]; });
            free = free.filter(c => under.indexOf(c) < 0);
            if (!free.length) { return { w, bound }; }
        }
    }

    function textWidth(cell) {
        const r = document.createRange();
        r.selectNodeContents(cell);
        const cs = getComputedStyle(cell);
        return r.getBoundingClientRect().width + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }

    function apply(host) {
        const spec = host.__afColFit.spec;
        const table = host.querySelector(spec.table);
        if (!table || typeof table.getBoundingClientRect !== 'function' || !table.parentElement) { return; }
        const colEls = Array.prototype.slice.call(table.querySelectorAll(':scope > colgroup > col'));
        const head = table.querySelector(spec.head);
        const ths = head ? Array.prototype.slice.call(head.children) : [];
        // The declared percentages are what a page renders; a fit is laid over them and taken off again.
        colEls.forEach(c => {
            if (c.dataset.afShare === undefined) { c.dataset.afShare = c.style.width; }
            c.style.width = c.dataset.afShare;
        });
        table.style.width = '';
        // On a phone the rows are cards (media/afMobile.js) and a column has no width to keep.
        if (document.documentElement.classList.contains('af-phone') || ths.length !== colEls.length) { return; }
        const lead = colEls.length - spec.cols.length;
        const em = parseFloat(getComputedStyle(table).fontSize) || 12;
        let fixed = 0;
        const pool = [], floors = {};
        ths.forEach((th, i) => {
            const c = i >= lead ? spec.cols[i - lead] : null;
            if (!c || !(spec.shares[c] > 0)) { fixed += th.getBoundingClientRect().width; return; }
            pool.push(c);
            floors[c] = Math.ceil(Math.max(textWidth(th), (spec.floorsEm[c] || 0) * em));
        });
        const avail = table.parentElement.clientWidth;
        const r = fit(pool, spec.shares, floors, avail - fixed);
        if (!r.bound) { return; }
        let sum = fixed;
        spec.cols.forEach((c, i) => {
            if (r.w[c] === undefined) { return; }
            colEls[lead + i].style.width = r.w[c].toFixed(1) + 'px';
            sum += r.w[c];
        });
        if (sum > avail + 0.5) { table.style.width = Math.ceil(sum) + 'px'; }
    }

    /** Fit the table inside `host` now, and again whenever the host's width changes. */
    function attach(host, spec) {
        if (!host) { return; }
        let st = host.__afColFit;
        if (!st) {
            st = host.__afColFit = { spec, w: -1 };
            if (typeof ResizeObserver === 'function') {
                new ResizeObserver(() => {
                    if (host.clientWidth === st.w) { return; }
                    st.w = host.clientWidth;
                    apply(host);
                }).observe(host);
            }
        }
        st.spec = spec;
        apply(host);
    }

    window.AFColFit = { fit, attach };
})();
