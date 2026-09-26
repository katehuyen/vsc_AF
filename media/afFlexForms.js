// Agent Farm — THE SMART FLEX FORMS (X-370): instead of one frozen value,
//
//   RANGE      the user draws floor–ceiling on an ordered ladder; the system
//              moves inside it and says so at the edge.
//   TRI        ask / auto / never, each mapped to the value a point stores.
//   CAP        soft = warn or ask, hard = stop.
//   SUGGESTION a point's suggest(ctx) proposes a value with its reason; a
//              rejected one is not offered again.
//   DEAD       an option that cannot be met is drawn grey WITH the reason —
//              never a silent fallback.
//
// Pure helpers first (the host loads them through `src/core/flexForms.ts`),
// then the page renderers, which take the page's `C` ({ option, esc }).
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFFlexForms = api; }
})(function () {
    'use strict';

    const TRI = ['ask', 'auto', 'never'];
    const TRI_LABEL = { ask: 'ask me', auto: 'automatic', never: 'never' };

    /* ---------- RANGE ---------- */

    /** Why a range cannot be used on this ladder, or ''. */
    function rangeError(ladder, r) {
        if (!r || ladder.indexOf(r.lo) < 0 || ladder.indexOf(r.hi) < 0) { return 'A range picks its floor and ceiling from the list.'; }
        return ladder.indexOf(r.lo) > ladder.indexOf(r.hi) ? 'The floor is above the ceiling.' : '';
    }

    /** `v` held inside the range: below the floor rises to it, above the ceiling comes down to it. */
    function clampToRange(ladder, r, v) {
        const i = ladder.indexOf(v), lo = ladder.indexOf(r.lo), hi = ladder.indexOf(r.hi);
        if (i < 0) { return r.lo; }
        return ladder[Math.min(hi, Math.max(lo, i))];
    }

    /** One step up (+1) or down (-1) inside the range; at the edge it stays and says why. */
    function stepInRange(ladder, r, v, dir) {
        const from = clampToRange(ladder, r, v);
        const i = ladder.indexOf(from) + (dir < 0 ? -1 : 1);
        const lo = ladder.indexOf(r.lo), hi = ladder.indexOf(r.hi);
        if (i > hi) { return { value: from, moved: false, why: `${from} is the ceiling you set` }; }
        if (i < lo) { return { value: from, moved: false, why: `${from} is the floor you set` }; }
        return { value: ladder[i], moved: true, why: `${from} → ${ladder[i]}, inside ${r.lo}–${r.hi}` };
    }

    /* ---------- TRI ---------- */

    /** The state a stored value stands for, or '' when it is none of them. */
    function triState(states, stored) {
        return TRI.find(s => states[s] === stored) || '';
    }

    /* ---------- CAP ---------- */

    function capError(c) {
        const bad = v => v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v >= 0);
        if (!c || bad(c.soft) || bad(c.hard)) { return 'A cap is a number, 0 or more.'; }
        return c.soft !== undefined && c.hard !== undefined && c.soft > c.hard ? 'The soft cap is above the hard one.' : '';
    }

    /** Where `spent` stands against a soft/hard cap: ok · soft (warn or ask) · hard (stop), in words. */
    function capVerdict(c, spent, unit) {
        const u = unit === undefined ? '$' : unit;
        const fmt = v => u === '$' ? '$' + Number(v).toFixed(2) : String(v) + u;
        if (c.hard !== undefined && spent >= c.hard) {
            return { level: 'hard', sentence: `${fmt(spent)} reached the hard cap of ${fmt(c.hard)} — stop` };
        }
        if (c.soft !== undefined && spent >= c.soft) {
            return { level: 'soft', sentence: `${fmt(spent)} passed the soft cap of ${fmt(c.soft)} — ask before going on` };
        }
        const of = [c.soft !== undefined ? `soft ${fmt(c.soft)}` : '', c.hard !== undefined ? `hard ${fmt(c.hard)}` : '']
            .filter(Boolean).join(' · ');
        return { level: 'ok', sentence: of ? `${fmt(spent)} of ${of}` : `${fmt(spent)}, no cap` };
    }

    /* ---------- SUGGESTION ---------- */

    const rejectKey = (pointId, value) => pointId + '=' + JSON.stringify(value);

    /** The point's reasoned proposal, unless it is what is already there or was turned down before. */
    function suggestionFor(point, ctx, current, rejected) {
        if (!point || typeof point.suggest !== 'function') { return null; }
        const s = point.suggest(ctx || {});
        if (!s || s.value === undefined || JSON.stringify(s.value) === JSON.stringify(current)) { return null; }
        const key = rejectKey(point.id, s.value);
        return (rejected || []).indexOf(key) >= 0 ? null : { value: s.value, why: String(s.why || ''), key: key };
    }

    /* ---------- DEAD ---------- */

    /**
     * What an engine can take in. Only what is known: a missing entry is
     * "nobody said", which never greys an option out.
     */
    const ENGINE_INPUT = {
        claude: { label: 'Claude', image: true, pdf: true, video: false, audio: false },
        codex: { label: 'Codex', image: true, video: false, audio: false },
        gemini: { label: 'Gemini', image: true, pdf: true, video: true, audio: true },
        // measured 2026-09-26 (M-42): a PNG and a clip's frames seen, its sound not
        agy: { label: 'Antigravity (Gemini)', image: true, video: true, audio: false }
    };

    /** '' when the engine can take every input needed; else the reason, in words. */
    function deadReason(engine, needs, table) {
        const t = (table || ENGINE_INPUT)[String(engine || '').toLowerCase()];
        if (!t) { return ''; }
        const cannot = (needs || []).filter(n => t[n] === false);
        return cannot.length ? `${t.label} cannot open ${cannot.join(' or ')}` : '';
    }

    /* ---------- the page ---------- */

    /** A tri point as a select: each state named, the stored value as the option value. */
    function triSelect(id, states, stored, C, detail) {
        const d = detail || {};
        return `<select id="${C.esc(id)}">` + TRI.map(s => C.option(states[s],
            `${TRI_LABEL[s]} — ${d[s] || states[s]}`, { selected: states[s] === stored, detail: d[s] || '' })).join('') + '</select>';
    }

    /** Options with the dead ones greyed and their reason on the option. `options` = [{ value, label, engine? }]. */
    function deadOptions(options, needs, current, C) {
        return options.map(o => {
            const why = deadReason(o.engine || o.value, needs);
            return C.option(o.value, o.label + (why ? ` — ${why}` : ''),
                { selected: o.value === current, disabled: !!why, detail: why });
        }).join('');
    }

    /** A suggestion chip: accept or turn down; the reason is the tip. */
    function chip(s, C) {
        if (!s) { return ''; }
        return `<span class="flexchip" title="${C.esc(s.why)}">`
            + `<button type="button" data-flex-accept="${C.esc(JSON.stringify(s.value))}">Suggest: ${C.esc(String(s.value))}</button>`
            + `<button type="button" data-flex-reject="${C.esc(s.key)}" title="Not this — do not suggest it again">✕</button></span>`;
    }

    return {
        TRI: TRI, TRI_LABEL: TRI_LABEL, ENGINE_INPUT: ENGINE_INPUT,
        rangeError: rangeError, clampToRange: clampToRange, stepInRange: stepInRange,
        triState: triState, capError: capError, capVerdict: capVerdict,
        rejectKey: rejectKey, suggestionFor: suggestionFor, deadReason: deadReason,
        triSelect: triSelect, deadOptions: deadOptions, chip: chip
    };
});
