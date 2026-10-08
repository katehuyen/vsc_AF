// Agent Farm — THE SETTINGS SEARCH (U-224). One ranker for the Settings page and for
// `settings.list q`, loaded by both sides the way media/afQuery.js is (src/core/settingSearch.ts).
//
// Whether a setting is IN is AFQuery's decision, grammar and all (`-word`, `a OR b`, quotes).
// The ORDER is this file's: a hit is worth what the field it lands in is worth — the name
// most, the long description least — and a whole-word hit is worth five times a part of a
// word, which also sends every row that only has partial hits ('ses' in 'sessions', 'port'
// in 'report') after every row that has a whole one.
(function (factory) {
    'use strict'; // i18n-exempt
    const node = typeof module !== 'undefined' && module.exports;
    const api = factory(node ? require('./afQuery.js') : null);
    if (node) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFSettingSearch = api; }
})(function (Q) {
    'use strict'; // i18n-exempt
    const query = () => Q || window.AFQuery;

    /** What a hit in each field is worth. */
    const WEIGHTS = { name: 10, terms: 6, key: 5, summary: 4, place: 3, options: 2, description: 1 };
    const FIELDS = Object.keys(WEIGHTS);
    /** A hit on part of a word, against a whole word. */
    const INSIDE = 0.2;

    /** 'agentFarm.alerts.stuckThresholdSeconds' → 'Stuck threshold seconds' — the name a key implies. */
    function humanize(key) {
        const last = String(key || '').split('.').pop() || '';
        const s = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
        return s ? s[0].toUpperCase() + s.slice(1) : '';
    }

    /**
     * A setting as the ranker reads it. `it`: { key, label?, summary?, description?, enum?, enumLabels?, place?, terms? }.
     * `terms` — the words a person types for a setting whose key and text say neither — are the catalog's
     * (src/core/settingsCatalog/), carried on the row, so every surface searches one table.
     */
    function docOf(it) {
        const key = String(it.key || '');
        const split = key.replace(/^agentFarm\./, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ');
        return {
            name: String(it.label || humanize(key)),
            terms: String(it.terms || ''),
            key: split + ' ' + key,
            summary: String(it.summary || ''),
            place: String(it.place || ''),
            options: [].concat(it.enum || [], it.enumLabels || []).map(String).join(' '),
            description: String(it.description || '')
        };
    }

    // ‼️ A WHOLE word is a full hit; any part of one ('ses' in 'sessions') is a partial hit,
    // whichever end it sits at. camelCase keys are split first, so 'port' is whole in livePort.
    const WORD = /[\p{L}\p{N}_]/u;
    const whole = (text, i, n) => (i === 0 || !WORD.test(text[i - 1])) && (i + n >= text.length || !WORD.test(text[i + n]));

    /** Each positive term's best hit, summed; `start` when any hit is a whole word. */
    function scoreOf(doc, globals) {
        let score = 0, start = false;
        for (const g of globals) {
            let best = 0;
            for (const f of FIELDS) {
                const text = doc[f];
                if (!text) { continue; }
                g.lastIndex = 0;
                let m;
                while ((m = g.exec(text))) {
                    if (!m[0]) { g.lastIndex++; continue; }
                    const open = whole(text, m.index, m[0].length);
                    best = Math.max(best, WEIGHTS[f] * (open ? 1 : INSIDE));
                    if (open) { start = true; break; }
                }
            }
            score += best;
        }
        return { score, start };
    }

    const globalOf = re => new RegExp(re.source, re.flags.replace('g', '') + 'g');
    const textOf = doc => FIELDS.map(f => doc[f]).join('\n');

    /**
     * rank(items, q, opts) → [{ item, score, start, index }], best first; the page's own order
     * breaks a tie. An empty query keeps every item in order; one that does not parse keeps none
     * and says why on `rank.error`.
     */
    function rank(items, q, opts) {
        const c = query().compile(q, opts);
        const list = Array.isArray(items) ? items : [];
        if (c.empty) { return list.map((item, index) => ({ item, score: 0, start: true, index })); }
        if (!c.ok) { return Object.assign([], { error: c.error }); }
        const globals = c.terms.map(globalOf);
        const out = [];
        list.forEach((item, index) => {
            const doc = docOf(item);
            if (!c.test(textOf(doc))) { return; }
            out.push(Object.assign({ item, index }, scoreOf(doc, globals)));
        });
        return out.sort((a, b) => (Number(b.start) - Number(a.start)) || (b.score - a.score) || (a.index - b.index));
    }

    /** match(q, opts) → item => is it in? The same decision rank() makes, compiled once for a list. */
    function match(q, opts) {
        const c = query().compile(q, opts);
        return item => c.test(textOf(docOf(item)));
    }

    /** `text` with every positive hit of `q` in <mark>, escaped by `esc` — what a result shows. */
    function mark(text, q, esc) {
        const s = String(text == null ? '' : text);
        const c = query().compile(q);
        if (c.empty || !c.ok || !s) { return esc(s); }
        const spans = [];
        for (const g of c.terms.map(globalOf)) {
            g.lastIndex = 0;
            let m;
            while ((m = g.exec(s))) {
                if (!m[0]) { g.lastIndex++; continue; }
                spans.push([m.index, m.index + m[0].length]);
            }
        }
        spans.sort((a, b) => a[0] - b[0]);
        let out = '', at = 0;
        for (const [from, to] of spans) {
            if (to <= at) { continue; }
            const a = Math.max(from, at);
            out += esc(s.slice(at, a)) + '<mark>' + esc(s.slice(a, to)) + '</mark>';
            at = to;
        }
        return out + esc(s.slice(at));
    }

    return { rank, match, mark, docOf, humanize, WEIGHTS, INSIDE };
});
