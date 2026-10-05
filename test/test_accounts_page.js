// X-236 — THE ACCOUNTS PAGE, driven through the real media/accounts.js.
//
// The page is the Engines page's accounts section on a page of its own, so what
// is pinned here is that it IS that section — the same view, the same presses,
// the same handler, the same deps — and not a second copy that can drift:
//   * three arities (none · one · many) draw the view's own cards and words;
//   * every press posts the message types src/panels/accountsMessages.ts answers;
//   * the panel enters that handler before its own switch, and its deps are the
//     Engines panel's by name;
//   * the view's stylesheet and age wording live once, in media/afAccounts.js;
//   * X-305 — the rules that choose a sign-in are drawn under the sign-ins, by
//     the view the Engines page draws them with (media/afPolicies.js), and a
//     save or a delete is answered by the handler both panels run.
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
    ok('…and the section sits flush under the header', /\.acpage > \.posec:first-child \{ margin-top:0; border-top:0; padding-top:0; \}/.test(h));
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

// ---- X-305 — the rules, under the sign-ins, by the Engines page's own view ----
{
    const h = r.html();
    ok('the Account policies section is drawn on the page', /class="potitle">Account policies</.test(h));
    ok('…under the sign-ins, not above them', h.indexOf('>Accounts<') < h.indexOf('>Account policies<'));
    ok('…wearing the class its own stylesheet is scoped under', /<div class="posec polsec">/.test(h));
    ok('…with the built-in four as a table, one column per engine that holds a slot',
        /class="potab poltab"/.test(h) && (h.match(/class="poeng af-tipw"/g) || []).length === 4);
    ok('…and the view\'s stylesheet is in the page, scoped', /\.polsec \.polnow \{/.test(h) && /\.polsec \.pocard \{/.test(h));
    ok('no rule of the user\'s own yet says so', /No rule of your own yet/.test(h));
    ok('+ New rule is offered', /data-polnew="1"/.test(h));

    // the many-rules scene: cards, then a press, then the host's answer
    const r2 = runPage('accounts.js', fixture.rulesData());
    let s2 = r2.html();
    ok('rules: one card per rule of the user\'s own', (s2.match(/class="pocard polcard"/g) || []).length === 4);
    r2.query('[data-poldel="Gece_Nobeti"]')[0].click();
    ok('Delete posts policyDelete with the NAME', JSON.stringify(r2.last()) === JSON.stringify({ type: 'policyDelete', name: 'Gece_Nobeti' }));
    r2.send({ type: 'pol-msg', text: 'Refused: @Agir_Isler steps through it' });
    s2 = r2.html();
    ok('a refusal lands in the section\'s own line', /id="pol-msg">Refused: @Agir_Isler steps through it</.test(s2));
    r2.query('[data-poledit="Gece_Nobeti"]')[0].click();
    s2 = r2.html();
    ok('Edit opens the form on that rule', /id="polform"/.test(s2) && /Edit @Gece_Nobeti</.test(s2));
    r2.query('[data-afact="submit"]')[0].click();
    const m = r2.last();
    ok('Save posts policySave with the FORM', m.type === 'policySave' && m.policy && m.policy.name === 'Gece_Nobeti' && Array.isArray(m.policy.chain));
    r2.send({ type: 'pol-msg', text: '' });
    ok('…and an empty pol-msg closes it', !/id="polform"/.test(r2.html()));
}

// ---- the panel is the Engines panel's section, not a second one --------------
{
    const src = read('src', 'panels', 'accountsPanel.ts');
    ok('the panel enters the shared handlers — accounts, then policies — before its own switch',
        /if \(await handleAccountsMessage\(msg, this\.deps, \{[\s\S]{0,400}\}\)\) \{ return; \}\s*\n[\s\S]{0,200}?if \(await handlePolicyMessage\(msg, this\.deps, \{[\s\S]{0,300}\}\)\) \{ return; \}\s*\n\s*switch \(msg\.type\)/.test(src)
        && /say: async text => \{ await this\.host\.webview\.postMessage\(\{ type: 'acc-msg', text \}\); \}/.test(src)
        && !/case 'account/.test(src));
    ok('…its deps are picked out of EnginesPanelDeps by name', /Pick<EnginesPanelDeps,/.test(src) && /& AccountsMessageDeps/.test(src));
    ok('…and the page is handed the four fields the section reads, plus the labels',
        /accounts: deps\.accounts\?\.\(\) \?\? \[\]/.test(src) && /accountEngines: deps\.accountEngines\(\)/.test(src)
        && /autoRefresh: deps\.autoRefresh\(\)/.test(src) && /engineLabels: deps\.engineLabels/.test(src));
    ok('‼️ a hidden page does not keep asking for figures', /if \(this\.host\.visible\) \{ this\.live\(\); \}/.test(src));

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

// ---- U-144 — the allowance block: the figure is findable, and each window's
//      clock is on that window's row ----------------------------------------
{
    const r4 = runPage('accounts.js', fixture.data());
    const h4 = r4.html();
    // The row, whole, so nothing about its shape is assumed one piece at a time.
    // U-154 — each of the three figures wears its own class: afq-pct · afq-left · afq-reset.
    const ROW = /<div class="acwrow"><span class="acwk">([^<]*)<\/span><span class="acwp afq-pct( hot| warn)?( old)?">(\d+)%<\/span><div class="progress"><div class="(hot|warn|)" style="width:\d+%"><\/div><\/div><span class="acwr( stale)?">(?:<span class="afq-left">([^<]*)<\/span>)?(?:<span class="acwc( afq-reset)?">([^<]*)<\/span>)?<\/span><\/div>/g;
    const rows = [...h4.matchAll(ROW)].map(m => ({
        short: m[1], pctTone: (m[2] || '').trim(), old: !!m[3], pct: Number(m[4]),
        barTone: m[5], stale: !!m[6], lead: m[7] || '', resetCls: !!m[8], at: m[9] || ''
    }));
    ok('‼️ U-154 — the time of day is a reset time, and wears its class wherever it is one',
        rows.length > 0 && rows.every(w => !w.at || w.resetCls === (w.at !== 'no reset time')));
    ok('…and the page says the stale red beats the user\'s own colour for the clock figures',
        /\.acwr\.stale, \.acwr\.stale \.afq-left, \.acwr\.stale \.afq-reset \{ color:/.test(read('media', 'afAccounts.js')));
    // U-164 — "1d 20h left Sep 30, 2026, 07:00 PM" was cut after "P" by a fixed 170px column
    {
        const css = read('media', 'afAccounts.js');
        const acwr = (css.match(/\.acwr \{[^}]*\}/) || [''])[0];
        ok('U-164: the clock column is never cut — no fixed width, no ellipsis',
            acwr && !/overflow:hidden|text-overflow|[^-]width:170px/.test(acwr) && /min-width:170px/.test(acwr));
        ok('…the rows share one grid, so the widest clock sets the column and the tracks stay equal',
            /\.acwgrid \{ display:grid; grid-template-columns:auto auto minmax\(40px,1fr\) auto;/.test(css)
            && /\.acwgrid > \.acwrow \{ display:contents; \}/.test(css) && /'<div class="acwgrid">' \+ drawn\.map\(barRow\)/.test(css));
    }
    ok('every window is a row of its own, and there are as many as the data carries',
        rows.length === fixture.data().accounts.reduce((n, a) => n + (a.bars || []).filter(b => b.percent >= 0).length, 0));
    /**
     * ‼️ THE NUMBER AND ITS TRACK CANNOT DISAGREE. This is the whole of the
     * fix: the figure was the card's ordinary grey beside a red bar, so the
     * loudest thing on the card was a 7px track and the number the reader came
     * for was the one they had to hunt for. Both classes come from ONE
     * expression, and this measures that they arrive equal on every row — a
     * second threshold written anywhere would show up here as a mismatch.
     */
    ok('‼️ the percentage wears its own track\'s tone, on every row',
        rows.length > 0 && rows.every(w => w.pctTone === w.barTone));
    ok('…and the thresholds are the bar\'s own — loud at 90, warned at 75, plain below',
        rows.every(w => w.barTone === (w.pct >= 90 ? 'hot' : w.pct >= 75 ? 'warn' : '')));
    ok('…so a window at 91% is the loud one while the 64% beside it is not',
        rows[0].pct === 91 && rows[0].pctTone === 'hot' && rows[1].pct === 64 && rows[1].pctTone === '');
    ok('‼️ each row carries its OWN window\'s clock — the span first, the time of day behind it',
        rows[0].short === '5h' && rows[0].lead === '37m left' && rows[0].at === '02:17'
        && rows[1].short === 'wk' && rows[1].lead === '4d left' && /2026/.test(rows[1].at));
    ok('…so the sentence that used to carry both windows at once is gone, not restyled',
        !/class="acsub"/.test(h4) && !/5h: 37m left/.test(h4));
    ok('the figure is drawn at a weight and a size the surrounding lines are not',
        /\.acwp \{[^}]*font-size:12px;\s*\n?\s*font-weight:600;/.test(read('media', 'afAccounts.js')));

    // ‼️ …AND A WINDOW THAT HAS ALREADY TURNED OVER IS NOT A PERCENTAGE AT ALL:
    // the figure beside it belongs to the window before this one.
    const stale = [...runPage('accounts.js', fixture.staleData()).html().matchAll(ROW)].filter(m => m[5]);
    ok('‼️ a window already turned over says so on its own row — and the figure beside it is STRUCK THROUGH, because it belongs to the window before this one',
        stale.length === 1 && /^turned over /.test(stale[0][7]) && !stale[0][9] && !!stale[0][3]);
    // ‼️ …AND THE LINE IS NOT DELETED, IT IS NO LONGER NEEDED. An engine that
    // publishes a percentage and NO window list has no row to hang a clock on,
    // and that layout keeps its caption exactly as it was.
    {
        const noBars = fixture.data();
        noBars.accounts = [{ ...noBars.accounts[0], bars: [] }];
        const h = runPage('accounts.js', noBars).html();
        ok('…a reading with no window list at all still gets its caption line',
            !/class="acwrow"/.test(h) && /class="acsub">[^<]+</.test(h));
    }

    // The two halves and the whole sentence are ONE text (media/afAccount.js).
    const A = r4.sandbox.window.AFAccount;
    const b = { short: '5h', percent: 91, resetsAt: fixture.data().now + 37 * 60_000 };
    const p = A.barTurnParts(b, fixture.data().now);
    ok('‼️ barTurns is the parts joined back up — one text, two readers',
        A.barTurns(b, fixture.data().now) === p.lead + ' (' + p.at + ')');
    const old = { short: '5h', percent: 91, resetsAt: fixture.data().now - 60_000 };
    ok('…and the same holds for a window already turned over',
        A.barTurns(old, fixture.data().now) === A.barTurnParts(old, fixture.data().now).lead + ', figure is older');
}

console.log(`test_accounts_page: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
