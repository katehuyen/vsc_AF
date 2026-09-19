// Agent Farm — WHICH PROVIDER, WHICH PROFILE, WHICH MODEL a run belongs to,
// asked the same way by every filter and by the bridge (X-111).
//
// ‼️ ONE RULE, TWO RUNTIMES. The Sessions table, the Turns page and the
// `sessions.recent` / `turns.list` ops all answer "is this row one of the ones I
// picked", and three hand-written copies of that answer are three chances for a
// page and an agent to disagree about which sessions ran through Kimi. Hence the
// UMD wrapper, exactly as media/afQuery.js has it: `window.AFRunFilter` in a
// page, `module.exports` in the host (src/core/runFilter.ts).
//
// ‼️ AND THE ENGINE IS NOT THE PROVIDER (X-110). `claude` pointed at Kimi is
// still the Claude CLI, so the provider is a filter of its OWN, beside Engine,
// combined with it by AND — "Claude Code, only Kimi" is two ticks, not a
// special case.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFRunFilter = api; }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * ‼️ THE ROW WITH NO PROVIDER IS SELECTABLE. Almost every run on this
     * machine is on no route at all, and "everything that did NOT go through a
     * route" is a real question — a filter that could only ever narrow to the
     * rows that have a value would make it unaskable.
     */
    const NONE = '(none)';

    const id = (v) => String(v === undefined || v === null ? '' : v).trim().toLowerCase();

    /**
     * Every provider a run was served by, as lowercase ids, deduplicated.
     *
     * ‼️ A TURN THAT NAMES ITS OWN PROVIDER IS THE MOST SPECIFIC ANSWER, and it
     * wins: an OpenCode turn states the native provider that answered it, and a
     * session may have used several. A turn that names none — every Claude turn,
     * for ever (X-108) — inherits its session's, which is the route it was
     * launched on. So "only Kimi's turns" finds the Claude-via-Kimi turns that
     * never said a word about Kimi themselves.
     *
     * @param identity  the run's `launch.identity` (declared + reported)
     * @param turnProviderIds  the turn's own reported providers, when this is a turn
     */
    function providersOf(identity, turnProviderIds) {
        const out = [];
        const add = (v) => { const x = id(v); if (x && out.indexOf(x) < 0) { out.push(x); } };
        const turn = (turnProviderIds || []).filter(Boolean);
        if (turn.length) { turn.forEach(add); return out; }
        const I = identity || {};
        (I.reportedProviderIds || []).forEach(add);
        add(I.providerId);
        return out;
    }

    /** The profile a run was launched on — Claude routes only; '' elsewhere. */
    function profileOf(identity) {
        return id((identity || {}).providerProfileId);
    }

    /**
     * Every model that ANSWERED — the turn's own when this is a turn, else the
     * run's reported set. Deliberately never the requested one (X-108): a
     * filter called "Model" over rows that mix asked-for and came-back is a
     * filter whose answer to "which model ran" cannot be trusted.
     */
    function modelsOf(identity, turnModels) {
        const out = [];
        const add = (v) => { const x = id(v); if (x && out.indexOf(x) < 0) { out.push(x); } };
        const turn = (turnModels || []).filter(Boolean);
        if (turn.length) { turn.forEach(add); return out; }
        ((identity || {}).reportedModels || []).forEach(add);
        return out;
    }

    /**
     * ‼️ THE MULTI-PROVIDER RULE, STATED: a run matches when ANY of its values
     * was picked. A session that was half Anthropic and half Kimi DID run
     * through Kimi, and "which runs touched Kimi" is the question the filter is
     * asked with; hiding it because it also touched something else would make
     * the one run most worth finding the one it cannot find.
     *
     * `null` is no filter (a provider that appears tomorrow is included by
     * itself — the rule `engines` already keeps), `[]` is nothing, and a row
     * with no value matches only when `(none)` is picked.
     */
    function matchesAny(values, selection) {
        if (selection === null || selection === undefined) { return true; }
        const sel = selection.map(id);
        const vals = (values || []).map(id).filter(Boolean);
        if (!vals.length) { return sel.indexOf(id(NONE)) >= 0; }
        return vals.some(v => sel.indexOf(v) >= 0);
    }

    /**
     * The picker's options out of the rows it filters — `{v, t}` so the stored
     * value is the stable id and the text is the label the chip beside it
     * already says. `(none)` is offered only when some row really has none,
     * under the axis's own word for it (`noneLabel`, default "no route").
     */
    function options(valueLists, labelOf, noneLabel) {
        const seen = [];
        let none = false;
        for (const list of valueLists || []) {
            const vals = (list || []).map(id).filter(Boolean);
            if (!vals.length) { none = true; continue; }
            for (const v of vals) { if (seen.indexOf(v) < 0) { seen.push(v); } }
        }
        const opts = seen.sort().map(v => ({ v, t: labelOf ? labelOf(v) || v : v }));
        if (none && opts.length) { opts.push({ v: NONE, t: noneLabel || 'no route' }); }
        return opts;
    }

    return { NONE, providersOf, profileOf, modelsOf, matchesAny, options };
});
