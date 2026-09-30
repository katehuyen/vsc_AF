// The media scripts htmlShell ships to EVERY page, in load order.
//
// A webview test builds its own sandbox and concatenates the page script onto
// the shared ones by hand. That list used to be copied into eight test files,
// so adding a shared component (afSessionCtx.js was the fourth) broke five of
// them at once with a "cannot read properties of undefined" that says nothing
// about the real cause. It lives here now, and `matchesShell` proves the list
// still matches src/panels/base.ts — a stale list must fail loudly, not
// silently drift.
//
// ‼️ THE CHECK RUNS BOTH WAYS. Asking only "is every file here still in the
// shell?" catches a REMOVED component and is blind to an ADDED one — which is
// the case that actually happens (afTip.js was the sixth) and which produces
// exactly the same nameless "cannot read properties of undefined". So the shell
// is parsed for what it loads and the two sets are compared.
//
// EXCLUDED, deliberately: charts.js (tests stub it as `C`) and sessionsTable.js
// (its own test IS the page script, and pages that embed it load it themselves).
const fs = require('fs');
const path = require('path');

const SHARED = ['pageHeader.js', 'afFilters.js', 'afCtx.js', 'afSessionCtx.js',
    'afTextTools.js',
    // afChainNav.js — a relay chain on a session's page: its id, the legs
    // before and after, first/last (U-167).
    'afChainNav.js',
    // afSnippets.js was the twelfth — the saved prompts, one right-click from
    // any box that takes a prompt (M-24). Shared the moment a second surface
    // wanted it: the Console's send buttons and the Tasks form's four boxes.
    'afSnippets.js',
    // afSlashPicker.js was the fifteenth — the "/" command picker (K-30).
    // Shared for the reason the snippet picker is, one step on: a box that
    // talks to an engine offers what that engine could actually be told.
    'afSlashPicker.js',
    // afTipEdge.js — where the panel opens and that nothing veils it (K-18,
    // K-44, U-146). Before afTip.js, which calls it.
    'afTipEdge.js',
    'afTip.js',
    // afCombo.js was the fourteenth — the searchable multi-pick box (U-90).
    // Shared because the tagger asks its one question with it and the cockpit
    // edits the same answer: a taxonomy typed from memory on one surface is
    // the taxonomy the other one cannot offer.
    'afCombo.js',
    // afWiki.js was the thirteenth — the wiki tagger's badge and popover
    // (K-26). Shared from the first line it was written: the badge belongs on
    // every surface that draws a turn, and a component a page had to opt into
    // is the page where the turn goes unmarked.
    'afWiki.js',
    'afForm.js', 'afQuery.js', 'afTime.js',
    // afLaunch.js was the eighteenth — the ONE narrowing rule, "the engine moved,
    // what happens to the boxes under it" (X-149). Shared for the strongest form
    // of the reason afQuery.js and afTime.js are: the extension host runs the
    // SAME FILE (src/core/aflaunch.ts), and the four copies it replaced answered
    // the same pair differently. Loaded before afEngine.js, which asks it.
    'afLaunch.js',
    // afDimensions.js was the nineteenth — the 16 launch dimensions as data
    // (X-150), so "every dimension, every door" is something that fails a build
    // rather than a sentence somebody has to remember. Shared for the same
    // reason as afLaunch.js above, with one of its own: the shell key that
    // decides a repaint is computed by the PAGE.
    'afDimensions.js',
    // afEngine.js was the tenth — which engine ran a thing, drawn one way (U-26)
    'afEngine.js',
    // afProject.js was the eleventh — which project a thing belongs to, drawn
    // one way, once four models grew a projectId (Faz 5)
    'afProject.js',
    // afProvider.js was the twenty-first — WHICH PROVIDER served a run (X-110).
    // A second axis from the engine badge, and shared for the strongest form of
    // U-26's reason: the route pill had already been invented on the Console,
    // in its own colour, on one page, while every other surface hid the
    // provider in a hover line or inside the model text.
    'afProvider.js',
    // afRunFilter.js was the twenty-second — which runs a provider / profile /
    // model selection matches (X-111). Shared for the strongest form of the
    // reason afQuery.js is: the extension host runs the SAME FILE
    // (src/core/runFilter.ts) for sessions.recent and turns.list.
    'afRunFilter.js',
    // afAccount.js was the twentieth — which sign-in pays, and how much of that
    // plan is left (X-263). Shared because it had ALREADY diverged: five
    // pickers hand-copied one option body and two of them had since grown the
    // five-hour figure, so one account read `work •` on the Tasks form and
    // `work • 42% used` in the Console.
    'afAccount.js',
    // afAccounts.js was the twenty-third — the accounts VIEW (X-236): the card,
    // the groups, the capture form and their presses, lifted out of the
    // Engines page verbatim so the Accounts page draws the same thing. Loaded
    // after afAccount.js, whose `turns` it asks.
    'afAccounts.js',
    // afPolicies.js was the twenty-fourth — the account policies VIEW (X-305):
    // the built-in four, the named rules and the rule form, lifted out of the
    // Engines page verbatim so the Accounts page draws the same section.
    // Loaded after afAccounts.js, whose section frame it borrows.
    'afPolicies.js',
    // afTelegram.js was the sixteenth — the Telegram bridge card (U-84).
    // Shared the moment the item asked for it in two places: the fact it draws
    // is "can your phone reach the farm", and a card invented per page is a
    // card that answers that differently per page, in green.
    // afRepaint.js was the seventeenth - never repaint under the user's hands
    // (M-33). Shared from its first line, for the strongest form of the reason
    // the others are: the failure it prevents is not one page's, it is the one
    // line EVERY page has - a host push answered with a whole-page repaint,
    // which detaches whatever the caret was in.
    'afRepaint.js',
    'afTelegram.js',
    // afWeb.js — the web view card (U-85): the farm on a phone and the QR that
    // opens it. Shared for the reason the card above is, sharpened: the fact it
    // draws is true or false on a detail no page can see for itself, and the
    // wrong answer is the green one.
    'afWeb.js',
    // afPhoneApp.js — the Agent Farm app card (X-444): listen mode, pairing code, paired phones.
    'afPhoneApp.js',
    // afA2A.js — the A2A card grammar (N-6): coordinates, the supervisor
    // directive block, the lease bar and a safe markdown, shared by the two
    // A2A pages so a note and a task are drawn in one voice.
    'afA2A.js',
    // afBulk.js — the bulk hand (N-11): Notices' row box, row ✕ and bulk bar,
    // shared by the A2A pages and the Work Queue.
    'afBulk.js',
    // afRecipes.js — the tool step's recipes as data (M-49); afFlex.js reads it, so it comes first.
    'afRecipes.js',
    // afFlex.js + afFlexForms.js — the flex registry and its smart forms (X-367, X-370).
    'afFlex.js', 'afFlexForms.js',
    // afFlexSettings.js — the Farm Settings "Flow & Content" card (U-152).
    'afFlexSettings.js',
    // afFlexPromote.js — '↑ make default' beside a flex box (U-151).
    'afFlexPromote.js',
    // afSupervisor.js — the retry supervisor's boxes (M-13).
    'afSupervisor.js',
    // afWorkflowInputs.js — a workflow's inputs: form block, Run card, trigger mapping (M-38).
    'afWorkflowInputs.js',
    // afCheckpoint.js — a checkpoint step's card row, and a workflow's goal + criteria (M-43).
    'afCheckpoint.js',
    // afPublish.js — a publish step's card row (M-51).
    'afPublish.js',
    // afMetrics.js — a metrics step's card row (M-52).
    'afMetrics.js',
    // afKapiciStep.js — a Kapıcı step's card row (M-60).
    'afKapiciStep.js',
    // afKapici.js — Kapıcı's chip, settings head and rule list (U-155).
    'afKapici.js',
    // afTool.js — a tool step's card row: recipe, preset, input, its parameters (M-49).
    'afTool.js',
    // afLibrary.js — where a run's files are filed and recorded: the workflow form's block, a media or tool step's row (X-418).
    'afLibrary.js',
    // afAirtableInput.js — an airtable input's search line on the workflow form (X-420).
    'afAirtableInput.js',
    // afStudioLibrary.js — the Studio wall's library row and card strip (X-424).
    'afStudioLibrary.js',
    // afWake.js — what wakes a workflow's supervisor after a step: form block, step override (M-45).
    'afWake.js',
    // afRunWith.js — 'Run with…': one run's own values, drawn with the page form (U-151).
    'afRunWith.js',
    // afBrand.js — the brand kit: the workflow form's production box (M-50).
    'afBrand.js',
    // afRoles.js — role slots: the step card's Role box, the workflow form's Roles box (M-53).
    'afRoles.js',
    // afSupervisorStrip.js — one row per checkpoint visit: the Live Timeline strip, a run row's badge (U-153).
    'afSupervisorStrip.js'];

/** Scripts the shell loads that a page-script test has to stand in for. */
const NOT_SHARED = ['charts.js', 'sessionsTable.js', 'common.css', 'afRemote.js'];

const read = f => fs.readFileSync(path.resolve(__dirname, '..', 'media', f), 'utf8');

/** The shared scripts as one source string, ready to prepend to a page script. */
function sharedMedia() {
    return SHARED.map(read).join('\n') + '\n';
}

/** Everything base.ts asks the webview for out of /media, in file order. */
function shellScripts() {
    const shell = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8');
    const out = [];
    const re = /'media',\s*'([\w.-]+)'/g;
    let m;
    while ((m = re.exec(shell))) { if (out.indexOf(m[1]) < 0) { out.push(m[1]); } }
    return out;
}

/** True when base.ts still loads exactly the shared scripts listed here. */
function matchesShell() {
    const shell = shellScripts().filter(f => NOT_SHARED.indexOf(f) < 0);
    return shell.length === SHARED.length && SHARED.every(f => shell.indexOf(f) >= 0);
}

module.exports = { SHARED, NOT_SHARED, sharedMedia, shellScripts, matchesShell };
