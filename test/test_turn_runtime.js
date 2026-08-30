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

    // ‼️ ON CLAUDE THIS CANNOT FIRE, because the transcript names no route at
    // all — measured. An empty reported list is not a disagreement.
    const claude = T.turnRuntimes(manifest(CLAUDE_ROUTE, { model: 'opus' }), 'claude',
        [{ n: 1, models: ['kimi-k2-thinking'] }]);
    ok('a Claude turn names no provider, so it cannot contradict one',
        claude[0].providerConflict === false);
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
    ok('…and joined to the models the transcript really reports',
        /turnRuntimes\(manifest, engine,/.test(ext)
        && /\(s\.turns \?\? \[\]\)\.map\(t => \(\{ n: t\.n, models: t\.models \}\)\)/.test(ext));
    // ‼️ THE DESCRIBE IS PART OF THE FEATURE. An agent reading `farm.ops` decides
    // what an answer MEANS from this text, and `unproven` read as "wrong" would
    // turn an alias into a bug report.
    ok('…and the describe says out loud that "unproven" is not an accusation',
        /is NOT proof of a fault/.test(ext) && /never "this ran on the wrong thing"/.test(ext));
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
}

console.log(`test_turn_runtime: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
