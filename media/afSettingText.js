// Agent Farm — Farm Settings: a setting's description as a person reads it (U-227).
// A package.json description may carry **bold**, `code` and #agentFarm.key# (another setting, by key);
// drawn as typed they read as noise. plain() takes the marks out and names the other setting the way
// the page does; the row, the search hits and the description panel all draw that one text.
(function (factory) {
    'use strict'; // i18n-exempt
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFSettingText = api; }
})(function () {
    'use strict'; // i18n-exempt
    const REF = /#(agentFarm\.[\w.]+)#/g;
    const t = (s, v) => (typeof window !== 'undefined' && window.AFI18n ? window.AFI18n.t(s, v)
        : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

    /** `text` without markdown marks; nameOf(key) → the name a person knows that setting by. */
    function plain(text, nameOf) {
        return String(text == null ? '' : text)
            .replace(REF, (m, key) => '"' + ((nameOf && nameOf(key)) || key) + '"')
            .replace(/\*\*([^*\n]+)\*\*/g, '$1')
            // a code span is one backtick each side; a ``` fence the text tells the reader to type is left whole
            .replace(/(^|[^`])`([^`\n]+)`(?!`)/g, '$1$2');
    }

    /** plain() with another setting named by its label among `items` (the page's rows); a key none has stays a key. */
    function plainIn(text, items) {
        return plain(text, key => ((items || []).find(x => x.key === key) || {}).label);
    }

    /** A plain text's sentences, in order. */
    function sentences(text) {
        return String(text || '').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    }

    /** The first sentence of a plain text — what a row says when the catalog has no summary for it yet. */
    function firstSentence(text) {
        return sentences(text)[0] || '';
    }

    const CLIP = 80;
    const clip = s => (s.length > CLIP ? s.slice(0, CLIP) + '…' : s);

    /** A number in its unit, the way the row's box shows it: 300 s, 85%, $5. */
    function withUnit(n, unit) {
        if (!unit) { return String(n); }
        if (unit === '%') { return n + '%'; }
        if (unit === '$') { return '$' + n; }
        return n + ' ' + unit;
    }

    /** A value as one short line a person reads — never the empty string, never a raw JSON string's quotes. */
    function valueText(v, unit, zeroMeans) {
        if (v === undefined || v === null || v === '') { return t('not set'); }
        if (typeof v === 'boolean' || (v === 0 && zeroMeans === 'off')) { return v ? t('on') : t('off'); }
        if (typeof v === 'number') { return withUnit(v, unit); }
        if (typeof v === 'string') { return clip(v.replace(/\s*\n\s*/g, ' ↵ ')); }
        let s;
        try { s = JSON.stringify(v); } catch (e) { s = String(v); }
        return clip(s);
    }

    /**
     * The description panel's lines (MIRROR): what the setting holds now and its default, a gap, the
     * description, a gap, its key — and that a change takes a reload, when the model says so. `gap` is
     * AFTip.GAP; the caller joins with AFTip.lines, which drops the empty ones.
     */
    function panelLines(it, nameOf, gap) {
        const now = valueText(it.value, it.unit, it.zeroMeans);
        const desc = plain(it.description || '', nameOf).trim();
        return [
            it.modified ? t('Now: {now} · Default: {def}', { now, def: valueText(it.default, it.unit, it.zeroMeans) })
                : t('Now: {now} (the default)', { now }),
            gap,
            desc,
            desc ? gap : '',
            it.reloadRequired ? t('Key: {key} · Needs reload', { key: it.key }) : t('Key: {key}', { key: it.key })
        ];
    }

    return { plain, plainIn, sentences, firstSentence, valueText, withUnit, panelLines };
});
