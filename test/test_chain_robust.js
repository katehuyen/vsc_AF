// U-170 / U-171 — A CHAIN RECORD THAT DID NOT FLOW THE IDEAL WAY STILL READS RIGHT.
//
// Measured on chn_muin1eiu002hyo: the ceiling rose from 25 to 35 mid-chain, so
// titles taken from each leg's opening header read "leg 14/25" beside
// "leg 23/35"; leg 22 ended the chain and reopened it on the same hop; leg 14
// was resumed a day after it passed and its row sorted between legs 23 and 24.
// What must hold: a leg is found by its SESSION (two successors may share a
// number), a reopened chain is open, a gap names the leg numbers around it,
// every leg says when it ran, and a successor leg is titled by its chain's
// first leg rather than by the frozen header.
//
//   node test/test_chain_robust.js
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const M = require(path.join(OUT, 'chainMembership.js'));
const { relaySubject } = require(path.join(OUT, 'relayTitle.js'));
const { batonCardView } = require(path.join(OUT, 'batonView.js'));

const NOW = 1790000000000;
let t = 0;
const link = (chainId, hop, state, from, to) => {
    t += 60000;
    return { chainId, hop, state, from, ...(to ? { to } : {}), createdAt: NOW + t, updatedAt: NOW + t };
};
const baton = (id, chainId, hop, state, from, to) => {
    t += 60000;
    return {
        id, chainId, hop, state, prompt: 'p', why: 'w',
        from: { sessionId: from, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo' },
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
        ...(to ? { toSessionId: to } : {}), createdAt: NOW + t, updatedAt: NOW + t
    };
};

// A pass twice from leg 2: two successors share leg 3.
{
    const L = [
        link('c1', 0, 'started', 'S1', 'S1'),
        link('c1', 1, 'started', 'S1', 'S2'),
        link('c1', 2, 'started', 'S2', 'S3a'),
        link('c1', 2, 'started', 'S2', 'S3b'),
        link('c1', 3, 'started', 'S3b', 'S4')
    ];
    const ix = M.chainIndex(L);
    const legs = ix.byChain.get('c1').legs;
    ok('double pass: both successors are on record', legs.some(l => l.sessionId === 'S3a') && legs.some(l => l.sessionId === 'S3b'));
    ok('double pass: legs ordered by number, then by when they opened',
        legs.map(l => l.sessionId).join(',') === 'S1,S2,S3a,S3b,S4');
    const a = M.chainPlace(ix, 'S3a'), b = M.chainPlace(ix, 'S3b');
    ok('double pass: each successor finds its OWN place', a.leg === 3 && b.leg === 3 && a.next === 'S3b' && b.prev === 'S3a' && b.next === 'S4');
    ok('double pass: the chain stays open and S4 is its last', M.chainPlace(ix, 'S4').last === true && M.chainPlace(ix, 'S4').open === true);
}

// The chain ended, then was reopened by a pass on the same hop.
{
    const L = [
        link('c2', 0, 'started', 'R1', 'R1'),
        link('c2', 1, 'started', 'R1', 'R2'),
        link('c2', 2, 'done', 'R2'),
        link('c2', 2, 'started', 'R2', 'R3')
    ];
    const ix = M.chainIndex(L);
    const p2 = M.chainPlace(ix, 'R2'), p3 = M.chainPlace(ix, 'R3');
    ok('reopened: the chain is open again', p3.open === true && p3.last === true);
    ok('reopened: the leg that ended it walks on to the new successor', p2.next === 'R3' && p2.leg === 2);
}

// Links lost to the store's cap: a gap between leg 2 and leg 4.
{
    const L = [
        link('c3', 0, 'started', 'G1', 'G1'),
        link('c3', 1, 'started', 'G1', 'G2'),
        link('c3', 3, 'started', 'G3', 'G4')
    ];
    const ix = M.chainIndex(L);
    const p = M.chainPlace(ix, 'G4');
    ok('gap: the leg after it still walks back', p.prev === 'G3');
    const view = M.placeCardView(p, 'G4');
    ok('gap: the predecessor is named with its leg number', view.lines.some(x => /session G3 \(leg 3\)/.test(x)));
    const g2 = M.placeCardView(M.chainPlace(ix, 'G2'), 'G2');
    ok('gap: leg 2 names leg 3 as its successor, so the missing record is visible', g2.lines.some(x => /Successor: session G3 \(leg 3\)/.test(x)));
}

// When a leg ran.
{
    const L = [link('c4', 0, 'started', 'W1', 'W1'), link('c4', 1, 'started', 'W1', 'W2'), link('c4', 2, 'started', 'W2', 'W3')];
    const ix = M.chainIndex(L);
    const w2 = ix.byChain.get('c4').legs.find(l => l.sessionId === 'W2');
    ok('a leg knows when it opened and when it passed', w2.opened === L[1].createdAt && w2.passed === L[2].createdAt);
    const ran = M.legWindow(ix.byChain.get('c4').legs, 'W2');
    ok('Ran: names both ends', /^Ran: .+ → .+ \(passed\)\.$/.test(ran));
    ok('the running leg has no pass yet', /no pass on record/.test(M.legWindow(ix.byChain.get('c4').legs, 'W3')));
    ok('a session in no chain has no window', M.legWindow(ix.byChain.get('c4').legs, 'nobody') === undefined);
    const card = M.placeCardView(M.chainPlace(ix, 'W2'), 'W2');
    ok('the table cell carries the window', card.lines.some(x => x.startsWith('Ran: ')));
}

// The store's own view carries it too.
{
    const B = [
        baton('b0', 'c5', 0, 'started', 'V1', 'V1'),
        baton('b1', 'c5', 1, 'started', 'V1', 'V2'),
        baton('b2', 'c5', 2, 'started', 'V2', 'V3')
    ];
    const v = batonCardView(B, 'V2');
    ok('batonCardView: Ran line, passed', v.lines.some(x => /^Ran: .+ → .+ \(passed\)\.$/.test(x)));
    const last = batonCardView(B, 'V3');
    ok('batonCardView: the running leg has no pass yet', last.lines.some(x => /no pass yet/.test(x)));
}

// A successor leg is titled by its chain's first leg.
{
    const L = [
        link('c6', 0, 'started', 'T1', 'T1'),
        link('c6', 1, 'started', 'T1', 'T2'),
        link('c6', 2, 'started', 'T2', 'T3'),
        link('c7', 2, 'started', 'X2', 'X3')
    ];
    const ix = M.chainIndex(L);
    const titles = { T1: 'finish the whole u169 family', T2: '=== BATON RELAY — chain c6 · leg 2/25 ===', X1: 'orphan root' };
    const titleOf = sid => titles[sid];
    ok('leg 3 takes the first leg\'s title', relaySubject(ix, 'T3', titleOf) === 'finish the whole u169 family');
    ok('leg 2 too — never its own frozen header', relaySubject(ix, 'T2', titleOf) === 'finish the whole u169 family');
    ok('the first leg keeps its own title', relaySubject(ix, 'T1', titleOf) === undefined);
    ok('a chain whose first leg is not on record changes nothing', relaySubject(ix, 'X3', titleOf) === undefined);
    ok('a session in no chain changes nothing', relaySubject(ix, 'nobody', titleOf) === undefined);
    ok('a first leg with no title changes nothing', relaySubject(ix, 'T3', () => '  ') === undefined);
}

// U-174 — the ⑂ Baton category, one rule for the Search page and sessions.recent.
{
    const ix = M.chainIndex([link('c8', 0, 'started', 'B1', 'B1'), link('c8', 1, 'started', 'B1', 'B2')]);
    ok('a program\'s relay leg is Baton', M.isBatonRun(ix, 'B2', 'auto') === true);
    ok('a person\'s own session made leg 1 stays You', M.isBatonRun(ix, 'B1', 'user') === false);
    ok('automation in no chain is not Baton', M.isBatonRun(ix, 'nobody', 'auto') === false);
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'panels', 'searchPanel.ts'), 'utf8');
    ok('the Search scope and its op accept origin "baton" and split it from Automation',
        /f\.origin === 'baton'/.test(src) && /isBatonRun\(ix, s\.sessionId, o\) \? 'baton' : o/.test(src));
    const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('sessions.recent takes origin "baton" by the same rule', /isBatonRun\(chainIx, s\.sessionId, o\) \? 'baton' : o/.test(ext)
        && /"baton" = legs of a baton relay a program opened/.test(ext));
}

console.log(`test_chain_robust.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
