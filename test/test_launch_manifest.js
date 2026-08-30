// X-102 — THE IMMUTABLE LAUNCH MANIFEST: what was true at the spawn, written
// before it, and never rewritten after.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. Measured against a real transcript on
// this machine (Claude Code 2.1.251, 1373 records), the JSONL carries sessionId,
// cwd, version, gitBranch, userType, entrypoint, permissionMode and promptSource
// — and nothing about which route served it, which profile revision was in
// force, which catalog the model came from, or what was REQUESTED as opposed to
// what came back. For every one of those the manifest is the only witness, so
// the three ways it can fail are what is held here:
//
//   1. IT COLLIDES. The acceptance line is about ten launches in one folder at
//      one moment, which is exactly the case a millisecond clock cannot tell
//      apart.
//   2. IT LEAKS. A manifest is written to disk, read by agents over the bridge
//      and carried into exports. A credential reaching it reaches all three.
//   3. IT FOLDS THE REQUEST INTO THE ANSWER. A run requested at `opus` and
//      served with something else must not read, a month later, as a run that
//      requested the other thing.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const M = require(path.join(ROOT, 'out', 'core', 'launchManifest.js'));

const IDENTITY = {
    engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)',
    origin: 'agent-farm-profile', scope: 'session',
    providerProfileId: 'kimi-work', providerProfileRevision: 3,
    route: { baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key' },
    requestedModelRef: 'kimi-k2-thinking', proof: 'launch-declared'
};

const base = (over = {}) => M.manifestFor({
    launchId: 'lch_abc123def', at: 1700000000000, engine: 'claude',
    identity: IDENTITY, catalogRevision: 'r7',
    options: { model: 'opus', tier: 'opus', effort: 'high', permissionMode: 'plan' },
    agentId: 'dev', agentName: 'developer', projectId: 'prj_1',
    mechanism: 'session', cwd: 'D:/zone/agent/ajanlar/developer', surface: 'terminal',
    ...over
});

console.log('\n== ten launches in one millisecond are ten launches ==');
{
    // ‼️ THE ACCEPTANCE LINE, AS THE GENERATOR'S PROBLEM. Ten spawns kicked off
    // by one loop share a millisecond routinely, so a clock-only id would hand
    // the binding ten identical handles and the "which run was this" question
    // would be unanswerable at exactly the moment it is being asked.
    const ids = [];
    for (let i = 0; i < 10; i++) { ids.push(M.newLaunchId(1700000000000)); }
    eq('ten ids taken in the same millisecond are all different',
        new Set(ids).size, 10);
    // …and even with a jammed random source, because the counter is the part
    // that cannot repeat within a run.
    const jammed = [];
    for (let i = 0; i < 10; i++) { jammed.push(M.newLaunchId(1700000000000, () => 0.5)); }
    eq('‼️ …and still all different when the random source repeats itself',
        new Set(jammed).size, 10);
    ok('an id is recognisable as ours', M.isLaunchId(ids[0]) && M.isLaunchId(jammed[9]));
    ok('‼️ …and something that is not ours is not silently accepted — a hand-edited '
        + 'record or a field from a future version must fail visibly',
        !M.isLaunchId('') && !M.isLaunchId('lch_') && !M.isLaunchId('abc')
        && !M.isLaunchId(undefined) && !M.isLaunchId('LCH_ABCDEFGHI'));
    ok('ids sort by time, so a list of them reads as a history',
        M.newLaunchId(1700000000000) < M.newLaunchId(1800000000000));
}

console.log('\n== the request is kept apart from the answer ==');
{
    const m = base();
    eq('what was ASKED FOR is recorded as asked',
        m.requested, { model: 'opus', tier: 'opus', effort: 'high', permissionMode: 'plan' });
    eq('‼️ …while what the ROUTE resolved it to lives on the identity, not folded '
        + 'into the request — a run requested at "opus" that an endpoint served '
        + 'with something else must not later read as a request for that something',
        [m.requested.model, m.identity.requestedModelRef], ['opus', 'kimi-k2-thinking']);
    eq('an unstated field is ABSENT, not an empty string — nobody can ask, years '
        + 'later, which of the two was meant',
        M.requestedOf({ model: '  ', effort: 'high' }), { effort: 'high' });
    eq('the catalog revision is recorded, so an old choice can be seen to have been '
        + 'valid when it was made', m.catalogRevision, 'r7');
    ok('…and an absent revision is absent rather than invented',
        M.manifestFor({
            launchId: 'lch_x', at: 1, engine: 'codex', identity: IDENTITY,
            options: {}, agentId: 'a', agentName: 'a', mechanism: 'task',
            cwd: 'D:/x', surface: 'headless'
        }).catalogRevision === undefined);
}

console.log('\n== it records the spawn, not a later opinion of it ==');
{
    const m = base();
    eq('the mechanism and the surface are two different questions and both are kept',
        [m.mechanism, m.surface], ['session', 'terminal']);
    ok('‼️ there is NO sessionId field — it is not knowable before the spawn on any '
        + 'engine here, so it belongs to the binding, which is the record that is '
        + 'allowed to learn. A mutable field on an immutable record is how '
        + '"immutable" quietly stops being true',
        !('sessionId' in m));
    ok('the folder is the one the process was spawned in, carried verbatim',
        m.cwd === 'D:/zone/agent/ajanlar/developer');
    eq('the discipline is recorded when it was decided, and absent when it was not',
        [base({ superpowers: true }).superpowers, m.superpowers], [true, undefined]);
}

console.log('\n== and nothing that could be a credential can reach it ==');
{
    eq('‼️ a well-formed manifest leaks nothing — every field is a name, an id, a '
        + 'revision or a KIND', M.manifestLeaks(base()), []);
    // ‼️ THE EXCEPTION, NAMED. `authKind` is the KIND of sign-in, which X-100
    // kept precisely so nobody has to look at the credential to answer "how does
    // this route authenticate". A blanket name rule would flag it and teach the
    // next person to weaken the rule instead of trusting it.
    ok('…and `authKind` is not mistaken for one',
        M.manifestLeaks({ route: { authKind: 'api-key' } }).length === 0);
    eq('‼️ a field that COULD hold one is named, wherever it is nested — a record '
        + 'can arrive from an older version or a hand-edited file, which is exactly '
        + 'what a type cannot catch',
        M.manifestLeaks({ identity: { route: { apiKey: 'sk-live' } } }),
        ['identity.route.apiKey']);
    eq('…and the whole family of names is caught, not just the obvious one',
        M.manifestLeaks({
            token: 1, secret: 1, password: 1, authorization: 1, bearer_token: 1,
            'anthropic-api-key': 1, credentials: 1
        }).sort(),
        ['anthropic-api-key', 'authorization', 'bearer_token', 'credentials',
            'password', 'secret', 'token'].sort());
    ok('an ordinary field is not flagged just for sounding technical',
        M.manifestLeaks({ providerId: 'kimi', keyboard: 1, monkey: 1 }).length === 0);
}

console.log('\n== the line a person reads names the route AND the request ==');
{
    ok('‼️ both, because that pair is what the manifest exists to keep apart: a line '
        + 'saying only "opus" is true of two runs on two endpoints costing two '
        + 'different amounts',
        M.describeManifest(base()) === 'claude · Kimi (work) · tier opus · opus · high · terminal');
    const bare = base({
        identity: {
            engine: 'claude', providerId: '', origin: 'legacy', scope: 'session',
            requestedModelRef: '', proof: 'none'
        },
        options: {}
    });
    // ‼️ NO ROUTE READS AS INHERITED, NEVER AS "DEFAULT". Nothing was injected
    // and nothing was cleared, so the run took whatever the window carried — and
    // that may already have named an endpoint. The MODEL is separately allowed
    // to say "default model", which is why this asserts the exact line rather
    // than hunting for the word anywhere in it.
    eq('‼️ no route reads as INHERITED, and the word "default" is left to the model',
        M.describeManifest(bare), 'claude · inherited route · default model · terminal');
    const none = base({
        engine: 'gemini',
        identity: {
            engine: 'gemini', providerId: '', origin: 'not-applicable', scope: 'session',
            requestedModelRef: '', proof: 'none'
        }
    });
    ok('‼️ …but an engine with NO provider axis spends no column on saying so — that '
        + 'is a permanent state of four of the five engines',
        /inherited route/.test(M.describeManifest(none)) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
