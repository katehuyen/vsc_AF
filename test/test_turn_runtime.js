// X-102 — WHAT WAS ASKED FOR, BESIDE WHAT CAME BACK, ONE TURN AT A TIME.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. The manifest half and the reported
// half were each already correct on their own; the failure this file guards is
// the one that only exists once they are put side by side — a comparison that
// calls an ALIAS a mismatch. A launch asks for `opus`, the transcript says
// `claude-opus-5`, and a naive equality test paints almost every honest session
// red. A correctness signal that fires on everything is a correctness signal
// nobody reads, so the tests below spend most of their weight on the states in
// between "same" and "wrong".
//
// ‼️ AND ON THE FIELD THAT IS ALLOWED TO BE BORING. `identity.changedFromPrevious`
// watches what was ASKED FOR, and one manifest across a session means it is
// false on every turn by construction. That is correct, not a bug, and the
// suite pins it — because the obvious "fix" is to quietly repoint it at the
// reported half, which would leave nothing watching the requested one.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const T = require(path.join(ROOT, 'out', 'core', 'turnRuntime.js'));
const M = require(path.join(ROOT, 'out', 'core', 'launchManifest.js'));
const B = require(path.join(ROOT, 'out', 'core', 'launchBinding.js'));

/** A manifest as `manifestFor` builds one, with only what these tests read. */
const manifest = (identity, options) => M.manifestFor({
    launchId: 'lch_test0001', at: 1_700_000_000_000, engine: identity.engine,
    identity, options: options || {}, agentId: 'a1', agentName: 'developer',
    mechanism: 'session', cwd: 'D:/work', surface: 'terminal'
});

const CLAUDE_ROUTE = {
    engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)',
    origin: 'agent-farm-profile', scope: 'session',
    providerProfileId: 'kimi-work', providerProfileRevision: 3,
    route: { baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key' },
    requestedModelRef: 'kimi-k2-thinking', proof: 'launch-declared'
};

/* =========================================================================
 * 1 — ‼️ AN ALIAS IS NOT A MISMATCH
 * ========================================================================= */
{
    // The single most available way to make this whole item useless.
    eq('a tier asked for and an id answered is UNPROVEN, not wrong',
        T.modelAgreement(['opus'], ['claude-opus-5']), 'unproven');
    eq('…and the same name on both sides is matched',
        T.modelAgreement(['claude-opus-5'], ['claude-opus-5']), 'matched');
    eq('…case-insensitively, because the two sides travelled through different code',
        T.modelAgreement(['Claude-Opus-5'], ['claude-opus-5']), 'matched');
    // ‼️ NOTHING ASKED FOR IS NOT A FAULT. A launch that named no model took the
    // engine's default, which is a legitimate and common way to start a run.
    eq('a launch that asked for nothing has nothing to disagree with',
        T.modelAgreement([], ['claude-opus-5']), 'nothing-requested');
    eq('…and a turn that named nothing is its own state',
        T.modelAgreement(['opus'], []), 'nothing-reported');
    // Several requested names: the manifest keeps model, ref and tier apart, so
    // the test asks all three rather than picking one and being wrong about the
    // other two thirds of the launches.
    eq('any one of the requested names matching is a match',
        T.modelAgreement(['opus', 'kimi-k2-thinking'], ['kimi-k2-thinking']), 'matched');
}

/* =========================================================================
 * 2 — THE JOIN: THE DECLARED HALF SURVIVES ONTO EVERY TURN
 * ========================================================================= */
{
    const m = manifest(CLAUDE_ROUTE, { model: 'opus', tier: 'opus' });
    const rows = T.turnRuntimes(m, 'claude', [
        { n: 1, models: ['kimi-k2-thinking'] },
        { n: 2, models: ['kimi-k2-thinking'] }
    ]);
    eq('one row per turn', rows.map(r => r.n), [1, 2]);
    // ‼️ THE ROUTE IS ON THE TURN. This is the thing no transcript carries, and
    // the whole reason the pair exists.
    eq('every turn carries the route the launch declared',
        rows.map(r => r.identity.providerId), ['kimi', 'kimi']);
    eq('…with the profile revision that was in force',
        rows[0].identity.providerProfileRevision, 3);
    eq('…and the reported model beside it, not instead of it',
        rows[0].identity.reportedModels, ['kimi-k2-thinking']);
    eq('…which the launch did ask for, so they agree', rows[0].agreement, 'matched');
    // ‼️ THE BORING FIELD, PINNED ON PURPOSE. One manifest means the requested
    // half never moves; repointing this at the reported half would leave the
    // requested one unwatched.
    ok('the requested half did not change, and says so',
        rows[1].identity.changedFromPrevious === false);
    ok('…and neither did the reported one', rows[1].reportedChanged === false);
}

/* =========================================================================
 * 3 — ‼️ THE REPORTED HALF IS THE ONE THAT ACTUALLY MOVES
 * ========================================================================= */
{
    // A long Claude session: a compaction and a sub-agent are served by a
    // smaller model than the turn that spawned them. Ordinary, and a
    // session-level "the model was X" would be false about it.
    const m = manifest({ ...CLAUDE_ROUTE, providerId: '', origin: 'unknown', proof: 'unknown' },
        { model: 'claude-opus-5' });
    const rows = T.turnRuntimes(m, 'claude', [
        { n: 1, models: ['claude-opus-5'] },
        { n: 2, models: ['claude-opus-5', 'claude-haiku-4-5-20251001'] },
        { n: 3, models: ['claude-opus-5', 'claude-haiku-4-5-20251001'] },
        { n: 4, models: ['claude-opus-5'] }
    ]);
    eq('a turn served by two models keeps both', rows[1].identity.reportedModels,
        ['claude-opus-5', 'claude-haiku-4-5-20251001']);
    eq('the reported half changed at turns 2 and 4',
        rows.filter(r => r.reportedChanged).map(r => r.n), [2, 4]);
    ok('…and the first turn has nothing to have changed from',
        rows[0].reportedChanged === false);

    const d = T.runDrift(rows);
    eq('the run collected both models in first-seen order', d.reportedModels,
        ['claude-opus-5', 'claude-haiku-4-5-20251001']);
    eq('…and remembers where it changed', d.changedAt, [2, 4]);
    // ‼️ AND THE EXTRA MODEL IS NOT A DISAGREEMENT — the alias trap in its
    // second costume. Every one of these turns WAS served by the model the
    // launch asked for; haiku is the engine's own machinery (compaction, a
    // sub-agent) riding along inside the turn. A rule that demanded every
    // reported model be a requested one would fire on every long Claude session
    // there has ever been, which is how a correctness signal becomes wallpaper.
    // A turn is `unproven` when NOTHING that served it was asked for.
    eq('an extra internal model is not a disagreement', d.agreement, 'matched');
    eq('…while a turn served ONLY by something nobody asked for is',
        T.runDrift(T.turnRuntimes(m, 'claude', [{ n: 1, models: ['gpt-5'] }])).agreement,
        'unproven');
    ok('and a line a person can read says why', /2 models across 4 turns/.test(T.describeDrift(d)));
    ok('…naming where it changed', /changed at turn 2, 4/.test(T.describeDrift(d)));
}

/* =========================================================================
 * 4 — ‼️ A PROVIDER THE LAUNCH DID NOT DECLARE
 * ========================================================================= */
{
    // OpenCode names its provider, so a disagreement here is a real one rather
    // than a spelling one.
    const m = manifest({
        engine: 'opencode', providerId: 'opencode', origin: 'engine-native', scope: 'turn',
        requestedModelRef: 'big-pickle', proof: 'launch-declared'
    }, { model: 'big-pickle' });
    const rows = T.turnRuntimes(m, 'opencode', [
        { n: 1, models: ['big-pickle'], providerIds: ['opencode'] },
        { n: 2, models: ['claude-opus-5'], providerIds: ['anthropic'] }
    ]);
    ok('a turn on the declared provider is no conflict', rows[0].providerConflict === false);
    ok('…and one on a provider nobody declared is', rows[1].providerConflict === true);
    const d = T.runDrift(rows);
    ok('the run says a provider disagreed', d.providerConflict === true);
    eq('…and names both of them', d.reportedProviderIds, ['opencode', 'anthropic']);
    ok('and the line says which one the launch did not declare',
        /did not declare/.test(T.describeDrift(d)));

    // ‼️ X-108 — SEVERAL PROVIDERS IN ONE RUN IS A SHAPE, AND ON A TURN-SCOPED
    // ENGINE IT IS THE FEATURE WORKING. OpenCode documents changing provider at
    // a turn boundary (`session/set_config_option`), so the run is a legitimate
    // multi-provider timeline; the alarm belongs only to a run whose scope says
    // the provider was fixed for its whole length.
    ok('the run says more than one provider served it', d.multiProvider === true);
    ok('…and that this run was allowed to change one', d.turnScope === true);
    ok('…so the line describes the timeline rather than accusing it',
        /a turn-scoped run may change provider/.test(T.describeDrift(d)));

    // The same two providers under a manifest that says the provider was fixed
    // for the session. Same facts, different meaning — and the meaning is read
    // off the SCOPE, never off the engine's name.
    const fixed = T.runDrift(T.turnRuntimes(manifest({
        engine: 'opencode', providerId: 'opencode', origin: 'engine-native', scope: 'session',
        requestedModelRef: 'big-pickle', proof: 'launch-declared'
    }, { model: 'big-pickle' }), 'opencode', [
        { n: 1, models: ['big-pickle'], providerIds: ['opencode'] },
        { n: 2, models: ['claude-opus-5'], providerIds: ['anthropic'] }
    ]));
    ok('‼️ a session-scoped run with two providers is NOT called a timeline',
        fixed.multiProvider === true && fixed.turnScope === false
        && /two|2 providers inside one session-scoped run/.test(T.describeDrift(fixed)));

    // And one provider, on a turn-scoped run, is not a timeline either — the
    // field says "more than one", not "the engine could have".
    const single = T.runDrift(T.turnRuntimes(m, 'opencode',
        [{ n: 1, models: ['big-pickle'], providerIds: ['opencode'] }]));
    ok('…while one provider is no timeline at all, however wide the scope',
        single.multiProvider === false && single.turnScope === true
        && !/providers across/.test(T.describeDrift(single)));

    // ‼️ ON CLAUDE THIS CANNOT FIRE, because the transcript names no route at
    // all — measured. An empty reported list is not a disagreement.
    const claude = T.turnRuntimes(manifest(CLAUDE_ROUTE, { model: 'opus' }), 'claude',
        [{ n: 1, models: ['kimi-k2-thinking'] }]);
    ok('a Claude turn names no provider, so it cannot contradict one',
        claude[0].providerConflict === false);
}

/* =========================================================================
 * 4b — ‼️ X-108 — THE WHOLE RUN ON ONE OBJECT, AND IT ALWAYS ANSWERS
 *
 * `turnRuntimes` is the right shape for a viewer and the wrong one for a table:
 * a row cannot carry fifty turns. `runIdentity` is the same join summarised —
 * and unlike the shape it replaces it answers when there is no manifest, which
 * is where three different facts used to share one blank space.
 * ========================================================================= */
{
    const m = manifest({
        engine: 'opencode', providerId: 'opencode', providerLabel: 'OpenCode',
        origin: 'engine-native', scope: 'turn', requestedModelRef: 'opencode/big-pickle',
        proof: 'launch-declared'
    }, { model: 'big-pickle' });
    const declared = T.runIdentity(m, 'opencode', [
        { n: 1, models: ['big-pickle'], providerIds: ['opencode'] },
        { n: 2, models: ['big-pickle'], providerIds: ['anthropic'] }
    ]);
    eq('a run with a manifest is bound to it', declared.binding, 'declared');
    eq('…and carries the declared half whole',
        [declared.providerId, declared.providerLabel, declared.origin, declared.scope],
        ['opencode', 'OpenCode', 'engine-native', 'turn']);
    eq('…and the requested model reference the launch really named',
        declared.requestedModelRef, 'opencode/big-pickle');
    eq('…and both reported halves, which only the turns could supply',
        [declared.reportedProviderIds, declared.reportedModels],
        [['opencode', 'anthropic'], ['big-pickle']]);
    ok('…and the timeline facts ride with them',
        declared.multiProvider === true && declared.turnScope === true);
    // ‼️ THE ENGINE NAMED THE SAME PROVIDER THAT WAS DECLARED, so the proof is
    // stronger than "we wrote it down" — and that is the only reason a surface
    // shows a proof line at all.
    eq('…and the proof says both sides agreed', declared.proof, 'matched');

    // ‼️ THE THREE KINDS OF NOTHING, WHICH IS THE POINT OF THE FUNCTION.
    const legacy = T.runIdentity(undefined, 'claude', [{ n: 1, models: ['claude-opus-5'] }]);
    eq('OUR run from before the manifest is `legacy`, not `unknown`', legacy.binding, 'legacy');
    eq('…and says nobody was asked rather than naming a provider', legacy.origin, 'legacy-inherit');
    eq('…and invents no provider to go with it', legacy.providerId, '');
    eq('…while the model that really served it is still kept',
        legacy.reportedModels, ['claude-opus-5']);

    const foreign = T.runIdentity(undefined, 'codex', [{ n: 1, models: ['gpt-5'] }],
        { external: true });
    eq('somebody else\'s transcript is `external`', foreign.binding, 'external');
    // ‼️ AND ITS ORIGIN IS `external`, NOT `legacy-inherit`. "Nobody was asked"
    // is a statement about OUR records and is simply untrue of a run we never
    // started — it would also make the row look backfillable (X-116) when there
    // is nothing anywhere to backfill it from.
    eq('…and it does not borrow "nobody was asked"', foreign.origin, 'external');

    // An engine that named its provider has PROVED one even with nothing
    // declared — saying `unknown` there would throw away the only evidence.
    const reportedOnly = T.runIdentity(undefined, 'opencode',
        [{ n: 1, models: ['big-pickle'], providerIds: ['opencode'] }]);
    eq('…and a provider the engine named is proof even with no manifest',
        reportedOnly.proof, 'engine-reported');
    eq('…named on the summary, where a row can read it',
        reportedOnly.reportedProviderIds, ['opencode']);
}

/* =========================================================================
 * 5 — ‼️ A RUN WITH NO MANIFEST IS `legacy-inherit`, NOT `unknown`
 * ========================================================================= */
{
    // Every session recorded before v11.183 is in this state, and the two words
    // mean opposite things: `unknown` says "asked, no answer", `legacy-inherit`
    // says "nobody was asked" — which is true, and which is what makes it
    // backfillable from real evidence later (X-116).
    const rows = T.turnRuntimes(undefined, 'claude', [{ n: 1, models: ['claude-opus-5'] }]);
    eq('a run with no manifest says nobody was asked', rows[0].identity.origin, 'legacy-inherit');
    eq('…and names no provider', rows[0].identity.providerId, '');
    // The reported half is still read; what is missing is anything to compare
    // it against.
    eq('…while the model it really did run on is kept',
        rows[0].identity.reportedModels, ['claude-opus-5']);
    eq('…and nothing was requested, so nothing disagreed',
        rows[0].agreement, 'nothing-requested');
    eq('the engine still comes through', rows[0].identity.engine, 'claude');

    /*
     * ‼️ X-116 — AND IT IS THE PRODUCT'S OWN ANSWER, NOT A SECOND COPY OF IT.
     *
     * `declaredOf` used to spell this shape out by hand — `unknownIdentity`
     * with the origin overwritten — while `legacyIdentity`, whose entire job is
     * this one case, had no caller anywhere in `src/`. The two agreed, which is
     * precisely why nobody saw it: X-116 is the SCHEMA UPGRADE item, so the next
     * field added to `ProviderIdentity` would have reached the real function and
     * not this line, and a run with no manifest would quietly have started
     * meaning something different from what the product says it means.
     *
     * So the guard is not "the origin is legacy-inherit" (the assertions above
     * already say that, and they passed the whole time the copy existed). It
     * asks the two objects to be THE SAME OBJECT, field for field — which is a
     * question a hand-written copy fails the moment the shape grows.
     */
    const P = require(path.join(ROOT, 'out', 'core', 'providerIdentity.js'));
    const mine = rows[0].identity;
    const theirs = P.legacyIdentity('claude');
    const declared = Object.keys(theirs);
    ok('…and the no-manifest identity carries every field legacyIdentity does'
        + ' (missing: ' + declared.filter(k => !(k in mine)).join(', ') + ')',
        declared.every(k => k in mine));
    ok('‼️ …with the same value in each, so the two cannot drift apart',
        declared.every(k => JSON.stringify(mine[k]) === JSON.stringify(theirs[k])));
    // ‼️ AND THE HAND-WRITTEN COPY IS GONE FROM THE SOURCE, not merely
    // out-agreed by it: a second call site that rebuilds the shape passes every
    // assertion above and reintroduces the whole defect.
    const src = require('fs').readFileSync(path.join(ROOT, 'src', 'core', 'turnRuntime.ts'), 'utf8');
    ok('‼️ …and turnRuntime CALLS it rather than rebuilding the shape',
        /return legacyIdentity\(/.test(src)
        && !/\.\.\.unknownIdentity\([^)]*\),\s*origin:/.test(src));
}

/* =========================================================================
 * 6 — NOTHING IN, AND THE ANSWER THAT MUST NOT BE "VERIFIED"
 * ========================================================================= */
{
    const d = T.runDrift([]);
    eq('a run with no turns has nothing to report', d.agreement, 'nothing-reported');
    // ‼️ AND SPECIFICALLY NOT `matched`: an empty session reading as a verified
    // one is the failure mode of every "no news is good news" rollup.
    ok('…which is not the same as verified', d.agreement !== 'matched');
    eq('…and says nothing rather than something reassuring', T.describeDrift(d), '');
    eq('no turns, no rows', T.turnRuntimes(undefined, 'claude', []), []);
    eq('…and an absent list is the same as an empty one',
        T.turnRuntimes(undefined, 'claude', undefined), []);

    // The ordinary case says nothing at all — a column of identical text is a
    // column the reader learns to stop looking at.
    const steady = T.runDrift(T.turnRuntimes(
        manifest(CLAUDE_ROUTE, { model: 'kimi-k2-thinking' }), 'claude',
        [{ n: 1, models: ['kimi-k2-thinking'] }, { n: 2, models: ['kimi-k2-thinking'] }]));
    eq('a steady matched run is silent', T.describeDrift(steady), '');
    eq('…and reads as matched', steady.agreement, 'matched');
}

/* =========================================================================
 * 7 — ‼️ THE BINDING IS THE ONLY WITNESS, SO IT MUST HAND THE ID OVER
 * ========================================================================= */
{
    // Without this the chain has a break in it and nothing above can ever run
    // on a real session: manifest ← launchId ← binding ← sessionId ← session.
    const hit = {
        binding: {
            taskId: 't1', launchId: 'lch_test0001', agentId: 'a1', agentName: 'developer',
            kind: 'task', label: 'nightly', cwd: 'D:/work'
        }
    };
    const fresh = B.applyBinding({}, hit);
    eq('a session with no launch id takes the binding\'s', fresh.launchId, 'lch_test0001');
    // ‼️ NEVER OVER THE TOP OF ONE IT ALREADY HAS. A fresher record and a
    // persisted snapshot must not be able to disagree about which run this was.
    const already = B.applyBinding({ launchId: 'lch_other' }, hit);
    eq('…and one that already knows keeps its own', already.launchId, 'lch_other');
    // A binding written before the manifest existed carries none, and that is
    // an absence rather than an empty string.
    const old = B.applyBinding({}, { binding: { ...hit.binding, launchId: undefined } });
    ok('a binding from before the manifest leaves it absent', old.launchId === undefined);

    // And the join itself, end to end: an id that has no record answers
    // `undefined` rather than a nearest match.
    const m = manifest(CLAUDE_ROUTE, { model: 'opus' });
    eq('the session reaches its manifest through the id',
        M.manifestOf([m], fresh).launchId, 'lch_test0001');
    ok('…and an id with no record is undefined, never a guess',
        M.manifestOf([m], { launchId: 'lch_nothing' }) === undefined);
}

/* =========================================================================
 * 8 — ‼️ AND IT IS ACTUALLY REACHABLE.
 *
 * The state this item was inherited in: a correct pure core with nothing wired
 * to it — `identityFromEvents` declared and implemented by nobody, a manifest
 * store no surface read. A green core proves the arithmetic and says nothing
 * about whether a person or an agent can ever get an answer out of it, so the
 * wiring is measured here rather than remembered.
 * ========================================================================= */
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

    ok('the join is on the bridge, not only in the core',
        /op: 'launch\.runtime',/.test(ext));
    // ‼️ THROUGH THE SESSION'S OWN launchId, which the binding wrote. Nothing
    // here may read a route off a transcript, because no transcript has one.
    ok('…reached through the id the binding put on the session',
        /const manifest = manifestOf\(launchManifests\(\), s\);/.test(ext));
    // ‼️ X-108 — BOTH REPORTED HALVES, or the provider half is structurally
    // unreachable: `providerConflict` and `multiProvider` read
    // `reportedProviderIds`, and this call site is the only thing that can ever
    // supply one. It used to pass `models` alone, so every OpenCode run reported
    // no provider at all and the pin certified that as correct.
    ok('…and joined to the models AND the providers the transcript really reports',
        /turnRuntimes\(manifest, engine,/.test(ext)
        && /\(s\.turns \?\? \[\]\)\.map\(t => \(\{ n: t\.n, models: t\.models, providerIds: t\.providerIds \}\)\)/
            .test(ext));
    // ‼️ THE DESCRIBE IS PART OF THE FEATURE. An agent reading `farm.ops` decides
    // what an answer MEANS from this text, and `unproven` read as "wrong" would
    // turn an alias into a bug report.
    // ‼️ X-108 — AND THE SUMMARY IS ON THE OP TOO, so a caller asking "what ran
    // this" does not have to fold fifty turns itself — and so that an absence
    // arrives NAMED rather than as a missing field.
    ok('‼️ the op answers with the whole run on one object',
        /identity: runIdentity\(manifest, engine,/.test(ext));
    ok('…and its describe tells the caller to read `binding` first',
        /`binding` — READ THIS FIRST/.test(ext)
        && /naming an absence is the opposite of filling it in/.test(ext));
    ok('…and the describe says out loud that "unproven" is not an accusation',
        /is NOT proof of a fault/.test(ext) && /never "this ran on the wrong thing"/.test(ext));
    // ‼️ X-108 — AND THE SAME DUTY FOR THE SECOND SIGNAL. An agent reading
    // `multiProvider: true` with no word about scope would file the feature
    // working as an incident, which is the accusation this family keeps
    // refusing to make.
    ok('…and that several providers on a turn-scoped run is the feature, not a fault',
        /multiProvider` WITH `turnScope` IS NOT A FAULT/.test(ext)
        && /Read the scope, never the/.test(ext));
    ok('…and that a Claude route can never be reported',
        /`reportedProviderIds` is EMPTY on Claude for ever/.test(ext));

    // The binding must be handing the id over for any of that to fire on a real
    // session — the one line that closes the chain.
    const bind = fs.readFileSync(path.join(ROOT, 'src', 'core', 'launchBinding.ts'), 'utf8');
    ok('‼️ and the chain has no break in it: the binding hands the id to the session',
        /if \(!info\.launchId && hit\.binding\.launchId\) \{ info\.launchId = hit\.binding\.launchId; \}/
            .test(bind));
    const sess = fs.readFileSync(path.join(ROOT, 'src', 'core', 'sessions.ts'), 'utf8');
    ok('…and the session has somewhere to keep it', /^\s*launchId\?: string;$/m.test(sess));

    // ‼️ AND A PERSON CAN SEE IT. Until this, the manifest was readable from the
    // bridge and nowhere else — written on every spawn since v11.183 and never
    // once shown to the human it was recorded for.
    const dash = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'dashboard.ts'), 'utf8');
    ok('the row carries what the run was set up to be',
        /const launchFacts = \(s: SessionInfo\) =>/.test(dash) && /launch: launchFacts\(s\)/.test(dash));
    // ‼️ X-108 — AND WHERE THAT USED TO BE `null`, IT NOW SAYS WHICH KIND OF
    // NOTHING. `null` made three different facts share one blank space: our own
    // run from before the manifest (`legacy`, backfillable later — X-116),
    // somebody else's transcript (`external`, never anything to record), and
    // asked-with-no-answer (`unknown`, the only one worth looking at). The
    // VALUES stay empty — naming the absence is the opposite of filling it in.
    // ‼️ X-111 — the identity is asked of core (`sessionIdentity`), the ONE
    // place that decides manifest · engine · external, so the Turns page and
    // the bridge answer exactly what this row does.
    ok('‼️ …and a run with no manifest says which kind of nothing it is',
        /const identity = sessionIdentity\(s, manifests\);/.test(dash)
        && /route: '', revision: null, requested: '', surface: '', account: ''/.test(dash));
    ok('…with no value invented to go beside it',
        !/if \(!m\) \{ return null; \}/.test(dash));
    // ‼️ ALL THREE TABLES, NOT ONE. The same table component is embedded on the
    // Dashboard, the agent page and the Sessions page; a fact visible on one and
    // missing from the next is the gap a reader notices first.
    // …and the Turns page since X-111: a turn's route is its session's.
    const wired = ['panels/dashboard.ts', 'panels/agentDetail.ts', 'panels/sessionsPanel.ts', 'panels/turnsPanel.ts']
        .filter(p => /deps\.launchManifests\?\.\(\)/
            .test(fs.readFileSync(path.join(ROOT, 'src', p), 'utf8')));
    eq('every surface that lists sessions or their turns gets the same store',
        wired.length, 4);
    ok('…and the host actually hands it over',
        (ext.match(/launchManifests: \(\) => launchManifests\(\)/g) || []).length === 4);

    // ‼️ AND THE RUNS A PERSON STARTED THEMSELVES ARE JOINED TOO. `publishLaunch
    // Bindings` is built out of TASKS, so without this second channel everything
    // above would have been visible on automation only — which is the minority
    // of sessions and the one nobody was asking about.
    ok('a hand-opened terminal or card gets its spawn joined as well',
        /const publishSpawnIds = \(\): void =>/.test(ext)
        && /keepSpawnPairs\(spawnPairs, pairs\)/.test(ext)
        && /index\.setSpawnIds\(kept\.pairs\);/.test(ext));
    ok('…fed by both doors that write a manifest without a task behind them',
        /for \(const b of termBindings\) \{/.test(ext)
        && /for \(const s of consoleHost\.list\(\)\) \{/.test(ext));
    ok('…at the moment the session id becomes known',
        ext.indexOf('publishSpawnIds();') > ext.indexOf('const publishSpawnIds'));
    // ‼️ AND IT IS NOT A SIXTH BINDING KIND. The behaviour that would break is
    // measured in test_launch_binding.js; this is the shape that keeps it true.
    ok('‼️ …through a channel that writes ONE field and no launcher',
        /setSpawnIds\(pairs: readonly \{ sessionId: string; launchId: string \}\[\]\): void/.test(sess)
        && /private applySpawnId\(info: SessionInfo\): void \{/.test(sess));
}

console.log(`test_turn_runtime: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
