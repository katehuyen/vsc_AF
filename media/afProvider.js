// Agent Farm — WHICH PROVIDER SERVED IT, said the same way everywhere.
//
// ‼️ WHY THIS IS NOT afEngine.js WITH MORE ROWS (X-110).
//
// An ENGINE is the program on this machine — `claude`, `codex`, `opencode`.
// A PROVIDER is the endpoint that answered it. They are two axes, and Claude is
// the case that proves it: `claude` pointed at Kimi is still the Claude CLI, and
// a surface that draws one badge for both either calls Kimi an engine or hides
// it entirely. Both of those shipped — the Console invented its own route pill
// (its own colour, on one page) and every other surface buried the provider in a
// hover line or in the model text.
//
// So the rules afEngine.js was filed under (U-26) apply here one axis across:
// every provider has a chip, every provider has ONE colour, and both come from
// here. The shipped Claude routes are named; anything else — an OpenCode native
// provider, a route a build has never heard of — gets a STABLE derived colour
// off its own id rather than a shared grey, because "which of the four" is the
// question a multi-provider session is asking.
//
// The palette is VS Code's own chart variables, so it survives a theme change
// and stays legible in light and dark (docs/CONVENTIONS.md).
(function () {
    'use strict';

    /**
     * The routes this build ships as SHAPES (`CLAUDE_ROUTE_TEMPLATES`). A user's
     * profile carries its own label; this is the fallback and, more importantly,
     * the fixed colour — so one route reads the same on every page even where
     * only its id travelled.
     */
    const LABEL = {
        anthropic: 'Anthropic',
        'anthropic-api': 'Anthropic (API key)',
        kimi: 'Kimi',
        minimax: 'MiniMax'
    };

    const KNOWN = Object.keys(LABEL);

    /**
     * ‼️ The derived slots. An id this build never heard of is still ONE colour
     * everywhere, because the slot is a function of the id and of nothing else
     * — not of position in a list, which is what would make the same provider
     * change colour between two tables.
     *
     * ‼️ FIVE, BECAUSE RED IS NOT AVAILABLE. This extension signals a fault in
     * red on every surface, so a provider that happened to hash onto it would
     * read as a broken route rather than as a named one — the same lesson U-49
     * taught the engine palette about green. Five hues means two unknown
     * providers can eventually collide; a red chip that means nothing is the
     * worse of the two, because it is wrong rather than merely ambiguous.
     */
    const SLOTS = 5;

    function id(v) {
        return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
    }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** The identity shape `runIdentity` publishes (X-108), or a bare id. */
    function normalize(v) {
        if (!v) { return { providerId: '', providerLabel: '' }; }
        if (typeof v === 'string') { return { providerId: v, providerLabel: '' }; }
        return v;
    }

    function label(v) {
        const I = normalize(v);
        const k = id(I.providerId);
        if (!k) { return ''; }
        return String(I.providerLabel || '').trim() || LABEL[k] || String(I.providerId).trim();
    }

    /** A cheap stable hash — the same id lands in the same slot on every page
     *  and in every window. */
    function slot(k) {
        let h = 0;
        for (let i = 0; i < k.length; i++) { h = ((h << 5) - h + k.charCodeAt(i)) | 0; }
        return Math.abs(h) % SLOTS;
    }

    /**
     * ‼️ THE CLASS THAT CARRIES THE COLOUR, for anything that is not a chip —
     * the same split afEngine.js makes, and for the same reason: the second
     * surface that wants the hue on a border rather than on text is the moment
     * the values get copied into a page stylesheet.
     */
    function cls(v) {
        const k = id(normalize(v).providerId);
        if (!k) { return 'af-provc none'; }
        return 'af-provc ' + (KNOWN.indexOf(k) >= 0 ? k : 'p' + slot(k));
    }

    /**
     * ‼️ WHAT THE ENGINE SAID SERVED IT, WHICH IS NOT WHAT WAS ASKED FOR.
     *
     * A run declares a route at launch and the engine reports one per turn, and
     * a session where those differ is the whole reason X-108 recorded both. The
     * chip shows the one a reader would name — the reported one when there is
     * exactly one and it disagrees with the declared one, the declared one
     * otherwise — and `tip` carries the rest.
     */
    function servedBy(v) {
        const I = normalize(v);
        const rep = (I.reportedProviderIds || []).filter(Boolean);
        if (rep.length === 1 && id(rep[0]) !== id(I.providerId)) { return rep[0]; }
        return I.providerId || (rep.length === 1 ? rep[0] : '');
    }

    /** ‼️ A session that changed provider mid-run is NOT one chip. Saying
     *  "Kimi" over a run that was half Anthropic is the specific lie this
     *  component exists to stop. */
    function multi(v) {
        const I = normalize(v);
        return !!I.multiProvider && (I.reportedProviderIds || []).length > 1;
    }

    /**
     * ‼️ WHY THERE IS NOTHING TO SHOW — three answers, never one blank. The same
     * three `runIdentity.binding` names, worded once here rather than in each
     * page that draws them.
     */
    const BINDING = {
        legacy: 'not recorded — this run is older than the launch manifest',
        external: 'not ours — an imported or foreign-CLI transcript',
        unknown: 'asked for, and nothing answered'
    };

    /** How we know, for the two states where the ENGINE contributed evidence.
     *  `declared` alone is what the chip being there already means. */
    const PROOF = {
        matched: 'declared, and the engine named the same one',
        'engine-reported': 'the engine named it; nothing was declared',
        'launch-declared': ''
    };

    /** S-131 — a user-named route is cut to `max` characters where space is
     *  fixed; the caller's hover must open with the whole name (MIRROR). */
    function cut(s, max) {
        const a = Array.from(String(s));
        return max > 1 && a.length > max ? a.slice(0, max - 1).join('') + '…' : String(s);
    }

    /**
     * The chip. `extra` is appended to the class list so a caller can size it
     * for a dense row without inventing a colour.
     */
    function chip(v, extra, max) {
        const I = normalize(v);
        if (multi(I)) {
            const n = (I.reportedProviderIds || []).length;
            return '<span class="af-prov af-prov-multi' + (extra ? ' ' + extra : '') + '">'
                + n + ' providers</span>';
        }
        const who = servedBy(I);
        if (!who) { return ''; }
        return '<span class="af-prov ' + cls({ providerId: who })
            + (extra ? ' ' + extra : '') + '">' + esc(cut(label({
                providerId: who,
                providerLabel: id(who) === id(I.providerId) ? I.providerLabel : ''
            }), max)) + '</span>';
    }

    /**
     * ‼️ THE PANEL, WRITTEN ONCE — MIRROR first, then the evidence.
     *
     * Returns the LINES rather than the panel, because the surfaces that draw
     * this each own their own trigger (the Console's `cardTip`, the table's row
     * hover) and only the wording has to agree. Empty strings are dropped by
     * `AFTip.lines`, which is how a line that would restate the one above it
     * simply is not there.
     */
    /**
     * X-112 — WHO IS BILLED, in one line the host already worded. The rule
     * lives in `src/core/billing.ts` and travels on the identity as
     * `billing`; this page prints it and never derives it — the sentence that
     * says "these tokens never touched the plan window" must be the same one
     * on every surface, or the spend card and the row will contradict each
     * other about one run.
     */
    function billingLine(I) {
        const b = I && I.billing;
        return b && b.why ? 'Billing: ' + b.why : '';
    }

    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v)
        : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

    /** S-137 — the route's name history, worded once (the host's core/routeName.ts decides it). */
    function nameLines(v) {
        const I = normalize(v);
        return [
            I.providerLabelAtLaunch ? t('Name at launch: {name}', { name: I.providerLabelAtLaunch }) : '',
            I.providerProfileRemoved ? t('Profile removed — shown by the last name it carried') : ''
        ];
    }

    function tipLines(v) {
        const I = normalize(v);
        const rep = (I.reportedProviderIds || []).filter(Boolean);
        if (I.binding && I.binding !== 'declared') {
            return [
                'Route: ' + (BINDING[I.binding] || I.binding),
                rep.length ? 'Answered by: ' + rep.map(label).join(', ') : '',
                I.requestedModelRef ? 'Requested: ' + I.requestedModelRef : '',
                billingLine(I)
            ];
        }
        const declared = label(I);
        // ‼️ COMPARED BY ID, NEVER BY LABEL. A profile's own name ("Kimi (work)")
        // and the shipped label for the same company ("Kimi") are two spellings
        // of one answer, and comparing the strings would draw an "Answered by"
        // line on every routed run saying exactly what the line above it said.
        const who = servedBy(I);
        const served = id(who) === id(I.providerId) ? '' : label({ providerId: who });
        return [
            declared ? 'Route: ' + declared
                + (I.providerProfileRevision ? ' · profile revision ' + I.providerProfileRevision : '')
                : 'Route: none declared — the engine\'s own default answered',
            ...nameLines(I),
            // ‼️ ONLY WHEN IT ADDS SOMETHING. On a run where the engine named
            // what was declared this restates the line above it, and a panel
            // that repeats itself is one a reader stops opening.
            served ? 'Answered by: ' + served : '',
            multi(I) ? 'Changed provider mid-run: ' + rep.map(label).join(' → ')
                + ' — the turns each ran on the one reported for them' : '',
            PROOF[I.proof] ? 'How we know: ' + PROOF[I.proof] : '',
            I.requestedModelRef ? 'Requested: ' + I.requestedModelRef : '',
            (I.reportedModels || []).length ? 'Answered with: ' + I.reportedModels.join(', ') : '',
            billingLine(I)
        ];
    }

    /** The first line of a MIRROR tooltip — the chip cuts its own text, so the
     *  panel opens with the value the chip is showing. */
    function title(v) {
        const I = normalize(v);
        if (multi(I)) {
            return (I.reportedProviderIds || []).map(label).join(' → ')
                + ' — this run changed provider between turns';
        }
        const who = label({ providerId: servedBy(I), providerLabel: I.providerLabel });
        return who ? who + ' — the route this run is served by' : '';
    }

    window.AFProvider = {
        id: id, label: label, cls: cls, chip: chip, cut: cut, known: KNOWN, CARD_MAX: 15,
        servedBy: servedBy, multi: multi, tipLines: tipLines, nameLines: nameLines, title: title,
        binding: BINDING, proof: PROOF
    };
})();
