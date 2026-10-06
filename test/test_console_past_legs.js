// U-222 — A RELAY LEG KEEPS ITS ⑂ n AFTER IT STOPS BEING A LIVE CARD. The Console's
// "Where you left off" shelf and its resume list draw the leg faint, from the same
// verdict the Sessions table uses (sessionChainOf: the live baton's view, else the
// place the chain index keeps once the store dropped its batons); a live card whose
// batons were dropped falls back to that place too. The verdict is one snapshot per
// store change, because the Console asks on every repaint.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const { chainsCache } = require(path.join(ROOT, 'out', 'core', 'sessionChain.js'));
const { chainIndex } = require(path.join(ROOT, 'out', 'core', 'chainMembership.js'));

// 1. the snapshot: built on first ask, reused, rebuilt after the store changes
{
    const mk = (id, hop, from, to) => ({
        id, chainId: 'chn_x', hop, state: 'started', prompt: 'p', why: 'w', toSessionId: to,
        from: { sessionId: from, agentId: 'd:/a/developer', engine: 'claude', cwd: 'D:\\x', launchId: 'l' },
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' }, createdAt: hop, updatedAt: hop
    });
    let batons = [mk('b3', 3, 's3', 's4')];
    let links = [{ chainId: 'chn_x', hop: 1, from: 's1', to: 's2', state: 'started', createdAt: 1, updatedAt: 1 },
        { chainId: 'chn_x', hop: 2, from: 's2', to: 's3', state: 'started', createdAt: 2, updatedAt: 2 }];
    let built = 0;
    const cache = chainsCache(() => batons, () => { built++; return chainIndex([...links, ...batons.map(b => ({ chainId: b.chainId, hop: b.hop, from: b.from.sessionId, to: b.toSessionId, state: b.state, createdAt: b.createdAt, updatedAt: b.updatedAt }))]); });
    const s4 = cache.of('s4'), s2 = cache.of('s2'), none = cache.of('nobody');
    ok('a leg the store still holds gets the baton\'s own view', !!s4 && s4.chip === '⑂ 4' && s4.chainId === 'chn_x');
    ok('‼️ a leg whose batons were dropped keeps its place from the index', !!s2 && s2.chip === '⑂ 2' && s2.stoppable === false);
    ok('a session in no chain gets nothing', none === undefined);
    for (let i = 0; i < 20; i++) { cache.of('s2'); }
    ok('‼️ one snapshot however often a repaint asks', built === 1);
    batons = [...batons, mk('b4', 4, 's4', 's5')];
    ok('a stale snapshot until the store says it changed', cache.of('s5') === undefined && built === 1);
    cache.drop();
    const s5 = cache.of('s5');
    ok('…then rebuilt once, with the new leg', !!s5 && s5.chip === '⑂ 5' && built === 2);
}

// 2. the host: one cache, dropped on every store change, behind the card, the shelf and the resume list
{
    const ext = read('src', 'extension.ts');
    ok('the host keeps one cache over the store and the chain index, dropped on every change',
        /const consoleChains = chainsCache\(\(\) => batonStore\.all\(\), chainIndexNow\);\s*context\.subscriptions\.push\(batonStore\.onDidChange\(consoleChains\.drop\)\);/.test(ext));
    ok('‼️ a card whose batons were dropped falls back to that place (the console.sessions op reads the same builder)',
        /batonCardView\(batonStore\.all\(\), sid, normalizeMaxLegs\(cfg\(\)\.get<unknown>\('batonMaxHops'\)\)\) \?\? consoleChains\.of\(sid\)/.test(ext));
    ok('the Console is handed the same verdict for its rows', /chainOf: \(sessionId: string\) => consoleChains\.of\(sessionId\) \?\? null/.test(ext));
    const panel = read('src', 'panels', 'consolePanel.ts');
    ok('the shelf\'s rows carry it', /lastWindow: this\.deps\.lastWindow\(\)\.map\(r => \(\{[\s\S]{0,260}batonView: r\.sessionId \? \(this\.deps\.chainOf\?\.\(r\.sessionId\) \?\? null\) : null/.test(panel));
    ok('the resume list\'s rows carry it', /private resumeRow\([\s\S]{0,1500}batonView: this\.deps\.chainOf\?\.\(s\.sessionId\) \?\? null/.test(panel));
}

// 3. the page: faint ⑂ n on the shelf and in the resume list, a way into the chain; none where no chain
{
    const v = require('./fixtures/console').variants().find(x => x.id === 'console-past-legs');
    const p = runPage('console.js', v.data, {}, v.state);
    const html = p.html();
    const faint = html.match(/<span class="batonsig faint" data-chainopen="chn_muqmf6q7001io2"[^>]*>⑂ \d+<\/span>/g) || [];
    ok('‼️ the shelf row and two resume rows each draw their leg, faint', faint.map(s => s.match(/⑂ \d+/)[0]).sort().join() === '⑂ 7,⑂ 8,⑂ 9');
    ok('the shelf row says it before "ended … ago"', /⑂ 8<\/span>[\s\S]{0,1500}<\/span> · ended [^<]* ago · click to continue/.test(html));
    const mid = (html.split('data-resume="019fe512-bb02')[1] || '').split('data-resume=')[0];
    ok('a resume row in no chain draws none', mid.length > 0 && mid.indexOf('batonsig') < 0);
    ok('its hover is the host\'s own words for the leg', /Baton relay — leg 8/.test(html) && /Chain: chn_muqmf6q7001io2 — leg 8 of 10\./.test(html));
    const css = read('media', 'console.js');
    ok('faint is quieter, never hidden', /\.batonsig\.faint \{ font-weight:400; opacity:\.6; \}/.test(css));
    const live = runPage('console.js', require('./fixtures/console').variants().find(x => x.id === 'console').data).html();
    ok('nothing faint where no row carries a leg', !/batonsig faint/.test(live));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
