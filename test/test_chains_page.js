// S-122 — THE CHAINS PAGE: every relay chain in one table, its legs strip, and
// its controls. What must not go wrong quietly: a button is offered only where
// the op behind it would accept the press (checked against the REAL
// continueChain / endChain over the same records); every press reaches the body
// of the op of the same name; a push while a form is open keeps what was typed;
// and the page speaks the interface language.
//
//   node test/test_chains_page.js
'use strict';
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const pcSide = [];
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const vscodeStub = {
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1 },
    window: { createWebviewPanel: () => { throw new Error('the tests draw on their own host'); } },
    commands: { executeCommand: (...a) => { pcSide.push(a); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
};
const origLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? vscodeStub : origLoad.apply(this, arguments); };
const { ChainsPanel } = require(path.join(ROOT, 'out', 'panels', 'chainsPanel.js'));
Module._load = origLoad;
const P = require(path.join(ROOT, 'out', 'core', 'chainsPage.js'));
const K = require(path.join(ROOT, 'out', 'core', 'chainControl.js'));
const fx = require('./fixtures/chains.js');
const { runPage } = require('./lib_page_dom');

const D = fx.data();
const row = id => D.chains.find(r => r.chainId === id);
const acts = id => row(id).acts;

// ---------- what each row may do ----------
{
    ok('a waiting chain: stop, start now (its own baton), ceiling, end — never continue', acts('chn_wait').stop && /^b\d+$/.test(acts('chn_wait').now || '')
        && acts('chn_wait').legs && acts('chn_wait').end && !acts('chn_wait').cont && !acts('chn_wait').lastLeg);
    ok('a parked chain: stop and start now too', acts('chn_park').stop && !!acts('chn_park').now);
    ok('a working leg: the last-leg brake, ceiling, end — no continue, nothing to stop', acts('chn_night').lastLeg && acts('chn_night').legs
        && acts('chn_night').end && !acts('chn_night').cont && !acts('chn_night').stop && !acts('chn_night').now);
    ok('an idle leg can also be continued', acts('chn_idle').cont && acts('chn_idle').lastLeg);
    ok('a leg nothing knows: no brake and no continue (the core refuses an unknown leg) — only end and ceiling', !acts('chn_ghost').lastLeg
        && !acts('chn_ghost').cont && acts('chn_ghost').end);
    ok('finished, stopped and failed chains: continue only', ['chn_done', 'chn_ceil', 'chn_fail'].every(id => acts(id).cont && !acts(id).end
        && !acts(id).stop && !acts(id).legs && !acts(id).lastLeg));
    ok('a chain kept only as links: shown, offered nothing', row('chn_old').trimmed && Object.values(acts('chn_old')).every(v => !v));
    // ‼️ the offer is the op's own verdict, over the same records
    const all = fx.batons();
    for (const r of D.chains.filter(x => !x.trimmed)) {
        const c = K.continueChain(all, { chainId: r.chainId, by: 'u', running: r.state === 'running' ? r.live : undefined, fallbackMax: 6, now: Date.now() });
        ok(`‼️ ${r.chainId}: ↻ is offered exactly where chains.continue accepts it`, c.ok === r.acts.cont);
        const e = K.endChain(all, { chainId: r.chainId, by: 'u', now: Date.now() });
        ok(`‼️ ${r.chainId}: ■ is offered exactly where chains.end accepts it`, e.ok === r.acts.end);
    }
}

// ---------- the legs strip ----------
{
    const legs = fx.legsOf('chn_night');
    ok('every leg in order, with its title, cost and liveness', legs.length === 13 && legs[0].leg === 1 && legs[12].leg === 13
        && /Gece mesaisi/.test(legs[0].title) && legs[0].cost > 0 && legs[12].live === 'working' && legs[0].live === 'gone');
    ok('a leg carries the words it passed on; the running leg has none yet', /^Devir 1:/.test(legs[0].words) && legs[12].words === undefined);
    ok('a closing record (no words) is never read as a pass', fx.legsOf('chn_done').every(l => l.words === undefined || /^Devir/.test(l.words)));
    ok('an unknown chain has no legs', fx.legsOf('chn_nope').length === 0);
}

// ---------- the page ----------
{
    const r = runPage('chains.js', D);
    const html = () => r.html();
    ok('one row per chain, the chips counted', r.query('.ch-row').length === 10 && /Needs attention <b>5<\/b>/.test(html()) && /All <b>10<\/b>/.test(html()));
    r.query('[data-chip="attention"]')[0].click();
    ok('the ⚠ chip shows only the chains with a signal', r.query('.ch-row').length === 5 && r.query('.ch-row').every(e => /attn/.test(e.className)));
    r.query('[data-chip="attention"]')[0].click();
    ok('…and pressed again shows every chain (one gesture clears it)', r.query('.ch-row').length === 10);
    const btn = (act, chain) => r.query(`[data-act="${act}"]`).find(e => e.dataset.chain === chain);
    ok('the buttons follow the row: a finished chain has ↻, no ✕', !!btn('continue', 'chn_done') && !btn('stop', 'chn_done'));
    btn('stop', 'chn_wait').click();
    ok('✕ posts the chain to stop', r.last().type === 'stop' && r.last().chainId === 'chn_wait');
    btn('now', 'chn_wait').click();
    ok('⏭ posts the waiting baton', r.last().type === 'now' && r.last().batonId === acts('chn_wait').now);
    btn('lastLeg', 'chn_last').click();
    ok('⛔ on a braked leg releases it (on=false), with its session', r.last().type === 'lastLeg' && r.last().on === false && r.last().sessionId === row('chn_last').sessionId);
    btn('lastLeg', 'chn_night').click();
    ok('…and on a free leg brakes it', r.last().on === true);
    btn('ceiling', 'chn_night').click();
    ok('⇕ asks for the chain\'s legs menu', r.last().type === 'ceiling' && r.last().chainId === 'chn_night');
    btn('open', 'chn_night').click();
    ok('↗ opens the current leg\'s session', r.last().type === 'open' && r.last().sessionId === row('chn_night').sessionId);

    btn('continue', 'chn_done').click();
    ok('↻ opens the form under its row, not a post', r.query('#ch-prompt').length === 1 && r.last().type === 'open');
    const box = r.query('#ch-prompt')[0];
    box.value = 'kaldığın yerden devam et'; box.fire('input');
    r.send({ type: 'data', data: fx.data() });
    ok('a push while writing keeps the words', html().includes('kaldığın yerden devam et'));
    r.query('#ch-go')[0].click();
    ok('Continue posts the chain and the words', r.last().type === 'continue' && r.last().chainId === 'chn_done' && r.last().prompt === 'kaldığın yerden devam et');
    r.send({ type: 'done', chainId: 'chn_done', ok: false, text: 'chain chn_done has no handover words on record' });
    ok('a refusal is said and the form stays', html().includes('no handover words') && r.query('#ch-prompt').length === 1);
    r.send({ type: 'done', chainId: 'chn_done', ok: true, text: 'Chain chn_done reopened.' });
    ok('a success closes the form and says so', r.query('#ch-prompt').length === 0 && html().includes('Chain chn_done reopened.'));
    r.query('#ch-cancel').forEach(e => e.click());

    btn('end', 'chn_idle').click();
    const close = r.query('#ch-close')[0];
    close.checked = true; close.fire('change');
    r.query('#ch-go')[0].click();
    ok('■ asks first, then posts the end with the session choice', r.last().type === 'end' && r.last().chainId === 'chn_idle' && r.last().endSession === true);
    r.query('#ch-cancel')[0].click();
    ok('Cancel folds the form away', r.query('#ch-go').length === 0);

    r.query('.ch-row').find(e => e.dataset.chain === 'chn_night').click();
    ok('a row pressed asks for its legs and says it is loading', r.last().type === 'legs' && r.last().chainId === 'chn_night' && html().includes('Loading the legs'));
    r.send({ type: 'legs', chainId: 'chn_night', legs: fx.legsOf('chn_night') });
    ok('the legs strip draws every leg', r.query('.ch-leg').length === 13);
    r.query('.ch-leg')[0].click();
    ok('a leg pressed opens its session', r.last().type === 'open' && r.last().sessionId === 'n1');
    r.send({ type: 'data', data: fx.data() });
    ok('a push asks again for the legs of an open row', r.last().type === 'legs' && r.last().chainId === 'chn_night');

    const empty = runPage('chains.js', fx.data({ batons: [], links: [] }));
    ok('no chain on record says so', empty.html().includes('No relay chain on record yet.'));
    const tr = runPage('chains.js', D, { __AFUI__: { lang: 'tr', locale: 'tr' } });
    const th = tr.html();
    ok('in Türkçe: title, chips, columns, states and buttons', ['Zincirler', 'İlgi istiyor', 'Halka', 'Son hareket', 'çalışıyor', 'Devam ettir', 'Zinciri kapat'].every(s => th.includes(s))
        && !/>Needs attention|>Last move</.test(th));
    tr.send({ type: 'done', chainId: 'chn_done', ok: true, text: 'Chain chn_done reopened: leg 4 opens on its own setup once session L3 has ended. Its session was closed.',
        say: [{ key: 'Chain {chain} reopened: leg {leg} opens on its own setup once session {session} has ended.', vars: { chain: 'chn_done', leg: '4', session: 'L3' } },
            { key: 'Its session was closed.', vars: {} }] });
    ok('U-189: what a press came to is drawn from its parts in Türkçe', tr.html().includes('chn_done zinciri yeniden açıldı: L3 oturumu kapanınca 4. halka kendi kurulumuyla açılır. Oturumu kapatıldı.')
        && !tr.html().includes('reopened'));
}

// ---------- the panel ----------
(async () => {
    const inbox = [], out = [], disposers = [];
    const host = {
        title: '', visible: true, reveal() { }, dispose() { disposers.forEach(f => f()); },
        onDidDispose: (f) => { disposers.push(f); return { dispose() { } }; }, onDidChangeViewState: () => ({ dispose() { } }),
        webview: {
            html: '', cspSource: "'self'", asWebviewUri: u => ({ toString: () => '/res/' + u.path }),
            postMessage: m => { out.push(m); return Promise.resolve(true); },
            onDidReceiveMessage: (f) => { inbox.push(f); return { dispose() { } }; }
        }
    };
    const calls = [];
    const panel = ChainsPanel.openOn(host, {
        extensionUri: uri('/ext'),
        build: () => fx.data(),
        projects: () => [{ id: 'prj_af', name: 'Agent Farm' }],
        legs: id => { calls.push(['legs', id]); return fx.legsOf(id); },
        stop: id => { calls.push(['stop', id]); return id === 'chn_wait' ? 1 : 0; },
        lastLeg: (sid, on) => { calls.push(['lastLeg', sid, on]); return { ok: true, sentence: 'Braked.' }; },
        startNow: id => { calls.push(['now', id]); return id === 'gone' ? { ok: false, why: 'no longer waiting' } : { ok: true }; },
        ceiling: async id => { calls.push(['ceiling', id]); },
        cont: q => { calls.push(['continue', q]); return { ok: true, text: 'Reopened.' }; },
        end: async q => { calls.push(['end', q]); return { ok: false, text: 'already ended' }; },
        onDidChange: () => ({ dispose() { } })
    });
    const say = async m => { for (const f of inbox) { await f(m); } await new Promise(res => setImmediate(res)); };
    ok('the page loads its script, with the projects in its data', host.webview.html.includes('chains.js') && host.webview.html.includes('Agent Farm'));
    await say({ type: 'stop', chainId: 'chn_wait' });
    ok('stop runs the stop body and says how many', calls.at(-1)[0] === 'stop' && out.some(m => m.type === 'done' && m.ok && /1 waiting baton/.test(m.text)
        && m.say[0].key === 'Chain {chain} stopped — {n} waiting baton recorded as stopped; no further leg opens.' && m.say[0].vars.n === '1'));
    await say({ type: 'stop', chainId: 'chn_done' });
    ok('…and nothing left to stop is said as not done', out.at(-2).type === 'done' && out.at(-2).ok === false);
    await say({ type: 'lastLeg', chainId: 'chn_night', sessionId: 'n13', on: true });
    ok('the brake reaches baton.lastLeg\'s body with its session and side', calls.at(-1).join() === 'lastLeg,n13,true');
    await say({ type: 'now', chainId: 'chn_wait', batonId: 'gone' });
    ok('start now passes the refusal back', out.some(m => m.type === 'done' && m.ok === false && m.text === 'no longer waiting'));
    await say({ type: 'ceiling', chainId: 'chn_night' });
    ok('the ceiling opens the legs menu for that chain', calls.at(-1).join() === 'ceiling,chn_night');
    await say({ type: 'continue', chainId: 'chn_done', prompt: '  devam  ', why: '' });
    ok('continue carries the trimmed words and no empty why', calls.at(-1)[1].chain === 'chn_done' && calls.at(-1)[1].prompt === 'devam' && calls.at(-1)[1].why === undefined);
    await say({ type: 'end', chainId: 'chn_done', endSession: true });
    ok('end awaits its answer and says the refusal', calls.at(-1)[1].endSession === true && out.some(m => m.type === 'done' && m.text === 'already ended'));
    await say({ type: 'legs', chainId: 'chn_night' });
    ok('legs are answered to the page', out.some(m => m.type === 'legs' && m.chainId === 'chn_night' && m.legs.length === 13));
    await say({ type: 'open', sessionId: 'n13' });
    ok('open hands the session to agentfarm.openSession', pcSide.some(a => a[0] === 'agentfarm.openSession' && a[1].sessionId === 'n13'));
    await say({ type: 'stop' });
    ok('a press without its chain does nothing', calls.filter(c => c[0] === 'stop').length === 2);
    ok('every answer is followed by fresh data', out.filter(m => m.type === 'data').length >= 6);
    void panel;
    host.dispose();
    console.log(`test_chains_page: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
