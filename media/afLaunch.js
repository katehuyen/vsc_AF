// Agent Farm — THE ONE NARROWING RULE. "Which model, and which effort with it."
//
// ‼️ THERE IS EXACTLY ONE ANSWER TO "THE ENGINE MOVED — WHAT HAPPENS TO THE
// BOXES UNDER IT", AND IT LIVES HERE (X-149).
//
// It used to live in four places, which is three too many for a rule whose
// whole job is that two surfaces cannot disagree:
//
//   · `narrowLaunch`      src/core/models.ts   — the host, with alias tails
//   · `reconcileComposer` media/console.js     — the Console, with S-34's keep
//   · `ntNarrowEffort`    media/tasksPage.js   — the Tasks form, effort only
//   · `launchNarrow`      media/afEngine.js    — and a fourth, written for
//                                                "anything NEW asks here"
//
// They answered the same question differently, and the measurement that opened
// X-148 says exactly how: `narrowLaunch` counts `claude-opus-4-5-20251101` and
// the alias `opus` as ONE model; the pages did not, and instead pushed the
// unrecognised value onto the list as a stranger (`withCurrent`). So the same
// model id was RECOGNISED on the host and FOREIGN on the page — which is the
// mechanical form of "one thing gets fixed and another breaks".
//
// ‼️ WHAT THIS FILE DID **NOT** DO: MAKE THE FOUR AGREE.
//
// Those differences are real answers to real cases (S-34, S-47/K-28, X-35), and
// silently unifying them would have changed behaviour on surfaces that took
// months to get right. They are PARAMETERS here instead — `keep`,
// `preferModelDefault`, `resolveAlias`, `takesEffort` — so that every divergence
// is now written down at the call site that wants it, in one word, instead of
// living in a copy of the rule that nobody can compare. Converging them is a
// separate decision somebody can now actually take, because there is finally
// one place to take it in.
//
// Loaded by both sides, like media/afTime.js and media/afQuery.js: the pages run
// in a webview and the host runs in Node (src/core/aflaunch.ts loads THIS FILE),
// and the two of them narrowing a pair differently is precisely the failure.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFLaunch = api; }
})(function () {
    'use strict';

    function txt(v) {
        return String(v === undefined || v === null ? '' : v).trim();
    }
    function has(list, id) {
        return (list || []).some(function (r) { return r && r.id === id; });
    }

    /**
     * ‼️ A CATALOGUE VIEW — the one shape this file reads, built by the caller
     * out of whatever its own surface happens to hold.
     *
     * The four callers hold the same facts under four names (`EngineModels` on
     * the host, `DATA.engineModels` on the Console, `DATA.launch.engineModels`
     * on the Tasks form, `launch.engineModels` in afEngine). Normalising here
     * rather than teaching this file about three page shapes is what keeps it
     * loadable from Node: it knows about models and efforts, and nothing about
     * where a panel keeps them.
     *
     *   known        false = no catalogue was published, so NOTHING is narrowed.
     *                Inventing a refusal out of ignorance is worse than the
     *                refusal it would prevent (core/models.ts' `!em` rule).
     *   models       the rows a model picker draws — `{ id: '' }` ("Default")
     *                is a real row, which is why an empty model is always kept.
     *   efforts      levels keyed by model id, plus a `''` entry; null when the
     *                engine states none per model.
     *   defaultEffort what the engine would pick for a model when the box says
     *                Default.
     *   fallbackEfforts the flat list to fall back on (EFFORT_CHOICES on the
     *                host, `DATA.efforts` on a page).
     *   takesEffort  false = this engine has NO effort flag at all, whatever
     *                its catalogue answered. Asked of the caller and not
     *                derived here, because the two page surfaces resolve it
     *                differently before a catalogue has landed (see X-35).
     */
    function catalog(src) {
        const s = src || {};
        const em = s.em || null;
        return {
            known: s.known === undefined ? !!em : !!s.known,
            models: (em && em.models) || s.models || [],
            efforts: (em && em.efforts) || null,
            defaultEffort: (em && em.defaultEffort) || {},
            fallbackEfforts: s.efforts || [],
            takesEffort: s.takesEffort !== false
        };
    }

    /**
     * ‼️ AN ENGINE WITH NO EFFORT SETTING OFFERS NONE, WHATEVER ITS CATALOGUE
     * SAYS (U-59 / X-35). Gemini has `-m` and nothing beside it, and OpenCode's
     * ACP declares only model and mode; passing an effort to either exits
     * non-zero. The engine ROW is what answers — `takesEffort` is true before
     * anything has connected, while an empty catalogue list is not there until
     * a session has opened.
     */
    function takesEffort(engineRow) {
        return !(engineRow && engineRow.takesEffort === false);
    }

    /**
     * ‼️ S-47 / K-28 — THE ID AN ENGINE RECORDS IS NOT ALWAYS THE ID IT
     * PUBLISHES. OpenCode names a model `provider/model` and its own export
     * records only the tail, so a resumed session asks for a name the catalogue
     * has never published and the model is dropped: the session comes back on
     * the fleet default, silently.
     *
     * ‼️ AND THE RULE IS INERT WHERE IT DOES NOT APPLY. On a catalogue whose ids
     * carry no `/`, every id IS its own tail — so the only thing this can match
     * is a model the exact test already kept. A tail claimed by SEVERAL ids
     * resolves to nothing: picking one by luck answers with a different
     * provider's model, which is worse than asking.
     */
    function tailOfExactlyOne(models, want) {
        if (!want) { return ''; }
        const hit = (models || []).filter(function (m) {
            return m && !!m.id && m.id.slice(m.id.lastIndexOf('/') + 1) === want;
        });
        return hit.length === 1 ? hit[0].id : '';
    }

    /** The levels THAT model supports — [] when the engine takes none. */
    function effortsFor(cat, model) {
        const c = cat || catalog({});
        if (!c.takesEffort) { return []; }
        if (!c.efforts) { return c.fallbackEfforts; }
        return c.efforts[txt(model)] || c.efforts[''] || c.fallbackEfforts;
    }

    /** The models that engine offers. */
    function modelsFor(cat) {
        return (cat || catalog({})).models;
    }

    /**
     * The model half. A model this engine does not offer is dropped (S-20).
     *
     * `opts.keep` is S-34: a value a real launch on THIS engine used is by
     * definition runnable on it — a catalogue lists what an engine is OFFERING,
     * not everything it can run, and clearing a remembered model cascaded into
     * the effort beside it (the effort list is looked up BY model). Only the
     * Console passes it, and only for the engine the remembered setup names.
     *
     * `opts.resolveAlias` is S-47/K-28 above. Only the host passes it today.
     */
    function narrowModel(cat, model, opts) {
        const c = cat || catalog({});
        const o = opts || {};
        const want = txt(model);
        if (want && o.keep && o.keep.model === want) { return want; }
        if (has(c.models, want)) { return want; }
        if (o.resolveAlias) { return tailOfExactlyOne(c.models, want); }
        return '';
    }

    /**
     * ‼️ X-30 — A MODEL AND AN EFFORT ARE ONE ANSWER, NOT TWO. The two boxes are
     * filled at different moments, and the effort that was valid for the model
     * you had a second ago is still sitting in the state when you pick a model
     * that has never heard of it. The CLI does not shrug at that — measured:
     *
     *   invalid model selection (--model "gemini-3.1-pro" --effort "medium"):
     *   gemini-3.1-pro has no "medium" effort (available: low, high)
     *
     * — a prompt that dies before it starts, hours later, in a task nobody is
     * watching. So an effort the resulting model does not offer becomes that
     * model's own default when the catalogue states one, and otherwise nothing:
     * "no flag" is the only value safe on every engine.
     *
     * `opts.preferModelDefault` is the Console's "a model was just picked BY
     * HAND" case: the model's own default then wins even over an effort that
     * would still have been valid.
     *
     * ‼️ AND IT TAKES THE MODEL IT IS ASKED ABOUT, NOT A NARROWED ONE. The Tasks
     * form narrows the effort while the model box is being moved and has not
     * settled; narrowing the model first there would change which list the level
     * is measured against, which is a different answer.
     */
    function narrowEffort(cat, model, effort, opts) {
        const c = cat || catalog({});
        const o = opts || {};
        const want = txt(effort);
        const rows = effortsFor(c, model);
        if (!o.preferModelDefault) {
            if (want && o.keep && o.keep.effort === want) { return want; }
            if (has(rows, want)) { return want; }
        }
        const def = txt((c.defaultEffort || {})[txt(model)]);
        return has(rows, def) ? def : '';
    }

    /**
     * The pair, made coherent — the whole rule, in the order every caller
     * applies it: the model settles first, and the effort is then measured
     * against the list THAT model publishes.
     */
    function narrow(cat, intent, opts) {
        const c = cat || catalog({});
        const want = intent || {};
        if (!c.known) { return { model: txt(want.model), effort: txt(want.effort) }; }
        const model = narrowModel(c, want.model, opts);
        return { model: model, effort: narrowEffort(c, model, want.effort, opts) };
    }

    /**
     * S-34 — A VALUE THIS AGENT ACTUALLY RAN ON IS ON THE LIST.
     *
     * A catalogue is what an engine is OFFERING, and that is not the same set as
     * what it can run: an alias typed into the launcher's "Other..." box, a
     * model added to agentFarm.modelAliases and later removed, a level a
     * catalogue stopped advertising. Drawing a select off the catalogue alone
     * silently loses whatever is set — the box shows the first row while the
     * state says something else, which is a control that lies.
     */
    function withCurrent(list, current) {
        const v = String(current || '');
        if (!v || (list || []).some(function (x) { return x && x.id === v; })) { return list || []; }
        return (list || []).concat([{ id: v, label: v }]);
    }

    /**
     * ‼️ THE ID AN ENGINE REPORTS BACK IS NOT THE ALIAS IT WAS ASKED FOR.
     * Claude's catalogue publishes `opus` · `sonnet` · `haiku`; its CLI answers
     * with what it resolved - `claude-opus-5`, `claude-opus-5-20260514`. Handed
     * to `withCurrent` that report becomes a stranger row, and the box reads
     * `claude-opus-5` beside an engine badge that already says Claude: the
     * engine written twice, in the narrowest place on the row, when the one
     * word the reader wanted was `opus`.
     *
     * So the value a box SHOWS for a report is the one catalogue id that is a
     * whole segment of it - and only then. Inert where it does not apply: an id
     * the catalogue lists is returned as it is, and a segment claimed by several
     * rows answers the raw id rather than a guess. The value SENT is untouched -
     * this decides which row is selected, not what a pick means.
     */
    function aliasIn(list, current) {
        const v = txt(current);
        if (!v || has(list, v)) { return v; }
        const parts = v.split(/[-/]/);
        const hit = (list || []).filter(function (m) { return m && !!m.id && parts.indexOf(m.id) >= 0; });
        return hit.length === 1 ? hit[0].id : v;
    }

    /**
     * What a picker for one dimension may show, with whatever is set already on
     * it. `model` and `effort` are the two the launch boxes ask for; anything
     * else answers `[]` rather than guessing, so a new dimension is a visible
     * gap here rather than an empty box on a page.
     */
    function vocabularyFor(cat, dimension, intent) {
        const c = cat || catalog({});
        const want = intent || {};
        const d = txt(dimension);
        if (d === 'model') { return withCurrent(modelsFor(c), want.model); }
        if (d === 'effort') { return withCurrent(effortsFor(c, want.model), want.effort); }
        return [];
    }

    return {
        catalog: catalog,
        takesEffort: takesEffort,
        modelsFor: modelsFor,
        effortsFor: effortsFor,
        narrow: narrow,
        narrowModel: narrowModel,
        narrowEffort: narrowEffort,
        withCurrent: withCurrent,
        aliasIn: aliasIn,
        vocabularyFor: vocabularyFor
    };
});
