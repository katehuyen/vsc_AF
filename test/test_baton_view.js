// S-77 — THE RELAY AS A SURFACE SAYS IT: one view per session, derived once.
//
//   node test/test_baton_view.js
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const V = require(path.join(__dirname, '..', 'out', 'core', 'batonView.js'));
const NOW = 1790000000000;
const b = (id, state, hop, from, o = {}) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'p', why: o.why || 'w',
    from: { sessionId: from, agentId: 'd:/zone/agent/ajanlar/developer', engine: 'claude', cwd: 'D:\\x', launchId: 'l' },
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
    createdAt: NOW, updatedAt: o.at || NOW, ...o.extra
});

ok('a session no baton touched has no view', V.batonCardView([b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2' } })], 's9') === undefined);
ok('an empty id has no view', V.batonCardView([], '') === undefined);

const first = V.batonCardView([b('b1', 'waiting-end', 1, 's1')], 's1');
ok('the run that started the chain and passed: leg 1, successor waiting, stoppable',
    first.leg === 1 && first.chip === '⑂ 1' && /successor waiting/.test(first.head) && first.stoppable
    && first.lines.some(l => /^Predecessor: none/.test(l)) && first.lines.some(l => /waits for this session to end/.test(l))
    && first.lines.some(l => /^Brake: ✕⑂ Stop chain on the card/.test(l))
    // A-28 — the hover is read by the user: the control, never the op.
    && !first.lines.some(l => /baton\.[a-zA-Z]+ /.test(l)));

const mid = V.batonCardView([
    b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2' } }),
    b('b2', 'started', 2, 's2', { extra: { toSessionId: 's3' } })
], 's2');
ok('a middle leg: opened by leg 1, its successor running as a named session, nothing live to stop',
    mid.leg === 2 && mid.lines[0] === 'Chain: chn_1 — leg 2 of 3 so far.' && /^Ran: .+ → .+ \(passed\)\.$/.test(mid.lines[1])
    && /Predecessor: session s1 \(developer · claude\)/.test(mid.lines[2])
    && /Successor: running — session s3/.test(mid.lines[3]) && !mid.stoppable && /nobody passes/.test(mid.lines[4]));

const runner = V.batonCardView([b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2' } })], 's2');
ok('a runner that has not passed yet says so', runner.leg === 2 && runner.chip === '⑂ 2' && /Successor: none yet/.test(runner.lines[3]) && /no pass yet/.test(runner.lines[1]) && runner.head === 'Baton relay — leg 2');

const parked = V.batonCardView([b('b1', 'parked', 1, 's1', { extra: { wakeAt: new Date(2026, 8, 21, 20, 5).getTime() } })], 's1');
ok('a parked successor names its wake time', parked.lines.some(l => /parked — every account is full; wakes at 20:05/.test(l)));

const stopped = V.batonCardView([b('b1', 'stopped', 1, 's1', { why: 'user said no' })], 's1');
ok('a stopped successor carries the reason and is not stoppable again', stopped.lines.some(l => l === 'Successor: stopped — user said no') && !stopped.stoppable);

const twice = V.batonCardView([b('old', 'refused', 1, 's1', { at: NOW - 5000, why: 'x' }), b('new', 'waiting-end', 1, 's1', { at: NOW })], 's1');
ok('two passes from one run: the newest speaks', twice.lines.some(l => /waits for this session to end/.test(l)));

// S-77 — THE ONE STATUS-BAR ITEM: empty · one · many.
{
    const fmt = () => '14:37';
    const none = () => false;
    ok('no chain: no item', V.batonBarView([], 6, none, fmt) === undefined);
    ok('a chain whose last leg ended without passing is over: no item',
        V.batonBarView([b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2' } })], 6, none, fmt) === undefined);
    ok('…and a stopped one too', V.batonBarView([b('b1', 'stopped', 1, 's1')], 6, none, fmt) === undefined);
    const run = V.batonBarView([b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2-long-id' } }), b('b2', 'started', 2, 's2-long-id', { extra: { toSessionId: 's3-long-id' } })],
        6, sid => sid === 's3-long-id', fmt);
    ok('a running leg: ⑂ leg/ceiling, its session the click target',
        run.text === '⑂ 3/6' && run.sessionId === 's3-long-id' && run.chainId === 'chn_1'
        && /^Baton relay — one chain running/.test(run.tooltip) && /Chain chn_1 — leg 3 of 6 running \(session s3-long-\)/.test(run.tooltip)
        && /A new chain starts at 6 legs \(agentFarm\.batonMaxHops\)/.test(run.tooltip) && /✕⑂ Stop chain while a successor waits\./.test(run.tooltip)
        && !/baton\.[a-zA-Z]+ chain=/.test(run.tooltip));
    const park = V.batonBarView([b('b1', 'parked', 2, 's2', { extra: { wakeAt: NOW + 3600000 } })], 6, none, fmt);
    ok('a parked leg carries its wake time on the bar — ⑂ 3/6 · 14:37', park.text === '⑂ 3/6 · 14:37' && /leg 3 of 6 parked .* wakes at 14:37/.test(park.tooltip) && !park.sessionId);
    const wait = V.batonBarView([b('b1', 'waiting-end', 1, 's1')], 0, none, fmt);
    ok('a baton waiting on its session: the leg it opens, no ceiling written when there is none, the passing session clicked',
        wait.text === '⑂ 2' && wait.sessionId === 's1' && /leg 2 opens when session s1 ends/.test(wait.tooltip) && /A new chain starts with no leg ceiling/.test(wait.tooltip));
    const many = V.batonBarView([
        b('b1', 'waiting-end', 1, 's1', { at: NOW - 9000 }),
        { ...b('c1', 'parked', 4, 'x4', { at: NOW }), chainId: 'chn_2', wakeAt: NOW }
    ], 6, none, fmt);
    ok('several chains: the newest speaks, +N counts the rest, each has its line',
        many.text === '⑂ 5/6 · 14:37 +1' && many.chainId === 'chn_2' && /^Baton relay — 2 chains running/.test(many.tooltip)
        && many.tooltip.indexOf('Chain chn_2') < many.tooltip.indexOf('Chain chn_1'));
}

// …and the host draws that view, and only that view, on one item.
{
    const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const block = ext.slice(ext.indexOf('const batonBar = '), ext.indexOf('const batonBootSweep'));
    ok('one status-bar item, drawn from batonBarView with the setting\'s own ceiling',
        (ext.match(/const batonBar = vscode\.window\.createStatusBarItem/g) || []).length === 1
        && /batonBarView\(batonStore\.all\(\), normalizeMaxLegs\(cfg\(\)\.get<unknown>\('batonMaxHops'\)\), batonLegAlive\)/.test(block)
        && /if \(!v\) \{ batonBar\.hide\(\); return; \}/.test(block));
    ok('…redrawn on a store change, a leg starting or ending, and a new ceiling',
        /batonStore\.onDidChange\(\(\) => \{ updateBatonBar\(\); ConsolePanel\.refreshIfOpen\(\);/.test(block) && /e\.kind === 'start' \|\| e\.kind === 'end'/.test(block)
        && /affectsConfiguration\('agentFarm\.batonMaxHops'\)/.test(block));
    ok('…and the sweep redraws it too, so a leg that died silently drops off', /batonRunner\.sweep\(\); updateBatonBar\(\);/.test(ext));
    const { BatonStore } = require(path.join(__dirname, '..', 'out', 'core', 'batonStore.js'));
    const st = new BatonStore();
    let n = 0;
    const sub = st.onDidChange(() => { n++; });
    st.put(b('b1', 'waiting-end', 1, 's1'));
    sub.dispose();
    st.put(b('b2', 'waiting-end', 1, 's2'));
    ok('the store tells its listeners on every put, and stops once disposed', n === 1);
}

// ‼️ The card's ✕ is the SAME brake as baton.stop chain= — one body, not a copy.
{
    const fs = require('fs');
    const rd = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
    const panel = rd('src', 'panels', 'consolePanel.ts');
    const ext = rd('src', 'extension.ts');
    const page = rd('media', 'console.js');
    const caseBody = panel.slice(panel.indexOf("case 'batonStopChain':"), panel.indexOf("case 'openTranscript':"));
    ok('the panel hands the chain to the host dep and redraws', /this\.deps\.batonStopChain\(chain\)/.test(caseBody) && /this\.refresh\(\)/.test(caseBody));
    ok('…the host dep runs stopBatons on the chain\'s LIVE batons, the body baton.stop runs',
        /batonStopChain: \(chainId: string\) => stopBatons\(batonStore, batonStore\.chain\(chainId\)\.filter\(isLive\)/.test(ext)
        && /const stopped = stopBatons\(deps\.store, picked\.list/.test(rd('src', 'core', 'batonBridge.ts')));
    ok('…the page posts only the chain id, from the host\'s own view',
        /type: 'batonStopChain', chainId: v\.chainId/.test(page) && /if \(!v \|\| !v\.stoppable \|\| !v\.chainId\)/.test(page));
    const row = JSON.parse(rd('parity.manifest.json')).entries.find(c => c.capability === 'consolePanel.ts#batonStopChain');
    ok('…and the parity manifest binds the button to baton.stop', !!row && (row.ops || []).includes('baton.stop'));
}

console.log(`test_baton_view.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
