// ‼️ EVERY MESSAGE A PAGE POSTS MUST HAVE SOMEBODY LISTENING.
//
// A webview and its panel talk over one untyped channel: the page writes
// `vscode.postMessage({ type: 'x' })` and the panel answers `case 'x':`. Nothing
// in TypeScript, in the linter or in any other test connects those two strings,
// so a button whose `type` was renamed on one side is a dead control that
// compiles, ships, and fails only when somebody presses it. That is the shape of
// bug this file exists to catch, and it is not hypothetical: 3.93.0 found the
// live permissions picker offering three modes the CLI refuses, and the panel
// swallowing the refusal — same family, a control that looks alive and is not.
//
// ONE DIRECTION ONLY, on purpose. "A `case` no page sends" cannot be decided by
// reading: pages post through shared helpers, dispatch tables keyed by a
// `data-act` attribute, and computed names (`type: kind`). A test that guesses
// there would cry wolf on every page and be switched off within a week — which
// is worse than no test. What IS decidable is the literal: a `postMessage` whose
// `type` is a quoted string, matched against the panel's `case` labels.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/** page file → the panel that answers it. */
const PAIRS = [
    ['media/console.js', 'src/panels/consolePanel.ts'],
    ['media/toolbox.js', 'src/panels/toolboxPanel.ts'],
    ['media/secrets.js', 'src/panels/secretsPanel.ts'],
    ['media/studio.js', 'src/panels/studioPanel.ts'],
    ['media/evals.js', 'src/panels/evalsPanel.ts'],
    ['media/livingPage.js', 'src/panels/livingPanel.ts'],
    ['media/queue.js', 'src/panels/queuePanel.ts'],
    ['media/wiki.js', 'src/panels/wikiPanel.ts'],
    ['media/memgraph.js', 'src/panels/memoryGraph.ts'],
    ['media/agentDetail.js', 'src/panels/agentDetail.ts'],
    ['media/projects.js', 'src/panels/projectsPanel.ts'],
    ['media/tasksPage.js', 'src/panels/tasksPanel.ts']
];

/**
 * Names a page posts that another file answers, with why. A page may hand a
 * message to the SHELL rather than to its own panel — `afnav` and `openGuide`
 * are handled once for every page in `panels/base.ts` (`handleAfNav`).
 */
const SHELL = new Set(['afnav', 'openGuide', 'ready']);

/**
 * `vscode.postMessage({ … type: 'x' … })` — and the same thing through each
 * page's own one-line `post` wrapper, which is how most of them are written.
 * Only the literal `type`s, which are the only ones a reader (or this test) can
 * be sure about.
 */
function posted(src) {
    const out = new Set();
    // shape 1: post({ type: 'x', … }) / vscode.postMessage({ type: 'x', … })
    for (const m of src.matchAll(/(?:vscode\.postMessage|\bpost)\(\s*\{([\s\S]{0,500}?)\}\s*\)/g)) {
        const t = /(?:^|[\s{,])type:\s*'([A-Za-z][A-Za-z0-9_-]*)'/.exec(m[1]);
        if (t) { out.add(t[1]); }
    }
    // shape 2: post('x', { … }) — the type as the first argument, which is how
    // studio.js and its neighbours are written. Both shapes are real; a check
    // that knew only one silently measured nothing on half the pages.
    for (const m of src.matchAll(/\bpost\(\s*'([A-Za-z][A-Za-z0-9_-]*)'/g)) { out.add(m[1]); }
    return out;
}
function cases(src) {
    const out = new Set();
    for (const m of src.matchAll(/case\s*'([A-Za-z][A-Za-z0-9_-]*)'\s*:/g)) { out.add(m[1]); }
    return out;
}

/** A panel that hands its messages to a shared handler answers that handler's cases too. */
const DELEGATES = [['handleAlertMessage(', 'src/panels/alertMessages.ts']];

for (const [pageRel, panelRel] of PAIRS) {
    if (!fs.existsSync(path.join(root, pageRel)) || !fs.existsSync(path.join(root, panelRel))) {
        ok(`${pageRel} ↔ ${panelRel} — both files are there`, false);
        continue;
    }
    const sent = posted(read(pageRel));
    const panelSrc = read(panelRel);
    const handled = cases(panelSrc);
    for (const [call, file] of DELEGATES) {
        if (panelSrc.includes(call)) { for (const c of cases(read(file))) { handled.add(c); } }
    }
    ok(`${pageRel} posts something at all`, sent.size > 0);
    const orphans = [...sent].filter(t => !handled.has(t) && !SHELL.has(t));
    ok(`${pageRel}: every message it posts is answered by ${path.basename(panelRel)}`
        + (orphans.length ? ` — nothing answers: ${orphans.join(', ')}` : ''),
        orphans.length === 0);
}

// …and the shared header's own message really is answered in one shared place,
// which is what lets every page above leave it out of its own switch.
{
    ok('the navigation message every page shares is answered once, in the shell',
        /afnav/.test(read('media/pageHeader.js'))
        && /handleAfNav/.test(read('src/panels/base.ts')));
}

/**
 * ‼️ …AND ANSWERED FOR EVERY DESTINATION IT CAN NAME, not just in general.
 *
 * `handleAfNav` looks up a record and does nothing at all when the key is
 * missing, so a nav button whose id never reached that record is a button that
 * draws, hovers, depresses and opens nothing — X-234 was exactly this on the
 * Dashboard's Farm Status card, and the only reason anybody found it was that
 * the user pressed it. The header's destinations are two literals: the `id` of
 * each NAV entry, and the hand-written `data-afnav="…"` of the icons appended
 * after the loop. Both are readable, so both are checked.
 */
{
    const head = read('media/pageHeader.js');
    const dests = new Set();
    const nav = /const NAV = \[([\s\S]*?)\n    \];/.exec(head);
    for (const m of (nav ? nav[1] : '').matchAll(/\bid:\s*'([a-z]+)'/g)) { dests.add(m[1]); }
    for (const m of head.matchAll(/data-afnav="([a-z]+)"/g)) { dests.add(m[1]); }
    const map = /function handleAfNav[\s\S]*?\{([\s\S]*?)\n    \};/.exec(read('src/panels/base.ts'));
    const routed = new Set();
    for (const m of (map ? map[1] : '').matchAll(/^\s*([a-z]+):\s*'agentfarm\./gm)) { routed.add(m[1]); }
    ok('both lists were really read', dests.size > 10 && routed.size > 10);
    const dead = [...dests].filter(d => !routed.has(d));
    ok('every destination the shared header can name has a command behind it'
        + (dead.length ? ` — opens nothing: ${dead.join(', ')}` : ''), dead.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
