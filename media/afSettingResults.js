// Agent Farm — THE SETTINGS RESULTS VIEW (U-224). What the Settings page shows while a query
// is in the box or the Changed chip is on: the sections ordered by their best result, the
// rows inside each in rank order (media/afSettingSearch.js decides both), a count, and an
// empty state that says the query back. Plus the box's own keys and the typing throttle.
(function (factory) {
    'use strict'; // i18n-exempt
    const node = typeof module !== 'undefined' && module.exports;
    const api = factory(node ? require('./afSettingSearch.js') : null);
    if (node) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFSettingResults = api; }
})(function (S0) {
    'use strict'; // i18n-exempt
    const search = () => S0 || window.AFSettingSearch;
    const t = (s, v) => (typeof window !== 'undefined' && window.AFI18n ? window.AFI18n.t(s, v)
        : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

    /**
     * view(categories, q, changed) → { cats, count, error? }. No query: the page's own order,
     * narrowed to changed rows when `changed`. A query: only the sections with a hit, best
     * section first, each row a copy carrying `place` (its section) for the location line.
     */
    function view(categories, q, changed) {
        const base = (categories || []).map(c => Object.assign({}, c, {
            items: (c.items || []).filter(it => !changed || it.modified)
        }));
        if (!String(q || '').trim()) {
            const cats = base.filter(c => c.items.length);
            return { cats, count: cats.reduce((n, c) => n + c.items.length, 0) };
        }
        const flat = [];
        base.forEach((c, ci) => c.items.forEach(it => flat.push({ ci, row: Object.assign({}, it, { place: c.label }) })));
        const ranked = search().rank(flat.map(f => f.row), q);
        const cats = [], at = new Map();
        ranked.forEach(r => {
            const f = flat[r.index];
            if (!at.has(f.ci)) { at.set(f.ci, cats.length); cats.push(Object.assign({}, base[f.ci], { items: [] })); }
            cats[at.get(f.ci)].items.push(f.row);
        });
        return { cats, count: ranked.length, error: ranked.error };
    }

    /** The muted line naming where a result lives — Section › Group when the row knows its group. */
    function placeHtml(it, esc) {
        return it && it.place
            ? `<div class="setplace">${esc(it.place)}${it.group ? ' › ' + esc(it.group) : ''}</div>` : '';
    }

    function countHtml(n, esc) {
        return `<div class="setcount" role="status">${esc(n === 1 ? t('1 setting') : t('{n} settings', { n }))}</div>`;
    }

    /** Nothing to show: the query said back by name, and one press back to every setting. */
    function emptyHtml(q, changed, esc, error) {
        const said = String(q || '').trim()
            ? t('No setting matches "{q}".', { q: String(q).trim() })
            : t('No setting is changed from its default.');
        return `<div class="setempty"><span class="muted">${esc(said)}${changed && String(q || '').trim()
            ? ' ' + esc(t('(only changed settings are searched)')) : ''}${error ? ' — ' + esc(error) : ''}</span>
            <button class="secondary small" id="setclear">${esc(t('Show all settings'))}</button></div>`;
    }

    const chipClass = on => 'secondary small setchip' + (on ? ' on' : ''); // i18n-exempt
    function chipHtml(n, on, esc) {
        if (!n && !on) { return ''; }
        return `<button class="${chipClass(on)}" id="setchanged" aria-pressed="${on ? 'true' : 'false'}"
            title="${esc(t('Only the settings changed from their default — together with the search when there is one.'))}">${esc(t('Changed ({n})', { n }))}</button>`;
    }

    /** fn at once, then at most once per `ms` while calls keep coming; the last call always lands. */
    function throttle(fn, ms) {
        let timer = 0, owed = false;
        const run = () => {
            if (timer) { owed = true; return; }
            fn();
            timer = setTimeout(() => { timer = 0; if (owed) { owed = false; run(); } }, ms);
        };
        return run;
    }

    /** '/' (outside a box) or Ctrl+F puts the caret in the search box. Bound ONCE, on the document. */
    function keys(doc, box) {
        if (!doc || typeof doc.addEventListener !== 'function') { return; }
        doc.addEventListener('keydown', ev => {
            const tag = String((ev.target && ev.target.tagName) || '').toUpperCase();
            const inBox = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(ev.target && ev.target.isContentEditable);
            const find = (ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && String(ev.key).toLowerCase() === 'f';
            const slash = ev.key === '/' && !inBox && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
            const el = (find || slash) && box();
            if (!el) { return; }
            ev.preventDefault();
            el.focus();
            if (el.select) { el.select(); }
        });
    }

    /** Where ArrowDown from the box goes: the first result's own control (`c-<key>`), else its first field. */
    function firstControl(doc) {
        const row = doc.querySelector('#setbody [data-item]');
        if (!row) { return null; }
        const key = String(row.dataset.item || '').replace(/^agentFarm\./, '');
        return doc.getElementById('c-' + key)
            || (row.querySelector && row.querySelector('input, select, textarea, button')) || null;
    }

    return { view, placeHtml, countHtml, emptyHtml, chipHtml, throttle, keys, firstControl };
});
