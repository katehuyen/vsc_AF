// Agent Farm — Farm Settings: one section drawn as its groups (U-226).
// Which sections there are, which group each row is in and in what order are the catalog's
// (src/core/settingsCatalog/), carried on the model; this part only draws them, and hands a group
// that has a card of its own to the part that draws that card. The page hands its state in once, as X.
(function () {
    'use strict';
    let X, C;

    /**
     * A section's groups, each with its rows. A group comes where its first row does: with no query that is
     * the catalog's order, and under a query (the rows arrive best first) the group holding the best result
     * leads — a search is a result list, and its order is the ranker's. A row whose group the section does
     * not list is drawn under More rather than hidden; a model with no groups at all is one run of rows.
     */
    function groupsOf(c) {
        const items = (c && c.items) || [];
        const named = (c && c.groups) || [];
        if (!named.length) { return items.length ? [{ id: '', label: '', about: '', items }] : []; }
        const out = named.map(g => Object.assign({}, g, { items: items.filter(it => it.group === g.id) }));
        const known = new Set(named.map(g => g.id));
        const left = items.filter(it => !known.has(it.group));
        if (left.length) {
            const more = out.find(g => g.id === 'more');
            if (more) { more.items = more.items.concat(left); }
            else { out.push({ id: 'more', label: 'More', about: '', items: left }); }
        }
        const first = g => items.indexOf(g.items[0]);
        return out.filter(g => g.items.length).sort((a, b) => first(a) - first(b));
    }

    const rows = g => g.items.map(X.itemHtml).join('');

    /** Groups drawn by a card of their own, by section/group — each card is given the group's rows. */
    const CARD = {
        'general/prompts': g => X.promptsSection(g),
        'agents/superpowers': g => X.superpowersSection(g),
        // the preference editor IS these two settings: it replaces their rows rather than sitting beside them
        'sessions/flex': () => window.AFFlexSettings.html(X.DATA.flex, C, X.errors.flex),
        'notify/sound': g => X.alertsSection(g),
        // U-154 — the three looks are one question, so the group shows them on a sample line
        'monitor/quotaFigures': g => `<div class="afq-sample">5h: <span class="afq-pct">42%</span> used · <span class="afq-left">2h 13m</span> left · resets <span class="afq-reset">09:40</span></div>`
            + rows(g),
        'knowledge/wiki': g => X.wikiSection(g),
        'remote/telegram': g => X.accessSection(g)
    };

    /** What a section opens with, above its groups. */
    const LEAD = {
        sentry: () => X.pathVarLegend(),
        gatekeeper: () => (window.AFKapici ? window.AFKapici.section(X.DATA.kapici, C) : '')
    };

    // a group's about may stress a word with **…** (U-161: the number and the box were read as one switch); escaped first
    const aboutHtml = s => C.esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

    function sectionHtml(c) {
        const lead = LEAD[c.id] ? LEAD[c.id]() : '';
        return lead + groupsOf(c).map(g => {
            const draw = CARD[c.id + '/' + g.id];
            const inner = draw ? draw(g) : rows(g);
            if (!g.id) { return inner; }
            return `<div class="setgroup" id="grp-${C.esc(c.id)}-${C.esc(g.id)}">
                <h3 class="setgrouph">${C.esc(g.label)}</h3>
                ${g.about ? `<div class="setgroupwhy">${aboutHtml(g.about)}</div>` : ''}
                ${inner}
            </div>`;
        }).join('');
    }

    /** U-228 — a group a card draws is drawn whole: "Show n more" never splits a card. */
    const hasCard = (sec, group) => !!CARD[sec + '/' + group];

    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const STATE_WORD = { ok: N_('Ready'), warn: N_('Needs a look'), off: N_('Off') };
    function N_(s) { return s; }

    /**
     * U-233 — every special block is one card: a state dot (ok · warn · off), its name, one sentence saying where
     * it stands, its primary actions on the same line; the long explanation is on the name's AFTip and anything
     * long (a list, a matrix, extra boxes) waits behind Details. `id` stays the block's old anchor.
     */
    function cardHtml(o) {
        const st = STATE_WORD[o.state] ? o.state : 'off';
        const word = t(STATE_WORD[st]);
        const name = `<span class="setcardt">${o.icon ? C.esc(o.icon) + ' ' : ''}${C.esc(o.title)}</span>`;
        return `<div class="setcard" id="${C.esc(o.id)}" data-state="${st}">
            <div class="setcardh"><span class="setcardst st-${st}" role="img" aria-label="${C.esc(word)}"></span>${o.tip
                ? window.AFTip.wrap(name, `${o.title} — ${word}`, o.tip, 'tip-free') : name}
                <span class="setcardsum">${C.esc(o.status || '')}</span>
                ${o.actions ? `<span class="setcardact">${o.actions}</span>` : ''}
            </div>
            ${o.details ? `<details class="setcarddet" data-card="${C.esc(o.id)}" data-dflt="${o.open ? 1 : 0}"${detailsOpen(o.id, !!o.open) ? ' open' : ''}><summary>${C.esc(t('Details'))}</summary>${o.details}</details>` : ''}
        </div>`;
    }

    // Details stays as the hand left it, across redraws (a pick inside it redraws the page) and reopenings, until the
    // card's own default changes (a warning appears). A '*' entry stands for every card.
    function stored() {
        try { return (X.vscode.getState && X.vscode.getState()) || {}; } catch (e) { return {}; }
    }
    function detailsOpen(id, dflt) {
        const h = stored().cards || {};
        const r = h[id] || h['*'];
        return r && (r.dflt === undefined || r.dflt === dflt) ? !!r.open : dflt;
    }
    function wireCards() {
        document.querySelectorAll('[data-card]').forEach(d => d.addEventListener('toggle', () => {
            const st = stored();
            const cards = Object.assign({}, st.cards, { [d.dataset.card]: { open: !!d.open, dflt: d.dataset.dflt === '1' } });
            try { X.vscode.setState(Object.assign({}, st, { cards })); } catch (e) { /* no state */ }
        }));
    }

    window.AFSettingSections = function (ctx) {
        X = ctx;
        C = ctx.C;
        return { sectionHtml, groupsOf, hasCard, cardHtml, wireCards };
    };
})();
