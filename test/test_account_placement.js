// X-475 — THE ACCOUNT / RELAY DECISION SURFACE, DRIVEN THROUGH ITS OPTIONS OBJECT.
// Until it left extension.ts these decisions were only reachable by grepping the
// host's text; here the real module answers against stated figures.
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { accountPlacement, roundRobinKey } = require(path.join(ROOT, 'out', 'launch', 'accountPlacement.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const now = Date.now();
const slot = (id, pct) => ({ slotId: id, engine: 'claude', state: 'ok', percent: pct, resetsAt: now + 3600000, plan: 'max', fetchedAt: now });
const stored = ['claude-a', 'claude-b', 'claude-c'].map(id => ({ id, engine: 'claude', label: id.slice(7), dir: '/x/' + id }));
const mk = (o) => {
    const calls = { cursor: [], walled: [], log: [] };
    const d = Object.assign({
        ownSetting: k => (k === 'defaultAccountCeiling' ? 70 : undefined),
        setting: (k, f) => (k === 'quotaHandoverPct' ? 90 : f),
        usage: () => [slot('claude-a', 92), slot('claude-b', 20), slot('claude-c', 50)],
        refreshSlot: async () => undefined,
        markWalled: s => calls.walled.push(s),
        stored: () => stored,
        active: () => ({}),
        standing: () => '',
        policies: () => [],
        sentry: () => undefined,
        guard: () => undefined,
        cardAccount: () => undefined,
        liveBatonOn: () => false,
        cursor: () => '',
        setCursor: (k, v) => calls.cursor.push([k, v]),
        log: l => calls.log.push(l)
    }, o || {});
    return { p: accountPlacement(d), calls };
};

console.log('\n== the wall ==');
{
    const { p } = mk();
    ok('the Account ceiling is the wall, under the handover line', p.accountCeiling().value === 70 && p.handoverLine() === 90);
    ok('a campaign\'s own wall above the handover line acts at the line', p.campaignWall({ ceiling: 95 }).value === 90);
    ok('…and an empty campaign box is the Account ceiling', p.campaignWall({}).value === 70);
}

console.log('\n== the launch pick ==');
{
    const { p, calls } = mk();
    ok('@emptiest picks the account with the most room', p.launchAccountPick({ engine: 'claude', account: '@emptiest' }).id === 'claude-b');
    ok('a stated slot passes straight through', p.launchAccountPick({ engine: 'claude', account: 'claude-a' }).id === 'claude-a');
    ok('a pick never moves the round-robin cursor', p.launchAccountPick({ engine: 'claude', account: '@round-robin' }) && calls.cursor.length === 0);
    p.launchAccountFor('claude', '@round-robin');
    ok('a launch that does not commit (a check, a readout) leaves it too', calls.cursor.length === 0);
    p.launchAccountFor('claude', '@round-robin', undefined, { commit: true });
    ok('a committed launch moves it once, under the engine\'s key', calls.cursor.length === 1 && calls.cursor[0][0] === roundRobinKey('claude'));
    const full = mk({ usage: () => [slot('claude-a', 95), slot('claude-b', 91), slot('claude-c', 99)] }).p;
    let threw = '';
    try { full.launchAccountFor('claude', '@emptiest'); } catch (e) { threw = e.message; }
    ok('‼️ a policy that can choose nothing THROWS at a spawn — never \'\' (the main sign-in)', !!threw);
    ok('…and the readout answers "no slot" instead of throwing', full.launchAccountSlot({ engine: 'claude', account: '@emptiest' }) === undefined);
}

console.log('\n== the relay door ==');
{
    const b = {
        id: 'btn_1', chainId: 'chn_x', hop: 1, prompt: 'go', state: 'waiting-end', why: 'w', createdAt: 1, updatedAt: 1,
        from: { sessionId: 's1', agentId: 'dev', engine: 'claude', cwd: 'D:\\repo' },
        inherit: { surface: 'console', account: 'claude-c', model: 'opus' }, want: { surface: 'inherit', account: '@emptiest' }
    };
    const kept = mk();
    const early = kept.p.successorPlacement(b, 'dev');
    ok('an early pass on a slot under the wall keeps the successor there (S-106), and says so in the log',
        early.stay.stay === true && early.stay.slotId === 'claude-c' && !early.park && /^baton btn_1: /.test(kept.calls.log[0] || ''));
    const { p, calls } = mk({ cardAccount: () => 'claude-a' });
    const full = p.successorPlacement(b, 'dev');
    ok('‼️ the predecessor\'s card at 92% (past the wall): no stay, the pool picks, nothing logged', full.stay.stay === false && calls.log.length === 0);
    const line90 = { ownSetting: k => (k === 'defaultAccountCeiling' ? 70 : k === 'contextHandoverStayAccountPct' ? 90 : undefined) };
    const atWall = mk(Object.assign({ usage: () => [slot('claude-b', 20), slot('claude-c', 80)] }, line90)).p.successorPlacement(b, 'dev');
    ok('‼️ X-470 — a stay is a start: 80% under a 90% stay line but past the 70% wall does not stay', atWall.stay.stay === false);
    ok('…while 60% under both does', mk(Object.assign({ usage: () => [slot('claude-b', 20), slot('claude-c', 60)] }, line90)).p.successorPlacement(b, 'dev').stay.stay === true);
    const lim = mk();
    lim.p.successorPlacement(Object.assign({}, b, { fault: 'limit' }), 'dev');
    ok('a plan-limit pass marks the walled account full until it turns over', lim.calls.walled[0] === 'claude-c');
    const none = mk({ usage: () => [slot('claude-a', 95), slot('claude-b', 91), slot('claude-c', 99)] }).p.successorPlacement(b, 'dev');
    ok('every account full: the row is parked to the first reset, with the refusal', !!none.park && none.park.resetsAt > now && !!none.park.refusal && none.park.bufferMin >= 0);
}

console.log('\n== the wake hold and the spawn ==');
{
    const task = { id: 't1', agentId: 'dev', engine: 'claude', account: '@emptiest' };
    const full = mk({ usage: () => [slot('claude-a', 95), slot('claude-b', 91), slot('claude-c', 99)], liveBatonOn: () => true }).p;
    ok('a parked relay row at its wake keeps waiting while its pool is full', full.relayWakeHold(task)?.code === 'quota:5h');
    ok('…a row no relay holds is not held here', mk({ usage: () => [slot('claude-a', 95)] }).p.relayWakeHold(task) === undefined);
    const early = mk({ usage: () => [slot('claude-a', 95), slot('claude-b', 91), slot('claude-c', 99)], liveBatonOn: () => { throw new ReferenceError('batonStore is not defined yet'); } }).p;
    ok('‼️ asked while activating (the relay not wired yet) it holds nothing and never throws', early.relayWakeHold(task) === undefined);
    const p = mk().p;
    const moved = p.replaceAccount({ id: 't2', account: 'claude-a', accountPool: '@emptiest' });
    ok('a system-placed slot past the wall at the start goes back to its pool, with the figure', moved && moved.account === '@emptiest' && /^a: 92% of its window, at or past the 70% wall/.test(moved.why));
    ok('…a slot with room is kept', p.replaceAccount({ id: 't3', account: 'claude-b', accountPool: '@emptiest' }) === undefined);
    const camp = mk({ sentry: () => ({ id: 'snt_1', ceiling: 95 }) }).p;
    ok('a sentry round is judged under its campaign\'s wall (capped at the line: 92 < 90 is false → moved)',
        !!camp.replaceAccount({ id: 't4', account: 'claude-a', accountPool: '@pool', sentryOf: 'snt_1' }));
    ok('…and a round of a campaign at 95 on a slot at 85 stays (85 < 90)',
        mk({ sentry: () => ({ id: 'snt_1', ceiling: 95 }), usage: () => [slot('claude-a', 85)] }).p.replaceAccount({ id: 't5', account: 'claude-a', accountPool: '@pool', sentryOf: 'snt_1' }) === undefined);
}

console.log('\n== the supervisor\'s turn (X-477) ==');
{
    const on = (pct, extra) => mk(Object.assign({ standing: () => 'claude-a', usage: () => [Object.assign(slot('claude-a', pct), extra || {})] })).p.supervisorRoom({ engine: 'claude' });
    ok('‼️ the sign-in it would run on at 92% is FULL under the Account ceiling (it used to start under its own 95)', on(92) === 'full');
    ok('…at 50% it is free', on(50) === 'free');
    ok('…a failed read that left a 95% floor is full, not free', on(-1, { state: 'error', floor: { percent: 95, resetsAt: now + 3600000, bars: [], fetchedAt: now } }) === 'full');
    ok('…no figure at all is unknown, never free (M-13)', on(-1) === 'unknown');
    ok('…a rejected sign-in is full', on(10, { state: 'expired' }) === 'full');
    const ext = require('fs').readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host\'s supervisor door asks the surface (Kapıcı spends no plan)',
        /supervisorRoom: p => \(p\.engine === KAPICI_ENGINE \? 'free' : supervisorRoom\(p\)\),/.test(ext) && !/percent < 95/.test(ext));
}

console.log('\n== X-530: an asleep account is never placed on ==');
{
    const sleepy = stored.map(x => (x.id === 'claude-b' ? { ...x, disabled: true } : x));
    // the real quota service never holds a row for an asleep account (test_account_usage.js)
    const awakeUsage = () => [slot('claude-a', 92), slot('claude-c', 50)];
    const { p } = mk({ stored: () => sleepy, sentry: () => ({ id: 'c1', engine: 'claude', pool: ['claude-b', 'claude-c'] }) });
    ok('X-530: a campaign pool drops an asleep account before a rule walks it', p.policyPool().accounts.join() === 'claude-c');
    const { p: q } = mk({ stored: () => sleepy, usage: awakeUsage, standing: () => 'claude-b', active: () => ({ claude: 'claude-c' }) });
    const r = q.launchAccountPick({ engine: 'claude', agentId: 'dev' });
    ok('…an agent standing on it is placed on the machine-wide choice, and the note says it was stepped over',
        r.id === 'claude-c' && /stepped over/.test(r.note));
    const stay = (st) => mk({ stored: () => st, ownSetting: k => (k === 'contextHandoverStayAccountPct' ? 80 : k === 'defaultAccountCeiling' ? 70 : undefined) }).p
        .handoverStay('claude-b', { kind: 'context', quotaPct: -1 });
    ok('…a successor is never kept on it, though its last figure is under the line', stay(stored).stay === true && stay(sleepy).stay === false);
    const { p: w, calls } = mk({ stored: () => sleepy, usage: awakeUsage });
    const b = { id: 'bt1', chainId: 'chn1', from: { engine: 'claude', sessionId: 's1' }, want: { account: 'claude-b' }, inherit: {} };
    const placed = w.successorPlacement(b, 'dev');
    ok('…and a chain set on it opens its next leg through @emptiest, saying so in the log',
        !placed.park && calls.log.some(l => /claude-b|b is disabled/.test(l) && /@emptiest/.test(l)));
}

console.log(`test_account_placement: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
