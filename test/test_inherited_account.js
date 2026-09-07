// X-262 — A SURFACE THAT INHERITS A SIGN-IN SAYS WHICH ONE, BEFORE THE CLICK.
//
// ‼️ WHAT WAS MEASURED, AND THE DOORS ARE NOT THE BUG.
//
// `src/launch/doors/projects.ts` and `src/launch/doors/webviews.ts` both call
// `withAccount(ctx, pick(ctx.seed(agentId), …))`, and `withAccount` really does
// resolve the account through `ctx.accountFor`. So the inheritance WORKS. The
// defect is that neither surface DRAWS a launch dimension: the agent page's
// three start controls and the project page's "Start a session here" open a
// session and the reader finds out whose plan is paying afterwards.
//
// ‼️ AND THE NUANCE THAT MAKES THIS ITS OWN ITEM: of everything inherited, the
// ACCOUNT IS THE ONLY DIMENSION THAT GOES STALE BY ITSELF. Model, effort and
// permissions are today whatever they were yesterday. An account's window fills
// on its own and its sign-in falls over on its own — so "what you last used" is
// a claim about the account that can be false by the time it is read, which is
// exactly why it has to be stated WITH its current figure and not just named.
//
// S-34 is untouched: the remembered setup is still a LAYER, and this states what
// that layer resolves to. Nothing here picks an account or writes one.
//
// ‼️ AND THE HONEST-SILENCE RULE, which is the part a reader will want the
// reason for. The project page's start button may open a QuickPick — a project
// that names no agent, or names several, does not know WHO it will run as until
// after the click. A readout there would be a guess, so the page says the
// dimensions only when the project names exactly one agent, and says plainly
// that the agent is chosen on the click when it does not.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const A = require(path.join(ROOT, 'media', 'afAccount.js'));

// ---------- the readout is built by the host, out of the SAME seed ----------
{
    const ext = read('src/extension.ts');
    const at = ext.indexOf('const nextLaunchReadout');
    ok('‼️ there is ONE place that answers "what would this start as"', at > 0);
    const body = ext.slice(at, ext.indexOf('\n    };', at));

    // The whole point: it must not be a second opinion about the setup. The
    // doors seed from `seedLastLaunch` and resolve with the account resolver;
    // a readout that computed either itself would be a page that CONFIDENTLY
    // states a setup the door will not use.
    ok('‼️ it seeds from the same remembered layer the doors seed from (S-34)',
        /seedLastLaunch\(/.test(body));
    // `launchAccountSlot` is the doors' own resolver one level up — it calls
    // `launchAccountFor`, which calls `resolveAccount`. What must never appear
    // here is `resolveAccount` itself: that would be this page resolving an
    // account its own way, which is the whole failure class.
    ok('‼️ …and resolves the account with the same resolver the doors resolve with',
        /launchAccountSlot\(|launchAccountFor\(/.test(body));
    ok('‼️ …and never resolves one its own way',
        !/resolveAccount\(/.test(body));
    ok('…and carries the live figure through the one figure reader (X-263)',
        /accountFigure\(/.test(body));
    ok('…and says whether this engine can isolate a sign-in at all',
        /canIsolateAccounts\(/.test(body));
    ok('an engine with no captured slot resolves to nothing rather than a guess',
        /account: (slot|null)/.test(body) || /slot \?/.test(body));
}

// ---------- the agent page states it on the controls that start a session ----------
{
    const js = read('media/agentDetail.js');
    ok('‼️ the agent page asks for the readout', /DATA\.nextLaunch/.test(js));
    ok('…and draws the account through the shared component, not its own body',
        /window\.AFAccount/.test(js) && !/health === 'ready' \? '' : '⚠ '/.test(js));
    ok('…and there is one function building the sentence, not three copies',
        (js.match(/function inheritedTip|const inheritedTip/g) || []).length === 1);
    // The three controls that start something are the three that must say it.
    ['start', 'launch', 'continue'].forEach(function (id) {
        ok('the "' + id + '" control carries the inherited setup in its title',
            new RegExp("id: '" + id + "'[\\s\\S]{0,400}inheritedTip").test(js));
    });
    ok('‼️ …and it says that an account is the part that goes stale on its own',
        /goes stale|stale on its own|fills on its own/i.test(js));
}

// ---------- the project page: only where it can be truthful ----------
{
    const js = read('media/projects.js');
    ok('‼️ the project page states the setup too', /nextLaunch/.test(js));
    ok('‼️ …and says the agent is chosen ON THE CLICK when the project names no single one',
        /chosen when you press|asked when you press|picks the agent/i.test(js));
    const ts = read('src/panels/projectsPanel.ts') + read('src/extension.ts');
    ok('‼️ the host only sends a readout when exactly ONE agent is named',
        /named\.length === 1/.test(ts));
}

// ---------- what the sentence actually says ----------
{
    // The component owns the account half, so the readout's account line is the
    // same string the pickers draw — this is the "same figure, same formatter"
    // half of the item, and it is why X-262 and X-263 were done together.
    const row = { id: 'sl-1', label: 'murvietnam-2', health: 'ready', active: true,
        percent: 91, resetsAt: Date.now() + 42 * 60000 };
    ok('the account reads exactly as it reads in every picker',
        A.label(row) === 'murvietnam-2 · 91% •');
    ok('…and an unread one is honest here too, as everywhere',
        A.label({ label: 'spare', health: 'ready' }) === 'spare · —');
}

console.log((fail ? 'FAIL' : 'ok') + ' — test_inherited_account.js: '
    + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
