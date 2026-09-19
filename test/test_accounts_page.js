// X-236 — THE ACCOUNTS PAGE, driven through the real media/accounts.js.
//
// The page is the Engines page's accounts section on a page of its own, so what
// is pinned here is that it IS that section — the same view, the same presses,
// the same handler, the same deps — and not a second copy that can drift:
//   * three arities (none · one · many) draw the view's own cards and words;
//   * every press posts the message types src/panels/accountsMessages.ts answers;
//   * the panel enters that handler before its own switch, and its deps are the
//     Engines panel's by name;
//   * the view's stylesheet and age wording live once, in media/afAccounts.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'accounts.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// ---- none: the ordinary state of a machine that has sealed nothing ----------
{
    const h = runPage('accounts.js', fixture.noneData()).html();
    ok('none: the header names the page and says nothing is sealed', /Accounts/.test(h) && /no sealed sign-in yet/.test(h));
    ok('…the section says it is the ordinary answer, not a fault', /which is the ordinary answer, not a fault/.test(h));
    ok('…no card is drawn', !/class="accard/.test(h));
    ok('…and the capture form is still there — the one gesture this state has', /id="ac-add"/.test(h));
}

// ---- one ---------------------------------------------------------------------
{
    const h = runPage('accounts.js', fixture.oneData()).html();
    ok('one: the header counts in the singular', /1 sealed sign-in on 1 engine</.test(h));
    ok('…and exactly one card is drawn', (h.match(/class="accard/g) || []).length === 1);
}

// ---- many: the Engines fixture's five sign-ins on two engines ----------------
const DATA = fixture.data();
const r = runPage('accounts.js', DATA);
{
    const h = r.html();
    ok('many: the header counts sign-ins and engines', /5 sealed sign-ins on 2 engines</.test(h));
    ok('…one card per sign-in', (h.match(/class="accard/g) || []).length === DATA.accounts.length);
    ok('…grouped by engine, labelled from the engine labels the host sends',
        /class="acgrpn">Claude Code</.test(h) && /class="acgrpn">Codex</.test(h));
    ok('…the view\'s stylesheet is in the page', /\.accard \{/.test(h) && /\.posec \{/.test(h));
    ok('…and the section sits flush under the header', /\.acpage > \.posec \{ margin-top:0; border-top:0; padding-top:0; \}/.test(h));
}

// ---- the presses post what the shared handler answers -------------------------
{
    r.query('[data-acuse]').find(b => b.dataset.acuse === 'personal').click();
    ok('standing an account up posts accountActivate',
        JSON.stringify(r.last()) === JSON.stringify({ type: 'accountActivate', id: 'personal', engine: 'claude' }));
    r.sandbox.document.getElementById('ac-label').value = 'second@studio';
    r.query('#ac-add')[0].click();
    ok('capturing posts accountCapture with the engine and the label typed',
        JSON.stringify(r.last()) === JSON.stringify({ type: 'accountCapture', engine: 'claude', label: 'second@studio' }));
    r.query('[data-acauto]')[0].click();
    ok('the auto-refresh switch posts accountsAutoRefresh', r.last().type === 'accountsAutoRefresh');
    r.send({ type: 'acc-msg', text: 'Refused: nothing on disk to seal' });
    ok('a refusal lands in the section\'s own line', /id="ac-msg">Refused: nothing on disk to seal</.test(r.html()));
    r.send({ type: 'data', data: fixture.oneData() });
    ok('a data push redraws from the new data', (r.html().match(/class="accard/g) || []).length === 1);
}

// ---- X-238 — how long a sign-in keeps working, and who was last on it --------
{
    const r3 = runPage('accounts.js', fixture.data());
    const h = r3.html();
    ok('a ready sign-in carries its span on the badge', />🟢 ready · 23d</.test(h));
    ok('…and its panel opens with the date it stops renewing', /Renews itself until [^<]+ — 23 days from now/.test(h));
    ok('the last run on it is one line: when, who, how many in 24h', />last used 12m ago · developer · 6 runs in 24h</.test(h));
    ok('…a card nothing was placed on draws no such line', (h.match(/>last used /g) || []).length === 1);
    r3.query('[data-acsession]')[0].click();
    ok('…and pressing it opens that transcript', JSON.stringify(r3.last())
        === JSON.stringify({ type: 'accountOpenSession', file: 'D:/fixture/b7c1e2d4.jsonl' }));
    const shared = read('src', 'panels', 'accountsMessages.ts');
    ok('the shared handler hands the file to deps.openSession and redraws nothing',
        /case 'accountOpenSession': \{[\s\S]{0,200}deps\.openSession\(file\);\s*\}\s*return true;/.test(shared));
    const S = require(path.join(__dirname, '..', 'out', 'core', 'accountSpend.js'));
    const m = S.lastUseByAccount([
        { sessionId: 'a', lastTs: 100, cost: 0, wTokens: 0, firstTs: 0 },
        { sessionId: 'b', lastTs: 300, cost: 0, wTokens: 0, firstTs: 0 },
        { sessionId: 'c', lastTs: 900, cost: 0, wTokens: 0, firstTs: 0, isSidechain: true },
        { sessionId: 'd', lastTs: 800, cost: 0, wTokens: 0, firstTs: 0 }
    ], s => (s.sessionId === 'd' ? undefined : { id: 'slot' }), 200);
    ok('‼️ lastUseByAccount: the latest placed run wins, a sidechain never does, an unplaced run is on no slot',
        m.get('slot').sessionId === 'b' && m.get('slot').at === 300 && m.get('slot').recent === 1 && m.size === 1);
}

// ---- the panel is the Engines panel's section, not a second one --------------
{
    const src = read('src', 'panels', 'accountsPanel.ts');
    ok('the panel enters the shared handler before its own switch',
        /if \(await handleAccountsMessage\(msg, this\.deps, \{[\s\S]{0,400}\}\)\) \{ return; \}\s*\n\s*switch \(msg\.type\)/.test(src)
        && /say: async text => \{ await this\.panel\.webview\.postMessage\(\{ type: 'acc-msg', text \}\); \}/.test(src)
        && !/case 'account/.test(src));
    ok('…its deps are picked out of EnginesPanelDeps by name', /Pick<EnginesPanelDeps,/.test(src) && /& AccountsMessageDeps/.test(src));
    ok('…and the page is handed the four fields the section reads, plus the labels',
        /accounts: deps\.accounts\?\.\(\) \?\? \[\]/.test(src) && /accountEngines: deps\.accountEngines\(\)/.test(src)
        && /autoRefresh: deps\.autoRefresh\(\)/.test(src) && /engineLabels: deps\.engineLabels/.test(src));
    ok('‼️ a hidden page does not keep asking for figures', /if \(this\.panel\.visible\) \{ this\.live\(\); \}/.test(src));

    const ext = read('src', 'extension.ts');
    ok('extension.ts hands the Accounts page the Engines page\'s own deps',
        /const accountsPanelDeps = \{ \.\.\.enginesPanelDeps, engineLabels: ENGINE_LABELS \};/.test(ext));
    ok('…registers agentfarm.openAccounts on them',
        /registerCommand\('agentfarm\.openAccounts', \(\) => \{\s*AccountsPanel\.show\(accountsPanelDeps\);/.test(ext));
    ok('…and redraws an open Accounts page wherever the queue or the switch moves',
        (ext.match(/AccountsPanel\.refreshIfOpen\(\);/g) || []).length >= 5);
    const pkg = JSON.parse(read('package.json'));
    ok('the command is contributed', pkg.contributes.commands.some(c => c.command === 'agentfarm.openAccounts'));
    ok('…and a header can navigate to the page', /accounts: 'agentfarm\.openAccounts'/.test(read('src', 'panels', 'base.ts')));
}

// ---- one stylesheet, one age wording ------------------------------------------
{
    const eng = read('media', 'engines.js');
    const acc = read('media', 'afAccounts.js');
    ok('‼️ the accounts rules live in afAccounts.js and nowhere in engines.js',
        /\.accard \{/.test(acc) && !/\.accard \{/.test(eng) && !/\.posec \{/.test(eng));
    ok('…and the Engines page draws them from there', /\$\{window\.AFAccounts\.css\}/.test(eng));
    ok('the Engines page ages its verdicts with the view\'s own function',
        /const age = window\.AFAccounts\.age;/.test(eng) && !/function age\(/.test(eng));
}

console.log(`test_accounts_page: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
