/**
 * X-112 — WHO IS BILLED FOR A RUN, AND WHAT ITS FIGURES MEAN.
 *
 * The rule under test: a route's tokens are written to the Claude plan window
 * only when the plan is what served it, and a dollar figure is a bill only
 * when the engine that reported it is the one that charges. Kimi and MiniMax
 * behind the Claude CLI fill no plan window and have no known tariff; an
 * Anthropic API key is metered, not rationed; another engine is its own
 * contract. And it is derived from the route, never from a model name.
 *
 *   node test/test_billing.js
 */
const path = require('path');
const { billingOf } = require(path.join(__dirname, '..', 'out', 'core', 'billing.js'));
const { runIdentity } = require(path.join(__dirname, '..', 'out', 'core', 'turnRuntime.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

// ------------------------------------------------------------ the four Claude answers
{
    const plan = billingOf({ engine: 'claude', providerId: '', binding: 'declared' });
    ok('no route declared = the Claude plan: ⚖ on the window, $ an estimate at API rates',
        plan.mode === 'plan' && plan.planWindow === true && plan.cost === 'estimate' && plan.currency === 'USD');
    const anth = billingOf({ engine: 'claude', providerId: 'anthropic', binding: 'declared' });
    ok('the shipped "anthropic" route IS the plan', anth.mode === 'plan' && anth.planWindow);

    const api = billingOf({ engine: 'claude', providerId: 'anthropic-api', binding: 'declared' });
    ok('an API key: $ is the bill, ⚖ on no window — a key is metered, not rationed',
        api.mode === 'api' && api.planWindow === false && api.cost === 'engine-reported' && api.currency === 'USD');

    const kimi = billingOf({ engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)', binding: 'declared' });
    ok('‼️ Kimi behind the Claude CLI: NOT on the plan window, and no dollar figure is a bill',
        kimi.mode === 'third-party' && kimi.planWindow === false && kimi.cost === 'none' && kimi.currency === '');
    ok('…and the sentence names the route and says why', /Kimi \(work\)/.test(kimi.why)
        && /NOT on the Claude plan window/.test(kimi.why) && /ANTHROPIC tariff/.test(kimi.why));
    const mm = billingOf({ engine: 'claude', providerId: 'minimax', binding: 'declared' });
    ok('MiniMax the same', mm.mode === 'third-party' && !mm.planWindow && mm.cost === 'none');
    const custom = billingOf({ engine: 'claude', providerId: 'my-proxy', binding: 'declared' });
    ok('an unknown custom route is third-party too — never guessed onto the plan',
        custom.mode === 'third-party' && !custom.planWindow && /my-proxy/.test(custom.why));

    ok('the id is compared case-blind, as every other reader compares it',
        billingOf({ engine: 'claude', providerId: 'Anthropic-API', binding: 'declared' }).mode === 'api');
}

// ------------------------------------------------------------ the runs we cannot place
{
    const ext = billingOf({ engine: 'claude', providerId: '', binding: 'external' });
    ok('a foreign transcript is on no window and no invoice', ext.mode === 'unknown' && !ext.planWindow && ext.cost === 'none');
    const unk = billingOf({ engine: 'claude', providerId: '', binding: 'unknown' });
    ok('asked-and-unanswered is unknown, not the plan by default', unk.mode === 'unknown' && !unk.planWindow);
    const legacy = billingOf({ engine: 'claude', providerId: '', binding: 'legacy' });
    ok('a run older than the manifest is the plan — nobody was asked and there was no other route then',
        legacy.mode === 'plan' && legacy.planWindow);
}

// ------------------------------------------------------------ other engines: their own contract
{
    const codex = billingOf({ engine: 'codex', providerId: '', origin: 'not-applicable', binding: 'declared' });
    ok('Codex states tokens only: $ is an estimate by your pricing rules, never the Claude window',
        codex.mode === 'engine' && codex.planWindow === false && codex.cost === 'estimate');
    const oc = billingOf({ engine: 'opencode', providerId: 'anthropic', origin: 'engine-native', binding: 'declared' });
    ok('OpenCode on its native anthropic provider is still the ENGINE\'s billing, not the Claude plan',
        oc.mode === 'engine' && oc.planWindow === false);
    ok('…and OpenCode states its own dollars, so its figure is engine-reported', oc.cost === 'engine-reported' && oc.currency === 'USD');
}

// ------------------------------------------------------------ it travels on the identity
{
    const manifest = (providerId, providerLabel) => ({
        identity: {
            engine: 'claude', providerId, providerLabel, origin: providerId ? 'agent-farm-profile' : 'legacy-inherit',
            scope: 'session', requestedModelRef: 'opus', proof: 'launch-declared'
        },
        requested: { model: '', tier: 'opus' }
    });
    const onKimi = runIdentity(manifest('kimi', 'Kimi (work)'), 'claude', []);
    ok('‼️ runIdentity carries billing, so every surface that has the identity has the answer',
        onKimi.billing && onKimi.billing.mode === 'third-party' && onKimi.billing.planWindow === false);
    const onPlan = runIdentity(manifest('', ''), 'claude', []);
    ok('…and a plain launch is the plan', onPlan.billing.mode === 'plan' && onPlan.billing.planWindow === true);
    const none = runIdentity(undefined, 'claude', [], { external: true });
    ok('…and a foreign transcript says unknown rather than being put on the plan',
        none.billing.mode === 'unknown' && none.binding === 'external');
    // ‼️ THE MODEL NAME IS NEVER EVIDENCE. A Kimi model reported by the engine
    // on a run that declared nothing does not move the billing off the plan:
    // that is the resume defect of 23 Aug — two routes under one model name.
    const modelOnly = runIdentity(manifest('', ''), 'claude', [{ n: 1, models: ['kimi-k2-thinking'] }]);
    ok('a reported model name alone never moves a run off the plan window', modelOnly.billing.mode === 'plan');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
