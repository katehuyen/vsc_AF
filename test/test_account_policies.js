// ‼️ X-305 — AN ACCOUNT CHOSEN AT LAUNCH BY A RULE, AGAINST THE FIGURES OF THAT
// MOMENT. The user's words: guessing which sign-in will have room at the hour
// a task runs is a structural gap. This pins the pure core: the four built-in
// policies, the user's named chains, and the two rules that must never bend —
// a policy that finds nothing REFUSES rather than falling to the main sign-in,
// and none of the ranking is written twice (roomOrder / accountOrder decide).
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const P = require(path.join(__dirname, '..', 'out', 'core', 'accountPolicy.js'));
const { accountRefusal } = require(path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));

const NOW = 1_800_000_000_000;
const u = (slotId, percent, extra = {}) => ({
    slotId, engine: 'claude', state: 'ok', percent, resetsAt: NOW + 3600_000, plan: 'max', fetchedAt: NOW - 1000, ...extra
});
const unread = (slotId, engine = 'claude') => ({ slotId, engine, state: 'unread', percent: -1, resetsAt: 0, plan: '', fetchedAt: 0 });
const usage = [u('a', 40), u('b', 12), u('c', 97), u('x', 5, { engine: 'codex', window: 'week' }), unread('d')];
const world = (over = {}) => ({ engine: 'claude', usage, standing: '', now: NOW, ...over });

// ---- what is a policy -----------------------------------------------------
ok('@emptiest, @pool, @standing, @round-robin are policies', ['@emptiest', '@pool', '@standing', '@round-robin'].every(P.isPolicyId));
ok('‼️ @machine is NOT a policy — it is X-211\'s "the machine\'s own sign-in, stated"', !P.isPolicyId('@machine'));
ok('a slot id, an empty string and a bare @ are not policies', !P.isPolicyId('claude-main') && !P.isPolicyId('') && !P.isPolicyId('@'));
ok('a named rule is a policy by its @name, case-insensitively', P.isPolicyId('@Night') && !!P.findPolicy('@night', [{ name: 'Night', chain: [] }]));
ok('the built-in list has four entries with a label and a detail each', P.BUILT_IN_POLICIES.length === 4 && P.BUILT_IN_POLICIES.every(p => p.id && p.label && p.detail));
ok('‼️ X-305 R2 — the default wall is 90, not 95 or 100: a policy chooses where to START, and 90% is where the fleet hands over', P.POLICY_DEFAULT_CEILING === 90);

// ---- a non-policy passes through untouched -------------------------------
{
    const r = P.resolvePolicy('claude-main', world());
    ok('a stated slot id is handed back as the answer, no policy, no note', r.id === 'claude-main' && r.policy === '' && !r.refusal);
    ok('an empty statement is an empty answer', P.resolvePolicy('', world()).id === '' && !P.resolvePolicy('', world()).refusal);
}

// ---- @emptiest -------------------------------------------------------------
{
    const r = P.resolvePolicy('@emptiest', world());
    ok('‼️ @emptiest picks the measured claude slot with the most room (b at 12%)', r.id === 'b' && r.policy === '@emptiest');
    ok('…and never a slot of another engine, however empty (codex x at 5% is not in the running)', r.id !== 'x');
    ok('the note names the slot, the rule, the figure and who is next', /b — @emptiest/.test(r.note) && /12%/.test(r.note) && /next would be a/.test(r.note));
    ok('a slot at 97% is out even though 97 < 100 — the wall is 90 here',
        P.resolvePolicy('@emptiest', world({ usage: [u('c', 97), unread('d')] })).id === 'd');
    const walled = P.resolvePolicy('@emptiest', world({ usage: [u('a', 96), u('c', 99)] }));
    ok('‼️ EVERY SLOT WALLED = A REFUSAL, NEVER THE MAIN SIGN-IN', walled.id === '' && !!walled.refusal);
    ok('…the refusal names each slot with its figure and the first reset', /a 96%/.test(walled.refusal) && /c 99%/.test(walled.refusal) && walled.resetsAt === NOW + 3600_000 && /resets at/.test(walled.refusal));
    const none = P.resolvePolicy('@emptiest', world({ usage: [u('x', 5, { engine: 'codex' })] }));
    ok('no slot of this engine at all is a refusal that says so', /no claude sign-in is stored/.test(none.refusal));
    ok('a label function is used in the note', /Work — @emptiest/.test(P.resolvePolicy('@emptiest', world({ labelOf: id => id === 'b' ? 'Work' : id })).note));
}

// ---- @pool -----------------------------------------------------------------
{
    const noPool = P.resolvePolicy('@pool', world());
    ok('‼️ @pool with no campaign pool running is a refusal, not a guess', noPool.id === '' && /no sentry campaign pool/.test(noPool.refusal));
    const pool = { accounts: ['c', 'a', 'b'], ceiling: 90 };
    const r = P.resolvePolicy('@pool', world({ pool }));
    ok('@pool walks the campaign pool by the campaign\'s rule — free pool = most room (b)', r.id === 'b' && /@pool/.test(r.note));
    const tiered = P.resolvePolicy('@pool', world({ pool: { accounts: ['a', 'x'], rotation: 'tiered', engine: 'claude' }, usage: [u('a', 50), u('x', 5, { engine: 'codex' })] }));
    ok('…and a tiered pool keeps to its first tier while it has room (a, not codex x)', tiered.id === 'a');
    const allWalled = P.resolvePolicy('@pool', world({ pool: { accounts: ['a', 'c'], ceiling: 30 }, usage: [u('a', 40), u('c', 97)] }));
    ok('a pool walled end to end refuses with the pool\'s own ceiling and the first reset', allWalled.id === '' && /past 30%/.test(allWalled.refusal) && allWalled.resetsAt > 0);
    const unknown = P.resolvePolicy('@pool', world({ pool: { accounts: ['zzz'] } }));
    ok('a pool whose accounts nobody measures cannot choose', unknown.id === '' && !!unknown.refusal);
}

// ---- @standing -------------------------------------------------------------
{
    const main = P.resolvePolicy('@standing', world({ standing: '' }));
    ok('@standing with nothing standing is the main sign-in, said out loud, not a refusal', main.id === '' && !main.refusal && /main sign-in/.test(main.note));
    const mine = P.resolvePolicy('@standing', world({ standing: 'a', standingOrigin: 'agent' }));
    ok('@standing is the standing slot, and the note says which layer gave it', mine.id === 'a' && /agent sign-in/.test(mine.note) && /40%/.test(mine.note));
    const walled = P.resolvePolicy('@standing', world({ standing: 'c', standingOrigin: 'machine' }));
    ok('‼️ a walled standing slot is refused, with its figure and its reset', walled.id === '' && /97%/.test(walled.refusal) && walled.resetsAt > 0);
    ok('an unmeasured standing slot is usable — unread is not walled', P.resolvePolicy('@standing', world({ standing: 'd' })).id === 'd');
}

// ---- @round-robin ----------------------------------------------------------
{
    const first = P.resolvePolicy('@round-robin', world({ cursor: '' }));
    ok('@round-robin with no cursor starts at the first usable slot in list order (a)', first.id === 'a' && first.cursor === 'a');
    const second = P.resolvePolicy('@round-robin', world({ cursor: 'a' }));
    ok('…after a comes b', second.id === 'b' && second.cursor === 'b');
    const third = P.resolvePolicy('@round-robin', world({ cursor: 'b' }));
    ok('‼️ after b, c is skipped for being walled and d (unread) is taken', third.id === 'd' && third.cursor === 'd');
    const wrap = P.resolvePolicy('@round-robin', world({ cursor: 'd' }));
    ok('…and after the last it wraps to a', wrap.id === 'a');
    const gone = P.resolvePolicy('@round-robin', world({ cursor: 'nolonger' }));
    ok('a cursor naming a slot that is gone restarts from the top rather than failing', gone.id === 'a');
    ok('the note counts the room', /3 of 4 claude sign-ins have room/.test(first.note));
    const walled = P.resolvePolicy('@round-robin', world({ usage: [u('a', 99)] }));
    ok('everything walled is a refusal', walled.id === '' && !!walled.refusal);
}

// ---- named rules -----------------------------------------------------------
{
    const policies = [
        { name: 'Night', ceiling: 80, chain: [{ account: 'a', ceiling: 30 }, { policy: '@emptiest' }] },
        { name: 'Heavy', chain: [{ account: 'c', models: ['opus'] }, { policy: '@standing' }, { account: 'a' }] },
        { name: 'Codex-only', engine: 'codex', chain: [{ account: 'x' }] },
        { name: 'Loop1', chain: [{ policy: '@Loop2' }] },
        { name: 'Loop2', chain: [{ policy: '@Loop1' }] }
    ];
    const r = P.resolvePolicy('@night', world({ policies }));
    ok('‼️ a rule walks its chain: step 1 (a, wall 30%) is skipped at 40%, step 2 @emptiest gives b', r.id === 'b' && r.policy === '@night');
    ok('…and the note says it came via the rule\'s step', /@emptiest/.test(r.note) && /via @Night step 2 of 2/.test(r.note));
    const direct = P.resolvePolicy('@Night', world({ policies, usage: [u('a', 20), u('b', 10)] }));
    ok('a step naming an account under its own wall is taken (a at 20% < 30%)', direct.id === 'a' && /@Night step 1 of 2/.test(direct.note));
    const heavyOpus = P.resolvePolicy('@heavy', world({ policies, model: 'opus', standing: 'b', usage: [u('a', 40), u('b', 12), u('c', 50)] }));
    ok('a model-filtered step is taken when the launch model matches (opus → c)', heavyOpus.id === 'c');
    const heavySonnet = P.resolvePolicy('@heavy', world({ policies, model: 'sonnet', standing: 'b', usage: [u('a', 40), u('b', 12), u('c', 50)] }));
    ok('…and skipped when it does not (sonnet → @standing → b)', heavySonnet.id === 'b' && /via @Heavy step 2 of 3/.test(heavySonnet.note));
    const heavyNoModel = P.resolvePolicy('@heavy', world({ policies, standing: '', usage: [u('a', 40)] }));
    ok('a launch with no model does not match a model filter; @standing = main is a real answer, so step 2 wins', heavyNoModel.id === '' && !heavyNoModel.refusal && /main sign-in/.test(heavyNoModel.note));
    const wrongEngine = P.resolvePolicy('@codex-only', world({ policies }));
    ok('‼️ a rule for another engine refuses this launch by name', wrongEngine.id === '' && /rule for codex/.test(wrongEngine.refusal));
    const loop = P.resolvePolicy('@loop1', world({ policies }));
    ok('two rules pointing at each other end in a refusal, not a stack overflow', loop.id === '' && /loop/.test(loop.refusal));
    const nothing = P.resolvePolicy('@night', world({ policies, usage: [u('a', 96), u('b', 99)] }));
    ok('‼️ a rule no step of which can choose refuses, naming every step and the first reset', nothing.id === '' && /step 1/.test(nothing.refusal) && /step 2/.test(nothing.refusal) && nothing.resetsAt > 0);
    const notStored = P.resolvePolicy('@night', world({ policies, stored: ['b'], usage: [u('b', 12)] }));
    ok('a step naming a slot the host says is not stored is skipped (a is unmeasured, which alone would pass)', notStored.id === 'b');
    const notStoredWalled = P.resolvePolicy('@night', world({ policies, stored: ['b'], usage: [u('b', 99)] }));
    ok('…and the refusal says so by name', /no account "a" is stored/.test(notStoredWalled.refusal));
    const unknown = P.resolvePolicy('@nosuch', world({ policies }));
    ok('an unknown @name is a refusal listing what exists', unknown.id === '' && /No account policy "@nosuch"/.test(unknown.refusal) && /@Night/.test(unknown.refusal));
}

// ---- the door's refusal, before launching ---------------------------------
{
    ok('policyRefusal is empty for a built-in and for a known rule', P.policyRefusal('@emptiest') === '' && P.policyRefusal('@night', [{ name: 'Night', chain: [] }]) === '');
    ok('…and a sentence for a typo, naming the built-ins', /No account policy "@emptyest"/.test(P.policyRefusal('@emptyest', [])) && /@emptiest/.test(P.policyRefusal('@emptyest', [])));
    ok('…and empty for anything that is not a policy at all', P.policyRefusal('claude-main', []) === '' && P.policyRefusal('', []) === '');
    const slots = [{ id: 'claude-main', engine: 'claude', dir: 'X:\\a', label: 'Main' }];
    ok('‼️ accountRefusal no longer calls @emptiest a forgotten slot', accountRefusal('@emptiest', slots, 'claude') === '');
    ok('…but still refuses a slot that is not stored', /No account "gone"/.test(accountRefusal('gone', slots, 'claude')));
    ok('…and refuses a policy that does not exist, as a policy', /No account policy "@nope"/.test(accountRefusal('@nope', slots, 'claude', [])));
    ok('…and knows the user\'s named rules', accountRefusal('@night', slots, 'claude', [{ name: 'night', chain: [] }]) === '');
    ok('@machine is still the machine\'s own sign-in, never refused', accountRefusal('@machine', slots, 'claude') === '');
}

// ---- the shape of a rule on its way in -------------------------------------
{
    const sh = P.policyShapeRefusal;
    ok('a sound rule passes', sh({ name: 'Night', chain: [{ account: 'a' }] }) === '');
    ok('no name is refused', /needs a name/.test(sh({ name: '', chain: [{ account: 'a' }] })));
    ok('a name with spaces is refused — it has to be typeable as @name', /cannot be a policy name/.test(sh({ name: 'gece nöbeti', chain: [{ account: 'a' }] })));
    ok('a built-in name is refused', /built-in/.test(sh({ name: 'emptiest', chain: [{ account: 'a' }] })));
    ok('an empty chain is refused', /no steps/.test(sh({ name: 'X', chain: [] })));
    ok('a step with neither account nor policy is refused', /neither/.test(sh({ name: 'X', chain: [{}] })));
    ok('a step with both is refused', /both/.test(sh({ name: 'X', chain: [{ account: 'a', policy: '@emptiest' }] })));
    ok('a step pointing at itself is refused', /points at itself/.test(sh({ name: 'X', chain: [{ policy: '@x' }] })));
    ok('a step pointing at a policy that does not exist is refused', /no policy "@y"/.test(sh({ name: 'X', chain: [{ policy: '@y' }] }, [])));
    ok('…unless it exists among the others', sh({ name: 'X', chain: [{ policy: '@y' }] }, [{ name: 'y', chain: [{ account: 'a' }] }]) === '');
    ok('a ceiling outside 1–100 is refused, on the rule and on a step', /between 1 and 100/.test(sh({ name: 'X', ceiling: 0, chain: [{ account: 'a' }] })) && /between 1 and 100/.test(sh({ name: 'X', chain: [{ account: 'a', ceiling: 101 }] })));
    // X-324 — the strategy on its way in
    ok('the two strategies are named once, in the core', Array.isArray(P.POLICY_STRATEGIES) && P.POLICY_STRATEGIES.join() === 'chain,emptiest');
    ok('no strategy, "chain" and "emptiest" over accounts all pass',
        sh({ name: 'X', chain: [{ account: 'a' }] }) === '' && sh({ name: 'X', strategy: 'chain', chain: [{ policy: '@emptiest' }] }) === ''
        && sh({ name: 'X', strategy: 'emptiest', chain: [{ account: 'a' }, { account: 'b', ceiling: 50 }] }) === '');
    ok('a strategy that is neither word is refused by name', /"chain" or "emptiest", not "pool"/.test(sh({ name: 'X', strategy: 'pool', chain: [{ account: 'a' }] })));
    const locked = sh({ name: 'X', strategy: 'emptiest', chain: [{ account: 'a' }, { policy: '@emptiest' }, { policy: '@round-robin' }] });
    ok('‼️ emptiest with a rule among the steps is refused — a rule has no single figure — naming each such step',
        /cannot be in emptiest mode/.test(locked) && /step 2 names @emptiest/.test(locked) && /step 3 names @round-robin/.test(locked));
    ok('…and the sentence is the one the page locks its switch on', P.emptiestLockReason([{ account: 'a' }, { policy: '@pool' }]) !== '' && locked.includes(P.emptiestLockReason([{ account: 'a' }, { policy: '@emptiest' }, { policy: '@round-robin' }])));
    ok('…which is empty for a list of accounts', P.emptiestLockReason([{ account: 'a' }, { account: 'b' }]) === '' && P.emptiestLockReason([]) === '' && P.emptiestLockReason(undefined) === '');
    ok('policyStrategy reads chain unless the rule says emptiest', P.policyStrategy({}) === 'chain' && P.policyStrategy(undefined) === 'chain' && P.policyStrategy({ strategy: 'emptiest' }) === 'emptiest' && P.policyStrategy({ strategy: 'chain' }) === 'chain');
}

// ---- X-324 — a rule in emptiest mode: its steps are a pool of their own ----
{
    const policies = [
        { name: 'Trio', strategy: 'emptiest', chain: [{ account: 'a' }, { account: 'c' }, { account: 'b' }] },
        { name: 'Walled', strategy: 'emptiest', ceiling: 30, chain: [{ account: 'a' }, { account: 'b', ceiling: 10 }] },
        { name: 'Fenced', strategy: 'emptiest', chain: [{ account: 'a', models: ['opus'] }, { account: 'b' }] },
        { name: 'Mixed', strategy: 'emptiest', chain: [{ policy: '@emptiest' }, { account: 'a' }] },
        { name: 'Order', chain: [{ account: 'a' }, { account: 'c' }, { account: 'b' }] }
    ];
    const trio = P.resolvePolicy('@trio', world({ policies }));
    ok('‼️ EMPTIEST: the listed sign-ins are compared and the most room wins (b at 12%), not the first listed (a at 40%)',
        trio.id === 'b' && trio.policy === '@trio' && /b — @Trio \(emptiest of its 3 listed\)/.test(trio.note) && /12%/.test(trio.note));
    ok('…the note says who would be next (a), and c at 97% is not in the running', /next would be a \(40%/.test(trio.note));
    ok('‼️ …and the SAME steps as a chain pick the FIRST listed (a) — the strategy is the whole difference',
        P.resolvePolicy('@order', world({ policies })).id === 'a');
    ok('‼️ only the LISTED sign-ins compete: d (unread, engine-wide @emptiest\'s runner-up) is not listed and never chosen',
        P.resolvePolicy('@trio', world({ policies, usage: [u('a', 85), u('c', 97), unread('d')] })).id === 'a');
    ok('an unlisted slot at 1% does not enter the pool either', P.resolvePolicy('@trio', world({ policies, usage: [u('a', 60), u('b', 70), u('zz', 1)] })).id === 'a');
    const walled = P.resolvePolicy('@walled', world({ policies, usage: [u('a', 25), u('b', 5)] }));
    ok('‼️ a step\'s own wall holds in emptiest mode: b at 5% clears its 10% wall and has more room than a', walled.id === 'b');
    const walledB = P.resolvePolicy('@walled', world({ policies, usage: [u('a', 25), u('b', 15)] }));
    ok('…b at 15% is past its 10% wall and out, so a (25% < the rule\'s 30%) wins even with less room', walledB.id === 'a');
    const allWalled = P.resolvePolicy('@walled', world({ policies, usage: [u('a', 35), u('b', 15)] }));
    ok('‼️ every listed sign-in walled = a refusal naming each with its figure and wall, and the first reset — never the main sign-in',
        allWalled.id === '' && /@Walled \(emptiest\): none of its 2 listed/.test(allWalled.refusal) && /step 1: a is at 35%[^;]*wall 30%/.test(allWalled.refusal)
        && /step 2: b is at 15%[^;]*wall 10%/.test(allWalled.refusal) && allWalled.resetsAt === NOW + 3600_000 && /resets at/.test(allWalled.refusal));
    ok('a model-filtered step is out of the pool when the launch model does not match (sonnet → b), in when it does (opus → a at 5%)',
        P.resolvePolicy('@fenced', world({ policies, model: 'sonnet', usage: [u('a', 5), u('b', 50)] })).id === 'b'
        && P.resolvePolicy('@fenced', world({ policies, model: 'opus', usage: [u('a', 5), u('b', 50)] })).id === 'a');
    ok('a listed slot the host says is not stored is out of the pool', P.resolvePolicy('@trio', world({ policies, stored: ['c', 'b'], usage: [u('a', 1), u('b', 50), u('c', 60)] })).id === 'b');
    ok('a measured listed slot beats an unread listed one, however the list is ordered',
        P.resolvePolicy('@trio', world({ policies, usage: [unread('a'), u('b', 80), unread('c')] })).id === 'b');
    const unreadOnly = P.resolvePolicy('@trio', world({ policies, usage: [unread('a'), unread('c')] }));
    ok('only unread records: the first listed unread starts — unread is usable by the rule every runner follows', unreadOnly.id === 'a');
    const noRecord = P.resolvePolicy('@trio', world({ policies, usage: [u('x', 5, { engine: 'codex' })] }));
    ok('no record at all for any listed slot: the first listed starts, and the note says nobody measured them', noRecord.id === 'a' && /first unmeasured one starts/.test(noRecord.note));
    const mixed = P.resolvePolicy('@mixed', world({ policies, usage: [u('a', 40)] }));
    ok('a hand-edited emptiest rule holding a rule step skips that step, saying why, and still compares the accounts',
        mixed.id === 'a' && P.resolvePolicy('@mixed', world({ policies, usage: [u('a', 99)] })).refusal.includes('step 1 (@emptiest) is a rule, which has no figure to compare'));
    const via = P.resolvePolicy('@viatrio', world({ policies: policies.concat([{ name: 'ViaTrio', chain: [{ account: 'c' }, { policy: '@Trio' }] }]) }));
    ok('a chain may step through an emptiest rule, and the note says both', via.id === 'b' && /emptiest of its 3 listed/.test(via.note) && /via @ViaTrio step 2 of 2/.test(via.note));
}

// ---- S-105 — the default wall, never above the quota handover line ---------
{
    const loop = [u('m', 80), u('n', 95)];
    const at90 = P.resolvePolicy('@emptiest', world({ usage: loop }));
    ok('‼️ S-105 — the bug: under the fixed 90% wall an 80% slot is picked, and a 70% handover line would end it at once', at90.id === 'm');
    const c = P.effectiveCeiling(90, 70);
    ok('the wall in force is the LOWER of defaultAccountCeiling and quotaHandoverPct, and says so', c.value === 70 && /quota handover line/.test(c.why));
    const at70 = P.resolvePolicy('@emptiest', world({ usage: loop, ceiling: c.value }));
    ok('‼️ …so with the handover line at 70% the 80% slot is passed over — the loop cannot happen', at70.id === '' && !!at70.refusal && /70%/.test(at70.refusal));
    ok('…and the round robin and standing policies walk the same wall', !!P.resolvePolicy('@round-robin', world({ usage: loop, ceiling: 70 })).refusal
        && !!P.resolvePolicy('@standing', world({ usage: loop, standing: 'm', ceiling: 70 })).refusal);
    ok('a slot under the wall is still chosen', P.resolvePolicy('@emptiest', world({ usage: [u('m', 80), u('k', 30)], ceiling: 70 })).id === 'k');
    ok('the user\'s own wall wins when it is the lower one', P.effectiveCeiling(60, 90).value === 60 && /defaultAccountCeiling/.test(P.effectiveCeiling(60, 90).why));
    ok('quotaHandoverPct 0 (off) leaves the wall alone; nothing written = 90 (default)', P.effectiveCeiling(undefined, 0).value === 90 && /default/.test(P.effectiveCeiling(undefined, 0).why));
    ok('a nonsense world ceiling falls back to the built-in 90', P.resolvePolicy('@emptiest', world({ usage: loop, ceiling: 0 })).id === 'm');
    const rule = { name: 'mine', chain: [{ policy: '@emptiest' }] };
    ok('a rule step that names no wall walks the world\'s wall too', !!P.resolvePolicy('@mine', world({ usage: loop, ceiling: 70, policies: [rule] })).refusal);
    const own = { name: 'own', ceiling: 85, chain: [{ policy: '@emptiest' }] };
    ok('a rule that names its own wall keeps it', P.resolvePolicy('@own', world({ usage: loop, ceiling: 70, policies: [own] })).id === 'm');
    const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the host walks every policy with the wall in force, and the pages and policies.list show it with its why',
        /ceiling: accountCeiling\(\)\.value,\s*standing/.test(ext) && (ext.match(/ceilingWhy: accountCeiling\(\)\.why/g) || []).length === 2
        && /effectiveCeiling\(set, cfg\(\)\.get<number>\('quotaHandoverPct', 90\)\)/.test(ext));
}

console.log(`test_account_policies.js: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
