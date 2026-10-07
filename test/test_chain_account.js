// S-143 — the account a flowing chain's next legs open on, set by the user.
//
// What must not go wrong quietly: a chain nobody changed passes and opens
// exactly as before (no new key on its records, a leg's own single account is
// still not kept); the change lands where the pass and the door read it (the
// running leg's opener; a waiting successor and the opener that may pass
// again); a pinned single account stays the chain's rule like a pool; the
// first leg after the change opens on it even when the stay would keep the
// predecessor's slot, and the stay is back from that leg's own pass; a parked
// or ended chain is refused by name; no updatedAt moves.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const { passBaton } = require(path.join(OUT, 'baton.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { chainBoard } = require(path.join(OUT, 'chainBoard.js'));
const { chainActs } = require(path.join(OUT, 'chainsPage.js'));
const A = require(path.join(OUT, 'chainAccount.js'));
const O = require(path.join(OUT, 'chainAccountOps.js'));
const { accountPlacement } = require(path.join(ROOT, 'out', 'launch', 'accountPlacement.js'));

const NOW = 1790000000000;
const manifestFor = (launchId, account) => ({
    launchId, at: NOW - 1000, engine: 'claude',
    identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus', ...(account ? { account } : {}) }, agentId: 'dev', agentName: 'developer',
    mechanism: 'session', cwd: 'D:\\repo', surface: 'console'
});
function pass1(store, sessionId, account) {
    const launchId = 'lch_' + sessionId;
    const r = passBaton({ prompt: 'carry on from ' + sessionId, sessionId, launchId, manifest: manifestFor(launchId), account, prior: store.all(), now: NOW });
    if (!r.ok) { throw new Error(r.why); }
    store.put(r.baton, ...r.superseded);
    return r;
}
const start = (store, b, sid) => { const s = Object.assign({}, b, { state: 'started', toSessionId: sid, why: 'running' }); store.put(s); return s; };
/** leg 1 (s0) passed; leg 2 runs in s1 — on a chain whose first pass named `first` (default: none, so the @emptiest pool) */
function running(first) {
    const store = new BatonStore();
    const b1 = pass1(store, 's0', first).baton;
    return { store, opener: start(store, b1, 's1') };
}
const find = (store, id) => store.all().find(b => b.id === id);
const okCheck = () => '';
const ask = (chainId, account, refusal = okCheck) => ({ chainId, account, by: 'the user', refusal, now: NOW + 9 });

// ---------- an unmarked chain is the chain it was ----------
{
    const { store, opener } = running('claude-a');
    ok('an unmarked opener has no pinned and no rule', !('pinned' in opener.want) && !('rule' in opener) && opener.want.account === 'claude-a');
    const p = pass1(store, 's1', 'claude-b');
    ok('‼️ unmarked: a leg\'s own single account is NOT kept as the chain\'s rule (S-81 unchanged)', p.baton.want.account === 'claude-b' && !p.poolKept);
    ok('…and its want carries exactly surface and account', Object.keys(p.baton.want).sort().join() === 'account,surface');
    const s2 = start(store, p.baton, 's2');
    ok('…so the leg after it, asking nothing, opens on the default', pass1(store, 's2').baton.want.account === '@emptiest' && !!s2);
    ok('the door asks nothing of an unmarked baton', A.accountRuled(store.all(), find(store, p.baton.id)) === undefined);
}

// ---------- set on a running leg ----------
{
    const { store, opener } = running();
    const r = A.setChainAccount(store.all(), ask(opener.chainId, 'claude-b'));
    ok('a running leg: one record, its opener', r.ok && r.put.length === 1 && r.put[0].id === opener.id);
    ok('…want.account set, pinned (a single account), rule on the leg', r.put[0].want.account === 'claude-b' && r.put[0].want.pinned === true
        && r.put[0].rule.on === 'leg' && r.put[0].rule.by === 'the user' && r.put[0].rule.at === NOW + 9);
    ok('…no updatedAt moves (the crash-loop guard reads it)', r.put[0].updatedAt === opener.updatedAt && r.put[0].createdAt === opener.createdAt);
    ok('…the sentence names the leg it starts from and the running one', r.leg === 3 && /from leg 3 on, every leg opens on claude-b — leg 2 \(session s1\)/.test(r.sentence) && r.changed);
    store.put(...r.put);
    const p = pass1(store, 's1', 'claude-z');
    ok('‼️ the pass carries it — the leg naming another account does not move it', p.baton.want.account === 'claude-b' && p.baton.want.pinned === true && /claude-z was not used/.test(p.poolKept || ''));
    ok('‼️ the first leg after the change: the door reads the user\'s rule', /set chain .* account to claude-b/.test(A.accountRuled(store.all(), p.baton) || ''));
    const again = pass1(store, 's1');
    ok('a pass made again carries it too', again.baton.want.account === 'claude-b' && !!A.accountRuled(store.all(), again.baton));
    const s2 = start(store, again.baton, 's2');
    const p3 = pass1(store, 's2');
    ok('the leg after that keeps the pinned account (a pin is the chain\'s rule)', p3.baton.want.account === 'claude-b' && p3.baton.want.pinned === true && !!s2);
    ok('‼️ …and its door is the door it always was: the stay applies again', A.accountRuled(store.all(), p3.baton) === undefined);
}

// ---------- a rule after a pin unpins ----------
{
    const { store, opener } = running();
    store.put(...A.setChainAccount(store.all(), ask(opener.chainId, 'claude-b')).put);
    const r = A.setChainAccount(store.all(), ask(opener.chainId, '@round-robin'));
    ok('a rule after a pin: pinned is dropped', r.ok && r.put[0].want.account === '@round-robin' && !('pinned' in r.put[0].want) && r.pinned === false);
    store.put(...r.put);
    const p = pass1(store, 's1');
    ok('…and the pass keeps the rule as a pool, unpinned', p.baton.want.account === '@round-robin' && !('pinned' in p.baton.want));
    const same = A.setChainAccount(store.all(), ask(opener.chainId, '@round-robin'));
    ok('the same account said again: not changed, still marked (refused nothing)', !same.ok || same.changed === false);
}

// ---------- set while a successor waits ----------
{
    const { store, opener } = running();
    const w = pass1(store, 's1').baton;
    const r = A.setChainAccount(store.all(), ask(opener.chainId, '@emptiest'));
    const door = r.ok && r.put.find(b => b.id === w.id);
    const leg = r.ok && r.put.find(b => b.id === opener.id);
    ok('a waiting successor is marked at the door', !!door && door.want.account === '@emptiest' && door.rule.on === 'door' && door.state === 'waiting-end');
    ok('…and the opener that passed it, in case it passes again', !!leg && leg.rule.on === 'leg' && leg.want.account === '@emptiest');
    ok('…the sentence names the waiting leg', r.leg === 3 && /leg 3, waiting at the door/.test(r.sentence));
    store.put(...r.put);
    ok('the door reads the waiting baton\'s own mark', !!A.accountRuled(store.all(), find(store, w.id)));
    const re = pass1(store, 's1', 'claude-c');
    ok('‼️ a pass made again after the change opens on it as well', re.baton.want.account === '@emptiest' && !!A.accountRuled(store.all(), re.baton)
        && find(store, w.id).state === 'stopped');
    const marked = A.setChainAccount(store.all(), ask(opener.chainId, 'claude-b'));
    store.put(...marked.put);
    const s2 = start(store, find(store, re.baton.id), 's2');
    ok('the baton marked at the door starts and becomes the next leg\'s opener, its door mark kept', s2.rule.on === 'door');
    const p3 = pass1(store, 's2');
    ok('‼️ …whose own pass keeps the account but is NOT ruled again: the stay applies from there', p3.baton.want.account === 'claude-b' && A.accountRuled(store.all(), p3.baton) === undefined);
}

// ---------- the seal of leg 1 ----------
{
    const store = new BatonStore();
    const seal = { id: 'btn_seal', chainId: 'chn_s', hop: 0, prompt: '', from: { sessionId: 'sx', agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', launchId: 'lch_sx' },
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' }, state: 'started', toSessionId: 'sx', why: 'sealed', createdAt: NOW, updatedAt: NOW };
    store.put(seal);
    const r = A.setChainAccount(store.all(), ask('chn_s', 'claude-a'));
    ok('leg 1 runs on its seal: the seal is the opener marked, leg 2 named', r.ok && r.put[0].id === 'btn_seal' && r.leg === 2);
}

// ---------- refusals ----------
{
    const { store, opener } = running();
    const chain = opener.chainId;
    ok('no account: refused', !A.setChainAccount(store.all(), ask(chain, '  ')).ok);
    ok('no such chain: refused', /no chain chn_none/.test(A.setChainAccount(store.all(), ask('chn_none', 'claude-a')).why || ''));
    const bad = A.setChainAccount(store.all(), ask(chain, 'claude-q', (a, e) => (a === 'claude-q' ? `No account "${a}" is stored (${e}).` : '')));
    ok('the account check is asked with the chain\'s engine and its words are the refusal', !bad.ok && bad.why === 'No account "claude-q" is stored (claude).');
    const w = pass1(store, 's1').baton;
    store.put(Object.assign({}, find(store, w.id), { state: 'parked', taskId: 'tsk_9', wakeAt: NOW + 60000 }));
    const parked = A.setChainAccount(store.all(), ask(chain, 'claude-a'));
    ok('‼️ a parked leg is refused by name — its row holds its account', !parked.ok && /leg 3 .* waits on task tsk_9, which holds its account/.test(parked.why));
    ok('…and the page offers no control on it', A.chainAccountOf(store.all(), chain).settable === false);
    const s2 = new BatonStore();
    const b = pass1(s2, 'e0').baton;
    s2.put(Object.assign({}, b, { state: 'stopped', why: 'stopped by the user' }));
    ok('a chain with nothing running or waiting is refused', /is stopped — no leg runs and no successor waits/.test(A.setChainAccount(s2.all(), ask(b.chainId, 'claude-a')).why || ''));
}

// ---------- the door: the stay yields once ----------
{
    const now = Date.now();
    const slot = (id, pct) => ({ slotId: id, engine: 'claude', state: 'ok', percent: pct, resetsAt: now + 3600000, plan: 'max', fetchedAt: now });
    const stored = ['claude-a', 'claude-b', 'claude-c'].map(id => ({ id, engine: 'claude', label: id.slice(7), dir: '/x/' + id }));
    const log = [];
    const p = accountPlacement({
        ownSetting: k => (k === 'defaultAccountCeiling' ? 70 : undefined), setting: (k, f) => (k === 'quotaHandoverPct' ? 90 : f),
        usage: () => [slot('claude-a', 10), slot('claude-b', 20), slot('claude-c', 50)], refreshSlot: async () => undefined,
        markWalled: () => { }, stored: () => stored, active: () => ({}), standing: () => '', policies: () => [], sentry: () => undefined,
        guard: () => undefined, cardAccount: () => undefined, liveBatonOn: () => false, cursor: () => '', setCursor: () => { }, log: l => log.push(l)
    });
    const b = { id: 'btn_1', chainId: 'chn_x', hop: 1, prompt: 'go', state: 'waiting-end', why: 'w', createdAt: 1, updatedAt: 1,
        from: { sessionId: 's1', agentId: 'dev', engine: 'claude', cwd: 'D:\\repo' },
        inherit: { surface: 'console', account: 'claude-c', model: 'opus' }, want: { surface: 'inherit', account: 'claude-a', pinned: true } };
    ok('without the user\'s rule the stay keeps the predecessor\'s slot (S-106, as before)', p.successorPlacement(b, 'dev').stay.stay === true);
    const ruled = p.successorPlacement(b, 'dev', 'the user set it');
    ok('‼️ with it, no stay: the leg opens on want.account, and the log says why', ruled.stay.stay === false && !ruled.park && log.some(l => /btn_1: the user set it/.test(l)));
}

// ---------- the board and the page's act ----------
{
    const { store, opener } = running();
    store.put(...A.setChainAccount(store.all(), ask(opener.chainId, 'claude-b')).put);
    const rows = chainBoard({ batons: store.all(), links: [], facts: () => ({ alive: true }), now: NOW, maxLegs: 6, thresholds: { hangMs: 1e9, waitMs: 1e9 } });
    const row = rows.find(r => r.chainId === opener.chainId);
    ok('the Next column reads the new account and who set it', row.next.account === 'claude-b' && row.next.rule.by === 'the user');
    ok('a running chain offers the account control', chainActs(row, store.all()).account === true);
    ok('a trimmed row offers none', chainActs(Object.assign({}, row, { trimmed: true }), store.all()).account === false);
    // the notices path hands chainActs thin records (no from, no want): it must answer, never throw
    let thin;
    try { thin = chainActs(row, [{ id: 'b1', chainId: opener.chainId, hop: 9, state: 'started', createdAt: 1, updatedAt: 1 }]); } catch (e) { thin = e; }
    ok('‼️ a thin record (no from, no want) never throws, and offers no control', thin && thin.account === false);
}

// ---------- the op ----------
(async () => {
    const { store, opener } = running();
    const reg = new BridgeRegistry();
    const choices = [{ id: '@emptiest', label: '@emptiest', detail: 'the emptiest' }, { id: 'claude-b', label: 'b', detail: '20%' }];
    O.registerChainAccountOps(reg, { store, now: () => NOW + 7, choices: e => (e === 'claude' ? choices : []),
        refusal: a => (a === 'claude-q' ? 'No account "claude-q" is stored.' : '') });
    const read = await reg.dispatch('chains.setAccount', { session: 's1' });
    ok('without account: what it opens on now, settable, the engine\'s choices', read.ok && read.result.account === '@emptiest' && read.result.settable === true
        && read.result.rule === null && read.result.choices.length === 2 && read.result.chainId === opener.chainId);
    const set = await reg.dispatch('chains.setAccount', { chain: opener.chainId, account: 'claude-b' });
    ok('with account: stored, the sentence and the records answered', set.ok && set.result.account === 'claude-b' && set.result.pinned === true
        && /every leg opens on claude-b/.test(set.result.sentence) && find(store, opener.id).want.account === 'claude-b' && set.result.batons.length === 1);
    const pre = await reg.dispatch('chains.setAccount', { session: 's1', account: '@emptiest' });
    ok('a leg\'s session names its chain', pre.ok && find(store, opener.id).want.account === '@emptiest');
    const no = await reg.dispatch('chains.setAccount', { chain: opener.chainId, account: 'claude-q' });
    ok('a refused account is the op\'s error, nothing stored', !no.ok && /claude-q/.test(no.error) && find(store, opener.id).want.account === '@emptiest');
    const none = await reg.dispatch('chains.setAccount', { chain: 'chn_none' });
    ok('an unknown chain is refused', !none.ok && /say which chain/.test(none.error));
    const ops = await reg.dispatch('farm.ops', {});
    ok('farm.ops lists chains.setAccount', !ops.ok || JSON.stringify(ops.result).includes('chains.setAccount'));
    await page();
    console.log(`test_chain_account: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();

// ---------- the page: the account is the control, while it can be set ----------
async function page() {
    const vscodeStub = { Uri: { joinPath: () => ({}) }, window: {}, commands: { executeCommand: () => Promise.resolve() }, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    const orig = Module._load;
    Module._load = function (request) { return request === 'vscode' ? vscodeStub : orig.apply(this, arguments); };
    const fx = require('./fixtures/chains.js');
    const { runPage } = require('./lib_page_dom');
    const D = fx.data();
    const r = runPage('chains.js', D);
    const btn = id => r.query('[data-act="account"]').find(e => e.dataset.chain === id);
    const settable = D.chains.filter(c => c.acts.account).map(c => c.chainId);
    ok('the fixture has running and waiting chains to set', settable.includes('chn_wait') && settable.includes('chn_night'));
    ok('‼️ a running and a waiting chain draw the account as a button', !!btn('chn_night') && !!btn('chn_wait'));
    ok('a parked and a finished chain draw it as text', !btn('chn_park') && !btn('chn_done'));
    btn('chn_wait').click();
    ok('pressing it posts account with the chain', r.last().type === 'account' && r.last().chainId === 'chn_wait');
    ok('the cell\'s panel says how to change it', /Click the account to change it for the next legs\./.test(r.html()));
    const { ChainsPanel } = require(path.join(ROOT, 'out', 'panels', 'chainsPanel.js'));
    const inbox = [], out = [], asked = [];
    const host = {
        reveal() { }, onDidDispose: () => ({ dispose() { } }), ask: { pick: async () => undefined },
        webview: { html: '', cspSource: "'self'", asWebviewUri: u => ({ toString: () => '/res/' + u.path }),
            postMessage: m => { out.push(m); return Promise.resolve(true); }, onDidReceiveMessage: f => { inbox.push(f); return { dispose() { } }; } }
    };
    ChainsPanel.openOn(host, { extensionUri: { path: '/ext' }, build: () => fx.data(), projects: () => [], account: async (id, on) => { asked.push([id, !!on.ask]); },
        onDidChange: () => ({ dispose() { } }) });
    for (const f of inbox) { await f({ type: 'account', chainId: 'chn_wait' }); }
    ok('the panel hands the press to the account picker on its own host, then redraws', asked.length === 1 && asked[0][0] === 'chn_wait' && asked[0][1] === true
        && out.some(m => m.type === 'data'));
    // the picker: the engine's rows, the current one marked, written by the op's own body
    const { pickChainAccount } = require(path.join(ROOT, 'out', 'batonAccountUi.js'));
    const { store, opener } = running();
    const said = [];
    let rows = [];
    const fake = (choose) => ({ pick: async (items, o) => { rows = items; said.push(o.title); return items.find(i => i.id === choose); },
        info: async m => { said.push(m); }, warn: async m => { said.push('WARN ' + m); } });
    const deps = { store, now: () => NOW, choices: () => [{ id: '@emptiest', label: '@emptiest', detail: 'x' }, { id: 'claude-b', label: 'b', detail: 'y' }], refusal: () => '' };
    await pickChainAccount(deps, opener.chainId, 'the user (Chains page)', fake('claude-b'));
    ok('the picker marks the account in force and writes the pick', rows.find(i => i.id === '@emptiest').description === 'now' && !rows.find(i => i.id === 'claude-b').description
        && find(store, opener.id).want.account === 'claude-b' && find(store, opener.id).rule.by === 'the user (Chains page)' && /every leg opens on claude-b/.test(said.at(-1)));
    await pickChainAccount(deps, opener.chainId, 'u', fake(undefined));
    ok('dismissed: nothing changes', find(store, opener.id).want.account === 'claude-b');
    const w = pass1(store, 's1').baton;
    store.put(Object.assign({}, find(store, w.id), { state: 'parked', taskId: 'tsk_3' }));
    said.length = 0;
    await pickChainAccount(deps, opener.chainId, 'u', fake('@emptiest'));
    ok('a parked chain: no picker, the refusal is said', said.length === 1 && /waits on task tsk_3/.test(said[0]));
    Module._load = orig;
}
