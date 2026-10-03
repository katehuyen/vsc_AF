// S-123 — the ways into the Chains page: a chain id opens the page on that chain's row, and a ⑂
// anywhere reaches it through the one shared nav (`afnav` → handleAfNav), never a handler of its own.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// ---------- the host: one command, one nav key, one prefix ----------
{
    const base = read('src', 'panels', 'base.ts');
    ok('the shared nav opens the page by name', /\n\s*chains: 'agentfarm\.openChains'/.test(base));
    ok('…and `chains:<id>` opens it on that chain', /\/\^chains:\(\.\+\)\$\/\.exec\(String\(to\)\)/.test(base)
        && /executeCommand\('agentfarm\.openChains', chainTo\[1\]\)/.test(base));
    const ext = read('src', 'extension.ts');
    ok('the command takes a chain id or { chainId } and hands it to the panel as its focus',
        /registerCommand\('agentfarm\.openChains', \(arg\?: unknown\) => \{[\s\S]{0,260}ChainsPanel\.show\(chainsDeps, id\.trim\(\) \|\| undefined\)/.test(ext));
    ok('the status bar\'s ⑂ opens its chain there', /batonBar\.command = \{ command: 'agentfarm\.openChains'.*arguments: \[v\.chainId\]/.test(ext));
    const panel = read('src', 'panels', 'chainsPanel.ts');
    ok('a new page is drawn with the focus in its data; an open one is told by a focus message',
        /focusChain: focus/.test(panel) && /postMessage\(\{ type: 'focus', chainId: focus \}\)/.test(panel));
}

// ---------- the page: the focused chain is shown whatever the chip, unfolded, its legs asked for ----------
{
    const { runPage } = require('./lib_page_dom');
    const fx = require('./fixtures/chains.js');
    const rowOpen = (html, id) => new RegExp(`class="ch-row[^"]*\\bopen\\b[^"]*" data-chain="${id}"`).test(html);
    const p = runPage('chains.js', Object.assign(fx.data(), { focusChain: 'chn_done' }));
    ok('a page opened on a chain unfolds that row', rowOpen(p.html(), 'chn_done'));
    ok('…and asks the host for its legs', p.posted.some(m => m.type === 'legs' && m.chainId === 'chn_done'));
    const q = runPage('chains.js', fx.data());
    ok('a page opened plainly unfolds nothing', !/class="ch-row[^"]*\bopen\b/.test(q.html()));
    q.send({ type: 'focus', chainId: 'chn_fail' });
    ok('a focus message to an open page unfolds that row and asks for its legs',
        rowOpen(q.html(), 'chn_fail') && q.posted.some(m => m.type === 'legs' && m.chainId === 'chn_fail'));
    const page = read('media', 'chains.js');
    ok('the focus clears the chip, so a chain outside the chosen state is still shown', /function focusOn\(id\) \{ chip = '';/.test(page));
}

// ---------- where the page sits: beside Tasks and Missions, not in the full global row ----------
{
    const head = read('media', 'pageHeader.js');
    const nav = /const NAV = \[([\s\S]*?)\n    \];/.exec(head);
    ok('the global row is left as it is (it is full at 1200px - test_sound_header)', nav && !/id: 'chains'/.test(nav[1]));
    ok('the destination is described once, off the row, and a related button inherits it',
        /const OFF_ROW = \[[\s\S]*?id: 'chains'/.test(head) && /NAV\.find\(n => n\.id === r\.nav\) \|\| OFF_ROW\.find\(n => n\.id === r\.nav\)/.test(head));
    for (const [file, name] of [['tasksPage.js', 'Tasks'], ['missions.js', 'Missions']]) {
        ok(`${name} carries the ⑂ Chains button on its own row`,
            /related: \[\{ nav: 'chains', label: '⑂ Chains', name: 'Chains' \}\], relatedRow: true/.test(read('media', file)));
    }
    const { runPage } = require('./lib_page_dom');
    const sb = runPage('sessionsPage.js', { sessions: [] }).sandbox;
    const w = sb.window || sb;
    const html = w.AFHeader.html({ page: 'tasks', title: 'Tasks', related: [{ nav: 'chains', label: '⑂ Chains', name: 'Chains' }], relatedRow: true });
    ok('…drawn as a nav button to the Chains page with its sentence in the hover',
        /data-afnav="chains"/.test(html) && html.indexOf('Every baton relay in one table') >= 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
