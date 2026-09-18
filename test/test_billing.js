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


// ------------------------------------------------- the ROUTE decides, and only once
//
// ‼️ THE RULE WAS WRITTEN DOWN TWICE. `ProviderAdapter.billingPolicy` answers
// "does this count against the plan quota" off the profile's `baseUrl`;
// `billingOf` answered the same question off a list of provider NAMES this
// build happens to ship. A name list cannot see a user's own profile, so the
// two disagreed in both directions — and a rule stated twice is a rule about to
// be stated two ways. These assertions hold them to one answer.
{
    const G = require(path.join(__dirname, '..', 'out', 'core', 'providerRegistry.js'));
    const PROFILES = [
        { id: 'anthropic', label: 'Anthropic', engine: 'claude', providerId: 'anthropic', tiers: {}, revision: 1 },
        {
            id: 'kimi-work', label: 'Kimi (work)', engine: 'claude', providerId: 'kimi',
            baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key', tiers: {}, revision: 3
        },
        {
            id: 'key', label: 'Anthropic (API key)', engine: 'claude', providerId: 'anthropic-api',
            authKind: 'api-key', tiers: {}, revision: 1
        },
        // ‼️ THE TWO CASES A NAME LIST GETS BACKWARDS. `house` is the user's own
        // profile on Anthropic's own endpoint — the plan, under a name this
        // build never shipped. `anthropic` here is the shipped NAME pointed at
        // somebody else's endpoint, which is exactly the lie X-112 exists for.
        { id: 'house', label: 'House', engine: 'claude', providerId: 'house', tiers: {}, revision: 1 },
        {
            id: 'proxy', label: 'Proxy', engine: 'claude', providerId: 'anthropic',
            baseUrl: 'https://proxy.example/anthropic', authKind: 'api-key', tiers: {}, revision: 1
        }
    ];
    const deps = () => ({ profiles: PROFILES, secretFor: () => 'k', inheritedEnv: {} });
    const claude = G.adapterFor('claude', deps());
    const identityOf = id => G.resolveRuntime('claude', { engine: 'claude', providerId: id }, deps()).identity;
    const billingFor = id => {
        const I = identityOf(id);
        return billingOf({
            engine: 'claude', providerId: I.providerId, providerLabel: I.providerLabel,
            origin: I.origin, binding: 'declared', route: I.route
        });
    };

    ok('‼️ a profile of the user\'s own on Anthropic\'s endpoint IS the plan — the name list called it third-party',
        billingFor('house').mode === 'plan' && billingFor('house').planWindow === true);
    ok('‼️ …and the shipped NAME pointed at somebody else\'s endpoint is NOT — the name list called it the plan',
        billingFor('proxy').mode === 'third-party' && billingFor('proxy').planWindow === false);
    ok('a key with no endpoint of its own is metered, not rationed',
        billingFor('key').mode === 'api' && billingFor('key').planWindow === false);
    ok('the shipped first-party route is still the plan', billingFor('anthropic').mode === 'plan');
    ok('a third-party endpoint is still third-party', billingFor('kimi-work').mode === 'third-party');

    // THE GUARD ITSELF: one question, two readers, and they may never diverge.
    let agreed = 0, disagreed = [];
    for (const prof of PROFILES) {
        const mine = billingFor(prof.id).planWindow;
        const theirs = claude.billingPolicy({ engine: 'claude', providerId: prof.id }).countsAgainstPlanQuota;
        if (mine === theirs) { agreed++; } else { disagreed.push(prof.id + ': billingOf=' + mine + ' policy=' + theirs); }
    }
    ok('‼️ billingOf and the adapter\'s billingPolicy answer "is this on the plan window" identically, for every profile ('
        + agreed + '/' + PROFILES.length + ')' + (disagreed.length ? ' — ' + disagreed.join(' · ') : ''),
        disagreed.length === 0 && agreed === PROFILES.length);

    // A record written before the route was sealed into the manifest has no
    // `route` at all, and must keep answering the way it always did.
    ok('no route recorded falls back to the shipped names, unchanged',
        billingOf({ engine: 'claude', providerId: 'kimi', binding: 'declared' }).mode === 'third-party'
        && billingOf({ engine: 'claude', providerId: '', binding: 'declared' }).mode === 'plan');
}

// ------------------------------------------------- the two labels a page prints
//
// ‼️ EVERY SURFACE WAS WRITING "Against the 5h limit" OVER EVERY ⚖ FIGURE. The
// figure is real on all of them (it is one formula, which is what makes runs
// comparable); the CLAIM is true of exactly one billing. The words belong here
// so a page cannot compose its own the next time a route is added.
{
    const plan = billingOf({ engine: 'claude', providerId: '', binding: 'declared' });
    const kimi = billingOf({ engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi', binding: 'declared' });
    const api = billingOf({ engine: 'claude', providerId: 'anthropic-api', binding: 'declared' });
    const codex = billingOf({ engine: 'codex' });
    const foreign = billingOf({ engine: 'claude', binding: 'external' });

    ok('the plan run is the only one whose ⚖ label claims the five-hour window',
        plan.weighed === 'Against the 5h limit'
        && [kimi, api, codex, foreign].every(b => !/5h limit/.test(b.weighed)));
    ok('…and every off-plan label says so in words, not by being blank',
        [kimi, api, codex, foreign].every(b => b.weighed.length > 10 && /window/i.test(b.weighed)));
    ok('‼️ planWindow and the label never disagree — the flag and the sentence are one fact',
        [plan, kimi, api, codex, foreign].every(b => b.planWindow === (b.weighed === 'Against the 5h limit')));

    // ‼️ THE CELL MARK IS NARROWER THAN THE FLAG ON PURPOSE, and this is the
    // assertion that keeps somebody from "fixing" it into planWindow. Saying
    // "off-plan" over a Codex run would be a NEW falsehood — that run IS on a
    // plan, a ChatGPT one; what it is not on is this window. The engine badge
    // on the same row already says which contract it is under, and marking
    // every row of a two-engine machine is noise, not density.
    ok('the mark is carried by the Claude CLI\'s own off-plan routes, and by nothing else',
        kimi.mark === 'off-plan' && api.mark === 'off-plan'
        && plan.mark === '' && codex.mark === '');
    ok('…and a run nobody could place says THAT, rather than borrowing "off-plan"',
        foreign.mark === 'unplaced');
    ok('‼️ the mark never contradicts the flag: a marked run is always off the window',
        [plan, kimi, api, codex, foreign].every(b => !b.mark || b.planWindow === false));

    ok('a dollar figure says what it is on every billing that has one',
        plan.costIs && api.costIs && kimi.costIs && codex.costIs);
    ok('…the plan\'s is an equivalence, the key\'s is a bill, the route\'s is neither',
        /API-equivalent/.test(plan.costIs) && /bill, at the API tariff/.test(api.costIs)
        && /not this route/.test(kimi.costIs));
    ok('an engine that states no price states no meaning either, rather than inventing one',
        billingOf({ engine: 'gemini' }).cost === 'none'
            ? billingOf({ engine: 'gemini' }).costIs === '' : true);
}

// ------------------------------------------------------------ X-112 (2b): a total says what it added
{
    const { sumDollars, describeDollars, splitWeighed } = require(path.join(__dirname, '..', 'out', 'core', 'billing.js'));
    const { runBilling, billingReader } = require(path.join(__dirname, '..', 'out', 'core', 'turnRuntime.js'));
    const plan = billingOf({ engine: 'claude', providerId: '', binding: 'declared' });
    const api = billingOf({ engine: 'claude', providerId: 'anthropic-api', binding: 'declared' });
    const kimi = billingOf({ engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi', binding: 'declared' });
    const mini = billingOf({ engine: 'claude', providerId: 'minimax', providerLabel: 'MiniMax', binding: 'declared' });
    const codex = billingOf({ engine: 'codex' });
    const oc = billingOf({ engine: 'opencode' });

    ok('every billing with a figure names its kind of dollar',
        plan.dollar === 'equivalent' && api.dollar === 'bill' && kimi.dollar === 'arithmetic');
    ok('…two third-party routes are the SAME kind (both are Anthropic-tariff arithmetic)',
        kimi.dollar === mini.dollar);
    ok('…but two engines\' own figures are two vendors\' claims, never one kind',
        codex.dollar !== oc.dollar || codex.dollar === '' || oc.dollar === '');

    const B = new Map([['p1', plan], ['p2', plan], ['k', api], ['km', kimi], ['free', kimi]]);
    const runs = [{ id: 'p1', c: 10 }, { id: 'p2', c: 2.5 }, { id: 'k', c: 3 }, { id: 'km', c: 1.25 }, { id: 'free', c: 0 }, { id: 'nobody', c: 0.5 }];
    const s = sumDollars(runs, r => r.c, r => B.get(r.id));
    ok('the sum is still given — hiding it would be the opposite lie', s.usd === 17.25);
    ok('…and it carries its parts, largest first', s.mixed === true && s.parts.map(p => p.dollar).join(',') === 'equivalent,bill,arithmetic,unplaced');
    ok('…each part worded by the rule\'s own costIs, counted in runs',
        s.parts[0].label === plan.costIs && s.parts[0].runs === 2 && s.parts[0].usd === 12.5);
    ok('a run with no billing is "unplaced", never quietly counted as the plan',
        s.parts.find(p => p.dollar === 'unplaced').usd === 0.5);
    ok('a free run crosses no boundary: a zero does not make a clean total mixed',
        sumDollars([{ id: 'p1', c: 1 }, { id: 'free', c: 0 }], r => r.c, r => B.get(r.id)).mixed === false);
    ok('an all-plan total is one kind, and says which',
        (x => !x.mixed && x.parts.length === 1 && x.parts[0].dollar === 'equivalent')(
            sumDollars([{ id: 'p1', c: 1 }, { id: 'p2', c: 2 }], r => r.c, r => B.get(r.id))));
    const lines = describeDollars(s, n => '$' + n.toFixed(2));
    ok('the breakdown is one line per kind, money first',
        lines.length === 4 && lines[0].startsWith('$12.50 — ') && /\(2 runs\)$/.test(lines[0]) && /\(1 run\)$/.test(lines[1]));

    const w = splitWeighed([{ b: plan, w: 100 }, { b: kimi, w: 40 }, { b: api, w: 5 }, { b: undefined, w: 7 }], r => r.w, r => r.b);
    ok('⚖ against the limit counts only what the plan served; an unplaced run is OFF the window',
        w.plan === 100 && w.off === 52);

    // runBilling is runIdentity's own rule, not a second copy of it
    const manifest = (providerId, providerLabel) => ({
        launchId: 'L-' + (providerId || 'plan'),
        identity: {
            engine: 'claude', providerId, providerLabel, origin: providerId ? 'agent-farm-profile' : 'legacy-inherit',
            scope: 'session', requestedModelRef: 'opus', proof: 'launch-declared'
        },
        requested: { model: '', tier: 'opus' }
    });
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    ok('‼️ runBilling answers exactly what runIdentity carries — declared, legacy, external, another engine',
        [[manifest('kimi', 'Kimi'), 'claude', undefined], [manifest('', ''), 'claude', undefined],
            [undefined, 'claude', undefined], [undefined, 'claude', { external: true }], [undefined, 'codex', { external: true }]]
            .every(([m, e, o]) => same(runBilling(m, e, o), runIdentity(m, e, [], o).billing)));

    const read = billingReader([manifest('kimi', 'Kimi'), manifest('anthropic-api', 'API key')]);
    ok('the reader finds a run\'s launch record by its launchId', read({ launchId: 'L-kimi', source: 'claude' }).mode === 'third-party');
    ok('…a Claude run with no record is the legacy plan, as its own page says',
        read({ source: 'claude' }).mode === 'plan');
    ok('…an imported transcript is unplaced, not the plan', read({ source: 'claude', provenance: 'imported' }).mode === 'unknown');
    ok('…and another engine is its own billing', read({ source: 'codex' }).mode === 'engine');

    // ‼️ the page folds rows with the SAME rule — charts.js held to billing.ts
    const vm = require('vm'), fs = require('fs');
    const box = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'media', 'charts.js'), 'utf8'), box);
    const C = box.window.AFCharts;
    const page = C.dollarSum(runs, r => r.c, r => B.get(r.id));
    ok('‼️ charts.js dollarSum === billing.ts sumDollars on the same rows', same(JSON.parse(JSON.stringify(page)), s));
    const cell = C.fmtUSDSum(s.usd, s.parts);
    ok('a mixed total says (mixed) on the cell and carries its breakdown on hover',
        /\(mixed\)<\/span>$/.test(cell) && /class="usdmix"/.test(cell) && cell.includes('Not one kind of dollar'));
    ok('…an ordinary total is just the figure', C.fmtUSDSum(3, [s.parts[0]]) === C.fmtUSD(3) && C.fmtUSDSum(3) === C.fmtUSD(3));

    // the fleet report states what its totals are
    const { buildFleetReport } = require(path.join(__dirname, '..', 'out', 'core', 'report.js'));
    const now = Date.now();
    const sess = (id, cost, wTokens, launchId) => ({
        sessionId: id, launchId, agentId: 'a1', agentName: 'dev', title: id, source: 'claude', lastTs: now, cost, wTokens,
        usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }, toolCalls: 1, errors: 0, models: []
    });
    const list = [sess('s1', 10, 1000, undefined), sess('s2', 2, 400, 'L-kimi'), sess('s3', 3, 50, 'L-anthropic-api')];
    const idx = { all: () => list, external: () => [], forAgent: () => list };
    const agents = [{ id: 'a1', name: 'dev', contextLoad: { total: 0 }, memoryFiles: [] }];
    const md = buildFleetReport(agents, idx, [], 7, undefined, read);
    ok('the report no longer calls a Kimi run and a key\'s bill "API-equivalent values"',
        !md.includes('costs are API-equivalent values') && md.includes('costs are NOT one kind of dollar'));
    ok('…its fleet cost is marked (mixed) and broken down one line per kind',
        /Cost: \*\*\$15\.00\*\* \(mixed\)/.test(md) && md.includes('  - $10.00 — ' + plan.costIs));
    ok('…⚖ against the plan limit counts the plan run alone, the rest is named off-plan',
        /⚖ \*\*1\.0k\*\* against the plan limit · \*\*450\*\* off-plan/.test(md));
    ok('…and the agent row\'s cost is marked too', /\| dev \| 3 \| \$15\.00 \(mixed\) \|/.test(md));
    // X-112 (3) — a total booked elsewhere: the parts always add up to it
    const { partsOfTotal } = require(path.join(__dirname, '..', 'out', 'core', 'billing.js'));
    const mp = partsOfTotal(5, [{ usd: 1, billing: plan }, { usd: 2.5, billing: codex }, { usd: 0.5, billing: plan }]);
    ok('a mission run over a plan planner and a Codex delegate carries its parts',
        Array.isArray(mp) && mp.length === 3);
    ok('…and what the rounds did not account for is unplaced, so the parts add up to the booked total',
        Math.round(mp.reduce((n, p) => n + p.usd, 0) * 100) === 500 && mp.find(p => p.dollar === 'unplaced').usd === 1);
    ok('…a run booked in one kind carries no breakdown',
        partsOfTotal(1.5, [{ usd: 1, billing: plan }, { usd: 0.5, billing: plan }]) === undefined);
    ok('…and a ledger that has not caught up (items above the total) invents no negative part',
        (x => x === undefined)(partsOfTotal(1, [{ usd: 1, billing: plan }, { usd: 0.5, billing: plan }])));
    const clean = buildFleetReport(agents, { all: () => [list[0]], external: () => [], forAgent: () => [list[0]] }, [], 7, undefined, read);
    ok('an all-plan fleet says what its costs ARE, from the rule\'s own words',
        clean.includes('costs are ' + plan.costIs + '.') && !clean.includes('(mixed)'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
