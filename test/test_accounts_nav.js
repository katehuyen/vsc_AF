// X-237 — the ways into the Accounts page, and where "New Agent" went.
//
// The figures on the Accounts page are wanted many times a day, and the only
// way to them was Settings → Engines → the foot of the page. So:
//   * the Agents view's title bar carries the Accounts door where `+ New Agent`
//     stood (a sign-in is asked about daily; an agent is created rarely);
//   * Farm Settings' engines section offers Open Accounts beside Open Engines;
//   * `+ New Agent` lives on beside the Dashboard's Agents heading, so removing
//     it from the title bar removed no capability.
'use strict';
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// ---- the Agents view's title bar ------------------------------------------------
{
    const pkg = JSON.parse(read('package.json'));
    const title = pkg.contributes.menus['view/title'].filter(m => m.when === 'view == agentfarm.agents');
    ok('the Agents title bar opens the Accounts page', title.some(m => m.command === 'agentfarm.openAccounts'));
    ok('…in the slot New Agent held', (title.find(m => m.command === 'agentfarm.openAccounts') || {}).group === 'navigation@3');
    ok('…and New Agent is no longer there', !title.some(m => m.command === 'agentfarm.newAgent'));
    ok('the command still exists for the palette and the Dashboard', pkg.contributes.commands.some(c => c.command === 'agentfarm.newAgent'));
}

// ---- Farm Settings --------------------------------------------------------------------
{
    const d = require(path.join(__dirname, 'fixtures', 'engines.js')).data();
    const p = runPage('settings.js', d);
    const h = p.html();
    ok('settings: Open Accounts stands beside Open Engines',
        h.indexOf('id="openaccounts"') > h.indexOf('id="openengines"') && h.indexOf('id="openaccounts"') - h.indexOf('id="openengines"') < 900);
    ok('…with a hover that says what the page is', /id="openaccounts"[^>]*title="[^"]*captured sign-in/.test(h));
    p.query('#openaccounts')[0].click();
    ok('…and the press asks the host to open it', JSON.stringify(p.last()) === JSON.stringify({ type: 'openAccounts' }));
    const src = require('./lib_settings_source').settingsPanelSource();
    ok('the settings panel answers it through its own dep',
        /case 'openAccounts':\s*(?:this|s)\.deps\.openAccounts\?\.\(\);/.test(src) && /openAccounts\?\(\): void;/.test(src));
    ok('extension.ts hands that dep the Accounts page', /openAccounts: \(\) => \{ AccountsPanel\.show\(accountsPanelDeps\); \}/.test(read('src', 'extension.ts')));
}

// ---- the Dashboard ---------------------------------------------------------------------
{
    const d = require(path.join(__dirname, 'fixtures', 'dashboard.js')).data();
    const p = runPage('dashboard.js', d);
    const h = p.html();
    ok('dashboard: + New Agent sits in the Agents heading', /<h2[^>]*>Agents<\/h2>\s*<button[^>]*data-dnewagent[^>]*>\+ New Agent<\/button>/.test(h));
    p.query('[data-dnewagent]')[0].click();
    ok('…and the press posts newAgent', JSON.stringify(p.last()) === JSON.stringify({ type: 'newAgent' }));
    const src = read('src', 'panels', 'dashboard.ts');
    ok('the dashboard runs the SAME command the title bar ran',
        /case 'newAgent':\s*vscode\.commands\.executeCommand\('agentfarm\.newAgent'\);/.test(src));
    // The Farm Status row's door is DERIVED into the dashboard's allow-list
    // (X-234), so pointing it at the page is the whole change.
    const { buildFarmStatus } = require(path.join(__dirname, '..', 'out', 'core', 'farmstatus.js'));
    const doors = [[], [{ id: 'a', engine: 'claude', percent: 40, health: 'ok' }]].map(accounts => {
        try {
            return (buildFarmStatus({ externalSessions: {}, accounts }).find(r => r.id === 'accounts') || {}).action;
        } catch { return undefined; }
    });
    ok('‼️ the Farm Status Accounts row opens the Accounts page, not the Engines page',
        doors.every(d => d && d.label === 'Accounts' && d.value === 'agentfarm.openAccounts'));
}

console.log(`test_accounts_nav: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
