// S-141 — the pause menu's rows (chainPauseMenu.ts) and the Chains page's hands:
// a right-click on ⑂⊣ (or a paused row's ▶ / ↻) asks the host for the menu,
// a held row's ⏭ reads ▶ Resume and still posts the same start, and a paused
// row says so in its state and live cells. No new button anywhere.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'out', 'core', 'chainPauseMenu.js'));
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
    const r = runPage('chains.js', D);
    const btn = (act, chain) => r.query(`[data-act="${act}"]`).find(e => e.dataset.chain === chain);
    const now = btn('now', 'chn_wait');
    const nowOf = id => (r.html().match(new RegExp(`data-act="now" data-chain="${id}"[^>]*>[^<]*<`)) || [''])[0];
    ok('‼️ a held row\'s ⏭ reads ▶ Resume — the same button, not a new one', /aria-label="Resume">▶</.test(nowOf('chn_wait'))
        && r.query('[data-act="now"]').filter(e => e.dataset.chain === 'chn_wait').length === 1);
    now.click();
    ok('…and still posts the same start (which ends the pause)', r.last().type === 'now' && r.last().batonId === row('chn_wait').acts.now);
    ok('an unpaused waiting row keeps ⏭ Start now, with no menu', /aria-label="Start now">⏭</.test(nowOf('chn_park')) && !/pausemenu/.test(nowOf('chn_park')));
    btn('lastLeg', 'chn_night').fire('contextmenu');
    ok('‼️ a right-click on ⑂⊣ asks the host for the pause menu of that chain', r.last().type === 'pauseMenu' && r.last().chainId === 'chn_night');
    btn('now', 'chn_wait').fire('contextmenu');
    ok('…a held row\'s ▶ too', r.last().type === 'pauseMenu' && r.last().chainId === 'chn_wait');
    const before = r.last();
    btn('stop', 'chn_wait').fire('contextmenu');
    ok('…and no other button carries the menu', r.last() === before);
    ok('a paused row says so in its live cell', /paused — waits for you/.test(r.html()) && /paused in place/.test(r.html()));
    ok('…and marks its state with ⏸', (r.html().match(/<span class="ch-g">⏸<\/span>/g) || []).length === 2);
    ok('⑂⊣ names its right-click', /Right-click: pause the chain, or continue it\./.test(r.html()));
}

console.log(`test_chain_pause_ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
