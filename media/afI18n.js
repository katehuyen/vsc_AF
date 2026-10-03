// AFI18n — the interface language (U-189).
//
// English is the source text AND the key: a page writes `t('Notices')`, and a
// catalog (media/afI18n.<id>.js) maps that English string to its translation.
// A string a catalog does not carry yet stays English, so a language is
// translated one surface at a time and is never half-blank. `{name}` in a
// string is filled from the second argument.
//
// The host resolves `agentFarm.language` (src/core/i18n.ts — `auto` follows VS
// Code's display language) and hands the page `lang` and `locale` in
// window.__AFUI__; the extension host loads this same file, so a tooltip drawn
// in Node and one drawn in a page cannot disagree. `locale()` is what dates
// and numbers are formatted with; '' means the system's own formats.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') {
        window.AFI18n = api;
        const ui = window.__AFUI__;
        if (ui && ui.lang) { api.setLanguage(ui.lang, ui.locale); }
    }
})(function () {
    'use strict';

    /** Every language the interface can be set to; English is the source. `parts`: its catalog's further files, one per surface. */
    const LANGS = [{ id: 'en', name: 'English' }, { id: 'tr', name: 'Türkçe', parts: ['needs', 'chains', 'queue', 'notices'] }];

    /** The files a language's catalog is made of — every loader (shell, host, tests) reads this one list. */
    function files(id) {
        const l = LANGS.find(x => x.id === id);
        if (!l || l.id === 'en') { return []; }
        return [`afI18n.${l.id}.js`, ...(l.parts || []).map(p => `afI18n.${l.id}.${p}.js`)];
    }
    const catalogs = {};
    let lang = 'en';
    // '' = the runtime's own locale (the system's formats), which is what `auto` keeps.
    let loc = '';

    /** The language a tag such as `tr-TR` or `en-gb` resolves to — one listed above, else English. */
    function resolve(tag) {
        const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
        return LANGS.some(l => l.id === base) ? base : 'en';
    }

    function setLanguage(tag, locale) {
        lang = resolve(tag);
        loc = locale === undefined || locale === null ? lang : String(locale);
    }

    function add(id, table) { catalogs[id] = Object.assign(catalogs[id] || {}, table || {}); }

    function t(text, vars) {
        const s = String(text == null ? '' : text);
        const table = lang === 'en' ? null : catalogs[lang];
        const out = table && Object.prototype.hasOwnProperty.call(table, s) ? table[s] : s;
        return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m)) : out;
    }

    /** A label that leads with a mark — `🔔 Notices`, `◧ Projects` — keeps the mark and translates the words;
     *  anything from the first `<` on (a count badge) is markup and passes through. */
    function label(text) {
        const s = String(text == null ? '' : text);
        const cut = s.indexOf('<');
        const head = cut < 0 ? s : s.slice(0, cut);
        const m = /^([^\p{L}\p{N}]*)([\s\S]*?)(\s*)$/u.exec(head);
        return m[1] + t(m[2]) + m[3] + (cut < 0 ? '' : s.slice(cut));
    }

    return { LANGS, files, resolve, setLanguage, add, t, label, lang: () => lang, locale: () => loc };
});
