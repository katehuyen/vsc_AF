// X-193 — SETTINGS ▸ SENTRY: THIRTEEN BOXES BECOME FOUR QUESTIONS, AND EVERY
// PATH SAYS WHERE IT POINTS.
//
// Two defects this file is about, and both of them are invisible in a page that
// "works":
//
//   * ‼️ A PATH BOX TELLS YOU NOTHING. `${vault}\00_AGENT_AREA\…` is a perfectly
//     spelled setting on a machine that has no vault, and the campaign then
//     SKIPS that folder and reports "no handover note" about a folder nobody
//     ever opened. The row has to say where it points, and — the loud case —
//     that it points nowhere, without the reader opening anything (DENSITY).
//   * ‼️ ORDER IS THE VALUE in these lists. `handoverSources` is tried
//     most-truthful-first and the pool decides whose block wins, and the only
//     way to reorder used to be deleting a row and retyping it at the bottom.
//
// And one rule that keeps the grouping honest: the grouping is hand-written
// editorial, so it WILL go stale — a key it has never heard of must still be
// drawn, under its own heading. A settings page that hides a setting is worse
// than one that groups it badly.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fx = require(path.join(__dirname, 'fixtures', 'sentrysettings.js'));
const variant = (id) => fx.variants().find(v => v.id === id).data;

const open = (data) => runPage(fx.script, data);
const byAttr = (p, attr, key) =>
    p.query(`[data-${attr}]`).filter(b => b.dataset[attr] === key);

// ---------------------------------------------------------------------------
// 1. the section is four questions, and nothing is hidden
// ---------------------------------------------------------------------------
{
    const p = open(variant('sentrysettings'));
    const html = p.html();
    ok('the sentry settings have a section of their own', /id="sec-sentry"/.test(html));
    for (const t of ['Handover note sources', 'Opening words', 'Leader', 'Stall rules']) {
        ok(`…grouped under "${t}"`, html.indexOf(`<h3 class="setgrouph">${t}</h3>`) > 0);
    }
    ok('…and each group says what the question IS, not just what the keys are',
        /the first that answers wins/.test(html) && /a routine night costs nothing/.test(html));
    // The one that keeps the editorial list honest.
    ok('‼️ a key the grouping has never heard of is still drawn, under More',
        /sentryDaydreamMinutes/.test(html) && html.indexOf('>More<') > 0);
    ok('…and every one of the thirteen is on the page',
        ['handoverSources', 'handoverFolders', 'sentryTemplatesFile', 'sentryInstructionFiles',
            'sentryLeaderModel', 'sentryLeaderBudgetUsd', 'sentryLeaderMaxUsd',
            'sentryLeaderMaxSeconds', 'sentryLeaderFailLimit', 'sentryFailureLimit',
            'sentryIdlePollMin', 'sentryStallMin', 'sentryDaydreamMinutes']
            .every(k => html.indexOf(k) > 0));
}

// ---------------------------------------------------------------------------
// 2. the variables are DRAWN from the dictionary, and say what they are
// ---------------------------------------------------------------------------
{
    const p = open(variant('sentrysettings'));
    const html = p.html();
    ok('the legend lists the variables the boxes take',
        /\$\{vault\}/.test(html) && /\$\{projectNotes\}/.test(html) && /\$\{today\}/.test(html));
    // MIRROR: the changing half first. A legend of definitions answers the
    // question nobody asked.
    ok('‼️ a variable\'s panel opens on what it IS on this machine, then what it means',
        html.indexOf('D:\\zone\\know\\note\\obsidian') < html.indexOf('the Obsidian vault'));
    ok('a variable with nothing behind it is marked as the empty one it is',
        /class="pathvar empty"/.test(html));

    const none = open(variant('sentrysettings-novault')).html();
    ok('…and on a machine with no vault, ${vault} is the marked one',
        /class="pathvar empty">\$\{vault\}/.test(none));

    // ‼️ X-308 — THE THIRD STATE, WHICH IS THE ONE THAT ACTUALLY SHIPPED.
    // `vaultDir` was never set on the measured machine, so every path using the
    // variable was cancelled and NOTHING SAID SO. Now Obsidian's own registry
    // answers it — and because that answer can change under the user without
    // anybody editing a setting, the chip and its panel both have to say the
    // value was derived rather than typed.
    const der = open(variant('sentrysettings-derived')).html();
    ok('‼️ X-308: a vault nobody typed is drawn as DERIVED, not as a plain value',
        /class="pathvar derived">\$\{vault\}/.test(der));
    ok('‼️ X-308: …and the panel says who answered it and how to pin it',
        /agentFarm\.vaultDir is not set/.test(der) && /Set the folder yourself to pin it/.test(der));
    ok('‼️ X-308: …with the VALUE still first, before the explanation (MIRROR)',
        der.indexOf('D:\\zone\\know\\note\\obsidian')
        < der.indexOf('agentFarm.vaultDir is not set'));

    // …and the refusal, which is NOT the same as having no Obsidian: two open
    // vaults is a question, and answering it by guessing would file the work in
    // the wrong vault without a word.
    const amb = open(variant('sentrysettings-ambiguous')).html();
    ok('‼️ X-308: two open vaults leaves ${vault} empty rather than picking one',
        /class="pathvar empty">\$\{vault\}/.test(amb));
    ok('‼️ X-308: …and names both, so the reader sees what it would not choose between',
        /2 vaults open at once/.test(amb) && /cannot be guessed/.test(amb));
}

// ---------------------------------------------------------------------------
// 3. ‼️ every path row says where it points — the whole reason for the section
// ---------------------------------------------------------------------------
{
    const html = open(variant('sentrysettings')).html();
    ok('a list row carries the REAL folder it opens',
        /→ D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\00_OUTPUT\\01_CEVAPLAR/.test(html));
    ok('…including one built out of two variables',
        /→ D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\90_ARSIV\\2026-09-05/.test(html));
    ok('a scalar path box carries it too',
        /→ D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\99_SYSTEM\\Nöbet Şablonları\.md/.test(html));
    // A path with no variable in it is its own answer; saying it twice is the
    // same fact in two places.
    ok('‼️ a plain path is NOT echoed under itself',
        !/→ D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\docs\\handover/.test(html));

    const none = open(variant('sentrysettings-novault')).html();
    ok('‼️ a path that cannot be built says so IN THE ROW, and carries no path',
        /class="setpath bad">⚠ \$\{vault\} has nothing behind it on this machine\./.test(none));
    ok('…and the rest of the list still resolves — one missing variable is not a silence',
        /→ D:\\zone\\agent\\ajanlar\\developer\\memory\\nobet-tembihleri\.md/.test(none));
    ok('…and nothing pretends the cancelled path opened somewhere',
        !/→ D:\\zone\\know/.test(none));
}

// ---------------------------------------------------------------------------
// 4. the order is the value, so a row can be moved
// ---------------------------------------------------------------------------
{
    const p = open(variant('sentrysettings'));
    const html = p.html();
    const moves = byAttr(p, 'lmove', 'agentFarm.handoverSources');
    ok('every row of a multi-row list gets both arrows', moves.length === 8);
    const arrow = (i, dir) =>
        new RegExp(`data-lmove="agentFarm\\.handoverSources" data-li="${i}" data-ldir="${dir}"\\s+(\\S+)`)
            .exec(html)[1];
    ok('…the first row cannot go up and the last cannot go down',
        arrow(0, -1) === 'disabled' && arrow(3, 1) === 'disabled');
    ok('…and the ones in the middle can go either way',
        arrow(1, -1) !== 'disabled' && arrow(2, 1) !== 'disabled');
    ok('…and the row can be picked up as well as nudged',
        /draggable="true" data-ldrag="agentFarm\.handoverSources"/.test(html));

    // Pressing it is what the reader does; the shim binds the same handler.
    const rows = () => p.query('[data-lrow]')
        .filter(b => b.dataset.lrow === 'agentFarm.handoverSources').map(b => b.value);
    ok('before: the sources are in the order the setting holds',
        rows().join() === 'transcript,configured,projectNotes,fallback');
    moves[3].dispatchEvent({ type: 'click' });          // second row's ↓
    ok('‼️ pressing ↓ moves that entry one place later, and nothing else moves',
        rows().join() === 'transcript,projectNotes,configured,fallback');
    ok('…and it is not saved by moving it — the list still has its Save button',
        byAttr(p, 'lapply', 'agentFarm.handoverSources').length === 1);
}

console.log(`test_sentry_settings: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
