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

    /** Whether a row passes the four switches and the 🌙 narrowing. */
    function passes(f, r) {
        return !!f[meta(of(r)).key] && (f.headless !== false || !isHeadless(r));
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

    window.AFRunCategory = { of, meta, isHeadless, passes, chips, showRow, wire, glyph };
})();
