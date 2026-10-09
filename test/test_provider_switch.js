// X-105 — MAY THIS CONVERSATION CHANGE WHO SERVES IT, AND WHEN.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. The item's second sentence is a
// POLICY, and a policy that lives in prose is enforced by whoever remembers it.
// Three ways it can go wrong, and each one is a real defect this file holds
// shut:
//
//   1. LETTING CLAUDE MOVE. Measured in August: resuming one session through a
//      different route mixed two routes' models into a single transcript, and
//      the transcript could not say which served which turn. A mid-conversation
//      route change is that defect with no resume in it. It must be REFUSED,
//      and the refusal must name what does work — a fork or a new session —
//      because a no with nothing after it leaves a caller stuck.
//   2. REFUSING OPENCODE. The engine publishes `session/set_config_option` and
//      genuinely allows the change at a turn boundary. Refusing it would be
//      Agent Farm overruling a feature of the engine it is hosting.
//   3. SPELLING EITHER ANSWER WITH AN ENGINE'S NAME. `if (engine === 'claude')`
//      is a second statement of a rule the adapter already makes, and the sixth
//      engine gets the wrong answer from it silently. Everything here is
//      reached through `providerScope` and `canSwitchProviderAtTurnBoundary`.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const S = require(path.join(ROOT, 'out', 'core', 'providerSwitch.js'));
const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));

// The same two Claude routes and the same real `opencode models --verbose`
// shape the launch-form suite uses — one vocabulary across the family.
const PROFILES = [
    {
        id: 'kimi-work', label: 'Kimi (work)', engines: ['claude'], providerId: 'kimi',
        baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
        tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }, revision: 3
    },
    {
        id: 'minimax-lab', label: 'MiniMax (lab)', engines: ['claude'], providerId: 'minimax',
        baseUrl: 'https://api.minimax.io/anthropic', authKind: 'api-key',
        tiers: { opus: 'MiniMax-M2' }, revision: 1
    }
];
const OC_VERBOSE = [
    'opencode/big-pickle',
    JSON.stringify({
        id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle',
        cost: { input: 0, output: 0 }, limit: { context: 200000, output: 32000 },
        capabilities: { reasoning: true }, variants: {}, status: 'active'
    }, null, 2),
    'anthropic/claude-opus-5',
    JSON.stringify({
        id: 'claude-opus-5', providerID: 'anthropic', name: 'Claude Opus 5',
        cost: { input: 5, output: 25 }, limit: { context: 200000 },
        capabilities: { reasoning: true }, variants: {}
    }, null, 2)
].join('\n');

const deps = (over = {}) => ({
    profiles: PROFILES, secretFor: () => 'sk-test', inheritedEnv: {}, ...over
});
const claude = () => G.adapterFor('claude', deps());
const opencode = () => G.adapterFor('opencode', deps({ openCodeCatalogText: OC_VERBOSE }));
const codex = () => G.adapterFor('codex', deps());

console.log('\n== X-105 — a session-scoped provider does not move, and says what does ==');
{
    const v = S.providerSwitchPolicy(
        claude(), { providerId: 'kimi-work' }, { providerId: 'minimax-lab' },
        { turnRunning: false, resumable: true });
    eq('‼️ a Claude route change mid-conversation is REFUSED, not applied and not dropped',
        v.act, 'refuse');
    eq('…and the card stays on the route it really runs on', v.providerId, 'kimi-work');
    eq('‼️ …and the refusal names the way that DOES work — the item says new/fork, '
        + 'and a no with nothing after it leaves the caller nowhere',
        v.remedy, 'fork');
    ok('…in words a person can read, naming the route it is on',
        /kimi-work/.test(v.why) && /different program/.test(v.why) && /[Ff]ork/.test(v.why));

    const fresh = S.providerSwitchPolicy(
        claude(), { providerId: 'kimi-work' }, { providerId: 'minimax-lab' },
        { turnRunning: false, resumable: false });
    eq('‼️ with nothing to fork FROM the remedy is a NEW session — a fork of a card '
        + 'the engine never named an id for is a door that cannot open',
        fresh.remedy, 'new');

    eq('the same route asked for again is UNCHANGED, which is neither a success nor a failure',
        S.providerSwitchPolicy(claude(), { providerId: 'kimi-work' }, { providerId: 'kimi-work' }).act,
        'unchanged');
    eq('asking for nothing changes nothing',
        S.providerSwitchPolicy(claude(), { providerId: 'kimi-work' }, {}).act, 'unchanged');

    const bogus = S.providerSwitchPolicy(claude(), { providerId: 'kimi-work' }, { providerId: 'kimi' });
    eq('‼️ a shipped TEMPLATE is not a route that can be switched to — it has no '
        + 'credential behind it, so a card on one would run on whatever the shell carried',
        bogus.act, 'refuse');
    ok('…and the refusal lists what there actually is',
        /kimi-work/.test(bogus.why) && /minimax-lab/.test(bogus.why));
}

console.log('\n== …and a turn-scoped one moves, at the boundary the engine names ==');
{
    const idle = S.providerSwitchPolicy(
        opencode(), { providerId: 'opencode' }, { providerId: 'anthropic' },
        { turnRunning: false });
    eq('with nothing running the change is in force from the next turn', idle.act, 'now');
    eq('…and it names the provider the session is on afterwards', idle.providerId, 'anthropic');
    ok('…and says the earlier turns keep the one they ran on',
        /new turn identity/.test(idle.why));

    const busy = S.providerSwitchPolicy(
        opencode(), { providerId: 'opencode' }, { providerId: 'anthropic' },
        { turnRunning: true });
    eq('‼️ a turn that is RUNNING holds the change to its boundary — the engine '
        + 'declares no way to change the provider of a turn under way, and doing '
        + 'it anyway is how one answer changes model half way through',
        busy.act, 'turn-boundary');
    ok('…and the held change says so, and says it becomes a new turn identity',
        /when this turn ends/.test(busy.why) && /new turn identity/.test(busy.why));

    // ---- the model can be the thing that names the provider ----
    const byModel = S.providerSwitchPolicy(
        opencode(), { providerId: 'opencode' }, { model: 'anthropic/claude-opus-5' },
        { turnRunning: false });
    eq('‼️ on this engine the MODEL carries the provider, so a model change to '
        + 'another provider is the same switch and is answered as one',
        [byModel.act, byModel.providerId], ['now', 'anthropic']);
    eq('…and a model under the SAME provider is not a switch at all',
        S.providerSwitchPolicy(opencode(), { providerId: 'opencode' },
            { model: 'opencode/big-pickle' }).act,
        'unchanged');
    eq('‼️ a prefix the engine never published is NOT a provider — the whole string '
        + 'is the model, which is the honest reading of a name nobody vouched for',
        S.providerSwitchPolicy(opencode(), { providerId: 'opencode' },
            { model: 'made-up/whatever' }).act,
        'unchanged');
}

console.log('\n== an engine with no provider axis is answered, not excused ==');
{
    eq('‼️ a provider named for an engine that has none is refused BY NAME — this is '
        + 'the Claude-shaped field riding along on a Codex run (X-98)',
        S.providerSwitchPolicy(codex(), {}, { providerId: 'kimi-work' }).act, 'refuse');
    ok('…and it says why rather than failing silently',
        /no provider axis/.test(S.providerSwitchPolicy(codex(), {}, { providerId: 'x' }).why));
    eq('asking for no provider on such an engine is simply unchanged',
        S.providerSwitchPolicy(codex(), {}, { model: 'gpt-5.5' }).act, 'unchanged');
}

console.log('\n== the provider half of a model ref, and only where the engine vouches ==');
{
    eq('the engine\'s own published prefix is a provider',
        S.providerOfModelRef(opencode(), 'anthropic/claude-opus-5'), 'anthropic');
    eq('‼️ one it never published is not — nothing is claimed rather than guessed',
        S.providerOfModelRef(opencode(), 'acme/whatever'), '');
    eq('an engine with no provider axis reads no provider out of any name',
        S.providerOfModelRef(codex(), 'anthropic/claude-opus-5'), '');
    eq('a bare model name names no provider', S.providerOfModelRef(opencode(), 'big-pickle'), '');
}

console.log('\n== the rule is reached through the SCOPE, never through an engine name ==');
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'providerSwitch.ts'), 'utf8');
    // ‼️ THE ONE MEASUREMENT THAT KEEPS THIS FROM BECOMING TWENTY IF-STATEMENTS.
    // The module names no engine, so a sixth engine gets the right answer by
    // declaring `providerScope`, not by somebody remembering to edit a list.
    const code = src.split('\n')
        .filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
    ok('‼️ no engine is named in the module\'s CODE — the verdict comes from '
        + 'providerScope and canSwitchProviderAtTurnBoundary',
        !/['"](claude|opencode|codex|gemini|agy)['"]/.test(code));
    ok('…and both facts really are asked, because they are not the same fact',
        /scopeAllowsTurnChange\(/.test(code) && /canSwitchProviderAtTurnBoundary/.test(code));

    // ‼️ AND THE BRIDGE DOOR USES IT RATHER THAN RESTATING IT. An op that made
    // its own decision would be a second policy with its own way of drifting.
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const at = ext.indexOf("op: 'console.switch'");
    ok('console.switch exists on the bridge — the item\'s acceptance line names it', at > 0);
    const handler = ext.slice(at, at + 5000);
    ok('…and it asks providerSwitchPolicy for the verdict', /providerSwitchPolicy\(/.test(handler));
    ok('‼️ …and a refusal is THROWN, not returned as a success with a note beside it',
        /act === 'refuse'/.test(handler) && /throw new Error\(verdict\.why\)/.test(handler));
    ok('‼️ …and where the model names the provider it refuses to guess one, listing '
        + 'what the provider serves instead',
        /sub\.kind === 'model'/.test(handler) && /needs the model you want too/.test(handler));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
