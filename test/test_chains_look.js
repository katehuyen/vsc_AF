// S-128 — THE CHAINS PAGE READS AT A GLANCE: a colour per state, the Console card's relay symbols,
// the legs as a strip, and a chain id that can be copied.
//
// What must not go wrong quietly: ⛔ (the Tasks dependency mark) never stands for a brake again;
// Stop chain and Last leg wear exactly the Console card's symbols; End is no box that reads as a
// checkbox; the strip shows ran / current / still allowed and folds a long chain instead of
// widening the cell; ⑂⊣ marks the last leg (braked or on its ceiling) and only while it runs;
// attention is drawn over a state's own colour; ⧉ copies through the one clipboard door.
//
//   node test/test_chains_look.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const box = { window: {} };
vm.runInNewContext(read('media/afChainsLook.js'), box);
const L = box.window.AFChainsLook;
const row = (state, leg, maxLegs, extra) => Object.assign({ state, leg, maxLegs, signals: [] }, extra);
const text = h => h.replace(/<[^>]+>/g, '');

// ---------- the strip ----------
ok('a running leg 3 of 6: two ran, the current one, three still allowed', text(L.stepper(row('running', 3, 6))) === '●●▶○○○');
ok('a waiting and a parked leg show their own glyph in the current place',
    text(L.stepper(row('waiting', 4, 6))) === '●●●⏳○○' && text(L.stepper(row('parked', 2, 3))) === '●🅿○');
ok('no ceiling: ∞ instead of the open slots', text(L.stepper(row('running', 2, 0))) === '●▶∞');
ok('‼️ a long night folds instead of widening the cell', text(L.stepper(row('running', 13, 29))) === '●×12▶○×16');
ok('an ended chain shows only the legs that ran', text(L.stepper(row('done', 7, 12))) === '●×7' && text(L.stepper(row('stopped', 2, 6))) === '●●');
ok('‼️ ⑂⊣ marks a braked last leg and a leg standing on its ceiling',
    /⑂⊣/.test(L.stepper(row('running', 3, 6, { lastLeg: true }))) && /⑂⊣/.test(L.stepper(row('running', 6, 6))));
ok('…and never a leg with room left, or a chain that has ended', !/⑂⊣/.test(L.stepper(row('running', 3, 6)))
    && !/⑂⊣/.test(L.stepper(row('stopped', 6, 6))) && !/⑂⊣/.test(L.stepper(row('running', 9, 0))));

// ---------- colour ----------
ok('a colour family per state', L.tone(row('running', 1, 6)) === 'run' && L.tone(row('waiting', 1, 6)) === 'hold'
    && L.tone(row('parked', 1, 6)) === 'hold' && L.tone(row('done', 1, 6)) === 'ok' && L.tone(row('failed', 1, 6)) === 'off');
ok('‼️ anything going wrong is drawn over the state\'s own colour', L.tone(row('done', 1, 6, { signals: [{ kind: 'cut' }] })) === 'attn');
ok('attention is not the waiting colour', /\.t-attn \{ --ch-tone:var\(--vscode-charts-orange/.test(L.CSS) && /\.t-hold \{ --ch-tone:var\(--vscode-charts-yellow/.test(L.CSS));

// ---------- symbols ----------
const page = read('media/chains.js');
const consoleJs = read('media/console.js');
ok('‼️ ⛔ is gone from the Chains page (it is the Tasks dependency mark)', !page.includes('⛔'));
ok('‼️ Stop chain and Last leg wear the Console card\'s own symbols', L.SYM.stop === '✕⑂' && L.SYM.lastLeg === '⑂⊣'
    && consoleJs.includes('aria-label="Stop chain">✕⑂<') && /aria-label="Last leg"[^>]*>⑂⊣</.test(consoleJs));
ok('End is no box that reads as a checkbox', L.SYM.end !== '■' && !/act\(r, 'end', '■'/.test(page) && !page.includes("'■ ' + t('End chain')"));
ok('the page draws with the look, not a copy of it', page.includes('<style>${L.CSS}</style>') && !page.includes('.ch-chip {'));

// ---------- the page ----------
const fx = require('./fixtures/chains.js');
const { runPage } = require('./lib_page_dom');
const r = runPage('chains.js', fx.data());
const rows = r.query('.ch-row');
ok('every row wears its colour family', rows.length > 0 && rows.every(e => /\bt-(run|hold|ok|off|attn)\b/.test(e.className)));
const all = r.html();
const at = all.indexOf('<tr class="ch-row t-run" data-chain="chn_night"');
const night = at < 0 ? '' : all.slice(at, all.indexOf('</tr>', at));
ok('the long chain\'s Leg cell is the folded strip', /<span class="ch-steps">.*●×12.*▶.*○×16/.test(night) && /●×12▶○×16/.test(text(night)));
const copy = r.query('[data-copy]').find(e => e.dataset.copy === 'chn_night');
ok('every chain id has its ⧉', r.query('[data-copy]').length === rows.length && !!copy);
copy.click();
ok('‼️ ⧉ goes through the one clipboard door with the id', r.last().type === 'afClipboard' && r.last().text === 'chn_night');
// the harness does not bubble, so the row's own click is read from the handler
ok('…and stops there: the row under it does not open or close', /querySelectorAll\('\[data-copy\]'\)\.forEach\(el => el\.addEventListener\('click', ev => \{\s*ev\.stopPropagation\(\);/.test(page));

console.log(`\ntest_chains_look: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
