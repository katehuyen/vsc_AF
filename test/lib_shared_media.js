// The media scripts htmlShell ships to EVERY page, in load order.
//
// A webview test builds its own sandbox and concatenates the page script onto
// the shared ones by hand. That list used to be copied into eight test files,
// so adding a shared component (afSessionCtx.js was the fourth) broke five of
// them at once with a "cannot read properties of undefined" that says nothing
// about the real cause. It lives here now, and `checkAgainstShell` proves the
// list still matches src/panels/base.ts — a stale list must fail loudly, not
// silently drift (charts.js is excluded: tests stub it as `C`).
const fs = require('fs');
const path = require('path');

const SHARED = ['pageHeader.js', 'afFilters.js', 'afCtx.js', 'afSessionCtx.js', 'afTextTools.js'];

const read = f => fs.readFileSync(path.resolve(__dirname, '..', 'media', f), 'utf8');

/** The shared scripts as one source string, ready to prepend to a page script. */
function sharedMedia() {
    return SHARED.map(read).join('\n') + '\n';
}

/** True when base.ts still loads exactly the shared scripts listed here. */
function matchesShell() {
    const shell = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8');
    return SHARED.every(f => shell.includes(`'${f}'`));
}

module.exports = { SHARED, sharedMedia, matchesShell };
