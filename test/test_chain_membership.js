// U-163 — A CHAIN ID WORKS WHERE A SESSION ID WORKS.
//
// What must not go wrong quietly: every leg of a chain is found by its id —
// the FIRST one too, whose opening prompt never names the chain; a chain keeps
// its legs after the store drops its batons at the cap; a session's place
// (leg, prev, next, first, last, still running) is one answer for the page's
// arrows, the table's cell and the op; the menu only offers the chain on a
// session that ran a leg of one.
//
//   node test/test_chain_membership.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const M = require(path.join(OUT, 'chainMembership.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BATON_STORE_CAP } = require(path.join(OUT, 'baton.js'));
const { findSessions } = require(path.join(OUT, 'sessionFind.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { registerChainOps, chainedSessionOf } = require(path.join(OUT, 'chainOps.js'));
const { CTX_ITEMS } = require(path.join(OUT, 'ctxmenu.js'));

const NOW = 1790000000000;
let t = 0;
const from = (sessionId) => ({ sessionId, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', launchId: 'l' });
const mk = (id, chainId, hop, state, sid, to) => {
    t += 1000;
    return {
        id, chainId, hop, state, prompt: 'p', why: 'w', from: from(sid),
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
        ...(to ? { toSessionId: to } : {}), createdAt: NOW + t, updatedAt: NOW + t
    };
};
const A1 = 'aaaa1111-0000-0000-0000-000000000001';
const A2 = 'aaaa2222-0000-0000-0000-000000000002';
const A3 = 'aaaa3333-0000-0000-0000-000000000003';
const running = [
    mk('s0', 'chn_run', 0, 'started', A1, A1),
    mk('b1', 'chn_run', 1, 'started', A1, A2),
    mk('b2', 'chn_run', 2, 'started', A2, A3)
];
const links = list => list.map(M.linkOf);

// ---------- the place of each leg ----------
{
    const ix = M.chainIndex(links(running));
    const p1 = M.chainPlace(ix, A1), p2 = M.chainPlace(ix, A2), p3 = M.chainPlace(ix, A3);
    ok('the seal names leg 1, each pass the next leg', p1.leg === 1 && p2.leg === 2 && p3.leg === 3);
    ok('leg 1 is first, has no prev, points at leg 2', p1.first && !p1.prev && p1.next === A2 && !p1.last);
    ok('a middle leg has both neighbours and no badge', p2.prev === A1 && p2.next === A3 && !p2.first && !p2.last);
    ok('the newest leg of a running chain is last AND open', p3.last && p3.open && !p3.next && p3.prev === A2);
    ok('a session no baton touched has no place', M.chainPlace(ix, 'nobody') === undefined);
}

// ---------- an ended chain ----------
{
    const ended = [...running, mk('end', 'chn_run', 3, 'done', A3)];
    const p3 = M.chainPlace(M.chainIndex(links(ended)), A3);
    ok('a done record: the chain is closed, its last leg stays leg 3', p3.leg === 3 && p3.last && !p3.open);
}

// ---------- a chain opened before seals existed ----------
{
    const old = [mk('o1', 'chn_old', 1, 'started', 'u1', 'u2')];
    const ix = M.chainIndex(links(old));
    const u1 = M.chainPlace(ix, 'u1');
    ok('no seal: the first pass\'s sender is leg 1, and first', u1 && u1.leg === 1 && u1.first && u1.next === 'u2');
}

// ---------- a second seal on a leg does not move it ----------
{
    const twice = [...running, mk('s9', 'chn_other', 0, 'started', A2, A2)];
    const ix = M.chainIndex(links(twice));
    ok('a leg a second chain was attached to stays in the chain that opened it',
        ix.bySession.get(A2).chainId === 'chn_run' && ix.bySession.get(A2).leg === 2);
}

// ---------- matching an id ----------
{
    const ix = M.chainIndex(links(running));
    const hit = M.chainSessionsMatching(ix, 'CHN_RUN');
    ok('a chain id (any case) finds every leg, the first one too', hit.size === 3 && hit.has(A1));
    ok('three characters match nothing — "chn" is every chain', M.chainSessionsMatching(ix, 'chn').size === 0);
    ok('a prefix names one chained session; an unknown one nothing', chainedSessionOf(ix, 'aaaa2') === A2 && !chainedSessionOf(ix, 'zzzz'));
    ok('an ambiguous prefix names nobody', chainedSessionOf(ix, 'aaaa') === undefined);
}

// ---------- the table's cell for a dropped chain ----------
{
    const v = M.placeCardView(M.chainPlace(M.chainIndex(links(running)), A2));
    ok('the cell: ⑂ and the leg, the chain id in the panel', v.chip === '⑂ 2' && v.chainId === 'chn_run' && v.lines[0].includes('chn_run') && !v.stoppable);
    ok('nothing to draw for no place', M.placeCardView(undefined) === undefined);
}

// ---------- the store keeps the links of what it drops ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-chain-'));
    const file = path.join(dir, 'batons.json');
    try {
        const store = new BatonStore(file);
        const many = [];
        for (let c = 0; c < 12; c++) {
            for (let h = 0; h < 20; h++) {
                many.push(h === 0 ? mk(`c${c}h0`, `chn_${c}`, 0, "started", `c${c}s1`, `c${c}s1`) : mk(`c${c}h${h}`, `chn_${c}`, h, "started", `c${c}s${h}`, `c${c}s${h + 1}`));
            }
        }
        store.put(...many);
        store.flush();
        ok('the batons are cut to the cap', store.all().length === BATON_STORE_CAP);
        const again = new BatonStore(file);
        const ix = M.chainIndex(again.links());
        ok('a reloaded store still knows every chain', [...Array(12).keys()].every(c => ix.byChain.has(`chn_${c}`)));
        ok('the oldest chain, whose batons were all dropped, keeps its legs in order',
            ix.byChain.get('chn_0').legs.length === 20 && ix.byChain.get('chn_0').legs[0].sessionId === "c0s1");
        ok('a dropped leg still finds its chain', M.chainPlace(ix, 'c0s5').chainId === 'chn_0');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ---------- sessions.find and the op read the same index ----------
(async () => {
    M.setChainSource(() => links(running));
    const pool = [
        { sessionId: A1, file: 'a1.jsonl', title: 'fix the thing', agentName: 'developer', tags: [], lastTs: 1, mtime: 1 },
        { sessionId: A2, file: 'a2.jsonl', title: '=== BATON RELAY — chain chn_run · leg 2 ===', agentName: 'developer', tags: [], lastTs: 2, mtime: 2 },
        { sessionId: A3, file: 'a3.jsonl', title: '=== BATON RELAY — chain chn_run · leg 3 ===', agentName: 'developer', tags: [], lastTs: 3, mtime: 3 },
        { sessionId: 'other', file: 'o.jsonl', title: 'unrelated', agentName: 'x', tags: [], lastTs: 4, mtime: 4 }
    ];
    const found = findSessions(pool, 'chn_run', 10).map(s => s.sessionId);
    ok('sessions.find: a chain id finds all three legs, the first one included', found.length === 3 && found.includes(A1) && !found.includes('other'));
    ok('sessions.find: an exact session id still wins first', findSessions(pool, A2, 10)[0].sessionId === A2);

    const reg = new BridgeRegistry();
    registerChainOps(reg, { sessions: () => pool });
    const byChain = await reg.dispatch('baton.legs', { chain: 'chn_run' });
    ok('baton.legs by chain: the legs in order, with their titles', byChain.ok && byChain.result.legs.map(l => l.leg).join() === '1,2,3'
        && byChain.result.legs[0].title === 'fix the thing' && byChain.result.open === true && !byChain.result.place);
    const bySession = await reg.dispatch('baton.legs', { session: 'aaaa2' });
    ok('baton.legs by a session prefix: its place too', bySession.ok && bySession.result.place.leg === 2
        && bySession.result.place.prev === A1 && bySession.result.place.next === A3);
    const none = await reg.dispatch('baton.legs', {});
    ok('baton.legs with nothing: refused, naming both', !none.ok && /say which: chain/.test(none.error));
    const stranger = await reg.dispatch('baton.legs', { session: 'other' });
    ok('baton.legs on a session in no relay: refused by name', !stranger.ok && /ran no leg of a relay/.test(stranger.error));
    const ops = await reg.dispatch('farm.ops', {});
    ok('baton.legs is in the catalogue', ops.ok && JSON.stringify(ops.result).includes('baton.legs'));

    // ---------- the surfaces ----------
    const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok('the Sessions filter box reads the chain id', /\(r\.chain \? r\.chain\.chainId/.test(src('media/sessionsTable.js')));
    ok('the Search page\'s session filter reads the chain id', /chainSessionsMatching\(ix, session\)/.test(src('src/panels/searchPanel.ts')) && /chainIndexNow\(\)/.test(src('src/panels/searchPanel.ts')));
    ok('"Show This Chain" lands on the table\'s own filter', /setChainFilter/.test(src('media/sessionsTable.js')) && /table\.setChainFilter\(sc\.chain\)/.test(src('media/sessionsPage.js')));
    const chained = CTX_ITEMS.filter(i => i.command === 'agentfarm.copyChainId' || i.command === 'agentfarm.showChain');
    ok('both chain items, on the session rows, the Console and the timeline, and only on a chained session',
        chained.length === 6 && chained.every(i => /sessionId in agentfarm\.chainSessions$/.test(i.when)));

    // ---------- the page's strip ----------
    const box = { window: {}, document: undefined };
    vm.runInNewContext(src('media/afChainNav.js'), box);
    const N = box.window.AFChainNav;
    // U-173 — « ‹ ⑂ n/N › », the chain id once, the closing chip, the leg list.
    const legs3 = [{ leg: 1, sessionId: A1 }, { leg: 2, sessionId: A2 }, { leg: 3, sessionId: A3 }];
    const at1 = { chainId: 'chn_run', self: A1, leg: 1, of: 3, legs: legs3, prev: '', next: A2, first: true, last: false, open: true };
    const first = N.html(at1);
    ok('leg 1: dead « and ‹, live › to leg 2 and » to leg 3, the id to copy',
        (first.match(/<button [^>]*class="afchain-nav" disabled/g) || []).length === 2
        && first.includes(`data-chaingo="${A2}"`) && first.includes(`data-chaingo="${A3}"`) && first.includes('data-chaincopy="chn_run"'));
    ok('the chain id is written ONCE on the strip', (first.match(/chn_run<\/button>/g) || []).length === 1);
    ok('the counter reads ⑂ 1/3 and opens the leg list', first.includes('data-chainmenu="1"') && first.includes('⑂ 1/3'));
    ok('leg 1 closes on the chip "⑂ 1 first"', /⑂ 1 <b>first<\/b>/.test(N.chip(at1)));
    const at3 = open => ({ chainId: 'chn_run', self: A3, leg: 3, of: 3, legs: legs3, prev: A2, next: '', first: false, last: true, open });
    ok('the newest leg of a running chain says "latest", not "last"', N.chip(at3(true)).includes('<b>latest</b>') && !N.chip(at3(true)).includes('<b>last</b>'));
    ok('the final leg of an ended chain says "last"', N.chip(at3(false)).includes('<b>last</b>'));
    const mid = N.chip({ chainId: 'chn_run', self: A2, leg: 2, of: 3, legs: legs3, prev: A1, next: A3, first: false, last: false, open: true });
    ok('a middle leg closes on its number alone', /⑂ 2<\/span>/.test(mid) && !/<b>/.test(mid.split('</span>')[0]));
    const menu = N.menuHtml({ ...at3(true), self: A2 });
    ok('the list has every leg, this one marked and not pressable', (menu.match(/afchain-mi/g) || []).length === 3
        && /afchain-mi cur" role="option" aria-selected="true" disabled/.test(menu) && menu.includes(`data-chaingo="${A1}"`));
    ok('a session in no chain draws nothing', N.html(undefined) === '' && N.html({}) === '' && N.chip(undefined) === '' && N.menuHtml(null) === '');
    const viewerJs = src('media/sessionViewer.js');
    ok('a successor leg says "⑂ baton" and its launcher label moves into the AFTip', /const relay = DATA\.chain && \(DATA\.chain\.leg >= 2 \|\| DATA\.origin === 'auto'\)/.test(viewerJs)
        && /Launched as: \$\{launched\}/.test(viewerJs));

    console.log(`test_chain_membership.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
