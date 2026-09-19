// X-109 — THE ONE GATE A RESUME GOES THROUGH BEFORE IT SPAWNS.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. X-101 gave every adapter a
// `resumePolicy` and X-105 wrote the switch policy for a LIVE card, and for
// six releases NOTHING CALLED EITHER on a resume: every door resolved the route
// the way a fresh launch does — what was named, else the agent's STANDING
// route — so a session that ran on one route came back on whatever the agent
// stood on that day. The transcript carries no route on any engine (measured),
// so nothing could say which turns ran where. Four ways it goes wrong, each
// one held shut here:
//
//   1. THE STANDING ROUTE WINNING A RESUME. Nothing asked → the manifest's
//      route is pinned, the standing one is never consulted — and "ran with
//      none" is pinned to NONE, which is the case every resolver used to read
//      as "ask the agent".
//   2. LETTING CLAUDE MOVE. A different route asked for on a session-scoped
//      engine is refused with fork/new — the adapter's word, not this file's.
//   3. GUESSING A PROVIDER OFF A BARE MODEL ID. On OpenCode `big-pickle` can
//      be served by two providers; one match qualifies it, two refuse it.
//   4. A DOOR THAT FORGOT THE GATE. The wire is measured at the source: every
//      `consoleHost.start` that carries a resume, every terminal resume and the
//      task runner pass through `resumeRouteFor` / `opts.resumeRoute`.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const R = require(path.join(ROOT, 'out', 'core', 'resumeGate.js'));
const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const I = require(path.join(ROOT, 'out', 'core', 'providerIdentity.js'));

const PROFILES = [
    {
        id: 'kimi-work', label: 'Kimi (work)', engine: 'claude', providerId: 'kimi',
        baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
        tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }, revision: 3
    },
    {
        id: 'minimax-lab', label: 'MiniMax (lab)', engine: 'claude', providerId: 'minimax',
        baseUrl: 'https://api.minimax.io/anthropic', authKind: 'api-key',
        tiers: { opus: 'MiniMax-M2' }, revision: 1
    }
];
const J = o => JSON.stringify(o, null, 2);
const OC_VERBOSE = [
    'opencode/big-pickle',
    J({ id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle', cost: { input: 0, output: 0 }, limit: { context: 200000, output: 32000 }, capabilities: { reasoning: true }, variants: {}, status: 'active' }),
    'anthropic/claude-opus-5',
    J({ id: 'claude-opus-5', providerID: 'anthropic', name: 'Claude Opus 5', cost: { input: 5, output: 25 }, limit: { context: 200000 }, capabilities: { reasoning: true }, variants: {} }),
    // ‼️ the same bare id under a second provider — the ambiguity case
    'anthropic/big-pickle',
    J({ id: 'big-pickle', providerID: 'anthropic', name: 'Big Pickle (anthropic)', cost: { input: 1, output: 1 }, limit: { context: 1000 }, capabilities: {}, variants: {} })
].join('\n');

const deps = (over = {}) => ({ profiles: PROFILES, secretFor: () => 'sk-test', inheritedEnv: {}, ...over });
const claude = (over) => G.adapterFor('claude', deps(over));
const opencode = () => G.adapterFor('opencode', deps({ openCodeCatalogText: OC_VERBOSE }));
const codex = () => G.adapterFor('codex', deps());

const KIMI = {
    engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)', origin: 'agent-farm-profile',
    scope: 'session', providerProfileId: 'kimi-work', providerProfileRevision: 3,
    requestedModelRef: 'kimi-k2-thinking', proof: 'launch-declared'
};
const STANDING = { providerId: 'minimax-lab', tier: 'opus' };
const revisionOf = id => PROFILES.find(p => p.id === id)?.revision;

console.log('\n== X-109 — nothing asked: the route the session ran on is pinned, the standing one is not consulted ==');
{
    const r = R.resumeRoute(claude(), 'declared', { identity: KIMI, tier: 'opus' }, {}, STANDING, 'acp', { profileRevision: revisionOf });
    eq('‼️ a declared session resumed with nothing asked is PINNED', r.act, 'pinned');
    eq('…to the PROFILE it ran on, not the agent\'s standing route', r.providerId, 'kimi-work');
    eq('…with the tier it was launched at', r.tier, 'opus');
    eq('…and the spawn is told to take it as it is', r.pinned, true);
    ok('…in words that say the standing route was not consulted', /standing route is not consulted/.test(r.why));
    eq('…and the revision it ran at is the one it runs at now', r.revision && r.revision.moved, false);
    eq('…and `previous` names the vendor, the profile and the revision',
        r.previous, { providerId: 'kimi', profileId: 'kimi-work', revision: 3 });

    // ‼️ THE CASE EVERY RESOLVER USED TO GET WRONG: ran with no route, agent
    // now stands on one. "Nothing" is an answer and it is pinned.
    const none = R.resumeRoute(claude(), 'declared', { identity: { ...I.unknownIdentity('claude'), scope: 'session' } }, {}, STANDING);
    eq('‼️ a session that ran with NO route is pinned to none', none.act, 'pinned');
    eq('…providerId empty', none.providerId, '');
    eq('…and pinned: true, so an empty id is an instruction and not a fall-through', none.pinned, true);
    ok('…saying why the standing route is not applied', /ran with no route/.test(none.why) && /different program/.test(none.why));

    // The same profile asked for by name is the same pin.
    const same = R.resumeRoute(claude(), 'declared', { identity: KIMI, tier: 'opus' }, { providerId: 'kimi-work' }, STANDING, 'acp', { profileRevision: revisionOf });
    eq('asking for the route it ran on is a pin, not a switch', same.act, 'pinned');
    eq('…on that route', same.providerId, 'kimi-work');
    eq('…and an asked tier wins over the launched one',
        R.resumeRoute(claude(), 'declared', { identity: KIMI, tier: 'opus' }, { providerId: 'kimi-work', tier: 'sonnet' }, STANDING).tier, 'sonnet');
}

console.log('\n== X-109 — a different route on a session-scoped engine is REFUSED, and the refusal names what works ==');
{
    const r = R.resumeRoute(claude(), 'declared', { identity: KIMI }, { providerId: 'minimax-lab' }, STANDING);
    eq('‼️ Claude asked to resume on another route REFUSES', r.act, 'refuse');
    eq('…and the remedy is a fork — there is a conversation worth keeping', r.remedy, 'fork');
    ok('…in the adapter\'s words, naming the route and the program',
        /kimi/.test(r.why) && /different program/.test(r.why) && /[Ff]ork/.test(r.why));
    eq('…and nothing is pinned on a refusal', r.pinned, false);
    ok('…and describeResumeRoute leads with "not resumed"', /^not resumed — /.test(R.describeResumeRoute(r)));

    const intro = R.resumeRoute(claude(), 'declared', { identity: { ...I.unknownIdentity('claude'), scope: 'session' } }, { providerId: 'kimi-work' }, STANDING);
    eq('‼️ introducing a route into a session that ran with none is refused too', intro.act, 'refuse');
    eq('…with fork as the remedy', intro.remedy, 'fork');

    // ‼️ THE ROUTE IT RAN ON IS GONE — nothing to pin to, and nothing is guessed.
    const gone = R.resumeRoute(claude({ profiles: PROFILES.filter(p => p.id !== 'kimi-work') }), 'declared', { identity: KIMI }, {}, STANDING);
    eq('a session whose route is no longer set up is refused', gone.act, 'refuse');
    eq('…with fork as the remedy', gone.remedy, 'fork');
    ok('…naming the route and what is on offer', /kimi-work/.test(gone.why) && /minimax-lab/.test(gone.why));

    const bogus = R.resumeRoute(claude(), 'declared', { identity: KIMI }, { providerId: 'kimi' }, STANDING);
    eq('a shipped template is not a route a resume can be pointed at', bogus.act, 'refuse');
    ok('…and the refusal lists the profiles', /kimi-work, minimax-lab/.test(bogus.why));
}

console.log('\n== X-109 — the profile is RE-RESOLVED at its current revision, and the move is said ==');
{
    const ran = { ...KIMI, providerProfileRevision: 2 };
    const r = R.resumeRoute(claude(), 'declared', { identity: ran, tier: 'opus' }, {}, STANDING, 'acp', { profileRevision: revisionOf });
    eq('an edited profile still resumes — the pin is to the profile, re-resolved', r.act, 'pinned');
    eq('…and `revision` says it moved', r.revision, { recorded: 2, current: 3, moved: true });
    ok('…in words naming both revisions', /revision 3/.test(r.why) && /ran at 2/.test(r.why));
}

console.log('\n== X-109 — nothing recorded: nothing pinned, and the answer says which kind of nothing ==');
{
    const legacy = R.resumeRoute(claude(), 'legacy', {}, {}, STANDING);
    eq('a legacy session with nothing asked is UNBOUND', legacy.act, 'unbound');
    eq('…the standing route applies, as it always did', legacy.providerId, 'minimax-lab');
    eq('…and is NOT pinned — the spawn resolves it as a fresh launch would', legacy.pinned, false);
    ok('…and the words say launches were not recorded then', /before launches were recorded/.test(legacy.why) && /standing choice/.test(legacy.why));

    const askedLegacy = R.resumeRoute(claude(), 'legacy', {}, { providerId: 'kimi-work' }, STANDING);
    eq('a legacy session with a route asked runs on it', askedLegacy.providerId, 'kimi-work');
    eq('…pinned, because it was a deliberate ask', askedLegacy.pinned, true);
    ok('…and the words say "as asked"', /as asked/.test(askedLegacy.why));

    ok('an external session says it was not started by Agent Farm',
        /not started by Agent Farm/.test(R.resumeRoute(claude(), 'external', {}, {}, STANDING).why));
    ok('an unknown session says it is not in the index',
        /not in the index/.test(R.resumeRoute(claude(), 'unknown', {}, {}, STANDING).why));
    // ‼️ AND A BINDING THIS MODULE DOES NOT RECOGNISE SAYS SO, rather than
    // describing itself as bound. The decision below tests `=== 'declared'`, so
    // a default that claimed a launch record made the verdict's words and its
    // behaviour say opposite things — measured while writing X-117, where a
    // caller passing 'launch' was told it had a record and resumed as if it had
    // none, and the contradiction read as a product defect for an hour.
    ok('‼️ a binding nobody recognises does not claim to have a launch record',
        !/has a launch record/.test(R.resumeRoute(claude(), 'launch', {}, {}, STANDING).why));
    eq('…but an unknown route asked on any of them is still refused',
        R.resumeRoute(claude(), 'legacy', {}, { providerId: 'nope' }, STANDING).act, 'refuse');
}

console.log('\n== X-109 — OpenCode: a provider change is the engine\'s feature, recorded as a new identity ==');
{
    const OC = { engine: 'opencode', providerId: 'opencode', origin: 'engine-native', scope: 'turn', requestedModelRef: 'opencode/big-pickle', proof: 'engine-reported' };
    const sw = R.resumeRoute(opencode(), 'declared', { identity: OC }, { providerId: 'anthropic', model: 'anthropic/claude-opus-5' }, {});
    eq('‼️ OpenCode asked for another provider SWITCHES', sw.act, 'switch');
    eq('…to that provider', sw.providerId, 'anthropic');
    eq('…pinned for the spawn', sw.pinned, true);
    ok('…and the words say it is a new run identity beside the old turns', /new run identity/.test(sw.why) && /rewriting/.test(sw.why));

    // ‼️ THE MODEL CARRIES THE PROVIDER — and a bare id is resolved, never guessed.
    const one = R.resumeRoute(opencode(), 'declared', { identity: OC }, { model: 'claude-opus-5' }, {});
    eq('a bare model id served by ONE provider names it', one.act, 'switch');
    eq('…that provider', one.providerId, 'anthropic');
    eq('…and the model is sent QUALIFIED', one.model, 'anthropic/claude-opus-5');

    const two = R.resumeRoute(opencode(), 'declared', { identity: OC }, { model: 'big-pickle' }, {});
    eq('‼️ a bare model id served by TWO providers is REFUSED', two.act, 'refuse');
    ok('…naming both and the qualified form to use',
        /opencode, anthropic|anthropic, opencode/.test(two.why) && /opencode\/big-pickle|anthropic\/big-pickle/.test(two.why));

    const dis = R.resumeRoute(opencode(), 'declared', { identity: OC }, { providerId: 'opencode', model: 'anthropic/claude-opus-5' }, {});
    eq('a model naming one provider and a providerId naming another is refused', dis.act, 'refuse');
    ok('…saying they do not agree', /do not agree/.test(dis.why));

    // ‼️ THE MANIFEST NAMED NO PROVIDER, THE TURNS DID (X-108): the last
    // reported one is what the session ran on.
    const rep = R.resumeRoute(opencode(), 'declared',
        { identity: { ...I.unknownIdentity('opencode'), scope: 'turn' }, reportedProviderIds: ['opencode', 'opencode'] }, {}, { providerId: 'anthropic' });
    eq('with no declared provider the ENGINE-REPORTED one is pinned', rep.act, 'pinned');
    eq('…that one, not the standing one', rep.providerId, 'opencode');
    eq('…and previous names it', rep.previous.providerId, 'opencode');

    eq('qualifyModelRef leaves a qualified ref alone',
        R.qualifyModelRef(opencode(), 'opencode/big-pickle'), { model: 'opencode/big-pickle', providerId: 'opencode' });
    eq('…and an id nobody serves alone too, with no provider',
        R.qualifyModelRef(opencode(), 'gpt-9'), { model: 'gpt-9', providerId: '' });
}

console.log('\n== X-109 — an engine with no provider axis is answered, not excused ==');
{
    eq('nothing asked on Codex is "none"', R.resumeRoute(codex(), 'declared', {}, {}, {}).act, 'none');
    const r = R.resumeRoute(codex(), 'declared', {}, { providerId: 'kimi-work' }, {});
    eq('a route asked on Codex is refused by name', r.act, 'refuse');
    ok('…saying there is no axis', /no provider axis/.test(r.why));
}

console.log('\n== X-109 — the wire: every resume door passes through the gate (measured at the source) ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const between = (from, to) => {
        const a = ext.indexOf(from); const b = ext.indexOf(to, a + 1);
        if (a < 0 || b < 0) { return ''; }
        return ext.slice(a, b);
    };
    ok('‼️ console.start gates a resume with the caller\'s ask and passes the pin to the host',
        /resumeRouteFor\(resume, engine, agent\.id/.test(between("op: 'console.start'", "op: 'console.continueFromHandover'"))
        && /routePinned: true/.test(between("op: 'console.start'", "op: 'console.continueFromHandover'"))
        && /resumeRoute: gate/.test(between("op: 'console.start'", "op: 'console.continueFromHandover'")));
    ok('‼️ …and a live card handed back (S-29) is not gated',
        /!consoleHolds\(resume\)/.test(between("op: 'console.start'", "op: 'console.continueFromHandover'")));
    ok('‼️ the row\'s "Continue in Console" gates with NOTHING asked and pins',
        /resumeRouteFor\(s\.sessionId, engine, agent\?\.id \?\? '', \{\}, 'acp'\)/.test(between("registerCommand('agentfarm.resumeInConsole'", "registerCommand('agentfarm.consoleForAgent'"))
        && /routePinned: true/.test(between("registerCommand('agentfarm.resumeInConsole'", "registerCommand('agentfarm.consoleForAgent'")));
    ok('‼️ the row\'s terminal Resume gates with nothing asked and hands the engine AND the route to the terminal',
        /resumeRouteFor\(s\.sessionId, engine, ownerAgent\?\.id \?\? '', \{\}, 'tui'\)/.test(ext)
        && /engine, gatedRoute\(gate\)\);/.test(ext));
    ok('‼️ startClaudeSession gates a resume and --continue, unless the launch arrived pinned',
        /if \(!o\.routePinned && \(o\.resume \|\| o\.continueLast\)\)/.test(between('const startClaudeSession = (', 'live.onDidUpdate('))
        && /latestSessionIn\(agent\.dir, engine\)/.test(between('const startClaudeSession = (', 'live.onDidUpdate(')));
    ok('‼️ sessions.start gates with its own `provider=` argument and arrives pinned',
        /resumeRouteFor\(resumed\.sessionId/.test(between("op: 'sessions.start'", "op: 'sessions.lastLaunch'"))
        && /o\.routePinned = gated\.pinned/.test(between("op: 'sessions.start'", "op: 'sessions.lastLaunch'")));
    ok('‼️ the ended card\'s own Resume goes through the gate too — it used to pass no route at all',
        /resumeRouteFor\(s\.sessionId, \(s\.engine \|\| 'claude'\), s\.agentId, \{\}, 'acp'\)/
            .test(between("registerCommand('agentfarm.consoleResumeSession'", 'forgetLastWindow(s.sessionId)')));
    const revive = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consoleRevive.ts'), 'utf8');
    ok('‼️ a revived card carries its pin, so a reload cannot walk it onto the standing route',
        /if \(row\.routePinned\) \{ out\.routePinned = true; \}/.test(revive));
    ok('‼️ the task runner is handed the same gate',
        /resumeRoute: \(agentId, engine, sessionId, route\) => resumeRouteFor\(/.test(ext));
    ok('‼️ the resolver honours a pinned empty route instead of asking the agent\'s record',
        /const chosen = route\?\.pinned \|\| \(route\?\.providerId \?\? ''\)\.trim\(\)/.test(ext));
    ok('‼️ withAgentEngineDefaults does not fill a pinned route from the record',
        /providerId: \(o\.providerId \?\? ''\)\.trim\(\) \|\| \(pinned \? '' : route\.providerId\) \|\| ''/.test(ext));
    ok('‼️ the read-only op exists so the verdict can be seen before anything starts',
        /op: 'sessions\.resumeRoute'/.test(ext));
    const opBlock = between("op: 'sessions.resumeRoute'", "op: 'launch.profile.set'");
    ok('…and its contract names all five acts and the bare-id refusal',
        ['"pinned"', '"switch"', '"unbound"', '"none"', '"refuse"'].every(w => opBlock.includes(w))
        && /REFUSED when more than one provider serves it, never guessed/.test(opBlock)
        && /read only, nothing is started/.test(opBlock));
    ok('…and it answers through the SAME function the doors use',
        /const r = resumeRouteFor\(sessionId, engine, agent\?\.id \?\? '', \{/.test(opBlock));

    // ‼️ EVERY consoleHost.start THAT CARRIES A RESUME PASSES THE PIN. Walked
    // by balanced braces so a door added later is caught by shape, not by name.
    const calls = [];
    let at = 0;
    for (;;) {
        const i = ext.indexOf('consoleHost.start({', at);
        if (i < 0) { break; }
        let depth = 0, j = i + 'consoleHost.start('.length;
        for (; j < ext.length; j++) {
            if (ext[j] === '{') { depth++; } else if (ext[j] === '}') { depth--; if (depth === 0) { break; } }
        }
        calls.push({ line: ext.slice(0, i).split('\n').length, body: ext.slice(i, j + 1) });
        at = j;
    }
    const resuming = calls.filter(c => /\bresume[,:]/.test(c.body) && !/resume: undefined/.test(c.body));
    const unpinned = resuming.filter(c => !/routePinned/.test(c.body));
    ok('‼️ every consoleHost.start that resumes carries routePinned'
        + (unpinned.length ? ' (missing at line ' + unpinned.map(c => c.line).join(', ') + ')' : ''),
        resuming.length >= 2 && unpinned.length === 0);

    const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('‼️ the host passes the pin to the runtime on the first spawn AND on every re-spawn',
        (host.match(/pinned: init\.routePinned/g) || []).length >= 1
        && (host.match(/pinned: h\.state\.routePinned/g) || []).length >= 1
        && /routePinned: s\.routePinned/.test(host));
    const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    ok('‼️ the task runner gates a continuation before the manifest and reads the pin at both spawn shapes',
        /this\.opts\.resumeRoute\(/.test(tasks)
        && (tasks.match(/this\.spawnRouteOf\(task\)/g) || []).length === 2
        && !/engineRuntime\?\.\([^)]*routeOf\(task\)\)/.test(tasks));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
