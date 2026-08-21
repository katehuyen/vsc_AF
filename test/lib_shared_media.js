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
    'afTip.js',
    // afWiki.js was the thirteenth — the wiki tagger's badge and popover
    // (K-26). Shared from the first line it was written: the badge belongs on
    // every surface that draws a turn, and a component a page had to opt into
    // is the page where the turn goes unmarked.
    'afWiki.js',
    'afForm.js', 'afQuery.js', 'afTime.js',
    // afEngine.js was the tenth — which engine ran a thing, drawn one way (U-26)
    'afEngine.js',
    // afProject.js was the eleventh — which project a thing belongs to, drawn
    // one way, once four models grew a projectId (Faz 5)
    'afProject.js'];

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
