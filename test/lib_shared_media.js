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
    // afSnippets.js was the twelfth — the saved prompts, one right-click from
    // any box that takes a prompt (M-24). Shared the moment a second surface
    // wanted it: the Console's send buttons and the Tasks form's four boxes.
    'afSnippets.js',
    // afSlashPicker.js was the fifteenth — the "/" command picker (K-30).
    // Shared for the reason the snippet picker is, one step on: a box that
    // talks to an engine offers what that engine could actually be told.
    'afSlashPicker.js',
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
    'afTelegram.js'];

/** Scripts the shell loads that a page-script test has to stand in for. */
const NOT_SHARED = ['charts.js', 'sessionsTable.js', 'common.css'];

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
