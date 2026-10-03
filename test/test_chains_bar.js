// S-128 — THE CHAINS PAGE'S BAR: sort, agent / project / reason filters, a search that reaches the
// handover words, and a Show limit that never hides a live chain or one that needs attention.
//
// What must not go wrong quietly: the page's reason filter and chains.list's `reason` answer the
// same rows (one meaning, two doors); the limit cuts only finished chains and says how many it hid;
// the search finds a chain by words that are nowhere on its row; the choice survives a reload.
//
//   node test/test_chains_bar.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afChainsBar.js'), 'utf8'), box);
const B = box.window.AFChainsBar;
const C = require(path.join(ROOT, 'out', 'core', 'chainBoard.js'));
const fx = require('./fixtures/chains.js');
const { runPage } = require('./lib_page_dom');

const D = fx.data();
const rows = D.chains;
const ids = list => list.map(r => r.chainId).sort().join();
const q = o => Object.assign(B.fresh(), o);
const ACTIVE = ['running', 'waiting', 'parked'];

// ---------- one meaning, two doors ----------
ok('‼️ every row\'s reasons are the bridge\'s own', rows.every(r => JSON.stringify(B.reasonsOf(r)) === JSON.stringify(C.reasonsOf(r))));
const kinds = ['hanging', 'stuck-wait', 'cut', 'fault', 'brake', 'ceiling', 'barren'];
ok('‼️ the page\'s reason filter and chains.list reason= pick the same chains, reason by reason',
    kinds.every(k => ids(B.view(rows, q({ reasons: [k], show: 0 })).rows) === ids(C.filterBoard(rows, { reason: k }))));
ok('…and the fixture exercises it: at least three reasons pick something', kinds.filter(k => C.filterBoard(rows, { reason: k }).length).length >= 3);

// ---------- the limit ----------
const finished = rows.filter(r => !ACTIVE.includes(r.state) && !r.signals.length);
const v1 = B.view(rows, q({ show: 1 }));
ok('‼️ the limit cuts only finished chains: every live or attention chain stays listed',
    rows.filter(r => ACTIVE.includes(r.state) || r.signals.length).every(r => v1.rows.includes(r)));
ok('…and says how many it hid', finished.length > 1 && v1.hidden === finished.length - 1 && v1.rows.length === rows.length - v1.hidden);
const firstFinished = v1.rows.findIndex(r => finished.includes(r));
ok('live and attention chains come first', firstFinished === v1.rows.length - 1);
ok('All lists everything', B.view(rows, q({ show: 0 })).rows.length === rows.length && B.view(rows, q({ show: 0 })).hidden === 0);

// ---------- filters, search, sort ----------
ok('an agent', ids(B.view(rows, q({ agents: ['asistan'], show: 0 })).rows) === ids(rows.filter(r => r.agentName === 'asistan')));
ok('a project', ids(B.view(rows, q({ projects: ['prj_life'], show: 0 })).rows) === ids(rows.filter(r => r.projectId === 'prj_life')));
ok('none ticked is an honest empty list', B.view(rows, q({ agents: [], show: 0 })).rows.length === 0);
const night = rows.find(r => r.chainId === 'chn_night');
ok('‼️ the search reaches the handover words, which are nowhere else on the row',
    /S-122/.test(night.words || '') && !/S-122/.test(night.title + night.why) && ids(B.view(rows, q({ text: 's-122', show: 0 })).rows).includes('chn_night'));
const byCost = B.view(rows, q({ sort: 'cost', show: 0 })).rows;
const pinnedCosts = byCost.filter(r => ACTIVE.includes(r.state) || r.signals.length).map(r => r.totals.cost);
ok('Cost sorts the dearest first (inside the pinned group)', pinnedCosts.every((c, i) => i === 0 || pinnedCosts[i - 1] >= c));
const byLegs = B.view(rows, q({ sort: 'legs', show: 0 })).rows;
ok('Legs puts the longest night first', byLegs[0].chainId === 'chn_night');
ok('the reset counts only what narrows', B.narrowing(q({ sort: 'cost', show: 0 })) === 0 && B.narrowing(q({ agents: ['x'], text: 'a' })) === 2);

// ---------- the page ----------
const r = runPage('chains.js', D);
const order = () => r.query('.ch-row').map(e => e.dataset.chain);
ok('the bar is drawn with its five controls', ['#ch-sort', '#ch-show', '#ch-q'].every(s => r.query(s).length === 1)
    && ['ch-agents', 'ch-projects', 'ch-reasons'].every(id => r.html().includes(`data-afms="${id}"`)));
const sort = r.query('#ch-sort')[0];
sort.value = 'legs'; sort.fire('change');
ok('a sort is applied at once and kept for the next reload', order()[0] === 'chn_night' && r.state().chainsQ.sort === 'legs');
const show = r.query('#ch-show')[0];
show.value = '0'; show.fire('change');
ok('Show All is kept too', r.state().chainsQ.show === 0 && r.query('.ch-row').length === rows.length);
const again = runPage('chains.js', D, undefined, { chainsQ: { sort: 'cost', show: 50 } });
ok('‼️ a reload draws the saved choice', again.query('#ch-sort')[0].value === 'cost' || /<option value="cost" selected>/.test(again.html()));
const few = runPage('chains.js', D, undefined, { chainsQ: { show: 1 } });
ok('a cut list says how many it hid and offers them all', /1 more finished chains are not listed\./.test(few.html()) && few.query('[data-showall]').length === 1);
few.query('[data-showall]')[0].click();
ok('…and Show all lists them', few.query('.ch-row').length === rows.length && few.state().chainsQ.show === 0);
const none = runPage('chains.js', D, undefined, { chainsQ: { agents: [] } });
ok('a filter that leaves nothing says so and offers the way back', /No chain matches the filters\./.test(none.html()) && none.query('[data-reset]').length === 1);
none.query('[data-reset]')[0].click();
ok('…which is one press', none.query('.ch-row').length > 0 && none.state().chainsQ.agents === null);

console.log(`\ntest_chains_bar: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
