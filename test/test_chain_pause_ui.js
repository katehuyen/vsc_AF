// S-141 — the pause menu's rows (chainPauseMenu.ts) and the Chains page's hands:
// a chain that can pause has its own ⏸ (the host asks which pause), a paused
// one shows ▶ Resume in its place (chains.resume), ⑂⊣ is only the brake and
// nothing on the page answers a right-click; a paused row says so in its state
// and live cells. The Console card's right-click menu is not this page's.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'out', 'core', 'chainPauseMenu.js'));
const P = require(path.join(ROOT, 'out', 'core', 'chainsPage.js'));
const fx = require('./fixtures/chains.js');
const { runPage } = require('./lib_page_dom');

// ---- the menu's rows ----
{
    const acts = (row, ho = false) => M.pauseChoices(row, ho).map(c => c.act).join(',');
    const run = { chainId: 'chn_a', state: 'running', leg: 3, live: 'working', lastLeg: false };
    ok('a running leg: a break in place, or pass and pause', acts(run) === 'here,pass');
    ok('‼️ once a HANDOVER order reached it, only pass and pause', acts(run, true) === 'pass');
    ok('an idle leg can be paused too', acts(Object.assign({}, run, { live: 'idle' })) === 'here,pass');
    ok('a gone leg, a braked last leg: nothing to pause', acts(Object.assign({}, run, { live: 'gone' })) === '' && acts(Object.assign({}, run, { lastLeg: true })) === '');
    const here = Object.assign({}, run, { live: 'idle', paused: { mode: 'here', at: 1, by: 'u', held: false } });
    ok('paused in place: Continue, or switch to pass and pause', acts(here) === 'resume,pass' && /same session/.test(M.pauseChoices(here, false)[0].detail));
    const passing = Object.assign({}, run, { paused: { mode: 'pass', at: 1, by: 'u', held: false } });
    ok('a pass-pause not yet reached: Continue only (it cancels)', acts(passing) === 'resume' && /cancelled/.test(M.pauseChoices(passing, false)[0].detail));
    const held = { chainId: 'chn_a', state: 'waiting', leg: 4, paused: { mode: 'pass', at: 1, by: 'u', held: true } };
    ok('a held successor: Continue only', acts(held) === 'resume' && /door/.test(M.pauseChoices(held, false)[0].detail));
    ok('a successor waiting unheld: hold it', acts({ chainId: 'chn_a', state: 'waiting', leg: 4 }) === 'pass');
    const closed = { chainId: 'chn_a', state: 'done', leg: 3, paused: { mode: 'here', at: 1, by: 'u', held: false, closed: true } };
    ok('closed under a pause in place: Continue reopens it', acts(closed) === 'resume' && /Reopens/.test(M.pauseChoices(closed, false)[0].detail));
    ok('a finished chain: nothing', acts({ chainId: 'chn_a', state: 'done', leg: 3 }) === '' && M.pauseChoices(undefined, false).length === 0);
    ok('the title says where the chain stands', /chain chn_a · leg 4 · paused — the next leg waits/.test(M.pauseTitle(held)) && /· running$/.test(M.pauseTitle(run)));
}

// ---- the Chains page ----
{
    const D = fx.data();
    const row = id => D.chains.find(r => r.chainId === id);
    row('chn_wait').paused = { mode: 'pass', at: Date.now() - 60000, by: 'the user', held: true };
    row('chn_idle').paused = { mode: 'here', at: Date.now() - 60000, by: 'the user', held: false };
    // the acts the host derives (chainsPage.ts chainActs) for a row as it stands now
    for (const id of ['chn_wait', 'chn_idle']) { Object.assign(row(id).acts, P.chainActs(row(id), fx.batons())); }
    ok('the host offers ⏸ only to a chain that can pause, ▶ only to a paused one',
        row('chn_night').acts.pause && !row('chn_night').acts.resume && row('chn_wait').acts.resume && !row('chn_wait').acts.pause
        && row('chn_idle').acts.resume && !row('chn_idle').acts.pause);
    const r = runPage('chains.js', D);
    const btn = (act, chain) => r.query(`[data-act="${act}"]`).find(e => e.dataset.chain === chain);
    const acts = id => r.query('.ch-act').filter(e => e.dataset.chain === id).map(e => e.dataset.act).join(',');
    btn('pause', 'chn_night').click();
    ok('‼️ a running chain has its own ⏸, and a press asks the host how to pause that chain', /aria-label="Pause">⏸</.test(r.html())
        && r.last().type === 'pause' && r.last().chainId === 'chn_night');
    btn('lastLeg', 'chn_night').click();
    ok('‼️ ⑂⊣ is the brake again and nothing else', r.last().type === 'lastLeg' && r.last().sessionId === row('chn_night').sessionId);
    ok('…and no button on the page answers a right-click', r.query('[data-act]').every(e => !(e._listeners.contextmenu || []).length)
        && !/pausemenu|Right-click/.test(r.html()));
    ok('‼️ a held row shows ▶ Resume where ⏸ was, and no second start', /^resume,/.test(acts('chn_wait')) && !/(^|,)now(,|$)/.test(acts('chn_wait')));
    btn('resume', 'chn_wait').click();
    ok('…a press continues it on the host', r.last().type === 'resume' && r.last().chainId === 'chn_wait');
    ok('a chain paused in place resumes the same way', /^resume,/.test(acts('chn_idle')) && /RESUME is said into the same session/.test(r.html()));
    ok('a parked row keeps ⏭ Start now and is offered no pause (the menu has none for it)', /^now,/.test(acts('chn_park')) && !row('chn_park').acts.pause);
    const unheld = Object.assign({}, row('chn_wait'), { paused: undefined });
    ok('an unpaused waiting successor is offered ⏸ to hold it', P.chainActs(unheld, fx.batons()).pause === true);
    ok('a paused row says so in its live cell', /paused — waits for you/.test(r.html()) && /paused in place/.test(r.html()));
    ok('…and marks its state with ⏸', (r.html().match(/<span class="ch-g">⏸<\/span>/g) || []).length === 2);
}

// ---- the host: ⏸ opens the ways to pause on the surface that pressed, ▶ is chains.resume's own answer ----
(async () => {
    const Module = require('module');
    const fs = require('fs');
    const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
    const stub = { Uri: { joinPath: (b, ...p) => uri([b.path, ...p].join('/')), file: uri, parse: uri }, ViewColumn: { One: 1 },
        window: { createWebviewPanel: () => { throw new Error('own host'); } }, commands: { executeCommand: () => Promise.resolve() },
        workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    const orig = Module._load;
    Module._load = function (request) { return request === 'vscode' ? stub : orig.apply(this, arguments); };
    const { ChainsPanel } = require(path.join(ROOT, 'out', 'panels', 'chainsPanel.js'));
    Module._load = orig;
    const inbox = [], out = [], calls = [];
    const host = { title: '', visible: true, remote: false, reveal() { }, dispose() { }, onDidDispose: () => ({ dispose() { } }), onDidChangeViewState: () => ({ dispose() { } }),
        ask: { pick: async () => undefined },
        webview: { html: '', cspSource: "'self'", asWebviewUri: u => ({ toString: () => '/res/' + u.path }),
            postMessage: m => { out.push(m); return Promise.resolve(true); }, onDidReceiveMessage: f => { inbox.push(f); return { dispose() { } }; } } };
    ChainsPanel.openOn(host, { extensionUri: uri('/ext'), build: () => fx.data(), projects: () => [], legs: () => [], stop: () => 0,
        lastLeg: () => ({ ok: true, sentence: '' }), startNow: () => ({ ok: true }), ceiling: async () => { }, cont: () => ({ ok: true, text: '' }),
        pause: async (c, on) => { calls.push(['pause', c, on === host]); },
        resume: c => { calls.push(['resume', c]); return { ok: true, text: 'Chain ' + c + ' continues in place: RESUME was said into session S.' }; },
        end: async () => ({ ok: true, text: '' }), endHanging: () => ({ ended: [], refused: [] }), onDidChange: () => ({ dispose() { } }) });
    const send = async m => { for (const f of inbox) { await f(m); } await new Promise(res => setImmediate(res)); };
    await send({ type: 'pause', chainId: 'chn_night' });
    ok('‼️ ⏸ on the host: the ways to pause are asked on the surface that pressed', JSON.stringify(calls.pop()) === '["pause","chn_night",true]');
    await send({ type: 'resume', chainId: 'chn_idle' });
    const said = out.filter(m => m.type === 'done').pop();
    ok('‼️ ▶ on the host: chains.resume runs at once and its sentence is said', JSON.stringify(calls.pop()) === '["resume","chn_idle"]'
        && said && said.ok && /continues in place/.test(said.text));
    await send({ type: 'pauseMenu', chainId: 'chn_night' });
    ok('the right-click message is gone with the right-click', calls.length === 0);
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('extension.ts: the page\'s ▶ is chains.resume\'s own body, by the Chains page',
        /resume: chainId => \{\s*const r = resumeChain\(chainPauseDeps, \{ chain: chainId, by: 'the user \(Chains page\)' \}\);/.test(ext));
    console.log(`test_chain_pause_ui: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
