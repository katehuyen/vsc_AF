// Agent Farm — THE CLOCK. Every time this extension prints, printed one way.
//
// ‼️ WHY A TIME OF DAY ON ITS OWN IS NOT AN ANSWER. Everything here is a record
// of when a machine did something, and the machine's answers travel: a session
// transcript, a plan-quota window, an API rate limit and a scheduled run are all
// stated in UTC by whoever produced them, while the page prints them in whatever
// zone this computer happens to be set to. So `14:32` is only a fact if you also
// know which offset it was rendered in — and nothing on screen said. Comparing a
// run against a provider's own log then meant doing the arithmetic in your head,
// which is exactly the sort of small tax that makes people stop checking.
//
// The rule, extension-wide:
//   • EVERY clock carries UTC in its HOVER. No exception, including a bare
//     `14:32` in a dense table cell — `tip()` is what a title gets.
//   • A clock printed with ROOM AROUND IT carries UTC inline, in parentheses:
//     detail lines, card footers, status-bar hovers, session headers.
//   • A clock in a TABLE CELL stays bare. Widening every date column by eleven
//     characters to repeat something the hover already says would cost the
//     columns that carry the actual measurements.
//
// Loaded by both sides, like media/afQuery.js: the pages run in a webview and
// the trees, status bar and panels run in the extension host, and one of them
// formatting a minute differently from the other is the kind of disagreement
// nobody notices until it matters.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFTime = api; }
})(function () {
    'use strict';

    /** Anything a caller might hold a moment in. Invalid gives null, and every
     *  entry point below answers '' for it — a missing timestamp must print
     *  nothing, never `Invalid Date` or `1 Jan 1970`. */
    function at(ts) {
        if (ts === null || ts === undefined || ts === '') { return null; }
        if (ts instanceof Date) { return isNaN(ts.getTime()) ? null : ts; }
        // ‼️ A STRING OF DIGITS IS AN EPOCH, NOT A DATE STRING. `new Date` parses
        // a string as a date expression, so "1786223647000" comes back Invalid
        // Date — and a timestamp that made one round trip through JSON as a
        // string would have printed nothing at all, on a row that has a time.
        const raw = typeof ts === 'string' && /^-?\d+$/.test(ts.trim()) ? Number(ts) : ts;
        const d = new Date(typeof raw === 'string' ? raw : Number(raw));
        return isNaN(d.getTime()) ? null : d;
    }

    const p2 = (n) => (n < 10 ? '0' : '') + n;

    /** U-189 — the locale of the interface language (media/afI18n.js; in Node the same file). */
    function loc() {
        const i18n = typeof window !== 'undefined' ? window.AFI18n
            : (typeof require === 'function' ? require('./afI18n.js') : null);
        return (i18n && i18n.locale()) || undefined;
    }

    /** `UTC+03:00` — this machine's offset at THAT moment, not today's. The
     *  distinction is the point: a session from before a DST change was not
     *  recorded in the offset we are in now. */
    function offset(ts) {
        const d = at(ts);
        if (!d) { return ''; }
        const mins = -d.getTimezoneOffset();
        const sign = mins < 0 ? '-' : '+';
        const abs = Math.abs(mins);
        return 'UTC' + sign + p2(Math.floor(abs / 60)) + ':' + p2(abs % 60);
    }

    /** `17:14` in UTC. `seconds:true` for the surfaces that show them. */
    function utcClock(ts, opts) {
        const d = at(ts);
        if (!d) { return ''; }
        const s = p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
        return opts && opts.seconds ? s + ':' + p2(d.getUTCSeconds()) : s;
    }

    /** The local time of day, in the user's own formatting — `20:14`. This is
     *  what replaces a bare `toLocaleTimeString()`; pair it with `tip()`. */
    function clock(ts, opts) {
        const d = at(ts);
        if (!d) { return ''; }
        return opts && opts.seconds
            ? d.toLocaleTimeString(loc())
            : d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
    }

    /** `17:14 UTC` — the parenthesised half, without the parentheses. */
    function utc(ts, opts) {
        const s = utcClock(ts, opts);
        return s ? s + ' UTC' : '';
    }

    /** `20:14 (17:14 UTC)` — a clock with room around it. */
    function clockUtc(ts, opts) {
        const l = clock(ts, opts);
        return l ? l + ' (' + utc(ts, opts) + ')' : '';
    }

    /** `8 Aug 2026, 20:14` — a date and a time, local, no UTC. */
    function stamp(ts, opts) {
        const d = at(ts);
        if (!d) { return ''; }
        return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })
            + ', ' + clock(ts, opts);
    }

    /** `8 Aug 2026, 20:14 (17:14 UTC)` — the full inline form. */
    function full(ts, opts) {
        const s = stamp(ts, opts);
        return s ? s + ' (' + utc(ts, opts) + ')' : '';
    }

    /**
     * What a `title` gets, for EVERY clock on every surface.
     *
     * Three lines, because a hover is the one place with room and the three
     * facts are asked in this order: which moment, what that is in UTC, and
     * which offset this machine rendered it in — the last so a reader can tell
     * whether a difference is a real one or their own clock.
     * `label` prefixes it with what the time IS ("Started", "Last checked"),
     * since a hover with no subject makes the reader guess which of the row's
     * three dates they are looking at.
     */
    function tip(ts, label) {
        const d = at(ts);
        if (!d) { return label ? String(label) : ''; }
        const head = label ? String(label).trim() + ': ' : '';
        return head + stamp(ts, { seconds: true })
            + '\n' + utc(ts, { seconds: true })
            + '\n' + offset(ts) + ' on this machine';
    }

    /** `3d ago` / `4h ago` / `12m ago` / `just now` — several pages had their
     *  own copy of this, each rounding differently. */
    function ago(ts) {
        const d = at(ts);
        if (!d) { return ''; }
        const m = Math.round((Date.now() - d.getTime()) / 60000);
        if (m < 1) { return 'just now'; }
        if (m < 60) { return m + 'm ago'; }
        const h = Math.round(m / 60);
        if (h < 24) { return h + 'h ago'; }
        return Math.round(h / 24) + 'd ago';
    }

    return { at, clock, utc, utcClock, clockUtc, stamp, full, tip, ago, offset };
});
