// Agent Farm — WHICH SIGN-IN, AND HOW MUCH OF ITS PLAN IS LEFT. (X-263)
//
// ‼️ WHY THIS IS A COMPONENT, AND IT IS THE SAME LESSON AS afEngine.js /
// afProject.js — ONE STEP WORSE, BECAUSE THIS ONE HAD ALREADY DIVERGED.
//
// Five surfaces draw an `<option>` for the same account, and all five had
// hand-copied the same body:
//
//   media/console.js    the composer's box, and the live session's box
//   media/missions.js   the member's delegation account
//   media/tasksPage.js  the workflow step's account, and the task form's
//
// The Console's two had since grown the five-hour figure. The other three had
// not. So one account read `murvietnam-2 •` on the Tasks form and
// `murvietnam-2 • 42% used` in the Console, and the answer to the only question
// the choice actually turns on — will this run hit the wall — lived on a third
// page. Writing the figure into three more copies is how a sixth is born; an
// account is drawn HERE, once, and the pages ask.
//
// ‼️ WHAT IS DELIBERATELY *NOT* IN HERE: THE FIXED ROWS.
//
// Every one of those pickers opens with two rows that are not accounts — the
// empty "the standing choice" row and 💻 Machine Global — and each page says
// something DIFFERENT and correct in them: a mission round "spawns", a workflow
// step "fires", a console session "starts". That prose is about the SITE, not
// about the account (ONE SUBJECT), so it stays at the call site. What travels is
// the row an account gets. The two sentinels travel with it, because they were
// typed out in three files and a picker that spells the machine row differently
// is a picker the reader cannot recognise.
//
// ‼️ AND -1 IS NOT 0% (X-256). "Nobody has read this account's window" and "none
// of this account's window is used" are OPPOSITE facts, and a picker is exactly
// where they get confused, because an empty space there reads as good news. An
// unread account draws an em dash and says so in words.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFAccount = api; }
})(function () {
    'use strict';

    /** ‼️ X-223 — the machine's own sign-in, stated. The value is the sentinel
     *  the host and the core share (`src/core/accountStore.ts`), never ''. */
    const MACHINE = '@machine';
    /** …and what a picker calls it. The badge is what makes it read as a choice
     *  somebody made rather than a placeholder nobody filled in. */
    const MACHINE_ROW = '💻 Machine Global';

    /** `AFTime` on a page, the same module through `require` in a test or on the
     *  host. Resolved at CALL time so script load order cannot matter. */
    function clockOf(ts) {
        const T = (typeof window !== 'undefined' && window.AFTime) ? window.AFTime
            : (typeof require === 'function' ? require('./afTime.js') : null);
        return T ? T.clock(ts) : new Date(ts).toISOString().slice(11, 16);
    }

    /**
     * The five-hour window as the shortest true thing that can be said about it.
     *
     * ‼️ THE EM DASH IS A MEASUREMENT, NOT A BLANK. `percent` is -1 when nothing
     * has read this account (the host's own convention, `core/accountUsage.ts`),
     * and 0 when something read it and found nothing used. Drawing both as an
     * empty cell told the reader the opposite of the truth in one of the two
     * cases, and it is the dangerous one.
     */
    function figure(a) {
        const p = a && typeof a.percent === 'number' ? a.percent : -1;
        return p >= 0 ? p + '%' : '—';
    }

    /**
     * When the window turns over, in the words the Engines page already used.
     *
     * `AFTime.ago` is deliberately not used: it is written for the PAST and a
     * reset is in the future, so it would print "37m ago" about a window that
     * has not turned over yet.
     */
    function turns(a, now) {
        if (!a || !a.resetsAt) { return ''; }
        const at = typeof now === 'number' ? now : Date.now();
        const mins = Math.max(0, Math.round((a.resetsAt - at) / 60000));
        const wait = mins < 60 ? mins + 'm' : Math.round(mins / 60) + 'h';
        return 'window turns over at ' + clockOf(a.resetsAt) + ' (in ' + wait + ')';
    }

    /**
     * SHORTHAND — the row is a `<select>` line, so it carries the shortest
     * unambiguous form: a warning sign for a sign-in that has fallen over, the
     * name, the figure the choice turns on, and a dot for the standing choice.
     * The sentences go in the hover, where there is room for them.
     */
    function label(a) {
        if (!a) { return ''; }
        return (a.health === 'ready' ? '' : '⚠ ')
            + (a.label || a.id || '')
            + ' · ' + figure(a)
            + (a.active ? ' •' : '');
    }

    /**
     * MIRROR — what the narrow box cannot hold, one fact per line.
     *
     * The order is the order the reader needs it in: what is WRONG with this
     * account first (it changes the answer), then what it is, then how much of
     * it is left and until when.
     */
    function detail(a, now) {
        if (!a) { return ''; }
        const out = [];
        if (a.health !== 'ready') {
            // The host is allowed to say something more specific than we can.
            out.push(a.next
                || 'This sign-in has fallen over — capture it again before it can pay for a run.');
        }
        if (a.active) { out.push('The standing choice for this engine right now.'); }
        if (typeof a.percent === 'number' && a.percent >= 0) {
            out.push(a.percent + '% of the five-hour window used.');
            const t = turns(a, now);
            if (t) { out.push(t.charAt(0).toUpperCase() + t.slice(1) + '.'); }
        } else {
            out.push('Nobody has read this account’s window yet — which is not the'
                + ' same as none of it being used.');
        }
        return out.join('\n');
    }

    /** id, label, detail — what every picker on every page needs, and all any of
     *  them may know about how an account is drawn. */
    function row(a, now) {
        return { id: a && a.id, label: label(a), detail: detail(a, now) };
    }

    /**
     * The `<option>`s for the ACCOUNT rows — never the fixed rows above them,
     * which are the call site's own sentence (see the header).
     *
     * `C` is handed in rather than reached for as a global, so this runs in a
     * test the same way it runs on a page.
     */
    function options(rows, selected, C, now) {
        const list = rows || [];
        if (!list.length) { return ''; }
        return list.map(function (a) {
            return C.option(a.id, label(a), {
                selected: a.id === selected, detail: detail(a, now)
            });
        }).join('');
    }

    return {
        MACHINE: MACHINE, MACHINE_ROW: MACHINE_ROW,
        figure: figure, turns: turns, label: label, detail: detail,
        row: row, options: options
    };
});
