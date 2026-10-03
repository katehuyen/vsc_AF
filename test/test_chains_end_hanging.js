// S-128 — END EVERY HANGING CHAIN AT ONCE, from the ⚠ chip and from chains.endHanging.
//
// What must not go wrong quietly: only chains the record shows HANGING are ended (a working leg, a
// healthy chain and an ended one are untouched); each goes through End's own records, so a twin
// leftover (X-497) is ended too; no session is closed; a list given by the page ends only those of
// it still hanging; nothing happens until the person says yes; the button shows only on the ⚠ chip.
//
//   node test/test_chains_end_hanging.js
'use strict';
const path = require('path');
const Module = require('module');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const vscodeStub = {
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1 },
    window: { createWebviewPanel: () => { throw new Error('the tests draw on their own host'); } },
    commands: { executeCommand: () => Promise.resolve(undefined) },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
};
const origLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? vscodeStub : origLoad.apply(this, arguments); };
const { ChainsPanel } = require(path.join(ROOT, 'out', 'panels', 'chainsPanel.js'));
Module._load = origLoad;
const O = require(path.join(OUT, 'chainBoardOps.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const fx = require('./fixtures/chains.js');
const { runPage } = require('./lib_page_dom');

const NOW = 1790400000000;
const DAY = 86400e3;
const from = sid => ({ sessionId: sid, agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'l' + sid });
const mk = (id, chainId, hop, state, sid, to, at) => ({
    id, chainId, hop, state, prompt: hop ? 'words ' + id : '(first leg)', why: 'w-' + id, from: from(sid),
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@pool' }, ...(to ? { toSessionId: to } : {}), createdAt: at, updatedAt: at
});
const T0 = NOW - 9 * DAY;
const records = () => [
    mk('h0', 'chn_hang', 0, 'started', 'H1', 'H1', T0), mk('h1', 'chn_hang', 1, 'started', 'H1', 'H2', T0 + 3600e3),
    mk('w0', 'chn_work', 0, 'started', 'W1', 'W1', NOW - 3600e3),
    mk('sA', 'chn_A', 0, 'started', 'S', 'S', T0), mk('sB', 'chn_B', 0, 'started', 'S', 'S', T0 + 822), mk('pB', 'chn_B', 1, 'started', 'S', 'S2', T0 + 7200e3),
    mk('d0', 'chn_done', 0, 'started', 'D1', 'D1', T0), Object.assign(mk('d1', 'chn_done', 1, 'done', 'D1', undefined, T0 + 3600e3), { prompt: '' })
];
const FACTS = {
    H2: { alive: false, lastTs: NOW - 8 * DAY }, W1: { alive: true }, S2: { alive: true }, S: { alive: false, lastTs: NOW - 8 * DAY }
};
const depsOn = store => ({
    store, factsNow: () => sid => FACTS[sid], maxLegs: () => 6, now: () => NOW,
    thresholds: () => O.boardThresholds(() => undefined), sweep: () => { }, cancelRow: () => 'cancelled',
    closeLeg: async () => { throw new Error('no session is closed'); }
});
const fresh = () => { const s = new BatonStore(); s.put(...records()); return depsOn(s); };
const ids = rows => rows.map(r => r.chainId).sort().join();

(async () => {
    // ---------- the core ----------
    const d = fresh();
    ok('the record shows exactly the hanging ones: a gone leg and the twin left behind', ids(O.hangingNow(d)) === 'chn_A,chn_hang');
    const before = JSON.stringify(['chn_work', 'chn_B', 'chn_done'].map(c => d.store.chain(c)));
    const r = O.endHanging(d, {});
    ok('‼️ both are ended, nothing refused', r.ended.slice().sort().join() === 'chn_A,chn_hang' && r.refused.length === 0);
    ok('…the board reads them done and nothing hangs any more', O.hangingNow(d).length === 0
        && O.boardNow(d).filter(x => ['chn_A', 'chn_hang'].includes(x.chainId)).every(x => x.state === 'done'));
    ok('‼️ the working chain, the twin\'s live chain and the ended chain are byte-identical', JSON.stringify(['chn_work', 'chn_B', 'chn_done'].map(c => d.store.chain(c))) === before);
    ok('the record says why', d.store.chain('chn_hang').some(b => b.state === 'done' && /hanging — ended together/.test(b.why)));
    const only = fresh();
    ok('a list ends only those of it still hanging', O.endHanging(only, { chains: ['chn_hang', 'chn_work'] }).ended.join() === 'chn_hang' && ids(O.hangingNow(only)) === 'chn_A');

    // ---------- the op ----------
    const reg = new BridgeRegistry();
    const od = fresh();
    O.registerChainBoardOps(reg, od);
    const dry = await reg.dispatch('chains.endHanging', { dryRun: true });
    ok('dryRun names them and ends nothing', dry.ok && dry.result.hanging.slice().sort().join() === 'chn_A,chn_hang' && dry.result.ended.length === 0 && O.hangingNow(od).length === 2);
    const run = await reg.dispatch('chains.endHanging', { chains: 'chn_A', why: 'tidy' });
    ok('chains= (comma list) narrows it, why is recorded', run.ok && run.result.ended.join() === 'chn_A' && od.store.chain('chn_A').some(b => /tidy/.test(b.why)));
    const rest = await reg.dispatch('chains.endHanging', {});
    ok('a second run ends the rest, a third finds nothing', rest.result.ended.join() === 'chn_hang' && (await reg.dispatch('chains.endHanging', {})).result.ended.length === 0);

    // ---------- the panel ----------
    const inbox = [], out = [], calls = [];
    let answer = 'End them';
    const host = {
        title: '', visible: true, remote: false, reveal() { }, dispose() { }, onDidDispose: () => ({ dispose() { } }), onDidChangeViewState: () => ({ dispose() { } }),
        ask: { warn: async (msg, opts, yes) => { calls.push(['ask', msg, opts && opts.modal, yes]); return answer; } },
        webview: {
            html: '', cspSource: "'self'", asWebviewUri: u => ({ toString: () => '/res/' + u.path }),
            postMessage: m => { out.push(m); return Promise.resolve(true); }, onDidReceiveMessage: f => { inbox.push(f); return { dispose() { } }; }
        }
    };
    ChainsPanel.openOn(host, {
        extensionUri: uri('/ext'), build: () => fx.data(), projects: () => [], legs: () => [], stop: () => 0,
        lastLeg: () => ({ ok: true, sentence: '' }), startNow: () => ({ ok: true }), ceiling: async () => { }, cont: () => ({ ok: true, text: '' }),
        end: async () => ({ ok: true, text: '' }),
        endHanging: list => { calls.push(['end', list]); return { ended: list.slice(0, 1), refused: list.slice(1).map(c => ({ chain: c, why: 'already ended' })) }; },
        onDidChange: () => ({ dispose() { } })
    });
    const send = async m => { for (const f of inbox) { await f(m); } await new Promise(res => setImmediate(res)); };
    answer = undefined;
    await send({ type: 'endHanging', chainIds: ['chn_idle', 'chn_ghost'] });
    ok('‼️ nothing is ended until the person says yes — asked as a modal naming how many', !calls.some(c => c[0] === 'end')
        && calls[0][0] === 'ask' && calls[0][2] === true && /End the 2 hanging chains\?/.test(calls[0][1]) && /no session is closed/.test(calls[0][1]));
    answer = 'End them';
    await send({ type: 'endHanging', chainIds: ['chn_idle', 'chn_ghost'] });
    const said = out.filter(m => m.type === 'done').pop();
    ok('yes ends exactly the listed chains and says what came of each', calls.some(c => c[0] === 'end' && c[1].join() === 'chn_idle,chn_ghost')
        && /1 hanging chain\(s\) ended/.test(said.text) && /1 could not be ended: chn_ghost \(already ended\)\./.test(said.text) && said.ok === false);
    await send({ type: 'endHanging', chainIds: [] });
    ok('an empty list asks nothing', calls.filter(c => c[0] === 'ask').length === 2);

    // ---------- the page ----------
    const page = runPage('chains.js', fx.data());
    ok('no button on All', page.query('#ch-endhang').length === 0);
    page.query('[data-chip="attention"]')[0].click();
    const btn = page.query('#ch-endhang')[0];
    ok('‼️ on the ⚠ chip: the button counts the hanging chains End can reach', !!btn && btn.dataset.ids.split(',').sort().join() === 'chn_ghost,chn_idle'
        && /End hanging \(2\)/.test(page.html()));
    btn.click();
    ok('…and pressing it posts their ids', page.last().type === 'endHanging' && page.last().chainIds.slice().sort().join() === 'chn_ghost,chn_idle');

    console.log(`\ntest_chains_end_hanging: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
