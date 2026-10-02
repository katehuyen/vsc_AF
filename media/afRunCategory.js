// U-191 — THE FOUR RUN CATEGORIES AS A BAR: 🧑 You · ⑂ Baton · 🤖 Auto · 🎯 Mission,
// plus the 🌙 Headless narrowing. The list itself (labels, glyphs, switch keys)
// is media/sessionsTable.js's CATEGORIES; a row's category is the host's
// verdict (`category`, src/core/chainMembership.ts runCategory), with `origin`
// as the answer for a row that predates it. Each switch owns one boolean.
(function () {
    'use strict';
    const list = () => window.AFSessionsTable.CATEGORIES;
    const glyph = () => window.AFSessionsTable.HLESS_GLYPH;
    const of = r => r.category || (r.origin === 'auto' ? 'auto' : 'user');
    const meta = id => list().find(o => o.id === id) || list()[0];
    // S-35 — 🌙 marks an automation run with no terminal; never a 🧑 row.
    const isHeadless = r => r.headless === true && of(r) !== 'user';

    // ⑂ Chains / 🎯 Missions narrow their own category; null (or a page saved before them) = every one
    const subId = { chains: r => of(r) === 'baton' && r.chainId, missions: r => of(r) === 'mission' && r.mission && r.mission.id };

    /** Whether a row passes the four switches, the 🌙 narrowing and the ⑂ / 🎯 pickers. */
    function passes(f, r) {
        const sub = Object.keys(subId).every(k => !Array.isArray(f[k]) || !subId[k](r) || f[k].indexOf(subId[k](r)) >= 0);
        return !!f[meta(of(r)).key] && (f.headless !== false || !isHeadless(r)) && sub;
    }

    /** One picker option per chain / mission among the rows, newest first, with what it holds. */
    function subOptions(rows, kind) {
        const seen = Object.create(null), out = [];
        rows.forEach(r => {
            const id = subId[kind](r);
            if (!id) { return; }
            const s = seen[id] || (seen[id] = out[out.push({ v: id, name: kind === 'missions' ? r.mission.title : id, legs: {}, n: 0, ts: 0 }) - 1]);
            s.n++; s.legs[r.chainLeg] = 1; s.ts = Math.max(s.ts, r.ts || 0);
        });
        return out.sort((a, b) => b.ts - a.ts).map(x => ({ v: x.v, t: `${x.name} · `
            + (kind === 'chains' ? `${Object.keys(x.legs).length} leg(s) · ` : '') + `${x.n} turn(s)` }));
    }

    /** The panel's ⑂ Chains and 🎯 Missions row — each narrows its category, never switches it. */
    function subRow(f, rows, noun, prefix) {
        const part = (kind, cat, every) => {
            const opts = subOptions(rows, kind);
            if (!opts.length) { return ''; }
            const o = meta(cat), sel = Array.isArray(f[kind]) ? f[kind] : null;
            const state = !sel ? every : !sel.length ? 'none selected' : `${sel.length} of ${opts.length}`;
            const label = kind[0].toUpperCase() + kind.slice(1);
            return window.AFTip.wrap(`<span class="muted small">${o.glyph} ${label}:</span>`, `${o.glyph} ${label} — ${state}`,
                `This picker narrows the ${o.label} category; it never turns another category on or off.\n\n`
                + `${opts.length} ${kind} among these ${noun}. Tick the ones eligible when the ${o.glyph} ${o.label} switch is on.`)
                + window.AFFilter.multi({ id: `${prefix}-${kind}`, label, options: opts, selected: sel, allLabel: every,
                    title: `Which ${kind} are eligible when ${o.glyph} ${o.label} is on — newest first` });
        };
        const both = part('chains', 'baton', 'every chain') + part('missions', 'mission', 'every mission');
        return both ? `<div class="af-frow">${both}</div>` : '';
    }

    /** The four switches — glyph only on a bar, glyph + name in a panel. */
    function chips(f, rows, named, noun) {
        return list().map(o => {
            const n = rows.filter(r => of(r) === o.id).length;
            return window.AFTip.wrap(
                `<button class="chip af-cat-${o.id}${f[o.key] ? ' on' : ''}" aria-pressed="${!!f[o.key]}" aria-label="Show ${o.label} ${noun}">${o.glyph}${named ? ' ' + o.label : ''}</button>`,
                `${o.glyph} ${o.label} — ${f[o.key] ? 'ON: listed' : 'OFF: hidden'}`,
                `${noun[0].toUpperCase() + noun.slice(1)}: ${n} of ${rows.length}\n\n${o.tip}. Press to turn only this category ${f[o.key] ? 'off' : 'on'}; the others keep their state.`);
        }).join('');
    }

    /** The panel's Show row: the four named switches and the 🌙 chip. */
    function showRow(f, rows, noun) {
        const hl = glyph();
        const on = f.headless !== false;
        return window.AFTip.wrap('<span class="muted small">Show:</span>', 'Visible categories',
            `The same four switches as the bar above and the Sessions table: who or what opened the session. ${hl} Headless then narrows the automation categories without changing these switches.`)
            + chips(f, rows, true, noun)
            + window.AFTip.wrap(
                `<button class="chip af-fhless${on ? ' on' : ''}" aria-pressed="${on}">${hl} Headless</button>`,
                `${hl} Headless — ${on ? 'ON: headless runs are listed' : 'OFF: headless runs are hidden'}`,
                'A headless run is automation with no terminal behind it — started by a schedule, a trigger, a task or a mission, with nobody at the keyboard.\n\n'
                + `Press to drop its ${noun} from whichever automation categories are on. It changes no category switch and nothing under 🧑 You.`);
    }

    /** Every switch in `root` toggles its own boolean; `done` saves and redraws. */
    function wire(root, f, done) {
        list().forEach(o => root.querySelectorAll(`.af-cat-${o.id}`).forEach(el =>
            el.addEventListener('click', () => { f[o.key] = !f[o.key]; done(); })));
        root.querySelectorAll('.af-fhless').forEach(el =>
            el.addEventListener('click', () => { f.headless = f.headless === false; done(); }));
    }

    /** The bar's Engines picker: the Filters box's own selection, usable with the panel shut. */
    function engineBar(id, names, selected, noun) {
        return names.length > 1 ? window.AFFilter.multi({
            id, label: 'Engines', options: names, selected,
            title: `Which engines' ${noun} to list — the same selection as the Engines box in Filters, here so it works with the panel shut`
        }) : '';
    }

    window.AFRunCategory = { of, meta, isHeadless, passes, subOptions, subRow, chips, showRow, wire, glyph, engineBar };
})();
