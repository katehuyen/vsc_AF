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

    /**
     * ‼️ U-59 — THE ROLL CALL, SAID ONCE, FOR THE HEADINGS THAT LIST THEM.
     *
     * Two column definitions spelt the engines out by hand — "Which CLI ran the
     * session: Claude · Codex · Gemini · Antigravity" — and a fifth engine
     * shipped end to end without either sentence noticing, because a list of
     * names typed into a tooltip is a list nobody goes back to. A heading that
     * has to enumerate them asks here; the answer grows with LABEL.
     *
     * `last` is the word before the final name ("or", "and") for a heading
     * written as a sentence rather than as a dotted list.
     */
    function names(sep, last) {
        const all = KNOWN.map(function (k) { return LABEL[k]; });
        if (!last || all.length < 2) { return all.join(sep || ' · '); }
        return all.slice(0, -1).join(sep || ', ') + ' ' + last + ' ' + all[all.length - 1];
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

    /**
     * ‼️ U-59 — HOW THIS ENGINE IS PAID FOR, IN TWO WORDS, DECIDED ONCE.
     *
     * The Engines page and Farm Settings both draw this and each had written its
     * own version, so the rule lived in two files that were free to disagree —
     * and did, the moment a fifth state arrived. `mode: 'builtin'` means the
     * engine asks for no credential at all; read by a copy that had never heard
     * of it, that fell through to `not signed in` IN THE WARNING COLOUR, on a
     * row whose very next line said the engine was ready.
     *
     * ‼️ `builtin` and `none` are opposite answers and must never share a badge:
     * one is "nothing to do", the other is "nothing works yet".
     *
     * Takes the whole status row rather than a mode, because "not installed"
     * outranks every payment question — an engine that is not here is not paid
     * for in any way.
     */
    function authBadge(e) {
        const cliFound = !!(e && e.cli && e.cli.found);
        const mode = String((e && e.auth && e.auth.mode) || '').trim();
        if (!cliFound) { return { tone: 'off', text: 'not installed' }; }
        if (mode === 'subscription') { return { tone: 'ok', text: 'on a plan' }; }
        if (mode === 'apikey') { return { tone: 'ok', text: 'on a key' }; }
        if (mode === 'builtin') { return { tone: 'ok', text: 'no sign-in needed' }; }
        return { tone: 'warn', text: 'not signed in' };
    }

    window.AFEngine = {
        id: id, label: label, names: names, badge: badge, cls: cls,
        known: KNOWN, authBadge: authBadge
    };
})();
