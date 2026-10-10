// Agent Farm — what the route form says beside a box before it is saved (U-243).
//
// The rules are the HOST's, handed over in `routeForm` (checks, engines, taken):
// this file words them where the mistake is and offers the fix. The host still
// refuses on save with its own sentence — a page check is a courtesy, not a gate.
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const vocab = (data) => (data && data.routeForm) || {};
    const has = (v) => !!String(v || '').trim();

    /** `OpenRouter` → `openrouter`, then `openrouter-2`… — an id no stored or retired route has. */
    function freeId(base, taken) {
        const used = new Set(taken || []);
        const stem = String(base || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '').slice(0, 36) || 'route';
        if (stem.length >= 2 && !used.has(stem)) { return stem; }
        for (let n = 2; ; n++) {
            if (!used.has(stem + '-' + n)) { return stem + '-' + n; }
        }
    }

    /** The endpoint without the /v1 Claude Code adds itself, or '' when it does not end in one. */
    function v1Fix(url, data) {
        const src = (vocab(data).checks || {}).v1;
        const u = String(url || '').trim();
        if (!src || !u) { return ''; }
        const re = new RegExp(src, 'i');
        return re.test(u) ? u.replace(re, '') : '';
    }

    /** Why OpenCode cannot be given this route as it stands, or ''. `tiers` is what the form would save. */
    function openCodeWhyNot(d, tiers) {
        if (!has(d.baseUrl) && !has(d.opencodeUrl)) {
            return t('OpenCode needs an address: fill Endpoint, or OpenCode address under Advanced.');
        }
        if (!Object.keys(tiers || {}).length) { return t('OpenCode needs at least one model: write one into a tier.'); }
        return '';
    }

    /** Why Claude Code cannot be given it, or '' — it needs the Anthropic-style endpoint. */
    function claudeWhyNot(d) {
        return has(d.opencodeUrl) && !has(d.baseUrl)
            ? t('Claude Code needs the Anthropic-style Endpoint; with only an OpenCode address this route serves OpenCode alone.')
            : '';
    }

    /** The tiers whose model could not go on a command line. */
    function badModels(tiers, data) {
        const src = (vocab(data).checks || {}).modelId;
        if (!src) { return []; }
        const re = new RegExp(src);
        return Object.keys(tiers || {}).filter(k => !re.test(String(tiers[k])));
    }

    /** A shipped shape poured into the draft: its address and key kind, and an id when none was typed. */
    function applyTemplate(d, id, data) {
        const tpl = (vocab(data).templates || []).find(x => x.id === id);
        d.template = tpl ? tpl.id : '';
        if (!tpl) { return; }
        d.providerId = tpl.id;
        d.baseUrl = tpl.baseUrl;
        d.opencodeUrl = tpl.opencodeUrl;
        d.authKind = tpl.authKind;
        if (!has(d.id) || d.id === d.autoId) {
            d.id = freeId(tpl.id, vocab(data).taken);
            d.autoId = d.id;
        }
    }

    window.AFRouteCheck = { freeId, v1Fix, openCodeWhyNot, claudeWhyNot, badModels, applyTemplate };
})();
