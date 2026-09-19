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
    function timeApi() {
        return (typeof window !== 'undefined' && window.AFTime) ? window.AFTime
            : (typeof require === 'function' ? require('./afTime.js') : null);
    }

    function clockOf(ts) {
        const T = timeApi();
        return T ? T.clock(ts) : new Date(ts).toISOString().slice(11, 16);
    }

    /**
     * ‼️ X-215 round 2 — A TURNOVER THAT IS NOT TODAY IS NOT A TIME OF DAY.
     *
     * Every reset on this page was printed as `02:17`, which is right for a
     * five-hour window and a half-truth for a weekly one: a week that turns over
     * next Saturday at 02:00 read as "02:17" and the reader had no way to see
     * the days. The card carries both windows now, so the ambiguity would have
     * been sitting on one line next to its own counter-example.
     */
    function whenOf(ts, now) {
        const T = timeApi();
        const at = typeof now === 'number' ? now : Date.now();
        const sameDay = new Date(ts).toDateString() === new Date(at).toDateString();
        if (sameDay || !T) { return clockOf(ts); }
        return T.stamp(ts);
    }

    /**
     * ‼️ X-215 round 2 — HOW MUCH IS LEFT, IN THE UNIT THAT WINDOW DESERVES,
     * and COMPLETE rather than rounded to one figure.
     *
     * The five-hour window is read in minutes and the week in days, and the old
     * single-unit rounding printed `2h` for both — which loses the minutes a
     * session is actually decided on, and says nothing about days at all. The
     * unit is taken from the REMAINDER rather than from the window's name, so
     * an engine whose windows are neither five hours nor a week gets a true
     * answer without this page knowing anything about it.
     */
    function leftOf(ms) {
        if (!(ms > 0)) { return ''; }
        const mins = Math.floor(ms / 60000);
        if (mins < 60) { return Math.max(1, mins) + 'm'; }
        const hours = Math.floor(mins / 60);
        if (hours < 24) {
            const m = mins % 60;
            return m ? hours + 'h ' + m + 'm' : hours + 'h';
        }
        const days = Math.floor(hours / 24);
        const h = hours % 24;
        return h ? days + 'd ' + h + 'h' : days + 'd';
    }

    /**
     * ONE WINDOW'S FULL SENTENCE, the shortest form that is still complete:
     * what is left, and when it turns over. Both facts, because "37m left" with
     * no clock cannot be checked against anything and "18:19" alone makes the
     * reader do the subtraction.
     */
    function barTurns(b, now) {
        if (!b || !b.resetsAt) { return ''; }
        const at = typeof now === 'number' ? now : Date.now();
        const left = b.resetsAt - at;
        // ‼️ A TURNOVER IN THE PAST IS NOT "0m LEFT" — audit B-04.1, and the
        // same trap as `turns` below: the figure beside it belongs to the OLD
        // window, and a row that hides that dresses a stale reading as a fresh
        // one.
        if (left <= 0) { return 'turned over ' + whenOf(b.resetsAt, at) + ', figure is older'; }
        return leftOf(left) + ' left (' + whenOf(b.resetsAt, at) + ')';
    }

    /** …the same sentence with the window's short name in front, for the one
     *  line that has to carry every window at once. */
    function barLine(b, now) {
        const t = barTurns(b, now);
        return t ? (b.short ? b.short + ': ' : '') + t : '';
    }

    /**
     * The five-hour window as the shortest true thing that can be said about it.
     *
     * ‼️ THE EM DASH IS A MEASUREMENT, NOT A BLANK. `percent` is -1 when nothing
     * has read this account (the host's own convention, `core/accountUsage.ts`),
     * and 0 when something read it and found nothing used. Drawing both as an
     * empty cell told the reader the opposite of the truth in one of the two
     * cases, and it is the dangerous one.
     *
     * ‼️ X-326 Option A — EXPLICIT DUAL-WINDOW FORMATTING:
     * When both five-hour and weekly percentages are reported (e.g. Claude Code),
     * print `5h: X% / wk: Y%` so that a weekly limit (e.g. 40%) is never confused
     * with a five-hour window limit (e.g. 0%).
     */
    /**
     * ‼️ X-215 round 2 — THE WINDOWS A READING CARRIES, AS A LIST.
     *
     * X-326 read `fivePercent` / `weekPercent`, which named Claude's two
     * windows in this page's own spelling; an engine with different ones (and
     * Codex has two of its own) could not be drawn by it at all. The host sends
     * the list and each entry names itself — nothing here decides how many
     * windows an account has or what they are called.
     */
    function barsOf(a) {
        return (a && Array.isArray(a.bars) ? a.bars : [])
            .filter(b => b && typeof b.percent === 'number' && b.percent >= 0);
    }

    function figure(a) {
        if (!a) { return '—'; }
        const bars = barsOf(a);
        if (bars.length) {
            return bars.map(b => (b.short ? b.short + ': ' : '') + b.percent + '%').join(' / ');
        }
        const p = typeof a.percent === 'number' ? a.percent : -1;
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
        const left = a.resetsAt - at;
        /**
         * ‼️ A TURNOVER IN THE PAST IS NOT "IN 0m" — audit B-04.1.
         *
         * The wait used to be `Math.max(0, …)`, which kept a negative from
         * being printed and printed "about to happen" instead. `resetsAt` comes
         * off a READING of the account's usage file, so an account nobody has
         * run on for hours carries a turnover that has already been and gone —
         * and the row then said "window turns over at 02:17 (in 0m)" for ever.
         * Measured on dist/render/enginespanel.s2.png: two cards in one
         * picture, 02:17 and 05:40, both "(in 0m)". They cannot both be right,
         * and the reader can see it.
         *
         * The percentage beside it is the reason this matters rather than being
         * a wording nit: it is what an account rotation is decided on, and once
         * the window has turned over that figure belongs to the OLD window. The
         * row says so instead of dressing a stale reading as a fresh one.
         */
        if (left <= 0) {
            return 'window turned over at ' + clockOf(a.resetsAt)
                + ' — the figure beside it was read before that';
        }
        const mins = Math.round(left / 60000);
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
     * ‼️ audit B-04.3 — THE WINDOW'S NAME, INSIDE A SENTENCE.
     *
     * The name itself is not decided here and never was decided twice: the
     * READING names its own window and the host fills the silence once
     * (`windowNameOf`, src/core/accountUsage.ts), so a row arrives already
     * carrying `five-hour window`, `Current week` or `usage window`. What is
     * left is typography — a reading names its window as a HEADING, and a
     * heading dropped mid-sentence reads as a proper noun ("72% of the Current
     * week used").
     *
     * This line said `five-hour window` unconditionally, which made the picker's
     * own panel contradict the Engines card three inches above it: the card read
     * "Current week 72%" and the panel "72% of the five-hour window used".
     */
    function windowPhrase(a) {
        const n = String((a && a.window) || '');
        return n ? n.charAt(0).toLowerCase() + n.slice(1) : '';
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
        const bars = barsOf(a);
        if (bars.length) {
            // ‼️ X-215 round 2 — ONE LINE PER WINDOW, each naming itself, each
            // complete: how much is gone, how much is left, and when it turns
            // over. The reading decides how many there are; this does not.
            for (const b of bars) {
                const t = barTurns(b, now);
                out.push(b.window + ': ' + b.percent + '% used, ' + Math.max(0, 100 - b.percent) + '% left'
                    + (t ? ' — ' + t : '') + '.');
            }
        } else if (typeof a.percent === 'number' && a.percent >= 0) {
            const w = windowPhrase(a);
            out.push(a.percent + '% of the ' + (w || 'window') + ' used.');
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
     * ‼️ X-305 — THE TWO GROUPS, AND WHY A RULE IS NOT JUST ANOTHER ROW.
     *
     * A slot is an answer that was true when it was picked; a RULE is re-decided
     * at every launch. Those are different kinds of choice and a flat list makes
     * them look like the same one — so every picker draws them as two groups,
     * with the rules FIRST because a standing choice is usually what somebody
     * reaching for this box wants.
     *
     * The headings are here rather than at the call sites for the same reason
     * the row body is: three pages spelling a group differently is three pages
     * the reader has to learn separately.
     */
    const POLICY_GROUP = 'Smart policies — decided at each launch';
    const ACCOUNT_GROUP = 'Fixed accounts — this one, every time';

    /**
     * SHORTHAND — the rule, then what it comes to RIGHT NOW. `@emptiest` alone
     * tells the reader nothing about which plan is about to be spent, and the
     * resolved slot alone hides that the answer will move next time.
     *
     * ‼️ A RULE THAT CANNOT CHOOSE IS STILL OFFERED. "Right now" is not "at
     * launch": every sign-in being walled at 11:02 says nothing about 14:50,
     * when the first window turns over. Hiding it would remove the only control
     * that survives the wall. It SAYS so instead, here and in the panel.
     */
    function policyLabel(p) {
        if (!p) { return ''; }
        const id = p.id || '';
        if (p.refusal) { return id + ' · nothing to pick right now'; }
        return id + (p.picks ? ' → ' + p.picks : '');
    }

    /**
     * MIRROR — the control's CURRENT value first, then what the rule means.
     *
     * The first line is the host's own sentence about this moment (which slot
     * won and on what figure, or why none could): the rule's description is the
     * standing explanation and belongs under it, never over it.
     */
    function policyDetail(p) {
        if (!p) { return ''; }
        return [p.refusal || p.note || '', p.detail || '']
            .map(function (x) { return String(x).trim(); }).filter(Boolean).join('\n\n');
    }

    /** id, label, detail for a RULE — the twin of `row`, so a page asks once. */
    function policyRowOf(p) {
        return { id: p && p.id, label: policyLabel(p), detail: policyDetail(p) };
    }

    /**
     * The `<option>`s for both kinds at once, each under its own heading — the
     * whole of X-305's page half. A picker with no rules to offer draws no
     * heading at all rather than an empty group, so nothing changes on a machine
     * that has never written one.
     */
    function grouped(policies, accounts, selected, C, now) {
        const pol = policies || [];
        const acc = accounts || [];
        // Nothing to group by: the flat list is still the right drawing.
        if (!pol.length) { return options(acc, selected, C, now); }
        const inner = pol.map(function (p) {
            return C.option(p.id, policyLabel(p), {
                selected: p.id === selected, detail: policyDetail(p)
            });
        }).join('');
        return '<optgroup label="' + C.esc(POLICY_GROUP) + '">' + inner + '</optgroup>'
            + (acc.length
                ? '<optgroup label="' + C.esc(ACCOUNT_GROUP) + '">'
                    + options(acc, selected, C, now) + '</optgroup>'
                : '');
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
        // X-215 round 2 — the window list and its wording, so the card that
        // DRAWS the bars and the pickers that only name them share one reader.
        bars: barsOf, barTurns: barTurns, barLine: barLine, left: leftOf, when: whenOf,
        windowPhrase: windowPhrase,
        row: row, options: options,
        POLICY_GROUP: POLICY_GROUP, ACCOUNT_GROUP: ACCOUNT_GROUP,
        policyLabel: policyLabel, policyDetail: policyDetail,
        policyRow: policyRowOf, grouped: grouped
    };
});
