// X-103 — THE START-SESSION FORM, DRAWN BY THE ADAPTER RATHER THAN BY THE FORM.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. X-101 built one entrance for
// resolving a launch's runtime and then left the CHOICE unreachable: a route was
// picked by hand-editing settings.json. This item draws the form — engine ->
// provider -> model/tier -> variant — and the three ways it can lie are what is
// held here:
//
//   1. OFFERING WHAT CANNOT RUN. The Claude catalog carries shipped route
//      TEMPLATES beside the user's own profiles. A template has no id to hold a
//      credential under; picked, it resolves to `unknown` identity and injects
//      NOTHING, so the session runs on whatever the shell was carrying while the
//      row says "Kimi". That is the exact lie X-101 exists to prevent.
//   2. LEAVING A ROW BELOW SILENTLY WRONG. A tier belongs to a route and a model
//      belongs to a provider; changing the row above must drop what the new one
//      does not offer, and SAY it dropped it.
//   3. OFFERING A CONTROL THE DOOR CANNOT CARRY. Measured against the installed
//      CLI: `opencode run --variant` exists, the bare TUI's --help has no such
//      flag, and ACP declares only model and mode. So the same model publishes
//      low/medium/high and the honest answer differs BY TRANSPORT.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const F = require(path.join(ROOT, 'out', 'core', 'launchProvider.js'));
const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const L = require(path.join(ROOT, 'out', 'core', 'launch.js'));
const A = require(path.join(ROOT, 'out', 'core', 'agentDefaults.js'));

// Two of the three Claude routes the X-97 family names, as X-100 stores them.
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

// ‼️ REAL `opencode models --verbose` OUTPUT, trimmed to three models — the
// shape measured off the installed CLI (1.18.19), bare id line then the JSON.
// Two of the three publish variants and one publishes none, which is the whole
// reason the variant row is asked per MODEL rather than per engine.
const OC_VERBOSE = [
    'opencode/big-pickle',
    JSON.stringify({
        id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle',
        cost: { input: 0, output: 0 }, limit: { context: 200000, output: 32000 },
        capabilities: { reasoning: true }, variants: {}, status: 'active'
    }, null, 2),
    'opencode/nemotron-3.5-lightning-free',
    JSON.stringify({
        id: 'nemotron-3.5-lightning-free', providerID: 'opencode', name: 'Nemotron Lightning',
        cost: { input: 0, output: 0 }, limit: { context: 128000 },
        capabilities: { reasoning: true },
        variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } }
    }, null, 2),
    'anthropic/claude-opus-5',
    JSON.stringify({
        id: 'claude-opus-5', providerID: 'anthropic', name: 'Claude Opus 5',
        cost: { input: 5, output: 25 }, limit: { context: 200000 },
        capabilities: { reasoning: true }, variants: { max: { reasoningEffort: 'max' } }
    }, null, 2)
].join('\n');

const deps = (over = {}) => ({
    profiles: PROFILES, secretFor: () => 'sk-test', inheritedEnv: {}, ...over
});
const claude = () => G.adapterFor('claude', deps());
const opencode = () => G.adapterFor('opencode', deps({ openCodeCatalogText: OC_VERBOSE }));
const ids = list => list.map(c => c.id);

console.log('\n== X-103 — the form comes from the adapter ==');
{
    // ---- 1. only what can actually run is offered ----
    const f = F.launchProviderForm(claude());
    ok('the Claude form applies and calls its first row a ROUTE',
        f.applies === true && f.noun === 'Route');
    eq('‼️ and it offers the two PROFILES, not the shipped templates — a template '
        + 'has no credential behind it, so a launch on one would inject nothing '
        + 'while the row named a vendor',
        ids(f.providers), ['', 'kimi-work', 'minimax-lab']);
    ok('…the shipped route ids are absent by name',
        !ids(f.providers).includes('kimi') && !ids(f.providers).includes('anthropic'));
    ok('the empty row is the one that means "leave it alone"',
        f.providers[0].id === '' && /nothing injected/i.test(f.providers[0].detail));
    ok('a Claude route is fixed for the session, and the row says so',
        f.scope === 'session' && /forks/.test(f.scopeNote));

    // ---- the tier row belongs to the route above it ----
    const kimi = F.launchProviderForm(claude(), { providerId: 'kimi-work' });
    eq('the tier list is the ROUTE\'s own mapping', ids(kimi.sub.choices), ['', 'opus', 'sonnet']);
    ok('…and the row names the model that tier really serves',
        kimi.sub.kind === 'tier'
        && kimi.sub.choices.some(c => c.id === 'opus' && /kimi-k2-thinking/.test(c.detail)));
    const mm = F.launchProviderForm(claude(), { providerId: 'minimax-lab' });
    eq('a different route means different tiers under the same word',
        ids(mm.sub.choices), ['', 'opus']);
    eq('‼️ …and with no route chosen there is NO tier row at all — the word has no '
        + 'referent until a route answers it',
        F.launchProviderForm(claude()).sub.kind, 'none');

    // ---- nothing to pick says WHY ----
    const bare = F.launchProviderForm(G.adapterFor('claude', deps({ profiles: [] })));
    ok('‼️ an empty list is never an empty picker: it names the fix',
        /Providers page/.test(bare.empty || '') && /SHAPES, not sign-ins/.test(bare.empty || ''));
}

console.log('\n== the other engine means something else by the same rows ==');
{
    const f = F.launchProviderForm(opencode());
    ok('OpenCode calls its first row a PROVIDER, and the pick is turn-scoped',
        f.noun === 'Provider' && f.scope === 'turn' && /turn boundary/.test(f.scopeNote));
    eq('the providers are the engine\'s own, read out of its catalog',
        ids(f.providers), ['', 'opencode', 'anthropic']);
    const oc = F.launchProviderForm(opencode(), { providerId: 'opencode' });
    eq('‼️ the row under it is a MODEL, narrowed to that provider — and the refs are '
        + 'the engine\'s own wire spelling, never assembled from parts',
        ids(oc.sub.choices), ['', 'opencode/big-pickle', 'opencode/nemotron-3.5-lightning-free']);
    ok('…and the row carries the figures the engine published',
        oc.sub.choices.some(c => c.id === 'opencode/big-pickle'
            && /200K context/.test(c.detail) && /free/.test(c.detail)));
    eq('a different provider publishes different models',
        ids(F.launchProviderForm(opencode(), { providerId: 'anthropic' }).sub.choices),
        ['', 'anthropic/claude-opus-5']);
    eq('‼️ an unread catalog offers nothing and says it has not asked, which is a '
        + 'different fact from "the engine has none"',
        /has not been asked/.test(F.launchProviderForm(G.adapterFor('opencode', deps())).empty || ''),
        true);
}

console.log('\n== the variant row is a question about the TRANSPORT ==');
{
    const pick = { providerId: 'opencode', model: 'opencode/nemotron-3.5-lightning-free' };
    eq('on a headless run the model\'s published variants are offered',
        ids(F.launchProviderForm(opencode(), pick, 'run').variants), ['', 'low', 'high']);
    const tui = F.launchProviderForm(opencode(), pick, 'tui');
    ok('‼️ in a TERMINAL there is no variant row — measured: the bare TUI takes no '
        + '--variant flag — and the form SAYS so rather than looking like the model has none',
        tui.variants.length === 0 && /TUI takes no --variant/.test(tui.variantsWhy || ''));
    const acp = F.launchProviderForm(opencode(), pick, 'acp');
    ok('…and on a hosted card the reason is ACP\'s own vocabulary, not the TUI\'s',
        acp.variants.length === 0 && /ACP declares only model and mode/.test(acp.variantsWhy || ''));
    eq('‼️ a model that publishes none offers none on ANY transport — the answer is '
        + 'per model, not per engine',
        ids(F.launchProviderForm(opencode(),
            { providerId: 'opencode', model: 'opencode/big-pickle' }, 'run').variants), []);
    eq('Claude draws no variant row at all: its reasoning axis is --effort, and two '
        + 'controls for one question is one too many',
        F.launchProviderForm(claude(), { providerId: 'kimi-work' }, 'run').variants, []);
}

console.log('\n== changing a row above drops what is below — out loud ==');
{
    const r = F.pruneProviderPick(claude(), { providerId: 'minimax-lab', tier: 'sonnet' });
    eq('a tier the new route does not map is dropped', r.pick, { providerId: 'minimax-lab' });
    ok('…and the drop names the tiers that ARE mapped',
        r.dropped.length === 1 && r.dropped[0].field === 'tier' && /opus/.test(r.dropped[0].why));
    ok('the sentence a person reads says what went and why',
        /tier .sonnet. dropped/.test(F.describeDropped(r.dropped)));

    const keep = F.pruneProviderPick(claude(), { providerId: 'kimi-work', tier: 'sonnet' });
    eq('a tier the route DOES map survives untouched',
        [keep.pick.providerId, keep.pick.tier, keep.dropped.length], ['kimi-work', 'sonnet', 0]);

    const ghost = F.pruneProviderPick(claude(), { providerId: 'kimi', tier: 'opus' });
    eq('‼️ a route id that is a shipped TEMPLATE rather than a profile is dropped, and '
        + 'its tier goes with it — this is the settings.json a person hand-wrote',
        ghost.pick, {});
    ok('…and the tier is not reported as a second mystery, only the route it hung on',
        ghost.dropped.some(d => d.field === 'providerId'));

    const model = F.pruneProviderPick(opencode(),
        { providerId: 'anthropic', model: 'opencode/big-pickle' });
    eq('a model the newly chosen provider does not serve is dropped',
        model.pick, { providerId: 'anthropic' });
    ok('…and the reason names the provider that does not publish it',
        /anthropic does not publish it/.test(model.dropped[0].why));

    const variant = F.pruneProviderPick(opencode(),
        { providerId: 'opencode', model: 'opencode/nemotron-3.5-lightning-free', variant: 'low' },
        'tui');
    eq('‼️ a variant the TRANSPORT cannot carry is dropped, not sent to a flag that '
        + 'does not exist',
        variant.pick, { providerId: 'opencode', model: 'opencode/nemotron-3.5-lightning-free' });
    ok('…and the reason is the transport\'s, not a lie about the model',
        /TUI takes no --variant/.test(variant.dropped[0].why));

    const gemini = F.pruneProviderPick(G.adapterFor('gemini', deps()),
        { providerId: 'kimi-work', tier: 'opus', model: 'gemini-3-pro' });
    eq('‼️ on an engine with no provider axis the provider fields go and the MODEL '
        + 'stays — --model is not a provider-axis value, and dropping it would empty '
        + 'the box of every engine without an adapter',
        gemini.pick, { model: 'gemini-3-pro' });
    ok('…and both dropped fields say the axis does not exist here',
        gemini.dropped.length === 2 && gemini.dropped.every(d => /no provider axis/.test(d.why)));

    // Nothing chosen changes nothing — the permanent state of four engines.
    eq('an empty pick is left exactly as it is',
        F.pruneProviderPick(claude(), {}), { pick: {}, dropped: [] });
}

console.log('\n== "Default" is a word with a referent ==');
{
    const f = F.launchProviderForm(claude());
    const chosen = F.describeProviderChoice(f, 'kimi-work', 'minimax-lab');
    eq('what this launch says wins, and the row names its label not its id',
        [chosen.value, chosen.origin], ['Kimi (work)', 'launch']);
    const stored = F.describeProviderChoice(f, '', 'minimax-lab');
    eq('with nothing chosen the AGENT\'s standing route is what will run, and it says so',
        [stored.value, stored.origin], ['MiniMax (lab)', 'agent']);
    ok('…and it names the setting a reader would go and look at',
        /agentEngineDefaults/.test(stored.note));
    const none = F.describeProviderChoice(f, '', '');
    eq('‼️ nothing anywhere is NOT "Anthropic" — it is inheritance, and the note says '
        + 'the window\'s environment may already name an endpoint',
        [none.value, none.origin], ['none', 'none']);
    ok('…in those words', /inherits whatever/.test(none.note));
}

console.log('\n== the pick travels as the adapter\'s own vocabulary ==');
{
    eq('empty fields are LEFT OUT, not sent as empty strings',
        F.providerSelectionOf('claude', { providerId: 'kimi-work', tier: '', model: '' }),
        { engine: 'claude', providerId: 'kimi-work' });
    eq('a model becomes `modelId`, which is what the adapters read',
        F.providerSelectionOf('opencode', { providerId: 'opencode', model: 'opencode/big-pickle' }),
        { engine: 'opencode', providerId: 'opencode', modelId: 'opencode/big-pickle' });
    // ‼️ THE POINT OF THE WHOLE MODULE: what the form produced is what the
    // registry accepts. A vocabulary the adapter would answer `undefined` to is
    // a form that draws choices nothing can run.
    const sel = F.providerSelectionOf('claude', { providerId: 'kimi-work', tier: 'opus' });
    ok('‼️ and the registry recognises it — the form and the runtime speak one language',
        !!claude().normalizeSelection(sel));
    const rt = G.resolveRuntime('claude', sel, deps());
    ok('…resolving to the route\'s own identity, tier resolved through the profile',
        rt.identity.providerId === 'kimi' && rt.identity.requestedModelRef === 'kimi-k2-thinking');
}

console.log('\n== the launch vocabulary carries it, and says it out loud ==');
{
    eq('a route with no model still refuses nothing on shape alone',
        L.validateLaunch({ engine: 'claude', providerId: 'kimi-work', tier: 'opus' }), []);
    ok('‼️ a tier with NO route is refused — the route is what decides which model '
        + 'the word means, so alone it names nothing and would be silently ignored',
        L.validateLaunch({ engine: 'claude', tier: 'opus' })
            .some(e => /tier "opus" needs a route/.test(e)));
    ok('an id that could smuggle shell syntax is refused before anything spawns',
        L.validateLaunch({ providerId: 'kimi; rm -rf /' }).some(e => /not a valid id/.test(e)));

    eq('‼️ the summary names the route BESIDE THE ENGINE — two sessions on "opus" that '
        + 'ran on different endpoints must not read identically',
        L.launchSummary({ engine: 'claude', model: 'opus', providerId: 'kimi-work', tier: 'sonnet' },
            { provider: 'Kimi (work)' }),
        'Claude Code · Kimi (work) (sonnet) · opus · no project');
    ok('…and a launch with no route spends no column on saying so',
        L.launchSummary({ engine: 'claude', model: 'opus' }) === 'Claude Code · opus · no project');
    ok('the setup line names it too, falling back to the id when no label was resolved',
        /kimi-work \(opus\)/.test(L.describeLaunch({ providerId: 'kimi-work', tier: 'opus' })));
}

console.log('\n== the memory files a route under the engine it belongs to ==');
{
    const kept = L.launchToRemember(
        { engine: 'claude', model: 'opus', providerId: 'kimi-work', tier: 'sonnet' }, 'terminal');
    eq('‼️ a route is remembered PER ENGINE — a Claude profile id means nothing to '
        + 'OpenCode, and a flat record would carry it across on the first switch',
        [kept.byEngine.claude.providerId, kept.byEngine.claude.tier], ['kimi-work', 'sonnet']);
    const back = L.withLastLaunch({ engine: 'claude' }, kept);
    eq('…and it comes back, so the second session on that route is one Enter',
        [back.providerId, back.tier], ['kimi-work', 'sonnet']);
    const other = L.withLastLaunch({ engine: 'opencode' }, kept);
    ok('‼️ …but NOT onto the other engine, which has no row of its own here',
        !other.providerId);
    eq('what this launch states still beats what was remembered',
        L.withLastLaunch({ engine: 'claude', providerId: 'minimax-lab' }, kept).providerId,
        'minimax-lab');
}

console.log('\n== and the writer stops eating the route ==');
{
    const store = { 'd:/zone/agent/dev': { claude: { providerId: 'kimi-work', tier: 'opus' } } };
    const after = A.withAgentDefault(store, 'D:\\zone\\agent\\dev', 'claude', { model: 'sonnet' });
    eq('‼️ WRITING A MODEL NO LONGER DELETES THE ROUTE IN THE SAME RECORD — this is '
        + 'what happened to every route hand-written into settings.json the moment '
        + 'somebody touched the model box in Farm Settings',
        after['d:/zone/agent/dev'].claude,
        { model: 'sonnet', providerId: 'kimi-work', tier: 'opus' });
    eq('…and the route is still readable by its own reader',
        A.storedRoute(after, 'D:\\zone\\agent\\dev', 'claude'),
        { providerId: 'kimi-work', tier: 'opus' });
    const cleared = A.withAgentDefault(after, 'd:/zone/agent/dev', 'claude', { providerId: '' });
    eq('an empty value still CLEARS — an absent record is what makes the next layer apply',
        cleared['d:/zone/agent/dev'].claude, { model: 'sonnet', tier: 'opus' });
    const gone = A.withAgentDefault(
        { 'd:/x': { claude: { providerId: 'kimi-work' } } }, 'd:/x', 'claude', { providerId: '' });
    eq('…and the last field going takes the whole row with it', gone, {});
}

console.log('\n== and the doors really offer it ==');
{
    // ‼️ SOURCE-SCANNED, like the rest of this family. The form above is pure
    // and provable; whether the LAUNCHER draws it is a fact about a file, and it
    // is exactly the half that was missing after X-101 — a resolver nothing
    // could reach.
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the launcher asks the ADAPTER for its rows, on every redraw — every row '
        + 'below the provider depends on the one above it',
        /const providerFormFor = \(/.test(ext)
        && /const form = providerFormFor\(engineOf\(merged\.engine\)\.id, \{/.test(ext));
    ok('…and the route row is drawn only where the engine HAS the axis',
        /\.\.\.\(form\.applies \? \[\{/.test(ext) && /act: 'provider'/.test(ext));
    ok('…the tier row only where the route maps tiers',
        /\.\.\.\(form\.sub\.kind === 'tier' \? \[\{/.test(ext));
    ok('‼️ …and the variant row only where the TRANSPORT can carry one, with the '
        + 'reason shown when it cannot',
        /\.\.\.\(form\.variants\.length \? \[\{/.test(ext)
        && /\.\.\.\(form\.variantsWhy \? \[\{/.test(ext));
    ok('‼️ the transport is WHERE the session opens, not the engine — a terminal is '
        + 'a TUI and the Console is ACP, and neither takes --variant',
        /const transport: ProviderTransport = where === 'console' \? 'acp' : 'tui';/.test(ext));
    // ‼️ THREE CHANGE POINTS, and they are the three rows that decide something
    // below them: the engine (the axis itself), the route (the tiers and the
    // models under it) and the model (the variants it publishes). A fourth row
    // gaining a dependent one and not appearing here is what this count catches.
    // ‼️ COUNTED BY THE LAUNCHER'S OWN CALL SHAPE, not by every use in the file.
    // X-105 gave the same pruner to two more callers — the Console composer's
    // route box (through `ConsoleDeps.prunePick`) and `console.start`, which
    // REFUSES rather than keeps — and a bare `prunedPick(` count then measured
    // "how many places use this" instead of "the three launcher rows that decide
    // something below them". The three are the ones that keep what survived.
    ok('‼️ changing the engine, the route or the model PRUNES what is below it, out loud',
        (ext.match(/const kept = prunedPick\(/g) || []).length === 3
        && /showInformationMessage\(`Agent Farm: \$\{describeDropped\(r\.dropped\)\}`\)/.test(ext));
    // ‼️ X-105 — AND THE COMPOSER IS A FOURTH DOOR ONTO THE SAME ROWS, so it
    // prunes through the same function rather than deciding for itself what a
    // route may carry. Its own two change points (picking a route, and moving
    // the engine underneath one) go through one place — see `prunedRoute`.
    {
        const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8');
        ok('…and so does the Console composer, through the engine\'s own adapter',
            /this\.deps\.prunePick\?\.\(engine, pick, 'acp'\)/.test(panel)
            && (panel.match(/this\.prunedRoute\(/g) || []).length >= 2);
        ok('‼️ …asking as ACP, because that is what a hosted card really is — a form '
            + 'asked as a TUI would offer a control this panel then drops',
            /providerForm\?\.\(\s*\n?\s*engineOf\(this\.chosenEngine\(\)\)\.id, this\.composerRoute \?\? \{\}, 'acp'\)/.test(panel));
    }
    ok('the model list becomes the PROVIDER\'s once the engine publishes one',
        /const catalogued = form\.sub\.kind === 'model' && form\.sub\.choices\.length;/.test(ext));
    ok('‼️ "Default" on the route row names its real value AND where it came from',
        /const routeSaid = describeProviderChoice\(/.test(ext));
    // ‼️ AND THE LAYER, so a launch that says nothing still lands on the agent's
    // standing route rather than on nothing at all.
    ok('the agent\'s stored route is a layer under the launch, like the model is',
        /const route = storedRoute\(store, agent\.dir, engine\);/.test(ext)
        && /providerId: \(o\.providerId \?\? ''\)\.trim\(\) \|\| route\.providerId \|\| '',/.test(ext));
    // ‼️ THE ONE ARG NAME THAT DIFFERS FROM ITS FIELD, and it differs on purpose.
    ok('the bridge takes `provider` and stores `providerId`, translated once',
        /providerId: optStr\(args, 'provider'\)/.test(ext));

    const prof = fs.readFileSync(path.join(ROOT, 'src', 'core', 'launchProfiles.ts'), 'utf8');
    ok('‼️ a saved profile stores the whole form, route included — two setups that '
        + 'differ only in endpoint must not be indistinguishable',
        /'providerId', 'tier',/.test(prof));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
