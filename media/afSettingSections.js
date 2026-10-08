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

    window.AFSettingSections = function (ctx) {
        X = ctx;
        C = ctx.C;
        return { sectionHtml, groupsOf };
    };
})();
