// Agent Farm — WHICH ENGINE, said the same way everywhere.
//
// ‼️ WHY THIS IS A COMPONENT AND NOT FOUR STRINGS PER PAGE (U-26).
//
// The engine badge was invented on the Console, for Codex, in one colour, with
// one rule: "Claude is the default, so it wears nothing." Every part of that
// turned out to be wrong once there were four engines and the user had to read
// a table of sessions:
//
//   · A row with no badge is unreadable — it means "Claude" or it means "this
//     surface never learned about engines", and those look identical.
//   · One purple for every non-Claude engine answers "not the default" and not
//     "which one", which is the actual question in a list of sessions.
//   · And a colour invented per page is a colour that disagrees per page.
//
// So: every engine has a badge, every engine has ONE fixed colour, and both
// come from here. The palette is VS Code's own chart variables, so it survives
// a theme change and stays legible in light and dark (docs/CONVENTIONS.md).
(function () {
    'use strict';

    /** id → what a person calls it. `agy` is Antigravity, and NOT the `gemini`
     *  CLI next to it: two different programs, two different sign-ins. */
    const LABEL = {
        claude: 'Claude',
        codex: 'Codex',
        gemini: 'Gemini',
        agy: 'Antigravity',
        opencode: 'OpenCode'
    };

    /** ‼️ An id this build has never heard of is still drawn — as itself, in the
     *  neutral colour. An external CLI profile can put any name in a session's
     *  `source`, and dropping the badge there would hide the one fact the
     *  column exists to show. */
    const KNOWN = Object.keys(LABEL);

    function id(v) {
        const s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
        return s || 'claude';
    }

    function label(v) {
        const k = id(v);
        return LABEL[k] || String(v).trim();
    }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * ‼️ THE CLASS THAT CARRIES THE COLOUR, FOR ANYTHING THAT IS NOT A BADGE.
     *
     * The plan card's engine tabs (U-40) want the same hue the badge wears, on
     * a border and a fill rather than on text — and the moment a second surface
     * needed it, the four values were about to be copied into that page's own
     * stylesheet, which is the exact failure the header above describes. So the
     * palette publishes `--af-engc` (common.css) and this returns the class
     * that resolves it. An id this build has never heard of resolves to the
     * neutral colour rather than to no colour at all.
     */
    function cls(engine) {
        const k = id(engine);
        return 'af-engc ' + (KNOWN.indexOf(k) >= 0 ? k : 'other');
    }

    /**
     * The badge. `title` is a native tooltip and therefore FIGURES ONLY — the
     * caller passes `Label: value` lines, never a sentence (CONVENTIONS → the
     * definition is on the heading, once).
     */
    function badge(engine, title) {
        return '<span class="af-eng ' + cls(engine) + '"'
            + (title ? ' title="' + esc(title) + '"' : '')
            + '>' + esc(label(engine)) + '</span>';
    }

    window.AFEngine = { id: id, label: label, badge: badge, cls: cls, known: KNOWN };
})();
