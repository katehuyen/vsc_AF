// Agent Farm — THE LAUNCH DIMENSIONS, AS DATA. (X-150)
//
// ‼️ WHAT THIS FILE IS FOR: MAKING "EVERY DIMENSION, EVERY DOOR" COUNTABLE.
//
// A session in this extension is described by 17 answers — which engine, which
// account, which model, which effort, which route, which tier, which permission
// mode, and ten more — and it can be started from 13 places. That is 221
// obligations, and until this file existed the sentence stating them lived in a 1.690-line SOP,
// in a `_REF` rule and in 74 hand-written regexes. All three depend on a person
// remembering to read them, and the measurement behind X-148 is what happens
// when one does not: `providerId` and `tier` were added to the type, wired into
// the launcher, and simply never given a box in the Console composer. Nothing
// went red, because nothing was counting.
//
// ‼️ A LIST OF NAMES IS NOT THE POINT — A LIST THAT DERIVATIONS FOLD OVER IS.
//
// A constant nobody reads decays exactly like a document. So the functions that
// used to count these fields by hand now count them from HERE, and each flag
// below exists because some function needed to ask it:
//
//   remembered / perEngine  ->  what a launch writes back and reads out
//                               (src/core/launch.ts, X-145's per-engine rows)
//   redraws                 ->  what rebuilds the composer shell (S-51)
//
// Add a dimension to the array and the memory carries it, the shell repaints on
// it, and the parity matrix grows thirteen new obligations for it — none of
// which anybody has to remember to do.
//
// ‼️ WHY THE ARRAY LIVES IN `media/` AND NOT IN `src/core/`.
//
// Because both sides need it and only this direction works: a page cannot
// import from `out/`, and the shell key (S-51) has to be computed BY THE PAGE
// or the repaint waits a round trip — which is the turn-lag class of bug this
// whole item exists to end. So the data is here and `src/core/launchDimensions.ts`
// is its typed door, the same arrangement `media/afTime.js`, `media/afQuery.js`
// and `media/afLaunch.js` are already proved by. Splitting the list across the
// two sides would have been a second list, which is the failure, not the fix.
//
// ‼️ WHAT IS DELIBERATELY *NOT* IN HERE.
//
//   · **How long an answer lasts.** `providerIdentity`'s `scope` is the
//     ADAPTER's to state — fixed for the session on Claude, changeable at a
//     turn boundary on OpenCode — and X-105 made that an answer the engine
//     declares about itself. A static word here would be a second one, free to
//     disagree with the engine that actually knows.
//   · **How a value is narrowed.** That is `media/afLaunch.js` (X-149), which
//     is one rule for one reason. A `narrow()` per row here would have put the
//     four copies back, one per dimension instead of one per surface.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFDimensions = api; }
})(function () {
    'use strict';

    /**
     * ‼️ THE 17, IN THE ORDER `LaunchOptions` DECLARES THEM.
     *
     * `owner` is whose answer it is: `user` = somebody picked it, `engine` = the
     * program decides and we only carry it, `farm` = this extension resolved it
     * on the user's behalf and no picker shows it.
     *
     * `appliesTo(ctx)` is where a dimension does not exist at all rather than
     * being empty — a control with no referent is what docs/CONVENTIONS.md
     * forbids. `ctx` carries only facts the caller already holds:
     * `{ engine, takesEffort, hasProviderAxis, hasTiers, hasVariants, hasAccounts }`.
     */
    const LAUNCH_DIMENSIONS = [
        {
            id: 'engine', owner: 'user', remembered: true, perEngine: false, redraws: true,
            why: 'Which program runs. Absent means claude, which is what every caller written before engines existed meant.'
        },
        {
            id: 'account', owner: 'user', remembered: false, perEngine: false, redraws: false,
            appliesTo: c => c.hasAccounts !== false,
            why: 'WHICH SIGN-IN of that engine runs it. NOT remembered, and that is the '
                + 'decision rather than an omission: a model is a preference, an account is a '
                + 'STATE (how much of a plan is left, which changes hourly). Remembered per agent '
                + 'it would pin an agent to an exhausted plan and outrank the account switch '
                + 'on the Engines page, which would then visibly do nothing.'
        },
        {
            id: 'providerId', owner: 'user', remembered: true, perEngine: true, redraws: true,
            appliesTo: c => c.hasProviderAxis !== false,
            why: 'Which endpoint answers. NOT derived from the model: opencode/big-pickle looks like it names its own provider and splitting on the slash agrees most of the time, which is what makes it the wrong rule.'
        },
        {
            id: 'tier', owner: 'user', remembered: true, perEngine: true, redraws: true,
            appliesTo: c => c.hasTiers !== false,
            why: 'Which tier of THAT route, and a different question from the model: opus is kimi-k2-thinking on one route and MiniMax-M2 on another.'
        },
        {
            id: 'variant', owner: 'engine', remembered: true, perEngine: true, redraws: false,
            appliesTo: c => c.hasVariants !== false,
            why: 'published FOR THE CHOSEN MODEL, measured per model rather than per engine: of the six models this machine OpenCode offers, some carry variants and some do not.'
        },
        {
            id: 'model', owner: 'user', remembered: true, perEngine: true, redraws: true,
            why: 'A model belongs to ONE engine, and it decides what an effort MEANS. Narrowed by media/afLaunch.js.'
        },
        {
            id: 'effort', owner: 'user', remembered: true, perEngine: true, redraws: false,
            appliesTo: c => c.takesEffort !== false,
            why: 'An engine with no effort flag offers none, and passing one exits non-zero. Narrowed by media/afLaunch.js against the model.'
        },
        {
            id: 'permissionMode', owner: 'user', remembered: true, perEngine: true, redraws: false,
            why: 'Per engine like the model: reading it off the flat record was how a mode chosen for one engine arrived on the next as a flag nobody typed.'
        },
        {
            id: 'superpowers', owner: 'user', remembered: true, perEngine: false, redraws: false,
            why: 'THREE states, and absent is one of them: undefined means the agent own default decides. Flat rather than per engine because the discipline is the agent, not the program.'
        },
        {
            id: 'permission', owner: 'farm', remembered: false, perEngine: false, redraws: false,
            why: 'What the permission mode actually MEANS, resolved against Claude own settings layers before the command line is built. Absent means nobody resolved it.'
        },
        {
            id: 'name', owner: 'user', remembered: false, perEngine: false, redraws: false,
            why: 'the display name in the prompt box, the /resume picker and the terminal title. Not remembered: it names THIS session.'
        },
        {
            id: 'prompt', owner: 'user', remembered: false, perEngine: false, redraws: false,
            why: 'the first prompt. Content, not intent - it is never inherited from the last launch.'
        },
        {
            id: 'resume', owner: 'user', remembered: false, perEngine: false, redraws: false,
            why: 'which session is being continued. Mutually exclusive with continueLast (validateLaunch refuses the pair).'
        },
        {
            id: 'continueLast', owner: 'user', remembered: false, perEngine: false, redraws: false,
            why: 'continue the most recent session instead of naming one.'
        },
        {
            id: 'routePinned', owner: 'farm', remembered: false, perEngine: false, redraws: false,
            why: 'providerId/tier are the resume gate\'s answer, taken as they are (an empty providerId included) and never filled from the agent\'s record: a resumed session runs on the route it ran on. Per-launch like resume itself.'
        },
        {
            id: 'projectContextFile', owner: 'farm', remembered: false, perEngine: false, redraws: false,
            why: 'which project this session belongs to, told to the agent before the user types. A FILE and not inline text, measured: multi-line text does not survive a shell on any platform.'
        },
        {
            id: 'cwd', owner: 'farm', remembered: false, perEngine: false, redraws: false,
            why: 'the folder, which on Antigravity is not optional: measured, it reports the cwd back and then works in its own scratch dir unless handed --add-dir.'
        },
        {
            id: 'cli', owner: 'user', remembered: false, perEngine: false, redraws: false,
            why: 'The other executor. The one field that is not a flag: a CLI profile REPLACES the command line rather than adding to it, which is why a run carrying both it and an engine is refused rather than blended.'
        }
    ];

    const IDS = LAUNCH_DIMENSIONS.map(function (d) { return d.id; });
    const byId = {};
    LAUNCH_DIMENSIONS.forEach(function (d) { byId[d.id] = d; });

    function dimension(id) { return byId[id] || null; }
    function ids() { return IDS.slice(); }
    /** The ids whose spec answers true for `flag` — the fold every derivation is. */
    function idsWhere(flag) {
        return LAUNCH_DIMENSIONS.filter(function (d) { return !!d[flag]; })
            .map(function (d) { return d.id; });
    }
    /**
     * Does this dimension exist on this engine at all? `ctx` states only what
     * the caller already knows; an unstated fact means "yes", because a
     * dimension that has never been ruled out is a dimension that applies.
     */
    function applies(id, ctx) {
        const d = byId[id];
        if (!d) { return false; }
        return typeof d.appliesTo === 'function' ? !!d.appliesTo(ctx || {}) : true;
    }

    /**
     * ‼️ S-51 — WHAT REBUILDS THE COMPOSER SHELL, DERIVED RATHER THAN TYPED OUT.
     *
     * The page held this as a string built by hand — `|${engine}|${model}|…` —
     * which is the dimension list written a third time, incompletely, in a place
     * nothing checks. A dimension missing from it is a box that keeps the shape
     * it was last drawn with: S-51 was exactly that gap, and it took three
     * versions to find because the line looks complete.
     *
     * Now a dimension carrying `redraws: true` is in the key by construction.
     * The value only ever has to DISCRIMINATE — it is compared against the
     * previous render's, never parsed — so its spelling is free.
     */
    function shellKeyOf(intent) {
        const src = intent || {};
        return idsWhere('redraws').map(function (id) {
            const v = src[id];
            return v === undefined || v === null ? '' : String(v);
        }).join('|');
    }

    /**
     * What a launch writes back — the per-engine row (X-145). Every remembered
     * per-engine dimension, as a string, blank where it was not set: a row that
     * omits a field would let the previous engine's value show through the
     * merge in `rememberedOn`.
     */
    function rememberIntent(intent) {
        const src = intent || {};
        const out = {};
        idsWhere('perEngine').forEach(function (id) {
            if (!byId[id].remembered) { return; }
            out[id] = src[id] === undefined || src[id] === null ? '' : String(src[id]);
        });
        return out;
    }

    /**
     * ‼️ WHAT AN OPENING SURFACE INHERITS — this launch's own answer where it
     * has one, the remembered row where it does not.
     *
     * The rule is "a written answer wins": an empty string is not an answer, it
     * is the box the user has not touched, which is why a blank model still
     * inherits. A name or a prompt takes no part — those belong to the session
     * being started, not to the setup it is started with.
     *
     * ‼️ AND THE FOLD IS OVER `perEngine`, NOT OVER `remembered`, WHICH IS NOT
     * AN OVERSIGHT.
     *
     * Two remembered dimensions are flat rather than per engine, and each of
     * them inherits by a rule this fold would get WRONG:
     *
     *   · `engine` is read off the flat record and is what DECIDES which row the
     *     rest are then read from — it cannot be one of the values being read
     *     out of that row.
     *   · `superpowers` has THREE states and `undefined` is one of them (K-34:
     *     "the agent's own default decides"). Folding it would spell that third
     *     state as `''` and silently turn it into a fourth.
     *
     * So those two are inherited by name in `src/core/launch.ts`, and
     * `test_launch_dimensions.js` requires every `remembered && !perEngine`
     * dimension to be named there — the exemption is counted, not assumed.
     */
    function seedIntent(intent, prev) {
        const src = intent || {};
        const was = prev || {};
        const out = {};
        idsWhere('perEngine').forEach(function (id) {
            if (!byId[id].remembered) { return; }
            const own = src[id];
            const mine = own === undefined || own === null ? '' : String(own).trim();
            if (mine) { out[id] = mine; return; }
            const theirs = was[id];
            out[id] = theirs === undefined || theirs === null ? '' : String(theirs).trim();
        });
        return out;
    }

    return {
        LAUNCH_DIMENSIONS: LAUNCH_DIMENSIONS,
        ids: ids,
        dimension: dimension,
        idsWhere: idsWhere,
        applies: applies,
        shellKeyOf: shellKeyOf,
        rememberIntent: rememberIntent,
        seedIntent: seedIntent
    };
});
