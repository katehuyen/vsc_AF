// U-148 — on the Live Timeline a session waiting on its own background command
// has its own colour (purple, unused by any other status there), its own word,
// and a slow breath — never the yellow YOUR TURN it used to wear.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'timeline.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const d = fixture.data();
const target = d.sessions.find(s => s.status === 'waiting-input');
ok('the fixture has a resting session to turn into a background wait', !!target);
target.status = 'waiting-task';

const html = runPage(fixture.script, d, fixture.window || {}).html();
const cards = html.slice(html.indexOf('<h2>Live sessions'));
const at = cards.indexOf('<div class="card st-bgwait"');

ok('‼️ the waiting card carries the slow-breath class', at >= 0);
ok('…and exactly one card does', cards.split('<div class="card st-bgwait"').length === 2);
const card = at >= 0 ? cards.slice(at, at + 6000) : '';
ok('its left bar is purple', /border-left:3px solid var\(--vscode-charts-purple, #b180d7\)/.test(card));
ok('its badge says BACKGROUND, in purple',
    /<span class="badge" style="color:var\(--vscode-charts-purple, #b180d7\);[^"]*">BACKGROUND/.test(card));
ok('‼️ and never YOUR TURN', !/>YOUR TURN</.test(card.slice(0, card.indexOf('</h3>') + 400)));
ok('the badge panel says why it is not your turn',
    card.indexOf('it is not waiting on you') >= 0);
ok('the breath is slow and honours reduced motion',
    /\.card\.st-bgwait \.badge \{ animation:afdeep 4\.2s/.test(html)
    && /prefers-reduced-motion: reduce\) \{ \.card\.st-bgwait \.badge \{ animation:none/.test(html));
ok('no other status uses purple', (html.match(/charts-purple/g) || []).length >= 2
    && !/'(working|tool|waiting-input|waiting-permission|stalled)':\s*\{[^}]*purple/.test(html));

console.log(`test_timeline_bgwait.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
